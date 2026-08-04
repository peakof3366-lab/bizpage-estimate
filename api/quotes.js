const { sql } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const OpenAI = require('openai');
/* 내장 목적지 키 집합 — 제보(priceReport)의 destinationKey가 실제 목적지인지 검증해
   존재하지 않는/오타 키로 실측 통계가 오염되는 것을 막는다(커스텀 목적지는 DB 조회로 보강). */
const destinationRates = require('../data');
const BUILTIN_DEST_KEYS = new Set(destinationRates.map((d) => d.destination_key));
const { safeId, payloadTooLarge, toNumberOrNull, trimText } = require('./_lib/public_input');
const { verifyQuote } = require('./_lib/quote_verify');

/* 검증에 필요한 권위 데이터(요율 오버라이드·계수 노브·커스텀 목적지)를 모은다.
   조회에 실패하면 unavailable로 표시한다 — 빈 값으로 통과시키면 '검증했다'는
   기록만 남고 실제로는 아무것도 대조하지 않은 게 되기 때문이다. */
async function loadVerifyContext(destKey) {
  try {
    const [ovRows, coefRows, customRows] = await Promise.all([
      sql`select destination_key, overrides from rate_overrides`,
      sql`select value from app_settings where key = 'coefficients'`,
      destKey ? sql`select * from custom_destinations where destination_key = ${destKey}` : Promise.resolve([]),
    ]);
    const overrides = {};
    for (const r of ovRows) overrides[r.destination_key] = r.overrides;
    return {
      overrides,
      coefficients: coefRows.length ? coefRows[0].value : null,
      customRow: customRows.length ? customRows[0] : null,
    };
  } catch (err) {
    console.error('[quotes] 검증 컨텍스트 조회 실패:', err);
    return { unavailable: true };
  }
}

/* ?action= 분기 (신규) — "실제 계약가 업데이트" 위젯(요율 관리 탭 맨 위)이 쓰는
   관리자 전용 엔드포인트 3개. action이 없으면 기존 공개 POST(견적 제출)/관리자 GET(견적
   목록)이 그대로 동작한다(하위호환). Vercel Hobby 함수 12개 한도라 새 파일을 안 만들고
   이 파일에 얹었다. */

/* 항목별 상한 — 이 이상은 LLM 오독/사용자 오타로 보고 거부한다. 크래시 방지가 아니라
   명백히 말이 안 되는 값이 "제안"으로 화면에 뜨는 것 자체를 막기 위한 상식적 상한선.
   항목마다 현실적인 규모가 달라(항공료 > 호텔 1박 > 식사 1인) 상한도 따로 둔다. */
const AIRFARE_UNIT_MAX = 50000000;
const HOTEL_UNIT_MAX = 10000000;
const MEAL_UNIT_MAX = 1000000;
const HOTEL_NAME_MAX_LEN = 80;

function buildExtractionPrompt(text) {
  return `당신은 여행사 견적서에서 정보를 추출하는 어시스턴트입니다.
아래는 실제 견적서 문서에서 추출한 텍스트입니다(형식이 문서마다 다를 수 있습니다).

${text.slice(0, 6000)}

이 문서에서 아래 항목들을 찾아 다음 JSON 형식으로만 답하세요(다른 설명 없이, 못 찾은 항목은 반드시 null):
{
  "airfarePerPerson": 숫자(1인당 항공료, 원화, 못 찾으면 null),
  "hotelPerRoom": 숫자(객실 1박당 숙박비, 원화, 못 찾으면 null),
  "hotelName": 문자열(실제 이용한 호텔 이름, 못 찾으면 null),
  "mealPerPerson": 숫자(1인당 1식 식비, 원화, 못 찾으면 null),
  "confidence": "high"|"medium"|"low",
  "note": "왜 이 값들을 골랐는지 1문장"
}
총액과 항목별 단가, 항공료·호텔비·식비를 서로 혼동하지 마세요. 문서에 없는 항목은 억지로 추측하지 말고 null로 답하세요.`;
}

function validatedNumber(raw, max) {
  return (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= max) ? Math.round(raw) : null;
}

async function handleExtractPdf(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'openai_not_configured' });
  const { pdfBase64 } = req.body || {};
  if (!pdfBase64 || typeof pdfBase64 !== 'string') return res.status(400).json({ error: 'invalid_body' });

  let text = '';
  try {
    /* ⚠ pdf-parse는 **1.x를 쓴다. 2.x로 올리지 말 것.**
       2.4.5는 내부적으로 pdfjs-dist + `@napi-rs/canvas`(네이티브 바이너리)를 쓰는데,
       Vercel 번들에 그 모듈이 들어가지 않아 **프로덕션에서 이 기능이 한 번도 동작한 적이
       없었다.** 로컬에서는 멀쩡해서 더 늦게 발견됐다. 실제 함수 로그:
         Cannot load "@napi-rs/canvas": Error: Cannot find module '@napi-rs/canvas'
         Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
         [quotes extractPdf] pdf-parse 실패: ReferenceError: DOMMatrix is not defined
       1.x는 순수 JS라 네이티브 의존이 없고, 같은 한글 견적서에서 오히려 더 많이 뽑는다
       (하나투어 견적서 실측: 2.x 2,813자 → 1.x 4,025자).

       ⚠ `require('pdf-parse')`가 아니라 **lib을 직접** 부른다. 1.x의 index.js에는
       `!module.parent`일 때 테스트용 PDF를 읽는 디버그 분기가 있어, 번들러에 따라
       로드 시점에 ENOENT로 죽는다. lib을 직접 부르면 그 분기를 아예 지난다.
       ai-loop/test_rL_pdf_extract.js가 이 두 가지를 소스에서 지킨다. */
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    /* ⚠ **반드시 사본으로 넘긴다.** Node의 Buffer는 공용 풀에서 잘라 쓰는 경우가 있어
       `byteOffset`이 0이 아닐 수 있는데, 안에 들어 있는 pdf.js는 byteOffset을 무시하고
       밑바탕 ArrayBuffer를 **0번지부터** 읽는다. 그러면 엉뚱한 바이트를 파싱해
       'bad XRef entry'로 죽고, 화면에는 "PDF를 읽지 못했습니다(손상되었거나 지원하지 않는
       형식)"가 뜬다 — 파일은 멀쩡한데 파일을 의심하게 되는, 제일 오래 끄는 종류의 결함이다.
       실제로 회귀 테스트에서 byteOffset=720짜리 버퍼가 걸려 발견했다.
       new Uint8Array(buf)는 복사본이라 언제나 byteOffset이 0이다. */
    const raw = Buffer.from(pdfBase64, 'base64');
    const result = await pdf(new Uint8Array(raw));
    text = (result.text || '').trim();
  } catch (err) {
    console.error('[quotes extractPdf] pdf-parse 실패:', err);
    return res.status(200).json({ error: 'pdf_parse_failed' });
  }
  if (!text) return res.status(200).json({ error: 'no_text_found' });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: buildExtractionPrompt(text) }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    const airfare = validatedNumber(parsed.airfarePerPerson, AIRFARE_UNIT_MAX);
    const hotel = validatedNumber(parsed.hotelPerRoom, HOTEL_UNIT_MAX);
    const meal = validatedNumber(parsed.mealPerPerson, MEAL_UNIT_MAX);
    const hotelName = typeof parsed.hotelName === 'string' ? parsed.hotelName.trim().slice(0, HOTEL_NAME_MAX_LEN) : '';
    if (airfare == null && hotel == null && meal == null && !hotelName) {
      return res.status(200).json({ error: 'not_found', note: parsed.note || '' });
    }
    return res.status(200).json({
      suggestedAirfare: airfare,
      suggestedHotel: hotel,
      suggestedHotelName: hotelName || null,
      suggestedMeal: meal,
      confidence: parsed.confidence || 'low',
      note: parsed.note || '',
    });
  } catch (err) {
    console.error('[quotes extractPdf] openai 실패:', err);
    return res.status(500).json({ error: 'analysis_failed' });
  }
}

async function handlePriceReport(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const { destinationKey, airfareUnit, hotelUnit, hotelName, mealUnit, author, source } = req.body || {};
  if (typeof destinationKey !== 'string' || !destinationKey.trim() || destinationKey.length > 100) {
    return res.status(400).json({ error: 'invalid_body' });
  }
  const parseOptional = (v, max) => {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const n = Number(v);
    return (Number.isFinite(n) && n > 0 && n <= max) ? { ok: true, value: n } : { ok: false, value: null };
  };
  const airfare = parseOptional(airfareUnit, AIRFARE_UNIT_MAX);
  const hotel = parseOptional(hotelUnit, HOTEL_UNIT_MAX);
  const meal = parseOptional(mealUnit, MEAL_UNIT_MAX);
  if (!airfare.ok || !hotel.ok || !meal.ok) return res.status(400).json({ error: 'invalid_body' });
  const safeHotelName = typeof hotelName === 'string' ? hotelName.trim().slice(0, HOTEL_NAME_MAX_LEN) : '';
  if (airfare.value == null && hotel.value == null && meal.value == null && !safeHotelName) {
    return res.status(400).json({ error: 'invalid_body' });
  }
  /* destinationKey 유효성 — 내장 목적지가 아니면 커스텀 목적지 존재 확인. 오타/미존재
     키로 실측 통계(갱신제안·정확도)가 오염되는 것을 막는다. */
  if (!BUILTIN_DEST_KEYS.has(destinationKey)) {
    try {
      const cd = await sql`select 1 from custom_destinations where destination_key = ${destinationKey} limit 1`;
      if (!cd.length) return res.status(400).json({ error: 'unknown_destination' });
    } catch (err) {
      console.error('[quotes priceReport] 목적지 확인 실패:', err);
      return res.status(500).json({ error: 'insert_failed' });
    }
  }
  /* author는 클라이언트 값이 아니라 세션에서 검증된 실사용자 표시명을 쓴다(위조 방지) —
     요율 PATCH(api/rates.js)와 동일 원칙. requireAdmin이 req.user를 세팅한다. */
  const safeAuthor = String((req.user && req.user.displayName) || '').slice(0, 40);
  try {
    await sql`
      insert into actual_price_reports (destination_key, airfare_unit, hotel_unit, hotel_name, meal_unit, author, source)
      values (${destinationKey}, ${airfare.value}, ${hotel.value}, ${safeHotelName || null}, ${meal.value}, ${safeAuthor}, ${source === 'pdf' ? 'pdf' : 'manual'})
    `;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[quotes priceReport] 저장 실패:', err);
    return res.status(500).json({ error: 'insert_failed' });
  }
}

async function handlePriceReports(req, res) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await sql`select id, destination_key, airfare_unit, hotel_unit, hotel_name, meal_unit, author, source, created_at from actual_price_reports order by created_at desc limit 1000`;
    return res.status(200).json(rows.map((r) => ({
      id: Number(r.id),
      destinationKey: r.destination_key,
      airfareUnit: r.airfare_unit != null ? Number(r.airfare_unit) : null,
      hotelUnit: r.hotel_unit != null ? Number(r.hotel_unit) : null,
      hotelName: r.hotel_name || null,
      mealUnit: r.meal_unit != null ? Number(r.meal_unit) : null,
      author: r.author || '', source: r.source, createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[quotes priceReports] 조회 실패:', err);
    return res.status(500).json({ error: 'query_failed' });
  }
}

/* 잘못 입력된 실제 계약가 제보 삭제(신규) — 제출 시 오타 등으로 잘못 들어간 값이
   갱신제안·검증배지에 계속 악영향을 주므로, 관리자 페이지에서 해당 제보를 지울 수
   있게 한다. 로그인한 담당자면 삭제 가능(제보 제출과 동일 권한). id 하나만 지운다. */
async function handleDeletePriceReport(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const id = Number((req.query && req.query.id) || (req.body && req.body.id));
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  try {
    const deleted = await sql`delete from actual_price_reports where id = ${id} returning id`;
    if (!deleted.length) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[quotes deletePriceReport] 삭제 실패:', err);
    return res.status(500).json({ error: 'delete_failed' });
  }
}

module.exports = async (req, res) => {
  const action = req.query && req.query.action;
  if (action === 'extractPdf' && req.method === 'POST') return handleExtractPdf(req, res);
  if (action === 'priceReport' && req.method === 'POST') return handlePriceReport(req, res);
  if (action === 'priceReports' && req.method === 'GET') return handlePriceReports(req, res);
  if (action === 'deletePriceReport' && req.method === 'DELETE') return handleDeletePriceReport(req, res);

  /* 내부 산출 저장 (PX) — 담당자 신원을 **서버가** 찍는다.
     예전에는 공개 POST 하나뿐이었고 `channel:'internal'`·`createdBy`를 클라이언트가
     그대로 보냈다. 그런데 이 엔드포인트는 인증이 없다:
     ① 익명 제출자가 `channel:'internal', createdBy:'송주연 팀장'`을 보내면 관리자
        화면에 **"🖥 내부 산출 — 송주연 팀장"** 배지가 그대로 붙는다(위조된 출처).
     ② admin-quote.html은 담당자를 하드코딩 목록에서 **자기가 골랐다** — 요율 author와
        진행 기록에서 이미 없앤 '자칭 신원'이 이 도구에만 남아 있었다.
     그래서 내부 저장은 인증이 필요한 별도 action으로 분리하고, 공개 POST는 두 필드를
     **강제로 덮어쓴다**(아래 saveQuote 호출부). 삽입 로직은 한 함수를 공유한다 —
     복사하면 두 벌이 어긋난다(이 저장소가 여러 번 겪은 유형). */
  if (action === 'internal' && req.method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    return saveQuote(req, res, { channel: 'internal', createdBy: req.user.displayName || '' });
  }

  if (req.method === 'POST') {
    /* 공개 제출은 내부 산출을 자칭할 수 없다 — 값을 지우지 않고 'public'으로 못 박는다. */
    return saveQuote(req, res, { channel: 'public', createdBy: '' });
  }

  if (req.method === 'GET') {
    if (!(await requireAdmin(req, res))) return;
    try {
      const rows = await sql`select * from quotes order by created_at desc limit 1000`;
      res.status(200).json(rows.map((r) => ({
        ...r.payload, id: r.id, status: r.status, note: r.note,
        assignee: r.assignee || '', activityLog: r.activity_log || [],
        actualAirfareUnit: r.actual_airfare_unit !== null && r.actual_airfare_unit !== undefined ? Number(r.actual_airfare_unit) : null,
        actualHotelUnit: r.actual_hotel_unit !== null && r.actual_hotel_unit !== undefined ? Number(r.actual_hotel_unit) : null,
        actualMealUnit: r.actual_meal_unit !== null && r.actual_meal_unit !== undefined ? Number(r.actual_meal_unit) : null,
        actualTotal: r.actual_total !== null && r.actual_total !== undefined ? Number(r.actual_total) : null,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

/* 공개 제출과 내부 산출이 **같은 삽입 경로**를 쓴다 — 검증(_verify)·id 강제·숫자 강제·
   on-conflict 멱등성이 한 벌만 존재해야 두 경로가 어긋나지 않는다. 차이는 `origin`
   하나뿐이고, 그 값은 호출부(=인증 여부)가 정한다. */
async function saveQuote(req, res, origin) {
  const payload = req.body || {};
  if (payloadTooLarge(payload)) return res.status(413).json({ error: 'payload_too_large' });
  /* id는 관리자 화면에서 onclick 안에 들어가므로 형태를 강제한다 — 자세한 이유는
     api/_lib/public_input.js 주석. 형식을 벗어나면 견적을 버리지 않고 id만 교체한다. */
  const id = safeId(payload.id);
  /* 인원·총액은 관리자 화면이 숫자로 다루는 값이라 저장 시점에 숫자로 못 박는다
     (문자열이 들어오면 화면 포맷터가 원문을 그대로 출력한다). */
  const participants = toNumberOrNull(payload.participants);
  const total = toNumberOrNull(payload.total);
  try {
    /* 저장 시점 검증 (신규) — 계산은 브라우저에서 일어나므로 서버가 받은 금액을
       그대로 믿을 근거가 없다. 권위 요율표·계수와 대조한 결과를 payload에 함께
       남겨, 관리자가 견적 상세에서 "이 건은 어느 단계에서 걸렸는지"를 볼 수 있게 한다.
       걸려도 저장은 한다 — 고객 리드를 버리는 쪽이 훨씬 큰 손해다. 링크 발급
       (api/quote-shares)에서 한 번 더, 그때는 통과해야만 발급된다. */
    const vctx = await loadVerifyContext(payload.destination);
    const verified = verifyQuote(payload, vctx);
    /* ⚠ channel·createdBy는 **payload 뒤에** 넣어야 클라이언트가 보낸 값을 덮는다.
       순서가 뒤바뀌면 익명 제출자가 다시 '내부 산출'을 자칭할 수 있다 (PX). */
    const stored = { ...payload, id, participants, total,
      channel: origin.channel, createdBy: origin.createdBy,
      _verify: {
        verdict: vctx.unavailable ? 'unavailable' : verified.verdict,
        failedSteps: verified.failedSteps,
        steps: verified.steps,
        at: new Date().toISOString(),
      } };
    await sql`
      insert into quotes (id, status, note, dest_label, org_name, participants, total, payload)
      values (${id}, 'new', '', ${trimText(payload.destLabel, 100)}, ${trimText(payload.orgName, 100)},
              ${participants}, ${total}, ${JSON.stringify(stored)}::jsonb)
      on conflict (id) do nothing
    `;
    res.status(200).json({ ok: true, id, verdict: stored._verify.verdict });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'insert_failed' });
  }
}

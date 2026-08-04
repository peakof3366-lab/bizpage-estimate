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

/* ═══════════════════════════════════════════════════════════════════════════
   견적서에서 단가 뽑기 (RN) — **AI에게 숫자를 찾게 하지 않는다. 고르게만 한다.**

   왜 바꿨나: 예전에는 텍스트를 통째로 주고 "항공료·호텔·식비를 찾아라"고 시켰다.
   실제 하나투어 견적서로 재 보니 **3칸 중 2칸이 틀렸고 신뢰도는 high**였다:
     호텔 1박 → 320,000 (항공료를 그대로 복사)   실제 152,000
     식비 1식 → 90,000  (유류할증료를 집어옴)     실제 17,100 / 33,250
   원인은 PDF 텍스트에서 표가 납작해지는 것이다. 「항공」「호텔」「식사」 라벨은
   숫자와 한참 떨어진 다른 블록에 있어서, AI가 위치로 추측하다 옆 줄을 가져온다.

   고친 구조 — 두 단계로 나눈다:
     ① **산술로 후보를 만든다(코드).** 여행사 견적서의 상세 내역서는 예외 없이
        `단가 × 수량 × 횟수 = 총금액`이다. 이 관계가 실제로 성립하는 줄만 남긴다.
        → 이 단계에서 나온 숫자는 문서에 실제로 있는 값이고, 서로 검산까지 맞다.
     ② **AI는 그중 몇 번 줄인지만 고른다.** 숫자를 직접 말하지 못하게 하고
        **줄 번호**로만 답하게 한다. 서버는 그 번호로 값을 되찾는다.
        → AI가 없는 숫자를 지어낼 수 있는 경로가 **구조적으로** 사라진다.

   ⚠ 이 방식의 한계도 분명히 해 둔다: 상세 내역서가 없는 패키지 견적(총액만 있는 것)은
   후보가 안 나온다. 그건 못 찾는 게 맞고, 화면이 "이 견적서에는 단가표가 없다"고 말한다.
   ai-loop/test_rN_pdf_rows.js가 실제 견적서 텍스트로 이 두 단계를 고정한다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 한 줄에서 숫자만 뽑는다(₩·쉼표·괄호 제거). 0과 음수는 단가가 될 수 없어 버린다. */
function numbersInLine(line) {
  return (String(line).match(/\d[\d,]*/g) || [])
    .map((s) => Number(s.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/* 총금액이 이 값보다 작으면 단가 줄로 보지 않는다 — 날짜·인원·전화번호가
   우연히 곱셈으로 맞아떨어지는 것을 걸러낸다. */
const ROW_MIN_TOTAL = 10000;
const ROW_MAX_CANDIDATES = 40;

function extractUnitRows(text) {
  const found = [];
  String(text).split(/\r?\n/).forEach((rawLine, lineNo) => {
    const line = rawLine.trim();
    const ns = numbersInLine(line);
    if (ns.length < 3 || ns.length > 12) return;   /* 12개 넘게 든 줄은 표가 아니라 문단이다 */
    for (let a = 0; a < ns.length; a++) {
      for (let b = 0; b < ns.length; b++) {
        if (b === a) continue;
        for (let d = 0; d < ns.length; d++) {
          if (d === a || d === b) continue;
          if (ns[d] < ROW_MIN_TOTAL) continue;
          /* 단가 × 수량 = 총금액 */
          if (Math.abs(ns[a] * ns[b] - ns[d]) <= 1) {
            found.push({ lineNo, line, unit: ns[a], qty: ns[b], times: 1, total: ns[d] });
          }
          /* 단가 × 수량 × 횟수(박수) = 총금액 */
          for (let c = 0; c < ns.length; c++) {
            if (c === a || c === b || c === d) continue;
            if (Math.abs(ns[a] * ns[b] * ns[c] - ns[d]) <= 1) {
              found.push({ lineNo, line, unit: ns[a], qty: ns[b], times: ns[c], total: ns[d] });
            }
          }
        }
      }
    }
  });
  /* 한 줄에서 여러 조합이 맞을 수 있다(152,000×7×3 과 7×3×… 등). 같은 (줄,총액)이면
     **단가가 가장 큰 것**만 남긴다 — 우리가 찾는 것은 단가이지 수량이 아니다. */
  const best = new Map();
  found.forEach((r) => {
    const k = r.lineNo + '|' + r.total;
    const cur = best.get(k);
    if (!cur || r.unit > cur.unit) best.set(k, r);
  });
  return Array.from(best.values())
    .sort((x, y) => x.lineNo - y.lineNo)
    .slice(0, ROW_MAX_CANDIDATES)
    .map((r, i) => Object.assign({ idx: i }, r));
}

/* AI에게 보낼 원문 구간을 고른다 (RN).
   ⚠ 앞에서부터 잘라 보내면 안 된다. 하나투어 견적서는 「항공·호텔·중식·석식」 같은
   **항목 이름이 표 맨 뒤 별도 블록**에 몰려 있어서, 앞부분만 보내면 AI가 라벨을 아예
   못 본다. 실제로 그래서 식비 자리에 입장료 줄이 들어왔다.
   그래서 **머리(호텔명·기간이 있는 곳) + 단가 줄이 시작되는 곳부터 끝까지**를 보낸다. */
const PROMPT_HEAD_CHARS = 1500;
const PROMPT_TAIL_CHARS = 6500;
function promptContext(text, rows) {
  const s = String(text);
  if (s.length <= PROMPT_HEAD_CHARS + PROMPT_TAIL_CHARS) return s;
  const head = s.slice(0, PROMPT_HEAD_CHARS);
  /* 첫 단가 줄이 있는 지점부터 뒤쪽을 가져온다 — 라벨 블록은 표 뒤에 온다 */
  let from = 0;
  if (rows.length) {
    const firstLine = rows[0].line;
    const at = s.indexOf(firstLine);
    if (at >= 0) from = at;
  }
  const tail = s.slice(from, from + PROMPT_TAIL_CHARS);
  return head + '\n…(중략)…\n' + tail;
}

function buildExtractionPrompt(text, rows) {
  const list = rows.map((r) =>
    `[${r.idx}] 단가 ${r.unit.toLocaleString()}원 × 수량 ${r.qty} × 횟수 ${r.times} = ${r.total.toLocaleString()}원   ← 원문: ${r.line.replace(/\s+/g, ' ').slice(0, 110)}`
  ).join('\n');

  return `당신은 여행사 견적서를 읽는 어시스턴트입니다.

아래 [후보 줄]은 견적서에서 **산술이 실제로 맞는 것만** 골라낸 단가 줄입니다
(단가 × 수량 × 횟수 = 총금액이 검산된 줄입니다).

[후보 줄]
${list || '(단가 줄을 찾지 못했습니다)'}

[견적서 원문]
⚠ 이 견적서는 표가 납작하게 펴져 있어, **항목 이름(항공·호텔·중식·석식·차량·가이드·
입장료 등)이 숫자와 떨어진 별도 블록에 모여 있을 수 있습니다.** 그 이름 목록은 보통
위 후보 줄과 **같은 순서**로 나열됩니다. 순서를 맞춰 보고 판단하세요.

${promptContext(text, rows)}

위 [후보 줄] 중에서 각 항목에 해당하는 줄을 **번호로만** 고르세요.
⚠ 숫자를 직접 쓰지 마세요. 반드시 후보 줄의 번호를 쓰고, 해당하는 줄이 없으면 null입니다.
⚠ 억지로 고르지 마세요. 애매하면 null이 맞습니다.

판단 기준:
- airfareRow  : 1인당 **항공 운임**. 유류할증료·택스·공항세는 항공료가 아니므로 고르지 마세요.
- hotelRow    : **객실 1박당** 숙박비. 보통 수량이 '객실 수', 횟수가 '박 수'입니다.
- mealRows    : **식사 줄 전부**(배열). 중식·석식·조식이 따로 있으면 **모두** 넣으세요.
                하루치 식대를 합산할 것이므로 빠뜨리면 안 됩니다.
                ⚠ 입장료·유류할증료·보험·쇼핑은 식사가 아닙니다.
- 차량·가이드·입장료·보험·쇼핑·수수료 줄은 위 셋 중 어느 것도 아닙니다.

**수량으로 걸러내세요 — 이게 가장 확실한 단서입니다.**
- 항공료·식사는 **1인당** 항목이라 수량이 **인원 수와 비슷**합니다(예: 14, 15).
- 차량·가이드·도로유류주차는 **전체 단위**라 수량이 **1**입니다. → 항공·식사가 될 수 없습니다.
- 호텔은 수량이 **객실 수**(인원의 절반쯤), 횟수가 **박 수**입니다.
- 식사는 보통 한 줄의 단가가 **몇만 원대**입니다. 20만 원이 넘으면 식사가 아닐 가능성이 큽니다.

다음 JSON 형식으로만 답하세요(설명 없이):
{
  "airfareRow": 후보 줄 번호 또는 null,
  "hotelRow": 후보 줄 번호 또는 null,
  "mealRows": [후보 줄 번호, ...] 또는 [],
  "hotelName": "실제 이용 호텔 이름" 또는 null,
  "confidence": "high" | "medium" | "low",
  "note": "왜 그 줄들을 골랐는지 한 문장"
}`;
}

function validatedNumber(raw, max) {
  return (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= max) ? Math.round(raw) : null;
}

/* AI가 고른 줄 번호 → 실제 단가. **AI가 준 숫자는 절대 쓰지 않는다.**
   번호가 범위를 벗어나거나 상한을 넘으면 버린다(없는 값을 만들어내는 경로를 막는다). */
function pickRowValue(rows, rawIdx, max) {
  if (typeof rawIdx !== 'number' || !Number.isInteger(rawIdx)) return null;
  const row = rows[rawIdx];
  if (!row) return null;
  const val = validatedNumber(row.unit, max);
  if (val == null) return null;
  return { value: val, evidence: row.line.replace(/\s+/g, ' ').slice(0, 140),
           calc: `${row.unit.toLocaleString()} × ${row.qty} × ${row.times} = ${row.total.toLocaleString()}` };
}

/* 식사는 **하루치를 합산**한다 (RO). 견적서는 중식·석식이 따로 줄로 나오는데,
   요율의 meal_per_person은 '1인 1일' 식대이기 때문이다.
   ⚠ 여러 줄을 더하므로 근거도 "17,100 + 33,250 = 50,350"처럼 합산 과정을 그대로 보인다. */
function pickMealDaily(rows, rawIdxs, max) {
  const list = Array.isArray(rawIdxs) ? rawIdxs : (rawIdxs == null ? [] : [rawIdxs]);
  const picked = [];
  const seen = new Set();
  list.forEach((i) => {
    if (typeof i !== 'number' || !Number.isInteger(i) || seen.has(i)) return;
    const row = rows[i];
    if (!row) return;
    seen.add(i);
    picked.push(row);
  });
  if (!picked.length) return null;
  const sum = picked.reduce((n, r) => n + r.unit, 0);
  const value = validatedNumber(sum, max);
  if (value == null) return null;
  return {
    value,
    rowIdxs: picked.map((r) => r.idx),
    evidence: picked.map((r) => r.line.replace(/\s+/g, ' ').slice(0, 70)).join('  /  ').slice(0, 200),
    calc: picked.length > 1
      ? picked.map((r) => r.unit.toLocaleString()).join(' + ') + ' = ' + value.toLocaleString() + ' (1인 1일)'
      : `${picked[0].unit.toLocaleString()} (1인 1일)`,
  };
}

/* 말이 안 되는 조합을 잡는다 — AI가 같은 줄을 두 항목에 고르는 실수가 실제로 있었다
   (호텔에 항공료를 넣었다). 사람이 눈으로 잡기 전에 화면이 먼저 말하게 한다. */
function sanityWarnings(a, h, m) {
  const w = [];
  if (a && h && a.value === h.value) w.push('항공료와 호텔단가가 같은 값입니다 — 같은 줄을 골랐을 수 있습니다.');
  if (a && m && a.value === m.value) w.push('항공료와 식비가 같은 값입니다 — 같은 줄을 골랐을 수 있습니다.');
  if (h && m && h.value === m.value) w.push('호텔단가와 식비가 같은 값입니다 — 같은 줄을 골랐을 수 있습니다.');
  /* ⚠ 기준이 '하루치'라 1식 기준보다 커야 정상이다. 20만 원을 넘으면 유류할증료·
     보험 같은 다른 줄이 섞였을 가능성이 높다. */
  if (m && m.value > 200000) w.push('식비가 하루 20만 원을 넘습니다 — 유류할증료·보험 줄이 섞였을 수 있습니다.');
  if (h && a && h.value > a.value) w.push('호텔 1박이 항공료보다 비쌉니다 — 확인해 주세요.');
  return w;
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

  /* ① 산술이 맞는 단가 줄만 남긴다 (RN). 여기서 나온 값만 결과가 될 수 있다. */
  const rows = extractUnitRows(text);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: buildExtractionPrompt(text, rows) }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });
    const parsed = JSON.parse(completion.choices[0].message.content);

    /* ② AI가 준 **줄 번호**로만 값을 되찾는다. AI가 쓴 숫자는 쓰지 않는다. */
    const a = pickRowValue(rows, parsed.airfareRow, AIRFARE_UNIT_MAX);
    const h = pickRowValue(rows, parsed.hotelRow, HOTEL_UNIT_MAX);
    /* 식사만 여러 줄을 합산한다 (RO) — 하루치 = 중식 + 석식 (+조식). */
    const m = pickMealDaily(rows, parsed.mealRows, MEAL_UNIT_MAX);
    const hotelName = typeof parsed.hotelName === 'string' ? parsed.hotelName.trim().slice(0, HOTEL_NAME_MAX_LEN) : '';

    /* 후보 줄을 화면에도 그대로 내려보낸다 (RN).
       ⚠ 이게 이 기능의 핵심이다. AI의 라벨 추측은 견적서 형식에 따라 틀린다 —
       하나투어 견적서는 항목 이름이 표와 떨어진 블록에 몰려 있어 식비 자리에
       입장료 줄이 들어오는 일이 실제로 있었다. 그래서 **AI가 고른 것을 초안으로 두고,
       담당자가 후보 목록에서 1클릭으로 바꿀 수 있게** 한다. 숫자를 타이핑할 일이 없어
       대량 입력에서도 빠르고, 값은 언제나 견적서에 실제로 있는 검산된 줄에서 온다. */
    const candidates = rows.map((r) => ({
      idx: r.idx, unit: r.unit, qty: r.qty, times: r.times, total: r.total,
      line: r.line.replace(/\s+/g, ' ').slice(0, 140),
    }));

    if (!a && !h && !m && !hotelName && !candidates.length) {
      return res.status(200).json({
        error: 'not_found',
        note: parsed.note || '',
        /* 왜 못 찾았는지 구분해서 말해 준다 — "단가표가 아예 없는 견적서"와
           "표는 있는데 못 고른 것"은 담당자가 할 일이 다르다. */
        rowCount: 0,
      });
    }
    return res.status(200).json({
      suggestedAirfare: a ? a.value : null,
      suggestedHotel: h ? h.value : null,
      suggestedHotelName: hotelName || null,
      suggestedMeal: m ? m.value : null,
      /* 근거를 함께 돌려준다 — 화면이 "이 숫자는 견적서 이 줄에서 왔다"를 보여줘야
         담당자가 PDF를 다시 열지 않고 2초 만에 대조할 수 있다. 대량 입력의 핵심이다. */
      evidence: {
        airfare: a ? { line: a.evidence, calc: a.calc } : null,
        hotel: h ? { line: h.evidence, calc: h.calc } : null,
        meal: m ? { line: m.evidence, calc: m.calc } : null,
      },
      warnings: sanityWarnings(a, h, m),
      /* 담당자가 고쳐 고를 수 있도록 후보 전체와 AI가 고른 번호를 함께 준다 */
      candidates,
      picked: {
        airfare: a ? parsed.airfareRow : null,
        hotel: h ? parsed.hotelRow : null,
        /* 식사는 여러 줄이라 배열로 준다 — 화면이 체크박스로 그린다 */
        mealRows: m ? m.rowIdxs : [],
      },
      rowCount: rows.length,
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

/* 견적서 단가 뽑기의 **순수 함수**를 테스트가 직접 부를 수 있게 내보낸다 (RN).
   ⚠ 핸들러(module.exports)에 얹는 형태다 — Vercel은 함수 export만 보므로 영향이 없다.
   테스트가 이 함수를 복사해 쓰면 곧 어긋나므로, 진짜 코드를 그대로 부르게 한다. */
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

/* ── 테스트용 노출 (RN) — ai-loop/test_rN_pdf_rows.js가 이 함수들을 직접 검사한다.
   ⚠ 복사해서 테스트하면 곧 어긋난다. 진짜 코드를 그대로 부르게 한다. */
module.exports._extract = {
  extractUnitRows, buildExtractionPrompt, pickRowValue, pickMealDaily, sanityWarnings, promptContext,
  AIRFARE_UNIT_MAX, HOTEL_UNIT_MAX, MEAL_UNIT_MAX,
};

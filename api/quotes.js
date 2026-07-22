const { sql } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const OpenAI = require('openai');

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
    const { PDFParse } = require('pdf-parse');
    const buffer = Buffer.from(pdfBase64, 'base64');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = (result.text || '').trim();
    await parser.destroy();
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
  const safeAuthor = String(author || '').slice(0, 40);
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

  if (req.method === 'POST') {
    const payload = req.body || {};
    const id = payload.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      await sql`
        insert into quotes (id, status, note, dest_label, org_name, participants, total, payload)
        values (${id}, 'new', '', ${payload.destLabel || null}, ${payload.orgName || null},
                ${payload.participants ?? null}, ${payload.total ?? null}, ${JSON.stringify(payload)}::jsonb)
        on conflict (id) do nothing
      `;
      res.status(200).json({ ok: true, id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'insert_failed' });
    }
    return;
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

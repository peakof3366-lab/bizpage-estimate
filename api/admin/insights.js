/* 관리자 전용 통계/마케팅 인사이트 (신규, 통합 엔드포인트).
   Vercel Hobby 플랜의 "배포당 서버리스 함수 12개" 제한 때문에 analytics.js와
   marketing-insights.js 두 파일을 이 하나로 합쳤다 — ?type= 쿼리로 구분.

   GET  ?type=analytics = 방문/이벤트 집계 조회
       admin.html의 loadRemoteData()가 이 응답을 기존 localStorage 키(linkedt_visits/
       linkedt_events/linkedt_dest_stats)와 동일한 모양으로 채워 넣으므로, 기존 렌더링
       코드(renderStats/renderEvents 등)는 전혀 수정하지 않고 실제 서버 데이터로 전환된다.
   GET  ?type=marketing = 가장 최근 캐시된 GPT 마케팅 분석 결과 조회 (호출 비용 없음)
   POST ?type=marketing = 실제 OpenAI API를 호출해 새로 분석하고 결과를 DB에 저장 */
const { sql } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const { CLICK_EVENT_NAMES } = require('../_lib/site_events');
const OpenAI = require('openai');

const MAX_SOURCES = 150;

/* 방문 원본 행을 화면으로 보내는 상한. 차트(14일 추이·시간대·요일)가 원본 타임스탬프를
   필요로 해서 집계만으로는 대체할 수 없다.
   ⚠ 예전엔 이 상한에 걸린 사실이 **화면 어디에도 남지 않았다.** 방문이 3,000건을
   넘는 순간 "전체 방문"은 3,000에서 멈추고, 퍼널의 분모도 3,000으로 굳어 전환율이
   부풀려지며, 14일 차트는 오래된 날짜부터 잘려 **평평한 트래픽이 우상향으로 보인다.**
   전부 사장님이 마케팅 판단에 쓰는 숫자다(결함 생성기 ② — 조용한 폴백).
   → 전체 건수는 count(*)로 따로 세어 함께 돌려주고, 절단 여부를 명시한다. */
const VISIT_WINDOW = 3000;

/* 연수지 집계 행 상한. group by는 distinct 값 수만큼 행을 내는데 dest 값의 출처가
   **인증 없는 공개 POST**라 상한이 없으면 응답 크기를 외부에서 좌우할 수 있었다.
   `order by c desc`로 자르므로 화면이 쓰는 TOP 10은 상한과 무관하게 정확하다.
   잘린 목적지가 있으면 `destTruncated`로 알린다(현재 화면은 TOP N만 쓰므로 표시는
   하지 않는다 — 필요해지면 그때 쓰라고 값만 넘긴다). */
const MAX_DEST_ROWS = 50;

async function handleAnalytics(req, res) {
  try {
    const [visitRows, visitTotalRows, eventRows, destRows, destTotalRows] = await Promise.all([
      sql`select created_at as ts from site_events where name = 'pageview'
          order by created_at desc limit ${VISIT_WINDOW}`,
      sql`select count(*)::int as c from site_events where name = 'pageview'`,
      sql`select name, count(*)::int as c from site_events where name = any(${CLICK_EVENT_NAMES}) group by name`,
      sql`select meta->>'dest' as dest, count(*)::int as c from site_events
          where name = 'dest_select' and meta ? 'dest'
          group by dest order by c desc limit ${MAX_DEST_ROWS}`,
      sql`select count(distinct meta->>'dest')::int as c from site_events
          where name = 'dest_select' and meta ? 'dest'`,
    ]);

    const events = {};
    for (const row of eventRows) events[row.name] = row.c;

    const dest = {};
    for (const row of destRows) if (row.dest) dest[row.dest] = row.c;

    const visitTotal = visitTotalRows[0] ? visitTotalRows[0].c : visitRows.length;
    const destTotal = destTotalRows[0] ? destTotalRows[0].c : Object.keys(dest).length;

    res.status(200).json({
      visits: visitRows.map((r) => ({ ts: r.ts })),
      events,
      dest,
      /* 화면이 "지금 보고 있는 것이 전부인지"를 알 수 있게 하는 값들 (PZ) */
      visitTotal,
      visitWindow: VISIT_WINDOW,
      visitsTruncated: visitTotal > visitRows.length,
      destTotal,
      destTruncated: destTotal > Object.keys(dest).length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'query_failed' });
  }
}

async function collectSourceTexts() {
  const [inqRows, quoteRows] = await Promise.all([
    sql`select message from inquiries
        where message is not null and length(trim(message)) > 0
        order by created_at desc limit ${MAX_SOURCES}`,
    sql`select payload->>'request' as request from quotes
        where payload->>'request' is not null and length(trim(payload->>'request')) > 0
        order by created_at desc limit ${MAX_SOURCES}`,
  ]);
  return [
    ...inqRows.map((r) => r.message.trim()),
    ...quoteRows.map((r) => r.request.trim()),
  ].filter(Boolean);
}

function buildPrompt(texts) {
  const list = texts.map((t, i) => `${i + 1}. ${t.slice(0, 300)}`).join('\n');
  return `당신은 B2B 해외연수 서비스 "비즈페이지"의 마케팅 담당자를 돕는 분석가입니다.
아래는 최근 고객이 문의/견적요청 시 남긴 자유서술 텍스트 목록입니다(번호는 무시).

${list}

이 텍스트들을 분석해 다음 JSON 형식으로만 답하세요(다른 설명 텍스트 없이 JSON만):
{
  "keywords": [{"word": "키워드", "count": 등장빈도추정치}],
  "topics": [{"title": "주제명", "description": "이 주제가 왜 자주 나오는지 1~2문장", "example": "실제 문장에서 가져온 대표 예시 1개(원문 일부 인용)"}],
  "actions": ["마케팅팀이 바로 실행할 수 있는 구체적 제안 1문장"]
}
keywords는 최대 15개, topics는 최대 6개, actions는 최대 5개로 제한하세요.`;
}

async function handleMarketingGet(req, res) {
  try {
    const rows = await sql`select created_at, source_count, result from marketing_insights order by created_at desc limit 1`;
    if (!rows.length) return res.status(200).json({ result: null });
    res.status(200).json({ createdAt: rows[0].created_at, sourceCount: rows[0].source_count, result: rows[0].result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'query_failed' });
  }
}

async function handleMarketingPost(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'openai_not_configured' });
  }
  try {
    const texts = await collectSourceTexts();
    if (!texts.length) {
      return res.status(200).json({ error: 'no_source_data' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: buildPrompt(texts) }],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch {
      return res.status(500).json({ error: 'parse_failed' });
    }

    await sql`insert into marketing_insights (source_count, result) values (${texts.length}, ${JSON.stringify(result)}::jsonb)`;
    res.status(200).json({ sourceCount: texts.length, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'analysis_failed' });
  }
}

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const type = (req.query && req.query.type) || 'analytics';

  if (type === 'analytics') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    return handleAnalytics(req, res);
  }

  if (type === 'marketing') {
    if (req.method === 'GET') return handleMarketingGet(req, res);
    if (req.method === 'POST') return handleMarketingPost(req, res);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.status(400).json({ error: 'invalid_type' });
};

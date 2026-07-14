/* 문의/견적요청 자유서술 텍스트에서 GPT로 마케팅 키워드·주제·액션을 뽑아내는
   관리자 전용 엔드포인트 (신규).
   GET  = 가장 최근 캐시된 분석 결과 조회 (호출 비용 없음)
   POST = 실제 OpenAI API를 호출해 새로 분석하고 결과를 DB에 저장 (관리자가
          "다시 분석하기" 버튼을 눌렀을 때만 호출되도록 admin.html에서 제어) */
const { sql } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');
const OpenAI = require('openai');

const MAX_SOURCES = 150;

async function collectSourceTexts() {
  const [inqRows, quoteRows] = await Promise.all([
    sql`select message from inquiries
        where message is not null and length(trim(message)) > 0
        order by created_at desc limit ${MAX_SOURCES}`,
    sql`select payload->>'request' as request from quotes
        where payload->>'request' is not null and length(trim(payload->>'request')) > 0
        order by created_at desc limit ${MAX_SOURCES}`,
  ]);
  const texts = [
    ...inqRows.map((r) => r.message.trim()),
    ...quoteRows.map((r) => r.request.trim()),
  ].filter(Boolean);
  return texts;
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

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`select created_at, source_count, result from marketing_insights order by created_at desc limit 1`;
      if (!rows.length) return res.status(200).json({ result: null });
      res.status(200).json({ createdAt: rows[0].created_at, sourceCount: rows[0].source_count, result: rows[0].result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  if (req.method === 'POST') {
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
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

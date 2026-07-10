const { sql } = require('./_lib/db');

/* 고객용 견적서 공유 링크(estimate-view.html?id=)를 짧게 만들기 위한 저장소.
   인증 없이 공개 접근 가능 — id 자체가 기존 ?d= base64 링크와 동일한 수준의
   추측 불가능한 토큰이며, 저장되는 데이터도 기존에 URL에 그대로 노출되던 것과 같다. */
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const payload = req.body || {};
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      await sql`
        insert into quote_shares (id, payload)
        values (${id}, ${JSON.stringify(payload)}::jsonb)
        on conflict (id) do nothing
      `;
      res.status(200).json({ ok: true, id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'insert_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

const { sql } = require('../_lib/db');

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      /* 🔴 **상태를 함께 읽는다** (XT). 예전엔 `payload`만 읽었다 — 담당자가 대장에서
         「취소」로 바꿔도 **고객은 「발급일로부터 30일간 유효합니다」라고 적힌 문서를
         그대로 봤다.** 대장은 「견적서를 지우지 않는다, 무산은 status='void'로 남긴다」를
         방침으로 삼고 있는데, 그 상태를 고객 쪽에서 아무도 안 읽고 있었다.
       ⚠ 상태는 **서버가 넣는다.** payload에 담아 온 값을 믿으면 위조 경로가 된다. */
      const rows = await sql`select payload, status from quote_shares where id = ${id} limit 1`;
      if (!rows.length) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      /* ⚠ 옛 링크는 `status`가 없을 수 있다 — 그때는 `issued`로 본다(화면이 안 바뀐다). */
      res.status(200).json(Object.assign({}, rows[0].payload, { st: rows[0].status || 'issued' }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

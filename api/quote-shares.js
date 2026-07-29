const { sql } = require('./_lib/db');
const { newId, payloadTooLarge } = require('./_lib/public_input');

/* 고객용 견적서 공유 링크(estimate-view.html?id=)를 짧게 만들기 위한 저장소.
   인증 없이 공개 접근 가능 — id 자체가 기존 ?d= base64 링크와 동일한 수준의
   추측 불가능한 토큰이며, 저장되는 데이터도 기존에 URL에 그대로 노출되던 것과 같다. */
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const payload = req.body || {};
    /* 인증 없는 엔드포인트라 반복 호출로 저장소를 채울 수 있다 — 정상 공유
       payload가 실측 3.4KB라 상한에 걸릴 일이 없다(api/_lib/public_input.js). */
    if (payloadTooLarge(payload)) return res.status(413).json({ error: 'payload_too_large' });
    const id = newId(); // 공유 링크 id는 서버만 만든다(클라이언트 지정 불가)
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

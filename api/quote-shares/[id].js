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
      const rows = await sql`select payload, status, quote_no, quote_id, created_at from quote_shares where id = ${id} limit 1`;
      if (!rows.length) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      /* ⚠ 옛 링크는 `status`가 없을 수 있다 — 그때는 `issued`로 본다(화면이 안 바뀐다). */
      /* 🔴 **견적번호는 컬럼이 진실이다** (ZB). 발급할 때 payload에도 `qno`를 복사해
         두는데, 두 곳에 적힌 값은 반드시 어긋난다 — 실측: 2026-08-24에 소급 부여한 10건은
         컬럼에만 번호가 있고 payload에는 없어서, **대장에는 번호가 보이는데 고객이 받는
         문서에서는 번호 칸이 통째로 숨겨졌다**(`estimate-view.html`이 `d.qno`를 본다).
       ⚠ payload 값을 덮어쓴다. 컬럼이 비어 있을 때만 payload 값을 남긴다. */
      const row = rows[0];
      /* 🔴 **더 최근 판이 있는가** (2026-09-30 대표 결정 — 이전 판을 지우지 않고 안내한다).
         _V3이 나와도 _V1 링크를 연 고객은 옛 금액을 유효한 견적으로 보고 있었다.
         같은 견적 기록(quote_id)에서 **나중에 발급된**, 취소 안 된 판 중 가장 최근 것을 준다.
         ⚠ 「대체됐다」가 아니라 「더 최근 판이 있다」다 — 한 견적에 A안·B안을 동시에 내는
           일이 있어서, 옛 판이 무효라고 서버가 단정할 수 없다.
         ⚠ 번호와 링크 id만 준다. 같은 고객의 같은 견적이라 새로 드러나는 것이 없다.
         ⚠ 이걸 못 찾았다고 문서를 못 주면 안 된다 — 실패하면 기록하고 띠 없이 준다. */
      let newer = null;
      if (row.quote_id && row.created_at) {
        try {
          const nx = await sql`
            select id, quote_no from quote_shares
             where quote_id = ${row.quote_id} and id <> ${id}
               and created_at > ${row.created_at}
               and coalesce(status, 'issued') <> 'void'
             order by created_at desc limit 1`;
          if (nx.length) newer = { id: nx[0].id, qno: nx[0].quote_no || null };
        } catch (err) {
          console.error('[quote-shares/:id] 최근 판 조회 실패(띠 없이 보낸다):', err && err.message);
        }
      }
      res.status(200).json(Object.assign({}, row.payload, {
        st: row.status || 'issued',
        qno: row.quote_no || (row.payload && row.payload.qno) || null,
        newer,
      }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

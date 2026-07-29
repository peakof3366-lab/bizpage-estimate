const { sql } = require('./_lib/db');
const { newId, payloadTooLarge } = require('./_lib/public_input');
const { requireAdmin } = require('./_lib/auth');
const { verifyQuote } = require('./_lib/quote_verify');

/* 고객용 견적서 공유 링크(estimate-view.html?id=) 저장소.

   ■ 2026-07-29 구조 변경 — 링크 내용을 서버가 소유한다
   예전엔 (a) 고객 브라우저가 만든 payload를 검증 없이 저장하고, (b) 실패하면
   base64를 URL에 그대로 실은 ?d= 링크로 폴백했다. 즉 **누구든 우리 도메인에
   임의 금액의 견적서 페이지를 만들 수 있었고**, 서버에 기록조차 남지 않아 나중에
   "이 링크 우리가 발급한 게 맞나"를 확인할 방법이 없었다. 링크가 우리 도메인에
   있으면 고객 주장에 우리 쪽 근거가 붙는 셈이라 가격 분쟁의 소지가 된다.

   이제 링크는 **검증을 통과한 견적에만** 발급되고, 내용은 DB에만 존재한다.
   ?d= 폴백은 제거했다(estimate-view.html). 고객이 버튼을 누르는 것 자체는 그대로
   두었다 — MICE 견적은 실무자가 결정권자에게 보여주는 동선이 핵심이라 여기서
   링크를 없애면 전환 손해가 크고, 정작 위조는 '누가 누르는가'가 아니라 '내용을
   누가 만드는가'의 문제이기 때문이다.

   POST (공개) — { share, quote } 를 받아 검증 후 발급
     통과: { ok:true, id }
     실패: { ok:false, verdict:'review', steps } — 링크를 만들지 않는다.
           고객 화면은 "담당자 확인 후 연락" 안내로 넘어가고 견적 자체는 이미
           /api/quotes에 저장돼 있으므로 리드는 유실되지 않는다.
   POST ?action=issue (관리자) — 담당자가 확정 견적서 링크를 직접 발급.
     검증에 걸려도 담당자 판단으로 발급할 수 있다(조건을 조정해 보내는 경우). */

/* 공유용 축약 payload(shareData)만 있고 견적 스냅샷이 없을 때, 검증기가 읽을 수 있는
   모양으로 옮긴다. 키가 짧은 이유는 예전에 이 객체가 URL에 실렸기 때문이다. */
function shareToVerifyPayload(share) {
  const s = share || {};
  return {
    destination: s.dk,
    participants: s.n,
    days: s.d,
    startDate: s.sd && /^\d{4}-\d{2}-\d{2}$/.test(s.sd) ? s.sd : undefined,
    total: s.t,
    perPerson: s.pp,
    rateDate: s.rd,
    /* rows는 [이름, 금액] 쌍이라 항목 검증에 그대로 쓸 수 있다.
       단 비공개 항목은 애초에 빠져 있으므로 합계 검증은 성립하지 않는다
       → items를 넘기지 않아 해당 단계를 건너뛴다(거짓 실패 방지). */
  };
}

async function loadContext(destKey) {
  const ctx = {};
  try {
    const [ovRows, coefRows, customRows] = await Promise.all([
      sql`select destination_key, overrides from rate_overrides`,
      sql`select value from app_settings where key = 'coefficients'`,
      destKey ? sql`select * from custom_destinations where destination_key = ${destKey}` : Promise.resolve([]),
    ]);
    ctx.overrides = {};
    for (const r of ovRows) ctx.overrides[r.destination_key] = r.overrides;
    ctx.coefficients = coefRows.length ? coefRows[0].value : null;
    ctx.customRow = customRows.length ? customRows[0] : null;
  } catch (err) {
    /* 권위 데이터를 못 읽으면 '검증했다'고 말할 수 없다. 빈 컨텍스트로 통과시키면
       조용히 무검증 발급이 되므로, 호출부가 실패로 다루도록 표시만 남긴다. */
    console.error('[quote-shares] 권위 데이터 조회 실패:', err);
    ctx.unavailable = true;
  }
  return ctx;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = req.body || {};
  /* 하위호환: 예전 클라이언트는 shareData를 본문 그대로 보냈다. */
  const share = body.share || body;
  const quote = body.quote || null;
  const isStaffIssue = req.query && req.query.action === 'issue';

  if (payloadTooLarge(body)) return res.status(413).json({ error: 'payload_too_large' });
  if (!share || typeof share !== 'object' || !share.dk) {
    return res.status(400).json({ error: 'invalid_share' });
  }

  if (isStaffIssue && !(await requireAdmin(req, res))) return;

  const ctx = await loadContext(share.dk);
  if (ctx.unavailable && !isStaffIssue) {
    return res.status(503).json({ ok: false, verdict: 'unavailable', error: 'verification_unavailable' });
  }

  /* 견적 스냅샷(P6)이 있으면 그쪽이 훨씬 촘촘하다 — 항목별 단가·수량, 적용 계수가
     전부 들어 있다. 없으면 공유 payload에서 확인 가능한 만큼만 본다. */
  const verifyPayload = quote && typeof quote === 'object' ? quote : shareToVerifyPayload(share);
  const result = verifyQuote(verifyPayload, ctx);

  /* 담당자 발급은 검증 결과를 기록만 하고 막지 않는다 — 조건을 조정해 보내는
     정상 업무가 있고, 그 판단은 사람이 한다. 고객 자동 발급은 통과해야만 한다. */
  if (!result.ok && !isStaffIssue) {
    return res.status(200).json({
      ok: false, verdict: 'review',
      failedSteps: result.failedSteps,
      steps: result.steps,
    });
  }

  const id = newId();
  try {
    await sql`
      insert into quote_shares (id, payload)
      values (${id}, ${JSON.stringify({
        ...share,
        _verify: {
          verdict: result.verdict,
          failedSteps: result.failedSteps,
          at: new Date().toISOString(),
          issuedBy: isStaffIssue ? (req.user && req.user.displayName) || 'staff' : 'auto',
        },
      })}::jsonb)
      on conflict (id) do nothing
    `;
    return res.status(200).json({ ok: true, id, verdict: result.verdict });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'insert_failed' });
  }
};

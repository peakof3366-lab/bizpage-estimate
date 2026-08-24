const { sql } = require('./_lib/db');
const { newId, payloadTooLarge } = require('./_lib/public_input');
const { requireAdmin } = require('./_lib/auth');
const { verifyQuote } = require('./_lib/quote_verify');
/* ⚠ `packages`를 읽는 조건·금액 계산은 **`_lib/packages.js` 하나가 진실**이다(VS). */
const PKG = require('./_lib/packages');

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

/* ═══════════════════════════════════════════════════════════════════════════
   ?action=package (VR) — **패키지 상품 견적서**. 엔진이 만든 값이 아니다.
   ───────────────────────────────────────────────────────────────────────────
   위 발급 경로는 `verifyQuote`로 **엔진과 대조해** 위조를 막는다. 패키지는 그 검증을
   통과할 수 없다 — 애초에 엔진이 만든 값이 아니기 때문이다(대리점가를 그대로 쓴다).
   그렇다고 검증을 끄면 이 파일이 막으려던 위조 경로가 다시 열린다.

   → **값이 브라우저를 아예 안 지나게 한다.** 브라우저는 `packageId`와 인원만 보내고,
     금액·일정·기간은 **서버가 DB에서 읽어** 페이로드를 만든다.
     위조할 값이 요청에 없으므로 **검증할 것도 없다.** 이 파일의 원칙("링크 내용을
     서버가 소유한다")을 그대로 따른 것이다.

   ⚠ **`verifyQuote`를 부르지 않는다.** 부르면 엔진 값과 달라 매번 실패하고,
     그 실패를 무시하는 코드가 생기면 그게 곧 무검증 발급이 된다.
     대신 `_verify.verdict = 'package'`로 남겨 **엔진 검증을 거친 것과 구분**한다 —
     둘이 같은 얼굴이면 나중에 「검증된 견적서」를 셀 때 거짓이 섞인다.
   ⚠ **판매중이고 기한이 안 지난 상품만** 발급한다. 마감된 상품으로 견적서가 나가면
     대리점인 우리가 그 값으로 물어야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const PKG_MAX_PAX = 500;

async function issuePackageShare(req, res) {
  const b = req.body || {};
  const pkgId = typeof b.packageId === 'string' ? b.packageId : '';
  if (!pkgId || !/^[A-Za-z0-9_-]+$/.test(pkgId)) return res.status(400).json({ error: 'invalid_package_id' });

  /* 인원은 **금액이 아니라 수량**이라 브라우저가 보내도 된다. 다만 범위는 막는다 —
     안 막으면 1인당 금액 × 터무니없는 수가 총액으로 찍힌다. */
  const pax = Math.round(Number(b.pax));
  if (!Number.isFinite(pax) || pax < 1 || pax > PKG_MAX_PAX) {
    return res.status(400).json({ error: 'invalid_pax' });
  }

  let p;
  try {
    /* ⚠ 조건은 **`_lib/packages.js` 하나가 진실**이다(VS). 예전엔 여기 쿼리를 직접
       쓰고 「고객 목록과 같은 조건으로 읽는다」고 주석만 달아 뒀는데, 그 말이
       지켜지는지를 아무것도 검사하지 않았다. */
    p = await PKG.getIssuablePackage(sql, pkgId);
  } catch (err) {
    console.error('[quote-shares] 패키지 조회 실패:', err);
    /* 조회가 실패했으면 발급하지 않는다 — 빈 값으로 만들면 0원 견적서가 나간다 */
    return res.status(503).json({ error: 'package_lookup_failed' });
  }
  if (!p) return res.status(404).json({ error: 'package_not_available' });

  /* ⚠ **1회용 소규모 견적은 관리자만 발급한다**(VS). 목록에서 감추는 것은 노출
     방지지 접근 통제가 아니다 — id를 아는 사람이 이 공개 POST로 남의 손님 견적서를
     그대로 뽑아 갈 수 있다. catalog는 애초에 고객이 고르라고 만든 것이라 공개다. */
  if ((p.kind || 'catalog') === 'adhoc') {
    if (!(await requireAdmin(req, res))) return;
  }

  /* ⚠ **저장된 총액을 믿지 않고 다시 구한다**(VS). 항목이 있으면 그 합이 이긴다 —
     DB를 직접 고쳤거나 옛 저장이 남아 둘이 어긋난 경우, 견적서에 나가는 값과
     화면이 보여준 값이 달라지는 쪽이 훨씬 비싸다. */
  const per = PKG.perPersonOf(p);
  if (!Number.isFinite(per) || per <= 0) {
    return res.status(409).json({ error: 'package_price_broken' });
  }
  const iti = Array.isArray(p.itinerary) ? p.itinerary : [];
  const listOf = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);
  const assembled = (p.price_basis || 'agency') === 'assembled';

  const share = {
    dk: p.dest_key || null,
    dt: p.dest_label || p.dest_key || '',
    n: pax,
    d: p.days || null,
    ng: p.nights || null,
    sd: p.depart_date ? String(p.depart_date).slice(0, 10) : null,
    /* 총액은 **서버가 곱한다.** 브라우저가 보낸 총액을 쓰면 그게 곧 위조 경로다. */
    t: per * pax,
    pp: per,
    /* 항목을 조립했으면 **항목별로** 나간다. 안 했으면 한 줄이다(VS). */
    rows: PKG.shareRowsOf(p, assembled ? '산출 금액 (1인)' : '패키지 상품가 (1인)'),
    ptx: assembled ? '담당자 산출' : '패키지 상품',
    ia: iti.length ? { t: p.title, h: [], d: iti } : null,
    /* ⚠ **이 견적서가 패키지임을 화면이 알아야 한다.** 안 알려주면 견적서가
       「VAT 별도 · 부대비용 미포함」처럼 맞춤 견적 기준 문구를 그대로 찍는다 —
       패키지는 그 값에 다 들어 있어서 거짓말이 된다. */
    pkg: {
      id: p.id,
      title: p.title,
      source: p.source,
      /* ⚠ **무엇으로 만든 값인지가 견적서에 남아야 한다**(VS). 대리점가는 「공급사가
         확인해 준 값」이고 조립가는 「우리가 판단한 값」이다 — 나중에 금액을 다투게
         되면 이 구분이 근거가 된다. 고객 화면 문구도 여기서 갈린다. */
      basis: assembled ? 'assembled' : 'agency',
      /* 금액이 언제 값인지 — 고객 견적서에 반드시 함께 나간다 */
      asOf: p.price_asof,
      validUntil: p.valid_until,
      included: listOf(p.incl_items),
      excluded: listOf(p.excl_items),
    },
  };

  const id = newId();
  try {
    await sql`
      insert into quote_shares (id, payload)
      values (${id}, ${JSON.stringify({
        ...share,
        _verify: {
          /* ⚠ 'ok'가 아니다 — 엔진 검증을 거친 것과 **구분되어야** 한다.
             그리고 VS부터는 **둘로 갈린다.** 대리점가('package')는 공급사가 확인해
             준 값이고, 조립가('assembled')는 담당자가 판단한 값이라 신뢰의 성격이
             다르다. 하나로 뭉치면 나중에 「검증된 견적서」를 셀 때 거짓이 섞인다. */
          verdict: assembled ? 'assembled' : 'package',
          why: assembled
            ? '담당자 조립 견적 — 엔진이 만든 값이 아니라 대조 대상이 아니다'
            : '패키지 상품 — 대리점가를 그대로 쓰므로 엔진 대조 대상이 아니다',
          at: new Date().toISOString(),
          issuedBy: assembled ? 'assembled' : 'package',
          kind: p.kind || 'catalog',
        },
      })}::jsonb)
      on conflict (id) do nothing`;
    return res.status(200).json({ ok: true, id, verdict: 'package' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'insert_failed' });
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  /* 패키지는 검증 대상이 아니라 위 분기보다 **먼저** 갈라낸다 — 아래로 흘려보내면
     verifyQuote가 엔진 값과 대조해 매번 실패한다(그리고 그 실패를 무시하고 싶어진다). */
  if (req.query && req.query.action === 'package') return issuePackageShare(req, res);

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

/* ═══════════════════════════════════════════════════════════════════════════
   담당자 화면을 **띄우는 데 필요한 서버 답** — 단일 출처 (XT)
   ───────────────────────────────────────────────────────────────────────────
   관리자 화면은 **로그인부터 통과해야** 아무것도 안 보인다. `admin.html`은 열리자마자
   `/api/admin/account?action=me`를 부르고, 그게 200이면 `showDash()`로 들어간다.
   그 답을 못 주면 도구는 **로그인 화면만 훑고** 「담당자 화면은 깨끗하다」고 말하게 된다
   — 아무것도 안 보고 초록이 되는 전형이다(결함 생성기 ③).

   ■ 두 가지 상태를 준다. **둘은 다른 화면이다.**
     · `empty`  — 막 만든 계정. 목록이 전부 0건이다.
       🔴 대표가 물으신 「화면을 봤을 때 바로 이해되는가」는 **이 상태에서 갈린다.**
          비어 있을 때 무엇을 하라고 말해 주지 않으면 담당자는 첫날 아무것도 못 한다.
     · `filled` — 며칠 쓴 계정. 목록에 몇 건씩 있다.

   ⚠ **픽스처는 서버가 실제로 주는 모양이어야 한다**(WR에서 `inclItems` vs `included`로
     당했다). 그래서 여기 값들은 `api/` 파일의 `res.status(200).json(...)`을 보고 맞췄고,
     모양이 헷갈리는 것은 **일부러 비워 둔다** — 지어낸 모양으로 통과시키면 그 검사는
     아무것도 안 지킨다.
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ymd = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

/* 로그인한 사람 — `api/admin/account.js`의 `action=me`가 주는 모양 그대로 */
const ME = { ok: true, id: '1', username: 'admin', displayName: '점검 담당자', role: 'owner' };

function adminFixtures(mode, rates) {
  const filled = mode === 'filled';

  /* 견적서 대장 한 줄 — `api/quote-shares.js`의 목록 select가 주는 칸 이름 그대로 */
  const shareRow = {
    id: 'sh_demo1', quote_no: 'Q-260827-01', status: 'issued',
    issued_by: '점검 담당자', created_at: new Date().toISOString(),
    dest: '다낭 (Da Nang)', org: '[가상] 한빛전자', cn: '[가상] 김담당',
    iso: ymd(0), pax: '30', total: '56696074', per: '1889869', verdict: 'verified',
  };

  return {
    rates: rates || { overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {} },
    /* 🔴 화면이 부르는 주소를 **전부** 받는다. 안 받으면 `{}`가 가고, 화면은 그걸
       「빈 목록」으로도 「오류」로도 읽을 수 있어 무엇을 재는지 알 수 없게 된다. */
    route(u, opt, json) {
      const is = (s) => u.includes(s);

      /* ── 로그인 ── */
      if (is('/api/admin/account?action=me') || is('account?action=me')) return json(ME);
      if (is('account?action=staffList')) {
        return json(filled
          ? [{ id: '1', username: 'admin', display_name: '점검 담당자', role: 'owner', active: true, self_signup: false, created_at: new Date().toISOString() }]
          : []);
      }
      if (is('account?action=signupSettings')) return json({ ok: true, code: '', enabled: false });
      if (is('/api/admin/account')) return json({ ok: true });

      /* ── 대시보드·통계 ── */
      if (is('insights?type=inbox')) return json(filled ? { inquiries: 2, quotes: 3, shares: 1 } : { inquiries: 0, quotes: 0, shares: 0 });
      if (is('insights?type=analytics')) return json({ events: [], totals: {} });
      if (is('insights?type=marketing')) return json({ rows: [], totals: {} });
      if (is('/api/admin/insights')) return json({});

      /* ── 목록들 ── */
      if (is('/api/quote-shares')) return json(filled ? [shareRow] : []);
      if (is('/api/inquiries')) {
        return json(filled
          ? [{ id: 'inq1', name: '[가상] 이문의', org: '[가상] 새롬물산', tel: '010-0000-0000', message: '연수 문의드립니다.', created_at: new Date().toISOString(), read: false }]
          : []);
      }
      if (is('action=priceReports')) return json([]);
      if (is('/api/quotes')) {
        return json(filled
          ? [{ id: 'q1', ts: new Date().toISOString(), destination: '다낭', participants: 30, days: 4, total: 56696074, status: 'new' }]
          : []);
      }
      if (is('action=itineraries')) return json({ itineraries: [] });
      if (is('action=packages')) return json({ packages: [] });
      if (is('/api/content')) return json({});
      if (is('/api/rates')) return json(this.rates);
      if (is('/api/track')) return json({ ok: true });
      return null;   /* 나머지는 `_page_boot`의 기본 답으로 */
    },
  };
}

/* 로그인 화면을 지나 대시보드로 들어간다.
   ⚠ `admin.html`은 `me`가 200이면 스스로 `showDash()`를 부른다. 그래도 **들어갔는지
     확인**하고, 안 들어갔으면 그 사실을 부르는 쪽에 알린다 — 조용히 로그인 화면만
     훑으면 「깨끗하다」는 거짓 초록이 된다. */
async function enterDashboard(B) {
  await B.tick(400);
  const doc = B.doc;
  const dash = doc.getElementById('dashPage');
  const login = doc.getElementById('loginPage');
  /* `showDash()`는 `loadRemoteData()`가 성공해야 들어간다 — `/api/inquiries`와
     `/api/quotes`가 **둘 다 배열**이어야 한다(둘 중 하나만 틀려도 로그인 폼만 남는다). */
  if (typeof B.win.showDash === 'function') {
    try { await B.win.showDash(); } catch (e) { /* 이미 들어가 있으면 조용히 넘어간다 */ }
    await B.tick(400);
  }
  const entered = !!dash && !dash.classList.contains('hidden');
  return { entered, dash, login };
}

module.exports = { adminFixtures, enterDashboard, ME, ROOT };

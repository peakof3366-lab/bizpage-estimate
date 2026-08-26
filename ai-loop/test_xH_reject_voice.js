/* ═══════════════════════════════════════════════════════════════════════════
   XH — 서버가 거절하는 이유를 **화면이 절반만 옮기고 있었다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-26 「고객 순서대로 훑기」(WK~XG)에서 마지막으로 남아 있던 자리다.

   ■ 🔴 세어 보니 넷이 아니라 여덟이었다

   패키지 견적서 발급(`POST /api/quote-shares?action=package`)이 내는 거절 코드는
   **여덟 개**(1회용이면 로그인 검사 둘이 더 붙는다)인데, 고객 화면(`packages.html`)의
   표에는 **넷**뿐이었다. 나머지는 전부 한 문장으로 떨어졌다 —
     「견적서를 만들지 못했습니다. 문의해 주시면 담당자가 바로 도와드립니다.」

   그중 `quote_no_failed`(503)는 **견적번호를 못 딴 것**이라 다시 누르면 되는데
   고객을 문의로 보냈다. 고객은 답을 기다리고 우리는 응대를 한 건 더 받는다 —
   **둘 다 손해다.** 반대로 `package_price_broken`(409)은 다시 눌러도 안 되는데
   같은 문장이라, 두 상황이 화면에서 구별되지 않았다.

   관리자 화면도 마찬가지였다. 표에 없는 코드는 폴백이 **영문 그대로** 찍는다
   (`quote_no_failed`). 그리고 `session_check_failed`(503)가 없어서, 계정 조회가
   잠깐 안 된 것을 담당자는 「로그인이 풀렸다」로 읽고 재로그인을 반복하게 된다 —
   `api/_lib/auth.js`가 그러지 말라고 일부러 코드를 갈라 놓은 자리다.

   ■ 이 검사가 지키는 것 — 목록을 **서버에서 뽑아** 두 화면과 대조한다

   같은 목록이 세 곳(서버·고객 화면·관리자 화면)에 흩어져 있다(결함 생성기 ①).
   그래서 여기서는 화면의 표를 세지 않고 **서버 파일에서 코드를 뽑아** 대조한다.
   새 거절 코드를 만들고 화면에 안 적으면 이 검사가 걸린다.

     ① 서버가 내는 코드를 센다(고정된 목록을 적어 두지 않는다)
     ② 두 화면이 그 코드를 **사람 말로** 옮긴다
     ③ 🔴 **다시 누르면 되는 것(5xx)과 고쳐야 되는 것(4xx)이 다른 말을 한다**
     ④ 폴백으로 보내는 코드는 **일부러 그런 것**이라고 화면에 적혀 있다
     ⑤ 그리고 실제로 그려서 눌러 본다 — 표가 진짜로 그 문장을 띄우는지
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XH 거절 이유를 사람 말로`);
  process.exit(fail ? 1 : 0);
};

const SHARES = read('api/quote-shares.js');
const AUTH = read('api/_lib/auth.js');
const PKGHTML = read('packages.html');
const ADMIN = read('admin.html');

/* 함수 하나의 본문만 잘라 낸다 — 파일 전체에서 코드를 긁으면 **다른 경로의 코드**
   (invalid_share·payload_too_large 등)까지 딸려 와 없는 결함이 생긴다. */
function bodyOf(src, header) {
  const a = src.indexOf(header);
  if (a < 0) return '';
  const b = src.indexOf('\n}\n', a);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
const ISSUE = bodyOf(SHARES, 'async function issuePackageShare');
const REQADMIN = bodyOf(AUTH, 'async function requireAdmin');

const codesIn = (src) =>
  [...new Set([...src.matchAll(/error: '([a-z_]+)'/g)].map((m) => m[1]))];
/* 코드마다 **상태 번호**를 함께 가져온다. 「일시적인가」를 우리가 따로 적으면
   그 목록이 또 하나 생긴다(결함 생성기 ①) — 서버가 붙인 5xx/4xx가 진실이다. */
const statusOf = (src, code) => {
  const m = new RegExp("status\\((\\d{3})\\)\\.json\\(\\{[^}]*error: '" + code + "'").exec(src);
  return m ? Number(m[1]) : null;
};

console.log('\n[1] 서버가 이 경로에서 내는 코드를 **센다** — 화면 표를 세지 않는다');
const ISSUE_CODES = codesIn(ISSUE);
const AUTH_CODES = /requireAdmin\(req, res\)/.test(ISSUE) ? codesIn(REQADMIN) : [];
const ALL_CODES = [...new Set([...ISSUE_CODES, ...AUTH_CODES])];
{
  ok('① 발급 함수 본문을 찾았다', ISSUE.length > 500, ISSUE.length + '자');
  ok('① 코드를 여덟 개 이상 뽑았다', ISSUE_CODES.length >= 8, ISSUE_CODES.join(','));
  /* 1회용(adhoc)은 로그인 검사를 거치므로 그 코드도 이 경로로 나간다 */
  ok('① 로그인 검사 코드도 이 경로의 것이다',
    AUTH_CODES.includes('unauthorized') && AUTH_CODES.includes('session_check_failed'),
    AUTH_CODES.join(','));
  /* 다른 경로의 코드가 섞이면 「안 옮겼다」가 거짓으로 뜬다 — 자른 자리를 확인한다 */
  ok('① 다른 경로(맞춤 견적)의 코드는 안 섞였다',
    !ISSUE_CODES.includes('invalid_share') && !ISSUE_CODES.includes('payload_too_large'),
    ISSUE_CODES.join(','));
  ALL_CODES.forEach((c) => {
    const s = statusOf(ISSUE, c) || statusOf(REQADMIN, c);
    ok('① ' + c + ' 의 상태 번호를 안다', !!s, String(s));
  });
}

/* 화면의 표를 **실제 객체로** 읽는다 — 정규식으로 「있다」만 보면 값이 무엇인지
   모르고, 두 화면의 문구가 같은지 다른지는 더더욱 못 잰다. */
function whyMap(src, anchor) {
  const at = src.indexOf(anchor);
  if (at < 0) return null;
  const start = src.lastIndexOf('why = {', at);
  const end = src.indexOf('}[', start);
  if (start < 0 || end < 0) return null;
  const lit = src.slice(start + 'why = '.length, end + 1);
  const m = /soon = ('[^']*')/.exec(src.slice(Math.max(0, start - 1200), start));
  const soon = m ? new Function('return ' + m[1])() : '';
  try { return { map: new Function('soon', 'return ' + lit)(soon), soon }; }
  catch (e) { return null; }
}
const CUST = whyMap(PKGHTML, 'package_not_available:');
const STAFF = whyMap(ADMIN, 'package_not_available:');

/* 고객에게는 일부러 폴백으로 보내는 것이 있다 — **빠뜨린 것과 갈라야 한다** */
const CUST_BY_DESIGN = ['unauthorized', 'session_check_failed'];

console.log('\n[2] 두 화면이 그 코드를 사람 말로 옮긴다');
{
  ok('② 고객 화면의 표를 읽었다', !!CUST && Object.keys(CUST.map).length >= 8,
    CUST ? Object.keys(CUST.map).length + '개' : '못 읽음');
  ok('② 관리자 화면의 표를 읽었다', !!STAFF && Object.keys(STAFF.map).length >= 9,
    STAFF ? Object.keys(STAFF.map).length + '개' : '못 읽음');
  if (CUST && STAFF) {
    const missCust = ALL_CODES.filter((c) => !CUST.map[c] && !CUST_BY_DESIGN.includes(c));
    const missStaff = ALL_CODES.filter((c) => !STAFF.map[c]);
    ok('② 고객 화면이 안 옮긴 코드가 없다', missCust.length === 0, missCust.join(','));
    ok('② 관리자 화면이 안 옮긴 코드가 없다', missStaff.length === 0, missStaff.join(','));
    /* 코드 이름이 그대로 고객에게 보이면 그건 옮긴 게 아니다 */
    ok('② 문구에 영문 코드를 그대로 쓰지 않는다',
      Object.entries(CUST.map).every(([c, t]) => !t.includes(c)));
    /* 같은 코드라도 **고칠 수 있는 사람이 다르면 문구가 달라야 한다** */
    ok('② package_price_broken은 두 화면이 다른 말을 한다',
      CUST.map.package_price_broken !== STAFF.map.package_price_broken
      && /금액/.test(CUST.map.package_price_broken)
      && /채우|저장/.test(STAFF.map.package_price_broken));
  }
}

console.log('\n[3] 🔴 다시 누르면 되는 것(5xx)과 고쳐야 되는 것(4xx)이 다른 말을 한다');
{
  const RETRY = /조금 뒤 다시/;
  if (CUST && STAFF) {
    ALL_CODES.forEach((c) => {
      const s = statusOf(ISSUE, c) || statusOf(REQADMIN, c);
      const t = CUST.map[c];
      if (!t || !s) return;
      if (s >= 500) ok('③ [고객] ' + c + '(' + s + ')은 다시 눌러 보라고 한다', RETRY.test(t), t);
      else ok('③ [고객] ' + c + '(' + s + ')은 헛되이 다시 누르라고 안 한다', !RETRY.test(t), t);
    });
    ALL_CODES.forEach((c) => {
      const s = statusOf(ISSUE, c) || statusOf(REQADMIN, c);
      const t = STAFF.map[c];
      if (!t || !s) return;
      if (s >= 500) ok('③ [관리자] ' + c + '(' + s + ')은 다시 눌러 보라고 한다', RETRY.test(t), t);
      else ok('③ [관리자] ' + c + '(' + s + ')은 헛되이 다시 누르라고 안 한다', !RETRY.test(t), t);
    });
    /* 🔴 로그인이 풀린 것(401)과 계정 조회가 잠깐 안 된 것(503)은 **다른 말**이어야
       한다. 뭉치면 담당자가 멀쩡한 세션을 두고 재로그인을 반복한다 — auth.js가
       코드를 갈라 놓은 이유가 그것이다. */
    ok('③ 관리자 화면이 「로그인 풀림」과 「확인 실패」를 가른다',
      STAFF.map.unauthorized !== STAFF.map.session_check_failed
      && !/로그인이 풀렸/.test(STAFF.map.session_check_failed || ''));
    /* 같은 말을 여러 번 적지 않는다 — 한 곳(soon)에서 온다 */
    ok('③ 다시 눌러 보라는 문장은 한 곳에서 온다',
      !!CUST.soon && RETRY.test(CUST.soon) && !!STAFF.soon && RETRY.test(STAFF.soon),
      '고객=' + (CUST.soon || '없음'));
  }
}

console.log('\n[4] 폴백으로 보내는 것은 **일부러 그런 것**이라고 적혀 있다');
{
  /* 안 적으면 다음 사람이 「빠뜨렸구나」 하고 채우거나, 진짜 빠진 것을 못 알아본다 */
  ok('④ 고객 화면이 그 판단을 남겼다', /일부러 아래 폴백으로 보낸다/.test(PKGHTML));
  ok('④ 폴백 문장은 문의로 안내한다',
    /견적서를 만들지 못했습니다\. 문의해 주시면/.test(PKGHTML));
}

console.log('\n[5] 🔴 실제로 그려서 눌러 본다 — 표가 진짜 그 문장을 띄우는가');
(async () => {
  const FIX = {
    id: 'hana-okinawa-1203', title: '오키나와 3박4일', destLabel: '오키나와',
    pricePerPerson: 1190000, nights: 3, days: 4,
    priceAsOf: new Date().toISOString().slice(0, 10), itinerary: [], included: [], excluded: [],
  };
  let nextErr = { status: 503, error: 'quote_no_failed' };
  const dom = new JSDOM(PKGHTML, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'packages.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      /* ⚠ 발급 요청은 **`quote-shares`로 가른다.** 예전에 `/action=package/`로 갈랐다가
         목록 요청(`action=packages`)까지 걸려 「상품 0건」이 나왔다 — 화면이 아니라
         검사가 틀린 것이었다. */
      w.fetch = (url) => {
        if (String(url).includes('quote-shares')) {
          return Promise.resolve({
            ok: false, status: nextErr.status,
            json: () => Promise.resolve({ error: nextErr.error }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ packages: [FIX] }) });
      };
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
    },
  });
  const w = dom.window, d = w.document;
  const tick = () => new Promise((r) => w.setTimeout(r, 0));
  await new Promise((r) => { if (d.readyState === 'complete') r(); else w.addEventListener('load', r); });
  await tick(); await tick();

  const cta = d.querySelector('#pkGrid .pk-cta');
  ok('⑤ 상품이 그려졌고 버튼이 있다', !!cta,
    (d.getElementById('pkGrid') || {}).innerHTML ? d.getElementById('pkGrid').innerHTML.slice(0, 60) : '그리드 없음');
  if (!cta) return done();
  cta.click();
  d.getElementById('pkPax').value = '4';
  d.getElementById('pkName').value = '김보균';
  d.getElementById('pkTel').value = '010-1234-5678';

  const press = async (status, error) => {
    nextErr = { status, error };
    d.getElementById('pkAsk').click();
    await tick(); await tick(); await tick();
    return d.getElementById('pkAskMsg').textContent;
  };
  const FALLBACK = '견적서를 만들지 못했습니다. 문의해 주시면 담당자가 바로 도와드립니다.';

  /* 🔴 이게 이번에 고친 자리다 — 전에는 아래 넷이 전부 폴백 한 문장이었다 */
  const tQno = await press(503, 'quote_no_failed');
  ok('⑤ quote_no_failed → 다시 눌러 보라고 한다', /조금 뒤 다시/.test(tQno) && tQno !== FALLBACK, tQno);
  const tBroken = await press(409, 'package_price_broken');
  ok('⑤ package_price_broken → 금액이 없다고 말한다',
    /금액/.test(tBroken) && !/조금 뒤 다시/.test(tBroken), tBroken);
  ok('⑤ 그리고 그 둘은 서로 다른 문장이다', tQno !== tBroken);
  const tIns = await press(500, 'insert_failed');
  ok('⑤ insert_failed → 다시 눌러 보라고 한다', /조금 뒤 다시/.test(tIns), tIns);
  const tId = await press(400, 'invalid_package_id');
  ok('⑤ invalid_package_id → 목록에서 다시 고르라고 한다', /목록/.test(tId), tId);

  /* 안 바뀐 것도 확인한다 — 고치면서 멀쩡하던 문장을 잃는 일이 이 저장소에서 실제로 있었다 */
  const tPax = await press(400, 'invalid_pax');
  ok('⑤ invalid_pax 문구는 그대로다', /인원/.test(tPax), tPax);
  const tOpen = await press(404, 'package_not_available');
  ok('⑤ package_not_available 문구는 그대로다', /판매하지 않습니다/.test(tOpen), tOpen);

  /* 일부러 폴백으로 보내는 것 — 여기서만은 폴백이 **정답**이다 */
  const tAuth = await press(401, 'unauthorized');
  ok('⑤ unauthorized는 문의로 안내한다(의도된 폴백)', tAuth === FALLBACK, tAuth);
  /* 모르는 코드가 와도 화면이 안 죽는다 */
  const tUnknown = await press(500, 'teapot_exploded');
  ok('⑤ 모르는 코드도 사람 말로 떨어진다', tUnknown === FALLBACK, tUnknown);

  /* ⚠ 거절 뒤에 **다시 누를 수 있어야** 한다 — 버튼이 잠긴 채 남으면 문구가
     무슨 말을 하든 소용이 없다(위에서 여덟 번 연달아 누른 것이 그 증거다). */
  ok('⑤ 거절 뒤에도 버튼이 다시 눌린다', d.getElementById('pkAsk').disabled === false);

  done();
})();

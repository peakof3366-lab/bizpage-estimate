/* QK 검증: 승인 대기 가입 신청이 **설정 탭에 들어가지 않아도** 보이는가.

   왜 필요한가: 가입코드를 켜 두고 계속 운영하기로 했다(직원이 앞으로도 계속 가입한다).
   그런데 대기 알림(`staff-pending-banner`)은 `staffAdminSection` 안, 즉 **설정 탭 안**에만
   있었다. 사장님이 설정에 들어가야만 기다리는 사람이 보였고, 신청한 팀원은 그동안
   로그인이 막힌 채(`pending_approval`) 기다린다 — 아무도 틀린 걸 눈치채지 못하는 종류의
   정지 상태다. 사이드바 배지는 어느 화면에 있든 보인다.

   여기서 고정하는 것:
   ① 배지가 설정 탭(staffAdminSection) **바깥**에 있다. 안에 있으면 고친 의미가 없다.
   ② 대기 건수는 배너와 **같은 staffListCache 하나**에서 나온다(결함 생성기 ① — 같은 수를
      두 곳에서 따로 세면 어긋난다). 두 값이 항상 같은지 직접 대조한다.
   ③ 목록을 못 받았을 때 **0건(=배지 없음)으로 위장하지 않는다.** 조용한 폴백은 여기서
      "기다리는 사람이 없다"는 거짓말이 된다(결함 생성기 ②). 일부러 실패시켜 확인한다.
   ④ 승인 권한이 없는 매니저·직원에게는 띄우지 않는다 — 아무도 처리할 수 없는 알림이 된다
      (승인 = account.js updateStaff = requireRole(['owner'])).

   실행: node ai-loop/test_qK_pending_signup_badge.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const staff = (n, pending) => Array.from({ length: n }, (_, i) => ({
  id: String(i + 1), username: 'u' + i, display_name: '직원' + i,
  role: 'staff', active: !(i < pending), self_signup: i < pending,
}));

(async () => {
  const dom = await bootAdmin();
  const w = dom.window;
  const d = w.document;
  const badge = d.getElementById('sb-pending-signup');
  const banner = d.getElementById('staff-pending-banner');

  console.log('\n[1] 배지가 설정 탭 바깥에 있는가 — 이게 이 수정의 전부다');
  ok('배지 요소가 존재한다', !!badge);
  ok('배지가 staffAdminSection(설정 탭) 안에 있지 않다',
    !!badge && !d.getElementById('staffAdminSection').contains(badge),
    '설정 탭 안에 있으면 들어가야만 보인다 — 고친 의미가 없다');
  ok('배지가 사이드바 설정 버튼 안에 있다',
    !!badge && badge.closest('.sidebar-item') && badge.closest('.sidebar-item').dataset.tab === 'settings');
  ok('기존 배너는 여전히 설정 탭 안에 있다(배너를 옮긴 게 아니다)',
    !!banner && d.getElementById('staffAdminSection').contains(banner));

  const shown = () => badge.style.display !== 'none' && badge.textContent !== '';

  console.log('\n[2] 관리자 — 대기 건수가 그대로 보이는가');
  w.__setUser({ id: '1', role: 'owner', displayName: '사장님' });
  w.__setStale(false);
  w.__setStaffList(staff(5, 2));
  w.renderStaffAdmin();
  ok('대기 2건이면 배지에 "2"가 뜬다', shown() && badge.textContent === '2', `표시=${badge.textContent}`);
  ok('마우스를 올리면 뜻을 말해준다', /가입 신청 2건/.test(badge.title || ''), badge.title);
  ok('배너도 같은 2건을 말한다(같은 출처)', /2건/.test(banner.textContent), banner.textContent);

  console.log('\n[3] 승인하면 줄어드는가 — 알림이 남아 있으면 매번 헛걸음한다');
  w.__setStaffList(staff(5, 0));
  w.renderStaffAdmin();
  ok('대기 0건이면 배지가 사라진다', !shown(), `표시=${JSON.stringify(badge.textContent)} display=${badge.style.display}`);
  ok('배너도 함께 사라진다', banner.classList.contains('hidden'));

  console.log('\n[4] 두 곳이 어긋나지 않는가 — 건수는 한 곳에서만 센다 (결함 생성기 ①)');
  let mismatch = null;
  for (const n of [1, 3, 7, 12]) {
    w.__setStaffList(staff(20, n));
    w.renderStaffAdmin();
    const fromBanner = (banner.textContent.match(/(\d+)건/) || [])[1];
    if (badge.textContent !== String(n) || fromBanner !== String(n)) {
      mismatch = `대기 ${n}건인데 배지=${badge.textContent} 배너=${fromBanner}`;
      break;
    }
  }
  ok('대기 1·3·7·12건에서 배지와 배너 숫자가 항상 같다', !mismatch, mismatch || '');

  console.log('\n[5] 목록을 못 받았을 때 0건으로 위장하지 않는가 (결함 생성기 ② — 일부러 실패시킨다)');
  w.__setStaffList([]);
  w.__setStale(true);
  w.renderStaffAdmin();
  ok('조회 실패면 배지가 숨지 않는다', shown(), '숨으면 "기다리는 사람 없음"이라는 거짓말이 된다');
  ok('0이 아니라 모른다는 표시(?)를 낸다', badge.textContent === '?', `표시=${badge.textContent}`);
  ok('무엇을 해야 하는지 말해준다', /불러오지 못했|확인/.test(badge.title || ''), badge.title);

  console.log('\n[6] 승인 권한이 없는 사람에게는 띄우지 않는가');
  w.__setStale(false);
  w.__setStaffList(staff(5, 3));
  for (const role of ['manager', 'staff']) {
    w.__setUser({ id: '2', role, displayName: '팀원' });
    w.renderStaffAdmin();
    ok(`${role}에게는 대기 3건이어도 배지가 없다`, !shown(), `표시=${badge.textContent}`);
  }
  /* 로그인 전에는 renderStaffAdmin을 부르지 않는다(isOwner일 때만 호출된다. 실제로
     currentUser가 null이면 기존 isMe에서 죽는다). 그래서 배지 함수만 직접 부른다 —
     이 함수는 어느 시점에 불려도 currentUser가 없으면 아무것도 띄우지 않아야 한다. */
  w.__setUser(null);
  w.updatePendingSignupBadge();
  ok('로그인 전에는 배지가 없다', !shown());

  /* ⚠ 러너(run_all_tests.js)가 찾는 요약 줄은 **'결과:'**다. '합계:'로 찍으면 파일이
     통째로 '크래시'로 집계되고 pass가 0으로 센다 — 통과한 것처럼 보이는데 아무것도
     안 세는 상태(결함 생성기 ③). 실제로 이 파일이 처음에 그렇게 새어 나갔다. */
  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* admin.html을 실제로 띄운다 — currentUser·staffListCache·staffListStale은 let 전역이라
   window에 붙지 않으므로 같은 스코프에 주입구를 심는다(test_qE와 같은 방식). */
async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setUser = u => { currentUser = u; };
  window.__setStaffList = l => { staffListCache = l; };
  window.__setStale = v => { staffListStale = v; };
  window.renderStaffAdmin = renderStaffAdmin;
  window.updatePendingSignupBadge = updatePendingSignupBadge;
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다 — 주입구를 심을 수 없습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});     // 화면 자동 로딩은 이 테스트와 무관
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise(r => setTimeout(r, 60));
  return dom;
}

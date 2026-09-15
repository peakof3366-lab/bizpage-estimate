/* ═══════════════════════════════════════════════════════════════════════════
   ZJ — 관리자 화면에서 **F5를 눌러도 보던 자리에 남는다** (2026-09-15 대표 지시)

   ■ 대표가 말한 것
   「관리자 페이지에서 어디에 있어도 새로고침 F5 버튼을 누르면 초기 화면으로 돌아온다.
     바로 그 자리에서 새로고침이 될 수 있게 세팅 부탁할게.」

   ■ 무엇이 문제였나
   이 화면은 탭 **17개**를 한 문서에서 갈아 끼우는 구조(`switchTab`)라, 새로고침하면
   늘 대시보드로 돌아갔다. 요율을 고치다 새로고침하면 처음부터 다시 찾아 들어가야 했다.
   → 지금 탭을 **주소에 남긴다**(`#tab=rates`). 새로고침은 같은 주소를 다시 여는 것이므로
     그 자리로 돌아온다.

   ■ 🔴 이 검사가 잠그는 것 넷
     ① 탭을 옮기면 주소가 따라온다 — 그런데 **`replaceState`**여야 한다. `pushState`면
        탭을 누를 때마다 히스토리가 쌓여 뒤로가기가 화면을 못 빠져나간다.
     ② 복원은 **권한을 적용한 뒤**에 일어난다. 그 전에 하면 직원이 대표 전용 탭으로
        복원된다.
     ③ **권한으로 감춘 탭은 복원하지 않는다** — 주소만 고쳐 감춘 화면을 보는 길을
        만들지 않는다. (⚠ 방어선은 서버다. 이건 편의 장치다.)
     ④ 기존 딥링크 `#quote-iti=<id>`(일정 편집기)와 **서로 안 먹는다.**

   ■ 🔴 만들면서 두 번 틀렸다 — 둘 다 여기 적어 둔다
   1. **`btn.closest('.hidden')`으로 권한 감춤을 봤다가 복원이 한 번도 안 됐다.**
      사이드바를 담은 `#dashPage`가 로그인 전 `.hidden`이라 **조상 탐색이 거기까지
      올라가** 늘 「감춰졌다」가 나왔다. → **사이드바 안쪽까지만** 올라간다.
      ⚠ 접힌 묶음은 걸리지 않는다 — 접힘은 `.sb-group.open`이지 `.hidden`이 아니다.
   2. **시험이 틀려 「없는 탭 이름」이 통과로 보였다.** 해시만 다른 같은 주소로 `goto`하면
      브라우저가 **다시 로드하지 않아** 앞 상태가 남는다. F5는 진짜 reload이므로
      확인도 `reload`로 해야 한다. → 브라우저 실측에서 그렇게 고쳐 확인했다.

   ■ 브라우저 실측 (jsdom이 아니라 진짜 크롬, 2026-09-15)
     `#tab=rates`·`ledger`·`estmgr`·`itineraries` → 넷 다 그 탭으로 복원 ✅
     없는 이름 → 기본 화면에 머묾 ✅ · 해시 없음 → 예전 그대로 ✅
     탭을 누르면 주소가 `#tab=rates`로 따라옴 ✅
     🔴 직원(staff)이 `#tab=content`로 들어오면 **막힘** ✅ / 대표(owner)는 **열림** ✅
        (대조군까지 봤다 — 늘 막는 자라면 아무것도 지키지 못한다)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

/* 주석을 걷은 판 — 경위를 적은 주석에 옛 코드가 인용돼 있어, 안 걷으면 설명 때문에
   검사가 통과하거나 실패한다(이 저장소가 여러 번 겪은 함정이다). */
const strip = (s, open, close) => {
  let out = '', i = 0;
  for (;;) {
    const a = s.indexOf(open, i);
    if (a < 0) { out += s.slice(i); break; }
    out += s.slice(i, a);
    const b = s.indexOf(close, a);
    if (b < 0) break;
    i = b + close.length;
  }
  return out;
};
const CODE = strip(strip(SRC, '<!--', '-->'), '/*', '*/');

/* 함수 한 덩이만 떼어 온다 — 역슬래시를 안 쓰려고 indexOf/slice로 자른다 */
const fnBody = (name) => {
  const a = CODE.indexOf('function ' + name + '(');
  if (a < 0) return '';
  let depth = 0, started = false;
  for (let i = a; i < CODE.length; i++) {
    const c = CODE[i];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return CODE.slice(a, i + 1); }
  }
  return '';
};

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 탭을 옮기면 **주소가 따라온다**');
const switchFn = fnBody('switchTab');
const rememberFn = fnBody('rememberTab');
ok('① switchTab을 찾았다', switchFn.length > 0);
ok('① 탭을 옮길 때 주소를 남긴다', switchFn.indexOf('rememberTab(') >= 0, switchFn.slice(0, 160));
ok('① 주소를 남기는 함수가 있다', rememberFn.length > 0);
ok('① 해시 이름은 #tab= 이다', rememberFn.indexOf("'#tab=' + name") >= 0, rememberFn);
/* 🔴 pushState면 탭을 누를 때마다 히스토리가 쌓여 뒤로가기가 화면을 못 빠져나간다 */
ok('① 🔴 replaceState를 쓴다(pushState가 아니다)',
  rememberFn.indexOf('history.replaceState') >= 0 && rememberFn.indexOf('pushState') < 0, rememberFn);
/* 주소를 못 바꾸는 환경에서도 화면은 멀쩡해야 한다 */
ok('① 주소를 못 바꿔도 화면은 계속 돈다(try로 감쌌다)', rememberFn.indexOf('try') >= 0, rememberFn);

console.log('\n[2] 새로고침하면 **주소에 적힌 탭으로 돌아간다**');
const restoreFn = fnBody('restoreTabFromHash');
ok('② 복원 함수가 있다', restoreFn.length > 0);
ok('② 해시에서 탭 이름을 읽는다', restoreFn.indexOf('location.hash') >= 0);
ok('② 사이드바 항목과 패널이 **둘 다** 있어야 연다',
  restoreFn.indexOf('.sidebar-item[data-tab=') >= 0 && restoreFn.indexOf("'tab-' + want") >= 0, restoreFn.slice(0, 260));
ok('② 없는 이름이면 조용히 기본 화면에 머문다', restoreFn.indexOf('return false') >= 0);
ok('② 찾으면 그 탭으로 옮긴다', restoreFn.indexOf('switchTab(want)') >= 0);

console.log('\n[3] 🔴 **권한을 적용한 뒤에** 복원한다 (순서가 곧 안전이다)');
/* 그 전에 복원하면 직원이 대표 전용 탭으로 열린다. 순서를 글자가 아니라 **자리**로 잰다. */
const dashFn = fnBody('showDash');
ok('③ showDash를 찾았다', dashFn.length > 0);
const iRole = dashFn.indexOf('applyRolePermissionsToUI()');
const iIti = dashFn.indexOf('aqHandleItiHash()');
const iRestore = dashFn.indexOf('restoreTabFromHash()');
ok('③ showDash가 복원을 부른다', iRestore >= 0);
ok('③ 🔴 권한 적용 **뒤**에 복원한다', iRole >= 0 && iRestore > iRole, `권한 ${iRole} / 복원 ${iRestore}`);
/* 일정 딥링크가 먼저 자기 자리를 잡는다 — 해시 모양이 달라 서로 안 먹지만 순서도 못 박는다 */
ok('③ 일정 딥링크 처리 **뒤**에 복원한다', iIti >= 0 && iRestore > iIti, `딥링크 ${iIti} / 복원 ${iRestore}`);

console.log('\n[4] 🔴 **권한으로 감춘 탭은 복원하지 않는다**');
ok('④ 감춰졌는지 본다', restoreFn.indexOf("contains('hidden')") >= 0, restoreFn.slice(-400));
/* 🔴 여기가 처음에 틀렸던 자리다 — `closest('.hidden')`은 로그인 전 `.hidden`인
   `#dashPage`까지 올라가 **복원이 한 번도 안 됐다.** 사이드바 안쪽까지만 본다. */
ok('④ 🔴 사이드바 안쪽까지만 올라간다(dashPage까지 가지 않는다)',
  restoreFn.indexOf(".closest('.sidebar-nav')") >= 0, restoreFn.slice(-400));
ok('④ 🔴 closest(.hidden)으로 통째로 훑지 않는다',
  restoreFn.indexOf(".closest('.hidden')") < 0,
  '조상 탐색이 #dashPage까지 올라가 복원이 아예 안 된다');

console.log('\n[5] 기존 일정 딥링크와 **서로 안 먹는다**');
/* 이 화면은 해시를 이미 한 가지로 쓴다 — `#quote-iti=<id>`. 이름을 붙여 갈라 둔다. */
ok('⑤ 일정 딥링크가 그대로 있다', CODE.indexOf('#quote-iti=') >= 0);
ok('⑤ 탭 해시는 #tab= 으로 이름이 붙어 있다', CODE.indexOf("'#tab=' + name") >= 0);
/* 복원 함수가 quote-iti를 건드리지 않는다 — 건드리면 딥링크가 조용히 죽는다 */
ok('⑤ 복원 함수는 일정 딥링크를 건드리지 않는다', restoreFn.indexOf('quote-iti') < 0);

console.log('\n[6] ⚠ 기본 화면은 예전 그대로다');
/* 해시가 없으면 아무 일도 하지 않는다 — 이 기능이 기존 첫 화면을 바꾸면 안 된다 */
ok('⑥ 사이드바 기본 활성은 대시보드다', SRC.indexOf('class="sidebar-item active" data-tab="dashboard"') >= 0);
ok('⑥ 기본 활성 패널도 대시보드다', SRC.indexOf('class="tab-panel active" id="tab-dashboard"') >= 0);

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — ZJ F5를 눌러도 그 자리`);
process.exit(fail ? 1 : 0);

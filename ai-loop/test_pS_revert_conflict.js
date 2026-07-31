/* PS 검증: 되돌리기가 '그 사이 남이 바꾼 값'을 말없이 덮어쓰지 않는가.

   원래 결함 —
   ① 이력 되돌리기의 확인창이 `현재 값: ${r.new_value}`를 보여줬다. 그건 '이 이력이 넣은
      값'이라, 그 뒤에 다른 변경이 있었으면 **거짓 정보**였다. 누르는 사람은 남의 변경을
      지우는 줄 알 수 없었다.
   ② 배너 되돌리기는 목적지 이름도 현재 값도 안 보여주고 "○○ 되돌릴까요?"만 물었다.
      배너는 내 브라우저 localStorage에 있어 남의 저장을 전혀 모른다.
   ⚠ 요율 '저장' 경로는 SQL 병합으로 동시 편집 유실을 막았는데(PK), 되돌리기는 값을
      명시적으로 보내므로 병합이 오히려 충실히 덮어쓴다 — 같은 결함을 한 경로에서만
      고친 상태였다. 1명일 땐 안 보이고 5명이 되면 반드시 밟는 종류다.

   ⚠ 되돌리기에는 그동안 테스트가 **하나도 없었다.** 팀원 5명이 첫날부터 의지할
   안전망인데 한 번도 실행해 본 적이 없는 코드였다(이 저장소의 반복 사고 유형).

   실행: node ai-loop/test_pS_revert_conflict.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const adminSrc = read('admin.html');

console.log('[1] 원문 대조 — 거짓 현재값이 되살아나지 않는가');
/* 이 정규식이 다시 매치되면 확인창이 또 '이력이 넣은 값'을 현재값이라고 말하는 상태다. */
ok('확인창이 r.new_value를 현재값으로 쓰지 않는다',
  !/\(현재 값: \$\{r\.new_value\}\)/.test(adminSrc));
ok('충돌 대조 헬퍼가 있다', /function rateRevertConflict\(destinationKey, field, expectedValue\)/.test(adminSrc));
ok('이력 되돌리기가 대조를 호출한다',
  /const conflict = rateRevertConflict\(r\.destination_key, r\.field, r\.new_value\)/.test(adminSrc));
ok('배너 되돌리기도 대조를 호출한다', /undoConflicts\.push/.test(adminSrc));
/* 화면 캐시로 대조하면 방금 남이 바꾼 것을 놓쳐, 안전망이 정작 막아야 할 경우를 통과시킨다. */
const revertBlock = (adminSrc.match(/async function revertRateChange[\s\S]*?\n  \}/) || [''])[0];
const undoBlock = (adminSrc.match(/async function undoLastRateAction[\s\S]*?\n  \}/) || [''])[0];
ok('이력 되돌리기가 대조 전에 서버 값을 다시 받는다', /await loadRateOverrides\(\)/.test(revertBlock));
ok('배너 되돌리기도 대조 전에 서버 값을 다시 받는다', /await loadRateOverrides\(\)/.test(undoBlock));
ok('막지 않고 알린다 (confirm으로 사람이 판단)', /if \(!confirm\(msg\)\) return;/.test(revertBlock));

/* ── jsdom 실동작 ─────────────────────────────────────────────────────
   admin.html의 인라인 스크립트에 노출기를 심는다(기존 test_p2b_admin_ui.js와 같은 방식).
   rateOverridesCache·destinationRates가 let/const라 window에 없으므로 같은 스코프에서 꺼낸다. */
function buildHtml() {
  /* ⚠ admin.html은 data.js를 <script src>로 불러온다. jsdom은 로컬 파일을 가져오지 않으므로
     그대로 두면 destinationRates가 없는 채로 돌아 "요율표가 빈 상태"를 검사하게 된다
     (처음 이 테스트를 그렇게 짜서 통과하는 것처럼 보였다). 소스를 인라인으로 바꿔 넣는다.
     PY: 같은 치환을 테스트마다 적던 것을 _jsdom_deps.js 한 곳으로 모았다 — 실제로
     p12·p2b·pJ 세 파일은 이 치환이 빠진 채였고 admin.html이 절반만 돌고 있었다. */
  let html = htmlWithDeps('admin.html');

  const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};'
    + 'window.__conflict=rateRevertConflict;'
    + 'window.__setOv=(k,v)=>{rateOverridesCache[k]=v};'
    + 'window.__eff=effectiveRate;}catch(e){}'
    + '\n;try{window.__DR=destinationRates;}catch(e){}\n';
  let injected = false;
  return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
}

(async () => {
  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously', url: 'http://localhost/admin.html',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});   /* 관리자 화면의 초기 조회를 모두 보류 */
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.alert = () => {};
      w.confirm = () => false;
    },
  });
  await new Promise((r) => setTimeout(r, 200));
  const w = dom.window;
  const conflict = w.__conflict;
  if (typeof conflict !== 'function') {
    console.log('  ✗ rateRevertConflict 로드 실패 — admin.html 스크립트 구조가 바뀐 것 같습니다');
    process.exit(1);
  }
  const DR = w.__DR;
  ok('요율표를 읽었다', Array.isArray(DR) && DR.length > 0, String(DR && DR.length));
  const key = DR[0].destination_key;
  const staticAirfare = DR[0].airfare;

  console.log('\n[2] 그 사이 변경이 없으면 — 경고를 띄우지 않는다 (소음 방지)');
  ok('오버라이드 없고 값이 같으면 충돌 아님', conflict(key, 'airfare', staticAirfare) === null);
  /* 숫자/문자열 표현 차이는 충돌이 아니다 — jsonb를 거치면 실제로 섞여 온다. */
  ok('"380000" vs 380000은 충돌 아님', conflict(key, 'airfare', String(staticAirfare)) === null,
    JSON.stringify(conflict(key, 'airfare', String(staticAirfare))));

  console.log('\n[3] 그 사이 다른 사람이 바꿨으면 — 충돌로 잡는다');
  w.__setOv(key, { airfare: staticAirfare + 20000 });   /* 남이 저장한 상태를 재현 */
  const cf = conflict(key, 'airfare', staticAirfare);
  ok('충돌을 반환한다', cf !== null, String(cf));
  ok('지금 실제 값을 알려준다', cf && cf.current === staticAirfare + 20000, cf && String(cf.current));
  ok('이력이 넣은 값도 함께 알려준다', cf && cf.expected === staticAirfare, cf && String(cf.expected));

  console.log('\n[4] 존재하지 않는 목적지 — 터지지 않고 조용히 넘어간다');
  ok('없는 목적지는 null', conflict('없는목적지_zzz', 'airfare', 1) === null);

  console.log('\n[5] 되돌린 뒤 값이 실제로 바뀌는가 (병합 방향 확인)');
  /* 되돌리기는 old_value를 다시 써넣는 것이므로, 오버라이드가 그 값으로 덮이면 성공이다.
     이 테스트는 '되돌리기가 남의 값을 덮어쓴다'는 성질 자체를 고정한다 —
     그래서 경고가 필요한 것이고, 경고 없이 조용히 덮으면 안 된다. */
  w.__setOv(key, { airfare: staticAirfare });
  ok('되돌린 값이 현재값이 되면 충돌이 해소된다', conflict(key, 'airfare', staticAirfare) === null);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

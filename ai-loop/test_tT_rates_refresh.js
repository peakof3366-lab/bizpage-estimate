/* TT 검증 — **요율 관리 탭을 열 때마다 서버 값을 다시 읽는가**

   왜 — `loadRateOverrides()`가 여태 **로그인할 때 한 번만** 불렸다. 그래서 관리자 화면을
   열어 둔 채로 요율이 바뀌면(다른 담당자가 고쳤거나, 실측 자동 반영이 돌았거나) 탭을
   다시 눌러도 **로그인 시점의 값**이 계속 보인다.

   2026-08-13에 실제로 났다. 실측 15칸을 `rate_overrides`에 반영한 뒤 사장님이
   「요율관리에 업데이트된 내용이 없는데 DB가 업데이트된 건가?」라고 물으셨다.
   확인해 보니 **DB도 API도 정상**이었다(rate_change_log 15건, /api/rates가 새 값을 내려줌).
   낡은 것은 화면뿐이었다.

   ⚠ 이 유형은 「값이 안 보인다」로 나타나서 **데이터가 안 들어간 것처럼 보인다.**
     그래서 사람이 같은 반영을 두 번 돌리게 만든다 — 조용한 실패보다 나쁠 수 있다.

   실행: node ai-loop/test_tT_rates_refresh.js  (프로젝트 루트에서) */
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

(async () => {
  /* ── [1] 배선 (소스 고정) ─────────────────────────────────────────────── */
  console.log('[1] 탭이 열릴 때 다시 읽도록 이어져 있는가');
  const src = read('admin.html');
  ok('요율 탭이 갱신 함수를 부른다',
    /name==='rates'\)\s*\{\s*renderRates\(\);\s*refreshRatesOnOpen\(\);/.test(src));
  ok('갱신 함수가 서버 값을 다시 읽는다',
    /async function refreshRatesOnOpen\(\)[\s\S]{0,200}await loadRateOverrides\(\)/.test(src));
  /* ⚠ 네트워크를 기다렸다가 그리면 탭이 빈 채로 멈춘 것처럼 보인다 */
  ok('**먼저 그리고 나서 갱신한다** (탭이 비어 보이지 않게)',
    src.indexOf("renderRates(); refreshRatesOnOpen();") > 0);

  /* ── [2] 실제로 다시 부르는가 (jsdom) ───────────────────────────────────
     ⚠ 소스만 읽어서는 이 결함이 안 걸린다. 로그인 때 한 번 부르는 코드도
       「loadRateOverrides가 있다」는 검사는 통과했다. **횟수**를 세야 한다. */
  console.log('\n[2] 탭을 열 때 /api/rates를 실제로 다시 부르는가 (jsdom)');
  let rateCalls = 0;
  const EXPOSE = '\n;try{window.__renderTab=renderTab;}catch(e){}\n';
  let injected = false;
  const html = htmlWithDeps('admin.html').replace(
    /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u) => {
        const s = String(u);
        if (s.indexOf('/api/rates') >= 0) {
          rateCalls++;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [] }) });
        }
        return new Promise(() => {});
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true; w.alert = () => {};
    },
  });
  const win = dom.window;
  await new Promise((r) => setTimeout(r, 250));

  ok('화면에 갱신 함수가 있다', typeof win.refreshRatesOnOpen === 'function' || typeof win.__renderTab === 'function');
  const before = rateCalls;
  if (typeof win.__renderTab === 'function') {
    win.__renderTab('rates');
    await new Promise((r) => setTimeout(r, 150));
  }
  ok('**요율 탭을 열면 /api/rates를 다시 부른다**', rateCalls > before,
    before + ' → ' + rateCalls);

  /* ⚠ 다른 탭에서는 부르지 않아야 한다 — 탭을 옮길 때마다 요율을 다시 받으면
     느려지기만 하고 얻는 것이 없다. */
  const beforeOther = rateCalls;
  if (typeof win.__renderTab === 'function') {
    win.__renderTab('manual');
    await new Promise((r) => setTimeout(r, 120));
  }
  ok('다른 탭에서는 안 부른다 (쓸데없이 느려지지 않게)', rateCalls === beforeOther,
    beforeOther + ' → ' + rateCalls);

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

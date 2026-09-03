/* TA 검증 — 요율 관리 화면의 긴 목록을 **접는다** (사용자 요청)

   왜 — 「📊 갱신 제안」이 13건이면 화면 한 장을 통째로 먹는다. 정작 자주 쓰는 것은
   아래의 **요율 표**인데 매번 그만큼 스크롤해야 했다. 「📏 견적 정확도」도 같다.

   ⚠ **접는 것의 유일한 위험은 「할 일이 있는지조차 모르게 되는 것」**이다.
     그래서 접혀 있어도 **머리줄에 건수가 보인다**(13건). 숫자까지 숨기면 펼쳐 보기
     전에는 아무 일도 없는 것처럼 보인다.
   ⚠ **접는 규칙은 한 클래스(`fold-card`)에만 둔다.** 카드마다 따로 적으면 하나만
     고쳐지고, 셋이 서로 다른 모양이 된다(결함 생성기 ①).
   ⚠ 데이터가 없으면 카드 자체가 숨겨지는 동작은 **그대로**다 — 접기와 숨기기는 다른
     일이다(빈 카드를 접힌 채로 두면 「눌러 봤더니 아무것도 없다」가 된다).

   실행: node ai-loop/test_tA_fold_cards.js  (프로젝트 루트에서) */
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
  /* ── [1] 구조 ───────────────────────────────────────────────────────── */
  console.log('[1] 세 카드가 같은 방식으로 접히는가');
  const src = read('admin.html');
  const FOLDS = [
    ['airfare-suggestion-card', '📊 실제 계약 데이터 기반 갱신 제안'],
    ['accuracy-stats-card', '📏 견적 정확도 (실제 대비)'],
    ['rate-history-panel', '🕘 요율 변경 이력'],
  ];
  FOLDS.forEach(([id, title]) => {
    ok(`${title} 이(가) <details>다`,
      new RegExp(`<details class="card fold-card[^"]*" id="${id}"`).test(src));
  });
  ok('접는 규칙은 한 클래스에만 있다',
    (src.match(/> summary::-webkit-details-marker \{ display: none; \}/g) || []).length === 1);
  ok('펼침/접힘 표시가 한 곳에서만 정의된다',
    (src.match(/content: '▾ 펼치기'/g) || []).length === 1);
  /* ⚠ <div>를 <details>로 바꾸면서 닫는 태그를 안 고치면 **그 아래 화면이 통째로 밀린다** */
  /* 🔴 **이 한 줄을 고치는 데 두 번 틀렸다** (YQ). 남겨 둔다 — 같은 실수를 막는다.
       ① 원래는 `/<details /`(뒤에 **공백**)로 셌다. 속성이 없는 `<details>`는 그 자를
          빠져나가 **여는 태그를 하나 덜 세고**, 멀쩡한 코드를 「짝이 안 맞는다」고 불렀다.
       ② 그래서 `[\s>]`로 넓혔더니 이번엔 **주석 안의 말**까지 셌다 —
          「접기는 `<details>`로 해서…」 같은 설명문이 태그로 세어져 11 vs 9가 됐다.
     → **주석을 걷어내고 센다.** 이 저장소가 다른 검사에서 이미 쓰는 방식이다
       (자기 주석을 읽고 없는 결함을 만든 전례가 있다).
   ⚠ **재는 자가 틀리면 고칠 것을 못 찾는다.** 자를 고쳤으면 그 자가 무엇을 세는지
     직접 눈으로 확인할 것 — 숫자만 보면 두 번 다 그럴듯해 보였다. */
  const 주석없는 = src
    .replace(/<!--[\s\S]*?-->/g, '')   /* HTML 주석 */
    .replace(/\/\*[\s\S]*?\*\//g, ''); /* 인라인 <script> 안의 JS 블록 주석 */
  const 여는수 = (주석없는.match(/<details[\s>]/g) || []).length;
  const 닫는수 = (주석없는.match(/<\/details>/g) || []).length;
  ok('여는 태그와 닫는 태그 수가 맞는다', 여는수 === 닫는수, 여는수 + ' vs ' + 닫는수);
  /* 대조군 — 0 vs 0이면 위 통과는 「아무것도 안 봤다」와 구별되지 않는다 */
  ok('(대조군) `<details>`를 실제로 찾았다', 여는수 >= 7, String(여는수));

  /* ── [2] 접혀 있어도 건수가 보이는가 (jsdom) ────────────────────────── */
  console.log('\n[2] 접혀 있어도 몇 건인지 보이는가');
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};'
      + 'window.__stubSuggest=fn=>{computeRateSuggestions=fn};'
      + 'window.__stubAcc=fn=>{computeAccuracyStats=fn};}catch(e){}\n';
    let injected = false;
    return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  })();
  const dom = new JSDOM(adminHtml, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true; w.alert = () => {};
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '사장님' });

  const sugCard = doc.getElementById('airfare-suggestion-card');
  const accCard = doc.getElementById('accuracy-stats-card');
  ok('갱신 제안이 처음에 접혀 있다', sugCard.open === false);
  ok('견적 정확도가 처음에 접혀 있다', accCard.open === false);

  /* 사장님 화면과 같은 모양 — 13건 */
  win.__stubSuggest(() => Array.from({ length: 13 }, (_, i) => ({
    destKey: '다낭', field: 'airfare', fieldLabel: '항공료', label: '다낭', count: 1,
    outlierCount: 0, excludedCount: 0, diffPct: 66.7, source: 'report',
    currentBase: 420000, suggestedBase: 700000, confident: false,
  })));
  win.renderRateSuggestions();
  ok('접힌 채로도 「13건」이 보인다',
    doc.getElementById('airfare-suggestion-count').textContent === '13건',
    doc.getElementById('airfare-suggestion-count').textContent);
  ok('여전히 접혀 있다 (그리는 것이 펼치지 않는다)', sugCard.open === false);
  ok('카드가 보인다', !sugCard.classList.contains('hidden'));

  /* 펼치면 내용이 있다 */
  sugCard.open = true;
  ok('펼치면 목록이 들어 있다',
    doc.getElementById('airfare-suggestion-list').children.length === 13,
    String(doc.getElementById('airfare-suggestion-list').children.length));

  /* 데이터가 없으면 **카드 자체를 숨긴다** — 접기와 숨기기는 다른 일이다 */
  win.__stubSuggest(() => []);
  win.renderRateSuggestions();
  ok('제안이 없으면 카드를 숨긴다', sugCard.classList.contains('hidden'));
  ok('숨길 때는 건수도 지운다', doc.getElementById('airfare-suggestion-count').textContent === '');

  /* 견적 정확도도 같은 규칙 */
  win.__stubAcc(() => [
    { destKey: '다낭', label: '다낭', field: 'airfare', fieldLabel: '항공료',
      median: 0.12, p10: 0.05, p90: 0.2, n: 3 },
    { destKey: '홍콩', label: '홍콩', field: 'hotel_per_room', fieldLabel: '호텔',
      median: -0.08, p10: -0.2, p90: 0.02, n: 2 },
  ]);
  win.renderAccuracyStats();
  ok('견적 정확도도 접힌 채로 건수가 보인다',
    doc.getElementById('accuracy-stats-count').textContent === '2건',
    doc.getElementById('accuracy-stats-count').textContent);
  ok('견적 정확도도 여전히 접혀 있다', accCard.open === false);
  ok('펼치면 표에 줄이 들어 있다',
    doc.getElementById('accuracy-stats-tbody').children.length === 2,
    String(doc.getElementById('accuracy-stats-tbody').children.length));

  /* ── [3] 요율 표는 접지 않았는가 ────────────────────────────────────── */
  console.log('\n[3] 정작 자주 쓰는 것은 안 접었는가');
  ok('요율 표는 그대로 펼쳐져 있다',
    !/(<details[^>]*>\s*)?<summary[^>]*>[\s\S]{0,200}id="rate-tbody"/.test(src)
    && /<tbody id="rate-tbody">/.test(src));
  ok('상태 배너·필터 바도 그대로다',
    /<div class="rate-status-panel">/.test(src) && /<div class="rate-filter-bar">/.test(src));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

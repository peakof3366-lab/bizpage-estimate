/* PT 검증: 변경 이력이 팀 규모에서도 되돌리기 안전망으로 남는가.

   원래 결함 —
   ① 편집창의 "이 목적지 변경 이력"이 **전역 최근 300건**을 받아 destKey로 걸렀다.
      로그가 300건을 넘으면 오래 편집된 목적지는 이력이 통째로 사라지고
      "아직 변경 이력이 없습니다"가 뜬다 — '변경이 없었다'와 구별되지 않는다.
      되돌리기는 이력에서만 되므로 **안전망이 조용히 닫힌다.**
   ② 당시 주석은 "목적지 하나당 변경 건수는 많지 않을 것으로 보고"라며 안심시켰는데,
      상한이 목적지별이 아니라 **전역**이라 그 추론이 대상을 잘못 짚었다.
      (PM의 "좁은 구간은 피크를 놓칠 뿐이라 안전"과 같은 유형의 틀린 주석.)
   ③ 목록이 상한에 닿아도 화면에 아무 안내가 없었다.

   팀원 5명이 매일 갱신하면 한 번 저장에 (바꾼 항목 수 + rateDate) 행이 쌓이고
   권역 일괄조정 한 번에 목적지×2행이 들어간다 — 300건은 몇 주면 도달한다.

   실행: node ai-loop/test_pT_history_scope.js  (프로젝트 루트에서) */
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
const ratesSrc = read(path.join('api', 'rates.js'));

console.log('[1] 서버 — 목적지별 조회가 있는가');
ok('destinationKey로 필터링한다',
  /where destination_key = \$\{historyDest\}/.test(ratesSrc));
ok('상한이 상수로 분리됐다', /const HISTORY_LIMIT = (\d+);/.test(ratesSrc));
ok('두 쿼리 모두 그 상수를 쓴다',
  (ratesSrc.match(/limit \$\{HISTORY_LIMIT\}/g) || []).length === 2,
  String((ratesSrc.match(/limit \$\{HISTORY_LIMIT\}/g) || []).length));
ok('옛 하드코딩 limit 300이 남아 있지 않다', !/order by created_at desc limit 300/.test(ratesSrc));

console.log('\n[2] 서버 상한과 화면 상한이 일치하는가 (어긋나면 잘렸는데 안 알린다)');
const serverLimit = Number((ratesSrc.match(/const HISTORY_LIMIT = (\d+);/) || [])[1]);
const clientLimit = Number((adminSrc.match(/const RATE_HISTORY_LIMIT = (\d+);/) || [])[1]);
ok('서버 상한을 읽었다', Number.isFinite(serverLimit), String(serverLimit));
ok('화면 상한을 읽었다', Number.isFinite(clientLimit), String(clientLimit));
ok('두 값이 같다', serverLimit === clientLimit, `서버 ${serverLimit} vs 화면 ${clientLimit}`);

console.log('\n[3] 화면 — 전역 목록을 걸러 쓰던 옛 경로가 사라졌는가');
const editHistBlock = (adminSrc.match(/async function renderRateEditHistory[\s\S]*?\n  \}/) || [''])[0];
ok('목적지를 서버에 넘겨 조회한다', /fetchRateHistory\(destKey\)/.test(editHistBlock));
ok('전역 목록을 destKey로 거르지 않는다',
  !/filter\(x => x\.r\.destination_key === destKey\)/.test(adminSrc));
ok('편집창은 별도 캐시를 쓴다', /rateEditHistoryCache = await fetchRateHistory\(destKey\)/.test(editHistBlock));
ok('잘림 안내 함수가 있다', /function rateHistoryTruncatedHtml/.test(adminSrc));
ok('두 화면 모두 잘림 안내를 붙인다',
  (adminSrc.match(/rateHistoryTruncatedHtml\(/g) || []).length >= 3,
  String((adminSrc.match(/rateHistoryTruncatedHtml\(/g) || []).length));

console.log('\n[4] 되돌리기가 위치가 아니라 행 id로 찾는가');
ok('버튼이 id를 넘긴다', /revertRateChange\('\$\{safeId\(String\(r\.id\)\)\}'\)/.test(adminSrc));
ok('옛 인덱스 방식이 남아 있지 않다', !/revertRateChange\(\$\{idx\}\)/.test(adminSrc));
ok('두 캐시에서 id로 찾는다',
  /\[\.\.\.rateHistoryRowsCache, \.\.\.rateEditHistoryCache\][\s\S]{0,120}String\(x\.id\) === String\(rowId\)/.test(adminSrc));

/* ── jsdom 실동작 ───────────────────────────────────────────────────── */
function buildHtml() {
  /* admin.html은 data.js를 <script src>로 불러오고 jsdom은 로컬 파일을 안 가져온다 —
     인라인으로 치환하지 않으면 요율표가 빈 채로 돌아 검사가 무의미해진다(_jsdom_deps.js). */
  let html = htmlWithDeps('admin.html');
  const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};'
    + 'window.__renderRow=renderRateHistoryRow;'
    + 'window.__trunc=rateHistoryTruncatedHtml;'
    + 'window.__LIMIT=RATE_HISTORY_LIMIT;'
    + 'window.__revert=revertRateChange;'
    + 'window.__setHist=rows=>{rateHistoryRowsCache=rows};'
    + 'window.__setEdit=rows=>{rateEditHistoryCache=rows};}catch(e){}\n';
  let injected = false;
  return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
}

const RATES_PAYLOAD = { overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {} };

(async () => {
  const confirmCalls = [];
  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously', url: 'http://localhost/admin.html',
    beforeParse(w) {
      /* 요율 조회만 응답한다 — revertRateChange가 대조 전에 loadRateOverrides()를
         기다리므로, 이게 영원히 보류되면 테스트가 멈춘다. */
      w.fetch = (url) => (String(url).startsWith('/api/rates') && !String(url).includes('history')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(RATES_PAYLOAD) })
        : new Promise(() => {}));
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.alert = () => {};
      /* false를 돌려주므로 실제 PATCH까지 가지 않는다. confirm이 불렸다는 것 자체가
         "행을 찾았다"는 증거다 — 못 찾으면 그 전에 return한다. */
      w.confirm = (msg) => { confirmCalls.push(msg); return false; };
    },
  });
  await new Promise((r) => setTimeout(r, 250));
  const w = dom.window;
  if (typeof w.__revert !== 'function' || typeof w.__renderRow !== 'function') {
    console.log('  ✗ admin.html 노출 실패 — 스크립트 구조가 바뀐 것 같습니다');
    process.exit(1);
  }
  w.__setUser({ displayName: '테스트담당', role: 'manager' });

  console.log('\n[5] 잘림 안내 — 상한에 닿았을 때만 뜨는가');
  const LIMIT = w.__LIMIT;
  ok('상한을 읽었다', LIMIT === 300, String(LIMIT));
  ok(`${LIMIT - 1}건이면 안내 없음`, w.__trunc(new Array(LIMIT - 1).fill({}), '전체') === '');
  const truncHtml = w.__trunc(new Array(LIMIT).fill({}), '이 목적지 기준');
  ok(`${LIMIT}건이면 안내가 뜬다`, /더 오래된 변경은 여기 없습니다/.test(truncHtml));
  ok('어느 범위 기준인지 밝힌다', /이 목적지 기준/.test(truncHtml), truncHtml.slice(0, 60));

  console.log('\n[6] 이력 행 렌더 — 버튼이 행 id를 가리키는가');
  const rowA = { id: '101', destination_key: '도쿄', field: 'airfare', old_value: 380000, new_value: 399000, author: '직원A', created_at: '2026-07-20T00:00:00Z' };
  const html = w.__renderRow(rowA, true);
  ok('onclick에 행 id가 들어간다', /revertRateChange\('101'\)/.test(html), (html.match(/revertRateChange\([^)]*\)/) || [''])[0]);
  ok('숫자 인덱스가 아니다', !/revertRateChange\('0'\)/.test(html));

  console.log('\n[7] 되돌리기가 두 캐시 모두에서 행을 찾는가 (핵심 회귀)');
  const rowB = { id: '202', destination_key: '방콕', field: 'hotel_per_room', old_value: 200000, new_value: 230000, author: '직원B', created_at: '2026-07-21T00:00:00Z' };
  w.__setHist([rowA]);
  w.__setEdit([rowB]);

  confirmCalls.length = 0;
  await w.__revert('101');
  ok('전체 이력 캐시의 행을 찾는다', confirmCalls.length === 1, `confirm ${confirmCalls.length}회`);
  ok('찾은 행의 항목이 문구에 나온다', /항공료/.test(confirmCalls[0] || ''), (confirmCalls[0] || '').slice(0, 60));

  confirmCalls.length = 0;
  await w.__revert('202');
  ok('편집창 캐시의 행도 찾는다 (예전엔 못 찾았다)', confirmCalls.length === 1, `confirm ${confirmCalls.length}회`);
  ok('올바른 행을 찾았다', /호텔/.test(confirmCalls[0] || ''), (confirmCalls[0] || '').slice(0, 60));

  confirmCalls.length = 0;
  await w.__revert('999');
  ok('없는 id는 아무것도 하지 않는다', confirmCalls.length === 0, `confirm ${confirmCalls.length}회`);

  console.log('\n[8] 충돌 안내가 살아 있는가 (PS 회귀)');
  confirmCalls.length = 0;
  /* 도쿄의 현재 값은 정적표 기준이고 rowA.new_value(399000)와 다르므로 충돌로 잡혀야 한다. */
  await w.__revert('101');
  const msg = confirmCalls[0] || '';
  ok('현재 값을 문구에 넣는다', /현재 값:/.test(msg), msg.slice(0, 80));
  ok('그 뒤 변경이 있으면 경고한다', /이 이력 이후에 값이 또 바뀌었습니다/.test(msg), msg.slice(0, 120));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

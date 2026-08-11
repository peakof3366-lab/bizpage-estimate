/* SZ 검증 — 요율 변경 이력을 **페이지 맨 아래에 접어 둔다** (사용자 요청)

   왜 — 이 목록은 「지금 무엇을 해야 하나」가 아니라 「무엇을 했었나」다. 위에 있으면
   매번 스크롤을 잡아먹으면서 정작 볼 일은 드물다. 필요할 때 펼친다.

   ⚠ 예전에는 필터 바의 「🕘 변경 이력」 버튼 → **모달**이었다. 옮기면서 **두 곳에 두지
     않는다** — 같은 목록이 두 자리에 있으면 한쪽만 고쳐진다(결함 생성기 ①).
   ⚠ **펼칠 때 처음 한 번만 불러온다.** 요율 관리 탭을 열 때마다 최근 300건을 받아오면
     정작 자주 쓰는 표가 느려진다.
   ⚠ 요율을 저장하거나 되돌리면 **다음에 펼칠 때 새로 받아야** 한다. 안 그러면 방금 한
     변경이 이력에 없어서 「안 남았나?」로 읽힌다.
   ⚠ 조회에 실패하면 **다시 시도할 수 있어야** 한다. 실패한 채로 '불러왔다'고 표시하면
     접었다 펴도 계속 빈 채로 남는다(조용한 폴백 — 결함 생성기 ②).

   실행: node ai-loop/test_sZ_rate_history_panel.js  (프로젝트 루트에서) */
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

const HISTORY = [
  { id: 1, destination_key: '도쿄', field: 'airfare', old_value: '380000', new_value: '399000',
    author: '김실무', created_at: '2026-08-10T02:00:00Z' },
  { id: 2, destination_key: '오키나와', field: 'meal_per_person', old_value: '25000', new_value: '50000',
    author: 'admin', created_at: '2026-08-04T05:00:00Z' },
];

(async () => {
  /* ── [1] 구조 — 두 곳에 두지 않았는가 ──────────────────────────────── */
  console.log('[1] 모달에서 꺼내 한 곳으로 옮겼는가');
  const src = read('admin.html');
  ok('모달 마크업이 없어졌다', !/id="rateHistoryModal"/.test(src));
  ok('모달을 여는 함수도 없어졌다', !/openRateHistoryModal/.test(src));
  ok('필터 바의 「🕘 변경 이력」 버튼이 없어졌다',
    !/onclick="openRateHistoryModal\(\)"/.test(src));
  ok('접히는 섹션으로 들어갔다', /<details class="card rate-history-panel" id="rate-history-panel"/.test(src));
  ok('목록 자리는 하나뿐이다', (src.match(/id="rate-history-list"/g) || []).length === 1,
    String((src.match(/id="rate-history-list"/g) || []).length));
  /* **맨 아래**여야 한다 — 요율 표와 갱신 방법 안내보다 뒤 */
  ok('요율 표보다 아래에 있다', src.indexOf('id="rate-tbody"') < src.indexOf('id="rate-history-panel"'));
  ok('「요율 갱신 방법」 안내보다도 아래에 있다',
    src.indexOf('요율 갱신 방법') < src.indexOf('id="rate-history-panel"'));
  ok('브라우저 기본 삼각형을 지우고 펼침/접힘 표시를 둔다',
    /\.rate-history-panel > summary::after \{ content: '▾ 펼치기'/.test(src)
    && /\.rate-history-panel\[open\] > summary::after \{ content: '▴ 접기'/.test(src));

  /* ── [2] 동작 (jsdom) ──────────────────────────────────────────────── */
  console.log('\n[2] 펼칠 때만 불러오는가');
  let fetchCount = 0; let failNext = false;
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};'
      + 'window.__histLoaded=()=>rateHistoryLoaded;window.__resetHist=()=>{rateHistoryLoaded=false};}catch(e){}\n';
    let injected = false;
    return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  })();
  const dom = new JSDOM(adminHtml, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u) => {
        const s = String(u);
        if (s.includes('history=1')) {
          fetchCount++;
          if (failNext) return Promise.resolve({ ok: false, json: () => Promise.reject(new Error('boom')) });
          return Promise.resolve({ ok: true, json: () => Promise.resolve(HISTORY) });
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
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '사장님' });

  const panel = doc.getElementById('rate-history-panel');
  const list = doc.getElementById('rate-history-list');
  ok('처음에는 접혀 있다', panel.open === false);
  ok('접혀 있는 동안에는 부르지 않는다', fetchCount === 0, String(fetchCount));
  ok('무엇인지 눌러 보기 전에 알 수 있다',
    /누가 언제 무엇을 바꿨는지/.test(doc.getElementById('rate-history-hint').textContent));

  /* 펼친다 */
  panel.open = true;
  panel.dispatchEvent(new win.Event('toggle'));
  await new Promise((r) => setTimeout(r, 30));
  ok('펼치면 그때 불러온다', fetchCount === 1, String(fetchCount));
  ok('내용이 그려진다', /도쿄/.test(list.innerHTML) && /399000/.test(list.innerHTML));
  ok('누가 언제 바꿨는지 나온다', /김실무/.test(list.innerHTML));
  ok('되돌리기 버튼이 있다', /revertRateChange/.test(list.innerHTML));

  /* 접었다 다시 펼쳐도 또 부르지 않는다 */
  panel.open = false; panel.dispatchEvent(new win.Event('toggle'));
  panel.open = true; panel.dispatchEvent(new win.Event('toggle'));
  await new Promise((r) => setTimeout(r, 30));
  ok('**다시 펼쳐도 또 부르지 않는다** (표가 느려지지 않게)', fetchCount === 1, String(fetchCount));

  /* ── [3] 요율이 바뀌면 다음에 새로 받는가 ──────────────────────────── */
  console.log('\n[3] 요율이 바뀌면 다음에 새로 받는가');
  ok('지금은 불러온 상태다', win.__histLoaded() === true);
  win.__resetHist();                                   /* 요율 저장·되돌리기가 하는 일 */
  panel.open = false; panel.dispatchEvent(new win.Event('toggle'));
  panel.open = true; panel.dispatchEvent(new win.Event('toggle'));
  await new Promise((r) => setTimeout(r, 30));
  ok('바뀐 뒤에는 다시 받는다 (방금 한 변경이 보여야 한다)', fetchCount === 2, String(fetchCount));
  ok('요율을 저장하는 자리마다 표시를 내린다',
    (src.match(/rateHistoryLoaded = false;/g) || []).length >= 6,
    String((src.match(/rateHistoryLoaded = false;/g) || []).length));

  /* ── [4] 실패하면 다시 시도할 수 있는가 ────────────────────────────── */
  console.log('\n[4] 실패해도 다시 시도할 수 있는가');
  win.__resetHist(); failNext = true;
  panel.open = false; panel.dispatchEvent(new win.Event('toggle'));
  panel.open = true; panel.dispatchEvent(new win.Event('toggle'));
  await new Promise((r) => setTimeout(r, 30));
  ok('실패를 화면이 말한다', /조회에 실패했습니다/.test(list.innerHTML));
  ok('**실패를 「불러왔다」로 기록하지 않는다**', win.__histLoaded() === false);
  ok('다시 시도하라고 알려 준다', /접었다 다시 펼치면 재시도/.test(list.innerHTML));

  failNext = false;
  panel.open = false; panel.dispatchEvent(new win.Event('toggle'));
  panel.open = true; panel.dispatchEvent(new win.Event('toggle'));
  await new Promise((r) => setTimeout(r, 30));
  ok('접었다 펴면 실제로 다시 받는다', /도쿄/.test(list.innerHTML));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

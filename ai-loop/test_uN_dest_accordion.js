/* UN 검증: 내부 견적 산출 — 목적지 지역은 한 번에 하나만 펼쳐진다.

   대표 요청(2026-08-19): 「목적지 섹션에서 다른 지역을 선택하면 기존에 선택해서
   열려 있는 창은 닫아 달라」.

   예전에는 열어 본 지역이 전부 열린 채 쌓였다. 지역 19개 · 목적지 55곳이라, 두세 곳을
   훑고 나면 다음 지역을 고르려고 앞서 펼친 목록을 한참 스크롤해야 했다.

   ⚠ 이 검사의 핵심은 배타 동작 자체가 아니라 **검색을 망가뜨리지 않았는가**다.
     검색은 조건에 맞는 그룹을 *여러 개* 펼치는 것이 정상 동작이다. 배타 규칙을
     toggle 이벤트로 붙이면(비동기라 '누가 열었는지'를 못 가린다) 검색이 편 그룹을
     도로 닫아 검색이 통째로 쓸모없어진다 — 그래서 summary의 click을 듣는다.
     [3]이 그 회귀를 잡는 자리다.

   실행: node ai-loop/test_uN_dest_accordion.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

function boot() {
  const dom = new JSDOM(read('admin-quote.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u) => {
        if (String(u).includes('account?action=me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '홍길동', role: 'staff' }) });
        }
        return new Promise(() => {});
      };
      w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
      w.Element.prototype.scrollIntoView = function () {};
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.alert = () => {}; w.confirm = () => true;
    },
  });
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js');
  try { dom.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  return { dom, w: dom.window, d: dom.window.document };
}

/* 사람이 지역 머리글을 누르는 것과 같은 경로 — jsdom이 details 기본 동작을 구현하므로
   .open을 직접 건드리지 않는다. 직접 건드리면 우리가 붙인 리스너를 지나치게 되고,
   그러면 이 테스트는 아무것도 검사하지 못한다(결함 생성기 ③). */
const clickHeader = (w, group) =>
  group.querySelector('summary').dispatchEvent(
    new w.MouseEvent('click', { bubbles: true, cancelable: true }));

const openNames = (groups) => groups.filter((g) => g.open)
  .map((g) => g.querySelector('summary span').textContent);

(async () => {
  const { dom, w, d } = boot();
  await new Promise((r) => setTimeout(r, 250));

  console.log('\n[1] 전제 — 지역 아코디언이 그려진다');
  const groups = Array.from(d.querySelectorAll('#destAccordion .aq-accordion-group'));
  ok('지역 그룹이 여러 개 있다 (배타 규칙이 의미를 갖는 전제)',
    groups.length >= 5, String(groups.length));
  ok('처음에는 전부 접혀 있다', groups.every((g) => !g.open),
    JSON.stringify(openNames(groups)));

  console.log('\n[2] 다른 지역을 누르면 앞서 열린 지역이 닫힌다');
  clickHeader(w, groups[0]);
  ok('첫 지역이 열린다', groups[0].open);

  clickHeader(w, groups[1]);
  ok('**두 번째 지역을 누르면 첫 지역이 닫힌다**', !groups[0].open);
  ok('두 번째 지역은 열려 있다', groups[1].open);
  ok('열린 지역은 언제나 하나뿐이다', openNames(groups).length === 1,
    JSON.stringify(openNames(groups)));

  clickHeader(w, groups[4]);
  ok('세 번째로 눌러도 하나만 남는다',
    openNames(groups).length === 1 && groups[4].open, JSON.stringify(openNames(groups)));

  console.log('\n[3] 검색은 그대로 여러 지역을 펼친다 (배타 규칙이 망가뜨리지 않았다)');
  const search = d.getElementById('destSearch');
  /* '도'는 도쿄·삿포로·홍콩… 여러 지역에 걸린다 — 한 그룹에만 걸리면 이 검사가 무의미하다. */
  search.value = '도';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  /* ⚠ 「보이는 그룹」으로 좁힌다. 검색은 조건에 안 맞는 그룹을 aq-group-hidden으로
     감출 뿐 open을 되돌리지는 않아서, 검색 전에 펴 둔 그룹은 open인 채 남는다.
     화면에서는 안 보이므로 문제가 아니지만(검색을 비우면 전부 접힌다 — [5]),
     여기서 세면 「검색이 편 그룹」과 섞여 검사가 엉뚱한 것을 본다. */
  const visibleOpen = () => groups.filter((g) => g.open && !g.classList.contains('aq-group-hidden'));
  const searchOpen = visibleOpen();
  ok('검색이 **여러** 지역을 동시에 펼친다 (배타 규칙에 안 걸린다)',
    searchOpen.length >= 2,
    JSON.stringify(searchOpen.map((g) => g.querySelector('summary span').textContent)));
  ok('펼쳐진 그룹에는 실제로 일치하는 항목이 있다',
    searchOpen.every((g) =>
      Array.from(g.querySelectorAll('.aq-list-row'))
        .some((r) => !r.classList.contains('aq-row-hidden'))));

  console.log('\n[4] 검색으로 여러 개가 열린 상태에서 접기를 눌러도 남의 창은 안 닫는다');
  const openedBySearch = searchOpen;
  const survivor = openedBySearch[1];
  clickHeader(w, openedBySearch[0]);   /* 이미 열린 것 → 이 클릭은 '접기'다 */
  ok('누른 지역만 접힌다', !openedBySearch[0].open);
  ok('**다른 지역은 그대로 열려 있다** (접기 클릭이 남을 건드리지 않는다)', survivor.open);

  console.log('\n[5] 기존 동작이 그대로인가');
  search.value = '';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  ok('검색을 비우면 전부 접힌다', groups.every((g) => !g.open),
    JSON.stringify(openNames(groups)));

  const master = d.getElementById('destMaster');
  master.open = true;
  clickHeader(w, groups[0]);
  const row = groups[0].querySelector('.aq-list-row input[type="radio"]');
  row.checked = true;
  row.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok('목적지를 고르면 선택창 전체가 접힌다 (선택 즉시 한 줄로 정리)', !master.open);
  ok('고른 목적지가 실제 select에 들어간다',
    !!d.getElementById('destination').value, d.getElementById('destination').value);

  dom.window.close();
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

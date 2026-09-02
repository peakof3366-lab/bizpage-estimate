/* ═══════════════════════════════════════════════════════════════════════════
   WH — 목록에서 **「팔 준비가 됐는가」**가 보인다
   ───────────────────────────────────────────────────────────────────────────
   2026-08-25 대표: 「패키지 상품 페이지에서 **내용 확인이 너무 어렵다.**」

   열어 보니 **확인할 내용이 아직 없었다.** 엑셀 투입(VY·VZ)이 채우는 것은
   이름·지역·기간·1인 금액·사진 다섯뿐이고 — `import_packages_sheet.js`가 만드는
   행에 `itinerary`·`included`·`excluded`가 아예 없다 — **일정·포함/불포함은 비어 있다**
   (하나투어가 그 자료를 안 준다. 그래서 WA에서 상세 PDF로 채우는 길을 만들었다).

   🔴 문제는 「비어 있다」가 아니라 **그걸 알려면 31건을 하나씩 열어 봐야 했다**는 것이다.
     훑는 일이 열어 보는 일이 되면, 30건짜리 목록은 확인이 불가능해진다.

   이 검사가 지키는 것 넷 — 전부 jsdom에서 **실제로 그려 본다**:
     ① 목록이 **빠진 칸을 그 자리에서** 말한다 (열지 않고 훑을 수 있다)
     ② 목록 전체의 모양을 **스크롤 전에** 한 줄로 말한다
     ③ 「채움」으로 거를 수 있고, **비었을 때 그 이유를 거른 조건에 맞춰** 말한다
     ④ 덜 채워진 채로 「판매중」이 되는 것을 편집 칸이 미리 말한다 — 막지는 않는다

   ⚠ 소규모 견적에는 안 붙인다. 그쪽은 일정·포함사항이 없는 게 **정상**이라,
     같은 표시를 붙이면 늘 켜져 있고 그러면 아무도 안 본다(VS의 낡은 배지와 같은 교훈).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WH 패키지 상품 「팔 준비」 표시`);
  process.exit(fail ? 1 : 0);
};

/* 실측 그대로: 엑셀로 들여온 상품은 일정·포함사항이 없고, PDF로 채운 것만 있다 */
const FIX = [
  { id: 'hana-oka-1', kind: 'catalog', title: '오키나와 3박4일', status: 'draft',
    pricePerPerson: 1190000, nights: 3, days: 4, destLabel: '오키나와',
    imageUrl: 'https://img.example.com/a.jpg', priceAsOf: '2026-08-24',
    itinerary: null, included: null, excluded: null },              /* 엑셀 투입분 */
  { id: 'hana-sai-2', kind: 'catalog', title: '사이판 4박5일', status: 'draft',
    pricePerPerson: 1590000, nights: 4, days: 5, destLabel: '사이판',
    imageUrl: null, priceAsOf: '2026-08-24',
    itinerary: null, included: null, excluded: null },              /* 사진도 없다 */
  { id: 'hana-dan-3', kind: 'catalog', title: '다낭 4박5일', status: 'open',
    pricePerPerson: 1290000, nights: 4, days: 5, destLabel: '다낭',
    imageUrl: 'https://img.example.com/c.jpg', priceAsOf: '2026-08-24',
    itinerary: [{ title: '인천 출발' }, { title: '시내 관광' }],
    included: ['왕복 항공권', '호텔 4박'], excluded: ['개인 경비'] }, /* PDF로 채운 것 */
  { id: 'adhoc-260825-ab12', kind: 'adhoc', title: '김보균님 가족 오사카', status: 'draft',
    pricePerPerson: 890000, customerLabel: '김보균님 4명', destLabel: '오사카',
    priceAsOf: '2026-08-25', itinerary: null, included: null },
];

const dom = new JSDOM(ADMIN, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    w.Element.prototype.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
  },
});
const w = dom.window, d = w.document;
const draw = () => w.eval('pkgAll = ' + JSON.stringify(FIX) + '; pkgDrawList();');
const rowsIn = (id) => Array.from(d.querySelectorAll('#' + id + ' .pkg-row'));
const setSel = (id, v) => {
  const el = d.getElementById(id);
  el.value = v;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};

function run() {
  console.log('\n[0] 스크립트가 살아 있는가');
  if (typeof w.switchTab !== 'function') {
    fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 아래는 의미가 없다'); return done();
  }
  ok('⓪ 살아 있다', true);
  draw();

  console.log('\n[1] 목록이 빠진 칸을 그 자리에서 말한다 — 열지 않고 훑는다');
  {
    const rows = rowsIn('pkgList');
    ok('① 상품 3건이 그려졌다', rows.length === 3, '실제 ' + rows.length);
    const t = (i) => rows[i].textContent;
    ok('① 엑셀 투입분에 「일정 없음」·「포함사항 없음」',
      t(0).includes('일정 없음') && t(0).includes('포함사항 없음'));
    ok('① 사진까지 없는 건 「사진 없음」도 함께', t(1).includes('사진 없음'));
    ok('① 사진이 있는 건에는 「사진 없음」이 안 붙는다', !t(0).includes('사진 없음'));
    ok('① 다 채운 건은 「✓ 팔 준비됨」', t(2).includes('팔 준비됨')
      && !t(2).includes('일정 없음'));
    /* ⚠ 결함처럼 빨갛게 쓰지 않는다 — 아직 안 채운 것이지 고장이 아니다 */
    ok('① 「없음」과 「준비됨」을 눈으로 가른다',
      !!rows[0].querySelector('.pkg-gap') && !!rows[2].querySelector('.pkg-gap.is-ok'));
  }

  console.log('\n[2] 🔴 소규모 견적에는 안 붙인다 — 없는 게 정상이라 늘 켜지면 아무도 안 본다');
  {
    const a = rowsIn('adhocList');
    ok('② 소규모 1건이 그려졌다', a.length === 1);
    ok('② 「일정 없음」이 안 붙는다',
      !a[0].textContent.includes('일정 없음') && !a[0].textContent.includes('포함사항 없음'));
    ok('② 「팔 준비됨」도 안 붙는다', !a[0].textContent.includes('팔 준비됨'));
  }

  console.log('\n[3] 목록 전체의 모양을 스크롤 전에 한 줄로 말한다');
  {
    const shape = d.getElementById('pkgShape');
    ok('③ 요약 줄이 보인다', !!shape && !shape.classList.contains('hidden'));
    const s = shape.textContent;
    ok('③ 상품 3건 · 팔 준비된 것 1건', s.includes('3건') && s.includes('1건'), s.slice(0, 80));
    ok('③ 일정이 없는 것 2건을 센다', s.includes('일정이 없는 것 2건'), s.slice(0, 120));
    /* 🔴 **왜 비었는지**를 함께 말한다 — 안 그러면 「투입이 실패했나」로 읽는다.
       그리고 **어떻게 채우는지**까지 말해야 한다. 예전 문구는 「하나투어가 자료를 주지
       않아 상세 PDF로 채웁니다」였는데, WL(2026-08-26)에서 **상품 주소로 일정·포함·
       불포함이 다 온다**는 것이 확인된 뒤에도 안 고쳐져 있었다(YG). 빈 상품을 채우려는
       담당자를 **더 어려운 PDF 길로** 보내고 있던 것이다.
     ⚠ 여기서 문구를 통째로 박지 않는다 — 「주소로 온다」와 「PDF는 대안」이라는 **뜻**만
       잠근다. 문장을 그대로 잠그면 다음에 문구를 다듬을 때 또 여기서 걸린다. */
    ok('③ 왜 비어 있는지를 말한다', s.includes('엑셀로 들여온 상품'), s.slice(0, 120));
    ok('③ 주소로 채우는 길을 먼저 말한다',
      s.includes('주소') && s.indexOf('주소') < s.indexOf('PDF'), s.slice(0, 160));
    ok('③ PDF도 길로 남겨 둔다', s.includes('PDF'));
    /* 소규모 견적은 이 셈에서 빠진다 */
    ok('③ 소규모 견적을 상품 수에 안 섞는다', !s.includes('4건'));
  }

  console.log('\n[4] 「채움」으로 거를 수 있다 — 그리고 비면 그 이유를 맞게 말한다');
  {
    setSel('pkgFilterGap', 'gap');
    ok('④ 덜 채워진 것만 2건', rowsIn('pkgList').length === 2);
    setSel('pkgFilterGap', 'ready');
    ok('④ 팔 준비된 것만 1건', rowsIn('pkgList').length === 1);
    /* ⚠ 채움 필터로 비었는데 「그 상태의 상품이 없습니다」라고 하면 담당자는
       상태를 들여다보며 헤맨다 — 거른 조건에 맞춰 말해야 한다 */
    w.eval('pkgAll = ' + JSON.stringify([FIX[0], FIX[1]]) + '; pkgDrawList();');
    ok('④ 팔 준비된 것이 없으면 그렇게 말한다',
      d.getElementById('pkgList').textContent.includes('팔 준비가 된 상품이 아직 없습니다'));
    setSel('pkgFilterGap', 'gap');
    w.eval('pkgAll = ' + JSON.stringify([FIX[2]]) + '; pkgDrawList();');
    ok('④ 덜 채워진 것이 없으면 그렇게 말한다',
      d.getElementById('pkgList').textContent.includes('전부 팔 준비가 됐습니다'));
    setSel('pkgFilterGap', '');
    draw();
    ok('④ 필터를 풀면 3건으로 돌아온다', rowsIn('pkgList').length === 3);
    /* 소규모 목록은 채움 필터에 흔들리지 않는다 */
    setSel('pkgFilterGap', 'ready');
    ok('④ 소규모 목록은 그대로 1건', rowsIn('adhocList').length === 1);
    setSel('pkgFilterGap', '');
  }

  console.log('\n[5] 덜 채워진 채로 「판매중」이 되는 것을 편집 칸이 미리 말한다');
  {
    rowsIn('pkgList')[0].click();                       /* 엑셀 투입분 — 일정·포함 없음 */
    const gn = d.getElementById('pkgGapNote');
    ok('⑤ 안내가 뜬다', !!gn && !gn.classList.contains('hidden'));
    ok('⑤ 무엇이 비었는지 이름을 댄다',
      gn.textContent.includes('일정') && gn.textContent.includes('포함사항'));
    /* 🔴 **무슨 일이 벌어지는지**를 말한다 — 「비어 있습니다」만으로는 안 움직인다 */
    ok('⑤ 고객 화면에 그 칸이 안 나온다고 말한다', gn.textContent.includes('안 나오고'));
    ok('⑤ 채우는 길을 알려준다', gn.textContent.includes('PDF에서 불러오기'));

    /* ⚠ **막지는 않는다.** 일정 없이 파는 상품도 있을 수 있고 그 판단은 대표 몫이다 */
    ok('⑤ 저장·상태 바꾸기를 막지 않는다',
      !d.getElementById('pkgSave').disabled && !d.getElementById('pkgStatus').disabled);

    /* 채우면 **그 자리에서** 사라져야 한다 — 안 사라지면 채웠는데도 못 채운 줄 안다 */
    const iti = d.getElementById('pkgIti');
    iti.value = '인천 출발 · 나하 도착 | 오전 집결\n북부 관광 | 츄라우미 수족관';
    iti.dispatchEvent(new w.Event('input', { bubbles: true }));
    ok('⑤ 일정을 채워도 포함사항이 남아 안내가 유지된다',
      !gn.classList.contains('hidden') && !gn.textContent.includes('일정 ·'));
    const incl = d.getElementById('pkgIncl');
    incl.value = '왕복 항공권\n호텔 3박';
    incl.dispatchEvent(new w.Event('input', { bubbles: true }));
    ok('⑤ 둘 다 채우면 안내가 사라진다', gn.classList.contains('hidden'));

    /* 소규모 견적에는 이 안내가 안 뜬다 */
    rowsIn('adhocList')[0].click();
    ok('⑤ 소규모 견적에는 안 뜬다', d.getElementById('pkgGapNote').classList.contains('hidden'));
  }

  console.log('\n[6] 사진은 「팔 준비」의 조건이 아니다');
  {
    /* 사진 없이도 카드가 그려진다(VZ) — 사진까지 필수로 하면 팔 수 있는 상품이
       「준비 안 됨」으로 묶여 진짜 빈 상품과 구분이 안 된다 */
    ok('⑥ 사진 없는 상품도 「팔 준비」 판정에 안 걸린다',
      w.eval('pkgSellable({itinerary:[{}],included:["a"],imageUrl:null})') === true);
    ok('⑥ 일정이 없으면 걸린다',
      w.eval('pkgSellable({itinerary:null,included:["a"],imageUrl:"https://x/y.jpg"})') === false);
  }

  done();
}

if (d.readyState === 'complete') run();
else w.addEventListener('load', () => { try { run(); } catch (e) {
  fail++; console.log('  ✗ 검사가 도중에 죽었다 → ' + (e && e.stack || e)); done();
} });

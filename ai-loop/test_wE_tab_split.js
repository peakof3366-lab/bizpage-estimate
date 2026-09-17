/* ═══════════════════════════════════════════════════════════════════════════
   WE — 「패키지 상품」과 「소규모 견적」을 다른 메뉴로 가른다: **실제로 눌러 본다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-25 대표: 「구조를 다른 팀원들이 최적화된 상태로 사용할 수 있게 환경 구성을
   다시 해야 할 것 같다. 지금 이 탭을 내가 어떻게 써야 할지를 모르겠다.」
   그리고 그 자리에서 갈리는 축을 확인해 주셨다 —
     「견적서를 취합해서 올리는 사람은 다른 사람이고,
       견적서를 만들어 고객들에게 제공하는 사람은 내부 직원들이다.」

   🔴 **한 화면이 서로 다른 세 사람의 일을 받고 있었다.** 상품을 고르는 사람(대표) ·
     상품을 채우는 사람 · 손님께 견적을 내는 사람이 같은 31줄 목록과 같은 20칸 폼을
     봤다. 묶은 기준이 「일」이 아니라 「packages 테이블을 쓴다」였다.

   ⚠ 그중에서도 시간이 갈수록 나빠지는 것이 목록이다 — **소규모 견적은 손님 수만큼
     늘어난다.** 지금은 31건이 전부 상품이라 안 보이지만, 상담이 쌓이면 상품이 파묻힌다.

   이 검사가 지키는 것은 넷이다. 전부 **jsdom에서 실제로 눌러** 확인한다
   (소스에 문자열이 있는지만 보면 「늘 통과하는 검사」가 된다 — 결함 생성기 ③):
     ① 두 메뉴가 각자 배선돼 있다
     ② 편집 카드는 **한 벌뿐**이다 — 두 벌이 되면 한쪽만 고쳐진다(결함 생성기 ①)
     ③ 두 목록이 서로의 종류를 안 보여준다
     ④ 안 쓰는 칸은 감추되 **값은 안 지운다** — 감춘 것과 막은 것은 다르다(VS)

   ⚠ VU가 밟은 함정을 그대로 밟지 않는다: data.js를 안 실으면 admin의 top-level이
     죽어 **DOMContentLoaded가 통째로 안 붙고**, 그 상태로 재면 전부 기본값이라
     통과로 보인다. [0]에서 먼저 확인하고 아니면 즉시 멈춘다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { adminSource } = require('./_admin_source');

const ROOT = path.join(__dirname, '..');
const html = adminSource();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WE 패키지/소규모 탭 분리`);
  process.exit(fail ? 1 : 0);
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    /* ⚠ jsdom에는 Element.scrollTo가 없다 — switchTab 마지막 줄이 그것을 부른다.
       안 넣으면 탭 전환이 **거기서 죽고**, 아래 검사가 통째로 안 돌면서도
       「실패」가 아니라 **조용히 끝난다**(결함 생성기 ③가 검사 자체에 재현된다). */
    w.Element.prototype.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
  },
});

const w = dom.window, d = w.document;
const hidden = (id) => d.getElementById(id).classList.contains('hidden');
/* label은 칸을 감싸는 요소다 — 입력의 조상 중 [data-pkg-only]를 찾아 본다 */
const fieldHidden = (inputId) => {
  const el = d.getElementById(inputId);
  const box = el && el.closest('[data-pkg-only]');
  return !!box && box.classList.contains('hidden');
};

/* 목록 두 벌에 넣을 가짜 자료 — catalog 2건(하나는 사진 없음) + adhoc 2건 */
const FIXTURE = [
  { id: 'hana-okinawa-1203', kind: 'catalog', title: '오키나와 3박4일', status: 'draft',
    pricePerPerson: 1190000, nights: 3, days: 4, destLabel: '오키나와',
    imageUrl: 'https://image.example.com/oka.jpg', priceAsOf: '2026-08-24' },
  { id: 'hana-saipan-0110', kind: 'catalog', title: '사이판 4박5일', status: 'open',
    pricePerPerson: 1590000, nights: 4, days: 5, destLabel: '사이판',
    imageUrl: null, priceAsOf: '2026-08-24' },
  { id: 'adhoc-260825-ab12', kind: 'adhoc', title: '김보균님 가족 오사카', status: 'draft',
    pricePerPerson: 890000, customerLabel: '김보균님 4명', destLabel: '오사카',
    priceAsOf: '2026-08-25' },
  { id: 'adhoc-260825-cd34', kind: 'adhoc', title: '○○교회 보홀', status: 'open',
    pricePerPerson: 1240000, customerLabel: '○○교회 20명', destLabel: '보홀',
    priceAsOf: '2026-08-25' },
];

function run() {
  console.log('\n[0] 🔴 스크립트가 살아 있는가 — 이걸 먼저 안 보면 기본값을 읽는다');
  if (typeof w.switchTab !== 'function') {
    fail++;
    console.log('  ✗ 관리자 스크립트가 죽었다 — 아래 검사는 의미가 없어 여기서 멈춘다');
    return done();
  }
  ok('⓪ 관리자 스크립트가 살아 있다(data.js가 실렸다)', true);

  console.log('\n[1] 메뉴가 둘로 갈렸다 — 버튼·패널·배선이 각자 있다');
  ok('① 사이드바에 「패키지 상품」', !!d.querySelector('.sidebar-item[data-tab="packages"]'));
  ok('① 사이드바에 「소규모 견적」', !!d.querySelector('.sidebar-item[data-tab="adhoc"]'));
  ok('① 패널 tab-packages', !!d.getElementById('tab-packages'));
  ok('① 패널 tab-adhoc', !!d.getElementById('tab-adhoc'));
  /* ⚠ 버튼만 있고 renderTab에 안 걸리면 눌러도 아무 일이 없다(결함 생성기 ③).
     소스가 아니라 **실제로 눌러** 패널이 켜지는지 본다. */
  w.switchTab('adhoc');
  ok('① 「소규모 견적」을 누르면 그 패널이 켜진다',
    d.getElementById('tab-adhoc').classList.contains('active')
    && !d.getElementById('tab-packages').classList.contains('active'));
  w.switchTab('packages');
  ok('① 「패키지 상품」을 누르면 그 패널이 켜진다',
    d.getElementById('tab-packages').classList.contains('active')
    && !d.getElementById('tab-adhoc').classList.contains('active'));
  /* 이름이 바뀌었으면 모바일 제목도 따라와야 한다 — 한쪽만 고치면 같은 화면이
     기기에 따라 다른 이름으로 불린다 */
  ok('① 모바일 제목이 새 이름을 쓴다',
    (d.getElementById('mobileTabTitle').textContent || '').includes('패키지 상품'));

  console.log('\n[2] 🔴 편집 카드는 **한 벌뿐**이다 — 두 벌이면 한쪽만 고쳐진다');
  ok('② 문서 전체에 pkgEditCard가 하나', d.querySelectorAll('#pkgEditCard').length === 1);
  ok('② 20칸을 복사하지 않았다(pkgPrice·pkgAsOf도 하나씩)',
    d.querySelectorAll('#pkgPrice').length === 1 && d.querySelectorAll('#pkgAsOf').length === 1);
  /* 🔴 **2026-09-17: 「소규모 견적」 탭이 목록을 버리고 마법사가 됐다**(대표 지시).
     그래서 아래 [3]~[10]에 있던 **두 목록 세계**의 검사를 걷어냈다 —
     `adhocList`·`adhocFilterStatus`·`pkgHostAdhoc`이 화면에 없으니 그걸 재던 줄은
     **늘 빈 결과를 돌려줘 아무것도 지키지 못한다.**

     ⚠ **이 검사가 지키던 결정은 그대로 살아 있다.** 2026-08-25 대표 확인 —
       「견적서를 취합해서 올리는 사람」과 「견적을 내는 사람」은 다른 사람이다.
       그 갈림은 오히려 **더 뚜렷해졌다**: 한쪽은 목록(패키지 상품), 다른 쪽은
       마법사(직접 견적 작성)로 화면 자체가 다르다. 위 [1]이 그것을 잰다.
     ⚠ 새 화면 쪽(패널이 iframe 하나인가·입력칸을 안 만들었는가·`?mode=adhoc`인가)은
       `test_zQ_quote_pro.js`의 [3-d]·[3-e]·[3-f]가 잰다 — 두 곳에서 재지 않는다. */
  console.log('\n[3] 직접 견적 작성은 이제 **마법사**다 — 목록·모달이 아니다');
  ok('③ 패널에 목록이 없다', !d.getElementById('adhocList'));
  ok('③ 패널에 카드 자리가 없다', !d.getElementById('pkgHostAdhoc'));
  ok('③ 「+ 직접견적」 버튼이 없다', !d.getElementById('pkgNewAdhoc'));
  /* 🔴 **새로 만들 길까지 닫았는가.** 편집 모달에 「직접견적」 종류가 남아 있으면
     고르는 순간 **어느 목록에도 안 나오는 기록**이 생긴다(만든 사람은 사라졌다고 읽는다). */
  const kindSel = d.getElementById('pkgKind');
  ok('③ 패키지 편집에서 「직접견적」을 새로 못 만든다',
    !!kindSel && !Array.from(kindSel.options).some((o) => o.value === 'adhoc'),
    '보이지 않는 기록이 생긴다');

  console.log('\n[4] 패키지 상품 목록은 그대로다 — 썸네일로 훑는다');
  w.eval('pkgAll = ' + JSON.stringify(FIXTURE) + '; pkgDrawList();');
  const pkgRows2 = d.querySelectorAll('#pkgList .pkg-row');
  ok('④ 상품 목록에 상품 2건', pkgRows2.length === 2, '실제 ' + pkgRows2.length);
  ok('④ 상품 목록에 소규모 견적이 안 섞인다',
    !d.getElementById('pkgList').textContent.includes('김보균님'));
  ok('④ 사진이 있는 상품에 썸네일이 붙는다', !!d.querySelector('#pkgList img.pkg-thumb'));
  /* ⚠ **사진이 없어도 자리를 남긴다.** 있는 줄만 넓어지면 목록이 들쭉날쭉해 눈이 걸린다 */
  ok('④ 사진이 없어도 자리가 남는다', !!d.querySelector('#pkgList .pkg-thumb-none'));

  console.log('\n[5] 고르면 카드가 상품 탭으로 들어온다');
  d.querySelectorAll('#pkgList .pkg-row')[0].click();
  ok('⑤ 카드가 상품 탭에 들어간다',
    d.getElementById('pkgEditCard').parentNode.id === 'pkgHostCatalog');
  ok('⑤ 그때 편집 칸이 열린다', d.getElementById('pkgEditCard').style.display !== 'none');
  /* 🔴 appendChild가 **복사가 아니라 이동**인지 직접 잰다 — 복사였다면 2개가 된다 */
  ok('⑤ 옮긴 뒤에도 카드는 하나다', d.querySelectorAll('#pkgEditCard').length === 1);

  console.log('\n[6] 탭이 곧 종류다 — 종류 필터는 없앴다');
  ok('⑥ 종류 필터가 없다', !d.getElementById('pkgFilterKind'));
  ok('⑥ 상품 탭에 자기 상태 필터가 있다', !!d.getElementById('pkgFilterStatus'));

  console.log('\n[7] 하는 순서가 화면에 그려져 있다');
  /* 대표가 「어떻게 써야 할지 모르겠다」고 한 자리다. 상품 쪽은 그대로 3단계고,
     직접 견적 쪽은 **마법사의 5단계 막대**가 그 일을 한다(`admin-quote-pro.html`). */
  ok('⑦ 상품 순서가 3단계로 적혀 있다',
    d.querySelectorAll('#tab-packages .pkg-steps li').length === 3);
  ok('⑦ 상품 순서가 「판매중」 단계를 빠뜨리지 않는다',
    d.getElementById('tab-packages').textContent.includes('판매중'));

  done();
}

/* 🔴 예외가 나면 **조용히 멈추지 않게** 한다. 감싸지 않으면 중간에 던진 검사가
   「여기까지 통과」로 보이고, 안 돌아간 검사는 실패로도 안 세어진다. */
function guarded() {
  try { run(); }
  catch (e) {
    fail++;
    console.log('  ✗ 검사가 도중에 죽었다 → ' + (e && e.stack || e));
    done();
  }
}
if (d.readyState === 'complete') guarded();
else w.addEventListener('load', guarded);

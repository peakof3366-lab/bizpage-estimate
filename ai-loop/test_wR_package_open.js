/* ═══════════════════════════════════════════════════════════════════════════
   WR — 「지금 팔 수 있는가」와 「팔 준비가 됐는가」

   ■ 🔴 ① 출발일이 지난 상품이 그대로 팔리고 있었다

   고객 목록·발급 조건이 `status='open'`과 `valid_until` 둘뿐이었다. 유효기간이
   9월 말인데 출발이 8월이면 **아무것도 안 걸린다** — 지난 출발편이 고객 목록에
   남고, 그 상품으로 견적서까지 발급된다.
   패키지 방침 3번(「마감된 상품 방어 — 마감 상품으로 견적서가 나가면 사고다」)이
   막으려던 자리인데, 「마감」을 유효기간으로만 재고 있었다.

   ■ 🔴 ② 「포함사항 없음」 배지가 영원히 안 꺼졌다

   관리자 목록이 `p.inclItems`를 봤는데 서버가 주는 이름은 **`included`**다
   (`api/content.js`의 `pkgRowOut`). 그래서 포함사항을 채워도 배지가 안 사라지고,
   **「✓ 팔 준비됨」이 한 번도 안 떴다** — 「채움」 필터의 「팔 준비된 것」도 늘 0건.
   ⚠ 편집 폼 미리보기만 **같은 틀린 이름**을 써서 거기서는 멀쩡해 보였다.
     그리고 WH의 검사 픽스처도 `inclItems`였다 — **픽스처가 코드를 따라가면
     검사는 아무것도 못 잡는다.** 픽스처는 **서버가 실제로 주는 모양**이어야 한다.

   ■ 이 검사가 지키는 것

     ① 두 조건(고객 목록·발급)이 **글자 그대로 같다** — 갈라지면 목록에 없는 상품이
        발급은 되는 상태가 생긴다(id를 아는 사람은 공개 POST로 뽑아 간다)
     ② 출발일·유효기간이 **비어 있는** 상품은 거르지 않는다(「지났다」가 아니다)
     ③ 🔴 관리자 목록이 **서버가 주는 이름**으로 판단한다 — jsdom에서 실제로 그려 본다
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WR 팔 수 있는 상품`);
  process.exit(fail ? 1 : 0);
};

const PKGLIB = read('api/_lib/packages.js');
const CONTENT = read('api/content.js');
const ADMIN = read('admin.html');

console.log('\n[1] 「지금 팔 수 있는가」 — 세 조건이 다 있다');
{
  /* 조건을 두 함수가 각각 적는다(태그드 템플릿이라 조각을 못 나눈다).
     그래서 **원문으로 대조한다** — CLAUDE.md: 불가피하게 나뉘면 테스트로 대조한다. */
  const cut = (fn) => {
    const i = PKGLIB.indexOf('async function ' + fn);
    return i < 0 ? '' : PKGLIB.slice(i, PKGLIB.indexOf('}', PKGLIB.indexOf('return rows', i) > 0
      ? PKGLIB.indexOf('return rows', i) : i + 400) + 1);
  };
  const pub = cut('listPublicPackages');
  const iss = cut('getIssuablePackage');
  ok('① 두 함수를 찾았다', pub.length > 50 && iss.length > 50);

  const conds = (src) => ({
    open: /status = 'open'/.test(src),
    valid: /valid_until is null or valid_until >= current_date/.test(src),
    depart: /depart_date is null or depart_date >= current_date/.test(src),
  });
  const cp = conds(pub), ci = conds(iss);
  ok('① 고객 목록: 판매중', cp.open);
  ok('① 고객 목록: 유효기간', cp.valid);
  ok('① 🔴 고객 목록: **출발일**', cp.depart);
  ok('① 발급: 판매중', ci.open);
  ok('① 발급: 유효기간', ci.valid);
  ok('① 🔴 발급: **출발일**', ci.depart);
  /* 🔴 갈라지면 「목록에 없는데 발급은 되는」 상태가 생긴다 */
  ok('① 🔴 두 조건이 같다', JSON.stringify(cp) === JSON.stringify(ci),
    JSON.stringify(cp) + ' vs ' + JSON.stringify(ci));

  /* ⚠ 비어 있는 값은 「지났다」가 아니다 — 출발일 미정 상품을 지우면 안 된다 */
  ok('② 출발일이 비면 거르지 않는다', /depart_date is null or/.test(pub) && /depart_date is null or/.test(iss));
  ok('② 유효기간이 비면 거르지 않는다', /valid_until is null or/.test(pub));
  /* ⚠ 출발 당일은 살린다 — 우리가 하루 먼저 닫을 이유가 없다 */
  ok('② 출발 당일은 살린다 (>=)', /depart_date >= current_date/.test(pub));
}

console.log('\n[2] 포함사항 — 서버가 주는 이름 하나로 간다');
{
  ok('③ 서버는 `included`로 준다', /included: r\.incl_items/.test(CONTENT));
  ok('③ 서버 저장도 `b.included`를 읽는다', /b\.included/.test(CONTENT));
  ok('③ 관리자 저장이 `included`로 보낸다', /included: pkgLines\('pkgIncl'\)/.test(ADMIN));
  /* 🔴 목록 판단이 그 이름을 본다 */
  ok('③ 🔴 목록 판단이 `p.included`를 본다',
    /label: '포함사항', has: \(p\) => Array\.isArray\(p\.included\)/.test(ADMIN));
  /* ⚠ 옛 이름이 어디에도 남아 있지 않다 — 남으면 그쪽만 조용히 못 찾는다 */
  const stray = ['admin.html', 'ai-loop/_package_rows.js', 'api/content.js', 'packages.html']
    .filter((f) => new RegExp('(?<!`)\\binclItems\\b(?!`)').test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('③ 옛 이름(inclItems)이 코드에 안 남았다', stray.length === 0, JSON.stringify(stray));
}

console.log('\n[3] 🔴 관리자 목록을 실제로 그려 본다 — 「✓ 팔 준비됨」이 뜨는가');
{
  const dom = new JSDOM(ADMIN, {
    runScripts: 'dangerously', resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
      w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    },
  });
  const w = dom.window, d = w.document;
  const finish = () => {
    if (typeof w.pkgDrawList !== 'function') {
      fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    /* 🔴 **서버가 실제로 주는 모양 그대로**(`pkgRowOut`) — 여기서 이름을 바꾸면
       이 검사는 아무것도 못 잡는다. WH의 픽스처가 정확히 그래서 못 잡았다. */
    const ROWS = [
      { id: 'ready', kind: 'catalog', status: 'open', title: '다 채운 상품', destLabel: '방콕',
        nights: 3, days: 5, departDate: '2026-11-01', pricePerPerson: 639000, priceAsOf: '2026-08-24',
        itinerary: [{ day: 1, am: '인천 · 방콕' }], included: ['[교통] 왕복항공권'], excluded: [],
        imageUrl: 'https://image.hanatour.com/a.jpg' },
      { id: 'empty', kind: 'catalog', status: 'draft', title: '껍데기 상품', destLabel: '오키나와',
        nights: 3, days: 4, departDate: '2026-12-03', pricePerPerson: 1190000, priceAsOf: '2026-08-24',
        itinerary: null, included: null, excluded: null, imageUrl: null },
    ];
    w.eval('pkgAll = ' + JSON.stringify(ROWS) + '; pkgDrawList();');
    const rows = [...d.querySelectorAll('#pkgList .pkg-row')];
    ok('④ 상품 2건이 그려졌다', rows.length === 2, '실제 ' + rows.length);
    const gapsOf = (i) => [...rows[i].querySelectorAll('.pkg-gap')].map((e) => e.textContent.trim());

    ok('④ 🔴 다 채운 상품은 「✓ 팔 준비됨」', gapsOf(0).some((t) => /팔 준비됨/.test(t)),
      JSON.stringify(gapsOf(0)));
    ok('④ 그 상품에 「포함사항 없음」이 안 뜬다', !gapsOf(0).some((t) => /포함사항/.test(t)),
      JSON.stringify(gapsOf(0)));
    ok('④ 빈 상품은 빠진 칸을 말한다', gapsOf(1).some((t) => /일정/.test(t)) && gapsOf(1).some((t) => /포함사항/.test(t)),
      JSON.stringify(gapsOf(1)));

    /* 「채움」 필터가 실제로 갈라내는가 — 늘 0건이던 자리다 */
    const sel = d.getElementById('pkgFilterGap');
    if (sel) {
      sel.value = 'ready';
      w.pkgDrawList();
      const only = [...d.querySelectorAll('#pkgList .pkg-row')];
      ok('④ 🔴 「팔 준비된 것」 필터가 1건을 남긴다', only.length === 1, '실제 ' + only.length);
      sel.value = '';
      w.pkgDrawList();
    } else { fail++; console.log('  ✗ 채움 필터를 못 찾았다'); }

    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

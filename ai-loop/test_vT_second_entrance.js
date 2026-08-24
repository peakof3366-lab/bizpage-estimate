/* ═══════════════════════════════════════════════════════════════════════════
   VT — **두 번째 입구**: 연수가 아닌 손님이 들어올 문이 있는가
   ───────────────────────────────────────────────────────────────────────────
   왜 만들었나 — 히어로가 「14년이 증명하는 해외 연수 전문 솔루션」 한 갈래만 말하는데,
   실제 견적서 **45건 중 12건이 연수가 아니다**(포상 여행·단체 워크샵·교회 단체·동호회).
   그 손님은 이 페이지를 자기 것이 아니라고 읽고 그냥 나간다.
   **입구가 없었던 것이지 팔 것이 없었던 게 아니다.**

   무엇을 지키는가:
     ① 두 갈래가 **둘 다** 있다 — 맞춤 견적(#estimate)과 패키지(packages.html).
        하나만 있으면 갈림길이 아니라 그냥 광고다.
     ② 🔴 **여기서 상품을 나열하지 않는다.** 나열하는 순간 맞춤 견적과 한 화면에 섞이고,
        어느 쪽 계산 규칙이 도는지 알 수 없어진다(VP가 세운 경계).
        패키지는 요율·계수·마진이 안 붙는 값이라 섞이면 그대로 사고다.
     ③ 갈림길이 **견적 계산기보다 먼저** 온다. 계산기를 먼저 만나면 연수용 폼을 보고
        「내 것이 아니다」로 읽고 나간다 — 그러면 문을 만든 뜻이 없다.
     ④ 🔴 **쓴 class가 CSS에 실제로 있다.** HTML만 넣고 스타일이 없으면 화면에서는
        글자 뭉치로 보인다. 소스에 "있다"와 화면에 "보인다"는 다른 이야기다
        (결함 생성기 ③ — 안전망이 실제로 실행된 적이 없다와 같은 자리).
     ⑤ 양쪽에 **되돌아가는 길**이 있다.

   ⚠ **히어로 문구는 검사하지 않는다.** 14년 포지셔닝을 바꾸는 것은 사업 방향이고
     대표가 정할 일이다. 여기서 문구를 못 박으면 그 결정을 코드가 대신 막게 된다.
     이 검사가 지키는 것은 「두 번째 문이 있는가」지 「간판이 무엇인가」가 아니다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const INDEX = read('index.html');
const CSS = read('styles.css');
const PKGHTML = read('packages.html');

/* 스크립트를 돌리지 않는다 — 마크업과 스타일만 본다(견적 엔진은 여기 관심사가 아니다) */
const d = new JSDOM(INDEX).window.document;
const tracks = d.getElementById('tracks');

console.log('\n[1] 갈림길이 실제로 렌더되는가');
{
  ok('① #tracks 섹션이 있다', !!tracks);
  const cards = tracks ? tracks.querySelectorAll('.track-card') : [];
  ok('① 갈래가 정확히 둘이다', cards.length === 2, cards.length + '개');
  const hrefs = Array.from(cards).map((c) => c.getAttribute('href'));
  ok('① 한쪽이 맞춤 견적으로 간다', hrefs.includes('#estimate'), hrefs.join(', '));
  ok('① 다른 쪽이 패키지로 간다', hrefs.includes('packages.html'), hrefs.join(', '));
  /* 카드가 눌리는 것인지 — a가 아니면 커서도 안 바뀌고 키보드로도 못 간다 */
  ok('① 두 갈래 모두 링크(a)다',
    Array.from(cards).every((c) => c.tagName === 'A'));
  ok('① 각 갈래가 무엇인지 글로 말한다',
    Array.from(cards).every((c) => (c.textContent || '').trim().length > 40));
}

console.log('\n[2] 🔴 여기서 상품을 나열하지 않는다 — VP가 세운 경계');
{
  /* 나열하려면 패키지 API를 불러야 한다. 그 호출이 index.html에 생기면 섞인 것이다. */
  ok('② index.html이 패키지 API를 부르지 않는다',
    !/action=packages/.test(INDEX), '상품을 끌어오기 시작했다');
  ok('② 갈림길 안에 금액이 없다',
    !tracks || !/[0-9]{3},[0-9]{3}/.test(tracks.textContent || ''),
    '금액이 들어오면 그게 곧 요율 없는 값과 섞인 것이다');
  ok('② 갈림길이 링크 둘로 끝난다',
    !tracks || tracks.querySelectorAll('a').length === 2,
    (tracks ? tracks.querySelectorAll('a').length : 0) + '개');
  ok('② 왜 나열하면 안 되는지가 적혀 있다',
    /여기서 상품을 나열하지 않는다/.test(INDEX));
}

console.log('\n[3] 순서 — 갈림길이 견적 계산기보다 먼저 온다');
{
  const iTracks = INDEX.indexOf('id="tracks"');
  const iEst = INDEX.indexOf('id="estimate"');
  const iHero = INDEX.indexOf('id="home"');
  ok('③ 갈림길이 견적 계산기 앞에 있다', iTracks > 0 && iEst > 0 && iTracks < iEst,
    'tracks@' + iTracks + ' estimate@' + iEst);
  ok('③ 그래도 히어로보다는 뒤다(간판이 먼저다)', iHero > 0 && iHero < iTracks);
}

console.log('\n[4] 🔴 쓴 class가 CSS에 실제로 있다 — 안 그러면 글자 뭉치로 보인다');
{
  const used = new Set();
  if (tracks) {
    used.add('section-tracks');
    tracks.querySelectorAll('*').forEach((e) => e.classList.forEach((c) => used.add(c)));
    tracks.classList.forEach((c) => used.add(c));
  }
  /* 이 섹션이 새로 들인 class만 본다 — eyebrow·container 같은 공용은 이미 있다 */
  const mine = [...used].filter((c) => /^(section-)?tracks|^track-/.test(c));
  ok('④ 새 class를 실제로 걷어냈다', mine.length >= 6, mine.join(', '));
  const missing = mine.filter((c) => !new RegExp('\\.' + c + '[\\s,{:.]').test(CSS));
  ok('④ 새 class가 전부 styles.css에 있다', missing.length === 0,
    '스타일 없는 class: ' + missing.join(', '));
  /* 좁은 화면에서 두 장이 세로로 쌓이는지 — 안 그러면 휴대폰에서 글자가 뭉갠다 */
  ok('④ 좁은 화면 규칙이 있다', /@media \(max-width:720px\)[\s\S]{0,200}\.tracks-grid/.test(CSS));
}

console.log('\n[5] 양쪽에 되돌아가는 길이 있다');
{
  ok('⑤ index에 패키지로 나가는 상단 링크가 그대로 있다',
    !!d.querySelector('a.nav-pkg[href="packages.html"]'));
  const pd = new JSDOM(PKGHTML).window.document;
  ok('⑤ 패키지 화면에서 돌아오는 길이 있다', !!pd.querySelector('a[href="index.html"]'));
  ok('⑤ 패키지 화면이 맞춤 견적을 안내한다', /맞춤 견적/.test(PKGHTML));
}

console.log('\n[6] 근거가 코드에 남아 있다 — 다음 사람이 지우지 않게');
{
  ok('⑥ 45건 중 12건이 연수가 아니라는 근거가 적혀 있다',
    /45건 중 12건이 연수가 아니다/.test(INDEX));
  ok('⑥ 히어로를 왜 안 건드렸는지가 적혀 있다',
    /히어로 문구는 건드리지 않는다/.test(INDEX));
  ok('⑥ 왜 계산기 앞인지가 적혀 있다', /갈림길이 폼보다 먼저다/.test(CSS));
}

console.log('\n' + '─'.repeat(64));
/* ⚠ 「결과:」로 시작해야 run_all_tests.js가 집계한다 */
console.log(`결과: ${pass} pass / ${fail} fail  — VT 두 번째 입구`);
process.exit(fail ? 1 : 0);

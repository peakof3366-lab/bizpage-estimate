/* ═══════════════════════════════════════════════════════════════════════════
   XF — 조립 항목이 **조용히 사라지지 않는다**

   ■ 🔴 무엇이 잘못돼 있었나

   소규모 견적의 「항목별 조립」은 **항목 합이 곧 1인 금액**이다(화면이 그렇게 적어
   놓았다: 「저장하면 이 값이 위 「1인 금액」을 덮어씁니다」). 그런데 서버
   (`lineItemsOf`)는 **41번째 줄부터 잘라 내고**, 이름이 60자를 넘으면 자른다.
   그 상한을 **화면은 몰랐다.**

   결과: 담당자가 41줄을 적고 저장하면 마지막 줄이 사라지고 **그만큼 고객가가
   조용히 줄어든다.** 화면이 「덮어씁니다」라고 약속해 놓고 다른 값이 저장되는 셈이다.

   ⚠ `limits.js`의 `MAX_DAYS` 주석이 이미 같은 말을 하고 있었다 —
     「화면이 막지 않고 서버만 거절하면, 담당자는 30개를 넘겨 채워 넣은 뒤 저장
     버튼을 눌러서야 그 사실을 안다」. 여기는 그보다 나쁘다: **거절조차 안 한다.**

   ■ 고친 방향

   상한을 `limits.js` 하나로 옮기고(서버·화면이 같은 값을 본다), 화면이 **저장 전에
   그 자리에서** 말한다. **막지는 않는다** — 저장을 못 하게 하면 담당자가 적어 둔
   것을 잃는다. 무엇이 잘릴지 알려 주고 판단은 사람이 한다.

   ■ 이 검사가 지키는 것

     ① 상한이 **한 곳**에서 온다 (서버가 limits.js를 읽는다)
     ② 🔴 넘겼을 때 화면이 **그 자리에서** 말한다 — 얼마가 줄어드는지까지
     ③ 정상 범위에서는 **조용하다** (늘 켜져 있으면 아무도 안 본다)
     ④ 서버는 여전히 자른다 — 화면 안내는 방어가 아니라 안내다(감춘 것 ≠ 막은 것)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LIMITS = require(path.join(ROOT, 'limits.js'));
const PKG = require(path.join(ROOT, 'api', '_lib', 'packages.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XF 조립 항목 상한`);
  process.exit(fail ? 1 : 0);
};

console.log('\n[1] 상한이 한 곳에서 온다');
{
  ok('① limits.js가 값을 갖는다', LIMITS.PKG_MAX_ITEMS === 40 && LIMITS.PKG_MAX_ITEM_LABEL === 60,
    JSON.stringify([LIMITS.PKG_MAX_ITEMS, LIMITS.PKG_MAX_ITEM_LABEL]));
  /* 🔴 서버가 그 값을 **읽어서** 쓴다 — 두 벌이면 언젠가 갈린다 */
  ok('① 서버가 limits.js에서 읽는다',
    /require\('\.\.\/\.\.\/limits'\)/.test(read('api/_lib/packages.js')));
  ok('① 서버가 내보내는 값도 같다',
    PKG.PKG_MAX_ITEMS === LIMITS.PKG_MAX_ITEMS && PKG.PKG_MAX_ITEM_LABEL === LIMITS.PKG_MAX_ITEM_LABEL);
  /* 화면 힌트도 그 값에서 온다 */
  ok('① 화면 힌트가 data-fact로 값을 받는다',
    /data-fact="PKG_MAX_ITEMS"/.test(read('admin.html')));
}

console.log('\n[2] 🔴 서버는 여전히 자른다 — 화면 안내는 방어가 아니다');
{
  const many = { line_items: Array.from({ length: 45 }, (_, i) => ({ label: '항목' + (i + 1), amount: 10000 })) };
  ok('② 41번째부터 잘린다', PKG.lineItemsOf(many).length === LIMITS.PKG_MAX_ITEMS,
    String(PKG.lineItemsOf(many).length));
  /* 🔴 그리고 **1인 금액이 그만큼 줄어든다** — 이게 조용하면 고객가가 조용히 바뀐다 */
  ok('② 🔴 잘린 만큼 1인 금액이 줄어든다', PKG.perPersonOf(many) === 400000,
    String(PKG.perPersonOf(many)));
  const longLabel = { line_items: [{ label: 'ㄱ'.repeat(80), amount: 1000 }] };
  ok('② 긴 이름은 잘린다', PKG.lineItemsOf(longLabel)[0].label.length === LIMITS.PKG_MAX_ITEM_LABEL);
}

console.log('\n[3] 🔴 화면이 저장 전에 말하는가 — 실제로 41줄을 넣어 본다');
{
  const dom = new JSDOM(read('admin.html'), {
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
    if (typeof w.pkgSyncNotes !== 'function') {
      fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    const box = d.getElementById('pkgItemsSum');
    const setItems = (text) => { d.getElementById('pkgItems').value = text; w.pkgSyncNotes(); };

    /* 정상 범위 — 조용해야 한다 */
    setItems('항공 | 620000\n호텔 | 380000');
    ok('③ 정상일 때 합계를 말한다', /합계 1,000,000원/.test(box.textContent), box.textContent.slice(0, 60));
    ok('③ 🔴 정상일 때는 빨갛지 않다', box.style.color !== 'rgb(185, 28, 28)', box.style.color);
    ok('③ 정상일 때 경고가 없다', !/🔴/.test(box.textContent));

    /* 상한 초과 */
    const lines = [];
    for (let i = 1; i <= LIMITS.PKG_MAX_ITEMS + 1; i++) lines.push('항목' + i + ' | 10000');
    setItems(lines.join('\n'));
    ok('③ 🔴 넘었다고 말한다', /줄을 넘었습니다/.test(box.textContent), box.textContent.slice(-90));
    /* 얼마가 줄어드는지까지 말한다 — 「잘린다」만으로는 무게를 모른다 */
    ok('③ 🔴 얼마가 줄어드는지 말한다', /1인 금액이 줄어듭니다\(10,000원\)/.test(box.textContent),
      box.textContent.slice(-90));
    ok('③ 빨갛게 말한다', box.style.color === 'rgb(185, 28, 28)', box.style.color);
    /* ⚠ 막지는 않는다 — 칸의 내용은 그대로다 */
    ok('③ ⚠ 막지 않는다 (적은 것을 지우지 않는다)',
      d.getElementById('pkgItems').value.split('\n').length === LIMITS.PKG_MAX_ITEMS + 1);

    /* 긴 이름 */
    setItems('ㄱ'.repeat(LIMITS.PKG_MAX_ITEM_LABEL + 5) + ' | 1000');
    ok('③ 긴 이름도 말한다', /자를 넘는 줄/.test(box.textContent), box.textContent.slice(-70));

    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

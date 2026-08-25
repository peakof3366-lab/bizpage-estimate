/* ═══════════════════════════════════════════════════════════════════════════
   WF — 패키지 견적서를 받아 간 사람이 **누구인지 남는다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-25, 대표가 「패키지 상품을 저장한 다음 어디서 어떻게 쓰는가」를 물어
   경로를 끝까지 따라가다 나온 결함이다.

   ■ 🔴 무엇이 잘못돼 있었나

   패키지의 **주력 경로**는 고객이 스스로 뽑는 것이다:
     홈 → 「패키지 여행」 → 상품 고르기 → 인원 넣기 → 「이 상품으로 견적서 받기」
     → 그 자리에서 견적서가 만들어지고 대장에 번호가 붙어 쌓인다.

   그런데 `packages.html`이 **연락처를 안 물었다.** 서버는 받을 준비가 돼 있었는데
   (`customerTel`) 화면이 안 보냈다. 게다가 대장 「고객」 칸은 `p.customer_label ||
   p.title`이라 **상품명이 고객으로 찍혔다** — 「오키나와 3박4일」이 고객이 된다.

     → 고객이 견적서만 받아 가고 조용히 있으면 **누구인지도 모르고 먼저 연락할
       수도 없다.** WB(대장)·WC(연락처)가 「담당자가 휴가여도 응대」를 위해 만든
       것인데, 정작 패키지의 주력 경로에서 그 목적이 통째로 깨져 있었다.

   ⚠ WC는 연락처를 **세 입구**(고객 계산기·담당자 견적 도구·관리자 발급)에 넣었다.
     **네 번째 입구가 빠져 있었다** — 목록이 여러 곳에 흩어져 하나를 빠뜨린
     결함 생성기 ①이, 코드가 아니라 「입구」 목록에서 재현된 것이다.

   ■ 이 검사가 지키는 것

     ① 고객 화면이 이름·연락처를 **받고 보낸다** (그리고 안 적으면 막는다)
     ② 그래도 **연락처는 payload에 안 들어간다** — WC의 규칙은 그대로다
     ③ 대장 「고객」 칸에 **사람 이름이 먼저**, 없을 때만 상품명으로 떨어진다
     ④ 🔴 발급 칸이 **앞 손님의 값을 안 물고 간다** — 두 번 눌러 봐야 나오는 결함이다
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
  console.log(`결과: ${pass} pass / ${fail} fail  — WF 패키지 견적서의 고객 정보`);
  process.exit(fail ? 1 : 0);
};

const SHARES = read('api/quote-shares.js');
const PKGHTML = read('packages.html');
const ADMIN = read('admin.html');

console.log('\n[1] 고객 화면이 이름·연락처를 받는다 — 네 번째 입구를 채웠다');
{
  ok('① 받으실 분 칸이 있다', /id="pkName"/.test(PKGHTML));
  ok('① 연락처 칸이 있다', /id="pkTel"/.test(PKGHTML));
  /* 🔴 **먼저 말해야 적는다.** 연락처가 문서에 박히는 줄 알면 고객은 안 적는다 */
  ok('① 「견적서에는 표시되지 않습니다」를 그 자리에서 말한다',
    /견적서에는 표시되지 않습니다/.test(PKGHTML));
  ok('① 둘 다 보낸다', /customerName: nm/.test(PKGHTML) && /customerTel: tel/.test(PKGHTML));
}

console.log('\n[2] 안 적으면 막는다 — 그리고 서버와 **같은 기준**으로 막는다');
{
  ok('② 이름이 비면 막는다', /받으실 분 이름을 넣어 주세요/.test(PKGHTML));
  /* ⚠ 화면이 통과시킨 값을 서버가 조용히 버리면 대장에 연락처가 안 남는데
     고객은 적었다고 생각한다(결함 생성기 ②). 기준이 같아야 한다 — 숫자 9자. */
  const QNO = require(path.join(ROOT, 'api', '_lib', 'quote_no.js'));
  ok('② 화면이 숫자 9자 미만을 막는다',
    /tel\.replace\(\/\\D\/g, ''\)\.length < 9/.test(PKGHTML));
  ok('② 서버도 같은 기준이다(9자 미만은 null)',
    QNO.normalizeTel('010-1234-5678') === '010-1234-5678'
    && QNO.normalizeTel('0101234') === null);
  /* 형식은 조이지 않는다 — 조이면 진짜 번호가 막히고, 막히면 아예 안 적는다 */
  ok('② 여러 모양을 그대로 받는다',
    ['01012345678', '02)123-4567', '+82 10 1234 5678', '031-123-4567 (내선 21)']
      .every((t) => QNO.normalizeTel(t) === t));
}

console.log('\n[3] 🔴 그래도 연락처는 payload에 안 들어간다 — WC의 규칙은 그대로다');
{
  const bodies = [...SHARES.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)\}::jsonb/g)].map((m) => m[1]);
  ok('③ payload를 만드는 자리 둘을 찾았다', bodies.length === 2, bodies.length + '곳');
  ok('③ payload 어디에도 연락처가 없다',
    bodies.every((b) => !/tel|Tel|연락처|phone/i.test(b)));
  /* 이름도 payload에 안 넣었다 — 이번 변경은 **대장 칸**만 채운다. 고객이 보는
     문서를 바꾸는 것은 다른 이야기라 여기서 하지 않았다. */
  ok('③ 이름도 payload를 안 건드렸다',
    bodies.every((b) => !/customerName/.test(b)));
  ok('③ 고객 화면도 payload가 아니라 바깥 칸으로 보낸다',
    /packageId: p\.id, pax: pax, customerName: nm, customerTel: tel/.test(PKGHTML));
}

console.log('\n[4] 대장 「고객」 칸 — 사람 이름이 먼저, 없을 때만 상품명');
{
  ok('④ 고객이 적은 이름을 먼저 쓴다',
    /pkgCustomerLabel\(b\.customerName\) \|\| p\.customer_label \|\| p\.title/.test(SHARES));
  /* 폴백을 지우지 않았다 — 1회용은 담당자가 적은 「고객 표시」가 그 일을 하고,
     그것도 없으면 상품명이라도 있어야 대장에서 무엇인지 알아본다 */
  ok('④ 1회용의 「고객 표시」 폴백이 살아 있다', /p\.customer_label \|\| p\.title/.test(SHARES));

  /* 함수를 직접 불러 본다 — 정규식만 보면 「있다」까지밖에 못 잰다 */
  const mod = { exports: {} };
  const src = SHARES.replace(/^const .*require\(.*$/gm, '')
    + '\nmodule.exports = { pkgCustomerLabel };';
  try {
    new Function('module', 'exports', 'require', 'process', src)(
      mod, mod.exports, () => ({}), process);
  } catch (e) { /* 아래에서 실패로 잡힌다 */ }
  const L = mod.exports.pkgCustomerLabel;
  ok('④ 함수를 실제로 부를 수 있다', typeof L === 'function');
  if (typeof L === 'function') {
    ok('④ 빈 값은 null로 떨어져 폴백이 산다',
      L('') === null && L('   ') === null && L(undefined) === null && L(123) === null);
    ok('④ 이름은 그대로 남는다', L(' 김보균 ') === '김보균');
    ok('④ 형식을 조이지 않는다(교회·법인·직함)',
      L('○○교회 김집사') === '○○교회 김집사' && L('(주)한빛 총무팀') === '(주)한빛 총무팀');
    /* 공개 POST로 오는 값이다 — 길이를 자른다(결함 생성기 ④) */
    ok('④ 지나치게 긴 값은 자른다', L('가'.repeat(500)).length === 80);
    ok('④ 줄바꿈·연속 공백을 한 칸으로 접는다', L('김보균\n\n  가족') === '김보균 가족');
  }
}

console.log('\n[5] 담당자 발급 칸도 같은 구멍이 있었다');
{
  ok('⑤ 관리자 발급에 고객명 칸이 생겼다', /id="pkgIssueName"/.test(ADMIN));
  ok('⑤ 관리자도 이름을 함께 보낸다', /customerName: \(document\.getElementById\("pkgIssueName"\)/.test(ADMIN));
}

console.log('\n[6] 🔴 발급 칸이 앞 손님 값을 안 물고 간다 — 실제로 두 번 눌러 본다');
{
  /* 이건 소스로는 못 잰다. 김보균님께 발급한 뒤 다른 상품을 열었을 때 그 칸이
     비어 있는지를 봐야 한다 — 안 비면 다음 견적서가 **남의 이름과 연락처로** 박힌다. */
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
  const finish = () => {
    if (typeof w.switchTab !== 'function') {
      fail++;
      console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    const FIX = [
      { id: 'hana-okinawa-1203', kind: 'catalog', title: '오키나와 3박4일', status: 'open',
        pricePerPerson: 1190000, nights: 3, days: 4, destLabel: '오키나와', priceAsOf: '2026-08-24' },
      { id: 'hana-saipan-0110', kind: 'catalog', title: '사이판 4박5일', status: 'open',
        pricePerPerson: 1590000, nights: 4, days: 5, destLabel: '사이판', priceAsOf: '2026-08-24' },
    ];
    w.eval('pkgAll = ' + JSON.stringify(FIX) + '; pkgDrawList();');
    const rows = () => d.querySelectorAll('#pkgList .pkg-row');
    ok('⑥ 상품 2건이 그려졌다', rows().length === 2, '실제 ' + rows().length);

    /* ① 첫 상품을 열고 손님 정보를 적는다 */
    rows()[0].click();
    d.getElementById('pkgIssueName').value = '김보균';
    d.getElementById('pkgIssueTel').value = '010-1234-5678';
    d.getElementById('pkgIssuePax').value = '7';

    /* ② 다른 상품을 연다 — 여기서 남아 있으면 그게 결함이다 */
    rows()[1].click();
    ok('⑥ 다른 상품을 열면 앞 손님 이름이 사라진다',
      d.getElementById('pkgIssueName').value === '',
      '남은 값: ' + d.getElementById('pkgIssueName').value);
    ok('⑥ 앞 손님 연락처도 사라진다',
      d.getElementById('pkgIssueTel').value === '',
      '남은 값: ' + d.getElementById('pkgIssueTel').value);
    /* 인원도 마찬가지다 — 앞 건의 7명이 남으면 총액이 조용히 틀린 채 나간다 */
    ok('⑥ 인원도 기본값으로 돌아간다',
      d.getElementById('pkgIssuePax').value === '2',
      '남은 값: ' + d.getElementById('pkgIssuePax').value);

    /* 같은 상품을 다시 열어도 마찬가지여야 한다(사람이 바뀌었을 수 있다) */
    d.getElementById('pkgIssueTel').value = '010-9999-0000';
    rows()[1].click();
    ok('⑥ 같은 상품을 다시 열어도 비운다', d.getElementById('pkgIssueTel').value === '');

    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

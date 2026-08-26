/* ═══════════════════════════════════════════════════════════════════════════
   XO — 어제 만료된 견적서가 **하루 더 「아직 유효」**라고 말하고 있었다
   ───────────────────────────────────────────────────────────────────────────
   견적서 화면을 만료 상태로 그려 보다 나왔다.

   ■ 🔴 -0 하나 때문에

       const daysLeft = Math.ceil((until - now) / 86400000);
       return { …, expired: daysLeft < 0 };

     만료된 지 **24시간이 안 지났으면** 그 나눗셈은 -0.96 같은 값이고,
     `Math.ceil(-0.96)`은 **-0**이다. 그리고 **`-0 < 0`은 false**다.
     → 어제 만료된 견적서가 **「0일 남음, 아직 유효」**로 보였다.

     패키지에서는 이게 그대로 「**마감된 상품을 아직 유효하다고 말하는**」 자리다
     (패키지 방침 3번이 막으려던 바로 그것). 실측으로 재현했다.

   ■ 🔴 그리고 발행일이 없으면 「null」을 찍고 있었다

     상단 바는 「유효기간은 담당자에게 확인해 주세요」로 갈라 놨는데 **배너만** 안 갈려서:
       「견적 유효기간: **null**까지 (**null**일 남음)」
     운영 DB 실측(2026-08-26): 발급된 견적서 10건 중 **2건에 발행일이 없다.**
     날짜 자리에 null이 찍힌 문서를 결재에 올릴 수는 없다.

   ■ 규칙
     · **판정은 시각 비교로, 표시는 날 수로.** 둘을 한 값으로 묶지 않는다.
     · 마지막 날은 **살아 있다**(「9월 30일까지」는 그날을 포함한다).
     · 모르면 **모른다고 말한다** — 조용히 「유효」로 떨어지지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const { bootPage, visibleText } = require('./_page_boot');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XO 유효기간`);
  process.exit(fail ? 1 : 0);
};

/* ⚠ **로컬 시각으로 만든다.** `toISOString()`은 UTC라 한국 시각 0~9시에는 하루 전
   날짜를 내놓는다 — 화면은 로컬로 재므로 그 시간대에만 이 검사가 무너진다(겪었다). */
const dayStr = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const DOC = (over) => Object.assign({
  dk: '다낭', dt: '다낭 (Da Nang)', n: 30, d: 4, t: 48000000, pp: 1600000,
  ptx: '산업시찰', ot: '기업', org: '테스트기관', cn: '김보균',
  rows: [['항공', 20000000], ['호텔', 15000000], ['지상비', 13000000]],
  iso: dayStr(0), qno: 'Q260826-77',
  _verify: { verdict: 'verified', at: new Date().toISOString() },
}, over);

const draw = async (doc) => {
  const V = bootPage('estimate-view.html', { query: '?id=t', fixtures: { shareDoc: doc } });
  await V.ready; await V.tick(250);
  return {
    text: visibleText(V.doc.body),
    bar: visibleText(V.doc.getElementById('validity-bar')),
    banner: visibleText(V.doc.querySelector('.validity-banner')),
    expiredBox: !!V.doc.querySelector('.validity-expired'),
    errors: V.log.errors,
  };
};

(async () => {
  console.log('\n[1] 🔴 어제 만료된 것은 **만료다** — -0 자리');
  {
    /* 맞춤 견적은 발급 + 30일이다. 31일 전에 발급 = 어제 만료 */
    const r = await draw(DOC({ iso: dayStr(-31) }));
    ok('① 만료라고 말한다', r.expiredBox, r.banner.slice(0, 80));
    ok('① 「0일 남음」이라고 하지 않는다', !/0일.{0,3}남음/.test(r.banner), r.banner.slice(0, 80));
    ok('① 상단 바도 만료로 말한다', /만료/.test(r.bar), r.bar);

    /* 패키지: 공급사 유효기간이 어제 지난 것 — 「마감된 상품을 유효하다」고 말하던 자리 */
    const p = await draw(DOC({ pkg: { title: '오키나와 3박4일', validUntil: dayStr(-1), included: [], excluded: [] } }));
    ok('① 🔴 어제 마감된 패키지도 만료다', p.expiredBox, p.banner.slice(0, 80));
    ok('① 상품 유효기간 날짜를 그대로 말한다', p.banner.includes('만료'), p.banner.slice(0, 60));
  }

  console.log('\n[2] 마지막 날은 살아 있다 — 「…까지」는 그날을 포함한다');
  {
    const r = await draw(DOC({ iso: dayStr(-30) }));   /* 오늘이 30일째 */
    ok('② 오늘까지는 유효하다', !r.expiredBox, r.banner.slice(0, 80));
    ok('② 남은 날을 말한다', /남음/.test(r.banner), r.banner.slice(0, 80));

    const p = await draw(DOC({ pkg: { title: '상품', validUntil: dayStr(0), included: [], excluded: [] } }));
    ok('② 상품도 마감 당일까지는 유효하다', !p.expiredBox, p.banner.slice(0, 80));
  }

  console.log('\n[3] 🔴 발행일이 없으면 「모른다」고 말한다 (운영 10건 중 2건이 그렇다)');
  {
    const r = await draw(DOC({ iso: undefined }));
    ok('③ null을 찍지 않는다', !/null/.test(r.text), (r.text.match(/.{0,40}null.{0,40}/) || [''])[0]);
    ok('③ 배너가 발행일이 없다고 말한다', /발행일이 없어/.test(r.banner), r.banner.slice(0, 80));
    ok('③ 무엇을 하라고 알려 준다', /담당자에게/.test(r.banner));
    ok('③ 상단 바도 같은 말을 한다', /담당자에게 확인/.test(r.bar), r.bar);
    /* ⚠ 「모른다」가 「만료 아님」으로 조용히 통과하지 않는다 — 만료 배너도 아니어야 한다 */
    ok('③ 만료라고 단정하지도 않는다', !r.expiredBox);
  }

  console.log('\n[4] 만료돼도 **문서는 남는다** — 금액·번호를 지우지 않는다');
  {
    const r = await draw(DOC({ iso: dayStr(-40) }));
    ok('④ 금액이 그대로 보인다', /48,000,000/.test(r.text));
    ok('④ 견적번호도 보인다', /Q260826-77/.test(r.text));
    ok('④ 어떻게 하면 되는지 말한다(고객센터 문의)', /문의/.test(r.banner), r.banner.slice(0, 90));
    ok('④ 화면 오류가 없다', r.errors.length === 0, r.errors.map((e) => e.msg).join(' | '));
  }

  console.log('\n[5] 패키지 유효기간이 우리 30일 규칙을 이긴다 (WP 회귀)');
  {
    /* 발급은 오늘, 상품 유효기간은 3일 뒤 → 3일 뒤가 이겨야 한다 */
    const r = await draw(DOC({ iso: dayStr(0), pkg: { title: '상품', validUntil: dayStr(3), included: [], excluded: [] } }));
    ok('⑤ 상품 유효기간으로 말한다', /상품 유효기간/.test(r.banner), r.banner.slice(0, 80));
    /* 🔴 WP가 잡은 것은 「단어가 몇 번 나오나」가 아니라 **날짜가 둘인 것**이다
       (상단 바 9/25까지 · 금액 기준 박스 9/30까지). 날짜로 잰다. */
    const fmt = (s) => new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    ok('⑤ 상품 유효기간 날짜가 문서에 있다', r.text.includes(fmt(dayStr(3))), fmt(dayStr(3)));
    ok('⑤ 🔴 우리 30일 규칙 날짜는 어디에도 없다',
      !r.text.includes(fmt(dayStr(30))), fmt(dayStr(30)) + ' 가 함께 찍혔다');
  }

  done();
})();

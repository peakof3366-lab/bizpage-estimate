/* ═══════════════════════════════════════════════════════════════════════════
   XP — 고객이 **총액을 견적서에서 처음 봤다**, 그리고 그 금액이 다를 수 있었다
   ───────────────────────────────────────────────────────────────────────────
   패키지 상세를 눌러 보다 나온 둘.

   ■ ① 총액을 누르기 전에 안 보여 줬다
     상세에는 「1,190,000원 / 1인」만 있고, 인원을 넣어도 화면이 아무 말도 안 했다.
     고객은 **견적서를 받고 나서야** 자기가 낼 총액(4명 → 4,760,000원)을 처음 본다.
     그 자리가 곧 「생각보다 비싼데?」로 이탈하는 자리다.
     → 「1인 금액 × 인원 = 총액」을 **식 그대로** 보여 준다(XE에서 배운 것: 표가 스스로
       설명하지 않으면 고객은 우리가 잘못 더한 줄 안다).

   ■ 🔴 ② 목록에서 본 금액과 받은 견적서의 금액이 **다를 수 있었다**
     서버는 견적서를 낼 때 `perPersonOf`를 쓰는데, 그 규칙은
       **항목(line_items)이 있으면 그 합이 이긴다. 없으면 `price_per_person`.**
     그런데 화면은 언제나 `pricePerPerson`을 그렸다. 즉 담당자가 항목으로 조립한
     상품에서는 **고객이 목록에서 본 금액과 문서에 찍히는 금액이 어긋난다.**
     → 어느 쪽이 이기는지는 **서버가 아는 규칙**이니 서버가 계산해 내보낸다(`perPerson`).
       화면이 그 규칙을 다시 구현하면 언젠가 갈라진다(결함 생성기 ①).
   ⚠ 옛 응답(캐시)에 그 칸이 없으면 예전처럼 `pricePerPerson`으로 떨어진다 —
     지금까지와 같은 동작이라 나빠지지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText, ROOT } = require('./_page_boot');
const PKG = require(path.join(ROOT, 'api', '_lib', 'packages.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XP 패키지 금액`);
  process.exit(fail ? 1 : 0);
};

/* ⚠ 로컬 시각으로 만든다 — UTC(`toISOString`)는 한국 0~9시에 하루 전을 준다 */
const soon = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const PKGS = (over) => ({
  packages: [Object.assign({
    id: 'p1', title: '오키나와 3박4일', destLabel: '오키나와',
    pricePerPerson: 1190000, perPerson: 1190000,
    nights: 3, days: 4, departDate: soon(60), priceAsOf: soon(-2), validUntil: soon(30),
    itinerary: [], included: [], excluded: [],
  }, over)],
});

const openDetail = async (fixturePkgs) => {
  const P = bootPage('packages.html', { fixtures: { packages: fixturePkgs } });
  await P.ready; await P.tick(250);
  const cta = P.doc.querySelector('#pkGrid .pk-cta');
  if (cta) cta.dispatchEvent(new P.win.MouseEvent('click', { bubbles: true, cancelable: true, view: P.win }));
  await P.tick(80);
  return P;
};

console.log('\n[1] 서버가 정한 1인 금액을 쓰는가 — 규칙은 한 곳에만 있다');
{
  /* 서버 규칙을 직접 불러 확인한다(주석이 아니라 함수를 본다) */
  ok('① 항목이 있으면 그 합이 이긴다',
    PKG.perPersonOf({ price_per_person: 1190000, line_items: [{ label: 'a', amount: 800000 }, { label: 'b', amount: 700000 }] }) === 1500000);
  ok('① 항목이 없으면 1인 금액을 쓴다',
    PKG.perPersonOf({ price_per_person: 1190000, line_items: [] }) === 1190000);

  const api = fs.readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');
  ok('① API가 그 값을 계산해 내보낸다', /perPerson: PKG\.perPersonOf\(r\)/.test(api));

  const html = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
  ok('① 화면은 규칙을 다시 구현하지 않는다(항목 합을 직접 세지 않는다)',
    !/lineItems[\s\S]{0,120}reduce/.test(html));
  ok('① 화면이 그 값을 쓴다', /perPersonOf\(p\)/.test(html));
}

(async () => {
  console.log('\n[2] 🔴 항목으로 조립한 상품 — 목록·상세가 **서버가 쓸 금액**을 보여준다');
  {
    /* 서버가 보내는 모양: pricePerPerson(옛 칸)과 perPerson(진짜)이 다르다 */
    const P = await openDetail(PKGS({ pricePerPerson: 1190000, perPerson: 1500000 }));
    const card = visibleText(P.doc.querySelector('#pkGrid .pk-card'));
    const detail = visibleText(P.doc.getElementById('pkDetail'));
    ok('② 목록이 1,500,000을 보여준다', /1,500,000/.test(card), card.slice(0, 80));
    ok('② 목록에 옛 금액(1,190,000)이 안 보인다', !/1,190,000/.test(card));
    ok('② 상세도 1,500,000이다', /1,500,000/.test(detail), detail.slice(0, 80));
    ok('② 총액도 그 금액으로 곱한다(4명 → 6,000,000)', /6,000,000/.test(detail), detail.slice(-120));
  }

  console.log('\n[3] 옛 응답(캐시)에는 그 칸이 없다 — 예전처럼 동작한다');
  {
    const P = await openDetail(PKGS({ perPerson: undefined }));
    const card = visibleText(P.doc.querySelector('#pkGrid .pk-card'));
    ok('③ pricePerPerson으로 떨어진다', /1,190,000/.test(card), card.slice(0, 80));
    ok('③ 화면이 죽지 않는다', P.log.errors.length === 0, P.log.errors.map((e) => e.msg).join(' | '));
  }

  console.log('\n[4] 🔴 총액을 **누르기 전에** 보여 준다');
  {
    const P = await openDetail(PKGS({}));
    const detail = () => visibleText(P.doc.getElementById('pkDetail'));
    ok('④ 기본 인원(4명)의 총액이 보인다', /4,760,000/.test(detail()), detail().slice(-120));
    ok('④ 무엇을 곱했는지도 보인다', /1,190,000원 × 4명/.test(detail()), detail().slice(-120));

    const pax = P.doc.getElementById('pkPax');
    pax.value = '7';
    pax.dispatchEvent(new P.win.Event('input', { bubbles: true }));
    await P.tick(40);
    ok('④ 인원을 바꾸면 총액이 따라온다', /8,330,000/.test(detail()), detail().slice(-120));
    ok('④ 옛 총액은 사라진다', !/4,760,000/.test(detail()));

    /* ⚠ 이상한 인원이면 **빈 상자를 남기지 않는다** — 그것도 「뭔가 잘못됐나」로 읽힌다 */
    pax.value = '0';
    pax.dispatchEvent(new P.win.Event('input', { bubbles: true }));
    await P.tick(40);
    ok('④ 인원이 범위 밖이면 총액을 비운다',
      !/원 ×/.test(detail()), detail().slice(-100));
    ok('④ 그래도 화면은 살아 있다', P.log.errors.length === 0);

    pax.value = '2';
    pax.dispatchEvent(new P.win.Event('input', { bubbles: true }));
    await P.tick(40);
    ok('④ 다시 정상 인원을 넣으면 돌아온다', /2,380,000/.test(detail()), detail().slice(-100));
  }

  console.log('\n[5] 🔴 그래도 금액은 **브라우저가 보내지 않는다** (VS가 세운 경계)');
  {
    const P = await openDetail(PKGS({}));
    P.doc.getElementById('pkPax').value = '4';
    P.doc.getElementById('pkName').value = '김보균';
    P.doc.getElementById('pkTel').value = '010-1234-5678';
    const before = P.log.requests.length;
    P.doc.getElementById('pkAsk').dispatchEvent(new P.win.MouseEvent('click', { bubbles: true, cancelable: true, view: P.win }));
    await P.tick(150);
    const req = P.log.requests.slice(before).find((r) => r.url.includes('quote-shares'));
    ok('⑤ 발급 요청이 나갔다', !!req);
    ok('⑤ 요청에 금액이 없다', !!req && !/price|total|amount/i.test(JSON.stringify(req.body)),
      req && JSON.stringify(req.body));
    ok('⑤ 보내는 것은 상품·인원·연락처뿐이다',
      !!req && Object.keys(req.body).sort().join(',') === 'customerName,customerTel,packageId,pax',
      req && Object.keys(req.body).join(','));
  }

  done();
})();

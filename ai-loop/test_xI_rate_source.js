/* ═══════════════════════════════════════════════════════════════════════════
   XI — 요율을 못 받은 브라우저가 만든 견적이 **그대로 견적서로 나가고 있었다**
   ───────────────────────────────────────────────────────────────────────────
   「요율 편집 → 고객 금액 반영」 경로를 끝까지 따라가다 나온 자리다.

   ■ 🔴 조용한 폴백이 금액을 움직인다 — 세어 봤다

   `script.js`는 `/api/rates`로 운영 요율(`rate_overrides`)·환율·계수 노브를 받아
   `data.js` 기본값 위에 덮는다. 그 fetch가 실패하면 **기본값 그대로 계산**되고
   화면에는 그냥 「견적 금액」으로 보인다. script.js 자신이 그렇게 적어 놨다 —
   「이 로드가 실패하면 금액이 조용히 달라진다」.

   실측(2026-08-26 · 운영 요율 · 30명 4일 · 오버라이드가 있는 23개 목적지):
     **23곳 전부가 움직인다. |차이| 중앙값 5.9% · 최대 27.3%**
     오키나와 +27.3% · 동유럽 −19.5% · 카자흐스탄 −18.8% · 후아힌 −18.7% · 마카오 +18.4%
   방향이 갈리는 것이 특히 나쁘다 — **아래로 벌어지면 그 차액을 우리가 문다.**

   ■ 🔴 그런데 그 견적이 「검증 통과」로 견적서 링크까지 받았다

   서버 검증(`quote_verify.js`)에 「요율 기준월 일치」 단계가 있지만, 그건 **오버라이드가
   `rateDate`를 함께 가질 때만** 돈다. 운영 실측으로 23곳 중 **2곳뿐**이다(나머지는
   금액만 바뀐 상태 — WW가 센 「21곳 59칸」). 나머지 21곳에서는 기본 요율로 만든
   견적과 운영 요율로 만든 견적의 `rateDate`가 **같아서** 검사가 통과한다.
   그리고 1인당 상식 범위(band)는 조작을 잡는 최후 그물이라 20%쯤은 그냥 통과한다.

   ■ 고친 것 — 「어느 요율표로 계산했는가」를 견적이 스스로 말한다

     ① `script.js`가 견적 기록에 `rateSource`를 남긴다(state·오버라이드 수·환율 수)
     ② `quote_verify.js`에 7단계 `ratesrc` — `applied`가 아니면 **고객 자동 발급을 막는다**
        (링크 대신 「담당자 확인이 필요한 견적」으로 간다. 리드는 그대로 저장된다.)
     ③ 관리자 견적 상세는 **이미** 걸린 단계를 사람 말로 풀어 준다 — 새 목록을
        만들지 않았다(`verifyDetailHtml`이 `steps`를 그대로 읽는다).

   ⚠ 이건 **조작 방어가 아니다.** 표식을 지우고 보내면 그만이고, 조작은 다른 단계가
     본다. 여기서 막는 것은 **우리 쪽 사고**로 만들어진 문서다.
   ⚠ `rateSource`가 **없으면 통과**시킨다 — 캐시된 옛 `script.js`가 열려 있는 브라우저를
     실패로 치면 멀쩡히 돌던 견적이 통째로 「담당자 확인」으로 떨어진다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { verifyQuote } = require(path.join(ROOT, 'api', '_lib', 'quote_verify.js'));
const destinationRates = require(path.join(ROOT, 'data.js'));
const { bootEngine } = require(path.join(__dirname, '_engine_boot.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XI 어느 요율표로 계산했는가`);
  process.exit(fail ? 1 : 0);
};

const BKK = destinationRates.find((d) => d.destination_key === '방콕');
const CTX = { overrides: {}, coefficients: null };
const stepOf = (r, id) => r.steps.find((s) => s.id === id);

function goodQuote(over = {}) {
  const items = [
    { name: '항공료', amount: 12000000, unit: 600000, qty: '20명', isHidden: false },
    { name: '호텔',   amount: 4000000,  unit: 200000, qty: '10실×4박', isHidden: false },
    { name: '마진',   amount: 3000000,  unit: 150000, qty: '20명', isHidden: true },
  ];
  const total = items.reduce((a, i) => a + i.amount, 0);
  const hidden = items.filter((i) => i.isHidden).reduce((a, i) => a + i.amount, 0);
  return {
    destination: '방콕', participants: 20, days: 5, startDate: '2027-05-10',
    total, perPerson: Math.round(total / 20),
    visibleTotal: total - hidden, hiddenTotal: hidden,
    items, rateDate: BKK.rateDate,
    paxFactor: 0.95, seasonFactor: 1.0, leadFactor: 1.0, peakFactor: 1.0,
    fxAdjust: 1.0, bizFactor: 1.0, departureFactor: 1.0,
    ...over,
  };
}

console.log('\n[1] 새 단계 — 「운영 요율로 계산」');
{
  /* 하위호환이 먼저다. 이걸 깨면 캐시된 브라우저의 정상 견적이 전부 걸린다. */
  const none = verifyQuote(goodQuote(), CTX);
  ok('① rateSource가 없으면 단계 자체가 없다(옛 브라우저)', !stepOf(none, 'ratesrc'), '');
  ok('① 그리고 그 견적은 그대로 통과한다', none.ok && none.verdict === 'verified');

  const applied = verifyQuote(goodQuote({ rateSource: { state: 'applied', n: 23, fx: 23 } }), CTX);
  /* ⚠ 단계가 아예 없을 수도 있다(고치기 전 상태) — 그때 터지면 「몇 건이 깨지는지」를
     못 센다. 없는 것도 **실패로 세어서** 말한다. */
  const sApplied = stepOf(applied, 'ratesrc');
  ok('① 단계가 실제로 생겼다', !!sApplied);
  ok('① applied면 통과한다', applied.ok && !!sApplied && sApplied.ok);
  ok('① 무엇을 받았는지 숫자로 남긴다',
    !!sApplied && /오버라이드 23곳 · 환율 23건/.test(sApplied.detail),
    sApplied && sApplied.detail);

  ['failed', 'pending', 'skipped', 'unknown'].forEach((state) => {
    const r = verifyQuote(goodQuote({ rateSource: { state, n: 0, fx: 0 } }), CTX);
    ok('① ' + state + '이면 걸린다', !r.ok && r.failedSteps.includes('ratesrc'));
    ok('① ' + state + '은 거부가 아니라 review다', r.verdict === 'review');
    /* 「실패」로 뭉뚱그리면 담당자가 조작인지 사고인지 못 가른다 */
    const sr = stepOf(r, 'ratesrc');
    ok('① ' + state + '을 사람 말로 설명한다',
      !!sr && /계산|로드|출처/.test(sr.detail) && /재산출/.test(sr.detail), sr && sr.detail);
  });

  /* 🔴 다른 단계를 건드리지 않았다 — 걸리는 것은 새 단계 하나뿐이어야 한다 */
  const only = verifyQuote(goodQuote({ rateSource: { state: 'failed' } }), CTX);
  ok('① 걸리는 단계는 새 단계 하나뿐이다', only.failedSteps.join(',') === 'ratesrc', only.failedSteps.join(','));
  /* 이상한 값이 와도 죽지 않는다(공개 입력이다 — 결함 생성기 ④) */
  [null, 'applied', 42, [], { state: 123 }, { state: 'applied', n: '많이' }].forEach((v, i) => {
    let r; try { r = verifyQuote(goodQuote({ rateSource: v }), CTX); } catch (e) { r = null; }
    ok('① 이상한 rateSource[' + i + ']에도 안 죽는다', !!r && Array.isArray(r.steps));
  });
  const longErr = verifyQuote(goodQuote({ rateSource: { state: 'failed', error: 'x'.repeat(500) } }), CTX);
  const sLong = stepOf(longErr, 'ratesrc');
  ok('① 긴 오류 문자열은 잘라서 담는다', !!sLong && sLong.detail.length < 200,
    String(sLong && sLong.detail.length));
}

console.log('\n[2] 🔴 실제로 계산해 본다 — 요율을 받은 브라우저 vs 못 받은 브라우저');
(async () => {
  /* 오버라이드 한 칸만 바꾼다. **금액이 실제로 움직이는지**를 먼저 보여야
     이 검사 전체가 무엇을 지키는지가 뜻을 갖는다. */
  const DEST = '다낭';
  const base = destinationRates.find((d) => d.destination_key === DEST);
  const RATES = {
    overrides: { [DEST]: { airfare: Math.round(base.airfare * 1.3) } },
    fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {},
  };
  const d = new Date(); d.setDate(d.getDate() + 90);
  const TRIP = { dest: DEST, pax: 30, days: 4, date: d.toISOString().slice(0, 10) };

  const good = await bootEngine({ quiet: true, ratesResponse: RATES });
  const bad = await bootEngine({ quiet: true, ratesResponse: 'fail' });

  ok('② 받은 브라우저는 applied라고 말한다', good.window.__RATE_SOURCE__.state === 'applied',
    good.window.__RATE_SOURCE__.state);
  ok('② 그리고 무엇을 얹었는지 안다', (good.window.__RATE_SOURCE__.applied || []).includes(DEST),
    JSON.stringify(good.window.__RATE_SOURCE__.applied));
  ok('② 못 받은 브라우저는 failed라고 말한다', bad.window.__RATE_SOURCE__.state === 'failed',
    bad.window.__RATE_SOURCE__.state);

  const a = good.run(TRIP), b = bad.run(TRIP);
  const pct = ((b.total - a.total) / a.total) * 100;
  ok('② 🔴 같은 여행인데 금액이 다르다', Math.abs(pct) > 1,
    a.total.toLocaleString() + ' vs ' + b.total.toLocaleString() + ' (' + pct.toFixed(1) + '%)');
  console.log('      ↳ 항공 단가 한 칸(+30%)만으로 총액이 ' + pct.toFixed(1) + '% 움직였다'
    + ' — 운영 실측은 23곳 전부·중앙값 5.9%·최대 27.3%였다');

  console.log('\n[3] 견적 기록이 그 사실을 싣고 간다 — 폼을 실제로 제출해 본다');
  const submit = (E) => {
    const doc = E.window.document;
    /* ⚠ 제출 핸들러는 버튼 애니메이션 때문에 `requestAnimationFrame`을 부른다.
       jsdom 기본 창에는 그게 없어서 **핸들러가 그 자리에서 죽고**, 견적 기록이
       만들어지기 전에 끝난다 — 화면 문제가 아니라 **검사 환경 문제**다. */
    if (typeof E.window.requestAnimationFrame !== 'function') {
      E.window.requestAnimationFrame = (cb) => E.window.setTimeout(cb, 0);
    }
    /* 같은 이유로 화면 스크롤도 없다(jsdom은 레이아웃이 없다) */
    E.window.HTMLElement.prototype.scrollIntoView = function () {};
    E.window.scrollTo = () => {};
    doc.getElementById('destination').value = TRIP.dest;
    doc.getElementById('participants').value = String(TRIP.pax);
    doc.getElementById('days').value = String(TRIP.days);
    doc.getElementById('startDate').value = TRIP.date;
    const fill = { organization: '한빛교회', contactName: '김보균', contactTel: '010-1234-5678' };
    Object.entries(fill).forEach(([id, v]) => { const el = doc.getElementById(id); if (el) el.value = v; });
    /* 남은 필수 칸은 무엇이든 채운다 — 하나라도 비면 제출 자체가 조용히 안 된다 */
    doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
      if (!String(el.value || '').trim()) el.value = el.tagName === 'SELECT' && el.options.length ? el.options[el.options.length - 1].value : '확인';
    });
    doc.getElementById('estimateForm').dispatchEvent(new E.window.Event('submit', { bubbles: true, cancelable: true }));
    return E.window._lastQuoteRecord;
  };
  const recGood = submit(good), recBad = submit(bad);
  ok('③ 견적 기록이 만들어졌다', !!recGood && !!recBad);
  if (recGood && recBad) {
    ok('③ 받은 쪽 기록은 applied', recGood.rateSource && recGood.rateSource.state === 'applied',
      JSON.stringify(recGood.rateSource));
    ok('③ 못 받은 쪽 기록은 failed', recBad.rateSource && recBad.rateSource.state === 'failed',
      JSON.stringify(recBad.rateSource));
    ok('③ 오류 문구도 짧게 남는다', typeof recBad.rateSource.error === 'string' && recBad.rateSource.error.length <= 80);
    /* ⚠ 기존 칸을 하나도 안 잃었는지 — 스냅샷은 역검증의 재료다 */
    ['rateDate', 'coef', 'fxAdjust', 'items', 'total', 'perPerson', 'startDate', 'seasonFactor']
      .forEach((k) => ok('③ 기존 스냅샷 칸 ' + k + '이 그대로 있다', k in recGood));

    console.log('\n[4] 🔴 서버가 그 기록을 보고 갈라 준다 — 진짜 기록으로 검증한다');
    const ctx = { overrides: RATES.overrides, coefficients: null };
    const vGood = verifyQuote(recGood, ctx);
    const vBad = verifyQuote(recBad, ctx);
    ok('④ 요율을 받고 만든 견적은 이 단계를 통과한다', !!stepOf(vGood, 'ratesrc') && stepOf(vGood, 'ratesrc').ok,
      JSON.stringify(vGood.failedSteps));
    ok('④ 🔴 못 받고 만든 견적은 걸린다', vBad.failedSteps.includes('ratesrc'));
    ok('④ 그래서 고객 자동 발급이 막힌다(verdict review)', vBad.verdict === 'review');
    /* 막는 것이 목적이 아니라 **사람에게 넘기는 것**이 목적이다 — 리드는 살아 있다 */
    ok('④ 그래도 거부가 아니라 단계 기록으로 남는다', Array.isArray(vBad.steps) && vBad.steps.length >= 8);
  }

  console.log('\n[5] 화면·기록이 같은 말을 하는가');
  {
    const SRC = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    const VER = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'quote_verify.js'), 'utf8');
    const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    ok('⑤ 기록을 만드는 곳은 한 곳이다(window.__RATE_SOURCE__)',
      (SRC.match(/rateSource:/g) || []).length === 1);
    ok('⑤ 서버는 state 하나만 통과시킨다', /st === 'applied'/.test(VER));
    /* 🔴 관리자 화면에 **새 목록을 만들지 않았다** — 걸린 단계를 그대로 읽는다.
       여기에 단계 이름을 또 적으면 다음 단계를 추가할 때 하나가 빠진다(결함 생성기 ①). */
    ok('⑤ 관리자 화면은 단계를 그대로 읽어 보여준다',
      /verifyDetailHtml/.test(ADMIN) && /steps \|\| \[\]\)\.filter\(x => !x\.ok\)/.test(ADMIN));
    ok('⑤ 관리자 화면에 단계 이름 목록을 새로 만들지 않았다', !/ratesrc/.test(ADMIN));
  }

  done();
})();

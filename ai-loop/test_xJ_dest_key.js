/* ═══════════════════════════════════════════════════════════════════════════
   XJ — 목적지 이름이 둘이라, **촘촘하라고 보낸 스냅샷이 검증을 통째로 껐다**
   ───────────────────────────────────────────────────────────────────────────
   XI를 만들다 진짜 견적 기록으로 `verifyQuote`를 돌려 보고 나왔다. 소스만 봤으면
   못 봤다 — 두 파일이 각자 맞는 이름을 쓰고 있어서, 따로 보면 둘 다 옳다.

   ■ 🔴 무엇이 잘못돼 있었나

     브라우저 견적 스냅샷(`script.js`의 `estRecord`)  → 목적지를 **`destKey`**로 담는다
     공유 payload에서 만든 얕은 대조판(`shareToVerifyPayload`) → **`destination`**으로 담는다
     서버 판정(`quote_verify.js`)                     → **`destination`만** 봤다

   → 스냅샷이 딸려 온 견적은 1단계에서 **「알 수 없는 목적지: undefined」**로 걸렸다.
     1단계에서 걸리면 그 뒤 **요율표 대비 상식 범위·요율 기준월 일치가 아예 안 돈다**
     (`dest`가 null이라 두 단계가 통째로 건너뛰어진다). 즉 검증의 알맹이가 꺼진 상태다.

   🔴 그리고 고객 자동 발급은 **통과해야만** 링크가 나간다(`api/quote-shares`).
     그래서 고객이 계산기로 뽑은 견적은 언제나 「담당자 확인이 필요한 견적입니다」로
     떨어졌다 — 링크를 받은 적이 없다. 실측: 이 검사 [2]에서 이름을 지우면 그대로 재현된다.

   ⚠ 아이러니: **얕은 payload(`destination`)는 통과했다.** 스냅샷을 함께 보내는 쪽이
     「검증이 더 촘촘해진다」던 그 경로만 조용히 무력해져 있었다.

   ⚠ `test_pO`가 못 잡은 이유가 중요하다 — 픽스처를 **코드를 보고** 지었다
     (`destination: '방콕'`). 서버가 실제로 받는 모양이 아니었다. 그래서 이 검사는
     합성 payload가 아니라 **엔진을 띄워 폼을 제출해 나온 진짜 기록**으로 잰다.
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
  console.log(`결과: ${pass} pass / ${fail} fail  — XJ 목적지 이름이 둘이다`);
  process.exit(fail ? 1 : 0);
};

const SRC = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const SHARES = fs.readFileSync(path.join(ROOT, 'api', 'quote-shares.js'), 'utf8');
const QUOTES = fs.readFileSync(path.join(ROOT, 'api', 'quotes.js'), 'utf8');
const stepOf = (r, id) => r.steps.find((s) => s.id === id);
const BKK = destinationRates.find((d) => d.destination_key === '방콕');

function payload(over = {}) {
  const items = [
    { name: '항공료', amount: 12000000, unit: 600000, qty: '20명', isHidden: false },
    { name: '호텔',   amount: 4000000,  unit: 200000, qty: '10실×4박', isHidden: false },
    { name: '마진',   amount: 3000000,  unit: 150000, qty: '20명', isHidden: true },
  ];
  const total = items.reduce((a, i) => a + i.amount, 0);
  const hidden = items.filter((i) => i.isHidden).reduce((a, i) => a + i.amount, 0);
  return {
    participants: 20, days: 5, startDate: '2027-05-10',
    total, perPerson: Math.round(total / 20),
    visibleTotal: total - hidden, hiddenTotal: hidden,
    items, rateDate: BKK.rateDate,
    paxFactor: 0.95, seasonFactor: 1.0, leadFactor: 1.0, peakFactor: 1.0,
    fxAdjust: 1.0, bizFactor: 1.0, departureFactor: 1.0,
    ...over,
  };
}
const CTX = { overrides: {}, coefficients: null };

console.log('\n[1] 이름이 둘인 것을 **세어서** 확인한다 — 셋이 되면 여기서 걸린다');
{
  /* 소스에서 실제로 쓰는 이름을 본다. 「둘 다 받는다」는 주석이 아니라 사실이어야 한다. */
  ok('① 브라우저 스냅샷은 destKey로 담는다',
    /const estRecord = \{[\s\S]{0,200}destKey,/.test(SRC) && !/const estRecord = \{[\s\S]{0,400}destination:/.test(SRC));
  ok('① 공유 대조판은 destination으로 담는다', /destination: s\.dk,/.test(SHARES));

  const byNew = verifyQuote(payload({ destKey: '방콕' }), CTX);
  const byOld = verifyQuote(payload({ destination: '방콕' }), CTX);
  ok('① destKey로도 목적지를 찾는다', stepOf(byNew, 'dest').ok, stepOf(byNew, 'dest').detail);
  ok('① destination으로도 찾는다(옛 이름을 안 버렸다)', stepOf(byOld, 'dest').ok);
  ok('① 둘 다 통과한다', byNew.ok && byOld.ok, byNew.failedSteps + ' / ' + byOld.failedSteps);
  /* 둘 다 있으면 destination이 이긴다 — 순서를 두 곳(판정·ctx 조회)이 같이 써야 한다 */
  const both = verifyQuote(payload({ destination: '방콕', destKey: '아틀란티스' }), CTX);
  ok('① 둘 다 있으면 destination이 이긴다', stepOf(both, 'dest').ok, stepOf(both, 'dest').detail);
  /* 없는 것은 그대로 걸린다 — 「둘 다 받는다」가 「아무거나 통과」가 되면 안 된다 */
  ok('① 이름이 아예 없으면 걸린다', !verifyQuote(payload(), CTX).ok);
  ok('① 없는 목적지는 destKey로 와도 걸린다', !verifyQuote(payload({ destKey: '아틀란티스' }), CTX).ok);

  /* 🔴 ctx를 읽는 곳도 **같은 순서**여야 한다. 여기가 갈리면 관리자가 추가한
     목적지(customRow)를 못 찾아 그 목적지만 조용히 걸린다. */
  ok('① 저장 경로도 같은 순서로 고른다',
    /loadVerifyContext\(payload\.destination \|\| payload\.destKey\)/.test(QUOTES));
}

console.log('\n[2] 🔴 진짜 견적 기록으로 잰다 — 엔진을 띄워 폼을 제출한다');
(async () => {
  const DEST = '다낭';
  const base = destinationRates.find((d) => d.destination_key === DEST);
  /* 오버라이드에 rateDate를 함께 준다 — 「요율 기준월 일치」가 실제로 도는지 보려면
     그 단계가 볼 값이 있어야 한다(운영에서 23곳 중 2곳만 이렇다). */
  const RATES = {
    overrides: { [DEST]: { airfare: Math.round(base.airfare * 1.3), rateDate: '2026-08' } },
    fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {},
  };
  const d = new Date(); d.setDate(d.getDate() + 90);
  const E = await bootEngine({ quiet: true, ratesResponse: RATES });
  const w = E.window, doc = w.document;
  /* jsdom에는 레이아웃·애니메이션이 없다 — 없으면 제출 핸들러가 그 자리에서 죽는다 */
  if (typeof w.requestAnimationFrame !== 'function') w.requestAnimationFrame = (cb) => w.setTimeout(cb, 0);
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};

  doc.getElementById('destination').value = DEST;
  doc.getElementById('participants').value = '30';
  doc.getElementById('days').value = '4';
  doc.getElementById('startDate').value = d.toISOString().slice(0, 10);
  doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
    if (!String(el.value || '').trim()) {
      el.value = el.tagName === 'SELECT' && el.options.length ? el.options[el.options.length - 1].value : '010-1234-5678';
    }
  });
  doc.getElementById('estimateForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  const rec = w._lastQuoteRecord;
  ok('② 진짜 견적 기록이 나왔다', !!rec && !!rec.items && rec.items.length > 0);
  if (!rec) return done();
  ok('② 그 기록에는 destination이 **없다**(destKey뿐이다)',
    rec.destination === undefined && rec.destKey === DEST, String(rec.destination));

  const ctx = { overrides: RATES.overrides, coefficients: null };
  const now = verifyQuote(rec, ctx);
  ok('② 🔴 이제 목적지를 찾는다', stepOf(now, 'dest').ok, stepOf(now, 'dest').detail);
  ok('② 그리고 견적 전체가 검증을 통과한다(verdict verified)',
    now.ok && now.verdict === 'verified', JSON.stringify(now.failedSteps));

  /* 🔴 결함의 크기를 **단계 수로** 잰다. 이름을 못 찾으면 뒤의 두 단계가 아예 안 돈다 —
     「걸렸다」가 아니라 **검사되지 않았다**는 것이 이 결함의 진짜 무게다. */
  const blind = verifyQuote({ ...rec, destKey: undefined }, ctx);
  ok('② 이름이 없으면 그대로 재현된다(고치기 전 상태)',
    !blind.ok && blind.failedSteps.includes('dest'), JSON.stringify(blind.failedSteps));
  const gone = now.steps.filter((s) => !blind.steps.some((b) => b.id === s.id)).map((s) => s.id);
  ok('② 그때는 요율표 대조·기준월 검사가 통째로 안 돈다',
    gone.includes('band') && gone.includes('freshness'), gone.join(',') || '(없음)');
  console.log('      ↳ 단계 ' + now.steps.length + '개 → ' + blind.steps.length
    + '개 (안 돌던 단계: ' + gone.join(', ') + ')');

  /* 고객 자동 발급은 **통과해야만** 링크가 나간다 — 그래서 이 한 칸이 그 경로 전체였다 */
  ok('② 고객 자동 발급 조건(ok)이 이제 참이다', now.ok === true);
  ok('② 고치기 전에는 거짓이었다', blind.ok === false);

  console.log('\n[3] 🔴 다른 경로도 걸리고 있었다 — 이유는 달랐다(항목 없는 payload)');
  {
    /* `shareToVerifyPayload`를 그대로 흉내 낸다 — 그쪽은 **일부러** items를 안 넘긴다.
       공유 payload의 rows에는 비공개 항목이 빠져 있어 합계가 총액과 안 맞는 게 정상이라
       그대로 대조하면 거짓 실패가 나기 때문이다. 그 파일 주석은 「그래서 건너뛴다」고
       적혀 있었는데, 판정 쪽이 안 건너뛰고 있었다. */
    const shallow = {
      destination: DEST, participants: 30, days: 4,
      startDate: d.toISOString().slice(0, 10),
      total: rec.total, perPerson: rec.perPerson, rateDate: rec.rateDate,
    };
    const r = verifyQuote(shallow, ctx);
    ok('③ 항목 없는 payload가 이제 통과한다', r.ok, JSON.stringify(r.failedSteps));
    ok('③ 합계 대조는 아예 안 한다(거짓 실패 방지)', !stepOf(r, 'sum') && !stepOf(r, 'amounts'));
    /* ⚠ 조용히 건너뛰지 않는다 — **얕게 봤다는 사실이 단계로 남는다** */
    ok('③ 건너뛴 사실을 단계로 남긴다',
      !!stepOf(r, 'items') && stepOf(r, 'items').ok && /생략|없는 payload/.test(stepOf(r, 'items').label + stepOf(r, 'items').detail),
      stepOf(r, 'items') && stepOf(r, 'items').detail);
    /* 🔴 「안 온 것」과 「비어서 온 것」은 다르다 — 빈 배열은 그대로 실패다 */
    const empty = verifyQuote({ ...shallow, items: [] }, ctx);
    ok('③ 빈 항목 배열은 여전히 걸린다', !empty.ok && empty.failedSteps.includes('items'),
      JSON.stringify(empty.failedSteps));
    /* 그리고 조작은 여전히 잡힌다 — 얕아졌다고 뚫리면 안 된다 */
    const tampered = verifyQuote({ ...shallow, total: 1000, perPerson: 33 }, ctx);
    ok('③ 항목이 없어도 말도 안 되는 금액은 잡는다', !tampered.ok, JSON.stringify(tampered.failedSteps));
    /* 촘촘한 쪽은 계속 촘촘하다 — 스냅샷이 오면 합계까지 본다 */
    ok('③ 스냅샷이 오면 합계 단계가 그대로 돈다', !!stepOf(now, 'sum') && stepOf(now, 'sum').ok);
  }

  done();
})();

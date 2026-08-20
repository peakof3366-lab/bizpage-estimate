/* VK 검증: **금액 구간별 마진 계수** — 저가 구간만 올리고, 나머지는 손대지 않는다.

   대표 결정 2026-08-20(A안): **원가소계 120만 미만 구간의 마진 ×1.45.**

   왜 저가 구간만인가 — 견적서 36건 실측(구간 기준 = 원가소계, 마진·보험 뺀 1인 금액):
       ~120만 13건 마진율 18.8% 오차 **-16.6%**  ← 여기만 벗어나 있었다
       120~180만 16건 +4.5% · 180~250만 3건 +6.5% · 250만~ 4건 -2.9%
   전 구간에 같은 배수를 걸면 이미 맞는 세 구간이 함께 밀려난다(VI 실측: ±10% 안 14→12).

   ⚠ **이 검사가 왜 필요한가.** VK를 넣고 스위트를 돌렸더니 **하나도 안 걸렸다** —
     계산식을 바꿨는데 회귀가 없다는 것은 그 경로가 **테스트로 안 덮여 있다**는 뜻이다.
     여기서 덮는다. 안 그러면 다음에 누가 배수를 바꿔도 아무 일도 안 일어난다.

   여기서 고정하는 것:
   ① 저가 구간에서 마진 두 줄이 함께 1.45배가 된다(ENBT·현지가 1 : 0.9로 묶여 있다).
   ② 120만 이상은 **한 푼도 안 바뀐다** — 이미 맞는 구간을 건드리지 않는 것이 A안의 요점이다.
   ③ 구간 판정은 **마진·보험을 뺀 소계**로 한다(총액으로 끊으면 순환이 된다).
   ④ 스냅샷에 배수·구간명·판정에 쓴 소계가 함께 남는다 — 배수만 남기면 **왜 그 구간이
      됐는지**를 화면이 말할 수 없다.
   ⑤ 구간표는 `data.js` 하나가 진실이고, 마지막 구간은 `max: null`이다.

   실행: node ai-loop/test_vK_margin_band.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DATA = require(path.join(ROOT, 'data.js'));
const EXPOSE = '\n;try{window.__DR=destinationRates;window.__MB=MARGIN_BANDS;'
  + 'window.__mbf=marginBandFor;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n'
  + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[0] 구간표는 data.js 하나가 진실이다');
{
  ok('⑤ MARGIN_BANDS가 있다', Array.isArray(DATA.MARGIN_BANDS) && DATA.MARGIN_BANDS.length >= 2);
  /* ⚠ 마지막이 null이 아니면 그 위 금액이 조용히 배수 1이 된다 */
  ok('⑤ 마지막 구간이 나머지를 전부 받는다(max null)',
    DATA.MARGIN_BANDS[DATA.MARGIN_BANDS.length - 1].max === null);
  ok('⑤ 저가 구간 배수는 1.45다', DATA.marginBandFor(0).mul === 1.45, String(DATA.marginBandFor(0).mul));
  ok('⑤ 경계는 「미만」이다 (120만은 다음 구간)',
    DATA.marginBandFor(1199999).mul === 1.45 && DATA.marginBandFor(1200000).mul === 1,
    DATA.marginBandFor(1199999).mul + ' / ' + DATA.marginBandFor(1200000).mul);
}

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise((r) => setTimeout(r, 120));
  const doc = window.document;
  const gbd = window.getBreakdownData;
  if (typeof gbd !== 'function' || !window.__MB) { console.log('✗ 로드 실패'); process.exit(1); }

  const setForm = (dest, days, pax, date = '2027-05-10') => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = date;
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing']
      .forEach((id) => { const e = doc.getElementById(id); if (e) e.checked = true; });
    return gbd();
  };
  const per = (bd, re) => bd.rows.filter((r) => re.test(r.name))
    .reduce((s, r) => s + r.amount, 0) / Number(doc.getElementById('participants').value);

  console.log('\n[1] 스냅샷이 판정 근거를 들고 있다');
  {
    const bd = setForm('제주도', 3, 24);
    ok('④ 배수를 남긴다', typeof bd.marginBandMul === 'number', String(bd.marginBandMul));
    ok('④ 구간명을 남긴다', typeof bd.marginBandLabel === 'string' && bd.marginBandLabel.length > 0,
      bd.marginBandLabel);
    /* ⚠ 배수만 남기면 **왜 그 구간이 됐는지**를 화면이 말할 수 없다 */
    ok('④ 판정에 쓴 소계까지 남긴다', typeof bd.costSubtotalUnit === 'number' && bd.costSubtotalUnit > 0,
      String(bd.costSubtotalUnit));
    /* ③ 소계는 마진·보험을 뺀 값이어야 한다 — 총액으로 끊으면 순환이 된다 */
    const mar = per(bd, /수익/), ins = per(bd, /보험/);
    const gap = Math.abs(bd.costSubtotalUnit - (bd.perPerson - mar - ins));
    ok('③ 소계 = 총액 − 마진 − 보험 (계수 1.0 기준)', gap < 2, '차이 ' + Math.round(gap));
    ok('③ 그 소계로 판정한 구간과 배수가 맞는다',
      bd.marginBandMul === DATA.marginBandFor(bd.costSubtotalUnit).mul);
  }

  console.log('\n[2] 저가 구간은 오르고, 그 위는 한 푼도 안 바뀐다');
  {
    /* 제주도 24명 3일 — 실측 코퍼스에서 원가소계 83만대(저가 구간) */
    const low = setForm('제주도', 3, 24);
    ok('① 저가 구간으로 판정된다', low.marginBandMul === 1.45,
      '소계 ' + Math.round(low.costSubtotalUnit) + ' · ×' + low.marginBandMul);
    const jeju = window.__DR.find((d) => d.destination_key === '제주도');
    const enbt = low.rows.find((r) => /ENBT/.test(r.name));
    const local = low.rows.find((r) => /현지 수익/.test(r.name));
    /* 인원 24명 → ENBT 구간계수가 붙으므로 정확한 배수는 현지 쪽으로 확인한다
       (현지 수익금은 인원과 무관하게 margin × 0.9 고정이라 배수가 그대로 보인다) */
    ok('① 현지 수익금이 정확히 1.45배다',
      local && local.unit === Math.round(jeju.margin_per_traveler * 1.45 * 0.90),
      local && (local.unit + ' vs ' + Math.round(jeju.margin_per_traveler * 1.45 * 0.90)));
    ok('① ENBT 수익도 함께 올랐다', enbt && enbt.unit > jeju.margin_per_traveler,
      enbt && String(enbt.unit));

    /* 싱가포르 5명 6일 — 코퍼스에서 원가소계 354만대(가장 비싼 구간) */
    const high = setForm('싱가포르', 6, 5);
    ok('② 120만 이상은 배수 1이다', high.marginBandMul === 1,
      '소계 ' + Math.round(high.costSubtotalUnit) + ' · ×' + high.marginBandMul);
    const sg = window.__DR.find((d) => d.destination_key === '싱가포르');
    const hLocal = high.rows.find((r) => /현지 수익/.test(r.name));
    ok('② 그 구간 현지 수익금은 예전 그대로다',
      hLocal && hLocal.unit === Math.round(sg.margin_per_traveler * 0.90),
      hLocal && (hLocal.unit + ' vs ' + Math.round(sg.margin_per_traveler * 0.90)));
  }

  console.log('\n[3] 배수를 1로 되돌리면 값이 원래대로다 (되돌릴 수 있는가)');
  {
    /* ⚠ 되돌릴 수 없는 변경은 넣으면 안 된다. 구간표를 1로 바꾸면 예전 금액이 나와야 한다. */
    const before = setForm('제주도', 3, 24).perPerson;
    const MB = window.__MB;
    const saved = MB[0].mul;
    MB[0].mul = 1;
    const reverted = setForm('제주도', 3, 24).perPerson;
    MB[0].mul = saved;
    const again = setForm('제주도', 3, 24).perPerson;
    ok('③ 1로 두면 금액이 내려간다', reverted < before, reverted + ' < ' + before);
    ok('③ 되돌리면 다시 같아진다', again === before, again + ' vs ' + before);
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

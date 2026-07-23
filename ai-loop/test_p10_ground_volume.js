/* P10 검증: 식사·관광 지상비 볼륨 할인(누진)이 정확히 적용되고, 소규모는 회귀 없음,
   총액 단조성 보장, 관광이 식사보다 완만, 호텔·가이드는 볼륨 할인 없음을 실제 스크립트로 확인.
   실행: node ai-loop/test_p10_ground_volume.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const approx = (a, b, eps = 1) => Math.abs(a - b) <= eps; // 원단위 반올림 허용

/* 코드의 tieredTotal과 동일 로직(검증용 재구현) */
const MEAL_TIERS = [{min:1,max:9,f:1.00},{min:10,max:29,f:0.98},{min:30,max:49,f:0.95},{min:50,max:Infinity,f:0.92}];
const SIGHT_TIERS = [{min:1,max:9,f:1.00},{min:10,max:29,f:0.99},{min:30,max:49,f:0.97},{min:50,max:Infinity,f:0.95}];
function tiered(unit, pax, tiers) {
  let total = 0;
  for (const t of tiers) { if (pax < t.min) continue; const c = Math.min(pax, t.max) - t.min + 1; total += Math.round(unit * t.f) * c; }
  return total;
}

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise(r => setTimeout(r, 100));
  const doc = window.document;
  const gbd = window.getBreakdownData;
  if (typeof gbd !== 'function') { console.log('✗ 로드 실패'); process.exit(1); }

  const DAYS = 4, MEALCT = DAYS * 2 - 1; // 7식
  const bdFor = (pax) => {
    doc.getElementById('destination').value = '도쿄';
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(DAYS);
    doc.getElementById('startDate').value = '2027-06-15'; // 비피크(피크·리드 영향 최소)
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id => { const e=doc.getElementById(id); if(e) e.checked=true; });
    return gbd();
  };
  const row = (bd, re) => bd.rows.find(r => re.test(r.name));
  const mealAmt = (bd) => row(bd, /식사/).amount;
  const sightAmt = (bd) => row(bd, /관광/).amount;

  console.log('[0] 기준 단가 추출(소규모 pax=5, 할인 0)');
  const b5 = bdFor(5);
  const mealUnit = row(b5, /식사/).unit;   // 할인 없는 1인1식 단가
  const sightUnit = row(b5, /관광/).unit;  // 할인 없는 1인 입장료
  ok('추출 성공', mealUnit > 0 && sightUnit > 0, `meal=${mealUnit} sight=${sightUnit}`);

  console.log('[1] 소규모(≤9) — 볼륨 할인 없음(회귀: 선형과 동일)');
  ok('식사 amount=단가×5×7(선형)', approx(mealAmt(b5), mealUnit * 5 * MEALCT), `${mealAmt(b5)} vs ${mealUnit*5*MEALCT}`);
  ok('관광 amount=단가×5(선형)', approx(sightAmt(b5), sightUnit * 5));

  console.log('[2] 대규모(50명) — 누진 할인 정확 적용');
  const b50 = bdFor(50);
  const expMeal50 = tiered(mealUnit, 50, MEAL_TIERS) * MEALCT;
  const expSight50 = tiered(sightUnit, 50, SIGHT_TIERS);
  ok('식사 누진 총액 일치', approx(mealAmt(b50), expMeal50), `${mealAmt(b50)} vs ${expMeal50}`);
  ok('관광 누진 총액 일치', approx(sightAmt(b50), expSight50), `${sightAmt(b50)} vs ${expSight50}`);
  ok('식사 50명 < 선형(할인 발생)', mealAmt(b50) < mealUnit * 50 * MEALCT);
  ok('관광 50명 < 선형(할인 발생)', sightAmt(b50) < sightUnit * 50);

  console.log('[3] 관광이 식사보다 완만(할인율 더 작음, 같은 50명)');
  const mealDisc = 1 - mealAmt(b50) / (mealUnit * 50 * MEALCT);
  const sightDisc = 1 - sightAmt(b50) / (sightUnit * 50);
  ok('관광 할인율 < 식사 할인율', sightDisc < mealDisc, `sight ${(sightDisc*100).toFixed(2)}% < meal ${(mealDisc*100).toFixed(2)}%`);

  console.log('[4] 총액 단조성 — 구간 경계에서 식사 총액 역전 없음');
  let mono = true, prev = -1;
  for (const pax of [9,10,29,30,49,50,80]) {
    const a = mealAmt(bdFor(pax));
    if (a < prev - 1) { mono = false; console.log(`    역전! pax=${pax} amount=${a} < prev=${prev}`); }
    prev = a;
  }
  ok('pax 증가 시 식사 총액 non-decreasing', mono);

  console.log('[5] 호텔·가이드 — 볼륨 할인 없음(단가 pax 불변)');
  const hotelUnit5 = row(b5, /호텔/).unit, hotelUnit50 = row(b50, /호텔/).unit;
  ok('호텔 단가 pax 5=50 동일(볼륨 할인 제외)', hotelUnit5 === hotelUnit50, `${hotelUnit5} vs ${hotelUnit50}`);
  const guide5 = row(b5, /가이드/).amount, guide50 = row(b50, /가이드/).amount;
  ok('가이드 총액 pax 5=50 동일(일당정액)', guide5 === guide50, `${guide5} vs ${guide50}`);

  console.log('[6] 30~49구간(30명) 부분 할인 확인');
  const b30 = bdFor(30);
  ok('식사 30명 누진 총액 일치', approx(mealAmt(b30), tiered(mealUnit,30,MEAL_TIERS)*MEALCT));
  ok('식사 30명 < 선형', mealAmt(b30) < mealUnit*30*MEALCT);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

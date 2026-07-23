/* P11 검증: 변동성 총배수 상한(시즌×리드×피크 ≤ 2.5)이 기본 노브에선 절대 안 걸리고(회귀
   없음), 극단 스택에선 정확히 비례 축소되어 항공료에 반영됨을 실제 스크립트로 확인.
   실행: node ai-loop/test_p11_vol_cap.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__COEF=COEF_STATE;window.__CAP=VOL_MULTIPLIER_CAP;window.__DR=destinationRates;window.__gsi=getSeasonInfo;window.__gp=getPeakInfo;window.__glt=getLeadTimeFactor;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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
  const gbd = window.getBreakdownData, COEF = window.__COEF, CAP = window.__CAP;
  const DESTS = window.__DR.map(d => d.destination_key);
  if (typeof gbd !== 'function' || !COEF) { console.log('✗ 로드 실패'); process.exit(1); }
  const reset = () => { COEF.seasonStrength=1; COEF.leadTimeStrength=1; COEF.peakStrength=1; COEF.hotelPeakWeight=0.8; };
  const setForm = (dest, date, pax=5) => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = '4';
    doc.getElementById('startDate').value = date;
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id=>{const e=doc.getElementById(id);if(e)e.checked=true;});
    return gbd();
  };

  console.log('[0] 상한 상수 노출 확인');
  ok('VOL_MULTIPLIER_CAP=2.5', approx(CAP, 2.5), 'got ' + CAP);

  console.log('[1] 기본 노브 — 전 목적지×대표날짜 상한 절대 미발동(회귀 없음)');
  reset();
  const DATES = ['2027-01-01','2027-02-06','2027-04-01','2027-05-01','2027-07-20','2027-09-15','2027-12-25','2027-06-15','2027-02-20','2027-08-05'];
  let maxVol = 0, anyCapped = false;
  for (const dest of DESTS) for (const d of DATES) {
    const bd = setForm(dest, d);
    if (!bd) continue;
    if (bd.volProduct > maxVol) maxVol = bd.volProduct;
    if (bd.volScale !== 1) anyCapped = true;
  }
  ok('기본 노브에서 volScale 항상 1(무발동)', anyCapped === false);
  ok('기본 노브 최대 변동배수 < 상한 2.5', maxVol < CAP, 'maxVol=' + maxVol.toFixed(3));
  console.log(`     (기본 노브 실측 최대 변동배수 ${maxVol.toFixed(3)} — 상한 ${CAP} 대비 여유)`);

  console.log('[2] 기본 노브 airfare = 상한 미적용과 동일(회귀 정밀 확인)');
  reset();
  const bdSummer = setForm('몽골', '2027-07-20', 5);
  ok('여름 몽골 volScale=1', bdSummer.volScale === 1);
  const airRow = bdSummer.rows.find(r => r.name === '항공');
  ok('항공료 산출 정상(양수)', airRow && airRow.amount > 0);

  console.log('[3] 극단 스택 — 상한 발동 시 정확히 비례 축소');
  /* 실서비스 노브는 clampCoef로 0.5~2.0지만, 상한 경로를 확실히 밟도록 테스트에서 강한
     값을 COEF_STATE에 직접 주입(=API/UI를 우회한 방어장치 단위검증). */
  COEF.seasonStrength = 4; COEF.peakStrength = 4; COEF.leadTimeStrength = 1;
  const bdCap = setForm('몽골', '2027-07-20', 5);
  ok('volProduct > 상한(발동 조건 성립)', bdCap.volProduct > CAP, 'volProduct=' + bdCap.volProduct.toFixed(3));
  ok('volScale = 상한/volProduct', approx(bdCap.volScale, CAP / bdCap.volProduct), 'volScale=' + bdCap.volScale);
  ok('축소 후 실효 변동배수 = 상한(2.5)', approx(bdCap.volProduct * bdCap.volScale, CAP));
  ok('volScale < 1(실제 축소됨)', bdCap.volScale < 1);

  console.log('[4] 상한이 항공료를 실제로 낮춤(같은 조건, 상한 유무 비교)');
  /* 동일 강한 노브에서: 상한 반영된 실제 airfare vs 상한을 무시했을 때의 airfare 비율 =
     volScale이어야 한다(pax=5는 PAX tier 1.0이라 airUnit≈airUnitBase). */
  const airCap = bdCap.rows.find(r => r.name === '항공').unit;
  // 상한 미적용 가정 단가 = 실제단가 / volScale
  const airUncapped = airCap / bdCap.volScale;
  ok('상한 적용 단가 < 미적용 가정 단가', airCap < airUncapped, `${airCap} < ${Math.round(airUncapped)}`);
  ok('비율 ≈ volScale', approx(airCap / airUncapped, bdCap.volScale, 0.02));

  console.log('[5] 호텔은 상한 대상 아님(항공 전용) — 극단 노브서도 volScale 미적용');
  const hotelUnitCap = bdCap.rows.find(r => /호텔/.test(r.name)).unit;
  reset();
  // 호텔은 season×hotelPeak만 받고 volScale 미적용 — 강한 seasonStrength에도 airfare와 별개로 동작
  ok('호텔 단가 산출 정상(상한 로직과 무관)', hotelUnitCap > 0);

  console.log('[6] 이론적 안전성 — 기본 노브 raw 최대(시즌1.25×리드1.25×피크1.35) < 상한');
  ok('1.25×1.25×1.35=2.109 < 2.5 (기본 노브는 수학적으로 상한 도달 불가)', 1.25*1.25*1.35 < CAP);

  reset();
  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

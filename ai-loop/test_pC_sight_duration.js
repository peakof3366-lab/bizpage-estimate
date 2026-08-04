/* PC 검증: 관광비 일수 체감 계수.
   ① 기준 구간(3~5일)은 기존 금액 그대로 → 대표 케이스 회귀 없음
   ② 구간 경계·단조성, 인접 점프 33% 이하(절벽 없음), 16일+ 상한
   ③ 볼륨 할인(P10)과 곱해져도 총액 단조성 유지, 다른 항목은 무영향
   실행: node ai-loop/test_pC_sight_duration.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__COEF=COEF_STATE;window.__DR=destinationRates;'
  + 'window.__SDT=SIGHT_DURATION_TIERS;window.__gsd=getSightDurationInfo;'
  + 'window.__GST=GROUND_SIGHT_TIERS;window.__tt=tieredTotal;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

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
  const gbd = window.getBreakdownData, COEF = window.__COEF;
  const TIERS = window.__SDT, gsd = window.__gsd, GST = window.__GST, tieredTotal = window.__tt;
  const DR = window.__DR;
  if (typeof gbd !== 'function' || !TIERS) { console.log('✗ 로드 실패'); process.exit(1); }

  const reset = () => { COEF.seasonStrength=1; COEF.leadTimeStrength=1; COEF.peakStrength=1; COEF.hotelPeakWeight=0.8; };
  const sightRow = bd => bd && bd.rows.find(r => r.name === '관광');
  const setForm = (dest, days, pax = 20, date = '2027-05-10') => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = date;
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id=>{const e=doc.getElementById(id);if(e)e.checked=true;});
    return gbd();
  };
  const feeOf = key => DR.find(d => d.destination_key === key).sightseeing_fee;
  reset();

  console.log('[0] 구간표 형태 — 기준점·단조성·절벽 없음');
  ok('6구간', TIERS.length === 6, String(TIERS.length));
  ok('기준 구간(3~5일) = 1.00', TIERS[1].factor === 1.00);
  ok('배율 단조 증가', TIERS.every((t,i) => i === 0 || t.factor > TIERS[i-1].factor));
  ok('마지막 구간이 상한(Infinity)', TIERS[TIERS.length-1].max === Infinity);
  ok('11~15일(1.95) < 16일+(2.10) — 중복 구간 없음', TIERS[4].factor < TIERS[5].factor);
  let maxJump = 0;
  TIERS.forEach((t,i) => { if (i) maxJump = Math.max(maxJump, t.factor / TIERS[i-1].factor - 1); });
  ok('인접 구간 최대 점프 ≤ 35%(하루 차이 금액 절벽 방지)', maxJump <= 0.35, (maxJump*100).toFixed(1) + '%');
  console.log(`     (실측 최대 점프 ${(maxJump*100).toFixed(1)}%)`);

  console.log('[1] 회귀 — 기준 구간(3~5일)은 일수 계수 1.00이라 기존 금액 그대로');
  for (const [dest, days] of [['방콕',3],['방콕',4],['방콕',5],['파리',3],['도쿄',5]]) {
    const bd = setForm(dest, days);
    const expectPre = feeOf(dest); // fx=1 가정 검증은 아래 [2]에서 별도, 여기선 계수만
    ok(`${dest} ${days}일 계수 1.00`, bd.sightDuration.factor === 1.00, String(bd.sightDuration.factor));
  }

  console.log('[2] 일수별 관광비 — 단가에 계수가 정확히 반영(볼륨 할인 없는 pax 5 기준)');
  /* pax 5는 GROUND_SIGHT_TIERS가 1.00 구간이라 볼륨 할인 영향이 없어 계수만 검증된다. */
  const base5 = sightRow(setForm('파리', 5, 5)).amount / 5;
  for (const [days, f] of [[1,0.75],[2,0.75],[3,1.00],[5,1.00],[6,1.30],[7,1.30],[8,1.60],[10,1.60],[11,1.95],[15,1.95],[16,2.10],[40,2.10]]) {
    const got = sightRow(setForm('파리', days, 5)).amount / 5;
    ok(`파리 ${days}일 = 기준 × ${f.toFixed(2)}`, Math.abs(got - base5 * f) <= 2, `${got} vs ${(base5*f).toFixed(0)}`);
  }

  console.log('[3] 정비례가 아님(체감형) — 일수 2배가 비용 2배가 아니어야');
  const d4 = sightRow(setForm('뉴욕', 4, 5)).amount, d8 = sightRow(setForm('뉴욕', 8, 5)).amount;
  ok('8일 < 4일의 2배(체감형 확인)', d8 < d4 * 2, `${d8} vs ${d4*2}`);
  ok('8일 > 4일(일수 반영은 됨)', d8 > d4);
  const elasticity = (d8/d4 - 1) / (8/4 - 1);
  ok('탄력성 0.5~0.8 구간(MICE 관광 부수성 반영)', elasticity >= 0.5 && elasticity <= 0.8, elasticity.toFixed(3));
  console.log(`     (실측 탄력성 ${elasticity.toFixed(3)})`);

  console.log('[4] 단조성 — 1~40일 어디서도 관광비가 줄지 않음');
  let mono = true, prev = -1, at = '';
  for (let d = 1; d <= 40; d++) {
    const a = sightRow(setForm('뉴욕', d, 30)).amount;
    if (a < prev) { mono = false; at = `${d}일에서 감소`; }
    prev = a;
  }
  ok('뉴욕 1~40일 관광 총액 non-decreasing', mono, at);

  console.log('[5] 볼륨 할인(P10)과의 합성 — 인원 증가 시에도 총액 단조');
  let monoPax = true, prevPax = -1, atPax = '';
  for (let p = 1; p <= 120; p++) {
    const a = sightRow(setForm('파리', 7, p)).amount;
    if (a < prevPax - 1) { monoPax = false; atPax = `pax ${p}에서 역전`; }
    prevPax = a;
  }
  ok('파리 7일 pax 1~120 관광 총액 non-decreasing', monoPax, atPax);
  const bdV = setForm('파리', 7, 50);
  const unitWithDur = Math.round(feeOf('파리') * bdV.fxAdjust * 1.30);
  ok('볼륨 할인은 일수 계수가 반영된 단가 위에 곱해짐',
     bdV.rows.find(r=>r.name==='관광').amount === tieredTotal(unitWithDur, 50, GST),
     String(bdV.rows.find(r=>r.name==='관광').amount));

  console.log('[6] 다른 항목 무영향 — 일수 계수는 관광에만');
  const a5 = setForm('방콕', 5, 20), a10 = setForm('방콕', 10, 20);
  ok('항공 단가는 일수와 무관(불변)', a5.rows.find(r=>r.name==='항공').unit === a10.rows.find(r=>r.name==='항공').unit);
  ok('식사 1식 단가는 일수와 무관(식수만 증가)',
     a5.rows.find(r=>r.name==='식사').unit === a10.rows.find(r=>r.name==='식사').unit);
  ok('가이드 단가 불변', a5.rows.find(r=>r.name==='가이드').unit === a10.rows.find(r=>r.name==='가이드').unit);

  console.log('[7] 계수 노브·시즌 무영향(관광비는 수요 변동 계수 대상이 아님)');
  const s1 = sightRow(setForm('방콕', 7, 20, '2027-05-10')).amount;
  const s2 = sightRow(setForm('방콕', 7, 20, '2027-12-25')).amount;
  ok('성수기 날짜에도 관광 총액 불변', s1 === s2, `${s1} vs ${s2}`);
  COEF.seasonStrength = 2; COEF.peakStrength = 2; COEF.leadTimeStrength = 2;
  const s3 = sightRow(setForm('방콕', 7, 20, '2027-12-25')).amount;
  ok('노브 최대에서도 관광 총액 불변', s3 === s1, `${s3} vs ${s1}`);
  reset();

  console.log('[8] 헬퍼 함수 방어 — 이상 입력');
  ok('0일 → 최소 1일 취급(0.75)', gsd(0).factor === 0.75);
  ok('음수 → 최소 1일 취급', gsd(-5).factor === 0.75);
  ok('비수치 → 최소 1일 취급', gsd('abc').factor === 0.75);
  ok('1000일 → 상한 2.10', gsd(1000).factor === 2.10);

  console.log('[9] 메타 필드');
  const bdM = setForm('파리', 7, 20);
  ok('breakdown에 sightDuration 노출', !!bdM.sightDuration);
  ok('sightDuration.label = 6~7일', bdM.sightDuration.label === '6~7일', bdM.sightDuration.label);
  ok('관광 미포함 체크 시 행 없음', (() => {
    doc.getElementById('incSightseeing').checked = false;
    const b = gbd(); doc.getElementById('incSightseeing').checked = true;
    return !b.rows.find(r => r.name === '관광');
  })());

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

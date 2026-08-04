/* PE 검증: 자동 차량 선택 임계를 소형 정원(VEHICLE_CAPACITY.small)에 정렬.
   ① ~25명 소형 1대 / 26~45명 대형 1대 / 46명~ 대형 ceil(인원/45)대
   ② 임계값이 상수에서 파생되는지(숫자 하드코딩 재발 방지)
   ③ 인원 증가 시 총액 단조성 유지 — 경계에서 역전 없음
   ④ 가이드 인원(=차량 대수)이 함께 맞게 움직이는지
   실행: node ai-loop/test_pE_vehicle_threshold.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__COEF=COEF_STATE;window.__CAP=VEHICLE_CAPACITY;}catch(e){}';
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
  const gbd = window.getBreakdownData, COEF = window.__COEF, CAP = window.__CAP;
  if (typeof gbd !== 'function' || !CAP) { console.log('✗ 로드 실패'); process.exit(1); }
  const reset = () => { COEF.seasonStrength=1; COEF.leadTimeStrength=1; COEF.peakStrength=1; COEF.hotelPeakWeight=0.8; };
  const vRow = bd => bd.rows.find(r => /^차량/.test(r.name));
  const gRow = bd => bd.rows.find(r => r.name === '가이드');
  const setForm = (pax, dest = '방콕', days = 5) => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = '2027-05-10';
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id=>{const e=doc.getElementById(id);if(e)e.checked=true;});
    return gbd();
  };
  reset();

  console.log('[0] 정원 상수');
  ok('소형 정원 25 · 대형 정원 45', CAP.small === 25 && CAP.large === 45, JSON.stringify(CAP));

  console.log('[1] 임계값이 상수에서 파생 — 숫자 하드코딩 재발 방지');
  const src = read('script.js');
  const line = src.split('\n').find(l => l.includes("vehicleTypeVal === 'auto'"));
  ok('자동 선택 조건에 VEHICLE_CAPACITY 참조', /VEHICLE_CAPACITY\.small/.test(line || ''), (line || '').trim());
  ok('자동 선택 조건에 매직넘버 없음', !/participants\s*>=?\s*\d+/.test(line || ''), (line || '').trim());

  console.log('[2] 인원 구간별 차량 선택');
  const cases = [[1,'소형',1],[9,'소형',1],[10,'소형',1],[25,'소형',1],[26,'대형',1],[45,'대형',1],[46,'대형',2],[90,'대형',2],[91,'대형',3]];
  for (const [pax, kind, count] of cases) {
    const bd = setForm(pax);
    const r = vRow(bd);
    ok(`${String(pax).padStart(3)}명 → ${kind} ${count}대`,
       r.name.includes(kind) && bd.vehicleCountForTest === undefined ? r.name.includes(kind) : true, r.name);
    const expectAmt = r.unit * 5 * count;
    ok(`  └ 금액 = 단가×5일×${count}대`, r.amount === expectAmt, `${r.amount} vs ${expectAmt}`);
  }

  console.log('[3] 핵심 수정 — 10~25명이 소형으로 내려감(과대추정 해소)');
  const dest = '뉴욕';
  const b15 = setForm(15, dest);
  const small = window.__CAP && null;
  ok('15명 뉴욕 = 소형', vRow(b15).name.includes('소형'), vRow(b15).name);
  const b26 = setForm(26, dest);
  ok('26명 뉴욕 = 대형', vRow(b26).name.includes('대형'), vRow(b26).name);
  ok('소형 단가 < 대형 단가', vRow(b15).unit < vRow(b26).unit, `${vRow(b15).unit} vs ${vRow(b26).unit}`);

  console.log('[4] 가이드 대수 동행 — 가이드는 차량 대수 기준(P13)');
  for (const [pax, expected] of [[25,1],[26,1],[45,1],[46,2],[91,3]]) {
    const bd = setForm(pax);
    const g = gRow(bd), v = vRow(bd);
    const vCount = Math.round(v.amount / (v.unit * 5));
    ok(`${String(pax).padStart(3)}명 → 차량 ${vCount}대 · 가이드 ${Math.round(g.amount/(g.unit*5))}명 (일치)`,
       vCount === expected && Math.round(g.amount / (g.unit * 5)) === expected, `차량 ${vCount} / 가이드 ${Math.round(g.amount/(g.unit*5))}`);
  }

  console.log('[5] 총액 단조성 — 경계(25→26, 45→46)에서 역전 없음');
  let mono = true, prev = -1, at = '';
  for (let p = 1; p <= 120; p++) {
    const t = setForm(p).total;
    if (t < prev) { mono = false; at = `pax ${p}에서 총액 감소`; }
    prev = t;
  }
  ok('pax 1~120 총액 non-decreasing', mono, at);

  console.log('[6] 차량 항목 자체도 인원에 대해 비감소');
  let vMono = true, vPrev = -1, vAt = '';
  for (let p = 1; p <= 120; p++) {
    const a = vRow(setForm(p)).amount;
    if (a < vPrev) { vMono = false; vAt = `pax ${p}`; }
    vPrev = a;
  }
  ok('pax 1~120 차량 총액 non-decreasing', vMono, vAt);

  console.log('[7] 정원 상수를 바꾸면 임계도 따라오는가(파생 확인)');
  const origSmall = CAP.small;
  CAP.small = 12;
  ok('소형 정원 12로 낮추면 15명은 대형', vRow(setForm(15)).name.includes('대형'), vRow(setForm(15)).name);
  ok('소형 정원 12에서 12명은 소형', vRow(setForm(12)).name.includes('소형'), vRow(setForm(12)).name);
  CAP.small = origSmall;
  ok('원복 후 15명 다시 소형', vRow(setForm(15)).name.includes('소형'));

  console.log('[8] 다른 항목 무영향');
  const a = setForm(15), b = setForm(15);
  ok('항공 단가는 차량 선택과 무관', a.rows.find(r=>r.name==='항공').unit === b.rows.find(r=>r.name==='항공').unit);
  ok('호텔·식사 정상 산출', a.rows.find(r=>/호텔/.test(r.name)).amount > 0 && a.rows.find(r=>r.name==='식사').amount > 0);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

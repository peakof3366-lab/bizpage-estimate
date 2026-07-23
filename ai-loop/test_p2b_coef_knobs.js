/* P2b 검증: 계수 스칼라 노브(COEF_STATE)가 견적에 정확히 반영되고, 기본값이면 P2b 이전과
   동일(회귀 없음)임을 실제 index.html 스크립트로 확인.
   실행: node ai-loop/test_p2b_coef_knobs.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* COEF_STATE/헬퍼는 const라 window에 안 붙으므로 같은 eval 스코프 끝에서 노출. */
const EXPOSE = '\n;try{window.__COEF=COEF_STATE;window.__clamp=clampCoef;window.__applyStrength=applyStrength;window.__SPEC=COEF_SPEC;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

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
  await new Promise(r => setTimeout(r, 100));
  const doc = window.document;
  const gbd = window.getBreakdownData;
  const COEF = window.__COEF;
  if (typeof gbd !== 'function' || !COEF) { console.log('✗ 로드 실패'); process.exit(1); }

  const setForm = (startDate) => {
    doc.getElementById('destination').value = '도쿄';
    doc.getElementById('participants').value = '20';
    doc.getElementById('days').value = '4';
    doc.getElementById('startDate').value = startDate || '';
    const inc = doc.getElementById('incHotel'); if (inc) inc.checked = true;
  };
  const resetCoef = () => { COEF.seasonStrength=1.0; COEF.leadTimeStrength=1.0; COEF.peakStrength=1.0; COEF.hotelPeakWeight=0.8; };

  console.log('[1] 기본값 = P2b 이전과 동일(회귀 없음)');
  resetCoef();
  ok('COEF 기본값 {1,1,1,0.8}', approx(COEF.seasonStrength,1)&&approx(COEF.leadTimeStrength,1)&&approx(COEF.peakStrength,1)&&approx(COEF.hotelPeakWeight,0.8));
  setForm('2027-05-01'); // 골든위크(항공 피크 1.35), 5월=일본 시즌 normal 1.0
  const base = gbd();
  ok('기본 항공 peakFactor=1.35 (peakStrength 1)', approx(base.peakFactor, 1.35), 'got '+base.peakFactor);
  ok('기본 호텔 hotelPeakFactor=1.28 (weight 0.8=P7)', approx(base.hotelPeakFactor, 1.28), 'got '+base.hotelPeakFactor);
  ok('기본 seasonFactor=1.0 (5월 normal)', approx(base.seasonFactor, 1.0), 'got '+base.seasonFactor);
  ok('bd.coef 스냅샷 동봉', base.coef && approx(base.coef.hotelPeakWeight,0.8));

  console.log('[2] peakStrength=0.5 → 항공 피크 진폭 절반, 호텔은 독립(weight로만)');
  resetCoef(); COEF.peakStrength = 0.5;
  setForm('2027-05-01');
  const p = gbd();
  ok('항공 peakFactor=1.175 (1+(1.35-1)*0.5)', approx(p.peakFactor, 1.175), 'got '+p.peakFactor);
  ok('호텔 hotelPeakFactor 여전히 1.28 (peakStrength와 독립)', approx(p.hotelPeakFactor, 1.28), 'got '+p.hotelPeakFactor);

  console.log('[3] hotelPeakWeight=0.5 → 호텔 피크만 완만, 항공 피크는 불변');
  resetCoef(); COEF.hotelPeakWeight = 0.5;
  setForm('2027-05-01');
  const h = gbd();
  ok('호텔 hotelPeakFactor=1.175 (1+(1.35-1)*0.5)', approx(h.hotelPeakFactor, 1.175), 'got '+h.hotelPeakFactor);
  ok('항공 peakFactor 여전히 1.35', approx(h.peakFactor, 1.35), 'got '+h.peakFactor);

  console.log('[4] seasonStrength=0.5 → 시즌 진폭 절반 (도쿄 10월 일본peak 1.15)');
  resetCoef(); COEF.seasonStrength = 0.5;
  setForm('2027-10-15'); // 일본 peak [10,11] 1.15, 10월 중순은 날짜피크 없음
  const s = gbd();
  ok('seasonFactor=1.075 (1+(1.15-1)*0.5)', approx(s.seasonFactor, 1.075), 'got '+s.seasonFactor);

  console.log('[5] seasonStrength 변화가 호텔 단가에도 반영(항공·유류·호텔 공통)');
  resetCoef(); setForm('2027-10-15'); const full = gbd();
  COEF.seasonStrength = 0.5; setForm('2027-10-15'); const half = gbd();
  const hpFull = full.rows.find(r=>/호텔/.test(r.name)).unit;
  const hpHalf = half.rows.find(r=>/호텔/.test(r.name)).unit;
  ok('시즌 완만화 시 호텔단가 하락', hpHalf < hpFull, `${hpHalf} < ${hpFull}`);
  // 비율 = seasonHalf/seasonFull = 1.075/1.15
  ok('호텔단가 비율 ≈ 1.075/1.15', approx(hpHalf/hpFull, 1.075/1.15, 0.005), 'ratio '+(hpHalf/hpFull).toFixed(5));

  console.log('[6] clampCoef — 범위 밖 값은 클램프, 비정상은 기본값');
  ok('seasonStrength 3.0 → 2.0(max)', approx(window.__clamp('seasonStrength', 3.0), 2.0));
  ok('seasonStrength 0.1 → 0.5(min)', approx(window.__clamp('seasonStrength', 0.1), 0.5));
  ok('hotelPeakWeight 5 → 1.0(max)', approx(window.__clamp('hotelPeakWeight', 5), 1.0));
  ok('hotelPeakWeight -1 → 0.0(min)', approx(window.__clamp('hotelPeakWeight', -1), 0.0));
  ok('NaN → 기본값', approx(window.__clamp('seasonStrength', NaN), 1.0));
  ok('알수없는 키 → 원값 반환', window.__clamp('__x__', 7) === 7);

  console.log('[7] applyStrength 항등성·수식');
  ok('strength=1이면 항등', approx(window.__applyStrength(1.35, 1), 1.35));
  ok('strength=0이면 계수 무력화(1.0)', approx(window.__applyStrength(1.35, 0), 1.0));
  ok('strength=2면 진폭 2배', approx(window.__applyStrength(1.20, 2), 1.40));

  console.log('[8] 무예외 반복 호출');
  ok('노브 바꿔가며 반복 호출 무예외', (()=>{ try{ for(const v of [0.5,1,2]){ COEF.seasonStrength=v; setForm('2027-05-01'); gbd(); } return true; }catch(e){ return false; } })());

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

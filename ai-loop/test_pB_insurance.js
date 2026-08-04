/* PB 검증: 여행자보험 권역·기간 차등 + 기준 단가 현행화(15,000 → 18,000).
   ① 기준 케이스(동남아 4~5일)가 정확히 BASE(18,000) — 권역·기간 계수 1.00×1.00
   ② data.js의 전 목적지가 INSURANCE_ZONES 어딘가에 반드시 등록됨(폴백 0건)
   ③ 일수 구간 경계·단조성, 인원 무관 정률, 계수 노브 무영향
   실행: node ai-loop/test_pB_insurance.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__COEF=COEF_STATE;window.__DR=destinationRates;'
  + 'window.__IBASE=INSURANCE_BASE;window.__IZ=INSURANCE_ZONES;window.__IZF=INSURANCE_ZONE_FACTORS;'
  + 'window.__IDT=INSURANCE_DURATION_TIERS;window.__gii=getInsuranceInfo;}catch(e){}';
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
  const BASE = window.__IBASE, ZONES = window.__IZ, ZF = window.__IZF, TIERS = window.__IDT;
  const gii = window.__gii;
  const DESTS = window.__DR.map(d => d.destination_key);
  if (typeof gbd !== 'function' || !ZONES) { console.log('✗ 로드 실패'); process.exit(1); }

  const reset = () => { COEF.seasonStrength=1; COEF.leadTimeStrength=1; COEF.peakStrength=1; COEF.hotelPeakWeight=0.8; };
  const insRow = bd => bd && bd.rows.find(r => /여행자보험/.test(r.name));
  const setForm = (dest, days, pax = 20, date = '2027-05-10') => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = date;
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id=>{const e=doc.getElementById(id);if(e)e.checked=true;});
    return gbd();
  };
  reset();

  console.log('[0] 상수 노출·형태 확인');
  ok('INSURANCE_BASE = 18000(동남아 4~5일 실거래 기준가)', BASE === 18000, 'got ' + BASE);
  ok('권역 계수 5구간', Object.keys(ZF).length === 5, Object.keys(ZF).join(','));
  ok('기준 권역 asiaMid = 1.00', ZF.asiaMid === 1.00);
  ok('권역 계수 순서 asiaShort<asiaMid<evac<oceania<highCost',
     ZF.asiaShort < ZF.asiaMid && ZF.asiaMid < ZF.evac && ZF.evac < ZF.oceania && ZF.oceania < ZF.highCost);
  ok('기간 구간 6개, 4~5일이 1.00 기준', TIERS.length === 6 && TIERS[1].factor === 1.00);
  ok('기간 계수 단조 증가', TIERS.every((t,i) => i === 0 || t.factor > TIERS[i-1].factor));

  console.log('[1] 권역 커버리지 — data.js 전 목적지가 등록됨(조용한 폴백 0건)');
  const allListed = Object.values(ZONES).flat();
  const missing = DESTS.filter(d => !allListed.includes(d));
  const orphan  = allListed.filter(d => !DESTS.includes(d));
  ok(`전 ${DESTS.length}개 목적지가 INSURANCE_ZONES에 등록됨`, missing.length === 0, '누락: ' + missing.join(','));
  ok('목록에만 있고 data.js에 없는 유령 키 없음', orphan.length === 0, '유령: ' + orphan.join(','));
  const dupes = allListed.filter((d,i) => allListed.indexOf(d) !== i);
  ok('권역 간 중복 등록 없음', dupes.length === 0, '중복: ' + dupes.join(','));

  console.log('[2] 기준 케이스(동남아 4~5일) = BASE 그대로(계수 1.00×1.00)');
  ok('방콕 4일 = 18,000', insRow(setForm('방콕', 4)).unit === 18000, String(insRow(setForm('방콕', 4)).unit));
  ok('방콕 5일 = 18,000', insRow(setForm('방콕', 5)).unit === 18000);
  ok('다낭 5일 = 18,000', insRow(setForm('다낭', 5)).unit === 18000);
  ok('발리 4일 = 18,000', insRow(setForm('발리', 4)).unit === 18000);

  console.log('[3] 대표 케이스 값(GPT 2라운드 확정 계수)');
  const cases = [
    ['도쿄',  3, Math.round(18000 * 0.85 * 0.80)], // 12,240
    ['방콕',  5, 18000],                            // 기준점
    ['파리',  7, Math.round(18000 * 1.80 * 1.20)], // 38,880
    ['뉴욕', 10, Math.round(18000 * 1.80 * 1.40)], // 45,360
    ['괌',    4, Math.round(18000 * 1.80 * 1.00)], // 32,400 (미국령 → 미주·유럽 구간)
    ['시드니',5, Math.round(18000 * 1.50 * 1.00)], // 27,000
    ['몽골',  4, Math.round(18000 * 1.20 * 1.00)], // 21,600 (의료후송 위험권)
  ];
  for (const [dest, days, expect] of cases) {
    const r = insRow(setForm(dest, days));
    ok(`${dest} ${days}일 = ${expect.toLocaleString()}원`, r.unit === expect, `got ${r.unit}`);
  }

  console.log('[4] 호주/뉴질랜드 권역 정합성 — BIZ_ZONES의 도시/국가 분열이 보험엔 없음');
  const au = ['시드니','멜버른','오클랜드','호주'].map(d => insRow(setForm(d, 5)).unit);
  ok('시드니·멜버른·오클랜드·호주 모두 동일 요율', new Set(au).size === 1, au.join('/'));

  console.log('[5] 일수 구간 경계 정확성(방콕 기준)');
  const bounds = [[1,0.80],[3,0.80],[4,1.00],[5,1.00],[6,1.20],[7,1.20],[8,1.40],[10,1.40],[11,1.70],[15,1.70],[16,2.00],[30,2.00]];
  for (const [d, f] of bounds) {
    const got = insRow(setForm('방콕', d)).unit;
    ok(`${d}일 → ×${f.toFixed(2)} = ${Math.round(18000*f).toLocaleString()}`, got === Math.round(18000 * f), 'got ' + got);
  }

  console.log('[6] 일수 단조성 — 1~30일 어디서도 보험료가 줄지 않음');
  let mono = true, prev = 0, monoAt = '';
  for (let d = 1; d <= 30; d++) {
    const u = insRow(setForm('뉴욕', d)).unit;
    if (u < prev) { mono = false; monoAt = `${d}일에서 감소`; }
    prev = u;
  }
  ok('뉴욕 1~30일 보험 단가 non-decreasing', mono, monoAt);

  console.log('[7] 인원 무관 1인당 정률(단체계약 — 볼륨 할인 미적용)');
  const units = [1, 10, 30, 50, 100, 300].map(p => insRow(setForm('방콕', 5, p)).unit);
  ok('인원 1~300명에서 1인 단가 동일', new Set(units).size === 1, units.join('/'));
  const bd100 = setForm('파리', 7, 100);
  ok('총액 = 단가 × 인원(파리 7일 100명)', insRow(bd100).amount === 38880 * 100, String(insRow(bd100).amount));

  console.log('[8] 계수 노브·시즌·피크 무영향(보험은 수요 변동이 아니라 원가)');
  const baseUnit = insRow(setForm('방콕', 5, 20, '2027-05-10')).unit;
  const peakUnit = insRow(setForm('방콕', 5, 20, '2027-12-25')).unit; // 연말 피크
  ok('성수기 날짜에도 보험 단가 불변', baseUnit === peakUnit, `${baseUnit} vs ${peakUnit}`);
  COEF.seasonStrength = 2; COEF.peakStrength = 2; COEF.leadTimeStrength = 2;
  const knobUnit = insRow(setForm('방콕', 5, 20, '2027-12-25')).unit;
  ok('노브 최대에서도 보험 단가 불변', knobUnit === baseUnit, `${knobUnit} vs ${baseUnit}`);
  reset();

  console.log('[9] 미등록 목적지 폴백 — 중립 1.00(조용한 저평가 방지)');
  const warn = [];
  const origWarn = window.console.warn;
  window.console.warn = m => warn.push(String(m));
  const unknown = gii('없는목적지XYZ', 5);
  window.console.warn = origWarn;
  ok('미등록 → zoneFactor 1.00 중립 폴백', unknown.zoneFactor === 1.00 && unknown.rate === 18000, JSON.stringify(unknown));
  ok('미등록 시 콘솔 경고 발생', warn.some(m => /INSURANCE_ZONES/.test(m)));

  console.log('[10] 메타 필드·표시 라벨');
  const bdParis = setForm('파리', 7);
  ok('breakdown에 insuranceInfo 노출', !!bdParis.insuranceInfo);
  ok('insuranceInfo.rate = 행 단가', bdParis.insuranceInfo.rate === insRow(bdParis).unit);
  ok('adminLabel에 권역·기간 근거 표기', /미주·유럽/.test(insRow(bdParis).adminLabel) && /6~7일/.test(insRow(bdParis).adminLabel),
     insRow(bdParis).adminLabel);
  ok('고객 미노출 유지(muted)', insRow(bdParis).muted === true);

  console.log('[11] 총액 정합성 — 보험 변동분이 총액에 그대로 반영');
  const a = setForm('방콕', 5, 20), b = setForm('방콕', 6, 20);
  const dIns = insRow(b).amount - insRow(a).amount;
  ok('6일 보험 총액 − 5일 보험 총액 = (21,600−18,000)×20', dIns === (21600 - 18000) * 20, String(dIns));
  ok('baseTotal에 보험 포함', a.baseTotal === a.rows.reduce((s, r) => s + r.amount, 0));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

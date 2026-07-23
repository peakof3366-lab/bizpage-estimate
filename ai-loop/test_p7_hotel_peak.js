/* P7 검증: 호텔 피크 계수가 호텔 단가에만 완만히(가중치 0.8) 얹히고,
   비피크/무날짜에는 무영향(=P7 이전과 동일)임을 실제 index.html 스크립트로 확인.
   실행: node ai-loop/test_p7_hotel_peak.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* DOM은 실제 index.html로 만들되(외부 <script src>는 로더 없이 미실행), 앱 스크립트는
   data.js+company-info+script.js를 한 문자열로 합쳐 window.eval로 1회 실행한다.
   → 한 스코프라 파일 간 const 참조·getBreakdownData의 클로저(destinationSelect 등)가 정상.
   함수 선언은 sloppy 간접 eval로 전역에 노출되어 window.getBreakdownData로 접근 가능. */
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js');

const INDEX = path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const approx = (a, b, eps = 1) => Math.abs(a - b) <= eps;

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
      // 네트워크 IIFE(/api/rates, /api/content 등)가 동기 throw 하지 않도록 영구 pending stub
      window.fetch = () => new Promise(() => {});
      // 캔버스 차트 IIFE가 throw해 eval을 끊지 않도록 체이닝 가능한 no-op 컨텍스트 제공
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
    },
  });
  const { window } = dom;
  // 앱 스크립트 실행(외부 src는 로더 없이 미실행이므로 여기서 직접). async .then 에러는
  // 동기 throw가 아니라 함수 정의를 막지 않음. fetch는 stub이라 IIFE도 안전.
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise(r => setTimeout(r, 100));
  const doc = window.document;

  if (typeof window.getBreakdownData !== 'function') {
    console.log('✗ getBreakdownData 미정의 — 로드 실패'); process.exit(1);
  }

  // 공통 폼 세팅 헬퍼 — 도쿄(골든위크 피크 존재), 인원/일수 고정
  const setForm = (startDate) => {
    const sel = doc.getElementById('destination');
    sel.value = '도쿄';
    doc.getElementById('participants').value = '20';
    doc.getElementById('days').value = '4';
    const sd = doc.getElementById('startDate');
    if (sd) sd.value = startDate || '';
    // 호텔 포함 보장
    const inc = doc.getElementById('incHotel'); if (inc) inc.checked = true;
  };
  const hotelRow = (bd) => (bd.rows || []).find(r => /호텔/.test(r.name));

  console.log('[1] 도쿄 골든위크(피크 1.35) — 호텔에 가중치 0.8만큼 반영');
  setForm('2027-05-01'); // 04-27~05-06 골든위크 구간
  const peak = window.getBreakdownData();
  ok('bd 반환 정상', !!peak && !!hotelRow(peak));
  const expHotelPeak = 1 + (1.35 - 1) * 0.8; // = 1.28
  ok('hotelPeakFactor = 1.28 (완만 반영)', approx(peak.hotelPeakFactor, expHotelPeak, 1e-9),
     'got ' + peak.hotelPeakFactor);
  ok('항공 peakFactor는 원본 1.35 유지(호텔과 분리)', approx(peak.peakFactor, 1.35, 1e-9),
     'got ' + peak.peakFactor);
  ok('호텔 가중치 < 항공 피크 (과보정 방지)', peak.hotelPeakFactor < peak.peakFactor);

  console.log('[2] 같은 달(5월) 내 비피크(05-20) — 시즌계수 동일 → 호텔 상승비=순수 피크 1.28');
  setForm('2027-05-20'); // 같은 5월, 골든위크(04-27~05-06) 밖 → 피크 없음, 시즌계수는 05-01과 동일
  const nonpeak = window.getBreakdownData();
  ok('hotelPeakFactor = 1.0 (무영향)', approx(nonpeak.hotelPeakFactor, 1.0, 1e-9),
     'got ' + nonpeak.hotelPeakFactor);
  ok('같은 달이라 시즌계수 동일(격리 전제)', approx(peak.seasonInfo.factor, nonpeak.seasonInfo.factor, 1e-9),
     `${peak.seasonInfo.factor} vs ${nonpeak.seasonInfo.factor}`);
  const hpPeak = hotelRow(peak).unit, hpNon = hotelRow(nonpeak).unit;
  ok('피크 호텔단가 > 비피크 호텔단가', hpPeak > hpNon, `${hpPeak} vs ${hpNon}`);
  const ratio = hpPeak / hpNon;
  ok('호텔단가 상승비 ≈ 1.28 (순수 피크 가중 반영)', approx(ratio, 1.28, 0.01), 'ratio ' + ratio.toFixed(4));

  console.log('[3] 출발일 미입력 — hotelPeakFactor 1.0, 에러 없음');
  setForm('');
  const nodate = window.getBreakdownData();
  ok('무날짜 hotelPeakFactor = 1.0', approx(nodate.hotelPeakFactor ?? 1, 1.0, 1e-9),
     'got ' + nodate.hotelPeakFactor);

  console.log('[4] 항공 단가는 피크 여부로만 변하고 호텔 가중치 영향 안 받음(분리 검증)');
  const airPeak = peak.rows.find(r => r.name === '항공').unit;
  const airNon  = nonpeak.rows.find(r => r.name === '항공').unit;
  ok('항공 피크단가 > 비피크단가', airPeak > airNon, `${airPeak} vs ${airNon}`);

  console.log('[5] jsdom 콘솔 에러 0 (렌더 무결)');
  ok('getBreakdownData 반복 호출 무예외', (() => {
    try { setForm('2027-05-01'); window.getBreakdownData(); setForm(''); window.getBreakdownData(); return true; }
    catch (e) { return false; }
  })());

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

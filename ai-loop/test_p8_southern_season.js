/* P8 검증: 남반구 4곳(시드니·멜버른·호주·오클랜드)이 전용 프로파일로 시즌 계수를 받고,
   프로파일 없는 향후 남반구/북반구 목적지는 각각 SOUTHERN/기본 폴백을 그대로 쓰는지 확인.
   실행: node ai-loop/test_p8_southern_season.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* 같은 eval 스코프 끝에서 폴백 상수를 window로 노출(외부 검증용). const는 함수와 달리
   전역/window에 안 붙으므로, 같은 소스 문자열 안에서 읽어 window에 얹어야 접근 가능. */
const EXPOSE = '\n;try{window.__SCS=SEASON_CONFIG_SOUTHERN;window.__SHD=SOUTHERN_HEMISPHERE_DESTS;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      // reveal-on-scroll IIFE가 eval을 끊지 않도록 no-op observer 제공(APP_SRC 끝까지 실행 보장)
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise(r => setTimeout(r, 100));

  const gsi = window.getSeasonInfo;
  if (typeof gsi !== 'function') { console.log('✗ getSeasonInfo 미정의 — 로드 실패'); process.exit(1); }

  console.log('[1] 시드니 — 전용 프로파일 적용(월별 계수·라벨)');
  const janS = gsi('2027-01-15', '시드니'); // 현지 여름 성수기
  ok('1월 성수기 factor 1.20', approx(janS.factor, 1.20), 'got ' + janS.factor);
  ok('1월 라벨=현지 여름·연말 성수기', janS.label === '현지 여름·연말 성수기', janS.label);
  const julS = gsi('2027-07-15', '시드니'); // 현지 겨울 비수기
  ok('7월 비수기 factor 0.90(공용표 0.88에서 완만화)', approx(julS.factor, 0.90), 'got ' + julS.factor);
  ok('7월 라벨=현지 겨울 비수기', julS.label === '현지 겨울 비수기', julS.label);

  console.log('[2] 4월·9월(부활절/봄) — 평시 1.00 (월단위 과대추정 회피, 협의 결론)');
  ok('4월 시드니 normal 1.00', approx(gsi('2027-04-15', '시드니').factor, 1.00), 'got ' + gsi('2027-04-15','시드니').factor);
  ok('9월 멜버른 normal 1.00', approx(gsi('2027-09-15', '멜버른').factor, 1.00), 'got ' + gsi('2027-09-15','멜버른').factor);

  console.log('[3] 4곳 전부 동일 config 통합(호주·뉴질랜드 공통)');
  for (const k of ['시드니','멜버른','호주','오클랜드']) {
    ok(`${k} 1월=1.20 & 7월=0.90`, approx(gsi('2027-01-15',k).factor,1.20) && approx(gsi('2027-07-15',k).factor,0.90));
  }

  console.log('[4] 폴백 안전망 — 프로파일 없는 "향후" 남반구 목적지는 공용 SOUTHERN(-12%) 유지');
  ok('SEASON_CONFIG_SOUTHERN 존재(폴백 보존)', Array.isArray(window.__SCS));
  window.__SHD.push('__FUTURE_SOUTH__'); // 프로파일 없는 남반구 신규 목적지 가정
  const fbJul = gsi('2027-07-15', '__FUTURE_SOUTH__');
  ok('폴백 7월 factor 0.88(공용 SOUTHERN)', approx(fbJul.factor, 0.88), 'got ' + fbJul.factor);
  const fbJan = gsi('2027-01-15', '__FUTURE_SOUTH__');
  ok('폴백 1월 factor 1.20(공용 SOUTHERN 성수기)', approx(fbJan.factor, 1.20), 'got ' + fbJan.factor);

  console.log('[5] 북반구 무프로파일 목적지 — 기존 SEASON_CONFIG 그대로(회귀 없음)');
  ok('무프로파일 북반구 2월 offpeak 0.88', approx(gsi('2027-02-15', '__FAKE_NORTH__').factor, 0.88),
     'got ' + gsi('2027-02-15','__FAKE_NORTH__').factor);
  ok('무프로파일 북반구 8월 peak 1.20', approx(gsi('2027-08-15', '__FAKE_NORTH__').factor, 1.20),
     'got ' + gsi('2027-08-15','__FAKE_NORTH__').factor);

  console.log('[6] 날짜 미입력 — normal 폴백, 에러 없음');
  ok('시드니 무날짜 normal 1.00', approx(gsi('', '시드니').factor, 1.00), 'got ' + gsi('','시드니').factor);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

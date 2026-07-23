/* P9 검증: 한국 연휴(설·추석·5월) 'ALL' 피크 신설 + 춘절 2027 정합화가 getPeakInfo에
   정확히 반영되고, 겹침 최댓값 규칙·기존 항목 회귀 없음을 실제 index.html 스크립트로 확인.
   실행: node ai-loop/test_p9_korean_holidays.js  (프로젝트 루트에서) */
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
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

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
  const gp = window.getPeakInfo;
  if (typeof gp !== 'function') { console.log('✗ getPeakInfo 미정의'); process.exit(1); }

  console.log('[1] 설 연휴(2027 근사 2/6) — ALL 1.25, 목적지별 겹침 규칙');
  ok('비중국·비일본(방콕) 설날=1.25', approx(gp('2027-02-06','방콕').factor, 1.25), gp('2027-02-06','방콕').factor);
  ok('설날 라벨=설 연휴(근사)', gp('2027-02-06','방콕').label === '설 연휴(근사)');
  ok('일본(도쿄) 설날=1.25 (일본 전용피크 없음)', approx(gp('2027-02-06','도쿄').factor, 1.25), gp('2027-02-06','도쿄').factor);
  ok('중국(상해) 설날=춘절 1.30 (max 우선)', approx(gp('2027-02-06','상해').factor, 1.30), gp('2027-02-06','상해').factor);
  ok('설 구간 경계 02-04 포함', approx(gp('2027-02-04','방콕').factor, 1.25));
  ok('설 구간 경계 02-09 포함', approx(gp('2027-02-09','방콕').factor, 1.25));
  ok('설 구간 직전 02-03 비피크', approx(gp('2027-02-03','방콕').factor, 1.0));

  console.log('[2] 춘절 2027 정합화 (02-05~02-13, 중국권만)');
  ok('상해 02-11 춘절=1.30', approx(gp('2027-02-11','상해').factor, 1.30), gp('2027-02-11','상해').factor);
  ok('도쿄 02-11 비피크(춘절은 중국권만)', approx(gp('2027-02-11','도쿄').factor, 1.0), gp('2027-02-11','도쿄').factor);
  ok('기존 2/17(옛 춘절 날짜)은 이제 비피크', approx(gp('2027-02-17','상해').factor, 1.0), gp('2027-02-17','상해').factor);

  console.log('[3] 추석 연휴(2027 근사 9/15) — ALL 1.22');
  ok('추석 9/15 방콕=1.22', approx(gp('2027-09-15','방콕').factor, 1.22), gp('2027-09-15','방콕').factor);
  ok('추석 라벨', gp('2027-09-15','방콕').label === '추석 연휴(근사)');
  ok('추석 구간밖 9/20 비피크', approx(gp('2027-09-20','방콕').factor, 1.0));

  console.log('[4] 5월 황금연휴 — ALL 1.12, 일본은 골든위크 1.35가 max');
  ok('비일본(상해) 5/3=1.12', approx(gp('2027-05-03','상해').factor, 1.12), gp('2027-05-03','상해').factor);
  ok('일본(도쿄) 5/3=1.35 (골든위크 max)', approx(gp('2027-05-03','도쿄').factor, 1.35), gp('2027-05-03','도쿄').factor);

  console.log('[5] 기존 항목 회귀 없음');
  ok('여름 07-20 ALL=1.20', approx(gp('2027-07-20','방콕').factor, 1.20));
  ok('연말연시 12-25 ALL=1.25', approx(gp('2027-12-25','방콕').factor, 1.25));
  ok('연말연시 해넘김 01-02 ALL=1.25', approx(gp('2027-01-02','방콕').factor, 1.25));
  ok('일본 골든위크 05-01 도쿄=1.35', approx(gp('2027-05-01','도쿄').factor, 1.35));
  ok('벚꽃 04-01 도쿄=1.20', approx(gp('2027-04-01','도쿄').factor, 1.20));

  console.log('[6] 비피크·무날짜');
  ok('비피크(06-15) 1.0', approx(gp('2027-06-15','방콕').factor, 1.0));
  ok('무날짜 1.0/라벨없음', approx(gp('','방콕').factor, 1.0) && gp('','방콕').label === '');
  ok('잘못된 날짜 1.0', approx(gp('bad-date','방콕').factor, 1.0));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

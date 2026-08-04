/* PM 검증: 음력 연휴 피크가 실제 날짜에 붙는가 + 커버리지가 끊기지 않는가.

   배경 — 설·추석·춘절은 매년 양력 날짜가 다른데 PEAK_CALENDAR에 'MM-DD' 반복
   구간으로 들어가 있었다. 값은 2027년 기준이라 다른 해에는 엉뚱한 날에 얹혔다:
     2026-09-15(평범한 날)      → ×1.22 "추석 연휴"  (근거 없는 과청구)
     2026-09-25(2026 실제 추석) → ×1.00              (진짜 피크 놓침)
   당시 주석은 "좁은 구간은 피크를 놓칠 뿐이라 안전"이라고 적혀 있었지만 틀린
   논리였다 — 좁아도 어긋난 해에는 평범한 날 위에 그대로 얹힌다.

   → LUNAR_PEAKS에 연도별 절대 날짜로 분리했고, 이 파일이 두 가지를 고정한다:
     ① 실제 연휴일에 붙고 그 외 날에는 안 붙는다
     ② **커버리지가 12개월 안에 끝나면 실패한다** (조용히 피크가 사라지는 걸 막는 알람)
   실행: node ai-loop/test_pM_lunar_peaks.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__PC=PEAK_CALENDAR;window.__LP=LUNAR_PEAKS;window.__gp=getPeakInfo;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 공식 관공서 달력 기준 실제 연휴일 — 값을 바꿀 때는 사장님 확인을 거칠 것.
   여기가 틀리면 테스트가 틀린 값을 지켜 주게 된다. */
const REAL = {
  seollal: { 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26' },
  chuseok: { 2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03' },
};

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise((r) => setTimeout(r, 150));
  const gp = window.__gp, PC = window.__PC, LP = window.__LP;
  if (typeof gp !== 'function' || !Array.isArray(LP)) { console.log('✗ 로드 실패'); process.exit(1); }

  console.log('[0] 표 구조 — 매년 날짜가 바뀌는 항목이 반복 구간에 남아 있지 않은가');
  const lunarWords = /설|추석|춘절/;
  const strays = PC.filter((p) => lunarWords.test(p.label || ''));
  ok('PEAK_CALENDAR에 음력 항목이 남아 있지 않음', strays.length === 0,
    strays.map((s) => s.label).join(', '));
  ok('PEAK_CALENDAR는 전부 MM-DD 형식', PC.every((p) => /^\d{2}-\d{2}$/.test(p.from) && /^\d{2}-\d{2}$/.test(p.to)));
  ok('LUNAR_PEAKS는 전부 YYYY-MM-DD 형식', LP.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.from) && /^\d{4}-\d{2}-\d{2}$/.test(p.to)));
  ok('LUNAR_PEAKS 구간이 from ≤ to', LP.every((p) => p.from <= p.to));
  ok('LUNAR_PEAKS 계수가 전부 1보다 큼', LP.every((p) => p.factor > 1));
  ok('한 구간이 해를 넘지 않음(연도별 항목이므로)', LP.every((p) => p.from.slice(0, 4) === p.to.slice(0, 4)));

  console.log('\n[1] 실제 연휴일에 피크가 붙는가 (전 목적지 공통)');
  for (const [kind, byYear] of Object.entries(REAL)) {
    for (const [year, date] of Object.entries(byYear)) {
      const r = gp(date, '방콕');
      ok(`${year} ${kind === 'seollal' ? '설' : '추석'}(${date}) 피크 적용`, r.factor > 1.0, `×${r.factor}`);
    }
  }

  console.log('\n[2] 연휴가 아닌 날에는 안 붙는가 (과청구 방지)');
  /* 예전 구현이 잘못 잡던 바로 그 날짜들 — 회귀하면 여기서 걸린다 */
  const shouldBeFlat = [
    ['2026-09-15', '예전 구현이 추석으로 잘못 잡던 날'],
    ['2026-02-06', '예전 구현이 설로 잘못 잡던 날'],
    ['2027-06-10', '아무 일 없는 날'],
    ['2026-03-12', '아무 일 없는 날'],
  ];
  for (const [date, why] of shouldBeFlat) {
    const r = gp(date, '방콕');
    ok(`${date} 피크 없음 (${why})`, r.factor === 1.0, `×${r.factor} ${r.label}`);
  }

  console.log('\n[3] 춘절은 중화권에만');
  const cnDate = LP.find((p) => p.label === '춘절').from;
  ok(`춘절 구간(${cnDate})에 상해는 적용`, gp(cnDate, '상해').factor >= 1.3, `×${gp(cnDate, '상해').factor}`);
  const bkk = gp(cnDate, '방콕');
  ok('같은 날 방콕은 춘절 라벨이 안 붙음', bkk.label !== '춘절', bkk.label);

  console.log('\n[4] 등록되지 않은 연도는 조용히 1.0');
  const maxYear = Math.max(...LP.map((p) => Number(p.from.slice(0, 4))));
  const beyond = `${maxYear + 1}-02-17`;
  ok(`등록 범위 밖(${beyond})은 피크 없음`, gp(beyond, '방콕').factor === 1.0);

  console.log('\n[5] 커버리지 알람 — 조용히 피크가 사라지는 걸 막는다');
  const lastCovered = LP.map((p) => p.to).sort().pop();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setMonth(horizon.getMonth() + 12);
  const lastDate = new Date(lastCovered);
  const monthsLeft = Math.round((lastDate - today) / (86400000 * 30.44));
  console.log(`     마지막 등록일 ${lastCovered} · 오늘로부터 약 ${monthsLeft}개월`);
  ok('음력 연휴 커버리지가 앞으로 12개월 이상 남아 있음', lastDate >= horizon,
    `${lastCovered}까지만 등록됨 — script.js의 LUNAR_PEAKS에 다음 해 설·추석·춘절 3줄을 추가하세요`);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

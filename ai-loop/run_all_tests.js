/* 견적 계산 회귀 스위트 러너 — ai-loop/test_p*.js 를 전부 찾아 순서대로 돌리고 집계한다.
   계산식을 건드린 뒤에는 반드시 이걸 돌릴 것. (P13이 P10 테스트 단언을 무효화했는데
   아무도 전수 실행을 안 해 깨진 채 방치된 전례가 있다 — 2026-07-28 PB 작업 중 발견.)

   실행: node ai-loop/run_all_tests.js            (프로젝트 루트에서)
         node ai-loop/run_all_tests.js pB pC      (이름에 pB/pC 포함된 것만)

   NODE_PATH는 자동으로 프로젝트 node_modules로 잡으므로 따로 지정할 필요 없다. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const filters = process.argv.slice(2);

/* 파이썬 테스트(test_*.py)는 Playwright·서버가 필요해 이 러너 대상이 아니다.
   여기서 도는 건 jsdom 기반 순수 계산 검증뿐 — 외부 의존 없이 항상 돌아야 한다. */
const files = fs.readdirSync(HERE)
  .filter(f => /^test_p.*\.js$/.test(f))
  .filter(f => !filters.length || filters.some(k => f.includes(k)))
  .sort();

if (!files.length) {
  console.error(filters.length ? `조건에 맞는 테스트가 없습니다: ${filters.join(', ')}` : '테스트 파일을 찾지 못했습니다.');
  process.exit(1);
}

const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };
const results = [];
let totPass = 0, totFail = 0;

console.log(`견적 회귀 스위트 — ${files.length}개 파일\n${'─'.repeat(64)}`);

for (const f of files) {
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [path.join(HERE, f)], {
    cwd: ROOT, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/결과:\s*(\d+)\s*pass\s*\/\s*(\d+)\s*fail/);
  const pass = m ? Number(m[1]) : 0;
  const fail = m ? Number(m[2]) : 0;
  /* 요약 줄을 못 찾았으면(크래시 등) 통과로 세지 않는다 — 조용한 성공 위장 방지 */
  const crashed = !m;
  totPass += pass; totFail += fail;
  results.push({ f, pass, fail, crashed, secs, out });

  const mark = crashed ? '💥' : fail ? '✗' : '✓';
  const detail = crashed ? `크래시 (exit=${r.status})` : `${pass} pass / ${fail} fail`;
  console.log(`${mark} ${f.padEnd(34)} ${detail.padStart(18)}  ${secs.toFixed(1)}s`);
}

/* 실패·크래시한 파일의 원본 출력을 뒤에 몰아서 보여준다(스크롤 위로 안 올라가도 되게) */
const bad = results.filter(r => r.fail || r.crashed);
for (const r of bad) {
  console.log(`\n${'─'.repeat(64)}\n▼ ${r.f} 상세`);
  if (r.crashed) console.log(r.out.trim().split('\n').slice(-25).join('\n'));
  else r.out.split('\n').filter(l => l.includes('✗')).forEach(l => console.log(l));
}

console.log(`\n${'─'.repeat(64)}`);
const crashCount = results.filter(r => r.crashed).length;
console.log(`합계: ${totPass} pass / ${totFail} fail`
  + (crashCount ? ` / ${crashCount} 크래시` : '')
  + ` — ${files.length}개 파일`);
process.exit(totFail || crashCount ? 1 : 0);

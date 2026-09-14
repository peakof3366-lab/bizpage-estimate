/* 견적 계산 회귀 스위트 러너 — ai-loop/test_*.js 를 전부 찾아 돌리고 집계한다.
   계산식을 건드린 뒤에는 반드시 이걸 돌릴 것. (P13이 P10 테스트 단언을 무효화했는데
   아무도 전수 실행을 안 해 깨진 채 방치된 전례가 있다 — 2026-07-28 PB 작업 중 발견.)

   실행: node ai-loop/run_all_tests.js            (프로젝트 루트에서)
         node ai-loop/run_all_tests.js pB pC      (이름에 pB/pC 포함된 것만)
         node ai-loop/run_all_tests.js --serial   (예전처럼 한 줄로 — 대조용)
         node ai-loop/run_all_tests.js --workers=4

   NODE_PATH는 자동으로 프로젝트 node_modules로 잡으므로 따로 지정할 필요 없다.

   ── 2026-09-14: 한 줄로 돌리던 것을 동시에 돌리게 바꿨다 ──────────────────────
   실측 315초 · 186개 파일이었다. 한 덩이가 범인이 아니라 **줄 세워 돌리는 것**이
   원인이었다 — 가장 느린 하나가 40.6초이고 나머지 180여 개는 평균 1.7초(대부분
   Node 시작과 jsdom 띄우는 값)다. 이 시간은 **견적 로직을 고친 턴마다** Stop 훅으로
   그대로 나간다.
   ⚠ 바닥은 가장 긴 검사 하나(40.6초)다. 그 아래로는 못 내려간다 — 더 줄이려면
     그 검사를 쪼개야 하고, 그건 별도 건이다. */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { testFiles } = require('./_test_files');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');

const argv = process.argv.slice(2);
const SERIAL = argv.includes('--serial');
const wArg = argv.find((a) => a.startsWith('--workers='));
const filters = argv.filter((a) => !a.startsWith('--'));

/* 8코어 기준 6개. 둘은 남긴다 — 다 쓰면 컴퓨터 전체가 멈춘 것처럼 느려진다. */
const WORKERS = wArg ? Math.max(1, Number(wArg.split('=')[1]) || 1)
                     : Math.max(1, Math.min(6, os.cpus().length - 2));

/* 🔴 **혼자 돌아야 하는 검사.** 저장소나 tmp의 **고정된 이름**에 쓰고 되돌리는 것들이다.
   같이 돌리면 서로의 파일을 지우거나 덮어, 있지도 않은 실패가 나거나 — 더 나쁘게 —
   **진짜 실패가 가려진다.** 실측으로 셋을 특정했고, 셋을 합쳐 0.3초라 이득을 거의 안 깎는다.

     · test_vB_rate_overrides  → ROOT/.rate_overrides_cache.json 을 지웠다 되돌린다
     · test_xZ_corpus_manual   → ai-loop/corpus_manual.json 을 덮었다 되돌린다
     · test_vY_sheet_import    → os.tmpdir()/대표상품리스트_260824.xlsx (이름이 고정이다)

   ⚠ 나머지 파일 쓰는 검사(vA·pQ·qJ)는 `mkdtempSync`로 **매번 새 폴더**를 만든다 — 안전하다.
   ⚠ **새 검사가 저장소나 고정 이름에 쓰면 여기 추가할 것.** 안 하면 어느 날부터
     이유 없이 흔들리기 시작하고, 그때는 원인을 찾기가 매우 어렵다. */
const ALONE = [
  /^test_vB_rate_overrides\.js$/,
  /^test_xZ_corpus_manual\.js$/,
  /^test_vY_sheet_import\.js$/,
];

/* 🔴 어떤 파일을 돌릴지는 `_test_files.js` **한 곳**이 정한다.
   예전에는 이 규칙이 러너 안에만 있었고, 검사(test_qA)는 **러너 소스를 정규식으로**
   뜯어 확인했다. 그래서 이 파일 모양이 바뀌자 그 검사가 깨졌다(2026-09-14). */
const files = testFiles(filters);

if (!files.length) {
  console.error(filters.length ? `조건에 맞는 테스트가 없습니다: ${filters.join(', ')}` : '테스트 파일을 찾지 못했습니다.');
  process.exit(1);
}

const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };

function score(f, out, status, secs) {
  const m = out.match(/결과:\s*(\d+)\s*pass\s*\/\s*(\d+)\s*fail/);
  /* 요약 줄을 못 찾았으면(크래시 등) 통과로 세지 않는다 — 조용한 성공 위장 방지 */
  return { f, pass: m ? Number(m[1]) : 0, fail: m ? Number(m[2]) : 0, crashed: !m, status, secs, out };
}

function runSync(f) {
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [path.join(HERE, f)], {
    cwd: ROOT, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  return score(f, (r.stdout || '') + (r.stderr || ''), r.status, Number(process.hrtime.bigint() - started) / 1e9);
}

function runAsync(f) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const ch = spawn(process.execPath, [path.join(HERE, f)], { cwd: ROOT, env });
    let out = '';
    const take = (d) => { out += d.toString(); };
    ch.stdout.on('data', take);
    ch.stderr.on('data', take);
    ch.on('error', (e) => { out += '\n[러너] 실행하지 못했습니다: ' + e.message; });
    ch.on('close', (status) => resolve(score(f, out, status, Number(process.hrtime.bigint() - started) / 1e9)));
  });
}

async function runPool(list, workers) {
  const done = [];
  let next = 0, finished = 0;
  const lane = async () => {
    while (next < list.length) {
      const f = list[next++];
      done.push(await runAsync(f));
      finished++;
      if (finished % 20 === 0) process.stdout.write(`  … ${finished}/${list.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, list.length) }, lane));
  return done;
}

(async () => {
  const alone = files.filter((f) => ALONE.some((re) => re.test(f)));
  const together = files.filter((f) => !ALONE.some((re) => re.test(f)));

  const mode = SERIAL ? '한 줄로(대조용)' : `동시에 ${WORKERS}개씩`;
  console.log(`견적 회귀 스위트 — ${files.length}개 파일 · ${mode}`
    + (SERIAL || !alone.length ? '' : ` (혼자 도는 것 ${alone.length}개 먼저)`)
    + `\n${'─'.repeat(64)}`);

  const wall = process.hrtime.bigint();
  let results;
  if (SERIAL) {
    results = files.map(runSync);
  } else {
    /* 혼자 도는 것을 **먼저** 끝낸다 — 공유 파일을 되돌려 놓은 상태에서 나머지가 시작한다 */
    const a = alone.map(runSync);
    const b = await runPool(together, WORKERS);
    results = a.concat(b);
  }
  const wallSecs = Number(process.hrtime.bigint() - wall) / 1e9;

  /* 🔴 끝난 순서가 아니라 **파일명 순서**로 찍는다 — 돌릴 때마다 순서가 달라지면
     두 번의 결과를 눈으로도 diff로도 못 견준다. */
  results.sort((x, y) => (x.f < y.f ? -1 : x.f > y.f ? 1 : 0));

  let totPass = 0, totFail = 0;
  for (const r of results) {
    totPass += r.pass; totFail += r.fail;
    const mark = r.crashed ? '💥' : r.fail ? '✗' : '✓';
    const detail = r.crashed ? `크래시 (exit=${r.status})` : `${r.pass} pass / ${r.fail} fail`;
    console.log(`${mark} ${r.f.padEnd(34)} ${detail.padStart(18)}  ${r.secs.toFixed(1)}s`);
  }

  /* 실패·크래시한 파일의 원본 출력을 뒤에 몰아서 보여준다(스크롤 위로 안 올라가도 되게) */
  const bad = results.filter((r) => r.fail || r.crashed);
  for (const r of bad) {
    console.log(`\n${'─'.repeat(64)}\n▼ ${r.f} 상세`);
    if (r.crashed) console.log(r.out.trim().split('\n').slice(-25).join('\n'));
    else r.out.split('\n').filter((l) => l.includes('✗')).forEach((l) => console.log(l));
  }

  console.log(`\n${'─'.repeat(64)}`);
  const crashCount = results.filter((r) => r.crashed).length;
  console.log(`합계: ${totPass} pass / ${totFail} fail`
    + (crashCount ? ` / ${crashCount} 크래시` : '')
    + ` — ${files.length}개 파일 · ${wallSecs.toFixed(0)}초`);
  process.exit(totFail || crashCount ? 1 : 0);
})();

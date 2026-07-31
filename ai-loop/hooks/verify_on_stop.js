/* Stop 훅 — 견적 로직을 건드린 턴이 끝날 때 회귀 스위트와 교차 정합성 감사를 자동 실행한다.

   왜 필요한가 — 이 저장소의 반복 사고 유형이 "안전망은 있는데 아무도 안 돌려봤다"다.
   P13이 P10 테스트 단언을 무효화했는데 전수 실행을 안 해서 깨진 채 방치됐고(PB에서 발견),
   PP의 커스텀 목적지 편입 코드와 PO의 `_verify` 기록도 만들어만 두고 실제로 확인하지
   않았다. 사람의 기억에 의존하는 검증은 반드시 언젠가 건너뛰어진다. 그래서 기억이 아니라
   턴 종료 이벤트에 묶는다.

   동작
     ① 관심 파일(견적 엔진·API·화면·감사 도구)이 변경된 흔적이 없으면 아무것도 하지 않는다.
        판단 기준은 **미커밋 변경 + 아직 push되지 않은 커밋**이다. 커밋만 하고 테스트를
        안 돌린 경우까지 잡으려면 워킹트리만 봐서는 안 되고, push가 끝나면(= 배포됨)
        조용해져야 하므로 upstream과 비교하는 것이 정확하다.
     ② 변경이 있으면 run_all_tests.js → audit_consistency.js 순으로 돌린다.
     ③ 실패하면 turn을 차단하고 실패 내용을 모델에게 되돌려준다(그 자리에서 고치게).
     ④ stop_hook_active가 true면 즉시 통과 — 차단 후 재차단으로 무한 루프가 되는 것을 막는다.

   ⚠ NODE_PATH를 명시적으로 넣는다. jsdom이 `npm install --no-save`로 깔려 있어
   테스트가 NODE_PATH 없이는 모듈을 못 찾는다(훅 환경에는 셸 프로파일이 안 걸린다).

   ⚠ audit_consistency는 라이브 /api/rates를 부른다. 네트워크가 없으면 정적값으로
   내려가며 그 사실을 스스로 출력하므로, 여기서는 exit code만 본다(거짓 차단 방지). */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

/* 관심 대상 — 견적 금액이나 검증 자체에 영향을 주는 파일만. 문서(README·CLAUDE.md)와
   GPT 협의 기록(.txt)은 고쳐도 검증이 필요 없으므로 넣지 않는다(불필요한 30초 방지). */
const WATCH = [
  /^data\.js$/, /^script\.js$/, /^dest_currency\.js$/, /^company-info\.js$/,
  /^index\.html$/, /^admin\.html$/, /^estimate-view\.html$/,
  /^api\//, /^ai-loop\/[^/]+\.js$/,
];

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return ''; }
}

function changedFiles() {
  const files = new Set();
  /* 미커밋 변경(추가·수정·삭제·untracked 전부) */
  for (const line of git(['status', '--porcelain']).split('\n')) {
    const f = line.slice(3).trim().replace(/^"|"$/g, '');
    if (f) files.add(f.split(' -> ').pop());
  }
  /* 아직 push되지 않은 커밋에 담긴 파일. upstream이 없으면 조용히 건너뛴다. */
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
  if (upstream) {
    for (const f of git(['diff', '--name-only', `${upstream}...HEAD`]).split('\n')) {
      if (f.trim()) files.add(f.trim());
    }
  }
  return [...files];
}

function run(script) {
  const r = spawnSync(process.execPath, [path.join('ai-loop', script)], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
    timeout: 150000,
  });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  return { ok: r.status === 0, code: r.status, out, timedOut: r.error && r.error.code === 'ETIMEDOUT' };
}

/* ── 본문 ───────────────────────────────────────────────────────────── */
let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch { input = {}; }

/* 무한 루프 방지 — 한 번 차단해서 다시 불려온 상황이면 판단을 모델에게 넘긴다. */
if (input.stop_hook_active === true) process.exit(0);

const touched = changedFiles().filter((f) => WATCH.some((re) => re.test(f)));
if (!touched.length) process.exit(0);

const results = [];
for (const script of ['run_all_tests.js', 'audit_consistency.js']) {
  const r = run(script);
  results.push({ script, ...r });
  if (!r.ok) break; // 회귀가 깨졌으면 감사까지 돌릴 필요 없다 — 먼저 고쳐야 한다
}

const failed = results.filter((r) => !r.ok);
if (!failed.length) {
  /* 성공도 한 줄 남긴다 — "돌았는지 안 돌았는지 모르는" 상태가 이 저장소의 원래 문제다. */
  const summary = results
    .map((r) => (r.out.match(/합계: .*|✓ 교차 정합성 오류 없음.*/) || [r.script])[0].trim())
    .join(' · ');
  process.stdout.write(JSON.stringify({
    systemMessage: `자동 검증 통과 (${touched.length}개 파일 변경) — ${summary}`,
    suppressOutput: true,
  }));
  process.exit(0);
}

const f = failed[0];
const tail = f.out.split('\n').slice(-40).join('\n');
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `자동 검증 실패 — ${f.script}가 ${f.timedOut ? '시간 초과' : `exit ${f.code}`}로 끝났습니다.\n`
    + `변경된 파일: ${touched.join(', ')}\n\n${tail}\n\n`
    + '이 턴을 끝내기 전에 원인을 고치세요. 실패를 남겨두고 넘어가면 이 저장소가 여러 번 겪은 '
    + '"깨진 안전망을 방치" 상태가 됩니다. 고칠 수 없는 이유가 있으면 그 이유를 사용자에게 설명하세요.',
  systemMessage: `⚠ 자동 검증 실패 (${f.script}) — 턴을 차단했습니다.`,
}));
process.exit(0);

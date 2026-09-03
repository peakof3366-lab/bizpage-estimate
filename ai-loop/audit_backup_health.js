/* ═══════════════════════════════════════════════════════════════════════════
   운영 DB 백업이 **정말 돌고 있는가** — 조용히 멈춘 것을 알아채는 자리

   왜 만들었나 (2026-09-03, YO):
     9/2 18:00 백업이 **돌다가 죽었다.** 작업 스케줄러 기록은 `0xC000013A`(강제 종료),
     로그는 `^C`로 끊겨 있었다. 그런데 **아무도 몰랐다** — 알 방법이 파일이 없는 것을
     눈으로 세는 것뿐이었기 때문이다. 18일 중 성공은 7일이었다.

     원인은 작업 설정이었다. 이 컴퓨터는 노트북인데
       DisallowStartIfOnBatteries = True   배터리면 **시작조차 안 한다**
       StopIfGoingOnBatteries     = True   돌던 중 배터리로 바뀌면 **죽인다**
     → 둘 다 False로 바꿨다. 다만 **설정을 고친 것과 앞으로 안 멈추는 것은 다른 말**이다.

   ⚠ `db_backup.js`에 이미 `stalenessNote`가 있다 — 「마지막이 며칠 전」을 말해 준다.
     그 함수 주석에 「자동 백업이 조용히 멈춘 것을 알아채는 **유일한 창구**」라고 적혀
     있는데, 정작 **`--list`를 부를 때만 나온다.** 아무도 안 불렀다.
     결함 생성기 ③(실행된 적 없는 안전망)이 그대로 재현된 자리다.
     → 그래서 이 도구는 **규칙을 새로 쓰지 않고 그 함수를 그대로 부른다.**
       두 곳에 적으면 반드시 어긋난다(결함 생성기 ①).

   보는 것 넷:
     ① 마지막 백업이 며칠 전인가        (db_backup.js의 규칙 그대로)
     ② 최근 N일 중 며칠이 비었는가       (하루 걸러 도는 것을 「정상」으로 읽지 않기 위해)
     ③ 로그의 마지막 실행이 어떻게 끝났는가 (`exit=0`인가, `^C`로 끊겼는가)
     ④ 작업 스케줄러가 마지막에 뭐라 했는가 (윈도우에서만 — 없으면 없다고 말한다)

   실행: node ai-loop/audit_backup_health.js  [--days 14]
   ⚠ 읽기 전용이다. 백업을 새로 받지 않는다(그건 `db_backup.js`가 한다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const backupTool = require('./db_backup.js');

/* ── ③ 로그를 읽는다 ────────────────────────────────────────────────────
   `backup_daily.bat`이 남기는 모양:
       ==== 2026-09-02 18:00:03.68 ====
       운영 DB 백업 — 테이블 18개
       …
       exit=0
   죽으면 `exit=` 줄이 아예 안 찍힌다 — **그게 신호다.** 「exit이 0이 아님」이 아니라
   **「exit 줄이 없음」**을 봐야 한다. 처음에 0만 찾다가 죽은 회차를 놓칠 뻔했다. */
function readLogRuns(text) {
  const runs = [];
  const parts = String(text).split(/^\s*====\s(.+?)\s====\s*$/m);
  /* split 결과: [앞머리, 머리1, 본문1, 머리2, 본문2, …] */
  for (let i = 1; i < parts.length; i += 2) {
    const stamp = (parts[i] || '').trim();
    const body = parts[i + 1] || '';
    const m = body.match(/exit=(-?\d+)/);
    const killed = /\^C/.test(body);
    runs.push({
      stamp,
      code: m ? Number(m[1]) : null,
      killed,
      ok: !!m && Number(m[1]) === 0,
      why: m ? (Number(m[1]) === 0 ? '' : `exit=${m[1]}`)
        : (killed ? '중간에 끊겼다(^C) — 강제 종료' : '끝맺음(exit=) 줄이 없다 — 돌다가 죽었다'),
    });
  }
  return runs;
}

/* ── ② 날짜별로 있었나 ──────────────────────────────────────────────────
   ⚠ 파일 이름의 시각은 **UTC**다(`…T00-15-18-414Z`). 한국 시각으로 바꿔 세지 않으면
     18시 백업이 **다음 날 09시**로 읽혀 하루씩 밀린다. 실제로 처음에 그렇게 셌다. */
function fileDatesKST(files) {
  const out = new Set();
  for (const f of files) {
    const m = String(f).match(/^bizpage_backup_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    out.add(new Date(utc + 9 * 3600000).toISOString().slice(0, 10));
  }
  return out;
}

/* 🔴 **보관 개수 때문에 지워진 날을 「백업이 없던 날」로 세면 안 된다** (YO에서 실제로 당했다).
   `db_backup.js`는 기본 14개만 남기고 오래된 것을 지운다. 그래서 창을 14일로 잡으면
   **성공했지만 지워진 날**까지 빨간 줄로 나온다 — 처음 돌렸을 때 8/20~8/25가 그렇게
   나왔고, 로그를 보니 그중 일부는 멀쩡히 성공한 날이었다.
   → 창을 **가장 오래된 남은 백업 이후로 잘라서** 센다. 자른 사실도 함께 말한다.
   ⚠ 자른 창은 「그 이전은 괜찮았다」는 뜻이 아니라 **「알 수 없다」**는 뜻이다.
     그건 로그(③)가 답한다 — 로그는 안 지워진다. */
function dayCoverage(files, days, now) {
  const have = fileDatesKST(files);
  const kstToday = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const base = Date.parse(kstToday + 'T00:00:00Z');
  const oldest = [...have].sort()[0] || null;
  const oldestT = oldest ? Date.parse(oldest + 'T00:00:00Z') : null;

  const missing = [];
  let 잼 = 0, 잘림 = false;
  for (let i = 1; i <= days; i++) {           /* 오늘은 아직 안 지났으므로 어제부터 센다 */
    const t = base - i * 86400000;
    if (oldestT !== null && t < oldestT) { 잘림 = true; break; }
    잼++;
    const d = new Date(t).toISOString().slice(0, 10);
    if (!have.has(d)) missing.push(d);
  }
  return { days, window: 잼, clipped: 잘림, oldest, missing, covered: 잼 - missing.length };
}

/* ── ④ 작업 스케줄러 (윈도우 전용) ──────────────────────────────────────
   없거나 못 읽으면 **모른다고 말한다.** 「0건」으로 적으면 정상으로 읽힌다. */
function taskInfo(name = 'bizpage-db-backup') {
  if (process.platform !== 'win32') return { known: false, why: '윈도우가 아니다' };
  try {
    const { execFileSync } = require('child_process');
    const ps = `$ErrorActionPreference='Stop';$t=Get-ScheduledTask -TaskName '${name}';$i=Get-ScheduledTaskInfo -TaskName '${name}';` +
      `"$($i.LastRunTime)|$($i.LastTaskResult)|$($i.NextRunTime)|$($t.Settings.DisallowStartIfOnBatteries)|$($t.Settings.StopIfGoingOnBatteries)"`;
    /* ⚠ `stderr`를 파이프로 받는다 — 물려 두면 작업이 없을 때 PowerShell 오류가
       **우리 출력 한가운데로 새어 나온다**(검사 결과처럼 보인다). 이유는 아래에서
       `why`로 우리가 직접 말한다. */
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const [last, code, next, noBatt, stopBatt] = out.split('|');
    return {
      known: true, last, next,
      code: Number(code),
      batteryBlocks: /true/i.test(noBatt) || /true/i.test(stopBatt),
      noBatt, stopBatt,
    };
  } catch (e) {
    return { known: false, why: String(e.message || e).split('\n')[0].slice(0, 90) };
  }
}

/* 사람이 읽는 코드 이름 — 숫자만 찍으면 아무 뜻도 안 남는다 */
const CODE_NAMES = {
  0: '정상',
  267009: '지금 돌고 있다',
  267011: '아직 한 번도 안 돌았다',
  '-2147020576': '강제 종료(0xC000013A)',
  3221225786: '강제 종료(0xC000013A) — 배터리 전환·로그오프 등으로 죽었다',
};

function run() {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--days');
  const days = di >= 0 ? Math.max(1, Number(argv[di + 1]) || 14) : 14;
  const now = new Date();

  /* ⚠ 저장 위치는 `.env.local`의 `BACKUP_DIR`이 정할 수 있다 — 안 읽으면 기본값을 보고
     「백업이 없다」고 말한다. 여기서 위치를 다시 정하지 않고 db_backup.js에 물어본다. */
  require('./_load_env')();
  const { dir, source } = backupTool.resolveBackupDir([]);
  const files = backupTool.listBackups(dir);

  console.log('\n══ 운영 DB 백업이 정말 돌고 있는가 ' + now.toLocaleDateString('sv-SE') + ' ══');
  console.log(`폴더: ${dir}  (${source})`);
  console.log('─'.repeat(70));

  let 확인 = 0;

  /* ① 신선도 — 규칙은 db_backup.js가 가진다 */
  const note = backupTool.stalenessNote(files, now);
  console.log('\n■ ① 마지막 백업');
  console.log('   ' + (note.stale ? '🔴 ' : '✓ ') + note.text + `   (보관 ${files.length}개)`);
  if (note.stale) 확인++;

  /* ② 날짜 커버리지 */
  const cov = dayCoverage(files, days, now);
  console.log(`\n■ ② 파일이 남아 있는 구간에서 빠진 날`);
  console.log(`   ${cov.covered} / ${cov.window}일`);
  if (cov.clipped) {
    console.log(`   ℹ ${days}일을 보려 했지만 ${cov.oldest} 이전은 **보관 개수(기본 14개)로 지워져** 셀 수 없다.`);
    console.log('     지워진 것은 「없던 날」이 아니다 — 그 구간은 아래 ③ 로그가 답한다.');
  }
  if (cov.missing.length) {
    확인++;
    console.log('   🔴 빈 날: ' + cov.missing.slice(0, 12).join(' · ')
      + (cov.missing.length > 12 ? ` … 외 ${cov.missing.length - 12}일` : ''));
    console.log('   ⚠ 「어제 것이 있다」로 안심하지 말 것 — 하루 걸러 도는 것도 멈춘 것이다.');
  } else {
    console.log('   ✓ 빠진 날 없음');
  }

  /* ③ 로그의 마지막 실행들 */
  const logPath = path.join(__dirname, 'logs', 'backup.log');
  console.log('\n■ ③ 실행 기록 (로그가 어떻게 끝났는가)');
  if (!fs.existsSync(logPath)) {
    확인++;
    console.log('   🔴 로그가 없다: ' + logPath);
  } else {
    const runs = readLogRuns(fs.readFileSync(logPath, 'utf8'));
    const 최근 = runs.slice(-6);
    if (!최근.length) { 확인++; console.log('   🔴 로그에 실행 기록이 없다'); }
    for (const r of 최근) {
      console.log('   ' + (r.ok ? '✓ ' : '🔴 ') + r.stamp + (r.ok ? '' : '   ← ' + r.why));
    }
    const 죽은 = runs.filter((r) => !r.ok).length;
    if (죽은) { 확인++; console.log(`   🔴 기록 ${runs.length}회 중 ${죽은}회가 정상 종료가 아니다`); }
  }

  /* ④ 작업 스케줄러 */
  console.log('\n■ ④ 작업 스케줄러가 하는 말');
  const t = taskInfo();
  if (!t.known) {
    console.log('   ℹ 확인 못 함 — ' + t.why + ' (모르는 것이지 정상인 것이 아니다)');
  } else {
    const 이름 = CODE_NAMES[t.code] || CODE_NAMES[String(t.code)] || '알 수 없는 코드';
    const 정상 = t.code === 0 || t.code === 267009;
    if (!정상) 확인++;
    console.log('   ' + (정상 ? '✓ ' : '🔴 ') + `마지막 실행 ${t.last} → ${t.code} (${이름})`);
    console.log('   다음 예정: ' + t.next);
    if (t.batteryBlocks) {
      확인++;
      console.log('   🔴 배터리 설정이 백업을 막는다 — DisallowStartIfOnBatteries=' + t.noBatt
        + ' · StopIfGoingOnBatteries=' + t.stopBatt);
      console.log('   ⚠ 노트북이라 이 설정이면 전원을 안 꽂은 날은 백업이 통째로 없다.');
    } else {
      console.log('   ✓ 배터리로 돌아도 백업은 돈다');
    }
  }

  console.log('\n' + '─'.repeat(70));
  if (확인 === 0) {
    console.log('✅ 백업은 돌고 있다 — 빠진 날 없음 · 마지막 실행 정상');
  } else {
    console.log(`⚠ 확인 대상 ${확인}건 — 위를 보고 사람이 판단한다 (오류 판정이 아니다)`);
    console.log('   백업을 지금 받으려면: node ai-loop/db_backup.js');
  }
  console.log();
}

if (require.main === module) run();
module.exports = { readLogRuns, dayCoverage, fileDatesKST, taskInfo, CODE_NAMES };

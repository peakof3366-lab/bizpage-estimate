/* 운영 DB 전체 백업. `node ai-loop/db_backup.js`로 직접 실행(앱 엔드포인트 아님).
   읽기 전용이다 — 이 스크립트는 DB에 아무것도 쓰지 않는다.

   ── 실행 ────────────────────────────────────────────────────────────────
   node ai-loop/db_backup.js                     기본 폴더에 한 파일로 저장
   node ai-loop/db_backup.js --dir "D:\\백업"      저장 위치 지정
   node ai-loop/db_backup.js --keep 30           최근 30개만 남기고 오래된 것 정리(기본 14)
   node ai-loop/db_backup.js --list              저장된 백업 목록만 보기
   node ai-loop/db_backup.js --verify <파일>      백업 파일이 온전한지 확인(DB 접속 안 함)

   ── 왜 기본 저장 위치가 프로젝트 폴더 '밖'인가 ─────────────────────────
   이 저장소는 **루트가 그대로 정적 출력**이라 커밋된 파일이 공개 도메인에서 읽힌다
   (.vercelignore 첫 줄에 적힌 그대로, 실제로 내부 문서가 공개로 열려 있던 적이 있다).
   백업 파일에는 고객 이름·전화·이메일, 직원 비밀번호 해시, 가입코드 평문이 전부 들어
   있다. 프로젝트 안에 두면 실수 한 번(.vercelignore 규칙 수정, git add -A)으로 그게
   통째로 공개된다. 그래서 기본값을 프로젝트 밖으로 두고, 굳이 안에 쓰려면
   --allow-in-repo를 명시하게 한다.

   ── 부분 백업을 '성공'이라 부르지 않는다 ────────────────────────────────
   테이블 하나라도 못 읽으면 파일 이름에 PARTIAL을 붙이고 종료 코드 1로 끝낸다.
   반쪽짜리 파일을 정상 백업으로 착각하면, 정작 복원해야 할 날 그 사실을 알게 된다
   (결함 생성기 ③ — 안전망은 실제로 동작하는 것까지 확인해야 안전망이다).
   그래서 파일을 쓴 뒤 **다시 읽어 파싱하고 행 수까지 대조한 다음에** 성공이라 말한다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE_PREFIX = 'bizpage_backup_';
const FILE_RE = /^bizpage_backup_[0-9TZ_-]+(_PARTIAL)?\.json$/;

/* 테이블 목록의 진실은 db_migrate.js 하나다 — 여기 손으로 옮겨 적으면 테이블을
   새로 만든 날 백업에서만 조용히 빠진다(결함 생성기 ①: 목록의 산포). */
function readTableNames(migrateSrc) {
  const names = [];
  const re = /create table if not exists\s+([a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(migrateSrc)) !== null) names.push(m[1].toLowerCase());
  return [...new Set(names)];
}

function loadTableNames() {
  return readTableNames(fs.readFileSync(path.join(__dirname, 'db_migrate.js'), 'utf8'));
}

/* 이 드라이버 버전에는 sql.query()가 없고, 테이블 이름은 애초에 파라미터로 넣을 수
   없다(SQL 문법상 식별자다). 그래서 태그드 템플릿 배열을 손으로 만들되, 이름은
   **db_migrate.js에서 읽어온 목록에 있는 것만** 넣는다. 값은 넣지 않는다(읽기 전용). */
function taggedLiteral(text) {
  const chunks = [text];
  chunks.raw = [text];
  return chunks;
}

const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

async function dumpTables(sql, tables) {
  const data = {};
  const counts = {};
  const failed = {};
  for (const t of tables) {
    if (!SAFE_NAME.test(t)) { failed[t] = '테이블 이름이 이상합니다'; continue; }
    try {
      const rows = await sql(taggedLiteral(`select * from "${t}"`));
      data[t] = rows;
      counts[t] = rows.length;
    } catch (err) {
      /* 빈 테이블과 "못 읽은 테이블"은 다르다. 뭉뚱그리면 백업이 조용히 비어 있게 된다. */
      failed[t] = String((err && err.message) || err);
    }
  }
  return { data, counts, failed };
}

function buildBackup({ data, counts, failed }, tables) {
  return {
    meta: {
      tool: 'ai-loop/db_backup.js',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      tables,
      counts,
      failed,
      partial: Object.keys(failed).length > 0,
      totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
      note: '고객 개인정보·비밀번호 해시·가입코드가 들어 있습니다. 외부에 공유하지 마세요.',
    },
    data,
  };
}

/* 썼다고 끝이 아니다 — 다시 읽어서 파싱되는지, 테이블별 행 수가 메타와 맞는지 본다.
   디스크가 가득 찼거나 중간에 끊긴 파일은 열어 보기 전까지 멀쩡해 보인다. */
function verifyFile(file) {
  const problems = [];
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, problems: [`파일을 읽거나 해석할 수 없습니다: ${(err && err.message) || err}`] };
  }
  if (!parsed || !parsed.meta || !parsed.data) return { ok: false, problems: ['형식이 백업 파일이 아닙니다(meta/data 없음)'] };

  for (const t of parsed.meta.tables || []) {
    if (parsed.meta.failed && parsed.meta.failed[t]) continue;   // 못 읽은 건 이미 알고 있다
    if (!Array.isArray(parsed.data[t])) { problems.push(`${t}: 데이터가 목록이 아닙니다`); continue; }
    const expected = (parsed.meta.counts || {})[t];
    if (parsed.data[t].length !== expected) {
      problems.push(`${t}: 기록된 ${expected}건과 실제 ${parsed.data[t].length}건이 다릅니다`);
    }
  }
  return { ok: problems.length === 0, problems, meta: parsed.meta };
}

/* 자동 백업이 조용히 멈춘 것을 알아채는 유일한 창구다 — 작업 스케줄러가 실패해도
   아무도 로그를 안 본다. 목록을 볼 때 "마지막이 며칠 전"인지 항상 말해 준다. */
function stalenessNote(files, now = new Date()) {
  if (!files.length) return { days: null, stale: true, text: '아직 백업이 없습니다.' };
  const last = files[files.length - 1];
  const m = last.match(/^bizpage_backup_(.+?)(?:_PARTIAL)?\.json$/);
  const iso = m ? m[1].replace(/-/g, ':').replace(/^(\d{4}):(\d{2}):(\d{2})T/, '$1-$2-$3T').replace(/:(\d{3})Z$/, '.$1Z') : '';
  const t = Date.parse(iso);
  if (isNaN(t)) return { days: null, stale: true, text: `마지막 백업 시각을 읽을 수 없습니다: ${last}` };
  const days = Math.floor((now.getTime() - t) / 86400000);
  const partial = /_PARTIAL\.json$/.test(last);
  if (partial) return { days, stale: true, text: `⚠ 가장 최근 백업이 부분 백업입니다(${days}일 전). 다시 받아 주세요.` };
  return days >= 2
    ? { days, stale: true, text: `⚠ 마지막 백업이 ${days}일 전입니다 — 자동 백업이 멈춰 있는지 확인해 주세요.` }
    : { days, stale: false, text: `마지막 백업: ${days === 0 ? '오늘' : days + '일 전'}` };
}

function defaultDir() {
  /* 프로젝트 폴더와 나란히 둔다 — 찾기 쉬우면서 저장소 밖이다. */
  return path.join(path.dirname(ROOT), '비즈페이지_백업');
}

/* 저장 위치를 정하는 곳 하나 — `--dir` > `.env.local`의 BACKUP_DIR > 기본값.
   왜 .env.local인가: 백업을 클라우드 동기화 폴더에 두면 그 경로는 이 PC에만 해당하는
   값이다. 저장소에 커밋하면 다른 환경에서 틀린 경로가 되고, 배치파일에 박아 넣으면
   경로가 바뀔 때 아무도 못 찾는다. 자격증명과 같은 자리(.env.local, gitignore됨)에 둔다.

   ⚠ **BACKUP_DIR를 쓸 때는 폴더를 새로 만들지 않는다.** 동기화 폴더가 없다는 것은
   클라우드 앱이 꺼졌거나 경로가 바뀌었다는 뜻인데, 여기서 조용히 폴더를 만들어 버리면
   백업은 매일 '성공'하면서 **클라우드에는 한 건도 안 올라간다.** 정작 필요한 날
   그 사실을 알게 된다(결함 생성기 ② — 조용한 폴백). 그래서 없으면 멈추고 말한다. */
function resolveBackupDir(argv, env = process.env) {
  const explicit = argValue(argv, '--dir', null);
  if (explicit) return { dir: path.resolve(explicit), source: '--dir' };

  const configured = (env.BACKUP_DIR || '').trim();
  if (configured) return { dir: path.resolve(configured), source: 'BACKUP_DIR' };

  return { dir: path.resolve(defaultDir()), source: '기본값' };
}

/* BACKUP_DIR로 지정된 폴더가 실제로 쓸 수 있는 상태인지 본다.
   폴더 자체는 없어도 되지만(첫 실행), **부모 폴더**는 있어야 한다 —
   부모가 없으면 동기화 폴더 경로 자체가 틀린 것이다. */
function backupDirProblem({ dir, source }, exists = fs.existsSync) {
  if (source !== 'BACKUP_DIR') return null;
  if (exists(dir)) return null;
  const parent = path.dirname(dir);
  if (exists(parent)) return null;
  return `설정된 백업 폴더의 상위 경로가 없습니다: ${parent}`;
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => FILE_RE.test(f)).sort();
}

/* 오래된 백업 정리 — 이름 규칙에 맞는 것만 지운다. 폴더 안의 다른 파일은 건드리지
   않는다(사용자가 같은 폴더에 다른 것을 둘 수 있다). */
function pruneOld(dir, keep) {
  const files = listBackups(dir);
  if (files.length <= keep) return [];
  const doomed = files.slice(0, files.length - keep);
  for (const f of doomed) fs.unlinkSync(path.join(dir, f));
  return doomed;
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  /* 저장 위치가 .env.local에서 올 수 있으므로 **경로를 정하기 전에** 읽는다. */
  require('./_load_env')();

  if (argv.includes('--verify')) {
    const file = argValue(argv, '--verify', '');
    if (!file) { console.error('확인할 파일 경로를 적어 주세요: --verify <파일>'); process.exit(1); }
    const r = verifyFile(file);
    console.log(r.ok ? '✓ 백업 파일이 온전합니다.' : '✗ 백업 파일에 문제가 있습니다.');
    if (r.meta) {
      console.log(`  만든 시각: ${r.meta.createdAt}`);
      console.log(`  테이블 ${(r.meta.tables || []).length}개 · 총 ${r.meta.totalRows}행`
        + (r.meta.partial ? '  ⚠ 부분 백업' : ''));
    }
    r.problems.forEach(p => console.log('  · ' + p));
    process.exit(r.ok ? 0 : 1);
  }

  const target = resolveBackupDir(argv);
  const dir = target.dir;
  const problem = backupDirProblem(target);
  if (problem) {
    console.error(`✗ ${problem}`);
    console.error('  .env.local의 BACKUP_DIR를 확인해 주세요. 클라우드 동기화 앱이 꺼져 있으면');
    console.error('  그 폴더가 사라져 보일 수 있습니다 — 앱을 켠 뒤 다시 실행하세요.');
    console.error('  (여기서 폴더를 새로 만들면 백업은 매일 성공하면서 클라우드에는 한 건도 안 올라갑니다.)');
    process.exit(1);
  }

  if (argv.includes('--list')) {
    const files = listBackups(dir);
    console.log(`백업 폴더: ${dir}  (${target.source})`);
    files.forEach(f => {
      const size = (fs.statSync(path.join(dir, f)).size / 1024).toFixed(0);
      console.log(`  ${f}  ${size} KB`);
    });
    const note = stalenessNote(files);
    console.log(`\n${note.text}`);
    if (note.stale) process.exit(1);
    return;
  }

  /* 저장소 안에 쓰려는 것을 막는다 — 이 폴더의 파일은 공개 도메인으로 새어나간 전례가
     있다(.vercelignore 주석 참고). 정말 필요하면 명시적으로 --allow-in-repo. */
  const insideRepo = !path.relative(ROOT, dir).startsWith('..') && !path.isAbsolute(path.relative(ROOT, dir));
  if (insideRepo && !argv.includes('--allow-in-repo')) {
    console.error(`저장 위치가 프로젝트 폴더 안입니다: ${dir}`);
    console.error('백업에는 고객 개인정보·비밀번호 해시·가입코드가 들어 있고, 이 저장소는');
    console.error('루트가 그대로 공개 도메인에 올라갑니다. 폴더를 바깥으로 잡아 주세요.');
    console.error('(그래도 진행하려면 --allow-in-repo)');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL이 없습니다(.env.local을 확인해 주세요).');
    process.exit(1);
  }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  const tables = loadTableNames();
  console.log(`운영 DB 백업 — 테이블 ${tables.length}개`);

  const dumped = await dumpTables(sql, tables);
  const backup = buildBackup(dumped, tables);

  fs.mkdirSync(dir, { recursive: true });
  const stamp = backup.meta.createdAt.replace(/[:.]/g, '-');
  const name = `${FILE_PREFIX}${stamp}${backup.meta.partial ? '_PARTIAL' : ''}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1), 'utf8');

  for (const t of tables) {
    if (dumped.failed[t]) console.log(`  ✗ ${t.padEnd(22)} 읽지 못함 — ${dumped.failed[t]}`);
    else console.log(`  · ${t.padEnd(22)} ${String(dumped.counts[t]).padStart(6)}행`);
  }

  const check = verifyFile(file);
  const sizeKb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`\n저장: ${file}  (${sizeKb} KB)`);

  const pruned = pruneOld(dir, Number(argValue(argv, '--keep', 14)));
  if (pruned.length) console.log(`오래된 백업 ${pruned.length}개 정리: ${pruned.join(', ')}`);

  if (!check.ok) {
    console.error('\n✗ 저장한 파일을 다시 읽어 확인하는 데 실패했습니다:');
    check.problems.forEach(p => console.error('  · ' + p));
    process.exit(1);
  }
  if (backup.meta.partial) {
    console.error(`\n⚠ 부분 백업입니다 — ${Object.keys(dumped.failed).join(', ')}를 읽지 못했습니다.`);
    console.error('  파일 이름에 PARTIAL을 붙였습니다. 연결을 확인하고 다시 받아 주세요.');
    process.exit(1);
  }
  console.log(`✓ 총 ${backup.meta.totalRows}행 백업 완료 — 다시 읽어 행 수까지 대조했습니다.`);
}

module.exports = { readTableNames, loadTableNames, dumpTables, buildBackup, verifyFile, listBackups, pruneOld, stalenessNote, taggedLiteral, FILE_RE, defaultDir, resolveBackupDir, backupDirProblem };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

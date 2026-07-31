/* 백업 파일에서 운영 DB로 되돌리기. `node ai-loop/db_restore.js`로 직접 실행.
   ⚠ 유일하게 DB에 쓰는 도구다. 기본은 **아무것도 쓰지 않고 계획만 보여준다.**

   ── 실행 ────────────────────────────────────────────────────────────────
   node ai-loop/db_restore.js                          가장 최근 백업으로 '계획'만 출력
   node ai-loop/db_restore.js --file <파일>             파일 지정
   node ai-loop/db_restore.js --tables inquiries,quotes 일부 테이블만
   node ai-loop/db_restore.js --confirm                 계획대로 실제 실행(빠진 행만 넣기)
   node ai-loop/db_restore.js --replace --confirm       ⚠ 해당 테이블을 통째로 백업본으로 교체

   ── 두 가지 모드 ───────────────────────────────────────────────────────
   · 기본(빠진 행만): `on conflict do nothing`. 실수로 지워진 행을 되살리는 용도.
     지금 DB에 있는 행은 하나도 건드리지 않는다 — 백업 시점 이후의 작업이 안 지워진다.
   · --replace: 그 테이블을 비우고 백업본을 그대로 넣는다. 백업 이후의 변경은 사라진다.
     한 테이블씩 트랜잭션으로 처리해 '반쯤 지워진' 상태가 남지 않게 한다.

   ── 복원이 끝나면 시퀀스를 맞춘다 ──────────────────────────────────────
   id가 bigserial인 테이블(직원 계정·요율 변경 이력 등)에 예전 id를 그대로 넣으면
   시퀀스는 그대로 1에 머문다. 그 상태로 새 행을 만들면 **중복 키 오류로 기능이
   깨진다** — 복원 직후엔 멀쩡해 보이고 며칠 뒤 "계정 추가가 안 된다"로 나타난다.
   그래서 넣은 뒤 setval로 맞추고, 맞췄다고 화면에 적는다. */
const fs = require('fs');
const path = require('path');
const { verifyFile, listBackups, loadTableNames } = require('./db_backup');

const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

function taggedLiteral(text) {
  const chunks = [text];
  chunks.raw = [text];
  return chunks;
}
/* 값이 하나 들어가는 태그드 템플릿. 테이블 이름은 화이트리스트로 문자열에 박고,
   **데이터는 반드시 파라미터로** 넘긴다. */
function taggedWithValue(before, after) {
  const chunks = [before, after];
  chunks.raw = [before, after];
  return chunks;
}

/* id bigserial 테이블 목록도 db_migrate.js에서 읽는다(손으로 옮겨 적지 않는다). */
function readSerialTables(migrateSrc) {
  const out = [];
  const re = /create table if not exists\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)/gi;
  let m;
  while ((m = re.exec(migrateSrc)) !== null) {
    if (/\bid\s+bigserial\b/i.test(m[2])) out.push(m[1].toLowerCase());
  }
  return out;
}

function planRestore(backup, wanted, currentCounts) {
  const tables = wanted.length ? wanted : (backup.meta.tables || []);
  return tables.map((t) => ({
    table: t,
    inBackup: Array.isArray(backup.data[t]) ? backup.data[t].length : null,
    inDb: currentCounts[t] === undefined ? null : currentCounts[t],
    skipped: (backup.meta.failed && backup.meta.failed[t]) ? '백업 당시 읽지 못한 테이블' : null,
  }));
}

async function currentCounts(sql, tables) {
  const counts = {};
  for (const t of tables) {
    if (!SAFE_NAME.test(t)) continue;
    try {
      const r = await sql(taggedLiteral(`select count(*)::int as n from "${t}"`));
      counts[t] = r[0] ? r[0].n : 0;
    } catch { counts[t] = null; }   // 못 읽으면 null — 0(비었음)과 구별한다
  }
  return counts;
}

async function restoreTable(sql, table, rows, { replace, serial }) {
  if (!SAFE_NAME.test(table)) throw new Error(`테이블 이름이 이상합니다: ${table}`);
  const payload = JSON.stringify(rows);
  const insert = sql(
    taggedWithValue(
      `insert into "${table}" select * from jsonb_populate_recordset(null::"${table}", `,
      `::jsonb) on conflict do nothing`,
    ),
    payload,
  );

  if (replace) {
    /* 지우기와 넣기를 한 트랜잭션으로 — 중간에 끊기면 그 테이블이 빈 채로 남는다. */
    await sql.transaction([sql(taggedLiteral(`delete from "${table}"`)), insert]);
  } else {
    await insert;
  }

  if (serial) {
    await sql(taggedLiteral(
      `select setval(pg_get_serial_sequence('"${table}"', 'id'),`
      + ` coalesce((select max(id) from "${table}"), 1))`,
    ));
  }
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const confirm = argv.includes('--confirm');
  const replace = argv.includes('--replace');

  let file = argValue(argv, '--file', '');
  if (!file) {
    const { defaultDirForCli } = module.exports;
    const dir = argValue(argv, '--dir', defaultDirForCli());
    const files = listBackups(dir);
    if (!files.length) { console.error(`백업 파일이 없습니다: ${dir}`); process.exit(1); }
    file = path.join(dir, files[files.length - 1]);
    console.log(`가장 최근 백업을 씁니다: ${file}`);
  }

  const check = verifyFile(file);
  if (!check.ok) {
    console.error('✗ 백업 파일이 온전하지 않아 복원하지 않습니다:');
    check.problems.forEach(p => console.error('  · ' + p));
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (backup.meta.partial) {
    console.warn('⚠ 이 파일은 부분 백업입니다 — 일부 테이블이 비어 있을 수 있습니다.');
  }

  const known = loadTableNames();
  const wanted = (argValue(argv, '--tables', '') || '').split(',').map(s => s.trim()).filter(Boolean);
  const unknown = wanted.filter(t => !known.includes(t));
  if (unknown.length) { console.error(`모르는 테이블입니다: ${unknown.join(', ')}`); process.exit(1); }

  require('./_load_env')();
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL이 없습니다(.env.local 확인).'); process.exit(1); }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  const targets = wanted.length ? wanted : (backup.meta.tables || []);
  const counts = await currentCounts(sql, targets);
  const plan = planRestore(backup, wanted, counts);

  console.log(`\n백업 시각: ${backup.meta.createdAt}`);
  console.log(`방식: ${replace ? '⚠ 테이블 통째 교체(--replace)' : '빠진 행만 채우기(기본)'}`);
  console.log('\n테이블                    백업본     현재 DB');
  for (const p of plan) {
    const note = p.skipped ? `  ← ${p.skipped}` : '';
    console.log(`  ${p.table.padEnd(22)} ${String(p.inBackup ?? '-').padStart(6)} ${String(p.inDb ?? '읽기실패').padStart(10)}${note}`);
  }

  if (!confirm) {
    console.log('\n계획만 출력했습니다. 실제로 넣으려면 --confirm 을 붙이세요.');
    console.log(replace
      ? '⚠ --replace는 해당 테이블의 현재 내용을 지웁니다. 백업 이후의 작업이 사라집니다.'
      : '기본 모드는 지금 DB에 있는 행을 건드리지 않습니다(빠진 행만 넣습니다).');
    return;
  }

  const serialTables = readSerialTables(fs.readFileSync(path.join(__dirname, 'db_migrate.js'), 'utf8'));
  let done = 0;
  for (const p of plan) {
    if (p.skipped || !p.inBackup) continue;
    const rows = backup.data[p.table];
    try {
      await restoreTable(sql, p.table, rows, { replace, serial: serialTables.includes(p.table) });
      const after = await currentCounts(sql, [p.table]);
      console.log(`  ✓ ${p.table.padEnd(22)} ${p.inDb} → ${after[p.table]}행`
        + (serialTables.includes(p.table) ? '  (id 시퀀스 재조정)' : ''));
      done++;
    } catch (err) {
      console.error(`  ✗ ${p.table.padEnd(22)} 실패 — ${(err && err.message) || err}`);
    }
  }
  console.log(`\n테이블 ${done}개 복원했습니다.`);
}

module.exports = {
  readSerialTables, planRestore, restoreTable, currentCounts, taggedLiteral, taggedWithValue,
  defaultDirForCli: () => path.join(path.dirname(path.join(__dirname, '..')), '비즈페이지_백업'),
};

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

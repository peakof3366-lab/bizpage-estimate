/* ══════════════════════════════════════════════════════════════════════════
   마이그레이션이 **빈 DB에서 처음부터** 끝까지 도는가 (2026-10-02)

   ■ 왜 필요한가
   `db_migrate.js`가 `custom_destinations`에 칸 둘(보험 권역·시즌 프로파일)을 더하는 줄이
   **그 표를 만드는 줄보다 100줄 앞**에 있었다. 운영 DB는 표가 이미 있어 아무도 몰랐고,
   빈 DB(재해 복구·새 환경·로컬 종단 시험)에 깔면
   `relation "custom_destinations" does not exist`로 **마이그레이션 전체가 멈췄다.**
   신입 직원 종단 시험을 메모리 Postgres 위에서 돌리다 발견했다.

   ■ 무엇을 보나
   `alter table X` · `create index … on X` · `insert into X` · `update X`가
   **`create table if not exists X`보다 아래**에 있는가. 파일만 읽는다(DB에 안 붙는다).
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'db_migrate.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
};

/* 주석은 빼고 잰다 — 설명 속 「alter table quotes」 같은 글자를 문장으로 세면 안 된다 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
          .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

function check(text) {
  const code = stripComments(text);
  const created = new Map();
  const uses = [];
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  for (const m of code.matchAll(/create table if not exists (\w+)/g)) {
    if (!created.has(m[1])) created.set(m[1], m.index);
  }
  const USE = /\b(?:alter table|insert into|update)\s+(\w+)|create (?:unique )?index if not exists \w+\s+on\s+(\w+)/g;
  for (const m of code.matchAll(USE)) uses.push({ table: m[1] || m[2], at: m.index });
  const early = uses.filter((u) => !created.has(u.table) || u.at < created.get(u.table))
    .map((u) => `${u.table} (${lineOf(u.at)}행 · 만드는 줄 ${created.has(u.table) ? lineOf(created.get(u.table)) + '행' : '없음'})`);
  return { created, uses, early };
}

console.log('\n[1] 지금 파일 — 만들기 전에 쓰는 표가 없다');
{
  const r = check(src);
  ok('① 표를 만드는 줄을 찾았다 (자가 눈을 떴다)', r.created.size >= 15, String(r.created.size));
  ok('① 칸 추가·색인·넣기 줄을 찾았다', r.uses.length >= 50, String(r.uses.length));
  ok('🔴 ① 만들기 전에 쓰는 표 0', r.early.length === 0, r.early.join(' | '));
}

console.log('\n[2] 🔴 고장 주입 — 그 자리를 다시 앞으로 옮기면 잡히는가');
{
  const line = src.split('\n').find((l) => /alter table custom_destinations add column if not exists season_profile/.test(l));
  ok('② 옮길 줄이 있다', !!line);
  /* 맨 첫 표(quotes)를 만들기 전으로 끌어올린다 — 2026-10-02 이전과 같은 모양 */
  const broken = src.replace(line, '').replace('async function main() {', 'async function main() {\n' + line);
  const r = check(broken);
  ok('🔴 ② 앞당긴 custom_destinations를 잡는다', r.early.some((e) => e.startsWith('custom_destinations')), r.early.join(' | '));
  ok('② 주석 속 글자는 세지 않는다', check('/* alter table nope add x */\nawait sql`create table if not exists a (x int)`').early.length === 0);
}

console.log('\n────────────────────────────────────────────────────────────────');
console.log(`결과: ${pass} pass / ${fail} fail  — aG 마이그레이션 순서`);
process.exit(fail ? 1 : 0);

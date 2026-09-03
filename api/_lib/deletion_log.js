/* ═══════════════════════════════════════════════════════════════════════════
   지운 것을 남기는 곳 — **한 곳이다** (YP)

   🔴 왜 만들었나. 실제로 두 번 당했다:
     · 2026-08-24 `packages` 31행 → 1행. 상품 30건이 사라졌는데 어디에도 안 남았다.
       원인을 못 찾아 대기열 P-1이 「직접 지우셨습니까?」로 몇 주 열려 있었다.
     · 같은 날 `quotes` 13행 → 0행. 고객 견적 요청이 통째로 사라졌다.
     둘 다 **백업 파일을 뒤져서야** 알았다(2026-09-03). 백업은 하루 한 번이라
     그 사이에 지워지고 다시 채워지면 영영 모른다.

   ⚠ **삭제 자리가 6개 파일에 9곳이다.** 각자 기록하게 만들면 하나를 반드시 빠뜨린다
     (결함 생성기 ① — 이 저장소가 여섯 번 당한 유형). 그래서 **기록하고 지우는 일을
     이 파일의 함수 하나가 함께** 한다. 부르는 쪽은 `delete from`을 직접 쓰지 않는다.

   🔴 **기록에 실패하면 지우지 않는다.** 순서가 핵심이다 —
     ① 지울 행을 읽는다 → ② 기록한다 → ③ 지운다.
     기록이 실패했는데 삭제가 진행되면 **바로 그 순간이 지금까지의 상태**다
     (아무 데도 안 남는 삭제). 그래서 ②가 던지면 ③은 아예 안 간다.
     ⚠ 반대로 하면(지우고 기록) 기록 실패 시 되돌릴 근거가 사라진다.

   ⚠ 이 표는 **관리자 인증 뒤에서만** 읽는다. `quotes`·`inquiries` 스냅샷에는
     고객 연락처가 들어 있다. 공개 GET에 절대 얹지 말 것.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 표 이름을 여기 적어 둔다 — 부르는 쪽이 오타를 내면 그 삭제만 조용히 기록에서
   빠진다. 아는 이름이 아니면 그 자리에서 던진다(조용한 폴백을 만들지 않는다). */
const KNOWN_TABLES = new Set([
  'quotes',
  'inquiries',
  'packages',
  'itinerary_overrides',
  'actual_price_reports',
  'custom_destinations',
  'rate_overrides',
  'rate_fx_baseline',
]);

/* 로그인 사용자를 「누가」로 적는다. 없으면 빈 값이 아니라 **모른다고 적는다** —
   빈 문자열은 나중에 「기록이 비었다」와 구별이 안 된다. */
function actorOf(req) {
  const u = (req && req.user) || null;
  if (!u) return '(로그인 정보 없음)';
  return `${u.username || '?'}#${u.id == null ? '?' : String(u.id)}`;
}

/* ── 기록하고 지운다 ────────────────────────────────────────────────────────
   sql       : api/_lib/db.js 의 tagged template
   table     : KNOWN_TABLES 안의 이름
   where     : { column, value } — 지울 행을 고르는 조건 (단일 컬럼 등호만 받는다)
   opts      : { req, reason, extra }
   반환      : { deleted: <지운 행 수>, rows: <지운 행들> }

   ⚠ **컬럼 이름은 문자열 보간으로 들어간다** — 값이 아니라 식별자라 파라미터로 못
     넘긴다. 그래서 호출부가 주는 상수만 받도록 화이트리스트로 막는다.
     사용자 입력이 여기 닿으면 안 된다(결함 생성기 ④). */
const KNOWN_COLUMNS = new Set(['id', 'dest_key', 'destination_key']);

async function deleteAndLog(sql, table, where, opts = {}) {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`deletion_log: 모르는 표 이름 "${table}" — KNOWN_TABLES에 먼저 적을 것`);
  }
  if (!where || !KNOWN_COLUMNS.has(where.column)) {
    throw new Error(`deletion_log: 모르는 컬럼 "${where && where.column}" — KNOWN_COLUMNS에 먼저 적을 것`);
  }
  const { req = null, reason = '', extra = null } = opts;

  /* ⚠ 표·컬럼은 **값이 아니라 식별자**라 `$1`로 못 넘긴다. 위 화이트리스트를 통과한
     상수만 문자열로 들어간다 — 사용자 입력은 여기 닿지 않는다(결함 생성기 ④).
     값은 전부 `$n`으로 넘긴다. Neon 드라이버가 `sql(문자열, [값들])` 형태를 받는다. */

  /* ① 지울 행을 통째로 읽는다. 없으면 지울 것도 기록할 것도 없다. */
  const rows = await sql(`select * from ${table} where ${where.column} = $1`, [where.value]);
  if (!rows.length) return { deleted: 0, rows: [] };

  /* ② 먼저 기록한다 — 여기서 던지면 ③은 안 간다(아무것도 안 지워진다). */
  const actor = actorOf(req);
  for (const row of rows) {
    const rowId = String(row[where.column] != null ? row[where.column] : '(?)');
    const snapshot = extra ? Object.assign({}, row, { _extra: extra }) : row;
    await sql(
      'insert into deletion_log (table_name, row_id, snapshot, actor, reason) values ($1, $2, $3, $4, $5)',
      [table, rowId, JSON.stringify(snapshot), actor, String(reason || '')],
    );
  }

  /* ③ 이제 지운다 */
  const gone = await sql(`delete from ${table} where ${where.column} = $1 returning *`, [where.value]);
  return { deleted: gone.length, rows: gone };
}

module.exports = { deleteAndLog, actorOf, KNOWN_TABLES, KNOWN_COLUMNS };

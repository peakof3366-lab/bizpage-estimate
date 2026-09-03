/* ═══════════════════════════════════════════════════════════════════════════
   무엇이 지워졌는가 — `deletion_log`를 읽는다 (YP)

   ⚠ **읽기 전용이다.** 아무것도 지우거나 되돌리지 않는다.
     되돌리는 것은 사람이 판단할 일이라, 여기서는 **되돌릴 수 있는 형태로 보여만** 준다
     (`db_restore.js`가 「계획만 출력」인 것과 같은 원칙).

   🔴 왜 필요한가 — 기록만 만들고 읽는 길을 안 내면 **아무도 안 보는 표**가 된다.
     이 저장소가 방금 그 함정을 밟았다: `db_backup.js`의 `stalenessNote`는
     「조용히 멈춘 것을 알아채는 유일한 창구」였는데 `--list`를 부를 때만 나와서
     백업이 이틀 멈춘 것을 아무도 몰랐다(결함 생성기 ③).

   실행:
     node ai-loop/audit_deletions.js                 최근 30건
     node ai-loop/audit_deletions.js --table packages
     node ai-loop/audit_deletions.js --id 42         그 건의 행 전체를 펼쳐 본다
     node ai-loop/audit_deletions.js --limit 100

   ⚠ 스냅샷에는 **고객 연락처가 들어 있다**(`quotes`·`inquiries`). 기본은 가린다 —
     원본이 필요하면 `--full`. 화면 공유·캡처 때 그대로 나가지 않게 하기 위해서다
     (`db_status.js`가 같은 규칙을 쓴다).
   ═══════════════════════════════════════════════════════════════════════════ */
require('./_load_env')();
const { sql } = require('../api/_lib/db');

const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const FULL = argv.includes('--full');
const LIMIT = Math.max(1, Number(arg('--limit', 30)) || 30);
const TABLE = arg('--table', null);
const ONE = arg('--id', null);

/* 연락처로 보이는 칸은 가린다. **가렸다는 사실은 남긴다** — 조용히 지우면
   「원래 없었다」와 구별되지 않는다. */
const SECRET_KEYS = /tel|phone|연락처|email|contact|mobile|password|hash/i;
function mask(v) {
  const s = String(v);
  if (s.length <= 4) return '***';
  return s.slice(0, 2) + '*'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}
function safe(obj, depth = 0) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((x) => safe(x, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!FULL && SECRET_KEYS.test(k) && v != null && typeof v !== 'object') out[k] = mask(v) + ' (가림)';
    else out[k] = safe(v, depth + 1);
  }
  return out;
}

/* 행 하나를 한 줄로 요약한다 — 표마다 사람이 알아보는 칸이 다르다.
   ⚠ 모르는 표면 **지어내지 않고** 칸 이름을 그대로 보여준다. */
function oneLine(table, snap) {
  if (!snap || typeof snap !== 'object') return '(스냅샷 없음)';
  const pick = (...keys) => keys.map((k) => snap[k]).find((v) => v != null && v !== '');
  const money = (v) => (v == null ? null : Number(v).toLocaleString());
  switch (table) {
    case 'packages':
      return [pick('title', 'customer_label'), snap.status, snap.depart_date].filter(Boolean).join(' · ');
    case 'quotes':
      return [pick('org_name'), pick('dest_label'), snap.participants && snap.participants + '명',
        money(snap.total) && money(snap.total) + '원', snap.status].filter(Boolean).join(' · ');
    case 'inquiries':
      return [pick('name', 'org_name'), pick('subject', 'message') && String(pick('subject', 'message')).slice(0, 30)]
        .filter(Boolean).join(' · ');
    case 'itinerary_overrides':
      return [snap.dest_key, snap.updated_by && '수정 ' + snap.updated_by].filter(Boolean).join(' · ');
    case 'actual_price_reports':
      return [pick('destination_key', 'destination'), snap.source].filter(Boolean).join(' · ');
    default:
      return Object.keys(snap).slice(0, 5).join(', ');
  }
}

(async () => {
  /* 표가 아직 없을 수 있다(마이그레이션 전). **없다고 말한다** — 0건과 다르다. */
  const exists = await sql(
    "select to_regclass('public.deletion_log') is not null as ok", []);
  if (!exists[0] || !exists[0].ok) {
    console.log('\n🔴 `deletion_log` 표가 아직 없습니다.');
    console.log('   먼저 마이그레이션을 돌려야 합니다: node ai-loop/db_migrate.js  (승인 후)');
    console.log('   ⚠ 표가 없는 동안의 삭제는 **어디에도 안 남습니다.**\n');
    return;
  }

  if (ONE) {
    const rows = await sql('select * from deletion_log where id = $1', [Number(ONE)]);
    if (!rows.length) { console.log(`\n그런 기록이 없습니다: id=${ONE}\n`); return; }
    const r = rows[0];
    console.log(`\n══ 지운 기록 #${r.id} ══`);
    console.log(`언제  : ${new Date(r.created_at).toLocaleString('sv-SE')}`);
    console.log(`무엇  : ${r.table_name} / ${r.row_id}`);
    console.log(`누가  : ${r.actor}`);
    console.log(`왜    : ${r.reason || '(안 적힘)'}`);
    console.log('행 전체:');
    console.log(JSON.stringify(safe(r.snapshot), null, 2));
    if (!FULL) console.log('\n⚠ 연락처로 보이는 칸은 가렸습니다 — 원본은 `--full`.');
    console.log();
    return;
  }

  const rows = TABLE
    ? await sql('select * from deletion_log where table_name = $1 order by created_at desc limit $2', [TABLE, LIMIT])
    : await sql('select * from deletion_log order by created_at desc limit $1', [LIMIT]);

  console.log(`\n══ 지워진 것 ${TABLE ? `— ${TABLE}` : ''} (최근 ${rows.length}건) ══`);
  if (!rows.length) {
    console.log('\n기록이 없습니다.');
    console.log('⚠ 「아무것도 안 지워졌다」는 뜻입니다 — **표를 만든 뒤로만** 그렇습니다.');
    console.log('   그 이전 삭제는 백업 파일로만 확인됩니다(2026-08-24 상품 30건·견적 13건이 그 경우입니다).\n');
    return;
  }
  console.log('─'.repeat(96));
  for (const r of rows) {
    const when = new Date(r.created_at).toLocaleString('sv-SE').slice(0, 16);
    console.log(`#${String(r.id).padEnd(5)} ${when}  ${String(r.table_name).padEnd(22)} ${r.actor}`);
    console.log(`       ${oneLine(r.table_name, safe(r.snapshot))}`);
    if (r.reason) console.log(`       ↳ ${r.reason}`);
  }
  console.log('─'.repeat(96));

  /* 같은 시각에 몰린 대량 삭제를 짚어 준다 — 2026-08-24가 정확히 그 모양이었다 */
  const byMinute = new Map();
  for (const r of rows) {
    const k = `${r.table_name}@${new Date(r.created_at).toISOString().slice(0, 16)}`;
    byMinute.set(k, (byMinute.get(k) || 0) + 1);
  }
  const 뭉치 = [...byMinute.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
  if (뭉치.length) {
    console.log('\n⚠ 한꺼번에 많이 지워진 자리 (한 번에 5건 이상):');
    for (const [k, n] of 뭉치) console.log(`   · ${k.replace('@', '  ')}  — ${n}건`);
    console.log('   실수인지 의도인지는 사람이 봐야 합니다. 행 전체는 `--id <번호>`로 펼칩니다.');
  }
  console.log(`\n한 건을 펼쳐 보려면: node ai-loop/audit_deletions.js --id <번호>`);
  if (!FULL) console.log('⚠ 연락처로 보이는 칸은 가렸습니다 — 원본은 `--full`.');
  console.log();
})().catch((e) => { console.error(e); process.exit(1); });

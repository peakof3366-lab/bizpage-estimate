/* ═══════════════════════════════════════════════════════════════════════════
   견적번호 일괄 부여 — 번호 없는 건과 옛 형식(`Q260824-03`)을 새 형식으로 (대표 지시 1-4)
   ───────────────────────────────────────────────────────────────────────────
       node ai-loop/backfill_quote_no.js            # 🔴 **보기만 한다**(기본)
       node ai-loop/backfill_quote_no.js --apply    # 실제로 쓴다

   ■ 왜 기본이 「보기만」인가
   대표 지시 1-4가 「중복 번호가 있다면 **목록으로 먼저 보고한 뒤** 정리한다」이다.
   그리고 번호는 한 번 붙으면 안 바뀌는 값이라, 잘못 붙이면 되돌리는 것이 고친 것보다
   비싸다. → 무엇을 할지 먼저 전부 찍고, `--apply`가 있을 때만 쓴다.

   ■ 무엇을 하나
   ① 번호가 없는 견적 → **생성일 순서대로** 그 건의 생성 월(KST) 번호를 붙인다.
   ② 옛 형식(`Q…`) 번호 → 새 형식으로 다시 매긴다 (2026-09-23 대표 결정).
      🔴 옛 번호는 버리지 않고 `quote_no_log`에 남긴다 — 그 번호로 나간 문서가 있다.
   ③ 발급된 견적서(`quote_shares`) → **견적의 번호를 물려받고** 차수를 붙인다.
      앞선 견적 기록이 없는 건(패키지 발급·옛 링크)은 그 건의 발급 월로 새로 딴다.
   ④ 중복 번호는 **고치기 전에 목록으로 찍는다.**

   ■ 🔴 순번 표를 같이 올린다
   번호를 붙이고 `quote_seq_m`을 안 올리면, 다음에 저장되는 견적이 **이미 쓴 번호**를
   받아 유일 제약에 걸린다(=저장이 통째로 실패한다). 월별 최대값으로 맞춘다.

   ⚠ 이 도구는 `ai-loop/`에 있어 **배포에 안 올라간다**(.vercelignore). 운영 DB에
     직접 닿으므로 대표 승인 뒤 사람이 손으로 돌린다.
   ═══════════════════════════════════════════════════════════════════════════ */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');
const QNO = require('../api/_lib/quote_no.js');

const APPLY = process.argv.includes('--apply');
const BY = '일괄부여(backfill)';

/* 생성 시각(UTC 저장) → 한국 기준 YYMM. ⚠ UTC로 재면 매달 1일 새벽 건이 전달로 간다. */
function ymOf(createdAt) {
  const t = createdAt ? new Date(createdAt) : new Date();
  return QNO.toYymm(QNO.kstToday(t));
}

function fmt(n) { return String(n).padStart(4, '0'); }

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  console.log('\n═══ 견적번호 일괄 부여 ' + (APPLY ? '— 🔴 실제로 씁니다' : '— 보기만 합니다(--apply로 실행)') + ' ═══\n');

  const quotes = await sql`select id, quote_no, created_at from quotes order by created_at asc, id asc`;
  const shares = await sql`select id, quote_no, quote_id, created_at from quote_shares order by created_at asc, id asc`;
  console.log('견적 기록 ' + quotes.length + '건 · 발급된 견적서 ' + shares.length + '건');

  /* ── ④ 먼저 **중복부터 찍는다** (고치기 전에 보고한다) ─────────────────── */
  const dupOf = (rows, label) => {
    const seen = new Map();
    for (const r of rows) {
      if (!r.quote_no) continue;
      const k = String(r.quote_no);
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(r.id);
    }
    const dup = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    if (dup.length) {
      console.log('\n🔴 ' + label + ' 중복 번호 ' + dup.length + '종');
      for (const [no, ids] of dup) console.log('   · ' + no + ' → ' + ids.join(', '));
    } else console.log('✅ ' + label + ' 중복 번호 없음');
    return dup;
  };
  dupOf(quotes, '견적 기록');
  dupOf(shares, '발급된 견적서');

  /* ── 월별 순번의 시작점: 이미 쓰인 새 형식 번호의 최대값 ──────────────── */
  const used = new Map();   /* ym → 최대 순번 */
  const bump = (no) => {
    const m = String(no || '').match(/^BP-(\d{4})-(\d{4,})/);
    if (!m) return;
    const ym = m[1], n = Number(m[2]);
    if (!used.has(ym) || used.get(ym) < n) used.set(ym, n);
  };
  quotes.forEach((q) => bump(q.quote_no));
  shares.forEach((s) => bump(s.quote_no));
  const nextIn = (ym) => { const n = (used.get(ym) || 0) + 1; used.set(ym, n); return n; };

  /* ── ①② 견적 기록 ──────────────────────────────────────────────────────
     🔴 **생성일 순서대로 붙인다**(대표 지시 1-4). 그런데 번호를 받을 대상이 두 표에
       걸쳐 있다 — 견적 기록과, 앞선 견적이 없는 발급 견적서(패키지·옛 링크)다.
       표를 따로 돌면 **9/23 견적이 0001, 9/14 견적서가 0002**처럼 시간이 뒤집힌다
       (실제로 처음 짤 때 그렇게 나왔다). → 둘을 한 줄로 세워 시간순으로 붙인다. */
  const needQuote = quotes.filter((q) => !(q.quote_no && QNO.QUOTE_NO_RE.test(q.quote_no)));
  const orphanShares = shares.filter((s) => {
    const q = s.quote_id ? quotes.find((x) => String(x.id) === String(s.quote_id)) : null;
    return !q;   /* 앞선 견적 기록이 없다 — 이 건은 제 번호를 받아야 한다 */
  }).filter((s) => !(s.quote_no && QNO.QUOTE_NO_ANY_RE.test(s.quote_no)));

  const line = [
    ...needQuote.map((q) => ({ kind: 'quote', id: q.id, old: q.quote_no || null, at: q.created_at })),
    ...orphanShares.map((s) => ({ kind: 'share', id: s.id, old: s.quote_no || null, at: s.created_at })),
  ].sort((x, y) => new Date(x.at) - new Date(y.at) || String(x.id).localeCompare(String(y.id)));

  const assigned = new Map();
  for (const t of line) {
    const ym = ymOf(t.at);
    t.next = 'BP-' + ym + '-' + fmt(nextIn(ym));
    assigned.set(t.kind + ':' + t.id, t.next);
  }
  const quotePlan = line.filter((t) => t.kind === 'quote');
  console.log('\n── 견적 기록에 붙일 번호 ' + quotePlan.length + '건 ' +
    '(없던 것 ' + quotePlan.filter((x) => !x.old).length +
    ' · 옛 형식 ' + quotePlan.filter((x) => x.old).length + ')');
  quotePlan.slice(0, 40).forEach((x) => console.log('   · ' + x.id + '  ' + (x.old || '(없음)') + ' → ' + x.next));
  if (quotePlan.length > 40) console.log('   … 그리고 ' + (quotePlan.length - 40) + '건 더');

  const newNoOf = new Map(quotePlan.map((x) => [x.id, x.next]));
  const baseOfQuote = (qid) => {
    if (!qid) return null;
    if (newNoOf.has(qid)) return newNoOf.get(qid);
    const q = quotes.find((x) => String(x.id) === String(qid));
    return q && q.quote_no && QNO.QUOTE_NO_RE.test(q.quote_no) ? q.quote_no : null;
  };

  /* ── ③ 발급된 견적서 — 견적의 번호를 물려받고 차수를 붙인다 ──────────── */
  const seenPerQuote = new Map();
  const sharePlan = [];
  for (const s of shares) {
    const base = baseOfQuote(s.quote_id);
    let next;
    if (base) {
      const k = String(s.quote_id);
      const revNo = (seenPerQuote.get(k) || 0) + 1;
      seenPerQuote.set(k, revNo);
      next = QNO.withRevision(base, revNo);
    } else {
      /* 앞선 견적 기록이 없다 — 패키지 발급이거나 옛 링크다. 위에서 시간순으로 이미 배정했다. */
      next = assigned.get('share:' + s.id);
      if (!next) continue;   /* 이미 새 형식이라 건드릴 것이 없다 */
    }
    if (next === s.quote_no) continue;
    sharePlan.push({ id: s.id, old: s.quote_no || null, next });
  }
  console.log('\n── 발급된 견적서에 붙일 번호 ' + sharePlan.length + '건');
  sharePlan.slice(0, 40).forEach((x) => console.log('   · ' + x.id + '  ' + (x.old || '(없음)') + ' → ' + x.next));
  if (sharePlan.length > 40) console.log('   … 그리고 ' + (sharePlan.length - 40) + '건 더');

  /* ── 순번 표를 올릴 값 ─────────────────────────────────────────────── */
  console.log('\n── 순번 표(quote_seq_m)를 이 값으로 맞춥니다');
  [...used.entries()].sort().forEach(([ym, n]) => console.log('   · ' + ym + ' → ' + n));

  if (!APPLY) {
    console.log('\n⚠ 아무것도 쓰지 않았습니다. 위 목록을 확인하신 뒤 `--apply`로 다시 실행하세요.\n');
    return;
  }

  /* ═══ 실제로 쓴다 ═══════════════════════════════════════════════════════
     🔴 **옛 번호를 이력에 남기고 나서 바꾼다.** 그 번호로 나간 문서가 있을 수 있고,
       고객이 옛 번호로 전화하면 그 줄이 유일한 단서다. */
  let n1 = 0, n2 = 0;
  for (const x of quotePlan) {
    await sql`insert into quote_no_log (quote_id, old_no, new_no, by_user, reason)
              values (${x.id}, ${x.old}, ${x.next}, ${BY}, ${'형식 변경 일괄 부여(2026-09-23 대표 결정)'})`;
    await sql`update quotes set quote_no = ${x.next} where id = ${x.id}`;
    n1 += 1;
  }
  for (const x of sharePlan) {
    await sql`insert into quote_no_log (quote_id, old_no, new_no, by_user, reason)
              values (${'share:' + x.id}, ${x.old}, ${x.next}, ${BY}, ${'형식 변경 일괄 부여(2026-09-23 대표 결정)'})`;
    await sql`update quote_shares set quote_no = ${x.next} where id = ${x.id}`;
    n2 += 1;
  }
  for (const [ym, n] of used.entries()) {
    await sql`insert into quote_seq_m (ym, n) values (${ym}, ${n})
              on conflict (ym) do update set n = greatest(quote_seq_m.n, ${n})`;
  }
  console.log('\n✅ 견적 ' + n1 + '건 · 견적서 ' + n2 + '건에 번호를 붙였습니다. 순번 표도 맞췄습니다.');
  console.log('   이력은 quote_no_log에 남았습니다 (옛 번호 → 새 번호).\n');
}

main().catch((e) => { console.error(e); process.exit(1); });

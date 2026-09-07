/* ═══════════════════════════════════════════════════════════════════════════
   개발 중 만들어진 **시험 기록**을 실사용 시작 전에 내린다 (ZD)
   ───────────────────────────────────────────────────────────────────────────
   2026-09-07 대표 확인:
     · 견적서 대장 10건 = 전부 개발 중 시험 발급(7월). 실제 고객 건 0건.
     · 견적 관리 2건(9/2 오투디자인·오투디자인그룹) = **대표가 넣어 본 시험**이다.
       (그 전까지 「실제 고객일 수 있다」로 남겨 두고 아무도 안 건드리던 건이다.)

   🔴 **지우지 않는다. 상태로 내린다.**
     · 견적서는 지우면 「우리가 그 금액을 낸 적 있다」는 근거가 사라진다(WB 방침).
     · 문의도 마찬가지다 — 지운 것이 아무 데도 안 남던 자리를 또 만들지 않는다(YP).
     → 견적서는 `status='void'`(취소), 문의는 `status='closed'`(종료) + 처리 기록 한 줄.

   ⚠ **누가 내렸는지 사람 이름으로 적지 않는다.** 직원이 화면에서 내린 것이 아니라
     대표 승인을 받고 여기서 내린 것이다 — 나중에 대장에서 「박재규가 취소함」으로
     보이면 그 사람에게 물어보게 된다. 있는 그대로 적는다.

   ⚠ **기본은 dry-run이다.** 바꿀 것을 먼저 보여주고, `--apply`가 있어야 실제로 바꾼다.

     node ai-loop/cleanup_test_records.js            무엇이 바뀌는지만 본다
     node ai-loop/cleanup_test_records.js --apply    실제로 내린다
   ═══════════════════════════════════════════════════════════════════════════ */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');

const APPLY = process.argv.includes('--apply');
const ACTOR = '정리 (대표 승인 2026-09-07)';
/* 시험 발급은 전부 7월이다. **날짜로 잘라 범위를 못 박는다** — 「전부」로 돌리면
   나중에 이 파일을 다시 실행했을 때 진짜 견적서까지 내려간다. */
const SHARE_BEFORE = '2026-08-01';
/* 대표가 시험이라고 확인해 준 문의 두 건. **id로 못 박는다.** */
const TEST_QUOTE_IDS = ['mtjt2z13tbk', 'mtjsy55b9is'];

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL이 없습니다(.env.local을 확인해 주세요).');
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log('\n■ 견적서 대장 — 7월 시험 발급을 「취소」로 내린다');
  const shares = await sql`
    select id, quote_no, status, payload->>'org' org, payload->>'dt' dest, payload->>'t' total
      from quote_shares
     where created_at < ${SHARE_BEFORE} and status = 'issued'
     order by quote_no`;
  for (const r of shares) {
    console.log('   ' + [r.quote_no, (r.org || '(기관명 없음)'), r.dest, Number(r.total || 0).toLocaleString() + '원'].join(' · '));
  }
  console.log('  → 대상 ' + shares.length + '건');

  console.log('\n■ 견적 관리 — 대표가 넣어 보신 문의 2건을 「종료」로 내린다');
  const quotes = await sql`
    select id, status, org_name, dest_label, participants, total
      from quotes where id = any(${TEST_QUOTE_IDS}) order by created_at`;
  for (const r of quotes) {
    console.log('   ' + [r.id, r.status, r.org_name, r.dest_label, r.participants + '명',
      Number(r.total || 0).toLocaleString() + '원'].join(' · '));
  }
  console.log('  → 대상 ' + quotes.length + '건');
  /* 🔴 못 찾은 id가 있으면 **말한다.** 조용히 0건 처리하면 「정리했다」로 읽힌다. */
  const missing = TEST_QUOTE_IDS.filter((id) => !quotes.some((r) => r.id === id));
  if (missing.length) console.log('  ⚠ 못 찾은 문의 ' + missing.length + '건: ' + missing.join(', '));

  if (!APPLY) {
    console.log('\n── dry-run입니다. 실제로 내리려면 --apply를 붙여 주세요. ──');
    return;
  }

  const vo = await sql`
    update quote_shares
       set status = 'void', status_by = ${ACTOR}, status_at = now()
     where created_at < ${SHARE_BEFORE} and status = 'issued'
     returning quote_no`;
  console.log('\n✓ 견적서 ' + vo.length + '건을 「취소」로 내렸습니다.');

  const entry = {
    ts: new Date().toISOString(),
    author: ACTOR,
    text: '대표 확인: 시험 입력입니다(2026-09-07). 실제 고객 문의가 아니라 종료 처리했습니다.',
  };
  const cl = await sql`
    update quotes
       set status = 'closed', activity_log = activity_log || ${JSON.stringify([entry])}::jsonb
     where id = any(${TEST_QUOTE_IDS}) and status <> 'closed'
     returning id`;
  console.log('✓ 문의 ' + cl.length + '건을 「종료」로 내리고 처리 기록을 남겼습니다.');

  const after = await sql`select status, count(*)::int n from quote_shares group by status order by 1`;
  console.log('\n대장 상태 분포(뒤): ' + JSON.stringify(after));
  const aq = await sql`select status, count(*)::int n from quotes group by status order by 1`;
  console.log('문의 상태 분포(뒤): ' + JSON.stringify(aq));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

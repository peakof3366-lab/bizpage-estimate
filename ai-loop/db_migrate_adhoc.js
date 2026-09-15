/* ═══════════════════════════════════════════════════════════════════════════
   직접견적을 `quotes`로 모으는 마이그레이션 — **기본은 dry-run**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 결정: 「자동견적 및 직접견적은 **저장 테이블까지 통일**시키는 게
   좋을 것 같아.」 + 마이그레이션 승인.

   ■ 왜 이 도구가 필요한가
   직접견적은 `packages`(kind='adhoc')에, 자동견적은 `quotes`에 있었다. 개편 이후
   **새로 만드는 건은 둘 다 `quotes`로** 간다(직접견적도 `basis:'adhoc'`로 저장).
   그런데 **이미 있던 건**은 여전히 `packages`에만 있다 — 그대로 두면 견적 요청 관리에
   어떤 건은 나오고 어떤 건은 안 나오는 상태가 굳는다.

   ■ 🔴 `packages` 테이블을 지우지 않는다
   ① **패키지 상품**(kind='catalog')이 그 테이블을 쓴다. 대표가 「나중에 다시 작업하겠다」고
      미뤄 둔 건이라(2026-09-14) 살아 있어야 한다.
   ② 직접견적 카드의 **요약**(제목·금액·기간·상태)은 목록에서 훑는 데 쓰인다. 그 자리를
      없애면 담당자가 30건을 열어 봐야 한다.
   ③ 8/24 백업 복원 경로가 이 테이블을 전제한다.
   → **옮기는 것은 「견적 기록」이지 「상품 카드」가 아니다.** 원본은 그대로 둔다.

   ■ 🔴 쓰기 전에 반드시 스냅샷을 남긴다
   `--apply`는 옮기기 **전에** 대상 행 전체를 `ai-loop/_migrate_snapshot_<날짜>.json`으로
   떨군다. 되돌릴 방법 없이 운영 DB를 건드리지 않는다.

   ■ 무엇을 안 옮기나 (그리고 왜)
   · **작성중(draft)** — 아무 데도 안 나간 건이다. 견적 기록으로 만들면 「낸 적 있다」는
     기록이 없는 채로 대장에 나타난다. `--include-draft`로만 옮긴다.
   · **이미 옮긴 건** — `quotes.payload.pkgId`로 확인한다(두 번 돌려도 안전하다).

       node ai-loop/db_migrate_adhoc.js              # 무엇이 옮겨질지 보여만 준다
       node ai-loop/db_migrate_adhoc.js --apply      # 실제로 옮긴다 (스냅샷 먼저)
       node ai-loop/db_migrate_adhoc.js --include-draft --apply
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');

const ROOT = path.join(__dirname, '..');
const QD = require(path.join(ROOT, 'quote_doc.js'));

const APPLY = process.argv.includes('--apply');
const WITH_DRAFT = process.argv.includes('--include-draft');
const sql = neon(process.env.DATABASE_URL);

const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');
const ymd = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
};

/* ── `packages` 한 줄 → 견적서 문서(`doc`) ──
   🔴 **없는 값을 지어내지 않는다.** 담당자 이름·연락처·항공 편명·상세 내용은 옛 직접견적에
     애초에 칸이 없었다. 비워 두면 견적서에 「미입력」이 빨갛게 찍히고, 담당자가 그것을 보고
     채운다 — 그럴듯한 기본값을 넣으면 **확인 안 된 값이 그대로 고객에게 나간다.** */
function toDoc(p) {
  const lines = Array.isArray(p.line_items) ? p.line_items : [];
  const total = lines.length
    ? lines.reduce((s, it) => s + (Number(it.amount) || 0), 0)
    : 0;
  const unit = Number(p.price_per_person) || 0;
  /* 1인가만 있는 건은 인원을 모른다 — **인원을 지어내지 않는다.** 0명으로 두면 화면이
     「인원을 채우라」고 말한다. */
  const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => String(x).trim()).filter(Boolean);
  const excl = listOf(p.excl_items);
  const incl = listOf(p.incl_items);

  const details = [];
  if (incl.length) details.push({ label: '포함 사항', note: '', rows: [{ text: incl.join(', ') }], footnotes: [] });
  if (excl.length) details.push({ label: '불포함내역', note: '', rows: [{ text: excl.join(', '), accent: 'red' }], footnotes: [] });

  const iti = Array.isArray(p.itinerary) ? p.itinerary : [];
  return QD.normalize({
    meta: {
      client: p.customer_label || '', regionLabel: p.dest_label || p.dest_key || '',
      issueDate: ymd(p.created_at), validUntil: p.valid_until ? ymd(p.valid_until) : '',
      /* 🔴 공란 — 옛 직접견적에 담당자 칸이 없었다. 지어내지 않는다. */
      staffName: '', staffTel: '', staffEmail: '',
    },
    trip: {
      orgName: p.title || '', startDate: p.depart_date ? ymd(p.depart_date) : '', endDate: '',
      days: Number(p.days) || 0, nights: (p.nights === null || p.nights === undefined) ? undefined : Number(p.nights),
      region: p.dest_label || p.dest_key || '', stayLabel: '', pax: 0,
    },
    price: { lines: unit ? [{ kind: 'adult', label: '성인', unit, qty: 0 }] : [], condition: '', fuelNote: '' },
    options: [],
    details,
    itinerary: iti.map((d, i) => ({
      day: i + 1, date: '', title: d.title || '', am: d.am || '', pm: d.pm || '', eve: d.eve || '',
      meals: {}, stay: d.stay || '', note: d.note || '',
    })),
    remarks: '', cancelPolicy: '',
    _internal: {
      source: 'adhoc-migrated', cost: 0, margin: 0,
      memo: '2026-09-15 마이그레이션 — packages.' + p.id + '에서 옮김. 담당자·인원·상세는 미입력입니다.',
      engineRows: [], overrides: [],
      adjust: [], lineItems: lines, lineTotal: total,
    },
  });
}

(async () => {
  const rows = await sql`
    select id, kind, price_basis, title, dest_key, dest_label, nights, days, depart_date,
           price_per_person, status, valid_until, customer_label, line_items, itinerary,
           incl_items, excl_items, source_code, created_at
      from packages where kind = 'adhoc' order by created_at`;

  const already = await sql`select payload->>'pkgId' pid from quotes where payload ? 'pkgId'`;
  const done = new Set(already.map((r) => r.pid).filter(Boolean));

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 직접견적 → quotes 마이그레이션' + (APPLY ? '  🔴 실제 적용' : '  (보여만 줍니다)'));
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(' packages에서 kind=adhoc 인 행: ' + rows.length + '건\n');

  const move = []; const skip = [];
  rows.forEach((p) => {
    if (done.has(p.id)) { skip.push([p, '이미 옮김']); return; }
    if (p.status === 'draft' && !WITH_DRAFT) { skip.push([p, '작성중 — 아무 데도 안 나간 건 (--include-draft로 옮김)']); return; }
    move.push(p);
  });

  const line = (p, why) => '  · ' + String(p.id).padEnd(22) + ' ' + String(p.status).padEnd(7)
    + ' ' + String(p.title || '(제목 없음)').slice(0, 24).padEnd(26)
    + ' ' + won(p.price_per_person).padStart(11) + '원'
    + ' · 항목 ' + (Array.isArray(p.line_items) ? p.line_items.length : 0)
    + ' · 일정 ' + (Array.isArray(p.itinerary) ? p.itinerary.length : 0)
    + (why ? '   → ' + why : '');

  if (skip.length) {
    console.log(' 건너뛰는 것 ' + skip.length + '건');
    skip.forEach(([p, why]) => console.log(line(p, why)));
    console.log('');
  }
  if (!move.length) {
    console.log(' ✓ 옮길 것이 없습니다.');
    console.log('\n──────────────────────────────────────────────────────────────────');
    console.log(' ⚠ **새로 만드는 직접견적은 이미 `quotes`로 갑니다**(개편 5/6). 이 도구는');
    console.log('   개편 전에 쌓인 건을 위한 것입니다.');
    console.log(`결과: 옮김 0 / 건너뜀 ${skip.length} / 전체 ${rows.length}`);
    process.exit(0);
  }

  console.log(' 옮길 것 ' + move.length + '건');
  move.forEach((p) => console.log(line(p, '')));

  if (!APPLY) {
    console.log('\n 🔴 아직 아무것도 안 바꿨습니다. 실제로 옮기려면 `--apply`를 붙이세요.');
    console.log('    (옮기기 전에 스냅샷을 먼저 떨굽니다. `packages` 원본은 지우지 않습니다.)');
    console.log(`결과: 옮길 것 ${move.length} / 건너뜀 ${skip.length} / 전체 ${rows.length}`);
    process.exit(0);
  }

  /* 🔴 스냅샷 먼저 — 되돌릴 방법 없이 운영 DB를 건드리지 않는다 */
  const snapPath = path.join(__dirname, '_migrate_snapshot_' + ymd(new Date()) + '.json');
  fs.writeFileSync(snapPath, JSON.stringify({ at: new Date().toISOString(), rows: move }, null, 2), 'utf8');
  console.log('\n 스냅샷: ' + snapPath);

  let okCount = 0; const errs = [];
  for (const p of move) {
    const doc = toDoc(p);
    const id = 'mg' + String(p.id).replace(/[^a-z0-9]/gi, '').slice(-12) + Date.now().toString(36).slice(-4);
    const payload = {
      id, basis: 'adhoc', pkgId: p.id,
      destination: p.dest_key || '', destKey: p.dest_key || '',
      destLabel: p.dest_label || p.dest_key || '',
      orgName: p.title || '', contactName: '', contactTel: '',
      participants: 0, days: Number(p.days) || 0, nights: Number(p.nights) || 0,
      startDate: p.depart_date ? ymd(p.depart_date) : '', endDate: '',
      total: Number(p.price_per_person) || 0, perPerson: Number(p.price_per_person) || 0,
      ts: new Date(p.created_at).getTime(), status: 'new', note: '',
      channel: 'internal', createdBy: '(마이그레이션)',
      doc,
      _verify: { verdict: 'not_applicable', failedSteps: [], steps: [],
        at: new Date().toISOString(), note: '직접 견적 — 엔진 값과 대조하지 않습니다.' },
    };
    try {
      await sql`
        insert into quotes (id, status, note, dest_label, org_name, participants, total, payload)
        values (${id}, 'new', '', ${payload.destLabel}, ${payload.orgName}, 0, ${payload.total},
                ${JSON.stringify(payload)}::jsonb)
        on conflict (id) do nothing`;
      okCount++;
      console.log('  ✓ ' + p.id + ' → quotes.' + id);
    } catch (e) {
      errs.push(p.id + ': ' + e.message);
      console.log('  ✗ ' + p.id + ' — ' + e.message);
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────────');
  console.log(' ⚠ **`packages` 원본은 지우지 않았습니다.** 직접견적 카드의 요약은 거기 있어야');
  console.log('   담당자가 목록에서 훑을 수 있습니다. 옮긴 것은 「견적 기록」입니다.');
  console.log(' ⚠ 옮긴 건은 담당자·인원·상세가 **비어 있습니다** — 지어내지 않았습니다.');
  console.log('   견적서를 내기 전에 「견적서 상세 작성」에서 채워야 합니다.');
  console.log(`결과: 옮김 ${okCount} / 실패 ${errs.length} / 건너뜀 ${skip.length}`);
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('DB 오류:', e.message); process.exit(1); });

/* ═══════════════════════════════════════════════════════════════════════════
   담당자 수정 기록 감사 (zS) — **담당자가 엔진 금액을 고칠 때마다 공짜 정답이 하나 쌓인다**
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 견적 작성 화면(`admin-quote-pro.html`)은 저장할 때마다
   `doc._internal`에 엔진이 낸 값과 담당자가 최종으로 쓴 값을 **둘 다** 남긴다:

     overrides: [{ label, autoAmount, amount }]   ← 담당자가 덮어쓴 항목
     adjust:    [{ label, amount, kind }]          ← 실무 변수(FOC·싱글차지…)

   그런데 이것을 **모아서 읽는 곳이 없었다**(결함 생성기 ③ — 쌓이기만 하는 안전망).
   「오키나와 식비를 담당자들이 매번 20% 내린다」는 요율표가 틀렸다는 가장 싼 증거인데,
   지금까지는 PDF 견적서를 한 건씩 뜯어 맞추는 방법(역검증)뿐이었다.

   이 도구는 **고치지 않고 센다.** 요율을 바꾸는 것은 도메인 값 판단이라 대표 승인이다.
   「점검 후보」는 아래 문턱을 **모두** 넘은 것만 부른다 — 표본 한두 건으로 요율을
   움직이면 잡음에 맞추게 된다(역검증에서 하루에 세 번 뒤집힌 교훈).

     · 서로 다른 견적 3건 이상 (`MIN_QUOTES`)
     · 전부 같은 방향 (올림만 / 내림만)
     · 중앙값이 ±5% 이상 (`MIN_SHIFT`)

   ⚠ **대표 계정의 수정은 따로 센다.** 대표가 화면을 시험하며 만진 값이 직원의
     실무 판단과 섞이면, 시험이 요율 근거로 둔갑한다. 역할은 백업의 `staff_accounts`로
     가른다(이름이 아니라 role — 기관명만 보고 실제 고객이라 읽었던 사고가 있다).
   ⚠ **`_internal`이 없거나 깨진 견적은 조용히 건너뛰지 않는다** — 몇 건인지 말한다
     (결함 생성기 ②). 「수정 0건」이 「읽을 수 없었다」를 가리면 안 된다.
   ⚠ `void`(취소) 견적은 뺀다. 뺀 수도 말한다.

   실행 (읽기 전용 — 운영 DB에 접속하지 않는다. 마지막 백업 JSON을 읽는다):
     node ai-loop/audit_staff_overrides.js
     node ai-loop/audit_staff_overrides.js --file <백업.json>
     node ai-loop/audit_staff_overrides.js --json out.json
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const MIN_QUOTES = 3;
const MIN_SHIFT = 0.05;

/* 「호텔 (4성급)」「차량 (소형 · 자동적용)」「💼 본사 수익」 → 「호텔」「차량」「본사 수익」.
   같은 항목이 등급·차종 꼬리표로 갈라져 세어지지 않게 한다. */
function itemKey(label) {
  return String(label || '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^\p{L}\p{N}\s·]/gu, '')
    .replace(/\s+/g, ' ')
    .trim() || '(이름 없음)';
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function analyze(data) {
  const quotes = Array.isArray(data.quotes) ? data.quotes : [];
  const owners = new Set((data.staff_accounts || [])
    .filter((s) => s.role === 'owner')
    .flatMap((s) => [s.display_name, s.username].filter(Boolean)));

  const out = {
    total: quotes.length, voided: 0, unreadable: [], noDoc: 0,
    byWho: { owner: 0, staff: 0, public: 0 },
    edits: [],          /* 한 줄 = 한 견적의 한 항목 수정 */
    adjusts: [],
    actuals: [],        /* 확정가가 적힌 견적 — 엔진 대비 실제 */
  };

  for (const q of quotes) {
    if (q.status === 'void') { out.voided++; continue; }
    const p = q.payload || {};
    const who = String(p.createdBy || '');
    const role = !who ? 'public' : owners.has(who) ? 'owner' : 'staff';
    out.byWho[role]++;
    const dest = p.destKey || q.dest_label || '(목적지 없음)';
    const tag = { quoteNo: q.quote_no || q.id, dest, who: who || '(고객 직접)', role };

    const actual = Number(q.actual_total);
    if (actual > 0 && Number(q.total) > 0) {
      out.actuals.push({ ...tag, quoted: Number(q.total), actual, ratio: actual / Number(q.total) - 1 });
    }

    if (!p.doc) { out.noDoc++; continue; }
    const inn = p.doc._internal;
    if (!inn || typeof inn !== 'object' || (inn.overrides !== undefined && !Array.isArray(inn.overrides))) {
      out.unreadable.push(tag.quoteNo);
      continue;
    }
    for (const o of inn.overrides || []) {
      const auto = Number(o.autoAmount), val = Number(o.amount);
      if (!(auto > 0) || !Number.isFinite(val)) { out.unreadable.push(tag.quoteNo + ' · ' + o.label); continue; }
      out.edits.push({ ...tag, item: itemKey(o.label), auto, val, ratio: val / auto - 1 });
    }
    for (const a of Array.isArray(inn.adjust) ? inn.adjust : []) {
      out.adjusts.push({ ...tag, item: itemKey(a.label), amount: Number(a.amount) || 0, kind: a.kind });
    }
  }

  /* 점검 후보는 **직원 수정만**으로 판정한다. 대표 수정은 보여 주되 근거로 세지 않는다. */
  const groups = new Map();
  for (const e of out.edits) {
    const k = e.dest + ' · ' + e.item;
    if (!groups.has(k)) groups.set(k, { dest: e.dest, item: e.item, staff: [], owner: [] });
    groups.get(k)[e.role === 'owner' ? 'owner' : 'staff'].push(e);
  }
  out.groups = [...groups.values()].map((g) => {
    const quotesN = new Set(g.staff.map((e) => e.quoteNo)).size;
    const rs = g.staff.map((e) => e.ratio);
    const med = rs.length ? median(rs) : null;
    const sameDir = rs.length > 0 && (rs.every((r) => r > 0) || rs.every((r) => r < 0));
    const why = [];
    if (quotesN < MIN_QUOTES) why.push(`직원 견적 ${quotesN}건 (${MIN_QUOTES}건 필요)`);
    if (rs.length && !sameDir) why.push('방향이 갈린다');
    if (med !== null && Math.abs(med) < MIN_SHIFT) why.push(`중앙값 ${pct(med)} (±${MIN_SHIFT * 100}% 미만)`);
    return { ...g, quotesN, median: med, candidate: why.length === 0, why };
  }).sort((a, b) => (b.candidate - a.candidate) || (b.staff.length + b.owner.length) - (a.staff.length + a.owner.length));

  return out;
}

function pct(r) { return (r >= 0 ? '+' : '') + (r * 100).toFixed(1) + '%'; }
function won(n) { return Math.round(n).toLocaleString('ko-KR'); }

function latestBackup() {
  const tool = require('./db_backup.js');
  const { dir } = tool.resolveBackupDir([]);
  const files = tool.listBackups(dir).filter((f) => !/_PARTIAL\.json$/.test(f));
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function report(r, file) {
  const L = [];
  L.push('\n══ 담당자 수정 기록 — 엔진 금액을 어디서 얼마나 고치나 ══');
  L.push(`읽은 곳: ${file}`);
  L.push(`견적 ${r.total}건 · 취소 제외 ${r.voided} · 문서 없음 ${r.noDoc} · 🔴 읽을 수 없음 ${r.unreadable.length}`
    + (r.unreadable.length ? ` (${r.unreadable.join(', ')})` : ''));
  L.push(`만든 사람: 직원 ${r.byWho.staff} · 대표 ${r.byWho.owner} · 고객 직접 ${r.byWho.public}`);
  if (r.byWho.staff === 0) {
    L.push('⚠ 직원이 만든 견적이 0건이다 — 아래 점검 후보는 나올 수 없다. 실사용이 먼저다.');
  }

  L.push(`\n── 항목 수정 ${r.edits.length}건 (목적지 · 항목별) ──`);
  if (!r.edits.length) L.push('  (없음)');
  for (const g of r.groups) {
    const mark = g.candidate ? '🟠 점검 후보' : '  ';
    L.push(`${mark} ${g.dest} · ${g.item} — 직원 ${g.staff.length}건`
      + (g.median !== null ? ` 중앙값 ${pct(g.median)}` : '')
      + (g.owner.length ? ` · 대표 ${g.owner.length}건(근거로 안 셈)` : '')
      + (g.candidate ? '' : g.why.length ? `  [${g.why.join(' · ')}]` : ''));
    for (const e of [...g.staff, ...g.owner]) {
      L.push(`     ${e.quoteNo}  ${won(e.auto)} → ${won(e.val)}  ${pct(e.ratio)}  (${e.who})`);
    }
  }

  L.push(`\n── 실무 변수 ${r.adjusts.length}건 ──`);
  if (!r.adjusts.length) L.push('  (없음)');
  for (const a of r.adjusts) L.push(`   ${a.quoteNo} ${a.dest} · ${a.item} ${won(a.amount)} (${a.kind === 'cost' ? '원가' : '마진'} · ${a.who})`);

  L.push(`\n── 확정가가 적힌 견적 ${r.actuals.length}건 (엔진 견적 대비 실제) ──`);
  if (!r.actuals.length) L.push('  (없음) — 계약된 건의 실제 금액이 들어와야 정확도를 잰다');
  for (const a of r.actuals) L.push(`   ${a.quoteNo} ${a.dest}  ${won(a.quoted)} → ${won(a.actual)}  ${pct(a.ratio)}`);

  const n = r.groups.filter((g) => g.candidate).length;
  L.push(`\n점검 후보 ${n}건 — 요율을 바꾸는 것은 대표 승인(도메인 값). 이 도구는 세기만 한다.`);
  return L.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const file = arg('--file') || latestBackup();
  if (!file || !fs.existsSync(file)) {
    console.error('✗ 백업 파일을 못 찾았다. --file로 지정하거나 `node ai-loop/db_backup.js`로 먼저 받을 것.');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = analyze(raw.data || raw);
  console.log(report(r, file));
  const j = arg('--json');
  if (j) fs.writeFileSync(j, JSON.stringify(r, null, 1), 'utf8');
}

module.exports = { analyze, itemKey, MIN_QUOTES, MIN_SHIFT };

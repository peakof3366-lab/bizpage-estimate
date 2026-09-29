/* ═══════════════════════════════════════════════════════════════════════════
   담당자 화면 검사용 **가상 데이터** — 운영 DB 백업에서 모양만 빌려 온다
   `node ai-loop/make_admin_fixture.js [백업파일]`  →  `ai-loop/.admin_fixture.json`
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 만드나 (2026-09-29, 가독성 2단계)
   `check_admin_screens.py`는 `/api/*`를 **전부 막고** 탭을 잰다. 그래서 견적 관리·
   대장 탭은 **빈 목록**으로 재졌다 — 「🔴 0」은 「빈 화면이 안 깨졌다」였을 뿐이다.
   대표가 지난주 수십 건을 고친 자리(대장 월별·견적 상세 모달·금액 표)가 한 번도
   재진 적이 없었다. 줄이 실제로 있어야 긴 기관명·큰 금액·여러 차수가 어떻게
   접히는지 보인다.

   ■ 🔴 고객 정보는 **바꿔서** 싣는다 — 그리고 이 파일의 결과는 저장소에 안 넣는다
   백업에는 고객 이름·연락처·기관명·담당자 이메일이 들어 있다. 검사 도구는 걸린 자리의
   **글자를 터미널에 찍는다** — 원본을 실으면 거기로 샌다.
   · 아는 자리(`PII_KEYS`)는 **길이를 맞춘 가짜 값**으로 바꾼다. 길이를 맞추는 이유 —
     화면 검사이므로 「기관명이 길면 어떻게 접히나」가 그대로 재져야 한다.
   · 자유 서술(요청 사항·메모·활동 기록)은 **통째로** 같은 길이의 예시 문장으로 바꾼다.
   · 그래도 새는 것을 막는 마지막 그물: 바꾼 원본 값이 **다른 칸 안에** 남아 있으면
     (문서 제목에 기관명이 들어가는 식) 그 부분만 바꾸고, 전화번호·이메일 모양은 어디든 지운다.
   · 결과 파일은 `.gitignore`에 있다(`.bd_db.json`과 같은 이유).
   ⚠ 금액·목적지·인원·날짜는 **그대로 둔다** — 그게 화면 폭을 정하는 값이다.

   ■ 응답 모양은 **서버 코드를 따른다**
   `api/quotes.js`(목록) · `api/quotes/[id].js`(한 건) · `api/quote-shares.js`(list·links)의
   SELECT와 같은 칸만 싣는다. 대장 금액은 서버의 `applyDocTotals`, 차수는 `QNO.buildRevisionMap`을
   **그대로 불러** 계산한다 — 여기서 다시 쓰면 두 벌이 된다(결함 생성기 ①).
   ⚠ 응답 모양이 서버에서 바뀌면 이 파일도 같이 바꾼다. 화면이 「⚠ 불러오지 못했습니다」를
     띄우면 검사가 그 화면을 재게 되므로, `check_admin_screens.py`가 **줄이 그려졌는지**를 확인한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '.admin_fixture.json');
const BACKUP_DIR = path.join(ROOT, '..', '비즈페이지_백업');

/* 서버 모듈이 불러올 때 DB 주소를 요구한다 — 연결은 안 한다(쿼리를 안 부른다) */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://fixture:fixture@localhost/fixture';
const { applyDocTotals } = require(path.join(ROOT, 'api', 'quote-shares.js'));
const QNO = require(path.join(ROOT, 'api', '_lib', 'quote_no.js'));

function latestBackup() {
  const arg = process.argv.find((a) => /bizpage_backup_.*\.json$/.test(a));
  if (arg) return arg;
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^bizpage_backup_.*\.json$/.test(f)).sort();
  return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
}

/* ── 바꿀 자리 ── */
const PII_KEYS = new Set([
  'customer_label', 'customer_tel', 'issued_by', 'status_by', 'vendor_no_by', 'assignee', 'created_by',
  'org', 'cn', 'orgName', 'org_name', 'contact', 'contactTel', 'customerTel', 'createdBy', 'issuedBy',
  'client', 'clientContact', 'staffName', 'staffTel', 'staffEmail', 'title', 'author', 'by_user',
]);
const FREE_TEXT_KEYS = new Set(['request', 'req', 'note', 'memo', 'text', 'remarks_private']);
const ORG_POOL = '한빛산업진흥원미래교육재단새솔정밀공업바른도시개발공사푸른숲협동조합';
const SENT = '가상 요청 사항입니다. 일정과 인원은 협의 후 확정합니다. ';

const seen = new Map();             /* 원본 → 가짜 (같은 원본은 같은 가짜로 — 검색·묶음이 그대로 동작) */
function fakeFor(key, s) {
  if (seen.has(s)) return seen.get(s);
  let f;
  if (/tel|contact$/i.test(key) && /\d/.test(s)) f = s.replace(/\d/g, (d, i) => (i < 4 ? d : '0'));
  else if (/email/i.test(key)) f = 'staff' + (seen.size % 9) + '@example.com';
  else {
    const n = [...s].length;
    const start = (seen.size * 3) % ORG_POOL.length;
    f = '가상' + (ORG_POOL + ORG_POOL).slice(start, start + Math.max(0, n - 2));
  }
  seen.set(s, f);
  return f;
}
const sentence = (n) => (SENT.repeat(Math.ceil(n / SENT.length) + 1)).slice(0, n);

function scrub(v, key) {
  if (Array.isArray(v)) return v.map((x) => scrub(x, key));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = scrub(v[k], k);
    return o;
  }
  if (typeof v !== 'string' || !v.trim()) return v;
  if (PII_KEYS.has(key)) return fakeFor(key, v);
  if (FREE_TEXT_KEYS.has(key)) return sentence([...v].length);
  return v;
}

/* 마지막 그물 — 바꾼 원본이 다른 칸 안에 남았으면 그 부분만, 전화·이메일 모양은 어디서든 */
function sweep(v) {
  if (Array.isArray(v)) return v.map(sweep);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = sweep(v[k]); return o; }
  if (typeof v !== 'string') return v;
  let s = v;
  for (const [orig, fake] of seen) if (orig.length >= 2 && s.includes(orig)) s = s.split(orig).join(fake);
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, 'staff@example.com');
  s = s.replace(/\b01[016789]-?\d{3,4}-?\d{4}\b/g, '010-0000-0000');
  return s;
}

function build(backupPath) {
  const d = JSON.parse(fs.readFileSync(backupPath, 'utf8')).data;
  const quotes = d.quotes || [];
  const shares = d.quote_shares || [];

  /* /api/quotes — 목록 (api/quotes.js GET과 같은 칸) */
  const quoteRow = (r) => ({
    ...r.payload, id: r.id, status: r.status, note: r.note,
    quoteNo: r.quote_no || null, sourceQuoteNo: r.source_quote_no || null,
    assignee: r.assignee || '', activityLog: r.activity_log || [],
    actualAirfareUnit: r.actual_airfare_unit == null ? null : Number(r.actual_airfare_unit),
    actualHotelUnit: r.actual_hotel_unit == null ? null : Number(r.actual_hotel_unit),
    actualMealUnit: r.actual_meal_unit == null ? null : Number(r.actual_meal_unit),
    actualTotal: r.actual_total == null ? null : Number(r.actual_total),
    itinerary: r.itinerary || null,
  });

  /* /api/quote-shares?action=list — 대장 (SELECT 칸 그대로, payload->>'x'는 글자다) */
  const txt = (x) => (x === undefined || x === null ? null : String(x));
  const rows = shares
    .slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => {
      const p = r.payload || {};
      return {
        id: r.id, quote_no: r.quote_no, quote_id: r.quote_id, created_at: r.created_at,
        issued_by: r.issued_by, customer_label: r.customer_label, customer_tel: r.customer_tel,
        status: r.status, status_by: r.status_by, status_at: r.status_at,
        vendor_quote_no: r.vendor_quote_no, vendor_no_by: r.vendor_no_by, vendor_no_at: r.vendor_no_at,
        dest: txt(p.dt), org: txt(p.org), cn: txt(p.cn), iso: txt(p.iso), pax: txt(p.n),
        total: txt(p.t), per: txt(p.pp),
        docprice: p.doc && p.doc.price ? p.doc.price : null,
        verdict: p._verify ? txt(p._verify.verdict) : null,
      };
    });
  const revs = QNO.buildRevisionMap(shares.map((r) => ({
    id: r.id, quote_no: r.quote_no, quote_id: r.quote_id, revision_of: r.revision_of, created_at: r.created_at,
  })));
  for (const r of rows) Object.assign(r, revs[r.id] || {});
  applyDocTotals(rows);

  const links = {};
  for (const r of shares.filter((x) => x.quote_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    (links[r.quote_id] = links[r.quote_id] || []).push({ no: r.quote_no, id: r.id, status: r.status || 'issued', at: r.created_at });
  }

  const raw = {
    quotes: quotes.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(quoteRow),
    shares: { shares: rows, capped: false, max: 300, revisions: true },
    links: { links },
  };
  const out = sweep(scrub(raw, ''));
  out._meta = {
    from: path.basename(backupPath), builtAt: new Date().toISOString(),
    counts: { quotes: out.quotes.length, shares: rows.length },
    note: '가상 데이터 — 고객 정보는 바꿨다. 저장소에 넣지 말 것(.gitignore).',
  };
  return out;
}

/* 🔴 바꾸고 나서 **원본 값이 결과에 한 글자라도 남았는지** 센다 — 그물이 뚫리면 여기서 멈춘다 */
/* ⚠ **값만** 본다. 처음엔 JSON 문자열 통째로 찾았는데, 담당자 아이디 `admin`이 칸 이름
   `adminLabel`에 걸려 「원본이 남았다」고 멈췄다 — 칸 이름은 데이터가 아니다. */
function leakCheck(out) {
  const vals = [];
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    else if (typeof v === 'string') vals.push(v);
  })(out);
  return [...seen.keys()].filter((orig) => orig.length >= 3 && vals.some((s) => s.includes(orig)));
}

if (require.main === module) {
  const bp = latestBackup();
  if (!bp) {
    console.error('백업 파일이 없습니다 — Desktop\\비즈페이지_백업\\ 를 확인하거나 경로를 인자로 주세요.');
    process.exit(1);
  }
  const out = build(bp);
  const left = leakCheck(out);
  if (left.length) {
    console.error(`🔴 원본 값 ${left.length}개가 결과에 남았습니다 — 파일을 쓰지 않았습니다.`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`✓ ${path.relative(ROOT, OUT)} — 견적 ${out._meta.counts.quotes}건 · 대장 ${out._meta.counts.shares}건`
    + ` (원본: ${out._meta.from} · 바꾼 값 ${seen.size}개 · 남은 원본 0)`);
}

module.exports = { build, OUT };

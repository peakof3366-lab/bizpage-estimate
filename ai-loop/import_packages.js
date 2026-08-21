/* ═══════════════════════════════════════════════════════════════════════════
   **하나투어 자료 PDF → 패키지 상품**으로 일괄 투입한다 (VQ)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-21 대표: 「하나투어가 팔고 있는 패키지의 일정과 가격을 가져와 우리 DB에
   넣고, 우리 견적서로 만들어 준다. 가격도 그대로 — 우리가 대리점이라 그 가격 그대로
   받아 견적서화만 하면 된다.」

   손으로 옮길 필요가 없다는 것이 실측으로 확인됐다 — 하나투어 견적서 PDF를 넣으니
   **기존 추출기가 DAY별 일정을 그대로 읽어냈다**(오키나와 4일: 일자·오전/오후/저녁·
   식사 조/중/석·숙박 호텔명까지). 이 스크립트가 그 출력을 `packages` 행으로 옮긴다.

   ── ⚠ 이 도구가 **하지 않는 것** ────────────────────────────────────────────
   **판매중으로 열지 않는다.** 만들어지는 행은 전부 `status='draft'`다.
   고객에게 나가려면 사람이 관리자 화면에서 열어야 한다. 왜냐하면:

     · **`price_asof`(금액 확인일)를 우리가 확정할 수 없다.** 문서의 작성일을 후보로
       넣지만 그게 「우리가 확인한 날」이라는 보장이 없다 — 실측으로, 작성일이 실은
       「PDF로 뽑은 날」인 문서가 여럿 있었다(2026-08-11에 확인).
     · 우리는 **대리점이라 화면에 적힌 값으로 팔아야 한다.** 낡은 값이 견적서로 나가면
       차액을 우리가 문다. 그 위험을 자동화가 떠안으면 안 된다.

   → 그래서 `note`에 **어디서 온 날짜인지**를 적어 두고, 사람이 그것을 보고 연다.
     자동화는 **타자를 줄이는 것**이지 **판단을 대신하는 것**이 아니다.

   ⚠ 기본이 dry-run이다. 실제로 쓰려면 `--apply` (import_corpus_reports와 같은 규칙).
   ⚠ 같은 id가 이미 있으면 **건드리지 않는다.** 담당자가 손본 값을 덮어쓰면
     그 수정이 조용히 사라진다 — 되살릴 근거도 없다.

   실행:
     node ai-loop/import_packages.js                        (dry-run · 기본 코퍼스)
     node ai-loop/import_packages.js "D:\하나투어자료"       (다른 폴더)
     node ai-loop/import_packages.js --apply
     node ai-loop/import_packages.js --only "오키나와"       (이름에 그 말이 든 것만)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { corpusFiles } = require('./_corpus_files.js');
const { destFromName } = require('./_dest_from_name');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY = (argv.find((a) => a.startsWith('--only')) ? argv[argv.indexOf(argv.find((a) => a.startsWith('--only'))) + 1] : null);
const DIR = argv.find((a) => !a.startsWith('--') && a !== ONLY)
  || process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');

const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};

/* 파일 이름에서 사람이 읽을 상품명을 만든다.
   ⚠ **이름을 지어내지 않는다.** 확장자와 날짜 꼬리만 떼고 그대로 쓴다 —
     그럴듯한 제목을 만들면 원본에 없는 말이 고객 화면에 나간다. */
function titleFrom(file, dest, dates) {
  let t = file.replace(/\.pdf$/i, '').replace(/_\d{6,8}$/, '').trim();
  const dur = (dates && dates.nights && dates.days) ? `${dates.nights}박 ${dates.days}일` : '';
  /* 기간이 제목에 없으면 붙여 준다 — 목록에서 그게 없으면 고르기 어렵다 */
  if (dur && t.indexOf('박') < 0) t += ` (${dur})`;
  return t.slice(0, 200);
}

/* 파일 이름 → 안정적인 id. 같은 파일을 두 번 넣어도 같은 id가 나와야
   「이미 있으면 건드리지 않는다」가 동작한다. */
function idFrom(file) {
  const base = file.replace(/\.pdf$/i, '');
  let h = 0;
  for (let i = 0; i < base.length; i++) { h = ((h << 5) - h + base.charCodeAt(i)) | 0; }
  const slug = base.replace(/[^A-Za-z0-9]+/g, '').slice(0, 20) || 'pkg';
  return ('hana-' + slug + '-' + Math.abs(h).toString(36)).slice(0, 60);
}

/* 추출기의 DAY 묶음 → 화면이 그리는 모양.
   ⚠ 추출기는 오전/오후/저녁을 나눠 주지 않는 문서가 많다(`lines`에 뭉쳐 온다).
     **없는 구분을 지어내지 않는다** — 뭉친 채로 `am`에 담고, 사람이 화면에서 나눈다.
     지어내면 「오후 일정」이 실제와 다른 채로 고객에게 나간다. */
function itineraryFrom(it) {
  const days = (it && Array.isArray(it.days)) ? it.days : [];
  if (!days.length) return null;
  return days.map((d, i) => {
    const lines = Array.isArray(d.lines) ? d.lines.filter(Boolean) : [];
    const m = d.meals || {};
    const meal = ['조:' + (m.b || '-'), '중:' + (m.l || '-'), '석:' + (m.d || '-')].join(' / ');
    return {
      day: i + 1,
      title: String(d.place || d.date || '').slice(0, 120),
      am: lines.join(' / ').slice(0, 400),
      pm: '',
      eve: '',
      tip: (d.hotel ? String(d.hotel).slice(0, 200) + ' · ' : '') + meal,
    };
  });
}

async function main() {
  if (!fs.existsSync(DIR)) { console.log('폴더가 없습니다: ' + DIR); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));

  let files = corpusFiles(DIR).files;
  if (ONLY) files = files.filter((f) => f.indexOf(ONLY) >= 0);
  console.log('폴더: ' + DIR);
  console.log('대상 ' + files.length + '건' + (ONLY ? ' (--only "' + ONLY + '")' : '') + ' — 읽는 중…\n');

  const rows = [];
  const skipped = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(DIR, f))), pdfParse, {}); }
    catch (e) { skipped.push({ f, why: '읽지 못함: ' + String(e.message).slice(0, 50) }); continue; }

    /* ⚠ **없는 것을 지어내지 않는다.** 셋 중 하나라도 없으면 안 만들고 이유를 밝힌다 —
       빈칸으로 만들어 두면 사람이 그걸 채우려고 다시 원본을 열어야 하고,
       그럴 바에는 처음부터 안 만든 것이 낫다. */
    const price = r.perPerson;
    if (!price) { skipped.push({ f, why: '1인당 금액을 못 읽었다' }); continue; }
    const dates = r.dates || {};
    if (!dates.departDate) { skipped.push({ f, why: '출발일을 못 읽었다' }); continue; }

    const dn = destFromName(f, r.text);
    const iti = itineraryFrom(r.itinerary);

    /* ⚠ **금액 확인일은 문서 작성일을 후보로 넣을 뿐이다.**
       그게 「우리가 확인한 날」이라는 보장은 없다 — 실측으로 작성일이 실은
       「PDF로 뽑은 날」인 문서가 여럿이었다. 그래서 note에 출처를 남기고 draft로 둔다. */
    const asOf = dates.quoteDate || null;
    const asOfWhy = asOf
      ? '금액 확인일은 문서의 작성일(' + asOf + ')에서 가져왔습니다 — 실제로 확인한 날로 고쳐 주세요.'
      : '⚠ 문서에 작성일이 없어 오늘 날짜를 넣었습니다 — 반드시 확인한 날로 고쳐 주세요.';

    rows.push({
      id: idFrom(f),
      source: 'hanatour',
      title: titleFrom(f, dn.key, dates),
      destKey: dn.key || null,
      destLabel: dn.key || null,
      nights: dates.nights || null,
      days: dates.days || null,
      departDate: dates.departDate,
      pricePerPerson: Math.round(price),
      priceAsOf: asOf,
      /* ⚠ 항상 draft다. 고객에게 나가려면 사람이 연다 — 위 머리말 참고. */
      status: 'draft',
      itinerary: iti,
      note: asOfWhy + ' (출처 파일: ' + f + ')',
      _file: f,
      _dayCount: iti ? iti.length : 0,
    });
  }

  /* ── 표 ── */
  console.log('════ 만들 수 있는 상품 ' + rows.length + '건 ════\n');
  rows.forEach((p) => {
    console.log('  ' + wpad(p.destKey || '(목적지 미상)', 12)
      + wpad((p.nights && p.days) ? p.nights + '박' + p.days + '일' : '', 8)
      + wpad(p.departDate, 12)
      + won(p.pricePerPerson).padStart(11) + '원'
      + '   일정 ' + String(p._dayCount).padStart(2) + '일'
      + '   ' + p._file.slice(0, 40));
    if (!p.priceAsOf) console.log('     ⚠ 문서에 작성일이 없다 — 금액 확인일을 사람이 넣어야 한다');
    if (!p.destKey) console.log('     ⚠ 목적지를 못 정했다 — 관리자 화면에서 지역명을 적어야 한다');
    if (!p._dayCount) console.log('     ⚠ 일정을 못 읽었다 — 금액만 들어간다');
  });

  if (skipped.length) {
    console.log('\n──── 못 만든 것 ' + skipped.length + '건 ────');
    skipped.forEach((s) => console.log('  · ' + wpad(s.f.slice(0, 44), 46) + s.why));
  }

  console.log('\n⚠ 만들어지는 상품은 **전부 「작성중」**입니다 — 고객에게 안 보입니다.');
  console.log('  관리자 → 패키지 상품에서 **금액 확인일을 확인하고** 「판매중」으로 바꿔야 나갑니다.');
  console.log('  그 확인이 이 자동화의 유일한 안전장치입니다(우리는 대리점이라 적힌 값으로 팔아야 합니다).');

  if (!APPLY) {
    console.log('\n──── dry-run입니다. 실제로 넣으려면 --apply ────');
    return;
  }

  /* ── 넣는다 ── */
  require('./_load_env')();
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  let added = 0, kept = 0;
  for (const p of rows) {
    /* ⚠ **이미 있으면 건드리지 않는다.** 담당자가 손본 값을 덮어쓰면 그 수정이
       조용히 사라지고 되살릴 근거도 없다(itineraries에서 같은 자리를 겪었다). */
    const has = await sql`select 1 from packages where id = ${p.id} limit 1`;
    if (has.length) { kept++; continue; }
    await sql`
      insert into packages (
        id, source, title, dest_key, dest_label, nights, days, depart_date,
        price_per_person, price_asof, status, itinerary, note, updated_by
      ) values (
        ${p.id}, ${p.source}, ${p.title}, ${p.destKey}, ${p.destLabel},
        ${p.nights}, ${p.days}, ${p.departDate},
        ${p.pricePerPerson},
        ${p.priceAsOf ? new Date(p.priceAsOf).toISOString() : new Date().toISOString()},
        ${p.status},
        ${p.itinerary == null ? null : JSON.stringify(p.itinerary)},
        ${p.note}, ${'import_packages'}
      )`;
    added++;
  }
  console.log('\n✅ 새로 넣은 것 ' + added + '건 · 이미 있어 그대로 둔 것 ' + kept + '건');
  console.log('   전부 「작성중」입니다 — 관리자 화면에서 확인하고 여세요.');
}

/* ⚠ require만으로 코퍼스를 읽거나 DB에 붙으면 안 된다 */
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { titleFrom, idFrom, itineraryFrom };

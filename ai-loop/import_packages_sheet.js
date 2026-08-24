/* ═══════════════════════════════════════════════════════════════════════════
   **하나투어 대표상품 리스트(엑셀) → 패키지 상품**으로 투입한다 (VY)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「엑셀 파일 그대로 업데이트하려면?」 + 실제 파일을 주셨다
   (`대표상품리스트/대표상품리스트_260824.xlsx` — 3,550개 상품, 12칸).

   ⚠ 읽는 법만 여기 있고, **행으로 만드는 규칙은 `_package_rows.js` 하나가 진실**이다
     (draft 고정 · kind/basis 명시 · 금액 확인일 정책). PDF 투입기와 같은 함수를 쓴다.

   ── 이 자료로 **되는 것과 안 되는 것** ──────────────────────────────────────
   있다 : 상품코드 · 상품명 · 지역/국가/도시 · 이미지URL · 성인 1인 총상품가 · 구분
   없다 : 🔴 **출발일** — 대표상품이라 날짜를 고객이 고른다(칸 자체가 없다)
          🔴 **일정(DAY별)** — 견적서에 일정표가 안 들어간다. 금액만 나간다.
          🔴 **포함/불포함 사항**
   → 그래서 이 경로로 만든 상품의 견적서는 **금액 중심**이다. 일정을 넣으려면
     그 상품의 하나투어 상세 PDF를 따로 받아 기존 PDF 투입기를 태우면 된다.

   ── 금액 확인일 ─────────────────────────────────────────────────────────────
   **파일 이름의 날짜를 쓴다**(`…_260824.xlsx` → 2026-08-24). 그게 이 리스트를 받은
   날이고, 자료가 스스로 밝힌 유일한 날짜다. 이름에 날짜가 없으면 만들지 않는다
   (`--assume-today`로만 우회 — 오늘 날짜를 조용히 넣지 않는다는 원칙 그대로).

   ── ⚠ 3,550건을 그대로 넣지 않는다 ─────────────────────────────────────────
   「현지투어」(376건·중앙 99,900원)는 반일/1일 투어라 **여행 상품이 아니다.**
   기본은 **「패키지」·「단독패키지」만** 넣고, 나머지는 `--kind`로 더한다.
   ⚠ **거른 것을 조용히 버리지 않는다** — 매번 구분별 표를 찍어 무엇을 빼고 있는지 보인다.

   실행:
     node ai-loop/import_packages_sheet.js                      (dry-run · 기본 파일)
     node ai-loop/import_packages_sheet.js "경로/파일.xlsx"
     node ai-loop/import_packages_sheet.js --kind "패키지,골프,허니문"
     node ai-loop/import_packages_sheet.js --region "일본" --min 300000
     node ai-loop/import_packages_sheet.js --limit 50
     node ai-loop/import_packages_sheet.js --apply
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { readSheet } = require('./_sheet_read');
const R = require('./_package_rows');

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const APPLY = argv.includes('--apply');
const ASSUME_TODAY = argv.includes('--assume-today');
const KINDS = flag('kind', '패키지,단독패키지').split(',').map((s) => s.trim()).filter(Boolean);
const REGION = flag('region', null);
/* 🔴 **국내(지역=한국)는 기본에서 뺀다**(VY). 실제 파일에서 그 구간의 「도시명」이
   **도착지가 아니라 출발지**인 행이 섞여 있었다:
       국가=대한민국 · 지역=한국 · 도시=**부산**  ← 상품은 「서안/화산 5~6일」(중국)
       같은 자리에 「카자흐스탄 6일」·「칭다오 3~4일」도 있었다
   그대로 넣으면 **중국·카자흐스탄 여행이 「부산」 상품으로 고객 화면에 뜬다.**
   자료만 봐서는 그 둘을 가를 수 없다 — 지어내지 않고 뺀다.
   ⚠ 국내 상품을 파실 거면 `--include-domestic`. 그때는 의심 행에 ⚠를 붙여 보여준다. */
const INCLUDE_DOMESTIC = argv.includes('--include-domestic');
const MIN_PRICE = Number(flag('min', 150000));
const LIMIT = Number(flag('limit', 0)) || 0;
const FILE = argv.find((a) => !a.startsWith('--') && /\.(xlsx|xls|csv)$/i.test(a))
  || path.join(ROOT, '대표상품리스트', '대표상품리스트_260824.xlsx');

const won = (n) => Number(n || 0).toLocaleString();
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};

/* ── 칸 찾기 ── 이름이 조금 달라도 찾도록 유의어를 둔다.
   ⚠ **찾은 결과를 반드시 화면에 찍는다.** 엉뚱한 칸을 금액으로 읽고도 모르면
     그대로 고객 금액이 된다(결함 생성기 ②). */
const FIELD_ALIASES = {
  code:   ['대표상품코드', '상품코드', '코드'],
  title:  ['대표상품명', '상품명', '여행명', '제목'],
  region: ['지역명', '권역'],
  country:['국가명'],
  city:   ['도시명', '도착도시'],
  price:  ['성인총상품가', '성인상품가', '판매가', '상품가', '1인요금', '요금'],
  kind:   ['대표상품구분명', '상품구분', '구분'],
  image:  ['대표이미지URL', '이미지', '이미지URL'],
};
function mapHeaders(header) {
  const H = header.map((h) => String(h == null ? '' : h).trim());
  const map = {}, why = {};
  for (const [key, names] of Object.entries(FIELD_ALIASES)) {
    let idx = -1, hit = null;
    for (const n of names) { idx = H.indexOf(n); if (idx >= 0) { hit = n; break; } }
    if (idx < 0) {   /* 정확히 없으면 포함으로 한 번 더 */
      idx = H.findIndex((h) => names.some((n) => h && h.includes(n)));
      hit = idx >= 0 ? H[idx] : null;
    }
    map[key] = idx; why[key] = hit;
  }
  return { map, why, H };
}

/* 상품명에서 일수 — 「오사카 3일」·「호주 시드니 8일」 */
function daysFrom(title) {
  const m = /(\d+)\s*일/.exec(String(title || ''));
  const d = m ? Number(m[1]) : 0;
  return d >= 1 && d <= 60 ? d : null;
}

/* 파일 이름의 날짜 — `대표상품리스트_260824.xlsx` → 2026-08-24
   ⚠ 두 자리 연도라 2000년대로 읽는다. 「26」이 1926년일 수는 없다. */
function asOfFromName(file) {
  const m = /_(\d{2})(\d{2})(\d{2})(?:\D|$)/.exec(path.basename(file));
  if (!m) return null;
  const y = 2000 + Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const p = (n) => String(n).padStart(2, '0');
  return y + '-' + p(mo) + '-' + p(d);
}

/* 도시명이 우리 요율표에 있으면 목적지로 묶는다(사진·기본 일정을 재사용할 수 있다).
   ⚠ 없다고 버리지 않는다 — `dest_key`는 nullable이고 `dest_label`만 있어도 팔린다. */
let DESTS = null;
function destKeyOf(city, country) {
  if (!DESTS) {
    try { DESTS = require(path.join(ROOT, 'data.js')).map((d) => d.destination_key); }
    catch { DESTS = []; }
  }
  const c = String(city || '').trim();
  if (DESTS.includes(c)) return c;
  const co = String(country || '').trim();
  if (DESTS.includes(co)) return co;
  return null;
}

/* 상품코드로 id를 만든다 — 하나투어 코드가 곧 그 상품의 이름이라 **안정적이다**
   (다시 돌려도 같은 id → 이미 있으면 안 건드린다). */
const idFrom = (code) => 'hana-' + String(code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

async function main() {
  if (!fs.existsSync(FILE)) {
    console.log('파일이 없습니다: ' + FILE);
    process.exit(1);
  }
  console.log('파일: ' + FILE);
  let sheet;
  try { sheet = readSheet(FILE); }
  catch (e) { console.log('읽지 못했습니다 — ' + e.message); process.exit(1); }

  const all = sheet.rows.filter((r) => r && r.some((c) => c != null && c !== ''));
  if (all.length < 2) { console.log('내용이 없습니다.'); process.exit(1); }
  const { map, why, H } = mapHeaders(all[0]);
  const body = all.slice(1).filter((r) => r[map.title] != null && r[map.price] != null);

  console.log('시트: ' + sheet.sheet + ' · 상품 ' + body.length + '건\n');
  console.log('──── 칸을 이렇게 읽었습니다 ────');
  for (const k of Object.keys(FIELD_ALIASES)) {
    console.log('  ' + wpad(k, 9) + (map[k] >= 0 ? '← 「' + why[k] + '」 (' + map[k] + '번째 칸)' : '**못 찾음**'));
  }
  const unmapped = H.filter((h, i) => h && !Object.values(map).includes(i));
  if (unmapped.length) console.log('  안 쓰는 칸: ' + unmapped.join(' · '));
  if (map.title < 0 || map.price < 0) {
    console.log('\n상품명·금액 칸을 못 찾아 진행할 수 없습니다. 칸 이름을 알려주시면 맞추겠습니다.');
    process.exit(1);
  }

  /* 구분별 표 — **무엇을 빼고 있는지 매번 보인다** */
  const byKind = {};
  body.forEach((r) => { const k = String(r[map.kind] || '(구분 없음)'); (byKind[k] = byKind[k] || []).push(r); });
  console.log('\n──── 상품 구분 (◎ = 이번에 넣을 것) ────');
  Object.entries(byKind).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => {
    const on = KINDS.includes(k);
    const prices = v.map((r) => Number(r[map.price])).filter(Number.isFinite).sort((a, b) => a - b);
    console.log('  ' + (on ? '◎' : ' ') + ' ' + wpad(k, 12) + String(v.length).padStart(5) + '건   중앙 '
      + won(prices[Math.floor(prices.length / 2)]).padStart(11) + '원');
  });
  console.log('  → 다른 구분을 넣으려면  --kind "패키지,골프,허니문"');

  const asOf = asOfFromName(FILE);
  console.log('\n금액 확인일: ' + (asOf ? asOf + ' (파일 이름에서)' : '**파일 이름에 날짜가 없습니다**'));

  /* ── 행 만들기 ── */
  /* 출발 공항이 있는 도시 — 이 이름이 「도시명」에 들어 있으면 도착지가 아니라
     출발지일 수 있다. 순천시·평창군 같은 곳은 출발지가 될 수 없어 오탐되지 않는다. */
  const DEPART_CITIES = ['부산', '인천', '서울', '대구', '청주', '광주', '제주', '양양', '무안', '김해'];
  const looksLikeDeparture = (r) => {
    const city = String(r[map.city] || '');
    const title = String(r[map.title] || '');
    return DEPART_CITIES.some((c) => city.includes(c)) && !title.includes(city.replace(/시$|군$/, ''));
  };

  const inputs = [];
  const suspects = [];
  const dropped = { kind: 0, region: 0, price: 0, domestic: 0 };
  for (const r of body) {
    const k = String(r[map.kind] || '(구분 없음)');
    if (!KINDS.includes(k)) { dropped.kind++; continue; }
    const isDomestic = String(r[map.region] || '') === '한국';
    if (isDomestic && !INCLUDE_DOMESTIC) { dropped.domestic++; continue; }
    if (REGION && String(r[map.region] || '').indexOf(REGION) < 0) { dropped.region++; continue; }
    const price = Number(r[map.price]);
    if (!(price >= MIN_PRICE)) { dropped.price++; continue; }
    if (isDomestic && looksLikeDeparture(r)) suspects.push(r);

    const city = r[map.city], country = r[map.country];
    const days = daysFrom(r[map.title]);
    inputs.push({
      id: idFrom(r[map.code] || r[map.title]),
      source: 'hanatour',
      sourceCode: r[map.code] ? String(r[map.code]) : null,
      title: String(r[map.title]).trim(),
      destKey: destKeyOf(city, country),
      destLabel: String(city || country || '').trim() || null,
      days,
      nights: days ? days - 1 : null,
      pricePerPerson: price,
      priceAsOf: asOf,
      origin: '대표상품리스트 ' + path.basename(FILE) + ' · 구분 ' + k
        + (r[map.image] ? ' · 이미지 ' + String(r[map.image]) : ''),
    });
  }

  /* ⚠ 출발일은 **필수가 아니다** — 대표상품은 날짜를 고객이 고른다(파일에 칸이 없다) */
  const { rows, skipped } = R.buildPackageRows(inputs, { requireDepart: false, assumeToday: ASSUME_TODAY });
  const use = LIMIT ? rows.slice(0, LIMIT) : rows;

  console.log('\n──── 거른 것 ────');
  console.log('  구분이 대상이 아님   ' + String(dropped.kind).padStart(5) + '건');
  if (dropped.domestic) {
    console.log('  국내(지역=한국)      ' + String(dropped.domestic).padStart(5) + '건'
      + '   🔴 그 구간은 「도시명」이 **출발지**인 행이 섞여 있습니다');
    console.log('        (예: 도시=부산인데 상품은 「서안/화산 5~6일」·「카자흐스탄 6일」)');
    console.log('        국내도 파실 거면 --include-domestic — 의심 행에 ⚠를 붙여 드립니다');
  }
  if (suspects.length) {
    console.log('\n  ⚠ 도착지가 아니라 **출발지로 보이는** 행 ' + suspects.length + '건 — 넣기 전에 봐 주세요');
    suspects.slice(0, 6).forEach((r) => console.log('      도시=' + wpad(String(r[map.city]), 8)
      + String(r[map.title]).slice(0, 46)));
  }
  if (REGION) console.log('  지역 「' + REGION + '」이 아님  ' + String(dropped.region).padStart(5) + '건');
  console.log('  ' + won(MIN_PRICE) + '원 미만      ' + String(dropped.price).padStart(5) + '건'
    + '   (현지투어·당일 상품이 여기 걸린다. --min 0 으로 풀 수 있다)');
  if (skipped.length) {
    const g = {};
    skipped.forEach((s) => { g[s.why] = (g[s.why] || 0) + 1; });
    Object.entries(g).forEach(([w, n]) => console.log('  ' + String(n).padStart(5) + '건  ' + w));
  }
  if (LIMIT && rows.length > LIMIT) console.log('  --limit ' + LIMIT + ' 로 ' + (rows.length - LIMIT) + '건을 더 잘랐습니다');

  console.log('\n════ 넣을 상품 ' + use.length + '건 ════\n');
  use.slice(0, 25).forEach((p) => {
    console.log('  ' + wpad(p.destLabel || '(지역 미상)', 12)
      + wpad(p.days ? p.days + '일' : '(일수 ?)', 8)
      + won(p.pricePerPerson).padStart(11) + '원   ' + String(p.title).slice(0, 46));
  });
  if (use.length > 25) console.log('  … 그리고 ' + (use.length - 25) + '건 더');

  const noDays = use.filter((p) => !p.days).length;
  const noDest = use.filter((p) => !p.destKey).length;
  console.log('\n  ⚠ 일수를 못 읽은 것 ' + noDays + '건 (상품명에 「N일」이 없다 — 관리자 화면에서 넣으면 된다)');
  console.log('  ⚠ 우리 요율표에 없는 지역 ' + noDest + '건 (지역명만 쓴다 — 파는 데 지장 없다)');
  console.log('\n🔴 이 자료에는 **일정(DAY별)과 포함/불포함이 없습니다.**');
  console.log('   그래서 이 상품들의 견적서는 **금액 중심**으로 나갑니다.');
  console.log('   일정을 넣으려면 그 상품의 하나투어 상세 PDF를 받아 import_packages.js를 태우세요.');
  console.log('\n⚠ 전부 「작성중」으로 들어갑니다 — 관리자 화면에서 확인하고 여셔야 고객에게 보입니다.');

  if (!APPLY) { console.log('\n──── dry-run입니다. 실제로 넣으려면 --apply ────'); return; }

  require('./_load_env')();
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  let added = 0, kept = 0;
  for (const p of use) {
    const has = await sql`select 1 from packages where id = ${p.id} limit 1`;
    if (has.length) { kept++; continue; }   /* 담당자가 손본 값을 덮어쓰지 않는다 */
    await sql`
      insert into packages (
        id, source, source_code, title, dest_key, dest_label, nights, days, depart_date,
        price_per_person, price_asof, status, kind, price_basis, itinerary, note, updated_by
      ) values (
        ${p.id}, ${p.source}, ${p.sourceCode}, ${p.title}, ${p.destKey}, ${p.destLabel},
        ${p.nights}, ${p.days}, ${p.departDate},
        ${p.pricePerPerson}, ${new Date(p.priceAsOf).toISOString()},
        ${p.status}, ${p.kind}, ${p.priceBasis},
        ${p.itinerary == null ? null : JSON.stringify(p.itinerary)},
        ${p.note}, ${'import_packages_sheet'}
      )`;
    added++;
  }
  console.log('\n✅ 새로 넣은 것 ' + added + '건 · 이미 있어 그대로 둔 것 ' + kept + '건');
  console.log('   전부 「작성중」입니다 — 관리자 → 패키지 · 소규모 견적에서 확인하고 여세요.');
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { mapHeaders, daysFrom, asOfFromName, idFrom, FIELD_ALIASES };

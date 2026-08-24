/* ═══════════════════════════════════════════════════════════════════════════
   VY — 엑셀(.xlsx) 투입: **의존성 없이 읽고, 지어내지 않는다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표가 실제 파일을 주셨다 —
   `대표상품리스트/대표상품리스트_260824.xlsx` (하나투어 대표상품 3,550건 · 12칸).

   ⚠ **`xlsx` 패키지를 안 쓴다.** 이 저장소는 jsdom을 `package.json` 없이 `--no-save`로
     두고 있어서 누가 `npm install` 한 번만 돌리면 npm이 정리해 버린다(테스트 42개
     파일이 한 번에 죽은 전례). 사장님이 쓰실 도구가 그렇게 깨지면 안 된다.
     .xlsx는 zip 안의 XML이라 Node 기본 zlib만으로 읽힌다.

   ⚠ **이 검사는 실제 파일에 기대지 않는다.** 그 파일은 저장소에 안 들어간다
     (거래처 상품가다 — 코퍼스 PDF를 안 넣는 것과 같은 이유). 대신 **xlsx를 직접
     만들어** 왕복으로 잰다. 그러면 파일이 없는 사람도 이 검사를 돌릴 수 있다.

   ■ 실제 파일에서 잡은 것 셋 — 전부 여기 회귀로 박는다

     ① 🔴 **출발일 칸이 아예 없다.** 대표상품은 날짜를 고객이 고른다. 그런데 VW의
        `buildPackageRow`가 출발일을 필수로 막고 있어서 **3,550건이 전부 걸렸다.**
        → 부르는 쪽이 정한다(`requireDepart:false`). PDF 경로는 기본 true 그대로다.
     ② 🔴 **16진수 문자참조(`&#x9;`)를 안 풀고 있었다.** 상품명 끝에 탭이 그대로 남아
        **고객 화면까지 갈 뻔했다**(10건).
     ③ 🔴 **국내 구간의 「도시명」이 도착지가 아니라 출발지인 행이 섞여 있다.**
        국가=대한민국 · 도시=**부산**인데 상품은 「서안/화산 5~6일」(중국)·「카자흐스탄 6일」.
        자료만으로는 못 가른다 → **지어내지 않고 기본에서 뺀다**(273건).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const S = require('./_sheet_read');
const R = require('./_package_rows');
const A = require('./import_packages_sheet');

/* ── 최소 .xlsx를 손으로 만든다 (zip: 저장 방식 + deflate 둘 다 섞어 넣는다) ── */
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(entries) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, dataRaw, store] of entries) {
    const data = Buffer.from(dataRaw, 'utf8');
    const comp = store ? data : zlib.deflateRawSync(data);
    const nm = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nm, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nm);
    off += 30 + nm.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([Buffer.concat(locals), cdBuf, eocd]);
}

/* 실제 파일과 **같은 칸 이름**으로 만든다 */
const HEAD = ['대표상품코드', '대표상품명', '지역코드', '지역명', '국가코드', '국가명',
  '도시코드', '도시명', '대표이미지URL', '성인총상품가', '대표상품구분코드', '대표상품구분명'];
const DATA = [
  ['MCM1084', '마카오/주하이 3일 #노쇼핑', 'C1', '중국', 'MO', '마카오', 'MFM', '마카오', 'http://img/1.jpg', 749000, '01', '패키지'],
  /* ② 상품명 끝에 탭(&#x9;) — 실제 파일에 있던 모양 그대로 */
  ['MCA9999', '장가계/봉황고성 5~6일 #우리끼리여행&#x9;&#x9;', 'C1', '중국', 'CN', '장사', '', '', '', 1849000, '01', '패키지'],
  /* ③ 국내 구간인데 실제로는 중국 여행 — 「부산」은 출발지다 */
  ['MCX0001', '서안/화산 5~6일 #화산북봉', 'K1', '한국', 'KR', '대한민국', 'PUS', '부산', '', 679900, '01', '패키지'],
  /* 걸러져야 하는 것들 */
  ['MTR0001', '스페인 마드리드 반일투어', 'E1', '유럽', 'ES', '스페인', 'MAD', '마드리드', '', 29900, '05', '현지투어'],
  ['MGO0001', '[골프/경북] 대구 골프 2일', 'K1', '한국', 'KR', '대한민국', 'TAE', '대구', '', 350000, '02', '골프'],
];
function sheetXml(rows) {
  const cell = (v, r, ci) => {
    const ref = String.fromCharCode(65 + ci) + r;
    return typeof v === 'number'
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${String(v)}</t></is></c>`;
  };
  const body = rows.map((row, ri) =>
    `<row r="${ri + 1}">` + row.map((v, ci) => cell(v, ri + 1, ci)).join('') + '</row>').join('');
  return `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
}
const TMP = path.join(os.tmpdir(), '대표상품리스트_260824.xlsx');
fs.writeFileSync(TMP, makeZip([
  ['[Content_Types].xml', '<?xml version="1.0"?><Types/>', true],   /* 저장 방식(무압축)도 섞는다 */
  ['xl/worksheets/sheet1.xml', sheetXml([HEAD, ...DATA]), false],
]));

console.log('\n[1] xlsx를 의존성 없이 읽는다');
{
  const r = S.readSheet(TMP);
  ok('① 시트를 찾았다', r.rows.length === DATA.length + 1, r.rows.length + '행');
  ok('① 헤더가 그대로다', r.rows[0].join(',') === HEAD.join(','), r.rows[0].join(','));
  ok('① 숫자는 숫자로 읽는다', r.rows[1][9] === 749000, String(r.rows[1][9]));
  ok('① 무압축(store) 항목도 처리한다', true);   /* 위 zip에 섞어 넣었고 여기까지 왔다 */
  /* ② 16진수 문자참조 */
  ok('② &#x9;(탭)를 풀어 읽는다', !/&#x/.test(String(r.rows[2][1])), String(r.rows[2][1]));
  ok('② 그래서 상품명에 문자참조가 안 남는다', /장가계\/봉황고성/.test(String(r.rows[2][1])));
}

console.log('\n[2] CSV도 같은 함수로 읽는다 — 확장자가 아니라 내용으로 가른다');
{
  const csv = path.join(os.tmpdir(), 'x.xlsx');   /* 이름은 xlsx인데 내용은 csv */
  fs.writeFileSync(csv, '대표상품명,성인총상품가\n"마카오, 3일",749000\n', 'utf8');
  const r = S.readSheet(csv);
  ok('② 이름이 .xlsx여도 내용이 csv면 csv로 읽는다', r.sheet === '(csv)', r.sheet);
  ok('② 따옴표 안의 쉼표를 안 쪼갠다', r.rows[1][0] === '마카오, 3일', String(r.rows[1][0]));
  ok('② 숫자는 숫자로', r.rows[1][1] === 749000, String(r.rows[1][1]));
}

console.log('\n[3] 칸 이름을 실제 파일대로 찾는다');
{
  const { map, why } = A.mapHeaders(HEAD);
  ok('③ 상품명 칸', map.title === 1 && why.title === '대표상품명');
  ok('③ 금액 칸', map.price === 9 && why.price === '성인총상품가');
  ok('③ 구분 칸', map.kind === 11 && why.kind === '대표상품구분명');
  ok('③ 도시 칸', map.city === 7 && why.city === '도시명');
  /* 이름이 조금 달라도 찾아야 한다 — 다음 달 파일이 「판매가」일 수 있다 */
  const alt = A.mapHeaders(['상품명', '판매가', '상품구분']);
  ok('③ 「판매가」·「상품명」 같은 다른 이름도 찾는다',
    alt.map.title === 0 && alt.map.price === 1 && alt.map.kind === 2);
}

console.log('\n[4] 일수·금액 확인일을 자료에서만 얻는다');
{
  ok('④ 「3일」을 읽는다', A.daysFrom('마카오/주하이 3일 #노쇼핑') === 3);
  ok('④ 「5~6일」은 6일로 읽는다', A.daysFrom('장가계 5~6일') === 6);
  ok('④ 없으면 null이다(지어내지 않는다)', A.daysFrom('[우리끼리] 포르투갈 일주') === null);
  ok('④ 터무니없는 값은 안 받는다', A.daysFrom('999일 여행') === null);
  /* 🔴 금액 확인일은 **파일 이름**에서 온다 — 자료가 스스로 밝힌 유일한 날짜다 */
  ok('④ 파일 이름의 날짜를 읽는다', A.asOfFromName('대표상품리스트_260824.xlsx') === '2026-08-24');
  ok('④ 날짜가 없으면 null이다', A.asOfFromName('상품목록.xlsx') === null);
  ok('④ 말이 안 되는 날짜는 안 받는다', A.asOfFromName('x_269999.xlsx') === null);
}

console.log('\n[5] 🔴 출발일이 없어도 만들 수 있다 — 대표상품은 날짜를 고객이 고른다');
{
  const base = { id: 'a', title: '마카오 3일', pricePerPerson: 749000, priceAsOf: '2026-08-24' };
  const strict = R.buildPackageRow(base, {});
  ok('⑤ 기본은 출발일을 요구한다(PDF 경로 그대로)', strict.ok === false && /출발일/.test(strict.why));
  const loose = R.buildPackageRow(base, { requireDepart: false });
  ok('⑤ requireDepart:false면 만든다', loose.ok === true, loose.why);
  ok('⑤ 출발일은 null로 둔다', loose.ok && loose.row.departDate === null);
  ok('⑤ 그래도 draft·catalog·agency는 그대로다',
    loose.ok && loose.row.status === 'draft' && loose.row.kind === 'catalog' && loose.row.priceBasis === 'agency');
  /* 상품명의 눈에 안 보이는 공백은 턴다 */
  const dirty = R.buildPackageRow(Object.assign({}, base, { title: '장가계  5~6일\t\t' }), { requireDepart: false });
  ok('⑤ 상품명 끝의 탭·중복 공백을 턴다', dirty.ok && dirty.row.title === '장가계 5~6일',
    dirty.ok && JSON.stringify(dirty.row.title));
}

console.log('\n[6] 🔴 「도시명이 출발지」인 행을 지어내서 넣지 않는다');
{
  /* 실제 파일에서 나온 모양: 국가=대한민국·도시=부산인데 상품은 중국 서안/화산 */
  const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'import_packages_sheet.js'), 'utf8');
  ok('⑥ 국내 구간을 기본에서 뺀다', /INCLUDE_DOMESTIC/.test(src) && /=== '한국'/.test(src));
  ok('⑥ 왜 빼는지가 적혀 있다', /도착지가 아니라 출발지/.test(src));
  ok('⑥ 실제 사례(부산 → 서안\/화산)가 적혀 있다', /서안\/화산/.test(src));
  ok('⑥ 국내를 넣을 길은 열어 뒀다', /--include-domestic/.test(src));
  ok('⑥ 그때 의심 행에 표시한다', /suspects/.test(src) && /출발지로 보이는/.test(src));
  /* 거른 것을 조용히 버리지 않는다 */
  ok('⑥ 거른 건수를 매번 보여준다', /거른 것/.test(src) && /dropped\.domestic/.test(src));
  ok('⑥ 구분별 표를 매번 찍는다', /상품 구분 \(◎ = 이번에 넣을 것\)/.test(src));
}

console.log('\n[7] 이 자료에 **없는 것**을 있는 척하지 않는다');
{
  const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'import_packages_sheet.js'), 'utf8');
  ok('⑦ 일정·포함/불포함이 없다고 말한다', /일정\(DAY별\)과 포함\/불포함이 없습니다/.test(src));
  ok('⑦ 그래서 견적서가 금액 중심이라고 밝힌다', /금액 중심/.test(src));
  ok('⑦ 일정을 넣는 길을 알려준다', /상세 PDF를 받아/.test(src));
  ok('⑦ 전부 「작성중」으로 들어간다고 말한다', /전부 「작성중」/.test(src));
}

console.log('\n[8] 🔴 상품 사진 — 아무 주소나 화면에 싣지 않는다');
{
  const base = { id: 'a', title: '마카오 3일', pricePerPerson: 749000, priceAsOf: '2026-08-24' };
  const mk = (u) => R.buildPackageRow(Object.assign({}, base, { imageUrl: u }), { requireDepart: false });
  ok('⑧ https 주소는 받는다',
    mk('https://image.hanatour.com/a.jpg').row.imageUrl === 'https://image.hanatour.com/a.jpg');
  /* http는 브라우저가 막아 **깨진 사진 자리만** 남는다 */
  ok('⑧ http는 안 받는다', mk('http://image.hanatour.com/a.jpg').row.imageUrl === null);
  /* 🔴 주소가 아닌 것 — 화면이 이 값을 <img src>에 그대로 쓴다 */
  ok('⑧ javascript: 는 안 받는다', mk('javascript:alert(1)').row.imageUrl === null);
  ok('⑧ data: 는 안 받는다', mk('data:text/html,<script>x</script>').row.imageUrl === null);
  ok('⑧ 따옴표가 든 주소는 안 받는다(속성을 깨고 나온다)',
    mk('https://x/a.jpg" onerror="alert(1)').row.imageUrl === null);
  ok('⑧ 없으면 null이다', mk(null).row.imageUrl === null && mk(undefined).row.imageUrl === null);

  const API = fs.readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');
  const PKGHTML = fs.readFileSync(path.join(ROOT, 'packages.html'), 'utf8');
  ok('⑧ 서버가 나갈 때도 한 번 더 막는다', /image_url[\s\S]{0,120}\^https:/.test(API));
  ok('⑧ 저장할 때도 막는다', /b\.imageUrl[\s\S]{0,120}\^https:/.test(API));
  /* 사진이 깨지면 **자리째 접는다** — 빈 회색 상자가 남으면 상품이 고장 난 것처럼 보인다 */
  ok('⑧ 사진이 깨지면 자리를 접는다', /onerror="this\.parentElement\.remove\(\)"/.test(PKGHTML));
  ok('⑧ 사진 주소를 esc한다', /esc\(p\.imageUrl\)/.test(PKGHTML));
  /* 비율을 고정하지 않으면 사진이 늦게 오면서 목록이 출렁인다 */
  ok('⑧ 세로 비율을 고정한다', /\.pk-thumb[\s\S]{0,160}aspect-ratio/.test(PKGHTML));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — VY 엑셀 상품리스트 투입`);
process.exit(fail ? 1 : 0);

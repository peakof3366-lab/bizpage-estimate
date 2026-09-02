/* ═══════════════════════════════════════════════════════════════════════════
   대표상품리스트 3,550건이 **우리 목적지에 몇 건이나 붙는가** (YH) — 읽기 전용
   ───────────────────────────────────────────────────────────────────────────
   ■ 무엇을 정하려고 재는가

   하나투어 상품가를 「시장가 밴드」로 쓰자는 설계의 **층 0**이다. 밴드는
   `목적지 × 일수 × 출발월`로 만드는데, **목적지가 안 붙으면 그 위가 전부 헛일**이다.
   그래서 DB도 화면도 짓기 전에 이 숫자부터 본다.

   ■ 무엇을 답하는가 — 마지막 줄 하나가 결론이다

       **표본 3건 이상이 모이는 목적지가 몇 곳인가**

   그 수가 적으면 이 설계는 접는 게 맞다. 3건 미만짜리 밴드를 만들면 이 저장소가
   이미 여러 번 속은 자리로 다시 간다(4~6건짜리 무리로 축을 판정하다 YF에서 기각).

   ■ 🔴 2026-09-02 결론 — **이 엑셀로는 밴드를 만들 수 없다.** 반드시 먼저 읽을 것

   재고 나서 알았다. 엑셀의 「성인총상품가」는 실판매가가 아니라 그 대표상품의
   **최저 출발가(from-price)**다. 증거 한 쌍이 결정적이다:

       엑셀   MJT1080 「[출발확정] 도쿄 3~4일 패키지」        **979,900원**
       실제   JTP140261029TWT 도쿄/하코네/아타미 4일 10/29    **1,689,900원**  ← 1.72배
              (같은 대표상품이다. 상품 주소로 읽었고 금액 검산도 통과했다.)

   그래서 이 파일로 만든 「밴드」는 시장가가 아니라 **시장 최저가**다. 그걸 시장가로
   부르면 우리 견적은 언제나 두 배로 보인다 — 실제로 `--engine`이 **중앙 +95.5%**를
   찍었고, 그 숫자를 그대로 믿었으면 **없는 문제를 고치러 갔을 것**이다.

   🔴 **이 도구의 밴드를 「우리가 비싸다/싸다」의 근거로 쓰지 말 것.**
     쓸 수 있는 것은 ① 목적지가 몇 곳이나 붙는가 ② 무엇을 별칭에 넣으면 느는가,
     둘뿐이다. 진짜 밴드는 **판매상품(pkgCd) 단위로 읽어야** 생긴다.

   ■ 아무것도 쓰지 않는다

   운영 DB·네트워크를 안 건드린다. 엑셀은 이미 디스크에 있다.

   ⚠ **읽은 칸을 반드시 찍는다.** 엉뚱한 열을 금액으로 읽고도 모르면 그대로
     밴드가 되고, 밴드는 나중에 「우리 견적이 시장가보다 싸다/비싸다」의 근거가 된다
     (결함 생성기 ②). 그래서 헤더 매핑과 값 분포를 먼저 보여준다.

   실행:
     node ai-loop/audit_market_coverage.js
     node ai-loop/audit_market_coverage.js --file <다른.xlsx>
     node ai-loop/audit_market_coverage.js --miss 40     못 붙은 표기를 40개까지
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { readSheet } = require('./_sheet_read');
/* 헤더 찾기·일수 파싱은 투입 도구와 **같은 것**을 쓴다 — 여기서 다시 적으면
   「감사기가 본 것」과 「실제로 들어가는 것」이 갈린다(결함 생성기 ①). */
const { mapHeaders, daysFrom } = require('./import_packages_sheet.js');
const { marketDest } = require('./_market_dest.js');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const FILE = argOf('--file')
  || path.join(ROOT, '대표상품리스트', '대표상품리스트_260824.xlsx');
const MISS_N = Number(argOf('--miss')) > 0 ? Number(argOf('--miss')) : 25;

/* 밴드를 만들 수 있는 최소 표본. 이보다 적으면 중앙값이 뜻이 없다.
   ⚠ `audit_error_axes.js`의 MIN_GROUP(4)과 **일부러 다르다** — 저건 오차 무리이고
     이건 가격 관측이다. 다만 셋 미만을 밴드라 부르지 않는 것은 같은 이유다. */
const MIN_BAND = 3;

const won = (n) => Number(n || 0).toLocaleString();
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};
const med = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) / 2;
  return s.length % 2 ? s[i] : Math.round((s[Math.floor(i)] + s[Math.ceil(i)]) / 2);
};

if (!fs.existsSync(FILE)) { console.log('파일이 없습니다: ' + FILE); process.exit(1); }

const DEST_KEYS = require(path.join(ROOT, 'data.js')).map((d) => d.destination_key);
const sheet = readSheet(FILE);
const rows = sheet.rows || sheet;
const header = rows[0] || [];
const { map, why } = mapHeaders(header);

console.log('파일: ' + path.basename(FILE));
console.log('요율표 목적지 ' + DEST_KEYS.length + '곳 · 엑셀 ' + (rows.length - 1) + '행\n');

/* ── ① 어느 열을 무엇으로 읽었나 ─────────────────────────────────────────── */
console.log('■ 읽은 칸 (엉뚱한 열을 금액으로 읽으면 밴드가 통째로 거짓이 된다)');
Object.keys(why).forEach((k) => {
  console.log('   ' + wpad(k, 9) + (map[k] >= 0 ? '← 「' + why[k] + '」 (' + map[k] + '열)' : '🔴 못 찾음'));
});
if (map.price < 0 || map.city < 0) {
  console.log('\n🔴 금액 또는 도시 칸을 못 찾았습니다 — 여기서 멈춥니다.');
  process.exit(1);
}

/* ── ② 행을 읽는다 ──────────────────────────────────────────────────────── */
const at = (r, k) => (map[k] >= 0 ? String(r[map[k]] == null ? '' : r[map[k]]).trim() : '');
const all = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r.length) continue;
  const title = at(r, 'title');
  if (!title) continue;
  const priceRaw = at(r, 'price').replace(/[^0-9]/g, '');
  all.push({
    code: at(r, 'code'), title,
    region: at(r, 'region'), country: at(r, 'country'), city: at(r, 'city'),
    kind: at(r, 'kind'),
    price: priceRaw ? Number(priceRaw) : null,
    days: daysFrom(title),
  });
}
console.log('\n읽은 행 ' + all.length + '건');

/* ── ③ 무엇을 빼는가 — **먼저 실제 값 분포를 보여주고 뺀다** ─────────────── */
const tally = (arr, f) => arr.reduce((m, x) => { const k = f(x) || '(빈칸)'; m[k] = (m[k] || 0) + 1; return m; }, {});
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

console.log('\n■ 지역명 분포 (상위 12)');
top(tally(all, (x) => x.region), 12).forEach(([k, n]) => console.log('   ' + wpad(k, 14) + String(n).padStart(5) + '건'));
console.log('\n■ 상품구분 분포 (상위 8)');
top(tally(all, (x) => x.kind), 8).forEach(([k, n]) => console.log('   ' + wpad(k, 14) + String(n).padStart(5) + '건'));

/* ⚠ 빼는 이유는 **이미 실측으로 확인된 것**이다(2026-08-24, 메모리):
     · 국내 구간은 「도시명」이 **출발지**인 행이 섞여 있다(도시=부산인데 상품은 서안 5일).
       자료로는 못 가르므로 통째로 뺀다.
     · 「현지투어」는 반일 투어라 여행 상품이 아니다(중앙 99,900원).
   ⚠ 몇 건을 왜 뺐는지 반드시 찍는다 — 조용히 버리면 나중에 「3,550건」과 안 맞는다. */
const isDomestic = (x) => /한국|국내/.test(x.region) || /한국|국내/.test(x.country);
const isLocalTour = (x) => /현지\s*투어/.test(x.kind);
const dropped = { domestic: 0, localTour: 0, noPrice: 0 };
const use = all.filter((x) => {
  if (isDomestic(x)) { dropped.domestic++; return false; }
  if (isLocalTour(x)) { dropped.localTour++; return false; }
  if (!(x.price > 0)) { dropped.noPrice++; return false; }
  return true;
});
console.log('\n■ 뺀 것');
console.log('   국내(도시명이 출발지인 행이 섞임)  ' + String(dropped.domestic).padStart(5) + '건');
console.log('   현지투어(반일 투어 — 여행 상품 아님) ' + String(dropped.localTour).padStart(5) + '건');
console.log('   금액이 없거나 0                  ' + String(dropped.noPrice).padStart(5) + '건');
console.log('   → 남은 것 ' + use.length + '건');

/* ── ④ 붙는가 ───────────────────────────────────────────────────────────── */
use.forEach((x) => { const d = marketDest(x, DEST_KEYS); x.destKey = d.key; x.from = d.from; });
const hit = use.filter((x) => x.destKey);
const miss = use.filter((x) => !x.destKey);
const byFrom = tally(hit, (x) => x.from);

console.log('\n' + '═'.repeat(78));
console.log('■ 우리 목적지에 붙은 것  ' + hit.length + ' / ' + use.length + '  (' + pct(hit.length, use.length) + ')');
['city', 'country', 'alias', 'title'].forEach((k) => {
  if (!byFrom[k]) return;
  const label = { city: '도시명이 그대로 맞음', country: '국가명이 그대로 맞음', alias: '별칭 표', title: '상품명에서 찾음' }[k];
  console.log('   ' + wpad(label, 20) + String(byFrom[k]).padStart(5) + '건');
});
console.log('   ' + wpad('🔴 못 붙음', 20) + String(miss.length).padStart(5) + '건');

/* ⚠ **상품명 갈래는 따로 센다.** 도시·국가가 못 맞춘 것을 상품명이 주워 담는 것이라
   믿을 만한 정도가 다르다. 얼마나 늘려 주는지 숫자로 보고 나서 쓸지 정한다. */
if (byFrom.title) {
  console.log('\n   ⚠ 이 중 ' + byFrom.title + '건은 **상품명에서** 찾은 것이다 —'
    + ' 도시·국가만 보면 ' + (hit.length - byFrom.title) + '건('
    + pct(hit.length - byFrom.title, use.length) + ')이다.');
}

/* ── ⑤ 못 붙은 표기 — **무엇을 별칭에 넣으면 얼마나 느는가** ───────────── */
console.log('\n■ 못 붙은 표기 (도시 · 상위 ' + MISS_N + ') — 별칭 표를 채울 후보');
console.log('   ⚠ 여기 있는 이름을 **짐작으로 우리 목적지에 잇지 말 것.** 근거가 있는 것만 넣는다.');
const missCity = top(tally(miss, (x) => x.city + (x.country ? ' / ' + x.country : '')), MISS_N);
let cum = 0;
missCity.forEach(([k, n]) => {
  cum += n;
  console.log('   ' + wpad(k, 30) + String(n).padStart(5) + '건   (여기까지 누적 ' + cum + '건 · 붙으면 '
    + pct(hit.length + cum, use.length) + ')');
});

/* ── ⑥ 결론 — 밴드를 만들 수 있는 목적지가 몇 곳인가 ────────────────────── */
const byDest = {};
hit.forEach((x) => { (byDest[x.destKey] = byDest[x.destKey] || []).push(x); });
const dests = Object.entries(byDest).sort((a, b) => b[1].length - a[1].length);
const bandable = dests.filter(([, v]) => v.length >= MIN_BAND);

console.log('\n' + '═'.repeat(78));
console.log('■ 목적지별 관측 수 (상위 20)');
dests.slice(0, 20).forEach(([k, v]) => {
  const prices = v.map((x) => x.price);
  const ds = v.map((x) => x.days).filter(Boolean);
  console.log('   ' + wpad(k, 12) + String(v.length).padStart(4) + '건'
    + '   1인가 중앙 ' + won(med(prices)).padStart(11)
    + '   (' + won(Math.min.apply(null, prices)) + ' ~ ' + won(Math.max.apply(null, prices)) + ')'
    + (ds.length ? '   일수 ' + Math.min.apply(null, ds) + '~' + Math.max.apply(null, ds) : ''));
});

console.log('\n' + '═'.repeat(78));
console.log('🎯 결론 — **표본 ' + MIN_BAND + '건 이상이 모이는 목적지 ' + bandable.length
  + '곳 / 요율표 ' + DEST_KEYS.length + '곳**  (' + pct(bandable.length, DEST_KEYS.length) + ')');
console.log('   그 ' + bandable.length + '곳이 담는 관측 ' + bandable.reduce((n, [, v]) => n + v.length, 0) + '건');
console.log('   표본 ' + MIN_BAND + '건 미만인 목적지 ' + (dests.length - bandable.length) + '곳은 밴드를 만들지 않는다.');
console.log('\n⚠ 이 숫자는 **목적지 × 전체**다. 실제 밴드는 `목적지 × 일수 × 출발월`이라');
console.log('  더 잘게 쪼개진다. 그리고 **엑셀에는 출발일이 없다** — 출발월 축은');
console.log('  상품 주소를 읽어야 생긴다. 즉 위 숫자는 **상한**이다.');

/* ── ⑦ 🔴 **붙었다고 밴드가 되는 것이 아니다** ────────────────────────────
   ⑥의 「목적지별」 폭이 방콕 299,000~9,400,000(31배)로 나왔다. 한 목적지 안에
   **성격이 다른 상품이 섞여 있어서**다 — 엑셀 구분만 봐도 패키지·골프·에어텔·
   허니문·ZEUS가 한 통에 있다. 골프는 그린피가, 에어텔은 지상비가 아예 다르다.

   그래서 진짜 물음은 「붙었나」가 아니라 **「좁히면 쓸 만해지나」**다.
   `목적지 × 구분 × 일수`로 좁혀 **사분위 폭**을 재고, 그 무리가 몇 개나
   `MIN_BAND` 이상 남는지 센다. 이게 이 도구의 실제 결론이다.
   ⚠ 폭은 중앙값 대비 비율로 본다 — 금액대가 다른 목적지를 나란히 놓아야 해서다. */
const q = (a, p) => {
  const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const groups = {};
hit.forEach((x) => {
  if (!x.days) return;                       /* 일수를 모르면 밴드에 못 넣는다 */
  const k = x.destKey + ' · ' + (x.kind || '(구분없음)') + ' · ' + x.days + '일';
  (groups[k] = groups[k] || []).push(x.price);
});
const gs = Object.entries(groups).filter(([, v]) => v.length >= MIN_BAND)
  .map(([k, v]) => ({ k, n: v.length, med: med(v), rel: (q(v, 0.75) - q(v, 0.25)) / med(v) }))
  .sort((a, b) => b.n - a.n);

console.log('\n' + '═'.repeat(78));
console.log('■ 🔴 좁히면 쓸 만해지는가 — `목적지 × 구분 × 일수`');
console.log('   무리 ' + Object.keys(groups).length + '개 중 ' + MIN_BAND + '건 이상이 ' + gs.length + '개'
  + ' (관측 ' + gs.reduce((n, g) => n + g.n, 0) + '건)');
if (gs.length) {
  const rels = gs.map((g) => g.rel);
  console.log('   사분위 폭 ÷ 중앙값 — 중앙 ' + (q(rels, 0.5) * 100).toFixed(0) + '%'
    + ' · 하위25% ' + (q(rels, 0.25) * 100).toFixed(0) + '%'
    + ' · 상위25% ' + (q(rels, 0.75) * 100).toFixed(0) + '%');
  console.log('   ⚠ 이 값이 우리 목표선(±10%)보다 훨씬 크면, 밴드는 「검산자」로만 쓰고');
  console.log('     금액의 근거로는 못 쓴다. 두 쓰임을 섞지 말 것.');
  console.log('\n   큰 무리 15개');
  gs.slice(0, 15).forEach((g) => {
    console.log('     ' + wpad(g.k, 30) + String(g.n).padStart(4) + '건'
      + '   중앙 ' + won(g.med).padStart(11) + '   폭 ' + (g.rel * 100).toFixed(0) + '%');
  });
}

/* ⚠ 값이 말이 되는지 눈으로 한 번 — 「1일 76,000원」 같은 행이 섞이면 밴드가 통째로 내려간다 */
const odd = hit.filter((x) => x.price < 200000).sort((a, b) => a.price - b.price).slice(0, 8);
if (odd.length) {
  console.log('\n■ ⚠ 값이 이상한 행 (20만원 미만 · 상위 8) — 여행 상품이 맞는지 봐야 한다');
  odd.forEach((x) => console.log('     ' + won(x.price).padStart(9) + '  ' + wpad(x.kind, 8)
    + wpad(x.destKey, 8) + (x.days ? x.days + '일  ' : '     ') + x.title.slice(0, 40)));
}

/* ── ⑧ 🎯 **진짜 결론 — 우리 휴양 견적이 시장가 밴드 안에 있는가** ────────
   ⑦에서 밴드 폭이 31%로 나왔다. 목표선(±10%)의 세 배라 **금액의 근거로는 못 쓴다.**
   그러면 남는 쓰임은 하나뿐이다 — **검산자.** 그게 값이 있는지 여기서 잰다.

   재는 법: 밴드가 선 무리(`목적지 · 패키지 · N일`)마다 **같은 조건으로 엔진을
   휴양(차량·가이드 끔)으로 돌려** 밴드 중앙값과 견준다. 가족 4인 기준.
   ⚠ 「패키지」 구분만 쓴다 — 골프·에어텔·허니문은 상품이 달라 견줄 것이 아니다.
   ⚠ 이건 **오차가 아니라 자리**다. 밴드는 소매가고 우리는 우리 값이라, 「맞다/틀리다」가
     아니라 「시장 어디쯤에 서 있나」를 본다. 그 구분을 흐리면 또 요율을 만지게 된다. */
if (argv.includes('--engine')) {
  (async () => {
    const { bootEngine } = require('./_engine_boot');
    const { run } = await bootEngine({ quiet: true });
    const PAX = 4, DATE = '2026-11-15';   /* 가족 4인 · 성수기 아닌 달 */
    const LEISURE = { incVehicle: false, incGuide: false };
    const out = [];
    gs.filter((g) => / · 패키지 · /.test(g.k)).forEach((g) => {
      const [dest, , d] = g.k.split(' · ');
      const days = Number(String(d).replace('일', ''));
      if (!(days >= 2)) return;
      let bd; try { bd = run({ dest, pax: PAX, days, date: DATE }, LEISURE); } catch (e) { return; }
      if (!bd || !bd.perPerson) return;
      out.push({ dest, days, n: g.n, band: g.med, ours: bd.perPerson, rel: (bd.perPerson - g.med) / g.med });
    });
    console.log('\n' + '═'.repeat(78));
    console.log('🎯 우리 휴양 견적(4인·차량/가이드 끔) vs 엑셀 **최저가** 중앙값');
    console.log('🔴 이 표를 「우리가 비싸다」로 읽지 말 것 — 오른쪽은 시장가가 아니라');
    console.log('   대표상품의 **최저 출발가**다(엑셀 도쿄 979,900 vs 실제 판매상품 1,689,900).');
    console.log('   실판매가와 견주려면 판매상품(pkgCd)을 주소로 읽어야 한다.');
    if (!out.length) { console.log('   견줄 무리가 없습니다.'); return; }
    out.sort((a, b) => a.rel - b.rel);
    out.forEach((x) => {
      const s = (x.rel >= 0 ? '+' : '') + (x.rel * 100).toFixed(1) + '%';
      console.log('   ' + wpad(x.dest, 10) + x.days + '일  밴드 ' + won(x.band).padStart(10)
        + ' (' + String(x.n).padStart(2) + '건)   우리 ' + won(x.ours).padStart(10) + '   ' + s.padStart(8));
    });
    const rels = out.map((x) => x.rel);
    console.log('\n   무리 ' + out.length + '개 · 중앙 ' + ((q(rels, 0.5)) * 100).toFixed(1) + '%'
      + ' · 사분위 ' + (q(rels, 0.25) * 100).toFixed(1) + '% ~ ' + (q(rels, 0.75) * 100).toFixed(1) + '%');
    console.log('   ±20% 안 ' + rels.filter((r) => Math.abs(r) <= 0.2).length + '개'
      + ' · 아래로 벗어남 ' + rels.filter((r) => r < -0.2).length
      + ' · 위로 벗어남 ' + rels.filter((r) => r > 0.2).length);
    console.log('\n   ⚠ 위 숫자는 **최저가 대비**다 — 실판매가 대비가 아니다.');
    console.log('     실측 한 쌍(도쿄)에서 그 배수가 1.72배였지만 표본 1건이라 보정에');
    console.log('     쓰지 않는다. 배수를 알려면 판매상품을 여러 건 읽어야 한다.');
  })();
}

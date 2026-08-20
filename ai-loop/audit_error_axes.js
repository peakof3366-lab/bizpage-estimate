/* ═══════════════════════════════════════════════════════════════════════════
   오차의 축 찾기 (UB) — **무엇이 남은 오차를 설명하는가**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-13 사장님: 「오차범위를 줄일 수 있는 다른 잣대를 계속 대입해서 방법을 찾아 줘.」

   지금까지는 축을 **사람이 짐작해서** 하나씩 확인했다(인원 → 아니었다, 항공 포함 →
   조금, 원가/판매 → 컸다). 그 방식은 짐작에 없는 축을 영영 못 본다.
   이 도구는 **여러 축을 한 번에 대입**해 「어느 축으로 가르면 무리끼리 가장 다른가」를 잰다.

   읽는 법 — 한 축으로 갈랐을 때:
     · **무리 사이 중앙값 차이가 크다**  -> 그 축이 오차를 설명한다. **계수로 고칠 수 있다.**
     · 무리 안 폭이 작아진다            -> 그 축으로 나눠서 다루면 정확해진다
     · 둘 다 아니다                    -> 그 축은 원인이 아니다

   ⚠ **표본이 27건뿐이다.** 무리가 4건 미만이면 중앙값이 뜻을 잃으므로 아예 안 찍는다.
     축을 늘릴수록 우연히 갈리는 것이 나오므로, **차이가 크고 무리가 두툼한 것만** 본다.
   ⚠ 이건 **진단이지 처방이 아니다.** 축을 찾으면 그 계수를 고치고 `sim_*`으로 재 본다.
   ⚠ 읽기 전용이다. 운영 요율을 얹고 재지만(TR) 아무것도 쓰지 않는다.

   실행: node ai-loop/audit_error_axes.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const { destFromName } = require('./_dest_from_name');
const DATA = require(path.join(ROOT, 'data.js'));

const MIN_GROUP = 4;           /* 이보다 작은 무리는 중앙값이 뜻이 없다 */
const COST_SHEET_RE = /HNT\s*수익|권장\s*수익|입금가|\bFOC\b/i;
const pct = (n) => (n == null ? '  —  ' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

/* 목적지별로 **몇 칸이 실측으로 고쳐졌는가** — 위 「실측 반영」 축이 쓴다.
   ⚠ rateDate 같은 비숫자 칸은 안 센다(요율 값이 아니다). */
let OV_CELLS = {};
let OV_HOTEL = {};
async function bootEngine() {
  const { loadOverrides, applyOverrides } = require('./_rate_overrides');
  const ov = await loadOverrides();
  Object.entries(ov.overrides || {}).forEach(([k, f]) => {
    OV_CELLS[k] = Object.values(f || {}).filter((v) => typeof v === 'number').length;
    OV_HOTEL[k] = typeof (f || {}).hotel_per_room === 'number';
  });
  const EXPOSE = '\n;try{window.__DR=destinationRates;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') throw new Error('엔진 로드 실패');
  console.log('요율 오버라이드 ' + applyOverrides(window.__DR, ov.overrides) + '칸 적용 — ' + ov.from + '\n');
  const doc = window.document;
  return (o) => {
    doc.getElementById('destination').value = o.dest;
    doc.getElementById('participants').value = String(o.pax);
    doc.getElementById('days').value = String(o.days);
    doc.getElementById('startDate').value = o.date;
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
      const e = doc.getElementById(id); if (e) e.checked = true;
    });
    return window.getBreakdownData();
  };
}

/* ── 대입해 볼 축들 ────────────────────────────────────────────────────────
   ⚠ 축은 **엔진이 실제로 계수를 걸고 있는 것**부터 넣는다. 계수가 없는 축에서 차이가
     나와도 고칠 자리가 없다(그건 「새 계수가 필요하다」는 뜻이라 훨씬 무거운 일이다). */
const AXES = [
  { key: '인원 규모', of: (r) => (r.pax < 30 ? '① ~29명' : r.pax < 100 ? '② 30~99명' : '③ 100명~'),
    note: 'PAX_TIERS·GROUND_*_TIERS가 여기에 계수를 건다' },
  { key: '여행 일수', of: (r) => (r.days <= 4 ? '① 3~4일' : r.days <= 5 ? '② 5일' : '③ 6일~'),
    note: 'SIGHT_DURATION_TIERS가 여기에 계수를 건다' },
  { key: '출발 월', of: (r) => { const m = Number(String(r.date).slice(5, 7)); return m <= 2 || m === 12 ? '① 겨울(12~2월)' : m <= 5 ? '② 봄(3~5월)' : m <= 8 ? '③ 여름(6~8월)' : '④ 가을(9~11월)'; },
    note: 'SEASON_CONFIG·피크 계수가 여기에 계수를 건다' },
  { key: '권역', of: (r) => (DATA.DEST_CLASSIFY[r.dest] || {}).region || '(없음)',
    note: '권역별로 요율의 정확도가 다를 수 있다' },
  { key: '문서 성격', of: (r) => (r.cost ? '① 원가 시트' : '② 고객용'),
    note: '이미 확인된 축 — 대조용으로 둔다' },
  { key: '1인당 규모', of: (r) => (r.answer < 1500000 ? '① ~150만' : r.answer < 2500000 ? '② 150~250만' : '③ 250만~'),
    note: '고가 여행일수록 우리가 못 담는 항목이 많은가' },
  { key: '좌석 등급', of: (r) => (r.answer >= 3000000 ? '① 비즈 의심(250만+)' : '② 일반'),
    note: '엔진은 이코노미로 계산한다 — 비즈 견적서면 구조적으로 싸게 나온다' },
  /* ⚠ **이 축이 핵심이다.** 「1인당 규모」가 1위로 나왔는데 그건 **원인이 아니라 결과**일
     수 있다 — 오차가 큰 건들이 우연히 저가일 뿐일지 모른다. 그걸 가르는 것이 이 축이다:
     실측으로 요율을 고친 목적지와 아직 온라인 추정치인 목적지를 갈라 본다.
     여기서 차이가 크면 처방이 아주 단순해진다 — **견적서를 더 넣으면 줄어든다.** */
  { key: '실측 반영', of: (r) => (r.ovCells >= 3 ? '① 3칸 이상 실측' : r.ovCells >= 1 ? '② 1~2칸' : '③ 전부 온라인 추정'),
    note: '**이 목적지 요율이 실측으로 고쳐졌는가** — 크면 처방은 「견적서를 더 넣어라」다' },
  /* ⚠ 「실측 반영」을 칸 수로만 세면 무딘 잣대다 — 어느 칸이냐가 다르기 때문이다.
     **호텔이 지상비의 26.7%로 가장 크다**(항목 사전). 저가 무리 안에서도 푸꾸옥·제주도는
     정확한데 마카오·보홀이 크게 틀리는 것을 보고 이 축을 넣었다. */
  { key: '호텔 실측', of: (r) => (r.hotelMeasured ? '① 호텔이 실측' : '② 호텔이 온라인 추정'),
    note: '**호텔은 지상비의 26.7%로 가장 큰 칸**이다 — 여기가 틀리면 총액이 통째로 틀어진다' },
];

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 · 축을 대입해 본다… (2~4분)\n');

  const engine = await bootEngine();
  const rows = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f);
    const pax = r.pax, days = r.dates && r.dates.days, date = r.dates && r.dates.departDate;
    if (!dn.key || !pax || !(days >= 2) || !date || !r.perPerson) continue;
    let bd;
    try { bd = engine({ dest: dn.key, pax, days, date }); } catch (e) { continue; }
    if (!bd || !bd.perPerson) continue;
    rows.push({
      file: f, dest: dn.key, pax, days, date, answer: r.perPerson,
      err: (bd.perPerson - r.perPerson) / r.perPerson,
      cost: COST_SHEET_RE.test(r.text || ''),
      ovCells: OV_CELLS[dn.key] || 0,
      hotelMeasured: !!OV_HOTEL[dn.key],
    });
  }
  const all = rows.map((x) => x.err);
  console.log('대조 ' + rows.length + '건 · 지금 중앙값 ' + pct(q(all, 0.5))
    + ' · 사분위 폭 ' + pct(q(all, 0.75) - q(all, 0.25))
    + ' · ±10% 안 ' + all.filter((n) => Math.abs(n) <= 0.1).length + '건\n');

  /* 축마다: 무리별 중앙값 · 무리 사이 최대 차이 */
  const ranked = [];
  AXES.forEach((ax) => {
    const g = {};
    rows.forEach((r) => { (g[ax.of(r)] = g[ax.of(r)] || []).push(r.err); });
    const groups = Object.entries(g).filter(([, v]) => v.length >= MIN_GROUP)
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (groups.length < 2) { console.log('■ ' + ax.key + ' — 무리가 ' + MIN_GROUP + '건 이상인 것이 하나뿐이라 못 잰다\n'); return; }
    const meds = groups.map(([, v]) => q(v, 0.5));
    const spread = Math.max.apply(null, meds) - Math.min.apply(null, meds);
    ranked.push({ ax, spread, groups });
    console.log('■ ' + ax.key + '   (' + ax.note + ')');
    groups.forEach(([name, v]) => {
      console.log('   ' + name.padEnd(16) + String(v.length).padStart(3) + '건   중앙값 '
        + pct(q(v, 0.5)).padStart(8) + '   폭 ' + pct(q(v, 0.75) - q(v, 0.25)).padStart(8));
    });
    console.log('   → **무리 사이 중앙값 차이 ' + pct(spread) + '**\n');
  });

  console.log('═'.repeat(92));
  console.log('오차를 가장 크게 가르는 축 (차이가 클수록 계수로 고칠 여지가 있다)');
  ranked.sort((a, b) => b.spread - a.spread).forEach((r, i) => {
    console.log('  ' + (i + 1) + '. ' + r.ax.key.padEnd(12) + pct(r.spread).padStart(9)
      + '   ' + r.ax.note);
  });
  console.log('\n⚠ 이건 **진단이지 처방이 아니다.** 축을 찾으면 그 계수를 고치고');
  console.log('  `sim_rate_change.js` / `sim_ancillary.js`로 전/후를 재 본 뒤에 넣는다.');
  console.log('⚠ 표본 ' + rows.length + '건이라 무리가 얇다 — 차이가 커도 **왜 그런지 설명이 되는 축**만 손댈 것.');
})();

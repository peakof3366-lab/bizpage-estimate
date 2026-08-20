/* ═══════════════════════════════════════════════════════════════════════════
   구간별 마진 시뮬레이터 (VJ) — **금액대마다 다르게 남길 때 오차가 어떻게 되나**
   ───────────────────────────────────────────────────────────────────────────
   대표 2026-08-20: 「견적이 올라갈수록 수익이 조금씩 낮춰지는 부분은 어쩔 수 없는 것
   같다. 수익률이 동일하면 비쌀수록 수익이 커져서 좋지만 고객들은 부담을 느낄 테니까.
   **이것도 구간별 정리가 어느 정도 필요하겠다.**」

   ⚠ **먼저 알아야 할 것 — 체감 곡선은 이미 있다.** 마진이 정액이라 금액이 오를수록
     비율이 저절로 내려간다. 실측(견적서 36건, 원가소계 기준):

         ~120만    13건   마진율 18.8%   오차 중앙 **-16.6%**  ← 여기만 벗어나 있다
         120~180만 16건   마진율 15.1%   오차 중앙 +5.6%
         180~250만  3건   마진율 12.3%   오차 중앙 +6.5%
         250만~     4건   마진율 13.2%   오차 중앙 +4.2%

     즉 「구간별 정리」의 실질은 **없던 것을 만드는 게 아니라, 우연히 만들어진 곡선을
     의도한 값으로 바꾸는 것**이다. 그리고 지금 벗어난 것은 **저가 구간 하나뿐**이다.
     ⚠ 그래서 전 구간에 같은 배수를 거는 것은 손해다 — 이미 맞는 세 구간까지 밀려난다
       (VI 실측: 전체 ×1.4 → 중앙값은 +3.5%로 맞는데 ±10% 안이 14 → 12건으로 줄었다).

   ⚠ **구간 기준은 「원가소계」다** — 마진·보험을 뺀 1인 금액.
     엔진 총액으로 끊으면 마진이 총액을 바꾸고 총액이 구간을 바꾸는 **순환**이 된다.
     그리고 「1인당 규모」 축이 1위로 나오는 것도 **정답지로 나눠서 생긴 착시**였다
     (audit_error_axes가 그렇게 적어 두고 있다). 여기서는 그 함정을 피한다.

   ⚠ **이 자가 못 재는 것**:
     · 저가 구간의 -16.6%가 **마진이 얇아서인지 요율이 낮아서인지 가르지 못한다.**
       그 구간 마진율은 이미 18.8%로 가장 높다 — 마진으로 메우면 **틀린 칸을 올리는 것**이
       될 수 있다. 실제로 그 구간에는 이웃 단가를 복사한 아오모리(-35.5%)·가고시마(-28.1%)가
       들어 있다. 요율을 아직 안 재 본 목적지들이다.
     · 고객이 그 금액을 받아들이는지(실주율)는 **여기 없다.** 대표만 아는 값이다.

   계획 파일(JSON) — 원가소계 상한과 마진 배수:
     [ { "max": 1200000, "mul": 1.4 },
       { "max": 1800000, "mul": 1.0 },
       { "max": null,    "mul": 1.0 } ]

   실행:
     node ai-loop/sim_margin_bands.js --plan ai-loop/plan_bands_a.json
     node ai-loop/sim_margin_bands.js            (계획 없이 = 지금 분포만 본다)
   ⚠ **아무것도 저장하지 않는다.** 읽기 전용이고 운영 DB를 건드리지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { corpusFiles } = require('./_corpus_files.js');
const { destFromName } = require('./_dest_from_name');
const { dedupeTrips, droppedNote } = require('./_same_trip');
const { loadOverrides, applyOverrides } = require('./_rate_overrides');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const PLAN_PATH = argOf('--plan');
const PLAN = PLAN_PATH
  ? JSON.parse(fs.readFileSync(path.isAbsolute(PLAN_PATH) ? PLAN_PATH : path.join(ROOT, PLAN_PATH), 'utf8'))
  : null;

/* 목표선은 역검증과 **같은 값**이어야 한다 — 두 곳에 적으면 갈라진다(결함 생성기 ①) */
const TARGET = 0.10;

const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const won = (n) => Number(Math.round(n)).toLocaleString();
const sortNum = (a) => a.slice().sort((x, y) => x - y);
const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = sortNum(arr); const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

async function bootEngine() {
  const ov = await loadOverrides();
  const EXPOSE = '\n;try{window.__DR=destinationRates;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});     /* 운영 DB에 행을 쌓지 않는다 */
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') throw new Error('엔진 로드 실패');
  console.log('요율 오버라이드 ' + applyOverrides(window.__DR, ov.overrides) + '칸 적용 — ' + ov.from);
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

/* 그 원가소계가 어느 구간인가. 계획이 없으면 배수 1(=지금 그대로).
   ⚠ **경계는 「미만」이다** — 120만 구간은 1,199,999까지고 1,200,000은 다음 구간이다.
     여기가 흔들리면 경계에 걸친 건이 조용히 다른 구간으로 넘어간다.
   ⚠ 계획에 없는 큰 금액은 **1로 둔다**(안 건드린다). 마지막 구간의 max를 null로 두면
     그 구간이 나머지를 전부 받는다. */
function mulFor(base, plan) {
  const P = plan === undefined ? PLAN : plan;
  if (!P) return 1;
  for (const b of P) {
    if (b.max == null || base < b.max) return Number(b.mul) || 1;
  }
  return 1;
}

/* 테스트에서 쓴다 — 구간 판정이 조용히 바뀌면 시뮬레이션 결과가 통째로 달라진다.
   ⚠ require만 해도 아래 IIFE가 도는 일이 없어야 한다(VA에서 못 박은 규칙). */
module.exports = { mulFor, TARGET };
if (require.main !== module) return;

function stats(errs) {
  const inBand = errs.filter((e) => Math.abs(e) <= TARGET).length;
  return {
    med: quantile(errs, 0.5),
    lo: quantile(errs, 0.25), hi: quantile(errs, 0.75),
    spread: quantile(errs, 0.75) - quantile(errs, 0.25),
    inBand,
    below: errs.filter((e) => e < -TARGET).length,
    above: errs.filter((e) => e > TARGET).length,
  };
}
const line = (name, s, n) => console.log('  ' + name.padEnd(8)
  + '중앙값 ' + pct(s.med).padStart(7)
  + '   사분위 ' + pct(s.lo) + ' ~ ' + pct(s.hi)
  + '   폭 ' + pct(s.spread).padStart(7)
  + '   목표 안 ' + String(s.inBand).padStart(2) + '/' + n
  + '   🔴아래 ' + String(s.below).padStart(2) + ' · 🟡위 ' + String(s.above).padStart(2));

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  const run = await bootEngine();
  console.log('견적서 ' + files.length + '건 추출 중… (2~4분)\n');

  const trips = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f, r.text);
    const pax = r.pax, days = r.dates && r.dates.days, date = r.dates && r.dates.departDate;
    if (!dn.key || !pax || !(days >= 2) || !date || !r.perPerson) continue;
    let bd;
    try { bd = run({ dest: dn.key, pax, days, date }); } catch (e) { continue; }
    if (!bd || !bd.perPerson) continue;
    /* ⚠ 마진 줄과 보험 줄을 **이름으로** 고른다 — 엔진이 그 이름으로 렌더하기 때문이다.
       이름이 바뀌면 여기서 조용히 0이 되므로 아래에서 반드시 검산한다. */
    const per = (re) => (bd.rows || []).filter((x) => re.test(x.name))
      .reduce((s, x) => s + x.amount, 0) / pax;
    const mar = per(/수익/), ins = per(/보험/);
    trips.push({
      file: f, dest: dn.key, pax, days, date, answer: r.perPerson,
      eng: bd.perPerson, mar, ins, base: bd.perPerson - mar - ins,
    });
  }
  const ded = dedupeTrips(trips, (t) => ({
    dest: t.dest, pax: t.pax, days: t.days, date: t.date, answer: t.answer, file: t.file,
  }));
  const note = droppedNote(ded.dropped);
  if (note) console.log(note + '\n');
  const rows = ded.kept;

  /* ⚠ **마진 줄을 못 찾았으면 여기서 멈춘다.** 0으로 두고 계속하면 「구간별로 바꿔도
     아무것도 안 변한다」는 거짓 결론이 나온다(결함 생성기 ②·③). */
  const noMar = rows.filter((r) => !(r.mar > 0)).length;
  if (noMar) {
    console.log('❌ 마진 줄을 못 읽은 건이 ' + noMar + '건 있습니다 — 엔진의 줄 이름이 바뀌었는지 보세요.');
    process.exit(1);
  }

  console.log('대조 ' + rows.length + '건 · 구간 기준은 **원가소계**(마진·보험 뺀 1인 금액)\n');

  /* ── 지금 분포: 구간마다 몇 건이고, 얼마를 남기고 있고, 오차가 어디 있나 ── */
  const EDGES = PLAN ? PLAN.map((b) => b.max) : [1200000, 1800000, 2500000, null];
  let lo = 0;
  console.log('원가소계 구간        건수   지금 마진액    마진율   오차 중앙   바꾼 뒤 배수');
  EDGES.forEach((hi) => {
    const g = rows.filter((r) => r.base >= lo && (hi == null || r.base < hi));
    if (g.length) {
      const es = g.map((r) => (r.eng - r.answer) / r.answer);
      const marAvg = g.reduce((s, r) => s + r.mar, 0) / g.length;
      const rateAvg = g.reduce((s, r) => s + r.mar / r.eng, 0) / g.length;
      console.log((won(lo) + ' ~ ' + (hi == null ? '' : won(hi))).padEnd(22)
        + String(g.length).padStart(4) + won(marAvg).padStart(13)
        + ((rateAvg * 100).toFixed(1) + '%').padStart(9)
        + pct(quantile(es, 0.5)).padStart(11)
        + ('×' + mulFor(lo).toFixed(2)).padStart(14));
    }
    lo = hi;
  });

  const before = rows.map((r) => (r.eng - r.answer) / r.answer);
  const after = rows.map((r) => {
    const eng2 = r.base + r.ins + r.mar * mulFor(r.base);
    return (eng2 - r.answer) / r.answer;
  });

  console.log('\n' + '─'.repeat(104));
  line('지금', stats(before), rows.length);
  if (PLAN) line('바꾼 뒤', stats(after), rows.length);
  console.log('  목표: **±10% 안, 틀리면 높은 쪽**(중앙값 +3~5%) — 2026-08-20 대표 결정');

  if (PLAN) {
    const b = stats(before), a = stats(after);
    console.log('\n판정:');
    /* ⚠ **중앙값만 보지 않는다.** 중앙값이 0에 가까워지면서 폭이 벌어지면 그건 개선이
       아니라 우연히 총액을 맞춘 것이다(SD가 경고한 그 상태, VB에서 실제로 겪었다). */
    const bandUp = a.inBand > b.inBand, bandSame = a.inBand === b.inBand;
    const tighter = a.spread <= b.spread;
    if (bandUp && tighter) console.log('  ✅ 목표 안이 늘고 폭도 안 벌어졌다.');
    else if (bandUp) console.log('  🟡 목표 안은 늘었는데 **폭이 벌어졌다** — 우연히 맞은 것인지 봐야 한다.');
    else if (bandSame && tighter) console.log('  🟡 목표 안은 그대로인데 폭은 좁아졌다.');
    else console.log('  ❌ 목표 안이 줄었다. 되돌릴 것.');
    console.log('  목표 안: ' + b.inBand + '건 → ' + a.inBand + '건'
      + '   · 🔴아래: ' + b.below + ' → ' + a.below + '   · 🟡위: ' + b.above + ' → ' + a.above);

    /* ⚠ 마진을 올리면 **현지 수익금도 같이 오른다**(1 : 0.9로 묶여 있다, VI).
       그 사실을 여기서도 말한다 — 「우리가 그만큼 더 남는다」로 읽히면 안 된다. */
    const addTotal = rows.reduce((s, r) => s + r.mar * (mulFor(r.base) - 1), 0) / rows.length;
    if (Math.abs(addTotal) > 1) {
      console.log('\n⚠ 1인 평균 ' + won(addTotal) + '원이 더 붙는다. 그런데 **그중 약 47%는 현지 수익금**이다');
      console.log('  — 엔진이 「💼 ENBT 수익」과 「🏷️ 현지 수익금」을 같은 값에서 1 : 0.9로 만든다.');
      console.log('  우리 몫만 올리려면 그 둘을 떼어내는 구조 변경이 먼저다(결정대기열 0-d).');
    }
  }

  console.log('\n⚠ 이 자가 못 재는 것 — **저가 구간의 -16.6%가 마진 문제인지 요율 문제인지**는');
  console.log('  가르지 못한다. 그 구간 마진율은 이미 18.8%로 가장 높고, 안에는 이웃 단가를');
  console.log('  복사한 아오모리(-35.5%)·가고시마(-28.1%)가 들어 있다. 마진으로 메우면');
  console.log('  **틀린 칸을 올리는 것**이 될 수 있다. 그리고 실주율은 여기 없다 — 대표만 아는 값이다.');
})();

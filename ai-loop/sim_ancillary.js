/* ═══════════════════════════════════════════════════════════════════════════
   부대비용 계수 고르기 (TP) — **추정이 아니라 쓸어 보고 고른다**
   ───────────────────────────────────────────────────────────────────────────
   `data.js`의 ANCILLARY.rate 하나가 고객 견적 금액을 통째로 움직인다. 그 값을
   눈대중으로 정하면 「그럴듯한 숫자」가 고객에게 나가는 금액이 된다. 그래서 0~25%를
   쓸어 보고 46건 코퍼스에 대고 가장 좋은 값을 고른다.

   ⚠ **정답지는 고객용 견적서다**(TO에서 갈랐다). 우리 가견적도 고객에게 나가는 값이라
     성격이 같다. 원가 시트(홀세일러가 우리에게 주는 값)나 지상비 견적서(항공 별도)와
     견주면 성격이 다른 것을 비교하게 된다 — 실측으로 폭이 38.9% / 34.0%였고,
     고객용만 보면 **8.5%**다.
   ⚠ **중앙값이 아니라 사분위 폭으로 고른다.** 중앙값은 계수 하나로 얼마든지 옮길 수
     있어서, 중앙값만 보고 고르면 폭이 벌어지는 것을 놓친다(TN에서 실제로 그랬다).
     그래서 「중앙값을 0에 붙이되 폭이 안 벌어지는」 값을 고른다.
   ⚠ 읽기 전용이다 — data.js를 고치지 않는다(메모리 위에서만 바꿔 본다).

   실행: node ai-loop/sim_ancillary.js
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

const COST_SHEET_RE = /HNT\s*수익|권장\s*수익|입금가|\bFOC\b/i;
const RATES = [0, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.25];

const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const q = (arr, p) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((x, y) => x - y); const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

async function bootEngine() {
  /* ⚠ **운영 요율을 얹고 고른다**(TR). data.js 기본값으로 계수를 고르면, 고객이 실제로
     겪는 조합(오버라이드가 얹힌 요율 + 이 계수)에서는 다른 값이 최선일 수 있다. */
  const { loadOverrides, applyOverrides } = require('./_rate_overrides');
  const ov = await loadOverrides();
  const EXPOSE = '\n;try{window.__ANC=ANCILLARY;window.__DR=destinationRates;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});      /* 운영 DB에 행을 쌓지 않는다 */
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') throw new Error('엔진 로드 실패');
  if (!window.__ANC) throw new Error('ANCILLARY를 못 찾았다 — data.js를 확인할 것');
  console.log('요율 오버라이드 ' + applyOverrides(window.__DR, ov.overrides) + '칸 적용 — ' + ov.from);
  const doc = window.document;
  return {
    setRate: (v) => { window.__ANC.rate = v; },
    run: (o) => {
      doc.getElementById('destination').value = o.dest;
      doc.getElementById('participants').value = String(o.pax);
      doc.getElementById('days').value = String(o.days);
      doc.getElementById('startDate').value = o.date;
      ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
        const e = doc.getElementById(id); if (e) e.checked = true;
      });
      return window.getBreakdownData();
    },
  };
}

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 추출 중… (2~4분)');

  const cases = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f);
    const pax = r.pax, days = r.dates && r.dates.days, date = r.dates && r.dates.departDate;
    if (!dn.key || !pax || !(days >= 2) || !date || !r.perPerson) continue;
    cases.push({
      file: f, dest: dn.key, pax, days, date, answer: r.perPerson,
      cost: COST_SHEET_RE.test(r.text || ''),
      hasAir: (r.values || {}).airfare != null,
    });
  }
  const target = cases.filter((c) => !c.cost);          /* 고객용 견적서 = 정답지 */
  console.log('대조 ' + cases.length + '건 · 그중 **고객용 견적서 ' + target.length + '건**이 정답지다\n');

  const eng = await bootEngine();
  console.log('계수    ┃ 고객용(정답지)                                 ┃ 전체(참고)');
  console.log('        ┃ 중앙값   사분위폭  |오차|중앙   ±5%  ±10%   ┃ 중앙값   사분위폭');
  console.log('━'.repeat(96));
  const results = [];
  for (const rate of RATES) {
    eng.setRate(rate);
    const errAll = [], errTgt = [];
    cases.forEach((c) => {
      const bd = eng.run(c);
      if (!bd || !bd.perPerson) return;
      const e = (bd.perPerson - c.answer) / c.answer;
      errAll.push(e);
      if (!c.cost) errTgt.push(e);
    });
    const med = q(errTgt, 0.5), spread = q(errTgt, 0.75) - q(errTgt, 0.25);
    /* **오차의 크기**를 재는 자 — 부호를 지운 중앙값이다. 「±몇 % 안」이 우리가 약속할
       숫자이므로, 고르는 기준도 여기여야 한다. */
    const mae = q(errTgt.map(Math.abs), 0.5);
    const w5 = errTgt.filter((n) => Math.abs(n) <= 0.05).length;
    const w10 = errTgt.filter((n) => Math.abs(n) <= 0.10).length;
    results.push({ rate, med, spread, mae, w5, w10 });
    console.log((rate * 100).toFixed(0).padStart(4) + '%   ┃ '
      + pct(med).padStart(7) + '   ' + pct(spread).padStart(7) + '  ' + pct(mae).padStart(7) + '   '
      + String(w5).padStart(2) + '건  ' + String(w10).padStart(2) + '건'
      + '   ┃ ' + pct(q(errAll, 0.5)).padStart(7) + '   '
      + pct(q(errAll, 0.75) - q(errAll, 0.25)).padStart(7));
  }

  /* ── 고르기 ────────────────────────────────────────────────────────────────
     ⚠ 처음에 「사분위 폭이 안 벌어지는 값」으로 골랐다가 **0%가 뽑혔다** — 아무것도
       안 하는 것이 최선이라는 답이 나온 것이다. 규칙이 틀렸다:
       비율로 얹는 계수는 지상비가 큰 건에 더 많이 붙으므로 **폭이 커지는 것이 당연하다.**
       폭은 「계수가 틀렸다」는 신호가 아니라 계수의 성질 자체다.
     → 우리가 고객에게 약속하는 것은 **「±N% 안에 들어온다」**이므로, 고르는 잣대도
       그것이어야 한다: **±10% 안 건수**를 최대로, 같으면 **|오차| 중앙값**이 작은 쪽.
     ⚠ 그래도 폭은 함께 본다 — 폭이 **배로** 뛰면 그건 계수가 아니라 다른 것이 잘못된
       것이다(TN의 「틀린 칸을 올려 우연히 총액을 맞추는 상태」). 그 경우만 거른다. */
  const base = results.find((r) => r.rate === 0);
  const sane = results.filter((r) => r.spread <= base.spread * 2);
  const best = sane.sort((a, b) => (b.w10 - a.w10) || (a.mae - b.mae))[0];
  console.log('━'.repeat(96));
  console.log('고르는 잣대: **±10% 안 건수** 최대 → 같으면 |오차| 중앙값이 작은 쪽.');
  console.log('  (폭이 0% 때의 2배를 넘으면 그 값은 뺀다 — 계수가 아니라 다른 것이 잘못된 신호다.)');
  console.log('\n✅ 고른 값: **' + (best.rate * 100).toFixed(0) + '%**'
    + '   중앙값 ' + pct(best.med) + ' · |오차| 중앙 ' + pct(best.mae)
    + ' · ±5% ' + best.w5 + '건 · ±10% ' + best.w10 + '건 (고객용 ' + target.length + '건 중)');
  console.log('   계수 0%였을 때: |오차| 중앙 ' + pct(base.mae)
    + ' · ±5% ' + base.w5 + '건 · ±10% ' + base.w10 + '건');
  const cur = Number(require(path.join(ROOT, 'data.js')).ANCILLARY.rate);
  if (Math.abs(cur - best.rate) > 0.001) {
    console.log('⚠ 지금 data.js의 값은 ' + (cur * 100).toFixed(0) + '%다 — 고른 값과 다르다.');
  } else {
    console.log('   data.js의 값과 같다.');
  }
})();

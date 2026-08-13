/* ═══════════════════════════════════════════════════════════════════════════
   요율 변경 시뮬레이터 (TM) — **고치기 전에 46건으로 재 본다**
   ───────────────────────────────────────────────────────────────────────────
   요율 한 칸을 바꾸면 그 목적지의 고객 견적이 즉시 바뀐다. 그래서 이 저장소의 규칙은
   「계산식을 바꿨으면 금액 영향을 실측한다 — **불변이라고 추측하지 말 것**」이다.
   이 자가 그 실측을 요율 쪽에 대해서 한다.

   재는 법 — 엔진을 두 번 띄운다. 한 번은 지금 요율로, 한 번은 바꾼 요율로.
   같은 46건 코퍼스에 대고 [엔진 1인당 vs 견적서 1인당]의 분포가 어떻게 움직이는지 본다.
   **중앙값만 보지 않는다** — 중앙값이 0에 가까워지면서 사분위가 벌어지면 그건 개선이
   아니라 **틀린 칸을 올려 우연히 총액을 맞춘 것**이다(SD에서 경고한 그 상태).

   변경안은 `--plan` 파일(JSON)로 준다:
     { "meal_per_person": {"mul": 2.5}, "fuel_surcharge": {"mul": 0.5} }
     { "푸꾸옥": { "meal_per_person": {"set": 58037} } }        목적지별로도 가능
   ⚠ **아무것도 저장하지 않는다.** 이 스크립트는 읽기 전용이고 운영 DB를 건드리지 않는다.

   실행:
     node ai-loop/sim_rate_change.js --plan ai-loop/plan_meal_fuel.json
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const PLAN_PATH = argOf('--plan');
const { destFromName } = require('./_dest_from_name');

if (!PLAN_PATH) { console.log('사용법: node ai-loop/sim_rate_change.js --plan <계획.json>'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(path.isAbsolute(PLAN_PATH) ? PLAN_PATH : path.join(ROOT, PLAN_PATH), 'utf8'));

const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const sortNum = (a) => a.slice().sort((x, y) => x - y);
const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = sortNum(arr); const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

/* 계획을 요율 배열에 얹는다. **엔진을 띄우기 전에** 한다 — 띄운 뒤에 고치면
   이미 계산된 값이 남아 어느 쪽 결과인지 알 수 없다. */
function applyPlan(destinationRates) {
  const touched = [];
  destinationRates.forEach((d) => {
    const perDest = plan[d.destination_key] || null;
    Object.keys(plan).forEach((k) => {
      if (plan[k] && typeof plan[k] === 'object' && !('mul' in plan[k]) && !('set' in plan[k])) return; /* 목적지 블록 */
      const rule = plan[k];
      if (!(k in d)) return;
      const before = Number(d[k]) || 0;
      const after = 'set' in rule ? rule.set : Math.round(before * rule.mul);
      if (after !== before) { d[k] = after; touched.push(d.destination_key + '.' + k); }
    });
    if (perDest) Object.keys(perDest).forEach((k) => {
      if (!(k in d)) return;
      const before = Number(d[k]) || 0;
      const rule = perDest[k];
      const after = 'set' in rule ? rule.set : Math.round(before * rule.mul);
      if (after !== before) { d[k] = after; touched.push(d.destination_key + '.' + k); }
    });
  });
  return touched;
}

async function bootEngine(mutate) {
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
  let touched = [];
  if (mutate) touched = applyPlan(window.__DR);
  const doc = window.document;
  const run = (o) => {
    doc.getElementById('destination').value = o.dest;
    doc.getElementById('participants').value = String(o.pax);
    doc.getElementById('days').value = String(o.days);
    doc.getElementById('startDate').value = o.date;
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
      const e = doc.getElementById(id); if (e) e.checked = true;
    });
    return window.getBreakdownData();
  };
  return { run, touched };
}

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 추출 중… (2~4분)');

  const cases = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f);
    const pax = r.pax, days = r.dates && r.dates.days, date = r.dates && r.dates.departDate;
    if (!dn.key || !pax || !(days >= 2) || !date || !r.perPerson) continue;
    cases.push({ file: f, dest: dn.key, pax, days, date, answer: r.perPerson });
  }
  console.log('대조 가능한 견적서 ' + cases.length + '건\n');

  const before = await bootEngine(false);
  const after = await bootEngine(true);
  console.log('바꾼 칸 ' + after.touched.length + '개 (' + [...new Set(after.touched.map((t) => t.split('.')[1]))].join(' · ') + ')\n');

  const rows = cases.map((c) => {
    const b = before.run(c), a = after.run(c);
    return {
      ...c,
      errBefore: (b.perPerson - c.answer) / c.answer,
      errAfter: (a.perPerson - c.answer) / c.answer,
      engBefore: b.perPerson, engAfter: a.perPerson,
    };
  });

  console.log('목적지        인원 일수  견적서 1인당      지금 엔진    바꾼 뒤 엔진     지금 오차   바꾼 뒤');
  console.log('─'.repeat(104));
  rows.sort((x, y) => x.errBefore - y.errBefore).forEach((d) => {
    const better = Math.abs(d.errAfter) < Math.abs(d.errBefore);
    console.log(d.dest.padEnd(12) + String(d.pax).padStart(5) + String(d.days).padStart(4)
      + Number(d.answer).toLocaleString().padStart(14)
      + Number(d.engBefore).toLocaleString().padStart(14)
      + Number(d.engAfter).toLocaleString().padStart(14)
      + pct(d.errBefore).padStart(11) + pct(d.errAfter).padStart(10)
      + (better ? '  ↑' : '  ↓'));
  });

  const eb = rows.map((r) => r.errBefore), ea = rows.map((r) => r.errAfter);
  const within = (a, t) => a.filter((n) => Math.abs(n) <= t).length;
  const spread = (a) => quantile(a, 0.75) - quantile(a, 0.25);
  const line = (name, a) => console.log('  ' + name.padEnd(8)
    + '중앙값 ' + pct(quantile(a, 0.5)).padStart(7)
    + '   사분위 ' + pct(quantile(a, 0.25)) + ' ~ ' + pct(quantile(a, 0.75))
    + '   폭 ' + pct(spread(a)).padStart(7)
    + '   ±5% ' + within(a, 0.05) + '건 · ±10% ' + within(a, 0.10) + '건 · ±20% ' + within(a, 0.20) + '건');

  console.log('─'.repeat(104));
  line('지금', eb);
  line('바꾼 뒤', ea);

  /* ⚠ **중앙값만 보면 속는다.** 중앙값이 0에 가까워지면서 사분위 폭이 벌어지면
     그건 개선이 아니라 「틀린 칸을 올려 우연히 총액을 맞춘 것」이다(SD의 경고). */
  console.log('\n판정:');
  const medBetter = Math.abs(quantile(ea, 0.5)) < Math.abs(quantile(eb, 0.5));
  const spreadBetter = spread(ea) < spread(eb);
  if (medBetter && spreadBetter) console.log('  ✅ 중앙값도 0에 가까워지고 **사분위 폭도 좁아졌다** — 진짜 개선이다.');
  else if (medBetter && !spreadBetter) console.log('  ⚠ 중앙값은 좋아졌는데 **폭이 벌어졌다** — 틀린 칸을 올려 총액만 맞춘 것일 수 있다.');
  else if (!medBetter && spreadBetter) console.log('  ⚠ 폭은 좁아졌는데 중앙값이 멀어졌다 — 계통 편향이 남아 있다(다른 칸을 봐야 한다).');
  else console.log('  ❌ 둘 다 나빠졌다. 되돌릴 것.');
  console.log('  ±10% 안: ' + within(eb, 0.10) + '건 → ' + within(ea, 0.10) + '건');
})();

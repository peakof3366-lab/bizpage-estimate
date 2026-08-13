/* ═══════════════════════════════════════════════════════════════════════════
   오차의 출처 (TL 후속) — **엔진이 싼 이유가 「칸이 없는 항목」인가**
   ───────────────────────────────────────────────────────────────────────────
   역검증(backtest_quotes)은 「엔진이 견적서보다 중앙값 9.1% 싸다」까지만 말한다.
   그런데 **왜** 싼지는 말하지 않는다. 두 가지가 완전히 다른 처방을 부른다:

     ① 요율 단가가 낮다        → 그 목적지 단가를 올린다
     ② 요율표에 **칸이 없는 항목**이 있다 → 단가를 올리면 **틀린 칸을 올려 우연히
                                총액을 맞추는 상태**가 된다(SD에서 이미 경고한 자리)

   항목 사전(audit_item_taxonomy)이 재 보니 견적서 돈의 **12.4%가 우리 9칸 어디에도
   안 들어간다**(기관 섭외비·통역비·국내수송·싱글차지·미주 고유명사 라벨…).
   그 12.4%가 9.1%를 설명하면 답은 ②다.

   재는 법 — 견적서마다 셋을 나란히 둔다:
     견적서 1인당      정답지
     엔진 1인당        지금 우리가 내는 값
     미분류 1인당      그 견적서에서 어느 칸에도 안 들어간 돈 ÷ 인원
   그리고 「엔진 + 미분류」가 정답지에 얼마나 가까워지는지 본다.

   ⚠ **이건 처방이 아니라 진단이다.** 미분류 금액을 그대로 더하는 것은 실제 계산이 아니다
     (엔진은 이미 마진·보험을 얹고, 견적서 판매가에는 홀세일러 마진이 들어 있다).
     여기서 보는 것은 **크기와 방향**뿐이다 — 그것만으로 ①과 ②가 갈린다.
   ⚠ 엔진은 jsdom으로 띄운다(backtest_quotes와 같은 방식). 네트워크를 막는다 —
     안 막으면 운영 DB의 site_events에 행이 쌓인다.

   실행: node ai-loop/audit_gap_source.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const { destFromName } = require('./_dest_from_name');

/* 우리 요율표가 실제로 가진 칸 — 이 밖의 돈은 엔진이 낼 수 없다.
   ⚠ audit_item_taxonomy.js와 **같은 목록**이어야 한다. 두 도구가 다른 말을 하면
     어느 쪽을 믿을지 알 수 없다(결함 생성기 ①). */
const RATE_CATS = ['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight', 'golf'];

const pct = (n) => (n == null ? '  —  ' : ((n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%'));
const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());
const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function bootEngine() {
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js');
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});          /* 운영 DB에 행을 쌓지 않는다 */
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') throw new Error('엔진 로드 실패');
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

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 · 엔진 대조 중… (2~4분)\n');

  const engine = await bootEngine();
  const rows = [];
  const skipped = {};
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }

    /* ⚠ `destFromName`은 **객체**를 돌려준다({key, why}). 처음에 그대로 썼다가
       select에 「[object Object]」가 들어가 **29건 전부가 조용히 실패**했다
       (대조 0건인데 오류 메시지는 하나도 없었다 — continue가 삼켰다). */
    const dn = destFromName(f);
    const dest = dn.key;
    const pax = r.pax, days = r.dates && r.dates.days, date = r.dates && r.dates.departDate;
    const answer = r.perPerson || null;
    const why = !dest ? (dn.why || '목적지') : !pax ? '인원' : !(days >= 2) ? '일수' : !date ? '출발일'
      : !answer ? '1인당 금액' : null;
    if (why) { skipped[why] = (skipped[why] || 0) + 1; continue; }

    const cands = (r.candidates || []).filter((c) => !c.unconvertible);
    const unclassified = cands
      .filter((c) => RATE_CATS.indexOf(c.category) < 0)
      .reduce((n, c) => n + (c.total || 0), 0);
    const denom = r.grandTotal || r.itemsTotal || 0;

    /* ⚠ 엔진이 못 돌면 **조용히 넘기지 않는다.** 왜 못 돌았는지 세어서 마지막에 밝힌다 —
       조용한 continue 하나 때문에 이 도구가 「대조 0건」을 아무 설명 없이 뱉었다. */
    let bd;
    try { bd = engine({ dest, pax, days, date }); }
    catch (e) { skipped['엔진 오류: ' + String(e.message).slice(0, 40)] = (skipped['엔진 오류'] || 0) + 1; continue; }
    if (!bd || !bd.perPerson) { skipped['엔진이 값을 못 냄(' + dest + ')'] = (skipped['엔진이 값을 못 냄(' + dest + ')'] || 0) + 1; continue; }

    const gapPer = unclassified / pax;
    rows.push({
      file: f, dest, pax, days, date,
      answer, engine: bd.perPerson, gapPer,
      err: (bd.perPerson - answer) / answer,
      errWithGap: (bd.perPerson + gapPer - answer) / answer,
      unclassRatio: denom ? unclassified / denom : null,
    });
  }

  /* ── 표 ── */
  console.log('목적지        인원 일수  견적서 1인당    엔진 1인당   미분류 1인당    지금 오차  미분류 더하면');
  console.log('─'.repeat(112));
  rows.sort((a, b) => a.err - b.err).forEach((d) => {
    console.log(String(d.dest).padEnd(12) + String(d.pax).padStart(5) + String(d.days).padStart(4) + '  '
      + won(d.answer).padStart(12) + won(d.engine).padStart(13) + won(d.gapPer).padStart(13)
      + pct(d.err).padStart(11) + pct(d.errWithGap).padStart(13) + '  ' + d.file.slice(0, 30));
  });

  const errs = rows.map((r) => r.err);
  const errs2 = rows.map((r) => r.errWithGap);
  const within = (a, t) => a.filter((n) => Math.abs(n) <= t).length;
  console.log('─'.repeat(112));
  console.log('대조 ' + rows.length + '건');
  console.log('  지금        중앙값 ' + pct(median(errs)) + '   ±5% 안 ' + within(errs, 0.05)
    + '건 · ±10% 안 ' + within(errs, 0.10) + '건 · ±20% 안 ' + within(errs, 0.20) + '건');
  console.log('  미분류 더하면 중앙값 ' + pct(median(errs2)) + '   ±5% 안 ' + within(errs2, 0.05)
    + '건 · ±10% 안 ' + within(errs2, 0.10) + '건 · ±20% 안 ' + within(errs2, 0.20) + '건');

  const gapShare = rows.map((r) => r.unclassRatio).filter((n) => n != null);
  console.log('\n  견적서 총계 중 **어느 칸에도 안 들어가는 돈**: 중앙값 '
    + (median(gapShare) * 100).toFixed(1) + '%');
  console.log('  미분류 1인당 중앙값 ' + won(median(rows.map((r) => r.gapPer))) + '원');

  /* ── 진단 ── 중앙값이 0에 가까워지면 원인은 「칸이 없는 항목」이다 */
  const before = Math.abs(median(errs)), after = Math.abs(median(errs2));
  console.log('\n' + '─'.repeat(112));
  if (after < before) {
    console.log('진단: 미분류 금액을 얹으면 오차 중앙값이 ' + pct(median(errs)) + ' → ' + pct(median(errs2))
      + ' 로 움직인다.');
    console.log('      → 엔진이 싼 이유의 상당 부분이 **요율표에 칸이 없는 항목**이다.');
    console.log('      → 단가를 올리는 것이 아니라 **그 항목을 다룰 자리**를 만들어야 한다.');
  } else {
    console.log('진단: 미분류를 더해도 중앙값이 0에 가까워지지 않는다 — 원인은 칸이 아니라 **단가** 쪽이다.');
  }
  console.log('\n제외 ' + Object.entries(skipped).map(([k, v]) => k + ' ' + v + '건').join(' · '));
})();

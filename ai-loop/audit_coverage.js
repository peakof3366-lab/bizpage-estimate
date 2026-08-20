/* ═══════════════════════════════════════════════════════════════════════════
   설명 커버리지 감사 (SH) — **우리가 읽은 줄이 견적서 총계의 몇 %를 설명하는가**
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 지금까지의 자는 전부 **빈칸**을 셌다("9칸 중 몇 칸을 채웠나").
   그런데 채운 값이 맞는지는 다른 문제이고, 특히 **덜 읽은 것**은 아무도 못 본다.
   문서 자체 검산(L4 reconcile)에도 「뽑은 줄 합계 ≤ 총계」라는 **한쪽만 보는** 검사밖에
   없다 — 두 번 센 것은 잡지만 **못 읽은 것은 통과**시킨다.

   실제로 그래서 놓쳤다: SD에서 삿포로 135명 건을 손으로 따져 보다가 **우리가 읽은
   항목을 다 더해도 1인 1,163,570인데 입금가는 1,549,505**라는 것을 우연히 발견했다.
   385,935원(25%)이 설명되지 않는데, 요율표에 아예 칸이 없는 항목이 있다는 뜻이었다.
   그 상태에서 요율을 올리면 **틀린 칸을 올려 우연히 총액을 맞추는** 상태가 된다.

   그래서 문서 총계를 채점 기준으로 삼아 두 가지를 잰다:
     ① **줄 커버리지**   = 검산줄 총액 합 ÷ 총계   → L1·L2가 표를 얼마나 잡았나
     ② **분류 커버리지** = 분류된 줄 총액 합 ÷ 총계 → L3·L3.5가 얼마나 이름을 붙였나
   ①이 낮으면 표를 못 읽은 것이고, ①은 높은데 ②가 낮으면 읽고도 이름을 못 붙인 것이다.
   **고치는 방법이 완전히 다르므로 갈라서 잰다.**

   ⚠ **100%가 목표가 아니다.** 총계에는 마진·수익이 들어 있고 우리 줄에는 없다. 그래서
     이 숫자는 절대값이 아니라 **전/후 비교와 이상치 찾기**에 쓴다. 낮은 것부터 보면
     "이 견적서는 우리가 절반도 못 읽고 있다"가 곧바로 드러난다.
   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.

   실행:
     node ai-loop/audit_coverage.js
     node ai-loop/audit_coverage.js --json out.json   (전/후 대조용)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const JSON_OUT = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const CORPUS = argv.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1)[0]
  || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

/* 이 아래로 떨어지면 "덜 읽었다"고 본다 — 마진을 넉넉히 감안해도 총계의 절반을
   설명하지 못하면 그 견적서는 우리가 제대로 못 읽고 있는 것이다. */
const LOW_COVERAGE = 0.5;

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const rows = [];
  const errors = [];
  const noTotal = [];

  for (const f of files) {
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 90) }); continue; }

    const grand = r.grandTotal || r.itemsTotal || null;
    const cands = r.candidates || [];
    /* ⚠ 환산하지 못한 외화 줄은 **원화가 아니다.** 합에 넣으면 자릿수가 뒤섞여
       커버리지가 엉뚱하게 낮아진다(¥2,000을 2,000원으로 더하는 꼴). 따로 센다. */
    const usable = cands.filter((c) => !c.unconvertible);
    const stuck = cands.length - usable.length;
    if (!grand) { noTotal.push({ file: f, rows: cands.length }); continue; }

    const rowSum = usable.reduce((n, c) => n + (c.total || 0), 0);
    const classSum = usable.filter((c) => c.category).reduce((n, c) => n + (c.total || 0), 0);
    rows.push({
      file: f, grand, pax: r.pax || null,
      rows: cands.length, stuck,
      rowCov: rowSum / grand, classCov: classSum / grand,
      rowSum, classSum,
    });
  }

  const pct = (n) => (n * 100).toFixed(0) + '%';
  const med = (arr) => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  console.log('════ 설명 커버리지 감사 ════\n');
  console.log('총계를 읽은 견적서 ' + rows.length + '건 / ' + files.length + '건');
  console.log('  줄 커버리지  (검산줄 합 ÷ 총계)  중앙값 ' + pct(med(rows.map((r) => r.rowCov))));
  console.log('  분류 커버리지(분류된 줄 ÷ 총계)  중앙값 ' + pct(med(rows.map((r) => r.classCov))));
  console.log('  ⚠ 100%가 목표가 아니다 — 총계에는 마진·수익이 들어 있고 우리 줄에는 없다.\n');

  const low = rows.filter((r) => r.rowCov < LOW_COVERAGE).sort((a, b) => a.rowCov - b.rowCov);
  if (low.length) {
    console.log('🔴 총계의 절반도 설명하지 못하는 ' + low.length + '건 — **표를 못 읽고 있다**');
    console.log('─'.repeat(96));
    console.log('줄커버 분류커버  검산줄  못쓴줄        총계          읽은합  파일');
    console.log('─'.repeat(96));
    low.forEach((r) => console.log(
      pct(r.rowCov).padStart(5) + ' ' + pct(r.classCov).padStart(7) + '  ' +
      String(r.rows).padStart(5) + '  ' + String(r.stuck).padStart(5) + '  ' +
      String(r.grand.toLocaleString()).padStart(13) + '  ' +
      String(Math.round(r.rowSum).toLocaleString()).padStart(13) + '  ' + r.file.slice(0, 34)));
    console.log('─'.repeat(96));
  }

  /* 줄은 잡았는데 이름을 못 붙인 것 — 고치는 자리가 다르다(어휘·구분 열) */
  const named = rows.filter((r) => r.rowCov >= LOW_COVERAGE && r.rowCov - r.classCov > 0.1)
    .sort((a, b) => (b.rowCov - b.classCov) - (a.rowCov - a.classCov));
  if (named.length) {
    console.log('\n🟡 줄은 읽었는데 **이름을 못 붙인** ' + named.length + '건 (차이 10%p 이상)');
    console.log('─'.repeat(80));
    named.forEach((r) => console.log(
      '  줄 ' + pct(r.rowCov).padStart(5) + ' → 분류 ' + pct(r.classCov).padStart(5) +
      '   (' + pct(r.rowCov - r.classCov).padStart(4) + ' 미분류)   ' + r.file.slice(0, 40)));
  }

  if (noTotal.length) {
    console.log('\n⚪ 총계를 못 읽어 잴 수 없는 ' + noTotal.length + '건');
    noTotal.forEach((n) => console.log('  · 검산줄 ' + String(n.rows).padStart(3) + '개  ' + n.file.slice(0, 50)));
  }
  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ rows, noTotal, errors }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

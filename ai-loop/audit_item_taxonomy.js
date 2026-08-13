/* ═══════════════════════════════════════════════════════════════════════════
   항목 사전 (TL) — **견적서에 있는데 우리 요율표에 칸이 없는 것**을 찾는다
   ───────────────────────────────────────────────────────────────────────────
   사장님 2026-08-13: 「세부 내역은 어떤 것들이 있는지 하나하나 면밀하게 검토해서
   DB를 뽑고, 그걸로 **오차범위가 적은 가견적**을 만들어라.」

   왜 이 자가 필요한가 — 우리 요율표는 **9칸**이다(항공·유류·호텔·식비·차량·가이드·
   관광·마진·보험). 그런데 실제 견적서에는 그 아홉으로 안 담기는 줄이 섞여 있고,
   그 금액이 어디로도 안 가면 **엔진이 구조적으로 싸게 나온다.**

   실제로 그 증상이 이미 잡혀 있었다(SD, 2026-08-09):
     키움 삿포로 135명 — 우리가 읽은 항목을 다 더해도 1인 **1,163,570**인데
     견적서의 입금가는 **1,549,505**다. **385,935원(25%)이 설명되지 않는다.**
   그때 결론이 「요율표에 아예 칸이 없는 항목이 있다는 뜻이라, 이걸 찾기 전에 일본
   요율을 올리면 **틀린 칸을 올려 우연히 총액을 맞추는 상태**가 된다」였다.
   그래서 요율 인상이 보류돼 있다. 이 도구가 그 보류를 푸는 자리다.

   재는 것:
     ① 46건의 **모든 검산줄**을 우리 9칸에 매핑해 보고, 안 담기는 줄을 모은다
     ② 그 줄들의 라벨을 묶어 **무엇들인지** 이름을 붙인다(사람이 읽을 수 있게)
     ③ 그 묶음이 **총계의 몇 %**인지 — 이게 곧 엔진이 구조적으로 놓치는 폭이다

   ⚠ **분류를 여기서 새로 짓지 않는다.** category는 pdf_extract가 붙인 것을 그대로 쓴다.
     여기서 다시 분류하면 추출기와 어긋나 「화면엔 있는데 감사엔 없는」 상태가 된다.
   ⚠ 분류가 **비어 있는 줄**과 **우리 칸에 없는 분류**는 다른 문제다. 앞은 추출 실패고
     뒤는 요율표의 구멍이다. **갈라서 센다** — 고치는 자리가 완전히 다르다.
   ⚠ 결과 파일은 저장소 밖 규칙을 따른다(.gitignore).

   실행:
     node ai-loop/audit_item_taxonomy.js
     node ai-loop/audit_item_taxonomy.js --show 미분류    그 묶음의 실제 줄을 본다
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const SHOW = argOf('--show');
const JSON_OUT = path.join(ROOT, '.item_taxonomy.json');

/* 우리 요율표가 실제로 가진 칸. 이 아홉 밖의 돈은 **엔진이 낼 수 없는 금액**이다.
   ⚠ margin·insurance는 견적서에 안 나온다(우리가 얹는 것) — 매핑 대상이 아니다. */
const RATE_CELLS = {
  airfare: '항공료', fuel: '유류할증료', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광·입장료',
  golf: '골프(TK에서 칸 신설)',
};
/* 추출기가 붙이지만 **요율 칸이 아닌** 분류 — 왜 아닌지 함께 적는다. */
const NON_RATE_CATEGORIES = {
  penalty: '패널티·취소료 — 그 행사에서만 난 비용이라 단가가 아니다',
  tax: '제세공과·인두세',
  common: '공동경비 — 인솔진 비용이 섞인다',
  insurance: '여행자보험 — 우리가 원화로 얹는다',
};

/* 미분류 줄에 이름을 붙이는 사전. **여기가 이 도구의 결과물**이다 —
   무엇이 우리 아홉 칸 밖에 있는지가 곧 요율표에 새로 필요한 칸의 후보다.
   ⚠ 순서가 곧 우선순위다(먼저 걸리는 쪽이 이긴다). 넓은 낱말을 위에 두면 삼킨다. */
const BUCKETS = [
  { key: '행사운영', re: /현수막|배너|플래카드|무대|음향|조명|시상|트로피|기념품|선물|기념\s*촬영|사진|영상|촬영|MC|사회자|진행|행사\s*진행|피켓|네임텐트|인식표|명찰/ },
  { key: '단체활동', re: /팀\s*빌딩|팀빌딩|워크샵|워크숍|세미나|강연|강사|회의실|미팅룸|렌탈|대관|컨퍼런스|연회장|파티|만찬|갈라|디너쇼/ },
  { key: '인솔·스텝', re: /인솔|TC|스텝|스태프|본사\s*직원|선발대|사전\s*답사|답사/ },
  { key: '비자·서류', re: /비자|VISA|ESTA|전자\s*여행|K-?ETA|여권|서류|초청장/i },
  { key: '통신·기타장비', re: /와이파이|WIFI|유심|USIM|로밍|통신|포켓/i },
  { key: '팁·봉사료', re: /\b팁\b|팁|봉사료|서비스\s*차지|SERVICE\s*CHARGE/i },
  { key: '물·간식·음료', re: /생수|물티슈|간식|스낵|다과|음료|주류|맥주|와인|룸\s*드랍/ },
  { key: '공항·수속', re: /공항|수속|라운지|짐|수하물|포터|카트|픽업|샌딩|미팅/ },
  { key: '의전·VIP', re: /의전|VIP|임원|귀빈|에스코트|리무진\s*의전/ },
  { key: '보험·안전', re: /보험|안전|응급|메디컬|방역|백신|PCR/i },
  { key: '현지행정', re: /입장세|출국세|공항세|시티택스|리조트\s*피|환경\s*부담금|관광세/ },
  { key: '옵션·자유', re: /옵션|선택\s*관광|자유\s*일정|추가\s*요금|현장\s*추가/ },
];

const won = (n) => Number(Math.round(n || 0)).toLocaleString();

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건에서 항목을 모으는 중… (2~4분)\n');

  const byCat = {};       /* 분류별 금액 */
  const buckets = {};     /* 미분류 줄을 묶은 것 */
  const unnamed = [];     /* 어느 묶음에도 안 걸린 줄 */
  let grandSum = 0, rowSum = 0, files_ok = 0;
  const perFile = [];

  for (const f of files) {
    let r;
    try {
      r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {});
    } catch (e) { continue; }
    const denom = r.grandTotal || r.itemsTotal || 0;
    const cands = (r.candidates || []).filter((c) => !c.unconvertible);
    if (!cands.length) continue;
    files_ok++;
    grandSum += denom;

    let unclassified = 0;
    cands.forEach((c) => {
      const amt = c.total || 0;
      rowSum += amt;
      const cat = c.category || null;
      if (cat) { byCat[cat] = (byCat[cat] || 0) + amt; return; }
      /* 분류가 안 붙은 줄 — **왜 안 붙었는지**를 묶어서 본다 */
      unclassified += amt;
      const s = String(c.label || '') + ' ' + String(c.note || '');
      const b = BUCKETS.find((x) => x.re.test(s));
      if (b) {
        buckets[b.key] = buckets[b.key] || { sum: 0, n: 0, files: new Set(), samples: [] };
        buckets[b.key].sum += amt; buckets[b.key].n++; buckets[b.key].files.add(f);
        if (buckets[b.key].samples.length < 6) buckets[b.key].samples.push({ f, line: String(c.line).slice(0, 88), amt });
      } else {
        unnamed.push({ f, line: String(c.line).slice(0, 88), amt, label: String(c.label || '') });
      }
    });
    perFile.push({ file: f, denom, unclassified, ratio: denom ? unclassified / denom : null });
  }

  /* ── ① 우리 아홉 칸에 담기는 돈 vs 안 담기는 돈 ─────────────────────────── */
  console.log('═══ ① 견적서의 돈은 어디로 가는가 (검산된 줄 ' + won(rowSum) + '원, ' + files_ok + '건) ═══\n');
  const cellSum = Object.keys(RATE_CELLS).reduce((n, k) => n + (byCat[k] || 0), 0);
  const nonRateSum = Object.keys(NON_RATE_CATEGORIES).reduce((n, k) => n + (byCat[k] || 0), 0);
  const otherCatSum = Object.keys(byCat)
    .filter((k) => !RATE_CELLS[k] && !NON_RATE_CATEGORIES[k])
    .reduce((n, k) => n + byCat[k], 0);
  const unclassSum = rowSum - cellSum - nonRateSum - otherCatSum;

  console.log('  ── 요율표에 칸이 있는 것 ──');
  Object.keys(RATE_CELLS).forEach((k) => {
    if (!byCat[k]) return;
    console.log('    ' + RATE_CELLS[k].padEnd(22) + won(byCat[k]).padStart(15)
      + (rowSum ? ('  ' + (byCat[k] / rowSum * 100).toFixed(1) + '%').padStart(9) : ''));
  });
  console.log('    ' + '합'.padEnd(22) + won(cellSum).padStart(15)
    + ('  ' + (cellSum / rowSum * 100).toFixed(1) + '%').padStart(9));

  console.log('\n  ── 요율 칸이 아닌 분류 ──');
  Object.keys(NON_RATE_CATEGORIES).forEach((k) => {
    if (!byCat[k]) return;
    console.log('    ' + k.padEnd(22) + won(byCat[k]).padStart(15)
      + ('  ' + (byCat[k] / rowSum * 100).toFixed(1) + '%').padStart(9) + '  ' + NON_RATE_CATEGORIES[k]);
  });
  Object.keys(byCat).filter((k) => !RATE_CELLS[k] && !NON_RATE_CATEGORIES[k]).forEach((k) => {
    console.log('    ' + (k + ' (?)').padEnd(22) + won(byCat[k]).padStart(15) + '   ← 이름 없는 분류다');
  });

  console.log('\n  ── 🔴 분류가 안 붙은 돈 ── ' + won(unclassSum)
    + '원 (' + (unclassSum / rowSum * 100).toFixed(1) + '%)');
  console.log('     이 돈은 **엔진이 낼 수 없는 금액**이다 — 어느 요율 칸에도 안 들어간다.');

  /* ── ② 그 돈은 무엇인가 ─────────────────────────────────────────────────── */
  console.log('\n═══ ② 분류 안 된 돈은 무엇인가 — 요율표에 새 칸이 필요한 후보 ═══\n');
  const sorted = Object.entries(buckets).sort((a, b) => b[1].sum - a[1].sum);
  sorted.forEach(([k, v]) => {
    console.log('  ' + k.padEnd(14) + won(v.sum).padStart(14)
      + ('  ' + (v.sum / rowSum * 100).toFixed(2) + '%').padStart(9)
      + '  ' + String(v.n).padStart(3) + '줄  ' + v.files.size + '건의 견적서');
    if (SHOW && (k === SHOW || SHOW === '전부')) {
      v.samples.forEach((s) => console.log('        · ' + won(s.amt).padStart(11) + '  ' + s.line));
    }
  });
  const bucketSum = sorted.reduce((n, [, v]) => n + v.sum, 0);
  const unnamedSum = unnamed.reduce((n, u) => n + u.amt, 0);
  console.log('\n  묶인 것 ' + won(bucketSum) + '원 · **이름 못 붙인 것 ' + won(unnamedSum)
    + '원 (' + unnamed.length + '줄)**');
  if (SHOW === '미분류' || SHOW === '전부') {
    unnamed.sort((a, b) => b.amt - a.amt).slice(0, 40)
      .forEach((u) => console.log('        · ' + won(u.amt).padStart(12) + '  ' + u.line));
  } else {
    console.log('  (실제 줄을 보려면: node ai-loop/audit_item_taxonomy.js --show 미분류)');
  }

  /* ── ③ 어느 견적서가 가장 많이 새는가 ───────────────────────────────────── */
  console.log('\n═══ ③ 분류 안 된 돈의 비중이 큰 견적서 (여기부터 보면 된다) ═══\n');
  perFile.filter((p) => p.ratio != null).sort((a, b) => b.ratio - a.ratio).slice(0, 12)
    .forEach((p) => console.log('  ' + (p.ratio * 100).toFixed(1).padStart(6) + '%  '
      + won(p.unclassified).padStart(13) + '  ' + p.file.slice(0, 62)));

  fs.writeFileSync(JSON_OUT, JSON.stringify({
    byCat, rowSum, unclassSum,
    buckets: Object.fromEntries(sorted.map(([k, v]) => [k, { sum: v.sum, n: v.n, files: [...v.files], samples: v.samples }])),
    unnamed: unnamed.sort((a, b) => b.amt - a.amt).slice(0, 200),
    perFile,
  }, null, 1), 'utf8');
  console.log('\n저장: ' + JSON_OUT);
})();

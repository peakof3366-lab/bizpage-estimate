/* ═══════════════════════════════════════════════════════════════════════════
   블랙다운·일정표 폴더 → 한 장의 표 (ZA)
   ───────────────────────────────────────────────────────────────────────────
   한 행이 한 문서다. `build_corpus_db.js`가 견적서 PDF에 하는 일을 새 표본에 한다.

   🔴 **재는 것은 「줄을 몇 개 읽었나」가 아니라 「문서를 다 읽었나」다.**
     총계의 일부만 읽고도 줄 수는 많을 수 있다(YS에서 배운 것). 그래서 이 표의 중심은
     **검산이 닫혔는가**이고, 닫힌 문서만 요율 검산에 쓴다.

   ⚠ **안 닫힌 것을 「오차」라 부르지 않는다.** 원인이 통화·다구간·조 분리·항공 포함
     여부로 제각각이라 한 이름으로 묶으면 진짜 결함이 그 안에 묻힌다(WD).
     그래서 비율대로 무리를 갈라 **원인 후보와 함께** 보여준다.

   ⚠ 캐시(`.bd_db.json`)는 저장소에 넣지 않는다 — **거래처 단가와 인원**이 그대로 있다.
     `.gitignore`에 넣어 두었다(코퍼스 캐시와 같은 이유).

   실행:
     node ai-loop/build_bd_db.js                # 표
     node ai-loop/build_bd_db.js --json         # 캐시 파일로 저장
     node ai-loop/build_bd_db.js --open         # 안 닫힌 것만, 원인 후보와 함께
     node ai-loop/build_bd_db.js --show "보홀"   # 그 문서에서 읽은 줄을 눈으로
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bdFiles } = require('./_bd_files.js');
const { extractBd } = require('./_bd_extract.js');
const { ASSUMPTION, applyRevenue } = require('./_bd_revenue.js');

const CACHE = path.join(__dirname, '.bd_db.json');
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const ONLY_OPEN = argv.includes('--open');
const showAt = argv.indexOf('--show');
const SHOW = showAt >= 0 ? argv[showAt + 1] : null;

/* ── 줄 이름 → 우리 9칸 ──────────────────────────────────────────────────────
   ⚠ **모르는 것은 「미분류」로 두고 반드시 센다.** 억지로 가장 가까운 칸에 넣으면
     그 칸의 실측 중앙값이 조용히 오염된다. 견적서 PDF 쪽에서 「돈의 12.4%가 우리 9칸
     어디에도 안 들어간다」를 알아낸 것이 바로 미분류를 세었기 때문이다. */
const CELL_RULES = [
  ['항공', /항공|AIR\b|항공권|유류|TAX|택스/i],
  ['호텔', /호텔|숙박|객실|룸|ROOM|HOTEL|온천장|리조트|엑스트라|싱글|SGL|TWN|TRP/i],
  ['식사', /식사|중식|석식|조식|만찬|식대|MEAL|뷔페|BF|런치|디너|식비/i],
  ['차량', /차량|버스|BUS|전용차|송영|주차|기사|COACH|밴|VAN|스프린터/i],
  ['가이드', /가이드|GUIDE|인솔|TC\b|T\/C|쓰루|로컬가이드|현지인가이드/i],
  ['관광', /관광|입장|투어|TOUR|체험|마사지|쇼\b|유람|승선|케이블|스파|골프|라운딩|그린피/i],
  ['부대', /핸들링|HANDLING|팁|TIP|인두세|서비스|봉사료|보험|물|생수|현수막|기념품|챠지|CHARGE/i],
];
/* ⚠ **분류(구분 칸)를 줄 이름보다 먼저 본다.** 줄 이름은 「헤난」「점보크랩」처럼
   업체 이름이라 규칙에 안 걸린다 — 분류는 블록 왼쪽 칸에 있다. */
function cellOf(label, group) {
  for (const src of [group, label]) {
    const t = String(src || '');
    if (!t) continue;
    for (const [name, re] of CELL_RULES) if (re.test(t)) return name;
  }
  return '미분류';
}

/* ── 안 닫힌 이유의 **후보** — 판정이 아니라 어디를 볼지 알려 주는 것이다 ────── */
function openHint(r) {
  if (r.ratio === null) return '총계를 못 읽었다';
  if (r.ratio < 0.02) return '통화가 다르다 (총계가 원화로 보인다)';
  if (r.ratio >= 3) return '통화가 다르다 (항목이 현지화, 총계가 기준통화)';
  if (r.ratio > 1.5) return '두 배쯤 넘는다 — 총계가 구간·조 소계일 수 있다';
  if (r.ratio > 1.005) return '조금 넘는다 — 같은 돈을 두 번 셌을 수 있다';
  if (r.ratio >= 0.9) return '거의 맞다 — 작은 줄 한둘을 놓쳤다';
  return '덜 읽었다 — 곱셈이 없는 줄(1인당 항목)일 수 있다';
}

function build() {
  const { files, dropped, root } = bdFiles(null, { quiet: true });
  const rows = files.map((f) => {
    const e = extractBd(f.abs);
    const cells = {};
    for (const x of (e.rows || [])) {
      const c = cellOf(x.label, x.group);
      if (!cells[c]) cells[c] = { 줄: 0, 합: 0 };
      cells[c].줄++; cells[c].합 += x.total;
    }
    return {
      file: f.rel, folder: f.folderHint, quoteNo: f.quoteNo, md5: f.md5,
      kind: e.kind, why: e.why, sheet: e.sheet,
      pax: e.header ? e.header.pax : null, foc: e.header ? e.header.paxFoc : null,
      nights: e.header ? e.header.nights : null, groups: e.header ? e.header.groups : null,
      fx: e.fx, rowCount: (e.rows || []).length, rowSum: e.rowSum,
      docTotal: e.docTotal, closedBy: e.closedBy, ratio: e.ratio,
      dayRows: e.dayRows, cells,
      /* 🔴 가상 판매가는 **닫힌 문서에서만** 만든다. 안 닫힌 원가에 수익을 얹으면
         틀린 값 위에 가정을 한 겹 더 올리는 것이 된다(대표 방침: 빈칸보다 틀린 값이 위험). */
      가상: e.closedBy ? applyRevenue(e.rowSum) : null,
    };
  });
  return { root, rows, dropped, 가정: ASSUMPTION };
}

const db = build();
const bd = db.rows.filter((r) => r.kind === 'bd');
const closed = bd.filter((r) => r.closedBy);

if (SHOW) {
  const key = SHOW.normalize('NFC');
  const hit = db.rows.filter((r) => r.file.normalize('NFC').includes(key));
  for (const r of hit) {
    console.log('■ ' + r.file);
    console.log('   ' + r.kind + ' · 시트 [' + r.sheet + '] · 인원 ' + (r.pax || '?')
      + ' · 줄 ' + r.rowCount + ' · 합 ' + Math.round(r.rowSum).toLocaleString()
      + ' · ' + (r.closedBy ? '✅ ' + r.closedBy : '🔴 ' + openHint(r)));
    for (const [c, v] of Object.entries(r.cells).sort((a, b) => b[1].합 - a[1].합))
      console.log('      ' + c.padEnd(5) + ' 줄' + String(v.줄).padStart(3) + '  ' + Math.round(v.합).toLocaleString());
    if (r.가상) console.log('      → 가상 판매가 ' + Math.round(r.가상.판매가).toLocaleString()
      + ' (×' + r.가상.배수.toFixed(2) + ', **가정**)');
  }
  process.exit(0);
}

if (AS_JSON) {
  fs.writeFileSync(CACHE, JSON.stringify(db, null, 1), 'utf8');
  console.log('저장: ' + CACHE + '  (' + db.rows.length + '행)');
  process.exit(0);
}

if (ONLY_OPEN) {
  const open = bd.filter((r) => !r.closedBy);
  const by = {};
  for (const r of open) (by[openHint(r)] = by[openHint(r)] || []).push(r);
  console.log('■ 검산이 안 닫힌 ' + open.length + '건 — 원인 후보별\n');
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    console.log('   ' + String(v.length).padStart(3) + '  ' + k);
    for (const r of v) console.log('        ' + (r.ratio === null ? '  —  ' : r.ratio.toFixed(3).padStart(7))
      + '  줄' + String(r.rowCount).padStart(3) + '  ' + (r.folder || '') + ' / ' + r.file.split(path.sep).pop().slice(0, 46));
  }
  console.log('\n   ⚠ 이것은 **판정이 아니라 어디를 볼지**다. 원인은 문서를 열어야 안다.');
  process.exit(0);
}

/* ── 표 ─────────────────────────────────────────────────────────────────── */
console.log('■ ' + db.root + '\n');
const kinds = {};
for (const r of db.rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
console.log('   문서 ' + db.rows.length + '개 — ' + Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(' · ')
  + '   (뺀 파일 ' + db.dropped.length + '개)');
console.log('   🔴 **검산이 닫힌 것 ' + closed.length + ' / ' + bd.length + '** — 요율 검산에 쓸 수 있는 것은 이것뿐이다');
console.log('   검산된 단가 줄 ' + bd.reduce((a, r) => a + r.rowCount, 0)
  + '개 (닫힌 문서 안에서 ' + closed.reduce((a, r) => a + r.rowCount, 0) + '개)');

const ways = {};
for (const r of closed) { const k = r.closedBy.replace(/환율 [\d.]+/, '환율').replace(/\s*\(.*\)/, ''); ways[k] = (ways[k] || 0) + 1; }
console.log('\n   ── 어떻게 닫혔나 (「닫혔다」만 남기면 우연히 닫힌 것과 구분이 안 된다)');
for (const [k, v] of Object.entries(ways).sort((a, b) => b[1] - a[1])) console.log('      ' + String(v).padStart(3) + '  ' + k);

const cellSum = {};
for (const r of closed) for (const [c, v] of Object.entries(r.cells)) {
  if (!cellSum[c]) cellSum[c] = { 줄: 0, 문서: 0 };
  cellSum[c].줄 += v.줄; cellSum[c].문서++;
}
console.log('\n   ── 닫힌 문서 ' + closed.length + '건의 단가 줄이 어느 칸에 들어가나');
for (const [c, v] of Object.entries(cellSum).sort((a, b) => b[1].줄 - a[1].줄))
  console.log('      ' + c.padEnd(5) + ' 줄 ' + String(v.줄).padStart(4) + '  (문서 ' + v.문서 + '건)');
console.log('      ⚠ 「미분류」는 결함이 아니라 **아직 이름을 못 붙인 돈**이다. 억지로 넣지 않는다.');

console.log('\n   ── 닫힌 문서의 목적지 (폴더 힌트 기준 — 판정은 아직 문서로 안 했다)');
const dests = {};
for (const r of closed) dests[r.folder || '?'] = (dests[r.folder || '?'] || 0) + 1;
console.log('      ' + Object.entries(dests).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));

console.log('\n   ── 수익 가정 (' + ASSUMPTION.결정일 + ' 대표 결정): '
  + ASSUMPTION.방식 + ' 하나투어 +' + (ASSUMPTION.하나투어 * 100) + '% → 비즈페이지 +'
  + (ASSUMPTION.비즈페이지 * 100) + '%, ' + ASSUMPTION.대상 + '에만 (×1.21)');
console.log('      🔴 가상 판매가는 **역검증 정답지가 아니다** — 우리가 정한 배수를 엔진이');
console.log('         맞히는지 재면 순환이 된다. 실제 마크업은 원가·판매가가 둘 다 있는');
console.log('         건에서만 잰다(`_bd_revenue.js`의 `measuredMarkup`).');
console.log('\n   안 닫힌 것을 보려면: node ai-loop/build_bd_db.js --open');

/* ═══════════════════════════════════════════════════════════════════════════
   견적서 코퍼스 DB (TL) — **한 장씩 전부 읽어 한 표로 만든다**
   ───────────────────────────────────────────────────────────────────────────
   사장님 2026-08-13: 「견적서를 하나씩 전부 검토해서, 어떤 형태로 제공되고 세부 내역은
   무엇인지 면밀하게 검토해 DB를 뽑아 줘. 그 DB로 **오차범위가 적은 가견적 산출 프로그램**을
   만드는 데 초점을 둔다.」

   왜 이 도구가 따로 필요한가 — 지금까지의 자는 전부 **한 각도**만 봤다:
     audit_coverage        덜 읽은 것
     audit_extract_sanity  값이 그럴듯한가
     audit_row_categories  분류를 못 붙인 줄
     backtest_quotes       고객이 보는 금액의 오차
   각각은 자기 질문에만 답한다. 그런데 「이 견적서는 대체 어떤 문서이고 우리가 무엇을
   알고 무엇을 모르는가」를 **한 줄로** 보여주는 것이 없었다. 그래서 한 장을 고치려면
   네 도구를 따로 돌려 눈으로 맞춰야 했다.

   이 표가 그 자리다. 한 행이 곧 한 견적서이고, 열은 **가견적 정확도에 실제로 걸리는 것**만
   둔다. 무엇보다 **왜 역검증에서 빠지는가**를 함께 적는다 — 표본이 46건 중 27건뿐이라
   중앙값이 흔들리는데, 빠지는 이유를 모으지 않으면 무엇을 고쳐야 표본이 느는지 알 수 없다.

   ⚠ **코퍼스 PDF는 저장소에 넣지 않는다**(참가자 실명·거래처 단가). 이 스크립트도
     결과 파일을 저장소 밖(기본 `../.corpus_db.json`, .gitignore)에 쓴다.
   ⚠ **판정을 여기서 새로 짓지 않는다.** 값·신뢰도·분류는 전부 pdf_extract에서 오고,
     타당성은 plausibility에서 온다. 여기서 다시 계산하면 화면과 어긋난다(결함 생성기 ①).

   실행:
     node ai-loop/build_corpus_db.js                 표 + 요약
     node ai-loop/build_corpus_db.js --json out.json 다른 파일로
     node ai-loop/build_corpus_db.js --file 북해도   한 건만 자세히
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
/* XQ: 항목 키는 `api/_lib/item_keys.js` 한 곳에서 온다(서버·도구가 같은 목록을 본다) */
const ITEM_KEYS = require('../api/_lib/item_keys');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const JSON_OUT = argOf('--json') || path.join(ROOT, '.corpus_db.json');
const ONLY = argOf('--file');
const CORPUS = process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

const destinationRates = require(path.join(ROOT, 'data.js'));
const DEST_KEYS = destinationRates.map((d) => d.destination_key);

/* ── 이 문서가 **원가 시트인가 고객용 견적서인가** (SC에서 확인한 단서) ────────────
   단서는 파일 이름이 아니라 **본문의 칸**이다. 「HNT 수익」·「권장수익」·「입금가」·「FOC」는
   홀세일러가 우리에게 줄 때만 찍는 칸이고 고객에게 나가는 견적서엔 있을 수 없다.
   ⚠ 이 구분이 없으면 오차의 **부호를 해석할 수 없다** — 원가보다 싸면 손해고
     판매가보다 싸면 마진이 얇은 것이다. 정반대 결론이다. */
const COST_SHEET_RE = /HNT\s*수익|권장\s*수익|입금가|\bFOC\b/i;

/* 발행사 — 양식을 가르는 가장 굵은 축이다(같은 회사는 열 구성이 같다). */
const ISSUERS = [
  { key: '하나투어', re: /하나투어|HANATOUR|Hanatour|\bHNT\b/i },
  { key: 'EnBT', re: /EnBT|이앤비티/i },
  { key: '좋은친구', re: /좋은\s*친구/ },
  { key: '모두투어', re: /모두투어/ },
  { key: '노랑풍선', re: /노랑풍선/ },
];

const pct = (n) => (n == null ? '—' : (n * 100).toFixed(0) + '%');
const won = (n) => (n == null ? '—' : Number(n).toLocaleString());

/* 파일 이름·본문 → 목적지 판정은 `_guess_dest.js` 한 곳에 있다 (UZ에서 떼어냈다).
   여기 안에 두었더니 테스트할 수 없었고, 그 사이 역검증이 쓰는 판정과 답이 갈려
   **대만이 섞인 견적서가 푸꾸옥 코스로 심겼다.** 이제 test_uZ가 두 판정을 대조한다. */
const { guessDest: guessDestFn } = require('./_guess_dest.js');
const guessDest = (file, text) => guessDestFn(file, text, DEST_KEYS);


/* **왜 가견적 검증에 못 쓰는가** — backtest_quotes가 빼는 사유와 같은 축으로 모은다.
   한 건이 여러 사유에 걸릴 수 있으므로 전부 적는다(하나만 고쳐도 안 풀린다). */
function blockers(r, dest) {
  const out = [];
  if (!dest.key) out.push(dest.from === 'ambiguous' ? '목적지 여러 곳' : '요율표에 없는 목적지');
  if (!r.pax) out.push('인원 불명');
  if (!(r.dates && r.dates.days >= 2)) out.push('일수 불명');
  /* ⚠ 필드 이름은 `departDate`다. 처음에 `depart`로 읽었다가 **46건 전부가
     「출발일 불명」**으로 나왔다 — 없는 필드를 읽으면 조용히 undefined가 되고,
     그러면 이 표가 "아무것도 못 쓴다"고 거짓말을 한다. */
  if (!(r.dates && r.dates.departDate)) out.push('출발일 불명');
  if (!r.perPerson && !r.depositPerPerson) out.push('1인당 금액 없음');
  /* UU: 문서가 적은 총계 ÷ 1인당이 딱 떨어지는데 우리가 읽은 인원과 다르다.
     ⚠ **1인당을 버리지 않고 이 사유로 든다.** 예전엔 1인당을 버려서 「1인당 금액 없음」이
       됐는데, 그건 사실이 아니고(문서에 적혀 있다) 사람이 볼 곳도 가리키지 못했다.
       인원은 규모 계수로 금액에 들어가므로 틀린 채 대조하면 그 오차가 엔진 오차로 둔갑한다. */
  if (r.paxConflict) out.push('인원 어긋남(문서 계산은 ' + r.paxConflict.impliedPax + '명)');
  if (!r.grandTotal && !r.itemsTotal) out.push('총계 없음');
  return out;
}

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  let files = corpusFiles(CORPUS).files;
  if (ONLY) files = files.filter((f) => f.indexOf(ONLY) >= 0);
  console.log('견적서 ' + files.length + '건 읽는 중… (2~4분)\n');

  const db = [];
  const errors = [];
  for (const f of files) {
    let r, raw;
    try {
      raw = fs.readFileSync(path.join(CORPUS, f));
      r = await X.extractQuote(new Uint8Array(raw), pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 90) }); continue; }

    const text = r.text || '';
    const dest = guessDest(f, text);
    const cands = r.candidates || [];
    const usable = cands.filter((c) => !c.unconvertible);
    const denom = r.grandTotal || r.itemsTotal || null;
    const rowSum = usable.reduce((n, c) => n + (c.total || 0), 0);
    const classSum = usable.filter((c) => c.category).reduce((n, c) => n + (c.total || 0), 0);
    const v = r.values || {};
    const ev = r.evidence || {};
    const filled = ITEM_KEYS.RATE_ITEM_KEYS
      .filter((k) => v[k] != null).length;

    /* 항목별 값 + **어떻게 나온 값인가**를 함께 담는다 — 값만 있는 DB는 나중에
       「이 숫자를 믿어도 되나」에 답할 수 없다(이 저장소가 반복해서 당한 자리다). */
    const items = {};
    ITEM_KEYS.MANUAL_FIELD_KEYS.forEach((k) => {
      if (v[k] == null) return;
      items[k] = { value: v[k], via: (ev[k] && ev[k].via) || null, calc: (ev[k] && ev[k].calc) || '' };
    });

    const issuer = (ISSUERS.find((i) => i.re.test(text)) || {}).key || '미상';
    const row = {
      file: f,
      /* ── 문서가 어떤 것인가 ── */
      issuer,
      kind: (r.kind && r.kind.label) || '',
      basis: COST_SHEET_RE.test(text) ? 'cost' : 'sell',   /* 원가 시트인가 고객용인가 */
      pages: r.pageCount || null,
      blocks: r.blockCount || 1,
      /* ── 견적의 뼈대 ── */
      destination: dest.key, destFrom: dest.from,
      pax: r.pax || null,
      nights: r.dates ? r.dates.nights : null,
      days: r.dates ? r.dates.days : null,
      departDate: r.dates ? r.dates.departDate : null,
      returnDate: r.dates ? r.dates.returnDate : null,
      quoteDate: r.dates ? r.dates.quoteDate : null,
      /* 문서가 스스로 모순되는가(제목의 N박 ≠ 날짜 범위) — 일수는 금액에 거의 정비례한다 */
      nightsConflict: (r.dates && r.dates.nightsConflict) || null,
      leadDays: (r.dates && r.dates.leadDays) || null,
      /* ── 금액 ── */
      grandTotal: r.grandTotal || null,
      itemsTotal: r.itemsTotal || null,
      perPerson: r.perPerson || null,
      depositPerPerson: r.depositPerPerson || null,
      /* ── 우리가 무엇을 읽었나 ── */
      rows: cands.length,
      filledCells: filled,
      rowCoverage: denom ? rowSum / denom : null,
      classCoverage: denom ? classSum / denom : null,
      items,
      /* ── 특이 구조 ── */
      crews: r.crews || null,
      sideTables: r.sideTables || null,
      multiCity: !!(r.itinerary && r.itinerary.multiCity),
      paxConflict: r.paxConflict || null,
      itineraryDays: (r.itinerary && r.itinerary.days) ? r.itinerary.days.length : 0,
      fxFromDocument: r.fxFromDocument || null,
      needsFxRate: (r.needsFxRate && r.needsFxRate.currency) || null,
      groupColumn: r.groupColumn ? r.groupColumn.used : null,
      /* ── 가견적 검증에 못 쓰는 이유 ── */
      blockers: blockers(r, dest),
    };
    db.push(row);
    if (ONLY) {
      console.log(JSON.stringify(row, null, 1));
      console.log('\n── 검산된 줄 ' + cands.length + '개 ──');
      cands.slice(0, 60).forEach((c) => console.log('  [' + String(c.category || '--').padEnd(8)
        + (c.crew ? '/' + c.crew : '') + '] ' + String(c.total).padStart(11) + '  ' + String(c.line).slice(0, 100)));
    }
  }

  if (!ONLY) {
    /* ── 표 ── 한 행이 한 견적서다. 열은 가견적 정확도에 걸리는 것만. */
    console.log('발행사     원/판  목적지        인원 일수 출발일      1인당       칸 줄커버 분류커버  막는 것');
    console.log('─'.repeat(126));
    db.forEach((d) => {
      console.log(
        String(d.issuer).padEnd(10)
        + (d.basis === 'cost' ? ' 원가 ' : ' 판매 ')
        + String(d.destination || '—').padEnd(12)
        + String(d.pax || '—').padStart(5)
        + String(d.days || '—').padStart(4) + ' '
        + String(d.departDate || '—').padEnd(11)
        + won(d.perPerson || d.depositPerPerson).padStart(11)
        + String(d.filledCells).padStart(3)
        + pct(d.rowCoverage).padStart(7) + pct(d.classCoverage).padStart(8)
        + '  ' + (d.blockers.join('·') || '') + '  ' + d.file.slice(0, 34));
    });

    /* ── 요약 — 무엇을 고치면 표본이 느는가 ── */
    const n = db.length;
    const count = (f) => db.filter(f).length;
    console.log('\n' + '─'.repeat(126));
    console.log('견적서 ' + n + '건' + (errors.length ? ' (못 읽은 것 ' + errors.length + '건)' : ''));
    console.log('  발행사: ' + Object.entries(db.reduce((o, d) => { o[d.issuer] = (o[d.issuer] || 0) + 1; return o; }, {}))
      .sort((a, b) => b[1] - a[1]).map(([k, c]) => k + ' ' + c).join(' · '));
    console.log('  원가 시트 ' + count((d) => d.basis === 'cost') + '건 · 고객용 ' + count((d) => d.basis === 'sell') + '건');
    console.log('  9칸 중 평균 ' + (db.reduce((s, d) => s + d.filledCells, 0) / n).toFixed(2) + '칸을 채웠다');

    /* **막는 것**을 사유별로 센다 — 이게 곧 다음에 고칠 순서다. */
    const bl = {};
    db.forEach((d) => d.blockers.forEach((b) => { bl[b] = (bl[b] || 0) + 1; }));
    const clean = count((d) => !d.blockers.length);
    console.log('\n  ✅ 가견적 검증에 바로 쓸 수 있는 견적서: ' + clean + '/' + n
      + ' (' + Math.round(clean / n * 100) + '%)');
    console.log('  ── 나머지를 막는 것 (한 건이 여럿에 걸릴 수 있다) ──');
    Object.entries(bl).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => {
      console.log('   ' + String(c).padStart(4) + '건  ' + k);
      db.filter((d) => d.blockers.indexOf(k) >= 0).slice(0, 4)
        .forEach((d) => console.log('          · ' + d.file.slice(0, 60)));
      if (c > 4) console.log('          … ' + (c - 4) + '건 더');
    });
    errors.forEach((e) => console.log('   !! ' + e.file + ' — ' + e.err));
  }

  fs.writeFileSync(JSON_OUT, JSON.stringify(db, null, 1), 'utf8');
  console.log('\nDB 저장: ' + JSON_OUT + ' (' + db.length + '행)');
})();

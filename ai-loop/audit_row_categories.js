/* ═══════════════════════════════════════════════════════════════════════════
   줄 분류 감사 (SE) — 검산줄이 **어느 항목인지 알아냈는가**를 센다
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 추출기가 몇 칸을 채웠는지는 재고 있었지만, 못 채운 칸이 **왜** 비는지는
   재지 않았다. 실측으로 갈라 보니 큰 원인이 하나 있었다: **분류가 비는 줄**이다.
   견적서의 호텔 줄은 브랜드명만 적힌다 —「메트로폴리탄 이케부쿠로」·「쉐라톤 가든뷰」·
   「도야 만세각」. 호텔이라는 낱말이 없으니 어휘 분류로는 못 잡고, 그 줄이 빠지면
   **객실 단가 칸이 통째로 빈다.** SE 이전: 검산줄 960개 중 224개(23.3%)가 분류 없음,
   46건 중 22건이 객실 단가 없음.

   SE가 넣은 것은 표의 **구분 열 상속**이다(api/_lib/pdf_extract.js의 L3.5).
   이 감사기는 그것이 실제로 얼마나 먹히는지, 그리고 **풀렸는지**를 센다.

   보는 것 네 가지 —
     ① 분류가 빈 줄이 몇 개인가            (줄어야 한다)
     ② 구분 열에서 물려받은 줄이 몇 개인가  (0이 되면 상속이 풀린 것이다)
     ③ 객실 단가가 없는 파일이 몇 건인가    (이 작업의 목적)
     ④ 구분 열을 **왜** 못 읽었는가         (조용히 넘어가지 않는다)

   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.
      이 파일은 경로만 안다. 회귀 테스트는 합성 표를 쓴다(test_sE_group_column.js).

   실행:
     node ai-loop/audit_row_categories.js
     node ai-loop/audit_row_categories.js "D:\다른폴더"
     node ai-loop/audit_row_categories.js --json out.json   (전/후 대조용 저장)
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

/* SE 직전(커밋 150afbb) 실측값. 이 아래로 나빠지면 무언가 풀린 것이다.
   ⚠ 숫자를 그냥 갱신하지 말 것 — 왜 움직였는지 먼저 설명할 수 있어야 한다. */
const BASELINE = { rows: 960, unclassified: 224, noHotel: 22 };

const FIELDS = require('../api/_lib/item_keys').RATE_ITEM_KEYS;

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  let rowsAll = 0, unclassified = 0, fromGroup = 0, fromNote = 0, fromLabel = 0;
  let usedGroup = 0, noHotel = 0;
  const whyCount = new Map();
  const errors = [];
  const detail = [];
  const filled = {};
  FIELDS.forEach((f) => { filled[f] = 0; });

  for (const f of files) {
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 100) }); continue; }

    const cands = r.candidates || [];
    const g = r.groupColumn || { used: false, why: '(정보 없음)' };
    rowsAll += cands.length;
    const un = cands.filter((c) => !c.category).length;
    const grp = cands.filter((c) => c.categoryFrom === 'group').length;
    unclassified += un;
    fromGroup += grp;
    fromNote += cands.filter((c) => c.categoryFrom === 'note').length;
    fromLabel += cands.filter((c) => c.categoryFrom === 'label').length;
    if (g.used) usedGroup++;
    else {
      const why = g.why || '(이유 없음)';
      whyCount.set(why, (whyCount.get(why) || 0) + 1);
    }
    const values = r.values || {};
    FIELDS.forEach((k) => { if (values[k] != null) filled[k]++; });
    if (values.hotel == null) noHotel++;

    /* ⚠ 객실 단가가 비는 데는 **원인이 둘**이고, 고치는 방법이 전혀 다르다.
         · 호텔 줄을 못 알아봤다        → 분류 문제 (여기서 고친다)
         · 알아봤는데 환율이 없어 뺐다   → 환율 문제 (문서에 환율이 없는 외화 견적서)
       갈라서 세지 않으면 "아직 20건이 빈다"가 분류가 안 됐다는 말처럼 읽힌다. */
    const hotelRows = cands.filter((c) => c.category === 'hotel');
    detail.push({
      file: f, rows: cands.length, unclassified: un, fromGroup: grp,
      groupUsed: !!g.used, groups: g.groups || 0, ambiguous: g.ambiguous || 0, why: g.why || '',
      hotel: values.hotel || null, hotelName: values.hotelName || null,
      hotelRows: hotelRows.length,
    });
  }

  const read = files.length - errors.length;
  console.log('════ 줄 분류 감사 ════\n');
  console.log('검산줄 ' + rowsAll + '개 — 분류됨 ' + (rowsAll - unclassified) +
    ' / 분류 없음 ' + unclassified + ' (' + (rowsAll ? (unclassified / rowsAll * 100).toFixed(1) : '0') + '%)');
  console.log('  분류의 출처   자기 라벨 ' + fromLabel + '  ·  표의 구분 열 ' + fromGroup + '  ·  비고 ' + fromNote);
  console.log('구분 열을 읽은 파일 ' + usedGroup + '/' + read + '건\n');

  console.log('칸별 — 값이 채워진 파일 수');
  console.log('─'.repeat(40));
  FIELDS.forEach((k) => {
    console.log('  ' + k.padEnd(10) + String(filled[k]).padStart(3) + ' / ' + read);
  });

  if (whyCount.size) {
    console.log('\n구분 열을 못 읽은 이유 — **조용히 넘어가지 않는다**');
    console.log('─'.repeat(56));
    Array.from(whyCount.entries()).sort((a, b) => b[1] - a[1])
      .forEach(([why, n]) => console.log('  ' + String(n).padStart(3) + '건  ' + why));
  }

  const noHotelFiles = detail.filter((d) => !d.hotel);
  if (noHotelFiles.length) {
    const found = noHotelFiles.filter((d) => d.hotelRows > 0);
    const missed = noHotelFiles.filter((d) => !d.hotelRows);
    console.log('\n객실 단가가 없는 ' + noHotelFiles.length + '건 — **원인이 둘이다**');
    console.log('  · 호텔 줄은 찾았는데 값이 안 나갔다: ' + found.length + '건');
    console.log('    → 대개 **문서에 환율이 없는 외화 견적서**다(환산하지 않는다는 원칙 그대로).');
    console.log('       분류가 아니라 환율을 풀어야 채워진다.');
    console.log('  · 호텔 줄 자체를 못 찾았다: ' + missed.length + '건  ← 여기가 분류의 다음 자리');
    console.log('─'.repeat(92));
    noHotelFiles.forEach((d) => console.log('  ' +
      (d.hotelRows ? '호텔줄 ' + String(d.hotelRows).padStart(2) + '개' : '호텔줄  없음') + '  ' +
      (d.groupUsed ? '구분열O' : '구분열X') +
      '  줄' + String(d.rows).padStart(3) + '  빈' + String(d.unclassified).padStart(3) + '  ' +
      d.file.slice(0, 38).padEnd(40) + (d.groupUsed ? '' : d.why)));
  }

  /* ⚠ 여기가 이 감사기의 판정이다. 값이 남아 있는 것 자체는 사고가 아니지만,
     **SE 이전보다 나빠졌다면** 상속이 풀렸거나 다른 층이 그것을 덮은 것이다. */
  console.log('\n' + '─'.repeat(56));
  const worse = [];
  if (unclassified > BASELINE.unclassified) worse.push('분류 없는 줄 ' + BASELINE.unclassified + ' → ' + unclassified);
  if (noHotel > BASELINE.noHotel) worse.push('객실 단가 없는 파일 ' + BASELINE.noHotel + ' → ' + noHotel);
  if (!fromGroup) worse.push('구분 열 상속이 한 줄도 안 일어났다 (L3.5가 죽었는지 볼 것)');
  if (worse.length) {
    console.log('✗ SE 직전보다 나빠졌다:');
    worse.forEach((w) => console.log('   · ' + w));
    process.exitCode = 1;
  } else {
    console.log('✓ SE 직전 대비 — 분류 없는 줄 ' + BASELINE.unclassified + ' → ' + unclassified +
      ' · 객실 단가 없는 파일 ' + BASELINE.noHotel + ' → ' + noHotel);
    console.log('  ⚠ 채워졌다는 것이 맞다는 뜻은 아니다. 값 자체는 담당자가 화면에서 본다.');
  }

  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      files: files.length, rowsAll, unclassified, fromGroup, fromNote, fromLabel,
      usedGroup, noHotel, filled, detail,
    }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

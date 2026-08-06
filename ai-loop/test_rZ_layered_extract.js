/* RZ 검증: 견적서 PDF 추출을 **층 구조**로 바꾼 것.

   왜 —
   옛 추출기(RN)는 납작하게 편 텍스트에서 `단가 × 수량 × 총금액`이 **한 줄에 나란히**
   있어야 동작했다. 그게 되느냐는 pdf-parse가 글자를 뱉는 순서에 달렸고, 그 순서는
   양식마다 다르다. 실측(견적서 46건):
     · 하나투어 세부내역서 → 검산줄 40개
     · 하나투어 요약형     → 검산줄 **0개** (단가표는 멀쩡히 있다)
   단가표 머리글이 있는데 한 줄도 못 잡은 파일이 7건이었다.

   그리고 겉으로 멀쩡해 보이면서 틀리는 결함이 셋 더 있었다:
     ① 식비가 **4배** — 식사 소계를 '하루치'로 봤는데 그 견적서는 전 일정 합이었다
        (한화 뉴퍼스트: 343,650원. 실제 하루치는 9만 원대). 신뢰도는 high였다.
     ② PDF 한 개에 견적이 **두 벌** 들어 있는데 섞어서 읽었다(81,887,120 / 85,878,235).
     ③ 엔화 표에서 ¥2,000을 **2,000원**으로 읽었다 — 원화로는 19,000원이라 1/10이다.

   이 테스트가 고정하는 것 — 층마다 하는 일이 다르고, 위층이 실패해도 아래층이 남는다:
     L1   좌표로 줄 세우기 (양식 독립)     L1.5 견적 블록 분리
     L2   산술 검산                        L2.5 통화 판별·환산
     L3   어휘 분류 (양식 독립)            L4   문서 자체 검산
   그리고 **안전망이 실제로 동작하는지** 일부러 깨뜨려 확인한다(결함 생성기 ③).

   실행: node ai-loop/test_rZ_layered_extract.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const adminSrc = read('admin.html');
const quotesSrc = read(path.join('api', 'quotes.js'));
const X = require('../api/_lib/pdf_extract.js');
const libSrcRZ = read(path.join('api', '_lib', 'pdf_extract.js'));
const migrateSrcRZ = read(path.join('ai-loop', 'db_migrate.js'));

/* 합성 표 — **실제 견적서를 쓰지 않는다.** 견적서 모음에는 참가자 실명과 거래처 단가가
   들어 있어 저장소에 넣을 수 없다. 대신 실측에서 겪은 **모양만** 그대로 옮긴다. */
let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 0;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};

(async () => {
  /* ── [1] L1: 라벨이 숫자와 같은 줄에 붙는가 ────────────────────────────── */
  console.log('[1] L1 — 좌표로 세운 줄에서 라벨과 숫자가 한 줄인가');
  ln = 0;
  const basic = [
    line(['인 원', '26']),
    line(['구분', '단가', '수량/인원', '횟수/박수', '총금액', '비고']),
    line(['항공료', '700,000', '19', '1', '13,300,000', '사입석']),
    line(['유류할증료 및 택스', '135,300', '19', '1', '2,570,700']),
    line(['노보텔', '224,750', '26', '3', '17,530,500', '싱글룸 26객실']),
    line(['2일 조식', '29,000', '26', '1', '754,000']),
    line(['2일 중식', '29,000', '26', '1', '754,000']),
    line(['2일 석식', '36,250', '26', '1', '942,500']),
    line(['3일 중식', '29,000', '26', '1', '754,000']),
    line(['3일 석식', '50,750', '26', '1', '1,319,500']),
    line(['29인승 차량', '797,500', '1', '4', '3,190,000']),
    line(['한국인 가이드', '217,500', '2', '4', '1,740,000']),
    line(['다낭 GOLF', '232,000', '24', '2', '11,136,000']),
    line(['럭셔리 스파', '58,000', '26', '2', '3,016,000']),
    line(['총 금액', '81,887,120']),
    line(['1인당', '3,149,505']),
  ];
  const rows = X.findUnitRows(basic, {});
  ok('단가 줄을 찾는다', rows.length >= 10, String(rows.length));
  const byLabel = (t) => rows.find((r) => r.label.indexOf(t) === 0);
  ok('줄이 자기 항목 이름을 갖는다', !!byLabel('항공료') && !!byLabel('노보텔'),
    rows.slice(0, 3).map((r) => r.label).join(' | '));
  ok('항공료 단가를 바르게 집는다', byLabel('항공료').unit === 700000, String(byLabel('항공료') && byLabel('항공료').unit));
  ok('호텔은 1박 단가다', byLabel('노보텔').unit === 224750 && byLabel('노보텔').times === 3);
  ok('비고는 라벨에 섞이지 않는다', byLabel('항공료').note === '사입석', byLabel('항공료').note);

  /* ── [2] L3: 어휘 분류 ─────────────────────────────────────────────────── */
  console.log('\n[2] L3 — 어휘로 항목을 가르는가 (양식이 아니라 낱말로)');
  const cat = (t) => X.classifyLabel(t);
  ok('항공료 → airfare', cat('항공료') === 'airfare');
  /* ⚠ 이 순서가 중요하다 — 유류할증료가 항공으로 빨려들면 항공 단가가 통째로 틀린다 */
  ok('유류할증료는 항공이 아니다', cat('유류할증료 및 택스') === 'fuel');
  ok('호텔 → hotel', cat('노보텔 싱글룸') === 'hotel' || cat('호텔') === 'hotel');
  ok('조/중/석식 → meal', cat('2일 중식 (클럽식)') === 'meal' && cat('3일 석식') === 'meal');
  /* ⚠ '룸드랍'은 '룸'이 들어가지만 호텔이 아니라 식사다 */
  ok('룸드랍은 호텔이 아니라 식사다', cat('룸드랍') === 'meal');
  ok('차량 → vehicle', cat('29인승 차량') === 'vehicle');
  ok('가이드 → guide', cat('한국인 가이드') === 'guide');
  ok('입장료·스파 → sight', cat('입장료') === 'sight' && cat('럭셔리 스파') === 'sight');
  /* ⚠ 골프는 관광과 **따로** 센다 — 자릿수가 달라 섞으면 관광비 기준이 무너진다 */
  ok('골프는 관광과 따로 분류된다', cat('다낭/몽고메리 GOLF') === 'golf' && cat('캐디팁') === 'golf');
  ok('보험·수수료도 가른다', cat('여행자보험') === 'insurance' && cat('DMC 수수료') === 'fee');
  ok('모르는 말은 null (억지로 넣지 않는다)', cat('고영빈님') === null, String(cat('고영빈님')));

  /* ── [3] L2.5: 통화 ────────────────────────────────────────────────────── */
  console.log('\n[3] L2.5 — 외화 단가를 원화로 착각하지 않는가');
  ln = 0;
  const jpyLines = [
    line(['현재 1JPY = 9.5원 기준']),
    line(['인 원', '46']),
    line(['호텔 Hotel Kadoman', '¥', '9,500', '1', '46', '¥', '437,000']),
    line(['식사 1일차 중식', '¥', '2,000', '1', '46', '¥', '92,000']),
  ];
  const fx = X.findFxRates ? X.findFxRates(jpyLines) : null;
  const jpyOut = X.readOneBlock(jpyLines, { JPY: 9.5 });
  const hotelRow = jpyOut.candidates.find((c) => c.category === 'hotel');
  ok('¥ 표에서도 줄을 찾는다', !!hotelRow, String(jpyOut.candidates.length));
  ok('¥9,500을 원화 90,250으로 환산한다', hotelRow && hotelRow.unit === 90250, hotelRow && String(hotelRow.unit));
  ok('무엇을 환산했는지 남긴다', hotelRow && hotelRow.converted && hotelRow.converted.from === 'JPY'
    && hotelRow.converted.originalUnit === 9500);
  /* ⚠ 통화 기호는 **바로 다음 숫자 하나**만 물들여야 한다. 1·46은 개수이지 금액이 아니다. */
  ok('수량·횟수까지 외화로 물들이지 않는다', hotelRow && hotelRow.qty === 1 && hotelRow.times === 46,
    hotelRow && `${hotelRow.qty}/${hotelRow.times}`);

  /* 환율이 없으면 **환산하지 않는다** — 오늘 환율로 때우면 견적 시점과 어긋난 값이 굳는다 */
  const noFx = X.readOneBlock(jpyLines.slice(1), {});
  const stuck = noFx.candidates.filter((c) => c.unconvertible);
  ok('환율이 없으면 환산하지 않는다', stuck.length > 0, String(stuck.length));
  ok('환산 못 한 줄은 값 후보에서 빠진다', noFx.values.hotel == null, String(noFx.values.hotel));
  ok('그래도 후보 목록에는 남는다 (사람이 보고 넣을 수 있게)', noFx.candidates.length > 0);

  /* ── [4] 식비는 하루치인가 (옛 4배 결함 재발 방지) ───────────────────── */
  console.log('\n[4] 식비를 전 일정 합으로 넣지 않는가 (옛 결함 ①)');
  const b = X.readOneBlock(basic, {});
  ok('인원을 문서에서 읽는다', b.pax === 26, String(b.pax));
  const mealSum = b.candidates.filter((c) => c.category === 'meal').reduce((n, c) => n + c.unit, 0);
  ok('식사 줄이 여럿 잡혔다', b.candidates.filter((c) => c.category === 'meal').length >= 4);
  ok('식비가 단가 단순합이 아니다 (그게 4배 결함이었다)', b.values.meal !== mealSum,
    `단순합 ${mealSum} vs 결과 ${b.values.meal}`);
  ok('식비를 인원·일수로 나눈다', b.evidence.meal && /÷ 인원 26 ÷ \d+일/.test(b.evidence.meal.calc),
    b.evidence.meal && b.evidence.meal.calc);
  ok('며칠치로 봤는지 근거를 남긴다', b.evidence.meal && /'N일'|박 \+ 1/.test(b.evidence.meal.label),
    b.evidence.meal && b.evidence.meal.label);
  ok('식비가 상식 범위다', b.values.meal > 10000 && b.values.meal < 200000, String(b.values.meal));

  /* ── [5] 골프를 관광비에서 빼고, 뺀 사실을 남기는가 ───────────────────── */
  console.log('\n[5] 골프를 관광비에 섞지 않는가 (요율 왜곡 방지)');
  ok('관광비가 나온다', b.values.sight != null, String(b.values.sight));
  ok('골프 총액이 관광비에 안 들어갔다', b.values.sight < 232000 * 24 * 2 / 26, String(b.values.sight));
  /* ⚠ 뺀 금액은 label이 아니라 **note**로 따로 준다 — label에 문장으로 이어 붙이면
     화면에서 잘리거나 다른 문구에 묻힌다(실제로 그랬다). */
  ok('뺀 금액을 따로 남긴다', b.evidence.sight && /골프 [\d,]+원은 뺐습니다/.test(b.evidence.sight.note || ''),
    b.evidence.sight && (b.evidence.sight.note || '(note 없음)'));
  ok('출처를 값으로 표시한다 (문구를 정규식으로 찾지 않게)',
    b.evidence.sight.via === 'calc' && b.evidence.airfare.via === 'rule',
    `${b.evidence.sight.via} / ${b.evidence.airfare.via}`);

  /* ── [6] 1인당 거름망 — 수량/횟수 열 순서가 뒤바뀌어도 ─────────────────── */
  console.log('\n[6] 수량·횟수 열 순서가 양식마다 달라도 되는가');
  ln = 0;
  const swapped = [
    line(['인 원', '46']),
    line(['식사 1일차 중식', '2,000', '1', '46', '92,000']),   /* 인원이 '횟수' 자리에 */
    line(['식사 2일차 중식', '2,500', '1', '46', '115,000']),
    line(['호텔 무슨호텔', '95,000', '1', '46', '4,370,000']),
  ];
  const sw = X.readOneBlock(swapped, {});
  ok('인원이 뒤 열에 있어도 인원을 읽는다', sw.pax === 46, String(sw.pax));
  ok('그래도 식비가 나온다', sw.values.meal != null, String(sw.values.meal));

  /* 일괄 금액 줄(수량·횟수가 둘 다 1)은 1인당 항목에서 빠져야 한다 */
  ln = 0;
  const lump = [
    line(['인 원', '26']),
    line(['2일 중식', '29,000', '26', '1', '754,000']),
    line(['3일 중식', '29,000', '26', '1', '754,000']),
    line(['현장추가 음료/주류', '585,441', '1', '1', '585,441']),
  ];
  const lp = X.readOneBlock(lump, {});
  const usedIdx = (lp.evidence.meal && lp.evidence.meal.rowIdxs) || [];
  const lumpRow = lp.candidates.find((c) => c.unit === 585441);
  ok('일괄 금액 줄은 식비 계산에서 뺀다', !lumpRow || usedIdx.indexOf(lumpRow.idx) < 0,
    `식사에 쓴 줄 ${usedIdx.join(',')}`);

  /* ── [7] L1.5 — 견적이 여러 벌인 PDF ──────────────────────────────────── */
  console.log('\n[7] PDF 한 개에 견적이 여러 벌이면 나누는가 (옛 결함 ②)');
  ln = 0;
  const twoBlocks = [
    line(['인 원', '26']),
    line(['기준 환율 ($) 1,450 일정 2026.02.04~02.08']),
    line(['항공료', '700,000', '19', '1', '13,300,000']),
    line(['호텔', '224,750', '26', '3', '17,530,500']),
    line(['차량', '797,500', '1', '4', '3,190,000']),
    line(['총 금액', '81,887,120']),
    line(['총 견적가', '81,887,120']),                    /* 같은 값 반복 — 안 끊는다 */
    line(['총 견적가 (백원 단위 절삭)', '81,887,000']),      /* 절삭 줄 — 값이 다르지만 안 끊는다 */
    line(['인 원', '26']),
    line(['기준 환율 ($) 1,450 일정 2026.03.11~03.15']),
    line(['항공료', '750,000', '19', '1', '14,250,000']),
    line(['호텔', '230,000', '26', '3', '17,940,000']),
    line(['차량', '800,000', '1', '4', '3,200,000']),
    line(['총 금액', '85,878,235']),
  ];
  const blocks = X.splitQuoteBlocks(twoBlocks);
  ok('견적 두 벌로 나뉜다', blocks.length === 2, String(blocks.length));
  ok('같은 총계가 두 줄 이어져도 한 벌로 본다',
    blocks[0].total === 81887120 && blocks[1].total === 85878235,
    blocks.map((x) => x.total).join(' / '));
  /* ⚠ 실측에서 겪은 것: 「총 견적가 (백원 단위 절삭)」이 값이 달라 장이 하나 더 생겨
     3장짜리 문서가 6장이 됐다. 절삭 줄로는 끊기지 않아야 한다. */
  ok('절삭 줄로는 장이 더 생기지 않는다', blocks.length === 2);
  ok('나눈 뒤 줄이 섞이지 않는다',
    X.findUnitRows(blocks[0].lines, {}).length === 3 && X.findUnitRows(blocks[1].lines, {}).length === 3,
    `${X.findUnitRows(blocks[0].lines, {}).length} / ${X.findUnitRows(blocks[1].lines, {}).length}`);
  /* 장마다 **자기 출발일**을 갖는다 — 한화 상하이는 차수별로 11/08·11/15·11/22이었다 */
  const d0 = X.findDates(blocks[0].lines), d1 = X.findDates(blocks[1].lines);
  ok('장마다 출발일이 따로 읽힌다', d0.departDate === '2026-02-04' && d1.departDate === '2026-03-11',
    `${d0.departDate} / ${d1.departDate}`);

  /* ── [8] L4 — 문서가 스스로 채점표가 되는가 ───────────────────────────── */
  console.log('\n[8] L4 — 문서 자체 검산 (정답지 없이 정확도를 재는 방법)');
  ln = 0;
  const recLines = [
    line(['인 원', '26']),
    line(['항공료', '700,000', '19', '1', '13,300,000']),
    line(['총 견적가', '81,887,120']),
    line(['1인당', '3,149,505']),
  ];
  const rec = X.reconcile(recLines, X.findUnitRows(recLines, {}));
  ok('총계 ÷ 인원 = 1인당을 검산한다', rec.checks.some((c) => /1인당/.test(c.name)));
  ok('맞으면 통과로 센다', rec.checks.filter((c) => c.ok).length >= 1,
    rec.checks.map((c) => `${c.name}:${c.ok}`).join(' / '));
  /* 일부러 틀린 1인당을 넣어 **잡히는지** 확인한다 (결함 생성기 ③) */
  ln = 0;
  const badLines = [
    line(['인 원', '26']),
    line(['항공료', '700,000', '19', '1', '13,300,000']),
    line(['총 견적가', '81,887,120']),
    line(['1인당', '9,999,999']),
  ];
  const badRec = X.reconcile(badLines, X.findUnitRows(badLines, {}));
  const ppCheck = badRec.checks.find((c) => /1인당/.test(c.name));
  ok('틀린 1인당은 검산이 잡거나 값을 버린다',
    (ppCheck && !ppCheck.ok) || badRec.perPerson == null,
    `perPerson=${badRec.perPerson} check=${ppCheck && ppCheck.ok}`);

  /* ── [9] L0 — 단가표가 없는 문서를 '없다'고 말하는가 ──────────────────── */
  console.log('\n[9] L0 — 단가표가 없는 문서를 정직하게 구분하는가');
  ln = 0;
  const summaryOnly = [
    line(['1인당 요금', '1,590,000']),
    line(['제1일 인천 출발']),
    line(['제2일 다낭 관광']),
  ];
  const so = X.readOneBlock(summaryOnly, {});
  ok('단가표가 없으면 summary로 본다', so.kind.kind === 'summary', so.kind.kind);
  ok('사람이 읽을 수 있는 말로 알려준다', /단가표가 없습니다/.test(so.kind.label), so.kind.label);
  ok('세부내역서는 detail로 본다', b.kind.kind === 'detail', b.kind.kind);

  /* ── [10] 서버·화면이 이 층 구조를 실제로 쓰는가 ──────────────────────── */
  console.log('\n[10] 서버와 화면이 실제로 이 구조를 쓰는가');
  ok('서버가 층 구조 모듈을 부른다', /require\('\.\/_lib\/pdf_extract'\)/.test(quotesSrc));
  ok('서버가 extractQuote로 읽는다', /pdfExtract\.extractQuote\(/.test(quotesSrc));
  ok('담당자 환율을 받아 넘긴다', /fxRate/.test(quotesSrc) && /\{ fxRate: userFx \}/.test(quotesSrc));
  ok('환율 값도 검증한다', /Number\.isFinite\(v\) && v > 0 && v <= 100000/.test(quotesSrc));
  /* ⚠ 좌표가 안 나오는 PDF를 위해 옛 경로를 **살려 둔다**. 죽은 코드로 남기면
     그걸 지키는 테스트도 같이 죽는다(결함 생성기 ③). */
  ok('좌표가 안 나오면 옛 방식으로 물러난다', /if \(!out\.candidates\.length\)/.test(quotesSrc));
  ok('물러난 사실을 화면에 말한다', /예전 방식으로 물러났습니다/.test(quotesSrc));
  ok('AI는 못 채운 칸만 본다', /const missing = \['airfare', 'hotel', 'meal'\]/.test(quotesSrc));
  ok('AI가 실패해도 규칙 결과는 살린다', /규칙 결과는 유지/.test(quotesSrc));

  ok('화면이 9칸을 모두 채운다',
    /airfare: 'pr-airfare', fuel: 'pr-fuel', hotel: 'pr-hotel', hotelName: 'pr-hotel-name'/.test(adminSrc));
  ok('화면이 문서 종류·검산을 보여준다', /renderPdfSummary/.test(adminSrc) && /문서 자체 검산/.test(adminSrc));
  ok('화면이 환율을 물어본다', /pr-fx-input/.test(adminSrc) && /이 환율로 다시 읽기/.test(adminSrc));
  ok('환율 넣고 다시 읽을 때 파일을 다시 고르지 않는다', /prLastPdfBase64/.test(adminSrc));
  ok('화면이 견적 여러 벌을 알려준다', /견적이 \$\{Number\(data\.blockCount\)\}개<\/strong> 들어 있습니다/.test(adminSrc));
  ok('그중 하나를 실제로 고를 수 있다', /selectQuoteBlock\(data, b\.idx\)/.test(adminSrc),
    '목록만 보여주고 바꿀 방법이 없으면 안내가 아니라 약만 올린다');
  ok('바꿀 때 PDF를 다시 올리지 않는다', /서버가 블록마다 \*\*전체 결과\*\*를 함께 내려주므로/.test(adminSrc));
  ok('화면 식비 계산도 서버와 같은 식이다', /÷ 인원 \$\{pax\} ÷ \$\{days\}일/.test(adminSrc));
  ok('환산 근거를 후보 목록에 보인다', /converted\.originalUnit/.test(adminSrc));

  /* ── [11] 화면을 실제로 렌더해 본다 (소스 검사로 끝내지 않는다) ────────── */
  console.log('\n[11] jsdom으로 실제 렌더 — 소스만 보고 넘어가지 않는다');
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;
  const fixture = {
    kind: { kind: 'detail', label: '세부 내역서 — 단가표가 있습니다' },
    values: { airfare: 700000, fuel: 135300, hotel: 224750, hotelName: '노보텔',
      meal: 90384, vehicle: 797500, guide: 217500, sight: 139722, sell: 3303009 },
    evidence: {
      airfare: { rowIdx: 0, line: '항공료 700,000 …', calc: '700,000 × 19 × 1 = 13,300,000', label: '항공료', via: 'rule' },
      meal: { rowIdxs: [1], calc: '식사 총액 7,049,936 ÷ 인원 26 ÷ 3일 = 90,384 (1인 1일)', label: "식사 13줄 · 라벨의 'N일' 3개", via: 'calc' },
      sight: { rowIdxs: [2], calc: '관광 총액 3,632,782 ÷ 인원 26 = 139,722', label: '관광 3줄', via: 'calc',
        note: '골프 12,944,404원은 뺐습니다 — 요율의 관광비와 성격이 다릅니다' },
      /* 판매가는 단가 줄이 아니라 **문서에 적힌 1인당 금액**이라 고를 줄 번호가 없다 */
      sell: { calc: '문서에 적힌 1인당 금액 3,303,009원', label: '1인당', via: 'doc' },
    },
    picked: { airfare: 0, mealRows: [1] },
    candidates: [
      { idx: 0, unit: 700000, qty: 19, times: 1, total: 13300000, label: '항공료', note: '', category: 'airfare', line: '항공료 …', converted: null, unconvertible: false, currency: null },
      { idx: 1, unit: 29000, qty: 26, times: 1, total: 754000, label: '2일 중식', note: '', category: 'meal', line: '2일 중식 …', converted: null, unconvertible: false, currency: null },
      { idx: 2, unit: 9500, qty: 1, times: 46, total: 437000, label: '호텔 <img src=x onerror="window.__xss=1">', note: '', category: 'hotel', line: '…', converted: { from: 'JPY', rate: 9.5, originalUnit: 9500, originalTotal: 437000 }, unconvertible: false, currency: 'JPY' },
    ],
    warnings: ['식비가 하루 20만 원을 넘습니다 — 다른 항목이 섞였는지 확인해 주세요.'],
    rowCount: 3, pax: 26, mealDays: 3, grandTotal: 85878235, perPerson: 3303009,
    reconciliation: { passed: 2, total: 2, checks: [{ name: '총계 ÷ 인원 = 1인당', ok: true, detail: '…' }] },
    blockCount: 2, selectedBlock: 1,
    blocks: [{ idx: 0, total: 81887120, perPerson: null, rows: 44, named: 41, pax: 26, selected: false },
      { idx: 1, total: 85878235, perPerson: 3303009, rows: 55, named: 51, pax: 26, selected: true }],
    needsFxRate: { currency: 'USD', rowCount: 12, all: { USD: 12 } },
    fxRates: { JPY: 9.5 }, fxFromDocument: { JPY: 9.5 }, source: '규칙',
  };
  w.__renderEvidence(fixture);

  const sum = d.getElementById('pr-pdf-summary');
  ok('머리말 상자가 그려진다', !!sum);
  const sumText = sum ? sum.textContent.replace(/\s+/g, ' ') : '';
  ok('문서 종류를 말한다', /세부 내역서/.test(sumText), sumText.slice(0, 80));
  ok('검산 결과를 말한다', /2\/2/.test(sumText) && /제대로 읽었다/.test(sumText));
  ok('견적이 두 벌이라고 알려준다', /견적이 2개/.test(sumText));
  ok('두 벌의 금액을 모두 보여준다', /81,887,120/.test(sumText) && /85,878,235/.test(sumText));
  ok('환율 입력칸이 생긴다', !!d.getElementById('pr-fx-input'));
  ok('왜 오늘 환율로 안 하는지 설명한다', /견적 시점과 다른 값이 실측으로 굳으면/.test(sumText));

  ok('경고가 화면에 뜬다', !!d.getElementById('pr-warnings'));
  const evAir = d.getElementById('pr-ev-airfare');
  ok('항공료 근거가 칸 밑에 붙는다', !!evAir && /13,300,000/.test(evAir.textContent));
  const evMeal = d.getElementById('pr-ev-meal');
  ok('식비 계산식이 그대로 보인다', !!evMeal && /÷ 인원 26 ÷ 3일/.test(evMeal.textContent), evMeal && evMeal.textContent.slice(0, 90));
  const evSight = d.getElementById('pr-ev-sight');
  ok('골프를 뺐다는 사실이 보인다', !!evSight && /골프 12,944,404원은 뺐습니다/.test(evSight.textContent),
    evSight && evSight.textContent.slice(0, 90));
  /* 환산 근거가 후보 목록에 보이는가 — "130,000원"만 보면 대조할 방법이 없다 */
  const opts = Array.from(d.querySelectorAll('#pr-ev-hotel option')).map((o) => o.textContent).join(' | ');
  ok('후보에 환산 근거가 적힌다', /JPY 9,500 × 9.5/.test(opts), opts.slice(0, 140));
  /* 저장형 XSS — 라벨은 견적서에서 온 문자열이다 */
  ok('라벨이 HTML로 실행되지 않는다', !d.querySelector('#pr-ev-hotel img') && w.__xss === undefined);

  /* 식사 체크박스를 건드리면 **같은 식으로** 다시 계산되는가 */
  const cb = d.querySelector('#pr-ev-meal .pr-ev-check input[type=checkbox]');
  ok('식사 줄 체크박스가 있다', !!cb);
  if (cb) {
    cb.checked = false;
    cb.dispatchEvent(new w.Event('change'));
    ok('다 끄면 비운다', d.getElementById('pr-meal').value === '');
    cb.checked = true;
    cb.dispatchEvent(new w.Event('change'));
    ok('다시 켜면 인원·일수로 나눈 값이 들어간다',
      d.getElementById('pr-meal').value === String(Math.round(754000 / 26 / 3)),
      d.getElementById('pr-meal').value);
    ok('화면에도 그 식이 적힌다', /÷ 인원 26 ÷ 3일/.test(d.getElementById('pr-ev-meal').textContent));
  }

  /* ── [12] 근거가 잘리지 않는가 (2026-08-06 사장님 화면 지적) ──────────── */
  console.log('\n[12] 근거를 한 줄에 우겨넣어 자르지 않는가');
  /* ⚠ 배포된 화면에서 9칸을 한 줄에 늘어놓아 칸마다 110px밖에 안 돌아갔고,
     정작 대조해야 할 근거가 "견적서: 700,000 × 19 × 1 = 1…"로 잘려 있었다.
     근거는 읽으라고 있는 것이다 — 줄바꿈되는 편이 낫다. */
  ok('근거 줄이 nowrap+말줄임이 아니다',
    !/\.pr-ev-src\s*\{[^}]*white-space:\s*nowrap/.test(adminSrc), '한 줄로 자르면 대조를 못 한다');
  ok('근거 줄이 줄바꿈된다', /\.pr-ev-src\s*\{[^}]*word-break/.test(adminSrc));
  ok('칸 최소 폭이 넓어졌다 (170px → 260px)',
    /repeat\(auto-fit,minmax\(260px,1fr\)\)/.test(adminSrc),
    '170px면 근거도 후보 이름도 전부 잘린다');
  ok('폭을 왜 그 값으로 정했는지 실측 근거가 적혀 있다',
    /폭 예산.*[\s\S]{0,200}카드 1018px → 3열/.test(adminSrc));
  ok('브라우저로 재는 도구가 저장소에 있다',
    fs.existsSync(path.join(ROOT, 'ai-loop', 'check_pr_fields.py')));

  /* 계산으로 나온 값(관광비·판매가)은 고를 줄 번호가 없다 — 그래도 '고르지 않음'으로
     보이면 안 된다. 값이 채워져 있는데 안 골랐다고 읽힌다. */
  const sightSel = d.querySelector('#pr-ev-sight select');
  ok('계산으로 나온 값도 목록에 보인다',
    !!sightSel && /계산으로 나온 값/.test(sightSel.textContent), sightSel && sightSel.textContent.slice(0, 60));
  ok('그 값이 선택된 상태다 (고르지 않음으로 안 보인다)',
    !!sightSel && sightSel.value === '__calc__', sightSel && sightSel.value);
  const sellSel = d.querySelector('#pr-ev-sell select');
  ok('판매가도 마찬가지다', !!sellSel && sellSel.value === '__calc__', sellSel && sellSel.value);

  /* ── [13] 어느 칸을 확인해야 하는지 한눈에 보이는가 ────────────────────── */
  console.log('\n[13] 값의 출처가 칸마다 보이는가 (확인이 필요한 칸이 눈에 띄게)');
  /* ⚠ 앞 절에서 식사 체크박스를 눌러 배지가 '직접 고침'으로 바뀌어 있다 — 그건 정상
     동작이다. 여기서는 **갓 추출한 상태**를 봐야 하므로 다시 그린다. */
  w.__renderEvidence(fixture);
  const badgeOf = (inputId) => {
    const el = d.getElementById(inputId);
    const b = el && el.previousElementSibling && el.previousElementSibling.querySelector('.pr-badge');
    return b ? { text: b.textContent, cls: b.className } : null;
  };
  ok('견적서 한 줄에서 온 값은 "견적서"', (badgeOf('pr-airfare') || {}).text === '견적서',
    JSON.stringify(badgeOf('pr-airfare')));
  ok('여러 줄을 합친 값은 "계산"', (badgeOf('pr-meal') || {}).text === '계산',
    JSON.stringify(badgeOf('pr-meal')));
  ok('계산 배지는 색이 다르다', /via-calc/.test((badgeOf('pr-meal') || {}).cls || ''));
  ok('호텔명에도 배지가 붙는다', !!badgeOf('pr-hotel-name'), JSON.stringify(badgeOf('pr-hotel-name')));
  /* ⚠ 출처는 **값(via)**으로 판단해야 한다. 문구를 정규식으로 찾으면 문구가 바뀔 때
     표시만 조용히 틀린다 — 그게 이 저장소가 반복해서 당한 유형이다. */
  ok('출처를 문구가 아니라 값으로 읽는다',
    /const via = ev \? \(ev\.via \|\| 'rule'\) : 'none'/.test(adminSrc));
  ok('근거 상자에도 같은 출처가 붙는다',
    /via-rule/.test(d.getElementById('pr-ev-airfare').className), d.getElementById('pr-ev-airfare').className);

  /* 후보 목록은 접어 둔다 — 9칸 전부 펼쳐져 있으면 손봐야 할 칸이 안 보인다 */
  const air = d.getElementById('pr-ev-airfare');
  ok('후보 목록이 접혀 있다', !!air.querySelector('details') && !air.querySelector('details').open);
  ok('접힌 채로도 몇 개인지는 보인다', /다른 줄로 바꾸기 \(\d+개\)/.test(air.textContent), air.textContent.slice(0, 80));

  /* 사람이 값을 바꾸면 배지도 함께 바뀌어야 한다 —
     화면엔 '견적서'라고 적혀 있는데 값은 사람이 바꾼 것, 같은 상태를 만들면 안 된다 */
  const airSel = air.querySelector('select');
  airSel.value = '1';
  airSel.dispatchEvent(new w.Event('change'));
  ok('직접 고르면 배지가 "직접 고침"으로 바뀐다', (badgeOf('pr-airfare') || {}).text === '직접 고침',
    JSON.stringify(badgeOf('pr-airfare')));
  ok('근거 상자 색도 함께 바뀐다', /via-manual/.test(d.getElementById('pr-ev-airfare').className));
  ok('고른 줄의 값이 들어간다', d.getElementById('pr-airfare').value === '29000',
    d.getElementById('pr-airfare').value);

  /* ⚠ 계산식에 고정폭 글꼴을 쓰면 한글이 한 글자씩 벌어진다(실측에서 확인) */
  ok('계산식에 monospace를 쓰지 않는다',
    !/\.pr-ev-calc\s*\{[^}]*monospace/.test(adminSrc), '한글이 "식 사  총 액"처럼 벌어진다');
  ok('대신 숫자 폭만 고정한다', /\.pr-ev-calc\s*\{[^}]*tabular-nums/.test(adminSrc));

  /* ── [14] 날짜 — 언제 만들고 언제 출발하는 견적인가 ────────────────────── */
  console.log('\n[14] L4b — 견적 작성일·출발일을 읽는가 (시즌·리드타임 검증의 재료)');
  ln = 0;
  const dated = [
    line(['수신 한화손해보험 GA영업지원파트 날짜 2026-08-06']),
    line(['기준 환율 ($) 1,400 일정 2026.11.08 (2박3일)']),
    line(['인 원', '70']),
    line(['항공료', '360,000', '70', '1', '25,200,000']),
  ];
  const dd = X.findDates(dated);
  ok('견적 작성일을 읽는다', dd.quoteDate === '2026-08-06', String(dd.quoteDate));
  /* ⚠ `\b날짜\b`로 쓰면 한 건도 안 걸린다 — 자바스크립트의 \b는 한글을 낱말로 안 본다 */
  ok('한글 낱말 경계(\\b)에 기대지 않는다', !/\\\\b날짜\\\\b/.test(libSrcRZ));
  ok('출발일을 읽는다', dd.departDate === '2026-11-08', String(dd.departDate));
  ok('박수·일수를 읽는다', dd.nights === 2 && dd.days === 3, `${dd.nights}박${dd.days}일`);
  ok('귀국일을 박수로 계산하고 추정임을 밝힌다',
    dd.returnDate === '2026-11-10' && dd.returnEstimated === true, `${dd.returnDate}/${dd.returnEstimated}`);
  ok('리드타임을 센다', dd.leadDays === 94, String(dd.leadDays));
  ok('머리글에서 읽었음을 표시한다', dd.departVia === 'header', String(dd.departVia));

  /* 기간이 머리글에 없고 일정표에만 「02월 04일」처럼 연도 없이 있는 견적서가 절반이 넘는다 */
  ln = 0;
  const itin = [
    line(['견적서 작성일 2025-12-20']),
    line(['제1일 인천 OZ755 18:45 인천 국제공항 출발']),
    line(['02월 04일 다낭 21:45 다낭 국제공항 도착']),
    line(['인 원', '26']),
  ];
  const di = X.findDates(itin);
  ok('일정표에서도 출발일을 읽는다', di.departDate === '2026-02-04', String(di.departDate));
  ok('연도는 견적 작성일에서 끌어오되 여행이 뒤임을 안다', di.departDate > di.quoteDate);
  ok('추정이라고 표시한다 (사람이 보고 넘어가게)', di.departVia === 'itinerary', String(di.departVia));
  /* 연도를 알 길이 없으면 **지어내지 않는다** */
  ln = 0;
  const noYear = [line(['제1일 출발']), line(['02월 04일 도착']), line(['인 원', '26'])];
  ok('연도를 모르면 날짜를 지어내지 않는다', X.findDates(noYear).departDate == null,
    String(X.findDates(noYear).departDate));

  console.log('\n  — 서버·화면 연결');
  ok('서버가 날짜를 함께 내려보낸다', /dates: out\.dates/.test(quotesSrc));
  ok('제보 저장이 출발일을 받는다', /departDate, quoteDate, nights/.test(quotesSrc));
  ok('날짜 형식이 틀리면 거절한다', /invalid_date/.test(quotesSrc));
  ok('박수 범위도 검사한다', /invalid_nights/.test(quotesSrc));
  ok('DB 컬럼이 있다',
    /add column if not exists depart_date date/.test(migrateSrcRZ)
    && /add column if not exists quote_date date/.test(migrateSrcRZ));
  ok('출발일로 모아 보는 인덱스도 만든다', /actual_price_reports_depart_idx/.test(migrateSrcRZ));
  /* ⚠ 리드타임은 저장하지 않는다 — depart_date − quote_date로 언제든 나온다 */
  ok('리드타임을 따로 저장하지 않는다 (같은 사실을 두 곳에 안 적는다)',
    !/add column if not exists lead_days/.test(migrateSrcRZ));
  ok('화면에 출발일 칸이 있다', /id="pr-depart"/.test(adminSrc) && /id="pr-quote-date"/.test(adminSrc));
  ok('추출한 날짜를 칸에 채운다', /function applyPdfDates/.test(adminSrc));
  ok('추정한 날짜라고 화면이 말한다', /일정표에서 읽었고 연도는 추정했습니다/.test(adminSrc));
  ok('리드타임을 화면에 보여준다', /리드타임/.test(adminSrc));
  ok('제출할 때 날짜를 함께 보낸다', /departDate: \(document\.getElementById\('pr-depart'\)/.test(adminSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__renderEvidence = (data) => renderPdfEvidence(data);
  currentUser = { id: '7', username: 'staff1', displayName: '김직원', role: 'staff' };
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      w.URL.createObjectURL = () => 'blob:test';
      w.URL.revokeObjectURL = () => {};
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

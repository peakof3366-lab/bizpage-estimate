/* SL 검증 — 좌우로 나란한 **두 표**를 갈라서 한 조로만 계산한다

   왜 —  견적서 한 장에 표가 좌우로 둘 들어가는 양식이 있다. 실측(글로벌 바모스 오키나와):
   왼쪽은 **관광조 48명**, 오른쪽은 **골프조 20명**이고 항목 이름이 그대로 겹친다
   (조식·중식·석식이 두 벌씩). L1은 「같은 높이에 그려진 글자는 같은 줄」이라는 기하학만
   쓰므로 **두 표가 한 줄로 합쳐진다.**

   단가를 고르는 칸(호텔·차량·가이드)은 '가장 비싼 줄' 하나를 뽑으니 티가 안 난다.
   그런데 **식비·관광비는 합을 인원으로 나눈다** — 두 조의 식사를 다 더한 뒤 한 조의
   인원으로만 나누면 그대로 부푼다:
     · 1인 1일 식비 **99,177원** (요율표 25,000의 4배)
     · 줄 커버리지 **153%** — 총계보다 많이 읽었다는 뜻이다
   그리고 그 부푼 값이 **목적지 중앙값을 끌어올려**, 정작 맞는 값(하나투어 오키나와
   26,973)이 감사기에서 '이상값'으로 뜨게 만든다. **다수 쪽이 틀린 상태**가 된다.

   ⚠ **두 표 다 진짜 견적이다.** 오른쪽을 '오염'이라 부르면 안 된다 — 골프조도 이 행사의
     일부다. 다만 한 조를 골라 **그 조로만** 계산해야 1인당이 맞는다. 나머지 줄은
     후보 목록에 그대로 남겨 담당자가 고를 수 있게 한다(조용히 버리지 않는다).
   ⚠ SB의 「줄 병합 오염」과 같은 뿌리다 — 그때는 옆 표의 숫자 하나가 단가를 물들였고
     (가이드 746,210, 실제 95,000), 여기서는 표 전체가 합에 섞인다.

   실행: node ai-loop/test_sL_side_tables.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 표 — **x좌표가 곧 뜻**이라 칸마다 위치를 직접 준다.
   왼쪽 표는 x 60~240, 오른쪽 표는 x 380~560. 실제 견적서의 열 간격을 옮긴 것이다. */
let ln = 0;
const at = (pairs) => {
  const o = { page: 1, y: 700 - ln * 10, idx: ln, cells: pairs.map(([x, s]) => ({ s: String(s), x })), text: '' };
  o.text = o.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return o;
};
/* 한 줄에 왼쪽 표 한 칸 + 오른쪽 표 한 칸 (L1이 합쳐 놓은 모양 그대로) */
const both = (L, R) => {
  const cells = [];
  if (L) [[60, L[0]], [120, L[1]], [160, L[2]], [200, L[3]], [240, L[4]]].forEach((p) => cells.push(p));
  if (R) [[380, R[0]], [440, R[1]], [480, R[2]], [520, R[3]], [560, R[4]]].forEach((p) => cells.push(p));
  return at(cells);
};

/* 관광조 48명(왼쪽) · 골프조 20명(오른쪽) — 항목 이름이 겹친다 */
const twoTables = () => {
  ln = 0;
  return [
    at([[60, '인 원'], [120, '48']]),
    both(['1일 중식', '18,601', '1', '48', '892,848'], ['1일 중식', '23,750', '1', '20', '475,000']),
    both(['1일 석식', '47,310', '1', '48', '2,270,880'], ['1일 석식', '38,000', '1', '20', '760,000']),
    both(['2일 중식', '31,141', '1', '48', '1,494,768'], ['2일 중식', '20,000', '1', '20', '400,000']),
    both(['2일 석식', '49,400', '1', '48', '2,371,200'], ['2일 석식', '133,000', '1', '20', '2,660,000']),
  ];
};

/* ══ [1] 두 표를 알아보는가 ═══════════════════════════════════════════════ */
console.log('[1] 좌우로 나란한 표를 알아보는가');
{
  const r = X.readOneBlock(twoTables(), {}, null);
  ok('두 표라고 판정한다', r.sideTables && r.sideTables.tables === 2, JSON.stringify(r.sideTables));
  ok('줄이 많은 쪽을 본 표로 삼는다', r.sideTables && r.sideTables.mainRows >= r.sideTables.otherRows,
    JSON.stringify(r.sideTables));
  /* 자르는 자리는 **두 총액 열 사이**다(왼쪽 240 · 오른쪽 560 → 400).
     ⚠ 라벨 열(60·380)이 아니라 총액 열로 가른다 — 총액은 표마다 한 열이라 가장 안정적이다. */
  ok('두 총액 열 사이에서 가른다', r.sideTables && r.sideTables.cutX > 240 && r.sideTables.cutX < 560,
    JSON.stringify(r.sideTables));
}

/* ══ [2] 다른 조의 줄이 합에 섞이지 않는가 ════════════════════════════════ */
console.log('\n[2] 두 조의 식사를 다 더하지 않는가');
{
  const r = X.readOneBlock(twoTables(), {}, null);
  const mainSum = 892848 + 2270880 + 1494768 + 2371200;
  const allSum = mainSum + 475000 + 760000 + 400000 + 2660000;
  const calc = String(r.evidence.meal && r.evidence.meal.calc);
  ok('본 표의 합만 쓴다', calc.indexOf(mainSum.toLocaleString()) >= 0, calc);
  ok('두 표를 더한 값이 아니다', calc.indexOf(allSum.toLocaleString()) < 0, calc);
}

/* ══ [3] 버리지는 않는가 — 후보 목록에는 남는다 ═══════════════════════════
   ⚠ 두 표 다 진짜 견적이다. 골프조 값이 필요하면 담당자가 1클릭으로 고를 수 있어야 한다. */
console.log('\n[3] 다른 표의 줄을 조용히 버리지 않는가');
{
  const r = X.readOneBlock(twoTables(), {}, null);
  const other = (r.candidates || []).filter((c) => c.otherTable);
  ok('다른 표의 줄이 후보 목록에 남아 있다', other.length >= 2, String(other.length));
  ok('다른 표라고 표시돼 있다', other.every((c) => c.otherTable === true));
  ok('본 표의 줄에는 표시가 없다',
    (r.candidates || []).some((c) => !c.otherTable && c.total === 892848));
}

/* ══ [4] 표가 하나뿐인 문서를 건드리지 않는가 ═════════════════════════════
   ⚠ 이 검사가 없으면 평범한 견적서에서도 오른쪽 비고 칸을 '다른 표'로 오해할 수 있다. */
console.log('\n[4] 표가 하나뿐이면 아무것도 하지 않는가');
{
  ln = 0;
  const one = [
    at([[60, '인 원'], [120, '20']]),
    both(['1일 중식', '30,000', '1', '20', '600,000'], null),
    both(['1일 석식', '40,000', '1', '20', '800,000'], null),
    both(['2일 중식', '30,000', '1', '20', '600,000'], null),
    both(['2일 석식', '40,000', '1', '20', '800,000'], null),
  ];
  const r = X.readOneBlock(one, {}, null);
  ok('두 표라고 하지 않는다', !r.sideTables, JSON.stringify(r.sideTables));
  ok('아무 줄도 빠지지 않는다', (r.candidates || []).every((c) => !c.otherTable));
  ok('식비가 네 줄 전부로 계산된다',
    String(r.evidence.meal && r.evidence.meal.calc).indexOf((600000 + 800000 + 600000 + 800000).toLocaleString()) >= 0,
    String(r.evidence.meal && r.evidence.meal.calc));
}

/* ══ [5] 줄이 적으면 가르지 않는다 ═══════════════════════════════════════
   양쪽 다 여러 줄이어야 '표'다. 한두 줄 튀는 것은 옆 표가 아니라 비고일 수 있다. */
console.log('\n[5] 근거가 얇으면 가르지 않는가');
{
  ln = 0;
  const thin = [
    at([[60, '인 원'], [120, '20']]),
    both(['1일 중식', '30,000', '1', '20', '600,000'], null),
    both(['1일 석식', '40,000', '1', '20', '800,000'], null),
    both(['2일 중식', '30,000', '1', '20', '600,000'], ['메모', '1', '1', '1', '10,000']),
  ];
  const r = X.readOneBlock(thin, {}, null);
  ok('한쪽이 얇으면 두 표로 보지 않는다', !r.sideTables, JSON.stringify(r.sideTables));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

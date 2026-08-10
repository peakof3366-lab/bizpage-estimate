/* SH 검증 — 총계를 제대로 읽고, 요약 줄을 단가로 세지 않는다

   왜 —  견적서 총계는 이 추출기의 **채점 기준**이다. 문서 자체 검산(뽑은 줄 합계 ≤
   총계)도, 「우리가 총계의 몇 %를 설명하는가」도 전부 총계 없이는 돌지 않는다.
   그런데 실측(코퍼스 46건) 결과 **27건에서 총계를 못 읽고 있었다.** 이유가 둘이었다.

   ① **요약 줄이 단가 줄로 잡힌다.** 「성인 (1인) ₩3,020,000 x 10명 ₩ 30,200,000」이
      `3,020,000 × 10 = 30,200,000`으로 산술 검산을 그대로 통과한다. 그러면 그 문서의
      금액이 **두 번** 세어져 커버리지가 200%가 되고(좋은친구 양식 4건 전부),
      「뽑은 줄 합계 ≤ 총계」 검산이 깨진다. 더 나쁜 것은 그 줄이 **1인당 금액을 단가
      자리에** 들고 있다는 점이다 — 분류만 붙으면 곧바로 엉뚱한 항목의 대표 단가가 된다.
   ② **총계를 「합계 ¥ 2,557,000」으로만 적는 양식**을 못 읽었다. 정규식이 「합계
      **금액**」만 봤고, **외화 총계를 환산하지도** 않았다.

   ⚠ 그리고 ②를 고치다가 두 가지를 새로 겪었다 — 둘 다 이 파일이 고정한다:
     · **코드는 금액이 아니다.** 「상품코드 APQ221260609PR9」가 같은 높이의 합계와 한 줄로
       합쳐지면서 코드 속 숫자가 총계로 읽혔다 → 총계 **23억**(실제 1,700만 원대).
     · **「합계」와 「총 견적가」는 다른 말이다.** 원가 시트의 「합계」는 마진이 빠진
       **원가 합계**다. 이걸 견적 총액으로 받았더니 「1인당 × 인원 ≈ 총액」 검사가
       원가 기준으로 돌아 **1인 판매가가 14건에서 통째로 사라졌다.** 칸을 나눠야 한다.

   실행: node ai-loop/test_sH_totals.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 40;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
const doc = (rows) => { ln = 0; return rows.map((r) => line(r)); };

/* ══ [1] 요약 줄은 단가 줄이 아니다 ═════════════════════════════════════════ */
console.log('[1] 총계를 풀어 쓴 줄이 단가 줄이 되지 않는가');
{
  const rows = X.findUnitRows(doc([
    ['성인 (1인)', '₩3,020,000', 'x', '10명', '₩', '30,200,000'],
    ['하버그랜드구룡', '275,500', '6', '4', '6,612,000'],
  ]), {});
  ok('「성인 (1인) … x 10명」은 단가 줄이 아니다', !rows.some((r) => r.unit === 3020000),
    JSON.stringify(rows.map((r) => r.unit)));
  ok('진짜 항목 줄은 그대로 남는다', rows.some((r) => r.unit === 275500),
    JSON.stringify(rows.map((r) => r.unit)));
}
{
  const rows = X.findUnitRows(doc([['1인 요금', '1,709,192', '18', '1', '30,765,456']]), {});
  ok('「1인 요금」 줄도 뺀다', !rows.length, JSON.stringify(rows.map((r) => r.unit)));
}
{
  /* ⚠ '1인'만 보고 거르면 진짜 항목이 사라진다 — 좁혀서 걸러야 한다 */
  const rows = X.findUnitRows(doc([['가이드 1인', '95,000', '4', '1', '380,000']]), {});
  ok('「가이드 1인」 같은 진짜 항목은 안 걸린다', rows.some((r) => r.unit === 95000),
    JSON.stringify(rows.map((r) => r.unit)));
}
{
  /* ⚠ 소계는 빼면 안 된다 — L3.5가 묶음 경계로 쓴다(빼면 구분 열 상속이 통째로 죽는다).
     구분 열은 **좌표**로 찾으므로 여기서는 칸 위치를 직접 준다(구분 20 · 라벨 60). */
  let n = 0;
  const at = (pairs) => {
    const o = { page: 1, y: 700 - n * 10, idx: n, cells: pairs.map(([x, s]) => ({ s: String(s), x })), text: '' };
    o.text = o.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
    n++;
    return o;
  };
  const row = (mark, label, unit, qty, times, total) => at(
    (mark ? [[20, mark]] : []).concat([[60, label]], [unit, qty, times, total].map((v, i) => [120 + i * 40, v]))
  );
  n = 0;
  const lines = [
    at([[10, '인 원'], [60, '20']]),
    row('호텔', '두짓타니', '217,000', '3', '15', '9,765,000'),
    row('', '쉐라톤 가든뷰', '253,000', '3', '15', '11,385,000'),
    at([[80, '소계'], [240, '21,150,000']]),
    row('차량', '45인승', '550,000', '1', '1', '550,000'),
    at([[80, '소계'], [240, '550,000']]),
  ];
  const g = X.groupColumn(lines, X.findUnitRows(lines, {}));
  ok('소계 줄은 여전히 묶음 경계로 살아 있다', !!g.byLine, g.why);
}

/* ══ [2] 「합계 ¥ 2,557,000」 — 외화 총계를 환산해 읽는가 ══════════════════ */
console.log('\n[2] 외화로만 적힌 총계를 읽는가');
{
  const lines = doc([
    ['인 원', '33'],
    ['차량', '대형버스', '¥', '95,000', '4', '1', '¥', '380,000'],
    ['합계', '¥', '2,557,000'],
  ]);
  const withFx = X.readOneBlock(lines, { JPY: 9.5 }, null);
  ok('환율을 알면 원화로 환산해 읽는다',
    withFx.itemsTotal === Math.round(2557000 * 9.5) || withFx.itemsTotal === 2557000 * 9.5,
    String(withFx.itemsTotal));
  const noFx = X.readOneBlock(lines, {}, null);
  ok('환율을 모르면 엔 숫자를 원화로 읽지 않는다', noFx.itemsTotal !== 2557000,
    String(noFx.itemsTotal));
}

/* ══ [3] 「합계」와 「총 견적가」는 다른 칸이다 ════════════════════════════
   원가 시트의 「합계」는 마진이 빠진 원가 합계다. 견적 총액으로 받으면
   「1인당 × 인원 ≈ 총액」 검사가 원가 기준으로 돌아 판매가가 전부 탈락한다. */
console.log('\n[3] 원가 합계 때문에 1인 판매가가 사라지지 않는가');
{
  const r = X.readOneBlock(doc([
    ['인 원', '33'],
    ['차량', '대형버스', '¥', '95,000', '4', '1', '¥', '380,000'],
    ['합계', '¥', '2,557,000'],
    ['판매가', '1,559,409'],
  ]), { JPY: 9.5 }, null);
  ok('항목 합계는 itemsTotal로 들어간다', r.itemsTotal > 0, String(r.itemsTotal));
  ok('견적 총액(grandTotal)으로는 안 들어간다', !r.grandTotal, String(r.grandTotal));
  ok('1인 판매가가 살아남는다', r.perPerson === 1559409, String(r.perPerson));
}
{
  /* 「총 견적가」라고 적힌 것은 예전대로 grandTotal이다 */
  const r = X.readOneBlock(doc([
    ['인 원', '18'],
    ['차량', '대형버스', '145,000', '10', '1', '1,450,000'],
    ['총 금액', '30,765,450'],
  ]), {}, null);
  ok('「총 금액」은 grandTotal이다', r.grandTotal === 30765450, String(r.grandTotal));
}

/* ══ [4] 코드는 금액이 아니다 ═════════════════════════════════════════════
   L1은 같은 높이를 한 줄로 본다 — 「상품코드 …」와 합계가 나란히 그려지면 합쳐진다. */
console.log('\n[4] 상품코드 속 숫자를 총계로 읽지 않는가');
{
  const r = X.readOneBlock(doc([
    ['인 원', '44'],
    ['호텔', '헤난 알로나', '214,500', '3', '22', '14,157,000'],
    ['상품코드', 'APQ221260609PR9', '합계', '17,433,130'],
  ]), {}, null);
  ok('코드 숫자(221260609)를 총계로 읽지 않는다', r.itemsTotal !== 221260609, String(r.itemsTotal));
  ok('같은 줄의 진짜 합계는 읽는다', r.itemsTotal === 17433130, String(r.itemsTotal));
}
{
  /* 통화 표기가 붙은 금액 칸은 코드가 아니다 — 함께 걸러 버리면 안 된다 */
  const r = X.readOneBlock(doc([
    ['인 원', '10'],
    ['차량', '버스', '928,000', '1', '5', '4,640,000'],
    ['합계', '₩ 30,200,000'],
  ]), {}, null);
  ok('「₩ 30,200,000」은 금액으로 읽는다', r.itemsTotal === 30200000, String(r.itemsTotal));
}

/* ══ [5] 검산 ②가 항목 합계로도 돌아가는가 ═══════════════════════════════
   견적 총액이 없는 원가 시트에서 이 검산이 통째로 안 돌고 있었다(46건 중 27건). */
console.log('\n[5] 견적 총액이 없어도 자체 검산이 도는가');
{
  const r = X.readOneBlock(doc([
    ['인 원', '33'],
    ['차량', '대형버스', '¥', '95,000', '4', '1', '¥', '380,000'],
    ['합계', '¥', '2,557,000'],
  ]), { JPY: 9.5 }, null);
  const c = (r.reconciliation.checks || []).find((x) => /뽑은 줄 합계/.test(x.name));
  ok('「뽑은 줄 합계 ≤ 총계」 검산이 돈다', !!c, JSON.stringify(r.reconciliation.checks));
  ok('무엇을 기준으로 쟀는지 밝힌다', !!c && /항목 합계/.test(c.detail), c && c.detail);
  ok('통과한다', !!c && c.ok === true, c && c.detail);
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

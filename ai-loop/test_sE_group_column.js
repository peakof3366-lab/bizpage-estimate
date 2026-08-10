/* SE 검증 — 표의 **구분 열**을 읽어 브랜드명뿐인 줄을 분류한다

   왜 —  어휘 분류가 못 잡는 줄이 하나 있다. **브랜드명뿐인 줄**이다.
   「메트로폴리탄 이케부쿠로(토)」·「쉐라톤 가든뷰」·「도야 만세각」에는 호텔이라는
   낱말이 없다. 실측(견적서 46건): 검산줄 960개 중 **224개(23.3%)가 분류 없음**이었고,
   그 때문에 **46건 중 22건이 객실 단가를 아예 못 냈다.** 어휘에 브랜드명을 계속
   더하는 것은 끝이 없다 — 호텔 브랜드는 새로 생긴다.

   그런데 견적서 표에는 답이 이미 그려져 있다. 맨 왼쪽 **구분 열**에 '항공·호텔·식사·
   차량·가이드'가 적혀 있다. 다만 그 칸이 **병합 셀**이라 글자가 묶음의 한 줄에만
   떨어지고, **그 한 줄이 어디냐가 양식마다 다르다**:
     · BSI 도쿄   — 묶음의 **가운데** 줄
     · 글로벌 세부 — 묶음의 **첫** 줄
   ⚠ 그래서 「앞 줄의 분류를 물려받는다」로는 못 푼다. BSI에서는 호텔 묶음 바로 위가
     「항공사 패널티」라 **패널티를 물려받는다.** 방향을 가정하면 반드시 틀린다.
   대신 **소계 줄**을 경계로 쓴다(코퍼스 36/46건에 있다). 소계와 소계 사이가 한 묶음이고
   그 안에 구분 글자가 하나만 있으면 그게 그 묶음의 분류다.

   이 파일이 고정하는 성질 —
     ① 마크가 묶음의 **어디에 있든**(첫 줄·가운데·끝 줄) 같은 결과가 나온다
     ② **자기 라벨이 이긴다** — 「호텔 패널티」는 penalty로 남는다(SB 수정이 안 풀린다)
     ③ **구분 열이 비고를 이긴다** — 비고에는 옆 표에서 흘러든 글자가 섞인다
     ④ 구조가 안 보이면 **상속하지 않고 이유를 남긴다**(조용한 폴백 금지)

   실행: node ai-loop/test_sE_group_column.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 표 — 실제 견적서를 쓰지 않는다(참가자 실명·거래처 단가가 들어 있다).
   ⚠ 이 테스트는 **x좌표가 곧 뜻**이라 셀마다 위치를 직접 준다.
      구분 열 20 · 라벨 60 · 단가부터 120 — 실제 견적서의 열 간격을 옮긴 것이다. */
const MARK_X = 20, LABEL_X = 60, NUM_X = 120;
let ln = 0;
const at = (pairs) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  pairs.forEach(([x, s]) => out.cells.push({ s: String(s), x }));
  out.cells.sort((a, b) => a.x - b.x);
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
/* 표 한 줄: 구분(없으면 '') · 라벨 · 단가 · 수량 · 횟수 · 총액 · 비고(선택) */
const row = (mark, label, unit, qty, times, total, note) => {
  const cells = [];
  if (mark) cells.push([MARK_X, mark]);
  if (label) cells.push([LABEL_X, label]);
  [unit, qty, times, total].forEach((v, i) => cells.push([NUM_X + i * 40, v]));
  if (note) cells.push([NUM_X + 200, note]);
  return at(cells);
};
const mark = (t) => at([[MARK_X, t]]);
const sub = (v) => at([[LABEL_X + 20, '소계'], [NUM_X + 120, v]]);
const plain = (t, x) => at([[x == null ? LABEL_X : x, t]]);
const doc = (fn) => { ln = 0; return fn(); };
const catOf = (rows, unit) => { const r = rows.find((x) => x.unit === unit); return r && r.category; };
const fromOf = (rows, unit) => { const r = rows.find((x) => x.unit === unit); return r && r.categoryFrom; };

/* 실제 BSI 도쿄의 모양 — 마크가 호텔 묶음의 **가운데** 줄에 떨어지고,
   그 묶음 바로 위는 「항공사 패널티」다(앞 줄 상속이면 패널티를 물려받는다). */
const bsiShape = () => doc(() => [
  plain('인 원', 10), at([[10, '인 원'], [60, '18']]),
  row('', '항공료', '315,000', '1', '1', '315,000'),
  mark('항공'),
  row('', '유류할증료+TAX', '100,200', '6', '1', '601,200'),
  row('', '항공사 패널티', '220,000', '1', '1', '220,000'),
  sub('8,151,500'),
  row('', '메트로폴리탄 이케부쿠로(금)', '210,000', '18', '1', '3,780,000'),
  mark('호텔'),                                   /* ← 묶음의 가운데 */
  row('', '메트로폴리탄 이케부쿠로(토)', '225,000', '18', '1', '4,050,000'),
  row('', '호텔 패널티', '18,000', '2', '5', '180,000'),
  sub('8,010,000'),
  row('식사', '중식', '32,400', '18', '1', '583,200'),
  sub('583,200'),
]);

/* ══ [1] 마크가 묶음의 가운데에 있어도 상속된다 ═════════════════════════ */
console.log('[1] 병합된 구분 글자가 묶음 전체에 걸리는가');
{
  const lines = bsiShape();
  const rows = X.findUnitRows(lines, {});
  const g = X.groupColumn(lines, rows);
  ok('구분 열을 읽었다', !!g.byLine, g.why);
  const r = X.readOneBlock(lines, {}, null);
  const c = r.candidates;
  ok('브랜드명 줄(금)이 hotel이 된다', catOf(c, 210000) === 'hotel', String(catOf(c, 210000)));
  ok('브랜드명 줄(토)이 hotel이 된다', catOf(c, 225000) === 'hotel', String(catOf(c, 225000)));
  ok('그 분류의 출처가 구분 열이라고 남는다', fromOf(c, 225000) === 'group', String(fromOf(c, 225000)));
  ok('객실 단가가 채워진다', r.values.hotel === 225000, String(r.values.hotel));
  ok('호텔명이 브랜드명으로 나간다', r.values.hotelName === '메트로폴리탄 이케부쿠로(토)', String(r.values.hotelName));
}

/* ══ [2] 앞 줄 상속이었으면 틀렸을 자리 ══════════════════════════════════
   호텔 묶음 **바로 위**가 「항공사 패널티」다. 방향을 가정하면 여기서 깨진다. */
console.log('\n[2] 앞 줄을 물려받는 방식이 아닌가');
{
  const r = X.readOneBlock(bsiShape(), {}, null);
  ok('호텔 줄이 penalty로 물들지 않는다', catOf(r.candidates, 210000) !== 'penalty');
  ok('호텔 줄이 airfare로 물들지 않는다', catOf(r.candidates, 210000) !== 'airfare');
}

/* ══ [3] 자기 라벨이 구분 열을 이긴다 — SB 수정이 풀리지 않는다 ══════════ */
console.log('\n[3] 「호텔 패널티」가 다시 대표 객실 단가가 되지 않는가');
{
  const r = X.readOneBlock(bsiShape(), {}, null);
  ok('패널티 줄은 penalty로 남는다', catOf(r.candidates, 18000) === 'penalty', String(catOf(r.candidates, 18000)));
  ok('패널티 줄의 분류 출처는 자기 라벨이다', fromOf(r.candidates, 18000) === 'label');
  ok('호텔명이 「패널티」로 나가지 않는다', !/패널티/.test(String(r.values.hotelName)));
}

/* ══ [4] 마크가 묶음의 첫 줄에 있는 양식도 같은 결과 ════════════════════ */
console.log('\n[4] 마크가 묶음 첫 줄에 붙는 양식(글로벌 세부 모양)');
{
  const lines = doc(() => [
    at([[10, '인 원'], [60, '30']]),
    row('호텔', '두짓타니 디럭스', '217,000', '3', '15', '9,765,000'),   /* ← 첫 줄 */
    row('', '쉐라톤 가든뷰', '253,000', '3', '15', '11,385,000'),
    sub('21,150,000'),
    row('차량', '미샌딩 45인승', '550,000', '1', '1', '550,000'),
    sub('550,000'),
  ]);
  const r = X.readOneBlock(lines, {}, null);
  ok('첫 줄 마크도 묶음 전체에 걸린다', catOf(r.candidates, 253000) === 'hotel', String(catOf(r.candidates, 253000)));
  ok('총액이 큰 쪽이 대표 객실 단가다', r.values.hotel === 253000, String(r.values.hotel));
}

/* ══ [5] 구분 열이 비고를 이긴다 ════════════════════════════════════════
   실측(글로벌 북해도): 견적서 오른쪽에 원가 요약표가 있어 그 표의 '인솔자'·'가이드'
   글자가 같은 높이의 호텔 줄에 딸려 왔고, 그래서 호텔 줄이 guide로 분류됐다. */
console.log('\n[5] 옆 표에서 흘러든 비고보다 구분 열이 강한가');
{
  const lines = doc(() => [
    at([[10, '인 원'], [60, '33']]),
    row('호텔', '도야 만세각', '145,000', '1', '33', '4,785,000', '가이드'),
    row('', '삿포로 뷰', '130,000', '1', '33', '4,290,000', '인솔자'),
    sub('9,075,000'),
    row('가이드', '가이드 일비', '95,000', '4', '1', '380,000'),
    sub('380,000'),
  ]);
  const r = X.readOneBlock(lines, {}, null);
  ok('비고에 「인솔자」가 있어도 hotel이다', catOf(r.candidates, 130000) === 'hotel', String(catOf(r.candidates, 130000)));
  ok('가이드 일당이 호텔 줄에 오염되지 않는다', r.values.guide === 95000, String(r.values.guide));
}

/* ══ [6] 구조가 안 보이면 상속하지 않고 이유를 남긴다 ═══════════════════ */
console.log('\n[6] 못 읽을 때 조용히 넘어가지 않는가');
{
  /* 소계가 없다 — 마크가 묶음의 위인지 가운데인지 알 방법이 사라진다 */
  const lines = doc(() => [
    at([[10, '인 원'], [60, '20']]),
    row('호텔', '두짓타니', '217,000', '3', '15', '9,765,000'),
    row('', '쉐라톤', '253,000', '3', '15', '11,385,000'),
    row('차량', '45인승', '550,000', '1', '1', '550,000'),
  ]);
  const g = X.groupColumn(lines, X.findUnitRows(lines, {}));
  ok('소계가 없으면 상속하지 않는다', !g.byLine);
  ok('왜 못 했는지 남긴다', /소계/.test(g.why), g.why);
}
{
  /* 구분 열이 없는 양식 — 라벨이 맨 왼쪽이다 */
  const lines = doc(() => [
    at([[10, '인 원'], [60, '20']]),
    row('', '항공료', '315,000', '1', '10', '3,150,000'),
    sub('3,150,000'),
    row('', '차량', '550,000', '1', '2', '1,100,000'),
    sub('1,100,000'),
  ]);
  const g = X.groupColumn(lines, X.findUnitRows(lines, {}));
  ok('라벨을 구분 열로 착각하지 않는다', !g.byLine, JSON.stringify(g.why));
}
{
  /* 한 묶음에 마크가 둘이면 고르지 않는다 */
  const lines = doc(() => [
    at([[10, '인 원'], [60, '20']]),
    mark('호텔'),
    row('', '두짓타니', '217,000', '3', '15', '9,765,000'),
    mark('차량'),
    row('', '알 수 없는 줄', '253,000', '3', '15', '11,385,000'),
    sub('21,150,000'),
    row('가이드', '가이드 일비', '95,000', '4', '1', '380,000'),
    sub('380,000'),
  ]);
  const r = X.readOneBlock(lines, {}, null);
  ok('마크가 둘인 묶음은 상속하지 않는다', catOf(r.candidates, 253000) == null, String(catOf(r.candidates, 253000)));
  ok('모호했다는 것을 센다', r.groupColumn.ambiguous >= 1, JSON.stringify(r.groupColumn));
}

/* ══ [7] 여러 항목을 묶은 줄은 어느 칸의 단가도 아니다 ══════════════════
   실측(굿리치 아오모리): 「지상 차량, 관광지, 식사 등 296,000/인」이 라벨에 '식사'가
   있다는 이유로 **식비**가 되어 1인 1일 98,667원이 나갔다(일본 요율 25,000의 4배). */
console.log('\n[7] 일괄 줄이 한 칸의 단가가 되지 않는가');
{
  ok('세 분류를 가리키는 라벨은 고르지 않는다',
    X.classifyLabel('지상 차량, 관광지, 식사 등') === null,
    String(X.classifyLabel('지상 차량, 관광지, 식사 등')));
  ok('둘까지는 그대로 고른다(「인솔자 항공」 → 항공료)',
    X.classifyLabel('인솔자 항공') === 'airfare',
    String(X.classifyLabel('인솔자 항공')));
  /* ⚠ 공동경비는 **일부러** 기타로 뺐다(SF) — 여러 항목을 묶어 인원수로 나눈 돈이라
     어느 칸의 단가도 아니다. 「공동경비&인두세」가 '인두세' 때문에 유류·택스 칸의
     대표가 되어 진짜 유류/택스 줄을 밀어내고 있었다. */
  ok('공동경비는 유류·택스보다 먼저 기타로 빠진다',
    X.classifyLabel('공동경비&인두세') === 'etc', String(X.classifyLabel('공동경비&인두세')));
  ok('평범한 줄은 그대로다', X.classifyLabel('현지 가이드 일비') === 'guide');
  ok('구분 글자 자체는 그대로 분류된다', X.classifyLabel('호텔') === 'hotel');
}

/* ══ [8] 부수 비용 줄이 차량·가이드의 대표 단가가 되지 않는다 ═══════════
   실측(키움 카자흐스탄): 진짜 차량 줄은 수량이 `4.5`라 검산이 안 돼 빠지고,
   「차량 기사 식사 22,500」이 차량 1일 단가로 나갔다(실제 1,200,000). */
console.log('\n[8] 기사 식대가 차량 단가가 되지 않는가');
{
  const lines = doc(() => [
    at([[10, '인 원'], [60, '20']]),
    row('차량', '기사 식사', '22,500', '1', '8', '180,000'),
    sub('180,000'),
    row('가이드', '가이드 일비', '95,000', '4', '1', '380,000'),
    sub('380,000'),
  ]);
  const r = X.readOneBlock(lines, {}, null);
  ok('부수 줄뿐이면 차량 단가를 비운다', r.values.vehicle == null, String(r.values.vehicle));
  ok('그 줄은 후보 목록에는 남는다', !!r.candidates.find((c) => c.unit === 22500));
}
{
  /* ⚠ '팁'·'경비'로 거르면 안 된다 — 진짜 대표 줄 이름에도 붙는다 */
  const lines = doc(() => [
    at([[10, '인 원'], [60, '20']]),
    row('가이드', '가이드 인건비 &팁', '330,000', '1', '1', '330,000'),
    row('', '기사 식대', '20,000', '1', '5', '100,000'),
    sub('430,000'),
    row('차량', '대형버스', '145,000', '10', '1', '1,450,000'),
    sub('1,450,000'),
  ]);
  const r = X.readOneBlock(lines, {}, null);
  ok('「&팁」이 붙은 진짜 단가 줄은 살아남는다', r.values.guide === 330000, String(r.values.guide));
}

/* ══ [9] 식사 일수는 문서가 밝힌 일수를 호텔 줄보다 먼저 본다 ═══════════
   호텔 묶음은 한 숙박이 여러 줄로 쪼개진다(주중 4박 + 주말 1박 / 금 1박 + 토 1박).
   `max(박수)`는 그 경우 실제보다 **적게** 세고, 식비는 그만큼 부푼다. */
console.log('\n[9] 쪼개진 호텔 줄 때문에 식비가 부풀지 않는가');
{
  const build = (withTrip) => doc(() => [
    at([[10, '인 원'], [60, '10']]),
    withTrip ? plain('강원대학교 홍콩 5박6일 해외연수', 60) : plain('강원대학교 홍콩 해외연수', 60),
    row('호텔', '하버그랜드 (주중)', '275,500', '6', '4', '6,612,000'),
    row('', '하버그랜드 (주말)', '297,250', '6', '1', '1,783,500'),
    sub('8,395,500'),
    row('식사', '중식', '33,350', '10', '3', '1,000,500'),
    row('', '석식', '43,500', '10', '4', '1,740,000'),
    sub('2,740,500'),
  ]);
  const withTrip = X.readOneBlock(build(true), {}, null);
  const noTrip = X.readOneBlock(build(false), {}, null);
  ok('문서에 「5박6일」이 있으면 6일로 나눈다',
    withTrip.evidence.meal && withTrip.evidence.meal.dayCount === 6,
    JSON.stringify(withTrip.evidence.meal && withTrip.evidence.meal.label));
  ok('그 근거를 화면 문구에 적는다',
    /문서의/.test(String(withTrip.evidence.meal && withTrip.evidence.meal.label)),
    String(withTrip.evidence.meal && withTrip.evidence.meal.label));
  /* ⚠ SI에서 순서가 바뀌었다 — 문서 일수가 없으면 **끼니 횟수**를 먼저 본다.
     호텔은 한 숙박이 여러 줄로 쪼개져 박수를 적게 세지만 끼니 횟수는 그 줄 안에서
     완결되기 때문이다. 호텔 박수는 그다음이다. */
  ok('문서 일수가 없으면 끼니 횟수를 쓴다',
    /끼니/.test(String(noTrip.evidence.meal && noTrip.evidence.meal.label)),
    String(noTrip.evidence.meal && noTrip.evidence.meal.label));
  ok('쪼개진 호텔 줄로 식비가 부풀지 않는다',
    withTrip.values.meal < noTrip.values.meal,
    withTrip.values.meal + ' vs ' + noTrip.values.meal);
}

/* ══ [10] 화면이 분류 출처를 실제로 받는가 ═════════════════════════════
   ⚠ 결함 생성기 ③ — 근거를 만들어 놓고 화면에 안 주면 아무 일도 일어나지 않는다. */
console.log('\n[10] 후보 목록이 분류 출처를 함께 넘기는가');
{
  const r = X.readOneBlock(bsiShape(), {}, null);
  ok('candidates에 categoryFrom이 있다',
    r.candidates.every((c) => 'categoryFrom' in c));
  ok('구분 열을 읽었는지 결과에 남는다', r.groupColumn && r.groupColumn.used === true,
    JSON.stringify(r.groupColumn));
  ok('근거에도 분류 출처가 실려 나간다', r.evidence.hotel && r.evidence.hotel.categoryFrom === 'group',
    JSON.stringify(r.evidence.hotel && r.evidence.hotel.categoryFrom));
}
{
  /* ⚠ 화면에 안 붙이면 아무 일도 일어나지 않는다 — PO의 `_verify`가 저장만 하고
     화면에 안 띄운 전례가 있다(결함 생성기 ③). admin.html이 실제로 읽는지 본다. */
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  ok('admin.html이 categoryFrom을 읽는다', /ev\.categoryFrom\s*===\s*'group'/.test(html));
  ok('구분 열에서 왔다고 화면에 쓴다', /표의 구분 열/.test(html));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

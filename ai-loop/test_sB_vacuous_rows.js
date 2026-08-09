/* SB 검증 — 「검산되지 않은 줄」이 대표 단가가 되는 것을 막는다

   왜 —  L2는 `단가 × 수량 × 횟수 = 총금액`이 맞는 줄만 후보로 삼는다. 그런데
   **수량도 1, 횟수도 1이면 그 곱셈은 아무것도 증명하지 않는다.** 한 줄에 같은 숫자가
   두 번 나오기만 하면 통과한다. 이 줄은 '검산에 통과한 줄'이 아니라 **검산이 없었던
   줄**인데, 지금까지 검산된 줄과 똑같이 취급했다.

   실측(견적서 46건, ai-loop/audit_vacuous_rows.js): 검산줄 976개 중 151개(15.5%)가
   이 모양이었고 그중 **22건이 실제 대표 단가로 채택**됐다. 두 갈래로 터졌다:

     ① **줄 병합 오염** — L1은 "같은 높이 = 같은 줄"로 묶는데, 오른쪽에 딴 표(원가
        요약)가 있으면 그 숫자가 딸려 온다. 글로벌 금융판매 북해도 건:
          「가이드 가이드 일비 ¥ 10,000 4 1 ¥ 40,000 지상 720,609 **746,210** …」
        왼쪽이 진짜 가이드 줄인데 오른쪽 지상비 746,210이 `× 1 × 1`로 검산을 통과해
        같은 라벨을 물려받고, 단가가 크다는 이유로 대표 가이드 일당이 됐다(실제의 7.9배).
     ② **패널티 줄** — 「호텔 패널티 180,000」(1명 취소)이 그 문서의 유일한 hotel 줄이라
        대표 객실 단가가 되고 호텔명이 `패널티`로 나갔다(BSI 도쿄).

   ⚠ 그렇다고 공허한 줄을 통째로 버리면 안 된다. 「항공 320,000 1 1 320,000」은
   **진짜 1인 운임**이고 이 양식이 코퍼스에 흔하다. 버리면 그 칸이 통째로 빈다.
   그래서 ①같은 줄에 검산된 조합이 있을 때만 물러나게 하고 ②살아남은 값은
   신뢰도를 `unchecked`로 낮춰 사람이 보게 한다.

   ⚠ 나눗셈으로 단가를 복원하지 않는다는 것도 여기서 고정한다 — 「현지 차량 590
   885,000」의 몫 1500은 개수가 아니라 **환율**이다(타이베이 건은 전 줄이 USD열·원화열
   쌍이다). 복원하면 10배 틀린 값이 '실측'으로 굳는다.

   실행: node ai-loop/test_sB_vacuous_rows.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 줄 — 실제 견적서를 쓰지 않는다(참가자 실명·거래처 단가가 들어 있다).
   모양만 그대로 옮긴다. 셀 하나가 곧 한 칸이다. */
let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 0;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
const doc = (rows) => { ln = 0; return rows.map((r) => line(r)); };
const rowsOf = (d) => X.findUnitRows(d, {});
const find = (rs, n) => rs.filter((r) => r.unit === n);

/* ══ [1] 줄 병합 오염 — 검산된 조합이 있으면 공허한 조합은 그 줄의 값이 아니다 ══ */
console.log('[1] 옆 표에서 흘러든 숫자가 대표 단가가 되지 않는가');
{
  /* 왼쪽이 진짜 가이드 줄(10,000 × 4 = 40,000), 오른쪽 746,210은 딴 표의 지상비 */
  const rs = rowsOf(doc([
    ['가이드 일비', '10,000', '4', '1', '40,000', '지상', '720,609', '746,210'],
  ]));
  ok('검산된 조합(10,000×4)이 남는다', find(rs, 10000).length === 1, JSON.stringify(rs.map((r) => r.unit)));
  ok('흘러든 746,210은 후보에서 빠진다', find(rs, 746210).length === 0, JSON.stringify(rs.map((r) => r.unit)));
}
{
  /* 같은 줄에 `단가 × 수량`과 `총금액 × 1 × 1`이 둘 다 성립하는 경우 */
  const rs = rowsOf(doc([['대형버스', '145,000', '10', '1', '1,450,000']]));
  ok('단가 145,000이 남는다(총금액이 단가 자리를 뺏지 않는다)',
    rs.length === 1 && rs[0].unit === 145000 && rs[0].qty === 10,
    JSON.stringify(rs.map((r) => r.unit + '×' + r.qty)));
}

/* ══ [2] 공허한 줄이라도 검산된 대안이 없으면 남긴다 ═══════════════════════ */
console.log('\n[2] 진짜 1인 단가가 그 모양인 양식을 버리지 않는가');
{
  const rs = rowsOf(doc([['항공', '320,000', '1', '1', '320,000']]));
  ok('「항공 320,000 1 1」은 후보로 남는다', find(rs, 320000).length === 1,
    JSON.stringify(rs.map((r) => r.unit)));
}
{
  /* 원화 전용 양식 — 통화 기호가 하나도 없으면 통화로 가르지 않는다 */
  const rs = rowsOf(doc([['유류/택스', '100,200', '1', '1', '100,200']]));
  ok('원화 전용 공허한 줄도 남는다', find(rs, 100200).length === 1, JSON.stringify(rs.map((r) => r.unit)));
}

/* ══ [3] 전부 공허하면 통화 기호가 붙은 쪽이 그 줄의 값이다 ════════════════ */
console.log('\n[3] 전부 공허할 때 흘러든 원화 숫자를 가려내는가');
{
  /* 왼쪽은 ¥ 표기 줄, 오른쪽 450,000은 딴 표의 원화 항공료 */
  const rs = rowsOf(doc([['기사 식비', '¥', '5,000', '1', '1', '¥', '5,000', '항공', '450,000']]));
  ok('¥ 표기 조합이 남는다', rs.some((r) => r.currency === 'JPY'), JSON.stringify(rs.map((r) => r.unit + r.currency)));
  ok('기호 없는 450,000은 빠진다', find(rs, 450000).length === 0, JSON.stringify(rs.map((r) => r.unit)));
}

/* ══ [4] 나눗셈 복원을 하지 않는다 — 몫이 환율일 수 있다 ═══════════════════ */
console.log('\n[4] 외화열·원화열 쌍을 수량으로 오해하지 않는가');
{
  /* 타이베이 양식: 「현지 차량 590(USD) 885,000(KRW) 1 1 885,000」. 885,000÷590=1500은
     환율이지 대수가 아니다. 원화 단가를 그대로 써야 한다. */
  const rs = rowsOf(doc([['현지 차량', '590', '885,000', '1', '1', '885,000']]));
  const picked = rs.filter((r) => r.total === 885000);
  ok('원화 885,000이 단가로 남는다', picked.some((r) => r.unit === 885000),
    JSON.stringify(picked.map((r) => r.unit + '×' + r.qty + '×' + r.times)));
  ok('1500을 수량으로 만들어 내지 않는다', !rs.some((r) => r.qty === 1500 || r.times === 1500),
    JSON.stringify(rs.map((r) => r.qty + '/' + r.times)));
}

/* ══ [5] 패널티·취소료는 단가가 아니다 ════════════════════════════════════ */
console.log('\n[5] 패널티 줄이 대표 단가·호텔명이 되지 않는가');
{
  ok('「호텔 패널티」는 hotel이 아니라 penalty', X.classifyLabel('호텔 패널티') === 'penalty');
  ok('「항공 취소패널티」는 airfare가 아니라 penalty', X.classifyLabel('항공 취소패널티') === 'penalty');
  ok('「위약금」도 penalty', X.classifyLabel('위약금') === 'penalty');
  ok('멀쩡한 호텔 줄은 그대로 hotel', X.classifyLabel('시저 메트로 호텔') === 'hotel');
  ok('멀쩡한 항공 줄은 그대로 airfare', X.classifyLabel('항공료') === 'airfare');
}
{
  /* 패널티 줄과 진짜 호텔 줄이 함께 있는 문서 — 호텔명이 '패널티'가 되면 안 된다 */
  const r = X.readOneBlock(doc([
    ['견적서', '인원', '18'],
    ['호텔 그랜드', '210,000', '18', '1', '3,780,000'],
    ['호텔 패널티', '180,000', '1', '1', '180,000'],
  ]), {}, null);
  ok('대표 객실 단가는 진짜 호텔 줄', r.values.hotel === 210000, String(r.values.hotel));
  ok("호텔명이 '패널티'가 아니다", r.values.hotelName !== '패널티', String(r.values.hotelName));
  ok('패널티 줄은 후보 목록에는 남는다(조용히 버리지 않는다)',
    r.candidates.some((c) => c.category === 'penalty'),
    JSON.stringify(r.candidates.map((c) => c.category)));
}

/* ══ [6] 살아남은 공허한 값은 `rule`로 나가지 않는다 ═══════════════════════ */
console.log('\n[6] 검산 안 된 값이 「가장 믿을 만하다」로 나가지 않는가');
{
  const r = X.readOneBlock(doc([
    ['견적서', '인원', '5'],
    ['싱가포르 가이드', '1,840,000', '1', '1', '1,840,000'],
  ]), {}, null);
  ok('값은 그대로 준다(버리지 않는다)', r.values.guide === 1840000, String(r.values.guide));
  ok('신뢰도가 unchecked다', r.evidence.guide && r.evidence.guide.via === 'unchecked',
    JSON.stringify(r.evidence.guide && r.evidence.guide.via));
  ok('근거 문구가 「× 1 × 1」 곱셈을 흉내내지 않는다',
    r.evidence.guide && !/× 1 × 1/.test(r.evidence.guide.calc),
    String(r.evidence.guide && r.evidence.guide.calc));
}
{
  const r = X.readOneBlock(doc([
    ['견적서', '인원', '18'],
    ['가이드 일비', '95,000', '4', '1', '380,000'],
  ]), {}, null);
  ok('검산된 값은 그대로 rule이다', r.evidence.guide && r.evidence.guide.via === 'rule',
    JSON.stringify(r.evidence.guide && r.evidence.guide.via));
}

/* ══ [7] 화면이 새 신뢰도를 실제로 표시하는가 ═════════════════════════════
   ⚠ 결함 생성기 ③ — 안전망을 만들고 화면에 안 붙이면 아무 일도 일어나지 않는다.
   PO의 `_verify`가 저장만 하고 화면에 안 띄운 전례가 있다. */
console.log('\n[7] admin.html이 unchecked를 실제로 렌더하는가');
{
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  ok('PR_VIA에 unchecked 항목이 있다', /unchecked\s*:\s*\{\s*text\s*:/.test(html));
  ok('unchecked 배지 색이 정의돼 있다', /\.pr-badge\.via-unchecked/.test(html));
  ok('unchecked 테두리 색이 정의돼 있다', /\.pr-ev\.via-unchecked/.test(html));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」).
   형식이 다르면 통과를 **세지 않고 크래시로 본다** — 조용한 성공 위장을 막는 장치다.
   실제로 이 파일이 처음에 그 규격을 안 지켜 24 pass인데도 크래시로 잡혔다. */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

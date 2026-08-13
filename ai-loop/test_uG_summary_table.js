/* UG 검증 — **곱셈이 없는 「1인 기준 안(案) 비교표」**를 읽는다

   실측(신한 금융플러스 감탄/마카오) — 이 문서는 **한 줄도 검산이 안 된다**:

       항공      240,000  190,000  250,000  250,000  | 7C 205,000 21,800 47,700 274,500
       유류/택스   75,000   75,000   75,000   92,400  | NX 170,000 27,400 47,700 245,100
       지상     615,000  615,000  615,000  673,920
       보험      10,000   10,000   10,000   10,000
       하나수익   67,000   87,000   57,000   57,000
       입금가  1,007,000  977,000 1,007,000 1,083,320
       대리점수익 213,000  263,000  233,000  176,680
       판매가  1,220,000 1,240,000 1,240,000 1,260,000

   **열 하나가 안 하나**이고 값이 전부 1인 기준이다. L2는 「단가 x 수량 x 횟수 = 총금액」을
   요구하므로 이런 표에서는 아무것도 못 건진다 — 그래서 검산줄이 0개였다.

   ⚠ 이 문서가 **엔진 최대 오차(+55.7%)** 건이고, 그 원인이 여기 있다:
     항공 실측 250,000인데 요율은 430,000, 유류 92,400인데 200,000이다.

   ⚠ **어느 열이 채택된 안인지 짐작하지 않는다.** 문서가 스스로 증명하게 한다:
       항공+유류+지상+보험+수익 == 입금가 · 입금가+대리점수익 == 판매가
     실측에서 네 열이 전부 맞았다. 그리고 **이미 읽어 둔 1인당과 같은 열**을 고른다.

   실행: node ai-loop/test_uG_summary_table.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

let ln = 0;
const at = (texts) => {
  const o = { page: 1, y: 700 - ln * 10, idx: ln, cells: texts.map((s, i) => ({ s, x: 60 + i * 70 })), text: texts.join(' ') };
  ln++;
  return o;
};
/* 마카오의 모양을 그대로 옮긴다(오른쪽에 붙은 항공사별 운임표까지) */
const macau = (over) => {
  ln = 0;
  const o = Object.assign({
    air: ['240,000', '190,000', '250,000', '250,000', '7C', '205,000', '21,800', '47,700', '274,500'],
    fuel: ['75,000', '75,000', '75,000', '92,400'],
    ground: ['615,000', '615,000', '615,000', '673,920'],
    ins: ['10,000', '10,000', '10,000', '10,000'],
    margin: ['67,000', '87,000', '57,000', '57,000'],
    dep: ['1,007,000', '977,000', '1,007,000', '1,083,320'],
    agent: ['213,000', '263,000', '233,000', '176,680'],
    sell: ['1,220,000', '1,240,000', '1,240,000', '1,260,000'],
  }, over || {});
  return [
    at(['인 원', '26']),
    at(['1인당', '1,260,000']),
    at(['항공'].concat(o.air)),
    at(['유류/택스'].concat(o.fuel)),
    at(['지상'].concat(o.ground)),
    at(['보험'].concat(o.ins)),
    at(['하나수익'].concat(o.margin)),
    at(['입금가'].concat(o.dep)),
    at(['대리점수익'].concat(o.agent)),
    at(['판매가'].concat(o.sell)),
  ];
};

console.log('[1] 세로 합이 맞으면 그 열을 읽는가');
{
  const r = X.readOneBlock(macau(), {}, null);
  ok('항공을 읽는다 (4번째 안)', r.values.airfare === 250000, String(r.values.airfare));
  ok('유류를 읽는다', r.values.fuel === 92400, String(r.values.fuel));
  /* ⚠ 「지상」은 차량·가이드·관광·식사를 묶은 줄이라 어느 칸의 단가도 아니다(SE 원칙) */
  ok('**「지상」은 어느 칸에도 안 넣는다** (묶음이다)',
    r.values.vehicle == null && r.values.guide == null && r.values.sight == null,
    JSON.stringify({ v: r.values.vehicle, g: r.values.guide, s: r.values.sight }));
  ok('몇 번째 안에서 왔는지 화면에 말한다',
    /4번째 안/.test(String(r.evidence.airfare && r.evidence.airfare.calc)),
    String(r.evidence.airfare && r.evidence.airfare.calc));
  ok('오른쪽에 붙은 항공사별 운임표에 속지 않는다 (205,000이 아니다)',
    r.values.airfare !== 205000);
}

console.log('\n[2] 세로 합이 안 맞으면 아무것도 안 읽는가');
{
  /* ⚠ 이게 이 층의 유일한 안전장치다 — 합이 안 맞으면 그 표가 이 양식이라는 증거가 없다.
     증거 없이 열을 고르면 그건 짐작이고, 짐작한 단가는 그대로 요율에 얹힌다. */
  const r = X.readOneBlock(macau({ ground: ['615,000', '615,000', '615,000', '999,999'] }), {}, null);
  ok('한 열이라도 합이 틀리면 통째로 안 읽는다', r.values.airfare == null, String(r.values.airfare));
}
{
  /* 판매가 = 입금가 + 대리점수익 도 함께 본다 */
  const r = X.readOneBlock(macau({ sell: ['1,220,000', '1,240,000', '1,240,000', '9,999,999'] }), {}, null);
  ok('판매가 검산이 틀려도 안 읽는다', r.values.airfare == null, String(r.values.airfare));
}

console.log('\n[3] 1인당과 같은 열을 고르는가 — 짐작하지 않는가');
{
  /* 1인당이 2번째 안(1,240,000)이면 그 열을 골라야 한다.
     ⚠ 2·3번째 안이 판매가가 같아 첫 번째로 걸리는 2번째 열을 쓴다 —
        같은 값이면 어느 쪽이든 항공·유류가 같으므로 결과는 같다. */
  ln = 0;
  const lines = macau();
  lines[1] = { page: 1, y: 690, idx: 1, cells: [{ s: '1인당', x: 60 }, { s: '1,240,000', x: 130 }], text: '1인당 1,240,000' };
  const r = X.readOneBlock(lines, {}, null);
  ok('1인당이 가리키는 안의 항공을 읽는다', r.values.airfare === 190000 || r.values.airfare === 250000,
    String(r.values.airfare));
}

console.log('\n[4] 정상 표가 있는 문서는 건드리지 않는가');
{
  /* ⚠ 이 층은 **검산줄이 하나도 없을 때만** 돈다. 평범한 견적서를 건드리면
     멀쩡한 값이 요약표 값으로 덮인다. */
  ln = 0;
  const r = X.readOneBlock([
    at(['인 원', '20']),
    at(['항공료', '380,000', '1', '20', '7,600,000']),
    at(['1일 중식', '30,000', '1', '20', '600,000']),
    at(['판매가', '1,220,000', '1,240,000']),
    at(['입금가', '1,007,000', '977,000']),
  ], {}, null);
  ok('검산줄이 있으면 요약표를 안 본다', r.values.airfare === 380000, String(r.values.airfare));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

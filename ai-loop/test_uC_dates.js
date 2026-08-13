/* UC 검증 — 날짜를 더 넓게 읽되, **넓힌 만큼 잘못 읽지 않는가**

   왜 조심해야 하나 — **일수는 금액에 거의 정비례한다**(식비가 총액 ÷ 인원 ÷ 일수다).
   날짜를 잘못 읽으면 그 견적서의 요율 대조가 통째로 틀어지고, 그 값이 요율에 얹히면
   고객이 보는 금액이 된다. 그래서 넓힐 때마다 **오탐 쪽을 함께 잰다.**

   이번에 넓힌 것 셋:
     ① 한글 「년·월·일」도 날짜 구분자다
        「여행 기간 ( 예정 ) 2025 년 11 월 28 일 ( 금 ) ~ 11 월 30 일 ( 일 ) / 2 박 3 일」
        구분자를 `.`·`-`·`/`로만 받아 이 줄이 통째로 안 걸렸다. PDF에서 글자 사이가
        벌어져 나오는 일이 흔하다.
     ② 일정표의 「4/4(토)」·「04/04/Fri」 표기 (유럽 견적서 세 건이 여기서 막혀 있었다)
     ③ 영문 「DATE :」도 작성일이다 — 못 읽으면 그 날짜가 **출발일로** 들어간다

   그리고 방어 둘:
     ④ **출발일이 작성일과 같으면 버린다** — 리드타임 0인 행사는 없다
     ⑤ 일정표 날 수로 일수를 채우되 **문서가 밝힌 기간이 이긴다**

   실행: node ai-loop/test_uC_dates.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 합성 줄 — 날짜만 보는 검사라 좌표는 단순하게 둔다 */
let ln = 0;
const at = (texts) => {
  const o = { page: 1, y: 700 - ln * 10, idx: ln, cells: texts.map((s, i) => ({ s, x: 60 + i * 70 })), text: texts.join(' ') };
  ln++;
  return o;
};
/* 금액 줄이 없으면 readOneBlock이 일찍 빠지므로 최소한의 표를 함께 둔다 */
const table = () => [
  at(['인 원', '20']),
  at(['1일 중식', '30,000', '1', '20', '600,000']),
  at(['1일 석식', '40,000', '1', '20', '800,000']),
];
const datesOf = (lines) => X.readOneBlock(lines, {}, null).dates;

/* ══ ① 한글 년·월·일 구분자 ═══════════════════════════════════════════════ */
console.log('[1] 한글 「년 월 일」도 날짜 구분자로 읽는가');
{
  ln = 0;
  const d = datesOf([at(['여행 기간 ( 예정 ) 2025 년 11 월 28 일 ( 금 ) ~ 11 월 30 일 ( 일 ) / 2 박 3 일'])].concat(table()));
  ok('출발일을 읽는다', d.departDate === '2025-11-28', String(d.departDate));
  ok('귀국일도 읽는다 (뒤쪽은 연도 생략)', d.returnDate === '2025-11-30', String(d.returnDate));
  ok('박수·일수도 같은 줄에서 읽는다', d.nights === 2 && d.days === 3, d.nights + '박 ' + d.days + '일');
}
{
  /* 붙여 쓴 것도 그대로 읽혀야 한다(예전부터 되던 모양을 깨지 않았는지) */
  ln = 0;
  const d = datesOf([at(['일정 2026.02.04~02.08'])].concat(table()));
  ok('점 구분자 표기는 그대로 읽는다 (회귀 없음)', d.departDate === '2026-02-04', String(d.departDate));
}

/* ══ ② 넓힌 만큼 잘못 읽지 않는가 ════════════════════════════════════════
   ⚠ 이게 이 테스트의 핵심이다. 구분자를 넓히면 **날짜가 아닌 숫자 셋**이 걸릴 수 있다. */
console.log('\n[2] 날짜가 아닌 줄을 날짜로 읽지 않는가');
{
  ln = 0;
  const d = datesOf([
    at(['금액 2,500 원 12 개 30 개입']),
    at(['객실 2 인 3 실 4 박']),
  ].concat(table()));
  ok('「2,500 원 12 개 30」을 날짜로 읽지 않는다', !d.departDate, String(d.departDate));
}

/* ══ ③ 영문 DATE도 작성일 ═════════════════════════════════════════════════ */
console.log('\n[3] 영문 「DATE :」를 작성일로 읽는가');
{
  ln = 0;
  const d = datesOf([at(['2호차 확정 일정표 DATE : 2026-08-06'])].concat(table()));
  ok('작성일로 읽는다', d.quoteDate === '2026-08-06', String(d.quoteDate));
  /* ⚠ 이게 ④와 맞물린다 — 작성일로 읽어야 「출발일 = 작성일」 방어가 작동한다 */
  ok('**출발일로는 쓰지 않는다**', d.departDate !== '2026-08-06', String(d.departDate));
}

/* ══ ④ 출발일 = 작성일이면 버린다 ═════════════════════════════════════════
   실측(굿리치 바르셀로나): 머리글의 작성일이 출발일로 들어가 시즌·리드타임 계수가
   통째로 틀어졌다. 견적을 낸 날 출발하는 행사는 없다. */
console.log('\n[4] 출발일이 작성일과 같으면 버리는가');
{
  ln = 0;
  const d = datesOf([
    at(['견적 작성일 2026-08-06']),
    at(['일정 2026-08-06']),
  ].concat(table()));
  ok('같은 날짜면 출발일로 안 쓴다', !d.departDate, String(d.departDate));
  ok('작성일은 그대로 남는다', d.quoteDate === '2026-08-06', String(d.quoteDate));
}
{
  /* ⚠ 다른 날짜면 당연히 써야 한다 — 방어가 정상 건을 삼키지 않는지 */
  ln = 0;
  const d = datesOf([
    at(['견적 작성일 2026-08-06']),
    at(['여행 기간 2026.10.11 ~ 10.15']),
  ].concat(table()));
  ok('날짜가 다르면 그대로 쓴다 (방어가 정상 건을 안 삼킨다)',
    d.departDate === '2026-10-11', String(d.departDate));
}

/* ══ ⑤ 일수는 문서가 밝힌 것이 이긴다 ════════════════════════════════════
   ⚠ 일정표 날 수로 채우는 것은 **비어 있을 때뿐**이다. 일정표는 선택일정·차수가 섞이면
     날이 부푼다(실측: KT CES는 9일 일정인데 13일치로 읽힌다). */
console.log('\n[5] 문서가 밝힌 기간을 일정표가 덮지 않는가');
{
  ln = 0;
  const d = datesOf([at(['여행 기간 2026.03.10 ~ 03.13 (2박 3일)'])].concat(table()));
  /* 날짜 범위는 3박인데 제목은 2박 — 문서가 스스로 모순된다. 날짜 쪽을 쓰되 흔적을 남긴다(SA) */
  ok('모순이 있으면 날짜 범위를 쓴다', d.nights === 3, String(d.nights));
  ok('모순이 있었다는 흔적을 남긴다', !!d.nightsConflict, JSON.stringify(d.nightsConflict));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

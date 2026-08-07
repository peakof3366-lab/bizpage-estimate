/* SA 검증 — 여행 기간(박수·일수) 읽기와 **문서가 스스로 모순될 때**의 처리

   왜 —  역검증(backtest_quotes.js)이 코퍼스 46건 중 4건밖에 대조하지 못했고,
   가장 큰 사유가 「일수 불명」 19건이었다. 원인은 두 가지였다:

     ① 「N박 M일」을 `일정|기간|출발…` 낱말이 있는 줄에서만 읽었다.
        그런데 실제 견적서는 그걸 **제목 줄**에 적는다:
          「키움에셋플래너 해외연수 (북해도) | 3박 4일」 — 낱말이 하나도 없다.
     ② 기간 범위 줄이 세로쓰기로 잘려 낱말이 사라진다:
          「행 2026. 06. 19 ~ 06. 22 (3박 4일)」 — '여행기간'의 '행'만 남았다.

   그리고 고치고 나니 **문서가 스스로 모순되는** 것이 7건 드러났다. 전부 같은 모양이다
   (제목의 박수가 날짜 범위보다 1 적다). 실제로 열어 보니 **틀린 쪽은 언제나 제목**이었다:
     「행사기간 2026. 10. 11 ~ 10. 15 (3박 5일)」 — 3박이면 4일이라 그 자체로 모순
     「대림벧엘교회 해외여행 (큐슈) | 2박 3일」   — 03.10~03.13이고 일정표는 4일차까지
   그래서 **날짜 범위를 쓰되 어긋났다는 사실을 남긴다**(`nightsConflict`).
   조용히 하나를 고르면 그 문서의 일수가 통째로 틀린 채 요율과 대조된다 —
   일수는 엔진 금액에 거의 정비례라 그대로 견적 오차가 된다.

   실행: node ai-loop/test_sA_trip_dates.js  (프로젝트 루트에서) */
const path = require('path');
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 줄 — 실제 견적서를 쓰지 않는다(참가자 실명·거래처 단가가 들어 있다).
   모양만 그대로 옮긴다. */
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

/* ══ [1] 제목 줄의 「N박 M일」 ═══════════════════════════════════════════ */
console.log('[1] 낱말 관문이 없는 제목 줄에서도 박수·일수를 읽는가');
{
  const d = X.findTripDates(doc([
    ['키움에셋플래너 해외연수 (북해도) | 3박 4일'],
    ['견적 담당', '홍길동'],
  ]));
  ok('제목 줄의 3박 4일을 읽는다', d.nights === 3 && d.days === 4, JSON.stringify(d));
}
{
  /* 4박 6일 — 야간 비행이 끼면 실제로 있다. 박+1만 받으면 이 양식이 통째로 빠진다. */
  const d = X.findTripDates(doc([['제주개발공사 싱가포르,조호바루 4박6일']]));
  ok('4박 6일도 받는다(야간 비행)', d.nights === 4 && d.days === 6, JSON.stringify(d));
}
{
  /* 「N박」만 있으면 일수는 채우지 않는다 — 4박6일이 있으므로 5일이라 단정 못 한다 */
  const d = X.findTripDates(doc([['상품 안내 3박 상품입니다']]));
  ok('「3박」만 있으면 일수는 비워 둔다', d.days === null || d.days === undefined, JSON.stringify(d));
}
{
  /* 여행 기간이 아닌 숫자를 박수로 삼지 않는다 */
  const d = X.findTripDates(doc([['객실 요금 2 박 99 일']]));
  ok('박+1·+2가 아니면 안 받는다(2박 99일)', !d.nights, JSON.stringify(d));
}

/* ══ [2] 낱말이 잘려 나간 기간 줄 ═══════════════════════════════════════ */
console.log('[2] 세로쓰기로 낱말이 잘린 기간 줄을 읽는가');
{
  const d = X.findTripDates(doc([
    ['행', '2026. 06. 19 ~ 06. 22 (3박 4일)'],
  ]));
  ok('「행 2026. 06. 19 ~ 06. 22」에서 출발일을 읽는다', d.depart === '2026-06-19', JSON.stringify(d));
  ok('귀국일도 읽는다', d.ret === '2026-06-22', JSON.stringify(d));
  ok('박수 3 · 일수 4', d.nights === 3 && d.days === 4, JSON.stringify(d));
}
{
  /* ⚠ 낱말 없는 줄에서 **단일 날짜**를 출발일로 삼으면 안 된다.
     문서 아무 데나 있는 날짜(작성일·유효기간 등)가 출발일로 둔갑한다. */
  const d = X.findTripDates(doc([
    ['비고', '2026. 01. 05 접수분'],
    ['담당', '02-1234-5678'],
  ]));
  ok('낱말 없는 줄의 단일 날짜는 출발일로 쓰지 않는다', !d.depart, JSON.stringify(d));
}
{
  /* 낱말이 있으면 단일 날짜도 받는다(기존 동작 유지) */
  const d = X.findTripDates(doc([['출발일', '2026. 02. 14']]));
  ok('낱말이 있으면 단일 날짜는 받는다(기존 동작)', d.depart === '2026-02-14', JSON.stringify(d));
}

/* ══ [3] 문서가 스스로 모순될 때 ════════════════════════════════════════ */
console.log('[3] 기간 표기가 서로 어긋나면 — 날짜를 쓰되 반드시 흔적을 남기는가');
{
  /* 실측 그대로: 3박이면 4일인데 5일이라 적혀 있고, 날짜로는 4박 5일이다 */
  const d = X.findTripDates(doc([
    ['행사기간', '2026. 10. 11 ~ 10. 15 (3박 5일)'],
  ]));
  ok('날짜 범위 쪽(4박)을 쓴다', d.nights === 4, JSON.stringify(d));
  ok('일수는 5일', d.days === 5, JSON.stringify(d));
  ok('어긋났다는 흔적이 남는다', !!d.nightsConflict, JSON.stringify(d));
  ok('무엇과 무엇이 어긋났는지 함께 남긴다',
    d.nightsConflict && d.nightsConflict.fromDates === 4 && d.nightsConflict.labelled === 3,
    JSON.stringify(d.nightsConflict));
}
{
  /* 제목과 날짜가 **일치하면** 흔적을 남기지 않는다(오탐이 나면 아무도 안 본다) */
  const d = X.findTripDates(doc([
    ['키움에셋플래너 해외연수 (북해도) | 3박 4일'],
    ['행', '2026. 06. 19 ~ 06. 22'],
  ]));
  ok('일치하면 충돌 표시가 없다', !d.nightsConflict, JSON.stringify(d));
  ok('일치할 때 값도 맞다', d.nights === 3 && d.days === 4, JSON.stringify(d));
}
{
  /* 서로 다른 「N박 M일」이 여럿이면(차수·옵션) 고르지 않는다 */
  const d = X.findTripDates(doc([
    ['A안 3박 4일'],
    ['B안 4박 5일'],
  ]));
  ok('박수 표기가 동점으로 갈리면 비워 둔다', !d.nights, JSON.stringify(d));
}
{
  /* 다수결은 쓴다 — 같은 값이 여러 번 나오는 것이 정상이다 */
  const d = X.findTripDates(doc([
    ['제목 3박 4일'],
    ['요약 3박 4일'],
    ['비고 4박 5일'],
  ]));
  ok('최다 표기를 쓴다(3박 4일)', d.nights === 3 && d.days === 4, JSON.stringify(d));
}

/* ══ [4] findDates가 충돌을 바깥으로 넘기는가 ═══════════════════════════ */
console.log('[4] findDates가 화면까지 충돌을 전달하는가');
{
  const d = X.findDates(doc([['행사기간', '2026. 10. 11 ~ 10. 15 (3박 5일)']]));
  ok('findDates에 nightsConflict가 실려 나온다', !!d.nightsConflict, JSON.stringify(d));
  ok('정상 문서에서는 null이다',
    X.findDates(doc([['행사기간', '2026. 10. 11 ~ 10. 15 (4박 5일)']])).nightsConflict === null);
}

/* ⚠ 이 문구는 `run_all_tests.js`가 정규식으로 찾는다(`결과: N pass / M fail`).
   형식이 다르면 통과를 **세지 않고 크래시로 본다** — 조용한 성공 위장을 막는 장치다. */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

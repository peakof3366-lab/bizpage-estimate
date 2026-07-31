/* 목적지(destination_key) → 통화(ISO 4217) 매핑.
   요율 관리의 환율 변동 감시(admin.html)와 초기 시드 스크립트(ai-loop/fx_seed.js),
   cron 환율 조회(api/rates.js)가 전부 이 파일 하나를 공유한다. 브라우저 <script> 태그와
   Node require() 양쪽에서 쓸 수 있도록 마지막에 isomorphic export만 붙였다.

   PY: 매핑값 자체는 여기 적지 않고 data.js의 DEST_CLASSIFY(currency)에서 파생한다.
   목적지 목록이 파일마다 따로 적혀 있던 것이 이 저장소 결함의 최대 원인이었다
   (여섯 번 재발). 통화를 고치거나 목적지를 추가할 때 손댈 곳은 data.js 한 줄이다.

   '서유럽'/'북유럽'/'동유럽'은 여러 나라를 묶은 항목이라 유로존 근사치(EUR)를 쓴다
   (북유럽은 NOK/SEK/DKK, 동유럽은 PLN/CZK/HUF가 실제 통화지만 EUR과 함께 움직인다).

   ⚠ 분류표에서 통화가 빠진 목적지는 조용히 '환율 보정 없음'이 된다.
   과거 '동유럽'은 "국가가 특정되지 않아" 의도적으로 생략돼 있었다. 당시엔 이 맵이
   관리자 환율 변동 감시에만 쓰여 영향이 admin 화면에 그쳤지만, 이후 P3(환율 반영)가
   getFxAdjust를 견적 금액에 물리면서 '동유럽만 환율 보정을 못 받는' 가격 불일치가 됐다
   (55개 중 54개만 rate_fx_baseline 보유 — 2026-07-28 프로덕션에서 확인). 생략 근거였던
   "국가가 특정되지 않음"은 서유럽·북유럽에도 똑같이 해당하는데 그쪽은 EUR로 매핑돼
   있어 근거 자체가 일관되지 않았다. 그래서 EUR로 통일한다.
   → 이제 빈 값은 destFieldMap이 DEST_CLASSIFY_ISSUES에 기록하고
     `node ai-loop/audit_consistency.js`가 오류로 잡는다(조용히 넘어가지 않는다). */

/* 브라우저에서는 admin.html이 data.js를 먼저 로드하므로 전역 destFieldMap이 이미 있다.
   Node에서는 data.js의 export를 쓴다(데이터가 두 벌이 되지 않도록 같은 함수를 부른다). */
const DEST_CURRENCY = (typeof destFieldMap !== 'undefined')
  ? destFieldMap('currency')
  : require('./data').destFieldMap('currency');

if (typeof module !== 'undefined' && module.exports) module.exports = DEST_CURRENCY;

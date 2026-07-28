/* 목적지(destination_key) → 통화(ISO 4217) 매핑.
   요율 관리의 환율 변동 감시(admin.html)와 초기 시드 스크립트(ai-loop/fx_seed.js),
   cron 환율 조회(api/rates.js)가 전부 이 파일 하나를 공유한다. 브라우저 <script> 태그와
   Node require() 양쪽에서 쓸 수 있도록 마지막에 isomorphic export만 붙였다.
   '서유럽'/'북유럽'/'동유럽'은 여러 나라를 묶은 항목이라 유로존 근사치(EUR)를 쓴다
   (북유럽은 NOK/SEK/DKK, 동유럽은 PLN/CZK/HUF가 실제 통화지만 EUR과 함께 움직인다).
   — data.js의 REGION_MAP과 마찬가지로 평문 데이터라 실제 국가 구성에 맞게 언제든 고칠 수 있다.

   ⚠ 여기 빠진 목적지는 조용히 '환율 보정 없음'이 된다.
   과거 '동유럽'은 "국가가 특정되지 않아" 의도적으로 생략돼 있었다. 당시엔 이 맵이
   관리자 환율 변동 감시에만 쓰여 영향이 admin 화면에 그쳤지만, 이후 P3(환율 반영)가
   getFxAdjust를 견적 금액에 물리면서 '동유럽만 환율 보정을 못 받는' 가격 불일치가 됐다
   (55개 중 54개만 rate_fx_baseline 보유 — 2026-07-28 프로덕션에서 확인). 생략 근거였던
   "국가가 특정되지 않음"은 서유럽·북유럽에도 똑같이 해당하는데 그쪽은 EUR로 매핑돼
   있어 근거 자체가 일관되지 않았다. 그래서 EUR로 통일한다.
   → 목적지를 추가할 때 이 맵도 반드시 채울 것. `node ai-loop/audit_consistency.js`가 검사한다. */
const DEST_CURRENCY = {
  '도쿄':'JPY', '오사카':'JPY', '후쿠오카':'JPY', '나고야':'JPY', '삿포로':'JPY', '오키나와':'JPY',
  '홍콩':'HKD', '마카오':'MOP',
  '상해':'CNY', '장가계':'CNY', '청도':'CNY', '연태':'CNY',
  '몽골':'MNT', '대만':'TWD', '가오슝':'TWD',
  '라오스':'LAK', '싱가포르':'SGD',
  '하노이':'VND', '호치민':'VND', '다낭':'VND', '나트랑':'VND', '푸꾸옥':'VND',
  '세부':'PHP', '마닐라':'PHP', '보홀':'PHP',
  '코타키나발루':'MYR', '캄보디아':'KHR',
  '방콕':'THB', '푸켓':'THB', '치앙마이':'THB', '발리':'IDR',
  '괌':'USD', '사이판':'USD',
  '시드니':'AUD', '멜버른':'AUD', '호주':'AUD', '오클랜드':'NZD',
  '서유럽':'EUR', '로마':'EUR', '파리':'EUR', '스페인':'EUR', '독일':'EUR', '네덜란드':'EUR',
  '북유럽':'EUR', '동유럽':'EUR',
  '영국':'GBP',
  '로스앤젤레스':'USD', '샌프란시스코':'USD', '워싱턴':'USD', '뉴욕':'USD', '하와이':'USD',
  '밴쿠버':'CAD', '토론토':'CAD',
  '카자흐스탄':'KZT', '우즈베키스탄':'UZS',
};

if (typeof module !== 'undefined' && module.exports) module.exports = DEST_CURRENCY;

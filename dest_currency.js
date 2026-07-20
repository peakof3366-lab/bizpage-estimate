/* 목적지(destination_key) → 통화(ISO 4217) 매핑.
   요율 관리의 환율 변동 감시(admin.html)와 초기 시드 스크립트(ai-loop/fx_seed.js),
   cron 환율 조회(api/rates.js)가 전부 이 파일 하나를 공유한다. 브라우저 <script> 태그와
   Node require() 양쪽에서 쓸 수 있도록 마지막에 isomorphic export만 붙였다.
   '서유럽'/'북유럽'은 유로존 근사치, '동유럽'은 국가가 특정되지 않아 매핑 생략
   (시간 기반 갱신 판정만 적용됨) — data.js의 REGION_MAP과 마찬가지로 평문 데이터라
   실제 국가 구성에 맞게 언제든 손으로 고칠 수 있다. */
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
  '서유럽':'EUR', '로마':'EUR', '파리':'EUR', '스페인':'EUR', '독일':'EUR', '네덜란드':'EUR', '북유럽':'EUR',
  '영국':'GBP',
  '로스앤젤레스':'USD', '샌프란시스코':'USD', '워싱턴':'USD', '뉴욕':'USD', '하와이':'USD',
  '밴쿠버':'CAD', '토론토':'CAD',
  '카자흐스탄':'KZT', '우즈베키스탄':'UZS',
};

if (typeof module !== 'undefined' && module.exports) module.exports = DEST_CURRENCY;

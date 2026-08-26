/* ═══════════════════════════════════════════════════════════════════════════
   요율 칸 이름 — **한 곳** (XQ)
   ───────────────────────────────────────────────────────────────────────────
   목적지 하나가 가진 숫자 칸의 목록이다. 같은 목록이 세 곳에 손으로 적혀 있었다:
     · `api/rates.js`            저장 요청 검증(이 칸만 고칠 수 있다)
     · `ai-loop/audit_rates.js`  요율 값 점검(이 칸을 훑는다)
     · `ai-loop/audit_consistency.js` 값 형식 점검(이 칸이 숫자인가)

   한쪽만 늘리면 **새 칸이 검사에서 조용히 빠진다** — 저장은 되는데 아무도 안 보는
   칸이 생긴다. 요율은 고객 금액에 그대로 붙는 값이라 그 상태가 특히 나쁘다.

   ⚠ **골프는 따로다**(TJ). 없어도 되는 칸이라 필수 검증에 넣으면 골프 요금이 없는
     목적지가 전부 「빠진 칸」으로 잡힌다. 그래서 목록을 갈라 둔다 — 합치지 말 것.
   ⚠ 순서를 바꾸지 말 것. 관리자 표·감사 출력이 이 순서로 칸을 그린다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 반드시 있어야 하는 숫자 칸 — 하나라도 비면 그 목적지 견적이 성립하지 않는다 */
const RATE_NUMERIC_FIELDS = [
  'airfare', 'fuel_surcharge', 'hotel_per_room', 'meal_per_person',
  'vehicle_large', 'vehicle_small', 'guide_fee', 'sightseeing_fee', 'margin_per_traveler',
];

/* 있으면 쓰고 없으면 그 옵션 자체를 안 여는 칸 (TJ) */
const RATE_OPTIONAL_NUMERIC_FIELDS = ['golf_fee'];

/* 사람이 읽는 이름 — 감사 출력·관리자 안내가 같은 말을 쓰도록 함께 둔다 */
const RATE_FIELD_LABELS = {
  airfare: '항공료', fuel_surcharge: '유류할증료', hotel_per_room: '호텔(1박)',
  meal_per_person: '1인 1일 식비', vehicle_large: '대형차량', vehicle_small: '소형차량',
  guide_fee: '가이드비', sightseeing_fee: '관광비', margin_per_traveler: '1인 마진',
  golf_fee: '골프(1인 1회)',
};

module.exports = { RATE_NUMERIC_FIELDS, RATE_OPTIONAL_NUMERIC_FIELDS, RATE_FIELD_LABELS };

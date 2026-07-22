/* =====================================================================
   Level 1 고도화 설정 테이블
   ① PAX_TIERS     — 인원 구간별 항공·유류 할인 계수
   ② SEASON_CONFIG — 시즌별 가격 계수 (항공·유류·호텔에 적용)
   ③ HOTEL_GRADES  — 호텔 등급별 단가 계수
   ===================================================================== */

/* 인원이 많을수록 항공사·현지 협상력↑ → 항공+유류 단가 할인 */
const PAX_TIERS = [
  { min:  1, max:  9, factor: 1.00, label: '1 ~ 9명',    desc: '기본 요율' },
  { min: 10, max: 29, factor: 0.95, label: '10 ~ 29명',  desc: '−5%' },
  { min: 30, max: 49, factor: 0.90, label: '30 ~ 49명',  desc: '−10%' },
  { min: 50, max: Infinity, factor: 0.85, label: '50명 이상', desc: '−15%' },
];

/* 출발월 기준 시즌 계수 — 항공·유류·호텔에 적용 (북반구/한국 출발 수요 기준) */
const SEASON_CONFIG = [
  { id: 'peak',    months: [7, 8, 12, 1], factor: 1.20, label: '성수기', badge: '성수기 +20%' },
  { id: 'offpeak', months: [2, 6],        factor: 0.88, label: '비수기', badge: '비수기 −12%' },
  { id: 'normal',  months: [],            factor: 1.00, label: '평시',   badge: '평시' },
];

/* 남반구 목적지 전용 — 계절이 북반구와 정반대(12~2월이 현지 여름/성수기,
   6~8월이 현지 겨울/비수기)이므로 별도 시즌표 사용 */
const SOUTHERN_HEMISPHERE_DESTS = ['시드니', '멜버른', '호주', '오클랜드'];
const SEASON_CONFIG_SOUTHERN = [
  { id: 'peak',    months: [12, 1, 2], factor: 1.20, label: '성수기', badge: '성수기 +20%' },
  { id: 'offpeak', months: [6, 7, 8],  factor: 0.88, label: '비수기', badge: '비수기 −12%' },
  { id: 'normal',  months: [],         factor: 1.00, label: '평시',   badge: '평시' },
];

/* =====================================================================
   P4 — 목적지(권역)별 시즌 달력
   ─────────────────────────────────────────────────────────────────────
   위 SEASON_CONFIG는 전 목적지 공용 근사라, 실제 성수기가 권역마다 다른
   문제를 못 잡는다(대표적으로 동남아는 건기 11~3월이 성수기·우기 5~9월이
   비수기인데 공용표는 여름을 성수기로 잡아 정반대). 여기서 권역별로 시즌표를
   재정의해 우선 적용한다. getSeasonInfo(script.js)가 목적지가 아래 keys에
   매칭되면 그 config를, 매칭 안 되면 기존 SEASON_CONFIG(남반구는
   SEASON_CONFIG_SOUTHERN)로 폴백한다 → 여기 없는 목적지는 동작 100% 불변.
   남반구 4곳(시드니·멜버른·오클랜드·호주)은 일부러 빼서 SOUTHERN을 그대로 쓴다.

   각 config는 SEASON_CONFIG와 동일 형태({id,months,factor,label,badge})이며
   반드시 id:'normal'(months:[]) 폴백 항목을 포함해야 한다. P2의 PEAK_CALENDAR
   (날짜 단위 연휴·이벤트)와 상호보완 관계: 여기는 월 단위 넓은 시즌(항공·유류·
   호텔에 곱함), PEAK_CALENDAR는 골든위크·춘절 등 짧은 피크를 날짜로 항공·유류에
   가산한다. ⚠ 아래 성수기/비수기 월과 계수는 도메인 초안입니다 — 실제 운영
   실측(요율관리 '견적 정확도' 카드)과 담당자 판단으로 조정하세요. 권역으로 묶은
   탓에 같은 권역 안에서도 예외가 있습니다(예: 삿포로 겨울, 오키나와 여름, 하와이 겨울). */
const DEST_SEASON_PROFILES = [
  {
    /* 동남아 — 건기(11~3월) 성수기 / 우기(5~9월) 비수기. 공용표(여름 성수기)와 정반대 */
    keys: ['라오스','싱가포르','하노이','호치민','다낭','나트랑','푸꾸옥','세부',
           '마닐라','보홀','코타키나발루','캄보디아','방콕','푸켓','치앙마이','발리'],
    config: [
      { id:'peak',    months:[11,12,1,2,3], factor:1.15, label:'건기 성수기', badge:'건기 성수기 +15%' },
      { id:'offpeak', months:[5,6,7,8,9],   factor:0.88, label:'우기 비수기', badge:'우기 비수기 −12%' },
      { id:'normal',  months:[],            factor:1.00, label:'평시',        badge:'평시' },
    ],
  },
  {
    /* 유럽 — 여름(6~9월) 성수기 / 겨울(11~2월) 비수기. 동유럽도 시즌상 여기 포함 */
    keys: ['서유럽','로마','파리','영국','스페인','독일','네덜란드','북유럽','동유럽'],
    config: [
      { id:'peak',    months:[6,7,8,9],   factor:1.20, label:'여름 성수기', badge:'여름 성수기 +20%' },
      { id:'offpeak', months:[11,12,1,2], factor:0.88, label:'겨울 비수기', badge:'겨울 비수기 −12%' },
      { id:'normal',  months:[],          factor:1.00, label:'평시',        badge:'평시' },
    ],
  },
  {
    /* 일본 — 벚꽃(3~4월)·여름(7~8월)·단풍(10~11월) 성수기 / 겨울초(1월)·장마(6월) 비수기.
       골든위크·벚꽃 피크는 PEAK_CALENDAR가 날짜로 별도 가산. 삿포로(겨울)·오키나와(여름)는 예외. */
    keys: ['도쿄','오사카','후쿠오카','나고야','삿포로','오키나와'],
    config: [
      { id:'peak',    months:[3,4,7,8,10,11], factor:1.15, label:'벚꽃·단풍·여름 성수기', badge:'성수기 +15%' },
      { id:'offpeak', months:[1,6],           factor:0.90, label:'비수기',              badge:'비수기 −10%' },
      { id:'normal',  months:[],              factor:1.00, label:'평시',                badge:'평시' },
    ],
  },
  {
    /* 홍콩·마카오 — 가을~초겨울(10~12월, 온화·쇼핑) 성수기 / 한여름(6~8월, 무덥고 태풍) 비수기 */
    keys: ['홍콩','마카오'],
    config: [
      { id:'peak',    months:[10,11,12], factor:1.12, label:'가을·연말 성수기', badge:'성수기 +12%' },
      { id:'offpeak', months:[6,7,8],    factor:0.90, label:'한여름 비수기',   badge:'비수기 −10%' },
      { id:'normal',  months:[],         factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 중국(본토) — 여름(7~8월)·가을(10월 국경절) 성수기 / 한겨울(1~2월) 비수기. 춘절은 PEAK_CALENDAR가 가산 */
    keys: ['상해','장가계','청도','연태'],
    config: [
      { id:'peak',    months:[7,8,10], factor:1.12, label:'여름·국경절 성수기', badge:'성수기 +12%' },
      { id:'offpeak', months:[1,2],    factor:0.90, label:'한겨울 비수기',     badge:'비수기 −10%' },
      { id:'normal',  months:[],       factor:1.00, label:'평시',              badge:'평시' },
    ],
  },
  {
    /* 몽골 — 여름(6~8월, 초원관광 극성수기) / 혹한기(11~3월) 강비수기 */
    keys: ['몽골'],
    config: [
      { id:'peak',    months:[6,7,8],       factor:1.25, label:'여름 극성수기', badge:'여름 성수기 +25%' },
      { id:'offpeak', months:[11,12,1,2,3], factor:0.82, label:'혹한기 비수기', badge:'비수기 −18%' },
      { id:'normal',  months:[],            factor:1.00, label:'평시',          badge:'평시' },
    ],
  },
  {
    /* 대만 — 가을·겨울(10~12월, 온화) 성수기 / 한여름(7~8월, 무덥고 태풍) 비수기. 춘절은 PEAK_CALENDAR가 가산 */
    keys: ['대만','가오슝'],
    config: [
      { id:'peak',    months:[10,11,12], factor:1.12, label:'가을·겨울 성수기', badge:'성수기 +12%' },
      { id:'offpeak', months:[7,8],      factor:0.90, label:'한여름 비수기',   badge:'비수기 −10%' },
      { id:'normal',  months:[],         factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 괌·사이판 — 건기·방학철(12~3,7~8월) 성수기 / 우기·태풍철(9~10월) 비수기 */
    keys: ['괌','사이판'],
    config: [
      { id:'peak',    months:[12,1,2,3,7,8], factor:1.15, label:'건기·방학 성수기', badge:'성수기 +15%' },
      { id:'offpeak', months:[9,10],         factor:0.90, label:'우기 비수기',     badge:'비수기 −10%' },
      { id:'normal',  months:[],             factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 북미 — 여름(6~8월)·연말(12월) 성수기 / 늦겨울(2~3월) 비수기. 하와이는 겨울도 강성수기라 예외 */
    keys: ['로스앤젤레스','샌프란시스코','워싱턴','뉴욕','하와이','밴쿠버','토론토'],
    config: [
      { id:'peak',    months:[6,7,8,12], factor:1.15, label:'여름·연말 성수기', badge:'성수기 +15%' },
      { id:'offpeak', months:[2,3],      factor:0.92, label:'늦겨울 비수기',   badge:'비수기 −8%' },
      { id:'normal',  months:[],         factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 중앙아시아(카자흐스탄·우즈베키스탄) — 봄가을(4~6,9~10월) 쾌적 성수기 / 혹서(7~8월)·혹한(12~2월) 비수기 */
    keys: ['카자흐스탄','우즈베키스탄'],
    config: [
      { id:'peak',    months:[4,5,6,9,10], factor:1.12, label:'봄·가을 성수기',   badge:'성수기 +12%' },
      { id:'offpeak', months:[7,8,12,1,2], factor:0.90, label:'혹서·혹한 비수기', badge:'비수기 −10%' },
      { id:'normal',  months:[],           factor:1.00, label:'평시',             badge:'평시' },
    ],
  },
];

/* 호텔 등급별 단가 계수 (4성급 = 기준 1.0) */
const HOTEL_GRADES = {
  standard: { label: '3성급',   factor: 0.75 },
  superior: { label: '4성급',  factor: 1.00 },
  deluxe:   { label: '5성급', factor: 1.40 },
};

/* =====================================================================
   RATE_META — Level 2: 요율 버전 및 갱신 이력 관리
   ─────────────────────────────────────────────────────────────────────
   담당자가 요율을 갱신할 때마다 아래 항목을 업데이트하세요.
   version   : YYYY.MM.순번  (예: 2026.09.1)
   updated   : 전체 검토 완료월 YYYY-MM
   nextReview: 다음 정기 검토 예정월 (권장 3개월 주기)
   ===================================================================== */
const RATE_META = {
  version:    '2026.06.1',
  updated:    '2026-06',
  updatedBy:  '비즈페이지 견적팀',
  nextReview: '2026-09',
  note:       '초기 버전 관리 체계 구축. 분기별(3개월) 갱신 권장.',
};

/* =====================================================================
   destination_rates
   ─────────────────────────────────────────────────────────────────────
   rateDate : 이 도시 요율을 마지막으로 확인한 월 (YYYY-MM)
              → 갱신 시 해당 행의 rateDate만 변경하면 됩니다.
   notes    : 운영 참고사항 (변동성·확인 주의사항 등)
              → 특이사항 없으면 빈 문자열로 유지

   ⚠ 이중 관리 주의: 여기 destination_key 목록은 index.html의
   <select id="destination"> 옵션 목록, script.js의 BIZ_ZONES(좌석 등급 배율
   구간 매핑)과 반드시 1:1로 일치해야 합니다. 목적지를 추가/삭제할 때는
   세 곳을 모두 함께 수정하세요 — 한 곳만 바꾸면 getDestinationByKey()가
   조용히 undefined를 반환하거나 getBizFactor()가 잘못된 요율 구간(short)으로
   조용히 폴백되어 견적 금액이 틀어질 수 있습니다 (2026-07-06 야간 점검 시
   확인 결과 현재는 55개 전부 정확히 일치함).
   ===================================================================== */
const destinationRates = [
  /* ── 동북아시아 : 일본 ── */
  {"destination_key":"도쿄",        "label":"도쿄",        "airfare":380000, "fuel_surcharge":180000,"hotel_per_room":300000,"meal_per_person":25000, "vehicle_large":1200000,"vehicle_small":840000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"오사카",       "label":"오사카",       "airfare":360000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1100000,"vehicle_small":770000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"후쿠오카",     "label":"후쿠오카",     "airfare":330000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1000000,"vehicle_small":700000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"나고야",       "label":"나고야",       "airfare":350000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1050000,"vehicle_small":730000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"삿포로",       "label":"삿포로",       "airfare":380000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1150000,"vehicle_small":800000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 7~8월(선선한 여름)·12~2월(눈축제·스키) · 평시: 9~10월(단풍) · 비수기: 3~4월(잔설)·5월"},
  {"destination_key":"오키나와",     "label":"오키나와",     "airfare":360000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1100000,"vehicle_small":770000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 7~9월(해변) · 평시: 4~6월·10월 · 비수기: 12~2월. 태풍 8~9월 주의"},
  /* ── 동북아시아 : 홍콩 · 마카오 ── */
  {"destination_key":"홍콩",         "label":"홍콩",         "airfare":480000, "fuel_surcharge":200000,"hotel_per_room":230000,"meal_per_person":20000, "vehicle_large":750000, "vehicle_small":520000, "guide_fee":300000,"sightseeing_fee":70000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(선선·건조) · 평시: 3~5월 · 비수기: 6~9월(우기·태풍·고온다습)"},
  {"destination_key":"마카오",       "label":"마카오",       "airfare":430000, "fuel_surcharge":200000,"hotel_per_room":300000,"meal_per_person":20000, "vehicle_large":750000, "vehicle_small":520000, "guide_fee":350000,"sightseeing_fee":60000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(선선·건조) · 평시: 3~5월 · 비수기: 6~9월(우기·태풍·고온다습)"},
  /* ── 동북아시아 : 중국 ── */
  {"destination_key":"상해",         "label":"상해",         "airfare":380000, "fuel_surcharge":180000,"hotel_per_room":220000,"meal_per_person":20000, "vehicle_large":450000, "vehicle_small":300000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 4~6월·9~11월(맑고 쾌적) · 평시: 3월·12월 · 비수기: 7~8월(무덥고 습함)·1~2월(한랭). 9월초 태풍 영향 가능"},
  {"destination_key":"장가계",       "label":"장가계",       "airfare":360000, "fuel_surcharge":180000,"hotel_per_room":120000,"meal_per_person":15000, "vehicle_large":420000, "vehicle_small":300000, "guide_fee":255000,"sightseeing_fee":260000,"margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 4~6월·9~11월(운해·단풍) · 평시: 3월·12월 · 비수기: 7~8월(고온다습)·1~2월(한랭)"},
  {"destination_key":"청도",         "label":"청도",         "airfare":280000, "fuel_surcharge":150000,"hotel_per_room":120000,"meal_per_person":18000, "vehicle_large":500000, "vehicle_small":350000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 5~6월·9~10월(해양성 온화 기후) · 평시: 4월·11월 · 비수기: 7~8월(고온다습)·12~2월(한랭)"},
  {"destination_key":"연태",         "label":"연태",         "airfare":260000, "fuel_surcharge":150000,"hotel_per_room":70000, "meal_per_person":15000, "vehicle_large":450000, "vehicle_small":320000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 5~6월·9~10월(해양성 온화 기후) · 평시: 4월·11월 · 비수기: 7~8월(고온다습)·12~2월(한랭)"},
  /* ── 동북아시아 : 몽골 · 대만 ── */
  {"destination_key":"몽골",         "label":"몽골",         "airfare":420000, "fuel_surcharge":200000,"hotel_per_room":196000,"meal_per_person":25000, "vehicle_large":420000, "vehicle_small":280000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 6~8월(온화·나담축제 7월 중순 최성수기) · 평시: 5월·9월 · 비수기: 11~3월(혹한, -30℃ 이하 가능)"},
  {"destination_key":"대만",         "label":"대만",         "airfare":420000, "fuel_surcharge":200000,"hotel_per_room":170000,"meal_per_person":20000, "vehicle_large":450000, "vehicle_small":320000, "guide_fee":220000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(건기·쾌적) · 평시: 3~5월·9~10월 · 비수기: 6~9월(우기). 태풍 7~9월 주의"},
  {"destination_key":"가오슝",       "label":"가오슝",       "airfare":420000, "fuel_surcharge":200000,"hotel_per_room":220000,"meal_per_person":20000, "vehicle_large":550000, "vehicle_small":380000, "guide_fee":250000,"sightseeing_fee":60000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(남부라 겨울에도 온화) · 평시: 3~5월·9~10월 · 비수기: 6~9월(우기·태풍)"},
  /* ── 동남아시아 ── */
  {"destination_key":"라오스",       "label":"라오스",       "airfare":600000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":15000, "vehicle_large":170000, "vehicle_small":110000, "guide_fee":220000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(건기·선선) · 평시: 3~4월 · 비수기: 5~10월(우기)"},
  {"destination_key":"싱가포르",     "label":"싱가포르",     "airfare":480000, "fuel_surcharge":200000,"hotel_per_room":300000,"meal_per_person":25000, "vehicle_large":600000, "vehicle_small":420000, "guide_fee":350000,"sightseeing_fee":100000,"margin_per_traveler":220000, "rateDate":"2026-06", "notes":"성수기(7·8월) 호텔 단가 급등 주의. 성수기 출발 시 재확인 권장.", "season_note":"연중 고온다습(적도 기후) · 우기: 11~1월(몬순, 강수 집중) · 한국 방학과 겹치는 7~8월은 관광 성수기로 호텔 단가 급등"},
  {"destination_key":"하노이",       "label":"하노이",       "airfare":450000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":18000, "vehicle_large":220000, "vehicle_small":160000, "guide_fee":220000,"sightseeing_fee":60000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~4월(건기·선선) · 평시: 5월 · 비수기: 5~10월(우기), 태풍 8~10월"},
  {"destination_key":"호치민",       "label":"호치민",       "airfare":480000, "fuel_surcharge":280000,"hotel_per_room":220000,"meal_per_person":20000, "vehicle_large":250000, "vehicle_small":160000, "guide_fee":220000,"sightseeing_fee":60000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 12~4월(건기) · 평시: 11월 · 비수기: 5~11월(우기)"},
  {"destination_key":"다낭",         "label":"다낭",         "airfare":420000, "fuel_surcharge":280000,"hotel_per_room":150000,"meal_per_person":15000, "vehicle_large":180000, "vehicle_small":100000, "guide_fee":202500,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 2~7월(건기, 해변 5~8월) · 평시: 8월 · 비수기: 9월~1월(우기, 태풍 9~11월 최다)"},
  {"destination_key":"나트랑",       "label":"나트랑",       "airfare":420000, "fuel_surcharge":280000,"hotel_per_room":150000,"meal_per_person":15000, "vehicle_large":180000, "vehicle_small":100000, "guide_fee":202500,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 1~8월(건기) · 평시: 9월 · 비수기: 10~12월(우기, 태풍 영향)"},
  {"destination_key":"푸꾸옥",       "label":"푸꾸옥",       "airfare":420000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":15000, "vehicle_large":180000, "vehicle_small":100000, "guide_fee":202500,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~4월(건기) · 평시: 5월 · 비수기: 5~10월(우기)"},
  {"destination_key":"세부",         "label":"세부",         "airfare":420000, "fuel_surcharge":250000,"hotel_per_room":280000,"meal_per_person":25000, "vehicle_large":320000, "vehicle_small":220000, "guide_fee":250000,"sightseeing_fee":100000,"margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 12~5월(건기·습도 낮음) · 평시: 6월 · 비수기: 6~11월(우기), 태풍 7~10월"},
  {"destination_key":"마닐라",       "label":"마닐라",       "airfare":380000, "fuel_surcharge":250000,"hotel_per_room":250000,"meal_per_person":22000, "vehicle_large":300000, "vehicle_small":210000, "guide_fee":250000,"sightseeing_fee":100000,"margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 12~5월(건기) · 평시: 6월 · 비수기: 6~11월(우기), 태풍 7~10월"},
  {"destination_key":"보홀",         "label":"보홀",         "airfare":500000, "fuel_surcharge":280000,"hotel_per_room":250000,"meal_per_person":15000, "vehicle_large":200000, "vehicle_small":130000, "guide_fee":220000,"sightseeing_fee":160000,"margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 12~5월(건기) · 평시: 6월 · 비수기: 6~11월(우기), 태풍 7~10월"},
  {"destination_key":"코타키나발루", "label":"코타키나발루", "airfare":520000, "fuel_surcharge":280000,"hotel_per_room":350000,"meal_per_person":25000, "vehicle_large":450000, "vehicle_small":300000, "guide_fee":300000,"sightseeing_fee":120000,"margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~10월(건기) · 평시: 11월 · 비수기: 11~2월(몬순 우기)"},
  {"destination_key":"캄보디아",     "label":"캄보디아",     "airfare":500000, "fuel_surcharge":280000,"hotel_per_room":180000,"meal_per_person":12000, "vehicle_large":180000, "vehicle_small":110000, "guide_fee":202500,"sightseeing_fee":80000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(건기·선선) · 평시: 3~4월 · 비수기: 5~10월(우기)"},
  {"destination_key":"방콕",         "label":"방콕",         "airfare":500000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":20000, "vehicle_large":300000, "vehicle_small":110000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 12~2월(건기·최적) · 평시: 11월·3월(혹서기 시작) · 비수기: 6~10월(우기)"},
  {"destination_key":"푸켓",         "label":"푸켓",         "airfare":500000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":20000, "vehicle_large":300000, "vehicle_small":110000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~4월(건기) · 평시: 3월 · 비수기: 5~10월(안다만해 스콜성 우기)"},
  {"destination_key":"치앙마이",     "label":"치앙마이",     "airfare":500000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":20000, "vehicle_large":300000, "vehicle_small":110000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 11~2월(건기·쾌적) · 평시: 3~4월(스모그 시즌 주의) · 비수기: 5~10월(우기)"},
  {"destination_key":"발리",         "label":"발리",         "airfare":600000, "fuel_surcharge":320000,"hotel_per_room":280000,"meal_per_person":40000, "vehicle_large":250000, "vehicle_small":170000, "guide_fee":99000, "sightseeing_fee":80000, "margin_per_traveler":220000, "rateDate":"2026-06", "notes":"환율(IDR)·호텔 단가 변동성 높음. 분기별 재확인 권장.", "season_note":"성수기: 4~10월(건기, 한국 방학 겹치는 7~9월 최성수기) · 비수기: 11~3월(우기, 한낮 34℃ 이상)"},
  /* ── 오세아니아 & 태평양 ── */
  {"destination_key":"괌",           "label":"괌",           "airfare":650000, "fuel_surcharge":320000,"hotel_per_room":300000,"meal_per_person":30000, "vehicle_large":320000, "vehicle_small":210000, "guide_fee":405000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 1~5월(건기·잔잔한 바다) · 평시: 6~7월 · 비수기: 8~10월(태풍·열대성 폭우 집중)"},
  {"destination_key":"사이판",       "label":"사이판",       "airfare":650000, "fuel_surcharge":320000,"hotel_per_room":300000,"meal_per_person":30000, "vehicle_large":300000, "vehicle_small":200000, "guide_fee":210000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 12~5월(건기) · 평시: 6~7월 · 비수기: 8~10월(태풍 시즌)"},
  {"destination_key":"시드니",       "label":"시드니",       "airfare":1100000,"fuel_surcharge":520000,"hotel_per_room":250000,"meal_per_person":35000, "vehicle_large":1300000,"vehicle_small":975000, "guide_fee":400000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"환율(AUD) 변동 영향. 분기별 확인 권장.", "season_note":"남반구라 한국과 계절 반대 — 성수기: 12~2월(현지 여름) · 평시: 3~5월·9~11월(봄가을) · 비수기: 6~8월(현지 겨울)"},
  {"destination_key":"멜버른",       "label":"멜버른",       "airfare":1100000,"fuel_surcharge":520000,"hotel_per_room":300000,"meal_per_person":35000, "vehicle_large":1300000,"vehicle_small":975000, "guide_fee":400000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"환율(AUD) 변동 영향. 분기별 확인 권장.", "season_note":"남반구라 한국과 계절 반대 — 성수기: 12~2월(현지 여름) · 평시: 3~5월·9~11월(봄가을) · 비수기: 6~8월(현지 겨울)"},
  {"destination_key":"오클랜드",     "label":"오클랜드",     "airfare":1200000,"fuel_surcharge":550000,"hotel_per_room":300000,"meal_per_person":35000, "vehicle_large":1400000,"vehicle_small":1050000,"guide_fee":360000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"환율(NZD) 변동 영향. 분기별 확인 권장.", "season_note":"남반구라 한국과 계절 반대 — 성수기: 12~2월(현지 여름) · 평시: 3~5월·9~11월(봄가을) · 비수기: 6~8월(현지 겨울)"},
  /* ── 유럽 ── */
  {"destination_key":"서유럽",       "label":"서유럽",       "airfare":1300000,"fuel_surcharge":520000,"hotel_per_room":350000,"meal_per_person":38000, "vehicle_large":1800000,"vehicle_small":1350000,"guide_fee":500000,"sightseeing_fee":200000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"항공+호텔 복합 변동. 분기별 재확인 권장.", "season_note":"성수기: 6~8월(백야·긴 낮) · 평시: 4~5월·9~10월(쾌적) · 준성수기: 12월(크리스마스마켓) · 비수기: 1~2월"},
  {"destination_key":"로마",         "label":"로마",         "airfare":1200000,"fuel_surcharge":520000,"hotel_per_room":350000,"meal_per_person":30000, "vehicle_large":1400000,"vehicle_small":1050000,"guide_fee":435000,"sightseeing_fee":120000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(EUR) 변동. 분기별 확인.", "season_note":"성수기: 6~8월 · 평시: 4~5월·9~10월(쾌적) · 준성수기: 12월 · 비수기: 1~2월"},
  {"destination_key":"파리",         "label":"파리",         "airfare":1400000,"fuel_surcharge":550000,"hotel_per_room":350000,"meal_per_person":35000, "vehicle_large":1500000,"vehicle_small":1125000,"guide_fee":435000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(EUR)·호텔 단가 변동. 분기별 재확인 권장.", "season_note":"성수기: 6~8월(백야) · 평시: 4~5월·9~10월 · 준성수기: 12월(크리스마스마켓) · 비수기: 1~2월"},
  {"destination_key":"영국",         "label":"영국",         "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":350000,"meal_per_person":35000, "vehicle_large":1600000,"vehicle_small":1200000,"guide_fee":435000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(GBP) 변동성 큰 지역. 분기별 재확인 권장.", "season_note":"성수기: 6~8월 · 평시: 4~5월·9~10월 · 준성수기: 12월 · 비수기: 1~2월(해 짧고 흐림)"},
  {"destination_key":"스페인",       "label":"스페인",       "airfare":1400000,"fuel_surcharge":550000,"hotel_per_room":350000,"meal_per_person":30000, "vehicle_large":1700000,"vehicle_small":1275000,"guide_fee":435000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(EUR) 변동. 분기별 확인.", "season_note":"성수기: 6~8월 · 평시: 4~5월·9~10월 · 준성수기: 12월 · 비수기: 1~2월"},
  {"destination_key":"독일",         "label":"독일",         "airfare":1400000,"fuel_surcharge":580000,"hotel_per_room":280000,"meal_per_person":30000, "vehicle_large":1800000,"vehicle_small":1350000,"guide_fee":400000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(EUR) 변동. 분기별 확인.", "season_note":"성수기: 6~8월 · 평시: 4~5월·9~10월 · 준성수기: 12월(크리스마스마켓) · 비수기: 1~2월"},
  {"destination_key":"네덜란드",     "label":"네덜란드",     "airfare":1400000,"fuel_surcharge":580000,"hotel_per_room":350000,"meal_per_person":40000, "vehicle_large":1800000,"vehicle_small":1350000,"guide_fee":500000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(EUR) 변동. 분기별 확인.", "season_note":"성수기: 4~5월(튤립)·6~8월 · 평시: 9~10월 · 준성수기: 12월 · 비수기: 1~2월"},
  {"destination_key":"북유럽",       "label":"북유럽",       "airfare":1600000,"fuel_surcharge":600000,"hotel_per_room":350000,"meal_per_person":40000, "vehicle_large":2000000,"vehicle_small":1500000,"guide_fee":600000,"sightseeing_fee":200000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(EUR/NOK/SEK) 복합 변동. 분기별 재확인 권장.", "season_note":"성수기: 6~8월(백야) · 준성수기: 11~2월(오로라) · 비수기: 3~5월·9~10월"},
  /* ── 북미 : 미국 ── */
  {"destination_key":"로스앤젤레스", "label":"로스앤젤레스", "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":369900,"meal_per_person":40500, "vehicle_large":2000000,"vehicle_small":1500000,"guide_fee":560000,"sightseeing_fee":200000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(USD) 변동. 분기별 확인.", "season_note":"성수기: 6~8월·12월(연말연시) · 평시: 4~5월·9~10월 · 비수기: 1~2월"},
  {"destination_key":"샌프란시스코", "label":"샌프란시스코", "airfare":1600000,"fuel_surcharge":600000,"hotel_per_room":369900,"meal_per_person":40500, "vehicle_large":2500000,"vehicle_small":1875000,"guide_fee":560000,"sightseeing_fee":200000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"호텔 단가 변동성 높음. 분기별 확인.", "season_note":"성수기: 6~8월·12월(연말연시) · 평시: 4~5월·9~10월 · 비수기: 1~2월"},
  {"destination_key":"워싱턴",       "label":"워싱턴",       "airfare":1700000,"fuel_surcharge":620000,"hotel_per_room":400000,"meal_per_person":45000, "vehicle_large":3100000,"vehicle_small":2325000,"guide_fee":560000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"차량 단가 변동성 높음. 분기별 확인.", "season_note":"성수기: 3월말~4월초(벚꽃)·6~8월·12월 · 평시: 9~10월(단풍) · 비수기: 1~2월"},
  {"destination_key":"뉴욕",         "label":"뉴욕",         "airfare":1900000,"fuel_surcharge":750000,"hotel_per_room":550000,"meal_per_person":75000, "vehicle_large":3500000,"vehicle_small":2600000,"guide_fee":650000,"sightseeing_fee":250000,"margin_per_traveler":400000, "rateDate":"2026-06", "notes":"호텔·식사 단가 변동성 가장 높음. 월별 재확인 권장.", "season_note":"성수기: 6~8월·11월말(추수감사절)·12월(연말·크리스마스) · 평시: 4~5월·9~10월 · 비수기: 1~2월"},
  {"destination_key":"하와이",       "label":"하와이",       "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":400000,"meal_per_person":40000, "vehicle_large":2200000,"vehicle_small":1650000,"guide_fee":580000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"성수기 요금 급등. 성수기 출발 시 재확인 권장.", "season_note":"성수기: 12월말~3월(연말연시 최고가)·한국 방학 7~8월 · 평시: 4~5월·9~10월(날씨 좋고 저렴) · 우기: 10월중~3월"},
  /* ── 북미 : 캐나다 ── */
  {"destination_key":"밴쿠버",       "label":"밴쿠버",       "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":350000,"meal_per_person":35000, "vehicle_large":2000000,"vehicle_small":1500000,"guide_fee":400000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(CAD) 변동. 분기별 확인.", "season_note":"성수기: 6~8월·12월 · 평시: 4~5월·9~10월 · 비수기: 1~2월"},
  {"destination_key":"토론토",       "label":"토론토",       "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":350000,"meal_per_person":35000, "vehicle_large":2000000,"vehicle_small":1500000,"guide_fee":400000,"sightseeing_fee":100000,"margin_per_traveler":300000, "rateDate":"2026-06", "notes":"환율(CAD) 변동. 분기별 확인.", "season_note":"성수기: 6~8월(단풍은 9~10월)·12월 · 평시: 4~5월·9~10월 · 비수기: 1~2월(혹한)"},
  /* ── 오세아니아 : 호주(기타) ── */
  {"destination_key":"호주",         "label":"호주",         "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":300000,"meal_per_person":35000, "vehicle_large":1400000,"vehicle_small":1050000,"guide_fee":350000,"sightseeing_fee":100000,"margin_per_traveler":250000, "rateDate":"2026-06", "notes":"환율(AUD) 변동 영향. 분기별 확인.", "season_note":"남반구라 한국과 계절 반대 — 성수기: 12~2월(현지 여름) · 평시: 3~5월·9~11월 · 비수기: 6~8월(현지 겨울)"},
  /* ── 중앙아시아 ── */
  {"destination_key":"카자흐스탄",   "label":"카자흐스탄",   "airfare":800000, "fuel_surcharge":350000,"hotel_per_room":150000,"meal_per_person":20250, "vehicle_large":550000, "vehicle_small":350000, "guide_fee":216000,"sightseeing_fee":47250, "margin_per_traveler":200000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 4~5월·9~10월(온화, 9~10월은 수확철 축제와 겹침) · 비수기: 6~8월(혹서 40℃+)·12~2월(혹한 -40℃ 가능)"},
  {"destination_key":"우즈베키스탄", "label":"우즈베키스탄", "airfare":950000, "fuel_surcharge":400000,"hotel_per_room":300000,"meal_per_person":30000, "vehicle_large":1200000,"vehicle_small":850000, "guide_fee":400000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"항공 직항 여부 시즌별 확인 필요.", "season_note":"성수기: 4~5월·9~10월(온화) · 비수기: 6~8월(혹서)·12~2월(혹한)"},
  {"destination_key":"동유럽",       "label":"동유럽",       "airfare":1200000,"fuel_surcharge":520000,"hotel_per_room":250000,"meal_per_person":30000, "vehicle_large":1100000,"vehicle_small":825000, "guide_fee":350000,"sightseeing_fee":100000,"margin_per_traveler":200000, "rateDate":"2026-06", "notes":"환율(EUR/PLN) 복합 변동. 분기별 확인.", "season_note":"성수기: 6~8월 · 평시: 4~5월·9~10월 · 준성수기: 12월(크리스마스마켓) · 비수기: 1~2월"}
];

/* 서버(Node)에서 관리자 신규 목적지 생성 시 내장 목적지와의 destination_key 충돌을
   검사할 수 있도록 하는 isomorphic export (dest_currency.js와 동일한 패턴). 브라우저
   에서는 module이 없어 조건이 거짓이 되므로 아무 영향 없음. */
if (typeof module !== 'undefined' && module.exports) module.exports = destinationRates;

/* =====================================================================
   DEST_REC — 목적지별 연수 방식 추천 콘텐츠
   방식 A: 역량강화형  |  방식 B: 동기부여·화합형
   ─────────────────────────────────────────────────────────────────────
   tag    : 방식 레이블
   desc   : 한 줄 테마 설명
   points : 핵심 포인트 3가지 (카드 미리보기)
   items  : 일별 주요 활동 (2~5일차에 순환 적용)
   value  : 결재 보고서용 기대 효과 문구
   ===================================================================== */
const DEST_REC = {

  /* ── 일본 ── */
  '도쿄': {
    a: { tag:'역량강화형', desc:'일본 제조·IT 혁신 현장 벤치마킹',
         points:['도요타·소니 공장 견학','도쿄대·와세다대 방문·강의','스타트업 허브 투어'],
         items:['도요타 생산방식(TPS) 현장 강의','소니 혁신센터 투어','IT 스타트업 생태계 탐방','일본 제조업 전문가 세미나'],
         value:'글로벌 제조·기술 혁신 현장 체감으로 실무 혁신 아이디어 확보' },
    b: { tag:'동기부여·화합형', desc:'도쿄 문화의 정수를 팀이 함께 만끽',
         points:['스카이트리 팀 만찬·야경 감상','전통 스시·다도 문화 체험','신주쿠·시부야 자유 탐방'],
         items:['도쿄 야경 유람선 팀 저녁','아사쿠사 전통 체험','팀 스시 만들기 클래스','하라주쿠·오모테산도 탐방'],
         value:'이색 일본 문화 몰입으로 팀 결속력 강화·재충전' },
  },
  '오사카': {
    a: { tag:'역량강화형', desc:'간사이 제조·바이오·물류 산업 현장 학습',
         points:['파나소닉 뮤지엄 견학','오사카대 방문·강의','간사이 물류 혁신 센터 투어'],
         items:['파나소닉 기술 혁신관 견학','오사카 과학기술센터 방문','중소기업 현장 견학','바이오 클러스터 투어'],
         value:'글로벌 제조·바이오 트렌드 현장 학습으로 신사업 인사이트 획득' },
    b: { tag:'동기부여·화합형', desc:'오사카 식문화·엔터테인먼트의 도시를 만끽',
         points:['유니버설스튜디오 재팬 전일 체험','도톤보리 야식 투어','팀 타코야키·오코노미야키 체험'],
         items:['유니버설스튜디오 재팬 자유 이용','도톤보리 먹거리 탐방','오사카성 역사 탐방','팀 요리 교실'],
         value:'오사카 특유의 활기찬 에너지로 팀 사기 진작·결속 강화' },
  },
  '후쿠오카': {
    a: { tag:'역량강화형', desc:'한-일 비즈니스 교류 최전선, 규슈 산업 현장 탐방',
         points:['규슈대학 방문·강의','후쿠오카 IT·스타트업 탐방','한-일 비즈니스 교류 세미나'],
         items:['규슈 IT 밸리 탐방','스마트시티 현장 방문','한-일 비즈니스 세미나','규슈 제조업 현장 견학'],
         value:'지리적 인접 일본 비즈니스 허브에서 한-일 협력 가능성 탐색' },
    b: { tag:'동기부여·화합형', desc:'야타이·온천·자연이 어우러진 힐링 연수',
         points:['후쿠오카 야타이 포장마차 팀 저녁','유후인·벳부 온천 체험','하카타 전통 거리 탐방'],
         items:['야타이 포장마차 팀 저녁','유후인 온천 반나절 투어','다자이후 신사 방문','모모치 해변 팀 활동'],
         value:'온천·자연·미식의 조화로 완벽한 재충전, 팀 친밀감 극대화' },
  },
  '나고야': {
    a: { tag:'역량강화형', desc:'세계 제조업의 심장 나고야에서 생산혁신을 배우다',
         points:['도요타 산업기술기념관 견학','나고야대학 캠퍼스 방문','항공·자동차 부품 클러스터 탐방'],
         items:['도요타 박물관 심층 강의','나고야 제조업 클러스터 투어','항공·방위 산업 전시관','자동차 부품 중소기업 현장'],
         value:'세계 자동차 산업 메카에서 TPS·린 생산방식 직접 체감' },
    b: { tag:'동기부여·화합형', desc:'히쓰마부시와 나고야성, 나고야의 매력 탐방',
         points:['나고야성 역사 투어','히쓰마부시 전통 장어 만찬','메이지무라 레트로 체험'],
         items:['나고야성 내부 투어','히쓰마부시 요리 체험','오스 쇼핑 아케이드 탐방','팀 기념 촬영'],
         value:'역사와 미식이 살아있는 나고야에서 팀 화합의 추억 만들기' },
  },
  '삿포로': {
    a: { tag:'역량강화형', desc:'홋카이도 농업·식품 산업 혁신 현장 학습',
         points:['홋카이도대학 농학부 방문·강의','식품 6차산업화 사례 현장','식품 가공·콜드체인 견학'],
         items:['홋카이도대 첨단 농업 연구 투어','식품 가공 현장 견학','농업 6차 산업화 사례 세미나','유제품 생산 현장 방문'],
         value:'일본 최대 식품 산업 기지에서 농업·식품 혁신 모델 벤치마킹' },
    b: { tag:'동기부여·화합형', desc:'설경·게 요리·맥주의 도시, 삿포로 힐링 연수',
         points:['삿포로 눈 축제·스키 체험','게 요리 특별 만찬','삿포로 맥주 공장 투어'],
         items:['삿포로 눈 축제·스키 체험','삿포로 맥주 박물관 견학','해산물 시장 투어','오도리 공원 산책'],
         value:'비일상적 설경 속 팀 활력 재충전, 특별한 음식 문화 체험' },
  },
  '오키나와': {
    a: { tag:'역량강화형', desc:'오키나와 관광·리조트 산업 혁신 모델 학습',
         points:['오키나와 관광청 방문·산업 강의','리조트 경영 혁신 사례 세미나','국제물류허브 현장 견학'],
         items:['오키나와 관광 혁신 강의','리조트 경영 현장 투어','국제 물류·공항 시설 견학','오키나와 전략산업 좌담회'],
         value:'아시아 최고 리조트 운영 노하우와 관광 혁신 모델 현장 학습' },
    b: { tag:'동기부여·화합형', desc:'에메랄드 바다에서 팀 에너지를 되찾다',
         points:['스노클링·다이빙 팀 활동','츄라우미 수족관 관람','류큐 문화 체험'],
         items:['스노클링·카약 팀 체험','츄라우미 수족관 프라이빗 투어','류큐 전통 의상 착용','오키나와 BBQ 팀 만찬'],
         value:'아름다운 해양 자연 속 특별 체험으로 팀 결속·재충전 극대화' },
  },

  /* ── 홍콩·마카오 ── */
  '홍콩': {
    a: { tag:'역량강화형', desc:'아시아 금융·물류 허브에서 글로벌 비즈니스 감각 체득',
         points:['홍콩 금융지구 투어','홍콩 과기대(HKUST) 방문','아시아 무역·물류 혁신 세미나'],
         items:['홍콩 금융지구 워킹 투어','홍콩 무역개발국 방문','아시아 스타트업 세미나','사이언스파크 견학'],
         value:'아시아 금융·무역 허브 현장 체감으로 글로벌 비즈니스 안목 확장' },
    b: { tag:'동기부여·화합형', desc:'홍콩의 밤을 수놓는 야경과 먹거리의 향연',
         points:['빅토리아 피크 야경 감상','딤섬 팀 만찬','홍콩 야시장 자유 탐방'],
         items:['스타의 거리·침사추이 야경','딤섬 전문 팀 만찬','란타우섬 빅붓다 방문','홍콩 쇼핑 자유 탐방'],
         value:'아시아 최고 야경 도시에서 팀 감동과 특별한 추억 만들기' },
  },
  '마카오': {
    a: { tag:'역량강화형', desc:'관광·엔터테인먼트 세계적 성공 모델 분석',
         points:['마카오 관광청 방문·산업 강의','통합리조트 경영 현장 견학','MICE 산업 성공 사례 세미나'],
         items:['마카오 관광 성공 사례 강의','카지노·MICE 복합 리조트 투어','한국 기업 파트너 미팅','마카오 경제 개발 세미나'],
         value:'동서양 문화 융합 관광 산업의 성공 모델에서 사업 영감 획득' },
    b: { tag:'동기부여·화합형', desc:'동서양이 만나는 이국적 도시에서의 특별한 팀 시간',
         points:['베네치안 마카오 자유 체험','포르투갈 콜로니얼 거리 탐방','마카오 야경 루프탑 만찬'],
         items:['코타이 스트립 체험','세계문화유산 구시가지 투어','포르투갈 요리 팀 만찬','마카오 타워 스카이워크'],
         value:'동서양 문화가 공존하는 이국적 환경에서 팀 에너지·감성 충전' },
  },

  /* ── 중국 ── */
  '상해': {
    a: { tag:'역량강화형', desc:'중국 경제 수도에서 글로벌 비즈니스 현장 체감',
         points:['알리바바·화웨이 캠퍼스 방문','상해교통대 방문·교류','푸둥 스마트시티 탐방'],
         items:['알리바바 클라우드·물류 센터 견학','중국 스타트업 생태계 투어','상해 자유무역구 현장 강의','한국 기업 중국 법인 방문'],
         value:'세계 최대 디지털 경제 현장 체감으로 중국 시장 진출 인사이트 획득' },
    b: { tag:'동기부여·화합형', desc:'동방의 파리, 상해의 매력을 팀이 함께 탐험',
         points:['외탄 야경 황푸강 크루즈','신천지 팀 저녁 만찬','동방명주·상해타워 전망대'],
         items:['황푸강 야경 크루즈 만찬','예원·신천지 문화 탐방','상해 쇼핑 자유 탐방','전통 공연 관람'],
         value:'동서양 매력이 공존하는 상해에서 팀 감동과 결속의 특별한 경험' },
  },
  '장가계': {
    a: { tag:'역량강화형', desc:'세계 자연유산의 현장에서 생태·관광산업을 배우다',
         points:['장가계 국립공원 생태 산업 강의','장가계 관광개발 사례 세미나','지역 친환경 기업 방문'],
         items:['관광개발 성공 사례 현장 강의','에코 투어리즘 기업 방문','생태 보전·관광 균형 세미나','지역 주민 상생 모델 탐방'],
         value:'세계 최고 자연유산 관광 개발 모델에서 생태·지속가능 사업 인사이트' },
    b: { tag:'동기부여·화합형', desc:'아바타 촬영지, 압도적 자연 속 특별한 팀 경험',
         points:['천문산 케이블카·스카이워크','아바타 원경 감상 포인트','장가계 글라스브리지 체험'],
         items:['천문산 케이블카 세계 최장 라이드','아바타 촬영지 뷰포인트','글라스브리지 스릴 체험','십리화랑 절경 트레킹'],
         value:'세상 어디에도 없는 절경 속에서 팀이 함께 느끼는 경이로움과 결속' },
  },
  '청도': {
    a: { tag:'역량강화형', desc:'한중 경제협력의 거점, 청도 산업 현장 탐방',
         points:['하이얼 스마트팩토리 견학','청도 한국 기업 산업단지 방문','칭다오 맥주 생산 혁신 현장'],
         items:['하이얼 전략 혁신 센터 투어','한국 기업 중국 현지화 강의','청도개발구 산업 벤치마킹','한중 네트워킹 세션'],
         value:'중국 최대 한국 기업 투자 거점에서 글로벌 제조·현지화 전략 습득' },
    b: { tag:'동기부여·화합형', desc:'맥주와 해산물의 도시, 청도에서 즐기는 팀 시간',
         points:['칭다오 맥주 박물관 투어·시음','잔교 해변 석양 감상','해산물 특별 만찬'],
         items:['칭다오 맥주 박물관 VIP 투어','잔교 해변·팔대관 탐방','해산물 시장 투어·팀 만찬','청도 구시가지 독일 문화 거리'],
         value:'이색 한중 문화가 어우러진 청도에서 팀 친밀감 강화와 재충전' },
  },
  '연태': {
    a: { tag:'역량강화형', desc:'산동반도 포도·와인 산업과 한중 무역 현장 학습',
         points:['연태 장성 포도주 생산 현장','연태 수출 물류 클러스터','한중 무역 경영 세미나'],
         items:['중국 3대 와인 생산지 현장 강의','연태 항만 물류 센터 견학','한중 무역 성공 기업 방문','포도 수확·와인 양조 체험'],
         value:'중국 최대 포도·와인 산업과 한중 무역 성공 사례 직접 학습' },
    b: { tag:'동기부여·화합형', desc:'황해 해변과 와인의 도시, 연태 힐링 연수',
         points:['연태 황금 해변 리조트 체험','장성 와이너리 투어·시음','신선한 해산물 팀 만찬'],
         items:['황금 해변 자유 수영·스포츠','와이너리 프라이빗 투어·시음','해산물 뷔페 팀 만찬','연태 시내 야시장 탐방'],
         value:'아름다운 해변과 와인이 있는 연태에서 팀 힐링과 와인 문화 체험' },
  },

  /* ── 몽골·대만 ── */
  '몽골': {
    a: { tag:'역량강화형', desc:'자원 대국 몽골 신흥 시장 탐구',
         points:['나자르바예프급 대학 방문·강의','울란바토르 한국 기업 진출 사례','몽골 자원·에너지 산업 세미나'],
         items:['몽골 광물 자원 개발 현장 강의','한국 기업 몽골 진출 성공 사례','울란바토르 신도시 개발 현장','에너지 전환 프로젝트 탐방'],
         value:'광물·에너지·농축산 분야 신흥 시장 몽골의 사업 가능성 직접 탐색' },
    b: { tag:'동기부여·화합형', desc:'드넓은 초원과 별밤, 유목민의 삶 속 팀 경험',
         points:['게르 캠프 1박 유목 체험','승마·양 몰기 전통 체험','테를지 국립공원 별밤 캠프파이어'],
         items:['테를지 국립공원 게르 1박','승마·양 몰기·활쏘기 체험','전통 허르헉 양 요리 만찬','광활한 초원 캠프파이어'],
         value:'일상을 완전히 벗어난 몽골 초원에서 팀 결속·힐링의 잊지 못할 경험' },
  },
  '대만': {
    a: { tag:'역량강화형', desc:'아시아 반도체·IT 혁신의 중심, 대만 산업 탐방',
         points:['TSMC 반도체 파크 방문','국립대만대학 방문·교류','대만 IT 스타트업 생태계 투어'],
         items:['TSMC 뮤지엄·반도체 생태계 강의','공업기술연구원(ITRI) 방문','대만 스타트업 허브 투어','신주 과학단지 현장 견학'],
         value:'글로벌 반도체·IT 공급망의 핵심 대만에서 첨단 산업 트렌드 체감' },
    b: { tag:'동기부여·화합형', desc:'야시장·자연·미식, 대만 매력 모두를 팀과 함께',
         points:['스펀 천등 날리기 팀 이벤트','지우펀 레트로 야경 투어','샤오롱바오·망고빙수 미식 투어'],
         items:['스펀 천등 날리기 팀 소원 이벤트','지우펀 야경 골목 탐방','사대·라오허제 야시장 투어','타이베이101 전망대 야경'],
         value:'천등·야시장·레트로 도시 탐방으로 팀 모두가 행복해지는 특별한 하루하루' },
  },
  '가오슝': {
    a: { tag:'역량강화형', desc:'대만 남부 항구도시 가오슝 산업·물류 현장 학습',
         points:['가오슝 항만 물류 센터 견학','대만 중공업 클러스터 현장','국립중산대학 방문'],
         items:['아시아 신항 물류 허브 투어','대만 중공업 클러스터 현장 방문','중산대학 캠퍼스 교류','한국 기업 가오슝 법인 방문'],
         value:'대만 최대 항구 물류·중공업 현장에서 글로벌 공급망 운영 인사이트' },
    b: { tag:'동기부여·화합형', desc:'항구 도시의 야경과 열대 과일이 넘치는 활기찬 연수',
         points:['보얼 예술특구 탐방','애하 야경 크루즈·팀 만찬','야시장 열대 과일 투어'],
         items:['보얼 예술특구 창조 문화 탐방','애하 야경 유람선 만찬','류허 야시장 미식 투어','수신탕 해수욕장 자유 체험'],
         value:'활기찬 남대만 항구 문화 속에서 팀의 일체감과 즐거운 추억 만들기' },
  },

  /* ── 동남아시아 ── */
  '싱가포르': {
    a: { tag:'역량강화형', desc:'아시아 스마트시티·핀테크·물류 혁신의 최전선',
         points:['싱가포르 국립대(NUS) 방문·강의','구글·쇼피 아태 본사 견학','스마트시티 혁신 사례 투어'],
         items:['NUS·NTU 미래 기술 강의','핀테크 허브 방문·세미나','주롱 스마트 물류 허브 견학','원노스 혁신 클러스터 투어'],
         value:'아시아 최고 혁신 도시에서 스마트시티·핀테크·물류 글로벌 트렌드 체득' },
    b: { tag:'동기부여·화합형', desc:'가든스 바이 더 베이의 감동과 문화 다양성을 팀과 함께',
         points:['가든스 바이 더 베이 야간 조명쇼','마리나베이샌즈 루프탑 팀 만찬','유니버설스튜디오 싱가포르 체험'],
         items:['슈퍼트리 야간 조명쇼','MBS 스카이파크 팀 만찬','유니버설스튜디오 전일 자유 이용','차이나타운·리틀인디아 문화 투어'],
         value:'첨단과 자연이 공존하는 싱가포르에서 팀 감동과 다문화 체험' },
  },
  '하노이': {
    a: { tag:'역량강화형', desc:'빠르게 성장하는 베트남 제조업 허브 하노이 현장 학습',
         points:['삼성전자 베트남 법인 방문','베트남 국립경제대 방문·강의','하노이 제조업 클러스터 투어'],
         items:['삼성·LG 베트남 생산 법인 견학','한국 기업 베트남 현지화 강의','하노이 산업단지 현장 방문','베트남 스타트업 생태계 탐방'],
         value:'베트남 최대 제조업 허브에서 글로벌 공장 운영·현지화 전략 학습' },
    b: { tag:'동기부여·화합형', desc:'하롱베이의 절경과 베트남 문화를 팀과 함께 체험',
         points:['하롱베이 크루즈 1박 (카약·동굴 탐험)','하노이 올드쿼터 야식 투어','베트남 쿠킹 클래스 팀 체험'],
         items:['하롱베이 럭셔리 크루즈 1박 2일','카약·스노클링 해양 체험','호안끼엠 호수 야경 산책','쌀국수·분짜 현지 미식 투어'],
         value:'세계 8대 자연경관 하롱베이 크루즈로 팀 모두가 잊지 못할 감동 선사' },
  },
  '호치민': {
    a: { tag:'역량강화형', desc:'베트남 경제 심장 호치민 비즈니스·스타트업 현장',
         points:['호치민 한국 투자기업 벤치마킹','RMIT 베트남 방문·강의','사이공 첨단기술단지 투어'],
         items:['한국 기업 호치민 성공 법인 방문','베트남 스타트업 생태계 방문','사이공 테크파크 혁신 클러스터','베트남 유통·이커머스 현장 투어'],
         value:'베트남 최대 경제도시에서 동남아 시장 진출·스타트업 혁신 전략 학습' },
    b: { tag:'동기부여·화합형', desc:'메콩강의 생명력과 베트남 미식의 도시를 탐험',
         points:['메콩강 델타 투어 (보트·시장)','호치민 야경 루프탑 팀 만찬','베트남 전통 공연 관람'],
         items:['메콩강 델타 보트 투어·코코넛 농장','루프탑 레스토랑 팀 만찬','전쟁박물관·통일궁 역사 탐방','벤탄 시장 자유 쇼핑'],
         value:'메콩강의 생명력과 호치민 역동성에서 팀 에너지와 문화 감수성 충전' },
  },
  '다낭': {
    a: { tag:'역량강화형', desc:'다낭의 관광·리조트·물류 산업 성공 모델 탐구',
         points:['다낭 관광개발 사례 세미나','다낭 물류 항만 현장 견학','한국-베트남 경제 교류 강의'],
         items:['다낭 경제구역 관광 개발 성공 사례','다낭 신항 물류 현장 방문','한국 기업 중부 베트남 투자 사례','다낭시 스마트시티 계획 견학'],
         value:'관광·물류·IT 3박자를 갖춘 다낭의 도시 성장 모델에서 지역 발전 전략 학습' },
    b: { tag:'동기부여·화합형', desc:'미케 비치의 황금 해변과 바나힐 구름 위 놀이동산',
         points:['바나힐 케이블카·골든브리지 체험','미케 비치 리조트 팀 스포츠','호이안 야시장·랜턴 축제 탐방'],
         items:['바나힐 테마파크 전일 체험','미케 비치 선셋 팀 바베큐','호이안 올드타운 유네스코 야경 투어','나무 배 타기·랜턴 소원 체험'],
         value:'황금 해변과 구름 위 테마파크에서 팀 전원이 동심으로 돌아가는 특별한 연수' },
  },
  '나트랑': {
    a: { tag:'역량강화형', desc:'해양 리조트 산업 성공 도시 나트랑 현장 학습',
         points:['나트랑 관광 MICE 산업 세미나','VinGroup 복합 리조트 운영 견학','한국 기업 베트남 투자 강의'],
         items:['나트랑 관광 개발 현장 강의','VinGroup 리조트 운영 견학','한국 기업 투자 성공 사례 세미나','코코넛 제품 생산 현장 방문'],
         value:'동남아 최대 해양 리조트 도시에서 관광 산업 운영 노하우와 투자 기회 탐색' },
    b: { tag:'동기부여·화합형', desc:'에메랄드 바다에서 즐기는 팀 리조트 휴식',
         points:['호핑투어 스노클링·해양 스포츠','빈펄 리조트 워터파크 전일 체험','씨푸드 시장 투어·해산물 만찬'],
         items:['호핑투어 4개 섬 스노클링','빈펄 케이블카·워터파크 자유 이용','나트랑 나이트마켓 해산물 투어','해변 선셋 팀 요가·명상'],
         value:'에메랄드빛 바다와 리조트 속에서 몸과 마음을 완벽하게 충전하는 팀 시간' },
  },
  '푸꾸옥': {
    a: { tag:'역량강화형', desc:'베트남 최대 섬 개발 프로젝트와 관광 미래 탐구',
         points:['빈그룹 섬 개발 프로젝트 강의','푸꾸옥 관광청 현장 방문','에코 리조트 운영 사례'],
         items:['빈그룹 섬 개발 성공 사례 강의','에코 투어리즘 운영 현장 방문','수산업·후추 농업 현장 투어','섬 지속 가능 개발 세미나'],
         value:'10년 만에 세계적 리조트 섬으로 탈바꿈한 푸꾸옥 개발 모델 직접 학습' },
    b: { tag:'동기부여·화합형', desc:'아직 손때 묻지 않은 에메랄드 섬에서의 완벽한 휴식',
         points:['그랜드 월드 야간 축제 체험','사파리 월드 방문','해변 석양 팀 BBQ 만찬'],
         items:['푸꾸옥 사파리 동물원 자유 이용','그랜드 월드 야간 체험','케이블카·해변 자유 수영','신선한 해산물 시장 투어'],
         value:'베트남 최고의 섬 리조트에서 팀 전원이 꿈꾸는 완벽한 재충전과 힐링' },
  },
  '마닐라': {
    a: { tag:'역량강화형', desc:'동남아 BPO·IT서비스 강국 필리핀 마닐라 현장 탐방',
         points:['아얄라 경제구역 BPO 기업 방문','아테네오·드라살대학 방문·강의','필리핀 IT 아웃소싱 산업 세미나'],
         items:['아얄라·BGC 글로벌 BPO 기업 견학','필리핀 IT 산업 성장 강의','PEZA 특별경제구역 현장 방문','한국 기업 마닐라 법인 방문'],
         value:'영어권 IT 서비스·BPO 글로벌 허브 마닐라에서 디지털 산업 전략 탐구' },
    b: { tag:'동기부여·화합형', desc:'이니트라무로스 역사와 남국의 활기가 공존하는 마닐라',
         points:['인트라무로스 역사지구 투어','마닐라 베이 선셋 팀 만찬','BGC 아트 디스트릭트 탐방'],
         items:['인트라무로스 성벽 역사 투어','마닐라 베이 선셋 크루즈 만찬','BGC 현대 예술 지구 탐방','필리핀 전통 공연 및 민속 체험'],
         value:'역사와 현대가 공존하는 마닐라에서 팀 화합과 필리핀 문화 감수성 넓히기' },
  },
  '세부': {
    a: { tag:'역량강화형', desc:'필리핀 제2도시 세부의 관광·교육·물류 산업 현장',
         points:['세부 IT파크 BPO 기업 방문','세부대학 방문·영어 집중 강의','세부 항만 물류 현장 견학'],
         items:['세부 IT파크 글로벌 기업 탐방','세부대 영어 몰입 강의','세부 항만 국제물류 현장 방문','필리핀 중소기업 성장 사례 강의'],
         value:'필리핀 비즈니스·교육 허브 세부에서 영어 역량 강화와 산업 현장 체험' },
    b: { tag:'동기부여·화합형', desc:'세계 최고 다이빙·해양 리조트에서 팀 힐링',
         points:['막탄 섬 스쿠버다이빙·스노클링','오스메냐 서클 역사 투어','세부 해산물 시장 팀 바베큐'],
         items:['막탄 섬 아일랜드 호핑 투어','스쿠버다이빙·스노클링 팀 체험','마젤란 십자가 역사지구 탐방','발리 마사지·스파 팀 힐링'],
         value:'맑고 투명한 열대 바다에서 스쿠버다이빙·힐링으로 팀 에너지 완전 재충전' },
  },
  '보홀': {
    a: { tag:'역량강화형', desc:'에코 투어리즘의 교과서, 보홀 생태 관광 모델 학습',
         points:['보홀 에코 투어리즘 운영 사례 강의','초콜릿 힐 생태 보전 현장','지역 공정무역 기업 탐방'],
         items:['에코 투어리즘 성공 사례 강의','초콜릿 힐 생태 보전 현장 방문','마발리캇 해양 보호구역 투어','지역 커뮤니티 관광 개발 모델'],
         value:'세계가 주목하는 지속가능 생태 관광 성공 모델 보홀에서 에코 사업 인사이트' },
    b: { tag:'동기부여·화합형', desc:'초콜릿 힐과 안경원숭이, 동화 같은 자연 속으로',
         points:['초콜릿 힐 전망대 일출 감상','안경원숭이 보호구역 체험','알로나 비치 스노클링·선셋'],
         items:['초콜릿 힐 일출 트레킹','안경원숭이 새벽 먹이 체험','알로나 비치 해양 스포츠','롭복강 크루즈 자연 탐방'],
         value:'지구 어디에도 없는 초콜릿 힐과 안경원숭이 등 희귀한 자연 체험' },
  },
  '코타키나발루': {
    a: { tag:'역량강화형', desc:'보르네오 열대우림과 해양 자원 개발 현장 탐구',
         points:['말레이시아 팜오일 산업 강의','사바대학 방문·교류','보르네오 에코 산업 현장 투어'],
         items:['말레이시아 팜오일 생산 현장','환경 지속가능 개발 전문 강의','사바대학 연구소 방문','코타키나발루 항만 현장 견학'],
         value:'열대우림 자원 개발과 지속가능한 성장 전략을 보르네오에서 직접 탐구' },
    b: { tag:'동기부여·화합형', desc:'세계 3대 석양의 도시, 보르네오 자연 속 특별한 팀',
         points:['섬 호핑·스노클링 투어 (풀라우 사피)','키나발루 국립공원 트레킹','세계 3대 석양 가야 거리 팀 만찬'],
         items:['풀라우 사피 스노클링·다이빙 투어','키나발루 국립공원 트레킹','세계 3대 석양 워터프런트 만찬','오랑우탄 보호구역 방문'],
         value:'세계 최고 석양과 열대 바다, 오랑우탄 등 보르네오 자연 속 특별한 팀 추억' },
  },
  '캄보디아': {
    a: { tag:'역량강화형', desc:'앙코르 문명과 캄보디아 경제 발전의 현장',
         points:['캄보디아 경제특구(SEZ) 산업 견학','프놈펜 한국 기업 진출 사례 강의','캄보디아 국립대학 방문'],
         items:['캄보디아 경제특구 제조업 현장','한국 기업 의류·제조 현지화 사례','프놈펜 투자 기회 세미나','캄보디아 관광 성장 강의'],
         value:'급성장하는 캄보디아 시장에서 의류·제조·관광 분야 신흥시장 기회 탐구' },
    b: { tag:'동기부여·화합형', desc:'인류 최대의 유산, 앙코르와트에서 느끼는 경이로움',
         points:['앙코르와트 일출 감상 (특별 입장)','바욘 사원·타프롬 사원 탐방','톤레삽 호수 선셋 크루즈'],
         items:['앙코르와트 새벽 일출 특별 관람','앙코르톰·바욘 사원 역사 투어','타프롬 영화촬영지 탐방','톤레삽 호수 황금빛 선셋 크루즈'],
         value:'인류 최대 유산 앙코르와트 일출 앞에서 팀 전원이 느끼는 경이와 감동' },
  },
  '방콕': {
    a: { tag:'역량강화형', desc:'동남아 유통·물류·스타트업 혁신 허브 방콕',
         points:['태국 BOI 투자청 방문·강의','줄라롱콘대학 방문·교류','방콕 스타트업 생태계 탐방'],
         items:['태국 투자청(BOI) 진출 지원 세미나','방콕 스타트업·핀테크 허브 투어','한국 기업 태국 법인 성공 사례','태국 유통·현지화 전략 강의'],
         value:'동남아 관문 방콕에서 투자 환경·스타트업·유통 전략 인사이트 한 번에 확보' },
    b: { tag:'동기부여·화합형', desc:'방콕의 황금 사원과 수상 야시장, 감동의 연속',
         points:['왓포·왓아룬 사원 일몰 감상','차오프라야 강 야간 크루즈 만찬','아시아티크 야시장 자유 탐방'],
         items:['에메랄드 사원·왕궁 투어','차오프라야 디너 크루즈','아시아티크 리버프론트 야시장','태국 마사지·스파 팀 힐링'],
         value:'황금 사원과 강변 야경, 마사지까지 방콕의 감각을 팀이 함께 즐기는 연수' },
  },
  '푸켓': {
    a: { tag:'역량강화형', desc:'태국 최대 섬 리조트 산업 운영 모델 탐구',
         points:['푸켓 관광청 방문·산업 현황 강의','럭셔리 리조트 운영 벤치마킹','푸켓 국제학교·교육 현장 방문'],
         items:['태국 관광 산업 성장 전략 강의','5성급 리조트 운영 노하우 현장 투어','MICE 시설·컨벤션센터 견학','태국 부동산·리조트 투자 세미나'],
         value:'세계적 관광 도시 푸켓의 리조트·MICE 산업 성공 모델을 현장에서 직접 학습' },
    b: { tag:'동기부여·화합형', desc:'에메랄드 안다만해 바다에서 팀 자유 리조트 연수',
         points:['피피 섬 스노클링·보트 투어','팡아만 카약·절벽 투어','빠통 비치 선셋 팀 만찬'],
         items:['피피 섬 아일랜드 호핑 투어','팡아만 카약·에메랄드 동굴 탐험','빠통 비치 자유 수영·선셋 만찬','태국 요리 쿠킹 클래스'],
         value:'안다만해 청록빛 바다와 섬 투어로 팀 전원이 꿈꾸는 완벽한 리조트 연수' },
  },
  '치앙마이': {
    a: { tag:'역량강화형', desc:'태국 북부 창업·수공예·농업 혁신의 도시 치앙마이',
         points:['치앙마이대학 방문·강의','디지털노마드 허브 코워킹 방문','공정무역 커피·수공예 사회적 기업 방문'],
         items:['치앙마이대 농업·교육 혁신 강의','디지털 노마드 코워킹 공간 방문','공정무역 커피·수공예 기업 현장','치앙마이 스타트업 생태계 탐방'],
         value:'소규모 창업·디지털노마드·공정무역의 현장 치앙마이에서 신사업 모델 인사이트' },
    b: { tag:'동기부여·화합형', desc:'천 개의 사원과 코끼리, 치앙마이 자연과 문화 속으로',
         points:['코끼리 보호구역 체험 (목욕·먹이)','도이수텝 사원 일몰 감상','나이트 바자르 야시장 자유 탐방'],
         items:['코끼리 보호구역 반나절 체험','도이수텝 사원 트레킹·일몰','태국 쿠킹 클래스 (북부 요리)','나이트 바자르·선데이마켓 탐방'],
         value:'코끼리와 함께하는 특별한 체험과 북부 태국 문화 속에서 팀 힐링과 결속' },
  },
  '발리': {
    a: { tag:'역량강화형', desc:'발리 관광 산업의 기적과 지속가능 에코 관광 현장',
         points:['발리 관광청 방문·산업 전략 강의','우붓 유기농·에코 농업 현장','발리 문화 관광 융합 사례'],
         items:['발리 관광 개발 성공 사례 강의','우붓 유기농 농장·허브 농업 방문','에코 리조트 지속가능 운영 투어','문화 관광 융합 사례 세미나'],
         value:'세계 최고 관광지의 문화·에코 융합 모델에서 지속가능 관광 산업 전략 학습' },
    b: { tag:'동기부여·화합형', desc:'신들의 섬 발리에서 팀의 몸과 마음을 완전히 재충전',
         points:['해돋이 요가·명상 팀 체험','꾸따·스미냑 해변 서핑 레슨','우붓 논밭 사이클링·전통 공연'],
         items:['발리 케착 댄스 공연 관람','울루와투 석양 클리프 감상','스미냑 해변 서핑 팀 레슨','발리 요리 클래스·라이스테라스 사이클링'],
         value:'신들의 섬 발리 자연과 문화 속에서 팀 모두가 내면 깊은 곳에서 충전되는 연수' },
  },
  '라오스': {
    a: { tag:'역량강화형', desc:'인도차이나 물류 허브 라오스 경제 개발 현장 탐구',
         points:['비엔티안 경제특구(SSEZ) 산업 방문','라오스 국립대학 방문·교류','메콩강 수력발전 인프라 견학'],
         items:['사완나켓 경제특구 제조업 견학','라오스 관광 개발 현황 강의','메콩 수력발전 프로젝트 현장','라오스-중국 철도 개발 현장 방문'],
         value:'인도차이나 물류 허브로 떠오르는 라오스에서 신흥 시장 투자 가능성 직접 탐구' },
    b: { tag:'동기부여·화합형', desc:'메콩강의 평화로운 흐름 속 라오스 힐링 연수',
         points:['루앙프라방 새벽 탁발 체험','꽝시 폭포 트레킹·수영','메콩강 선셋 크루즈 팀 만찬'],
         items:['루앙프라방 탁발 새벽 의식 참관','꽝시 에메랄드 폭포 수영 체험','메콩강 선셋 슬로우 보트 크루즈','왓시엥통 사원 황금 일몰 감상'],
         value:'세상에서 가장 느린 나라 라오스의 평화로운 메콩강 물결 속에서 팀 마음 깊은 힐링' },
  },

  /* ── 오세아니아·태평양 ── */
  '괌': {
    a: { tag:'역량강화형', desc:'미국령 괌의 군사·관광·무역 인프라 현장 탐구',
         points:['괌 관광청 MICE 산업 현황 강의','괌 대학(UOG) 방문·교류','괌 자유무역지역 현장 견학'],
         items:['괌 관광 MICE 산업 현장 강의','UOG 캠퍼스 교류 프로그램','자유무역지역 비즈니스 투어','미국령 행정 시스템 현장 방문'],
         value:'미국령 태평양 거점 괌에서 MICE·자유무역 인프라와 글로벌 비즈니스 체험' },
    b: { tag:'동기부여·화합형', desc:'열대의 태양 아래 즐기는 괌의 해양 어드벤처',
         points:['투몬 베이 스카이다이빙·패러세일링','건비치 스쿠버다이빙·스노클링','괌 선셋 크루즈 팀 만찬'],
         items:['스카이다이빙·패러세일링 스릴 체험','스쿠버다이빙 PADI 입문 체험','괌 석양 크루즈 팀 저녁','차모로 야시장 자유 탐방'],
         value:'태평양 파란 바다에서 스카이다이빙·다이빙으로 스릴 넘치는 어드벤처 팀 결속' },
  },
  '사이판': {
    a: { tag:'역량강화형', desc:'미국령 북마리아나 사이판, 태평양 역사·관광 현장',
         points:['사이판 관광청 방문·산업 현황 강의','NMC 북마리아나대학 방문·교류','태평양 전쟁 역사 유적 현장 학습'],
         items:['사이판 관광 산업 현황 강의','역사 유적(자살절벽) 방문','NMC 대학 캠퍼스 교류','태평양 전쟁 역사 투어'],
         value:'태평양 전쟁 역사와 현대 관광 산업이 공존하는 사이판에서 역사·산업 이해 확장' },
    b: { tag:'동기부여·화합형', desc:'마나가하 섬의 투명한 바다에서 꿈 같은 팀 연수',
         points:['마나가하 섬 스노클링·다이빙','아메리칸 메모리얼 파크 팀 피크닉','비치 바베큐 선셋 팀 파티'],
         items:['마나가하 섬 1일 해양 스포츠','제트스키·바나나보트 팀 체험','비치 선셋 팀 바베큐 파티','수베틱 비치 자유 수영·낚시'],
         value:'세상에서 가장 투명한 바다 마나가하에서 팀 전원이 꿈꾸는 열대 리조트 연수' },
  },
  '시드니': {
    a: { tag:'역량강화형', desc:'호주 경제 수도 시드니에서 선진 산업 현장 체험',
         points:['UNSW·시드니대학 방문·강의','시드니 금융지구 기업 탐방','호주 농업·자원 수출 산업 세미나'],
         items:['UNSW·시드니대 연구소·캠퍼스 투어','마켓시티 금융지구 글로벌 기업 방문','호주 농업·광업·수출 산업 강의','시드니 스타트업 생태계 탐방'],
         value:'선진 농업·자원·금융의 나라 호주에서 지속가능 산업 모델과 글로벌 안목 확장' },
    b: { tag:'동기부여·화합형', desc:'오페라하우스·하버브리지, 시드니의 아이콘을 팀과 함께',
         points:['시드니 하버 크루즈 팀 만찬','블루마운틴 자연 트레킹','본다이 비치 서핑·해변 피크닉'],
         items:['시드니 하버 선셋 크루즈 만찬','블루마운틴 에코 트레킹','본다이 비치 자유 수영·피크닉','록스·서큘러키 도심 자유 탐방'],
         value:'오페라하우스 야경과 블루마운틴 자연에서 팀이 함께 만드는 시드니 특별한 추억' },
  },
  '멜버른': {
    a: { tag:'역량강화형', desc:'호주 교육·스포츠·문화 혁신 도시 멜버른 탐방',
         points:['멜버른대학·모나시대 방문·강의','멜버른 스타트업 생태계 탐방','호주 의료·바이오 산업 현장 견학'],
         items:['멜버른대학 연구소 캠퍼스 방문','핀테크·바이오 스타트업 투어','호주 의료 기기 산업 현장','멜버른 스마트시티 현황 강의'],
         value:'호주 최고 교육·연구 도시에서 의료·바이오·핀테크 미래 산업 트렌드 체득' },
    b: { tag:'동기부여·화합형', desc:'커피와 트램, 스포츠의 도시 멜버른을 팀과 함께',
         points:['야라강 크루즈 팀 만찬','세계 최고 카페 문화 체험 투어','그레이트오션로드 자연 드라이브'],
         items:['야라강 선셋 디너 크루즈','멜버른 CBD 커피 문화 탐방','그레이트오션로드 투어','세인트킬다 비치 자유 탐방'],
         value:'커피·예술·스포츠가 살아있는 멜버른에서 팀 감성과 라이프스타일 충전' },
  },
  '오클랜드': {
    a: { tag:'역량강화형', desc:'뉴질랜드 혁신 농업·청정에너지 선진 모델 탐구',
         points:['오클랜드대학 방문·강의','뉴질랜드 와인·낙농 생산 현장 견학','청정에너지 인프라 현장 투어'],
         items:['오클랜드대 농업·생명과학 연구소','뉴질랜드 낙농·와인 수출 산업 현장','지열 에너지 발전소 현장 방문','마오리 문화 산업화 사례'],
         value:'청정 자연과 혁신 농업이 공존하는 뉴질랜드에서 지속가능 산업 모델 선진 학습' },
    b: { tag:'동기부여·화합형', desc:'반지의 제왕 촬영지에서 뉴질랜드 대자연을 팀과 체험',
         points:['스카이점프·번지점프 스릴 체험','와이토모 반딧불이 동굴 탐방','마오리 문화 체험·하카 댄스'],
         items:['스카이타워 스카이점프·전망대','와이토모 형광 동굴 보트 투어','마오리 문화 공연·항기 저녁','뉴질랜드 대자연 트레킹'],
         value:'남반구 뉴질랜드 대자연에서 팀 모두가 경험하는 짜릿한 어드벤처' },
  },
  '호주': {
    a: { tag:'역량강화형', desc:'호주 브리즈번·골드코스트 산업·교육 현장 방문',
         points:['퀸즐랜드대학(UQ) 방문·강의','브리즈번 스마트시티 현장 탐방','호주 농업·자원 수출 산업 강의'],
         items:['UQ 캠퍼스·연구소 방문','브리즈번 스마트시티 인프라 견학','호주 자원·광업 현장 방문','퀸즐랜드 농업 혁신 사례 강의'],
         value:'퀸즐랜드 교육·자원·스마트시티 현장에서 호주 선진 산업 모델 직접 체험' },
    b: { tag:'동기부여·화합형', desc:'골드코스트 황금 해변과 서퍼스 파라다이스에서의 팀 연수',
         points:['서퍼스 파라다이스 해변 서핑·스카이다이빙','무비월드·시월드 테마파크 체험','그레이트 배리어 리프 스노클링'],
         items:['골드코스트 서핑 레슨 팀 체험','무비월드 테마파크 자유 이용','그레이트 배리어 리프 다이빙 투어','서퍼스 파라다이스 야시장 탐방'],
         value:'황금 해변과 세계 최고 산호초에서 팀 모두가 즐기는 완벽한 골드코스트 연수' },
  },

  /* ── 유럽 ── */
  '파리': {
    a: { tag:'역량강화형', desc:'파리 명문 그랑제콜·글로벌 기업 본사에서 글로벌 역량 강화',
         points:['HEC·인시아드 비즈니스스쿨 방문','에어버스·루이비통 본사 견학','OECD 본부 방문·국제 정책 강의'],
         items:['HEC·ESSEC 그랑제콜 캠퍼스 방문','유럽 최대 항공사 에어버스 투어','OECD 본부 국제 정책 강의','파리 스타트업 생태계 스테이션F 탐방'],
         value:'세계 최고 경영대학원과 글로벌 기업 현장에서 국제 감각과 리더십 역량 강화' },
    b: { tag:'동기부여·화합형', desc:'에펠탑의 빛, 와인과 예술의 도시 파리를 팀과 함께',
         points:['에펠탑 야경 팀 샴페인 만찬','루브르·오르세 미술관 전문 가이드 투어','베르사유 궁전 프라이빗 탐방'],
         items:['에펠탑 야간 조명 팀 만찬','루브르 박물관 도슨트 투어','베르사유 궁전·정원 산책','몽마르트르 언덕 아트 투어'],
         value:'세계 문화의 수도 파리에서 예술·미식·와인으로 팀 감성과 안목을 높이는 연수' },
  },
  '영국': {
    a: { tag:'역량강화형', desc:'옥스퍼드·케임브리지와 런던 금융지구에서 글로벌 엘리트 감각 체득',
         points:['옥스퍼드·케임브리지 대학 방문·강의','런던 시티 금융지구 투어','영국 의회·정부 기관 방문'],
         items:['옥스퍼드 크라이스트 처치 캠퍼스 방문','케임브리지 킹스칼리지 강의 세션','런던 시티 금융지구 워킹 투어','BBC 방송국 견학·미디어 세미나'],
         value:'세계 최고 대학과 금융 허브에서 글로벌 리더 감각과 전문성을 한 단계 도약' },
    b: { tag:'동기부여·화합형', desc:'해리포터부터 빅벤까지, 런던의 매력을 팀과 함께',
         points:['웨스트엔드 뮤지컬 공연 관람','해리포터 스튜디오 투어','애프터눈 티 팀 체험'],
         items:['웨스트엔드 뮤지컬 특별 관람','해리포터 워너브라더스 스튜디오','버킹엄 궁전·타워브리지 투어','노팅힐·코벤트가든 자유 탐방'],
         value:'해리포터·뮤지컬·애프터눈 티 등 런던 문화 아이콘 체험으로 팀 결속과 즐거움' },
  },
  '로마': {
    a: { tag:'역량강화형', desc:'로마 선진 문화유산 관리·관광 산업에서 배우는 인사이트',
         points:['라 사피엔자 대학 방문·강의','바티칸 문화재 보존 시스템 탐방','이탈리아 명품·패션 산업 세미나'],
         items:['라 사피엔자 대학 캠퍼스·강의','바티칸 박물관 문화재 관리 강의','이탈리아 명품 산업(구찌·페라가모) 탐방','로마 도시 재생 프로젝트 견학'],
         value:'인류 문명의 중심 로마에서 문화 자산 관리·명품 산업·역사 보존 전략 학습' },
    b: { tag:'동기부여·화합형', desc:'영원한 도시 로마, 콜로세움과 파스타로 채우는 팀 연수',
         points:['콜로세움·로마 포룸 전문 투어','트레비 분수·스페인 계단 자유 탐방','이탈리아 쿠킹 클래스·와인 페어링'],
         items:['콜로세움 프라이빗 투어','바티칸 박물관·시스티나 예배당','트레비 분수·스페인 계단 탐방','이탈리아 파스타·젤라토 쿠킹 클래스'],
         value:'영원의 도시 로마에서 역사와 미식을 팀이 함께 즐기는 특별한 유럽 연수' },
  },
  '독일': {
    a: { tag:'역량강화형', desc:'세계 제조업의 정점, 독일 인더스트리 4.0 현장 탐방',
         points:['BMW·아우디·지멘스 공장 견학','뮌헨공대(TUM)·하이델베르크대 방문','독일 프라운호퍼 연구소 탐방'],
         items:['BMW 생산 공장·BMW 월드 견학','지멘스 인더스트리 4.0 시범 공장','TUM·하이델베르크대 캠퍼스 방문','프라운호퍼 응용연구소 투어'],
         value:'인더스트리 4.0의 본고장 독일에서 스마트 제조·자동화 혁신 전략 직접 체감' },
    b: { tag:'동기부여·화합형', desc:'뮌헨 맥주 축제와 고성, 낭만 독일을 팀과 탐험',
         points:['옥토버페스트 (맥주 축제) 체험','노이슈반슈타인 성 탐방','라인강 크루즈·와인 마을'],
         items:['뮌헨 맥주 홀 팀 저녁','노이슈반슈타인 동화 성 탐방','바이에른 알프스 자연 하이킹','뢰텐부르크 중세 도시 투어'],
         value:'동화 같은 성과 맥주 축제, 알프스 자연이 있는 독일에서 팀 낭만과 결속 극대화' },
  },
  '네덜란드': {
    a: { tag:'역량강화형', desc:'스마트 물류·농업·반도체 강국 네덜란드 혁신 현장',
         points:['로테르담 항만 물류 센터 견학','델프트 공대·와게닝엔대 방문','필립스·ASML 혁신 캠퍼스 투어'],
         items:['로테르담 세계 최대 항만 물류 투어','ASML 반도체 장비 혁신 센터 방문','델프트 공대 혁신 연구소','암스테르담 핀테크 허브 탐방'],
         value:'세계 최고 항만·농업·반도체 장비 나라 네덜란드에서 혁신 산업 벤치마킹' },
    b: { tag:'동기부여·화합형', desc:'풍차·튤립·운하의 나라 네덜란드 낭만 탐방',
         points:['잔세스칸스 풍차 마을 탐방','킨더다이크 유네스코 풍차 견학','암스테르담 운하 크루즈 팀 만찬'],
         items:['잔세스칸스 풍차·치즈 농장 방문','암스테르담 운하 디너 크루즈','국립미술관 렘브란트 컬렉션 투어','튤립 공원·화훼 경매 투어'],
         value:'동화 속 풍차·튤립·운하의 나라에서 팀 모두가 동심으로 돌아가는 낭만 연수' },
  },
  '스페인': {
    a: { tag:'역량강화형', desc:'바르셀로나·마드리드에서 유럽 혁신과 디자인 산업 탐구',
         points:['IE비즈니스스쿨 방문','SEAT·산탄데르은행 본사 견학','스페인 스마트 관광 혁신 세미나'],
         items:['IE 비즈니스스쿨 유럽 경영 강의','SEAT 자동차 공장·혁신센터 견학','바르셀로나 22@ 스타트업 구역 탐방','스페인 태양광·신재생에너지 현장'],
         value:'유럽 스타트업·디자인·에너지 혁신의 중심 스페인에서 미래 산업 인사이트 확보' },
    b: { tag:'동기부여·화합형', desc:'가우디 건축과 플라멩코, 태양의 나라 스페인을 팀과 탐험',
         points:['사그라다 파밀리아 프라이빗 투어','플라멩코 공연·타파스 팀 만찬','바르셀로나 해변 팀 파티'],
         items:['사그라다 파밀리아·구엘 공원 투어','플라멩코 디너쇼·타파스 파티','바르셀로나 해변 자유 탐방','피카소 미술관·람블라스 거리'],
         value:'가우디 건축의 경이로움과 플라멩코 열정으로 팀 감성과 에너지를 한껏 충전' },
  },
  '동유럽': {
    a: { tag:'역량강화형', desc:'프라하·빈·부다페스트, 유럽 신흥 경제·IT 허브 탐방',
         points:['프라하 카를대학·체코공대 방문','빈 UN 국제기구 방문·강의','부다페스트 IT 스타트업 탐방'],
         items:['체코 IT·방위 산업 혁신 사례 강의','빈 UNIDO 국제산업개발기구 방문','부다페스트 스타트업 생태계 투어','동유럽 EU 가입 경제 성장 세미나'],
         value:'EU 가입 후 급성장한 동유럽 IT·산업 허브에서 신흥 시장 기회와 글로벌 인사이트' },
    b: { tag:'동기부여·화합형', desc:'중세와 현대가 공존하는 동유럽 3개국 문화 탐방',
         points:['프라하 구시가지 야경·음악 공연','부다페스트 온천 스파 체험','빈 오페라·왈츠 공연 관람'],
         items:['프라하 천문시계·구시가 광장 야경','부다페스트 세체니 온천 팀 체험','빈 쇤브룬 궁전·오페라 관람','다뉴브 강 크루즈 팀 만찬'],
         value:'동화 같은 중세 도시 3개국 탐방으로 팀 문화 감수성과 유럽 역사 안목 확장' },
  },
  '북유럽': {
    a: { tag:'역량강화형', desc:'세계 최고 복지·교육·스마트시티 선진국 북유럽 현장 학습',
         points:['스톡홀름 왕립공대(KTH) 방문·강의','덴마크 노보 노르디스크 방문','헬싱키 스마트시티 현장 탐방'],
         items:['KTH·알토대학 미래 기술 강의','노르딕 스타트업 생태계 탐방','덴마크 복지 행정 현장 방문','북유럽 그린에너지 혁신 현장'],
         value:'세계 최고 행복지수 북유럽에서 복지·교육·스마트시티·그린에너지 선진 모델 체득' },
    b: { tag:'동기부여·화합형', desc:'오로라와 피오르, 북유럽 대자연의 감동을 팀과 함께',
         points:['오로라 빌리지 오로라 관측 체험','피오르 크루즈 자연 탐방','바이킹 마을·전통 음식 체험'],
         items:['오로라 특별 관측 팀 캠프','피오르 크루즈 절경 감상','바이킹 마을 전통 생활 체험','북유럽 스파·사우나 팀 힐링'],
         value:'지구상 가장 아름다운 자연 오로라·피오르에서 팀 모두가 감동받는 생애 최고 연수' },
  },
  '서유럽': {
    a: { tag:'역량강화형', desc:'영·프·독·벨·네 복수 국가에서 유럽 산업 전방위 탐방',
         points:['EU 본부·유럽의회 방문 (브뤼셀)','다국적 글로벌 기업 본사 투어','복수 국가 대학 강의 및 교류'],
         items:['EU 본부·유럽의회 방문·강의','영국·프랑스·독일 주요 기업 탐방','명문 대학 복수 방문 강의','유럽 산업 트렌드 통합 세미나'],
         value:'복수 유럽 국가 현장 방문으로 글로벌 비즈니스 감각과 다국적 협력 역량 강화' },
    b: { tag:'동기부여·화합형', desc:'영국·프랑스·독일·스위스, 유럽의 정수를 팀과 탐험',
         points:['에펠탑·빅벤·브란덴부르크 랜드마크 투어','스위스 알프스 자연·스키 체험','유럽 명품 쇼핑·미식 탐방'],
         items:['파리 에펠탑·런던 웨스트엔드 투어','스위스 알프스 융프라우 탐방','독일 크리스마스 마켓·맥주 체험','다양한 유럽 미식·쇼핑 자유 탐방'],
         value:'유럽 여러 나라를 한 번에 즐기며 팀이 함께 만드는 생애 최고의 유럽 여행' },
  },

  /* ── 북미 ── */
  '로스앤젤레스': {
    a: { tag:'역량강화형', desc:'실리콘비치·할리우드에서 미국 엔터·IT 혁신 현장 탐방',
         points:['구글 LA·페이스북 오피스 방문','UCLA·USC 캠퍼스 방문·강의','실리콘비치 스타트업 투어'],
         items:['구글 실리콘비치 오피스 견학','UCLA 앤더슨 스쿨 비즈니스 강의','LA 스타트업 생태계 탐방','한인타운 비즈니스 성공 사례 강의'],
         value:'미국 IT·엔터테인먼트 혁신의 중심 LA에서 글로벌 비즈니스 트렌드 직접 체감' },
    b: { tag:'동기부여·화합형', desc:'할리우드·디즈니랜드·산타모니카, LA 엔터테인먼트의 정수',
         points:['유니버설스튜디오 할리우드 전일 체험','산타모니카 선셋 비치 팀 파티','비벌리힐스·로데오 드라이브 탐방'],
         items:['유니버설스튜디오 VIP 투어·백스테이지','산타모니카 피어 자유 탐방','그리피스 전망대 LA 야경 감상','베니스 비치·아보트 키니 아트 투어'],
         value:'할리우드 스타들의 도시에서 팀 모두가 스타가 되는 특별한 LA 엔터테인먼트 연수' },
  },
  '샌프란시스코': {
    a: { tag:'역량강화형', desc:'실리콘밸리·스탠퍼드에서 세계 혁신 생태계를 직접 체험',
         points:['구글·애플·메타 캠퍼스 견학','스탠퍼드대학 방문·강의','Y Combinator VC 생태계 투어'],
         items:['구글플렉스·애플 파크 캠퍼스 견학','스탠퍼드 d.school 디자인씽킹 강의','VC 투자사 피치 세션 참관','SF 스타트업 허브 탐방'],
         value:'세계 혁신의 심장 실리콘밸리에서 IT 트렌드·VC 생태계·스타트업 정신 직접 흡수' },
    b: { tag:'동기부여·화합형', desc:'금문교·알카트라즈·와이너리, SF의 낭만을 팀과 함께',
         points:['금문교 석양 감상·자전거 투어','나파밸리 와이너리 와인 시음 투어','피어39 크랩 요리 팀 만찬'],
         items:['금문교 자전거·도보 투어','나파밸리 와이너리 프라이빗 투어','알카트라즈 투어','피어39·피셔맨즈워프 자유 탐방'],
         value:'금문교의 석양과 나파밸리 와인으로 팀 감성을 충전하는 낭만적인 SF 연수' },
  },
  '뉴욕': {
    a: { tag:'역량강화형', desc:'월스트리트·컬럼비아에서 세계 금융·미디어·혁신을 체험',
         points:['월스트리트 금융지구 투어·NYSE 방문','컬럼비아대·NYU 방문·강의','UN 본부 방문·국제 세미나'],
         items:['뉴욕 증권거래소(NYSE) 방문','컬럼비아 비즈니스스쿨 강의','UN 본부 가이드 투어·강의','실리콘 알리 스타트업 허브 탐방'],
         value:'세계 금융·미디어·외교의 중심 뉴욕에서 글로벌 비즈니스 리더 역량 한 단계 도약' },
    b: { tag:'동기부여·화합형', desc:'브로드웨이·자유의 여신상·첼시마켓, 뉴욕을 팀과 함께 정복',
         points:['브로드웨이 뮤지컬 최고 특석 관람','자유의 여신상·엘리스섬 투어','루프탑 바 뉴욕 야경 팀 만찬'],
         items:['브로드웨이 최고 뮤지컬 VIP 관람','자유의 여신상·맨해튼 크루즈','하이라인·첼시마켓 탐방','타임스스퀘어·센트럴파크 자유 탐방'],
         value:'세계의 무대 뉴욕에서 브로드웨이 감동과 야경으로 팀 감성을 최고조로 끌어올리는 연수' },
  },
  '워싱턴': {
    a: { tag:'역량강화형', desc:'세계 정치·외교의 심장, 워싱턴 D.C. 공공기관 탐방',
         points:['스미스소니언 박물관 전문 투어','조지타운·아메리칸대학 방문·강의','국무부·의회도서관 방문'],
         items:['국무부·의회도서관 공식 방문','스미스소니언 항공우주박물관 투어','조지타운대 정책 강의','세계은행·IMF 방문 세미나'],
         value:'세계 최강 미국 행정·외교·연구 기관 현장 탐방으로 공공 정책과 글로벌 리더십 체득' },
    b: { tag:'동기부여·화합형', desc:'벚꽃·기념관·스미스소니언으로 채우는 워싱턴 문화 탐방',
         points:['링컨·한국전 기념비 역사 투어','스미스소니언 박물관 자유 탐방','워싱턴 몰 벚꽃·야경 산책'],
         items:['링컨 기념관·워싱턴 모뉴먼트 야경','스미스소니언 12개 박물관 자유 탐방','조지타운 운하·레스토랑 팀 만찬','체서피크 운하 산책'],
         value:'역사와 예술이 살아있는 미국 수도 워싱턴에서 팀 교양과 역사 감각 키우기' },
  },
  '하와이': {
    a: { tag:'역량강화형', desc:'하와이 청정에너지·관광 산업 혁신 모델 현장 학습',
         points:['하와이대학(UH) 방문·강의','하와이 청정에너지 전환 현장 견학','HTDC 하이테크 클러스터 탐방'],
         items:['하와이대 해양연구소·환경과학 강의','하와이 100% 신재생에너지 전환 현장','하이테크 기업·국방 연구 클러스터 방문','하와이 관광 MICE 산업 현황 강의'],
         value:'세계 최초 100% 청정에너지 전환 주 하와이에서 지속가능 에너지·관광 모델 탐구' },
    b: { tag:'동기부여·화합형', desc:'알로하 스피릿으로 가득한 하와이에서 완벽한 팀 리워드',
         points:['와이키키 선셋 루아우 하와이안 만찬','할레아칼라 일출·마우이 자연 투어','스노클링·서핑·카약 해양 스포츠'],
         items:['루아우 파티 하와이안 공연·만찬','할레아칼라 분화구 일출 감상','와이키키 서핑·스탠드업 패들','폴리네시안 문화센터 공연 관람'],
         value:'알로하 정신 가득한 하와이에서 팀 모두가 꿈꾸는 최고의 리워드 연수 실현' },
  },
  '밴쿠버': {
    a: { tag:'역량강화형', desc:'캐나다 친환경·IT·영상산업 혁신 도시 밴쿠버 탐방',
         points:['UBC·SFU 대학 방문·강의','밴쿠버 VFX·게임 산업 클러스터 견학','캐나다 친환경 도시 개발 현장'],
         items:['UBC 캠퍼스·연구소 방문','EA·유비소프트 밴쿠버 스튜디오 견학','브리티시컬럼비아 친환경 산업 투어','밴쿠버 스타트업 생태계 탐방'],
         value:'영상·게임·친환경 산업의 글로벌 허브 밴쿠버에서 첨단 콘텐츠·지속가능 산업 체험' },
    b: { tag:'동기부여·화합형', desc:'로키산맥과 태평양이 만나는 밴쿠버 대자연 탐방',
         points:['캐필라노 현수교·그라우스마운틴 자연 체험','휘슬러 스키 리조트 전일 체험','밴쿠버 항구 크루즈 팀 만찬'],
         items:['캐필라노 현수교·래프팅 어드벤처','휘슬러 스키·스노보드 전일 자유 이용','밴쿠버 항구 선셋 크루즈 만찬','스탠리 파크 자전거·피크닉'],
         value:'로키 설산과 태평양 바다가 만나는 밴쿠버 대자연에서 팀 어드벤처와 힐링 동시에' },
  },
  '토론토': {
    a: { tag:'역량강화형', desc:'캐나다 최대 도시 토론토의 금융·AI·다문화 비즈니스 탐방',
         points:['토론토대학·요크대학 방문·강의','토론토 AI 클러스터 (벡터인스티튜트) 방문','캐나다 TD·RBC 금융 기관 투어'],
         items:['토론토대학 AI·로보틱스 연구소 방문','벡터인스티튜트 AI 혁신 강의','토론토 금융지구 기업 투어','다문화 비즈니스 성공 사례 강의'],
         value:'캐나다 AI·금융·다문화 비즈니스의 중심 토론토에서 미래 산업과 글로벌 다양성 체험' },
    b: { tag:'동기부여·화합형', desc:'나이아가라 폭포와 CN 타워, 토론토 감동의 연속',
         points:['나이아가라 폭포 헬리콥터 투어','CN 타워 에지워크·에지레스토랑 만찬','카나다스 원더랜드 테마파크'],
         items:['나이아가라 폭포 보트·헬리 투어','CN 타워 유리 바닥 에지워크 체험','토론토 아일랜드 선셋 크루즈','재즈·블루스 공연 관람'],
         value:'세계 3대 폭포 나이아가라의 장엄함과 CN타워 스릴에서 팀 전원이 최고의 감동 경험' },
  },

  /* ── 중앙아시아 ── */
  '카자흐스탄': {
    a: { tag:'역량강화형', desc:'중앙아시아 자원 대국 카자흐스탄 신흥 시장 탐구',
         points:['나자르바예프대학 방문·강의','아스타나 국제금융센터(AIFC) 방문','카자흐스탄 자원·에너지 산업 세미나'],
         items:['나자르바예프대학 첨단 연구소 방문','AIFC 카자흐스탄 금융 허브 견학','에너지·광물 자원 개발 현장 강의','한국 기업 카자흐스탄 진출 사례'],
         value:'자원 대국 카자흐스탄 신흥 시장의 투자 기회와 한-카 협력 사례를 현장에서 직접 탐구' },
    b: { tag:'동기부여·화합형', desc:'실크로드의 땅 카자흐스탄, 광활한 초원과 현대 도시의 공존',
         points:['알마티 빅알마티 호수 트레킹','아스타나 미래 건축 야경 투어','카자흐 전통 음식·독수리 사냥 체험'],
         items:['빅알마티 호수 산악 트레킹','아스타나 누르아스타나 야경 투어','카자흐 전통 게르 체험·승마','전통 독수리 사냥 시범 관람'],
         value:'실크로드의 유산과 초원 대자연이 살아있는 카자흐스탄에서 팀의 특별한 이색 경험' },
  },
  '우즈베키스탄': {
    a: { tag:'역량강화형', desc:'실크로드 신흥시장 우즈베키스탄 산업·투자 현장 탐방',
         points:['우즈베키스탄 타슈켄트 한국 기업 법인 방문','웨스턴민스터대학 타슈켄트 방문','우즈벡 제조업·자동차 현장 견학'],
         items:['GM 우즈베키스탄 자동차 공장 견학','타슈켄트 IT파크 스타트업 탐방','한국 기업 우즈벡 성공 사례 강의','우즈벡 농업·섬유 수출 현장 방문'],
         value:'한국 투자가 활발한 우즈베키스탄에서 중앙아시아 시장 진출 전략과 현지화 사례 직접 탐구' },
    b: { tag:'동기부여·화합형', desc:'사마르칸트·부하라, 실크로드 역사 문명의 감동 속으로',
         points:['사마르칸트 레기스탄 광장 야간 조명쇼','부하라 고성·메드레세 역사 탐방','전통 공예 체험·우즈벡 요리 클래스'],
         items:['사마르칸트 레기스탄·구르에미르 투어','부하라 역사 구시가지 전일 탐방','우즈벡 전통 음식·수공예 체험','히바 이찬 칼라 고성 일몰 감상'],
         value:'1,500년 실크로드 문명의 유산 속에서 팀 모두가 역사 감동과 이색 문화 체험' },
  },
};


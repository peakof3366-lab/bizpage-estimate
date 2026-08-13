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

/* P10: 지상비 볼륨 할인 — 대규모 단체는 식당·관광지에서도 볼륨 협상력이 생긴다. 단 규모
   협상 여력이 항공 벌크요금보다 작아 PAX_TIERS(−5/−10/−15%)보다 완만하게 둔다. 항공·유류와
   동일하게 tieredTotal(누진)로 적용해 인원 증가 시 총액 단조성(구간 경계 역전 없음)을 보장.
   · 식사(1인당): 식당 단체 할인은 상대적으로 여지가 큼
   · 관광(1인당 입장료): 정찰제가 많아 할인 폭이 더 작음 → 식사보다 완만
   · 호텔 제외: 목적지 객실단가(hotel_per_room)가 이미 단체 협상가 성격이라 추가 할인은
     이중할인 위험(GPT 협의 결론). 가이드(일당정액)·차량(ceil(인원/정원))은 이미 규모의
     경제가 구조적으로 반영돼 대상 아님. 구간 경계는 항공과 동일(10/30/50).
   계수는 도메인 초안 — P1 정확도·P6 역검증 실측으로 조정 예정. */
const GROUND_MEAL_TIERS = [
  { min:  1, max:  9, factor: 1.00 },
  { min: 10, max: 29, factor: 0.98 },
  { min: 30, max: 49, factor: 0.95 },
  { min: 50, max: Infinity, factor: 0.92 },
];
const GROUND_SIGHT_TIERS = [
  { min:  1, max:  9, factor: 1.00 },
  { min: 10, max: 29, factor: 0.99 },
  { min: 30, max: 49, factor: 0.97 },
  { min: 50, max: Infinity, factor: 0.95 },
];

/* PC: 관광비 일수 계수 — sightseeing_fee는 '1인당 여행 전체 일정의 관광비 묶음'이며
   4~5일 일정 기준으로 잡힌 값이다(요율표 소유자 확인). 기존엔 일수가 전혀 반영되지 않아
   파리 3일과 파리 10일의 관광비가 똑같았다. 여기에 일수 계수를 곱해 일정 길이를 반영한다.

   ⚠ 일수 '정비례'가 아니다. MICE 연수는 기업·기관 방문과 강연이 핵심이고 관광은 부수적이며,
   장거리 일정에는 이동일(비행·시차적응·국내이동)이 2~3일 끼어 관광비가 안 붙는 날이 섞인다.
   그래서 탄력성 0.6~0.7 수준의 체감형으로 둔다(일수 2배 → 관광비 1.6배).
   3일은 4~5일과 관광량 차이가 유의미하지 않아 같은 기준 구간(1.00)으로 묶었다.
   구간 경계에서 금액이 튀지 않도록 인접 배율 점프는 최대 33%로 제한(1~2일 0.75 → 1.00).
   일수는 사용자가 고른 출발일·도착일에서 자동 계산되므로, 하루 차이로 2배씩 뛰면
   같은 고객에게 설명 불가능한 견적 변동이 생긴다.
   (GPT 2라운드 협의로 확정 — 근거: ai-loop/pC_prompt*.txt, ai-loop/pC_gpt_round*.txt) */
const SIGHT_DURATION_TIERS = [
  { max: 2,        factor: 0.75, label: '1~2일'   },
  { max: 5,        factor: 1.00, label: '3~5일'   },  /* 기준 */
  { max: 7,        factor: 1.30, label: '6~7일'   },
  { max: 10,       factor: 1.60, label: '8~10일'  },
  { max: 15,       factor: 1.95, label: '11~15일' },
  { max: Infinity, factor: 2.10, label: '16일+'   },  /* 상한 — 초장기 일정에서 무한 증가 방지 */
];

/* ═══ 골프 라운딩 요금 (TJ) — **1인 1회** (그린피+카트+캐디피) ══════════════════
   기업연수 견적서는 한 행사에서 일행이 조로 갈린다 — 관광을 도는 조와 골프를 치는 조다
   (사장님 2026-08-13: 「관광조가 있고 골프조가 있어」). 그래서 견적 산출도 그 편성을
   받을 수 있어야 한다: 골프조 인원과 라운딩 횟수만큼만 골프비가 붙는다.

   ⚠ **관광비(sightseeing_fee)에 섞지 않는다.** 자릿수가 다르다 — 다낭 관광 50,000 대
     라운딩 235,935. 한 칸에 넣으면 그 목적지의 관광비 기준이 통째로 왜곡되고, 그 왜곡이
     요율 갱신 제안을 타고 **골프를 안 치는 고객의 견적까지** 간다. 추출기가 골프를 따로
     세는 이유와 같다(pdf_extract.js golfPerRound).

   ⚠ **값이 있는 곳만 적는다. 57곳을 추정치로 채우지 않는다.**
     아래는 전부 실제 견적서에서 뽑은 값이다(코퍼스 46건, 2026-08-13 추출):
       제주도      170,000  고은회 「오라 C.C 170,000 × 24명」 (다른 건은 175,000)
       오키나와    133,000  글로벌 바모스 「오키나와 CC ¥14,000 × 15명」 (¥1=9.5)
       후아힌      235,935  굿리치 RM재무 2라운드 (229,320 / 242,550 평균)
       카자흐스탄  267,180  글로벌 대표단 2라운드 (누르타우·자일라우, 그린피+캐디피)
     모르는 목적지는 **비워 둔다** — 화면이 「이 목적지는 골프 요금이 아직 없습니다」라고
     말하고 옵션을 잠근다. 짐작한 값으로 견적을 내면 그 숫자가 고객에게 나간다.
   ⚠ 견적서가 쌓이면 이 값들은 실측으로 교체된다(요율 갱신 제안과 같은 흐름).
     여기 적힌 것도 이미 실측이므로 **추정 배지가 아니라 실측 배지가 맞다.** */
const GOLF_FEES = {
  '제주도': 170000,
  '오키나와': 133000,
  '후아힌': 235935,
  '카자흐스탄': 267180,
};

/* 그 목적지에 골프 요금이 있는가. 없으면 0 — 화면이 이걸로 옵션을 잠근다.
   ⚠ 여기 한 곳만 보게 한다. 화면이 `GOLF_FEES[key]`를 직접 읽으면 「값이 있는가」의
     판단이 두 벌이 되어 한쪽만 고쳐진다(결함 생성기 ①). */
function getGolfFee(destKey) {
  const v = GOLF_FEES[destKey];
  return (typeof v === 'number' && v > 0) ? v : 0;
}

/* 출발월 기준 시즌 계수 — 항공·유류·호텔에 적용 (북반구/한국 출발 수요 기준) */
const SEASON_CONFIG = [
  { id: 'peak',    months: [7, 8, 12, 1], factor: 1.20, label: '성수기', badge: '성수기 +20%' },
  { id: 'offpeak', months: [2, 6],        factor: 0.88, label: '비수기', badge: '비수기 −12%' },
  { id: 'normal',  months: [],            factor: 1.00, label: '평시',   badge: '평시' },
];

/* =====================================================================
   DEST_CLASSIFY — 목적지 분류의 단일 진실 (PY)
   ─────────────────────────────────────────────────────────────────────
   목적지 하나가 어느 좌석 구간·보험 권역·관리자 지역·정산 통화·시즌 달력·반구에
   속하는지를 **여기 한 줄**에 적는다. 아래 목록들은 전부 이 표에서 파생된다:
     script.js  BIZ_ZONES                 ← zone
     script.js  INSURANCE_ZONES           ← ins
     admin.html REGION_MAP                ← region
     admin.html DEST_COUNTRY              ← country
     dest_currency.js DEST_CURRENCY       ← currency
     data.js    DEST_SEASON_PROFILES[].keys ← season
     data.js    SOUTHERN_HEMISPHERE_DESTS ← hemi:'S'

   ⚠ country는 **가격에 전혀 쓰이지 않는다**(RY). 요율·계수·시즌 어디에도 안 들어가고,
   관리자 화면에서 "이 호텔이 어느 나라 것인가"를 가르는 데만 쓴다. 지역(region)만으로는
   부족해서 생겼다 — '동남아' 하나에 베트남·태국·필리핀·인도네시아가 다 들어 있어,
   같은 이름의 체인 호텔(예: 롯데·인터컨티넨탈)이 어느 나라 것인지 목록에서 구분되지
   않았다. region은 요율 일괄조정 단위(가격 축)이고 country는 실물 축이라 서로 대체할 수
   없다 — 그래서 region을 잘게 쪼개지 않고 축을 하나 더 뒀다.
   ⚠ '서유럽'·'북유럽'·'동유럽'은 애초에 여러 나라를 묶은 **광역 목적지**라 나라가 하나로
   정해지지 않는다. 없는 나라 이름을 지어내지 않고 목적지 이름을 그대로 쓴다(그 목록에서
   "이건 나라 단위가 아니다"가 보이는 편이 낫다). 괌·사이판은 미국령이지만 호텔 시장이
   미국 본토와 완전히 별개라 따로 둔다.

   ⚠ 이 표가 생긴 이유 — 예전엔 같은 목적지 목록이 파일 넷에 따로 적혀 있었고,
   목적지를 추가하며 한 곳을 빠뜨리는 사고가 **여섯 번** 났다(동유럽 통화·지역,
   PF 스냅샷/패널, PG 견적서 표시, PP 보험권역, PQ 시즌). 빠뜨린 쪽은 예외를
   던지지 않고 **중립값이나 다른 계절로 조용히 폴백**해 틀린 금액이 그대로 나갔다.
   이제 목적지를 추가할 때 채울 곳은 destinationRates 행과 이 표 한 줄뿐이다.
   (한 곳이라도 값을 빠뜨리면 아래 파생 함수가 DEST_CLASSIFY_ISSUES에 기록하고
   audit_consistency.js가 오류로 잡는다 — 조용히 넘어가지 않는다.)

   ⚠ 관리자가 화면에서 추가하는 커스텀 목적지는 여기 없고 DB(custom_destinations)의
   같은 이름 컬럼들이 이 역할을 한다. script.js가 런타임에 파생 목록으로 편입한다.
   ===================================================================== */
const DEST_CLASSIFY = {
  /* TE: 유일한 **국내** 목적지. 해외와 축이 다르다 —
     ins 'domestic'(국내여행자보험) · season 'korea'(휴가철 성수기) · currency 'KRW'(환율 보정 없음).
     ⚠ zone은 'short'로 둔다 — 국내선은 비즈니스석이 거의 없어 좌석 배수를 쓸 일이 드물고,
       구간을 새로 만들면 BIZ_ZONES 전체에 파급된다. 비즈니스를 실제로 팔게 되면 그때 나눈다. */
  '제주도':    { zone:'short', ins:'domestic'  , region:'국내',        country:'대한민국',   currency:'KRW', season:'korea'         },
  '도쿄':     { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '오사카':    { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '후쿠오카':   { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '가고시마':   { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '나고야':    { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '삿포로':    { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '오키나와':   { zone:'short', ins:'asiaShort', region:'일본',        country:'일본',      currency:'JPY', season:'japan'         },
  '홍콩':     { zone:'short', ins:'asiaShort', region:'홍콩·마카오',    country:'홍콩',      currency:'HKD', season:'hkmo'          },
  '마카오':    { zone:'short', ins:'asiaShort', region:'홍콩·마카오',    country:'마카오',     currency:'MOP', season:'hkmo'          },
  '상해':     { zone:'short', ins:'asiaShort', region:'중국',        country:'중국',      currency:'CNY', season:'china'         },
  '장가계':    { zone:'short', ins:'asiaShort', region:'중국',        country:'중국',      currency:'CNY', season:'china'         },
  '청도':     { zone:'short', ins:'asiaShort', region:'중국',        country:'중국',      currency:'CNY', season:'china'         },
  '연태':     { zone:'short', ins:'asiaShort', region:'중국',        country:'중국',      currency:'CNY', season:'china'         },
  '몽골':     { zone:'short', ins:'evac'     , region:'몽골·대만',     country:'몽골',      currency:'MNT', season:'mongolia'      },
  '대만':     { zone:'short', ins:'asiaShort', region:'몽골·대만',     country:'대만',      currency:'TWD', season:'taiwan'        },
  '가오슝':    { zone:'short', ins:'asiaShort', region:'몽골·대만',     country:'대만',      currency:'TWD', season:'taiwan'        },
  '라오스':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'라오스',     currency:'LAK', season:'seasia'        },
  '싱가포르':   { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'싱가포르',    currency:'SGD', season:'seasia'        },
  '하노이':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'베트남',     currency:'VND', season:'seasia'        },
  '호치민':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'베트남',     currency:'VND', season:'seasia'        },
  '다낭':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'베트남',     currency:'VND', season:'seasia'        },
  '나트랑':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'베트남',     currency:'VND', season:'seasia'        },
  '푸꾸옥':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'베트남',     currency:'VND', season:'seasia'        },
  '세부':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'필리핀',     currency:'PHP', season:'seasia'        },
  '마닐라':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'필리핀',     currency:'PHP', season:'seasia'        },
  '보홀':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'필리핀',     currency:'PHP', season:'seasia'        },
  '코타키나발루': { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'말레이시아',   currency:'MYR', season:'seasia'        },
  '캄보디아':   { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'캄보디아',    currency:'KHR', season:'seasia'        },
  '방콕':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'태국',      currency:'THB', season:'seasia'        },
  '푸켓':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'태국',      currency:'THB', season:'seasia'        },
  '후아힌':    { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'태국',      currency:'THB', season:'seasia'        },
  '치앙마이':   { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'태국',      currency:'THB', season:'seasia'        },
  '발리':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       country:'인도네시아',   currency:'IDR', season:'seasia'        },
  '괌':      { zone:'mid'  , ins:'highCost' , region:'오세아니아·태평양', country:'괌',       currency:'USD', season:'guamSaipan'    },
  '사이판':    { zone:'mid'  , ins:'highCost' , region:'오세아니아·태평양', country:'사이판',     currency:'USD', season:'guamSaipan'    },
  '시드니':    { zone:'mid'  , ins:'oceania'  , region:'오세아니아·태평양', country:'호주',      currency:'AUD', season:'southern',     hemi:'S' },
  '멜버른':    { zone:'mid'  , ins:'oceania'  , region:'오세아니아·태평양', country:'호주',      currency:'AUD', season:'southern',     hemi:'S' },
  '오클랜드':   { zone:'mid'  , ins:'oceania'  , region:'오세아니아·태평양', country:'뉴질랜드',    currency:'NZD', season:'southern',     hemi:'S' },
  '서유럽':    { zone:'long' , ins:'highCost' , region:'유럽',        country:'서유럽',     currency:'EUR', season:'europe'        },
  '로마':     { zone:'long' , ins:'highCost' , region:'유럽',        country:'이탈리아',    currency:'EUR', season:'europe'        },
  '파리':     { zone:'long' , ins:'highCost' , region:'유럽',        country:'프랑스',     currency:'EUR', season:'europe'        },
  '영국':     { zone:'long' , ins:'highCost' , region:'유럽',        country:'영국',      currency:'GBP', season:'europe'        },
  '스페인':    { zone:'long' , ins:'highCost' , region:'유럽',        country:'스페인',     currency:'EUR', season:'europe'        },
  '독일':     { zone:'long' , ins:'highCost' , region:'유럽',        country:'독일',      currency:'EUR', season:'europe'        },
  '네덜란드':   { zone:'long' , ins:'highCost' , region:'유럽',        country:'네덜란드',    currency:'EUR', season:'europe'        },
  '북유럽':    { zone:'long' , ins:'highCost' , region:'유럽',        country:'북유럽',     currency:'EUR', season:'europe'        },
  '로스앤젤레스': { zone:'long' , ins:'highCost' , region:'북미',        country:'미국',      currency:'USD', season:'northAmerica'  },
  '샌프란시스코': { zone:'long' , ins:'highCost' , region:'북미',        country:'미국',      currency:'USD', season:'northAmerica'  },
  '워싱턴':    { zone:'long' , ins:'highCost' , region:'북미',        country:'미국',      currency:'USD', season:'northAmerica'  },
  '뉴욕':     { zone:'long' , ins:'highCost' , region:'북미',        country:'미국',      currency:'USD', season:'northAmerica'  },
  '하와이':    { zone:'long' , ins:'highCost' , region:'북미',        country:'미국',      currency:'USD', season:'northAmerica'  },
  '밴쿠버':    { zone:'long' , ins:'highCost' , region:'북미',        country:'캐나다',     currency:'CAD', season:'northAmerica'  },
  '토론토':    { zone:'long' , ins:'highCost' , region:'북미',        country:'캐나다',     currency:'CAD', season:'northAmerica'  },
  '호주':     { zone:'long' , ins:'oceania'  , region:'오세아니아·태평양', country:'호주',      currency:'AUD', season:'southern',     hemi:'S' },
  '카자흐스탄':  { zone:'mid'  , ins:'evac'     , region:'중앙아시아',     country:'카자흐스탄',   currency:'KZT', season:'centralAsia'   },
  '우즈베키스탄': { zone:'mid'  , ins:'evac'     , region:'중앙아시아',     country:'우즈베키스탄',  currency:'UZS', season:'centralAsia'   },
  /* '동유럽' region은 2026-07-28까지 '중앙아시아'였다. 요율은 명백히 유럽 티어인데
     (항공 120만·대형차량 110만 — 로마와 같은 수준, 카자흐스탄 80만과는 딴판) 그룹만
     중앙아시아라 지역별 일괄조정에서 유럽에는 빠지고 중앙아시아에 잘못 딸려갔다.
     zone(long)·ins(highCost)는 원래부터 유럽 취급이라 region만 어긋나 있던 것 —
     축이 파일마다 흩어져 있으면 한 축만 낡는다는 증거라 이 표를 만든 이유이기도 하다.
     currency는 EUR 근사(실제는 PLN/CZK/HUF지만 EUR과 함께 움직인다. 2026-07-28까지는
     아예 비어 있어 '동유럽만 환율 보정을 못 받는' 가격 불일치였다). */
  '동유럽':    { zone:'long' , ins:'highCost' , region:'유럽',        country:'동유럽',     currency:'EUR', season:'europe'        },
};

/* 파생 실패 기록 — 분류표에 값이 비었거나 아무도 모르는 구간명이면 여기 쌓인다.
   ⚠ 조용히 버리지 않는 것이 요점이다. 값이 빠진 목적지는 어차피 엔진에서 중립값으로
   폴백되는데(그게 여섯 번 사고의 정체다), 그 사실이 어디에도 안 남으면 아무도 모른다.
   audit_consistency.js가 이 배열이 비어 있는지 검사하고, 비어 있지 않으면 오류다. */
const DEST_CLASSIFY_ISSUES = [];
function noteClassifyIssue(msg) {
  DEST_CLASSIFY_ISSUES.push(msg);
  if (typeof console !== 'undefined' && console.warn) console.warn('[분류표] ' + msg);
}

/* 분류표 → { 구간명: [목적지…] } 형태의 목록.
   groupIds에 없는 구간명은 **그룹을 새로 만들지 않는다** — INSURANCE_ZONES에 모르는
   구간이 생기면 getInsuranceZone이 그걸 찾아버리고 INSURANCE_ZONE_FACTORS엔 없어
   보험료가 NaN이 된다(폴백보다 나쁘다). 대신 편입하지 않고 기록만 남겨,
   기존의 '미등록 → 중립값 폴백 + 콘솔 경고' 동작을 그대로 유지한다. */
function destGroupsBy(field, groupIds) {
  const out = {};
  groupIds.forEach((g) => { out[g] = []; });
  Object.keys(DEST_CLASSIFY).forEach((k) => {
    const g = DEST_CLASSIFY[k][field];
    if (out[g]) out[g].push(k);
    else noteClassifyIssue(`${k}: ${field}가 '${g}'인데 알려진 구간(${groupIds.join('/')})이 아니라 편입되지 않음`);
  });
  return out;
}

/* 분류표 → { 목적지: 값 } 형태의 맵 (지역·통화처럼 구간이 열려 있는 축) */
function destFieldMap(field) {
  const out = {};
  Object.keys(DEST_CLASSIFY).forEach((k) => {
    const v = DEST_CLASSIFY[k][field];
    if (v === undefined || v === null || v === '') noteClassifyIssue(`${k}: ${field} 값이 비어 있음`);
    else out[k] = v;
  });
  return out;
}

/* 분류표 → 특정 값을 가진 목적지 키 목록 */
function destKeysWhere(field, value) {
  return Object.keys(DEST_CLASSIFY).filter((k) => DEST_CLASSIFY[k][field] === value);
}

/* 남반구 폴백 시즌표 — 계절이 북반구와 정반대(12~2월 현지 여름/성수기, 6~8월 현지 겨울/비수기).
   ※ 알려진 남반구 4곳(시드니·멜버른·호주·오클랜드)은 아래 DEST_SEASON_PROFILES에 전용 프로파일이
   생겨(P8) 그쪽이 우선 적용되므로, 이 표는 '프로파일이 아직 없는 향후 남반구 목적지'(예: 브리즈번·
   퀸스타운 등 신규 추가 시)의 안전 폴백 용도로 남겨둔다. SOUTHERN_HEMISPHERE_DESTS에만 있고
   프로파일이 없는 목적지가 이 표를 쓴다.
   PY: 목록을 따로 적지 않고 DEST_CLASSIFY의 hemi:'S'에서 파생한다(내용은 종전과 동일한 4곳).
   ⚠ 런타임에 커스텀 목적지가 push되므로 반드시 배열이어야 한다(script.js applyRateOverrides). */
const SOUTHERN_HEMISPHERE_DESTS = destKeysWhere('hemi', 'S');
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
   탓에 같은 권역 안에서도 예외가 있습니다(예: 삿포로 겨울, 오키나와 여름, 하와이 겨울).
   P8: 남반구 4곳(시드니·멜버른·호주·오클랜드)도 아래에 전용 프로파일을 추가함
   (기존엔 공용 SEASON_CONFIG_SOUTHERN만 썼음). 이제 SEASON_CONFIG_SOUTHERN은
   프로파일 없는 '향후' 남반구 목적지의 폴백으로만 쓰인다.

   PQ: 각 프로파일에 `id`·`name`을 붙였다(내장 목적지 매칭은 그대로 keys 기반이라 동작 불변).
   관리자가 추가한 커스텀 목적지는 label이 여기 keys에 없으므로 어느 프로파일도 못 만나
   공용표로 폴백했는데, 이제 custom_destinations.season_profile에 이 `id`를 저장해
   script.js가 런타임에 해당 프로파일의 keys로 편입한다. `name`은 관리자 폼 선택지
   문구로 그대로 쓰이므로(admin.html이 이 배열로 select를 만든다) 프로파일을 추가하면
   폼에도 자동으로 나타난다 — 목록을 두 번 적지 않기 위한 것. */
const DEST_SEASON_PROFILES = [
  {
    /* TE: 국내(제주) — **여름 휴가철(7~8월)**이 성수기, 2~3월·6월(장마)·11~12월이 비수기.
       해외 프로파일 어느 것과도 안 맞아 새로 만들었다(일본은 벚꽃·단풍 기준이다).
       ⚠ 온라인 취합값이다 — 대표가 손으로 고칠 자리다(결정대기열 7-d-1). */
    id: 'korea', name: '국내 (여름 7~8월 성수기 / 2~3월·6월·11~12월 비수기)',
    config: [
      { id:'peak',    months:[7,8],         factor:1.18, label:'여름 휴가철', badge:'여름 휴가철 +18%' },
      { id:'offpeak', months:[2,3,6,11,12], factor:0.90, label:'비수기',      badge:'비수기 −10%' },
      { id:'normal',  months:[],            factor:1.00, label:'평시',        badge:'평시' },
    ],
  },
  {
    /* 동남아 — 건기(11~3월) 성수기 / 우기(5~9월) 비수기. 공용표(여름 성수기)와 정반대 */
    id: 'seasia', name: '동남아 (건기 11~3월 성수기 / 우기 5~9월 비수기)',
    config: [
      { id:'peak',    months:[11,12,1,2,3], factor:1.15, label:'건기 성수기', badge:'건기 성수기 +15%' },
      { id:'offpeak', months:[5,6,7,8,9],   factor:0.88, label:'우기 비수기', badge:'우기 비수기 −12%' },
      { id:'normal',  months:[],            factor:1.00, label:'평시',        badge:'평시' },
    ],
  },
  {
    /* 유럽 — 여름(6~9월) 성수기 / 겨울(11~2월) 비수기. 동유럽도 시즌상 여기 포함 */
    id: 'europe', name: '유럽 (여름 6~9월 성수기 / 겨울 11~2월 비수기)',
    config: [
      { id:'peak',    months:[6,7,8,9],   factor:1.20, label:'여름 성수기', badge:'여름 성수기 +20%' },
      { id:'offpeak', months:[11,12,1,2], factor:0.88, label:'겨울 비수기', badge:'겨울 비수기 −12%' },
      { id:'normal',  months:[],          factor:1.00, label:'평시',        badge:'평시' },
    ],
  },
  {
    /* 일본 — 벚꽃(3~4월)·여름(7~8월)·단풍(10~11월) 성수기 / 겨울초(1월)·장마(6월) 비수기.
       골든위크·벚꽃 피크는 PEAK_CALENDAR가 날짜로 별도 가산. 삿포로(겨울)·오키나와(여름)는 예외. */
    id: 'japan', name: '일본 (벚꽃 3~4월·여름 7~8월·단풍 10~11월 성수기)',
    config: [
      { id:'peak',    months:[3,4,7,8,10,11], factor:1.15, label:'벚꽃·단풍·여름 성수기', badge:'성수기 +15%' },
      { id:'offpeak', months:[1,6],           factor:0.90, label:'비수기',              badge:'비수기 −10%' },
      { id:'normal',  months:[],              factor:1.00, label:'평시',                badge:'평시' },
    ],
  },
  {
    /* 홍콩·마카오 — 가을~초겨울(10~12월, 온화·쇼핑) 성수기 / 한여름(6~8월, 무덥고 태풍) 비수기 */
    id: 'hkmo', name: '홍콩·마카오 (가을·연말 10~12월 성수기 / 한여름 비수기)',
    config: [
      { id:'peak',    months:[10,11,12], factor:1.12, label:'가을·연말 성수기', badge:'성수기 +12%' },
      { id:'offpeak', months:[6,7,8],    factor:0.90, label:'한여름 비수기',   badge:'비수기 −10%' },
      { id:'normal',  months:[],         factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 중국(본토) — 여름(7~8월)·가을(10월 국경절) 성수기 / 한겨울(1~2월) 비수기. 춘절은 PEAK_CALENDAR가 가산 */
    id: 'china', name: '중국 본토 (여름·국경절 성수기 / 한겨울 비수기)',
    config: [
      { id:'peak',    months:[7,8,10], factor:1.12, label:'여름·국경절 성수기', badge:'성수기 +12%' },
      { id:'offpeak', months:[1,2],    factor:0.90, label:'한겨울 비수기',     badge:'비수기 −10%' },
      { id:'normal',  months:[],       factor:1.00, label:'평시',              badge:'평시' },
    ],
  },
  {
    /* 몽골 — 여름(6~8월, 초원관광 극성수기) / 혹한기(11~3월) 강비수기 */
    id: 'mongolia', name: '몽골 (여름 6~8월 극성수기 / 혹한기 11~3월 강비수기)',
    config: [
      { id:'peak',    months:[6,7,8],       factor:1.25, label:'여름 극성수기', badge:'여름 성수기 +25%' },
      { id:'offpeak', months:[11,12,1,2,3], factor:0.82, label:'혹한기 비수기', badge:'비수기 −18%' },
      { id:'normal',  months:[],            factor:1.00, label:'평시',          badge:'평시' },
    ],
  },
  {
    /* 대만 — 가을·겨울(10~12월, 온화) 성수기 / 한여름(7~8월, 무덥고 태풍) 비수기. 춘절은 PEAK_CALENDAR가 가산 */
    id: 'taiwan', name: '대만 (가을·겨울 10~12월 성수기 / 한여름 비수기)',
    config: [
      { id:'peak',    months:[10,11,12], factor:1.12, label:'가을·겨울 성수기', badge:'성수기 +12%' },
      { id:'offpeak', months:[7,8],      factor:0.90, label:'한여름 비수기',   badge:'비수기 −10%' },
      { id:'normal',  months:[],         factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 괌·사이판 — 건기·방학철(12~3,7~8월) 성수기 / 우기·태풍철(9~10월) 비수기 */
    id: 'guamSaipan', name: '괌·사이판 (건기·방학 12~3·7~8월 성수기 / 태풍철 비수기)',
    config: [
      { id:'peak',    months:[12,1,2,3,7,8], factor:1.15, label:'건기·방학 성수기', badge:'성수기 +15%' },
      { id:'offpeak', months:[9,10],         factor:0.90, label:'우기 비수기',     badge:'비수기 −10%' },
      { id:'normal',  months:[],             factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 북미 — 여름(6~8월)·연말(12월) 성수기 / 늦겨울(2~3월) 비수기. 하와이는 겨울도 강성수기라 예외 */
    id: 'northAmerica', name: '북미 (여름 6~8월·연말 성수기 / 늦겨울 비수기)',
    config: [
      { id:'peak',    months:[6,7,8,12], factor:1.15, label:'여름·연말 성수기', badge:'성수기 +15%' },
      { id:'offpeak', months:[2,3],      factor:0.92, label:'늦겨울 비수기',   badge:'비수기 −8%' },
      { id:'normal',  months:[],         factor:1.00, label:'평시',            badge:'평시' },
    ],
  },
  {
    /* 중앙아시아(카자흐스탄·우즈베키스탄) — 봄가을(4~6,9~10월) 쾌적 성수기 / 혹서(7~8월)·혹한(12~2월) 비수기 */
    id: 'centralAsia', name: '중앙아시아 (봄·가을 성수기 / 혹서·혹한 비수기)',
    config: [
      { id:'peak',    months:[4,5,6,9,10], factor:1.12, label:'봄·가을 성수기',   badge:'성수기 +12%' },
      { id:'offpeak', months:[7,8,12,1,2], factor:0.90, label:'혹서·혹한 비수기', badge:'비수기 −10%' },
      { id:'normal',  months:[],           factor:1.00, label:'평시',             badge:'평시' },
    ],
  },
  {
    /* 남반구(호주·뉴질랜드) — 계절이 북반구와 정반대. 현지 여름·연말(12~2월)이 성수기,
       현지 겨울(6~8월)이 비수기. 겨울 비수기는 한국 여름방학 아웃바운드 수요가 일부 받쳐
       −12%(공용표)보다 완만한 −10%. 부활절(3~4월)은 매년 날짜가 바뀌는 ~10일 이동축일이라
       월 전체를 성수기로 잡으면 과대추정(날짜단위 피크 소관) → 평시로 둠. 시드니(온난)·
       멜버른(서늘)의 기후차는 월 단위 원가에 큰 영향이 없고, 호주·뉴질랜드 시즌 패턴도 사실상
       동일해 한 config로 통합. (성수기/비수기 월·계수는 도메인 초안, 실측으로 조정 예정.) */
    id: 'southern', name: '남반구 호주·뉴질랜드 (현지 여름 12~2월 성수기)',
    config: [
      { id:'peak',    months:[12,1,2], factor:1.20, label:'현지 여름·연말 성수기', badge:'성수기 +20%' },
      { id:'offpeak', months:[6,7,8],  factor:0.90, label:'현지 겨울 비수기',     badge:'비수기 −10%' },
      { id:'normal',  months:[],       factor:1.00, label:'평시',                badge:'평시' },
    ],
  },
];

/* PY: 각 프로파일이 어느 목적지를 담당하는지(keys)를 DEST_CLASSIFY의 season에서 파생한다.
   예전엔 프로파일마다 목적지 목록을 직접 적었는데, 그러면 목적지 하나를 추가할 때
   요율표·좌석·보험·지역·통화에 더해 여기까지 여섯 곳을 손대야 했고 실제로 PQ에서
   빠뜨린 적이 있다. getSeasonInfo(script.js)는 종전대로 keys로 매칭하므로 동작 불변.
   ⚠ 배열을 새로 만들어 넣는다 — 커스텀 목적지는 런타임에 여기 push된다(PQ). */
DEST_SEASON_PROFILES.forEach((p) => { p.keys = destKeysWhere('season', p.id); });

/* 어느 프로파일에도 안 들어간 목적지 = season 값이 오타이거나 없는 프로파일을 가리킨 것.
   destKeysWhere는 그냥 걸러내기만 하므로 여기서 따로 확인하지 않으면 조용히 공용표로
   폴백한다 — 그 폴백은 '중립'이 아니라 **다른 계절**이라 최대 36% 어긋나고 부호까지
   반대다(PQ에서 실제로 겪은 유형). 그래서 기록을 남긴다. */
(function checkSeasonCoverage() {
  const covered = new Set();
  DEST_SEASON_PROFILES.forEach((p) => p.keys.forEach((k) => covered.add(k)));
  Object.keys(DEST_CLASSIFY).forEach((k) => {
    if (!covered.has(k)) {
      noteClassifyIssue(`${k}: season '${DEST_CLASSIFY[k].season}'에 해당하는 시즌 프로파일이 없어 공용표로 폴백됨`);
    }
  });
})();

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

   ⚠ 목적지를 추가/삭제할 때 함께 고칠 곳 (PY 이후로 두 곳이다):
     ① 위 DEST_CLASSIFY에 한 줄 — 좌석 구간·보험 권역·지역·나라·통화·시즌·반구.
        BIZ_ZONES·INSURANCE_ZONES·REGION_MAP·DEST_COUNTRY·DEST_CURRENCY·시즌 프로파일
        keys는 전부 여기서 파생되므로 따로 손댈 필요가 없다.
     ② index.html의 <select id="destination"> 옵션 목록 — 여기만 아직 별도다
        (optgroup·표기가 화면 구성이라 자동 생성 대상이 아니다).
   한 곳만 바꾸면 getDestinationByKey()가 조용히 undefined를 반환하거나,
   getBizFactor()가 잘못된 요율 구간(short)으로, getInsuranceZone()이 중립값
   (1.00)으로 조용히 폴백되어 견적 금액이 틀어집니다. 후자 둘은 콘솔 경고를
   남기지만 금액 자체는 그대로 나가니 주의하세요.
   커버리지는 `node ai-loop/test_pB_insurance.js`와 `node ai-loop/audit_consistency.js`가
   전수 검사합니다 (2026-07-31 확인 결과 55개 전부 정확히 일치함).
   ===================================================================== */
const destinationRates = [
  /* ── 동북아시아 : 일본 ── */
  {"destination_key":"제주도",      "label":"제주도",      "airfare":189400, "fuel_surcharge":20000, "hotel_per_room":170000,"meal_per_person":60000, "vehicle_large":550000, "vehicle_small":250000, "guide_fee":250000,"sightseeing_fee":170000, "margin_per_traveler":80000, "rateDate":"2026-08", "notes":"국내 — 항공·호텔·차량·관광은 견적서 실측, 유류·식비·가이드·마진은 온라인 취합 추정입니다. 견적서가 쌓이면 갱신 제안이 알려줍니다.", "season_note":"성수기: 7~8월(여름 휴가철) · 평시: 4~5월·9~10월(연수 최적기) · 비수기: 2~3월·6월(장마)·11~12월"},
  {"destination_key":"도쿄",        "label":"도쿄",        "airfare":380000, "fuel_surcharge":180000,"hotel_per_room":300000,"meal_per_person":25000, "vehicle_large":1200000,"vehicle_small":840000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"오사카",       "label":"오사카",       "airfare":360000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1100000,"vehicle_small":770000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"후쿠오카",     "label":"후쿠오카",     "airfare":330000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1000000,"vehicle_small":700000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-06", "notes":"", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
  {"destination_key":"가고시마",     "label":"가고시마",     "airfare":330000, "fuel_surcharge":180000,"hotel_per_room":250000,"meal_per_person":25000, "vehicle_large":1000000,"vehicle_small":700000, "guide_fee":300000,"sightseeing_fee":30000, "margin_per_traveler":130000, "rateDate":"2026-08", "notes":"단가는 같은 규슈인 후쿠오카를 복사한 출발점입니다 — 견적서가 쌓이면 갱신 제안이 알려줍니다.", "season_note":"성수기: 3~4월(벚꽃)·9~11월(단풍) · 평시: 5월·10월 · 비수기: 1~2월·장마(6월중~7월초)·혹서기(7~8월)"},
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
  {"destination_key":"후아힌",         "label":"후아힌",         "airfare":500000, "fuel_surcharge":280000,"hotel_per_room":200000,"meal_per_person":20000, "vehicle_large":300000, "vehicle_small":110000, "guide_fee":255000,"sightseeing_fee":50000, "margin_per_traveler":150000, "rateDate":"2026-08", "notes":"단가는 같은 태국인 방콕·푸켓을 복사한 출발점입니다 — 견적서가 쌓이면 갱신 제안이 알려줍니다.", "season_note":"성수기: 11~4월(건기) · 평시: 5월·10월 · 비수기: 6~9월(우기)"},
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
  {"destination_key":"하와이",       "label":"하와이",       "airfare":1500000,"fuel_surcharge":580000,"hotel_per_room":400000,"meal_per_person":40000, "vehicle_large":2200000,"vehicle_small":1650000,"guide_fee":580000,"sightseeing_fee":200000,"margin_per_traveler":300000, "rateDate":"2026-07", "notes":"성수기 요금 급등. 성수기 출발 시 재확인 권장. 관광비: 2026-07 100,000→200,000 (루아우 만찬·폴리네시안 문화센터·할레아칼라 일출투어가 각 $70~180이라 100,000으로는 원가 미달. LA·SF와 동일선).", "season_note":"성수기: 12월말~3월(연말연시 최고가)·한국 방학 7~8월 · 평시: 4~5월·9~10월(날씨 좋고 저렴) · 우기: 10월중~3월"},
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
if (typeof module !== 'undefined' && module.exports) {
  module.exports = destinationRates;
  /* PQ: 시즌 프로파일 id 목록을 서버 검증(api/rates.js)이 재사용하도록 함께 내보낸다.
     배열에 프로퍼티를 얹는 형태인 이유는 기존 `require('../data')`가 곧 요율 배열이고
     세 곳(quotes.js·rates.js·quote_verify.js)이 모두 .map()으로만 쓰기 때문 —
     export 형태를 객체로 바꾸면 그 세 곳을 다 고쳐야 한다.
     서버가 허용 키를 따로 적지 않고 여기를 보므로 목록이 어긋날 수가 없다. */
  module.exports.DEST_SEASON_PROFILES = DEST_SEASON_PROFILES;
  /* PY: 분류표와 파생 함수. dest_currency.js(Node)가 DEST_CURRENCY를 여기서 만들고,
     감사 도구·테스트가 파생 결과를 대조하는 데 쓴다. */
  module.exports.DEST_CLASSIFY = DEST_CLASSIFY;
  module.exports.DEST_CLASSIFY_ISSUES = DEST_CLASSIFY_ISSUES;
  module.exports.destGroupsBy = destGroupsBy;
  module.exports.destFieldMap = destFieldMap;
  module.exports.destKeysWhere = destKeysWhere;
  /* TJ: 골프 라운딩 요금(1인 1회). 감사기·테스트가 「값이 있는 목적지만 옵션이 열리는가」를
     대조하는 데 쓴다. 화면은 getGolfFee 하나만 본다. */
  module.exports.GOLF_FEES = GOLF_FEES;
  module.exports.getGolfFee = getGolfFee;
}

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
  '제주도': {
    a: { tag:'역량강화형', desc:'국내에서 배우는 친환경 에너지·관광산업 운영 모델',
         points:['제주에너지공사·풍력단지 견학','제주테크노파크 입주기업 교류','관광 인프라 운영 브리핑'],
         items:['카본프리 아일랜드 정책 브리핑','풍력·태양광 발전단지 현장 견학','제주테크노파크 창업 생태계 탐방','리조트·컨벤션 운영 사례 세션'],
         value:'해외로 나가지 않고도 에너지 전환과 관광산업 운영을 현장에서 확인하는 국내 연수' },
    b: { tag:'동기부여·화합형', desc:'이동 부담 없이 몰입하는 국내 거점형 팀 워크숍',
         points:['리조트 컨퍼런스 워크숍','오름 트레킹 팀 활동','해녀문화·로컬 공방 체험'],
         items:['리조트 컨퍼런스룸 집중 세션','오름 트레킹·조별 미션','해녀문화 체험·로컬 공방','흑돼지 만찬·성과 발표'],
         value:'출입국 없이 오전 출발·오후 시작이 가능해 짧은 일정에도 몰입도가 높은 연수' },
  },
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
  '가고시마': {
    a: { tag:'역량강화형', desc:'활화산과 공존하는 도시의 방재·지열에너지 산업 탐구',
         points:['사쿠라지마 화산 방재센터 견학','이부스키 지열 발전 현장 시찰','근대 산업유산 쇼코슈세이칸 탐방'],
         items:['화산 방재 시스템·도시 대응 체계 브리핑','지열 에너지 활용 현장 견학','규슈 소재·전자부품 클러스터 방문','가고시마항 물류 인프라 시찰'],
         value:'재난 위험을 도시 경쟁력으로 바꾼 가고시마의 방재·에너지 운영 모델을 현장에서 학습' },
    b: { tag:'동기부여·화합형', desc:'화산과 온천, 규슈 남단에서 몰입하는 팀 연수',
         points:['이부스키 모래찜질 온천 체험','사쿠라지마 트레킹 팀 활동','사쓰마 도자기 공예 체험'],
         items:['이부스키 천연 모래찜질 온천','사쿠라지마 화산 트레킹·조별 미션','사쓰마 도자기 만들기 체험','흑돼지 샤부샤부 팀 만찬'],
         value:'온천 리조트를 거점으로 자연 속 팀 활동과 휴식을 함께 가져가는 몰입형 연수' },
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
  '후아힌': {
    a: { tag:'역량강화형', desc:'태국 왕실 휴양지의 리조트 운영·서비스 품질 관리 학습',
         points:['리조트 운영 브리핑(객실·F&B·인력)','왕실 별궁·기차역 도시계획 탐방','후아힌 힐즈 와이너리 농식품 견학'],
         items:['리조트 운영·서비스 품질 관리 세션','왕실 휴양지 도시계획 현장 탐방','시카다 마켓 로컬 상권 조사','와이너리·농식품 가공 브리핑'],
         value:'100년 넘게 이어진 왕실 휴양지의 호스피탈리티 운영 노하우를 현장에서 직접 확인' },
    b: { tag:'동기부여·화합형', desc:'방콕에서 3시간, 조용한 해변 리조트에서 갖는 팀 인센티브',
         points:['해변 팀빌딩 액티비티','타이 요리 클래스 체험','나이트마켓 자유 저녁'],
         items:['해변 팀빌딩 게임·조별 미션','타이 요리 쿠킹 클래스','시카다 마켓·나이트마켓 탐방','스파 인센티브·시상 만찬'],
         value:'번잡한 관광지를 피해 팀 전원이 집중과 휴식을 함께 가져가는 인센티브 연수' },
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

/* =====================================================================
   ITINERARY_DB / PROGRAM_PRIORITY — script.js에서 이리로 옮겨왔다 (QB).
   옮긴 이유: 관리자 화면(admin.html)이 이 표를 읽어야 직원이 일정을 편집할 수
   있는데, admin.html은 data.js는 싣지만 script.js는 싣지 않는다(견적 엔진이라
   로드되는 순간 고객 화면용 DOM 작업을 시작한다). 표를 admin에 복사해 두면
   같은 목록이 두 벌이 되고, 그게 이 저장소가 여섯 번 당한 결함이다(결함 생성기 ①).
   바로 위 DEST_REC와 성격이 같은 콘텐츠 데이터라 여기가 제자리이기도 하다.

   ⚠ 운영 중 실제로 쓰이는 값은 이 상수가 아니라 **DB의 itinerary_overrides**다
   (요율에서 data.js보다 rate_overrides가 진실인 것과 같다). 여기 값은 오버라이드가
   없을 때의 기본값이고, 관리자 → 일정 관리에서 고친 목적지는 여기 값을 덮어쓴다.
   ===================================================================== */
/* ════════════════════════════════════════════════════════════════════
   일정 데이터베이스 — 목적지별 2가지 추천 코스
   ════════════════════════════════════════════════════════════════════ */
const ITINERARY_DB = {

  /* ─── 일본 도쿄 ────────────────────────────────────────────────── */
  '제주도': [
    {
      title: '제주 친환경 에너지 · 관광산업 벤치마킹 코스',
      subtitle: '카본프리 아일랜드 정책과 관광 인프라 운영을 국내에서 학습',
      highlights: ['제주에너지공사·풍력단지 견학','제주테크노파크 방문','관광 인프라 운영 브리핑','제주 로컬 브랜드 상권 조사'],
      days: [
        { day:1, title:'입도 · 오리엔테이션', am:'김포/김해 출발 · 제주공항 도착', pm:'제주시 시내 이동 · 오리엔테이션 미팅', eve:'환영 만찬 (흑돼지)', tip:'국내선은 출발 1시간 전 도착으로 충분 — 일정에 여유가 생긴다' },
        { day:2, title:'친환경 에너지 정책', am:'제주에너지공사 브리핑 · 풍력발전단지 견학', pm:'카본프리 아일랜드 정책 세션', eve:'현지식 팀 만찬', tip:'공공기관 방문은 공문 3주 전 발송 권장' },
        { day:3, title:'산업 · 창업 생태계', am:'제주테크노파크 방문 · 입주기업 교류', pm:'제주 로컬 브랜드 상권(원도심) 조사', eve:'자유 저녁', tip:'로컬 브랜드 인터뷰는 사전 섭외 시 깊이가 달라진다' },
        { day:4, title:'관광 인프라 · 정리', am:'관광 인프라 운영 브리핑 (리조트·컨벤션)', pm:'연수 성과 공유 세션 · 공항 이동', eve:'귀가', tip:'성수기 항공은 좌석 확보가 관건 — 인원 확정을 서두른다' },
      ],
    },
    {
      title: '제주 조직문화 · 워크숍 연수 코스',
      subtitle: '이동 부담 없이 몰입할 수 있는 국내 거점형 워크숍과 팀 활동',
      highlights: ['리조트 컨퍼런스 세션','오름 트레킹 팀 활동','해녀문화·로컬 체험','조별 성과 발표'],
      days: [
        { day:1, title:'입도 · 아이스브레이킹', am:'제주공항 도착 · 숙소 체크인', pm:'아이스브레이킹 워크숍', eve:'환영 만찬', tip:'국내라 당일 오전 출발·오후 세션 시작이 가능하다' },
        { day:2, title:'집중 워크숍', am:'리조트 컨퍼런스룸 전략 세션', pm:'조별 과제 워크숍 · 중간 발표', eve:'팀 만찬', tip:'회의실 음향·스크린은 전날 확인' },
        { day:3, title:'야외 팀 활동', am:'오름 트레킹 · 조별 미션', pm:'해녀문화·로컬 공방 체험', eve:'자유 저녁', tip:'우천 대체안(실내 체험) 미리 확보' },
        { day:4, title:'성과 공유 · 귀가', am:'팀별 성과 발표 (3분)', pm:'공항 이동', eve:'귀가', tip:'렌터카가 아니면 버스 배차를 미리 확정' },
      ],
    },
  ],

  '도쿄': [
    {
      title: '도쿄 혁신 산업 · IT 벤치마킹 코스',
      subtitle: '일본 첨단제조업과 디지털 전환 선도 기업 현장 탐방',
      highlights: ['도요타 산업기술기념관','소니 이노베이션 센터','시부야 스타트업 생태계','도쿄 스마트시티 플래너 방문'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'나리타/하네다 도착, 호텔 체크인 및 주변 정비', pm:'시부야·하라주쿠 도보 탐방, 오리엔테이션 미팅', eve:'환영 만찬 (현지 특식)', tip:'일본 비즈니스 에티켓 사전 교육 권장 — 명함 교환 예절 포함' },
        { day:2, title:'첨단 제조업 현장', am:'도요타 산업기술기념관 견학 (나고야 당일치기 가능)', pm:'첨단 생산 라인 견학, 현지 엔지니어 Q&A 세션', eve:'현지 특산 만찬 (히츠마부시 등)', tip:'영문 팸플릿 2주 전 사전 요청 필요' },
        { day:3, title:'IT & 디지털 혁신', am:'소니 파크 & 이노베이션 센터 방문', pm:'롯폰기 모리 빌딩 · 디지털 아트 뮤지엄 체험', eve:'롯폰기 이자카야 네트워킹 저녁', tip:'모리 미술관 기획전 단체 사전 예약 필수' },
        { day:4, title:'스타트업 · 플랫폼 기업', am:'시부야 스트림 IT 기업 방문 미팅', pm:'시부야 스카이 전망 · 스타트업 네트워킹 세션', eve:'신주쿠 팀 만찬 및 자유 시간', tip:'명함 100장 이상 지참 권장' },
        { day:5, title:'도시 인프라 · 귀국', am:'도쿄 도청 전망대 · 신주쿠 도시계획관 방문', pm:'면세 쇼핑 · 공항 이동', eve:'귀국 탑승', tip:'출발 3시간 전 공항 도착 권장' },
      ],
    },
    {
      title: '도쿄 리더십 & 조직문화 심화 코스',
      subtitle: '일본식 경영철학과 팀빌딩 선진 사례를 통한 조직역량 개발',
      highlights: ['닛케이 리더십 세미나','도쿄대 경영 특강','대기업 인사담당자 교류 미팅','야외 팀빌딩 워크숍'],
      days: [
        { day:1, title:'입국 · 팀빌딩 오리엔테이션', am:'도착 · 호텔 체크인', pm:'아이스브레이킹 워크숍 (퍼실리테이터 진행)', eve:'팀 환영 만찬', tip:'워크숍 진행 강사 2개월 전 컨펌 필요' },
        { day:2, title:'일본 경영철학 세미나', am:'닛케이 컨퍼런스룸 리더십 특강 (교세라 아메바 경영 사례)', pm:'현장 기업 인사담당자 교류 미팅', eve:'미나토마치 레스토랑 · 자유 시간', tip:'특강 강사 3개월 전 섭외 권장' },
        { day:3, title:'기업 현장 방문', am:'도요타 · 혼다 홍보관 방문', pm:'현지 중간관리자 그룹 교류 세션', eve:'신주쿠 이자카야 팀 만찬', tip:'사전 질문지 준비 시 교류 효과 극대화' },
        { day:4, title:'팀빌딩 · 문화 체험', am:'아사쿠사 전통 공예 체험 (도장·부채 만들기)', pm:'스미다 리버 크루즈 팀 액티비티', eve:'전통 료칸 또는 호텔 특식', tip:'야외 활동 날씨 대비 복장 필수' },
        { day:5, title:'성과 공유 · 귀국', am:'연수 성과 발표 세션 (팀별 3분 발표)', pm:'면세 쇼핑 · 귀국 이동', eve:'귀국', tip:'발표 PPT 사전 준비 권장' },
      ],
    },
    {
      title: '도쿄 일본어 집중 & 비즈니스 커뮤니케이션 연수',
      subtitle: '현지 어학원 집중 수업 + 기업 실습으로 실전 비즈니스 일본어 역량 강화',
      highlights: ['일본어 집중반 수업 (4시간/일)','비즈니스 경어·이메일 집중 실습','현지 기업 일본어 명함 교환 체험','원어민 튜터 1:1 세션'],
      days: [
        { day:1, title:'입국 · 레벨 배치 테스트', am:'하네다/나리타 도착 · 호텔 체크인', pm:'어학원 오리엔테이션 · 레벨 배치 테스트 · 반 배정', eve:'환영 만찬 — 이자카야 일본어 주문 실습', tip:'테스트 답안 실력대로 솔직하게 작성 — 적정 레벨이 학습 효과를 결정' },
        { day:2, title:'집중 어학 수업 1일차', am:'어학원 집중반 (문법·발음·기초 회화 4시간)', pm:'원어민 튜터 1:1 롤플레이 세션', eve:'편의점·마트 자율 쇼핑 — 일본어만 사용 미션', tip:'수업 내용 당일 복습 30분이 실력을 결정' },
        { day:3, title:'비즈니스 일본어 실습', am:'어학원 비즈니스 표현 집중 수업 (경어·이메일·전화응대)', pm:'현지 기업 방문 — 일본어 명함 교환·자기소개 실습', eve:'팀 저녁 — 전원 일본어로 메뉴 주문 도전', tip:'비즈니스 경어(敬語) 핵심 10문장 암기 권장' },
        { day:4, title:'문화 몰입 현장 체험', am:'아사쿠사 전통 거리 — 일본어 쇼핑·길 묻기 실습', pm:'NHK 방송국 견학 또는 현지인 프리토킹 교류 세션', eve:'신주쿠 팀 네트워킹 — 현지인과 일본어 대화 도전', tip:'틀려도 괜찮다 — 도전 횟수가 실력 향상의 핵심' },
        { day:5, title:'미니 발표 · 귀국', am:'일본어 미니 프레젠테이션 발표 (팀별 3분 · 현지어로 진행)', pm:'아사쿠사 면세 기념품 쇼핑 · 공항 이동', eve:'귀국', tip:'귀국 후 단어장·복습 자료 꾸준히 활용 권장' },
      ],
    },
  ],

  /* ─── 오사카 ────────────────────────────────────────────────────── */
  '오사카': [
    {
      title: '오사카 첨단 제조 · 물류 산업연수 코스',
      subtitle: '간사이 지역 제조업 혁신 현장과 물류 인프라 벤치마킹',
      highlights: ['파나소닉 뮤지엄 견학','오사카대학 방문·강의','간사이 물류 혁신 센터 투어','중소 제조기업 현장 견학'],
      days: [
        { day:1, title:'입국 · 오사카 오리엔테이션', am:'간사이공항(KIX) 도착, 호텔 체크인', pm:'도톤보리·신사이바시 도보 탐방, 오리엔테이션 미팅', eve:'오코노미야키 환영 만찬', tip:'이코카(ICOCA) 교통카드 첫날 구매 권장' },
        { day:2, title:'첨단 제조업 현장', am:'파나소닉 뮤지엄(오사카 카도마) 견학', pm:'오사카 과학기술센터 방문·산업 브리핑', eve:'우메다 팀 만찬', tip:'파나소닉 뮤지엄 단체 견학은 3주 전 사전 예약 필요' },
        { day:3, title:'학술 · 물류 산업', am:'오사카대학 캠퍼스 방문 · 특강', pm:'간사이 물류 혁신 센터 견학', eve:'신세카이 쿠시카츠 저녁', tip:'대학 방문 공문은 4주 전 발송 권장' },
        { day:4, title:'중소기업 · 바이오 클러스터', am:'오사카 중소 제조기업 현장 견학', pm:'바이오 클러스터 산업단지 투어', eve:'도톤보리 야경 자유 시간', tip:'방문 기업 명단은 최소 2주 전 확정 필요' },
        { day:5, title:'정리 · 귀국', am:'오사카성 역사 탐방', pm:'신사이바시 면세 쇼핑, 공항 이동', eve:'귀국', tip:'간사이공항 출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '오사카 미식 · 엔터테인먼트 팀빌딩 코스',
      subtitle: '유니버설 스튜디오와 도톤보리 먹거리로 채우는 팀 화합 연수',
      highlights: ['유니버설 스튜디오 재팬 전일 체험','도톤보리 야식 투어','오사카성 역사 탐방','팀 타코야키·오코노미야키 요리교실'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'간사이공항(KIX) 도착, 호텔 체크인', pm:'신사이바시 아이스브레이킹 도보 투어', eve:'오코노미야키 팀 환영 만찬', tip:'우천 대비 우산·우비 준비 권장' },
        { day:2, title:'유니버설 스튜디오 재팬', am:'유니버설 스튜디오 재팬 입장·자유 이용', pm:'유니버설 스튜디오 재팬 자유 이용 계속', eve:'유니버설 시티워크 팀 저녁', tip:'익스프레스 패스 사전 구매 시 대기시간 대폭 단축' },
        { day:3, title:'오사카성 · 시장 탐방', am:'오사카성 천수각·정원 역사 탐방', pm:'구로몬 시장 먹거리 탐방', eve:'도톤보리 야식 투어(타코야키·오코노미야키)', tip:'구로몬 시장은 현금 결제 위주 — 현금 소액권 준비' },
        { day:4, title:'팀 요리교실 · 문화체험', am:'팀 타코야키·오코노미야키 요리교실', pm:'신세카이·츠텐카쿠 레트로 거리 탐방', eve:'팀 회식 및 성과 공유', tip:'요리교실은 최소 인원 기준 있어 사전 예약 필수' },
        { day:5, title:'쇼핑 · 귀국', am:'신사이바시스지 상점가 자유 쇼핑', pm:'간사이공항 이동', eve:'귀국', tip:'면세 쇼핑 한도 사전 확인 권장' },
      ],
    },
  ],

  /* ─── 후쿠오카 ──────────────────────────────────────────────────── */
  '후쿠오카': [
    {
      title: '후쿠오카 한-일 비즈니스 · 스타트업 교류 코스',
      subtitle: '한국과 가장 가까운 일본 비즈니스 허브, 규슈 산업·스타트업 현장 탐방',
      highlights: ['규슈대학 방문·강의','후쿠오카 그로스넥스트 스타트업 탐방','한-일 비즈니스 교류 세미나','규슈 제조업 현장 견학'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'후쿠오카공항 도착, 호텔 체크인 (한국에서 최단 1시간대 접근)', pm:'하카타 구시가지 도보 탐방, 오리엔테이션 미팅', eve:'모츠나베 환영 만찬', tip:'후쿠오카공항은 시내와 가까워 이동시간 절약 가능' },
        { day:2, title:'학술 · 산업 교류', am:'규슈대학 이토 캠퍼스 방문 · 특강', pm:'한-일 비즈니스 교류 세미나 (현지 진출 한국기업 사례)', eve:'나카스 포장마차 거리 저녁', tip:'대학 방문 공문은 4주 전 발송 권장' },
        { day:3, title:'스타트업 생태계', am:'후쿠오카 그로스넥스트(옛 초등학교 리모델링 스타트업 지원거점) 탐방', pm:'규슈 IT 밸리 현장 방문', eve:'덴진 팀 만찬', tip:'그로스넥스트 견학 신청은 2주 전 필요' },
        { day:4, title:'제조업 현장', am:'규슈 제조업 클러스터 현장 견학', pm:'스마트시티 정책 브리핑', eve:'하카타 야타이 포장마차 팀 저녁', tip:'야타이는 현금 결제 위주 — 소액권 준비' },
        { day:5, title:'정리 · 귀국', am:'다자이후텐만구 학문의 신 참배', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'후쿠오카공항 출발 2시간 전 도착으로도 충분(소형 공항)' },
      ],
    },
    {
      title: '후쿠오카 온천 · 미식 힐링 팀빌딩 코스',
      subtitle: '야타이 포장마차와 온천으로 채우는 재충전형 팀 화합 연수',
      highlights: ['하카타 야타이 포장마차 팀 저녁','유후인 온천 반나절 투어','벳부 지옥온천 순례','다자이후 신사 방문'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'후쿠오카공항 도착, 호텔 체크인', pm:'덴진 아이스브레이킹 도보 투어', eve:'하카타 라멘 환영 만찬', tip:'하카타 돈코츠 라멘 맛집 리스트 사전 공유 권장' },
        { day:2, title:'유후인 온천 투어', am:'유후인 이동 (버스 약 2시간)', pm:'유후인 온천 반나절 체험 · 유노츠보 거리 산책', eve:'료칸 가이세키 만찬', tip:'유후인 당일치기 시 이동시간 고려해 이른 출발 권장' },
        { day:3, title:'벳부 온천 순례', am:'벳부 지옥온천 순례(지고쿠메구리) 체험', pm:'벳부 로프웨이 전망 · 자유 시간', eve:'벳부 현지 해산물 저녁', tip:'지옥온천은 관람용으로 입욕은 별도 시설 이용' },
        { day:4, title:'전통문화 · 야타이', am:'다자이후텐만구 신사 참배 · 전통거리 탐방', pm:'모모치 해변 산책 · 팀 자유 활동', eve:'하카타 야타이 포장마차 팀 저녁', tip:'다자이후텐만구는 학문의 신을 모시는 유서 깊은 신사' },
        { day:5, title:'쇼핑 · 귀국', am:'덴진 지하상가 자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'후쿠오카공항 면세점 규모는 크지 않아 미리 쇼핑 권장' },
      ],
    },
  ],

  '가고시마': [
    {
      title: '가고시마 화산·에너지 산업 벤치마킹 코스',
      subtitle: '활화산과 공존하는 도시의 방재·지열에너지·소재산업 현장 탐방',
      highlights: ['사쿠라지마 화산 방재센터','이부스키 지열 활용 현장','가고시마항 물류 인프라','현지 제조업 클러스터 견학'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'가고시마공항 도착, 호텔 체크인', pm:'덴몬칸 시내 도보 탐방, 오리엔테이션 미팅', eve:'흑돼지 샤부샤부 환영 만찬', tip:'공항-시내 리무진 약 40분 — 단체 예약 권장' },
        { day:2, title:'화산 방재 · 도시 인프라', am:'사쿠라지마 페리 이동 · 화산 방재센터 견학', pm:'유노히라 전망대에서 도시 방재 구조 브리핑', eve:'현지식 팀 만찬', tip:'화산재 대비 마스크·안경 준비 권장' },
        { day:3, title:'지열 에너지 · 소재산업', am:'이부스키 지열 발전·모래찜질 현장 시찰', pm:'현지 제조업(전자부품·소재) 클러스터 견학', eve:'온천 료칸 숙박 및 휴식', tip:'료칸 만찬은 인원 확정 2주 전 통보 필요' },
        { day:4, title:'역사 · 산업유산', am:'센간엔 · 쇼코슈세이칸(근대 산업유산) 견학', pm:'가고시마항 물류 인프라 시찰', eve:'덴몬칸 팀 저녁 · 자유 시간', tip:'산업유산은 단체 해설 사전 신청 시 이해도가 크게 오른다' },
        { day:5, title:'정리 · 귀국', am:'연수 성과 공유 세션', pm:'특산품 쇼핑 · 공항 이동', eve:'귀국', tip:'흑초·소주는 기내 반입 제한 확인' },
      ],
    },
    {
      title: '가고시마 조직문화 · 팀빌딩 연수 코스',
      subtitle: '온천 리조트를 거점으로 한 몰입형 워크숍과 자연 속 팀 활동',
      highlights: ['이부스키 온천 리조트 워크숍','사쿠라지마 야외 팀 활동','현지 기업 교류 세션','지역 전통 공예 체험'],
      days: [
        { day:1, title:'입국 · 아이스브레이킹', am:'가고시마공항 도착 · 호텔 체크인', pm:'아이스브레이킹 워크숍 (퍼실리테이터 진행)', eve:'환영 만찬', tip:'워크숍 강사 2개월 전 컨펌 권장' },
        { day:2, title:'몰입 워크숍', am:'이부스키 이동 · 리조트 컨퍼런스룸 세션', pm:'조별 과제 워크숍 · 중간 발표', eve:'온천 후 팀 만찬', tip:'리조트 회의실은 성수기 3개월 전 선점 필요' },
        { day:3, title:'야외 팀 활동', am:'사쿠라지마 트레킹 · 조별 미션', pm:'지역 전통 공예(사쓰마 도자기) 체험', eve:'현지식 저녁', tip:'야외 활동 우천 대체안 사전 확보' },
        { day:4, title:'현지 교류', am:'현지 기업 방문 · 인사담당자 교류', pm:'조별 성과 정리 세션', eve:'덴몬칸 자유 저녁', tip:'사전 질문지 준비 시 교류 효과가 크게 오른다' },
        { day:5, title:'성과 공유 · 귀국', am:'팀별 성과 발표 (3분)', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'발표 자료는 출국 전 미리 준비' },
      ],
    },
  ],


  /* ─── 나고야 ────────────────────────────────────────────────────── */
  '나고야': [
    {
      title: '나고야 자동차·제조업 혁신 벤치마킹 코스',
      subtitle: '세계 자동차 산업의 심장부, 도요타 생산방식과 제조 클러스터 현장 학습',
      highlights: ['도요타 산업기술기념관 견학','나고야대학 캠퍼스 방문','항공·자동차 부품 클러스터 탐방','현지 중소 제조기업 견학'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'주부국제공항 도착, 호텔 체크인', pm:'나고야역·오아시스21 도보 탐방, 오리엔테이션 미팅', eve:'히츠마부시 환영 만찬', tip:'주부국제공항은 나고야 시내와 철도로 약 30분 거리' },
        { day:2, title:'자동차 산업 현장', am:'도요타 산업기술기념관 견학 · 심층 강의', pm:'자동차 부품 중소기업 현장 견학', eve:'사카에 지역 팀 만찬', tip:'박물관 단체 견학은 3주 전 사전 예약 필요' },
        { day:3, title:'학술 · 항공산업', am:'나고야대학 캠퍼스 방문 · 특강', pm:'항공·방위산업 전시관 탐방(미쓰비시중공업 등 항공기 부품산업 집적지)', eve:'오스 상점가 저녁 자유시간', tip:'대학 방문 공문은 4주 전 발송 권장' },
        { day:4, title:'제조업 클러스터', am:'나고야 제조업 클러스터 현장 투어', pm:'현지 부품기업 생산라인 견학', eve:'나고야 명물 데바사키(닭날개튀김) 만찬', tip:'생산라인 견학 시 안전화·보호안경 필요할 수 있음' },
        { day:5, title:'정리 · 귀국', am:'나고야성 천수각 역사 탐방', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'주부국제공항 출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '나고야 역사·미식 팀빌딩 코스',
      subtitle: '나고야성과 히츠마부시로 채우는 전통과 미식의 팀 화합 연수',
      highlights: ['나고야성 내부 투어','히츠마부시 전통 장어 만찬','메이지무라 레트로 체험','오스 상점가 쇼핑'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'주부국제공항 도착, 호텔 체크인', pm:'사카에 아이스브레이킹 도보 투어', eve:'미소카츠 환영 만찬', tip:'나고야 명물 미소카츠·데바사키 사전 소개 권장' },
        { day:2, title:'나고야성 역사 투어', am:'나고야성 천수각·혼마루고텐 내부 투어', pm:'나고야성 정원 산책 · 팀 기념 촬영', eve:'히츠마부시 전통 장어 만찬', tip:'히츠마부시는 3가지 방식으로 즐기는 나고야 명물' },
        { day:3, title:'메이지무라 레트로 체험', am:'메이지무라(이누야마) 이동 · 근대 건축물 탐방', pm:'메이지무라 레트로 거리 체험 · 팀 활동', eve:'이누야마 현지 저녁', tip:'메이지무라는 규모가 커 반나절 이상 소요' },
        { day:4, title:'쇼핑·문화 탐방', am:'오스 상점가 쇼핑 · 오스칸논 사찰 참배', pm:'나고야 TV타워·히사야오도리 공원 산책', eve:'팀 회식 및 성과 공유', tip:'오스 상점가는 코스프레·전자상가로도 유명' },
        { day:5, title:'자유시간 · 귀국', am:'나고야역 자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'주부국제공항 면세점 규모 확인 후 쇼핑 계획 권장' },
      ],
    },
  ],

  /* ─── 삿포로 ────────────────────────────────────────────────────── */
  '삿포로': [
    {
      title: '삿포로 농업·식품 산업혁신 연수 코스',
      subtitle: '일본 최대 식품 산업 기지 홋카이도의 농업 6차산업화 현장 학습',
      highlights: ['홋카이도대학 농학부 방문·강의','식품 6차산업화 현장 견학','식품 가공·콜드체인 견학','유제품 생산 현장 방문'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'신치토세공항 도착, 삿포로 시내 호텔 체크인', pm:'오도리공원·삿포로TV타워 도보 탐방', eve:'삿포로 라멘 환영 만찬', tip:'신치토세공항~삿포로 시내 철도 약 40분' },
        { day:2, title:'농업 학술 · 연구', am:'홋카이도대학 농학부 캠퍼스 방문 · 특강', pm:'첨단 농업 연구시설 투어', eve:'스스키노 팀 만찬', tip:'대학 방문 공문은 4주 전 발송 권장' },
        { day:3, title:'6차산업화 현장', am:'농업 6차산업화 사례 현장 견학(가공·유통 복합 모델)', pm:'식품 가공·콜드체인 물류센터 견학', eve:'니조시장 인근 해산물 저녁', tip:'견학 시설별 사전 허가 필요할 수 있음' },
        { day:4, title:'유제품 산업', am:'홋카이도 유제품 생산 현장 방문', pm:'삿포로 맥주박물관 견학 · 시음', eve:'징기스칸(양고기 구이) 팀 만찬', tip:'맥주박물관 시음 프로그램은 사전 예약 권장' },
        { day:5, title:'정리 · 귀국', am:'니조시장 자유 시간', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'신치토세공항 출발 2시간 반 전 도착 권장' },
      ],
    },
    {
      title: '삿포로 설경·미식 힐링 팀빌딩 코스',
      subtitle: '겨울 설경과 게 요리, 맥주로 채우는 재충전형 팀 화합 연수',
      highlights: ['오도리공원·눈 축제 시즌 체험','삿포로 맥주공장 투어','게 요리 특별 만찬','니조시장 해산물 투어'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'신치토세공항 도착, 호텔 체크인', pm:'오도리공원 아이스브레이킹 산책', eve:'게 요리 특별 환영 만찬', tip:'겨울철(1~2월) 방문 시 삿포로 눈 축제 기간과 겹칠 수 있음' },
        { day:2, title:'삿포로 맥주 문화', am:'삿포로 맥주박물관 견학', pm:'맥주 시음·팀 네트워킹', eve:'스스키노 이자카야 팀 저녁', tip:'박물관 견학 후 인근 비어홀에서 생맥주 시음 가능' },
        { day:3, title:'해산물 시장 · 자유활동', am:'니조시장 해산물 시장 투어', pm:'오타루 당일치기(운하·유리공예 거리) — 선택', eve:'해산물 팀 만찬', tip:'오타루는 삿포로에서 열차로 약 40분' },
        { day:4, title:'겨울 액티비티', am:'삿포로 눈 축제 관람 또는 인근 스키장 체험(시즌별)', pm:'팀 스노우 액티비티', eve:'징기스칸 팀 회식', tip:'스키·스노보드 장비는 현지 렌탈 가능' },
        { day:5, title:'쇼핑 · 귀국', am:'다누키코지 상점가 자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'신치토세공항 내 라멘도장·초콜릿공장 견학 코너 추천' },
      ],
    },
  ],

  /* ─── 싱가포르 ─────────────────────────────────────────────────── */
  '싱가포르': [
    {
      title: '싱가포르 스마트네이션 & 공공혁신 코스',
      subtitle: '세계 1위 스마트시티의 정부혁신과 디지털 행정 선진 시스템 탐방',
      highlights: ['정부기술청(GovTech) 방문','주택개발청(HDB) 공공주택 현장','마리나베이 샌즈 인프라','싱가포르 국립대(NUS) 교류'],
      days: [
        { day:1, title:'입국 · 시티 오버뷰', am:'창이공항 도착, 호텔 체크인', pm:'마리나베이 워크 · 가든스 바이 더 베이 탐방', eve:'클라키 부두 환영 만찬', tip:'EZ링크 카드 입국 당일 준비 권장' },
        { day:2, title:'스마트네이션 정책', am:'정부기술청(GovTech) 브리핑 · 디지털 행정 시스템 견학', pm:'국가정보시스템청(SNDGO) 미팅', eve:'차이나타운 · 리버사이드 저녁', tip:'GovTech 방문 신청 2개월 전 필수' },
        { day:3, title:'도시 · 주거 혁신', am:'주택개발청(HDB) 공공주택 단지 현장 방문', pm:'빌딩건설청(BCA) 그린빌딩 정책 브리핑', eve:'오차드 쇼핑 자유 시간', tip:'방문 기관 공문 4주 전 발송 필요' },
        { day:4, title:'글로벌 비즈니스 · 학술', am:'싱가포르 국립대(NUS) 비즈니스스쿨 강의 청강', pm:'원노스 R&D 클러스터 탐방 · 스타트업 미팅', eve:'유니버설 스튜디오 팀 레크리에이션 (선택)', tip:'NUS 방문 허가 4주 전 신청 필요' },
        { day:5, title:'금융·무역 · 귀국', am:'싱가포르 통화청(MAS) 금융박물관 · 마리나베이 금융센터', pm:'면세 쇼핑 · 창이공항 이동', eve:'귀국', tip:'창이공항 면세 쇼핑 시간 여유 있게 계획' },
      ],
    },
    {
      title: '싱가포르 의료·교육·물류 산업연수 코스',
      subtitle: '선진 의료·교육시스템과 세계 2위 항만 물류 인프라 탐방',
      highlights: ['싱가포르종합병원(SGH) 방문','난양공대(NTU) 교류','PSA 항만 물류센터','주롱 산업단지'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'도착 · 호텔 체크인', pm:'리틀인디아 · 아랍스트리트 문화다양성 탐방', eve:'팀 오리엔테이션 만찬', tip:'싱가포르 다민족 문화 사전 이해 권장' },
        { day:2, title:'선진 의료 시스템', am:'싱가포르종합병원(SGH) 시설 견학 · 의료진 미팅', pm:'싱가포르 의료기술청 브리핑', eve:'부기스 · 마리나 지역 저녁', tip:'의료기관 방문 목적서 사전 제출 필수' },
        { day:3, title:'교육 혁신 시스템', am:'난양공대(NTU) 스마트캠퍼스 투어 · 교수 간담회', pm:'싱가포르 교육부(MOE) 정책 브리핑', eve:'홀랜드 빌리지 팀 만찬', tip:'교육부 방문 사전 섭외 2개월 전 필요' },
        { day:4, title:'물류·항만 산업', am:'PSA 싱가포르 항만 물류센터 견학', pm:'주롱 산업단지 첨단제조 현장 방문', eve:'센토사섬 팀 레크리에이션', tip:'PSA 방문 안전화 지참 필요' },
        { day:5, title:'리뷰 · 귀국', am:'연수 총정리 · 성과 공유 발표', pm:'오차드 면세 쇼핑 · 공항 이동', eve:'귀국', tip:'면세 한도 확인 필수' },
      ],
    },
    {
      title: '싱가포르 비즈니스 영어 & 글로벌 커뮤니케이션 집중 연수',
      subtitle: '세계 최고의 영어 비즈니스 환경에서 실전 프레젠테이션·협상 역량 강화',
      highlights: ['British Council 비즈니스 영어 집중반','글로벌 기업 영어 프레젠테이션 실습','원어민 1:1 튜터링','다국적 기업 영어 협상 롤플레이'],
      days: [
        { day:1, title:'입국 · 영어 레벨 평가', am:'창이공항 도착 · 호텔 체크인', pm:'비즈니스 영어 과정 오리엔테이션 · 스피킹 레벨 평가', eve:'마리나베이 환영 만찬 — 영어로만 소통 미션', tip:'싱가포르는 다민족 영어(Singlish) 환경 — 표준 영어 집중 훈련이 핵심' },
        { day:2, title:'비즈니스 영어 집중 수업', am:'British Council / Wall Street English 집중반 (프레젠테이션·이메일 작성)', pm:'원어민 튜터 1:1 발음·스피킹 교정 세션', eve:'클락키 팀 저녁 — 모든 주문 영어로 진행', tip:'수업 중 녹음 허가 후 저녁 복습 권장' },
        { day:3, title:'실전 프레젠테이션 실습', am:'기업 프레젠테이션 영어 표현 집중 훈련', pm:'현지 글로벌 기업(DBS·싱텔 등) 방문 — 영어 비즈니스 미팅 실습', eve:'원노스 클러스터 네트워킹 이벤트 (영어 교류)', tip:'기업 방문 전 발표 스크립트 완성 필수' },
        { day:4, title:'협상·토론 영어 실습', am:'영어 협상 롤플레이 시뮬레이션 (바이어-셀러 구도)', pm:'마리나베이샌즈 전망 · 영어 발표 야외 실습', eve:'가든스 바이 더 베이 · 영어 가이드 투어', tip:'협상 핵심 표현 30문장 사전 숙지 권장' },
        { day:5, title:'영어 발표 경연 · 귀국', am:'팀별 5분 영어 프레젠테이션 경연 (자유 주제)', pm:'오차드 면세 쇼핑 · 창이공항 이동', eve:'귀국', tip:'발표 영상 촬영 후 귀국 후 피드백 활용 권장' },
      ],
    },
  ],

  /* ─── 뉴욕 ─────────────────────────────────────────────────────── */
  '뉴욕': [
    {
      title: '뉴욕 글로벌 비즈니스 · 금융 리더십 코스',
      subtitle: '월스트리트 금융 허브와 실리콘 앨리 혁신 생태계 탐방',
      highlights: ['NYSE 증권거래소 방문','구글·메타 뉴욕 오피스','유엔본부(UN HQ)','컬럼비아대 특강'],
      days: [
        { day:1, title:'입국 · 맨해튼 오리엔테이션', am:'JFK/EWR 도착, 맨해튼 호텔 체크인', pm:'타임스스퀘어 · 하이라인 파크 도보 탐방', eve:'미드타운 레스토랑 환영 만찬', tip:'뉴욕 지하철 메트로카드 첫날 준비 권장' },
        { day:2, title:'금융 허브 탐방', am:'NYSE 뉴욕증권거래소 견학 (사전 예약 필수)', pm:'월스트리트 · 브루클린 브릿지 도보 투어', eve:'로어맨해튼 해산물 레스토랑 만찬', tip:'NYSE 투어 최소 8주 전 신청 필요' },
        { day:3, title:'테크·미디어 혁신', am:'구글 뉴욕 오피스 방문 · 혁신 문화 강의', pm:'허드슨야드 미래도시 개발 현장 탐방', eve:'첼시 갤러리 디스트릭트 · 팀 만찬', tip:'구글 방문 신청 3개월 전 필요' },
        { day:4, title:'국제기관 · 학술', am:'유엔본부(UN HQ) 가이드 투어', pm:'컬럼비아대 교수 초청 강의 (협의 후 확정)', eve:'센트럴파크 · 어퍼웨스트 자유 탐방', tip:'UN 투어 개인 여권 지참 필수' },
        { day:5, title:'문화 · 귀국', am:'메트로폴리탄 미술관(MET) 학술 투어', pm:'면세 쇼핑 (5th Ave) · 공항 이동', eve:'귀국', tip:'JFK 3시간 전 도착 권장 — 보안 대기 시간 고려' },
      ],
    },
    {
      title: '뉴욕 도시재생 · 공공정책 혁신 코스',
      subtitle: '뉴욕시 도시계획과 지속가능 인프라 정책 현장 학습',
      highlights: ['뉴욕시청 정책 브리핑','허드슨야드 도시재생','브루클린 네이비야드','코넬테크 방문'],
      days: [
        { day:1, title:'입국 · 도시 탐방', am:'도착 · 호텔 체크인', pm:'하이라인 파크 (도시재생 성공사례) 현장 견학', eve:'미트패킹 디스트릭트 만찬', tip:'하이라인 무료 입장 — 가이드 북 사전 준비 권장' },
        { day:2, title:'도시행정 · 정책', am:'뉴욕시청(NYC Hall) 방문 · 도시계획과 브리핑', pm:'브롱스 포담대학 도시연구소 세미나', eve:'브루클린 피자 팀 만찬', tip:'시청 방문 신청서 4주 전 제출 필요' },
        { day:3, title:'혁신 허브 탐방', am:'브루클린 네이비야드 산업혁신 단지 견학', pm:'코넬테크(루스벨트섬) 방문 · 연구자 교류', eve:'루프탑 바 뷰잉 팀 네트워킹', tip:'코넬테크 방문 8주 전 신청 필요' },
        { day:4, title:'지속가능 인프라', am:'허드슨야드 친환경 빌딩 · 스마트인프라 탐방', pm:'뉴욕항만청(PANYNJ) 물류 시스템 브리핑', eve:'자유시간 · 브로드웨이 관람 (선택)', tip:'브로드웨이 티켓 4주 전 예약 권장' },
        { day:5, title:'총정리 · 귀국', am:'연수 성과 공유 세션', pm:'쇼핑 · JFK 이동', eve:'귀국', tip:'JFK 수속 최소 3시간 전 도착 필수' },
      ],
    },
    {
      title: '뉴욕 집중 영어 & 아이비리그 캠퍼스 글로벌 연수',
      subtitle: '아이비리그 어학 프로그램 + 맨해튼 실전 비즈니스 영어 몰입',
      highlights: ['컬럼비아대 어학 집중 프로그램','타임스스퀘어 영어 현장 실습','글로벌 기업 영어 미팅','원어민 소그룹 튜터링'],
      days: [
        { day:1, title:'입국 · 캠퍼스 오리엔테이션', am:'JFK 도착 · 맨해튼 숙소 체크인', pm:'컬럼비아대 어학센터 오리엔테이션 · 레벨 배치 테스트', eve:'어퍼웨스트 레스토랑 환영 만찬 — 영어 주문 실습', tip:'뉴욕 영어는 속도가 빠르다 — 적극적으로 "Pardon?" 활용 권장' },
        { day:2, title:'집중 어학 수업', am:'컬럼비아대 어학센터 집중반 (Intensive English Program · 4시간)', pm:'원어민 튜터 소그룹 세션 (뉴욕 현지 영어 관용 표현)', eve:'브루클린 팀 저녁 — 현지 바텐더와 영어 대화 미션', tip:'IEP 수업은 6주 단기 수료증 발급 가능 — 수료증 신청 사전 확인' },
        { day:3, title:'맨해튼 현장 영어 실습', am:'월스트리트 금융 지구 영어 가이드 투어 (현지인 가이드)', pm:'미드타운 글로벌 기업(구글/메타 NY 오피스) 방문 · 영어 Q&A', eve:'타임스스퀘어 뮤지컬 관람 (영어 청취 실습)', tip:'뮤지컬 전 줄거리 영어로 미리 공부 권장 — 청취 이해도 향상' },
        { day:4, title:'영어 협상·프레젠테이션 실습', am:'비즈니스 영어 협상 롤플레이 (컨퍼런스룸 세션)', pm:'센트럴파크 영어 가이드 · 야외 프리스피치 실습', eve:'첼시 마켓 팀 저녁 · 현지인 교류', tip:'협상 표현 — "Let me get back to you on that" 등 실전 문장 30개 준비' },
        { day:5, title:'영어 발표 · 귀국', am:'팀별 5분 영어 프레젠테이션 발표 및 동료 피드백', pm:'5번가 면세 쇼핑 · JFK 이동', eve:'귀국', tip:'귀국 후 Shadow Speaking 연습 습관화 권장' },
      ],
    },
  ],

  /* ─── 파리 ─────────────────────────────────────────────────────── */
  '파리': [
    {
      title: '파리 문화·예술·창의산업 연수 코스',
      subtitle: '세계 문화 수도 파리의 창조경제와 럭셔리 산업 생태계 탐방',
      highlights: ['루브르 박물관 큐레이터 강의','LVMH 본사 방문','파리 디자인 스튜디오 견학','소르본대 특강'],
      days: [
        { day:1, title:'입국 · 파리 오리엔테이션', am:'CDG 공항 도착, 호텔 체크인', pm:'에펠탑 · 샹 드 마르스 도보 탐방', eve:'센강 유람선 디너 크루즈', tip:'나비고 주간 패스 첫날 구입 권장' },
        { day:2, title:'미술·문화유산', am:'루브르 박물관 큐레이터 특별 해설 투어 (사전 예약)', pm:'오르세 미술관 인상파 특별 전시 관람', eve:'마레 지구 현지 레스토랑 만찬', tip:'루브르 단체 큐레이터 해설 6주 전 예약 필수' },
        { day:3, title:'럭셔리·패션 산업', am:'LVMH 혁신 캠퍼스 방문 (요청 기반)', pm:'봉 마르셰 · 갤러리 라파예트 럭셔리 유통 탐방', eve:'생제르맹 데프레 카페 문화 체험', tip:'LVMH 방문은 업계 관련 기관에 한해 가능' },
        { day:4, title:'혁신·스타트업', am:'파리 스테이션F(세계 최대 스타트업 캠퍼스) 투어', pm:'소르본대 교수 초청 강의 (문화경제)', eve:'몽마르트르 예술인 거리 자유 탐방', tip:'Station F 투어 사전 예약 필수' },
        { day:5, title:'역사·건축 · 귀국', am:'베르사유 궁전 역사 투어 (선택)', pm:'면세 쇼핑 · CDG 공항 이동', eve:'귀국', tip:'CDG 공항 수속 3.5시간 전 도착 권장' },
      ],
    },
    {
      title: '파리 지속가능 도시 · 환경정책 연수 코스',
      subtitle: '탄소중립 선도 도시 파리의 친환경 정책과 도시혁신 사례 탐방',
      highlights: ['파리시청 환경정책 브리핑','자전거 공유 시스템(Vélib) 현장','에코쿼티에 친환경 단지','파리협약 기후외교'],
      days: [
        { day:1, title:'입국 · 도시 탐방', am:'도착 · 호텔 체크인', pm:'파리 도보 워킹투어 (역사·도시구조 이해)', eve:'환영 만찬', tip:'편한 워킹화 필수' },
        { day:2, title:'기후·환경 정책', am:'파리시청 환경정책 담당관 브리핑', pm:'클리마투안경 환경국 방문', eve:'바스티유 광장 · 현지 식당 저녁', tip:'환경 정책 관련 사전 자료 준비 권장' },
        { day:3, title:'친환경 인프라', am:'에코쿼티에(생트-비에르주) 친환경 주거단지 현장 방문', pm:'파리 자전거 인프라 (Vélib) 및 지하철 시스템 탐방', eve:'유기농 레스토랑 팀 만찬', tip:'자전거 투어 참가 시 헬멧 지참' },
        { day:4, title:'국제기후외교', am:'UNESCO 본부 방문 · 기후교육 프로그램 견학', pm:'파리협약 이행 연구소 세미나', eve:'센강변 피크닉 팀 어울림', tip:'UNESCO 방문 6주 전 신청 필요' },
        { day:5, title:'학술·귀국', am:'파리정치대학(Sciences Po) 환경정책 특강', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'공항까지 RER B선 이용 시 혼잡 주의' },
      ],
    },
  ],

  /* ─── 로마 ─────────────────────────────────────────────────────── */
  '로마': [
    {
      title: '로마 문화유산 관리 · 명품산업 인사이트 코스',
      subtitle: '인류 문명의 중심 로마에서 문화 자산 관리와 명품 산업 전략 학습',
      highlights: ['라 사피엔자 대학 방문·강의','바티칸 박물관 문화재 관리 강의','이탈리아 명품 산업 세미나','로마 도시재생 프로젝트 견학'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'피우미치노공항(FCO) 도착, 호텔 체크인', pm:'트레비 분수·스페인 계단 도보 탐방', eve:'로마 전통 파스타 환영 만찬', tip:'로마는 소매치기 주의 지역 — 귀중품 관리 당부' },
        { day:2, title:'학술 · 문화재 관리', am:'라 사피엔자 대학(사피엔자 로마대학교) 캠퍼스 방문·특강', pm:'바티칸 박물관 문화재 보존 시스템 강의', eve:'트라스테베레 팀 만찬', tip:'라 사피엔자는 유럽 최대 규모 대학 중 하나 — 방문 공문 6주 전 발송 권장' },
        { day:3, title:'명품 산업 세미나', am:'이탈리아 명품·패션 산업 세미나', pm:'로마 도심 명품 브랜드 매장 · 장인공방 탐방', eve:'스페인 계단 인근 저녁', tip:'세미나 강사 섭외는 6주 전 필요' },
        { day:4, title:'문화유산 현장', am:'콜로세움·로마 포룸 전문 가이드 투어', pm:'로마 도시재생 프로젝트 현장 견학', eve:'이탈리아 쿠킹클래스·와인 페어링', tip:'콜로세움은 사전 예약 필수 — 성수기 최소 4주 전' },
        { day:5, title:'정리 · 귀국', am:'바티칸 시스티나 예배당 관람', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'피우미치노공항 출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '로마 영원의 도시 문화탐방 팀빌딩 코스',
      subtitle: '콜로세움과 파스타로 채우는 유럽 역사 문화 팀 화합 연수',
      highlights: ['콜로세움·로마 포룸 전문 투어','트레비 분수·스페인 계단 자유 탐방','이탈리아 쿠킹클래스·와인 페어링','바티칸 박물관·시스티나 예배당'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'피우미치노공항 도착, 호텔 체크인', pm:'트레비 분수 아이스브레이킹 도보 투어(동전 던지기 미션)', eve:'로마 전통 카르보나라 환영 만찬', tip:'트레비 분수는 저녁 조명 시간대 방문 추천' },
        { day:2, title:'콜로세움 · 포룸 투어', am:'콜로세움 프라이빗 가이드 투어', pm:'로마 포룸·팔라티노 언덕 역사 탐방', eve:'팀 만찬', tip:'콜로세움 투어는 그룹 사전 예약 필수' },
        { day:3, title:'바티칸 투어', am:'바티칸 박물관 가이드 투어', pm:'시스티나 예배당·성 베드로 대성당 관람', eve:'보르고 지역 팀 저녁', tip:'바티칸 복장 규정 — 어깨·무릎 가리기 필수' },
        { day:4, title:'미식 체험', am:'스페인 계단·포폴로 광장 자유 탐방', pm:'이탈리아 쿠킹클래스(파스타·티라미수 만들기)', eve:'와인 페어링 팀 만찬', tip:'쿠킹클래스는 최소 인원 기준 있어 사전 예약 필요' },
        { day:5, title:'자유시간 · 귀국', am:'캄포 데 피오리 시장 자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'피우미치노공항 출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 독일 ─────────────────────────────────────────────────────── */
  '독일': [
    {
      title: '독일 제조업 4.0 · 산업혁신 벤치마킹 코스',
      subtitle: '독일 히든챔피언 기업과 인더스트리 4.0 스마트팩토리 현장 탐방',
      highlights: ['지멘스 스마트팩토리 암베르크','BMW 뮌헨 본사','프라운호퍼 연구소','하노버 메세 산업전시'],
      days: [
        { day:1, title:'입국 · 뮌헨 오리엔테이션', am:'뮌헨 공항 도착, 호텔 체크인', pm:'마리엔 광장 · 구시가지 역사 탐방', eve:'비어가든 환영 만찬 (현지 맥주 문화 체험)', tip:'독일어 기초 인사말 준비 권장 — Guten Tag 등' },
        { day:2, title:'자동차 산업 심층', am:'BMW 뮌헨 본사 · 공장 투어 (사전 예약 필수)', pm:'BMW 박물관 · 미래 모빌리티 전시 관람', eve:'슈바빙 레스토랑 팀 만찬', tip:'BMW 공장 투어 4개월 전 예약 필수 — 안전화 지참' },
        { day:3, title:'스마트팩토리 현장', am:'지멘스 암베르크 디지털 공장 견학 (세계 최고 자동화율)', pm:'현장 엔지니어 Q&A · 인더스트리 4.0 강의', eve:'레겐스부르크 중세도시 탐방', tip:'지멘스 방문 사전 신청 및 NDA 서명 필요할 수 있음' },
        { day:4, title:'연구소 · 혁신기관', am:'프라운호퍼 응용연구소 방문 · 연구자 교류', pm:'뮌헨공대(TUM) 캠퍼스 투어 및 교수 간담회', eve:'잉글리셔 가르텐 팀 산책 · 저녁', tip:'TUM 방문 허가 4주 전 신청 필요' },
        { day:5, title:'역사·문화 · 귀국', am:'다하우 유적지 또는 노이슈반슈타인성 탐방 (선택)', pm:'쇼핑 · 뮌헨 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '독일 베를린 스타트업 · 사회혁신 연수 코스',
      subtitle: '유럽 최대 스타트업 허브 베를린의 혁신 생태계와 사회적 기업 탐방',
      highlights: ['팩토리 베를린 스타트업 캠퍼스','베를린 스타트업 엑셀러레이터','사회혁신기관 방문','장벽 기념관 역사교육'],
      days: [
        { day:1, title:'입국 · 베를린 탐방', am:'베를린 BER 공항 도착, 호텔 체크인', pm:'브란덴부르크 문 · 포츠담 광장 오리엔테이션', eve:'미테 지구 팀 만찬', tip:'베를린 교통카드 AB존 준비 권장' },
        { day:2, title:'스타트업 생태계', am:'팩토리 베를린(Factory Berlin) 스타트업 캠퍼스 투어', pm:'베를린 스타트업 엑셀러레이터 미팅 · 피칭 세션 참관', eve:'크로이츠베르크 힙스터 레스토랑 저녁', tip:'팩토리 베를린 방문 4주 전 예약 필요' },
        { day:3, title:'사회혁신 · 사회적기업', am:'베를린 사회적기업 방문 · 지역사회 혁신 모델 탐방', pm:'독일 연방노동사회부(BMAS) 브리핑', eve:'동베를린 문화지구 프리드리히샤인 탐방', tip:'사회부 방문 공문 6주 전 필요' },
        { day:4, title:'역사·기억 교육', am:'베를린 장벽 기념관 · 체크포인트 찰리 역사 현장 방문', pm:'유대박물관 역사 특별 투어', eve:'해크셔마르크트 팀 만찬', tip:'역사 현장 방문 사전 자료 배포 권장' },
        { day:5, title:'총정리 · 귀국', am:'연수 성과 공유 발표 세션', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'BER 공항 수속 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 괌 ───────────────────────────────────────────────────────── */
  '괌': [
    {
      title: '괌 MICE · 자유무역 인프라 연수 코스',
      subtitle: '미국령 태평양 거점 괌의 MICE 산업과 글로벌 비즈니스 환경 탐구',
      highlights: ['괌 관광청 MICE 산업 현황 강의','괌대학교(UOG) 방문·교류','괌 자유무역지역 현장 견학','미국령 행정 시스템 브리핑'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'괌국제공항(GUM) 도착, 투몬 지역 호텔 체크인', pm:'투몬베이 도보 탐방, 오리엔테이션 미팅', eve:'차모로 현지식 환영 만찬', tip:'괌은 미국령 — 무비자 입국(ESTA/K-ETA 등 사전 확인 필요)' },
        { day:2, title:'MICE 산업 현장', am:'괌 관광청 MICE 산업 현황 브리핑', pm:'괌 프리미어 아울렛(GPO) 인근 상업지구 시찰', eve:'투몬 팀 만찬', tip:'관광청 브리핑은 4주 전 사전 신청 권장' },
        { day:3, title:'학술 교류', am:'괌대학교(University of Guam) 캠퍼스 방문 · 교류 프로그램', pm:'괌대 국제교류센터 미팅', eve:'하갓냐 지역 저녁', tip:'UOG 캠퍼스 투어는 사전 예약제로 운영(주중 평일)' },
        { day:4, title:'자유무역 · 행정 시스템', am:'괌 자유무역지역 현장 견학', pm:'미국령 행정 시스템 브리핑(괌 정부기관)', eve:'투몬 선셋 팀 만찬', tip:'정부기관 방문은 여권 지참 필수' },
        { day:5, title:'정리 · 귀국', am:'투 러버스 포인트 전망대 방문', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'괌국제공항 출발 2시간 반 전 도착 권장' },
      ],
    },
    {
      title: '괌 해양 어드벤처 팀빌딩 코스',
      subtitle: '태평양 파란 바다에서 즐기는 스릴 만점 팀 결속 연수',
      highlights: ['투몬베이 스카이다이빙·패러세일링','건비치 스쿠버다이빙·스노클링','괌 선셋 크루즈 팀 만찬','차모로 야시장 자유 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'괌국제공항 도착, 투몬 호텔 체크인', pm:'투몬베이 아이스브레이킹 비치 산책', eve:'차모로 바비큐 환영 만찬', tip:'괌은 미국 달러 사용 — 환전 사전 준비 권장' },
        { day:2, title:'해양 스릴 액티비티', am:'투몬베이 패러세일링 체험', pm:'스카이다이빙 체험(선택, 별도 예약)', eve:'투몬 팀 저녁', tip:'스카이다이빙은 사전 예약 및 체중 제한 확인 필요' },
        { day:3, title:'다이빙 · 스노클링', am:'건비치 스쿠버다이빙 PADI 입문 체험', pm:'스노클링 자유 시간', eve:'괌 선셋 크루즈 팀 만찬', tip:'다이빙 전날 금주 권장' },
        { day:4, title:'문화 · 야시장', am:'투 러버스 포인트 전망대 방문', pm:'세스나 경비행기 투어(선택)', eve:'차모로 빌리지 야시장 자유 탐방(수요일 야시장 운영)', tip:'차모로 야시장은 매주 수요일 저녁 운영' },
        { day:5, title:'자유시간 · 귀국', am:'투몬 리조트 자유 시간', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'괌국제공항 출발 2시간 반 전 도착 권장' },
      ],
    },
  ],

  /* ─── 시드니 ────────────────────────────────────────────────────── */
  '시드니': [
    {
      title: '시드니 환경·지속가능 도시 정책 코스',
      subtitle: '세계 선도 수준의 호주 환경정책과 친환경 도시 인프라 현장 탐방',
      highlights: ['NSW주 환경부 정책 브리핑','시드니대 지속가능 연구소','그린빌딩 현장 방문','해양생태계 보전 프로그램'],
      days: [
        { day:1, title:'입국 · 시드니 오리엔테이션', am:'시드니 공항 도착, 호텔 체크인', pm:'오페라하우스 · 하버브릿지 도보 탐방', eve:'록스(The Rocks) 환영 만찬 (호주 전통 식재료)', tip:'오팔 카드 첫날 준비 권장' },
        { day:2, title:'환경정책 브리핑', am:'NSW주 환경부(DCCEEW) 정책 담당관 미팅', pm:'시드니 그린 인프라스트럭처 현장 탐방 (달링하버)', eve:'달링하버 리버뷰 저녁', tip:'NSW 환경부 방문 6주 전 신청 필요' },
        { day:3, title:'학술 · 연구기관', am:'시드니대(USYD) 지속가능연구소 세미나 참가', pm:'CSIRO 환경연구소 방문 · 연구자 교류', eve:'뉴타운 힙한 팀 만찬', tip:'CSIRO 방문 사전 승인 4주 필요' },
        { day:4, title:'해양·생태 보전', am:'시드니 수족관 보전 프로그램 전문가 강의', pm:'맨리 비치 해양생태 현장학습', eve:'맨리 해변 선셋 팀 어울림', tip:'선크림·선글라스 필수 — 자외선 지수 매우 높음' },
        { day:5, title:'성과 공유 · 귀국', am:'연수 총정리 발표 세션', pm:'QVB 쇼핑 · 공항 이동', eve:'귀국', tip:'시드니 공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '시드니 첨단 의료·연구 산업연수 코스',
      subtitle: '호주 최고 수준의 의료기술 및 바이오 연구기관 탐방',
      highlights: ['로얄프린스알프레드병원 방문','마운트시나이 메디컬 센터','웨스트미드 의학연구소','시드니대 의과대학'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'도착 · 호텔 체크인', pm:'시티투어 · 오리엔테이션 브리핑', eve:'서큘러키 팀 만찬', tip:'의료기관 방문 목적서 사전 준비 필수' },
        { day:2, title:'선진 병원 시스템', am:'로얄프린스알프레드병원(RPA) 견학 · 의료진 간담회', pm:'세인트빈센트병원 의료 혁신 시스템 브리핑', eve:'글리브 레스토랑 팀 저녁', tip:'병원 방문 사전 허가서 2개월 전 필요' },
        { day:3, title:'바이오·연구기관', am:'웨스트미드 의학연구소 방문 · 연구자 교류', pm:'건강의학연구위원회(NHMRC) 정책 브리핑', eve:'뉴타운 라이브뮤직 팀 저녁', tip:'연구소 방문 사전 승인 6주 필요' },
        { day:4, title:'학술 · 교육기관', am:'시드니대 의과대학 캠퍼스 투어 · 교수 강의', pm:'UTS 헬스테크 허브 방문', eve:'달링하버 팀 레크리에이션', tip:'대학 방문 4주 전 신청 필요' },
        { day:5, title:'총정리 · 귀국', am:'연수 성과 공유 발표', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'공항 3시간 전 도착 권장' },
      ],
    },
    {
      title: '시드니 영어 집중 & 호주 글로벌 환경 몰입 연수',
      subtitle: 'TAFE NSW / IH Sydney 어학 집중 프로그램으로 생활 영어·비즈니스 영어 완성',
      highlights: ['IH Sydney 비즈니스 영어 집중반','시드니대 영어 특강 청강','하버 브릿지 영어 가이드 투어','원어민 홈스테이 문화 교류'],
      days: [
        { day:1, title:'입국 · 어학원 오리엔테이션', am:'시드니 킹스포드스미스 공항 도착 · 호텔 체크인', pm:'IH Sydney / TAFE NSW 오리엔테이션 · 영어 레벨 테스트', eve:'서큘러키 디너 — 호주식 영어(Aussie English) 체험', tip:'호주 영어는 억양이 강하다 — 여행 전 호주 팟캐스트 청취 권장' },
        { day:2, title:'영어 집중 수업 1일차', am:'IH Sydney 비즈니스 영어 집중반 (4시간 — 프레젠테이션·이메일)', pm:'원어민 튜터 소그룹 스피킹 교정 세션', eve:'뉴타운 카페 거리 — 바리스타와 영어 대화 미션', tip:'아침 30분 BBC/ABC 뉴스 청취 습관 → 수업 이해도 30% 향상' },
        { day:3, title:'호주 현장 영어 실습', am:'시드니 오페라하우스 · 하버 브릿지 영어 가이드 투어', pm:'달링하버 글로벌 기업 방문 · 영어 비즈니스 미팅 실습', eve:'팀 BBQ 디너 — 호주식 야외 문화 체험', tip:'하버 브릿지 클라임 체험 별도 예약 권장 (약 3.5시간)' },
        { day:4, title:'대학 캠퍼스 영어 체험', am:'시드니대(USYD) 캠퍼스 투어 · 교수 영어 특강 청강', pm:'맨리 비치 야외 영어 스피치 실습 (자유 주제 3분)', eve:'서리힐스 레스토랑 팀 만찬 · 원어민 교류', tip:'맨리행 페리 탑승 — 영어로 선원에게 길 묻기 실습' },
        { day:5, title:'영어 발표 · 귀국', am:'팀별 영어 최종 발표 (비즈니스 제안서 형식 5분)', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'귀국 후 매일 10분 영어 일기 쓰기 습관 권장' },
      ],
    },
  ],

  /* ─── 홍콩 ─────────────────────────────────────────────────────── */
  '홍콩': [
    {
      title: '홍콩 금융·무역 허브 비즈니스 연수 코스',
      subtitle: '아시아 금융 중심지 홍콩의 자본시장과 국제무역 시스템 탐방',
      highlights: ['홍콩증권거래소(HKEX)','무역발전국(HKTDC)','홍콩과기대(HKUST)','빅토리아 피크 도시 탐방'],
      days: [
        { day:1, title:'입국 · 홍콩 오리엔테이션', am:'홍콩 국제공항 도착, 호텔 체크인', pm:'빅토리아 피크 전망 · 센트럴 도보 탐방', eve:'딤섬 환영 만찬', tip:'옥토퍼스 카드 입국 당일 준비 권장' },
        { day:2, title:'금융·자본시장', am:'홍콩증권거래소(HKEX) 투어 · 금융전문가 강의', pm:'홍콩 금융관리국(HKMA) 미팅', eve:'란콰이펑 팀 네트워킹 저녁', tip:'HKEX 방문 8주 전 신청 필요' },
        { day:3, title:'국제무역·물류', am:'홍콩 무역발전국(HKTDC) 브리핑', pm:'콰이칭 컨테이너 항구 물류 견학', eve:'침사추이 야경 · 팀 만찬', tip:'무역발전국 방문 4주 전 신청' },
        { day:4, title:'학술 · 혁신', am:'홍콩과기대(HKUST) 비즈니스스쿨 세미나', pm:'사이버포트 핀테크 혁신 허브 방문', eve:'스탠리 해변 팀 자유 탐방', tip:'HKUST 방문 4주 전 신청 필요' },
        { day:5, title:'문화 · 귀국', am:'홍콩역사박물관 탐방 또는 자유 쇼핑', pm:'면세 구매 · 공항 이동', eve:'귀국', tip:'홍콩 공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '홍콩·심천 스마트시티 & 테크 비교 연수',
      subtitle: '홍콩-심천 대만구(GBA) 혁신 생태계 비교 탐방',
      highlights: ['사이언스파크 홍콩','심천 화웨이 캠퍼스','원스마트시티 프로젝트','홍콩응용과기연구원'],
      days: [
        { day:1, title:'입국 · 홍콩 탐방', am:'도착 · 체크인', pm:'사이버포트 테크 커뮤니티 탐방', eve:'소호 팀 만찬', tip:'입국 시 항상 여권 지참 필수' },
        { day:2, title:'홍콩 테크 생태계', am:'홍콩 사이언스파크(HKSTP) 탐방', pm:'홍콩응용과기연구원(ASTRI) 연구자 교류', eve:'노스포인트 현지 식당 저녁', tip:'ASTRI 방문 4주 전 신청' },
        { day:3, title:'심천 탐방 (당일)', am:'심천 화웨이 글로벌 캠퍼스 방문 (사전 신청)', pm:'심천만 스마트시티 오피스 파크 탐방', eve:'심천 쇼핑몰 저녁 후 홍콩 귀환', tip:'심천 방문 시 별도 방문 허가 필요 — 통관 여유 시간 계획' },
        { day:4, title:'금융·미래도시', am:'홍콩 미래도시(MTISD) 계획 브리핑', pm:'첵랍콕 신공항 도시 인프라 견학', eve:'란타우섬 팀 석식', tip:'공항 견학 사전 협조문 필요' },
        { day:5, title:'총정리 · 귀국', am:'연수 성과 발표 세션', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'홍콩 국제공항 수속 3시간 전 도착' },
      ],
    },
  ],

  /* ─── 상해 ─────────────────────────────────────────────────────── */
  '상해': [
    {
      title: '상해 비즈니스 · 첨단산업 탐방 코스',
      subtitle: '중국 최대 경제도시 상해의 산업혁신과 글로벌 비즈니스 네트워크 탐방',
      highlights: ['루자즈이 금융센터','장강신구 테슬라 기가팩토리 (외관)','푸동 혁신기업 미팅','상해 자유무역구'],
      days: [
        { day:1, title:'입국 · 상해 오리엔테이션', am:'푸둥/홍챠오 공항 도착, 호텔 체크인', pm:'와이탄(外灘) 야경 · 난징루 탐방', eve:'환영 만찬 (상해 현지 요리)', tip:'비자 사전 준비 필수 (한국인 일부 비자 면제 해제 확인)' },
        { day:2, title:'금융 · 경제 중심', am:'루자즈이 상해 국제금융센터 방문', pm:'상해 자유무역구(FTZ) 브리핑', eve:'신티엔디 레스토랑 팀 만찬', tip:'FTZ 방문 공문 4주 전 발송 필요' },
        { day:3, title:'혁신 산업 탐방', am:'장강신구 첨단산업단지 현장 방문', pm:'현지 중국 기업 교류 미팅', eve:'쉬자후이 팀 저녁', tip:'중국어 통역 사전 배정 확인 필수' },
        { day:4, title:'역사·문화 체험', am:'상해임시정부유적지(독립운동 사적지) 방문', pm:'예원(豫園) 전통 정원 · 리롱 골목 탐방', eve:'황푸강 크루즈 석식', tip:'독립운동 역사 사전 자료 배포 권장' },
        { day:5, title:'총정리 · 귀국', am:'성과 공유 세션', pm:'난징루 면세 쇼핑 · 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '상해 역사·교육·문화 교류 연수 코스',
      subtitle: '근현대 역사와 첨단 교육기관을 잇는 심층 문화 교류 프로그램',
      highlights: ['복단대학(Fudan) 교류','상해 박물관 학술 투어','한국독립운동 사적지 탐방','장서(藏書) 문화 체험'],
      days: [
        { day:1, title:'입국 · 역사 오리엔테이션', am:'도착 · 체크인', pm:'와이탄 역사지구 · 조계지 건축 탐방', eve:'황푸강 야경 환영 저녁', tip:'근현대 상해 역사 자료 사전 준비 권장' },
        { day:2, title:'학술 교류', am:'복단대학(Fudan University) 방문 · 교수 강의', pm:'상해 교통대학 혁신연구소 세미나', eve:'우자오창 대학 주변 저녁', tip:'대학 방문 6주 전 신청 필요' },
        { day:3, title:'역사 탐방', am:'상해 한국임시정부유적지 · 윤봉길 의사 기념관 방문', pm:'상해 역사박물관 학술 투어', eve:'구베이 워터타운 팀 저녁', tip:'독립운동 역사 사전 교육 권장' },
        { day:4, title:'문화·예술', am:'상해 미술관(MOCA) 큐레이터 투어', pm:'M50 현대미술 단지 탐방', eve:'티엔즈팡 골목 팀 만찬', tip:'M50 단체 가이드 사전 예약 권장' },
        { day:5, title:'총정리 · 귀국', am:'연수 성과 발표', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착' },
      ],
    },
  ],

  /* ─── 하노이 ────────────────────────────────────────────────────── */
  '하노이': [
    {
      title: '하노이 신흥경제 · 산업 발전 탐방 코스',
      subtitle: '빠르게 성장하는 베트남 경제와 제조업·IT 산업 현장 탐방',
      highlights: ['하노이 공업단지 방문','베트남 국립대 교류','하롱베이 자연 체험','하노이 스타트업 생태계'],
      days: [
        { day:1, title:'입국 · 하노이 오리엔테이션', am:'노이바이 공항 도착, 호텔 체크인', pm:'호안끼엠 호수 · 구시가지(Old Quarter) 탐방', eve:'반쎄오 · 분짜 현지 요리 환영 만찬', tip:'베트남어 기초 인사말 준비 권장 — Xin chào 등' },
        { day:2, title:'산업단지 · 제조업', am:'하노이 근교 공업단지 방문 (삼성 등 한국기업 현장)', pm:'현지 산업개발공사 브리핑', eve:'타이호 호수 레스토랑 팀 만찬', tip:'공업단지 방문 사전 허가 4주 전 필요' },
        { day:3, title:'학술 · 역사 교류', am:'베트남 국립대학교 교류 프로그램 참가', pm:'호찌민 묘소 · 호아로 역사박물관 방문', eve:'36거리 가스트로노미 저녁', tip:'호찌민 묘소 복장 규정 엄격 — 단정한 차림 필수' },
        { day:4, title:'하롱베이 자연 체험', am:'하롱베이 크루즈 탑승 (2시간 이동)', pm:'석회암 절경 카약 · 수영·동굴 탐방', eve:'선상 해산물 만찬 · 석양 감상', tip:'하롱베이 1박 크루즈 사전 예약 필수' },
        { day:5, title:'복귀 · 귀국', am:'하롱베이 하선 · 하노이 복귀', pm:'동쑤언 시장 쇼핑 · 공항 이동', eve:'귀국', tip:'노이바이 공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '하노이 역사·문화·ODA 교류 연수 코스',
      subtitle: '베트남 전통문화와 한-베 공적개발원조(ODA) 협력 현장 탐방',
      highlights: ['한국국제협력단(KOICA) 베트남사무소','베트남 문묘·국자감 학술 방문','하롱베이 세계자연유산','한-베 경제협력 기관 교류'],
      days: [
        { day:1, title:'입국 · 문화 오리엔테이션', am:'도착 · 체크인', pm:'하노이 문묘(文廟) · 국자감 역사 탐방', eve:'현지 쌀국수(Phở) 저녁', tip:'문묘 복장 단정하게 준비' },
        { day:2, title:'ODA · 개발협력', am:'한국국제협력단(KOICA) 하노이사무소 브리핑', pm:'베트남 계획투자부 현지 협력사업 현장 방문', eve:'팀 만찬 (베트남-한국 교류)', tip:'KOICA 방문 사전 연락 4주 전' },
        { day:3, title:'역사·전쟁 유적', am:'베트남전쟁 역사박물관 · 호아로 감옥 방문', pm:'호찌민 생가 · 바딘 광장 역사 현장', eve:'트럭바흐 호수 주변 저녁', tip:'역사 현장 사전 교육 자료 배포 권장' },
        { day:4, title:'자연 · 레크리에이션', am:'하롱베이 크루즈 출발 (팀빌딩 활동)', pm:'하롱베이 카약·동굴·수영 체험', eve:'선상 만찬 · 별자리 관찰', tip:'선크림·구명조끼 착용 필수' },
        { day:5, title:'복귀 · 귀국', am:'하롱베이 하선 · 성과 발표', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'공항 3시간 전 도착' },
      ],
    },
  ],

  /* ─── 다낭 ─────────────────────────────────────────────────────── */
  '다낭': [
    {
      title: '다낭 관광개발 · 물류산업 벤치마킹 코스',
      subtitle: '관광·항만·스마트시티 3박자를 갖춘 다낭의 도시 성장 모델 탐구',
      highlights: ['다낭 관광개발 성공사례 세미나','다낭 신항(티엔사항) 물류 현장 견학','한국-베트남 경제교류 강의','다낭 스마트시티 계획 브리핑'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'다낭국제공항 도착, 호텔 체크인', pm:'한강(용다리) · 다낭 시내 도보 탐방', eve:'베트남 현지식 환영 만찬', tip:'용다리(Dragon Bridge)는 주말 저녁 불쇼 공연 진행' },
        { day:2, title:'관광개발 · 경제교류', am:'다낭 경제구역 관광개발 성공사례 세미나', pm:'한국기업 중부베트남 투자사례 브리핑', eve:'한강변 팀 만찬', tip:'세미나 강사 섭외는 4주 전 필요' },
        { day:3, title:'물류·항만 산업', am:'다낭 신항(티엔사항) 물류 현장 견학', pm:'다낭 스마트시티 계획 브리핑', eve:'미케비치 인근 해산물 저녁', tip:'항만시설 견학은 사전 허가 신청 필요' },
        { day:4, title:'바나힐 문화체험', am:'바나힐 케이블카 탑승·골든브릿지 체험', pm:'바나힐 프랑스마을·놀이시설 자유시간', eve:'바나힐 뷔페 만찬', tip:'바나힐은 산 위 날씨가 시내와 다를 수 있어 겉옷 준비' },
        { day:5, title:'정리 · 귀국', am:'호이안 올드타운 반나절 탐방', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'다낭공항 출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '다낭 바나힐 · 미케비치 리조트 팀빌딩 코스',
      subtitle: '구름 위 테마파크와 황금 해변에서 즐기는 완벽한 팀 화합 연수',
      highlights: ['바나힐 케이블카·골든브릿지 체험','미케비치 리조트 팀 스포츠','호이안 야시장·랜턴 축제 탐방','나무배 타기·소원 랜턴 체험'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'다낭국제공항 도착, 리조트 체크인', pm:'미케비치 아이스브레이킹 산책', eve:'해변 팀 환영 만찬', tip:'미케비치는 세계적으로 손꼽히는 해변으로 선정된 바 있음' },
        { day:2, title:'바나힐 전일 체험', am:'바나힐 케이블카 탑승·골든브릿지 인생샷', pm:'바나힐 판타지파크 놀이시설 자유이용', eve:'바나힐 뷔페 만찬', tip:'케이블카는 세계 최장급 논스톱 노선 중 하나' },
        { day:3, title:'미케비치 리조트 액티비티', am:'미케비치 팀 스포츠(비치발리볼·수상레저)', pm:'리조트 수영장 자유 시간', eve:'미케비치 선셋 팀 바베큐', tip:'해양 레저는 오전 시간대가 파도가 잔잔해 안전' },
        { day:4, title:'호이안 문화체험', am:'호이안 올드타운 유네스코 골목 탐방', pm:'호이안 전통 공예마을(도자기·목공예) 체험', eve:'호이안 야시장·랜턴 축제 탐방', tip:'매월 음력 14일은 호이안 전등 축제(랜턴 페스티벌) 진행' },
        { day:5, title:'투본강 · 귀국', am:'투본강 나무배 타기·소원 랜턴 체험', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'다낭공항 출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 방콕 ─────────────────────────────────────────────────────── */
  '방콕': [
    {
      title: '방콕 아세안 비즈니스 · 인프라 연수 코스',
      subtitle: '아세안 중심지 태국의 비즈니스 환경과 도시 인프라 발전 탐방',
      highlights: ['아세안 기업 교류 미팅','방콕 대중교통 인프라','출랄롱콘대 방문','동부 경제회랑(EEC)'],
      days: [
        { day:1, title:'입국 · 방콕 오리엔테이션', am:'수완나품 공항 도착, 호텔 체크인', pm:'짜오프라야강 크루즈 · 왕궁 지구 탐방', eve:'리버사이드 레스토랑 환영 만찬', tip:'랩수 카드(Rabbit Card) 첫날 준비 권장' },
        { day:2, title:'비즈니스 환경', am:'방콕 투자청(BOI) 투자환경 브리핑', pm:'아세안 현지 기업 교류 미팅', eve:'아소크 · 수쿰빗 팀 저녁', tip:'BOI 방문 4주 전 신청 필요' },
        { day:3, title:'인프라 · 교통', am:'방콕 BTS 스카이트레인 운영본부 방문 (선택)', pm:'차오프라야 강변 도시재생 프로젝트 현장', eve:'탈랏 녹(녹색 시장) 현지 음식 체험', tip:'교통 당국 방문 공문 4주 전 필요' },
        { day:4, title:'학술 · 문화', am:'출랄롱콘대(Chula) 교류 프로그램 · 교수 강의', pm:'왓포 · 왓아룬 불교 문화 현장 탐방', eve:'차이나타운(야오와랏) 야시장 만찬', tip:'사원 방문 복장 규정 엄격 — 긴 옷 필수' },
        { day:5, title:'동부 경제회랑 · 귀국', am:'EEC(동부 경제회랑) 산업단지 브리핑 (선택)', pm:'면세 쇼핑 · 수완나품 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '방콕 팀빌딩 · 리더십 문화체험 코스',
      subtitle: '불교 문화와 태국식 환대 속 팀 결속과 리더십 역량 강화',
      highlights: ['왕궁·왓프라깨우 문화투어','메클롱 수상시장 체험','코끼리 보호구역 방문','팀빌딩 쿠킹클래스'],
      days: [
        { day:1, title:'입국 · 팀빌딩 시작', am:'도착 · 체크인', pm:'아이스브레이킹 팀빌딩 워크숍 (쿠킹클래스)', eve:'왕궁 주변 야경 크루즈 · 팀 만찬', tip:'쿠킹클래스 인원 사전 예약 필요' },
        { day:2, title:'문화 몰입', am:'왕궁 · 왓프라깨우 에메랄드불상 사원 투어', pm:'왓포 와불상 · 왓아룬 3대 사원 탐방', eve:'카오산 로드 주변 팀 저녁', tip:'사원 복장 반드시 확인 — 어깨·무릎 가리기' },
        { day:3, title:'자연 체험', am:'담넌 사두억 수상시장 (새벽) 체험', pm:'코끼리 보호구역(에코 친화적) 방문 체험', eve:'에라완 타이 레스토랑 팀 만찬', tip:'코끼리 탑승 X — 보호구역 방문으로만 진행' },
        { day:4, title:'리더십 워크숍', am:'아유타야 역사유적지 하루 탐방', pm:'리더십 워크숍 : 역사 속 리더십 토론', eve:'팀 성과 공유 · 수료 만찬', tip:'아유타야 왕복 약 3시간 — 이른 출발 필요' },
        { day:5, title:'자유 시간 · 귀국', am:'마사지 · 자유 쇼핑 (짜뚜짝 시장)', pm:'공항 이동', eve:'귀국', tip:'짜뚜짝 시장 토·일요일만 운영' },
      ],
    },
    {
      title: '방콕 영어 집중 & 아세안 비즈니스 환경 몰입 연수',
      subtitle: '아세안 허브 방콕에서 글로벌 영어 소통 역량과 동남아 비즈니스 감각 동시 강화',
      highlights: ['AUA Language Center 영어 집중반','글로벌 NGO·기업 영어 미팅','영어 가이드 문화 투어','원어민 비즈니스 영어 세미나'],
      days: [
        { day:1, title:'입국 · 어학 오리엔테이션', am:'수완나품 도착 · 호텔 체크인', pm:'AUA Language Center 오리엔테이션 · 영어 레벨 배치 테스트', eve:'아소크 레스토랑 — 영어로만 주문하는 팀 미션', tip:'방콕 영어 교육 수준은 아세안 최상위 — 현지 강사진 퀄리티 우수' },
        { day:2, title:'영어 집중 수업', am:'AUA 비즈니스 영어 집중반 (스피킹·라이팅·프레젠테이션 4시간)', pm:'원어민 튜터 소그룹 롤플레이 세션 (회의·협상 영어)', eve:'수쿰빗 팀 저녁 — 현지 외국인과 프리토킹 교류', tip:'방콕 현지 외국인 비율이 높아 자연스러운 영어 환경 형성' },
        { day:3, title:'글로벌 기관 영어 실습', am:'UNDP 방콕 오피스 또는 ASEAN 사무국 방문 영어 브리핑', pm:'국제 비즈니스 영어 미팅 롤플레이 (현지 글로벌 기업 협조)', eve:'에카마이 루프탑 팀 네트워킹 — 영어 교류', tip:'국제기관 방문 영어 Q&A 질문지 사전 준비 필수' },
        { day:4, title:'영어 문화 투어·실습', am:'짜오프라야강 영어 가이드 크루즈 투어 (선상 영어 강의)', pm:'짐 톰슨 하우스 영어 가이드 투어 · 영어 발표 실습', eve:'카오산 로드 외국인 교류 · 영어 대화 도전', tip:'짐 톰슨 박물관 영어 설명 노트 작성 → 발표 자료 활용' },
        { day:5, title:'영어 최종 발표 · 귀국', am:'팀별 영어 프레젠테이션 최종 발표 (아세안 주제 5분)', pm:'쇼핑 · 수완나품 공항 이동', eve:'귀국', tip:'귀국 후 아세안 관련 영어 뉴스 매일 15분 청취 권장' },
      ],
    },
  ],

  /* ─── 푸켓 ─────────────────────────────────────────────────────── */
  '푸켓': [
    {
      title: '푸켓 리조트 · MICE 산업 벤치마킹 코스',
      subtitle: '세계적 관광 도시 푸켓의 리조트 운영과 MICE 산업 성공 모델 탐구',
      highlights: ['푸켓 관광청 산업 현황 강의','럭셔리 리조트 운영 벤치마킹','MICE 시설·컨벤션센터 견학','푸켓 올드타운 역사 탐방'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'푸켓국제공항 도착, 빠통 지역 호텔 체크인', pm:'빠통 비치 도보 탐방, 오리엔테이션 미팅', eve:'태국 현지식 환영 만찬', tip:'푸켓공항~빠통 차량 이동 약 40분' },
        { day:2, title:'관광 산업 브리핑', am:'푸켓 관광청 산업 현황·성장 전략 강의', pm:'5성급 리조트 운영 노하우 현장 투어', eve:'빠통 팀 만찬', tip:'리조트 방문은 4주 전 사전 협의 필요' },
        { day:3, title:'MICE 인프라', am:'MICE 시설·컨벤션센터 견학', pm:'왓찰롱 사원 문화 탐방', eve:'푸켓타운 저녁', tip:'사원 방문 시 복장 규정(어깨·무릎 가리기) 준수' },
        { day:4, title:'올드타운 · 투자 세미나', am:'푸켓 올드타운 시노-포르투기즈 건축 탐방', pm:'태국 부동산·리조트 투자 세미나', eve:'팀 회식', tip:'올드타운은 도보 투어로 반나절 소요' },
        { day:5, title:'정리 · 귀국', am:'빅붓다 전망대 방문', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'푸켓공항 출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '푸켓 안다만해 리조트 팀빌딩 코스',
      subtitle: '에메랄드빛 안다만해에서 즐기는 완벽한 팀 자유 리조트 연수',
      highlights: ['피피섬 스노클링·보트 투어','팡아만 카약·절벽 투어','빠통 비치 선셋 팀 만찬','태국 요리 쿠킹클래스'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'푸켓국제공항 도착, 리조트 체크인', pm:'빠통 비치 아이스브레이킹 산책', eve:'해산물 환영 만찬', tip:'해양 액티비티 대비 방수팩 준비 권장' },
        { day:2, title:'피피섬 투어', am:'피피섬 이동(스피드보트)·마야베이 인근 스노클링', pm:'피피섬 아일랜드 호핑 투어', eve:'선상 팀 만찬', tip:'피피섬 왕복 약 3~4시간 소요' },
        { day:3, title:'팡아만 카약 투어', am:'팡아만 이동·카약 체험', pm:'제임스본드 섬·에메랄드 동굴 탐방', eve:'팡아만 현지 해산물 저녁', tip:'카약 투어는 구명조끼 필수 착용' },
        { day:4, title:'문화 · 미식체험', am:'왓찰롱 사원 탐방', pm:'태국 요리 쿠킹클래스(똠얌꿍·팟타이)', eve:'빠통 비치 선셋 팀 만찬', tip:'쿠킹클래스는 사전 인원 확정 필요' },
        { day:5, title:'자유시간 · 귀국', am:'리조트 자유 시간(스파·수영장)', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'푸켓공항 출발 3시간 전 도착 권장' },
      ],
    },
  ],

  '후아힌': [
    {
      title: '후아힌 호스피탈리티 · 리조트 운영 벤치마킹 코스',
      subtitle: '태국 왕실 휴양지의 리조트 운영과 서비스 품질 관리 현장 학습',
      highlights: ['후아힌 리조트 운영 브리핑','왕실 휴양지 도시계획 탐방','시카다 마켓 로컬 상권 조사','후아힌 힐즈 와이너리 견학'],
      days: [
        { day:1, title:'입국 · 이동', am:'수완나품공항 도착 후 후아힌 이동 (약 3시간)', pm:'리조트 체크인 · 오리엔테이션', eve:'해변 환영 만찬', tip:'방콕-후아힌 전용버스 이동 — 휴게 1회 포함 일정 권장' },
        { day:2, title:'리조트 운영 벤치마킹', am:'리조트 운영 브리핑 (객실·F&B·인력 운영)', pm:'서비스 품질 관리 사례 세션', eve:'씨푸드 팀 만찬', tip:'브리핑은 호텔 세일즈팀에 4주 전 요청' },
        { day:3, title:'도시계획 · 로컬 상권', am:'후아힌 기차역 · 왕실 별궁(클라이깡원) 도시계획 탐방', pm:'시카다 마켓 로컬 상권 조사', eve:'나이트마켓 자유 저녁', tip:'시카다 마켓은 금~일 저녁만 운영 — 일정 배치 주의' },
        { day:4, title:'농식품 · 관광산업', am:'후아힌 힐즈 와이너리 견학 · 농식품 가공 브리핑', pm:'스위스 십 · 산토린 파크 관광 인프라 시찰', eve:'만찬 및 성과 정리', tip:'와이너리 단체 투어는 2주 전 예약' },
        { day:5, title:'귀국 이동', am:'체크아웃 후 방콕 이동', pm:'방콕 시내 경유 · 공항 이동', eve:'귀국 탑승', tip:'방콕 시내 정체를 감안해 출발 4시간 전 여유' },
      ],
    },
    {
      title: '후아힌 워크숍 · 인센티브 연수 코스',
      subtitle: '해변 리조트를 거점으로 한 집중 워크숍과 팀 인센티브 프로그램',
      highlights: ['리조트 컨퍼런스 세션','해변 팀빌딩 액티비티','타이 요리·문화 체험','조별 성과 발표'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'수완나품공항 도착 후 후아힌 이동', pm:'체크인 · 아이스브레이킹', eve:'환영 만찬 (해변 BBQ)', tip:'대형 단체는 버스 배차 간격을 미리 확정' },
        { day:2, title:'집중 워크숍', am:'리조트 컨퍼런스룸 전략 세션', pm:'조별 과제 워크숍', eve:'팀 만찬 · 자유 시간', tip:'회의실 음향·스크린은 전날 리허설 권장' },
        { day:3, title:'팀빌딩', am:'해변 팀빌딩 액티비티', pm:'타이 요리 클래스 · 문화 체험', eve:'나이트마켓 자유 저녁', tip:'야외 활동은 오전 배치(오후 스콜 대비)' },
        { day:4, title:'인센티브 · 정리', am:'조별 성과 정리 세션', pm:'스파·자유 시간 (인센티브)', eve:'시상 만찬', tip:'스파는 인원수만큼 사전 예약 필요' },
        { day:5, title:'귀국 이동', am:'체크아웃 후 방콕 이동', pm:'공항 이동', eve:'귀국', tip:'교통 상황에 따라 이동 시간이 크게 달라진다' },
      ],
    },
  ],


  /* ─── 발리 ─────────────────────────────────────────────────────── */
  '발리': [
    {
      title: '발리 리더십 리트리트 · 웰니스 팀빌딩 코스',
      subtitle: '자연 속 마음챙김과 리더십 성찰로 조직 결속력과 창의성 강화',
      highlights: ['우붓 정글 리트리트 워크숍','바나나 농장·라이스 테라스 트레킹','요가·명상 프로그램','발리 전통 의식 문화 체험'],
      days: [
        { day:1, title:'입국 · 발리 웰컴', am:'덴파사르 공항 도착, 우붓 리조트 체크인', pm:'우붓 라이스 테라스 산책 · 오리엔테이션', eve:'촛불 환영 만찬 (발리 전통 음식)', tip:'우붓까지 약 1.5시간 — 픽업 사전 예약 필수' },
        { day:2, title:'리더십 리트리트', am:'선라이즈 요가 · 명상 세션', pm:'리더십 심화 워크숍 (퍼실리테이터 진행)', eve:'발리 전통 케착 댄스 공연 관람', tip:'워크숍 강사 2개월 전 섭외 필요' },
        { day:3, title:'문화 몰입', am:'발리 힌두 사원(따나롯·울루와뚜) 방문', pm:'현지 바릉 댄스 문화 체험 · 공예 클래스', eve:'짐바란 해변 씨푸드 만찬', tip:'사원 복장 규정 — 사롱(발리 전통 천) 착용 필수' },
        { day:4, title:'자연 팀빌딩', am:'발리 래프팅(아융강) 팀 활동', pm:'코피 루왁 농장 · 쌀 테라스 트레킹', eve:'우붓 시장 쇼핑 · 팀 파이어사이드 저녁', tip:'래프팅 최소 인원 확인 필요 — 우기 시 운영 변동 가능' },
        { day:5, title:'성찰 · 귀국', am:'개인 성찰 저널 작성 · 팀 성과 공유', pm:'덴파사르 면세 쇼핑 · 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '발리 창의 교육 · 지속가능 관광 연수 코스',
      subtitle: '발리의 지속가능 관광 모델과 전통 예술 교육 시스템 탐방',
      highlights: ['발리 전통예술학교 방문','친환경 리조트 운영 탐방','지속가능 농업 체험','발리 로컬 커뮤니티 교류'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'도착 · 우붓 체크인', pm:'우붓 왕궁 · 예술 갤러리 탐방', eve:'발리 가베갓 요리 팀 만찬', tip:'우붓은 발리 예술·문화의 중심지' },
        { day:2, title:'예술 교육 탐방', am:'발리 전통예술학교(SMKN) 방문 · 수업 참관', pm:'현지 작가 아틀리에 방문 · 회화·조각 체험', eve:'저녁 가믈란 연주 감상', tip:'예술학교 방문 사전 연락 필요' },
        { day:3, title:'지속가능 관광', am:'에코 리조트 운영진 미팅 · 친환경 운영 시스템 견학', pm:'우붓 유기농 시장 · 지역 농부 교류', eve:'팜 투 테이블 요리 체험', tip:'에코 리조트 방문 4주 전 사전 예약' },
        { day:4, title:'커뮤니티 교류', am:'발리 전통 마을(반자르) 방문 · 공동체 시스템 이해', pm:'지역사회 발전 프로젝트 현장 탐방', eve:'전통 의식 참관 (케착 또는 바롱)', tip:'전통 의식 날짜 사전 확인 필요' },
        { day:5, title:'총정리 · 귀국', am:'성과 공유 세션 · 수료식', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'공항 이동 시간 충분히 확보' },
      ],
    },
  ],

  /* ─── 호치민 ────────────────────────────────────────────────────── */
  '호치민': [
    {
      title: '호치민 비즈니스 · 스타트업 산업연수 코스',
      subtitle: '베트남 경제 심장 호치민의 진출기업 벤치마킹과 첨단기술단지 탐방',
      highlights: ['한국투자기업 호치민 법인 방문','RMIT 베트남(사이공사우스캠퍼스) 방문·강의','사이공 하이테크파크(SHTP) 견학','베트남 유통·이커머스 현장 투어'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'떤선녓국제공항 도착, 호텔 체크인', pm:'벤탄시장·동커이거리 도보 탐방', eve:'베트남 현지식 환영 만찬', tip:'그랩(Grab) 앱 사전 설치 권장 — 현지 이동 편리' },
        { day:2, title:'한국기업 벤치마킹', am:'한국투자기업 호치민 성공법인 방문', pm:'베트남 유통·이커머스 현장 투어', eve:'7군 팀 만찬', tip:'기업 방문은 공문 4주 전 발송 권장' },
        { day:3, title:'학술 · 스타트업', am:'RMIT 베트남 사이공사우스캠퍼스 방문 · 특강', pm:'베트남 스타트업 생태계 방문', eve:'루프탑 레스토랑 팀 저녁', tip:'RMIT 방문은 공식 문의처(enquiries@rmit.edu.vn)로 사전 신청' },
        { day:4, title:'첨단기술단지', am:'사이공 하이테크파크(SHTP) 견학 · 브리핑', pm:'SHTP 입주기업 현장 투어', eve:'사이공강변 팀 만찬', tip:'SHTP는 스터디투어 프로그램을 공식 운영 중 — 사전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'통일궁(독립궁) 역사 탐방', pm:'면세 쇼핑 · 공항 이동', eve:'귀국', tip:'떤선녓공항 출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '호치민 메콩델타 · 문화탐방 팀빌딩 코스',
      subtitle: '메콩강의 생명력과 역동적인 호치민 미식·역사 문화를 즐기는 팀 화합 연수',
      highlights: ['메콩강 델타 보트 투어','호치민 야경 루프탑 팀 만찬','전쟁박물관·통일궁 역사 탐방','벤탄시장 자유 쇼핑'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'떤선녓국제공항 도착, 호텔 체크인', pm:'동커이거리 아이스브레이킹 도보 투어', eve:'쌀국수·반미 환영 만찬', tip:'습하고 더운 날씨 대비 가벼운 복장 권장' },
        { day:2, title:'메콩강 델타 투어', am:'메콩강 델타 이동 · 보트 투어·코코넛 농장 체험', pm:'수상시장·과수원 팀 체험', eve:'메콩강변 현지 만찬', tip:'메콩델타는 왕복 이동시간이 길어 이른 출발 권장' },
        { day:3, title:'역사 탐방', am:'전쟁박물관 견학', pm:'통일궁(독립궁) 역사 탐방', eve:'루프탑 레스토랑 팀 만찬 (사이공강 야경)', tip:'전쟁박물관은 역사적으로 민감한 전시가 있어 사전 안내 권장' },
        { day:4, title:'구찌터널 · 문화체험', am:'구찌터널 이동·전시관 관람', pm:'구찌터널 갱도 체험', eve:'베트남 전통 공연(아오자오 등) 관람', tip:'구찌터널 갱도는 좁고 낮아 폐소공포증이 있으면 사전 안내' },
        { day:5, title:'쇼핑 · 귀국', am:'벤탄시장 자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'벤탄시장은 흥정이 일반적 — 정찰제 매장과 혼재' },
      ],
    },
  ],

  /* ─── 세부 ─────────────────────────────────────────────────────── */
  '세부': [
    {
      title: '세부 IT · 교육산업 연수 코스',
      subtitle: '필리핀 비즈니스·교육 허브 세부의 IT파크와 영어교육 현장 탐방',
      highlights: ['세부 IT파크 글로벌 BPO 기업 탐방','세부 영어 몰입 프로그램 강의','세부 항만 국제물류 현장 방문','필리핀 중소기업 성장 사례 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'막탄-세부국제공항 도착, 호텔 체크인', pm:'아얄라센터 세부 도보 탐방, 오리엔테이션 미팅', eve:'현지식 환영 만찬', tip:'막탄공항은 세부 시내와 다리로 연결(약 30분)' },
        { day:2, title:'IT · BPO 산업 현장', am:'세부 IT파크 글로벌 BPO 기업(콘센트릭스 등) 탐방', pm:'필리핀 중소기업 성장 사례 강의', eve:'IT파크 인근 팀 만찬', tip:'BPO 기업 방문은 4주 전 사전 섭외 필요' },
        { day:3, title:'영어교육 · 항만물류', am:'세부 영어 몰입 프로그램 강의 참관', pm:'세부 항만 국제물류 현장 방문', eve:'세부시티 팀 저녁', tip:'항만 견학은 안전화 등 복장 규정 확인 필요' },
        { day:4, title:'역사 · 문화 탐방', am:'마젤란 십자가·산토니뇨성당 역사 탐방', pm:'포트 산 페드로 요새 견학', eve:'라푸라푸 기념 만찬', tip:'세부는 필리핀 최초 스페인 정착지로 역사적 의미가 큼' },
        { day:5, title:'정리 · 귀국', am:'아얄라센터 면세 쇼핑', pm:'공항 이동', eve:'귀국', tip:'막탄공항 출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '세부 막탄 아일랜드 · 리조트 힐링 코스',
      subtitle: '세계적 다이빙 명소 막탄섬에서 즐기는 완벽한 팀 재충전 연수',
      highlights: ['막탄섬 아일랜드 호핑 투어','스쿠버다이빙·스노클링 팀 체험','마젤란 십자가 역사지구 탐방','세부 해산물 시장 팀 바베큐'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'막탄-세부국제공항 도착, 리조트 체크인', pm:'리조트 비치 아이스브레이킹', eve:'해변 환영 만찬', tip:'막탄섬 리조트는 대부분 프라이빗 비치 보유' },
        { day:2, title:'아일랜드 호핑', am:'막탄섬 인근 아일랜드 호핑 투어(보트)', pm:'무인도 스노클링·해양 액티비티', eve:'선상 팀 바베큐', tip:'구명조끼 상시 착용 권장' },
        { day:3, title:'스쿠버다이빙 체험', am:'스쿠버다이빙 PADI 입문 체험(초보자 가능)', pm:'스노클링 자유 시간', eve:'세부 해산물 시장 팀 바베큐', tip:'다이빙은 최소 하루 전 컨디션 관리 권장' },
        { day:4, title:'역사 · 쇼핑', am:'마젤란 십자가·포트 산 페드로 역사지구 탐방', pm:'세부시티 아얄라센터 쇼핑', eve:'팀 회식 및 성과 공유', tip:'세부시티까지 리조트에서 차량 이동 약 1시간' },
        { day:5, title:'자유시간 · 귀국', am:'리조트 자유 시간(스파·수영장)', pm:'공항 이동', eve:'귀국', tip:'막탄공항 출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 우즈베키스탄 ──────────────────────────────────────────────── */
  '우즈베키스탄': [
    {
      title: '우즈베키스탄 실크로드 · 문명 교류 역사 연수',
      subtitle: '중앙아시아 문명의 십자로 사마르칸트·타슈켄트 역사 현장 탐방',
      highlights: ['사마르칸트 레기스탄 광장','티무르 기념관','비비하눔 모스크','타슈켄트 국립역사박물관'],
      days: [
        { day:1, title:'입국 · 타슈켄트 오리엔테이션', am:'타슈켄트 공항 도착, 호텔 체크인', pm:'초르수 바자르 · 쿠켈다시 마드라사 탐방', eve:'우즈베크 전통 요리(플로프·샤슬릭) 환영 만찬', tip:'우즈베크어 기초 인사 — Salom 등 준비 권장' },
        { day:2, title:'타슈켄트 문화·역사', am:'국립역사박물관 학술 투어', pm:'티무르 기념관(아미르 티무르) 방문', eve:'로스토시 레스토랑 팀 저녁', tip:'박물관 한국어 오디오 가이드 사전 예약' },
        { day:3, title:'사마르칸트 탐방', am:'고속열차(아프로시압) 사마르칸트 이동', pm:'레기스탄 광장 · 구르 에미르 영묘 방문', eve:'사마르칸트 전통 시장 · 현지 식당 저녁', tip:'고속열차 예약 2주 전 필수' },
        { day:4, title:'사마르칸트 심층 탐방', am:'비비하눔 모스크 · 샤흐리 진다 묘지군 방문', pm:'레기스탄 박물관 세라믹·섬유 예술 체험', eve:'전통 민속 공연 관람 · 팀 만찬', tip:'섬유·세라믹 체험 예약 필요' },
        { day:5, title:'귀국', am:'사마르칸트 → 타슈켄트 이동', pm:'기념품 쇼핑 · 공항 이동', eve:'귀국', tip:'타슈켄트 공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '우즈베키스탄 경제개발 · ODA 협력 연수',
      subtitle: '중앙아시아 신흥시장 우즈베키스탄의 경제개혁과 한-우 협력 탐방',
      highlights: ['우즈베키스탄 경제개발부 브리핑','한국산업단지(KIC) 방문','나보이 자유경제구역','국립경제대학 교류'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'도착 · 체크인', pm:'타슈켄트 구시가지 역사 투어', eve:'환영 만찬', tip:'현지 환전은 공항 또는 은행 이용' },
        { day:2, title:'경제정책 브리핑', am:'우즈베키스탄 경제개발부 담당관 브리핑', pm:'타슈켄트 시청 도시개발 미팅', eve:'타슈켄트 시내 현지 식당 저녁', tip:'경제부 방문 공문 6주 전 발송 필요' },
        { day:3, title:'산업단지 · 한-우 협력', am:'한국-우즈베키스탄 산업협력단지(KIC) 방문', pm:'현지 진출 한국기업 교류 미팅', eve:'한인 타운 코리안 BBQ 저녁', tip:'KIC 방문 사전 연락 필요' },
        { day:4, title:'자유경제구역 · 학술', am:'나보이 자유경제구역(FIEZ) 탐방', pm:'타슈켄트 국립경제대학 교류 프로그램', eve:'국제 호텔 팀 만찬', tip:'나보이까지 이동 약 5시간 — 당일치기 또는 1박 계획' },
        { day:5, title:'역사 탐방 · 귀국', am:'레기스탄 광장 (사마르칸트) 또는 타슈켄트 문화유산 자유 탐방', pm:'기념품 쇼핑 · 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착' },
      ],
    },
  ],

  /* ─── 몽골 ─────────────────────────────────────────────────────── */
  '몽골': [
    {
      title: '몽골 환경·에너지 · 자연생태 연수 코스',
      subtitle: '광활한 초원과 고비 사막에서 배우는 생태 보전과 재생에너지 정책',
      highlights: ['울란바토르 환경부 브리핑','게르 생활 홈스테이','고비사막 생태 탐방','몽골 태양광 발전소 방문'],
      days: [
        { day:1, title:'입국 · 울란바토르 탐방', am:'울란바토르 공항 도착, 호텔 체크인', pm:'수흐바타르 광장 · 국립박물관 탐방', eve:'몽골 전통 요리(허르헉·보쯔) 환영 만찬', tip:'고도 약 1,350m — 처음 1-2일 고산 적응 필요' },
        { day:2, title:'환경·에너지 정책', am:'몽골 환경부 담당관 정책 브리핑', pm:'울란바토르 태양광·풍력 발전소 현장 방문', eve:'몽골 게르 레스토랑 팀 만찬', tip:'환경부 방문 공문 6주 전 발송 필요' },
        { day:3, title:'초원 생태 체험', am:'테를지 국립공원 이동 (1.5시간)', pm:'게르 홈스테이 · 승마 체험 · 전통 유목 생활', eve:'게르 별빛 캠프파이어 팀 만찬', tip:'승마 안전장비(헬멧) 지참 또는 현지 대여' },
        { day:4, title:'자연 · 역사', am:'테를지 국립공원 거북바위·아리야발 사원 탐방', pm:'징기스칸 기마상 복합단지 방문', eve:'울란바토르 복귀 · 팀 성과 공유', tip:'강수량 7-8월 집중 — 우비 준비 권장' },
        { day:5, title:'성과 공유 · 귀국', am:'연수 성과 발표 세션', pm:'나담 기념품 쇼핑 · 공항 이동', eve:'귀국', tip:'울란바토르 공항 수속 2.5시간 전 도착' },
      ],
    },
    {
      title: '몽골 초청연수 · 문화교류 코스',
      subtitle: '몽골 공무원·전문가 초청 국내 연수 또는 현지 다문화 교류 프로그램',
      highlights: ['몽골 문화부 교류 방문','전통 궁술·격기 체험','나담 축제 참관 (시즌)','한-몽 우호기관 교류'],
      days: [
        { day:1, title:'입국 · 문화 오리엔테이션', am:'도착 · 체크인', pm:'울란바토르 시내 문화 오리엔테이션 투어', eve:'환영 만찬', tip:'여름철(6-8월) 나담 축제 참관 가능 — 일정 확인 필요' },
        { day:2, title:'기관 교류 방문', am:'몽골 문화부 · 교육부 방문 교류', pm:'한-몽 우호협회 미팅', eve:'몽골 전통 음악 공연 관람', tip:'공문 6주 전 발송 필요' },
        { day:3, title:'전통 문화 체험', am:'궁술(활쏘기) · 격기(씨름) 체험 워크숍', pm:'몽골 전통 공예 (가죽·뼈 조각) 체험', eve:'게르 캠프 이동 · 전통식 만찬', tip:'체험 복장 편안하게 준비' },
        { day:4, title:'자연 탐방', am:'테를지 국립공원 트레킹 · 자연 사진 촬영', pm:'거북바위 · 아리야발 사원 탐방', eve:'게르 캠프 팀 성과 공유', tip:'트레킹 화 착용 권장' },
        { day:5, title:'총정리 · 귀국', am:'연수 성과 발표 세션', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'공항 수속 2.5시간 전 도착' },
      ],
    },
  ],

  /* ─── 대만·타이베이 ─────────────────────────────────────────────── */
  '대만': [
    {
      title: '타이베이 반도체·첨단IT 산업 벤치마킹 코스',
      subtitle: '세계 반도체 공급망의 핵심 대만의 기술혁신 생태계 탐방',
      highlights: ['TSMC 혁신관 방문','타이완 반도체산업협회(TSIA)','공업기술연구원(ITRI)','신주 과학공업단지'],
      days: [
        { day:1, title:'입국 · 타이베이 오리엔테이션', am:'타오위안 공항 도착, 호텔 체크인', pm:'타이베이 101 전망대 · 신이 지구 탐방', eve:'딘타이펑 소룡포 환영 만찬', tip:'이지카드(EasyCard) 첫날 준비 권장' },
        { day:2, title:'반도체 산업', am:'TSMC 혁신관 방문 (신주)', pm:'타이완 반도체산업협회(TSIA) 브리핑', eve:'신주 현지 레스토랑 팀 저녁', tip:'TSMC 혁신관 단체 예약 6주 전 필요' },
        { day:3, title:'연구기관 탐방', am:'공업기술연구원(ITRI) 방문 · 연구자 교류', pm:'국립교통대학(NYCU) 반도체학과 교수 강의', eve:'타이베이 닝샤 야시장 팀 저녁', tip:'ITRI 방문 6주 전 신청 필요' },
        { day:4, title:'스마트시티 · 혁신', am:'타이베이 스마트시티 서밋 방문 또는 산업 미팅', pm:'MiDAS 혁신가속기 스타트업 방문', eve:'지우펀 야경 팀 탐방 (선택)', tip:'지우펀은 비가 많으니 우산 필수' },
        { day:5, title:'역사 · 귀국', am:'국립고궁박물관 학술 투어', pm:'면세 쇼핑 · 타오위안 공항 이동', eve:'귀국', tip:'공항 수속 3시간 전 도착 권장' },
      ],
    },
    {
      title: '타이베이 도시재생 · 디자인 문화 연수 코스',
      subtitle: '대만 창의 문화 산업과 도시재생 성공사례 현장 탐방',
      highlights: ['화산1914 문화창의공원','송산문화창의원','대만 문화부 정책 브리핑','국립중정기념당'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'도착 · 체크인', pm:'중정기념당 · 대안 산림 공원 탐방', eve:'용캉제 타이 요리 환영 만찬', tip:'시내 이동은 MRT+버스 조합 추천' },
        { day:2, title:'문화 정책 탐방', am:'대만 문화부 정책 브리핑 · 문화창의산업 현황', pm:'화산1914 문화창의공원 현장 방문', eve:'시먼딩 팀 저녁', tip:'문화부 방문 4주 전 신청 필요' },
        { day:3, title:'창의 공간 탐방', am:'송산문화창의원 (Songshan Cultural & Creative Park)', pm:'디화제 전통 · 현대 공존 거리 탐방', eve:'대도청 지역 예술 레스토랑 저녁', tip:'디화제 복고 쇼핑 체험 권장' },
        { day:4, title:'도시재생 현장', am:'바오안궁 지역 도시재생 현장 방문', pm:'신베이 사회주택 정책 브리핑', eve:'단수이 일몰 팀 탐방 · 저녁', tip:'단수이까지 MRT 단수이선 이용' },
        { day:5, title:'박물관 · 귀국', am:'국립고궁박물관 문화재 학술 투어', pm:'쇼핑 · 공항 이동', eve:'귀국', tip:'고궁박물관 단체 해설 사전 예약 권장' },
      ],
    },
  ],

  /* ─── 오키나와 ───────────────────────────────────────────────────── */
  '오키나와': [
    {
      title: '오키나와 리조트·관광산업 혁신 벤치마킹 코스',
      subtitle: '아시아 최고 리조트 운영 노하우와 국제물류 허브 모델을 현장에서 학습',
      highlights: ['오키나와 관광청 산업 현황 강의','리조트 경영 혁신 사례 세미나','나하공항 국제물류허브 견학','류큐대학 방문·교류'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'나하공항(OKA) 도착, 나하 시내 호텔 체크인', pm:'고쿠사이도리 도보 탐방, 오리엔테이션 미팅', eve:'오키나와 소바 환영 만찬', tip:'시내 이동은 모노레일 유이레일이 편리' },
        { day:2, title:'관광산업 현장', am:'오키나와현 관광정책과 방문, 관광 산업 현황 강의', pm:'리조트 경영 혁신 사례 현장 투어(만자비치 인근)', eve:'미하마 아메리칸빌리지 팀 저녁', tip:'관광청 방문은 4주 전 사전 신청 필요' },
        { day:3, title:'물류·전략산업', am:'나하공항 국제물류허브 시설 견학', pm:'오키나와 상공회의소 전략산업 좌담회', eve:'나하 시내 팀 만찬', tip:'물류시설 견학은 사전 승인 필요' },
        { day:4, title:'학술 교류', am:'류큐대학 캠퍼스 방문 · 국제교류 세미나', pm:'슈리성 역사 유적 탐방(류큐왕국)', eve:'팀 만찬', tip:'슈리성은 유네스코 세계유산 — 복원 전시 확인' },
        { day:5, title:'정리 · 귀국', am:'고쿠사이도리 자유시간·쇼핑', pm:'나하공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '오키나와 에메랄드 씨 팀빌딩 코스',
      subtitle: '아름다운 해양 자연 속 특별 체험으로 팀 결속과 재충전을 극대화',
      highlights: ['스노클링·카약 팀 체험','츄라우미 수족관 프라이빗 투어','류큐 전통 의상 체험','오키나와 BBQ 팀 만찬'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'나하공항 도착, 리조트 체크인', pm:'비치 아이스브레이킹 산책', eve:'오키나와 BBQ 환영 만찬', tip:'자외선이 매우 강함 — 선크림 필수' },
        { day:2, title:'북부 해양 체험', am:'츄라우미 수족관 프라이빗 투어(모토부)', pm:'나키진성터 탐방', eve:'나고 팀 저녁', tip:'수족관은 오전 이른 시간 방문 시 여유롭게 관람 가능' },
        { day:3, title:'해양 스포츠', am:'만자모 인근 스노클링·카약 팀 체험', pm:'만자모 절벽 탐방', eve:'해변 BBQ 팀 만찬', tip:'스노클링 전 리프세이프 선크림 사용 권장' },
        { day:4, title:'전통 문화 체험', am:'류큐 전통 의상 체험·기념촬영', pm:'나하 시내 자유 탐방', eve:'팀 만찬', tip:'전통의상 체험은 최소 1주 전 예약 필요' },
        { day:5, title:'자유시간 · 귀국', am:'고쿠사이도리 쇼핑', pm:'나하공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 장가계 ─────────────────────────────────────────────────────── */
  '장가계': [
    {
      title: '장가계 생태관광·자연유산 산업 벤치마킹 코스',
      subtitle: '세계 자연유산 관광개발 모델에서 생태·지속가능 사업 인사이트 습득',
      highlights: ['관광개발 성공 사례 현장 강의','에코 투어리즘 기업 방문','생태 보전·관광 균형 세미나','지역 주민 상생 모델 탐방'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'장가계허화국제공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'후난 현지식 환영 만찬', tip:'고지대 구간이 있어 편한 신발 준비' },
        { day:2, title:'관광개발 현장', am:'장가계 국립공원관리위원회 방문, 관광개발 성공사례 강의', pm:'우링위안 풍경구 에코투어리즘 현장 방문', eve:'팀 저녁', tip:'관리위원회 방문 4주 전 신청 필요' },
        { day:3, title:'생태보전 세미나', am:'생태 보전·관광 균형 정책 세미나', pm:'지역 주민 상생 관광모델(원주민 마을) 탐방', eve:'팀 만찬', tip:'통역 가이드 사전 배정 필요' },
        { day:4, title:'자연 인프라 현장', am:'천문산 케이블카·유리잔도 관광 인프라 견학', pm:'십리화랑 트레킹', eve:'팀 만찬', tip:'천문산 케이블카는 세계 최장 라이드 중 하나' },
        { day:5, title:'정리 · 귀국', am:'시내 자유시간', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
    {
      title: '장가계 아바타 절경 팀빌딩 코스',
      subtitle: '세상 어디에도 없는 절경 속에서 팀이 함께 느끼는 경이로움과 결속',
      highlights: ['천문산 케이블카 세계 최장 라이드','아바타 원경 촬영지 뷰포인트','장가계 글라스브리지 체험','십리화랑 절경 트레킹'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹 산책', eve:'후난 매운 요리 환영 만찬', tip:'후난 요리는 매운 편 — 순한 메뉴 별도 요청 가능' },
        { day:2, title:'천문산 탐방', am:'천문산 케이블카 세계 최장 라이드 탑승', pm:'천문동·유리잔도 체험', eve:'팀 저녁', tip:'케이블카는 강풍 시 운행 중단 가능 — 여유 일정 권장' },
        { day:3, title:'아바타 절경', am:'아바타 촬영지(원가계) 뷰포인트 트레킹', pm:'장가계 글라스브리지 스릴 체험', eve:'팀 만찬', tip:'글라스브리지는 신발 커버 착용 필수' },
        { day:4, title:'트레킹 · 힐링', am:'십리화랑 절경 트레킹(모노레일 이용 가능)', pm:'보봉호 유람', eve:'팀 회식 · 성과 공유', tip:'트레킹화 착용 권장' },
        { day:5, title:'자유시간 · 귀국', am:'시내 자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
  ],

  /* ─── 청도 ───────────────────────────────────────────────────────── */
  '청도': [
    {
      title: '청도 한중 산업협력 벤치마킹 코스',
      subtitle: '중국 최대 한국 기업 투자 거점에서 글로벌 제조·현지화 전략 습득',
      highlights: ['하이얼 전략 혁신 센터 투어','한국 기업 중국 현지화 강의','청도개발구 산업 벤치마킹','한중 네트워킹 세션'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'청도 류팅국제공항 도착, 호텔 체크인', pm:'잔교 인근 시내 오리엔테이션', eve:'칭다오 맥주·해산물 환영 만찬', tip:'청도는 한국 기업 진출 밀집지역 — 한국어 통용 구역 많음' },
        { day:2, title:'하이얼 현장', am:'하이얼 스마트팩토리·전략 혁신센터 투어', pm:'한국 기업 중국 현지화 성공사례 강의', eve:'팀 저녁', tip:'하이얼 견학은 4주 전 신청 필요' },
        { day:3, title:'개발구 벤치마킹', am:'청도경제기술개발구 산업단지 현장 방문', pm:'한중 네트워킹 세션(현지 한국상공회의소)', eve:'팀 만찬', tip:'개발구 방문 시 여권 지참 필수' },
        { day:4, title:'문화 · 산업', am:'칭다오 맥주박물관 VIP 투어·시음', pm:'독일 조계지 구시가지 탐방', eve:'잔교 해변 팀 저녁', tip:'맥주박물관은 시음 인원 제한 있어 사전 예약 권장' },
        { day:5, title:'정리 · 귀국', am:'시내 자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '청도 맥주·해양 힐링 팀빌딩 코스',
      subtitle: '이색 한중 문화가 어우러진 청도에서 팀 친밀감 강화와 재충전',
      highlights: ['칭다오 맥주박물관 VIP 투어·시음','잔교 해변·팔대관 탐방','해산물 시장 투어·팀 만찬','청도 구시가지 독일 문화 거리'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'잔교 해변 아이스브레이킹 산책', eve:'해산물 환영 만찬', tip:'해산물 알레르기 사전 확인 권장' },
        { day:2, title:'맥주 문화 체험', am:'칭다오 맥주박물관 VIP 투어·시음', pm:'독일 조계지 구시가지 탐방', eve:'팀 저녁', tip:'맥주박물관 시음 코너는 오전이 한산' },
        { day:3, title:'해변 · 팔대관', am:'팔대관 풍경구 탐방(유럽풍 별장지구)', pm:'잔교 해변 석양 감상', eve:'해산물 시장 투어·팀 만찬', tip:'팔대관은 도보 투어 추천' },
        { day:4, title:'자유 · 힐링', am:'오사첩 해수욕장 자유시간', pm:'청도 올림픽 요트센터 탐방', eve:'팀 회식', tip:'여름철 외 계절은 해변 산책 위주로 진행' },
        { day:5, title:'자유시간 · 귀국', am:'시내 쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 연태 ───────────────────────────────────────────────────────── */
  '연태': [
    {
      title: '연태 포도주·무역산업 벤치마킹 코스',
      subtitle: '중국 최대 포도·와인 산업과 한중 무역 성공 사례 직접 학습',
      highlights: ['중국 3대 와인 생산지 현장 강의','연태 항만 물류센터 견학','한중 무역 성공 기업 방문','포도 수확·와인 양조 체험'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'연태 펑라이국제공항 도착, 호텔 체크인', pm:'해변 시내 오리엔테이션', eve:'해산물 환영 만찬', tip:'연태는 장성(창유) 와인 산지로 유명' },
        { day:2, title:'와인산업 현장', am:'장성 포도주 생산기지 방문, 중국 3대 와인산지 현장 강의', pm:'와이너리 시음 투어', eve:'팀 저녁', tip:'와이너리 방문은 3주 전 예약 권장' },
        { day:3, title:'무역 · 물류', am:'연태 항만 물류센터 견학', pm:'한중 무역 성공 기업 방문(한국 투자기업)', eve:'팀 만찬', tip:'항만 견학은 안전모 착용 필요' },
        { day:4, title:'체험 · 세미나', am:'포도 수확·와인 양조 체험(계절별 조정)', pm:'한중 무역 경영 세미나', eve:'팀 회식', tip:'포도 수확은 9~10월이 성수기' },
        { day:5, title:'정리 · 귀국', am:'시내 자유시간', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '연태 황금해변·와인 힐링 코스',
      subtitle: '아름다운 해변과 와인이 있는 연태에서 팀 힐링과 와인 문화 체험',
      highlights: ['연태 황금 해변 리조트 체험','장성 와이너리 투어·시음','신선한 해산물 팀 만찬','연태 시내 야시장 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 리조트 체크인', pm:'황금해변 아이스브레이킹', eve:'해산물 환영 만찬', tip:'여름철(6~9월)이 해수욕 최적기' },
        { day:2, title:'해변 리워드', am:'연태 황금 해변 자유 수영·해양스포츠', pm:'해변 리조트 팀 액티비티', eve:'팀 저녁', tip:'구명조끼 등 안전장비 확인' },
        { day:3, title:'와이너리 투어', am:'장성 와이너리 프라이빗 투어·시음', pm:'포도밭 산책', eve:'팀 만찬', tip:'시음 후 대리 이동 수단 확보 권장' },
        { day:4, title:'미식 · 야시장', am:'해산물 시장 투어·팀 만찬 준비', pm:'연태 시내 야시장 탐방', eve:'자유시간', tip:'야시장은 현금 소액권 준비' },
        { day:5, title:'자유시간 · 귀국', am:'시내 쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 마카오 ─────────────────────────────────────────────────────── */
  '마카오': [
    {
      title: '마카오 MICE·통합리조트 벤치마킹 코스',
      subtitle: '동서양 문화 융합 관광 산업의 성공 모델에서 사업 영감 획득',
      highlights: ['마카오 관광 성공 사례 강의','카지노·MICE 복합리조트 투어','한국 기업 파트너 미팅','마카오 경제개발 세미나'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'마카오국제공항 도착, 코타이 지역 호텔 체크인', pm:'세나도 광장 도보 탐방, 오리엔테이션', eve:'포르투갈 요리 환영 만찬', tip:'마카오는 페리로도 접근 가능(홍콩·선전 경유)' },
        { day:2, title:'MICE 산업 현장', am:'마카오정부관광청(MGTO) 방문, 관광 성공사례 강의', pm:'복합리조트 MICE 시설 투어(코타이 스트립)', eve:'팀 저녁', tip:'관광청 방문은 4주 전 신청 필요' },
        { day:3, title:'리조트 경영', am:'코타이 스트립 통합리조트 경영 현장 견학', pm:'한국 기업 파트너 미팅', eve:'팀 만찬', tip:'복합리조트 견학은 사전 승인 필요' },
        { day:4, title:'경제 세미나', am:'마카오 경제개발 세미나(투자유치청)', pm:'세계문화유산 구시가지 탐방', eve:'팀 만찬', tip:'구시가지는 도보 투어 추천' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '마카오 동서문화 팀빌딩 코스',
      subtitle: '동서양 문화가 공존하는 이국적 환경에서 팀 에너지·감성 충전',
      highlights: ['코타이 스트립 체험','세계문화유산 구시가지 투어','포르투갈 요리 팀 만찬','마카오 타워 스카이워크'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 코타이 호텔 체크인', pm:'세나도 광장 아이스브레이킹', eve:'포르투갈 요리 환영 만찬', tip:'에그타르트 명소 사전 리스트 공유 권장' },
        { day:2, title:'코타이 체험', am:'베네치안 마카오 곤돌라·쇼핑 자유 체험', pm:'코타이 스트립 팀 액티비티', eve:'팀 저녁', tip:'리조트 간 무료 셔틀버스 이용 가능' },
        { day:3, title:'세계유산 투어', am:'성 바울 성당 유적 등 세계문화유산 구시가지 투어', pm:'타이파 빌리지 골목 탐방', eve:'팀 만찬', tip:'도보 이동 편한 신발 권장' },
        { day:4, title:'스카이워크', am:'마카오 타워 스카이워크 체험(선택)', pm:'야경 크루즈 팀 만찬 준비', eve:'자유시간', tip:'스카이워크는 사전 예약 및 체중 제한 확인' },
        { day:5, title:'자유시간 · 귀국', am:'자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 가오슝 ─────────────────────────────────────────────────────── */
  '가오슝': [
    {
      title: '가오슝 항만물류·중공업 벤치마킹 코스',
      subtitle: '대만 최대 항구 물류·중공업 현장에서 글로벌 공급망 운영 인사이트',
      highlights: ['아시아 신항 물류허브 투어','대만 중공업 클러스터 현장 방문','중산대학 캠퍼스 교류','한국 기업 가오슝 법인 방문'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'가오슝국제공항 도착, 호텔 체크인', pm:'애하 인근 시내 오리엔테이션', eve:'대만 현지식 환영 만찬', tip:'가오슝 MRT로 시내 이동 편리' },
        { day:2, title:'항만물류 현장', am:'가오슝항(아시아 신항 물류허브) 현장 견학', pm:'물류 운영 전문가 브리핑', eve:'팀 저녁', tip:'항만 견학은 4주 전 신청 필요' },
        { day:3, title:'중공업 클러스터', am:'대만 중공업 클러스터(조선·철강) 현장 방문', pm:'한국 기업 가오슝 법인 방문', eve:'팀 만찬', tip:'안전모·안전화 준비 필요할 수 있음' },
        { day:4, title:'학술 교류', am:'국립중산대학 캠퍼스 방문·교류', pm:'보얼 예술특구 탐방', eve:'팀 만찬', tip:'중산대 방문은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '가오슝 항구야경·미식 팀빌딩 코스',
      subtitle: '활기찬 남대만 항구 문화 속에서 팀의 일체감과 즐거운 추억 만들기',
      highlights: ['보얼 예술특구 창조문화 탐방','애하 야경 유람선 만찬','류허 야시장 미식 투어','수신탕 해수욕장 자유 체험'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'애하 강변 아이스브레이킹 산책', eve:'대만 현지식 환영 만찬', tip:'가오슝은 남부라 기온이 높음 — 여름 복장 권장' },
        { day:2, title:'예술특구 탐방', am:'보얼 예술특구 창조문화 탐방', pm:'팀 사진촬영 · 갤러리 관람', eve:'팀 저녁', tip:'보얼 특구는 도보로 충분히 둘러볼 수 있음' },
        { day:3, title:'야경 · 미식', am:'자유시간', pm:'류허 야시장 미식 투어', eve:'애하 야경 유람선 팀 만찬', tip:'야시장은 현금 소액권 준비' },
        { day:4, title:'해변 자유 체험', am:'수신탕 해수욕장 자유 체험(수영·산책)', pm:'시즈완 해변 자유시간', eve:'팀 회식 · 성과 공유', tip:'해수욕장은 계절별 개장 여부 확인' },
        { day:5, title:'자유시간 · 귀국', am:'시내 쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 나트랑 ─────────────────────────────────────────────────────── */
  '나트랑': [
    {
      title: '나트랑 해양리조트 산업 벤치마킹 코스',
      subtitle: '동남아 최대 해양 리조트 도시에서 관광 산업 운영 노하우와 투자 기회 탐색',
      highlights: ['나트랑 관광 개발 현장 강의','VinGroup 리조트 운영 견학','한국 기업 투자 성공 사례 세미나','코코넛 제품 생산 현장 방문'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'캄란국제공항 도착, 나트랑 호텔 체크인', pm:'해변 시내 오리엔테이션', eve:'베트남 해산물 환영 만찬', tip:'무비자 체류 가능 기간 사전 확인 필요' },
        { day:2, title:'관광개발 현장', am:'나트랑 관광청 방문, 관광 개발 현장 강의', pm:'VinGroup 복합리조트(빈펄) 운영 견학', eve:'팀 저녁', tip:'빈펄 견학은 3주 전 신청 권장' },
        { day:3, title:'투자 · 산업', am:'한국 기업 베트남 투자 성공사례 세미나', pm:'코코넛 제품 생산 현장 방문(냐짱 인근)', eve:'팀 만찬', tip:'통역 가이드 사전 배정 필요' },
        { day:4, title:'문화 현장 탐방', am:'포나가르 참탑 문화유적 탐방', pm:'온천 머드배스 체험', eve:'팀 만찬', tip:'머드배스는 사전 예약 권장' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '나트랑 에메랄드 리조트 팀빌딩 코스',
      subtitle: '에메랄드빛 바다와 리조트 속에서 몸과 마음을 완벽하게 충전하는 팀 시간',
      highlights: ['호핑투어 4개 섬 스노클링','빈펄 케이블카·워터파크 자유 이용','나트랑 나이트마켓 해산물 투어','해변 선셋 팀 요가·명상'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 리조트 체크인', pm:'해변 아이스브레이킹', eve:'해산물 환영 만찬', tip:'야외 활동이 많아 가벼운 복장 권장' },
        { day:2, title:'호핑투어', am:'호핑투어 4개 섬 스노클링', pm:'선상 팀 액티비티', eve:'팀 저녁', tip:'방수 가방 준비 권장' },
        { day:3, title:'리조트 액티비티', am:'빈펄 케이블카 탑승 · 워터파크 자유 이용', pm:'팀 게임', eve:'팀 만찬', tip:'세계 최장 해상 케이블카 중 하나' },
        { day:4, title:'미식 · 힐링', am:'자유시간', pm:'나트랑 나이트마켓 해산물 투어', eve:'해변 선셋 팀 요가·명상', tip:'야시장은 흥정 가능' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 푸꾸옥 ─────────────────────────────────────────────────────── */
  '푸꾸옥': [
    {
      title: '푸꾸옥 섬 개발·에코투어리즘 벤치마킹 코스',
      subtitle: '10년 만에 세계적 리조트 섬으로 탈바꿈한 푸꾸옥 개발 모델 직접 학습',
      highlights: ['빈그룹 섬 개발 성공 사례 강의','에코 투어리즘 운영 현장 방문','수산업·후추 농업 현장 투어','섬 지속가능 개발 세미나'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'푸꾸옥국제공항 도착, 호텔 체크인', pm:'해변 시내 오리엔테이션', eve:'해산물 환영 만찬', tip:'체류기간별 무비자 조건 사전 확인' },
        { day:2, title:'섬개발 현장', am:'빈그룹 섬 개발 프로젝트 현장 강의', pm:'에코 투어리즘 운영 현장 방문', eve:'팀 저녁', tip:'개발 현장 견학 3주 전 신청 권장' },
        { day:3, title:'산업 탐방', am:'후추 농장 현장 투어', pm:'수산업(피시소스) 현장 견학 · 지속가능 개발 세미나', eve:'팀 만찬', tip:'후추 농장은 오전 방문이 쾌적' },
        { day:4, title:'케이블카 · 자연', am:'케이블카 탑승(안토이 제도 조망)', pm:'해변 자유 수영', eve:'팀 만찬', tip:'세계 최장 해상 케이블카 중 하나' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '푸꾸옥 에메랄드섬 힐링 팀빌딩 코스',
      subtitle: '베트남 최고의 섬 리조트에서 팀 전원이 꿈꾸는 완벽한 재충전과 힐링',
      highlights: ['푸꾸옥 사파리 동물원 자유 이용','그랜드 월드 야간 체험','케이블카·해변 자유 수영','신선한 해산물 시장 투어'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 리조트 체크인', pm:'해변 아이스브레이킹', eve:'해산물 환영 만찬', tip:'자외선이 강함 — 선크림 필수' },
        { day:2, title:'사파리 · 야간체험', am:'푸꾸옥 사파리 동물원 자유 이용', pm:'자유시간', eve:'그랜드 월드 야간 축제 체험', tip:'사파리는 오전 방문 시 동물 활동이 활발' },
        { day:3, title:'케이블카 · 해변', am:'케이블카 탑승', pm:'해변 자유 수영·해양스포츠', eve:'팀 만찬', tip:'물놀이 용품 사전 준비 권장' },
        { day:4, title:'미식 투어', am:'자유시간', pm:'해산물 시장 투어', eve:'팀 BBQ 만찬', tip:'시장은 흥정 문화가 있음' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 마닐라 ─────────────────────────────────────────────────────── */
  '마닐라': [
    {
      title: '마닐라 BPO·IT서비스 산업 벤치마킹 코스',
      subtitle: '영어권 IT 서비스·BPO 글로벌 허브 마닐라에서 디지털 산업 전략 탐구',
      highlights: ['아얄라·BGC 글로벌 BPO 기업 견학','필리핀 IT 산업 성장 강의','PEZA 특별경제구역 현장 방문','한국 기업 마닐라 법인 방문'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'니노이아키노국제공항 도착, 마카티 호텔 체크인', pm:'시내 오리엔테이션', eve:'필리핀 현지식 환영 만찬', tip:'마닐라는 교통 혼잡 — 이동시간 여유 있게 계획' },
        { day:2, title:'BPO 산업 현장', am:'아얄라·BGC 지구 글로벌 BPO 기업 견학', pm:'필리핀 IT 산업 성장 강의', eve:'팀 저녁', tip:'BPO 기업 견학 4주 전 신청 필요' },
        { day:3, title:'경제구역 · 법인', am:'PEZA 특별경제구역 현장 방문', pm:'한국 기업 마닐라 법인 방문', eve:'팀 만찬', tip:'경제구역 출입은 신분증 지참 필수' },
        { day:4, title:'학술 교류', am:'아테네오대학 또는 드라살대학 방문·강의', pm:'BGC 아트 디스트릭트 탐방', eve:'팀 만찬', tip:'대학 방문은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'마닐라 공항 혼잡 — 출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '마닐라 역사문화 팀빌딩 코스',
      subtitle: '역사와 현대가 공존하는 마닐라에서 팀 화합과 필리핀 문화 감수성 넓히기',
      highlights: ['인트라무로스 성벽 역사 투어','마닐라 베이 선셋 크루즈 만찬','BGC 현대 예술 지구 탐방','필리핀 전통 공연 및 민속 체험'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹 산책', eve:'필리핀 현지식 환영 만찬', tip:'저녁 시간대 이동은 교통체증 고려' },
        { day:2, title:'역사지구 투어', am:'인트라무로스 성벽 역사 투어', pm:'산티아고 요새 탐방', eve:'팀 저녁', tip:'도보 투어 편한 신발 권장' },
        { day:3, title:'선셋 크루즈', am:'자유시간', pm:'BGC 현대 예술 지구 탐방', eve:'마닐라 베이 선셋 크루즈 팀 만찬', tip:'우기철 크루즈 일정 변동 가능' },
        { day:4, title:'전통문화 체험', am:'필리핀 전통 공연 관람 및 민속 체험', pm:'자유시간', eve:'팀 회식', tip:'공연장 사전 예약 필요' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 보홀 ───────────────────────────────────────────────────────── */
  '보홀': [
    {
      title: '보홀 에코투어리즘 산업 벤치마킹 코스',
      subtitle: '세계가 주목하는 지속가능 생태 관광 성공 모델 보홀에서 에코 사업 인사이트',
      highlights: ['에코 투어리즘 성공 사례 강의','초콜릿 힐 생태 보전 현장 방문','마발리캇 해양 보호구역 투어','지역 커뮤니티 관광 개발 모델'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'보홀-팡라오국제공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'필리핀 해산물 환영 만찬', tip:'세부에서 페리로도 접근 가능' },
        { day:2, title:'에코투어리즘 강의', am:'보홀 관광청 에코 투어리즘 성공사례 강의', pm:'초콜릿 힐 생태 보전 현장 방문', eve:'팀 저녁', tip:'우기(7~12월) 대비 우산 준비' },
        { day:3, title:'해양보호구역', am:'마발리캇 해양 보호구역 투어', pm:'지역 커뮤니티 관광 개발 모델 탐방', eve:'팀 만찬', tip:'스노클링 장비 지참 권장' },
        { day:4, title:'자연 체험', am:'안경원숭이 보호구역 방문', pm:'롭복강 크루즈 자연 탐방', eve:'팀 만찬', tip:'안경원숭이는 야행성 — 플래시 촬영 금지' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '보홀 초콜릿힐 자연 팀빌딩 코스',
      subtitle: '지구 어디에도 없는 초콜릿 힐과 안경원숭이 등 희귀한 자연 체험',
      highlights: ['초콜릿 힐 일출 트레킹','안경원숭이 새벽 먹이 체험','알로나 비치 해양 스포츠','롭복강 크루즈 자연 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 알로나비치 호텔 체크인', pm:'해변 아이스브레이킹', eve:'해산물 환영 만찬', tip:'알로나비치는 스노클링 명소' },
        { day:2, title:'초콜릿힐 일출', am:'초콜릿 힐 일출 트레킹', pm:'안경원숭이 새벽 먹이 체험', eve:'팀 저녁', tip:'일출 트레킹은 새벽 이른 출발 필요' },
        { day:3, title:'해양 스포츠', am:'알로나 비치 스노클링·다이빙', pm:'팀 게임', eve:'팀 만찬', tip:'리프세이프 선크림 사용 권장' },
        { day:4, title:'강 크루즈', am:'자유시간', pm:'롭복강 크루즈 자연 탐방(현지식 뷔페 포함)', eve:'팀 회식', tip:'크루즈 중 전통 공연 관람 가능' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 코타키나발루 ───────────────────────────────────────────────── */
  '코타키나발루': [
    {
      title: '코타키나발루 열대자원 개발 벤치마킹 코스',
      subtitle: '열대우림 자원 개발과 지속가능한 성장 전략을 보르네오에서 직접 탐구',
      highlights: ['말레이시아 팜오일 생산 현장','환경 지속가능 개발 전문 강의','사바대학 연구소 방문','코타키나발루 항만 현장 견학'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'코타키나발루국제공항 도착, 호텔 체크인', pm:'워터프런트 시내 오리엔테이션', eve:'말레이 현지식 환영 만찬', tip:'무슬림 문화권 — 복장 예절 사전 안내 권장' },
        { day:2, title:'팜오일 산업', am:'말레이시아 팜오일 생산 현장 방문', pm:'환경 지속가능 개발 전문 강의', eve:'팀 저녁', tip:'농장 방문은 4주 전 신청 필요' },
        { day:3, title:'학술 · 물류', am:'사바대학 연구소 방문·교류', pm:'코타키나발루 항만 현장 견학', eve:'팀 만찬', tip:'사바대 방문은 4주 전 신청 필요' },
        { day:4, title:'자연 현장', am:'키나발루 국립공원 트레킹', pm:'오랑우탄 보호구역 방문', eve:'팀 만찬', tip:'국립공원 입산은 사전 허가 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
    {
      title: '코타키나발루 석양·자연 팀빌딩 코스',
      subtitle: '세계 최고 석양과 열대 바다, 오랑우탄 등 보르네오 자연 속 특별한 팀 추억',
      highlights: ['풀라우 사피 스노클링·다이빙 투어','키나발루 국립공원 트레킹','세계 3대 석양 워터프런트 만찬','오랑우탄 보호구역 방문'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'워터프런트 아이스브레이킹', eve:'말레이 현지식 환영 만찬', tip:'습도가 높아 통풍 좋은 복장 권장' },
        { day:2, title:'섬 스노클링', am:'풀라우 사피 섬 스노클링·다이빙 투어', pm:'선상 팀 액티비티', eve:'팀 저녁', tip:'해양공원 입장료 별도 — 사전 확인' },
        { day:3, title:'자연 트레킹', am:'키나발루 국립공원 트레킹', pm:'오랑우탄 보호구역 방문', eve:'팀 만찬', tip:'트레킹화·우비 준비 권장' },
        { day:4, title:'석양 만찬', am:'자유시간', pm:'가야 거리 탐방', eve:'세계 3대 석양 워터프런트 팀 만찬', tip:'일몰 1시간 전 자리 확보 권장' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
  ],

  /* ─── 캄보디아 ───────────────────────────────────────────────────── */
  '캄보디아': [
    {
      title: '캄보디아 경제특구·신흥시장 벤치마킹 코스',
      subtitle: '급성장하는 캄보디아 시장에서 의류·제조·관광 분야 신흥시장 기회 탐구',
      highlights: ['캄보디아 경제특구 제조업 현장','한국 기업 의류·제조 현지화 사례','프놈펜 투자 기회 세미나','캄보디아 관광 성장 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'프놈펜국제공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'크메르 현지식 환영 만찬', tip:'캄보디아는 미화(USD) 통용 지역이 많음' },
        { day:2, title:'경제특구 현장', am:'캄보디아 경제특구(SEZ) 산업 견학', pm:'한국 기업 의류·제조 현지화 사례 강의', eve:'팀 저녁', tip:'경제특구 방문은 4주 전 신청 필요' },
        { day:3, title:'투자 세미나', am:'프놈펜 한국 기업 진출 사례 강의', pm:'캄보디아 국립대학 방문', eve:'팀 만찬', tip:'대학 방문은 4주 전 신청 필요' },
        { day:4, title:'관광 산업', am:'캄보디아 관광 성장 강의(관광부)', pm:'앙코르와트 유적 현장 방문(시엠립 이동)', eve:'팀 만찬', tip:'프놈펜-시엠립 이동 소요시간 고려 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
    {
      title: '캄보디아 앙코르와트 감동 팀빌딩 코스',
      subtitle: '인류 최대 유산 앙코르와트 일출 앞에서 팀 전원이 느끼는 경이와 감동',
      highlights: ['앙코르와트 새벽 일출 특별 관람','앙코르톰·바욘 사원 역사 투어','타프롬 영화촬영지 탐방','톤레삽 호수 황금빛 선셋 크루즈'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'시엠립국제공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'크메르 현지식 환영 만찬', tip:'시엠립은 앙코르 유적 관광 거점 도시' },
        { day:2, title:'앙코르와트 일출', am:'앙코르와트 새벽 일출 특별 관람', pm:'앙코르톰·바욘 사원 역사 투어', eve:'팀 저녁', tip:'일출 관람은 새벽 4시경 이동 필요' },
        { day:3, title:'유적 탐방', am:'타프롬 영화촬영지 탐방', pm:'자유시간', eve:'팀 만찬', tip:'유적 내 그늘이 적어 모자·물 준비 필수' },
        { day:4, title:'호수 크루즈', am:'자유시간', pm:'톤레삽 호수 황금빛 선셋 크루즈', eve:'팀 만찬', tip:'톤레삽 수상가옥 문화 체험 가능' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
  ],

  /* ─── 치앙마이 ───────────────────────────────────────────────────── */
  '치앙마이': [
    {
      title: '치앙마이 창업·디지털노마드 벤치마킹 코스',
      subtitle: '소규모 창업·디지털노마드·공정무역의 현장 치앙마이에서 신사업 모델 인사이트',
      highlights: ['치앙마이대 농업·교육 혁신 강의','디지털 노마드 코워킹 공간 방문','공정무역 커피·수공예 기업 현장','치앙마이 스타트업 생태계 탐방'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'치앙마이국제공항 도착, 호텔 체크인', pm:'올드시티 시내 오리엔테이션', eve:'북부 태국 요리 환영 만찬', tip:'방콕 대비 물가·교통이 여유로움' },
        { day:2, title:'학술 · 창업 현장', am:'치앙마이대학 방문, 농업·교육 혁신 강의', pm:'디지털 노마드 코워킹 공간 방문', eve:'팀 저녁', tip:'대학 방문은 4주 전 신청 필요' },
        { day:3, title:'공정무역 탐방', am:'공정무역 커피·수공예 사회적 기업 방문', pm:'치앙마이 스타트업 생태계 탐방', eve:'팀 만찬', tip:'사회적 기업 방문은 3주 전 예약 권장' },
        { day:4, title:'문화 체험', am:'도이수텝 사원 탐방', pm:'나이트 바자르 자유 탐방', eve:'팀 만찬', tip:'사원 방문 시 노출 적은 복장 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '치앙마이 코끼리·힐링 팀빌딩 코스',
      subtitle: '코끼리와 함께하는 특별한 체험과 북부 태국 문화 속에서 팀 힐링과 결속',
      highlights: ['코끼리 보호구역 반나절 체험','도이수텝 사원 트레킹·일몰','태국 쿠킹 클래스(북부 요리)','나이트 바자르·선데이마켓 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'올드시티 아이스브레이킹', eve:'북부 태국 요리 환영 만찬', tip:'저녁 기온이 낮아 얇은 겉옷 권장' },
        { day:2, title:'코끼리 체험', am:'코끼리 보호구역 반나절 체험(목욕·먹이주기)', pm:'자유시간', eve:'팀 저녁', tip:'윤리적 운영이 검증된 보호구역으로 진행' },
        { day:3, title:'사원 · 요리 체험', am:'도이수텝 사원 트레킹', pm:'태국 쿠킹 클래스(북부 요리)', eve:'도이수텝 일몰 감상 · 팀 만찬', tip:'쿠킹 클래스는 사전 식자재 알레르기 확인' },
        { day:4, title:'야시장 탐방', am:'자유시간', pm:'나이트 바자르·선데이마켓 탐방', eve:'팀 회식', tip:'선데이마켓은 일요일에만 운영' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 라오스 ─────────────────────────────────────────────────────── */
  '라오스': [
    {
      title: '라오스 물류허브 경제개발 벤치마킹 코스',
      subtitle: '인도차이나 물류 허브로 떠오르는 라오스에서 신흥 시장 투자 가능성 직접 탐구',
      highlights: ['사완나켓 경제특구 제조업 견학','라오스 관광 개발 현황 강의','메콩 수력발전 프로젝트 현장','라오스-중국 철도 개발 현장 방문'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'비엔티안 왓따이국제공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'라오스 현지식 환영 만찬', tip:'메콩강을 사이에 두고 태국과 인접' },
        { day:2, title:'경제특구 견학', am:'비엔티안 경제특구(SSEZ) 산업 방문', pm:'라오스 관광 개발 현황 강의', eve:'팀 저녁', tip:'경제특구 방문은 4주 전 신청 필요' },
        { day:3, title:'인프라 현장', am:'메콩강 수력발전 프로젝트 현장 견학', pm:'라오스-중국 철도 개발 현장 방문', eve:'팀 만찬', tip:'인프라 현장 방문은 사전 승인 필요' },
        { day:4, title:'학술 교류', am:'라오스 국립대학 방문·교류', pm:'왓시엥통 사원 탐방', eve:'팀 만찬', tip:'대학 방문은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
    {
      title: '라오스 메콩강 힐링 팀빌딩 코스',
      subtitle: '세상에서 가장 느린 나라 라오스의 평화로운 메콩강 물결 속에서 팀 마음 깊은 힐링',
      highlights: ['루앙프라방 탁발 새벽 의식 참관','꽝시 에메랄드 폭포 수영 체험','메콩강 선셋 슬로우 보트 크루즈','왓시엥통 사원 황금 일몰 감상'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'루앙프라방국제공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'라오스 현지식 환영 만찬', tip:'루앙프라방은 유네스코 세계유산 고도(古都)' },
        { day:2, title:'탁발 체험', am:'루앙프라방 탁발 새벽 의식 참관', pm:'자유시간', eve:'팀 저녁', tip:'참관 시 정숙한 복장과 태도 필요' },
        { day:3, title:'폭포 체험', am:'꽝시 에메랄드 폭포 트레킹·수영 체험', pm:'자유시간', eve:'팀 만찬', tip:'수영복·아쿠아슈즈 준비 권장' },
        { day:4, title:'강 크루즈', am:'왓시엥통 사원 탐방', pm:'자유시간', eve:'메콩강 선셋 슬로우 보트 크루즈 팀 만찬', tip:'크루즈 중 전통 음악 공연이 있는 경우도 있음' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 카자흐스탄 ─────────────────────────────────────────────────── */
  '카자흐스탄': [
    {
      title: '카자흐스탄 자원경제 벤치마킹 코스',
      subtitle: '자원 대국 카자흐스탄 신흥 시장의 투자 기회와 한-카 협력 사례를 현장에서 직접 탐구',
      highlights: ['나자르바예프대학 첨단 연구소 방문','AIFC 카자흐스탄 금융 허브 견학','에너지·광물 자원 개발 현장 강의','한국 기업 카자흐스탄 진출 사례'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'알마티국제공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'카자흐 전통 요리 환영 만찬', tip:'알마티-아스타나 국내선 이동 일정 고려 필요' },
        { day:2, title:'금융허브 견학', am:'아스타나 이동, AIFC(국제금융센터) 견학', pm:'에너지·광물 자원 개발 현장 강의', eve:'팀 저녁', tip:'AIFC 방문은 4주 전 신청 필요' },
        { day:3, title:'학술 교류', am:'나자르바예프대학 첨단 연구소 방문·강의', pm:'한국 기업 카자흐스탄 진출 사례 세미나', eve:'팀 만찬', tip:'대학 방문은 4주 전 신청 필요' },
        { day:4, title:'도시 탐방', am:'아스타나 미래 건축(바이테렉 타워 등) 도보 탐방', pm:'자유시간', eve:'바이테렉 타워 야경 투어 · 팀 만찬', tip:'겨울철 매우 추움 — 방한 대비 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '카자흐스탄 실크로드 팀빌딩 코스',
      subtitle: '실크로드의 유산과 초원 대자연이 살아있는 카자흐스탄에서 팀의 특별한 이색 경험',
      highlights: ['빅알마티 호수 산악 트레킹','아스타나 누르아스타나 야경 투어','카자흐 전통 게르 체험·승마','전통 독수리 사냥 시범 관람'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'알마티국제공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'카자흐 전통 요리 환영 만찬', tip:'고지대 지역이 있어 컨디션 조절 필요' },
        { day:2, title:'호수 트레킹', am:'빅알마티 호수 산악 트레킹', pm:'팀 피크닉', eve:'팀 저녁', tip:'트레킹화·방풍 겉옷 준비' },
        { day:3, title:'전통 체험', am:'카자흐 전통 게르 체험·승마', pm:'전통 독수리 사냥 시범 관람', eve:'팀 만찬', tip:'승마는 초보자용 코스로 진행' },
        { day:4, title:'야경 투어', am:'아스타나 이동', pm:'누르아스타나 야경 투어', eve:'팀 회식', tip:'아스타나 이동은 국내선 이용' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 멜버른 ─────────────────────────────────────────────────────── */
  '멜버른': [
    {
      title: '멜버른 교육·바이오산업 벤치마킹 코스',
      subtitle: '호주 최고 교육·연구 도시에서 의료·바이오·핀테크 미래 산업 트렌드 체득',
      highlights: ['멜버른대학 연구소 캠퍼스 방문','핀테크·바이오 스타트업 투어','호주 의료 기기 산업 현장','멜버른 스마트시티 현황 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'멜버른 공항 도착, 호텔 체크인', pm:'야라강변 시내 오리엔테이션', eve:'호주식 환영 만찬', tip:'날씨 변화가 잦아 겉옷 준비 권장' },
        { day:2, title:'학술 현장', am:'멜버른대학 연구소 캠퍼스 방문·강의', pm:'모나시대학 교류 미팅', eve:'팀 저녁', tip:'대학 방문은 4주 전 신청 필요' },
        { day:3, title:'스타트업 탐방', am:'핀테크·바이오 스타트업 투어', pm:'호주 의료 기기 산업 현장 방문', eve:'팀 만찬', tip:'스타트업 허브 방문은 3주 전 예약' },
        { day:4, title:'스마트시티', am:'멜버른 스마트시티 현황 강의(시청)', pm:'CBD 도시계획 현장 탐방', eve:'팀 만찬', tip:'시청 브리핑은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '멜버른 커피·예술 팀빌딩 코스',
      subtitle: '커피·예술·스포츠가 살아있는 멜버른에서 팀 감성과 라이프스타일 충전',
      highlights: ['야라강 선셋 디너 크루즈','멜버른 CBD 커피 문화 탐방','그레이트오션로드 투어','세인트킬다 비치 자유 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'호주식 환영 만찬', tip:'낮과 밤의 기온차가 커 겉옷 준비' },
        { day:2, title:'커피 문화 탐방', am:'멜버른 CBD 커피 문화 탐방(레인웨이 카페거리)', pm:'자유시간', eve:'팀 저녁', tip:'유명 카페는 대기 시간이 있을 수 있음' },
        { day:3, title:'그레이트오션로드', am:'그레이트오션로드 투어(12사도 전망)', pm:'투어 계속', eve:'팀 만찬', tip:'이동시간이 길어 이른 출발 권장' },
        { day:4, title:'강 크루즈', am:'자유시간', pm:'세인트킬다 비치 자유 탐방', eve:'야라강 선셋 디너 크루즈', tip:'크루즈는 사전 예약 필수' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 호주(브리즈번·골드코스트) ─────────────────────────────────── */
  '호주': [
    {
      title: '브리즈번 교육·자원산업 벤치마킹 코스',
      subtitle: '퀸즐랜드 교육·자원·스마트시티 현장에서 호주 선진 산업 모델 직접 체험',
      highlights: ['UQ 캠퍼스·연구소 방문','브리즈번 스마트시티 인프라 견학','호주 자원·광업 현장 방문','퀸즐랜드 농업 혁신 사례 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'브리즈번 공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'호주식 환영 만찬', tip:'일조량이 많아 선크림 필수' },
        { day:2, title:'학술 현장', am:'퀸즐랜드대학(UQ) 캠퍼스·연구소 방문', pm:'교수 강의', eve:'팀 저녁', tip:'UQ 방문은 4주 전 신청 필요' },
        { day:3, title:'스마트시티 · 자원', am:'브리즈번 스마트시티 인프라 견학', pm:'호주 자원·광업 현장 방문', eve:'팀 만찬', tip:'광업 현장은 안전교육 이수 필요' },
        { day:4, title:'농업 혁신', am:'퀸즐랜드 농업 혁신 사례 강의', pm:'현장 견학', eve:'팀 만찬', tip:'농장 방문은 3주 전 신청 권장' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '골드코스트 서핑 팀빌딩 코스',
      subtitle: '황금 해변과 세계적인 테마파크에서 팀 모두가 즐기는 완벽한 골드코스트 연수',
      highlights: ['골드코스트 서핑 레슨 팀 체험','무비월드 테마파크 자유 이용','모튼 아일랜드 스노클링·돌고래 먹이주기','서퍼스 파라다이스 비치 자유 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 서퍼스 파라다이스 호텔 체크인', pm:'해변 아이스브레이킹', eve:'환영 만찬', tip:'서핑 체험은 사전 신청 필요' },
        { day:2, title:'서핑 체험', am:'골드코스트 서핑 레슨 팀 체험', pm:'해변 자유시간', eve:'팀 저녁', tip:'래시가드 등 준비물 사전 안내' },
        { day:3, title:'테마파크', am:'무비월드 테마파크 자유 이용', pm:'테마파크 계속', eve:'팀 만찬', tip:'인기 놀이기구는 패스트패스 활용 권장' },
        { day:4, title:'섬 투어', am:'모튼 아일랜드 이동, 탕갈루마 난파선 스노클링', pm:'돌고래 먹이주기 체험·해변 자유시간', eve:'팀 만찬', tip:'페리 이동 시간을 고려한 이른 출발 필요' },
        { day:5, title:'자유시간 · 귀국', am:'서퍼스 파라다이스 자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 오클랜드 ───────────────────────────────────────────────────── */
  '오클랜드': [
    {
      title: '오클랜드 청정에너지·혁신농업 벤치마킹 코스',
      subtitle: '청정 자연과 혁신 농업이 공존하는 뉴질랜드에서 지속가능 산업 모델 선진 학습',
      highlights: ['오클랜드대 농업·생명과학 연구소','뉴질랜드 낙농·와인 수출 산업 현장','지열 에너지 발전소 현장 방문','마오리 문화 산업화 사례'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'오클랜드 공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'뉴질랜드식 환영 만찬', tip:'남반구라 계절이 한국과 반대' },
        { day:2, title:'학술 현장', am:'오클랜드대학 농업·생명과학 연구소 방문·강의', pm:'교류 미팅', eve:'팀 저녁', tip:'대학 방문은 4주 전 신청 필요' },
        { day:3, title:'산업 현장', am:'낙농·와인 수출 산업 현장 견학', pm:'지열 에너지 발전소 현장 방문', eve:'팀 만찬', tip:'발전소 견학은 사전 승인 필요' },
        { day:4, title:'문화 탐방', am:'마오리 문화 산업화 사례 탐방', pm:'마오리 공연 관람', eve:'팀 만찬', tip:'공연 관람은 사전 예약 권장' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '오클랜드 어드벤처 팀빌딩 코스',
      subtitle: '남반구 뉴질랜드 대자연에서 팀 모두가 경험하는 짜릿한 어드벤처',
      highlights: ['스카이타워 스카이점프·전망대','와이토모 형광 동굴 보트 투어','마오리 문화 공연·항기 저녁','뉴질랜드 대자연 트레킹'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'환영 만찬', tip:'일교차가 크니 겉옷 준비' },
        { day:2, title:'스카이타워', am:'스카이타워 스카이점프·전망대 체험', pm:'자유시간', eve:'팀 저녁', tip:'스카이점프는 체중 제한 확인' },
        { day:3, title:'반딧불이 동굴', am:'와이토모 반딧불이 동굴 보트 투어', pm:'투어 계속', eve:'팀 만찬', tip:'동굴 내부는 저온 — 겉옷 필수' },
        { day:4, title:'문화 체험', am:'마오리 문화 공연·항기(hangi) 저녁 준비', pm:'뉴질랜드 대자연 트레킹', eve:'마오리 항기 디너', tip:'공연 관람은 사전 예약 필요' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 사이판 ─────────────────────────────────────────────────────── */
  '사이판': [
    {
      title: '사이판 태평양 역사·관광산업 벤치마킹 코스',
      subtitle: '태평양 전쟁 역사와 현대 관광 산업이 공존하는 사이판에서 역사·산업 이해 확장',
      highlights: ['사이판 관광 산업 현황 강의','역사 유적(자살절벽) 방문','NMC 대학 캠퍼스 교류','태평양 전쟁 역사 투어'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'사이판국제공항 도착, 호텔 체크인', pm:'개러펜 시내 오리엔테이션', eve:'차모로 현지식 환영 만찬', tip:'미국령 — 무비자 입국 조건 사전 확인' },
        { day:2, title:'관광산업 현장', am:'사이판 관광청 방문, 관광 산업 현황 강의', pm:'현장 탐방', eve:'팀 저녁', tip:'관광청 방문은 4주 전 신청 필요' },
        { day:3, title:'역사 탐방', am:'태평양 전쟁 역사 투어(자살절벽·만세절벽)', pm:'전쟁기념관 탐방', eve:'팀 만찬', tip:'역사 유적 탐방은 경건한 태도 필요' },
        { day:4, title:'학술 교류', am:'NMC(북마리아나대학) 캠퍼스 방문·교류', pm:'자유시간', eve:'팀 만찬', tip:'NMC 방문은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
    {
      title: '사이판 마나가하 팀빌딩 코스',
      subtitle: '세상에서 가장 투명한 바다 마나가하에서 팀 전원이 꿈꾸는 열대 리조트 연수',
      highlights: ['마나가하 섬 1일 해양 스포츠','제트스키·바나나보트 팀 체험','비치 선셋 팀 바베큐 파티','수베틱 비치 자유 수영·낚시'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'해변 아이스브레이킹', eve:'차모로 환영 만찬', tip:'미국 달러 사용 — 환전 사전 준비' },
        { day:2, title:'마나가하 섬', am:'마나가하 섬 1일 해양 스포츠(스노클링·다이빙)', pm:'섬 자유시간', eve:'팀 저녁', tip:'섬 이동은 보트로 약 10분' },
        { day:3, title:'해양 액티비티', am:'제트스키·바나나보트 팀 체험', pm:'자유시간', eve:'팀 만찬', tip:'구명조끼 착용 필수' },
        { day:4, title:'비치 파티', am:'수베틱 비치 자유 수영·낚시', pm:'자유시간', eve:'비치 선셋 팀 바베큐 파티', tip:'저녁 바베큐는 우천 시 실내 대체 가능' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 2시간 반 전 도착 권장' },
      ],
    },
  ],

  /* ─── 영국 ───────────────────────────────────────────────────────── */
  '영국': [
    {
      title: '옥스브리지·런던 금융 벤치마킹 코스',
      subtitle: '세계 최고 대학과 금융 허브에서 글로벌 리더 감각과 전문성을 한 단계 도약',
      highlights: ['옥스퍼드 크라이스트 처치 캠퍼스 방문','케임브리지 킹스칼리지 강의 세션','런던 시티 금융지구 워킹 투어','BBC 방송국 견학·미디어 세미나'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'히스로공항 도착, 런던 호텔 체크인', pm:'웨스트민스터 도보 탐방, 오리엔테이션', eve:'영국 전통 요리 환영 만찬', tip:'오이스터카드 첫날 준비 권장' },
        { day:2, title:'옥스퍼드 방문', am:'옥스퍼드 크라이스트 처치 캠퍼스 방문', pm:'대학 도시 도보 탐방', eve:'팀 저녁', tip:'캠퍼스 투어는 4주 전 예약 필요' },
        { day:3, title:'케임브리지 방문', am:'케임브리지 킹스칼리지 강의 세션', pm:'캠강 펀팅 체험', eve:'팀 만찬', tip:'킹스칼리지 방문은 4주 전 신청 필요' },
        { day:4, title:'금융 · 미디어', am:'런던 시티 금융지구 워킹 투어', pm:'BBC 방송국 견학·미디어 세미나', eve:'팀 만찬', tip:'금융지구 투어는 평일 오전 권장' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '런던 문화 아이콘 팀빌딩 코스',
      subtitle: '해리포터·뮤지컬·애프터눈 티 등 런던 문화 아이콘 체험으로 팀 결속과 즐거움',
      highlights: ['웨스트엔드 뮤지컬 특별 관람','해리포터 워너브라더스 스튜디오','버킹엄 궁전·타워브리지 투어','노팅힐·코벤트가든 자유 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'히스로공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'환영 만찬', tip:'날씨 변덕이 심함 — 우산 지참 권장' },
        { day:2, title:'스튜디오 투어', am:'해리포터 워너브라더스 스튜디오 투어', pm:'자유시간', eve:'팀 저녁', tip:'스튜디오 투어는 6주 전 예약 필수' },
        { day:3, title:'랜드마크 투어', am:'버킹엄 궁전 근위병 교대식 관람', pm:'타워브리지 투어', eve:'팀 만찬', tip:'근위병 교대식은 격일 진행 — 사전 확인' },
        { day:4, title:'문화 체험', am:'애프터눈 티 팀 체험', pm:'자유시간', eve:'웨스트엔드 뮤지컬 특별 관람', tip:'뮤지컬 티켓은 4주 전 예매 권장' },
        { day:5, title:'자유시간 · 귀국', am:'노팅힐·코벤트가든 자유 탐방', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 네덜란드 ───────────────────────────────────────────────────── */
  '네덜란드': [
    {
      title: '로테르담·델프트 혁신산업 벤치마킹 코스',
      subtitle: '세계 최고 항만·농업·반도체 장비 나라 네덜란드에서 혁신 산업 벤치마킹',
      highlights: ['로테르담 세계 최대 항만 물류 투어','ASML 반도체 장비 혁신 센터 방문','델프트 공대 혁신 연구소','암스테르담 핀테크 허브 탐방'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'스키폴공항 도착, 암스테르담 호텔 체크인', pm:'운하 지구 도보 탐방, 오리엔테이션', eve:'네덜란드 전통 요리 환영 만찬', tip:'자전거 통행이 많아 보행 시 자전거도로 주의' },
        { day:2, title:'항만 물류', am:'로테르담 이동, 세계 최대 항만 물류 투어', pm:'투어 계속', eve:'팀 저녁', tip:'항만 투어는 4주 전 신청 필요' },
        { day:3, title:'반도체 · 연구', am:'에인트호벤 이동, ASML 반도체 장비 혁신 센터 방문', pm:'델프트 이동, 델프트 공대 혁신 연구소 방문', eve:'팀 만찬', tip:'ASML 견학은 6주 전 신청 필요(보안 절차), 도시 간 이동거리가 있어 이른 출발 권장' },
        { day:4, title:'핀테크 탐방', am:'암스테르담 핀테크 허브 탐방', pm:'와게닝엔대 농업 연구 브리핑', eve:'팀 만찬', tip:'핀테크 허브 방문은 3주 전 예약' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '풍차·튤립 낭만 팀빌딩 코스',
      subtitle: '동화 속 풍차·튤립·운하의 나라에서 팀 모두가 동심으로 돌아가는 낭만 연수',
      highlights: ['잔세스칸스 풍차·치즈 농장 방문','암스테르담 운하 디너 크루즈','국립미술관 렘브란트 컬렉션 투어','튤립 공원·화훼 경매 투어'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'스키폴공항 도착, 호텔 체크인', pm:'운하 지구 아이스브레이킹', eve:'환영 만찬', tip:'도보·자전거 혼용 도로 — 이동 시 주의' },
        { day:2, title:'풍차 마을', am:'잔세스칸스 풍차·치즈 농장 방문', pm:'나막신 공방 체험', eve:'팀 저녁', tip:'풍차 마을은 반나절 투어로 충분' },
        { day:3, title:'미술관 · 크루즈', am:'국립미술관 렘브란트 컬렉션 투어', pm:'자유시간', eve:'암스테르담 운하 디너 크루즈', tip:'미술관은 사전 예약 필수(대기 최소화)' },
        { day:4, title:'튤립 투어', am:'튤립 공원·화훼 경매 투어(시즌 3~5월)', pm:'자유시간', eve:'팀 만찬', tip:'튤립 시즌 외에는 화훼 경매장 위주로 대체 진행' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 스페인 ─────────────────────────────────────────────────────── */
  '스페인': [
    {
      title: '바르셀로나 혁신·디자인산업 벤치마킹 코스',
      subtitle: '유럽 스타트업·디자인·에너지 혁신의 중심 스페인에서 미래 산업 인사이트 확보',
      highlights: ['ESADE 비즈니스스쿨 유럽 경영 강의','SEAT 자동차 공장·혁신센터 견학','바르셀로나 22@ 스타트업 구역 탐방','스페인 태양광·신재생에너지 현장'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'바르셀로나 엘프라트공항 도착, 호텔 체크인', pm:'람블라스 거리 도보 탐방, 오리엔테이션', eve:'스페인 타파스 환영 만찬', tip:'저녁식사 시간이 늦은 편(21시 이후)' },
        { day:2, title:'자동차 산업', am:'SEAT 자동차 공장·혁신센터 견학', pm:'견학 계속', eve:'팀 저녁', tip:'SEAT 공장 견학은 6주 전 신청 필요' },
        { day:3, title:'스타트업 탐방', am:'바르셀로나 22@ 스타트업 구역 탐방', pm:'ESADE 비즈니스스쿨 유럽 경영 강의', eve:'팀 만찬', tip:'22@ 지구는 도보 투어 추천' },
        { day:4, title:'신재생에너지', am:'스페인 태양광·신재생에너지 현장 견학', pm:'자유시간', eve:'팀 만찬', tip:'현장 견학은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '가우디·플라멩코 팀빌딩 코스',
      subtitle: '가우디 건축의 경이로움과 플라멩코 열정으로 팀 감성과 에너지를 한껏 충전',
      highlights: ['사그라다 파밀리아·구엘 공원 투어','플라멩코 디너쇼·타파스 파티','바르셀로나 해변 자유 탐방','피카소 미술관·람블라스 거리'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'타파스 환영 만찬', tip:'소매치기 주의 — 소지품 관리 당부' },
        { day:2, title:'가우디 건축', am:'사그라다 파밀리아 투어', pm:'구엘 공원 탐방', eve:'팀 저녁', tip:'사그라다 파밀리아는 4주 전 예약 필수' },
        { day:3, title:'미술관 탐방', am:'피카소 미술관 관람', pm:'람블라스 거리 자유 탐방', eve:'플라멩코 디너쇼·타파스 파티', tip:'플라멩코 공연은 4주 전 예약 권장' },
        { day:4, title:'해변 자유', am:'바르셀로네타 해변 자유 탐방', pm:'자유시간', eve:'팀 회식', tip:'여름철에는 해변 수영 가능' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 동유럽(프라하·빈·부다페스트) ──────────────────────────────── */
  '동유럽': [
    {
      title: '동유럽 IT·산업허브 벤치마킹 코스',
      subtitle: 'EU 가입 후 급성장한 동유럽 IT·산업 허브에서 신흥 시장 기회와 글로벌 인사이트',
      highlights: ['체코 IT·방위 산업 혁신 사례 강의','빈 UNIDO 국제산업개발기구 방문','부다페스트 스타트업 생태계 투어','동유럽 EU 가입 경제 성장 세미나'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'프라하공항 도착, 호텔 체크인', pm:'구시가지 도보 탐방, 오리엔테이션', eve:'체코 전통 요리 환영 만찬', tip:'3개국 이동 일정 — 짐 정리 효율적으로' },
        { day:2, title:'체코 산업 현장', am:'체코 IT·방위 산업 혁신 사례 강의(대학 연계)', pm:'현장 방문', eve:'팀 저녁', tip:'대학 방문은 4주 전 신청 필요' },
        { day:3, title:'빈 이동 · 국제기구', am:'빈 이동, UNIDO(국제산업개발기구) 방문·강의', pm:'브리핑 계속', eve:'팀 만찬', tip:'국제기구 방문은 6주 전 신청 필요' },
        { day:4, title:'부다페스트 스타트업', am:'부다페스트 이동, 스타트업 생태계 투어', pm:'동유럽 EU 가입 경제 성장 세미나', eve:'팀 만찬', tip:'3개국 이동은 열차 이용이 효율적' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '동유럽 중세도시 팀빌딩 코스',
      subtitle: '동화 같은 중세 도시 3개국 탐방으로 팀 문화 감수성과 유럽 역사 안목 확장',
      highlights: ['프라하 천문시계·구시가 광장 야경','부다페스트 세체니 온천 팀 체험','빈 쇤브룬 궁전·오페라 관람','다뉴브 강 크루즈 팀 만찬'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'프라하공항 도착, 호텔 체크인', pm:'구시가지 아이스브레이킹', eve:'환영 만찬', tip:'자갈길이 많아 편한 신발 권장' },
        { day:2, title:'프라하 야경', am:'구시가지 광장 자유 탐방', pm:'카를교 산책', eve:'프라하 천문시계·구시가 광장 야경 탐방 · 팀 저녁', tip:'야경 투어는 저녁 늦게 진행' },
        { day:3, title:'빈 이동 · 궁전', am:'빈 이동, 쇤브룬 궁전 탐방', pm:'오페라 관람(공연 일정에 따라)', eve:'팀 만찬', tip:'오페라 관람 시 정장 권장' },
        { day:4, title:'부다페스트 온천', am:'부다페스트 이동, 세체니 온천 팀 체험', pm:'자유시간', eve:'다뉴브 강 크루즈 팀 만찬', tip:'온천은 수영복 지참 필요' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 북유럽 ─────────────────────────────────────────────────────── */
  '북유럽': [
    {
      title: '북유럽 복지·스마트시티 벤치마킹 코스',
      subtitle: '세계 최고 행복지수 북유럽에서 복지·교육·스마트시티·그린에너지 선진 모델 체득',
      highlights: ['KTH 왕립공대 미래 기술 강의','노르딕 스타트업 생태계 탐방','덴마크 복지 행정 현장 방문','북유럽 그린에너지 혁신 현장'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'스톡홀름 알란다공항 도착, 호텔 체크인', pm:'감라스탄 구시가지 도보 탐방, 오리엔테이션', eve:'북유럽 전통 요리 환영 만찬', tip:'물가가 높은 편 — 예산 사전 안내 권장' },
        { day:2, title:'학술 현장', am:'왕립공대(KTH) 방문·미래 기술 강의', pm:'캠퍼스 투어', eve:'팀 저녁', tip:'KTH 방문은 4주 전 신청 필요' },
        { day:3, title:'스타트업 탐방', am:'노르딕 스타트업 생태계 탐방', pm:'북유럽 그린에너지 혁신 현장 방문', eve:'팀 만찬', tip:'그린에너지 현장은 사전 승인 필요' },
        { day:4, title:'복지 행정', am:'코펜하겐 이동, 덴마크 복지 행정 현장 방문(연계 프로그램)', pm:'브리핑 계속', eve:'팀 만찬', tip:'복지기관 방문은 6주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '북유럽 오로라·피오르 팀빌딩 코스',
      subtitle: '지구상 가장 아름다운 자연 오로라·피오르에서 팀 모두가 감동받는 생애 최고 연수',
      highlights: ['오로라 특별 관측 팀 캠프','피오르 크루즈 절경 감상','바이킹 마을 전통 생활 체험','북유럽 스파·사우나 팀 힐링'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'시내 아이스브레이킹', eve:'환영 만찬', tip:'겨울철 방문 시 방한 장비 철저히 준비' },
        { day:2, title:'오로라 캠프', am:'자유시간', pm:'이동 준비', eve:'오로라 특별 관측 팀 캠프(겨울철)', tip:'오로라는 날씨·태양활동에 따라 관측 여부 유동적' },
        { day:3, title:'피오르 크루즈', am:'피오르 크루즈 절경 감상', pm:'크루즈 계속', eve:'팀 만찬', tip:'크루즈는 방수 재킷 준비 권장' },
        { day:4, title:'바이킹 체험', am:'바이킹 마을 전통 생활 체험', pm:'자유시간', eve:'북유럽 스파·사우나 팀 힐링', tip:'사우나 문화 사전 안내 권장' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 서유럽(영·프·독·벨·네 복수국가) ───────────────────────────── */
  '서유럽': [
    {
      title: '서유럽 복수국가 산업 벤치마킹 코스',
      subtitle: '복수 유럽 국가 현장 방문으로 글로벌 비즈니스 감각과 다국적 협력 역량 강화',
      highlights: ['EU 본부·유럽의회 방문·강의','영국·프랑스·독일 주요 기업 탐방','명문 대학 복수 방문 강의','유럽 산업 트렌드 통합 세미나'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'런던 히스로공항 도착, 호텔 체크인', pm:'시내 오리엔테이션', eve:'환영 만찬', tip:'복수국가 일정 — 여권·기차표 관리 철저히' },
        { day:2, title:'런던 기업 탐방', am:'런던 주요 기업 탐방', pm:'명문대학 강의', eve:'팀 저녁', tip:'유로스타로 다음 도시 이동 준비' },
        { day:3, title:'브뤼셀 · EU', am:'브뤼셀 이동, EU 본부·유럽의회 방문·강의', pm:'브리핑 계속', eve:'팀 만찬', tip:'EU 본부 방문은 8주 전 신청 필요' },
        { day:4, title:'파리 · 독일 연계', am:'파리 이동, 프랑스 기업 탐방', pm:'독일 연계 세미나', eve:'팀 만찬', tip:'국가 간 이동은 열차 이용이 효율적' },
        { day:5, title:'정리 · 귀국', am:'통합 세미나 · 성과 공유', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '서유럽 랜드마크 팀빌딩 코스',
      subtitle: '유럽 여러 나라를 한 번에 즐기며 팀이 함께 만드는 생애 최고의 유럽 여행',
      highlights: ['파리 에펠탑·런던 웨스트엔드 투어','스위스 알프스 융프라우 탐방','독일 크리스마스 마켓·맥주 체험','다양한 유럽 미식·쇼핑 자유 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'런던 도착, 호텔 체크인', pm:'웨스트엔드 아이스브레이킹', eve:'환영 만찬', tip:'유레일패스 등 교통패스 사전 준비 권장' },
        { day:2, title:'파리 랜드마크', am:'유로스타로 파리 이동', pm:'에펠탑 투어', eve:'팀 저녁', tip:'에펠탑 전망대는 사전 예약 권장' },
        { day:3, title:'스위스 알프스', am:'스위스 이동', pm:'융프라우 알프스 탐방', eve:'팀 만찬', tip:'고산지대 — 방한 겉옷 준비' },
        { day:4, title:'독일 체험', am:'독일 이동', pm:'크리스마스 마켓(시즌) 또는 구시가지 투어', eve:'팀 만찬', tip:'계절에 따라 대체 프로그램으로 진행' },
        { day:5, title:'자유시간 · 귀국', am:'자유 쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 로스앤젤레스 ───────────────────────────────────────────────── */
  '로스앤젤레스': [
    {
      title: 'LA 실리콘비치·엔터 산업 벤치마킹 코스',
      subtitle: '미국 IT·엔터테인먼트 혁신의 중심 LA에서 글로벌 비즈니스 트렌드 직접 체감',
      highlights: ['구글 실리콘비치 오피스 견학','UCLA 앤더슨 스쿨 비즈니스 강의','LA 스타트업 생태계 탐방','한인타운 비즈니스 성공 사례 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'LAX 공항 도착, 호텔 체크인', pm:'산타모니카 도보 탐방, 오리엔테이션', eve:'환영 만찬', tip:'LA는 이동거리가 길어 일정 여유 있게 계획' },
        { day:2, title:'실리콘비치', am:'구글 실리콘비치 오피스 견학', pm:'LA 스타트업 생태계 탐방', eve:'팀 저녁', tip:'기업 견학은 6주 전 신청 필요' },
        { day:3, title:'학술 현장', am:'UCLA 앤더슨 스쿨 비즈니스 강의', pm:'캠퍼스 투어', eve:'팀 만찬', tip:'UCLA 방문은 4주 전 신청 필요' },
        { day:4, title:'한인 비즈니스', am:'한인타운 비즈니스 성공 사례 강의', pm:'자유시간', eve:'팀 만찬', tip:'한인타운은 통역 부담이 적음' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: 'LA 할리우드 엔터테인먼트 팀빌딩 코스',
      subtitle: '할리우드 스타들의 도시에서 팀 모두가 스타가 되는 특별한 LA 엔터테인먼트 연수',
      highlights: ['유니버설스튜디오 VIP 투어·백스테이지','산타모니카 피어 자유 탐방','그리피스 전망대 LA 야경 감상','베니스 비치·아보트 키니 아트 투어'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'LAX 공항 도착, 호텔 체크인', pm:'산타모니카 아이스브레이킹', eve:'환영 만찬', tip:'자외선이 강함 — 선크림 필수' },
        { day:2, title:'유니버설스튜디오', am:'유니버설스튜디오 VIP 투어·백스테이지 체험', pm:'스튜디오 자유 이용', eve:'팀 저녁', tip:'VIP 투어는 사전 예약 필요' },
        { day:3, title:'야경 · 비치', am:'베니스 비치·아보트 키니 아트 투어', pm:'자유시간', eve:'그리피스 전망대 LA 야경 감상', tip:'그리피스 전망대는 주차 공간이 제한적' },
        { day:4, title:'자유 탐방', am:'산타모니카 피어 자유 탐방', pm:'비벌리힐스 로데오 드라이브', eve:'팀 회식', tip:'쇼핑 예산 사전 안내' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 샌프란시스코 ───────────────────────────────────────────────── */
  '샌프란시스코': [
    {
      title: '실리콘밸리·스탠퍼드 혁신 벤치마킹 코스',
      subtitle: '세계 혁신의 심장 실리콘밸리에서 IT 트렌드·VC 생태계·스타트업 정신 직접 흡수',
      highlights: ['구글플렉스·애플 파크 캠퍼스 견학','스탠퍼드 d.school 디자인씽킹 강의','VC 투자사 피치 세션 참관','SF 스타트업 허브 탐방'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'SFO 공항 도착, 호텔 체크인', pm:'유니언스퀘어 시내 오리엔테이션', eve:'환영 만찬', tip:'실리콘밸리는 도시간 이동거리가 길어 차량 이동 권장' },
        { day:2, title:'빅테크 캠퍼스', am:'구글플렉스·애플 파크 캠퍼스 견학', pm:'견학 계속', eve:'팀 저녁', tip:'캠퍼스 견학은 8주 전 신청 필요' },
        { day:3, title:'스탠퍼드', am:'스탠퍼드 d.school 디자인씽킹 강의', pm:'캠퍼스 투어', eve:'팀 만찬', tip:'스탠퍼드 방문은 6주 전 신청 필요' },
        { day:4, title:'VC 생태계', am:'VC 투자사 피치 세션 참관', pm:'SF 스타트업 허브 탐방', eve:'팀 만찬', tip:'피치 세션 참관은 사전 승인 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: 'SF 금문교·와이너리 팀빌딩 코스',
      subtitle: '금문교의 석양과 나파밸리 와인으로 팀 감성을 충전하는 낭만적인 SF 연수',
      highlights: ['금문교 자전거·도보 투어','나파밸리 와이너리 프라이빗 투어','알카트라즈 투어','피어39·피셔맨즈워프 자유 탐방'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'SFO 공항 도착, 호텔 체크인', pm:'피셔맨즈워프 아이스브레이킹', eve:'환영 만찬', tip:'밤낮 기온차가 커 겉옷 준비 필요' },
        { day:2, title:'금문교 투어', am:'금문교 자전거·도보 투어', pm:'석양 감상', eve:'팀 저녁', tip:'자전거 대여 사전 예약 권장' },
        { day:3, title:'나파밸리', am:'나파밸리 와이너리 프라이빗 투어·시음', pm:'투어 계속', eve:'팀 만찬', tip:'시음 후 대리 이동 수단 확보 권장' },
        { day:4, title:'알카트라즈', am:'알카트라즈 투어', pm:'피어39·피셔맨즈워프 자유 탐방', eve:'팀 회식', tip:'알카트라즈 투어는 조기 매진 — 4주 전 예약 필수' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 워싱턴 ─────────────────────────────────────────────────────── */
  '워싱턴': [
    {
      title: '워싱턴 D.C. 공공정책 벤치마킹 코스',
      subtitle: '세계 최강 미국 행정·외교·연구 기관 현장 탐방으로 공공 정책과 글로벌 리더십 체득',
      highlights: ['국무부·의회도서관 공식 방문','스미스소니언 항공우주박물관 투어','조지타운대 정책 강의','세계은행·IMF 방문 세미나'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'덜레스공항 도착, 호텔 체크인', pm:'워싱턴 몰 도보 탐방, 오리엔테이션', eve:'환영 만찬', tip:'정부기관 방문 시 신분증 상시 지참' },
        { day:2, title:'정부기관 방문', am:'국무부·의회도서관 공식 방문', pm:'방문 계속', eve:'팀 저녁', tip:'국무부 방문은 8주 전 신청 및 신원조회 필요' },
        { day:3, title:'학술 · 국제기구', am:'조지타운대 정책 강의', pm:'세계은행·IMF 방문 세미나', eve:'팀 만찬', tip:'국제기구 방문은 6주 전 신청 필요' },
        { day:4, title:'박물관 탐방', am:'스미스소니언 항공우주박물관 투어', pm:'자유시간', eve:'팀 만찬', tip:'무료 입장, 인기 전시는 사전 예약 권장' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '워싱턴 역사문화 팀빌딩 코스',
      subtitle: '역사와 예술이 살아있는 미국 수도 워싱턴에서 팀 교양과 역사 감각 키우기',
      highlights: ['링컨 기념관·워싱턴 모뉴먼트 야경','스미스소니언 12개 박물관 자유 탐방','조지타운 운하·레스토랑 팀 만찬','체서피크 운하 산책'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'워싱턴 몰 아이스브레이킹', eve:'환영 만찬', tip:'도보 이동이 많아 편한 신발 권장' },
        { day:2, title:'기념관 야경', am:'한국전 참전용사 기념비 방문', pm:'자유시간', eve:'링컨 기념관·워싱턴 모뉴먼트 야경 탐방', tip:'야경 투어는 저녁 늦게 진행' },
        { day:3, title:'박물관 탐방', am:'스미스소니언 12개 박물관 자유 탐방', pm:'탐방 계속', eve:'팀 만찬', tip:'하루에 다 보기 어려워 관심 분야 선택 권장' },
        { day:4, title:'조지타운', am:'체서피크 운하 산책', pm:'자유시간', eve:'조지타운 레스토랑 팀 만찬', tip:'운하 산책로는 도보로 편안하게 이동' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 하와이 ─────────────────────────────────────────────────────── */
  '하와이': [
    {
      title: '하와이 청정에너지·관광산업 벤치마킹 코스',
      subtitle: '세계 최초 100% 청정에너지 전환 주 하와이에서 지속가능 에너지·관광 모델 탐구',
      highlights: ['하와이대 해양연구소·환경과학 강의','하와이 100% 신재생에너지 전환 현장','하이테크 기업·국방 연구 클러스터 방문','하와이 관광 MICE 산업 현황 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'호놀룰루공항 도착, 와이키키 호텔 체크인', pm:'와이키키 해변 오리엔테이션', eve:'하와이안 환영 만찬', tip:'자외선이 매우 강함 — 선크림 필수' },
        { day:2, title:'학술 현장', am:'하와이대학(UH) 해양연구소·환경과학 강의', pm:'캠퍼스 투어', eve:'팀 저녁', tip:'대학 방문은 4주 전 신청 필요' },
        { day:3, title:'청정에너지', am:'하와이 100% 신재생에너지 전환 현장 견학', pm:'현장 브리핑', eve:'팀 만찬', tip:'에너지 현장 견학은 6주 전 신청 필요' },
        { day:4, title:'하이테크 산업', am:'HTDC 하이테크 클러스터 탐방', pm:'하와이 관광 MICE 산업 현황 강의', eve:'팀 만찬', tip:'클러스터 방문은 4주 전 신청 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '하와이 알로하 리워드 팀빌딩 코스',
      subtitle: '알로하 정신 가득한 하와이에서 팀 모두가 꿈꾸는 최고의 리워드 연수 실현',
      highlights: ['루아우 파티 하와이안 공연·만찬','할레아칼라 분화구 일출 감상','와이키키 서핑·스탠드업 패들','폴리네시안 문화센터 공연 관람'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'호놀룰루공항 도착, 와이키키 호텔 체크인', pm:'해변 아이스브레이킹', eve:'환영 만찬', tip:'리조트 수영장·해변 이용 규정 사전 안내' },
        { day:2, title:'서핑 체험', am:'와이키키 서핑·스탠드업 패들 레슨', pm:'자유시간', eve:'팀 저녁', tip:'서핑 강습은 사전 예약 필요' },
        { day:3, title:'루아우 파티', am:'자유시간', pm:'폴리네시안 문화센터 공연 관람', eve:'루아우 파티 하와이안 공연·만찬', tip:'루아우 파티는 4주 전 예약 권장' },
        { day:4, title:'분화구 일출', am:'할레아칼라 분화구 일출 감상', pm:'자유시간', eve:'팀 회식', tip:'새벽 이른 출발 필요, 방한 겉옷 준비' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 밴쿠버 ─────────────────────────────────────────────────────── */
  '밴쿠버': [
    {
      title: '밴쿠버 영상·친환경산업 벤치마킹 코스',
      subtitle: '영상·게임·친환경 산업의 글로벌 허브 밴쿠버에서 첨단 콘텐츠·지속가능 산업 체험',
      highlights: ['UBC 캠퍼스·연구소 방문','EA·유비소프트 밴쿠버 스튜디오 견학','브리티시컬럼비아 친환경 산업 투어','밴쿠버 스타트업 생태계 탐방'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'밴쿠버공항 도착, 호텔 체크인', pm:'개스타운 도보 탐방, 오리엔테이션', eve:'환영 만찬', tip:'강수량이 많은 편 — 우산 준비' },
        { day:2, title:'학술 현장', am:'UBC(브리티시컬럼비아대) 캠퍼스·연구소 방문', pm:'캠퍼스 투어', eve:'팀 저녁', tip:'UBC 방문은 4주 전 신청 필요' },
        { day:3, title:'영상 산업', am:'EA·유비소프트 밴쿠버 스튜디오 견학', pm:'견학 계속', eve:'팀 만찬', tip:'게임 스튜디오 견학은 6주 전 신청 필요' },
        { day:4, title:'친환경 산업', am:'브리티시컬럼비아 친환경 산업 투어', pm:'밴쿠버 스타트업 생태계 탐방', eve:'팀 만찬', tip:'친환경 산업 현장은 사전 승인 필요' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '밴쿠버 로키·태평양 팀빌딩 코스',
      subtitle: '로키 설산과 태평양 바다가 만나는 밴쿠버 대자연에서 팀 어드벤처와 힐링 동시에',
      highlights: ['캐필라노 현수교·래프팅 어드벤처','휘슬러 스키·스노보드 전일 자유 이용','밴쿠버 항구 선셋 크루즈 만찬','스탠리 파크 자전거·피크닉'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'개스타운 아이스브레이킹', eve:'환영 만찬', tip:'방수 재킷 준비 권장' },
        { day:2, title:'현수교 체험', am:'캐필라노 현수교 체험', pm:'래프팅 어드벤처(계절별)', eve:'팀 저녁', tip:'래프팅은 계절에 따라 대체 액티비티로 진행' },
        { day:3, title:'휘슬러', am:'휘슬러 이동', pm:'스키·스노보드 전일 자유 이용(겨울철) 또는 하이킹', eve:'팀 만찬', tip:'여름철은 짚라인·하이킹으로 대체' },
        { day:4, title:'항구 · 공원', am:'스탠리 파크 자전거·피크닉', pm:'자유시간', eve:'밴쿠버 항구 선셋 크루즈 팀 만찬', tip:'자전거 대여소는 공원 입구에 위치' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

  /* ─── 토론토 ─────────────────────────────────────────────────────── */
  '토론토': [
    {
      title: '토론토 AI·금융산업 벤치마킹 코스',
      subtitle: '캐나다 AI·금융·다문화 비즈니스의 중심 토론토에서 미래 산업과 글로벌 다양성 체험',
      highlights: ['토론토대학 AI·로보틱스 연구소 방문','벡터인스티튜트 AI 혁신 강의','토론토 금융지구 기업 투어','다문화 비즈니스 성공 사례 강의'],
      days: [
        { day:1, title:'입국 · 오리엔테이션', am:'토론토 피어슨공항 도착, 호텔 체크인', pm:'다운타운 도보 탐방, 오리엔테이션', eve:'환영 만찬', tip:'다문화 도시 — 다양한 식문화 체험 가능' },
        { day:2, title:'AI 연구 현장', am:'토론토대학 AI·로보틱스 연구소 방문', pm:'벡터인스티튜트 AI 혁신 강의', eve:'팀 저녁', tip:'연구소 방문은 6주 전 신청 필요' },
        { day:3, title:'금융지구', am:'토론토 금융지구(베이 스트리트) 기업 투어', pm:'투어 계속', eve:'팀 만찬', tip:'금융지구 투어는 평일 오전 권장' },
        { day:4, title:'다문화 비즈니스', am:'다문화 비즈니스 성공 사례 강의', pm:'자유시간', eve:'팀 만찬', tip:'다문화 커뮤니티 탐방 병행 가능' },
        { day:5, title:'정리 · 귀국', am:'자유시간·쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
    {
      title: '토론토 나이아가라 팀빌딩 코스',
      subtitle: '세계 3대 폭포 나이아가라의 장엄함과 CN타워 스릴에서 팀 전원이 최고의 감동 경험',
      highlights: ['나이아가라 폭포 보트·헬리 투어','CN 타워 유리 바닥 에지워크 체험','토론토 아일랜드 선셋 크루즈','재즈·블루스 공연 관람'],
      days: [
        { day:1, title:'입국 · 팀 오리엔테이션', am:'공항 도착, 호텔 체크인', pm:'다운타운 아이스브레이킹', eve:'환영 만찬', tip:'사계절 기온차가 큼 — 계절별 복장 확인' },
        { day:2, title:'나이아가라 투어', am:'나이아가라 폭포 이동, 보트 투어(혼블로어)', pm:'헬리콥터 투어(선택)', eve:'팀 저녁', tip:'보트 투어는 우비 제공되나 옷이 젖을 수 있음' },
        { day:3, title:'CN 타워', am:'토론토 복귀', pm:'CN 타워 유리 바닥 에지워크 체험', eve:'팀 만찬', tip:'에지워크는 사전 예약 및 체중 제한 확인' },
        { day:4, title:'아일랜드 크루즈', am:'자유시간', pm:'토론토 아일랜드 선셋 크루즈', eve:'재즈·블루스 공연 관람', tip:'공연장 사전 예약 권장' },
        { day:5, title:'자유시간 · 귀국', am:'쇼핑', pm:'공항 이동', eve:'귀국', tip:'출발 3시간 전 도착 권장' },
      ],
    },
  ],

}; /* ITINERARY_DB 끝 */

/* ════════════════════════════════════════════════════════════════════
   프로그램 유형의 이름 (RK)

   왜 여기 있는가: 이 값은 원래 index.html의 <select id="programType"> 안에만
   있었다. 그런데 관리자 화면이 **"이 코스는 어떤 유형에서 방식 A로 나가는가"**를
   보여주려면 같은 이름이 필요하다. admin.html에 다시 적으면 두 벌이 되고, 두 벌은
   반드시 어긋난다(결함 생성기 ①). 그래서 아는 곳을 여기 하나로 둔다.
   ⚠ 키는 아래 PROGRAM_PRIORITY의 키와 **반드시 같아야** 한다.
   ai-loop/test_rK_course_role.js가 index.html의 option과 이 표를 대조한다.

   label = 고객이 STEP1에서 고르는 그 문구(index.html의 option과 같아야 한다).
   short = 관리자 코스 탭 배지처럼 자리가 좁은 곳에서 쓰는 짧은 이름.
   ════════════════════════════════════════════════════════════════════ */
const PROGRAM_TYPES = {
  language:   { label: '언어 집중 연수',       short: '언어' },
  leadership: { label: '리더십 / 조직문화',    short: '리더십' },
  industry:   { label: '산업체 실무 연수',     short: '산업' },
  academic:   { label: '교육기관 / 연구 연수', short: '교육' },
};

/* ════════════════════════════════════════════════════════════════════
   프로그램 유형 × 목적지별 코스 우선순위
   [primaryIdx, secondaryIdx]  — 배열 인덱스 초과 시 자동 fallback

   ⚠ **이 표가 관리자의 '코스 A·B·C'와 고객의 '방식 A·B'를 갈라놓는다.**
   고객이 고른 프로그램 유형에 따라 어느 코스가 방식 A로 나갈지가 바뀐다.
   예: 도쿄 + 언어 집중 연수 → 방식 A는 **코스 C**(인덱스 2)다.
   두 화면을 나란히 놓고 봐도 A가 A로 안 보이는 이유가 이것이라,
   관리자 화면의 코스 탭에 이 매핑을 배지로 띄운다(RK).
   ════════════════════════════════════════════════════════════════════ */
const PROGRAM_PRIORITY = {
  /* language  = 언어집중연수  (인덱스 2 = 전용 언어코스)
     leadership= 리더십·조직문화
     industry  = 산업체 실무연수
     academic  = 교육기관·연구연수                              */
  '도쿄':        { language:[2,1], leadership:[1,0], industry:[0,1], academic:[0,1] },
  '싱가포르':    { language:[2,0], leadership:[1,0], industry:[0,1], academic:[0,1] },
  '뉴욕':        { language:[2,0], leadership:[0,1], industry:[0,1], academic:[1,0] },
  '파리':        { language:[0,1], leadership:[0,1], industry:[1,0], academic:[1,0] },
  '독일':        { language:[0,1], leadership:[1,0], industry:[0,1], academic:[1,0] },
  '시드니':      { language:[2,0], leadership:[0,1], industry:[0,1], academic:[0,1] },
  '홍콩':        { language:[0,1], leadership:[0,1], industry:[0,1], academic:[1,0] },
  '상해':        { language:[1,0], leadership:[0,1], industry:[0,1], academic:[1,0] },
  '하노이':      { language:[0,1], leadership:[1,0], industry:[0,1], academic:[1,0] },
  '방콕':        { language:[2,1], leadership:[1,0], industry:[0,1], academic:[0,1] },
  '발리':        { language:[0,1], leadership:[0,1], industry:[1,0], academic:[1,0] },
  '우즈베키스탄':{ language:[0,1], leadership:[1,0], industry:[1,0], academic:[0,1] },
  '몽골':        { language:[1,0], leadership:[1,0], industry:[0,1], academic:[0,1] },
  '대만':        { language:[0,1], leadership:[1,0], industry:[0,1], academic:[0,1] },
};

/* 위 두 표의 Node 쪽 출구 (RK). ⚠ 파일 앞부분의 module.exports 블록에 넣을 수 없다 —
   그 블록은 여기보다 먼저 실행되는데 PROGRAM_TYPES·PROGRAM_PRIORITY는 아직 선언 전
   (TDZ)이라 로드가 통째로 죽는다. 그래서 선언 뒤인 여기에 따로 둔다.
   감사 도구·테스트가 index.html의 select와 이 표를 대조하는 데 쓴다. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports.PROGRAM_TYPES = PROGRAM_TYPES;
  module.exports.PROGRAM_PRIORITY = PROGRAM_PRIORITY;
}

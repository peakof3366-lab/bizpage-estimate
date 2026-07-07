const form = document.getElementById('estimateForm');
const destinationSelect = document.getElementById('destination');
const nextButton  = document.getElementById('nextStepButton');
const backButton = document.getElementById('backStepButton');
const downloadButton = document.getElementById('downloadEstimate');
const stepElements = Array.from(document.querySelectorAll('.estimate-step'));

const estimateCriteria = {
  programFactor: {
    language: 1.0,
    leadership: 1.12,
    industry: 1.18,
    academic: 1.05,
  },
  organizationFactor: {
    company: 1.0,
    public: 1.06,
    education: 0.95,
  },
  formula: '항공+유류+숙박+식비+차량+가이드+관광+마진 × 프로그램 계수 × 기관 계수',
};

/* ══════════════════════════════════════════════════════════════════
   정확도 향상 3요소 (v3)
   ══════════════════════════════════════════════════════════════════ */

/* ① 출발 공항 — 항공·유류 단가 조정 계수
   기준: 인천(ICN). 지방 공항은 노선 제한 + 경유 발생으로 단가 상승 */
const DEPARTURE_CITIES = [
  { value: 'ICN', label: '서울 · 인천 (ICN)', factor: 1.00 },
  { value: 'GMP', label: '서울 · 김포 (GMP)', factor: 1.00 },
  { value: 'PUS', label: '부산 · 김해 (PUS)', factor: 1.07 },
  { value: 'TAE', label: '대구 (TAE)',         factor: 1.13 },
  { value: 'KWJ', label: '광주 (KWJ)',         factor: 1.14 },
  { value: 'CJU', label: '제주 (CJU)',         factor: 1.16 },
];

/* ② 항공 좌석 등급 — 노선 거리별 비즈니스 배율
   유류할증료는 좌석 등급과 무관하므로 airFactor만 적용
   단거리(일본·동북아) 2.5× / 중거리(동남아·오세아니아 등) 3.2× / 장거리(유럽·미주) 4.0×
   ⚠ 이중 관리 주의: 아래 목록은 data.js의 destinationRates[].destination_key,
   index.html의 <select id="destination"> 옵션 목록과 반드시 1:1로 일치해야 합니다.
   여기 없는 destKey가 들어오면 getBizFactor()가 조용히 'short'(가장 저렴한 구간)로
   폴백되어 견적 금액이 틀어집니다 (2026-07-06 야간 점검 시 확인 결과 현재는 정확히 일치함). */
const BIZ_ZONES = {
  short: ['도쿄','오사카','후쿠오카','나고야','삿포로','오키나와',
          '상해','장가계','청도','연태','홍콩','마카오','대만','가오슝','몽골'],
  mid:   ['싱가포르','하노이','호치민','다낭','나트랑','푸꾸옥',
          '마닐라','세부','보홀','코타키나발루','캄보디아',
          '방콕','푸켓','치앙마이','발리','라오스',
          '우즈베키스탄','카자흐스탄',
          '시드니','멜버른','오클랜드','괌','사이판'],
  long:  ['영국','파리','로마','독일','네덜란드','스페인','동유럽','북유럽','서유럽',
          '로스앤젤레스','샌프란시스코','뉴욕','워싱턴','하와이','밴쿠버','토론토','호주'],
};
const BIZ_ZONE_FACTORS = { short: 2.5, mid: 3.2, long: 4.0 };

function getBizFactor(destKey) {
  if (BIZ_ZONES.long.includes(destKey))  return BIZ_ZONE_FACTORS.long;
  if (BIZ_ZONES.mid.includes(destKey))   return BIZ_ZONE_FACTORS.mid;
  /* 방어코드: BIZ_ZONES는 destinationRates와 별도로 관리되는 하드코딩 목록이라,
     새 목적지를 destinationRates에 추가하면서 이 목록 갱신을 빠뜨리면 조용히
     최저 구간(short, 2.5×)으로 폴백되어 비즈니스석 견적이 저평가될 수 있다.
     개발/운영 중 이런 누락을 빨리 발견할 수 있도록 콘솔 경고만 남긴다
     (가격 로직 자체는 변경하지 않음). */
  if (!BIZ_ZONES.short.includes(destKey)) {
    console.warn(`[견적] "${destKey}"가 BIZ_ZONES(short/mid/long) 어디에도 등록되어 있지 않아 short(2.5×)로 폴백 적용됩니다. BIZ_ZONES 목록 갱신이 필요할 수 있습니다.`);
  }
  return BIZ_ZONE_FACTORS.short;
}

/* ③ 객실 구성 — rooms 산정 함수
   double: 2인 1실 전원 (기본)
   single: 1인 1실 전원
   mixed : 지정 인원은 1인 1실, 나머지는 2인 1실 */
const ROOM_CONFIG = {
  double: { label: '2인 1실 (기본)', calcRooms: (n)         => Math.ceil(n / 2) },
  single: { label: '1인 1실 (전원)', calcRooms: (n)         => n                },
  mixed:  { label: '혼합 (임원 1인 1실)', calcRooms: (n, vip) => Math.min(vip, n) + Math.ceil(Math.max(n - vip, 0) / 2) },
};

/* ④ 차량 정원 — 대형/소형 관광버스 통상 좌석수 (가정치)
   버그④수정: 기존 로직은 인원수와 무관하게 차량을 항상 1대로 고정 계산했음.
   국내 관광버스 업계에서 통용되는 근사 정원(대형 45인승·소형 25인승)을 기준으로
   Math.ceil(인원/정원)만큼 대수를 산정한다. 실제 계약 차량의 정원이 다르면
   이 값만 조정하면 된다. */
const VEHICLE_CAPACITY = { large: 45, small: 25 };

let currentStep = 1;
const stepTrackerItems = Array.from(document.querySelectorAll('.step-tracker-item'));

function setActiveStep(step) {
  currentStep = step;
  stepElements.forEach((element) => {
    const stepNumber = Number(element.dataset.step);
    element.classList.toggle('step-active', stepNumber === step);
  });
  stepTrackerItems.forEach((element) => {
    const stepNumber = Number(element.dataset.stepTrack);
    element.classList.toggle('active', stepNumber === step);
  });
}

function validateStep(step) {
  const inputs = Array.from(document.querySelectorAll(`.estimate-step[data-step="${step}"] [required]`));
  return inputs.every((input) => input.value.trim());
}

function getDestinationByKey(key) {
  return destinationRates.find((item) => item.destination_key === key);
}

/* ── Level 1 헬퍼: 인원 구간 티어 ──────────────────────────────── */
function getPaxTier(n) {
  return PAX_TIERS.find(t => n >= t.min && n <= t.max) || PAX_TIERS[0];
}

/* ── 버그③수정: 인원 구간 경계 비단조성(총액 역전) 방지 ──────────────
   기존 방식은 전체 인원이 "그 인원수가 속한 구간"의 할인율을 소급 적용받아,
   구간 경계를 막 넘는 순간(예: 29명→30명) 오히려 총액이 줄어드는 문제가 있었음.
   소득세 누진공제처럼 각 구간에 해당하는 인원수만큼만 그 구간의 계수를 적용해
   합산하면, 인원이 1명 늘 때 추가되는 금액이 항상 0 이상이라 총액이 인원수에
   대해 항상 non-decreasing함이 보장된다. tiers는 {min,max,factor} 형태이며
   구간이 서로 겹치지 않고 연속되어야 한다(PAX_TIERS 등). ─────────────── */
function tieredTotal(unitBase, participants, tiers) {
  let total = 0;
  for (const t of tiers) {
    if (participants < t.min) continue;
    const countInBracket = Math.min(participants, t.max) - t.min + 1;
    total += Math.round(unitBase * t.factor) * countInBracket;
  }
  return total;
}

/* ── Level 1 헬퍼: 출발월 → 시즌 정보 (남반구 목적지는 현지 계절 기준 별도 적용) ── */
function getSeasonInfo(dateStr, destKey) {
  const config = (typeof SOUTHERN_HEMISPHERE_DESTS !== 'undefined' && SOUTHERN_HEMISPHERE_DESTS.includes(destKey))
    ? SEASON_CONFIG_SOUTHERN
    : SEASON_CONFIG;
  if (!dateStr) return config.find(s => s.id === 'normal');
  const month = new Date(dateStr).getMonth() + 1;
  return config.find(s => s.months.includes(month))
      || config.find(s => s.id === 'normal');
}

/* ── Level 2 헬퍼: 요율 기준일 신선도 판정 ───────────────────────
   ok    : 0 ~ 3개월 이내 (✅ 최신)
   check : 4 ~ 6개월     (⚠️ 확인 권장)
   stale : 7개월 이상    (🔴 갱신 필요)
   ─────────────────────────────────────────────────────────────── */
/* ⚠ 중복 구현 주의: admin.html의 adminGetRateStatus()와 로직(3개월/6개월 임계값)이
   동일한 별도 구현입니다. 한쪽 임계값만 수정하면 고객용/관리자용 "요율 최신성" 배지가
   서로 어긋날 수 있으니, 임계값을 바꿀 때는 두 함수를 함께 수정하세요.
   (2026-07-06 야간 점검 시 확인 결과 현재는 정확히 동일함) */
function getRateStatus(rateDate) {
  if (!rateDate) return null;
  const [y, m] = rateDate.split('-').map(Number);
  const now    = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (months <= 3) return { status: 'ok',    months, label: '최신',      color: '#10b981' };
  if (months <= 6) return { status: 'check', months, label: '확인 권장', color: '#f59e0b' };
  return             { status: 'stale', months, label: '갱신 필요',  color: '#ef4444' };
}

/* 기관명/담당자/요청사항 등 사용자가 직접 입력하는 자유 텍스트 필드를
   견적서 HTML(팝업 인쇄창)에 삽입하기 전 이스케이프. document.write()로
   그대로 꽂아넣던 기존 코드는 입력값에 HTML 태그가 들어있으면 그대로
   실행되는 XSS 위험이 있었다. */
function _escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Level 2 헬퍼: YYYY-MM → YYYY년 MM월 ────────────────────── */
function formatRateDate(rateDate) {
  if (!rateDate) return '—';
  const [y, m] = rateDate.split('-');
  return `${y}년 ${m}월`;
}

/* ── 항목별 견적 계산 (Level 1 고도화) ─────────────────────────────
   적용 계수:
   · 항공 + 유류: × PAX 티어 계수 × 시즌 계수
   · 호텔:        × 호텔 등급 계수 × 시즌 계수
   · 식사·차량·가이드·관광·마진: 원가 그대로 (비시즌 변동 없음)
   ─────────────────────────────────────────────────────────────── */
function getBreakdownData() {
  const destKey      = destinationSelect.value;
  const participants = Number(document.getElementById('participants').value) || 0;
  const days         = Number(document.getElementById('days').value) || 0;
  const programType  = document.getElementById('programType').value;
  const orgType      = document.getElementById('organizationType').value;

  if (!destKey || !participants || !days) return null;
  const dest = getDestinationByKey(destKey);
  if (!dest) return null;

  const nights = Math.max(days - 1, 0); /* 박수 = 일수 - 1 (당일치기 0박) */

  const incHotel       = document.getElementById('incHotel')?.checked ?? true;
  const incMeal        = document.getElementById('incMeal')?.checked ?? true;
  const incVehicle     = document.getElementById('incVehicle')?.checked ?? true;
  const incGuide       = document.getElementById('incGuide')?.checked ?? true;
  const incSightseeing = document.getElementById('incSightseeing')?.checked ?? true;
  const vehicleTypeVal = document.querySelector('input[name="vehicleType"]:checked')?.value || 'auto';

  /* ── Level 1: 티어·시즌·호텔 등급 계수 산출 ── */
  const paxTier       = getPaxTier(participants);
  const startDateVal  = document.getElementById('startDate')?.value || '';
  const seasonInfo    = getSeasonInfo(startDateVal, destKey);
  const hotelGradeKey = document.querySelector('input[name="hotelGrade"]:checked')?.value || 'superior';
  const hotelGrade    = HOTEL_GRADES[hotelGradeKey] || HOTEL_GRADES.superior;

  /* ── v3 신규: 출발 공항 · 좌석 등급 · 객실 구성 ── */
  const departureCityVal = document.getElementById('departureCity')?.value || 'ICN';
  const cabinClassVal    = document.querySelector('input[name="cabinClass"]:checked')?.value || 'economy';
  const roomConfigVal    = document.querySelector('input[name="roomConfig"]:checked')?.value || 'double';
  const vipCount         = Math.max(0, Number(document.getElementById('vipCount')?.value) || 0);

  const deptCityData = DEPARTURE_CITIES.find(c => c.value === departureCityVal) || DEPARTURE_CITIES[0];
  const departureFactor = deptCityData.factor;
  const bizFactor  = cabinClassVal === 'business' ? getBizFactor(destKey) : 1.0;
  const roomCfg    = ROOM_CONFIG[roomConfigVal] || ROOM_CONFIG.double;
  const rooms      = roomCfg.calcRooms(participants, vipCount);

  /* 조정된 단가 계산
     · 항공: 출발지 계수 × 좌석 등급 계수 (비즈니스는 노선 거리 비례)
     · 유류할증료: 출발지 계수만 적용 (좌석 등급과 무관)
     · 호텔: 객실 구성은 rooms 계산으로 이미 반영됨
     · 항공/유류의 인원 구간(PAX_TIERS) 할인은 tieredTotal()로 누진 계산해
       총액이 인원수에 대해 항상 non-decreasing하도록 보장 (버그③수정) */
  const airUnitBase  = dest.airfare        * seasonInfo.factor * departureFactor * bizFactor;
  const fuelUnitBase = dest.fuel_surcharge * seasonInfo.factor * departureFactor;
  const airTotalTiered  = tieredTotal(airUnitBase,  participants, PAX_TIERS);
  const fuelTotalTiered = tieredTotal(fuelUnitBase, participants, PAX_TIERS);
  const airUnit   = participants > 0 ? Math.round(airTotalTiered  / participants) : 0;
  const fuelUnit  = participants > 0 ? Math.round(fuelTotalTiered / participants) : 0;
  const hotelUnit = Math.round(dest.hotel_per_room * hotelGrade.factor * seasonInfo.factor);

  /* 버그②수정: 참고 기준 10인 이상 → 대형버스 (기존 >12 오류) */
  const useLarge    = vehicleTypeVal === 'large' || (vehicleTypeVal === 'auto' && participants >= 10);
  const vehicleRate = useLarge ? dest.vehicle_large : dest.vehicle_small;

  /* 버그④수정: 차량 대수가 인원수와 무관하게 항상 1대로 고정되어 있던 문제.
     대형/소형 관광버스의 통상 정원(가정치 — 실제 계약 차량 정원에 따라 조정 필요)을
     넘는 인원은 추가 차량이 필요하므로 Math.ceil로 필요 대수를 산정한다. */
  const vehicleCount = Math.max(1, Math.ceil(participants / (useLarge ? VEHICLE_CAPACITY.large : VEHICLE_CAPACITY.small)));
  const vehicleName  = `차량 (${useLarge ? '대형' : '소형'} · 자동적용)`;

  const rows = [
    { name:'항공',      unit:airUnit,  qty:`${participants}명`, amount:airTotalTiered,  locked:true },
    { name:'유류할증료', unit:fuelUnit, qty:`${participants}명`, amount:fuelTotalTiered, locked:true },
  ];

  if (incHotel) rows.push({
    name:`호텔 (${hotelGrade.label})`, unit:hotelUnit,
    qty:`${rooms}실×${nights}박`,
    amount: hotelUnit * rooms * nights,
  });

  const mealCount = days * 2 - 1;
  if (incMeal) rows.push({
    name:'식사', unit:dest.meal_per_person,
    qty:`${participants}명×${mealCount}식`,
    amount: dest.meal_per_person * participants * mealCount,
  });

  if (incVehicle) rows.push({
    name:vehicleName, unit:vehicleRate,
    qty: vehicleCount > 1 ? `${vehicleCount}대×${days}일` : `${days}일`,
    amount: vehicleRate * days * vehicleCount,
  });

  if (incGuide) rows.push({
    name:'가이드', unit:dest.guide_fee,
    qty:`${days}일`,
    amount: dest.guide_fee * days,
  });

  if (incSightseeing) rows.push({
    name:'관광', unit:dest.sightseeing_fee,
    qty:`${participants}명`,
    amount: dest.sightseeing_fee * participants,
  });

  /* ─── 비공개 항목 3종 (고객 미노출, 총액에 포함) ─────────────────
     참고 기준 ENBT Revenue + Local Revenue + Travel Insurance
     ──────────────────────────────────────────────────────────── */

  /* ── 마진 구조 (Level 1: 인원 구간별 차등) ────────────────────────
     인원이 많을수록 ENBT 마진 소폭 감소 (대형 그룹 경쟁력 확보)
     현지 수익금은 고정 (현지 파트너 협약 기반)
     구간 경계 비단조성 방지를 위해 항공/유류와 동일하게 tieredTotal()로
     누진 계산 (버그③수정, PAX_TIERS와 동일한 구간 경계 재사용) ──────── */
  const enbtMarginTierFactors = [
    { min:  1, max:  9, factor: 1.10 },
    { min: 10, max: 29, factor: 1.00 },
    { min: 30, max: 49, factor: 0.92 },
    { min: 50, max: Infinity, factor: 0.85 },
  ];
  const enbtMarginTotalTiered = tieredTotal(dest.margin_per_traveler, participants, enbtMarginTierFactors);
  const enbtMarginUnit  = participants > 0 ? Math.round(enbtMarginTotalTiered / participants) : 0;
  const localMarginUnit = Math.round(dest.margin_per_traveler * 0.90);

  rows.push({
    name:'💼 ENBT 수익', unit: enbtMarginUnit,
    qty:`${participants}명`,
    amount: enbtMarginUnit * participants,
    muted: true, adminLabel:'ENBT 수익금',
  });

  rows.push({
    name:'🏷️ 현지 수익금', unit: localMarginUnit,
    qty:`${participants}명`,
    amount: localMarginUnit * participants,
    muted: true, adminLabel:'현지 수익금',
  });

  /* 🛡️ 여행자보험 (₩15,000/인, 고정) */
  const INSURANCE_RATE = 15000;
  rows.push({
    name:'🛡️ 여행자보험', unit:INSURANCE_RATE,
    qty:`${participants}명`,
    amount: INSURANCE_RATE * participants,
    muted: true, adminLabel:'여행자보험',
  });

  const baseTotal      = rows.reduce((s, r) => s + r.amount, 0);
  const programFactor  = estimateCriteria.programFactor[programType]  || 1.0;
  const orgFactor      = estimateCriteria.organizationFactor[orgType] || 1.0;
  const combinedFactor = programFactor * orgFactor;
  const total          = Math.round(baseTotal * combinedFactor);
  const perPerson      = participants > 0 ? Math.round(total / participants) : 0;

  /* 관리자용: 비공개 항목만의 합계 */
  const hiddenTotal  = rows.filter(r => r.muted).reduce((s, r) => s + r.amount, 0);
  const visibleTotal = total - Math.round(hiddenTotal * combinedFactor);

  return {
    rows, baseTotal, programFactor, orgFactor, combinedFactor, total, perPerson,
    hiddenTotal, visibleTotal, participants, days, nights, mealCount,
    /* Level 1 메타 */
    paxTier, seasonInfo, hotelGrade, hotelGradeKey,
    /* v3 신규 필드 */
    departureCityVal, departureCityLabel: deptCityData.label, departureFactor,
    cabinClassVal,    cabinClassLabel:    cabinClassVal === 'business' ? '비즈니스' : '이코노미',
    roomConfigVal,    roomConfigLabel:    roomCfg.label,
    vipCount, bizFactor, rooms,
  };
}

/* == 실시간 견적 렌더링 (고객용: 단가/마진 비공개) == */
function renderLiveBreakdown() {
  const data   = getBreakdownData();
  const noMsg  = document.getElementById('noEstimateMsg');
  const detail = document.getElementById('estimateDetail');
  const tagsEl = document.getElementById('incTagsArea');
  const rvEl   = document.getElementById('resultValue');
  const ppEl   = document.getElementById('perPersonValue');
  const fmt = function(n){ return '₩ ' + n.toLocaleString('ko-KR'); };

  /* ── Level 1: 시즌 배지 업데이트 ── */
  const seasonBadgeEl = document.getElementById('seasonBadge');
  if (seasonBadgeEl) {
    const startVal = document.getElementById('startDate')?.value || '';
    if (startVal) {
      const info = getSeasonInfo(startVal, destinationSelect.value);
      seasonBadgeEl.textContent = info.label;
      seasonBadgeEl.className   = `season-badge season-${info.id}`;
    } else {
      seasonBadgeEl.className = 'season-badge hidden';
    }
  }

  /* ── Level 1: 호텔 등급 sub-row 표시/숨김 ── */
  const hotelChecked = document.getElementById('incHotel')?.checked ?? true;
  const hotelGradeSubEl = document.getElementById('hotelGradeSub');
  if (hotelGradeSubEl) {
    hotelGradeSubEl.style.opacity      = hotelChecked ? '1' : '0.35';
    hotelGradeSubEl.style.pointerEvents = hotelChecked ? 'auto' : 'none';
  }

  if (!data) {
    if(noMsg) noMsg.classList.remove('hidden');
    if(detail) detail.classList.add('hidden');
    return;
  }
  if(noMsg)  noMsg.classList.add('hidden');
  if(detail) detail.classList.remove('hidden');

  if (tagsEl) {
    /* 포함 항목 태그 + Level 1 조건 배지 */
    const itemTags = data.rows
      .filter(function(r){ return !r.muted; })
      .map(function(r){ return '<span class="inc-tag">' + r.name + '</span>'; })
      .join('');

    const condTags = [
      data.paxTier.factor < 1
        ? `<span class="cond-tag cond-discount">단체할인</span>`
        : '',
      data.seasonInfo.id !== 'normal'
        ? `<span class="cond-tag cond-season-${data.seasonInfo.id}">${data.seasonInfo.label}</span>`
        : '',
    ].filter(Boolean).join('');

    tagsEl.innerHTML = itemTags + (condTags ? '<div class="cond-tags-row">' + condTags + '</div>' : '');
  }

  if (rvEl) rvEl.textContent = fmt(data.total);
  if (ppEl) ppEl.textContent = fmt(data.perPerson);

  /* ── Level 2: 요율 기준일 배지 ── */
  const rateBadgeEl = document.getElementById('rateNoteBadge');
  if (rateBadgeEl) {
    const destKeyNow = destinationSelect.value;
    const destData   = destKeyNow ? getDestinationByKey(destKeyNow) : null;
    if (data && destData && destData.rateDate && typeof RATE_META !== 'undefined') {
      const rs = getRateStatus(destData.rateDate);
      const statusIcon = rs ? (rs.status === 'ok' ? '●' : rs.status === 'check' ? '△' : '▲') : '';
      rateBadgeEl.innerHTML =
        `${statusIcon} 요율 기준: <strong>${formatRateDate(destData.rateDate)}</strong>` +
        ` · 다음 검토 예정: ${formatRateDate(RATE_META.nextReview)}` +
        (destData.notes ? ` <span class="rate-badge-note">※ ${destData.notes}</span>` : '');
      rateBadgeEl.className = `rate-note-badge rate-${rs ? rs.status : 'ok'}`;
    } else {
      rateBadgeEl.className = 'rate-note-badge hidden';
    }
  }
}

/* 실시간 업데이트 이벤트 연결 (DOM 준비 후) */
(function attachLiveListeners() {
  /* 기본 필드 */
  ['destination','programType','participants','days','organizationType','departureCity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('change', renderLiveBreakdown); el.addEventListener('input', renderLiveBreakdown); }
  });
  ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderLiveBreakdown);
  });

  /* Level 1: 호텔 등급 + 날짜(시즌) */
  document.querySelectorAll('input[name="hotelGrade"]').forEach(r => r.addEventListener('change', renderLiveBreakdown));
  document.getElementById('startDate')?.addEventListener('change', renderLiveBreakdown);

  /* v3: 좌석 등급 + 객실 구성 radio */
  document.querySelectorAll('input[name="cabinClass"]').forEach(r => r.addEventListener('change', renderLiveBreakdown));
  document.querySelectorAll('input[name="roomConfig"]').forEach(r => {
    r.addEventListener('change', function () {
      /* 혼합 선택 시 VIP 인원 입력 필드 표시 */
      const vipRow = document.getElementById('vipCountRow');
      if (vipRow) vipRow.classList.toggle('hidden', this.value !== 'mixed');
      renderLiveBreakdown();
    });
  });

  /* v3: VIP 인원 수 변경 */
  document.getElementById('vipCount')?.addEventListener('input', renderLiveBreakdown);

  renderLiveBreakdown(); /* 초기 렌더 */
})();

/* ═══ 목적지 갤러리: 지역 필터 + 업종별 추천 목적지 위젯 ═══ */
(function initDestinationGallery() {
  const cards      = document.querySelectorAll('.gallery-card');
  const filterBtns = document.querySelectorAll('.gal-filter-chip');
  const industrySel = document.getElementById('destIndustry');
  const resultEl     = document.getElementById('destRecResult');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const region = btn.dataset.filter;
      cards.forEach(card => {
        card.classList.toggle('gal-hidden', region !== 'all' && card.dataset.region !== region);
      });
    });
  });

  if (industrySel && resultEl) {
    industrySel.addEventListener('change', () => {
      const destKey = industrySel.value;
      const industryLabel = industrySel.selectedOptions[0].textContent;
      const card = document.querySelector('.gallery-card[data-key="' + destKey + '"]');
      if (!card) return;

      /* 추천 목적지가 현재 필터에 가려져 있으면 전체 보기로 전환 */
      filterBtns.forEach(b => b.classList.remove('active'));
      document.querySelector('.gal-filter-chip[data-filter="all"]')?.classList.add('active');
      cards.forEach(c => c.classList.remove('gal-hidden'));

      const destName = card.querySelector('h3')?.textContent || destKey;
      const tag      = card.querySelector('.gallery-tag')?.textContent || '';
      resultEl.innerHTML = industryLabel + ' 분야에는 <strong>' + destName + '</strong>을(를) 추천드려요 👍 <span class="dest-rec-tag">' + tag + '</span>';
      resultEl.classList.add('show');

      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('gal-highlight');
      void card.offsetWidth; /* 재선택 시 애니메이션 재시작을 위한 강제 리플로우 */
      card.classList.add('gal-highlight');
      setTimeout(() => card.classList.remove('gal-highlight'), 3400);
    });
  }
})();

/* ═══ 파트너 로고 마퀴: 무한 스크롤용 콘텐츠 복제 + 로고 로드 실패 시 텍스트만 유지 ═══ */
(function initPartnersMarquee() {
  document.querySelectorAll('.partners-track').forEach((track) => {
    const items = Array.from(track.children);
    items.forEach((item) => track.appendChild(item.cloneNode(true)));
  });
})();
function handlePartnerLogoError(img) {
  img.remove(); /* 로고 이미지만 제거, 기관명 텍스트는 그대로 남김 */
}

nextButton.addEventListener('click', () => {
  if (!validateStep(1)) {
    document.querySelector('.estimate-step[data-step="1"] [required]:invalid')?.focus();
    return;
  }
  setActiveStep(2);
});

backButton.addEventListener('click', () => {
  setActiveStep(1);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const requiredFields = Array.from(form.querySelectorAll('[required]'));
  const invalidField = requiredFields.find((field) => !field.value.trim());
  if (invalidField) { invalidField.focus(); return; }

  /* 견적 재계산 후 결과 패널 업데이트 */
  renderLiveBreakdown();
  const resultNoteEl = document.getElementById('resultNote');
  if (resultNoteEl) resultNoteEl.textContent = '기본 항공·숙박·현지 지원이 포함된 예상 금액입니다.';

  /* ── 견적 완료 처리 ── */
  /* 1. 폼 입력 영역 숨기고 확인 메시지 표시 (step1으로 돌아가지 않음) */
  const actionsEl  = document.getElementById('step2Actions');
  const confirmEl  = document.getElementById('estimateConfirm');
  if (actionsEl)  actionsEl.classList.add('hidden');
  if (confirmEl) {
    confirmEl.classList.remove('hidden');
    /* "연수 일정 탐색하기"와 "견적서 받기"가 같은 패널에 있으므로 패널 자체를
       중앙으로 스크롤하면 둘 다 자연스럽게 함께 보임 */
    setTimeout(function () {
      confirmEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    /* lucide 아이콘 재렌더 (동적 삽입된 아이콘) */
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  /* 2. PDF 버튼: visible → ready (눈에 띄는 활성 상태 + 펄스 애니메이션) */
  const dlBtn = document.getElementById('downloadEstimate');
  if (dlBtn) {
    dlBtn.classList.remove('hidden');
    dlBtn.classList.add('visible', 'ready');
    /* 애니메이션 반복을 위해 재적용 */
    void dlBtn.offsetWidth; /* reflow 트리거 */
    dlBtn.style.animation = 'none';
    requestAnimationFrame(() => {
      dlBtn.style.animation = '';
    });
  }

  /* 3. 상담 신청 버튼 활성화 */
  const consultBtn = document.getElementById('consultBtn');
  if (consultBtn) {
    consultBtn.classList.remove('hidden');
    consultBtn.classList.add('visible');
  }

  /* 3b. 연수 일정 탐색 버튼 활성화 */
  const exploreBtn = document.getElementById('explorePlanBtn');
  if (exploreBtn) {
    exploreBtn.classList.remove('hidden');
    /* Step 3 콘텐츠 미리 준비 */
    renderStep3();
  }

  /* 4. 결과 패널이 보이도록 스크롤 */
  document.getElementById('estimateDetail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  /* 5. "새 견적 계산하기" 버튼 이벤트 등록 */
  const resetBtn = document.getElementById('resetEstimateBtn');
  if (resetBtn) {
    resetBtn.onclick = function() {
      if (actionsEl)  actionsEl.classList.remove('hidden');
      if (confirmEl)  confirmEl.classList.add('hidden');
      if (dlBtn) {
        dlBtn.classList.remove('ready');
        dlBtn.classList.add('hidden');
        dlBtn.classList.remove('visible');
      }
      if (consultBtn) consultBtn.classList.remove('visible');
      /* 연수 일정 탐색 버튼 · Step 3 섹션 숨기기 */
      const exploreBtnReset = document.getElementById('explorePlanBtn');
      if (exploreBtnReset) exploreBtnReset.classList.add('hidden');
      const step3Sec = document.getElementById('step3Section');
      if (step3Sec) step3Sec.classList.add('hidden');
      closeConsultForm();
      setActiveStep(1);
    };
  }

  /* 추적 */
  /* 견적 전체 상세 저장 (관리자용) */
  (function saveFullEstimate() {
    const bd = getBreakdownData();
    if (!bd) return;

    const destKey   = destinationSelect.value;
    const destLabel = destinationSelect.selectedOptions[0]?.textContent || destKey;
    const prgEl     = document.getElementById('programType');
    const orgEl     = document.getElementById('organizationType');
    const orgName   = document.getElementById('organization')?.value.trim() || '';
    const contact   = document.getElementById('contactName')?.value.trim() || '';
    const request   = document.getElementById('requestDetails')?.value.trim() || '';

    const estRecord = {
      id:           Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      ts:           new Date().toISOString(),
      destKey,
      destLabel,
      program:      prgEl.value,
      programLabel: prgEl.selectedOptions[0]?.textContent || '',
      orgType:      orgEl.value,
      orgTypeLabel: orgEl.selectedOptions[0]?.textContent || '',
      visitMode:      document.getElementById('visitMode')?.value || '',
      visitModeLabel: document.getElementById('visitMode')?.selectedOptions[0]?.textContent || '',
      participants: bd.participants,
      days:         bd.days,
      nights:       bd.nights,
      mealCount:    bd.mealCount,
      rooms:        bd.rooms,
      programFactor:  bd.programFactor,
      orgFactor:      bd.orgFactor,
      combinedFactor: bd.combinedFactor,
      total:          bd.total,
      perPerson:      bd.perPerson,
      hiddenTotal:    bd.hiddenTotal,
      visibleTotal:   bd.visibleTotal,
      items: bd.rows.map(r => ({
        name:        r.name,
        adminLabel:  r.adminLabel || r.name,
        amount:      r.amount,
        unit:        r.unit || 0,
        qty:         r.qty || '',
        isHidden:    !!r.muted,
      })),
      orgName,
      contact,
      request,
      /* v3 신규 — 출발 공항 · 좌석 등급 · 객실 구성 */
      departureCity:      bd.departureCityVal,
      departureCityLabel: bd.departureCityLabel,
      departureFactor:    bd.departureFactor,
      cabinClass:         bd.cabinClassVal,
      cabinClassLabel:    bd.cabinClassLabel,
      bizFactor:          bd.bizFactor,
      roomConfig:         bd.roomConfigVal,
      roomConfigLabel:    bd.roomConfigLabel,
      vipCount:           bd.vipCount,
      /* Level 2: 요율 버전 추적 */
      rateDate:    (getDestinationByKey(destKey)?.rateDate) || '',
      rateVersion: typeof RATE_META !== 'undefined' ? RATE_META.version : '',
      destNotes:   (getDestinationByKey(destKey)?.notes) || '',
      status: 'new',  /* new / consulting / contracted / closed */
      note:   '',
    };

    const KEY = 'linkedt_estimates_full';
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    arr.push(estRecord);
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-500)));

    try {
      fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estRecord),
      }).catch((err) => console.warn('[quotes] 서버 저장 실패(로컬에는 저장됨):', err));
    } catch (err) {
      console.warn('[quotes] 서버 저장 실패(로컬에는 저장됨):', err);
    }

    if (typeof _trackEvent !== 'undefined') {
      _trackEvent('estimate_complete');
      _saveEstimate({
        destination: destKey, program: prgEl.value,
        orgType: orgEl.value, participants: bd.participants, days: bd.days,
        departureCity: bd.departureCityVal, cabinClass: bd.cabinClassVal,
        roomConfig: bd.roomConfigVal, vipCount: bd.vipCount,
      });
    }
  })();
});

downloadButton.addEventListener('click', openEstimateWindow);

/* ── 모바일 메뉴 토글 ───────────────────────────────────────────── */
(function () {
  const toggle = document.getElementById('navToggle');
  const header = document.querySelector('.site-header');
  if (!toggle || !header) return;

  toggle.addEventListener('click', function () {
    const isOpen = header.classList.toggle('nav-mobile-open');
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
  });

  /* 메뉴 링크 클릭 시 닫기 */
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () {
      header.classList.remove('nav-mobile-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '메뉴 열기');
    });
  });

  /* 외부 클릭 시 닫기 */
  document.addEventListener('click', function (e) {
    if (!header.contains(e.target)) {
      header.classList.remove('nav-mobile-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

/* ── Step 2 시선 유도: 진행 도트 + 완료 가이드 + 버튼 글로우 ────── */
(function () {
  var orgEl   = document.getElementById('organization');
  var nameEl  = document.getElementById('contactName');
  var reqEl   = document.getElementById('requestDetails');
  var actions = document.getElementById('step2Actions');
  var step2   = document.querySelector('.estimate-step[data-step="2"]');

  if (!orgEl || !nameEl || !reqEl || !actions || !step2) return;

  var submitBtn = actions.querySelector('button[type="submit"]');

  /* ── 진행 도트 삽입 (Step2 맨 위) ── */
  var dotsEl = document.createElement('div');
  dotsEl.className = 'step2-dots';
  dotsEl.innerHTML =
    '<span class="step2-dot-item" id="di-org">'  +
      '<span class="step2-dot" id="dot-org"></span>회사/기관명' +
    '</span>' +
    '<span class="step2-dot-sep">·</span>' +
    '<span class="step2-dot-item" id="di-name">' +
      '<span class="step2-dot" id="dot-name"></span>담당자 이름' +
    '</span>' +
    '<span class="step2-dot-sep">·</span>' +
    '<span class="step2-dot-item" id="di-req">'  +
      '<span class="step2-dot" id="dot-req"></span>요청 사항' +
    '</span>';
  step2.insertAdjacentElement('afterbegin', dotsEl);

  /* ── 완료 가이드 메시지 삽입 (버튼 바로 위) ── */
  var guideEl = document.createElement('div');
  guideEl.className = 'cta-guide-wrap';
  guideEl.innerHTML =
    '<span class="cta-arrow">↓</span>' +
    '<span>모든 정보 입력 완료 — 지금 견적을 확인하세요</span>' +
    '<span class="cta-arrow">↓</span>';
  actions.insertAdjacentElement('beforebegin', guideEl);

  /* ── 필드·도트 상태 갱신 ── */
  function updateField(input, dotId, itemId) {
    var done = input.value.trim().length > 0;
    var dot  = document.getElementById(dotId);
    var item = document.getElementById(itemId);
    if (dot)  dot.classList.toggle('done', done);
    if (item) item.classList.toggle('done', done);
    /* 해당 label 테두리 초록 처리 */
    var label = input.closest('label');
    if (label) label.classList.toggle('step2-field-done', done);
    return done;
  }

  function checkAll() {
    var o = updateField(orgEl,  'dot-org',  'di-org');
    var n = updateField(nameEl, 'dot-name', 'di-name');
    var r = updateField(reqEl,  'dot-req',  'di-req');
    var allDone = o && n && r;
    guideEl.classList.toggle('show', allDone);
    return allDone;
  }

  [orgEl, nameEl, reqEl].forEach(function (el) {
    el.addEventListener('input', checkAll);
  });

  /* ── textarea blur → 버튼 글로우 + 자동 스크롤 ── */
  reqEl.addEventListener('blur', function () {
    if (!checkAll()) return;

    /* 글로우 애니메이션: 클래스 제거 후 reflow → 재추가로 매번 재실행 */
    submitBtn.classList.remove('btn-cta-ready');
    void submitBtn.offsetWidth;
    submitBtn.classList.add('btn-cta-ready');

    setTimeout(function () {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  });
})();

/* ── 스크롤 상단 버튼 ───────────────────────────────────────────── */
(function () {
  const btn = document.querySelector('.scroll-top-btn');
  if (!btn) return;
  window.addEventListener('scroll', function () {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ── 카카오 상담 플로팅 버튼: 히어로 통과 후 노출 ──────────────────
   히어로 최초 진입 화면에서 우측 하단 통계(재계약률 등)와 겹치는 것을 방지 */
(function () {
  const btn = document.querySelector('.kakao-float');
  const hero = document.querySelector('.hero');
  if (!btn || !hero) return;
  const showAfter = function () { return hero.offsetHeight - 80; };
  window.addEventListener('scroll', function () {
    btn.classList.toggle('visible', window.scrollY > showAfter());
  }, { passive: true });
})();

/* ── 방문자 & 이벤트 추적 ── */
(function initTracking() {
  const VISIT_KEY  = 'linkedt_visits';
  const EVENT_KEY  = 'linkedt_events';
  const DEST_KEY   = 'linkedt_dest_stats';
  const EST_KEY    = 'linkedt_estimates';

  function saveVisit() {
    const arr = JSON.parse(localStorage.getItem(VISIT_KEY) || '[]');
    arr.push({ ts: new Date().toISOString() });
    localStorage.setItem(VISIT_KEY, JSON.stringify(arr.slice(-3000)));
  }

  window._trackEvent = function(name) {
    const obj = JSON.parse(localStorage.getItem(EVENT_KEY) || '{}');
    obj[name] = (obj[name] || 0) + 1;
    localStorage.setItem(EVENT_KEY, JSON.stringify(obj));
  };

  window._trackDest = function(dest) {
    const obj = JSON.parse(localStorage.getItem(DEST_KEY) || '{}');
    obj[dest] = (obj[dest] || 0) + 1;
    localStorage.setItem(DEST_KEY, JSON.stringify(obj));
  };

  window._saveEstimate = function(data) {
    const arr = JSON.parse(localStorage.getItem(EST_KEY) || '[]');
    arr.push({ ...data, ts: new Date().toISOString() });
    localStorage.setItem(EST_KEY, JSON.stringify(arr.slice(-1000)));
  };

  saveVisit();

  document.querySelector('.kakao-float')?.addEventListener('click', () => _trackEvent('kakao'));
  document.querySelector('.button-primary[href="#estimate"]')?.addEventListener('click', () => _trackEvent('header_cta'));
  document.getElementById('nextStepButton')?.addEventListener('click', () => _trackEvent('estimate_step2'));
  document.getElementById('destination')?.addEventListener('change', (e) => {
    if (e.target.value) _trackDest(e.target.value);
  });
})();

/* ── 날짜 선택기 → 연수 기간 자동 계산 (개선) ── */
(function initDatePicker() {
  const startEl  = document.getElementById('startDate');
  const endEl    = document.getElementById('endDate');
  const daysEl   = document.getElementById('days');
  const resultEl = document.getElementById('dateResultBar');
  if (!startEl || !endEl || !daysEl) return;

  const today = new Date().toISOString().split('T')[0];
  startEl.min = today;
  endEl.min   = today;

  function fmtDate(str) {
    const d = new Date(str);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function calcDays() {
    const s = startEl.value;
    const e = endEl.value;

    /* 출발일 변경 시 귀국일 최솟값 업데이트 */
    if (s) endEl.min = s;

    if (!resultEl) { /* resultEl 없을 경우 단순 계산만 수행 */
      if (s && e) {
        const diff = Math.ceil((new Date(e) - new Date(s)) / 864e5);
        if (diff > 0) { daysEl.value = diff + 1; renderLiveBreakdown(); }
      }
      return;
    }

    if (!s && !e) {
      resultEl.textContent = '날짜를 선택하면 기간이 자동으로 계산됩니다.';
      resultEl.className = 'date-result-bar';
      return;
    }

    if (s && !e) {
      resultEl.textContent = '귀국일을 선택해 주세요.';
      resultEl.className = 'date-result-bar';
      return;
    }

    if (!s && e) {
      resultEl.textContent = '출발일을 선택해 주세요.';
      resultEl.className = 'date-result-bar';
      return;
    }

    const diff = Math.ceil((new Date(e) - new Date(s)) / 864e5);

    if (diff <= 0) {
      resultEl.textContent = '⚠️ 귀국일은 출발일 이후 날짜를 선택해 주세요.';
      resultEl.className = 'date-result-bar err';
      endEl.value = '';
      return;
    }

    const nights = diff;
    const tripDays = diff + 1;
    daysEl.value = tripDays;
    resultEl.textContent = fmtDate(s) + ' ~ ' + fmtDate(e) + ' · ' + nights + '박 ' + tripDays + '일';
    resultEl.className = 'date-result-bar has-date';

    /* 날짜 변경 → 실시간 견적 재계산 */
    renderLiveBreakdown();
  }

  startEl.addEventListener('change', calcDays);
  endEl.addEventListener('change', calcDays);

  /* days 직접 수정 시에도 견적 업데이트 */
  daysEl.addEventListener('input', renderLiveBreakdown);
})();

/* ── 헤더 스크롤 효과 ── */
(function initHeaderScroll() {
  const hdr = document.querySelector('.site-header');
  if (!hdr) return;
  const update = () => hdr.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ── 포트폴리오 더보기 ── */
function expandPortfolio() {
  const activeFilter = document.querySelector('.pf-filter.active');
  const type = activeFilter ? activeFilter.dataset.pf : 'all';

  document.querySelectorAll('.pf-card.pf-extra').forEach(card => {
    card.classList.remove('pf-more-hidden');
    const show = type === 'all' || card.dataset.type === type;
    card.classList.toggle('hidden', !show);
    if (show) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = 'pfFadeIn .3s ease'; }
  });

  const moreBtn = document.getElementById('pfMoreBtn');
  if (moreBtn) moreBtn.style.display = 'none';

  const blogBtn = document.getElementById('pfBlogBtn');
  if (blogBtn) blogBtn.classList.remove('hidden');
}

/* ── 포트폴리오 필터 ── */
(function initPortfolioFilter() {
  const filters = document.querySelectorAll('.pf-filter');
  const cards   = document.querySelectorAll('.pf-card');
  if (!filters.length) return;

  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const type = btn.dataset.pf;
      cards.forEach(card => {
        if (card.classList.contains('pf-more-hidden')) return;
        const show = type === 'all' || card.dataset.type === type;
        card.classList.toggle('hidden', !show);
        /* 애니메이션: 새로 보이는 카드에 페이드인 */
        if (show) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = 'pfFadeIn .3s ease'; }
      });
    });
  });
})();

/* ── 스크롤 탑 버튼 ── */
(function initScrollTop() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 450);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();

/* ── 문의 폼 저장 핸들러 ── */
const inqForm = document.getElementById('inqForm');
const inqSuccess = document.getElementById('inqSuccess');

if (inqForm) {
  inqForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('inqName').value.trim();
    const org  = document.getElementById('inqOrg').value.trim();
    const tel  = document.getElementById('inqTel')?.value.trim() || '';
    const msg  = document.getElementById('inqMsg').value.trim();
    if (!name || !org || !tel || !msg) {
      alert('이름, 소속, 연락처, 문의 내용을 모두 입력해 주세요.');
      return;
    }

    const STORAGE_KEY = 'linkedt_contacts';
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, org, tel, message: msg,
      timestamp: new Date().toISOString(),
      read: false,
    };
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    existing.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    try {
      fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }).catch((err) => console.warn('[inquiries] 서버 저장 실패(로컬에는 저장됨):', err));
    } catch (err) {
      console.warn('[inquiries] 서버 저장 실패(로컬에는 저장됨):', err);
    }

    inqForm.reset();
    inqSuccess.classList.remove('hidden');
    setTimeout(() => inqSuccess.classList.add('hidden'), 5000);
  });
}

/* ══════════════════════════════════════════════════════════
   견적 기반 상담 신청 (바로 연락 요청)
   ══════════════════════════════════════════════════════════ */
function openConsultForm() {
  const wrap = document.getElementById('consultFormWrap');
  const btn  = document.getElementById('consultBtn');
  if (wrap) wrap.classList.remove('hidden');
  if (btn)  btn.classList.add('hidden');
  setTimeout(() => document.getElementById('consultName')?.focus(), 80);
}

function closeConsultForm() {
  const wrap = document.getElementById('consultFormWrap');
  const btn  = document.getElementById('consultBtn');
  if (wrap) wrap.classList.add('hidden');
  /* 버튼 복원: PDF 버튼이 visible(ready) 상태일 때만 */
  const dlBtn = document.getElementById('downloadEstimate');
  if (btn && dlBtn && dlBtn.classList.contains('ready')) btn.classList.remove('hidden');
  /* 입력 초기화 */
  const nameEl = document.getElementById('consultName');
  const telEl  = document.getElementById('consultTel');
  const okEl   = document.getElementById('consultSuccess');
  if (nameEl) nameEl.value = '';
  if (telEl)  telEl.value  = '';
  if (okEl)   okEl.classList.add('hidden');
}

function submitConsult() {
  const nameEl = document.getElementById('consultName');
  const telEl  = document.getElementById('consultTel');
  const okEl   = document.getElementById('consultSuccess');
  const name   = nameEl?.value.trim() || '';
  const tel    = telEl?.value.trim()  || '';

  if (!name || !tel) {
    alert('이름과 연락처를 모두 입력해 주세요.');
    return;
  }

  /* 현재 견적 데이터 스냅샷 */
  const bd        = getBreakdownData();
  const destLabel = destinationSelect.selectedOptions[0]?.textContent || '';
  const prgEl     = document.getElementById('programType');
  const orgEl     = document.getElementById('organizationType');

  const record = {
    id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name,
    org:       '',
    tel,
    message:   '[견적 기반 상담 신청]\n목적지: ' + destLabel +
               '\n인원: ' + (bd?.participants || '?') + '명 / ' + (bd?.days || '?') + '일' +
               '\n예상 총액: ₩' + (bd?.total?.toLocaleString('ko-KR') || '?'),
    timestamp: new Date().toISOString(),
    read:      false,
    type:      'estimate_inquiry',   /* 관리자 페이지에서 구별하는 플래그 */
    estimate:  bd ? {
      destLabel,
      participants:  bd.participants,
      days:          bd.days,
      nights:        bd.nights,
      mealCount:     bd.mealCount,
      programLabel:  prgEl?.selectedOptions[0]?.textContent || '',
      orgTypeLabel:  orgEl?.selectedOptions[0]?.textContent || '',
      total:         bd.total,
      perPerson:     bd.perPerson,
      visibleTotal:  bd.visibleTotal,
      items: (bd.rows || []).filter(r => !r.muted).map(r => ({
        name:   r.name,
        amount: r.amount,
      })),
    } : null,
  };

  const KEY = 'linkedt_contacts';
  const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
  arr.push(record);
  localStorage.setItem(KEY, JSON.stringify(arr));

  try {
    fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch((err) => console.warn('[inquiries] 서버 저장 실패(로컬에는 저장됨):', err));
  } catch (err) {
    console.warn('[inquiries] 서버 저장 실패(로컬에는 저장됨):', err);
  }

  /* 성공 처리 */
  if (nameEl) nameEl.value = '';
  if (telEl)  telEl.value  = '';
  if (okEl)   okEl.classList.remove('hidden');

  if (typeof _trackEvent !== 'undefined') _trackEvent('consult_request');

  setTimeout(() => {
    if (okEl) okEl.classList.add('hidden');
    closeConsultForm();
  }, 3500);
}

/* ── Hero Canvas: 세계 네트워크 지도 (정적 렌더 — 티커와 모션 충돌 방지) ── */
(function () {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CITIES = [
    [127.0,  37.6, 4.0],
    [139.7,  35.7, 3.5],
    [116.4,  39.9, 3.0],
    [121.5,  31.2, 3.0],
    [103.8,   1.3, 3.5],
    [100.5,  13.8, 3.0],
    [114.2,  22.3, 3.0],
    [151.2, -33.9, 3.5],
    [ -74.0,  40.7, 3.5],
    [  -0.1,  51.5, 3.5],
    [   2.3,  48.9, 3.0],
    [  55.3,  25.2, 3.0],
    [-118.2,  34.1, 3.0],
    [-123.1,  49.3, 2.5],
    [   8.7,  50.1, 3.0],
    [  72.9,  19.1, 3.0],
    [  37.6,  55.8, 2.5],
    [  28.0, -26.2, 2.5],
    [ -46.6, -23.5, 2.5],
    [ 144.9, -37.8, 2.5],
  ];

  const EDGES = [
    [0,1],[0,2],[0,3],[0,6],[0,9],[0,8],[0,4],
    [1,3],[1,7],[1,8],[1,4],[1,19],
    [2,3],[2,9],[2,11],[2,16],
    [3,4],[3,6],[3,11],
    [4,5],[4,7],[4,11],[4,6],
    [5,11],[5,6],
    [6,11],
    [7,19],
    [8,9],[8,12],[8,13],[8,18],
    [9,10],[9,14],[9,11],[9,17],[9,16],
    [10,14],[10,11],
    [11,15],
    [12,13],
    [16,14],[16,0],
    [17,18],
  ];

  function project(lon, lat) {
    const x = (lon + 180) / 360;
    const r = Math.PI / 180;
    const m = Math.log(Math.tan(Math.PI / 4 + lat * r / 2));
    const y = 0.5 - m / (2 * Math.PI);
    return [x, y];
  }
  const PROJ = CITIES.map(([lon, lat]) => project(lon, lat));

  const Y_MIN = 0.14, Y_MAX = 0.80;
  function toPixel(idx, W, H) {
    const [rx, ry] = PROJ[idx];
    return [rx * W, (ry - Y_MIN) / (Y_MAX - Y_MIN) * H];
  }
  function ctrlPt(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    return [(ax + bx) / 2, (ay + by) / 2 - d * 0.22];
  }

  let W = 0, H = 0;
  function render() {
    W = canvas.width  = canvas.clientWidth;
    H = canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    /* 노선 선 (정적) */
    EDGES.forEach(([a, b]) => {
      const [ax, ay] = toPixel(a, W, H);
      const [bx, by] = toPixel(b, W, H);
      const [mx, my] = ctrlPt(ax, ay, bx, by);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    /* 도시 노드 (정적 — 펄스 없음) */
    CITIES.forEach(([,, sz], i) => {
      const [cx, cy] = toPixel(i, W, H);

      /* 글로우 헤일로 */
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, sz * 6);
      grd.addColorStop(0, 'rgba(200,16,46,0.22)');
      grd.addColorStop(1, 'rgba(200,16,46,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 6, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      /* 외곽 링 (단일 고정) */
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 2.4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,16,46,0.18)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      /* 코어 */
      ctx.beginPath();
      ctx.arc(cx, cy, sz, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,210,0.85)';
      ctx.fill();
    });
  }

  /* 한 번만 그리고 리사이즈 시 재렌더 */
  window.addEventListener('resize', render);
  render();
})();

/* ════════════════════════════════════════════════════════════════════
   목적지 이미지 맵핑
   ════════════════════════════════════════════════════════════════════ */
/* 목적지별 지도 위 위치 (STEP3 세계지도 핀 표시용)
   ─────────────────────────────────────────────────────────────
   과거에는 위/경도를 세계지도 SVG 픽셀로 변환하는 공식(선형회귀 보정)을 썼으나,
   이 world-map.svg 자산은 국가마다 뒤틀림 정도가 달라 전역 공식 하나로는
   맞지 않는 목적지가 계속 생겼음(예: 파리 선택 시 폴란드 부근에 찍히는 등).
   근본 해결: 위/경도 변환을 아예 쓰지 않고, 이 SVG 파일 안에 실제로 그려진
   국가별 도형(getBBox)의 픽셀 좌표를 직접 읽어 각 목적지 도시의 위치를
   해당 국가(섬) 도형 내부에서 위/경도 비율로 보간해 미리 계산해 둔 값.
   즉 "공식으로 추정"이 아니라 "실제 지도 그림 기준으로 확정"한 좌표라
   국가 자체가 잘못 잡히는 일이 없음. (좌표 단위: 지도 이미지 전체 대비 0~1 비율)
   지도 자산을 교체하지 않는 한 재계산할 필요 없음. */
const DEST_MAP_FRAC = {
  '도쿄':[0.8475,0.3122],
  '오사카':[0.8389,0.3194],
  '후쿠오카':[0.8240,0.3249],
  '나고야':[0.8433,0.3169],
  '삿포로':[0.8542,0.2765],
  '오키나와':[0.8170,0.3606],
  '상해':[0.7985,0.3285],
  '장가계':[0.7688,0.3386],
  '청도':[0.7958,0.3053],
  '연태':[0.7986,0.2986],
  '홍콩':[0.7787,0.3719],
  '마카오':[0.7767,0.3717],
  '대만':[0.7989,0.3679],
  '가오슝':[0.7957,0.3797],
  '몽골':[0.7500,0.2575],
  '싱가포르':[0.7503,0.4873],
  '하노이':[0.7555,0.3880],
  '호치민':[0.7576,0.4392],
  '다낭':[0.7619,0.4136],
  '나트랑':[0.7646,0.4321],
  '푸꾸옥':[0.7503,0.4418],
  '마닐라':[0.7971,0.4201],
  '세부':[0.8021,0.4364],
  '보홀':[0.8039,0.4396],
  '코타키나발루':[0.7839,0.4651],
  '캄보디아':[0.7531,0.4305],
  '방콕':[0.7408,0.4240],
  '푸켓':[0.7349,0.4541],
  '치앙마이':[0.7366,0.3996],
  '발리':[0.7811,0.5367],
  '라오스':[0.7500,0.4022],
  '우즈베키스탄':[0.6408,0.2854],
  '카자흐스탄':[0.6754,0.2759],
  '시드니':[0.8815,0.6655],
  '멜버른':[0.8641,0.6853],
  '호주':[0.8865,0.6331],
  '오클랜드':[0.9469,0.6799],
  '괌':[0.8633,0.4255],
  '사이판':[0.8650,0.4168],
  '영국':[0.4624,0.2343],
  '파리':[0.4681,0.2476],
  '로마':[0.4962,0.2821],
  '독일':[0.4991,0.2296],
  '네덜란드':[0.4763,0.2313],
  '스페인':[0.4513,0.2903],
  '동유럽':[0.5062,0.2508],
  '북유럽':[0.5108,0.1862],
  '서유럽':[0.4768,0.2413],
  '로스앤젤레스':[0.1337,0.3203],
  '샌프란시스코':[0.1222,0.3022],
  '뉴욕':[0.2559,0.2877],
  '워싱턴':[0.2476,0.2965],
  '하와이':[0.0242,0.3901],
  '밴쿠버':[0.1174,0.2430],
  '토론토':[0.2349,0.2735],
};

/* 세계지도 위에 목적지 핀 위치시키기 */
/* 대한민국(서울) 위치 — world-map.svg 내 'kr' 도형 기준으로 확정한 값 */
const KOREA_MAP_FRAC = [0.8159, 0.3034];

/* 대한민국+목적지가 함께 보이도록 지도를 자동 확대/이동시키고 핀 두 개(출발/목적지)를 배치 */
function _positionDestMapPin(destKey) {
  var wrap  = document.getElementById('destMapWrap');
  var frame = document.getElementById('destMapFrame');
  var img   = document.getElementById('destMapImg');
  var pinKorea = document.getElementById('destMapPinKorea');
  var pinDest  = document.getElementById('destMapPin');
  var label    = document.getElementById('destMapPinLabel');
  if (!wrap || !frame || !img || !pinDest) return;

  var coords = DEST_MAP_FRAC[destKey];
  if (!coords) { wrap.classList.add('hidden'); return; }

  function render() {
    var korea = { x: KOREA_MAP_FRAC[0], y: KOREA_MAP_FRAC[1] };
    var dest  = { x: coords[0], y: coords[1] };

    var left = Math.min(korea.x, dest.x), right = Math.max(korea.x, dest.x);
    var top  = Math.min(korea.y, dest.y), bottom = Math.max(korea.y, dest.y);

    /* 대한민국과 아주 가까운 목적지(예: 일본)도 지나치게 확대되지 않도록 최소 범위 보장 */
    var minSpan = 0.10;
    if (right - left < minSpan) {
      var cx = (left + right) / 2;
      left = cx - minSpan / 2; right = cx + minSpan / 2;
    }
    if (bottom - top < minSpan) {
      var cy = (top + bottom) / 2;
      top = cy - minSpan / 2; bottom = cy + minSpan / 2;
    }

    /* 양쪽 끝점이 프레임 가장자리에 붙지 않도록 여백 비율 추가 */
    var padRatio = 0.28;
    var w = right - left, h = bottom - top;
    left -= w * padRatio; right += w * padRatio;
    top  -= h * padRatio; bottom += h * padRatio;
    w = right - left; h = bottom - top;

    var frameW = frame.clientWidth, frameH = frame.clientHeight;
    var natW = img.naturalWidth  || 2752.766;
    var natH = img.naturalHeight || 1537.631;
    var frameAspect = frameW / frameH;

    /* bbox의 가로세로 비율을 프레임 비율에 맞춰 한쪽만 "확장"해서 맞춘다.
       (min/max 배율 방식은 두 핀이 잘리거나 프레임에 여백이 남는 문제가 있어,
       항상 필요한 영역을 포함하는 방향으로만 넓혀서 프레임을 완전히 채우도록 함) */
    var cx = (left + right) / 2, cy = (top + bottom) / 2;
    var bboxPxRatio = (w * natW) / (h * natH);
    if (bboxPxRatio < frameAspect) {
      var neededWFrac = (h * natH * frameAspect) / natW;
      left = cx - neededWFrac / 2; right = cx + neededWFrac / 2;
      w = neededWFrac;
    } else {
      var neededHFrac = (w * natW) / frameAspect / natH;
      top = cy - neededHFrac / 2; bottom = cy + neededHFrac / 2;
      h = neededHFrac;
    }

    /* 확장한 범위가 지도 가장자리(0~1) 밖으로 나가면 안쪽으로 밀어서 보정
       (크기는 그대로 유지 — 목적지가 지도 동쪽 끝(한국·일본 등) 근처라 넓힌 범위가
       180도 선을 넘어가며 프레임에 빈 여백이 남던 문제) */
    if (right > 1) { left -= (right - 1); right = 1; }
    if (left < 0)  { right -= left; left = 0; }
    if (bottom > 1) { top -= (bottom - 1); bottom = 1; }
    if (top < 0)    { bottom -= top; top = 0; }
    w = right - left; h = bottom - top;
    cx = (left + right) / 2; cy = (top + bottom) / 2;

    var scale = frameW / (w * natW);
    scale = Math.min(scale, 7); /* 과도한 확대 방지 — 저해상도 지도 자산 특성상 너무 확대하면
       좌표 오차(1도 미만)가 시각적으로 크게 보일 수 있어 배율 상한을 보수적으로 설정 */

    var bw = natW * scale, bh = natH * scale;
    var offsetX = frameW / 2 - cx * bw;
    var offsetY = frameH / 2 - cy * bh;

    img.style.width  = bw + 'px';
    img.style.height = bh + 'px';
    img.style.left   = offsetX + 'px';
    img.style.top    = offsetY + 'px';

    function placePin(pinEl, frac) {
      if (!pinEl) return;
      pinEl.style.left = (offsetX + frac.x * bw) + 'px';
      pinEl.style.top  = (offsetY + frac.y * bh) + 'px';
      pinEl.classList.remove('hidden');
    }
    placePin(pinKorea, korea);
    placePin(pinDest, dest);

    if (label) {
      var destLabelEl = (typeof destinationSelect !== 'undefined') ? destinationSelect.selectedOptions[0] : null;
      label.textContent = destLabelEl ? destLabelEl.textContent.split(' (')[0] : destKey;
    }
    wrap.classList.remove('hidden');
  }

  if (img.complete && img.naturalWidth) {
    render();
  } else {
    img.onload = render;
  }
}

const DEST_IMAGES = {
  '도쿄':    ['이미지/도쿄/1.jpg','이미지/도쿄/3.jpg','이미지/도쿄/4.jpg','이미지/도쿄/5.jpg'],
  '오사카':  ['이미지/도쿄/3.jpg','이미지/도쿄/4.jpg'],
  '후쿠오카':['이미지/도쿄/1.jpg'],
  '나고야':  ['이미지/도쿄/4.jpg'],
  '삿포로':  ['이미지/도쿄/5.jpg'],
  '홍콩':    ['이미지/홍콩/1.jpg'],
  '마카오':  ['이미지/홍콩/1.jpg'],
  '상해':    ['이미지/상해/image (1).jpg'],
  '대만':    ['이미지/타이베이/1.jpg'],
  '몽골':    ['이미지/몽골/1.jpg'],
  '싱가포르':['이미지/싱가포르/1.jpg','이미지/싱가포르/2.jpg','이미지/싱가포르/3.jpg'],
  '하노이':  ['이미지/하노이/1.jpg'],
  '방콕':    ['이미지/방콕/1.jpg'],
  '발리':    ['이미지/발리/1.jpg'],
  '뉴욕':    ['이미지/뉴욕/1.jpg'],
  '파리':    ['이미지/프랑스/1.jpg','이미지/프랑스/3.jpg'],
  '독일':    ['이미지/독일/1.jpg'],
  '시드니':  ['이미지/시드니/1..jpg','이미지/시드니/10.jpg'],
  '우즈베키스탄':['이미지/우즈베키스탄/image (1).jpg'],
};

/* ════════════════════════════════════════════════════════════════════
   참여자 가이드 — 프로그램 유형별 Tips + 목적지별 문화 노트
   ════════════════════════════════════════════════════════════════════ */
const PARTICIPANT_TIPS = {
  language: [
    '모르는 표현이 나와도 두려워하지 마세요. 틀리더라도 직접 써보는 것이 가장 빠른 학습입니다.',
    '식당·편의점·마트에서 현지어로만 주문·계산하는 습관을 만들어보세요. 일상이 교실이 됩니다.',
    '번역기보다 배운 표현을 먼저 써보세요. 실전 경험이 실력을 만듭니다.',
    '매일 저녁 오늘 배운 표현 5개를 메모하세요. 귀국 후 복습에 큰 도움이 됩니다.',
    '발음이 어색해도 괜찮습니다. 노력하는 모습에 현지인들은 더욱 친절하게 반응합니다.',
  ],
  leadership: [
    '기업·기관 방문 중 "왜 이 결정을 했는가?"를 중심으로 관찰하세요. 리더의 사고방식이 핵심입니다.',
    '팀원 간 솔직한 피드백을 나누는 시간을 하루 15분씩 가져보세요. 진정한 성장은 여기서 시작됩니다.',
    '개인 리더십 노트를 작성하세요. 본 것·느낀 것·내 조직에 적용할 것 세 항목으로 정리하면 좋습니다.',
    '현지 관리자에게 "조직 내 가장 어려운 순간을 어떻게 극복했나요?"를 꼭 물어보세요.',
    '팀빌딩 프로그램에서는 결과보다 과정 속 팀원의 역할 변화를 관찰하면 큰 배움을 얻습니다.',
  ],
  industry: [
    '방문 기업의 최신 뉴스와 연간 보고서를 전날 5분만 읽어보세요. 질문의 깊이가 달라집니다.',
    '"한국과 가장 다른 점이 무엇인가요?"를 꼭 질문하세요. 차이에서 배움이 나옵니다.',
    '사진 촬영 전 항상 허가 여부를 확인하세요. 기업 현장은 보안 사항이 많습니다.',
    '자유 시간에는 현지 마트·편의점에 들러보세요. 소비 문화와 산업 트렌드가 그대로 보입니다.',
    '연수 일지를 매일 작성하세요. 귀국 후 3개월이 지나면 세부 기억이 흐려집니다.',
  ],
  academic: [
    '"이 정책이 실패했던 사례가 있나요?"를 물어보세요. 성공보다 실패에서 더 많이 배웁니다.',
    '연구 자료나 정책 문서를 요청해보세요. 많은 기관이 방문자에게 기꺼이 자료를 제공합니다.',
    '대학 캠퍼스에서는 현지 학생들과 짧은 대화를 나눠보세요. 미래 세대의 시각이 담겨있습니다.',
    '"성과를 어떻게 측정하나요?"를 핵심 질문으로 활용하세요. 어떤 기관에도 유효한 질문입니다.',
    '귀국 후 한 달 내에 연수 보고서를 작성하는 것이 가장 효과적입니다. 기억이 생생할 때 기록하세요.',
  ],
};

const DEST_PARTICIPANT_NOTE = {
  '도쿄':   '일본은 조용한 공공 예절을 중시합니다. 대중교통·식당에서의 소음과 통화는 자제하고, 줄서기 문화를 꼭 지켜주세요.',
  '싱가포르':'싱가포르는 음식물 반입 금지·쓰레기 투기 등에 벌금이 엄격합니다. 식수는 수돗물도 안전하니 텀블러를 활용하세요.',
  '뉴욕':   '맨해튼은 도보로 즐기기 좋은 도시입니다. 메트로카드와 구글맵을 첫날 준비하고, 팁 문화(15~20%)에 익숙해지면 편합니다.',
  '파리':   '현지인들은 프랑스어 인사를 먼저 건네면 훨씬 친절하게 반응합니다. "Bonjour"로 시작하는 습관 하나만으로 분위기가 달라집니다.',
  '독일':   '독일은 시간 약속에 매우 엄격합니다. 미팅·견학 5분 전 도착을 원칙으로 하세요. 일요일에는 대부분 상점이 문을 닫습니다.',
  '시드니': '호주의 자외선은 매우 강합니다. 야외 활동 시 선크림(SPF 50+)과 모자는 필수입니다. 날씨 변화가 빠르니 겉옷도 챙기세요.',
  '홍콩':   '옥토퍼스 카드 하나로 지하철·버스·편의점을 모두 해결할 수 있습니다. 첫날 구입해 두면 이동이 훨씬 편리합니다.',
  '상해':   '위챗페이 또는 알리페이 없이는 결제가 불편할 수 있습니다. 현금(위안화) 소액을 미리 환전해 두는 것을 권장합니다.',
  '하노이': '도심의 오토바이 교통은 처음에 압도적으로 느껴집니다. 길을 건널 때는 일정한 속도로 천천히 걸으면 오토바이가 알아서 피해갑니다.',
  '방콕':   '사원 방문 시 어깨와 무릎을 가리는 복장이 필수입니다. 신발 탈착이 잦으므로 편하게 벗고 신을 수 있는 신발을 착용하세요.',
  '발리':   '사원 경내에서는 사롱(전통 천)을 두르고 입장합니다. 사원 입구에서 무료 대여도 가능하니 걱정하지 않아도 됩니다.',
  '우즈베키스탄':'여름 기온이 40°C를 웃돌 수 있습니다. 충분한 수분 섭취와 모자는 필수이며, 화폐 환전은 현지 도착 후 ATM 이용이 유리합니다.',
  '몽골':   '초원은 낮과 밤 기온 차이가 크게 납니다. 여름에도 저녁용 두꺼운 겉옷을 반드시 준비하세요. 게르 체험 시 불 예절을 꼭 지켜주세요.',
  '대만':   '대만은 친절하고 안전한 여행지입니다. 편의점(7-11, FamilyMart)이 곳곳에 있어 생활 편의용품 대부분을 구할 수 있습니다.',
  '오키나와':'오키나와는 류큐 왕국의 독자적 역사·문화를 지녀 일본 본토와 분위기가 다릅니다. 아열대 기후로 자외선이 강하니 선크림은 필수이며, 이동은 모노레일과 렌터카를 함께 활용하면 편리합니다.',
};

/* ════════════════════════════════════════════════════════════════════
   목적지별 Unsplash 대표 사진 (cover + 스트립 10장)
   ════════════════════════════════════════════════════════════════════ */
const DEST_PHOTOS = {
  '도쿄': {
    cover: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1490806843957-31f3fad8abef?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1480796927426-f609979314bd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1568093177597-01eaacf89f0e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1549693578-d683be217e58?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1506452819775-a3e736a7b83d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1557411732-1797a9171fcf?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '싱가포르': {
    cover: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1565967511849-76a60a516170?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1464817739973-0128fe05fd88?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1570699978-9cae72d4abb9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542397284385-6010376c5337?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555217851-6141535bd771?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1606940482-5e24e0a28a6f?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '뉴욕': {
    cover: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1485095329183-d0797cdc5eea?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1490644658840-3f2e3f8c5625?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555109307-f7d9da25c244?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1541336032412-2048a678540d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1575373572312-3abf4b14f64a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1478860409698-8707f313ee8b?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '파리': {
    cover: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1499856374427-feca06d7e3c6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1431274172761-fba41d0d3c36?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1520939817895-060bdaf4fe1b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1471623432079-b009d30b6729?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1543349689-9a4d426bee8e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1550340499-a6c60fc8287c?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '홍콩': {
    cover: 'https://images.unsplash.com/photo-1506970845246-18f21d533b20?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1490015119337-d39ab2b0c69a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1581976132447-d2bafd4b40c7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1567861911437-538298e4232c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1464817739973-0128fe05fd88?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1563095518543-d0da85b7a4bf?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1572117264613-82c2c94fb72f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '상해': {
    cover: 'https://images.unsplash.com/photo-1538428494232-9c0d8a3ab403?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1545920783-e03a4e1e83e4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1551698317-3c4158a82908?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1518612905562-a6de20ff0d75?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1523481293034-7e0e70f8dbd0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1570394325215-b6b2534a6b5f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1598935898639-81586f7d2129?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555899434-94d1368aa7af?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '하노이': {
    cover: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1586611292717-f828b167408c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1583417267826-aebc4d1542e1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1567599872808-3f0fc36b9bce?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1528702748617-c64d49f918af?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534814338557-b54e0a2afc59?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1549693578-d683be217e58?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1592325410850-bf3cf0e285c5?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '방콕': {
    cover: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1550051066-4c5531e5c2ac?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1583417219003-4d27c8b7d7a0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1578469645742-46cae010e5d4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1519181258491-889d171c945e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '발리': {
    cover: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1570789210967-2cac24afeb00?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1604999333679-b86d54738315?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558005137-d9619a5c539f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1604855247773-7e1fde6e5b6a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1518548635469-7b163b0a2bbb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1573790387438-4da905039392?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '독일': {
    cover: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1534003728-26547c00a574?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1449452198679-05c7fd30f416?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1527866512907-a35a62a0f6c5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1467015752726-49a0f488e77a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1554931670-4ebfabf6e7a9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555993539-1732b0258235?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1598935898639-81586f7d2129?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '시드니': {
    cover: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1524820801657-fd59673fbb0e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1548605218-8e7ad68a0acf?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1546268060-2592ff93ee24?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1553525552-1e4571eb30eb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1531777319985-9dca28eedc5c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1523059623039-a9ed027d9d6e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1586183189334-e7b077f70a71?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558548635469-7b163b0a2bbb?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '우즈베키스탄': {
    cover: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611423476291-953c8c8c4b11?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1609137144813-7d9921338f24?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1598932924934-a8e36b3c9f21?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1567598735566-46a0a2d79e91?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1593649437669-4e31beefb4e0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1543269866-487b0fc3b4dc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1565298771648-7e1f78a4a4d5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1592394532824-bfff8e3da6fe?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '몽골': {
    cover: 'https://images.unsplash.com/photo-1509027572446-af8401acfdc3?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508005272-b9c4a18c9f8c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1553603228-97c1ab0b04a2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1610375461249-e4c1f70dbbb4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1540621394-a6fa27feefac?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534214526114-0ea4d47b04f2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508940462894-3e7aab7a5e04?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611419010997-2e2af1d1c3f7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1597347343908-2937e7dcc560?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '대만': {
    cover: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1547394765-185e1e68f34e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1567706896826-db60abed9e5d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1509255929945-586a420363a6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1598935898639-81586f7d2129?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1563421668-b9e4c2e49a20?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534814338557-b54e0a2afc59?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '영국': {
    cover: 'https://images.unsplash.com/photo-1549483249-f0b359d1e289?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1543832923-44667a44c804?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1480449649358-ee14c6ee0b17?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1712873068978-eb0cb20d1b62?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1581279813180-4dddc1008167?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1627899016844-34b0dea76d9c?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '로마': {
    cover: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1555992828-ca4dbe41d294?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1603199766980-fdd4ac568a11?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1632851853187-dae5c83372dc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1588614959060-4d144f28b207?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '로스앤젤레스': {
    cover: 'https://images.unsplash.com/photo-1597982087634-9884f03198ce?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1665412019489-1928d5afa5cc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1572925151789-c13420b54514?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1549041050-386c1c99d655?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542737579-ba0a385f3b84?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1619678562883-7f77b7c68d3c?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '호치민': {
    cover: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1536086845112-89de23aa4772?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1602646994030-464f98de5e5c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1680525534259-773f7e73b687?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1602646993776-5dd8e166e6fd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1591269469224-0479a5f956c6?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '스페인': {
    cover: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1630219694734-fe47ab76b15e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1579282240050-352db0a14c21?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511527661048-7fe73d85e9a4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558642084-fd07fae5282e?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '마닐라': {
    cover: 'https://images.unsplash.com/photo-1607282729548-e1d13feae36f?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1598258710957-db8614c2881e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1655016268120-383558788b37?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1653724379257-4232708ce132?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1599272585578-03bfc70032b5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1501890664351-4ef399c1524f?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '세부': {
    cover: 'https://images.unsplash.com/photo-1751814203300-665934deae36?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1751814202901-2a73fd330e66?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1751814202997-02e2992ca152?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1732009484780-5fcac2caa314?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1682246475305-3f7d7f494b3e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1574246457957-08b1e640fa80?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '괌': {
    cover: 'https://images.unsplash.com/photo-1599172806427-975cc19da9c7?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1674402644517-b2afaf473f0f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1688824492225-067bea26d56e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1706242294118-2c14ead8db3a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1706242139269-2b3bb13b9cb8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1627985381924-eb81a27669bb?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '오클랜드': {
    cover: 'https://images.unsplash.com/photo-1595125989588-36d745a2a828?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1595125990323-885cec5217ff?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1602847189686-6bb361a3066d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600208669687-f19af3638cb9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1523049820105-c2e73204bac1?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '캄보디아': {
    cover: 'https://images.unsplash.com/photo-1599283787923-51b965a58b05?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1566706546199-a93ba33ce9f7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1549463601-da058868e20d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1609949165382-2e442783c8d5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1569668723493-80d82b05bad7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1541429464955-87bd98d6d8f8?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '멜버른': {
    cover: 'https://images.unsplash.com/photo-1595434971780-79d5c20c5090?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1545044846-351ba102b6d5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1514395462725-fb4566210144?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1612415491873-144fd5e03169?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1594300157693-a741f98738c2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1546868762-b61266729c8a?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '오키나와': {
    cover: 'https://images.unsplash.com/photo-1645610115316-dc38e31a1e9b?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1610971250019-f677bc1300be?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1651422589451-db2ae2140b04?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611210040662-dcd41b879c8f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1625548894051-8ddd8650c6ab?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1645610307780-3936d382ab1c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1651395054095-faaf63e8e516?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1513649313539-232ea1cc5d5a?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '장가계': {
    cover: 'https://images.unsplash.com/photo-1743093263638-845bee7205c0?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1546707640-7ba6e4b2df2e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1743093263841-37c2edb04ed2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1569396364521-0fad3682a389?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1521075264020-fe37135bf304?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1630164875646-19bd2b49bae6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1739049073427-2a074b3692ff?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1632377082403-214778bec07b?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '청도': {
    cover: 'https://images.unsplash.com/photo-1739436598532-f22747099b6f?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1721794525689-d2bd76190f1e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1541062880546-661f13176baf?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1689143626749-3c2ab3ebca45?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1710172899520-1db2e7cf6e32?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1659194089115-ebfe7194ef61?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1733626928339-af80bd586b5d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1718442759033-8ea95377e6ef?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '연태': {
    cover: 'https://images.unsplash.com/photo-1506158669146-619067262a00?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1603384446936-5646a2481a36?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600623305065-140c9031f631?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1584872589930-e99fe5bf4408?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1543843665-77bc199b4209?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1537228710341-ca26f67b7578?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1578495959700-a617c3600026?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1473938718606-f15cdc613d96?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '가오슝': {
    cover: 'https://images.unsplash.com/photo-1571555788467-71d9e3add426?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1571555787518-6ac85ee2529e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1643719713572-691cd0ae06a2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1571555787323-b3e711e2d8c9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1686616098894-c69b8963bbd4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1677012878685-f752fb703f53?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1647438193740-64016bbaf6e5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1521683898775-cf658b5f2cba?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '다낭': {
    cover: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1603852452378-a4e8d84324a2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555979864-7a8f9b4fddf8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1722526933541-9a9cdfcdb28f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1684784784123-0854fc0eec25?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1505018620898-92616e1849cc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1670993077545-bfeeea1e0b5f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1720777366540-ca547cbddfa1?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '나트랑': {
    cover: 'https://images.unsplash.com/photo-1654930453993-bf69bbb3a00d?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1617857995575-d102f16fd3e7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1689326232193-d55f0b7965eb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1533002832-1721d16b4bb9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1676557060416-1418aefb165d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1580140204263-0adff7dc519f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1570366290364-5e76a15ae408?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1689326232616-aea5c86f86bd?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '푸꾸옥': {
    cover: 'https://images.unsplash.com/photo-1526139334526-f591a54b477c?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1746292448726-9e75b5f1067d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1693294603830-f44c9511d643?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1693282814784-649be45a459b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1730714103959-5d5a30acf547?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1732243395944-cb3ff9311091?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1698809807960-758cf416e96e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1693282815546-f7eeb0fa909b?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '보홀': {
    cover: 'https://images.unsplash.com/photo-1591506557489-e8ca407063e7?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1728042743743-e2a2abf35c47?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1622372408675-b226090fd4fe?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1757949640707-805fc997ae4c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1592303071869-882ab783e4ef?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1546775349-20a481376a8b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558260963-fd8436b4be0a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1615447865649-317d38246c78?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '코타키나발루': {
    cover: 'https://images.unsplash.com/photo-1692617993977-eced61646e20?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1681080897896-b524d6850d7c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1526091202567-544e19815ebc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1579685849448-9c78a8373aa5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1681081449038-524f4683c6aa?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1697538835982-534445406b39?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1655429818555-057ebe02e988?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '푸켓': {
    cover: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1534008897995-27a23e859048?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1601225612316-b4733315a717?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1494949360228-4e9bde560065?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1506665531195-3566af2b4dfa?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1483683804023-6ccdb62f86ef?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '치앙마이': {
    cover: 'https://images.unsplash.com/photo-1512553353614-82a7370096dc?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1599576838688-8a6c11263108?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1578157695179-d7b7ddeb2f53?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1682826556362-2c06b7ac75c5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1544467187-784a3534a696?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1505471768190-275e2ad7b3f9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1520962880247-cfaf541c8724?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1569675144094-c3a162c90b7c?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '라오스': {
    cover: 'https://images.unsplash.com/photo-1610426714962-83caa2244105?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1441632260885-881646a7fd4d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1686120552846-7caf1a345876?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1693039880389-62840065382c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1707817643213-35009bae9814?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1642085107639-bc9e2f7ee835?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1595486818044-598b89016c5b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1744593419072-a19dbbf7e0f3?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '카자흐스탄': {
    cover: 'https://images.unsplash.com/photo-1659651117607-d2b397cf100f?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1530480667809-b655d4dc3aaa?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1677475191981-653bcfcc3cd2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1548450847-8a9a5cc3968f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1619265180726-6c11823ebf6a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1716835018054-5b13e5ef53b0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1716835018087-e618d839eb59?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1659653159038-f68fe4b1fdc0?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '호주': {
    cover: 'https://images.unsplash.com/photo-1607309843659-f4ad95cf3277?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1591701729564-3b5325d5a4bd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1661674753163-0f8bca582509?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1582761371078-6509f13666b1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1599097653069-bf45de660b69?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1626070191915-0ae0d9089132?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1628330565454-aa57f15ef3ee?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1607309844300-0a3f21444b2c?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '사이판': {
    cover: 'https://images.unsplash.com/photo-1631342412627-50776080025b?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1577951364190-2a0209839dfd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1584162599819-8c2ba73f957f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1492994170525-601549480c69?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1678017055714-d645b4780b8c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1584162607168-7cf2a46a57bf?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1586417752757-99069c119f3d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1510574243370-25fe8a740536?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '네덜란드': {
    cover: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1584003564911-a7a321c84e1c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1580996378027-23040f16f157?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1605101100278-5d1deb2b6498?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1583295125721-766a0088cd3f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1576924542622-772281b13aa8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1536880756060-98a6a140f0a7?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '동유럽': {
    cover: 'https://images.unsplash.com/photo-1592906209472-a36b1f3782ef?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1458150945447-7fb764c11a92?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1619558846792-1fc47446bbd7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1596811311317-c948dd4382dd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1463143296037-46790ff95a7e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558717907-366df4bdcac1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1563913801192-bcefb1bb7651?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1452165598664-87835d28c9d9?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '북유럽': {
    cover: 'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1572225303717-a96db5e8d8b0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508189860359-777d945909ef?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1630772063386-f363836989cc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1588653818221-2651ec1a6423?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600290601473-3b73e4c531c9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1580339841933-f06ca55842d0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1596636478939-59fed7a083f2?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '서유럽': {
    cover: 'https://images.unsplash.com/photo-1769981639118-e63f99901eeb?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1764214656596-edc7988f3730?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1780859098058-32dc37f3cfda?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1777913829206-3499d5855da7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1776075509360-1f3a5e550cc5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1782434933294-f51f3a979f30?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1779474653231-f1dbe1726593?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1778944650687-e0ef5733569a?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '샌프란시스코': {
    cover: 'https://images.unsplash.com/photo-1719858403364-83f7442a197e?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1521747116042-5a810fda9664?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1500111709600-7761aa8216c7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1541464522988-31b420f688b9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1514911834724-fbe785fc8a6a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1509817312789-ad718caba3b2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1445294812422-0bb9cb94c286?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1475947175089-3a98ee67944b?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '워싱턴': {
    cover: 'https://images.unsplash.com/photo-1617581629397-a72507c3de9e?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1463839346397-8e9946845e6d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1583176689170-990094dcd953?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1574365379583-54937ea00cb8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1565571370459-5c78ebb358de?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1641327384123-3f8cc49ebf4f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1625882586497-458c0e7d7e23?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1617293541287-5530026ca9b1?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '하와이': {
    cover: 'https://images.unsplash.com/photo-1505852679233-d9fd70aff56d?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1598135753163-6167c1a1ad65?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1545251142-f32339076e6d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1462400362591-9ca55235346a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1586996292898-71f4036c4e07?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542259009477-d625272157b7?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1566932234191-3bdd9eeca73c?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '밴쿠버': {
    cover: 'https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1560813962-ff3d8fcf59ba?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1660143158587-bddffa026e06?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1560814304-4f05b62af116?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1515884045391-a9e471f4d36f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1553855804-5ccc88ae0a2b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1592838918087-5d4d31e32204?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1519331582073-283f1a211a3e?auto=format&fit=crop&w=800&q=80',
    ]
  },
  '토론토': {
    cover: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?auto=format&fit=crop&w=1200&q=80',
    strip: [
      'https://images.unsplash.com/photo-1507992781348-310259076fe0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1559869824-929df9dab35e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1543962226-818f4301073f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1569982615761-66697da68502?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1586576782138-19304c43d0e1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1632857997897-9418428d7368?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1610509659326-b35b9b15bf51?auto=format&fit=crop&w=800&q=80',
    ]
  },
};

/* ════════════════════════════════════════════════════════════════════
   일정 데이터베이스 — 목적지별 2가지 추천 코스
   ════════════════════════════════════════════════════════════════════ */
const ITINERARY_DB = {

  /* ─── 일본 도쿄 ────────────────────────────────────────────────── */
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
   프로그램 유형 × 목적지별 코스 우선순위
   [primaryIdx, secondaryIdx]  — 배열 인덱스 초과 시 자동 fallback
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

/* ════════════════════════════════════════════════════════════════════
   일정 조회 헬퍼 — 견적 프로그램 유형 기반 스마트 코스 선택
   ════════════════════════════════════════════════════════════════════ */
const _FALLBACK_MAP = {
  /* 아래 목적지들은 ITINERARY_DB에 직접 항목 없음 → API 동적 생성 또는 DEST_REC fallback */
  /* 일본 소도시: DB 없음 → API 호출 (오키나와 등) */
  '오사카':'도쿄','후쿠오카':'도쿄','나고야':'도쿄','삿포로':'도쿄',
  /* 오키나와는 DEST_REC에 데이터 있음 → fallback 불필요 (API 우선) */
  '장가계':'상해','청도':'상해','연태':'상해','마카오':'홍콩','가오슝':'대만',
  '호치민':'하노이','다낭':'하노이','나트랑':'하노이','푸꾸옥':'하노이',
  '마닐라':'방콕','세부':'발리','보홀':'발리',
  '코타키나발루':'싱가포르','캄보디아':'방콕',
  '푸켓':'방콕','치앙마이':'방콕',
  '라오스':'방콕','카자흐스탄':'우즈베키스탄',
  '멜버른':'시드니','호주':'시드니','오클랜드':'시드니',
  '괌':'뉴욕','사이판':'뉴욕','하와이':'뉴욕',
  '영국':'독일','로마':'파리','네덜란드':'독일',
  '스페인':'파리','동유럽':'독일','북유럽':'독일','서유럽':'파리',
  '로스앤젤레스':'뉴욕','샌프란시스코':'뉴욕','워싱턴':'뉴욕',
  '밴쿠버':'뉴욕','토론토':'뉴욕',
};

/* ── 동적 일정 캐시 (localStorage) ──────────────────────────────────
   키: itinerary_cache_{destKey}_{days}
   값: { courses:[...], ts: ISO }  30일 유효
   ─────────────────────────────────────────────────────────────────── */
var _ITINERARY_API = 'http://localhost:8765';

function _dynCacheKey(dest, days) {
  return 'itinerary_cache_' + dest + '_' + days;
}
function _dynCacheGet(dest, days) {
  try {
    var raw = localStorage.getItem(_dynCacheKey(dest, days));
    if (!raw) return null;
    var obj = JSON.parse(raw);
    var age = Date.now() - new Date(obj.ts).getTime();
    if (age > 30 * 24 * 3600 * 1000) { localStorage.removeItem(_dynCacheKey(dest, days)); return null; }
    return obj.courses;
  } catch (e) { return null; }
}
function _dynCacheSet(dest, days, courses) {
  try {
    localStorage.setItem(_dynCacheKey(dest, days),
      JSON.stringify({ courses: courses, ts: new Date().toISOString() }));
  } catch (e) {}
}

/* 목적지가 DB에 직접 있는지 확인 (fallback 사용 중이면 false) */
function _hasDirectEntry(destKey) {
  return !!ITINERARY_DB[destKey];
}

/* 동적 일정 fetch (API 서버) → Promise<courses[]> */
function fetchDynamicItinerary(destKey, days) {
  var cached = _dynCacheGet(destKey, days);
  if (cached) return Promise.resolve(cached);

  var url = _ITINERARY_API + '/api/itinerary?dest=' + encodeURIComponent(destKey) + '&days=' + days;
  return fetch(url, { signal: AbortSignal.timeout(30000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.courses && data.courses.length) {
        _dynCacheSet(destKey, days, data.courses);
        return data.courses;
      }
      throw new Error('no courses');
    });
}

/* 동기 버전 — ITINERARY_DB 직접 등록 목적지에만 사용 */
function getItineraries(destKey, programType) {
  /* 직접 DB 항목이 있을 때만 사용, 없으면 빈 배열 반환 (async 경로로 처리) */
  if (!_hasDirectEntry(destKey)) {
    return null;   /* null → 호출자가 fetchDynamicItinerary 로 분기 */
  }

  const courses = ITINERARY_DB[destKey];

  /* 프로그램 유형 기반 우선순위 적용 */
  if (programType && courses.length >= 2) {
    const priority = (PROGRAM_PRIORITY[destKey] || {})[programType];
    if (priority) {
      const primary   = courses[priority[0]] || courses[0];
      const secondary = courses[priority[1]] || courses[1] || courses[0];
      return [primary, secondary];
    }
  }

  return [courses[0], courses[1] || courses[0]];
}

/* ITINERARY_DB의 코스는 전부 "5일 고정"(마지막 날 = 귀국 콘텐츠)으로 작성되어 있음.
   실제 선택 일수(totalDays)가 5보다 크거나 작을 때, 마지막 날(귀국) 콘텐츠가 항상
   실제 마지막 날에만 나오도록 재배치하고, 5일보다 긴 경우 사이 날짜는 DEST_REC/
   highlights 기반 콘텐츠로 채운다. (기존엔 5일 초과 시 DB의 5일차 "귀국" 콘텐츠가
   중간 날짜에 그대로 노출되어 "왜 갑자기 공항으로 복귀하냐"는 문제가 있었음) */
function _buildDisplayDays(course, destKey, plan, totalDays) {
  const baseDays = (course && Array.isArray(course.days)) ? course.days : [];
  if (!baseDays.length) return [];

  const regular   = baseDays.slice(0, -1);          /* 도착~액티비티 (귀국일 제외) */
  const returnDay = baseDays[baseDays.length - 1];  /* 귀국일 템플릿 */

  const rec  = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  const pRec = rec ? rec[plan] : null;
  const pool = (pRec && pRec.items && pRec.items.length) ? pRec.items : (course.highlights || []);

  const out = [];
  for (let i = 1; i <= totalDays; i++) {
    if (i === totalDays) {
      out.push(Object.assign({}, returnDay, { day: i }));
      continue;
    }
    const regIdx = i - 1;
    if (regIdx < regular.length) {
      out.push(Object.assign({}, regular[regIdx], { day: i }));
    } else {
      const act = pool[(i - regular.length - 1) % Math.max(pool.length, 1)] || '현지 탐방 · 자유 시간';
      out.push({
        day: i, title: act,
        am: act + ' — 오전 코스',
        pm: '연계 오후 프로그램 · 현장 방문',
        eve: '팀 석식',
        tip: '',
      });
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════
   견적서 확인 창 열기 (PDF → 웹 브라우저 창)
   ════════════════════════════════════════════════════════════════════ */
function openEstimateWindow() {
  const data = getBreakdownData();
  if (!data) { alert('먼저 견적 정보를 입력해 주세요.'); return; }

  const destKey      = destinationSelect.value;
  const destText     = destinationSelect.selectedOptions[0]?.textContent || '—';
  const programEl    = document.getElementById('programType');
  const programType  = programEl.value;
  const programText  = programEl.selectedOptions[0].textContent;
  const orgTypeText  = document.getElementById('organizationType').selectedOptions[0].textContent;
  const visitModeText = document.getElementById('visitMode')?.selectedOptions[0]?.textContent || '';
  const participants = document.getElementById('participants').value;
  const days         = Number(document.getElementById('days').value) || 5;
  const organization = document.getElementById('organization')?.value.trim() || '—';
  const contactName  = document.getElementById('contactName')?.value.trim() || '—';
  const requestDetails = document.getElementById('requestDetails')?.value.trim() || '';

  /* 직접 DB 항목이 없으면 → API로 비동기 생성 후 재호출 */
  if (!_hasDirectEntry(destKey)) {
    var cached = _dynCacheGet(destKey, days);
    if (cached) {
      /* 캐시 있음 → 즉시 DB에 주입하고 계속 */
      ITINERARY_DB[destKey] = cached;
    } else {
      /* 캐시 없음 → 로딩 토스트 표시 후 API 호출 */
      _showApiToast(destKey + ' 맞춤 일정을 생성 중입니다… (10~20초)');
      fetchDynamicItinerary(destKey, days).then(function(courses) {
        ITINERARY_DB[destKey] = courses;
        _hideApiToast();
        openEstimateWindow();   /* 재호출 — 이번엔 캐시 히트 */
      }).catch(function(err) {
        _hideApiToast();
        /* API 실패 시: DEST_REC 기반 임시 코스로 대체 */
        ITINERARY_DB[destKey] = _makeCoursesFromDestRec(destKey, days);
        openEstimateWindow();
      });
      return;   /* 비동기 처리 중이므로 여기서 중단 */
    }
  }

  const fmt = n => '₩ ' + n.toLocaleString('ko-KR');
  const issueDate = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
  const startDateLabel = document.getElementById('startDate')?.value
    ? new Date(document.getElementById('startDate').value).toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' }) : '—';
  const endDateLabel = document.getElementById('endDate')?.value
    ? new Date(document.getElementById('endDate').value).toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' }) : '—';

  const rateDate = (function(){ const d = getDestinationByKey(destKey); return d&&d.rateDate ? formatRateDate(d.rateDate) : '—'; })();
  const rateVer  = typeof RATE_META !== 'undefined' ? RATE_META.version : '—';

  /* 포함 항목 */
  const incItemsHtml = data.rows.filter(r => !r.muted)
    .map(r => `<span class="inc-tag">${r.name}</span>`).join('');

  /* 일정 추천 */
  const itineraries = getItineraries(destKey, programType) || [ITINERARY_DB[destKey][0], ITINERARY_DB[destKey][1] || ITINERARY_DB[destKey][0]];
  const itiA = itineraries[0];
  const itiB = itineraries[1] || itineraries[0];

  /* 실제 선택 일수에 맞춰 귀국일 콘텐츠가 마지막 날에만 나오도록 재배치
     (ITINERARY_DB 코스는 전부 5일 고정으로 작성되어 있음) */
  const itiADisplayDays = _buildDisplayDays(itiA, destKey, 'a', days);
  const itiBDisplayDays = _buildDisplayDays(itiB, destKey, 'b', days);

  /* STEP3 탐색기에서 이미 플랜을 선택한 경우, 그 선택을 견적서에도 그대로 반영 */
  const selectedPlan = (typeof _currentPlan !== 'undefined' && _currentPlan) ? _currentPlan : '';

  /* 이미지 경로 (절대 경로 변환) */
  const base = new URL('.', location.href).href;
  const images = (DEST_IMAGES[destKey] || []).map(p => base + encodeURI(p));

  /* 목적지 Unsplash 사진 — 선택 목적지가 DEST_PHOTOS와 ITINERARY_DB 모두에 직접 등록된 경우에만 표시 */
  const destPhotos = (DEST_PHOTOS[destKey] && ITINERARY_DB[destKey]) ? DEST_PHOTOS[destKey] : null;

  /* 공유 데이터 — 고객용 estimate-view.html 에 URL 인코딩으로 전달 */
  const _sd = document.getElementById('startDate')?.value || '';
  const _ed = document.getElementById('endDate')?.value || '';
  const shareData = {
    v: 1,
    dk: destKey, dt: destText,
    pt: programType, ptx: programText, ot: orgTypeText, vm: visitModeText,
    n: +participants, d: days, ng: data.nights,
    org: organization, cn: contactName,
    sd: _sd, ed: _ed,
    hgl: data.hotelGrade.label,
    sl: data.seasonInfo.label,
    t: data.total, pp: data.perPerson,
    iso: new Date().toISOString().slice(0, 10), /* 유효기간 계산용 */
    id: issueDate,
    rd: rateDate, rv: rateVer,
    rows: data.rows.filter(r => !r.muted).map(r => [r.name, r.amount]),
    req: requestDetails.slice(0, 300),
    itiA: { t: itiA.title, s: itiA.subtitle, h: itiA.highlights, d: itiADisplayDays },
    itiB: { t: itiB.title, s: itiB.subtitle, h: itiB.highlights, d: itiBDisplayDays },
    cover: destPhotos ? destPhotos.cover : '',
    strip: destPhotos ? destPhotos.strip.slice(0, 2) : [],
    sp: selectedPlan,
  };
  const shareEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
  const shareUrl = base + 'estimate-view.html?d=' + encodeURIComponent(shareEncoded);

  /* 참여자 가이드 렌더 */
  function renderParticipantGuide() {
    const tips = PARTICIPANT_TIPS[programType] || PARTICIPANT_TIPS.industry;
    const note = DEST_PARTICIPANT_NOTE[destKey] || DEST_PARTICIPANT_NOTE[_FALLBACK_MAP[destKey]] || '';
    return `
    <div class="participant-guide">
      <div class="pg-eyebrow">PARTICIPANT GUIDE</div>
      <div class="pg-title">참여자 가이드 · 현지에서 꼭 기억하세요</div>
      ${note ? `<div class="pg-note">${note}</div>` : ''}
      <ul class="pg-tips">
        ${tips.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>`;
  }

  /* 10장 갤러리 렌더 */
  function renderGallery(stripUrls) {
    if (!stripUrls || !stripUrls.length) return '';
    const items = stripUrls.map(url =>
      `<div class="g-item"><img src="${url}" alt="${destText} 현지" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    ).join('');
    return `
    <div>
      <div class="gallery-label">DESTINATION PHOTOS · ${destText} 현지 환경</div>
      <div class="dest-gallery">${items}</div>
    </div>`;
  }

  function renderDays(displayDays) {
    return displayDays.map(d => `
      <div class="day-card">
        <div class="day-hd">
          <span class="day-num">DAY ${d.day}</span>
          <span class="day-title">${d.title}</span>
        </div>
        <div class="day-sched">
          <span class="sched-t">오전</span><span>${d.am}</span>
          <span class="sched-t">오후</span><span>${d.pm}</span>
          <span class="sched-t">저녁</span><span>${d.eve}</span>
        </div>
        ${d.tip ? `<div class="day-tip">현장 Tip · ${d.tip}</div>` : ''}
      </div>`).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>견적서 · ${destText} · 비즈페이지</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;background:#F8F7F5;color:#0D0D0D;font-size:14px;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
/* ── NAV ── */
.top-nav{position:sticky;top:0;z-index:200;background:#0A0A0A;display:flex;align-items:center;justify-content:space-between;padding:13px 32px;gap:16px}
.nav-brand{color:#fff;font-weight:800;font-size:15px;letter-spacing:-.02em}
.nav-btns{display:flex;gap:10px;flex-shrink:0}
.btn-print{background:#CC001A;color:#fff;border:none;padding:8px 20px;border-radius:0;font-weight:700;cursor:pointer;font-size:13px;transition:background .2s}
.btn-print:hover{background:#8F0B20}
.btn-share{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:8px 18px;border-radius:0;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s}
.btn-share:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.7)}
.btn-close{background:transparent;color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.25);padding:8px 16px;border-radius:0;cursor:pointer;font-size:13px;transition:all .2s}
.btn-close:hover{background:rgba(255,255,255,.08)}
/* ── ANCHOR NAV ── */
.anchor-nav{background:#fff;border-bottom:1px solid #E5E2DC;display:flex;gap:0;overflow-x:auto}
.anchor-nav a{padding:12px 22px;font-size:13px;font-weight:600;color:#5A5A5A;border-bottom:2px solid transparent;white-space:nowrap;transition:all .2s}
.anchor-nav a:hover,.anchor-nav a.active{color:#111111;border-bottom-color:#CC001A}
/* ── LAYOUT ── */
.page-wrap{max-width:860px;margin:0 auto;padding:40px 24px 80px}
/* ── QUOTE DOC ── */
.quote-doc{background:#fff;border-radius:0;padding:48px;box-shadow:0 4px 24px rgba(0,0,0,.07);margin-bottom:40px}
.quote-hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111111;padding-bottom:20px;margin-bottom:28px}
.brand-name{font-size:20px;font-weight:800;color:#0D0D0D;letter-spacing:-.02em}
.brand-sub{font-size:11px;color:#9A9A9A;margin-top:2px}
.meta-blk{text-align:right;font-size:12px;color:#5A5A5A;line-height:1.8}
.meta-blk .issue{font-size:14px;font-weight:700;color:#0D0D0D}
.sec-title{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9A9A9A;border-bottom:1px solid #F0F0F0;padding-bottom:6px;margin-bottom:10px;margin-top:22px}
.info-tbl{width:100%;border-collapse:collapse;margin-bottom:4px}
.info-tbl td{padding:7px 10px;font-size:13px;border-bottom:1px solid #FAFAFA}
.info-tbl td:first-child{width:110px;font-weight:600;color:#5A5A5A;white-space:nowrap}
.inc-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.inc-tag{background:#FEF0F2;color:#111111;padding:4px 12px;border-radius:0;font-size:12px;font-weight:600}
.totals-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px 0}
.t-card{padding:18px 22px;border-radius:0;background:#F4F4F4;border-left:4px solid #111111}
.t-card.per{background:#FEF0F2;border-left-color:#CC001A}
.t-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#9A9A9A;margin-bottom:3px}
.t-amt{font-size:24px;font-weight:800;color:#0D0D0D;letter-spacing:-.02em}
.t-card.per .t-amt{color:#CC001A}
.q-disc{background:#FAFAF8;border-radius:0;padding:14px 18px;margin-top:14px;font-size:12px;color:#5A5A5A;line-height:1.75}
.q-stamp{display:inline-block;border:2px solid #111111;color:#111111;padding:3px 12px;font-weight:700;font-size:11px;letter-spacing:.1em;border-radius:0;margin-top:4px}
.q-print-btn{display:block;text-align:center;background:#111111;color:#fff;padding:14px;border-radius:0;font-weight:700;font-size:14px;cursor:pointer;border:none;margin-top:18px;width:100%;transition:background .2s}
.q-print-btn:hover{background:#CC001A}
/* ── SECTION ── */
.pg-section{margin-bottom:56px}
.sec-label{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#CC001A;margin-bottom:6px}
.pg-section h2{font-size:26px;font-weight:800;color:#0D0D0D;letter-spacing:-.02em;margin-bottom:6px}
.pg-section .sub{font-size:14px;color:#5A5A5A;margin-bottom:20px}
/* ── TABS ── */
.rec-tabs{display:flex;border-bottom:2px solid #EBEBEB;margin-bottom:28px}
.rec-tab{padding:12px 24px;border:none;border-bottom:3px solid transparent;background:transparent;color:#9A9A9A;font-size:13px;font-weight:700;cursor:pointer;transition:color .2s,border-color .2s;margin-bottom:-2px;letter-spacing:.01em;white-space:nowrap}
.rec-tab.active{color:#0D0D0D;border-bottom-color:#CC001A}
.rec-tab:hover{color:#5A5A5A}
.rec-content{display:none}.rec-content.active{display:block}
/* ── COURSE HEADER ── */
.course-hd{background:#F8F7F5;border-left:4px solid #CC001A;padding:22px 26px;margin-bottom:18px}
.course-hd .c-title{font-size:18px;font-weight:800;color:#0D0D0D;letter-spacing:-.01em;margin-bottom:5px}
.course-hd .c-sub{font-size:13px;color:#5A5A5A;margin-bottom:14px}
.c-highlights{display:flex;flex-wrap:wrap;gap:7px}
.c-hl{background:#fff;border:1px solid #E5E2DC;padding:4px 12px;border-radius:0;font-size:12px;font-weight:600;color:#0D0D0D}
/* ── DAY CARDS ── */
.day-timeline{display:flex;flex-direction:column;gap:10px}
.day-card{background:#fff;border-radius:0;padding:18px 22px;box-shadow:0 2px 8px rgba(0,0,0,.04);border-left:3px solid #E5E2DC;transition:border-color .2s}
.day-card:hover{border-left-color:#CC001A}
.day-hd{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.day-num{background:#111111;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:0}
.day-title{font-size:15px;font-weight:700;color:#0D0D0D}
.day-sched{display:grid;grid-template-columns:44px 1fr;gap:5px 10px;font-size:13px}
.sched-t{color:#9A9A9A;font-size:11px;font-weight:700;text-transform:uppercase;padding-top:2px}
.day-tip{margin-top:10px;padding:8px 12px;background:#FEF0F2;border-radius:0;font-size:12px;color:#8F0B20}
/* ── COURSE COVER IMAGE ── */
.course-cover-img{border-radius:0;overflow:hidden;height:300px;margin-bottom:18px}
.course-cover-img img{width:100%;height:100%;object-fit:cover;display:block}
/* ── DESTINATION PHOTO GALLERY (10장) ── */
.dest-gallery{display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(2,160px);gap:4px;margin-top:20px;margin-bottom:4px}
.dest-gallery .g-item{overflow:hidden;border-radius:0}
.dest-gallery .g-item img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
.dest-gallery .g-item:hover img{transform:scale(1.05)}
/* ── GALLERY TITLE ── */
.gallery-label{font-size:10px;font-weight:700;letter-spacing:.12em;color:#9A9A9A;margin-top:26px;margin-bottom:8px;text-transform:uppercase}
/* ── PARTICIPANT GUIDE ── */
.participant-guide{background:#F8F7F5;border-left:4px solid #111111;padding:20px 24px;margin-top:22px}
.pg-eyebrow{font-size:10px;font-weight:700;letter-spacing:.12em;color:#9A9A9A;margin-bottom:6px;text-transform:uppercase}
.pg-title{font-size:14px;font-weight:800;color:#0D0D0D;margin-bottom:12px}
.pg-note{background:#fff;border:1px solid #E5E2DC;padding:10px 14px;font-size:12px;color:#5A5A5A;line-height:1.7;margin-bottom:12px}
.pg-tips{padding-left:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.pg-tips li{font-size:12px;color:#5A5A5A;padding-left:14px;position:relative;line-height:1.65}
.pg-tips li::before{content:'—';position:absolute;left:0;color:#CC001A;font-weight:700}
/* ── LOCAL GALLERY (기존) ── */
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.photo-item{border-radius:0;overflow:hidden;aspect-ratio:16/10}
.photo-item img{width:100%;height:100%;object-fit:cover;transition:transform .4s}
.photo-item:hover img{transform:scale(1.04)}
/* ── FOOTER ── */
.win-footer{background:#0A0A0A;color:rgba(255,255,255,.55);text-align:center;padding:22px;font-size:12px;line-height:2;margin-top:40px;border-top:2px solid #CC001A}
/* ── PRINT ── */
@media print{
  .no-print{display:none!important}
  body{background:#fff}
  .page-wrap{padding:0;max-width:100%}
  .quote-doc{box-shadow:none;border-radius:0;padding:28px 36px;margin-bottom:0}
  .q-print-btn{display:none!important}
  .totals-row{page-break-inside:avoid}
}
@media(max-width:600px){
  .page-wrap{padding:20px 16px 60px}
  .quote-doc{padding:24px}
  .totals-row{grid-template-columns:1fr}
  .top-nav{padding:12px 16px}
  .nav-brand{font-size:13px}
  .rec-tab{font-size:12px;padding:8px 6px}
}
</style>
</head>
<body>

<!-- NAV (no-print) -->
<nav class="top-nav no-print">
  <a href="${base}" class="nav-brand" style="text-decoration:none;color:inherit;cursor:pointer">비즈페이지 · 해외연수 견적서</a>
  <div class="nav-btns">
    <button class="btn-share" onclick="document.getElementById('share-modal').style.display='flex'"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>고객 링크 공유</button>
    <button class="btn-print" onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>견적서 인쇄</button>
    <button class="btn-close" onclick="window.close()">&times; 닫기</button>
  </div>
</nav>

<!-- 공유 모달 (no-print) -->
<div id="share-modal" class="no-print" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.7);align-items:center;justify-content:center">
  <div style="background:#fff;width:min(560px,92vw);padding:36px 32px;position:relative">
    <button onclick="document.getElementById('share-modal').style.display='none'" style="position:absolute;top:16px;right:20px;background:none;border:none;font-size:20px;cursor:pointer;color:#9A9A9A">&times;</button>
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#CC001A;margin-bottom:8px">SHARE</div>
    <h3 style="font-size:18px;font-weight:800;margin-bottom:6px">고객 견적서 링크 공유</h3>
    <p style="font-size:13px;color:#5A5A5A;margin-bottom:20px">아래 링크를 고객에게 카카오톡·이메일로 전달하세요.<br>고객은 링크에서 견적 확인·출력·상담 신청을 바로 할 수 있습니다.</p>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input id="share-url-inp" value="${shareUrl}" readonly style="flex:1;padding:10px 14px;border:1.5px solid #E5E2DC;font-size:12px;outline:none;background:#FAFAFA;color:#0D0D0D">
      <button id="copy-btn" onclick="(function(){navigator.clipboard.writeText(document.getElementById('share-url-inp').value).then(()=>{var b=document.getElementById('copy-btn');b.textContent='복사됨!';b.style.background='#22c55e';setTimeout(()=>{b.textContent='링크 복사';b.style.background='#CC001A';},2000);})})()" style="background:#CC001A;color:#fff;border:none;padding:10px 20px;font-weight:700;cursor:pointer;white-space:nowrap;font-size:13px">링크 복사</button>
    </div>
    <div style="background:#FEF0F2;padding:14px 16px;font-size:12px;color:#8F0B20;line-height:1.7">
      <strong>유효기간 안내</strong> · 이 견적서는 발급일로부터 <strong>30일</strong>간 유효합니다.<br>
      견적 유효기간: <strong>${issueDate}</strong> 발급 → <strong>${(()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'})})()}</strong>까지
    </div>
  </div>
</div>

<!-- ANCHOR NAV (no-print) -->
<div class="anchor-nav no-print">
  <a href="#quote" id="anc-quote">견적 내용</a>
  <a href="#rec" id="anc-rec">추천 일정</a>
  ${destPhotos ? '<a href="#gallery" id="anc-gallery">현지 사진</a>' : ''}
</div>

<div class="page-wrap">

  <!-- ══ 견적서 (인쇄 영역) ══ -->
  <div id="quote" class="quote-doc">
    <div class="quote-hd">
      <div>
        <div class="brand-name"><a href="${base}" style="color:inherit;text-decoration:none;cursor:pointer">비즈페이지</a> 해외연수 견적서</div>
        <div class="brand-sub">(주)하나이엔비티 · 해외 연수 전문</div>
      </div>
      <div class="meta-blk">
        <div class="issue">${issueDate}</div>
        <div>(주)하나이엔비티</div>
        <div>02-2088-4253</div>
      </div>
    </div>

    <div class="sec-title">기관 정보</div>
    <table class="info-tbl">
      <tr><td>기관명</td><td>${_escHtml(organization)}</td></tr>
      <tr><td>담당자</td><td>${_escHtml(contactName)}</td></tr>
      <tr><td>기관 유형</td><td>${orgTypeText}</td></tr>
    </table>

    <div class="sec-title">연수 계획</div>
    <table class="info-tbl">
      <tr><td>연수 목적지</td><td>${destText}</td></tr>
      <tr><td>프로그램</td><td>${programText}</td></tr>
      <tr><td>연수 방식</td><td>${visitModeText}</td></tr>
      <tr><td>참가 인원</td><td>${participants}명 · ${data.paxTier.label}</td></tr>
      <tr><td>연수 기간</td><td>${data.nights}박 ${days}일 · ${startDateLabel} ~ ${endDateLabel}</td></tr>
      <tr><td>시즌</td><td>${data.seasonInfo.label}</td></tr>
      <tr><td>호텔 등급</td><td>${data.hotelGrade.label}</td></tr>
      ${requestDetails ? `<tr><td>요청 사항</td><td style="white-space:pre-wrap">${_escHtml(requestDetails)}</td></tr>` : ''}
    </table>

    <div class="sec-title">포함 항목</div>
    <div class="inc-tags">${incItemsHtml}</div>

    <div class="totals-row">
      <div class="t-card">
        <div class="t-lbl">예상 총액 (VAT 별도)</div>
        <div class="t-amt">${fmt(data.total)}</div>
      </div>
      <div class="t-card per">
        <div class="t-lbl">1인당 금액</div>
        <div class="t-amt">${fmt(data.perPerson)}</div>
      </div>
    </div>

    <div class="q-disc">
      본 견적은 <strong>참고용 예상 금액</strong>입니다. 실제 비용은 현지 사정·환율·시즌·방문 기관 조건에 따라 달라질 수 있으며, 정확한 견적은 전문 컨설턴트와의 1:1 상담을 통해 확정됩니다.<br>
      <span class="q-stamp">비즈페이지 견적</span>&nbsp; 요율 기준: ${rateDate} · Ver.${rateVer}
    </div>

    <button class="q-print-btn no-print" onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>이 견적서 인쇄하기</button>
  </div><!-- /quote-doc -->

  <!-- ══ 추천 일정 (no-print) ══ -->
  <section id="rec" class="pg-section no-print">
    <div class="sec-label">RECOMMENDED ITINERARY</div>
    <h2>맞춤 일정 추천</h2>
    <p class="sub">${destText} · <strong style="color:#CC001A">${programText}</strong> 프로그램 유형을 기반으로, 실제 견적 입력값에 최적화된 코스 두 가지를 선별하였습니다.</p>

    <div class="rec-tabs">
      <button class="rec-tab${selectedPlan!=='b'?' active':''}" onclick="showCourse('a',this)">코스 A &nbsp;·&nbsp; ${itiA.title}${selectedPlan==='a'?' <span style="color:#CC001A">· 탐색하신 일정</span>':''}</button>
      <button class="rec-tab${selectedPlan==='b'?' active':''}" onclick="showCourse('b',this)">코스 B &nbsp;·&nbsp; ${itiB.title}${selectedPlan==='b'?' <span style="color:#CC001A">· 탐색하신 일정</span>':''}</button>
    </div>

    <div id="course-a" class="rec-content${selectedPlan!=='b'?' active':''}">
      ${destPhotos ? `<div class="course-cover-img"><img src="${destPhotos.cover}" alt="${destText}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
      <div class="course-hd">
        <div class="c-title">${itiA.title}</div>
        <div class="c-sub">${itiA.subtitle}</div>
        <div class="c-highlights">${itiA.highlights.map(h=>`<span class="c-hl">· ${h}</span>`).join('')}</div>
      </div>
      <div class="day-timeline">${renderDays(itiADisplayDays)}</div>
      ${renderParticipantGuide()}
      ${renderGallery(destPhotos?.strip)}
    </div>

    <div id="course-b" class="rec-content${selectedPlan==='b'?' active':''}">
      ${destPhotos ? `<div class="course-cover-img"><img src="${destPhotos.cover}" alt="${destText}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
      <div class="course-hd">
        <div class="c-title">${itiB.title}</div>
        <div class="c-sub">${itiB.subtitle}</div>
        <div class="c-highlights">${itiB.highlights.map(h=>`<span class="c-hl">· ${h}</span>`).join('')}</div>
      </div>
      <div class="day-timeline">${renderDays(itiBDisplayDays)}</div>
      ${renderParticipantGuide()}
      ${renderGallery(destPhotos?.strip)}
    </div>
  </section>

</div><!-- /page-wrap -->

<footer class="win-footer no-print">
  (주)하나이엔비티 &nbsp;|&nbsp; 서울 금천구 시흥대로73길 67, 1012호 &nbsp;|&nbsp; 02-2088-4253 &nbsp;|&nbsp; skp1004651@hanatrabiz.com<br>
  Copyright ⓒ 2024 하나이엔비티. All rights reserved.
</footer>

<script>
function showCourse(id, btn) {
  document.querySelectorAll('.rec-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rec-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('course-' + id).classList.add('active');
}
(function initAnchorNav() {
  const sections = ['quote','rec','gallery'];
  const links = { quote: document.getElementById('anc-quote'), rec: document.getElementById('anc-rec'), gallery: document.getElementById('anc-gallery') };
  window.addEventListener('scroll', function() {
    let active = 'quote';
    sections.forEach(function(id) {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 120) active = id;
    });
    sections.forEach(function(id) {
      if (links[id]) links[id].classList.toggle('active', id === active);
    });
  }, { passive: true });
  if (links.quote) links.quote.classList.add('active');
})();
</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('팝업이 차단됐습니다. 브라우저 주소창에서 팝업 허용 후 다시 시도해 주세요.');
    return;
  }
  w.document.write(html);
  w.document.close();
}

/* ── Hero Stats 카운트업 ──────────────────────────────────────────── */
(function () {
  const STATS = [
    { sel: '.hero-stats .stat-item:nth-child(1) .stat-num-hero', end: 14,   suffix: 'YRS', dec: 0 },
    { sel: '.hero-stats .stat-item:nth-child(2) .stat-num-hero', end: 55,   suffix: '+',   dec: 0 },
    { sel: '.hero-stats .stat-item:nth-child(3) .stat-num-hero', end: 1400, suffix: '+',   dec: 0, comma: true },
    { sel: '.hero-stats .stat-item:nth-child(4) .stat-num-hero', end: 98,   suffix: '%',   dec: 0 },
  ];

  const obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      STATS.forEach(function(s) {
        const el = document.querySelector(s.sel);
        if (!el) return;
        const unitEl = el.querySelector('.stat-unit');
        const unitHTML = unitEl ? unitEl.outerHTML : '';
        const startTs = performance.now();
        const dur = 1600;
        function tick(ts) {
          const p = Math.min((ts - startTs) / dur, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          const val = Math.round(s.end * ease);
          el.innerHTML = (s.comma ? val.toLocaleString('ko-KR') : val) + unitHTML;
          if (p < 1) requestAnimationFrame(tick);
          else el.innerHTML = (s.comma ? s.end.toLocaleString('ko-KR') : s.end) + unitHTML;
        }
        requestAnimationFrame(tick);
      });
    });
  }, { threshold: 0.5 });

  const statsEl = document.querySelector('.hero-stats');
  if (statsEl) obs.observe(statsEl);
})();

/* ── FAQ 아코디언 ──────────────────────────────────────────────────── */
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const ans  = item.querySelector('.faq-a');
  const isOpen = btn.classList.contains('open');
  document.querySelectorAll('.faq-q.open').forEach(function(q) {
    q.classList.remove('open');
    q.setAttribute('aria-expanded', 'false');
    q.closest('.faq-item').querySelector('.faq-a').classList.remove('open');
  });
  if (!isOpen) {
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    ans.classList.add('open');
  }
}

/* ── 방향 3: 스크롤 리빌 + 스태거 ────────────────────────────────── */
(function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;

  /* 각 섹션별 리빌 대상 + 딜레이 설정 */
  var GROUPS = [
    /* 갤러리 */
    { sel: '.section-gallery .section-identity',        delay: 0 },
    { sel: '.gallery-card',                             stagger: true },

    /* 서비스 */
    { sel: '.svc-header',                               delay: 0 },
    { sel: '.svc-item',                                 stagger: true },

    /* 포트폴리오 */
    { sel: '.pf-section-hd',                            delay: 0 },
    { sel: '.pf-filter-wrap',                           delay: 1 },
    { sel: '.pf-card',                                  stagger: true },
    { sel: '.pf-cta',                                   delay: 0 },

    /* 후기 */
    { sel: '.section-testimonials .section-title-center', delay: 0 },
    { sel: '.section-testimonials .section-sub-center',   delay: 1 },
    { sel: '.testi-card',                               stagger: true },
    { sel: '.trust-item',                               stagger: true },

    /* FAQ */
    { sel: '.faq-left',                                 delay: 0 },
    { sel: '.faq-item',                                 stagger: true },

    /* 소개 */
    { sel: '.about-copy',                               delay: 0 },
    { sel: '.about-right',                              delay: 2 },

    /* 문의 */
    { sel: '.section-contact h2',                       delay: 0 },
    { sel: '.section-contact .eyebrow',                 delay: 0 },
    { sel: '.contact-grid > div:first-child',           delay: 1 },
    { sel: '.contact-form',                             delay: 2 },

    /* 견적 섹션 헤딩 */
    { sel: '.estimate-section-hd',                      delay: 0 },
  ];

  /* reveal 클래스 + 딜레이 부여 */
  GROUPS.forEach(function(g) {
    var els = document.querySelectorAll(g.sel);
    els.forEach(function(el, i) {
      el.classList.add('reveal');
      if (g.stagger) {
        var d = Math.min(i + 1, 6);
        el.setAttribute('data-delay', d);
      } else if (typeof g.delay === 'number' && g.delay > 0) {
        el.setAttribute('data-delay', g.delay);
      }
    });
  });

  /* 단일 observer로 모든 .reveal 요소 감시 */
  var revealObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealObs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(function(el) {
    revealObs.observe(el);
  });
})();

/* ================================================================
   API 토스트 UI 헬퍼
   ================================================================ */
function _showApiToast(msg) {
  var el = document.getElementById('_apiToast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_apiToast';
    el.style.cssText = [
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%)',
      'background:#1A1A1A;color:#fff;padding:14px 24px',
      'font-size:13px;font-weight:600;z-index:9999',
      'border-left:4px solid #C8102E;box-shadow:0 4px 20px rgba(0,0,0,.35)',
      'display:flex;align-items:center;gap:12px;min-width:280px',
    ].join(';');
    el.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #C8102E;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span><span id="_apiToastMsg"></span>';
    if (!document.getElementById('_spinStyle')) {
      var st = document.createElement('style');
      st.id = '_spinStyle';
      st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(el);
  }
  document.getElementById('_apiToastMsg').textContent = msg;
  el.style.display = 'flex';
}
function _hideApiToast() {
  var el = document.getElementById('_apiToast');
  if (el) el.style.display = 'none';
}

/* DEST_REC 데이터로 ITINERARY_DB 호환 코스 생성 (API 오프라인 fallback) */
function _makeCoursesFromDestRec(destKey, days) {
  var rec = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  function buildDays(planData, planType) {
    var items = planData ? planData.items : [];
    var result = [];
    for (var i = 1; i <= days; i++) {
      var isFirst = (i === 1), isLast = (i === days);
      if (isFirst) {
        result.push({ day:1, title:'도착·오리엔테이션', am:'인천국제공항 출발 → 현지 도착, 호텔 체크인', pm:'도심 탐방, 오리엔테이션 미팅', eve:'환영 만찬', tip:'입국 후 환전·교통카드 준비 권장' });
      } else if (isLast) {
        result.push({ day:i, title:'귀국', am:'호텔 체크아웃, 공항 이동', pm:'귀국 탑승', eve:'인천국제공항 도착', tip:'출발 3시간 전 공항 도착 권장' });
      } else {
        var activity = items[(i - 2) % Math.max(items.length, 1)] || (planType === 'a' ? '현장 탐방·강의' : '문화 체험·팀 활동');
        result.push({ day:i, title:activity, am:'오전 프로그램', pm:'오후 프로그램', eve:'팀 석식', tip:'' });
      }
    }
    return result;
  }
  var a = rec ? rec.a : null;
  var b = rec ? rec.b : null;
  return [
    { title: (a ? a.tag : '역량강화형') + ' 코스', subtitle: a ? a.desc : destKey + ' 현장 탐방', highlights: a ? a.points : ['현지 산업 현장 탐방','전문가 강의·세미나','네트워킹'], days: buildDays(a, 'a') },
    { title: (b ? b.tag : '동기부여·화합형') + ' 코스', subtitle: b ? b.desc : destKey + ' 문화·팀 체험', highlights: b ? b.points : ['문화 체험','팀 활동','관광'], days: buildDays(b, 'b') },
  ];
}

/* ================================================================
   STEP 3 — 연수 일정 탐색
   ================================================================ */

/* 현재 선택된 플랜 (a / b) */
var _currentPlan = null;

/* 견적(itiA/itiB)과 동일한 소스로 선택된 [코스A, 코스B] — null이면 DEST_REC 폴백 사용 */
var _step3Courses = null;

/* Step 3 섹션으로 스크롤 + 섹션 표시 */
function scrollToStep3() {
  var sec = document.getElementById('step3Section');
  if (!sec) return;
  sec.classList.remove('hidden');
  /* 섹션이 숨겨져 있던 동안엔 지도 프레임 크기를 읽을 수 없었으므로(0px) 여기서 재배치 */
  if (typeof destinationSelect !== 'undefined' && destinationSelect.value) {
    _positionDestMapPin(destinationSelect.value);
  }
  setTimeout(function() {
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

/* Step 3 전체 초기화 및 렌더링 */
function renderStep3() {
  var destKey = (typeof destinationSelect !== 'undefined') ? destinationSelect.value : '';
  var destLabel = (typeof destinationSelect !== 'undefined')
    ? (destinationSelect.selectedOptions[0]?.textContent || destKey) : destKey;

  /* 섹션 제목 업데이트 */
  var titleEl = document.getElementById('step3DestLabel');
  if (titleEl) titleEl.textContent = destLabel + ' 연수 일정';

  /* 세계지도 위 목적지 핀 표시 */
  _positionDestMapPin(destKey);

  /* 견적(itiA/itiB)과 반드시 동일한 내용이 나오도록, ITINERARY_DB에 직접 등록된
     목적지는 getItineraries()로 견적과 100% 동일한 코스 쌍을 사용한다.
     (프로그램 유형별 우선순위까지 그대로 반영 — 견적 확인 후 "일정 탐색" 시
     내용이 달라 보이던 문제의 근본 원인) */
  var programType = document.getElementById('programType')?.value || '';
  var itiPair = (typeof getItineraries === 'function') ? getItineraries(destKey, programType) : null;
  if (itiPair && itiPair.length) {
    _step3Courses = itiPair;
    var recFromIti = _coursesToDestRec(itiPair);
    _renderPlanCard('a', recFromIti.a);
    _renderPlanCard('b', recFromIti.b);
    selectPlan('b');
    loadStep3Images(destKey);
    return;
  }
  _step3Courses = null;

  /* DEST_REC에 데이터가 있으면 즉시 렌더 (ITINERARY_DB 직접 등록이 없는 목적지용 폴백) */
  var rec = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  if (rec) {
    _renderPlanCard('a', rec.a);
    _renderPlanCard('b', rec.b);
    selectPlan('b');
    loadStep3Images(destKey);  /* 이미지 비동기 로드 */
    /* ITINERARY_DB 없으면 백그라운드에서 API 일정 가져와 타임라인 자동 업그레이드 */
    if (typeof ITINERARY_DB !== 'undefined' && !ITINERARY_DB[destKey]) {
      var bd0 = (typeof getBreakdownData !== 'undefined') ? getBreakdownData() : null;
      var days0 = bd0 ? parseInt(bd0.days) : 5;
      fetchDynamicItinerary(destKey, days0)
        .then(function(courses0) {
          if (courses0 && courses0.length >= 1) {
            ITINERARY_DB[destKey] = courses0;
            _step3Courses = [courses0[0], courses0[1] || courses0[0]];
            _renderTimeline(_currentPlan || 'b');  /* 풍부한 일정으로 타임라인 업데이트 */
          }
        })
        .catch(function() {});  /* API 미실행 시 조용히 실패 → DEST_REC 폴백 유지 */
    }
    return;
  }

  /* DEST_REC 없음 → API에서 가져와 DEST_REC에 주입 */
  var bd = (typeof getBreakdownData !== 'undefined') ? getBreakdownData() : null;
  var days = bd ? parseInt(bd.days) : 5;

  /* 로딩 표시 */
  _step3ShowLoading(destLabel);

  fetchDynamicItinerary(destKey, days)
    .then(function(courses) {
      /* ITINERARY_DB에 저장 → _renderTimeline 이 am/pm/eve/tip 풍부하게 표시 */
      if (courses && courses.length >= 1) {
        ITINERARY_DB[destKey] = courses;
        _step3Courses = [courses[0], courses[1] || courses[0]];
      }
      if (typeof DEST_REC !== 'undefined' && courses && courses.length >= 2) {
        DEST_REC[destKey] = _coursesToDestRec(courses);
      }
      _step3HideLoading();
      var newRec = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
      _renderPlanCard('a', newRec ? newRec.a : null);
      _renderPlanCard('b', newRec ? newRec.b : null);
      selectPlan('b');
      loadStep3Images(destKey);  /* 이미지 비동기 로드 */
    })
    .catch(function() {
      _step3HideLoading();
      var fallbackRec = _destRecFromMadeCourses(_makeCoursesFromDestRec(destKey, days));
      _renderPlanCard('a', fallbackRec.a);
      _renderPlanCard('b', fallbackRec.b);
      selectPlan('b');
      loadStep3Images(destKey);  /* 실패해도 이미지 시도 */
    });
}

/* API courses 배열 → DEST_REC {a, b} 형식 변환 */
function _coursesToDestRec(courses) {
  function toRec(c) {
    return {
      tag: c.title || '',
      desc: c.subtitle || '',
      points: c.highlights ? c.highlights.slice(0, 3) : [],
      items: c.days ? c.days.slice(1, -1).map(function(d) { return d.title; }) : [],
      value: c.subtitle || '',
    };
  }
  return { a: toRec(courses[0]), b: toRec(courses[1] || courses[0]) };
}

/* makeCoursesFromDestRec 결과 → DEST_REC 포맷 */
function _destRecFromMadeCourses(courses) {
  return _coursesToDestRec(courses);
}

/* Step 3 로딩 상태 표시/숨김 */
function _step3ShowLoading(destLabel) {
  var cardA = document.getElementById('planCardA');
  var cardB = document.getElementById('planCardB');
  var loadingHtml = '<div style="padding:20px 0;text-align:center;color:var(--t-sub);font-size:13px">'
    + '<span style="display:inline-block;width:18px;height:18px;border:2px solid var(--red);border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px"></span>'
    + destLabel + ' 맞춤 일정 생성 중…</div>';
  if (cardA) cardA.innerHTML = loadingHtml;
  if (cardB) cardB.innerHTML = '';
}
function _step3HideLoading() {
  /* 카드 HTML은 _renderPlanCard에서 다시 그리므로 별도 처리 불필요 */
}

/* 플랜 카드 내부 채우기 */
function _renderPlanCard(plan, data) {
  var cardEl   = document.getElementById('planCard' + plan.toUpperCase());
  var tagEl    = document.getElementById('plan' + plan.toUpperCase() + 'Tag');
  var descEl   = document.getElementById('plan' + plan.toUpperCase() + 'Desc');
  var pointsEl = document.getElementById('plan' + plan.toUpperCase() + 'Points');

  /* 카드가 로딩 상태로 덮어쓰여진 경우 재건 */
  if (cardEl && (!tagEl || !descEl || !pointsEl)) {
    cardEl.innerHTML = [
      '<div class="plan-card-hd">',
        '<span class="plan-tag plan-tag-' + plan + '">' + (plan === 'a' ? '방식 A' : '방식 B') + '</span>',
        '<span class="plan-type-lbl" id="plan' + plan.toUpperCase() + 'Tag"></span>',
      '</div>',
      '<p class="plan-desc" id="plan' + plan.toUpperCase() + 'Desc"></p>',
      '<ul class="plan-points" id="plan' + plan.toUpperCase() + 'Points"></ul>',
      '<div class="plan-select-indicator">',
        '<i data-lucide="check-circle" style="width:18px;height:18px"></i> 선택됨',
      '</div>',
    ].join('');
    tagEl    = document.getElementById('plan' + plan.toUpperCase() + 'Tag');
    descEl   = document.getElementById('plan' + plan.toUpperCase() + 'Desc');
    pointsEl = document.getElementById('plan' + plan.toUpperCase() + 'Points');
  }

  var defaultTag   = plan === 'a' ? '역량강화형' : '동기부여·화합형';
  if (tagEl)    tagEl.textContent  = data ? data.tag  : defaultTag;
  if (descEl)   descEl.textContent = data ? data.desc : '담당 컨설턴트가 맞춤 일정을 제안드립니다.';
  if (pointsEl) {
    var pts = data && data.points ? data.points : ['목적지별 특화 프로그램 구성','전문 가이드·통역 동행','맞춤 일정 협의 가능'];
    pointsEl.innerHTML = pts.map(function(p) { return '<li>' + p + '</li>'; }).join('');
  }
}

/* ================================================================
   이미지 파이프라인
   ================================================================ */

/* localStorage 이미지 캐시 (7일) */
var _IMG_CACHE_PREFIX = 'dest_imgs_';
function _imgCacheGet(dest) {
  try {
    var raw = localStorage.getItem(_IMG_CACHE_PREFIX + dest);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (Date.now() - new Date(obj.ts).getTime() > 7 * 24 * 3600 * 1000) {
      localStorage.removeItem(_IMG_CACHE_PREFIX + dest);
      return null;
    }
    return obj.images;
  } catch (e) { return null; }
}
function _imgCacheSet(dest, images) {
  try {
    localStorage.setItem(_IMG_CACHE_PREFIX + dest,
      JSON.stringify({ images: images, ts: new Date().toISOString() }));
  } catch (e) {}
}

/* API에서 이미지 가져오기 */
function fetchDestImages(destKey) {
  var cached = _imgCacheGet(destKey);
  if (cached) return Promise.resolve(cached);

  var url = _ITINERARY_API + '/api/images?dest=' + encodeURIComponent(destKey) + '&count=8';
  return fetch(url, { signal: AbortSignal.timeout(15000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var imgs = data.images || [];
      if (imgs.length >= 2) _imgCacheSet(destKey, imgs);
      return imgs;
    });
}

/* DEST_PHOTOS의 기존 strip 배열을 API 응답 포맷으로 변환 */
function _destPhotosToImgList(destKey) {
  var dp = (typeof DEST_PHOTOS !== 'undefined') ? DEST_PHOTOS[destKey] : null;
  if (!dp) return null;
  var list = [];
  if (dp.cover) list.push({ url: dp.cover, thumb: dp.cover, alt: destKey, src: 'unsplash' });
  (dp.strip || []).forEach(function(u) {
    list.push({ url: u, thumb: u, alt: destKey, src: 'unsplash' });
  });
  return list.length >= 2 ? list : null;
}

/* 사진 스트립 렌더 */
function _renderPhotoStrip(destKey, images) {
  var wrap  = document.getElementById('destStripWrap');
  var strip = document.getElementById('destPhotoStrip');
  var lbl   = document.getElementById('destStripLbl');
  var credit = document.getElementById('destStripCredit');
  if (!wrap || !strip) return;

  if (!images || images.length < 1) {
    wrap.classList.add('hidden');
    return;
  }

  /* 라이트박스 마크업 (1회만 생성) */
  if (!document.getElementById('photoLightbox')) {
    var lb = document.createElement('div');
    lb.id = 'photoLightbox';
    lb.className = 'photo-lightbox';
    lb.innerHTML = '<button class="photo-lightbox-close" onclick="closeLightbox()" aria-label="닫기">×</button>'
      + '<img id="lbImg" src="" alt="" />'
      + '<span class="photo-lightbox-caption" id="lbCaption"></span>';
    lb.addEventListener('click', function(e) { if (e.target === lb) closeLightbox(); });
    document.body.appendChild(lb);
  }

  /* 스트립 아이템 생성 */
  var hasPexels = images.some(function(i) { return i.src === 'pexels'; });
  if (lbl) lbl.textContent = destKey + ' 현지 사진';
  if (credit) {
    if (hasPexels) {
      credit.textContent = 'Photos from Pexels';
      credit.classList.remove('hidden');
    } else {
      credit.classList.add('hidden');
    }
  }

  strip.innerHTML = images.map(function(img, idx) {
    var safeAlt = (img.alt || destKey).replace(/"/g, '');
    var safeUrl = (img.url || '').replace(/"/g, '');
    var safeThumb = (img.thumb || safeUrl).replace(/"/g, '');
    var safeCredit = (img.credit || '').replace(/"/g, '');
    return '<div class="dest-photo-item" onclick="openLightbox(\'' + safeUrl + '\',\'' + safeAlt + '\',\'' + safeCredit + '\')">'
      + '<img src="' + safeThumb + '" alt="' + safeAlt + '" loading="lazy" '
      + 'onerror="this.parentElement.style.display=\'none\'" />'
      + '</div>';
  }).join('');

  wrap.classList.remove('hidden');

  /* 플랜 카드 커버 이미지: A카드 → 인덱스 0, B카드 → 인덱스 1 */
  _setCardCoverImage('a', images[0]);
  _setCardCoverImage('b', images[1] || images[0]);
}

/* 플랜 카드 커버 이미지 세팅 */
function _setCardCoverImage(plan, imgData) {
  var imgWrap = document.getElementById('planCard' + plan.toUpperCase() + 'Img');
  var imgEl   = document.getElementById('planCard' + plan.toUpperCase() + 'CoverImg');
  if (!imgWrap || !imgEl || !imgData) return;
  imgEl.src = imgData.thumb || imgData.url || '';
  imgEl.alt = imgData.alt || '';
  imgEl.onload = function() { imgWrap.classList.remove('hidden'); };
  imgEl.onerror = function() { imgWrap.classList.add('hidden'); };
}

/* 라이트박스 열기/닫기 */
function openLightbox(url, alt, credit) {
  var lb  = document.getElementById('photoLightbox');
  var img = document.getElementById('lbImg');
  var cap = document.getElementById('lbCaption');
  if (!lb || !img) return;
  img.src = url;
  img.alt = alt || '';
  if (cap) cap.textContent = credit || '';
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  var lb = document.getElementById('photoLightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
}

/* 로컬 정적 이미지(이미지/ 폴더, DEST_IMAGES) → 이미지 리스트 변환
   외부 네트워크 의존이 전혀 없어 가장 안정적 — Unsplash 등록이 없는 목적지의 폴백으로 사용 */
function _destImagesToImgList(destKey) {
  var paths = (typeof DEST_IMAGES !== 'undefined') ? DEST_IMAGES[destKey] : null;
  if (!paths || !paths.length) return null;
  var base = new URL('.', location.href).href;
  return paths.map(function(p) {
    var abs = base + encodeURI(p);
    return { url: abs, thumb: abs, alt: destKey, src: 'local' };
  });
}

/* Step 3 이미지 로드 진입점 */
function loadStep3Images(destKey) {
  /* 1. DEST_PHOTOS에 기존 Unsplash 이미지가 있으면 즉시 사용 */
  var existing = _destPhotosToImgList(destKey);
  if (existing) {
    _renderPhotoStrip(destKey, existing);
    return;
  }
  /* 1b. DEST_IMAGES(로컬 파일)가 있으면 사용 — 외부 API/네트워크 없이도 항상 동작 */
  var local = _destImagesToImgList(destKey);
  if (local) {
    _renderPhotoStrip(destKey, local);
    return;
  }
  /* 2. localStorage 캐시 확인 */
  var cached = _imgCacheGet(destKey);
  if (cached) {
    _renderPhotoStrip(destKey, cached);
    return;
  }
  /* 3. API 호출 (서버 실행 중일 때만) */
  fetchDestImages(destKey)
    .then(function(images) {
      _renderPhotoStrip(destKey, images);
    })
    .catch(function() {
      /* API 없음 → 이미지 미표시 (정책: 관련 없는 사진 없으면 표시 안 함) */
      var wrap = document.getElementById('destStripWrap');
      if (wrap) wrap.classList.add('hidden');
    });
}

/* 플랜 선택 처리 */
function selectPlan(plan) {
  _currentPlan = plan;

  /* 카드 active 토글 */
  var cardA = document.getElementById('planCardA');
  var cardB = document.getElementById('planCardB');
  if (cardA) { cardA.classList.toggle('active', plan === 'a'); cardA.setAttribute('aria-pressed', plan === 'a'); }
  if (cardB) { cardB.classList.toggle('active', plan === 'b'); cardB.setAttribute('aria-pressed', plan === 'b'); }

  /* 타임라인 렌더 */
  _renderTimeline(plan);

  /* 기대 효과 업데이트 */
  _renderValueBox(plan);

  /* 아이콘 재렌더 */
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* 일별 타임라인 생성 — 실제 선택 일수 + ITINERARY_DB 상세 데이터 활용 */
function _renderTimeline(plan) {
  var destKey   = (typeof destinationSelect !== 'undefined') ? destinationSelect.value : '';
  var bd        = (typeof getBreakdownData  !== 'undefined') ? getBreakdownData()      : null;
  var totalDays = bd ? Math.max(2, parseInt(bd.days) || 5) : 5;

  /* 타임라인 제목: 실제 기간 표시 */
  var titleEl = document.getElementById('dayTimelineTitle');
  if (titleEl) {
    titleEl.innerHTML = '<i data-lucide="calendar-days" style="width:18px;height:18px"></i>'
      + ' 선택 플랜 일정 <span style="color:var(--red);font-weight:400;font-size:13px">DAY 1 – DAY ' + totalDays + '</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons({ el: titleEl });
  }

  /* 견적과 동일한 코스 쌍(_step3Courses)이 있으면 그것을 우선 사용 — 없으면
     ITINERARY_DB 원본 순서로 폴백 (프로그램 유형 우선순위 미반영 상태) */
  var planIdx  = (plan === 'a') ? 0 : 1;
  var courses  = (typeof ITINERARY_DB !== 'undefined') ? ITINERARY_DB[destKey] : null;
  var course   = _step3Courses ? (_step3Courses[planIdx] || _step3Courses[0])
               : (courses ? (courses[planIdx] || courses[0]) : null);
  var dbDays   = (course && Array.isArray(course.days) && course.days.length > 0) ? course.days : null;

  var html = '';

  if (dbDays) {
    /* ── 풍부한 렌더: ITINERARY_DB의 실제 am/pm/eve/tip 사용, 귀국일 콘텐츠는
       항상 실제 마지막 날에만 배치(_buildDisplayDays) ── */
    var displayDays = _buildDisplayDays(course, destKey, plan, totalDays);
    for (var i = 1; i <= totalDays; i++) {
      html += _renderRichDayCard(i, displayDays[i - 1], totalDays);
    }
  } else {
    /* ── 기본 렌더: DEST_REC items 기반 ── */
    var rec   = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
    var pRec  = rec ? rec[plan] : null;
    var items = pRec ? pRec.items : ['현지 산업 현장 탐방', '문화 체험 · 팀 활동', '전문가 강의 · 세미나', '자유 탐방 · 만찬'];

    for (var j = 1; j <= totalDays; j++) {
      var isFirst = (j === 1), isLast = (j === totalDays);
      var dData;
      if (isFirst) {
        dData = {
          title: '도착 · 오리엔테이션',
          am:    '인천국제공항 출발 → ' + destKey + ' 현지 도착',
          pm:    '호텔 체크인 · 도심 탐방 · 팀 오리엔테이션',
          eve:   '환영 만찬 (현지 특식)',
          tip:   '입국 후 현지 화폐 환전 및 교통카드 준비 권장'
        };
      } else if (isLast) {
        dData = {
          title: '귀국',
          am:    '호텔 체크아웃 · 공항 이동',
          pm:    '귀국 탑승',
          eve:   '인천국제공항 도착',
          tip:   '출발 3시간 전 공항 도착 권장'
        };
      } else {
        var act = items[(j - 2) % Math.max(items.length, 1)];
        dData = {
          title: act,
          am:    act + ' — 오전 탐방',
          pm:    act + ' 연계 오후 프로그램',
          eve:   '팀 석식 · 자유 시간',
          tip:   ''
        };
      }
      html += _renderRichDayCard(j, dData, totalDays);
    }
  }

  var timelineEl = document.getElementById('dayTimeline');
  if (timelineEl) timelineEl.innerHTML = html;
}

/* 일별 카드 HTML 생성 */
function _renderRichDayCard(dayNum, data, totalDays) {
  var isFirst = (dayNum === 1);
  var isLast  = (dayNum === totalDays);
  var badgeHtml = '';
  if (isFirst) badgeHtml = '<span class="itin-day-badge itin-badge-arrive">도착일</span>';
  if (isLast)  badgeHtml = '<span class="itin-day-badge itin-badge-depart">귀국일</span>';

  var slots = '';
  if (data.am)  slots += '<div class="itin-slot"><div class="itin-slot-time am">오전</div><div class="itin-slot-content">'  + data.am  + '</div></div>';
  if (data.pm)  slots += '<div class="itin-slot"><div class="itin-slot-time pm">오후</div><div class="itin-slot-content">'  + data.pm  + '</div></div>';
  if (data.eve) slots += '<div class="itin-slot"><div class="itin-slot-time eve">저녁</div><div class="itin-slot-content">' + data.eve + '</div></div>';
  var tipHtml = (data.tip && data.tip.trim())
    ? '<div class="itin-tip"><span class="itin-tip-label">TIP&nbsp;</span>' + data.tip + '</div>'
    : '';

  return '<div class="itin-day-card">'
    + '<div class="itin-day-header">'
      + '<div class="itin-day-hd-l"><span class="itin-day-num">DAY ' + dayNum + '</span>' + badgeHtml + '</div>'
      + '<span class="itin-day-title">' + (data.title || '') + '</span>'
    + '</div>'
    + '<div class="itin-day-body">' + slots + tipHtml + '</div>'
    + '</div>';
}

/* 결재 기대 효과 박스 */
function _renderValueBox(plan) {
  var destKey  = (typeof destinationSelect !== 'undefined') ? destinationSelect.value : '';
  var planIdx  = (plan === 'a') ? 0 : 1;
  var stepCourse = _step3Courses ? (_step3Courses[planIdx] || _step3Courses[0]) : null;
  var rec      = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  var planData = rec ? rec[plan] : null;
  var value    = stepCourse ? stepCourse.subtitle
               : (planData ? planData.value : '연수 목적에 맞는 맞춤 일정으로 팀 역량 강화 및 결속력 향상');

  var el = document.getElementById('planValueText');
  if (el) el.textContent = value;
}

/* Step 3 플랜 포함 PDF 다운로드 */
/* ================================================================
   공유 견적서(estimate-view.html)에서 "일정 더 탐색하기"로 진입 시
   ?dest=목적지키&days=기간 파라미터를 읽어 폼에 자동 반영 + STEP3 오픈
   ================================================================ */
(function initFromSharedLink() {
  var params = new URLSearchParams(window.location.search);
  var dest = params.get('dest');
  if (!dest) return;

  var destEl = document.getElementById('destination');
  if (!destEl || !Array.from(destEl.options).some(function(o) { return o.value === dest; })) return;

  destEl.value = dest;
  destEl.dispatchEvent(new Event('change'));

  var daysParam = params.get('days');
  if (daysParam) {
    var daysEl = document.getElementById('days');
    if (daysEl) {
      daysEl.value = daysParam;
      daysEl.dispatchEvent(new Event('input'));
    }
  }

  /* 견적서에서 사용된 프로그램 유형까지 복원해야 탐색기에서 동일한 코스가 나옴 */
  var ptParam = params.get('pt');
  if (ptParam) {
    var ptEl = document.getElementById('programType');
    if (ptEl && Array.from(ptEl.options).some(function(o) { return o.value === ptParam; })) {
      ptEl.value = ptParam;
      ptEl.dispatchEvent(new Event('change'));
    }
  }

  setTimeout(function () {
    renderStep3();
    scrollToStep3();
  }, 300);
})();

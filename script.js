const form = document.getElementById('estimateForm');
const destinationSelect = document.getElementById('destination');
const nextButton  = document.getElementById('nextStepButton');
const backButton = document.getElementById('backStepButton');
const downloadButton = document.getElementById('downloadEstimate');
const stepElements = Array.from(document.querySelectorAll('.estimate-step'));

/* 엑셀 견적서 다운로드 기능 플래그 (신규) — false로 바꾸거나 이 줄과 아래
   downloadEstimateExcel() 함수, index.html의 #downloadEstimateExcel 버튼,
   SheetJS <script> 태그를 지우면 기능 도입 이전 상태로 완전히 되돌아감 */
const FEATURE_EXCEL_EXPORT = true;

/* 요율 실시간 오버라이드 (신규) — 관리자 페이지 "요율 관리"에서 수정한 단가를
   정적 data.js 기본값 위에 얕은 병합한다. 이 fetch가 느리거나 실패해도
   destinationRates는 data.js의 정적값 그대로 남아있으므로 견적 계산은 항상
   안전하게 동작한다(폴백). 되돌리려면 이 블록만 지우면 됨. */
/* P3: 환율 반영 상태(공개 계산기) — /api/rates가 주는 현재 환율(fxRates)과 목적지별
   요율 기준시점 환율(fxBaseline)을 담아둔다. getFxAdjust()가 현지통화 원가 항목을
   현재/기준 환율 비율로 보정한다. 데이터가 없으면 1.0(영향 없음). */
const FX_STATE = { rates: {}, baseline: {} };

/* P2b: 계수 스칼라 노브 — 관리자 요율관리에서 배포 없이 조정 가능한 전역 보정값.
   /api/rates가 coefficients로 주면 아래 기본값 위에 덮는다(없거나 fetch 실패 시 기본값=현재 동작).
   전부 '1 + (baseFactor−1) × strength' 형태라 strength=1이면 무변화(회귀 없음), 0이면 계수 무력화,
   1 초과면 진폭 확대. hotelPeakWeight만 진폭이 아닌 '호텔이 받는 피크 비중' 자체(0.8=P7 기본).
   min/max로 서버·클라 양쪽에서 클램프해 이상값 견적 폭주를 막는다(GPT 2라운드 협의 확정). */
const COEF_SPEC = {
  seasonStrength:   { def: 1.0, min: 0.5, max: 2.0 }, // 시즌 진폭(항공·유류·호텔 공통)
  leadTimeStrength: { def: 1.0, min: 0.5, max: 2.0 }, // 항공 리드타임 진폭(항공·유류)
  peakStrength:     { def: 1.0, min: 0.5, max: 2.0 }, // 날짜 피크 진폭(항공·유류)
  hotelPeakWeight:  { def: 0.8, min: 0.0, max: 1.0 }, // 호텔이 받는 피크 비중
};
const COEF_STATE = Object.fromEntries(Object.entries(COEF_SPEC).map(([k, s]) => [k, s.def]));

/* P11: 변동성 총배수 안전 상한 — 항공/유류의 '수요 변동' 계수(시즌×리드×피크)가 곱해질 때의
   상한. 개별 노브(0.5~2.0)는 이미 제한돼 있으나, 여럿을 동시에 극단으로 올리면 곱이 폭주할 수
   있어(전부 2.0이면 성수기 구간 ~3.15배) 곱 자체에 상한을 둔다. 기본·중간 튜닝에선 절대 안
   걸리는 수준(기본 노브 최악 ~1.9배)이라 회귀 없음. 출발지(공항 구조 프리미엄)·좌석등급(비즈니스)·
   환율은 '수요 변동'이 아니라 상한 대상에서 제외. 초과 시 셋을 비례 축소(상대 비중 보존).
   (GPT 2라운드 협의로 2.5 확정. 필요 시 이 값만 조정.) */
const VOL_MULTIPLIER_CAP = 2.5;
function clampCoef(key, val) {
  const s = COEF_SPEC[key];
  if (!s || typeof val !== 'number' || !isFinite(val)) return s ? s.def : val;
  return Math.max(s.min, Math.min(s.max, val));
}
/* baseFactor의 '진폭'만 strength로 완만/과격하게. strength=1 → 그대로. */
function applyStrength(baseFactor, strength) {
  const s = (typeof strength === 'number' && isFinite(strength)) ? strength : 1;
  return 1 + (baseFactor - 1) * s;
}

/* ⚠ 이 로드가 실패하면 **금액이 조용히 달라진다** — 일정 오버라이드(QB)보다 무겁다.
   ① 요율이 data.js 기본값에 머문다(운영 진실은 rate_overrides다),
   ② FX_STATE가 비어 getFxAdjust가 전부 1.0이 되어 환율 보정이 통째로 사라진다,
   ③ 계수 노브가 기본값으로 돌아간다.
   셋 다 화면에는 그냥 '견적 금액'으로 보인다. 그래서 QB와 같은 방식으로 결과를
   window.__RATE_SOURCE__에 남기고, 담당자가 쓰는 내부 산출 도구가 이 값을 읽어
   사람에게 알린다(고객 화면에는 띄우지 않는다 — 고객이 할 수 있는 일이 없다). */
window.__RATE_SOURCE__ = { state: 'pending', applied: [], error: '' };

const rateOverridesReady = (function applyRateOverrides() {
  const st = window.__RATE_SOURCE__;
  if (typeof destinationRates === 'undefined') { st.state = 'skipped'; return Promise.resolve(st); }
  return fetch('/api/rates')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http_' + r.status))))
    .then((data) => {
      if (!data) return st;
      if (data.fxRates) FX_STATE.rates = data.fxRates;
      if (data.fxBaseline) FX_STATE.baseline = data.fxBaseline;

      /* P2b: 계수 노브 오버라이드 — 서버가 준 값만, 스펙에 있는 키만, 클램프해서 덮는다.
         알 수 없는 키·비정상값은 무시(기본값 유지)해 견적 안정성 보장. */
      if (data.coefficients && typeof data.coefficients === 'object') {
        for (const key of Object.keys(COEF_SPEC)) {
          if (typeof data.coefficients[key] === 'number') COEF_STATE[key] = clampCoef(key, data.coefficients[key]);
        }
      }

      /* 관리자 신규 목적지 (신규) — data.js에 원래 없던 목적지를 destinationRates에
         추가한다. 이미 선택 가능한 기존 목적지의 값을 patch하는 아래 오버라이드와 달리,
         옵션 자체가 아직 없으므로 고객이 아직 병합 전인 목적지를 선택할 방법이 없다
         (경합 없음). 서버가 내장 키와의 충돌을 막지만, 혹시 뚫리더라도 내장값을
         우선하도록 여기서도 한 번 더 방어(dedupe-skip)한다.
         ⚠ 반드시 오버라이드 적용보다 먼저 push해야 한다 — 안 그러면 커스텀 목적지의
         요율 편집(override)이 destinationRates에서 대상 행을 못 찾아 조용히 버려진다. */
      if (Array.isArray(data.customDestinations)) {
        data.customDestinations.forEach((row) => {
          if (destinationRates.some((d) => d.destination_key === row.destination_key)) return;
          const { zone, southern_hemisphere, insurance_zone, season_profile, ...destFields } = row;
          destinationRates.push(destFields);
          if (BIZ_ZONES[zone] && !BIZ_ZONES[zone].includes(row.destination_key)) BIZ_ZONES[zone].push(row.destination_key);
          if (southern_hemisphere) SOUTHERN_HEMISPHERE_DESTS.push(row.destination_key);
          /* 보험 권역 편입 (신규) — 빠뜨리면 getInsuranceZone이 어디에도 못 찾아
             권역 계수 1.00(중립)으로 조용히 폴백한다. 권역별 0.85~1.80이라 최대 80%
             어긋나는데 콘솔 경고만 남고 화면엔 아무 표시가 없었다.
             값이 없거나 모르는 키면 기준 권역(asiaMid=1.00)으로 — 옛 폴백과 같은 동작이라
             데이터가 덜 채워진 목적지가 있어도 금액이 갑자기 튀지 않는다. */
          const insZone = INSURANCE_ZONES[insurance_zone] ? insurance_zone : 'asiaMid';
          if (!INSURANCE_ZONES[insZone].includes(row.destination_key)) {
            INSURANCE_ZONES[insZone].push(row.destination_key);
          }
          /* 시즌 프로파일 편입 (PQ) — 빠뜨리면 getSeasonInfo가 권역 프로파일을 못 찾아
             공용표(SEASON_CONFIG)로 폴백한다. 보험 권역의 중립값 폴백과 달리 이쪽은
             '중립'이 아니라 **다른 계절**로 계산된다: 동남아 목적지를 추가하고 7월에
             출발하면 공용표는 성수기 1.20인데 실제 동남아는 우기 비수기 0.88이라
             항공·유류·호텔이 36% 어긋난다(부호까지 반대라 과청구 방향).
             값이 없거나 모르는 id면 폴백(공용표, 남반구 체크 시 남반구표) = 이 코드
             이전과 100% 동일 동작이라, 프로파일을 못 고른 목적지가 있어도 금액이 튀지 않는다. */
          if (typeof DEST_SEASON_PROFILES !== 'undefined' && season_profile) {
            const prof = DEST_SEASON_PROFILES.find((p) => p.id === season_profile);
            if (prof && !prof.keys.includes(row.destination_key)) prof.keys.push(row.destination_key);
          }
          injectDestinationOption(row.destination_key, destFields.label);
        });
        if (data.customDestinations.length && typeof buildDestAccordion === 'function') buildDestAccordion();
      }

      /* 요율 오버라이드 적용 — 커스텀 목적지가 위에서 이미 destinationRates에 편입된
         뒤라, 내장·커스텀 목적지 모두 대상 행을 찾아 편집분이 반영된다. */
      const applied = [];
      if (data.overrides) Object.entries(data.overrides).forEach(([key, fields]) => {
        const dest = destinationRates.find((d) => d.destination_key === key);
        if (dest && fields && typeof fields === 'object') { Object.assign(dest, fields); applied.push(key); }
      });

      st.state = 'applied';
      st.applied = applied;
      st.fx = Object.keys(FX_STATE.rates || {}).length;

      /* 오버라이드·FX가 로드되면 현재 견적을 다시 그려 반영(초기 렌더 이후 도착 대비) */
      if (typeof renderLiveBreakdown === 'function') renderLiveBreakdown();
      return st;
    })
    .catch((err) => {
      st.state = 'failed';
      st.error = String((err && err.message) || err);
      /* 콘솔 경고로 끝내지 않는다 — 이 저장소가 반복해서 당한 형태다(결함 생성기 ②).
         담당자가 보는 내부 산출 도구가 이 값을 읽어 사람에게 알린다. */
      console.warn('[요율] 오버라이드·환율을 불러오지 못했습니다. 기본 요율로 계산됩니다:', st.error);
      return st;
    });
})();

/* 관리자 신규 목적지 선택 옵션 주입 (신규) — index.html/admin-quote.html 양쪽의
   <select id="destination"> 끝에 미리 준비된 빈 optgroup(#customDestOptgroup)에
   실제 <option>을 추가한다. 이 마크업이 없는 페이지에서는 조용히 무시된다. */
function injectDestinationOption(key, label) {
  const group = document.getElementById('customDestOptgroup');
  if (!group) return;
  group.hidden = false;
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = label; // textContent만 사용 — 콘텐츠 오버라이드와 동일한 XSS 방지 원칙
  group.appendChild(opt);
}

/* 정적 콘텐츠 오버라이드 (신규) — 관리자 페이지 "콘텐츠 관리"에서 수정한 히어로/갤러리/
   포트폴리오/회사소개/후기/FAQ 문구·이미지를 [data-cms-key] 요소 위에 덮어쓴다. 이 fetch가
   느리거나 실패해도 index.html에 하드코딩된 기본값 그대로 남아있으므로 항상 안전하게
   렌더링된다(폴백). textContent만 사용(innerHTML 금지) — 관리자 입력값이 HTML로 해석되지
   않도록 하는 기존 XSS 방지 원칙과 동일. */
(function applyContentOverrides() {
  fetch('/api/content')
    .then((r) => (r.ok ? r.json() : null))
    .then((map) => {
      if (!map) return;
      document.querySelectorAll('[data-cms-key]').forEach((el) => {
        const val = map[el.getAttribute('data-cms-key')];
        if (!val) return;
        if (el.tagName === 'IMG') { el.src = val; } else { el.textContent = val; }
      });
    })
    .catch(() => {});
})();

/* ══════════════════════════════════════════════════════════════════
   QB — 추천 일정 오버라이드 적용
   data.js의 ITINERARY_DB는 **기본값**이고, 운영 중 실제로 쓰이는 값은 DB의
   itinerary_overrides다(요율에서 data.js보다 rate_overrides가 진실인 것과 같다).
   관리자 → 일정 관리에서 담당자가 고친 목적지만 여기서 덮어쓴다.

   ⚠ 폴백이 조용하지 않게 한다(결함 생성기 ②). 이 fetch가 실패하면 화면에는
   **기본 일정이 아무 말 없이** 나가는데, 그건 담당자가 방금 고쳐 저장한 내용이
   고객 견적서에 안 실렸다는 뜻이다. 그래서 결과를 window.__ITINERARY_SOURCE__에
   남기고, 내부 도구·관리자 화면이 이 값을 읽어 사람에게 보여준다.
   (고객 화면에는 띄우지 않는다 — 고객이 할 수 있는 일이 없다.)
   ══════════════════════════════════════════════════════════════════ */
window.__ITINERARY_SOURCE__ = { state: 'pending', applied: [], error: '' };

const itineraryOverridesReady = (function applyItineraryOverrides() {
  const st = window.__ITINERARY_SOURCE__;
  return fetch('/api/content?action=itineraries')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http_' + r.status))))
    .then((data) => {
      const map = (data && data.overrides) || {};
      const keys = Object.keys(map);
      keys.forEach((key) => {
        /* 모양이 깨진 값은 넣지 않는다 — 넣으면 견적서 렌더가 통째로 죽는다.
           서버가 이미 검증하지만, 여기서도 최소한만 확인하고 건너뛴 건 기록한다. */
        const courses = map[key];
        if (!Array.isArray(courses) || !courses.length) { st.skipped = (st.skipped || []).concat(key); return; }
        /* UR: 예전엔 여기서 **통째로 대체**했다. UQ 이후로는 그러면 안 된다 —
           견적서에서 일괄로 심은 「검토 전」 코스만 든 오버라이드가 기본 코스를
           밀어내는데, 검토 전은 고객에게 안 나가므로 그 목적지의 일정이 통째로
           사라진다(19곳 전부 data.js에 기본 코스가 있다). 병합 규칙은
           rec_fallbacks.js가 안다 — 관리자 화면도 **같은 함수**를 부른다. */
        /* 폴백은 조용하지 않게 한다(결함 생성기 ②). 기본값 위에 얹힌 것인지 대체한
           것인지를 남겨, 내부 도구가 "왜 아직 기본 일정이 나가지"에 답할 수 있게 한다. */
        if (!recOverrideIsEdited(courses)) st.pendingOnly = (st.pendingOnly || []).concat(key);
        ITINERARY_DB[key] = recApplyOverride(ITINERARY_DB[key], courses);
      });

      /* QC: 추천 콘텐츠(방식 A/B). 일정과 같은 행에 담겨 오지만 별도 맵으로 내려온다 —
         일정만 고친 목적지는 여기 키가 없고, 그 경우 data.js 기본값을 그대로 쓴다.
         a·b 한쪽만 있는 값은 넣지 않는다. 엔진은 rec['b']를 그대로 찾아 쓰는데
         한쪽이 비면 그 자리가 조용히 일반 문구로 떨어진다. */
      const recMap = (data && data.recOverrides) || {};
      const recKeys = Object.keys(recMap);
      recKeys.forEach((key) => {
        const rec = recMap[key];
        if (!rec || !rec.a || !rec.b) { st.skippedRec = (st.skippedRec || []).concat(key); return; }
        DEST_REC[key] = rec;
      });

      st.state = (keys.length || recKeys.length) ? 'applied' : 'none';
      st.applied = keys;
      st.appliedRec = recKeys;
      st.meta = (data && data.meta) || {};
      return st;
    })
    .catch((err) => {
      st.state = 'failed';
      st.error = String((err && err.message) || err);
      /* 콘솔 경고만 남기고 끝내지 않는다 — 이 저장소가 반복해서 당한 형태다.
         담당자가 보는 화면(admin.html 일정 관리 · admin-quote.html)이 이 값을 읽는다. */
      console.warn('[일정] 오버라이드를 불러오지 못했습니다. 기본 일정으로 표시됩니다:', st.error);
      return st;
    });
})();

/* 🔴 **계수 표는 `data.js`가 진실이다** (XS). 예전엔 여기 값이 적혀 있었고,
   그래서 **서버는 엔진이 총액에 무엇을 곱했는지 알 방법이 없었다.**
   그 결과 검증기가 「항목합 == 총액」을 요구해 **계수가 1.0이 아닌 견적이 전부 떨어졌고**,
   고객 자동 발급은 통과해야만 링크가 나가므로 그 손님들은 **견적서를 못 받았다**
   (20개 조합 중 계수가 1.0인 것은 4개뿐이다 — 어학·휴양 × 기업·개인).
   ⚠ 값을 여기 다시 적지 말 것. 두 벌이 되는 순간 화면과 서버가 다른 금액을 말한다. */
const estimateCriteria = {
  programFactor: ESTIMATE_FACTORS.programFactor,
  organizationFactor: ESTIMATE_FACTORS.organizationFactor,
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
   PY: 목록을 여기 직접 적지 않고 data.js의 DEST_CLASSIFY(zone)에서 파생한다.
   예전엔 목적지 목록이 파일 넷에 흩어져 있어 하나를 빠뜨리는 사고가 반복됐다.
   이제 목적지의 좌석 구간은 DEST_CLASSIFY 한 줄에서 정한다 — 여기는 손대지 않는다.
   여기 없는 destKey가 들어오면 getBizFactor()가 조용히 'short'(가장 저렴한 구간)로
   폴백되는 성질은 그대로이며, 그 상황은 DEST_CLASSIFY_ISSUES와 아래 콘솔 경고로 드러난다.
   ⚠ 런타임에 커스텀 목적지가 push되므로 각 구간은 반드시 배열이어야 한다
   (destGroupsBy가 선언된 세 구간을 항상 빈 배열로 만들어 두므로 보장된다). */
const BIZ_ZONES = destGroupsBy('zone', ['short', 'mid', 'long']);
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

/* ── 여행자보험 권역·기간 차등 (정확도 개선 PB) ─────────────────────────────
   기존엔 목적지·기간과 무관하게 1인 15,000원 정액이라, 실제 단체 여행자보험료를
   좌우하는 두 축(현지 의료비 수준 / 여행 일수)이 전혀 반영되지 않았다.
     보험료(1인) = INSURANCE_BASE × zoneFactor × durationFactor
   기준점(1.00 × 1.00)은 '동남아 4~5일'이며, 이 기준 단가는 기존 15,000원이 실거래가
   대비 과소라는 판단에 따라 18,000원으로 상향했다(사용자 확정). 즉 이번 변경은
   ① 권역·기간 차등화 + ② 기준 단가 현행화 두 가지를 함께 담고 있다.

   권역은 좌석등급용 BIZ_ZONES를 재사용하지 않고 별도로 둔다. BIZ_ZONES는 '노선 거리'
   기준이라 보험(현지 의료비·후송 리스크) 기준과 어긋나는 곳이 여럿이기 때문:
     · 괌·사이판 — 거리는 중거리지만 미국령이라 현지 의료비가 미국 본토 수준
     · 호주/뉴질랜드 — BIZ_ZONES에선 '호주'만 long이고 시드니·멜버른·오클랜드는 mid로
       갈려 있음. 보험 기준으론 한 권역이며 미주보다는 낮다(공공의료·상호협정)
     · 몽골·중앙아 — 거리는 가깝고 현지 의료비도 싸지만, 중증 시 의료후송(medical
       evacuation) 비용이 큼. 미국식 '고빈도 고단가'와 원인이 달라(저빈도 고심도)
       미주·유럽보다 낮은 별도 구간으로 둔다
   (GPT 2라운드 협의로 확정 — 근거: ai-loop/pB_prompt*.txt, ai-loop/pB_gpt_round*.txt)
   PY: 권역 소속은 data.js의 DEST_CLASSIFY(ins)에서 파생한다 — BIZ_ZONES와 기준이
      다르다는 사실(위 세 문단)은 그대로이고, '어느 목적지가 어느 권역인가'만 한곳에
      모았다. 목적지를 추가할 때 여기를 손댈 일은 없다.
      아래 구간명 목록은 INSURANCE_ZONE_FACTORS·INSURANCE_ZONE_LABELS와 짝이므로
      권역을 새로 만들 때만 세 곳을 함께 늘린다(계수·라벨 없는 권역은 존재할 수 없다). */
const INSURANCE_BASE = 18000; /* 기준: 동남아 권역 · 4~5일 · 기업단체 1인 (2026 실거래 기준) */
/* TE: **국내(domestic)** 구간을 더했다 — 국내여행자보험은 해외여행자보험과 성격이 다르다.
   시장가 기준 3박4일 1인 2,000~3,500원대라, 기준가 18,000(동남아 4~5일)의 0.15로 둔다(≈2,700원).
   ⚠ **온라인 취합값이다** — 대표가 손으로 고칠 자리다(결정대기열 7-d-1).
   ⚠ 구간 이름을 여기 목록에 안 넣으면 그 목적지가 어느 권역에도 안 들어가고
     보험 계수가 **조용히 1.00으로 폴백**한다(결함 생성기 ②). */
/* 🔴 권역 **이름 목록은 `data.js`가 갖는다**(XQ) — 서버 검증(api/rates.js)도 같은 것을
   읽는다. 예전엔 여기와 서버에 각각 손으로 적혀 있었고, 한쪽만 늘리면 저장은 되는데
   엔진이 못 찾아 보험 계수가 **조용히 1.00으로** 떨어졌다(권역별 0.15~1.80). */
const INSURANCE_ZONES = destGroupsBy('ins', INSURANCE_ZONE_IDS);
const INSURANCE_ZONE_FACTORS = { domestic: 0.15, asiaShort: 0.85, asiaMid: 1.00, evac: 1.20, oceania: 1.50, highCost: 1.80 };
const INSURANCE_ZONE_LABELS  = { domestic: '국내', asiaShort: '아시아 단거리', asiaMid: '동남아', evac: '의료후송 위험권', oceania: '오세아니아', highCost: '미주·유럽' };
/* ⚠ **계수·라벨이 목록을 다 덮는지 여기서 확인한다.** 권역을 새로 만들고 계수를 안 넣으면
   보험료가 `NaN`이 된다 — 폴백보다 나쁘다(금액 자리에 NaN이 그대로 나간다).
   조용히 넘어가지 않고 분류 문제 목록에 남긴다(audit_consistency가 오류로 잡는다). */
INSURANCE_ZONE_IDS.forEach((z) => {
  if (typeof INSURANCE_ZONE_FACTORS[z] !== 'number' || !INSURANCE_ZONE_LABELS[z]) {
    if (typeof noteClassifyIssue === 'function') {
      noteClassifyIssue(`보험 권역 '${z}': 계수 또는 라벨이 없다 — 보험료가 NaN이 된다`);
    }
  }
});

/* 일수 구간 — 일수 정비례가 아니라 완만한 체감형(초기 며칠이 고정비 성격이고 이후
   일당 증분이 작다). 기준 구간은 4~5일 = 1.00. MICE 연수는 3~5일이 압도적이라
   실사용 대부분이 0.80~1.00 구간에 들어온다. */
const INSURANCE_DURATION_TIERS = [
  { max: 3,        factor: 0.80, label: '1~3일'   },
  { max: 5,        factor: 1.00, label: '4~5일'   },
  { max: 7,        factor: 1.20, label: '6~7일'   },
  { max: 10,       factor: 1.40, label: '8~10일'  },
  { max: 15,       factor: 1.70, label: '11~15일' },
  { max: Infinity, factor: 2.00, label: '16일+'   },
];

function getInsuranceZone(destKey) {
  for (const zone of Object.keys(INSURANCE_ZONES)) {
    if (INSURANCE_ZONES[zone].includes(destKey)) return zone;
  }
  console.warn(`[견적] "${destKey}"가 INSURANCE_ZONES 어디에도 등록되어 있지 않아 보험 권역 계수 1.00(중립)으로 폴백됩니다. 목록 갱신이 필요할 수 있습니다.`);
  return null;
}

/* 목적지·일수로 1인당 보험료와 그 근거(권역/구간)를 함께 돌려준다. */
function getInsuranceInfo(destKey, days) {
  const zone  = getInsuranceZone(destKey);
  const zoneF = zone ? INSURANCE_ZONE_FACTORS[zone] : 1.0;
  const d     = Math.max(1, Number(days) || 1);
  const tier  = INSURANCE_DURATION_TIERS.find(t => d <= t.max)
             || INSURANCE_DURATION_TIERS[INSURANCE_DURATION_TIERS.length - 1];
  return {
    zone, zoneFactor: zoneF, zoneLabel: zone ? INSURANCE_ZONE_LABELS[zone] : '미분류',
    durationFactor: tier.factor, durationLabel: tier.label,
    rate: Math.round(INSURANCE_BASE * zoneF * tier.factor),
  };
}

/* PC: 여행 일수 → 관광비 계수. 구간표는 data.js의 SIGHT_DURATION_TIERS(근거 주석 포함).
   보험의 일수 계수와는 기울기가 다르다 — 보험은 '리스크 노출 일수'라 거의 선형이지만,
   관광은 이동일·기업방문일이 섞여 더 완만하다. 그래서 표를 공유하지 않고 따로 둔다. */
function getSightDurationInfo(days) {
  const d = Math.max(1, Number(days) || 1);
  const tier = SIGHT_DURATION_TIERS.find(t => d <= t.max)
            || SIGHT_DURATION_TIERS[SIGHT_DURATION_TIERS.length - 1];
  return { factor: tier.factor, label: tier.label };
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

/* ④ 차량 정원 — Math.ceil(인원/정원)만큼 대수를 산정한다.
   버그④수정: 기존 로직은 인원수와 무관하게 차량을 항상 1대로 고정 계산했음.
   ⚠ 예전 주석은 "국내 관광버스 통상 좌석수(대형 45·소형 25)"라는 **가정치**라고
     적혀 있었다. 지금 large는 가정이 아니라 **견적서 실측**이다(아래 SD 참고). */
/* ⚠ large는 **버스 등록 정원이 아니라 실제 배차 인원 상한**이다 (SD, 2026-08-09).
   45인승 버스에 45명을 태우지 않는다 — 가이드·인솔자 좌석, 짐, 장거리 이동 여유가 있다.
   견적서 7건에서 (인원, 실제 대수)를 역산해 1대당 21.0 / 23.0 / 24.0 / 33.0 / 33.8 /
   33.8 / **37.5**명을 얻었다. 실측 대수를 전부 맞추는 정원은 **38~42**이고,
   옛 값 45는 두 건이 **독립적으로 배제**한다(135명→4대인데 45면 3대, 300명→8대인데 7대).
   구간 안에서 38을 고른 이유: 작게 잡을수록 대수가 늘어 견적이 올라가고,
   지금 우리가 내는 실수는 **원가 미달**(삿포로 −17%) 쪽이라 놓치는 쪽으로 틀리지 않는다.
   ⚠ 이 값은 `guideCount = vehicleCount`라 **가이드 인원까지 함께** 움직인다.
   다시 만질 때는 `node ai-loop/audit_bus_capacity.js`를 먼저 돌려 실측부터 볼 것. */
const VEHICLE_CAPACITY = { large: 38, small: 25 };

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

/* ══ 무엇이 비었는지 **말해 준다** (XK) ═══════════════════════════════════
   예전에는 필수 칸이 비면 이렇게만 했다:
       if (invalidField) { invalidField.focus(); return; }
   화면에는 **아무 말도 안 나온다.** 고객이 「다음 단계로 이동」·「견적 확인하기」를
   눌러도 커서만 옮겨 갈 뿐이라, 누른 사람은 **버튼이 고장 났다고 읽는다**
   (특히 휴대폰에서는 포커스가 눈에 안 띈다). 계산기 앞에서 이탈하는 자리다.
   ⚠ 브라우저 기본 안내(말풍선)는 여기서 안 뜬다 — 제출을 `preventDefault`로
     가로채고, 「다음 단계」는 애초에 제출이 아니다.
   → 무엇이 비었는지, 몇 개 남았는지를 **그 자리에 글자로** 띄운다.

   ⚠ 칸 이름은 라벨에서 가져온다. 여기에 이름 목록을 새로 적으면 라벨을 고칠 때
     안내 문구만 옛 이름으로 남는다(결함 생성기 ①). */
function fieldLabelText(el) {
  const lab = el.closest('label');
  if (lab) {
    const clone = lab.cloneNode(true);
    /* 힌트·입력칸은 이름이 아니다 — 「연락처 견적서에는 표시되지 않습니다…」가 되면
       안내가 문장이 아니라 덩어리가 된다 */
    clone.querySelectorAll('input, textarea, select, small, .fld-hint').forEach((n) => n.remove());
    const t = clone.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim();
    if (t) return t;
  }
  /* 🔴 `aria-label`을 **id보다 먼저** 본다 (XS). `.inc-vip-row` 안의 칸들은
     `<label>`로 감싸여 있지 않아서 여기까지 내려오는데, 그때 고객이 읽은 문장이
     「**golfRounds**」은(는) … 였다. 낭독기에게 줄 이름은 이미 적어 뒀으면서
     눈으로 읽는 사람에게는 안 쓰고 있었다. */
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.id || '입력';
}

/* 문구는 **한 곳에서만** 만든다 — 두 자리(처음 막을 때 / 채우는 중)에서 각자 지으면
   같은 상황에 다른 말을 하게 된다(결함 생성기 ①).
   ⚠ **비어 있는 것과 값이 이상한 것을 가른다.** 「입력해 주세요」는 숫자를 999로 적은
     사람에게는 틀린 말이다 — 그 사람은 이미 적었고, 무엇이 문제인지 모른 채 다시 누른다. */
function fieldProblem(el) {
  const v = el.validity || {};
  const name = fieldLabelText(el);
  if (v.valueMissing || !String(el.value || '').trim()) return { kind: 'empty', text: `「${name}」을(를) 입력해 주세요` };
  if (v.rangeUnderflow || v.rangeOverflow) {
    const lo = el.getAttribute('min'), hi = el.getAttribute('max');
    /* ⚠ 한쪽만 있는 칸이 대부분이다 — 예전엔 「1~**?** 사이로」라고 물음표를
       그대로 찍었다(XS). 모르는 것을 아는 척하지 않되, 물음표로 말하지도 않는다. */
    const range = lo && hi ? `${lo}~${hi} 사이로` : lo ? `${lo} 이상으로` : hi ? `${hi} 이하로` : '다시';
    return { kind: 'range', text: `「${name}」은(는) ${range} 넣어 주세요` };
  }
  if (v.tooShort || v.tooLong) return { kind: 'len', text: `「${name}」의 길이를 확인해 주세요` };
  if (v.patternMismatch || v.typeMismatch || v.badInput) return { kind: 'form', text: `「${name}」 형식을 확인해 주세요` };
  return { kind: 'other', text: `「${name}」을(를) 확인해 주세요` };
}

function missingMessage(list) {
  if (!list.length) return '';
  const p = fieldProblem(list[0]);
  if (list.length === 1) return p.kind === 'empty' ? `「${fieldLabelText(list[0])}」만 입력하시면 됩니다.` : p.text + '.';
  return `${p.text} — 아직 ${list.length}칸이 남았습니다.`;
}

/* 한 칸을 채우면 그 칸 표시를 지우고, **남은 칸이 있으면 문구를 다시 센다.**
   ⚠ 그냥 지워 버리면 「이제 다 됐구나」로 읽히고, 다시 눌렀을 때 또 막힌다 —
     안내가 사라지는 것과 조건이 풀리는 것은 다르다. */
function clearMissingMark(el) {
  if (!el) return;
  el.classList.remove('fld-missing');
  const step = el.closest('.estimate-step');
  const box = step && step.querySelector('.step-missing');
  if (!box) return;
  box.textContent = missingMessage(Array.from(step.querySelectorAll('[required], input, select, textarea'))
    .filter((x) => {
      if (x.type === 'hidden' || x.disabled) return false;
      if (x.hasAttribute('required') && !String(x.value || '').trim()) return true;
      return !!(x.validity && !x.validity.valid);
    }));
}

/* 입력칸 상한을 **서버가 아는 값으로** 건다 (XK).
   ⚠ HTML에 숫자를 적어 두지 않는다 — `limits.js`를 고치면 화면이 따라와야 한다.
   ⚠ `limits.js`를 못 실은 화면에서는 **아무 것도 하지 않는다**(상한 없이 예전처럼
     동작). 여기서 임의의 기본값을 넣으면 그게 곧 두 번째 진실이 된다. */
/* 🔴 **감춰진 칸은 제출을 막을 수 없다** (XS) — 가상 고객 훑기에서 나온 것.
   ───────────────────────────────────────────────────────────────────────────
   재현된 길: 골프 되는 목적지(제주도·오키나와·후아힌·카자흐스탄)에서 골프를 켜고
   **라운딩 칸에 0을 넣은 뒤** 목적지를 골프 없는 곳으로 바꾼다. 그러면 화면이
   골프 체크를 알아서 풀고 입력줄을 감추는데(`syncGolfAvailability`) **값 0은 그대로
   남는다.** `golfRounds`에는 `min="1"`이 걸려 있으므로 그때부터 브라우저가 제출을
   영영 막는다 — 고객에게는 「견적 확인하기」가 죽은 버튼이 되고, 원인이 되는 칸은
   화면에 없다. 우리 안내조차 보이지 않는 칸을 가리켰다.

   ⚠ 이건 골프만의 문제가 아니다. **감춰진 값 칸에 제약이 걸려 있으면 언제나** 같은
     일이 난다(`bizCount`·`vipCount`·`agencyVisits`도 `min`을 갖고 있다).
     그래서 골프 한 곳이 아니라 **부류 전체**를 막는다.

   ⚠ 왜 `disabled`인가 — 브라우저는 `disabled` 칸을 **제약 검사에서 아예 뺀다.**
     값을 지우면 고객이 적어 둔 것이 사라지고(다시 켜면 되돌아와야 한다),
     `min`을 떼면 그 칸이 다시 보일 때 검사가 없어진다. `disabled`는 값을 그대로 두고
     **적용 대상에서만** 뺀다. 읽는 쪽(`getElementById('golfRounds').value`)은 그대로 돈다.
   ⚠ **버튼·체크박스·라디오는 건드리지 않는다.** 제약을 가질 수 없어 제출을 막지
     못하고, 코드가 `.checked`를 직접 세우는 자리라 괜히 손대면 그게 새 결함이 된다.
   ⚠ 우리가 끈 것만 되켠다(`data-autoOff`). 다른 이유로 꺼 둔 칸을 살려내면 안 된다. */
function syncHiddenFieldValidity(scope) {
  const root = scope || document.getElementById('estimateForm');
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('input, select, textarea').forEach((el) => {
    const t = String(el.type || '').toLowerCase();
    if (t === 'button' || t === 'submit' || t === 'reset' || t === 'checkbox' || t === 'radio') return;
    /* `.hidden`은 이 저장소가 쓰는 감추기다(`display:none !important`).
       단계 전환(`.estimate-step`)은 `.hidden`을 안 쓰므로 여기 걸리지 않는다 —
       걸리면 2단계 칸이 통째로 꺼져 견적이 아예 안 나온다. */
    const buried = !!(el.closest('.hidden') || el.closest('[hidden]'));
    if (buried && !el.disabled) { el.disabled = true; el.dataset.autoOff = '1'; }
    else if (!buried && el.dataset.autoOff) { el.disabled = false; delete el.dataset.autoOff; }
  });
}

/* 화면이 무엇을 감추든 그 **직후에** 맞춘다. 감추는 자리가 여럿이라(골프·휴양·임원)
   한 곳에서만 부르면 나머지에서 같은 결함이 다시 난다(결함 생성기 ①). */
(function watchHiddenFields() {
  const form = document.getElementById('estimateForm');
  if (!form) return;
  const sync = () => syncHiddenFieldValidity(form);
  form.addEventListener('change', sync);
  form.addEventListener('input', sync);
  /* 클래스가 코드로 바뀌는 경우(목적지 변경 → 골프줄 감춤)는 이벤트가 안 온다.
     감시자를 붙여 **감춰지는 순간** 맞춘다. */
  if (typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(form, {
      subtree: true, attributes: true, attributeFilter: ['class', 'hidden'],
    });
  }
  sync();
})();

(function applyQuoteLimits() {
  if (typeof LIMITS === 'undefined') return;
  const pax = document.getElementById('participants');
  if (pax && LIMITS.QUOTE_MAX_PAX) {
    pax.setAttribute('max', String(LIMITS.QUOTE_MAX_PAX));
    /* 숫자를 문구에도 그대로 — 「최대 몇 명까지 되나」를 눌러 보기 전에 알 수 있게 */
    const lab = pax.closest('label');
    const hint = lab && lab.querySelector('.fld-hint');
    if (hint && !/명/.test(hint.textContent)) {
      hint.textContent = (hint.textContent + ' · 최대 ' + LIMITS.QUOTE_MAX_PAX.toLocaleString() + '명').trim();
    }
  }
  const days = document.getElementById('days');
  if (days && LIMITS.QUOTE_MAX_DAYS) days.setAttribute('max', String(LIMITS.QUOTE_MAX_DAYS));
})();

/* 🔴 **브라우저 말풍선 대신 우리 안내를 쓴다** (XK).
   `estimateForm`의 칸에는 `required`가 붙어 있어서, 제출을 누르면 브라우저가 먼저
   막고 자기 말풍선을 띄운다 — 그래서 우리 `submit` 처리는 **아예 불리지 않는다.**
   ⚠ 그런데 막힌 칸이 **감춰진 1단계**에 있으면 브라우저는 말풍선을 띄울 자리가 없어
     「focusable하지 않다」며 **아무 말 없이 제출만 막는다.** 고객에게는 버튼이 죽은
     것과 같다. 그 자리를 여기서 받는다: 말풍선을 접고, 그 단계를 열고, 문장으로 말한다.
   ⚠ `required` 자체를 떼거나 `novalidate`를 걸지 않는다 — 숫자 범위·형식 검사는
     브라우저 쪽이 더 촘촘하다. **막는 것은 브라우저, 설명은 우리**로 나눈다. */
if (typeof form !== 'undefined' && form) {
  form.addEventListener('invalid', function (e) {
    e.preventDefault();
    reportMissingField(form);
  }, true);
}

/* 막힌 칸으로 데려가고 **왜 멈췄는지** 적는다. 막힌 것이 없으면 null.
   ⚠ 비어 있는 것만 보지 않는다 — 숫자 범위·형식이 어긋난 칸도 브라우저가 제출을
     막는데, 그때 우리가 아무 말도 안 하면 **버튼이 고장 난 것처럼 보인다.** */
function reportMissingField(scopeEl) {
  const fields = Array.from(scopeEl.querySelectorAll('[required], input, select, textarea'));
  const missing = fields.filter((el) => {
    if (el.type === 'hidden' || el.disabled) return false;
    if (el.hasAttribute('required') && !String(el.value || '').trim()) return true;
    return !!(el.validity && !el.validity.valid);
  });
  if (!missing.length) return null;
  const first = missing[0];

  /* 🔴 **감춰진 단계에 있는 칸이면 그 단계를 먼저 연다.** 안 그러면 focus가 아무
     일도 안 한 것처럼 보이고(감춘 요소는 포커스를 못 받는다), 고객에게는 진짜로
     「눌러도 아무 반응이 없는 버튼」이 된다. */
  const stepEl = first.closest('.estimate-step');
  if (stepEl && !stepEl.classList.contains('step-active')) {
    const n = Number(stepEl.getAttribute('data-step'));
    if (n && typeof setActiveStep === 'function') setActiveStep(n);
  }

  const host = (stepEl && stepEl.querySelector('.step-actions')) || null;
  if (host) {
    let box = stepEl.querySelector('.step-missing');
    if (!box) {
      box = document.createElement('p');
      box.className = 'step-missing';
      box.setAttribute('role', 'status');   /* 화면 낭독기도 읽는다 */
      host.parentNode.insertBefore(box, host);
    }
    box.textContent = missingMessage(missing);
  }

  missing.forEach((el) => {
    el.classList.add('fld-missing');
    /* 채우면 표시를 지운다 — 다 채웠는데 빨간 줄이 남아 있으면 그게 또 거짓말이다 */
    if (!el.dataset.missingWatch) {
      el.dataset.missingWatch = '1';
      const off = () => { if (String(el.value || '').trim()) clearMissingMark(el); };
      el.addEventListener('input', off);
      el.addEventListener('change', off);
    }
  });

  first.focus();
  return first;
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

/* ── Level 1 헬퍼: 출발월 → 시즌 정보 ──────────────────────────────────
   P4: 목적지가 DEST_SEASON_PROFILES(권역별 시즌표)에 매칭되면 그 config를
   우선 사용하고, 없으면 기존 공용표로 폴백한다. 폴백은 남반구 목적지면
   SEASON_CONFIG_SOUTHERN(현지 계절 반전), 그 외엔 SEASON_CONFIG.
   → 프로파일에 없는 목적지의 동작은 P4 이전과 100% 동일. */
function getSeasonInfo(dateStr, destKey) {
  const profile = (typeof DEST_SEASON_PROFILES !== 'undefined')
    ? DEST_SEASON_PROFILES.find(p => p.keys.includes(destKey))
    : null;
  const config = profile
    ? profile.config
    : ((typeof SOUTHERN_HEMISPHERE_DESTS !== 'undefined' && SOUTHERN_HEMISPHERE_DESTS.includes(destKey))
        ? SEASON_CONFIG_SOUTHERN
        : SEASON_CONFIG);
  if (!dateStr) return config.find(s => s.id === 'normal');
  const month = new Date(dateStr).getMonth() + 1;
  return config.find(s => s.months.includes(month))
      || config.find(s => s.id === 'normal');
}

/* ── P2 헬퍼: 항공 예약 리드타임 계수 ────────────────────────────────
   견적일(오늘)로부터 출발일까지 남은 일수가 짧을수록 항공권이 비싸진다(임박 발권),
   아주 일찍 잡으면 소폭 저렴. 시즌 계수(월 단위)로는 못 잡는 "예약 시점" 효과.
   startDate가 없거나 과거면 중립(1.0). 밴드 값은 운영 중 실측(요율관리 정확도)에
   맞춰 조정 가능. */
const LEAD_TIME_BANDS = [
  { maxDays: 14,       factor: 1.25 },  // 2주 미만(임박)
  { maxDays: 30,       factor: 1.12 },  // 2~4주
  { maxDays: 60,       factor: 1.00 },  // 1~2개월(기준)
  { maxDays: 120,      factor: 0.95 },  // 2~4개월
  { maxDays: Infinity, factor: 0.92 },  // 4개월 이상(조기)
];
function getLeadTimeFactor(startDateStr) {
  if (!startDateStr) return 1.0;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return 1.0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((start - today) / 86400000);
  if (days < 0) return 1.0;
  return (LEAD_TIME_BANDS.find(b => days < b.maxDays) || LEAD_TIME_BANDS[LEAD_TIME_BANDS.length - 1]).factor;
}

/* ── P2 헬퍼: 목적지 피크 날짜 달력 ──────────────────────────────────
   시즌 계수는 전 목적지 공용 '월 단위' 근사라 목적지 고유 성수기·연휴(골든위크·춘절
   등)를 못 잡는다. 여기서 날짜 구간별 추가 계수를 목적지별로 정의해 항공/유류에 얹는다.
   keys='ALL'은 한국 출발 공통 성수기. from/to는 'MM-DD'(매년 반복, from>to면 연말연시처럼
   해를 넘는 구간). 겹치면 가장 큰 계수 하나만 적용. 데이터 없으면 1.0(영향 없음).

   ⚠ 여기에는 **양력으로 매년 같은 날인 피크만** 둔다. 음력 연휴(설·추석·춘절)는
   아래 LUNAR_PEAKS에 연도별 실제 날짜로 따로 있다. — PM(2026-07-29):
   예전엔 음력 연휴도 이 표에 'MM-DD'로 들어가 매년 반복됐다. 값은 2027년 기준이라
   다른 해에는 **엉뚱한 날짜에 얹혔다.** 실측으로 확인한 결과:
     2026-09-15(평범한 날)      → ×1.22 "추석 연휴"  ← 근거 없는 과청구
     2026-09-25(2026 실제 추석) → ×1.00              ← 진짜 피크를 놓침
   당시 주석은 "좁은 구간은 피크를 놓칠 뿐(소폭 과소추정, 안전)"이라고 적혀 있었는데
   **틀린 논리였다.** 좁아도 어긋난 해에는 평범한 날 위에 그대로 얹힌다.
   같은 실수를 반복하지 않으려면: 매년 날짜가 바뀌는 항목을 'MM-DD'로 두지 말 것. */
const PEAK_CALENDAR = [
  { keys: 'ALL', from: '07-15', to: '08-20', factor: 1.20, label: '여름 성수기' },
  { keys: 'ALL', from: '12-20', to: '01-03', factor: 1.25, label: '연말연시' },
  /* P9: 5월 초 황금연휴(근로자의날 5/1·어린이날 5/5) — 항공 수요 상승. 일본행은 아래
     골든위크(1.35)가 최댓값으로 자동 우선하므로 'ALL'이어도 비일본행에만 실질 영향. 보수적. */
  { keys: 'ALL', from: '05-01', to: '05-06', factor: 1.12, label: '5월 황금연휴' },
  { keys: ['도쿄', '오사카', '후쿠오카', '나고야', '삿포로', '오키나와'], from: '04-27', to: '05-06', factor: 1.35, label: '일본 골든위크' },
  { keys: ['도쿄', '오사카', '후쿠오카', '나고야'], from: '03-25', to: '04-10', factor: 1.20, label: '벚꽃 시즌' },
];

/* ── 음력 연휴 피크 (PM, 2026-07-29 신설) ────────────────────────────
   설·추석·춘절은 매년 양력 날짜가 달라서 'MM-DD' 반복 구간으로 두면 반드시 어긋난다.
   그래서 **연도별 절대 날짜**로 둔다. from/to는 'YYYY-MM-DD'(양 끝 포함).

   ⚠ **등록되지 않은 연도는 계수 1.0(피크 없음)이다.** 근사로 때우지 않는다 —
   근사는 평범한 날을 과청구할 수 있고, 견적서에 "설 연휴"라고 적힌 근거 없는
   할증이 붙는 건 고객 신뢰 문제로 직결된다. 못 잡아서 조금 낮게 나가는 쪽이 안전하다
   (GPT 2라운드 협의에서도 같은 결론).

   ⚠ **커버리지가 끊기면 조용히 피크가 사라진다.** 그걸 막으려고
   `ai-loop/test_pM_lunar_peaks.js`가 "오늘부터 12개월 안에 커버리지가 끝나면 실패"하도록
   검사한다. 그 테스트가 빨간불이면 아래에 다음 해 3줄을 추가하면 된다.

   구간 폭은 기존과 동일한 상대 폭을 실제 연휴일에 앵커한 것이다:
     설   = 설날 -2일 ~ +3일   (연휴 전 출국 수요 + 연휴 중)
     추석 = 추석 -2일 ~ +2일
     춘절 = 설날 -1일 ~ +7일   (중국 황금연휴가 한국 설보다 길다)
   음력→양력 날짜는 사장님 확인 필요(공식 관공서 달력 기준). */
const LUNAR_PEAK_DEST_CN = ['상해', '장가계', '청도', '연태', '홍콩', '마카오', '대만', '가오슝'];
const LUNAR_PEAKS = [
  /* 2026: 설 2/17(화) · 추석 9/25(금) */
  { keys: 'ALL', from: '2026-02-15', to: '2026-02-20', factor: 1.25, label: '설 연휴' },
  { keys: 'ALL', from: '2026-09-23', to: '2026-09-27', factor: 1.22, label: '추석 연휴' },
  { keys: LUNAR_PEAK_DEST_CN, from: '2026-02-16', to: '2026-02-24', factor: 1.30, label: '춘절' },
  /* 2027: 설 2/6(토) · 추석 9/15(수) */
  { keys: 'ALL', from: '2027-02-04', to: '2027-02-09', factor: 1.25, label: '설 연휴' },
  { keys: 'ALL', from: '2027-09-13', to: '2027-09-17', factor: 1.22, label: '추석 연휴' },
  { keys: LUNAR_PEAK_DEST_CN, from: '2027-02-05', to: '2027-02-13', factor: 1.30, label: '춘절' },
  /* 2028: 설 1/26(수) · 추석 10/3(화, 개천절과 겹침) */
  { keys: 'ALL', from: '2028-01-24', to: '2028-01-29', factor: 1.25, label: '설 연휴' },
  { keys: 'ALL', from: '2028-10-01', to: '2028-10-05', factor: 1.22, label: '추석 연휴' },
  { keys: LUNAR_PEAK_DEST_CN, from: '2028-01-25', to: '2028-02-02', factor: 1.30, label: '춘절' },
];
/* P7 호텔 피크 가중치(항공 피크 상승폭 중 호텔이 받는 비중)는 P2b에서 관리자 조정 가능한
   스칼라 노브로 승격됨 → 위쪽 COEF_SPEC.hotelPeakWeight(기본 0.8) 참고. 여기 상수는 제거. */
function getPeakInfo(startDateStr, destKey) {
  if (!startDateStr) return { factor: 1.0, label: '' };
  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) return { factor: 1.0, label: '' };
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ymd = `${d.getFullYear()}-${mmdd}`;
  const inRange = (from, to) => (from <= to ? (mmdd >= from && mmdd <= to) : (mmdd >= from || mmdd <= to));
  const applies = (p) => p.keys === 'ALL' || (Array.isArray(p.keys) && p.keys.includes(destKey));
  let best = { factor: 1.0, label: '' };
  for (const p of PEAK_CALENDAR) {
    if (applies(p) && inRange(p.from, p.to) && p.factor > best.factor) best = { factor: p.factor, label: p.label };
  }
  /* 음력 연휴는 연도별 절대 날짜라 문자열 비교만으로 끝난다(YYYY-MM-DD는 사전순=시간순).
     등록 안 된 연도는 어떤 구간에도 안 걸려 자연히 1.0이 된다 — 의도된 동작이다. */
  for (const p of LUNAR_PEAKS) {
    if (applies(p) && ymd >= p.from && ymd <= p.to && p.factor > best.factor) best = { factor: p.factor, label: p.label };
  }
  return best;
}

/* ── P3 헬퍼: 환율 보정 계수 ─────────────────────────────────────────
   현지통화 원가(호텔·식비·가이드·차량·관광)는 정적 KRW로 저장돼 있어, 요율을 정한
   시점 이후 환율이 변하면 실제 원가와 벌어진다. 목적지 통화의 (현재환율 / 기준시점환율)
   비율로 그 항목들을 보정한다. 항공·유류는 국제선 성격이라 제외, 마진·보험은 원화라 제외.
   데이터(기준환율/현재환율)가 없으면 1.0(영향 없음). 데이터 이상으로 인한 견적 폭주를
   막으려 ±30%로 클램프.

   ⚠ 클램프는 '안전장치'지만 걸린 채로 두면 그 자체가 문제다 — 실제 환율이 30% 넘게
   움직였다는 뜻이고, 그만큼 견적이 원가를 못 따라간다. 걸린 목적지를 FX_CLAMPED에
   기록해 관리자 화면이 알아챌 수 있게 한다(2026-07-29 GPT 3라운드 지적). */
const FX_CLAMP_MIN = 0.7, FX_CLAMP_MAX = 1.3;
const FX_CLAMPED = {};
function getFxAdjust(destKey) {
  const base = FX_STATE.baseline[destKey];
  if (!base || !base.rate) return 1.0;
  const now = FX_STATE.rates[base.currency];
  if (!now || !isFinite(now)) return 1.0;
  const adj = now / base.rate;
  if (!isFinite(adj) || adj <= 0) return 1.0;
  const clamped = Math.max(FX_CLAMP_MIN, Math.min(FX_CLAMP_MAX, adj));
  /* 클램프에 걸린 사실을 남긴다 (신규) — 걸리면 실제 환율 변동이 견적에 덜 반영되는데
     예전엔 그 사실이 어디에도 안 보여서, 원가와 견적이 벌어지는 상태가 조용히 지속됐다.
     통화가 30% 넘게 움직였다면 요율 자체를 다시 잡아야 하는 상황이라 사람이 알아야 한다.
     계산 결과는 그대로 두고 기록만 남기므로 금액에는 영향이 없다. */
  if (clamped !== adj) {
    FX_CLAMPED[destKey] = { currency: base.currency, raw: adj, applied: clamped };
  } else if (FX_CLAMPED[destKey]) {
    delete FX_CLAMPED[destKey];
  }
  return clamped;
}

/* ── Level 2 헬퍼: 요율 기준일 신선도 판정 ───────────────────────
   ok    : 0 ~ 3개월 이내 (✅ 최신)
   check : 4 ~ 6개월     (⚠️ 확인 권장)
   stale : 7개월 이상    (🔴 갱신 필요)
   ─────────────────────────────────────────────────────────────── */
/* ⚠ 중복 구현 주의: admin.html의 adminGetRateStatus()와 로직(3개월/6개월 임계값 +
   rateDate 없을 때 '미확인' 처리)이 동일한 별도 구현입니다. 한쪽만 수정하면 고객용/관리자용
   "요율 최신성" 배지가 서로 어긋나므로 반드시 두 함수를 함께 수정하세요. 반환 shape만
   용도가 달라 다릅니다: 여기(고객 배지)는 color, adminGetRateStatus(관리자 표)는 icon.
   (2026-07-22 검토 시 임계값·months 계산·null('미확인') 케이스 값이 정확히 동일함을 확인) */
function getRateStatus(rateDate) {
  /* rateDate 미상 → '미확인'(adminGetRateStatus와 값 대칭). 고객 계산기 호출측은 rateDate가
     있을 때만 이 함수를 부르므로 실무상 도달하지 않지만, 두 구현의 계약을 맞춰 둔다. */
  if (!rateDate) return { status: 'stale', months: 999, label: '미확인', color: '#ef4444' };
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
  /* TJ: 골프조 — 기본은 꺼짐. 골프는 전원이 하는 항목이 아니라 편성이다. */
  const incGolf        = document.getElementById('incGolf')?.checked ?? false;
  const golfCountRaw   = Math.max(0, Math.floor(Number(document.getElementById('golfCount')?.value) || 0));
  const golfRoundsRaw  = Math.max(0, Math.floor(Number(document.getElementById('golfRounds')?.value) || 0));
  /* TP: 부대비용 B안 — 담당자가 아는 조건. 기본은 꺼짐(A안 계수가 이미 깔려 있다). */
  const agencyVisits    = Math.max(0, Math.floor(Number(document.getElementById('agencyVisits')?.value) || 0));
  const domesticTransfer = document.getElementById('incDomestic')?.checked ?? false;
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

  /* ── PD: 좌석 등급 혼합(임원만 비즈니스) ──────────────────────────────────
     기존엔 좌석 등급이 전원 일괄이라, 임원 2명만 비즈니스인 흔한 구성을 "전원 비즈니스"
     (과대) 또는 "전원 이코노미"(과소)로밖에 표현할 수 없었다. 실제 기업연수는 대부분
     혼합이라 항공료 오차가 가장 크게 나던 지점.

     ⚠ 객실 구성의 vipCount를 재사용하지 않고 bizCount를 따로 받는다. vipCount는
     "1인 1실 임원 인원"이라 좌석과 독립적이다 — 임원이 1인 1실을 쓰면서 이코노미를
     탈 수도, 2인 1실이면서 비즈니스를 탈 수도 있다. 재사용하면 객실 구성을 '혼합'으로
     고르지 않은 견적에서 좌석 혼합이 조용히 무시된다.

     계산은 '가중평균 배율'로 접어 넣는다:
       bizFactor = (bizCount × 노선비즈배율 + 나머지 인원 × 1.0) / 총원
     이렇게 하면 이후 tieredTotal(인원 볼륨 할인)이 기존 그대로 동작하고, 볼륨 할인은
     혼합 편성된 총액 위에 걸린다(단체 예약이므로 전체 인원 기준 협상이 맞다).
     bizCount=0이면 정확히 1.0, bizCount=총원이면 정확히 '전원 비즈니스'와 동일 →
     양 끝에서 기존 동작과 일치해 회귀가 없다. */
  /* 정수로 내림 — <input type="number" min="0">에 step이 없어 "2.5" 입력이 통과한다.
     그러면 가중평균에 2.5명이 들어가 "비즈니스 2.5명"짜리 견적이 나간다(금액이
     폭주하진 않지만 견적서 문구와 금액이 둘 다 말이 안 되는 값이 된다). */
  const bizCountRaw = Math.max(0, Math.floor(Number(document.getElementById('bizCount')?.value) || 0));
  const bizCount    = cabinClassVal === 'mixed' ? Math.min(bizCountRaw, participants) : 0;
  /* getBizFactor는 미등록 목적지에 콘솔 경고를 남기므로 비즈니스가 걸린 경우에만 호출 */
  const bizSeatFactor = (cabinClassVal === 'business' || cabinClassVal === 'mixed')
    ? getBizFactor(destKey) : 1.0;
  const bizFactor =
      cabinClassVal === 'business' ? bizSeatFactor
    : cabinClassVal === 'mixed'
        ? (participants > 0 ? (bizCount * bizSeatFactor + (participants - bizCount)) / participants : 1.0)
    : 1.0;
  const roomCfg    = ROOM_CONFIG[roomConfigVal] || ROOM_CONFIG.double;
  const rooms      = roomCfg.calcRooms(participants, vipCount);

  /* 조정된 단가 계산
     · 항공: 출발지 계수 × 좌석 등급 계수 (비즈니스는 노선 거리 비례)
     · 유류할증료: 출발지 계수만 적용 (좌석 등급과 무관)
     · 호텔: 객실 구성은 rooms 계산으로 이미 반영됨
     · 항공/유류의 인원 구간(PAX_TIERS) 할인은 tieredTotal()로 누진 계산해
       총액이 인원수에 대해 항상 non-decreasing하도록 보장 (버그③수정) */
  /* P2: 예약 리드타임 + 목적지 피크 날짜 계수 (항공·유류에 적용 — 항공이 가장 크고
     가장 변동성 큰 항목이라 여기부터. 호텔에는 아직 적용하지 않음). */
  /* P2b: 시즌·리드타임·피크 진폭을 관리자 스칼라 노브(COEF_STATE)로 완만/과격하게 보정.
     strength=1(기본)이면 아래 factor들이 P2b 이전과 완전 동일 → 회귀 없음. */
  const seasonFactor = applyStrength(seasonInfo.factor, COEF_STATE.seasonStrength);
  const leadFactor   = applyStrength(getLeadTimeFactor(startDateVal), COEF_STATE.leadTimeStrength);
  const peakInfo     = getPeakInfo(startDateVal, destKey);
  const peakFactor   = applyStrength(peakInfo.factor, COEF_STATE.peakStrength);
  /* P11: 변동성 곱 상한 — 시즌×리드×피크가 상한을 넘으면 비례 축소(volScale). 기본 노브에선
     항상 1(무영향). 항공·유류에만 적용(가장 크게 스택되는 항목). 출발지·비즈·환율은 대상 아님. */
  const volProduct = seasonFactor * leadFactor * peakFactor;
  const volScale   = volProduct > VOL_MULTIPLIER_CAP ? VOL_MULTIPLIER_CAP / volProduct : 1;
  const airUnitBase  = dest.airfare        * seasonFactor * departureFactor * bizFactor * leadFactor * peakFactor * volScale;
  const fuelUnitBase = dest.fuel_surcharge * seasonFactor * departureFactor * leadFactor * peakFactor * volScale;
  const airTotalTiered  = tieredTotal(airUnitBase,  participants, PAX_TIERS);
  const fuelTotalTiered = tieredTotal(fuelUnitBase, participants, PAX_TIERS);
  const airUnit   = participants > 0 ? Math.round(airTotalTiered  / participants) : 0;
  const fuelUnit  = participants > 0 ? Math.round(fuelTotalTiered / participants) : 0;
  /* P3: 환율 보정 — 현지통화 원가 항목(호텔·식비·가이드·차량·관광)에만 적용
     (항공·유류는 국제선 성격이라 제외, 마진·보험은 원화라 제외) */
  const fxAdjust  = getFxAdjust(destKey);
  /* P7: 호텔 피크 계수 — P2에서 항공·유류에만 얹었던 날짜별 피크(골든위크·벚꽃·연말연시)를
     호텔에도 반영. 항공용 계수를 그대로 쓰면 과보정 위험이 있어 프리미엄(factor−1)에
     호텔 피크 비중(COEF_STATE.hotelPeakWeight, 기본 0.8=P7)을 곱해 완만하게 얹는다. 리드타임은
     단체 호텔이 블록 계약이라 항공만큼 민감하지 않아 호텔엔 적용하지 않음. 비피크면 factor=1.0 →
     무영향(additive). ※ hotelPeakWeight는 항공 peakStrength와 독립: 항공 피크 진폭은 peakStrength가,
     그 피크를 호텔이 얼마나 받을지는 hotelPeakWeight가 따로 결정한다(원 raw 피크 기준). */
  const hotelPeakFactor = 1 + (peakInfo.factor - 1) * COEF_STATE.hotelPeakWeight;
  const hotelUnit = Math.round(dest.hotel_per_room * hotelGrade.factor * seasonFactor * fxAdjust * hotelPeakFactor);
  const mealUnit  = Math.round(dest.meal_per_person  * fxAdjust);
  const guideUnit = Math.round(dest.guide_fee        * fxAdjust);
  /* PC: 관광비에 일수 계수 — sightseeing_fee는 4~5일 기준 '전체 일정 묶음'이라 그대로 쓰면
     3일과 10일 일정의 관광비가 같아진다. 체감형이며 상세 근거는 data.js SIGHT_DURATION_TIERS. */
  const sightDuration = getSightDurationInfo(days);
  const sightUnit = Math.round(dest.sightseeing_fee  * fxAdjust * sightDuration.factor);

  /* PE: 자동 차량 선택 임계를 소형 정원에 맞춘다 — 소형으로 태울 수 있으면 소형.
     기존엔 '10명 이상이면 대형'이라는 상수가 박혀 있었는데(버그②수정 당시 >12 → >=10),
     정작 소형 정원은 VEHICLE_CAPACITY.small = 25명이라 두 상수가 서로 말이 안 맞았다.
     그래서 10~25명 견적은 소형 한 대로 충분한데도 대형 요금이 잡혀 체계적으로 과대추정됐다
     (뉴욕 기준 하루 +90만원 · 대형/소형 비 중앙값 1.43배). 사용자 확정으로 정원 기준으로 정렬.

     ⚠ 임계값을 다시 숫자로 박지 말 것 — VEHICLE_CAPACITY에서 파생시켜야 정원을 고칠 때
     자동으로 따라오고, 같은 어긋남이 재발하지 않는다.
     선택 결과: ~25명 소형 1대 / 26~45명 대형 1대 / 46명~ 대형 ceil(인원/45)대.
     (vehicleType은 index.html에서 'auto' 고정이라 실질적으로 항상 이 경로를 탄다.) */
  const useLarge    = vehicleTypeVal === 'large'
                   || (vehicleTypeVal === 'auto' && participants > VEHICLE_CAPACITY.small);
  const vehicleRate = useLarge ? dest.vehicle_large : dest.vehicle_small;
  const vehicleUnitAdj = Math.round(vehicleRate * fxAdjust);

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

  /* ⚠ meal_per_person은 **1인 1일** 식대다 (RO). 예전에는 '1인 1식'으로 보고
     `days*2-1`식을 곱했는데, 그 모델이 실제 견적서와 두 군데서 어긋났다:
       ① 담당자는 견적서의 하루치(중식+석식)를 그대로 넣는다 — 실제로 오키나와에
          50,000(=17,100+33,250)이 들어와 있었고, 엔진이 그걸 7번 곱해 **3.45배**가 됐다.
       ② 식수 자체가 안 맞는다. 하나투어 오키나와 4일 견적의 유료 식사는 4끼인데
          엔진은 7식으로 셌다 — 1식 단가를 정확히 넣어도 1.74배가 된다.
     그래서 단위를 **하루**로 통일했다. 견적서에서 뽑을 때도 하루 통합으로 뽑는다
     (api/quotes.js의 mealRows 합산). 실측 대조: 25,175 × 4일 = 100,700/인 = 실제와 일치.
     ⚠ 2026-08-04 사용자 결정 — 기존 55곳의 값은 그대로 두기로 했다. 그래서 이 변경으로
     식사비가 40~47% 줄고 견적 총액이 약 5.6% 내려간다. 지금 값들은 근거 없는 온라인
     추정치이고 실측으로 교체될 것들이라, 뜻이 분명한 쪽으로 정리하는 편을 택했다. */
  const mealDays = days;
  /* P10: 식사 볼륨 할인(누진). 1인당 식비에 GROUND_MEAL_TIERS를 tieredTotal로 적용해
     인원 규모 협상력을 반영(항공보다 완만). unit은 할인 반영된 1인 1일 실효단가로 표시. */
  const mealTotalTiered = tieredTotal(mealUnit, participants, GROUND_MEAL_TIERS) * mealDays;
  const mealEffUnit = (participants > 0 && mealDays > 0) ? Math.round(mealTotalTiered / (participants * mealDays)) : mealUnit;
  if (incMeal) rows.push({
    name:'식사', unit:mealEffUnit,
    qty:`${participants}명×${mealDays}일`,
    amount: mealTotalTiered,
  });

  if (incVehicle) rows.push({
    name:vehicleName, unit:vehicleUnitAdj,
    qty: vehicleCount > 1 ? `${vehicleCount}대×${days}일` : `${days}일`,
    amount: vehicleUnitAdj * days * vehicleCount,
  });

  /* P13: 가이드 인원비례 — 가이드는 '버스당 1명'(현지 가이드 관행). 차량 대수
     (vehicleCount = ceil(인원/정원), 위에서 이미 산정)를 그대로 재사용한다. 기존엔
     인원과 무관하게 항상 1명분(guide_fee × 일수)만 잡혀 대형 단체를 체계적으로
     과소추정했다(차량은 bug④에서 대수화됐으나 가이드는 누락). vehicleCount는
     incVehicle 체크와 무관하게 항상 계산되므로, 차량 라인을 빼도 가이드 수는 그룹
     규모(필요 버스 수)를 반영한다. 볼륨 할인은 적용 안 함 — 가이드는 실인원 배치비용. */
  const guideCount = vehicleCount;
  if (incGuide) rows.push({
    name:'가이드', unit:guideUnit,
    qty: guideCount > 1 ? `${guideCount}명×${days}일` : `${days}일`,
    amount: guideUnit * days * guideCount,
  });

  /* P10: 관광 볼륨 할인(누진). 입장료는 정찰제가 많아 식사보다 완만한 GROUND_SIGHT_TIERS 적용. */
  const sightTotalTiered = tieredTotal(sightUnit, participants, GROUND_SIGHT_TIERS);
  const sightEffUnit = participants > 0 ? Math.round(sightTotalTiered / participants) : sightUnit;
  if (incSightseeing) rows.push({
    name:'관광', unit:sightEffUnit,
    qty:`${participants}명`,
    amount: sightTotalTiered,
  });

  /* ─── TJ: 골프조 ──────────────────────────────────────────────────────
     사장님 2026-08-13: 「관광조가 있고 골프조가 있어」. 실제 견적서가 그렇다 —
     신한/발리는 「중식 자유식 × 55명 **관광조**」와 「클럽중식 × 25명 **골프조**」가
     한 문서에 있고, 글로벌/오키나와는 관광조 48명·골프조 20명이 표 두 개로 나뉜다.

     그래서 골프는 **전원에게 붙는 항목이 아니다.** 골프조 인원 × 라운딩 횟수만큼만 붙는다.
     ⚠ **관광비와 섞지 않는다.** 자릿수가 다르다(다낭 관광 50,000 vs 라운딩 235,935) —
       한 칸에 넣으면 그 목적지 관광비 기준이 왜곡되고, 그 왜곡이 요율 갱신 제안을 타고
       **골프를 안 치는 고객의 견적까지** 간다. 추출기가 골프를 따로 세는 이유와 같다.
     ⚠ **인원 볼륨 할인(tieredTotal)을 걸지 않는다.** 그린피는 코스 정찰제라 단체라고
       깎이지 않는다(관광 입장료보다도 경직적이다). 걸면 근거 없이 싸진다.
     ⚠ **환율 보정(fxAdjust)은 건다.** 현지 통화로 결제하는 현지 원가이기 때문이다 —
       호텔·식비·가이드·차량·관광과 같은 성격이다.
     ⚠ 요금이 없는 목적지는 **여기 오기 전에 잠긴다**(golfFee가 0이면 줄을 만들지 않는다).
       짐작한 값으로 견적을 내면 그 숫자가 그대로 고객에게 나간다. */
  const golfFee  = typeof getGolfFee === 'function' ? getGolfFee(destKey) : 0;
  const golfUnit = golfFee ? Math.round(golfFee * fxAdjust) : 0;
  /* 골프조는 총원의 일부다 — 총원을 넘겨 입력해도 총원으로 자른다(bizCount와 같은 방어) */
  const golfCount  = golfFee ? Math.min(golfCountRaw, participants) : 0;
  const golfRounds = Math.max(1, golfRoundsRaw);
  const golfTotal  = golfUnit * golfCount * golfRounds;
  if (incGolf && golfCount > 0 && golfUnit > 0) rows.push({
    name:'골프', unit:golfUnit,
    qty: golfRounds > 1 ? `${golfCount}명×${golfRounds}회` : `${golfCount}명`,
    amount: golfTotal,
  });

  /* ─── TP: 현장 부대비용 ────────────────────────────────────────────────
     요율 아홉 칸에 담기지 않는 돈이다 — 기관 섭외·통역, 국내수송, 싱글차지,
     행사운영(현수막·기념품·사진·MC). 46건 코퍼스에서 견적서 돈의 **12.4%**가 여기고,
     고객용 견적서 기준 엔진의 계통 편향이 **-12.1%**다. 두 숫자가 같다.

     ⚠ **기준은 지상비다**(항공·유류 제외). 부대비용은 현장 진행에 비례하지 항공권 값에
       비례하지 않는다 — 총액에 걸면 장거리 노선에서 근거 없이 부풀어 오른다.
     ⚠ **마진·보험보다 위에 둔다.** 이건 원가지 우리 수익이 아니다. 아래 비공개 3종과
       섞이면 `muted` 필터(공유 페이로드에서 고객에게 가려지는 줄)에 딸려 들어가
       고객 견적서에서 금액이 사라진다 — 그러면 합이 안 맞는다.
     ⚠ 계수는 **추정이 아니라 실측으로 고른 값**이다(sim_ancillary.js). 만질 때 그 자를
       다시 돌릴 것 — 중앙값만 보면 사분위 폭이 벌어지는 것을 놓친다. */
  /* ⚠ **골프는 기준에서 뺀다.** 부대비용은 행사 진행(기관 섭외·통역·행사 운영)에
     비례하지 **골프조의 라운딩 횟수에 비례하지 않는다.** 넣어 봤더니 골프를 켤 때마다
     섭외비가 함께 늘어나는 상태가 됐다(test_tJ의 「총액은 골프비만큼만 늘어난다」가 잡았다).
     빼도 계수 근거는 흔들리지 않는다 — 코퍼스에서 골프는 지상비의 1.6%뿐이라
     12.4 ÷ 58.5 = 21.2%로 20%와 사실상 같다. */
  const groundRows = rows.filter((r) => ['호텔', '식사', '가이드', '관광'].some((n) => r.name.startsWith(n))
    || r.name.startsWith('차량'));
  const groundTotal = groundRows.reduce((s, r) => s + r.amount, 0);
  const ancRate = (typeof ANCILLARY !== 'undefined' && ANCILLARY.rate) || 0;
  const ancBaseTotal = Math.round(groundTotal * ancRate);

  /* B안 — 담당자가 아는 조건만 얹는다. 고객은 안 골라도 위 계수가 이미 깔려 있다.
     ⚠ 옵션 값은 **실측 표본이 얇다**(각 1건). 그래서 기본은 꺼짐이고, 켤 때 화면이
       근거를 함께 보여준다. 견적서가 쌓이면 갱신 제안이 이 값을 알려 준다. */
  const ancOpts = [];
  if (typeof ANCILLARY_OPTIONS !== 'undefined') {
    ANCILLARY_OPTIONS.forEach((o) => {
      if (o.key === 'agency' && agencyVisits > 0) {
        ancOpts.push({ key: o.key, label: o.label, qty: `${agencyVisits}${o.unit}`, amount: o.perVisit * agencyVisits });
      }
      if (o.key === 'domestic' && domesticTransfer) {
        /* 전세 차량은 **정원으로 대수를 낸다** — 인원과 무관하게 1대로 두면 대형 단체가
           통째로 과소 계상된다(차량 대수 산정과 같은 원리). */
        const cars = Math.max(1, Math.ceil(participants / o.capacity));
        ancOpts.push({ key: o.key, label: o.label, qty: `${cars}${o.unit}`, amount: o.perVehicle * cars });
      }
    });
  }
  const ancOptTotal = ancOpts.reduce((s, o) => s + o.amount, 0);
  const ancTotal = ancBaseTotal + ancOptTotal;
  const ancUnit = participants > 0 ? Math.round(ancTotal / participants) : 0;
  if (ancTotal > 0) rows.push({
    name: (typeof ANCILLARY !== 'undefined' ? ANCILLARY.label : '현장 부대비용'),
    unit: ancUnit, qty: `${participants}명`, amount: ancTotal,
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
  /* ── 금액 구간별 마진 계수 (VK) ─────────────────────────────────────────
     ⚠ **구간 기준은 여기까지 쌓인 rows의 1인 합 = 원가소계**다(마진·보험 전).
       엔진 총액으로 끊으면 마진이 총액을 바꾸고 총액이 구간을 바꾸는 **순환**이 된다.
       그리고 프로그램·기관 계수는 **아래에서** 곱해지므로 여기 소계에는 아직 없다 —
       그게 맞다. 계수는 그 여행의 원가 수준이 아니라 조건 보정이다.
     ⚠ 구간표는 `data.js`의 `MARGIN_BANDS` 하나가 진실이다. 여기서 다시 적지 말 것.
     ⚠ 배수는 **두 줄에 함께** 걸린다(ENBT·현지가 같은 값에서 1 : 0.9로 나온다).
       즉 인상분의 약 47%는 현지 파트너 몫이다 — 결정대기열 0-d. */
  const costSubtotalUnit = participants > 0
    ? rows.reduce((s, r) => s + r.amount, 0) / participants : 0;
  const marginBand = (typeof marginBandFor === 'function')
    ? marginBandFor(costSubtotalUnit) : { mul: 1, label: '구간 없음' };
  const marginBandMul = Number(marginBand.mul) || 1;
  const bandedMargin = dest.margin_per_traveler * marginBandMul;

  const enbtMarginTotalTiered = tieredTotal(bandedMargin, participants, enbtMarginTierFactors);
  const enbtMarginUnit  = participants > 0 ? Math.round(enbtMarginTotalTiered / participants) : 0;
  const localMarginUnit = Math.round(bandedMargin * 0.90);

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

  /* 🛡️ 여행자보험 — 권역(현지 의료비·후송 리스크) × 여행 일수 차등 (PB).
     보험은 수요 변동이 아니라 보험사 요율표 기반 '원가'라, 시즌·리드타임·피크 노브
     (COEF_STATE)와 P11 변동성 총배수 상한의 대상이 아니다. 단체계약은 1인당 정률이라
     식사·관광 같은 인원 볼륨 할인(P10)도 적용하지 않는다. */
  const insuranceInfo  = getInsuranceInfo(destKey, days);
  const INSURANCE_RATE = insuranceInfo.rate;
  rows.push({
    name:'🛡️ 여행자보험', unit:INSURANCE_RATE,
    qty:`${participants}명`,
    amount: INSURANCE_RATE * participants,
    muted: true, adminLabel:`여행자보험 (${insuranceInfo.zoneLabel}·${insuranceInfo.durationLabel})`,
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
    /* ⚠ mealCount(식수) → mealDays(일수)로 바뀌었다 (RO). 이름을 그대로 두면
       옛 견적 기록의 '7식'과 새 기록의 '4일'이 같은 칸에 섞여 구분이 안 된다. */
    hiddenTotal, visibleTotal, participants, days, nights, mealDays,
    /* Level 1 메타 */
    paxTier, seasonInfo, hotelGrade, hotelGradeKey,
    /* v3 신규 필드 */
    departureCityVal, departureCityLabel: deptCityData.label, departureFactor,
    cabinClassVal,
    cabinClassLabel:
        cabinClassVal === 'business' ? '비즈니스'
      : cabinClassVal === 'mixed'    ? `혼합 (비즈니스 ${bizCount}명 · 이코노미 ${Math.max(participants - bizCount, 0)}명)`
      : '이코노미',
    /* PD 신규 필드 — 혼합 편성 근거(표시·역검증용). bizSeatFactor는 노선 권역별 원 배율,
       bizFactor는 인원 가중평균이 적용된 '실제 반영 배율'. */
    bizCount, bizSeatFactor,
    roomConfigVal,    roomConfigLabel:    roomCfg.label,
    vipCount, bizFactor, rooms,
    /* TJ 신규 필드 — 골프조 편성 근거(표시·역검증용).
       ⚠ `golfCount`는 **총원의 일부**다. 관광조 인원은 총원 − 골프조다(따로 받지 않는다 —
         두 칸을 받으면 합이 총원과 안 맞는 입력이 생긴다). */
    golfFee, golfUnit, golfCount, golfRounds, golfTotal,
    tourCount: Math.max(participants - golfCount, 0),
    /* TP 신규 필드 — 부대비용 근거(표시·역검증용).
       ⚠ `ancRate`를 함께 남긴다. 이 계수는 실측으로 고른 값이라 나중에 바뀌는데,
         지난 견적이 어느 계수로 나온 것인지 모르면 역검증이 헛돈다(coef 스냅샷과 같은 이유). */
    ancRate, groundTotal, ancBaseTotal, ancOptTotal, ancTotal, ancUnit, ancOpts,
    /* P2 신규 필드 — 항공 리드타임/피크 반영 근거(표시·디버깅용).
       P2b: leadFactor·peakFactor·seasonFactor는 스칼라 노브가 적용된 '실제 반영값'.
       원 raw 값이 필요하면 seasonInfo.factor/peakInfo.factor로 접근 가능. */
    seasonFactor, leadFactor, peakFactor, peakLabel: peakInfo.label,
    /* P7 신규 필드 — 호텔에 실제 적용된 피크 계수(항공 피크와 가중치만큼 다름). 역검증용 */
    hotelPeakFactor,
    /* P2b 신규 필드 — 이 견적에 실제 반영된 계수 노브 스냅샷(역검증·표시용) */
    coef: { ...COEF_STATE },
    /* P11 신규 필드 — 변동성 곱(시즌×리드×피크)과 상한 축소계수(1이면 미적용). 진단·역검증용 */
    volProduct, volScale,
    /* PB 신규 필드 — 보험 권역·기간 계수와 산출된 1인 요율(근거 표시·역검증용) */
    insuranceInfo,
    /* PC 신규 필드 — 관광비에 적용된 일수 계수와 구간 라벨(근거 표시·역검증용) */
    sightDuration,
    /* P3 신규 필드 — 환율 보정 계수(현지원가 항목에 적용) */
    fxAdjust,
    /* VK 신규 필드 — 금액 구간별 마진 계수와 판정 근거(표시·역검증용).
       ⚠ `ancRate`를 남긴 것과 같은 이유다 — 이 배수는 실측으로 고른 값이라 나중에
         바뀌는데, 지난 견적이 어느 배수로 나온 것인지 모르면 역검증이 헛돈다.
       ⚠ `costSubtotalUnit`(판정에 쓴 소계)까지 함께 남긴다. 배수만 남기면
         **왜 그 구간이 됐는지**를 화면이 말할 수 없다(조용한 폴백이 된다). */
    marginBandMul, marginBandLabel: marginBand.label, costSubtotalUnit,
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
      const pk   = getPeakInfo(startVal, destinationSelect.value);
      seasonBadgeEl.textContent = info.label + (pk.label ? ` · ${pk.label}` : '');
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

/* TJ: 골프 옵션은 **요금이 있는 목적지에서만** 열린다.
   ⚠ 요금이 없는데 옵션만 열어 두면 담당자가 골프를 켜고 인원을 넣어도 금액이 0으로
     조용히 빠진다 — 「넣었는데 왜 안 나오지」가 되고, 더 나쁘게는 골프가 포함된 줄
     알고 견적이 나간다. 그래서 **왜 못 쓰는지 화면이 말한다**(결함 생성기 ②).
   ⚠ 목적지를 바꾸면 골프가 없는 곳으로 갈 수 있다. 그때 **체크를 풀어야** 한다 —
     안 풀면 숨겨진 채 켜져 있다가 다시 골프 되는 목적지로 오면 유령처럼 살아난다. */
function syncGolfAvailability() {
  const chip = document.getElementById('incGolfChip');
  const row  = document.getElementById('golfCountRow');
  const note = document.getElementById('golfNoRateNote');
  const box  = document.getElementById('incGolf');
  if (!chip || !box) return;
  const destKey = document.getElementById('destination')?.value || '';
  const fee = (typeof getGolfFee === 'function' && destKey) ? getGolfFee(destKey) : 0;
  chip.classList.toggle('hidden', !fee);
  if (note) note.classList.toggle('hidden', !(destKey && !fee && box.checked));
  if (!fee && box.checked) box.checked = false;   /* 조용히 켜진 채로 두지 않는다 */
  if (row) row.classList.toggle('hidden', !(fee && box.checked));
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
  /* 🔴 휴양을 고르면 차량·가이드를 **기본으로 끈다**(VV). 실측이 정한 것이다 —
     그 둘은 인원과 무관한 **정액**이라 소수인원에서 1인당으로 나누면 폭발한다.
     오키나와 3박4일 4명: 전부 포함 2,320,246원(소매가 +95.0%) → 둘을 빼면 1,208,446원(+1.6%).
     ⚠ **끄기만 하고 잠그지는 않는다.** 휴양이라도 밴을 부르는 팀이 있다 — 고객이 다시
       켤 수 있어야 한다. 잠그면 「우리는 그 옵션을 안 판다」는 뜻이 되어버린다.
     ⚠ 그리고 **왜 꺼졌는지 반드시 말한다.** 조용히 끄면 고객은 금액이 왜 이렇게
       나왔는지 모르고, 우리도 나중에 그 견적을 설명할 수 없다(결함 생성기 ②). */
  (function attachLeisureDefaults() {
    const prg = document.getElementById('programType');
    if (!prg) return;
    const note = document.getElementById('leisureNote');
    /* 연수에만 있는 일 — 휴양에서는 **자리째 숨긴다**(VX).
       ⚠ 라벨을 바꾸는 것으로는 안 된다. 「기관 방문·섭외 0회」는 이름을 뭐라 붙여도
         가족 손님이 고를 수 있는 것이 아니고, 고를 수 없는 칸이 보이면 그 사람은
         **폼 전체를 남의 것으로 읽는다.** 그게 이 화면의 진짜 문제였다. */
    const TRAINING_ONLY = ['visitModeField', 'agencyVisitRow', 'groupChecklist'];
    const apply = () => {
      const leisure = prg.value === 'leisure';
      ['incVehicle', 'incGuide'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (leisure) {
          /* 사람이 직접 켜 둔 것을 지우지 않는다 — 자동으로 끈 것만 되돌린다 */
          if (el.checked) { el.checked = false; el.dataset.autoOff = '1'; }
        } else if (el.dataset.autoOff) {
          el.checked = true; delete el.dataset.autoOff;
        }
      });
      TRAINING_ONLY.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', leisure);
      });
      /* 숨기는 것으로 끝내지 않는다 — 숨긴 칸의 값이 금액에 남아 있으면
         고객은 자기가 안 고른 비용을 내게 된다(결함 생성기 ②). 0으로 되돌린다. */
      if (leisure) {
        const av = document.getElementById('agencyVisits');
        if (av && Number(av.value) > 0) { av.dataset.autoOff = av.value; av.value = '0'; }
      } else {
        const av = document.getElementById('agencyVisits');
        if (av && av.dataset.autoOff) { av.value = av.dataset.autoOff; delete av.dataset.autoOff; }
      }
      if (note) note.classList.toggle('hidden', !leisure);
      renderLiveBreakdown();
    };
    prg.addEventListener('change', apply);
    apply();   /* 첫 진입에도 맞춘다 — 뒤로가기로 휴양이 선택된 채 열릴 수 있다 */
  })();
  /* TJ: 골프 — 목적지가 바뀔 때마다 쓸 수 있는지 다시 본다 */
  document.getElementById('destination')?.addEventListener('change', syncGolfAvailability);
  document.getElementById('incGolf')?.addEventListener('change', () => {
    syncGolfAvailability(); renderLiveBreakdown();
  });
  ['golfCount','golfRounds'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderLiveBreakdown);
  });
  syncGolfAvailability();
  /* TP: 부대비용 옵션 — 켜는 즉시 금액에 반영된다(고객이 무엇 때문에 늘었는지 봐야 한다) */
  document.getElementById('agencyVisits')?.addEventListener('input', renderLiveBreakdown);
  document.getElementById('incDomestic')?.addEventListener('change', renderLiveBreakdown);

  /* Level 1: 호텔 등급 + 날짜(시즌) */
  document.querySelectorAll('input[name="hotelGrade"]').forEach(r => r.addEventListener('change', renderLiveBreakdown));
  document.getElementById('startDate')?.addEventListener('change', renderLiveBreakdown);

  /* v3: 좌석 등급 + 객실 구성 radio */
  document.querySelectorAll('input[name="cabinClass"]').forEach(r => {
    r.addEventListener('change', function () {
      /* PD: '혼합' 선택 시에만 비즈니스 인원 입력 노출(객실의 vipCountRow와 독립) */
      const bizRow = document.getElementById('bizCountRow');
      if (bizRow) bizRow.classList.toggle('hidden', this.value !== 'mixed');
      renderLiveBreakdown();
    });
  });
  /* PD: 비즈니스 인원 수 변경 */
  document.getElementById('bizCount')?.addEventListener('input', renderLiveBreakdown);
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
    /* ⚠ 예전엔 `:invalid`를 찾아 focus만 했다 — **화면에는 아무 말도 안 나왔다**(XK).
       무엇이 비었는지 그 자리에 적는다. */
    reportMissingField(document.querySelector('.estimate-step[data-step="1"]'));
    return;
  }
  setActiveStep(2);
});

backButton.addEventListener('click', () => {
  setActiveStep(1);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  /* ⚠ 예전엔 첫 빈 칸에 `focus()`만 하고 조용히 돌아갔다 — 고객에게는 「견적 확인하기가
     안 눌린다」로 보인다. 그리고 그 칸이 **감춰진 1단계**에 있으면 focus조차 아무 일도
     안 한다. 이제 그 단계를 열고, 무엇이 비었는지 적는다(XK). */
  if (reportMissingField(form)) return;

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

  /* 2-1. 엑셀 다운로드 버튼도 PDF 버튼과 함께 노출 (신규) */
  if (FEATURE_EXCEL_EXPORT) {
    const xlBtn = document.getElementById('downloadEstimateExcel');
    if (xlBtn) xlBtn.classList.remove('hidden');
  }

  /* 3. 상담 신청 버튼 활성화 */
  const consultBtn = document.getElementById('consultBtn');
  if (consultBtn) {
    consultBtn.classList.remove('hidden');
    consultBtn.classList.add('visible');
  }

  /* 3b. 연수 일정 탐색 버튼 활성화
     QD: 등록된 코스가 없는 목적지(관리자가 새로 추가한 곳)에서는 버튼을 내놓지 않는다.
     예전엔 버튼이 뜨고, 누르면 renderStep3()가 TypeError로 죽어 빈 화면만 남았다.
     보여줄 게 없으면 처음부터 권하지 않는 편이 정직하다. */
  const exploreBtn = document.getElementById('explorePlanBtn');
  if (exploreBtn) {
    const destKeyForIti = destinationSelect.value;
    if (typeof hasItineraryContent === 'function' && !hasItineraryContent(destKeyForIti)) {
      exploreBtn.classList.add('hidden');
    } else {
      exploreBtn.classList.remove('hidden');
      /* Step 3 콘텐츠 미리 준비 */
      renderStep3();
    }
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
      const xlBtnReset = document.getElementById('downloadEstimateExcel');
      if (xlBtnReset) xlBtnReset.classList.add('hidden');
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
    /* 🔴 연락처를 **견적 기록에** 남긴다 (WK). WC가 세 화면에 칸을 넣었지만 그 값은
       「지금 바로 링크를 발급할 때」만 쓰였다. 담당자 도구에서 견적을 저장해 두고
       나중에 관리자 → 견적 관리에서 발급하면, 담당자가 적은 연락처가 어디에도 없어
       대장에 빈 칸으로 쌓였다 — 「담당자가 휴가여도 응대」가 그 건들에서 깨진다.
       ⚠ 이 값은 `quotes.payload`(로그인한 직원만 읽는다)에 들어간다. 고객 견적서
         payload(`shareData`)에는 **여전히 안 들어간다** — 그쪽은 링크만 알면 누구나 본다. */
    const contactTel = document.getElementById('contactTel')?.value.trim() || '';
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
      mealDays:     bd.mealDays,
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
      contactTel,
      request,
      /* v3 신규 — 출발 공항 · 좌석 등급 · 객실 구성 */
      departureCity:      bd.departureCityVal,
      departureCityLabel: bd.departureCityLabel,
      departureFactor:    bd.departureFactor,
      cabinClass:         bd.cabinClassVal,
      cabinClassLabel:    bd.cabinClassLabel,
      bizFactor:          bd.bizFactor,
      /* PD: 혼합 편성 — bizCount(비즈니스 인원)와 노선 원 배율. bizFactor만 저장하면
         가중평균된 값이라 "몇 명이 비즈니스였는지"를 나중에 복원할 수 없다. */
      bizCount:           bd.bizCount,
      bizSeatFactor:      bd.bizSeatFactor,
      roomConfig:         bd.roomConfigVal,
      roomConfigLabel:    bd.roomConfigLabel,
      vipCount:           bd.vipCount,
      /* Level 2: 요율 버전 추적 */
      rateDate:    (getDestinationByKey(destKey)?.rateDate) || '',
      rateVersion: typeof RATE_META !== 'undefined' ? RATE_META.version : '',
      /* 🔴 **이 견적이 어느 요율표로 계산됐는가** (XI). `/api/rates`를 못 받으면 금액이
         data.js 기본값으로 조용히 계산된다 — 실측(2026-08-26, 30명 4일): 오버라이드가
         있는 **23개 목적지 전부**가 움직이고 중앙값 5.9% · 최대 27.3%다. 방향도 갈린다
         (동유럽 −19.5% = 너무 싸게 부른다 · 오키나와 +27.3% = 너무 비싸게 부른다).
         그런데 그 견적은 **저장되고 견적서 링크까지 나갔다** — 서버의 「요율 기준월」
         검사는 오버라이드가 `rateDate`를 함께 갖고 있을 때만 도는데 실제로는
         **23곳 중 2곳뿐**이다(WW가 센 「21곳 59칸」이 그 자리다).
       ⚠ 이건 보안 표식이 아니라 **출처 표식**이다. 조작 방어는 verifyQuote의 다른
         단계들이 한다. 여기 목적은 「기본값으로 계산된 견적을 사람이 알아보게」다. */
      rateSource: (function () {
        const s = window.__RATE_SOURCE__ || {};
        return { state: s.state || 'unknown', n: (s.applied || []).length, fx: s.fx || 0,
                 error: String(s.error || '').slice(0, 80) };
      })(),
      destNotes:   (getDestinationByKey(destKey)?.notes) || '',
      /* P6: 계수 역검증용 스냅샷 — 이 견적 계산 당시의 출발일과 각 계수를 남겨두면,
         나중에 실제 계약가(actual*)와 대조해 어떤 계수(시즌·리드타임·피크·환율·인원)가
         실측과 벌어지는지 역검증해 계수 초안을 자기교정할 수 있다. 요율표·시즌 프로파일은
         이후 바뀌므로 사후 재계산으로는 복원 불가 → 반드시 생성 시점에 스냅샷으로 저장.
         payload jsonb에 그대로 실려 서버/DB 스키마 변경은 필요 없다. 견적 계산엔 무영향. */
      startDate:    document.getElementById('startDate')?.value || '',
      paxFactor:    bd.paxTier?.factor ?? 1,
      seasonId:     bd.seasonInfo?.id || '',
      /* P2b: seasonFactor·leadFactor·peakFactor는 스칼라 노브가 적용된 '실제 반영값'.
         raw는 seasonId 등으로, 당시 노브는 coef로 복원 가능(applied=1+(raw−1)×strength). */
      seasonFactor: bd.seasonFactor ?? 1,
      leadFactor:   bd.leadFactor ?? 1,
      peakFactor:   bd.peakFactor ?? 1,
      peakLabel:    bd.peakLabel || '',
      hotelPeakFactor: bd.hotelPeakFactor ?? 1,  /* P7: 호텔에 실제 적용된 피크 계수 */
      coef:         bd.coef || null,             /* P2b: 이 견적에 반영된 계수 노브 스냅샷 */
      fxAdjust:     bd.fxAdjust ?? 1,
      /* PB/PC: 보험 권역·기간 계수와 관광 일수 계수도 같은 이유로 스냅샷에 남긴다.
         둘 다 코드 상수(INSURANCE_ZONE_FACTORS·SIGHT_DURATION_TIERS)라 나중에 값을
         조정하면 사후 재계산으로는 '이 견적이 당시 어떤 배율을 썼는지'를 복원할 수 없다.
         rows에 금액은 남지만 배율 자체는 남지 않아, 역검증 때 어느 계수가 실측과
         벌어졌는지 분리해 볼 수 없다. */
      insuranceInfo: bd.insuranceInfo || null,   /* PB: {zone, zoneFactor, durationFactor, rate, 라벨} */
      sightDuration: bd.sightDuration || null,   /* PC: {factor, label} */
      status: 'new',  /* new / consulting / contracted / closed */
      note:   '',
      /* 관리자 내부 견적 산출 도구 구분(신규) — 공개 홈페이지에서는 항상 'public'.
         admin-quote.html에서만 window.__INTERNAL_TOOL__/__INTERNAL_STAFF__를 미리
         설정해두고 이 폼을 그대로 재사용한다. 되돌리려면 이 두 줄만 지우면 됨. */
      channel:   window.__INTERNAL_TOOL__ ? 'internal' : 'public',
      createdBy: window.__INTERNAL_TOOL__ ? (window.__INTERNAL_STAFF__ || '') : '',
    };

    const KEY = 'linkedt_estimates_full';
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    arr.push(estRecord);
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-500)));

    /* 이 견적의 id를 기억해뒀다가, 고객이 뒤이어 "상담 신청"을 하면 같은 견적을
       가리키도록 연결한다(신규) — 견적 관리/문의 관리 두 화면이 서로 다른 테이블에
       따로 쌓여 관리자가 같은 고객·같은 건인지 알기 어려웠던 문제 보완 */
    window._lastQuoteId = estRecord.id;
    /* UM: 새 견적이다 — 앞 견적에서 확인한 전용 일정을 여기서 **반드시** 지운다.
       안 지우면 조건만 바꿔 다시 산출했을 때 앞 고객의 일정이 그대로 실려 나간다
       (관리자 화면이 견적을 바꿀 때 편집 상태를 지우는 것과 같은 이유다). */
    quoteItiClear();
    window._lastQuoteSaved = null;
    /* 공유 링크 발급 시 서버가 이 스냅샷으로 검증한다(항목별 단가·적용 계수까지).
       shareData만 보내면 표시용 축약값뿐이라 검증 깊이가 얕아진다. */
    window._lastQuoteRecord = estRecord;

    /* PR: 견적 저장도 같은 경로를 쓴다 — 실패하면 대기열에 남아 다음 방문에 재전송된다.
       ⚠ 여기서는 고객에게 실패를 알리지 않는다. 고객이 요청한 건 '견적 계산'이고 그건
       화면에 이미 나와 있으므로, 서버 저장 실패를 오류로 띄우면 멀쩡한 견적을 못 믿게
       만든다. 상담 신청(리드)과 달리 고객이 답을 기다리는 건이 아니다.
       담당자 쪽 손실은 대기열 재전송과 상담 신청 시 선행 전송으로 메운다.

       ⚠⚠ **그 판단은 고객에게만 맞다** (PX). admin-quote.html은 같은 폼을 재사용하는
       내부 도구라 이 코드가 그대로 도는데, 담당자의 목적은 '견적 계산'이 아니라
       **이 견적을 회사 기록에 남기고 고객에게 보내는 것**이다. 저장이 실패하면 견적
       관리 목록에 나타나지 않고, 나중에 견적서 링크도 발급할 수 없다(링크 발급은 서버에
       저장된 건을 대조한다). 그런데 화면에는 "견적 산출 완료!"만 떴다.
       → 내부 도구에서만 실패를 알린다. */
    const quoteEndpoint = window.__INTERNAL_TOOL__ ? '/api/quotes?action=internal' : '/api/quotes';
    /* UM: 저장 결과를 **약속으로 남긴다.** 산출 화면의 일정 편집은 서버에 저장된
       견적에만 붙일 수 있는데(PATCH /api/quotes/:id), 예전엔 성공 여부를 아무도
       알 수 없었다. 그대로 두면 담당자가 일정을 다 고친 뒤에야 "저장 실패"를 만난다. */
    window._lastQuoteSaved = submitLead(quoteEndpoint, estRecord).then(function (saved) {
      if (!saved && window.__INTERNAL_TOOL__) showInternalSaveWarning();
      return saved;
    });

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
/* 관리자 내부 견적 산출 도구(admin-quote.html)는 직원이 쓰는 페이지라 방문자/
   이벤트 통계에 섞이면 안 됨 — window.__INTERNAL_TOOL__이 설정된 경우 추적을
   통째로 건너뛴다. 되돌리려면 이 한 줄만 지우면 됨. */
(function initTracking() {
  if (window.__INTERNAL_TOOL__) return;
  const VISIT_KEY  = 'linkedt_visits';
  const EVENT_KEY  = 'linkedt_events';
  const DEST_KEY   = 'linkedt_dest_stats';
  const EST_KEY    = 'linkedt_estimates';

  /* 실서버 집계용 전송 (신규) — 실패해도 조용히 무시(로컬 기록은 항상 유지되는 안전망).
     되돌리려면 이 함수와 아래 각 호출 지점의 _postTrack(...) 줄만 지우면 됨. */
  function _postTrack(name, meta) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, meta: meta || {} }),
      }).catch(() => {});
    } catch {}
  }

  function saveVisit() {
    const arr = JSON.parse(localStorage.getItem(VISIT_KEY) || '[]');
    arr.push({ ts: new Date().toISOString() });
    localStorage.setItem(VISIT_KEY, JSON.stringify(arr.slice(-3000)));
    _postTrack('pageview');
  }

  window._trackEvent = function(name) {
    const obj = JSON.parse(localStorage.getItem(EVENT_KEY) || '{}');
    obj[name] = (obj[name] || 0) + 1;
    localStorage.setItem(EVENT_KEY, JSON.stringify(obj));
    _postTrack(name);
  };

  window._trackDest = function(dest) {
    const obj = JSON.parse(localStorage.getItem(DEST_KEY) || '{}');
    obj[dest] = (obj[dest] || 0) + 1;
    localStorage.setItem(DEST_KEY, JSON.stringify(obj));
    _postTrack('dest_select', { dest });
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

/* ══════════════════════════════════════════════════════════════════
   PR — 리드 유실 방지
   ──────────────────────────────────────────────────────────────────
   원래 세 제출 경로(문의 폼·견적 기반 상담 신청·견적 저장)가 모두 이랬다:

     localStorage에 저장
     fetch(...).catch(err => console.warn('서버 저장 실패(로컬에는 저장됨)'))
     화면에 "접수 완료" 표시

   여기에 문제가 세 개 겹쳐 있었다.

   ① **`fetch`는 500에 reject하지 않는다.** `.catch`는 네트워크 단절만 잡는다.
      DB 오류·payload 초과·함수 타임아웃(=`res.ok === false`)은 성공으로 처리됐고
      콘솔 경고조차 남지 않았다. Neon은 유휴 시 슬립하는 서버리스 DB라 콜드스타트
      실패가 실제로 일어날 수 있는 조건이다.
   ② **"로컬에는 저장됨"은 회사 입장에서 위안이 아니다.** localStorage는 *고객의*
      브라우저에 있어 담당자는 영원히 볼 수 없다. 안전망처럼 읽히는 주석이지만
      회사 쪽 데이터 복구 수단이 전혀 아니다.
   ③ **고객에게는 항상 "접수 완료"가 떴다.** 그래서 실패한 리드는 고객이 연락을
      기다리고, 회사는 존재조차 모르는 상태로 조용히 사라진다. 유실 중에서
      최악의 형태다 — 고객은 우리가 무시했다고 느낀다.

   그래서 ㉠ `res.ok`를 확인하고 ㉡ 일시 장애는 백오프 재시도하고 ㉢ 끝내 실패하면
   대기열에 남겨 다음 방문·온라인 복귀 때 자동 재전송하고 ㉣ 그래도 안 되면
   거짓 성공 대신 직접 연락 안내를 띄운다. 전화할 줄 아는 리드는 유실이 아니다.

   ⚠ 재시도가 안전한 근거: `/api/inquiries`·`/api/quotes` 둘 다 클라이언트가 만든
   `id`로 `insert ... on conflict (id) do nothing`을 한다. 같은 레코드를 몇 번
   보내도 중복 리드가 생기지 않는다. **이 성질이 깨지면 재시도가 리드를 복제한다**
   (`ai-loop/test_pR_lead_retry.js`가 두 API의 on-conflict를 회귀로 검사한다).
   ══════════════════════════════════════════════════════════════════ */
const LEAD_QUEUE_KEY = 'linkedt_pending_submits';
const LEAD_QUEUE_MAX = 20;          /* 건수 상한 — 큐가 localStorage를 잡아먹지 않게 */
const LEAD_QUEUE_MAX_BYTES = 512 * 1024;
const LEAD_KEEPALIVE_MAX = 60 * 1024;  /* keepalive 요청 본문 상한(브라우저 규격 64KB) */
const LEAD_MAX_QUEUE_TRIES = 10;

function _leadQueueRead() {
  try {
    const arr = JSON.parse(localStorage.getItem(LEAD_QUEUE_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function _leadQueueWrite(list) {
  try {
    const out = list.slice(-LEAD_QUEUE_MAX);
    /* 용량 초과 시 오래된 것부터 버린다 — 큐 저장이 실패해 본 흐름까지 깨지면 안 된다. */
    while (out.length > 1 && JSON.stringify(out).length > LEAD_QUEUE_MAX_BYTES) out.shift();
    localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(out));
  } catch (err) {
    console.warn('[lead] 대기열 저장 실패(제출 흐름은 계속):', err);
  }
}
function _leadQueuePush(endpoint, record) {
  /* 같은 id는 한 번만 — 고객이 재시도 버튼을 여러 번 눌러도 큐가 부풀지 않는다. */
  const list = _leadQueueRead().filter((x) => x && x.id !== record.id);
  list.push({ endpoint, id: record.id, body: record, at: Date.now(), tries: 0 });
  _leadQueueWrite(list);
}
function _leadQueueDrop(id) {
  _leadQueueWrite(_leadQueueRead().filter((x) => x && x.id !== id));
}

/* 한 번 POST. 실패는 예외로 올리고, 재시도해도 소용없는 실패인지(`permanent`)를 표시한다. */
async function _leadPostOnce(endpoint, record) {
  const body = JSON.stringify(record);
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
  /* 고객이 제출 직후 탭을 닫으면 진행 중 요청이 취소된다 — keepalive면 살아남는다.
     본문이 규격 상한을 넘으면 브라우저가 거부하므로 작은 것만 붙인다. */
  if (body.length < LEAD_KEEPALIVE_MAX) opts.keepalive = true;
  const res = await fetch(endpoint, opts);
  if (!res.ok) {
    const err = new Error('http_' + res.status);
    /* 4xx는 우리 요청이 잘못된 것이라 재시도해도 같은 답이 온다(429는 예외 — 잠깐 기다리면 된다).
       구분하지 않으면 payload 초과 한 건에 매번 3번씩 요청을 낭비한다. */
    err.permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    err.status = res.status;
    throw err;
  }
  return true;
}

/* 제출 본체. 성공하면 true. 실패하면 대기열에 남기고 false — 호출부가 화면 문구를 정한다. */
async function submitLead(endpoint, record, opts) {
  const retries = (opts && opts.retries != null) ? opts.retries : 2;
  const backoff = (opts && opts.backoff != null) ? opts.backoff : 600;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await _leadPostOnce(endpoint, record);
      _leadQueueDrop(record.id);   /* 이전 실패로 큐에 있었다면 정리 */
      return true;
    } catch (err) {
      const last = attempt === retries || err.permanent;
      if (last) {
        _leadQueuePush(endpoint, record);
        console.warn('[lead] 전송 실패 — 대기열에 보관하고 다음 방문에 재전송합니다:', err.message);
        return false;
      }
      await new Promise((r) => setTimeout(r, backoff * Math.pow(2, attempt)));
    }
  }
  return false;
}

/* 대기열 재전송 — 페이지 로드 시 한 번, 온라인 복귀 시. 같은 id를 보내므로 중복이 없다.
   오래 실패한 건은 시도 횟수만 올리고 큐에 남긴다(지우면 그 리드는 완전히 사라진다). */
async function flushLeadQueue() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const list = _leadQueueRead();
  if (!list.length) return;
  for (const item of list) {
    if (!item || !item.endpoint || !item.body) { _leadQueueDrop(item && item.id); continue; }
    if (item.tries >= LEAD_MAX_QUEUE_TRIES) continue;
    try {
      await _leadPostOnce(item.endpoint, item.body);
      _leadQueueDrop(item.id);
      console.info('[lead] 대기 중이던 제출을 재전송했습니다:', item.id);
    } catch (err) {
      /* ⚠ 401은 시도 횟수를 올리지 않는다 (PX) — "지금 세션이 없다"는 뜻이고 로그인한
         뒤에는 성공한다. 내부 산출 견적은 인증이 필요한 `?action=internal`로 가는데,
         담당자가 같은 브라우저로 공개 페이지를 몇 번 열기만 해도 여기서 401이 쌓여
         상한(10회)을 소진하고 **그 견적을 영구히 포기**하게 된다. 그러면 고친 것이
         아니라 유실 경로를 하나 새로 만든 셈이다. */
      if (err.status !== 401) {
        const cur = _leadQueueRead();
        const target = cur.find((x) => x && x.id === item.id);
        if (target) { target.tries = (target.tries || 0) + 1; _leadQueueWrite(cur); }
      }
      if (!err.permanent) break;  /* 서버가 여전히 아프면 나머지도 실패한다 — 다음 기회로 */
    }
  }
}

/* 내부 견적 산출 도구에서 서버 저장이 실패했을 때 담당자에게 보이는 경고 (PX).
   고객용 안내와 문구가 다른 이유: 담당자가 알아야 하는 것은 "연락처"가 아니라
   **지금 이 견적이 회사 기록에 없다는 사실과 그래서 무엇이 안 되는지**다.
   자동으로 사라지지 않게 두고, 요소가 없으면 alert로라도 알린다 — 조용히 넘어가면
   고치기 전과 같아진다. */
function showInternalSaveWarning() {
  const msgLines = [
    '⚠ 이 견적이 서버에 저장되지 않았습니다.',
    '· 견적 관리 목록에 아직 나타나지 않고, 견적서 링크 발급도 할 수 없습니다.',
    '· 화면의 견적·PDF·엑셀은 정상입니다(계산은 이 브라우저에서 끝났습니다).',
    '· 이 브라우저로 다시 접속하면 자동으로 재전송됩니다. 그때까지 브라우저 데이터를 지우지 마세요.',
    '· 급하면 관리자 → 견적 관리에서 목록에 올라왔는지 확인해 주세요.',
  ];
  const el = typeof document !== 'undefined' ? document.getElementById('aqSaveWarn') : null;
  if (!el) { if (typeof alert === 'function') alert(msgLines.join('\n')); return; }
  el.textContent = '';
  msgLines.forEach(function (line, i) {
    if (i) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
  el.classList.remove('hidden');
}

/* 최종 실패 시 고객에게 보여줄 안내. 거짓 성공을 띄우지 않는 것이 핵심이고,
   전화·이메일을 같이 줘서 리드가 스스로 살아남을 길을 남긴다. */
function leadFailureHtml() {
  const info = window.COMPANY_INFO || {};
  const tel = info.tel || '02-2088-4253';
  const email = info.email || 'skp1004651@hanatrabiz.com';
  return '접수 중 오류가 발생했습니다. 잠시 후 자동으로 다시 시도하지만, '
    + '빠른 상담을 원하시면 <strong>' + tel + '</strong> 또는 '
    + '<a href="mailto:' + email + '" style="text-decoration:underline">' + email + '</a>'
    + '로 직접 연락 주세요.';
}

/* 성공/실패 문구를 같은 자리에 표시한다. 실패는 자동으로 사라지지 않게 둔다 —
   고객이 못 보고 지나가면 안내한 의미가 없다. */
function showLeadResult(okEl, ok) {
  if (!okEl) return;
  if (ok) {
    okEl.innerHTML = okEl.dataset.successHtml || okEl.innerHTML;
    okEl.style.color = '';
    okEl.classList.remove('hidden');
    return;
  }
  if (!okEl.dataset.successHtml) okEl.dataset.successHtml = okEl.innerHTML;
  okEl.innerHTML = leadFailureHtml();
  okEl.style.color = 'var(--danger, #dc2626)';
  okEl.classList.remove('hidden');
}

window.addEventListener('online', () => { flushLeadQueue(); });
/* 로드 직후가 아니라 살짝 미뤄서 첫 화면 렌더와 경쟁하지 않게 한다. */
setTimeout(() => { flushLeadQueue(); }, 3000);

/* ══ 「패키지 여행」 카드는 **실제로 파는 것이 있을 때만** 그렇게 말한다 (XN) ══════
   2026-08-26 프로덕션 실측: 고객이 보는 패키지 목록이 **0건**이다(대기열 P-1).
   그 상태에서 첫 화면은 「고르시면 일정표와 견적서를 그 자리에서 만들어 드립니다」라고
   권하고 있었다 — 누르면 빈 목록이다. **없는 것을 있는 것처럼 권하지 않는다.**
 ⚠ 상품이 생기면 저절로 원래 문구로 돌아온다(그리고 개수를 말한다). 사람이 되돌리는
   일을 남기면 그 일은 잊힌다.
 ⚠ 못 받았을 때는 **아무것도 바꾸지 않는다.** 네트워크가 잠깐 안 될 때 「준비 중」이라고
   말하면 그게 더 나쁜 거짓말이다(조용한 폴백을 만들지 않는다 — 결함 생성기 ②).
 ⚠ 첫 화면을 막지 않는다. 늦게 도착하면 그때 글자만 바뀐다. */
(function reflectPackageStock() {
  const card = document.getElementById('trackPkg');
  if (!card || typeof fetch !== 'function') return;
  fetch('/api/content?action=packages')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !Array.isArray(d.packages)) return;      /* 모르면 그대로 둔다 */
      const n = d.packages.length;
      const tag = document.getElementById('trackPkgTag');
      const desc = document.getElementById('trackPkgDesc');
      const go = document.getElementById('trackPkgGo');
      if (n > 0) {
        if (tag) tag.textContent = '패키지 여행 · ' + n + '개 상품';
        return;
      }
      /* 0건 — 솔직하게 말하고, **할 수 있는 다음 걸음**으로 보낸다 */
      card.setAttribute('href', '#estimate');
      if (tag) tag.textContent = '패키지 여행 · 준비 중';
      if (desc) {
        desc.innerHTML = '지금은 열려 있는 패키지 상품이 없습니다. '
          + '<b>원하시는 지역·일정</b>을 알려 주시면 같은 팀이 그대로 맞춰 드립니다.';
      }
      if (go) go.textContent = '원하는 일정으로 견적 받기 →';
    })
    .catch(() => { /* 모르면 그대로 둔다 */ });
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

    /* 폼은 즉시 비운다 — 전송 결과를 기다리는 동안 고객이 다시 누르는 것을 막고,
       실패해도 내용은 위의 localStorage와 대기열에 남아 있어 잃지 않는다. */
    inqForm.reset();
    submitLead('/api/inquiries', record).then((ok) => {
      showLeadResult(inqSuccess, ok);
      /* 성공만 자동으로 숨긴다. 실패 안내는 고객이 읽고 조치할 수 있게 남겨둔다. */
      if (ok) setTimeout(() => inqSuccess.classList.add('hidden'), 5000);
    });
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
    linkedQuoteId: window._lastQuoteId || null,  /* 같은 견적을 가리키는 quotes 레코드 id (신규) */
    estimate:  bd ? {
      destLabel,
      participants:  bd.participants,
      days:          bd.days,
      nights:        bd.nights,
      mealDays:      bd.mealDays,
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

  if (nameEl) nameEl.value = '';
  if (telEl)  telEl.value  = '';

  if (typeof _trackEvent !== 'undefined') _trackEvent('consult_request');

  /* 이 문의는 `linkedQuoteId`로 견적 레코드를 가리킨다. 그 견적 저장이 실패해 대기열에
     남아 있으면 관리자 화면에서 존재하지 않는 견적을 가리키게 되므로, 리드를 보내기
     전에 대기열을 먼저 비운다(한 건당 1회 시도라 오래 걸리지 않는다). */
  flushLeadQueue().then(() => submitLead('/api/inquiries', record)).then((ok) => {
    showLeadResult(okEl, ok);
    /* 실패했으면 폼을 닫지 않는다 — 닫아버리면 안내 문구가 같이 사라져서
       고객은 접수된 줄 알고 기다리게 된다(원래 결함과 같은 결과가 된다). */
    if (!ok) return;
    setTimeout(() => {
      if (okEl) okEl.classList.add('hidden');
      closeConsultForm();
    }, 3500);
  });
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
   일정 데이터베이스(ITINERARY_DB)와 코스 우선순위(PROGRAM_PRIORITY)는
   **data.js로 옮겼다** (QB). 관리자 화면이 같은 표를 읽어 직원이 일정을 편집할 수
   있어야 하는데 admin.html은 script.js를 싣지 않기 때문이다. 여기서는 전역으로
   그대로 보인다(같은 문서의 classic script는 전역 렉시컬 스코프를 공유한다).
   운영 값은 DB의 itinerary_overrides가 덮어쓴다 — applyItineraryOverrides() 참고.
   ════════════════════════════════════════════════════════════════════ */

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

/* QD: 이 목적지에 보여줄 코스가 실제로 있는가.
   내장 55곳은 전부 있지만, **관리자가 요율 관리에서 추가한 신규 목적지는 없다**
   (`data.js`가 아니라 DB의 custom_destinations에 있으므로 ITINERARY_DB에 자리가 없다).
   담당자가 관리자 → 일정 관리에서 코스를 만들어 저장하면 그때 생긴다. */
function hasItineraryContent(destKey) {
  /* UR: **고객에게 실제로 나갈 수 있는** 코스가 있는가를 묻는 자리다. 배열 길이만
     세면 검토 전(UQ)만 남은 목적지에서 "있다"고 답하고, 바로 아래 getItineraries가
     빈 목록을 받아 그 자리에서 터진다 — 재현 확인했다.
     ⚠ 거르는 함수는 **getItineraries와 같은 것**을 쓴다. recVisibleCourses로 따로
       세면 「있다」와 「무엇이 나가는가」가 다른 규칙을 보게 되고, 그 어긋남이 바로
       이 저장소가 반복해 겪은 사고다(결함 생성기 ①). test_tC가 그래서 여기를 본다. */
  return typeof ITINERARY_DB !== 'undefined'
    && Array.isArray(ITINERARY_DB[destKey])
    && recPreferQuoteCourses(ITINERARY_DB[destKey]).length > 0;
}

/* 동기 버전 — 코스가 없으면 null. 예전엔 `ITINERARY_DB[destKey]`를 그대로 받아
   `courses.length`를 읽어서, 신규 목적지에서는 **TypeError로 견적서 만들기와 일정
   탐색이 통째로 터졌다**(재현 확인). 여기서 null을 돌려주고, 부르는 쪽이 일정 없이도
   견적서를 낼 수 있게 한다. */
/* ══ UM: 이 견적서 전용 일정 (2026-08-19 대표 지시) ══════════════════════
   내부 견적 산출 화면에서 담당자가 확인·저장한 일정을 담아 둔다. 견적서 문서와
   공유 페이로드가 이 값을 **그대로** 싣는다(위 recQuoteItinerary 호출부).

   ⚠ 값을 여기 한 곳에만 둔다. 화면마다 제 변수를 두면 「PDF에 실린 일정」과
     「화면이 보여준 일정」이 갈라진다.
   ⚠ quoteId를 함께 들고 다니는 이유 — 이 값이 **어느 견적의 것인지 증명되지 않으면
     쓰면 안 된다.** 조건을 고쳐 다시 산출한 뒤에도 남아 있으면 앞 고객의 일정이
     이 견적서에 실린다.
   고객 계산기(index.html)에서는 아무도 이 함수를 부르지 않는다 → 늘 비어 있다. */
function quoteItiSet(quoteId, itinerary) {
  if (!quoteId || !itinerary || !Array.isArray(itinerary.courses) || !itinerary.courses.length) {
    quoteItiClear();
    return null;
  }
  window.__QUOTE_ITI__ = {
    quoteId: quoteId,
    courses: itinerary.courses,
    days: itinerary.days == null ? null : Number(itinerary.days),
    confirmedBy: String(itinerary.confirmedBy || ''),
  };
  return window.__QUOTE_ITI__;
}

function quoteItiClear() { window.__QUOTE_ITI__ = null; }

function getItineraries(destKey, programType) {
  if (!hasItineraryContent(destKey)) return null;
  /* TC: 견적서에서 읽은 일정이 있으면 **그것만** 쓴다(2026-08-11 대표 요청).
     규칙은 rec_fallbacks.js 한 곳에 있다 — 여기 다시 적으면 일정 탐색과 견적서가
     서로 다른 일정을 보여준다(RR에서 실제로 겪은 사고다). */
  const courses = recPreferQuoteCourses(ITINERARY_DB[destKey]);

  /* 프로그램 유형 기반 우선순위 적용.
     ⚠ 규칙은 rec_fallbacks.js가 안다 (RK) — 관리자 화면도 **같은 함수**를 불러
     "이 코스는 어떤 유형에서 방식 A로 나가는가"를 배지로 보여준다. 여기 다시 적으면
     두 화면이 다른 매핑을 말하게 되고, 그게 담당자가 두 화면을 못 맞추던 원인이었다. */
  const idx = recResolvePlanCourseIdx(courses.length, PROGRAM_PRIORITY[destKey], programType);
  /* UR: 고를 코스가 하나도 없으면 **null**이다. 예전엔 idx가 null인 채로 idx[0]을
     읽어 TypeError를 냈고, 그러면 견적 만들기와 일정 탐색이 통째로 죽는다. 위
     hasItineraryContent가 먼저 막지만 그것 하나에 기대지 않는다 — 이 함수는 다른
     경로에서도 불린다(결함 생성기 ③: 안전망이 하나뿐이면 그게 곧 단일 지점이다). */
  if (!idx) return null;
  return [courses[idx[0]], courses[idx[1]]];
}

/* ITINERARY_DB의 코스는 전부 "5일 고정"(마지막 날 = 귀국 콘텐츠)으로 작성되어 있음.
   실제 선택 일수(totalDays)가 5보다 크거나 작을 때, 마지막 날(귀국) 콘텐츠가 항상
   실제 마지막 날에만 나오도록 재배치하고, 5일보다 긴 경우 사이 날짜는 DEST_REC/
   highlights 기반 콘텐츠로 채운다. (기존엔 5일 초과 시 DB의 5일차 "귀국" 콘텐츠가
   중간 날짜에 그대로 노출되어 "왜 갑자기 공항으로 복귀하냐"는 문제가 있었음) */
function _buildDisplayDays(course, destKey, plan, totalDays) {
  /* ⚠ 규칙은 rec_fallbacks.js가 안다 (RR). 관리자 미리보기가 **같은 함수**를 불러
     "여기 쓴 오전·오후·저녁이 고객에게 어떻게 보이는가"를 그대로 보여준다.
     여기 다시 적으면 두 화면이 다른 일정을 말하게 된다(결함 생성기 ①). */
  const rec  = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  const pRec = rec ? rec[plan] : null;
  /* 코스에 일자가 하나도 없으면 예전엔 **빈 배열**을 돌려줬다. 그러면 견적서는 일정
     섹션을 제목만 남기고 텅 비게 내보내는데, 같은 목적지의 '연수 일정 탐색'은 자동
     생성 일정을 보여줬다 — 두 고객 화면이 서로 다른 말을 했다. 이제 양쪽 다 같은
     자동 일정으로 채운다(recBuildDisplayDays가 그 경우를 안다). */
  return recBuildDisplayDays(course, pRec ? pRec.items : null, totalDays, destKey);
}

/* ════════════════════════════════════════════════════════════════════
   엑셀 견적서 다운로드 (신규 기능 — FEATURE_EXCEL_EXPORT)
   되돌리기: 이 함수 전체와 index.html의 #downloadEstimateExcel 버튼,
   SheetJS <script> 태그, 파일 상단의 FEATURE_EXCEL_EXPORT 선언만 지우면
   도입 이전 상태로 완전히 복구됨(openEstimateWindow 등 기존 로직은 무관).
   ════════════════════════════════════════════════════════════════════ */
function downloadEstimateExcel() {
  if (!FEATURE_EXCEL_EXPORT) return;
  /* ⚠ 예전엔 여기서 `XLSX`가 없으면 「잠시 후 다시 시도해 주세요」로 끝났다. 그 파일은
     남의 CDN에서 오고, 기관·대기업 망에서는 막혀 있는 경우가 흔하다 — 그런 고객에게
     「잠시 후」는 거짓말이고, 결재에 붙일 파일을 영영 못 받는다(XK).
     이제 `sheet_download.js`가 엑셀/CSV를 갈라 준다. 그 파일은 **우리 것이라 늘 있다.** */
  if (typeof downloadSheet !== 'function') {
    alert('다운로드 기능을 불러오지 못했습니다. 화면의 「견적서 확인하기」로 인쇄·PDF 저장하실 수 있습니다.');
    return;
  }
  const data = getBreakdownData();
  if (!data) { alert('먼저 견적 정보를 입력해 주세요.'); return; }

  const destText     = destinationSelect.selectedOptions[0]?.textContent || '—';
  const programText  = document.getElementById('programType').selectedOptions[0].textContent;
  const orgTypeText  = document.getElementById('organizationType').selectedOptions[0].textContent;
  const participants = document.getElementById('participants').value;
  const days         = Number(document.getElementById('days').value) || 5;
  const organization = document.getElementById('organization')?.value.trim() || '—';
  const contactName  = document.getElementById('contactName')?.value.trim() || '—';
  const issueDate    = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });

  const CI = window.COMPANY_INFO || {};
  const legalName = CI.legalName || '(주)하나이엔비티';
  const rows = data.rows.filter(r => !r.muted);

  const aoa = [
    [legalName + ' 견적서'],
    ['발행일', issueDate],
    ['목적지', destText],
    ['프로그램', programText],
    ['기관 유형', orgTypeText],
    ['참가 인원', participants + '명'],
    ['연수 기간', days + '일'],
    ['신청 기관', organization],
    ['담당자', contactName],
    [],
    ['항목', '금액(원)'],
    ...rows.map(r => [r.name, r.amount]),
    [],
    ['합계', data.total],
    ['1인당 금액', data.perPerson],
  ];

  const fileDate = new Date().toISOString().slice(0, 10);
  /* 🔴 엑셀 라이브러리(남의 CDN)가 막혀 있어도 **파일은 나간다** — CSV로 떨어진다(XK).
     가르는 규칙과 안내 문구는 `sheet_download.js` 한 곳에 있다. 여기서 또 적으면
     견적서 화면과 계산기가 서로 다른 말을 하게 된다(결함 생성기 ①). */
  sayAfterDownload(downloadSheet(aoa, `비즈페이지_견적서_${destText}_${fileDate}`, { sheetName: '견적서' }));
}

/* ════════════════════════════════════════════════════════════════════
   견적서 확인 창 열기 (PDF → 웹 브라우저 창)
   ════════════════════════════════════════════════════════════════════ */
function openEstimateWindow() {
  const data = getBreakdownData();
  if (!data) { alert('먼저 견적 정보를 입력해 주세요.'); return; }

  /* 회사 정보(company-info.js) — 없으면 기존 하드코딩 값으로 폴백 */
  const CI = window.COMPANY_INFO || {};
  const ciLegalName = CI.legalName || '(주)하나이엔비티';
  const ciTel       = CI.tel       || '02-2088-4253';
  const ciAddress   = CI.address   || '서울 금천구 시흥대로73길 67, 1012호';
  const ciEmail     = CI.email     || 'skp1004651@hanatrabiz.com';

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

  /* 일정 추천
     ⚠ 예전엔 `getItineraries(...) || [ITINERARY_DB[destKey][0], …]`였는데, 폴백 쪽도
     같은 undefined를 인덱싱해서 **신규 목적지에서는 여기서 TypeError가 났다.**
     견적 금액은 멀쩡히 계산된 뒤 견적서 만들기만 터지므로 담당자 입장에서는
     "버튼이 안 먹는다"로 보인다. 일정이 없으면 그 섹션만 빼고 견적서를 낸다. */
  /* ⚠ 조립은 rec_fallbacks.js의 recQuoteItinerary 한 곳이 안다 (UI).
     관리자 화면(견적 관리 → 견적서 링크 발급)이 **같은 함수**를 불러 같은 일정을 싣는다.
     여기 다시 적으면 고객 계산기로 나간 견적서와 직원이 발급한 견적서가 서로 다른
     일정을 말하게 된다 — 실제로 그 상태였다(직원 쪽은 아예 비어 있었다).
     일수 재배치(코스는 전부 5일 고정이라 귀국일이 중간에 나오던 것)도 그 안에 있다. */
  /* UM (2026-08-19 대표 지시): **이 견적서 전용 일정이 있으면 그것이 나간다.**
     예전엔 이 자리에 savedCourses를 아예 안 넘겼다. 그래서 담당자가 견적서별 일정을
     정성껏 고쳐 저장해도 **산출 화면에서 뽑은 견적서에는 실릴 수 없었다** — 늘 목적지
     공통(대부분 아무도 손 안 댄 기본값)이 나갔다. 화면을 아무리 고쳐도 여기가 그대로면
     아무 소용이 없다.
     ⚠ 고객 계산기(index.html)에서는 __QUOTE_ITI__가 늘 없다 → 동작 불변.
     ⚠ **id가 다르면 쓰지 않는다.** 담당자가 조건을 고쳐 다시 산출하면 견적이 새로
       만들어지는데, 앞 견적에서 확인한 일정이 그대로 따라가면 **다른 고객의 일정이
       이 견적서에 실린다.** 지우는 쪽(아래 quoteItiClear)과 여기, 두 겹으로 막는다. */
  const _qIti = (typeof window !== 'undefined' && window.__QUOTE_ITI__) || null;
  const _qItiOk = !!(_qIti && _qIti.quoteId && _qIti.quoteId === window._lastQuoteId
                     && Array.isArray(_qIti.courses) && _qIti.courses.length);
  const itiSnap = recQuoteItinerary({
    itineraryDb: typeof ITINERARY_DB    !== 'undefined' ? ITINERARY_DB    : null,
    priority:    typeof PROGRAM_PRIORITY !== 'undefined' ? PROGRAM_PRIORITY : null,
    destRec:     typeof DEST_REC        !== 'undefined' ? DEST_REC        : null,
    savedCourses: _qItiOk ? _qIti.courses : null,
    savedDays:    _qItiOk ? _qIti.days    : null,
  }, { destKey, programType, totalDays: days });

  const hasIti = !!itiSnap;
  /* UO: 작성자가 코스를 하나만 골랐으면 그 하나만 나간다. 판단은 rec_fallbacks가
     하고(single), 여기서는 그 결과를 그대로 따른다 — 여기서 다시 세면 견적서와
     편집기가 서로 다른 개수를 말한다. */
  const itiSingle = hasIti && itiSnap.single;
  const itiA = hasIti ? itiSnap.courses[0] : null;
  const itiB = (hasIti && !itiSingle) ? itiSnap.courses[1] : null;
  const itiADisplayDays = hasIti ? itiSnap.a.d : [];
  const itiBDisplayDays = (hasIti && itiSnap.b) ? itiSnap.b.d : [];

  /* 조용히 빠뜨리지 않는다 — 담당자가 관리자 → 일정 관리에서 이 목적지의 코스를
     만들면 다음 견적서부터 섹션이 살아난다(결함 생성기 ②). */
  if (!hasIti) {
    console.warn('[견적서] "' + destKey + '"에 등록된 추천 일정이 없어 일정 섹션을 빼고 만듭니다. '
      + '관리자 → 일정 관리에서 코스를 추가하면 다음 견적서부터 포함됩니다.');
    if (window.__ITINERARY_SOURCE__) {
      window.__ITINERARY_SOURCE__.missingOnQuote =
        (window.__ITINERARY_SOURCE__.missingOnQuote || []).concat(destKey);
    }
  }

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
    /* 좌석 등급·객실 구성·출발 공항 — 항공료·호텔비를 가장 크게 좌우하는 조건인데
       그동안 공유 견적서에 실리지 않았다. 비즈니스는 이코노미의 2.5~4배(PD 혼합이면
       그 사이 임의 값)라, 금액이 어느 좌석 기준인지 문서에 남지 않으면 분쟁 소지가 된다.
       키를 짧게 쓰는 이유: 이 객체는 base64로 URL에 실리므로 길이가 곧 링크 길이다. */
    ccl: data.cabinClassLabel,
    rcl: data.roomConfigLabel,
    dcl: data.departureCityLabel,
    t: data.total, pp: data.perPerson,
    iso: new Date().toISOString().slice(0, 10), /* 유효기간 계산용 */
    id: issueDate,
    rd: rateDate, rv: rateVer,
    rows: data.rows.filter(r => !r.muted).map(r => [r.name, r.amount]),
    req: requestDetails.slice(0, 300),
    /* 일정이 없으면 아예 싣지 않는다. estimate-view.html은 `d.itiA || d.itiB`로
       섹션 자체를 감싸고 있어 빠져도 정상 렌더된다(공유 견적서 확인). */
    itiA: hasIti ? itiSnap.a : null,
    itiB: hasIti ? itiSnap.b : null,
    cover: destPhotos ? destPhotos.cover : '',
    strip: destPhotos ? destPhotos.strip.slice(0, 2) : [],
    sp: selectedPlan,
  };
  /* ?d= base64 링크 제거 (2026-07-29) — 예전엔 견적 내용을 통째로 URL에 실어
     estimate-view.html이 그대로 렌더했다. 서버를 안 거치므로 **누구든 우리 도메인에
     임의 금액의 견적서를 만들 수 있었고**, 발급 기록도 없어 나중에 대조가 불가능했다.
     이제 링크는 서버가 검증을 통과시킨 뒤에만 발급한다(api/quote-shares).
     발급 전까지 입력칸은 '검증 중' 상태로 둔다. */
  const shareUrl = '';

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

  /* 일정 글은 담당자가 관리자 화면에서 저장한 값이다. 이 문서는 문자열로 조립되므로
     그대로 끼워 넣으면 저장한 한 줄이 고객 견적서에서 실행된다(결함 생성기 ④).
     ⚠ 연수 일정 탐색 쪽은 DOM(textContent)으로 붙어 이 문제가 없는데, 견적서만
     문자열이라 여기서 막는다 — 같은 데이터가 두 화면으로 나가므로 둘 다 막아야 한다. */
  const _e = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function renderDays(displayDays) {
    return displayDays.map(d => `
      <div class="day-card">
        <div class="day-hd">
          <span class="day-num">DAY ${Number(d.day) || 0}</span>
          <span class="day-title">${_e(d.title)}</span>
        </div>
        <div class="day-sched">
          <span class="sched-t">오전</span><span>${_e(d.am)}</span>
          <span class="sched-t">오후</span><span>${_e(d.pm)}</span>
          <span class="sched-t">저녁</span><span>${_e(d.eve)}</span>
        </div>
        ${d.tip ? `<div class="day-tip">현장 Tip · ${_e(d.tip)}</div>` : ''}
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
/* ── 견적 검증 중 표시 ──────────────────────────────────────────
   서버가 견적을 대조하는 동안 보이는 상태. 스피너 대신 잔잔하게 도는 링과
   안쪽에서 천천히 숨 쉬는 점으로, '기다리게 만드는 로딩'이 아니라 '뒤에서
   확인하는 중'으로 읽히게 했다. 브랜드 레드는 점에만 쓰고 링은 옅게 둔다.
   prefers-reduced-motion이면 움직임을 멈추고 정지 상태로 보여준다. */
.bp-verify-orb{position:relative;flex-shrink:0;width:34px;height:34px;display:inline-block}
.bp-verify-orb::before{content:'';position:absolute;inset:0;border-radius:50%;
  border:2px solid #E5E2DC;border-top-color:#CC001A;animation:bpVerifySpin 1.15s linear infinite}
.bp-verify-orb::after{content:'';position:absolute;inset:12px;border-radius:50%;
  background:#CC001A;opacity:.85;animation:bpVerifyPulse 1.9s ease-in-out infinite}
@keyframes bpVerifySpin{to{transform:rotate(360deg)}}
@keyframes bpVerifyPulse{0%,100%{transform:scale(.7);opacity:.45}50%{transform:scale(1);opacity:.9}}
@media (prefers-reduced-motion:reduce){
  .bp-verify-orb::before{animation:none;border-top-color:#CC001A}
  .bp-verify-orb::after{animation:none;transform:scale(.85);opacity:.8}
}
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
.brand-sub{font-size:11px;color:#6E6E6E;margin-top:2px}
.meta-blk{text-align:right;font-size:12px;color:#5A5A5A;line-height:1.8}
.meta-blk .issue{font-size:14px;font-weight:700;color:#0D0D0D}
/* 견적번호 — 전화가 왔을 때 고객이 부를 수 있는 유일한 이름이라 인쇄에도 남는다(XP 후속) */
.meta-blk .issue-qno{font-size:12px;font-weight:700;color:#CC001A;letter-spacing:.02em}
.sec-title{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6E6E6E;border-bottom:1px solid #F0F0F0;padding-bottom:6px;margin-bottom:10px;margin-top:22px}
.info-tbl{width:100%;border-collapse:collapse;margin-bottom:4px}
.info-tbl td{padding:7px 10px;font-size:13px;border-bottom:1px solid #FAFAFA}
.info-tbl td:first-child{width:110px;font-weight:600;color:#5A5A5A;white-space:nowrap}
.inc-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.inc-tag{background:#FEF0F2;color:#111111;padding:4px 12px;border-radius:0;font-size:12px;font-weight:600}
.totals-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px 0}
.t-card{padding:18px 22px;border-radius:0;background:#F4F4F4;border-left:4px solid #111111}
.t-card.per{background:#FEF0F2;border-left-color:#CC001A}
.t-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#6E6E6E;margin-bottom:3px}
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
.rec-tab{padding:12px 24px;border:none;border-bottom:3px solid transparent;background:transparent;color:#6E6E6E;font-size:13px;font-weight:700;cursor:pointer;transition:color .2s,border-color .2s;margin-bottom:-2px;letter-spacing:.01em;white-space:nowrap}
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
.sched-t{color:#6E6E6E;font-size:11px;font-weight:700;text-transform:uppercase;padding-top:2px}
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
.gallery-label{font-size:10px;font-weight:700;letter-spacing:.12em;color:#6E6E6E;margin-top:26px;margin-bottom:8px;text-transform:uppercase}
/* ── PARTICIPANT GUIDE ── */
.participant-guide{background:#F8F7F5;border-left:4px solid #111111;padding:20px 24px;margin-top:22px}
.pg-eyebrow{font-size:10px;font-weight:700;letter-spacing:.12em;color:#6E6E6E;margin-bottom:6px;text-transform:uppercase}
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
  /* ── UI: 제안 일정을 인쇄에 싣는다 ──
     예전엔 이 섹션 전체가 no-print라 **PDF로 뽑으면 일정이 사라졌다.** 고객이 결재
     보고에 쓰는 건 화면이 아니라 그 PDF다. 담당자가 공들여 다듬은 일정이 정작
     의사결정 문서에는 한 줄도 안 실리고 있었다.
     인쇄에서는 탭으로 전환할 수 없으므로 **선택된 코스 한 벌만** 나간다(화면에서
     담당자가 고른 그것이다). 사진·갤러리는 뺀다 — 잉크만 먹고 내용이 없다. */
  #rec{page-break-before:always;padding-top:0}
  .rec-tabs{display:none!important}
  .course-cover-img,.dest-gallery,.gallery-label{display:none!important}
  .day-card{box-shadow:none;border:1px solid #E5E2DC;border-left:3px solid #CC001A;
    page-break-inside:avoid}
  .participant-guide{page-break-inside:avoid}
}
@media(max-width:600px){
  .page-wrap{padding:20px 16px 60px}
  .quote-doc{padding:24px}
  .totals-row{grid-template-columns:1fr}
  .top-nav{padding:12px 16px}
  .nav-brand{font-size:13px}
  /* ── RH: 휴대폰에서 견적서가 가로로 삐져나오던 것 ──
     코스 탭 두 개가 한 줄에 나란히 있고 제목까지 nowrap이라, 390px 화면에서
     **오른쪽으로 289px** 밀려났다(실측). 고객이 결재 보고용으로 받아 보는 문서라
     가로 스크롤이 생기면 그 자체로 신뢰를 깎는다.
     탭 줄을 세로로 세우고 제목이 줄바꿈되게 한다 — 가로 스크롤 대신 세로로 쌓으면
     "코스 B가 있는 줄 몰랐다"도 함께 막힌다(가로 스크롤은 놓치기 쉽다). */
  .rec-tabs{flex-direction:column;border-bottom:none;gap:6px}
  .rec-tab{font-size:12px;padding:10px 12px;white-space:normal;text-align:left;
    border:1px solid #EBEBEB;border-bottom:3px solid #EBEBEB;margin-bottom:0}
  .rec-tab.active{border-color:#CC001A}
  /* 상단 바도 13px 넘쳤다 — 자리가 없으면 버튼 줄을 아래로 내린다 */
  .top-nav{flex-wrap:wrap;row-gap:8px}
  .nav-btns{flex-shrink:1;flex-wrap:wrap}
}
</style>
</head>
<body>

<!-- NAV (no-print) -->
<nav class="top-nav no-print">
  <!-- ⚠ 인라인 style에 color를 두지 말 것. 예전엔 여기 \`color:inherit\`이 있어서
     .nav-brand{color:#fff}를 덮어썼고, 검은 머리줄(#0A0A0A) 위에 본문 검정(#0D0D0D)이
     찍혀 **글자가 안 보였다**(대비 1.02:1). 고객이 받아 보는 문서다.
     ai-loop/check_contrast.py가 이걸 찾아냈다. -->
<a href="${base}" class="nav-brand" style="text-decoration:none;cursor:pointer">비즈페이지 · 해외연수 견적서</a>
  <div class="nav-btns">
    <button class="btn-share" onclick="document.getElementById('share-modal').style.display='flex'"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>고객 링크 공유</button>
    <button class="btn-print" onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>견적서 인쇄</button>
    <button class="btn-close" onclick="window.close()">&times; 닫기</button>
  </div>
</nav>

<!-- 공유 모달 (no-print) -->
<div id="share-modal" class="no-print" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.7);align-items:center;justify-content:center">
  <div style="background:#fff;width:min(560px,92vw);padding:36px 32px;position:relative">
    <button onclick="document.getElementById('share-modal').style.display='none'" style="position:absolute;top:16px;right:20px;background:none;border:none;font-size:20px;cursor:pointer;color:#6E6E6E">&times;</button>
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#CC001A;margin-bottom:8px">SHARE</div>
    <h3 style="font-size:18px;font-weight:800;margin-bottom:6px">고객 견적서 링크 공유</h3>
    <p style="font-size:13px;color:#5A5A5A;margin-bottom:20px">아래 링크를 고객에게 카카오톡·이메일로 전달하세요.<br>고객은 링크에서 견적 확인·출력·상담 신청을 바로 할 수 있습니다.</p>
    <!-- 검증 중 → 발급 완료 / 담당자 확인 3상태. 초기값은 검증 중이며
         openEstimateWindow()의 발급 요청 결과에 따라 교체된다. -->
    <div id="share-verifying" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;background:#FAFAF8;border:1.5px solid #E5E2DC">
        <span class="bp-verify-orb" aria-hidden="true"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#0D0D0D;margin-bottom:3px">견적 내용을 확인하고 있습니다</div>
          <div id="share-verify-step" style="font-size:11.5px;color:#7A7A7A">요율표 대조 중…</div>
        </div>
      </div>
    </div>
    <div id="share-ready" style="display:none;gap:8px;margin-bottom:16px">
      <input id="share-url-inp" value="" readonly style="flex:1;padding:10px 14px;border:1.5px solid #E5E2DC;font-size:12px;outline:none;background:#FAFAFA;color:#0D0D0D">
      <button id="copy-btn" onclick="shareCopyLink()" style="background:#CC001A;color:#fff;border:none;padding:10px 20px;font-weight:700;cursor:pointer;white-space:nowrap;font-size:13px">링크 복사</button>
    </div>
    <!-- 🔴 **복사가 안 되는 브라우저가 있다** (XL). 예전 코드는 clipboard API 하나만
         불렀다. 그런데 navigator.clipboard는 **https가 아니거나 카카오톡 인앱
         브라우저 같은 곳에서는 아예 없다.** 우리 고객은 견적서 링크를 **카톡으로 받아
         카톡에서 연다** — 하필 가장 흔한 자리에서 이 버튼이 **아무 반응 없이 죽었다.**
         게다가 catch도 없어서 실패하면 조용했다(결함 생성기 ②).
         → 세 겹: ① 표준 API ② 옛 execCommand ③ **주소를 선택해 주고 「길게 눌러
           복사해 주세요」라고 말한다.** 안 되면 안 된다고 말하는 것이 마지막 겹이다.
         ⚠ 이 문서는 통째로 템플릿 문자열이다 — 여기에 backtick을 쓰면 그 자리에서
           문자열이 끊겨 **script.js 전체가 죽는다**(실제로 한 번 죽였다). -->
    <div id="copy-help" style="display:none;font-size:12px;color:#8F0B20;margin:-8px 0 16px">
      자동 복사가 막혀 있습니다 — 위 주소를 <strong>길게 눌러</strong> 복사해 주세요.
    </div>
    <div id="share-review" style="display:none;margin-bottom:16px;padding:16px 18px;background:#FFF8E6;border:1.5px solid #F0D89A">
      <div style="font-size:13px;font-weight:700;color:#7A5A10;margin-bottom:4px">담당자 확인이 필요한 견적입니다</div>
      <div style="font-size:12px;color:#7A5A10;line-height:1.7">입력하신 조건은 접수되었습니다. 담당자가 확인 후 정식 견적서를 보내드립니다.<br>급하시면 아래 연락처로 문의해 주세요.</div>
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
  ${hasIti ? '<a href="#rec" id="anc-rec">추천 일정</a>' : ''}
  ${destPhotos ? '<a href="#gallery" id="anc-gallery">현지 사진</a>' : ''}
</div>

<div class="page-wrap">

  <!-- ══ 견적서 (인쇄 영역) ══ -->
  <div id="quote" class="quote-doc">
    <div class="quote-hd">
      <div>
        <div class="brand-name"><a href="${base}" style="color:inherit;text-decoration:none;cursor:pointer">비즈페이지</a> 해외연수 견적서</div>
        <div class="brand-sub">${ciLegalName} · 해외 연수 전문</div>
      </div>
      <div class="meta-blk">
        <div class="issue">${issueDate}</div>
        ${/* 🔴 **이 문서에는 견적번호가 없었다** (XP 후속). 고객은 이 창에서 바로
             「이 견적서 인쇄하기」를 눌러 종이로 만들거나 PDF로 저장한다. 그런데
             번호는 링크로 여는 견적서에만 있었다 —
             **전화가 오면 그 사람은 자기 견적을 부를 이름이 없다**(WB가 번호를
             만든 이유가 정확히 그것이다: 담당자가 휴가여도 응대할 수 있게).
           ⚠ 번호는 **서버가 발급한 뒤에야** 안다(요청을 보내기 전에는 없다).
             그래서 자리만 만들어 두고, 응답이 오면 그때 채운다. 못 받으면
             **빈칸으로 남긴다** — 없는 번호를 지어내지 않는다. */''}
        <div class="issue-qno" id="doc-qno" style="display:none"></div>
        <div>${ciLegalName}</div>
        <div>${ciTel}</div>
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
      <tr><td>참가 인원</td><td>${participants}명</td></tr>
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

  <!-- ══ 추천 일정 ══
       QD: 등록된 코스가 없는 목적지(관리자가 새로 추가한 곳)에서는 이 섹션 전체를
       뺀다. 예전엔 여기서 itiA.title을 읽다가 TypeError가 나 견적서 만들기 자체가
       터졌다. 금액·조건은 그대로 나가므로 견적서로서는 온전하다.
       ⚠ UI에서 no-print 클래스를 뗐다 — 인쇄 규칙은 @media print에 있다(선택된 코스만).
       ⚠ 이 주석은 **템플릿 문자열 안**이다. 백틱을 쓰면 그 자리에서 문자열이 끊겨
         파일 절반이 통째로 죽는다(방금 그렇게 20개 테스트가 로드에 실패했다). -->
  ${!hasIti ? '' : `
  <section id="rec" class="pg-section">
    <div class="sec-label">RECOMMENDED ITINERARY</div>
    <h2>맞춤 일정 추천</h2>
    <p class="sub">${destText} · <strong style="color:#CC001A">${programText}</strong> 프로그램 유형을 기반으로, ${itiSingle ? '실제 견적 입력값에 최적화된 코스를 제안드립니다.' : '실제 견적 입력값에 최적화된 코스 두 가지를 선별하였습니다.'}</p>

    ${itiSingle ? '' : `
    <div class="rec-tabs">
      <button class="rec-tab${selectedPlan!=='b'?' active':''}" onclick="showCourse('a',this)">코스 A &nbsp;·&nbsp; ${_e(itiA.title)}${selectedPlan==='a'?' <span style="color:#CC001A">· 탐색하신 일정</span>':''}</button>
      <button class="rec-tab${selectedPlan==='b'?' active':''}" onclick="showCourse('b',this)">코스 B &nbsp;·&nbsp; ${_e(itiB.title)}${selectedPlan==='b'?' <span style="color:#CC001A">· 탐색하신 일정</span>':''}</button>
    </div>
    `}

    <div id="course-a" class="rec-content${selectedPlan!=='b'?' active':''}">
      ${destPhotos ? `<div class="course-cover-img"><img src="${destPhotos.cover}" alt="${destText}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
      <div class="course-hd">
        <div class="c-title">${_e(itiA.title)}</div>
        <div class="c-sub">${_e(itiA.subtitle)}</div>
        <div class="c-highlights">${(itiA.highlights||[]).map(h=>`<span class="c-hl">· ${_e(h)}</span>`).join('')}</div>
      </div>
      <div class="day-timeline">${renderDays(itiADisplayDays)}</div>
      ${renderParticipantGuide()}
      ${renderGallery(destPhotos?.strip)}
    </div>

    ${itiSingle ? '' : `
    <div id="course-b" class="rec-content${selectedPlan==='b'?' active':''}">
      ${destPhotos ? `<div class="course-cover-img"><img src="${destPhotos.cover}" alt="${destText}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
      <div class="course-hd">
        <div class="c-title">${_e(itiB.title)}</div>
        <div class="c-sub">${_e(itiB.subtitle)}</div>
        <div class="c-highlights">${(itiB.highlights||[]).map(h=>`<span class="c-hl">· ${_e(h)}</span>`).join('')}</div>
      </div>
      <div class="day-timeline">${renderDays(itiBDisplayDays)}</div>
      ${renderParticipantGuide()}
      ${renderGallery(destPhotos?.strip)}
    </div>
    `}
  </section>
  `}

</div><!-- /page-wrap -->

<footer class="win-footer no-print">
  ${ciLegalName} &nbsp;|&nbsp; ${ciAddress} &nbsp;|&nbsp; ${ciTel} &nbsp;|&nbsp; ${ciEmail}<br>
  Copyright ⓒ ${new Date().getFullYear()} ${ciLegalName.replace(/^\(주\)/, '')}. All rights reserved.
</footer>

<script>
function showCourse(id, btn) {
  document.querySelectorAll('.rec-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rec-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('course-' + id).classList.add('active');
}
/* 링크 복사 — **세 겹**이다 (XL). navigator.clipboard는 https가 아니거나
   카카오톡 인앱 브라우저에서는 아예 없다. 우리 고객은 링크를 카톡으로 주고받으므로
   하필 거기서 이 버튼이 죽는다. 안 되면 **안 된다고 말하고 선택까지 해 준다.** */
function shareCopyLink() {
  var inp = document.getElementById('share-url-inp');
  var btn = document.getElementById('copy-btn');
  var help = document.getElementById('copy-help');
  if (!inp) return;
  var said = function (text, color) {
    if (!btn) return;
    btn.textContent = text; btn.style.background = color;
    setTimeout(function () { btn.textContent = '링크 복사'; btn.style.background = '#CC001A'; }, 2000);
  };
  var manual = function () {
    /* 선택까지 해 두면 「길게 눌러 복사」가 한 번에 된다 */
    try { inp.focus(); inp.select(); inp.setSelectionRange(0, inp.value.length); } catch (e) {}
    if (help) help.style.display = 'block';
    said('직접 복사', '#8F0B20');
  };
  var legacy = function () {
    try {
      inp.focus(); inp.select(); inp.setSelectionRange(0, inp.value.length);
      if (document.execCommand && document.execCommand('copy')) { said('복사됨!', '#22c55e'); return true; }
    } catch (e) {}
    return false;
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(inp.value)
      .then(function () { said('복사됨!', '#22c55e'); })
      .catch(function () { if (!legacy()) manual(); });
    return;
  }
  if (!legacy()) manual();
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

  /* 서버 검증 → 통과해야 링크 발급 (2026-07-29).
     예전엔 저장 요청만 보내고 실패해도 base64 링크가 남아 그대로 동작했다. 이제
     서버가 권위 요율표·계수와 대조해 통과한 견적에만 링크를 만든다. 통과 못 하면
     링크 대신 담당자 확인 안내로 넘어간다 — 견적 자체는 /api/quotes에 이미
     저장돼 있으므로 리드는 유실되지 않는다.

     견적 스냅샷(window._lastQuoteRecord)을 함께 보내는 이유: shareData에는 표시용
     축약값만 있고 적용 계수·항목별 단가가 없어 검증 깊이가 얕다. 스냅샷이 있으면
     서버가 계수 범위·항목 산술까지 본다. 없으면(견적 제출 전에 버튼을 누른 경우)
     서버가 확인 가능한 만큼만 본다. */
  const setStep = (txt) => {
    if (w.closed) return;
    const el = w.document.getElementById('share-verify-step');
    if (el) el.textContent = txt;
  };
  /* 진행 문구는 실제 서버 단계와 1:1은 아니다(요청은 한 번에 끝난다). 사람이
     '무엇을 하는 중인지' 읽을 수 있게 하는 안내이며, 응답이 빨리 오면 곧바로
     결과로 넘어간다. 없는 절차를 있는 척하지는 않는다 — 문구는 서버가 실제로
     수행하는 검사 이름과 같다(api/_lib/quote_verify.js). */
  const stepTimers = [
    setTimeout(() => setStep('적용 계수 범위 확인 중…'), 700),
    setTimeout(() => setStep('항목별 금액 대조 중…'), 1500),
    setTimeout(() => setStep('요율 기준월 확인 중…'), 2300),
  ];
  const clearSteps = () => stepTimers.forEach(clearTimeout);

  const showReview = () => {
    if (w.closed) return;
    const v = w.document.getElementById('share-verifying');
    const r = w.document.getElementById('share-review');
    if (v) v.style.display = 'none';
    if (r) r.style.display = 'block';
  };

  fetch('/api/quote-shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    /* 🔴 연락처는 `share`(=payload)가 아니라 **바깥 칸으로** 보낸다(WC).
       payload에 넣으면 견적서 링크를 아는 사람이 전부 보게 된다 — 서버가 대장
       컬럼에만 저장한다. `test_wC`가 payload에 안 섞였는지 검사한다. */
    body: JSON.stringify({
      share: shareData,
      quote: window._lastQuoteRecord || null,
      customerTel: (document.getElementById('contactTel') || {}).value || '',
    }),
  }).then(r => r.json().catch(() => null))
    .then((data) => {
      clearSteps();
      if (w.closed) return;
      if (!data || !data.ok || !data.id) { showReview(); return; }
      const verifying = w.document.getElementById('share-verifying');
      const ready = w.document.getElementById('share-ready');
      const inp = w.document.getElementById('share-url-inp');
      if (inp) inp.value = base + 'estimate-view.html?id=' + data.id;
      if (verifying) verifying.style.display = 'none';
      if (ready) ready.style.display = 'flex';
      /* 🔴 **인쇄되는 문서에도 견적번호를 찍는다** (XP 후속). 이 창에서 바로 인쇄·PDF로
         저장하는 고객이 있는데, 그 종이에 번호가 없으면 전화가 왔을 때 우리도 고객도
         무엇에 대한 이야기인지 못 찾는다. 번호는 방금 서버가 준 값이다.
       ⚠ 못 받았으면 **자리를 접는다** — 「견적번호 undefined」가 찍히면 그게 더 나쁘다. */
      const qnoEl = w.document.getElementById('doc-qno');
      if (qnoEl && data.quoteNo) {
        qnoEl.textContent = '견적번호 ' + data.quoteNo;
        qnoEl.style.display = '';
      }
    })
    .catch(() => { clearSteps(); showReview(); });
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
  /* QD: 보여줄 코스가 없으면 열지 않는다. 여기서 막아야 두 진입 경로가 모두 닫힌다 —
     index.html의 "연수 일정 탐색" 버튼과, 공유 견적서에서 ?dest=…로 들어오는 경로
     (initFromSharedLink는 renderStep3 뒤에 이걸 무조건 부른다). 이 줄이 없으면
     renderStep3가 닫아 둔 섹션을 곧바로 다시 열어 **빈 화면**을 보여준다. */
  var destNow = (typeof destinationSelect !== 'undefined') ? destinationSelect.value : '';
  if (typeof hasItineraryContent === 'function' && !hasItineraryContent(destNow)) {
    sec.classList.add('hidden');
    return;
  }
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

  /* QD: 보여줄 코스가 없는 목적지(관리자가 새로 추가한 곳). 예전엔 이 함수가 여기
     도달하기 전에 TypeError로 죽었다. 이제는 죽지 않지만, 그냥 return하면 **직전
     목적지의 코스 카드가 그대로 남아** 다른 목적지 일정을 이 목적지 것으로 보게 된다.
     남은 것을 지우고 섹션을 닫는다(호출부에서 버튼도 내놓지 않는다). */
  _step3Courses = null;
  var step3Sec = document.getElementById('step3Section');
  if (step3Sec) step3Sec.classList.add('hidden');
  console.warn('[일정 탐색] "' + destKey + '"에 등록된 추천 일정이 없어 일정 탐색을 열지 않습니다. '
    + '관리자 → 일정 관리에서 코스를 추가하면 열립니다.');
}

/* API courses 배열 → DEST_REC {a, b} 형식 변환.
   ⚠ 변환 규칙은 rec_fallbacks.js가 안다 (RK) — 관리자 미리보기가 같은 함수를 불러
   "코스를 이렇게 고치면 고객 카드가 이렇게 보인다"를 그대로 보여준다. */
function _coursesToDestRec(courses) {
  /* TC: 여기 오는 것은 보통 getItineraries가 이미 골라 준 쌍이지만, 다른 경로로도
     불릴 수 있어 한 번 더 지난다(같은 함수라 두 번 걸러도 결과가 같다). */
  const use = recPreferQuoteCourses(courses);
  return { a: recPlanFromCourse(use[0]), b: recPlanFromCourse(use[1] || use[0]) };
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

  /* 빈 칸에 들어가는 문구는 rec_fallbacks.js 하나가 안다 (RJ) — 관리자 화면의
     미리보기가 **같은 값**을 보여줘야 "비워 두면 뭐가 나가는지"를 거짓 없이 말한다. */
  var defaultTag   = REC_FALLBACKS.tag[plan];
  if (tagEl)    tagEl.textContent  = data ? data.tag  : defaultTag;
  if (descEl)   descEl.textContent = data ? data.desc : REC_FALLBACKS.desc;
  if (pointsEl) {
    var pts = data && data.points ? data.points : REC_FALLBACKS.points;
    pointsEl.innerHTML = pts.map(function(p) { return '<li>' + p + '</li>'; }).join('');
  }
}

/* ================================================================
   이미지 파이프라인
   ================================================================ */

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
  /* TC: **여기도 같은 규칙을 지난다.** 이 자리를 빠뜨리면 견적서는 견적서 일정을,
     일정 탐색은 온라인 일정을 보여준다 — 두 고객 화면이 서로 다른 말을 하게 된다. */
  var courses  = (typeof ITINERARY_DB !== 'undefined') ? recPreferQuoteCourses(ITINERARY_DB[destKey]) : null;
  var course   = _step3Courses ? (_step3Courses[planIdx] || _step3Courses[0])
               : (courses ? (courses[planIdx] || courses[0]) : null);

  /* ⚠ 예전엔 여기서 갈래가 둘이었다 — 코스가 있으면 _buildDisplayDays, 없으면 이 자리에
     도착/귀국/채움 문구를 **다시 적은** 루프. 같은 성격의 자동 문구인데 둘이 서로 달랐고
     (「— 오전 코스」 vs 「— 오전 탐방」), 관리자 미리보기가 오전·오후·저녁을 못 보여주던
     이유도 "규칙이 두 벌이라 옮겨 적을 수 없다"였다. 이제 한 함수가 두 경우를 다 안다.
     ⚠ 여기서 items를 그대로 인덱싱하지 않는다 — 비어 있으면 예전 코드는
     "undefined — 오전 탐방"을 만들었다(결함 생성기 ②). */
  var rec   = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  var pRec  = rec ? rec[plan] : null;
  var displayDays = recBuildDisplayDays(course, pRec ? pRec.items : null, totalDays, destKey);

  var timelineEl = document.getElementById('dayTimeline');
  if (!timelineEl) return;
  /* 담당자가 친 글은 **엘리먼트로** 붙인다. 문자열로 이어 붙이면 관리자에서 저장한
     한 줄이 고객 페이지에서 실행될 수 있다(결함 생성기 ④).
     카드 모양을 아는 곳도 rec_fallbacks.js 하나다 — 관리자 미리보기가 같은 함수를 쓴다. */
  timelineEl.textContent = '';
  for (var i = 1; i <= totalDays; i++) {
    timelineEl.appendChild(recRenderDayCard(document, i, displayDays[i - 1], totalDays));
  }
}

/* 결재 기대 효과 박스 */
function _renderValueBox(plan) {
  var destKey  = (typeof destinationSelect !== 'undefined') ? destinationSelect.value : '';
  var planIdx  = (plan === 'a') ? 0 : 1;
  var stepCourse = _step3Courses ? (_step3Courses[planIdx] || _step3Courses[0]) : null;
  var rec      = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
  var planData = rec ? rec[plan] : null;
  var value    = stepCourse ? stepCourse.subtitle
               : (planData ? planData.value : REC_FALLBACKS.value);   /* RJ */

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

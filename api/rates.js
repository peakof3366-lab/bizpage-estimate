/* 요율(목적지별 단가) 실시간 오버라이드 (신규).
   data.js의 정적 destinationRates는 "항상 안전한 기본값"으로 그대로 두고,
   관리자가 수정한 항목만 이 테이블에 저장한다. 프론트엔드(script.js)는 페이지
   로드 시 이 GET을 호출해 정적값 위에 얕은 병합만 하므로, 이 API가 느리거나
   실패해도 견적 계산 자체는 항상 정상 동작한다(안전한 폴백).

   GET (공개, 인증 불필요 — 견적 계산 페이지에서 사용)
     기본: 전체 목적지 오버라이드 + 환율 감시 데이터 반환
           { overrides, fxRates: {통화:KRW환율}, fxBaseline: {목적지:{currency,rate,at}} }
     ?history=1 (관리자 전용): 최근 변경 이력 반환
     ?cron=1 (Vercel Cron 전용, Authorization: Bearer $CRON_SECRET 필요): 오늘의 환율을
       외부 API에서 가져와 fx_rates에 갱신. 항공료 자체는 인원 규모별 협상 견적이라 자동
       갱신 대상이 아니지만, 환율은 객관적 공개값이라 자동 감시가 가능함(요율 관리 탭의
       "확인 권장" 배지에 반영 — admin.html의 adminGetFxDrift() 참고).
   PATCH (관리자 전용): 특정 목적지의 일부 항목 수정 + 변경 이력 기록. 가격(NUMERIC_FIELDS)이
     바뀌면 "방금 이 가격을 확인/확정했다"는 신호로 보고 그 목적지의 환율 기준점도 함께
     재설정한다(rate_fx_baseline). */
const { sql } = require('./_lib/db');
const { requireAdmin, requireRole } = require('./_lib/auth');
const DEST_CURRENCY = require('../dest_currency');
const destinationRates = require('../data');

const NUMERIC_FIELDS = new Set([
  'airfare', 'fuel_surcharge', 'hotel_per_room', 'meal_per_person',
  'vehicle_large', 'vehicle_small', 'guide_fee', 'sightseeing_fee', 'margin_per_traveler',
]);

/* TJ: 고칠 수는 있지만 **없어도 되는** 요율 칸.
   ⚠ 골프를 위 NUMERIC_FIELDS에 넣으면 안 된다 — 그 집합은 PATCH 검증뿐 아니라
     **새 목적지를 만들 때 반드시 받아야 하는 칸 목록**으로도 쓰인다
     (isValidNewDestination이 그 집합을 돌며 없으면 거절한다). 골프를 넣으면 골프를
     안 파는 목적지를 새로 만들 수가 없게 된다.
   골프는 **파는 곳에서만** 값이 있다(0 = 안 판다). 그래서 「고칠 수 있는 칸」과
   「반드시 있어야 하는 칸」을 갈랐다. */
const OPTIONAL_NUMERIC_FIELDS = new Set(['golf_fee']);

/* 오타 상한 (신규) — 지금까지 서버 검증은 "숫자이고 0 이상"이 전부였다. 즉 호텔
   단가에 0을 하나 더 붙여도 그대로 저장되고, 저장 즉시 고객 견적서 금액이 바뀐다.
   관리자 화면에 3배 초과 시 confirm 경고가 있지만 그건 브라우저 쪽 안내라
   "예"를 누르면 그만이고, 화면을 거치지 않는 요청은 아예 안 거친다.
   여러 명이 매주 단가를 갱신하기 시작하면 이 구멍은 언젠가 반드시 밟힌다.

   기준은 **현재 요율표 최댓값의 약 5배**로 통일했다. 이 배율이 아니면 안 되는
   이유가 있다 — 상한을 넉넉하게 10배 이상으로 잡으면 정작 막아야 할 '0 하나 더'
   (=10배) 오타가 그대로 통과한다. 처음에 필드별로 눈대중 7~10배를 넣었다가
   test_pH_rate_guard.js의 [2]에서 식비·관광비·마진 3개가 뚫리는 걸 잡았다.
   5배면 정상 인상 여유(현행 최댓값 기준 4.6~5.8배)는 남기고 10배 오타는 끊는다.

   ⚠ 요율이 실제로 상한에 근접하면 올려도 되지만, 그때도 **현행 최댓값의 5배**를
   유지할 것. 같이 고칠 곳은 ai-loop/test_pH_rate_guard.js — [1]이 현행 값 통과를,
   [2]가 10배 오타 차단을 양쪽에서 검사하므로 한쪽으로만 치우치면 테스트가 잡는다. */
const FIELD_MAX = {
  airfare: 8000000, fuel_surcharge: 4000000, hotel_per_room: 3000000,
  meal_per_person: 400000, vehicle_large: 20000000, vehicle_small: 15000000,
  guide_fee: 3000000, sightseeing_fee: 1500000, margin_per_traveler: 2000000,
  /* 골프 1인 1회 라운딩. 현행 최댓값은 카자흐스탄 267,180(실측)이라 위 규칙(현행 5배)대로
     1,500,000. 「0 하나 더」 오타(2,671,800)는 끊고 정상 인상 여유는 남는다. */
  golf_fee: 1500000,
};

/* 숫자 요율 한 칸의 유효성. NUMERIC_FIELDS 검증이 필요한 모든 경로(개별 수정
   isValidChange, 새 목적지 isValidNewDestination)가 이 함수 하나를 쓴다 —
   한쪽에만 상한을 걸면 다른 쪽이 우회로가 된다.
   isFinite를 명시하는 이유: typeof Infinity === 'number'이고 Infinity >= 0도 참이라
   기존 조건만으로는 통과한다(JSON으로는 안 들어오지만 조건 자체가 허술했다). */
function isValidRateNumber(field, v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  const max = FIELD_MAX[field];
  return max === undefined || v <= max;
}
const STRING_FIELDS = new Set(['notes', 'rateDate', 'season_note']);

/* 변경 이력 한 번에 돌려주는 최대 건수. admin.html의 RATE_HISTORY_LIMIT와 같아야 한다 —
   화면이 "잘렸다"고 안내할지 판단하는 기준이라, 두 값이 어긋나면 잘렸는데 안 알리거나
   안 잘렸는데 알린다(ai-loop/test_pT_history_scope.js가 두 값을 대조한다). */
const HISTORY_LIMIT = 300;

/* P2b: 견적 계수 스칼라 노브 스펙 — script.js의 COEF_SPEC와 반드시 동일하게 유지.
   한쪽만 바꾸면 서버 검증 범위와 클라 적용 범위가 어긋난다(기본값·min·max 모두 대칭).
   저장 시 이 스펙으로 타입·범위를 검증하고, 스펙에 없는 키는 버린다. */
const COEF_SPEC = {
  seasonStrength:   { def: 1.0, min: 0.5, max: 2.0 },
  leadTimeStrength: { def: 1.0, min: 0.5, max: 2.0 },
  peakStrength:     { def: 1.0, min: 0.5, max: 2.0 },
  hotelPeakWeight:  { def: 0.8, min: 0.0, max: 1.0 },
};

/* 관리자 신규 목적지 (신규) — 아래 상수·검증 함수는 커스텀 목적지 생성/삭제
   전용이며, 위 NUMERIC_FIELDS/STRING_FIELDS는 그대로 재사용한다(diff 검증용
   isValidChange와 달리 전체 행 검증이 필요해 별도 함수로 분리). */
const BUILTIN_DEST_KEYS = new Set(destinationRates.map((d) => d.destination_key));
const CUSTOM_ZONES = new Set(['short', 'mid', 'long']);
/* script.js INSURANCE_ZONES의 키와 동일해야 한다 — 한쪽만 늘리면 저장은 되는데
   엔진이 못 찾아 중립값으로 폴백한다(ai-loop/test_pP가 두 목록을 대조한다). */
const INSURANCE_ZONE_KEYS = new Set(['domestic', 'asiaShort', 'asiaMid', 'evac', 'oceania', 'highCost']);
/* 시즌 프로파일 허용 id (PQ) — 보험 권역처럼 여기 손으로 적지 않고 data.js가 내보낸
   DEST_SEASON_PROFILES에서 뽑는다. 목록을 두 번 적으면 프로파일을 새로 추가했을 때
   서버만 모르는 상태가 되어 저장이 400으로 막히거나(또는 그 반대로) 조용히 폴백한다. */
const SEASON_PROFILE_KEYS = new Set(
  (destinationRates.DEST_SEASON_PROFILES || []).map((p) => p.id).filter(Boolean)
);
const DEST_KEY_RE = /^[\p{L}\p{N}_\- ·]+$/u;

function isValidNewDestination(body) {
  if (!body || typeof body.destinationKey !== 'string') return 'invalid_key';
  const key = body.destinationKey.trim();
  if (!key || key.length > 40 || !DEST_KEY_RE.test(key)) return 'invalid_key';
  if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 80) return 'invalid_label';
  if (!CUSTOM_ZONES.has(body.zone)) return 'invalid_zone';
  if (typeof body.southernHemisphere !== 'boolean') return 'invalid_southern_hemisphere';
  for (const f of NUMERIC_FIELDS) {
    if (!isValidRateNumber(f, body.fields?.[f])) return `invalid_field_${f}`;
  }
  if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 500)) return 'invalid_notes';
  if (body.seasonNote != null && (typeof body.seasonNote !== 'string' || body.seasonNote.length > 500)) return 'invalid_season_note';
  /* 통화(선택) — 빈값이면 FX 미적용(내장 '동유럽' 등과 동일). 있으면 ISO 4217 3자 대문자만. */
  if (body.currency != null && body.currency !== '' &&
      (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency))) return 'invalid_currency';
  /* 지역(선택) — REGION_MAP 분류용 자유 문자열(길이만 제한). */
  if (body.region != null && (typeof body.region !== 'string' || body.region.length > 40)) return 'invalid_region';
  /* 나라(선택, RY) — 지역과 별개 축이다. '실제 이용 호텔' 목록을 나라 단위로 가르는 데만
     쓰이고 가격에는 전혀 들어가지 않는다. 비면 화면에서 '나라 미지정'으로 드러난다. */
  if (body.country != null && (typeof body.country !== 'string' || body.country.length > 40)) return 'invalid_country';
  /* 보험 권역 — 없으면 견적 엔진이 계수 1.00(중립)으로 조용히 폴백한다. 권역별
     0.85~1.80이라 최대 80% 어긋나는데 콘솔 경고만 남았다. 빈 값은 기준 권역으로 본다. */
  if (body.insuranceZone != null && body.insuranceZone !== ''
      && !INSURANCE_ZONE_KEYS.has(body.insuranceZone)) return 'invalid_insurance_zone';
  /* 시즌 프로파일(선택) — 빈 값이면 공용 시즌표로 폴백(내장 남반구 4곳과 동일한 취급).
     모르는 id를 통과시키면 저장은 되는데 엔진이 프로파일을 못 찾아 조용히 공용표로
     떨어지므로, 알 수 없는 값은 여기서 거절해 "저장됐지만 반영 안 됨"을 만들지 않는다. */
  if (body.seasonProfile != null && body.seasonProfile !== ''
      && !SEASON_PROFILE_KEYS.has(body.seasonProfile)) return 'invalid_season_profile';
  return null;
}

async function fetchRateToKrw(currency) {
  const code = currency.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${code}.json`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      const rate = data[code] && data[code].krw;
      if (typeof rate === 'number') return rate;
    } catch {
      // 다음 URL(fallback)로 계속
    }
  }
  return null;
}

function isValidChange(c) {
  if (!c || typeof c.field !== 'string') return false;
  if (NUMERIC_FIELDS.has(c.field) || OPTIONAL_NUMERIC_FIELDS.has(c.field)) {
    return isValidRateNumber(c.field, c.newValue);
  }
  if (STRING_FIELDS.has(c.field)) return typeof c.newValue === 'string' && c.newValue.length <= 500;
  return false;
}

/* 상한에 걸린 항목만 따로 골라낸다 — 기존엔 유효하지 않은 변경을 전부 조용히
   버리고 남은 것만 저장했다(cleanChanges). 오타로 상한을 넘긴 경우에 그 동작이면
   "저장됐다"는 응답을 받고도 그 칸만 안 바뀌어, 팀원은 반영된 줄 안다.
   상한 위반은 조용히 버리지 말고 400으로 되돌려 무엇이 왜 막혔는지 알려준다. */
function findOutOfRange(changes) {
  return changes
    /* ⚠ 골프(OPTIONAL_NUMERIC_FIELDS)도 여기 들어와야 한다. 빠뜨리면 상한을 넘긴
       골프 요금이 400이 아니라 **조용히 버려지고** 담당자는 저장됐다고 믿는다 —
       이 함수가 생긴 이유가 바로 그 사고다. */
    .filter((c) => c && (NUMERIC_FIELDS.has(c.field) || OPTIONAL_NUMERIC_FIELDS.has(c.field))
      && typeof c.newValue === 'number'
      && Number.isFinite(c.newValue) && c.newValue >= 0 && c.newValue > FIELD_MAX[c.field])
    .map((c) => ({ field: c.field, value: c.newValue, max: FIELD_MAX[c.field] }));
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (req.query && req.query.cron) {
      const authHeader = req.headers.authorization || '';
      if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const currencies = [...new Set(Object.values(DEST_CURRENCY))];
      let okCount = 0;
      for (const currency of currencies) {
        const rate = await fetchRateToKrw(currency);
        if (rate === null) continue;
        try {
          await sql`
            insert into fx_rates (currency, rate_to_krw, fetched_at)
            values (${currency}, ${rate}, now())
            on conflict (currency) do update set rate_to_krw = excluded.rate_to_krw, fetched_at = now()
          `;
          okCount++;
        } catch (err) {
          console.error('[rates cron] fx_rates 저장 실패:', currency, err);
        }
      }
      return res.status(200).json({ ok: okCount, failed: currencies.length - okCount, total: currencies.length });
    }

    if (req.query && req.query.history) {
      if (!(await requireAdmin(req, res))) return;
      /* 목적지별 조회 (PT 신규) — 전역 최근 300건만 돌려주면, 로그가 300건을 넘은 뒤부터
         오래 편집된 목적지는 이력이 통째로 안 보이고 화면에 "이력이 없습니다"가 뜬다.
         되돌리기는 이력에서만 할 수 있으므로 **팀이 의지하는 안전망이 조용히 닫힌다.**
         팀원 5명이 매일 갱신하면 한 번 저장에 (바꾼 항목 수 + rateDate) 행이 쌓이고
         권역 일괄조정 한 번에 목적지×2행이 들어가므로 300건은 몇 주면 도달한다.
         destinationKey를 주면 그 목적지 안에서 최근 300건을 준다. */
      const historyDest = String((req.query.destinationKey || '')).trim();
      try {
        const rows = historyDest
          ? await sql`select * from rate_change_log where destination_key = ${historyDest}
                      order by created_at desc limit ${HISTORY_LIMIT}`
          : await sql`select * from rate_change_log order by created_at desc limit ${HISTORY_LIMIT}`;
        return res.status(200).json(rows);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'query_failed' });
      }
    }
    try {
      const [overrideRows, fxRateRows, fxBaselineRows, customDestRows] = await Promise.all([
        sql`select destination_key, overrides from rate_overrides`,
        sql`select currency, rate_to_krw from fx_rates`,
        sql`select destination_key, currency, baseline_rate, baseline_at from rate_fx_baseline`,
        sql`select * from custom_destinations order by created_at`,
      ]);
      const overrides = {};
      for (const r of overrideRows) overrides[r.destination_key] = r.overrides;
      const fxRates = {};
      for (const r of fxRateRows) fxRates[r.currency] = Number(r.rate_to_krw);
      const fxBaseline = {};
      for (const r of fxBaselineRows) {
        fxBaseline[r.destination_key] = { currency: r.currency, rate: Number(r.baseline_rate), at: r.baseline_at };
      }
      const customDestinations = customDestRows.map((r) => ({
        destination_key: r.destination_key, label: r.label,
        zone: r.zone, southern_hemisphere: r.southern_hemisphere,
        airfare: Number(r.airfare), fuel_surcharge: Number(r.fuel_surcharge),
        hotel_per_room: Number(r.hotel_per_room), meal_per_person: Number(r.meal_per_person),
        vehicle_large: Number(r.vehicle_large), vehicle_small: Number(r.vehicle_small),
        guide_fee: Number(r.guide_fee), sightseeing_fee: Number(r.sightseeing_fee),
        margin_per_traveler: Number(r.margin_per_traveler),
        rateDate: r.rate_date, notes: r.notes, season_note: r.season_note,
        currency: r.currency || null, region: r.region || null,
        /* 나라 (RY) — admin.html DEST_COUNTRY에 편입돼 '실제 이용 호텔' 목록을 가른다.
           ⚠ 위 조회가 `select *`라 컬럼이 아직 없으면 undefined → null로 내려가고
           화면은 '나라 미지정'으로 표시한다(500이 나지는 않는다). */
        country: r.country || null,
        /* 보험 권역 — script.js가 INSURANCE_ZONES에 편입해야 계수가 제대로 붙는다.
           안 내려보내면 엔진이 중립값 1.00으로 조용히 폴백한다. */
        insurance_zone: r.insurance_zone || 'asiaMid',
        /* 시즌 프로파일 (PQ) — script.js가 DEST_SEASON_PROFILES의 해당 프로파일 keys에
           편입해야 권역 시즌표가 붙는다. 안 내려보내면 공용표로 폴백해 동남아 7월
           출발이 성수기 1.20으로 계산된다(실제는 우기 비수기 0.88). null이면 종전 폴백. */
        season_profile: r.season_profile || null,
      }));
      /* P2b: 계수 노브 전달 — app_settings 'coefficients' 행. 테이블/행이 아직 없으면
         조용히 {} (클라가 코드 기본값 사용). 이 조회 실패가 위 요율/환율 응답을 깨지
         않도록 반드시 Promise.all 밖에서 독립 try/catch로 감싼다(배포 순서 무관하게 안전). */
      let coefficients = {};
      try {
        const coefRows = await sql`select value from app_settings where key = 'coefficients'`;
        if (coefRows.length && coefRows[0].value && typeof coefRows[0].value === 'object') {
          for (const key of Object.keys(COEF_SPEC)) {
            const v = coefRows[0].value[key];
            if (typeof v === 'number' && isFinite(v)) coefficients[key] = v;
          }
        }
      } catch (coefErr) {
        console.error('[rates] 계수(app_settings) 조회 실패 — 기본값으로 진행:', coefErr.message);
      }
      return res.status(200).json({ overrides, fxRates, fxBaseline, customDestinations, coefficients });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
  }

  /* 관리자 신규 목적지 생성 (신규) — custom_destinations에 완전한 한 행을 삽입.
     내장 목적지(data.js)와 destination_key가 겹치면 절대 만들어지지 않도록
     BUILTIN_DEST_KEYS로 막는다(이후 script.js 클라이언트 병합에서도 같은 이유로
     한 번 더 방어함 — 서버가 뚫려도 클라이언트가 내장값을 우선하도록). */
  if (req.method === 'POST' && req.query && req.query.action === 'createDestination') {
    /* 목적지 추가/삭제는 구조적 변경(가격 구조 자체를 바꾸는 일)이라 개별 가격
       편집(PATCH, 직원도 가능)보다 한 단계 높은 권한(매니저 이상)을 요구한다. */
    if (!(await requireRole(req, res, ['owner', 'manager']))) return;
    const body = req.body || {};
    const err = isValidNewDestination(body);
    if (err) return res.status(400).json({ error: err });
    const key = body.destinationKey.trim();
    if (BUILTIN_DEST_KEYS.has(key)) return res.status(409).json({ error: 'key_conflicts_with_builtin' });

    const rateDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const f = body.fields;
    const currency = (body.currency && body.currency !== '') ? body.currency : null;
    const region = (body.region && body.region !== '') ? body.region : null;
    const country = (body.country && body.country.trim() !== '') ? body.country.trim() : null;
    /* 빈 문자열이 아니라 null로 저장한다 — GET이 `|| null`로 내려보내므로 어느 쪽이든
       엔진 동작은 같지만, DB에서 '안 고름'과 ''이 섞이면 나중에 집계·감사가 갈린다. */
    const seasonProfile = (body.seasonProfile && body.seasonProfile !== '') ? body.seasonProfile : null;
    try {
      const inserted = await sql`
        insert into custom_destinations (
          destination_key, label, zone, southern_hemisphere,
          airfare, fuel_surcharge, hotel_per_room, meal_per_person,
          vehicle_large, vehicle_small, guide_fee, sightseeing_fee, margin_per_traveler,
          rate_date, notes, season_note, created_by, currency, region, country, insurance_zone, season_profile
        ) values (
          ${key}, ${body.label.trim()}, ${body.zone}, ${body.southernHemisphere},
          ${f.airfare}, ${f.fuel_surcharge}, ${f.hotel_per_room}, ${f.meal_per_person},
          ${f.vehicle_large}, ${f.vehicle_small}, ${f.guide_fee}, ${f.sightseeing_fee}, ${f.margin_per_traveler},
          ${rateDate}, ${body.notes || ''}, ${body.seasonNote || ''}, ${req.user.displayName}, ${currency}, ${region}, ${country}, ${body.insuranceZone || 'asiaMid'}, ${seasonProfile}
        )
        on conflict (destination_key) do nothing
        returning destination_key
      `;
      if (!inserted.length) return res.status(409).json({ error: 'key_already_exists' });
      /* 통화가 지정됐으면 환율 기준점(rate_fx_baseline)을 지금 환율로 심어둔다 — 안 하면
         커스텀 목적지는 baseline이 없어 공개 계산기 getFxAdjust가 영원히 1.0(FX 미적용).
         PATCH의 baseline 재설정과 동일 로직. 실패해도 목적지 생성 자체는 이미 성공. */
      if (currency) {
        try {
          const fxRows = await sql`select rate_to_krw from fx_rates where currency = ${currency}`;
          if (fxRows.length) {
            await sql`
              insert into rate_fx_baseline (destination_key, currency, baseline_rate, baseline_at)
              values (${key}, ${currency}, ${Number(fxRows[0].rate_to_krw)}, now())
              on conflict (destination_key) do update
                set currency = excluded.currency, baseline_rate = excluded.baseline_rate, baseline_at = now()
            `;
          }
        } catch (fxErr) {
          console.error('[rates] 신규 목적지 환율 기준점 초기화 실패(목적지 생성은 정상 완료):', fxErr);
        }
      }
      return res.status(200).json({ ok: true, destinationKey: key });
    } catch (err2) {
      console.error(err2);
      return res.status(500).json({ error: 'insert_failed' });
    }
  }

  /* P2b: 견적 계수 스칼라 노브 저장 (신규) — app_settings 'coefficients' 행에 upsert.
     견적 전 항목·전 목적지의 계산에 전역으로 영향을 주는 사이트 단위 변경이라, 개별 가격
     편집(PATCH, 직원 가능)보다 높은 권한(매니저 이상)을 요구한다. 스펙(COEF_SPEC)에 있는
     키만, 숫자·범위 검증 통과분만 저장하고, 누락 키는 기본값으로 채워 항상 완전한 4개 값을
     저장한다(부분 저장으로 인한 미정의 노브 방지). */
  if (req.method === 'POST' && req.query && req.query.action === 'saveCoefficients') {
    if (!(await requireRole(req, res, ['owner', 'manager']))) return;
    const input = (req.body && req.body.coefficients) || req.body || {};
    if (typeof input !== 'object') return res.status(400).json({ error: 'invalid_body' });
    const clean = {};
    for (const [key, spec] of Object.entries(COEF_SPEC)) {
      const v = input[key];
      if (v == null) { clean[key] = spec.def; continue; }  // 누락 → 기본값
      if (typeof v !== 'number' || !isFinite(v)) return res.status(400).json({ error: `invalid_${key}` });
      if (v < spec.min || v > spec.max) return res.status(400).json({ error: `out_of_range_${key}` });
      clean[key] = v;
    }
    try {
      await sql`
        insert into app_settings (key, value, updated_at, updated_by)
        values ('coefficients', ${JSON.stringify(clean)}::jsonb, now(), ${req.user.displayName})
        on conflict (key) do update
          set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
      `;
      return res.status(200).json({ ok: true, coefficients: clean });
    } catch (err2) {
      console.error('[rates] 계수 저장 실패:', err2);
      return res.status(500).json({ error: 'save_failed' });
    }
  }

  /* 관리자 신규 목적지 삭제 (신규) — 내장 목적지는 애초에 custom_destinations에
     존재할 수 없으므로, BUILTIN_DEST_KEYS 체크가 "내장 목적지는 절대 삭제되지
     않는다"는 원칙의 실제 집행 지점이다. quotes/rate_change_log는 과거 기록이므로
     건드리지 않고, rate_overrides/rate_fx_baseline만 고아 데이터 방지 차원에서
     함께 정리한다. */
  if (req.method === 'DELETE' && req.query && req.query.action === 'deleteDestination') {
    if (!(await requireRole(req, res, ['owner', 'manager']))) return;
    const key = String((req.query && req.query.destinationKey) || '').trim();
    if (!key) return res.status(400).json({ error: 'invalid_key' });
    if (BUILTIN_DEST_KEYS.has(key)) return res.status(403).json({ error: 'cannot_delete_builtin' });
    try {
      const deleted = await sql`delete from custom_destinations where destination_key = ${key} returning destination_key`;
      if (!deleted.length) return res.status(404).json({ error: 'not_found' });
      await sql`delete from rate_overrides where destination_key = ${key}`;
      await sql`delete from rate_fx_baseline where destination_key = ${key}`;
      return res.status(200).json({ ok: true });
    } catch (err2) {
      console.error(err2);
      return res.status(500).json({ error: 'delete_failed' });
    }
  }

  if (req.method === 'PATCH') {
    if (!(await requireAdmin(req, res))) return;
    /* author는 더 이상 클라이언트가 보낸 값을 신뢰하지 않는다(예전엔 브라우저
       localStorage에서 자유 선택한 이름이라 위조 가능했음) — 세션에서 검증된
       실사용자 표시명을 그대로 쓴다. */
    const author = req.user.displayName;
    const { destinationKey, changes } = req.body || {};
    if (!destinationKey || !Array.isArray(changes) || !changes.length) {
      return res.status(400).json({ error: 'invalid_body' });
    }
    /* 상한 위반은 '무효 입력'과 달리 조용히 버리면 안 된다 — 저장 성공 응답을
       받고도 그 칸만 반영이 안 돼 팀원이 바뀐 줄 알고 넘어간다. 먼저 걸러 400. */
    const outOfRange = findOutOfRange(changes);
    if (outOfRange.length) {
      return res.status(400).json({ error: 'value_out_of_range', fields: outOfRange });
    }
    const cleanChanges = changes.filter(isValidChange);
    if (!cleanChanges.length) return res.status(400).json({ error: 'no_valid_fields' });

    try {
      /* 병합을 DB 안에서 한다 — 예전엔 select로 현재값을 읽고 JS에서 합친 뒤 통째로
         덮어썼다(read-modify-write). 두 사람이 같은 목적지를 동시에 저장하면 나중 사람이
         '자기가 읽은 시점의 낡은 전체 값'으로 덮어써서 먼저 저장한 사람의 변경이
         조용히 사라진다. 예: A가 도쿄 항공료를, B가 도쿄 호텔비를 같이 고치면 둘 다
         "저장됐습니다"를 받고 변경 이력에도 두 건 다 남지만 실제 요율은 하나만 반영된다.
         팀원이 여러 명이 되면 반드시 밟게 되는 종류의 문제다.

         `rate_overrides.overrides || excluded.overrides`는 이번에 바뀐 필드만 얹으므로
         UPDATE 한 문장 안에서 원자적으로 끝난다. 보내지 않은 필드는 건드리지 않는다.
         returning으로 실제 저장된 결과를 받아 응답한다 — JS가 짐작한 값이 아니라
         DB가 확정한 값이라야 화면 캐시가 진실과 어긋나지 않는다. */
      const patch = {};
      for (const c of cleanChanges) patch[c.field] = c.newValue;

      const saved = await sql`
        insert into rate_overrides (destination_key, overrides, updated_at, updated_by)
        values (${destinationKey}, ${JSON.stringify(patch)}::jsonb, now(), ${author})
        on conflict (destination_key) do update
          set overrides = coalesce(rate_overrides.overrides, '{}'::jsonb) || excluded.overrides,
              updated_at = now(), updated_by = excluded.updated_by
        returning overrides
      `;
      const merged = saved.length ? saved[0].overrides : patch;

      /* 감사 로그는 부가 기록 — 실패해도 이미 커밋된 요율 저장(위 upsert)을 500으로
         뒤집지 않도록 삼킨다. 안 그러면 클라이언트가 "실패"로 오인해 재시도 → 로그 중복
         기록되거나 저장 성공을 실패로 오해한다. fx_baseline 재설정도 아래에서 동일 원칙. */
      try {
        for (const c of cleanChanges) {
          await sql`
            insert into rate_change_log (destination_key, field, old_value, new_value, author)
            values (${destinationKey}, ${c.field}, ${JSON.stringify(c.oldValue ?? null)}::jsonb, ${JSON.stringify(c.newValue)}::jsonb, ${author})
          `;
        }
      } catch (logErr) {
        console.error('[rates] 변경 이력 기록 실패(요율 저장은 정상 완료됨):', logErr);
      }

      /* "요율 기준월(rateDate)이 오늘로 갱신됐다" = "방금 이 가격을 확인/확정했다"는
         신호이므로 환율 기준점도 함께 재설정한다. 개별 편집(가격 변경), 일괄 조정,
         "확인함(변경 없음)" 버튼까지 세 경로 모두 가격을 실제로 바꿨든 안 바꿨든
         rateDate를 오늘로 갱신하므로, NUMERIC_FIELDS 대신 rateDate 변경 여부 하나로
         통일해서 판단한다(비고만 바뀐 경우는 rateDate가 안 바뀌므로 자동으로 제외됨).
         통화 매핑이 없거나(동유럽 등) 오늘 환율이 아직 한 번도 조회되지 않았으면
         조용히 건너뜀 — 이 부분이 실패해도 가격 저장 자체는 이미 끝났으므로 별도로
         처리한다. */
      if (cleanChanges.some((c) => c.field === 'rateDate')) {
        /* 통화 소스: 내장은 DEST_CURRENCY, 커스텀 목적지는 custom_destinations.currency.
           안 그러면 커스텀 목적지는 요율을 저장해도 baseline이 갱신되지 않아 FX가 멈춘다. */
        let currency = DEST_CURRENCY[destinationKey];
        if (!currency) {
          try {
            const cd = await sql`select currency from custom_destinations where destination_key = ${destinationKey}`;
            currency = cd.length ? cd[0].currency : null;
          } catch { currency = null; }
        }
        if (currency) {
          try {
            const fxRows = await sql`select rate_to_krw from fx_rates where currency = ${currency}`;
            if (fxRows.length) {
              await sql`
                insert into rate_fx_baseline (destination_key, currency, baseline_rate, baseline_at)
                values (${destinationKey}, ${currency}, ${Number(fxRows[0].rate_to_krw)}, now())
                on conflict (destination_key) do update
                  set currency = excluded.currency, baseline_rate = excluded.baseline_rate, baseline_at = now()
              `;
            }
          } catch (err) {
            console.error('[rates] 환율 기준점 재설정 실패(가격 저장은 정상 완료됨):', err);
          }
        }
      }

      return res.status(200).json({ ok: true, overrides: merged });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'update_failed' });
    }
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

/* 검증 로직 단위 테스트용 노출 (신규) — Vercel은 기본 export(핸들러 함수)만 보므로
   프로퍼티를 덧붙여도 배포 동작에 영향이 없다. 핸들러를 호출하려면 DB가 필요해
   상한 검증만 따로 꺼내 ai-loop/test_pH_rate_guard.js가 직접 검사한다. */
module.exports.__test = { isValidChange, isValidRateNumber, findOutOfRange, isValidNewDestination, FIELD_MAX, NUMERIC_FIELDS };

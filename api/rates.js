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
const STRING_FIELDS = new Set(['notes', 'rateDate', 'season_note']);

/* 관리자 신규 목적지 (신규) — 아래 상수·검증 함수는 커스텀 목적지 생성/삭제
   전용이며, 위 NUMERIC_FIELDS/STRING_FIELDS는 그대로 재사용한다(diff 검증용
   isValidChange와 달리 전체 행 검증이 필요해 별도 함수로 분리). */
const BUILTIN_DEST_KEYS = new Set(destinationRates.map((d) => d.destination_key));
const CUSTOM_ZONES = new Set(['short', 'mid', 'long']);
const DEST_KEY_RE = /^[\p{L}\p{N}_\- ·]+$/u;

function isValidNewDestination(body) {
  if (!body || typeof body.destinationKey !== 'string') return 'invalid_key';
  const key = body.destinationKey.trim();
  if (!key || key.length > 40 || !DEST_KEY_RE.test(key)) return 'invalid_key';
  if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 80) return 'invalid_label';
  if (!CUSTOM_ZONES.has(body.zone)) return 'invalid_zone';
  if (typeof body.southernHemisphere !== 'boolean') return 'invalid_southern_hemisphere';
  for (const f of NUMERIC_FIELDS) {
    if (typeof body.fields?.[f] !== 'number' || !(body.fields[f] >= 0)) return `invalid_field_${f}`;
  }
  if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 500)) return 'invalid_notes';
  if (body.seasonNote != null && (typeof body.seasonNote !== 'string' || body.seasonNote.length > 500)) return 'invalid_season_note';
  /* 통화(선택) — 빈값이면 FX 미적용(내장 '동유럽' 등과 동일). 있으면 ISO 4217 3자 대문자만. */
  if (body.currency != null && body.currency !== '' &&
      (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency))) return 'invalid_currency';
  /* 지역(선택) — REGION_MAP 분류용 자유 문자열(길이만 제한). */
  if (body.region != null && (typeof body.region !== 'string' || body.region.length > 40)) return 'invalid_region';
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
  if (NUMERIC_FIELDS.has(c.field)) return typeof c.newValue === 'number' && c.newValue >= 0;
  if (STRING_FIELDS.has(c.field)) return typeof c.newValue === 'string' && c.newValue.length <= 500;
  return false;
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
      try {
        const rows = await sql`select * from rate_change_log order by created_at desc limit 300`;
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
      }));
      return res.status(200).json({ overrides, fxRates, fxBaseline, customDestinations });
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
    try {
      const inserted = await sql`
        insert into custom_destinations (
          destination_key, label, zone, southern_hemisphere,
          airfare, fuel_surcharge, hotel_per_room, meal_per_person,
          vehicle_large, vehicle_small, guide_fee, sightseeing_fee, margin_per_traveler,
          rate_date, notes, season_note, created_by, currency, region
        ) values (
          ${key}, ${body.label.trim()}, ${body.zone}, ${body.southernHemisphere},
          ${f.airfare}, ${f.fuel_surcharge}, ${f.hotel_per_room}, ${f.meal_per_person},
          ${f.vehicle_large}, ${f.vehicle_small}, ${f.guide_fee}, ${f.sightseeing_fee}, ${f.margin_per_traveler},
          ${rateDate}, ${body.notes || ''}, ${body.seasonNote || ''}, ${req.user.displayName}, ${currency}, ${region}
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
    const cleanChanges = changes.filter(isValidChange);
    if (!cleanChanges.length) return res.status(400).json({ error: 'no_valid_fields' });

    try {
      const existing = await sql`select overrides from rate_overrides where destination_key = ${destinationKey}`;
      const merged = { ...(existing.length ? existing[0].overrides : {}) };
      for (const c of cleanChanges) merged[c.field] = c.newValue;

      await sql`
        insert into rate_overrides (destination_key, overrides, updated_at, updated_by)
        values (${destinationKey}, ${JSON.stringify(merged)}::jsonb, now(), ${author})
        on conflict (destination_key) do update
          set overrides = excluded.overrides, updated_at = now(), updated_by = excluded.updated_by
      `;

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

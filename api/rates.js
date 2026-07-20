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
const { requireAdmin } = require('./_lib/auth');
const DEST_CURRENCY = require('../dest_currency');

const NUMERIC_FIELDS = new Set([
  'airfare', 'fuel_surcharge', 'hotel_per_room', 'meal_per_person',
  'vehicle_large', 'vehicle_small', 'guide_fee', 'sightseeing_fee', 'margin_per_traveler',
]);
const STRING_FIELDS = new Set(['notes', 'rateDate', 'season_note']);

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
      const [overrideRows, fxRateRows, fxBaselineRows] = await Promise.all([
        sql`select destination_key, overrides from rate_overrides`,
        sql`select currency, rate_to_krw from fx_rates`,
        sql`select destination_key, currency, baseline_rate, baseline_at from rate_fx_baseline`,
      ]);
      const overrides = {};
      for (const r of overrideRows) overrides[r.destination_key] = r.overrides;
      const fxRates = {};
      for (const r of fxRateRows) fxRates[r.currency] = Number(r.rate_to_krw);
      const fxBaseline = {};
      for (const r of fxBaselineRows) {
        fxBaseline[r.destination_key] = { currency: r.currency, rate: Number(r.baseline_rate), at: r.baseline_at };
      }
      return res.status(200).json({ overrides, fxRates, fxBaseline });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
  }

  if (req.method === 'PATCH') {
    if (!(await requireAdmin(req, res))) return;
    const { destinationKey, author, changes } = req.body || {};
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
        values (${destinationKey}, ${JSON.stringify(merged)}::jsonb, now(), ${author || ''})
        on conflict (destination_key) do update
          set overrides = excluded.overrides, updated_at = now(), updated_by = excluded.updated_by
      `;

      for (const c of cleanChanges) {
        await sql`
          insert into rate_change_log (destination_key, field, old_value, new_value, author)
          values (${destinationKey}, ${c.field}, ${JSON.stringify(c.oldValue ?? null)}::jsonb, ${JSON.stringify(c.newValue)}::jsonb, ${author || ''})
        `;
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
        const currency = DEST_CURRENCY[destinationKey];
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

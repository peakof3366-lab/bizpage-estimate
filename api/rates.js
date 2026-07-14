/* 요율(목적지별 단가) 실시간 오버라이드 (신규).
   data.js의 정적 destinationRates는 "항상 안전한 기본값"으로 그대로 두고,
   관리자가 수정한 항목만 이 테이블에 저장한다. 프론트엔드(script.js)는 페이지
   로드 시 이 GET을 호출해 정적값 위에 얕은 병합만 하므로, 이 API가 느리거나
   실패해도 견적 계산 자체는 항상 정상 동작한다(안전한 폴백).

   GET (공개, 인증 불필요 — 견적 계산 페이지에서 사용)
     기본: 전체 목적지 오버라이드 반환 { overrides: { destKey: {field: value} } }
     ?history=1 (관리자 전용): 최근 변경 이력 반환
   PATCH (관리자 전용): 특정 목적지의 일부 항목 수정 + 변경 이력 기록 */
const { sql } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');

const NUMERIC_FIELDS = new Set([
  'airfare', 'fuel_surcharge', 'hotel_per_room', 'meal_per_person',
  'vehicle_large', 'vehicle_small', 'guide_fee', 'sightseeing_fee', 'margin_per_traveler',
]);
const STRING_FIELDS = new Set(['notes', 'rateDate', 'season_note']);

function isValidChange(c) {
  if (!c || typeof c.field !== 'string') return false;
  if (NUMERIC_FIELDS.has(c.field)) return typeof c.newValue === 'number' && c.newValue >= 0;
  if (STRING_FIELDS.has(c.field)) return typeof c.newValue === 'string' && c.newValue.length <= 500;
  return false;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
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
      const rows = await sql`select destination_key, overrides from rate_overrides`;
      const overrides = {};
      for (const r of rows) overrides[r.destination_key] = r.overrides;
      return res.status(200).json({ overrides });
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
      return res.status(200).json({ ok: true, overrides: merged });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'update_failed' });
    }
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

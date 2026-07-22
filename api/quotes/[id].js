const { sql } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = req.body || {};
    try {
      if (body.addLog) {
        const entry = {
          ts: new Date().toISOString(),
          author: String(body.addLog.author || '').slice(0, 40),
          text: String(body.addLog.text || '').slice(0, 500),
        };
        await sql`
          update quotes set activity_log = activity_log || ${JSON.stringify([entry])}::jsonb
          where id = ${id}
        `;
        return res.status(200).json({ ok: true, entry });
      }

      /* 실제 계약 항공료 저장 (신규) — status/note/assignee 일반 저장과 분리된 별도
         분기(addLog와 동일한 이유): 아래 일반 저장은 매번 세 필드를 무조건 덮어쓰므로
         같이 묶으면 실수로 이 값을 null로 되돌릴 위험이 있음. */
      if (body.actualAirfare) {
        const unit = Number(body.actualAirfare && body.actualAirfare.unit);
        if (!Number.isFinite(unit) || unit <= 0 || unit > 50000000) return res.status(400).json({ error: 'invalid_unit' });
        await sql`update quotes set actual_airfare_unit = ${unit} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* 실제 계약 호텔단가 저장 (신규) — 위 actualAirfare 분기와 대칭 */
      if (body.actualHotel) {
        const unit = Number(body.actualHotel && body.actualHotel.unit);
        if (!Number.isFinite(unit) || unit <= 0 || unit > 50000000) return res.status(400).json({ error: 'invalid_unit' });
        await sql`update quotes set actual_hotel_unit = ${unit} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* 실제 계약 식비 저장 (신규 · P1b) — 항공/호텔과 대칭 */
      if (body.actualMeal) {
        const unit = Number(body.actualMeal && body.actualMeal.unit);
        if (!Number.isFinite(unit) || unit <= 0 || unit > 50000000) return res.status(400).json({ error: 'invalid_unit' });
        await sql`update quotes set actual_meal_unit = ${unit} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* 실제 총 계약가 저장 (신규 · P1b) — 종합 정확도 측정용. 총액이라 상한을 크게 둔다. */
      if (body.actualTotal) {
        const value = Number(body.actualTotal && body.actualTotal.value);
        if (!Number.isFinite(value) || value <= 0 || value > 10000000000) return res.status(400).json({ error: 'invalid_total' });
        await sql`update quotes set actual_total = ${value} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      await sql`
        update quotes set status = ${body.status ?? 'new'}, note = ${body.note ?? ''}, assignee = ${body.assignee ?? ''}
        where id = ${id}
      `;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'update_failed' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      await sql`delete from quotes where id = ${id}`;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'delete_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

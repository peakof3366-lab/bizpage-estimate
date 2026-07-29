const { sql } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const { safeId, payloadTooLarge, trimText } = require('./_lib/public_input');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const payload = req.body || {};
    if (payloadTooLarge(payload)) return res.status(413).json({ error: 'payload_too_large' });
    /* id는 관리자 화면에서 onclick 안에 들어가므로 형태를 강제한다 — 자세한 이유는
       api/_lib/public_input.js 주석. 형식을 벗어나면 리드를 버리지 않고 id만 교체한다. */
    const id = safeId(payload.id);
    try {
      await sql`
        insert into inquiries (id, name, org, tel, message, type, payload)
        values (${id}, ${trimText(payload.name, 100)}, ${trimText(payload.org, 100)}, ${trimText(payload.tel, 40)},
                ${trimText(payload.message, 5000)}, ${trimText(payload.type, 40) || 'contact'},
                ${JSON.stringify({ ...payload, id })}::jsonb)
        on conflict (id) do nothing
      `;
      res.status(200).json({ ok: true, id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'insert_failed' });
    }
    return;
  }

  if (req.method === 'GET') {
    if (!(await requireAdmin(req, res))) return;
    try {
      const rows = await sql`select * from inquiries order by created_at desc limit 1000`;
      res.status(200).json(
        rows.map((r) => ({
          ...r.payload, id: r.id, status: r.status, note: r.note, read: r.read,
          assignee: r.assignee || '', activityLog: r.activity_log || [],
          reply: r.reply || '', repliedAt: r.replied_at, repliedBy: r.replied_by || '',
        }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

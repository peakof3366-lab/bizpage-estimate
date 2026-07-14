const { sql } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const payload = req.body || {};
    const id = payload.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      await sql`
        insert into quotes (id, status, note, dest_label, org_name, participants, total, payload)
        values (${id}, 'new', '', ${payload.destLabel || null}, ${payload.orgName || null},
                ${payload.participants ?? null}, ${payload.total ?? null}, ${JSON.stringify(payload)}::jsonb)
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
      const rows = await sql`select * from quotes order by created_at desc limit 1000`;
      res.status(200).json(rows.map((r) => ({
        ...r.payload, id: r.id, status: r.status, note: r.note,
        assignee: r.assignee || '', activityLog: r.activity_log || [],
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

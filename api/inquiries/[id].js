const { sql } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = req.body || {};
    try {
      await sql`
        update inquiries
        set status = ${body.status ?? 'unread'}, note = ${body.note ?? ''}, read = ${body.read ?? false}
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
      await sql`delete from inquiries where id = ${id}`;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'delete_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

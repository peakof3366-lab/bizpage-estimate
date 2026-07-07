const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!(await requireAdmin(req, res))) return;

  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'missing_fields' });

  try {
    const rows = await sql`select password_hash from admin_auth where id = 1`;
    const ok = rows.length && (await bcrypt.compare(current, rows[0].password_hash));
    if (!ok) return res.status(401).json({ error: 'invalid_current_password' });

    const hash = await bcrypt.hash(next, 12);
    await sql`update admin_auth set password_hash = ${hash}, updated_at = now() where id = 1`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'change_failed' });
  }
};

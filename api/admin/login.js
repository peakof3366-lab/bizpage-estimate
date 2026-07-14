const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { username, password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password_required' });

  try {
    const rows = await sql`select username, password_hash from admin_auth where id = 1`;
    if (!rows.length) return res.status(500).json({ error: 'admin_not_configured' });

    if ((username || '').trim() !== rows[0].username) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const token = await signSession();
    setSessionCookie(res, token);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login_failed' });
  }
};

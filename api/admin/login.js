const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');

/* 브루트포스 방지 락아웃 (신규) — 예전엔 비밀번호를 몇 번이든 무제한으로 시도할
   수 있었음. 계정별로 실패 횟수를 세다가 임계치에 도달하면 일정 시간 잠근다. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { username, password } = req.body || {};
  const uname = (username || '').trim();
  if (!uname || !password) return res.status(400).json({ error: 'invalid_credentials' });

  try {
    /* 멀티유저 계정 도입 (신규) — 예전엔 admin_auth 싱글톤(id=1) 한 행만 조회해
       전 직원이 같은 자격증명을 공유했음. 이제 username으로 실제 개인 계정을 찾는다. */
    const rows = await sql`
      select id, username, display_name, password_hash, role, active, failed_attempts, locked_until
      from staff_accounts where username = ${uname}
    `;
    if (!rows.length || !rows[0].active) return res.status(401).json({ error: 'invalid_credentials' });
    const acct = rows[0];

    if (acct.locked_until && new Date(acct.locked_until) > new Date()) {
      return res.status(423).json({ error: 'locked', lockedUntil: acct.locked_until });
    }

    const ok = await bcrypt.compare(password, acct.password_hash);
    if (!ok) {
      const attempts = (acct.failed_attempts || 0) + 1;
      const willLock = attempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = willLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null;
      await sql`
        update staff_accounts set failed_attempts = ${attempts}, locked_until = ${lockedUntil}
        where id = ${acct.id}
      `;
      return res.status(willLock ? 423 : 401).json({ error: willLock ? 'locked' : 'invalid_credentials' });
    }

    await sql`update staff_accounts set failed_attempts = 0, locked_until = null where id = ${acct.id}`;

    const token = await signSession({ id: acct.id, username: acct.username, displayName: acct.display_name, role: acct.role });
    setSessionCookie(res, token);
    res.status(200).json({ ok: true, displayName: acct.display_name, role: acct.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login_failed' });
  }
};

/* 관리자 계정 관련 소소한 엔드포인트 통합 (신규, 통합 엔드포인트).
   Vercel Hobby 플랜의 "배포당 서버리스 함수 12개" 제한 때문에 me.js/logout.js/
   change-password.js 세 파일을 이 하나로 합쳤다 — ?action= 쿼리로 구분.
   GET  ?action=me              = 로그인 세션 확인
   POST ?action=logout          = 로그아웃
   POST ?action=change-password = 비밀번호 변경 */
const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { requireAdmin, clearSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || 'me';

  if (action === 'me') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireAdmin(req, res))) return;
    return res.status(200).json({ ok: true });
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === 'change-password') {
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
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'change_failed' });
    }
  }

  res.status(400).json({ error: 'invalid_action' });
};

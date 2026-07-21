/* 관리자 계정 관련 소소한 엔드포인트 통합 (기존, 통합 엔드포인트).
   Vercel Hobby 플랜의 "배포당 서버리스 함수 12개" 제한 때문에 me.js/logout.js/
   change-password.js 세 파일을 이 하나로 합쳤다 — ?action= 쿼리로 구분.
   같은 이유로 멀티유저 계정 관리(직원 목록/생성/수정/비번리셋)도 새 파일을
   만들지 않고 여기 추가한다.
   GET  ?action=me                 = 로그인 세션 확인(실사용자 정보 반환)
   GET  ?action=staffList          = 활성 직원 목록(담당자 배정 드롭다운용, 전 직원 열람 가능)
   POST ?action=logout             = 로그아웃
   POST ?action=change-password    = 본인 비밀번호 변경
   POST ?action=createStaff        = 직원 계정 생성 (owner 전용)
   POST ?action=updateStaff        = 역할 변경/활성-비활성 (owner 전용)
   POST ?action=resetStaffPassword = 직원 비밀번호 강제 재설정 (owner 전용) */
const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { requireAdmin, requireRole, clearSessionCookie } = require('../_lib/auth');

const ROLES = new Set(['owner', 'manager', 'staff']);
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,30}$/;
/* admin.html이 이름을 onclick="...('${name}')" 형태로 문자열 보간해 렌더링하므로
   따옴표·꺾쇠괄호를 막아둔다(오늘 목적지 키 검증에도 쓴 것과 동일한 저렴한 방어). */
const DISPLAY_NAME_RE = /^[\p{L}\p{N}_\- ·]+$/u;

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || 'me';

  if (action === 'me') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireAdmin(req, res))) return;
    return res.status(200).json({
      ok: true, id: req.user.id, username: req.user.username,
      displayName: req.user.displayName, role: req.user.role,
    });
  }

  if (action === 'staffList') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireAdmin(req, res))) return;
    try {
      const rows = await sql`
        select id, username, display_name, role, active
        from staff_accounts order by created_at
      `;
      return res.status(200).json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
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
    if (String(next).length < 8) return res.status(400).json({ error: 'password_too_short' });

    try {
      const rows = await sql`select password_hash from staff_accounts where id = ${req.user.id}`;
      const ok = rows.length && (await bcrypt.compare(current, rows[0].password_hash));
      if (!ok) return res.status(401).json({ error: 'invalid_current_password' });

      const hash = await bcrypt.hash(next, 12);
      await sql`update staff_accounts set password_hash = ${hash}, updated_at = now() where id = ${req.user.id}`;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'change_failed' });
    }
  }

  if (action === 'createStaff') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireRole(req, res, ['owner']))) return;

    const { username, displayName, password, role } = req.body || {};
    const uname = String(username || '').trim();
    const dname = String(displayName || '').trim();
    if (!USERNAME_RE.test(uname)) return res.status(400).json({ error: 'invalid_username' });
    if (!dname || dname.length > 40 || !DISPLAY_NAME_RE.test(dname)) return res.status(400).json({ error: 'invalid_display_name' });
    if (!ROLES.has(role)) return res.status(400).json({ error: 'invalid_role' });
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'password_too_short' });

    try {
      const hash = await bcrypt.hash(password, 12);
      const inserted = await sql`
        insert into staff_accounts (username, display_name, password_hash, role)
        values (${uname}, ${dname}, ${hash}, ${role})
        on conflict (username) do nothing
        returning id, username, display_name, role, active
      `;
      if (!inserted.length) return res.status(409).json({ error: 'username_taken' });
      return res.status(200).json({ ok: true, staff: inserted[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'create_failed' });
    }
  }

  if (action === 'updateStaff') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireRole(req, res, ['owner']))) return;

    const { id, role, active, displayName } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing_id' });
    /* 본인 계정을 스스로 비활성화/강등하지 못하게 — 마지막 owner가 자기 권한을
       잃어버리면 아무도 직원 계정 관리를 할 수 없게 되는 상황을 막는다. */
    if (Number(id) === req.user.id && (active === false || (role && role !== 'owner'))) {
      return res.status(400).json({ error: 'cannot_modify_self' });
    }
    if (role !== undefined && !ROLES.has(role)) return res.status(400).json({ error: 'invalid_role' });
    if (displayName !== undefined) {
      const dname = String(displayName).trim();
      if (!dname || dname.length > 40 || !DISPLAY_NAME_RE.test(dname)) {
        return res.status(400).json({ error: 'invalid_display_name' });
      }
    }

    try {
      const existing = await sql`select role, active, display_name from staff_accounts where id = ${id}`;
      if (!existing.length) return res.status(404).json({ error: 'not_found' });
      const next = {
        role: role !== undefined ? role : existing[0].role,
        active: active !== undefined ? !!active : existing[0].active,
        display_name: displayName !== undefined ? String(displayName).trim() : existing[0].display_name,
      };
      await sql`
        update staff_accounts set role = ${next.role}, active = ${next.active},
          display_name = ${next.display_name}, updated_at = now()
        where id = ${id}
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'update_failed' });
    }
  }

  if (action === 'resetStaffPassword') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireRole(req, res, ['owner']))) return;

    const { id, newPassword } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing_id' });
    if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'password_too_short' });

    try {
      const hash = await bcrypt.hash(newPassword, 12);
      const updated = await sql`
        update staff_accounts set password_hash = ${hash}, failed_attempts = 0,
          locked_until = null, updated_at = now()
        where id = ${id}
        returning id
      `;
      if (!updated.length) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'reset_failed' });
    }
  }

  res.status(400).json({ error: 'invalid_action' });
};

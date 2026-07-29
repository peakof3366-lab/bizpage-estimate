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
   POST ?action=resetStaffPassword = 직원 비밀번호 강제 재설정 (owner 전용)
   POST ?action=signup             = 직원 자가 가입 신청 (인증 불필요 — 가입코드 필요)
   GET  ?action=signupSettings     = 가입코드 조회 (owner 전용)
   POST ?action=setSignupCode      = 가입코드 설정/해제 (owner 전용) */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sql } = require('../_lib/db');
const { requireAdmin, requireRole, clearSessionCookie } = require('../_lib/auth');

const ROLES = new Set(['owner', 'manager', 'staff']);
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,30}$/;

/* 직원 자가 가입 (신규) — 사장님이 계정 5개를 손으로 만드는 대신 직원이 직접
   신청하고 나중에 승인/승급하는 흐름.

   /admin.html은 로그인 없이 누구나 열 수 있는 주소라, 가입 버튼을 그냥 달면
   외부인도 계정 행을 만들 수 있다. 그래서 두 겹으로 막는다:
     ① 가입코드 — 사장님이 정한 공용 코드를 아는 사람만 신청 가능.
        코드가 설정돼 있지 않으면 가입 기능 자체가 꺼진 것으로 본다(기본 꺼짐).
     ② 승인 — 신청은 항상 active=false, role='staff'로만 생성된다.
        login.js가 !active를 거부하므로 승인 전에는 로그인이 안 된다.
        승급(매니저)은 기존 updateStaff로 owner만 할 수 있다.

   코드를 평문으로 두는 이유: 사장님이 직원에게 불러줘야 해서 화면에 보여야 한다.
   비밀번호가 아니라 '초대 코드'라 유출돼도 승인 단계가 남는다. */
const SIGNUP_CODE_KEY = 'staff_signup_code';
const SIGNUP_CODE_RE = /^[a-zA-Z0-9_-]{6,40}$/;
/* 승인 대기 계정이 이만큼 쌓이면 신청을 막는다 — 코드가 새어나갔을 때 DB가
   쓰레기 행으로 채워지는 걸 끊는 마지막 밸브. 사장님이 대기열을 정리하면 풀린다. */
const MAX_PENDING = 20;

async function getSignupCode() {
  try {
    const rows = await sql`select value from app_settings where key = ${SIGNUP_CODE_KEY}`;
    if (!rows.length) return null;
    const v = rows[0].value;
    const code = typeof v === 'string' ? v : (v && v.code);
    return code && String(code).length ? String(code) : null;
  } catch {
    return null;
  }
}

/* 길이가 다르면 timingSafeEqual이 예외를 던지므로 해시로 길이를 맞춘 뒤 비교한다.
   짧은 공용 코드라 타이밍 공격 실익은 크지 않지만, 비교 한 줄 값으로 막을 수 있다. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
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
      /* 승인 대기(self_signup)를 맨 위로 — 관리자가 설정 탭을 열자마자 기다리는
         사람이 보여야 한다. 아래는 기존대로 가입 순. */
      const rows = await sql`
        select id, username, display_name, role, active, self_signup, created_at
        from staff_accounts order by self_signup desc, created_at
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
      const existing = await sql`select role, active, display_name, self_signup from staff_accounts where id = ${id}`;
      if (!existing.length) return res.status(404).json({ error: 'not_found' });
      const next = {
        role: role !== undefined ? role : existing[0].role,
        active: active !== undefined ? !!active : existing[0].active,
        display_name: displayName !== undefined ? String(displayName).trim() : existing[0].display_name,
      };
      /* 활성화 = 승인. 승인하면 self_signup을 내려 대기 목록에서 빼고 평범한 직원
         계정이 된다(이후 비활성화해도 다시 '승인 대기'로 보이지 않는다 — 관리자가
         내보낸 계정과 새로 기다리는 사람이 섞이면 안 되므로). */
      const approved = next.active ? false : existing[0].self_signup;
      await sql`
        update staff_accounts set role = ${next.role}, active = ${next.active},
          display_name = ${next.display_name}, self_signup = ${approved}, updated_at = now()
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

  /* 직원 자가 가입 신청 — 유일하게 인증이 필요 없는 액션.
     생성되는 계정은 항상 role='staff' + active=false다. 클라이언트가 role이나
     active를 보내도 읽지 않는다 — 여기서 권한 상승이 가능하면 가입코드 하나로
     관리자 계정이 만들어진다. */
  if (action === 'signup') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const configured = await getSignupCode();
    if (!configured) return res.status(403).json({ error: 'signup_disabled' });

    const { username, displayName, password, code } = req.body || {};
    const uname = String(username || '').trim();
    const dname = String(displayName || '').trim();
    if (!code || !safeEqual(code, configured)) return res.status(403).json({ error: 'invalid_signup_code' });
    if (!USERNAME_RE.test(uname)) return res.status(400).json({ error: 'invalid_username' });
    if (!dname || dname.length > 40 || !DISPLAY_NAME_RE.test(dname)) return res.status(400).json({ error: 'invalid_display_name' });
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'password_too_short' });

    try {
      /* 대기열 = 승인 대기 중인 가입 신청만. 관리자가 일부러 비활성화한 계정까지
         세면, 퇴사자 계정을 꺼둔 것만으로 신규 가입이 막힌다. */
      const pending = await sql`select count(*)::int as n from staff_accounts where self_signup = true`;
      if (pending[0] && pending[0].n >= MAX_PENDING) return res.status(429).json({ error: 'too_many_pending' });

      const hash = await bcrypt.hash(password, 12);
      const inserted = await sql`
        insert into staff_accounts (username, display_name, password_hash, role, active, self_signup)
        values (${uname}, ${dname}, ${hash}, 'staff', false, true)
        on conflict (username) do nothing
        returning id
      `;
      if (!inserted.length) return res.status(409).json({ error: 'username_taken' });
      return res.status(200).json({ ok: true, pending: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'signup_failed' });
    }
  }

  /* 가입 신청 거절 — 비활성 확정 + 대기 표시 해제를 한 번에 한다.
     updateStaff로 흉내내려면 '활성화했다가 다시 비활성화'가 되어 그 사이에 로그인이
     열린다(승인 시에만 self_signup을 내리기 때문). 전용 액션이 필요한 이유다.
     행을 지우지 않는 이유: 같은 아이디로 재신청이 반복되는 걸 막고, 나중에
     생각이 바뀌면 활성화만 하면 되기 때문. */
  if (action === 'rejectSignup') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireRole(req, res, ['owner']))) return;

    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing_id' });
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'cannot_modify_self' });

    try {
      const updated = await sql`
        update staff_accounts set active = false, self_signup = false, updated_at = now()
        where id = ${id} and self_signup = true
        returning id
      `;
      if (!updated.length) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'reject_failed' });
    }
  }

  if (action === 'signupSettings') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireRole(req, res, ['owner']))) return;
    const code = await getSignupCode();
    return res.status(200).json({ enabled: !!code, code: code || '' });
  }

  if (action === 'setSignupCode') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!(await requireRole(req, res, ['owner']))) return;

    const raw = String((req.body && req.body.code) || '').trim();
    /* 빈 문자열 = 가입 기능 끄기. 코드를 지우면 신청 자체가 403이 된다. */
    if (raw && !SIGNUP_CODE_RE.test(raw)) return res.status(400).json({ error: 'invalid_signup_code_format' });

    try {
      await sql`
        insert into app_settings (key, value, updated_at, updated_by)
        values (${SIGNUP_CODE_KEY}, ${JSON.stringify(raw)}::jsonb, now(), ${req.user.displayName})
        on conflict (key) do update
          set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
      `;
      return res.status(200).json({ ok: true, enabled: !!raw });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'save_failed' });
    }
  }

  res.status(400).json({ error: 'invalid_action' });
};

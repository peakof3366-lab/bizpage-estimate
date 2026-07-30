const { SignJWT, jwtVerify } = require('jose');
const { sql } = require('./db');

const COOKIE_NAME = 'bp_admin_session';
const MAX_AGE_SECONDS = 12 * 3600;

/* JWT의 iat는 **초 단위로 내림**되므로, 토큰 발급 직후에 찍힌 updated_at이 iat보다
   최대 1초 앞서 보일 수 있다(승인 직후 로그인 등). 그 인공물로 방금 로그인한 사람을
   내쫓지 않도록 1초 여유를 둔다. active·role은 아래에서 값 자체를 직접 보므로 이
   여유가 비활성화·강등 반영을 늦추지는 않는다. */
const CLOCK_TOLERANCE_MS = 1000;

function getSecret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

/* 멀티유저 계정 도입 (신규) — payload가 예전엔 {role:'admin'} 고정이라 "누가"
   로그인했는지 정보가 아예 없었음. 이제 실제 staff_accounts 행을 그대로 실어서
   requireAdmin()이 req.user로 꺼내 쓸 수 있게 한다. */
async function signSession(user) {
  return new SignJWT({ sub: user.id, username: user.username, displayName: user.displayName, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

/* 세션 판정 (PW) — 토큰이 유효해도 **계정이 지금도 유효한지**를 DB 행으로 다시 본다.
   순수 함수로 떼어낸 이유: 판단 근거가 한곳에 모이고, 테스트가 DB 없이 모든 경우를
   실제로 평가할 수 있다(원문 정규식 대조로 끝내지 않기 위해).

   ⚠ 예전에는 `requireAdmin`이 **JWT만 검증하고 DB를 보지 않았다.** 세션이 12시간이라:
   ① 퇴사자 계정을 비활성화해도 이미 열어둔 탭에서 12시간 동안 요율 변경·리드 열람이
      그대로 됐다(login.js가 막는 건 '새 로그인'뿐이다).
   ② role이 토큰 안에 박혀 있어 **매니저 → 직원 강등이 12시간 반영되지 않았다** —
      그 사이 목적지 삭제·일괄조정이 계속 가능했다.
   ③ 비밀번호를 재설정해도 기존 세션이 끊기지 않아, 계정이 털렸을 때 대응 수단이 없었다.
   사장님 1명일 땐 드러나지 않고, 내보내기·강등이 실제로 일어나는 **팀원 5명 시점부터**
   의미가 생기는 문제다. */
function sessionRejection(payload, row) {
  if (!row) return 'account_gone';            // 삭제된 계정의 토큰
  if (row.active !== true) return 'account_inactive';  // 비활성화·가입 거절·승인 대기
  /* updated_at이 토큰 발급보다 나중이면 그 사이에 계정이 바뀐 것이다 — 비밀번호
     재설정·역할 변경·거절이 전부 updated_at을 갱신한다(api/admin/account.js).
     ⚠ **staff_accounts.updated_at을 만지는 것은 곧 "그 계정의 기존 세션을 끊는다"는
     뜻이다.** 표시명만 고치는 것 같은 가벼운 변경에도 재로그인이 요구되므로, 앞으로
     이 컬럼을 갱신하는 코드를 추가할 때 그 대가를 의식할 것. */
  const iatMs = Number(payload.iat) * 1000;
  if (!Number.isFinite(iatMs) || iatMs <= 0) return 'session_undated';
  const updatedMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  if (Number.isFinite(updatedMs) && updatedMs > iatMs + CLOCK_TOLERANCE_MS) return 'account_changed';
  return null;
}

async function requireAdmin(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = await verifySession(token);
  /* payload.sub이 없으면 이 배포 이전에 발급된 구형 토큰(예전엔 {role:'admin'}
     고정 payload였음) — req.user.role 등이 undefined인 채로 이상 동작하지 않도록
     무효 처리해서 재로그인을 유도한다. */
  if (!payload || !payload.sub) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  let row;
  try {
    const rows = await sql`
      select role, active, display_name, updated_at
      from staff_accounts where id = ${payload.sub}
    `;
    row = rows[0];
  } catch (err) {
    /* 조회 자체가 실패한 경우 — **통과시키지 않는다**(그러면 이 방어선이 DB 장애 때만
       조용히 열린다). 다만 401 '세션 만료'로 말하면 거짓말이고 담당자가 재로그인을
       반복하게 되므로, 재시도할 수 있는 503으로 구별해서 알린다.
       (관리자 화면의 leadWrite는 5xx를 백오프 재시도하므로 일시적 장애는 흡수된다.) */
    console.error('[auth] 계정 상태 조회 실패 — 세션을 통과시키지 않는다:', err);
    res.status(503).json({ error: 'session_check_failed' });
    return false;
  }

  const rejection = sessionRejection(payload, row);
  if (rejection) {
    /* 쿠키를 지운다 — 안 지우면 브라우저가 죽은 토큰을 계속 보내고, 화면은 매 요청마다
       같은 401을 받는다. */
    clearSessionCookie(res);
    res.status(401).json({ error: 'unauthorized', reason: rejection });
    return false;
  }

  /* role·displayName은 **토큰이 아니라 DB 값**을 쓴다 — 이게 강등 즉시 반영의 핵심이다.
     id·username은 서명으로 검증된 값이라 그대로 쓴다. */
  req.user = {
    id: payload.sub,
    username: payload.username,
    displayName: row.display_name || payload.displayName,
    role: row.role,
  };
  return true;
}

/* 역할 기반 접근 제어 (신규) — requireAdmin으로 로그인 여부를 먼저 확인한 뒤,
   req.user.role이 허용 목록에 없으면 403. 요율 일괄조정/설정 데이터삭제처럼
   "같은 엔드포인트를 여러 번 호출하는 것과 다를 게 없는" 액션은 서버에서 구분할
   근거가 없어 UI에서만 숨기고, 새 목적지 추가삭제·CMS 편집처럼 전용 엔드포인트가
   있는 액션만 여기로 강제한다(권한 매트릭스는 계획 문서 참고). */
async function requireRole(req, res, roles) {
  if (!(await requireAdmin(req, res))) return false;
  if (!roles.includes(req.user.role)) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

module.exports = {
  signSession, verifySession, setSessionCookie, clearSessionCookie,
  requireAdmin, requireRole, sessionRejection, COOKIE_NAME,
  MAX_AGE_SECONDS, CLOCK_TOLERANCE_MS,
};

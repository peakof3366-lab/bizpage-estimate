const { SignJWT, jwtVerify } = require('jose');

const COOKIE_NAME = 'bp_admin_session';
const MAX_AGE_SECONDS = 12 * 3600;

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

async function requireAdmin(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = await verifySession(token);
  /* payload.sub이 없으면 이 배포 이전에 발급된 구형 토큰(예전엔 {role:'admin'}
     고정 payload였음) — req.user.role 등이 undefined인 채로 이상 동작하지 않도록
     무효 처리해서 재로그인을 유도한다. */
  if (!payload || !payload.sub) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  req.user = { id: payload.sub, username: payload.username, displayName: payload.displayName, role: payload.role };
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

module.exports = { signSession, verifySession, setSessionCookie, clearSessionCookie, requireAdmin, requireRole, COOKIE_NAME };

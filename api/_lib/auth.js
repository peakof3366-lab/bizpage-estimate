const { SignJWT, jwtVerify } = require('jose');

const COOKIE_NAME = 'bp_admin_session';
const MAX_AGE_SECONDS = 12 * 3600;

function getSecret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

async function signSession() {
  return new SignJWT({ role: 'admin' })
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
  if (!payload) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

module.exports = { signSession, verifySession, setSessionCookie, clearSessionCookie, requireAdmin, COOKIE_NAME };

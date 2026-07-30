/* PW 검증: 계정을 비활성화·강등·비밀번호 재설정하면 **이미 발급된 세션이 즉시 끊기는가.**

   원래 결함 — `requireAdmin`이 **JWT만 검증하고 DB를 보지 않았다.** 세션이 12시간이라:
   ① 퇴사자 계정을 비활성화해도 이미 열어둔 탭에서 12시간 동안 요율 변경·리드 열람이
      그대로 됐다(login.js가 막는 건 '새 로그인'뿐).
   ② role이 토큰 안에 박혀 있어 **매니저 → 직원 강등이 12시간 반영되지 않았다** —
      그 사이 목적지 삭제·일괄조정이 계속 가능했다.
   ③ 비밀번호를 재설정해도 기존 세션이 끊기지 않아 계정 탈취 대응 수단이 없었다.

   사장님 1명일 땐 드러나지 않고, 내보내기·강등이 실제로 일어나는 **팀원 5명 시점부터**
   의미가 생긴다.

   이 파일은 **실제 requireAdmin을 그대로 실행한다** — `api/_lib/db`를 require 캐시에서
   가짜 sql로 바꿔 끼우므로 운영 DB·네트워크를 건드리지 않는다. 원문 정규식 대조만으로는
   "판정이 실제로 그렇게 도는지"를 확인할 수 없기 때문이다(이 저장소의 반복 사고 유형이
   '안전망이 한 번도 실행된 적 없음'이다).

   실행: node ai-loop/test_pW_session_revocation.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 sql을 require 캐시에 심는다 (운영 DB 미접속) ──────────────────
   auth.js는 로드 시점에 `require('./db')`를 하고, db.js는 그때 DATABASE_URL로
   neon()을 만든다. 캐시를 먼저 채워 두면 db.js 본문이 아예 실행되지 않는다. */
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
let sqlBehavior = () => [];
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: (strings, ...vals) => Promise.resolve().then(() => sqlBehavior(strings.join('?'), vals)),
  },
};

process.env.SESSION_SECRET = 'test-secret-for-pw-session-revocation-check';
const auth = require(path.join(ROOT, 'api', '_lib', 'auth.js'));

const authSrc = read(path.join('api', '_lib', 'auth.js'));
const accountSrc = read(path.join('api', 'admin', 'account.js'));

console.log('[1] 예전처럼 토큰만 믿는 경로가 남아 있지 않은가');
ok('requireAdmin이 staff_accounts를 조회한다',
  /from staff_accounts where id = \$\{payload\.sub\}/.test(authSrc));
ok('role을 DB 값으로 쓴다 (강등 즉시 반영의 핵심)',
  /role: row\.role,/.test(authSrc) && !/role: payload\.role/.test(authSrc));
ok('active를 확인한다', /row\.active !== true/.test(authSrc));
ok('판정이 순수 함수로 분리돼 있다', typeof auth.sessionRejection === 'function');
ok('시계 오차 여유가 상수로 분리됐다', /const CLOCK_TOLERANCE_MS = 1000;/.test(authSrc));

console.log('\n[2] 세션을 끊어야 하는 액션이 updated_at을 갱신하는가 (무효화의 근거)');
/* updated_at이 토큰 발급보다 나중이면 세션을 끊는다. 그 근거가 성립하려면
   비밀번호 재설정·역할 변경·거절이 실제로 updated_at을 갱신해야 한다. */
for (const [label, re] of [
  ['본인 비밀번호 변경', /update staff_accounts set password_hash = \$\{hash\}, updated_at = now\(\)/],
  ['역할·활성 변경(updateStaff)', /update staff_accounts set role = [\s\S]{0,160}updated_at = now\(\)/],
  ['비밀번호 재설정(관리자)', /update staff_accounts set password_hash = \$\{hash\}, failed_attempts = 0,[\s\S]{0,80}updated_at = now\(\)/],
  ['가입 거절', /update staff_accounts set active = false, self_signup = false, updated_at = now\(\)/],
]) {
  ok(`${label}이 updated_at을 갱신한다`, re.test(accountSrc));
}
/* ⚠ 로그인은 updated_at을 만지면 안 된다 — 만지면 방금 발급한 자기 토큰을 스스로
   무효화해 로그인 직후 튕기는 순환이 생긴다. */
const loginSrc = read(path.join('api', 'admin', 'login.js'));
ok('로그인은 updated_at을 갱신하지 않는다 (자기 토큰 자폭 방지)',
  !/update staff_accounts set[\s\S]{0,120}updated_at = now\(\)/.test(loginSrc));

console.log('\n[3] sessionRejection — 실제로 평가해 본다');
const now = Date.now();
const iat = Math.floor(now / 1000);
const base = { role: 'manager', active: true, display_name: '테스트담당', updated_at: new Date(now - 60_000) };
const P = { sub: 7, username: 'tester', displayName: '테스트담당', role: 'manager', iat };

ok('정상 계정은 통과', auth.sessionRejection(P, base) === null, String(auth.sessionRejection(P, base)));
ok('삭제된 계정은 account_gone',
  auth.sessionRejection(P, undefined) === 'account_gone');
ok('비활성 계정은 account_inactive',
  auth.sessionRejection(P, { ...base, active: false }) === 'account_inactive');
ok('승인 대기(active=false)도 막힌다',
  auth.sessionRejection(P, { ...base, active: false, self_signup: true }) === 'account_inactive');
ok('토큰 발급 뒤에 계정이 바뀌면 account_changed',
  auth.sessionRejection(P, { ...base, updated_at: new Date(now + 5_000) }) === 'account_changed');
ok('iat가 없는 토큰은 통과시키지 않는다',
  auth.sessionRejection({ ...P, iat: undefined }, base) === 'session_undated');
/* iat는 초 단위로 내림되므로 발급 직후 updated_at이 iat보다 살짝 앞서 보일 수 있다.
   이걸 무효화로 보면 **승인 직후 로그인한 사람이 바로 튕긴다** — 여유가 필요한 이유. */
ok('발급 직전(0.5초 전) 변경은 무효화하지 않는다 (거짓 잠금 방지)',
  auth.sessionRejection(P, { ...base, updated_at: new Date(now - 500) }) === null);
ok('active가 boolean이 아니면 통과시키지 않는다',
  auth.sessionRejection(P, { ...base, active: 'true' }) === 'account_inactive');

/* ── requireAdmin 실동작 ─────────────────────────────────────────────── */
function fakeRes() {
  return {
    code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
  };
}
const cookieCleared = (res) => /bp_admin_session=;/.test(String(res.headers['Set-Cookie'] || ''));

(async () => {
  console.log('\n[4] requireAdmin 실동작 — 토큰은 유효하지만 계정이 바뀐 경우');
  const token = await auth.signSession({ id: 7, username: 'tester', displayName: '테스트담당', role: 'manager' });
  const req = () => ({ cookies: { bp_admin_session: token } });

  sqlBehavior = () => [{ role: 'manager', active: true, display_name: '테스트담당', updated_at: new Date(Date.now() - 60_000) }];
  let rq = req(), rs = fakeRes();
  ok('정상 세션은 통과한다', (await auth.requireAdmin(rq, rs)) === true, JSON.stringify(rs.body));
  ok('req.user가 채워진다', rq.user && rq.user.id === 7 && rq.user.role === 'manager', JSON.stringify(rq.user));

  /* ② 강등 — 토큰에는 manager가 박혀 있는데 DB는 staff다. */
  sqlBehavior = () => [{ role: 'staff', active: true, display_name: '테스트담당', updated_at: new Date(Date.now() - 60_000) }];
  rq = req(); rs = fakeRes();
  await auth.requireAdmin(rq, rs);
  ok('강등이 즉시 반영된다 (토큰의 manager를 쓰지 않는다)', rq.user.role === 'staff', JSON.stringify(rq.user));
  rq = req(); rs = fakeRes();
  ok('강등된 매니저는 매니저 전용 액션에서 403',
    (await auth.requireRole(rq, rs, ['owner', 'manager'])) === false && rs.code === 403,
    `${rs.code} ${JSON.stringify(rs.body)}`);

  /* ① 비활성화 — 퇴사자 계정. */
  sqlBehavior = () => [{ role: 'manager', active: false, display_name: '테스트담당', updated_at: new Date(Date.now() - 60_000) }];
  rq = req(); rs = fakeRes();
  ok('비활성 계정은 거부된다 (예전엔 12시간 통과했다)',
    (await auth.requireAdmin(rq, rs)) === false && rs.code === 401,
    `${rs.code} ${JSON.stringify(rs.body)}`);
  ok('이유를 응답에 남긴다', rs.body && rs.body.reason === 'account_inactive', JSON.stringify(rs.body));
  ok('죽은 쿠키를 지운다 (계속 보내지 않게)', cookieCleared(rs), JSON.stringify(rs.headers));

  /* ③ 비밀번호 재설정 — updated_at이 토큰보다 나중. */
  sqlBehavior = () => [{ role: 'manager', active: true, display_name: '테스트담당', updated_at: new Date(Date.now() + 5_000) }];
  rq = req(); rs = fakeRes();
  ok('비밀번호 재설정 후 기존 세션이 끊긴다',
    (await auth.requireAdmin(rq, rs)) === false && rs.body.reason === 'account_changed',
    JSON.stringify(rs.body));

  /* 삭제된 계정 */
  sqlBehavior = () => [];
  rq = req(); rs = fakeRes();
  ok('삭제된 계정의 토큰도 거부된다',
    (await auth.requireAdmin(rq, rs)) === false && rs.body.reason === 'account_gone',
    JSON.stringify(rs.body));

  console.log('\n[5] DB 조회가 실패하면 — 열리지 않고, 만료라고 거짓말하지 않는가');
  sqlBehavior = () => { throw new Error('connection reset'); };
  rq = req(); rs = fakeRes();
  const okd = await auth.requireAdmin(rq, rs);
  ok('통과시키지 않는다 (DB 장애 때만 방어선이 열리면 안 된다)', okd === false);
  ok('401 만료가 아니라 503으로 구별한다 (담당자가 재로그인을 반복하지 않게)',
    rs.code === 503 && rs.body.error === 'session_check_failed',
    `${rs.code} ${JSON.stringify(rs.body)}`);
  ok('일시적 오류이므로 쿠키를 지우지 않는다', !cookieCleared(rs), JSON.stringify(rs.headers));

  console.log('\n[6] 토큰 자체가 무효한 경우 (회귀)');
  sqlBehavior = () => [{ role: 'owner', active: true, display_name: 'x', updated_at: new Date(0) }];
  rs = fakeRes();
  ok('쿠키가 없으면 401', (await auth.requireAdmin({ cookies: {} }, rs)) === false && rs.code === 401);
  rs = fakeRes();
  ok('서명이 틀린 토큰은 401',
    (await auth.requireAdmin({ cookies: { bp_admin_session: token + 'x' } }, rs)) === false && rs.code === 401);
  const legacy = await (async () => {
    /* 구형 토큰({role:'admin'}, sub 없음) — 예전 배포에서 발급된 것. */
    const { SignJWT } = require('jose');
    return new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt().setExpirationTime('12h')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  })();
  rs = fakeRes();
  ok('sub 없는 구형 토큰은 401',
    (await auth.requireAdmin({ cookies: { bp_admin_session: legacy } }, rs)) === false && rs.code === 401);

  console.log('\n[7] 화면이 503을 사람 말로 설명하는가');
  const adminSrc = read('admin.html');
  ok('요율 저장 오류 문구에 session_check_failed가 있다',
    /session_check_failed/.test(adminSrc));
  ok('리드 쓰기 오류 문구에도 있다',
    (adminSrc.match(/session_check_failed/g) || []).length >= 2,
    String((adminSrc.match(/session_check_failed/g) || []).length));

  console.log('\n[8] 503이 깨우는 옛 구멍 — loadRemoteData가 res.ok를 보는가');
  /* PW 전에는 401만 확인하고 응답 본문을 그대로 캐시에 넣었다. 500·503이면
     `{error:'...'}` 객체가 목록 자리에 들어가 렌더가 터지고 캐시까지 오염된다.
     PW가 503을 새로 쓰기 시작하므로 실제로 닿는 경로가 됐다. */
  const syncBlock = (adminSrc.match(/async function loadRemoteData\(\)[\s\S]*?\n  \}/) || [''])[0];
  ok('res.ok를 확인한다', /if \(!inqRes\.ok \|\| !qRes\.ok\)/.test(syncBlock));
  ok('실패하면 캐시를 건드리지 않고 물러난다',
    /캐시를 유지한다[\s\S]{0,200}return false;/.test(syncBlock));
  ok('배열인지까지 확인한다',
    /Array\.isArray\(inqRows\) \|\| !Array\.isArray\(qRows\)/.test(syncBlock));
  ok('옛 무조건 대입이 남아 있지 않다',
    !/set\(KEYS\.contacts, await inqRes\.json\(\)\)/.test(adminSrc));
  ok('실패 이유를 로그인 화면에 띄운다',
    /function showSyncFailureOnLogin/.test(adminSrc)
    && /if \(!ok\) \{ showSyncFailureOnLogin\(\); return; \}/.test(adminSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

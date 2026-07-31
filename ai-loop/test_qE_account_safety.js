/* QE 검증: 팀원 온보딩 경로 — 계정 안전망이 **실제로 발동하는가**.

   이 경로에서 나온 결함 넷을 고정한다. 넷 다 "코드에 방어가 적혀 있는데 실행되면
   아무 일도 안 하거나, 화면이 사실과 다른 말을 한다" 유형이다.

   ① 자기보호 가드가 타입 불일치로 죽어 있었다.
      `staff_accounts.id`는 bigserial이라 드라이버가 **문자열**로 돌려주고(실제 운영
      DB로 확인: id="1"), JWT의 sub도 그 문자열을 그대로 싣는다. 그런데 가드는
      `Number(id) === req.user.id`였다 — `1 === "1"`이라 **한 번도 참이 된 적이 없다.**
      사장님이 본인을 강등·비활성화하면 updateStaff가 owner 전용이라 되돌릴 사람이
      아무도 남지 않는다(DB를 직접 고쳐야 복구). 화면이 본인 행을 가려주고 있어
      드러나지 않았을 뿐, 서버 방어선은 비어 있었다.
   ② `active` 판정 기준이 둘이었다. 가드는 `active === false`, 적용은 `!!active`라
      `active: 0`이 가드를 그냥 지나 계정을 껐고, `'false'`는 반대로 켰다.
   ③ 비밀번호를 바꾸면 **본인 세션이 조용히 끊겼다.** updated_at 갱신 = 그 계정의
      모든 세션 무효화(PW)인데 방금 바꾼 사람도 예외가 아니라, 화면은 "변경되었습니다"
      라고 말한 직후부터 401이 나고 다음 동작에서 "로그인이 만료되었습니다"(틀린 사유)로
      튕겼다. 승인받고 첫 로그인한 직원이 정확히 이 칸을 지난다.
   ④ 가입코드 조회 실패가 "가입 기능 꺼짐"으로 둔갑했다(getSignupCode의 catch→null).
      신청자는 관리자를 찾아가고, 사장님 화면은 코드 칸이 빈 채로 보이며, 그 빈 칸을
      저장하면 가입이 **실제로** 꺼진다(읽기 실패 → 파괴적 쓰기).

   방식: 원문 정규식 대조로 끝내지 않는다. `api/_lib/db`를 require 캐시에서 가짜 sql로
   바꿔치고 **실제 핸들러를 호출**하며, 세션은 **진짜 auth.js로 서명·검증**한다.
   화면 쪽은 jsdom으로 admin.html을 띄워 실제로 눌러 본다.

   실행: node ai-loop/test_qE_account_safety.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB ────────────────────────────────────────────────────────────────
   ⚠ auth.js가 로드되는 순간 `require('./db')`가 실행되고 db.js는 그때 DATABASE_URL로
   neon()을 만든다. 캐시를 **먼저** 채워야 db.js 본문이 아예 실행되지 않는다
   (test_pW가 쓰는 방식과 동일 — 운영 DB에 닿지 않는다). */
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
const stmts = [];              // 실행된 SQL 기록 — "안 고쳤다"를 확인하는 근거
let account = null;            // staff_accounts 한 행이라고 치고 쓰는 상태
let signupCodeRow = null;      // app_settings의 가입코드 행 (null = 행 없음)
/* DB 장애 재현 스위치. 켜져 있는 동안 핸들러가 남기는 console.error는 **정상 동작**이라
   삼킨다 — 일부러 낸 스택 추적을 그대로 뿜으면 진짜 오류와 구별이 안 되고, 사람이
   테스트 출력을 안 보게 된다. 대신 몇 번 났는지는 세서 아래에서 확인한다. */
let dbThrows = false;
let swallowed = 0;
const realError = console.error;
console.error = (...a) => { if (dbThrows) swallowed++; else realError(...a); };

require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: (strings, ...vals) => Promise.resolve().then(() => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim();
      stmts.push({ q, vals });
      if (dbThrows) throw new Error('의도적으로 끊은 DB 연결');

      if (/from app_settings where key/.test(q)) return signupCodeRow ? [{ value: signupCodeRow }] : [];
      if (/select role, active, display_name, updated_at from staff_accounts/.test(q)) {
        return account ? [{
          role: account.role, active: account.active,
          display_name: account.display_name, updated_at: account.updated_at,
        }] : [];
      }
      if (/select role, active, display_name, self_signup from staff_accounts/.test(q)) {
        return account ? [{
          role: account.role, active: account.active,
          display_name: account.display_name, self_signup: account.self_signup,
        }] : [];
      }
      if (/select password_hash from staff_accounts/.test(q)) {
        return account ? [{ password_hash: account.password_hash }] : [];
      }
      if (/^update staff_accounts/.test(q)) {
        /* 실제 now()처럼 이 순간을 찍는다 — 세션이 끊기는지 여부가 여기에 달려 있다. */
        account.updated_at = new Date();
        if (/set role = /.test(q)) { account.role = vals[0]; account.active = vals[1]; }
        if (/set active = false, self_signup = false/.test(q)) { account.active = false; account.self_signup = false; }
        if (/password_hash/.test(q)) account.password_hash = vals[0];
        return [{ id: account.id }];
      }
      return [];
    }),
  },
};

process.env.SESSION_SECRET = 'test-secret-for-qE-account-safety';
const auth = require(path.join(ROOT, 'api', '_lib', 'auth.js'));
const handler = require(path.join(ROOT, 'api', 'admin', 'account.js'));
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));

/* ── 호출 헬퍼 ── */
function mockRes() {
  const res = {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
  };
  return res;
}

/* 로그인한 사람으로서 한 번 호출한다. 세션 쿠키는 **진짜 서명**으로 만든다 —
   가짜 req.user를 밀어 넣으면 정작 이 경로가 실제로 통과하는지를 못 본다. */
async function call(action, { method = 'POST', body = {}, query = {}, token } = {}) {
  const res = mockRes();
  const req = {
    method, body,
    query: { action, ...query },
    cookies: token === null ? {} : { [auth.COOKIE_NAME]: token || (await freshToken()) },
  };
  await handler(req, res);
  return res;
}

async function freshToken() {
  return auth.signSession({
    id: account.id, username: account.username,
    displayName: account.display_name, role: account.role,
  });
}

function resetAccount(over = {}) {
  account = {
    id: '1',                      // ⚠ 문자열 — 운영 DB가 실제로 이렇게 준다
    username: 'admin',
    display_name: '사장님',
    role: 'owner',
    active: true,
    self_signup: false,
    password_hash: bcrypt.hashSync('correct-horse-8', 10),
    updated_at: new Date(Date.now() - 60_000),  // 로그인보다 앞선 시점
    ...over,
  };
  stmts.length = 0;
  dbThrows = false;
}

const updateRan = () => stmts.some(s => /^update staff_accounts/.test(s.q));

(async () => {
  console.log('[1] 자기보호 가드가 실제로 발동하는가 — id가 문자열이라는 사실 위에서');

  /* 이 저장소가 당한 형태 그대로 재현: 화면은 id를 숫자로도, 문자열로도 보낼 수 있다.
     예전 가드 `Number(id) === req.user.id`는 둘 다 통과시켰다(비교 대상이 문자열이므로). */
  ok('예전 가드 식은 문자열 id에 대해 참이 될 수 없다(결함의 정체)',
    (Number('1') === '1') === false);

  for (const [label, sentId] of [['문자열 id', '1'], ['숫자 id', 1]]) {
    resetAccount();
    let r = await call('updateStaff', { body: { id: sentId, role: 'staff' } });
    ok(`본인 강등 거부 — ${label}`, r.statusCode === 400 && r.body.error === 'cannot_modify_self',
      `${r.statusCode} ${JSON.stringify(r.body)}`);
    ok(`본인 강등 시 DB를 건드리지 않는다 — ${label}`, !updateRan());

    resetAccount();
    r = await call('updateStaff', { body: { id: sentId, active: false } });
    ok(`본인 비활성화 거부 — ${label}`, r.statusCode === 400 && r.body.error === 'cannot_modify_self',
      `${r.statusCode} ${JSON.stringify(r.body)}`);
    ok(`본인 비활성화 시 계정이 살아 있다 — ${label}`, account.active === true && !updateRan());

    resetAccount({ self_signup: true });
    r = await call('rejectSignup', { body: { id: sentId } });
    ok(`본인 가입 거절 거부 — ${label}`, r.statusCode === 400 && r.body.error === 'cannot_modify_self',
      `${r.statusCode} ${JSON.stringify(r.body)}`);
    ok(`본인 가입 거절 시 계정이 살아 있다 — ${label}`, account.active === true && !updateRan());
  }

  /* 남을 막는 게 아니라 본인만 막는 것이다 — 가드가 과하게 잠기면 승인·강등이 안 된다. */
  resetAccount();
  let r = await call('updateStaff', { body: { id: '7', role: 'manager' } });
  ok('다른 사람의 역할 변경은 그대로 된다', r.statusCode === 200 && updateRan(),
    `${r.statusCode} ${JSON.stringify(r.body)}`);

  resetAccount({ self_signup: true });
  r = await call('rejectSignup', { body: { id: '9' } });
  ok('다른 사람의 가입 거절은 그대로 된다', r.statusCode === 200, `${r.statusCode}`);

  console.log('\n[2] active는 boolean만 받는다 — 판정 기준이 둘이면 어긋난다');
  for (const bad of [0, 1, 'false', 'true', '', null]) {
    resetAccount();
    r = await call('updateStaff', { body: { id: '7', active: bad } });
    ok(`active: ${JSON.stringify(bad)} 거부`, r.statusCode === 400 && r.body.error === 'invalid_active',
      `${r.statusCode} ${JSON.stringify(r.body)}`);
    ok(`active: ${JSON.stringify(bad)} — DB를 건드리지 않는다`, !updateRan());
  }
  /* 예전 코드가 어떻게 뚫렸는지를 남긴다: 가드는 ===false, 적용은 !!active였다. */
  ok('예전 코드에서 active:0이 가드를 지나 비활성화됐다(결함의 정체)',
    (0 === false) === false && !!0 === false);

  resetAccount();
  r = await call('updateStaff', { body: { id: '7', active: false } });
  ok('제대로 된 boolean false는 통과해 비활성화한다', r.statusCode === 200 && updateRan());

  console.log('\n[3] 비밀번호를 바꾼 사람이 로그아웃되지 않는다 (다른 기기는 끊긴다)');
  resetAccount();
  const oldToken = await freshToken();
  await new Promise(res2 => setTimeout(res2, 1100));   // 예전 세션이 확실히 '이전'이 되도록
  r = await call('change-password', { body: { current: 'correct-horse-8', next: 'new-password-9' }, token: oldToken });
  ok('변경 성공', r.statusCode === 200 && r.body.ok === true, `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('화면에 설명할 근거를 돌려준다(otherSessionsRevoked)', r.body.otherSessionsRevoked === true);

  const setCookie = r.headers['Set-Cookie'] || '';
  ok('새 세션 쿠키를 내려준다', setCookie.includes(auth.COOKIE_NAME + '=') && !/Max-Age=0/.test(setCookie),
    setCookie);
  const newToken = String(setCookie).split(';')[0].split('=').slice(1).join('=');
  const newPayload = await auth.verifySession(newToken);
  ok('새 토큰이 실제로 유효하다', !!(newPayload && newPayload.sub));
  /* 핵심: **진짜 sessionRejection**에 방금 찍힌 updated_at을 넣어 본다. */
  ok('새 세션은 방금의 updated_at을 넘어서 살아남는다',
    auth.sessionRejection(newPayload, { active: true, updated_at: account.updated_at }) === null,
    String(auth.sessionRejection(newPayload, { active: true, updated_at: account.updated_at })));

  const oldPayload = await auth.verifySession(oldToken);
  ok('반면 다른 기기의 예전 세션은 끊긴다',
    auth.sessionRejection(oldPayload, { active: true, updated_at: account.updated_at }) === 'account_changed');
  ok('비밀번호가 실제로 바뀌었다', bcrypt.compareSync('new-password-9', account.password_hash));

  resetAccount();
  r = await call('change-password', { body: { current: '틀린비번', next: 'new-password-9' } });
  ok('현재 비밀번호가 틀리면 401 invalid_current_password', r.statusCode === 401 && r.body.error === 'invalid_current_password');
  ok('틀렸을 때 쿠키를 새로 내주지 않는다', !r.headers['Set-Cookie']);

  console.log('\n[4] 본인 비밀번호를 관리자 화면에서 재설정해도 마찬가지다');
  resetAccount();
  r = await call('resetStaffPassword', { body: { id: '1', newPassword: 'reset-password-9' } });
  ok('본인 재설정 — self:true로 알린다', r.statusCode === 200 && r.body.self === true, JSON.stringify(r.body));
  ok('본인 재설정 — 세션을 새로 발급한다', !!r.headers['Set-Cookie']);

  resetAccount();
  r = await call('resetStaffPassword', { body: { id: '7', newPassword: 'reset-password-9' } });
  ok('남의 비밀번호 재설정 — self:false', r.statusCode === 200 && r.body.self === false);
  ok('남의 비밀번호 재설정 — 내 쿠키를 건드리지 않는다', !r.headers['Set-Cookie']);

  console.log('\n[5] 가입코드: "꺼져 있다"와 "확인 못 했다"를 구별한다');
  resetAccount();
  signupCodeRow = null;
  r = await call('signup', { body: { username: 'newbie', displayName: '신입', password: 'password-1234', code: 'TEAM2026' }, token: null });
  ok('코드 미설정이면 여전히 403 signup_disabled', r.statusCode === 403 && r.body.error === 'signup_disabled',
    `${r.statusCode} ${JSON.stringify(r.body)}`);

  resetAccount();
  signupCodeRow = 'TEAM2026';
  dbThrows = true;
  r = await call('signup', { body: { username: 'newbie', displayName: '신입', password: 'password-1234', code: 'TEAM2026' }, token: null });
  ok('DB 장애를 403(꺼짐)이 아니라 503으로 알린다', r.statusCode === 503 && r.body.error === 'signup_check_failed',
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('DB 장애가 signup_disabled로 둔갑하지 않는다', r.body.error !== 'signup_disabled');

  resetAccount();
  signupCodeRow = 'TEAM2026';
  const ownerToken = await freshToken();
  dbThrows = true;
  r = await call('signupSettings', { method: 'GET', token: ownerToken });
  /* requireRole이 먼저 DB를 보므로 여기선 503(session_check_failed)이 나는 게 정상이다.
     확인할 것은 **어느 쪽이든 200 + code:''로 내려가지 않는다**는 것 하나다. */
  ok('사장님 화면에 빈 코드를 사실처럼 내려주지 않는다',
    r.statusCode !== 200 && !(r.body && r.body.code === ''),
    `${r.statusCode} ${JSON.stringify(r.body)}`);

  resetAccount();
  signupCodeRow = 'TEAM2026';
  r = await call('signupSettings', { method: 'GET' });
  ok('정상일 때는 코드를 그대로 보여준다', r.statusCode === 200 && r.body.code === 'TEAM2026' && r.body.enabled === true,
    JSON.stringify(r.body));

  /* getSignupCode가 더 이상 실패를 삼키지 않는지 — 함수 자체로 확인 */
  resetAccount();
  dbThrows = true;
  let threw = false;
  try {
    await call('signup', { body: {}, token: null });
  } catch { threw = true; }
  ok('조회 실패가 핸들러 밖으로 새지 않는다(503으로 잡힌다)', !threw);
  /* 조용히 넘어가지 않았는가 — 503으로 사람에게 알리는 것과 별개로 서버 로그에도
     흔적이 남아야 한다(결함 생성기 ②: 폴백할 때는 반드시 흔적을 남긴다). */
  ok('DB 장애마다 서버 로그에 흔적을 남긴다', swallowed >= 3, `기록 ${swallowed}건`);

  console.log('\n[6] 화면(admin.html)이 실제로 그렇게 동작하는가 — jsdom');
  const dom = await bootAdmin();
  const w = dom.window;

  /* 본인 행 보호: id가 문자열이든 숫자든 본인 행에는 비활성화 버튼이 없어야 한다. */
  for (const [label, meId, rowId] of [['둘 다 문자열', '1', '1'], ['한쪽만 숫자', '1', 1], ['둘 다 숫자', 1, 1]]) {
    w.__setUser({ id: meId, role: 'owner', displayName: '사장님' });
    w.__setStaffList([
      { id: rowId, username: 'admin', display_name: '사장님', role: 'owner', active: true, self_signup: false },
      { id: '4', username: 'staff1', display_name: '김담당', role: 'staff', active: true, self_signup: false },
    ]);
    w.renderStaffAdmin();
    const rows = w.document.querySelectorAll('#staff-admin-tbody tr');
    const mine = rows[0].innerHTML;
    ok(`본인 행 역할 select이 잠겨 있다 — ${label}`, /disabled/.test(rows[0].querySelector('select').outerHTML));
    ok(`본인 행에 비활성화 버튼이 없다 — ${label}`, !/toggleStaffActive/.test(mine), mine.slice(0, 160));
    ok(`남의 행에는 비활성화 버튼이 있다 — ${label}`, /toggleStaffActive/.test(rows[1].innerHTML));
  }

  /* id를 따옴표로 감싸 원래 형태 그대로 보내는가 (문자열 id가 숫자로 뭉개지지 않는다) */
  ok('onclick이 id를 문자열로 넘긴다', /toggleStaffActive\('4'/.test(w.document.getElementById('staff-admin-tbody').innerHTML));

  /* 승인은 확인창을 한 번만 띄운다 */
  let confirms = [];
  w.confirm = (m) => { confirms.push(m); return true; };
  w.__setStaffList([{ id: '5', username: 'staff2', display_name: '이신입', role: 'staff', active: false, self_signup: true }]);
  w.renderStaffAdmin();
  w.__resetFetchLog();
  await w.approveStaff('5', '이신입');
  ok('승인 시 확인창은 한 번만', confirms.length === 1, `${confirms.length}회: ${JSON.stringify(confirms)}`);
  ok('승인 확인창이 승인 이야기를 한다', /승인/.test(confirms[0] || ''), confirms[0]);
  const approveCall = w.__fetchLog().find(c => String(c.url).includes('updateStaff'));
  ok('승인이 updateStaff를 부른다', !!approveCall);
  ok('승인이 active를 진짜 boolean으로 보낸다', approveCall && JSON.parse(approveCall.body).active === true,
    approveCall && approveCall.body);

  console.log('\n[7] 비밀번호 변경 화면이 실패 사유를 구별해 말하는가');
  const pwMsg = () => w.document.getElementById('pwMsg').textContent;
  const fillPw = () => {
    w.document.getElementById('pwCurrent').value = 'current-pass-1';
    w.document.getElementById('pwNew').value = 'new-password-9';
    w.document.getElementById('pwConfirm').value = 'new-password-9';
  };
  const cases = [
    { name: '현재 비밀번호 오류', reply: { ok: false, status: 401, body: { error: 'invalid_current_password' } }, want: /현재 비밀번호가 올바르지 않습니다/ },
    { name: '세션 만료', reply: { ok: false, status: 401, body: { error: 'unauthorized' } }, want: /로그인이 만료/ },
    { name: '계정 상태 확인 실패(503)', reply: { ok: false, status: 503, body: { error: 'session_check_failed' } }, want: /로그인이 풀린 것은 아니/ },
    { name: '서버 오류(500)', reply: { ok: false, status: 500, body: { error: 'change_failed' } }, want: /오류 500/ },
    { name: '성공', reply: { ok: true, status: 200, body: { ok: true, otherSessionsRevoked: true } }, want: /다른 기기/ },
  ];
  for (const c of cases) {
    w.__setPwReply(c.reply);
    fillPw();
    await w.changePw();
    ok(`${c.name} → 사유가 구별된다`, c.want.test(pwMsg()), pwMsg());
    if (c.name !== '현재 비밀번호 오류') {
      ok(`${c.name} → "현재 비밀번호가 틀렸다"고 하지 않는다`, !/현재 비밀번호가 올바르지 않습니다/.test(pwMsg()), pwMsg());
    }
  }

  console.log('\n[8] 가입코드를 못 읽었으면 저장을 막는다 (읽기 실패 → 파괴적 쓰기 차단)');
  w.__setSignupSettingsReply({ ok: false, status: 503, body: { error: 'signup_check_failed' } });
  await w.loadSignupCode();
  const codeMsg = () => w.document.getElementById('signup-code-msg').textContent;
  ok('불러오기 실패를 화면에 말한다', /불러오지 못했습니다/.test(codeMsg()), codeMsg());
  ok('빈 칸이 현재 값인 것처럼 보이지 않는다', /지금 설정된 값이 아니/.test(codeMsg()), codeMsg());

  w.__resetFetchLog();
  await w.submitSignupCode('');
  ok('못 읽은 상태에서는 저장 요청 자체를 보내지 않는다',
    !w.__fetchLog().some(c => String(c.url).includes('setSignupCode')),
    JSON.stringify(w.__fetchLog().map(c => c.url)));
  ok('왜 막았는지 말한다', /확인하지 못한 상태/.test(codeMsg()), codeMsg());

  w.__setSignupSettingsReply({ ok: true, status: 200, body: { enabled: true, code: 'TEAM2026' } });
  await w.loadSignupCode();
  ok('정상 조회 후에는 값이 채워진다', w.document.getElementById('signup-code-input').value === 'TEAM2026');
  w.__resetFetchLog();
  await w.submitSignupCode('TEAM2027');
  ok('정상 조회 후에는 저장이 나간다', w.__fetchLog().some(c => String(c.url).includes('setSignupCode')));

  console.log('\n────────────────────────────────────────────');
  /* ⚠ 이 줄의 형식은 run_all_tests.js가 찾는 '결과: N pass / M fail'이어야 한다.
     다른 말로 적으면 러너가 요약을 못 찾아 **크래시로 집계**한다(실제로 겪었다). */
  console.log(`결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { realError(err); process.exit(1); });

/* admin.html을 실제로 띄운다. currentUser·staffListCache·signupCodeLoaded는 let 전역이라
   window에 붙지 않으므로(테스트 p2b와 같은 이유) 같은 스코프에 주입구를 심는다. */
async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setUser = u => { currentUser = u; };
  window.__setStaffList = l => { staffListCache = l; };
  window.renderStaffAdmin = renderStaffAdmin;
  window.approveStaff = approveStaff;
  window.changePw = changePw;
  window.loadSignupCode = loadSignupCode;
  window.submitSignupCode = submitSignupCode;
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다 — 주입구를 심을 수 없습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      const log = [];
      let pwReply = { ok: true, status: 200, body: { ok: true } };
      let signupReply = { ok: true, status: 200, body: { enabled: false, code: '' } };
      w.__fetchLog = () => log;
      w.__resetFetchLog = () => { log.length = 0; };
      w.__setPwReply = (r) => { pwReply = r; };
      w.__setSignupSettingsReply = (r) => { signupReply = r; };
      const reply = (r) => Promise.resolve({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) });
      w.fetch = (url, opts) => {
        const u = String(url);
        log.push({ url: u, body: opts && opts.body });
        if (u.includes('change-password')) return reply(pwReply);
        if (u.includes('signupSettings')) return reply(signupReply);
        if (u.includes('setSignupCode')) return reply({ ok: true, status: 200, body: { ok: true, enabled: true } });
        if (u.includes('updateStaff')) return reply({ ok: true, status: 200, body: { ok: true } });
        if (u.includes('staffList')) return reply({ ok: true, status: 200, body: [] });
        return new Promise(() => {});   // 나머지는 무시(영구 pending)
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true;
      w.alert = () => {};
      w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise(r => setTimeout(r, 60));
  return dom;
}

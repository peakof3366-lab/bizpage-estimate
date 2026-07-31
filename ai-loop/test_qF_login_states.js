/* QF 검증: 로그인 화면이 **사실대로 말하는가** — 팀원 5명이 첫날 제일 먼저 지나는 칸.

   고친 결함 둘.

   ① 승인 대기 중인 직원이 **맞는 비밀번호**를 넣어도 "아이디 또는 비밀번호가 올바르지
      않습니다"를 봤다. login.js가 `!rows.length || !rows[0].active`를 한 줄로 묶어
      401로 돌려줬기 때문이다. 신청자는 자기 아이디를 의심하며 다시 치고, 사장님 화면에는
      그 사람이 ⏳ 승인 대기로 멀쩡히 보인다 — 둘 다 사실이 아닌 안내를 근거로 엉뚱한
      곳을 고친다(결함 생성기 ②). 가입 신청 직후 5명이 전부 이 칸을 지난다.
   ② 그 한 줄 때문에 **비활성 계정에는 락아웃이 아예 걸리지 않았다.** 상태 판정에서 먼저
      return하니 failed_attempts가 오르지 않는다 — 승인 전·정지된 계정은 비밀번호를
      무제한으로 시도할 수 있었다. 방어가 가장 필요한 계정에만 비어 있던 셈이다.

   방식: 원문 정규식으로 끝내지 않는다(결함 생성기 ③ — 안전망은 실제로 발동시켜 본다).
   `api/_lib/db`를 가짜 sql로 바꿔치고 **진짜 login.js 핸들러를 호출**해 상태 코드·응답·
   실행된 SQL을 본다. 화면 쪽은 jsdom으로 admin.html을 띄워 **실제로 로그인 버튼을 눌러**
   문구가 사유별로 갈리는지 확인한다.

   실행: node ai-loop/test_qF_login_states.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB ──────────────────────────────────────────────────────────────
   ⚠ auth.js가 로드되는 순간 `require('./db')`가 실행되고 db.js는 그때 DATABASE_URL로
   neon()을 만든다. 캐시를 **먼저** 채워야 db.js 본문이 아예 실행되지 않는다
   (QE·PW와 동일 — 운영 DB에 닿지 않는다). */
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
const stmts = [];
let account = null;
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

      if (/^select .* from staff_accounts where username/.test(q)) {
        return account && account.username === vals[0] ? [{ ...account }] : [];
      }
      if (/^update staff_accounts set failed_attempts = 0/.test(q)) {
        account.failed_attempts = 0; account.locked_until = null;
        return [];
      }
      if (/^update staff_accounts set failed_attempts = \?/.test(q)) {
        account.failed_attempts = vals[0]; account.locked_until = vals[1];
        return [];
      }
      return [];
    }),
  },
};

process.env.SESSION_SECRET = 'test-secret-for-qF-login-states';
const auth = require(path.join(ROOT, 'api', '_lib', 'auth.js'));
const login = require(path.join(ROOT, 'api', 'admin', 'login.js'));
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));

const PW = 'correct-horse-8';
const HASH = bcrypt.hashSync(PW, 10);

function mockRes() {
  return {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
  };
}

async function tryLogin(username, password) {
  const res = mockRes();
  await login({ method: 'POST', body: { username, password }, query: {} }, res);
  return res;
}

/* 세션이 실제로 발급됐는가 — "로그인 안 됨"을 상태 코드로만 보면, 403을 주면서
   쿠키는 심어 주는 코드도 통과한다. 쿠키까지 본다. */
const gotSession = (res) => {
  const c = res.headers['Set-Cookie'];
  const s = Array.isArray(c) ? c.join(';') : String(c || '');
  return s.includes(auth.COOKIE_NAME + '=') && !/=;|=deleted/.test(s);
};

function resetAccount(over = {}) {
  account = {
    id: '7',                       // ⚠ 문자열 — bigserial을 드라이버가 이렇게 준다
    username: 'staff1',
    display_name: '김직원',
    password_hash: HASH,
    role: 'staff',
    active: true,
    self_signup: false,
    failed_attempts: 0,
    locked_until: null,
    ...over,
  };
  stmts.length = 0;
  dbThrows = false;
}

const attemptWriteRan = () => stmts.some(s => /^update staff_accounts set failed_attempts = \?/.test(s.q));

(async () => {
  console.log('[1] 승인 대기 중인 직원이 맞는 비밀번호를 넣었을 때');

  resetAccount({ active: false, self_signup: true });
  let r = await tryLogin('staff1', PW);
  ok('403 pending_approval — "비밀번호가 틀렸다"고 하지 않는다',
    r.statusCode === 403 && r.body.error === 'pending_approval',
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('승인 전에는 세션을 발급하지 않는다', !gotSession(r));

  /* 승인 대기와 사용 중지는 신청자가 할 행동이 다르다 — 앞은 기다리면 되고,
     뒤는 사장님께 연락해야 한다. 같은 문구로 뭉뚱그리면 그 구분이 사라진다. */
  resetAccount({ active: false, self_signup: false });
  r = await tryLogin('staff1', PW);
  ok('사장님이 꺼둔 계정은 account_disabled로 구분된다',
    r.statusCode === 403 && r.body.error === 'account_disabled',
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('사용 중지 계정도 세션을 발급하지 않는다', !gotSession(r));

  console.log('\n[2] 비밀번호가 틀리면 계정 상태를 말하지 않는다 (존재 여부 유출 금지)');

  for (const [label, over] of [
    ['승인 대기', { active: false, self_signup: true }],
    ['사용 중지', { active: false, self_signup: false }],
    ['활성', {}],
  ]) {
    resetAccount(over);
    r = await tryLogin('staff1', 'wrong-password-9');
    ok(`${label} 계정 + 틀린 비밀번호 → 401 invalid_credentials`,
      r.statusCode === 401 && r.body.error === 'invalid_credentials',
      `${r.statusCode} ${JSON.stringify(r.body)}`);
    ok(`${label} 계정 — 응답에 상태 힌트가 없다`,
      !/pending|disabled|self_signup|active/.test(JSON.stringify(r.body)));
  }

  resetAccount();
  r = await tryLogin('nobody-here', PW);
  ok('없는 아이디도 같은 401 invalid_credentials',
    r.statusCode === 401 && r.body.error === 'invalid_credentials',
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('없는 아이디에는 실패 카운터를 쓰지 않는다(쓸 행이 없다)', !attemptWriteRan());

  console.log('\n[3] 락아웃이 비활성 계정에도 걸리는가 — 예전엔 여기가 비어 있었다');

  /* 결함의 정체: 상태 판정이 비밀번호 검증보다 앞서면 failed_attempts가 오를 기회가
     없다. 승인 전 계정 = 무제한 시도. 5회를 실제로 눌러서 잠기는지 확인한다. */
  for (const [label, over] of [
    ['승인 대기', { active: false, self_signup: true }],
    ['사용 중지', { active: false, self_signup: false }],
    ['활성', {}],
  ]) {
    resetAccount(over);
    let last;
    for (let i = 0; i < 5; i++) last = await tryLogin('staff1', 'wrong-password-9');
    ok(`${label} 계정 — 5회 실패로 잠긴다`,
      last.statusCode === 423 && last.body.error === 'locked',
      `${last.statusCode} ${JSON.stringify(last.body)}`);
    ok(`${label} 계정 — 실패 횟수가 실제로 5까지 올랐다`,
      account.failed_attempts === 5, String(account.failed_attempts));
    ok(`${label} 계정 — 잠금 해제 시각이 DB에 남는다`,
      account.locked_until instanceof Date && account.locked_until > new Date(),
      String(account.locked_until));
  }

  /* 잠긴 순간에도 lockedUntil을 돌려줘야 화면이 남은 시간을 말할 수 있다.
     안 주면 "15분"이라는 고정 문구밖에 못 쓰고, 12분 기다린 사람이 또 15분을 듣는다. */
  resetAccount({ failed_attempts: 4 });
  r = await tryLogin('staff1', 'wrong-password-9');
  ok('막 잠긴 응답(423)에 lockedUntil이 들어 있다',
    r.statusCode === 423 && !!r.body.lockedUntil, JSON.stringify(r.body));

  resetAccount({ locked_until: new Date(Date.now() + 9 * 60000) });
  r = await tryLogin('staff1', PW);
  ok('이미 잠긴 계정은 맞는 비밀번호로도 안 열린다',
    r.statusCode === 423 && r.body.error === 'locked' && !gotSession(r),
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('이미 잠긴 응답에도 lockedUntil이 들어 있다', !!r.body.lockedUntil);

  console.log('\n[4] 승인된 뒤에는 그대로 로그인된다 — 가드가 과하게 잠기지 않았는가');

  resetAccount({ failed_attempts: 3 });
  r = await tryLogin('staff1', PW);
  ok('활성 계정 + 맞는 비밀번호 → 200', r.statusCode === 200 && r.body.ok === true,
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('세션 쿠키가 실제로 발급된다', gotSession(r));
  ok('성공하면 실패 카운터가 0으로 돌아간다', account.failed_attempts === 0);
  ok('응답이 이름·역할을 준다(화면이 바로 쓴다)',
    r.body.displayName === '김직원' && r.body.role === 'staff', JSON.stringify(r.body));

  /* 비밀번호가 맞았으면 계정이 꺼져 있어도 카운터는 지운다 — 승인 직후 첫 로그인에서
     예전 실패 4회가 남아 있으면 한 번만 오타를 내도 곧바로 잠긴다. */
  resetAccount({ active: false, self_signup: true, failed_attempts: 4 });
  r = await tryLogin('staff1', PW);
  ok('승인 대기 계정도 맞는 비밀번호면 카운터가 0이 된다',
    r.statusCode === 403 && account.failed_attempts === 0, String(account.failed_attempts));

  console.log('\n[5] DB가 끊겼을 때 — "비밀번호 문제"로 둔갑하지 않는다');

  resetAccount();
  dbThrows = true;
  r = await tryLogin('staff1', PW);
  ok('조회 실패는 500 login_failed (401 아님)',
    r.statusCode === 500 && r.body.error === 'login_failed',
    `${r.statusCode} ${JSON.stringify(r.body)}`);
  ok('DB 장애 로그가 실제로 남았다', swallowed > 0, String(swallowed));
  dbThrows = false;

  console.log('\n[6] 화면 — 실제로 로그인 버튼을 눌러 문구가 갈리는지 본다');

  const dom = await bootAdmin();
  const w = dom.window;
  const errEl = w.document.getElementById('loginErr');
  const pwInput = w.document.getElementById('adminPw');

  async function submitWith(reply) {
    w.__setLoginReply(reply);
    w.document.getElementById('adminId').value = 'staff1';
    pwInput.value = PW;
    w.document.getElementById('loginForm')
      .dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(res => setTimeout(res, 30));
    return errEl.textContent.trim();
  }

  const msgPending = await submitWith({ ok: false, status: 403, body: { error: 'pending_approval' } });
  ok('승인 대기 — 승인을 기다리라고 말한다',
    /승인/.test(msgPending) && !/비밀번호가 올바르지/.test(msgPending), msgPending);
  ok('승인 대기 — 비밀번호는 맞다고 알려 준다', /맞습니다|올바릅니다/.test(msgPending), msgPending);
  ok('승인 대기 — 입력한 비밀번호를 지우지 않는다(승인 뒤 그대로 다시 누른다)',
    pwInput.value === PW, JSON.stringify(pwInput.value));

  const msgDisabled = await submitWith({ ok: false, status: 403, body: { error: 'account_disabled' } });
  ok('사용 중지 — 관리자 문의로 안내한다',
    /사용할 수 없|관리자/.test(msgDisabled) && msgDisabled !== msgPending, msgDisabled);

  const until = new Date(Date.now() + 7 * 60000).toISOString();
  const msgLocked = await submitWith({ ok: false, status: 423, body: { error: 'locked', lockedUntil: until } });
  ok('잠김 — 남은 시간을 실제 해제 시각으로 말한다(고정 "15분"이 아니다)',
    /7분/.test(msgLocked), msgLocked);
  ok('잠김 — 비밀번호 칸은 비운다', pwInput.value === '', JSON.stringify(pwInput.value));

  const msgLockedNoInfo = await submitWith({ ok: false, status: 423, body: { error: 'locked' } });
  ok('해제 시각이 없으면 15분으로 안내한다(빈 칸을 만들지 않는다)',
    /15분/.test(msgLockedNoInfo), msgLockedNoInfo);

  const msgBad = await submitWith({ ok: false, status: 401, body: { error: 'invalid_credentials' } });
  ok('틀린 비밀번호 — 기존 문구 그대로', /아이디 또는 비밀번호가 올바르지/.test(msgBad), msgBad);
  ok('틀린 비밀번호 — 비밀번호 칸을 비운다', pwInput.value === '', JSON.stringify(pwInput.value));

  const msg500 = await submitWith({ ok: false, status: 500, body: { error: 'login_failed' } });
  ok('서버 오류 — 비밀번호 탓으로 돌리지 않는다',
    /서버 오류/.test(msg500) && !/비밀번호가 올바르지/.test(msg500), msg500);

  /* 응답 본문이 JSON이 아닌 경우(프록시가 HTML 오류 페이지를 주는 상황)에도
     화면이 죽지 않고 기본 문구로 떨어져야 한다. */
  const msgNoJson = await submitWith({ ok: false, status: 502, body: null, brokenJson: true });
  ok('JSON이 아닌 응답에도 화면이 문구를 낸다', msgNoJson.length > 0, msgNoJson);

  await submitWith({ ok: true, status: 200, body: { ok: true, displayName: '김직원', role: 'staff' } });
  ok('성공하면 오류 문구가 숨겨진다', errEl.classList.contains('hidden'),
    errEl.className + ' / ' + errEl.textContent.trim());

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { realError(err); process.exit(1); });

/* admin.html을 실제로 띄운다 — 로그인 폼의 submit 핸들러는 로드 시점에 붙으므로
   따로 주입할 것이 없다. fetch만 갈아끼운다. */
async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      let loginReply = { ok: false, status: 401, body: { error: 'invalid_credentials' } };
      w.__setLoginReply = (r) => { loginReply = r; };
      const reply = (r) => Promise.resolve({
        ok: r.ok, status: r.status,
        json: () => (r.brokenJson
          ? Promise.reject(new Error('Unexpected token < in JSON'))
          : Promise.resolve(r.body)),
      });
      w.fetch = (url) => {
        const u = String(url);
        if (u.includes('/api/admin/login')) return reply(loginReply);
        /* action=me는 실패로 둔다 — 성공하면 대시보드로 넘어가 로그인 화면이 사라진다. */
        if (u.includes('action=me')) return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
        return new Promise(() => {});
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true;
      w.alert = () => {};
      w.prompt = () => null;
    },
  });
  await new Promise(r => setTimeout(r, 60));
  return dom;
}

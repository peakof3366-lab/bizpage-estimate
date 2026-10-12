/* 0-ao (2026-10-12) 직원 본인 연락처·E-mail → 견적 담당자 칸 자동 채움.

   ■ 왜 생겼나
   2026-10-02 신입 직원 종단 시험: 견적을 만들어 발급하자 견적서·세부견적서·일정표 세 장 머리에
   빨간 「E-mail : 미입력」이 찍혀 고객에게 나갔다. 이름만 계정에서 오고 연락처·메일은
   **견적마다 손으로** 적었기 때문이다. → 계정에 두 칸을 두고, 견적 작성 화면이 채운다.

   ■ 이 검사가 지키는 것
   ① 저장해도 **세션이 안 끊긴다** — updated_at을 건드리면 그 계정의 모든 세션이 끊긴다(auth.js).
   ② 형식을 **서버에서** 막는다 — 값이 고객 견적서 머리에 찍힌다(결함 생성기 ④).
   ③ 칸이 없거나(마이그레이션 전) 못 읽어도 `?action=me`는 산다 — 죽으면 관리자 화면 전체가 튕긴다.
      대신 `contactReady:false`로 흔적을 남긴다(결함 생성기 ②).
   ④ 견적 작성 화면이 **새 견적에서만** 채운다 — 고치기에서 채우면 「남의 이름 + 내 연락처」가 섞인다.
   ⑤ 설정 화면이 실제로 그 값을 보이고 저장한다.

   방식: 서버는 가짜 sql로 **진짜 핸들러**를 부르고 세션은 진짜 auth.js로 서명한다(test_qE와 같은 방식).
   화면은 jsdom으로 띄워 칸의 값을 읽는다.

   실행: node ai-loop/test_aO_my_contact.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 가짜 DB ── 모르는 쿼리는 던진다(조용히 빈 값을 주지 않는다) */
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
const stmts = [];
let account = null;
let contactColumnMissing = false;
const realError = console.error;
let quiet = false;
console.error = (...a) => { if (!quiet) realError(...a); };

require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: (strings, ...vals) => Promise.resolve().then(() => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim();
      stmts.push({ q, vals });
      if (/^select role, active, display_name, updated_at from staff_accounts/.test(q)) {
        return [{ role: account.role, active: account.active, display_name: account.display_name, updated_at: account.updated_at }];
      }
      if (/^select contact_tel, contact_email from staff_accounts/.test(q)) {
        if (contactColumnMissing) throw new Error('column "contact_tel" does not exist');
        return [{ contact_tel: account.contact_tel, contact_email: account.contact_email }];
      }
      if (/^update staff_accounts set contact_tel = \?, contact_email = \? where id = \? returning/.test(q)) {
        if (contactColumnMissing) throw new Error('column "contact_tel" does not exist');
        account.contact_tel = vals[0]; account.contact_email = vals[1];
        return [{ contact_tel: vals[0], contact_email: vals[1] }];
      }
      throw new Error('가짜 DB가 모르는 쿼리: ' + q);
    }),
  },
};

process.env.SESSION_SECRET = 'test-secret-for-aO-my-contact';
const auth = require(path.join(ROOT, 'api', '_lib', 'auth.js'));
const handler = require(path.join(ROOT, 'api', 'admin', 'account.js'));

function resetAccount() {
  account = {
    id: '7', username: 'kim', display_name: '김신입', role: 'staff', active: true,
    contact_tel: '', contact_email: '', updated_at: new Date(Date.now() - 60_000),
  };
  stmts.length = 0; contactColumnMissing = false;
}
async function call(action, { method = 'POST', body = {} } = {}) {
  const token = await auth.signSession({ id: account.id, username: account.username, displayName: account.display_name, role: account.role });
  const res = {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
  };
  await handler({ method, body, query: { action }, cookies: { [auth.COOKIE_NAME]: token } }, res);
  return res;
}

/* 견적 작성 화면 — `<script src>`를 파일 내용으로 바꿔 띄운다(test_zV와 같은 방식) */
const PRO = fs.readFileSync(path.join(ROOT, 'admin-quote-pro.html'), 'utf8');
const inlineScripts = (html) => html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return m;
  return '<script>' + fs.readFileSync(p, 'utf8').replace(/<\/script/g, '<\\/script') + '</script>';
});
async function bootPro(me, query) {
  const dom = new JSDOM(inlineScripts(PRO), {
    runScripts: 'dangerously', url: 'http://localhost/admin-quote-pro.html' + (query || ''),
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (url) => {
        if (String(url).includes('/api/admin/account')) return Promise.resolve({ ok: true, json: () => Promise.resolve(me) });
        return new Promise(() => {});
      };
      w.print = () => {};
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r));
  await sleep(200);
  const $ = (id) => dom.window.document.getElementById(id);
  return { $, D: dom.window.document };
}

(async () => {
  console.log('[1] 저장 — 세션을 끊지 않는다');
  resetAccount();
  const before = account.updated_at;
  let r = await call('updateMyContact', { body: { tel: '02-2088-4253', email: 'kim@hanatrabiz.com' } });
  ok('저장된다(200)', r.statusCode === 200 && r.body.contactTel === '02-2088-4253' && r.body.contactEmail === 'kim@hanatrabiz.com', JSON.stringify(r.body));
  ok('🔴 updated_at을 건드리지 않는다(세션 유지)', account.updated_at === before
    && !stmts.some((s) => /updated_at/.test(s.q) && /^update/.test(s.q)));
  ok('본인 행에만 쓴다(id = 세션의 id)', stmts.some((s) => /^update staff_accounts/.test(s.q) && s.vals[2] === '7'));
  r = await call('updateMyContact', { body: { tel: '02-0000-0000', email: 'x@y.com', id: '1' } });
  ok('남의 id를 보내도 본인 행에만 쓴다', stmts.filter((s) => /^update staff_accounts/.test(s.q)).pop().vals[2] === '7');

  console.log('[2] 형식은 서버가 막는다 — 고객 견적서 머리에 찍히는 값');
  for (const [label, body, err] of [
    ['연락처에 꺾쇠', { tel: '<img src=x onerror=alert(1)>', email: '' }, 'invalid_tel'],
    ['연락처에 글자', { tel: '전화주세요', email: '' }, 'invalid_tel'],
    ['메일에 따옴표', { tel: '', email: 'a"onmouseover=x@b.com' }, 'invalid_email'],
    ['메일 형식 아님', { tel: '', email: 'kim.hanatrabiz.com' }, 'invalid_email'],
  ]) {
    resetAccount();
    r = await call('updateMyContact', { body });
    ok(`${label} → 400 ${err}`, r.statusCode === 400 && r.body.error === err, `${r.statusCode} ${JSON.stringify(r.body)}`);
    ok(`${label} → DB를 건드리지 않는다`, !stmts.some((s) => /^update/.test(s.q)));
  }
  resetAccount();
  r = await call('updateMyContact', { body: { tel: '010-1234-5678 내선 21', email: '' } });
  ok('내선 표기·빈 메일은 받는다', r.statusCode === 200, JSON.stringify(r.body));
  r = await call('updateMyContact', { method: 'GET' });
  ok('GET은 405', r.statusCode === 405);

  console.log('[3] ?action=me — 연락처를 싣고, 칸이 없어도 죽지 않는다');
  resetAccount(); account.contact_tel = '02-1111-2222'; account.contact_email = 'k@b.com';
  r = await call('me', { method: 'GET' });
  ok('연락처·메일을 싣는다', r.statusCode === 200 && r.body.contactTel === '02-1111-2222' && r.body.contactEmail === 'k@b.com' && r.body.contactReady === true, JSON.stringify(r.body));
  resetAccount(); contactColumnMissing = true; quiet = true;
  r = await call('me', { method: 'GET' });
  quiet = false;
  ok('🔴 칸이 없어도(마이그레이션 전) 로그인 확인은 200', r.statusCode === 200 && r.body.displayName === '김신입', `${r.statusCode}`);
  ok('대신 contactReady:false로 흔적을 남긴다', r.body.contactReady === false && r.body.contactTel === '');
  quiet = true;
  r = await call('updateMyContact', { body: { tel: '02-0000-0000', email: '' } });
  quiet = false;
  ok('칸이 없을 때 저장은 500으로 말한다(성공으로 위장 안 함)', r.statusCode === 500 && r.body.error === 'save_failed');

  console.log('[4] 견적 작성 화면 — 새 견적에서만 채운다');
  const ME = { ok: true, id: '7', username: 'kim', displayName: '김신입', role: 'staff', contactTel: '02-2088-4253', contactEmail: 'kim@hanatrabiz.com', contactReady: true };
  let P = await bootPro(ME);
  ok('새 견적: 이름', P.$('dStaffName').value === '김신입', P.$('dStaffName').value);
  ok('새 견적: 연락처가 채워진다', P.$('dStaffTel').value === '02-2088-4253', P.$('dStaffTel').value);
  ok('새 견적: E-mail이 채워진다', P.$('dStaffEmail').value === 'kim@hanatrabiz.com', P.$('dStaffEmail').value);
  { /* 미리보기는 산출 뒤에 그려진다 — 실제로 산출을 눌러 고객이 받는 문서를 본다 */
    const W = P.D.defaultView;
    const fire = (id, t) => P.$(id).dispatchEvent(new W.Event(t, { bubbles: true }));
    const set = (id, v) => { P.$(id).value = String(v); fire(id, 'input'); fire(id, 'change'); };
    const dt = new Date(); dt.setDate(dt.getDate() + 40);
    set('pDest', '도쿄'); set('pPax', 20); set('pDays', 5); set('pStart', dt.toLocaleDateString('sv-SE'));
    await sleep(120); fire('btnCalc', 'click'); await sleep(450);
    const html = P.D.body.innerHTML;
    ok('산출 뒤 미리보기 견적서에 메일·연락처가 찍힌다', /kim@hanatrabiz\.com/.test(html) && /02-2088-4253/.test(html));
  }
  P = await bootPro(Object.assign({}, ME, { contactTel: '', contactEmail: '' }));
  ok('연락처를 안 적은 직원: 칸은 비어 있다(지어내지 않는다)', P.$('dStaffTel').value === '' && P.$('dStaffEmail').value === '');
  P = await bootPro(ME, '?quote=123');
  ok('🔴 고치기(?quote=)에서는 내 연락처를 넣지 않는다', P.$('dStaffTel').value === '' && P.$('dStaffEmail').value === '',
    P.$('dStaffTel').value + ' / ' + P.$('dStaffEmail').value);

  console.log('[5] 설정 화면 — 보이고, 저장한다');
  const { bootPage } = require('./_page_boot.js');
  const { adminFixtures, enterDashboard, ME: FME } = require('./_admin_fixtures.js');
  const fx = adminFixtures('filled');
  const orig = fx.route;
  fx.route = function (u, opt, json) {
    const s = String(u);
    if (/action=me/.test(s)) return json(Object.assign({}, FME, { contactTel: '02-3333-4444', contactEmail: 'me@b.com', contactReady: true }));
    if (/action=updateMyContact/.test(s)) return json({ ok: true, contactTel: '02-5555-6666', contactEmail: 'new@b.com' });
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin.html', { fixtures: fx });
  await B.ready;
  const { entered } = await enterDashboard(B);
  ok('대시보드에 들어갔다', entered);
  const t = B.doc.getElementById('myContactTel'), e = B.doc.getElementById('myContactEmail');
  ok('저장된 값이 칸에 보인다', t && e && t.value === '02-3333-4444' && e.value === 'me@b.com', t && (t.value + ' / ' + e.value));
  t.value = '02-5555-6666'; e.value = 'new@b.com';
  await B.win.saveMyContact();
  await B.tick(50);
  const posts = B.log.requests.filter((x) => /updateMyContact/.test(x.url));
  ok('칸의 값을 서버로 보낸다', posts.length === 1 && posts[0].body && posts[0].body.tel === '02-5555-6666' && posts[0].body.email === 'new@b.com', JSON.stringify(posts));
  ok('저장했다고 말한다', /저장했습니다/.test(B.doc.getElementById('myContactMsg').textContent));
  const named = [t, e].every((el) => el.getAttribute('aria-label'));
  ok('두 칸 모두 낭독기 이름이 있다', named);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('크래시:', err); console.log(`\n결과: ${pass} pass / ${fail + 1} fail`); process.exit(1); });

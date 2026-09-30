/* ═══════════════════════════════════════════════════════════════════════════
   zT — 견적서 대장 삭제 (2026-09-30 대표 요청)

   예전엔 「지우면 우리가 그 금액을 낸 적 있다는 근거가 사라진다」며 삭제를 두지 않았다.
   대표가 삭제를 요청했고, 근거는 `deletion_log`로 남긴다. 이 검사가 지키는 것:

     ① 🔴 기록이 먼저다 — `deletion_log`에 행 전체가 남은 뒤에야 지운다
     ② 🔴 **지운 번호를 다시 쓰지 않는다** — _V2를 지우고 다시 발급해도 _V3이 나온다
        (남은 줄만 세던 `shareQuoteNo`가 고객 손에 있는 번호와 같은 번호를 낼 뻔했다)
     ③ 다음 판이 있으면 사슬을 앞 판으로 잇는다 — 대장에 「차수 모름」이 안 남게
     ④ 매니저 이상만 — 서버가 막고, 화면은 직원에게 버튼을 안 보인다
     ⑤ 잘못된 id · 없는 id는 지우지 않고 이유를 말한다
   서버 코드는 **진짜 파일을** 가짜 DB 위에서 돌린다(글자로 재지 않는다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage } = require('./_page_boot.js');
const { adminFixtures, enterDashboard, ME } = require('./_admin_fixtures.js');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB — 이 기능이 부르는 쿼리만 안다. 모르는 쿼리는 던진다(조용히 빈 값을 주지 않는다) ── */
function fakeDb() {
  const db = { shares: [], quotes: [], log: [], nolog: [], calls: [] };
  const run = (text, vals) => {
    const q = text.replace(/\s+/g, ' ').trim();
    db.calls.push(q);
    let m;
    if (/^select id, quote_id, quote_no, revision_of from quote_shares where id = \$1 limit 1$/.test(q)) {
      return db.shares.filter((s) => s.id === vals[0]).map((s) => ({ id: s.id, quote_id: s.quote_id, quote_no: s.quote_no, revision_of: s.revision_of }));
    }
    if (/^insert into quote_no_log \(quote_id, old_no, new_no, by_user, reason\)/.test(q)) {
      if (db.failNoLog) throw new Error('no-log down');
      db.nolog.push({ quote_id: vals[0], old_no: vals[1], by_user: vals[2], reason: vals[3] });
      return [];
    }
    if ((m = /^select \* from (\w+) where id = \$1$/.exec(q))) return db.shares.filter((s) => s.id === vals[0]).map((s) => ({ ...s }));
    if (/^insert into deletion_log/.test(q)) {
      if (db.failLog) throw new Error('log down');
      db.log.push({ table_name: vals[0], row_id: vals[1], snapshot: JSON.parse(vals[2]), actor: vals[3] });
      return [];
    }
    if (/^delete from quote_shares where id = \$1 returning \*$/.test(q)) {
      const gone = db.shares.filter((s) => s.id === vals[0]);
      db.shares = db.shares.filter((s) => s.id !== vals[0]);
      return gone;
    }
    if (/^update quote_shares set revision_of = \$1 where revision_of = \$2 returning id$/.test(q)) {
      const hit = db.shares.filter((s) => s.revision_of === vals[1]);
      hit.forEach((s) => { s.revision_of = vals[0]; });
      return hit.map((s) => ({ id: s.id }));
    }
    if (/^select quote_no from quotes where id = \$1$/.test(q)) return db.quotes.filter((x) => x.id === vals[0]);
    if (/^select \(select count\(\*\)::int from quote_shares where quote_id = \$1\) \+ \(select count\(\*\)::int from quote_no_log where quote_id = \$2 and reason = \$3\) as n$/.test(q)) {
      return [{ n: db.shares.filter((s) => s.quote_id === vals[0]).length
        + db.nolog.filter((l) => l.quote_id === vals[1] && l.reason === vals[2]).length }];
    }
    throw new Error('가짜 DB가 모르는 쿼리: ' + q.slice(0, 120));
  };
  /* tagged template(`sql\`...\``)과 함수 호출(`sql(text, vals)`) 둘 다 받는다 */
  db.sql = (a, ...rest) => {
    if (Array.isArray(a) && a.raw) {
      let text = ''; a.forEach((s, i) => { text += s + (i < rest.length ? '$' + (i + 1) : ''); });
      return Promise.resolve().then(() => run(text, rest));
    }
    return Promise.resolve().then(() => run(a, rest[0] || []));
  };
  return db;
}

/* 서버 파일을 가짜 DB·가짜 인증으로 싣는다 — require 캐시에 먼저 넣어 둔다 */
function loadServer(db, role) {
  const lib = (f) => path.join(ROOT, 'api', '_lib', f);
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'api'))) delete require.cache[k];
  require.cache[lib('db.js')] = { id: lib('db.js'), filename: lib('db.js'), loaded: true, exports: { sql: db.sql } };
  const realAuth = require(lib('auth.js'));
  require.cache[lib('auth.js')].exports = Object.assign({}, realAuth, {
    requireAdmin: async (req) => { req.user = { username: 'kim', id: '2', role }; return true; },
    requireRole: async (req, res, roles) => {
      req.user = { username: 'kim', id: '2', role };
      if (roles.includes(role)) return true;
      res.status(403).json({ error: 'forbidden' }); return false;
    },
  });
  return { handler: require(path.join(ROOT, 'api', 'quote-shares.js')), QNO: require(lib('quote_no.js')) };
}
function call(handler, body) {
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, body: j }); return this; } };
    handler({ method: 'POST', query: { action: 'delete' }, body, headers: {} }, res);
  });
}
const seed = (db) => {
  db.quotes = [{ id: 'q1', quote_no: 'BP-2609-0030' }];
  db.shares = [
    { id: 's1', quote_id: 'q1', quote_no: 'BP-2609-0030', revision_of: null, status: 'issued' },
    { id: 's2', quote_id: 'q1', quote_no: 'BP-2609-0030_V2', revision_of: 's1', status: 'issued' },
    { id: 's3', quote_id: 'q1', quote_no: 'BP-2609-0030_V3', revision_of: 's2', status: 'issued' },
  ];
};

(async () => {
  console.log('\n[1] 기록이 먼저 — 행 전체가 남는다');
  {
    const db = fakeDb(); seed(db);
    const { handler } = loadServer(db, 'manager');
    const r = await call(handler, { id: 's2' });
    ok('① 지웠다고 답한다', r.code === 200 && r.body.ok && r.body.removed, JSON.stringify(r));
    ok('① 대장에서 빠졌다', !db.shares.some((s) => s.id === 's2'));
    ok('① 🔴 삭제 기록에 행 전체가 남았다', db.log.length === 1 && db.log[0].table_name === 'quote_shares'
      && db.log[0].snapshot.quote_no === 'BP-2609-0030_V2', JSON.stringify(db.log));
    const iLog = db.calls.findIndex((c) => /^insert into deletion_log/.test(c));
    const iDel = db.calls.findIndex((c) => /^delete from quote_shares/.test(c));
    ok('① 🔴 기록한 **뒤에** 지운다', iLog >= 0 && iDel > iLog, iLog + ' / ' + iDel);
    ok('① 누가 지웠는지 남는다', /kim#2/.test(db.log[0].actor), db.log[0].actor);

    console.log('\n[3] 다음 판의 사슬을 앞 판으로 잇는다');
    ok('③ _V3이 이제 1차(s1)를 가리킨다', db.shares.find((s) => s.id === 's3').revision_of === 's1');
    ok('③ 이은 수를 돌려준다', r.body.relinked === 1 && r.body.relinkFailed === false, JSON.stringify(r.body));

    console.log('\n[2] 🔴 지운 번호를 다시 쓰지 않는다');
    const { QNO } = loadServer(db, 'manager');
    const next = await QNO.shareQuoteNo(db.sql, 'q1');
    ok('② 남은 2줄 + 지운 1줄 → 다음은 _V4', next.no === 'BP-2609-0030_V4', next.no);
    ok('② 🔴 고객 손에 있는 _V2·_V3과 겹치지 않는다', !['BP-2609-0030_V2', 'BP-2609-0030_V3'].includes(next.no));
    ok('② 지운 번호가 번호 이력에 남았다', db.nolog.length === 1 && db.nolog[0].old_no === 'BP-2609-0030_V2', JSON.stringify(db.nolog));
    const iNo = db.calls.findIndex((c) => /^insert into quote_no_log/.test(c));
    ok('② 🔴 번호를 적은 **뒤에** 지운다', iNo >= 0 && iNo < iDel, iNo + ' / ' + iDel);
    ok('② 🔴 번호 계산이 삭제 기록(연락처가 든 표)을 읽지 않는다',
      !db.calls.some((c) => /from deletion_log/.test(c)));
  }

  console.log('\n[2-b] 🔴 번호를 못 적으면 지우지 않는다');
  {
    const db = fakeDb(); seed(db); db.failNoLog = true;
    const { handler } = loadServer(db, 'owner');
    const r = await call(handler, { id: 's2' });
    ok('② 실패로 답한다', r.code === 500, JSON.stringify(r));
    ok('② 🔴 대장에 그대로 있고 삭제 기록도 없다', db.shares.length === 3 && db.log.length === 0);
  }

  console.log('\n[1-b] 🔴 기록이 실패하면 지우지 않는다');
  {
    const db = fakeDb(); seed(db); db.failLog = true;
    const { handler } = loadServer(db, 'owner');
    const r = await call(handler, { id: 's2' });
    ok('① 실패로 답한다', r.code === 500, JSON.stringify(r));
    ok('① 🔴 대장에 그대로 있다', db.shares.some((s) => s.id === 's2'));
  }

  console.log('\n[4] 매니저 이상만 · [5] 잘못된 요청');
  {
    const db = fakeDb(); seed(db);
    let { handler } = loadServer(db, 'staff');
    let r = await call(handler, { id: 's2' });
    ok('④ 🔴 직원은 서버에서 막힌다(403)', r.code === 403, JSON.stringify(r));
    ok('④ 막혔으면 아무것도 안 지워진다', db.shares.length === 3 && db.log.length === 0);
    ({ handler } = loadServer(db, 'owner'));
    r = await call(handler, { id: "x'; drop table quote_shares;--" });
    ok('⑤ 이상한 id는 400', r.code === 400, JSON.stringify(r));
    r = await call(handler, { id: 'nope' });
    ok('⑤ 없는 id는 404', r.code === 404, JSON.stringify(r));
    ok('⑤ 둘 다 아무것도 안 지웠다', db.shares.length === 3 && db.log.length === 0);
  }

  console.log('\n[4-b] 화면 — 직원에게는 버튼이 없다');
  const SH = [
    { id: 's1', quote_no: 'BP-2609-0030', quote_id: 'q1', created_at: '2026-09-28T01:00:00Z', issued_by: 'admin',
      customer_label: '농심', status: 'issued', dest: '멜버른', org: '농심', iso: '2026-09-28', pax: '15', total: '68561001', per: '4570733' },
  ];
  for (const role of ['staff', 'manager']) {
    const fx = adminFixtures('filled');
    const orig = fx.route;
    fx.route = function (u, opt, json) {
      const s = String(u);
      if (/action=me/.test(s)) return json(Object.assign({}, ME, { role }));
      if (/quote-shares\?action=delete/.test(s)) return json({ ok: true, removed: true, relinked: 0, relinkFailed: false });
      if (/quote-shares\?action=list/.test(s)) return json({ shares: SH });
      return orig.call(this, u, opt, json);
    };
    const B = bootPage('admin.html', { fixtures: fx });
    await B.ready;
    const { entered } = await enterDashboard(B);
    /* 🔴 대시보드에 못 들어가면 역할이 안 실려 **직원 검사가 우연히 통과한다** — 처음에 실제로 그랬다 */
    let gotRole = null;
    try { gotRole = B.win.eval('currentUser && currentUser.role'); } catch (e) { /* 아래에서 실패로 센다 */ }
    ok('(' + role + ') 대시보드에 들어갔고 역할이 실렸다', entered && gotRole === role, entered + ' / ' + gotRole);
    await B.win.renderLedger();
    await B.tick(50);
    const btn = B.doc.querySelector('#ledList .led-del');
    if (role === 'staff') { ok('④ 🔴 직원 화면에 삭제 버튼이 없다', !btn); continue; }
    ok('④ 매니저 화면에는 삭제 버튼이 있다', !!btn);
    if (!btn) continue;
    ok('④ 낭독기 이름에 견적번호가 있다', /BP-2609-0030/.test(btn.getAttribute('aria-label') || ''));
    const before = B.log.says.length;
    btn.click();
    await B.tick(100);
    const asks = B.log.says.slice(before).filter((x) => x.kind === 'confirm').map((x) => x.text);
    ok('④ 확인창에 번호·금액·링크 안내가 나온다', asks.length === 1
      && /BP-2609-0030/.test(asks[0]) && /68,561,001원/.test(asks[0]) && /없는 견적서/.test(asks[0]), JSON.stringify(asks));
    const posts = B.log.requests.filter((r) => /action=delete/.test(r.url));
    ok('④ 그 줄의 id로 서버에 보낸다', posts.length === 1 && posts[0].body && posts[0].body.id === 's1', JSON.stringify(posts));
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — zT 견적서 대장 삭제`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`결과: ${pass} pass / ${fail + 1} fail  — zT 견적서 대장 삭제`); process.exit(1); });

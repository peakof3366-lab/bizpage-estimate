/* ═══════════════════════════════════════════════════════════════════════════
   담당자 화면 검사용 — **진짜 서버 핸들러를 백업 데이터 위에서 돌려** 응답을 받는다
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 (2026-10-12)
   `check_admin_screens.py`의 가상 데이터는 문의·견적·대장 다섯 응답만 흉내 내고 **나머지를
   끊었다.** 그래서 요율 관리·일정 관리·콘텐츠·패키지·통계·설정 탭은 지금까지 「⚠ 불러오지
   못했습니다」 **오류 화면만** 재졌다(결함 생성기 ③ — 자가 실제 화면을 한 번도 안 쟀다).
   실측: 탭 16개를 도는 동안 끊긴 GET 14가지.

   ■ 응답 모양을 여기서 다시 쓰지 않는다
   손으로 흉내 내면 서버와 두 벌이 되고 반드시 어긋난다(결함 생성기 ①). 그래서 `api/*.js`의
   **핸들러를 그대로 부르고**, DB 자리만 백업 표로 바꾼다(검사 파일들이 쓰는 가짜 sql 방식).
   ⚠ **모르는 쿼리는 던진다.** 빈 값을 주면 핸들러가 「0건」을 그리고 검사는 그것을 잰다 —
     처음 화면이 끊겨 있던 것과 같은 일이 조용히 반복된다. 던지면 아래 `build`가 멈춘다.

   ■ 고객 정보 — 이 결과도 `make_admin_fixture.js`의 scrub/sweep을 지난다.
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* 핸들러가 한 번에 받을 GET 목록 — 탭 16개를 돌며 실제로 끊긴 것 그대로(2026-10-12 실측) */
const ENDPOINTS = [
  ['/api/rates', 'rates.js', {}],
  ['/api/rates?action=feeds', 'rates.js', { action: 'feeds' }],
  ['/api/rates?action=fuel', 'rates.js', { action: 'fuel' }],
  ['/api/rates?action=review', 'rates.js', { action: 'review' }],
  ['/api/content', 'content.js', {}],
  ['/api/content?action=itineraries', 'content.js', { action: 'itineraries' }],
  ['/api/content?action=packages', 'content.js', { action: 'packages' }],
  /* ⚠ 관리자 목록은 `&all=1`이다(마감·준비 중까지). 처음엔 열쇠를 첫 질의까지만 봐서 **고객용 목록이
     관리자 탭에 들어갔고**, 패키지 탭이 「등록된 상품이 없습니다」로 재졌다(2026-10-12). */
  ['/api/content?action=packages&all=1', 'content.js', { action: 'packages', all: '1' }],
  ['/api/quotes?action=priceReports', 'quotes.js', { action: 'priceReports' }],
  ['/api/admin/insights?type=analytics', 'admin/insights.js', { type: 'analytics' }],
  ['/api/admin/insights?type=inbox', 'admin/insights.js', { type: 'inbox' }],
  ['/api/admin/insights?type=manual', 'admin/insights.js', { type: 'manual' }],
  ['/api/admin/insights?type=marketing', 'admin/insights.js', { type: 'marketing' }],
  ['/api/admin/account?action=staffList', 'admin/account.js', { action: 'staffList' }],
  ['/api/admin/account?action=signupSettings', 'admin/account.js', { action: 'signupSettings' }],
];

/* 백업 표 → 쿼리 답. 단순 select는 표의 행을 그대로 준다(핸들러가 자기 칸만 꺼내 쓴다). */
function makeSql(d, owner) {
  const T = (name) => (d[name] || []).map((r) => ({ ...r }));
  const unknown = [];
  const byTime = (rows, desc) => rows.slice().sort((a, b) =>
    (desc ? -1 : 1) * String(a.created_at).localeCompare(String(b.created_at)));
  const answer = (q, vals) => {
    let m;
    /* 세션 확인(requireAdmin) — 점검용 관리자 */
    if (/^select role, active, display_name, updated_at from staff_accounts where id = \?$/.test(q)) return [owner];
    if (/^select value from app_settings where key = \?$/.test(q)) {
      return T('app_settings').filter((r) => r.key === vals[0]).map((r) => ({ value: r.value }));
    }
    /* 키를 글자로 박아 넣은 조회(rates.js 계수) — 핸들러가 실패를 삼키고 기본 계수로 떨어지므로 여기서 받아 줘야 한다 */
    if ((m = /^select value from app_settings where key = '([\w-]+)'$/.exec(q))) {
      return T('app_settings').filter((r) => r.key === m[1]).map((r) => ({ value: r.value }));
    }
    /* 고객 화면 패키지 목록(content.js) — 열린 카탈로그 상품 중 유효기간·출발일이 안 지난 것 */
    if (/^select \* from packages where status = 'open' and kind = 'catalog'/.test(q)) {
      const today = new Date().toISOString().slice(0, 10), day = (v) => (v ? String(v).slice(0, 10) : null);
      return T('packages')
        .filter((p) => p.status === 'open' && p.kind === 'catalog'
          && (!day(p.valid_until) || day(p.valid_until) >= today) && (!day(p.depart_date) || day(p.depart_date) >= today))
        .sort((a, b) => String(day(a.depart_date) || '2999-12-31').localeCompare(String(day(b.depart_date) || '2999-12-31')));
    }
    if (/^select id, username, display_name, role, active, self_signup, created_at from staff_accounts order by self_signup desc, created_at$/.test(q)) {
      return T('staff_accounts').sort((a, b) => (Number(b.self_signup) - Number(a.self_signup)) || String(a.created_at).localeCompare(String(b.created_at)));
    }
    /* 집계 — 문의·견적 건수 (insights inbox) */
    if (/count\(\*\) filter \(where read = false\)::int as pending/.test(q) && /from inquiries$/.test(q)) {
      const r = T('inquiries');
      return [{ pending: r.filter((x) => x.read === false).length, total: r.length, latest: r.map((x) => x.created_at).sort().pop() || null }];
    }
    if (/count\(\*\) filter \(where status = 'new'\)::int as pending/.test(q) && /from quotes$/.test(q)) {
      const r = T('quotes'), c = (f) => r.filter(f).length;
      return [{ pending: c((x) => x.status === 'new'), consulting: c((x) => x.status === 'consulting'),
        active: c((x) => x.status === 'new' || x.status === 'consulting'), total: r.length,
        latest: r.map((x) => x.created_at).sort().pop() || null }];
    }
    /* 집계 — 방문·클릭·목적지 (insights analytics) */
    const ev = T('site_events');
    if (/^select created_at as ts from site_events where name = 'pageview' order by created_at desc limit \?$/.test(q)) {
      return byTime(ev.filter((e) => e.name === 'pageview'), true).slice(0, vals[0]).map((e) => ({ ts: e.created_at }));
    }
    if (/^select count\(\*\)::int as c from site_events where name = 'pageview'$/.test(q)) return [{ c: ev.filter((e) => e.name === 'pageview').length }];
    if (/^select name, count\(\*\)::int as c from site_events where name = any\(\?\) group by name$/.test(q)) {
      const want = new Set(vals[0]), n = {};
      ev.filter((e) => want.has(e.name)).forEach((e) => { n[e.name] = (n[e.name] || 0) + 1; });
      return Object.entries(n).map(([name, c]) => ({ name, c }));
    }
    const destOf = (e) => e.name === 'dest_select' && e.meta && e.meta.dest;
    if (/^select meta->>'dest' as dest, count\(\*\)::int as c from site_events where name = 'dest_select'/.test(q)) {
      const n = {}; ev.filter(destOf).forEach((e) => { n[e.meta.dest] = (n[e.meta.dest] || 0) + 1; });
      return Object.entries(n).map(([dest, c]) => ({ dest, c })).sort((a, b) => b.c - a.c).slice(0, vals[0]);
    }
    if (/^select count\(distinct meta->>'dest'\)::int as c from site_events where name = 'dest_select'/.test(q)) {
      return [{ c: new Set(ev.filter(destOf).map((e) => e.meta.dest)).size }];
    }
    if (/^select coalesce\(meta->>'screen', '\(알 수 없음\)'\) as screen, count\(\*\)::int as c from site_events where name = 'manual_open'/.test(q)) {
      const since = Date.now() - 30 * 864e5, n = {};
      ev.filter((e) => e.name === 'manual_open' && new Date(e.created_at).getTime() >= since)
        .forEach((e) => { const s = (e.meta && e.meta.screen) || '(알 수 없음)'; n[s] = (n[s] || 0) + 1; });
      return Object.entries(n).map(([screen, c]) => ({ screen, c })).sort((a, b) => b.c - a.c).slice(0, 30);
    }
    /* 관리자 패키지 목록(content.js `all=1`) — 전부, 출발일 순 → 최근 수정 순 */
    if (/^select \* from packages order by coalesce\(depart_date, '2999-12-31'\) asc, updated_at desc$/.test(q)) {
      const day = (v) => (v ? String(v).slice(0, 10) : '2999-12-31');
      return T('packages').sort((a, b) => day(a.depart_date).localeCompare(day(b.depart_date))
        || String(b.updated_at).localeCompare(String(a.updated_at)));
    }
    /* 단순 select —`select <칸> from <표> [order by created_at desc] [limit ?]` */
    if ((m = /^select [\s\S]+? from (\w+)(?: where [\s\S]+?)?(?: order by ([\w ,]+?))?(?: limit \?)?$/.exec(q))) {
      const table = m[1];
      if (!(table in d)) { unknown.push('없는 표: ' + q); throw new Error('fixture: 백업에 없는 표 ' + table); }
      if (/ where /.test(q) && !/^select distinct currency from custom_destinations where currency is not null/.test(q)) {
        unknown.push(q); throw new Error('fixture: 조건이 있는 쿼리를 모른다 — ' + q);
      }
      let rows = T(table);
      if (/created_at desc/.test(m[2] || '')) rows = byTime(rows, true);
      if (/^select distinct currency/.test(q)) rows = [...new Set(rows.map((r) => r.currency).filter(Boolean))].map((currency) => ({ currency }));
      return rows;
    }
    unknown.push(q);
    throw new Error('fixture: 모르는 쿼리 — ' + q);
  };
  const sql = (strings, ...vals) => Promise.resolve().then(() =>
    answer(strings.join('?').replace(/\s+/g, ' ').trim(), vals));
  return { sql, unknown };
}

/* 핸들러를 부른다 — 세션은 **진짜 auth.js로 서명**한다 */
async function serverResponses(d) {
  const owner = { role: 'owner', active: true, display_name: '점검용', updated_at: new Date(0) };
  const { sql, unknown } = makeSql(d, owner);
  const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
  /* ⚠ 이미 올라온 `api/` 모듈은 **진짜 db.js의 sql을 쥐고 있다**(make_admin_fixture가 먼저
     quote-shares.js를 부른다 → auth.js까지 딸려 온다). 내려야 가짜 sql로 다시 묶인다. */
  const API = path.join(ROOT, 'api') + path.sep;
  for (const k of Object.keys(require.cache)) if (k.startsWith(API)) delete require.cache[k];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql } };
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'fixture-secret-not-for-prod';
  const auth = require(path.join(ROOT, 'api', '_lib', 'auth.js'));
  const token = await auth.signSession({ id: '1', username: 'check', displayName: '점검용', role: 'owner' });

  const out = {}, failed = [];
  const quiet = console.error; console.error = () => {};
  try {
    for (const [url, file, query] of ENDPOINTS) {
      const handler = require(path.join(ROOT, 'api', file));
      const res = {
        statusCode: 200, body: undefined, headers: {},
        status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; },
        setHeader(k, v) { this.headers[k] = v; return this; }, end() { return this; }, send(b) { this.body = b; return this; },
      };
      const req = { method: 'GET', url, query, headers: {}, cookies: { [auth.COOKIE_NAME]: token } };
      try { await handler(req, res); } catch (e) { failed.push(url + ' — ' + e.message); continue; }
      if (res.statusCode !== 200 || res.body === undefined) failed.push(url + ' — ' + res.statusCode + ' ' + JSON.stringify(res.body));
      else out[url] = res.body;
    }
  } finally { console.error = quiet; }
  return { responses: out, failed, unknown };
}

module.exports = { serverResponses, ENDPOINTS };

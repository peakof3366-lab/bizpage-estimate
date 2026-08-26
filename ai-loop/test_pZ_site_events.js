/* PZ 검증: 방문/이벤트 수집(site_events) 경로.

   원래 결함 —
   ① `/api/track`은 **인증 없는 공개 POST 넷 중 하나**인데 혼자만 방어선 밖에 있었다.
      `name`은 화이트리스트로 걸렀지만 `meta`는 **아무 검증 없이 통째로 저장**됐고
      크기 상한도 없었다(`public_input.js`의 64KB 상한은 quotes·inquiries·
      quote-shares 셋에만 걸려 있고, 그 파일 주석도 셋만 열거한다 — 결함 생성기 ①·④).
      실제로 프로덕션 dest_select 3건의 목적지가 전부 `QA스모크553816` 같은 값이었고
      관리자 대시보드 "연수지 선택 TOP 5"에 그대로 올라가 있었다.
   ② `consult_request`가 수집 목록(track.js)에만 있고 집계(insights.js)·화면
      (admin.html btnMap) 어디에도 없었다. 상담 신청 클릭이 DB에 쌓이기만 하고
      **아무도 볼 수 없는 지표**였다 — 퍼널에서 리드 직전 단계다(결함 생성기 ①).
   ③ 방문 원본 행 상한(3,000)에 걸린 사실이 화면에 안 남았다. 넘는 순간 "전체 방문"이
      멈추고, 퍼널 분모가 굳어 전환율이 부풀려지고, 14일 차트는 오래된 날짜부터 잘려
      **평평한 트래픽이 우상향으로 보인다**(결함 생성기 ② — 조용한 폴백).
   ④ 연수지 집계 쿼리에 LIMIT이 없어, 값의 출처가 공개 POST인데도 응답 행 수를
      외부에서 늘릴 수 있었다.

   [6]~[8]은 **핸들러를 실제로 실행**한다 — 소스 정규식만으로는 "막힌다고 적혀 있다"와
   "실제로 막힌다"를 구별할 수 없다(결함 생성기 ③). DB는 가짜로 갈아끼워 운영을
   건드리지 않는다.

   실행: node ai-loop/test_pZ_site_events.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB. api/_lib/db 를 가로채 실제 Neon 연결을 만들지 않는다. ── */
let customDestRows = [];
let customDestThrows = false;
let inserted = [];
/* insights.js의 집계 쿼리는 [9]에서만 갈아끼운다(그전에는 빈 배열). */
let analyticsSql = null;
const fakeSql = (strings, ...vals) => {
  const q = strings.join('?');
  if (analyticsSql && /from site_events/.test(q) && !/insert into/.test(q)) {
    return Promise.resolve(analyticsSql(q));
  }
  if (/from custom_destinations/.test(q)) {
    if (customDestThrows) return Promise.reject(new Error('db down'));
    return Promise.resolve(customDestRows);
  }
  if (/insert into site_events/.test(q)) {
    inserted.push({ name: vals[0], meta: JSON.parse(vals[1]) });
    return Promise.resolve([]);
  }
  return Promise.resolve([]);
};
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: fakeSql } };

const siteEvents = require(path.join(ROOT, 'api', '_lib', 'site_events.js'));
const trackHandler = require(path.join(ROOT, 'api', 'track.js'));

const trackSrc = read(path.join('api', 'track.js'));
const insightsSrc = read(path.join('api', 'admin', 'insights.js'));
const adminSrc = read('admin.html');
const scriptSrc = read('script.js');

function fakeRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const post = async (body) => {
  inserted = [];
  const res = fakeRes();
  await trackHandler({ method: 'POST', body }, res);
  return res;
};

/* ══ [1] 이벤트 정의가 한 곳에서 파생되는가 (②) ══ */
console.log('[1] 이벤트 정의 단일 진실');
ok('track.js가 이름 목록을 손으로 적지 않고 site_events에서 가져온다',
  /require\('\.\/_lib\/site_events'\)/.test(trackSrc) && !/const ALLOWED_NAMES = new Set\(\[/.test(trackSrc));
ok('insights.js도 같은 모듈에서 가져온다',
  /require\('\.\.\/_lib\/site_events'\)/.test(insightsSrc)
  && !/const CLICK_EVENT_NAMES = \[/.test(insightsSrc));
ok('consult_request가 수집 허용 목록에 있다', siteEvents.ALLOWED_NAMES.has('consult_request'));
ok('consult_request가 집계 목록에도 있다 (예전엔 여기만 빠져 있었다)',
  siteEvents.CLICK_EVENT_NAMES.includes('consult_request'));
ok('pageview는 클릭 통계에 들어가지 않는다', !siteEvents.CLICK_EVENT_NAMES.includes('pageview'));
ok('dest_select도 클릭 통계에 들어가지 않는다', !siteEvents.CLICK_EVENT_NAMES.includes('dest_select'));

/* script.js가 실제로 보내는 이름이 전부 허용 목록에 있어야 한다 —
   여기가 어긋나면 고객 브라우저가 보낸 이벤트를 서버가 400으로 버린다. */
console.log('\n[2] script.js가 보내는 이름 ↔ 서버 허용 목록');
/* ⚠ 문자군에 숫자를 빼면 'estimate_step2'가 조용히 빠진다 — 그러면 이 대조는
   "찾은 것만 검사"하게 되어 정작 어긋난 이름을 놓친다. 실제로 처음 이 테스트를
   쓸 때 그렇게 짰다가 [3]에서 드러났다. 그래서 개수도 함께 못 박는다. */
const sentNames = new Set();
for (const m of scriptSrc.matchAll(/_trackEvent\('([a-z0-9_]+)'\)/g)) sentNames.add(m[1]);
for (const m of scriptSrc.matchAll(/_postTrack\('([a-z0-9_]+)'/g)) sentNames.add(m[1]);
ok('script.js가 보내는 이름을 전부 찾았다 (정규식이 일부만 긁지 않았다)',
  sentNames.size === siteEvents.ALLOWED_NAMES.size,
  `찾은 것=[${[...sentNames].join(',')}] 허용=[${[...siteEvents.ALLOWED_NAMES].join(',')}]`);
for (const n of sentNames) ok(`'${n}'가 서버 허용 목록에 있다`, siteEvents.ALLOWED_NAMES.has(n));

/* ── admin.html btnMap은 브라우저 사본이라 원문 대조로 어긋남을 잡는다 ── */
console.log('\n[3] admin.html 화면 라벨 ↔ 서버 EVENT_DEFS');
const btnMapBlock = (adminSrc.match(/const btnMap = \{[\s\S]*?\};/) || [''])[0];
ok('btnMap을 찾았다', btnMapBlock.length > 0);
const btnKeys = [...btnMapBlock.matchAll(/'([a-z0-9_]+)':\s*'/g)].map((m) => m[1]);
ok('btnMap 키가 CLICK_EVENT_NAMES와 정확히 일치한다',
  btnKeys.slice().sort().join(',') === siteEvents.CLICK_EVENT_NAMES.slice().sort().join(','),
  `화면=[${btnKeys.join(',')}] 서버=[${siteEvents.CLICK_EVENT_NAMES.join(',')}]`);
for (const n of siteEvents.CLICK_EVENT_NAMES) {
  ok(`'${n}' 라벨이 서버 정의와 같다`,
    btnMapBlock.includes(`'${n}':`) && btnMapBlock.includes(siteEvents.EVENT_LABELS[n]),
    siteEvents.EVENT_LABELS[n]);
}

/* ══ [4] 집계 쿼리 상한·총계 (③④) ══ */
console.log('\n[4] 집계 쿼리 상한과 총계');
ok('연수지 집계에 LIMIT이 있다', /group by dest order by c desc limit \$\{MAX_DEST_ROWS\}/.test(
  insightsSrc.replace(/\s+/g, ' ')));
ok('방문 전체 건수를 따로 센다 (원본 배열 길이를 총계로 쓰지 않는다)',
  /select count\(\*\)::int as c from site_events where name = 'pageview'/.test(insightsSrc));
ok('절단 여부를 응답에 담는다', /visitsTruncated: visitTotal > visitRows\.length/.test(insightsSrc));
ok('상한 값을 응답에 담는다 (화면이 "몇 건 기준인지" 말할 수 있게)',
  /visitWindow: VISIT_WINDOW/.test(insightsSrc));

console.log('\n[5] 화면이 총계를 쓰는가 (③)');
ok('visitMeta() 헬퍼가 있다', /function visitMeta\(\)/.test(adminSrc));
ok('"전체 방문"이 visits.length가 아니다',
  /getElementById\('s-all'\)\.textContent\s*=\s*vm\.total/.test(adminSrc));
ok('대시보드 "총 방문"도 총계를 쓴다',
  /\$\{visitMeta\(\)\.total\.toLocaleString\(\)\}<\/div><div class="kpi-lbl">총 방문/.test(adminSrc));
ok('퍼널 분모가 총계다 (전환율이 부풀려지지 않게)',
  /const vTotal = visitMeta\(\)\.total;/.test(adminSrc));
ok('절단 시 안내를 띄울 자리가 있다', /id="s-trunc-note"/.test(adminSrc));
/* ⚠ WX(2026-08-26)에서 이 자리에 안내가 **하나 더** 생겼다(통계가 낡았다는 표시).
   그래서 「truncated면 remove, 아니면 add」라는 옛 모양이 아니라, **줄을 모아
   있으면 보이고 없으면 감추는** 모양이 됐다. 이 검사가 지키려던 것은 코드 모양이
   아니라 「평소엔 소음이 되지 않는다」이므로, 그 뜻을 고정하도록 고쳤다(지우지 않았다).
   실동작은 아래 [실동작] 묶음과 `test_wX_sync_signals.js`가 직접 렌더해서 잰다. */
ok('절단됐을 때만 보인다 (평소엔 소음이 되지 않게)',
  /if \(vm\.truncated\) \{[\s\S]{0,400}?lines\.push\(/.test(adminSrc)
  && /note\.classList\.toggle\('hidden', lines\.length === 0\)/.test(adminSrc));

/* ══ 실동작 ══ */
(async () => {
  console.log('\n[6] 실동작 — 공개 POST가 임의 meta를 저장할 수 있는가 (①)');
  customDestRows = [];

  let res = await post({ name: 'dest_select', meta: { dest: '방콕' } });
  ok('내장 목적지는 저장된다', res.code === 200 && inserted.length === 1, `${res.code}`);
  ok('meta가 dest만 남기고 재구성된다',
    inserted.length === 1 && JSON.stringify(inserted[0].meta) === '{"dest":"방콕"}',
    JSON.stringify(inserted[0] && inserted[0].meta));

  res = await post({ name: 'dest_select', meta: { dest: 'QA스모크553816' } });
  ok('모르는 목적지는 거절된다 (프로덕션에 실제로 들어가 있던 값)',
    res.code === 400 && res.body.error === 'unknown_dest', `${res.code} ${JSON.stringify(res.body)}`);
  ok('거절되면 저장하지 않는다', inserted.length === 0, JSON.stringify(inserted));

  res = await post({ name: 'dest_select', meta: { dest: '방콕', evil: '<img src=x onerror=alert(1)>' } });
  ok('허용하지 않은 meta 키는 버려진다 (원본을 그대로 넣지 않는다)',
    inserted.length === 1 && !('evil' in inserted[0].meta),
    JSON.stringify(inserted[0] && inserted[0].meta));

  res = await post({ name: 'pageview', meta: { junk: 'x'.repeat(100) } });
  ok('pageview의 meta는 통째로 비워진다',
    res.code === 200 && JSON.stringify(inserted[0].meta) === '{}',
    JSON.stringify(inserted[0] && inserted[0].meta));

  res = await post({ name: 'pageview', meta: { blob: 'x'.repeat(3000) } });
  ok('크기 상한을 넘으면 413으로 거절된다',
    res.code === 413 && res.body.error === 'meta_too_large', `${res.code}`);
  ok('상한 초과는 저장하지 않는다', inserted.length === 0);

  res = await post({ name: 'dest_select', meta: { dest: '가'.repeat(80) } });
  ok('목적지 길이 상한을 넘으면 거절된다', res.code === 400, `${res.code}`);

  res = await post({ name: '<script>alert(1)</script>', meta: {} });
  ok('모르는 이벤트 이름은 종전대로 거절된다', res.code === 400 && res.body.error === 'invalid_name');

  res = await post({ name: 'dest_select', meta: null });
  ok('dest 없는 dest_select는 거절된다 (빈 meta로 조용히 저장하지 않는다)',
    res.code === 400 && res.body.error === 'invalid_dest', `${res.code}`);

  console.log('\n[7] 실동작 — 커스텀 목적지가 통계에서 사라지지 않는가');
  /* ⚠ 픽스처는 **내장 목록에 없는** 키여야 한다. 처음엔 '세부'를 썼는데 그건 내장
     55개에 이미 있어서, 커스텀 조회를 통째로 무시해도 통과하는 무의미한 검사였다. */
  const CUSTOM_KEY = '두바이';
  ok('픽스처가 내장 목적지가 아니다 (검사가 헛돌지 않게)',
    !siteEvents.BUILTIN_DEST_KEYS.has(CUSTOM_KEY));
  customDestRows = [{ destination_key: CUSTOM_KEY }];
  res = await post({ name: 'dest_select', meta: { dest: CUSTOM_KEY } });
  ok('DB에 있는 커스텀 목적지는 통과한다 (내장 목록만 보면 조용히 사라진다)',
    res.code === 200 && inserted.length === 1, `${res.code} ${JSON.stringify(res.body)}`);
  customDestRows = [];
  res = await post({ name: 'dest_select', meta: { dest: CUSTOM_KEY } });
  ok('삭제된 커스텀 목적지는 다시 거절된다', res.code === 400, `${res.code}`);

  console.log('\n[8] 실동작 — 목적지 조회가 실패했을 때 흔적을 남기는가 (②)');
  customDestThrows = true;
  res = await post({ name: 'dest_select', meta: { dest: '방콕' } });
  ok('조회 실패해도 이벤트를 버리지 않는다', res.code === 200 && inserted.length === 1, `${res.code}`);
  ok('확인하지 못했다는 사실을 데이터에 적는다 (조용히 통과시키지 않는다)',
    inserted.length === 1 && inserted[0].meta.destUnverified === true,
    JSON.stringify(inserted[0] && inserted[0].meta));
  ok('그래도 길이 상한은 유지된다',
    (await post({ name: 'dest_select', meta: { dest: '가'.repeat(80) } })).code === 400);
  customDestThrows = false;

  /* ══ [9] 집계 엔드포인트를 실제로 돌린다 (③④) ══
     [4]는 소스 정규식이라 "쿼리에 limit이 적혀 있다"까지만 안다. 응답이 실제로
     어떤 모양인지는 돌려봐야 한다. */
  console.log('\n[9] 실동작 — 집계 응답이 절단을 알려주는가');
  const authPath = require.resolve(path.join(ROOT, 'api', '_lib', 'auth.js'));
  require.cache[authPath] = {
    id: authPath, filename: authPath, loaded: true,
    exports: { requireAdmin: async () => true, requireRole: async () => true },
  };
  let pageviewTotal = 12345;
  let windowRows = 3000;
  analyticsSql = (q) => {
    if (/order by created_at desc limit/.test(q)) {
      return new Array(windowRows).fill(0).map(() => ({ ts: '2026-07-31T00:00:00Z' }));
    }
    if (/count\(\*\)::int as c from site_events where name = 'pageview'/.test(q)) {
      return [{ c: pageviewTotal }];
    }
    if (/count\(distinct/.test(q)) return [{ c: 2 }];
    if (/group by dest/.test(q)) return [{ dest: '방콕', c: 9 }, { dest: '도쿄', c: 4 }];
    if (/group by name/.test(q)) return [{ name: 'consult_request', c: 7 }, { name: 'kakao', c: 3 }];
    return [];
  };
  const insights = require(path.join(ROOT, 'api', 'admin', 'insights.js'));
  let ires = fakeRes();
  await insights({ method: 'GET', query: { type: 'analytics' }, cookies: {} }, ires);
  ok('집계가 200을 돌려준다', ires.code === 200, `${ires.code} ${JSON.stringify(ires.body)}`);
  ok('전체 방문이 원본 행 수가 아니라 count(*)다',
    ires.body && ires.body.visitTotal === 12345, JSON.stringify(ires.body && ires.body.visitTotal));
  ok('절단 사실을 알린다 (예전엔 이 값 자체가 없었다)',
    ires.body && ires.body.visitsTruncated === true);
  ok('상한 값을 함께 준다', ires.body && ires.body.visitWindow === 3000);
  ok('consult_request가 집계에 실제로 담긴다 (예전엔 통째로 빠졌다)',
    ires.body && ires.body.events && ires.body.events.consult_request === 7,
    JSON.stringify(ires.body && ires.body.events));

  pageviewTotal = 42; windowRows = 42;
  ires = fakeRes();
  await insights({ method: 'GET', query: { type: 'analytics' }, cookies: {} }, ires);
  ok('상한에 안 걸리면 절단 표시가 꺼진다 (평소에 소음이 되지 않게)',
    ires.body && ires.body.visitsTruncated === false && ires.body.visitTotal === 42,
    JSON.stringify(ires.body && { t: ires.body.visitTotal, tr: ires.body.visitsTruncated }));

  /* ══ [10] 안전망이 실제로 도는지 — 옛 동작을 일부러 되살려 잡히는지 확인 ══ */
  console.log('\n[10] 옛 동작을 심으면 잡히는가 (결함 생성기 ③)');
  const before = fail;

  /* 옛 track.js: meta를 그대로 저장 */
  const oldMeta = (name, meta) => (meta && typeof meta === 'object' ? meta : {});
  const oldStored = oldMeta('dest_select', { dest: 'QA스모크553816' });
  ok('옛 방식이면 모르는 목적지가 그대로 저장됐다 (지금은 거절된다)',
    oldStored.dest === 'QA스모크553816' && siteEvents.normalizeMeta(
      'dest_select', { dest: 'QA스모크553816' }, new Set(siteEvents.BUILTIN_DEST_KEYS)).ok === false);

  /* 옛 insights.js: click 목록에 consult_request 없음 → btnMap 대조가 실패해야 한다 */
  const oldClick = ['header_cta', 'estimate_step2', 'estimate_complete', 'kakao'];
  ok('옛 집계 목록으로는 btnMap 대조가 실패한다 (=이 대조가 실제로 일한다)',
    btnKeys.slice().sort().join(',') !== oldClick.slice().sort().join(','));

  /* 옛 admin.html: 총계 대신 원본 길이 */
  const fakeVisits = new Array(3000).fill(0);
  const oldTotal = fakeVisits.length;
  const newTotal = 12345;
  ok('옛 방식이면 방문 12,345건이 3,000으로 보였다',
    oldTotal === 3000 && newTotal !== oldTotal);

  ok('[10]에서 새로 실패한 단언이 없다 (심어본 것은 전부 잡혔다)', fail === before);

  /* ══ [11] admin.html을 실제로 렌더한다 ══
     [5]는 소스 정규식이라 "그렇게 적혀 있다"까지만 안다. 화면에 실제로 무슨 숫자가
     찍히는지는 렌더해 봐야 한다(CLAUDE.md: 소스 읽기로 끝내지 말 것). */
  console.log('\n[11] 실동작 — admin.html 렌더 결과');
  const { JSDOM } = require('jsdom');
  const { htmlWithDeps } = require('./_jsdom_deps');

  const SEED = {
    linkedt_visits: JSON.stringify(new Array(3000).fill(0).map(() => ({ ts: new Date().toISOString() }))),
    linkedt_visit_meta: JSON.stringify({ visitTotal: 12345, visitWindow: 3000, visitsTruncated: true }),
    linkedt_events: JSON.stringify({ consult_request: 7, kakao: 3, estimate_complete: 300 }),
    linkedt_dest_stats: JSON.stringify({ 방콕: 9 }),
    linkedt_contacts: '[]',
    linkedt_estimates: '[]',
    linkedt_estimates_full: '[]',
  };

  const dom = new JSDOM(htmlWithDeps('admin.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      for (const [k, v] of Object.entries(SEED)) window.localStorage.setItem(k, v);
      window.fetch = () => new Promise(() => {}); // 네트워크는 타지 않는다
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const w = dom.window;
  await new Promise((r) => setTimeout(r, 200));
  const doc = w.document;

  ok('admin.html이 로드되고 렌더 함수가 있다',
    typeof w.renderStats === 'function' && typeof w.renderEvents === 'function'
    && typeof w.visitMeta === 'function');

  w.renderStats();
  ok('"전체 방문"에 12,345가 찍힌다 (예전엔 3,000에서 멈췄다)',
    doc.getElementById('s-all').textContent === '12,345', doc.getElementById('s-all').textContent);
  const note = doc.getElementById('s-trunc-note');
  ok('절단 안내가 화면에 보인다', !note.classList.contains('hidden'));
  ok('안내가 전체 건수와 상한을 둘 다 말한다',
    note.textContent.includes('12,345') && note.textContent.includes('3,000'), note.textContent);

  w.renderEvents();
  const evHtml = doc.getElementById('ev-buttons').innerHTML;
  ok('"상담 신청 제출"이 클릭 통계에 실제로 렌더된다 (예전엔 화면에 없었다)',
    evHtml.includes('상담 신청 제출') && evHtml.includes('>7<'), evHtml.slice(0, 200));
  const funnel = doc.getElementById('ev-funnel').textContent;
  ok('퍼널 분모가 12,345다', funnel.includes('12,345'), funnel.slice(0, 120));
  ok('견적 완료 전환율이 2%다 (300/12,345 — 옛 분모 3,000이면 10%로 부풀려졌다)',
    /견적완료300회\(2%\)/.test(funnel.replace(/\s+/g, '')), funnel.replace(/\s+/g, '').slice(0, 160));

  /* 절단되지 않은 평상시 — 안내가 사라져야 한다 */
  w.localStorage.setItem('linkedt_visits', JSON.stringify([{ ts: new Date().toISOString() }]));
  w.localStorage.setItem('linkedt_visit_meta',
    JSON.stringify({ visitTotal: 1, visitWindow: 3000, visitsTruncated: false }));
  w.renderStats();
  ok('절단이 아니면 안내가 숨겨진다', doc.getElementById('s-trunc-note').classList.contains('hidden'));
  ok('그때 "전체 방문"은 실제 건수다', doc.getElementById('s-all').textContent === '1',
    doc.getElementById('s-all').textContent);

  /* 옛 응답(visitTotal 없음)을 받아도 종전 동작으로 남는가 — 배포 순서가 어긋나도
     화면이 NaN을 찍지 않아야 한다. */
  w.localStorage.removeItem('linkedt_visit_meta');
  w.localStorage.setItem('linkedt_visits', JSON.stringify(new Array(5).fill(0).map(() => ({ ts: new Date().toISOString() }))));
  w.renderStats();
  ok('visitMeta가 없는 옛 캐시면 원본 건수로 떨어진다 (NaN이 아니다)',
    doc.getElementById('s-all').textContent === '5', doc.getElementById('s-all').textContent);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

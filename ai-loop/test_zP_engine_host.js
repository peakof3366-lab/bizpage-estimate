/* ═══════════════════════════════════════════════════════════════════════════
   견적 엔진 호스트 검사 — `quote_engine_host.js`
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15, 견적산출 3분류 개편 중에 생겼다.

   ■ 이 검사가 있는 이유
   엔진이 읽는 입력칸 묶음이 이제 **셋**이다 — `index.html`(고객), `admin-quote.html`
   (담당자), `quote_engine_host.js`(내부직원용). 목록이 갈리면 어느 한 화면만 조용히
   옛 값으로 계산한다(결함 생성기 ①, 이 저장소가 여섯 번 당한 유형).
   CLAUDE.md: 「불가피하게 나뉘면 **테스트로 대조한다**」 — 여기가 그 자리다.

   ■ 무엇을 어떻게 재는가
   ① **엔진 소스에서 뽑아 맞춘다.** `script.js`의 `getBreakdownData` 본문에서
      `getElementById('…')`와 `input[name="…"]`를 **추출**해 `FIELDS`와 대조한다.
      손으로 적은 목록끼리 비교하면 둘 다 틀렸을 때 통과한다.
   ② **기본값을 고객 화면과 맞춘다.** 라디오·체크박스의 기본 상태가 `index.html`의
      `checked`와 달라지면, 같은 여행에 다른 금액이 나온다.
   ③ 🔴 **금액을 직접 대조한다 — 이게 진짜 그물이다.**
      호스트로 낸 금액과 `_engine_boot`(= `index.html`을 실제로 띄운 것)로 낸 금액이
      **한 원까지 같아야** 한다. ①②가 다 통과해도 어딘가 어긋나면 여기서 걸린다.
      실제로 그랬다 — 처음엔 `programType` 기본을 `'industry'`로 박아 두어 금액이
      **18% 높게** 나왔고, `'corporate'`는 존재하지도 않는 값이라 계수가 조용히 1.0으로
      떨어지고 있었다. ①②만 있었으면 통과했을 자리다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { bootEngine } = require('./_engine_boot');
const HOST = require(path.join(ROOT, 'quote_engine_host.js'));

let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const SRC = read('script.js').replace(/\r\n/g, '\n');

/* ═══ ① 엔진 소스에서 뽑아 맞춘다 ═══ */
const gi = SRC.indexOf('function getBreakdownData()');
const gj = SRC.indexOf('\n}\n', gi);
ok('[1] getBreakdownData를 찾았다', gi >= 0 && gj > gi);
const BODY = SRC.slice(gi, gj);

const wantIds = Array.from(new Set(
  Array.from(BODY.matchAll(/getElementById\('([^']+)'\)/g)).map((m) => m[1])));
/* `destinationSelect`는 최상위에서 잡은 `#destination`이다 — 본문에는 이름만 나온다 */
if (BODY.indexOf('destinationSelect') >= 0) wantIds.push('destination');

const haveIds = [].concat(HOST.FIELDS.select, HOST.FIELDS.date, HOST.FIELDS.number,
  Object.keys(HOST.FIELDS.check), HOST.EXTRA_IDS, HOST.SHELL.map((s) => s.id));
const missIds = wantIds.filter((id) => haveIds.indexOf(id) < 0);
ok('[1-b] 엔진이 읽는 칸을 호스트가 전부 만든다', missIds.length === 0, '빠진 것: ' + missIds.join(', '));
ok('[1-c] 엔진이 읽는 칸이 20개 안팎이다 (추출이 통째로 실패하면 0이 된다)',
  wantIds.length >= 15, '추출된 개수: ' + wantIds.length);

const wantRadios = Array.from(new Set(
  Array.from(BODY.matchAll(/input\[name="([A-Za-z]+)"\]/g)).map((m) => m[1])));
const haveRadios = Object.keys(HOST.FIELDS.radio);
ok('[1-d] 엔진이 읽는 라디오 묶음을 호스트가 전부 만든다',
  wantRadios.every((n) => haveRadios.indexOf(n) >= 0),
  '빠진 것: ' + wantRadios.filter((n) => haveRadios.indexOf(n) < 0).join(', '));
ok('[1-e] 라디오 묶음이 4개 추출됐다', wantRadios.length === 4, '추출: ' + wantRadios.join(','));

/* ═══ ② 기본값이 고객 화면과 같은가 ═══ */
const IDX = read('index.html');
Object.keys(HOST.FIELDS.radio).forEach((name) => {
  const g = HOST.FIELDS.radio[name];
  /* index.html에서 그 묶음의 `checked`가 붙은 값을 찾는다 */
  const re = new RegExp('name="' + name + '"[^>]*value="([^"]+)"[^>]*checked|checked[^>]*name="' + name + '"[^>]*value="([^"]+)"', 'g');
  const hits = Array.from(IDX.matchAll(re)).map((m) => m[1] || m[2]);
  if (!hits.length) { ok('[2] ' + name + ' 기본값을 고객 화면에서 찾았다', false, '못 찾음'); return; }
  ok('[2] ' + name + ' 기본값이 고객 화면과 같다', hits[0] === g.def, '고객 ' + hits[0] + ' / 호스트 ' + g.def);
  /* 값 목록도 같아야 한다 — 없는 값을 고르면 조용히 기본값이 된다 */
  const vals = Array.from(new Set(Array.from(IDX.matchAll(new RegExp('name="' + name + '"[^>]*value="([^"]+)"', 'g'))).map((m) => m[1])));
  const missV = vals.filter((v) => g.values.indexOf(v) < 0);
  ok('[2-b] ' + name + ' 값 목록에 빠진 게 없다', missV.length === 0, '빠짐: ' + missV.join(','));
});
Object.keys(HOST.FIELDS.check).forEach((id) => {
  const m = new RegExp('id="' + id + '"([^>]*)>').exec(IDX);
  if (!m) { ok('[2-c] ' + id + '을 고객 화면에서 찾았다', false, '못 찾음'); return; }
  const checked = /\bchecked\b/.test(m[1]);
  ok('[2-c] ' + id + ' 기본 상태가 고객 화면과 같다', checked === HOST.FIELDS.check[id],
    '고객 ' + checked + ' / 호스트 ' + HOST.FIELDS.check[id]);
});

/* ═══ ③ 🔴 금액 대조 — 호스트 vs index.html을 실제로 띄운 엔진 ═══ */
const CASES = [
  { dest: '다낭', pax: 30, days: 5, startDate: '2027-05-20' },
  { dest: '오키나와', pax: 20, days: 4, startDate: '2027-03-10' },
  { dest: '방콕', pax: 100, days: 5, startDate: '2027-06-15' },
  { dest: '파리', pax: 20, days: 8, startDate: '2027-06-01' },
  { dest: '세부', pax: 12, days: 5, startDate: '2027-09-10', roomConfig: 'single', hotelGrade: 'deluxe' },
  { dest: '발리', pax: 24, days: 6, startDate: '2027-08-05', cabinClass: 'mixed', bizCount: 4 },
  { dest: '괌', pax: 6, days: 5, startDate: '2027-07-25', incVehicle: false, incGuide: false, incSightseeing: false },
  { dest: '코타키나발루', pax: 16, days: 5, startDate: '2027-11-03', incGolf: true, golfCount: 8, golfRounds: 2 },
  { dest: '도쿄', pax: 16, days: 4, startDate: '2027-04-01' },
  { dest: '뉴욕', pax: 15, days: 8, startDate: '2027-10-20', cabinClass: 'business' },
];

function hostWindow() {
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      /* 요율은 못 받게 한다 — `_engine_boot`도 `ratesResponse:'fail'`로 띄워 **같은 조건**으로 잰다 */
      w.fetch = (u) => (String(u).includes('/api/rates')
        ? Promise.reject(new Error('rates_unreachable')) : new Promise(() => {}));
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const W = dom.window;
  /* ⚠ `mount()`가 `script.js`보다 **먼저**여야 한다 (script.js가 최상위에서 요소를 붙든다).
     ⚠ 파일을 한 문자열로 합쳐 한 번에 eval — 안 그러면 `const` 전역이 서로 안 보인다. */
  const APP = [
    read('quote_engine_host.js'),
    ';try{QuoteEngineHost.mount();}catch(e){window.__MOUNT_ERR=e.message;}',
    read('data.js'), read('company-info.js'), read('limits.js'), read('rec_fallbacks.js'), read('script.js'),
    ';window.__READY = QuoteEngineHost.ready({destinationRates:destinationRates,'
      + 'estimateCriteria:estimateCriteria,'
      + 'DEPARTURE_CITIES:(typeof DEPARTURE_CITIES!=="undefined"?DEPARTURE_CITIES:null)});',
    ';window.__COMPUTE = (c) => QuoteEngineHost.compute(c);',
  ].join('\n');
  let err = '';
  try { W.eval(APP); } catch (e) { err = e.message; }
  return { W, err };
}

(async () => {
  const { W, err } = hostWindow();
  ok('[3] 호스트 페이지가 오류 없이 뜬다', !err, err);
  ok('[3-b] mount가 성공했다', !W.__MOUNT_ERR, W.__MOUNT_ERR || '');
  ok('[3-c] ready()가 보기 목록을 다 채웠다', W.__READY && W.__READY.ok,
    W.__READY ? '못 채운 것: ' + (W.__READY.missing || []).join(', ') : 'ready 미실행');

  const B = await bootEngine({ quiet: true, ratesResponse: 'fail' });
  CASES.forEach((c) => {
    let h = null, herr = '';
    try { h = W.__COMPUTE(c); } catch (e) { herr = e.message; }
    const spec = {};
    ['roomConfig', 'hotelGrade', 'cabinClass', 'bizCount', 'vipCount', 'incVehicle', 'incGuide',
      'incSightseeing', 'incMeal', 'incHotel', 'golfCount', 'golfRounds'].forEach((k) => {
      if (c[k] !== undefined) spec[k] = c[k];
    });
    if (c.incGolf) spec.golf = true;
    const e = B.run({ dest: c.dest, pax: c.pax, days: c.days, date: c.startDate }, spec);
    ok('[3-d] ' + c.dest + ' 총액이 고객 엔진과 같다', h && e && h.total === e.total,
      herr || ('호스트 ' + (h && h.total) + ' / 엔진 ' + (e && e.total)));
    ok('[3-e] ' + c.dest + ' 1인당도 같다', h && e && h.perPerson === e.perPerson,
      '호스트 ' + (h && h.perPerson) + ' / 엔진 ' + (e && e.perPerson));
    /* 총액이 같아도 **구성이 다르면** 두 오류가 상쇄된 것이다 */
    const hn = h ? (h.rows || []).map((r) => r.name + ':' + r.amount).join('|') : '';
    const en = e ? (e.rows || []).map((r) => r.name + ':' + r.amount).join('|') : '';
    ok('[3-f] ' + c.dest + ' 항목 구성·금액까지 같다', hn === en && !!hn, '');
  });

  /* ④ 값을 안 주면 기본값으로 **되돌아가는가** — 앞 계산이 남으면 표가 조용히 오염된다 */
  const a1 = W.__COMPUTE({ dest: '다낭', pax: 30, days: 5, startDate: '2027-05-20', hotelGrade: 'deluxe' });
  const a2 = W.__COMPUTE({ dest: '다낭', pax: 30, days: 5, startDate: '2027-05-20' });
  const a3 = B.run({ dest: '다낭', pax: 30, days: 5, date: '2027-05-20' });
  /* ⚠ **총액으로 재지 않는다.** 처음엔 「등급을 올리면 총액이 오른다」로 썼다가 걸렸는데,
     **엔진이 실제로 그렇지 않았다** — 다낭 30명 5일에서 5성급으로 올리면 호텔비는
     +3,168,000인데 마진 밴드가 떨어져(ENBT 6,703,350 → 4,623,000) 총액이 101,250원
     **내려간다**. 호스트 결함이 아니라 고객 엔진이 원래 그렇다(오키나와·방콕·파리·세부는
     정상). 금액은 대표 승인 없이 못 건드리므로 **재는 자리를 옮겼다** — 여기서는
     「손잡이가 도는가」만 보고, 역전 현상은 `audit_hotel_grade.js`가 따로 센다. */
  const h1 = (a1.rows || []).find((r) => /호텔/.test(r.name));
  const h2 = (a2.rows || []).find((r) => /호텔/.test(r.name));
  ok('[4] 등급을 올리면 호텔비가 오른다 (손잡이가 실제로 돈다)',
    h1 && h2 && h1.amount > h2.amount, h1 && h2 ? h2.amount + ' → ' + h1.amount : '호텔 행 없음');
  ok('[4-b] 안 주면 기본값으로 되돌아간다 (앞 계산이 안 남는다)', a2.total === a3.total,
    '호스트 ' + a2.total + ' / 엔진 ' + a3.total);

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 견적 엔진 호스트 — quote_engine_host.js');
  console.log('══════════════════════════════════════════════════════════════════');
  fails.forEach((f) => console.log(' ✗ ' + f));
  if (!fails.length) console.log(' ✓ 전부 통과 — 호스트가 고객 엔진과 한 원까지 같은 금액을 낸다');
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
})();

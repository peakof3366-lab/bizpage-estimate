/* ══════════════════════════════════════════════════════════════════════════
   🔄 관리자 화면이 매일 아침 스스로 새 값을 불러오는가 (2026-10-02 대표 지시)

   ■ 왜 필요한가
   서버는 매일 05:00에 환율을 받는다. 그런데 관리자 화면을 켜 둔 채 밤을 넘기면
   F5 전까지 어제 환율·어제 상태가 보였다. 대표: 「매일 아침 그 페이지에서 자동으로 갱신되게」.

   ■ 무엇을 보나 (admin.html을 jsdom으로 띄워 진짜 함수를 부른다 · 바깥 접속 없음)
     [1] 기준 시각 — 「지금 이전의 가장 최근 KST 05:15」
     [2] 🔴 어제 값이면 불러온다 · 오늘 값이면 안 부른다
     [3] 🔴 편집 창(.modal-overlay)이 열려 있으면 미룬다 — 입력하던 칸을 지킨다
     [4] 못 받았으면 시각을 안 찍는다 — 다음 확인에서 다시 해 본다
     [5] 로그인 전 · 탭이 가려졌을 때는 아무것도 안 한다
     [6] 타이머를 거는 자리(10분 · 탭으로 돌아올 때)가 admin.html에 있다
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { adminSource } = require('./_admin_source');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (why ? ' \u2014 ' + why : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — aJ 매일 아침 화면 갱신`);
  process.exit(fail ? 1 : 0);
};

const ADMIN = adminSource();
let ratesCalls = 0;
let ratesOk = true;
const dom = new JSDOM(ADMIN, {
  runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,   /* ⚠ 없으면 jsdom은 document.hidden = true로 뜬다 — 늘 「가려짐」으로 건너뛴다 */
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    w.Element.prototype.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
    w.fetch = (url) => {
      const u = String(url);
      if (/^\/api\/rates(\?|$)/.test(u) && !/action=/.test(u)) {
        ratesCalls++;
        return Promise.resolve(ratesOk
          ? { ok: true, status: 200, json: () => Promise.resolve({ overrides: {}, fxRates: { USD: 1360 }, fxBaseline: {}, customDestinations: [], coefficients: {} }) }
          : { ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
  },
});
const w = dom.window;

const finish = async () => {
  if (typeof w.dailyRefreshTick !== 'function') {
    fail++; console.log('  ✗ dailyRefreshTick이 없다 — 관리자 스크립트가 죽었거나 함수가 빠졌다');
    return done();
  }
  const KST = 9 * 3600 * 1000;
  const at = (iso) => new Date(iso + '+09:00').getTime();

  console.log('\n[1] 기준 시각 — 지금 이전의 가장 최근 KST 05:15');
  ok('① 10/2 06:00이면 10/2 05:15', w.lastDailyMark(at('2026-10-02T06:00:00')) === at('2026-10-02T05:15:00'));
  ok('① 10/2 04:00이면 어제(10/1) 05:15', w.lastDailyMark(at('2026-10-02T04:00:00')) === at('2026-10-01T05:15:00'));
  ok('① 딱 05:15이면 그 시각', w.lastDailyMark(at('2026-10-02T05:15:00')) === at('2026-10-02T05:15:00'));
  ok('① 월말을 넘긴다 (11/1 01:00 → 10/31 05:15)', w.lastDailyMark(at('2026-11-01T01:00:00')) === at('2026-10-31T05:15:00'));

  /* 로그인한 직원 — IIFE 밖의 `let currentUser`라 eval로 심는다(test_aB와 같은 이유) */
  w.eval('currentUser = { id: "1", username: "t", displayName: "시험", role: "manager" };');

  console.log('\n[2] 🔴 어제 값이면 불러오고, 오늘 값이면 안 부른다');
  w.eval('ratesLoadedAt = Date.now() - 2 * 86400000;');
  ratesCalls = 0;
  const r1 = await w.dailyRefreshTick();
  ok('② 어제 값 → 새로 불러온다', r1 === 'refreshed' && ratesCalls === 1, r1 + ' / ' + ratesCalls);
  ok('② 불러온 시각을 찍는다', w.eval('ratesLoadedAt') > Date.now() - 5000);
  const r2 = await w.dailyRefreshTick();
  ok('🔴 ② 오늘 값이면 다시 안 부른다 (10분마다 서버를 두드리지 않는다)', r2 === 'fresh' && ratesCalls === 1, r2 + ' / ' + ratesCalls);

  console.log('\n[3] 🔴 편집 창이 열려 있으면 미룬다');
  w.eval('ratesLoadedAt = 0;');
  const modal = w.document.getElementById('rateEditModal');
  ok('③ 요율 편집 창이 있다 (없으면 이 검사가 눈을 감는다)', !!modal && modal.classList.contains('modal-overlay'));
  modal.classList.remove('hidden');
  ratesCalls = 0;
  const r3 = await w.dailyRefreshTick();
  ok('🔴 ③ 편집 창이 열려 있으면 미룬다 — 부르지 않는다', r3 === 'deferred' && ratesCalls === 0, r3 + ' / ' + ratesCalls);
  modal.classList.add('hidden');
  const r4 = await w.dailyRefreshTick();
  ok('③ 닫히면 다음 확인에서 불러온다', r4 === 'refreshed' && ratesCalls === 1, r4 + ' / ' + ratesCalls);
  /* 다른 팝업도 같다 — 일괄 조정 */
  w.eval('ratesLoadedAt = 0;');
  w.document.getElementById('rateBulkModal').classList.remove('hidden');
  ok('③ 일괄 조정 창도 미룬다', (await w.dailyRefreshTick()) === 'deferred');
  w.document.getElementById('rateBulkModal').classList.add('hidden');

  console.log('\n[4] 못 받았으면 시각을 안 찍는다');
  w.eval('ratesLoadedAt = 0;');
  ratesOk = false; ratesCalls = 0;
  await w.dailyRefreshTick();
  ok('④ 실패하면 시각이 그대로(0) — 내일 아침까지 기다리지 않는다', w.eval('ratesLoadedAt') === 0 && ratesCalls === 1);
  ratesOk = true;
  const r5 = await w.dailyRefreshTick();
  ok('④ 다음 확인에서 다시 해 본다', r5 === 'refreshed' && ratesCalls === 2);

  console.log('\n[5] 로그인 전 · 탭이 가려졌을 때');
  w.eval('ratesLoadedAt = 0;');
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true });
  ratesCalls = 0;
  ok('⑤ 탭이 가려져 있으면 안 한다', (await w.dailyRefreshTick()) === 'skip' && ratesCalls === 0);
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false });
  w.eval('currentUser = null;');
  ok('⑤ 로그인 전이면 안 한다', (await w.dailyRefreshTick()) === 'skip' && ratesCalls === 0);

  console.log('\n[6] 타이머를 거는 자리');
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  ok('⑥ 10분마다 확인한다', /setInterval\(\(\) => \{ dailyRefreshTick\(\)[\s\S]{0,40}\}, 10 \* 60 \* 1000\)/.test(html));
  ok('⑥ 탭·노트북을 다시 열면 확인한다', /visibilitychange[\s\S]{0,80}dailyRefreshTick\(\)/.test(html));
  ok('⑥ 판단은 한 곳(dailyRefreshTick)에서만 — admin.html에 05:15 같은 시각을 다시 적지 않는다', !/05:15[^(]*Date\.UTC|h:\s*5,\s*m:\s*15/.test(html));

  w.close();
  done();
};
if (w.document.readyState === 'complete') finish();
else w.addEventListener('load', finish);

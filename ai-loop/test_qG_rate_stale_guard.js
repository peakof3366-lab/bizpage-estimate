/* QG 검증: 요율 화면이 **현재 기준가를 못 읽었을 때 멈추는가** — 팀원이 매일 쓰는 화면.

   고친 결함 하나(같은 뿌리, 네 경로).

   `loadRateOverrides()`가 실패를 console.warn으로만 남기고 캐시를 그대로 뒀다. 그러면
   요율표가 **data.js 폴백 기본값을 운영 중인 기준가인 것처럼** 그린다(CLAUDE.md: 요율의
   진실은 data.js가 아니라 운영 DB의 rate_overrides다). 담당자는 "값이 낡았네"로 읽고
   고쳐 저장하고, 그 저장은 살아 있던 오버라이드를 덮어쓴다. 변경 이력에는 실제로 존재한
   적 없는 '이전 값'이 남아 되돌리기(PS)도 그 값으로 돌아간다.

   더 나쁜 건 안전망이 이미 있었다는 점이다. 편집창 열기·일괄 조정·제안 적용·확인함
   기록 **네 곳 모두** 쓰기 직전에 `await loadRateOverrides()`로 최신값을 다시 받아오게
   돼 있었다(주석에도 "동료가 방금 바꿨을 수 있어서"라고 적혀 있다). 그런데 넷 다 결과를
   보지 않았다 — 실패하면 그냥 지나간다. 즉 그 안전망은 **정확히 필요한 순간(값을 모르는
   순간)에만** 없는 것이 된다. 결함 생성기 ②(조용한 폴백) + ③(발동한 적 없는 안전망).

   일괄 조정은 %를 곱하는 연산이라 피해 범위가 지역 전체다.

   방식: jsdom으로 admin.html을 띄우고 `/api/rates`를 실제로 실패시킨 뒤,
   **편집창을 열어 보고 일괄 조정 버튼을 눌러 본다.** 그 뒤 PATCH가 한 건도 나가지
   않았는지를 fetch 로그로 확인한다(화면 상태만 보면 "안 열렸다"를 못 본다).

   실행: node ai-loop/test_qG_rate_stale_guard.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 운영 DB에 실제로 들어 있는 모양의 오버라이드 — data.js 기본값과 다른 값이어야
   "기본값을 운영값인 척 보여주는" 상태를 구별할 수 있다. */
const LIVE_OVERRIDE = { 도쿄: { airfare: 399000, rateDate: '2026-07' } };

(async () => {
  console.log('[1] 기준가를 못 읽으면 화면이 그 사실을 말한다');

  let dom = await bootAdmin({ ratesReply: { ok: false, status: 500 } });
  let w = dom.window;
  ok('rateOverridesStale에 실패가 기록된다', !!w.__rateState().stale,
    JSON.stringify(w.__rateState().stale));

  w.renderRates();
  let banner = w.document.getElementById('rate-stale-banner');
  ok('경고띠가 보인다', !banner.classList.contains('hidden'));
  ok('경고띠가 "기본값일 수 있다"고 말한다', /기본값/.test(banner.textContent), banner.textContent.slice(0, 120));
  ok('경고띠에 다시 불러오기 버튼이 있다', /다시 불러오기/.test(banner.textContent));

  console.log('\n[2] 그 상태에서는 쓰기 경로가 멈춘다 — PATCH가 한 건도 나가면 안 된다');

  w.__resetFetchLog();
  await w.openRateEditModal('도쿄');
  ok('편집창이 열리지 않는다',
    w.document.getElementById('rateEditModal').classList.contains('hidden'));
  ok('왜 멈췄는지 알림으로 말한다 — 사유 + 중단 + 아무것도 안 바뀜',
    /중단했습니다/.test(w.__alerts().join('|'))
    && /기본값/.test(w.__alerts().join('|'))
    && /변경되지 않았습니다/.test(w.__alerts().join('|')),
    w.__alerts().join('|').slice(0, 200));
  ok('편집 경로에서 PATCH가 나가지 않았다', w.__patchCount() === 0, String(w.__patchCount()));

  /* 일괄 조정은 지역 전체에 %를 곱해 쓴다 — 기준값이 틀리면 한 번에 전부 틀린다. */
  w.__resetFetchLog();
  w.document.getElementById('rate-bulk-region').innerHTML = '<option value="__all__">전체</option>';
  w.document.getElementById('rate-bulk-region').value = '__all__';
  w.document.getElementById('rate-bulk-pct').value = '5';
  await w.applyRateBulk(null);
  ok('일괄 조정이 한 곳도 쓰지 않는다', w.__patchCount() === 0, String(w.__patchCount()));
  ok('일괄 조정 중단을 알림으로 말한다', /중단/.test(w.__alerts().join('|')),
    w.__alerts().join('|').slice(0, 160));

  w.__resetFetchLog();
  await w.applyRateSuggestion('도쿄', 'airfare', 420000, 3);
  ok('제안 적용도 멈춘다', w.__patchCount() === 0, String(w.__patchCount()));

  w.__resetFetchLog();
  await w.confirmRateNoChange('도쿄');
  ok('"확인함" 기록도 멈춘다', w.__patchCount() === 0, String(w.__patchCount()));

  console.log('\n[3] 실패 사유별로 다르게 안내한다 — 세션 만료는 할 일이 다르다');

  dom = await bootAdmin({ ratesReply: { ok: false, status: 401 } });
  w = dom.window;
  w.renderRates();
  banner = w.document.getElementById('rate-stale-banner');
  ok('401은 재로그인으로 안내한다', /로그인/.test(banner.textContent), banner.textContent.slice(0, 120));

  dom = await bootAdmin({ ratesReply: { network: true } });
  w = dom.window;
  w.renderRates();
  banner = w.document.getElementById('rate-stale-banner');
  ok('네트워크 실패는 네트워크로 안내한다', /네트워크/.test(banner.textContent), banner.textContent.slice(0, 120));

  console.log('\n[4] 제보를 못 읽은 것과 제보가 없는 것을 구별한다');

  /* renderRateSuggestions는 후보가 0건이면 카드를 통째로 숨긴다 — 조회 실패도 똑같이
     보이므로, 담당자는 "고칠 게 없구나"로 읽는다. 그 자리에 사실을 남긴다. */
  dom = await bootAdmin({ reportsReply: { ok: false, status: 500 } });
  w = dom.window;
  ok('priceReportsStale가 기록된다', w.__rateState().reports === true);
  w.renderRates();
  banner = w.document.getElementById('rate-stale-banner');
  ok('경고띠가 갱신 제안이 비어 있는 이유를 말한다',
    /갱신 제안/.test(banner.textContent), banner.textContent.slice(0, 200));
  ok('제보만 실패했으면 편집은 막지 않는다(과잉 차단 아님)', !w.__rateState().stale);

  w.__resetFetchLog();
  await w.openRateEditModal('도쿄');
  ok('제보 실패 상태에서도 편집창은 열린다',
    !w.document.getElementById('rateEditModal').classList.contains('hidden'));

  console.log('\n[5] 정상일 때는 그대로 동작한다 — 가드가 과하게 잠기지 않았는가');

  dom = await bootAdmin({});
  w = dom.window;
  ok('정상이면 stale 표시가 없다', !w.__rateState().stale && !w.__rateState().reports);
  w.renderRates();
  banner = w.document.getElementById('rate-stale-banner');
  ok('정상이면 경고띠가 숨어 있다', banner.classList.contains('hidden'));

  ok('운영 오버라이드가 캐시에 실린다',
    w.__rateState().cache['도쿄'] && w.__rateState().cache['도쿄'].airfare === 399000,
    JSON.stringify(w.__rateState().cache['도쿄']));

  w.__resetFetchLog();
  await w.openRateEditModal('도쿄');
  ok('편집창이 열린다', !w.document.getElementById('rateEditModal').classList.contains('hidden'));
  const airfareInput = w.document.querySelector('#rate-edit-fields input[data-field="airfare"]');
  ok('편집창이 data.js 기본값이 아니라 **운영 중인 값**을 보여준다',
    airfareInput && Number(airfareInput.value) === 399000,
    airfareInput ? airfareInput.value : '(입력칸 없음)');

  console.log('\n[6] 다시 불러오기로 복구된다');

  dom = await bootAdmin({ ratesReply: { ok: false, status: 500 } });
  w = dom.window;
  w.renderRates();
  ok('복구 전에는 경고띠가 있다',
    !w.document.getElementById('rate-stale-banner').classList.contains('hidden'));
  w.__setRatesReply(null);                     // 서버가 다시 정상이 됐다
  await w.reloadRateData(null);
  ok('복구 후 경고띠가 사라진다',
    w.document.getElementById('rate-stale-banner').classList.contains('hidden'));
  ok('복구 후 운영값이 실린다', w.__rateState().cache['도쿄'] &&
    w.__rateState().cache['도쿄'].airfare === 399000, JSON.stringify(w.__rateState().cache['도쿄']));

  w.__resetFetchLog();
  await w.openRateEditModal('도쿄');
  ok('복구 후에는 편집창이 열린다',
    !w.document.getElementById('rateEditModal').classList.contains('hidden'));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* admin.html을 실제로 띄운다. rateOverridesCache·rateOverridesStale은 let 전역이라
   window에 붙지 않으므로(qE·p2b와 같은 이유) 같은 스코프에 읽기 창구를 심는다. */
async function bootAdmin({ ratesReply, reportsReply } = {}) {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  /* typeof로 감싸는 이유: 고치기 전 코드에는 이 변수들이 아예 없다. 그대로 읽으면
     테스트가 ReferenceError로 죽어서 "안전망이 없다"가 아니라 "테스트가 깨졌다"로
     보인다 — 결함을 실제로 재현해 보여주려면 옛 코드에서도 돌아가야 한다. */
  window.__rateState = () => ({
    stale: (typeof rateOverridesStale !== 'undefined') ? rateOverridesStale : null,
    reports: (typeof priceReportsStale !== 'undefined') ? priceReportsStale : false,
    cache: rateOverridesCache,
  });
  currentUser = { id: '7', username: 'staff1', displayName: '김직원', role: 'staff' };
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
      const alerts = [];
      let rates = ratesReply || null;
      w.__fetchLog = () => log;
      w.__resetFetchLog = () => { log.length = 0; alerts.length = 0; };
      w.__alerts = () => alerts;
      w.__setRatesReply = (r) => { rates = r; };
      w.__patchCount = () => log.filter(e => e.method === 'PATCH').length;

      const json = (body, status = 200) => Promise.resolve({
        ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body),
      });
      w.fetch = (url, opts) => {
        const u = String(url);
        const method = (opts && opts.method) || 'GET';
        log.push({ url: u, method, body: opts && opts.body });
        if (u.includes('/api/rates') && method === 'GET') {
          if (rates && rates.network) return Promise.reject(new Error('의도적으로 끊은 네트워크'));
          if (rates && rates.ok === false) return json({ error: 'nope' }, rates.status);
          return json({ overrides: LIVE_OVERRIDE, fxRates: {}, fxBaseline: {}, coefficients: {}, customDestinations: [] });
        }
        if (u.includes('action=priceReports')) {
          if (reportsReply && reportsReply.ok === false) return json({ error: 'nope' }, reportsReply.status);
          return json([]);
        }
        if (u.includes('action=me')) return json({ ok: true, id: '7', username: 'staff1', displayName: '김직원', role: 'staff' });
        return new Promise(() => {});   // 나머지는 무시(영구 pending)
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true;                       // 확인창은 전부 '예' — 가드가 아니라 이 가드를 본다
      w.alert = (m) => { alerts.push(String(m)); };
      w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise(r => setTimeout(r, 60));
  /* 초기 로드는 syncFromServer 경로를 타지 않으므로(로그인 상태가 아니다) 직접 부른다. */
  await dom.window.loadRateOverrides();
  await dom.window.loadPriceReports();
  return dom;
}

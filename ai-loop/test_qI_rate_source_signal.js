/* QI 검증: 요율·환율을 못 불러온 채 **금액이 조용히 달라지는가**.

   `script.js`의 applyRateOverrides는 `/api/rates`가 실패하면 `.catch(() => {})`로
   끝났다. 그 순간 세 가지가 한꺼번에 어긋난다:
     ① 요율이 data.js 기본값에 머문다(운영 진실은 rate_overrides다 — CLAUDE.md),
     ② FX_STATE가 비어 getFxAdjust가 전부 1.0이 되어 **환율 보정이 통째로 사라진다**,
     ③ 계수 노브가 기본값으로 돌아간다.
   셋 다 화면에는 그냥 '견적 금액'으로 보인다. 담당자는 그 값을 고객에게 부른다.

   QB가 추천 일정에 이미 같은 처리를 해뒀다(window.__ITINERARY_SOURCE__ + 내부 도구
   경고). 요율은 **금액 자체**가 걸린 자리라 더 그렇다. 같은 방식으로 맞춘다.

   실행: node ai-loop/test_qI_rate_source_signal.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 운영 DB에 실제로 걸려 있는 값 + 환율. data.js 기본값과 달라야 차이를 볼 수 있다. */
const RATES_OK = {
  overrides: { 도쿄: { airfare: 399000, rateDate: '2026-07' } },
  fxRates: { JPY: 9.5 },
  fxBaseline: { 도쿄: { currency: 'JPY', rate: 8.8 } },
  coefficients: { seasonStrength: 1.3 },
  customDestinations: [],
};

function bootPublic(fetchImpl) {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = fetchImpl;
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.Element.prototype.scrollIntoView = function () {};
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  /* const 전역은 window에 붙지 않는다(CLAUDE.md) — 필요한 것만 노출한다. */
  const EXPOSE = '\n;try{window.destinationRates=destinationRates;window.FX_STATE=FX_STATE;'
    + 'window.COEF_STATE=COEF_STATE;window.rateOverridesReady=rateOverridesReady;}catch(e){}\n';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  try { dom.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  return dom.window;
}

const tokyo = (w) => w.destinationRates.find(d => d.destination_key === '도쿄');

(async () => {
  console.log('[1] 정상일 때 — 운영 요율·환율·계수가 실제로 실린다');

  const w1 = bootPublic((u) => String(u).includes('/api/rates')
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(RATES_OK) })
    : new Promise(() => {}));
  const defaultAirfare = tokyo(w1).airfare;
  await w1.rateOverridesReady;

  ok('전제: 기본값과 운영값이 다르다', defaultAirfare !== 399000, String(defaultAirfare));
  ok('운영 요율이 반영된다', tokyo(w1).airfare === 399000, String(tokyo(w1).airfare));
  ok('환율이 실린다', w1.FX_STATE.rates.JPY === 9.5 && !!w1.FX_STATE.baseline['도쿄']);
  ok('계수 노브가 실린다', w1.COEF_STATE.seasonStrength === 1.3, String(w1.COEF_STATE.seasonStrength));
  ok('반영 상태를 기록으로 남긴다', w1.__RATE_SOURCE__.state === 'applied', w1.__RATE_SOURCE__.state);
  ok('어느 목적지가 반영됐는지도 남긴다', w1.__RATE_SOURCE__.applied.join(',') === '도쿄',
    JSON.stringify(w1.__RATE_SOURCE__.applied));

  console.log('\n[2] 못 불러왔을 때 — 조용히 넘어가지 않는다 (결함 생성기 ②)');

  const w2 = bootPublic((u) => String(u).includes('/api/rates')
    ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    : new Promise(() => {}));
  await w2.rateOverridesReady;

  ok('실패를 상태로 남긴다', w2.__RATE_SOURCE__.state === 'failed', w2.__RATE_SOURCE__.state);
  ok('무엇이 실패했는지도 남긴다', /http_500/.test(w2.__RATE_SOURCE__.error), w2.__RATE_SOURCE__.error);
  /* 계산은 계속 되어야 한다 — 안전한 폴백 자체는 옳다. 문제는 '말하지 않는 것'이었다. */
  ok('그래도 계산은 기본 요율로 정상 동작한다', tokyo(w2).airfare === defaultAirfare,
    String(tokyo(w2).airfare));
  ok('환율 보정이 빠졌다는 사실이 상태에 드러난다',
    Object.keys(w2.FX_STATE.rates || {}).length === 0);

  const w3 = bootPublic(() => Promise.reject(new Error('네트워크 끊김')));
  await w3.rateOverridesReady;
  ok('네트워크 실패도 같은 상태로 남는다', w3.__RATE_SOURCE__.state === 'failed', w3.__RATE_SOURCE__.state);

  console.log('\n[3] 담당자가 쓰는 내부 산출 도구가 그 사실을 알린다');

  const aqSrc = read('admin-quote.html');
  ok('내부 도구가 rateOverridesReady를 읽는다', /rateOverridesReady/.test(aqSrc));
  ok('실패일 때만 경고한다', /rateOverridesReady[\s\S]{0,200}state !== 'failed'/.test(aqSrc));
  ok('경고문이 "금액이 다를 수 있다"는 사실을 말한다',
    /기본 요율로 계산된 값이고 환율 보정이 빠져/.test(aqSrc));
  ok('고객 화면(index.html)에는 이 경고를 띄우지 않는다', !/__RATE_SOURCE__/.test(read('index.html')));

  /* 실제로 붙는지까지 본다 — 소스에 문자열이 있는 것과 화면에 뜨는 것은 다르다
     (결함 생성기 ③: 안전망은 발동시켜 봐야 안전망이다). */
  const aqWin = await bootInternal((u) => {
    const s = String(u);
    if (s.includes('/api/rates')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    if (s.includes('action=me')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, displayName: '김직원', role: 'staff' }) });
    if (s.includes('action=itineraries')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ overrides: {}, recOverrides: {}, meta: {} }) });
    return new Promise(() => {});
  });
  const warnText = [...aqWin.document.querySelectorAll('.aq-save-warn')].map(e => e.textContent).join(' | ');
  ok('내부 도구 화면에 경고가 실제로 붙는다', /최신 요율·환율을 불러오지 못했습니다/.test(warnText),
    warnText.slice(0, 200) || '(경고 없음)');

  const aqWin2 = await bootInternal((u) => {
    const s = String(u);
    if (s.includes('/api/rates')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(RATES_OK) });
    if (s.includes('action=me')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, displayName: '김직원', role: 'staff' }) });
    if (s.includes('action=itineraries')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ overrides: {}, recOverrides: {}, meta: {} }) });
    return new Promise(() => {});
  });
  const warnText2 = [...aqWin2.document.querySelectorAll('.aq-save-warn')].map(e => e.textContent).join(' | ');
  ok('정상일 때는 경고가 붙지 않는다(경고가 상시면 아무도 안 읽는다)',
    !/최신 요율·환율/.test(warnText2), warnText2.slice(0, 200));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* admin-quote.html은 <script src>를 실제로 싣지 않으므로 의존 스크립트를 인라인한다. */
async function bootInternal(fetchImpl) {
  const { htmlWithDeps } = require('./_jsdom_deps');
  const dom = new JSDOM(htmlWithDeps('admin-quote.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = fetchImpl;
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.Element.prototype.scrollIntoView = function () {};
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.alert = () => {}; w.confirm = () => true;
    },
  });
  await new Promise(r => setTimeout(r, 120));
  return dom.window;
}

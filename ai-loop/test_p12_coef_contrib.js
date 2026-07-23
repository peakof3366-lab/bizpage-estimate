/* P12 검증: admin.html의 계수 기여도 패널(coefContribHtml)이 저장된 스냅샷으로 배수 체인을
   올바르게 재구성하고, 구형 견적/상한발동/노브변경/XSS를 안전하게 처리하는지 실제 admin.html
   스크립트로 확인. 실행: node ai-loop/test_p12_coef_contrib.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const dom = new JSDOM(read('admin.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {}); // 모든 fetch 무시
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  const { window } = dom;
  await new Promise(r => setTimeout(r, 150));

  if (typeof window.coefContribHtml !== 'function') {
    console.log('✗ coefContribHtml 로드 실패'); process.exit(1);
  }
  const H = window.coefContribHtml;

  console.log('[1] 스냅샷 있는 견적 — 항공/호텔 순배수 정확 재구성');
  const e1 = {
    seasonFactor: 1.20, leadFactor: 1.12, peakFactor: 1.25, peakLabel: '설 연휴(근사)',
    departureFactor: 1.16, bizFactor: 1.0, fxAdjust: 1.10, hotelPeakFactor: 1.20,
    combinedFactor: 1.0, paxFactor: 0.95, seasonId: 'peak', coef: null,
  };
  const h1 = H(e1);
  // airNet = 1.20*1.16*1.0*1.12*1.25*1 = 1.9488
  ok('항공 순배수 ×1.949 표기', /×1\.949/.test(h1), h1.match(/항공[\s\S]{0,400}?×[\d.]+/)?.[0]);
  // hotelNet = 1.20*1.10*1.20 = 1.584
  ok('호텔 순배수 ×1.584 표기', /×1\.584/.test(h1));
  ok('시즌 라벨(성수기) 표기', /성수기/.test(h1));
  ok('피크 라벨(설 연휴) 표기', /설 연휴/.test(h1));
  ok('상한 미발동 시 변동상한 칩 없음', !/변동상한/.test(h1));
  ok('구형 안내문 아님', !/스냅샷 도입.*이전/.test(h1));

  console.log('[2] 스냅샷 없는 구형 견적 — 정보 없음 안내');
  const h2 = H({ orgName: '옛날기관', total: 1000000 });
  ok('정보 없음 안내 표시', /이전에 생성/.test(h2));
  ok('배수 칩 미표기', !/순배수|×1\.9/.test(h2));

  console.log('[3] 극단 변동 — P11 상한(2.5) 발동 + 비례 축소');
  const e3 = { seasonFactor: 2.0, leadFactor: 1.5, peakFactor: 1.4, departureFactor: 1.0, bizFactor: 1.0, fxAdjust: 1.0, hotelPeakFactor: 1.0, combinedFactor: 1.0, paxFactor: 1.0 };
  const h3 = H(e3);
  // volProduct=4.2>2.5 → volScale=0.5952; airNet = 2.0*1.5*1.4*0.5952 = 2.5
  ok('변동상한 칩 표시', /변동상한/.test(h3));
  ok('상한 후 항공 순배수 ×2.500', /×2\.500/.test(h3));
  ok('높은 변동배수 확인권장 플래그', /확인 권장/.test(h3));

  console.log('[4] 노브(coef) 기본값과 다름 — 별도 안내');
  const e4 = { ...e1, coef: { seasonStrength: 1.3, leadTimeStrength: 1.0, peakStrength: 1.0, hotelPeakWeight: 0.8 } };
  const h4 = H(e4);
  ok('노브 조정 안내 표시', /적용된 계수 노브/.test(h4));
  ok('변경된 노브만(시즌강도 1.3)', /시즌강도 1\.3/.test(h4));
  ok('기본값 노브는 미표기(리드강도 없음)', !/리드강도/.test(h4));

  console.log('[5] 노브가 전부 기본값 — 안내 없음');
  const h5 = H({ ...e1, coef: { seasonStrength: 1.0, leadTimeStrength: 1.0, peakStrength: 1.0, hotelPeakWeight: 0.8 } });
  ok('기본 노브면 노브 안내 없음', !/적용된 계수 노브/.test(h5));

  console.log('[6] XSS 안전 — peakLabel/seasonId 이스케이프');
  const h6 = H({ ...e1, peakLabel: '<img src=x onerror=alert(1)>' });
  ok('피크 라벨 HTML 이스케이프', !/<img/.test(h6) && /&lt;img/.test(h6));

  console.log('[7] 저배수(할인) — 색상/방향 구분');
  const h7 = H({ seasonFactor: 0.88, leadFactor: 0.92, peakFactor: 1.0, departureFactor: 1.0, bizFactor: 1.0, fxAdjust: 0.95, hotelPeakFactor: 1.0, combinedFactor: 1.0, paxFactor: 0.85, seasonId: 'offpeak' });
  // airNet = 0.88*0.92 = 0.8096
  ok('비수기 순배수 ×0.810', /×0\.810/.test(h7));
  ok('확인권장 플래그 없음(저배수)', !/확인 권장/.test(h7));
  ok('비수기 라벨 표기', /비수기/.test(h7));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

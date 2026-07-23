/* P2b-2 검증: admin.html의 견적 계수 조정 카드가 매니저+에게만 렌더되고, 값 표시·조정됨
   배지·저장 페이로드·리셋이 올바른지 실제 admin.html 스크립트로 확인.
   실행: node ai-loop/test_p2b_admin_ui.js  (프로젝트 루트에서) */
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
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/* admin.html의 인라인 스크립트 중 currentUser를 선언한 블록 끝에 상태 주입기를 붙인다
   (currentUser·coefficientsCache는 let이라 window에 없으므로, 같은 스코프에서 노출해야 접근 가능). */
function buildHtml() {
  const html = read('admin.html');
  const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};window.__setCoefCache=c=>{coefficientsCache=c};window.__getPosted=()=>window.__posted;}catch(e){}\n';
  let injected = false;
  return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
}

(async () => {
  let posted = null;
  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      window.__posted = null;
      window.fetch = (url, opts) => {
        if (typeof url === 'string' && url.includes('saveCoefficients')) {
          window.__posted = JSON.parse(opts.body);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, coefficients: window.__posted.coefficients }) });
        }
        return new Promise(() => {}); // 그 외 fetch는 무시(영구 pending)
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
      window.confirm = () => true;
    },
  });
  const { window } = dom;
  await new Promise(r => setTimeout(r, 150));
  const doc = window.document;

  if (typeof window.renderCoefficients !== 'function' || typeof window.__setUser !== 'function') {
    console.log('✗ 로드/주입 실패'); process.exit(1);
  }

  console.log('[1] 직원(staff)에게는 카드 숨김');
  window.__setUser({ id: 9, role: 'staff', displayName: '김직원' });
  window.__setCoefCache({});
  window.renderCoefficients();
  ok('coef-tuning-card 숨김(staff)', doc.getElementById('coef-tuning-card').classList.contains('hidden'));
  ok('입력 미렌더(staff)', doc.querySelectorAll('#coef-fields input[data-coef]').length === 0);

  console.log('[2] 매니저 — 카드 표시 + 4개 입력 렌더');
  window.__setUser({ id: 2, role: 'manager', displayName: '박매니저' });
  window.__setCoefCache({ seasonStrength: 0.7 }); // 하나만 조정된 상태
  window.renderCoefficients();
  ok('카드 표시(manager)', !doc.getElementById('coef-tuning-card').classList.contains('hidden'));
  const inputs = doc.querySelectorAll('#coef-fields input[data-coef]');
  ok('입력 4개 렌더', inputs.length === 4, 'got ' + inputs.length);
  const byKey = {}; inputs.forEach(i => byKey[i.dataset.coef] = i);
  ok('seasonStrength 값=0.7(캐시 반영)', approx(Number(byKey.seasonStrength.value), 0.7), byKey.seasonStrength.value);
  ok('leadTimeStrength 값=1.0(기본)', approx(Number(byKey.leadTimeStrength.value), 1.0), byKey.leadTimeStrength.value);
  ok('hotelPeakWeight 값=0.8(기본)', approx(Number(byKey.hotelPeakWeight.value), 0.8), byKey.hotelPeakWeight.value);
  ok('조정된 항목에 "조정됨" 배지', /조정됨/.test(byKey.seasonStrength.closest('label').innerHTML));
  ok('기본값 항목엔 배지 없음', !/조정됨/.test(byKey.leadTimeStrength.closest('label').innerHTML));

  console.log('[3] 입력 min/max 속성이 스펙과 일치');
  ok('seasonStrength min0.5/max2', byKey.seasonStrength.min === '0.5' && byKey.seasonStrength.max === '2');
  ok('hotelPeakWeight min0/max1', byKey.hotelPeakWeight.min === '0' && byKey.hotelPeakWeight.max === '1');

  console.log('[4] 저장 — 4개 값 전부 payload로 전송(범위 내)');
  byKey.seasonStrength.value = '1.3';
  byKey.peakStrength.value = '0.9';
  await window.saveCoefficients();
  const posted2 = window.__getPosted();
  ok('POST 발생', !!posted2 && !!posted2.coefficients);
  ok('payload에 4개 키 전부', posted2 && ['seasonStrength','leadTimeStrength','peakStrength','hotelPeakWeight'].every(k => k in posted2.coefficients));
  ok('편집값 반영(season1.3·peak0.9)', posted2 && approx(posted2.coefficients.seasonStrength,1.3) && approx(posted2.coefficients.peakStrength,0.9));
  ok('저장 성공 메시지', /저장/.test(doc.getElementById('coef-save-msg').textContent));

  console.log('[5] 범위 밖 입력 — 저장 거부(클라 검증)');
  window.__posted = null;
  /* [4] 저장 성공 후 renderCoefficients가 입력을 다시 그렸으므로 살아있는 입력을 새로 조회 */
  const seasonLive = doc.querySelector('#coef-fields input[data-coef="seasonStrength"]');
  seasonLive.value = '9'; // max 2 초과
  await window.saveCoefficients();
  ok('범위 밖이면 POST 안 함', window.__getPosted() === null);
  ok('경고 메시지 표시', /범위/.test(doc.getElementById('coef-save-msg').textContent));

  console.log('[6] 기본값으로 — 입력을 스펙 기본값으로 채움');
  window.resetCoefficientsToDefault();
  const after = {}; doc.querySelectorAll('#coef-fields input[data-coef]').forEach(i => after[i.dataset.coef] = Number(i.value));
  ok('전부 기본값(1,1,1,0.8)', approx(after.seasonStrength,1)&&approx(after.leadTimeStrength,1)&&approx(after.peakStrength,1)&&approx(after.hotelPeakWeight,0.8));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

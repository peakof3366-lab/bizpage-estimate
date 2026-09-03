/* ═══════════════════════════════════════════════════════════════════════════
   YS — **총계의 0.3%만 읽고도 화면은 성공처럼 보였다**
   ───────────────────────────────────────────────────────────────────────────
   대표 방침: 견적서는 계속 들어오고, **발행처마다 양식이 다르다.** 그래서 언젠가
   반드시 「처음 보는 양식」이 온다. 그때 화면이 무엇이라고 말하는가를 재 봤다.

   담당자 화면(견적서 업데이트 → PDF에서 추출)은 이 둘만 말하고 있었다:
     · 「검산된 단가 줄 N개」        ← **몇 개** 읽었나
     · 「문서 자체 검산 2/2 통과」   ← 읽은 것끼리 앞뒤가 맞나
   둘 다 **얼마나** 읽었는지는 말하지 않는다. 실측(코퍼스 45건, 2026-09-03):

       키움_에셋 플래너(나트랑).pdf
         검산줄 2개 · 읽은 합 220,000 · 문서 총계 69,772,500  →  **0.3%**

   즉 거의 못 읽은 문서가 화면에서는 「값이 나왔다」로 보인다. 그 값이 그대로
   저장되면 그 목적지는 **실측이 있는 줄 알게 된다**(결함 생성기 ② 조용한 폴백).

   🔴 잠그는 것 다섯:
     ① 얼마나 읽었는지를 **화면이 말한다**
     ② 적게 읽었으면 **눈에 띄게** 말한다(그냥 한 줄 더가 아니라 경고로)
     ③ 🔴 **넘치는 것도 잡는다** — 총계를 풀어 쓴 줄을 항목으로도 세는 양식이 있어
        커버리지가 200%가 된다(좋은친구 4건). 넘치는 것도 제대로 못 읽은 것이다
     ④ **총계를 못 읽었으면 0%라고 하지 않는다** — 「못 읽었다」와 「잴 수 없다」는
        사람이 할 일이 다르다
     ⑤ 🔴 **규칙이 한 곳에 있다** — `plausibility.js`. 화면과 `audit_coverage.js`가
        같은 함수·같은 문턱을 쓴다. 두 벌이면 반드시 어긋난다(결함 생성기 ①)

   실행: node ai-loop/test_yS_coverage_signal.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');
const P = require(path.join(ROOT, 'plausibility.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — YS 얼마나 읽었는지 말한다`);
  process.exit(fail ? 1 : 0);
};

/* ⚠ **화면이 그리는 모양 그대로** 만들어야 한다. 처음엔 `{total, unconvertible}`만
   줬더니 후보 목록을 그리는 `prCandLabel`이 `unit.toLocaleString()`에서 죽었다 —
   판정만 맞고 화면은 못 그리는 픽스처였다(그러면 [3]이 아무것도 안 잰다). */
let _idx = 0;
const cand = (total, extra = {}) => Object.assign({
  idx: _idx++, unit: total, qty: 1, times: 1, total,
  label: '점검용 줄', note: '', category: 'hotel', line: '점검용 …',
  converted: null, unconvertible: false, currency: null,
}, extra);

console.log('\n[1] 🔴 ①③④ 판정 규칙 — plausibility.coverage');
{
  /* 실제로 걸린 문서 그대로 */
  const 나트랑 = P.coverage([cand(200000), cand(20000)], 69772500);
  ok('① 비율을 낸다', 나트랑.known === true && Math.round(나트랑.ratio * 1000) === 3,
    JSON.stringify(나트랑));
  ok('🔴 ① 0.3%를 「덜 읽었다」로 판정한다', 나트랑.verdict === 'low', 나트랑.verdict);

  const 정상 = P.coverage([cand(80000000)], 85878235);
  ok('① 93%는 정상이다', 정상.verdict === 'ok', 정상.verdict);

  /* ③ 넘치는 쪽 — 총계를 풀어 쓴 줄을 항목으로도 센 양식 */
  const 두번셈 = P.coverage([cand(30200000), cand(30200000)], 30200000);
  ok('🔴 ③ 200%도 잡는다(같은 돈을 두 번 셌다)', 두번셈.verdict === 'high', 두번셈.verdict);

  /* ④ 총계를 못 읽음 — 0%가 아니라 「잴 수 없음」 */
  const 총계없음 = P.coverage([cand(1000)], 0);
  ok('🔴 ④ 총계가 없으면 비율을 만들지 않는다',
    총계없음.known === false && 총계없음.ratio === null, JSON.stringify(총계없음));
  ok('④ 그 경우를 0%라고 말하지 않는다',
    !/0%/.test(P.describeCoverage(총계없음)), P.describeCoverage(총계없음));

  /* 환산 못 한 외화 줄은 합에서 빼고, 뺐다는 사실을 남긴다 */
  const 외화 = P.coverage([cand(1000000), cand(2000, { unconvertible: true })], 2000000);
  ok('① 환산 못 한 줄은 합에서 뺀다', 외화.sum === 1000000, String(외화.sum));
  ok('① 몇 줄을 뺐는지 남긴다', 외화.stuck === 1, String(외화.stuck));

  /* 문구가 사람 말인가 — 화면이 그대로 쓴다 */
  ok('① 문구에 비율이 들어간다', /0%/.test(P.describeCoverage(나트랑)), P.describeCoverage(나트랑));
  ok('① 무엇을 하라는지 말한다',
    /대조|믿지/.test(P.describeCoverage(나트랑)), P.describeCoverage(나트랑));
}

console.log('\n[2] 🔴 ⑤ 규칙이 한 곳에 있다 — 감사기가 자기 값을 안 들고 있다');
{
  const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'audit_coverage.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  ok('⑤ 감사기가 plausibility에서 문턱을 가져온다',
    /LOW_COVERAGE\s*=\s*PLAUS\.LOW_COVERAGE/.test(src));
  ok('🔴 ⑤ 감사기가 자기 숫자를 들고 있지 않다',
    !/LOW_COVERAGE\s*=\s*0?\.\d/.test(src),
    (src.match(/LOW_COVERAGE\s*=\s*[^;]{0,30}/) || [''])[0]);
  ok('⑤ 계산도 공용 함수를 쓴다', /PLAUS\.coverage\(cands,\s*grand\)/.test(src));
  ok('⑤ (대조군) 문턱이 실제 값이다', P.LOW_COVERAGE === 0.5, String(P.LOW_COVERAGE));
}

(async () => {
  console.log('\n[3] 🔴 ②  화면이 실제로 말하는가 — jsdom으로 렌더한다');

  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__renderEvidence = (data) => renderPdfEvidence(data);
  currentUser = { id: '7', username: 'staff1', displayName: '김직원', role: 'staff' };
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  const w = dom.window, d = w.document;

  const 기본 = {
    kind: { kind: 'detail', label: '세부 내역서' },
    values: {}, evidence: {}, picked: {},
    warnings: [], pax: 26,
    reconciliation: { passed: 2, total: 2, checks: [] },
  };
  const 그리기 = (extra) => { w.__renderEvidence(Object.assign({}, 기본, extra));
    const el = d.getElementById('pr-pdf-summary');
    return el ? el.textContent.replace(/\s+/g, ' ') : ''; };

  /* ── 거의 못 읽은 문서 (키움 나트랑 그대로) ── */
  {
    const t = 그리기({ candidates: [cand(200000), cand(20000)], rowCount: 2, grandTotal: 69772500 });
    ok('🔴 ② 적게 읽었다고 화면이 말한다', /0%만 읽었습니다/.test(t), t.slice(0, 150));
    ok('② 처음 보는 양식일 수 있다고 알려준다', /처음 보는 양식/.test(t));
    /* 🔴 눈에 띄어야 한다 — 다른 줄과 같은 회색으로 섞이면 못 본다 */
    const 빨간줄 = Array.from(d.querySelectorAll('#pr-pdf-summary div'))
      .filter((n) => /danger/.test(n.getAttribute('style') || ''));
    ok('🔴 ② 경고로 눈에 띄게 그린다', 빨간줄.length >= 1, String(빨간줄.length));
    /* 대조군 — 예전 두 줄도 그대로 있어야 한다(더한 것이지 뺀 것이 아니다) */
    ok('② (대조군) 검산 줄은 그대로 있다', /문서 자체 검산/.test(t));
  }

  /* ── 제대로 읽은 문서 ── */
  {
    const t = 그리기({ candidates: [cand(80000000)], rowCount: 1, grandTotal: 85878235 });
    ok('② 제대로 읽었으면 경고하지 않는다', !/처음 보는 양식/.test(t), t.slice(0, 120));
    ok('② 그래도 몇 %인지는 말한다', /9\d%를 읽었습니다/.test(t), t.slice(0, 120));
    const 빨간줄 = Array.from(d.querySelectorAll('#pr-pdf-summary div'))
      .filter((n) => /danger/.test(n.getAttribute('style') || ''));
    ok('🔴 ② 정상일 때 빨간 줄이 없다', 빨간줄.length === 0, String(빨간줄.length));
  }

  /* ── 총계를 못 읽은 문서 ── */
  {
    const t = 그리기({ candidates: [cand(1000)], rowCount: 1, grandTotal: 0 });
    ok('④ 「잴 수 없다」고 말한다', /잴 수 없습니다/.test(t), t.slice(0, 120));
    ok('🔴 ④ 0%라고 말하지 않는다', !/0%/.test(t), t.slice(0, 120));
  }

  /* ── 환산 못 한 외화 줄이 있는 문서 ── */
  {
    const t = 그리기({
      candidates: [cand(1000000), cand(2000, { unconvertible: true })],
      rowCount: 2, grandTotal: 2000000,
    });
    ok('① 못 더한 외화 줄이 있다고 알려준다', /못 더한 외화 줄/.test(t), t.slice(0, 200));
  }

  w.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });

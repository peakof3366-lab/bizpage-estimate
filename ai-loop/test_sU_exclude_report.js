/* SU 검증 — 실측 제보의 **한 항목만** 평균에서 뺀다 + 작성일은 참고용으로 남긴다

   왜 (2026-08-11 대표 지시 둘) —
   ① 「홍콩·심천」처럼 **두 도시를 도는 일정**이 있다. 목적지는 홍콩인데 호텔이 선전(심천)
      이라 그 호텔값이 홍콩 평균을 끌어내린다. 대표: 「지역이 달라지니 심천 호텔비는
      홍콩 평균에 넣지 말 것.」
      ⚠ **행을 지우면 안 된다** — 같은 견적서의 항공·차량·가이드는 홍콩 것이다.
        그래서 삭제가 아니라 **항목 단위**로 뺀다.
      ⚠ 어느 항목이 어느 도시 것인지는 **사람만 안다.** 호텔명에 '선전'이 있다고 코드가
        판단하게 만들면 그렇게 안 적은 문서에서 조용히 틀린다 → 담당자가 표시한다.
   ② 견적서의 출발일·작성일은 **기존 DB를 옮겨 오는 베이스**라 그대로 저장한다(대표 지시).
      다만 작성일이 출발일보다 뒤인 건이 있는데(코퍼스 10건 중 6건, 날짜가 2026-08-04·06
      두 날에 몰려 있다 = 문서를 PDF로 뽑은 날), 그건 **참고용이라고 밝힌다.**
      값을 지우지 않는다 — 리드타임은 원래부터 이런 건에서 계산되지 않는다(음수라 버려짐).

   ⚠ **뺀 개수는 항상 화면에 적는다.** 조용히 빼면 "왜 3건인데 2건이라 하지"가 되고
     그러면 아무도 그 표를 못 믿는다(SN에서 「검산 안 된 N건 제외」를 찍기로 한 것과 같다).

   실행: node ai-loop/test_sU_exclude_report.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 실제 운영 DB에 들어 있는 모양 그대로 — 홍콩 2건 중 하나가 심천 호텔이다 */
const REPORTS = [
  {
    id: 11, destinationKey: '홍콩', airfareUnit: 430000, hotelUnit: 275500, mealUnit: 45675,
    fuelUnit: 140400, vehicleUnit: 928000, guideUnit: 319000, sightUnit: 15950,
    sellPriceUnit: 3020000, hotelName: '하버그랜드구룡 (주중)',
    departDate: '2026-01-19', quoteDate: null, nights: 5,
    fxCurrency: null, fxRate: null, fxFields: [], excludedFields: {},
    author: 'admin', source: 'pdf', createdAt: new Date().toISOString(),
  },
  {
    id: 12, destinationKey: '홍콩', airfareUnit: 599500, hotelUnit: 142080, mealUnit: 47360,
    fuelUnit: 106200, vehicleUnit: 1110000, guideUnit: 370000, sightUnit: 4440,
    sellPriceUnit: 1953000, hotelName: '홀리데이인 선전 난산',
    departDate: '2026-01-12', quoteDate: '2025-12-09', nights: 4,
    fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: { hotel: '심천 호텔 — 홍콩과 다른 도시' },
    author: 'admin', source: 'pdf', createdAt: new Date().toISOString(),
  },
  {
    /* 작성일이 출발일보다 뒤 — 문서를 PDF로 뽑은 날이다(참고용) */
    id: 13, destinationKey: '도쿄', airfareUnit: 335000, hotelUnit: 225000, mealUnit: 38978,
    fuelUnit: 100200, vehicleUnit: 1450000, guideUnit: 360000, sightUnit: null,
    sellPriceUnit: 1709192, hotelName: '메트로폴리탄 이케부쿠로(토)',
    departDate: '2025-02-14', quoteDate: '2026-08-06', nights: null,
    fxCurrency: null, fxRate: null, fxFields: [], excludedFields: {},
    author: 'admin', source: 'pdf', createdAt: new Date().toISOString(),
  },
];

(async () => {
  /* ── [1] 저장 자리와 서버 규칙 ──────────────────────────────────────── */
  console.log('[1] 저장 자리와 서버 규칙');
  const mig = read('ai-loop/db_migrate.js');
  ok('마이그레이션이 additive다 (add column if not exists)',
    /alter table actual_price_reports add column if not exists excluded_fields jsonb/.test(mig));
  ok('왜 삭제가 아니라 항목 단위인지 적혀 있다', /행을 지우지 않는다/.test(mig));

  const api = read('api/quotes.js');
  ok('조회가 excludedFields를 내려준다', /excludedFields:/.test(api));
  ok('뺄 수 있는 항목이 한 곳에 정의돼 있다',
    /const EXCLUDABLE = \['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight'\]/.test(api));
  ok('모르는 항목은 거절한다', /EXCLUDABLE\.indexOf\(field\) < 0/.test(api));
  ok('사유가 비면 **해제**로 본다', /if \(reason\) map\[field\] = reason; else delete map\[field\]/.test(api));
  ok('새 API는 새 파일이 아니라 ?action= 분기다 (Hobby 12개 제한)',
    /action === 'excludeReportField'/.test(api) && !fs.existsSync(path.join(ROOT, 'api', 'exclude.js')));

  /* ── [2] 화면 — 집계 관문 한 곳에서 뺀다 ────────────────────────────── */
  console.log('\n[2] 집계에서 빠지는가 (관문은 reportValueToday 하나다)');
  let posted = null;
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setReports=v=>{priceReportsCache=v};'
      + 'window.__setUser=u=>{currentUser=u};}catch(e){}\n';
    let injected = false;
    return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  })();
  const dom = new JSDOM(adminHtml, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u, opt) => {
        const s = String(u);
        if (s.includes('action=excludeReportField')) {
          posted = JSON.parse(opt.body);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        if (s.includes('action=priceReports')) return Promise.resolve({ ok: true, json: () => Promise.resolve(REPORTS) });
        return new Promise(() => {});
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true;
      w.alert = () => {};
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '사장님' });
  win.__setReports(REPORTS);

  const hk = REPORTS[1];
  ok('뺀 항목은 집계에서 null이 된다', win.reportValueToday(hk, 'hotel_per_room') === null);
  ok('**같은 행의 다른 항목은 그대로 쓴다**',
    win.reportValueToday(hk, 'airfare') === 599500 && win.reportValueToday(hk, 'meal_per_person') === 47360,
    String(win.reportValueToday(hk, 'airfare')));
  ok('안 뺀 행은 영향이 없다', win.reportValueToday(REPORTS[0], 'hotel_per_room') === 275500);
  /* 값이 아니라 **어느 항목이 빠졌는지**도 알아야 화면이 이유를 적을 수 있다.
     (두 함수는 const라 window에 안 붙는다 — 실제 동작은 아래 [4]의 렌더로 잰다.) */
  ok('빠진 항목을 판별하는 자리가 있다', /const reportFieldExcluded =/.test(read('admin.html')));
  ok('사유를 꺼내는 자리가 있다', /const reportExcludeReason =/.test(read('admin.html')));

  /* ⚠ 관문이 하나여야 네 곳이 한 번에 빠진다 — 화면마다 따로 거르면 반드시 하나를 빠뜨린다 */
  const src = read('admin.html');
  const gateCount = (src.match(/reportFieldExcluded\(report, rateField\)/g) || []).length;
  ok('빼는 판단이 reportValueToday 안에 있다', gateCount === 1, String(gateCount));
  ok('제보를 기준가와 견주는 자리가 전부 그 함수를 지난다',
    (src.match(/reportValueToday\(/g) || []).length >= 4,
    String((src.match(/reportValueToday\(/g) || []).length));

  /* ── [3] 뺀 개수를 조용히 넘기지 않는가 ─────────────────────────────── */
  console.log('\n[3] 뺀 개수를 화면에 적는가');
  ok('제안이 뺀 건수를 들고 다닌다', /excludedCount: excludedByKey\[/.test(src));
  ok('제안 문구에 「평균에서 뺀 N건 제외」가 있다', /평균에서 뺀 \$\{s\.excludedCount\}건 제외/.test(src));

  /* ── [4] 목록 화면 ──────────────────────────────────────────────────── */
  console.log('\n[4] 제보 내역 화면');
  win.renderPriceReportsList();
  const tbody = doc.getElementById('pr-list-tbody');
  const html = tbody.innerHTML;
  ok('뺀 값도 **지우지 않고 그대로 보인다**', /142,080/.test(html));
  ok('뺀 값에 취소선이 붙는다', /line-through/.test(html));
  ok('왜 뺐는지 그 자리에 적는다', /평균 제외 · 심천 호텔/.test(html), html.slice(0, 200));
  ok('안 뺀 값에는 취소선이 없다', /275,500<\/button>/.test(html));
  ok('출발일·견적작성일 열이 있다', /2026-01-12/.test(html) && /작성 2025-12-09/.test(html));
  ok('작성일이 출발일보다 뒤면 「참고용」이라고 밝힌다', /· 참고용/.test(html));
  ok('앞뒤가 맞는 건에는 참고용을 안 붙인다',
    (html.match(/· 참고용/g) || []).length === 1, String((html.match(/· 참고용/g) || []).length));

  /* ── [5] 사유 없이는 뺄 수 없다 ─────────────────────────────────────── */
  console.log('\n[5] 사유 없이는 뺄 수 없는가');
  win.prompt = () => '';           /* 사유를 안 적었다 */
  posted = null;
  await win.togglePriceReportExclude(11, 'hotel');
  ok('사유가 비면 서버로 보내지 않는다', posted === null, JSON.stringify(posted));
  ok('왜 사유가 필요한지 화면이 말한다', /사유를 적어야 뺄 수 있습니다/.test(doc.getElementById('pr-list-msg').textContent));

  win.prompt = () => '심천 호텔 — 홍콩과 다른 도시';
  posted = null;
  await win.togglePriceReportExclude(11, 'hotel');
  ok('사유를 적으면 저장한다', !!posted && posted.id === 11 && posted.field === 'hotel', JSON.stringify(posted));
  ok('사유가 함께 저장된다', posted && /심천/.test(posted.reason), posted && posted.reason);

  /* 이미 뺀 것을 다시 누르면 **해제**(사유를 비워 보낸다) */
  posted = null;
  await win.togglePriceReportExclude(12, 'hotel');
  ok('이미 뺀 항목은 되돌릴 수 있다', !!posted && posted.reason === '', JSON.stringify(posted));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

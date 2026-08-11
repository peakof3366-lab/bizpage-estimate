/* SX 검증 — 「확인 필요」 목록: **확정 안 하고 넘어간 칸**을 한 곳에 모은다

   왜 — SW로 「그 자리에서 확정」하는 길은 생겼지만, 실무자가 9칸 중 3칸만 확정하고
   제출하면 **나머지 6칸이 어디 있는지 아무도 못 본다.** 견적서를 하나씩 열어 봐야
   알 수 있었고, 그게 대표가 하던 일이다.

   ⚠ 이걸 만들려면 **「이 값이 어떻게 나왔는가」가 저장돼 있어야 한다.** 지금까지 그
     정보는 추출 화면에만 있다가 제출과 함께 버려졌다. 특히 `unchecked`(1인 단가인지
     전 일정 총액인지 모르는 값)를 잃는 것이 크다 — 실측으로 BSI 도쿄의 차량
     1,450,000·가이드 360,000이 그 상태로 DB에 들어가 있는데, 값만 봐서는 구분할 수 없다.
     → `field_sources jsonb`를 SX에서 신설했다.

   ⚠ **판정 규칙을 화면에 새로 적지 않는다.** 타당성은 plausibility.js(SO·SK),
     「검산 안 됨」은 fieldSources에서 온다(결함 생성기 ①).
   ⚠ **이미 평균에서 뺀 칸은 목록에 안 뜬다** — 어차피 기준에 안 들어가므로 물을 이유가 없다.

   실행: node ai-loop/test_sX_need_check.js  (프로젝트 루트에서) */
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

const now = new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

/* 운영 DB에 실제로 들어 있는 모양을 옮겼다 */
const REPORTS = [
  {
    /* BSI 도쿄 — 차량·가이드가 「검산 안 됨」인 채로 들어가 있다 */
    id: 13, destinationKey: '도쿄', airfareUnit: 335000, fuelUnit: 100200, hotelUnit: 225000,
    mealUnit: 38978, vehicleUnit: 1450000, guideUnit: 360000, sightUnit: null,
    sellPriceUnit: 1709192, hotelName: '메트로폴리탄', departDate: '2025-02-14', quoteDate: '2026-08-06',
    nights: null, fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: {}, manualFields: {},
    fieldSources: { airfare: 'rule', fuel: 'rule', hotel: 'rule', meal: 'calc', vehicle: 'unchecked', guide: 'unchecked' },
    author: 'admin', source: 'pdf', createdAt: daysAgo(5),
  },
  {
    /* 홍콩 — 호텔은 이미 평균에서 뺐고(심천), 식비는 담당자가 확정했다 */
    id: 12, destinationKey: '홍콩', airfareUnit: 599500, fuelUnit: 106200, hotelUnit: 142080,
    mealUnit: 47360, vehicleUnit: 1110000, guideUnit: 370000, sightUnit: 4440,
    sellPriceUnit: 1953000, hotelName: '홀리데이인 선전', departDate: '2026-01-12', quoteDate: '2025-12-09',
    nights: 4, fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: { hotel: '심천 호텔 — 홍콩과 다른 도시' },
    manualFields: { meal: { by: '김실무', at: now, how: '총액 ÷ 인원 ÷ 4일' } },
    fieldSources: { airfare: 'rule', fuel: 'rule', hotel: 'rule', meal: 'confirmed', vehicle: 'rule', guide: 'rule', sight: 'calc' },
    author: '김실무', source: 'pdf', createdAt: daysAgo(1),
  },
];

(async () => {
  /* ── [1] 저장 자리 ──────────────────────────────────────────────────── */
  console.log('[1] 「어떻게 나온 값인가」를 저장하는가');
  const mig = read('ai-loop/db_migrate.js');
  ok('마이그레이션이 additive다',
    /alter table actual_price_reports add column if not exists field_sources jsonb/.test(mig));
  ok('왜 필요한지(제출과 함께 버려졌다) 적혀 있다', /제출과 함께 버려진다/.test(mig));

  const api = read('api/quotes.js');
  ok('제출이 fieldSources를 받는다', /fieldSources/.test(api));
  ok('모르는 출처는 거절한다', /invalid_field_sources/.test(api) && /VIA_KEYS\.indexOf/.test(api));
  ok('조회가 fieldSources를 내려준다', /fieldSources: \(r\.field_sources/.test(api));
  ok('나중에 확정하는 API가 있다', /action === 'confirmReportField'/.test(api));
  ok('그 API도 작성자를 세션에서 가져온다',
    /handleConfirmReportField[\s\S]{0,1800}by: safeAuthor/.test(api));
  ok('값 상한을 항목별로 검사한다', /REPORT_VALUE_MAX\[field\]/.test(api));
  /* ⚠ 컬럼 이름을 문자열로 조립하면 주입 경로가 된다 — 항목마다 명시적으로 쓴다 */
  ok('컬럼 이름을 문자열로 조립하지 않는다',
    /set airfare_unit = \$\{v\}/.test(api) && !/set \$\{.*\} = /.test(api));

  /* ── [2] 무엇이 목록에 오르는가 (jsdom) ────────────────────────────── */
  console.log('\n[2] 무엇이 목록에 오르는가');
  let posted = null;
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};window.__setReports=v=>{priceReportsCache=v};'
      + 'window.__ncRows=()=>ncRows();}catch(e){}\n';
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
        if (s.includes('action=confirmReportField')) {
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
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => '사유';
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '사장님' });
  win.__setReports(REPORTS);

  const rows = win.__ncRows();
  const has = (id, key) => rows.some((x) => x.report.id === id && x.f.key === key);
  ok('「검산 안 됨」이 목록에 오른다 (도쿄 차량)', has(13, 'vehicle'));
  ok('「검산 안 됨」이 목록에 오른다 (도쿄 가이드)', has(13, 'guide'));
  ok('**담당자가 확정한 칸은 안 오른다** (홍콩 식비)', !has(12, 'meal'));
  ok('**평균에서 뺀 칸은 안 오른다** (홍콩 호텔 — 어차피 기준에 안 들어간다)', !has(12, 'hotel'));
  ok('값이 없는 칸은 안 오른다 (도쿄 관광)', !has(13, 'sight'));
  ok('기준 밖인 값이 오른다 (홍콩 관광 4,440)', has(12, 'sight'));

  const r13v = rows.find((x) => x.report.id === 13 && x.f.key === 'vehicle');
  ok('왜 확인해야 하는지 이유를 붙인다', /검산 안 됨/.test(r13v.reason.why), r13v.reason.why);
  ok('위험한 것을 위로 올린다', rows[0].reason.level === 'high', rows[0].reason.level);

  /* ── [3] 화면 ───────────────────────────────────────────────────────── */
  console.log('\n[3] 목록 화면');
  win.openNeedCheckModal();
  ok('모달이 열린다', !doc.getElementById('needCheckModal').classList.contains('hidden'));
  const tb = doc.getElementById('nc-tbody');
  ok('목적지와 며칠 전인지 보여준다', /도쿄/.test(tb.innerHTML) && /5일 전/.test(tb.innerHTML));
  ok('값을 그 자리에서 고칠 수 있다', !!doc.getElementById('nc-v-13-vehicle'));
  ok('확인 버튼이 있다', /confirmNeedCheck\(13,'vehicle'\)/.test(tb.innerHTML));
  ok('평균에서 빼기도 그 자리에서 된다 (SU 재사용)', /togglePriceReportExclude\(13,'vehicle'\)/.test(tb.innerHTML));
  ok('버튼에 건수가 뜬다 — 열기 전에 할 일의 양이 보인다',
    /^\(\d+\)$/.test(doc.getElementById('pr-need-count').textContent),
    doc.getElementById('pr-need-count').textContent);
  ok('확인해도 요율은 오염되지 않는다고 밝힌다',
    /요율은 오염되지 않습니다/.test(doc.getElementById('needCheckModal').textContent));

  /* ── [4] 확인 / 고치기 ─────────────────────────────────────────────── */
  console.log('\n[4] 확인과 고치기');
  posted = null;
  await win.confirmNeedCheck(13, 'vehicle');            /* 값을 안 고치고 확인만 */
  ok('값을 안 고치면 값 없이 보낸다', posted && posted.value === undefined, JSON.stringify(posted));
  ok('「맞다고 확인했다」가 근거로 남는다', posted && /맞다고 확인했습니다/.test(posted.how), posted && posted.how);

  posted = null;
  doc.getElementById('nc-v-13-guide').value = '90000';   /* 값을 고친다 */
  await win.confirmNeedCheck(13, 'guide');
  ok('고치면 값이 함께 간다', posted && posted.value === 90000, JSON.stringify(posted));
  ok('무엇을 무엇으로 고쳤는지 남는다',
    posted && /360,000 → 90,000/.test(posted.how), posted && posted.how);

  posted = null;
  doc.getElementById('nc-v-12-sight').value = '0';
  await win.confirmNeedCheck(12, 'sight');
  ok('0은 거절한다 (서버로 보내지 않는다)', posted === null);
  ok('왜 거절했는지 화면이 말한다', /0보다 큰/.test(doc.getElementById('nc-msg').textContent));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

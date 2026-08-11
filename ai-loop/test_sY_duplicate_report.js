/* SY 검증 — 같은 견적서를 **두 번** 넣는 것

   왜 — 실무자 여러 명이 폴더에서 일괄로 올리기 시작하면 반드시 생긴다. 두 번 세면
   그 값이 **실측 중앙값을 그쪽으로 끌어당기고** 요율에 그대로 얹힌다. 빈칸과 달리
   **틀린 값**이라 대표 방침(「빈칸보다 틀린 값」)상 우선순위가 높다.

   ⚠ **가장 위험한 것은 오탐이다.** 한 문서에 **차수별 견적**이 여럿인 일이 흔하다 —
     한화 상하이 건은 11/08·11/15·11/22 출발 3건이고 항공료도 360/345/330천원으로 다르다.
     그걸 중복으로 막으면 **진짜 데이터를 잃는다.** 그래서 **출발일이 같아야** 의심한다.
   ⚠ **막지 않고 물어본다.** 같은 날 같은 금액의 다른 행사가 실제로 있을 수 있고,
     그 판단은 사람만 할 수 있다(이 저장소의 규칙 그대로).

   실행: node ai-loop/test_sY_duplicate_report.js  (프로젝트 루트에서) */
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

const base = (over) => Object.assign({
  id: 1, destinationKey: '상해', airfareUnit: 360000, fuelUnit: 100000, hotelUnit: 200000,
  mealUnit: 50000, vehicleUnit: 800000, guideUnit: 300000, sightUnit: 100000,
  sellPriceUnit: 2000000, hotelName: '푸동 샹그릴라', departDate: '2025-11-08',
  quoteDate: null, nights: 3, fxCurrency: null, fxRate: null, fxFields: [],
  excludedFields: {}, manualFields: {}, fieldSources: {},
  author: '김실무', source: 'pdf', createdAt: new Date().toISOString(),
}, over);

/* 한화 상하이 실측 모양 — **차수별 견적 3건**이다. 중복이 아니다. */
const SHANGHAI_3 = [
  base({ id: 1, departDate: '2025-11-08', airfareUnit: 360000, sellPriceUnit: 2000000 }),
  base({ id: 2, departDate: '2025-11-15', airfareUnit: 345000, sellPriceUnit: 1985000 }),
  base({ id: 3, departDate: '2025-11-22', airfareUnit: 330000, sellPriceUnit: 1970000 }),
];

(async () => {
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};window.__setReports=v=>{priceReportsCache=v};}catch(e){}\n';
    let injected = false;
    return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  })();
  const dom = new JSDOM(adminHtml, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true; w.alert = () => {};
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '사장님' });

  /* ── [1] 차수별 견적을 중복으로 보지 않는가 (오탐 방어) ─────────────── */
  console.log('[1] 차수별 견적을 막지 않는가 — 오탐이 진짜 위험이다');
  win.__setReports(SHANGHAI_3);
  const nextRound = win.findDuplicateReports('상해', {
    departDate: '2025-11-29', sell: 1955000, nights: 3, hotelName: '푸동 샹그릴라',
    values: { hotel: 200000, meal: 50000, vehicle: 800000, guide: 300000, sight: 100000, fuel: 100000 },
  });
  ok('**출발일이 다르면 중복으로 보지 않는다** (4차수 견적)', nextRound.length === 0,
    JSON.stringify(nextRound.map((x) => x.score)));
  ok('  ↑ 값이 6칸이나 같은데도 안 걸린다는 것을 확인 (출발일이 다르기 때문)',
    nextRound.length === 0);
  ok('이미 들어간 3차수도 서로 중복으로 안 잡힌다',
    win.duplicateIdSet().size === 0, JSON.stringify([...win.duplicateIdSet()]));

  /* ── [2] 진짜 중복은 잡는가 ─────────────────────────────────────────── */
  console.log('\n[2] 진짜 중복은 잡는가');
  const again = win.findDuplicateReports('상해', {
    departDate: '2025-11-08', sell: 2000000, nights: 3, hotelName: '푸동 샹그릴라',
    values: { airfare: 360000, hotel: 200000, meal: 50000 },
  });
  ok('같은 출발일 + 같은 판매가면 잡는다', again.length >= 1, String(again.length));
  ok('무엇이 같은지 말해 준다',
    again.length && /출발일/.test(again[0].why.join(' ')) && /판매가/.test(again[0].why.join(' ')),
    again.length && again[0].why.join(' · '));
  ok('어느 제보와 겹치는지 알려 준다', again.length && again[0].report.id === 1, again.length && again[0].report.id);

  /* 출발일만 같고 나머지가 다르면? — 같은 날 다른 행사일 수 있으니 안 막는다 */
  const sameDayOnly = win.findDuplicateReports('상해', {
    departDate: '2025-11-08', sell: 3300000, nights: 5, hotelName: '다른 호텔',
    values: { airfare: 700000 },
  });
  ok('출발일만 같으면 막지 않는다 (같은 날 다른 행사가 있다)', sameDayOnly.length === 0,
    JSON.stringify(sameDayOnly.map((x) => x.score)));

  /* 날짜가 아예 없는 제보끼리 — 값이 많이 겹치면 잡는다 */
  const noDate = win.findDuplicateReports('상해', {
    departDate: null, sell: null, nights: 3, hotelName: '푸동 샹그릴라',
    values: { airfare: 360000, hotel: 200000, meal: 50000, vehicle: 800000, guide: 300000, sight: 100000 },
  });
  ok('출발일이 없어도 값이 6칸 넘게 겹치면 잡는다', noDate.length >= 1, String(noDate.length));

  /* 다른 목적지는 아예 안 본다 */
  ok('다른 목적지는 비교하지 않는다',
    win.findDuplicateReports('도쿄', { departDate: '2025-11-08', sell: 2000000, values: {} }).length === 0);

  /* ── [3] 이미 들어간 중복을 목록이 알려 주는가 ──────────────────────── */
  console.log('\n[3] 이미 들어간 중복을 목록이 알려 주는가');
  const dupPair = [base({ id: 10 }), base({ id: 11, author: '박실무' })];
  win.__setReports(dupPair);
  const set = win.duplicateIdSet();
  ok('서로 중복인 두 건을 **둘 다** 표시한다', set.has(10) && set.has(11), JSON.stringify([...set]));
  ok('자기 자신과는 중복으로 보지 않는다', set.size === 2, String(set.size));

  doc.getElementById('pr-list-filter').innerHTML = '<option value=""></option>';
  win.renderPriceReportsList();
  ok('목록에 「⚠ 중복 의심」이 뜬다', /중복 의심/.test(doc.getElementById('pr-list-tbody').innerHTML));

  /* ── [4] 막지 않고 물어보는가 ───────────────────────────────────────── */
  console.log('\n[4] 막지 않고 물어보는가');
  const src = read('admin.html');
  ok('제출 전에 확인한다', /findDuplicateReports\(destKey, \{/.test(src));
  ok('**confirm으로 묻는다**(강제로 막지 않는다)', /같은 견적서를 이미 넣으셨을 수 있습니다/.test(src));
  ok('취소하면 제출을 멈춘다', /제출을 멈췄습니다/.test(src));
  ok('왜 위험한지 그 자리에서 말한다', /실측 중앙값을 끌어당깁니다/.test(src));
  ok('차수별 견적을 막으면 안 된다는 근거가 남아 있다', /11\/08·11\/15·11\/22/.test(src));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

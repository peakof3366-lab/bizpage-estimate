/* TI 검증 — 정확한 값을 못 찾은 칸은 **실측에 반영하지 않는다**

   2026-08-12 사장님 지시: 「PDF 제출 시 정확한 값을 찾지 못한 경우에는 반영이 안 될 수
   있도록 해 주면 좋겠어」. 대표 방침과 같은 방향이다 —
   **빈칸은 다음 견적서가 채우지만, 틀린 값은 요율에 얹혀 고객이 보는 금액이 된다**
   (2026-08-10). 일괄 투입이 시작되면 사람이 모든 칸을 눈으로 볼 수 없다.

   ⚠ **예전에는 절반만 빠지고 있었다.** 「검산 안 됨」 값이 📊 갱신 제안에서만 빠지고
     (SN·TB), ✅실측 N건 배지 · 기준가 이상 경고 · 견적 정확도 카드 **세 곳에는 그대로
     들어갔다.** 저장하는 자리에서 한 번에 빼야 네 곳이 같은 말을 한다.

   ⚠ **버리는 게 아니라 평균에서 빼는 것이다.** 값은 그대로 저장되고 담당자가 확정하면
     되살아난다. 조용히 버리면 「왜 안 들어갔지」를 아무도 답할 수 없다.

   ⚠ **사람이 뺀 것과 갈라야 한다.** 심천 호텔처럼 「값은 맞지만 다른 도시 것」이라 사람이
     뺀 항목(SU)은 확정해도 평균에 돌아오면 안 된다. 그래서 자동으로 뺀 것에만 표시를
     붙이고, 되살리는 것도 그 표시가 붙은 것만 한다.

   실행: node ai-loop/test_tI_auto_exclude.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PLAUSIBILITY = require('../plausibility.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* api/quotes.js는 DB 접속을 모듈 로드 시점에 만든다 — .env.local이 있어야 부를 수 있다 */
require('./_load_env')();
const quotes = require('../api/quotes.js');
const { autoExcludedFields, AUTO_EXCLUDE_MARK } = quotes._report;

const VALUES = {
  airfare: 320000, fuel: 90000, hotel: 152000, meal: 26973,
  vehicle: 940500, guide: 209000, sight: 40660,
};
const keysOf = (o) => Object.keys(o).sort();

console.log('[1] 잣대 — 무엇을 「반영해도 되는 값」으로 보는가');
ok('견적서에서 그대로 집은 값은 반영한다 (rule)', PLAUSIBILITY.countsAsMeasured('rule'));
ok('계산해서 얻은 값도 반영한다 (calc)', PLAUSIBILITY.countsAsMeasured('calc'));
ok('문서에 적힌 값도 반영한다 (doc)', PLAUSIBILITY.countsAsMeasured('doc'));
ok('**검산 안 된 값은 반영하지 않는다** (unchecked)', !PLAUSIBILITY.countsAsMeasured('unchecked'));
ok('**AI가 고른 값도 반영하지 않는다** (ai)', !PLAUSIBILITY.countsAsMeasured('ai'));
ok('**예비 경로 값도 반영하지 않는다** (fallback)', !PLAUSIBILITY.countsAsMeasured('fallback'));
/* ⚠ 사람 손이 닿은 값은 추출 신뢰도와 무관하다 — 이걸 빼면 직접 입력이 통째로 막힌다 */
ok('담당자가 직접 친 값은 반영한다 (manual)', PLAUSIBILITY.countsAsMeasured('manual'));
ok('담당자가 확정한 값도 반영한다 (confirmed)', PLAUSIBILITY.countsAsMeasured('confirmed'));
/* ⚠ 옛 제보(SX 이전)는 field_sources가 비어 있다 — 빼면 그때 넣은 것이 통째로 사라진다 */
ok('출처를 **모르면** 빼지 않는다 (옛 제보를 지우지 않는다)', PLAUSIBILITY.countsAsMeasured(''));
/* ⚠ isTrusted는 「추출기가 검산했는가」를 재는 자다 — 사람 손을 섞으면 감사 숫자가 거짓이 된다 */
ok('사람 손은 TRUSTED_VIA에 섞이지 않았다',
  PLAUSIBILITY.TRUSTED_VIA.indexOf('manual') < 0 && PLAUSIBILITY.TRUSTED_VIA.indexOf('confirmed') < 0,
  JSON.stringify(PLAUSIBILITY.TRUSTED_VIA));

console.log('\n[2] 저장할 때 어느 칸이 빠지는가');
ok('전부 믿을 수 있으면 아무것도 안 뺀다',
  keysOf(autoExcludedFields(VALUES, { airfare: 'rule', hotel: 'rule', meal: 'calc' })).length === 0);
ok('**검산 안 된 차량·가이드를 뺀다** (BSI 도쿄에서 실제로 있던 모양)',
  String(keysOf(autoExcludedFields(VALUES, { vehicle: 'unchecked', guide: 'unchecked', hotel: 'rule' })))
    === 'guide,vehicle');
ok('  ↑ 같은 제보의 **호텔은 그대로 반영된다** (행 전체를 빼는 게 아니다)',
  !('hotel' in autoExcludedFields(VALUES, { vehicle: 'unchecked', hotel: 'rule' })));
ok('사람이 확정·직접 입력한 칸은 안 뺀다',
  keysOf(autoExcludedFields(VALUES, { vehicle: 'confirmed', guide: 'manual' })).length === 0);
ok('값이 없는 칸은 뺄 것도 없다 (빈칸을 사유로 채우지 않는다)',
  keysOf(autoExcludedFields({ vehicle: null }, { vehicle: 'unchecked' })).length === 0);
/* ⚠ 판매가는 요율 항목이 아니라 검증용이다 — 평균에 안 들어가니 뺄 대상도 아니다 */
ok('판매가(sell)는 대상이 아니다',
  keysOf(autoExcludedFields(VALUES, { sell: 'unchecked' })).length === 0);
ok('출처를 안 보내면 아무것도 안 뺀다', keysOf(autoExcludedFields(VALUES, null)).length === 0);

console.log('\n[3] 사유 — 나중에 사람이 읽고 판단할 수 있는가');
const why = autoExcludedFields(VALUES, { vehicle: 'unchecked' }).vehicle;
ok('자동으로 뺐다는 표시가 붙는다', why.indexOf(AUTO_EXCLUDE_MARK) === 0, why);
ok('무엇이 문제인지 적혀 있다', /검산/.test(why), why);
ok('**어떻게 되살리는지도 적혀 있다**', /확인 필요|확정/.test(why), why);
ok('AI 추정은 사유가 다르다', /AI/.test(autoExcludedFields(VALUES, { guide: 'ai' }).guide));

console.log('\n[4] 서버가 실제로 그렇게 저장·복원하는가 (소스 고정)');
const src = read(path.join('api', 'quotes.js'));
ok('INSERT에 excluded_fields가 들어간다', /excluded_fields, manual_fields, field_sources/.test(src));
ok('빠진 칸 목록을 화면에 돌려준다', /autoExcluded: Object\.keys\(autoExcluded\)/.test(src));
/* ⚠ 잣대를 서버에 다시 적으면 화면과 어긋난다 */
ok('잣대를 서버에 다시 적지 않았다 (plausibility를 부른다)',
  /PLAUSIBILITY\.countsAsMeasured/.test(src));
/* ⚠ 「어느 via를 뺄 것인가」를 서버가 **직접 비교**하면 잣대가 두 벌이 된다.
   (`VIA_KEYS`는 다른 것이다 — 화면이 보낸 값이 아는 낱말인지 보는 **입력 검증** 목록이라
    빼는 판단과 무관하다. 그것까지 금지하면 검증을 못 한다.) */
ok('  ↑ 어느 via를 뺄지 서버가 직접 비교하지 않는다',
  !/===\s*'(unchecked|ai|fallback)'/.test(src) && !/indexOf\('(unchecked|ai|fallback)'\)/.test(src));
/* ⚠ 확정했는데 안 되살리면 「확인했는데 왜 그대로지」가 된다 */
ok('확정하면 자동 제외를 푼다', /revived = true/.test(src));
ok('**사람이 뺀 것은 안 푼다** (표시가 붙은 것만)',
  /PLAUSIBILITY\.isAutoExcluded\(exMap\[field\]\)/.test(src));
/* ⚠ 순서가 뒤집히면 실패 시 「확인 안 된 값이 평균에 들어간」 상태가 된다 */
ok('확정을 먼저 쓰고 제외 해제를 나중에 쓴다 (실패해도 안전한 쪽)',
  src.indexOf('if (revived) {') > src.indexOf('set manual_fields = ${JSON.stringify(map)}::jsonb'));
/* ⚠ 표시를 보는 곳이 **셋**이다 — 서버 저장·서버 확정·화면의 「확인 필요」 목록.
   한 곳이라도 자기 문자열을 따로 적으면 그쪽만 어긋나 자동 제외가 영영 안 풀린다.
   그래서 값은 plausibility.js에만 있고 나머지는 거기서 가져온다(결함 생성기 ①). */
const plausSrc = read('plausibility.js');
ok('표시 값은 plausibility.js에 있다 (화면·서버 공용)',
  /var AUTO_EXCLUDE_MARK = '\[자동\] ';/.test(plausSrc));
ok('  ↑ 서버가 그것을 가져다 쓴다 (다시 적지 않는다)',
  /const AUTO_EXCLUDE_MARK = PLAUSIBILITY\.AUTO_EXCLUDE_MARK;/.test(src));
ok('  ↑ 화면도 다시 적지 않는다', !/'\[자동\] '/.test(read('admin.html')));

console.log('\n[5] 화면이 조용히 넘어가지 않는가');
const adminSrc = read('admin.html');
ok('제출 결과에서 빠진 칸을 읽는다', /data\.autoExcluded/.test(adminSrc));
ok('무엇이 빠졌는지 이름으로 말한다', /실측 평균에서 뺐습니다/.test(adminSrc));
ok('어떻게 되살리는지도 말한다', /확인 필요.*확정하면 그때 반영/.test(adminSrc));
/* ⚠ 항목 이름을 화면에 다시 적으면 칸 라벨과 어긋난다 */
ok('항목 이름을 다시 적지 않는다 (칸 라벨에서 가져온다)',
  /PR_EVIDENCE_FIELDS\.find\(\(x\) => x\.key === k\)/.test(adminSrc));

/* ── [6] **되살리는 길이 실제로 열려 있는가** (jsdom) ────────────────────────
   이 저장소가 반복해서 당한 유형이다(결함 생성기 ③ 「실행된 적 없는 안전망」).
   제출 화면은 「⚠ 확인 필요 목록에서 확정하면 그때 반영됩니다」라고 안내한다.
   그런데 그 목록을 만드는 `ncReason`은 **평균에서 뺀 칸을 목록에서 빼도록** 돼 있었다(SU).
   자동 제외가 같은 컬럼을 쓰므로, 안내한 그 목록에 **정작 안 뜨는** 상태였다 —
   빠지기만 하고 아무도 되살릴 수 없다. 소스만 읽어서는 안 걸린다. 실제로 목록을 만들어 본다.

   ⚠ 사람이 뺀 것(심천 호텔)은 **여전히 안 떠야 한다.** 둘을 함께 재지 않으면
     고치다가 반대쪽을 깨고도 모른다. */
(async () => {
  const { JSDOM } = require('jsdom');
  const { htmlWithDeps } = require('./_jsdom_deps');
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  const REPORTS = [{
    /* BSI 도쿄 — 차량·가이드가 「검산 안 됨」이라 **자동으로** 빠진 모양 */
    id: 13, destinationKey: '도쿄', airfareUnit: 335000, fuelUnit: 100200, hotelUnit: 225000,
    mealUnit: 38978, vehicleUnit: 1450000, guideUnit: 360000, sightUnit: null,
    sellPriceUnit: 1709192, hotelName: '메트로폴리탄', departDate: '2025-02-14',
    quoteDate: '2026-08-06', nights: null, fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: {
      vehicle: AUTO_EXCLUDE_MARK + '검산 안 됨 — …',
      guide: AUTO_EXCLUDE_MARK + '검산 안 됨 — …',
    },
    manualFields: {},
    fieldSources: { airfare: 'rule', hotel: 'rule', meal: 'calc', vehicle: 'unchecked', guide: 'unchecked' },
    author: 'admin', source: 'pdf', createdAt: daysAgo(5),
  }, {
    /* 홍콩 — 호텔은 **사람이** 사유를 적어 뺐다(심천). 이건 계속 안 떠야 한다. */
    id: 12, destinationKey: '홍콩', airfareUnit: 599500, fuelUnit: 106200, hotelUnit: 142080,
    mealUnit: 47360, vehicleUnit: 1110000, guideUnit: 370000, sightUnit: null,
    sellPriceUnit: 1953000, hotelName: '홀리데이인 선전', departDate: '2026-01-12',
    quoteDate: '2025-12-09', nights: 4, fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: { hotel: '심천 호텔 — 홍콩과 다른 도시' },
    manualFields: {},
    fieldSources: { airfare: 'rule', hotel: 'rule', meal: 'calc', vehicle: 'rule', guide: 'rule' },
    author: '김실무', source: 'pdf', createdAt: daysAgo(1),
  }];

  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setReports=v=>{priceReportsCache=v};'
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
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true; w.alert = () => {};
    },
  });
  const win = dom.window;
  await new Promise((r) => setTimeout(r, 250));
  win.__setReports(REPORTS);
  const rows = win.__ncRows();
  const at = (id, key) => rows.find((x) => x.report.id === id && x.f.key === key);

  console.log('\n[6] 되살리는 길이 실제로 열려 있는가 (jsdom 실제 렌더)');
  ok('**자동으로 빠진 칸이 「확인 필요」 목록에 뜬다** (도쿄 차량)', !!at(13, 'vehicle'));
  ok('  ↑ 가이드도 (자동 제외 두 칸이 다 남는다)', !!at(13, 'guide'));
  ok('  ↑ 지금 평균에서 빠져 있다고 화면이 말한다',
    !!at(13, 'vehicle') && /실측 평균에서 빠져 있습니다/.test(at(13, 'vehicle').reason.why),
    at(13, 'vehicle') && at(13, 'vehicle').reason.why);
  ok('  ↑ 확정하면 반영된다는 것도 말한다',
    !!at(13, 'vehicle') && /확정하면 그때 반영/.test(at(13, 'vehicle').reason.why));
  ok('  ↑ 위험한 것으로 다룬다 (목록 위로 올라온다)',
    !!at(13, 'vehicle') && at(13, 'vehicle').reason.level === 'high');
  ok('**사람이 뺀 칸은 여전히 안 뜬다** (홍콩 호텔 — 이미 판단이 끝났다)', !at(12, 'hotel'));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

/* TB 검증 — 갱신 제안이 **7개 항목 전부**를 보고, 검산 안 된 값은 빼고,
   너무 벌어진 것도 버리지 않는다

   왜 — 우리는 9칸을 뽑는데 갱신 제안은 **항공·호텔·식비 셋만** 보고 있었다.
   운영 DB 실측(제보 9건): 화면에 13건이 떠 있는 동안 **19건이 화면 밖에 있었다**
   (싱가포르 가이드 +426% · 다낭 차량 +343% · 다낭 관광 +179% · 홍콩 관광 −94% …).
   사장님이 요율을 정하려면 그게 보여야 한다.

   ⚠ **그냥 넓히면 위험하다.** 싱가포르 가이드 1,840,000은 **전 일정 총액**이다
     (÷6일 = 306,667로 기준가 350,000에 맞는다). 그대로 띄우면 「가이드 요율을
     35만 → 184만으로」라는 제안이 된다. 화면은 그 값에 「검산 안 됨」 배지를 붙여
     확인을 요청하는데 제안이 그걸 무시하면 **화면과 제안이 서로 다른 말을 한다**(SN).
   ⚠ **출처를 모르는 옛 제보는 빼지 않는다** — 빼면 SX 이전에 넣은 것이 통째로 사라진다.
     대신 「출처 미상 N건 포함」이라고 밝힌다.
   ⚠ **전부 이상치(0.5~2배 밖)면 지금까지 통째로 사라졌다.** 그런데 그게 제일 큰 신호일
     수 있다 — 다낭 차량 797,500 vs 기준 180,000(4.4배)은 오타가 아니라 **베트남 차량
     요율이 낮은 것**이다(감사기는 🟡로 잡는데 화면만 못 봤다). 제안 금액은 안 만들되
     **따로 알린다.**

   실행: node ai-loop/test_tB_suggest_fields.js  (프로젝트 루트에서) */
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
/* 운영 DB에 실제로 들어 있는 모양 */
const REPORTS = [
  {
    /* 싱가포르 — 차량·가이드가 「검산 안 됨」(전 일정 총액) */
    id: 15, destinationKey: '싱가포르', airfareUnit: 770000, fuelUnit: 149000, hotelUnit: 253000,
    mealUnit: 55488, vehicleUnit: 1845750, guideUnit: 1840000, sightUnit: 109250,
    sellPriceUnit: 3750000, hotelName: '알로프트노베나', departDate: '2026-03-09',
    quoteDate: null, nights: 4, fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: {}, manualFields: {},
    fieldSources: { airfare: 'rule', fuel: 'rule', hotel: 'rule', meal: 'calc',
      vehicle: 'unchecked', guide: 'unchecked', sight: 'calc' },
    author: 'admin', source: 'pdf', createdAt: now,
  },
  {
    /* 다낭 — 차량이 기준가의 4.4배(진짜 신호, 검산됨) */
    id: 10, destinationKey: '다낭', airfareUnit: 700000, fuelUnit: 135300, hotelUnit: 224750,
    mealUnit: 77649, vehicleUnit: 797500, guideUnit: 217500, sightUnit: 139722,
    sellPriceUnit: 3303009, hotelName: '노보텔', departDate: '2026-02-04',
    quoteDate: null, nights: 4, fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: {}, manualFields: {},
    fieldSources: { airfare: 'rule', fuel: 'rule', hotel: 'rule', meal: 'calc',
      vehicle: 'rule', guide: 'rule', sight: 'calc' },
    author: 'admin', source: 'pdf', createdAt: now,
  },
  {
    /* 옛 제보 — field_sources가 없다(SX 이전). 빼면 안 된다. */
    id: 9, destinationKey: '오키나와', airfareUnit: 410000, fuelUnit: null, hotelUnit: 152000,
    mealUnit: 50000, vehicleUnit: null, guideUnit: null, sightUnit: null,
    sellPriceUnit: null, hotelName: null, departDate: null, quoteDate: null, nights: null,
    fxCurrency: null, fxRate: null, fxFields: [],
    excludedFields: {}, manualFields: {}, fieldSources: {},
    author: 'admin', source: 'manual', createdAt: now,
  },
];

(async () => {
  /* ── [1] 항목이 넓어졌는가 ─────────────────────────────────────────── */
  console.log('[1] 7개 항목 전부를 보는가');
  const src = read('admin.html');
  ['airfare', 'fuel_surcharge', 'hotel_per_room', 'meal_per_person',
    'vehicle_large', 'guide_fee', 'sightseeing_fee'].forEach((f) => {
    ok(`${f} 를 본다`, new RegExp(`RATE_SUGGEST_REPORT_FIELDS = \\{[\\s\\S]{0,320}${f}:`).test(src));
  });
  ok('판매가(sell)는 넣지 않았다 — 요율 항목이 아니다',
    !/RATE_SUGGEST_REPORT_FIELDS = \{[\s\S]{0,320}sellPriceUnit/.test(src));
  /* ⚠ 안내문이 동작과 어긋나 있었다 — 「최소 2건 이상」인데 실제는 1건부터.
     주석에는 그 사실이 남아 있어야 하므로 **주석을 걷어내고** 화면에 보이는 글만 잰다. */
  const visible = src.replace(/<!--[\s\S]*?-->/g, '');
  ok('화면 글에서 「최소 2건 이상」이 없어졌다', !/최소 2건 이상/.test(visible));
  ok('왜 고쳤는지는 주석에 남아 있다', /최소 2건 이상/.test(src));
  ok('안내문이 7개 항목·1건부터라고 말한다',
    /<strong>7개 항목<\/strong>/.test(src) && /<strong>1건부터<\/strong>/.test(src));
  ok('안내문이 검산 안 된 값은 빠진다고 말한다', /「검산 안 됨」인 값은 빠집니다/.test(src));

  /* ── [2] 실제 집계 (jsdom) ─────────────────────────────────────────── */
  console.log('\n[2] 무엇이 뜨고 무엇이 빠지는가');
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};window.__setReports=v=>{priceReportsCache=v};'
      + 'window.__suggest=()=>computeRateSuggestions();}catch(e){}\n';
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
  win.__setReports(REPORTS);

  const sug = win.__suggest();
  const find = (dest, field) => sug.find((x) => x.destKey === dest && x.field === field);

  ok('예전엔 없던 항목이 뜬다 — 싱가포르 유류할증', !!find('싱가포르', 'fuel_surcharge'));
  ok('예전엔 없던 항목이 뜬다 — 다낭 관광비', !!find('다낭', 'sightseeing_fee'));
  ok('예전엔 없던 항목이 뜬다 — 다낭 유류할증', !!find('다낭', 'fuel_surcharge'));
  /* ⚠ 10% 미만은 여전히 안 뜬다 — 다낭 가이드 217,500 vs 기준 202,500은 +7.4%다.
     항목을 넓힌 것이지 문턱을 낮춘 것이 아니다. */
  ok('10% 미만으로 벌어진 것은 여전히 안 뜬다 (다낭 가이드 +7.4%)', !find('다낭', 'guide_fee'));

  /* 🛡 핵심 안전장치 — 검산 안 된 값은 제안 금액을 만들지 않는다 */
  const sgGuide = find('싱가포르', 'guide_fee');
  ok('**검산 안 된 값은 제안이 안 된다** (싱가포르 가이드 1,840,000)',
    !sgGuide || sgGuide.suggestedBase !== 1840000,
    sgGuide && JSON.stringify({ base: sgGuide.currentBase, sug: sgGuide.suggestedBase }));
  const sgVeh = find('싱가포르', 'vehicle_large');
  ok('**검산 안 된 값은 제안이 안 된다** (싱가포르 차량 1,845,750)',
    !sgVeh || sgVeh.suggestedBase !== 1845750);

  /* 옛 제보(출처 미상)는 빼지 않는다 */
  const okiMeal = find('오키나와', 'meal_per_person');
  ok('출처를 모르는 옛 제보는 **빼지 않는다**', !!okiMeal);
  ok('대신 「출처 미상 N건」으로 밝힌다', okiMeal && okiMeal.unknownCount >= 1,
    okiMeal && String(okiMeal.unknownCount));

  /* 너무 벌어진 것 — 버리지 않고 따로 */
  const dnVeh = find('다낭', 'vehicle_large');
  ok('**너무 벌어져도 사라지지 않는다** (다낭 차량 4.4배)', !!dnVeh);
  ok('그 줄은 「제안 못 만듦」으로 표시된다', dnVeh && dnVeh.farOff === true);
  ok('자동 적용 대상이 아니다', dnVeh && dnVeh.confident === false);
  ok('너무 벌어진 것이 맨 위로 온다', sug[0] && sug[0].farOff === true,
    sug[0] && sug[0].destKey + '|' + sug[0].field);

  /* ── [3] 화면 ───────────────────────────────────────────────────────── */
  console.log('\n[3] 화면이 이유를 말하는가');
  win.renderRateSuggestions();
  const html = doc.getElementById('airfare-suggestion-list').innerHTML;
  ok('「제안 못 만듦」 배지가 뜬다', /확인 필요 · 제안 못 만듦/.test(html));
  ok('왜 제안을 안 만들었는지 그 자리에 적는다', /제안 금액을 만들지 않았습니다/.test(html));
  ok('오타일 수도, 요율이 낡은 것일 수도 있다고 말한다', /오타일 수도, 요율이 낡은 것일 수도/.test(html));
  ok('그 줄은 「제안」이 아니라 「제보값」이라고 쓴다', /제보값/.test(html));
  ok('검산 안 돼 뺀 건수를 밝힌다', /검산 안 된/.test(html) || sug.every((x) => !x.uncheckedCount));
  ok('출처 미상 포함을 밝힌다', /출처 미상/.test(html));
  ok('건수가 접힌 머리줄에 뜬다',
    /^\d+건$/.test(doc.getElementById('airfare-suggestion-count').textContent),
    doc.getElementById('airfare-suggestion-count').textContent);

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

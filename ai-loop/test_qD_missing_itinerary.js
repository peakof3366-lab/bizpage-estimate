/* QD 검증: **관리자가 요율 관리에서 추가한 신규 목적지**로 견적을 낼 수 있는가.

   원래 결함 (jsdom으로 재현 확인) —
   내장 55곳은 전부 ITINERARY_DB에 코스가 있지만, 관리자가 요율 관리에서 추가한
   목적지는 `data.js`가 아니라 DB(custom_destinations)에 있어 **일정이 없다.**
   그런데 코드가 그걸 전제하지 않았다:

     getItineraries(destKey) → `const courses = ITINERARY_DB[destKey];`
                               `courses.length` ← undefined.length → **TypeError**
     openEstimateWindow      → `getItineraries(...) || [ITINERARY_DB[destKey][0], …]`
                               폴백 쪽도 같은 undefined를 인덱싱 → **TypeError**

   결과: 금액은 멀쩡히 계산되는데 **"견적서 받기"와 "연수 일정 탐색"이 통째로 터졌다.**
   담당자 눈에는 "버튼이 안 먹는다"로만 보인다(콘솔을 열어야 이유가 보인다).
   PP에서 커스텀 목적지의 요율·보험권역·시즌 프로파일은 챙겼는데 일정만 빠져 있었다.

   고친 뒤 —
   일정이 없으면 **그 섹션만 빼고 견적서를 낸다**(금액·조건은 그대로라 견적서로서는 온전).
   일정 탐색 버튼은 아예 내놓지 않는다 — 보여줄 게 없으면 권하지 않는 편이 정직하다.
   그리고 조용히 넘어가지 않는다: 어느 목적지에서 빠졌는지 기록으로 남긴다.
   담당자가 관리자 → 일정 관리에서 코스를 만들면(QB) 다음 견적서부터 살아난다.

   실행: node ai-loop/test_qD_missing_itinerary.js  (프로젝트 루트에서) */
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

/* 실제 custom_destinations 행이 destinationRates에 들어가는 모양 그대로
   (script.js가 zone·insurance_zone 등을 떼고 나머지를 push한다). */
const CUSTOM_KEY = '테스트신규도시';
const CUSTOM_ROW = {
  destination_key: CUSTOM_KEY, label: '테스트신규도시',
  airfare: 380000, fuel_surcharge: 180000, hotel_per_room: 250000,
  meal_per_person: 25000, vehicle_large: 1100000, vehicle_small: 770000,
  guide_fee: 300000, sightseeing_fee: 40000, margin_per_traveler: 130000,
  rateDate: '2026-07', notes: '', season_note: '',
};

function boot() {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});          /* 오버라이드 미도착 = 기본값 상태 */
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.Element.prototype.scrollIntoView = function () {};
      /* 견적서는 새 창에 write한다 — 창을 흉내내되 쓰인 HTML을 모아둔다 */
      w.__written = '';
      w.open = () => ({
        document: { write(html) { w.__written += html; }, close() {} },
        focus() {}, document_: null,
      });
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  /* const/var 전역을 하나씩 따로 노출한다.
     ⚠ 한 덩어리 try{…}catch로 묶으면, **아직 존재하지 않는 이름 하나 때문에 그 뒤가
     통째로 안 붙는다.** 이 테스트는 "고치기 전 코드에서 실제로 깨지는가"를 되돌려
     확인하는데, 그때 hasItineraryContent가 없어서 destinationRates까지 노출이 끊겨
     엉뚱한 자리에서 크래시했다 — 결함을 잡은 게 아니라 테스트가 자기 발에 걸린 것이다. */
  const EXPOSE = '\n' + ['ITINERARY_DB', 'DEST_REC', 'getItineraries', 'hasItineraryContent',
    'destinationRates', 'injectDestinationOption', 'renderStep3', 'scrollToStep3']
    .map(n => `;try{window.${n}=${n};}catch(e){}`).join('') + '\n';
  try { dom.window.eval(read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE); }
  catch (e) { console.log('  [eval warn]', e.message); }
  return dom.window;
}

const fillForm = (w, destKey) => {
  const doc = w.document;
  doc.getElementById('destination').value = destKey;
  doc.getElementById('destination').dispatchEvent(new w.Event('change', { bubbles: true }));
  doc.getElementById('participants').value = '20';
  doc.getElementById('days').value = '5';
  doc.getElementById('organization').value = '테스트기업';
  doc.getElementById('contactName').value = '김담당';
  doc.getElementById('requestDetails').value = '메모';
};

(async () => {
  const w = boot();
  await new Promise(r => setTimeout(r, 200));

  /* 관리자가 추가한 신규 목적지를 실제와 같은 경로로 주입 */
  w.destinationRates.push(CUSTOM_ROW);
  w.injectDestinationOption(CUSTOM_KEY, CUSTOM_ROW.label);

  console.log('[1] 전제 — 신규 목적지에는 일정 데이터가 없다');
  ok('ITINERARY_DB에 없다', !w.ITINERARY_DB[CUSTOM_KEY]);
  ok('DEST_REC에도 없다', !w.DEST_REC[CUSTOM_KEY]);
  ok('요율표에는 있다', w.destinationRates.some(d => d.destination_key === CUSTOM_KEY));
  ok('내장 목적지(파리)에는 일정이 있다(대조군)', Array.isArray(w.ITINERARY_DB['파리']));

  console.log('\n[2] 조회 함수가 죽지 않는가');
  ok('보유 여부를 묻는 함수가 존재한다', typeof w.hasItineraryContent === 'function');
  ok('없는 목적지에 없다고 답한다', w.hasItineraryContent && w.hasItineraryContent(CUSTOM_KEY) === false);
  ok('파리는 있다고 답한다', w.hasItineraryContent && w.hasItineraryContent('파리') === true);
  let threw = null;
  let got;
  try { got = w.getItineraries(CUSTOM_KEY, 'industry'); } catch (e) { threw = e; }
  ok('**getItineraries가 터지지 않는다** (예전엔 TypeError)', !threw, threw && threw.message);
  ok('대신 null을 돌려준다', got === null, String(got));
  ok('있는 목적지에서는 코스 두 개를 그대로 돌려준다',
    Array.isArray(w.getItineraries('파리', 'industry')) && w.getItineraries('파리', 'industry').length === 2);

  console.log('\n[3] 금액은 정상적으로 계산되는가 (일정과 무관해야 한다)');
  fillForm(w, CUSTOM_KEY);
  const bd = w.getBreakdownData();
  ok('견적이 계산된다', !!bd && bd.total > 0, String(bd && bd.total));
  ok('1인당 금액도 나온다', bd.perPerson > 0);

  console.log('\n[4] 견적서 만들기가 끝까지 도는가 (①)');
  threw = null;
  try { w.openEstimateWindow(); } catch (e) { threw = e; }
  ok('**견적서 만들기가 터지지 않는다** (예전엔 TypeError)', !threw, threw && threw.message);
  const html = w.__written;
  ok('견적서 HTML이 실제로 만들어졌다', html.length > 2000, String(html.length));
  ok('금액이 견적서에 들어 있다', html.includes(bd.total.toLocaleString('ko-KR')));
  ok('목적지 이름이 들어 있다', html.includes(CUSTOM_KEY));
  ok('추천 일정 섹션은 빠진다', !html.includes('RECOMMENDED ITINERARY'));
  ok('그 섹션으로 가는 목차 링크도 빠진다(빈 앵커 방지)', !html.includes('id="anc-rec"'));
  ok('견적 내용 목차는 그대로 있다', html.includes('id="anc-quote"'));
  ok('일정이 빠졌다는 사실을 기록으로 남긴다',
    (w.__ITINERARY_SOURCE__.missingOnQuote || []).includes(CUSTOM_KEY),
    JSON.stringify(w.__ITINERARY_SOURCE__.missingOnQuote));

  console.log('\n[5] 일정 탐색은 어떻게 되는가 (①)');
  threw = null;
  try { w.renderStep3(); } catch (e) { threw = e; }
  ok('**일정 탐색이 터지지 않는다** (예전엔 TypeError)', !threw, threw && threw.message);
  const step3 = w.document.getElementById('step3Section');
  ok('보여줄 게 없으면 일정 탐색 섹션을 닫는다', step3.classList.contains('hidden'));

  /* renderStep3는 내용을 준비하고, 여는 것은 scrollToStep3의 몫이다.
     직전 목적지의 카드가 남아 다른 목적지 일정으로 보이면 안 된다. */
  fillForm(w, '파리');
  w.renderStep3();
  ok('대조군: 파리는 코스가 준비된다', Array.isArray(w._step3Courses) && w._step3Courses.length > 0);
  w.scrollToStep3();
  ok('대조군: 파리는 일정 탐색이 열린다', !step3.classList.contains('hidden'));
  const parisCardText = step3.textContent;
  ok('전제: 파리 카드에는 내용이 있었다', parisCardText.trim().length > 50);

  fillForm(w, CUSTOM_KEY);
  w.renderStep3();
  ok('신규 목적지로 바꾸면 직전 코스가 남지 않는다', !w._step3Courses);
  ok('섹션이 다시 닫힌다', step3.classList.contains('hidden'));
  /* 공유 견적서에서 ?dest=…로 들어오는 경로는 renderStep3 뒤에 scrollToStep3를
     무조건 부른다 — 여기서 다시 열리면 고객이 빈 화면을 본다. */
  w.scrollToStep3();
  ok('**공유 링크 경로로 들어와도 빈 섹션이 열리지 않는다**', step3.classList.contains('hidden'));

  console.log('\n[6] 제출 흐름에서 "일정 탐색" 버튼을 권하지 않는가');
  const exploreBtn = w.document.getElementById('explorePlanBtn');
  fillForm(w, CUSTOM_KEY);
  w.document.getElementById('estimateForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 120));
  ok('신규 목적지에서는 버튼이 나오지 않는다', exploreBtn.classList.contains('hidden'));
  ok('견적 완료 카드는 정상적으로 뜬다',
    !w.document.getElementById('estimateConfirm').classList.contains('hidden'));

  fillForm(w, '파리');
  w.document.getElementById('estimateForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 120));
  ok('대조군: 파리에서는 버튼이 나온다', !exploreBtn.classList.contains('hidden'));

  console.log('\n[7] 담당자가 일정을 만들어 주면 되살아나는가 (QB 편집 화면과의 연결)');
  const w2 = boot();
  await new Promise(r => setTimeout(r, 200));
  w2.destinationRates.push(CUSTOM_ROW);
  w2.injectDestinationOption(CUSTOM_KEY, CUSTOM_ROW.label);
  /* 관리자 → 일정 관리에서 저장했을 때 오버라이드가 들어오는 것과 같은 모양 */
  w2.ITINERARY_DB[CUSTOM_KEY] = [{
    title: '신규 목적지 코스', subtitle: '담당자가 만든 코스', highlights: ['하이라이트'],
    days: [{ day: 1, title: '1일차', am: '오전', pm: '오후', eve: '저녁', tip: '' },
           { day: 2, title: '귀국', am: '', pm: '공항', eve: '', tip: '' }],
  }];
  ok('코스가 생기면 있다고 답한다', w2.hasItineraryContent(CUSTOM_KEY) === true);
  ok('조회 함수가 그 코스를 돌려준다',
    w2.getItineraries(CUSTOM_KEY, 'industry')[0].title === '신규 목적지 코스');
  fillForm(w2, CUSTOM_KEY);
  w2.openEstimateWindow();
  ok('견적서에 추천 일정 섹션이 살아난다', w2.__written.includes('RECOMMENDED ITINERARY'));
  ok('담당자가 쓴 코스 제목이 견적서에 나온다', w2.__written.includes('신규 목적지 코스'));
  ok('목차 링크도 함께 살아난다', w2.__written.includes('id="anc-rec"'));

  console.log('\n[8] 공유 견적서(estimate-view.html)가 일정 없는 payload를 견디는가');
  const evSrc = read('estimate-view.html');
  ok('일정 섹션 전체가 itiA/itiB 유무로 감싸여 있다', /\$\{d\.itiA \|\| d\.itiB \?/.test(evSrc));
  const scriptSrc = read('script.js');
  ok('일정이 없으면 payload에 싣지 않는다', /itiA: hasIti \?/.test(scriptSrc));

  console.log('\n[9] 같은 실수가 다시 들어오지 않게');
  /* ⚠ 주석을 걷어내고 본다 — 고친 자리에 "예전엔 이랬다"고 옛 코드를 적어두었기
     때문에, 원문 그대로 검사하면 주석에 걸려 항상 실패한다(실제로 걸렸다). */
  const codeOnly = scriptSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');
  ok('주석 제거가 실제로 동작했다(검사 자체가 헛돌지 않게)',
    codeOnly.length < scriptSrc.length && codeOnly.includes('function getItineraries'));
  ok('ITINERARY_DB를 무방비로 인덱싱하는 코드가 남아 있지 않다',
    !/\|\|\s*\[ITINERARY_DB\[destKey\]\[0\]/.test(codeOnly));
  ok('getItineraries가 없는 목적지에 대해 먼저 빠져나간다',
    /if \(!hasItineraryContent\(destKey\)\) return null;/.test(codeOnly));
  ok('일정 탐색을 여는 곳도 같은 판단을 쓴다(두 진입 경로 모두 막힘)',
    /function scrollToStep3[\s\S]{0,400}hasItineraryContent/.test(codeOnly));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

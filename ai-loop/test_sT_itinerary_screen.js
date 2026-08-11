/* ST 검증 — 견적서에서 읽은 일정표를 **화면에서 일정 관리로 옮긴다**

   왜 — SS가 일정표를 읽게 됐지만 그 결과는 API 응답 안에만 있었다. 화면에 붙이지
   않으면 「자를 만들어 놓고 아무도 안 쓰는」 상태다(결함 생성기 ③ — 안전망이 실제로
   실행된 적이 없다). 담당자가 실제로 쓰는 경로는 하나뿐이다:
   견적서 업데이트 → PDF 제출 → 📅 일정 관리로 보내기 → 확인 → 저장.

   ⚠ **저장하지 않는다.** 견적서에서 읽은 글이 검토 없이 고객 화면에 뜨면 안 된다.
     이 테스트는 보내기를 눌러도 **PUT이 안 나가는지**를 직접 잰다.
   ⚠ **시간대를 지어내지 않는다.** 문서가 안 나눈 날은 줄을 오전 칸에 모으되,
     화면이 몇 날인지 반드시 말해야 한다 — 조용히 오전에 넣으면 담당자는 문서가 원래
     그런 줄 알고 지나간다(결함 생성기 ②).
   ⚠ **제목·요약·핵심 포인트는 비워 둔다.** 견적서에 없는 것을 만들어 넣으면 그게
     '견적서에서 읽은 것'으로 굳는다.

   실행: node ai-loop/test_sT_itinerary_screen.js  (프로젝트 루트에서) */
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

/* 추출기가 실제로 내는 모양 그대로 (findItinerary의 반환값).
   1일차는 문서가 시각으로 나눠 준 날, 2일차는 **안 나눠 준 날**이다. */
const ITIN = {
  days: [
    {
      day: 1, date: '4/4', place: '프라하', hotel: 'HOTEL : Grandior Hotel Prague',
      meals: { b: null, l: '기내식', d: '현지식' },
      lines: ['08:00 인천국제공항 집결', '13:00 프라하 도착', '19:30 석식'],
      am: '08:00 인천국제공항 집결', pm: '13:00 프라하 도착', eve: '19:30 석식',
      split: 'time', splitWhy: null,
    },
    {
      day: 2, date: '4/5', place: null, hotel: null,
      meals: { b: '호텔식', l: null, d: null },
      lines: ['호텔 조식 후 체크아웃', '몬트레이로 이동'],
      am: null, pm: null, eve: null,
      split: 'none', splitWhy: 'no-marker',
    },
  ],
  repeated: false, columnsVia: 'header', mealMissing: false,
  dayX: 99, contentX: 122, mealX: 466, unsplitDays: 1,
};

const EXTRACT = {
  kind: { label: '단가표가 있는 견적서' }, rowCount: 12, pax: 26,
  values: {}, evidence: {}, candidates: [], warnings: [],
  reconciliation: { total: 2, passed: 2, checks: [] },
  blockCount: 1, selectedBlock: 0, blocks: [],
  dates: {}, itinerary: ITIN,
};

(async () => {
  /* ── [1] 서버가 일정표를 화면까지 내려주는가 ────────────────────────── */
  console.log('[1] 서버가 일정표를 내려주는가');
  const apiSrc = read('api/quotes.js');
  ok('extractPdf 응답에 itinerary가 들어 있다', /itinerary: out\.itinerary \|\| null/.test(apiSrc));
  ok('금액과 무관한 층이라고 적혀 있다', /금액과 무관한 층/.test(apiSrc));

  /* ── [2] 화면 렌더 (jsdom) ──────────────────────────────────────────── */
  console.log('\n[2] 견적서 업데이트 화면에 일정표가 뜨는가');
  let putCount = 0;
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__iti=itiState;window.__view=itiView;'
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
        if (s.includes('action=itineraries')) {
          if (opt && opt.method === 'PUT') { putCount++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ overrides: {}, recOverrides: {}, meta: {} }) });
        }
        return new Promise(() => {});
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true;
      w.alert = () => {};
      /* jsdom에는 scrollTo가 없다 — switchTab이 마지막에 부른다(제품 결함이 아니다) */
      w.Element.prototype.scrollTo = function () {};
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '사장님' });

  ok('일정표를 그리는 함수가 있다', typeof win.renderPdfItinerary === 'function');
  ok('보내기 함수가 있다', typeof win.prSendItinerary === 'function');

  win.renderPdfSummary(EXTRACT);
  const box = doc.getElementById('pr-pdf-summary');
  ok('추출 요약 상자가 그려진다', !!box);
  const txt = box ? box.textContent : '';
  ok('일정표가 몇 일인지 말한다', /일정표가 있습니다\s*—\s*2일/.test(txt), txt.slice(0, 120));
  ok('안 나눈 날이 몇 날인지 말한다 (조용히 넘기지 않는다)',
    /1일은 문서에 시각·끼니 구분이 없어/.test(box.innerHTML));
  ok('금액에 영향이 없다고 밝힌다', /금액에는 영향이 없습니다/.test(box.innerHTML));
  ok('읽은 일정을 눈으로 볼 수 있다', !!box.querySelector('details'));
  ok('나뉜 날은 오전·오후·저녁으로 보인다',
    /오전<\/strong> 08:00/.test(box.innerHTML) && /저녁<\/strong> 19:30/.test(box.innerHTML));
  ok('안 나뉜 날은 「시간대 미분류」라고 보인다', /시간대 미분류/.test(box.innerHTML));
  const btn = Array.from(box.querySelectorAll('button')).find((b) => /일정 관리로 보내기/.test(b.textContent));
  ok('보내기 버튼이 있다', !!btn);

  /* 일정표가 없는 문서에서는 이 구역이 아예 안 나와야 한다 */
  win.renderPdfSummary(Object.assign({}, EXTRACT, { itinerary: null }));
  ok('일정표가 없으면 구역을 만들지 않는다',
    !/일정표가 있습니다/.test(doc.getElementById('pr-pdf-summary').textContent));

  /* ── [3] 코스로 옮기는 규칙 ─────────────────────────────────────────── */
  console.log('\n[3] 코스로 옮길 때 지어내지 않는가');
  const course = win.prItinToCourse(ITIN, '도쿄');
  ok('날 수가 그대로다', course.days.length === 2, String(course.days.length));
  ok('요약을 지어내지 않는다', course.subtitle === '', JSON.stringify(course.subtitle));
  ok('핵심 포인트를 지어내지 않는다', Array.isArray(course.highlights) && course.highlights.length === 0);
  ok('제목이 「검토 필요」임을 밝힌다', /검토 필요/.test(course.title), course.title);
  ok('나뉜 날은 시간대 그대로 들어간다',
    course.days[0].am === '08:00 인천국제공항 집결' && course.days[0].eve === '19:30 석식');
  ok('안 나뉜 날은 줄을 버리지 않고 오전에 모은다',
    course.days[1].am === '호텔 조식 후 체크아웃 / 몬트레이로 이동', course.days[1].am);
  ok('안 나뉜 날의 오후·저녁은 비운다 — 엉뚱한 시간대로 흩지 않는다',
    course.days[1].pm === '' && course.days[1].eve === '');
  ok('식사·숙박은 참고 칸에 문서 그대로', /조: 호텔식/.test(course.days[1].tip)
    && /Grandior/.test(course.days[0].tip), course.days[0].tip);
  ok('지역이 있으면 그날 제목이 된다', course.days[0].title === '프라하', course.days[0].title);
  ok('지역이 없으면 제목을 비운다 (지어내지 않는다)', course.days[1].title === '');
  ok('일자 번호는 배열 순서로 다시 매긴다', course.days.map((d) => d.day).join(',') === '1,2');

  /* ── [4] 실제로 보내지는가 ──────────────────────────────────────────── */
  console.log('\n[4] 일정 관리로 보내면 새 코스가 생기는가');
  const before = putCount;
  await win.prSendItinerary('도쿄', ITIN);
  const iti = win.__iti;
  ok('일정 관리 탭으로 옮겨 간다', doc.getElementById('tab-itineraries').classList.contains('active'));
  ok('그 목적지가 골라진다', iti.destKey === '도쿄', iti.destKey);
  ok('목적지 선택 칸도 같이 바뀐다', doc.getElementById('iti-dest').value === '도쿄');
  const added = iti.courses[iti.courses.length - 1];
  ok('새 코스로 들어간다', !!added && /검토 필요/.test(added.title), added && added.title);
  ok('기존 코스를 건드리지 않는다 (도쿄 기본 3개 + 1)', iti.courses.length === 4, String(iti.courses.length));
  ok('방금 넣은 코스를 보여 준다', win.__view.courseIdx === iti.courses.length - 1);
  ok('저장 안 함 표시가 켜진다', iti.dirty === true);
  ok('⚠ **저장하지 않는다** — 사람이 눌러야 한다', putCount === before, String(putCount - before));
  const msg = doc.getElementById('iti-msg');
  ok('안내에 몇 일을 넣었는지 적는다', /2일/.test(msg.textContent), msg.textContent.slice(0, 90));
  ok('안내가 안 나뉜 날을 다시 말한다', /1일은 문서에 시간대 구분이 없어/.test(msg.textContent));
  ok('안내가 「저장해야 반영된다」를 말한다', /저장해야 반영|저장하면/.test(msg.textContent));
  /* TC: 저장하면 **고객 추천 일정이 이 견적서 일정으로 바뀐다** — 그 사실을 안 밝히면
     담당자는 자기가 고친 온라인 코스가 왜 안 나가는지 모른다. */
  ok('저장하면 고객 일정이 바뀐다는 것을 밝힌다',
    /고객 추천 일정이 이 견적서 일정으로 바뀝니다/.test(msg.textContent), msg.textContent.slice(0, 200));
  ok('안내가 「지어내지 않았다」를 말한다', /지어내지 않았습니다/.test(msg.textContent));

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

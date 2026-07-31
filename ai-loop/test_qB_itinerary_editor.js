/* QB 검증: 추천 일정을 산출 담당자가 관리자 화면에서 직접 고칠 수 있는가, 그리고
   고친 값이 실제로 고객에게 나가는가.

   원래 상태 —
   추천 일정(목적지별 코스 제목·하이라이트·일자별 오전/오후/저녁/팁)이 script.js의
   ITINERARY_DB 상수에만 있었다. 오타 하나를 고치려면 개발자가 코드를 고치고 배포해야
   했고, 정작 그 내용을 아는 산출 담당자는 손댈 수 없었다.

   구조 —
   ① data.js가 **기본값**, DB의 itinerary_overrides가 **실제 값**(요율에서 data.js보다
      rate_overrides가 진실인 것과 같다). 오버라이드 행이 없는 목적지는 기본값 그대로다.
   ② ITINERARY_DB를 script.js → data.js로 옮겼다. admin.html은 data.js는 싣지만
      script.js는 싣지 않기 때문이다(견적 엔진이라 로드되는 순간 고객 화면용 DOM 작업을
      시작한다). 표를 admin에 복사해 두면 같은 목록이 두 벌이 된다(결함 생성기 ①).
   ③ 오버라이드 로드 실패는 **조용하면 안 된다**(결함 생성기 ②). 실패하면 담당자가
      방금 고쳐 저장한 내용이 빠진 채로 견적서가 나가는데, 화면상 아무 차이가 없다.

   실행: node ai-loop/test_qB_itinerary_editor.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 서버 모듈은 db.js가 로드 시점에 접속 문자열을 요구한다(연결은 하지 않는다) */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost/db';

const OVERRIDE_TOKYO = [{
  title: '수정된 도쿄 코스',
  subtitle: '담당자가 관리자 화면에서 고친 내용',
  highlights: ['수정 하이라이트'],
  days: [
    { day: 1, title: '수정 1일차', am: '오전 수정', pm: '오후 수정', eve: '저녁 수정', tip: '팁 수정' },
    { day: 2, title: '수정 2일차', am: '', pm: '', eve: '', tip: '' },
  ],
}];

(async () => {
  /* ── [1] 데이터 위치 이동이 안전하게 됐는가 ─────────────────────────── */
  console.log('[1] ITINERARY_DB가 data.js로 옮겨졌는가 (②)');
  const dataSrc = read('data.js');
  const scriptSrc = read('script.js');
  ok('data.js가 ITINERARY_DB를 선언한다', /^const ITINERARY_DB = \{/m.test(dataSrc));
  ok('data.js가 PROGRAM_PRIORITY를 선언한다', /^const PROGRAM_PRIORITY = \{/m.test(dataSrc));
  ok('script.js에는 더 이상 선언이 없다(두 벌 방지)',
    !/^const ITINERARY_DB = \{/m.test(scriptSrc) && !/^const PROGRAM_PRIORITY = \{/m.test(scriptSrc));
  ok('script.js에 옮긴 곳을 가리키는 안내가 남아 있다', /data\.js로 옮겼다/.test(scriptSrc));

  const destKeys = require(path.join(ROOT, 'data.js')).map(d => d.destination_key);
  const itiKeys = [...dataSrc.matchAll(/^  '([^']+)': \[/gm)].map(m => m[1]);
  ok('목적지 55곳 일정이 그대로 있다', itiKeys.length === 55, String(itiKeys.length));
  ok('요율표에 있는 목적지가 전부 일정에도 있다',
    destKeys.every(k => itiKeys.includes(k)),
    destKeys.filter(k => !itiKeys.includes(k)).join(','));

  /* admin.html이 실제로 이 표를 읽을 수 있는 경로에 있는가 */
  const adminSrc = read('admin.html');
  ok('admin.html이 data.js를 싣는다', /<script src="data\.js"><\/script>/.test(adminSrc));
  ok('admin.html은 script.js를 싣지 않는다(견적 엔진이라 실으면 안 된다)',
    !/<script src="script\.js"><\/script>/.test(adminSrc));
  ok('admin.html에 일정 표가 복사돼 있지 않다', !/const ITINERARY_DB/.test(adminSrc));

  /* ── [2] 서버 검증 규칙 ─────────────────────────────────────────────── */
  console.log('\n[2] 서버가 저장 전에 모양을 확인하는가');
  const content = require(path.join(ROOT, 'api', 'content.js'));
  const errOf = r => r.error || 'ok';
  ok('빈 코스 배열 거부',      errOf(content.normalizeCourses([])) === 'courses_empty');
  ok('배열이 아니면 거부',     errOf(content.normalizeCourses({})) === 'courses_empty');
  ok('제목 없는 코스 거부',    errOf(content.normalizeCourses([{ title: '  ', days: [{ title: 'a' }] }])) === 'empty_title');
  ok('일자 없는 코스 거부',    errOf(content.normalizeCourses([{ title: 'A', days: [] }])) === 'days_empty');
  ok('코스 개수 상한 적용',
    errOf(content.normalizeCourses(Array(content.MAX_COURSES + 1).fill({ title: 'A', days: [{ title: 'a' }] }))) === 'too_many_courses');
  ok('일자 개수 상한 적용',
    errOf(content.normalizeCourses([{ title: 'A', days: Array(content.MAX_DAYS + 1).fill({ title: 'a' }) }])) === 'too_many_days');
  ok('지나치게 긴 본문 거부',
    errOf(content.normalizeCourses([{ title: 'A', days: [{ title: 'a', am: 'x'.repeat(5000) }] }])) === 'invalid_day_am');

  const normed = content.normalizeCourses([{
    title: '  제목  ', subtitle: 'sub', highlights: ['h1', '  ', 'h2'],
    days: [{ day: 99, title: 't1' }, { day: 3, title: 't2' }],
  }]);
  ok('일자 번호를 순서대로 다시 매긴다(견적서 DAY 순서가 뒤집히지 않게)',
    normed.courses[0].days.map(d => d.day).join(',') === '1,2',
    normed.courses[0].days.map(d => d.day).join(','));
  ok('제목 공백을 정리한다', normed.courses[0].title === '제목');
  ok('빈 하이라이트를 버린다', normed.courses[0].highlights.length === 2);
  ok('빠진 필드는 빈 문자열로 채운다', normed.courses[0].days[0].pm === '');

  const apiSrc = read(path.join('api', 'content.js'));
  ok('편집은 로그인한 직원만 가능하다',
    /requireRole\(req, res, \['owner', 'manager', 'staff'\]\)/.test(apiSrc));
  ok('목적지 키를 서버가 아는 목록으로 검증한다', /BUILTIN_DEST_KEYS\.has\(destKey\)/.test(apiSrc));
  ok('목적지 조회가 실패하면 통과시키지 않는다(장애 때만 열리는 문 방지)',
    /dest_check_failed/.test(apiSrc));
  ok('되돌리기가 "지울 게 없었음"을 구분해 알린다', /removed: rows\.length > 0/.test(apiSrc));
  ok('새 서버리스 함수를 만들지 않고 기존 파일에 action으로 붙였다',
    /action === 'itineraries'/.test(apiSrc) && !fs.existsSync(path.join(ROOT, 'api', 'itineraries.js')));

  /* ── [3] 저장한 일정이 실제로 고객 화면에 반영되는가 ────────────────── */
  console.log('\n[3] 오버라이드가 고객 화면에 반영되는가');
  const bootPublic = (fetchImpl) => {
    const dom = new JSDOM(read('index.html'), {
      runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(w) {
        w.fetch = fetchImpl;
        w.requestAnimationFrame = cb => setTimeout(cb, 0);
        w.Element.prototype.scrollIntoView = function () {};
        const c = new Proxy({}, { get: () => (() => c) });
        w.HTMLCanvasElement.prototype.getContext = () => c;
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      },
    });
    /* const 전역은 window에 붙지 않는다(CLAUDE.md) — 필요한 것만 노출해서 본다 */
    const EXPOSE = '\n;try{window.ITINERARY_DB=ITINERARY_DB;window.DEST_REC=DEST_REC;'
      + 'window.itineraryOverridesReady=itineraryOverridesReady;'
      + 'window.getItineraries=getItineraries;window._buildDisplayDays=_buildDisplayDays;}catch(e){}\n';
    const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;
    try { dom.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
    return dom.window;
  };

  const okFetch = (u) => {
    if (String(u).includes('action=itineraries')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        overrides: { '도쿄': OVERRIDE_TOKYO },
        meta: { '도쿄': { updatedAt: '2026-07-31T00:00:00Z', updatedBy: '김직원' } },
      }) });
    }
    return new Promise(() => {});
  };
  const w1 = bootPublic(okFetch);
  const defaultTokyoTitle = w1.ITINERARY_DB['도쿄'][0].title;
  await w1.itineraryOverridesReady;
  ok('전제: 기본값은 수정본과 다르다', defaultTokyoTitle !== OVERRIDE_TOKYO[0].title, defaultTokyoTitle);
  ok('저장된 일정이 ITINERARY_DB를 덮어쓴다',
    w1.ITINERARY_DB['도쿄'][0].title === '수정된 도쿄 코스', w1.ITINERARY_DB['도쿄'][0].title);
  ok('수정하지 않은 목적지는 기본값 그대로다', Array.isArray(w1.ITINERARY_DB['파리']) && w1.ITINERARY_DB['파리'].length > 0);
  ok('견적서가 쓰는 조회 함수도 수정본을 본다',
    w1.getItineraries('도쿄', 'industry')[0].title === '수정된 도쿄 코스');
  ok('반영 상태를 기록으로 남긴다', w1.__ITINERARY_SOURCE__.state === 'applied', w1.__ITINERARY_SOURCE__.state);
  ok('어느 목적지가 반영됐는지도 남긴다', w1.__ITINERARY_SOURCE__.applied.join(',') === '도쿄');

  /* 일수가 코스보다 길어도 "귀국" 일자가 중간에 끼지 않는가 — 저장한 일정에도 같은 규칙이 걸린다 */
  const days7 = w1._buildDisplayDays(w1.ITINERARY_DB['도쿄'][0], '도쿄', 'a', 7);
  ok('연수 일수가 길어도 마지막 일자가 실제 마지막 날에 온다',
    days7.length === 7 && days7[6].title === OVERRIDE_TOKYO[0].days[1].title,
    days7.map(d => d.title).join(' | '));

  /* ── [4] 못 불러왔을 때 조용히 넘어가지 않는가 (②) ──────────────────── */
  console.log('\n[4] 오버라이드를 못 불러왔을 때 (결함 생성기 ②)');
  const w2 = bootPublic((u) => String(u).includes('action=itineraries')
    ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    : new Promise(() => {}));
  await w2.itineraryOverridesReady;
  ok('실패를 상태로 남긴다', w2.__ITINERARY_SOURCE__.state === 'failed', w2.__ITINERARY_SOURCE__.state);
  ok('무엇이 실패했는지도 남긴다', /http_500/.test(w2.__ITINERARY_SOURCE__.error), w2.__ITINERARY_SOURCE__.error);
  ok('그래도 화면은 기본 일정으로 정상 동작한다', w2.ITINERARY_DB['도쿄'][0].title === defaultTokyoTitle);
  const aqSrc = read('admin-quote.html');
  ok('내부 산출 도구가 그 실패를 담당자에게 보여준다',
    /itineraryOverridesReady/.test(aqSrc) && /state !== 'failed'/.test(aqSrc));
  ok('고객 화면(index.html)에는 그 경고를 띄우지 않는다', !/ITINERARY_SOURCE/.test(read('index.html')));

  /* ── [5] 관리자 편집 화면 ────────────────────────────────────────────── */
  console.log('\n[5] 관리자 "일정 관리" 화면');
  let putBody = null, deleted = null;
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__iti=itiState;window.__setUser=u=>{currentUser=u};'
      + 'window.ITINERARY_DB=ITINERARY_DB;window.DEST_REC=DEST_REC;}catch(e){}\n';
    let injected = false;
    return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  })();
  const adom = new JSDOM(adminHtml, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u, opt) => {
        const s = String(u);
        if (s.includes('action=itineraries')) {
          if (opt && opt.method === 'PUT') {
            putBody = JSON.parse(opt.body);
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, courses: putBody.courses }) });
          }
          if (opt && opt.method === 'DELETE') {
            deleted = s;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, removed: true }) });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            overrides: { '도쿄': OVERRIDE_TOKYO },
            meta: { '도쿄': { updatedAt: '2026-07-31T00:00:00Z', updatedBy: '김직원' } },
          }) });
        }
        return new Promise(() => {});
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true;
    },
  });
  const aw = adom.window, adoc = aw.document;
  await new Promise(r => setTimeout(r, 200));
  ok('일정 관리 탭 버튼이 있다', !!adoc.querySelector('.sidebar-item[data-tab="itineraries"]'));
  ok('일정 관리 패널이 있다', !!adoc.getElementById('tab-itineraries'));
  ok('렌더 함수가 연결돼 있다', typeof aw.renderItineraries === 'function');

  aw.__setUser({ id: 1, role: 'staff', displayName: '김직원' });
  await aw.renderItineraries();

  const sel = adoc.getElementById('iti-dest');
  ok('목적지 목록이 요율표에서 파생돼 채워진다', sel.options.length === destKeys.length + 1,
    String(sel.options.length));
  ok('이미 수정한 목적지는 목록에서 표시된다',
    Array.from(sel.options).some(o => o.value === '도쿄' && o.textContent.includes('수정됨')));

  /* 수정된 목적지를 고르면 기본값이 아니라 저장본이 올라와야 한다 —
     기본값이 올라오면 담당자가 그걸 저장해 남의 수정본을 지운다. */
  sel.value = '도쿄';
  sel.dispatchEvent(new aw.Event('change', { bubbles: true }));
  const body = adoc.getElementById('iti-body');
  ok('저장돼 있던 내용이 폼에 올라온다',
    Array.from(body.querySelectorAll('input,textarea')).some(el => el.value === '수정된 도쿄 코스'));
  ok('기본 일정이 잘못 올라오지 않는다',
    !Array.from(body.querySelectorAll('input,textarea')).some(el => el.value === defaultTokyoTitle));
  ok('누가 언제 고쳤는지 보인다',
    /김직원/.test(adoc.getElementById('iti-state').textContent),
    adoc.getElementById('iti-state').textContent);
  ok('일자별 오전/오후/저녁/팁 칸이 있다',
    ['오전', '오후', '저녁'].every(l =>
      Array.from(body.querySelectorAll('.iti-lbl')).some(e => e.textContent.includes(l))));

  /* 아직 수정하지 않은 목적지는 기본값이 올라온다 */
  sel.value = '파리';
  sel.dispatchEvent(new aw.Event('change', { bubbles: true }));
  ok('수정 이력이 없는 목적지는 기본 일정이 올라온다',
    Array.from(body.querySelectorAll('input,textarea'))
      .some(el => el.value === aw.ITINERARY_DB['파리'][0].title));
  ok('그 사실이 화면에 적힌다', /아직 수정한 적 없음/.test(adoc.getElementById('iti-state').textContent));

  /* 편집 → 저장 */
  sel.value = '도쿄';
  sel.dispatchEvent(new aw.Event('change', { bubbles: true }));
  const titleInput = Array.from(body.querySelectorAll('input')).find(el => el.value === '수정된 도쿄 코스');
  titleInput.value = '두 번째 수정';
  titleInput.dispatchEvent(new aw.Event('input', { bubbles: true }));
  ok('저장 전에는 "저장 안 함" 표시가 뜬다', /저장 안 함/.test(adoc.getElementById('iti-state').textContent));
  await aw.itiSave();
  ok('저장이 PUT으로 나간다', !!putBody);
  ok('올바른 목적지로 저장된다', putBody && putBody.destKey === '도쿄');
  ok('고친 내용이 실제로 실린다', putBody && putBody.courses[0].title === '두 번째 수정');
  ok('일자 내용이 통째로 실린다', putBody && putBody.courses[0].days.length === 2);
  ok('저장 후 "저장 안 함" 표시가 사라진다', !/저장 안 함/.test(adoc.getElementById('iti-state').textContent));
  ok('저장 성공을 화면에 알린다', /반영/.test(adoc.getElementById('iti-msg').textContent),
    adoc.getElementById('iti-msg').textContent);

  /* 되돌리기 */
  await aw.itiRevert();
  ok('되돌리기가 DELETE로 나간다', !!deleted && /destKey=/.test(deleted));
  ok('되돌린 뒤 기본 일정이 폼에 올라온다',
    Array.from(body.querySelectorAll('input,textarea')).some(el => el.value === defaultTokyoTitle));

  /* ── [6] 담당자가 친 글자가 코드로 해석되지 않는가 (결함 생성기 ④) ──── */
  console.log('\n[6] 입력값이 HTML/JS로 해석되지 않는가');
  const EVIL = `'"><img src=x onerror=window.__pwned=1>`;
  const evilCourse = [{ title: EVIL, subtitle: EVIL, highlights: [EVIL],
    days: [{ day: 1, title: EVIL, am: EVIL, pm: EVIL, eve: EVIL, tip: EVIL }] }];
  aw.__iti.overrides['파리'] = evilCourse;
  sel.value = '파리';
  sel.dispatchEvent(new aw.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  ok('주입된 태그가 DOM 요소로 만들어지지 않는다', body.querySelectorAll('img').length === 0);
  ok('스크립트가 실행되지 않았다', aw.__pwned === undefined);
  ok('그래도 값은 입력칸에 그대로 보인다',
    Array.from(body.querySelectorAll('input,textarea')).some(el => el.value === EVIL));
  /* 편집 화면의 JS 블록만 떼어 본다 — 같은 문구가 <style> 주석에도 있어 그걸 집으면
     admin.html 본문 전체가 범위에 들어가 엉뚱한 곳에서 걸린다. */
  const itiJsStart = adminSrc.indexOf('const itiState = {');
  const itiJsEnd   = adminSrc.indexOf('async function renderContent');
  const itiJs = adminSrc.slice(itiJsStart, itiJsEnd);
  ok('편집 화면 JS 블록을 찾았다', itiJsStart > 0 && itiJsEnd > itiJsStart && itiJs.includes('itiRenderCourse'));
  ok('편집 화면이 인라인 onclick에 값을 끼워 넣지 않는다', !/onclick=/.test(itiJs));
  ok('편집 화면이 innerHTML로 값을 그리지 않는다(createElement만 쓴다)',
    !/innerHTML\s*=/.test(itiJs) && /createElement/.test(itiJs));

  /* ── [7] QC: 추천 콘텐츠(DEST_REC)도 같은 화면에서 고쳐지는가 ────────── */
  console.log('\n[7] 추천 콘텐츠(방식 A/B) 편집 (QC)');
  ok('data.js가 DEST_REC를 갖고 있다', /^const DEST_REC = \{/m.test(dataSrc));
  ok('55곳 전부 방식 A·B가 있다(전제)',
    (dataSrc.match(/^\s+a: \{ tag:/gm) || []).length === 55
    && (dataSrc.match(/^\s+b: \{ tag:/gm) || []).length === 55);

  ok('rec을 안 보내면 기존 값을 건드리지 않는다', content.normalizeRec(undefined).rec === undefined);
  ok('방식 A가 빠지면 거부', errOf(content.normalizeRec({ b: { tag: 'x' } })) === 'rec_missing_a');
  ok('방식 B가 빠지면 거부', errOf(content.normalizeRec({ a: { tag: 'x' } })) === 'rec_missing_b');
  ok('핵심 포인트 개수 상한 적용',
    errOf(content.normalizeRec({ a: { points: Array(content.MAX_POINTS + 1).fill('p') }, b: {} })) === 'too_many_points_a');
  ok('일별 활동 개수 상한 적용',
    errOf(content.normalizeRec({ a: {}, b: { items: Array(content.MAX_ITEMS + 1).fill('i') } })) === 'too_many_items_b');
  const nr = content.normalizeRec({
    a: { tag: ' 역량강화형 ', desc: 'd', points: ['p1', ' ', 'p2'], items: ['i1'], value: 'v' },
    b: { tag: 'B' },
  });
  ok('공백을 정리하고 빈 항목을 버린다',
    nr.rec.a.tag === '역량강화형' && nr.rec.a.points.length === 2, JSON.stringify(nr.rec && nr.rec.a));
  ok('빠진 필드는 빈 값으로 채운다',
    nr.rec.b.desc === '' && Array.isArray(nr.rec.b.items) && nr.rec.b.items.length === 0);
  ok('저장은 일정과 한 행에 담긴다(반쪽 저장 방지)',
    /insert into itinerary_overrides \(dest_key, courses, rec/.test(apiSrc));
  ok('rec을 안 보낸 저장이 기존 추천을 지우지 않는다',
    /rec = coalesce\(excluded\.rec, itinerary_overrides\.rec\)/.test(apiSrc));

  /* 고객 화면 반영 */
  const REC_OVERRIDE = {
    a: { tag: '수정된 방식A', desc: '수정 설명', points: ['수정 포인트'], items: ['수정 활동1', '수정 활동2'], value: '수정 기대효과' },
    b: { tag: '수정된 방식B', desc: 'b설명', points: ['b포인트'], items: ['b활동'], value: 'b기대효과' },
  };
  const w3 = bootPublic((u) => String(u).includes('action=itineraries')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({
        overrides: {}, recOverrides: { '파리': REC_OVERRIDE }, meta: {},
      }) })
    : new Promise(() => {}));
  const defaultParisTag = w3.DEST_REC['파리'].a.tag;
  await w3.itineraryOverridesReady;
  ok('저장된 추천 콘텐츠가 DEST_REC를 덮어쓴다',
    w3.DEST_REC['파리'].a.tag === '수정된 방식A', w3.DEST_REC['파리'].a.tag);
  ok('수정하지 않은 목적지는 기본값 그대로다', w3.DEST_REC['도쿄'].a.tag === DEST_REC_TOKYO_TAG(w3));
  ok('일정만 있고 추천이 없어도 상태가 applied다', w3.__ITINERARY_SOURCE__.state === 'applied');
  ok('어느 목적지의 추천이 반영됐는지 남긴다', w3.__ITINERARY_SOURCE__.appliedRec.join(',') === '파리');

  /* 남는 날 채움에 수정된 '일별 활동'이 실제로 쓰이는가 —
     이 값이 어디에 쓰이는지가 화면 라벨의 주장이므로 실제로 확인한다. */
  const parisCourse = w3.ITINERARY_DB['파리'][0];
  const longDays = w3._buildDisplayDays(parisCourse, '파리', 'a', parisCourse.days.length + 3);
  ok('연수 일수가 길 때 남는 날을 수정된 활동으로 채운다',
    longDays.some(d => d.title === '수정 활동1' || d.title === '수정 활동2'),
    longDays.map(d => d.title).join(' | '));

  /* a/b 한쪽만 온 값은 넣지 않는다 */
  const w4 = bootPublic((u) => String(u).includes('action=itineraries')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({
        overrides: {}, recOverrides: { '파리': { a: REC_OVERRIDE.a } }, meta: {},
      }) })
    : new Promise(() => {}));
  await w4.itineraryOverridesReady;
  ok('반쪽짜리 추천은 적용하지 않는다', w4.DEST_REC['파리'].a.tag === defaultParisTag, w4.DEST_REC['파리'].a.tag);
  ok('건너뛴 사실을 기록으로 남긴다',
    (w4.__ITINERARY_SOURCE__.skippedRec || []).join(',') === '파리');

  /* 관리자 화면 */
  const adoc2 = adoc;
  aw.__iti.recOverrides = {};
  sel.value = '도쿄';
  sel.dispatchEvent(new aw.Event('change', { bubbles: true }));
  const inputsNow = () => Array.from(body.querySelectorAll('input,textarea'));
  ok('추천 콘텐츠 칸이 화면에 있다',
    Array.from(body.querySelectorAll('.iti-course-no')).some(e => e.textContent === '방식 A')
    && Array.from(body.querySelectorAll('.iti-course-no')).some(e => e.textContent === '방식 B'));
  ok('기본 추천 콘텐츠가 폼에 올라온다',
    inputsNow().some(el => el.value === aw.DEST_REC['도쿄'].a.tag), aw.DEST_REC['도쿄'].a.tag);
  ok('일별 활동이 한 줄에 하나씩 올라온다',
    inputsNow().some(el => el.value === aw.DEST_REC['도쿄'].a.items.join('\n')));
  ok('그 값이 어디에 쓰이는지 화면에 적혀 있다',
    Array.from(body.querySelectorAll('.iti-lbl')).some(e => /견적서/.test(e.textContent))
    && Array.from(body.querySelectorAll('.iti-lbl')).some(e => /남는 날/.test(e.textContent)));

  const tagInput = inputsNow().find(el => el.value === aw.DEST_REC['도쿄'].a.tag);
  tagInput.value = '새 방식 이름';
  tagInput.dispatchEvent(new aw.Event('input', { bubbles: true }));
  putBody = null;
  await aw.itiSave();
  ok('추천 콘텐츠가 일정과 함께 한 번에 저장된다',
    !!putBody && !!putBody.rec && !!putBody.courses, JSON.stringify(putBody && Object.keys(putBody)));
  ok('고친 방식 이름이 실린다', putBody.rec.a.tag === '새 방식 이름');
  ok('건드리지 않은 방식 B도 함께 실린다(반쪽 저장 방지)', !!putBody.rec.b && !!putBody.rec.b.tag);

  ok('편집 화면은 여전히 innerHTML을 쓰지 않는다',
    !/innerHTML\s*=/.test(adminSrc.slice(adminSrc.indexOf('const itiState = {'),
                                         adminSrc.indexOf('async function renderContent'))));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

/* 오버라이드가 적용되기 전 기본값을 알아야 "안 건드렸다"를 확인할 수 있다.
   w3는 이미 적용된 뒤이므로 data.js에서 직접 읽는다. */
function DEST_REC_TOKYO_TAG() {
  const src = read('data.js');
  const at = src.indexOf("  '도쿄': {", src.indexOf('const DEST_REC = {'));
  const m = src.slice(at, at + 400).match(/a: \{ tag:'([^']+)'/);
  return m ? m[1] : '';
}

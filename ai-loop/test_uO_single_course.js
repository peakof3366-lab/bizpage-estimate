/* UO 검증: 견적서 산출자가 코스를 **하나만** 추천해 내보낼 수 있다.

   대표 요청(2026-08-19): 「내부 견적 산출 자료에서는 견적서 산출자가 코스를 하나만
   추천해서 진행할 수 있도록」.

   지금까지 견적서에는 늘 코스 A·B 두 벌이 나갔다. 목적이 분명한 연수에서는 대안
   코스가 결재 문서를 오히려 흐린다.

   여기서 고정하는 것:
   ① 「몇 벌인가」의 판단은 rec_fallbacks 한 곳이다(single). 화면마다 따로 세면
      견적서·편집기·발급 확인이 서로 다른 개수를 말한다(RR에서 겪은 사고).
   ② 한 벌일 때 b를 **null로 비운다.** 예전처럼 a를 복제해 채우면 같은 코스가
      「코스 A」와 「코스 B」로 두 번 나가고 화면은 그걸 정상으로 읽는다.
   ③ **견적서에 실제로 하나만 실린다** — 탭이 사라지고 코스 B 블록이 통째로 빠진다.
   ④ 고객 계산기(index.html 경로)는 동작이 그대로다 — 전용 일정이 없으면 늘 두 벌.
   ⑤ 편집기에서 「코스 A만/B만」을 고르면 그 코스만 저장된다. 안 나가는 코스는
      **지우지 않고** 「나가지 않습니다」로 표시만 한다(되돌릴 수 있어야 한다).
   ⑥ 서버가 코스 한 벌짜리 저장을 받아 준다.

   실행: node ai-loop/test_uO_single_course.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');
const { recQuoteItinerary } = require(path.join(ROOT, 'rec_fallbacks.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const day = (n, t) => ({ day: n, title: t, am: t + ' 오전', pm: t + ' 오후', eve: '석식', tip: '' });
const C_A = { title: '코스가', subtitle: '설명가', highlights: ['하나'],
  days: [day(1, '가도착'), day(2, '가둘째'), day(3, '가귀국')] };
const C_B = { title: '코스나', subtitle: '설명나', highlights: ['둘'],
  days: [day(1, '나도착'), day(2, '나귀국')] };
const TABLES = { itineraryDb: { '도쿄': [C_A, C_B] }, priority: {}, destRec: {} };

(async () => {
  /* ── [1] 판단은 한 곳에서 ──────────────────────────────────────────── */
  console.log('\n[1] recQuoteItinerary — 코스 한 벌인지 여기서 정한다');
  {
    const both = recQuoteItinerary({ ...TABLES, savedCourses: [C_A, C_B] },
      { destKey: '도쿄', programType: 'industry', totalDays: 5 });
    ok('두 벌을 저장하면 single이 아니다', both.single === false, String(both.single));
    ok('두 벌이면 b가 채워진다', !!both.b);
    ok('두 벌이면 courses가 2개', both.courses.length === 2);

    const one = recQuoteItinerary({ ...TABLES, savedCourses: [C_A] },
      { destKey: '도쿄', programType: 'industry', totalDays: 5 });
    ok('① 한 벌을 저장하면 single이다', one.single === true, String(one.single));
    ok('② **b가 null이다** (a를 복제해 채우지 않는다)', one.b === null, JSON.stringify(one.b));
    ok('② courses도 한 개만 준다', one.courses.length === 1, String(one.courses.length));
    ok('남은 한 벌은 저장한 그 코스다', one.a.t === '코스가', one.a.t);
    ok('일자 수는 그대로 견적 일수에 맞춘다', one.a.d.length === 5, String(one.a.d.length));

    /* ④ 고객 계산기 경로 — 전용 일정이 없으면 늘 두 벌이어야 한다. */
    const plain = recQuoteItinerary(TABLES, { destKey: '도쿄', programType: 'industry', totalDays: 5 });
    ok('④ 전용 일정이 없으면 single이 아니다 (고객 계산기 동작 불변)',
      plain.single === false && !!plain.b, String(plain.single));

    /* 목적지에 코스가 한 벌뿐인 경우도 「일부러 하나」가 아니다 — 고를 것이 없었을 뿐. */
    const onlyOneInDb = recQuoteItinerary({ itineraryDb: { '외톨이': [C_A] }, priority: {}, destRec: {} },
      { destKey: '외톨이', programType: 'industry', totalDays: 5 });
    ok('목적지 공통이 한 벌뿐인 것은 single이 아니다 (예전 동작 그대로)',
      onlyOneInDb.single === false && !!onlyOneInDb.b, String(onlyOneInDb.single));
  }

  /* ── [2] 견적서에 실제로 하나만 실리는가 ───────────────────────────── */
  console.log('\n[2] 견적서 문서 — 탭이 사라지고 코스 하나만 나간다');
  {
    const dom = new JSDOM(read('admin-quote.html'), {
      runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(w) {
        w.fetch = (u) => (String(u).includes('account?action=me')
          ? Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '홍길동', role: 'staff' }) })
          : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }));
        w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        w.Element.prototype.scrollIntoView = function () {};
        w.__written = '';
        /* 견적서 창을 흉내낸다. ⚠ getElementById까지 줘야 한다 — script.js가 창을 연
           뒤 타이머로 showReview()를 불러 그 창의 요소를 찾는다(없으면 null이 정상). */
        w.open = () => ({
          document: { write(h) { w.__written += h; }, close() {}, getElementById: () => null },
          focus() {},
        });
        const c = new Proxy({}, { get: () => (() => c) });
        w.HTMLCanvasElement.prototype.getContext = () => c;
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.alert = () => {}; w.confirm = () => true;
      },
    });
    const w = dom.window, d = w.document;
    try {
      w.eval(read('data.js') + '\n' + read('company-info.js') + '\n'
        + read('rec_fallbacks.js') + '\n' + read('script.js'));
    } catch (e) { console.log('  [eval warn]', e.message); }
    await new Promise((r) => setTimeout(r, 250));

    const sel = d.getElementById('destination');
    sel.value = '도쿄';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    d.getElementById('participants').value = '20';
    d.getElementById('days').value = '5';
    d.getElementById('nextStepButton').click();
    d.getElementById('organization').value = '테스트기업';
    d.getElementById('contactName').value = '김담당';
    /* WC: 연락처가 필수가 됐다 — 대장에서 담당자 부재 시 이어받는 데 쓴다.
       ⚠ 이 값은 견적서·링크에 안 실린다(payload 밖으로 간다). */
    d.getElementById('contactTel').value = '010-1234-5678';
    d.getElementById('requestDetails').value = '문의';
    d.getElementById('estimateForm').dispatchEvent(
      new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 200));

    /* 대조군 — 두 벌 */
    w.quoteItiSet(w._lastQuoteId, { courses: [C_A, C_B], days: 5 });
    w.__written = '';
    w.openEstimateWindow();
    const two = w.__written;
    ok('대조군: 두 벌이면 탭이 나온다', /showCourse\('b'/.test(two) && two.includes('코스나'));
    ok('대조군: 코스 B 블록이 있다', two.includes('id="course-b"'));
    ok('대조군: 안내 문구가 「두 가지」다', two.includes('코스 두 가지를 선별'));

    /* 본론 — 한 벌 */
    w.quoteItiSet(w._lastQuoteId, { courses: [C_A], days: 5 });
    w.__written = '';
    w.openEstimateWindow();
    const one = w.__written;
    ok('③ 고른 코스는 견적서에 실린다', one.includes('코스가') && one.includes('가도착'));
    ok('③ **탭이 사라진다**', !/showCourse\('b'/.test(one));
    ok('③ **코스 B 블록이 통째로 빠진다**', !one.includes('id="course-b"'), '남아 있다');
    ok('③ 다른 코스 내용이 새지 않는다', !one.includes('코스나') && !one.includes('나도착'));
    ok('③ 안내 문구가 「두 가지」라고 말하지 않는다', !one.includes('코스 두 가지를 선별'));
    ok('③ 일정 섹션 자체는 살아 있다', one.includes('RECOMMENDED ITINERARY'));

    dom.window.close();
  }

  /* ── [3] 편집기에서 고르고 저장하는가 ──────────────────────────────── */
  console.log('\n[3] 편집기 — 「코스 A만 / B만」을 고르면 그것만 저장된다');
  {
    const net = {};
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{ window.__login = function () { currentUser = { id: "1", '
      + 'username: "admin", displayName: "테스트담당", role: "owner" }; }; }'
      + 'catch(e){ window.__exposeError = String(e); }\n';
    let injected = false;
    const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (m, open, code, close) => {
        if (!injected && /let\s+emCurrentId/.test(code)) { injected = true; return open + code + EXPOSE + close; }
        return m;
      });
    if (!injected) throw new Error('emCurrentId 선언 블록을 찾지 못했습니다');

    const dom = new JSDOM(patched, {
      runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(w) {
        w.fetch = (u, opt) => {
          const s = String(u); const method = (opt && opt.method) || 'GET';
          if (s.includes('action=itineraries') && method === 'GET') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({
              overrides: { '도쿄': [C_A, C_B] }, recOverrides: {}, meta: {} }) });
          }
          if (/\/api\/quotes\//.test(s) && method === 'PATCH') {
            const b = JSON.parse(opt.body);
            if (b.addLog) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, entry: b.addLog }) });
            net.patched = b;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({
              ok: true, itinerary: Object.assign({}, b.itinerary, { confirmedBy: '서버가준이름' }) }) });
          }
          return new Promise(() => {});
        };
        const c = new Proxy({}, { get: () => (() => c) });
        w.HTMLCanvasElement.prototype.getContext = () => c;
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      },
    });
    await new Promise((r) => setTimeout(r, 80));
    const w = dom.window, d = w.document;
    w.__login();
    w.localStorage.setItem('linkedt_estimates_full', JSON.stringify([{
      id: 'q1', ts: '2026-08-19T00:00:00.000Z', destKey: '도쿄', destLabel: '도쿄',
      program: 'industry', participants: 20, days: 5, total: 20000000,
      orgName: '테스트기업', contact: '홍길동', items: [],
    }]));

    await w.eqOpen('q1');
    ok('개수 선택 줄이 뜬다', !d.getElementById('eq-count-row').classList.contains('hidden'));
    const radios = () => Array.from(d.querySelectorAll('input[name="eq-count"]'));
    ok('기본은 「둘 다」다 (지금까지 나간 견적서 모양을 조용히 바꾸지 않는다)',
      radios().find((r) => r.value === 'both').checked);
    ok('편집칸에 코스 두 벌이 그려진다',
      d.querySelectorAll('#eq-body .iti-course').length === 2,
      String(d.querySelectorAll('#eq-body .iti-course').length));

    /* 「코스 B만」을 고른다 */
    w.eqSetCount('b');
    ok('⑤ 고른 상태가 화면에 반영된다', radios().find((r) => r.value === 'b').checked);
    ok('⑤ 안 나가는 코스를 **지우지 않는다** (되돌릴 수 있어야 한다)',
      d.querySelectorAll('#eq-body .iti-course').length === 2,
      String(d.querySelectorAll('#eq-body .iti-course').length));
    ok('⑤ 대신 「나가지 않습니다」로 표시한다',
      Array.from(d.querySelectorAll('#eq-body .iti-day-blank'))
        .some((e) => /나가지 않습니다/.test(e.textContent)));
    ok('⑤ 안내가 탭이 없어진다고 말한다',
      /하나만 나갑니다/.test(d.getElementById('eq-count-note').textContent),
      d.getElementById('eq-count-note').textContent);

    await w.eqSave();
    ok('⑤ **저장 본문에 코스가 한 벌만 들어간다**',
      !!net.patched && net.patched.itinerary.courses.length === 1,
      net.patched ? String(net.patched.itinerary.courses.length) : '요청 없음');
    ok('⑤ 그 한 벌은 고른 코스 B다',
      net.patched.itinerary.courses[0].title === '코스나',
      net.patched.itinerary.courses[0].title);

    /* 「둘 다」로 되돌린다 — 버렸던 코스가 살아 있어야 한다 */
    w.eqSetCount('both');
    await w.eqSave();
    ok('⑤ 되돌리면 두 벌이 다시 저장된다 (버린 글이 사라지지 않았다)',
      net.patched.itinerary.courses.length === 2,
      String(net.patched.itinerary.courses.length));

    dom.window.close();
  }

  /* ── [4] 서버가 한 벌짜리를 받아 주는가 ────────────────────────────── */
  console.log('\n[4] 서버 저장 검증');
  {
    /* ⚠ content.js는 api/_lib/db.js를 싣고, 그건 DATABASE_URL이 없으면 로드 시점에
       터진다. 검증 함수만 보면 되므로 가짜 db를 require 캐시에 먼저 심는다
       (test_uI가 서버 핸들러를 부를 때 쓰는 방법과 같다). */
    const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
      exports: { sql: () => Promise.resolve([]) }, children: [], paths: [] };
    const content = require(path.join(ROOT, 'api', 'content.js'));
    const one = content.normalizeCourses([C_A]);
    ok('⑥ 코스 한 벌짜리 저장이 통과한다', !one.error && one.courses.length === 1, String(one.error));
    const none = content.normalizeCourses([]);
    ok('⑥ 빈 배열은 여전히 거절한다 (「하나만」과 「없음」은 다르다)',
      none.error === 'courses_empty', String(none.error));
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

/* UQ 검증: 「검토 전」 코스는 창고에만 있고 고객에게 자동으로 나가지 않는다.

   결정대기열 0-g ①(2026-08-18 신설 · 권장안)을 코드로 옮긴 것이다.

   왜 필요한가 —
   견적서 모음 46건 중 41건에 실제 일정표가 있고, 그것으로 목적지 공통 일정 19곳을
   채울 수 있다(seed_courses_from_corpus.js). 그런데 그냥 심으면 기존 규칙(TC,
   2026-08-11)이 「견적서 일정이 하나라도 있으면 고객은 그것만 본다」라서 **19곳의 고객
   화면이 즉시 바뀐다 — 다듬기 전 상태로.** 문서에 시간대 구분이 없어 오전 칸에 뭉쳐
   있는 날이 여럿이라(동유럽 4일 · 발리 4일 · 푸꾸옥 4일 · 홍콩 3일 · 나트랑 3일)
   오후·저녁이 빈 일정표가 고객에게 간다.

   그래서 심는 코스에 「검토 전」을 붙인다. 담당자가 확인하고 다듬어 「검토 완료」를
   누른 코스부터 고객에게 나가기 시작한다.

   여기서 고정하는 것:
   ① **거르는 자리는 한 곳뿐이다**(recVisibleCourses). 화면마다 따로 거르면 고객
      견적서와 일정 탐색이 다른 일정을 보여준다 — RR에서 겪은 사고 그대로다.
   ② 거르기가 **견적서 코스 우선(TC)보다 앞**이어야 한다. 뒤에 두면 심은 코스가 전부
      검토 전인 목적지에서 「견적서 코스가 있으니 그것만」이 먼저 걸려, 검토도 안 한
      일정이 고객에게 나간다. 이 표시를 만든 이유가 통째로 사라진다.
   ③ 전부 검토 전이면 **빈 배열**이다. 그대로 내보내면 이 표시가 아무것도 막지 못한다
      (결함 생성기 ③ — 실행된 적 없는 안전망).
   ④ 「출발점 가져오기」 후보에는 **들어간다.** 창고는 꺼내 쓰라고 있는 것이다.
      대신 검토 전이라고 표시한다.
   ⑤ 심기 도구가 검토 전으로 심고, **자기 동작을 사실대로 안내한다.**
   ⑥ 서버가 이 칸을 저장한다(흰 목록). 여기 빠지면 저장할 때 조용히 사라지고
      검토도 안 한 일정이 고객에게 나간다.

   실행: node ai-loop/test_uQ_pending_courses.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');
const R = require(path.join(ROOT, 'rec_fallbacks.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const day = (n, t) => ({ day: n, title: t, am: t + ' 오전', pm: t + ' 오후', eve: '석식', tip: '' });
const ONLINE = { title: '온라인코스', subtitle: '기본값', highlights: ['온'],
  days: [day(1, '온도착'), day(2, '온귀국')] };
const SEEDED = { title: '견적서코스 · 검토 필요', subtitle: '', highlights: [],
  source: 'quote', sourceNote: '견적서 PDF에서 읽은 일정 (3일)', pending: true,
  days: [day(1, '견도착'), day(2, '견중간'), day(3, '견귀국')] };
const REVIEWED = Object.assign({}, SEEDED, { title: '검토끝난견적서코스' });
delete REVIEWED.pending;

(async () => {
  /* ── [1] 거르는 규칙 ───────────────────────────────────────────────── */
  console.log('\n[1] recVisibleCourses / recPreferQuoteCourses');
  {
    ok('① 검토 전은 「지금 나갈 수 있는 코스」에서 빠진다',
      R.recVisibleCourses([ONLINE, SEEDED]).length === 1
      && R.recVisibleCourses([ONLINE, SEEDED])[0].title === '온라인코스');
    ok('① 검토가 끝난 것은 남는다', R.recVisibleCourses([ONLINE, REVIEWED]).length === 2);
    ok('검토를 기다리는 개수를 셀 수 있다 (담당자 화면이 「할 일」로 쓴다)',
      R.recPendingCount([ONLINE, SEEDED, SEEDED]) === 2,
      String(R.recPendingCount([ONLINE, SEEDED, SEEDED])));

    /* ② 이게 이 작업의 핵심이다 — 심은 직후의 실제 상태 */
    const afterSeed = R.recPreferQuoteCourses([ONLINE, SEEDED]);
    ok('② **심은 직후에는 온라인 코스가 그대로 나간다** (고객 화면이 안 바뀐다)',
      afterSeed.length === 1 && afterSeed[0].title === '온라인코스',
      JSON.stringify(afterSeed.map((c) => c.title)));
    ok('② 화면도 「견적서 일정이 나가는 곳」이라고 말하지 않는다',
      R.recHasQuoteCourses([ONLINE, SEEDED]) === false);

    /* 검토를 마치면 그때부터 TC 규칙이 돈다 */
    const afterReview = R.recPreferQuoteCourses([ONLINE, REVIEWED]);
    ok('검토 완료 뒤에는 견적서 코스만 나간다 (TC 규칙 그대로)',
      afterReview.length === 1 && afterReview[0].title === '검토끝난견적서코스',
      JSON.stringify(afterReview.map((c) => c.title)));
    ok('그때는 화면도 견적서 일정이라고 말한다',
      R.recHasQuoteCourses([ONLINE, REVIEWED]) === true);

    ok('③ 전부 검토 전이면 빈 배열이다 (표시가 실제로 막는다)',
      R.recPreferQuoteCourses([SEEDED]).length === 0,
      String(R.recPreferQuoteCourses([SEEDED]).length));
    ok('검토 전이 하나도 없으면 예전과 완전히 같다',
      R.recPreferQuoteCourses([ONLINE]).length === 1
      && R.recPreferQuoteCourses([]).length === 0);
  }

  /* ── [2] 견적서까지 실제로 이어지는가 ──────────────────────────────── */
  console.log('\n[2] recQuoteItinerary — 검토 전은 고객 견적서에 안 실린다');
  {
    const T = (courses) => ({ itineraryDb: { '도쿄': courses }, priority: {}, destRec: {} });
    const seeded = R.recQuoteItinerary(T([ONLINE, SEEDED]),
      { destKey: '도쿄', programType: 'industry', totalDays: 5 });
    ok('심은 직후 견적서에는 온라인 코스가 실린다',
      seeded && seeded.a.t === '온라인코스', seeded ? seeded.a.t : 'null');
    ok('출처도 「견적서에서 읽은 일정」이라고 말하지 않는다',
      seeded.origin !== 'quoteDoc', seeded.origin);

    const reviewed = R.recQuoteItinerary(T([ONLINE, REVIEWED]),
      { destKey: '도쿄', programType: 'industry', totalDays: 5 });
    ok('검토 완료 뒤에는 그 코스가 실린다',
      reviewed.a.t === '검토끝난견적서코스', reviewed.a.t);
    ok('그때 출처가 quoteDoc이 된다', reviewed.origin === 'quoteDoc', reviewed.origin);

    ok('③ 전부 검토 전인 목적지는 일정 없이 나간다 (터지지 않는다)',
      R.recQuoteItinerary(T([SEEDED]),
        { destKey: '도쿄', programType: 'industry', totalDays: 5 }) === null);
  }

  /* ── [3] 서버가 이 칸을 저장하는가 ─────────────────────────────────── */
  console.log('\n[3] 저장 검증 (흰 목록)');
  {
    const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
      exports: { sql: () => Promise.resolve([]) }, children: [], paths: [] };
    const content = require(path.join(ROOT, 'api', 'content.js'));

    const norm = content.normalizeCourses([SEEDED, ONLINE]);
    ok('⑥ 검토 전 표시가 저장을 통과한다', !norm.error, String(norm.error));
    ok('⑥ **저장 뒤에도 살아남는다** (흰 목록에 들어 있다)',
      norm.courses[0].pending === true, JSON.stringify(norm.courses[0].pending));
    ok('⑥ 검토 전이 아닌 코스에는 그 칸이 아예 안 붙는다',
      !('pending' in norm.courses[1]), JSON.stringify(norm.courses[1].pending));
    ok('⑥ true가 아닌 값은 검토 전으로 치지 않는다 (변종 방지)',
      !('pending' in content.normalizeCourses([Object.assign({}, ONLINE, { pending: 'yes' })]).courses[0]));
    ok('출처(source)는 예전대로 함께 남는다', norm.courses[0].source === 'quote');
  }

  /* ── [4] 심기 도구 ─────────────────────────────────────────────────── */
  console.log('\n[4] 일괄 심기 도구');
  {
    const src = read('ai-loop/seed_courses_from_corpus.js');
    ok('⑤ 심는 코스에 검토 전을 붙인다', /course\.pending\s*=\s*true/.test(src));
    ok('⑤ 안내가 「고객 화면은 바뀌지 않습니다」로 바뀌었다',
      /고객 화면은 바뀌지 않습니다/.test(src));
    ok('⑤ 옛 안내(「고객 추천 일정이 견적서 일정으로 바뀝니다」)가 남아 있지 않다',
      !/고객 추천 일정이 견적서 일정으로 바뀝니다/.test(src));
    ok('⑤ 기본이 dry-run인 것은 그대로다', /--apply/.test(src));
  }

  /* ── [5] 담당자가 검토를 뗄 수 있는가 ──────────────────────────────── */
  console.log('\n[5] 일정 관리 화면 — 배지와 「검토 완료」');
  {
    const admin = read('admin.html');
    ok('검토 전 배지가 있다', /iti-src-pending/.test(admin));
    ok('④ 「출발점 가져오기」 후보에도 검토 전임을 밝힌다',
      /pending === true \? ' · 🕒 검토 전'/.test(admin));

    /* ⚠ 소스에 문자열이 있는지로 끝내지 않는다 — 실제로 눌러 표시가 떨어지는지 본다
       (결함 생성기 ③: 안전망이 실행된 적이 없다). */
    /* const 전역은 window에 안 붙는다 — 선언한 스크립트 블록 끝에 노출을 심는다
       (test_uI·test_uM이 emCurrentId에 쓰는 방법과 같다). */
    const EXPOSE = '\n;try{ window.__iti = { state: itiState, view: itiView,'
      + ' render: itiRenderBody }; }catch(e){ window.__exposeError = String(e); }\n';
    let injected = false;
    const patched = htmlWithDeps('admin.html').replace(
      /(<script(?![^>]*src=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (m, open, code, close) => {
        if (!injected && /const\s+itiView/.test(code)) { injected = true; return open + code + EXPOSE + close; }
        return m;
      });
    if (!injected) throw new Error('itiView를 선언한 스크립트 블록을 찾지 못했습니다');

    const dom = new JSDOM(patched, {
      runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(w) {
        w.fetch = () => new Promise(() => {});
        const c = new Proxy({}, { get: () => (() => c) });
        w.HTMLCanvasElement.prototype.getContext = () => c;
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      },
    });
    await new Promise((r) => setTimeout(r, 80));
    const w = dom.window, d = w.document;

    /* 일정 관리 화면의 편집 상태를 실제 모양 그대로 세운다 */
    if (w.__exposeError) throw new Error('주입 실패: ' + w.__exposeError);
    const iti = w.__iti;
    iti.state.destKey = '도쿄';
    iti.state.courses = [JSON.parse(JSON.stringify(SEEDED))];
    iti.view.courseIdx = 0;
    iti.render();

    const badge = d.querySelector('#tab-itineraries .iti-src-pending');
    ok('검토 전 코스에 배지가 실제로 그려진다', !!badge && /검토 전/.test(badge.textContent),
      badge ? badge.textContent : '없음');
    ok('배지가 「고객에게 안 나감」이라고 말한다',
      !!badge && /안 나감/.test(badge.textContent), badge ? badge.textContent : '');

    const btn = Array.from(d.querySelectorAll('#tab-itineraries .iti-course-head .iti-btn'))
      .find((b) => /검토 완료/.test(b.textContent));
    ok('「검토 완료」 버튼이 함께 그려진다 (떼는 방법 없이 배지만 두지 않는다)', !!btn);

    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    ok('**누르면 표시가 실제로 떨어진다**', iti.state.courses[0].pending === undefined,
      String(iti.state.courses[0].pending));
    ok('저장해야 반영된다고 말한다 (누른 것만으로 나가지 않는다)',
      /저장을 눌러야/.test(d.getElementById('iti-msg').textContent),
      d.getElementById('iti-msg').textContent);

    iti.render();
    ok('다시 그리면 배지도 버튼도 사라진다',
      !d.querySelector('#tab-itineraries .iti-src-pending'));

    dom.window.close();
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

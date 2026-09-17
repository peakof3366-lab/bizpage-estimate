/* UM 검증: 내부 견적 산출 화면에서 담당자가 일정을 확인·수정해 견적서와 함께 내보낸다.

   대표 지시(2026-08-19): 「내부 견적 산출 페이지에서 견적을 산출한 직원이 산출 이후에
   직접 일정을 컨트롤해서 견적서와 함께 고객에게 제공할 수 있게」.

   UI~UK에서 만든 견적서별 일정 편집기는 **견적 상세 모달 안에만** 있었다. 그래서
   담당자가 실제로 쓰는 길(산출 → 견적서 받기)에는 손댈 자리가 없었다. 더 나쁜 것은
   그 길이 구조적으로 막혀 있었다는 점이다:

     script.js의 견적서 문서 조립이 recQuoteItinerary에 **savedCourses를 아예 안 넘겼다.**
     그래서 담당자가 견적 상세에서 일정을 정성껏 고쳐 저장해도 **산출 화면에서 뽑은
     견적서에는 실릴 수 없었다.** 늘 목적지 공통(대부분 아무도 손 안 댄 기본값)이 나갔다.
     화면을 아무리 고쳐도 여기가 그대로면 아무 소용이 없다 — 이 파일의 [2]가 그 자리다.

   여기서 고정하는 것:
   ① quoteItiSet/Clear 계약 — 이 값이 **어느 견적의 것인지** 증명되지 않으면 안 쓴다.
   ② **견적서에 전용 일정이 실제로 실린다** (문서를 만들어 그 안을 본다).
   ③ id가 다르면 안 실린다 — 조건을 고쳐 다시 산출했을 때 앞 고객의 일정이 따라가지 않는다.
   ④ 다시 산출하면 앞 견적의 확인 기록이 지워진다(값·화면 양쪽).
   ⑤ 산출 완료 카드가 「지금 무엇이 나가는가」를 말한다 — 확인 안 했으면 안 했다고 한다.
   ⑥ 서버 저장이 실패한 견적에는 편집기를 열지 않고 그 사실을 말한다(결함 생성기 ②).
   ⑦ 편집기는 admin.html 한 곳뿐이다 — 산출 화면은 창구를 부를 뿐이고, 저장 결과가
      돌아와 견적서에 실린다.
   ⑧ 이 화면만 따로 연 경우에도 막다른 안내로 끝내지 않는다.

   실행: node ai-loop/test_uM_quote_tool_itinerary.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');
const { adminSource } = require('./_admin_source');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const day = (n, t) => ({ day: n, title: t, am: t + ' 오전', pm: t + ' 오후', eve: '석식', tip: '' });
/* 담당자가 확인해 저장한 전용 일정 — 제목이 기본값과 확실히 다르게 둔다.
   그래야 견적서에서 "어느 층이 나갔는지"를 눈으로 가릴 수 있다. */
const SAVED = [
  { title: '작성자가확인한코스가', subtitle: '전용설명', highlights: ['전용하나'],
    days: [day(1, '전용도착'), day(2, '전용둘째'), day(3, '전용귀국')] },
  { title: '작성자가확인한코스나', subtitle: '전용설명나', highlights: ['전용둘'],
    days: [day(1, '전용나도착'), day(2, '전용나귀국')] },
];

/* ── 산출 화면 부팅 ────────────────────────────────────────────────────
   ⚠ 소스를 읽어 "키가 있다"로 끝내지 않는다. 이 저장소가 반복해서 당한 것이
     '실행된 적 없는 안전망'(결함 생성기 ③)이라, 실제로 폼을 채워 산출하고
     견적서를 만들어 그 안을 본다. */
function bootQuoteTool(opts) {
  const o = opts || {};
  const calls = { quotePosts: 0 };
  /* ⚠ 2026-09-17: 받침을 고객 화면으로 바꿨다 — 담당자 산출 화면(고객용)을
     지운 날이다. 여기서 재는 것은 `script.js`의 전용 일정 → 팝업 견적서 경로라
     부르는 화면이 바뀔 그 계약은 그대로다. */
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u) => {
        const s = String(u);
        if (s.includes('account?action=me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '홍길동', role: 'staff' }) });
        }
        if (s.includes('/api/quotes')) {
          calls.quotePosts++;
          /* 저장 실패를 흉내낸다 — submitLead가 재시도 끝에 false를 돌려준다. */
          if (o.saveFail) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
        }
        return new Promise(() => {});
      };
      w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
      w.Element.prototype.scrollIntoView = function () {};
      /* 견적서는 새 창에 write한다 — 창을 흉내내되 쓰인 HTML을 모아둔다 */
      w.__written = '';
      w.open = () => ({ document: { write(h) { w.__written += h; }, close() {} }, focus() {} });
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.alert = () => {}; w.confirm = () => true;
    },
  });
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js');
  try { dom.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  return { dom, w: dom.window, d: dom.window.document, calls };
}

/* ⚠ STEP 1을 채우고 「다음 단계로」를 눌러야 STEP 2가 열린다 — 실제 담당자의 순서
   그대로다(test_qA와 같은 방식). 건너뛰면 제출이 막혀 확인 카드가 안 뜨고,
   그러면 이 테스트는 아무것도 검사하지 못한 채 '통과'한다. */
const fillForm = (w, d, destKey) => {
  const sel = d.getElementById('destination');
  sel.value = destKey;
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  d.getElementById('participants').value = '20';
  d.getElementById('days').value = '5';
  /* ⚠ 고객 화면은 출발일이 **필수**다(내부 도구에서만 풀렸던 제약) */
  {
    const sd = d.getElementById('startDate');
    const t = new Date(); t.setDate(t.getDate() + 30);
    if (sd) sd.value = t.toLocaleDateString('sv-SE');
  }
  d.getElementById('nextStepButton').click();
  d.getElementById('organization').value = '테스트기업';
  d.getElementById('contactName').value = '김담당';
  /* WC: 연락처가 필수가 됐다 — 대장에서 담당자 부재 시 이어받는 데 쓴다.
     ⚠ 이 값은 견적서·링크에 안 실린다(payload 밖으로 간다). */
  d.getElementById('contactTel').value = '010-1234-5678';
  d.getElementById('requestDetails').value = '연수 문의';
};
const submitForm = async (w, d) => {
  d.getElementById('estimateForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 200));
};

(async () => {
  /* ── [1] 값의 계약 ─────────────────────────────────────────────────── */
  console.log('\n[1] quoteItiSet / quoteItiClear — 어느 견적의 것인지 증명한다');
  {
    const { dom, w } = bootQuoteTool();
    await new Promise((r) => setTimeout(r, 200));

    ok('처음에는 비어 있다 (고객 계산기와 같은 상태)', !w.__QUOTE_ITI__);
    w.quoteItiSet('q1', { courses: SAVED, days: 5, confirmedBy: '홍길동' });
    ok('① 담은 값에 견적 id가 함께 남는다',
      w.__QUOTE_ITI__ && w.__QUOTE_ITI__.quoteId === 'q1', JSON.stringify(w.__QUOTE_ITI__ || null));
    ok('① 코스와 일수, 확인자가 그대로 남는다',
      w.__QUOTE_ITI__.courses.length === 2 && w.__QUOTE_ITI__.days === 5
      && w.__QUOTE_ITI__.confirmedBy === '홍길동');

    /* 빈 값으로 덮어쓰면 남아 있으면 안 된다 — 반쪽짜리가 견적서에 실린다. */
    w.quoteItiSet('q1', { courses: [], days: 5 });
    ok('① 코스가 빈 값이면 담지 않고 지운다 (반쪽이 나가지 않는다)', !w.__QUOTE_ITI__);

    w.quoteItiSet('q1', { courses: SAVED, days: 5 });
    w.quoteItiClear();
    ok('① 지우면 비워진다', !w.__QUOTE_ITI__);
    dom.window.close();
  }

  /* ── [2] 진짜 막혀 있던 자리 ────────────────────────────────────────── */
  console.log('\n[2] 산출 화면에서 뽑은 견적서에 전용 일정이 실리는가');
  {
    const { dom, w, d } = bootQuoteTool();
    await new Promise((r) => setTimeout(r, 250));
    fillForm(w, d, '도쿄');
    await submitForm(w, d);
    ok('산출이 끝나 견적 id가 생겼다', !!w._lastQuoteId, String(w._lastQuoteId));

    /* (a) 확인하지 않은 상태 — 기준선. 목적지 공통 일정이 나간다. */
    w.__written = '';
    w.openEstimateWindow();
    const plain = w.__written;
    ok('기준선: 확인하지 않으면 목적지 공통 일정이 나간다',
      plain.length > 2000 && !plain.includes('작성자가확인한코스가'), String(plain.length));

    /* (b) 담당자가 확인·저장한 일정이 있으면 **그것이** 나가야 한다.
       ⚠ 예전에는 여기서 아무리 값을 담아도 견적서가 안 바뀌었다 — savedCourses를
         안 넘겼기 때문이다. 이 한 줄이 이 작업 전체의 목적이다. */
    w.quoteItiSet(w._lastQuoteId, { courses: SAVED, days: 5, confirmedBy: '홍길동' });
    w.__written = '';
    w.openEstimateWindow();
    const withIti = w.__written;
    ok('② **확인한 일정이 견적서에 실린다**',
      withIti.includes('작성자가확인한코스가'), String(withIti.length));
    ok('② 코스 B도 확인한 것이 나간다', withIti.includes('작성자가확인한코스나'));
    ok('② 일자 내용도 그대로 실린다', withIti.includes('전용도착'));
    ok('② 일정 섹션이 실제로 살아 있다', withIti.includes('RECOMMENDED ITINERARY'));

    /* (c) 남의 일정이 따라가지 않는가 — 두 겹 방어 중 바깥쪽 */
    w.__QUOTE_ITI__ = { quoteId: '다른견적id', courses: SAVED, days: 5 };
    w.__written = '';
    w.openEstimateWindow();
    ok('③ **id가 다르면 싣지 않는다** (앞 고객의 일정이 따라가지 않는다)',
      !w.__written.includes('작성자가확인한코스가'));

    /* (d) 다시 산출하면 앞 견적의 확인 기록이 사라진다 — 안쪽 방어 */
    w.quoteItiSet(w._lastQuoteId, { courses: SAVED, days: 5 });
    const before = w._lastQuoteId;
    fillForm(w, d, '도쿄');
    await submitForm(w, d);
    ok('④ 다시 산출하면 새 견적이 만들어진다', w._lastQuoteId !== before);
    ok('④ 앞 견적에서 확인한 일정이 지워진다', !w.__QUOTE_ITI__);
    w.__written = '';
    w.openEstimateWindow();
    ok('④ 그래서 새 견적서에는 앞 고객의 일정이 없다',
      !w.__written.includes('작성자가확인한코스가'));
    dom.window.close();
  }

  /* ── [3] 산출 완료 카드 ─────────────────────────────────────────────── */
  /* ⚠ 2026-09-17 — 여기 있던 [3] · [4](산출 완료 카드 · 저장 안 된 견적의 안내)는
     「자동 견적 산출 (고객용)」 화면의 UI만 보던 것이라 화면과 함께 걷었다.
     🔴 그 둘이 지키던 약속 자체(「저장 안 된 건에는 일정을 못 붙인다」)는
     남은 내부직원용에서 `test_zQ`의 [17-e](저장 실패를 그 자리에서 말한다)가
     받고 있다 — 검사를 지우면서 약속까지 지우지 않았다는 뜻이다. */

  console.log('\n[5] 편집기는 admin.html 한 곳뿐이다');
  {
    /* 🔴 편집기를 **두 벌 만들지 않는다** — 칸 구성·일수 맞춤·저장 규칙이
       갈라지면 한쪽만 고쳐진다(결함 생성기 ①).
       ⚠ 2026-09-17: 보는 대상을 지운 화면에서 **남은 담당자 화면**으로 옮겼다.
       🔴 내부직원용에도 날짜별 칸이 있지만 그건 **견적서 링크의 일정표 탭**이지
         이 검사가 말하는 「추천 코스 편집기」(itinerary_overrides)가 아니다.
         그래서 그 편집기의 지문(`eqRenderDay`·코스 저장)만 없는지를 재다. */
    const pro = read('admin-quote-pro.html');
    ok('⑦ 남은 산출 화면이 추천 코스 편집기를 복제하지 않았다',
      !/iti-day-grid|eqRenderDay/.test(pro));
    ok('⑦ 추천 코스를 직접 저장하지도 않는다 (itinerary_overrides는 admin.html의 일이다)',
      !/itinerary_overrides|action=itineraries/.test(pro));

    const admin = adminSource();
    ok('⑦ 창구는 admin.html에 있다', /window\.openQuoteItineraryEditor\s*=/.test(admin));
    ok('⑦ 편집기 본체(일자 카드 그리기)도 admin.html에만 있다', /function eqRenderDay/.test(admin));
  }

  /* ── [6] 창구를 부르면 편집기가 열리고, 저장 결과가 돌아온다 ─────────── */
  console.log('\n[6] 창구 → 편집기 → 저장 결과 돌려주기');
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
    if (!injected) throw new Error('emCurrentId를 선언한 스크립트 블록을 찾지 못했습니다');

    const dom = new JSDOM(patched, {
      runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(w) {
        w.fetch = (u, opt) => {
          const s = String(u);
          const method = (opt && opt.method) || 'GET';
          if (s.includes('action=itineraries') && method === 'GET') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({
              overrides: {}, recOverrides: {}, meta: {} }) });
          }
          if (/\/api\/quotes\//.test(s) && method === 'PATCH') {
            const b = JSON.parse(opt.body);
            if (b.addLog) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, entry: b.addLog }) });
            net.patched = b;
            return Promise.resolve({ ok: true, json: () => Promise.resolve(b.itinerary === null
              ? { ok: true, removed: true }
              : { ok: true, itinerary: Object.assign({}, b.itinerary, {
                  confirmedBy: '서버가준이름', confirmedAt: '2026-08-19T00:00:00.000Z' }) }) });
          }
          return new Promise(() => {});
        };
        const c = new Proxy({}, { get: () => (() => c) });
        w.HTMLCanvasElement.prototype.getContext = () => c;
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      },
    });
    if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
    await new Promise((r) => setTimeout(r, 80));
    const w = dom.window, d = w.document;
    w.__login();
    w.localStorage.setItem('linkedt_estimates_full', JSON.stringify([{
      id: 'q1', ts: '2026-08-19T00:00:00.000Z', destKey: '도쿄', destLabel: '도쿄',
      program: 'industry', participants: 20, days: 5, total: 20000000,
      orgName: '테스트기업', contact: '홍길동', items: [],
    }]));

    ok('⑦ 창구가 실제로 노출돼 있다', typeof w.openQuoteItineraryEditor === 'function');

    let handed = 'not-called';
    await w.openQuoteItineraryEditor('q1', { onSaved: (iti) => { handed = iti; } });
    ok('⑦ 창구를 부르면 편집기 모달이 열린다',
      !d.getElementById('eqModal').classList.contains('hidden'));
    ok('⑦ 어느 견적인지 화면에 적힌다',
      /테스트기업/.test(d.getElementById('eq-head').textContent),
      d.getElementById('eq-head').textContent);
    ok('⑦ 일자 카드가 견적 일수(5일)만큼 코스 두 벌로 그려진다',
      d.querySelectorAll('#eq-body .iti-day').length === 10,
      String(d.querySelectorAll('#eq-body .iti-day').length));

    /* 작성자가 한 칸 고치고 저장한다 */
    const inp = d.querySelector('#eq-body .iti-day-body .iti-inp');
    inp.value = '작성자가 고친 제목';
    inp.dispatchEvent(new w.Event('input'));
    await w.eqSave();
    ok('⑦ 저장 본문이 서버로 나간다',
      !!net.patched && net.patched.itinerary.courses.length === 2);
    ok('⑦ **저장 결과가 산출 화면으로 돌아온다** (안 돌려주면 견적서에 안 실린다)',
      handed && Array.isArray(handed.courses) && handed.courses.length === 2,
      JSON.stringify(handed).slice(0, 80));
    ok('⑦ 돌려주는 값은 서버가 확정한 것이다 (화면이 지어내지 않는다)',
      handed.confirmedBy === '서버가준이름', String(handed && handed.confirmedBy));
    ok('⑦ 작성자가 고친 값이 그 안에 있다',
      handed.courses[0].days[0].title === '작성자가 고친 제목',
      handed.courses[0].days[0].title);

    /* 되돌리기도 알려야 한다 — 안 알리면 지워진 일정을 계속 실어 보낸다 */
    handed = 'not-called';
    await w.eqRevert();
    ok('⑦ 되돌리면 산출 화면에 null을 돌려준다 (지워진 일정을 계속 싣지 않는다)',
      handed === null, JSON.stringify(handed));

    /* 견적 상세 요약 줄 */
    w.openEstDetail('q1');
    ok('⑦ 견적 상세는 전용 일정이 없으면 공통이 나간다고 적는다',
      /목적지 공통 일정이 나갑니다/.test(d.getElementById('em-iti-state').textContent),
      d.getElementById('em-iti-state').textContent);
    dom.window.close();
  }

  /* ── [7] 이 화면만 따로 연 경우 ─────────────────────────────────────── */
  console.log('\n[7] 산출 화면만 따로 연 경우');
  {
    /* 🔴 2026-09-17 — 이 깊은 링크를 **부르던 쪽이 없어졌다.**
       「자동 견적 산출 (고객용)」을 단독으로 열었을 때만 쓰던 길이었고,
       그 화면을 지웠다. **받는 자리는 일부러 남겨 둔다** — 견적 id로 편집기를
       여는 주소는 그 자체로 쓸모가 있고, 부팅 순서(권한 적용 → 탭 복원)가
       이 함수 위치에 엮혀 있어 뗼 때 잎을 위험이 더 크다.
       ⚠ 부르는 곳이 없는 길이라는 것을 여기 적어 둔다 — 나중에 「왜 있지」를 묻게 된다. */
    const admin = adminSource();
    ok('⑧ 그 주소로 들어오면 받아 주는 자리가 있다',
      /#quote-iti=/.test(admin) && /function aqHandleItiHash/.test(admin));
    ok('⑧ 부팅할 때 실제로 불린다 — 만들어만 두지 않는다',
      /\n\s*aqHandleItiHash\(\);/.test(admin));
    ok('⑧ 주소에 남겨 두지 않는다 (새로고침마다 다시 열리면 안 된다)',
      /history\.replaceState/.test(admin));
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

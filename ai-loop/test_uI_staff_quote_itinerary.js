/* UI 검증: 직원이 발급하는 견적서에도 일정이 실린다 — 그리고 작성자가 마지막에 본다.

   왜 —
   고객 계산기로 나간 견적서에는 일정(itiA·itiB)이 실렸는데, **직원이 관리자 →
   견적 관리에서 발급하는 견적서에는 그 키 자체가 없었다.** 조립 규칙이 script.js
   안에만 있었고 admin.html은 script.js를 싣지 않기 때문이다(결함 생성기 ①).
   같은 회사가 두 종류의 견적서를 내보내는 상태였다.

   그리고 그 경로에는 결함이 하나 더 있었다: 공유 페이로드의 `dk`가
   `rec.destination`을 읽는데 **견적 기록에 그런 필드가 없다**(운영 DB 9건 전수 확인 —
   실제 필드는 `destKey`). `api/quote-shares`는 `!share.dk`면 400 invalid_share로
   막으므로, **직원 링크 발급은 한 번도 성공한 적이 없다.** 운영 DB의 공유 10건이
   전부 고객 계산기 경로인 것이 그 증거다. `dt`가 destLabel로 먼저 채워져서
   화면상으로는 멀쩡해 보였다.

   여기서 고정하는 것:
   ① recQuoteItinerary가 공유 페이로드 모양(t·s·h·d)을 그대로 만든다.
   ② 코스가 없는 목적지에서 터지지 않는다(null) — 예전 TypeError 사고와 같은 자리.
   ③ 고른 일수에 맞춰 귀국일이 **항상 마지막 날**에만 온다.
   ④ 코스 원본(source 등 내부 표시)이 공유 페이로드에 새지 않는다.
   ⑤ 견적서에서 읽은 일정이 있으면 그것만 나간다(TC 규칙을 그대로 지난다).
   ⑥ admin.html 발급이 `dk`를 destKey로 싣는다 — 400을 만들던 자리.
   ⑦ admin.html 발급이 itiA·itiB를 싣는다.
   ⑧ **작성자가 확인을 취소하면 발급 요청이 아예 나가지 않는다.**
   ⑨ 담당자가 저장한 오버라이드가 실린다 — 기본값이 나가면 안 된다.
   ⑩ 코스가 없는 목적지도 발급은 되고, 그때 itiA는 null이다.

   실행: node ai-loop/test_uI_staff_quote_itinerary.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');
const { recQuoteItinerary } = require(path.join(ROOT, 'rec_fallbacks.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 픽스처 ─────────────────────────────────────────────────────────────
   코스는 실제 ITINERARY_DB와 같은 모양으로 둔다(마지막 날 = 귀국). */
const day = (n, t) => ({ day: n, title: t, am: t + ' 오전', pm: t + ' 오후', eve: '석식', tip: '' });
const COURSE_A = { title: '코스가', subtitle: '설명가', highlights: ['하나', '둘', '셋'],
  days: [day(1, '도착'), day(2, '둘째'), day(3, '셋째'), day(4, '넷째'), day(5, '귀국')] };
const COURSE_B = { title: '코스나', subtitle: '설명나', highlights: ['넷'],
  days: [day(1, '도착나'), day(2, '둘째나'), day(3, '귀국나')] };
const FROM_QUOTE = { title: '견적서코스', subtitle: '견적서설명', highlights: ['다섯'],
  source: 'quote', days: [day(1, '견도착'), day(2, '견귀국')] };

const TABLES = {
  itineraryDb: { '도쿄': [COURSE_A, COURSE_B], '외톨이': [COURSE_A] },
  priority: {},
  destRec: { '도쿄': { a: { items: ['활동가', '활동나'] }, b: { items: ['활동다'] } } },
};

console.log('\n[1] recQuoteItinerary — 조립 규칙 한 곳');

const snap5 = recQuoteItinerary(TABLES, { destKey: '도쿄', programType: 'industry', totalDays: 5 });
ok('① 공유 페이로드 모양(t·s·h·d)을 그대로 만든다',
  snap5 && Object.keys(snap5.a).sort().join(',') === 'd,h,s,t',
  snap5 ? Object.keys(snap5.a).join(',') : 'null');
ok('① 코스 제목·설명·하이라이트가 그대로 온다',
  snap5.a.t === '코스가' && snap5.a.s === '설명가' && snap5.a.h.length === 3);
ok('① 방식 B는 두 번째 코스에서 온다', snap5.b.t === '코스나');

ok('② 코스가 없는 목적지는 null (터지지 않는다)',
  recQuoteItinerary(TABLES, { destKey: '없는곳', programType: 'industry', totalDays: 5 }) === null);
ok('② 표 자체가 비어도 null',
  recQuoteItinerary({}, { destKey: '도쿄', programType: 'industry', totalDays: 5 }) === null);
ok('② 코스가 하나뿐이면 A·B 둘 다 그 코스',
  (() => { const s = recQuoteItinerary(TABLES, { destKey: '외톨이', programType: 'industry', totalDays: 4 });
    return s && s.a.t === '코스가' && s.b.t === '코스가'; })());

const snap7 = recQuoteItinerary(TABLES, { destKey: '도쿄', programType: 'industry', totalDays: 7 });
ok('③ 7일을 고르면 7일이 나온다', snap7.a.d.length === 7, String(snap7.a.d.length));
ok('③ 귀국일이 마지막 날에만 온다 (중간에 안 나온다)',
  snap7.a.d[6].title === '귀국' && !snap7.a.d.slice(0, 6).some(x => x.title === '귀국'),
  snap7.a.d.map(x => x.title).join(' / '));
ok('③ 3일로 줄여도 마지막이 귀국이다',
  (() => { const s = recQuoteItinerary(TABLES, { destKey: '도쿄', programType: 'industry', totalDays: 3 });
    return s.a.d.length === 3 && s.a.d[2].title === '귀국'; })());
ok('③ 늘어난 날은 방식 A의 활동 목록으로 채운다',
  snap7.a.d[4].title === '활동가' && snap7.a.d[5].title === '활동나',
  snap7.a.d[4].title + ' / ' + snap7.a.d[5].title);

ok('④ 코스 원본은 courses에만 있고 a·b에는 안 섞인다',
  snap5.courses[0] === COURSE_A && snap5.a.days === undefined && snap5.a.source === undefined);
ok('④ 공유 페이로드를 직렬화해도 source가 안 새어 나간다',
  !JSON.stringify({ itiA: snap5.a, itiB: snap5.b }).includes('source'));

const qTables = { ...TABLES, itineraryDb: { '도쿄': [COURSE_A, COURSE_B, FROM_QUOTE] } };
const snapQ = recQuoteItinerary(qTables, { destKey: '도쿄', programType: 'industry', totalDays: 4 });
ok('⑤ 견적서에서 읽은 코스가 있으면 그것만 나간다 (TC)',
  snapQ.a.t === '견적서코스' && snapQ.b.t === '견적서코스', snapQ.a.t + ' / ' + snapQ.b.t);
ok('⑤ 그 사실을 화면이 말할 수 있게 알려 준다',
  snapQ.fromQuoteDoc === true && snap5.fromQuoteDoc === false);

/* ── 폴백 사슬 4층 (UJ) ────────────────────────────────────────────────
   ⚠ 순서가 뒤집히면 작성자가 이 견적서에만 쓴 일정이 목적지 공통에 묻힌다. */
console.log('\n[1-b] 어느 층에서 오는가');
const SAVED = [{ title: '전용코스가', subtitle: '전용설명', highlights: ['전용'],
  days: [day(1, '전용도착'), day(2, '전용중간'), day(3, '전용귀국')] }];

const sSaved = recQuoteItinerary({ ...qTables, savedCourses: SAVED },
  { destKey: '도쿄', programType: 'industry', totalDays: 3 });
ok('전용 일정이 있으면 그것이 이긴다 (견적서 코스보다도 세다)',
  sSaved.origin === 'saved' && sSaved.a.t === '전용코스가', sSaved.origin + ' / ' + sSaved.a.t);
ok('전용 일정은 목적지 공통의 일별 활동으로 덮이지 않는다',
  sSaved.a.d[1].title === '전용중간', sSaved.a.d[1].title);
ok('전용 일정이 하나뿐이면 A·B 둘 다 그것',
  sSaved.b.t === '전용코스가');
ok('빈 배열은 전용 일정이 아니다 (아래층으로 물러난다)',
  recQuoteItinerary({ ...TABLES, savedCourses: [] },
    { destKey: '도쿄', programType: 'industry', totalDays: 5 }).origin === 'default');

ok('견적서에서 읽은 코스가 있으면 quoteDoc', snapQ.origin === 'quoteDoc', snapQ.origin);
ok('담당자 수정본이 있는 목적지는 override',
  recQuoteItinerary({ ...TABLES, editedDestKeys: ['도쿄'] },
    { destKey: '도쿄', programType: 'industry', totalDays: 5 }).origin === 'override');
ok('아무도 안 고쳤으면 default (그 사실을 숨기지 않는다)', snap5.origin === 'default');
ok('네 층 모두 사람이 읽을 이름을 갖는다',
  [sSaved, snapQ, snap5].every(s => typeof s.originLabel === 'string' && s.originLabel.length > 3));

ok('저장 후 견적 일수가 바뀌면 그 사실을 알린다',
  recQuoteItinerary({ ...TABLES, savedCourses: SAVED, savedDays: 3 },
    { destKey: '도쿄', programType: 'industry', totalDays: 5 }).daysChanged === true);
ok('일수가 그대로면 조용하다',
  sSaved.daysChanged === false);

/* ── admin.html 실제 발급 경로 ──────────────────────────────────────────
   ⚠ 소스를 읽어 "키가 있다"로 끝내지 않는다. 이 저장소가 반복해서 당한 것이
     '실행된 적 없는 안전망'(결함 생성기 ③)이라, 실제로 발급을 눌러 서버로 나간
     본문을 받아 본다. */
const OVERRIDE_COURSE = { title: '담당자가고친코스', subtitle: '수정본', highlights: ['수정'],
  days: [day(1, '수정도착'), day(2, '수정귀국')] };

async function bootAdmin(net, opts) {
  const o = opts || {};
  const html = htmlWithDeps('admin.html');
  /* 로그인 상태를 흉내 낸다 — openEstDetail·진행 기록이 currentUser를 읽는다.
     안 넣으면 픽스처가 실제 화면과 다른 상태로 돌고, 그러면 이 테스트가
     "로그인한 담당자가 쓰는 경로"를 검사하지 못한다. */
  const EXPOSE = `
;try{
  window.__setCurrent = (id) => { emCurrentId = id; };
  window.__login = () => { currentUser = { id: '1', username: 'admin',
    displayName: '테스트담당', role: 'owner' }; };
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
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
          net.itiFetched = (net.itiFetched || 0) + 1;
          if (o.itiFails) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            overrides: o.overrides || {}, recOverrides: {}, meta: {} }) });
        }
        if (s.includes('quote-shares')) {
          net.issued = JSON.parse(opt.body);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, id: 'sid1', verdict: 'verified' }) });
        }
        if (/\/api\/quotes\//.test(s) && method === 'PATCH') {
          const b = JSON.parse(opt.body);
          if (b.addLog) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, entry: b.addLog }) });
          net.patched = b;
          /* 서버가 하듯 확인 기록을 붙여 돌려준다 — 화면이 그 값을 그대로 쓰는지 본다. */
          return Promise.resolve({ ok: true, json: () => Promise.resolve(b.itinerary === null
            ? { ok: true, removed: true }
            : { ok: true, itinerary: { ...b.itinerary, confirmedBy: '서버가준이름',
                confirmedAt: '2026-08-18T00:00:00.000Z' } }) });
        }
        return new Promise(() => {});
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = (msg) => { net.confirms = (net.confirms || []).concat(msg); return o.confirm !== false; };
      w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

/* 견적 기록은 script.js가 저장하는 모양 그대로 둔다 — 여기서 모양을 바꾸면
   픽스처가 실제와 달라져 이 테스트가 아무것도 못 잡는다. */
function seedQuote(w, over) {
  const rec = Object.assign({
    id: 'q1', ts: new Date().toISOString(),
    destKey: '도쿄', destLabel: '도쿄', program: 'industry', programLabel: '산업시찰',
    participants: 20, days: 5, nights: 4, total: 20000000, perPerson: 1000000,
    orgName: '테스트기업', contact: '홍길동', request: '',
    items: [{ name: '항공료', amount: 8000000, isHidden: false },
            { name: 'ENBT 수익', amount: 1000000, isHidden: true }],
  }, over || {});
  w.localStorage.setItem('linkedt_estimates_full', JSON.stringify([rec]));
  w.__login();
  w.__setCurrent('q1');
  return rec;
}

(async () => {
  console.log('\n[2] admin.html — 직원 발급 경로');

  /* ⑥⑦ 기본 경로 */
  {
    const net = {};
    const dom = await bootAdmin(net, {});
    const w = dom.window;
    seedQuote(w);
    await w.issueShareLink();
    const share = net.issued && net.issued.share;

    ok('⑥ dk를 destKey로 싣는다 (400 invalid_share를 만들던 자리)',
      !!share && share.dk === '도쿄', share ? String(share.dk) : '요청 없음');
    ok('⑥ 서버가 막지 않을 조건을 만족한다 (dk가 truthy)', !!(share && share.dk));
    ok('⑦ itiA·itiB가 실려 나간다',
      !!(share && share.itiA && share.itiB), share ? JSON.stringify(Object.keys(share)) : '');
    ok('⑦ 일자 수가 견적 일수(5일)와 같다',
      share.itiA.d.length === 5, String(share.itiA && share.itiA.d.length));
    ok('⑦ 비공개 항목은 그대로 걸러진다 (일정을 넣으면서 깨지 않았다)',
      share.rows.length === 1 && share.rows[0][0] === '항공료');
    ok('② 작성자에게 일정을 보여주고 확인을 받는다',
      (net.confirms || []).some(m => /일정/.test(m) && /코스 A/.test(m)),
      JSON.stringify((net.confirms || []).map(m => String(m).slice(0, 20))));
    dom.window.close();
  }

  /* ⑧ 작성자가 취소하면 아무것도 안 나간다 */
  {
    const net = {};
    const dom = await bootAdmin(net, { confirm: false });
    const w = dom.window;
    seedQuote(w);
    await w.issueShareLink();
    ok('⑧ 작성자가 확인을 취소하면 발급 요청이 아예 안 나간다', !net.issued);
    dom.window.close();
  }

  /* ⑨ 담당자 수정본이 실린다 */
  {
    const net = {};
    const dom = await bootAdmin(net, { overrides: { '도쿄': [OVERRIDE_COURSE] } });
    const w = dom.window;
    seedQuote(w);
    await w.issueShareLink();
    const share = net.issued && net.issued.share;
    ok('⑨ 담당자가 저장한 일정이 실린다 (기본값이 나가면 안 된다)',
      !!share && share.itiA.t === '담당자가고친코스', share ? share.itiA.t : '요청 없음');
    ok('⑨ 발급할 때마다 서버에서 새로 읽는다 (동료가 방금 고친 것)',
      net.itiFetched >= 1, String(net.itiFetched));
    dom.window.close();
  }

  /* ⑨-b 오버라이드를 못 읽으면 그 사실을 작성자에게 말한다 (결함 생성기 ②) */
  {
    const net = {};
    const dom = await bootAdmin(net, { itiFails: true });
    const w = dom.window;
    seedQuote(w);
    await w.issueShareLink();
    ok('⑨ 수정본을 못 불러오면 조용히 넘어가지 않고 작성자에게 말한다',
      (net.confirms || []).some(m => /불러오지 못/.test(m)),
      JSON.stringify((net.confirms || []).map(m => String(m).slice(0, 40))));
    dom.window.close();
  }

  /* UJ: 견적서 전용 일정이 저장돼 있으면 그것이 나간다 */
  {
    const net = {};
    const dom = await bootAdmin(net, { overrides: { '도쿄': [OVERRIDE_COURSE] } });
    const w = dom.window;
    seedQuote(w, { itinerary: { courses: SAVED, days: 5, confirmedBy: '김담당' } });
    await w.issueShareLink();
    const share = net.issued && net.issued.share;
    ok('전용 일정이 목적지 공통(수정본)을 이긴다',
      !!share && share.itiA.t === '전용코스가', share ? share.itiA.t : '요청 없음');
    ok('확인 화면이 전용 일정이라고 말한다',
      (net.confirms || []).some(m => /이 견적서 전용/.test(m)));
    dom.window.close();
  }

  /* ⑩ 코스가 없는 목적지 */
  {
    const net = {};
    const dom = await bootAdmin(net, {});
    const w = dom.window;
    seedQuote(w, { destKey: '코스없는곳', destLabel: '코스없는곳' });
    await w.issueShareLink();
    const share = net.issued && net.issued.share;
    ok('⑩ 코스가 없어도 발급은 되고 금액은 그대로 나간다',
      !!share && share.t === 20000000);
    ok('⑩ 그때 itiA는 null이다 (estimate-view가 섹션만 뺀다)',
      share.itiA === null && share.itiB === null);
    ok('⑩ 일정이 안 실린다는 사실을 작성자에게 먼저 말한다',
      (net.confirms || []).some(m => /일정이 실리지 않/.test(m)));
    dom.window.close();
  }

  /* ── [2-b] 견적서별 일정 편집기 (UJ) ──────────────────────────────────
     대표 지시: 「작성하는 사람이 손쉽게 접근해 견적서와 함께 제공할 수 있는 구조」.
     여기서 고정하는 것 — 출발점이 지금 나갈 일정이고, 저장하면 이 견적서에만 남고,
     되돌리면 목적지 공통으로 돌아가고, **다음 견적을 열면 앞 견적 것이 안 남는다.** */
  console.log('\n[2-b] 견적서별 일정 편집기');
  {
    const net = {};
    const dom = await bootAdmin(net, { overrides: { '도쿄': [OVERRIDE_COURSE] } });
    const w = dom.window, d = w.document;
    seedQuote(w);
    await w.eqToggle();

    const dayCards = d.querySelectorAll('#eq-body .iti-day');
    ok('출발점이 지금 이 견적서에 나갈 일정이다 (백지가 아니다)',
      d.querySelector('#eq-origin').textContent.includes('담당자 수정본'),
      d.querySelector('#eq-origin').textContent);
    ok('일자 수가 견적 일수(5일)와 같다 — 코스 A·B 두 벌',
      dayCards.length === 10, String(dayCards.length));
    ok('자동으로 채워진 날은 그렇다고 표시한다',
      Array.from(d.querySelectorAll('#eq-body .iti-day-blank'))
        .some(el => /자동 생성/.test(el.textContent)));

    /* 작성자가 한 칸을 고친다 */
    const ta = d.querySelector('#eq-body .iti-day-body .iti-inp');
    ta.value = '작성자가 고친 제목';
    ta.dispatchEvent(new w.Event('input'));
    ok('고치면 저장하지 않은 편집이라고 알린다',
      /저장하지 않은/.test(d.getElementById('eq-msg').textContent));

    await w.eqSave();
    ok('저장 본문이 코스 두 벌과 일수를 담는다',
      !!net.patched && net.patched.itinerary.courses.length === 2
      && net.patched.itinerary.days === 5);
    ok('작성자가 고친 값이 실제로 나간다',
      net.patched.itinerary.courses[0].days[0].title === '작성자가 고친 제목',
      net.patched.itinerary.courses[0].days[0].title);
    ok('확인자는 서버가 준 이름을 쓴다 (화면이 지어내지 않는다)',
      JSON.parse(w.localStorage.getItem('linkedt_estimates_full'))[0]
        .itinerary.confirmedBy === '서버가준이름');
    dom.window.close();
  }

  /* 되돌리기 + 다음 견적으로 넘어갈 때 초기화 */
  {
    const net = {};
    const dom = await bootAdmin(net, {});
    const w = dom.window, d = w.document;
    seedQuote(w, { itinerary: { courses: SAVED, days: 5, confirmedBy: '김담당' } });
    await w.eqToggle();
    ok('저장된 전용 일정을 열면 그것이 출발점이다',
      d.querySelector('#eq-origin').textContent.includes('이 견적서 전용'),
      d.querySelector('#eq-origin').textContent);
    await w.eqRevert();
    ok('되돌리면 서버에 null을 보낸다 (잘못 저장한 일정을 걷어낼 수 있다)',
      net.patched && net.patched.itinerary === null);
    ok('되돌린 뒤 편집칸이 닫힌다',
      d.getElementById('eq-body').classList.contains('hidden'));

    /* ⚠ 이게 진짜 사고가 나는 자리다 — 앞 견적의 일정이 남으면 남의 일정이 나간다. */
    const all = JSON.parse(w.localStorage.getItem('linkedt_estimates_full'));
    all.push(Object.assign({}, all[0], { id: 'q2', itinerary: null }));
    w.localStorage.setItem('linkedt_estimates_full', JSON.stringify(all));
    await w.eqToggle();
    w.openEstDetail('q2');
    ok('다른 견적을 열면 앞 견적의 편집 상태가 남지 않는다',
      d.getElementById('eq-body').classList.contains('hidden')
      && d.getElementById('eq-body').innerHTML === ''
      && d.getElementById('eq-toggle').textContent === '불러오기');
    dom.window.close();
  }

  /* ── [3] 견적서 PDF에 일정이 실리는가 ────────────────────────────────
     고객이 결재 보고에 쓰는 건 화면이 아니라 인쇄본이다. 그런데 일정 섹션 전체가
     `no-print`라 **PDF로 뽑으면 일정이 통째로 사라졌다.** 담당자가 다듬은 일정이
     정작 의사결정 문서에는 한 줄도 안 실리고 있었다.
     CSS는 openEstimateWindow가 만드는 문서 안에 있으므로 test_rH와 같은 방식으로 본다. */
  console.log('\n[3] 견적서 PDF (인쇄)');
  const fs = require('fs');
  const scriptSrc = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const docStart = scriptSrc.indexOf('function openEstimateWindow');
  const docSrc = docStart >= 0 ? scriptSrc.slice(docStart) : '';
  const printCss = (docSrc.match(/@media print\{[\s\S]*?\n\}/) || [''])[0];

  ok('견적서 창 코드와 인쇄 규칙을 찾았다', docStart >= 0 && printCss.length > 0);
  ok('일정 섹션에서 no-print를 뗐다 (이게 PDF에서 일정을 지우던 것)',
    /<section id="rec" class="pg-section">/.test(docSrc),
    (docSrc.match(/<section id="rec"[^>]*>/) || [''])[0]);
  ok('인쇄에서 탭 버튼은 숨긴다 (종이에서는 전환할 수 없다)',
    /\.rec-tabs\{display:none!important\}/.test(printCss));
  ok('인쇄에서 사진·갤러리는 뺀다 (잉크만 먹는다)',
    /\.course-cover-img[^{]*\{display:none!important\}/.test(printCss));
  ok('일자 카드가 페이지 사이에서 잘리지 않는다',
    /\.day-card\{[^}]*page-break-inside:avoid/.test(printCss));
  ok('일정은 새 쪽에서 시작한다 (금액 표와 안 섞인다)',
    /#rec\{[^}]*page-break-before:always/.test(printCss));

  /* ── [4] 서버가 무엇을 받아 무엇을 저장하는가 ─────────────────────────
     ⚠ 소스를 읽어 "normalizeCourses를 부른다"로 끝내지 않는다 — 실제로 핸들러를
       불러 저장 본문을 받아 본다(결함 생성기 ③).
     DB·인증은 require 캐시에 가짜를 심어 대신한다. api/content.js도 같은 db 모듈을
     쓰므로 한 번만 심으면 된다. */
  console.log('\n[4] 서버 저장 (api/quotes/[id].js)');
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost/db';
  const calls = [];
  const stub = (rel, exports) => {
    const p = require.resolve(path.join(ROOT, rel));
    require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] };
  };
  const fakeSql = (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  };
  stub('api/_lib/db.js', { sql: fakeSql });
  stub('api/_lib/auth.js', {
    requireAdmin: async (req) => { req.user = { displayName: '서버가아는이름' }; return true; },
    requireRole: async () => true,
  });
  const handler = require(path.join(ROOT, 'api', 'quotes', '[id].js'));

  const callPatch = async (body) => {
    calls.length = 0;
    let out = { status: 0, body: null };
    const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
    await handler({ method: 'PATCH', query: { id: 'q1' }, body }, res);
    return out;
  };

  const goodCourse = { title: '코스가', subtitle: '설명', highlights: ['ㄱ'],
    days: [{ title: '첫날', am: '오전', pm: '오후', eve: '', tip: '' }] };

  {
    const r = await callPatch({ itinerary: { courses: [goodCourse, goodCourse], days: 5 } });
    ok('정상 저장은 200', r.status === 200 && r.body && r.body.ok, JSON.stringify(r.body));
    ok('확인자는 로그인한 사람이다 (클라이언트가 보낸 값이 아니다)',
      r.body.itinerary.confirmedBy === '서버가아는이름', r.body.itinerary.confirmedBy);
    ok('확인 시각이 찍힌다', !!r.body.itinerary.confirmedAt);
    ok('확인 당시 견적 일수를 남긴다 (나중에 일수가 바뀌면 다시 봐야 한다)',
      r.body.itinerary.days === 5);
    ok('일자 번호는 서버가 순서대로 다시 매긴다',
      r.body.itinerary.courses[0].days[0].day === 1);
    ok('update 한 번으로 끝난다', calls.length === 1 && /update quotes set itinerary/.test(calls[0].text),
      String(calls.length));
  }

  {
    /* 클라이언트가 확인자를 자칭해도 서버 값이 이겨야 한다 — 아니면 확인 기록이
       스스로를 증명하지 못한다. */
    const r = await callPatch({ itinerary: { courses: [goodCourse], days: 3, confirmedBy: '내가썼다고침' } });
    ok('클라이언트가 보낸 confirmedBy는 무시된다',
      r.body.itinerary.confirmedBy === '서버가아는이름', r.body.itinerary.confirmedBy);
  }

  {
    const r = await callPatch({ itinerary: null });
    ok('null을 보내면 전용 일정을 지운다 (되돌릴 수 있다)',
      r.status === 200 && r.body.removed === true
      && /update quotes set itinerary = /.test(calls[0].text));
  }

  {
    /* 조용히 잘라내지 않는다 — 잘라내면 작성자는 저장됐다고 믿고 반쪽이 나간다. */
    const bad = [
      ['제목 없는 코스', { courses: [{ title: '  ', days: [{ title: 'a' }] }] }, 'empty_title'],
      ['일자 없는 코스', { courses: [{ title: 'A', days: [] }] }, 'days_empty'],
      ['코스 자체가 빈 배열', { courses: [] }, 'courses_empty'],
      ['코스를 안 보냄', { days: 5 }, 'courses_empty'],
    ];
    for (const [label, body, err] of bad) {
      const r = await callPatch({ itinerary: body });
      ok('거절: ' + label, r.status === 400 && r.body.error === err,
        r.status + ' ' + JSON.stringify(r.body));
      ok('  → 거절했으면 DB를 건드리지 않는다', calls.length === 0, String(calls.length));
    }
  }

  {
    /* itinerary를 안 보낸 호출은 예전 그대로 status/note/assignee만 건드려야 한다 —
       일정을 넣으면서 기존 저장 경로를 깨지 않았다. */
    const r = await callPatch({ status: 'consulting' });
    ok('일정을 안 보내면 기존 저장 경로 그대로다',
      r.status === 200 && /update quotes set/.test(calls[0].text)
      && !/itinerary/.test(calls[0].text), calls[0] && calls[0].text.slice(0, 60));
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

/* QH 검증: 담당자 배정이 **메모 한 줄 저장에 조용히 지워지지 않는가**.

   고친 결함.

   담당자 드롭다운(assigneeSelectHtml)은 활성 직원만 옵션으로 만든다. 지금 배정된
   사람이 그 목록에 없으면 옵션이 없어서 select가 첫 옵션(미배정)을 고른 채로 그려진다.
   그런데 상세 모달 저장(saveDetail·emSaveDetail)은 이 select의 value를 status·note와
   **함께** 서버로 보낸다(PU에서 의도한 동작이다 — 메모를 비운 것과 안 보낸 것을
   구별해야 하므로). 그래서 담당자가 메모만 고쳐 저장해도 배정이 사라진다.

   목록에서 빠지는 경우는 둘 다 평범하다:
     ① 직원 목록 조회 실패(staffList가 401·500) — 전원이 사라져 모든 리드가 '미배정'.
     ② 배정된 사람의 계정이 비활성(퇴사·일시 정지) — 장애가 아니라 정상 운영이다.

   덤으로, 상세 모달 두 곳은 `select.innerHTML = assigneeSelectHtml(...)`로 **<select>
   안에 <select>를 넣고** 있었다. HTML 파서가 중첩 select를 버리고 <option>만 남겨 줘서
   우연히 동작했을 뿐, 겉에 붙인 disabled·title·data-prev는 조용히 사라졌다 — 정작
   저장이 일어나는 화면이 잠기지 않는다. fillAssigneeSelect로 속성을 요소에 직접 건다.

   방식: jsdom으로 admin.html을 띄워 **실제로 상세 모달을 열고 저장 버튼 경로를 태운
   뒤, 서버로 나간 PATCH 본문**을 본다. 화면 상태만 보면 "미배정으로 보였다"까지밖에
   못 보고, 지워졌다는 사실은 못 본다.

   실행: node ai-loop/test_qH_assignee_preserve.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const STAFF = [
  { id: '1', username: 'boss',   display_name: '사장님', role: 'owner',   active: true,  self_signup: false },
  { id: '7', username: 'staff1', display_name: '김직원', role: 'staff',   active: true,  self_signup: false },
  { id: '8', username: 'staff2', display_name: '박퇴사', role: 'staff',   active: false, self_signup: false },
];

const INQUIRY = {
  id: 'inq1', name: '홍길동', org: '○○기업', phone: '010-0000-0000', email: 'a@b.com',
  message: '문의합니다', status: 'unread', read: false, note: '', assignee: '김직원',
  ts: '2026-07-30T01:00:00.000Z',
};

(async () => {
  console.log('[1] 드롭다운이 지금 담당자를 잃지 않는다');

  let dom = await bootAdmin();
  let w = dom.window;

  w.__setStaff(STAFF, false);
  let el = fresh(w, w.assigneeSelectHtml('김직원'));
  ok('활성 담당자는 그대로 선택된다', el.value === '김직원', JSON.stringify(el.value));
  ok('활성 담당자면 잠그지 않는다', el.disabled === false);

  /* ② 비활성 계정 — 장애가 아니라 정상 운영에서 매번 생긴다(퇴사·일시 정지). */
  el = fresh(w, w.assigneeSelectHtml('박퇴사'));
  ok('비활성 담당자도 값이 유지된다', el.value === '박퇴사', JSON.stringify(el.value));
  ok('비활성이라는 사실을 이름 옆에 적는다', /비활성 계정/.test(el.innerHTML), el.innerHTML.slice(0, 160));
  ok('비활성 담당자여도 다른 사람으로 바꿀 수는 있다', el.disabled === false);

  /* ① 목록 조회 실패 — 전원이 사라진다. */
  w.__setStaff([], true);
  el = fresh(w, w.assigneeSelectHtml('김직원'));
  ok('목록을 못 받아도 담당자가 미배정으로 바뀌지 않는다', el.value === '김직원', JSON.stringify(el.value));
  ok('그동안은 담당자 변경을 잠근다', el.disabled === true);
  ok('왜 잠겼는지 말한다', /불러오지 못/.test(el.getAttribute('title') || ''), el.getAttribute('title'));

  w.__setStaff(STAFF, false);
  el = fresh(w, w.assigneeSelectHtml(''));
  ok('원래 미배정이면 미배정 그대로', el.value === '', JSON.stringify(el.value));
  ok('미배정 + 활성 직원 2명 = 옵션 3개', el.options.length === 3, String(el.options.length));

  console.log('\n[2] 저장 경로 — 메모만 고쳐 저장했을 때 배정이 살아남는가');

  for (const [label, staff, stale] of [
    ['직원 목록 조회 실패', [], true],
    ['담당자 계정이 비활성', STAFF, false],
  ]) {
    dom = await bootAdmin();
    w = dom.window;
    w.__setStaff(staff, stale);
    const target = stale ? '김직원' : '박퇴사';
    w.__setContacts([{ ...INQUIRY, assignee: target }]);

    w.openDetail('inq1');
    const sel = w.document.getElementById('d-assignee');
    ok(`[${label}] 모달의 담당자 칸이 사실대로 보인다`, sel.value === target,
      `보인 값=${JSON.stringify(sel.value)} / 실제=${target}`);

    w.document.getElementById('d-note').value = '고객 통화 완료';
    w.__resetFetchLog();
    await w.saveDetail();

    const patch = w.__fetchLog().find(e => e.method === 'PATCH');
    ok(`[${label}] 저장이 서버로 나간다`, !!patch, JSON.stringify(w.__fetchLog()));
    const body = patch ? JSON.parse(patch.body) : {};
    ok(`[${label}] 담당자가 그대로 유지된다 (지워지지 않는다)`, body.assignee === target,
      `보낸 assignee=${JSON.stringify(body.assignee)}`);
    ok(`[${label}] 메모는 정상적으로 반영된다`, body.note === '고객 통화 완료',
      JSON.stringify(body.note));
  }

  console.log('\n[3] 견적 상세 모달도 같은 구조다');

  dom = await bootAdmin();
  w = dom.window;
  w.__setStaff([], true);
  w.__setQuotes([{ id: 'q1', destLabel: '도쿄', destKey: '도쿄', org: '○○기업', name: '홍길동',
    phone: '010-0000-0000', email: 'a@b.com', status: 'new', assignee: '김직원', note: '',
    ts: '2026-07-30T01:00:00.000Z', total: 1000000, items: [], people: 10, days: 4 }]);
  w.openEstDetail('q1');
  const emSel = w.document.getElementById('em-assignee-sel');
  ok('견적 모달도 담당자를 잃지 않는다', emSel.value === '김직원', JSON.stringify(emSel.value));
  ok('견적 모달도 잠긴다', emSel.disabled === true);

  console.log('\n[4] 중첩 <select>에 기대지 않는다 — 속성이 요소에 실제로 붙는가');

  /* 예전 방식(select.innerHTML = '<select disabled ...>')은 파서가 겉의 select를
     버려서 disabled가 사라졌다. 그 우연에 기대고 있지 않은지 직접 확인한다. */
  ok('모달 select에 disabled가 요소 속성으로 걸렸다',
    w.document.getElementById('em-assignee-sel').hasAttribute('disabled'));
  ok('모달 select 안에 중첩 select가 없다',
    !w.document.getElementById('em-assignee-sel').querySelector('select'));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* 문자열로 만든 <select>를 실제 DOM 요소로 만들어 돌려준다 — value/disabled는
   문자열을 정규식으로 훑어서는 알 수 없다(브라우저가 어떻게 해석하는지가 답이다). */
function fresh(w, html) {
  const box = w.document.createElement('div');
  box.innerHTML = html;
  return box.querySelector('select');
}

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setStaff = (list, stale) => { staffListCache = list; staffListStale = !!stale; };
  window.__setContacts = (rows) => { set(KEYS.contacts, rows); };
  window.__setQuotes = (rows) => { localStorage.setItem(EM_KEY, JSON.stringify(rows)); };
  currentUser = { id: '7', username: 'staff1', displayName: '김직원', role: 'staff' };
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다 — 주입구를 심을 수 없습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      const log = [];
      w.__fetchLog = () => log;
      w.__resetFetchLog = () => { log.length = 0; };
      const json = (b, s = 200) => Promise.resolve({
        ok: s >= 200 && s < 300, status: s, json: () => Promise.resolve(b),
      });
      w.fetch = (url, opts) => {
        const u = String(url), method = (opts && opts.method) || 'GET';
        log.push({ url: u, method, body: opts && opts.body });
        if (method === 'PATCH') return json({ ok: true });
        if (u.includes('action=me')) return json({ ok: true, id: '7', username: 'staff1', displayName: '김직원', role: 'staff' });
        return new Promise(() => {});
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true;
      w.alert = () => {};
      w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise(r => setTimeout(r, 60));
  return dom;
}

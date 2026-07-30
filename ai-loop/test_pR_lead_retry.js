/* PR 검증: 고객 리드가 조용히 사라지지 않는가.

   원래 결함 — 세 제출 경로가 `fetch(...).catch(...)`만 썼다. `fetch`는 500에
   reject하지 않으므로 **서버 오류가 성공으로 처리**됐고, 고객에게는 언제나
   "접수 완료"가 떴다. 실패한 리드는 고객이 연락을 기다리고 회사는 존재조차
   모르는 상태로 사라진다. "로컬에는 저장됨"이라는 주석이 안전망처럼 읽혔지만
   localStorage는 고객 브라우저에 있어 담당자는 볼 수 없다.

   ⚠ 이 테스트가 반드시 **실제 렌더**로 확인하는 것: 전송이 실패했을 때 화면에
   "접수되었습니다"가 아니라 실패 안내가 뜨는가. 코드만 읽으면 `showLeadResult`가
   있으니 괜찮겠지로 넘어가기 쉽다(XSS 건도 그렇게 넘어갈 뻔했다).

   실행: node ai-loop/test_pR_lead_retry.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const scriptSrc = read('script.js');
const inqSrc = read(path.join('api', 'inquiries.js'));
const quotesSrc = read(path.join('api', 'quotes.js'));

console.log('[1] 원문 대조 — 조용히 삼키는 옛 경로가 남아 있지 않은가');
/* 리드 제출에 raw fetch().catch()가 다시 등장하면 이 검사가 잡는다. */
const rawInquiryPost = /fetch\('\/api\/inquiries',\s*\{[\s\S]{0,200}?\}\)\s*\.catch/.test(scriptSrc);
const rawQuotePost = /fetch\('\/api\/quotes',\s*\{[\s\S]{0,200}?\}\)\s*\.catch/.test(scriptSrc);
ok('문의 POST가 raw fetch().catch()를 쓰지 않는다', !rawInquiryPost);
ok('견적 POST가 raw fetch().catch()를 쓰지 않는다', !rawQuotePost);
ok('세 경로가 submitLead를 경유한다',
  (scriptSrc.match(/submitLead\('\/api\/(inquiries|quotes)'/g) || []).length >= 3,
  String((scriptSrc.match(/submitLead\('\/api\/(inquiries|quotes)'/g) || []).length));
ok('res.ok를 확인한다 (fetch는 500에 reject하지 않는다)', /if \(!res\.ok\)/.test(scriptSrc));
ok('4xx는 영구 실패로 구분한다(무의미한 재시도 방지)',
  /err\.permanent = res\.status >= 400 && res\.status < 500 && res\.status !== 429/.test(scriptSrc));
ok('탭 닫힘 대비 keepalive를 쓴다', /opts\.keepalive = true/.test(scriptSrc));
ok('온라인 복귀 시 재전송한다', /addEventListener\('online'/.test(scriptSrc));

console.log('\n[2] 재시도의 전제 — 서버가 같은 id 재전송에 중복을 만들지 않는가');
/* ⚠ 이 성질이 깨지면 재시도가 리드를 복제한다. 재시도 로직보다 이게 먼저다. */
ok('/api/inquiries가 on conflict (id) do nothing', /insert into inquiries[\s\S]*?on conflict \(id\) do nothing/.test(inqSrc));
ok('/api/quotes가 on conflict (id) do nothing', /insert into quotes[\s\S]*?on conflict \(id\) do nothing/.test(quotesSrc));
/* 클라이언트 id가 서버에서 교체되면 재시도마다 새 행이 생긴다 — safeId가 영숫자 id를
   보존하는지 확인(교체는 형식 위반 때만). */
const pubSrc = read(path.join('api', '_lib', 'public_input.js'));
ok('safeId는 형식이 맞는 id를 그대로 둔다(멱등성 유지)',
  /return \(typeof raw === 'string' && SAFE_ID_RE\.test\(raw\)\) \? raw : newId\(\)/.test(pubSrc));

/* ── jsdom 실동작 ─────────────────────────────────────────────────── */
const EXPOSE = '\n;try{window.__submitLead=submitLead;window.__flush=flushLeadQueue;'
  + 'window.__QKEY=LEAD_QUEUE_KEY;window.__showLeadResult=showLeadResult;}catch(e){}';
const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;

/* 응답을 시나리오로 제어하는 fetch 목. 호출 기록을 남겨 재시도 횟수를 센다.
   ⚠ 페이지 로드 시 `_trackEvent`가 /api/track으로 POST를 한 건 보낸다 — 이걸 섞어 세면
   재시도 횟수가 전부 1씩 밀린다(처음 이 테스트를 그렇게 짜서 6건이 틀렸다).
   그래서 시나리오와 집계 모두 **엔드포인트별로** 분리한다. */
function makeDom(plan) {
  const calls = [];
  const perUrl = new Map();
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (url, opts) => {
        const u = String(url);
        /* 페이지 초기화용 GET은 영원히 보류시켜 테스트와 섞이지 않게 한다. */
        if (!opts || opts.method !== 'POST') return new Promise(() => {});
        /* 분석용 track은 이 테스트의 관심사가 아니라 항상 성공시키고 집계에서 뺀다. */
        if (u.includes('/api/track')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
        }
        calls.push({ url: u, body: opts.body, keepalive: !!opts.keepalive });
        const nth = (perUrl.get(u) || 0) + 1;
        perUrl.set(u, nth);
        const status = plan(u, nth);
        if (status === 'network') return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({
          ok: status >= 200 && status < 300, status,
          json: () => Promise.resolve(status < 300 ? { ok: true } : { error: 'x' }),
        });
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  try { dom.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  return { dom, calls };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n[3] 500 응답 — 성공으로 처리되지 않고 대기열에 남는가');
  {
    const { dom, calls } = makeDom(() => 500);
    const w = dom.window;
    await sleep(50);
    const rec = { id: 'testlead1', name: '홍길동', tel: '010', message: 'm' };
    const result = await w.__submitLead('/api/inquiries', rec, { retries: 2, backoff: 1 });
    ok('submitLead가 false를 돌려준다 (옛 코드는 성공 취급)', result === false, String(result));
    ok('5xx는 재시도한다 (총 3회)', calls.length === 3, `${calls.length}회`);
    const q = JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]');
    ok('대기열에 보관된다', q.length === 1 && q[0].id === 'testlead1', JSON.stringify(q.map((x) => x.id)));
    ok('대기열이 엔드포인트와 본문을 함께 남긴다',
      q[0].endpoint === '/api/inquiries' && q[0].body && q[0].body.name === '홍길동');
    ok('작은 본문에는 keepalive가 붙는다', calls[0].keepalive === true);
    dom.window.close();
  }

  console.log('\n[4] 4xx — 재시도해도 소용없는 실패는 한 번만 시도하는가');
  {
    const { dom, calls } = makeDom(() => 413);
    const w = dom.window;
    await sleep(50);
    const r = await w.__submitLead('/api/inquiries', { id: 'toobig', name: 'n' }, { retries: 2, backoff: 1 });
    ok('false를 돌려준다', r === false);
    ok('재시도하지 않는다 (1회)', calls.length === 1, `${calls.length}회`);
    ok('그래도 대기열에는 남긴다(리드를 버리지 않는다)',
      JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]').length === 1);
    dom.window.close();
  }

  console.log('\n[5] 네트워크 단절 → 복구 — 대기열이 실제로 비워지는가');
  {
    /* 처음 3회(재시도 포함)는 네트워크 실패, 이후는 성공 */
    const { dom, calls } = makeDom((u, n) => (n <= 3 ? 'network' : 200));
    const w = dom.window;
    await sleep(50);
    const rec = { id: 'lead2', name: '김철수', tel: '010-0000-0000' };
    const first = await w.__submitLead('/api/inquiries', rec, { retries: 2, backoff: 1 });
    ok('처음엔 실패한다', first === false);
    ok('대기열에 1건', JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]').length === 1);
    await w.__flush();
    const q = JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]');
    ok('재전송 후 대기열이 비워진다', q.length === 0, JSON.stringify(q));
    ok('재전송이 같은 id로 나간다 (중복 리드 방지의 근거)',
      JSON.parse(calls[calls.length - 1].body).id === 'lead2',
      calls[calls.length - 1].body.slice(0, 60));
    dom.window.close();
  }

  console.log('\n[6] 성공 경로 — 거짓 실패를 만들지 않는가');
  {
    const { dom, calls } = makeDom(() => 200);
    const w = dom.window;
    await sleep(50);
    const r = await w.__submitLead('/api/inquiries', { id: 'good1', name: 'n' }, { retries: 2, backoff: 1 });
    ok('true를 돌려준다', r === true);
    ok('한 번만 보낸다', calls.length === 1, `${calls.length}회`);
    ok('대기열이 비어 있다', JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]').length === 0);
    dom.window.close();
  }

  console.log('\n[7] 실제 렌더 — 실패했을 때 고객이 보는 문구가 진실인가');
  {
    const { dom } = makeDom(() => 500);
    const w = dom.window, doc = w.document;
    await sleep(50);
    const set = (id, v) => { const e = doc.getElementById(id); if (e) e.value = v; };
    set('inqName', '홍길동'); set('inqOrg', '테스트기업');
    set('inqTel', '010-1234-5678'); set('inqMsg', '문의 내용입니다');
    const form = doc.getElementById('inqForm');
    const okEl = doc.getElementById('inqSuccess');
    const successText = okEl.textContent;
    ok('원래 성공 문구를 확인했다', /접수되었습니다/.test(successText), successText.trim());
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    /* 기본 backoff(600·1200ms) + 여유 */
    await sleep(2600);
    const shown = okEl.textContent;
    ok('실패 시 "접수되었습니다"를 띄우지 않는다', !/접수되었습니다/.test(shown), shown.trim().slice(0, 80));
    ok('실패 안내가 보인다', /오류가 발생했습니다/.test(shown), shown.trim().slice(0, 80));
    ok('직접 연락할 전화번호를 준다', /02-2088-4253/.test(okEl.innerHTML));
    ok('이메일 링크를 준다', /mailto:/.test(okEl.innerHTML));
    ok('안내가 숨겨져 있지 않다', !okEl.classList.contains('hidden'));
    ok('입력 내용은 대기열에 남아 있다',
      JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]').some((x) => x.body && x.body.name === '홍길동'));
    dom.window.close();
  }

  console.log('\n[8] 실제 렌더 — 성공했을 때는 원래 문구가 그대로 나오는가');
  {
    const { dom } = makeDom(() => 200);
    const w = dom.window, doc = w.document;
    await sleep(50);
    const set = (id, v) => { const e = doc.getElementById(id); if (e) e.value = v; };
    set('inqName', '홍길동'); set('inqOrg', '테스트기업');
    set('inqTel', '010-1234-5678'); set('inqMsg', '문의 내용입니다');
    const okEl = doc.getElementById('inqSuccess');
    doc.getElementById('inqForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await sleep(120);
    ok('성공 문구가 뜬다', /접수되었습니다/.test(okEl.textContent), okEl.textContent.trim().slice(0, 60));
    ok('실패 안내는 없다', !/오류가 발생했습니다/.test(okEl.textContent));
    ok('대기열이 비어 있다', JSON.parse(w.localStorage.getItem(w.__QKEY) || '[]').length === 0);
    dom.window.close();
  }

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

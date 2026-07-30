/* PV 검증: 관리자 화면의 리드 쓰기가 실패했을 때 담당자가 그 사실을 아는가.

   원래 결함 —
   ① `patchInquiry`/`patchQuote`/`deleteInquiry`/`deleteQuote`가 `fetch(...).catch()`만
      썼다. **fetch는 401·403·5xx에 reject하지 않으므로** 서버가 거부한 쓰기는 콘솔
      경고조차 남지 않았다. PR에서 고친 고객 제출 경로와 같은 결함이 관리자 화면에
      그대로 남아 있었다.
   ② 주석은 "실패해도 로컬 캐시는 이미 갱신된 상태"라며 안심시켰지만, `loadRemoteData()`가
      다음 동기화에서 캐시를 **서버 값으로 통째로 덮어쓴다.** 즉 서버에 닿지 못한
      상태·메모·담당자·답변·진행기록은 화면에만 저장된 척 남아 있다가 흔적 없이 사라진다.
      담당자는 처리했다고 믿고, 나머지 팀원 화면에는 미처리로 남는다.
   ③ `addActivityLog`·`confirmReply`는 실패해도 **직접 만든 기록을 화면에 렌더**했다
      ("○○ · 7/30 답변"이 서버에 답변이 없는데도 찍혔다).
   ④ 개별 삭제 버튼은 직원에게 숨겼는데 **일괄 삭제 버튼 셋(문의 전체·견적 선택·견적
      전체)은 빠져 있었다.** 서버가 403으로 막아 데이터는 안전했지만 화면에서는 리드가
      전부 사라졌다.

   이 파일은 위 성질을 원문 대조 + jsdom 실동작으로 고정한다. 특히 ①은 "일부러 실패하는
   응답을 흘려" 안내가 실제로 뜨는지 확인한다 — 이 저장소의 반복 사고 유형이
   "안전망이 한 번도 실행된 적 없음"이기 때문이다.

   실행: node ai-loop/test_pV_lead_write_failures.js  (프로젝트 루트에서) */
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

const adminSrc = read('admin.html');

console.log('[1] 옛 조용한 실패 패턴이 사라졌는가');
ok('[inquiries] 서버 반영 실패 콘솔 경고 경로가 없다',
  !/\.catch\(err => console\.warn\('\[inquiries\] 서버 반영 실패/.test(adminSrc));
ok('[quotes] 서버 반영 실패 콘솔 경고 경로가 없다',
  !/\.catch\(err => console\.warn\('\[quotes\] 서버 반영 실패/.test(adminSrc));
/* 옛 주석은 헤더 자체가 "(실패해도 로컬 캐시는 이미 갱신된 상태 — 콘솔 경고만)"이었다.
   같은 문구가 지금도 파일에 있지만 **반례로 인용된 것**이라(이 저장소 관례) 문구 존재
   여부로는 판정할 수 없다. 헤더 형태가 사라졌는지와 반례가 설명돼 있는지를 함께 본다. */
ok('헤더의 거짓 안전망 주장이 사라졌다',
  !/서버 API 쓰기 헬퍼 \(실패해도 로컬 캐시는 이미 갱신된 상태/.test(adminSrc));
ok('왜 틀렸는지(fetch가 reject하지 않는다)를 주석에 남겼다',
  /fetch`는 401·403·5xx에 \*\*reject하지 않는다/.test(adminSrc));
ok('캐시가 통째로 덮어써진다는 사실을 주석에 남겼다',
  /캐시를 통째로 덮어쓴다/.test(adminSrc));
ok('네 헬퍼가 모두 leadWrite를 경유한다',
  /async function patchLead\([\s\S]{0,400}await leadWrite\(/.test(adminSrc)
  && /async function deleteLead\([\s\S]{0,400}await leadWrite\(/.test(adminSrc));
ok('res.ok를 확인한다', /if \(res\.ok\) return \{ ok: true, res \}/.test(adminSrc));

console.log('\n[2] 멱등하지 않은 쓰기에는 재시도를 붙이지 않았는가 (핵심)');
/* addLog는 서버가 activity_log에 **덧붙이므로** 재시도하면 같은 기록이 두 줄 남는다.
   PR의 리드 재전송이 안전했던 근거가 on conflict do nothing이었던 것과 같은 판단이다. */
const addLogCalls = adminSrc.match(/patchFn\(id, \{ addLog:[^\n]*/g) || [];
ok('addLog 호출부가 둘이다', addLogCalls.length === 2, String(addLogCalls.length));
ok('두 곳 모두 retries: 0이다',
  addLogCalls.length === 2 && addLogCalls.every(c => /retries: 0/.test(c)),
  addLogCalls.join(' | ').slice(0, 200));
ok('setReply(덮어쓰기=멱등)에는 retries: 0을 붙이지 않았다',
  /patchFn\(id, \{ setReply:[^\n]*/.test(adminSrc)
  && !/patchFn\(id, \{ setReply:[^\n]*retries: 0/.test(adminSrc));
ok('백오프 상수가 분리돼 있다', /const LEAD_WRITE_BACKOFF_MS = \[\d+, \d+\];/.test(adminSrc));

console.log('\n[3] 실패한 뒤에 화면을 바꾸지 않는 순서인가 (원문)');
ok('문의 모달 저장은 성공 뒤에 캐시를 쓴다',
  /desc: '문의 상태·메모·담당자 저장' \}\);\s*\n\s*if \(!r\.ok\) return;\s*\n\s*set\(KEYS\.contacts, contacts\);/.test(adminSrc));
ok('견적 모달 저장은 성공 뒤에 캐시를 쓴다',
  /desc: '견적 상태·메모·담당자 저장' \}\);\s*\n\s*if \(!r\.ok\) return;\s*\n\s*localStorage\.setItem\(EM_KEY/.test(adminSrc));
ok('문의 삭제는 성공 뒤에 목록에서 지운다',
  /deleteInquiry\(currentModalId, \{ desc: '문의 삭제' \}\);\s*\n\s*if \(!r\.ok\) return;/.test(adminSrc));
ok('견적 삭제는 성공 뒤에 목록에서 지운다',
  /deleteQuote\(emCurrentId, \{ desc: '견적 삭제' \}\);\s*\n\s*if \(!r\.ok\) return;/.test(adminSrc));

console.log('\n[4] 일괄 경로가 부분 실패를 삼키지 않는가 (원문)');
const batchDescs = (adminSrc.match(/leadWriteBatch\('([^']+)'/g) || []).map(s => s.slice(16, -1));
ok('일괄 경로 네 곳이 leadWriteBatch를 쓴다',
  (adminSrc.match(/await leadWriteBatch\(/g) || []).length >= 5,
  String((adminSrc.match(/await leadWriteBatch\(/g) || []).length));
ok('전체 읽음이 포함된다', batchDescs.includes('전체 읽음 처리'), batchDescs.join(','));
ok('문의 전체 삭제가 포함된다', batchDescs.includes('문의 전체 삭제'), batchDescs.join(','));
ok('견적 선택/전체 삭제가 포함된다',
  batchDescs.includes('견적 선택 삭제') && batchDescs.includes('견적 전체 삭제'), batchDescs.join(','));
ok('일괄 항목은 defer로 개별 알림을 끈다',
  (adminSrc.match(/\{ defer: true \}/g) || []).length >= 5,
  String((adminSrc.match(/\{ defer: true \}/g) || []).length));

console.log('\n[5] 일괄 삭제 버튼이 서버 권한과 맞는가 (④)');
const roleBlock = (adminSrc.match(/for \(const id of \[[\s\S]{0,220}?\]\) \{[\s\S]{0,200}?\n    \}/) || [''])[0];
for (const id of ['btnDeleteInquiry', 'btnDeleteQuote', 'clearAllBtn', 'emDeleteSelectedBtn', 'emClearAllBtn']) {
  ok(`역할 숨김 목록에 ${id}이 있다`, roleBlock.includes(`'${id}'`), roleBlock.slice(0, 160));
}
ok('견적 전체 삭제 버튼에 id가 붙었다', /id="emClearAllBtn"/.test(adminSrc));

/* ── jsdom 실동작 ───────────────────────────────────────────────────── */
function buildHtml() {
  /* admin.html은 data.js를 <script src>로 불러오고 jsdom은 로컬 파일을 안 가져온다 —
     인라인으로 치환하지 않으면 스크립트가 도중에 죽어 검사가 무의미해진다(PS에서 겪음). */
  let html = read('admin.html')
    .replace('<script src="data.js"></script>', '<script>' + read('data.js') + '</script>')
    .replace('<script src="dest_currency.js"></script>', '<script>' + read('dest_currency.js') + '</script>');
  const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};'
    + 'window.__leadWrite=leadWrite;'
    + 'window.__errMsg=leadWriteErrorMessage;'
    + 'window.__batch=leadWriteBatch;'
    + 'window.__patchInquiry=patchInquiry;'
    + 'window.__saveDetail=saveDetail;'
    + 'window.__addLog=addActivityLog;'
    + 'window.__confirmReply=confirmReply;'
    + 'window.__applyRoles=applyRolePermissionsToUI;'
    + 'window.__setModalId=id=>{currentModalId=id};'
    + 'window.__KEYS=KEYS;'
    /* 백오프 값을 1ms로 낮춘다 — 재시도 '횟수'를 보는 테스트라 대기 시간은 무의미하고,
       실제 값(400/1200)은 위 [2]에서 원문으로 고정한다. 배열 내용만 바꾼다. */
    + 'window.__fastBackoff=()=>{for(let i=0;i<LEAD_WRITE_BACKOFF_MS.length;i++)LEAD_WRITE_BACKOFF_MS[i]=1;};}catch(e){}\n';
  let injected = false;
  return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
}

/* 서버가 이 문의 하나를 갖고 있다 — 실패 후 화면이 되돌아갈 '서버 진실'이다.
   note가 비어 있는 점이 중요하다: 담당자가 메모를 쓰고 저장이 실패하면, 캐시에
   그 메모가 남아 있으면 안 된다(그게 예전 동작이었다). */
const SERVER_INQUIRY = {
  id: 'lead1', name: '홍길동', org: '테스트기관', tel: '010-0000-0000',
  message: '문의 내용', status: 'unread', note: '', read: false, assignee: '',
  timestamp: '2026-07-30T01:00:00Z', activityLog: [],
};
const RATES_PAYLOAD = { overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {} };

(async () => {
  const alerts = [];
  let route = () => ({ status: 500, body: { error: 'update_failed' } });
  const calls = [];

  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously', url: 'http://localhost/admin.html',
    beforeParse(w) {
      w.fetch = (url, init) => {
        const u = String(url);
        const method = (init && init.method) || 'GET';
        calls.push(method + ' ' + u);
        /* 읽기 경로는 항상 성공시킨다 — 쓰기 실패만 시험 대상이고, 실패 뒤 재동기화가
           서버 값으로 화면을 되돌리는 것까지 확인해야 한다. */
        if (method === 'GET' && u.startsWith('/api/inquiries')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([SERVER_INQUIRY]) });
        }
        if (method === 'GET' && u.startsWith('/api/quotes')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
        }
        if (method === 'GET' && u.startsWith('/api/rates')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(RATES_PAYLOAD) });
        }
        /* staffList는 배열이어야 한다 — {}를 주면 담당자 드롭다운 렌더가 터져서
           재동기화가 실패하고, 정작 보려는 "화면이 서버 값으로 되돌아가는지"를 못 본다. */
        if (u.includes('action=staffList')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
            { id: 1, display_name: '테스트담당', username: 'tester', role: 'manager', active: true, self_signup: false },
          ]) });
        }
        if (u.startsWith('/api/admin/')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 1, displayName: '테스트담당', role: 'manager' }) });
        }
        const r = route(u, method);
        if (r.reject) return Promise.reject(new Error('network down'));
        return Promise.resolve({
          ok: r.status >= 200 && r.status < 300, status: r.status,
          json: () => Promise.resolve(r.body || {}),
        });
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.alert = (m) => { alerts.push(String(m)); };
      w.confirm = () => true;
    },
  });
  await new Promise((r) => setTimeout(r, 250));
  const w = dom.window;
  if (typeof w.__leadWrite !== 'function' || typeof w.__saveDetail !== 'function') {
    console.log('  ✗ admin.html 노출 실패 — 스크립트 구조가 바뀐 것 같습니다');
    process.exit(1);
  }
  w.__fastBackoff();
  w.__setUser({ id: 1, displayName: '테스트담당', role: 'manager' });

  const countWrites = () => calls.filter(c => !c.startsWith('GET ')).length;
  const resetCalls = () => { calls.length = 0; };

  console.log('\n[6] leadWrite — HTTP 오류를 실패로 보는가 (fetch는 reject하지 않는다)');
  route = () => ({ status: 200, body: { ok: true } });
  resetCalls();
  let r = await w.__leadWrite('/api/inquiries/x', { method: 'PATCH' });
  ok('200은 성공', r.ok === true);
  ok('한 번만 보낸다', countWrites() === 1, String(countWrites()));

  route = () => ({ status: 500, body: { error: 'update_failed' } });
  resetCalls();
  r = await w.__leadWrite('/api/inquiries/x', { method: 'PATCH' });
  ok('500은 실패로 본다 (예전엔 성공으로 통과했다)', r.ok === false && r.status === 500, JSON.stringify(r));
  ok('오류 코드를 읽어 온다', r.error === 'update_failed', r.error);
  ok('5xx는 재시도한다 (1+2회)', countWrites() === 3, String(countWrites()));

  route = () => ({ status: 403, body: { error: 'forbidden' } });
  resetCalls();
  r = await w.__leadWrite('/api/inquiries/x', { method: 'DELETE' });
  ok('403은 실패로 본다', r.ok === false && r.status === 403, JSON.stringify(r));
  ok('4xx는 재시도하지 않는다 (안내만 늦어진다)', countWrites() === 1, String(countWrites()));

  route = () => ({ status: 429, body: { error: 'rate_limited' } });
  resetCalls();
  await w.__leadWrite('/api/inquiries/x', { method: 'PATCH' });
  ok('429는 예외적으로 재시도한다', countWrites() === 3, String(countWrites()));

  route = () => ({ reject: true });
  resetCalls();
  r = await w.__leadWrite('/api/inquiries/x', { method: 'PATCH' });
  ok('네트워크 오류도 실패(status 0)', r.ok === false && r.status === 0, JSON.stringify(r));

  route = () => ({ status: 500, body: {} });
  resetCalls();
  await w.__leadWrite('/api/inquiries/x', { method: 'PATCH' }, { retries: 0 });
  ok('retries: 0이면 한 번만 보낸다 (addLog 멱등성 근거)', countWrites() === 1, String(countWrites()));

  console.log('\n[7] 안내문이 실패 종류를 구별하는가');
  ok('401은 재로그인을 안내한다', /세션이 만료/.test(w.__errMsg('메모 저장', { status: 401 })));
  ok('403은 권한을 안내한다', /권한이 없어/.test(w.__errMsg('문의 삭제', { status: 403 })));
  ok('네트워크 오류는 연결 확인을 안내한다', /연결하지 못해/.test(w.__errMsg('메모 저장', { status: 0 })));
  ok('무엇이 저장되지 않았는지 문구에 들어간다', /메모 저장/.test(w.__errMsg('메모 저장', { status: 500 })));

  console.log('\n[8] 모달 저장 실패 — 화면이 거짓말하지 않는가 (핵심 회귀)');
  w.localStorage.setItem(w.__KEYS.contacts, JSON.stringify([SERVER_INQUIRY]));
  const modal = w.document.getElementById('modal');
  modal.classList.remove('hidden');
  w.__setModalId('lead1');
  w.document.getElementById('d-note').value = '고객과 통화 완료 — 다음 주 재연락';
  w.document.getElementById('d-status').value = 'pending';
  w.document.getElementById('d-assignee').value = '';
  alerts.length = 0;
  route = () => ({ status: 500, body: { error: 'update_failed' } });
  await w.__saveDetail();
  await new Promise((r2) => setTimeout(r2, 60));

  ok('실패를 사람에게 알린다', alerts.length === 1, JSON.stringify(alerts));
  ok('무엇이 저장되지 않았는지 말한다', /문의 상태·메모·담당자 저장/.test(alerts[0] || ''), (alerts[0] || '').slice(0, 80));
  ok('모달을 닫지 않는다 (쓴 메모를 잃지 않게)', !modal.classList.contains('hidden'));
  ok('입력한 메모가 화면에 남아 있다',
    w.document.getElementById('d-note').value === '고객과 통화 완료 — 다음 주 재연락');
  const cached = JSON.parse(w.localStorage.getItem(w.__KEYS.contacts) || '[]');
  ok('로컬 캐시에 저장된 척 남지 않는다 (예전 동작)',
    cached.length === 1 && cached[0].note === '' && cached[0].status === 'unread',
    JSON.stringify(cached[0] && { note: cached[0].note, status: cached[0].status }));

  console.log('\n[9] 세션 만료(401) — 로그인 화면으로 되돌리는가');
  const dash = w.document.getElementById('dashPage');
  const login = w.document.getElementById('loginPage');
  dash.classList.remove('hidden'); login.classList.add('hidden');
  alerts.length = 0;
  route = () => ({ status: 401, body: { error: 'unauthorized' } });
  await w.__patchInquiry('lead1', { assignee: '테스트담당' }, { desc: '담당자 지정' });
  await new Promise((r2) => setTimeout(r2, 30));
  ok('401을 알린다', alerts.length === 1 && /세션이 만료/.test(alerts[0]), JSON.stringify(alerts));
  ok('대시보드를 감춘다', dash.classList.contains('hidden'));
  ok('로그인 화면을 띄운다', !login.classList.contains('hidden'));
  ok('로그인 입력창을 다시 쓸 수 있다', w.document.getElementById('adminPw').disabled === false);

  console.log('\n[10] 읽음 표시(quiet) — 소음은 안 내지만 401은 알리는가');
  dash.classList.remove('hidden'); login.classList.add('hidden');
  alerts.length = 0;
  route = () => ({ status: 500, body: { error: 'update_failed' } });
  await w.__patchInquiry('lead1', { read: true }, { quiet: true, desc: '읽음 표시' });
  ok('5xx 읽음 표시 실패는 알림창을 띄우지 않는다', alerts.length === 0, JSON.stringify(alerts));
  alerts.length = 0;
  route = () => ({ status: 401, body: { error: 'unauthorized' } });
  await w.__patchInquiry('lead1', { read: true }, { quiet: true, desc: '읽음 표시' });
  ok('401은 quiet이라도 알린다 (뒤의 모든 편집이 조용히 사라지므로)',
    alerts.length === 1 && /세션이 만료/.test(alerts[0]), JSON.stringify(alerts));
  ok('로그인 화면으로 돌아간다', dash.classList.contains('hidden'));

  console.log('\n[11] 일괄 경로 — 실패를 모아 한 번만 알리는가');
  dash.classList.remove('hidden'); login.classList.add('hidden');
  alerts.length = 0;
  route = () => ({ status: 403, body: { error: 'forbidden' } });
  const batch = await w.__batch('문의 전체 삭제', ['a', 'b', 'c'].map(id => () =>
    w.__patchInquiry(id, { read: true }, { defer: true })));
  ok('알림은 한 번만 뜬다 (건당 알림창이 아니다)', alerts.length === 1, String(alerts.length));
  ok('몇 건 중 몇 건이 실패했는지 말한다', /3건 중 3건/.test(alerts[0] || ''), (alerts[0] || '').slice(0, 90));
  ok('실패 건수를 돌려준다', batch.ok === false && batch.failed === 3, JSON.stringify(batch));

  alerts.length = 0;
  route = (u) => (u.includes('/b') ? { status: 500, body: {} } : { status: 200, body: { ok: true } });
  const partial = await w.__batch('전체 읽음 처리', ['a', 'b', 'c'].map(id => () =>
    w.__patchInquiry(id, { read: true }, { defer: true })));
  ok('부분 실패도 삼키지 않는다', alerts.length === 1 && /3건 중 1건/.test(alerts[0]), (alerts[0] || '').slice(0, 90));
  ok('부분 실패 건수가 맞다', partial.failed === 1, JSON.stringify(partial));

  alerts.length = 0;
  route = () => ({ status: 200, body: { ok: true } });
  const clean = await w.__batch('전체 읽음 처리', ['a'].map(id => () =>
    w.__patchInquiry(id, { read: true }, { defer: true })));
  ok('전건 성공이면 알림이 없다', alerts.length === 0 && clean.ok === true, JSON.stringify(alerts));

  console.log('\n[12] 진행 기록·답변 — 실패했는데 저장된 척 렌더하지 않는가 (③)');
  w.localStorage.setItem(w.__KEYS.contacts, JSON.stringify([SERVER_INQUIRY]));
  const ta = w.document.createElement('textarea');
  ta.id = 'pv-log-text'; ta.value = '1차 통화 완료';
  const box = w.document.createElement('div'); box.id = 'pv-log-box';
  w.document.body.appendChild(ta); w.document.body.appendChild(box);

  alerts.length = 0;
  resetCalls();
  route = () => ({ status: 500, body: { error: 'update_failed' } });
  await w.__addLog('inquiry', 'lead1', 'pv-log-text', 'pv-log-box');
  await new Promise((r2) => setTimeout(r2, 60));
  ok('진행 기록 실패를 알린다', alerts.some(a => /진행 기록 추가/.test(a)), JSON.stringify(alerts));
  ok('멱등하지 않으므로 한 번만 보낸다', countWrites() === 1, String(countWrites()));
  ok('입력창을 비우지 않는다 (다시 누르면 된다)', ta.value === '1차 통화 완료', ta.value);
  const afterLog = JSON.parse(w.localStorage.getItem(w.__KEYS.contacts) || '[]');
  ok('서버에 없는 기록을 캐시에 넣지 않는다',
    !(afterLog[0] && afterLog[0].activityLog && afterLog[0].activityLog.length),
    JSON.stringify(afterLog[0] && afterLog[0].activityLog));
  ok('화면에도 렌더하지 않는다', box.innerHTML === '', box.innerHTML.slice(0, 60));

  const rta = w.document.createElement('textarea');
  rta.id = 'pv-reply-text'; rta.value = '견적서 보내드렸습니다';
  const meta = w.document.createElement('span'); meta.id = 'pv-reply-meta';
  w.document.body.appendChild(rta); w.document.body.appendChild(meta);
  alerts.length = 0;
  route = () => ({ status: 500, body: { error: 'update_failed' } });
  await w.__confirmReply('inquiry', 'lead1', 'pv-reply-text', 'pv-reply-meta');
  await new Promise((r2) => setTimeout(r2, 60));
  ok('답변 확정 실패를 알린다', alerts.some(a => /답변 확정/.test(a)), JSON.stringify(alerts));
  ok('"○○ · 날짜 답변" 표시를 띄우지 않는다', meta.textContent === '', meta.textContent);
  const afterReply = JSON.parse(w.localStorage.getItem(w.__KEYS.contacts) || '[]');
  ok('캐시에 답변이 남지 않는다', !(afterReply[0] && afterReply[0].reply), JSON.stringify(afterReply[0] && afterReply[0].reply));

  console.log('\n[13] 직원 화면에서 일괄 삭제 버튼이 숨는가 (④ 실동작)');
  w.__setUser({ id: 2, displayName: '직원A', role: 'staff' });
  w.__applyRoles();
  for (const id of ['clearAllBtn', 'emDeleteSelectedBtn', 'emClearAllBtn']) {
    const btn = w.document.getElementById(id);
    ok(`직원에게 ${id}이 숨는다`, !!btn && btn.classList.contains('hidden'));
  }
  w.__setUser({ id: 1, displayName: '테스트담당', role: 'manager' });
  w.__applyRoles();
  for (const id of ['clearAllBtn', 'emDeleteSelectedBtn', 'emClearAllBtn']) {
    const btn = w.document.getElementById(id);
    ok(`매니저에게 ${id}이 보인다`, !!btn && !btn.classList.contains('hidden'));
  }

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

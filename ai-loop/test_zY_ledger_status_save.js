/* ═══════════════════════════════════════════════════════════════════════════
   ZY — 견적서 대장의 상태는 **고른 순간이 아니라 「저장」을 눌렀을 때** 반영된다

   2026-09-09 대표 지시: 「상태영역을 선택하고 바꾸면 바로 옆에 저장 버튼을 만들어서
   이 버튼이 활성화되고, 저장버튼을 클릭하면 바로 반영이 되면 좋겠다.」

   ■ 왜 이게 결함이었나

   대장은 **훑는 화면**이다 — 한 줄씩 읽는 곳이 아니라 수십 줄을 눈으로 지나가는 곳.
   그 위에서 드롭다운은 **스크롤 한 번, ↑↓ 한 번에 값이 바뀐다.** 예전 코드는 그
   `change` 자리에서 곧바로 서버로 갔다. 즉 **되돌릴 문이 없는 저장**이었고,
   대장은 하필 「우리가 그 금액을 낸 적 있다」를 남기려고 삭제조차 안 만든 화면이다.

   ■ 이 검사가 지키는 것 (하나라도 무너지면 지시가 무의미해진다)

     ① 처음에는 저장 버튼이 **꺼져 있다** (누를 것이 없다)
     ② 🔴 고르기만 하면 **서버로 아무것도 안 간다** — 이게 이 변경의 전부다
     ③ 고치면 버튼이 켜지고, 드롭다운이 「아직」 색(is-dirty)이 된다
     ④ 원래 값으로 되돌리면 버튼이 **저절로 꺼진다** (되돌리는 문 ①)
     ⑤ 저장을 누르면 그때 `action=status`가 **정확히 한 번** 간다
     ⑥ 🔴 상태색(줄·드롭다운)은 **저장된 뒤에야** 바뀐다 — 미리 칠하면 훑는 사람이
        서버에 안 간 건을 「계약됨」으로 읽는다. 대장에서 가장 비싼 거짓말이다.
     ⑦ 저장되면 「누가 언제」 줄이 생긴다 (= 눈에 보이는 증거)
     ⑧ 실패하면 되돌리고 말한다. 버튼도 다시 꺼진다.
     ⑨ 🔴 저장 안 한 채 목록을 다시 그리려 하면 **묻는다** (되돌리는 문 ②) —
        「찾기」를 눌렀을 뿐인데 고쳐 놓은 것이 조용히 사라지면 안 된다
     ⑩ 서버가 `by`·`at`을 **돌려준다** — 안 돌려주면 화면이 지어내야 한다
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZY 대장 상태 저장 버튼`);
  process.exit(fail ? 1 : 0);
};

/* 🔴 서버가 실제로 주는 모양 그대로(handleList의 select 목록). 픽스처가 코드를
   따라가면 이 검사는 아무것도 못 잡는다. */
const SHARES = [
  { id: 'a1', quote_no: 'Q260909-01', created_at: '2026-09-09T01:00:00Z', issued_by: '송주연',
    customer_label: '김보균', customer_tel: '010-1234-5678', status: 'issued', status_by: null, status_at: null,
    dest: '방콕', org: null, cn: '김보균', iso: '2026-09-09', pax: '12', total: '7668000', per: '639000' },
  { id: 'a2', quote_no: 'Q260901-01', created_at: '2026-09-01T02:00:00Z', issued_by: '박재규',
    customer_label: '오투디자인그룹', customer_tel: null, status: 'won', status_by: '박재규',
    status_at: '2026-09-02T00:00:00Z', dest: '오사카', org: '오투디자인그룹', cn: null,
    iso: '2026-09-01', pax: '8', total: '9000000', per: '1125000' },
];

function boot(fetchImpl, confirmImpl) {
  return new Promise((resolve) => {
    const dom = new JSDOM(read('admin.html'), {
      runScripts: 'dangerously', resources: 'usable',
      url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
      virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.__alerts = []; w.__calls = [];
        w.alert = (m) => w.__alerts.push(String(m));
        w.confirm = confirmImpl || (() => true);
        w.prompt = () => null;
        w.fetch = (url, opt) => { w.__calls.push({ url: String(url), opt }); return fetchImpl(w)(url, opt); };
      },
    });
    const w = dom.window;
    const finish = () => setTimeout(() => resolve(w), 120);
    if (w.document.readyState === 'complete') finish();
    else w.addEventListener('load', finish);
  });
}

/* 🔴 **묶음마다 새 사본을 준다.** 화면 코드가 성공하면 `row.status`를 고치는데,
   픽스처를 그대로 넘기면 [2]의 성공이 [3]·[4]의 출발점을 바꾼다 — 실제로 당했다
   ([3]이 「발급」 대신 「계약」에서 시작해 되돌림 검사가 헛돌았다). */
const listRow = (extra) => (w) => (url) => {
  if (/action=list/.test(String(url))) {
    return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ shares: JSON.parse(JSON.stringify(SHARES)), capped: false, max: 500 }) });
  }
  if (/action=status/.test(String(url))) return extra(url);
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
};

const statusOk = () => Promise.resolve({ ok: true, status: 200,
  json: () => Promise.resolve({ ok: true, status: 'won', by: '최현욱', at: '2026-09-09T05:00:00Z' }) });
const statusFail = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });

const nap = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const stCalls = (w) => w.__calls.filter((c) => /action=status/.test(c.url));

(async () => {
  console.log('\n[1] 고르는 것만으로는 저장되지 않는다 — 그리고 버튼이 그것을 말한다');
  {
    const w = await boot(listRow(statusOk));
    if (typeof w.renderLedger !== 'function') {
      fail++; console.log('  ✗ 대장 함수를 못 찾았다 — 이 묶음은 의미가 없다');
      return done();
    }
    await w.renderLedger();
    const tr = w.document.querySelector('#ledList tbody tr');
    const sel = tr.querySelector('.led-st');
    const btn = tr.querySelector('.led-st-save');

    ok('① 상태 옆에 저장 버튼이 있다', !!btn);
    ok('① 🔴 처음에는 꺼져 있다', !!btn && btn.disabled === true);
    ok('① 서버에 저장된 값을 따로 들고 있다', sel.dataset.saved === 'issued', sel.dataset.saved);

    sel.value = 'won';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await nap();

    /* 🔴 이 한 줄이 이 검사의 전부다. 예전 코드는 여기서 이미 서버로 갔다. */
    ok('② 🔴 고르기만 해서는 서버로 아무것도 안 간다', stCalls(w).length === 0,
      JSON.stringify(stCalls(w).map((c) => c.url)));
    ok('③ 저장 버튼이 켜진다', btn.disabled === false);
    ok('③ 「아직 저장 안 됨」이 드롭다운 색으로도 보인다', sel.classList.contains('is-dirty'));
    ok('③ 버튼도 같은 색으로 말한다', btn.classList.contains('is-on'));
    /* 🔴 미리 칠하지 않는다 */
    ok('⑥ 🔴 줄 색은 아직 「발급」 그대로다', tr.className === 'st-issued', tr.className);
    ok('⑥ 🔴 드롭다운 상태색도 아직 안 바뀐다',
      sel.classList.contains('led-st--issued') && !sel.classList.contains('led-st--won'),
      sel.className);

    /* ④ 되돌리는 문 ① — 원래 값으로 다시 고르면 버튼이 저절로 꺼진다 */
    sel.value = 'issued';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await nap();
    ok('④ 원래 값으로 되돌리면 버튼이 다시 꺼진다', btn.disabled === true);
    ok('④ 「아직」 색도 걷힌다', !sel.classList.contains('is-dirty'));
  }

  console.log('\n[2] 저장을 누르면 그때 반영된다');
  {
    const w = await boot(listRow(statusOk));
    await w.renderLedger();
    const tr = w.document.querySelector('#ledList tbody tr');
    const sel = tr.querySelector('.led-st');
    const btn = tr.querySelector('.led-st-save');

    sel.value = 'won';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await nap();
    btn.click();
    await nap();

    const calls = stCalls(w);
    ok('⑤ 상태 요청이 정확히 한 번 간다', calls.length === 1, String(calls.length));
    if (calls.length) {
      const body = JSON.parse(calls[0].opt.body);
      ok('⑤ 어느 견적서인지 맞다', body.id === 'a1', JSON.stringify(body));
      ok('⑤ 바꾼 값이 맞다', body.status === 'won', JSON.stringify(body));
      ok('⑤ POST로 간다', String(calls[0].opt.method).toUpperCase() === 'POST');
    }
    /* ⑥ 색은 **이제서야** 바뀐다 */
    ok('⑥ 저장 뒤 줄 색이 「계약」이 된다', tr.className === 'st-won', tr.className);
    ok('⑥ 드롭다운 상태색도 바뀐다', sel.classList.contains('led-st--won'), sel.className);
    ok('⑥ 「아직」 색은 걷힌다', !sel.classList.contains('is-dirty'));
    /* ⑦ 눈에 보이는 증거 */
    const by = tr.querySelector('.led-st-by');
    ok('⑦ 🔴 「누가」가 그 자리에 생긴다', /최현욱/.test(by.textContent), by.textContent);
    ok('⑦ 「언제」도 함께', /2026-09-09/.test(by.textContent), by.textContent);
    ok('⑦ 감춰져 있지 않다', by.hidden === false);
    ok('⑦ 버튼은 다시 꺼진다 (누를 것이 없다)', btn.disabled === true);
    /* ⚠ 다음 줄(이미 계약인 건)을 덮어쓰지 않았는가 — ZV에서 옆 칸을 덮을 뻔했다 */
    const tr2 = w.document.querySelectorAll('#ledList tbody tr')[1];
    ok('⑦ ⚠ 옆 줄의 「바꾼 사람」은 그대로다',
      /박재규/.test(tr2.querySelector('.led-st-by').textContent),
      tr2.querySelector('.led-st-by').textContent);
  }

  console.log('\n[3] 실패하면 되돌리고 말한다');
  {
    const w = await boot(listRow(statusFail));
    await w.renderLedger();
    const tr = w.document.querySelector('#ledList tbody tr');
    const sel = tr.querySelector('.led-st');
    const btn = tr.querySelector('.led-st-save');

    sel.value = 'lost';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await nap();
    btn.click();
    await nap();

    ok('⑧ 🔴 값이 되돌아온다', sel.value === 'issued', sel.value);
    ok('⑧ 실패했다고 말한다', w.__alerts.some((m) => /바꾸지 못했습니다/.test(m)),
      JSON.stringify(w.__alerts));
    ok('⑧ 줄 색도 안 바뀐다', tr.className === 'st-issued', tr.className);
    ok('⑧ 버튼이 다시 꺼진다', btn.disabled === true);
    ok('⑧ 버튼 글자가 「저장 중…」에 멈춰 있지 않다', btn.textContent === '저장', btn.textContent);
    ok('⑧ ⚠ 없는 「누가 언제」를 지어내지 않는다',
      tr.querySelector('.led-st-by').hidden === true);
  }

  console.log('\n[4] 🔴 저장 안 한 변경을 조용히 버리지 않는다');
  {
    /* 「아니오」를 누르면 목록을 다시 그리지 않는다 */
    const w = await boot(listRow(statusOk), () => false);
    await w.renderLedger();
    const sel = w.document.querySelector('#ledList .led-st');
    sel.value = 'won';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await nap();

    const before = w.__calls.filter((c) => /action=list/.test(c.url)).length;
    w.document.getElementById('ledFind').click();
    await nap();
    const after = w.__calls.filter((c) => /action=list/.test(c.url)).length;
    ok('⑨ 🔴 「아니오」면 목록을 다시 안 부른다', after === before, before + ' → ' + after);
    ok('⑨ 고쳐 놓은 값이 그대로 남아 있다', sel.value === 'won', sel.value);
    ok('⑨ 「전체」에도 같은 문이 걸려 있다',
      /ledReload[\s\S]{0,160}ledLeaveOk/.test(read('admin.html')));
  }

  console.log('\n[5] 서버가 「누가 언제」를 돌려준다');
  {
    const api = read('api/quote-shares.js');
    const m = api.match(/async function handleStatus\(req, res\)[\s\S]{0,1600}?\n}/);
    ok('⑩ handleStatus를 찾았다', !!m);
    if (m) {
      ok('⑩ 🔴 status_by·status_at을 되돌려 준다',
        /returning[^;]*status_by[^;]*status_at/.test(m[0]));
      ok('⑩ 응답에 by·at이 실린다', /by:\s*r\[0\]\.status_by/.test(m[0]) && /at:\s*r\[0\]\.status_at/.test(m[0]));
    }
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

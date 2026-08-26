/* ═══════════════════════════════════════════════════════════════════════════
   WV — 견적서 대장이 **이어받는 사람에게 필요한 것을 다 보여주는가**

   대장(WB)의 목적은 하나다: **담당자가 휴가여도 다른 사람이 이어받는다.**
   그 눈으로 화면을 그려 보니, 서버가 보내는데 **화면이 한 번도 안 읽는 칸**이 있었다.

   ■ 🔴 ① 총액이 없었다

   서버는 `payload->>'t'`를 실어 보낸다. 그런데 화면은 1인당만 그렸다 —
   고객이 전화로 가장 먼저 묻는 값을 담당자가 **암산**해야 했다.

   ■ 🔴 ② 「누가 언제 상태를 바꿨는가」가 없었다

   `status_by`·`status_at`도 마찬가지다. 이어받은 사람이 「이거 누가 계약으로
   바꿨죠?」를 못 보면 다시 물어봐야 한다 — 그 물어볼 사람이 휴가라서 이 대장을
   만든 것이다. 값을 실어 보내 놓고 아무도 안 읽는 자리다(결함 생성기 ③의 변형).

   ■ 이 검사가 지키는 것

     ① 총액·상태 변경자가 화면에 **실제로 그려진다** (jsdom에서 그려서 센다)
     ② 연락처는 눌러서 걸 수 있고, 없으면 「—」다
     ③ 🔴 상태 변경이 **실패하면 되돌린다** — 실제로 실패시켜서 확인한다
     ④ 🔴 목록을 못 불러오면 **「0건」이 아니라 못 불러왔다고 말한다**
        (「견적서가 사라졌다」로 읽히면 안 된다)
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
  console.log(`결과: ${pass} pass / ${fail} fail  — WV 견적서 대장`);
  process.exit(fail ? 1 : 0);
};

/* 🔴 **서버가 실제로 주는 모양 그대로**(handleList의 select 목록). 여기서 이름을
   바꾸면 이 검사는 아무것도 못 잡는다 — WR에서 픽스처가 코드를 따라가 못 잡은 적이 있다. */
const SHARES = [
  { id: 'a1', quote_no: 'Q260826-01', created_at: '2026-08-26T01:00:00Z', issued_by: '송주연',
    customer_label: '김보균', customer_tel: '010-1234-5678', status: 'issued', status_by: null, status_at: null,
    dest: '방콕', org: null, cn: '김보균', iso: '2026-08-26', pax: '12', total: '7668000', per: '639000',
    verdict: 'package' },
  { id: 'a2', quote_no: 'Q260710-01', created_at: '2026-07-10T02:00:00Z', issued_by: '(소급)',
    customer_label: null, customer_tel: null, status: 'issued', status_by: null, status_at: null,
    dest: '도쿄', org: null, cn: null, iso: '2026-07-10', pax: '20', total: '46973139', per: '2348657',
    verdict: 'verified' },
  { id: 'a3', quote_no: 'Q260722-01', created_at: '2026-07-22T02:00:00Z', issued_by: '고객 직접',
    customer_label: '오투디자인그룹', customer_tel: '02)123-4567', status: 'won', status_by: '박재규',
    status_at: '2026-08-01T00:00:00Z', dest: '오사카', org: '오투디자인그룹', cn: '이현주',
    iso: '2026-07-22', pax: '8', total: '9000000', per: '1125000', verdict: null },
];

function boot(fetchImpl) {
  return new Promise((resolve) => {
    const dom = new JSDOM(read('admin.html'), {
      runScripts: 'dangerously', resources: 'usable',
      url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
      virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.__alerts = [];
        w.alert = (m) => w.__alerts.push(String(m));
        w.confirm = () => true; w.prompt = () => null;
        w.fetch = fetchImpl(w);
      },
    });
    const w = dom.window;
    const finish = () => setTimeout(() => resolve(w), 120);
    if (w.document.readyState === 'complete') finish();
    else w.addEventListener('load', finish);
  });
}

const listOk = () => () => (url) => (/action=list/.test(String(url))
  ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ shares: SHARES, capped: false, max: 500 }) })
  : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));

(async () => {
  console.log('\n[1] 이어받는 사람이 필요한 칸이 다 그려지는가');
  {
    const w = await boot(listOk());
    if (typeof w.renderLedger !== 'function') {
      fail++; console.log('  ✗ 대장 함수를 못 찾았다 — 이 묶음은 의미가 없다');
      return done();
    }
    await w.renderLedger();
    const box = w.document.getElementById('ledList');
    const heads = [...box.querySelectorAll('thead th')].map((e) => e.textContent.trim());
    ok('① 표가 그려졌다', box.querySelectorAll('tbody tr').length === 3,
      String(box.querySelectorAll('tbody tr').length));
    ok('① 🔴 「총액」 열이 있다', heads.includes('총액'), JSON.stringify(heads));
    ok('① 1인당도 그대로 있다', heads.includes('1인당'));

    const cells = (i) => [...box.querySelectorAll('tbody tr')[i].querySelectorAll('td')].map((e) => e.textContent.trim());
    ok('① 🔴 총액이 값으로 찍힌다', cells(0).includes('7,668,000원'), JSON.stringify(cells(0)));
    ok('① 큰 금액도 맞다', cells(1).includes('46,973,139원'), JSON.stringify(cells(1)));

    /* ② 연락처 — 눌러서 걸 수 있고, 없으면 「—」 */
    const tels = [...box.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
    ok('② 연락처가 전화 링크가 된다', tels.length === 2, JSON.stringify(tels));
    ok('② 🔴 링크에는 숫자만 남는다 (속성이 안 깨진다)',
      tels.every((h) => /^tel:[0-9+]+$/.test(h)), JSON.stringify(tels));
    ok('② 보이는 글자는 적은 모양 그대로', box.textContent.includes('02)123-4567'));
    ok('② 연락처가 없으면 —', cells(1).includes('—'), JSON.stringify(cells(1)));

    /* 🔴 누가 언제 바꿨는가 */
    const rows = [...box.querySelectorAll('tbody tr')];
    ok('① 🔴 상태를 바꾼 사람이 보인다', /박재규/.test(rows[2].textContent), rows[2].textContent.slice(0, 80));
    ok('① 바꾼 날짜도 보인다', /2026-08-01/.test(rows[2].textContent));
    /* ⚠ 안 바뀐 건에는 그 줄이 없다 — 늘 켜져 있으면 아무도 안 본다 */
    ok('① 안 바뀐 건에는 그 줄이 없다', !/박재규/.test(rows[0].textContent));
  }

  console.log('\n[2] 🔴 상태 변경이 실패하면 되돌린다 — 실제로 실패시켜 본다');
  {
    const w = await boot(() => (url) => {
      if (/action=list/.test(String(url))) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ shares: SHARES, capped: false, max: 500 }) });
      }
      if (/action=status/.test(String(url))) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await w.renderLedger();
    const sel = w.document.querySelector('#ledList .led-st');
    ok('③ 상태 드롭다운이 있다', !!sel);
    ok('③ 처음 값은 「발급」', sel.value === 'issued', sel.value);
    sel.value = 'won';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    /* 화면만 바뀐 채로 두면 담당자는 바꿨다고 믿는다 */
    ok('③ 🔴 실패하면 값이 되돌아온다', sel.value === 'issued', sel.value);
    ok('③ 그리고 실패했다고 말한다', w.__alerts.some((m) => /바꾸지 못했습니다/.test(m)),
      JSON.stringify(w.__alerts));
  }

  console.log('\n[3] 🔴 목록을 못 불러오면 「0건」이라 하지 않는다');
  {
    const w = await boot(() => (url) => (/action=list/.test(String(url))
      ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })));
    await w.renderLedger();
    const t = w.document.getElementById('ledList').textContent;
    ok('④ 못 불러왔다고 말한다', /불러오지 못했습니다/.test(t), t.slice(0, 80));
    /* 🔴 「견적서가 없다」로 읽히면 담당자는 사라진 줄 안다 */
    ok('④ 🔴 「없습니다」로 뭉뚱그리지 않는다', !/해당하는 견적서가 없습니다/.test(t), t.slice(0, 80));
    ok('④ 그 뜻이 아니라고 못 박는다', /없다」는 뜻이 아닙니다|뜻이 아닙니다/.test(t), t.slice(0, 120));
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

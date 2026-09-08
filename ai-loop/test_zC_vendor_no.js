/* ═══════════════════════════════════════════════════════════════════════════
   ZC — 공급사(하나투어·랜드사) 견적번호: **원가와 판매가를 잇는 열쇠**

   2026-09-07 대표와 합의한 다음 순서의 ② 항목이다.

   ■ 무엇이 없었나

   우리 견적번호(`Q260907-01`)는 **판매가** 쪽 이름이다. 그런데 원가는 공급사가 준
   견적서(블랙다운 엑셀 74건)에 있고, 그쪽에는 **그쪽 번호**가 찍혀 있다.
   이 둘을 잇는 칸이 아무 데도 없어서 **사람이 기억으로** 맞춰야 했다 —
   즉 건별 실마진을 잴 수 없었다. 이 검사는 그 칸이 제 일을 하는지 본다.

   ■ 이 검사가 지키는 것

     ① 형식을 **조이지 않는다** — 공급사마다 다르고, 조이면 진짜 번호가 막힌다.
        그래도 모양은 다듬는다(공백·길이). 대조가 일인 값이라 눈에 안 보이는
        차이로 안 맞는 것이 제일 나쁘다.
     ② 🔴 **고객 문서로 새지 않는다.** 원가 쪽 번호는 고객이 볼 것이 아니다 —
        연락처(WC)와 같은 이유이고, 같은 방식(컬럼에만)으로 막는다.
     ③ **검색으로 찾아진다.** 원가 시트를 손에 들고 「이 번호로 우리가 얼마에
        냈지」를 묻는 것이 이 칸을 만든 이유다. 칸만 있고 못 찾으면 소용이 없다.
     ④ 🔴 **저장에 실패하면 되돌리고 말한다.** 화면만 바뀌면 적었다고 믿는데,
        이 칸은 한참 뒤 대조할 때에야 빈 것을 알게 되는 자리다.
     ⑤ **지운 것도 누가 언제인지 남는다** (YP — 지운 것이 아무 데도 안 남던 자리를
        또 만들지 않는다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
/* [5]에서 그린 머리글을 [8]에서도 쓴다 — **소스가 아니라 그려진 것**을 재기 위해서다 */
let headTxt = '';
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZC 공급사 견적번호`);
  process.exit(fail ? 1 : 0);
};

const QNO = require(path.join(ROOT, 'api', '_lib', 'quote_no.js'));
const SHARES = read('api/quote-shares.js');
const VIEW_API = read('api/quote-shares/[id].js');
const VIEW = read('estimate-view.html');
const MIG = read('ai-loop/db_migrate.js');

/* 🔴 **서버가 실제로 주는 모양 그대로**(handleList의 select 목록). 여기서 이름을
   바꾸면 이 검사는 아무것도 못 잡는다. */
const SHARES_ROWS = [
  { id: 'a1', quote_no: 'Q260907-01', created_at: '2026-09-07T01:00:00Z', issued_by: '송주연',
    customer_label: '오투디자인', customer_tel: '010-1234-5678', status: 'issued', status_by: null, status_at: null,
    vendor_quote_no: null, vendor_no_by: null, vendor_no_at: null,
    dest: '하노이', org: '오투디자인', cn: '김보균', iso: '2026-09-07', pax: '13', total: '23070000', per: '1774615',
    verdict: null },
  { id: 'a2', quote_no: 'Q260902-01', created_at: '2026-09-02T02:00:00Z', issued_by: '고객 직접',
    customer_label: '오투디자인그룹', customer_tel: null, status: 'won', status_by: '박재규', status_at: '2026-09-03T00:00:00Z',
    vendor_quote_no: 'HNT-26-0902', vendor_no_by: '박재규', vendor_no_at: '2026-09-03T05:00:00Z',
    dest: '장가계', org: '오투디자인그룹', cn: null, iso: '2026-09-02', pax: '15', total: '29120000', per: '1941333',
    verdict: 'package' },
];

console.log('\n[1] 형식 — 조이지 않되 모양은 다듬는다');
{
  ok('① 앞뒤 공백을 없앤다', QNO.normalizeVendorNo('  A2609-0123  ') === 'A2609-0123',
    JSON.stringify(QNO.normalizeVendorNo('  A2609-0123  ')));
  ok('① 가운데 연속 공백을 하나로 줄인다', QNO.normalizeVendorNo('HNT   26  0907') === 'HNT 26 0907',
    JSON.stringify(QNO.normalizeVendorNo('HNT   26  0907')));
  /* 🔴 조이지 않는다 — 실물을 다 본 적이 없다. 막히면 담당자가 아예 안 적는다. */
  ok('① 🔴 한글·기호·숫자만 — 모양을 가리지 않는다',
    ['하나투어 26-0907', '2609070123', 'A/2609#0123', '見積-0907'].every((v) => QNO.normalizeVendorNo(v) === v),
    JSON.stringify(['하나투어 26-0907', '2609070123', 'A/2609#0123', '見積-0907'].map(QNO.normalizeVendorNo)));
  /* 빈 값은 null이다 — 빈 문자열이면 「안 적었다」와 「지웠다」가 구별이 안 되고,
     부분 인덱스(`where … is not null`)도 빈 문자열을 값으로 센다. */
  ok('① 빈 값은 null', QNO.normalizeVendorNo('') === null && QNO.normalizeVendorNo('   ') === null);
  ok('① 문자열이 아니면 null',
    [null, undefined, 12345, {}, []].every((v) => QNO.normalizeVendorNo(v) === null));
  ok('① 길이를 자른다(' + QNO.VENDOR_NO_MAX + '자)',
    QNO.normalizeVendorNo('X'.repeat(200)).length === QNO.VENDOR_NO_MAX);
  /* ⚠ 기준이 두 곳에 있으면 조용히 갈린다 — 서버는 이 함수만 부른다 */
  ok('① 서버가 그 함수 하나만 쓴다', /QNO\.normalizeVendorNo\(b\.vendorNo\)/.test(SHARES)
    && !/vendorNo[\s\S]{0,40}\.slice\(0, ?\d+\)/.test(SHARES));
}

console.log('\n[2] 🔴 고객 문서로 새지 않는다 — 원가 쪽 번호다');
{
  /* payload를 만드는 두 자리(발급 경로 둘) 어디에도 없어야 한다 */
  const bodies = [...SHARES.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)\}::jsonb/g)].map((m) => m[1]);
  ok('② payload를 만드는 자리를 찾았다', bodies.length === 2, bodies.length + '곳');
  ok('② 🔴 payload 어디에도 공급사 번호가 없다',
    bodies.every((b) => !/vendor/i.test(b)),
    bodies.map((b, i) => i + ':' + (/vendor\w*/i.exec(b) || [''])[0]).join(' '));
  /* 고객 견적서를 내주는 API는 칸을 **골라서** 읽는다 — `select *`면 언젠가 샌다 */
  ok('② 고객용 조회가 칸을 골라 읽는다', /select payload, status, quote_no from quote_shares/.test(VIEW_API));
  ok('② 🔴 그 목록에 공급사 번호가 없다', !/vendor/i.test(VIEW_API));
  ok('② 고객 견적서 화면도 그 값을 모른다', !/vendor/i.test(VIEW));
  /* 쓰는 문은 관리자 뒤에 있다 */
  const vendorFn = (/async function handleVendorNo[\s\S]*?\n}/.exec(SHARES) || [''])[0];
  ok('② 적는 자리가 로그인을 요구한다', /requireAdmin\(req, res\)/.test(vendorFn), vendorFn.slice(0, 60));
  ok('② 공개 POST 분기가 아니다', /action === 'vendor' && req\.method === 'POST'/.test(SHARES));
}

console.log('\n[3] 대장이 값을 싣고, 그 번호로 찾아진다');
{
  const list = (/async function handleList[\s\S]*?\n}/.exec(SHARES) || [''])[0];
  const selects = list.match(/vendor_quote_no, vendor_no_by, vendor_no_at/g) || [];
  /* ⚠ 쿼리가 **둘**이다(검색할 때·전체). 한쪽만 고치면 검색 결과에서만 칸이 빈다 —
     이 저장소가 여섯 번 당한 유형이다(결함 생성기 ①). */
  ok('③ 두 쿼리가 **모두** 값을 싣는다', selects.length === 2, selects.length + '곳');
  ok('③ 🔴 그 번호로 검색된다', /vendor_quote_no ilike \$\{like\}|vendor_quote_no ilike/.test(list));
  ok('③ 왜 검색축인지가 적혀 있다', /원가 시트[\s\S]{0,120}얼마에 냈지|블랙다운/.test(list));
}

console.log('\n[4] 마이그레이션 — 칸과 인덱스');
{
  ok('④ 칸 셋이 있다', /add column if not exists vendor_quote_no text/.test(MIG)
    && /add column if not exists vendor_no_by text/.test(MIG)
    && /add column if not exists vendor_no_at timestamptz/.test(MIG));
  ok('④ 찾기 인덱스가 있다', /create index if not exists quote_shares_vendor_idx/.test(MIG));
  /* 🔴 유일 인덱스가 아니다 — 한 공급사 견적에 우리 견적서가 여럿 붙는다(차수·인원 변경).
     유일로 걸면 두 번째 견적서 발급이 통째로 막힌다. */
  ok('④ 🔴 유일 인덱스가 **아니다**', !/unique index[\s\S]{0,80}vendor/.test(MIG));
}

/* ── 화면 ─────────────────────────────────────────────────────────────────── */
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
        w.__alerts = []; w.__posts = [];
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

const listReply = () => ({ ok: true, status: 200,
  json: () => Promise.resolve({ shares: SHARES_ROWS, capped: false, max: 300 }) });

(async () => {
  console.log('\n[5] 화면에 칸이 그려지고, 적힌 값이 보인다');
  {
    const w = await boot(() => (url) => (/action=list/.test(String(url))
      ? Promise.resolve(listReply())
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })));
    if (typeof w.renderLedger !== 'function') {
      fail++; console.log('  ✗ 대장 함수를 못 찾았다 — 이 묶음은 의미가 없다');
      return done();
    }
    await w.renderLedger();
    const box = w.document.getElementById('ledList');
    const inputs = [...box.querySelectorAll('.led-vno')];
    ok('⑤ 줄마다 칸이 하나씩 있다', inputs.length === 2, String(inputs.length));
    ok('⑤ 적힌 값이 채워져 있다', inputs[1] && inputs[1].value === 'HNT-26-0902',
      inputs[1] && inputs[1].value);
    ok('⑤ 안 적힌 줄은 비어 있다', inputs[0] && inputs[0].value === '');
    /* 🔴 「번호」짜리 칸이 화면에 수십 개다 — 귀로 구별되려면 줄 이름이 들어가야 한다 */
    const labels = inputs.map((e) => e.getAttribute('aria-label') || '');
    ok('⑤ 🔴 낭독기 이름이 줄마다 다르다', labels[0] !== labels[1] && labels.every((s) => s.length > 5),
      JSON.stringify(labels));
    ok('⑤ 그 이름에 견적번호가 들어 있다', labels[0].includes('Q260907-01'), labels[0]);
    /* 글자 11px 이상 · 누를 자리 24px 이상 (YA 규칙) */
    ok('⑤ 글자가 11px 이상', /font-size:11\.5px/.test(inputs[0].getAttribute('style') || ''),
      inputs[0].getAttribute('style'));
    /* ⚠ 정확한 픽셀이 아니라 **하한을 넘는가**로 잰다 — 한 픽셀만 다듬어도
       깨지는 검사는 사람이 지운다(WCAG 2.5.8의 24px 하한이 지키려는 것이다). */
    ok('⑤ 누를 자리가 24px보다 크다',
      /height:(2[4-9]|[3-9]\d)px/.test(inputs[0].getAttribute('style') || ''),
      inputs[0].getAttribute('style'));
    /* 누가 언제 적었는지 — 적힌 건에만 */
    const rows = [...box.querySelectorAll('tbody tr')];
    /* ⚠ ZV에서 공급사 번호가 **독립 열**로 나왔다(예전에는 우리 번호 칸 안).
       칸 위치를 세지 말고 **입력칸이 든 칸**을 찾는다 — 열 순서가 바뀌어도 안 깨진다. */
    const vtd = (i) => rows[i].querySelector('.led-vno').closest('td');
    ok('⑤ 적은 사람이 보인다', /박재규/.test(vtd(1).textContent),
      vtd(1).textContent.trim().slice(0, 60));
    ok('⑤ 안 적힌 줄에는 그 줄이 없다', !/·/.test(vtd(0).textContent));
    /* 🔴 열을 늘리지 않았다 — `.dash-main`이 overflow-x:hidden이라 넘치면 잘린다 */
    const heads = [...box.querySelectorAll('thead th')].map((e) => e.textContent.trim());
    /* 🔴 지키려던 것은 **「11열」이라는 수**가 아니라 **열이 늘지 않는 것**이다 —
       `.dash-main`이 `overflow-x:hidden`이라 넘치면 스크롤이 아니라 **잘린다**.
       ZV에서 짝지어 묶어 **8열로 줄였다**. 줄어드는 것은 이 위험을 키우지 않는다. */
    ok('⑤ 🔴 열이 늘지 않았다(11열 이하)', heads.length <= 11,
      heads.length + ': ' + JSON.stringify(heads));
    headTxt = heads.join(' ');
    ok('⑤ 상태·총액이 머리글에 살아 있다', /상태/.test(headTxt) && /총액/.test(headTxt), headTxt);
    /* 화면 규칙 5 — 영문·기술 용어를 화면에 내보내지 않는다.
       ⚠ **소스에서 찾으면 안 된다.** 처음에 `>[^<]*vendor_quote_no[^<]*<`로 셌더니
         `<script>` 안의 JS(`r.vendor_quote_no`)가 걸렸다 — 화면에 안 보이는 글자다.
         자가 틀리면 진짜 결함을 못 찾는다. **그려 놓고 보이는 글자로** 잰다. */
    ok('⑤ 그려진 글자에 영문 기술용어가 없다', !/vendor/i.test(box.textContent),
      (/[^\s]*vendor[^\s]*/i.exec(box.textContent) || [''])[0]);
    ok('⑤ 대신 「공급사」라고 적혀 있다', /공급사/.test(box.textContent));
  }

  console.log('\n[6] 🔴 저장 — 실패하면 되돌리고, 성공하면 서버가 저장한 값을 그린다');
  {
    /* 성공: 서버가 **다듬은** 값을 돌려준다(화면이 친 값과 다르게 만들어 확인한다) */
    const w = await boot((win) => (url, opt) => {
      if (/action=list/.test(String(url))) return Promise.resolve(listReply());
      if (/action=vendor/.test(String(url))) {
        win.__posts.push(JSON.parse((opt && opt.body) || '{}'));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true, vendorNo: 'A2609 0123', by: '송주연', at: '2026-09-07T06:00:00Z' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await w.renderLedger();
    const inp = w.document.querySelector('#ledList .led-vno');
    inp.value = '  A2609   0123  ';
    inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    ok('⑥ 서버로 보냈다', w.__posts.length === 1 && w.__posts[0].id === 'a1',
      JSON.stringify(w.__posts));
    ok('⑥ 친 값 그대로 보낸다(다듬는 곳은 서버 하나)', w.__posts[0].vendorNo === '  A2609   0123  ',
      JSON.stringify(w.__posts[0]));
    ok('⑥ 🔴 화면은 **서버가 저장한 값**을 그린다', inp.value === 'A2609 0123', inp.value);
    /* 성공은 「누가 언제」 줄이 생기는 것으로 보인다 — 조용하면 저장됐는지 모른다 */
    ok('⑥ 누가 언제가 그 자리에 생긴다', /송주연/.test(inp.closest('td').textContent),
      inp.closest('td').textContent.trim().slice(0, 60));
    ok('⑥ 날짜도 보인다', /2026-09-07/.test(inp.closest('td').textContent));

    /* 안 바뀌었으면 부르지 않는다 — 부르면 「누가 언제」가 헛되이 갱신된다 */
    const before = w.__posts.length;
    inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    ok('⑥ 안 바뀌었으면 서버를 안 부른다', w.__posts.length === before, String(w.__posts.length));
  }
  {
    const w = await boot(() => (url) => {
      if (/action=list/.test(String(url))) return Promise.resolve(listReply());
      if (/action=vendor/.test(String(url))) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await w.renderLedger();
    const inp = [...w.document.querySelectorAll('#ledList .led-vno')][1];
    ok('⑦ 처음 값이 있다', inp.value === 'HNT-26-0902', inp.value);
    inp.value = '바꾼값-1';
    inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    /* 🔴 화면만 바뀐 채로 두면 담당자는 적었다고 믿는다 — 한참 뒤 대조할 때에야 안다 */
    ok('⑦ 🔴 실패하면 값이 되돌아온다', inp.value === 'HNT-26-0902', inp.value);
    ok('⑦ 그리고 실패했다고 말한다', w.__alerts.some((m) => /저장하지 못했습니다/.test(m)),
      JSON.stringify(w.__alerts));
    ok('⑦ 칸이 잠긴 채로 남지 않는다', inp.disabled === false, String(inp.disabled));
  }

  console.log('\n[7] ⑤ 지우는 것도 같은 문으로 지나가고, 기록이 남는다');
  {
    const vendorFn = (/async function handleVendorNo[\s\S]*?\n}/.exec(SHARES) || [''])[0];
    /* 빈 값이면 normalizeVendorNo가 null을 주고, 그 null을 그대로 쓴다 —
       「빈 값이면 건드리지 않는다」로 만들면 **지울 방법이 없어진다.** */
    ok('⑧ 빈 값이면 null로 지운다', /set vendor_quote_no = \$\{vno\}/.test(vendorFn), vendorFn.slice(0, 200));
    ok('⑧ 🔴 지울 때도 누가 언제가 남는다',
      /vendor_no_by = \$\{[\s\S]{0,120}\}/.test(vendorFn) && /vendor_no_at = now\(\)/.test(vendorFn));
    ok('⑧ 없는 건이면 404', /not_found/.test(vendorFn));
    ok('⑧ 저장한 값을 돌려준다', /returning id, vendor_quote_no, vendor_no_by, vendor_no_at/.test(vendorFn));
  }

  console.log('\n[8] 담당자가 이 칸이 무엇인지 화면에서 안다');
  {
    const ADMIN = read('admin.html');
    /* ⚠ ZV에서 안내를 12줄 → 3줄로 줄이며 이 설명을 **그 칸의 `title`과 머리글**로
       옮겼다(대표 지시). 지키려던 것은 「파란 상자에 적혀 있다」가 아니라
       **담당자가 그 칸에서 무엇을 적는지·어디로 안 나가는지 알 수 있다**이다.
       오히려 칸 옆이 파란 상자보다 가까운 자리다. */
    ok('⑨ 그 칸이 무엇을 적는 칸인지 말한다', /원가 견적번호/.test(ADMIN));
    ok('⑨ 고객에게 안 나간다고 말한다', /고객 문서에는 나가지 않습니다/.test(ADMIN));
    /* 🔴 **여기를 소스로 재면 안 된다 — 실제로 헛돌았다** (2026-09-08).
       머리글을 「우리 견적번호 / 고객가」로 바꿨는데 이 검사가 **통과**했다.
       `ADMIN`(소스 전체)에서 찾다 보니 바로 위 **주석**의 「우리 번호(판 값)」에
       걸린 것이다 — 화면에 없는 글자다. 같은 파일 [5]의 경고가 그대로 재현됐다.
       → **그려 놓고 `<thead>`를 읽는다.** 머리글이 바뀌면 여기서 걸린다. */
    ok('⑨ 머리글이 우리 번호와 공급사 번호를 갈라 말한다', headTxt
      && /우리[\s\S]{0,10}번호/.test(headTxt) && /공급사[\s\S]{0,10}번호/.test(headTxt)
      && /고객가/.test(headTxt) && /원가/.test(headTxt), String(headTxt));
    ok('⑨ 검색 안내에도 들어 있다', /placeholder="견적번호 · 공급사 번호/.test(ADMIN));
    /* ⚠ 영문 기술용어 검사는 **[5]에서 그려 놓고** 한다 — 소스로 세면 script 안이 걸린다 */
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

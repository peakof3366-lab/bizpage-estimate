/* ═══════════════════════════════════════════════════════════════════════════
   ZE — 차수·개정 관계: **어느 것이 최신인가**

   2026-09-07 대표와 합의한 다음 순서의 ③ 항목.

   ■ 무엇이 없었나

   같은 건으로 견적서를 다시 내는 것은 **정상 업무**다(인원이 바뀌고 조건이 바뀐다).
   그런데 그렇게 나간 견적서 셋이 대장에 **나란히 세 줄**로 있을 뿐이라, 이어받은
   사람이 **어느 것이 최신인지 모른다.** 옛 금액으로 응대하면 그대로 손해다.

   ■ 이 검사가 지키는 것

     ① **번호 형식은 안 건드린다.** `Q260907-02`는 그날 두 번째 발급이지 「2차」가
        아니다. 차수는 번호가 아니라 **관계**로 센다.
     ② 🔴 **모르면 모른다고 말한다.** 앞선 견적서가 목록에 없으면 차수를 짐작하지
        않는다 — 틀린 차수는 「최신이 아닌데 최신처럼 보이는」 자리를 만든다.
     ③ **고리(A→B→A)에서 멈춘다.** 사람이 손으로 이으니 언젠가 생긴다.
     ④ 🔴 **자동으로 판단했으면 고칠 문을 함께 낸다.** 발급 때 서버가 자동으로 잇는데
        (같은 문의의 두 번째 견적서) 그 판단은 틀릴 수 있다(A안·B안 동시 발급).
        못 고치는 자동 판단은 안전장치가 아니라 방치다.
     ⑤ **끊기와 잇기가 같은 문**이다. 끊는 문만 있으면 잘못 끊었을 때 못 되돌린다.
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
  console.log(`결과: ${pass} pass / ${fail} fail  — ZE 차수·개정 관계`);
  process.exit(fail ? 1 : 0);
};

const QNO = require(path.join(ROOT, 'api', '_lib', 'quote_no.js'));
const { adminSource } = require('./_admin_source');
const SHARES = read('api/quote-shares.js');
const VIEW_API = read('api/quote-shares/[id].js');
const MIG = read('ai-loop/db_migrate.js');

const T = (n) => '2026-09-0' + n + 'T00:00:00Z';

console.log('\n[1] 차수를 관계로 센다 — 번호가 아니라');
{
  /* 1차 → 2차 → 3차 사슬 */
  const rows = [
    { id: 'a', quote_no: 'Q260901-01', quote_id: 'q1', revision_of: null, created_at: T(1) },
    { id: 'b', quote_no: 'Q260903-01', quote_id: 'q1', revision_of: 'a', created_at: T(3) },
    { id: 'c', quote_no: 'Q260905-01', quote_id: 'q1', revision_of: 'b', created_at: T(5) },
  ];
  const m = QNO.buildRevisionMap(rows);
  ok('① 첫 건은 1차', m.a.revNo === 1, String(m.a.revNo));
  ok('① 두 번째는 2차', m.b.revNo === 2, String(m.b.revNo));
  ok('① 세 번째는 3차', m.c.revNo === 3, String(m.c.revNo));
  ok('① 무엇의 개정인지 번호로 말한다', m.c.revOfNo === 'Q260903-01', m.c.revOfNo);
  /* 🔴 이 기능의 전부 — 옛 줄이 「내가 최신이 아니다」를 안다 */
  ok('① 🔴 옛 건은 최신이 아니라고 안다', m.a.isLatest === false && m.b.isLatest === false);
  ok('① 🔴 그리고 최신본 번호를 말한다', m.a.latestNo === 'Q260905-01', m.a.latestNo);
  ok('① 최신 건은 스스로 최신이다', m.c.isLatest === true);
}

console.log('\n[2] 🔴 모르면 모른다고 말한다 — 짐작한 차수를 내지 않는다');
{
  /* 앞선 견적서(a)가 목록에 없다 — 상한·검색에 걸려 실제로 일어난다 */
  const m = QNO.buildRevisionMap([
    { id: 'b', quote_no: 'Q260903-01', quote_id: 'q1', revision_of: 'a', created_at: T(3) },
  ]);
  ok('② 차수를 안 내놓는다', m.b.revNo === null, String(m.b.revNo));
  ok('② 못 셌다고 표시한다', m.b.revBroken === true);
  /* 🔴 「1차」로 떨어뜨리면 옛 견적서가 최신으로 보인다 — 조용한 폴백 금지 */
  ok('② 🔴 1차로 떨어지지 않는다', m.b.revNo !== 1);
}

console.log('\n[3] 고리에서 멈춘다');
{
  const m = QNO.buildRevisionMap([
    { id: 'a', quote_no: 'Q1', quote_id: 'q1', revision_of: 'b', created_at: T(1) },
    { id: 'b', quote_no: 'Q2', quote_id: 'q1', revision_of: 'a', created_at: T(2) },
  ]);
  ok('③ 돌지 않고 끝난다', !!m.a && !!m.b);
  ok('③ 고리는 「모름」으로 표시된다', m.a.revBroken === true && m.b.revBroken === true);
}

console.log('\n[4] 이을 후보 — 같은 문의의 직전 견적서');
{
  const rows = [
    { id: 'a', quote_no: 'Q260901-01', quote_id: 'q1', revision_of: null, created_at: T(1) },
    { id: 'b', quote_no: 'Q260903-01', quote_id: 'q1', revision_of: null, created_at: T(3) },
    { id: 'z', quote_no: 'Q260902-01', quote_id: 'q9', revision_of: null, created_at: T(2) },
  ];
  const m = QNO.buildRevisionMap(rows);
  ok('④ 뒤 건에 앞 건이 후보로 붙는다', m.b.prevId === 'a' && m.b.prevNo === 'Q260901-01',
    JSON.stringify([m.b.prevId, m.b.prevNo]));
  ok('④ 첫 건에는 후보가 없다', m.a.prevId === null);
  /* ⚠ 다른 문의 건을 후보로 주면 안 된다 — 남의 건에 차수가 붙는다 */
  ok('④ 🔴 다른 문의 건은 후보가 아니다', m.z.prevId === null, String(m.z.prevId));
  /* 이미 이어져 있으면 후보를 또 주지 않는다 */
  const m2 = QNO.buildRevisionMap([
    { id: 'a', quote_no: 'Q1', quote_id: 'q1', revision_of: null, created_at: T(1) },
    { id: 'b', quote_no: 'Q2', quote_id: 'q1', revision_of: 'a', created_at: T(3) },
  ]);
  ok('④ 이미 이어졌으면 후보 없음', m2.b.prevId === null);
  /* 문의가 없는 건(고객이 직접 뽑은 것)은 후보가 없다 */
  const m3 = QNO.buildRevisionMap([
    { id: 'a', quote_no: 'Q1', quote_id: null, revision_of: null, created_at: T(1) },
    { id: 'b', quote_no: 'Q2', quote_id: null, revision_of: null, created_at: T(3) },
  ]);
  ok('④ 문의가 없으면 후보 없음', m3.b.prevId === null);
}

console.log('\n[5] 서버 — 발급 때 잇고, 사람이 고칠 문이 있다');
{
  ok('⑤ 같은 문의의 직전 견적서를 찾는다',
    /where quote_id = \$\{parentQid\} order by created_at desc limit 1/.test(SHARES));
  ok('⑤ 그 값을 컬럼에 넣는다', /revision_of\)\s*\n\s*values/.test(SHARES) || /quote_id, revision_of/.test(SHARES));
  /* 🔴 차수를 못 읽었다고 발급을 막으면 안 된다 — 차수는 편의고 발급은 업무다 */
  ok('⑤ 🔴 못 읽어도 발급은 막지 않는다',
    /직전 견적서 조회 실패\(차수 없이 발급\)/.test(SHARES));
  const fn = (/async function handleRevision[\s\S]*?\n}\n/.exec(SHARES) || [''])[0];
  ok('⑤ 고치는 문이 있다', fn.length > 200);
  ok('⑤ 로그인을 요구한다', /requireAdmin\(req, res\)/.test(fn));
  ok('⑤ 자기 자신은 못 잇는다', /self_reference/.test(fn));
  ok('⑤ 없는 견적서는 못 잇는다', /target_not_found/.test(fn));
  ok('⑤ 🔴 고리를 막는다', /cycle/.test(fn));
  ok('⑤ 사슬이 너무 길면 멈춘다', /chain_too_long/.test(fn));
  /* ⑤ 끊기와 잇기가 같은 문이다 — 끊는 문만 있으면 되돌릴 길이 없다 */
  ok('⑤ 🔴 빈 값이면 끊는다(같은 문)', /revisionOf === 'string' && b\.revisionOf \? b\.revisionOf : null/.test(fn));
  ok('⑤ 분기가 등록돼 있다', /action === 'revision' && req\.method === 'POST'/.test(SHARES));
}

console.log('\n[6] 관계는 고객 문서로 안 나간다 · 마이그레이션');
{
  const bodies = [...SHARES.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)\}::jsonb/g)].map((m) => m[1]);
  ok('⑥ payload에 개정 관계가 없다', bodies.every((b) => !/revision/i.test(b)),
    bodies.map((b) => (/revision\w*/i.exec(b) || [''])[0]).join(' '));
  ok('⑥ 고객용 조회도 안 읽는다', !/revision/i.test(VIEW_API));
  ok('⑥ 마이그레이션에 칸이 있다', /add column if not exists revision_of text/.test(MIG));
  ok('⑥ 인덱스가 있다', /create index if not exists quote_shares_revision_idx/.test(MIG));
  /* 🔴 차수를 숫자 컬럼으로도 저장하면 관계와 어긋난다(결함 생성기 ①) */
  ok('⑥ 🔴 차수를 숫자로 저장하지 않는다', !/revision_no|rev_no\b/.test(MIG));
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

/* 서버가 실제로 주는 모양 — handleList가 buildRevisionMap 결과를 행에 합쳐 준다 */
const base = (o) => Object.assign({
  created_at: T(1), issued_by: '송주연', customer_label: '오투디자인', customer_tel: null,
  status: 'issued', status_by: null, status_at: null, quote_id: 'q1',
  vendor_quote_no: null, vendor_no_by: null, vendor_no_at: null,
  dest: '하노이', org: '오투디자인', cn: null, iso: '2026-09-01', pax: '13',
  total: '23070000', per: '1774615', verdict: null,
}, o);
const ROWS = [
  base({ id: 'c', quote_no: 'Q260905-01', created_at: T(5), revision_of: 'b',
    revNo: 3, revBroken: false, revOf: 'b', revOfNo: 'Q260903-01',
    latestId: 'c', latestNo: 'Q260905-01', isLatest: true, prevId: null, prevNo: null }),
  base({ id: 'b', quote_no: 'Q260903-01', created_at: T(3), revision_of: 'a',
    revNo: 2, revBroken: false, revOf: 'a', revOfNo: 'Q260901-01',
    latestId: 'c', latestNo: 'Q260905-01', isLatest: false, prevId: null, prevNo: null }),
  base({ id: 'a', quote_no: 'Q260901-01', created_at: T(1), revision_of: null,
    revNo: 1, revBroken: false, revOf: null, revOfNo: null,
    latestId: 'c', latestNo: 'Q260905-01', isLatest: false, prevId: null, prevNo: null }),
];

(async () => {
  console.log('\n[7] 화면 — 최신이 아닌 줄이 그렇다고 말한다');
  {
    const w = await boot(() => (url) => (/action=list/.test(String(url))
      ? Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ shares: ROWS, capped: false, max: 300, revisions: true }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })));
    if (typeof w.renderLedger !== 'function') {
      fail++; console.log('  ✗ 대장 함수를 못 찾았다 — 이 묶음은 의미가 없다');
      return done();
    }
    await w.renderLedger();
    const box = w.document.getElementById('ledList');
    const tr = [...box.querySelectorAll('tbody tr')];
    ok('⑦ 세 줄이 그려졌다', tr.length === 3, String(tr.length));
    ok('⑦ 차수 배지가 붙는다', /3차/.test(tr[0].textContent) && /2차/.test(tr[1].textContent),
      tr[0].textContent.slice(0, 40));
    /* 1차에는 안 붙인다 — 늘 켜져 있는 표시는 아무도 안 본다 */
    ok('⑦ 1차에는 배지가 없다', !/1차/.test(tr[2].textContent), tr[2].textContent.slice(0, 40));
    ok('⑦ 무엇의 개정인지 보인다', /Q260903-01 개정/.test(tr[0].textContent));
    /* 🔴 이 기능의 전부 */
    ok('⑦ 🔴 옛 줄이 최신본 번호를 말한다',
      /최신본 Q260905-01/.test(tr[1].textContent) && /최신본 Q260905-01/.test(tr[2].textContent),
      tr[2].textContent.slice(0, 80));
    ok('⑦ 최신 줄에는 그 말이 없다', !/최신본/.test(tr[0].textContent), tr[0].textContent.slice(0, 60));
    /* 화면 규칙 5 — 영문 기술용어가 그려진 글자에 없다 */
    ok('⑦ 그려진 글자에 영문 기술용어가 없다', !/revision|isLatest/i.test(box.textContent),
      (/[^\s]*revision[^\s]*/i.exec(box.textContent) || [''])[0]);
  }

  console.log('\n[8] 🔴 차수를 못 셌으면 말한다 — 조용하면 전부 「1차·최신」으로 보인다');
  {
    const plain = ROWS.map((r) => {
      const o = Object.assign({}, r);
      delete o.revNo; delete o.isLatest; delete o.latestNo; delete o.revOfNo; delete o.revBroken;
      return o;
    });
    const w = await boot(() => (url) => (/action=list/.test(String(url))
      ? Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ shares: plain, capped: false, max: 300, revisions: false }) })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })));
    await w.renderLedger();
    const cnt = w.document.getElementById('ledCount').textContent;
    ok('⑧ 못 셌다고 말한다', /차수를 세지 못했습니다/.test(cnt), cnt);
    /* 그래도 목록 자체는 나온다 — 대장의 일은 찾는 것이다 */
    ok('⑧ 목록은 그대로 나온다', w.document.querySelectorAll('#ledList tbody tr').length === 3);
    ok('⑧ 없는 차수를 지어내지 않는다', !/차$/m.test(w.document.getElementById('ledList').textContent));
  }

  console.log('\n[9] 🔴 자동 판단을 사람이 고칠 수 있다 — 끊기와 잇기가 같은 버튼');
  {
    const w = await boot((win) => (url, opt) => {
      if (/action=list/.test(String(url))) {
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ shares: ROWS, capped: false, max: 300, revisions: true }) });
      }
      if (/action=revision/.test(String(url))) {
        win.__posts.push(JSON.parse((opt && opt.body) || '{}'));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await w.renderLedger();
    const btns = [...w.document.querySelectorAll('#ledList .led-rev')];
    ok('⑨ 이어진 줄에 끊는 버튼이 있다', btns.length === 2, String(btns.length));
    ok('⑨ 버튼이 무슨 일이 날지 말한다', /개정 아님으로/.test(btns[0].textContent), btns[0].textContent);
    ok('⑨ 낭독기 이름에 줄 번호가 들어 있다',
      (btns[0].getAttribute('aria-label') || '').includes('Q260905-01'), btns[0].getAttribute('aria-label'));
    btns[0].click();
    await new Promise((r) => setTimeout(r, 150));
    ok('⑨ 서버로 보낸다', w.__posts.length === 1 && w.__posts[0].id === 'c', JSON.stringify(w.__posts));
    ok('⑨ 🔴 끊을 때는 빈 값을 보낸다', w.__posts[0].revisionOf === '', JSON.stringify(w.__posts[0]));
  }
  {
    /* 잇는 쪽 — 후보가 있을 때만 버튼을 낸다 */
    const rows = [
      base({ id: 'b', quote_no: 'Q260903-01', created_at: T(3), revision_of: null,
        revNo: 1, revBroken: false, revOf: null, revOfNo: null,
        latestId: 'b', latestNo: 'Q260903-01', isLatest: true, prevId: 'a', prevNo: 'Q260901-01' }),
      base({ id: 'a', quote_no: 'Q260901-01', created_at: T(1), revision_of: null,
        revNo: 1, revBroken: false, revOf: null, revOfNo: null,
        latestId: 'a', latestNo: 'Q260901-01', isLatest: true, prevId: null, prevNo: null }),
    ];
    const w = await boot((win) => (url, opt) => {
      if (/action=list/.test(String(url))) {
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ shares: rows, capped: false, max: 300, revisions: true }) });
      }
      if (/action=revision/.test(String(url))) {
        win.__posts.push(JSON.parse((opt && opt.body) || '{}'));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await w.renderLedger();
    const btns = [...w.document.querySelectorAll('#ledList .led-rev')];
    ok('⑩ 후보가 있는 줄에만 잇는 버튼', btns.length === 1, String(btns.length));
    ok('⑩ 어느 건과 잇는지 이름에 있다', /Q260901-01 개정으로/.test(btns[0].textContent), btns[0].textContent);
    btns[0].click();
    await new Promise((r) => setTimeout(r, 150));
    ok('⑩ 앞 건의 id를 보낸다', w.__posts[0] && w.__posts[0].revisionOf === 'a', JSON.stringify(w.__posts));
  }
  {
    /* 실패하면 말한다 — 왜 안 됐는지 그대로 */
    const w = await boot(() => (url) => {
      if (/action=list/.test(String(url))) {
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ shares: ROWS, capped: false, max: 300, revisions: true }) });
      }
      if (/action=revision/.test(String(url))) {
        return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: 'cycle' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await w.renderLedger();
    const b = w.document.querySelector('#ledList .led-rev');
    b.click();
    await new Promise((r) => setTimeout(r, 150));
    ok('⑪ 실패했다고 말한다', w.__alerts.some((m) => /바꾸지 못했습니다/.test(m)), JSON.stringify(w.__alerts));
    ok('⑪ 🔴 왜인지도 말한다', w.__alerts.some((m) => /서로가 서로의 개정본/.test(m)), JSON.stringify(w.__alerts));
    ok('⑪ 버튼이 잠긴 채로 남지 않는다', b.disabled === false, String(b.disabled));
  }

  console.log('\n[10] 담당자가 화면에서 이 표시를 이해한다');
  {
    const ADMIN = adminSource();
    /* ⚠ ZV에서 안내를 12줄 → 3줄로 줄이며 설명을 **그 물건 옆으로** 옮겼다(대표 지시).
       지키려던 것은 「파란 상자에 있다」가 아니라 **담당자가 그 자리에서 뜻을 알 수
       있다**이다 — 배지의 `title`, 버튼의 `title`이 상자보다 가까운 자리다.
       🔴 다만 **「옛 줄로 응대하지 마라」만은 상자에 남겼다.** 그건 배지를 안 눌러
         봐도 읽혀야 하는 말이고, 틀리면 옛 금액으로 응대하는 사고가 난다. */
    ok('⑫ 차수가 무엇인지 그 자리에서 말한다',
      /같은 문의로 견적서를 다시 내면 차수가 붙습니다/.test(ADMIN));
    ok('⑫ 옛 줄로 응대하지 말라고 말한다',
      /최신본[\s\S]{0,80}응대하지 마세요/.test(ADMIN));
    ok('⑫ 고치는 법도 말한다',
      /개정본이 아니라고 표시합니다/.test(ADMIN) && /직전 견적서와 이어 차수를 매깁니다/.test(ADMIN));
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

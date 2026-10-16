/* 문의 → 견적 작성 → 문의에 연결 (2026-10-16, 견적 관리 화면 개선 2회차 — 대표 위임 「질문의 답은 스스로 숙고해서」)

   1회차 끝에 정한 다음 단계: 「견적 1건을 문의 접수부터 발급까지 따라가 줄일 단계를 찾는다」.
   따라가 보니 가장 큰 낭비는 **문의와 견적 사이**였다:
     · 문의 창에서 견적 작성으로 갈 길이 없었다 — 창 닫기 · 「견적 산출」 묶음 펴기 · 자동 견적 산출 (3번)
     · ③단계에서 이름 · 기관 · 연락처를 **다시 쳤다**(창을 닫았으니 보려면 문의를 다시 열었다)
     · 저장한 견적이 문의와 **이어지지 않았다** — 문의 창은 끝까지 「연결된 견적 없음」, 진행 기록도 손으로
     · 저장 뒤 발급하려면 견적 관리 → 그 줄 찾기 → 상세 → 직원용 (3번 + 찾기)
   → 문의 창 「이 문의로 견적 작성」 · 고객 칸 채움 · 저장하면 서버가 잇는다(진행 기록 · 처리중) ·
     ⑤단계 「견적 관리에서 열기 · 링크 발급」.

   [1] 🔴 서버 — 진짜 핸들러(`api/inquiries/[id].js`)를 가짜 DB 위에서 돌린다
   [2] 문의 창 — 연결 전/후 · 고객 상담 연결과 말이 갈리는가
   [3] 🔴 「이 문의로 견적 작성」 — 저장 안 한 견적이 있으면 먼저 묻는다
   [4] 견적 관리 — 꼬리표 · 상세 문구 · 「견적 관리에서 열기」 알림을 받으면 그 건을 직원용으로 연다
   [5] 견적 작성 화면(`?inq=`) — 칸 채움 · 못 찾으면 말한다 · 저장하면 잇는다 · 실패하면 말한다

   진짜 브라우저로 끝까지 누르는 것은 `python ai-loop/check_inquiry_to_quote.py`.
   실행: node ai-loop/test_aT_inquiry_quote_link.js  (프로젝트 루트에서) */
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB · 가짜 인증 ── */
const DB = { quotes: { q1: { id: 'q1', quote_no: 'BP-2610-0007' } }, inquiries: {}, queries: [] };
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (strings, ...vals) => Promise.resolve().then(() => {
    const q = strings.join('?');
    DB.queries.push({ q, vals });
    if (/select id, quote_no from quotes where id/.test(q)) return DB.quotes[vals[0]] ? [DB.quotes[vals[0]]] : [];
    if (/update inquiries set\s+payload/.test(q)) {
      /* 서버 SQL이 하는 일을 그대로 흉내 낸다 — case 식은 [1-e]가 원문으로 지킨다 */
      const [payloadJson, logJson, mine, id] = vals;
      const r = DB.inquiries[id];
      if (!r) return [];
      Object.assign(r.payload, JSON.parse(payloadJson));
      r.activity_log = r.activity_log.concat(JSON.parse(logJson));
      if (r.status === 'unread' || r.status === 'read') r.status = 'pending';
      if (!r.assignee) r.assignee = mine;
      r.read = true;
      return [{ status: r.status, assignee: r.assignee }];
    }
    return [];
  }),
} };
const authPath = require.resolve(path.join(ROOT, 'api', '_lib', 'auth.js'));
const realAuth = require(authPath);
require.cache[authPath].exports = Object.assign({}, realAuth, {
  requireAdmin: async (req, res) => {
    if (!req.fakeRole) { res.status(401).json({ error: 'unauthorized' }); return false; }
    req.user = { role: req.fakeRole, displayName: '세션의 이름', username: 'staff1' }; return true;
  },
  requireRole: async (req, res) => { res.status(403).json({}); return false; },
});
const handler = require(path.join(ROOT, 'api', 'inquiries', '[id].js'));
const call = async (id, body, role = 'staff') => {
  const out = { code: 0, body: null };
  const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; } };
  await handler({ method: 'PATCH', query: { id }, body, fakeRole: role }, res);
  return out;
};
const seed = (id, status, assignee = '') => {
  DB.inquiries[id] = { id, status, assignee, read: status !== 'unread', payload: { id, name: '김가상' }, activity_log: [] };
};

(async () => {
  console.log('[1] 🔴 서버 — linkQuote');
  {
    seed('i1', 'unread');
    const r = await call('i1', { linkQuote: 'q1', author: '위조한 이름' });
    ok('잇는다 → 200', r.code === 200, JSON.stringify(r));
    const row = DB.inquiries.i1;
    ok('같은 칸(linkedQuoteId)에 적는다 · 직원이 이었다고 표시(linkedVia)',
      row.payload.linkedQuoteId === 'q1' && row.payload.linkedVia === 'staff', JSON.stringify(row.payload));
    ok('원래 payload는 그대로(덮지 않고 합친다)', row.payload.name === '김가상');
    ok('진행 기록에 「견적 작성 — 견적번호」', row.activity_log.length === 1 && row.activity_log[0].text === '견적 작성 — BP-2610-0007',
      JSON.stringify(row.activity_log));
    ok('🔴 작성자는 세션에서(보낸 이름을 믿지 않는다)', row.activity_log[0].author === '세션의 이름', row.activity_log[0].author);
    ok('신규 → 처리중 · 응답이 바뀐 상태를 말한다', row.status === 'pending' && r.body.status === 'pending' && r.body.quoteNo === 'BP-2610-0007');

    ok('미배정이면 만든 사람이 담당자(세션 표시명) · 응답도 말한다',
      row.assignee === '세션의 이름' && r.body.assignee === '세션의 이름', row.assignee);

    seed('i2', 'done', '박선임');
    await call('i2', { linkQuote: 'q1' });
    ok('🔴 완료로 닫은 문의는 되살리지 않는다', DB.inquiries.i2.status === 'done', DB.inquiries.i2.status);
    ok('🔴 이미 맡은 사람이 있으면 담당자를 안 바꾼다', DB.inquiries.i2.assignee === '박선임', DB.inquiries.i2.assignee);

    const nq = await call('i1', { linkQuote: 'nope' });
    ok('없는 견적이면 404 · 잇지 않는다', nq.code === 404 && nq.body.error === 'quote_not_found');
    const bad = await call('i1', { linkQuote: "');" });
    ok('id에 쓸 수 없는 글자만 오면 400', bad.code === 400, JSON.stringify(bad));
    const ni = await call('zz', { linkQuote: 'q1' });
    ok('없는 문의면 404', ni.code === 404 && ni.body.error === 'inquiry_not_found', JSON.stringify(ni));
    const anon = await call('i1', { linkQuote: 'q1' }, null);
    ok('로그인 안 했으면 401', anon.code === 401);

    const src = require('fs').readFileSync(path.join(ROOT, 'api', 'inquiries', '[id].js'), 'utf8');
    ok("[1-e] SQL: 신규·확인일 때만 처리중으로(case when status in ('unread', 'read'))",
      /status = case when status in \('unread', 'read'\) then 'pending' else status end/.test(src));
    ok('[1-e] SQL: payload를 합친다(|| jsonb) — 통째로 바꾸지 않는다',
      /payload = coalesce\(payload, '\{\}'::jsonb\) \|\| \$\{/.test(src));
    ok("[1-e] SQL: 담당자는 비어 있을 때만(case when coalesce(assignee, '') = '')",
      /assignee = case when coalesce\(assignee, ''\) = '' then \$\{mine\} else assignee end/.test(src));
  }

  const { bootPage } = require('./_page_boot.js');
  const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');
  const B = bootPage('admin.html', { fixtures: adminFixtures('filled') });
  await B.ready;
  const { entered } = await enterDashboard(B);
  ok('관리자 화면에 들어갔다', entered);
  const ev = (s) => B.win.eval(s);
  const $ = (id) => B.doc.getElementById(id);

  console.log('\n[2] 문의 창');
  const QS = [
    { id: 'qS', quoteNo: 'BP-2610-0011', ts: '2026-10-15T00:00:00Z', destLabel: '도쿄', total: 30000000, status: 'new' },
    { id: 'qC', quoteNo: 'BP-2610-0012', ts: '2026-10-14T00:00:00Z', destLabel: '다낭', total: 20000000, status: 'new' },
  ];
  const CS = [
    { id: 'cA', name: '아직', org: '가상상사', tel: '010-1', message: 'x', timestamp: '2026-10-15T00:00:00Z', read: false },
    { id: 'cS', name: '직원연결', org: '', message: 'x', timestamp: '2026-10-14T00:00:00Z', read: true, linkedQuoteId: 'qS', linkedVia: 'staff' },
    { id: 'cC', name: '고객연결', org: '', message: 'x', timestamp: '2026-10-13T00:00:00Z', read: true, type: 'estimate_inquiry', linkedQuoteId: 'qC' },
  ];
  ev(`localStorage.setItem(EM_KEY, ${JSON.stringify(JSON.stringify(QS))}); set(KEYS.contacts, ${JSON.stringify(CS)});`);
  ev(`switchTab('inquiries'); openDetail('cA')`);
  const mk = () => B.doc.querySelector('#modal .inq-make-quote button');
  ok('연결 전 — 「이 문의로 견적 작성」이 있다', !!mk() && /이 문의로 견적 작성/.test(mk().textContent));
  ok('낭독기 이름에 누구 문의인지', mk() && mk().getAttribute('aria-label') === '아직 문의로 견적 작성', mk() && mk().getAttribute('aria-label'));
  ok('비어 있을 때 무엇이 없는지 말한다', /아직 이 문의로 만든 견적이 없습니다/.test($('d-linked-quote').textContent));
  ev(`openDetail('cS')`);
  ok('직원이 이은 문의 — 「이 문의로 만든 견적 — 번호」', /이 문의로 만든 견적입니다 — BP-2610-0011/.test($('d-linked-quote').textContent.replace(/\s+/g, ' ')),
    $('d-linked-quote').textContent.replace(/\s+/g, ' ').trim());
  ok('직원이 이은 문의 — 만들기 버튼은 없다', !mk());
  ev(`openDetail('cC')`);
  ok('고객이 이은 상담은 예전 문구 그대로(「연결된 상담」)', /연결된 상담입니다/.test($('d-linked-quote').textContent));

  console.log('\n[3] 🔴 「이 문의로 견적 작성」');
  {
    const fr = $('quoteProFrame');
    /* 틀에 저장 안 한 견적이 있는 상태를 만든다 — 진짜 틀 대신 같은 이름의 함수를 단다 */
    fr.setAttribute('src', 'about:blank#busy');
    let discarded = 0;
    const cw = fr.contentWindow;
    cw.aqpHasUnsaved = () => true;
    cw.aqpDiscard = () => { discarded++; };
    B.win.confirm = () => false;
    ev(`openDetail('cA'); startQuoteFromInquiry('cA')`);
    ok('저장 안 한 견적이 있고 「아니요」면 아무것도 안 바꾼다',
      fr.getAttribute('src') === 'about:blank#busy' && !$('modal').classList.contains('hidden') && discarded === 0, fr.getAttribute('src'));
    let asked = '';
    B.win.confirm = (m) => { asked = String(m); return true; };
    ev(`startQuoteFromInquiry('cA')`);
    ok('묻는 말이 누구 문의인지 · 무엇이 사라지는지 말한다', /아직님 문의로 새로 시작하면 그 견적은 사라집니다/.test(asked), asked);
    ok('「예」면 안쪽 확인창을 끈다(같은 질문 두 번 안 함)', discarded === 1);
    ok('틀이 그 문의로 열린다(?inq=)', /admin-quote-pro\.html\?inq=cA$/.test(fr.getAttribute('src')), fr.getAttribute('src'));
    ok('자동 견적 산출 탭 · 문의 창은 닫힘', $('tab-quotepro').classList.contains('active') && $('modal').classList.contains('hidden'));
  }

  console.log('\n[4] 견적 관리');
  ev(`switchTab('estmgr'); renderEstMgr();`);
  const tagOf = (no) => {
    const tr = [...B.doc.querySelectorAll('#emBody tr')].find((r) => (r.querySelector('.em-qno strong') || {}).textContent === no);
    return tr ? (tr.querySelector('.em-tag-cs') || {}).textContent || '' : null;
  };
  ok('직원이 이은 견적 꼬리표 「📨 문의」', tagOf('BP-2610-0011') === '📨 문의', tagOf('BP-2610-0011'));
  ok('고객 상담 꼬리표는 그대로 「☎ 상담」', tagOf('BP-2610-0012') === '☎ 상담', tagOf('BP-2610-0012'));
  ev(`openEstDetail('qS')`);
  ok('견적 상세 — 「직원연결님 문의를 보고 만든 견적」', /직원연결님 문의를 보고 만든 견적입니다/.test($('em-linked-inquiry').textContent));
  console.log('\n[4-b] 🔴 고객 담당자 — 직원 이름이 고객 담당자로 읽히던 것');
  ok('옛 내부 산출(고객 담당자 = 만든 직원)은 「모른다」',
    ev(`emClientContact({ channel: 'internal', contact: '홍직원', createdBy: '홍직원' })`) === '');
  ok('내부 산출이라도 고객 이름이 따로 적혀 있으면 그대로', ev(`emClientContact({ channel: 'internal', contact: '김고객', createdBy: '홍직원' })`) === '김고객');
  ok('고객이 직접 낸 견적은 그대로', ev(`emClientContact({ channel: 'public', contact: '김고객', createdBy: '' })`) === '김고객');
  ok('상세 칸 이름이 「고객 담당자」(그냥 「담당자」면 우리 담당자와 헷갈린다)', /<dt>고객 담당자<\/dt>/.test($('em-orginfo').innerHTML));
  ev(`document.getElementById('emModal').classList.add('hidden'); switchTab('dashboard')`);
  /* ⑤단계 「견적 관리에서 열기」가 보내는 알림. 목록을 다시 읽으므로 서버 목록(q1)에 있는 건으로 */
  B.win.dispatchEvent(new B.win.MessageEvent('message', { data: { __aqp: 'openQuote', quote: 'q1' } }));
  await B.tick(300);
  ok('「견적 관리에서 열기」 → 견적 관리 탭', $('tab-estmgr').classList.contains('active'));
  ok('→ 그 견적 상세가 열린다', !$('emModal').classList.contains('hidden'));
  ok('→ 직원용 탭(발급 버튼이 있는 쪽)', $('emModalBody').dataset.emtab === 'staff', $('emModalBody').dataset.emtab);
  ev(`document.getElementById('emModal').classList.add('hidden')`);
  B.log.says.length = 0;
  B.win.dispatchEvent(new B.win.MessageEvent('message', { data: { __aqp: 'openQuote', quote: 'gone' } }));
  await B.tick(300);
  ok('🔴 못 찾으면 못 찾았다고 말한다(조용히 목록만 띄우지 않는다)',
    B.log.says.some((s) => /찾지 못했습니다/.test(s.text)) && $('emModal').classList.contains('hidden'));

  console.log('\n[5] 견적 작성 화면 — ?inq=');
  const INQ = { id: 'i9', name: '김가상', org: '가상전자', tel: '010-1234-5678', message: 'x' };
  const bootPro = async (query, extraFx) => {
    const P = bootPage('admin-quote-pro.html', {
      query,
      fixtures: Object.assign({ route: (u, opt, json) => (u.includes('account?action=me')
        ? json({ id: '1', displayName: '점검', role: 'owner' }) : null) }, extraFx || {}),
      beforeBoot: (w) => { w.localStorage.setItem('linkedt_contacts', JSON.stringify([INQ])); },
    });
    await P.ready; await P.tick(400);
    return P;
  };
  /* 「금액 입력 시작」은 필수 4칸이 있어야 열린다 — 처음엔 안 채우고 눌러 「먼저 누르세요」로 빨개졌다(화면은 멀쩡했다) */
  const startAdhoc = async (P) => {
    const set = (id, v) => { const e = P.doc.getElementById(id); e.value = v; e.dispatchEvent(new P.win.Event('input', { bubbles: true })); e.dispatchEvent(new P.win.Event('change', { bubbles: true })); };
    set('pDest', '도쿄'); set('pPax', '25'); set('pDays', '4'); set('pStart', '2027-03-10');
    P.doc.getElementById('btnStart').click(); await P.tick(200);
  };
  {
    const P = await bootPro('?mode=adhoc&inq=i9');
    const v = (id) => P.doc.getElementById(id).value;
    ok('화면이 오류 없이 뜬다', P.log.errors.length === 0, P.log.errors.map((e) => e.msg).slice(0, 2).join(' · '));
    ok('거래처명 · 단체명 = 기관', v('dClient') === '가상전자' && v('dOrgName') === '가상전자', v('dClient') + ' / ' + v('dOrgName'));
    ok('받는 분 = 문의한 사람 · 고객 연락처', v('dClientContact') === '김가상' && v('dCustTel') === '010-1234-5678');
    const ban = P.doc.getElementById('inqBanner');
    ok('안내 줄이 누구 문의인지 · 저장하면 이어진다고 말한다',
      !ban.classList.contains('hidden') && /김가상/.test(ban.textContent) && /연결됩니다/.test(ban.textContent), ban.textContent);
    ok('관리자 화면 밖(단독)에서는 「견적 관리에서 열기」를 안 띄운다(누를 곳이 없다)',
      P.doc.getElementById('afterSave').classList.contains('hidden'));
    await startAdhoc(P);
    ok('「금액 입력 시작」 뒤에도 고객 칸이 그대로(문서 씨앗이 덮지 않는다)', v('dClient') === '가상전자' && v('dCustTel') === '010-1234-5678',
      v('dClient') + ' / ' + v('dCustTel'));
    P.doc.getElementById('btnSave').click(); await P.tick(600);
    const reqs = P.log.requests.filter((r) => r.method !== 'GET').map((r) => r.method + ' ' + r.url);
    const created = P.log.requests.findIndex((r) => /action=internal/.test(r.url));
    const linked = P.log.requests.findIndex((r) => /\/api\/inquiries\/i9$/.test(r.url) && r.body && r.body.linkQuote);
    ok('저장 → 문의에 잇는 요청(linkQuote = 저장된 견적 id)', created >= 0 && linked > created
      && P.log.requests[linked].body.linkQuote === 'testquote1', reqs.join(' · '));
    ok('안내 줄이 「연결했습니다」로', /연결했습니다/.test(ban.textContent), ban.textContent);
    const sent = (P.log.requests[created] || {}).body || {};
    ok('🔴 저장 기록의 고객 담당자 = 받는 분(문의한 사람) · 직원 이름이 아니다 · 목록이 읽는 이름(contact)으로',
      sent.contact === '김가상' && sent.contactName === '김가상', JSON.stringify({ contact: sent.contact, contactName: sent.contactName }));
    P.doc.getElementById('btnSave').click(); await P.tick(600);
    ok('「한 건 더 저장」은 같은 문의에 또 잇지 않는다',
      P.log.requests.filter((r) => /\/api\/inquiries\//.test(r.url) && r.body && r.body.linkQuote).length === 1);
  }
  {
    const P = await bootPro('?mode=adhoc&inq=i9', { route: (u, opt, json) => {
      if (u.includes('account?action=me')) return json({ id: '1', displayName: '점검', role: 'owner' });
      if (/\/api\/inquiries\//.test(u) && opt && opt.method === 'PATCH') return json({ error: 'x' }, false, 500);
      return null;
    } });
    await startAdhoc(P);
    P.doc.getElementById('btnSave').click(); await P.tick(600);
    const m = P.doc.getElementById('saveMsg');
    ok('🔴 잇기에 실패하면 말한다 — 견적은 저장됨 · 할 일(진행 기록에 번호)',
      /업로드 완료/.test(m.textContent) && /문의와 연결하지 못했습니다/.test(m.textContent) && m.classList.contains('note-err'), m.textContent);
  }
  {
    const P = await bootPro('?mode=adhoc&inq=없는것');
    const ban = P.doc.getElementById('inqBanner');
    ok('🔴 문의를 못 찾으면 말한다(빈 칸으로 조용히 시작하지 않는다)',
      !ban.classList.contains('hidden') && /문의를 찾지 못했습니다/.test(ban.textContent) && P.doc.getElementById('dClient').value === '', ban.textContent);
  }
  {
    const P = await bootPro('?mode=adhoc');
    ok('문의 없이 열면 안내 줄도 없다(예전 그대로)', P.doc.getElementById('inqBanner').classList.contains('hidden'));
  }

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('크래시:', e); console.log(`\n결과: ${pass} pass / ${fail + 1} fail`); process.exit(1); });

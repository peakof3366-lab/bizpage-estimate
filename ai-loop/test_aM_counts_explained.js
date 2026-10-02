/* ══════════════════════════════════════════════════════════════════════════
   🔢 견적 관리 · 견적서 대장 숫자가 서로를 설명하는가 (2026-10-02 대표 지시)

   ■ 왜 필요한가
   대표: 「견적관리에 남아 있는 견적서 양과 좌측 네비 숫자 등이 오류가 있는 것 같다」.
   운영 DB를 그대로 띄워 보니 **셈은 맞았다** — 좌측 배지 3 = 「신규」만 · 견적 관리 4줄 = 전부 ·
   대장 「견적 22건」 = 발급 문서를 견적별로 묶은 수(견적 기록이 지워진 묶음 10 · 기록 없이 발급 10 포함).
   뜻이 다른데 화면이 그 차이를 말하지 않아 오류로 보였다.

   ■ 무엇을 보나 (admin.html을 jsdom으로 띄워 진짜 함수를 부른다)
     [1] 견적 관리 필터 버튼에 건수 — 전체 n · 신규 n … (좌측 배지와 같은 「신규」 수)
     [2] 🔴 대장 머리 — 견적 n건 (견적 관리에 기록 있음 · 기록 삭제됨 · 기록 없이 발급) — 셋의 합 = 견적 수
     [3] 🔴 기록이 지워진 묶음에 「견적 기록 삭제됨」 · 견적 관리 목록을 못 받았으면 아무 말도 안 한다
   ══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { adminSource } = require('./_admin_source');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
};

const SHARES = [
  /* 견적 관리에 남은 견적 q1 — 두 판 */
  { id: 's1', quote_no: 'BP-2609-0030', quote_id: 'q1', created_at: '2026-09-28T01:00:00Z', status: 'issued', payload: { t: 100 } },
  { id: 's2', quote_no: 'BP-2609-0030_V2', quote_id: 'q1', revision_of: 's1', created_at: '2026-09-28T02:00:00Z', status: 'issued', payload: { t: 110 } },
  /* 견적 기록이 지워진 묶음 */
  { id: 's3', quote_no: 'BP-2609-0017', quote_id: 'gone1', created_at: '2026-09-23T01:00:00Z', status: 'void', payload: { t: 50 } },
  /* 기록 없이 발급(고객 직접) */
  { id: 's4', quote_no: 'Q260824-03', quote_id: null, created_at: '2026-08-24T01:00:00Z', status: 'issued', payload: { t: 70 } },
];
const ESTS = [
  { id: 'q1', status: 'consulting', ts: 1, destKey: '멜버른' },
  { id: 'q2', status: 'new', ts: 2, destKey: '마카오' },
  { id: 'q3', status: 'new', ts: 3, destKey: '오키나와' },
  { id: 'q4', status: 'new', ts: 4, destKey: '홍콩' },
];

const dom = new JSDOM(adminSource(), {
  runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
    w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
    w.fetch = (u) => {
      const url = String(u);
      if (/quote-shares\?action=list/.test(url)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ shares: JSON.parse(JSON.stringify(SHARES)), capped: false, max: 500, revisions: true }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
  },
});
const w = dom.window;
const finish = async () => {
  const d = w.document;
  w.eval('currentUser = { id: "1", username: "m", displayName: "매니저", role: "manager" };');
  w.__E = ESTS;
  w.eval('getEstsFull = () => window.__E;');

  console.log('\n[1] 견적 관리 필터 버튼에 건수');
  w.renderEstMgr();
  const btn = (k) => d.querySelector(`#tab-estmgr [data-emfilter="${k}"]`).textContent.trim();
  ok('① 전체 4', btn('all') === '전체 4', btn('all'));
  ok('🔴 ① 신규 3 — 좌측 배지(신규만)와 같은 수', btn('new') === '신규 3', btn('new'));
  ok('① 상담중 1 · 계약완료 0 · 종료 0', btn('consulting') === '상담중 1' && btn('contracted') === '계약완료 0' && btn('closed') === '종료 0');
  w.renderEstMgr();
  ok('① 다시 그려도 숫자가 겹쳐 붙지 않는다 (「신규 3 3」 아님)', btn('new') === '신규 3', btn('new'));

  /* 🔴 브라우저가 검색칸에 아이디(admin)를 채운 상태 — 버튼과 목록이 **같은 것**을 세야 한다
       (대표 캡처: 버튼 「전체 4 · 신규 3」인데 목록은 2건 · 1건) */
  w.__E = ESTS.map((e, i) => Object.assign({}, e, { contact: i === 0 || i === 3 ? 'admin' : '' }));
  d.getElementById('emSearch').value = 'admin';
  w.eval('emSearch = "admin"; emPage = 1;');
  w.renderEstMgr();
  ok('🔴 ① 검색 중이면 버튼도 검색 결과 안에서 센다 (전체 2 · 신규 1)', btn('all') === '전체 2' && btn('new') === '신규 1', btn('all') + ' / ' + btn('new'));
  ok('① 목록 줄 수 = 「전체」 버튼 숫자', d.querySelectorAll('#emBody tr').length === 2, String(d.querySelectorAll('#emBody tr').length));
  const note = d.getElementById('emSearchNote');
  ok('🔴 ① 「admin 검색 중 — 전체 4건 중 2건」이 눈에 보인다', !note.classList.contains('hidden') && /「admin」 검색 중 — 전체 4건 중 2건/.test(note.textContent), note.textContent);
  w.emClearSearch();
  ok('① 「검색 지우기」 — 칸이 비고 전체로 돌아간다', d.getElementById('emSearch').value === '' && btn('all') === '전체 4' && note.classList.contains('hidden'));
  w.__E = ESTS;

  console.log('\n[1-b] 🔐 브라우저 자동 채움 막기 (구조)');
  const html = require('fs').readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  ok('🔴 ①b 비밀번호 칸이 양식(form)으로 묶이고 그 안에 아이디 칸(autocomplete=username)이 있다',
    /<form[^>]*id="pwForm"[\s\S]{0,1200}autocomplete="username"[\s\S]{0,2400}id="pwCurrent"[\s\S]{0,1600}<\/form>/.test(html));
  ok('①b 새 계정 만들기도 자기 양식(autocomplete=off)', /<form[^>]*id="newStaffForm"[^>]*autocomplete="off"/.test(html));
  const searches = ['inqSearch', 'emSearch', 'ledSearch', 'rateSearch'];
  const locked = searches.filter((id) => new RegExp('id="' + id + '" readonly data-noautofill').test(html));
  ok('🔴 ①b 검색칸 넷이 누르기 전까지 잠겨 있다(readonly → 누르면 풀림)', locked.length === 4, locked.join(','));
  const em = d.getElementById('emSearch');
  em.setAttribute('readonly', ''); em.dispatchEvent(new w.Event('focus'));
  ok('①b 누르면(focus) 잠금이 풀린다', !em.hasAttribute('readonly'));
  ok('①b 로그인한 사람 아이디가 숨은 칸에 들어간다', /getElementById\('pwUsername'\); if \(pu\) pu\.value = currentUser\.username/.test(html));

  console.log('\n[2] 🔴 대장 머리');
  await w.renderLedger();
  await new Promise((r) => setTimeout(r, 50));
  const head = d.getElementById('ledCount').textContent;
  ok('② 견적 3건 (기록 있음 1 · 기록 삭제됨 1 · 기록 없이 발급 1) · 발급 문서 4건', /견적 3건 \(견적 관리에 기록 있음 1 · 기록 삭제됨 1 · 기록 없이 발급 1\) · 발급 문서 4건/.test(head), head);

  console.log('\n[3] 🔴 「견적 기록 삭제됨」');
  const gone = [...d.querySelectorAll('#ledList .led-gone')];
  ok('③ 지워진 묶음 하나에만 붙는다', gone.length === 1 && gone[0].closest('tr').textContent.includes('BP-2609-0017'), String(gone.length));
  /* 견적 관리 목록을 못 받았으면(빈 사본) 단정하지 않는다 */
  w.__E = [];
  await w.renderLedger();
  await new Promise((r) => setTimeout(r, 50));
  ok('🔴 ③ 견적 관리 목록을 모르면 「삭제됨」도, 세 갈래 숫자도 말하지 않는다',
    d.querySelectorAll('#ledList .led-gone').length === 0 && !/기록 삭제됨/.test(d.getElementById('ledCount').textContent), d.getElementById('ledCount').textContent);

  w.close();
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — aM 견적 숫자가 서로를 설명하는가`);
  process.exit(fail ? 1 : 0);
};
if (w.document.readyState === 'complete') finish(); else w.addEventListener('load', finish);

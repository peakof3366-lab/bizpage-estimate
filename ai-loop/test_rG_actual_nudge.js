/* RG 검증: 계약 실적('실제 총 계약가')을 놓치지 않게 하는 장치.

   왜 —
   견적 정확도를 높이는 남은 작업(실측 신뢰구간 P5, 목적지별 '종합' 오차, 요율 갱신 제안)이
   전부 **quotes.actualTotal** 하나에서 나온다. 그런데 프로덕션에 계약완료 견적이 0건이라
   그 작업들이 통째로 멈춰 있다. 더 나쁜 것은 **이 숫자가 계약할 때만 알 수 있다**는 점이다 —
   이번 주 계약 금액을 다음 달에 기억해서 채우기는 어렵다. 안 챙기면 "데이터가 없어서 못
   한다"가 영원히 계속된다.

   ⚠ 여기서 고친 진짜 결함: 계약완료로 바꿀 때 뜨는 리마인드가 **항공료·호텔단가만** 보고
   있었다. 정작 분석이 읽는 값은 actualTotal인데, 그래서 총 계약가가 비어 있어도 항공료
   하나만 채워져 있으면 리마인드가 조용히 지나갔다 — 안전망이 있긴 한데 **엉뚱한 것을
   지키고 있었다**(결함 생성기 ③: 안전망은 실제로 그 일을 하는지까지 봐야 안전망이다).

   여기서 고정하는 것:
   ① 리마인드는 **actualTotal**을 본다. 항공료가 채워져 있어도 총 계약가가 비면 묻는다.
   ② 강제하지 않는다. 확인을 누르면 비워 둔 채로 저장된다 — 실제로 모르는 경우가 있고,
      막아 버리면 상태 자체를 안 바꾸게 되어 더 나빠진다.
   ③ 취소하면 **그 칸으로 데려간다.** 모달이 길어서 "넣어 달라"는 말만으로는 못 찾는다.
   ④ 놓친 것을 나중에 찾을 수 있다 — '실적 미입력' 필터와 목록 배지.
   ⑤ 할 일이 0건이면 노란 강조를 켜지 않는다. 늘 켜진 경고는 곧 아무도 안 본다.
   ⑥ (곁다리로 잡은 결함) 견적 관리 필터를 눌러도 **문의 관리 필터가 풀리지 않는다.**

   실행: node ai-loop/test_rG_actual_nudge.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const adminSrc = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const manualSrc = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');

const quote = (id, over) => Object.assign({
  id, ts: Date.now(), status: 'new', destKey: '도쿄', destLabel: '도쿄 (Tokyo)',
  orgName: '기관' + id, contact: '', programLabel: '', participants: 20, days: 5,
  total: 40000000, visibleTotal: 36000000, perPerson: 2000000, items: [],
  actualTotal: null, actualAirfareUnit: null, actualHotelUnit: null, actualMealUnit: null,
}, over || {});

(async () => {
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;

  /* ── [1] 리마인드가 무엇을 보는가 (①) ──────────────────────────────── */
  console.log('[1] 계약완료 전환 리마인드가 actualTotal을 보는가 (①)');
  const saveFn = (adminSrc.match(/async function saveEstimateDetail\(\)[\s\S]*?\n  \}/) || [''])[0];
  ok('저장 함수를 찾았다', saveFn.length > 0);
  ok('총 계약가가 비었는지를 조건으로 쓴다', /actualTotal == null/.test(saveFn), saveFn.slice(0, 300));
  ok('항공료·호텔만 보던 옛 조건이 남아 있지 않다',
    !/actualAirfareUnit == null && all\[idx\]\.actualHotelUnit == null/.test(saveFn),
    '그 조건이면 항공료 하나만 채워도 리마인드가 지나간다');
  ok('취소하면 그 칸으로 데려간다', /emFocusActualTotal\(\); return;/.test(saveFn));
  ok('데려가는 함수가 실제로 있다', typeof w.emFocusActualTotal === 'function' || /function emFocusActualTotal/.test(adminSrc));

  /* ── [2] 실제 동작 ─────────────────────────────────────────────────── */
  console.log('\n[2] 실제로 묻는가 / 안 묻는가 (①②③)');
  const asked = [];
  w.confirm = (msg) => { asked.push(msg); return true; };      /* 확인 = 비워 둔 채 저장 */

  async function saveWith(rows, id, nextStatus) {
    asked.length = 0;
    w.__setQuotes(rows);
    w.__openEst(id);
    d.getElementById('em-status-sel').value = nextStatus;
    await w.saveEstimateDetail();
  }

  await saveWith([quote('q1')], 'q1', 'contracted');
  ok('총 계약가가 비면 묻는다', asked.length === 1, String(asked.length));
  ok('무엇이 비었는지 이름을 댄다', /실제 총 계약가/.test(asked[0] || ''), (asked[0] || '').slice(0, 60));
  ok('왜 필요한지 말한다 (그냥 잔소리가 되지 않게)',
    /신뢰구간|정확도/.test(asked[0] || ''), (asked[0] || '').slice(0, 120));
  ok('지금 넣어야 하는 이유를 말한다', /나중에|계약할 때/.test(asked[0] || ''));

  /* ⚠ 이것이 이번에 고친 결함 그 자체다 */
  await saveWith([quote('q2', { actualAirfareUnit: 410000 })], 'q2', 'contracted');
  ok('항공료가 채워져 있어도 총 계약가가 비면 묻는다 (예전엔 안 물었다)',
    asked.length === 1, String(asked.length));

  await saveWith([quote('q3', { actualTotal: 42000000 })], 'q3', 'contracted');
  ok('총 계약가가 있으면 묻지 않는다', asked.length === 0, String(asked.length));

  await saveWith([quote('q4', { status: 'contracted' })], 'q4', 'contracted');
  ok('이미 계약완료였던 건을 다시 저장할 때는 묻지 않는다', asked.length === 0, String(asked.length));

  await saveWith([quote('q5')], 'q5', 'consulting');
  ok('상담중으로 바꿀 때는 묻지 않는다', asked.length === 0, String(asked.length));

  /* ② 강제하지 않는다 — 확인을 누르면 비워 둔 채로 저장된다.
     막아 버리면 담당자가 상태 자체를 안 바꾸게 되어 더 나빠진다. */
  w.confirm = () => true;
  await saveWith([quote('q6')], 'q6', 'contracted');
  ok('확인을 누르면 비워 둔 채로도 저장된다',
    w.__quotes().find((x) => x.id === 'q6').status === 'contracted',
    w.__quotes().find((x) => x.id === 'q6').status);
  ok('저장되면 모달이 닫힌다', d.getElementById('emModal').classList.contains('hidden'));

  /* ③ 취소하면 저장하지 않고 그 칸으로 데려간다 */
  w.confirm = () => false;
  await saveWith([quote('q7')], 'q7', 'contracted');
  ok('취소하면 저장하지 않는다',
    w.__quotes().find((x) => x.id === 'q7').status === 'new',
    w.__quotes().find((x) => x.id === 'q7').status);
  ok('모달을 열어 둔다 (바로 입력할 수 있게)',
    !d.getElementById('emModal').classList.contains('hidden'));
  ok('그 칸에 커서를 둔다', d.activeElement === d.getElementById('em-actual-total'),
    d.activeElement && d.activeElement.id);
  ok('그 칸을 잠깐 강조한다 (스크롤만으로는 어디인지 못 찾는다)',
    !!d.querySelector('.need-actual-hi'));
  w.confirm = () => true;

  /* ── [3] 놓친 것을 나중에 찾을 수 있는가 (④⑤) ─────────────────────── */
  console.log('\n[3] 놓친 건을 나중에 찾을 수 있는가 (④⑤)');
  w.__setQuotes([
    quote('a1', { status: 'contracted' }),                          /* 미입력 */
    quote('a2', { status: 'contracted', actualTotal: 1 }),          /* 입력됨 */
    quote('a3', { status: 'contracted' }),                          /* 미입력 */
    quote('a4', { status: 'new' }),                                 /* 계약 전 */
    quote('a5', { status: 'closed' }),
  ]);
  w.renderEstMgr();
  const btn = d.getElementById('emNeedsActualBtn');
  ok('실적 미입력 필터 버튼이 있다', !!btn);
  ok('개수를 숫자로 보여준다', /실적 미입력\s*2/.test(btn.textContent), btn.textContent);
  ok('할 일이 있으면 노랗게 켜진다', btn.classList.contains('has-work'));
  ok('무엇인지 툴팁으로 설명한다', /실제 총 계약가/.test(btn.title), btn.title);

  const rowsWithBadge = () => Array.from(d.querySelectorAll('#emBody tr'))
    .filter((tr) => tr.querySelector('.badge-need-actual'));
  ok('목록에서도 해당 행에 표시가 붙는다', rowsWithBadge().length === 2, String(rowsWithBadge().length));
  ok('계약 전 건에는 안 붙는다',
    Array.from(d.querySelectorAll('#emBody tr'))
      .filter((tr) => /신규|종료/.test(tr.textContent) && tr.querySelector('.badge-need-actual')).length === 0);

  btn.click();
  ok('필터를 누르면 그 건만 남는다', d.querySelectorAll('#emBody tr').length === 2,
    String(d.querySelectorAll('#emBody tr').length));
  ok('남은 것이 전부 미입력 건이다', rowsWithBadge().length === 2);
  d.querySelector('[data-emfilter="all"]').click();

  /* ⑤ 0건이면 강조를 켜지 않는다 — 늘 켜진 경고는 곧 아무도 안 본다 */
  w.__setQuotes([quote('b1', { status: 'contracted', actualTotal: 1 }), quote('b2', { status: 'new' })]);
  w.renderEstMgr();
  ok('0건이면 노란 강조를 끈다', !d.getElementById('emNeedsActualBtn').classList.contains('has-work'));
  ok('0건이면 숫자를 붙이지 않는다',
    d.getElementById('emNeedsActualBtn').textContent.trim() === '💰 실적 미입력',
    d.getElementById('emNeedsActualBtn').textContent);
  ok('0건이어도 버튼은 자리에 남는다 (사라졌다 나타나면 찾게 된다)',
    !!d.getElementById('emNeedsActualBtn'));
  ok('0건이면 그렇다고 말해 준다', /모두 입력/.test(d.getElementById('emNeedsActualBtn').title),
    d.getElementById('emNeedsActualBtn').title);

  /* ── [4] 곁다리로 잡은 결함: 필터가 서로를 건드리지 않는가 (⑥) ─────── */
  console.log('\n[4] 견적 필터를 눌러도 문의 필터가 풀리지 않는가 (⑥)');
  const inqBtns = () => Array.from(d.querySelectorAll('#tab-inquiries .filter-btn[data-filter]'));
  const activeInq = () => inqBtns().filter((b) => b.classList.contains('active'));
  inqBtns().find((b) => b.dataset.filter === 'unread').click();
  ok('문의 필터를 미확인으로 걸었다',
    activeInq().length === 1 && activeInq()[0].dataset.filter === 'unread',
    activeInq().map((b) => b.dataset.filter).join(','));
  d.querySelector('[data-emfilter="contracted"]').click();
  ok('견적 필터를 눌러도 문의 필터가 그대로다',
    activeInq().length === 1 && activeInq()[0].dataset.filter === 'unread',
    activeInq().map((b) => b.dataset.filter).join(',') || '(활성 버튼이 하나도 없다)');
  ok('견적 쪽 필터는 정상으로 켜진다',
    d.querySelector('[data-emfilter="contracted"]').classList.contains('active'));
  ok('핸들러가 탭 안으로 좁혀져 있다',
    /#tab-inquiries \.filter-btn\[data-filter\]/.test(adminSrc),
    '`.filter-btn` 전체를 잡으면 다른 탭 버튼까지 함께 반응한다');
  d.querySelector('[data-emfilter="all"]').click();

  /* ── [5] 매뉴얼 ────────────────────────────────────────────────────── */
  console.log('\n[5] 매뉴얼에 설명이 있는가');
  ok('실적 미입력 표시를 설명한다', /실적 미입력/.test(manualSrc));
  ok('왜 넣어야 하는지 적혀 있다', /계약할 때만|나중에 채우기/.test(manualSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setQuotes = (rows) => { localStorage.setItem(EM_KEY, JSON.stringify(rows)); };
  window.__quotes = () => JSON.parse(localStorage.getItem(EM_KEY) || '[]');
  window.__openEst = (id) => openEstDetail(id);
  window.renderEstMgr = renderEstMgr;
  window.saveEstimateDetail = saveEstimateDetail;
  window.emFocusActualTotal = emFocusActualTotal;
  currentUser = { id: '7', username: 'staff1', displayName: '김직원', role: 'staff' };
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      const json = (b, s = 200) => Promise.resolve({
        ok: s >= 200 && s < 300, status: s, json: () => Promise.resolve(b),
      });
      w.fetch = (url, opts) => {
        const method = (opts && opts.method) || 'GET';
        if (method === 'PATCH' || method === 'PUT') return json({ ok: true });
        return new Promise(() => {});
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

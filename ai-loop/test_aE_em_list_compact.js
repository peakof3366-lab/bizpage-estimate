/* ═══════════════════════════════════════════════════════════════════════════
   견적 관리 — 목록이 **한 화면에 들어오는가** · 저장·발급 줄이 **늘 보이는가**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-27 (대표: 「관리자 페이지 가독성 높이는 작업 이어서」)

   ■ 재 보니 (진짜 브라우저 · 1440×900 · 1280×900)
   ① 목록 표가 **1,431px**인데 보이는 폭은 1,169px(1440) / 1,016px(1280).
      맨 오른쪽 **담당자·「상세」 열이 화면 밖**이라 옆으로 밀어야 상세를 열 수 있었다.
      → 13열 → **9열**. 지운 열은 없다 — 짝지어 두 줄로 묶었다(견적서 대장과 같은 방식).
   ② 🔴 원가 기록이 `null`인 건이 **「원가 ₩0만 · 수익금 = 청구액 전액」**으로 찍혔다.
      목록과 금액 4칸이 `!== undefined`만 보고 `null`을 못 걸렀다(한 줄 요약·수익 요약은
      걸렀다 — 같은 셈이 네 곳에 따로 적혀 있었다). → `emMoney()` 한 곳.
   ③ 직원용 탭에서 저장·발급 줄이 **1,469px 아래**(화면 900px). 위에 고치기 화면이 있어
      늘 끝까지 내려가야 했다. → 본문 맨 끝에 붙인 sticky 띠.
      ⚠ sticky는 **부모 상자 밖으로 못 나간다.** 예전 자리(상태+메모 칸 안)에 두면
        그 칸이 화면에 들어오기 전까지 안 붙는다 — 그래서 자리를 옮겼다. [5]가 그 자리를 잰다.

   ⚠ jsdom은 폭을 모른다. 폭은 **CSS 소스**로 잰다(min-width). 진짜 폭은 브라우저로
     쟀고(위 숫자) 그건 `check_admin_screens.py`의 몫이다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage } = require('./_page_boot.js');
const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const 견적 = (id, kw) => Object.assign({
  id, ts: new Date().toISOString(), destKey: '다낭', destLabel: '다낭',
  participants: 30, days: 4, nights: 3, total: 56696074, perPerson: 1889869,
  visibleTotal: 35000000, orgName: '[가상] 새롬물산', contact: '[가상] 김담당',
  status: 'new', basis: 'engine', quoteNo: 'BP-2609-00' + id.slice(-2),
  items: [{ name: '항공', amount: 20000000 }, { name: '호텔', amount: 15000000 }],
}, kw || {});
const 목록 = [
  견적('q-aE-01'),
  견적('q-aE-02', { visibleTotal: null, orgName: '[가상] 원가없음상사' }),   /* 🔴 ② 의 그 건 */
  견적('q-aE-03', { visibleTotal: undefined, orgName: '[가상] 옛기록' }),
  견적('q-aE-04', { orgName: '[가상] 문서있음', doc: {
    meta: { client: '[가상] 문서있음', staffName: '[가상] 김담당', title: '견적서' },
    trip: { pax: 30, days: 4, nights: 3 },
    price: { lines: [{ kind: 'adult', label: '성인', unit: 1889869, qty: 30 }], total: 56696074 },
    details: [], itinerary: [{ day: 1, title: '인천 → 다낭', am: '출발', pm: '도착', eve: '', meals: {}, stay: '', note: '' }],
  } }),
];

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

(async () => {
  /* ═══ ① 머리줄 — 9열 · 짝 칸 ═══════════════════════════════════════════ */
  const HTML = read('admin.html');
  const thead = (HTML.match(/<table id="emTable"[\s\S]*?<\/thead>/) || [''])[0];
  const ths = (thead.match(/<th\b/g) || []).length;
  ok('[1] 🔴 목록이 9열이다 (13열이면 「상세」가 화면 밖)', ths === 9, ths + '열');
  ok('[1-b] 짝 칸 이름이 있다', /견적번호 · 접수/.test(thead) && /기관 · 목적지/.test(thead) && />이익률</.test(thead));

  /* ═══ ② 폭 — 1280 노트북(보이는 폭 1,016px)에 들어가야 한다 ══════════════ */
  const CSS = read('admin.css');
  const mw = (strip(CSS).match(/#emTable\s*\{\s*min-width:\s*(\d+)px/) || [])[1];
  ok('[2] 🔴 표 최소 폭이 1,016px 이하다', mw && Number(mw) <= 1016, (mw || '없음') + 'px');
  ok('[2-b] 기관 칸만 꺾인다 (나머지 짧은 값은 한 줄)',
    /#emTable td\.em-who\s*\{\s*white-space:\s*normal/.test(CSS));

  /* ═══ ③ 셈은 한 곳 ════════════════════════════════════════════════════ */
  const EST = strip(read(path.join('admin', 'estmgr.js')));
  /* ⚠ 「`visibleTotal !==` 꼴을 센다」로 짰다가 0곳으로 빨개졌다 — emMoney는 값을 변수에
     담고 가린다. 꼴이 아니라 **원가를 읽는 자리의 수**를 센다(주석은 걷고). */
  const reads = (EST.match(/\bvisibleTotal\b/g) || []).length;
  const inMoney = /function emMoney\([^)]*\)\s*\{[^}]*\bvisibleTotal\b/.test(EST);
  ok('[3] 🔴 원가를 읽는 자리가 estmgr.js에 한 곳뿐이고 그게 emMoney다', reads === 1 && inMoney,
    reads + '곳 · emMoney 안=' + inMoney);

  /* ═══ ④ 그려진 목록 — 숫자를 **글자에서 다시 읽어** 맞춘다 ═══════════════ */
  const fx = adminFixtures('filled');
  const orig = fx.route;
  fx.route = function (u, opt, json) {
    const s = String(u);
    if (s.includes('/api/quotes') && !s.includes('quote-shares')) return json(목록);
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin.html', { fixtures: fx });
  await B.ready;
  await enterDashboard(B);
  await B.tick(350);
  const D = B.doc;
  const run = (code) => { const s = D.createElement('script'); s.textContent = code; D.body.appendChild(s); };
  run("localStorage.setItem('linkedt_estimates_full', JSON.stringify(" + JSON.stringify(목록.slice().reverse()) + ")); switchTab('estmgr'); renderEstMgr();");
  await B.tick(300);

  /* ═══ ⑨ 숫자 카드는 「견적 분석」으로 (2026-09-27) — 총 건수·오늘 견적은 그쪽이 같은 값을 셌다 ═══ */
  ok('[9] 견적 관리에 숫자 카드가 없다 (목록이 맨 위)', !D.querySelector('#tab-estmgr .stat-grid'));
  run("renderEstimates();");
  await B.tick(50);
  const num9 = (id) => ((D.getElementById(id) || {}).textContent || '').trim();
  /* 청구 합 = 56,696,074 × 4 = 226,784,296 → 22,678만 · 평균 5,670만 */
  ok('[9-b] 🔴 옮긴 두 숫자가 견적 분석에서 같은 셈으로 나온다',
    num9('e-revenue') === '22,678' && num9('e-avgdeal') === '5,670', num9('e-revenue') + ' / ' + num9('e-avgdeal'));
  ok('[9-c] 겹치던 둘은 견적 분석에 그대로 있다', num9('e-total') === '4');

  const rows = Array.from(D.querySelectorAll('#emBody tr'));
  ok('[4] 줄이 넷이다', rows.length === 4, String(rows.length));
  const rowOf = (org) => rows.find((r) => (r.textContent || '').includes(org));
  const cells = (r) => r ? Array.from(r.children) : [];
  ok('[4-b] 🔴 줄마다 칸이 머리줄과 같은 9개다', rows.every((r) => r.children.length === 9),
    rows.map((r) => r.children.length).join(','));

  const good = rowOf('새롬물산');
  const gc = cells(good);
  const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  ok('[4-c] 첫 칸 둘째 줄에 접수일시가 있다', /\d{2}\. \d{2}\. \d{2}\./.test(txt(gc[1])), txt(gc[1]));
  ok('[4-d] 기관명이 목적지보다 먼저다', /^\[가상\] 새롬물산.*다낭/.test(txt(gc[2])), txt(gc[2]));
  ok('[4-e] 청구 금액 아래에 1인당이 있다', /₩5,670만.*1인당 ₩189만/.test(txt(gc[4])), txt(gc[4]));
  /* 이익률 = (56,696,074 − 35,000,000) / 56,696,074 = 38.3% · 이익 2,170만 */
  ok('[4-f] 🔴 이익률이 청구·원가에서 나온 값이다', /38\.3%.*이익 ₩2,170만/.test(txt(gc[5])), txt(gc[5]));
  ok('[4-g] 원가는 풍선말에 남아 있다 (지운 것이 아니다)', /원가 ₩3,500만/.test((gc[5] && gc[5].getAttribute('title')) || ''));
  ok('[4-h] 「상세」 버튼이 마지막 칸에 있다', /상세/.test(txt(gc[8])));

  for (const org of ['원가없음상사', '옛기록']) {
    const bc = cells(rowOf(org));
    ok('[4-i] 🔴 원가를 모르면 「—」다 (' + org + ')', /—.*원가 기록 없음/.test(txt(bc[5])), txt(bc[5]));
    ok('[4-j] 🔴 「₩0만」도 「100%」도 지어내지 않는다 (' + org + ')',
      !/₩0만|100\.0%/.test(txt(rowOf(org))), txt(rowOf(org)));
  }

  /* ═══ ⑤ 상세 — 저장·발급 줄이 창 아래에 붙는다 ════════════════════════════ */
  run("openEstDetail('q-aE-02');");
  await B.tick(300);
  const body = D.getElementById('emModalBody');
  const bar = D.getElementById('em-actbar');
  ok('[5] 저장·발급 줄이 있다', !!bar);
  ok('[5-b] 🔴 본문의 **직계 자식**이다 (아니면 sticky가 안 붙는다)', !!bar && bar.parentElement === body,
    bar && bar.parentElement ? bar.parentElement.id || bar.parentElement.className : '');
  ok('[5-c] 본문의 맨 끝이다', !!bar && body.lastElementChild === bar);
  /* S-1 ④ (2026-09-27): 「기관 정보·연수 조건」은 한 줄 요약·고치기 ①과 겹쳐 「자세히」로 접었다.
     🔴 접는 김에 **고객 담당자 이름**이 숨으면 안 된다 — 한 줄 요약으로 올렸다. */
  const info = D.getElementById('em-sec-info');
  ok('[10] 기관 정보 칸이 「자세히」 안에 있다 (지운 것이 아니다)',
    !!info && D.getElementById('em-more-box').contains(info));
  ok('[10-b] 🔴 고객 담당자 이름이 한 줄 요약에 있다',
    /담당 \[가상\] 김담당/.test(txt(D.getElementById('em-head-sum'))), txt(D.getElementById('em-head-sum')));
  ok('[5-d] 발급 버튼과 「보낼 문서」 체크가 같은 줄에 있다',
    !!bar && !!bar.querySelector('#emPartBd') && !!bar.querySelector('#emPartIti')
    && /issueShareLink\(\)/.test(bar.innerHTML));
  /* 🔴 2026-09-27 바깥 「저장」을 없앴다 — 상태·담당자는 고르면, 메모는 칸을 떠나면 저장된다.
     부르는 자리가 없어지면 **아무것도 저장 안 되는 화면**이 되므로 그 자리를 잠근다. */
  ok('[5-h] 🔴 상태를 고르면 저장된다', /saveEstimateDetail\(\)/.test(D.getElementById('em-status-sel').getAttribute('onchange') || ''));
  ok('[5-i] 🔴 담당자를 고르면 (확인 뒤) 저장된다', /confirmAssigneeSelect\(this\)\) saveEstimateDetail\(\)/.test(D.getElementById('em-assignee-sel').getAttribute('onchange') || ''));
  ok('[5-j] 🔴 메모는 칸을 떠나면 저장된다', /saveEstimateDetail\(\)/.test(D.getElementById('em-note-area').getAttribute('onchange') || ''));
  ok('[5-k] 아래 줄에 「저장」 버튼이 없다 (고치기 안의 「견적 저장하기」와 겹쳤다)',
    !Array.from(bar.querySelectorAll('button')).some((x) => (x.textContent || '').trim() === '저장'));
  ok('[5-l] 강조 버튼은 발급 하나다', Array.from(bar.querySelectorAll('.btn-primary')).map((x) => (x.textContent || '').trim()).join() === '🔗 견적서 링크 발급');
  ok('[5-e] 🔴 CSS가 창 아래에 붙인다',
    /#emModal \.em-actbar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/.test(CSS));
  /* 🔴 (2026-09-27) 「기관 정보·연수 조건」 칸이 **인라인 display:grid로 덮는 규칙을 이겨**
     고객용 탭에 떠 있었다(9/23부터). jsdom이 인라인·!important 우열을 믿을 만큼 계산하는지
     모르므로 **소스로도** 잠근다: 덮는 규칙이 !important이고, 직계 칸에 인라인 display가 없다. */
  const custLeak = Array.from(body.children).filter((c) => !c.classList.contains('em-tabbar')
    && c.id !== 'emTabCust' && B.win.getComputedStyle(c).display !== 'none');
  ok('[5-m] 🔴 고객용 탭에 직원용 칸이 하나도 안 보인다', custLeak.length === 0,
    custLeak.map((c) => c.id || c.className || c.tagName).join(','));
  ok('[5-n] 🔴 덮는 규칙이 !important다 (인라인 display에 지지 않게)',
    /#emModalBody\[data-emtab="cust"\] > \*:not\(\.em-tabbar\):not\(#emTabCust\) \{ display:none !important; \}/.test(CSS));
  const inlineDisp = Array.from(body.children).filter((c) => /display\s*:/.test(c.getAttribute('style') || ''));
  ok('[5-o] 본문 직계 칸에 인라인 display가 없다', inlineDisp.length === 0,
    inlineDisp.map((c) => c.id || c.className || c.tagName).join(','));
  ok('[5-f] 🔴 고객용 탭에서는 덮인다 (고객용엔 원가 칸이 없다 — 저장할 것도 없다)',
    B.win.getComputedStyle(bar).display === 'none', B.win.getComputedStyle(bar).display);
  run("emSetTab('staff');");
  await B.tick(120);
  ok('[5-g] 직원용 탭에서는 보인다', B.win.getComputedStyle(bar).display !== 'none');

  /* ═══ ⑦ 겹치는 버튼 정리 (2026-09-27 대표: 「기능이 겹치는 버튼 정리」) ═════════
     아래 줄이 7개였다 → 「닫기」(✕와 같은 함수)는 지우고, 가끔 쓰는 셋은 「⋯ 더보기」로.
     「고객 화면 미리보기」는 고객용 탭과 겹쳐 **문서 없는 옛 견적에서만** 메뉴에 뜬다. */
  const menu = D.getElementById('em-moremenu');
  const barBtns = Array.from(bar.querySelectorAll('button, summary'))
    .filter((x) => !(menu && menu.contains(x) && x.tagName !== 'SUMMARY'));
  ok('[7] 🔴 아래 줄에 바로 보이는 버튼이 넷 이하다 (예전 7)', barBtns.length <= 4,
    barBtns.length + '개 — ' + barBtns.map((x) => txt(x)).join(','));
  ok('[7-b] 🔴 「닫기」가 없다 (머리의 ✕와 같은 일)', !barBtns.some((x) => txt(x) === '닫기'));
  const inMenu = menu ? txt(menu) : '';
  ok('[7-c] 🔴 지운 것이 아니다 — 출력·복사·삭제가 메뉴 안에 있다',
    /관리자용 출력/.test(inMenu) && /이 견적 복사/.test(inMenu) && /삭제/.test(inMenu), inMenu.slice(0, 80));
  ok('[7-d] 삭제 버튼 id가 그대로다 (권한 코드가 그 id로 감춘다)',
    !!menu && !!menu.querySelector('#btnDeleteQuote'));
  const pv = D.getElementById('emMorePreview');
  ok('[8] 문서 없는 옛 견적에는 「일정 확인·수정」이 있다 (그 건은 여기 일정이 나간다)',
    !D.getElementById('emItiEditBtn').classList.contains('hidden'));
  ok('[7-e] 문서 없는 옛 견적에서는 미리보기가 메뉴에 있다 (고객용 탭이 비므로)',
    !!pv && !pv.classList.contains('hidden'));
  ok('[7-f] 🔴 메뉴 안 버튼 CSS가 `.hidden`을 이기지 않는다',
    /#emModal \.em-moremenu-list button:not\(\.hidden\)/.test(CSS)
    && !/#emModal \.em-moremenu-list button\s*\{[^}]*display/.test(CSS));

  /* 한 줄 요약·금액 4칸·수익 요약도 같은 셈 — 원가 없는 건에서 지어내지 않는다 */
  const sum = txt(D.getElementById('em-head-sum'));
  ok('[6] 🔴 한 줄 요약이 원가 없는 건에 이익률을 지어내지 않는다', /이익률 —/.test(sum) && !/이익률 \d/.test(sum), sum);
  ok('[6-b] 🔴 금액 4칸의 원가가 ₩0이 아니다', !/^₩0$/.test(txt(D.getElementById('em-fulltotal'))), txt(D.getElementById('em-fulltotal')));
  ok('[6-c] 🔴 수익금이 청구액 전액으로 찍히지 않는다', txt(D.getElementById('em-profit')) === '—', txt(D.getElementById('em-profit')));
  const ps = D.getElementById('em-profit-summary');
  const rateCard = ps && ps.querySelector('[data-v="rate"]');
  ok('[6-d] 수익 요약 이익률도 「—」다', !!rateCard && txt(rateCard) === '—', rateCard ? txt(rateCard) : '없음');
  ok('[6-e] 수익 요약이 왜 비었는지 말한다', /원가가 없어 이익을 셀 수 없습니다/.test(txt(ps)));

  /* 문서가 붙은 건 — 미리보기는 고객용 탭이 한다(겹치는 버튼은 감춘다) */
  run("emSetTab('cust'); openEstDetail('q-aE-04');");
  await B.tick(300);
  ok('[7-g] 🔴 문서가 있는 건에서는 미리보기 메뉴가 감춰진다 (고객용 탭과 같은 일)',
    D.getElementById('emMorePreview').classList.contains('hidden'));
  /* 🔴 문서가 있는 건은 문서의 일정이 나간다 — 여기 버튼으로 고친 일정은 **안 나가는데**
     버튼은 떠 있었다(누르면 헛일). 진짜 자리를 글로 가리킨다. */
  ok('[8-b] 🔴 문서가 있는 건에서는 「일정 확인·수정」이 감춰진다',
    D.getElementById('emItiEditBtn').classList.contains('hidden'));
  ok('[8-c] 대신 고칠 자리를 말한다', /수정하기/.test(txt(D.getElementById('em-iti-state'))), txt(D.getElementById('em-iti-state')));
  B.win.close();

  console.log('\n' + '─'.repeat(64));
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — aE 견적 관리 목록·발급 줄');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('터짐:', e); process.exit(1); });

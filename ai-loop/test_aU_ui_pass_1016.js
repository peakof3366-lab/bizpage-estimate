/* 관리자 UI/UX 2026-10-16 — 사람 눈이 먼저 본 것을 고치고, 자가 다음엔 보게 했다 (대표 「UI UX 개선 작업 계속 진행」)

   1280 노트북으로 주요 탭을 찍어 보니 자(check_admin_screens)가 「🔴 0」인데 화면에 결함이 있었다:
   ① 🔴 견적서 대장 — 표가 127px 넘쳐 **고정 조작 열이 「상태」 열을 덮었다**(머리글 「상E」).
      표 안 가로 스크롤이라 자는 안 셌다 → `_screen_probe.py` ⑨ 신설(1280 이상이면 🔴).
   ② 🔴 요율 관리 — 같은 일(+73px, 「⚠ 확인」에서 잘림) + 「경과」 칸에서 「4개월」이 「4개 / 월」.
      → 기준월·경과를 짝 칸으로(열 11 → 10) · 1400px 아래 조작 버튼 여백 축소.
   ③ 🔴 문의 관리 — 연락처가 「010-1234- / 5678」. 자에 잣대(⑧)가 이미 있었는데 **문의를 빈 목록으로 재고 있었다**
      → 가상 데이터에 문의를 싣는다(make_admin_fixture.js).
   ④ 대장 「바꾼 사람 · 2026-09- / 28」 — 날짜가 갈렸다 → ⑧에 날짜 모양 추가.
   ⑤ 대시보드 — 방문 0명인 주에 같은 높이 막대 7개(0도 2px로 그렸다) → 전부 0이면 말한다.
   ⑥ 견적 작성 — 표 밖에 혼자 선 작은 버튼(「+ 하루 추가」 등) 32 → 44px.

   jsdom은 폭을 모른다 — 폭은 브라우저 도구가 잰다(`python ai-loop/check_admin_screens.py`).
   여기서는 **구조**(열 수 · colspan · 줄 모양 · 문구 · 규칙 순서)를 지킨다.
   실행: node ai-loop/test_aU_ui_pass_1016.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const CSS = read('admin.css');
  const { bootPage } = require('./_page_boot.js');
  const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');
  const B = bootPage('admin.html', { fixtures: adminFixtures('filled') });
  await B.ready;
  const { entered } = await enterDashboard(B);
  ok('관리자 화면에 들어갔다', entered);
  const ev = (s) => B.win.eval(s);
  const D = B.doc;

  console.log('[1] 요율 표 — 기준월·경과 짝 칸 · 묶음 줄이 표 폭과 맞는가');
  ev(`switchTab('rates'); renderRates();`);
  await B.tick(200);
  const t = [...D.querySelectorAll('#tab-rates table.rate-table')].find((x) => x.querySelector('#rate-tbody'));
  const ths = t ? t.querySelectorAll('thead th').length : 0;
  ok('머리글 10칸(「경과」가 따로 없다)', ths === 10 && ![...t.querySelectorAll('thead th')].some((th) => th.textContent.trim() === '경과'), String(ths));
  ok('「요율 기준월」 머리글 둘째 줄이 「경과」', t && /요율 기준월\s*경과/.test(t.querySelector('thead').textContent.replace(/\s+/g, ' ')));
  const row = D.querySelector('#rate-tbody tr:not(.rate-region-row)');
  ok('줄의 칸 수 = 머리글 칸 수', row && row.children.length === ths, row && row.children.length + ' / ' + ths);
  const spans = [...D.querySelectorAll('#rate-tbody td[colspan]')].map((td) => Number(td.getAttribute('colspan')));
  ok('🔴 지역 묶음 줄(colspan)이 표 폭과 같다 — 어긋나면 머리줄이 깨진다', spans.length > 0 && spans.every((n) => n === ths), spans.slice(0, 3).join(','));
  ok('rates.js에 옛 colspan="11"이 남아 있지 않다', !/colspan="11"/.test(read('admin/rates.js')));
  const ageCell = row && [...row.children].find((td) => /\d{4}\.\d{2}/.test(td.textContent));
  ok('경과는 「N개월 전」으로 기준월 아래 줄 · 칸은 줄바꿈 금지', !!ageCell && /개월 전|—/.test((ageCell.querySelector('.sub') || {}).textContent || '')
    && /nowrap/.test(ageCell.getAttribute('style') || ''), ageCell && ageCell.innerHTML);

  console.log('\n[2] 🔴 CSS — 규칙 순서 · 줄바꿈 금지');
  const base = CSS.indexOf('.rate-table td:last-child > .btn-detail,');
  const narrow = CSS.indexOf('@media (max-width: 1400px) { .rate-table td:last-child > .btn-detail');
  ok('요율 조작 버튼 좁히기가 **기본 규칙 뒤**에 있다(앞에 두면 같은 우선순위라 안 먹는다 — 처음에 그랬다)', base > 0 && narrow > base, base + ' / ' + narrow);
  ok('대장 조작 버튼은 1400px 아래에서 한 줄로 쌓는다', /@media \(max-width: 1400px\) \{ #ledList \.led-acts \{ grid-template-columns: max-content; \}/.test(CSS));
  ok('「견적 기록 삭제됨」이 「이전 판 n개」 옆에 붙지 않는다(display: table)', /\.led-gone \{[^}]*display: table;/.test(CSS));
  ok('문의 관리 연락처는 한 덩어리(nowrap)', /#inqTable \.inq-sub \{[^}]*white-space: nowrap;/.test(CSS));
  ok('견적 작성 — 표 밖 작은 버튼 44px', /\.bar \.btn-sm \{ min-height: 44px;/.test(read('admin-quote-pro.html')));

  console.log('\n[3] 대장 「바꾼 사람 · 날짜」 — 날짜는 한 덩어리');
  ev(`switchTab('ledger')`);
  await B.tick(300);
  const by = D.querySelector('#ledList .led-st-by:not([hidden])');
  const src = read('admin/ledger.js');
  ok('그리는 곳 · 저장 뒤 고치는 곳 둘 다 날짜를 nowrap 칸에', (src.match(/' · <span class="nowrap">' \+ esc\(day\(/g) || []).length === 2);
  ok('「.nowrap」 규칙이 있다', /\n\.nowrap \{ white-space: nowrap; \}/.test(CSS));
  if (by) ok('(그려진 줄) 날짜가 nowrap 칸 안', !!by.querySelector('.nowrap'), by.innerHTML);

  console.log('\n[4] 대시보드 막대 — 전부 0이면 말한다');
  ev(`renderBarChart('visit-chart', [{label:'10/10',value:0},{label:'10/11',value:0}], 100, '최근 7일 동안 기록된 홈페이지 방문이 없습니다.')`);
  const vc = D.getElementById('visit-chart');
  ok('전부 0 → 막대 대신 무엇이 없는지 말한다', vc && !vc.querySelector('.bar') && /방문이 없습니다/.test(vc.textContent), vc && vc.innerHTML.slice(0, 80));
  ev(`renderBarChart('visit-chart', [{label:'10/10',value:0},{label:'10/11',value:3}], 100, '없습니다')`);
  ok('하나라도 있으면 예전처럼 막대(0인 날도 자리는 남는다)', vc.querySelectorAll('.bar').length === 2);
  ev(`renderBarChart('visit-chart', [{label:'a',value:0}], 100)`);
  ok('문구를 안 준 곳은 예전 그대로(지어내지 않는다)', vc.querySelectorAll('.bar').length === 1);
  const admin = read('admin.html');
  ok('부르는 네 곳이 모두 문구를 준다', (admin.match(/renderBarChart\('(visit-chart|chart-14d|chart-hour|chart-dow)'[^;]*,\s*'[^']+'\)/g) || []).length === 4);

  console.log('\n[5] 자(check_admin_screens · _screen_probe)가 이번 것을 다음엔 본다');
  const probe = read('ai-loop/_screen_probe.py');
  ok('⑨ 「표가 넘쳐 고정 열이 내용 열을 덮는다」 잣대', /out\.stickyOver/.test(probe) && /STICKY_FAIL_FROM = 1280/.test(probe));
  ok('⑨ 자가 시험(망가진 표 + 딱 맞는 대조군)', /⑨ 넘쳐서 고정 열이 내용을 덮는 표를 못 잡았다/.test(probe) && /⑨ 딱 맞는 표\(대조군\)/.test(probe));
  ok('⑧ 날짜 모양이 숫자 갈림 잣대에', /20\\d\{2\}\[-\.\]\\d\{2\}\[-\.\]\\d\{2\}/.test(probe) && /두 줄로 갈린 날짜를 못 잡았다/.test(probe));
  const chk = read('ai-loop/check_admin_screens.py');
  ok('🔴 문의 관리를 빈 목록으로 재지 않는다(가상 데이터의 문의)', /return ok\(fx\.get\("inquiries", \[\]\)\)/.test(chk) && /"inquiries": "#inqBody tr"/.test(chk));
  ok('가상 데이터 만드는 곳이 문의를 싣는다(이름·연락처·내용은 바꿔서)', /inquiries: \(d\.inquiries \|\| \[\]\)/.test(read('ai-loop/make_admin_fixture.js'))
    && /fakeFor\('inqName'/.test(read('ai-loop/make_admin_fixture.js')));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('크래시:', e); console.log(`\n결과: ${pass} pass / ${fail + 1} fail`); process.exit(1); });

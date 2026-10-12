/* 관리자 화면 편의성 (2026-10-12, 대표 「유저 편의성을 최대한 감안해서 더 손볼 곳」)

   ① 「전체 읽음」 — 안 읽은 문의가 0건이어도 눌렸고, 눌러도 아무 말이 없었다(관리자 버튼 전수 검사 「조용함」).
      → 몇 건인지 버튼이 말하고, 0건이면 못 누른다.
   ② 사이드바 — 메뉴를 옮겨 다니면 **자동으로 펼친 묶음이 안 접혀** 대여섯 개가 다 펼쳐졌다.
      → 자동으로 펼친 것만 떠날 때 접는다. 사람이 펼친 묶음은 그대로, 저장도 사람이 펼친 것만.
   ③ 입력칸 포커스 띠 — Tab 위치가 안 보이던 칸 6종(테두리 1px 색만 바뀜) → 한 곳에서 띠를 준다.

   ①②는 jsdom으로 실제로 눌러 본다. ③은 브라우저로 쟀다(Tab 196곳 중 안 보인 곳 28 → 0, 날짜 칸 하위 칸 2 제외).

   실행: node ai-loop/test_aR_admin_convenience.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const { bootPage } = require('./_page_boot.js');
  const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');
  const B = bootPage('admin.html', { fixtures: adminFixtures('filled') });
  await B.ready;
  const { entered } = await enterDashboard(B);
  ok('대시보드에 들어갔다', entered);
  const ev = (s) => B.win.eval(s);

  console.log('[1] 「전체 읽음」이 몇 건인지 말하고, 0건이면 못 누른다');
  const btn = () => B.doc.getElementById('markAllReadBtn');
  ev(`set(KEYS.contacts, [{id:'a',name:'가',org:'',message:'',read:false},{id:'b',name:'나',org:'',message:'',read:false},{id:'c',name:'다',org:'',message:'',read:true}]); renderInquiries();`);
  ok('안 읽은 2건 → 「전체 읽음 (2)」 · 누를 수 있다', btn().textContent === '전체 읽음 (2)' && !btn().disabled, btn().textContent + ' / ' + btn().disabled);
  ok('풀이말이 무엇을 하는지 말한다', /2건을 읽음으로/.test(btn().title), btn().title);
  ev(`set(KEYS.contacts, [{id:'c',name:'다',org:'',message:'',read:true}]); renderInquiries();`);
  ok('🔴 안 읽은 문의가 없으면 누를 수 없다', btn().disabled === true && btn().textContent === '전체 읽음', btn().textContent + ' / ' + btn().disabled);
  ok('못 누르는 이유를 풍선말로 말한다', /없습니다/.test(btn().title), btn().title);

  console.log('[2] 사이드바 — 자동으로 펼친 묶음은 떠나면 접는다');
  const open = () => [...B.doc.querySelectorAll('.sb-group.open')].map((g) => g.dataset.group).sort().join(',');
  const go = (t) => ev(`switchTab(${JSON.stringify(t)})`);
  go('dashboard');
  const base = open();
  go('rates');
  ok('요율 관리로 가면 「기준 정보」가 펼쳐진다', open().split(',').includes('base'), open());
  go('ledger');
  ok('🔴 견적서 대장으로 옮기면 「기준 정보」는 다시 접힌다', !open().split(',').includes('base') && open().split(',').includes('docs'), open());
  go('stats'); go('packages'); go('dashboard');
  ok('🔴 여러 번 옮겨 다녀도 묶음이 쌓이지 않는다(처음 상태로 돌아온다)', open() === base, base + ' → ' + open());
  /* 사람이 펼친 묶음은 남는다 */
  ev(`document.querySelector('.sb-group[data-group="look"] .sb-group-head').click()`);
  go('rates'); go('ledger');
  ok('사람이 직접 펼친 「분석」은 다른 화면으로 가도 남는다', open().split(',').includes('look'), open());
  let saved = null;
  try { saved = JSON.parse(B.win.localStorage.getItem('bizpage.sidebarGroups')); } catch (e) { saved = null; }
  ok('🔴 저장은 사람이 펼친 것만 — 자동으로 펼친 「견적서 관리」는 저장하지 않는다',
    Array.isArray(saved) && saved.includes('look') && !saved.includes('docs'), JSON.stringify(saved));

  console.log('[3] 입력칸 포커스 띠 — 한 곳에서');
  const CSS = fs.readFileSync(path.join(ROOT, 'admin.css'), 'utf8');
  ok('모든 입력칸에 포커스 띠를 주는 규칙이 있다(우선순위 0)',
    /:where\(input:not\(\[type=checkbox\][^)]*\)[^{]*select, textarea\):focus \{\s*box-shadow: 0 0 0 3px/.test(CSS));
  ok('설정 화면 칸도 띠가 있다', /\.pw-input:focus \{[^}]*box-shadow: 0 0 0 3px/.test(CSS));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('크래시:', e); console.log(`\n결과: ${pass} pass / ${fail + 1} fail`); process.exit(1); });

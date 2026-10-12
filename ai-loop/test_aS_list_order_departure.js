/* 목록 순서 · 출발일 (2026-10-12, 견적 관리 화면 개선 1회차 — 대표 위임 「질문의 답은 스스로 숙고해서」)

   ① 🔴 문의 관리 · 견적 관리 · 대시보드 「최근 문의」가 **오래된 것을 맨 위에** 그렸다.
      서버가 이미 최신순(order by created_at desc)으로 주는데, 브라우저에 쌓던 시절의 `reverse()`가 남아 두 번 뒤집혔다.
      「최근 문의」 카드는 가장 오래된 5건이었다. → 시각으로 직접 정렬(common.js newestFirst).
   ② 견적 관리에 출발일이 없어 급한 건을 고르려면 상세를 하나씩 열어야 했다.
      → 「인원/기간」 칸 둘째 줄에 「출발 10/22 · D-10」. 진행 중 + 30일 이내면 경고색 + 굵게(색만으로 말하지 않는다).
      → 「접수 최신순 / 출발 임박순」 고르기.
   실측(운영 백업 기반 가상 데이터): 광주보건대학교 건이 출발 D-10 · 미배정 · 신규로 드러났다.

   jsdom으로 실제로 그려서 줄 순서와 글자를 읽는다.
   실행: node ai-loop/test_aS_list_order_departure.js  (프로젝트 루트에서) */
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
  const day = (n) => { const d = new Date(Date.now() + 9 * 3600e3 + n * 864e5); return d.toISOString().slice(0, 10); };

  console.log('[1] newestFirst — 저장 순서와 무관하게 최신이 위');
  const out = ev(`newestFirst([{id:'a',t:'2026-10-01T00:00:00Z'},{id:'b',t:'2026-10-05T00:00:00Z'},{id:'c'},{id:'d',t:'2026-10-03T00:00:00Z'}], 't').map(x=>x.id).join('')`);
  ok('시각순 · 시각 없는 줄은 맨 아래', out === 'bdac', out);

  console.log('[2] 견적 관리 — 기본은 최신 접수가 위');
  /* 서버처럼 **최신순**으로 넣는다 — 예전 코드는 이걸 뒤집어 오래된 것을 위로 올렸다 */
  const Q = [
    { id: 'q3', quoteNo: 'BP-3', ts: '2026-10-06T00:00:00Z', status: 'new', startDate: day(66), participants: 30, days: 5 },
    { id: 'q2', quoteNo: 'BP-2', ts: '2026-10-05T00:00:00Z', status: 'new', startDate: day(10), participants: 14, days: 3 },
    { id: 'q1', quoteNo: 'BP-1', ts: '2026-09-28T00:00:00Z', status: 'contracted', startDate: day(5), participants: 40, days: 5 },
    { id: 'q0', quoteNo: 'BP-0', ts: '2026-09-20T00:00:00Z', status: 'closed', startDate: day(-3), participants: 10, days: 4 },
    { id: 'qx', quoteNo: 'BP-X', ts: '2026-09-10T00:00:00Z', status: 'new', participants: 8, days: 3 },
  ];
  ev(`localStorage.setItem(EM_KEY, ${JSON.stringify(JSON.stringify(Q))}); switchTab('estmgr'); renderEstMgr();`);
  const rows = () => [...B.doc.querySelectorAll('#emBody tr')].map((tr) => tr.querySelector('.em-qno strong').textContent);
  ok('🔴 최신 접수가 맨 위(서버 순서를 뒤집지 않는다)', rows().join(',') === 'BP-3,BP-2,BP-1,BP-0,BP-X', rows().join(','));

  console.log('[3] 출발일 — 인원/기간 칸 둘째 줄');
  const dep = (no) => { const tr = [...B.doc.querySelectorAll('#emBody tr')].find((r) => r.querySelector('.em-qno strong').textContent === no); return tr && tr.querySelector('.em-dep'); };
  ok('출발일과 남은 날을 글자로', /출발 \d+\/\d+ · D-10/.test((dep('BP-2') || {}).textContent || ''), (dep('BP-2') || {}).textContent);
  ok('🔴 진행 중 + 30일 이내 → 강조(색 + 굵게 + D-n 글자)', dep('BP-2') && dep('BP-2').classList.contains('em-dep-soon'));
  ok('먼 출발(D-66)은 강조하지 않는다', dep('BP-3') && !dep('BP-3').classList.contains('em-dep-soon'));
  ok('끝난 건(계약완료)은 가까워도 강조하지 않는다 — 할 일이 아니다', dep('BP-1') && !dep('BP-1').classList.contains('em-dep-soon'));
  ok('지난 출발은 「출발 지남」', /출발 지남/.test((dep('BP-0') || {}).textContent || ''), (dep('BP-0') || {}).textContent);
  ok('출발일이 없으면 「출발일 미정」(빈칸으로 두지 않는다)', /출발일 미정/.test((dep('BP-X') || {}).textContent || ''));

  console.log('[4] 출발 임박순');
  ev(`setEmSort('depart')`);
  ok('안 떠난 것 가까운 순 → 지난 것 → 미정', rows().join(',') === 'BP-1,BP-2,BP-3,BP-0,BP-X', rows().join(','));
  ev(`setEmSort('recent')`);
  ok('다시 최신순', rows()[0] === 'BP-3', rows().join(','));
  ok('순서 고르기에 낭독기 이름이 있다', !!(B.doc.getElementById('emSortSel') || {}).getAttribute && B.doc.getElementById('emSortSel').getAttribute('aria-label') === '목록 순서');

  console.log('[5] 문의 관리 · 대시보드 「최근 문의」 — 최신이 위');
  const C = [
    { id: 'c3', name: '셋', org: '', message: 'x', timestamp: '2026-10-06T00:00:00Z', read: false },
    { id: 'c2', name: '둘', org: '', message: 'x', timestamp: '2026-10-03T00:00:00Z', read: false },
    { id: 'c1', name: '하나', org: '', message: 'x', timestamp: '2026-09-01T00:00:00Z', read: true },
  ];
  ev(`set(KEYS.contacts, ${JSON.stringify(C)}); switchTab('inquiries'); renderInquiries();`);
  const inq = [...B.doc.querySelectorAll('#inqBody tr, #inqTable tbody tr')].map((tr) => tr.textContent);
  ok('🔴 문의 관리 첫 줄이 가장 최근 문의', inq.length >= 3 && /셋/.test(inq[0]) && /하나/.test(inq[inq.length - 1]), inq.map((t) => t.slice(0, 12)).join(' | '));
  ev(`switchTab('dashboard'); renderDashboard();`);
  const rec = [...B.doc.querySelectorAll('#recent-list > *')].map((x) => x.textContent);
  ok('🔴 「최근 문의」 첫 줄이 가장 최근 문의', rec.length >= 1 && /셋/.test(rec[0]), rec.map((t) => t.slice(0, 12)).join(' | '));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('크래시:', e); console.log(`\n결과: ${pass} pass / ${fail + 1} fail`); process.exit(1); });

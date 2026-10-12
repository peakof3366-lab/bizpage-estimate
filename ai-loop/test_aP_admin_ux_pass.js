/* 관리자 화면 UI/UX 개선 (2026-10-12, 대표 「관리자 페이지 UI UX를 최대한으로 개선」)

   재고 나서 고친 것만 잠근다(CLAUDE.md 「취향으로 고치지 않는다」).

   ① 🔴 대시보드 「지금 할 일」이 **건수를 못 받았는데도 「✓ 없음」 + 초록 선**을 띄웠다.
      바로 아래 줄은 「건수를 못 불러왔습니다」 — 한 상자 안에서 반대말을 했다(결함 생성기 ②).
   ② 🔴 견적 관리 「상태」 칸 — 꼬리표를 가로로 붙여 한 건 때문에 열이 253px가 되었고,
      1280 노트북에서 표가 61px 넘쳐 「상세」가 화면 밖이었다 → 세로로 쌓는다.
   ③ 🔴 표가 넘치면 조작 열이 화면 밖 — 조작 열을 오른쪽에 고정한다(견적 관리 · 대장 · 요율).
   ④ 누를 자리 44px 하한을 **한 곳에** — 그리고 그 규칙이 감추는 규칙(`[hidden]`·`.hidden`)을 이기지 않는다.
   ⑤ 막대 이름표를 「…」로 자르지 않는다(「후쿠오카 (Fuku…」).

   브라우저 실측(1440·1280·1024, 진짜 핸들러 응답)은 `check_admin_screens.py`가 한다 —
   여기는 그 실측이 다시 무너지지 않게 **구조**를 잠그고, ①은 jsdom으로 실제로 그려 본다.

   실행: node ai-loop/test_aP_admin_ux_pass.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const CSS = read('admin.css');

(async () => {
  console.log('[1] 「지금 할 일」 — 못 센 것을 「없음」이라 하지 않는다 (jsdom으로 그린다)');
  const { bootPage } = require('./_page_boot.js');
  const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');
  const B = bootPage('admin.html', { fixtures: adminFixtures('filled') });
  await B.ready;
  const { entered } = await enterDashboard(B);
  ok('대시보드에 들어갔다', entered);
  const state = () => ({
    count: (B.doc.getElementById('dt-count') || {}).textContent || '',
    sub: (B.doc.getElementById('dt-sub') || {}).textContent || '',
    done: !!B.doc.querySelector('.dt-bar.done'),
    unknown: !!B.doc.querySelector('.dt-bar.unknown'),
  });
  const set = (id, t) => B.win.eval(`setSideBadge(${JSON.stringify(id)}, ${JSON.stringify(t)}, '')`);
  for (const id of ['sb-unread', 'sb-new-quotes', 'sb-pending-signup', 'sb-pkg-stale']) set(id, '');

  let s = state();
  ok('다 알고 0건이면 「✓ 없음」 + 초록 선', /없음/.test(s.count) && s.done && !s.unknown, JSON.stringify(s));

  set('sb-unread', '?'); set('sb-new-quotes', '?');
  s = state();
  ok('🔴 못 센 것이 있고 센 것은 0이면 「없음」이라 하지 않는다', !/없음/.test(s.count), JSON.stringify(s));
  ok('🔴 초록(완료) 선을 켜지 않는다', !s.done, JSON.stringify(s));
  ok('「확인 못 함」으로 말하고 경고 색 선을 켠다', /확인 못 함/.test(s.count) && s.unknown, JSON.stringify(s));
  ok('무엇을 못 셌는지 아래 줄이 말한다', /미확인 문의/.test(s.sub) && /못 불러왔습니다/.test(s.sub), s.sub);

  set('sb-new-quotes', '3');
  s = state();
  ok('센 것이 있으면 그 건수를 말한다(모르는 것은 아래 줄)', /3건/.test(s.count) && !s.unknown && /못 불러왔습니다/.test(s.sub), JSON.stringify(s));

  console.log('[2] 견적 관리 상태 칸 — 꼬리표를 세로로 쌓는다');
  const EST = read(path.join('admin', 'estmgr.js'));
  ok('상태 칸이 쌓는 틀(em-state-stack) 안에 알약·확인 꼬리표·실적을 함께 담는다',
    /<td class="em-state"><div class="em-state-stack"><span class="badge [^"]*">[^<]*<\/span>\$\{verifyBadgeHtml\(e\)\}\$\{emNeedsActual\(e\)/.test(EST.replace(/\$\{statusBadge\[st\]\|\|'badge-new'\}/, '').replace(/\$\{statusMap\[st\]\|\|st\}/, '')));
  ok('쌓는 틀은 세로 방향이다', /#emTable \.em-state-stack \{[^}]*flex-direction: column/.test(CSS));

  console.log('[3] 조작 열 고정 — 표가 넘쳐도 누를 것은 보인다');
  const sticky = CSS.match(/:is\(#emTable, #ledList \.tbl, #tab-rates \.rate-table\) :is\(th, td\):last-child:not\(\[colspan\]\) \{([^}]*)\}/);
  ok('견적 관리 · 대장 · 요율 표의 마지막 열이 오른쪽에 붙는다', !!sticky && /position: sticky/.test(sticky[1]) && /right: 0/.test(sticky[1]));
  ok('🔴 배경을 칠한다(투명하면 밑으로 지나가는 글자가 비친다)', !!sticky && /background: var\(--white\)/.test(sticky[1]));
  ok('🔴 colspan 머리줄(지역 · 월)은 붙이지 않는다', !!sticky);
  ok('견적 관리 표의 마지막 열이 실제로 조작(상세)이다', /<td[^>]*>[\s\S]{0,400}상세[\s\S]{0,80}<\/td>\s*<\/tr>/.test(EST));

  console.log('[4] 44px 하한 — 한 곳에, 감추는 규칙을 이기지 않게');
  const floorAt = CSS.indexOf('누를 자리 44px 하한');
  const floor = CSS.slice(floorAt, floorAt + 2600);
  ok('하한 규칙이 있다', floorAt > 0);
  ok('🔴 범위를 :where()로 감싼다(우선순위 0) — :is(#modal)은 id 우선순위로 [hidden]을 이긴다',
    /:where\(\.dash-layout, \.dash-header, #modal\) :where\(/.test(floor) && !/:is\(\.dash-layout/.test(floor));
  ok('🔴 display는 감춘 것([hidden]·.hidden)에 주지 않는다', /:not\(\[hidden\], \.hidden\) \{\s*display: inline-flex/.test(floor));
  ok('감추는 규칙이 아직 그대로 있다(.hidden !important · .savebar-btn[hidden])',
    /\.hidden \{ display: none !important; \}/.test(CSS) && /\.savebar-btn\[hidden\] \{ display: none; \}/.test(CSS));
  ok('접기 머리줄은 display를 안 바꾼다(브라우저 ▶ 표시가 사라지는 자리)',
    /:where\(\.dash-layout, \.dash-header, #modal\) summary \{ min-height: 44px; box-sizing: border-box; \}/.test(floor));
  /* 이유 없이 44 아래로 직접 거는 규칙이 다시 생기면 하한이 진다 — 남겨 둔 것은 이유가 적힌 장부 표 안 셋뿐 */
  const small = [...CSS.matchAll(/([^{}]+)\{[^}]*min-height\s*:\s*(2\d|3\d|4[0-3])px/g)].map((m) => m[1].trim().split('\n').pop().trim());
  const allowed = ['.tbl select.led-st', '.tbl .led-st-save', '#ledList .led-fold'];
  const extra = small.filter((sel) => !allowed.some((a) => sel.includes(a)));
  ok('44px 아래로 직접 거는 규칙 = 이유가 적힌 장부 표 안 셋뿐', extra.length === 0, extra.join(' | '));

  console.log('[5] 막대 이름표를 자르지 않는다');
  const hb = CSS.match(/\.h-bar-label \{([^}]*)\}/);
  ok('「…」로 자르지 않는다', !!hb && !/text-overflow: ellipsis/.test(hb[1]) && !/nowrap/.test(hb[1]), hb && hb[1]);
  ok('이름 칸은 글자 단위(em)', /\.h-bar-row \{[^}]*grid-template-columns: [\d.]+em 1fr/.test(CSS));

  console.log('[6] 작은 글자 — 견적 작성 화면 11px → 12px');
  const PRO = read('admin-quote-pro.html');
  /* ⚠ 접기 표시 ▸(`.more > summary::before`)는 기호라 뺀다 — 읽는 글자가 아니다 */
  const tiny = [...PRO.matchAll(/([^{}\n]*)\{[^}]*font-size:\s*(1[01](?:\.\d+)?)px/g)]
    .filter((m) => !/summary::before/.test(m[1])).map((m) => m[1].trim() + ' ' + m[2] + 'px');
  ok('견적 작성 화면에 12px 미만 글자 규칙이 없다(장식 기호 제외)', tiny.length === 0, tiny.join(', '));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('크래시:', e); console.log(`\n결과: ${pass} pass / ${fail + 1} fail`); process.exit(1); });

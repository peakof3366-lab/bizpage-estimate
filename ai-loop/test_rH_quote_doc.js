/* RH 검증: 고객 견적서가 휴대폰에서 가로로 삐져나오지 않는가.

   왜 —
   고객이 하는 그대로 견적을 뽑아 견적서 창까지 열어 보니, **390px 화면에서 문서가
   오른쪽으로 289px 밀려나 있었다**(360px에서는 319px). 데스크톱에서는 0px라 지금까지
   아무도 못 봤다. 이 문서는 고객이 **결재 보고용으로 받아 보는 것**이라 가로 스크롤이
   생기면 그 자체로 신뢰를 깎는다.

   원인은 코스 탭이었다. `.rec-tabs`가 가로 flex인데 `.rec-tab`이 `white-space:nowrap`이고,
   탭 라벨에 코스 제목이 통째로 들어간다("코스 A · 도쿄 일본어 집중 & 비즈니스 커뮤니케이션
   연수"). 두 탭을 한 줄에 늘어놓으면 어떤 휴대폰에도 안 들어간다. 상단 바(.nav-btns)도
   13px 넘쳤다.

   ⚠ 가로 스크롤로 넘기지 않고 **세로로 쌓았다.** 가로 스크롤은 놓치기 쉬워서
   "코스 B가 있는 줄 몰랐다"가 되는데, 이 문서에서 코스 B는 고객에게 제안하는 대안이다.

   여기서 고정하는 것 — jsdom은 레이아웃을 계산하지 않아 '몇 px 넘쳤나'는 못 잰다.
   대신 **그 결함의 원인이 되는 구조**가 되돌아가지 않게 막는다
   (README가 매뉴얼·편집 화면에 쓰는 것과 같은 방식):
   ① 좁은 화면 규칙이 존재하고, 그 안에서 탭이 세로로 쌓인다.
   ② 좁은 화면에서 탭 제목이 줄바꿈된다(nowrap이 풀린다) — 이게 진짜 원인이었다.
   ③ 상단 바가 자리 없으면 줄을 바꾼다.
   ④ 넓은 화면의 가로 탭 모양은 그대로다(고친다고 데스크톱을 망가뜨리지 않았다).
   ⑤ 일정표가 이 문서에 실제로 들어간다 — 관리자가 고친 일정이 고객에게 나가는 경로다.

   실제 px는 `python ai-loop/check_quote_doc_layout.py`가 브라우저로 잰다.

   실행: node ai-loop/test_rH_quote_doc.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const scriptSrc = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 견적서 창의 CSS는 openEstimateWindow가 만드는 문서 안에 있다. 그 문서의
   좁은 화면 규칙만 떼어 본다 — script.js 전체에서 찾으면 고객 랜딩 쪽 규칙까지 섞인다. */
const docStart = scriptSrc.indexOf('function openEstimateWindow');
const docSrc = docStart >= 0 ? scriptSrc.slice(docStart) : '';
const narrow = (docSrc.match(/@media\(max-width:600px\)\{[\s\S]*?\n\}/) || [''])[0];
/* 넓은 화면(기본) 규칙 */
const baseTabs = (docSrc.match(/\.rec-tabs\{[^}]*\}/) || [''])[0];
const baseTab  = (docSrc.match(/\.rec-tab\{[^}]*\}/) || [''])[0];

(() => {
  console.log('[1] 좁은 화면 규칙을 찾았는가');
  ok('견적서 창 코드를 찾았다', docStart >= 0);
  ok('좁은 화면(≤600px) 규칙이 있다', narrow.length > 0);

  console.log('\n[2] 탭이 세로로 쌓이고 제목이 줄바꿈되는가 (①②)');
  const narrowTabs = (narrow.match(/\.rec-tabs\{[^}]*\}/) || [''])[0];
  const narrowTab  = (narrow.match(/\.rec-tab\{[^}]*\}/) || [''])[0];
  ok('좁은 화면에서 탭 줄이 세로로 선다',
    /flex-direction:\s*column/.test(narrowTabs), narrowTabs || '(규칙 없음)');
  /* ⚠ 이것이 진짜 원인이었다. 세로로 세워도 제목이 nowrap이면 한 줄이 그대로 삐져나온다. */
  ok('좁은 화면에서 탭 제목이 줄바꿈된다 (nowrap을 푼다)',
    /white-space:\s*normal/.test(narrowTab), narrowTab || '(규칙 없음)');
  ok('가로 스크롤로 넘기지 않았다 (코스 B를 못 보고 지나칠 수 있다)',
    !/overflow-x:\s*auto/.test(narrowTabs), narrowTabs);

  console.log('\n[3] 상단 바도 넘치지 않는가 (③)');
  ok('자리가 없으면 상단 바가 줄을 바꾼다',
    /\.top-nav\{[^}]*flex-wrap:\s*wrap/.test(narrow), (narrow.match(/\.top-nav\{[^}]*\}/g) || []).join(' | '));
  ok('버튼 묶음이 줄어들 수 있다',
    /\.nav-btns\{[^}]*flex-wrap:\s*wrap/.test(narrow), (narrow.match(/\.nav-btns\{[^}]*\}/) || [''])[0]);

  console.log('\n[4] 넓은 화면은 그대로인가 (④)');
  ok('기본은 여전히 가로 탭이다', /display:\s*flex/.test(baseTabs) && !/flex-direction:\s*column/.test(baseTabs),
    baseTabs);
  ok('기본 탭은 여전히 한 줄이다', /white-space:\s*nowrap/.test(baseTab), baseTab);
  ok('기본 탭 줄에 아래 선이 남아 있다', /border-bottom/.test(baseTabs), baseTabs);

  console.log('\n[5] 일정표가 이 문서에 들어가는가 (⑤)');
  ok('일자 카드를 그린다', /class="day-timeline"/.test(docSrc));
  ok('방식 A·B 두 코스를 모두 싣는다',
    /renderDays\(itiADisplayDays\)/.test(docSrc) && /renderDays\(itiBDisplayDays\)/.test(docSrc));
  ok('참고 팁도 함께 나간다', /day-tip/.test(docSrc));

  /* ── [6] 머리줄 브랜드 글자가 보이는가 ──────────────────────────────────
     검은 머리줄(#0A0A0A) 위에 인라인 `color:inherit`이 붙어 있어서 .nav-brand{color:#fff}를
     덮어썼고, 본문 검정(#0D0D0D)이 찍혀 **대비 1.02:1 — 사실상 안 보였다.**
     고객이 받아 보는 문서인데 데스크톱에서도 안 보이는 상태였다.
     ai-loop/check_contrast.py(브라우저)가 찾아냈고, 여기서 원인 구조를 막는다. */
  console.log('\n[6] 머리줄 브랜드 글자가 배경에 묻히지 않는가');
  const brandTag = (docSrc.match(/<a[^>]*class="nav-brand"[^>]*>/) || [''])[0];
  ok('머리줄 브랜드가 있다', !!brandTag, brandTag);
  ok('인라인 style로 색을 덮어쓰지 않는다',
    !/style="[^"]*\bcolor\s*:/.test(brandTag),
    '인라인 color는 .nav-brand{color:#fff}를 이겨서 검은 바탕에 검은 글자를 만든다: ' + brandTag);
  ok('클래스가 흰 글자를 지정한다', /\.nav-brand\{[^}]*color:\s*#fff/.test(docSrc));

  console.log('\n[7] 점검 도구가 기록돼 있는가');
  ok('README가 견적서 모양 검사를 안내한다',
    /check_quote_doc_layout\.py/.test(readme),
    '브라우저 검사는 스위트에 못 넣으므로, 있다는 사실이 문서에 남아야 실제로 돌아간다');
  ok('README가 글자 대비 검사도 안내한다',
    /check_contrast\.py/.test(readme),
    '눈으로만 보이는 결함이라 사람이 돌려야 한다 — 문서에 없으면 아무도 안 돌린다');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})();

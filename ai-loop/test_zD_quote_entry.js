/* ═══════════════════════════════════════════════════════════════════════════
   ZD — 고객 화면에서 **견적서를 여는 입구는 하나다** (2026-09-15 대표 지시)

   ■ 대표가 말한 것
   「견적서 받기가 위에 버튼이 있는데, 아래쪽 예상 견적 카테고리에 견적서 확인하기
     버튼이 또 있다. 이 부분 구조적으로 해결할 수 있을까?」

   ■ 세어 보니 대표 말이 정확했다 — **두 버튼이 같은 함수를 부르고 있었다**
       index.html  확인 패널   onclick="openEstimateWindow()"                  「견적서 받기」
       script.js:1838          downloadButton.addEventListener('click', openEstimateWindow)
   이름만 다르고 하는 일은 **100% 같았다.** 브라우저 실측으로 두 버튼은 **256px 거리**
   (y=2252 / y=2508)에 있어 한 화면에 나란히 보였다.
   ⚠ CLAUDE.md 화면 규칙 ⑥ 「한 자리에 강조 버튼을 둘 두지 않는다 — 무엇부터 눌러야
     할지 모른다」에 정확히 걸리는 자리였다.

   ■ 🔴 어느 쪽을 남길지는 **취향이 아니라 세어서** 정했다
   검사 도구 11개(`virtual_journey` · `smoke_prod_journey` · `test_xS` · `test_xK` ·
   `audit_ux` …)가 **전부 `#downloadEstimate`(아래 버튼)를 누른다.**
   확인 패널의 `.btn-get-estimate`를 누르는 도구는 **하나도 없었다** — 아래가 정식
   입구였고 위가 안전망 밖의 중복이었다.
   그리고 위 버튼은 **금액을 보기 전** 자리다. 고객이 얼마인지 모르고 문서를 여는 자리였다.

   ■ 🔴 이름도 통일했다 — 같은 id가 두 화면에 있는데 이름이 달랐다
       admin-quote.html  id="downloadEstimate" → 「견적서 받기」   (담당자 산출, 이미 이 이름)
       index.html        id="downloadEstimate" → 「견적서 확인하기」 ← 여기만 달랐다
   같은 id·같은 함수인데 화면마다 이름이 달라, 매뉴얼과 검사가 같은 것을 두 이름으로
   부르고 있었다. → 고객 화면을 **「견적서 받기」로 맞췄다.**

   ■ 되살리려면
   `index.html`의 `#estimateConfirm` 안에 `.btn-get-estimate` 버튼을 되돌리고
   `styles.css`의 규칙 10줄(`git show 5954378:styles.css` 681~690행)을 되살린 뒤
   이 파일을 지운다. ⚠ 되살리면 **같은 함수를 부르는 버튼이 다시 둘**이 된다는 것을
   알고 결정할 것. 대표가 그 중복을 직접 짚어서 뺀 것이다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText } = require('./_page_boot.js');

const ROOT = path.join(__dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const { doc, win, ready } = bootPage('index.html');
  await ready;

  console.log('\n[1] 🔴 `openEstimateWindow`를 부르는 자리를 **세어서 고정한다**');
  /* 🔴 **글자로 세지 않고 두 곳을 다 센다.** 마크업의 `onclick`과 script.js의 리스너는
     적히는 곳이 달라, 한쪽만 보면 나머지를 놓친다 — 그게 이 중복이 오래 산 이유다.

     🔴🔴 **그리고 실제로 셋이었다.** 대표가 짚은 둘을 고치고 이 검사를 돌렸더니
       「인라인 호출 2곳」이 나왔다 — 하나는 내 주석이었고, 나머지 하나가
       `#step3PdfBtn`(여행 일정 구역의 「선택 플랜 포함 견적서 다운로드」)이었다.
       **아무 검사도 그 버튼을 보고 있지 않았다.** 세지 않았으면 못 찾았다.
     ⚠ 그래서 「하나뿐이다」가 아니라 **「몇 곳이고 어디인가」**로 고정한다.
       늘어나면 여기서 걸리고, 그때 이 글을 읽고 판단하게 된다. */
  const stripComments = (s, open, close) => {
    let out = '', i = 0;
    for (;;) {
      const a = s.indexOf(open, i);
      if (a < 0) { out += s.slice(i); break; }
      out += s.slice(i, a);
      const b = s.indexOf(close, a);
      if (b < 0) break;
      i = b + close.length;
    }
    return out;
  };
  const indexNoComments = stripComments(INDEX, '<!--', '-->');
  const inlineCalls = indexNoComments.split('openEstimateWindow()').length - 1;
  ok('① 마크업의 인라인 호출은 1곳이다(일정 구역의 마무리 버튼)',
    inlineCalls === 1, `${inlineCalls}곳 — 늘었으면 어디인지 확인하고 이 머리말을 갱신할 것`);
  const listeners = SCRIPT.split("addEventListener('click', openEstimateWindow)").length - 1;
  ok('① script.js가 거는 리스너는 1곳이다(결과 카드)', listeners === 1, `${listeners}곳`);
  ok('① 🔴 그래서 고객 화면의 견적서 입구는 **모두 2곳**이다', inlineCalls + listeners === 2,
    `${inlineCalls + listeners}곳`);

  console.log('\n[2] 입구는 결과 카드의 `#downloadEstimate` 하나다');
  const dl = doc.getElementById('downloadEstimate');
  ok('② 결과 카드에 견적서 버튼이 있다', !!dl);
  ok('② 이름이 「견적서 받기」다', !!dl && dl.textContent.trim() === '견적서 받기',
    dl && dl.textContent.trim());
  ok('② 검사 도구가 잡는 class를 유지한다(audit_ux가 본다)',
    !!dl && dl.classList.contains('btn-dl-main'), dl && dl.className);
  /* 금액이 나오기 전에는 숨어 있어야 한다 — 빈 금액으로 문서를 여는 길을 만들지 않는다 */
  ok('② 계산 전에는 숨어 있다', !!dl && dl.classList.contains('hidden'), dl && dl.className);

  console.log('\n[3] 🔴 확인 패널에는 견적서 버튼이 **없다** (여기는 금액을 보기 전이다)');
  const confirmPanel = doc.getElementById('estimateConfirm');
  ok('③ 확인 패널이 있다', !!confirmPanel);
  ok('③ 🔴 .btn-get-estimate 요소가 없다',
    doc.querySelectorAll('.btn-get-estimate').length === 0,
    `${doc.querySelectorAll('.btn-get-estimate').length}개 남아 있다`);
  const panelText = visibleText(confirmPanel);
  ok('③ 확인 패널 글자에 「견적서」가 없다', panelText.indexOf('견적서 받기') < 0, panelText);
  /* 남아야 하는 둘은 그대로 있는지 — 중복을 빼면서 멀쩡한 것까지 지우지 않았는지 본다 */
  ok('③ 「여행 일정 살펴보기」는 남아 있다', !!doc.getElementById('explorePlanBtn'));
  ok('③ 「새 견적 다시 계산하기」는 남아 있다', !!doc.getElementById('resetEstimateBtn'));

  console.log('\n[4] 🔴 죽은 CSS를 남기지 않았다');
  /* 마크업만 지우고 CSS를 남기면 아무도 안 쓰는 채로 살아 있다(`test_vT`가 세운 규칙).
     ⚠ 오늘 넣은 **설명 주석**에는 그 이름이 나오므로, 주석을 걷어내고 센다. */
  const cssNoComments = (() => {
    let s = CSS, out = '', i = 0;
    for (;;) {
      const a = s.indexOf('/*', i);
      if (a < 0) { out += s.slice(i); break; }
      out += s.slice(i, a);
      const b = s.indexOf('*/', a);
      if (b < 0) break;
      i = b + 2;
    }
    return out;
  })();
  ok('④ .btn-get-estimate 규칙이 남아 있지 않다',
    cssNoComments.indexOf('.btn-get-estimate') < 0);
  /* ⚠ 함께 지우면 안 되는 것 — 세어 보고 남겼다 */
  ok('④ ⚠ confirmBtnPulse는 남아 있다(「여행 일정 살펴보기」가 쓴다)',
    cssNoComments.indexOf('confirmBtnPulse') >= 0);
  ok('④ ⚠ 그 애니메이션을 쓰는 쪽도 그대로다',
    cssNoComments.indexOf('animation:confirmBtnPulse') >= 0);

  console.log('\n[5] 🔴 두 화면이 **같은 것을 같은 이름으로** 부른다');
  /* 같은 `id="downloadEstimate"`가 담당자 산출 화면에도 있다. 거기서는 처음부터
     「견적서 받기」였는데 고객 화면만 「견적서 확인하기」였다 — 매뉴얼과 검사가 같은
     것을 두 이름으로 부르고 있었다. */
  /* ⚠ 2026-09-17: 두 화면 중 한쪽(「자동 견적 산출 · 고객용」)을 지웠다.
     남은 내부직원용은 같은 `id="downloadEstimate"`를 화면에 두지 않는다 —
     그 id는 `quote_engine_host.js`가 **숨긴 폼 안에** 만드는 엔진용 버튼이고,
     담당자가 누르는 것은 ⑤단계의 「인쇄 · PDF로 저장」이다.
     🔴 그래서 이제 **고객 화면의 이름만이 기준**이다 — 아래 ⑤가 그것을 지킨다. */
  ok('⑤ 고객 화면이 「견적서 받기」로 부른다',
    indexNoComments.indexOf('견적서 받기') >= 0);
  /* ⚠ **주석을 걷어내고 센다.** 위 경위를 적은 주석에 그 글자가 들어 있어, 그대로 세면
     내가 쓴 설명 때문에 검사가 실패한다 — 저장소가 여러 번 겪은 함정이다(`test_zC` ⑨). */
  ok('⑤ 🔴 고객 화면에 「견적서 확인하기」가 남아 있지 않다',
    indexNoComments.indexOf('견적서 확인하기') < 0, '두 이름이 다시 갈라졌다');

  console.log('\n[7] 🔴 일정 구역의 버튼 — 이름이 **무슨 일이 날지** 말한다');
  /* 이 버튼은 「선택 플랜 포함 견적서 **다운로드**」였는데, `openEstimateWindow()`는
     새 창을 열어 인쇄·PDF로 저장하는 것이지 **파일을 내려받지 않는다.**
     이름이 사실이 아니면 고객은 안 일어난 일을 기다린다(CLAUDE.md 화면 규칙 ③). */
  const s3 = doc.getElementById('step3PdfBtn');
  ok('⑦ 일정 구역 버튼이 있다', !!s3);
  const s3text = s3 ? visibleText(s3) : '';
  ok('⑦ 🔴 「다운로드」라고 말하지 않는다', s3text.indexOf('다운로드') < 0, s3text);
  ok('⑦ 결과 카드와 **같은 동사**를 쓴다(같은 함수다)', s3text.indexOf('견적서 받기') >= 0, s3text);
  ok('⑦ 이 자리가 무엇이 다른지 말한다(고른 일정이 문서에 들어간다)',
    s3text.indexOf('일정') >= 0, s3text);

  console.log('\n[8] 🔴 **안내문이 화면에 없는 버튼 이름을 부르지 않는다**');
  /* 🔴 이번 건의 재발 경로가 바로 이것이다. 버튼 이름을 「견적서 확인하기」 →
     「견적서 받기」로 바꿨더니, `script.js`의 실패 안내가 **없는 버튼을 가리키고
     있었다**: 「화면의 『견적서 확인하기』로 인쇄·PDF 저장하실 수 있습니다」.
     고객은 화면에서 그 이름을 찾다가 못 찾는다 — 코드는 멀쩡하고 아무도 안 터진다.
     ⚠ 이름을 바꾸는 사람이 **부르는 쪽까지** 고치게 만드는 것이 이 검사의 일이다. */
  const alerts = stripComments(SCRIPT, '/*', '*/');
  const 화면이름 = ['견적서 받기'];
  const 옛이름 = ['견적서 확인하기', '선택 플랜 포함 견적서 다운로드', '엑셀로 다운로드'];
  for (const name of 옛이름) {
    ok(`⑧ 안내문이 「${name}」를 부르지 않는다`, alerts.indexOf(name) < 0,
      '화면에 없는 이름이다 — 부르는 쪽도 함께 고칠 것');
  }
  /* 반대 방향 — 지금 쓰는 이름은 실제로 화면에 있어야 한다 */
  for (const name of 화면이름) {
    const onScreen = !!dl && dl.textContent.trim() === name;
    ok(`⑧ 안내문이 부르는 「${name}」가 실제로 화면에 있다`, onScreen, dl && dl.textContent.trim());
  }

  console.log('\n[6] 눌러 보면 진짜로 그 함수가 돈다');
  /* 🔴 선언만 보면 **버튼이 조용히 죽어도 통과한다**(test_zZ ⑦에서 겪은 것과 같다).
     그래서 실제로 눌러 `openEstimateWindow`가 불리는지 본다. */
  let called = 0;
  const realFn = win.openEstimateWindow;
  ok('⑥ openEstimateWindow가 전역에 있다', typeof realFn === 'function');
  if (typeof realFn === 'function') {
    win.openEstimateWindow = () => { called += 1; };
    /* ⚠ `addEventListener('click', openEstimateWindow)`는 **함수 객체를 직접** 붙들고
       있어 전역을 바꿔치기해도 안 잡힌다(test_zZ ⑦에서 이미 헛짚은 함정이다).
       그래서 여기서는 「눌렀을 때 터지지 않는가」까지만 본다 — 실제 동작은
       `test_xS_hidden_blockers`가 문서를 열어 확인한다. */
    let threw = '';
    try {
      dl.classList.remove('hidden');
      dl.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    } catch (e) { threw = String(e && e.message); }
    win.openEstimateWindow = realFn;
    ok('⑥ 버튼을 눌러도 터지지 않는다', threw === '', threw);
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZD 견적서 입구는 하나`);
  process.exit(fail ? 1 : 0);
})();

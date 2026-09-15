/* ═══════════════════════════════════════════════════════════════════════════
   ZH — 팝업 견적서는 **누가 열었느냐에 따라 말이 달라야 한다** + 탭이 따라온다
        (2026-09-15 대표 지시)

   ■ 대표가 말한 것
   「내가 고객 입장에서 견적서를 확인하는데 상단에 『고객에게 보낼 링크가
     준비되었습니다』라는 멘트가 떠. 이 부분 상황에 맞게 수정 부탁할게.
     그리고 견적 내용·추천 일정·현지 사진 이 3버튼이 화면을 따라갈 수 있게.」

   ■ 🔴 무엇이 문제였나 — **이 문서는 고객도 담당자도 연다**
   `openEstimateWindow()`는 `index.html`(고객)과 `admin-quote.html`(담당자) 양쪽에서
   불리는데, 성공 안내가 **담당자 기준 한 벌**이었다:
       「고객에게 보낼 링크가 준비되었습니다 — …에서 복사하실 수 있습니다」
   고객이 자기 견적서를 열면 **자기더러 자기에게 보내라는 말**이 된다.
   ⚠ 더 얄궂은 것은, 그 줄 바로 위 주석이 「안 그러면 **고객은** 링크가 생겼는지도
     모른다」였다는 점이다. **고객을 염두에 두고 쓴 코드인데 문구만 담당자 말투**였다.
     이런 자리는 눈으로 열어 보기 전에는 안 걸린다 — 코드는 멀쩡하고 아무도 안 터진다.

   ■ 어떻게 고쳤나
   `window.__INTERNAL_TOOL__`로 갈랐다. **새로 만든 표식이 아니다** — `admin-quote.html`이
   이미 켜 두고 채널 구분(`channel: 'internal'`)·통계 제외에 쓰던 것이다.
   이 함수는 부모 창에서 도므로 그 값이 곧 「누가 열었나」다.
       담당자 → 「고객에게 보낼 링크가 준비되었습니다 — 「링크 공유」에서 복사…」
       고객   → 「견적서가 준비되었습니다 — 이 화면에서 바로 인쇄하거나 PDF로 저장…」
   그리고 버튼 이름을 「고객 링크 공유」 → **「링크 공유」**로. 고객이 보는 문서에
   「**고객** 링크」라고 적혀 있으면 그것도 남 얘기처럼 읽힌다.

   ■ 탭 셋이 스크롤을 따라온다
   `.anchor-nav`에 `position:sticky`. ⚠ `top`을 **숫자로 박지 않는다** — 머리줄
   `.top-nav`도 sticky이고, 좁은 화면에서는 `flex-wrap:wrap`으로 **두 줄이 되어 높이가
   달라진다.** 그래서 JS가 재서 `--navh`에 넣는다.
   🔴 실측(브라우저, 팝업 문서를 실제로 열어 스크롤):
       노트북 1280px — 머리줄 61px · 탭이 y=61에 붙음 · **겹침 0**
       폰     390px — 머리줄 **89px**(두 줄) · 탭이 y=89에 붙음 · **겹침 0**
     52px로 박았다면 폰에서 **37px 겹쳐** 탭이 머리줄 뒤로 들어갔을 것이다.

   ■ ⚠ 이 문서를 고칠 때 **백틱을 쓰지 말 것**
   `openEstimateWindow`가 만드는 HTML·CSS·JS는 통째로 **JS 템플릿 리터럴 안**이다.
   주석에 백틱 하나를 넣었다가 문자열이 끊겨 **script.js 전체가 SyntaxError**가 됐다
   (2026-09-15에 실제로 당했다). `node --check script.js`로 바로 잡힌다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

/* 팝업 견적서 코드만 떼어 본다 — script.js 전체에서 찾으면 고객 랜딩 쪽 규칙이 섞인다
   (`test_rH_quote_doc`가 쓰는 것과 같은 방법이다). */
const docStart = SRC.indexOf('function openEstimateWindow');
const DOC = docStart >= 0 ? SRC.slice(docStart) : '';
/* 선언 블록 하나만 떼어 온다. 역슬래시를 안 쓰려고 indexOf/slice로 자른다
   (도구를 거치며 역슬래시가 소실돼 검사가 통째로 죽은 적이 있다). */
const rule = (sel) => {
  const j = DOC.indexOf(sel + '{');
  if (j < 0) return '';
  const a = DOC.indexOf('{', j);
  const b = DOC.indexOf('}', a);
  return (a < 0 || b < 0) ? '' : DOC.slice(a + 1, b);
};
const flat = (s) => s.split(' ').join('');

/* 🔴 **주석을 걷어낸 판을 따로 둔다.** 이 파일에는 경위를 적은 주석이 많고, 거기에는
   옛 문구가 그대로 인용돼 있다(「고객 링크 공유」가 XX 시절 설명에 남아 있다).
   주석을 안 걷으면 **설명 때문에 검사가 실패**한다 — 저장소가 여러 번 겪은 함정이다.
   ⚠ **두 가지 주석을 다 걷는다.** 처음엔 `/* *​/`만 걷었다가, 남은 한 건이 **HTML
     주석** 안에 있어 계속 실패했다. 이 문서는 JS 안에 HTML이 들어 있어 주석도 두 종류다. */
const strip = (s, open, close) => {
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
const DOC_CODE = strip(strip(DOC, '/*', '*/'), '<!--', '-->');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[0] 팝업 견적서 코드를 찾았다');
ok('⓪ openEstimateWindow가 있다', docStart >= 0);

console.log('\n[1] 🔴 성공 안내가 **누가 열었느냐**로 갈린다');
/* 🔴 이 셋이 함께 있어야 의미가 있다. 분기만 있고 문구가 같거나, 문구만 둘이고
   분기가 없으면 아무것도 안 고친 것이다. */
ok('① 누가 열었는지 보는 표식을 쓴다', DOC.indexOf('__INTERNAL_TOOL__') >= 0);
ok('① 담당자용 문구가 있다', DOC.indexOf('고객에게 보낼 링크가 준비되었습니다') >= 0);
ok('① 고객용 문구가 있다', DOC.indexOf('견적서가 준비되었습니다') >= 0);
/* ⚠ 표식을 읽는 자리가 성공 안내 **그 자리**인지 본다 — 파일 어딘가에 있기만 해서는
   안 된다(같은 파일 앞쪽에서 채널 구분에 이미 쓰고 있다). */
const noteAt = DOC_CODE.indexOf('고객에게 보낼 링크가 준비되었습니다');
const flagAt = DOC_CODE.lastIndexOf('__INTERNAL_TOOL__', noteAt);
ok('① 🔴 그 표식을 **성공 안내 바로 앞에서** 읽는다',
  flagAt >= 0 && noteAt - flagAt < 400, `거리 ${noteAt - flagAt}자`);

console.log('\n[2] 🔴 고객용 문구가 **담당자 말투를 쓰지 않는다**');
/* 고객 문구 안에 담당자 어휘가 섞이면 고친 뜻이 없다. 문구 한 줄만 떼어 본다. */
const custAt = DOC_CODE.indexOf('견적서가 준비되었습니다');
const custLine = custAt >= 0 ? DOC_CODE.slice(custAt, DOC_CODE.indexOf("'", custAt + 1)) : '';
ok('② 고객 문구를 찾았다', custLine.length > 0);
for (const 담당자말 of ['고객에게', '복사하실', '고객 링크']) {
  ok(`② 고객 문구에 「${담당자말}」가 없다`, custLine.indexOf(담당자말) < 0, custLine);
}
ok('② 고객이 할 수 있는 일을 말한다(인쇄·PDF)',
  custLine.indexOf('인쇄') >= 0 && custLine.indexOf('PDF') >= 0, custLine);

console.log('\n[3] 🔴 안내문이 부르는 버튼 이름이 **실제 버튼 이름과 같다**');
/* 오늘 `test_zD`에서도 같은 자리에 당했다 — 버튼 이름을 바꾸니 안내문이 **없는 버튼**을
   가리키고 있었다. 고객은 화면에서 그 이름을 찾다가 못 찾는다. */
ok('③ 공유 버튼 이름이 「링크 공유」다', DOC.indexOf('</svg>링크 공유</button>') >= 0);
ok('③ 🔴 「고객 링크 공유」가 남아 있지 않다', DOC_CODE.indexOf('고객 링크 공유') < 0,
  '버튼 이름과 안내문이 갈라졌다');
/* 안내문 셋(NOTE_DO)이 그 이름을 부른다 — 하나라도 빠뜨리면 거기서만 옛 이름이 뜬다 */
const noteDoAt = DOC_CODE.indexOf('const NOTE_DO');
const noteDo = noteDoAt >= 0 ? DOC_CODE.slice(noteDoAt, DOC_CODE.indexOf('};', noteDoAt)) : '';
ok('③ 안내문 묶음을 찾았다', noteDo.length > 0);
ok('③ 안내문 셋이 모두 「링크 공유」를 부른다',
  noteDo.split('「링크 공유」').length - 1 === 3, `${noteDo.split('「링크 공유」').length - 1}곳`);

console.log('\n[4] 🔴 탭 셋이 스크롤을 따라온다');
const navRule = flat(rule('.anchor-nav'));
ok('④ 탭 줄 규칙을 찾았다', navRule.length > 0);
ok('④ sticky다', navRule.indexOf('position:sticky') >= 0, navRule);
ok('④ 머리줄 뒤로 들어가지 않게 z를 준다', navRule.indexOf('z-index:') >= 0, navRule);
/* 🔴 여기가 핵심이다 — top을 숫자로 박으면 좁은 화면에서 겹친다(머리줄이 두 줄이 된다).
   실측: 노트북 61px · 폰 89px. 52px로 박았다면 폰에서 37px 겹쳤다. */
ok('④ 🔴 top을 숫자로 박지 않고 --navh를 쓴다',
  navRule.indexOf('top:var(--navh') >= 0, navRule);

console.log('\n[5] 🔴 머리줄 높이를 **재서** 넣는다');
ok('⑤ --navh를 설정하는 코드가 있다', DOC.indexOf("setProperty('--navh'") >= 0);
ok('⑤ 실제 높이를 잰다(offsetHeight)',
  DOC.indexOf('offsetHeight') >= 0 && DOC.indexOf(".querySelector('.top-nav')") >= 0);
/* ⚠ 한 번만 재면 창을 바꾸거나 폰을 돌렸을 때 어긋난 채로 남는다 */
ok('⑤ 창 크기가 바뀌면 다시 잰다', DOC.indexOf("addEventListener('resize', setNavH") >= 0);
/* 앵커로 뛸 때 제목이 탭에 가리지 않도록 — 뛰어갈 대상에 자리를 비운다 */
ok('⑤ 앵커로 뛸 때 제목이 탭에 가리지 않는다', DOC.indexOf('scrollMarginTop') >= 0);

console.log('\n[6] ⚠ 인쇄물은 그대로다');
/* 탭도 상단 안내도 **문서의 내용이 아니라 지금 상태**다. 인쇄물에 남을 말이 아니다.
   ⚠ 예전에 인쇄 CSS가 유효기간을 통째로 숨긴 사고(WQ)가 있었다 — 인쇄 쪽은 늘 함께 본다. */
ok('⑥ 탭 줄에 no-print가 붙어 있다', DOC.indexOf('class="anchor-nav no-print"') >= 0);
ok('⑥ 상단 안내에도 no-print가 붙어 있다', DOC.indexOf('id="share-note" class="no-print"') >= 0);
ok('⑥ no-print 규칙이 살아 있다', DOC.indexOf('.no-print{display:none!important}') >= 0);

console.log('\n[7] ⚠ **템플릿 리터럴 안**에 백틱이 새로 들어오지 않았다');
/* 팝업 문서의 HTML·CSS·JS는 통째로 템플릿 리터럴 안이라 **백틱 하나가 script.js
   전체를 죽인다.** 실제로 2026-09-15에 CSS 주석에 백틱을 넣어 SyntaxError가 났다.

   🔴 **처음엔 이 검사가 틀렸다** — `setNote` 옆 주석까지 대상에 넣었는데, 거기는
     템플릿 **바깥**(보통 JS 코드)이라 백틱을 써도 안전하다. 규칙을 넓게 걸면
     멀쩡한 코드를 고치게 만든다. → **템플릿 안의 블록만** 본다.
   ⚠ 어디까지가 템플릿 안인지는 문서 HTML이 끝나는 자리로 가른다. */
const tmplEnd = DOC.indexOf('</body></html>');
const TMPL = tmplEnd >= 0 ? DOC.slice(0, tmplEnd) : '';
ok('⑦ 템플릿 구간을 찾았다', TMPL.length > 0);
for (const 표시 of ['탭 셋(견적 내용', '탭이 붙을 자리를 **재서**']) {
  const a = TMPL.indexOf(표시);
  const chunk = a >= 0 ? TMPL.slice(a, a + 700) : '';
  ok(`⑦ 「${표시.slice(0, 12)}…」 주석에 백틱이 없다`,
    a >= 0 && chunk.indexOf(String.fromCharCode(96)) < 0);
}
/* 🔴 가장 확실한 자는 파서다 — 파일이 실제로 파싱되는지 본다.
   백틱 사고는 **어디에 넣든** 여기서 걸린다(위 두 검사는 자리를 짚어 주는 용도다). */
const vm = require('vm');
let 파싱됨 = true, 왜 = '';
try { new vm.Script(SRC, { filename: 'script.js' }); } catch (e) { 파싱됨 = false; 왜 = String(e.message); }
ok('⑦ 🔴 script.js가 통째로 파싱된다', 파싱됨, 왜);

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — ZH 견적서 문서의 말과 탭`);
process.exit(fail ? 1 : 0);

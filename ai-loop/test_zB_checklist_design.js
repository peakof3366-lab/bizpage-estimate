/* ═══════════════════════════════════════════════════════════════════════════
   ZB — 「기업 단체연수 준비 체크리스트」 구역의 **글자와 표식** (2026-09-15 대표 지시)

   ■ 대표가 말한 것
   「이 박스 디자인에서, 기업 단체연수 준비 체크리스트와 글자들에 좀 더 디자인이
     입혀졌으면 좋겠다.」

   ■ 고치기 전 실측 (브라우저, 폭 1440, details를 연 상태)
     · 구역 제목 「기업 단체연수 준비 체크리스트」 — **11px** · 자간 .08em · `uppercase`
     · 묶음 제목 「사전 준비」·「서류 · 행정」·「현지 운영」 — **10px** · 자간 .14em · 레드 글자
     · 항목 12.5px `--t-mute` · 표식은 **5×1.5px 대시**
     · 전체 높이 200px

   ■ 🔴 10px는 규칙 위반이었고, **검사가 이미 ⚠로 잡고 있었다**
   저장소 규칙은 「글자는 11px 이상」(CLAUDE.md 화면 규칙)인데 묶음 제목 셋이 전부 10px였다.
   `check_customer_screens.py`가 「10px · 사전 준비 / 서류 · 행정 / 현지 운영 · 폭 전부」로
   **이미 적어 두고 있었다** — 🔴이 아니라 ⚠이라 199곳 틈에 묻혀 있었을 뿐이다.
   ⚠ **⚠ 목록은 「나중에 볼 것」이지 「안 봐도 되는 것」이 아니다.** 대표가 눈으로 짚은
     자리와 자가 적어 둔 자리가 정확히 겹쳤다.

   ■ 무엇으로 고쳤나
     · 구역 제목 13px · 800 · 자간 .01em + **앞에 레드 세로 바**
     · 묶음 제목 11.5px · 800 · 자간 .02em · **먹색 글자 + 위 2px 레드 선**
       (레드를 글자에서 선으로 옮겼다 — 면적은 줄고 구분은 선다)
     · 항목 `--t-body`로 한 단계 진하게, 표식을 **체크 모양**으로
     · 높이 200 → 222px
   ⚠ 자간과 `uppercase`를 걷은 이유: 내용이 **전부 한글**이다. 한글은 자간을 벌리면
     덩어리가 흩어져 오히려 안 읽힌다(YA에서 확인, 오늘 포함 항목 제목도 같았다).

   ■ ⚠ 이 검사도 **jsdom으로 색·테두리를 재지 않는다**
   jsdom은 `var()`가 든 선언을 계산하지 않는다(`color` → "var(--t-head)" 그대로,
   `border-top-style` → "none"). 자세한 경위는 `test_zA_include_align.js` 머리말에 있다.
   → 크기·굵기·자간은 computed로, 색과 선은 **`styles.css`를 읽어서** 확인한다.

   ■ ⚠ 규칙 글자를 찾을 때 **정규식에 역슬래시를 쓰지 않는다**
   이 파일을 처음 쓸 때 `sel.replace(/[.*+?^${}()|[]\\]/g, ...)`의 역슬래시가 도구를
   거치며 하나 소실돼 **파일이 통째로 SyntaxError**로 죽었다(저장소가 이미 겪은 함정이다).
   → 선택자는 `indexOf`로 찾고 중괄호를 `slice`로 자른다. 역슬래시가 없으면 안 깨진다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage } = require('./_page_boot.js');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* 선택자 하나의 선언 블록만 떼어 온다.
   ⚠ `.gcl-title`을 찾을 때 `.gcl-title::before`가 섞이면 안 되므로 **여는 중괄호까지**
     붙여 찾는다(`.gcl-title {`은 `.gcl-title::before {`와 다른 글자다). */
const rule = (sel) => {
  let j = CSS.indexOf(sel + ' {');
  if (j < 0) j = CSS.indexOf(sel + '{');
  if (j < 0) return '';
  const a = CSS.indexOf('{', j);
  const b = CSS.indexOf('}', a);
  return (a < 0 || b < 0) ? '' : CSS.slice(a + 1, b);
};
/* 공백을 걷어 내고 본다 — 「`color: var(--x)`」와 「`color:var(--x)`」를 같게 읽는다 */
const flat = (s) => s.split(' ').join('').split(String.fromCharCode(10)).join('');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const { win, doc, ready } = bootPage('index.html');
  await ready;
  const cs = (el) => win.getComputedStyle(el);

  const box = doc.getElementById('groupChecklist');
  const title = doc.querySelector('.gcl-title');
  const secTitles = [...doc.querySelectorAll('.gcl-sec-title')];
  const items = [...doc.querySelectorAll('.gcl-list li')];

  console.log('\n[1] 구역이 그대로 있다');
  ok('① 체크리스트 구역이 있다', !!box);
  ok('① 접이식(details)이다 — 참고용이라 기본은 접는다', !!box && box.tagName === 'DETAILS', box && box.tagName);
  ok('① 묶음이 셋이다', secTitles.length === 3, `${secTitles.length}개`);
  ok('① 항목이 12개다', items.length === 12, `${items.length}개`);
  for (const want of ['사전 준비', '서류 · 행정', '현지 운영']) {
    ok(`① 「${want}」 묶음이 있다`, secTitles.some((t) => t.textContent.trim() === want));
  }

  console.log('\n[2] 🔴 글자가 **11px 이상**이다 (저장소 규칙 — 여기가 어기고 있었다)');
  /* 고치기 전: 구역 제목 11px · 묶음 제목 **10px 셋**. 10px는 규칙 위반이었다. */
  ok('② 구역 제목이 12px 이상이다', parseFloat(cs(title).fontSize) >= 12, cs(title).fontSize);
  secTitles.forEach((t, i) => {
    ok(`② ${i + 1}번째 묶음 제목이 11px 이상이다`, parseFloat(cs(t).fontSize) >= 11, cs(t).fontSize);
  });
  items.slice(0, 3).forEach((li, i) => {
    ok(`② ${i + 1}번째 항목이 11px 이상이다`, parseFloat(cs(li).fontSize) >= 11, cs(li).fontSize);
  });

  console.log('\n[3] 🔴 한글에 자간을 벌리지 않는다 (CLAUDE.md 화면 규칙)');
  /* 고치기 전: 구역 제목 .08em(0.88px) · 묶음 제목 .14em(1.4px). 내용은 전부 한글이다.
     ⚠ 값이 `normal`이면 parseFloat가 NaN이고 **NaN <= 0.5는 false**라 실패로 샌다 —
       0으로 바꿔서 받는다. */
  const spacing = (el) => {
    const v = cs(el).letterSpacing;
    return (!v || v === 'normal') ? 0 : parseFloat(v);
  };
  ok('③ 구역 제목 자간이 0.5px 이하다', spacing(title) <= 0.5, cs(title).letterSpacing);
  secTitles.forEach((t, i) => {
    ok(`③ ${i + 1}번째 묶음 제목 자간이 0.5px 이하다`, spacing(t) <= 0.5, cs(t).letterSpacing);
  });
  ok('③ 구역 제목에 uppercase를 걸지 않는다(한글엔 무의미하다)',
    cs(title).textTransform !== 'uppercase', cs(title).textTransform);
  secTitles.forEach((t, i) => {
    ok(`③ ${i + 1}번째 묶음 제목에 uppercase를 걸지 않는다`,
      cs(t).textTransform !== 'uppercase', cs(t).textTransform);
  });

  console.log('\n[4] 제목이 굵어졌다');
  ok('④ 구역 제목이 800 이상이다', parseInt(cs(title).fontWeight, 10) >= 800, cs(title).fontWeight);
  secTitles.forEach((t, i) => {
    ok(`④ ${i + 1}번째 묶음 제목이 800 이상이다`, parseInt(cs(t).fontWeight, 10) >= 800, cs(t).fontWeight);
  });

  console.log('\n[5] 🔴 이름이 체크리스트면 표식도 **체크**여야 한다 [CSS 소스]');
  /* 고치기 전 표식은 **5×1.5px 대시**였다(`height:1.5px; background:var(--t-sub)`).
     체크는 테두리 두 변을 45° 돌려 그린다 — **폰트에도 CDN에도 기대지 않는다.**
     ⚠ 아이콘 라이브러리를 쓰지 않은 이유: 어제(`eee3a0e`) 바깥 CDN이 404라 아이콘이
       한 개도 안 그려지고 있던 사고가 있었다. 바깥에서 받아 오는 것은 검사망 사각지대다. */
  const bullet = flat(rule('.gcl-list li::before'));
  ok('⑤ 표식 규칙을 찾았다', bullet.length > 0);
  ok('⑤ 테두리 두 변으로 그린다', bullet.indexOf('border-width:0') >= 0, bullet);
  ok('⑤ 45도로 돌린다', bullet.indexOf('rotate(45deg)') >= 0, bullet);
  ok('⑤ 🔴 대시로 되돌아가지 않았다(납작하지 않다)', bullet.indexOf('height:1.5px') < 0, bullet);
  ok('⑤ 🔴 배경으로 칠하지 않는다(그게 대시였다)', bullet.indexOf('background:none') >= 0, bullet);
  /* 체크리스트 구역 안에 바깥 아이콘을 들이지 않았는지 — 구역만 잘라서 본다 */
  const a = INDEX.indexOf('id="groupChecklist"');
  const chunk = a < 0 ? '' : INDEX.slice(a, INDEX.indexOf('</details>', a));
  ok('⑤ 구역 안에 바깥 아이콘 라이브러리를 쓰지 않는다',
    chunk.length > 0 && chunk.indexOf('data-lucide') < 0);

  console.log('\n[6] 색은 **CSS 소스로** 확인한다 (jsdom은 var()를 계산하지 않는다)');
  const secRule = flat(rule('.gcl-sec-title'));
  ok('⑥ 묶음 제목이 먹색이다', secRule.indexOf('color:var(--t-head)') >= 0, secRule);
  ok('⑥ 묶음 제목 위에 레드 선이 있다', secRule.indexOf('border-top:2pxsolidvar(--red)') >= 0, secRule);
  ok('⑥ 구역 제목 앞에 레드 바가 있다',
    flat(rule('.gcl-title::before')).indexOf('background:var(--red)') >= 0, flat(rule('.gcl-title::before')));
  ok('⑥ 항목 글자가 --t-body다(힌트색 --t-mute가 아니다)',
    flat(rule('.gcl-list li')).indexOf('color:var(--t-body)') >= 0, flat(rule('.gcl-list li')));
  /* ⚠ 레드는 CTA·아이브로우·핵심 수치 3곳뿐(방향 4). 체크 표식은 12개라 레드로 칠하면
     그 원칙을 넘는다 — 레드는 묶음 제목 선 셋과 구역 머리 바 하나로 충분하다. */
  ok('⑥ 🔴 체크 표식 12개를 레드로 칠하지 않았다', bullet.indexOf('var(--red)') < 0, bullet);

  console.log('\n[7] 3열 배치와 좁은 화면 되돌림은 그대로다 (2026-09-14에 정한 것)');
  const bodyRule = flat(rule('.gcl-body'));
  ok('⑦ 3열이다', bodyRule.indexOf('repeat(3,1fr)') >= 0, bodyRule);
  const mq = CSS.indexOf('max-width:820px');
  ok('⑦ 좁은 화면에서 1열로 돌아간다',
    mq >= 0 && flat(CSS.slice(mq, mq + 140)).indexOf('.gcl-body{grid-template-columns:1fr') >= 0);

  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZB 체크리스트 글자와 표식`);
  process.exit(fail ? 1 : 0);
})();

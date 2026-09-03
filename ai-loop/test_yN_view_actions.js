/* ═══════════════════════════════════════════════════════════════════════════
   YN — **문서를 못 열었는데 문서 버튼이 그대로 있었다**
   ───────────────────────────────────────────────────────────────────────────
   `audit_customer_journey.js`가 `estimate-view.html`에서 「눌러도 아무 일도 안 나는
   것 1개 — 엑셀 #downloadExcelBtn」을 찍었다. 열어 보니 감사 도구의 오탐이 아니었다:

     상단 바의 「인쇄 / PDF」·「엑셀」은 `<header>` 안에 **처음부터 그려져 있고**,
     견적서를 못 불러온 실패 경로는 `#error-wrap`만 바꾸고 `return`한다.

   그래서 링크가 만료된 고객이 보는 화면은 이랬다:

     본문 : 「견적서를 불러올 수 없습니다 — 담당자에게 새 링크를 요청해 주세요」
     상단 : 【인쇄 / PDF】 【엑셀】      ← 여전히 눌린다

     · 「엑셀」 → `if (!d) return;` — **아무 일도 안 난다**(결함 생성기 ② 조용한 폴백)
     · 「인쇄」 → **오류 화면이 인쇄된다**

   고객은 자기 쪽 문제라고 생각한다. 우리가 「못 연다」고 말해 놓고 여는 버튼을
   내주고 있었기 때문이다.

   🔴 잠그는 것 넷:
     ① 문서를 못 열면 인쇄·엑셀 버튼이 **안 보인다**
     ② 문서를 열면 **보인다** (숨기기만 하고 안 켜면 기능이 통째로 죽는다)
     ③ **취소된 견적서(`void`)에서도 보인다** — 문서는 열렸고, 금액·견적번호를 근거로
        남기는 것이 XU의 결정이다. 「실패」와 「취소」를 같은 것으로 다루면 그 결정이 깨진다
     ④ 켜는 자리가 **한 곳**이다 — 늘어나면 한쪽만 고쳐진 상태가 생긴다(결함 생성기 ①)

   ⚠ `.top-bar-btns`는 `display:flex`라 **`hidden` 속성만으로는 안 숨는다.**
     CSS 규칙이 함께 있어야 한다 — 그것도 검사한다. 이게 없으면 위 ①이
     「속성은 걸렸는데 화면에는 그대로 보이는」 상태로 조용히 통과한다.

   실행: node ai-loop/test_yN_view_actions.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, ROOT } = require('./_page_boot');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — YN 못 연 문서에 문서 버튼`);
  process.exit(fail ? 1 : 0);
};

const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const 문서 = (st) => {
  const d = {
    v: 1, dk: '다낭', dt: '다낭 (Da Nang)', n: 30, d: 4, ng: 3,
    org: '점검기관', cn: '점검담당', sd: ymd(60), ed: ymd(63),
    t: 56696074, pp: 1889869, iso: ymd(0), qno: 'Q-260903-01',
    rows: [['항공', 10393137], ['호텔', 28647465]],
    _verify: { verdict: 'verified' },
  };
  if (st) d.st = st;
  return d;
};

/* 「보인다」를 **속성이 아니라 화면 기준으로** 잰다.
   `hidden`이 걸려 있어도 CSS가 `display:flex`로 이기면 고객에게는 보인다 —
   이 검사의 전부가 여기 달려 있다. */
function 보이는가(win, el) {
  if (!el) return false;
  const cs = win.getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

(async () => {
  console.log('\n[1] 🔴 ① 링크가 잘못됐을 때 — 문서 버튼이 안 보인다');
  {
    const V = bootPage('estimate-view.html', { query: '?id=없는건', fixtures: { shareDoc: null } });
    await V.ready; await V.tick(300);
    const acts = V.doc.getElementById('doc-actions');
    ok('① 버튼 묶음을 찾았다', !!acts);
    ok('🔴 ① 화면에 안 보인다', !보이는가(V.win, acts),
      acts ? V.win.getComputedStyle(acts).display : '(없음)');
    /* 대조군 — 못 연다는 말은 실제로 하고 있어야 한다.
       이게 0이면 화면이 아예 안 그려진 것이고, 위 통과는 의미가 없다. */
    const t = (V.doc.body.textContent || '').replace(/\s+/g, ' ');
    ok('① (대조군) 못 연다고 말한다', /불러올 수 없습니다/.test(t), t.slice(0, 70));
    ok('① 화면 오류가 없다', V.log.errors.length === 0, V.log.errors.map((e) => e.msg).join(' | '));
    V.win.close();
  }

  console.log('\n[2] 🔴 ② 정상 견적서 — 보인다 (숨기기만 하면 기능이 죽는다)');
  {
    const V = bootPage('estimate-view.html', { query: '?id=x', fixtures: { shareDoc: 문서() } });
    await V.ready; await V.tick(320);
    const acts = V.doc.getElementById('doc-actions');
    ok('🔴 ② 화면에 보인다', 보이는가(V.win, acts),
      acts ? V.win.getComputedStyle(acts).display : '(없음)');
    ok('② 엑셀 버튼이 그 안에 있다', !!(acts && acts.querySelector('#downloadExcelBtn')));
    ok('② (대조군) 금액이 그려졌다', /56,696,074/.test(V.doc.body.textContent || ''));
    ok('② 화면 오류가 없다', V.log.errors.length === 0, V.log.errors.map((e) => e.msg).join(' | '));
    V.win.close();
  }

  console.log('\n[3] 🔴 ③ 취소된 견적서 — 문서는 열렸으므로 버튼도 있다 (XU 결정)');
  {
    const V = bootPage('estimate-view.html', { query: '?id=x', fixtures: { shareDoc: 문서('void') } });
    await V.ready; await V.tick(320);
    const acts = V.doc.getElementById('doc-actions');
    ok('🔴 ③ 취소여도 보인다', 보이는가(V.win, acts),
      acts ? V.win.getComputedStyle(acts).display : '(없음)');
    ok('③ (대조군) 취소라고 말한다', /취소되었습니다/.test(V.doc.body.textContent || ''));
    V.win.close();
  }

  console.log('\n[4] 🔴 ⚠ `hidden`이 CSS를 이기는가 — 속성만으로는 안 숨는다');
  {
    const src = fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8');
    const css = src.replace(/\/\*[\s\S]*?\*\//g, '');   /* 주석의 설명을 근거로 삼지 않는다 */
    ok('🔴 ④ `.top-bar-btns[hidden]`을 숨기는 규칙이 있다',
      /\.top-bar-btns\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css));
    /* 이 규칙이 정말 필요한지도 함께 못 박는다 — flex가 아니면 이 검사는 과보호다 */
    ok('④ (근거) `.top-bar-btns`가 display:flex라 규칙이 필요하다',
      /\.top-bar-btns\s*\{[^}]*display\s*:\s*flex/.test(css));
  }

  console.log('\n[5] 🔴 ④ 켜는 자리가 한 곳이다');
  {
    const src = fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8');
    const code = src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const 켬 = (code.match(/\.hidden\s*=\s*false/g) || []).length;
    ok('④ `hidden = false`가 한 번만 나온다', 켬 === 1, String(켬));
    /* 엑셀 함수가 **조용히** 돌아가지 않는다 */
    const fn = (code.match(/function downloadEstimateExcelShared\(\)[\s\S]{0,400}/) || [''])[0];
    ok('🔴 ④ 데이터가 없으면 말은 한다(조용한 return이 아니다)',
      /if\s*\(!d\)\s*\{[\s\S]{0,200}alert\(/.test(fn), fn.slice(0, 120).replace(/\s+/g, ' '));
  }

  done();
})();

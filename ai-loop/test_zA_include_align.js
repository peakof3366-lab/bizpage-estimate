/* ═══════════════════════════════════════════════════════════════════════════
   ZA — 포함 항목 세 영역의 **줄이 같은 자에 앉는가** (2026-09-15 대표 지시)

   ■ 대표가 말한 것
   「항공 · 추가 선택 · 숙박 — 각 영역에서 박스들 크기가 형태별로 유사하게 맞춰지면
     좋겠고, 3가지 영역 안에서 박스별로 좌우 라인이 맞게 떨어지면 좋겠다.」

   ■ 고치기 전 실측 (브라우저, 폭 1440)
     칩 폭이 **49~126px로 흩어져** 있었다(호텔 49 · 가이드 59 · 3성급 56 · 2인 1실 64 ·
     이코노미 69 · 지방 출발 126). 그래서 **숙박의 두 줄이 오른쪽 끝에서 7px 어긋났다.**
     줄이 시작하는 x도 갈렸다 — 항공·숙박은 라벨이 **옆**에 있어 칩이 70px 들여쓰기되고,
     추가 선택은 라벨이 없어 0px에서 시작했다.

   ■ 무엇으로 고쳤나 — **3열 고정 그리드 하나**
     칩과 필을 전부 같은 3열에 태웠다. 고친 뒤 실측: 칩 폭이 **전부 102px**,
     각 영역의 줄 왼쪽 x가 **한 값**, 세 영역의 첫 줄 y가 **2245로 일치**.
     폭 일곱 가지(1440·1280·1024·860·720·390·320) 전부에서 왼쪽 라인이 한 값이고
     가로 밀림이 없다.

   ■ 🔴 이 검사가 왜 필요한가
   고치기 전에 `.item-selector`·`.inc-chip`·`.grade-pill`·`.inc-sec-lbl`을 재는 검사가
   **저장소에 하나도 없었다.** 즉 이 화면은 안전망 밖이었고, 누가 CSS 한 줄을 지워도
   아무도 모른다. 여기서 잡는다.

   ■ 🔴🔴 jsdom으로 **재면 안 되는 것** — 이 파일을 고칠 사람은 먼저 읽을 것
   jsdom은 `var()`가 든 선언을 **계산하지 않는다.** 실측으로 확인했다:
       getComputedStyle(제목).color          → "var(--t-head)"   (브라우저: rgb(13,13,13))
       getComputedStyle(제목).borderTopStyle → "none"            (브라우저: solid)
       getComputedStyle(제목).borderTopWidth → "16px"            (브라우저: 2px)
   즉 **색과 테두리를 jsdom으로 재면 조용히 틀린 답을 얻는다.** 그래서 이 검사는
   var()가 없는 값(크기·굵기·자간·그리드·flex 방향)만 computed로 재고,
   **색과 위선은 `styles.css`를 직접 읽어** 확인한다. 어느 쪽인지 [5]에 표시해 두었다.
   ⚠ 진짜 배치(폭 102px·왼쪽 라인)는 브라우저로만 잴 수 있다:
       python ai-loop/check_customer_screens.py
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage } = require('./_page_boot.js');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const { win, doc, ready } = bootPage('index.html');
  await ready;
  const cs = (el) => win.getComputedStyle(el);

  const sel = doc.querySelector('.item-selector');
  const secs = [...doc.querySelectorAll('.item-selector > .inc-sec')];
  const names = secs.map((s) => (s.querySelector('.inc-sec-lbl') || {}).textContent || '');

  console.log('\n[1] 세 영역이 있다');
  ok('① 포함 항목 상자가 있다', !!sel);
  ok('① 영역이 셋이다', secs.length === 3, `${secs.length}개`);
  for (const want of ['항공', '추가 선택', '숙박']) {
    ok(`① 「${want}」 영역이 있다`, names.some((n) => n.trim() === want), names.join(' / '));
  }

  console.log('\n[2] 🔴 칩·필 줄이 **전부 같은 3열 그리드**다 (박스 크기를 같게 만드는 자리)');
  /* 이 한 줄이 「박스 크기가 형태별로 유사하게」와 「좌우 라인이 맞게」를 **동시에** 푼다.
     줄마다 칩 개수가 달라도 칸 폭이 (영역폭 − 간격)/3으로 같아지기 때문이다. */
  const rows = [...doc.querySelectorAll('.item-selector .inc-chips, .item-selector .grade-pills')];
  ok('② 잴 줄이 있다', rows.length >= 5, `${rows.length}줄`);
  rows.forEach((r, i) => {
    const s = cs(r);
    ok(`② ${i + 1}번째 줄이 3열 그리드다`, s.display === 'grid' && /repeat\(3\s*,\s*1fr\)/.test(s.gridTemplateColumns),
      `${s.display} / ${s.gridTemplateColumns}`);
  });

  console.log('\n[3] 🔴 라벨이 줄 **위로** 올라가 있다 (왼쪽 라인을 맞추는 자리)');
  /* 라벨을 옆에 두면 그 줄만 `.grade-label`의 min-width 58 + gap 12 = **70px 밀려**
     3열 밖으로 나간다. 항공·숙박이 추가 선택과 왼쪽 라인이 안 맞던 원인이 이것이었다.
     ⚠ 라벨 글자를 지운 것이 아니다 — 자리만 옮겼다. */
  const gradeRows = [...doc.querySelectorAll('.item-selector .inc-grade-row')];
  ok('③ 라벨 줄이 있다', gradeRows.length >= 3, `${gradeRows.length}개`);
  gradeRows.forEach((r, i) => {
    const lab = r.querySelector('.grade-label');
    ok(`③ ${i + 1}번째 라벨 줄이 세로로 쌓인다`, cs(r).flexDirection === 'column', cs(r).flexDirection);
    ok(`③ ${i + 1}번째 라벨 글자가 남아 있다`, !!lab && lab.textContent.trim().length > 0,
      lab ? '(빈 라벨)' : '(라벨 없음)');
  });

  console.log('\n[4] 글자가 긴 칩 하나뿐인 줄은 **한 줄을 통째로** 쓴다');
  /* 「지방 출발(국내 수송)」을 1/3 칸에 넣으면 글자가 두 줄로 꺾여 그 줄만 혼자 높아진다. */
  ok('④ 전폭 규칙이 있다', /\.item-selector\s+\.inc-chips\s*>\s*\.inc-chip:only-child\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(CSS));
  const lone = [...doc.querySelectorAll('.item-selector .inc-chips')]
    .filter((c) => c.querySelectorAll('.inc-chip').length === 1);
  ok('④ 그런 줄이 실제로 있다(지방 출발)', lone.length === 1, `${lone.length}줄`);

  console.log('\n[5] 영역 제목이 **머리로 서 있다** (대표 지시: 「좀 더 강조」)');
  const lbls = [...doc.querySelectorAll('.item-selector .inc-sec > .inc-sec-lbl')];
  ok('⑤ 제목이 셋이다', lbls.length === 3, `${lbls.length}개`);
  lbls.forEach((l, i) => {
    const s = cs(l);
    /* var()가 없는 값이라 jsdom을 믿을 수 있다 */
    ok(`⑤ ${i + 1}번째 제목이 12px 이상이다 [jsdom]`, parseFloat(s.fontSize) >= 12, s.fontSize);
    ok(`⑤ ${i + 1}번째 제목이 굵다(800 이상) [jsdom]`, parseInt(s.fontWeight, 10) >= 800, s.fontWeight);
  });
  /* 🔴 색과 위선은 **jsdom이 못 읽는다**(머리말 참조) — CSS 소스에서 본다.
     브라우저 실측값: color rgb(13,13,13) · border-top 2px solid rgb(13,13,13). */
  const lblRule = CSS.match(/\.item-selector\s+\.inc-sec\s*>\s*\.inc-sec-lbl[^{]*\{([^}]*)\}/);
  ok('⑤ 제목 규칙을 찾았다 [CSS 소스]', !!lblRule);
  if (lblRule) {
    ok('⑤ 제목이 먹색이다(회색이 아니다) [CSS 소스]', /color:\s*var\(--t-head\)/.test(lblRule[1]), lblRule[1].trim());
    ok('⑤ 제목 위에 선이 있다 [CSS 소스]', /border-top:\s*2px\s+solid/.test(lblRule[1]));
    /* ⚠ 레드를 쓰지 않는다 — 레드는 CTA·아이브로우·핵심 수치 3곳뿐(방향 4).
       제목 셋을 레드로 칠하면 바로 아래 「견적 계산」 버튼이 묻힌다. */
    ok('⑤ 🔴 제목에 레드를 쓰지 않는다 [CSS 소스]', !/var\(--red\)/.test(lblRule[1]));
  }

  console.log('\n[6] 🔴 이 규칙이 **담당자 화면으로 새지 않는다**');
  /* 어제(`4231502`) 고객 화면에 넣은 3열 규칙이 `admin-quote.html`까지 먹어 그 화면의
     오른쪽 2/3가 통째로 빈 일이 있었다. `styles.css`는 고객 화면 전용이 아니다 —
     `index.html`·`packages.html`·`admin.html`·`admin-quote.html` 넷이 싣는다.

     🔴🔴 **이 검사를 처음엔 `CSS.includes('.item-selector .inc-chips')`로 짰다가
       누수를 못 잡았다.** 접두사를 일부러 떼어 `.inc-chips,`로 만들어 놓고 돌렸는데도
       40 pass / 0 fail이 나왔다 — 같은 글자가 **바로 아래 `:only-child` 규칙에도** 있어서
       `includes`가 여전히 참이었기 때문이다. 저장소가 거듭 경고한 「글자로 재면 조용히
       통과한다」가 내 손에서 그대로 재현됐다(결함 생성기 ③).
     → **선택자를 글자로 찾지 않고 스타일시트를 진짜 파싱한다.** 3열을 거는 규칙을 전부
       모아, 그 선택자가 **하나도 빠짐없이** 고객 폼 안으로 좁혀져 있는지 본다.
       규칙이 몇 개로 쪼개지든 선택자를 어떻게 적든 이 방법은 안 속는다. */
  const sheet = [...doc.styleSheets].find((s) => /styles\.css/.test(s.href || ''));
  ok('⑥ styles.css를 파싱했다', !!sheet && sheet.cssRules.length > 0,
    sheet ? `${sheet.cssRules.length}규칙` : '(못 찾음)');

  const SCOPED = /^\s*\.(item-selector|estimate-grid)\b/;   // 고객 견적 폼 안쪽
  const scopeCheck = (rules, what) => {
    ok(`⑥ ${what} 규칙을 찾았다`, rules.length >= 1, `${rules.length}개`);
    for (const r of rules) {
      for (const one of r.selectorText.split(',')) {
        ok(`⑥ 「${one.trim()}」가 고객 폼 안으로 좁혀져 있다`, SCOPED.test(one),
          '접두사가 빠지면 admin-quote 화면이 함께 걸린다');
      }
    }
  };
  if (sheet) {
    const flat = [...sheet.cssRules].filter((r) => r.style && r.selectorText);
    /* ⚠ **대상을 좁혀서 고른다.** 처음엔 「3열을 거는 규칙 전부」로 잡았다가 포함 항목과
       아무 상관 없는 셋(`.gcl-body` 준비 체크리스트 · `.pf-grid` 포트폴리오 ·
       빈 화면 안내의 단계 카드)까지 잡아 **멀쩡한데 3 fail**이 났다. 그대로 뒀으면
       늘 ✗인 잣대가 되어 다음 사람이 이 줄을 안 읽게 된다. */
    scopeCheck(flat.filter((r) => /repeat\(3\s*,\s*1fr\)/.test(r.style.gridTemplateColumns || '')
      && /\b(inc-chips|grade-pills)\b/.test(r.selectorText)), '칩·필 줄에 3열을 거는');
    scopeCheck(flat.filter((r) => (r.style.flexDirection || '') === 'column'
      && /\binc-grade-row\b/.test(r.selectorText)), '라벨을 세로로 쌓는');
  }

  /* 🔴 **여기가 누수를 진짜로 잡는 자리다.** 위 [⑥ 선택자 검사]는 내가 고른 대상만 보지만,
     이것은 **담당자 산출 화면을 실제로 띄워 계산된 값을 읽는다.**
     `.inc-vip-row`는 `admin-quote.html`도 쓰는 유일한 클래스다(세어 봤다). 원래
     `margin-top:8px`인데, 오늘 규칙에서 `.item-selector` 접두사가 빠지면 그 화면에서도
     **0px로 눌린다.** 어제 그 화면의 오른쪽 2/3가 비었던 사고가 정확히 이 모양이었다. */
  const { win: aWin, doc: aDoc, ready: aReady } = bootPage('admin-quote.html');
  await aReady;
  ok('⑥ 담당자 산출 화면을 띄웠다', [...aDoc.styleSheets].some((s) => /styles\.css/.test(s.href || '')));
  ok('⑥ 담당자 산출 화면은 .item-selector를 쓰지 않는다', aDoc.querySelectorAll('.item-selector').length === 0);
  const aqVip = aDoc.querySelector('.inc-vip-row');
  ok('⑥ 🔴 .inc-vip-row는 그 화면도 쓴다 — 그래서 좁혀야 한다', !!aqVip);
  if (aqVip) {
    ok('⑥ 🔴 담당자 화면의 .inc-vip-row가 오늘 규칙에 **안 걸렸다**',
      aWin.getComputedStyle(aqVip).marginTop === '8px',
      `margin-top=${aWin.getComputedStyle(aqVip).marginTop} (8px여야 한다 — 0px면 규칙이 샜다)`);
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZA 포함 항목 세 영역 정렬`);
  process.exit(fail ? 1 : 0);
})();

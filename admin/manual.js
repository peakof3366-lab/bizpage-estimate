/* ══════════════════════════════════════════════════════════════════════════
   화면마다 「이 화면 매뉴얼」 내려받기 (2026-09-17 대표 지시)
   「만들어진 매뉴얼을 각 카테고리에서 다운 받을 수 있게」

   🔴 **admin.html에 넣지 않는다.** 그 파일은 15,148줄에서 5,403줄로 줄여 놓은
     것이고, `test_zQ`가 다시 붓는 것을 막고 있다 — 실제로 이 코드를 거기 넣었다가
     그 검사에 걸렸다. 나머지 화면들과 같이 `admin/*.js`로 뗀다.

   🔴 **17개 화면의 HTML을 손으로 고치지 않는다.** 버튼을 17번 적으면 한 곳을
     빠뜨리거나 문구가 갈라진다(결함 생성기 ①). 여기 한 함수가 붙인다.

   🔴 **탭을 열 때가 아니라 시작할 때 붙인다.** 처음엔 `renderTab`에 매달았는데,
     화면 검사 도구들은 `renderTab`을 부르지 않고 `.tab-panel`에 `.active`만
     토글한다 — 그러면 **검사에는 버튼이 아예 안 보인다**(결함 생성기 ③).
     화면은 정적 HTML이니 한 번에 다 붙이면 된다.

   🔴 **매뉴얼에 그 절이 없는 화면에는 버튼을 안 만든다.** 눌러도 아무 데도 못
     가는 버튼은 결함이다. 지금 절이 없는 화면: 대시보드·통계·이벤트·견적 분석·
     마케팅·콘텐츠·설정·매뉴얼.

   ⚠ 이 목록과 `manual.html`의 `<section id>`가 어긋나면 버튼이 조용히 전체
     매뉴얼로 떨어진다. `ai-loop/test_aA_manual_perscreen.js`가 둘을 대조한다 —
     **매뉴얼에 절을 늘리면 여기 한 줄 늘리고 그 검사를 돌릴 것.**
   ══════════════════════════════════════════════════════════════════════════ */
(function manualPerScreen() {
  'use strict';

  /* 절 이름과 화면 이름은 **대부분 같다**. 다른 하나만 적는다 —
     표를 길게 적으면 매뉴얼이 늘 때마다 여기도 고쳐야 한다. */
  const ALIAS = { itineraries: 'itinerary' };

  const SECTIONS = [
    'inquiries', 'estmgr', 'quotepro', 'itineraries', 'packages',
    'adhoc', 'ledger', 'pricereport', 'rates',
  ];

  function mountAll() {
    let n = 0;
    SECTIONS.forEach((tab) => {
      const head = document.querySelector('#tab-' + tab + ' .page-head');
      if (!head) { console.warn('[매뉴얼] 화면을 못 찾았다:', tab); return; }
      if (head.querySelector('.page-manual-link')) return;   /* 두 번 안 붙인다 */

      const a = document.createElement('a');
      a.className = 'page-manual-link';
      a.href = 'manual.html?only=' + encodeURIComponent(ALIAS[tab] || tab);
      a.target = '_blank';
      a.rel = 'noopener';
      /* ⚠ 이름이 **무슨 일이 날지** 말해야 한다 — 「도움말」로는 무엇이 열리는지 모른다. */
      a.textContent = '📄 이 화면 매뉴얼 · PDF로 저장';
      /* ⚠ 이 화면엔 이름이 같은 버튼이 이미 많다(「저장」·「편집」). 낭독기가 구별할 수
         있게 **어느 화면인지**를 넣는다. 제목은 화면에 보이는 것을 그대로 읽는다 —
         제목을 여기 다시 적으면 화면과 어긋난다(결함 생성기 ①). */
      const title = head.querySelector('.page-title');
      a.setAttribute('aria-label',
        (title ? title.textContent.trim() : tab)
        + ' 매뉴얼을 새 탭에서 열기 — 거기서 PDF로 저장할 수 있습니다');
      head.appendChild(a);
      n++;
    });
    return n;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();

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
      /* 🔴 **누가 여는지 센다**(2026-09-17 대표 요청: 「2주면 안다」).
         ⚠ 링크를 **막지 않는다** — `keepalive`로 던지고 응답을 안 기다린다.
           통계 때문에 매뉴얼이 안 열리면 본말이 뒤집힌다.
         ⚠ 실패해도 조용히 넘어간다. 다만 **콘솔에는 남긴다** — 조용한 폴백은
           「안 읽는다」와 「못 셌다」를 구별 못 하게 만든다(결함 생성기 ②).
         ⚠ 인증이 걸린 `/api/admin/insights`로 보낸다. 공개 `/api/track`은
           이 이름을 **받지 않는다**(`public: false`) — 바깥에서 한 건만 들어와도
           「우리 직원이 읽는가」라는 물음의 답이 못 쓰게 된다. */
      a.addEventListener('click', () => {
        try {
          fetch('/api/admin/insights?type=event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'manual_open', meta: { screen: tab } }),
            keepalive: true,
          }).catch((err) => console.warn('[매뉴얼] 열람을 세지 못했다:', err && err.message));
        } catch (err) {
          console.warn('[매뉴얼] 열람을 세지 못했다:', err && err.message);
        }
      });
      head.appendChild(a);
      n++;
    });
    return n;
  }

  /* ══ 얼마나 읽히나 — 매뉴얼 탭에 띄운다 ═══════════════════════════════
     🔴 **0도 답이다.** 「한 번도 안 열렸습니다」가 보여야 손을 쓸 수 있다 —
       숫자가 없으면 「안 읽는 것 같다」는 짐작에서 영원히 못 벗어난다.
     ⚠ 못 불러왔을 때 **빈칸으로 두지 않는다.** 0과 「못 셌다」는 다른 말이다. */
  const SCREEN_LABEL = {
    inquiries: '문의 관리', estmgr: '견적 요청 관리', quotepro: '자동 견적 산출',
    itineraries: '일정·방식 비교', packages: '패키지 상품', adhoc: '직접 견적 작성',
    ledger: '견적서 대장', pricereport: '견적서 업데이트', rates: '요율 관리',
  };

  async function showStats() {
    const box = document.getElementById('manualStats');
    if (!box) return;
    try {
      const res = await fetch('/api/admin/insights?type=manual');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (!d.total) {
        box.textContent = '지난 30일 — 화면 매뉴얼을 연 사람이 없습니다 (0회).';
        return;
      }
      const top = (d.byScreen || []).slice(0, 5)
        .map((r) => (SCREEN_LABEL[r.screen] || r.screen) + ' ' + r.c + '회').join(' · ');
      box.textContent = '지난 30일 — 화면 매뉴얼 ' + d.total + '회 열림' + (top ? ' · ' + top : '');
    } catch (err) {
      /* 🔴 「0회」로 떨어뜨리지 않는다. 못 센 것을 안 읽은 것으로 보이게 하면 안 된다. */
      box.textContent = '열람 횟수를 불러오지 못했습니다 — 0회라는 뜻이 아닙니다.';
      console.warn('[매뉴얼] 열람 통계를 못 불러왔다:', err && err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mountAll(); showStats(); });
  } else {
    mountAll();
    showStats();
  }
})();

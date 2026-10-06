/* 견적 폼 금액 요약 막대 (2026-10-06 A안 디자인 — 대표 선택)
   🔴 고치려는 것: 옵션(호텔 등급 · 좌석 등급 …)을 바꾸는 자리에서 **금액이 화면 밖**에 있었다.
     결과 카드가 폼 아래에 있어 폰에서는 약 1,000px 아래였다 — 바꿔 봐도 무엇이 달라졌는지 안 보인다.
   ⚠ 결과 카드를 오른쪽으로 옮기지 않은 이유: 2026-09-14 대표 지시가 「위에서 아래로 진행되게」였다.
     그래서 카드는 그대로 두고, **폼이 보이는데 카드의 금액이 안 보일 때만** 아래에 한 줄을 띄운다.
   ⚠ 금액을 계산하지 않는다 — 결과 카드(#perPersonValue · #resultValue)의 글자를 **그대로 옮겨 적기만** 한다.
     계산을 한 벌 더 두면 두 숫자가 어긋나는 날이 온다(결함 생성기 ①).
   ⚠ 막대가 뜨면 body에 `qbar-on`, 폼이 화면에 있으면 `in-qform`을 단다 — 떠 있는 버튼(카카오 · 맨 위로)이
     비켜서거나(넓은 화면) 숨는(폰) 규칙은 styles.css 「A안 디자인 시스템」 블록에 있다. */
(function () {
  'use strict';

  function init() {
    var per = document.getElementById('perPersonValue');
    var tot = document.getElementById('resultValue');
    var detail = document.getElementById('estimateDetail');
    var form = document.getElementById('estimateForm');
    var totals = document.querySelector('.result-totals');
    if (!per || !tot || !detail || !form || !totals || !('IntersectionObserver' in window)) return;

    var bar = document.createElement('div');
    bar.className = 'qbar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '예상 견적 요약');
    bar.innerHTML =
      '<div class="qbar-inner">' +
        '<div class="qbar-item qbar-per"><span class="qbar-lbl">1인당 금액</span><span class="qbar-amt"></span></div>' +
        '<div class="qbar-item qbar-tot"><span class="qbar-lbl"><span class="qbar-wide">예상 </span>총액 (VAT 별도)</span><span class="qbar-amt"></span></div>' +
        /* 폰(360px)에서는 버튼 글자를 「자세히」로 줄인다 — 읽어 주는 이름은 aria-label이 그대로 지킨다 */
        '<button type="button" class="qbar-go" aria-label="금액 자세히 보기"><span class="qbar-wide">금액 </span>자세히<span class="qbar-wide"> 보기</span></button>' +
      '</div>';
    document.body.appendChild(bar);
    var perOut = bar.querySelector('.qbar-per .qbar-amt');
    var totOut = bar.querySelector('.qbar-tot .qbar-amt');

    var formIn = false, totalsIn = false;

    /* 금액이 실제로 나왔는가 — 「₩ 0」(초기값)이면 아직 견적이 없다 */
    function hasAmount() {
      if (detail.classList.contains('hidden')) return false;
      return /[1-9]/.test(per.textContent || '');
    }

    function sync() {
      perOut.textContent = (per.textContent || '').trim();
      totOut.textContent = (tot.textContent || '').trim();
      var on = hasAmount() && formIn && !totalsIn;
      bar.classList.toggle('show', on);
      document.body.classList.toggle('qbar-on', on);
      document.body.classList.toggle('in-qform', formIn);
    }

    /* 금액 칸은 막대 높이만큼 위에서 「보인다」로 친다 — 막대 뒤에 가려진 금액을 보인다고 세지 않게 */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.target === form) formIn = e.isIntersecting;
        else totalsIn = e.isIntersecting;
      });
      sync();
    }, { rootMargin: '0px 0px -88px 0px' });
    io.observe(form);
    io.observe(totals);

    var mo = new MutationObserver(sync);
    mo.observe(per, { childList: true, characterData: true, subtree: true });
    mo.observe(tot, { childList: true, characterData: true, subtree: true });
    mo.observe(detail, { attributes: true, attributeFilter: ['class'] });

    bar.querySelector('.qbar-go').addEventListener('click', function () {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      totals.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    });

    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

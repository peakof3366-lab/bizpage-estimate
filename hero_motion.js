/* 홈 첫 화면(히어로) 움직임 (2026-10-02 대표 「메인 부분에 동적인 효과를 살짝 더」)
   원칙은 styles.css 「다듬기 · 움직임」 블록과 같다 — **한 번, 짧게, 같은 곡선.** 꾸밈용 반짝임은 안 쓴다.
     사진 세 장이 마우스를 따라 아주 조금(최대 8px) 움직인다 — 마우스가 있는 큰 화면에서만.
   ⚠ 숫자 세어 올리기는 **이미 script.js 「Hero Stats 카운트업」에 있다** — 여기 한 벌 더 만들었다가 둘이 겹쳐 돌았다(2026-10-02).
   ⚠ `prefers-reduced-motion`이면 아무것도 안 한다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  /* 사진 시차 — 값은 CSS 변수로만 넘긴다(--hx·--hy, −1~1). 움직이는 양은 CSS가 정한다 */
  function initParallax() {
    var hero = document.querySelector('.hero');
    var vis = document.querySelector('.hero-visual');
    if (!hero || !vis) return;
    if (!(window.matchMedia && window.matchMedia('(pointer: fine) and (min-width: 1025px)').matches)) return;
    var raf = 0, nx = 0, ny = 0;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        vis.style.setProperty('--hx', nx.toFixed(3));
        vis.style.setProperty('--hy', ny.toFixed(3));
      });
    });
    hero.addEventListener('pointerleave', function () {
      vis.style.setProperty('--hx', '0'); vis.style.setProperty('--hy', '0');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initParallax);
  else initParallax();
})();

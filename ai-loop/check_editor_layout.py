# -*- coding: utf-8 -*-
"""일정 편집 화면(관리자 → 일정 · 방식 A·B) 모양 검사 — 실제 브라우저로 좌표를 잰다.

    python ai-loop/check_editor_layout.py            검사만
    python ai-loop/check_editor_layout.py --shots    스크린샷도 저장(ai-loop/tmp_shots/)

왜 브라우저가 필요한가: jsdom은 레이아웃을 계산하지 않는다. 이 화면에서 실제로 터진
결함 둘 다 **좌표를 재야만** 보였다.
  · RD — 일자 카드 버튼이 1개에서 4개로 늘면서 360px 화면에서 카드 밖으로 47px 밀려났다.
  · RE — 자동 높이가 textarea 기본 rows(2줄)에 걸려 한 줄짜리 문구가 62px을 쓰고 있었다.
소스만 봐서는 둘 다 멀쩡해 보인다.

⚠ 이 검사는 회귀 스위트(run_all_tests.js)에 들어가지 않는다 — 브라우저 설치가 필요해서다
   (check_manual_layout.py와 같은 이유). 대신 **원인이 되는 구조**는 test_rD/test_qB가
   소스에서 막는다. 이 화면 모양을 손댔으면 이걸 한 번 돌리는 게 맞다.

무엇을 재는가:
  ① 화면 세로 길이 — 이 화면의 가장 큰 문제라 숫자로 남긴다(줄었는지 늘었는지)
  ② 일자 카드 헤더의 버튼이 카드 밖으로 나가지 않는가
  ③ 버튼 안 글자가 눌려 잘리지 않는가
  ④ 입력칸에 담긴 글이 잘려 안 보이지 않는가  ← 이 화면의 존재 이유("쓰는 동안 다 보인다")
  ⑤ 페이지 가로 넘침
"""
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "tmp_shots"
sys.stdout.reconfigure(encoding="utf-8")
SHOOT = "--shots" in sys.argv

# 로그인을 지나지 않고 편집 화면만 세운다. 서버 없이 data.js 기본값으로 그린다 —
# 이 검사는 '모양'을 보는 것이라 실제 저장본이 필요 없고, 오히려 매번 같은 내용이어야
# 숫자를 비교할 수 있다.
SETUP = r"""
() => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-itineraries'));
  currentTab = 'itineraries';
  itiState.destKey = '도쿄';
  itiState.courses = itiClone(ITINERARY_DB['도쿄']);
  const EMPTY = { tag: '', desc: '', points: [], items: [], value: '' };
  const rec = DEST_REC['도쿄'] || {};
  recState.rec = { a: Object.assign({}, EMPTY, rec.a || {}), b: Object.assign({}, EMPTY, rec.b || {}) };
  itiRenderBody();
  recRenderBody();
  return { courses: itiState.courses.length,
           days: itiState.courses.reduce((n, c) => n + c.days.length, 0) };
}
"""

PROBE = r"""
() => {
  const panel = document.getElementById('tab-itineraries');
  const problems = [];

  /* ② 일자 카드 헤더가 카드 밖으로 나가는가 */
  document.querySelectorAll('#iti-body .iti-day').forEach((day, i) => {
    const head = day.querySelector('.iti-day-head');
    if (!head) return;
    const box = day.getBoundingClientRect();
    const cs = getComputedStyle(day);
    const right = box.right - parseFloat(cs.borderRightWidth || 0) - parseFloat(cs.paddingRight || 0);
    const left  = box.left  + parseFloat(cs.borderLeftWidth  || 0) + parseFloat(cs.paddingLeft  || 0);
    const kids = Array.from(head.children).map(el => el.getBoundingClientRect());
    const over = Math.max(...kids.map(k => k.right)) - right;
    const under = left - Math.min(...kids.map(k => k.left));
    if (over > 0.5)  problems.push(`DAY ${i+1} 헤더가 카드 오른쪽 밖으로 ${over.toFixed(1)}px`);
    if (under > 0.5) problems.push(`DAY ${i+1} 헤더가 카드 왼쪽 밖으로 ${under.toFixed(1)}px`);
  });

  /* ③ 버튼 안 글자가 눌려 잘리는가 */
  document.querySelectorAll('#tab-itineraries button').forEach(b => {
    if (b.offsetParent === null) return;
    if (b.scrollWidth > b.clientWidth + 1) {
      problems.push(`버튼 "${(b.textContent||'').trim().slice(0,10)}" 글자가 잘림 (${b.clientWidth}/${b.scrollWidth})`);
    }
  });

  /* ④ 입력칸의 글이 잘려 안 보이는가 — 이 화면의 존재 이유다 */
  const tas = Array.from(document.querySelectorAll('#tab-itineraries .iti-ta'));
  const clipped = tas.filter(t => t.offsetParent !== null && t.scrollHeight > t.clientHeight + 1);
  clipped.slice(0, 5).forEach(t => {
    problems.push(`입력칸 내용이 잘림: "${t.value.slice(0, 24)}…"`);
  });
  /* 높이가 0에 가까운 칸 — 자동 높이가 못 재고 0을 박아 버린 경우(결함 생성기 ②) */
  tas.filter(t => t.offsetParent !== null && t.getBoundingClientRect().height < 10)
     .slice(0, 3).forEach(t => problems.push('입력칸 높이가 0에 가깝다 (자동 높이 오작동)'));

  const pageOver = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (pageOver > 0.5) problems.push(`페이지 가로 넘침 ${pageOver.toFixed(1)}px`);

  const dayCards = Array.from(document.querySelectorAll('#iti-body .iti-day'));
  return {
    problems,
    panelH: Math.round(panel.scrollHeight),
    dayCardH: dayCards.length ? Math.round(dayCards[0].getBoundingClientRect().height) : 0,
    dayCards: dayCards.length,
    taCount: tas.length,
    inputs: panel.querySelectorAll('input, textarea').length,
  };
}
"""

WIDTHS = [("데스크톱", 1440), ("노트북", 1280), ("태블릿", 860), ("모바일", 420), ("아주 좁은 화면", 360)]

bad = 0
if SHOOT:
    SHOTS.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for label, width in WIDTHS:
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.route("**/api/**", lambda route: route.abort())   # 서버 없이 기본값으로 그린다
        page.goto((ROOT / "admin.html").as_uri())
        page.wait_for_timeout(400)
        info = page.evaluate(SETUP)
        page.wait_for_timeout(250)
        r = page.evaluate(PROBE)
        mark = "✓" if not r["problems"] else "✗"
        print(f"{mark} {label} {width}px — 화면 세로 {r['panelH']:,}px · "
              f"일자 카드 {r['dayCards']}장(장당 {r['dayCardH']}px) · 입력칸 {r['inputs']}개")
        for problem in r["problems"]:
            bad += 1
            print("    · " + problem)
        if SHOOT:
            page.screenshot(path=str(SHOTS / f"editor_{width}.png"), full_page=False)
        page.close()
    browser.close()

if SHOOT:
    print(f"\n스크린샷: {SHOTS}")
print("\n✓ 모양 이상 없음" if not bad else f"\n✗ {bad}건")
sys.exit(1 if bad else 0)

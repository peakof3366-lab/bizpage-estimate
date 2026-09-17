# -*- coding: utf-8 -*-
"""매뉴얼에 넣을 화면 캡처 — 다시 돌리면 다시 찍힌다.

🔴 **손으로 찍지 않는다.** 화면이 바뀌면 그림만 옛것으로 남는데, 글과 달리
   그림은 낡은 것이 눈에 안 띈다. 이 파일을 돌리면 전부 다시 찍힌다.

🔴 **프로덕션에서 찍지 않는다.** 관리자 화면에는 실제 고객 이름·연락처·금액이
   들어 있다. 그림 한 장이 저장소에 영구히 남고 배포되면 그대로 공개된다.
   그래서 **로컬 서버 + 가짜 응답**으로만 찍고, 아래에서 주소를 검사한다.

⚠ 쓰는 값은 전부 지어낸 것이다(도쿄 · 15명 · 5일 · 2026-11-10).
  실제 요율은 `data.js` 폴백이라 프로덕션 금액과 다를 수 있다 — 그림은
  **화면 생김새**를 보여 주려는 것이지 금액을 보여 주려는 것이 아니다.

돌리는 법:  python -m http.server 8899  를 저장소 폴더에서 띄운 뒤
            python ai-loop/shoot_manual.py
"""
import json
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8899"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "이미지" / "매뉴얼"
OUT.mkdir(parents=True, exist_ok=True)

ME = {"displayName": "홍길동", "role": "manager"}


def guard(page):
    """🔴 프로덕션에서 찍고 있지 않은지 확인한다."""
    if not page.url.startswith(BASE):
        raise SystemExit(f"로컬이 아닌 주소다 — 찍지 않는다: {page.url}")


def shoot(page, name, selector=None):
    guard(page)
    path = OUT / f"{name}.png"
    if selector:
        page.locator(selector).screenshot(path=str(path))
    else:
        page.screenshot(path=str(path))
    kb = path.stat().st_size / 1024
    print(f"  ✓ {name}.png  {kb:,.0f} KB")
    return kb


def main():
    total = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        # ── 자동 견적 산출 ────────────────────────────────────────────
        # ⚠ 나란히 놓을 그림은 **좁게** 찍는다 — 매뉴얼에서 반쪽 폭으로 줄어들기
        # 때문이다. 1180으로 찍었더니 43%로 줄어 글자가 안 읽혔다(재봤다).
        pg = b.new_page(viewport={"width": 760, "height": 900})
        pg.route("**/api/**", lambda r: r.fulfill(
            status=200, content_type="application/json", body=json.dumps(ME)))
        pg.goto(f"{BASE}/admin-quote-pro.html")
        pg.wait_for_timeout(1800)

        print("■ 자동 견적 산출")
        total += shoot(pg, "qp-1-조건", "#sec1")

        pg.evaluate("""() => {
          const set = (id, v) => { const e = document.getElementById(id);
            if (e) { e.value = v; e.dispatchEvent(new Event('change', {bubbles:true})); } };
          set('pDest', '도쿄'); set('pPax', '15'); set('pDays', '5'); set('pStart', '2026-11-10');
        }""")
        pg.wait_for_timeout(500)
        pg.click("#btnCalc")
        pg.wait_for_timeout(2200)
        # ⚠ 금액 표는 **넓게** 찍는다 — 매뉴얼에서 한 줄을 다 쓰기 때문이다.
        pg.set_viewport_size({"width": 1180, "height": 900})
        pg.wait_for_timeout(400)
        total += shoot(pg, "qp-2-금액", "#secMoney")

        # ── 직접 견적 작성(같은 화면, 엔진을 안 탄다) ────────────────
        pg2 = b.new_page(viewport={"width": 760, "height": 900})
        pg2.route("**/api/**", lambda r: r.fulfill(
            status=200, content_type="application/json", body=json.dumps(ME)))
        pg2.goto(f"{BASE}/admin-quote-pro.html?mode=adhoc")
        pg2.wait_for_timeout(1800)
        print("■ 직접 견적 작성")
        total += shoot(pg2, "adhoc-1-조건", "#sec1")

        print(f"\n합계 {total:,.0f} KB · {OUT}")
        b.close()


if __name__ == "__main__":
    main()

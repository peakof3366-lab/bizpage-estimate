"""
모바일 뷰포트로 index.html / admin.html 전체 스크린샷 (섹션별 분할 캡처)
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
OUT_DIR = Path(__file__).parent / "logs" / "mobile_review"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH = 390
HEIGHT = 844


def shot(page_url, prefix, wait_selector=None):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=2)
        page.goto(page_url, wait_until="networkidle", timeout=20000)
        if wait_selector:
            try:
                page.wait_for_selector(wait_selector, timeout=5000)
            except Exception:
                pass

        total_height = page.evaluate("document.body.scrollHeight")

        # 1차: 끝까지 스크롤해서 .reveal 등 IntersectionObserver 애니메이션을 전부 트리거
        y = 0
        while y < total_height:
            page.evaluate(f"window.scrollTo(0, {y})")
            page.wait_for_timeout(150)
            y += HEIGHT
        page.evaluate(f"window.scrollTo(0, {total_height})")
        page.wait_for_timeout(600)

        # 2차: 위에서부터 다시 스크롤하며 캡처 (reveal 애니메이션이 끝난 안정 상태)
        y = 0
        idx = 0
        while y < total_height:
            page.evaluate(f"window.scrollTo(0, {y})")
            page.wait_for_timeout(700)
            out_path = OUT_DIR / f"{prefix}_{idx:02d}.png"
            page.screenshot(path=str(out_path))
            print(f"saved: {out_path}")
            y += HEIGHT
            idx += 1
        browser.close()


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "index"
    if target == "index":
        shot((PROJECT_DIR / "index.html").resolve().as_uri(), "index")
    elif target == "admin":
        shot((PROJECT_DIR / "admin.html").resolve().as_uri(), "admin")
    elif target == "estimate":
        shot((PROJECT_DIR / "estimate-view.html").resolve().as_uri(), "estimate")

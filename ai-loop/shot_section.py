"""
특정 섹션(CSS selector)만 스크린샷
사용법: python shot_section.py <selector> <output_name> [width]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
OUT_DIR = Path(__file__).parent / "logs" / "sections"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main():
    selector = sys.argv[1]
    name = sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 1440

    url = (PROJECT_DIR / "index.html").resolve().as_uri()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.goto(url, wait_until="networkidle", timeout=15000)

        total_height = page.evaluate("document.body.scrollHeight")
        y = 0
        while y < total_height:
            page.evaluate(f"window.scrollTo(0, {y})")
            page.wait_for_timeout(120)
            y += 900
        page.evaluate("window.scrollTo(0,0)")
        page.wait_for_timeout(300)

        el = page.query_selector(selector)
        if not el:
            print(f"NOT FOUND: {selector}")
            sys.exit(1)
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(1200)
        out_path = OUT_DIR / f"{name}.png"
        el.screenshot(path=str(out_path))
        print(f"saved: {out_path}")
        browser.close()


if __name__ == "__main__":
    main()

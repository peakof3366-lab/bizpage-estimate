import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
OUT_DIR = Path(__file__).parent / "logs" / "desktop_review"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT = 1440, 900

def shot(page_url, prefix):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1.5)
        page.goto(page_url, wait_until="networkidle", timeout=20000)

        total_height = page.evaluate("document.body.scrollHeight")
        y = 0
        while y < total_height:
            page.evaluate(f"window.scrollTo(0, {y})")
            page.wait_for_timeout(120)
            y += HEIGHT
        page.evaluate(f"window.scrollTo(0, {total_height})")
        page.wait_for_timeout(500)

        # 가로 오버플로우 체크
        scroll_w = page.evaluate("document.documentElement.scrollWidth")
        client_w = page.evaluate("document.documentElement.clientWidth")
        print(f"{prefix}: scrollWidth={scroll_w} clientWidth={client_w}")

        y = 0
        idx = 0
        while y < total_height:
            page.evaluate(f"window.scrollTo(0, {y})")
            page.wait_for_timeout(500)
            out_path = OUT_DIR / f"{prefix}_{idx:02d}.png"
            page.screenshot(path=str(out_path))
            print(f"saved: {out_path.name}")
            y += HEIGHT
            idx += 1
        browser.close()

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "index"
    if target == "index":
        shot((PROJECT_DIR / "index.html").resolve().as_uri(), "index")
    elif target == "admin":
        shot((PROJECT_DIR / "admin.html").resolve().as_uri(), "admin")

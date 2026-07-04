"""
렌더링 검증 헬퍼 (Playwright)
사용법: python verify_render.py <html_file_or_url> [label]
- 데스크톱(1440x900)/모바일(390x844) 두 뷰포트로 스크린샷 저장
- 콘솔 에러(console.error) 및 페이지 에러(pageerror) 수집
- 결과를 ai-loop/logs/verify_<timestamp>_<label>/ 에 저장
종료 코드: 0 = 에러 없음, 1 = 콘솔/페이지 에러 발견
"""
import sys
import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
LOG_DIR = Path(__file__).parent / "logs"


def main():
    if len(sys.argv) < 2:
        print("usage: python verify_render.py <html_file> [label]", file=sys.stderr)
        sys.exit(2)

    target = sys.argv[1]
    label = sys.argv[2] if len(sys.argv) >= 3 else "check"

    if target.startswith("http"):
        url = target
    else:
        path = (PROJECT_DIR / target).resolve()
        url = path.as_uri()

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = LOG_DIR / f"verify_{ts}_{label}"
    out_dir.mkdir(parents=True, exist_ok=True)

    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()

        for vp_name, vp in [("desktop", {"width": 1440, "height": 900}), ("mobile", {"width": 390, "height": 844})]:
            page = browser.new_page(viewport=vp)
            page.on("console", lambda msg: errors.append(f"[console.{msg.type}] {msg.text}") if msg.type == "error" else None)
            page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))

            page.goto(url, wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(500)

            # 스크롤 리빌 애니메이션(IntersectionObserver)을 실제로 트리거하기 위해
            # 페이지 끝까지 단계적으로 스크롤한 뒤 최상단으로 복귀
            total_height = page.evaluate("document.body.scrollHeight")
            step = vp["height"]
            y = 0
            while y < total_height:
                page.evaluate(f"window.scrollTo(0, {y})")
                page.wait_for_timeout(150)
                y += step
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(400)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(300)

            # 전체 페이지 스크린샷
            page.screenshot(path=str(out_dir / f"{vp_name}_full.png"), full_page=True)
            page.close()

        browser.close()

    log_path = out_dir / "errors.txt"
    log_path.write_text("\n".join(errors) if errors else "(에러 없음)", encoding="utf-8")

    print(f"검증 결과 저장: {out_dir}")
    if errors:
        print(f"에러 {len(errors)}건 발견:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("에러 없음")
        sys.exit(0)


if __name__ == "__main__":
    main()

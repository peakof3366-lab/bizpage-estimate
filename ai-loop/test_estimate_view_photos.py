"""
estimate-view.html이 오늘 새로 추가한 목적지(예: 하와이) 사진 데이터가 포함된
shareData를 실제로 문제없이 렌더링하는지 확인하는 스모크 테스트.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import base64
import json
import urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent

SHARE_DATA = {
    "v": 1, "dk": "하와이", "dt": "하와이 (Hawaii)", "pt": "industry",
    "ptx": "산업체 실무 연수", "ot": "기업", "vm": "",
    "n": 20, "d": 5, "ng": 4, "org": "테스트기관", "cn": "홍길동",
    "sd": "2026-08-01", "ed": "2026-08-05", "hgl": "4성급", "sl": "성수기",
    "t": 50000000, "pp": 2500000, "iso": "2026-07-07", "id": "2026년 7월 7일",
    "rd": "2026년 6월 기준", "rv": "v1",
    "rows": [["항공권", 15000000], ["호텔", 10000000]], "req": "",
    "itiA": {"t": "하와이 청정에너지 코스", "s": "서브타이틀", "h": ["하이라이트1"],
             "d": [{"day": 1, "title": "입국", "am": "a", "pm": "p", "eve": "e", "tip": "t"}]},
    "itiB": {"t": "하와이 알로하 코스", "s": "서브타이틀2", "h": ["하이라이트2"],
             "d": [{"day": 1, "title": "입국", "am": "a", "pm": "p", "eve": "e", "tip": "t"}]},
    "cover": "https://images.unsplash.com/photo-1505852679233-d9fd70aff56d?auto=format&fit=crop&w=1200&q=80",
    "strip": [
        "https://images.unsplash.com/photo-1598135753163-6167c1a1ad65?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1545251142-f32339076e6d?auto=format&fit=crop&w=800&q=80",
    ],
    "sp": "",
}


def main():
    j = json.dumps(SHARE_DATA, ensure_ascii=False)
    b64 = base64.b64encode(j.encode("utf-8")).decode("ascii")
    encoded = urllib.parse.quote(b64)
    url = (PROJECT_DIR / "estimate-view.html").resolve().as_uri() + "?d=" + encoded

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda msg: errors.append(f"[console.{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))
        page.goto(url, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(500)

        hero_title = page.evaluate("document.getElementById('hero-title')?.textContent || ''")
        hero_sub = page.evaluate("document.getElementById('hero-sub')?.textContent || ''")
        cover_visible = page.evaluate("!document.getElementById('hero-strip').className.includes('no-cover') ")
        print("hero-title:", hero_title)
        print("hero-sub:", hero_sub)
        page.screenshot(path=str(Path(__file__).parent / "logs" / "estimate_view_hawaii_test.png"), full_page=True)

        browser.close()

    print("\n=== 콘솔/페이지 에러 ===")
    if errors:
        for e in errors:
            print(" -", e)
    else:
        print("(없음)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

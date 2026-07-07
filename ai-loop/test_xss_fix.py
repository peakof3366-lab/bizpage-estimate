"""
견적서(estimate-view.html 공유 페이지 + openEstimateWindow 인쇄 팝업)의
XSS 이스케이프 수정이 실제로 작동하는지 확인.

시나리오:
1. estimate-view.html: 기관명/요청사항에 <img src=x onerror=...> 페이로드를
   넣은 shareData를 만들어 로드 → dialog(alert) 발생 여부 + DOM에 스크립트가
   실행되지 않고 텍스트 그대로 이스케이프되어 보이는지 확인.
2. index.html 실제 흐름: STEP1/2에서 기관명/담당자/요청사항에 페이로드를
   입력하고 견적서 팝업을 열어 dialog 발생 여부 확인.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import base64
import json
import urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
PAYLOAD = '<img src=x onerror="window.__xss_fired=true">'
PAYLOAD2 = '"><script>window.__xss_fired=true</script>'


def test_estimate_view():
    share_data = {
        "v": 1, "dk": "도쿄", "dt": PAYLOAD, "pt": "industry",
        "ptx": PAYLOAD, "ot": PAYLOAD, "vm": "",
        "n": 20, "d": 5, "ng": 4, "org": PAYLOAD, "cn": PAYLOAD2,
        "sd": "", "ed": "", "hgl": "4성급", "sl": "성수기",
        "t": 1000000, "pp": 50000, "iso": "2026-07-07", "id": PAYLOAD,
        "rd": "2026년 6월", "rv": "v1",
        "rows": [[PAYLOAD, 100000]], "req": PAYLOAD,
        "itiA": {"t": PAYLOAD, "s": PAYLOAD, "h": [PAYLOAD],
                 "d": [{"day": 1, "title": PAYLOAD, "am": PAYLOAD, "pm": "p", "eve": "e", "tip": PAYLOAD}]},
        "itiB": None,
        "cover": "", "strip": ['x" onerror="window.__xss_fired=true'],
        "sp": "",
    }
    j = json.dumps(share_data, ensure_ascii=False)
    b64 = base64.b64encode(j.encode("utf-8")).decode("ascii")
    url = (PROJECT_DIR / "estimate-view.html").resolve().as_uri() + "?d=" + urllib.parse.quote(b64)

    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        page.goto(url, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(800)
        fired = page.evaluate("() => window.__xss_fired === true")
        html_snippet = page.evaluate("() => document.getElementById('main-content').innerHTML.slice(0, 500)")
        browser.close()

    print("[estimate-view.html]")
    print("  dialog(alert) 발생:", dialogs if dialogs else "(없음)")
    print("  window.__xss_fired 설정됨(페이로드 실행됨):", fired)
    ok = not fired and not dialogs
    print("  ->", "PASS (이스케이프 정상)" if ok else "FAIL (XSS 실행됨!)")
    return ok


def test_main_flow():
    url = (PROJECT_DIR / "index.html").resolve().as_uri()
    dialogs = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        page.goto(url, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(300)

        page.select_option("#destination", "도쿄")
        page.fill("#participants", "20")
        page.fill("#startDate", "2027-09-01")  # #days는 readonly, 날짜로만 자동 계산
        page.fill("#endDate", "2027-09-05")
        page.click("#nextStepButton")
        page.wait_for_timeout(200)
        page.fill("#organization", PAYLOAD)
        page.fill("#contactName", PAYLOAD2)
        req_el = page.query_selector("#requestDetails")
        if req_el:
            req_el.fill(PAYLOAD)
        page.wait_for_timeout(200)

        popup = None
        try:
            with page.expect_popup(timeout=5000) as popup_info:
                page.evaluate("openEstimateWindow()")
            popup = popup_info.value
            popup.wait_for_load_state("networkidle", timeout=10000)
            popup.wait_for_timeout(500)
            fired = popup.evaluate("() => window.__xss_fired === true")
        except Exception as e:
            fired = f"(팝업 캡처 실패: {e})"

        browser.close()

    print("\n[index.html 실제 흐름 -> 인쇄 팝업]")
    print("  dialog(alert) 발생:", dialogs if dialogs else "(없음)")
    print("  window.__xss_fired:", fired)
    ok = (fired is False) and not dialogs
    print("  ->", "PASS (이스케이프 정상)" if ok else f"결과 확인 필요: fired={fired}")
    return ok


if __name__ == "__main__":
    r1 = test_estimate_view()
    r2 = test_main_flow()
    sys.exit(0 if (r1 and r2) else 1)

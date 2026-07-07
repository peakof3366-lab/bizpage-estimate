"""
견적 계산기 실제 조작 검증 (STEP1 -> STEP2 -> 확인메시지 -> STEP3 진입)
- 참가자 29명 vs 30명(PAX_TIERS 경계)에서 총액이 감소하지 않는지 실측 확인
- 콘솔 에러 수집
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
url = (PROJECT_DIR / "index.html").resolve().as_uri()

def fill_and_read(page, participants, destination="방콕"):
    page.select_option("#destination", label_contains_or_value(page, destination))
    page.fill("#participants", str(participants))
    page.fill("#startDate", "2027-09-01")  # #days는 readonly, 날짜로만 자동 계산
    page.fill("#endDate", "2027-09-05")
    page.wait_for_timeout(300)
    result_text = page.text_content("#resultValue")
    per_person_text = page.text_content("#perPersonValue")
    return result_text, per_person_text

def label_contains_or_value(page, dest_key):
    # destination select 옵션 value가 destination_key와 동일하다고 가정
    return dest_key

def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width":1440,"height":900})
        page.on("console", lambda msg: errors.append(f"[console.{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))

        page.goto(url, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(500)

        # STEP1 이동 (이미 기본 활성)
        page.click("text=간편 견적 산출", timeout=5000) if page.locator("text=간편 견적 산출").count() else None
        page.wait_for_timeout(200)

        # 목적지 select의 실제 옵션 value 확인 (방콕 있는지)
        options = page.eval_on_selector_all("#destination option", "els => els.map(e => e.value)")
        print("destination options sample:", options[:10], "... total:", len(options))
        target_dest = "방콕" if "방콕" in options else options[5]

        page.select_option("#destination", target_dest)
        page.select_option("#programType", "industry")
        page.select_option("#organizationType", "company")
        page.fill("#participants", "29")
        # #days는 이제 출발일/귀국일로만 자동 계산되는 readonly 필드(직접 fill 불가)
        page.fill("#startDate", "2027-09-01")
        page.fill("#endDate", "2027-09-05")
        page.wait_for_timeout(400)

        r29 = page.text_content("#resultValue")
        pp29 = page.text_content("#perPersonValue")
        print(f"[29명] 총액={r29} / 1인당={pp29}")

        page.fill("#participants", "30")
        page.wait_for_timeout(400)
        r30 = page.text_content("#resultValue")
        pp30 = page.text_content("#perPersonValue")
        print(f"[30명] 총액={r30} / 1인당={pp30}")

        def to_num(s):
            return int(''.join(ch for ch in s if ch.isdigit()))

        n29 = to_num(r29)
        n30 = to_num(r30)
        print(f"비교: 29명={n29:,} / 30명={n30:,} -> {'PASS (증가 또는 유지)' if n30 >= n29 else 'FAIL (감소함!)'}")

        # STEP1 -> STEP2 이동 시도 (필수 입력 채우고 다음 단계로)
        # startDate 필요 여부 확인 후 채움 (organization 등 STEP2 필드는 전환 후에 채운다)
        if page.locator("#startDate").count():
            page.fill("#startDate", "2026-09-15")

        next_btn = page.locator("#nextStepButton")
        if next_btn.count():
            next_btn.click()
            page.wait_for_timeout(400)
            step2_visible = page.locator('.estimate-step[data-step="2"].step-active').count() > 0
            print("STEP2 활성화 여부:", step2_visible)

            if page.locator("#organization").count():
                page.fill("#organization", "테스트기업(주)")
            if page.locator("#contactName").count():
                page.fill("#contactName", "홍길동")
            if page.locator("#requestDetails").count():
                page.fill("#requestDetails", "리더십 연수 프로그램 문의")

            submit_btn = page.locator('.estimate-step[data-step="2"] button[type="submit"]')
            if submit_btn.count():
                submit_btn.click()
                page.wait_for_timeout(500)
                confirm_visible = page.locator("#estimateConfirm").is_visible()
                print("견적 확인 메시지 표시 여부:", confirm_visible)

                explore_btn = page.locator("#explorePlanBtn")
                if explore_btn.count() and explore_btn.is_visible():
                    explore_btn.click()
                    page.wait_for_timeout(800)
                    step3_visible = page.locator("#step3Section").count() > 0
                    print("STEP3 섹션 존재 여부:", step3_visible)

        page.screenshot(path=str(Path(__file__).parent / "logs" / "estimate_flow_check.png"), full_page=False)
        browser.close()

    print("\n=== 콘솔/페이지 에러 ===")
    if errors:
        for e in errors:
            print(" -", e)
    else:
        print("(없음)")

    sys.exit(0 if n30 >= n29 and not errors else 1)

if __name__ == "__main__":
    main()

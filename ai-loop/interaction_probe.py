"""
인터랙션 기반 런타임 에러 헌팅용 스크립트.
정적 로드 확인(verify_render.py)을 넘어, 실제 클릭/입력/제출을 수행하며
console.error / pageerror를 액션 라벨과 함께 기록한다.

사용법: python interaction_probe.py <target> [viewport]
  target: index | estimate | admin
  viewport: desktop(기본) | mobile

결과: ai-loop/logs/probe_<target>_<viewport>_<timestamp>/errors.txt
      각 줄 형식: [ACTION] <라벨> :: [console.error|pageerror] <메시지>
"""
import sys
import datetime
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
LOG_DIR = Path(__file__).parent / "logs"

CURRENT_ACTION = ["(초기 로드)"]
ERRORS = []


def log_console(msg):
    if msg.type == "error":
        ERRORS.append(f"[ACTION: {CURRENT_ACTION[0]}] [console.error] {msg.text}")


def log_pageerror(exc):
    ERRORS.append(f"[ACTION: {CURRENT_ACTION[0]}] [pageerror] {exc}")


def act(label):
    """다음 액션의 라벨을 세팅 (에러 발생 시 어떤 액션이었는지 추적용)"""
    CURRENT_ACTION[0] = label
    print(f"  -> {label}")


def safe(fn, label):
    """액션 실행 중 셀렉터 못찾음 등도 기록(치명적이지 않으면 계속 진행)"""
    act(label)
    try:
        fn()
    except Exception as e:
        ERRORS.append(f"[ACTION: {label}] [probe-exception] {e.__class__.__name__}: {e}")


def run_index(page, out_dir, is_mobile=False):
    url = (PROJECT_DIR / "index.html").resolve().as_uri()
    act("페이지 로드")
    page.goto(url, wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(500)

    # 1. 헤더 모바일 메뉴 열기/닫기 (nav-toggle은 CSS로 모바일 뷰포트에서만 보임 - 데스크톱에서는 스킵)
    if is_mobile:
        safe(lambda: page.click("#navToggle"), "모바일 메뉴 열기")
        page.wait_for_timeout(300)
        page.screenshot(path=str(out_dir / "01_menu_open.png"))
        safe(lambda: page.click("#navToggle"), "모바일 메뉴 닫기")
        page.wait_for_timeout(300)

    # 2. 견적 계산기 STEP1 -> STEP2 -> STEP3, 조합 A
    def fill_step1_combo_a():
        page.select_option("#destination", "도쿄")
        page.select_option("#programType", "language")
        page.select_option("#organizationType", "company")
        page.fill("#participants", "20")
        page.fill("#days", "5")
        page.click("#nextStepButton")

    safe(fill_step1_combo_a, "STEP1 입력(도쿄/언어연수/기업/20명/5일) 후 다음단계")
    page.wait_for_timeout(400)
    page.screenshot(path=str(out_dir / "02_step2.png"))

    def fill_step2_submit():
        page.fill("#organization", "테스트기업")
        page.fill("#contactName", "홍길동")
        page.fill("#requestDetails", "테스트 요청사항입니다")
        page.click("button[type=submit]")

    safe(fill_step2_submit, "STEP2 입력 후 견적 확인하기 제출")
    page.wait_for_timeout(600)
    page.screenshot(path=str(out_dir / "03_estimate_confirm.png"))

    # 3. STEP3 탐색기로 이동
    safe(lambda: page.click("#explorePlanBtn"), "연수 일정 탐색하기 클릭 (STEP3 이동)")
    page.wait_for_timeout(800)
    page.screenshot(path=str(out_dir / "04_step3.png"))

    # STEP3 플랜카드 hover
    safe(lambda: page.hover("#planCardA"), "STEP3 플랜카드A hover")
    page.wait_for_timeout(200)
    safe(lambda: page.hover("#planCardB"), "STEP3 플랜카드B hover")
    page.wait_for_timeout(200)
    safe(lambda: page.click("#planCardA"), "STEP3 플랜카드A 클릭")
    page.wait_for_timeout(300)
    safe(lambda: page.click("#planCardB"), "STEP3 플랜카드B 클릭")
    page.wait_for_timeout(300)

    # 4. 견적서 받기(팝업 새창) - downloadEstimate 버튼
    def click_download():
        with page.expect_popup(timeout=5000) as pop_info:
            page.click("#downloadEstimate")
        popup = pop_info.value
        popup.wait_for_load_state("networkidle", timeout=10000)
        popup_errors = []
        popup.on("console", lambda m: popup_errors.append(f"[popup console.{m.type}] {m.text}") if m.type == "error" else None)
        popup.on("pageerror", lambda e: popup_errors.append(f"[popup pageerror] {e}"))
        popup.wait_for_timeout(800)
        popup.screenshot(path=str(out_dir / "05_estimate_popup.png"), full_page=True)
        for pe in popup_errors:
            ERRORS.append(f"[ACTION: 견적서 팝업창 내부] {pe}")
        popup.close()

    safe(click_download, "견적서 확인하기(팝업/새창) 클릭")
    page.wait_for_timeout(400)

    # 5. 상담 신청 폼 (consultBtn)
    safe(lambda: page.click("#consultBtn"), "이 견적으로 바로 상담 신청하기 클릭")
    page.wait_for_timeout(300)
    page.screenshot(path=str(out_dir / "06_consult_form.png"))

    def submit_consult():
        page.fill("#consultName", "김담당")
        page.fill("#consultTel", "010-1234-5678")
        page.click("text=상담 신청하기 →")

    safe(submit_consult, "상담 신청 폼 입력 후 제출")
    page.wait_for_timeout(400)
    page.screenshot(path=str(out_dir / "07_consult_submitted.png"))

    # 6. 새 견적 다시 계산하기 (리셋) 후 조합 B로 재시도
    safe(lambda: page.click("#resetEstimateBtn"), "새 견적 다시 계산하기(리셋) 클릭")
    page.wait_for_timeout(400)

    def fill_step1_combo_b():
        page.select_option("#destination", "발리")
        page.select_option("#programType", "leadership")
        page.select_option("#organizationType", "public")
        # inc-chip 내부 input은 CSS로 display:none 처리되어 있어(styles.css .inc-chip input)
        # Playwright actionability 체크(visible)를 우회하기 위해 label을 통해 네이티브 클릭 이벤트로 토글
        page.click("label.inc-chip:has(#incHotel)")
        page.click("label.inc-chip:has(#incHotel)")
        page.click("label.inc-chip:has(#incHotel)")
        page.fill("#participants", "35")
        page.fill("#days", "8")
        page.wait_for_timeout(200)
        page.click("label.grade-pill >> text=비즈니스", force=True)
        page.wait_for_timeout(200)
        page.click("label.grade-pill >> text=5성급", force=True)
        page.wait_for_timeout(200)
        page.click("#nextStepButton")

    safe(fill_step1_combo_b, "STEP1 재입력(발리/리더십/공공기관/35명/8일/비즈니스/5성급) 후 다음단계")
    page.wait_for_timeout(400)

    def fill_step2_submit_b():
        page.fill("#organization", "테스트공공기관")
        page.fill("#contactName", "이담당")
        page.fill("#requestDetails", "두번째 조합 테스트")
        page.click("button[type=submit]")

    safe(fill_step2_submit_b, "STEP2 재입력 후 제출(조합B)")
    page.wait_for_timeout(600)
    page.screenshot(path=str(out_dir / "08_estimate_confirm_b.png"))

    # STEP3 지역 필터 / 업종 추천 위젯 (탐색기 재이동)
    safe(lambda: page.click("#explorePlanBtn"), "연수 일정 탐색하기 클릭(조합B)")
    page.wait_for_timeout(800)

    # 7. 목적지 갤러리로 스크롤, 지역 필터 클릭
    safe(lambda: page.evaluate("document.querySelector('#destinations').scrollIntoView()"), "목적지 갤러리로 스크롤")
    page.wait_for_timeout(400)
    page.screenshot(path=str(out_dir / "09_gallery.png"))

    region_filter_buttons = page.query_selector_all(".gal-filter-chip")
    print(f"  지역 필터 버튼 후보 개수: {len(region_filter_buttons)}")
    for i, btn in enumerate(region_filter_buttons[:6]):
        safe(lambda b=btn, i=i: b.click(), f"목적지 갤러리 지역 필터 버튼 #{i} 클릭")
        page.wait_for_timeout(200)

    # 업종 추천 위젯 (#destIndustry select)
    def use_industry_widget():
        options = page.eval_on_selector_all("#destIndustry option", "els => els.map(e => e.value)")
        for opt_val in options:
            if opt_val:
                page.select_option("#destIndustry", opt_val)
                page.wait_for_timeout(200)

    safe(use_industry_widget, "업종 추천 위젯(#destIndustry) 각 옵션 선택")
    page.wait_for_timeout(300)
    page.screenshot(path=str(out_dir / "10_industry_widget.png"))

    # 8. FAQ 아코디언 7개 전부
    safe(lambda: page.evaluate("document.querySelector('#faq').scrollIntoView()"), "FAQ 섹션으로 스크롤")
    page.wait_for_timeout(300)
    faq_buttons = page.query_selector_all("#faq .faq-item button, #faq .faq-q, #faq button[aria-expanded]")
    print(f"  FAQ 버튼 후보 개수: {len(faq_buttons)}")
    for i, btn in enumerate(faq_buttons):
        safe(lambda b=btn, i=i: b.click(), f"FAQ 아코디언 #{i+1} 열기")
        page.wait_for_timeout(150)
        safe(lambda b=btn, i=i: b.click(), f"FAQ 아코디언 #{i+1} 닫기")
        page.wait_for_timeout(150)
    page.screenshot(path=str(out_dir / "11_faq.png"))

    # 9. 문의 폼 제출 - 성공 케이스
    safe(lambda: page.evaluate("document.querySelector('#contact').scrollIntoView()"), "문의 섹션으로 스크롤")
    page.wait_for_timeout(300)

    def submit_contact_success():
        page.fill("#inqName", "박문의")
        page.fill("#inqOrg", "테스트문의기관")
        page.fill("#inqTel", "010-9999-8888")
        page.fill("#inqMsg", "문의 테스트 메시지입니다")
        page.click("#inqForm button[type=submit]")

    safe(submit_contact_success, "문의 폼 입력 후 제출(성공 케이스)")
    page.wait_for_timeout(500)
    page.screenshot(path=str(out_dir / "12_contact_success.png"))

    # 실패 케이스: 필수값 비운 채 제출 (HTML5 required라 막힐 수 있음, 그래도 시도)
    def submit_contact_fail():
        page.reload(wait_until="networkidle")
        page.evaluate("document.querySelector('#contact').scrollIntoView()")
        page.wait_for_timeout(300)
        page.click("#inqForm button[type=submit]")

    safe(submit_contact_fail, "문의 폼 빈 값으로 제출 시도(실패 케이스, required 검증)")
    page.wait_for_timeout(400)
    page.screenshot(path=str(out_dir / "13_contact_fail.png"))

    # 10. 포트폴리오 더보기
    safe(lambda: page.evaluate("document.querySelector('#portfolio').scrollIntoView()"), "포트폴리오 섹션으로 스크롤")
    page.wait_for_timeout(300)
    safe(lambda: page.click("#pfMoreBtn"), "포트폴리오 더보기 클릭")
    page.wait_for_timeout(400)
    page.screenshot(path=str(out_dir / "14_portfolio_more.png"))

    return ERRORS


def run_estimate_view(page, out_dir):
    # index.html에서 실제로 견적을 생성해 공유링크(estimate-view.html?...)를 얻어서 접속
    idx_url = (PROJECT_DIR / "index.html").resolve().as_uri()
    act("index.html 로드 (공유링크 생성용)")
    page.goto(idx_url, wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(300)

    def build_estimate():
        page.select_option("#destination", "싱가포르")
        page.select_option("#programType", "academic")
        page.select_option("#organizationType", "education")
        page.fill("#participants", "15")
        page.fill("#days", "6")
        page.click("#nextStepButton")
        page.wait_for_timeout(300)
        page.fill("#organization", "테스트대학")
        page.fill("#contactName", "최담당")
        page.fill("#requestDetails", "공유링크 생성 테스트")
        page.click("button[type=submit]")
        page.wait_for_timeout(500)

    safe(build_estimate, "견적 생성 (공유링크 얻기 위함)")

    def open_estimate_popup():
        with page.expect_popup(timeout=5000) as pop_info:
            page.click("#downloadEstimate")
        return pop_info.value

    popup_holder = [None]
    safe(lambda: popup_holder.__setitem__(0, open_estimate_popup()), "견적서 확인하기 클릭해 estimate 팝업(즉시 미리보기) 얻기")

    popup = popup_holder[0]
    if popup is None:
        ERRORS.append("[ACTION: estimate 팝업 획득] [probe-error] 팝업을 얻지 못해 이후 테스트 불가")
        return ERRORS

    popup_url = popup.url
    print(f"  즉시 미리보기 팝업 URL: {popup_url}")
    act("즉시 미리보기 팝업 networkidle 대기")
    popup.wait_for_load_state("networkidle", timeout=10000)
    popup.on("console", lambda m: ERRORS.append(f"[ACTION: 즉시 미리보기 팝업 렌더] [console.{m.type}] {m.text}") if m.type == "error" else None)
    popup.on("pageerror", lambda e: ERRORS.append(f"[ACTION: 즉시 미리보기 팝업 렌더] [pageerror] {e}"))
    popup.wait_for_timeout(600)
    popup.screenshot(path=str(out_dir / "01_instant_popup.png"), full_page=True)

    # 실제 공유링크(estimate-view.html?d=...)는 팝업 내 #share-url-inp 값에 담겨있음 (클립보드 복사용)
    share_url = None
    try:
        share_url = popup.eval_on_selector("#share-url-inp", "el => el.value")
    except Exception as e:
        ERRORS.append(f"[ACTION: 공유링크 값 추출] [probe-exception] {e}")
    print(f"  추출된 공유링크: {share_url}")

    if not share_url:
        ERRORS.append("[ACTION: 공유링크 값 추출] [probe-error] #share-url-inp 값을 찾지 못해 estimate-view.html 직접 접속 테스트 불가")
        popup.close()
        return ERRORS

    # 실제 공유링크로 새 탭(estimate-view.html)을 열어 정상 렌더 확인
    view_page = page.context.new_page()
    view_errors_action = ["estimate-view.html 공유링크 렌더"]
    view_page.on("console", lambda m: ERRORS.append(f"[ACTION: {view_errors_action[0]}] [console.{m.type}] {m.text}") if m.type == "error" else None)
    view_page.on("pageerror", lambda e: ERRORS.append(f"[ACTION: {view_errors_action[0]}] [pageerror] {e}"))

    act("estimate-view.html 공유링크로 직접 접속")
    view_page.goto(share_url, wait_until="networkidle", timeout=15000)
    view_page.wait_for_timeout(600)
    view_page.screenshot(path=str(out_dir / "02_estimate_view_shared.png"), full_page=True)

    # 인쇄 미리보기 트리거만 (실제 인쇄 X) - window.print를 stub으로 교체 후 호출 확인
    def trigger_print():
        view_errors_action[0] = "estimate-view.html 인쇄 미리보기 트리거"
        view_page.evaluate("window.print = () => { window.__printCalled = true; }")
        print_btn = view_page.query_selector("button:has-text('인쇄'), .print-btn, [onclick*=print]")
        if print_btn:
            print_btn.click()
        else:
            view_page.evaluate("window.print()")
        called = view_page.evaluate("window.__printCalled === true")
        print(f"  print() 호출 여부: {called}")

    safe(trigger_print, "estimate-view.html 인쇄 미리보기 트리거(window.print stub)")
    view_page.wait_for_timeout(300)
    view_page.screenshot(path=str(out_dir / "03_print_preview.png"), full_page=True)

    view_page.close()
    popup.close()
    return ERRORS


def run_admin(page, out_dir):
    url = (PROJECT_DIR / "admin.html").resolve().as_uri()
    act("admin.html 로드")
    page.goto(url, wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(400)
    page.screenshot(path=str(out_dir / "01_login.png"))

    def do_login():
        page.fill("#adminId", "admin")
        page.fill("#adminPw", "hanaenbt")
        page.click("#loginForm button[type=submit]")

    safe(do_login, "관리자 로그인 시도(admin/hanaenbt, 기본 비밀번호)")
    page.wait_for_timeout(600)
    page.screenshot(path=str(out_dir / "02_after_login.png"))

    # 로그인 실패 시(비밀번호 틀림) 로그인 페이지가 여전히 보이는지 확인만 하고, 탭 순회는 시도
    nav_items = page.query_selector_all(".sidebar a, .sidebar button, nav.sidebar-nav a, [data-tab]")
    print(f"  사이드바 탭 후보 개수: {len(nav_items)}")
    for i, item in enumerate(nav_items[:20]):
        try:
            text = item.inner_text().strip()[:20]
        except Exception:
            text = f"item{i}"
        safe(lambda it=item: it.click(), f"어드민 탭/메뉴 '{text}' 클릭")
        page.wait_for_timeout(250)
        page.screenshot(path=str(out_dir / f"tab_{i:02d}.png"))

    # 모바일 탭바 (있다면)
    mobile_tabs = page.query_selector_all(".mobile-tabbar a, .mobile-tabbar button, .admin-mobile-tab")
    print(f"  모바일 탭바 후보 개수: {len(mobile_tabs)}")
    for i, item in enumerate(mobile_tabs):
        safe(lambda it=item, i=i: it.click(), f"어드민 모바일 탭바 #{i} 클릭")
        page.wait_for_timeout(250)

    return ERRORS


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "index"
    viewport_name = sys.argv[2] if len(sys.argv) > 2 else "desktop"
    vp = {"width": 1440, "height": 900} if viewport_name == "desktop" else {"width": 390, "height": 844}

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = LOG_DIR / f"probe_{target}_{viewport_name}_{ts}"
    out_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport=vp)
        page = context.new_page()
        page.on("console", log_console)
        page.on("pageerror", log_pageerror)
        page.on("dialog", lambda d: (print(f"  [dialog] {d.type}: {d.message}"), d.accept()))

        try:
            if target == "index":
                run_index(page, out_dir, is_mobile=(viewport_name == "mobile"))
            elif target == "estimate":
                run_estimate_view(page, out_dir)
            elif target == "admin":
                run_admin(page, out_dir)
            else:
                print(f"알 수 없는 target: {target}", file=sys.stderr)
                sys.exit(2)
        except Exception:
            ERRORS.append(f"[ACTION: {CURRENT_ACTION[0]}] [SCRIPT-CRASH] {traceback.format_exc()}")
        finally:
            browser.close()

    log_path = out_dir / "errors.txt"
    log_path.write_text("\n".join(ERRORS) if ERRORS else "(에러 없음)", encoding="utf-8")
    print(f"\n결과 저장: {out_dir}")
    if ERRORS:
        print(f"에러 {len(ERRORS)}건 발견:")
        for e in ERRORS:
            print(" -", e)
    else:
        print("에러 없음")


if __name__ == "__main__":
    main()

"""
견적/문의 서버 저장 종단 테스트 — "다른 브라우저" 시나리오.

핵심 성공 기준: 방문자가 index.html에서 견적을 제출하면, localStorage를 전혀
공유하지 않는 별도 브라우저 컨텍스트(= 다른 브라우저/기기를 흉내)에서 admin.html에
로그인해도 그 견적/문의가 보여야 한다. (이전까지는 localStorage만 써서 불가능했음)

사전 조건: `vercel dev`가 http://localhost:3000 에서 실행 중이어야 함.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ADMIN_PASSWORD = "qlwmvpdlwl"


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── 1. "방문자" 컨텍스트: index.html에서 견적 제출 ──
        visitor_ctx = browser.new_context()
        page = visitor_ctx.new_page()
        page.on("console", lambda msg: errors.append(f"[visitor console.{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"[visitor pageerror] {exc}"))

        page.goto(f"{BASE}/index.html", wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(500)

        options = page.eval_on_selector_all("#destination option", "els => els.map(e => e.value)")
        target_dest = "방콕" if "방콕" in options else options[5]
        page.select_option("#destination", target_dest)
        page.select_option("#programType", "industry")
        page.select_option("#organizationType", "company")
        page.fill("#participants", "25")
        page.fill("#days", "5")
        page.wait_for_timeout(400)

        if page.locator("#startDate").count():
            page.fill("#startDate", "2026-09-15")

        marker_org = "종단테스트기관_E2E"
        next_btn = page.locator("#nextStepButton")
        assert next_btn.count(), "STEP1 다음 버튼을 찾을 수 없음"
        next_btn.click()
        page.wait_for_timeout(400)

        page.fill("#organization", marker_org)
        page.fill("#contactName", "테스트담당자")
        page.fill("#requestDetails", "서버 저장 종단 테스트용 더미 데이터")

        submit_btn = page.locator('.estimate-step[data-step="2"] button[type="submit"]')
        assert submit_btn.count(), "STEP2 제출 버튼을 찾을 수 없음"

        with page.expect_response(lambda r: "/api/quotes" in r.url and r.request.method == "POST", timeout=20000) as resp_info:
            submit_btn.click()
        quote_post_status = resp_info.value.status
        print("POST /api/quotes 응답 상태:", quote_post_status)

        page.wait_for_timeout(300)

        # 문의 폼도 함께 제출
        marker_inq_name = "종단테스트문의_E2E"
        page.evaluate("document.getElementById('inqName')?.scrollIntoView()")
        if page.locator("#inqName").count():
            page.fill("#inqName", marker_inq_name)
            page.fill("#inqOrg", "테스트기관")
            page.fill("#inqTel", "010-9999-8888")
            page.fill("#inqMsg", "종단 테스트 문의 메시지")
            with page.expect_response(lambda r: "/api/inquiries" in r.url and r.request.method == "POST", timeout=20000):
                page.click("#inqForm button[type='submit']")

        visitor_ctx.close()

        # ── 2. "관리자" 컨텍스트: 완전히 별도 브라우저 (쿠키/스토리지 공유 없음) ──
        admin_ctx = browser.new_context()
        apage = admin_ctx.new_page()
        apage.on("console", lambda msg: errors.append(f"[admin console.{msg.type}] {msg.text}") if msg.type == "error" else None)
        apage.on("pageerror", lambda exc: errors.append(f"[admin pageerror] {exc}"))

        apage.goto(f"{BASE}/admin.html", wait_until="networkidle", timeout=20000)
        apage.wait_for_timeout(300)

        assert apage.locator("#loginPage").is_visible(), "로그인 화면이 보이지 않음(이미 인증된 상태?)"
        apage.fill("#adminId", "admin")
        apage.fill("#adminPw", ADMIN_PASSWORD)
        apage.click("#loginForm button[type='submit']")
        # vercel dev 로컬 서버는 함수 최초 호출 시 콜드 스타트 지연이 있을 수 있어 넉넉히 대기
        dash_visible = False
        for _ in range(15):
            apage.wait_for_timeout(1000)
            if apage.locator("#dashPage").is_visible():
                dash_visible = True
                break
        print("관리자 대시보드 표시 여부:", dash_visible)
        assert dash_visible, "로그인 실패 — 대시보드가 보이지 않음"

        # 견적 관리 탭에서 방금 "다른 브라우저"가 제출한 견적이 보이는지 확인
        apage.click('[data-tab="estmgr"]')
        apage.wait_for_timeout(400)
        emBody = apage.inner_text("#emBody")
        quote_found = marker_org in emBody
        print("견적 관리 탭에 마커(orgName) 노출 여부:", quote_found)

        # 문의 관리 탭에서 방금 제출한 문의가 보이는지 확인
        apage.click('[data-tab="inquiries"]')
        apage.wait_for_timeout(400)
        inqBody = apage.inner_text("#inqBody")
        inquiry_found = marker_inq_name in inqBody
        print("문의 관리 탭에 마커(name) 노출 여부:", inquiry_found)

        # ── 3. 정리: API를 직접 호출해 방금 만든 테스트 레코드 삭제(모호한 UI 셀렉터 회피) ──
        apage.evaluate(
            """async ({markerOrg, markerName}) => {
                const quotes = await (await fetch('/api/quotes')).json();
                await Promise.all(quotes.filter(x => x.orgName === markerOrg)
                    .map(q => fetch(`/api/quotes/${q.id}`, { method: 'DELETE' })));
                const inqs = await (await fetch('/api/inquiries')).json();
                await Promise.all(inqs.filter(x => x.name === markerName)
                    .map(inq => fetch(`/api/inquiries/${inq.id}`, { method: 'DELETE' })));
            }""",
            {"markerOrg": marker_org, "markerName": marker_inq_name},
        )

        browser.close()

    # 베이스라인 노이즈 제외:
    # 1) vercel dev 로컬 서버가 이미지/ 하위 한글 파일명 정적 자산을 404로 잘못 서빙하는
    #    로컬 전용 결함(프로덕션 bizpage-estimate.vercel.app에서는 200 확인됨, 이번 백엔드
    #    작업과 무관).
    # 2) admin.html 로드 시 로그인 전 세션 유효성을 서버에 물어보는 /api/admin/me의
    #    401(설계상 항상 발생 — "아직 로그인 안 함"의 정상 응답).
    real_errors = [e for e in errors if "404" not in e and "401" not in e]
    print("\n=== 콘솔/페이지 에러 (한글 파일명 404는 vercel dev 로컬 결함으로 제외) ===")
    for e in real_errors:
        print(" -", e)
    if not real_errors:
        print("(없음)")

    ok = quote_post_status == 200 and dash_visible and quote_found and inquiry_found and not real_errors
    print("\n=== 결과:", "PASS" if ok else "FAIL", "===")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""문의 → 견적 작성 → 저장 → 문의에 연결 → 견적 관리 직원용 탭 — 진짜 브라우저로 끝까지 누른다 (2026-10-16)

    node ai-loop/make_admin_fixture.js         ← 먼저(백업에서 고객 정보를 바꾼 가상 데이터)
    python ai-loop/check_inquiry_to_quote.py

견적 관리 2회차 — 「견적 1건을 문의 접수부터 발급까지 따라가 줄일 단계를 찾는다」.
예전 흐름(직원, 홈페이지 문의 한 건):
  문의 관리 → 상세(이름·기관·연락처를 읽는다) → 창 닫기 → 「견적 산출」 묶음 펴기 → 자동 견적 산출 →
  ①~⑤ → ③에서 이름·기관·연락처를 **다시 친다**(창을 닫았으니 보려면 문의를 다시 연다) → 저장 →
  견적 관리 → 그 줄 찾기 → 상세 → 직원용 → 발급 → 문의 관리 → 상세 → 진행 기록 쓰기 → 상태 바꾸기.
  그리고 문의와 견적은 **끝까지 안 이어졌다.**

⚠ 쓰기는 **가짜 응답**이다 — 운영 DB에 아무것도 안 간다. 서버 쪽 잇기(`api/inquiries/[id].js` linkQuote)는
  `test_aT_inquiry_quote_link.js`가 진짜 핸들러로 잰다. 이 도구는 **화면이 그 길을 실제로 이어 주는가**를 본다.
⚠ 회귀 스위트에 넣지 않는다 — 브라우저 설치가 필요하다.
"""
import sys, json, re, functools, http.server, socketserver, threading
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "ai-loop" / ".admin_fixture.json"
SHOTS = ROOT / "ai-loop" / "tmp_shots"
if not FIXTURE.exists():
    print("가상 데이터가 없습니다 — `node ai-loop/make_admin_fixture.js`를 먼저 돌리세요.")
    sys.exit(1)

fx = json.loads(FIXTURE.read_text(encoding="utf-8"))
quotes = list(fx["quotes"])
NEW_NO = "BP-2610-9001"
INQ = {"id": "inqwalk01", "name": "김가상", "org": "가상전자 인재개발팀", "tel": "010-1234-5678",
       "message": "내년 3월 임직원 25명 일본 연수 견적 부탁드립니다.", "type": "contact",
       "timestamp": "2026-10-15T01:00:00Z", "status": "unread", "read": False, "assignee": "", "activityLog": []}
calls = []
NEWID = {"v": None}
ME = {"id": "1", "username": "walk", "displayName": "시험직원", "role": "staff", "active": True}


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d" % httpd.server_address[1]


def route(r):
    u, m = r.request.url, r.request.method
    ok = lambda o: r.fulfill(status=200, content_type="application/json", body=json.dumps(o, ensure_ascii=False))
    key = re.sub(r"^https?://[^/]+", "", u)
    if m != "GET":
        body = r.request.post_data or ""
        calls.append((m, key, body[:400]))
        if "/api/quotes?action=internal" in key:
            p = json.loads(body)
            NEWID["v"] = p.get("id")
            rec = dict(p)
            rec.update({"quoteNo": NEW_NO, "status": "new", "channel": "internal"})
            quotes.insert(0, rec)
            return ok({"ok": True, "id": p.get("id"), "quoteNo": NEW_NO})
        mm = re.search(r"/api/inquiries/([^/?]+)", key)
        if mm and m == "PATCH":
            b = json.loads(body or "{}")
            if b.get("linkQuote"):     # 서버가 하는 일을 흉내 낸다 — 진짜는 test_aT가 잰다
                INQ.update({"linkedQuoteId": b["linkQuote"], "linkedVia": "staff", "status": "pending", "read": True})
                INQ["activityLog"].append({"ts": "2026-10-16T00:00:00Z", "author": ME["displayName"],
                                           "text": "견적 작성 — " + NEW_NO})
                return ok({"ok": True, "status": "pending", "quoteNo": NEW_NO})
        return ok({"ok": True})
    if "account?action=me" in u:
        return ok(ME)
    if "account?action=staffList" in u:
        return ok([ME])
    if re.search(r"/api/inquiries(\?|$)", u):
        return ok([INQ])
    if re.search(r"/api/quotes(\?|$)", u) and "action=" not in u:
        return ok(quotes)
    mm = re.search(r"/api/quotes/([^/?]+)", u)
    if mm:
        hit = [q for q in quotes if q["id"] == mm.group(1)]
        if hit:
            return ok(hit[0])
    if "quote-shares?action=list" in u:
        return ok(fx["shares"])
    if "quote-shares?action=links" in u:
        return ok(fx["links"])
    if key in fx.get("server", {}):
        return ok(fx["server"][key])
    return r.abort()


clicks = []
res = []


def click(target, sel, why):
    clicks.append(why)
    print(f"  클릭 {len(clicks)}: {why}")
    target.locator(sel).first.click()


def check(name, cond, extra=""):
    res.append(bool(cond))
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else "  → " + str(extra)))


def frame_of(pg):
    fs = [f for f in pg.frames if "admin-quote-pro.html" in f.url and "inq=" in f.url]
    return fs[0] if fs else None


def main():
    httpd, base = serve()
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000})
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: (errs.append("확인창: " + d.message), d.accept()))
        ctx.route("**/api/**", route)
        pg.goto(base + "/admin.html", wait_until="domcontentloaded")
        pg.wait_for_timeout(2500)

        print("[1] 문의 관리 → 상세 → 「이 문의로 견적 작성」")
        click(pg, '.sidebar-item[data-tab="inquiries"]', "사이드바 「문의 관리」")
        pg.wait_for_timeout(500)
        click(pg, '#inqBody tr[data-id="inqwalk01"] .btn-detail', "문의 줄 「상세」")
        pg.wait_for_timeout(400)
        btn = pg.locator("#modal .inq-make-quote button")
        check("문의 창에 「이 문의로 견적 작성」이 보인다", btn.count() == 1 and btn.is_visible())
        click(pg, "#modal .inq-make-quote button", "「이 문의로 견적 작성」")
        pg.wait_for_timeout(3500)
        check("문의 창이 닫혔다", pg.evaluate("document.getElementById('modal').classList.contains('hidden')"))
        check("자동 견적 산출 탭이 열렸다",
              pg.evaluate("document.getElementById('tab-quotepro').classList.contains('active')"))
        frame = frame_of(pg)
        check("틀이 그 문의로 열렸다(?inq=)", frame is not None, [f.url for f in pg.frames])
        if frame is None:
            b.close(); httpd.shutdown(); return finish(errs)
        ban = frame.evaluate("(() => { const b = document.getElementById('inqBanner');"
                             " return b && !b.classList.contains('hidden') ? b.textContent : null })()")
        check("안내 줄이 누구 문의인지 말한다", ban and "김가상" in ban, ban)
        fields = "['dClient','dOrgName','dClientContact','dCustTel'].map(i => document.getElementById(i).value)"
        vals = frame.evaluate(fields)
        check("고객 칸 넷이 채워졌다", vals == ["가상전자 인재개발팀", "가상전자 인재개발팀", "김가상", "010-1234-5678"], vals)

        print("[2] ① 여행 조건 → 산출 → ⑤ 저장")
        dest = frame.evaluate("(() => { const s = document.getElementById('pDest');"
                              " const o = [...s.options].find(o => o.value === '도쿄') || s.options[1]; return o.value })()")
        frame.select_option("#pDest", dest)
        clicks.append("목적지 고르기")
        print(f"  클릭 {len(clicks)}: 목적지 {dest}")
        frame.fill("#pPax", "25"); frame.fill("#pDays", "4"); frame.fill("#pStart", "2027-03-10")
        print("  (입력 3칸: 인원 · 일수 · 출발일 — 클릭 수에 안 넣는다)")
        click(frame, "#btnCalc", "「자동 산출하기」")
        frame.wait_for_timeout(1500)
        check("산출 뒤에도 고객 칸이 그대로", frame.evaluate(fields) == vals, frame.evaluate(fields))
        click(frame, '.step[data-step="5"]', "단계 막대 「5」")
        frame.wait_for_timeout(800)
        click(frame, "#btnSave", "「견적 저장하기」")
        frame.wait_for_timeout(3000)
        msg = frame.evaluate("document.getElementById('saveMsg').textContent")
        check("저장 완료 · 연결 실패 안내 없음", "업로드 완료" in msg and "연결하지 못했" not in msg, msg)
        # ⚠ 문의를 열 때 나가는 「읽음」 PATCH도 같은 주소다 — linkQuote가 든 것만 본다
        link = [c for c in calls if c[0] == "PATCH" and "/api/inquiries/inqwalk01" in c[1] and "linkQuote" in c[2]]
        check("문의에 잇는 요청을 보냈다(linkQuote = 새 견적 id)",
              len(link) == 1 and NEWID["v"] and json.loads(link[0][2])["linkQuote"] == NEWID["v"], (link, NEWID))
        ban2 = frame.evaluate("document.getElementById('inqBanner').textContent")
        check("안내 줄이 「연결했습니다 · 처리중」으로 바뀌었다", "연결했습니다" in ban2 and "처리중" in ban2, ban2)
        check("「견적 관리에서 열기 · 링크 발급」이 보인다", frame.locator("#btnGoIssue").is_visible())

        print("[3] 견적 관리 직원용 탭으로")
        click(frame, "#btnGoIssue", "「견적 관리에서 열기 · 링크 발급」")
        pg.wait_for_timeout(2500)
        check("견적 관리 탭", pg.evaluate("document.getElementById('tab-estmgr').classList.contains('active')"))
        check("그 견적 상세 창이 열렸다", pg.evaluate("!document.getElementById('emModal').classList.contains('hidden')"))
        t = pg.evaluate("document.getElementById('emModalTitle').textContent")
        check("창 제목 = 새 견적번호", NEW_NO in t, t)
        check("직원용 탭(발급 버튼이 있는 쪽)", pg.evaluate("document.getElementById('emModalBody').dataset.emtab") == "staff")
        li = pg.evaluate("(() => { const e = document.getElementById('em-linked-inquiry');"
                         " return e && !e.classList.contains('hidden') ? e.textContent.trim() : null })()")
        check("견적 상세가 「김가상님 문의를 보고 만든 견적」이라 말한다", li and "문의를 보고 만든" in li, li)
        act = pg.evaluate("(() => { const a = document.getElementById('em-actbar'); if (!a) return null;"
                          " const r = a.getBoundingClientRect(); return [a.textContent.replace(/\\s+/g,' ').trim().slice(0,60),"
                          " r.top < innerHeight && r.bottom > 0 && getComputedStyle(a).display !== 'none'] })()")
        check("발급 줄이 화면에 보인다", act and act[1], act)
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            pg.screenshot(path=str(SHOTS / "inq_to_quote_issue.png"))

        print("[4] 문의를 다시 열면")
        pg.evaluate("(() => { const c = document.querySelector('#emModal .modal-close'); if (c) c.click(); })()")
        pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('.sidebar-item[data-tab=\"inquiries\"]').click()")
        pg.wait_for_timeout(600)
        pg.locator('#inqBody tr[data-id="inqwalk01"] .btn-detail').click()
        pg.wait_for_timeout(400)
        lq = pg.evaluate("document.getElementById('d-linked-quote').textContent.replace(/\\s+/g,' ').trim()")
        check(f"문의 창이 「이 문의로 만든 견적 — {NEW_NO}」", "이 문의로 만든 견적" in lq and NEW_NO in lq, lq)
        check("「이 문의로 견적 작성」은 이제 없다", pg.locator("#modal .inq-make-quote").count() == 0)
        st = pg.evaluate("document.getElementById('d-status').value")
        check("문의 상태 「처리중」", st == "pending", st)
        logs = pg.evaluate("document.getElementById('d-log-list').textContent")
        check(f"진행 기록에 「견적 작성 — {NEW_NO}」", ("견적 작성 — " + NEW_NO) in logs, logs[:120])
        pg.screenshot(path=str(SHOTS / "inq_to_quote_back.png"))
        b.close()
    httpd.shutdown()
    print(f"\n문의 → 발급 버튼 앞까지 클릭 {len(clicks)}번 (입력 3칸 제외): " + " → ".join(clicks))
    return finish(errs)


def finish(errs):
    if errs:
        print("페이지 오류·확인창:", errs)
    check("페이지 오류 · 뜻밖의 확인창 0", not errs, errs)
    print(f"결과: {sum(res)} pass / {len(res) - sum(res)} fail")
    return 0 if all(res) else 1


if __name__ == "__main__":
    sys.exit(main())

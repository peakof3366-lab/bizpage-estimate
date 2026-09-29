# -*- coding: utf-8 -*-
"""담당자 화면 **17개 탭**을 진짜 브라우저로 재는 자 (YB)

    python ai-loop/check_admin_screens.py            전 탭 · 폭 3가지
    python ai-loop/check_admin_screens.py --tab rates
    python ai-loop/check_admin_screens.py --all      확인 대상까지 전부
    python ai-loop/check_admin_screens.py --shots    걸린 자리를 그림으로 저장
    python ai-loop/check_admin_screens.py --selftest 안전망이 살아 있는지

대표 지시(2026-08-28): 「관리자 페이지 가독성 좋게 만드는 방법 찾아서 적용」.

■ 왜 새로 만드나 — **담당자 화면은 「보이는 모양」이 재진 적이 없다**

`audit_ux.js`가 17개 탭을 세지만 그건 jsdom이라 **색도 크기도 위치도 모른다.**
`check_contrast.py`가 탭마다 색을 재지만 **글자 크기·줄 길이·누를 크기는 안 본다.**
`check_editor_layout.py`·`check_quotetool_width.py`는 **탭 하나씩**만 본다.
→ 17개 탭 전체를 **같은 자로** 재는 것이 없었다.

■ 🔴 처음 재서 나온 것 — 줄이 너무 길다

2줄 이상 접힌 안내문 17개 중 **9개가 줄당 80~91자**였다. 한글은 45~50자가 편하고
60자를 넘으면 눈이 줄 끝에서 **다음 줄 첫머리로 못 돌아온다.** 화면이 넓을수록
심해진다 — 글상자가 화면을 그대로 다 채우기 때문이다.
(`.page-sub`에는 이미 `max-width`가 있었다. 규칙이 있었는데 **일부에만** 붙어 있었다.)

■ 폭을 셋만 본다 — 담당자는 폰으로 관리자 화면을 쓰지 않는다
1440(사무실 모니터) · 1280(노트북) · 1024(작은 노트북·태블릿 가로).
⚠ 폰 폭을 넣으면 **고칠 수 없는 결함이 수백 건** 쏟아진다(요율표는 열이 12개다).
  늘 ✗인 잣대는 아무것도 말하지 않고, 사람은 곧 그 줄을 안 읽는다(CLAUDE.md).

⚠ 회귀 스위트에 넣지 않는다 — 브라우저 설치가 필요해서다.
⚠ 서버에 아무것도 안 남긴다. `file://`로 열고 `/api/*`를 막는다.
🔴 **로그인을 통과해야 아무것도 안 보인다.** 안 그러면 로그인 폼만 재고
  「깨끗하다」고 말하게 된다(결함 생성기 ③). `assert_logged_in()`이 그것을 확인한다.
"""
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

# 재는 규칙은 `_screen_probe.py` 하나가 진실이다 — 고객 화면 도구도 같은 것을 쓴다.
from _screen_probe import collect, report  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "tmp_shots"
sys.stdout.reconfigure(encoding="utf-8")

SHOW_ALL = "--all" in sys.argv
SHOOT = "--shots" in sys.argv
ONLY = None
if "--tab" in sys.argv:
    i = sys.argv.index("--tab")
    if i + 1 < len(sys.argv):
        ONLY = sys.argv[i + 1]

WIDTHS = [("사무실 1440", 1440), ("노트북 1280", 1280), ("작은 노트북 1024", 1024)]

# `audit_ux.js`·`check_contrast.py`와 **같은 목록**이다. 탭을 늘리면 셋 다 늘린다.
TABS = ["dashboard", "inquiries", "estimates", "estmgr", "adhoc", "ledger", "stats",
        "events", "marketing", "content", "pricereport", "rates",
        "itineraries", "packages", "manual", "settings"]

LOGIN = """
() => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
}
"""

TAB = """
(id) => {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
  try { currentTab = id.replace('tab-',''); } catch (e) {}
  return !!document.getElementById(id);
}
"""


def assert_logged_in(page):
    """🔴 정말 안쪽 화면을 보고 있는가. 아니면 왜 아닌지를 돌려준다(None이면 정상)."""
    ok = page.evaluate("""() => {
      const lp = document.getElementById('loginPage');
      const dp = document.getElementById('dashPage');
      if (!lp || !dp) return 'loginPage/dashPage를 못 찾았다 — 화면 구조가 바뀌었다';
      if (dp.classList.contains('hidden')) return '안쪽 화면이 아직 감춰져 있다';
      if (getComputedStyle(lp).display !== 'none') return '로그인 폼이 아직 보인다';
      return null;
    }""")
    return ok


# ── 줄이 있는 화면으로 잰다 (2026-09-29, 가독성 2단계) ─────────────────────────────
# 🔴 예전엔 `file://`로 열고 `/api/*`를 막았다. 그런데 `file://`에서는 `fetch('/api/…')`가
#   `file:///api/…`가 되어 **가로챌 수조차 없었다** — 견적 관리·대장은 늘 **빈 목록**으로 재졌고,
#   「🔴 0」은 「빈 화면이 안 깨졌다」였을 뿐이다. 대장의 전화번호가 세 줄로 갈려 있던 것을
#   이 도구는 한 번도 못 봤다.
# → 가상 데이터(`make_admin_fixture.js`가 백업에서 고객 정보를 바꿔 만든다)가 있으면
#   로컬 서버로 열고 **진짜 로그인 경로**(`showDash`)를 돌려 줄이 그려진 화면을 잰다.
#   없으면 예전처럼 빈 화면을 재되, **그렇다고 말한다.**
# ⚠ 쓰기(GET 아닌 것)는 전부 막는다 — 화면이 저장을 불러도 아무 데도 안 간다.
FIXTURE = ROOT / "ai-loop" / ".admin_fixture.json"
EMPTY_ONLY = "--empty" in sys.argv

# 줄이 그려졌는지 — 가상 데이터가 안 먹으면 빈 화면을 재고 「깨끗하다」고 말하게 된다
MUST_HAVE_ROWS = {"estmgr": "#tab-estmgr tbody tr", "ledger": "#tab-ledger tbody tr"}


def _serve():
    import functools, http.server, socketserver, threading

    class _Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d" % httpd.server_address[1]


def _data_route(fx):
    import json, re
    by_id = {q["id"]: q for q in fx["quotes"]}
    me = {"id": "1", "username": "check", "displayName": "점검용", "role": "owner", "active": True}

    def route(r):
        u, m = r.request.url, r.request.method
        ok = lambda o: r.fulfill(status=200, content_type="application/json",
                                 body=json.dumps(o, ensure_ascii=False))
        if m != "GET":
            return r.abort()
        if "account?action=me" in u:
            return ok(me)
        if re.search(r"/api/inquiries(\?|$)", u):
            return ok([])
        if re.search(r"/api/quotes(\?|$)", u) and "action=" not in u:
            return ok(fx["quotes"])
        mm = re.search(r"/api/quotes/([^/?]+)", u)
        if mm and mm.group(1) in by_id:
            return ok(by_id[mm.group(1)])
        if "quote-shares?action=list" in u:
            return ok(fx["shares"])
        if "quote-shares?action=links" in u:
            return ok(fx["links"])
        return r.abort()
    return route


def _click_tab(page, t):
    """사이드바 버튼을 **진짜로** 누른다 — 클래스만 바꾸면 그 탭이 자기 데이터를 안 부른다.
    ⚠ 접힌 묶음 안의 버튼은 안 보여서 `page.click`이 30초를 기다리다 죽는다 → 요소의 click()."""
    return page.evaluate("""(t) => {
      const b = document.querySelector('.sidebar-item[data-tab="' + t + '"]');
      if (!b) return false; b.click(); return true;
    }""", t)


# 견적 상세 — 대표가 가장 많이 고친 자리(9/27~28)인데 탭 검사는 모달을 안 연다
DETAIL_OPEN = """() => {
  const b = [...document.querySelectorAll('#tab-estmgr tbody button, #tab-estmgr tbody a')]
    .find((x) => (x.textContent || '').trim() === '상세');
  if (!b) return false; b.click(); return true;
}"""
DETAIL_CLOSE = """() => {
  const m = [...document.querySelectorAll('.modal-overlay, .modal')].find((x) => getComputedStyle(x).display !== 'none');
  const c = m && m.querySelector('.modal-close, [data-close], button[aria-label*="닫기"]');
  if (c) c.click(); else document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
}"""


# 견적 작성 ①~⑤ — 관리자 화면 안에 **iframe으로** 들어가 있어 탭 검사는 틀만 잰다.
# 가상 견적 하나를 `?quote=`로 열어(고치기 경로 — 산출 없이 모든 단계가 열린다) 단계마다 잰다.
# ⚠ 폭은 그 iframe이 실제로 받는 폭에 가깝게 — 견적 상세 모달(1180px)과 작은 노트북.
QP_WIDTHS = [("견적 상세 모달 폭 1180", 1180), ("작은 노트북 1024", 1024)]
QP_STEPS = [(1, "sec1", "① 여행 조건"), (2, "secMoney", "② 금액"), (3, "secDoc", "③ 견적서 내용"),
            (4, "secIti", "④ 일정"), (5, "secPrev", "⑤ 미리보기·발급")]


def sweep_quote_pro(b, base, fx, findings):
    qs = [q for q in fx["quotes"] if isinstance(q.get("doc"), dict)]
    if not qs:
        findings.append(("🔴", "견적 작성", "검사가 화면을 못 띄웠다", "가상 데이터에 문서(doc)가 붙은 견적이 없다"))
        return 0
    qid = qs[0]["id"]
    seen = 0
    for wname, w in QP_WIDTHS:
        ctx = b.new_context(viewport={"width": w, "height": 1000})
        pg = ctx.new_page()
        pg.route("**/api/**", _data_route(fx))
        pg.goto(base + "/admin-quote-pro.html?quote=" + qid, wait_until="domcontentloaded")
        pg.wait_for_timeout(2500)
        for n, sec, name in QP_STEPS:
            pg.evaluate("(n) => { const b = document.querySelector('.step[data-step=\"' + n + '\"]'); if (b) b.click(); }", n)
            pg.wait_for_timeout(700)
            if not pg.evaluate("(id) => { const s = document.getElementById(id); return !!s && !s.classList.contains('hidden'); }", sec):
                findings.append(("🔴", f"견적 작성 {name}", "검사가 화면을 못 띄웠다",
                                 f"{w}px — 그 단계가 안 열렸다(잠금이 안 풀렸거나 단계 구조가 바뀌었다)"))
                continue
            collect(pg, f"견적 작성 {name}", findings)
            seen += 1
        ctx.close()
    return seen


def sweep_all(page, findings, tabs, data=False):
    seen = 0
    for t in tabs:
        if data:
            if not _click_tab(page, t):
                continue
            page.wait_for_timeout(900)
            sel = MUST_HAVE_ROWS.get(t)
            if sel and page.evaluate("(s) => document.querySelectorAll(s).length", sel) == 0:
                findings.append(("🔴", t, "검사가 화면을 못 띄웠다",
                                 "가상 데이터를 줬는데 줄이 하나도 안 그려졌다 — 응답 모양이 서버와 어긋났다"))
                continue
        else:
            if not page.evaluate(TAB, "tab-" + t):
                continue
            page.wait_for_timeout(350)
        collect(page, t, findings)
        seen += 1
        if data and t == "estmgr" and page.evaluate(DETAIL_OPEN):
            page.wait_for_timeout(900)
            collect(page, "견적 상세(모달)", findings)
            seen += 1
            page.evaluate(DETAIL_CLOSE)
            page.wait_for_timeout(300)
    return seen


def run(login_fn=None):
    findings = []
    swept = 0
    data = FIXTURE.exists() and not EMPTY_ONLY and login_fn is None
    login_fn = login_fn or (lambda pg: pg.evaluate(LOGIN))
    tabs = [ONLY] if ONLY else TABS
    httpd = None
    if data:
        import json
        fx = json.loads(FIXTURE.read_text(encoding="utf-8"))
        httpd, base = _serve()
        print(f"데이터: 가상 견적 {len(fx['quotes'])}건 · 대장 {len(fx['shares']['shares'])}건"
              f" ({fx.get('_meta', {}).get('from', '?')}에서 고객 정보를 바꿔 만든 것)")
    else:
        print("⚠ 데이터 없이 **빈 화면**을 잰다 — 줄이 있는 화면을 재려면 "
              "`node ai-loop/make_admin_fixture.js`를 먼저 돌린다")

    with sync_playwright() as p:
        b = p.chromium.launch()
        for wname, w in WIDTHS:
            ctx = b.new_context(viewport={"width": w, "height": 1000})
            pg = ctx.new_page()
            if data:
                pg.route("**/api/**", _data_route(fx))
                pg.goto(base + "/admin.html", wait_until="domcontentloaded")
                pg.wait_for_timeout(2500)          # 진짜 로그인 경로(showDash)가 돌 시간
            else:
                pg.route("**/api/**", lambda r: r.abort())
                # `load`를 기다리면 바깥 서버 하나가 느린 날 검사가 통째로 멈춘다(실측).
                pg.goto((ROOT / "admin.html").as_uri(), wait_until="domcontentloaded")
                pg.wait_for_timeout(1800)
                login_fn(pg)
                pg.wait_for_timeout(500)

            why = assert_logged_in(pg)
            if why:
                findings.append(("🔴", wname, "검사가 화면을 못 띄웠다", why))
                ctx.close()
                continue

            swept += sweep_all(pg, findings, tabs, data=data)
            if SHOOT:
                SHOTS.mkdir(parents=True, exist_ok=True)
                pg.screenshot(path=str(SHOTS / f"admin_{w}.png"), full_page=True)
            ctx.close()
        if data and (not ONLY or ONLY == "quotepro"):
            swept += sweep_quote_pro(b, base, fx, findings)
        b.close()
    if httpd:
        httpd.shutdown()

    return report(findings,
                  "담당자 화면 — 진짜 브라우저로, 탭 17개 × 폭 3가지",
                  f"훑은 것: 탭 {swept}회 (폭 {len(WIDTHS)}가지)",
                  show_all=SHOW_ALL)


def selftest():
    """🔴 **일부러 망가뜨려 잡히는지 본다** (CLAUDE.md 결함 생성기 ③).
    로그인을 안 하면 **로그인 폼만 재고 「깨끗하다」**고 말하게 된다 —
    관리자 화면 검사가 늘 빠지는 자리다. 그 실패 모양을 여기 남긴다."""
    print("── 고장 주입: 로그인을 안 한다 ──")
    code = run(login_fn=lambda pg: None)
    if code == 0:
        print("\n🔴 안전망이 죽었다 — 로그인 안 했는데도 통과했다")
        return 1
    print("\n✓ 안전망이 살아 있다 — 로그인을 못 하면 그 자리에서 말한다")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else run())

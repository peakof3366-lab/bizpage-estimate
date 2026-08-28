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
        "events", "marketing", "content", "pricereport", "rates", "quotetool",
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


def sweep_all(page, findings, tabs):
    seen = 0
    for t in tabs:
        if not page.evaluate(TAB, "tab-" + t):
            continue
        page.wait_for_timeout(350)
        collect(page, t, findings)
        seen += 1
    return seen


def run(login_fn=None):
    findings = []
    swept = 0
    login_fn = login_fn or (lambda pg: pg.evaluate(LOGIN))
    tabs = [ONLY] if ONLY else TABS

    with sync_playwright() as p:
        b = p.chromium.launch()
        for wname, w in WIDTHS:
            ctx = b.new_context(viewport={"width": w, "height": 1000})
            pg = ctx.new_page()
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

            swept += sweep_all(pg, findings, tabs)
            if SHOOT:
                SHOTS.mkdir(parents=True, exist_ok=True)
                pg.screenshot(path=str(SHOTS / f"admin_{w}.png"), full_page=True)
            ctx.close()
        b.close()

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

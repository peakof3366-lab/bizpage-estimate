# -*- coding: utf-8 -*-
"""고객이 **손에 쥐는 화면**을 진짜 브라우저로, **폰 폭부터** 재는 자 (YA)

    python ai-loop/check_customer_screens.py              전부
    python ai-loop/check_customer_screens.py --page estimate-view.html
    python ai-loop/check_customer_screens.py --all        확인 대상까지 전부 나열
    python ai-loop/check_customer_screens.py --shots      걸린 자리를 그림으로 저장

■ 🔴 왜 만드나 — **고객이 실제로 받는 문서를, 실제로 여는 기기에서 아무도 안 봤다**

브라우저로 화면을 여는 도구가 이 저장소에 여덟 개 있는데(`check_*.py`), 전부
`index.html`·`admin.html`·`manual.html`만 연다. 그런데 이 사업이 고객에게 실제로
건네는 것은 **`estimate-view.html?id=…` 주소 한 줄**이고, 그 링크는 카카오톡으로
가서 **폰에서 열린다.**

  · 그 화면을 재는 검사는 지금까지 **jsdom뿐**이었다 — jsdom은 색도 크기도 위치도
    계산하지 않는다. 「글자가 거기 있다」까지만 안다.
  · `check_contrast.py`가 「고객 · 견적서 문서」를 재긴 하는데, 그건
    `openEstimateWindow()`가 여는 **인쇄용 팝업**이다. 카톡 링크로 열리는 화면과
    **다른 문서**다(저장소가 스스로 둘을 갈라 부른다 — 「카톡으로 보내는 것」 /
    「인쇄·PDF용」).
  · 폭을 바꿔 가며 재는 도구는 `check_quote_doc_layout.py` 하나뿐이고, 그것도
    `index.html`만 본다.

즉 **가장 중요한 문서가 가장 안 재진 화면**이었다. 결함 생성기 ③(안전망이 실제로
실행된 적이 없다)이 화면 쪽에서 재현된 자리다.

■ 무엇을 재나 — 전부 **잴 수 있는 것**만. 색·여백·글꼴 취향은 여기서 다루지 않는다

  ① 🔴 **가로로 밀리는 화면** — 문서가 화면보다 넓다. 폰에서 좌우로 흔들린다.
       범인 요소를 지목한다(숫자만 주면 못 고친다).
  ② 🔴 **잘린 글자** — 칸보다 글이 길어 뒤가 사라진 것. 금액·목적지가 여기 걸리면
       고객이 **틀린 숫자를 읽는다.**
  ③ **너무 작은 글자** — 폰에서 12px 미만. 10px 미만은 오류로 본다.
  ④ **누르기 어려운 것** — 누를 수 있는 것의 실제 크기. 24×24 미만은 오류
       (WCAG 2.5.8 AA), 44×44 미만은 확인 대상(2.5.5 AAA · Apple HIG).
  ⑤ **화면 밖으로 나간 것** — 왼쪽/오른쪽으로 삐져나가 안 보이는 조작.

⚠ **없는 결함을 만들지 않는다** — 이 저장소가 반복해서 당한 자리다.
  · 안 보이는 것(`display:none`·`visibility`·`opacity:0`·`aria-hidden`)은 안 센다.
  · **스스로 옆으로 굴리는 칸**(`overflow-x:auto/scroll`) 안쪽은 넘침으로 안 센다 —
    표를 옆으로 미는 것은 **설계**다. 화면 전체가 밀리는 것만 ①로 잡는다.
  · 문단 **안**의 글자 링크는 ④에서 뺀다 — 44px 규칙은 버튼 이야기다.
  · 잘림은 **1px 차이를 세지 않는다**(브라우저 반올림). 4px 넘게 잘린 것만 본다.

⚠ 회귀 스위트에 넣지 않는다 — 브라우저 설치가 필요해서다(`check_contrast.py`와 같은 이유).
⚠ 서버에 아무것도 안 남긴다. `file://`로 열고 `/api/*`는 픽스처로 답한다.

⚠ 견적서 payload는 **손으로 짓지 않는다.** `virtual_journey.js --share-json=…`이
  내보낸 것을 그대로 쓴다(`fixtures/share_doc.json`). 서버가 주는 모양을 코드를
  따라가며 지으면 아무것도 못 잡는다 — WR에서 `inclItems` vs `included`로 당했다.
  픽스처를 새로 뽑으려면:
      node ai-loop/virtual_journey.js --n=1 --no-docs --no-clean --quiet \\
           --share-json=ai-loop/fixtures/share_doc.json
"""
import sys
import json
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

"""🔴 화면을 **띄우고 띄웠는지 확인하는 규칙은 `_browser_fixtures.py` 하나가 진실이다.**
   `check_contrast.py`도 같은 것을 쓴다 — 두 벌이 되면 한쪽만 고쳐지고, 그때 한 도구는
   오류 화면을 재면서 초록이 된다(실제로 그랬다)."""
from _browser_fixtures import load_share, missing_share_help, arm, assert_loaded  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "tmp_shots"
sys.stdout.reconfigure(encoding="utf-8")

SHOW_ALL = "--all" in sys.argv
SHOOT = "--shots" in sys.argv
ONLY = None
if "--page" in sys.argv:
    i = sys.argv.index("--page")
    if i + 1 < len(sys.argv):
        ONLY = sys.argv[i + 1]

# 🔴 폭은 **좁은 쪽이 먼저다.** 넓은 화면에서만 보면 전부 깨끗해 보인다.
WIDTHS = [("아주 좁은 폰", 320), ("폰", 390), ("태블릿", 860), ("노트북", 1280)]

# 🔴 **재는 규칙은 `_screen_probe.py` 하나가 진실이다** (YB).
#   담당자 화면 도구(`check_admin_screens.py`)도 같은 것을 쓴다. 규칙이 두 벌이 되면
#   「밀렸다」·「잘렸다」·「줄이 길다」의 뜻이 두 화면에서 달라지고, 그러면 **두 결과를
#   나란히 놓고 볼 수 없다**(결함 생성기 ①). 문턱값·판정도 전부 거기 있다.
from _screen_probe import collect, report  # noqa: E402

PAGES = [
    ("index.html", "고객 · 홈", ""),
    ("packages.html", "고객 · 패키지 목록", ""),
    ("estimate-view.html", "고객 · 카톡으로 받는 견적서", "?id=checkfixture"),
]


def run():
    share = load_share()
    findings = []          # (심각도, 폭이름, 화면, 종류, 설명)
    counted = 0

    with sync_playwright() as p:
        b = p.chromium.launch()
        for fname, label, query in PAGES:
            if ONLY and ONLY != fname:
                continue
            if fname == "estimate-view.html" and share is None:
                print(missing_share_help())
                print("  ! 견적서 화면은 픽스처가 없어 건너뜁니다")
                continue
            for wname, w in WIDTHS:
                ctx = b.new_context(viewport={"width": w, "height": 900})
                pg = ctx.new_page()
                arm(pg, share)          # ⚠ 반드시 `goto` 전에
                pg.route("**/api/**", lambda r: r.abort())
                # ⚠ `load`를 기다리면 **바깥 서버 하나가 느린 날 검사가 통째로 멈춘다**
                #   (실제로 30초 타임아웃으로 죽었다). 화면이 뜬 뒤 자리를 잡을 시간만 준다.
                pg.goto((ROOT / fname).as_uri() + query, wait_until="domcontentloaded")
                pg.wait_for_timeout(1800)
                # 🔴 **정말 그 화면을 재고 있는가부터 확인한다.** 견적서 화면은 문서를
                #   못 받으면 「견적서를 지금 열 수 없습니다」 **오류 화면**으로 떨어지는데,
                #   그 화면에도 글자와 버튼이 있어 검사는 멀쩡히 통과한다 —
                #   실제로 그렇게 통과했다. 화면 캡처를 눈으로 보고서야 알았다.
                if fname == "estimate-view.html":
                    why = assert_loaded(pg, share)
                    if why:
                        findings.append(("🔴", wname, label, "검사가 화면을 못 띄웠다", why))
                        ctx.close()
                        continue

                collect(pg, wname, findings, scope=label)
                counted += 1

                if SHOOT:
                    SHOTS.mkdir(parents=True, exist_ok=True)
                    pg.screenshot(path=str(SHOTS / f"{fname}_{w}.png"), full_page=True)
                ctx.close()
        b.close()

    return report(findings,
                  "고객이 손에 쥐는 화면 — 진짜 브라우저로, 폰 폭부터",
                  f"훑은 것: 화면 {len(PAGES) if not ONLY else 1}종 × 폭 {len(WIDTHS)}가지 = {counted}회",
                  show_all=SHOW_ALL, width_names=[w[0] for w in WIDTHS])


def selftest():
    """🔴 **일부러 망가뜨려 잡히는지 본다** (CLAUDE.md 결함 생성기 ③).
    이 도구가 처음 돌았을 때 픽스처가 안 꽂힌 채로 **오류 화면을 재면서 통과**했다.
    그 실패 모양을 여기서 재현해, 안전망이 살아 있는지 매번 확인할 수 있게 남긴다.
    ⚠ 픽스처의 견적번호를 바꾸는 시험은 **아무것도 확인하지 못한다** —
      화면도 그 값을 그대로 그리므로 자기 자신과 대조하게 된다(실제로 그렇게 헛돌았다).
      진짜 고장은 **픽스처가 안 꽂히는 것**이다.
    """
    global arm
    real_arm, arm = arm, (lambda page, share: None)
    try:
        print("── 고장 주입: 픽스처를 안 꽂는다 ──")
        code = run()
    finally:
        arm = real_arm
    if code == 0:
        print("\n🔴 안전망이 죽었다 — 픽스처가 없는데도 통과했다")
        return 1
    print("\n✓ 안전망이 살아 있다 — 픽스처가 안 꽂히면 그 자리에서 말한다")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else run())

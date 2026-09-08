# -*- coding: utf-8 -*-
"""고객 견적서의 **일정 탭이 진짜로 동작하는가** — 브라우저로 눌러 본다 (ZW)

🔴 왜 이 파일이 생겼나 — 2026-09-08 대표가 「열기로 열어 보면 안에 내용이 깨진다」고
  했다. 열어 보니 `estimate-view.html`의 일정 패널 여는 태그에 **닫는 꺾쇠 하나가
  빠져** 있었다. 그 한 글자 때문에:

    ① 다음 줄의 `day-hd` 여는 태그가 통째로 **속성으로 먹히고**
    ② 그 닫는 태그가 **패널을 일찍 닫아**, 오전·오후·저녁과 현장 Tip이 패널 밖으로 나가고
    ③ **날짜 탭이 아무 일도 안 했다** — 어느 일차를 눌러도 7일치가 한꺼번에 보였다

  ⚠ **HTML 파서는 이것을 에러로 안 낸다.** 조용히 속성으로 삼는다. 글자는 다 있으니
    소스를 세는 검사도, jsdom을 쓰는 검사도 통과했다. **브라우저로 눌러 보고서야**
    걸렸다(결함 생성기 ③: 안전망이 실제로 실행된 적이 없다).

  그래서 이 검사는 「글자가 있는가」가 아니라 **「눌렀을 때 하루치만 보이는가」**를 잰다.

⚠ 픽스처는 손으로 짓지 않는다(`_browser_fixtures` 규칙). 없으면 만드는 법을 알려 준다.

실행: python ai-loop/check_quote_itinerary.py
"""
import sys
import pathlib

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from _browser_fixtures import (  # noqa: E402
    load_share, arm, open_quote, assert_loaded, missing_share_help,
)

try:
    from playwright.sync_api import sync_playwright  # noqa: E402
except ImportError:
    print("playwright가 없습니다 — pip install playwright && playwright install chromium")
    sys.exit(1)

PASS, FAIL = [], []


def ok(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✓ " if cond else "  ✗ ") + name + (("  → " + str(extra)) if not cond and extra else ""))


# 🔴 「하루치만 보이는가」를 재는 자. 눈이 아니라 **레이아웃**으로 판정한다.
SHAPE = r"""
() => {
  const panels = [...document.querySelectorAll('.day-panel')];
  const shown  = panels.filter(p => getComputedStyle(p).display !== 'none');
  const sched  = [...document.querySelectorAll('.day-sched')];
  return {
    courses: document.querySelectorAll('.iti-card').length,
    panels: panels.length,
    shown: shown.length,
    /* 🔴 이것이 그때의 증상이다 — 일정 줄이 패널 **밖**에 있으면 탭이 무의미해진다 */
    orphanSched: sched.filter(s => !s.closest('.day-panel')).length,
    visibleSched: sched.filter(s => s.getBoundingClientRect().height > 0).length,
    /* 패널이 제목만 남고 납작해졌는지 — 그때 62px였다(내용이 빠져나가서) */
    minShownHeight: shown.length ? Math.min(...shown.map(p => Math.round(p.getBoundingClientRect().height))) : 0,
  };
}
"""


def run():
    share = load_share()
    if share is None:
        print(missing_share_help())
        return 1

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 1000})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        arm(pg, share)
        open_quote(pg, share)

        why = assert_loaded(pg, share)
        if why:
            print("  ✗ 견적서를 못 띄웠다 —", why)
            ctx.close(); b.close()
            return 1

        print("\n[1] 일정이 그려졌는가")
        s = pg.evaluate(SHAPE)
        ok("① 코스 카드가 있다", s["courses"] >= 1, s["courses"])
        ok("① 일자 패널이 있다", s["panels"] >= 2, s["panels"])

        print("\n[2] 🔴 하루치만 보인다 — 탭이 실제로 가른다")
        ok("② 코스마다 한 일자만 펼쳐져 있다", s["shown"] == s["courses"],
           f"코스 {s['courses']} · 펼침 {s['shown']}")
        ok("② 보이는 일정 줄도 코스 수만큼이다", s["visibleSched"] == s["courses"],
           f"코스 {s['courses']} · 보이는 줄 {s['visibleSched']}")
        # 🔴 그때의 증상 그대로를 못 박는다
        ok("② 🔴 일정 줄이 패널 밖으로 새지 않는다", s["orphanSched"] == 0,
           f"패널 밖 {s['orphanSched']}줄 — 여는 태그가 일찍 닫혔을 때 이렇게 된다")
        ok("② 패널이 제목만 남고 납작해지지 않았다", s["minShownHeight"] > 100,
           f"{s['minShownHeight']}px (내용이 빠져나가면 60px대가 된다)")

        print("\n[3] 눌러 보면 바뀐다")
        tabs = pg.query_selector_all(".day-tab")
        ok("③ 일자 버튼이 있다", len(tabs) >= 2, len(tabs))
        if len(tabs) >= 2:
            before = pg.evaluate(
                "() => [...document.querySelectorAll('.day-panel')]"
                ".filter(p => getComputedStyle(p).display !== 'none')"
                ".map(p => p.dataset.day).join(',')")
            tabs[1].click()
            pg.wait_for_timeout(250)
            after = pg.evaluate(
                "() => [...document.querySelectorAll('.day-panel')]"
                ".filter(p => getComputedStyle(p).display !== 'none')"
                ".map(p => p.dataset.day).join(',')")
            ok("③ 다른 일자를 누르면 보이는 일자가 바뀐다", before != after, f"{before} → {after}")
            s2 = pg.evaluate(SHAPE)
            ok("③ 눌러도 하나만 펼쳐진 채다", s2["shown"] == s2["courses"],
               f"펼침 {s2['shown']} / 코스 {s2['courses']}")

        ok("④ JS 오류가 없다", not errs, errs[:2])
        ctx.close()
        b.close()

    print("\n" + "─" * 64)
    print(f"결과: {len(PASS)} pass / {len(FAIL)} fail  — ZW 견적서 일정 탭")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(run())

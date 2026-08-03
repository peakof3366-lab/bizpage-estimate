# -*- coding: utf-8 -*-
"""고객 견적서 모양 검사 — 고객이 하는 그대로 견적을 뽑고, 실제 브라우저로 좌표를 잰다.

    python ai-loop/check_quote_doc_layout.py            검사만
    python ai-loop/check_quote_doc_layout.py --shots    스크린샷도 저장(ai-loop/tmp_shots/)

왜 필요한가: 이 문서는 **고객이 결재 보고용으로 받아 보는 것**이라, 여기서 모양이
깨지면 곧바로 신뢰를 깎는다. 그런데 jsdom은 레이아웃을 계산하지 않아 스위트로는
못 잰다. 실제로 이렇게 잡혔다 —
  · RH — 코스 탭 두 개가 한 줄에 nowrap으로 놓여 있어 390px 화면에서 문서가
    **오른쪽으로 289px** 밀려났다(가로 스크롤). 데스크톱에서는 0px라 안 보였다.

⚠ 프로덕션 DB에는 아무것도 안 남는다. 로컬 파일(file://)로 열고 /api/* 를 전부 막으므로
   견적이 서버로 전송되지 않는다. 견적 계산과 문서 생성은 전부 브라우저에서 도므로
   보이는 모양은 실제와 같다.

⚠ 이 검사는 회귀 스위트(run_all_tests.js)에 들어가지 않는다 — 브라우저 설치가 필요해서다
   (check_manual_layout.py·check_editor_layout.py와 같은 이유). 대신 원인이 되는 CSS
   구조는 ai-loop/test_rH_quote_doc.js가 소스에서 막는다.

무엇을 재는가:
  ① 가로 넘침 — 고객 문서에서 가로 스크롤이 생기면 안 된다
  ② 무엇이 넘쳤는지 이름을 댄다 (숫자만 보면 어디를 고칠지 모른다)
  ③ 깨진 이미지
  ④ 일정표가 실제로 들어갔는가 (관리자가 고친 일정이 고객에게 나가는 경로다)
"""
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "tmp_shots"
sys.stdout.reconfigure(encoding="utf-8")
SHOOT = "--shots" in sys.argv

# 고객이 STEP1에 넣는 것. 값을 고정해 두어야 폭마다 같은 문서를 비교할 수 있다.
STEP1 = r"""
() => {
  const set = (id, v) => { const el = document.getElementById(id); if (!el) return;
    el.value = v; el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true})); };
  set('destination', '도쿄');
  set('startDate', '2026-10-12'); set('endDate', '2026-10-16');
  set('participants', '20');
  ['programType','organizationType','departureCity'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const o = Array.from(el.options).find(x => x.value);
    if (o) { el.value = o.value; el.dispatchEvent(new Event('change', {bubbles:true})); }
  });
}
"""

STEP2 = r"""
() => {
  const set = (id, v) => { const el = document.getElementById(id); if (!el) return;
    el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); };
  set('organization', '모양점검'); set('contactName', '모양점검');
  set('requestDetails', '모양 점검용 입력입니다.');
}
"""

PROBE = r"""
() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const over = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > vw + 1 || r.left < -1) {
      /* 부모도 함께 넘치면 부모만 보고한다 — 같은 원인을 여러 번 적지 않게 */
      const p = el.parentElement;
      if (p && p.getBoundingClientRect().right > vw + 1) return;
      over.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40),
                  over: Math.round(r.right - vw) });
    }
  });
  const imgs = Array.from(document.images);
  const broken = imgs.filter(i => i.complete && i.naturalWidth === 0);
  return {
    scrollOver: Math.max(0, de.scrollWidth - vw),
    over,
    imgs: imgs.length, broken: broken.length,
    brokenSrc: broken.slice(0, 4).map(i => decodeURIComponent(i.getAttribute('src') || '(빈 src)').slice(-45)),
    dayCards: document.querySelectorAll('.day-card').length,
    height: de.scrollHeight,
  };
}
"""

WIDTHS = [("데스크톱", 1440), ("노트북", 1280), ("태블릿", 860), ("모바일", 390), ("아주 좁은 화면", 360)]

bad = 0
if SHOOT:
    SHOTS.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for label, width in WIDTHS:
        ctx = browser.new_context(viewport={"width": width, "height": 900})
        page = ctx.new_page()
        page.route("**/api/**", lambda r: r.abort())   # 서버로 아무것도 안 보낸다
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_timeout(1400)
        page.evaluate(STEP1)
        page.wait_for_timeout(400)
        page.click("#nextStepButton")
        page.wait_for_timeout(450)
        page.evaluate(STEP2)
        page.wait_for_timeout(200)
        page.click("button.button-primary:has-text('견적 확인하기')")
        page.wait_for_timeout(1400)

        problems = []
        try:
            with ctx.expect_page(timeout=15000) as pop:
                page.evaluate("() => openEstimateWindow()")
            doc = pop.value
            doc.wait_for_timeout(2200)
            r = doc.evaluate(PROBE)
            if r["scrollOver"] > 0.5:
                problems.append(f"가로로 {r['scrollOver']}px 넘친다 (고객 문서에 가로 스크롤)")
            for o in r["over"][:5]:
                problems.append(f"  └ {o['tag']}.{o['cls']} 가 {o['over']}px 밖으로")
            if r["broken"]:
                problems.append(f"깨진 이미지 {r['broken']}개: {', '.join(r['brokenSrc'])}")
            if r["dayCards"] == 0:
                problems.append("일정표(일자 카드)가 하나도 없다 — 관리자가 고친 일정이 고객에게 안 나간다")
            mark = "✓" if not problems else "✗"
            print(f"{mark} {label} {width}px — 세로 {r['height']:,}px · 일자 카드 {r['dayCards']}장 · 이미지 {r['imgs']}개")
            for problem in problems:
                bad += 1
                print("    · " + problem)
            if SHOOT:
                doc.screenshot(path=str(SHOTS / f"quotedoc_{width}.png"))
        except Exception as ex:
            bad += 1
            print(f"✗ {label} {width}px — 견적서 창을 열지 못했습니다: {str(ex)[:120]}")
        ctx.close()
    browser.close()

if SHOOT:
    print(f"\n스크린샷: {SHOTS}")
print("\n✓ 고객 견적서 모양 이상 없음" if not bad else f"\n✗ {bad}건")
sys.exit(1 if bad else 0)

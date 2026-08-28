"""
고객 견적 폼 — **스크롤하기 전에 무엇이 보이는가**를 실제 브라우저로 잰다 (XT)

대표 지시(2026-08-27): 「화면을 봤을 때 바로바로 이해되는 구조」.
그 질문의 핵심은 **첫 화면에 무엇이 들어오는가**인데, jsdom은 레이아웃을 계산하지
않아 못 잰다(`audit_ux.js`가 「칸 25개」까지만 세는 이유다). 브라우저로만 가능하다.

■ 재는 것
  ① 가로 스크롤 — 화면 밖으로 삐져나가는가 (휴대폰에서 자주 난다)
  ② 1단계 전체 높이 — 벽이 얼마나 긴가
  ③ 첫 화면(폼에 도착한 순간)에 보이는 입력칸 수
  ④ 🔴 **끝이 어딘지 알 수 있는가** — 단계 표시와 한 줄 안내가 있는가
  ⑤ 칸이 자기 카드 밖으로 나가는가

⚠ 처음엔 ④를 「첫 화면에 다음 버튼이 보이는가」로 쟀는데, 폼이 화면보다 길면 다음
  버튼은 **당연히 아래**라 다섯 크기 전부가 늘 ✗였다. **늘 ✗인 잣대는 아무것도 안
  말한다** — 사람은 그 줄을 곧 안 읽게 된다. 재야 할 것은 「버튼이 보이는가」가 아니라
  **「지금 어디쯤이고 얼마나 남았는지 아는가」**다.

⚠ 서버에 아무것도 안 남긴다 — `file://`로 열고 `/api/*`를 막는다.
⚠ 잴 수 없는 것(색·여백의 아름다움)은 다루지 않는다. 재는 척하면 그 숫자가
  오히려 판단을 막는다.

실행:  python ai-loop/check_quote_form_layout.py [--shots]
"""
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

# 🔴 **이 줄이 없어 이 도구는 끝까지 돌아간 적이 없다** (YA).
#   윈도우 콘솔은 cp949라, 결과를 찍는 **첫 줄에서** `✓`(U+2713) 때문에
#   `UnicodeEncodeError`로 죽는다 — 결과가 한 줄도 안 나온다.
#   CLAUDE.md가 「화면을 고쳤으면 돌려라」고 지정한 도구인데 그랬다
#   (결함 생성기 ③: 안전망이 실제로 실행된 적이 없다).
sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "tmp_shots"
WANT_SHOTS = "--shots" in sys.argv

SIZES = [
    ("데스크톱 1440px", 1440, 900),
    ("노트북 1280px", 1280, 800),
    ("태블릿 860px", 860, 1000),
    ("모바일 390px", 390, 844),
    ("아주 좁은 화면 360px", 360, 740),
]

JS = r"""
() => {
  const step1 = document.querySelector('.estimate-step[data-step="1"]');
  if (!step1) return { error: '1단계를 못 찾았다' };
  const vh = window.innerHeight, vw = window.innerWidth;
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    return r.top < vh && r.bottom > 0;
  };
  const shown = (el) => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const fields = Array.from(step1.querySelectorAll('input, select, textarea'))
    .filter((f) => f.type !== 'hidden' && shown(f));
  /* 라디오·체크박스는 묶음 하나로 센다 — 사람은 「좌석 등급」 하나로 읽는다 */
  const uniq = new Set();
  const counted = fields.filter((f) => {
    if (f.type === 'radio' || f.type === 'checkbox') {
      const k = f.name || f.id;
      if (uniq.has(k)) return false;
      uniq.add(k);
    }
    return true;
  });
  const nextBtn = document.getElementById('nextStepButton');
  const box = step1.getBoundingClientRect();
  /* 칸이 자기 카드 밖으로 나갔는가 */
  let overflow = 0;
  counted.forEach((f) => {
    const r = f.getBoundingClientRect();
    if (r.right > box.right + 2 || r.left < box.left - 2) overflow++;
  });
  const firstHead = step1.querySelector('.form-group-title');
  return {
    가로스크롤: Math.max(0, document.documentElement.scrollWidth - vw),
    단계높이: Math.round(box.height),
    보이는칸_전체: counted.length,
    첫화면_칸: counted.filter(seen).length,
    첫화면_다음버튼: !!(nextBtn && seen(nextBtn)),
    단계표시: !!step1.querySelector('.step-badge'),
    단계안내: (() => { const g = step1.querySelector('.step-guide'); return g ? g.textContent.trim().slice(0, 40) : ''; })(),
    카드밖: overflow,
    소제목수: step1.querySelectorAll('.form-group-title').length,
    첫소제목: firstHead ? firstHead.textContent.trim().slice(0, 30) : '',
  };
}
"""

bad = 0
with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, w, h in SIZES:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.route("**/api/**", lambda route: route.abort())
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_timeout(700)
        # 🔴 **폼이 첫 화면 아래에 있다.** 그냥 재면 「보이는 칸 0개」가 나오는데,
        #    그건 폼이 나쁘다는 뜻이 아니라 **재는 자리가 틀린 것**이다.
        #    고객이 폼에 도착한 순간(스크롤해서 폼 머리가 화면 위에 온 때)을 잰다.
        page.evaluate("""() => {
          const s = document.querySelector('.estimate-step[data-step=\"1\"]');
          if (s) window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 8);
        }""")
        page.wait_for_timeout(350)
        r = page.evaluate(JS)
        if r.get("error"):
            print("✗ %s — %s" % (name, r["error"]))
            bad += 1
            page.close()
            continue
        flags = []
        if r["가로스크롤"] > 0:
            flags.append("🔴 가로로 %dpx 삐져나감" % r["가로스크롤"])
        if r["카드밖"]:
            flags.append("🔴 카드 밖으로 나간 칸 %d개" % r["카드밖"])
        if not r["단계표시"]:
            flags.append("🔴 몇 단계 중 어디인지 표시가 없음")
        if not r["단계안내"]:
            flags.append("🔴 무엇을 채우면 되는지 안내가 없음")
        print("%s %-22s 1단계 높이 %5dpx · 칸 %2d묶음(첫 화면 %2d) · 단계표시 %s  %s"
              % ("✗" if flags else "✓", name, r["단계높이"], r["보이는칸_전체"],
                 r["첫화면_칸"], "있음" if r["단계표시"] else "없음", " · ".join(flags)))
        if flags:
            bad += 1
        if WANT_SHOTS:
            SHOTS.mkdir(exist_ok=True)
            page.screenshot(path=str(SHOTS / ("quote_form_%d.png" % w)), full_page=False)
        page.close()
    browser.close()

print("")
print("⚠ 「첫 화면 칸 수」는 적을수록 좋은 것이 아니다 — **무엇을 하면 되는지 보이는가**가 핵심이다.")
print("   1단계의 칸은 원시 25개가 아니라 **묶음 10개**다(라디오·체크박스는 사람이 하나로 읽는다).")
print("✗ 모양 문제 %d건" % bad if bad else "✓ 삐져나가는 곳 없음")
sys.exit(1 if bad else 0)

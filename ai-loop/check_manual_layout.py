# -*- coding: utf-8 -*-
"""매뉴얼 줄맞춤 검사 — 실제 브라우저로 띄워 좌표를 잰다.

    python ai-loop/check_manual_layout.py            검사만
    python ai-loop/check_manual_layout.py --shots    스크린샷도 저장(ai-loop/tmp_shots/)

왜 브라우저가 필요한가: jsdom은 레이아웃을 계산하지 않는다. "글자가 번호 칸에 갇혀
한 글자씩 세로로 쏟아지는" 결함은 **좌표를 재야만** 보인다. 실제로 그 상태로 배포된
적이 있고(2026-08-03), 그때 소스만 봐서는 아무 이상이 없어 보였다.

⚠ 이 검사는 회귀 스위트(run_all_tests.js)에 들어가지 않는다 — 브라우저 설치가 필요해서다.
   대신 구조 자체가 되돌아가는 것은 test_qN_manual.js가 소스에서 막는다(빠르고 항상 돈다).
   매뉴얼 모양을 손댔으면 이걸 한 번 돌리는 게 맞다.

무엇을 재는가 — 번호 매긴 목록에서:
  ① 내용이 번호 자리(왼쪽 여백)를 침범하지 않는가
  ② 첫 조각이 내용 시작선에 정확히 붙어 있는가
  ③ 긴 글이 좁은 칸에 갇혀 있지 않은가  ← 이게 실제로 터졌던 결함
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

GROUPS = [
    ("2장 하루 흐름", "ol.flow > li"),
    ("단계 목록", "ol.steps > li"),
    ("하면 안 되는 것", "ul.dont > li"),
    ("첫날 안내", ".kickoff ol > li"),
    ("목차", "nav.toc ol > li"),
]

PROBE = r"""
(groups) => {
  const out = [];
  for (const [label, sel] of groups) {
    document.querySelectorAll(sel).forEach((li, i) => {
      const liBox = li.getBoundingClientRect();
      const cs = getComputedStyle(li);
      /* ⚠ getBoundingClientRect().left는 **테두리 바깥**이다. 왼쪽 테두리를 빼먹으면
         멀쩡한 줄이 3px 어긋난 것으로 잡힌다(ol.flow가 왼쪽에 3px 선을 쓴다). */
      const padLeft = parseFloat(cs.paddingLeft) || 0;
      const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
      const contentLeft = liBox.left + borderLeft + padLeft;

      /* 요소 자식과 글자 덩어리를 모두 '내용 조각'으로 잰다.
         ⚠ 요소만 재면 안 된다 — 격자 안에서는 글자 덩어리도 한 칸을 차지하므로,
         요소만 보는 검사는 통째로 깨진 화면을 통과시킨다(실제로 그랬다). */
      const parts = [];
      li.childNodes.forEach((n) => {
        let r = null;
        if (n.nodeType === 1) r = n.getBoundingClientRect();
        else if (n.nodeType === 3 && n.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(n);
          r = range.getBoundingClientRect();
        }
        if (r && r.width > 0 && r.height > 0) {
          parts.push({ kind: n.nodeType === 1 ? n.tagName.toLowerCase() : '글자',
                       left: r.left, width: r.width, text: (n.textContent || '').trim().replace(/\s+/g, ' ') });
        }
      });
      if (!parts.length) return;

      const issues = [];
      // ① 번호 자리 침범
      const intruder = parts.find(p => p.left < contentLeft - 1);
      if (intruder) issues.push(`내용이 번호 자리를 침범합니다 ("${intruder.text.slice(0, 24)}")`);
      // ② 첫 조각이 시작선에 붙어 있는가
      if (Math.abs(parts[0].left - contentLeft) > 2) issues.push('첫 조각이 내용 시작선에 안 붙었습니다');
      // ③ 긴 글이 좁은 칸에 갇힘 — 실제로 터졌던 결함
      const squeezed = parts.find(p => p.text.length > 12 && p.width < 60);
      if (squeezed) issues.push(`긴 글이 ${Math.round(squeezed.width)}px 칸에 갇혔습니다 ("${squeezed.text.slice(0, 24)}")`);

      if (issues.length) out.push({ group: label, index: i + 1, issues });
    });
  }
  return out;
}
"""

def main():
    shots = "--shots" in sys.argv
    if shots:
        SHOTS.mkdir(exist_ok=True)
    total = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, width in [("데스크톱", 1280), ("태블릿", 860), ("모바일", 420)]:
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.goto((ROOT / "manual.html").as_uri())
            page.wait_for_timeout(300)

            problems = page.evaluate(PROBE, GROUPS)
            total += len(problems)
            mark = "✓" if not problems else "✗"
            print(f"{mark} {name} {width}px — 어긋남 {len(problems)}건")
            for pr in problems:
                for msg in pr["issues"]:
                    print(f"    · {pr['group']} {pr['index']}번: {msg}")

            if shots:
                page.screenshot(path=str(SHOTS / f"manual_{width}.png"), full_page=True)
            page.close()
        browser.close()

    if shots:
        print(f"\n스크린샷: {SHOTS}")
    print("\n" + ("✓ 줄맞춤 이상 없음" if total == 0 else f"✗ 총 {total}건 — 고쳐야 합니다"))
    sys.exit(1 if total else 0)

if __name__ == "__main__":
    main()

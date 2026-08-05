# -*- coding: utf-8 -*-
"""내부 견적 산출 화면이 다른 탭과 **같은 오른쪽 끝**까지 쓰는가 — 실제 브라우저로 잰다.

    python ai-loop/check_quotetool_width.py
    python ai-loop/check_quotetool_width.py --shots

왜 —
이 화면만 안쪽에서 폭이 한 번 더 잘려(1100px) 오른쪽이 크게 비어 있었다. 다른 탭은
`.dash-body`(96% · 최대 1680px)까지 쓴다. 목적지·포함 항목이 `auto-fill` 그리드라
폭을 주면 그만큼 열이 늘어 스크롤이 줄어든다.

⚠ 그러나 **전부 늘리면 안 된다.** 문장을 쓰는 칸(기관명·요청사항)과 단계 이동 버튼까지
1,600px로 벌어지면 오히려 쓰기 어려워진다. 그래서 두 가지를 함께 본다:
  ① 바깥은 다른 탭과 오른쪽 끝이 같은가
  ② 안쪽에서 늘어나면 안 되는 칸이 정말 안 늘어났는가

jsdom은 폭을 계산하지 않아 이 검사는 브라우저로만 가능하다(스위트에 넣지 않는 이유).
⚠ 서버에 아무것도 안 남긴다 — file://로 열고 /api/* 를 막는다.
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
SHOOT = "--shots" in sys.argv
sys.stdout.reconfigure(encoding="utf-8")

"""⚠ iframe 안을 직접 읽지 않는다.

file://에서 열면 iframe 문서에 접근할 수 없어 검사가 아무것도 못 본다(플래그를 줘도
불안정했다). 대신 **관리자에서 iframe이 실제로 받는 폭을 재고, 그 폭으로 내부 화면을
따로 연다.** iframe이 width:100%라 결과는 같고, 검사는 훨씬 단단해진다."""

ADMIN = r"""
() => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
  const on = (id) => document.querySelectorAll('.tab-panel')
    .forEach(p => p.classList.toggle('active', p.id === id));

  /* 다른 탭의 오른쪽 끝 = 기준점. 대시보드 탭이 그 기준이다. */
  on('tab-dashboard');
  const ref = document.getElementById('tab-dashboard').getBoundingClientRect();

  /* 내부 견적 탭에서 iframe이 실제로 받는 폭 */
  on('tab-quotetool');
  const f = document.getElementById('quoteToolFrame').getBoundingClientRect();

  return { refRight: Math.round(ref.right), refWidth: Math.round(ref.width),
           frameWidth: Math.round(f.width), frameRight: Math.round(f.right) };
}
"""

INNER = r"""
() => {
  const d = document;
  if (!d.querySelector('.aq-shell')) return { error: '내부 화면을 못 읽었다' };
  /* ⚠ 고객 정보(기관명·요청 사항)는 STEP 2에 있고 평소엔 숨어 있다. 그대로 재면 폭이
     0px으로 나와서 **상한 검사가 늘 통과한다** — 한 번도 실행된 적 없는 안전망이 된다
     (결함 생성기 ③). 두 단계를 모두 펼쳐 놓고 잰다. */
  d.querySelectorAll('.estimate-step').forEach((s) => s.classList.add('step-active'));
  const box = (sel) => {
    const el = d.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), right: Math.round(r.right) };
  };
  const cols = (sel) => {
    const el = d.querySelector(sel);
    if (!el) return 0;
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
  };
  return {
    shell: box('.aq-shell'),
    section: box('.aq-section'),
    listCols: cols('.aq-list-grid'),
    org: box('#organization'),
    memo: box('#requestDetails'),
    actions: box('.step-actions'),
    dateBlock: box('.date-block'),
    participants: box('#participants'),
    overflow: Math.round(d.documentElement.scrollWidth - d.documentElement.clientWidth),
    /* ⚠ aq-embedded는 <html>에 붙는다(admin-quote.html 하단). body에서 찾으면 늘 false다. */
    embedded: d.documentElement.classList.contains('aq-embedded'),
  };
}
"""

# 안쪽에서 **늘어나면 안 되는** 칸과 그 상한(px). 넘으면 폭을 넓힌 것이 손해가 된 것이다.
CAPS = [
    ("org",          560, "고객사/기관명 입력칸"),
    ("memo",        1050, "요청 사항 메모"),
    ("actions",      650, "단계 이동 버튼 줄"),
    ("dateBlock",    780, "연수 날짜 블록"),
    ("participants", 340, "참가 인원 입력칸"),
]

WIDTHS = [("데스크톱", 1680), ("노트북", 1440), ("좁은 데스크톱", 1280)]

bad = 0
with sync_playwright() as p:
    browser = p.chromium.launch()
    for label, width in WIDTHS:
        # ① 관리자에서 기준점과 iframe 실폭을 잰다
        ctx = browser.new_context(viewport={"width": width, "height": 1000})
        page = ctx.new_page()
        page.route("**/api/**", lambda r: r.abort())
        page.goto((ROOT / "admin.html").as_uri())
        page.wait_for_timeout(1200)
        ref = page.evaluate(ADMIN)
        ctx.close()

        # ② 그 폭으로 내부 화면을 연다 (iframe이 width:100%라 결과가 같다)
        #    ⚠ 이 화면에는 세션 게이트가 있다 — 확인에 실패하면 admin.html로 **되돌아가 버려서**
        #    아무것도 못 잰다. file://에서는 fetch가 스킴 단계에서 실패해 라우팅으로도 못 막는다.
        #    그래서 fetch 자체를 갈아 끼운다 — 세션 확인만 통과시키고 나머지는 거절한다.
        #    서버로는 **아무것도 나가지 않는다**(요청이 브라우저 안에서 끝난다).
        ctx2 = browser.new_context(viewport={"width": ref["frameWidth"], "height": 1000})
        page2 = ctx2.new_page()
        page2.add_init_script("""
          (() => {
            window.fetch = (u) => String(u).includes('/api/admin/account')
              ? Promise.resolve(new Response('{"displayName":"폭 점검"}',
                  { status: 200, headers: { 'Content-Type': 'application/json' } }))
              : Promise.reject(new Error('폭 점검 중에는 서버로 나가지 않는다'));
          })();
        """)
        page2.goto((ROOT / "admin-quote.html").as_uri())
        page2.wait_for_timeout(1600)
        # 관리자 안에 있을 때와 같은 상태로 만든다(원래는 self!==top일 때 붙는다)
        page2.evaluate("() => document.documentElement.classList.add('aq-embedded')")
        page2.wait_for_timeout(300)
        r = page2.evaluate(INNER)
        problems = []
        if r.get("error"):
            print(f"✗ {label} {width}px — {r['error']}")
            bad += 1
            ctx2.close()
            continue

        if not r["embedded"]:
            problems.append("aq-embedded 상태를 못 만들었다 — 단독 페이지용 폭이 걸린다")

        # ③ 본문이 받은 폭을 끝까지 쓰는가 (여백만큼의 차이는 허용)
        gap = ref["frameWidth"] - (r["section"]["w"] if r["section"] else 0)
        if gap > 48:
            problems.append(f"받은 폭 {ref['frameWidth']}px 중 {gap}px를 안 쓴다 "
                            f"(본문 {r['section']['w']}px) — 오른쪽이 그만큼 빈다")

        # ② 늘어나면 안 되는 칸
        for key, cap, name in CAPS:
            v = r.get(key)
            # ⚠ 못 재면 '통과'가 아니라 **못 잰 것**이다. 조용히 넘기면 그 상한은
            #   한 번도 확인된 적 없는 채로 남는다(결함 생성기 ③).
            if not v or v["w"] < 1:
                problems.append(f"{name}을 재지 못했다 — 화면에 안 보이는 상태다")
            elif v["w"] > cap:
                problems.append(f"{name}이 {v['w']}px까지 늘어났다 (상한 {cap}px) — "
                                "폭을 넓힌 것이 오히려 쓰기 어렵게 만든다")

        if r["overflow"] > 0.5:
            problems.append(f"내부 화면이 가로로 {r['overflow']}px 넘친다")

        mark = "✓" if not problems else "✗"
        print(f"{mark} {label} {width}px — 받은 폭 {ref['frameWidth']}px / 본문 "
              f"{r['section']['w'] if r['section'] else '?'}px (남는 여백 {gap}px) "
              f"· 목적지 목록 {r['listCols']}열")
        for x in problems:
            bad += 1
            print("    · " + x)

        if SHOOT:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page2.screenshot(path=str(SHOTS / f"quotetool_{width}.png"), full_page=False)
        ctx2.close()
    browser.close()

print()
if bad:
    print(f"✗ 문제 {bad}건")
    sys.exit(1)
print("✓ 내부 견적 산출 화면이 다른 탭과 같은 폭을 쓰고, 늘어나면 안 되는 칸은 묶여 있다")

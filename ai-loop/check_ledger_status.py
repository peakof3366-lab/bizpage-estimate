# -*- coding: utf-8 -*-
"""견적서 대장의 **상태 저장 버튼**을 진짜 브라우저로 눌러 본다 (ZY)

🔴 왜 브라우저인가 — 이 자리에서 jsdom은 이미 두 번 속았다.
  · ZV: 「바꾼 사람」 줄이 `<select>` 안에 있어 **한 번도 안 그려졌는데** 검사는 통과했다
  · ZW: 꺾쇠 하나가 빠져 일정이 통째로 뭉개졌는데 소스·jsdom 검사가 전부 통과했다

  이번 변경은 **표 한 칸에 버튼을 하나 더 넣는 일**이다. 그러면 반드시 물어야 한다:
    ① 그 버튼이 정말 보이는가 · 드롭다운과 **같은 줄**에 있는가(대표: 「바로 옆에」)
    ② 🔴 **표가 오른쪽으로 잘리지 않는가** — `.dash-main`이 `overflow-x:hidden`이라
       열이 넓어지면 마지막 열(열기·링크·문의)이 **소리 없이 잘린다.** 대장을 11열에서
       8열로 줄인 것이 바로 그 이유였다(ZV). 칸을 넓히는 변경은 그 빚을 다시 진다.
    ③ 꺼짐 → 켜짐 → 저장됨이 **눈으로 구별되는가**(색이 실제로 바뀌는가)
  글자가 있는지가 아니라 **자리와 크기와 색**을 잰다. jsdom은 셋 다 모른다.

실행: python ai-loop/check_ledger_status.py   (--shoot 로 화면 캡처)
"""
import sys
import json
import pathlib

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "shots"
SHOOT = "--shoot" in sys.argv

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다 — pip install playwright && playwright install chromium")
    sys.exit(1)

PASS, FAIL = [], []


def ok(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✓ " if cond else "  ✗ ") + name + (("  → " + str(extra)) if not cond and extra else ""))


# ⚠ 서버가 실제로 주는 모양 그대로(handleList의 select 목록). 여기서 이름을 바꾸면
#   이 검사는 화면이 아니라 픽스처를 재게 된다.
SHARES = [
    {"id": "a1", "quote_no": "Q260909-01", "created_at": "2026-09-09T01:00:00Z",
     "issued_by": "송주연", "customer_label": "김보균", "customer_tel": "010-1234-5678",
     "status": "issued", "status_by": None, "status_at": None, "dest": "방콕",
     "org": "오투디자인그룹", "cn": "김보균", "iso": "2026-09-09", "pax": "12",
     "total": "7668000", "per": "639000", "vendor_quote_no": "HN-2609-0417"},
    {"id": "a2", "quote_no": "Q260901-01", "created_at": "2026-09-01T02:00:00Z",
     "issued_by": "박재규", "customer_label": "한국생산성본부", "customer_tel": "02)123-4567",
     "status": "won", "status_by": "박재규", "status_at": "2026-09-02T00:00:00Z",
     "dest": "오사카", "org": "한국생산성본부", "cn": "이현주", "iso": "2026-09-01",
     "pax": "8", "total": "9000000", "per": "1125000", "vendor_quote_no": None},
]

LOGIN = """
() => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-ledger'));
  try { currentTab = 'ledger'; } catch (e) {}
}
"""

# 🔴 「보이는가·같은 줄인가·잘리지 않는가」를 레이아웃으로 판정한다
SHAPE = r"""
() => {
  const tr  = document.querySelector('#ledList tbody tr');
  if (!tr) return { err: '표가 안 그려졌다' };
  const sel = tr.querySelector('.led-st');
  const btn = tr.querySelector('.led-st-save');
  if (!sel || !btn) return { err: '드롭다운/저장 버튼을 못 찾았다' };
  const rs = sel.getBoundingClientRect(), rb = btn.getBoundingClientRect();
  const main = document.querySelector('.dash-main') || document.body;
  const rm = main.getBoundingClientRect();
  const tbl = document.querySelector('#ledList table');
  const rt = tbl.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  /* 🔴 마지막 열의 버튼들에 **닿을 수 있는가.** 「화면 안에 있는가」로만 재면
     가로로 구르는 표를 잘렸다고 오판한다 — 반대로 넘치는 것만 보고 넘어가면
     `overflow-x:hidden`에 잘린 것을 못 본다. 그래서 **둘을 갈라서** 잰다. */
  const box  = document.getElementById('ledList');
  const bs   = getComputedStyle(box);
  const scrollable = (bs.overflowX === 'auto' || bs.overflowX === 'scroll')
                     && box.scrollWidth > box.clientWidth + 1;
  const last = [...document.querySelectorAll('#ledList tbody tr td:last-child button')];
  const over = last.filter(b => b.getBoundingClientRect().right > rm.right + 0.5).length;
  const cut  = scrollable ? 0 : over;   /* 구를 수 있으면 잘린 것이 아니다 */
  return {
    btnW: Math.round(rb.width), btnH: Math.round(rb.height),
    /* 「바로 옆」 = 같은 줄. 위아래로 접히면 이 차이가 커진다 */
    sameRow: Math.abs(rb.top - rs.top) < 10,
    rightOfSelect: rb.left >= rs.right - 1,
    gap: Math.round(rb.left - rs.right),
    disabled: btn.disabled,
    bg: cs.backgroundColor, fg: cs.color, label: btn.textContent.trim(),
    selBg: getComputedStyle(sel).backgroundColor,
    dirty: sel.classList.contains('is-dirty'),
    /* 표가 오른쪽으로 새는가 */
    tableRight: Math.round(rt.right), mainRight: Math.round(rm.right),
    cutButtons: cut, overflowButtons: over, scrollable,
    /* 정말 끝까지 굴러가는가 — 구른 뒤 마지막 버튼이 화면 안으로 들어오는가 */
    reachable: (() => {
      if (!last.length) return true;
      const keep = box.scrollLeft;
      box.scrollLeft = box.scrollWidth;
      const r = last[last.length - 1].getBoundingClientRect().right <= rm.right + 0.5;
      box.scrollLeft = keep;
      return r;
    })(),
    byShown: (() => { const l = tr.querySelector('.led-st-by'); return !!l && l.getBoundingClientRect().height > 0; })(),
    byText: (tr.querySelector('.led-st-by') || {}).textContent || '',
  };
}
"""


# 🔴 **`page.route`로는 못 가로챈다.** `file://`에서 `location.origin`이 `null`이라
#   `fetch('/api/…')`가 `file:///api/…`가 되고, 크로미움은 그 요청을 아예 안 보낸다
#   (라우트에 걸리기 전에 죽는다 — 실제로 「표가 안 그려졌다」로 두 번 나왔다).
#   그래서 `_browser_fixtures`와 같은 방식으로 **페이지 스크립트보다 먼저 fetch를 간다.**
# ⚠ 바깥을 괄호로 감싼다 — `(p)=>{…}(값)`은 JS 문법 오류다(그 파일이 겪은 함정).
_STUB = """
((data) => {
  window.fetch = (u, o) => {
    const url = String((u && u.url) || u || '');
    const send = (obj) => Promise.resolve(new Response(JSON.stringify(obj),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (url.includes('action=list')) return send(data.list);
    if (url.includes('action=status')) return send(data.status);
    return send({});
  };
})
"""


def arm(page):
    page.add_init_script(_STUB.strip() + "(" + json.dumps({
        "list": {"shares": SHARES, "capped": False, "max": 500},
        "status": {"ok": True, "status": "won", "by": "최현욱", "at": "2026-09-09T05:00:00Z"},
    }, ensure_ascii=False) + ")")


def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        # 🔴 **좁은 쪽에서 먼저 잰다.** 잘림은 넓은 화면에서 절대 안 보인다.
        for wname, w in [("작은 노트북 1024", 1024), ("사무실 1440", 1440)]:
            print(f"\n[{wname}]")
            ctx = b.new_context(viewport={"width": w, "height": 1000})
            pg = ctx.new_page()
            arm(pg)
            pg.goto((ROOT / "admin.html").as_uri(), wait_until="domcontentloaded")
            pg.wait_for_timeout(1800)
            pg.evaluate(LOGIN)
            pg.evaluate("() => renderLedger()")
            pg.wait_for_timeout(600)

            s = pg.evaluate(SHAPE)
            if s.get("err"):
                ok("화면을 띄웠다", False, s["err"])
                ctx.close()
                continue

            ok("① 저장 버튼이 실제로 보인다", s["btnW"] > 0 and s["btnH"] > 0, s)
            ok("① 드롭다운과 같은 줄이다 (「바로 옆에」)", s["sameRow"], f"top 차이 큼 / gap {s['gap']}px")
            ok("① 드롭다운 오른쪽이다", s["rightOfSelect"], s["gap"])
            # 24px 미만은 WCAG 2.5.8 AA 오류다 — `_screen_probe.py`와 같은 문턱
            ok("① 누를 만한 크기다 (≥24px)", s["btnH"] >= 24, f"{s['btnW']}×{s['btnH']}")
            ok("① 처음에는 꺼져 있다", s["disabled"] is True, s["label"])

            # 🔴 ② 잘림 — 칸을 넓혔으니 반드시 잰다
            # 🔴 표는 넘칠 수 있다. 문제는 **넘친 것이 사라지는가**다.
            ok("② 🔴 마지막 열이 소리 없이 잘리지 않는다", s["cutButtons"] == 0,
               f"{s['cutButtons']}개가 잘렸다 (표 {s['tableRight']} > 화면 {s['mainRight']}, "
               f"가로로 구르지 않는다)")
            ok("② 🔴 넘치면 가로로 굴러 닿는다", s["reachable"],
               f"넘친 버튼 {s['overflowButtons']}개 · 구름 {s['scrollable']}")

            # ③ 꺼짐 → 켜짐
            off_bg = s["bg"]
            pg.evaluate("""() => {
              const sel = document.querySelector('#ledList .led-st');
              sel.value = 'won';
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }""")
            pg.wait_for_timeout(200)
            s2 = pg.evaluate(SHAPE)
            ok("③ 고르면 버튼이 켜진다", s2["disabled"] is False)
            ok("③ 🔴 켜진 것이 색으로 보인다", s2["bg"] != off_bg, f"{off_bg} → {s2['bg']}")
            ok("③ 드롭다운도 「아직」이라고 말한다", s2["dirty"], s2["selBg"])
            ok("③ 아직 「바꾼 사람」은 안 생긴다", not s2["byShown"], s2["byText"])
            ok("③ 켜져도 같은 줄에 그대로 있다", s2["sameRow"] and s2["btnH"] >= 24,
               f"{s2['btnW']}×{s2['btnH']}")

            # ③ 저장
            pg.evaluate("() => document.querySelector('#ledList .led-st-save').click()")
            pg.wait_for_timeout(400)
            s3 = pg.evaluate(SHAPE)
            ok("③ 저장하면 「저장됨」이 된다", s3["label"] == "저장됨", s3["label"])
            ok("③ 🔴 그때 「바꾼 사람」이 생긴다", s3["byShown"] and "최현욱" in s3["byText"], s3["byText"])
            ok("③ 「아직」 색은 걷힌다", not s3["dirty"], s3["selBg"])
            ok("③ 버튼은 다시 꺼진다", s3["disabled"] is True)
            ok("③ 저장 뒤에도 잘리지 않는다", s3["cutButtons"] == 0, f"{s3['cutButtons']}개")

            if SHOOT:
                SHOTS.mkdir(parents=True, exist_ok=True)
                pg.screenshot(path=str(SHOTS / f"ledger_status_{w}.png"), full_page=True)
                print(f"  · 캡처: ai-loop/shots/ledger_status_{w}.png")
            ctx.close()
        b.close()


run()
print("\n" + "─" * 64)
print(f"결과: {len(PASS)} pass / {len(FAIL)} fail  — ZY 대장 상태 저장 버튼 (브라우저)")
sys.exit(1 if FAIL else 0)

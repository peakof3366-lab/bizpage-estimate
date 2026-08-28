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

SMALL_TEXT_FAIL = 10.0    # 이 아래 글자는 오류
SMALL_TEXT_WARN = 12.0    # 이 아래는 확인 대상
TAP_FAIL = 24             # WCAG 2.5.8 AA
TAP_WARN = 44             # WCAG 2.5.5 AAA · Apple HIG
CLIP_SLOP = 4             # 브라우저 반올림 — 이 이하 잘림은 안 센다

# ── 화면 한 장에서 잴 것을 전부 모은다 ──────────────────────────────────────
# 판정은 파이썬에서 한다. 여기서는 '무엇이 어떤 상태인가'만 모은다
# (check_contrast.py와 같은 나눔 — 브라우저 안에서 판정하면 규칙이 두 곳이 된다).
SWEEP = r"""
(opt) => {
  const CLIP_SLOP = opt.clipSlop;
  const out = { doc: {}, clipped: [], small: [], taps: [], outside: [] };

  const vw = window.innerWidth;
  const de = document.documentElement;
  out.doc = {
    scrollW: Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0),
    innerW: vw,
  };

  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    if (parseFloat(cs.opacity) === 0) return null;
    /* 조상이 감췄는지 — aria-hidden과 hidden 속성은 낭독기·화면 양쪽에서 없는 것이다 */
    for (let p = el; p; p = p.parentElement) {
      if (p.getAttribute && (p.getAttribute('aria-hidden') === 'true' || p.hasAttribute('hidden'))) return null;
    }
    return { r, cs };
  };

  const path = (el) => {
    const bits = [];
    for (let p = el; p && p.nodeType === 1 && bits.length < 3; p = p.parentElement) {
      let s = p.tagName.toLowerCase();
      if (p.id) { bits.unshift(s + '#' + p.id); break; }
      if (p.className && typeof p.className === 'string') {
        const c = p.className.trim().split(/\s+/).filter(Boolean)[0];
        if (c) s += '.' + c;
      }
      bits.unshift(s);
    }
    return bits.join(' > ');
  };

  const label = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46);

  /* 스스로 옆으로 굴리는 칸 안쪽인가 — 표를 미는 것은 설계다 */
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  /* ── ① 화면 전체를 넓히는 범인 ── */
  out.widest = [];
  if (out.doc.scrollW > vw + 1) {
    document.querySelectorAll('*').forEach((el) => {
      const v = shown(el); if (!v) return;
      if (inScroller(el)) return;
      const right = v.r.left + v.r.width;
      if (right > vw + 1) {
        out.widest.push({ sel: path(el), text: label(el), right: Math.round(right), w: Math.round(v.r.width) });
      }
    });
    /* 가장 바깥쪽(=진짜 범인)만 남긴다. 자식까지 다 적으면 목록이 수백 줄이 된다 */
    out.widest = out.widest.filter((a, i, arr) =>
      !arr.some((b, j) => j !== i && b.sel !== a.sel && a.sel.startsWith(b.sel + ' >')));
    out.widest.sort((a, b) => b.right - a.right);
    out.widest = out.widest.slice(0, 6);
  }

  /* ── ②③ 글자: 잘림 · 크기 ── */
  const TEXTY = 'p,span,div,li,td,th,h1,h2,h3,h4,h5,h6,a,button,label,strong,em,small,dt,dd,figcaption';
  document.querySelectorAll(TEXTY).forEach((el) => {
    /* 자기 글자를 직접 가진 것만 — 감싸는 div까지 세면 같은 글을 열 번 센다 */
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
    if (!own) return;
    const v = shown(el); if (!v) return;
    const txt = label(el); if (!txt) return;

    const fs = parseFloat(v.cs.fontSize);
    if (fs && fs < opt.smallWarn) {
      out.small.push({ sel: path(el), text: txt, px: Math.round(fs * 10) / 10 });
    }

    const ox = v.cs.overflowX, oy = v.cs.overflowY;
    const hidesX = ox === 'hidden' || ox === 'clip' || v.cs.textOverflow === 'ellipsis';
    const hidesY = oy === 'hidden' || oy === 'clip';
    if (hidesX && el.scrollWidth - el.clientWidth > CLIP_SLOP) {
      out.clipped.push({ sel: path(el), text: txt, dir: '가로', lost: el.scrollWidth - el.clientWidth });
    } else if (hidesY && el.scrollHeight - el.clientHeight > CLIP_SLOP) {
      out.clipped.push({ sel: path(el), text: txt, dir: '세로', lost: el.scrollHeight - el.clientHeight });
    }
  });

  /* ── ④⑤ 누를 수 있는 것 ── */
  const TAPPY = 'a[href],button,input,select,textarea,[role=button],[onclick],summary';
  document.querySelectorAll(TAPPY).forEach((el) => {
    const v = shown(el); if (!v) return;
    if (el.disabled) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && ['hidden'].includes(el.type)) return;

    /* 문단 안의 글자 링크는 버튼이 아니다 — 44px 규칙을 들이대면 없는 결함이 생긴다 */
    const p = el.parentElement;
    const inlineLink = tag === 'a' && p && /^(P|LI|TD|SPAN|SMALL|EM|STRONG|DD)$/.test(p.tagName)
      && getComputedStyle(el).display === 'inline';
    if (!inlineLink) {
      const w = Math.round(v.r.width), h = Math.round(v.r.height);
      if (Math.min(w, h) < opt.tapWarn) {
        out.taps.push({ sel: path(el), text: label(el) || (el.getAttribute('aria-label') || ''), w: w, h: h });
      }
    }

    /* 🔴 **스스로 옆으로 굴리는 칸 안쪽은 「밖으로 나갔다」가 아니다.**
       처음 돌렸을 때 견적서의 「5·6·7일차」 탭을 결함으로 잡았는데, 그 줄은
       `.day-tabs { overflow-x:auto }` — **밀어서 보라고 만든 것**이었다.
       ①(화면이 통째로 밀린다)에서는 이미 걸러 놓고 여기서만 안 걸렀다. */
    if (!inScroller(el) && (v.r.left < -2 || v.r.left + v.r.width > vw + 2)) {
      out.outside.push({ sel: path(el), text: label(el), left: Math.round(v.r.left), right: Math.round(v.r.left + v.r.width) });
    }
  });

  return out;
}
"""

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

                r = pg.evaluate(SWEEP, {
                    "clipSlop": CLIP_SLOP, "smallWarn": SMALL_TEXT_WARN, "tapWarn": TAP_WARN,
                })
                counted += 1

                over = r["doc"]["scrollW"] - r["doc"]["innerW"]
                if over > 1:
                    who = "; ".join(f"{x['sel']}({x['right']}px)" for x in r.get("widest", [])[:3]) or "범인 못 찾음"
                    findings.append(("🔴", wname, label, "가로로 밀린다",
                                     f"문서 {r['doc']['scrollW']}px > 화면 {r['doc']['innerW']}px (+{over}) — {who}"))

                for c in r["clipped"]:
                    findings.append(("🔴", wname, label, "글자가 잘렸다",
                                     f"{c['dir']} {c['lost']}px · 「{c['text']}」 [{c['sel']}]"))

                for s in r["small"]:
                    sev = "🔴" if s["px"] < SMALL_TEXT_FAIL else "·"
                    findings.append((sev, wname, label, "글자가 작다",
                                     f"{s['px']}px · 「{s['text']}」 [{s['sel']}]"))

                for t in r["taps"]:
                    sev = "🔴" if min(t["w"], t["h"]) < TAP_FAIL else "·"
                    findings.append((sev, wname, label, "누르기 작다",
                                     f"{t['w']}×{t['h']}px · 「{t['text']}」 [{t['sel']}]"))

                for o in r["outside"]:
                    findings.append(("🔴", wname, label, "화면 밖으로 나갔다",
                                     f"{o['left']}~{o['right']}px · 「{o['text']}」 [{o['sel']}]"))

                if SHOOT and (over > 1 or r["clipped"] or r["outside"]):
                    SHOTS.mkdir(parents=True, exist_ok=True)
                    pg.screenshot(path=str(SHOTS / f"{fname}_{w}.png"), full_page=True)
                ctx.close()
        b.close()

    # ── 보고 ────────────────────────────────────────────────────────────
    errs = [f for f in findings if f[0] == "🔴"]
    warns = [f for f in findings if f[0] != "🔴"]

    def show(group, title):
        """🔴 **같은 자리를 폭마다 다시 세지 않는다.**
        처음 돌렸을 때 확인 대상이 715건으로 찍혔는데 실제 자리는 그 1/4이었다 —
        폭 4가지에서 같은 요소를 네 번 센 것이다. 숫자가 커지면 사람은 그 목록을
        **안 읽는다**(결정대기열 요약표를 걷어낸 것과 같은 이유).
        → 자리 하나가 한 줄이고, 어느 폭에서 걸렸는지를 뒤에 붙인다."""
        if not group:
            return
        print(f"\n{title}")
        seen = {}
        for sev, wname, label, kind, msg in group:
            seen.setdefault((label, kind), {}).setdefault(msg, []).append(wname)
        for (label, kind), rows in seen.items():
            print(f"\n  ■ {label} — {kind} (자리 {len(rows)}곳)")
            for i, (msg, widths) in enumerate(rows.items()):
                if not SHOW_ALL and i >= 8:
                    print(f"     … 그리고 {len(rows) - 8}곳 더 (--all 로 전부)")
                    break
                where = "폭 전부" if len(widths) == len(WIDTHS) else "·".join(widths)
                print(f"     {msg}  [{where}]")

    print("=" * 74)
    print("고객이 손에 쥐는 화면 — 진짜 브라우저로, 폰 폭부터")
    print("=" * 74)
    print(f"훑은 것: 화면 {len(PAGES) if not ONLY else 1}종 × 폭 {len(WIDTHS)}가지 = {counted}회")

    show(errs, "🔴 오류 — 고객이 못 읽거나 못 누른다")
    show(warns, "⚠ 확인 대상 — 오류가 아니다. 사람이 보고 정한다")

    print("\n" + "-" * 74)
    uniq = lambda g: len({(f[2], f[3], f[4]) for f in g})
    print(f"합계: 🔴 자리 {uniq(errs)}곳 · ⚠ 자리 {uniq(warns)}곳"
          f"  (폭까지 세면 {len(errs)} · {len(warns)})")
    if not errs:
        print("✓ 고객 화면에서 밀림·잘림·화면 밖 조작 없음")
    return 1 if errs else 0


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

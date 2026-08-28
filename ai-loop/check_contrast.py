# -*- coding: utf-8 -*-
"""화면에 **있는데 읽을 수 없는 글자**를 전 화면에서 찾는다 — 실제 브라우저로 잰다.

    python ai-loop/check_contrast.py            검사만
    python ai-loop/check_contrast.py --shots    문제가 난 자리를 스크린샷으로 저장
    python ai-loop/check_contrast.py --all      확인 대상(3.0~4.5)까지 전부 출력

왜 이 도구가 생겼나 — 같은 결과를 내는 사고가 **서로 다른 원인으로 두 번** 났다:

  ① 방식 A·B 편집 칸이 "이 목적지에서는 안 쓰이는 칸"이라는 신호로 칸 **전체에**
     `opacity:.55`를 걸고 있었다. 신호는 맞았는데 담당자가 써 넣은 글까지 흐려져
     읽을 수가 없었다. 사용자가 "글자가 회색으로 보인다"고 지적했다.
  ② 미리보기의 편집 손잡이가 focus에 `background:#fff`를 칠했다. 고칠 수 있는 자리
     중에는 **검은 박스 위의 흰 글자**가 있었고(견적서 기대 효과 문구·일자 제목),
     흰 배경을 칠하니 흰 글자가 묻혀 **빈 칸으로 보였다.**

원인은 달랐지만(흐리게 vs 덮어쓰기) 결과는 같다 — **글자가 거기 있는데 안 읽힌다.**
그리고 둘 다 회귀 스위트가 못 잡았다: jsdom은 색을 계산하지 않는다. 눈으로만 잡히는
결함이라 사람이 그 화면을 그 상태로 열어 봐야 알 수 있었고, 실제로 둘 다 사용자가 먼저
발견했다. 그래서 브라우저로 전 화면을 훑는다.

무엇을 어떻게 재는가 — 눈에 보이는 결과를 그대로 계산한다:
  · 글자색과 **실제로 뒤에 보이는 배경**을 찾는다(투명하면 조상으로 계속 올라간다).
  · 조상에 걸린 `opacity`를 전부 곱해 반영한다. 이게 ①을 잡는 부분이다 —
    배경이 opacity 묶음 **안**에 있으면 글자와 배경이 함께 바탕색 쪽으로 섞이고,
    **밖**에 있으면 글자만 섞인다. 둘을 구분해서 합성한다.
  · WCAG 대비비를 낸다. 큰 글자(24px 이상, 또는 굵은 18.66px 이상)는 기준을 낮춘다.

  ✗ 오류      대비 3.0 미만 — 사실상 못 읽는다. 종료 코드 1.
  · 확인 대상  3.0~4.5 — 읽히긴 하지만 흐리다. 판단이 필요하다(exit code에 반영 안 함).

⚠ 회귀 스위트에 넣지 않는다 — 브라우저 설치가 필요해서다(check_editor_layout.py와 같은 이유).
⚠ 서버에 아무것도 안 남긴다. file://로 열고 /api/* 를 전부 막는다.
⚠ **배경 이미지 위의 글자는 계산하지 않고 따로 모아 보고한다** — 픽셀마다 배경이 달라
   숫자 하나로 말할 수 없다. 조용히 통과시키면 그게 이 도구의 거짓말이 된다.
"""
import sys
import re
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright가 없습니다:  pip install playwright && playwright install chromium")
    sys.exit(1)

# 화면을 띄우고 **띄웠는지 확인하는** 규칙은 `_browser_fixtures.py` 하나가 진실이다 (YA).
from _browser_fixtures import (load_share, missing_share_help, arm,  # noqa: E402
                               open_quote, assert_loaded)

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "ai-loop" / "tmp_shots"
sys.stdout.reconfigure(encoding="utf-8")

SHOOT = "--shots" in sys.argv
SHOW_ALL = "--all" in sys.argv

FAIL_AT = 3.0     # 이 아래는 오류
WARN_AT = 4.5     # 이 아래는 확인 대상

# ── 페이지에서 글자와 그 뒤 배경 사슬을 모은다 ────────────────────────────────
# 색 합성과 대비 계산은 파이썬에서 한다 — 여기서는 '무엇이 걸려 있는가'만 모은다.
SWEEP = r"""
(opt) => {
  const doc = opt.frame
    ? document.getElementById(opt.frame).contentDocument
    : document;
  if (!doc) return { error: 'frame 없음' };
  const out = [];
  const seen = new Set();

  const ownText = (el) => {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, ' ').trim();
  };

  doc.querySelectorAll('body *').forEach((el) => {
    const text = ownText(el);
    if (!text) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;

    /* 조상 사슬 — 색·투명도·배경 이미지를 위로 올라가며 모은다 */
    const chain = [];
    let node = el, hidden = false;
    for (let i = 0; node && i < 14; i++) {
      const s = getComputedStyle(node);
      if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break; }
      chain.push({
        tag: node.tagName,
        cls: (node.className || '').toString().slice(0, 60),
        bg: s.backgroundColor,
        img: s.backgroundImage && s.backgroundImage !== 'none',
        op: parseFloat(s.opacity),
      });
      node = node.parentElement;
    }
    if (hidden) return;

    /* ⚠ 투명도가 0이면 **아직 안 나타난 것**이지 안 읽히는 것이 아니다.
       이 사이트는 스크롤 등장 애니메이션(.reveal → .reveal.in)을 쓰고, 토스트·툴팁도
       opacity:0으로 숨겨 둔다. 그걸 세면 랜딩 한 장에서만 오탐이 136건 나온다 —
       그러면 아무도 이 도구를 안 본다. 등장은 아래에서 미리 끝내 두고, 그래도 0인 것은
       '지금 화면에 없는 것'으로 보고 셈에서 뺀다. */
    let alpha = 1;
    for (const c of chain) alpha *= c.op;
    if (alpha <= 0.001) return;

    const key = el.tagName + '|' + (el.className || '') + '|' + text.slice(0, 30)
              + '|' + cs.color + '|' + cs.fontSize;
    if (seen.has(key)) return;         /* 같은 모양이 반복되면 한 번만 본다 */
    seen.add(key);

    /* 비활성(disabled) 컨트롤은 관례적으로 흐리다 — "지금 누를 수 없다"는 표시이고
       WCAG도 예외로 둔다. 다만 조용히 빼지 않고 몇 건인지 적는다. */
    const disabled = !!(el.closest('[disabled],[aria-disabled="true"],:disabled'));

    out.push({
      disabled,
      text: text.slice(0, 48),
      sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''),
      color: cs.color,
      size: parseFloat(cs.fontSize),
      weight: parseInt(cs.fontWeight, 10) || 400,
      chain,
    });
  });
  return { items: out, bodyBg: getComputedStyle(doc.body).backgroundColor,
           htmlBg: getComputedStyle(doc.documentElement).backgroundColor };
}
"""


# ── 색 계산 ────────────────────────────────────────────────────────────────
def parse_rgb(s):
    """'rgb(1, 2, 3)' / 'rgba(1,2,3,.5)' → (r, g, b, a). 못 읽으면 None."""
    if not s:
        return None
    m = re.findall(r"[-\d.]+", s)
    if len(m) < 3:
        return None
    a = float(m[3]) if len(m) > 3 else 1.0
    return (float(m[0]), float(m[1]), float(m[2]), a)


def over(fg, bg, alpha=None):
    """fg를 bg 위에 alpha로 올린 결과 색(불투명)."""
    a = fg[3] if alpha is None else alpha
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def lum(c):
    def f(v):
        v = max(0.0, min(255.0, v)) / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


WHITE = (255.0, 255.0, 255.0, 1.0)


def resolve(item, page_bg):
    """글자가 **실제로 눈에 보이는** 색과 그 뒤 배경을 낸다.

    핵심은 opacity가 걸린 위치다:
      · 배경을 대는 요소가 opacity 묶음 **안**에 있으면 → 글자와 배경이 함께 바탕으로 섞인다
        (①번 사고. 칸 전체에 opacity를 걸면 글자만이 아니라 칸 배경도 같이 흐려진다.)
      · 묶음 **밖**에 있으면 → 글자만 섞인다.
    """
    chain = item["chain"]
    fg = parse_rgb(item["color"])
    if not fg:
        return None

    # ① 배경을 대는 요소(B) 찾기 — 반투명 배경은 위로 올라가며 겹쳐 쌓는다
    bg = None
    b_idx = None
    img_at = None
    for i, node in enumerate(chain):
        c = parse_rgb(node["bg"])
        if node["img"] and img_at is None:
            img_at = i
        if c and c[3] > 0:
            bg = c if bg is None else over(bg, c)      # 아래 층 위에 얹는다
            if bg[3] >= 0.999 or c[3] >= 0.999:
                b_idx = i
                break
    if bg is None:
        bg, b_idx = page_bg, len(chain) - 1
    if bg[3] < 0.999:
        bg = over(bg, page_bg)
        b_idx = len(chain) - 1

    # ② 글자와 배경 사이(B 미만)에 걸린 opacity — 글자만 흐려진다
    a_rel = 1.0
    for node in chain[:b_idx]:
        a_rel *= node["op"]

    # ③ B와 그 위에 걸린 opacity — 글자와 배경이 **함께** 바탕으로 섞인다
    a_above = 1.0
    for node in chain[b_idx:]:
        a_above *= node["op"]

    # ④ B보다 위쪽에서 실제로 비치는 바탕색
    backdrop = page_bg
    for node in chain[b_idx + 1:]:
        c = parse_rgb(node["bg"])
        if c and c[3] >= 0.999:
            backdrop = c
            break

    fg_on_bg = over(fg, bg, fg[3] * a_rel)
    fg_final = over(fg_on_bg, backdrop, a_above)
    bg_final = over(bg, backdrop, a_above)
    return {
        "ratio": contrast(fg_final, bg_final),
        "fg": fg_final, "bg": bg_final,
        "a_rel": a_rel, "a_above": a_above,
        "img": img_at is not None and (img_at <= b_idx),
        "bg_from": chain[b_idx]["tag"] + ('.' + chain[b_idx]["cls"].split()[0] if chain[b_idx]["cls"] else ''),
    }


def need(item):
    """큰 글자는 기준이 낮다 (WCAG: 24px 이상, 또는 굵은 18.66px 이상)."""
    big = item["size"] >= 24 or (item["size"] >= 18.66 and item["weight"] >= 700)
    return (2.5, 3.0) if big else (FAIL_AT, WARN_AT)


def hexs(c):
    return "#%02X%02X%02X" % (round(c[0]), round(c[1]), round(c[2]))


# ── 화면 세우기 ────────────────────────────────────────────────────────────
STEP1 = r"""
() => {
  const set = (id, v) => { const el = document.getElementById(id); if (!el) return;
    el.value = v; el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true})); };
  set('destination', '도쿄');
  set('startDate', '2026-10-12'); set('endDate', '2026-10-18');
  set('participants', '20');
  ['programType','organizationType','departureCity'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const o = Array.from(el.options).find(x => x.value);
    if (o) { el.value = o.value; el.dispatchEvent(new Event('change', {bubbles:true})); }
  });
}
"""

ADMIN_LOGIN = r"""
() => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
}
"""

ADMIN_TAB = r"""
(id) => {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
  try { currentTab = id.replace('tab-',''); } catch (e) {}
  return !!document.getElementById(id);
}
"""

# 미리보기를 세운다. 코스 유무·설명 토글·포커스 상태를 바꿔 가며 본다 —
# ②번 사고가 정확히 '포커스를 준 순간'에만 나타났다.
PV_SETUP = r"""
(opt) => {
  itiState.destKey = '도쿄';
  itiState.loaded = true;
  itiState.courses = opt.courses ? COURSES_UT : [];
  recState.rec = REC_UT;
  itiRenderBody(); recRenderBody();
  document.getElementById('recPvExplain').checked = !!opt.explain;
  document.getElementById('rec-preview').click();
  return !document.getElementById('recPvModal').classList.contains('hidden');
}
"""

COURSES_UT = """[
 {title:'코스가 제목', subtitle:'야타이 포장마차와 온천으로 채우는 재충전형 팀 화합 연수',
  highlights:['하이1','하이2','하이3'],
  days:[{day:1,title:'첫날',am:'출국',pm:'체크인',eve:'만찬',tip:'팁'},
        {day:2,title:'가운데',am:'공장',pm:'세미나',eve:'석식',tip:''},
        {day:3,title:'마지막',am:'체크아웃',pm:'탑승',eve:'도착',tip:''}]},
 {title:'코스나 제목', subtitle:'코스나 한 줄', highlights:['나하이1'],
  days:[{day:1,title:'ㄱ',am:'ㄱ오전'},{day:2,title:'ㄴ',am:'ㄴ오전'}]}
]"""
REC_UT = """{a:{tag:'역량강화형',desc:'A 설명',points:['A1','A2'],items:['A활동'],value:'A 기대효과'},
             b:{tag:'화합형',desc:'B 설명',points:['B1'],items:['B활동'],value:'B 기대효과'}}"""


# 등장 애니메이션을 **끝난 상태로** 만든다.
# ⚠ 클래스만 붙이고 재면 전환(transition) 중간값을 재게 된다 — opacity 0.27 같은 값이
#   나와서 "안 읽힌다"고 보고하지만, 0.4초 뒤면 멀쩡하다. 그래서 전환·애니메이션 자체를
#   꺼서 **최종 상태**를 재게 한다. 이 도구가 봐야 하는 것은 '머무는 상태'다.
REVEAL = r"""
() => {
  const st = document.createElement('style');
  st.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(st);
  document.querySelectorAll('.reveal').forEach(e => e.classList.add('in'));
  return document.querySelectorAll('.reveal').length;
}
"""

# 장식용 글자 — 읽으라고 둔 글이 아니다. 빼되 **조용히 빼지 않는다**(몇 건인지 항상 적는다).
# ⚠ 여기 넣기 전에 화면에서 확인할 것. 읽어야 하는 글을 여기 넣으면 이 도구는 그때부터
#   거짓말을 시작한다 — 그게 이런 목록이 망가지는 유일한 방식이다.
DECORATIVE = {
    "hero-bg-text":   "히어로 배경에 크게 깔린 워터마크 글자(GLOBAL) — 배경 무늬다",
    "svc-step":       "서비스 카드의 01·02·03 큰 숫자 — 순서 장식이고 옆에 제목이 따로 있다",
    "step2-dot-sep":  "점 구분자(·)",
    "t-sep":          "목적지 티커의 점 구분자(·)",
    "dest-ticker":    "흘러가는 목적지 띠 — 배경 장식",
    "testi-quote":    "후기 카드의 56px 큰따옴표 글리프 — 읽는 글자가 아니라 장식이다",
}


# 사람이 보고 "이대로 간다"고 **판단을 내린** 것. 장식(DECORATIVE)과 다르다 —
# 이쪽은 "읽는 글자인데 흐린 것을 알고도 그대로 두기로 했다"는 기록이다.
# ⚠ 여기 넣을 때는 반드시 **누가 언제 왜** 정했는지 적는다. 이유 없이 쌓이면 이 목록은
#   그냥 '무시 목록'이 되고, 그 순간 이 도구는 아무것도 못 잡는다.
ACCEPTED = {
    # "sel 조각": "2026-00-00 사장님 판단 — 이유",
}


def decorative_reason(sel):
    for key, why in DECORATIVE.items():
        if key in sel:
            return why
    for key, why in ACCEPTED.items():
        if key in sel:
            return "판단 완료 — " + why
    return None


def sweep(page, label, results, frame=None, page_bg=WHITE):
    try:
        page.evaluate(REVEAL)
        page.wait_for_timeout(120)
    except Exception:
        pass
    r = page.evaluate(SWEEP, {"frame": frame})
    if r.get("error"):
        print(f"  ! {label}: {r['error']}")
        return
    bg = parse_rgb(r.get("bodyBg")) or WHITE
    if bg[3] < 0.999:
        bg = over(bg, parse_rgb(r.get("htmlBg")) or WHITE)
    if bg[3] < 0.999:
        bg = WHITE
    for it in r["items"]:
        res = resolve(it, bg)
        if not res:
            continue
        results.append({"where": label, **it, **res, "need": need(it)})


def run():
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        page.route("**/api/**", lambda r: r.abort())

        # ── 고객 화면 ──
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_timeout(1400)
        sweep(page, "고객 · 랜딩", results)

        page.evaluate(STEP1); page.wait_for_timeout(500)
        page.click("#nextStepButton"); page.wait_for_timeout(600)
        page.click("button.button-primary:has-text('견적 확인하기')"); page.wait_for_timeout(1800)
        sweep(page, "고객 · 견적 결과", results)
        page.evaluate("() => { renderStep3(); scrollToStep3(); }")
        page.wait_for_timeout(1200)
        sweep(page, "고객 · 연수 일정 탐색", results)

        # 견적서 문서(팝업) — 고객이 실제로 받아 보는 문서다
        try:
            with ctx.expect_page(timeout=15000) as pop:
                page.evaluate("() => openEstimateWindow()")
            doc = pop.value
            doc.wait_for_timeout(2200)
            sweep(doc, "고객 · 견적서 문서", results)
            doc.close()
        except Exception as e:
            print("  ! 견적서 문서를 못 열었다:", str(e)[:80])

        # ── 🔴 고객이 **카톡으로 받아 여는** 견적서 (YA) ──
        # 위의 「견적서 문서」는 `openEstimateWindow()`가 여는 **인쇄용 팝업**이다.
        # 고객에게 실제로 가는 것은 `estimate-view.html?id=…` 주소 한 줄이고,
        # 그건 **다른 문서**인데 이 도구가 한 번도 안 보고 있었다.
        # 처음 보자마자 나온 것: 상단 브랜드가 **검정 바탕 위 검정 글자(1.02:1)**였다
        # — 인라인 `color:inherit`가 클래스의 `#fff`를 이기고 있었다.
        share = load_share()
        if share is None:
            print(missing_share_help())
        else:
            qp = ctx.new_page()
            arm(qp, share)          # ⚠ 반드시 goto 전에
            qp.route("**/api/**", lambda r: r.abort())
            open_quote(qp, share, "?id=contrast")
            why = assert_loaded(qp, share)
            if why:
                # 🔴 조용히 넘어가면 **오류 화면을 재고 「깨끗하다」고 말하게 된다.**
                print("  ! 견적서 화면을 못 띄웠다 —", why)
            else:
                sweep(qp, "고객 · 카톡으로 받는 견적서", results)
            qp.close()

        # ── 매뉴얼 · 담당자용 견적 도구 ──
        for fname, label in (("packages.html", "고객 · 패키지 목록"),
                             ("manual.html", "운영 매뉴얼"), ("admin-quote.html", "담당자 · 내부 견적")):
            pg = ctx.new_page()
            pg.route("**/api/**", lambda r: r.abort())
            pg.goto((ROOT / fname).as_uri())
            pg.wait_for_timeout(1200)
            sweep(pg, label, results)
            pg.close()

        # ── 관리자 화면 — 탭마다 ──
        ap = ctx.new_page()
        ap.route("**/api/**", lambda r: r.abort())
        ap.goto((ROOT / "admin.html").as_uri())
        ap.wait_for_timeout(1400)
        sweep(ap, "관리자 · 로그인", results)
        ap.evaluate(ADMIN_LOGIN)
        ap.wait_for_timeout(300)
        TABS = ["dashboard", "inquiries", "estimates", "estmgr", "pricereport", "rates",
                "content", "itineraries", "quotetool", "stats", "events", "marketing",
                "manual", "settings"]
        for t in TABS:
            if not ap.evaluate(ADMIN_TAB, "tab-" + t):
                continue
            ap.wait_for_timeout(220)
            sweep(ap, "관리자 · " + t, results)

        # ── 미리보기 — 상태를 바꿔 가며 (②번 사고가 난 자리) ──
        ap.evaluate(f"() => {{ window.COURSES_UT = {COURSES_UT}; window.REC_UT = {REC_UT}; }}")
        ap.evaluate(ADMIN_TAB, "tab-itineraries")
        for courses in (True, False):
            for explain in (False, True):
                name = ("코스있음" if courses else "코스없음") + ("·설명" if explain else "")
                if not ap.evaluate(PV_SETUP, {"courses": courses, "explain": explain}):
                    print("  ! 미리보기가 안 열렸다:", name)
                    continue
                ap.wait_for_timeout(700)
                sweep(ap, "미리보기(" + name + ")", results, frame="recPvFrame")
                # 포커스를 준 상태 — 손잡이가 글자를 덮는지 (②)
                ap.evaluate(r"""() => {
                  const d = document.getElementById('recPvFrame').contentDocument;
                  d.querySelectorAll('.pv-edit').forEach(e => e.classList.add('__focus_probe'));
                  const st = d.createElement('style');
                  st.textContent = '.__focus_probe{outline:2px solid #CC001A}';
                  d.head.appendChild(st);
                }""")
                ap.wait_for_timeout(200)
                sweep(ap, "미리보기(" + name + ")·편집중", results, frame="recPvFrame")
                ap.evaluate("() => document.getElementById('recPvClose').click()")
                ap.wait_for_timeout(200)

        if SHOOT:
            SHOTS.mkdir(parents=True, exist_ok=True)
            ap.screenshot(path=str(SHOTS / "contrast_admin.png"), full_page=False)
        b.close()
    return results


def main():
    results = run()
    if not results:
        print("잰 글자가 하나도 없다 — 화면을 못 세운 것이다.")
        sys.exit(1)

    for r in results:
        r["deco"] = decorative_reason(r["sel"])
        if not r["deco"] and r.get("disabled"):
            r["deco"] = "비활성(disabled) 컨트롤 — 못 누른다는 표시로 흐리게 두는 관례"
    deco = [r for r in results if r["deco"] and r["ratio"] < r["need"][1]]
    live = [r for r in results if not r["deco"]]

    bad = [r for r in live if r["ratio"] < r["need"][0] and not r["img"]]
    warn = [r for r in live if r["need"][0] <= r["ratio"] < r["need"][1] and not r["img"]]
    onimg = [r for r in live if r["img"] and r["ratio"] < r["need"][1]]

    by_where = {}
    for r in live:
        by_where.setdefault(r["where"], []).append(r)

    print("═" * 78)
    print("글자 대비 점검 — 화면에 있는데 읽을 수 없는 글자가 있는가")
    print("═" * 78)
    for where, rows in by_where.items():
        nb = len([x for x in rows if x["ratio"] < x["need"][0] and not x["img"]])
        nw = len([x for x in rows if x["need"][0] <= x["ratio"] < x["need"][1] and not x["img"]])
        mark = "✗" if nb else ("·" if nw else "✓")
        note = ""
        if nb:
            note += f" — 오류 {nb}건"
        if nw:
            note += f" · 확인 대상 {nw}건"
        print(f"  {mark} {where:<28} 글자 {len(rows):>4}곳{note}")

    def show(rows, title):
        print("\n" + title)
        for r in sorted(rows, key=lambda x: x["ratio"])[:200]:
            dim = ""
            if r["a_rel"] < 0.999:
                dim += f" · 글자에 opacity {r['a_rel']:.2f}"
            if r["a_above"] < 0.999:
                dim += f" · 칸 전체에 opacity {r['a_above']:.2f}"
            print(f"  {r['ratio']:>5.2f}:1  [{r['where']}] {r['sel'][:52]}")
            print(f"           글자 {hexs(r['fg'])} / 배경 {hexs(r['bg'])} ({r['bg_from']}){dim}")
            print(f"           “{r['text']}”")

    if bad:
        show(bad, f"✗ 오류 {len(bad)}건 — 사실상 못 읽는다 (대비 {FAIL_AT} 미만)")
    if warn and (SHOW_ALL or not bad):
        show(warn, f"· 확인 대상 {len(warn)}건 — 읽히긴 하지만 흐리다 (사람이 판단할 것)")
    elif warn:
        print(f"\n· 확인 대상 {len(warn)}건 (--all 로 보기)")
    if onimg:
        print(f"\n· 배경 이미지 위의 글자 {len(onimg)}건 — 숫자로 판단할 수 없어 눈으로 봐야 한다")
        for r in sorted(onimg, key=lambda x: x["ratio"])[:8]:
            print(f"    [{r['where']}] {r['sel'][:50]} — “{r['text'][:30]}”")

    if deco:
        kinds = {}
        for r in deco:
            kinds.setdefault(r["deco"], 0)
            kinds[r["deco"]] += 1
        print(f"\n· 장식용이라 뺀 것 {len(deco)}건 — 읽으라고 둔 글이 아니다")
        for why, n in sorted(kinds.items(), key=lambda x: -x[1]):
            print(f"    {n:>3}건  {why}")

    print("\n" + "─" * 78)
    print(f"잰 글자 {len(live)}곳 · 화면 {len(by_where)}개")
    if bad:
        print(f"✗ 읽을 수 없는 글자 {len(bad)}건")
        sys.exit(1)
    print("✓ 읽을 수 없는 글자 없음"
          + (f" (확인 대상 {len(warn)}건은 사람이 판단)" if warn else ""))


main()

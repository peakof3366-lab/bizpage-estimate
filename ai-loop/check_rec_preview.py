# -*- coding: utf-8 -*-
"""방식 A·B 미리보기가 **정말 고객 화면과 같은 모양인가** — 실제 브라우저로 대조한다.

    python ai-loop/check_rec_preview.py            검사만
    python ai-loop/check_rec_preview.py --shots    스크린샷도 저장(ai-loop/tmp_shots/)

왜 브라우저가 필요한가: 회귀 스위트(test_rJ_rec_preview.js)는 jsdom이라 **클래스 이름이
같은지**까지만 볼 수 있다. 그런데 미리보기의 존재 이유는 "고객에게 이렇게 보인다"이고,
그건 모양이 실제로 같아야 성립한다. 클래스가 같아도 styles.css가 안 실리면(경로가 틀리거나
iframe이 못 읽으면) 미리보기는 **글자만 있는 흰 화면**이 되고, jsdom은 그걸 통과시킨다.
그건 미리보기가 조용히 거짓말하는 것이다(결함 생성기 ②·③).

그래서 여기서는 두 화면을 나란히 열어 **같은 속성을 재서 비교한다**:
  · 고객 화면 = index.html의 진짜 방식 카드(#planCardA)
  · 미리보기  = admin.html에서 연 iframe 안의 .plan-card
값이 다르면 그 항목을 이름과 함께 찍는다.

무엇을 재는가:
  ① styles.css가 iframe에 실제로 먹었는가 (안 먹으면 전부 기본값이라 여기서 다 걸린다)
  ② 고객 화면과 미리보기의 카드 모양이 같은가 (테두리·여백·글자 크기·색)
  ③ 카드 두 장이 나란히 놓이는가 (grid 2열)
  ④ 미리보기 안에서 가로 넘침이 없는가
  ⑤ 모달이 화면 밖으로 나가지 않는가

⚠ 회귀 스위트에 넣지 않는다 — 브라우저 설치가 필요해서다(check_editor_layout.py와 같은 이유).
   대신 원인이 되는 구조(클래스·스타일시트 링크)는 test_rJ_rec_preview.js가 소스에서 막는다.
⚠ 서버에 아무것도 안 남긴다. file://로 열고 /api/* 를 전부 막는다.
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

# 두 화면에 똑같이 넣을 내용. 값이 같아야 모양 차이만 남는다.
REC = """{
  a: { tag: '역량강화형', desc: '현지 산업 현장을 중심으로 한 실무 밀착 일정입니다.',
       points: ['현지 기업 방문 2회', '전문가 세미나', '팀 프로젝트 발표'],
       items: ['산업 현장 탐방', '전문가 강의'], value: '실무 역량 강화와 벤치마킹 성과' },
  b: { tag: '동기부여·화합형', desc: '팀 결속과 재충전에 무게를 둔 일정입니다.',
       points: ['팀 빌딩 액티비티', '문화 체험'],
       items: ['문화 체험', '팀 액티비티'], value: '조직 결속력 강화와 사기 진작' }
}"""

# ── 고객 화면(index.html): 진짜 방식 카드를 세우고 같은 값을 채운다 ──
CUSTOMER = r"""
() => {
  /* STEP3은 평소 접혀 있다. 모양만 볼 것이라 보이게만 만든다. */
  document.querySelectorAll('.step-section, #step3, [id^="step"]').forEach(el => {
    if (el && el.classList) el.classList.remove('hidden');
    if (el && el.style && getComputedStyle(el).display === 'none') el.style.display = 'block';
  });
  const cards = document.getElementById('planCards');
  if (!cards) return { error: 'planCards가 없다' };
  let p = cards.parentElement;
  while (p && p !== document.body) {
    if (getComputedStyle(p).display === 'none') p.style.display = 'block';
    p.classList.remove('hidden');
    p = p.parentElement;
  }
  _renderPlanCard('a', REC_UNDER_TEST.a);
  _renderPlanCard('b', REC_UNDER_TEST.b);
  return { ok: true };
}
"""

# ── 관리자 화면(admin.html): 로그인을 지나 편집 화면을 세우고 미리보기를 연다 ──
ADMIN = r"""
() => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-itineraries'));
  currentTab = 'itineraries';
  itiState.destKey = '도쿄';
  itiState.loaded = true;
  recState.rec = REC_UNDER_TEST;
  recRenderBody();
  document.getElementById('rec-preview').click();
  return { open: !document.getElementById('recPvModal').classList.contains('hidden') };
}
"""

# 두 화면에서 똑같이 재는 속성. 여기가 다르면 미리보기가 고객 화면과 다르게 보인다는 뜻이다.
PROBE = r"""
(sel) => {
  const root = sel.frame
    ? document.getElementById('recPvFrame').contentDocument
    : document;
  const pick = (el, props) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    props.forEach(p => { out[p] = cs.getPropertyValue(p); });
    return out;
  };
  const card = root.querySelector('.plan-card');
  const grid = root.querySelector('.plan-cards');
  const desc = root.querySelector('.plan-desc');
  const tagA = root.querySelector('.plan-tag-a');
  const li   = root.querySelector('.plan-points li');
  if (!card || !grid || !desc || !tagA || !li) {
    return { error: '카드 조각을 못 찾았다 — ' +
      ['plan-card','plan-cards','plan-desc','plan-tag-a','plan-points li']
        .filter(c => !root.querySelector('.' + c.replace(' li',' li'))).join(', ') };
  }
  const doc = root.documentElement || root.body;
  return {
    card: pick(card, ['border-top-width','border-top-style','border-top-color',
                      'padding-top','padding-left','background-color','border-radius']),
    grid: pick(grid, ['display','grid-template-columns','gap']),
    desc: pick(desc, ['font-size','color','line-height','margin-bottom']),
    tagA: pick(tagA, ['background-color','color','font-size','font-weight','letter-spacing']),
    li:   pick(li,   ['font-size','color','display','gap']),
    cardW: Math.round(card.getBoundingClientRect().width),
    cards: root.querySelectorAll('.plan-card').length,
    overflow: sel.frame
      ? Math.round(root.documentElement.scrollWidth - root.documentElement.clientWidth)
      : 0,
  };
}
"""

WIDTHS = [("데스크톱", 1440), ("노트북", 1280), ("태블릿", 900)]

bad = 0
if SHOOT:
    SHOTS.mkdir(parents=True, exist_ok=True)


def diff(a, b, group):
    """같은 그룹의 속성을 대조해 다른 것만 돌려준다."""
    out = []
    for k in a:
        if a[k] != b.get(k):
            out.append(f"{group}.{k}: 고객 {a[k]!r} ≠ 미리보기 {b.get(k)!r}")
    return out


with sync_playwright() as p:
    browser = p.chromium.launch()
    for label, width in WIDTHS:
        problems = []

        # ── 고객 화면 재기 ──
        cpage = browser.new_page(viewport={"width": width, "height": 1200})
        cpage.route("**/api/**", lambda route: route.abort())
        cpage.goto((ROOT / "index.html").as_uri())
        cpage.wait_for_timeout(500)
        cpage.evaluate(f"() => {{ window.REC_UNDER_TEST = {REC}; }}")
        r = cpage.evaluate(CUSTOMER)
        if r.get("error"):
            print(f"✗ {label} — 고객 화면을 세우지 못했다: {r['error']}")
            bad += 1
            cpage.close()
            continue
        cpage.wait_for_timeout(200)
        cust = cpage.evaluate(PROBE, {"frame": False})
        if SHOOT:
            # ⚠ 페이지 전체가 아니라 **카드만** 찍는다. 페이지를 찍으면 맨 위 히어로가
            #    나와서 미리보기와 나란히 놓고 볼 수가 없다(실제로 그렇게 찍혔었다).
            cpage.locator("#planCards").screenshot(
                path=str(SHOTS / f"recpv_customer_{width}.png"))
        cpage.close()

        # ── 미리보기 재기 ──
        apage = browser.new_page(viewport={"width": width, "height": 1200})
        apage.route("**/api/**", lambda route: route.abort())
        apage.goto((ROOT / "admin.html").as_uri())
        apage.wait_for_timeout(500)
        apage.evaluate(f"() => {{ window.REC_UNDER_TEST = {REC}; }}")
        a = apage.evaluate(ADMIN)
        apage.wait_for_timeout(400)

        # ⑥ 버튼이 **버튼으로 보이는가** — 있기만 해서는 소용이 없다.
        #    처음 붙였을 때 `.iti-btn` 기본 테두리(--border = 8% 검정)를 그대로 써서,
        #    흰 헤더에 빨간 버튼 둘 옆에 놓이니 글자로만 읽혔다. 사용자가 "버튼이 안
        #    보인다"고 해서 알았다. 존재·크기 검사는 전부 통과하고 있었다.
        #    ⚠ 화면을 세운 **뒤에** 잰다 — 로그인 화면 상태에서는 조상이 display:none이라
        #    크기가 0으로 나와 엉뚱한 판단을 하게 된다.
        btn = apage.evaluate(r"""() => {
          const b = document.getElementById('rec-preview');
          if (!b) return { exists: false };
          const cs = getComputedStyle(b);
          const r = b.getBoundingClientRect();
          const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
          const bc = rgb(cs.borderTopColor);      /* [r,g,b] 또는 [r,g,b,a] */
          return {
            exists: true, w: Math.round(r.width), h: Math.round(r.height),
            visible: cs.visibility === 'visible' && cs.display !== 'none' && Number(cs.opacity) > .5,
            borderAlpha: bc.length > 3 ? bc[3] : 1,
            borderColor: cs.borderTopColor, bg: cs.backgroundColor,
            clipped: b.scrollWidth > b.clientWidth + 1,
          };
        }""")
        if not btn.get("exists"):
            problems.append("미리보기 버튼이 없다")
        else:
            if not btn["visible"]:
                problems.append("미리보기 버튼이 화면에 안 보인다")
            if btn["clipped"]:
                problems.append("미리보기 버튼 글자가 잘린다")
            if btn["borderAlpha"] < 0.5:
                problems.append(
                    f"미리보기 버튼 테두리가 너무 흐리다 ({btn['borderColor']}) — "
                    "흰 헤더에서 버튼으로 안 보인다. 구역 강조색(--sec)을 줘야 한다")

        if not a.get("open"):
            print(f"✗ {label} — 미리보기가 열리지 않았다")
            bad += 1
            apage.close()
            continue
        prev = apage.evaluate(PROBE, {"frame": True})
        if SHOOT:
            apage.screenshot(path=str(SHOTS / f"recpv_modal_{width}.png"))
            # 고객 쪽과 나란히 놓고 볼 수 있게 **같은 조각**(카드 그리드)만 따로 찍는다
            apage.frame_locator("#recPvFrame").locator(".plan-cards").screenshot(
                path=str(SHOTS / f"recpv_preview_{width}.png"))

        # ⑤ 모달이 화면 밖으로 나가는가
        modal_over = apage.evaluate(r"""() => {
          const box = document.querySelector('#recPvModal .modal-box');
          if (!box) return -1;
          const r = box.getBoundingClientRect();
          return Math.round(Math.max(0, r.right - window.innerWidth, -r.left, r.bottom - window.innerHeight));
        }""")
        apage.close()

        if cust.get("error") or prev.get("error"):
            print(f"✗ {label} — 잴 수 없었다: 고객={cust.get('error')} / 미리보기={prev.get('error')}")
            bad += 1
            continue

        # ① styles.css가 안 먹으면 여기서 티가 난다 — 카드에 테두리가 없다
        if prev["card"]["border-top-width"] in ("0px", "", "medium"):
            problems.append("미리보기 카드에 테두리가 없다 — styles.css가 iframe에 안 실린 것 같다")

        # ② 고객 화면과 대조
        #    ⚠ grid-template-columns의 **절댓값**은 뺀다. 미리보기는 모달 안에 들어 있어
        #    쓸 수 있는 폭이 구조적으로 좁고, 그건 결함이 아니다. 대신 아래에서
        #    '두 열이 서로 같은가'와 '얼마나 좁은가'를 따로 본다.
        for group in ("card", "grid", "desc", "tagA", "li"):
            a, b = dict(cust[group]), dict(prev[group])
            a.pop("grid-template-columns", None)
            b.pop("grid-template-columns", None)
            problems += diff(a, b, group)

        # ③ 카드 두 장이 서로 같은 폭으로 나란히
        if prev["cards"] != 2:
            problems.append(f"미리보기 카드가 {prev['cards']}장이다 (2장이어야 한다)")
        if "grid" not in prev["grid"]["display"]:
            problems.append(f"카드가 나란히 놓이지 않는다 (display: {prev['grid']['display']})")
        cols = prev["grid"]["grid-template-columns"].split()
        if len(cols) != 2 or cols[0] != cols[1]:
            problems.append(f"두 열의 폭이 다르다 ({prev['grid']['grid-template-columns']}) — "
                            "A·B는 대등한 대안이라 같은 폭이어야 한다")

        # ③-b 폭이 실제보다 많이 좁으면 줄바꿈이 달라져 미리보기가 오해를 만든다.
        #     완전히 같게 만들 수는 없다(모달 안이라). 10% 안쪽이면 같은 것으로 본다.
        if cust["cardW"]:
            gap = (cust["cardW"] - prev["cardW"]) / cust["cardW"]
            if gap > 0.10:
                problems.append(
                    f"미리보기 카드가 고객 화면보다 {gap*100:.0f}% 좁다 "
                    f"({prev['cardW']}px vs {cust['cardW']}px) — 이만큼 벌어지면 줄바꿈 위치가 달라져 "
                    "\"고객 화면에서도 저렇게 접히나?\"를 헷갈리게 만든다")

        # ④⑤ 넘침
        if prev["overflow"] > 0.5:
            problems.append(f"미리보기 안에서 가로 넘침 {prev['overflow']}px")
        if modal_over > 0.5:
            problems.append(f"모달이 화면 밖으로 {modal_over}px 나간다")

        mark = "✓" if not problems else "✗"
        print(f"{mark} {label} {width}px — 카드 폭 고객 {cust['cardW']}px / 미리보기 {prev['cardW']}px"
              f" · 대조 항목 {sum(len(cust[g]) for g in ('card','grid','desc','tagA','li'))}개")
        for problem in problems:
            bad += 1
            print("    · " + problem)

    browser.close()

if SHOOT:
    print(f"\n스크린샷: {SHOTS}")
print("\n✓ 미리보기가 고객 화면과 같은 모양이다" if not bad else f"\n✗ {bad}건")
sys.exit(1 if bad else 0)

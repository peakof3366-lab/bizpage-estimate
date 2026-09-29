# -*- coding: utf-8 -*-
"""화면을 **브라우저로 재는 규칙** — 단일 출처 (YB)

`_journey_probe.js`가 「버튼을 눌러 보는 규칙」의 단일 출처인 것과 같은 이유로 만든다.
`check_customer_screens.py`(고객)와 `check_admin_screens.py`(담당자)가 이것을 함께 쓴다.
규칙이 두 벌이 되면 「밀렸다」·「잘렸다」·「줄이 길다」의 뜻이 두 화면에서 달라지고,
그러면 **두 결과를 나란히 놓고 볼 수 없다**(결함 생성기 ①).

■ 재는 것 — 전부 **잴 수 있는 것**만. 색·여백·글꼴 취향은 여기서 다루지 않는다

  ① 🔴 **가로로 밀리는 화면** — 문서가 화면보다 넓다. 범인 요소를 지목한다.
  ② 🔴 **잘린 글자** — 칸보다 글이 길어 뒤가 사라진 것.
  ③ **너무 작은 글자** — 12px 미만(10px 미만은 오류).
  ④ **누르기 작은 것** — 24×24 미만은 오류(WCAG 2.5.8 AA), 44×44 미만은 확인 대상.
     2.5.8의 **간격 예외**(둘레 24px 원이 비어 있으면 충족)를 원문대로 적용한다(2026-09-29).
  ⑦ 🔴 **칸을 넘은 글자** — 표 칸은 visible이라 넘친 글자가 옆 칸 위에 올라앉는다(2026-09-29).
  ⑧ 🔴 **두 줄로 갈린 금액·전화번호** — 「83,019, / 990」은 두 숫자로 읽힌다(2026-09-29).
  ⑤ **화면 밖으로 나간 조작.**
  ⑥ 🔴 **한 줄이 너무 긴 글**(YB에서 추가) — 아래 설명 참고.

■ ⑥ 줄 길이를 왜 세는가 — **관리자 화면의 가장 큰 가독성 문제였다**

대표 지시(2026-08-28): 「관리자 페이지 가독성 좋게 만드는 방법 찾아서 적용」.
17개 탭을 재 보니 2줄 이상인 안내문 17개 중 **9개가 줄당 80~91자**였다.
한 줄이 길면 눈이 줄 끝에서 **다음 줄 첫머리로 돌아오지 못한다**(같은 줄을 다시 읽거나
한 줄을 건너뛴다). 폭이 넓은 화면일수록 심해진다 — 글상자가 화면을 다 채우기 때문이다.

⚠ **한글은 1자 ≈ 1em**이라 「요소 폭 ÷ 글자 크기」가 곧 줄당 글자 수다.
  (`ch` 단위는 숫자 `0`의 폭이라 한글에는 절반쯤으로 어긋난다 — 쓰지 말 것.)
⚠ **한 줄짜리 글은 세지 않는다.** 넓은 칸에 짧은 글이 있는 것은 문제가 아니다.
  줄이 실제로 **두 줄 이상 접혔을 때만** 잰다(`Range`의 줄상자 개수로 확인).

■ ⚠ 없는 결함을 만들지 않는다 — 이 저장소가 반복해서 당한 자리다
  · 안 보이는 것(`display:none`·`visibility`·`opacity:0`·`aria-hidden`)은 안 센다.
  · **스스로 옆으로 굴리는 칸**(`overflow-x:auto/scroll`) 안쪽은 ①·⑤에서 뺀다 —
    표를 옆으로 미는 것은 **설계**다(견적서 일차 탭을 그렇게 오진했다).
  · 문단 **안**의 글자 링크는 ④에서 뺀다 — 44px 규칙은 버튼 이야기다.
  · 잘림은 **4px 이하를 세지 않는다**(브라우저 반올림).
  · 표 칸(`td`/`th`)은 ⑥에서 뺀다 — 표는 줄글이 아니고, 폭은 열이 정한다.
"""

SMALL_TEXT_FAIL = 10.0    # 이 아래 글자는 오류
SMALL_TEXT_WARN = 12.0    # 이 아래는 확인 대상
TAP_FAIL = 24             # WCAG 2.5.8 AA
TAP_WARN = 44             # WCAG 2.5.5 AAA · Apple HIG
CLIP_SLOP = 4             # 브라우저 반올림 — 이 이하 잘림은 안 센다
# 🔴 줄 길이 문턱은 **실측 분포를 보고** 정했다(관리자 17개 탭).
#   45~50자가 편한 폭이고, 60자를 넘으면 눈이 다음 줄을 놓치기 시작한다.
#   80자는 이 저장소에 실제로 있던 값이라 「확인 대상」으로 두면 아무도 안 고친다.
LINE_FAIL = 80            # 이 위는 오류
LINE_WARN = 60            # 이 위는 확인 대상
LINE_MIN_CHARS = 40       # 이보다 짧은 글은 애초에 줄이 안 넘어간다

SWEEP = r"""
(opt) => {
  const out = { doc: {}, clipped: [], small: [], taps: [], outside: [], lines: [], widest: [],
                spill: [], numsplit: [] };
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
  if (out.doc.scrollW > vw + 1) {
    document.querySelectorAll('*').forEach((el) => {
      const v = shown(el); if (!v) return;
      if (inScroller(el)) return;
      const right = v.r.left + v.r.width;
      if (right > vw + 1) {
        out.widest.push({ sel: path(el), text: label(el), right: Math.round(right), w: Math.round(v.r.width) });
      }
    });
    /* 가장 바깥쪽(=진짜 범인)만 남긴다. 자식까지 적으면 목록이 수백 줄이 된다 */
    out.widest = out.widest.filter((a, i, arr) =>
      !arr.some((b, j) => j !== i && b.sel !== a.sel && a.sel.startsWith(b.sel + ' >')));
    out.widest.sort((a, b) => b.right - a.right);
    out.widest = out.widest.slice(0, 6);
  }

  /* ── ②③⑥ 글자: 잘림 · 크기 · 줄 길이 ── */
  const TEXTY = 'p,span,div,li,td,th,h1,h2,h3,h4,h5,h6,a,button,label,strong,em,small,dt,dd,figcaption,section,blockquote';
  document.querySelectorAll(TEXTY).forEach((el) => {
    /* 자기 글자를 직접 가진 것만 — 감싸는 div까지 세면 같은 글을 열 번 센다 */
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
    if (!own) return;
    const v = shown(el); if (!v) return;
    const txt = label(el); if (!txt) return;
    const full = (el.innerText || '').replace(/\s+/g, ' ').trim();

    const fs = parseFloat(v.cs.fontSize);
    if (fs && fs < opt.smallWarn) {
      out.small.push({ sel: path(el), text: txt, px: Math.round(fs * 10) / 10 });
    }

    const ox = v.cs.overflowX, oy = v.cs.overflowY;
    const hidesX = ox === 'hidden' || ox === 'clip' || v.cs.textOverflow === 'ellipsis';
    const hidesY = oy === 'hidden' || oy === 'clip';
    if (hidesX && el.scrollWidth - el.clientWidth > opt.clipSlop) {
      out.clipped.push({ sel: path(el), text: txt, dir: '가로', lost: el.scrollWidth - el.clientWidth });
    } else if (hidesY && el.scrollHeight - el.clientHeight > opt.clipSlop) {
      out.clipped.push({ sel: path(el), text: txt, dir: '세로', lost: el.scrollHeight - el.clientHeight });
    }

    /* ⑥ 줄 길이 — 표 칸은 빼고, 실제로 두 줄 이상 접힌 줄글만 */
    const tag = el.tagName;
    if (tag !== 'TD' && tag !== 'TH' && full.length >= opt.lineMinChars && fs) {
      let lines = 1;
      try {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        lines = Math.max(1, new Set(Array.from(rg.getClientRects())
          .map((x) => Math.round(x.top))).size);
      } catch (e) { /* 못 재면 1로 둔다 — 없는 결함을 만들지 않는다 */ }
      if (lines >= 2) {
        const cpl = Math.round(v.r.width / fs);   /* 한글 1자 ≈ 1em */
        if (cpl > opt.lineWarn) {
          out.lines.push({ sel: path(el), text: txt, cpl, rows: lines, px: Math.round(fs) });
        }
      }
    }
  });

  /* ── ⑦⑧ 표 칸: 넘침 · 금액 갈림 (2026-09-29 신설) ──
     🔴 위 ②는 **감추는 칸**(`overflow:hidden`)의 잘림만 센다. 표 칸은 `visible`이라 넘친 글자가
       **옆 칸 위에 그대로 올라앉는다** — 고객 견적서(폰)에서 「30명」이 금액 「83,019,990」 위에
       겹쳐 있었는데 이 도구는 「✓ 밀림·잘림 없음」이라고 했다. 자의 사각지대였다.
     ⑧ 금액은 한 덩어리다. 「83,019, / 990」으로 갈리면 **두 숫자로 읽힌다.** */
  document.querySelectorAll('td,th').forEach((el) => {
    const v = shown(el); if (!v) return;
    /* ⚠ `inScroller`로 빼지 않는다 — 그 예외는 「표를 옆으로 미는 것은 설계」라는 **화면 폭** 이야기다.
       칸 겹침·숫자 갈림은 굴리는 칸 안에서도 똑같이 결함이다. 처음에 그 예외를 그대로 옮겼다가
       대장(`.tbl-scroll` 안)의 세 줄로 갈린 전화번호를 못 잡았다(2026-09-29). */
    const txt = label(el); if (!txt) return;
    if (v.cs.overflowX === 'visible' && el.scrollWidth - el.clientWidth > opt.clipSlop) {
      out.spill.push({ sel: path(el), text: txt, lost: el.scrollWidth - el.clientWidth });
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      /* 금액(83,019,990)과 **전화번호**(010-1234-5678) — 둘 다 한 덩어리로 읽어야 하는 숫자다.
         ⚠ 전화번호는 2026-09-29 대장에서 「010- / 0000- / 0000」 세 줄로 갈려 있었다. */
      const re = /\d{1,3}(?:,\d{3})+|\b0\d{1,2}-\d{3,4}-\d{4}\b/g;
      let m;
      while ((m = re.exec(n.textContent))) {
        try {
          const rg = document.createRange();
          rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          const tops = new Set(Array.from(rg.getClientRects()).filter((x) => x.width > 0)
            .map((x) => Math.round(x.top)));
          if (tops.size > 1) out.numsplit.push({ sel: path(el), text: m[0] });
        } catch (e) { /* 못 재면 안 센다 — 없는 결함을 만들지 않는다 */ }
      }
    }
  });

  /* ── ④⑤ 누를 수 있는 것 ── */
  const TAPPY = 'a[href],button,input,select,textarea,[role=button],[onclick],summary';
  /* ④ 24px 미만의 **간격 예외** (WCAG 2.5.8 원문, 2026-09-29 반영).
     「작은 대상이라도 그 중심에 지름 24px 원을 그렸을 때 **다른 대상에도, 다른 작은 대상의 원에도**
      닿지 않으면 충족」이다. 이 자는 「24 미만 = 오류」만 적용해 **기준보다 엄했다** —
     자기 열에 혼자 있는 체크박스(13px)도 오류로 셌다. 원문대로 잰다.
     ⚠ 자를 깎아 0을 만드는 것과 다르다: **붙어 있는 작은 대상은 여전히 오류**다
       (`selftest_cells`의 촘촘한 버튼 줄이 그것을 잡는지 매번 본다). 44px 확인 대상은 그대로다. */
  /* 다른 것에 **덮여** 못 누르는 것(모달 뒤의 표)은 누를 자리가 아니다 — 모달을 열고 재면
     뒤에 깔린 체크박스를 「작다」고 셌다(2026-09-29). ⚠ 화면 밖(스크롤 아래)은 `elementFromPoint`가
     답을 못 하므로 **덮였다고 보지 않는다** — 모르는 것을 결함 없음으로 치우지 않는다. */
  const covered = (el, r) => {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > vw || cy > window.innerHeight) return false;
    const top = document.elementFromPoint(cx, cy);
    return !!top && top !== el && !el.contains(top) && !top.contains(el) && !(el.labels && [...el.labels].some((l) => l.contains(top)));
  };
  const tapRects = [];
  document.querySelectorAll(TAPPY).forEach((el) => {
    const v = shown(el); if (!v || el.disabled) return;
    if (covered(el, v.r)) return;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return;
    tapRects.push({ el, r: v.r, small: Math.min(v.r.width, v.r.height) < opt.tapFail });
  });
  const spaced = (me) => {
    const cx = me.r.left + me.r.width / 2, cy = me.r.top + me.r.height / 2, R = opt.tapFail / 2;
    return tapRects.every((o) => {
      if (o.el === me.el || o.el.contains(me.el) || me.el.contains(o.el)) return true;
      if (o.small) {
        const ox = o.r.left + o.r.width / 2, oy = o.r.top + o.r.height / 2;
        return Math.hypot(cx - ox, cy - oy) >= 2 * R;
      }
      const dx = Math.max(o.r.left - cx, 0, cx - (o.r.left + o.r.width));
      const dy = Math.max(o.r.top - cy, 0, cy - (o.r.top + o.r.height));
      return Math.hypot(dx, dy) >= R;
    });
  };
  const tapInfo = new Map(tapRects.map((t) => [t.el, t]));
  document.querySelectorAll(TAPPY).forEach((el) => {
    const v = shown(el); if (!v) return;
    if (el.disabled) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && el.type === 'hidden') return;

    /* 문단 안의 글자 링크는 버튼이 아니다 — 44px 규칙을 들이대면 없는 결함이 생긴다 */
    const p = el.parentElement;
    const inlineLink = tag === 'a' && p && /^(P|LI|TD|SPAN|SMALL|EM|STRONG|DD)$/.test(p.tagName)
      && v.cs.display === 'inline';
    if (!inlineLink && tapInfo.has(el)) {
      const w = Math.round(v.r.width), h = Math.round(v.r.height);
      if (Math.min(w, h) < opt.tapWarn) {
        const t = tapInfo.get(el);
        out.taps.push({ sel: path(el), text: label(el) || (el.getAttribute('aria-label') || ''), w: w, h: h,
                        spaced: !!(t && t.small && spaced(t)) });
      }
    }

    if (!inScroller(el) && (v.r.left < -2 || v.r.left + v.r.width > vw + 2)) {
      out.outside.push({ sel: path(el), text: label(el), left: Math.round(v.r.left), right: Math.round(v.r.left + v.r.width) });
    }
  });

  return out;
}
"""

OPTS = {
    "clipSlop": CLIP_SLOP,
    "smallWarn": SMALL_TEXT_WARN,
    "tapWarn": TAP_WARN,
    "tapFail": TAP_FAIL,
    "lineWarn": LINE_WARN,
    "lineMinChars": LINE_MIN_CHARS,
}


def collect(page, where, findings, scope=None):
    """화면 하나를 재서 `findings`에 담는다. 항목: (심각도, 어디, 종류, 설명).

    · `where`  — 같은 자리를 여러 번 재는 축(고객 쪽은 **폭**, 담당자 쪽은 **탭**).
                 보고에서 이 값들이 한 줄 뒤에 묶여 나온다.
    · `scope`  — 나누어 보고 싶은 묶음(고객 쪽은 **화면 이름**). 없으면 안 붙인다.
    """
    r = page.evaluate(SWEEP, OPTS)
    tag = (lambda k: f"{scope} — {k}") if scope else (lambda k: k)

    over = r["doc"]["scrollW"] - r["doc"]["innerW"]
    if over > 1:
        who = "; ".join(f"{x['sel']}({x['right']}px)" for x in r.get("widest", [])[:3]) or "범인 못 찾음"
        findings.append(("🔴", where, tag("가로로 밀린다"),
                         f"문서 {r['doc']['scrollW']}px > 화면 {r['doc']['innerW']}px (+{over}) — {who}"))

    for c in r["clipped"]:
        findings.append(("🔴", where, tag("글자가 잘렸다"),
                         f"{c['dir']} {c['lost']}px · 「{c['text']}」 [{c['sel']}]"))

    for c in r.get("spill", []):
        findings.append(("🔴", where, tag("글자가 칸을 넘어 옆 칸에 겹친다"),
                         f"{c['lost']}px · 「{c['text']}」 [{c['sel']}]"))

    for c in r.get("numsplit", []):
        findings.append(("🔴", where, tag("금액·전화번호가 두 줄로 갈렸다"),
                         f"「{c['text']}」 [{c['sel']}]"))

    for s in r["small"]:
        sev = "🔴" if s["px"] < SMALL_TEXT_FAIL else "·"
        findings.append((sev, where, tag("글자가 작다"), f"{s['px']}px · 「{s['text']}」 [{s['sel']}]"))

    for t in r["taps"]:
        small = min(t["w"], t["h"]) < TAP_FAIL
        sev = "🔴" if small and not t.get("spaced") else "·"
        note = " · 둘레가 비어 24px 기준 충족(간격 예외)" if small and t.get("spaced") else ""
        findings.append((sev, where, tag("누르기 작다"),
                         f"{t['w']}×{t['h']}px{note} · 「{t['text']}」 [{t['sel']}]"))

    for o in r["outside"]:
        findings.append(("🔴", where, tag("화면 밖으로 나갔다"),
                         f"{o['left']}~{o['right']}px · 「{o['text']}」 [{o['sel']}]"))

    for ln in r["lines"]:
        sev = "🔴" if ln["cpl"] > LINE_FAIL else "·"
        findings.append((sev, where, tag("한 줄이 길다"),
                         f"{ln['cpl']}자/줄 · {ln['rows']}줄 · {ln['px']}px · 「{ln['text']}」 [{ln['sel']}]"))

    return r


# ── ⑦⑧ 자가 살아 있는지 — 일부러 망가진 표를 그려 재 본다 (CLAUDE.md 결함 생성기 ③) ──
# ⚠ 진짜 화면에서 고장을 흉내 내면 **고장이 안 날 수 있다**(2026-09-29: 금액 칸의 `nowrap`을
#   뗐는데 칸이 넓어서 숫자가 안 갈렸고, 자는 조용히 통과했다 — 아무것도 확인 못 한 셈).
#   그래서 **반드시 고장이 나는 표**를 따로 그린다. 대조군(멀쩡한 칸)이 안 걸리는 것까지 본다.
CELL_FAULTS = """<!doctype html><meta charset="utf-8">
<style>table{table-layout:fixed;border-collapse:collapse;font-size:13px}
td{border:1px solid #ccc;padding:4px;word-break:keep-all}</style>
<table style="width:160px"><tr>
 <td id="spill" style="width:40px">오리엔테이션오리엔테이션</td>
 <td id="split" style="width:52px;overflow-wrap:anywhere">83,019,990</td>
 <td id="ok" style="width:68px">30명</td></tr></table>
<table style="width:60px"><tr><td id="tel">010-1234-5678</td></tr></table>
<div style="margin-top:40px"><button id="crowdA" style="width:14px;height:14px;padding:0">a</button><button
 id="crowdB" style="width:14px;height:14px;padding:0">b</button></div>
<div style="margin-top:40px"><button id="alone" style="width:14px;height:14px;padding:0">c</button></div>"""


def selftest_cells(page):
    """망가진 표 하나를 재서 ⑦⑧이 잡는지 본다. 문제 목록을 돌려준다(비면 살아 있다)."""
    page.set_content(CELL_FAULTS)
    r = page.evaluate(SWEEP, OPTS)
    bad = []
    if not any("오리엔테이션" in c["text"] for c in r["spill"]):
        bad.append("⑦ 칸을 넘은 글자를 못 잡았다")
    if not any(c["text"] == "83,019,990" for c in r["numsplit"]):
        bad.append("⑧ 두 줄로 갈린 금액을 못 잡았다")
    if not any(c["text"] == "010-1234-5678" for c in r["numsplit"]):
        bad.append("⑧ 여러 줄로 갈린 전화번호를 못 잡았다")
    taps = {t["text"]: t for t in r["taps"]}
    if not (taps.get("a") and not taps["a"].get("spaced")):
        bad.append("④ 붙어 있는 작은 버튼을 간격 예외로 봐줬다 — 기준보다 무르다")
    if not (taps.get("c") and taps["c"].get("spaced")):
        bad.append("④ 혼자 떨어진 작은 버튼에 간격 예외를 못 줬다")
    if any("30명" in c["text"] for c in r["spill"]):
        bad.append("대조군(멀쩡한 칸)까지 걸었다 — 없는 결함을 만든다")
    return bad


def report(findings, header, swept, show_all=False, width_names=()):
    """🔴 **같은 자리를 폭마다 다시 세지 않는다.**
    처음 돌렸을 때 확인 대상이 715건으로 찍혔는데 실제 자리는 그 1/4이었다 —
    폭 4가지에서 같은 요소를 네 번 센 것이다. 숫자가 커지면 사람은 **안 읽는다**
    (결정대기열 요약표를 걷어낸 것과 같은 이유). 자리 하나가 한 줄이다."""
    errs = [f for f in findings if f[0] == "🔴"]
    warns = [f for f in findings if f[0] != "🔴"]

    def show(group, title):
        if not group:
            return
        print(f"\n{title}")
        seen = {}
        for sev, where, kind, msg in group:
            seen.setdefault(kind, {}).setdefault(msg, []).append(where)
        for kind, rows in seen.items():
            print(f"\n  ■ {kind} (자리 {len(rows)}곳)")
            for i, (msg, wheres) in enumerate(rows.items()):
                if not show_all and i >= 10:
                    print(f"     … 그리고 {len(rows) - 10}곳 더 (--all 로 전부)")
                    break
                uniq = list(dict.fromkeys(wheres))
                if width_names and len(uniq) == len(width_names):
                    tail = "폭 전부"
                elif len(uniq) > 4:
                    tail = f"{len(uniq)}곳: " + "·".join(uniq[:4]) + " 외"
                else:
                    tail = "·".join(uniq)
                print(f"     {msg}  [{tail}]")

    print("=" * 74)
    print(header)
    print("=" * 74)
    print(swept)

    show(errs, "🔴 오류 — 읽기 어렵거나 못 누른다")
    show(warns, "⚠ 확인 대상 — 오류가 아니다. 사람이 보고 정한다")

    uniq = lambda g: len({(f[2], f[3]) for f in g})
    print("\n" + "-" * 74)
    print(f"합계: 🔴 자리 {uniq(errs)}곳 · ⚠ 자리 {uniq(warns)}곳"
          f"  (훑은 횟수까지 세면 {len(errs)} · {len(warns)})")
    if not errs:
        print("✓ 밀림·잘림·화면 밖 조작·긴 줄 없음")
    return 1 if errs else 0

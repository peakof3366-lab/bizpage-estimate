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
  const out = { doc: {}, clipped: [], small: [], taps: [], outside: [], lines: [], widest: [] };
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

  /* ── ④⑤ 누를 수 있는 것 ── */
  const TAPPY = 'a[href],button,input,select,textarea,[role=button],[onclick],summary';
  document.querySelectorAll(TAPPY).forEach((el) => {
    const v = shown(el); if (!v) return;
    if (el.disabled) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && el.type === 'hidden') return;

    /* 문단 안의 글자 링크는 버튼이 아니다 — 44px 규칙을 들이대면 없는 결함이 생긴다 */
    const p = el.parentElement;
    const inlineLink = tag === 'a' && p && /^(P|LI|TD|SPAN|SMALL|EM|STRONG|DD)$/.test(p.tagName)
      && v.cs.display === 'inline';
    if (!inlineLink) {
      const w = Math.round(v.r.width), h = Math.round(v.r.height);
      if (Math.min(w, h) < opt.tapWarn) {
        out.taps.push({ sel: path(el), text: label(el) || (el.getAttribute('aria-label') || ''), w: w, h: h });
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

    for s in r["small"]:
        sev = "🔴" if s["px"] < SMALL_TEXT_FAIL else "·"
        findings.append((sev, where, tag("글자가 작다"), f"{s['px']}px · 「{s['text']}」 [{s['sel']}]"))

    for t in r["taps"]:
        sev = "🔴" if min(t["w"], t["h"]) < TAP_FAIL else "·"
        findings.append((sev, where, tag("누르기 작다"),
                         f"{t['w']}×{t['h']}px · 「{t['text']}」 [{t['sel']}]"))

    for o in r["outside"]:
        findings.append(("🔴", where, tag("화면 밖으로 나갔다"),
                         f"{o['left']}~{o['right']}px · 「{o['text']}」 [{o['sel']}]"))

    for ln in r["lines"]:
        sev = "🔴" if ln["cpl"] > LINE_FAIL else "·"
        findings.append((sev, where, tag("한 줄이 길다"),
                         f"{ln['cpl']}자/줄 · {ln['rows']}줄 · {ln['px']}px · 「{ln['text']}」 [{ln['sel']}]"))

    return r


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

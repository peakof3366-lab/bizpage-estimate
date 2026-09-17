# ═══════════════════════════════════════════════════════════════════════════
#  카톡·메신저 미리보기 카드 그림 만들기 (2026-09-17, 결정대기열 P-6)
#  ───────────────────────────────────────────────────────────────────────────
#  ■ 무엇을 만드나
#  `og-card.png` (1200×630) — 주소를 메신저로 보낼 때 뜨는 카드의 그림이다.
#  그전까지는 제목·설명만 나가고 **그림 자리가 비어** 있었다.
#
#  ■ 🔴 왜 「여행 사진」이 아니라 로고인가
#  대기열 P-6에 적힌 그대로다: **아무 여행 사진이나 넣으면 그게 우리 브랜드 이미지가
#  된다.** 회사 얼굴이라 대표가 고르실 일이고, 그때까지는 **우리 로고**가 가장 안전하다.
#  사진이 정해지면 이 파일을 고치는 게 아니라 그 사진을 og-card.png로 바꾸면 된다.
#
#  ■ 🔴 목적지·금액·고객명을 **넣지 않는다**
#  견적서 링크는 **아는 사람 누구나 연다**(인증이 없다). 카드에 「어디 몇 명 얼마」를
#  그리면, 고객이 사내 단톡방에 링크를 붙이는 순간 **그 방 사람 전부가 금액을 본다.**
#  대기열 P-6의 미결 항목이 정확히 이것이고, 정해지기 전까지는 **안 넣는 쪽**이 안전하다.
#
#  ■ ⚠ 파일 이름이 ASCII인 이유
#  `og:image`는 **절대 주소**로 줘야 카톡이 읽는다. 로고 원본은 `이미지/` 폴더에 있는데
#  한글 폴더명이 주소에 실리면 인코딩이 한 겹 더 끼고 크롤러마다 다르게 다룬다.
#  그래서 결과물만 저장소 뿌리에 ASCII 이름으로 둔다.
#
#  ■ 어두운 바탕 + 흰 로고인 이유
#  사이트 머리와 같은 꼴이고(대화 목록에서 흰 카드들 사이에 묻히지 않는다),
#  `이미지/biz-logo-white.svg`가 이미 그 용도로 있다.
#
#      python ai-loop/build_og_card.py          # og-card.png를 다시 만든다
#      python ai-loop/build_og_card.py --check  # 만들지 않고 규격만 본다
# ═══════════════════════════════════════════════════════════════════════════
import base64
import pathlib
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")  # ⚠ 없으면 cp949 콘솔에서 첫 줄부터 죽는다

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "og-card.png"
W, H = 1200, 630
MAX_BYTES = 5 * 1024 * 1024  # 카톡·페이스북 권장 상한. 넘으면 아예 안 뜨는 크롤러가 있다


def png_size(p: pathlib.Path):
    """PNG 머리 16바이트로 가로·세로를 읽는다 — 라이브러리가 필요 없다.
    ⚠ 「파일이 있다」로 통과시키지 않는다. 규격이 틀린 그림은 카톡이 잘라 버린다."""
    b = p.read_bytes()
    if b[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", b[16:24])
    return w, h, len(b)


def check() -> int:
    if not OUT.exists():
        print("🔴 og-card.png가 없습니다.")
        return 1
    s = png_size(OUT)
    if not s:
        print("🔴 og-card.png가 PNG가 아닙니다.")
        return 1
    w, h, n = s
    ok_size, ok_bytes = (w == W and h == H), (n <= MAX_BYTES)
    print(f"og-card.png  {w}×{h} · {n/1024:.0f}KB")
    print("  ✓ 규격 1200×630" if ok_size else f"  🔴 규격이 다릅니다 ({w}×{h}) — 1200×630이어야 합니다")
    print("  ✓ 용량 5MB 이하" if ok_bytes else "  🔴 5MB를 넘습니다")
    return 0 if (ok_size and ok_bytes) else 1


def build() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("🔴 playwright가 없습니다. 이 도구는 카드를 브라우저로 그려서 찍습니다.")
        print("   만들지 않고 멈춥니다 — 빈 파일을 남기지 않습니다.")
        return 1

    logo = base64.b64encode((ROOT / "이미지" / "biz-logo-white.svg").read_bytes()).decode()

    # 색은 BI 가이드 값이다(2026-09-17 브랜드 교체 때 쓴 그 값) — 보라 #514dc2 · 민트 #63d6d4
    html = f"""<!doctype html><meta charset="utf-8">
<style>
  html,body{{margin:0;padding:0}}
  body{{width:{W}px;height:{H}px;overflow:hidden;
       font-family:'Malgun Gothic','맑은 고딕',system-ui,sans-serif;background:#2b2a33;color:#fff}}
  /* 🔴 **가운데로 모은다.** 메신저는 카드를 늘 1.91:1로 보여 주지 않는다 — 작은 카드는
     **정사각형으로 잘라** 가운데만 남긴다. 왼쪽에 몰아 두면 그때 로고가 통째로 잘린다.
     가운데면 어떻게 잘려도 로고와 첫 줄은 남는다. */
  .card{{width:100%;height:100%;box-sizing:border-box;
        display:flex;flex-direction:column;justify-content:center;align-items:center;
        text-align:center;padding:0 96px;position:relative;
        background:radial-gradient(120% 140% at 50% 0%, #514dc2 0%, #3a3550 45%, #2b2a33 100%)}}
  /* 아래쪽 브랜드 띠 — 카드가 잘려도 브랜드 색은 남는다 */
  .bar{{position:absolute;left:0;right:0;bottom:0;height:12px;
       background:linear-gradient(90deg,#514dc2 0%,#63d6d4 100%)}}
  img{{width:420px;height:auto;display:block}}
  .tag{{margin-top:34px;font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1.35}}
  .sub{{margin-top:16px;font-size:25px;font-weight:500;color:#c9c6de;letter-spacing:-.01em}}
</style>
<div class="card">
  <img src="data:image/svg+xml;base64,{logo}" alt="비즈페이지">
  <div class="tag">기업·공공기관 해외연수 전문</div>
  <div class="sub">55개국 현지 단가 기반 견적 · 기관 섭외 · 현지 완전 지원</div>
  <div class="bar"></div>
</div>"""

    tmp = ROOT / "_og_build.html"
    tmp.write_text(html, encoding="utf-8")
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg.goto(tmp.as_uri())
            pg.wait_for_timeout(250)
            # 🔴 로고가 진짜 그려졌는지 보고 나서 찍는다 — 안 그려진 카드를 저장하면
            #    그게 그대로 회사 얼굴이 된다(소스만 보는 검사는 이걸 못 잡는다).
            nat = pg.evaluate("() => { const i=document.querySelector('img'); return i?i.naturalWidth:0; }")
            if not nat:
                print("🔴 로고가 안 그려졌습니다 — 저장하지 않습니다.")
                b.close()
                return 1
            pg.screenshot(path=str(OUT), type="png")
            b.close()
    finally:
        tmp.unlink(missing_ok=True)

    print("만들었습니다: og-card.png")
    return check()


sys.exit(check() if "--check" in sys.argv else build())

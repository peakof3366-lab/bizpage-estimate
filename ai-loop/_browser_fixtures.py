# -*- coding: utf-8 -*-
"""브라우저로 **고객 화면을 진짜로 띄우는 규칙** — 단일 출처 (YA)

`_page_boot.js`가 jsdom 쪽 단일 출처인 것과 같은 이유로 만든다. 화면을 띄우는
방법이 도구마다 한 벌씩 생기면 **그 도구만 조용히 다른 것을 재게 된다**(결함 생성기 ①).

여기서 감당하는 것은 둘이다:

  ① **견적서 화면은 문서를 받아야 그려진다.** `estimate-view.html`은 서버에서
     `/api/quote-shares/<id>`를 받아 그린다. 못 받으면 「견적서를 지금 열 수 없습니다」
     **오류 화면**으로 떨어지는데, 그 화면에도 글자와 버튼이 있어서 검사는 멀쩡히
     통과한다. 🔴 실제로 그렇게 통과했다 — 화면을 캡처해 눈으로 보고서야 알았다
     (결함 생성기 ③: 안전망이 실제로 실행된 적이 없다).

  ② **띄웠는지 확인하는 것까지가 규칙이다.** 그래서 `assert_loaded`를 함께 둔다.
     띄우는 코드와 확인하는 코드가 떨어져 있으면 확인은 곧 빠진다.

⚠ 픽스처는 **손으로 짓지 않는다.** `virtual_journey.js`가 실제로 만든 payload를
  그대로 쓴다. 서버가 주는 모양을 코드를 따라가며 지으면 아무것도 못 잡는다
  (WR에서 `inclItems` vs `included`로 실제로 당했다). 새로 뽑으려면:

      node ai-loop/virtual_journey.js --n=1 --no-docs --no-clean --quiet \\
           --share-json=ai-loop/fixtures/share_doc.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARE_FIXTURE = ROOT / "ai-loop" / "fixtures" / "share_doc.json"

# 🔴 **바깥을 괄호로 감싼다.** `(p)=>{…}(값)`은 화살표 함수를 그냥 부르는 것처럼
#   보이지만 JS에서는 **문법 오류**다. 감싸지 않아 픽스처가 안 꽂힌 채로
#   오류 화면을 재고 있던 것이 이 파일이 생긴 이유다.
# ⚠ 견적서 주소가 아닌 요청은 건드리지 않고 빈 JSON으로 답한다 — 전부 가로채면
#   「무엇이 실패해야 정상인가」를 못 본다.
_STUB = """
((payload) => {
  const real = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (u, o) => {
    const url = String((u && u.url) || u || '');
    if (url.includes('/api/quote-shares/')) {
      return Promise.resolve(new Response(JSON.stringify(payload),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (url.includes('/api/')) {
      return Promise.resolve(new Response('{}',
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return real ? real(u, o) : Promise.reject(new Error('no fetch'));
  };
})
"""


def load_share():
    """견적서 payload를 읽는다. 없으면 None — 부르는 쪽이 그 화면을 건너뛴다."""
    if not SHARE_FIXTURE.exists():
        return None
    return json.loads(SHARE_FIXTURE.read_text(encoding="utf-8"))


def missing_share_help():
    return ("⚠ 견적서 픽스처가 없습니다: " + str(SHARE_FIXTURE) + "\n"
            "  만들기: node ai-loop/virtual_journey.js --n=1 --no-docs --no-clean "
            "--quiet --share-json=ai-loop/fixtures/share_doc.json")


def arm(page, share):
    """페이지 스크립트보다 **먼저** fetch를 픽스처로 갈아 끼운다."""
    if share is None:
        return
    page.add_init_script(_STUB.strip() + "(" + json.dumps(share, ensure_ascii=False) + ")")


def open_quote(page, share, query="?id=fixture", settle=2000):
    """견적서 화면을 띄운다. ⚠ `arm()`을 **`goto` 전에** 불러 두어야 한다."""
    # `load`를 기다리면 바깥 서버 하나가 느린 날 검사가 통째로 멈춘다(실측: 30초 타임아웃).
    page.goto((ROOT / "estimate-view.html").as_uri() + query, wait_until="domcontentloaded")
    page.wait_for_timeout(settle)


def assert_loaded(page, share):
    """정말 **견적서**를 보고 있는가. 아니면 왜 아닌지를 문자열로 돌려준다(None이면 정상)."""
    if share is None:
        return "픽스처가 없다"
    body = page.evaluate("() => document.body.innerText")
    qno = str(share.get("qno", ""))
    if qno and qno not in body:
        return (f"견적번호 {qno}가 화면에 없다 — 픽스처가 안 꽂혔거나 "
                f"오류 화면으로 떨어졌다")
    return None

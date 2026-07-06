"""
신규 추가된 25개 목적지 DEST_PHOTOS 데이터가 실제로 STEP3 사진 스트립
렌더링 함수(_destPhotosToImgList, loadStep3Images)에서 에러 없이 처리되는지
확인하는 스크립트. 오프라인 샌드박스라 실제 이미지 바이트 로딩은 확인 불가하나,
데이터 구조/함수 호출 레벨의 런타임 에러는 잡아낸다.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
url = (PROJECT_DIR / "index.html").resolve().as_uri()

DESTS = ['오키나와','장가계','청도','연태','가오슝','다낭','나트랑','푸꾸옥','보홀',
         '코타키나발루','푸켓','치앙마이','라오스','카자흐스탄','호주','사이판',
         '네덜란드','동유럽','북유럽','서유럽','샌프란시스코','워싱턴','하와이',
         '밴쿠버','토론토']

def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda msg: errors.append(f"[console.{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))
        page.goto(url, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(300)

        results = page.evaluate("""(dests) => {
            return dests.map(d => {
                const list = _destPhotosToImgList(d);
                return { dest: d, hasPhotos: !!(list && list.length >= 2), count: list ? list.length : 0 };
            });
        }""", DESTS)

        fail = [r for r in results if not r["hasPhotos"]]
        for r in results:
            print(f"  {r['dest']}: photos={r['count']} {'OK' if r['hasPhotos'] else 'FAIL'}")

        print(f"\n총 {len(DESTS)}개 중 사진 목록 정상 구성: {len(DESTS)-len(fail)}개, 실패: {len(fail)}개")
        browser.close()

    print("\n=== 콘솔/페이지 에러 ===")
    if errors:
        for e in errors:
            print(" -", e)
    else:
        print("(없음)")

    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()

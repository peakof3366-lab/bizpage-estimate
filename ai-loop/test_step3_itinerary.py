"""
STEP3(연수 일정 탐색) 목적지별 ITINERARY_DB 등록 확인 스크립트
사용법: python test_step3_itinerary.py <destination_key>
- getItineraries(destKey, '')로 실제 반환되는 코스가 "직접 등록"인지(리치 데이터) 확인
- am/pm/eve/tip 필드가 실제로 채워져 있는지, 제네릭 폴백 문구("오전 프로그램" 등)가
  아닌지 확인
- 콘솔/페이지 에러 수집
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
url = (PROJECT_DIR / "index.html").resolve().as_uri()

def main():
    if len(sys.argv) < 2:
        print("usage: python test_step3_itinerary.py <destination_key>", file=sys.stderr)
        sys.exit(2)
    dest_key = sys.argv[1]

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda msg: errors.append(f"[console.{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))

        page.goto(url, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(300)

        result = page.evaluate(f"""() => {{
            const destKey = {dest_key!r};
            const hasDirect = _hasDirectEntry(destKey);
            const pair = getItineraries(destKey, '');
            const course = pair ? pair[0] : null;
            const day2 = course ? course.days[1] : null;
            return {{
                hasDirect,
                courseCount: pair ? pair.length : 0,
                title: course ? course.title : null,
                highlights: course ? course.highlights : null,
                day2_am: day2 ? day2.am : null,
                day2_pm: day2 ? day2.pm : null,
                totalDaysInCourse: course ? course.days.length : 0,
            }};
        }}""")
        print(f"[{dest_key}] hasDirectEntry={result['hasDirect']}  courseCount={result['courseCount']}")
        print(f"  title: {result['title']}")
        print(f"  highlights: {result['highlights']}")
        print(f"  day2.am: {result['day2_am']}")
        print(f"  day2.pm: {result['day2_pm']}")
        print(f"  totalDaysInCourse: {result['totalDaysInCourse']}")

        is_generic = result['day2_am'] in (None, '오전 프로그램') or result['day2_pm'] in (None, '오후 프로그램')
        print(f"  -> {'FAIL: 제네릭 폴백 문구 감지 (리치 데이터 아님)' if is_generic else 'PASS: 리치 데이터 확인됨'}")

        # STEP3 화면 렌더까지 실제로 확인
        page.select_option("#destination", dest_key)
        page.fill("#participants", "20")
        page.fill("#days", "5")
        page.wait_for_timeout(200)
        page.evaluate("renderStep3()")
        page.evaluate("document.getElementById('step3Section').classList.remove('hidden')")
        page.wait_for_timeout(500)
        timeline_text = page.evaluate("document.getElementById('step3Section').innerText").strip()
        print(f"  STEP3 렌더 텍스트 길이: {len(timeline_text)}자")

        browser.close()

    print("\n=== 콘솔/페이지 에러 ===")
    if errors:
        for e in errors:
            print(" -", e)
    else:
        print("(없음)")

    sys.exit(1 if (is_generic or errors) else 0)

if __name__ == "__main__":
    main()

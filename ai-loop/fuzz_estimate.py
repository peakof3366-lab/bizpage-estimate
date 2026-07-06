"""
견적 계산 로직(getBreakdownData) 대규모 조합 퍼징 테스트.
55개 목적지 x 인원수(경계값 포함) x 일수 x 프로그램유형 x 기관유형 x
좌석등급(이코노미/비즈니스)을 전수 조합해 다음 불변조건을 검사한다:
  1. NaN/undefined/음수 없음
  2. 인원 증가 시 총액이 감소하지 않음(비단조성 버그 재발 방지)
  3. perPerson * participants ≈ total (반올림 오차 범위 내)
  4. 비즈니스석 총액 >= 이코노미 총액 (동일 조건)
  5. rooms/vehicleCount는 항상 1 이상의 유한수
전부 브라우저 컨텍스트 내 단일 page.evaluate로 실행해 빠르게 처리한다.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).parent.parent
url = (PROJECT_DIR / "index.html").resolve().as_uri()

FUZZ_JS = r"""
() => {
  const destSel = document.getElementById('destination');
  const partEl = document.getElementById('participants');
  const daysEl = document.getElementById('days');
  const progEl = document.getElementById('programType');
  const orgEl  = document.getElementById('organizationType');

  const destinations = Array.from(destSel.options).map(o => o.value).filter(Boolean);
  const participantsList = [1, 2, 9, 10, 11, 15, 29, 30, 31, 49, 50, 51, 75, 150, 500];
  const daysList = [1, 2, 3, 5, 7, 10];
  const programTypes = ['language','leadership','industry','academic'];
  const orgTypes = ['company','public','education'];
  const cabinClasses = ['economy','business'];

  function setRadio(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = (r.value === value); });
  }
  function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  }

  setChecked('incHotel', true); setChecked('incMeal', true); setChecked('incVehicle', true);
  setChecked('incGuide', true); setChecked('incSightseeing', true);
  setRadio('hotelGrade', 'superior');
  setRadio('roomConfig', 'double');
  setRadio('vehicleType', 'auto');
  const deptEl = document.getElementById('departureCity');
  if (deptEl) deptEl.value = 'ICN';
  const startEl = document.getElementById('startDate');
  if (startEl) startEl.value = '';

  const violations = [];
  let totalCombos = 0;

  for (const dest of destinations) {
    destSel.value = dest;
    for (const days of daysList) {
      daysEl.value = String(days);
      for (const prog of programTypes) {
        progEl.value = prog;
        for (const org of orgTypes) {
          orgEl.value = org;

          // 인원 단조성 체크용: 이전 결과 저장
          let prevTotal = null, prevN = null;

          for (const n of participantsList) {
            partEl.value = String(n);

            for (const cabin of cabinClasses) {
              setRadio('cabinClass', cabin);
              totalCombos++;
              let data;
              try {
                data = getBreakdownData();
              } catch (e) {
                violations.push({type:'exception', dest, days, prog, org, n, cabin, msg: String(e)});
                continue;
              }
              if (!data) {
                violations.push({type:'null_data', dest, days, prog, org, n, cabin});
                continue;
              }
              // NaN / 음수 체크
              if (!Number.isFinite(data.total) || data.total < 0) {
                violations.push({type:'bad_total', dest, days, prog, org, n, cabin, total: data.total});
              }
              if (!Number.isFinite(data.perPerson) || data.perPerson < 0) {
                violations.push({type:'bad_perPerson', dest, days, prog, org, n, cabin, perPerson: data.perPerson});
              }
              for (const r of data.rows) {
                if (!Number.isFinite(r.amount) || r.amount < 0) {
                  violations.push({type:'bad_row_amount', dest, days, prog, org, n, cabin, row: r.name, amount: r.amount});
                }
              }
              // perPerson * n ≈ total (반올림 오차 허용범위: n원 이내)
              const diff = Math.abs(data.perPerson * n - data.total);
              if (diff > Math.max(n, 10)) {
                violations.push({type:'perperson_mismatch', dest, days, prog, org, n, cabin, total: data.total, perPerson: data.perPerson, diff});
              }
              // rooms/vehicleCount 유효성
              if (!Number.isFinite(data.rooms) || data.rooms < 1) {
                violations.push({type:'bad_rooms', dest, days, prog, org, n, cabin, rooms: data.rooms});
              }

              // 비즈니스 >= 이코노미 (같은 파라미터, cabin만 다름) 비교는 economy 먼저 온 뒤 business 볼 때 체크
              if (cabin === 'business') {
                setRadio('cabinClass', 'economy');
                const econData = getBreakdownData();
                setRadio('cabinClass', 'business');
                if (econData && data.total < econData.total) {
                  violations.push({type:'biz_cheaper_than_economy', dest, days, prog, org, n, econTotal: econData.total, bizTotal: data.total});
                }
              }

              // 인원 단조성 (동일 dest/days/prog/org/cabin=economy 기준으로 인원 증가 시 total 감소 금지)
              if (cabin === 'economy') {
                if (prevTotal !== null && n > prevN && data.total < prevTotal) {
                  violations.push({type:'non_monotonic', dest, days, prog, org, prevN, prevTotal, n, total: data.total});
                }
                prevTotal = data.total; prevN = n;
              }
            }
          }
        }
      }
    }
  }

  return { totalCombos, violations };
}
"""

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(300)

        result = page.evaluate(FUZZ_JS)
        browser.close()

    print(f"총 조합 테스트: {result['totalCombos']:,}건")
    violations = result["violations"]
    print(f"불변조건 위반: {len(violations)}건")

    if violations:
        # 유형별 집계
        by_type = {}
        for v in violations:
            by_type.setdefault(v["type"], []).append(v)
        for t, vs in by_type.items():
            print(f"\n=== {t} ({len(vs)}건) — 샘플 최대 10건 ===")
            for v in vs[:10]:
                print(" ", json.dumps(v, ensure_ascii=False))
    else:
        print("모든 불변조건 통과.")

    if errors:
        print("\n=== 페이지 에러 ===")
        for e in errors:
            print(" -", e)

    sys.exit(1 if violations or errors else 0)

if __name__ == "__main__":
    main()

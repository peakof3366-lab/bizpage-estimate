"""
견적 계산 2차 퍼징: 1차에서 다루지 않은 차원(호텔등급/객실구성+VIP/출발공항/
차량수동선택/시즌 날짜/포함항목 개별 해제)을 목적지 대표 샘플(10개)에 대해
조합 검사. 55개 전체 x 이 차원까지 곱하면 너무 커지므로, 1차에서 이미
전 목적지 핵심 로직은 검증했으니 여기서는 "차원 자체"의 버그를 잡는 데 집중.
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
  const vipEl  = document.getElementById('vipCount');
  const deptEl = document.getElementById('departureCity');
  const startEl = document.getElementById('startDate');

  function setRadio(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = (r.value === value); });
  }
  function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  }

  const sampleDests = ['도쿄','방콕','파리','뉴욕','시드니','호주','카자흐스탄','하와이','오키나와','서유럽'];
  const hotelGrades = ['standard','superior','deluxe'];
  const roomConfigs = ['double','single','mixed'];
  const departureCities = ['ICN','GMP','PUS','TAE','KWJ','CJU'];
  const vehicleTypes = ['auto','large','small'];
  const seasonDates = ['2026-07-15','2026-02-15','2026-04-15','2026-12-15','2026-01-15','2026-06-15'];
  const vipCounts = [0, 1, 5, 20, 100]; // 100은 participants보다 큰 경우도 테스트

  progEl.value = 'industry';
  orgEl.value = 'company';
  daysEl.value = '5';
  setChecked('incHotel', true); setChecked('incMeal', true); setChecked('incVehicle', true);
  setChecked('incGuide', true); setChecked('incSightseeing', true);

  const violations = [];
  let totalCombos = 0;
  const participantsFixed = 20;

  for (const dest of sampleDests) {
    destSel.value = dest;
    partEl.value = String(participantsFixed);

    for (const hg of hotelGrades) {
      setRadio('hotelGrade', hg);
      for (const rc of roomConfigs) {
        setRadio('roomConfig', rc);
        for (const vip of vipCounts) {
          if (vipEl) vipEl.value = String(vip);
          for (const dc of departureCities) {
            if (deptEl) deptEl.value = dc;
            for (const vt of vehicleTypes) {
              setRadio('vehicleType', vt);
              for (const sd of seasonDates) {
                if (startEl) startEl.value = sd;
                totalCombos++;
                let data;
                try {
                  data = getBreakdownData();
                } catch (e) {
                  violations.push({type:'exception', dest, hg, rc, vip, dc, vt, sd, msg: String(e)});
                  continue;
                }
                if (!data) {
                  violations.push({type:'null_data', dest, hg, rc, vip, dc, vt, sd});
                  continue;
                }
                if (!Number.isFinite(data.total) || data.total < 0) {
                  violations.push({type:'bad_total', dest, hg, rc, vip, dc, vt, sd, total: data.total});
                }
                if (!Number.isFinite(data.rooms) || data.rooms < 1) {
                  violations.push({type:'bad_rooms', dest, hg, rc, vip, dc, vt, sd, rooms: data.rooms, participantsFixed});
                }
                for (const r of data.rows) {
                  if (!Number.isFinite(r.amount) || r.amount < 0) {
                    violations.push({type:'bad_row_amount', dest, hg, rc, vip, dc, vt, sd, row: r.name, amount: r.amount});
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 포함항목 개별 해제 테스트 (별도 루프, 대표 목적지 3개)
  daysEl.value = '5'; partEl.value = '20';
  setRadio('hotelGrade', 'superior'); setRadio('roomConfig', 'double'); setRadio('vehicleType', 'auto');
  if (vipEl) vipEl.value = '0'; if (deptEl) deptEl.value = 'ICN'; if (startEl) startEl.value = '';
  const toggleFields = ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'];
  for (const dest of ['도쿄','파리','호주']) {
    destSel.value = dest;
    for (const field of toggleFields) {
      // 하나만 끄고 나머지는 켠 상태
      toggleFields.forEach(f => setChecked(f, f !== field));
      totalCombos++;
      let data;
      try {
        data = getBreakdownData();
      } catch (e) {
        violations.push({type:'toggle_exception', dest, offField: field, msg: String(e)});
        continue;
      }
      if (!data || !Number.isFinite(data.total) || data.total < 0) {
        violations.push({type:'toggle_bad_total', dest, offField: field, total: data ? data.total : null});
      }
    }
    // 전부 끈 경우 (항공/유류/마진/보험만 남음)
    toggleFields.forEach(f => setChecked(f, false));
    totalCombos++;
    try {
      const data = getBreakdownData();
      if (!data || !Number.isFinite(data.total) || data.total < 0) {
        violations.push({type:'all_off_bad_total', dest, total: data ? data.total : null});
      }
    } catch (e) {
      violations.push({type:'all_off_exception', dest, msg: String(e)});
    }
    toggleFields.forEach(f => setChecked(f, true));
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

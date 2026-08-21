/* ═══════════════════════════════════════════════════════════════════════════
   엔진 상수를 **엔진에서 읽는다** — 감사 도구용 단일 출처 (VL)
   ───────────────────────────────────────────────────────────────────────────
   `script.js`는 브라우저 코드라 `require`할 수 없다. 그래서 감사 도구들이 필요한
   상수를 **저마다 다시 적어** 왔고, 그 사본이 조용히 낡았다:

     audit_bus_capacity.js   `const CUR = 45;`  ← 엔진은 이미 **38**이다.
                             그 표는 「지금 정원 45로는 N건이 어긋난다」고 말하는데,
                             고객이 겪는 정원은 38이라 **틀린 진단**이었다.
     audit_rate_calibration  차량 실측을 인원과 무관하게 `vehicle_large`에 견줬다.
                             엔진은 25명 이하에서 `vehicle_small`을 쓰므로,
                             25명 이하 견적은 **고객이 보지도 않는 칸**과 대조됐다.

   VB에서 「요율을 고르는 자가 낡은 값으로 재고 있었다」와 정확히 같은 자리다.
   자가 틀리면 그 위에서 내린 판단이 전부 허수가 된다.

   ⚠ **못 읽으면 조용히 기본값으로 떨어지지 않는다 — 그 자리에서 죽는다.**
     기본값으로 떨어지면 「엔진이 바뀐 것」과 「파싱이 깨진 것」이 같은 얼굴이 되고,
     그게 이 파일이 없애려는 결함 그 자체다(결함 생성기 ②).
   ⚠ 파싱이라 깨질 수 있다. `test_vL_single_sources.js`가 값과 모양을 함께 잠근다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'script.js');

function readScript() {
  return fs.readFileSync(SCRIPT, 'utf8');
}

/* 대형/소형 버스 정원. 엔진: `const VEHICLE_CAPACITY = { large: 38, small: 25 };`
   이 값 하나가 **차량비와 가이드 인원을 함께** 움직인다(`guideCount = vehicleCount`). */
function vehicleCapacity() {
  const m = readScript().match(/const\s+VEHICLE_CAPACITY\s*=\s*\{\s*large:\s*(\d+)\s*,\s*small:\s*(\d+)\s*\}/);
  if (!m) {
    throw new Error('script.js에서 VEHICLE_CAPACITY를 못 읽었습니다 — '
      + '엔진에서 모양이 바뀌었으면 ai-loop/_engine_consts.js도 함께 고치세요. '
      + '(기본값으로 넘어가지 않습니다: 낡은 값으로 재는 것이 못 재는 것보다 나쁩니다)');
  }
  return { large: Number(m[1]), small: Number(m[2]) };
}

/* 이 인원이면 엔진이 어느 차량 칸을 쓰는가.
   엔진: `useLarge = vehicleTypeVal === 'auto' && participants > VEHICLE_CAPACITY.small`
   ⚠ 경계는 「초과」다 — 25명은 소형, 26명부터 대형. 「이상」으로 잘못 읽으면 25명짜리
     견적이 통째로 다른 칸과 대조된다. */
function vehicleFieldFor(pax) {
  const cap = vehicleCapacity();
  return Number(pax) > cap.small ? 'vehicle_large' : 'vehicle_small';
}

module.exports = { vehicleCapacity, vehicleFieldFor, SCRIPT };

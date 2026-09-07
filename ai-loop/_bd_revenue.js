/* ═══════════════════════════════════════════════════════════════════════════
   블랙다운 원가 → 가상 판매가 — **가정의 단일 출처** (ZA)
   ───────────────────────────────────────────────────────────────────────────
   2026-09-07 대표 결정 셋. 코드가 아니라 방침이라 여기 한 곳에만 적는다.

     ① **순차 마크업** — 원가 ×1.1 ×1.1 = **×1.21**
        하나투어가 랜드사 원가에 10%를 얹어 우리에게 주고, 우리가 다시 10%를 얹는다.
        (합산 ×1.2도, 판매가 대비 마진 ÷0.9÷0.9 = ×1.2346도 아니다.)
     ② **지상비에만 붙인다.** 항공·유류는 지금 요율표 값을 그대로 쓴다 —
        블랙다운에 애초에 항공이 없고, 항공은 마진 구조가 다르다.
     ③ 🔴 **이 값은 역검증 정답지가 아니다.** 우리가 정한 배수를 엔진이 맞히는지 재면
        **순환**이 된다(오차가 줄어도 그게 정확도인지 알 수 없다). 참고선으로만 본다.

   ⚠ **퍼센트를 다른 파일에 옮겨 적지 말 것.** 대표가 「차후에 천천히 맞춰가고 싶다」고
     하셨다 — 목적지별·규모별로 갈릴 수 있다. 그때 **이 파일 한 곳**만 고치면 파생된
     값이 전부 다시 계산되어야 한다. 두 곳에 적히는 순간 그게 불가능해진다(결함 생성기 ①).

   ⚠ **모든 파생값에 `assumed: true`가 붙는다.** 문서가 말한 원가와 우리가 얹은 가정이
     한 칸에 섞이면 되돌릴 수 없고, 나중에 「이 숫자 어디서 나왔지」를 답할 수 없다.

   실행: node ai-loop/_bd_revenue.js   — 지금 가정이 무엇인지만 찍는다
   ═══════════════════════════════════════════════════════════════════════════ */

/* 🔴 실거래가에 걸린 숫자다. 바꾸려면 대표 결정이 필요하다(추정치로 고치지 말 것). */
const ASSUMPTION = {
  결정일: '2026-09-07',
  방식: '순차 마크업',
  하나투어: 0.10,
  비즈페이지: 0.10,
  대상: '지상비',          // 항공·유류 제외
  근거: '2026-09-07 대표 결정. 목적지·규모별로 갈릴 수 있어 차후 조정 예정.',
};

/* 원가(지상비) → 가상 판매가. 통화는 안 바꾼다 — 넣은 통화 그대로 나온다. */
function applyRevenue(groundCost) {
  if (!Number.isFinite(groundCost) || groundCost <= 0) return null;
  const toHana = groundCost * (1 + ASSUMPTION.하나투어);
  const toCustomer = toHana * (1 + ASSUMPTION.비즈페이지);
  return {
    원가: groundCost,
    하나투어가: toHana,                       /* 우리가 받는 값 */
    판매가: toCustomer,                       /* 고객에게 내는 값 */
    하나투어수익: toHana - groundCost,
    비즈페이지수익: toCustomer - toHana,
    배수: toCustomer / groundCost,            /* = 1.21 */
    /* 🔴 이 표시를 떼지 말 것. 이 값은 문서에 없다 — 우리가 만든 것이다. */
    assumed: true,
    assumedBy: ASSUMPTION.결정일 + ' 대표 결정 (' + ASSUMPTION.방식 + ')',
  };
}

/* 실제로 잰 마크업과 견주기 위한 자리 — 원가와 판매가가 **둘 다** 있는 건에서만 쓴다.
   ⚠ 이것이 ①의 10%+10%를 언젠가 대체할 값이다. 지금은 표본이 없어 못 정한다. */
function measuredMarkup(groundCost, actualSell) {
  if (!Number.isFinite(groundCost) || !Number.isFinite(actualSell) || groundCost <= 0) return null;
  return {
    원가: groundCost, 실판매가: actualSell,
    실배수: actualSell / groundCost,
    가정배수: 1 + ASSUMPTION.하나투어 + ASSUMPTION.비즈페이지 + ASSUMPTION.하나투어 * ASSUMPTION.비즈페이지,
    차이: actualSell / groundCost - (1 + ASSUMPTION.하나투어) * (1 + ASSUMPTION.비즈페이지),
    assumed: false,                            /* 이건 잰 값이다 */
  };
}

module.exports = { ASSUMPTION, applyRevenue, measuredMarkup };

if (require.main === module) {
  const a = ASSUMPTION;
  console.log('■ 수익 가정 (' + a.결정일 + ' 대표 결정)\n');
  console.log('   방식      ' + a.방식);
  console.log('   하나투어  +' + (a.하나투어 * 100).toFixed(0) + '%');
  console.log('   비즈페이지 +' + (a.비즈페이지 * 100).toFixed(0) + '%');
  console.log('   대상      ' + a.대상 + ' (항공·유류 제외)');
  const ex = applyRevenue(1000000);
  console.log('\n   보기) 지상비 1,000,000');
  console.log('        → 하나투어가 ' + Math.round(ex.하나투어가).toLocaleString());
  console.log('        → 판매가     ' + Math.round(ex.판매가).toLocaleString() + '   (배수 ×' + ex.배수.toFixed(2) + ')');
  console.log('\n   🔴 이 값은 역검증 정답지가 아니다 — 우리가 정한 배수를 엔진이 맞히는지');
  console.log('      재면 순환이 된다. 참고선으로만 본다.');
}

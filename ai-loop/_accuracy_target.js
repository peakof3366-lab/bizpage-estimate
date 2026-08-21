/* ═══════════════════════════════════════════════════════════════════════════
   가견적 정확도의 **목표선 — 단일 출처** (VL)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-20 대표 결정: **「±10% 안에 들되, 틀릴 때는 높은 쪽으로」**

   ±5%가 아니라 ±10%인 이유 — 표본이 36건이라 ±5%를 겨냥하면 **잡음에 맞추게 된다.**
   하루에 표본 오류로 판단이 세 번 뒤집힌 적이 있다(VA·VB·VH).

   ⚠ **방향을 함께 센다.** |오차|만 보면 두 방향이 같은 얼굴이 되는데, 아픈 정도가 다르다:
       아래로 벗어남 = 견적서보다 **싸게** 불렀다 → 계약되면 그만큼 덜 남는다
       위로 벗어남   = **비싸게** 불렀다 → 실주 위험은 있지만 실견적에서 깎으면 된다
     깎는 것은 쉽고 올리는 것은 신뢰를 잃는다. 같은 크기여도 **아래가 더 아프다.**

   ── 왜 파일로 뺐는가 ────────────────────────────────────────────────────────
   VI가 목표선을 코드에 박았을 때는 `backtest_quotes.js` 한 곳이었다. VJ가
   `sim_margin_bands.js`에 두 번째 사본을 만들었고, 갈라지는 것을 막으려고
   test_vJ가 **backtest의 소스를 정규식으로 긁어** 두 값을 대조했다.

   그건 임시방편이다. 세 번째 도구(`audit_error_decomp.js`)가 생기는 순간 사본이
   셋이 되고, 대조 정규식도 늘어난다 — `limits.js`·`DEST_CLASSIFY`에서 이미 겪은
   **결함 생성기 ①**(목록이 여러 곳에 흩어져 하나를 빠뜨린다) 그대로다.
   → 값은 여기 한 줄이고, 쓰는 쪽은 전부 require한다. 대조가 아니라 **파생**이다.

   ⚠ 이 파일은 목표를 **대신 판단하지 않는다.** 몇 건이 안에 들었는지 세어 줄 뿐이다.
     목표선을 바꾸는 것은 대표 결정이고, 바꾸면 여기 한 줄만 고친다.

   ⚠ 고객 화면(`index.html`·`admin.html` FAQ)에도 「±10% 이내로 정확합니다」라는
     **문장**이 있다. 그건 이 상수에서 파생되지 않는다 — 마케팅 문구는 측정 목표와
     성격이 다르고(약속 vs 목표), 무엇보다 **지금 실측은 42%만 그 안에 있다.**
     문구를 이 값에 자동으로 물리면 못 지키는 약속이 자동으로 갱신된다.
     그 불일치는 사람이 판단할 일이라 결정대기열에 있다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 오차가 이 안이면 「목표 안」이다 (±10%) */
const TARGET = 0.10;

/* 틀린다면 이 방향이 낫다 — 중앙값이 이 범위에 있으면 방향까지 맞은 것이다 */
const AIM_LOW = 0.03;
const AIM_HIGH = 0.05;

/* 오차 배열(비율, -0.419 = 41.9% 싸다)을 목표선으로 세어 준다.
   ⚠ **빈 배열을 0건으로 얼버무리지 않는다** — 「목표 안 0건」과 「잰 것이 없다」는
     정반대 뜻인데 같은 숫자로 보이면 안 된다(결함 생성기 ②). */
function score(errs) {
  if (!Array.isArray(errs) || !errs.length) return null;
  const s = errs.slice().sort((a, b) => a - b);
  const q = (p) => {
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const below = s.filter((e) => e < -TARGET);
  const above = s.filter((e) => e > TARGET);
  return {
    n: s.length,
    inBand: s.filter((e) => Math.abs(e) <= TARGET).length,
    below: below.length,
    above: above.length,
    worstBelow: below.length ? below[0] : null,
    worstAbove: above.length ? above[above.length - 1] : null,
    median: q(0.5),
    p25: q(0.25),
    p75: q(0.75),
    spread: q(0.75) - q(0.25),
  };
}

/* 중앙값이 목표 **방향**까지 맞았는가 (+3~5%) */
function aimedRight(median) {
  return median >= AIM_LOW && median <= AIM_HIGH;
}

const LABEL = '±' + Math.round(TARGET * 100) + '% 안, 틀리면 높은 쪽 (2026-08-20 결정)';

module.exports = { TARGET, AIM_LOW, AIM_HIGH, LABEL, score, aimedRight };

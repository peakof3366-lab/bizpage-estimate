/* YI 검증 — 「우리 마진이 얇은가」(대기열 0-d)를 재는 자가 **딴 것을 재지 않는가**

   왜 —  0-d는 2026-08-13에 올라와 몇 주째 막혀 있었고, 그게 정확도 프로그램 전체를
   물고 있었다(「이게 안 정해지면 ±10% 달성의 뜻 자체가 없다」).

   못 답한 이유는 **두 값을 다른 원가 위에서 재고 있었기 때문**이다. 역검증은
   「우리 판매가 vs 그쪽 판매가」만 본다 — 그 차이 안에 원가 차이와 마진 차이가
   섞여 있어 가를 수가 없었다.

   `audit_margin_gap.js`는 `audit_error_decomp`의 **요율 천장**을 그대로 써서
   원가를 먼저 같게 만든 뒤, 그 위에서 양쪽이 얹은 비율을 나란히 잰다.

   ■ 나온 답 (고객용 견적서 23건)

       중앙값   우리 +17.6%   그쪽 +14.4%   차이 -1.9%
       부호 검정  9/23건이 그쪽 우위 · 우연히 이만큼 치우칠 확률 **40.5%**
       → 🔴 **어느 쪽이 더 얹는다고 말할 수 없다.** 「우리 마진이 얇다」는 성립하지 않는다.

   ⚠ 이 결론은 **부호 검정이 있어서** 낼 수 있는 것이다. 중앙값 차이 -1.9%만 보고
     「우리가 더 얹는다」고 했으면 YF에서 골프로 틀린 것과 똑같은 실수였다.

   실행: node ai-loop/test_yI_margin_gap.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};
const SRC = fs.readFileSync(path.join(__dirname, 'audit_margin_gap.js'), 'utf8');

/* ══ [1] 원가를 먼저 같게 만드는가 — 이게 이 도구의 전부다 ═══════════════ */
console.log('[1] 같은 원가 위에서 재는가');
{
  ok('천장 규칙을 audit_error_decomp에서 가져온다 (단일 출처)',
    /require\('\.\/audit_error_decomp\.js'\)/.test(SRC));
  ok('CELL·toEngineBasis를 여기서 다시 적지 않았다',
    !/const CELL\s*=/.test(SRC) && !/function toEngineBasis/.test(SRC));
  ok('원가소계 = 판매가 − 수익 − 보험', /perPerson - mar - ins/.test(SRC));
  ok('양쪽을 **같은 분모**로 잰다',
    /addOurs[\s\S]{0,120}s\.base/.test(SRC) && /addTheirs[\s\S]{0,120}s\.base/.test(SRC));
}

/* ══ [2] 줄 이름에 기대는 것을 숨기지 않는가 (결함 생성기 ②) ═════════════ */
console.log('\n[2] 마진 줄을 못 찾았을 때');
{
  /* ⚠ `per(/수익/)`은 엔진이 그 이름으로 렌더한다는 데 기댄다. 이름이 바뀌면
     조용히 0이 되고, 그러면 「우리는 아무것도 안 얹는다」가 된다. */
  ok('수익 줄이 0이면 그 건을 세지 않는다', /if \(!\(s\.mar > 0\)\)/.test(SRC));
  ok('몇 건이 그랬는지 화면에 말한다', /수익 줄을 못 찾은 건/.test(SRC));
  ok('그럴 때 숫자를 믿지 말라고 말한다', /믿지 마십시오|믿지 말/.test(SRC));
}

/* ══ [3] 🔴 우연 검사 — YF에서 배운 것 ══════════════════════════════════ */
console.log('\n[3] 치우쳤다고 말하기 전에 우연인지 재는가');
{
  ok('부호 검정이 있다', /부호 검정/.test(SRC));
  ok('짝지은 비교라 부호 검정이 맞다고 밝힌다', /짝지은 비교/.test(SRC));
  ok('우연 범위면 「말할 수 없다」고 한다', /말할 수 없다/.test(SRC));
  /* 이항 확률을 정확히 세는가 — 근사를 쓰면 표본 13건에서 어긋난다 */
  ok('이항분포를 정확히 센다(근사 안 씀)', /근사 안 쓴다/.test(SRC) && /Math\.pow\(2, n\)/.test(SRC));

  /* 검정 자체가 무디지 않은지 — 일부러 치우친 입력과 섞인 입력 (결함 생성기 ③) */
  const C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return r; };
  const sign = (n, k) => {
    let p = 0;
    for (let i = 0; i <= n; i++) {
      const t = C(n, i) / Math.pow(2, n);
      if (Math.abs(i - n / 2) >= Math.abs(k - n / 2)) p += t;
    }
    return p;
  };
  ok('23건 중 9건은 우연 범위다 (실제로 나온 값)', sign(23, 9) > 0.05, 'p=' + sign(23, 9).toFixed(3));
  ok('23건 중 21건이면 우연이 아니라고 한다', sign(23, 21) <= 0.05, 'p=' + sign(23, 21).toFixed(3));
  ok('반반이면 확률이 1에 가깝다', sign(20, 10) > 0.9, 'p=' + sign(20, 10).toFixed(3));
}

/* ══ [4] 섞으면 안 되는 것을 갈랐는가 ═══════════════════════════════════ */
console.log('\n[4] 원가 시트와 고객용을 갈라 세는가');
{
  /* 원가 시트의 「1인당」은 판매가가 아니다 — 섞으면 「그쪽이 덜 얹는다」로 기운다 */
  ok('원가 시트를 따로 센다', /isCost/.test(SRC));
  ok('고객용이 답이라고 못박는다', /0-d의 답/.test(SRC));
  ok('원가 시트는 참고라고 밝힌다', /참고만/.test(SRC));
}

/* ══ [5] 마진으로 오해할 수 있는 것을 함께 보여주는가 ═══════════════════ */
console.log('\n[5] 「더 얹었다」가 곧 마진은 아니다');
{
  ok('미분류 비중을 함께 찍는다', /미분류/.test(SRC));
  ok('그 돈이 실비일 수 있다고 말한다', /실비/.test(SRC));
  ok('실측 칸 수를 함께 찍는다 — 적으면 원가가 여전히 우리 것이다', /실측' \+ String\(r\.cells\)|실측\d*칸|r\.cells/.test(SRC));
  /* 🔴 이 표를 보고 요율을 만지면 안 된다 — 이미 맞춰 놓고 잰 값이다 */
  ok('요율을 다시 얹지 말라고 말한다', /요율 이야기를 다시 얹으면 안 된다/.test(SRC));
  /* 마진을 올리면 절반쯤이 현지 파트너에게 간다(0-d 보강) */
  ok('마진 인상분의 47%가 현지 몫이라고 알린다', /47%/.test(SRC));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — YI 마진 격차 측정`);
process.exit(fail ? 1 : 0);

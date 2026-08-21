/* VJ 검증: **구간별 마진 시뮬레이터** — 구간 판정과 안전장치.

   대표 2026-08-20: 「비쌀수록 수익률이 낮아지는 건 어쩔 수 없다. 정률이면 비쌀수록
   수익 금액이 커져 좋지만 고객이 부담을 느낀다. **구간별 정리가 필요하겠다.**」

   ⚠ 실측이 먼저 말한 것 — **체감 곡선은 이미 있다.** 마진이 정액이라 저절로 그렇게 된다:
       ~120만 18.8% · 120~180만 15.1% · 180~250만 12.3% · 250만~ 13.2%
     그리고 **오차가 벗어난 것은 저가 구간 하나뿐**이다(-16.6%, 나머지는 +4~6.5%).
     그래서 전 구간에 같은 배수를 걸면 **이미 맞는 구간까지 밀려난다**(VI에서 겪었다).

   여기서 고정하는 것:
   ① 구간 경계는 **「미만」**이다 — 경계값은 다음 구간으로 간다.
   ② 계획이 없으면 아무것도 안 바꾼다(배수 1).
   ③ 마지막 구간의 `max: null`이 나머지를 전부 받는다.
   ④ **require만 해도 시뮬레이션이 돌지 않는다** — 검사가 도구를 불러오는 순간
      엔진이 뜨고 코퍼스를 읽으면 안 된다(VA에서 못 박은 규칙).
   ⑤ 목표선은 역검증과 **같은 값**이어야 한다(두 곳에 적으면 갈라진다).

   실행: node ai-loop/test_vJ_margin_bands.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = path.join(ROOT, 'ai-loop');
const S = require(path.join(AI, 'sim_margin_bands.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const PLAN = [
  { max: 1200000, mul: 1.45 },
  { max: 1800000, mul: 1.00 },
  { max: 2500000, mul: 1.10 },
  { max: null, mul: 1.20 },
];

console.log('\n[1] 구간 경계는 「미만」이다');
{
  ok('① 경계 바로 아래는 그 구간', S.mulFor(1199999, PLAN) === 1.45);
  /* ⚠ 경계값 자체가 어느 쪽인지 흔들리면 걸친 건이 조용히 다른 구간으로 넘어간다 */
  ok('① 경계값은 다음 구간이다', S.mulFor(1200000, PLAN) === 1.00, String(S.mulFor(1200000, PLAN)));
  ok('① 가운데 구간', S.mulFor(1800000, PLAN) === 1.10);
  ok('① 마지막 구간(max null)이 나머지를 받는다', S.mulFor(9999999, PLAN) === 1.20);
  ok('① 0원도 첫 구간이다', S.mulFor(0, PLAN) === 1.45);
}

console.log('\n[2] 계획이 없으면 아무것도 안 바꾼다');
{
  ok('② 계획 null이면 배수 1', S.mulFor(1000000, null) === 1);
  ok('② 빈 계획도 배수 1', S.mulFor(1000000, []) === 1);
  /* mul이 비었거나 0이면 1로 둔다 — 0을 곱해 마진을 통째로 없애는 사고를 막는다 */
  ok('② mul이 없으면 1로 둔다', S.mulFor(100, [{ max: null }]) === 1);
  ok('② mul이 0이어도 마진을 없애지 않는다', S.mulFor(100, [{ max: null, mul: 0 }]) === 1);
}

console.log('\n[3] 목표선이 역검증과 같은 값이다 (VL: 대조가 아니라 파생)');
{
  /* 예전엔 backtest 소스를 정규식으로 긁어 두 값을 견줬다. 이제 둘 다 같은 모듈을
     require하므로 **갈라질 수 없다** — 대조 대신 「정말로 그 모듈에서 오는가」를 본다.
     ⚠ 값 비교만 남기면 우연히 같은 리터럴을 적어도 통과한다. 출처를 함께 본다. */
  const bt = fs.readFileSync(path.join(AI, 'backtest_quotes.js'), 'utf8');
  const sm = fs.readFileSync(path.join(AI, 'sim_margin_bands.js'), 'utf8');
  const T = require('./_accuracy_target');
  ok('③ 두 도구의 목표선이 같다', S.TARGET === T.TARGET, 'sim=' + S.TARGET + ' vs 출처=' + T.TARGET);
  ok('③ 역검증이 출처를 require한다', /require\(['"]\.\/_accuracy_target['"]\)/.test(bt));
  ok('③ 시뮬레이터가 출처를 require한다', /require\(['"]\.\/_accuracy_target['"]\)/.test(sm));
}

console.log('\n[4] require만 해서는 시뮬레이션이 돌지 않는다');
{
  /* ⚠ 이 파일이 지금 여기까지 왔다는 것 자체가 증거다 — require 시점에 엔진이 뜨고
     코퍼스를 읽었다면 검사가 몇 분씩 걸리거나 그 자리에서 죽었을 것이다. */
  ok('④ 불러와도 엔진이 뜨지 않았다', typeof S.mulFor === 'function');
  const src = fs.readFileSync(path.join(AI, 'sim_margin_bands.js'), 'utf8');
  ok('④ require.main 가드가 있다', /require\.main !== module/.test(src));
}

console.log('\n[5] 못 재는 것을 스스로 밝힌다');
{
  const src = fs.readFileSync(path.join(AI, 'sim_margin_bands.js'), 'utf8');
  /* ⚠ 저가 구간의 -16.6%가 마진 문제인지 요율 문제인지 이 자는 못 가른다.
     그 구간 마진율이 이미 제일 높고, 안에 이웃 복사 단가(아오모리·가고시마)가 있다. */
  ok('⑤ 마진인지 요율인지 못 가른다고 말한다', /마진 문제인지 요율 문제인지|마진이 얇아서인지 요율이 낮아서인지/.test(src));
  ok('⑤ 실주율은 여기 없다고 말한다', /실주율/.test(src));
  /* ⚠ 마진을 올리면 현지 수익금도 함께 오른다 — 「우리가 그만큼 더 남는다」로 읽히면 안 된다 */
  ok('⑤ 현지 수익금이 함께 오르는 것을 말한다', /현지 수익금/.test(src) && /47%/.test(src));
  /* ⚠ 중앙값만 보고 좋아졌다고 하지 않는다(SD 경고 · VB에서 실제로 겪었다) */
  ok('⑤ 폭이 벌어지면 그렇게 말한다', /폭이 벌어졌다/.test(src));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

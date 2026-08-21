/* VI 검증: **목표선이 코드에 박혀 있고, 방향을 구분해서 센다.**

   2026-08-20 대표 결정: **「±10% 안에 들되, 틀릴 때는 높은 쪽으로」**

   왜 ±5%가 아닌가 — 표본이 36건이라 ±5%를 겨냥하면 **잡음에 맞추게 된다.**
   하루에 표본 오류로 판단이 세 번 뒤집힌 적이 있다(VA 중복 · VB 낡은 요율 · VH 골프).
   ±5%는 표본이 100건대는 돼야 의미가 있다.

   왜 방향을 나누는가 — 그동안 |오차|만 봤는데 두 방향은 **아픈 정도가 다르다**:
       아래로 벗어남 = 견적서보다 **싸게** 불렀다 → 계약되면 그만큼 덜 남는다
       위로 벗어남   = **비싸게** 불렀다 → 실주 위험은 있으나 실견적에서 깎으면 된다
   깎는 것은 쉽고 올리는 것은 신뢰를 잃는다. 같은 크기여도 **아래가 더 아프다.**
   실측(2026-08-20): 목표 안 14/36건 · **아래 14건** · 위 8건 · 중앙값 -3.0%(반대쪽).

   ⚠ 이 검사는 **숫자가 좋아졌는지를 보지 않는다.** 좋아지고 나빠지는 것은 그날의 표본이
     정하고, 여기서 고정할 것은 **무엇을 목표로 삼기로 했는가**와 **어떻게 세는가**다.

   실행: node ai-loop/test_vI_target_band.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = path.join(ROOT, 'ai-loop');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const bt = fs.readFileSync(path.join(AI, 'backtest_quotes.js'), 'utf8');
const cf = fs.readFileSync(path.join(AI, 'audit_cost_floor.js'), 'utf8');

console.log('\n[1] 목표선이 ±10%로 박혀 있다 (VL: 단일 출처)');
{
  const T = require('./_accuracy_target');
  const src = fs.readFileSync(path.join(AI, '_accuracy_target.js'), 'utf8');
  ok('① 목표선이 코드에 있다', typeof T.TARGET === 'number', String(T.TARGET));
  ok('① 값이 ±10%다', T.TARGET === 0.10, String(T.TARGET));
  /* ⚠ 왜 ±5%가 아닌지가 코드에 남아 있어야 한다 — 없으면 다음 사람이 그냥 조인다 */
  ok('① ±5%가 아닌 이유가 적혀 있다', /표본이 36건|잡음에 맞추게/.test(src));
  /* ⚠ 역검증은 이제 **파생**이어야 한다. 자기 사본을 다시 들면 갈라진다 */
  ok('① 역검증이 단일 출처에서 파생한다', /_accuracy_target/.test(bt) && /TARGETS\.TARGET/.test(bt));

  /* ── 사본이 다시 생기는 것을 막는다 (test_vB의 전수 훑기와 같은 자리) ──────
     도구가 늘 때마다 목표선을 제 파일에 적으면, 대조 정규식도 함께 늘려야 한다.
     그 구조를 없애려고 파생으로 바꿨으므로 **리터럴 사본 자체를 금지**한다. */
  const strays = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && f !== '_accuracy_target.js' && !f.startsWith('test_'))
    .filter((f) => /const\s+TARGET\s*=\s*0?\.\d/.test(fs.readFileSync(path.join(AI, f), 'utf8')));
  ok('① 목표선 리터럴 사본이 없다', strays.length === 0, strays.join(', '));

  /* 빈 입력을 0건으로 얼버무리면 「목표 안 0건」과 「잰 것이 없다」가 같은 얼굴이 된다 */
  ok('① 잰 것이 없으면 null을 준다(0건이라 하지 않는다)', T.score([]) === null);
  ok('① 방향을 나눠 센다', (() => { const s = T.score([-0.3, 0, 0.3]); return s.below === 1 && s.above === 1 && s.inBand === 1; })());
}

console.log('\n[2] 방향을 두 갈래로 센다');
{
  ok('② 아래로 벗어난 것을 따로 센다', /err < -TARGET/.test(bt));
  ok('② 위로 벗어난 것을 따로 센다', /err > TARGET/.test(bt));
  /* 같은 크기여도 아래가 더 아프다는 것을 화면이 말해야 한다 */
  ok('② 아래쪽이 더 아프다고 말한다', /이쪽이 더 아프다/.test(bt));
  ok('② 위쪽은 실견적에서 깎을 수 있다고 말한다', /깎을 수 있다/.test(bt));
  /* ⚠ VL 이후 방향 범위도 단일 출처에서 파생한다 — 문구를 하드코딩하면 값을 바꿔도
     화면은 옛 범위를 계속 말한다(문서가 코드보다 앞서가는 자리, VB에서 겪었다) */
  ok('② 목표 방향(+3~5%)을 함께 찍는다', /AIM_LOW/.test(bt) && /AIM_HIGH/.test(bt));
}

console.log('\n[3] 원가 하한도 같은 여행을 두 번 세지 않는다');
{
  ok('③ audit_cost_floor가 _same_trip을 쓴다', /_same_trip/.test(cf));
  ok('③ 뺀 것을 화면에 말한다', /droppedNote/.test(cf));
}

console.log('\n[4] 허용 건수가 **구성 변화**를 숨기지 않는다');
{
  /* ⚠ 건수만 보는 검사의 맹점 — 3에서 3으로 같아도 안이 바뀌었을 수 있다.
     실제로 그랬다: 삿포로 ×2가 ×1로 준 것은 고쳐서가 아니라 같은 파일이 두 벌이었기
     때문이고(VA), 그 자리를 미야코지마 신규 위반이 채웠다(VD). */
  ok('④ 구성이 바뀐 사실이 적혀 있다', /구성이 바뀌었다/.test(cf));
  ok('④ 미야코지마가 신규 위반임을 적었다', /미야코지마 -14\.5%\(신규\)|미야코지마를 별도 목적지로 넣으면서 다시 나타났다/.test(cf));
  ok('④ 삿포로가 줄어든 이유가 「고쳐서가 아니다」라고 적혀 있다', /두 번 세던 것을 멈춘 것/.test(cf));
  /* 여유가 0.1%뿐인 건도 위험하다는 것을 남긴다 — 원가 위라고 안전한 게 아니다 */
  ok('④ 여유가 얇은 건을 경고로 남겼다', /여유가 0\.1%뿐인 건/.test(cf));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

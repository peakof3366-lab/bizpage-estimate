/* ═══════════════════════════════════════════════════════════════════════════
   YR — **견적서가 쌓일수록 요율 가드가 느슨해지고 있었다**
   ───────────────────────────────────────────────────────────────────────────
   대표 방침(2026-08-10): 견적서는 46건에서 멈추지 않고 **계속 는다.**
   그 전제로 `apply_rate_updates.js`의 가드를 다시 보니 두 자리가 위험했다.

   ■ ① 배율 문턱이 표본이 늘자마자 **넓어지기만** 했다

       예전:  1건 → 2.0배 허용 ·  2건 이상 → **3.0배** 허용
       즉 가장 흔들리는 **2건짜리 중앙값에 가장 넓은 문**을 내주고 있었다.
       문서가 쌓이는 것 자체가 위험을 키우는 모양이다.

       지금:  1건 2.0 · 2건 2.5 · 3건 이상 3.0 — 근거가 두꺼울수록 허용한다.

   ■ ② 🔴 골프 견적서에서만 나온 값이 그대로 요율이 될 수 있었다

       골프 문서는 **골프조/관광조로 갈려** 차량·관광이 「전원」이 아니라 조 인원
       기준으로 적힌다. 그 값이 요율이 되면 **골프 아닌 그 목적지 손님 전부**가 문다.
       실측(2026-09-03): 제주도 호텔 제안의 근거 **2건이 둘 다 고은회 골프 여행**이라,
       이 가드가 없었으면 170,000 → 120,000이 그대로 올라갔다.
       (대기열 0-m·0-p에 「견적서가 한 장만 더 들어오면 통과한다」고 적어 둔 그 자리다.)

   🔴 잠그는 것 다섯:
     ① 배율 문턱이 표본 수에 매달려 있고, **2건에서 3.0배를 주지 않는다**
     ② 골프 문서에서만 나온 칸은 **보류**된다
     ③ 🔴 **`golf_fee`는 면제다** — 골프 요금이 골프 문서에서 나오는 건 당연하다.
        여기 걸면 ⛳ 목록이 20건이 되고 **진짜 봐야 할 건이 묻힌다**
     ④ 골프 문서가 **섞여 있으면** 보류하지 않는다(비교할 근거가 있다는 뜻이다)
     ⑤ 🔴 **판정을 못 하면 「골프 아님」으로 넘기지 않는다** — `--apply`가 막힌다.
        모르는 것을 통과시키면 이 가드는 있으나 마나다(결함 생성기 ②)

   실행: node ai-loop/test_yR_rate_guards.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { capFor, golfHold, RATIO_BY_SAMPLES, SINGLE_MAX_RATIO } = require('./apply_rate_updates.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — YR 요율 가드가 표본을 따라간다`);
  process.exit(fail ? 1 : 0);
};

console.log('\n[1] 🔴 ① 배율 문턱이 표본 수를 따라간다');
{
  ok('① 1건은 2.0배', capFor(1) === 2.0, String(capFor(1)));
  /* 🔴 여기가 이번에 조인 자리다. 예전엔 2건부터 바로 3.0배였다. */
  ok('🔴 ① 2건은 2.5배 (예전엔 3.0배였다)', capFor(2) === 2.5, String(capFor(2)));
  ok('① 3건은 3.0배', capFor(3) === 3.0, String(capFor(3)));
  ok('① 10건도 3.0배를 넘지 않는다', capFor(10) === 3.0, String(capFor(10)));
  ok('① 0건이어도 문이 열리지 않는다', capFor(0) === SINGLE_MAX_RATIO, String(capFor(0)));

  /* **단조 증가여야 한다** — 표본이 느는데 문턱이 좁아지면 그것도 이상하다.
     그리고 어디서도 3.0을 넘으면 안 된다(그 위는 「오독인지부터」 보는 구간이다). */
  let 단조 = true, 상한지킴 = true;
  for (let n = 1; n <= 30; n++) {
    if (capFor(n) < capFor(n - 1)) 단조 = false;
    if (capFor(n) > 3.0) 상한지킴 = false;
  }
  ok('① 표본이 늘 때 문턱이 줄지 않는다', 단조);
  ok('🔴 ① 어떤 표본 수에서도 3.0배를 넘지 않는다', 상한지킴);
  ok('① (대조군) 문턱표가 비어 있지 않다', RATIO_BY_SAMPLES.length >= 3, String(RATIO_BY_SAMPLES.length));
}

console.log('\n[2] 🔴 ②④ 골프 문서에서만 나온 값은 보류한다');
{
  const 골프 = new Map([['고은회 제주도.pdf', true], ['고은회_(제주도).pdf', true],
    ['좋은친구 홍콩.pdf', false], ['다낭 비골프.pdf', false]]);

  const 둘다골프 = golfHold('hotel_per_room', ['고은회 제주도.pdf', '고은회_(제주도).pdf'], 골프);
  ok('🔴 ② 근거가 전부 골프면 보류한다', 둘다골프.hold === true, JSON.stringify(둘다골프));
  ok('② 몇 건인지 이유에 적는다', /2건/.test(둘다골프.이유 || ''), String(둘다골프.이유));

  const 섞임 = golfHold('hotel_per_room', ['고은회 제주도.pdf', '다낭 비골프.pdf'], 골프);
  ok('🔴 ④ 섞여 있으면 보류하지 않는다', 섞임.hold === false, JSON.stringify(섞임));

  const 비골프 = golfHold('hotel_per_room', ['좋은친구 홍콩.pdf'], 골프);
  ok('④ 골프가 없으면 보류하지 않는다', 비골프.hold === false);

  /* 같은 문서가 여러 줄로 들어와도 **문서 수로** 센다 */
  const 중복 = golfHold('hotel_per_room',
    ['고은회 제주도.pdf', '고은회 제주도.pdf', '고은회 제주도.pdf'], 골프);
  ok('② 같은 문서를 여러 번 줘도 1건으로 센다', 중복.전체 === 1, JSON.stringify(중복));

  ok('② 근거가 아예 없으면 보류하지 않는다', golfHold('hotel_per_room', [], 골프).hold === false);
}

console.log('\n[3] 🔴 ③ `golf_fee`는 면제다 — 여기 걸면 진짜가 묻힌다');
{
  const 골프 = new Map([['후아힌 골프.pdf', true]]);
  const g = golfHold('golf_fee', ['후아힌 골프.pdf'], 골프);
  ok('🔴 ③ 골프 요금 칸은 보류하지 않는다', g.hold === false, JSON.stringify(g));
  ok('③ 면제라고 표시한다(조용히 넘기지 않는다)', g.면제 === true, JSON.stringify(g));
  /* 대조군 — 같은 문서라도 다른 칸이면 걸려야 한다. 안 그러면 ③이 아니라
     「그 문서를 통째로 안 본다」가 되어 ②가 무력해진다. */
  ok('③ (대조군) 같은 문서라도 차량 칸은 보류된다',
    golfHold('vehicle_large', ['후아힌 골프.pdf'], 골프).hold === true);
}

console.log('\n[4] 🔴 ⑤ 판정을 못 하면 「골프 아님」으로 넘기지 않는다');
{
  const 모름 = golfHold('vehicle_large', ['무엇이든.pdf'], null);
  ok('⑤ 보류는 안 한다(제안 자체를 못 만들면 아무것도 못 본다)', 모름.hold === false);
  /* 🔴 여기가 핵심 — 「골프 아님」과 「모름」이 구별돼야 부르는 쪽이 막을 수 있다 */
  ok('🔴 ⑤ **모른다고 표시한다**', 모름.알수없음 === true, JSON.stringify(모름));
  const 아님 = golfHold('vehicle_large', ['비골프.pdf'], new Map([['비골프.pdf', false]]));
  ok('⑤ 「골프 아님」에는 그 표시가 없다', !아님.알수없음, JSON.stringify(아님));
}

console.log('\n[5] 🔴 ⑤ 판정을 못 했으면 `--apply`가 실제로 막힌다');
{
  /* 소스를 본다 — 위 [4]는 함수가 「모른다」고 말하는지까지고,
     **그 말을 듣고 쓰기를 멈추는지**는 다른 문제다(결함 생성기 ③: 안전망이
     실제로 실행된 적 있는가). 주석은 걷어내고 본다 — 설명을 근거로 삼지 않는다. */
  const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'apply_rate_updates.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* ⚠ **`!golfByFile`만 찾으면 안 된다** — 같은 조건이 `golfHold` 안에도 있어서
     처음 쓴 정규식은 **함수 안쪽을 잡고** 「멈추는 줄이 없다」고 말했다.
     쓰기를 막는 그 줄은 **빠져나갈 스위치와 함께** 있는 쪽이다. 그걸로 가리킨다. */
  ok('🔴 ⑤ golfByFile이 없으면 쓰기를 멈추는 줄이 있다',
    /!golfByFile\s*&&\s*argv\.indexOf\('--skip-golf-guard'\)\s*<\s*0[\s\S]{0,400}process\.exit\(1\)/.test(src),
    (src.match(/!golfByFile\s*&&[\s\S]{0,60}/) || ['(못 찾음)'])[0].replace(/\s+/g, ' ').slice(0, 90));
  ok('⑤ 빠져나갈 스위치가 명시적으로 있다', /--skip-golf-guard/.test(src));
  /* dry-run은 막히면 안 된다 — 무엇이 올라올지는 봐야 하고 그건 아무것도 안 바꾼다 */
  ok('⑤ 그 멈춤이 dry-run **뒤에** 있다(보는 것까지 막지 않는다)',
    src.indexOf('dry-run이라 아무것도') < src.indexOf('!golfByFile &&'),
    src.indexOf('dry-run이라 아무것도') + ' vs ' + src.indexOf('!golfByFile &&'));
}

console.log('\n[6] 부르는 쪽이 이 함수를 실제로 쓰는가');
{
  const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'apply_rate_updates.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  ok('⑥ 제안을 만들 때 golfHold를 부른다', /golfHold\(g\.cell,\s*g\.files,\s*golfByFile\)/.test(src));
  ok('⑥ 배율 문턱을 capFor로 정한다', /capFor\(g\.vals\.length\)/.test(src));
  /* 🔴 예전 상수 방식이 남아 있으면 두 규칙이 공존한다(결함 생성기 ①) */
  ok('🔴 ⑥ 옛 방식(`vals.length >= 2 ? MAX_RATIO :`)이 남아 있지 않다',
    !/vals\.length\s*>=\s*2\s*\?\s*MAX_RATIO/.test(src));
}

done();

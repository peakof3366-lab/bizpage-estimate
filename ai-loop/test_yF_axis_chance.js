/* YF 검증 — 「축이다」라고 말하기 전에 **우연인지 먼저 재는가**

   왜 —  이 저장소는 「무리를 좁혀 폭이 줄었다」를 진전으로 읽는 착시를 이미 한 번
   막아 뒀다(`audit_corpus_fitness`의 무작위 폭 대조, VN). 그런데 **중앙값 쪽에는
   그 대조가 없었다.** 조건이 `Math.abs(중앙값 차이) >= 10%` 하나뿐이라, 걸리기만 하면
   「🔴 미통과 무리가 통째로 쏠려 있다 — 폭이 아니라 중앙값으로 드러나는 축이다」라고
   **검정 없이 단정**했다.

   🔴 실제로 거기 걸렸다. 골프 축을 고치고(YD) 다시 재니 이렇게 나왔다:

       ① 골프인데 요율에 골프 요금 없음  4건  중앙값 -17.7%
       ② 골프이고 요율에 골프 요금 있음  4건  중앙값  -1.1%

   그래서 「골프 요금 4곳만 넣으면 16.6%p가 사라진다」고 보고할 뻔했다. 순열 검정을
   붙여 보니 **28.7%** — 우연 범위다. ①의 4건 중 둘(신한 푸꾸옥 -0.7% · 신한 발리
   +6.5%)은 이미 목표 안이고, ②에는 오키나와 -30.0%가 들어 있다. 「골프 일정인가」
   자체로 갈라도 **34.4%**로 무작위와 다르지 않다. **골프는 축이 아니다.**

   ⚠ 그렇다고 YD가 헛일은 아니다 — 그 전에는 이 축을 **잴 수조차 없었다**(무리가
     3건씩이라 MIN_GROUP 미달). 잴 수 있게 되고 나서야 기각할 수 있었다.

   여기서 고정하는 것:
   ① 중앙값 쏠림에도 무작위 대조가 붙어 있고, 씨앗이 고정돼 답이 재현된다.
   ② 「축이라 부르지 말 것」이라고 말할 줄 안다 — 늘 「축이다」라고만 하면 잣대가 아니다.
   ③ 골프 유래 실측에 ⛳ 표시가 붙는다(요율을 올리기 전에 사람이 보게).

   실행: node ai-loop/test_yF_axis_chance.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

const FIT = fs.readFileSync(path.join(__dirname, 'audit_corpus_fitness.js'), 'utf8');
const CAL = fs.readFileSync(path.join(__dirname, 'audit_rate_calibration.js'), 'utf8');

/* ══ [1] 중앙값 쏠림에 무작위 대조가 붙어 있는가 ═══════════════════════════ */
console.log('[1] 중앙값도 우연인지 잰다');
{
  ok('순열 검정 함수가 있다', /function randomMedianGaps/.test(FIT));
  ok('쏠림을 말할 때 그 검정을 부른다',
    /통째로 쏠려|한쪽으로 쏠려/.test(FIT) && /randomMedianGaps\(/.test(FIT));
  ok('「그만큼 벌어질 비율」을 숫자로 찍는다', /벌어질 비율/.test(FIT));
  /* 🔴 늘 「축이다」라고만 말하면 그건 잣대가 아니다 — 기각할 줄 알아야 한다 */
  ok('우연 범위면 「축이라 부르지 말 것」이라고 말한다', /축이라 부르지 말 것/.test(FIT));
}

/* ══ [2] 씨앗이 고정돼 있는가 — 돌릴 때마다 답이 바뀌면 근거로 못 쓴다 ═════ */
console.log('\n[2] 답이 재현되는가');
{
  ok('씨앗 고정 난수를 쓴다', /seededRandom\(\d+\)/.test(FIT));
  ok('중앙값 검정도 씨앗을 고정한다',
    /randomMedianGaps[\s\S]{0,200}seededRandom\(\d+\)/.test(FIT));
}

/* ══ [3] 검정이 실제로 동작하는가 — 일부러 갈린 입력과 안 갈린 입력 ════════ */
console.log('\n[3] 일부러 망가뜨려 본다 (결함 생성기 ③)');
{
  /* 도구 안의 함수를 그대로 꺼내 쓸 수 없으므로(파일이 즉시 실행된다) 같은 규칙을
     여기서 최소한으로 재현해 **검정 자체가 갈라내는지**만 본다.
     ⚠ 값을 판정하는 자리가 아니다 — 판정은 도구가 한다. 여기는 「검정이 무딘 자가
       아니다」를 보이는 자리다. */
  const med = (a) => { const t = a.slice().sort((x, y) => x - y); const i = (t.length - 1) / 2;
    return t.length % 2 ? t[i] : (t[Math.floor(i)] + t[Math.ceil(i)]) / 2; };
  let s = 20260902 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pOf = (bad, good) => {
    const all = bad.concat(good), gap = med(bad) - med(good);
    let hit = 0;
    for (let d = 0; d < 4000; d++) {
      const pool = all.slice();
      for (let j = pool.length - 1; j > 0; j--) {
        const k = Math.floor(rnd() * (j + 1)); const t = pool[j]; pool[j] = pool[k]; pool[k] = t;
      }
      if (med(pool.slice(0, bad.length)) - med(pool.slice(bad.length)) <= gap) hit++;
    }
    return hit / 4000;
  };
  /* 또렷하게 갈린 입력 — 검정이 이걸 우연이라 하면 너무 무디다 */
  const clear = pOf([-0.5, -0.45, -0.42, -0.40], Array.from({ length: 28 }, (_, i) => 0.02 + i * 0.002));
  ok('또렷하게 갈린 무리는 우연이 아니라고 한다', clear <= 0.05, 'p=' + clear.toFixed(3));
  /* 섞여 있는 입력 — 검정이 이걸 축이라 하면 내가 걸린 그 함정이다 */
  const mixed = pOf([-0.42, -0.35, -0.01, 0.07], [0.05, -0.30, 0.04, 0.06, -0.06, 0.02, 0.03, -0.02]);
  ok('섞여 있는 무리는 우연 범위라고 한다', mixed > 0.05, 'p=' + mixed.toFixed(3));
}

/* ══ [4] 골프 유래 실측에 표시가 붙는가 ═══════════════════════════════════ */
console.log('\n[4] 요율을 올리기 전에 사람이 보게 하는가');
{
  ok('요율 보정이 _golf_scope를 쓴다', /require\('\.\/_golf_scope'\)/.test(CAL));
  ok('칸마다 골프 유래 건수를 센다', /golfN/.test(CAL));
  ok('⛳ 표시를 찍는다', /⛳/.test(CAL));
  /* ⚠ **거르지 않는다.** 골프 여행도 실제 거래다 — 사람이 보고 판단할 자리다. */
  ok('거르지 않고 표시만 한다고 밝힌다', /거르지 않고 표시만 한다/.test(CAL));
  ok('왜 부푸는지(조 인원으로 나뉜 값) 적혀 있다', /조 인원으로 나뉜 값/.test(CAL));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — YF 축 판정의 우연 검사`);
process.exit(fail ? 1 : 0);

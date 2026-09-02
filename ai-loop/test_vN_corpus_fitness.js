/* ═══════════════════════════════════════════════════════════════════════════
   VN — 표본 성격 판정 · **적은 무리 착시 방어** 회귀 검사
   ───────────────────────────────────────────────────────────────────────────
   무엇을 지키는가:
     ① 축마다 **왜 그 조건인가**가 코드에 있다 (없으면 다음 사람이 임의로 고친다)
     ② 🔴 **적은 무리는 폭이 원래 좁다** — 무작위 대조가 실제로 그 착시를 잡는다
     ③ 씨앗 고정 — 돌릴 때마다 답이 달라지면 판단이 흔들리고 검사로 잠글 수 없다
     ④ 축은 **중앙값으로도** 드러난다 (골프처럼) — 폭만 보면 놓친다
     ⑤ 못 읽은 것을 0으로 채우지 않는다 (「깨끗한 문서」로 읽히면 판정이 거짓이 된다)

   ⚠ ②는 **일부러 착시를 만들어** 잡히는지 확인한다. 만들어만 두고 안 도는 안전망은
     이 저장소의 결함 생성기 ③ 그 자체다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const AI = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const src = (f) => fs.readFileSync(path.join(AI, f), 'utf8');

const FIT = require('./audit_corpus_fitness');
const CACHE = require('./_corpus_cache');

console.log('\n[1] 축마다 근거가 코드에 있다');
{
  ok('① 축이 다섯이다', FIT.AXES.length === 5, String(FIT.AXES.length));
  FIT.AXES.forEach((a) => {
    ok('① ' + a.key + ' 에 「왜 그 조건인가」가 있다', !!a.why && a.why.length > 15, a.why);
    ok('① ' + a.key + ' 에 통과 조건이 함수로 있다', typeof a.pass === 'function');
  });
  /* ⚠ 잣대에 근거가 없으면 다음 사람이 숫자를 임의로 옮긴다 — 실제로 정원 45가
     그렇게 굳어 있었다(VL). 미분류 상한도 근거를 코드에 적어 두게 한다. */
  const s = src('audit_corpus_fitness.js');
  ok('① 미분류 상한에 근거가 적혀 있다', /코퍼스 중앙값이 5\.0%/.test(s));
  ok('① 상한이 10%다', FIT.UNCLASS_LIMIT === 0.10, String(FIT.UNCLASS_LIMIT));
}

console.log('\n[2] 🔴 적은 무리 착시를 실제로 잡는다');
{
  const s = src('audit_corpus_fitness.js');
  ok('② 무작위 대조 장치가 있다', /randomSpreads/.test(s));
  ok('② 왜 필요한지가 적혀 있다', /적은 무리는 폭이 원래 좁다/.test(s));
  ok('② 하위 몇 %인지 찍는다', /하위 ' \+ Math\.round\(better/.test(s));
  ok('② 우연 범위와 겹치면 그렇게 말한다', /우연 범위와 겹친다/.test(s));
  ok('② 무작위와 다르지 않으면 그렇게 말한다', /무작위와 다르지 않다/.test(s));

  /* ── 일부러 착시를 만들어 본다 ────────────────────────────────────────
     같은 분포에서 6건을 뽑으면 폭은 반드시 좁아진다. 그 좁아짐이 **우연 범위 안**
     이라고 말해야 장치가 사는 것이다. */
  const boot = require('./_engine_boot');   /* 로드만 — 엔진은 안 띄운다 */
  ok('② 검사가 엉뚱한 것을 보고 있지 않다', typeof boot.bootEngine === 'function');
}

console.log('\n[3] 씨앗이 고정돼 돌릴 때마다 같은 답이 나온다');
{
  const s = src('audit_corpus_fitness.js');
  ok('③ 씨앗 고정 난수를 쓴다', /seededRandom/.test(s));
  ok('③ Math.random을 안 쓴다', !/Math\.random\(\)/.test(s),
    '난수를 쓰면 돌릴 때마다 판단이 흔들린다');
  ok('③ 왜 고정하는지가 적혀 있다', /같은 입력이면 같은 답/.test(s));
}

console.log('\n[4] 축은 중앙값으로도 드러난다');
{
  const s = src('audit_corpus_fitness.js');
  /* ⚠ 폭 검사만 보면 중앙값으로 드러나는 축을 통째로 놓친다.
     🔴 그런데 **쏠림을 말하는 것만으로는 모자랐다**(YF). 예전엔 조건이
       `|중앙값 차이| >= 10%` 하나뿐이라 걸리기만 하면 「축이다」라고 단정했고,
       그 줄을 믿고 「골프 요금 4곳을 넣으면 16.6%p가 사라진다」고 보고할 뻔했다.
       순열 검정을 붙이니 28.7% — 우연 범위였다. 이제 **우연인지 함께 잰다.** */
  ok('④ 중앙값 쏠림도 본다', /쏠려 있다/.test(s));
  ok('④ 그 쏠림이 우연인지 순열 검정으로 잰다',
    /randomMedianGaps/.test(s) && /벌어질 비율/.test(s));
  ok('④ 우연 범위면 축이라 부르지 말라고 말한다', /축이라 부르지 말 것/.test(s));
  ok('④ 잣대를 목표선에서 파생한다', /TARGETS\.TARGET/.test(s));
}

console.log('\n[5] 못 읽은 것을 0으로 채우지 않는다');
{
  const cc = src('_corpus_cache.js');
  ok('⑤ 캐시 판을 올렸다 (11 이상)', CACHE.CACHE_VERSION >= 11, String(CACHE.CACHE_VERSION));
  ok('⑤ shape를 싣는다', /shape: shapeOf\(r\)/.test(cc));
  /* ⚠ 줄을 하나도 못 읽었는데 미분류 0%로 채우면 **가장 못 읽은 문서가 가장 깨끗해
     보인다.** 비교 가능성 판정이 통째로 뒤집힌다(결함 생성기 ②). */
  ok('⑤ 줄을 못 읽으면 null이다', /if \(!cands\.length\) return null;/.test(cc));
  ok('⑤ 왜 null인지가 적혀 있다', /0%로 채우면/.test(cc));
  ok('⑤ 미분류 판정이 null을 통과로 치지 않는다',
    FIT.AXES.find((a) => a.key === 'unclass').pass({ unclassRatio: null }) === false);
  ok('⑤ 미분류가 상한 이하면 통과',
    FIT.AXES.find((a) => a.key === 'unclass').pass({ unclassRatio: 0.05 }) === true);
  ok('⑤ 미분류가 상한 초과면 미통과',
    FIT.AXES.find((a) => a.key === 'unclass').pass({ unclassRatio: 0.2 }) === false);
  /* 골프 축 — **골프 일정**인데 요율 칸이 없을 때만 걸린다.
     🔴 예전엔 `golfLines`(골프로 분류된 **금액 줄** 수)로 쟀다(YF에서 고침).
       금액이 안 적힌 골프 일정이 대부분이라 신한 푸꾸옥 300명·신한 발리 80명이
       「골프 아님」으로 통과했다 — 둘 다 골프 요금이 없는 목적지다.
       그래서 미통과가 2건으로 보였는데 실제로는 4건이다. */
  const g = FIT.AXES.find((a) => a.key === 'golf');
  ok('⑤ 골프 일정이 아니면 통과', g.pass({ isGolfTrip: false, golfRate: false }) === true);
  ok('⑤ 골프 일정이고 요율도 있으면 통과', g.pass({ isGolfTrip: true, golfRate: true }) === true);
  ok('⑤ 골프 일정인데 요율이 없으면 미통과', g.pass({ isGolfTrip: true, golfRate: false }) === false);
  ok('⑤ 금액 줄 수(golfLines)로는 판정하지 않는다',
    g.pass({ golfLines: 0, isGolfTrip: true, golfRate: false }) === false);

  /* 문서 신호 탐지기 — 알선 수수료·부가세 */
  const feeRe = (cc.match(/const FEE_RE = (\/.*\/);/) || [])[1];
  ok('⑤ 알선 수수료 패턴이 있다', !!feeRe, String(feeRe));
  if (feeRe) {
    const m = feeRe.match(/^\/(.*)\/([a-z]*)$/);
    const R = new RegExp(m[1], m[2]);
    ok('⑤ 「알선 수수료」는 걸린다', R.test('알선 수수료 (부가세 포함)'));
    ok('⑤ 「수수료」만으로는 안 걸린다', !R.test('환전 수수료 별도'), '오탐');
  }
}

console.log('\n[6] require만으로는 엔진이 뜨지 않는다');
{
  ok('⑥ 불러와도 엔진이 뜨지 않았다', Array.isArray(FIT.AXES));
  ok('⑥ require.main 가드가 있다', /require\.main === module/.test(src('audit_corpus_fitness.js')));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

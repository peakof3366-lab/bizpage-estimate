/* ═══════════════════════════════════════════════════════════════════════════
   VL — 칸별 오차 분해 · 단일 출처 정리 회귀 검사
   ───────────────────────────────────────────────────────────────────────────
   무엇을 지키는가:
     ① 판정·캐시·엔진 상수가 **한 곳**에서 오고, 도구들이 사본을 다시 만들지 않는다
     ② 차량 칸이 **인원에 따라** 갈린다 (25명 소형 / 26명 대형) — 두 구현이 일치한다
     ③ 칸을 바꿔 재고 나면 **반드시 되돌린다** (안 되돌리면 표 전체가 조용히 오염된다)
     ④ 엔진 상수를 못 읽으면 **그 자리에서 죽는다** (기본값으로 안 넘어간다)
     ⑤ require만으로는 엔진이 뜨지 않는다

   ⚠ ②·③은 **실제로 걸어 보고** 확인한다. 소스를 읽어 「그렇게 적혀 있다」로 끝내면
     그게 바로 이 저장소의 결함 생성기 ③(안 도는 안전망)이다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const AI = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const CONST = require('./_engine_consts');
const CMP = require('./_comparable');
const CACHE = require('./_corpus_cache');
const DECOMP = require('./audit_error_decomp');

const src = (f) => fs.readFileSync(path.join(AI, f), 'utf8');

console.log('\n[1] 판정·캐시가 한 곳에서 온다');
{
  const bt = src('backtest_quotes.js');
  const dc = src('audit_error_decomp.js');
  ok('① 역검증이 _comparable을 쓴다', /require\(['"]\.\/_comparable['"]\)/.test(bt));
  ok('① 분해기도 _comparable을 쓴다', /require\(['"]\.\/_comparable['"]\)/.test(dc));
  /* ⚠ 판정을 두 곳에 적으면 두 도구가 **다른 표본**을 재게 되고, 그러면 「분해한 합」과
     역검증의 오차가 서로 다른 이야기를 한다. 숫자만 봐서는 못 잡는 종류다. */
  ok('① 역검증이 판정 규칙을 다시 적지 않는다',
    !/paxConflict/.test(bt) && !/departWhy/.test(bt),
    '역검증에 판정 규칙 사본이 남아 있다');
  ok('① 역검증이 추출·캐시를 다시 구현하지 않는다',
    !/pdf-parse/.test(bt) && /_corpus_cache/.test(bt));
  ok('① 캐시 판이 올라갔다(evidence 칸 추가)', CACHE.CACHE_VERSION >= 7, String(CACHE.CACHE_VERSION));
  ok('① 캐시가 via를 싣는다', /via:\s*Object\.keys\(r\.evidence/.test(src('_corpus_cache.js')));
}

console.log('\n[2] 대조 가능 판정이 **왜 뺐는지**를 말한다');
{
  const no = CMP.comparable({ file: 'x', dest: { key: '푸꾸옥' }, pax: 30, deposit: 900000,
    dates: { days: 5, departDate: '2026-01-01' } }, 'sell');
  ok('② 원가 시트를 「못 읽음」으로 뭉뚱그리지 않는다',
    !no.ok && /원가 시트라 판매가가 없다/.test(no.why), no.why);
  const fx = CMP.comparable({ file: 'y', dest: { key: '푸꾸옥' }, pax: 30,
    needsFx: { currency: 'USD', rowCount: 15 }, dates: { days: 5, departDate: '2026-01-01' } }, 'sell');
  ok('② 외화·환율 없음을 따로 말한다', !fx.ok && /환율이 없다/.test(fx.why), fx.why);
  const yes = CMP.comparable({ file: 'z', dest: { key: '푸꾸옥' }, pax: 30, perPerson: 1500000,
    dates: { days: 5, departDate: '2026-01-01' } }, 'sell');
  ok('② 대조 가능하면 여행 조건을 그대로 준다',
    yes.ok && yes.dest === '푸꾸옥' && yes.pax === 30 && yes.days === 5 && yes.actual === 1500000);
  /* 인원이 문서 계산과 어긋나면 재지 않는다(UU) — 틀린 인원의 오차는 엔진 오차로 둔갑한다 */
  const pc = CMP.comparable({ file: 'w', dest: { key: '푸꾸옥' }, pax: 30, perPerson: 1500000,
    paxConflict: { docPax: 30, impliedPax: 33 }, dates: { days: 5, departDate: '2026-01-01' } }, 'sell');
  ok('② 인원 어긋남은 몇 명인지까지 적는다', !pc.ok && /33명/.test(pc.why), pc.why);
}

console.log('\n[3] 엔진 상수를 엔진에서 읽는다 — 못 읽으면 죽는다');
{
  const cap = CONST.vehicleCapacity();
  const engine = src('../script.js').match(/const\s+VEHICLE_CAPACITY\s*=\s*\{\s*large:\s*(\d+)\s*,\s*small:\s*(\d+)\s*\}/);
  ok('③ 읽은 값이 엔진과 같다',
    engine && cap.large === Number(engine[1]) && cap.small === Number(engine[2]),
    JSON.stringify(cap));
  /* ⚠ 경계는 「초과」다 — 25명은 소형. 「이상」으로 읽으면 25명짜리가 통째로 다른 칸과 대조된다 */
  ok('③ 경계가 「초과」다 (25명 소형)', CONST.vehicleFieldFor(cap.small) === 'vehicle_small');
  ok('③ 경계가 「초과」다 (26명 대형)', CONST.vehicleFieldFor(cap.small + 1) === 'vehicle_large');
  /* ⚠ 낡은 사본이 다시 생기는 것을 막는다 — audit_bus_capacity가 45로 굳어 있던 자리 */
  const strays = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && f !== '_engine_consts.js' && !f.startsWith('test_'))
    .filter((f) => /VEHICLE_CAPACITY\s*=\s*\{|const\s+CUR\s*=\s*\d+/.test(src(f)));
  ok('③ 정원 리터럴 사본이 없다', strays.length === 0, strays.join(', '));
}

console.log('\n[4] 차량 칸이 인원에 따라 갈린다 — 두 구현이 일치한다');
{
  ok('④ 엔진 줄 이름에서 소형을 읽는다',
    DECOMP.vehicleFieldOf({ rows: [{ name: '차량 (소형 · 자동적용)' }] }) === 'vehicle_small');
  ok('④ 엔진 줄 이름에서 대형을 읽는다',
    DECOMP.vehicleFieldOf({ rows: [{ name: '차량 (대형 · 자동적용)' }] }) === 'vehicle_large');
  /* ⚠ 차량 줄이 없으면 **null**이다. 여기서 대형으로 떨어지면 차량을 안 쓰는 여행이
     차량 칸과 대조된다(조용한 폴백, 결함 생성기 ②). */
  ok('④ 차량 줄이 없으면 null이다', DECOMP.vehicleFieldOf({ rows: [{ name: '항공' }] }) === null);
  const calib = src('audit_rate_calibration.js');
  ok('④ 교정표가 인원으로 칸을 고른다', /vehicleFieldFor\(r\.pax\)/.test(calib));
  ok('④ 교정표가 차량을 두 칸으로 나눠 찍는다',
    /vehicle_small: '차량\(소\)'/.test(calib) && /vehicle_large: '차량\(대\)'/.test(calib));
  ok('④ 버스 정원 감사가 엔진 값을 읽는다',
    /_engine_consts.*vehicleCapacity\(\)\.large/.test(src('audit_bus_capacity.js')));
}

console.log('\n[5] require만으로는 엔진이 뜨지 않는다');
{
  /* ⚠ 이 파일이 여기까지 왔다는 것 자체가 증거다 — require 시점에 엔진이 뜨고 코퍼스를
     읽었다면 검사가 몇 분씩 걸리거나 그 자리에서 죽었을 것이다(VA·VJ와 같은 가드). */
  ok('⑤ 불러와도 엔진이 뜨지 않았다', typeof DECOMP.vehicleFieldOf === 'function');
  ok('⑤ require.main 가드가 있다', /require\.main === module/.test(src('audit_error_decomp.js')));
}

console.log('\n[6] 목표선을 여기서 다시 적지 않는다');
{
  const dc = src('audit_error_decomp.js');
  ok('⑥ 분해기가 목표선을 파생한다',
    /require\(['"]\.\/_accuracy_target['"]\)/.test(dc) && !/const\s+TARGET\s*=\s*0?\.\d/.test(dc));
}

/* ── ⑦ 실제로 걸어 본다 — 엔진을 띄워 되돌리기와 경계를 확인 ─────────────────
   ⚠ 여기까지가 이 검사의 핵심이다. 위의 소스 검사는 「그렇게 적혀 있다」까지만 말한다. */
(async () => {
  console.log('\n[7] 칸을 바꿔 재고 나면 되돌린다 (엔진을 실제로 띄운다)');
  let engineOk = true;
  try {
    const { run, runWith, rowOf } = await DECOMP.bootEngine();
    const trip = { dest: '푸꾸옥', pax: 36, days: 5, date: '2026-10-11' };
    const before = run(trip).perPerson;
    const row = rowOf('푸꾸옥');
    const savedMeal = row.meal_per_person;

    /* 일부러 크게 바꿔 돌린다 — 금액이 움직여야 하고, 끝나면 값이 제자리여야 한다 */
    const patched = runWith(trip, { meal_per_person: savedMeal * 10 }).perPerson;
    ok('⑦ 칸을 바꾸면 금액이 움직인다', patched > before, before + ' → ' + patched);
    ok('⑦ 바꾼 값이 제자리로 돌아왔다', row.meal_per_person === savedMeal,
      savedMeal + ' vs ' + row.meal_per_person);
    const after = run(trip).perPerson;
    ok('⑦ 다음 계산이 오염되지 않았다', after === before, before + ' vs ' + after);

    /* 예외가 나도 되돌아와야 한다 — finally가 실제로 도는지 본다 */
    try { runWith({ dest: '푸꾸옥', pax: NaN, days: 5, date: 'x' }, { meal_per_person: 1 }); } catch (e) { /* 무시 */ }
    ok('⑦ 도중에 실패해도 제자리로 돌아온다', row.meal_per_person === savedMeal);

    /* 차량 경계 — 엔진이 정말 25/26에서 갈리는지, `_engine_consts`와 같은 답인지 */
    const cap = CONST.vehicleCapacity();
    const small = DECOMP.vehicleFieldOf(run({ dest: '푸꾸옥', pax: cap.small, days: 5, date: '2026-10-11' }));
    const large = DECOMP.vehicleFieldOf(run({ dest: '푸꾸옥', pax: cap.small + 1, days: 5, date: '2026-10-11' }));
    ok('⑦ 엔진이 ' + cap.small + '명에서 소형을 쓴다', small === 'vehicle_small', String(small));
    ok('⑦ 엔진이 ' + (cap.small + 1) + '명에서 대형을 쓴다', large === 'vehicle_large', String(large));
    ok('⑦ 두 구현이 같은 답을 낸다',
      small === CONST.vehicleFieldFor(cap.small) && large === CONST.vehicleFieldFor(cap.small + 1));
  } catch (e) {
    engineOk = false;
    fail++;
    console.log('  ✗ ⑦ 엔진을 띄우지 못했다 → ' + e.message);
  }
  if (engineOk) { /* 위에서 개별로 셌다 */ }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

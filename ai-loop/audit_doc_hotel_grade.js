/* ═══════════════════════════════════════════════════════════════════════════
   문서가 말한 호텔 등급대로 돌리면 오차가 좁아지는가 (2026-09-17)
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 이 질문인가
   역검증(`backtest_quotes.js`)은 **모든 견적서를 기본 조건으로 돌린다** — 4성급·골프 없음.
   그런데 코퍼스의 견적서는 저마다 조건이 다르다. 2026-09-17에 한화손해보험 다낭 건을
   뜯어 보니, **5성급으로만 맞춰도 −40.9% → −32.8%(8.1%p)** 좁혀졌다.
   즉 우리가 재고 있는 오차 중 일부는 **엔진 탓이 아니라 자 탓**일 수 있다.

   ■ 🔴 이것은 기각된 가설 ②와 **다른 것이다** — 그 선을 넘지 않게 조심한다
   기각된 것은 「**사양 손잡이를 자유롭게 돌리면** 정확해진다」(VM)였다. 그때 실측은
   목표 안 15 → 28/36까지 갔지만 **문서 뒷받침이 0/11건**이라 과적합으로 기각했다
   (코퍼스에 「비즈니스석」 낱말이 0건인데 탐색은 7건에 비즈니스를 골랐다).
   여기서는 **탐색하지 않는다.** 문서가 적어 둔 등급을 **그대로** 넣고, 좁아지는지만 본다.
   좁아지지 않으면 **그 자리에서 죽는 가설**이고, 그것도 소득이다(다음 사람이 안 해도 된다).

   ■ ⚠ 판정 규칙 — 짐작하지 않는다
   · 문서에 3성/4성/5성 중 **정확히 하나만** 나올 때에만 쓴다. 둘 이상이면 **버린다**
     (「5성 또는 4성」은 어느 쪽인지 문서가 안 정한 것이다).
   · **「특급」·「디럭스」·「스위트」는 등급으로 안 친다.** 특급은 등급 표기가 아니라
     홍보 문구로도 쓰이고, 디럭스·스위트는 **객실 타입**이지 호텔 등급이 아니다.
     기각된 가설 ②가 「문서가 말하는 1인1실을 그대로 넣으면 오히려 나빠진다」로 걸린 것이
     정확히 이 혼동이었다. 따로 세어 보여만 준다.
   · 표본 수를 **반드시 함께 찍는다.** N이 한 자리면 어떤 결론도 못 낸다.

       node ai-loop/audit_doc_hotel_grade.js
   ═══════════════════════════════════════════════════════════════════════════ */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { loadCorpus, DEFAULT_CORPUS } = require('./_corpus_cache');
const { comparable } = require('./_comparable');
const { bootEngine } = require('./_engine_boot');
const pdfParse = require(path.join(ROOT, 'node_modules/pdf-parse'));

/* 등급 낱말. ⚠ 역슬래시 없는 정규식만 쓴다 — 이 저장소는 도구를 거치며 역슬래시가
   소실돼 검사가 조용히 통과한 적이 있다(audit_season_match.js와 같은 규칙). */
const LEVELS = [
  ['deluxe', '5성급', /5\s*성급|오성급|5\s*star/i],
  ['superior', '4성급', /4\s*성급|사성급|4\s*star/i],
  ['standard', '3성급', /3\s*성급|삼성급|3\s*star/i],
];
/* 등급으로 **안 치는** 낱말 — 세어서 보여만 준다 */
const WEAK = /특[0-9１]?급|디럭스|deluxe|스위트|suite|최고급|럭셔리/i;

const pct = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const quantile = (arr, q) => {
  if (!arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const spread = (arr) => quantile(arr, 0.75) - quantile(arr, 0.25);

(async () => {
  const corpus = await loadCorpus();
  const { run } = await bootEngine();

  const kept = [];
  const weakOnly = [];
  const ambiguous = [];
  let noGrade = 0;

  for (const c of corpus) {
    const cmp = comparable(c, 'sell');
    if (!cmp.ok) continue;                       /* 역검증과 같은 표본 규칙을 쓴다 */

    let text = '';
    try { text = (await pdfParse(fs.readFileSync(path.join(DEFAULT_CORPUS, c.file)))).text || ''; }
    catch (err) { console.log('  🔴 못 읽음: ' + c.file + ' (' + err.message + ')'); continue; }

    const found = LEVELS.filter(([, , re]) => re.test(text));
    if (found.length > 1) { ambiguous.push([c.file, found.map((f) => f[1]).join('·')]); continue; }
    if (found.length === 0) {
      if (WEAK.test(text)) weakOnly.push(c.file); else noGrade++;
      continue;
    }

    const [gradeKey, gradeLabel] = found[0];
    const { dest, pax, days, date, actual } = cmp;
    const base = run({ dest, pax, days, date });                        /* 기본 4성급 */
    const withGrade = run({ dest, pax, days, date }, { hotelGrade: gradeKey });
    if (!base || !base.perPerson || !withGrade || !withGrade.perPerson) continue;

    kept.push({
      file: c.file, dest, gradeLabel, gradeKey,
      errBase: (base.perPerson - actual) / actual,
      errDoc: (withGrade.perPerson - actual) / actual,
      moved: base.perPerson !== withGrade.perPerson,
      /* 🔴 등급을 올렸는데 금액이 그대로면 **먼저 이것부터 본다.** 2026-09-16 대표 결정으로
         「등급 역전 보정」이 들어갔다 — 5성이 4성보다 싸지는 자리에서 한 등급 아래 금액을
         바닥으로 깐다. 그 바닥이 걸린 것을 「요율이 등급을 안 받는다」로 읽으면
         **멀쩡한 장치를 결함이라 부르게 된다**(2026-09-17에 대만에서 실제로 그럴 뻔했다). */
      floored: !!withGrade.gradeFloor,
    });
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 문서가 말한 호텔 등급대로 돌리면 오차가 좁아지는가');
  console.log('══════════════════════════════════════════════════════════════════\n');

  console.log('역검증 표본 중 등급이 **또렷한** 건: ' + kept.length + '건');
  console.log('  · 등급 낱말이 둘 이상이라 버린 건: ' + ambiguous.length + '건');
  ambiguous.forEach(([f, g]) => console.log('      · ' + g + '  ' + f));
  console.log('  · 「특급·디럭스·스위트」만 있는 건(등급으로 안 침): ' + weakOnly.length + '건');
  weakOnly.forEach((f) => console.log('      · ' + f));
  console.log('  · 등급 낱말이 아예 없는 건: ' + noGrade + '건');

  if (kept.length < 3) {
    console.log('\n🔴 표본이 ' + kept.length + '건이다 — **어떤 결론도 못 낸다.**');
    console.log('   여기서 숫자를 읽으면 잡음에 맞추게 된다(목표선을 ±5%가 아니라 ±10%로');
    console.log('   잡은 것과 같은 이유). 표본이 쌓이면 다시 돌린다.');
    console.log('\n결과: 등급이 또렷한 표본 ' + kept.length + '건 — 판단 보류');
    return;
  }

  /* ⚠ **「안 움직였다」를 한 가지로 적으면 안 된다** — 2026-09-17에 실제로 틀렸다.
     대만이 문서상 5성급인데 「문서도 4성급」이라고 찍혔다. 금액이 안 움직였다는
     이유만으로 그렇게 적었기 때문이다. 둘은 전혀 다른 일이다:
       · 문서가 4성급 → 기본값과 같으니 **안 움직이는 게 맞다**
       · 문서가 3/5성급인데 안 움직임 → **요율이 등급을 반영하지 않는 자리다.**
         다낭 골프가 요율 0이라 골프를 켜도 1원도 안 달라지던 것과 같은 모양이다. */
  console.log('\n──── 건별 (기본 4성급 → 문서 등급) ────');
  const inertOffGrade = [];
  kept.sort((a, b) => a.errBase - b.errBase).forEach((r) => {
    let mark;
    if (r.moved) mark = Math.abs(r.errDoc) < Math.abs(r.errBase) ? '  ✅ 좁아짐' : '  🔴 벌어짐';
    else if (r.gradeKey === 'superior') mark = '  (문서도 4성급 — 안 움직이는 게 맞다)';
    else if (r.floored) mark = '  (등급 역전 보정이 바닥을 깔았다 — 정상)';
    else { mark = '  🔴 등급이 다른데 금액이 1원도 안 움직였다'; inertOffGrade.push(r); }
    console.log('  ' + r.dest.padEnd(8) + r.gradeLabel + '  '
      + pct(r.errBase).padStart(7) + ' → ' + pct(r.errDoc).padStart(7) + mark);
  });

  const b = kept.map((r) => r.errBase);
  const d = kept.map((r) => r.errDoc);
  const inTarget = (a) => a.filter((v) => Math.abs(v) <= 0.10).length;
  console.log('\n──── 분포 ────');
  console.log('              기본 4성급        문서 등급');
  console.log('  중앙값      ' + pct(quantile(b, 0.5)).padStart(8) + '        ' + pct(quantile(d, 0.5)).padStart(8));
  console.log('  사분위 폭   ' + (spread(b) * 100).toFixed(1).padStart(7) + '%        ' + (spread(d) * 100).toFixed(1).padStart(7) + '%');
  console.log('  ±10% 안     ' + String(inTarget(b)).padStart(6) + '건        ' + String(inTarget(d)).padStart(6) + '건   (' + kept.length + '건 중)');

  const moved = kept.filter((r) => r.moved);
  const better = moved.filter((r) => Math.abs(r.errDoc) < Math.abs(r.errBase)).length;
  console.log('\n──── 판정 ────');
  if (inertOffGrade.length) {
    console.log('  🔴 **등급이 다른데 금액이 안 움직인 건 ' + inertOffGrade.length + '건** — 이건 별건이다:');
    inertOffGrade.forEach((r) => console.log('      · ' + r.dest + ' (' + r.gradeLabel + ')'));
    console.log('      요율이 그 등급을 반영하지 않는다는 뜻이다(다낭 골프가 요율 0이라');
    console.log('      골프를 켜도 1원도 안 달라지던 것과 같은 모양). **따로 봐야 한다.**');
  }
  console.log('  실제로 금액이 움직인 건: ' + moved.length + '건 (문서가 4성급이면 안 움직인다)');
  if (moved.length) console.log('    그중 좁아진 건 ' + better + '건 · 벌어진 건 ' + (moved.length - better) + '건');
  const narrowed = spread(d) < spread(b);
  console.log('  사분위 폭: ' + (narrowed ? '✅ 좁아졌다' : '🔴 안 좁아졌다'));
  console.log('\n  ⚠ **폭이 안 좁아지면 이 갈래는 죽은 것이다.** 중앙값만 좋아진 것은');
  console.log('    분포를 옮긴 것이지 정확해진 것이 아니다(일괄 배율이 기각된 것과 같은 이유).');
  console.log('  ⚠ N=' + kept.length + '이다. 표본이 작으면 한 건이 사분위를 통째로 움직인다.');

  /* ⚠ `결과: N pass / M fail`로 끝내지 않는다 — 그건 회귀 검사(test_*)의 형식이다.
     이 도구가 내놓는 것은 **확인 대상**이지 합격/불합격이 아니다(audit_rates와 같은 성격). */
  console.log('\n결과: 표본 ' + kept.length + '건 · 금액이 움직인 건 ' + moved.length + '건 · 사분위 폭 '
    + (spread(b) * 100).toFixed(1) + '% → ' + (spread(d) * 100).toFixed(1) + '%');
})().catch((e) => { console.error('터짐:', e && e.message); process.exit(1); });

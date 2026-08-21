/* ═══════════════════════════════════════════════════════════════════════════
   **엔진이 이미 가진 손잡이로 그 여행을 담을 수 있는가** — 사양 손잡이 사거리 (VM)
   ───────────────────────────────────────────────────────────────────────────
   VL이 잰 것: 견적서마다 요율을 **완벽히** 맞춰도 폭이 22.6% → 27.7%로 벌어진다.
   → 남은 폭은 요율이 아니다. 그러면 무엇인가.

   가설: **여행마다 사양이 다르다.** 같은 목적지·인원·일수라도 5성급이냐 3성급이냐,
   비즈니스냐 이코노미냐, 골프가 있냐 없냐에 따라 실제 견적이 크게 갈린다. 요율표는
   한 벌뿐이라 그 차이를 담을 자리가 없다 — **단, 엔진에는 손잡이가 이미 있다.**

     호텔 등급  3성급 / 4성급(기본) / 5성급
     좌석 등급  이코노미(기본) / 비즈니스
     객실 구성  2인1실(기본) / 1인1실
     골프       끄기(기본) / 1라운드 / 2라운드   ← 요율에 golf_fee가 있는 곳만

   이 도구는 그 손잡이를 **실제로 돌려 보고** 두 가지를 답한다:
     ① 손잡이별 **사거리** — 하나를 돌리면 1인당이 몇 %p 움직이는가
     ② **담을 수 있는 건 / 없는 건** — 손잡이 조합으로 목표선 안에 드는가

   ── ⚠ 이 도구가 말하지 **않는** 것 ─────────────────────────────────────────
   **「그 사양이 맞다」고 말하지 않는다.** 여기서 재는 것은 엔진의 **표현력**이다.
   손잡이가 넷이면 웬만한 값은 맞출 수 있다 — 그래서 **몇 개를 돌렸는지**를 함께 찍고,
   **가장 적게 돌린 조합**을 고른다. 그래도 「5성급 + 전원 비즈니스」 같은 답이 나오면
   그건 맞춘 게 아니라 **구겨 넣은 것**이다. 그 판단은 사람이 한다.

   그래서 진짜 결과는 ②의 **뒷쪽**이다 — 손잡이를 다 돌려도 못 담는 건이 남으면,
   그건 **엔진에 없는 축**이다(섭외비·통역·특식 등급·현지 물가). 새 손잡이가 필요한
   자리를 이 목록이 가리킨다.

   ⚠ 요율은 **지금 값 그대로** 둔다. 요율까지 함께 움직이면 「손잡이가 담은 것」과
     「요율이 담은 것」이 섞여, 무엇이 부족한지 알 수 없게 된다(VL과 층을 나눈다).
   ⚠ 골프는 `golf_fee`가 0인 목적지에서 **켜지지 않는다**(대기열 0-m). 못 켠 곳은
     그렇게 밝힌다 — 조용히 빼면 「골프로는 안 되더라」는 거짓 결론이 나온다.

   ── 🔴 2026-08-21 첫 실행이 낸 답 — **가설이 기각됐다** ─────────────────────
   ②  자유 탐색:  목표 안 15 → **28/36**. 그런데 **문서가 뒷받침하는 fit은 0/11건**이다.
                  코퍼스 45건에 「비즈니스석」 낱말이 **0건**인데 탐색은 7건에 비즈니스를
                  골랐다. 맞춘 게 아니라 **크기가 비슷한 다른 원인**을 좌석이라 부른 것이다.
                  (실측 예: 다낭 26명의 진짜 원인은 골프다 — 대기열 0-m.)
   ②-a 문서대로: 「1인1실」이 적힌 9건에 그대로 넣으면 목표 안이 **7 → 3건으로 나빠진다.**
                  즉 그 낱말은 **전원 1인1실을 뜻하지 않는다**(「1인1실_조식포함」처럼 한 줄의
                  표기이거나 「1인1실 사용시 추가요금」 같은 조건문이다).

   → **「사양을 물어보면 정확해진다」는 길은 지금 데이터로 검증할 수 없다.**
     견적서가 좌석을 아예 안 적고(0/45), 객실은 적혀 있어도 뜻이 다르다.
     VL의 「요율을 맞춰도 안 된다」와 합치면 남은 폭은 **엔진이 담을 칸이 아예 없는 돈**
     쪽에 있다(`audit_gap_source`가 말한 미분류 12.4%). 거기가 다음 자리다.

   ⚠ **이 부정 결과를 지우지 말 것.** 지우면 다음 사람이 같은 가설을 다시 세운다.
     ②의 「28/36」만 옮겨 적는 것이 가장 위험하다 — 그 숫자는 **상한이지 달성치가 아니다.**

   실행:
     node ai-loop/audit_spec_knobs.js --cache
     node ai-loop/audit_spec_knobs.js --cache --top=12
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const { loadCorpus, DEFAULT_CORPUS } = require('./_corpus_cache');
const { comparable } = require('./_comparable');
const { dedupeTrips, droppedNote } = require('./_same_trip');
const { bootEngine, SPEC_DEFAULTS } = require('./_engine_boot');
const TARGETS = require('./_accuracy_target');

const args = process.argv.slice(2);
const USE_CACHE = args.includes('--cache');
const CORPUS = args.find((a) => !a.startsWith('--')) || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
const TOP = Number((args.find((a) => a.startsWith('--top=')) || '').split('=')[1]) || 10;
const BASIS = (args.find((a) => a.startsWith('--basis=')) || '').split('=')[1] || 'sell';

/* 손잡이와 그 값들. **기본값이 맨 앞**이어야 「몇 개를 돌렸는지」를 셀 수 있다. */
const KNOBS = [
  { id: 'hotelGrade', label: '호텔', values: ['superior', 'standard', 'deluxe'],
    name: { superior: '4성급', standard: '3성급', deluxe: '5성급' } },
  { id: 'cabinClass', label: '좌석', values: ['economy', 'business'],
    name: { economy: '이코노미', business: '비즈니스' } },
  { id: 'roomConfig', label: '객실', values: ['double', 'single'],
    name: { double: '2인1실', single: '1인1실' } },
];
/* 골프는 값이 아니라 켜고 끄는 것이라 따로 둔다 */
const GOLF = [null, { golf: true, golfRounds: 1 }, { golf: true, golfRounds: 2 }];
const GOLF_NAME = ['골프없음', '골프1R', '골프2R'];

const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const pp = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%p');
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};
const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const corpus = await loadCorpus({ corpus: CORPUS, useCache: USE_CACHE });
  const { run, rowOf } = await bootEngine();

  /* 역검증·오차 분해와 **같은 표본**을 본다(VL의 `_comparable`) */
  const trips = [];
  for (const c of corpus) {
    const cmp = comparable(c, BASIS);
    if (cmp.ok) trips.push(Object.assign({ file: c.file, hints: c.specHints || null }, cmp));
  }
  {
    const ded = dedupeTrips(trips, (t) => ({
      dest: t.dest, pax: t.pax, days: t.days, date: t.date, answer: t.actual, file: t.file,
    }));
    const note = droppedNote(ded.dropped);
    if (note) console.log('\n' + note);
    trips.length = 0;
    ded.kept.forEach((t) => trips.push(t));
  }
  console.log('\n대조 ' + trips.length + '건 · 사양 손잡이를 실제로 돌려 본다…\n');

  const rows = [];
  const ranges = {};              /* 손잡이별 사거리 */
  let golfBlocked = 0;            /* 요율에 골프 요금이 없어 못 켠 건 */

  for (const t of trips) {
    const trip = { dest: t.dest, pax: t.pax, days: t.days, date: t.date };
    const base = run(trip);
    if (!base || !base.perPerson) continue;
    const err0 = (base.perPerson - t.actual) / t.actual;

    /* ── ① 손잡이별 사거리 — 하나만 돌린다 ────────────────────────────── */
    KNOBS.forEach((k) => {
      k.values.slice(1).forEach((v) => {
        const spec = {}; spec[k.id] = v;
        const b = run(trip, spec);
        if (!b || !b.perPerson) return;
        const move = (b.perPerson - base.perPerson) / base.perPerson;
        const key = k.id + '|' + v;
        (ranges[key] = ranges[key] || { knob: k, value: v, moves: [] }).moves.push(move);
      });
    });
    /* 골프는 그 목적지에 요금이 있어야 켤 수 있다 */
    const row = rowOf(t.dest);
    const hasGolf = !!(row && Number(row.golf_fee) > 0);
    if (!hasGolf) golfBlocked++;
    if (hasGolf) {
      const b = run(trip, { golf: true, golfRounds: 1 });
      if (b && b.perPerson) {
        const move = (b.perPerson - base.perPerson) / base.perPerson;
        (ranges['golf|1'] = ranges['golf|1'] || { knob: { label: '골프', id: 'golf' }, value: '1R', moves: [] }).moves.push(move);
      }
    }

    /* ── ② 조합 탐색 — 목표 안에 들 수 있는가 ────────────────────────── */
    const cands = [];
    KNOBS[0].values.forEach((h) => KNOBS[1].values.forEach((c) => KNOBS[2].values.forEach((r) => {
      GOLF.forEach((g, gi) => {
        if (g && !hasGolf) return;
        const spec = Object.assign({ hotelGrade: h, cabinClass: c, roomConfig: r }, g || {});
        const b = run(trip, spec);
        if (!b || !b.perPerson) return;
        const err = (b.perPerson - t.actual) / t.actual;
        /* **몇 개를 돌렸는가** — 적게 돌린 답이 더 믿을 만하다 */
        let turned = 0;
        if (h !== SPEC_DEFAULTS.hotelGrade) turned++;
        if (c !== SPEC_DEFAULTS.cabinClass) turned++;
        if (r !== SPEC_DEFAULTS.roomConfig) turned++;
        if (gi > 0) turned++;
        cands.push({ err, turned, label: [KNOBS[0].name[h], KNOBS[1].name[c], KNOBS[2].name[r], GOLF_NAME[gi]] });
      });
    })));

    /* ── 🎯 **문서가 말하는 사양**을 그대로 넣어 본다 (VM) ────────────────────
       이것이 이 도구의 진짜 답이다. 아래 자유 탐색은 **엔진의 표현력**을 재는 것이고,
       여기는 **실제로 그 사양이었을 때 맞는가**를 잰다. 둘을 섞으면 과적합을 진전으로
       읽게 된다 — 실제로 첫 판에서 그럴 뻔했다(자유 탐색이 나트랑·상해에 「비즈니스」를
       골랐는데, 그 문서들이 말하는 것은 **1인1실**이었다). */
    const hintSpec = {};
    if (t.hints && t.hints.business) hintSpec.cabinClass = 'business';
    if (t.hints && t.hints.single) hintSpec.roomConfig = 'single';
    let hinted = null;
    if (Object.keys(hintSpec).length) {
      const b = run(trip, hintSpec);
      if (b && b.perPerson) {
        hinted = {
          err: (b.perPerson - t.actual) / t.actual,
          label: Object.keys(hintSpec).map((k) => (k === 'cabinClass' ? '비즈니스' : '1인1실')).join(' + '),
        };
      }
    }

    const inBand = cands.filter((x) => Math.abs(x.err) <= TARGETS.TARGET);
    /* 목표 안에 드는 것 중 **가장 적게 돌린** 것, 같으면 오차가 작은 것 */
    inBand.sort((a, b) => (a.turned - b.turned) || (Math.abs(a.err) - Math.abs(b.err)));
    /* 못 들면 그나마 가장 가까운 것 — 얼마나 모자란지 봐야 한다 */
    const best = cands.slice().sort((a, b) => Math.abs(a.err) - Math.abs(b.err))[0];

    rows.push({
      ...t, base: base.perPerson, err0, hasGolf,
      hinted,
      fit: inBand[0] || null,
      best,
      span: [Math.min.apply(null, cands.map((c) => c.err)), Math.max.apply(null, cands.map((c) => c.err))],
    });
  }

  /* ── ① 손잡이별 사거리 ─────────────────────────────────────────────── */
  console.log('════ ① 손잡이 하나를 돌리면 얼마나 움직이는가 ════\n');
  Object.keys(ranges).forEach((key) => {
    const r = ranges[key];
    const ms = r.moves;
    const nm = (r.knob.name && r.knob.name[r.value]) || r.value;
    console.log('  ' + wpad(r.knob.label, 6) + wpad(nm, 12)
      + '중앙값 ' + pp(median(ms)).padStart(8)
      + '   최소 ' + pp(Math.min.apply(null, ms)).padStart(8)
      + '   최대 ' + pp(Math.max.apply(null, ms)).padStart(8)
      + '   (' + ms.length + '건)');
  });
  console.log('\n  ⚠ 「기본에서 그 값으로」 돌렸을 때의 1인당 변화다. 지금 오차의 사분위 폭이');
  console.log('    ' + pct(TARGETS.score(rows.map((r) => r.err0)).spread) + '이므로, 사거리가 그보다 훨씬 작은 손잡이는');
  console.log('    **그 축을 물어봐도 폭이 안 줄어든다**는 뜻이다.');

  /* ── ②-a 🎯 **문서가 말하는 사양을 넣으면** — 이것이 진짜 답이다 ────────── */
  const now = TARGETS.score(rows.map((r) => r.err0));
  const withHints = rows.filter((r) => r.hinted);
  console.log('\n════ ②-a 🎯 문서가 말하는 사양을 그대로 넣으면 ════\n');
  const noText = rows.filter((r) => r.hints == null).length;
  console.log('  문서에서 사양을 읽은 건: ' + withHints.length + '/' + rows.length
    + (noText ? '  (본문을 못 얻은 ' + noText + '건 제외)' : ''));
  if (!withHints.length) {
    console.log('  없다 — 견적서가 좌석·객실을 말하지 않는다.');
  } else {
    withHints.forEach((r) => {
      const was = Math.abs(r.err0) <= TARGETS.TARGET;
      const now2 = Math.abs(r.hinted.err) <= TARGETS.TARGET;
      console.log('  ' + wpad(r.dest, 12) + wpad(r.pax + '명', 7)
        + pct(r.err0).padStart(7) + ' → ' + pct(r.hinted.err).padStart(7)
        + '   ' + wpad(r.hinted.label, 14)
        + (was && !now2 ? '  🔴 안에 있던 것이 나갔다' : !was && now2 ? '  ✅ 들어왔다' : ''));
    });
    const before = withHints.filter((r) => Math.abs(r.err0) <= TARGETS.TARGET).length;
    const after = withHints.filter((r) => Math.abs(r.hinted.err) <= TARGETS.TARGET).length;
    console.log('\n  그 ' + withHints.length + '건의 목표 안: ' + before + ' → **' + after + '건**');
    /* ⚠ 나빠지면 그렇게 말한다 — 좋아진 것만 세면 그게 SD가 경고한 자리다 */
    if (after < before) {
      console.log('  🔴 **나빠졌다.** 문서가 말하는 사양을 넣었는데 목표 밖으로 나간 건이 있다는 것은,');
      console.log('     그 낱말이 사양을 뜻하지 않았거나(「1인1실 사용시 추가요금」 같은 조건문),');
      console.log('     엔진의 1인1실 계수가 실제 싱글차지보다 크다는 뜻이다. 둘 다 확인 대상이다.');
    }
  }
  console.log('\n  ⚠ 「비즈니스」 신호는 코퍼스 45건에 **0건**이다 — 기업 연수 견적서는');
  console.log('    좌석 등급을 문서에 안 적는다. 그래서 좌석은 **문서로는 확인할 수 없다.**');

  /* ── ②-b 손잡이를 자유롭게 돌리면 = **상한**(과적합 포함) ────────────── */
  const fitted = rows.filter((r) => r.fit);
  console.log('\n════ ② 손잡이만으로 목표선 안에 들 수 있는가 ════\n');
  console.log('  목표선: ' + TARGETS.LABEL + '\n');
  console.log('  지금(기본 사양)      목표 안 ' + now.inBand + '/' + now.n);
  console.log('  손잡이를 돌리면      목표 안 **' + fitted.length + '/' + rows.length + '**');
  const already = rows.filter((r) => Math.abs(r.err0) <= TARGETS.TARGET).length;
  const newly = rows.filter((r) => r.fit && Math.abs(r.err0) > TARGETS.TARGET).length;
  console.log('    · 원래 안에 있던 건 ' + already + '건');
  console.log('    · 손잡이로 들어온 건 **' + newly + '건**');
  console.log('    · 손잡이를 다 돌려도 못 드는 건 **' + (rows.length - fitted.length) + '건**  ← 여기가 진짜 답이다');

  /* 몇 개를 돌려야 했나 — 많이 돌려야 맞는 건 「맞춘 것」이 아니다 */
  const byTurn = {};
  fitted.forEach((r) => { byTurn[r.fit.turned] = (byTurn[r.fit.turned] || 0) + 1; });
  console.log('\n  손잡이를 몇 개 돌려야 했나: '
    + Object.keys(byTurn).sort().map((k) => k + '개 ' + byTurn[k] + '건').join(' · '));
  console.log('  ⚠ 3개 이상 돌려야 맞는 건은 **맞춘 것이 아니라 구겨 넣은 것**으로 읽어야 한다.');

  /* ── 어느 손잡이가 실제로 일을 했나 — **실무에서 무엇을 물어야 하는지**가 여기서 나온다 */
  const brought = rows.filter((r) => r.fit && Math.abs(r.err0) > TARGETS.TARGET);
  if (brought.length) {
    console.log('\n  ── 손잡이로 들어온 ' + brought.length + '건 — 무엇을 돌렸나 ──');
    const useCount = {};
    brought.forEach((r) => {
      const changed = r.fit.label.filter((v, i) => {
        if (i === 0) return v !== KNOBS[0].name[SPEC_DEFAULTS.hotelGrade];
        if (i === 1) return v !== KNOBS[1].name[SPEC_DEFAULTS.cabinClass];
        if (i === 2) return v !== KNOBS[2].name[SPEC_DEFAULTS.roomConfig];
        return v !== GOLF_NAME[0];
      });
      changed.forEach((v) => { useCount[v] = (useCount[v] || 0) + 1; });
      /* ⚠ **문서가 그렇게 말하는가.** 이게 없으면 「맞출 수 있다」와 「실제로 그랬다」가
         구분되지 않는다 — 손잡이가 넷이면 웬만한 값은 우연히 맞기 때문이다(과적합).
         ✔ = 문서에 그 낱말이 있다 · ✗ = 없다 · ? = 본문을 못 얻어 대조 못 함 */
      const mark = (on) => (r.hints == null ? '?' : (on ? '✔' : '✗'));
      const back = [];
      if (changed.includes('비즈니스')) back.push('비즈니스' + mark(r.hints && r.hints.business));
      if (changed.includes('1인1실')) back.push('1인1실' + mark(r.hints && r.hints.single));
      console.log('     ' + wpad(r.dest, 12) + wpad(r.pax + '명', 7)
        + pct(r.err0).padStart(7) + ' → ' + pct(r.fit.err).padStart(7)
        + '   ' + wpad(changed.length ? changed.join(' + ') : '(기본 그대로)', 22)
        + (back.length ? ' 문서 ' + back.join(' ') : ''));
      r._backed = back.length ? back.every((b) => b.endsWith('✔')) : null;
    });
    console.log('\n     쓰인 손잡이: '
      + Object.keys(useCount).sort((a, b) => useCount[b] - useCount[a])
        .map((k) => k + ' ' + useCount[k] + '건').join(' · '));

    /* ── 🔴 여기가 이 도구의 핵심 경고다 ─────────────────────────────────
       문서가 뒷받침하지 않는 fit은 **맞춘 것이 아니라 우연히 맞은 것**이다.
       실측으로 아는 예: 다낭 26명(-41.9%)의 진짜 원인은 **골프**다(대기열 0-m).
       그 건이 「비즈니스」로 맞았다면 그것은 원인이 아니라 크기가 비슷해서다. */
    const checkable = brought.filter((r) => r._backed !== null);
    const backed = checkable.filter((r) => r._backed);
    console.log('\n     🔴 문서가 뒷받침하는 fit: **' + backed.length + '/' + checkable.length + '건**'
      + (checkable.length < brought.length
        ? '  (나머지 ' + (brought.length - checkable.length) + '건은 좌석·객실 손잡이가 아니라 대조 대상이 아니다)'
        : ''));
    console.log('     → 뒷받침 안 되는 건은 **다른 원인이 크기만 비슷했던 것**으로 읽어야 한다.');
    console.log('       실측 예: 다낭 26명의 진짜 원인은 골프다(0-m). 좌석으로 맞았다면 우연이다.');
    console.log('     → 그래서 「목표 안 ' + fitted.length + '건」은 **상한**이지 달성치가 아니다.');
  }

  /* ── ③ 못 담는 건 = 새 손잡이가 필요한 자리 ────────────────────────── */
  const missed = rows.filter((r) => !r.fit).sort((a, b) => Math.abs(b.best.err) - Math.abs(a.best.err));
  console.log('\n════ ③ 손잡이를 다 돌려도 못 담는 건 — **엔진에 없는 축** ════\n');
  if (!missed.length) console.log('  없다.');
  missed.slice(0, TOP).forEach((r) => {
    console.log('  ' + wpad(r.dest, 12) + wpad(r.pax + '명 ' + r.days + '일', 10)
      + '기본 ' + pct(r.err0).padStart(7)
      + ' → 최선 ' + pct(r.best.err).padStart(7)
      + '  (' + r.best.label.join('·') + ')'
      + (r.hasGolf ? '' : '  ⚠골프요금 없음'));
    console.log('       ' + r.file.slice(0, 60));
  });
  if (missed.length > TOP) console.log('  … 그 밖 ' + (missed.length - TOP) + '건');

  /* ── ④ 못 잰 것 ────────────────────────────────────────────────────── */
  console.log('\n════ 못 잰 것 ════');
  console.log('  · 요율에 **골프 요금이 없어 골프를 못 켠** 건: ' + golfBlocked + '건 (대기열 0-m)');
  console.log('    → 그 건들은 「골프로는 안 되더라」가 아니라 **아직 못 재 봤다**는 뜻이다.');
  console.log('  · 혼합 좌석·혼합 객실은 **인원을 함께 줘야** 뜻이 생겨 이번 탐색에서 뺐다.');
  console.log('    (비즈 몇 명·1인1실 몇 명인지는 견적서마다 다르고, 지금 그 값을 추출하지 않는다)');
  console.log('  · 프로그램 유형·기관 유형 계수도 뺐다 — 그건 사양이 아니라 **고객 분류**라');
  console.log('    같은 여행을 다르게 부르는 축이다. 섞으면 무엇이 담았는지 알 수 없어진다.');
}

/* ⚠ require만으로 엔진이 뜨고 코퍼스를 읽으면 안 된다 */
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { KNOBS, GOLF_NAME };

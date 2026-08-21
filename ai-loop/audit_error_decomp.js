/* ═══════════════════════════════════════════════════════════════════════════
   **이 견적서의 오차는 어느 칸에서 왔는가** — 칸별 오차 분해 (VL)
   ───────────────────────────────────────────────────────────────────────────
   지금 우리에게는 자가 둘 있는데 **서로 말을 하지 않는다**:

     backtest_quotes        「다낭 26명 5일은 -41.9%다」        ← 총액만 말한다
     audit_rate_calibration 「다낭 식비 요율은 실측의 ÷4.6이다」 ← 목적지별 칸만 말한다

   그래서 **어느 칸을 고치면 그 -41.9%가 얼마나 줄어드는지**를 아무도 모른다.
   VB가 「칸별 실측 중앙값을 넣자」를 시도했다가 기각된 것도 이 자리다 — 목적지
   중앙값은 그 목적지의 **어느 견적서**가 그 값을 끌었는지 말하지 못해서, 이미 맞는
   네 건을 밀어내며 한 건을 고치려 들었다(±10% 안 13 → 9건).

   이 도구는 **견적서 한 건 안에서** 그 건의 실측값으로만 잰다. 목적지 중앙값을
   섞지 않으므로 VB가 밟은 함정이 구조적으로 안 생긴다.

   ── 재는 법: 공식을 베끼지 않고 **엔진을 다시 돌린다** ──────────────────────
   칸 하나만 그 견적서의 실측값으로 바꿔 엔진을 다시 돌리고, 1인당 금액이 얼마나
   움직이는지를 본다.
     · 부대비용(20%)·마진 구간(VK)·인원/시즌 계수가 **그 위에 어떻게 얹히는지**를
       엔진이 알아서 처리한다. 손으로 더하면 그 계수를 두 번째로 구현하는 것이고,
       그건 이 저장소가 여섯 번 당한 결함 생성기 ①이다.
     · 호텔이 「객실당 1박」, 식비가 「1인 1일」, 관광이 「1인 전체 일정」처럼 칸마다
       단위가 다른데, 엔진에 넣으면 **단위 실수 자체가 불가능**해진다.

   ── 이 도구가 새로 답하는 것 ────────────────────────────────────────────────
   ① 한 건의 오차를 칸별로 쪼갠 표 (어디를 고치면 얼마가 움직이는가)
   ② 🎯 **요율 천장** — 그 견적서의 **모든 칸을 실측으로 맞췄을 때** 남는 오차.
      요율 작업으로 갈 수 있는 한계선이다. 여기 남는 것은 요율이 아니라 구조다
      (엔진에 칸이 없는 항목 · 좌석 등급 · 기관 섭외비 · 우리 마진 정책).
      **이 값이 폭을 얼마나 줄이는지가 「요율을 더 다듬어야 하는가」의 답**이다.

   ⚠ **칸별 기여의 합 ≠ 전부 바꾼 결과다.** 마진 구간(VK)은 원가소계로 판정하므로
     칸을 바꾸면 구간이 바뀔 수 있고, 계수는 곱으로 얹힌다. 둘 다 찍고 **차이를
     밝힌다** — 합이 맞는 척하면 그 비선형이 조용히 사라진다(결함 생성기 ②).
   ⚠ **검산된 값만 실측으로 쓴다**(plausibility.isTrusted). 못 믿는 칸은 바꾸지 않고
     **몇 칸을 못 쟀는지 함께 찍는다** — 안 쟀는데 0으로 보이면 「영향 없는 칸」이 된다.
   ⚠ **일부러 바꿨는데 금액이 안 움직이면 그렇게 말한다.** 엔진이 안 쓰는 요율 칸이
     있다는 뜻이고, 그건 조용히 넘길 일이 아니다(결함 생성기 ③).
   ⚠ 네트워크를 막는다 — 안 막으면 운영 DB의 `site_events`에 행이 쌓인다.

   실행:
     node ai-loop/audit_error_decomp.js            (추출부터)
     node ai-loop/audit_error_decomp.js --cache    (캐시 재사용, 빠름)
     node ai-loop/audit_error_decomp.js --cache --top=8   (자세히 볼 건수)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const { loadCorpus, DEFAULT_CORPUS } = require('./_corpus_cache');
const { comparable } = require('./_comparable');
const { dedupeTrips, droppedNote } = require('./_same_trip');
const TARGETS = require('./_accuracy_target');
const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));

const args = process.argv.slice(2);
const USE_CACHE = args.includes('--cache');
const CORPUS = args.find((a) => !a.startsWith('--')) || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
const TOP = Number((args.find((a) => a.startsWith('--top=')) || '').split('=')[1]) || 6;
const BASIS = (args.find((a) => a.startsWith('--basis=')) || '').split('=')[1] || 'sell';

/* 추출 항목 → 요율 칸. **audit_rate_calibration·admin.html과 같은 표여야 한다** —
   두 곳이 다르면 서로 다른 칸을 견준다(결함 생성기 ①).

   ⚠ **차량은 인원에 따라 칸이 갈린다.** 엔진은 `participants > VEHICLE_CAPACITY.small`
     (25명)일 때만 `vehicle_large`를 쓰고, 그 이하는 `vehicle_small`이다. 인원과 무관하게
     `vehicle_large`에 견주면 **25명 이하 견적은 고객이 보지도 않는 칸과 대조**하게 된다.
     이 도구의 「바꿨는데 금액이 안 움직인 칸」 가드가 첫 실행에서 정확히 이걸 잡았다
     (차량 6건). `audit_rate_calibration.js`도 같은 자리에 있었고 함께 고쳤다.
   ⚠ 임계값(25)을 여기 다시 적지 않는다 — **엔진이 그린 줄 이름**(「차량 (대형 · 자동적용)」)
     에서 읽는다. 상수를 베끼면 정원을 고칠 때 이 도구만 낡는다(script.js 주석의 경고 그대로). */
const CELL = {
  airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room',
  meal: 'meal_per_person', vehicle: 'vehicle_large', guide: 'guide_fee',
  sight: 'sightseeing_fee',
};

/* 엔진이 이 여행에서 실제로 쓴 차량 칸 이름을 그 출력에서 읽는다 */
function vehicleFieldOf(bd) {
  const row = (bd && bd.rows || []).find((r) => /^차량/.test(String(r.name || '')));
  if (!row) return null;                       /* 차량 줄이 없다 = 이 여행은 차량을 안 쓴다 */
  return /소형/.test(row.name) ? 'vehicle_small' : 'vehicle_large';
}

/* ── 🔴 **식비는 분모가 다르다** (VL) ───────────────────────────────────────
   엔진:   `const mealDays = days;`  — 여행 일수 **전부**에 식비를 매긴다.
   견적서: 끼니가 적힌 **날 수**로 나눈다. 실측(글로벌 베스트 푸꾸옥, 5일 일정):
             「식사 총액 16,920,840 ÷ 인원 100 ÷ **3일** = 56,403 (1인 1일)」

   두 값을 그대로 견주면 식비 배수가 통째로 부푼다. 실제 피해:
     · `audit_rate_calibration`이 푸꾸옥 식비를 「요율이 3.9배 낮다」고 찍었다.
       1인 전 일정으로 맞춰 보면 견적서 169,208 vs 엔진 73,440 — **2.3배**다.
     · 이 도구의 「요율 천장」이 그만큼 위로 밀려, 요율을 실측으로 맞추면 오히려
       나빠지는 것처럼 보였다.
     · 🔴 가장 위험한 곳은 여기가 아니다 — **관리자 화면의 요율 갱신 제안**이
       같은 값을 쓴다. 담당자가 그대로 승인하면 고객 식사비가 여행 일수만큼 부푼다.

   ⚠ **어느 쪽이 옳은지는 여기서 정하지 않는다.** 「요율의 식비가 *끼니 있는 날* 단가인가
     *여행 1일 평균*인가」는 도메인 판단이고, 고치는 방향에 따라 고객 금액이 움직인다.
     이 함수는 **엔진이 쓰는 기준으로 환산만** 하고, 환산했다는 사실을 표에 남긴다.
   ⚠ 나눈 일수를 모르면(`mealDayCount`가 없으면) **환산하지 않고 그 칸을 뺀다.**
     모르는 채로 그대로 넣으면 조용히 부푼 값을 재게 된다(결함 생성기 ②). */
function toEngineBasis(key, value, trip, bd) {
  if (key !== 'meal') return { value, note: null };
  const docDays = trip.mealDayCount;
  const engDays = bd && bd.mealDays;
  if (!engDays) return null;
  if (!docDays) return null;                    /* 몇 일로 나눴는지 모른다 — 빼고 밝힌다 */
  if (docDays === engDays) return { value, note: null };
  return {
    value: Math.round(value * docDays / engDays),
    note: '견적서 ' + docDays + '일치 → 엔진 ' + engDays + '일 기준으로 환산',
  };
}
const LABEL = {
  airfare: '항공', fuel: '유류', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광',
};

const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const pp = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%p');
const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());

/* 엔진 부팅은 **_engine_boot.js 하나가 진실**이다(VM). 예전엔 여기와 역검증에
   각각 있었고, 손잡이 도구가 생기면 세 벌이 됐다 — 네트워크 차단·운영 요율 얹기
   같은 것은 한 벌만 빠뜨려도 그 도구만 조용히 다른 것을 재게 된다. */
const { bootEngine } = require('./_engine_boot');

async function main() {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const corpus = await loadCorpus({ corpus: CORPUS, useCache: USE_CACHE });
  const { run, runWith, rowOf } = await bootEngine();

  /* ── 대조 가능한 건 모으기 — 역검증과 **같은 판정**을 쓴다(VL) ───────────── */
  const trips = [];
  for (const c of corpus) {
    const cmp = comparable(c, BASIS);
    if (!cmp.ok) continue;
    trips.push(Object.assign({ file: c.file, values: c.values || {}, via: c.via || {},
      mealDayCount: c.mealDayCount || null }, cmp));
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

  console.log('\n대조 ' + trips.length + '건 · 칸 하나씩 실측으로 바꿔 엔진을 다시 돌린다…\n');

  const rows = [];
  const deadCells = {};   /* 바꿨는데 금액이 안 움직인 칸 — 엔진이 안 쓰는 칸이다 */

  for (const t of trips) {
    const trip = { dest: t.dest, pax: t.pax, days: t.days, date: t.date };
    const base = run(trip);
    if (!base || !base.perPerson) continue;
    const err0 = (base.perPerson - t.actual) / t.actual;

    /* 이 견적서에서 **검산된** 칸만 실측으로 인정한다 */
    const measured = {};
    const untrusted = [];
    /* 차량은 이 여행에서 엔진이 실제로 고른 칸에 견준다(위 주석 참고) */
    const vehField = vehicleFieldOf(base);
    Object.keys(CELL).forEach((k) => {
      const v = t.values[k];
      if (v == null || !(v > 0)) return;
      if (!PLAUSIBILITY.isTrusted(t.via[k])) { untrusted.push(k); return; }
      const field = k === 'vehicle' ? vehField : CELL[k];
      if (!field) return;                       /* 엔진이 안 쓰는 항목 — 견줄 칸이 없다 */
      const adj = toEngineBasis(k, v, t, base);
      if (adj == null) { untrusted.push(k); return; }
      measured[field] = { key: k, value: adj.value, raw: v, note: adj.note };
    });

    /* ① 칸 하나씩 */
    const parts = [];
    Object.keys(measured).forEach((field) => {
      const cell = measured[field];
      const rNow = rowOf(t.dest);
      const rateNow = rNow ? rNow[field] : null;
      const patch = {};
      patch[field] = cell.value;
      const b = runWith(trip, patch);
      if (!b || !b.perPerson) return;
      const move = (b.perPerson - base.perPerson) / t.actual;   /* 정답지 대비 %p */
      /* ⚠ 값을 실제로 바꿨는데 금액이 그대로다 → 엔진이 이 칸을 안 쓴다 */
      if (Math.abs(b.perPerson - base.perPerson) < 1
          && rateNow != null && Math.abs(rateNow - cell.value) > 1) {
        deadCells[cell.key] = (deadCells[cell.key] || 0) + 1;
      }
      parts.push({ key: cell.key, field, rateNow, value: cell.value, move, note: cell.note, raw: cell.raw });
    });

    /* ② 전부 한꺼번에 — 🎯 요율 천장 */
    const patchAll = {};
    Object.keys(measured).forEach((f) => { patchAll[f] = measured[f].value; });
    const bAll = Object.keys(patchAll).length ? runWith(trip, patchAll) : base;
    const errCeil = bAll && bAll.perPerson ? (bAll.perPerson - t.actual) / t.actual : null;

    const sumParts = parts.reduce((n, p) => n + p.move, 0);
    rows.push({
      file: t.file, dest: t.dest, pax: t.pax, days: t.days, date: t.date, actual: t.actual,
      base: base.perPerson, err0,
      parts, sumParts,
      ceiling: bAll && bAll.perPerson, errCeil,
      /* 칸을 하나씩 더한 것과 한꺼번에 바꾼 것의 차이 = 계수·마진 구간의 비선형 */
      nonlinear: errCeil == null ? null : (errCeil - err0) - sumParts,
      cells: Object.keys(measured).length,
      untrusted,
    });
  }

  /* ── ① 오차가 큰 건부터 칸별로 ─────────────────────────────────────────── */
  rows.sort((a, b) => Math.abs(b.err0) - Math.abs(a.err0));
  console.log('════ 오차가 큰 ' + Math.min(TOP, rows.length) + '건 — 어느 칸에서 왔는가 ════\n');
  rows.slice(0, TOP).forEach((r) => {
    console.log('▪ ' + r.dest + ' ' + r.pax + '명 ' + r.days + '일 ' + r.date
      + '   오차 ' + pct(r.err0) + '   (견적서 ' + won(r.actual) + ' · 엔진 ' + won(r.base) + ')');
    console.log('   ' + r.file.slice(0, 62));
    const ps = r.parts.slice().sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
    if (!ps.length) console.log('     (검산된 실측 칸이 없다 — 이 건은 칸으로 쪼갤 수 없다)');
    ps.forEach((p) => {
      console.log('     ' + LABEL[p.key].padEnd(4)
        + ' 요율 ' + won(p.rateNow).padStart(10)
        + ' → 실측 ' + won(p.value).padStart(10)
        + '   엔진 ' + pp(p.move).padStart(8)
        /* ⚠ 환산했으면 **반드시 말한다.** 조용히 바꾼 값으로 재면 그 표를 검산할 수 없다 */
        + (p.note ? '   ⚖ ' + p.note + ' (원값 ' + won(p.raw) + ')' : ''));
    });
    console.log('     ' + '─'.repeat(58));
    console.log('     🎯 모든 칸을 실측으로 맞추면  ' + pct(r.err0) + ' → **' + pct(r.errCeil) + '**'
      + '   (실측 ' + r.cells + '칸'
      + (r.untrusted.length ? ' · 검산 안 된 ' + r.untrusted.length + '칸은 그대로' : '') + ')');
    if (r.nonlinear != null && Math.abs(r.nonlinear) >= 0.005) {
      console.log('     ⚠ 칸별 합(' + pp(r.sumParts) + ')과 한꺼번에 바꾼 결과가 ' + pp(r.nonlinear)
        + ' 다르다 — 계수·마진 구간이 곱으로 얹히기 때문이다');
    }
    console.log('');
  });

  /* ── ② 요율 천장 ───────────────────────────────────────────────────────── */
  const usable = rows.filter((r) => r.errCeil != null);
  const now = TARGETS.score(usable.map((r) => r.err0));
  const ceil = TARGETS.score(usable.map((r) => r.errCeil));
  console.log('════ 🎯 요율 천장 — 요율을 그 견적서에 완벽히 맞추면 어디까지 가는가 ════\n');
  console.log('  목표선: ' + TARGETS.LABEL + '\n');
  if (!now || !ceil) {
    console.log('  잰 것이 없다 — 대조 가능한 건이 0이다.');
  } else {
    const line = (t, s) => console.log('  ' + t.padEnd(6)
      + '중앙값 ' + pct(s.median).padStart(7)
      + '   사분위 ' + pct(s.p25).padStart(7) + ' ~ ' + pct(s.p75).padStart(7)
      + '   폭 ' + pct(s.spread).padStart(7)
      + '   목표 안 ' + String(s.inBand).padStart(2) + '/' + s.n
      + '   🔴아래 ' + String(s.below).padStart(2));
    line('지금', now);
    line('천장', ceil);
    console.log('');
    console.log('  → 요율 작업으로 **폭 ' + pct(now.spread) + ' → ' + pct(ceil.spread) + '**, '
      + '목표 안 ' + now.inBand + ' → ' + ceil.inBand + '건까지 갈 수 있다.');
    console.log('  ⚠ 천장은 **모든 견적서의 실측을 미리 안다**는 가정이다. 실제로는 목적지 하나의');
    console.log('    요율이 그 목적지 여러 건에 함께 걸리므로 여기까지는 못 간다(VB가 그 증거다).');
    console.log('    이 줄이 말하는 것은 **요율로 고칠 수 있는 몫의 상한**이다.');
    console.log('  ⚠ 천장에서도 ' + (ceil.n - ceil.inBand) + '건이 목표 밖이다 — 그건 요율이 아니라');
    console.log('    **구조**다(엔진에 칸이 없는 항목 · 좌석 등급 · 기관 섭외비 · 우리 마진 정책).');
  }

  /* ── ③ 어느 칸이 폭을 가장 많이 만드는가 ──────────────────────────────── */
  console.log('\n════ 칸별 — 폭을 가장 많이 만드는 순서 ════\n');
  const agg = {};
  rows.forEach((r) => r.parts.forEach((p) => {
    const a = agg[p.key] = agg[p.key] || { n: 0, abs: 0, sum: 0, worst: 0, worstAt: '' };
    a.n++; a.abs += Math.abs(p.move); a.sum += p.move;
    if (Math.abs(p.move) > Math.abs(a.worst)) { a.worst = p.move; a.worstAt = r.dest + ' ' + r.pax + '명'; }
  }));
  const order = Object.keys(agg).sort((a, b) => agg[b].abs - agg[a].abs);
  order.forEach((k, i) => {
    const a = agg[k];
    console.log('  ' + (i + 1) + '. ' + LABEL[k].padEnd(4)
      + ' 잰 건 ' + String(a.n).padStart(2)
      + ' · |움직임| 평균 ' + pp(a.abs / a.n).padStart(8)
      + ' · 방향 합 ' + pp(a.sum / a.n).padStart(8)
      + ' · 최대 ' + pp(a.worst).padStart(8) + ' (' + a.worstAt + ')');
  });
  console.log('\n  ⚠ 「방향 합」이 0에 가까운데 「|움직임|」이 크면 **그 칸은 견적서마다 부호가**');
  console.log('    **엇갈린다** — 요율 하나를 올려도 절반은 더 나빠진다는 뜻이다(VB가 겪은 것).');
  console.log('    반대로 둘이 같은 크기·같은 부호면 그 칸은 **통째로 치우쳐 있다**(고칠 값이다).');

  /* ── ④ 못 잰 것을 스스로 밝힌다 ───────────────────────────────────────── */
  const noCells = rows.filter((r) => !r.parts.length).length;
  const untrustedTotal = rows.reduce((n, r) => n + r.untrusted.length, 0);
  console.log('\n════ 못 잰 것 ════');
  console.log('  · 칸으로 쪼갤 수 없는 건(검산된 실측 0칸): ' + noCells + '건');
  console.log('  · 값은 있으나 검산이 안 돼 그대로 둔 칸: ' + untrustedTotal + '칸');
  const dead = Object.keys(deadCells);
  if (dead.length) {
    console.log('  🔴 **바꿨는데 금액이 안 움직인 칸**: '
      + dead.map((k) => LABEL[k] + ' ' + deadCells[k] + '건').join(' · '));
    console.log('     → 엔진이 그 요율 칸을 안 쓴다는 뜻이다. 요율 화면에서 고쳐도 고객 금액이');
    console.log('       안 바뀐다 — 조용히 넘길 자리가 아니다(결함 생성기 ③).');
  } else {
    console.log('  ✅ 모든 칸이 금액을 움직였다 — 엔진이 안 쓰는 요율 칸은 없다.');
  }
}

/* ⚠ require만으로 엔진이 뜨고 코퍼스를 읽으면 안 된다(VA·VJ와 같은 가드) */
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
/* 테스트가 **실제로 걸어 보고** 확인할 수 있게 내보낸다(결함 생성기 ③ 대비) */
module.exports = { CELL, LABEL, vehicleFieldOf, toEngineBasis, bootEngine };

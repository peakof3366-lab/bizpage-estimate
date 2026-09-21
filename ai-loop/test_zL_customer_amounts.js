/* ═══════════════════════════════════════════════════════════════════════════
   고객용 산출값 불변 — **금액이 움직였으면 여기서 걸린다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 지시(견적산출 3분류 개편, 제약 6):
   「고객용 자동견적 산출 결과는 불변이어야 한다. 개편 전후로 동일한 입력을 넣었을 때
     동일한 금액이 나오는지 수치 대조로 검증하고 그 결과를 보고한다.」

   ■ 왜 새 검사가 필요한가
   `fuzz_invariants.js`는 **불변식**(총액>0, 1인당×인원≈총액 …)을 본다. 식이 바뀌어도
   불변식은 그대로 성립하므로 **금액이 움직인 것은 못 잡는다.** 이 검사는 반대로,
   식이 어떻든 **숫자 그 자체**를 스냅샷으로 붙들어 둔다.

   ■ 🔴 요율 오버라이드를 일부러 안 얹는다
   `_engine_boot`는 기본으로 운영 DB의 `rate_overrides`를 얹는다(고객이 겪는 금액을 재려고).
   그런데 **담당자가 요율을 고치면 그 숫자가 바뀐다** — 그걸 스냅샷으로 박으면 검사가
   요율 갱신 때마다 빨개지고, 곧 아무도 안 본다(결함 생성기 ③).
   그래서 여기서는 `ratesResponse:'fail'`로 띄워 **`data.js` 기본값**으로 잰다.
   이 검사가 지키는 것은 「운영 요율이 맞는가」가 아니라 **「내가 고친 코드가 금액을
   움직였는가」**다. 요율 값 점검은 `audit_rates.js`가 따로 한다.

   ■ 🔴 시계를 얼려서 잰다 (2026-09-21)
   출발일을 고정하는 것만으로는 모자랐다 — 리드타임 계수는 **오늘**까지 본다.
   `AS_OF` 주석에 무엇을 당했는지 적어 뒀다.

   ■ 스냅샷을 다시 뜨는 법 — **금액을 바꾼 것이 의도였을 때만**
       node ai-loop/test_zL_customer_amounts.js --update
   ⚠ 다시 뜨기 전에 **무엇이 몇 % 움직였는지** 이 검사가 찍어 주는 표를 커밋 메시지에
     남긴다. 스냅샷만 조용히 갈아 끼우면 「불변」이라는 말이 뜻을 잃는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootEngine } = require('./_engine_boot');

const SNAP = path.join(__dirname, '_zL_snapshot.json');
const UPDATE = process.argv.includes('--update');

/* ═══ 🔴 스냅샷을 뜬 날 — **기준선의 일부다** ══════════════════════════════
   출발일을 고정해도 그것만으로는 모자랐다. `getLeadTimeFactor()`가 **오늘부터
   출발일까지 남은 일수**로 계수를 고르기 때문에 **오늘이 움직이면 금액이 움직인다.**

   ■ 실제로 당한 자리 (2026-09-21에 발견)
   「시드니-남반구」(2027-01-15 출발)가 **2026-09-17에는 120일 남아 leadFactor 0.92**였는데,
   **9/18에 119일이 되면서 0.95로 뛰었다.** 코드는 한 줄도 안 바뀌었는데 총액이
   78,014,064 → 79,037,580(+1.31%)이 됐고 이 검사가 빨개졌다.
   그대로 뒀으면 2027이 다가오며 **24건이 차례로** 깨진다 — 그리고 그때쯤이면
   아무도 안 본다(결함 생성기 ③: 늘 빨간 검사는 꺼진 검사다).

   🔴 **`--update`로 넘기면 안 되는 종류였다.** 재기준선은 진짜 표류까지 덮는다.
   → 그래서 `2026-09-17`로 **시계를 얼린다.** 이 날은 스냅샷을 마지막으로 뜬 날
     (커밋 `f0561c1`)이라, 얼리기만 하면 **스냅샷을 한 글자도 안 고쳐도 다시 맞는다.**

   ⚠ **이 값을 바꾸면 금액이 움직인다.** 바꿀 이유가 생기면 `--update` 전에 이 검사가
     찍어 주는 표를 커밋에 남길 것 — 출발일을 고치는 것과 같은 무게의 변경이다.
   ⚠ `audit_amount_drift.js`가 **이 줄을 읽어 간다**(사례 목록과 같은 이유로 여기가
     단일 출처다). 이름·모양을 바꾸면 그쪽이 못 읽는다. */
const AS_OF = '2026-09-17';

/* 고객이 실제로 고르는 조합을 폭넓게 덮는다. **한 칸이라도 금액에 닿는 손잡이는
   적어도 한 줄에서 켜져 있어야** 그 손잡이를 건드렸을 때 여기서 걸린다.
   ⚠ 날짜는 **고정**이다. 오늘 날짜를 쓰면 리드타임 계수가 매일 달라져 스냅샷이 못 쓴다. */
const CASES = [
  { id: '오키나와-소규모-휴양',  t: { dest: '오키나와',   pax: 4,  days: 4, date: '2027-03-10' },
    spec: { incVehicle: false, incGuide: false } },
  { id: '오키나와-단체-기본',    t: { dest: '오키나와',   pax: 20, days: 4, date: '2027-03-10' } },
  { id: '다낭-연수-30명',        t: { dest: '다낭',    pax: 30, days: 5, date: '2027-05-20' } },
  { id: '다낭-성수기-7월',       t: { dest: '다낭',    pax: 30, days: 5, date: '2027-07-20' } },
  { id: '방콕-대규모-100명',     t: { dest: '방콕',   pax: 100, days: 5, date: '2027-06-15' } },
  { id: '방콕-연말연시',         t: { dest: '방콕',   pax: 30, days: 5, date: '2027-12-28' } },
  { id: '세부-리조트-1인1실',    t: { dest: '세부',      pax: 12, days: 5, date: '2027-09-10' },
    spec: { roomConfig: 'single', hotelGrade: 'deluxe' } },
  { id: '발리-혼합좌석',         t: { dest: '발리',      pax: 24, days: 6, date: '2027-08-05' },
    spec: { cabinClass: 'mixed', bizCount: 4, roomConfig: 'mixed', vipCount: 2 } },
  { id: '도쿄-벚꽃',             t: { dest: '도쿄',     pax: 16, days: 4, date: '2027-04-01' } },
  { id: '도쿄-비수기-11월',      t: { dest: '도쿄',     pax: 16, days: 4, date: '2027-11-12' } },
  { id: '삿포로-겨울',           t: { dest: '삿포로',   pax: 25, days: 5, date: '2027-02-10' } },
  { id: '싱가포르-비즈니스',     t: { dest: '싱가포르', pax: 10, days: 4, date: '2027-10-08' },
    spec: { cabinClass: 'business', hotelGrade: 'deluxe' } },
  { id: '코타키나발루-골프',     t: { dest: '코타키나발루', pax: 16, days: 5, date: '2027-11-03' },
    spec: { golf: true, golfCount: 8, golfRounds: 2 } },
  { id: '상해-짧은일정',         t: { dest: '상해',  pax: 40, days: 3, date: '2027-05-06' } },
  { id: '장가계-관광비큰곳',     t: { dest: '장가계', pax: 35, days: 5, date: '2027-04-20' } },
  { id: '파리-장거리',           t: { dest: '파리',     pax: 20, days: 8, date: '2027-06-01' } },
  { id: '유럽-추석연휴',         t: { dest: '파리',     pax: 20, days: 8, date: '2027-09-14' } },
  { id: '뉴욕-장거리-이코노미',  t: { dest: '뉴욕',   pax: 15, days: 8, date: '2027-10-20' } },
  { id: '시드니-남반구',         t: { dest: '시드니',    pax: 18, days: 7, date: '2027-01-15' } },
  { id: '몽골-여름최성수기',     t: { dest: '몽골',  pax: 22, days: 6, date: '2027-08-01' } },
  { id: '괌-가족여행',           t: { dest: '괌',      pax: 6,  days: 5, date: '2027-07-25' },
    spec: { incVehicle: false, incGuide: false, incSightseeing: false } },
  { id: '하노이-호텔만',         t: { dest: '하노이',     pax: 12, days: 4, date: '2027-03-05' },
    spec: { incMeal: false, incVehicle: false, incGuide: false, incSightseeing: false } },
  { id: '푸꾸옥-대규모-올인',    t: { dest: '푸꾸옥',   pax: 60, days: 5, date: '2027-11-18' },
    spec: { hotelGrade: 'deluxe' } },
  { id: '홍콩-2박3일',           t: { dest: '홍콩',  pax: 14, days: 3, date: '2027-06-20' } },
];

/* 스냅샷에 넣는 것 — **금액과 그 근거가 되는 계수까지.** 계수만 바뀌고 총액이 우연히
   같을 수 있는데, 그건 「불변」이 아니라 **두 오류가 상쇄된 것**이다. */
function shape(d) {
  if (!d) return null;
  return {
    total: d.total,
    perPerson: d.perPerson,
    visibleTotal: d.visibleTotal,
    hiddenTotal: d.hiddenTotal,
    combinedFactor: +d.combinedFactor.toFixed(6),
    seasonFactor: +d.seasonFactor.toFixed(6),
    peakFactor: +d.peakFactor.toFixed(6),
    leadFactor: +d.leadFactor.toFixed(6),
    volScale: +d.volScale.toFixed(6),
    rooms: d.rooms,
    rows: (d.rows || []).map((r) => ({ name: r.name, unit: r.unit, qty: r.qty, amount: r.amount, muted: !!r.muted })),
  };
}

(async () => {
  /* 🔴 `ratesResponse:'fail'` — 운영 요율을 안 얹고 data.js 기본값으로 잰다(위 머리말 참조) */
  const B = await bootEngine({ quiet: true, ratesResponse: 'fail', now: AS_OF });

  const now = {};
  const missing = [];
  CASES.forEach((c) => {
    let d;
    try { d = B.run(c.t, c.spec); } catch (e) { d = null; }
    if (!d) { missing.push(c.id); return; }
    now[c.id] = shape(d);
  });

  if (missing.length) {
    /* 목적지 키가 바뀌면 조용히 건너뛰다가 「전부 통과」로 보인다(결함 생성기 ②).
       못 돌린 줄은 **실패**다. */
    console.log('🔴 산출 실패 — 목적지 키를 확인하세요: ' + missing.join(', '));
  }

  if (UPDATE) {
    fs.writeFileSync(SNAP, JSON.stringify(now, null, 2) + '\n', 'utf8');
    console.log('스냅샷을 다시 떴습니다 — ' + Object.keys(now).length + '건');
    console.log(`결과: ${Object.keys(now).length} pass / ${missing.length} fail`);
    process.exit(missing.length ? 1 : 0);
  }

  if (!fs.existsSync(SNAP)) {
    console.log('🔴 스냅샷이 없습니다. `--update`로 먼저 뜨세요.');
    console.log('결과: 0 pass / 1 fail');
    process.exit(1);
  }
  const old = JSON.parse(fs.readFileSync(SNAP, 'utf8'));

  let pass = 0; const fails = [];
  const keys = Array.from(new Set(Object.keys(old).concat(Object.keys(now))));
  keys.forEach((k) => {
    const a = old[k]; const b = now[k];
    if (!a) { fails.push([k, '스냅샷에 없는 새 줄 — `--update` 필요']); return; }
    if (!b) { fails.push([k, '이번에 산출되지 않음']); return; }
    if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return; }
    /* 무엇이 얼마나 움직였는지 **숫자로** 말한다 — 「달라졌다」만으로는 판단할 수 없다 */
    const diffs = [];
    ['total', 'perPerson', 'visibleTotal', 'hiddenTotal', 'combinedFactor',
      'seasonFactor', 'peakFactor', 'leadFactor', 'volScale', 'rooms'].forEach((f) => {
      if (a[f] !== b[f]) {
        const pct = a[f] ? ((b[f] - a[f]) / a[f] * 100).toFixed(2) + '%' : '—';
        diffs.push(`${f} ${a[f]} → ${b[f]} (${pct})`);
      }
    });
    const an = (a.rows || []).map((r) => r.name).join('|');
    const bn = (b.rows || []).map((r) => r.name).join('|');
    if (an !== bn) diffs.push('항목 구성이 달라짐: [' + an + '] → [' + bn + ']');
    else (a.rows || []).forEach((r, i) => {
      const s = b.rows[i];
      if (r.amount !== s.amount) diffs.push(`${r.name} ${r.amount} → ${s.amount}`);
      else if (r.unit !== s.unit || r.qty !== s.qty) diffs.push(`${r.name} 단가/수량 ${r.unit}·${r.qty} → ${s.unit}·${s.qty}`);
      else if (r.muted !== s.muted) diffs.push(`${r.name} 노출 여부 ${r.muted} → ${s.muted}`);
    });
    fails.push([k, diffs.join(' · ') || '내용이 다름']);
  });

  console.log('\n══════════════════════════════════════════════════════════════════');
  /* 🔴 시계가 정말 얼어 있는가 — 이것부터 확인한다.
     `now`를 안 넘기거나 `freezeClock`이 통째로 빠져도 **오늘이 마침 AS_OF 근처면
     24건이 전부 통과한다.** 그러면 잠금이 있다고 착각한 채로 며칠 뒤 다시 깨진다.
     → **하루 늦춘 시계로 한 번 더 돌려서** 리드타임 계수가 따라 움직이는지 본다.
       움직이면 「시계가 먹힌다」는 증거다(시드니는 AS_OF+1에 120→119일이 되며 0.92→0.95). */
  let clockOk = false;
  const NEXT = new Date(AS_OF + 'T12:00:00+09:00');
  NEXT.setDate(NEXT.getDate() + 1);
  const nextIso = NEXT.toISOString().slice(0, 10);
  const B2 = await bootEngine({ quiet: true, ratesResponse: 'fail', now: nextIso });
  const probeCase = CASES.find((c) => c.id === '시드니-남반구');
  const d2 = probeCase ? shape(B2.run(probeCase.t, probeCase.spec)) : null;
  const d1 = now['시드니-남반구'];
  if (!d2 || !d1) {
    fails.push(['시계 잠금', '시드니-남반구를 못 돌렸습니다 — 사례 이름이 바뀌었는지 확인하세요']);
  } else if (d2.leadFactor === d1.leadFactor) {
    fails.push(['🔴 시계가 안 얼어 있다',
      'AS_OF(' + AS_OF + ')와 하루 뒤(' + nextIso + ')의 leadFactor가 같습니다 ('
      + d1.leadFactor + ') — bootEngine에 now가 안 넘어갔거나 freezeClock이 빠졌습니다.'
      + ' 이대로 두면 날짜가 지날 때 스냅샷이 저절로 깨집니다.']);
  } else clockOk = true;

  console.log(' 고객용 산출값 불변 — ' + keys.length + '건 대조 (data.js 기본 요율 · 시계 ' + AS_OF + ')');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(' ' + (clockOk ? '✓' : '✗') + ' 시계가 ' + AS_OF + '로 얼어 있다'
    + (clockOk ? ' (하루 늦추면 리드타임 계수가 따라 움직였다)' : ''));
  if (!fails.length) {
    console.log(' ✓ ' + pass + '건 전부 스냅샷과 **같은 금액**입니다.');
  } else {
    fails.forEach(([k, m]) => console.log(' ✗ ' + k + '\n     ' + m));
    console.log('\n 🔴 금액이 움직였습니다. 의도한 변경이면 `--update` 전에 위 표를 커밋에 남기세요.');
  }
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
})();

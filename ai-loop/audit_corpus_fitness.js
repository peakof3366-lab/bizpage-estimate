/* ═══════════════════════════════════════════════════════════════════════════
   **이 견적서가 우리 가견적과 같은 상품인가** — 정답지의 성격 (VN)
   ───────────────────────────────────────────────────────────────────────────
   가설 셋이 실측으로 기각됐다:
     ① 「요율을 더 다듬으면 정확해진다」          (VL — 천장이 오히려 나쁘다)
     ② 「사양(좌석·객실)을 물어보면 정확해진다」   (VM — 문서 뒷받침 0건, 넣으면 나빠진다)
     ③ 「지상비 견적서라 엔진이 비싸다」          (VM — 그런 문서가 아니라 추출 실패였다)

   셋 다 **엔진 쪽**을 의심한 것이다. 그러면 남은 의심은 하나다 — **정답지.**
   36건이 정말 우리 가견적과 같은 상품인가. 그것을 안 재고 오차만 재 왔다.

   ── 무엇을 재는가 ──────────────────────────────────────────────────────────
   견적서마다 「우리와 견줄 수 있는가」를 축별로 본다. 각 축은 **문서가 스스로 적은
   것**만 근거로 삼는다:

     ⓐ 정답지 종류    판매가가 있는가 (없으면 입금가 = 원가 시트. 우리 출력은 판매가다)
     ⓑ 항공          단가를 읽었는가 / 문서가 불포함이라 말하는가
     ⓒ 알선 수수료     여행사 이윤이 **별도 줄로** 있는가 (우리 마진과 대응하는 자리)
     ⓓ 골프          골프 줄이 있는데 그 목적지 요율에 칸이 없는가 (엔진이 못 만든다)
     ⓔ 미분류 비중     문서 돈의 몇 %가 우리 9칸 밖인가
     ⓕ 인원 어긋남     문서 계산과 우리가 읽은 인원이 다른가

   그리고 **전 축을 통과한 무리**의 오차 분포를 낸다.
   → 그 무리가 넓으면 문제는 엔진이다. 좁으면 **표본이 문제였다.**

   ⚠ **아무것도 버리지 않는다.** 이 도구는 무리를 나눌 뿐이고, 어느 무리를 목표로
     삼을지는 대표가 정한다. 「비교 가능한 것만 남기자」는 표본을 8건으로 줄일 수도
     있는데, 8건에 맞추는 것은 잡음에 맞추는 것이다(VI가 ±10%를 고른 이유와 같다).
   ⚠ 각 축은 **「문서가 그렇게 적었다」까지**다. 「알선 수수료 줄이 없다」가 「이윤이
     없다」는 뜻은 아니다 — 단가에 녹아 있을 수 있다. 단정하지 않는다.

   실행:
     node ai-loop/audit_corpus_fitness.js --cache
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const { loadCorpus, DEFAULT_CORPUS } = require('./_corpus_cache');
const { comparable } = require('./_comparable');
const { dedupeTrips, droppedNote } = require('./_same_trip');
const { bootEngine } = require('./_engine_boot');
const TARGETS = require('./_accuracy_target');

const args = process.argv.slice(2);
const USE_CACHE = args.includes('--cache');
const CORPUS = args.find((a) => !a.startsWith('--')) || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
const BASIS = (args.find((a) => a.startsWith('--basis=')) || '').split('=')[1] || 'sell';
/* 미분류가 이 비중을 넘으면 「우리가 못 만드는 돈이 크다」로 본다.
   ⚠ 값에 근거가 있어야 한다 — 코퍼스 중앙값이 5.0%(audit_gap_source)라 그 두 배를 잡았다.
     10%면 1인 150만 여행에서 15만원이고, 그건 목표선 ±10%의 대부분을 먹는다. */
const UNCLASS_LIMIT = 0.10;

const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');

/* ── 🔴 **적은 무리는 폭이 원래 좁다** — 그 착시를 걸러내는 장치 ────────────
   6건을 골라내면 사분위 폭은 구조적으로 좁아진다. 「좁아졌다」만 보고 진전이라
   말하면, 이 저장소가 하루에 세 번 겪은 표본 착시를 또 겪는다(VA·VB·VH).
   → **같은 크기의 무작위 무리**를 많이 뽑아 그 폭의 분포를 낸다. 우리 무리가
     그 분포의 아래쪽에 있어야 「성격이 폭을 만들었다」고 말할 수 있다.
   ⚠ 난수를 쓰면 돌릴 때마다 답이 달라져 판단이 흔들린다. **씨앗 고정 난수**를 쓴다 —
     같은 입력이면 같은 답이 나와야 검사로 잠글 수 있다. */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function spreadOf(errs) {
  const s = TARGETS.score(errs);
  return s ? s.spread : null;
}
function randomSpreads(allErrs, n, draws) {
  const rnd = seededRandom(20260821);
  const out = [];
  for (let d = 0; d < draws; d++) {
    const pool = allErrs.slice();
    const pick = [];
    for (let i = 0; i < n && pool.length; i++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const sp = spreadOf(pick);
    if (sp != null) out.push(sp);
  }
  return out.sort((a, b) => a - b);
}
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};

/* 축 정의 — **통과 조건**과 **왜 그 조건인가**를 한 곳에 둔다 */
const AXES = [
  {
    key: 'sell', label: 'ⓐ 판매가 정답지',
    why: '우리 출력은 고객에게 파는 금액이다. 입금가(원가)와 견주면 우리 마진만큼 엔진이 비싸다',
    pass: (r) => !r.isCost,
    fail: '원가 시트(입금가)',
  },
  {
    key: 'air', label: 'ⓑ 항공 대조 가능',
    why: '엔진은 항공을 항상 넣는다. 문서가 불포함이면 그만큼 구조적으로 비싸다',
    pass: (r) => !r.airExcluded,
    fail: '문서가 항공 불포함이라 말함',
  },
  {
    key: 'fee', label: 'ⓒ 알선 수수료 줄',
    why: '여행사 이윤이 별도 줄로 있으면 우리 마진과 자리가 대응한다',
    pass: (r) => r.fee,
    fail: '별도 줄 없음(단가에 녹았거나 없음)',
  },
  {
    key: 'golf', label: 'ⓓ 골프를 만들 수 있음',
    why: '골프 줄이 있는데 그 목적지 요율에 칸이 없으면 엔진은 그 줄을 아예 못 만든다',
    pass: (r) => !(r.golfLines > 0 && !r.golfRate),
    fail: '골프가 있는데 요율에 칸 없음(0-m)',
  },
  {
    key: 'unclass', label: 'ⓔ 미분류가 작음',
    why: '우리 9칸 밖의 돈이 크면 엔진이 그만큼 못 낸다',
    pass: (r) => r.unclassRatio != null && r.unclassRatio <= UNCLASS_LIMIT,
    fail: '미분류 ' + Math.round(UNCLASS_LIMIT * 100) + '% 초과 또는 못 잼',
  },
];

async function main() {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const corpus = await loadCorpus({ corpus: CORPUS, useCache: USE_CACHE });
  const { run, rowOf } = await bootEngine();

  /* 역검증·오차 분해·손잡이와 **같은 표본**을 본다 */
  const trips = [];
  for (const c of corpus) {
    const cmp = comparable(c, BASIS);
    if (!cmp.ok) continue;
    const h = c.specHints || {};
    const sh = c.shape || {};
    trips.push(Object.assign({
      file: c.file,
      /* 원가 시트인가 — 판매가가 없어 입금가로 잰 건이다(`_comparable`이 이미 갈랐지만,
         `--basis=cost`로 돌리면 원가 시트만 남으므로 여기서 다시 표시한다) */
      isCost: BASIS === 'cost',
      airExcluded: !!h.airExcluded,
      fee: !!h.fee,
      vat: !!h.vat,
      golfLines: sh.golfLines || 0,
      unclassRatio: sh.unclassRatio == null ? null : sh.unclassRatio,
    }, cmp));
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

  console.log('\n대조 ' + trips.length + '건 · 문서 성격을 축별로 가른다…\n');

  const rows = [];
  for (const t of trips) {
    const trip = { dest: t.dest, pax: t.pax, days: t.days, date: t.date };
    const bd = run(trip);
    if (!bd || !bd.perPerson) continue;
    const dr = rowOf(t.dest);
    const r = Object.assign({}, t, {
      err: (bd.perPerson - t.actual) / t.actual,
      golfRate: !!(dr && Number(dr.golf_fee) > 0),
    });
    r.failed = AXES.filter((a) => !a.pass(r)).map((a) => a.key);
    rows.push(r);
  }

  /* ── ① 축별로 몇 건이 걸리나 ─────────────────────────────────────────── */
  console.log('════ ① 축별 — 몇 건이 우리와 견줄 수 없는가 ════\n');
  const allErrs = rows.map((r) => r.err);
  AXES.forEach((a) => {
    const bad = rows.filter((r) => !a.pass(r));
    const good = rows.filter((r) => a.pass(r));
    const sg = TARGETS.score(good.map((r) => r.err));
    const sb = TARGETS.score(bad.map((r) => r.err));
    console.log('  ' + wpad(a.label, 22)
      + '통과 ' + String(good.length).padStart(2) + '건'
      + (sg ? ' (중앙값 ' + pct(sg.median).padStart(7) + ' 폭 ' + pct(sg.spread).padStart(7) + ')' : '')
      + '   ✗ ' + String(bad.length).padStart(2) + '건'
      + (sb ? ' (중앙값 ' + pct(sb.median).padStart(7) + ' 폭 ' + pct(sb.spread).padStart(7) + ')' : ''));
    console.log('     ' + a.why);
    if (bad.length) console.log('     ✗ 사유: ' + a.fail);
    /* ⚠ **작은 무리는 폭이 원래 좁다.** 축이 진짜 가르는지는 같은 크기 무작위와
       견줘야 안다 — 안 그러면 「건수가 줄어 좁아진 것」을 축의 힘으로 읽는다. */
    if (sg && bad.length) {
      const rs = randomSpreads(allErrs, sg.n, 1000);
      const better = rs.filter((x) => x < sg.spread).length / rs.length;
      const mark = better <= 0.10 ? '✅ 우연으로 보기 어렵다'
        : better <= 0.25 ? '🟡 우연 범위와 겹친다'
          : '🔴 무작위와 다르지 않다';
      console.log('     같은 크기 무작위 폭 중앙값 ' + pct(rs[Math.floor(rs.length / 2)])
        + ' vs 통과 무리 ' + pct(sg.spread)
        + '  → 하위 ' + Math.round(better * 100) + '%  ' + mark);
    }
    /* ⚠ **축은 폭이 아니라 중앙값으로 드러날 수도 있다.** 미통과 무리가 통째로 한쪽으로
       쏠려 있으면(골프처럼) 폭 검사는 아무 말도 안 하는데 원인은 또렷하다.
       폭만 보고 「무작위와 다르지 않다」로 끝내면 그 축을 놓친다. */
    if (sg && sb && Math.abs(sb.median - sg.median) >= TARGETS.TARGET) {
      console.log('     🔴 **미통과 무리가 통째로 쏠려 있다** — 중앙값 ' + pct(sg.median)
        + ' vs ' + pct(sb.median) + ' (' + pct(sb.median - sg.median) + ' 차이).');
      console.log('        폭이 아니라 **중앙값**으로 드러나는 축이다. 폭 검사만 보고 넘기지 말 것.');
    }
    console.log('');
  });

  /* ── ② 전 축을 통과한 무리 ───────────────────────────────────────────── */
  const clean = rows.filter((r) => !r.failed.length);
  const all = TARGETS.score(rows.map((r) => r.err));
  const cs = TARGETS.score(clean.map((r) => r.err));
  console.log('════ ② 전 축을 통과한 무리 — **우리 가견적과 가장 같은 상품** ════\n');
  console.log('  목표선: ' + TARGETS.LABEL + '\n');
  const line = (t, s) => {
    if (!s) { console.log('  ' + wpad(t, 12) + '잰 것이 없다'); return; }
    console.log('  ' + wpad(t, 12)
      + String(s.n).padStart(2) + '건   중앙값 ' + pct(s.median).padStart(7)
      + '   폭 ' + pct(s.spread).padStart(7)
      + '   목표 안 ' + String(s.inBand).padStart(2) + '/' + s.n
      + ' (' + Math.round(s.inBand / s.n * 100) + '%)'
      + '   🔴아래 ' + String(s.below).padStart(2));
  };
  line('전체', all);
  line('전 축 통과', cs);
  console.log('');
  if (!cs) {
    console.log('  🔴 **전 축을 통과한 건이 하나도 없다.** 그러면 이 축들 중 하나가 너무 빡빡하다 —');
    console.log('     축을 줄이거나, 그 축이 정말 비교를 막는지 다시 봐야 한다.');
  } else {
    /* 🔴 **같은 크기 무작위 무리와 견준다.** 이걸 안 하면 「6건이라 좁은 것」을
       「성격이 좋아 좁은 것」으로 읽는다. */
    const rs = randomSpreads(rows.map((r) => r.err), cs.n, 2000);
    const q = (p) => rs[Math.min(rs.length - 1, Math.floor(rs.length * p))];
    const better = rs.filter((x) => x < cs.spread).length / rs.length;
    console.log('  ── 같은 크기(' + cs.n + '건) 무작위 무리 2,000번과 견주면 ──');
    console.log('     무작위 폭:  하위10% ' + pct(q(0.10)) + '  중앙값 ' + pct(q(0.50))
      + '  상위10% ' + pct(q(0.90)));
    console.log('     우리 무리:  ' + pct(cs.spread)
      + '  → 무작위 무리의 **하위 ' + Math.round(better * 100) + '%**에 든다');
    if (better <= 0.10) {
      console.log('     ✅ 우연으로 보기 어렵다 — **성격이 폭을 만들고 있었다.**');
    } else if (better <= 0.25) {
      console.log('     🟡 좁긴 한데 우연 범위와 겹친다 — **표본이 더 쌓여야 말할 수 있다.**');
    } else {
      console.log('     🔴 **무작위와 다르지 않다.** 「폭이 좁아졌다」는 것은 건수가 줄어서다.');
      console.log('        성격이 폭을 만든다는 근거가 되지 못한다.');
    }
    if (cs.spread >= all.spread) {
      console.log('  → 폭이 안 좁아졌다. **표본 성격으로는 설명되지 않는다** — 엔진 쪽을 더 봐야 한다.');
    }
    /* ⚠ **적은 표본에서는 폭이 원래 좁게 나온다.** 좁아졌다는 사실만 옮겨 적으면
       그게 진전으로 읽힌다 — 이 저장소가 하루에 세 번 겪은 종류의 착시다(VA·VB·VH). */
    if (cs.n < 10) {
      console.log('\n  ⚠ **' + cs.n + '건은 결론을 내기에 적다.** 이 무리의 중앙값·폭을 목표로 삼으면');
      console.log('    잡음에 맞추게 된다(VI가 ±5% 대신 ±10%를 고른 것과 같은 이유).');
      console.log('    지금 말할 수 있는 것은 **「비교 가능한 문서가 이만큼 드물다」**까지다.');
    }
    console.log('\n  전 축을 통과한 ' + cs.n + '건:');
    clean.sort((a, b) => a.err - b.err).forEach((r) => {
      console.log('     ' + wpad(r.dest, 12) + wpad(r.pax + '명 ' + r.days + '일', 10)
        + pct(r.err).padStart(7) + '   ' + r.file.slice(0, 48));
    });
  }

  /* 몇 개 축에서 걸렸나 — 하나만 걸린 건은 그 축만 풀면 표본이 된다 */
  const byFail = {};
  rows.forEach((r) => { byFail[r.failed.length] = (byFail[r.failed.length] || 0) + 1; });
  console.log('\n  걸린 축 개수: '
    + Object.keys(byFail).sort().map((k) => k + '개 ' + byFail[k] + '건').join(' · '));

  /* ── ③ 한 축만 걸린 건 — 여기가 가장 값싼 자리다 ────────────────────── */
  const oneOff = rows.filter((r) => r.failed.length === 1);
  console.log('\n════ ③ 축 하나만 걸린 건 — 그 축을 풀면 표본이 된다 ════\n');
  if (!oneOff.length) console.log('  없다.');
  const byAxis = {};
  oneOff.forEach((r) => { (byAxis[r.failed[0]] = byAxis[r.failed[0]] || []).push(r); });
  Object.keys(byAxis).forEach((k) => {
    const a = AXES.find((x) => x.key === k);
    console.log('  ' + a.label + ' 만 걸린 건 ' + byAxis[k].length + '건:');
    byAxis[k].forEach((r) => console.log('     ' + wpad(r.dest, 12) + wpad(r.pax + '명', 7)
      + pct(r.err).padStart(7) + '   ' + r.file.slice(0, 46)));
  });

  /* ── ④ 부가세 — 우리 화면과 견적서가 같은 것을 세고 있는가 ──────────── */
  const vat = rows.filter((r) => r.vat);
  console.log('\n════ ④ 부가세 — 우리 화면은 「VAT 별도」다 ════\n');
  console.log('  부가세·세금계산서를 언급하는 견적서: ' + vat.length + '/' + rows.length + '건');
  console.log('  ⚠ 해외여행은 **여행경비가 면세이고 알선수수료만 과세**다. 그래서 견적서는');
  console.log('    「부가세 포함 · 세금계산서 발행 가능」이라 적는다(실측 10건이 전부 그 꼴이다).');
  console.log('  🔴 그런데 `script.js`의 고객 견적서는 **「예상 총액 (VAT 별도)」**라고 찍는다.');
  console.log('     총액에 10%가 더 붙는 것처럼 읽히면, 실제 여행사 견적과 나란히 놨을 때');
  console.log('     **우리가 10% 비싸 보인다.** 표기가 관행과 맞는지는 대표 판단이다(대기열).');
  console.log('  ⚠ 이 항목은 오차 숫자를 바꾸지 않는다 — **고객이 읽는 뜻**의 문제다.');
}

/* ⚠ require만으로 엔진이 뜨고 코퍼스를 읽으면 안 된다 */
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { AXES, UNCLASS_LIMIT };

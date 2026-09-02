/* ═══════════════════════════════════════════════════════════════════════════
   **같은 원가 위에서 우리와 그 견적서가 각각 얼마를 얹는가** (YI) — 읽기 전용
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 만들었나 — 대기열 0-d가 몇 주째 막혀 있고, 그게 다른 걸 다 물고 있다

   대표 질문(2026-08-13, 0-d): 원가를 실측으로 낮췄더니 고객용 판매가와의 격차가
   커졌다 — **남은 격차가 요율 문제인가, 우리 마진이 얇은 것인가.**
   그게 안 정해지면 「±10% 달성」의 뜻 자체가 없다. 계속 쫓게 된다.

   그동안 못 답한 이유는 **두 값을 다른 원가 위에서 재고 있었기 때문**이다.
   역검증은 「우리 판매가 vs 그쪽 판매가」만 본다. 그 차이 안에 원가 차이와 마진
   차이가 섞여 있어서, 어느 쪽인지 가를 수가 없었다.

   ■ 이 도구가 하는 일 — **원가를 먼저 같게 만든다**

   `audit_error_decomp`의 「요율 천장」을 그대로 쓴다. 그 견적서에서 **검산된 실측 칸**으로
   우리 요율을 덮어 엔진을 다시 돌리면, 그 결과의 원가소계는 **그 견적서 자신의 단가로
   조립한 원가**다. 그 위에서 둘을 나란히 본다:

       원가소계  = 엔진 판매가 − 수익 − 보험        (마진·보험을 뺀 1인 금액)
       우리가 얹음 = (엔진 판매가 − 원가소계) ÷ 원가소계
       그쪽이 얹음 = (견적서 1인당 − 원가소계) ÷ 원가소계

   두 값이 **같은 분모**를 쓰므로 차이가 곧 마진 차이다.

   ⚠ **이건 오차 도구가 아니다.** 「우리가 틀렸다」를 재는 것이 아니라 「같은 원가에서
     얼마를 남기는가」를 재는 것이다. 숫자가 커도 요율을 만지면 안 된다 — 요율은
     이미 그 견적서 값으로 맞춰 둔 상태다(그게 이 도구의 전제다).

   ⚠ **원가가 맞을 때만 뜻이 있다.** 그래서 셋을 함께 찍는다:
     ① 실측으로 맞춘 칸 수 — 적으면 원가가 여전히 우리 것이다
     ② 미분류 비중 — 문서 돈의 몇 %가 우리 9칸 밖인가. 이게 크면 「그쪽이 많이 얹었다」로
        보이는 것의 상당 부분이 **실비**다(기관 섭외비·통역·국내수송 같은 것).
     ③ 문서 성격 — 원가 시트의 「1인당」은 판매가가 아니다. **따로 센다.**

   ⚠ 마진·보험 줄은 **이름으로** 고른다(엔진이 그 이름으로 렌더한다).
     이름이 바뀌면 조용히 0이 되므로 **한 건이라도 수익 줄을 못 찾으면 멈춘다.**

   실행:
     node ai-loop/audit_margin_gap.js --cache
     node ai-loop/audit_margin_gap.js --cache --min-cells 5   (원가를 더 믿을 수 있는 것만)
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { loadCorpus, DEFAULT_CORPUS } = require('./_corpus_cache');
const { comparable } = require('./_comparable');
const { dedupeTrips, droppedNote } = require('./_same_trip');
const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
/* 천장을 만드는 규칙은 `audit_error_decomp`가 진실이다 — 여기서 다시 적으면
   「분해한 원가」와 「마진을 잰 원가」가 서로 달라진다(결함 생성기 ①). */
const { CELL, vehicleFieldOf, toEngineBasis, bootEngine } = require('./audit_error_decomp.js');

const argv = process.argv.slice(2);
const USE_CACHE = argv.includes('--cache');
const MIN_CELLS = (() => {
  const i = argv.indexOf('--min-cells');
  return i >= 0 && Number(argv[i + 1]) > 0 ? Number(argv[i + 1]) : 0;
})();
const CORPUS = process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

const pct = (n) => (n == null ? '   —  ' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');
const won = (n) => (n == null ? '—' : Math.round(n).toLocaleString());
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};
const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

(async () => {
  const corpus = await loadCorpus({ corpus: CORPUS, useCache: USE_CACHE });
  const { run, runWith } = await bootEngine();

  /* 엔진 결과에서 마진·보험을 1인당으로 꺼낸다 */
  const split = (bd, pax) => {
    const per = (re) => (bd.rows || []).filter((x) => re.test(x.name))
      .reduce((s, x) => s + x.amount, 0) / pax;
    const mar = per(/수익/), ins = per(/보험/);
    /* 🔴 **부대비용을 따로 뽑는다** (YL). 이건 우리가 지상비의 20%로 **추정해 얹는**
       원가지, 그 견적서가 실제로 쓴 돈이 아니다. 미분류가 3%인 문서에도 20%가 붙는다.
       처음(YI)에는 이걸 원가소계 안에 두었더니 「그쪽이 얹은 비율」이 음수로 나왔다
       (푸꾸옥 100명 -27.4% = 그쪽이 원가 밑으로 팔았다는 뜻 — 있을 수 없다).
       원가가 부풀어 있었던 것이다. 그래서 갈라서 **둘 다** 보여준다. */
    const anc = per(/부대비용/);
    return { mar, ins, anc, base: bd.perPerson - mar - ins, baseNoAnc: bd.perPerson - mar - ins - anc };
  };

  const rows = [];
  let noMarginRow = 0;
  for (const c of corpus) {
    const cmp = comparable(c, 'sell');
    if (!cmp.ok) continue;
    const trip = { dest: cmp.dest, pax: cmp.pax, days: cmp.days, date: cmp.date };
    let bd; try { bd = run(trip); } catch (e) { continue; }
    if (!bd || !bd.perPerson) continue;

    /* 그 견적서에서 **검산된** 칸만 실측으로 인정한다 (decomp와 같은 규칙) */
    const vehField = vehicleFieldOf(bd);
    const patch = {};
    let cells = 0;
    Object.keys(CELL).forEach((k) => {
      const v = (c.values || {})[k];
      if (v == null || !(v > 0)) return;
      if (!PLAUSIBILITY.isTrusted((c.via || {})[k])) return;
      const field = k === 'vehicle' ? vehField : CELL[k];
      if (!field) return;
      const adj = toEngineBasis(k, v, c, bd);
      if (adj == null) return;
      patch[field] = adj.value; cells++;
    });

    const bC = cells ? runWith(trip, patch) : bd;
    if (!bC || !bC.perPerson) continue;
    const s = split(bC, cmp.pax);
    if (!(s.mar > 0)) { noMarginRow++; continue; }
    if (!(s.base > 0)) continue;

    rows.push({
      file: c.file, dest: cmp.dest, pax: cmp.pax, days: cmp.days, date: cmp.date,
      actual: cmp.actual, cells,
      base: s.base, ours: bC.perPerson,
      /* 양쪽 다 **같은 원가소계** 위에서 잰다 */
      addOurs: (bC.perPerson - s.base) / s.base,
      addTheirs: (cmp.actual - s.base) / s.base,
      /* 부대비용을 원가에서 빼고 다시 — 「추정해 얹은 것」을 원가로 치지 않는다 */
      anc: s.anc, ancShare: s.base > 0 ? s.anc / s.base : null,
      addOurs2: s.baseNoAnc > 0 ? (bC.perPerson - s.baseNoAnc) / s.baseNoAnc : null,
      addTheirs2: s.baseNoAnc > 0 ? (cmp.actual - s.baseNoAnc) / s.baseNoAnc : null,
      unclass: (c.shape && c.shape.unclassRatio) == null ? null : c.shape.unclassRatio,
      /* 원가 시트의 「1인당」은 판매가가 아니다 — 따로 센다 */
      isCost: !!c.deposit,
    });
  }

  /* 🔴 마진 줄 이름이 바뀌면 이 도구가 통째로 거짓이 된다 — 조용히 넘기지 않는다 */
  if (noMarginRow) {
    console.log('🔴 수익 줄을 못 찾은 건 ' + noMarginRow + '건 — 엔진의 줄 이름이 바뀌었을 수 있습니다.');
    console.log('   이 도구는 「수익」·「보험」이라는 줄 이름에 기대고 있습니다. 확인 전에는 아래 숫자를 믿지 마십시오.\n');
  }

  const ded = dedupeTrips(rows, (r) => ({
    dest: r.dest, pax: r.pax, days: r.days, date: r.date, answer: r.actual, file: r.file,
  }));
  const note = droppedNote(ded.dropped);
  if (note) console.log(note + '\n');
  const use = ded.kept.filter((r) => r.cells >= MIN_CELLS);

  console.log('════ 같은 원가 위에서 얹은 비율 ════');
  console.log('원가소계 = 엔진 판매가 − 수익 − 보험. **그 견적서의 실측 단가로 맞춘 뒤** 잰다.');
  console.log('대조 ' + use.length + '건' + (MIN_CELLS ? ' (실측 ' + MIN_CELLS + '칸 이상만)' : '') + '\n');

  const line = (r) => wpad(r.dest, 10) + String(r.pax).padStart(4) + '명'
    + String(r.days).padStart(3) + '일'
    + '  원가 ' + won(r.base).padStart(10)
    + '   우리 ' + pct(r.addOurs).padStart(8)
    + '   그쪽 ' + pct(r.addTheirs).padStart(8)
    + '   차이 ' + pct(r.addTheirs - r.addOurs).padStart(8)
    + '  실측' + String(r.cells).padStart(2) + '칸'
    + (r.unclass == null ? '  미분류 —' : '  미분류 ' + (r.unclass * 100).toFixed(0) + '%')
    + '  ' + r.file.slice(0, 30);

  const groups = [
    ['② 고객용 견적서 — **여기가 0-d의 답이다**', use.filter((r) => !r.isCost)],
    ['① 원가 시트 (「1인당」이 판매가가 아니다 — 참고만)', use.filter((r) => r.isCost)],
  ];
  groups.forEach(([label, g]) => {
    if (!g.length) return;
    console.log('■ ' + label + '  ' + g.length + '건');
    g.slice().sort((a, b) => (a.addTheirs - a.addOurs) - (b.addTheirs - b.addOurs))
      .forEach((r) => console.log('   ' + line(r)));
    const o = g.map((r) => r.addOurs), t = g.map((r) => r.addTheirs);
    const d = g.map((r) => r.addTheirs - r.addOurs);
    console.log('   ' + '─'.repeat(70));
    console.log('   중앙값   우리 ' + pct(q(o, 0.5)) + '   그쪽 ' + pct(q(t, 0.5))
      + '   차이 ' + pct(q(d, 0.5)));
    console.log('   사분위   그쪽 ' + pct(q(t, 0.25)) + ' ~ ' + pct(q(t, 0.75))
      + '   ·  그쪽이 더 얹은 건 ' + d.filter((x) => x > 0).length + '/' + d.length + '건');
    /* 🔴 **우연인지 함께 잰다**(YF에서 배운 것). 여기는 한 견적서에서 두 값을 나란히
       재는 **짝지은 비교**라 부호 검정이 맞다 — 「그쪽이 더 얹은 건」이 절반에서
       얼마나 벗어나 있는가만 보면 된다. 이항분포를 정확히 센다(근사 안 쓴다). */
    {
      const n = d.filter((x) => x !== 0).length, k = d.filter((x) => x > 0).length;
      const C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return r; };
      let p = 0;
      for (let i = 0; i <= n; i++) {
        const t2 = C(n, i) / Math.pow(2, n);
        if (Math.abs(i - n / 2) >= Math.abs(k - n / 2)) p += t2;
      }
      const mark = p <= 0.05 ? '✅ 한쪽으로 치우쳐 있다'
        : '🔴 **치우쳤다고 말할 수 없다** — 어느 쪽이 더 얹는다고 못 한다';
      console.log('   부호 검정  ' + k + '/' + n + '건이 그쪽 우위 · 우연히 이만큼 치우칠 확률 '
        + (p * 100).toFixed(1) + '%  ' + mark);
    }
    console.log('');
  });

  /* ── 🔴 검산 — **부대비용을 원가에서 빼면 그림이 어떻게 되는가** (YL) ──────
     처음 판(YI)은 원가소계 안에 부대비용(지상비의 20%)을 두었다. 그런데 그건
     **우리가 추정해 얹는 값**이지 그 견적서가 실제로 쓴 돈이 아니다. 미분류가 3%인
     문서에도 20%가 붙는다. 그 결과 원가시트 쪽에서 「그쪽이 얹은 비율」이 음수로
     나왔다 — **그쪽이 자기 원가 밑으로 팔았다**는 뜻이라 있을 수 없다.
     빼고 다시 재서 **둘을 나란히** 둔다. 어느 쪽이 옳은지는 「부대비용을 원가로 볼
     것인가」에 달렸고, 그건 숫자가 아니라 정의 문제다. */
  {
    const sgn = (d) => {
      const n = d.filter((x) => x !== 0).length, k = d.filter((x) => x > 0).length;
      const C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return r; };
      let p = 0;
      for (let i = 0; i <= n; i++) {
        const t = C(n, i) / Math.pow(2, n);
        if (Math.abs(i - n / 2) >= Math.abs(k - n / 2)) p += t;
      }
      return { n, k, p };
    };
    console.log('════ 🔴 검산 — 부대비용을 원가로 볼 것인가 ════');
    console.log('부대비용 = 지상비의 ' + Math.round(require(path.join(ROOT, 'data.js')).ANCILLARY.rate * 100)
      + '% 를 **추정해 얹는** 칸이다(기관 섭외·통역·행사 운영).');
    const anc = use.map((r) => r.ancShare).filter((x) => x != null);
    console.log('원가소계에서 차지하는 몫 — 중앙 ' + pct(q(anc, 0.5))
      + ' · 사분위 ' + pct(q(anc, 0.25)) + ' ~ ' + pct(q(anc, 0.75)) + '\n');
    [['② 고객용', use.filter((r) => !r.isCost)], ['① 원가 시트', use.filter((r) => r.isCost)]]
      .forEach(([label, g]) => {
        if (!g.length) return;
        const d1 = g.map((r) => r.addTheirs - r.addOurs);
        const g2 = g.filter((r) => r.addOurs2 != null);
        const d2 = g2.map((r) => r.addTheirs2 - r.addOurs2);
        const s1 = sgn(d1), s2 = sgn(d2);
        console.log('  ' + label + '  ' + g.length + '건');
        console.log('    부대비용을 원가로 봄(YI)   우리 ' + pct(q(g.map((r) => r.addOurs), 0.5))
          + '  그쪽 ' + pct(q(g.map((r) => r.addTheirs), 0.5))
          + '   그쪽 우위 ' + s1.k + '/' + s1.n + ' · p=' + (s1.p * 100).toFixed(1) + '%');
        console.log('    부대비용을 뺌(YL)          우리 ' + pct(q(g2.map((r) => r.addOurs2), 0.5))
          + '  그쪽 ' + pct(q(g2.map((r) => r.addTheirs2), 0.5))
          + '   그쪽 우위 ' + s2.k + '/' + s2.n + ' · p=' + (s2.p * 100).toFixed(1) + '%');
        const flip = (s1.p <= 0.05) !== (s2.p <= 0.05);
        console.log('    → ' + (flip
          ? '🔴 **두 보기의 결론이 다르다.** 부대비용을 원가로 볼지부터 정해야 한다.'
          : '✅ 두 보기가 같은 결론이다 — 이 판단은 부대비용 정의에 흔들리지 않는다.') + '\n');
      });
    const neg = use.filter((r) => r.addTheirs < 0).length;
    const neg2 = use.filter((r) => r.addTheirs2 != null && r.addTheirs2 < 0).length;
    console.log('  ⚠ 「그쪽이 자기 원가 밑으로 팔았다」로 보이는 건 — 부대비용 포함 ' + neg
      + '건 · 뺐을 때 ' + neg2 + '건.');
    console.log('    있을 수 없는 일이므로, 이 수가 줄어드는 쪽이 **원가를 덜 부풀린 보기**다.');
    /* 🔴 부대비용을 빼고도 남는 건 = **원가 조립이 확실히 틀린 자리**다.
       마진 이야기가 아니다 — 우리가 만든 원가가 그 문서의 판매가를 넘었다는 뜻이라
       어느 칸이 틀렸는지 문서를 열어 봐야 한다. 이름을 부른다. */
    const impossible = use.filter((r) => r.addTheirs2 != null && r.addTheirs2 < 0)
      .sort((a, b) => a.addTheirs2 - b.addTheirs2);
    if (impossible.length) {
      console.log('\n  🔴 부대비용을 빼고도 **우리 원가 > 그쪽 판매가**인 건 ' + impossible.length + '건');
      console.log('     — 마진 문제가 아니다. 원가 조립이 확실히 틀린 자리다.');
      impossible.forEach((r) => console.log('     ' + wpad(r.dest, 9)
        + String(r.pax).padStart(4) + '명' + String(r.days).padStart(3) + '일'
        + '  우리원가 ' + won(r.base - r.anc).padStart(10)
        + '  그쪽 판매 ' + won(r.actual).padStart(10)
        + '  ' + pct(r.addTheirs2).padStart(8)
        + '  실측' + String(r.cells).padStart(2) + '칸'
        + (r.isCost ? ' · 원가시트' : '')
        + '  ' + r.file.slice(0, 30)));
    }
    console.log('');
  }

  /* ── 읽는 법 ── 숫자만 두면 반드시 요율 이야기로 흘러간다 */
  const sell = use.filter((r) => !r.isCost);
  const dSell = sell.map((r) => r.addTheirs - r.addOurs);
  console.log('════ 읽는 법 ════');
  console.log('· 이 표의 원가는 **그 견적서 자신의 단가**로 맞춘 것이다. 그래서 남은 차이에');
  console.log('  요율 이야기를 다시 얹으면 안 된다 — 이미 맞춰 놓고 잰 값이다.');
  console.log('· 「그쪽이 더 얹었다」가 곧 「우리 마진이 얇다」는 아니다. **미분류 비중**을');
  console.log('  함께 볼 것 — 그 돈의 일부는 마진이 아니라 우리 9칸 밖의 **실비**다');
  console.log('  (기관 섭외비·통역비·국내수송·싱글차지가 실제로 그렇게 들어 있었다).');
  if (sell.length) {
    console.log('· 지금 고객용 ' + sell.length + '건 중 그쪽이 더 얹은 것 '
      + dSell.filter((x) => x > 0).length + '건 · 중앙 차이 ' + pct(q(dSell, 0.5)) + '.');
    console.log('  🔴 **이 값을 마진 정책으로 옮기는 것은 대표 판단이다**(대기열 0-d).');
    console.log('     그리고 마진 칸은 우리 몫과 현지 몫을 1 : 0.9로 함께 움직인다 —');
    console.log('     올린 것의 약 47%가 현지 파트너에게 간다(0-d 보강).');
  }
})();

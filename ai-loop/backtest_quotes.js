/* ═══════════════════════════════════════════════════════════════════════════
   역검증 — **고객이 보는 금액**이 실제 견적서와 몇 % 어긋나는가 (SA)
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 지금까지 잰 것은 전부 "추출이 몇 칸을 채웠나"였다. 그건 수단이지
   목적이 아니다. 목적은 **고객이 받아 가는 견적의 오차**다. 그런데 그 오차를 재는
   도구가 없었다. 그래서 이런 사고를 구조적으로 못 잡는다:

     추출기를 고쳐 채움칸이 5.2 → 6.8로 늘었다. 그런데 새로 채워진 칸이 틀린 값이라
     요율표에 들어가는 순간 고객 견적이 **더** 어긋난다. 채움칸은 늘었으니 '개선'으로
     보고된다. — 이 저장소의 결함 생성기 ③(안전망이 실제로 실행된 적이 없다) 그대로다.

   이 도구는 실제 여행사 견적서(코퍼스)를 정답지로 삼는다. 견적서에는 그 여행의
   **실제 1인당 금액**이 적혀 있다. 같은 조건(목적지·인원·일수·출발일)을 엔진에 넣어
   나온 금액과 대조하면, 정답지 없이도 오차 분포가 나온다.

   ⚠ 한 가지 해석 주의 — 여행사 견적서의 1인당은 **우리가 지불하는 원가**에 가깝고
   엔진 출력은 **고객에게 파는 금액**이다. 둘의 차이에는 우리 수익이 들어 있다.
   그래서 이 도구는 오차를 "틀렸다"고 말하지 않고 **비율의 분포**로 보여준다.
   비율이 한 값 주위에 모이면 그건 오차가 아니라 **수익률**이고, 흩어지면 그것이 오차다.
   이 구분을 코드가 대신 판단하지 않는다 — 사장님이 봐야 하는 숫자다.

   실행:
     node ai-loop/backtest_quotes.js                    (기본 코퍼스 경로)
     node ai-loop/backtest_quotes.js "D:\다른폴더"
     node ai-loop/backtest_quotes.js --cache            (추출 결과 재사용, 빠름)

   ⚠ 코퍼스 PDF는 **저장소에 넣지 않는다** — 참가자 실명과 거래처 단가가 들어 있다.
   이 파일은 경로만 알고, 결과 캐시도 저장소 밖(ai-loop/.backtest_cache.json은
   .gitignore에 있어야 한다)에 둔다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const args = process.argv.slice(2);
const USE_CACHE = args.includes('--cache');
const CORPUS = args.find((a) => !a.startsWith('--')) || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

/* ── 무엇을 정답지로 삼는가 (SC) ──────────────────────────────────────────
   `--basis=cost` 를 주면 **우리 원가(입금가)** 와 대조한다. 기본은 판매가다.

   ⚠ 이 구분이 결론을 뒤집는다. 하나투어 원가 시트는 두 숫자를 나란히 찍는다:
       입금가 1,347,276 (우리가 내는 돈)   판매가 1,490,000 (권장 고객가)
   기본(판매가) 대조에서 「엔진이 10% 낮다」는 **하나투어 권장가보다 싸다**는 뜻이고,
   원가 대조에서 「엔진이 낮다」는 **팔면 손해**라는 뜻이다. 전혀 다른 말이다.
   그래서 어느 쪽으로 쟀는지 표 머리에 항상 찍는다 — 숫자만 옮겨 적으면 뜻이 사라진다. */
const BASIS = (args.find((a) => a.startsWith('--basis=')) || '').split('=')[1] || 'sell';
if (!['sell', 'cost'].includes(BASIS)) { console.log('--basis 는 sell 또는 cost'); process.exit(1); }

const { dedupeTrips, droppedNote } = require('./_same_trip');
/* ⚠ **대조 가능 판정은 `_comparable.js` 하나가 진실**이다(VL). 칸별 오차 분해가
   같은 표본을 봐야 「분해한 합」과 이 표의 오차가 같은 이야기가 된다. */
const { comparable } = require('./_comparable');
const { loadCorpus, CACHE } = require('./_corpus_cache');
/* 목표선은 **`_accuracy_target.js` 하나가 진실**이다(VL). 예전엔 여기에 직접 적고
   sim_margin_bands가 사본을 들었고, 갈라지는 것을 test_vJ가 소스 정규식으로 막고
   있었다 — 도구가 늘 때마다 사본과 대조가 함께 느는 구조라 파생으로 바꿨다. */
const TARGETS = require('./_accuracy_target');

/* ── 코퍼스 추출 ─────────────────────────────────────────────────────────
   추출·캐시는 **_corpus_cache.js 하나가 진실**이다(VL). 칸별 오차 분해가 같은 캐시
   파일을 쓰므로 판(version)과 담는 칸이 두 곳에 있으면 조용히 어긋난다. */
const extractCorpus = () => loadCorpus({ corpus: CORPUS, useCache: USE_CACHE });

/* ── 엔진 ────────────────────────────────────────────────────────────────
   ⚠ `script.js`의 견적 엔진은 화면과 엮여 있어 jsdom으로 띄운다.
   합쳐 eval하는 파일 목록은 CLAUDE.md가 정한 그대로다(rec_fallbacks.js를 빼면
   REC_FALLBACKS가 undefined라 그 자리에서 죽는다). */
async function bootEngine() {
  /* ⚠ **운영 요율을 얹고 잰다**(TR). 안 얹으면 data.js 기본값으로 재는데 고객은
     오버라이드로 계산된 금액을 본다 — 그러면 이 표는 고객이 겪는 오차가 아니다. */
  const { loadOverrides, applyOverrides } = require('./_rate_overrides');
  const ov = await loadOverrides();
  const EXPOSE = '\n;try{window.__DR=destinationRates;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      /* ⚠ 네트워크를 막는다 — 안 막으면 운영 DB의 site_events에 행이 쌓인다. */
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') throw new Error('엔진 로드 실패 — getBreakdownData 없음');
  console.log('요율 오버라이드 ' + applyOverrides(window.__DR, ov.overrides) + '칸 적용 — ' + ov.from);
  const doc = window.document;
  return (o) => {
    doc.getElementById('destination').value = o.dest;
    doc.getElementById('participants').value = String(o.pax);
    doc.getElementById('days').value = String(o.days);
    doc.getElementById('startDate').value = o.date;
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
      const e = doc.getElementById(id); if (e) e.checked = true;
    });
    return window.getBreakdownData();
  };
}

const pct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    console.log('경로를 인자로 주거나 BIZPAGE_CORPUS 환경변수를 설정하세요.');
    process.exit(1);
  }
  const corpus = await extractCorpus();
  const run = await bootEngine();

  const rows = [];
  const skipped = [];
  for (const c of corpus) {
    /* 판정은 _comparable.js 한 곳에서 온다(VL) — 여기서 규칙을 다시 적으면
       두 도구가 조용히 다른 표본을 재게 된다(결함 생성기 ①). */
    const cmp = comparable(c, BASIS);
    if (!cmp.ok) { skipped.push({ f: c.file, why: cmp.why }); continue; }
    const { dest: key, pax, days, date, actual } = cmp;

    let bd;
    try { bd = run({ dest: key, pax, days, date }); }
    catch (e) { skipped.push({ f: c.file, why: '엔진 예외: ' + e.message }); continue; }
    if (!bd || !bd.perPerson) { skipped.push({ f: c.file, why: '엔진이 금액을 못 냄' }); continue; }

    rows.push({
      file: c.file, dest: key, pax, days, date,
      actual, engine: bd.perPerson,
      ratio: bd.perPerson / actual,
      err: (bd.perPerson - actual) / actual,
      conflict: cmp.conflict,
      /* 원가 시트면 판매가도 같이 들고 있는다 — 하나투어가 권한 마진을 함께 보여준다 */
      sell: c.perPerson || null, deposit: c.deposit || null,
      /* 입금가 열이 여러 벌인 문서 — 가장 낮은 원가로 재도 같은 결론인지 봐야 한다 */
      depLow: (c.depositAll && c.depositAll.length > 1) ? c.depositAll[c.depositAll.length - 1] : null,
      depositAllText: (c.depositAll || []).map((n) => n.toLocaleString()).join(' / '),
    });
  }

  /* ⚠ **같은 여행이 문서 두 벌로 들어온 것을 한 번만 센다**(VG). VA는 같은 *파일*을
     잡았고, 이건 그 다음 층이다 — 파일은 다른데 같은 여행인 경우다. 실측:
       「2026 굿리치 일정표(확정)」과 「굿리치RM_연도대상 체코&오스트리」가 둘 다
       동유럽 158명 6일 2026-04-04 입금가 4,569,397이다(원가 기준 15건 중 2건).
     ⚠ 차수별 견적은 **출발일이 다르므로** 뭉쳐지지 않는다(상하이 11/08·11/15·11/22). */
  const ded = dedupeTrips(rows, (r) => ({
    dest: r.dest, pax: r.pax, days: r.days, date: r.date, answer: r.actual, file: r.file,
  }));
  const note = droppedNote(ded.dropped);
  rows.length = 0;
  ded.kept.forEach((r) => rows.push(r));

  console.log('\n════ 역검증 결과 ════');
  console.log(BASIS === 'cost'
    ? '정답지: **우리 원가(입금가)** — 「엔진이 낮다」는 곧 **팔면 손해**라는 뜻이다.'
    : '정답지: 견적서의 1인당 판매가 — 「엔진이 낮다」는 **그 견적서보다 싸다**는 뜻이다.');
  if (note) console.log(note);
  console.log('코퍼스 ' + corpus.length + '건 중 대조 가능 ' + rows.length + '건, 제외 '
    + (skipped.length + ded.dropped.length) + '건\n');

  if (rows.length) {
    rows.sort((a, b) => a.err - b.err);
    if (BASIS === 'cost') {
      const under = rows.filter((r) => r.err < 0);
      /* ⚠ 입금가 열이 여러 벌인 문서는 **가장 낮은 원가로 재도** 여전히 아래인지 봐야 한다.
         한 열만 보고 「손해」라고 말하면 열을 잘못 고른 것일 수 있다 — 그 구분을 표에 남긴다. */
      const firm = under.filter((r) => !r.depLow || r.engine < r.depLow);
      const soft = under.filter((r) => r.depLow && r.engine >= r.depLow);
      console.log('🔴 엔진 금액이 **우리 원가보다 낮은** 건: ' + under.length + ' / ' + rows.length + '건'
        + (soft.length ? '  (그중 ' + soft.length + '건은 입금가 열이 여러 벌이라 확정 못 함)' : ''));
      const show = (r, mark) => console.log('     ' + mark + ' ' + r.dest.padEnd(8) +
        ' 원가 ' + r.actual.toLocaleString().padStart(11) +
        ' → 엔진 ' + r.engine.toLocaleString().padStart(11) +
        '  ' + pct(r.err).padStart(7) +
        '  (1인 ' + Math.round(r.actual - r.engine).toLocaleString() + '원' +
        (r.pax ? ' · ' + r.pax + '명이면 ' + Math.round((r.actual - r.engine) * r.pax / 10000).toLocaleString() + '만원' : '') +
        ')  ' + r.file.slice(0, 28));
      firm.forEach((r) => show(r, '·'));
      soft.forEach((r) => {
        show(r, '?');
        console.log('        ↑ 이 문서엔 입금가가 여러 개다(' + r.depositAllText + '). 가장 낮은 ' +
          r.depLow.toLocaleString() + '로 재면 원가 위다 — 어느 열이 기준인지 사람이 봐야 한다.');
      });
      console.log('');
    }
    /* ⚠ 파일 이름을 반드시 함께 찍는다. 목적지 매칭이 틀려도 표만 보면 그럴듯해 보인다
       (세부내역서→세부 사고가 정확히 그랬다). 이름이 있어야 사람이 눈으로 잡는다. */
    console.log('목적지     인원 일수 출발일      견적서 1인당    엔진 1인당    차이  파일');
    console.log('─'.repeat(104));
    rows.forEach((r) => {
      console.log(
        r.dest.padEnd(10) + String(r.pax).padStart(4) + String(r.days).padStart(4) + '  ' +
        r.date + '  ' + r.actual.toLocaleString().padStart(12) + '  ' +
        r.engine.toLocaleString().padStart(12) + '  ' + pct(r.err).padStart(7) +
        (r.conflict ? ' ⚠' : '  ') + ' ' + r.file.slice(0, 34)
      );
    });
    const conf = rows.filter((r) => r.conflict).length;
    if (conf) {
      console.log('⚠ ' + conf + '건은 문서 안 기간 표기가 어긋나 **날짜 범위 쪽**을 썼다(제목의 N박이 틀린 경우).');
      console.log('  일수는 금액에 거의 정비례하므로, 이 건들은 사장님이 한 번 눈으로 봐 주는 게 좋다.');
    }
    const errs = rows.map((r) => r.err).sort((a, b) => a - b);
    const ratios = rows.map((r) => r.ratio).sort((a, b) => a - b);
    console.log('─'.repeat(78));
    console.log('중앙값 ' + pct(quantile(errs, 0.5)) + '   사분위 ' + pct(quantile(errs, 0.25)) + ' ~ ' + pct(quantile(errs, 0.75)) +
      '   최소 ' + pct(errs[0]) + '  최대 ' + pct(errs[errs.length - 1]));
    const within = (t) => rows.filter((r) => Math.abs(r.err) <= t).length;
    console.log('±5% 안 ' + within(0.05) + '건 · ±10% 안 ' + within(0.10) + '건 · ±20% 안 ' + within(0.20) + '건  (전체 ' + rows.length + '건)');
    /* ── 목표선 (VI · VL에서 단일 출처로) ────────────────────────────────────
       값도 이유도 `_accuracy_target.js`에 있다. 여기서 다시 적지 않는다. */
    const TARGET = TARGETS.TARGET;
    const inBand = rows.filter((r) => Math.abs(r.err) <= TARGET).length;
    const below = rows.filter((r) => r.err < -TARGET);
    const above = rows.filter((r) => r.err > TARGET);
    const med = quantile(errs, 0.5);
    console.log('\n──── 목표선: ' + TARGETS.LABEL + ' ────');
    console.log('  목표 안 ' + inBand + '건 / ' + rows.length + '건 ('
      + Math.round(inBand / rows.length * 100) + '%)');
    console.log('  🔴 아래로 벗어남 ' + below.length + '건  ← 싸게 불렀다. **이쪽이 더 아프다**'
      + (below.length ? '  (최악 ' + pct(below[0] && Math.min.apply(null, below.map((r) => r.err))) + ')' : ''));
    console.log('  🟡 위로 벗어남 ' + above.length + '건  ← 비싸게 불렀다(실견적에서 깎을 수 있다)');
    console.log('  중앙값 ' + pct(med) + ' → 목표 방향은 **' + pct(TARGETS.AIM_LOW) + '~' + pct(TARGETS.AIM_HIGH) + '**다 '
      + (TARGETS.aimedRight(med) ? '(범위 안이다)' : med < TARGETS.AIM_LOW ? '(지금은 반대쪽에 있다)' : '(지금은 넘어가 있다)'));

    console.log('\n비율(엔진 ÷ 견적서) 중앙값 ' + quantile(ratios, 0.5).toFixed(3) +
      '  사분위 ' + quantile(ratios, 0.25).toFixed(3) + ' ~ ' + quantile(ratios, 0.75).toFixed(3));
    console.log('  ↑ 이 값이 한 곳에 모이면 오차가 아니라 **수익률**이다(견적서=원가, 엔진=판매가).');
    console.log('    흩어지는 정도가 진짜 오차다. 어느 쪽인지는 사장님이 판단해야 한다.');
  } else {
    console.log('대조 가능한 건이 없습니다. 아래 제외 사유를 보세요.');
  }

  console.log('\n──── 제외 ' + skipped.length + '건 (사유별) ────');
  const byWhy = {};
  skipped.forEach((s) => { (byWhy[s.why] = byWhy[s.why] || []).push(s.f); });
  Object.keys(byWhy).sort((a, b) => byWhy[b].length - byWhy[a].length).forEach((w) => {
    console.log('  ' + String(byWhy[w].length).padStart(2) + '건  ' + w);
    byWhy[w].forEach((f) => console.log('        · ' + f));
  });
})();

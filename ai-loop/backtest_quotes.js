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
const { corpusFiles } = require('./_corpus_files.js');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const args = process.argv.slice(2);
const USE_CACHE = args.includes('--cache');
const CORPUS = args.find((a) => !a.startsWith('--')) || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
const CACHE = path.join(__dirname, '.backtest_cache.json');

/* ── 무엇을 정답지로 삼는가 (SC) ──────────────────────────────────────────
   `--basis=cost` 를 주면 **우리 원가(입금가)** 와 대조한다. 기본은 판매가다.

   ⚠ 이 구분이 결론을 뒤집는다. 하나투어 원가 시트는 두 숫자를 나란히 찍는다:
       입금가 1,347,276 (우리가 내는 돈)   판매가 1,490,000 (권장 고객가)
   기본(판매가) 대조에서 「엔진이 10% 낮다」는 **하나투어 권장가보다 싸다**는 뜻이고,
   원가 대조에서 「엔진이 낮다」는 **팔면 손해**라는 뜻이다. 전혀 다른 말이다.
   그래서 어느 쪽으로 쟀는지 표 머리에 항상 찍는다 — 숫자만 옮겨 적으면 뜻이 사라진다. */
const BASIS = (args.find((a) => a.startsWith('--basis=')) || '').split('=')[1] || 'sell';
if (!['sell', 'cost'].includes(BASIS)) { console.log('--basis 는 sell 또는 cost'); process.exit(1); }
/* ⚠ 캐시에 새 칸(입금가)이 생겼다. 판이 다르면 **조용히 재사용하지 않는다** —
   안 그러면 원가가 undefined라 전건이 '제외'로 빠지고 그게 '해당 없음'처럼 보인다. */
const CACHE_VERSION = 5;   /* VC: `dest` · VE: `needsFx`(제외 사유를 가르는 신호) */

const { DEST_ALIAS, destFromName } = require('./_dest_from_name');

/* ── 코퍼스 추출 ─────────────────────────────────────────────────────────── */
async function extractCorpus() {
  if (USE_CACHE && fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (cached && cached.version === CACHE_VERSION) {
      console.log('캐시 사용: ' + CACHE + '  (--cache 빼면 다시 추출)');
      /* ⚠ VA: 캐시는 **파일 목록을 거치지 않는다.** 여기서 다시 거르지 않으면 중복 제거가
         `--cache`일 때만 조용히 안 먹는다 — 안전망이 실행되지 않는 자리다(결함 생성기 ③).
         옛 캐시에 남아 있는 중복 행도 이 한 줄이 걷어낸다. */
      const allow = new Set(corpusFiles(CORPUS).files);
      return cached.rows.filter((r) => allow.has(r.file));
    }
    console.log('캐시가 낡았습니다(판 ' + (cached && cached.version) + ' ≠ ' + CACHE_VERSION + ') — 다시 추출합니다.');
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)');
  const out = [];
  for (const f of files) {
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      const r = await X.extractQuote(buf, pdfParse, {});
      out.push({
        file: f, pax: r.pax, perPerson: r.perPerson, grand: r.grandTotal,
        deposit: r.depositPerPerson || null, depositAll: r.depositCandidates || [],
        dates: r.dates, kind: r.kind && r.kind.kind, values: r.values,
        /* VC: 목적지 판정을 **여기서 한 번만** 한다. 본문이 필요한데 본문은 캐시에
           싣지 않기 때문이다(46건 전문이면 캐시가 몇 MB로 부푼다). 판정 결과만 싣는다.
           ⚠ 그래서 `CACHE_VERSION`을 올렸다 — 안 올리면 옛 캐시에 이 칸이 없어
           `--cache`일 때만 목적지가 통째로 비는, 조용한 어긋남이 된다(결함 생성기 ③). */
        dest: destFromName(f, r.text),
        /* VE: 「못 읽음」의 이유를 가르는 데 쓴다. 캐시에 없으면 `--cache`일 때만
           이유가 뭉뚱그려져, 고칠 수 있는 것과 없는 것이 같은 얼굴이 된다. */
        needsFx: r.needsFxRate || null,
        /* UU: 인원이 문서 계산과 어긋난다는 표시. 여기서 안 실으면 아래 가드가
           영영 안 걸린다 — 만들어만 두고 안 도는 안전망이 된다(결함 생성기 ③). */
        paxConflict: r.paxConflict || null,
      });
    } catch (e) {
      out.push({ file: f, error: String(e.message).slice(0, 120) });
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify({ version: CACHE_VERSION, rows: out }, null, 1), 'utf8');
  return out;
}

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
    if (c.error) { skipped.push({ f: c.file, why: '추출 오류: ' + c.error }); continue; }
    /* ⚠ **캐시가 준 판정을 그대로 쓴다.** 여기서 `destFromName(c.file)`을 다시 부르면
       본문이 없어 파일명만 보게 되고, 추출할 때와 캐시를 쓸 때의 답이 갈린다(VC). */
    const { key, why } = c.dest || {};
    if (!key) { skipped.push({ f: c.file, why: why || '목적지 판정 없음(캐시가 낡았다)' }); continue; }
    /* 정답지 — 판매가(기본)인가 우리 원가(입금가)인가. 섞지 않는다 (SC). */
    const actual = BASIS === 'cost' ? c.deposit : c.perPerson;
    if (!actual) {
      /* ⚠ **못 읽은 것과 없는 것을 가른다**(VE). 예전엔 셋을 전부 「1인당 금액을 못
         읽음」 하나로 묶었는데, 그러면 **고칠 수 있는 것과 없는 것이 같은 얼굴**이 된다.
         실제로 그 표시를 보고 원가 시트를 고치려 들었다 — 그 문서엔 판매가 자리가
         「* 계약서상 판매가??」로 **비어 있어서** 코드로는 영영 못 읽는다.
         이제 셋으로 나눈다: ①원가 시트라 판매가가 없다 ②외화인데 환율이 없다(사람이
         한 칸) ③진짜로 못 읽었다(코드가 고칠 것). ③만 우리 몫이다. */
      skipped.push({ f: c.file, why: BASIS === 'cost'
        ? '「입금가」가 없음 (원가 시트가 아니다 — 고객용 견적서로 보인다)'
        : c.deposit
          ? '원가 시트라 판매가가 없다 (입금가 ' + Number(c.deposit).toLocaleString()
            + ' — `--basis=cost`로는 잰다)'
          : (c.needsFx && c.needsFx.currency)
            ? '외화(' + c.needsFx.currency + ' ' + c.needsFx.rowCount
              + '줄)인데 문서에 환율이 없다 — 사람이 한 칸 (결정대기열 0-f)'
            : '견적서에서 1인당 금액을 못 읽음' });
      continue;
    }
    if (!c.pax || c.pax < 2) { skipped.push({ f: c.file, why: '인원 불명' }); continue; }
    const days = (c.dates && (c.dates.days || (c.dates.nights ? c.dates.nights + 1 : 0))) || 0;
    if (!days) { skipped.push({ f: c.file, why: '일수 불명(출발·도착일이 없음)' }); continue; }
    /* 문서가 스스로 모순된 기간을 적은 건 — **빼지 않고 표시만 한다.**
       처음엔 뺐다가 되돌렸다. 7건이 걸렸는데 전부 같은 모양이었고(제목이 날짜보다 1박 적다),
       실제로 열어 보니 **틀린 쪽은 언제나 제목**이었다:
         · 「행사기간 2026. 10. 11 ~ 10. 15 (3박 5일)」 — 3박이면 4일이라 그 자체로 모순.
           날짜로는 4박 5일이 맞다.
         · 「대림벧엘교회 해외여행 (큐슈) | 2박 3일」 — 일정표에 4일차까지 있고
           03.10~03.13이라 3박 4일이 맞다.
       날짜 범위가 더 구체적인 증거이므로 그쪽을 쓰되, **표에 ⚠로 남겨** 사람이
       눈으로 확인할 수 있게 한다. 7건을 버리면 표본이 15→8로 줄어 분포가 더 흔들린다. */
    /* 출발일이 없으면 시즌 계수를 못 맞춘다 — 그 대조는 계절 오차를 엔진 오차로 오해하게 한다 */
    if (!c.dates.departDate) { skipped.push({ f: c.file, why: '출발일 불명(시즌 계수를 맞출 수 없음)' }); continue; }

    /* UU: 문서의 총계 ÷ 1인당이 딱 떨어지는데 우리가 읽은 인원과 다르면 대조하지 않는다.
       인원은 규모 계수로 금액에 들어가므로, 틀린 인원으로 잰 오차는 엔진 오차로 둔갑한다.
       ⚠ 조용히 빼지 않는다 — **문서 계산이 몇 명인지까지 적어** 사람이 한 칸 확인하면
         바로 표본이 되게 한다(빈칸보다 틀린 값이 위험하다는 원칙 그대로다). */
    if (c.paxConflict) {
      skipped.push({ f: c.file, why: '인원 어긋남 — 우리가 읽은 ' + c.paxConflict.docPax
        + '명 vs 문서 계산 ' + c.paxConflict.impliedPax + '명 (총계 ÷ 1인당)' });
      continue;
    }

    let bd;
    try { bd = run({ dest: key, pax: c.pax, days, date: c.dates.departDate }); }
    catch (e) { skipped.push({ f: c.file, why: '엔진 예외: ' + e.message }); continue; }
    if (!bd || !bd.perPerson) { skipped.push({ f: c.file, why: '엔진이 금액을 못 냄' }); continue; }

    rows.push({
      file: c.file, dest: key, pax: c.pax, days, date: c.dates.departDate,
      actual, engine: bd.perPerson,
      ratio: bd.perPerson / actual,
      err: (bd.perPerson - actual) / actual,
      conflict: c.dates.nightsConflict || null,
      /* 원가 시트면 판매가도 같이 들고 있는다 — 하나투어가 권한 마진을 함께 보여준다 */
      sell: c.perPerson || null, deposit: c.deposit || null,
      /* 입금가 열이 여러 벌인 문서 — 가장 낮은 원가로 재도 같은 결론인지 봐야 한다 */
      depLow: (c.depositAll && c.depositAll.length > 1) ? c.depositAll[c.depositAll.length - 1] : null,
      depositAllText: (c.depositAll || []).map((n) => n.toLocaleString()).join(' / '),
    });
  }

  console.log('\n════ 역검증 결과 ════');
  console.log(BASIS === 'cost'
    ? '정답지: **우리 원가(입금가)** — 「엔진이 낮다」는 곧 **팔면 손해**라는 뜻이다.'
    : '정답지: 견적서의 1인당 판매가 — 「엔진이 낮다」는 **그 견적서보다 싸다**는 뜻이다.');
  console.log('코퍼스 ' + corpus.length + '건 중 대조 가능 ' + rows.length + '건, 제외 ' + skipped.length + '건\n');

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

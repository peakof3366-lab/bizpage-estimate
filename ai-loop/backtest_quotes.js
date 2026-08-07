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
const CACHE = path.join(__dirname, '.backtest_cache.json');

/* ── 파일 이름 → 목적지 키 ────────────────────────────────────────────────
   ⚠ 이 표는 **도메인 지식**이다. 코드가 추측하면 안 된다.
   견적서 파일 이름에 목적지가 들어 있는 것이 이 회사의 관행이라 그걸 쓴다.
   ⚠ 매칭이 애매한 것은 **비워 둔다.** 억지로 가까운 목적지에 붙이면 그 오차가
   엔진 오차로 둔갑한다(가고시마를 후쿠오카로 세면 우리 요율이 틀린 것처럼 보인다).
   목록에 없는 목적지가 나오면 화면이 "요율표에 없는 목적지"라고 말하고 넘어간다. */
const DEST_ALIAS = [
  ['오키나와', ['오키나와', '미야코지']],
  ['삿포로', ['북해도', '삿포로', '홋카이도']],
  ['후쿠오카', ['큐슈', '후쿠오카']],
  ['도쿄', ['도쿄', '동경']],
  ['오사카', ['오사카']],
  ['상해', ['상하이', '상해']],
  ['홍콩', ['홍콩']],
  ['마카오', ['마카오']],
  ['대만', ['타이베이', '대만']],
  ['싱가포르', ['싱가포르']],
  ['하노이', ['하노이']],
  ['다낭', ['다낭']],
  ['나트랑', ['나트랑']],
  ['푸꾸옥', ['푸꾸옥']],
  ['세부', ['세부']],
  ['보홀', ['보홀']],
  ['푸켓', ['푸켓']],
  ['발리', ['발리']],
  ['카자흐스탄', ['카자흐스탄']],
  ['스페인', ['바르셀로나', '마드리드']],
  ['로마', ['이태리', '이탈리아', '로마']],
  ['동유럽', ['체코', '오스트리']],
];

/* 목적지가 아닌데 목적지 이름을 품고 있는 말들. **먼저 지우고** 매칭한다.
   ⚠ 이걸 안 지웠다가 실제로 당했다: 「(세부내역서) 한화손해보험 뉴퍼스트 26명」이
   필리핀 **세부**로 잡혀 26명·5일 견적으로 대조됐고, 오차 -38.5%가 분포에 들어가
   중앙값을 통째로 끌어내렸다. 문서 종류를 가리키는 말이지 목적지가 아니다. */
const NOT_A_DEST = /세부\s*내역서|내역서|견적서|일정표|확정/g;

/* ⚠ 여러 목적지가 한 이름에 있으면(‘대만, 푸꾸옥’) 어느 쪽 요율로 재야 할지 모른다.
   고르지 않고 뺀다 — 절반만 맞는 대조는 분포를 조용히 오염시킨다. */
function destFromName(name) {
  const cleaned = name.replace(NOT_A_DEST, ' ');
  const hits = DEST_ALIAS.filter(([, aliases]) => aliases.some((a) => cleaned.includes(a)));
  if (hits.length !== 1) return { key: null, why: hits.length ? '목적지 여러 곳' : '요율표에 없는 목적지' };
  return { key: hits[0][0], why: null };
}

/* ── 코퍼스 추출 ─────────────────────────────────────────────────────────── */
async function extractCorpus() {
  if (USE_CACHE && fs.existsSync(CACHE)) {
    console.log('캐시 사용: ' + CACHE + '  (--cache 빼면 다시 추출)');
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)');
  const out = [];
  for (const f of files) {
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      const r = await X.extractQuote(buf, pdfParse, {});
      out.push({
        file: f, pax: r.pax, perPerson: r.perPerson, grand: r.grandTotal,
        dates: r.dates, kind: r.kind && r.kind.kind, values: r.values,
      });
    } catch (e) {
      out.push({ file: f, error: String(e.message).slice(0, 120) });
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(out, null, 1), 'utf8');
  return out;
}

/* ── 엔진 ────────────────────────────────────────────────────────────────
   ⚠ `script.js`의 견적 엔진은 화면과 엮여 있어 jsdom으로 띄운다.
   합쳐 eval하는 파일 목록은 CLAUDE.md가 정한 그대로다(rec_fallbacks.js를 빼면
   REC_FALLBACKS가 undefined라 그 자리에서 죽는다). */
async function bootEngine() {
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
    const { key, why } = destFromName(c.file);
    if (!key) { skipped.push({ f: c.file, why }); continue; }
    if (!c.perPerson) { skipped.push({ f: c.file, why: '견적서에서 1인당 금액을 못 읽음' }); continue; }
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

    let bd;
    try { bd = run({ dest: key, pax: c.pax, days, date: c.dates.departDate }); }
    catch (e) { skipped.push({ f: c.file, why: '엔진 예외: ' + e.message }); continue; }
    if (!bd || !bd.perPerson) { skipped.push({ f: c.file, why: '엔진이 금액을 못 냄' }); continue; }

    rows.push({
      file: c.file, dest: key, pax: c.pax, days, date: c.dates.departDate,
      actual: c.perPerson, engine: bd.perPerson,
      ratio: bd.perPerson / c.perPerson,
      err: (bd.perPerson - c.perPerson) / c.perPerson,
      conflict: c.dates.nightsConflict || null,
    });
  }

  console.log('\n════ 역검증 결과 ════');
  console.log('코퍼스 ' + corpus.length + '건 중 대조 가능 ' + rows.length + '건, 제외 ' + skipped.length + '건\n');

  if (rows.length) {
    rows.sort((a, b) => a.err - b.err);
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

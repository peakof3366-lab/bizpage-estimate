/* UV 검증: 추출기가 **화면에 쓰라고 만들어 둔 신호**가 올리는 사람에게 실제로 닿는가.

   왜 —
   추출기는 「사람이 봐야 한다」는 신호를 여럿 만든다. 그런데 그중 셋이 견적서 업데이트
   화면까지 한 번도 오지 않았다. 셋 다 **금액에 직결**되는데, 담당자는 PDF를 올리는
   순간 아무 말도 못 들었다:

     ① paxConflict     인원 어긋남 — 총계 ÷ 1인당이 딱 떨어지는데 읽은 인원과 다르다
                       (리더스에셋 푸꾸옥: 128,770,920 ÷ 1,839,585 = 정확히 70인데 50)
                       인원은 **모든 1인당 단가의 분모**다.
     ② nightsConflict  문서가 스스로 모순 — 제목의 「N박」과 기간 표기가 다르다
                       (대림벧엘 큐슈: 제목 2박 3일 · 기간 03.10~03.13 = 3박 4일)
     ③ daysVia         일수를 기간 표기가 아니라 **일정표를 세어** 얻었다
                       (KT CES: 9일 일정인데 일정표로는 13일이 나온다)

   추출기 주석은 셋 다 「화면이 이 표시를 보고 담당자에게 한 칸 물어볼 수 있다」고
   적어 두었는데, 정작 화면으로 가는 길이 없었다 — 만들어만 두고 안 도는 안전망
   (결함 생성기 ③)이고, 이 저장소가 반복해서 당한 유형이다.

   여기서 고정하는 것:
   ① 세 신호가 **경고 문구로** 올라온다 (화면이 그대로 그린다).
   ② 문구가 **무엇을 봐야 하는지**를 말한다 — 숫자를 함께 준다(「어긋납니다」로 끝내지 않는다).
   ③ **값을 고치지 않는다.** 인원도 일수도 그대로 두고 사람이 정한다.
   ④ 신호가 없는 정상 문서에는 그 경고가 안 뜬다 (늘 뜨는 경고는 곧 안 읽힌다).
   ⑤ 원본 신호도 함께 내려보낸다 — 문구만 주면 화면을 바꿀 때마다 서버를 고쳐야 한다.

   실행: node ai-loop/test_uV_extract_warnings.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 핸들러를 실제로 부른다 ────────────────────────────────────────────────
   ⚠ 소스에 문구가 있는지로 끝내지 않는다. 신호는 추출기 → 핸들러 → 응답까지
     세 단계를 지나고, 한 곳만 빠뜨리면 영영 안 뜬다(UU에서 reconcile이 실제로
     떨어뜨리고 있었다). 가짜 추출기를 심어 **응답 본문을 받아 본다.** */
function callHandler(extractResult) {
  const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: { sql: () => Promise.resolve([]) }, children: [], paths: [] };
  const authPath = require.resolve(path.join(ROOT, 'api', '_lib', 'auth.js'));
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
    exports: { requireAdmin: async () => true, requireRole: async () => true },
    children: [], paths: [] };

  /* ⚠ pdf-parse가 **추출기보다 먼저** 돈다. 안 심으면 가짜 PDF에서 pdf_parse_failed로
     끝나고 이 테스트는 경고를 한 줄도 못 본다(실제로 그랬다).
     ⚠ 심을 것은 `pdf-parse`가 아니라 **`pdf-parse/lib/pdf-parse.js`**다 — 1.x의
       index.js가 테스트 파일을 읽으려 해서 저장소가 lib을 직접 부르기 때문이다.
       패키지 이름으로 심으면 캐시가 안 맞아 진짜 파서가 그대로 돈다. */
  const ppPath = require.resolve('pdf-parse/lib/pdf-parse.js');
  require.cache[ppPath] = { id: ppPath, filename: ppPath, loaded: true, children: [], paths: [],
    /* ⚠ 글자 수가 짧으면 핸들러가 no_text_found로 먼저 끊는다(스캔 PDF 취급) —
       실제 견적서만큼의 길이를 준다. */
    exports: async () => ({ text: '견적서 본문 '.repeat(80), numpages: 2 }) };

  const exPath = require.resolve(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const real = require(exPath);
  const base = {
    kind: { kind: 'sell' }, values: {}, evidence: {}, candidates: [], pax: 50,
    grandTotal: 128770920, perPerson: 1839585, blockCount: 1, selectedBlock: 0, blocks: [],
    reconciliation: { checks: [] }, dates: { days: 4, nights: 3, departDate: '2025-12-03' },
    fxRates: {}, itinerary: null, daysVia: 'header', paxConflict: null, needsFxRate: null,
    /* ⚠ 핸들러가 `out.text`가 없으면 no_text_found로 먼저 끊는다(스캔 PDF 취급).
       추출기 결과에 본문이 실려 오는 것을 전제로 하는 자리다. */
    text: '견적서 본문 '.repeat(80),
  };
  require.cache[exPath] = {
    id: exPath, filename: exPath, loaded: true, children: [], paths: [],
    exports: Object.assign({}, real, {
      extractQuote: async () => Object.assign({}, base, extractResult),
    }),
  };

  delete require.cache[require.resolve(path.join(ROOT, 'api', 'quotes.js'))];
  const handler = require(path.join(ROOT, 'api', 'quotes.js'));
  let out = { status: 0, body: null };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  /* 아주 작은 PDF 흉내 — 파서는 위에서 가짜로 바꿔 놓았으므로 내용은 안 읽힌다. */
  const req = { method: 'POST', query: { action: 'extractPdf' },
    body: { pdfBase64: Buffer.from('%PDF-1.4 test').toString('base64') } };
  return handler(req, res).then(() => out);
}
const texts = (o) => ((o.body && o.body.warnings) || []).join(' || ');

(async () => {
  console.log('\n[1] 인원 어긋남 (①)');
  {
    const o = await callHandler({ paxConflict: { docPax: 50, impliedPax: 70 } });
    const w = texts(o);
    ok('① 경고로 올라온다', /인원이 어긋납니다/.test(w), w.slice(0, 120));
    ok('② 두 숫자를 함께 준다 (50 vs 70)', /50명/.test(w) && /70명/.test(w), w.slice(0, 160));
    ok('② 왜 봐야 하는지 말한다 (1인당 단가가 전부 어긋난다)',
      /1인당 단가가 전부 어긋납니다/.test(w));
    ok('⑤ 원본 신호도 함께 내려온다',
      o.body.paxConflict && o.body.paxConflict.impliedPax === 70,
      JSON.stringify(o.body.paxConflict));
    ok('③ 값은 그대로다 — 인원을 고치지 않는다', o.body.pax === 50, String(o.body.pax));
  }

  console.log('\n[2] 문서가 스스로 모순 (②)');
  {
    const o = await callHandler({
      dates: { days: 4, nights: 3, departDate: '2026-03-10',
        nightsConflict: { fromDates: 3, labelled: 2, labelledDays: 3 } },
    });
    const w = texts(o);
    ok('② 경고로 올라온다', /문서 안에서 기간이 어긋납니다/.test(w), w.slice(0, 140));
    ok('② 어느 쪽을 썼는지 말한다 (날짜 범위)', /날짜 범위\(3박\)를 썼습니다/.test(w), w);
    ok('② 문서에 적힌 쪽도 말한다', /2박/.test(w));
    ok('③ 일수는 그대로 4일이다 (고치지 않는다)', o.body.dates.days === 4, String(o.body.dates.days));
  }

  console.log('\n[3] 일정표를 세어 일수를 얻음 (③)');
  {
    const o = await callHandler({ daysVia: 'itinerary', dates: { days: 13, nights: 12, departDate: '2025-01-08' } });
    const w = texts(o);
    ok('③ 경고로 올라온다', /일정표를 세어/.test(w), w.slice(0, 140));
    ok('③ 며칠로 봤는지 말한다', /13일/.test(w), w.slice(0, 160));
    ok('③ 왜 부풀 수 있는지 말한다', /선택일정이나 차수가 섞이면/.test(w));
    ok('⑤ daysVia도 함께 내려온다', o.body.daysVia === 'itinerary', String(o.body.daysVia));
  }

  console.log('\n[4] 정상 문서에는 안 뜬다 (④)');
  {
    const o = await callHandler({});
    const w = texts(o);
    ok('④ 인원 경고가 없다', !/인원이 어긋납니다/.test(w), w.slice(0, 120));
    ok('④ 기간 경고가 없다', !/기간이 어긋납니다/.test(w));
    ok('④ 일정표 경고가 없다', !/일정표를 세어/.test(w));
    ok('④ 원본 신호는 비어 있다', o.body.paxConflict === null && o.body.daysVia === 'header');
  }

  console.log('\n[5] 셋이 함께 걸리면 셋 다 말한다');
  {
    const o = await callHandler({
      paxConflict: { docPax: 8, impliedPax: 12 }, daysVia: 'itinerary',
      dates: { days: 13, nights: 12, departDate: '2025-01-08',
        nightsConflict: { fromDates: 8, labelled: 12, labelledDays: 13 } },
    });
    const w = texts(o);
    ok('셋이 모두 올라온다 (하나만 말하고 끝내지 않는다)',
      /인원이 어긋납니다/.test(w) && /기간이 어긋납니다/.test(w) && /일정표를 세어/.test(w),
      String(((o.body && o.body.warnings) || []).length) + '건');
  }

  console.log('\n[6] 화면이 그 경고를 그리는가');
  {
    /* 경고는 화면의 공통 자리(pr-warnings)로 그려진다 — 그 통로가 살아 있어야
       위의 문구가 실제로 보인다. */
    const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    ok('화면이 warnings를 읽는다', /Array\.isArray\(data\.warnings\)/.test(admin));
    ok('화면이 한 줄씩 ⚠로 그린다', /'⚠ ' \+ t/.test(admin));
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

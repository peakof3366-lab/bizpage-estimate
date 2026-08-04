/* RL 검증: 「PDF에서 추출」이 서버에서 실제로 동작하는가.

   왜 —
   이 기능은 **프로덕션에서 한 번도 동작한 적이 없었다.** 사장님이 하나투어 견적서를
   올리자 "PDF를 읽지 못했습니다(손상되었거나 지원하지 않는 형식)"만 떴다.
   파일은 멀쩡했다 — 로컬에서는 같은 파일이 잘 읽혔다. 실제 함수 로그를 보고서야 알았다:

     Cannot load "@napi-rs/canvas": Error: Cannot find module '@napi-rs/canvas'
     Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
     [quotes extractPdf] pdf-parse 실패: ReferenceError: DOMMatrix is not defined

   pdf-parse 2.x는 pdfjs-dist + `@napi-rs/canvas`(플랫폼별 네이티브 바이너리)를 쓴다.
   그 모듈이 Vercel 번들에 들어가지 않아 **모듈 로드 시점에** 죽었고, try/catch가
   그것을 pdf_parse_failed로 바꿔 "파일이 이상하다"고 말하고 있었다.
   → 사람은 파일을 의심하고, 코드는 환경 문제였다. 가장 오래 끄는 종류의 결함이다.

   이 파일이 막는 것:
   ① **네이티브 의존이 있는 pdf-parse 2.x로 돌아가지 않는다.** 로컬에서는 멀쩡해서
      올려 놓고도 모른다 — 그래서 소스·package.json에 못을 박는다.
   ② **index.js가 아니라 lib을 직접 부른다.** 1.x의 index.js에는 `!module.parent`일 때
      테스트용 PDF를 읽는 디버그 분기가 있어 번들러에 따라 로드 중 ENOENT로 죽는다.
   ③ **실제 한글 PDF에서 텍스트가 나온다.** 라이브러리를 바꿀 때마다 여기서 확인된다.
      (jsdom·목이 아니라 진짜 PDF를 판다 — 이 결함이 딱 그래서 안 잡혔다.)
   ④ 텍스트가 없으면 no_text_found, 못 읽으면 pdf_parse_failed로 **구분해서** 말한다.

   실행: node ai-loop/test_rL_pdf_extract.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const quotesSrc = fs.readFileSync(path.join(ROOT, 'api', 'quotes.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

(async () => {
  /* ── [1] 네이티브 의존이 없는 버전인가 (①) ────────────────────────────── */
  console.log('[1] 네이티브 의존이 없는 pdf-parse를 쓰는가 (①)');
  const range = (pkg.dependencies || {})['pdf-parse'] || '';
  ok('package.json이 pdf-parse를 1.x로 고정한다', /^\^?1\./.test(range), range);
  ok('2.x로 올리지 않았다', !/^\^?2\./.test(range),
    '2.x는 @napi-rs/canvas(네이티브)를 요구해 Vercel에서 DOMMatrix 오류로 죽는다');

  const installed = require(path.join(ROOT, 'node_modules', 'pdf-parse', 'package.json'));
  ok('설치된 것도 1.x다', /^1\./.test(installed.version), installed.version);
  const deps = Object.keys(installed.dependencies || {});
  ok('설치된 pdf-parse에 네이티브 의존이 없다',
    !deps.some((d) => /napi|canvas|sharp/i.test(d)), deps.join(', '));
  /* 번들에 실제로 안 들어오는지 — 있으면 2.x로 되돌아간 것이다 */
  ok('node_modules에 @napi-rs/canvas가 없다',
    !fs.existsSync(path.join(ROOT, 'node_modules', '@napi-rs', 'canvas')));

  /* ── [2] lib을 직접 부르는가 (②) ──────────────────────────────────────── */
  console.log('\n[2] index.js의 디버그 분기를 지나가는가 (②)');
  ok('api/quotes.js가 lib을 직접 require한다',
    /require\('pdf-parse\/lib\/pdf-parse\.js'\)/.test(quotesSrc));
  /* ⚠ 주석을 걷어내고 본다 — 주석에 예시로 적어 둔 문구까지 코드로 세면 늘 실패한다 */
  const quotesCode = quotesSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok("맨 위 index.js를 부르지 않는다",
    !/require\('pdf-parse'\)/.test(quotesCode),
    "index.js는 !module.parent일 때 테스트 PDF를 읽어 ENOENT로 죽을 수 있다");
  ok('2.x 전용 API(PDFParse 클래스)를 쓰지 않는다', !/new PDFParse\(/.test(quotesSrc));
  /* 왜 1.x인지 코드에 남겨 둔다 — 안 적으면 다음 사람이 "낡았네" 하고 올린다 */
  ok('왜 2.x로 올리면 안 되는지 주석이 있다',
    /napi-rs\/canvas/.test(quotesSrc) && /DOMMatrix/.test(quotesSrc));

  /* ── [3] 진짜 PDF에서 한글이 나오는가 (③) ─────────────────────────────── */
  console.log('\n[3] 실제 한글 PDF에서 텍스트가 나오는가 (③)');
  const pdf = require(path.join(ROOT, 'node_modules', 'pdf-parse', 'lib', 'pdf-parse.js'));

  /* ⚠ 픽스처는 **합성 견본**이다. 실제 하나투어 견적서에는 고객 이름·휴대폰·이메일이
     들어 있어 저장소에 둘 수 없다. 견본은 같은 모양(단가 표 + 한글)만 흉내 낸다.
     ai-loop/fixtures/sample_quote_ko.pdf — 브라우저 인쇄로 만든 진짜 PDF다. */
  const fixture = path.join(ROOT, 'ai-loop', 'fixtures', 'sample_quote_ko.pdf');
  ok('테스트용 PDF 견본이 저장소에 있다', fs.existsSync(fixture), fixture);
  /* api/quotes.js와 **같은 방식**으로 넘긴다 — 사본으로 만들어 byteOffset을 0으로 맞춘다.
     (왜 그래야 하는지는 아래 [3-b]에서 일부러 깨뜨려 확인한다.) */
  const r = await pdf(new Uint8Array(fs.readFileSync(fixture)));
  const text = (r.text || '').trim();
  ok('PDF를 읽고 페이지 수를 센다', r.numpages === 1, String(r.numpages));
  ok('텍스트가 나온다', text.length > 50, String(text.length));
  ok('**한글이 깨지지 않는다**', /견적서/.test(text) && /호텔/.test(text),
    JSON.stringify(text.slice(0, 60)));
  ok('단가 숫자가 그대로 살아 있다',
    /320,000/.test(text) && /152,000/.test(text), JSON.stringify(text.slice(0, 120)));
  ok('호텔명 같은 문자열도 나온다', /샘플 호텔|SAMPLE HOTEL/.test(text));

  /* ── [3-b] 풀에서 잘려 나온 버퍼(byteOffset>0)도 읽는가 ────────────────────
     ⚠ 이게 이 파일을 쓰다가 실제로 걸린 결함이다. Node의 Buffer는 공용 풀에서 잘라
     쓰는 경우가 있어 byteOffset이 0이 아닐 수 있는데, pdf.js는 byteOffset을 무시하고
     밑바탕 ArrayBuffer를 0번지부터 읽는다 → 엉뚱한 바이트 → 'bad XRef entry'.
     화면에는 "PDF를 읽지 못했습니다(손상되었거나 지원하지 않는 형식)"가 뜬다.
     **파일은 멀쩡한데 파일을 의심하게 되는** 종류라, 여기서 못을 박는다.
     결함 생성기 ③: 일부러 그 상태를 만들어 잡히는지 확인한다. */
  console.log('\n[3-b] 버퍼가 풀에서 잘려 나와도 읽는가');
  const bytes = fs.readFileSync(fixture);
  const pool = Buffer.allocUnsafe(bytes.length + 720);   /* 앞에 720바이트를 흘려 offset을 만든다 */
  bytes.copy(pool, 720);
  const sliced = pool.subarray(720);                     /* byteOffset > 0 인 뷰 */
  ok('일부러 byteOffset>0인 버퍼를 만들었다', sliced.byteOffset > 0, String(sliced.byteOffset));
  ok('그대로 넘기면 깨진다 (그래서 사본이 필요하다)',
    await failsToParse(pdf, sliced),
    '여기가 통과하면 pdf.js가 고쳐진 것이니 api/quotes.js의 사본 변환을 재검토할 것');
  const r2 = await pdf(new Uint8Array(sliced));
  ok('사본으로 넘기면 정상으로 읽힌다', (r2.text || '').trim().length > 50,
    String((r2.text || '').trim().length));
  /* 서버가 실제로 그 사본 변환을 하고 있는가 */
  ok('api/quotes.js가 사본으로 넘긴다',
    /pdf\(new Uint8Array\(/.test(quotesSrc),
    'Buffer를 그대로 넘기면 큰 PDF에서 간헐적으로 bad XRef entry가 난다');
  ok('왜 사본이어야 하는지 주석이 있다',
    /byteOffset/.test(quotesSrc) && /bad XRef/.test(quotesSrc));

  /* ── [4] 실패를 구분해서 말하는가 (④) ─────────────────────────────────── */
  console.log('\n[4] 실패 사유를 구분해서 말하는가 (④)');
  let threw = false;
  try { await pdf(Buffer.from('이건 PDF가 아니다')); } catch (e) { threw = true; }
  ok('PDF가 아니면 예외를 던진다 (→ pdf_parse_failed)', threw);
  ok('서버가 그 예외를 pdf_parse_failed로 옮긴다',
    /catch[\s\S]{0,200}pdf_parse_failed/.test(quotesSrc));
  ok('텍스트가 비면 no_text_found로 따로 말한다',
    /if \(!text\)[\s\S]{0,60}no_text_found/.test(quotesSrc),
    '둘을 뭉치면 "스캔 PDF"와 "라이브러리 고장"을 구분할 수 없다');
  ok('실패 사유를 서버 로그에 남긴다', /console\.error\('\[quotes extractPdf\]/.test(quotesSrc),
    '이번 원인도 이 로그 한 줄로 찾았다');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* "이 입력은 못 읽는다"를 확인하는 자리. 읽히면 false를 돌려준다. */
async function failsToParse(pdf, input) {
  try {
    const r = await pdf(input);
    return (r.text || '').trim().length === 0;
  } catch (e) {
    return true;
  }
}

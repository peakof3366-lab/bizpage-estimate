/* ═══════════════════════════════════════════════════════════════════════════
   WJ — 하나투어 상품 주소로 상품 칸을 채운다
   ───────────────────────────────────────────────────────────────────────────
   2026-08-25 대표: 「하나투어 답은 없어. 그냥 임의로 우리가 진행하면 될 것 같아.」

   🔴 **문서화된 API가 아니다.** 하나투어 홈페이지가 내부적으로 쓰는 것이라 예고 없이
     바뀐다. 그래서 이 검사가 지키는 것의 절반은 「잘 읽는가」가 아니라
     **「못 읽을 때 조용히 틀린 값을 넣지 않는가」**다. 8/24에 내가 적어 둔 경고가
     그대로 적용된다: 「화면이 바뀌는 날 조용히 틀린 값을 넣기 시작한다.」

   이 검사가 지키는 것:
     ① 읽는 규칙이 **한 곳**에 있다 — CLI와 화면이 같은 파일을 쓴다(결함 생성기 ①)
     ② 응답 모양이 달라지면 **빈 상품이 아니라 실패**를 준다(결함 생성기 ②)
     ③ 일정을 **분류명이 아니라 진짜 이름**으로 읽는다(`cardNm`)
     ④ 화면은 **빈 칸만 채우고 저장하지 않는다** — PDF 경로와 같은 규칙
     ⑤ **로그인한 직원만** 부를 수 있다(공개면 우리 서버가 대신 긁어 주는 통로가 된다)

   ⚠ 네트워크를 **타지 않는다.** 하나투어에 실제로 요청하는 검사는 그쪽이 잠깐 느려도
     빨간 줄이 뜨고, 그러면 사람이 스위트를 안 믿게 된다. 순수 함수(`dayLine`·`pkgCdOf`)와
     소스 규칙만 잰다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const H = require(path.join(ROOT, 'api', '_lib', 'hanatour.js'));
const ADMIN = read('admin.html');
const QUOTES = read('api/quotes.js');
const CLI = read('ai-loop/fetch_hanatour.js');
const LIB = read('api/_lib/hanatour.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 읽는 규칙이 한 곳에 있다 — CLI와 화면이 같은 파일을 쓴다');
{
  ok('① 라이브러리가 있다', typeof H.fetchProduct === 'function' && typeof H.dayLine === 'function');
  ok('① CLI가 그 파일을 부른다', /require\(.*_lib.*hanatour/.test(CLI));
  ok('① 서버도 그 파일을 부른다', /require\('\.\/_lib\/hanatour'\)/.test(QUOTES));
  /* 🔴 CLI가 규칙을 **복사해 두면** 터미널에서 본 값과 화면에 뜬 값이 달라진다 */
  ok('① CLI가 읽는 규칙을 복사해 두지 않았다',
    !/schdMainInfoList|cardNm|getPkgProdInfo/.test(CLI));
  /* 새 파일을 만들지 않았다 — Vercel 함수 12개 제한 */
  ok('① 새 서버리스 파일이 아니라 ?action=이다',
    /action === 'hanatour'/.test(QUOTES) && !fs.existsSync(path.join(ROOT, 'api', 'hanatour.js')));
}

console.log('\n[2] 상품코드 — 아무 문자열이나 실어 보내지 않는다');
{
  ok('② URL에서 pkgCd를 뽑는다',
    H.pkgCdOf('https://www.hanatour.com/trp/pkg/CHPC0PKG0200M200?pkgCd=AAB261261101TWA') === 'AAB261261101TWA');
  ok('② 코드만 줘도 받는다', H.pkgCdOf('AAB261261101TWA') === 'AAB261261101TWA');
  ok('② 모양이 아니면 거절한다',
    H.pkgCdOf('') === null && H.pkgCdOf('짧음') === null
    && H.pkgCdOf('../../etc/passwd') === null && H.pkgCdOf(null) === null);
  ok('② 다른 사이트 주소도 코드가 없으면 거절한다',
    H.pkgCdOf('https://example.com/x?y=1') === null);
}

console.log('\n[3] 🔴 일정을 **분류명이 아니라 진짜 이름**으로 읽는다');
{
  /* 실측 그대로 본뜬 하루. `schdCatgNm`만 읽으면 「관광지 / 관광지 / 관광지」가 된다 */
  const day = {
    schdDay: 1, strtDt: '20261101', strDow: '일',
    schdMainInfoList: [
      { schdCatgNm: '텍스트입력', memoTitlNm: '※ 운항 일정은 유동적입니다' },
      { schdCatgNm: '도시간이동', depCityNm: '인천', arrCityNm: ' ' },
      { schdCatgNm: '식사', mealCont: '기내-불포함(유료제공)' },
      { schdCatgNm: '도시간이동', depCityNm: '방콕', arrCityNm: ' ' },
      { schdCatgNm: '관광지', cardNm: '태국 입국 조건 및 필요 서류' },
      { schdCatgNm: '관광지', cardNm: '태국입국절차' },
      { schdCatgNm: '호텔/크루즈', cardNm: 'ibis Styles Bangkok Silom' },
      { schdCatgNm: '호텔/크루즈', cardNm: 'ibis Styles Bangkok Silom' },
      { schdCatgNm: '호텔/크루즈', cardNm: 'ibis Styles Bangkok Silom' },
    ],
    htlInfoList: [{ htlNm: null }],
  };
  const line = H.dayLine(day);
  ok('③ 관광지를 진짜 이름으로 읽는다', line.includes('태국 입국 조건 및 필요 서류'));
  ok('③ 「관광지」라는 분류명을 그대로 쓰지 않는다', !/관광지/.test(line), line.slice(0, 80));
  ok('③ 도시 이동을 읽는다', line.includes('인천') && line.includes('방콕'));
  ok('③ 식사를 읽는다', line.includes('기내-불포함(유료제공)'));
  ok('③ 안내 문구(텍스트입력)는 뺀다', !line.includes('운항 일정은 유동적'));
  /* 같은 호텔이 3번 온다(실측) — 접는다 */
  ok('③ 같은 호텔을 세 번 적지 않는다',
    (line.match(/ibis Styles Bangkok Silom/g) || []).length === 1);
  ok('③ 숙박으로 표시한다', line.includes('숙박: ibis Styles Bangkok Silom'));

  /* ⚠ 조식·중식·석식으로 **가르지 않는다** — 문서가 그렇게 말해 준 적이 없다 */
  const meals = H.dayLine({ schdMainInfoList: [
    { schdCatgNm: '식사', mealTypeNm: '호텔식' },
    { schdCatgNm: '식사', mealTypeNm: '불포함' },
    { schdCatgNm: '식사', mealTypeNm: '불포함' },
  ] });
  ok('③ 끼니를 조/중/석으로 짐작하지 않는다',
    meals.includes('호텔식') && !/조식|중식|석식/.test(meals), meals);

  /* 빈 하루는 빈 줄을 준다 — 「일정 1일치」로 세어지면 안 된다 */
  ok('③ 읽을 게 없으면 빈 줄이다', H.dayLine({ schdMainInfoList: [] }) === '');
}

console.log('\n[4] 🔴 못 읽을 때 **빈 상품이 아니라 실패**를 준다');
{
  /* 라이브러리: 코드가 안 읽히면 ok:false + 사람이 읽을 이유 */
  return_check();
  async function return_check() { /* 아래 [4-b]에서 비동기로 잰다 */ }

  /* 서버: 예외를 빈 상품으로 바꾸지 않는다 */
  ok('④ 서버가 실패를 502/422로 말한다',
    /status\(502\)\.json\(\{ error: 'fetch_failed'/.test(QUOTES)
    && /status\(422\)\.json\(\{ error: 'not_readable', why: r\.why \}\)/.test(QUOTES));
  ok('④ 빈 상품을 돌려주지 않는다', !/row: \{\}/.test(QUOTES));
  /* 라이브러리: 못 읽은 칸을 세어서 넘긴다 */
  ok('④ 못 읽은 칸을 missing으로 넘긴다', /missing\.push\('금액'\)/.test(LIB) && /missing\.push\('일정'\)/.test(LIB));
  /* 🔴 **못 읽은 것**·**앞뒤가 안 맞는 것**·**안 오는 것**을 갈라서 말한다.
     ⚠ WL(2026-08-26)에서 자리가 바뀌었다 — 포함/불포함은 「안 오는 것」이 아니라
       **오는데 우리가 안 읽고 있던 것**이었다(WJ의 결론이 틀렸다). 그래서 이 검사도
       「그 문구가 있는가」가 아니라 **갈래가 셋 다 살아 있는가**를 잰다. */
  ok('④ 「애초에 안 오는 것」 자리를 남겨 둔다',
    /notProvided/.test(LIB) && /notProvided: \[\]/.test(QUOTES) === false && /notProvided: r\.notProvided/.test(QUOTES));
  ok('④ 「읽었는데 앞뒤가 안 맞는 것」을 따로 넘긴다',
    /const warnings = \[\]/.test(LIB) && /warnings: r\.warnings/.test(QUOTES));
  /* 포함사항을 **일정에서 지어내지 않는다** — 하나투어가 준 목록에서만 온다(WL) */
  ok('④ 포함/불포함을 지어내지 않는다 (준 목록에서만 온다)',
    /expenseLines\(P\.trvlExpnInclList/.test(LIB)
    && /expenseLines\(P\.trvlExpnNoneInclList/.test(LIB)
    && !/included[\s\S]{0,80}itinerary\.map/.test(LIB));
  /* 금액이 0이거나 없으면 비운다 — 다른 칸에서 끌어오지 않는다 */
  ok('④ 금액이 없으면 비운다', /Number\(P\.adtTotlAmt\) > 0 \? Number\(P\.adtTotlAmt\) : null/.test(LIB));
}

console.log('\n[5] 화면 — 빈 칸만 채우고 **저장하지 않는다**(PDF 경로와 같은 규칙)');
{
  ok('⑤ 주소 칸과 버튼이 있다', /id="pkgHtUrl"/.test(ADMIN) && /id="pkgHtRead"/.test(ADMIN));
  ok('⑤ 버튼이 배선돼 있다', /getElementById\('pkgHtRead'\)\?\.addEventListener\('click', pkgReadHanatour\)/.test(ADMIN));
  /* 🔴 이미 적힌 칸은 안 덮는다 — 담당자가 손본 값이 조용히 사라지면 안 된다 */
  ok('⑤ 이미 적힌 칸은 그대로 둔다',
    /if \(String\(el\.value\)\.trim\(\)\) \{ kept\.push\(label\); return; \}/.test(ADMIN));
  ok('⑤ 무엇을 채우고 무엇을 뒀는지 말한다',
    /채웠습니다: /.test(ADMIN) && /이미 적혀 있어 그대로 둔 칸: /.test(ADMIN));
  ok('⑤ 저장하지 않는다고 말한다', /저장은 하지 않았습니다/.test(ADMIN));
  /* 🔴 **금액 확인일을 「오늘」로 채우지 않는다**(VP에서 세운 원칙).
     ⚠ WL부터는 그 칸을 채우기는 한다 — 다만 **오늘이 아니라 하나투어가 이 상품을
       마지막으로 고친 날**(`updDttm`)이다. 그건 「공급사가 확인해 준 날」이라 이 칸의
       뜻에 맞는다. 우리가 읽은 날을 넣는 순간 이 칸은 아무 뜻도 없어진다. */
  ok('⑤ 금액 확인일을 오늘 날짜로 채우지 않는다',
    !/put\('pkgAsOf',\s*(new Date|today)/.test(ADMIN)
    && /put\('pkgAsOf', row\.priceAsOf/.test(ADMIN)
    && /priceAsOf: ymdOfDttm\(P\.updDttm\)/.test(LIB));
  /* 못 읽은 칸을 화면이 그대로 전한다 */
  ok('⑤ 못 읽은 칸을 화면이 말한다', /🔴 못 읽은 칸: /.test(ADMIN));
  /* WL — 포함/불포함이 오게 됐으니 화면 안내도 그에 맞게 바뀌었다.
     ⚠ 화면과 실제가 다른 말을 하면 담당자는 **화면을 믿는다.** 그래서 여기서 잠근다. */
  ok('⑤ 읽어 온 글을 다듬으라고 말한다', /읽어 온 글은 하나투어 상품 기준/.test(ADMIN));
}

console.log('\n[6] 🔴 로그인한 직원만 — 공개면 우리 서버가 남의 사이트를 대신 긁어 준다');
{
  const h = QUOTES.slice(QUOTES.indexOf('async function handleHanatour'));
  ok('⑥ requireAdmin이 맨 앞에 있다',
    /^async function handleHanatour\(req, res\) \{\s*\n\s*if \(!\(await requireAdmin\(req, res\)\)\) return;/.test(h));
  ok('⑥ 본문 크기를 막는다', /payloadTooLarge\(body\)/.test(h));
  ok('⑥ 주소 길이를 막는다', /input\.length > 500/.test(h));
  /* 목록을 훑는 기능을 만들지 않았다 — 한 번에 한 건 */
  ok('⑥ 목록을 훑는 길을 만들지 않았다',
    !/sitemap/i.test(LIB) && !/for \(const cd of/.test(LIB));
}

/* [4-b] 라이브러리가 잘못된 입력에 **실패를 준다** — 네트워크를 안 탄다 */
(async () => {
  console.log('\n[4-b] 잘못된 입력은 네트워크를 타기 전에 실패한다');
  const r = await H.fetchProduct('짧음');
  ok('④b ok:false를 준다', r && r.ok === false);
  ok('④b 사람이 읽을 이유를 함께 준다', !!(r && r.why && r.why.includes('상품코드')));
  ok('④b 빈 row를 주지 않는다', !(r && r.row));

  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WJ 하나투어 상품 불러오기`);
  process.exit(fail ? 1 : 0);
})();

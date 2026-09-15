/* ═══════════════════════════════════════════════════════════════════════════
   견적서 링크 — 새 규격(v2) 문서와 **일정표 탭**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 결정: 「견적서 이외에 일정표가 마찬가지로 생성되어야 한다」
   + 일정표는 **같은 링크의 다른 탭**으로 낸다.

   ■ 이 검사가 지키는 것
   ① 🔴 **원가·마진이 고객 링크로 나가지 않는다.**
      `quote_shares.payload`는 **인증이 없다** — 링크를 아는 사람은 누구나 읽는다.
      그래서 지우는 일을 **서버가** 한다(화면이 이미 지워 보내지만 그건 방어선이 아니다).
      이 검사는 「지웠나」가 아니라 **「서버 코드가 지우고 있나」**를 본다.
   ② **옛 링크(v1)가 그대로 돈다.** 이미 고객 손에 나간 링크가 있다 — v2를 넣으면서
      옛 경로를 건드리면 그 손님들이 견적서를 못 연다.
   ③ **탭이 둘이고, 인쇄는 보고 있는 것만 나간다.** 대표가 「각각」이라고 정했다.
   ④ **엑셀 버튼이 v2에서는 안 보인다.** 그 함수는 v1의 `rows`를 읽어 빈 파일을 만든다.
      🔴 `hidden` 속성만으로는 안 감춰졌다 — `.btn-print`의 `display`가 이긴다.
        브라우저로 재고 알았고, CSS로 못 박았다.
   ⑤ **견적서를 여기서 다시 그리지 않는다.** 그리는 곳은 `quote_doc.js` 하나다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const QD = require(path.join(ROOT, 'quote_doc.js'));

let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const VIEW = read('estimate-view.html');
const SHARE = read(path.join('api', 'quote-shares.js'));
const IGNORE = read('.vercelignore');

/* ═══ ① 🔴 서버가 지운다 ═══ */
ok('[1] 발급 코드가 quote_doc.js를 불러온다', /require\('\.\.\/quote_doc\.js'\)/.test(SHARE));
ok('[1-b] 지우는 규칙을 다시 적지 않았다 (한 곳이 진실)',
  !/charAt\(0\)\s*===\s*['"]_['"]/.test(SHARE) && !/startsWith\('_'\)/.test(SHARE));
ok('[1-c] 발급 payload에 stripInternal을 통과한 문서만 싣는다',
  /docForShare = QDOC\.stripInternal\(quote\.doc\)/.test(SHARE));
/* 받은 것을 그대로 싣지 않는다 — 이게 진짜 방어선이다 */
ok('[1-d] 🔴 body의 doc을 그대로 싣지 않는다',
  !/doc:\s*(body|share)\.doc/.test(SHARE) && /\.\.\.\(docForShare \? \{ doc: docForShare \} : \{\}\)/.test(SHARE));
/* 지웠는데 남으면 발급을 멈춘다 — 조용히 통과시키지 않는다 */
ok('[1-e] 내부 필드가 남으면 발급을 멈춘다',
  /findInternalKeys\(docForShare\)/.test(SHARE) && /internal_field_leak/.test(SHARE));

/* 실제로 지워지는가 — 함수를 직접 돌려 본다 */
const dirty = {
  meta: { client: '굿리치' },
  price: { lines: [{ label: '성인', unit: 1000000, qty: 10 }] },
  details: [{ label: '항공', rows: [{ text: 'RS0527', _cost: 999, note: 'LCC' }] }],
  itinerary: [{ day: 1, title: 'A', _memo: '내부' }],
  _internal: { cost: 30000000, margin: 12575850, memo: '마진 27.5%',
    adjust: [{ key: 'foc', amount: -1524625 }] },
};
const clean = QD.stripInternal(dirty);
ok('[1-f] 내부 필드가 전부 지워진다', QD.findInternalKeys(clean).length === 0,
  QD.findInternalKeys(clean).join(', '));
const cleanStr = JSON.stringify(clean);
[['마진', '12575850'], ['원가', '30000000'], ['내부 메모', '마진 27.5%'],
  ['행 원가', '999'], ['일정 내부 메모', '내부'], ['조정액', '-1524625']].forEach(([what, v]) => {
  ok('[1-g] 공개본에 ' + what + '이(가) 없다', cleanStr.indexOf(v) < 0);
});
ok('[1-h] 고객이 봐야 할 것은 남는다',
  cleanStr.indexOf('굿리치') >= 0 && cleanStr.indexOf('RS0527') >= 0 && cleanStr.indexOf('LCC') >= 0);

/* ═══ ② 옛 링크(v1)가 그대로 돈다 ═══ */
ok('[2] v2는 doc 하나로 갈린다', /if \(d\.doc && typeof QuoteDoc !== 'undefined'\)/.test(VIEW));
ok('[2-b] v1 렌더가 살아 있다', /document\.getElementById\('main-content'\)\.innerHTML = `/.test(VIEW));
/* 위조 경로를 되살리지 않았다 (CLAUDE.md) */
ok('[2-c] decodeShareData를 되살리지 않았다', !/function decodeShareData/.test(VIEW));
/* v1 화면이 읽는 평면 키를 새 규격이 밀어내지 않았다 — 대장이 그 키로 검색한다 */
["payload->>'dt'", "payload->>'org'", "payload->>'t'", "payload->>'pp'"].forEach((k) => {
  ok('[2-d] 대장이 읽는 ' + k + ' 가 그대로다', SHARE.indexOf(k) >= 0);
});

/* ═══ ③ 탭 둘 · 인쇄는 보고 있는 것만 ═══ */
ok('[3] 견적서·일정표 탭을 만든다',
  /id="qdvTabQuote"/.test(VIEW) && /id="qdvTabIti"/.test(VIEW));
ok('[3-b] 고르는 버튼이라 aria-selected로 표시한다',
  /role="tab" aria-selected/.test(VIEW));
ok('[3-c] 일정이 없으면 일정표 탭을 안 만든다', /\$\{hasIti \?/.test(VIEW));
ok('[3-d] 일정이 없으면 그 사실과 다음 행동을 말한다',
  /일정표는 아직 준비 중입니다[\s\S]{0,40}담당자에게 문의/.test(VIEW));
ok('[3-e] 🔴 인쇄는 보고 있는 탭만 나간다',
  /@media print[\s\S]{0,400}\.qdv-panel\[hidden\] \{ display: none !important; \}/.test(VIEW));
ok('[3-f] 탭 줄은 인쇄에 안 나간다', /class="qdv-tabs no-print"/.test(VIEW));
ok('[3-g] 누를 것이 44px 이상', /\.qdv-tab \{[^}]*min-height:\s*4[6-9]px|\.qdv-tab \{[^}]*min-height:\s*[5-9]\dpx/.test(VIEW));

/* ═══ ④ 엑셀 버튼 — v2에서는 안 보인다 ═══ */
ok('[4] v2면 엑셀 버튼을 내린다', /if \(r\.data && r\.data\.doc\)[\s\S]{0,200}downloadExcelBtn[\s\S]{0,60}hidden = true/.test(VIEW));
ok('[4-b] 🔴 hidden을 CSS로 못 박았다 (display 규칙이 이긴다)',
  /\.top-bar-btns \[hidden\] \{ display: none !important; \}/.test(VIEW));
ok('[4-c] 인쇄 버튼은 그대로 둔다 (v2도 인쇄는 된다)',
  !/btn-print[^\n]*hidden = true/.test(VIEW));

/* ═══ ⑤ 여기서 견적서를 다시 그리지 않는다 ═══ */
ok('[5] 공통 모듈을 싣는다', /<script src="quote_doc\.js">/.test(VIEW) && /quote_doc\.css/.test(VIEW));
ok('[5-b] 그리는 일은 모듈이 한다',
  /QuoteDoc\.renderQuote\(doc/.test(VIEW) && /QuoteDoc\.renderItinerary\(doc/.test(VIEW));
/* v2 분기 안에서 표를 직접 짓지 않는다 */
const i0 = VIEW.indexOf('function renderDocPage');
const i1 = VIEW.indexOf('function renderPage(d)');
const docFn = VIEW.slice(i0, i1);
ok('[5-c] v2 분기가 표를 직접 짓지 않는다', docFn.indexOf('<table') < 0 && docFn.indexOf('<thead') < 0);
ok('[5-d] 🔴 normalize를 먼저 하고 지운다 (제목·합계가 거기서 만들어진다)',
  /stripInternal\(QuoteDoc\.normalize\(d\.doc\)\)/.test(VIEW));
/* 히어로가 v2에 없는 칸을 읽어 undefined를 찍지 않는다 */
ok('[5-e] v2 히어로가 undefined를 안 찍는다',
  /function heroSub\(\)[\s\S]{0,400}d\.doc && typeof QuoteDoc/.test(VIEW));

/* ═══ ⑥ 배포에서 빠지지 않는다 ═══
   🔴 `quote_doc.js`가 배포에서 빠지면 **서버에서 원가를 지우는 코드가 사라진다.** */
['quote_doc.js', 'quote_doc.css', 'quote_engine_host.js', 'admin-quote-pro.html'].forEach((f) => {
  ok('[6] ' + f + ' 가 저장소에 있다', fs.existsSync(path.join(ROOT, f)));
});
ok('[6-b] .vercelignore가 공통 모듈을 「필요」로 적어 두었다',
  /quote_doc\.js·quote_doc\.css/.test(IGNORE));
/* 확장자 규칙에 걸려 조용히 빠지지 않는가 — `*.md`처럼 넓은 규칙이 있다 */
const rules = IGNORE.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
ok('[6-c] .js를 통째로 빼는 규칙이 없다', !rules.some((r) => r === '*.js' || r === '/*.js'),
  rules.join(' '));

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' 견적서 링크 — 새 규격(v2) 문서 · 일정표 탭');
console.log('══════════════════════════════════════════════════════════════════');
fails.forEach((f) => console.log(' ✗ ' + f));
if (!fails.length) console.log(' ✓ 전부 통과');
console.log(`결과: ${pass} pass / ${fails.length} fail`);
process.exit(fails.length ? 1 : 0);

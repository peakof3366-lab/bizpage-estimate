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
/* 🔴 **서버가 하는 일은 이제 두 파일에 걸쳐 있다.** 문서를 만들고·깎고·검문하는
   순서는 `api/_lib/share_doc.js`에 있고, 발급 엔드포인트는 그것을 부른다.
   뗀 이유: 그 순서가 서버 함수 안에만 있어서 **서버를 안 타는 검사**(브라우저 픽스처)가
   v2 견적서를 한 번도 못 보고 있었다.
   ⚠ 그래서 여기도 **두 파일을 같이** 읽는다. 한쪽만 읽으면 규칙이 옮겨간 날
     조용히 빨개지거나(규칙은 사는데 빨강) 조용히 통과한다(규칙이 죽었는데 초록). */
const SHARE_API = read(path.join('api', 'quote-shares.js'));
const SHARE_LIB = read(path.join('api', '_lib', 'share_doc.js'));
const SHARE = SHARE_API + '\n' + SHARE_LIB;
const IGNORE = read('.vercelignore');

/* ═══ ① 🔴 서버가 지운다 ═══ */
ok('[1] 발급 코드가 quote_doc.js를 불러온다', /require\('\.\.\/quote_doc\.js'\)/.test(SHARE));
ok('[1-b] 지우는 규칙을 다시 적지 않았다 (한 곳이 진실)',
  !/charAt\(0\)\s*===\s*['"]_['"]/.test(SHARE) && !/startsWith\('_'\)/.test(SHARE));
/* 🔴 **떼어 낸 모듈을 실제로 부르는가.** 이 줄이 없으면 위 합쳐 읽기가 「아무도 안 부르는
   규칙」을 있다고 말하게 된다 — 파일만 남고 발급은 그냥 지나가는 상태가 제일 나쁘다. */
ok('[1-b2] 🔴 발급이 그 모듈을 실제로 부른다',
  /SHAREDOC\.buildShareDoc\(share, \{ doc: quote && quote\.doc, parts \}\)/.test(SHARE_API));
ok('[1-c] 발급 payload에 stripInternal을 통과한 문서만 싣는다',
  /docForShare = QDOC\.stripInternal\(given\)/.test(SHARE));
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
/* 🔴 **2026-09-21 대표 지시로 탭 → 롤링 한 페이지가 됐다.**
   「견적서 세부견적서 일정표를 하나의 롤링페이지로 볼 수 있게 구성」.
   예전에는 탭이라 **고객이 일정표 탭을 안 누르면 못 봤다.** 이제 쌓아 둔다.
   ⚠ 아래 [3-h]가 핵심이다 — **감추는 것이 아니라 처음부터 안 싣는다.**
     공유 링크는 인증이 없어서, 보내 놓고 감추면 소스 보기로 다 보인다. */
ok('[3] 세 구역을 한 페이지에 쌓는다',
  /id="qdvQuote"/.test(VIEW) && /id="qdvBd"/.test(VIEW) && /id="qdvIti"/.test(VIEW));
ok('[3-b] 탭이 아니라 바로가기(앵커)다',
  /class="qdv-jump no-print"/.test(VIEW) && /qdv-jump-a" href="#/.test(VIEW)
  && !/id="qdvTabQuote"/.test(VIEW));
ok('[3-c] 일정이 없으면 그 구역을 안 만든다', /\$\{hasIti \?/.test(VIEW));
ok('[3-c2] 세부견적서도 없으면 안 만든다', /\$\{hasBd \?/.test(VIEW));
ok('[3-d] 일정이 없으면 그 사실과 다음 행동을 말한다',
  /일정표는 아직 준비 중입니다[\s\S]{0,40}담당자에게 문의/.test(VIEW));
ok('[3-e] 🔴 인쇄하면 실려 온 것이 다 나간다 (문서마다 새 장)',
  /@media print[\s\S]{0,900}\.qdv-panel \+ \.qdv-panel \{ break-before: page/.test(VIEW));
ok('[3-e2] 그래도 감춘 것은 인쇄가 되살리지 않는다',
  /\.qdv-panel\[hidden\] \{ display: none !important; \}/.test(VIEW));
ok('[3-f] 바로가기 줄은 인쇄에 안 나간다', /class="qdv-jump no-print"/.test(VIEW));
ok('[3-g] 누를 것이 충분히 크다', /\.qdv-jump-a \{[\s\S]{0,160}padding: 7px 15px/.test(VIEW));
/* 🔴 구역이 하나뿐이면 목차를 안 그린다 — 누를 곳이 하나인 목차는 잡음이다 */
ok('[3-g2] 구역이 하나면 바로가기를 안 그린다', /jumps\.length > 1 \?/.test(VIEW));
/* 🔴🔴 **이 검사가 이 기능의 방어선이다** — 화면이 감추는 것이 아니라 payload에 없다 */
ok('[3-h] 🔴 세부견적서는 「있으면 그린다」 — 감추는 코드가 없다',
  /renderBreakdown/.test(VIEW) && !/qdvBd[\s\S]{0,120}hidden = /.test(VIEW));

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

/* ═══ ⑦ 「정돈」(2026-09-17 대표 승인 A안)이 되돌아가지 않는가 ═══════════════
   취향이 아니라 **재서 고친 것들**이라 자를 남긴다. 되돌리면 여기서 걸린다. */
{
  const CSS = read('quote_doc.css');
  const JS = read('quote_doc.js');
  /* 🔴 이 한 줄이 가장 비싸다 — ₩가 청록 배경 전제로 흰색이면, 배경이 흰색이 되는 순간
     기호가 **사라진다**(시안을 그려 보고 찾았다). 배경색 전제를 다시 넣지 않는다. */
  ok('[7] ₩ 기호에 배경 전제(흰색)가 없다',
    !/\.qd-opt\s+\.qd-w\s*\{[^}]*#FFF|\.qd-opt\s+\.qd-w\s*\{[^}]*255,\s*255,\s*255/i.test(CSS),
    '선택 옵션 배경이 바뀌면 ₩가 안 보인다');
  /* ⚠ 2026-09-17 오후: BI 가이드가 오면서 주색이 **레드 → 보라**로 바뀜다.
     지키는 것은 같다 — 문서의 주색이 **홈페이지와 같은 브랜드 색**이어야 한다. */
  ok('[7-b] 문서의 주색이 BI 브랜드 색이다', /--qd-red:\s*#514dc2/i.test(CSS),
    '브랜드 색이 아니면 우리 문서로 안 보인다');
  /* 고치기 전엔 불포함내역(굵은 빨강)이 문서에서 가장 강했다 */
  ok('[7-c] 불포함내역이 굵은 빨강으로 돌아가지 않았다',
    /\.qd-red\s*\{[^}]*color:\s*var\(--qd-ink\)/.test(CSS));
  ok('[7-d] 합계 금액이 문서에서 가장 큰 숫자다', /\.qd-sum\s+\.qd-num\s*\{[^}]*font-size:\s*17px/.test(CSS));
  /* 한글 금액이 세 줄로 접히던 자리 — 칸을 두 칸으로 넓혔다 */
  ok('[7-e] 한글 금액 칸이 두 칸 폭이다', /class="qd-mid qd-bold qd-han" colspan="2"/.test(JS));
  /* 🔴 일정표: 끼니를 한 줄로 이어 붙이면 아무 데서나 접혀 라벨과 값이 갈린다 */
  ok('[7-f] 식사가 끼니마다 한 줄이다', /qd-meal/.test(JS) && /function\s*\(|=>/.test(JS));
  ok('[7-g] 그 줄이 라벨·값으로 잠겨 있다', /\.qd-meal\s*\{[^}]*display:\s*flex/.test(CSS));
}

/* ═══ ⑧ 🔴 문서 셋이 **갈라져 보이는가** (2026-09-22 대표 지시) ═══════════════
   「견적서 세부견적서 일정표가 각각 제대로 분리가 되어 보이면 좋겠다 — 지금은
   다닥다닥 붙어 있는 느낌이라서.」

   롤링으로 바꾸면서 탭이 사라졌고, **탭이 하던 「경계」 일까지 같이 사라졌다.**
   세 문서가 테두리만 맞닿은 채 이어져, 고객은 한 장짜리 긴 문서로 읽는다 —
   그러면 **세부견적서를 받았다는 사실 자체를 모른다.**

   🔴 **글자로만 재면 이 자리를 못 잡는다.** CSS 규칙이 파일에 있는지 보는 것과,
     화면에 띠가 실제로 그려지는지는 다른 이야기다(9/21에 「만들어 놓고 안 그리고
     있었다」로 한 번 당했다). 그래서 **페이지를 띄워 센다.**
   ═══════════════════════════════════════════════════════════════════════════ */
ok('[8] 문서 사이가 벌어져 있다 (바탕색이 드러난다)',
  /\.qdv-panel \+ \.qdv-panel \{ margin-top: \d+px; \}/.test(VIEW));
ok('[8-b] 종이처럼 그림자가 있다', /\.qdv-panel \{ box-shadow:/.test(VIEW));
/* 🔴 상단 바가 sticky라 앵커로 뛴 자리가 바 뒤로 들어갔다 — 바 높이보다 커야 한다 */
ok('[8-c] 🔴 바로가기로 뛴 자리가 상단 바에 안 가린다',
  (() => {
    const m = VIEW.match(/\.qdv-panel \{ scroll-margin-top: (\d+)px; \}/);
    return !!m && Number(m[1]) >= 60;
  })(), '상단 바(sticky) 높이보다 작으면 문서 머리가 가려진다');
/* 머리 띠는 **화면용**이다 — 인쇄는 문서마다 새 장이라 경계가 이미 분명하고,
   결재에 올라가는 종이에 「문서 2 / 3」이 찍히면 안 된다. */
ok('[8-d] 머리 띠는 인쇄에 안 나간다', /class="qdv-tag no-print"/.test(VIEW));
/* 🔴 이름·순서·장수를 두 벌로 적지 않는다 — 바로가기와 띠가 어긋나는 날이 온다 */
ok('[8-e] 🔴 띠가 바로가기 목록에서 이름을 끌어온다',
  /jumps\.findIndex/.test(VIEW) && /\$\{jumps\[i\]\[1\]\}/.test(VIEW));

/* ═══ ⑨ 🔴 **A4 한 장** (2026-09-22 대표 지시) ═══════════════════════════════
   「3가지 장표가 각각 내용이 부족하더라도 하나로 A4 사이즈로 노출되게」

   ■ 이 검사가 지키는 것
   ① 종이 규격이 **CSS 한 곳**에 있고, 짧은 문서도 A4 한 장을 채운다.
   ② 🔴 **줄이는 방식이 `zoom`이다.** `transform: scale()`은 보이는 크기만 줄이고
      크롬의 쪽 나눔은 줄이기 전 상자로 계산한다 — **화면은 한 장, 인쇄는 두 장**이
      되는 자리다(2026-09-22 실측). 되돌아가면 여기서 걸린다.
   ③ 🔴 **폰에는 안 씌운다**(대표 결정). 견적서 링크는 카톡으로 가고, 거기서 A4를
      통째로 축소하면 글자가 절반이 된다.
   ④ 🔴 **바닥 아래로는 안 줄인다.** 안 읽히는 문서를 조용히 내보내지 않고,
      `data-qd-overflow`로 스스로 말한다(결함 생성기 ②).
   ═══════════════════════════════════════════════════════════════════════════ */
{
  const CSS = read('quote_doc.css');
  ok('[9] 종이 규격이 A4다', /--qd-page-w:\s*210mm/.test(CSS) && /--qd-page-h:\s*297mm/.test(CSS));
  /* 🔴 297mm를 그대로 쓰면 반올림으로 0.5px 넘쳐 **빈 둘째 장**이 따라 나온다 */
  ok('[9-b] 🔴 반올림을 흡수하는 자리가 있다', /--qd-page-h-fit:\s*calc\(297mm - 1mm\)/.test(CSS));
  ok('[9-c] 인쇄 종이도 A4이고 여백은 문서가 갖는다',
    /@page \{ size: A4; margin: 0; \}/.test(CSS) && /padding: var\(--qd-page-pad\)/.test(CSS));
  /* 🔴 화면과 인쇄가 **같은 자**를 써야 화면에서 잰 배율이 인쇄에서 맞는다.
     ⚠ **주석을 먼저 걷는다.** 이 파일 머리말에 「`@media print`가 장식이 아니라…」라는
       설명이 있어서, 안 걷으면 자가 **주석에서 시작해** 엉뚱한 규칙을 읽는다
       (2026-09-22에 실제로 걸렸다 — CLAUDE.md의 「재는 자부터 의심한다」). */
  const CSSN = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const printCss = (CSSN.match(/@media print\s*\{[\s\S]*\}/) || [''])[0];
  ok('[9-d0] 인쇄 규칙을 찾았다', printCss.length > 60, String(printCss.length));
  ok('[9-d] 🔴 인쇄에서 글자 크기를 따로 줄이지 않는다',
    !/\.qd \{[^}]*font-size:/.test(printCss),
    (printCss.match(/\.qd \{[^}]*\}/) || [''])[0].slice(0, 90));
  ok('[9-e] 🔴 폰에는 A4 틀을 안 씌운다 (카톡으로 열린다)',
    /@media screen and \(min-width: 880px\)[\s\S]{0,200}--qd-sheet: 1/.test(CSS)
    && /\.qd \{[\s\S]{0,400}--qd-sheet: 0/.test(CSS));
  const JS = read('quote_doc.js');
  ok('[9-f] 🔴 줄이는 방식이 zoom이다 (transform은 쪽 나눔에 안 먹는다)',
    /inner\.style\.zoom = String\(k\)/.test(JS) && !/inner\.style\.transform = 'scale/.test(JS));
  ok('[9-g] 🔴 줄인 뒤 다시 잰다 (글이 다시 접혀 비례로 안 줄어든다)',
    /for \(let i = 0; i < 5; i \+= 1\)[\s\S]{0,260}need = measure\(\)/.test(JS));
  ok('[9-h] 🔴 바닥에 걸리면 스스로 말한다', /data-qd-overflow/.test(JS));
  ok('[9-i] 판단하는 곳은 CSS 한 곳이다 (--qd-sheet)',
    /getPropertyValue\('--qd-sheet'\)/.test(JS));
}

(async () => {
  const { bootPage } = require('./_page_boot');
  /* 실제로 올 법한 모양 하나 — 금액은 이 검사의 관심이 아니라 딱 떨어지는 값으로 둔다 */
  const base = QD.blank();
  base.meta.client = '굿리치'; base.meta.quoteNo = 'BZ-검사-1';
  base.trip.orgName = '굿리치 연수단'; base.trip.region = '다낭';
  base.trip.days = 2; base.trip.nights = 1; base.trip.pax = 10;
  base.price.lines = [{ kind: 'adult', label: '성인', unit: 1000000, qty: 10 }];
  base.breakdown = { rows: QD.allocateBreakdown(
    [{ name: '항공', qty: 10, amount: 6000000 }, { name: '호텔', qty: 10, amount: 4000000 }], 10000000) };
  base.itinerary = [
    { day: 1, title: '인천 → 다낭', am: '출국', pm: '시내', meals: { b: '', l: '기내식', d: '현지식' }, stay: '다낭 호텔' },
    { day: 2, title: '다낭 → 인천', am: '자유', pm: '귀국', meals: { b: '호텔식', l: '현지식', d: '' }, stay: '' },
  ];
  const doc = QD.normalize(base);

  /* 담당자가 고르는 조합 그대로 — 셋 다 / 견적서만. 기대 장수를 **조합에서** 만든다. */
  const CASES = [
    { parts: { breakdown: true, iti: true }, want: ['견적서', '세부견적서', '일정표'] },
    { parts: { breakdown: true, iti: false }, want: ['견적서', '세부견적서'] },
    { parts: { breakdown: false, iti: false }, want: ['견적서'] },
  ];
  for (const c of CASES) {
    const safe = QD.applyParts(QD.stripInternal(doc), c.parts);
    const payload = { v: 1, dk: '다낭', dt: '다낭', org: '굿리치 연수단', n: 10, d: 2, ng: 1,
      t: 10000000, pp: 1000000, sd: '2026-11-10', iso: '2026-09-22', qno: 'BZ-검사-1', id: 'x', doc: safe };
    const B = bootPage('estimate-view.html', {
      query: '?preview=1',
      beforeBoot(w) { w.sessionStorage.setItem('bizpage_preview_share', JSON.stringify(payload)); },
    });
    await B.ready; await B.tick(200);
    const D = B.doc;
    const nm = c.want.join('+');
    ok('[8-f ' + nm + '] 구역 수가 고른 것과 같다',
      D.querySelectorAll('.qdv-panel').length === c.want.length,
      '실제 ' + D.querySelectorAll('.qdv-panel').length);
    const tags = Array.from(D.querySelectorAll('.qdv-tag')).map((e) => e.textContent.replace(/\s+/g, ' ').trim());
    if (c.want.length < 2) {
      /* 🔴 하나뿐일 때 「문서 1 / 1」은 잡음이다 — 바로가기를 안 그리는 조건과 같아야 한다 */
      ok('[8-g] 문서가 하나면 머리 띠를 안 붙인다', tags.length === 0, tags.join(' | '));
      ok('[8-g2] 그때는 바로가기도 없다', !D.querySelector('.qdv-jump'));
    } else {
      const want = c.want.map((t, i) => '문서 ' + (i + 1) + ' / ' + c.want.length + t);
      ok('[8-h ' + nm + '] 🔴 문서마다 이름과 몇 번째인지가 그려진다',
        tags.length === c.want.length && tags.every((t, i) => t === want[i]),
        '실제 [' + tags.join(' | ') + ']');
      /* 띠가 **그 문서 안에** 있어야 한다 — 밖에 있으면 스크롤할 때 짝이 어긋난다 */
      ok('[8-i ' + nm + '] 띠가 그 문서 구역 안에 있다',
        Array.from(D.querySelectorAll('.qdv-tag')).every((e) => e.parentElement
          && e.parentElement.classList.contains('qdv-panel')));
      /* 바로가기와 띠가 **같은 이름·같은 순서**인가 (두 벌이 어긋나는 것을 직접 본다) */
      const jumpTexts = Array.from(D.querySelectorAll('.qdv-jump-a')).map((a) => a.textContent.trim());
      ok('[8-j ' + nm + '] 🔴 바로가기와 띠가 같은 이름·같은 순서다',
        JSON.stringify(jumpTexts) === JSON.stringify(c.want),
        '바로가기 [' + jumpTexts.join(' | ') + ']');
    }
    ok('[8-k ' + nm + '] 콘솔 오류 없이 그려졌다', B.log.errors.length === 0,
      B.log.errors.map((e) => e.msg).join(' | '));
  }

  const mk = (days) => {
    const d = QD.blank();
    d.meta.client = '굿리치'; d.meta.quoteNo = 'BZ-검사-2'; d.meta.validUntil = '2099-01-01';
    d.trip.orgName = '굿리치 연수단'; d.trip.region = '다낭';
    d.trip.days = days; d.trip.nights = days - 1; d.trip.pax = 10;
    d.price.lines = [{ kind: 'adult', label: '성인', unit: 1000000, qty: 10 }];
    d.breakdown = { rows: QD.allocateBreakdown(
      [{ name: '항공', qty: 10, amount: 6000000 }, { name: '호텔', qty: 10, amount: 4000000 }], 10000000) };
    d.itinerary = Array.from({ length: days }, (_, i) => ({
      day: i + 1, title: '다낭 일정 ' + (i + 1), am: '오전 일정', pm: '오후 일정',
      meals: { b: '호텔식', l: '현지식', d: '현지식' }, stay: '다낭 호텔' }));
    return QD.normalize(d);
  };
  const open = async (doc, width) => {
    const safe = QD.applyParts(QD.stripInternal(doc), { breakdown: true, iti: true });
    const payload = { v: 1, dk: '다낭', dt: '다낭', org: '굿리치 연수단', n: 10, d: doc.trip.days,
      ng: doc.trip.nights, t: 10000000, pp: 1000000, sd: '2026-11-10', iso: '2026-09-22',
      qno: 'BZ-검사-2', id: 'x', doc: safe };
    const B = bootPage('estimate-view.html', {
      query: '?preview=1',
      beforeBoot(w) {
        w.sessionStorage.setItem('bizpage_preview_share', JSON.stringify(payload));
        /* jsdom은 레이아웃을 계산하지 않아 높이가 전부 0이다 — 높이를 **우리가 준다**.
           그래야 `fitPages`의 산수(바닥·되재기·표시)를 실제로 돌려 볼 수 있다. */
        w.__TEST_W__ = width;
      },
    });
    await B.ready; await B.tick(200);
    return B;
  };

  /* 🔴 jsdom은 `getBoundingClientRect`가 0을 준다. 그래서 **산수만** 따로 돌린다 —
     그 산수가 이 기능의 전부이고, 화면 쪽(구역·띠)은 위 ⑧이 이미 본다. */
  const fake = (availH, needH, baseFont, sheet) => {
    const el = {
      style: {}, _h: needH,
      getBoundingClientRect() { return { height: this.style.zoom ? this._h * Number(this.style.zoom) : this._h }; },
    };
    const attrs = {};
    const qd = {
      querySelector: () => el,
      removeAttribute: (k) => { delete attrs[k]; },
      setAttribute: (k, v) => { attrs[k] = v; },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
    };
    const g = global.getComputedStyle;
    global.getComputedStyle = () => ({
      getPropertyValue: () => sheet, minHeight: (availH + 100) + 'px',
      paddingTop: '50px', paddingBottom: '50px', fontSize: baseFont + 'px',
    });
    const rep = QD.fitPages({ querySelectorAll: () => [qd] });
    global.getComputedStyle = g;
    return { rep, attrs, zoom: el.style.zoom };
  };

  const 짧음 = fake(1000, 600, 13, '1');
  ok('[9-j] 짧은 문서는 안 줄인다 (종이는 그대로 A4 한 장)',
    짧음.rep.length === 0 && !짧음.zoom, JSON.stringify(짧음.attrs));
  const 조금넘침 = fake(1000, 1100, 13, '1');
  ok('[9-k] 조금 넘치면 줄여서 한 장에 넣는다',
    조금넘침.rep.length === 1 && !조금넘침.rep[0].overflow
    && Number(조금넘침.zoom) > 0.84 && Number(조금넘침.zoom) < 1,
    JSON.stringify(조금넘침.rep));
  const 많이넘침 = fake(1000, 2000, 13, '1');
  ok('[9-l] 🔴 바닥 아래로는 안 줄이고 **스스로 말한다**',
    많이넘침.rep.length === 1 && 많이넘침.rep[0].overflow === true
    && 많이넘침.attrs['data-qd-overflow'] === '1'
    && Math.abs(Number(많이넘침.zoom) - 11 / 13) < 0.002,
    JSON.stringify(많이넘침.rep) + ' zoom=' + 많이넘침.zoom);
  const 폰 = fake(1000, 2000, 13, '0');
  ok('[9-m] 🔴 폰(A4 틀 아님)에서는 아무것도 안 줄인다',
    폰.rep.length === 0 && !폰.zoom, JSON.stringify(폰.attrs));
  /* 두 번 불러도 같은 값이어야 한다 — 이전 배율을 안 지우면 갈수록 작아진다 */
  const 두번 = (() => { const a = fake(1000, 1100, 13, '1'); return a; })();
  ok('[9-n] 🔴 두 번 불러도 배율이 더 작아지지 않는다',
    Math.abs(Number(두번.zoom) - Number(조금넘침.zoom)) < 0.002,
    두번.zoom + ' vs ' + 조금넘침.zoom);

  /* 실제 화면에도 종이가 서는가 — 구역마다 `.qd-in`이 있어야 줄일 수 있다 */
  const B = await open(mk(4));
  ok('[9-o] 구역마다 줄일 안쪽 상자가 있다',
    B.doc.querySelectorAll('.qd').length === 3
    && B.doc.querySelectorAll('.qd > .qd-in').length === 3,
    B.doc.querySelectorAll('.qd-in').length + '개');
  ok('[9-p] 🔴 인쇄는 문서만 나간다 (히어로가 종이를 밀고 있었다)',
    /\bqdv-v2\b/.test(B.doc.body.className), B.doc.body.className);
  ok('[9-q] 그리고 나서 맞춘다', /QuoteDoc\.fitPages\(/.test(VIEW));
  ok('[9-r] 창 폭이 바뀌면·인쇄 직전에 다시 맞춘다',
    /addEventListener\('resize'[\s\S]{0,200}fitPages/.test(VIEW)
    && /addEventListener\('beforeprint'[\s\S]{0,80}fitPages/.test(VIEW));

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 견적서 링크 — 새 규격(v2) 문서 · 롤링 한 페이지');
  console.log('══════════════════════════════════════════════════════════════════');
  fails.forEach((f) => console.log(' ✗ ' + f));
  if (!fails.length) console.log(' ✓ 전부 통과');
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log('🔴 터짐: ' + e.message); console.log(e.stack); process.exit(1); });

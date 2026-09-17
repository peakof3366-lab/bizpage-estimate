/* ═══════════════════════════════════════════════════════════════════════════
   자동 견적 산출 (내부직원용) 검사 — `admin-quote-pro.html` + 메뉴 3분류
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 지시(견적산출 3분류 개편, 요구 2·3).

   ■ 이 검사가 지키는 것
   ① **메뉴가 셋이다** — 고객용(이름만 바꿈) / 내부직원용(신규) / 직접견적(유지).
      🔴 고객용은 **탭 id를 안 바꿨다**(`quotetool`). 바꾸면 F5 복원 해시
        (`#tab=quotetool`)가 든 북마크가 전부 깨진다. 그 「안 바꿈」을 잠근다.
   ② **화면을 `admin.html`에 넣지 않았다** — 대표 지시 제약 6.
   ③ **스크립트 순서** — `QuoteEngineHost.mount()`가 `script.js`보다 **먼저**여야 한다.
      뒤로 가면 엔진이 통째로 안 뜬다(실측). 순서는 글자로만 확인할 수 있는 종류다.
   ④ 🔴 **날짜를 `toISOString()`으로 만들지 않는다.**
      그건 UTC라 한국(UTC+9)에서 **하루가 밀린다.** 실제로 5/20 출발 5일 일정의
      귀국일이 **5/23**으로 찍혔다(브라우저로 띄워 보고 찾았다). `_page_boot.js`에도
      같은 함정이 XQ로 기록돼 있다 — 이 저장소가 두 번째로 밟은 자리다.
   ⑤ **저장 경로를 베끼지 않았다** — `script.js`의 58키 견적 기록을 여기 복사하면
      두 벌이 된다. 숨은 폼에 submit을 흘리는지 확인한다.
   ⑥ **PATCH `{doc}` 분기가 인증 뒤에 있다** — 원가·마진이 든 문서다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const ADMIN = read('admin.html');
const PRO = read('admin-quote-pro.html');
const PATCHSRC = read(path.join('api', 'quotes', '[id].js'));

/* ═══ ① 메뉴가 셋이다 ═══ */
/* ⚠ **문서를 통째로 파싱한다.** 처음엔 `<body>`부터 첫 `<script>`까지만 잘랐는데,
   `<head>`에 `<script`가 먼저 나와 **자른 조각이 비어 있었다** — 그러면 메뉴 검사
   10건이 「없다」로 빨개진다. 화면이 아니라 **자르는 규칙이 틀린 것**이었다.
   ⚠ `runScripts`는 안 켠다 — 여기서 보는 것은 **마크업**이고, 스크립트를 돌리면
     로그인 게이트·fetch까지 따라와 느려지고 흔들린다. */
const dom = new JSDOM(ADMIN);
const D = dom.window.document;
const calc = D.querySelector('.sb-group[data-group="calc"]');
ok('[1] 견적 산출 메뉴 묶음이 있다', !!calc);
const items = calc ? Array.from(calc.querySelectorAll('.sidebar-item')) : [];
/* ⚠ 2026-09-17 — 대표 지시로 **「자동 견적 산출 (고객용)」을 지웠다.**
   그 화면은 이름과 달리 고객이 쓰는 화면이 아니라 **담당자 도구**였고, 내부직원용이
   그 칸을 전부 덮는다(골프·비즈니스석·방문처 칸은 내부직원용에만 있었다).
   고객이 쓰는 화면은 `index.html`이고 이 삭제와 무관하다.
   🔴 그래서 오늘부터 **산출 묶음은 둘**이다. */
ok('[1-b] 하위 메뉴가 둘이다', items.length === 2, '개수: ' + items.length);
const labels = items.map((b) => (b.querySelector('.si-label') || {}).textContent || '');
const tabs = items.map((b) => b.dataset.tab);
ok('[1-c] 내부직원용이 첫 자리다', labels[0] === '자동 견적 산출 (내부직원용)', labels[0]);
ok('[1-d] 직접 견적 작성이 그대로 있다', labels[1] === '직접 견적 작성', labels[1]);
/* 🔴 탭 id는 그대로다 — 바꾸면 `#tab=` 북마크가 깨진다 */
ok('[1-f] 내부직원용 탭 id는 quotepro', tabs[0] === 'quotepro', tabs[0]);
ok('[1-g] 직접견적 탭 id가 그대로 adhoc', tabs[1] === 'adhoc', tabs[1]);
/* 🔴 지운 화면이 **정말로 없는지** — 버튼만 지우고 패널을 남기면 주소로 들어간다 */
ok('[1-e] 고객용 탭이 남아 있지 않다', !D.getElementById('tab-quotetool'));
ok('[1-e2] 그 화면 파일도 없다',
  !require('fs').existsSync(require('path').join(__dirname, '..', 'admin-quote.html')));
/* 🔴 옆에 있는 집을 안 밟았는지 — 삭제가 가장 쉽게 망가뜨리는 자리다 */
ok('[1-e3] 예전 북마크(#tab=quotetool)를 내부직원용으로 보낸다',
  /ALIAS = \{ quotetool: 'quotepro' \}/.test(ADMIN));

/* 탭마다 패널이 실제로 있어야 한다 — 없으면 눌러도 빈 화면이다 */
tabs.forEach((t) => ok('[1-i] tab-' + t + ' 패널이 있다', !!D.getElementById('tab-' + t)));

/* 이름·제목·해시가 한 벌로 움직이는가 */
ok('[2] tabTitles에 quotepro가 있다', /quotepro:\s*'자동 견적 산출 \(내부직원용\)'/.test(ADMIN));
/* ⚠ 「quotetool:」만 찾으면 북마크 별칭(ALIAS)에 걸린다 — 화면 이름표만 본다 */
ok('[2-b] tabTitles에 고객용이 남아 있지 않다',
  !/quotetool:\s*'자동 견적 산출/.test(ADMIN));
ok('[2-c] renderTab이 quotepro를 처리한다', /name===['"]quotepro['"]\)\s*renderQuotePro\(\)/.test(ADMIN));
ok('[2-d] renderQuotePro가 iframe src를 지정한다',
  /function renderQuotePro\(\)[\s\S]{0,220}admin-quote-pro\.html/.test(ADMIN));

/* ═══ ③ 🔴 화면을 admin.html에 넣지 않았다 (대표 지시 제약 6) ═══ */
const panel = D.getElementById('tab-quotepro');
ok('[3] 내부직원용 패널이 iframe 하나로 끝난다',
  !!panel && panel.querySelectorAll('iframe').length === 1, panel ? '개수: ' + panel.querySelectorAll('iframe').length : '');
ok('[3-b] 그 패널에 입력칸을 만들지 않았다',
  !!panel && panel.querySelectorAll('input,select,textarea').length === 0,
  panel ? '입력칸 ' + panel.querySelectorAll('input,select,textarea').length + '개' : '');
/* 새 화면이 admin.html을 얼마나 키웠는지 — 비대해진 파일에 안 넣었다는 것의 실측 */
ok('[3-c] admin.html이 크게 안 늘었다 (신규 화면분 40줄 이내)',
  (ADMIN.match(/quotepro|renderQuotePro|quoteProFrame|admin-quote-pro/g) || []).length <= 12);

/* ═══ ④ 스크립트 순서 — mount가 script.js보다 먼저 ═══ */
const iMount = PRO.indexOf('QuoteEngineHost.mount()');
const iHost = PRO.indexOf('src="quote_engine_host.js"');
const iData = PRO.indexOf('src="data.js"');
const iScript = PRO.indexOf('src="script.js"');
const iDoc = PRO.indexOf('src="quote_doc.js"');
ok('[4] quote_engine_host.js를 싣는다', iHost > 0);
ok('[4-b] mount()가 host 로드 뒤에 있다', iMount > iHost, '');
ok('[4-c] 🔴 mount()가 script.js보다 먼저다', iMount < iScript,
  'mount ' + iMount + ' / script.js ' + iScript);
ok('[4-d] data.js가 script.js보다 먼저다', iData > 0 && iData < iScript);
ok('[4-e] rec_fallbacks.js를 싣는다 (없으면 일정 탐색이 죽는다)', PRO.indexOf('rec_fallbacks.js') > 0);
ok('[4-f] quote_doc.js를 싣는다', iDoc > 0);
ok('[4-g] quote_doc.css를 싣는다', PRO.indexOf('quote_doc.css') > 0);
ok('[4-h] ready()를 script.js 뒤에 부른다', PRO.indexOf('QuoteEngineHost.ready(') > iScript);

/* ═══ ⑤ 🔴 날짜를 toISOString()으로 만들지 않는다 ═══ */
const isoHits = (PRO.match(/toISOString\(\)/g) || []).length;
/* 하나는 허용한다 — `PATCH`에 실어 보내는 `docAt`은 **시각**이라 UTC가 맞다.
   ⚠ 날짜(YYYY-MM-DD)만 자르는 `.toISOString().slice(0, 10)`은 하나도 없어야 한다. */
ok('[5] 날짜를 UTC로 잘라 쓰지 않는다', !/toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/.test(PRO),
  'toISOString 총 ' + isoHits + '개');
ok('[5-b] 월-일도 UTC로 자르지 않는다', !/toISOString\(\)\.slice\(\s*5/.test(PRO));
ok('[5-c] 로컬 날짜 포맷터를 쓴다', /const ymd = \(d\) =>/.test(PRO) && /getFullYear\(\)/.test(PRO));

/* ═══ ⑥ 저장 경로를 베끼지 않았다 ═══ */
ok('[6] 숨은 폼에 submit을 흘린다', /getElementById\('estimateForm'\)[\s\S]{0,200}dispatchEvent/.test(PRO));
ok('[6-b] 내부 저장임을 켠다', /__INTERNAL_TOOL__\s*=\s*true/.test(PRO));
ok('[6-c] 견적 기록 필드를 베껴 적지 않았다 (estRecord 복사 금지)',
  !/programFactor\s*:/.test(PRO) && !/cabinClassLabel\s*:/.test(PRO));
ok('[6-d] 문서는 PATCH로 붙인다', /fetch\('\/api\/quotes\/'[\s\S]{0,180}PATCH/.test(PRO));
ok('[6-e] PATCH 본문이 doc 하나다', /JSON\.stringify\(\{ doc: buildDoc\(\) \}\)/.test(PRO));

/* ═══ ⑦ PATCH 분기 — 인증 뒤 · 조용히 자르지 않는다 ═══ */
const iAuth = PATCHSRC.indexOf('requireAdmin(req, res)');
const iBody = PATCHSRC.indexOf('if (body.doc)');
ok('[7] PATCH에 doc 분기가 있다', iBody > 0);
ok('[7-b] 🔴 인증 뒤에 있다', iAuth > 0 && iAuth < iBody, 'auth ' + iAuth + ' / doc ' + iBody);
ok('[7-c] 없는 견적에는 404를 준다', /quote_not_found/.test(PATCHSRC));
ok('[7-d] 너무 크면 이유를 돌려준다 (조용히 자르지 않는다)',
  /doc_too_large/.test(PATCHSRC) && /message:/.test(PATCHSRC.slice(iBody, iBody + 1400)));
ok('[7-e] payload를 통째로 덮지 않고 합친다 (||)', /payload\s*=\s*payload\s*\|\|/.test(PATCHSRC));
ok('[7-f] 새 서버리스 함수를 안 만들었다 (12/12 한도)',
  fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js')).length === 6,
  '최상위 api/*.js 개수: ' + fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js')).length);

/* ═══ ⑧ 화면 규칙 (CLAUDE.md) ═══ */
const pdom = new JSDOM('<!doctype html>' + PRO.slice(PRO.indexOf('<body'), PRO.indexOf('<script src=')));
const P = pdom.window.document;
ok('[8] 보이는 h1이 정확히 하나', P.querySelectorAll('h1').length === 1, '개수: ' + P.querySelectorAll('h1').length);
ok('[8-b] 한 문장 설명이 있다', !!P.querySelector('.page-sub'));
ok('[8-c] 버튼 이름이 무슨 일이 날지 말한다',
  Array.from(P.querySelectorAll('button')).every((b) => !/^(확인|적용|저장|편집)$/.test((b.textContent || '').trim())),
  Array.from(P.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter((t) => /^(확인|적용|저장|편집)$/.test(t)).join(','));
/* 고르는 버튼은 `aria-pressed`로 표시한다 — 행동 이름을 붙이면 눌러 놓고 한 줄 안다 */
ok('[8-d] 미리보기 탭이 aria-pressed를 쓴다',
  !!P.getElementById('tabQuote') && P.getElementById('tabQuote').hasAttribute('aria-pressed'));
/* 영문·기술 용어를 화면에 내보내지 않는다 */
const vis = (P.body.textContent || '').replace(/\s+/g, ' ');
ok('[8-e] 화면에 코드 이름이 안 나온다',
  !/getBreakdownData|QuoteEngineHost|stripInternal|golfRounds|combinedFactor/.test(vis));
/* 빈 상태는 다음 행동을 말한다 */
ok('[8-f] 빈 상태 문구가 다음 행동을 말한다',
  /선택 옵션이 없습니다[\s\S]{0,120}추가하세요/.test(PRO) && /일정이 한 줄도 없습니다[\s\S]{0,120}누르면/.test(PRO));
/* 누를 것은 44px 이상 */
ok('[8-g] 기본 버튼 높이가 44px 이상', /\.btn \{[^}]*min-height:\s*44px/.test(PRO));
ok('[8-h] opacity로 흐리게 만들지 않는다', !/opacity:\s*0?\.\d/.test(PRO.slice(0, PRO.indexOf('</style>'))));
ok('[8-i] 줄글에 최대 폭을 준다', /--measure:/.test(PRO) && /max-width:\s*var\(--measure\)/.test(PRO));

/* ═══ ⑨ 🔴 원가·마진이 고객 쪽으로 새지 않는다 ═══ */
ok('[9] 미리보기를 stripInternal 뒤에 그린다',
  /stripInternal\(doc\)[\s\S]{0,400}renderQuote\(pub/.test(PRO));
ok('[9-b] 내부 필드를 밑줄 키에 담는다', /_internal:\s*\{/.test(PRO));
ok('[9-c] 원가·마진이 _internal 안에 있다',
  /_internal:\s*\{[\s\S]{0,300}cost:[\s\S]{0,60}margin:/.test(PRO));
/* 고객 연락처도 내부다 — 링크는 인증이 없다 */
ok('[9-d] 고객 연락처가 _internal 안에 있다', /_internal:[\s\S]{0,900}customerTel:/.test(PRO));
ok('[9-e] 화면이 「내부」임을 사람에게도 말한다', /🔴 내부/.test(PRO) && /원가·마진이 보이는 화면/.test(PRO));

/* ═══ ⑩ 권한 — 직원 전원이 본다 (2026-09-15 대표 확인) ═══ */
ok('[10] 역할로 막지 않는다', !/role\s*!==\s*['"]manager['"]/.test(PRO) && !/requireRole/.test(PRO));
ok('[10-b] 로그인은 확인한다', /api\/admin\/account\?action=me/.test(PRO));
ok('[10-c] 로그인 실패면 admin으로 보낸다', /location\.href\s*=\s*'admin\.html'/.test(PRO));
ok('[10-d] 검색엔진에 안 실린다', /noindex/.test(PRO));

/* ═══ ⑪ 대표가 정한 것이 화면에도 반영됐는가 ═══ */
ok('[11] 담당자 연락처가 공란으로 시작한다',
  /id="dStaffTel"[^>]*>/.test(PRO) && !/id="dStaffTel"[^>]*value="[^"]+"/.test(PRO));
ok('[11-b] 아동·유아 단가가 성인과 같다고 화면이 말한다', /단가는 성인과 같습니다/.test(PRO));
ok('[11-c] 10+1이 단가에 반영된다고 말한다', /표기 단가에 반영됩니다/.test(PRO));
ok('[11-d] 카드 결제·알선수수료 칸이 없다', !/카드\s*결제/.test(PRO) && !/알선수수료/.test(PRO));
ok('[11-e] 불포함내역을 company-info.js에서 읽는다 (여기 다시 적지 않는다)',
  /window\.QUOTE_EXCLUDED/.test(PRO) && !/여권 발급비/.test(PRO));

/* ═══ ⑫ 🔴 화면에 영문 코드를 내보내지 않는다 (CLAUDE.md 화면 규칙 5) ═══
   브라우저로 띄워 보고 찾은 결함이다 — 계수 표의 키를 select에 그대로 넣어
   「language」·「company」가 화면에 보이고 있었다. 이름표는 `data.js`가 진실이다. */
const DATA = require(path.join(ROOT, 'data.js'));
ok('[12] data.js가 ORGANIZATION_TYPES를 내보낸다', !!DATA.ORGANIZATION_TYPES);
ok('[12-b] data.js가 PROGRAM_TYPES를 내보낸다', !!DATA.PROGRAM_TYPES);
/* 🔴 **글자가 있는지로 재지 않는다.** 처음엔 「PRO에 ORGANIZATION_TYPES가 나오는가」로
   쟀는데, 이름표를 쓰는 코드를 통째로 빼도 **주석에 그 낱말이 남아 통과했다**
   (고장을 넣어 보고 알았다 — 자가 틀린 것이다). **화면을 띄워 보기 글자를 읽는다.** */
const { bootPage } = require('./_page_boot');
/* ⚠ 띄우는 것은 **비동기**다(`ready`를 기다려야 스크립트가 다 돌았다).
   그래서 이 부분만 아래 async 묶음에서 잰다 — 결과 줄도 거기서 찍는다. */
const BOOT_CHECKS = async () => {
  const boot = bootPage('admin-quote-pro.html');
  await boot.ready;
  await boot.tick(150);
  const PD = boot.doc;
  const optText = (id) => Array.from((PD.getElementById(id) || { options: [] }).options).map((o) => o.textContent.trim());
  const CODE_RE = /^[a-z][A-Za-z0-9_]*$/;   /* language · company 같은 영문 코드 */
  [['pProgram', '연수 유형'], ['pOrg', '기관 유형'], ['pDepCity', '출발 공항']].forEach(([id, what]) => {
    const t = optText(id);
    ok('[12-c] ' + what + ' 보기가 비어 있지 않다', t.length > 0, '개수: ' + t.length);
    ok('[12-c] ' + what + ' 보기에 영문 코드가 안 보인다', t.length > 0 && !t.some((x) => CODE_RE.test(x)),
      '코드로 보이는 것: ' + t.filter((x) => CODE_RE.test(x)).join(', '));
  });
  ok('[12-c2] 목적지 60곳이 채워진다', optText('pDest').length >= 55, '개수: ' + optText('pDest').length);
  ok('[12-c3] 화면이 오류 없이 뜬다', boot.log.errors.length === 0,
    boot.log.errors.map((e) => e.msg).slice(0, 2).join(' · '));
};
ok('[12-d] 이름표를 화면에 다시 적지 않았다',
  !/언어 집중 연수/.test(PRO) && !/공공기관/.test(PRO));

/* 🔴 **index.html의 option 글자와 대조한다.** 두 목록이 갈리면 같은 유형이 두 이름으로
   불린다 — CLAUDE.md가 말한 「불가피하게 나뉘면 테스트로 대조한다」가 이 자리다. */
const IDXH = read('index.html');
/* ⚠ **정규식을 문자열로 조립하지 않는다.** `'[\s\S]'`를 JS 작은따옴표 문자열에
     적으면 `\s`가 그냥 `s`로 죽어 `[sS]`가 된다 — 그러면 아무것도 못 찾고 검사는
     「index.html을 못 읽음」으로 빨개진다(실제로 그랬다). 잘라서 읽는다. */
function optionsOf(id) {
  const open = '<select id="' + id + '"';
  const i = IDXH.indexOf(open);
  if (i < 0) return null;
  const gt = IDXH.indexOf('>', i);
  const end = IDXH.indexOf('</select>', gt);
  if (gt < 0 || end < 0) return null;
  const inner = IDXH.slice(gt + 1, end);
  return Array.from(inner.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)</g))
    .map((x) => [x[1], x[2].trim()]);
}
[['organizationType', DATA.ORGANIZATION_TYPES], ['programType', DATA.PROGRAM_TYPES]].forEach(([id, map]) => {
  const opts = optionsOf(id);
  ok('[12-e] index.html에서 ' + id + ' 보기를 읽었다', !!opts && opts.length > 0, opts ? '' : '못 읽음');
  if (!opts || !map) return;
  const bad = opts.filter(([v, t]) => !map[v] || map[v].label !== t)
    .map(([v, t]) => v + ': 화면 "' + t + '" vs data.js "' + ((map[v] || {}).label || '없음') + '"');
  ok('[12-f] ' + id + ' 이름표가 고객 화면과 같다', bad.length === 0, bad.join(' · '));
  const extra = Object.keys(map).filter((k) => !opts.some(([v]) => v === k));
  ok('[12-g] ' + id + ' data.js에만 있는 값이 없다', extra.length === 0, extra.join(','));
});
/* 키가 계수 표와 같아야 한다 — 다르면 그 유형의 계수가 조용히 1.0이 된다 */
const FAC = DATA.ESTIMATE_FACTORS || {};
if (FAC.organizationFactor) {
  ok('[12-h] 기관 유형 키가 계수 표와 같다',
    Object.keys(FAC.organizationFactor).sort().join(',') === Object.keys(DATA.ORGANIZATION_TYPES).sort().join(','),
    Object.keys(FAC.organizationFactor).join(',') + ' vs ' + Object.keys(DATA.ORGANIZATION_TYPES).join(','));
}

/* ═══ ⑬ iframe 안에서 제목이 두 번 나오지 않는다 ═══
   `admin.html`의 탭이 이미 같은 제목을 그린다. 브라우저로 보고 찾았다. */
ok('[13] iframe이면 제 제목을 감춘다',
  /window\.self !== window\.top[\s\S]{0,140}aqp-embedded/.test(PRO)
  && /\.aqp-embedded \.page-head \{[^}]*display:\s*none/.test(PRO));
ok('[13-b] 단독으로 열면 제목이 남는다 (통째로 지우지 않았다)',
  /<h1 class="page-title"[^>]*>자동 견적 산출 \(내부직원용\)<\/h1>/.test(PRO));

/* ═══ ⑭ 직접 입력 모드 (`?mode=adhoc`) — 개편 요구 4 ═══════════════════════
   대표 지시: 「직접 견적 작성도 **동일한 수준의 세부 입력**이 가능해야 하고,
   **결과 데이터 규격은 완전히 동일**해야 한다.」

   🔴 그 화면을 **또 만들지 않았다.** 같은 화면을 직접 입력 모드로 연다 —
     엔진만 안 타고 견적서·일정표를 만드는 부분은 같은 코드다. 이 검사는 그
     「한 벌」이 유지되는지를 본다. */
const PKGJS = read(path.join('admin', 'packages.js'));

ok('[14] 직접견적 카드에 상세 작성 버튼이 있다', /id="pkgDocBtn"/.test(ADMIN));
ok('[14-b] 그 버튼은 직접견적에서만 보인다', /id="pkgDocBtn"[^>]*data-pkg-only="adhoc"/.test(ADMIN));
ok('[14-c] 같은 화면을 모드만 바꿔 연다',
  /admin-quote-pro\.html\?mode=adhoc&pkg=/.test(PKGJS));
ok('[14-d] 저장 전에는 못 열고 이유를 말한다',
  /먼저 「저장」을 눌러 주세요/.test(PKGJS));
/* 🔴 admin.html에 두 번째 입력 화면을 만들지 않았다 */
ok('[14-e] admin.html에 항공 편명·일자별 일정 칸을 만들지 않았다',
  !/id="pkgFlightNo"/.test(ADMIN) && !/id="pkgDay1"/.test(ADMIN));

ok('[15] 화면이 mode=adhoc을 읽는다', /Q\.get\('mode'\) === 'adhoc'/.test(PRO));
ok('[15-b] 엔진 전용 칸을 감춘다', /html\.aqp-adhoc \.eng-only \{ display: none !important; \}/.test(PRO));
ok('[15-c] 🔴 hidden 클래스와 겹쳐 쓰지 않는다 (CSS가 서로 이긴다)',
  !/adhoc-only hidden/.test(PRO) && !/eng-only hidden/.test(PRO));
ok('[15-d] 직접견적 원본을 불러온다 (같은 값을 두 번 안 적는다)',
  /action=packages&all=1/.test(PRO) && /function loadPkg\(\)/.test(PRO));
ok('[15-e] 못 불러와도 화면은 열고 이유를 말한다',
  /직접견적을 불러오지 못했습니다[\s\S]{0,80}직접 적으셔도/.test(PRO));
ok('[15-f] 불러오기를 로그인 뒤에 부른다', PRO.indexOf('loadPkg();') > PRO.indexOf('action=me'));

/* 🔴 **금액을 지어내지 않는다** — 처음 줄의 금액은 0이다 */
/* 🔴 **함수 본문만 잘라서 본다.** 처음엔 `seedAdhocLines` 뒤 420자를 봤는데, 그 창이
   바로 아래 「+ 항목 추가」 핸들러까지 닿아 **거기 있는 `auto: 0, val: 0`을 주웠다** —
   씨앗 금액에 100만원을 넣어도 통과했다(고장을 넣어 보고 알았다). */
const iSeed = PRO.indexOf('function seedAdhocLines()');
const seedBody = iSeed > 0 ? PRO.slice(iSeed, PRO.indexOf("$('btnAddLine')", iSeed)) : '';
ok('[16] 처음 채우는 항목의 금액이 0이다',
  !!seedBody && /auto: 0, val: 0/.test(seedBody) && !/auto: [1-9]/.test(seedBody) && !/val: [1-9]/.test(seedBody),
  seedBody ? (seedBody.match(/auto: \d+, val: \d+/) || ['못 찾음'])[0] : '함수를 못 찾음');
ok('[16-b] 항목 이름을 담당자가 정한다', /data-nm="/.test(PRO));
ok('[16-c] 자동 모드에서는 항목 이름을 못 고친다',
  /S\.adhoc[\s\S]{0,200}data-nm=[\s\S]{0,200}:\s*'<span class="nm">/.test(PRO));
ok('[16-d] 원가를 입력받아 마진을 만든다',
  /if \(S\.adhoc\) \{[\s\S]{0,400}const cost = Math\.max\(0, num\(\$\('adhocCost'\)\)\);[\s\S]{0,120}const margin = total - cost;/.test(PRO));
ok('[16-e] 두 모드의 원가·마진 계산을 한 식으로 뭉치지 않았다',
  /두 모드의 원가·마진이 다른 데서 온다/.test(PRO));

/* 🔴 저장 — 엔진 폼을 태우지 않는다 (0원짜리 엔진 견적이 생기면 안 된다) */
/* 🔴 **저장 분기의 순서**를 본다 — 직접 입력 모드는 `action=internal`로 보내고
   **그 자리에서 return** 한다. 그 return이 없으면 이어서 엔진 폼 제출까지 타서
   0원짜리 엔진 견적이 하나 더 생긴다.
 ⚠ 처음엔 이걸 큰 정규식 하나로 재려다 매번 빗나갔다 — **위치로 재는 편이 정확하다.** */
const iAdhocSave = PRO.indexOf("if (S.adhoc) {\n        const t = totals();");
/* ⚠ **분기 뒤에서 찾는다.** 그냥 찾으면 위쪽 머리말 주석의 `action=internal`이
     먼저 걸려 위치 비교가 통째로 뒤집힌다(실제로 그랬다 — 1248 vs 52593). */
const iInternal = iAdhocSave > 0 ? PRO.indexOf("action=internal", iAdhocSave) : -1;
const iFormSubmit = PRO.indexOf("form.dispatchEvent(new Event('submit'");
ok('[17] 직접 입력 모드에 전용 저장 분기가 있다', iAdhocSave > 0, '위치: ' + iAdhocSave);
ok('[17-a] 그 분기가 엔진 폼 제출보다 먼저다',
  iAdhocSave > 0 && iInternal > iAdhocSave && iInternal < iFormSubmit,
  'adhoc ' + iAdhocSave + ' / internal ' + iInternal + ' / submit ' + iFormSubmit);
/* 🔴 **성공 안내 뒤의 `return;`**을 본다. 처음엔 「분기 안에 return이 있나」로 쟀는데,
   그 안에는 실패 처리(`if (!res.ok) { … return; }`)의 return이 이미 있어서 **성공 경로의
   return을 지워도 통과했다**(고장을 넣어 보고 알았다 — 자가 틀린 것이다).
   창을 성공 안내 줄 뒤로 좁힌다. */
const iSaved = PRO.indexOf("out.id || body.id", iAdhocSave > 0 ? iAdhocSave : 0);
const tailAfterSave = (iSaved > 0 && iFormSubmit > iSaved) ? PRO.slice(iSaved, iFormSubmit) : '';
/* ⚠ 정규식으로 괄호를 세다 또 빗나갔다 — **대조군까지 빨개졌다**(`')');`는 `))`가
     아니라 `')`다). **순서로 잰다**: 성공 안내와 엔진 경로 사이에 `return;`이 있어야 한다.
     읽기도 쉽고 빗나갈 자리도 없다. */
const iEnginePath = tailAfterSave.indexOf('숨은 폼');
const iReturn = tailAfterSave.indexOf('return;');
ok('[17-a2] 🔴 성공 안내 뒤에 return 한다 (엔진 경로로 안 흘러간다)',
  iReturn >= 0 && iEnginePath > iReturn, 'return ' + iReturn + ' / 엔진 경로 ' + iEnginePath);
ok('[17-b] 같은 테이블(quotes)에 저장한다', /'\/api\/quotes\?action=internal'/.test(PRO));
ok('[17-c] 같은 규격(doc)을 싣는다', /doc: doc,/.test(PRO));
ok('[17-d] 엔진을 안 탄 건임을 표시한다', /basis: 'adhoc'/.test(PRO));
ok('[17-e] 저장 실패를 그 자리에서 말한다', /저장에 실패했습니다 \(오류 /.test(PRO));

/* 🔴 서버 — 직접견적을 엔진 값과 대조하지 않는다 (늘 ✗인 잣대를 만들지 않는다) */
const QJS = read(path.join('api', 'quotes.js'));
ok('[18] 서버가 직접견적을 가려낸다', /const isAdhoc = payload\.basis === 'adhoc'/.test(QJS));
ok('[18-b] 엔진 값과 대조하지 않는다',
  /const verified = isAdhoc[\s\S]{0,40}verdict: 'not_applicable'/.test(QJS));
ok('[18-c] 「해당 없음」이지 「통과」가 아니다',
  /not_applicable/.test(QJS) && !/isAdhoc[\s\S]{0,120}verdict: 'verified'/.test(QJS));
ok('[18-d] 왜 대조 안 하는지 이유를 남긴다', /엔진 값과 대조하지 않습니다/.test(QJS));
/* 자동 견적은 여전히 검증한다 — 끈 것이 아니다 */
ok('[18-e] 자동 견적은 그대로 검증한다', /: verifyQuote\(payload, vctx\)/.test(QJS));

/* ═══ ⑲ 한 번에 한 단계만 보인다 (2026-09-16) ═══════════════════════════════
   🔴 예전엔 「자동 산출하기」 한 번에 다섯 단계가 **동시에** 열렸다. 브라우저로 잰
   문서 높이가 900px → 10,886px(12배)였고, `admin.html`의 iframe은
   `calc(100vh - 180px)` 고정이라 창의 15배를 그 안에서 굴려야 했다. 단계 이동 버튼도
   목차도 없어 마지막 행동인 「견적 저장하기」가 바닥 10,886px 지점에 있었다.
   ⚠ 여기서 고정하는 것은 **보임 규칙**이다. 금액은 이 변경과 무관하고
     `audit_amount_drift.js`가 24건 전부 한 원까지 같음을 따로 증명한다. */
ok('[19] 단계 막대를 그린다', /id="steps"/.test(PRO) && /class="step"/.test(PRO));
ok('[19-b] 고르는 것이 아니라 이동이다 — aria-current를 쓴다',
  /aria-current['"]?,\s*['"]step['"]/.test(PRO) && !/\.step[^\n]*aria-pressed/.test(PRO));
ok('[19-c] 단계 다섯을 모두 이름으로 부른다',
  /여행 조건/.test(PRO) && /금액 조정/.test(PRO) && /견적서 내용/.test(PRO)
  && /일정/.test(PRO) && /미리보기 · 발급/.test(PRO));
ok('[19-d] 산출 전에는 2~5단계가 잠긴다', /if \(!unlocked && n > 1\) return;/.test(PRO));
ok('[19-e] 잠긴 이유를 버튼 자신이 말한다', /「자동 산출하기」를 먼저 누르세요/.test(PRO));
ok('[19-f] 한 단계만 남기고 감춘다',
  /STEPS\.forEach\(\(s\) => \$\(s\.sec\)\.classList\.toggle\('hidden', s\.n !== n\)\)/.test(PRO));
ok('[19-g] 5단계로 들어올 때 미리보기를 다시 그린다',
  /if \(n === 5\) renderPreview\(\);/.test(PRO));
ok('[19-h] 각 단계에 다음·이전 버튼이 있다',
  (PRO.match(/data-goto="/g) || []).length >= 7);
/* 🔴 필수 4칸과 나머지를 같은 무게로 늘어놓지 않는다 — 나머지는 접는다 */
ok('[19-i] 세부 조건을 접어 둔다', /<details class="more" id="moreCond">/.test(PRO));
ok('[19-j] 접힌 칸 수를 세어서 적는다 — 모드마다 다르다',
  /ADHOC && el\.classList\.contains\('eng-only'\)/.test(PRO));
/* 🔴 `select`는 첫 보기가 그냥 골라진 값이다 — 안 건드리면 목록 첫 행으로 산출됐다 */
ok('[19-k] 목적지는 「고르지 않음」으로 시작한다',
  /목적지를 고르세요/.test(PRO) && /sel\.value = '';/.test(PRO));

(async () => {
  try { await BOOT_CHECKS(); } catch (e) { fails.push('[12-c] 화면을 못 띄웠다 — ' + e.message); }
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 자동 견적 산출 (내부직원용) — 메뉴 3분류 · admin-quote-pro.html');
  console.log('══════════════════════════════════════════════════════════════════');
  fails.forEach((f) => console.log(' ✗ ' + f));
  if (!fails.length) console.log(' ✓ 전부 통과');
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
})();

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
ok('[1-b] 하위 메뉴가 셋이다', items.length === 3, '개수: ' + items.length);
const labels = items.map((b) => (b.querySelector('.si-label') || {}).textContent || '');
const tabs = items.map((b) => b.dataset.tab);
ok('[1-c] 고객용 이름이 「자동 견적 산출 (고객용)」', labels[0] === '자동 견적 산출 (고객용)', labels[0]);
ok('[1-d] 내부직원용 이름이 「자동 견적 산출 (내부직원용)」', labels[1] === '자동 견적 산출 (내부직원용)', labels[1]);
ok('[1-e] 직접 견적 작성이 그대로 있다', labels[2] === '직접 견적 작성', labels[2]);
/* 🔴 여기가 핵심 — **탭 id는 안 바꿨다** */
ok('[1-f] 고객용 탭 id가 그대로 quotetool', tabs[0] === 'quotetool', tabs[0]);
ok('[1-g] 내부직원용 탭 id는 quotepro', tabs[1] === 'quotepro', tabs[1]);
ok('[1-h] 직접견적 탭 id가 그대로 adhoc', tabs[2] === 'adhoc', tabs[2]);
/* 탭마다 패널이 실제로 있어야 한다 — 없으면 눌러도 빈 화면이다 */
tabs.forEach((t) => ok('[1-i] tab-' + t + ' 패널이 있다', !!D.getElementById('tab-' + t)));

/* 이름·제목·해시가 한 벌로 움직이는가 */
ok('[2] tabTitles에 quotepro가 있다', /quotepro:\s*'자동 견적 산출 \(내부직원용\)'/.test(ADMIN));
ok('[2-b] tabTitles의 고객용에도 (고객용)이 붙었다', /quotetool:\s*'자동 견적 산출 \(고객용\)'/.test(ADMIN));
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

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' 자동 견적 산출 (내부직원용) — 메뉴 3분류 · admin-quote-pro.html');
console.log('══════════════════════════════════════════════════════════════════');
fails.forEach((f) => console.log(' ✗ ' + f));
if (!fails.length) console.log(' ✓ 전부 통과');
console.log(`결과: ${pass} pass / ${fails.length} fail`);
process.exit(fails.length ? 1 : 0);

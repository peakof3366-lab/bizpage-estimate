/* 고객 견적서 폰 화면 2026-10-20 — 캡처를 눈으로 보고 찾은 셋 (대표 「UI UX가 디벨롭된 게 필요해」)

   고객 견적서 링크는 카톡으로 가서 **폰에서 열린다.** 390px로 찍어 보니 자(check_customer_screens)는
   「🔴 0」인데 세 군데가 덜 만든 문서처럼 보였다:
   ① 🔴 세부견적서 수량 칸 — **줄마다** 「30 / 명」으로 꺾여 표가 두 배로 길었다.
      → 수량 칸 12 → 15% · 한 줄로. 자에 「숫자+단위」 잣대 추가(`_screen_probe.py` ⑧).
   ② 🔴 일정표 — 「식사 · 숙박」 칸이 **하루도 안 채워져 있는데** 폭 24%를 먹고, 일정 글은 44% 칸에 갇혀
      한 줄에 너덧 자씩 접혔다. 「지역」 칸은 「오리엔/테이션」처럼 낱말 중간이 꺾였다.
      → 식사·숙박이 하루도 없으면 칸을 안 그린다 · 폰에서는 지역을 일정 칸 첫 줄로 올린다.
   ③ 개요 「숙박지」가 빈 칸 — 고객 직접 발급은 숙박지를 모른다 → 「확정 후 안내」(항공과 같은 말).

   같은 날 견적 폼(폰): ④ 🔴 출발일·귀국일 칸이 오른쪽 절반에 몰렸다(세로 줄에 flex-end가 남음)
   ⑤ 「회 (섭외비+통역비)」가 통째로 떨어져 「회」가 숫자 칸과 갈렸다 ⑥ 결과 배지의 「다음 검토 예정: 2026년 09월」이
   이미 지난 날짜(data.js 고정값 — 관리자 화면은 9/27에 같은 이유로 걷었다).

   그리고 「낭독기 이름 없음 42」(견적 작성 화면)는 **전부 숨은 엔진 폼**이었다 — 자가 조상의 aria-hidden을 안 봤다([8]).

   그리고 자가 못 보던 것: 고객 홈 첫 화면 아래 구역 전부가 스크롤 등장(`.reveal`, opacity 0)이라
   배치 검사가 **한 번도 안 쟀다**(명암비 검사만 끄고 재고 있었다) → `_browser_fixtures.REVEAL` 하나로 모았다.

   jsdom은 폭을 모른다 — 폭은 `python ai-loop/check_customer_screens.py`가 잰다.
   여기서는 **구조**(칸 수 · 문구 · CSS 규칙)를 지킨다.
   실행: node ai-loop/test_aV_customer_doc_phone_1020.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const Q = require(path.join(ROOT, 'quote_doc.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const dom = (html) => new JSDOM('<!doctype html><body>' + html + '</body>').window.document;

const day = (n, extra) => Object.assign({ day: n, title: '입국 · 오리엔테이션', am: '도착', pm: '시내 탐방', eve: '만찬' }, extra || {});
const base = { trip: { orgName: '가상', startDate: '2027-01-08', endDate: '2027-01-10', days: 3, pax: 30 } };

console.log('[1] 일정표 — 식사·숙박이 하루도 없으면 세 칸');
{
  const d = dom(Q.renderItinerary(Object.assign({}, base, { itinerary: [day(1), day(2), day(3)] }), {}));
  const t = d.querySelector('table.qd-iti');
  ok('표가 있다', !!t);
  ok('머리 칸 3개(일자·지역·일정)', t && t.querySelectorAll('thead th').length === 3,
    t && [...t.querySelectorAll('thead th')].map((x) => x.textContent).join('|'));
  ok('col 3개', t && t.querySelectorAll('col').length === 3);
  ok('「식사 · 숙박」 머리가 없다', t && !/식사 · 숙박/.test(t.textContent));
  ok('줄마다 칸 3개', t && [...t.querySelectorAll('tbody tr')].every((r) => r.children.length === 3));
  ok('세 칸 표에 qd-iti-3 이름', t && t.classList.contains('qd-iti-3'));
}

console.log('[2] 일정표 — 한 날이라도 적혀 있으면 네 칸 그대로(날마다 칸 수가 다르면 표가 깨진다)');
{
  const d = dom(Q.renderItinerary(Object.assign({}, base,
    { itinerary: [day(1), day(2, { meals: { d: '현지식' } }), day(3)] }), {}));
  const t = d.querySelector('table.qd-iti');
  ok('머리 칸 4개', t && t.querySelectorAll('thead th').length === 4);
  ok('줄마다 칸 4개(빈 날도)', t && [...t.querySelectorAll('tbody tr')].every((r) => r.children.length === 4));
  ok('qd-iti-3 이름이 없다', t && !t.classList.contains('qd-iti-3'));
  const d2 = dom(Q.renderItinerary(Object.assign({}, base, { itinerary: [day(1, { stay: '리조트' })] }), {}));
  ok('숙박만 적혀 있어도 네 칸', d2.querySelectorAll('table.qd-iti thead th').length === 4);
  const d3 = dom(Q.renderItinerary(Object.assign({}, base, { itinerary: [day(1, { meals: { b: '  ' } })] }), {}));
  ok('공백만 있는 끼니는 「없다」로 친다', d3.querySelectorAll('table.qd-iti thead th').length === 3);
}

console.log('[3] 일정표 — 폰에서 지역을 일정 칸 첫 줄로 올릴 자리');
{
  const d = dom(Q.renderItinerary(Object.assign({}, base, { itinerary: [day(1), day(2, { title: '' })] }), {}));
  const rows = [...d.querySelectorAll('table.qd-iti tbody tr')];
  ok('지역 칸에 qd-iti-reg 이름(폰에서 접는 손잡이)', rows[0] && rows[0].children[1].classList.contains('qd-iti-reg'));
  ok('머리 「지역」에도 같은 이름', !!d.querySelector('thead th.qd-iti-reg'));
  const tt = rows[0] && rows[0].querySelector('.qd-iti-b .qd-iti-tt');
  ok('일정 칸 첫 줄에 지역 이름', tt && tt.textContent === '입국 · 오리엔테이션' && tt === rows[0].querySelector('.qd-iti-b').firstElementChild);
  ok('지역이 비면 빈 줄을 안 넣는다', rows[1] && !rows[1].querySelector('.qd-iti-tt'));
  const xss = dom(Q.renderItinerary(Object.assign({}, base, { itinerary: [day(1, { title: '<img src=x onerror=alert(1)>' })] }), {}));
  ok('🔴 올린 줄도 esc를 거친다(공개 입력)', !xss.querySelector('.qd-iti-tt img'));
}

console.log('[4] 개요 「숙박지」 — 비면 「확정 후 안내」, 편집 화면은 빈 칸 그대로');
{
  const cell = (o, doc) => dom(Q.renderQuote(doc, o)).querySelector('td.qd-k-stay');
  const empty = cell({}, base);
  ok('고객 문서: 「확정 후 안내」', empty && empty.textContent.trim() === '확정 후 안내', empty && empty.textContent);
  ok('흐린 색 이름(qd-tbd) — 적힌 값과 구별', empty && !!empty.querySelector('.qd-tbd'));
  const filled = cell({}, { trip: Object.assign({}, base.trip, { stayLabel: '세부(3)' }) });
  ok('값이 있으면 그 값', filled && filled.textContent.trim() === '세부(3)');
  const ed = cell({ edit: true }, base);
  ok('편집 화면: 적는 칸(contenteditable)이 그대로', ed && !!ed.querySelector('[data-qd-f="trip.stayLabel"]') && !/확정 후 안내/.test(ed.textContent));
}

console.log('[5] CSS — 폰 폭 블록의 규칙');
{
  const css = read('quote_doc.css');
  const phone = (css.match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  ok('폰 블록을 찾았다', phone.length > 1000);
  ok('세부견적서 수량 칸 15%', /\.qd-bd col:nth-child\(3\) \{ width: 15% !important; \}/.test(phone));
  ok('항목 칸 25% 바닥(23%면 「유류할증 / 료」)', /\.qd-bd col:nth-child\(1\) \{ width: 25% !important; \}/.test(phone));
  const cols = [1, 2, 3, 4].map((i) => Number(((phone.match(new RegExp('\\.qd-bd col:nth-child\\(' + i + '\\) \\{ width: (\\d+)%')) || [])[1])));
  ok('세부견적서 네 칸 합 100%', cols.reduce((s, n) => s + n, 0) === 100, cols.join('+'));
  ok('수량 칸 한 줄로(nowrap)', /\.qd-bd \.qd-ctr \{[^}]*white-space: nowrap/.test(phone));
  ok('폰에서 지역 칸을 접는다', /\.qd-iti \.qd-iti-reg \{ display: none; \}/.test(phone));
  ok('폰에서 올린 줄을 보인다', /\.qd-iti \.qd-iti-tt \{ display: block; \}/.test(phone));
  ok('넓은 화면·인쇄에서는 올린 줄이 안 보인다(폰 블록 밖 기본값)', /\n\.qd-iti-tt \{ display: none;/.test(css));
  ok('세 칸 표는 일정 칸을 83%로', /\.qd-iti-3 col:nth-child\(2\) \{ width: 83% !important; \}/.test(phone));
  ok('🔴 인쇄 블록에는 지역 칸 접기가 없다(결재 문서는 그대로)',
    !/@media print[^{]*\{[^@]*qd-iti-reg/.test(css));
}

console.log('[6] 자 — 스크롤 등장 규칙이 한 곳에 있고 두 도구가 같이 쓴다');
{
  const fx = read('ai-loop/_browser_fixtures.py');
  const probe = read('ai-loop/_screen_probe.py');
  const con = read('ai-loop/check_contrast.py');
  ok('REVEAL은 _browser_fixtures에 있다', /^REVEAL = r"""/m.test(fx) && /def reveal_all\(/.test(fx));
  ok('배치 검사(collect)가 재기 전에 부른다', /reveal_all\(page\)\s*\n\s*r = page\.evaluate\(SWEEP, OPTS\)/.test(probe));
  ok('명암비 검사는 복사본이 아니라 가져다 쓴다', !/^REVEAL = r"""/m.test(con) && /import[\s\S]{0,200}REVEAL\)/.test(con));
  ok('⑧ 잣대에 「숫자+단위」(명·박·일·실·회 + 시·건·개·월)', /\\d\+\(\?:명\|박\|일\|실\|회\|시\|건\|개\|월\)/.test(probe));
  ok('⑧ 자가 시험에 120명(고장)과 30명(대조군)', /"120명"/.test(probe) && /c\["text"\] == "30명"/.test(probe));
}

console.log('[7] 고객 견적 폼(폰) — 날짜 칸 · 단위 · 지난 「검토 예정」');
{
  const css = read('styles.css');
  ok('🔴 세로로 접은 날짜 줄은 칸을 꽉 채운다(flex-end가 남으면 오른쪽 절반에 몰린다)',
    /\.date-inputs-row \{ flex-direction:column; align-items:stretch;/.test(css));
  const html = read('index.html');
  const units = [...html.matchAll(/<span class="vip-count-unit">([^<]*)<\/span>/g)].map((m) => m[1]);
  ok('단위 조각에 괄호 설명이 섞이지 않는다(섞이면 폰에서 통째로 떨어져 단위가 숫자 칸과 갈린다)',
    units.length >= 5 && units.every((u) => !/\(/.test(u)), units.join(' | '));
  ok('괄호 설명 넷은 따로 선 조각', (html.match(/<span class="vip-count-note">\(/g) || []).length === 4);
  ok('🔴 단위에 flex-grow를 주지 않는다(「명 ×」가 늘어나 두 칸 사이가 벌어진다)',
    !/\.vip-count-unit \{[^}]*flex:/.test(css));
  const js = read('script.js');
  const badge = (js.match(/rateBadgeEl\.innerHTML =([\s\S]*?);\r?\n/) || [])[1] || '';
  ok('요율 배지 코드를 찾았다', /요율 기준/.test(badge));
  ok('🔴 고객 배지에 고정값 「다음 검토 예정」(이미 지난 날짜)이 없다', !/nextReview|다음 검토/.test(badge));
}

console.log('[8] 자 — 「이름 없는 칸」은 조상의 aria-hidden 아래를 안 센다 · 진짜 이름 없는 칸은 센다');
{
  const { namelessControls } = require('./_journey_probe.js');
  const d = dom(`
    <div id="__qeh" aria-hidden="true" style="position:absolute;left:-9999px">
      <input id="engHidden" tabindex="-1"><select id="engSel" tabindex="-1"></select><button tabindex="-1"></button></div>
    <input id="bare">
    <label>이름 <input id="wrapped"></label>
    <input id="named" aria-label="인원">
    <button id="iconOnly"></button>`);
  const n = namelessControls(d);
  ok('숨은 엔진 폼 안(조상 aria-hidden)은 안 센다', !n.inputs.includes('engHidden') && !n.inputs.includes('engSel'));
  ok('숨은 폼 안 버튼도 안 센다(센 버튼은 바깥의 iconOnly 하나)', n.buttons.length === 1 && n.buttons[0] === 'iconOnly', n.buttons.join(','));
  ok('🔴 진짜 이름 없는 칸(bare)은 센다 — 자가 무뎌지지 않았다', n.inputs.includes('bare'));
  ok('🔴 아이콘만 든 버튼은 센다', n.buttons.includes('iconOnly'));
  ok('라벨 안 칸 · aria-label 칸은 안 센다', !n.inputs.includes('wrapped') && !n.inputs.includes('named'));
  ok('센 칸은 정확히 하나(bare)', n.inputs.length === 1, n.inputs.join(','));
}

console.log('[9] 자 ⑧이 표 밖까지 보게 되자 잡힌 둘 — 그래프 「22 / 시」 · 유효기간 「23 / 일까지」');
{
  const probe = read('ai-loop/_screen_probe.py');
  ok('⑧은 화면의 모든 글자를 훑는다(td/th 고리 밖)', /createTreeWalker\(document\.body, NodeFilter\.SHOW_TEXT\)/.test(probe));
  ok('⑧ 자가 시험에 표 밖 라벨(22시)', /"22시"/.test(probe));
  const ah = read('admin.html');
  const fn = new Function((ah.match(/function buildHourData\(visits\) \{[\s\S]*?\n  \}/) || [''])[0] + '; return buildHourData;')();
  const labels = fn([]).map((x) => x.label);
  ok('시간대 라벨은 숫자만(0~22)', labels.join(',') === '0,2,4,6,8,10,12,14,16,18,20,22', labels.join(','));
  ok('「시」는 카드 제목이 말한다', /시간대별 방문 \(시 · 2시간씩 묶음/.test(ah));
  ok('막대 라벨은 안 꺾인다', /\.bar-lbl \{[^}]*white-space: nowrap/.test(read('admin.css')));
  ok('🔴 고객 유효기간 띠의 날짜 덩어리는 한 줄', /\.validity-banner-text strong \{[^}]*white-space: nowrap/.test(read('estimate-view.html')));
}

console.log('[10] 관리자 가로 막대 — 0은 비운다(최소 2%를 칠해 「0% (0/9)」에 막대가 보였다)');
{
  const ah = read('admin.html');
  const fills = [...ah.matchAll(/class="h-bar-fill" style="width:\$\{([^}]*)\}%"/g)].map((m) => m[1]);
  ok('가로 막대 그리는 곳 둘을 찾았다', fills.length === 2, String(fills.length));
  ok('🔴 둘 다 0이면 0으로(조건 없이 Math.max(…, 2)가 아니다)', fills.every((f) => /> 0 \?/.test(f) && /: 0$/.test(f.trim())), fills.join(' | '));
  ok('🔴 CSS가 최소 폭으로 0을 덮지 않는다(min-width 4px가 있었다 — 그리는 쪽만 고쳤다가 화면에 그대로 남았다)',
    !/\.h-bar-fill\s*\{[^}]*min-width/.test(read('admin.css')));
}

console.log('[11] 견적 작성 — 저장된 견적을 불러오면 목적지에 딸린 것(추천 코스·골프 잠금)도 따라온다 · 일정 카드 다섯 칸 한 줄');
{
  const qp = read('admin-quote-pro.html');
  ok('afterDestSetByCode가 추천 코스·골프 잠금을 다시 맞춘다',
    /function afterDestSetByCode\(\) \{ fillCourseSelect\(\); syncGolfLock\(\); \}/.test(qp));
  const sets = [...qp.matchAll(/\b(sel|e)\.value = (want|hit\.destKey);([^\n]*)/g)];
  ok('목적지를 코드로 넣는 두 곳(저장 견적 · 직접견적)을 찾았다', sets.length === 2, String(sets.length));
  ok('🔴 두 곳 모두 넣은 직후 afterDestSetByCode를 부른다(대입은 change를 안 낸다)', sets.every((m) => /afterDestSetByCode\(\)/.test(m[3])));
  ok('change를 흉내 내지 않는다(sec1의 markCalcStale이 불러온 견적을 「다시 계산 필요」로 만든다)',
    !/pDest'\)\.dispatchEvent|sel\.dispatchEvent\(new Event\('change'/.test(qp));
  ok('하루 카드는 다섯 칸 한 줄 격자(iti-b)', /'<div class="day-b iti-b">'/.test(qp));
  ok('🔴 칸이 줄어들 수 있다(minmax(0, …) — 그냥 fr이면 카드 밖으로 넘쳤다)',
    /\.day-b\.iti-b \{ grid-template-columns: minmax\(0, 1\.5fr\) minmax\(0, 1\.5fr\) minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(0, 1fr\); \}/.test(qp));
}

console.log('[12] 문의 상세 — 기록만 하는 버튼이 「확정」(발송처럼 읽힘)이라 부르지 않는다');
{
  const ah = read('admin.html');
  const btn = (ah.match(/onclick="confirmReply\('inquiry'[^>]*>([^<]*)<\/button>/) || [])[1];
  ok('답변 버튼을 찾았다', !!btn, String(btn));
  ok('🔴 이름이 「기록」을 말한다(고객에게 안 보낸다)', /기록/.test(btn || '') && !/확정|보내기|발송|전송/.test(btn || ''), btn);
  ok('매뉴얼도 같은 이름 · 「보내지는 것이 아니다」를 말한다',
    /<span class="btn-demo">전달한 답변 기록<\/span>/.test(read('manual.html')) && /고객에게 보내지는 것이 아니라/.test(read('manual.html')));
}

console.log('[13] 고객 홈(폰) — 목적지·연수 사례 카드 2열(1열이면 두 구역만 약 7화면)');
{
  const css = read('styles.css');
  const blocks = [...css.matchAll(/@media \(max-width:480px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  const first = blocks.find((b) => /\.gallery-grid/.test(b)) || '';
  ok('480px 블록에서 목적지 2열', /\.gallery-grid \{ grid-template-columns:repeat\(2,1fr\); \}/.test(first));
  ok('반쪽 폭이라 4/3(16/9면 약 95px로 납작)', /\.gallery-card \{ aspect-ratio:4\/3; \}/.test(first));
  ok('연수 사례 2열', /\.pf-grid \{ grid-template-columns:repeat\(2,1fr\); gap:10px; \}/.test(first));
  /* 카드 안 글자 규칙은 기본값(.pf-body{padding:20px})보다 **뒤**에 있어야 이긴다 */
  const basePos = css.lastIndexOf('.pf-body { padding:20px; }');
  const phonePos = css.lastIndexOf('.pf-body { padding:12px; }');
  ok('🔴 2열 카드 글자·여백 규칙이 기본값보다 뒤(앞이면 덮인다 — 실제로 덮였다)', basePos > 0 && phonePos > basePos, basePos + ' / ' + phonePos);
  ok('카드 제목 14px(11px 바닥 위)', /\.pf-title \{ font-size:14px;/.test(css.slice(phonePos)));
}

console.log('[14] 자동 산출 ② — 내부 항목(본사 수익·현지 수익금·보험)이 「견적서 비노출」 묶음 아래에');
{
  const qp = read('admin-quote-pro.html');
  ok('표시 순서는 두 모드 모두 고객 줄 먼저 · 내부 줄 나중',
    /const order = S\.rows\.filter\(\(r\) => !r\.internal\)\.concat\(S\.rows\.filter\(\(r\) => r\.internal\)\);/.test(qp));
  ok('🔴 자동 산출도 내부 줄이 있으면 머리줄을 단다(예전엔 직접 입력만)', /if \(\(S\.adhoc \|\| hasInternal\) && order\.length\) grp\('고객 견적서 항목'\)/.test(qp));
  ok('내부 묶음 머리줄은 모드 조건 없이', /if \(r\.internal && !shownInternalHead\) \{/.test(qp));
  ok('9/28 대표 요청 — 줄마다 「내부」 배지는 되살리지 않는다', !/badge[^"]*">내부</.test(qp));
}

console.log('[15] 견적 작성 합계 막대 — 설명은 금액 아래 한 줄(옆에 붙이면 「고객이 받는 / 금액」으로 갈렸다)');
{
  const qp = read('admin-quote-pro.html');
  const sum = (qp.match(/\$\('sumBox'\)\.innerHTML =([\s\S]*?);\r?\n/) || [])[1] || '';
  ok('합계 막대 코드를 찾았다', /자동 산출 총액/.test(sum));
  ok('🔴 「원 · 설명」 이어 붙이기가 없다', !/<em>원 ·|<em>원 '/.test(sum), sum.slice(0, 120));
  ok('설명 넷이 .nt로', ['고객이 받는 금액', "'조정 없음'", '실무 변수', '마진율'].every((s) => sum.includes(s)) && (sum.match(/nt\(/g) || []).length >= 4);
  ok('.nt는 한 줄을 차지한다', /\.sum \.nt \{ display: block;/.test(qp));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

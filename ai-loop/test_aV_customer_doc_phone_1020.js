/* 고객 견적서 폰 화면 2026-10-20 — 캡처를 눈으로 보고 찾은 셋 (대표 「UI UX가 디벨롭된 게 필요해」)

   고객 견적서 링크는 카톡으로 가서 **폰에서 열린다.** 390px로 찍어 보니 자(check_customer_screens)는
   「🔴 0」인데 세 군데가 덜 만든 문서처럼 보였다:
   ① 🔴 세부견적서 수량 칸 — **줄마다** 「30 / 명」으로 꺾여 표가 두 배로 길었다.
      → 수량 칸 12 → 15% · 한 줄로. 자에 「숫자+단위」 잣대 추가(`_screen_probe.py` ⑧).
   ② 🔴 일정표 — 「식사 · 숙박」 칸이 **하루도 안 채워져 있는데** 폭 24%를 먹고, 일정 글은 44% 칸에 갇혀
      한 줄에 너덧 자씩 접혔다. 「지역」 칸은 「오리엔/테이션」처럼 낱말 중간이 꺾였다.
      → 식사·숙박이 하루도 없으면 칸을 안 그린다 · 폰에서는 지역을 일정 칸 첫 줄로 올린다.
   ③ 개요 「숙박지」가 빈 칸 — 고객 직접 발급은 숙박지를 모른다 → 「확정 후 안내」(항공과 같은 말).

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
  ok('⑧ 잣대에 「숫자+단위」', /\\d\+\(\?:명\|박\|일\|실\|회\)/.test(probe));
  ok('⑧ 자가 시험에 120명(고장)과 30명(대조군)', /"120명"/.test(probe) && /c\["text"\] == "30명"/.test(probe));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

/* ═══════════════════════════════════════════════════════════════════════════
   견적서 공통 모듈 검사 — `quote_doc.js`
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 지시(견적산출 3분류 개편, 요구 5).

   ■ 이 검사가 지키는 것 셋
   ① **내부 전용 필드가 고객에게 안 나간다** — 대표 지시의 절대 조건이다.
      「지웠다」가 아니라 **렌더된 HTML에 그 숫자가 없는지**까지 본다. 규격만 보고
      통과시키면, 렌더러가 `_internal`을 직접 읽는 순간 조용히 뚫린다.
   ② **합계를 밖에서 못 넣는다** — 줄 금액과 합계가 어긋난 문서가 저장되면 나중에
      어느 쪽이 맞는지 알 방법이 없다.
   ③ **대표가 빼라고 한 것이 안 들어간다** — 카드 결제 3% UP, 여행사 알선수수료.
      ⚠ 나중에 누가 「기준 이미지대로」 되살릴 수 있어서 **없음을 잠근다**
        (이 저장소의 「지우지 말고 재는 자리를 옮긴다」와 같은 취지).

   ■ ⚠ 표 구조는 **jsdom으로 파싱해서** 센다
   `includes('rowspan="6"')` 같은 글자 검사는 우연히 다른 칸이 6이어도 통과한다.
   기준 이미지의 「전 일정 포함」이 **여섯 항목에 걸친 한 칸**인지는 DOM으로만 안다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const Q = require(path.join(ROOT, 'quote_doc.js'));

let pass = 0; const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fails.push(name + (extra ? ' — ' + extra : ''));
};

/* ── 기준 이미지와 같은 내용의 문서 1건 ──
   ⚠ 손으로 지은 픽스처지만, **기준 이미지에서 글자 그대로 옮긴 것**이다.
     이미지가 최종 출력물의 기준이라고 대표가 명시했다. */
const COMPANY = { brand: '비즈페이지', legalName: '(주)하나이엔비티',
  address: '서울 금천구 시흥대로73길 67, 1012호', tel: '02-2088-4253' };
const SECRET = 1150000; /* 마진 — 이 숫자가 고객 쪽 어디에도 있으면 안 된다 */

function fixture() {
  return {
    meta: { client: '거래처명', regionLabel: '국가명_지역명', issueDate: '2026-09-08',
      quoteNo: 'Q-260908-001', validUntil: '2026-09-22' },
    trip: { orgName: '업체명', startDate: '2026-01-01', endDate: '2026-01-05',
      days: 5, nights: 3, region: '국가명_지역명', stayLabel: '지역명(3)', pax: 10 },
    price: {
      lines: [{ kind: 'adult', label: '성인', unit: 1750000, qty: 1 },
        { kind: 'child', label: '아동', unit: 1750000, qty: 1 },
        { kind: 'infant', label: '유아', unit: 1750000, qty: 1 }],
      condition: '10+1조건', fuelNote: '#00월 기준 유류할증료 적용 기준',
    },
    options: [{ label: '선택1', name: '호텔 1인실 사용(유료)', unit: 510000, qty: 0, note: '올인클루시브 조건' }],
    details: [
      { label: '항공', rows: [{ left: '에어서울', right: 'RS0527 23MAY ICNCXR 19:50~22:55', note: 'LCC' }],
        footnotes: ['※ FSC (Full Service Career) : 마일리지 적립'] },
      { label: '호텔', rows: [{ text: '전일정 특급 호텔', note: '2인 1실 조건' }] },
      { label: '기사/차량', rows: [{ text: '45인승 버스 1대', note: '전 일정 포함' }] },
      { label: '가이드', rows: [{ text: '한국인 가이드 1명', note: '전 일정 포함' }] },
      { label: '인솔자', rows: [{ text: '책임인솔자 1명', note: '전 일정 포함' }] },
      { label: '식사', rows: [{ text: '조식 호텔식', note: '전 일정 포함' }, { text: '리조트식 기준', note: '전 일정 포함' }] },
      { label: '입장료', rows: [{ text: '일정표 기재 관광지', note: '전 일정 포함' }] },
      { label: '여행자보험', rows: [{ text: '기본 1억원 보장', note: '전 일정 포함' }] },
      { label: '기타사항', rows: [{ text: '쇼핑센터 방문', note: '방문 없음 (노쇼핑)' }, { text: '선택관광 제안', note: '제안 없음 (노옵션)' }] },
      { label: '불포함내역', rows: [{ text: '기타 개인경비', accent: 'red', note: '요청 시 사후정산 가능' }] },
    ],
    itinerary: [{ day: 1, date: '01-01 (목)', title: '인천 → 현지', am: '집결', pm: '이동',
      meals: { l: '기내식' }, stay: '아쿠아마린 리조트' }],
    remarks: '상기 금액은 변동될 수 있습니다.',
    _internal: { source: 'engine', cost: 4100000, margin: SECRET, memo: '마진 21.9%',
      adjust: [{ key: 'foc', label: 'FOC', amount: -1750000 }] },
  };
}

/* ═══ ① 한글 금액 — 기준 이미지의 「일금 오백이십오만 원정」 ═══ */
[[5250000, '일금 오백이십오만 원정'], [0, '일금 영 원정'], [10, '일금 십 원정'],
  [10000, '일금 일만 원정'], [100000000, '일금 일억 원정'],
  [17500000, '일금 천칠백오십만 원정']].forEach(([n, want]) => {
  ok('[1] 한글금액 ' + n, Q.hangulAmount(n) === want, '나온 값: ' + Q.hangulAmount(n));
});
/* 🔴 「일십」·「일백」·「일천」은 안 쓴다 */
ok('[1-b] 십·백·천 앞에 「일」을 안 붙인다',
  !/일십|일백(?!만)|일천/.test(Q.hangulAmount(111111)), Q.hangulAmount(111111));

/* ═══ ② 기간 표기 — 박수는 입력값이다(기내 1박) ═══ */
ok('[2] 명시한 박수를 그대로 쓴다', Q.normalize({ trip: { days: 5, nights: 3 } }).trip.durationLabel === '3박 5일');
ok('[2-b] 안 주면 일수-1로 채운다', Q.normalize({ trip: { days: 5 } }).trip.durationLabel === '4박 5일');
ok('[2-c] 0박은 「당일」', Q.normalize({ trip: { days: 1, nights: 0 } }).trip.durationLabel === '당일');
ok('[2-d] 요일 표기', Q.dateLabel('2026-01-01') === '2026-01-01 (목)', Q.dateLabel('2026-01-01'));

/* ═══ ③ 합계는 밖에서 못 넣는다 ═══ */
const forged = Q.normalize({ price: { lines: [{ unit: 1000, qty: 2 }], total: 999999999 } });
ok('[3] 밖에서 넣은 합계를 무시하고 다시 센다', forged.price.total === 2000, '나온 값: ' + forged.price.total);
ok('[3-b] 한글 금액도 다시 센 값으로', forged.price.totalHangul === '일금 이천 원정', forged.price.totalHangul);
const many = Q.normalize(fixture());
ok('[3-c] 줄 합 = 총액', many.price.total === many.price.lines.reduce((s, l) => s + l.amount, 0));
ok('[3-d] 기준 이미지와 같은 총액', many.price.total === 5250000, '나온 값: ' + many.price.total);

/* ═══ ④ 🔴 내부 전용 필드 — 규격·렌더 양쪽에서 막힌다 ═══ */
const full = Q.normalize(fixture());
const pub = Q.stripInternal(full);
ok('[4] 원본에는 내부키가 있다', Q.findInternalKeys(full).length > 0);
ok('[4-b] stripInternal 후 내부키 0개', Q.findInternalKeys(pub).length === 0,
  '남음: ' + Q.findInternalKeys(pub).join(', '));
/* 배열 **안쪽**까지 파고든다 — 조정 항목이 배열 안에 있다 */
const nested = Q.stripInternal({ a: [{ _x: 1, b: [{ _y: 2, c: 3 }] }] });
ok('[4-c] 배열 안쪽의 내부키도 지운다', JSON.stringify(nested) === '{"a":[{"b":[{"c":3}]}]}', JSON.stringify(nested));
/* 🔴 여기가 진짜 방어선 — **렌더된 글자**에 마진이 있나 */
const htmlPub = Q.renderQuote(pub, { company: COMPANY });
const htmlIti = Q.renderItinerary(pub, { company: COMPANY });
[['견적서', htmlPub], ['일정표', htmlIti]].forEach(([n, h]) => {
  ok('[4-d] ' + n + ' HTML에 마진 숫자 없음', h.indexOf(String(SECRET)) < 0 && h.indexOf('1,150,000') < 0);
  ok('[4-e] ' + n + ' HTML에 내부 메모 없음', h.indexOf('마진 21.9%') < 0);
  ok('[4-f] ' + n + ' HTML에 원가 없음', h.indexOf('4,100,000') < 0 && h.indexOf('4100000') < 0);
});
/* 🔴 **내부본을 그대로 그려도** 렌더러가 내부 칸을 읽지 않는다는 것까지 본다.
   (strip을 깜빡한 호출 경로가 생겨도 문서에는 안 나와야 한다 — 이중 방어) */
const htmlFull = Q.renderQuote(full, { company: COMPANY });
ok('[4-g] 내부본을 그려도 마진이 문서에 안 나온다',
  htmlFull.indexOf(String(SECRET)) < 0 && htmlFull.indexOf('1,150,000') < 0);

/* ═══ ⑤ 대표가 빼라고 한 것 — **없음을 잠근다** ═══ */
const allHtml = htmlPub + htmlIti + fs.readFileSync(path.join(ROOT, 'quote_doc.js'), 'utf8');
ok('[5] 카드 결제 3% UP이 없다', !/카드\s*결제시?\s*3\s*%\s*UP/i.test(htmlPub + htmlIti));
ok('[5-b] 여행사 알선수수료가 없다', !/알선수수료/.test(htmlPub + htmlIti));
ok('[5-c] 규격에 수수료 칸 자체가 없다', !/fee[A-Z]|commission/i.test(JSON.stringify(Q.blank())));

/* ═══ ⑥ 글자 안전 — 공개 입력이 그대로 렌더되던 사고가 있었다 ═══ */
const xss = Q.renderQuote({ trip: { orgName: '<img src=x onerror=alert(1)>' },
  meta: { client: '"><script>bad()</script>' } }, { company: COMPANY });
ok('[6] 태그가 실행 가능한 형태로 안 들어간다', xss.indexOf('<img src=x') < 0 && xss.indexOf('<script>bad') < 0);
ok('[6-b] 이스케이프된 형태로는 들어간다', xss.indexOf('&lt;img src=x') >= 0);

/* ═══ ⑦ 표 구조 — jsdom으로 **센다** ═══ */
const dom = new JSDOM('<!doctype html><body>' + htmlPub + '</body>');
const D = dom.window.document;

ok('[7] 화면 제목이 정확히 하나', D.querySelectorAll('h1').length === 1, '개수: ' + D.querySelectorAll('h1').length);
ok('[7-b] 제목이 「거래처명_해외연수 견적서_지역명」 형식',
  (D.querySelector('h1').textContent || '').indexOf('거래처명_해외연수 견적서_국가명_지역명') >= 0,
  D.querySelector('h1').textContent);

/* 🔴 기준 이미지의 「전 일정 포함」 — **여섯 항목에 걸친 한 칸**이다 */
const det = D.querySelector('.qd-det');
ok('[7-c] 상세 내용 표가 있다', !!det);
const merged = det ? Array.from(det.querySelectorAll('td')).filter((td) => /전 일정 포함/.test(td.textContent)) : [];
ok('[7-d] 「전 일정 포함」 칸이 딱 하나 (여러 줄로 쪼개지지 않음)', merged.length === 1, '개수: ' + merged.length);
ok('[7-e] 그 칸이 7줄에 걸쳐 있다 (기사/차량·가이드·인솔자·식사2·입장료·여행자보험)',
  merged.length === 1 && Number(merged[0].getAttribute('rowspan')) === 7,
  merged.length ? 'rowspan=' + merged[0].getAttribute('rowspan') : '');
/* 항목 칸도 같은 원리 — 식사는 두 줄이다 */
const mealTh = det ? Array.from(det.querySelectorAll('th')).find((th) => th.textContent.trim() === '식사') : null;
ok('[7-f] 「식사」 항목 칸이 두 줄에 걸쳐 있다', !!mealTh && Number(mealTh.getAttribute('rowspan')) === 2,
  mealTh ? 'rowspan=' + mealTh.getAttribute('rowspan') : '없음');
/* 항공 비고 「LCC」는 편명 줄 + 각주 줄 = 2줄 */
const lcc = det ? Array.from(det.querySelectorAll('td')).find((td) => td.textContent.trim() === 'LCC') : null;
ok('[7-g] 「LCC」가 편명 줄과 각주 줄에 걸쳐 있다', !!lcc && Number(lcc.getAttribute('rowspan')) === 2,
  lcc ? 'rowspan=' + lcc.getAttribute('rowspan') : '없음');

/* 열 수가 안 맞으면 표가 조용히 어긋난다 — 모든 줄의 칸 수 합이 같아야 한다 */
function widthOf(tr) {
  return Array.from(tr.children).reduce((s, c) => s + (Number(c.getAttribute('colspan')) || 1), 0);
}
['qd-ov', 'qd-opt'].forEach((cls) => {
  const t = D.querySelector('.' + cls);
  if (!t) { ok('[7-h] ' + cls + ' 표가 있다', false); return; }
  const rows = Array.from(t.querySelectorAll('tr'));
  /* rowspan이 걸린 줄은 칸이 모자라 보이는 게 정상이다 — **격자를 직접 채워** 센다 */
  const grid = []; let bad = null;
  rows.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(tr.children).forEach((cell) => {
      while (grid[r][c]) c++;
      const cs = Number(cell.getAttribute('colspan')) || 1;
      const rs = Number(cell.getAttribute('rowspan')) || 1;
      for (let i = 0; i < rs; i++) { grid[r + i] = grid[r + i] || []; for (let j = 0; j < cs; j++) grid[r + i][c + j] = 1; }
      c += cs;
    });
  });
  grid.forEach((row, r) => { if (row.filter(Boolean).length !== 6) bad = '줄 ' + (r + 1) + '이 ' + row.filter(Boolean).length + '칸'; });
  ok('[7-h] ' + cls + ' 모든 줄이 6칸', !bad, bad || '');
});

/* ═══ ⑧ 담당자 공란 — 조용히 감추지 않는다 ═══ */
ok('[8] 담당자가 비면 「미입력」이 보인다', /미입력/.test(htmlPub));
const filled = Q.renderQuote(Object.assign(fixture(), { meta: Object.assign(fixture().meta,
  { staffName: '홍길동', staffTel: '010-0000-0000', staffEmail: 'a@b.com' }) }), { company: COMPANY });
ok('[8-b] 채우면 「미입력」이 사라진다', !/미입력/.test(filled));
ok('[8-c] 채운 값이 문서에 나온다', /홍길동/.test(filled) && /a@b\.com/.test(filled));

/* ═══ ⑨ 일정표 — 비었을 때 **다음 행동**을 말한다 (CLAUDE.md 화면 규칙 2) ═══ */
const emptyIti = Q.renderItinerary({ trip: { days: 3 } }, { company: COMPANY });
ok('[9] 일정이 없으면 그 사실을 말한다', /아직 일정이 없습니다/.test(emptyIti));
ok('[9-b] 「없습니다」로 끝내지 않고 무엇을 하면 되는지 말한다', /적으면|입력/.test(emptyIti));
ok('[9-c] 일정이 있으면 DAY가 나온다', /DAY 1/.test(htmlIti) && /아쿠아마린 리조트/.test(htmlIti));
/* 🔴 요구 3: 「같은 일정을 두 번 작성하는 구조는 만들지 않는다」 —
   견적서와 일정표가 **같은 `doc.itinerary`**를 읽는지 확인한다. */
const src = fs.readFileSync(path.join(ROOT, 'quote_doc.js'), 'utf8');
ok('[9-d] 일정 입력 칸이 규격에 하나뿐',
  (src.match(/itinerary:\s*\[\]/g) || []).length === 1, '개수: ' + (src.match(/itinerary:\s*\[\]/g) || []).length);

/* ═══ ⑩ 스타일 — 안 읽히는 글자를 만들지 않는다 (CLAUDE.md YA) ═══ */
const css = fs.readFileSync(path.join(ROOT, 'quote_doc.css'), 'utf8');
function lum(hex) {
  const v = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(v.substr(i, 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const optColor = (css.match(/--qd-opt:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
ok('[10] 선택 옵션 색을 찾았다', !!optColor, optColor || '');
ok('[10-b] 선택 옵션 줄의 흰 글자가 4.5:1 이상', optColor && ratio(optColor, '#FFFFFF') >= 4.5,
  optColor ? ratio(optColor, '#FFFFFF').toFixed(2) + ':1' : '');
const redColor = (css.match(/--qd-red:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
ok('[10-c] 불포함내역 빨강이 흰 바탕에서 4.5:1 이상', redColor && ratio(redColor, '#FFFFFF') >= 4.5,
  redColor ? ratio(redColor, '#FFFFFF').toFixed(2) + ':1' : '');
ok('[10-d] opacity로 흐리게 만들지 않는다', !/opacity:\s*0?\.\d/.test(css));
ok('[10-e] 글자 크기가 11px 아래로 안 내려간다',
  !(css.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) || []).some((m) => parseFloat(m.replace(/[^\d.]/g, '')) < 11));
ok('[10-f] 인쇄 규칙이 있다 (PDF가 곧 인쇄다)', /@media print/.test(css) && /break-inside/.test(css));

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' 견적서 공통 모듈 — quote_doc.js / quote_doc.css');
console.log('══════════════════════════════════════════════════════════════════');
fails.forEach((f) => console.log(' ✗ ' + f));
if (!fails.length) console.log(' ✓ 전부 통과');
console.log(`결과: ${pass} pass / ${fails.length} fail`);
process.exit(fails.length ? 1 : 0);

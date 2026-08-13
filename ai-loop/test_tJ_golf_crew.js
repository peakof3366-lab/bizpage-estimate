/* TJ 검증 — **관광조와 골프조**: 견적서에서 읽는 쪽과 견적을 내는 쪽 둘 다

   사장님 2026-08-13: 「관광조가 있고 골프조가 있어. 이럴 경우에 앞뒤로 다 따져서 추출하고,
   골프조가 없는 견적서는 그 내용을 제외시켜서 값을 출력하게. 그리고 처음 견적산출 할 때도
   그 부분을 염두한 파이프라인을 구축해 줘.」

   ## 왜 틀렸었나 — **식비·관광비만 1인당으로 나누는데, 분모가 언제나 전체 인원이었다**

   견적서는 한 조만의 비용을 그렇게 적어 둔다(코퍼스 46건에서 조 표기가 있는 것 5건):

     글로벌/카자흐스탄  「관광지 케이블카·박물관 $99 × **5명**  Only 관광조」
     한화 뉴퍼스트/다낭 「바나힐 50,750 × **3명**  관광조 3명 기준」
                        「2일 조식(클럽식) 29,000 × **23명**  골프조만」
     신한/발리          「중식 자유식 $20 × **55명** 관광조」/「클럽중식 $20 × **25명** 골프조」

   카자흐스탄 관광비:  722,700 ÷ **32명**(전원) = 22,584
                       722,700 ÷  **5명**(관광조) = 144,540   ← 실제로 관광을 한 사람 기준
   6배 넘게 어긋나고, 그 값이 그 목적지 실측 중앙값이 되어 **고객 견적까지 간다.**

   ## 손대면서 실제로 틀렸던 것 — 조 인원을 문서에서 하나로 뽑으려 한 것

   조 표시가 붙은 줄들의 headCount 최댓값을 그 조 인원으로 삼았더니:
     「기사 식사 $15 **12** 1 관광조」 → 12를 관광조 인원으로 셌다 (12는 **끼니 횟수**)
     「차량(대형/**5**일간) $364 5 1 골프조」 → 5를 골프조 인원으로 셌다 (5는 **일수**)
   한 조의 인원을 문서가 한 곳에 적어 두지 않아서, 여러 줄에서 모으면 인원이 아닌 수가
   반드시 섞인다(SF의 「인원을 박수로 센다」와 같은 자리다).
   → **줄마다 그 줄의 수로 나눈다.** 그 줄 안에서 완결되어 다른 줄에 오염되지 않는다.

   실행: node ai-loop/test_tJ_golf_crew.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const X = require('../api/_lib/pdf_extract.js');
const DATA = require('../data.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 합성 표 — 실제 견적서의 모양만 옮긴다(코퍼스 PDF는 저장소에 넣지 않는다). */
let ln = 0;
const at = (pairs) => {
  const o = { page: 1, y: 700 - ln * 10, idx: ln, cells: pairs.map(([x, s]) => ({ s: String(s), x })), text: '' };
  o.text = o.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return o;
};
/* 라벨 | 단가 | 횟수 | 인원 | 총액 | 비고  — 하나투어·EnBT 계열의 흔한 열 구성 */
const row = (label, unit, times, qty, total, note) => at([
  [60, label], [160, String(unit)], [230, String(times)], [270, String(qty)],
  [330, String(total)], [420, note || ''],
]);

/* ══ [1] 조 표시를 읽는가 ══════════════════════════════════════════════════ */
console.log('[1] 비고의 조 표시를 읽는가');
{
  ln = 0;
  const lines = [
    at([[60, '인 원'], [160, '30']]),
    row('1일 중식', '20,000', '1', '30', '600,000', ''),
    row('2일 중식', '25,000', '1', '10', '250,000', '관광조'),
    row('2일 클럽중식', '40,000', '1', '20', '800,000', '골프조'),
    row('기사 경비', '28,000', '4', '1', '112,000', '(미포함)관광조 추가시 인원 추가'),
  ];
  const r = X.readOneBlock(lines, {}, null);
  const by = (t) => (r.candidates || []).find((c) => c.total === t);
  ok('조 표시가 없는 줄은 소속이 없다', by(600000) && by(600000).crew === null);
  ok('「관광조」를 읽는다', by(250000) && by(250000).crew === 'tour', String(by(250000) && by(250000).crew));
  ok('「골프조」를 읽는다', by(800000) && by(800000).crew === 'golf', String(by(800000) && by(800000).crew));
  /* ⚠ 실측(한화/다낭)에서 실제로 있던 비고다. 「관광조를 추가하면」이라는 **가정**이지
     그 줄이 관광조 전용이라는 뜻이 아니다 — 붙이면 엉뚱한 줄에 분모가 걸린다. */
  ok('**「추가시」 같은 가정문은 조 표시가 아니다**', by(112000) && by(112000).crew === null,
    String(by(112000) && by(112000).crew));
  ok('조가 갈린 문서라고 판정한다', r.crews && r.crews.split === true, JSON.stringify(r.crews));
}

/* ══ [2] 분모가 그 조 인원이 되는가 ═══════════════════════════════════════ */
console.log('\n[2] 한 조만의 비용을 전원으로 나누지 않는가');
{
  ln = 0;
  /* 카자흐스탄의 모양: 전원 30명인데 관광은 관광조 5명만 갔다 */
  const lines = [
    at([[60, '인 원'], [160, '30']]),
    row('1일 중식', '20,000', '1', '30', '600,000', ''),
    row('2일 중식', '20,000', '1', '30', '600,000', ''),
    row('관광지 케이블카', '144,540', '1', '5', '722,700', 'Only 관광조'),
  ];
  const r = X.readOneBlock(lines, {}, null);
  /* 722,700 ÷ 5 = 144,540 (예전에는 ÷30 = 24,090이었다) */
  ok('관광조 전용 줄은 **그 줄 인원**으로 나눈다', r.values.sight === 144540, String(r.values.sight));
  ok('  ↑ 전원으로 나눈 값이 아니다', r.values.sight !== Math.round(722700 / 30), String(r.values.sight));
  ok('식은 분모가 여럿임을 밝힌다',
    /줄마다 그 조 인원으로 나눠/.test(String(r.evidence.sight.calc)), String(r.evidence.sight.calc));
}

/* ══ [3] 골프조 전용 줄이 일반 요율에서 빠지는가 ══════════════════════════ */
console.log('\n[3] 골프조 전용 비용이 일반 요율에 섞이지 않는가');
{
  ln = 0;
  const lines = [
    at([[60, '인 원'], [160, '30']]),
    row('1일 중식', '20,000', '1', '30', '600,000', ''),
    row('2일 중식', '20,000', '1', '30', '600,000', ''),
    row('2일 클럽중식', '40,000', '1', '20', '800,000', '골프조'),
  ];
  const r = X.readOneBlock(lines, {}, null);
  const calc = String(r.evidence.meal.calc);
  ok('골프조 전용 끼니는 식비 합에서 빠진다', calc.indexOf('800,000') < 0 && calc.indexOf((600000 + 600000).toLocaleString()) >= 0, calc);
  /* ⚠ 조용히 버리지 않는다 — 얼마를 왜 뺐는지 화면이 말할 수 있어야 한다 */
  ok('**얼마를 왜 뺐는지 남는다**', /골프조 전용 식사 800,000원은 뺐습니다/.test(String(r.evidence.meal.note)),
    String(r.evidence.meal.note));
  ok('빠진 줄도 후보 목록에는 남는다', (r.candidates || []).some((c) => c.total === 800000 && c.crew === 'golf'));
}

/* ══ [4] 단가 항목은 조로 바꾸지 않는가 ══════════════════════════════════
   ⚠ 이 경계를 넓히면 값이 나빠진다. 실측(카자흐스탄): 골프조 대형버스 $364 /
     관광조 밴 $120인데, 골프조를 빼면 **밴이 대형버스 단가**가 된다.
     요율의 vehicle_large는 '대당 1일' 단가라 어느 조가 탔든 그 지역 단가다. */
console.log('\n[4] 차량·가이드 단가는 조로 빼지 않는가 (경계 지키기)');
{
  ln = 0;
  const lines = [
    at([[60, '인 원'], [160, '30']]),
    row('1일 중식', '20,000', '1', '30', '600,000', ''),
    row('2일 중식', '20,000', '1', '30', '600,000', ''),
    row('차량(대형/5일간)', '530,000', '5', '1', '2,650,000', '골프조'),
    row('차량(밴/2일간)', '175,000', '5', '1', '875,000', '관광조'),
  ];
  const r = X.readOneBlock(lines, {}, null);
  ok('골프조 대형버스가 차량 단가로 남는다 (밴으로 떨어지지 않는다)',
    r.values.vehicle === 530000, String(r.values.vehicle));
}

/* ══ [5] 골프비 — 1인 1회 라운딩 ═════════════════════════════════════════ */
console.log('\n[5] 골프비를 값으로 만드는가 (1인 1회 라운딩)');
{
  ln = 0;
  /* 고은회 제주도의 모양: 21명 중 18명이 3회 라운딩 */
  const lines = [
    at([[60, '인 원'], [160, '21']]),
    row('1일 중식', '20,000', '1', '21', '420,000', ''),
    row('2일 중식', '20,000', '1', '21', '420,000', ''),
    row('오라 CC', '175,000', '1', '18', '3,150,000', ''),
    row('라헨느 C.C', '175,000', '1', '18', '3,150,000', ''),
    row('그린필드 CC', '175,000', '1', '18', '3,150,000', ''),
  ];
  const r = X.readOneBlock(lines, {}, null);
  ok('골프비가 1인 1회 단가로 나온다', r.values.golf === 175000, String(r.values.golf));
  ok('  ↑ 전원(21명)이 아니라 그 줄 인원(18명)으로 나눈다',
    r.values.golf !== Math.round(9450000 / 21 / 3), String(r.values.golf));
  ok('  ↑ 3회를 1회로 뭉치지 않는다', r.evidence.golf && /3회/.test(r.evidence.golf.calc), String(r.evidence.golf && r.evidence.golf.calc));
  ok('골프는 관광비에 안 섞인다', r.values.sight === null || r.values.sight === 0, String(r.values.sight));
}

/* ══ [5-b] 라운딩 줄이 없으면 값을 만들지 않는가 ═════════════════════════
   ⚠ 실측(한화 뉴퍼스트/다낭): 골프로 분류된 줄이 「캐디팁」·「골프조 인식표」·
     「빈펄CC 그늘집 등」뿐이고 정작 그린피 줄이 없다. 1회로 세면 딸린 비용만 더해
     1인 1회 **510,400원**이 나가는데 그 문서에 적힌 라운딩 요금이 아니다.
     **빈칸이 틀린 값보다 낫다**(2026-08-10 대표 방침). */
console.log('\n[5-b] 라운딩 줄이 없으면 골프 단가를 지어내지 않는가');
{
  ln = 0;
  const lines = [
    at([[60, '인 원'], [160, '26']]),
    row('1일 중식', '20,000', '1', '26', '520,000', ''),
    row('2일 중식', '20,000', '1', '26', '520,000', ''),
    row('캐디팁', '21,750', '2', '23', '1,000,500', '팁 포함'),
    row('골프 인식표', '2,900', '1', '26', '75,400', '네임텐트 X'),
  ];
  const r = X.readOneBlock(lines, {}, null);
  ok('딸린 비용만 있으면 골프 단가를 비운다', r.values.golf === null, String(r.values.golf));
}

/* ══ [6] 조 표기가 없는 문서를 건드리지 않는가 ═══════════════════════════
   ⚠ 46건 중 41건은 조 표기가 아예 없다. 「골프」라는 낱말이 있다고 조가 갈린 것이 아니다. */
console.log('\n[6] 조 표기가 없으면 예전과 똑같이 계산하는가');
{
  ln = 0;
  const plain = [
    at([[60, '인 원'], [160, '20']]),
    row('1일 중식', '30,000', '1', '20', '600,000', ''),
    row('1일 석식', '40,000', '1', '20', '800,000', ''),
    row('2일 중식', '30,000', '1', '20', '600,000', ''),
    row('입장료 성산일출봉', '20,000', '1', '20', '400,000', ''),
  ];
  const r = X.readOneBlock(plain, {}, null);
  ok('조가 갈렸다고 하지 않는다', r.crews === null, JSON.stringify(r.crews));
  ok('식비는 총액 ÷ 전원 그대로다',
    String(r.evidence.meal.calc).indexOf('식사 총액') === 0, String(r.evidence.meal.calc));
  ok('관광비도 총액 ÷ 전원 그대로다', r.values.sight === Math.round(400000 / 20), String(r.values.sight));
}

/* ══ [7] 견적산출 파이프라인 — 골프 요금이 있는 목적지만 ═════════════════ */
console.log('\n[7] 골프 요금표 (data.js)');
ok('실측이 있는 목적지에만 값이 있다', Object.keys(DATA.GOLF_FEES).length >= 4);
ok('제주도 골프 요금이 있다', DATA.getGolfFee('제주도') > 0);
/* ⚠ 57곳을 추정치로 채우지 않는다 — 짐작한 값으로 견적을 내면 그 숫자가 고객에게 나간다 */
ok('**모르는 목적지는 0이다** (추정치로 채우지 않았다)', DATA.getGolfFee('파리') === 0);
ok('없는 목적지 이름에도 안전하다', DATA.getGolfFee('없는곳') === 0 && DATA.getGolfFee('') === 0);

(async () => {
  const EXPOSE = '\n;try{window.__syncGolf=syncGolfAvailability;}catch(e){}';
  const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise((r) => setTimeout(r, 120));
  const doc = window.document;
  const gbd = window.getBreakdownData;
  if (typeof gbd !== 'function') { console.log('✗ 로드 실패'); process.exit(1); }

  const setForm = (dest, pax, golfOn, golfN, rounds, days = 5) => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = '2027-05-10';
    doc.getElementById('incGolf').checked = !!golfOn;
    doc.getElementById('golfCount').value = String(golfN);
    doc.getElementById('golfRounds').value = String(rounds);
    window.__syncGolf();
    return gbd();
  };
  const golfRow = (bd) => bd.rows.find((r) => r.name === '골프');

  console.log('\n[8] 견적산출 — 골프조 인원 × 라운딩 횟수만큼만 붙는가');
  const off = setForm('제주도', 20, false, 0, 1);
  ok('골프를 안 켜면 골프 줄이 없다', !golfRow(off));

  const on = setForm('제주도', 20, true, 8, 1);
  ok('골프를 켜면 골프 줄이 생긴다', !!golfRow(on));
  ok('**전원이 아니라 골프조 인원만** 곱한다', golfRow(on) && golfRow(on).qty.indexOf('8명') === 0,
    golfRow(on) && golfRow(on).qty);
  ok('금액 = 단가 × 골프조 인원', golfRow(on) && golfRow(on).amount === on.golfUnit * 8,
    golfRow(on) && String(golfRow(on).amount));
  ok('관광조 인원은 나머지다', on.tourCount === 12, String(on.tourCount));

  const two = setForm('제주도', 20, true, 8, 2);
  ok('라운딩 2회면 정확히 두 배다', golfRow(two).amount === golfRow(on).amount * 2,
    golfRow(two).amount + ' vs ' + golfRow(on).amount);
  /* ⚠ 그린피는 코스 정찰제라 단체 볼륨 할인이 없다 — 걸면 근거 없이 싸진다 */
  const many = setForm('제주도', 80, true, 80, 1);
  ok('**인원이 늘어도 1인 단가가 깎이지 않는다** (그린피는 정찰제)',
    many.golfUnit === on.golfUnit, many.golfUnit + ' vs ' + on.golfUnit);

  console.log('\n[9] 골프 요금이 없는 목적지에서 조용히 넘어가지 않는가');
  const noFee = setForm('파리', 20, true, 8, 1);
  ok('골프 줄이 안 생긴다', !golfRow(noFee));
  /* ⚠ 숨긴 채 켜져 있으면 다시 골프 되는 목적지로 왔을 때 유령처럼 살아난다 */
  ok('**체크가 풀린다** (숨긴 채 켜 두지 않는다)', doc.getElementById('incGolf').checked === false);
  ok('골프 칩이 숨는다', doc.getElementById('incGolfChip').classList.contains('hidden'));
  ok('골프조 인원 칸도 숨는다', doc.getElementById('golfCountRow').classList.contains('hidden'));
  ok('골프 인원을 0으로 본다', noFee.golfCount === 0, String(noFee.golfCount));

  console.log('\n[10] 입력 방어');
  const over = setForm('제주도', 10, true, 999, 1);
  ok('골프조가 총원을 넘으면 총원으로 자른다', over.golfCount === 10, String(over.golfCount));
  const neg = setForm('제주도', 10, true, -5, 0);
  ok('음수 인원 → 0', neg.golfCount === 0, String(neg.golfCount));
  ok('0회 → 최소 1회', neg.golfRounds === 1, String(neg.golfRounds));
  ok('골프조 0명이면 줄을 만들지 않는다', !golfRow(neg));

  console.log('\n[11] 골프가 다른 항목을 건드리지 않는가');
  const base = setForm('제주도', 20, false, 0, 1);
  const withGolf = setForm('제주도', 20, true, 8, 1);
  const amt = (bd, n) => { const r = bd.rows.find((x) => x.name === n); return r ? r.amount : 0; };
  ['항공', '유류할증료', '식사', '관광'].forEach((n) => {
    ok(`${n}는 골프와 무관하게 그대로다`, amt(base, n) === amt(withGolf, n),
      amt(base, n) + ' vs ' + amt(withGolf, n));
  });
  ok('총액은 골프비만큼만 늘어난다',
    withGolf.baseTotal - base.baseTotal === golfRow(withGolf).amount,
    (withGolf.baseTotal - base.baseTotal) + ' vs ' + golfRow(withGolf).amount);

  dom.window.close();

  /* ══ [12] 관리자 화면이 조 편성을 실제로 말하는가 (jsdom 실제 렌더) ═══════
     ⚠ **금액이 달라지는 구역이다.** 담당자가 이 문서가 왜 다르게 계산됐는지 모르면
       값을 의심하고 손으로 되돌려 버린다. 조용한 계산 변경은 조용한 폴백만큼 위험하다. */
  console.log('\n[12] 관리자 화면이 조 편성을 말하는가');
  {
    const { htmlWithDeps } = require('./_jsdom_deps');
    const EXPOSE = '\n;try{window.__renderCrews=renderPdfCrews;}catch(e){}\n';
    let injected = false;
    const html = htmlWithDeps('admin.html').replace(
      /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (m, open, code, close) => {
        if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
        return m;
      });
    const d2 = new JSDOM(html, {
      runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(w) {
        w.fetch = () => new Promise(() => {});
        const c = new Proxy({}, { get: () => (() => c) });
        w.HTMLCanvasElement.prototype.getContext = () => c;
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.Element.prototype.scrollTo = function () {};
        w.confirm = () => true; w.alert = () => {};
      },
    });
    await new Promise((r) => setTimeout(r, 250));
    const w2 = d2.window;
    ok('화면에 조 편성을 그리는 자리가 있다', typeof w2.__renderCrews === 'function');
    if (typeof w2.__renderCrews === 'function') {
      const box = w2.document.createElement('div');
      w2.__renderCrews(box, {
        crews: { split: true, tourSize: 5, golfSize: 0, tourRows: 2, golfRows: 3, golfOnlyCost: 800000 },
      });
      const t = box.textContent;
      ok('관광조·골프조로 나뉜다고 말한다', /관광조와 골프조로 나뉩니다/.test(t), t.slice(0, 80));
      ok('관광조 인원을 밝힌다', /관광조 5명/.test(t), t.slice(0, 90));
      ok('**분모를 바꿨다는 것을 말한다**', /그 줄이 대상으로 한 인원/.test(t));
      ok('**골프조 전용으로 뺀 금액을 밝힌다**', /800,000원.*뺐습니다/.test(t), t);
      ok('차량·가이드는 안 나눈다고 밝힌다', /단가는 조로 나누지 않습니다/.test(t));

      /* ⚠ 조가 안 갈린 문서에서는 **아무것도 그리지 않아야** 한다 — 46건 중 41건이 그렇다.
         늘 뜨는 안내는 곧 아무도 안 읽는다(TF에서 문턱을 3곳으로 잡은 것과 같은 이유). */
      const empty = w2.document.createElement('div');
      w2.__renderCrews(empty, { crews: null });
      ok('조가 안 갈린 문서에는 아무것도 안 그린다', empty.textContent === '', empty.textContent);
    }
    d2.window.close();
  }

  /* ══ [14] 골프 실측이 **끝까지 흐르는가** ═══════════════════════════════════
     골프 요금은 손이 닿아야 하는 자리가 많다. 한 곳만 빠뜨리면 **그 자리에서만 조용히**
     빠진다 — 저장은 되는데 제안에 안 뜨거나, 환율 되돌리기가 안 되거나, 확정이
     엉뚱한 컬럼에 쓰인다. 그래서 배선을 통째로 고정한다(결함 생성기 ①). */
  console.log('\n[14] 골프 실측 배선 — 한 곳이라도 빠지면 조용히 샌다');
  const apiQuotes = read(path.join('api', 'quotes.js'));
  const apiRates = read(path.join('api', 'rates.js'));
  const adminSrc = read('admin.html');
  const migSrc = read(path.join('ai-loop', 'db_migrate.js'));

  ok('마이그레이션이 additive다 (golf_unit)',
    /alter table actual_price_reports add column if not exists golf_unit numeric/.test(migSrc));
  ok('제출이 golfUnit을 받는다', /golfUnit/.test(apiQuotes));
  ok('INSERT가 golf_unit을 쓴다', /golf_unit, sell_price_unit/.test(apiQuotes));
  ok('조회가 golfUnit을 내려준다', /golfUnit: num\(r\.golf_unit\)/.test(apiQuotes));
  /* ⚠ 맨 아래 else는 sell 전용이다. 골프 갈래가 그 위에 없으면 **골프 확정값이 판매가
     칸에 쓰인다** — 값도 잃고 판매가도 망가지는데 오류는 안 난다. */
  ok('**확정 갈래에서 골프가 sell보다 위에 있다** (아니면 판매가 칸에 쓰인다)',
    apiQuotes.indexOf("field === 'golf'") > 0
    && apiQuotes.indexOf("field === 'golf'") < apiQuotes.indexOf('set sell_price_unit'));
  ok('확정 API가 golf 컬럼을 안다', /golf: 'golf_unit'/.test(apiQuotes));
  ok('확정 API가 golf 상한을 안다', /golf: GOLF_UNIT_MAX/.test(apiQuotes));

  /* ⚠ golf_fee를 NUMERIC_FIELDS에 넣으면 **새 목적지를 만들 수 없게 된다** —
     그 집합은 isValidNewDestination이 「반드시 있어야 하는 칸」으로도 쓴다. */
  ok('**golf_fee는 필수 칸 목록(NUMERIC_FIELDS)에 없다** (새 목적지 생성이 막힌다)',
    !/'sightseeing_fee', 'margin_per_traveler',\s*'golf_fee'/.test(apiRates)
    && /OPTIONAL_NUMERIC_FIELDS = new Set\(\['golf_fee'\]\)/.test(apiRates));
  ok('그래도 고칠 수는 있다 (isValidChange가 받는다)',
    /NUMERIC_FIELDS\.has\(c\.field\) \|\| OPTIONAL_NUMERIC_FIELDS\.has\(c\.field\)/.test(apiRates));
  /* ⚠ 상한 초과를 findOutOfRange가 못 보면 400이 아니라 **조용히 버려진다** */
  ok('상한을 넘기면 조용히 버리지 않고 되돌려준다',
    /NUMERIC_FIELDS\.has\(c\.field\) \|\| OPTIONAL_NUMERIC_FIELDS\.has\(c\.field\)\)[\s\S]{0,200}FIELD_MAX/.test(apiRates));
  ok('골프 요금에 오타 상한이 있다', /golf_fee: 1500000/.test(apiRates));

  /* 화면 쪽 — 세 표에 **다 있어야** 한다 */
  ok('제출 칸이 있다 (pr-golf)', /id="pr-golf"/.test(adminSrc));
  ok('방식을 바꿀 때 비우는 가격 칸에 들어 있다', /'pr-sight', 'pr-golf', 'pr-sell'/.test(adminSrc));
  ok('환율 되돌리기 표에 있다 (REPORT_FX_KEY)', /sightseeing_fee: 'sight', golf_fee: 'golf'/.test(adminSrc));
  ok('제보값 표에 있다 (REPORT_VALUE_KEY)', /golf_fee: 'golfUnit'/.test(adminSrc));
  ok('**갱신 제안이 골프를 본다**', /RATE_SUGGEST_REPORT_FIELDS[\s\S]{0,400}golf_fee: 'golfUnit'/.test(adminSrc));
  ok('요율 관리 화면에 골프 칸이 있다', /golf_fee: '골프\(1인 1회\)'/.test(adminSrc));
  ok('확인 필요 목록이 골프를 본다', /key: 'golf', rate: 'golf_fee'/.test(adminSrc));

  /* ══ [13] 실제 코퍼스에서 몇 건이 걸리는가 — 오탐 수를 테스트가 고정한다 ══
     ⚠ 견적서 폴더는 저장소 밖이라 **없을 수 있다.** 없으면 건너뛴다(실패로 만들지 않는다). */
  const CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
  if (fs.existsSync(CORPUS)) {
    const pdfParse = require('pdf-parse');
    const split = [], golfVals = [];
    for (const f of fs.readdirSync(CORPUS).filter((x) => x.toLowerCase().endsWith('.pdf')).sort()) {
      try {
        const r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {});
        if (r.crews && r.crews.split) split.push(f.slice(0, 40));
        if (r.values && r.values.golf) golfVals.push(f.slice(0, 26) + '=' + r.values.golf);
      } catch (e) { /* 못 읽는 문서는 이 테스트의 대상이 아니다 */ }
    }
    console.log('\n[13] 코퍼스 실측 — 조가 갈린 견적서 ' + split.length + '건 · 골프 단가가 나온 견적서 ' + golfVals.length + '건');
    split.forEach((f) => console.log('    조 · ' + f));
    golfVals.forEach((f) => console.log('    골프 · ' + f));
    /* ⚠ 이 수가 크게 늘면 「관광조」·「골프조」가 아닌 것을 조 표시로 읽고 있다는 뜻이다.
       늘어야 할 이유가 생기면 여기를 고치되 **왜 늘었는지 세어 보고** 고칠 것. */
    ok('조가 갈렸다고 판정한 견적서가 6건을 넘지 않는다 (오탐이 늘면 값이 조용히 바뀐다)',
      split.length <= 6, String(split.length));
    /* ⚠ 골프 단가는 라운딩 줄이 확인될 때만 나온다 — 딸린 비용만 있는 문서는 비운다 */
    ok('골프 단가가 나온 견적서가 있다 (기능이 실제로 도는지)', golfVals.length >= 3, String(golfVals.length));
    ok('골프 단가가 전부 그럴듯한 범위다 (10만~50만, 1인 1회)',
      golfVals.every((s) => { const v = Number(s.split('=')[1]); return v >= 100000 && v <= 500000; }),
      golfVals.join(' · '));
  } else {
    console.log('\n  (견적서 코퍼스가 없어 실측 검사는 건너뜁니다: ' + CORPUS + ')');
  }

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

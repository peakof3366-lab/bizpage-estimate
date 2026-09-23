/* ═══════════════════════════════════════════════════════════════════════════
   견적 관리 — **내부직원용에서 만든 견적서가 그대로 유지되는가**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-17 대표: 「자동 견적 산출(내부직원용)에서 내용을 입력하고 저장한 다음
   견적 관리로 가서 보면, 그 견적서 양식이 그대로 유지되면 좋겠다.」

   ■ 재 보니 — **유지는 이미 되고 있었다**
   발급하면 `quotes.payload.doc`이 그대로 서버로 가고, 서버가 원가·마진을 지워
   고객 링크에 싣는다(`estimate-view.html`은 `doc`이 있으면 v2 경로로 그린다).
   없던 것은 **담당자가 그걸 확인할 자리**였다.

   ■ 🔴 그리고 화면이 **큰 소리로 틀린 말**을 하고 있었다
   발급을 누르면 「이 일정이 고객에게 나갑니다」라며 **목적지 공통 코스**를 보여 줬다.
   실제로 나가는 것은 담당자가 ④단계에 적은 문서의 일정이고, 공통 코스는 `doc`이
   있으면 **한 줄도 안 나간다.** 확인하라고 띄운 창이 다른 것을 보여 주고 있었다.
   조용한 폴백(결함 생성기 ②)의 반대 꼴이라 더 나쁘다 — 담당자는 확인했다고 믿는다.

   ■ 이 검사가 지키는 것
   ① 문서가 붙은 견적은 상세에서 **고객이 받는 그대로** 보인다(원가·마진 없이).
   ② 안내줄과 발급 확인창이 **실제로 나가는 것**을 말한다.
   ③ 문서가 없는 옛 견적은 **예전 그대로** 돈다(고객 손에 이미 나간 링크가 있다).
   ④ 🔴 발급 요청에 문서가 실제로 실린다 — 「유지된다」의 증명이다.
   ⑤ 🔴 **여기서 견적서를 다시 그리지 않는다** — 그리는 곳은 `quote_doc.js` 하나다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage } = require('./_page_boot.js');
const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const 기본견적 = {
  id: 'q-doc-1', ts: new Date().toISOString(),
  destination: '다낭', destKey: '다낭', destLabel: '다낭',
  participants: 30, days: 4, nights: 3, total: 56696074, perPerson: 1889869,
  orgName: '[가상] 새롬물산', contact: '[가상] 김담당', contactTel: '010-1234-5678',
  status: 'new', basis: 'engine', startDate: '2027-05-10',
  /* 🔴 **원가와 판매가를 다르게 둔다.** 예전엔 `visibleTotal`이 없어 원가 = 판매가였고,
     그 상태에서는 「판매가 배분을 원가에 맞추는」 고장을 넣어도 검사가 **그대로 통과했다**
     (실측: 고장 주입 → 53 pass). 자가 아무것도 증명하지 못하는 상태였다.
     ⚠ 합(35,000,000)과 `visibleTotal`을 맞춰 둔다 — 둘이 어긋나면 검사가 무엇을 재는지
       사람이 못 읽는다. */
  items: [{ name: '항공', amount: 20000000 }, { name: '호텔', amount: 15000000 }],
  visibleTotal: 35000000,
};

/* 내부직원용이 저장하는 모양 그대로 — `_internal`에 원가·마진이 들어 있다.
   🔴 이 값이 화면에 비치면 안 된다(담당자는 봐도 되지만, 이 칸이 묻는 것은
     「고객이 무엇을 받는가」다). */
const 문서 = {
  meta: { client: '[가상] 새롬물산', staffName: '[가상] 김담당', title: '견적서' },
  trip: { pax: 30, days: 4, nights: 3 },
  price: { lines: [{ kind: 'adult', label: '성인', unit: 1889869, qty: 30 }], total: 56696074 },
  details: [
    { label: '항공', rows: [{ left: '에어서울', right: 'ICN-DAD', note: '' }], footnotes: [] },
    { label: '가이드', rows: [{ text: '10년 이상 경력의 한국인 우수가이드', note: '전 일정 포함' }], footnotes: [] },
  ],
  itinerary: [
    { day: 1, title: '인천 → 다낭', am: '출발', pm: '도착', eve: '환영 만찬', meals: {}, stay: '', note: '' },
    { day: 2, title: '산업 시찰', am: '공단 방문', pm: '간담회', eve: '자유', meals: {}, stay: '', note: '' },
  ],
  _internal: { source: 'engine', cost: 40000000, margin: 16696074, memo: '내부 메모 — 원가 기준' },
};

async function 태우기(견적) {
  const fx = adminFixtures('filled');
  const orig = fx.route;
  const 보낸것 = [];
  fx.route = function (u, opt, json) {
    const s = String(u);
    if (s.includes('/api/quotes') && !s.includes('quote-shares')) return json([견적]);
    if (s.includes('quote-shares?action=issue')) {
      보낸것.push(JSON.parse((opt && opt.body) || '{}'));
      return json({ id: 'share-1', url: 'https://x/estimate-view.html?id=share-1', quoteNo: 'Q-1' });
    }
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin.html', { fixtures: fx });
  await B.ready;
  await enterDashboard(B);
  await B.tick(350);
  const 물은것 = [];
  B.win.confirm = (m) => { 물은것.push(String(m)); return true; };
  B.win.alert = (m) => { 물은것.push('[알림] ' + String(m)); };
  B.win.prompt = () => '010-1234-5678';

  /* 목록의 「상세」 버튼이 부르는 그 함수를 문서 안에서 부른다
     (바깥에서 win.eval로 부르면 페이지의 최상위 스코프가 안 보인다). */
  const s = B.doc.createElement('script');
  s.textContent = "openEstDetail('" + 견적.id + "');";
  B.doc.body.appendChild(s);
  await B.tick(250);
  return { B, 보낸것, 물은것 };
}

(async () => {
  /* ═══ ① 화면이 견적서를 그릴 재료를 싣는가 ═══════════════════════════════
     🔴 하나라도 빠지면 미리보기가 **조용히 빈 칸**이 된다. */
  const ADMIN = read('admin.html');
  ok('[1] admin.html이 quote_doc.js를 싣는다', /<script src="quote_doc\.js">/.test(ADMIN));
  ok('[1-b] 회사 정보도 싣는다 (머리글이 빈다)', /<script src="company-info\.js">/.test(ADMIN));
  ok('[1-c] 문서 전용 CSS도 싣는다', /href="quote_doc\.css"/.test(ADMIN));
  /* ⑤ 그리는 곳은 하나다 — 관리자 조각이 문서 마크업을 직접 만들면 두 벌이 된다 */
  const EST = read('admin/estmgr.js');
  ok('[1-d] 🔴 estmgr.js가 견적서를 다시 그리지 않는다',
    !/class="qd|<article class="qd/.test(EST), '문서 마크업이 여기에도 생겼다');
  ok('[1-e] 대신 공통 모듈을 부른다', /QuoteDoc\.renderQuote/.test(EST) && /QuoteDoc\.renderItinerary/.test(EST));

  /* ═══ ②-2 🔴 세부견적서가 붙은 견적 — **화면으로** 확인한다 ═══════════════
     [2-d2~d4]는 글자로 잰다. 글자만 재면 「부르긴 부르는데 안 그려진다」를 못 잡는다
     (이 저장소가 여러 번 당한 자리다). 여기서는 **모달을 띄워 장수를 센다.** */
  {
    const 문서B = JSON.parse(JSON.stringify(문서));
    문서B.breakdown = { rows: [
      { name: '항공', amount: 30000000 }, { name: '호텔', amount: 16696074 },
      { name: '식사', amount: 10000000 },
    ] };
    const { B } = await 태우기(Object.assign({}, 기본견적, { doc: 문서B }));
    const D = B.doc;
    const prev = D.getElementById('em-doc-prev');
    ok('[2-f] 🔴 세부견적서까지 **세 장**이 그려진다',
      prev.querySelectorAll('.qd').length === 3, String(prev.querySelectorAll('.qd').length) + '장');
    ok('[2-g] 세부 견적 내역 표가 실제로 있다', /세부 견적 내역/.test(prev.textContent || ''));
    /* 🔴 체크를 끄면 그 자리에서 사라져야 한다 — 안 사라지면 담당자가 나가는 줄 안다 */
    const cb = D.getElementById('emPartBd');
    ok('[2-h] 체크 칸이 모달에 있다', !!cb);
    if (cb) {
      cb.checked = false;
      cb.dispatchEvent(new B.win.Event('change', { bubbles: true }));
      await B.tick(120);
      ok('[2-i] 🔴 체크를 끄면 두 장으로 준다',
        prev.querySelectorAll('.qd').length === 2, String(prev.querySelectorAll('.qd').length) + '장');
      ok('[2-j] 「안 나감」이라고 말한다',
        /세부견적서 안 나감/.test(D.getElementById('em-doc-state').textContent || ''),
        D.getElementById('em-doc-state').textContent);
    }
  }

  /* ═══ ② 문서가 붙은 견적 — 고객이 받는 그대로 보인다 ═══════════════════ */
  {
    const { B, 보낸것, 물은것 } = await 태우기(Object.assign({}, 기본견적, { doc: 문서 }));
    const D = B.doc;
    const prev = D.getElementById('em-doc-prev');
    const state = (D.getElementById('em-doc-state').textContent || '').trim();
    ok('[2] 문서 미리보기 자리가 있다', !!prev);
    ok('[2-b] 견적서와 일정표 두 장이 그려진다', prev.querySelectorAll('.qd').length === 2,
      String(prev.querySelectorAll('.qd').length) + '장');
    /* 🔴 2026-09-21 — 문서가 셋이 됐으므로 **셋을 다 이름으로 말한다.**
       예전엔 「일정 2일」이었는데, 세부견적서가 생긴 뒤로는 무엇이 몇 줄인지
       가려지지 않으면 담당자가 나갈 것을 못 읽는다. */
    ok('[2-c] 무엇이 들어 있는지 말한다',
      /상세 2항목/.test(state) && /세부견적서/.test(state) && /일정표 2일/.test(state), state);
    const 글 = (prev.textContent || '').replace(/\s+/g, ' ');
    ok('[2-d] 담당자가 적은 내용이 실제로 보인다', /한국인 우수가이드/.test(글) && /산업 시찰/.test(글));
    /* 🔴🔴 **세부견적서를 만들어 놓고 이 자리에 안 그리고 있었다** (2026-09-21).
       담당자가 발급 전에 보는 유일한 자리인데, 여기 없으면 「안 나가는구나」로 읽는다.
       순서는 고객 화면(롤링)과 같아야 한다 — 견적서 → 세부견적서 → 일정표. */
    ok('[2-d2] 🔴 세부견적서도 함께 그린다', /renderBreakdown/.test(EST));
    ok('[2-d3] 🔴 「고객에게 보낼 문서」 체크를 따른다',
      /applyParts\([\s\S]{0,160}parts\)/.test(EST) && /emShareParts/.test(EST));
    ok('[2-d4] 체크를 바꾸면 미리보기가 따라온다',
      /\['emPartBd', 'emPartIti'\][\s\S]{0,300}emRenderDocPreview\(rec\)/.test(EST));
    /* 🔴 여기가 핵심 — 내부 값이 비치면 안 된다 */
    ok('[2-e] 🔴 원가·마진·내부 메모가 안 보인다',
      !/내부 메모/.test(글) && !/40,000,000/.test(글) && !/16,696,074/.test(글), 글.slice(0, 120));
    /* ⚠ 2026-09-23 대표 지시 2-1로 **접이식이 사라졌다** — 이 문서가 곧 「고객용 탭」이고,
       상세를 열면 그 탭이 기본이다. 그래서 재는 것이 「접혀 있나」에서
       「**열자마자 고객용이 보이나**」로 바뀐다. */
    ok('[2-f] 열면 고객용 탭이다', D.getElementById('emModalBody').dataset.emtab === 'cust',
      D.getElementById('emModalBody').dataset.emtab);
    ok('[2-f2] 🔴 「수정하기」는 문서를 그리는 곳에 없다 (인쇄·PDF·공유 링크로 샐 수 없다)',
      !/수정하기/.test(read('quote_doc.js')));
    ok('[2-f3] 세 단락이 각각 「수정하기」를 갖는다',
      (D.querySelectorAll('#em-doc-prev .em-cust-edit button') || []).length >= 2,
      String((D.querySelectorAll('#em-doc-prev .em-cust-edit button') || []).length) + '개');
    /* 🔴 **탭이 진짜로 가리는가** — 규칙을 적어 둔 것과 실제로 덮이는 것은 다른 말이다.
       고객용일 때 원가 표(직원용)가 계산상 `display:none`이어야 한다. */
    const disp = (id) => {
      const el = D.getElementById(id);
      return el ? (B.win.getComputedStyle(el).display || '') : '(없음)';
    };
    ok('[2-f5] 🔴 고객용일 때 원가 표가 덮인다', disp('em-sec-items') === 'none', disp('em-sec-items'));
    ok('[2-f6] 고객용 칸은 보인다', disp('emTabCust') !== 'none', disp('emTabCust'));
    /* 직원용으로 넘기면 반대가 된다 */
    const s3 = D.createElement('script');
    s3.textContent = "emGotoEdit('breakdown');";
    D.body.appendChild(s3);
    await B.tick(60);
    ok('[2-f7] 🔴 수정하기가 직원용으로 데려간다',
      D.getElementById('emModalBody').dataset.emtab === 'staff');
    ok('[2-f8] 그때 원가 표가 보인다', disp('em-sec-items') !== 'none', disp('em-sec-items'));
    ok('[2-f9] 어디로 왔는지 표시한다', D.getElementById('em-sec-items').classList.contains('em-flash'));
    ok('[2-f10] 그때 고객용 칸은 덮인다', disp('emTabCust') === 'none', disp('emTabCust'));
    /* 다시 고객용으로 — 되돌아갈 수 있어야 한다 */
    const s4 = D.createElement('script');
    s4.textContent = "emSetTab('cust');";
    D.body.appendChild(s4);
    await B.tick(60);
    ok('[2-f11] 고객용으로 돌아온다', disp('em-sec-items') === 'none');

    /* ⚠ **규칙은 `admin.css`에 있다.** 처음에 admin.html의 `<style>`에 넣었는데,
       그건 **인쇄 팝업 템플릿** 안이라 모달에는 한 줄도 안 닿았다(실측: 덮이지 않았다).
       화면 규칙을 어디에 적는지도 「한 곳」이 있다. */
    ok('[2-f4] 수정하기가 인쇄에서 빠진다',
      /\.em-tabbar, \.em-cust-edit \{ display:none/.test(read('admin.css')));
    /* ═══ 💰 수익 요약 (대표 지시 2-5) ═════════════════════════════════════
       🔴 대표 확인 사항: 「수익 요약 수치가 세부견적 원가·판매가 합계와 일치하는지」.
         화면에 그려진 **글자에서 숫자를 다시 읽어** 맞춰 본다 — 계산식을 여기 다시 적으면
         같은 실수를 두 번 하게 된다(자가 코드를 베끼면 아무것도 증명하지 못한다). */
    const PS = D.getElementById('em-profit-summary');
    ok('[2-g] 수익 요약 칸이 그려졌다', !!PS && !PS.classList.contains('hidden'));
    const num = (t) => Number(String(t || '').replace(/[^0-9-]/g, '')) || 0;
    const cardOf = (k) => (PS && PS.querySelector('[data-v="' + k + '"]')
      ? PS.querySelector('[data-v="' + k + '"]').textContent : '');
    ok('[2-g2] 다섯 칸이다(판매가·원가·이익·이익률·1인당)',
      ['sell', 'cost', 'profit', 'rate', 'per'].every((k) => cardOf(k) !== ''),
      ['sell', 'cost', 'profit', 'rate', 'per'].map((k) => k + '=' + cardOf(k)).join(' '));
    const sell = num(cardOf('sell')), cost = num(cardOf('cost')), profit = num(cardOf('profit'));
    ok('[2-g3] 🔴 이익 = 판매가 − 원가', profit === sell - cost, sell + ' - ' + cost + ' vs ' + profit);
    const sold = PS ? Array.from(PS.querySelectorAll('tbody tr')).map((tr) => num(tr.children[2].textContent)) : [];
    const soldSum = sold.reduce((x, y) => x + y, 0);
    ok('[2-g4] 🔴 항목 판매가 합계 = 총 판매가', sold.length > 0 && soldSum === sell,
      soldSum + ' vs ' + sell);
    const costs = PS ? Array.from(PS.querySelectorAll('tbody tr')).map((tr) => num(tr.children[1].textContent)) : [];
    ok('[2-g5] 항목 원가가 비어 있지 않다', costs.length > 0 && costs.some((x) => x > 0));
    /* 🔴 **고객용에는 한 글자도 안 나간다** */
    const custText = (D.getElementById('emTabCust') || {}).textContent || '';
    ok('[2-g6] 🔴 고객용 칸에 「마진」·「원가」가 없다',
      !/마진|원가/.test(custText), custText.slice(0, 80));
    ok('[2-g7] 수익 요약은 직원용 쪽이다 (고객용 칸 밖)',
      !!PS && !(D.getElementById('emTabCust') || { contains: () => false }).contains(PS));
    /* 경고선은 한 곳에만 적혀 있어야 나중에 대표가 정할 때 한 번만 고친다 */
    ok('[2-g8] 이익률 경고선이 한 곳에 있다',
      (read(path.join('admin', 'estmgr.js')).split('EM_MARGIN_WARN =').length - 1) === 1);

    ok('[2-f12] 탭 가르기 규칙이 admin.css에 있다',
      /#emModalBody\[data-emtab="cust"\] > \*:not/.test(read('admin.css')));

    /* ═══ ③ 안내줄과 확인창이 **실제로 나가는 것**을 말한다 ═══════════════ */
    ok('[3] 안내줄이 문서 일정을 가리킨다',
      /견적서 문서의 일정이 나갑니다/.test(D.getElementById('em-iti-state').textContent || ''),
      D.getElementById('em-iti-state').textContent);
    ok('[3-b] 🔴 공통 코스가 나간다고 말하지 않는다',
      !/목적지 공통 일정이 나갑니다/.test(D.getElementById('em-iti-state').textContent || ''));

    const s2 = D.createElement('script');
    s2.textContent = 'issueShareLink();';
    D.body.appendChild(s2);
    await B.tick(700);
    const 창 = 물은것.join(' | ').replace(/\s+/g, ' ');
    ok('[4] 발급 확인창이 문서의 일정을 보여준다', /내부직원용에서 작성한 견적서 문서/.test(창), 창.slice(0, 120));
    ok('[4-b] 🔴 목적지 공통 코스를 보여주지 않는다', !/기본 일정 \(아직 아무도/.test(창), 창.slice(0, 160));
    ok('[4-c] 문서에 적힌 DAY가 그대로 뜬다', /인천 → 다낭/.test(창));

    /* ═══ ④ 🔴 「유지된다」의 증명 — 발급 요청에 문서가 실린다 ═══════════ */
    ok('[5] 발급 요청이 서버로 갔다', 보낸것.length === 1, String(보낸것.length));
    const body = 보낸것[0] || {};
    ok('[5-b] 🔴 저장한 문서가 그대로 실려 간다', !!(body.quote && body.quote.doc));
    ok('[5-c] 상세 항목도 그대로다', ((body.quote || {}).doc || {}).details.length === 2);
    ok('[5-d] 일정도 그대로다', ((body.quote || {}).doc || {}).itinerary.length === 2);
    B.win.close();
  }

  /* ═══ ⑤ 문서는 있는데 일정표가 빈 경우 — 공통 코스로 **물러나지 않는다** ═══
     🔴 `estimate-view.html`은 `doc`이 있으면 v2만 그린다. 즉 이때 고객은
       일정 없는 견적서를 받는다. 그 사실을 말하지 않으면 담당자는 공통 일정이
       나갔다고 믿는다. */
  {
    const 빈일정 = Object.assign({}, 문서, { itinerary: [] });
    const { B, 물은것 } = await 태우기(Object.assign({}, 기본견적, { doc: 빈일정 }));
    const D = B.doc;
    ok('[6] 일정표가 비었다고 말한다',
      /일정표 비어 있습니다/.test(D.getElementById('em-doc-state').textContent || ''),
      D.getElementById('em-doc-state').textContent);
    const s2 = D.createElement('script'); s2.textContent = 'issueShareLink();'; D.body.appendChild(s2);
    await B.tick(700);
    const 창 = 물은것.join(' | ').replace(/\s+/g, ' ');
    ok('[6-b] 🔴 「공통 일정은 나가지 않습니다」를 말한다', /공통 일정은 나가지 않습니다/.test(창), 창.slice(0, 160));
    B.win.close();
  }

  /* ═══ ⑥ 옛 견적(문서 없음) — 예전 그대로 돈다 ═══════════════════════════ */
  {
    const { B, 물은것, 보낸것 } = await 태우기(Object.assign({}, 기본견적, { id: 'q-old-1' }));
    const D = B.doc;
    ok('[7] 문서가 없으면 그렇게 말한다',
      /문서 없음/.test(D.getElementById('em-doc-state').textContent || ''),
      D.getElementById('em-doc-state').textContent);
    ok('[7-b] 빈 미리보기를 그리지 않는다', D.getElementById('em-doc-prev').children.length === 0);
    const s2 = D.createElement('script'); s2.textContent = 'issueShareLink();'; D.body.appendChild(s2);
    await B.tick(700);
    const 창 = 물은것.join(' | ').replace(/\s+/g, ' ');
    ok('[7-c] 예전처럼 목적지 코스를 보여준다', /코스 A|코스\]|일정이 실리지 않습니다/.test(창), 창.slice(0, 140));
    ok('[7-d] 발급 자체는 그대로 된다', 보낸것.length === 1 && !((보낸것[0].quote || {}).doc));
    B.win.close();
  }

  console.log('\n' + '─'.repeat(64));
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — ZW 관리 화면의 견적서 문서');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('터짐:', e); process.exit(1); });

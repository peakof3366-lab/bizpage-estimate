/* ═══════════════════════════════════════════════════════════════════════════
   XV — **담당자 견적 산출 화면**을 눌러 보는 것과, 그 화면이 요율을 못 받았을 때
   ───────────────────────────────────────────────────────────────────────────
   두 가지를 잠근다.

   ① **자가 다시 눈멀지 않게** — `admin-quote.html`은 목적지·프로그램·포함 항목을
      전부 `<label class="aq-list-row">` 줄로 고른다. 라디오·체크박스가 켜지는 것은
      `checked`(성질)라 `innerHTML`에 안 나타나고, 골라진 줄을 표시하는 것은
      CSS(`:has(input:checked)`)인데 jsdom은 스타일시트를 계산하지 않는다.
      → 처음 돌렸을 때 **고르는 줄 27개가 전부 「눌러도 아무 일도 안 난다」**로 세어졌다.
      없는 결함 27개는 소음이 아니라 **진짜 죽은 줄이 생겼을 때 묻히게 만드는 것**이다.

   ② 🔴 **요율을 못 받고 계산된 금액인지 결과 카드가 말하는가** — 경고는 있었지만
      화면 **맨 위**에만 붙었다. 담당자가 「견적서 받기」를 누르는 자리는 맨 아래고,
      그때 배너는 화면 밖이다. 금액은 그 사이 조용히 달라져 있다(XI 실측: 오버라이드가
      있는 23개 목적지 전부·중앙값 5.9%·최대 27.3%).

   실행: node ai-loop/test_xV_admin_quote_walk.js
   ═══════════════════════════════════════════════════════════════════════════ */
const { bootPage, visibleText } = require('./_page_boot');
const { clickables } = require('./_journey_probe');
const { adminFixtures } = require('./_admin_fixtures');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const 날 = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

/* 실제 폼을 채워 제출한다 — **코드를 보고 지은 픽스처는 아무것도 못 잡는다**(XJ의 교훈) */
async function 산출(B) {
  const { win, doc } = B;
  const ev = (el, k) => el.dispatchEvent(new win.Event(k, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  set('destination', '오키나와'); set('programType', 'industry'); set('organizationType', 'company');
  set('visitMode', 'official'); set('departureCity', 'ICN'); set('participants', '30');
  set('startDate', 날(45)); set('endDate', 날(49));
  set('organization', '[점검] 한빛전자'); set('contactName', '[점검] 김담당');
  set('contactTel', '010-0000-0000'); set('requestDetails', '[점검] 회귀 테스트');
  await B.tick(150);
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await B.tick(400);
}

function 요율실패픽스처() {
  const fx = adminFixtures('filled');
  const orig = fx.route;
  fx.route = function (u, opt, json) {
    if (u.includes('/api/rates')) return json({ error: 'boom' }, false, 500);
    return orig.call(this, u, opt, json);
  };
  return fx;
}

(async () => {
  console.log('\n[1] 화면이 열리고, 담당자가 누를 수 있는 것이 실제로 잡히는가');
  {
    const B = bootPage('admin-quote.html', { fixtures: adminFixtures('filled') });
    await B.ready; await B.tick(400);
    const doc = B.doc;

    const app = doc.getElementById('quoteApp');
    ok('로그인 게이트를 지나 화면이 열린다', !!app && !app.classList.contains('hidden'));

    /* 🔴 기본 선택자만으로는 이 화면이 **9개짜리 화면**으로 보인다. 그 숫자로
       「깨끗하다」고 말하면 아무것도 안 본 것이다. */
    const 기본 = clickables(doc.body).length;
    Array.from(doc.querySelectorAll('details')).forEach((d) => { d.open = true; });
    const 더한것 = clickables(doc.body, 'label.aq-list-row, summary', ['aq-row-hidden']).length;
    ok('고르는 줄·펼치는 줄을 더하면 훨씬 많이 잡힌다', 더한것 > 기본 * 5, 기본 + ' → ' + 더한것);
    ok('실제로 100개가 넘는다(목적지 55곳 + 조건들)', 더한것 > 100, String(더한것));

    /* 닫힌 `<details>` 속은 담당자도 못 누른다 — 세면 「눌러 봤다」가 거짓이 된다 */
    Array.from(doc.querySelectorAll('details')).forEach((d) => { d.open = false; });
    const 접힌뒤 = clickables(doc.body, 'label.aq-list-row, summary', ['aq-row-hidden']).length;
    ok('접으면 그 안의 줄은 안 센다', 접힌뒤 < 더한것, 더한것 + ' → ' + 접힌뒤);

    B.win.close();
  }

  console.log('\n[2] 누르면 실제로 골라진다 — 자가 이것을 볼 수 있어야 한다');
  {
    const B = bootPage('admin-quote.html', { fixtures: adminFixtures('filled') });
    await B.ready; await B.tick(400);
    const { win, doc } = B;
    const rows = Array.from(doc.querySelectorAll('label.aq-list-row'));
    const 찾기 = (re) => rows.find((r) => re.test((r.textContent || '').trim()));
    const 누름 = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));

    const 비즈 = 찾기(/비즈니스/), 식사 = 찾기(/^식사/);
    ok('좌석 등급 줄과 포함 항목 줄이 화면에 있다', !!비즈 && !!식사);
    if (비즈 && 식사) {
      const b0 = 비즈.querySelector('input').checked; 누름(비즈);
      ok('라디오 줄을 누르면 골라진다', 비즈.querySelector('input').checked !== b0);
      const m0 = 식사.querySelector('input').checked; 누름(식사);
      ok('체크박스 줄을 누르면 켜지고 꺼진다', 식사.querySelector('input').checked !== m0);
      /* 🔴 그런데 **화면 글자는 한 글자도 안 바뀐다** — 자가 글자만 보면 죽은 줄로 센다 */
      ok('그래도 화면 글자는 안 바뀐다(그래서 자가 상태를 함께 봐야 한다)',
        !/비즈니스 선택됨|식사 해제됨/.test(visibleText(doc.body)));
    }
    B.win.close();
  }

  console.log('\n[3] 요율을 못 받았으면 **결과 카드가** 그 사실을 말한다');
  {
    const B = bootPage('admin-quote.html', { fixtures: 요율실패픽스처() });
    await B.ready; await B.tick(450);
    await 산출(B);
    const doc = B.doc;
    const card = doc.getElementById('estimateConfirm');
    ok('견적이 산출돼 결과 카드가 열린다', !!card && !card.classList.contains('hidden'));
    const 카드글 = visibleText(card);
    ok('결과 카드가 「운영 요율이 반영되지 않았다」고 말한다', /운영 요율·환율이 반영되지 않은 값/.test(카드글),
      카드글.slice(0, 120));
    ok('무엇을 하면 되는지도 말한다(새로고침 후 다시 산출)', /새로고침 후 다시 산출/.test(카드글));
    /* ⚠ **막지는 않는다** — 급한 건을 세우지 않는 것이 이 화면의 방침이다 */
    ok('그래도 「견적서 받기」는 막지 않는다', !doc.getElementById('downloadEstimate').disabled);
    /* 기존 배너(맨 위)도 그대로 있어야 한다 — 한 벌만 남기면 로드 시점 안내가 사라진다 */
    const 배너 = Array.from(doc.querySelectorAll('.aq-save-warn')).map((e) => e.textContent).join(' | ');
    ok('화면 맨 위 배너도 그대로다', /최신 요율·환율을 불러오지 못했습니다/.test(배너));
    ok('기록에 요율 출처가 남는다', B.win._lastQuoteRecord
      && B.win._lastQuoteRecord.rateSource && B.win._lastQuoteRecord.rateSource.state === 'failed',
      JSON.stringify(B.win._lastQuoteRecord && B.win._lastQuoteRecord.rateSource));
    B.win.close();
  }

  console.log('\n[4] 정상일 때는 경고하지 않는다 — 경고가 상시면 아무도 안 읽는다');
  {
    const B = bootPage('admin-quote.html', { fixtures: adminFixtures('filled') });
    await B.ready; await B.tick(450);
    await 산출(B);
    const doc = B.doc;
    const card = doc.getElementById('estimateConfirm');
    ok('결과 카드가 열린다', !!card && !card.classList.contains('hidden'));
    ok('요율 경고가 붙지 않는다', !/운영 요율·환율이 반영되지 않은 값/.test(visibleText(card)));
    ok('금액 요약은 그대로 나온다', /산출 완료/.test(visibleText(card)));
    B.win.close();
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

/* ═══════════════════════════════════════════════════════════════════════════
   XL — 계산기가 **왜 멈췄는지 말하지 않고** 있었다
   ───────────────────────────────────────────────────────────────────────────
   고객 화면을 눌러 보다 나온 자리다(XK의 버튼 훑기 후속).

   ■ 🔴 무엇이 잘못돼 있었나

   ① 「다음 단계로 이동」은 이렇게 끝났다:
        if (!validateStep(1)) { …querySelector('[required]:invalid')?.focus(); return; }
      **화면에는 아무 말도 안 나온다.** 커서만 옮겨 갈 뿐이라, 누른 사람에게는
      **버튼이 고장 난 것**으로 보인다(휴대폰에서는 포커스가 눈에 띄지도 않는다).

   ② 「견적 확인하기」는 `required` 덕에 브라우저가 막아 주지만, 막힌 칸이
      **감춰진 1단계**에 있으면 브라우저는 말풍선을 띄울 자리가 없어 **아무 말 없이
      제출만 막는다.** 고객에게는 죽은 버튼과 똑같다.

   ③ 인원 칸에는 상한이 **아예 없었다**(`min="1"`뿐). 서버 검증은 1~1000인데
      화면이 그걸 몰라서, 「3000명」으로 적으면 금액이 멀쩡히 나오고 저장까지 되고
      **견적서를 받는 마지막 걸음에서만** 거절됐다. 그때까지 고객은 알 방법이 없다.

   ■ 고친 방향

     · 막히면 **무엇이 비었는지·몇 칸 남았는지** 그 자리에 글자로 띄운다
     · 막힌 칸이 감춰진 단계면 **그 단계를 열고** 데려간다
     · 상한은 `limits.js` 하나에서 화면과 서버가 함께 읽는다
     · ⚠ **`required`를 떼거나 `novalidate`를 걸지 않았다** — 막는 것은 브라우저(형식·
       범위 검사가 더 촘촘하다), 설명은 우리. `invalid` 이벤트를 받아 말풍선만 접는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText, ROOT } = require('./_page_boot');
const LIMITS = require(path.join(ROOT, 'limits.js'));
const { verifyQuote } = require(path.join(ROOT, 'api', '_lib', 'quote_verify.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XL 왜 멈췄는지 말한다`);
  process.exit(fail ? 1 : 0);
};

console.log('\n[1] 상한은 한 곳에서 온다 — 화면과 서버가 같은 숫자를 본다');
{
  ok('① limits.js가 인원·일수 상한을 안다',
    LIMITS.QUOTE_MAX_PAX === 1000 && LIMITS.QUOTE_MAX_DAYS === 60,
    LIMITS.QUOTE_MAX_PAX + '/' + LIMITS.QUOTE_MAX_DAYS);
  const ver = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'quote_verify.js'), 'utf8');
  ok('① 서버 검증이 그 값을 읽는다(숫자를 박지 않는다)',
    /LIMITS\.QUOTE_MAX_PAX/.test(ver) && /LIMITS\.QUOTE_MAX_DAYS/.test(ver)
    && !/pax <= 1000/.test(ver) && !/days <= 60/.test(ver));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('① 고객 화면이 limits.js를 싣는다', /<script src="limits\.js">/.test(html));
  ok('① HTML에 상한 숫자를 적어 두지 않았다',
    !/id="participants"[^>]*max="\d+"/.test(html), '입력칸에 max가 박혀 있다');

  /* 서버가 실제로 그 경계에서 갈라지는지 — 값만 바꿔 두 번 물어본다 */
  const base = {
    destination: '다낭', days: 4, startDate: '2027-05-10',
    total: 1000000, perPerson: 100000, participants: 10,
  };
  const at = (pax) => verifyQuote(Object.assign({}, base, { participants: pax, perPerson: Math.round(base.total / pax) }), { overrides: {} });
  ok('① 상한 안은 인원 단계를 통과한다', at(LIMITS.QUOTE_MAX_PAX).steps.find((s) => s.id === 'pax').ok);
  ok('① 상한을 넘으면 걸린다', !at(LIMITS.QUOTE_MAX_PAX + 1).steps.find((s) => s.id === 'pax').ok);
}

(async () => {
  const B = bootPage('index.html');
  const { win, doc, log, tick } = B;
  await B.ready; await tick(250);
  const click = async (el) => {
    if (el) el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
    await tick(50);
  };
  const set = (id, v) => {
    const el = doc.getElementById(id);
    if (el) { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); }
  };
  const msg = (step) => visibleText(doc.querySelector(`.estimate-step[data-step="${step}"] .step-missing`));

  console.log('\n[2] 🔴 빈 폼에서 「다음 단계로 이동」 — 예전엔 아무 말도 없었다');
  {
    ok('② 처음에는 안내가 없다(늘 떠 있으면 아무도 안 본다)', msg(1) === '');
    await click(doc.getElementById('nextStepButton'));
    ok('② 무엇이 비었는지 말한다', /여행 목적지/.test(msg(1)), msg(1));
    ok('② 그 칸으로 데려간다', doc.activeElement && doc.activeElement.id === 'destination',
      doc.activeElement && doc.activeElement.id);
    ok('② 빈 칸에 표시가 붙는다', doc.getElementById('destination').classList.contains('fld-missing'));
    ok('② 단계는 그대로 1이다(넘어가지 않는다)',
      doc.querySelector('.estimate-step[data-step="1"]').classList.contains('step-active'));
  }

  console.log('\n[3] 채우면 안내가 **다시 세어진다**');
  {
    set('destination', '다낭');
    ok('③ 채운 칸의 표시가 사라진다', !doc.getElementById('destination').classList.contains('fld-missing'));
    ok('③ 1단계가 다 찼으면 안내도 사라진다', msg(1) === '', msg(1));
    await click(doc.getElementById('nextStepButton'));
    ok('③ 이제 2단계로 넘어간다',
      doc.querySelector('.estimate-step[data-step="2"]').classList.contains('step-active'));
  }

  console.log('\n[4] 🔴 2단계 제출 — 브라우저가 막는 자리도 우리가 설명한다');
  {
    doc.getElementById('estimateForm').checkValidity();   /* 브라우저가 막는 것과 같은 신호 */
    await tick(50);
    ok('④ 무엇이 비었는지 말한다', /담당자 이름|연락처|요청 사항/.test(msg(2)), msg(2));
    ok('④ 몇 칸 남았는지도 말한다', /\d칸이 남았습니다/.test(msg(2)), msg(2));
    /* 한 칸씩 채우면 숫자가 준다 — 「사라졌다」와 「다 됐다」는 다르다 */
    const before = (msg(2).match(/(\d)칸/) || [])[1];
    set('contactName', '김보균');
    const after = (msg(2).match(/(\d)칸/) || [])[1];
    ok('④ 한 칸 채우면 남은 수가 준다', Number(after) === Number(before) - 1 || msg(2) === '',
      before + ' → ' + after);
    set('contactTel', '010-1234-5678');
    set('requestDetails', '3일차 자유일정 희망');
    ok('④ 다 채우면 안내가 사라진다', msg(2) === '', msg(2));
  }

  console.log('\n[5] 🔴 감춰진 단계에 빈 칸이 있으면 **그 단계를 연다**');
  {
    /* 브라우저는 이 상황에서 말풍선을 띄울 자리가 없어 아무 말 없이 제출만 막는다 */
    set('destination', '');
    doc.getElementById('estimateForm').checkValidity();
    await tick(50);
    ok('⑤ 1단계가 다시 열린다',
      doc.querySelector('.estimate-step[data-step="1"]').classList.contains('step-active'));
    ok('⑤ 그리고 무엇이 비었는지 말한다', /여행 목적지/.test(msg(1)), msg(1));
    set('destination', '다낭');
  }

  console.log('\n[6] 🔴 범위를 벗어난 값 — 「입력해 주세요」는 이미 적은 사람에게 틀린 말이다');
  {
    const pax = doc.getElementById('participants');
    ok('⑥ 입력칸이 서버와 같은 상한을 건다',
      pax.getAttribute('max') === String(LIMITS.QUOTE_MAX_PAX), pax.getAttribute('max'));
    set('participants', String(LIMITS.QUOTE_MAX_PAX + 2000));
    doc.getElementById('estimateForm').checkValidity();
    await tick(50);
    const m = msg(1) || msg(2);
    ok('⑥ 범위를 말해 준다', /1~1000 사이/.test(m), m);
    ok('⑥ 「입력해 주세요」라고 하지 않는다', !/입력해 주세요/.test(m), m);
    set('participants', '30');
  }

  console.log('\n[7] 정상 입력은 조용하다 — 그리고 견적까지 간다');
  {
    const dep = new Date(); dep.setDate(dep.getDate() + 90);
    set('days', '4'); set('startDate', dep.toLocaleDateString('sv-SE'));
    doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
      if (String(el.value || '').trim()) return;
      if (el.tagName === 'SELECT') el.value = el.options[el.options.length - 1].value;
      else el.value = '테스트';
    });
    doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await tick(250);
    ok('⑦ 견적이 계산된다', !!win._lastQuoteRecord && win._lastQuoteRecord.total > 0);
    ok('⑦ 안내는 남아 있지 않다', msg(1) === '' && msg(2) === '', msg(1) + ' / ' + msg(2));
    ok('⑦ 화면 오류도 없다', log.errors.length === 0, log.errors.map((e) => e.msg).join(' | '));
  }

  done();
})();

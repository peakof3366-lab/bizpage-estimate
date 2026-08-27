/* ═══════════════════════════════════════════════════════════════════════════
   XS — **감춰진 칸이 견적 버튼을 영영 막고 있었다**
   ───────────────────────────────────────────────────────────────────────────
   가상 고객을 만들어 실제 화면에 태워 보다가 나온 자리다(`virtual_journey.js`).

   ■ 🔴 고객이 실제로 밟을 수 있는 길

     ① 골프 요금이 있는 목적지를 고른다 (제주도·오키나와·후아힌·카자흐스탄 — 4곳뿐)
     ② 골프를 켠다 → 「골프조 인원 / 라운딩 횟수」 줄이 열린다
     ③ 라운딩 칸에 **0**을 넣는다 (「아직 안 정했다」는 뜻으로 충분히 있을 수 있다)
     ④ 목적지를 골프 없는 곳으로 바꾼다
        → `syncGolfAvailability()`가 **체크를 알아서 풀고 줄을 감춘다.**
          그런데 **값 0은 그대로 남는다.**
     ⑤ 이제부터 「견적 확인하기」가 **영영 안 눌린다.**
        `golfRounds`에 `min="1"`이 걸려 있어 브라우저가 제출을 막는데,
        그 칸은 **화면에 없다.** 고객은 원인을 볼 방법이 없다.

   ■ 그리고 우리 안내조차 고객의 말이 아니었다
     「**golfRounds**」은(는) **1~?** 사이로 넣어 주세요.
     · 영문 칸 이름이 그대로 나갔다 — `aria-label`에 「골프 라운딩 횟수(회)」라고
       **이미 적어 두고도** 낭독기에게만 주고 눈으로 읽는 사람에게는 안 줬다.
     · `max`가 없으니 물음표를 그대로 찍었다.

   ■ 고친 방향 — 골프 한 곳이 아니라 **부류 전체**
     감춰진(`.hidden`) 값 칸은 `disabled`가 되어 **제약 검사에서 빠진다.**
     값은 지우지 않는다(다시 켜면 고객이 적어 둔 것이 돌아와야 한다).
     ⚠ 버튼·체크박스·라디오는 건드리지 않는다 — 제출을 막을 수 없고, 코드가
       `.checked`를 직접 세우는 자리라 손대면 그게 새 결함이 된다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText, ROOT } = require('./_page_boot');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XS 감춰진 칸이 막지 않는다`);
  process.exit(fail ? 1 : 0);
};

(async () => {
  const B = bootPage('index.html');
  const { win, doc, log, tick } = B;
  await B.ready; await tick(250);

  const ev = (el, t) => el.dispatchEvent(new win.Event(t, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  const form = doc.getElementById('estimateForm');
  /* 화면과 **같은 잣대**로 센다 — 여기서 규칙을 다시 적으면 둘이 어긋난다 */
  const blockers = () => Array.from(form.querySelectorAll('[required], input, select, textarea'))
    .filter((el) => {
      if (el.type === 'hidden' || el.disabled) return false;
      if (el.hasAttribute('required') && !String(el.value || '').trim()) return true;
      return !!(el.validity && !el.validity.valid);
    });
  const submit = () => {
    win._lastQuoteRecord = null;
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    return win._lastQuoteRecord;
  };

  const fillBasics = (destKey) => {
    set('destination', destKey);
    set('programType', 'leisure');
    set('organizationType', 'company');
    set('participants', 20);
    set('days', 4);
    const d = new Date(); d.setDate(d.getDate() + 60);
    set('startDate', d.toLocaleDateString('sv-SE'));
    set('organization', '점검');
    set('contactName', '점검');
    set('contactTel', '010-0000-0000');
    set('requestDetails', '감춰진 칸 점검');
  };

  console.log('\n[1] 골프 목적지를 **화면에게 물어본다** (짐작하지 않는다)');
  const opts = Array.from(doc.querySelectorAll('#destination option')).map((o) => o.value).filter(Boolean);
  const golfDests = opts.filter((k) => typeof win.getGolfFee === 'function' && win.getGolfFee(k) > 0);
  const noGolf = opts.filter((k) => !golfDests.includes(k));
  ok('① 골프 요금이 있는 목적지가 있다', golfDests.length > 0, golfDests.join(','));
  ok('① 골프 없는 목적지도 있다', noGolf.length > 0);
  if (!golfDests.length || !noGolf.length) done();

  console.log('\n[2] 🔴 고객이 밟을 수 있는 길 — 골프 0 → 목적지 변경');
  {
    fillBasics(golfDests[0]);
    await tick(150);
    ok('② 아무것도 안 건드리면 견적이 나온다', !!submit());

    const box = doc.getElementById('incGolf');
    box.checked = true; ev(box, 'change');
    await tick(120);
    const row = doc.getElementById('golfCountRow');
    ok('② 골프를 켜면 입력줄이 열린다', row && !row.classList.contains('hidden'));
    ok('② 열린 칸은 살아 있다(꺼져 있으면 고객이 못 적는다)',
      !doc.getElementById('golfRounds').disabled);

    set('golfRounds', 0);
    await tick(100);
    set('destination', noGolf[0]);
    await tick(200);
    ok('② 화면이 골프 체크를 알아서 푼다', box.checked === false);
    ok('② 골프 입력줄이 감춰진다', row && row.classList.contains('hidden'));

    /* 🔴 여기가 결함이던 자리다 */
    ok('🔴 ② 감춰진 칸이 제출을 막지 않는다',
      blockers().length === 0,
      blockers().map((e) => e.id + '=[' + e.value + ']').join(', '));
    const rec = submit();
    ok('🔴 ② 그래서 견적이 나온다', !!rec && rec.total > 0,
      visibleText(doc.querySelector('.step-missing') || doc.createElement('p')));
  }

  console.log('\n[3] 되돌아가도 멀쩡해야 한다 — 감췄다고 값을 잃으면 안 된다');
  {
    set('destination', golfDests[0]);
    await tick(180);
    const box = doc.getElementById('incGolf');
    box.checked = true; ev(box, 'change');
    await tick(150);
    const gr = doc.getElementById('golfRounds');
    ok('③ 다시 켜면 칸이 살아난다', !gr.disabled, 'disabled=' + gr.disabled);
    ok('③ 적어 둔 값이 남아 있다', String(gr.value) === '0', gr.value);
    set('golfCount', 8); set('golfRounds', 2);
    await tick(120);
    const rec = submit();
    ok('③ 골프를 넣은 견적이 나온다', !!rec && rec.total > 0);
    /* ⚠ 견적 기록의 항목은 `rows`가 아니라 **`items`**다(`rows`는 공유 payload 쪽 이름).
       처음에 `rows`로 찾다가 「골프가 안 실렸다」는 없는 결함을 만들 뻔했다. */
    ok('③ 그 견적에 골프 줄이 실린다',
      !!rec && Array.isArray(rec.items) && rec.items.some((r) => /골프/.test(r.name || '')),
      rec ? (rec.items || []).map((r) => r.name).join(' / ') : '');
  }

  console.log('\n[4] 안내는 **고객의 말**이어야 한다');
  {
    /* 감춰지지 않은 칸을 일부러 범위 밖으로 만들어 문구만 본다 */
    set('participants', 0);
    await tick(100);
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await tick(120);
    const say = visibleText(doc.querySelector('.step-missing'));
    ok('④ 무엇이 문제인지 말한다', !!say, say);
    ok('④ 영문 칸 이름을 그대로 노출하지 않는다',
      !/participants|golfRounds|golfCount|bizCount|vipCount|agencyVisits/.test(say), say);
    ok('④ 물음표로 범위를 말하지 않는다', !/~\?|\?~/.test(say), say);
    set('participants', 20);
    await tick(100);
  }

  console.log('\n[5] 규칙이 코드 한 곳에 있다 — 두 벌이 되면 반드시 어긋난다');
  {
    const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    ok('⑤ 감춰진 칸을 끄는 자리가 있다', /function syncHiddenFieldValidity/.test(src));
    ok('⑤ 우리가 끈 것만 되켠다(다른 이유로 꺼 둔 칸을 살리지 않는다)',
      /dataset\.autoOff/.test(src));
    ok('⑤ 버튼·체크박스·라디오는 건드리지 않는다',
      /'checkbox'[\s\S]{0,40}'radio'|'radio'[\s\S]{0,40}'checkbox'/.test(src));
    ok('⑤ 이름은 aria-label을 먼저 본다',
      /getAttribute\('aria-label'\)\s*\|\|\s*el\.getAttribute\('placeholder'\)/.test(src));
  }

  console.log('\n[6] 🔴 출발일 — 비우면 금액은 나오는데 견적서가 안 온다');
  {
    /* 가상 고객 40명 중 「출발일 비움」 손님이 이걸로 걸렸다: 화면은 1,813,256원/인을
       보여줬는데 서버 검증이 `date` 단계에서 걸러 **'review'**로 떨어졌다.
       고객 자동 발급은 통과해야만 링크가 나가므로 문서가 영영 안 온다.
       ⚠ 금액 자체도 다른 상품의 값이다 — 날짜가 없으면 시즌·리드타임 계수가 조용히 1.0이다. */
    const sd = doc.getElementById('startDate');
    ok('⑥ 고객 화면에서 출발일은 필수다', sd.required === true);
    ok('⑥ 하한이 로컬 오늘이다(UTC가 아니다)',
      sd.min === new Date().toLocaleDateString('sv-SE'), sd.min);

    set('destination', golfDests[0]);
    set('startDate', '');
    await tick(140);
    ok('⑥ 비우면 제출이 막힌다', blockers().some((e) => e.id === 'startDate'),
      blockers().map((e) => e.id).join(','));
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await tick(140);
    const say = visibleText(doc.querySelector('.step-missing'));
    ok('⑥ 왜 막혔는지 「출발일」이라는 말로 알려준다', /출발일/.test(say), say);

    const d = new Date(); d.setDate(d.getDate() + 60);
    set('startDate', d.toLocaleDateString('sv-SE'));
    await tick(140);
    ok('⑥ 채우면 다시 견적이 나온다', !!submit());
  }

  console.log('\n[7] 🔴 담당자는 지난 행사를 재견적할 수 있어야 한다');
  {
    /* 서버 검증기가 그 업무를 명시적으로 허용한다 — 「출발일은 과거여도 견적 자체는
       성립한다(지난 일정 재견적)」. 그런데 화면이 하한을 오늘로 걸어 **담당자 도구에서도**
       막고 있었다(같은 `script.js`를 쓴다). 화면이 서버보다 좁으면 되는 일을 못 하게 된다.
       ⚠ 그리고 필수도 담당자에게는 안 건다 — 날짜 없이 개략 견적을 내는 것이 정상
         경로였고, 전역으로 걸었더니 그 흐름을 지키는 검사 39건이 한꺼번에 깨졌다. */
    const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    ok('⑦ 필수를 내부 도구에서는 안 건다',
      /if \(!window\.__INTERNAL_TOOL__\) startEl\.required = true;/.test(src));
    ok('⑦ 하한도 내부 도구에서는 안 건다',
      /if \(!window\.__INTERNAL_TOOL__\) \{[\s\S]{0,160}startEl\.min = today;/.test(src));
    ok('⑦ 하한을 UTC로 만들지 않는다',
      !/const today = new Date\(\)\.toISOString\(\)/.test(src)
      && /const today = new Date\(\)\.toLocaleDateString\('sv-SE'\)/.test(src));
    const admin = fs.readFileSync(path.join(ROOT, 'admin-quote.html'), 'utf8');
    ok('⑦ 담당자 도구가 script.js보다 먼저 자신을 내부 도구라 밝힌다',
      admin.indexOf('__INTERNAL_TOOL__') > -1
      && admin.indexOf('__INTERNAL_TOOL__') < admin.indexOf('<script src="script.js">'));
  }

  ok('전 과정에서 화면 오류가 없다', log.errors.length === 0,
    log.errors.map((e) => e.msg).join(' | '));
  done();
})();

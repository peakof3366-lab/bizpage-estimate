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

  console.log('\n[8] 🔴 견적서는 **두 벌**이다 — 인쇄용 문서도 조건을 말해야 한다');
  {
    /* WQ가 「인쇄한 견적서에 유효기간이 한 줄도 없다」를 고쳤는데, 그때 고친 것은
       **링크 견적서(estimate-view.html) 한 벌뿐**이었다. 계산 직후 이 창에서 바로
       인쇄·PDF로 만드는 고객은 여전히 **언제까지 유효한지 모르는 종이**를 결재에 올렸다.
       XP에서 견적번호가 링크 쪽에만 있던 것과 같은 자리, 같은 이유다.
     ⚠ 이 검사는 **감춰진 패널의 글자를 세지 않는다.** 인쇄용 문서는 `.hidden`이 아니라
       인라인 `style="display:none"`으로 감춘다(문서가 통째로 템플릿 문자열이라 그렇다).
       그걸 안 걷어내면 `#share-modal` 안의 안내를 보고 **통과해 버린다** — 실제로
       그렇게 통과하고 있었고, 그래서 이 결함이 안 보였다. */
    const shown = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('script,style,template,[hidden],[aria-hidden="true"],.hidden').forEach((n) => n.remove());
      c.querySelectorAll('[style]').forEach((n) => {
        const st = String(n.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
        if (/display:none|visibility:hidden/.test(st)) n.remove();
      });
      return (c.textContent || '').replace(/\s+/g, ' ').trim();
    };

    const D = bootPage('index.html');
    await D.ready; await D.tick(250);
    const dset = (id, v) => {
      const el = D.doc.getElementById(id);
      if (el) { el.value = String(v); el.dispatchEvent(new D.win.Event('input', { bubbles: true })); el.dispatchEvent(new D.win.Event('change', { bubbles: true })); }
    };
    dset('destination', '다낭'); dset('programType', 'industry'); dset('organizationType', 'company');
    dset('participants', 30); dset('days', 4);
    const dep = new Date(); dep.setDate(dep.getDate() + 60);
    dset('startDate', dep.toLocaleDateString('sv-SE'));
    dset('organization', '점검기관'); dset('contactName', '점검담당');
    dset('contactTel', '010-0000-0000'); dset('requestDetails', '두 벌 대조');
    await D.tick(120);
    D.doc.getElementById('estimateForm').dispatchEvent(new D.win.Event('submit', { bubbles: true, cancelable: true }));
    await D.tick(300);
    const rec2 = D.win._lastQuoteRecord;
    ok('⑧ 견적이 계산됐다', !!rec2 && rec2.total > 0);
    D.doc.getElementById('downloadEstimate').dispatchEvent(
      new D.win.MouseEvent('click', { bubbles: true, cancelable: true, view: D.win }));
    await D.tick(400);

    const pop = (D.log.opened || [])[0];
    ok('⑧ 인쇄용 견적서가 열린다', !!pop);
    if (pop) {
      const txt = shown(pop.document.body);
      const won = (n) => Number(Math.round(n)).toLocaleString('ko-KR');
      ok('⑧ 감춘 패널을 세지 않는다(안 그러면 이 검사가 거짓으로 통과한다)',
        txt.length < visibleText(pop.document.body).length,
        txt.length + ' vs ' + visibleText(pop.document.body).length);
      ok('🔴 ⑧ 인쇄용 견적서에 유효기간이 있다', /유효기간/.test(txt));
      ok('⑧ 언제까지인지 날짜로 말한다', /까지/.test(txt) && /\d{4}년/.test(txt));
      ok('⑧ 「N일 남음」은 안 적는다(종이는 나중에 읽힌다)', !/일 남음/.test(txt), txt.slice(0, 80));
      ok('⑧ 총액이 있다', txt.includes(won(rec2.total)));
      ok('⑧ 1인 금액이 있다', txt.includes(won(rec2.perPerson)));
      ok('⑧ 목적지가 있다', /다낭/.test(txt));
      ok('⑧ 요율 기준이 있다', /요율 기준/.test(txt));
      ok('🔴 ⑧ 감춘 수익 항목이 새지 않는다', !/ENBT 수익|현지 수익금/.test(txt));
      ok('🔴 ⑧ 연락처가 찍히지 않는다', !txt.includes('010-0000-0000'));
      /* 끝나는 날을 안 받았을 때 물결표가 매달려 있었다 — 「2026년 10월 26일 ~ —」 */
      ok('⑧ 끝나는 날이 없으면 물결표를 매달지 않는다', !/~\s*—/.test(txt),
        (txt.match(/연수 기간[^가-힣]*[^ ]*/) || [''])[0]);
    }
    D.win.close();
  }

  console.log('\n[9] 🔴 상담 신청 — 담당자가 「누구 회사인지」를 알 수 있어야 한다');
  {
    /* 길이 둘이고 성격이 다르다:
       · `#inqForm` — 첫 화면 아래의 **일반 문의**. 견적과 무관하다.
       · `submitConsult()` — **방금 낸 견적을 들고** 「바로 연락 요청」하는 길.
       ⚠ 둘의 기대를 섞으면 없는 결함이 생긴다 — 일반 문의에 「견적 연결」을 요구했다가
         손님 6명을 전부 결함으로 잡았고, 되돌렸다.
       🔴 견적 기반 상담은 **소속이 빈 채로** 나가고 있었다(`org: ''`). 고객은 바로 위
         견적 폼에 기관명을 적었는데도. 일반 문의는 처음부터 싣고 있었다 — 같은 값을
         두 길이 각자 챙기는 구조(결함 생성기 ①)의 전형이다. */
    const C = bootPage('index.html');
    await C.ready; await C.tick(250);
    const cset = (id, v) => {
      const el = C.doc.getElementById(id);
      if (el) { el.value = String(v); el.dispatchEvent(new C.win.Event('input', { bubbles: true })); el.dispatchEvent(new C.win.Event('change', { bubbles: true })); }
    };
    const ORG = '점검주식회사';
    cset('destination', '다낭'); cset('programType', 'industry'); cset('organizationType', 'company');
    cset('participants', 25); cset('days', 4);
    const dd = new Date(); dd.setDate(dd.getDate() + 70);
    cset('startDate', dd.toLocaleDateString('sv-SE'));
    cset('organization', ORG); cset('contactName', '점검담당');
    cset('contactTel', '010-0000-0000'); cset('requestDetails', '상담 신청 점검');
    await C.tick(120);
    C.doc.getElementById('estimateForm').dispatchEvent(new C.win.Event('submit', { bubbles: true, cancelable: true }));
    await C.tick(300);
    ok('⑨ 견적이 먼저 나왔다', !!C.win._lastQuoteRecord);

    const n0 = C.log.requests.length;
    if (typeof C.win.openConsultForm === 'function') C.win.openConsultForm();
    await C.tick(60);
    cset('consultName', '점검담당'); cset('consultTel', '010-0000-0000');
    await C.tick(60);
    C.win.submitConsult();
    await C.tick(320);
    const req = C.log.requests.slice(n0).find((r) => /\/api\/inquiries/.test(r.url));
    ok('⑨ 상담 신청이 서버로 간다', !!req,
      C.log.says.slice(-2).map((s) => s.text).join(' | '));
    if (req) {
      const b = req.body || {};
      ok('🔴 ⑨ 소속이 실린다(고객이 견적 폼에 적은 값)', String(b.org || '').trim() === ORG,
        '보낸 값: [' + (b.org || '') + ']');
      ok('⑨ 방금 낸 견적과 이어진다', !!b.linkedQuoteId, Object.keys(b).join(','));
      ok('⑨ 견적 내용이 함께 간다', !!b.estimate && b.estimate.total > 0);
      ok('⑨ 일반 문의와 구별되는 표시가 있다', b.type === 'estimate_inquiry', String(b.type));
      ok('🔴 ⑨ 감춘 수익 항목이 리드로 새지 않는다',
        !/ENBT 수익|현지 수익금/.test(JSON.stringify(b)));
    }

    /* 일반 문의는 **연결을 기대하지 않는다** — 그게 그 폼의 성격이다 */
    const n1 = C.log.requests.length;
    cset('inqName', '점검'); cset('inqOrg', ORG);
    cset('inqTel', '010-0000-0000'); cset('inqMsg', '일반 문의 점검');
    await C.tick(60);
    C.doc.getElementById('inqForm').dispatchEvent(new C.win.Event('submit', { bubbles: true, cancelable: true }));
    await C.tick(320);
    const req2 = C.log.requests.slice(n1).find((r) => /\/api\/inquiries/.test(r.url));
    ok('⑨ 일반 문의도 서버로 간다', !!req2);
    if (req2) {
      ok('⑨ 일반 문의에도 소속이 실린다', String((req2.body || {}).org || '') === ORG);
      ok('⑨ 일반 문의는 견적과 이어지지 않는다(그게 맞다)', !(req2.body || {}).linkedQuoteId);
    }
    C.win.close();
  }

  ok('전 과정에서 화면 오류가 없다', log.errors.length === 0,
    log.errors.map((e) => e.msg).join(' | '));
  done();
})();

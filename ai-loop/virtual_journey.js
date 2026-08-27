/* ═══════════════════════════════════════════════════════════════════════════
   가상 고객을 **우리 서비스에 실제로 태우는 자** (XS)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-27): 「가상으로 고객을 만들어서 견적과 관련된 모든 사항을
   직접 가상 속에서 실행해 보고 견적서를 뽑아보는 구조까지 실행. 그러면서 생기는
   문제를 실제 대입하고 해결하는 작업까지.」

   실행:
     node ai-loop/virtual_journey.js --n=200            200명을 태운다
     node ai-loop/virtual_journey.js --n=50 --seed=3    다른 손님으로
     node ai-loop/virtual_journey.js --n=5 --keep       모든 손님의 견적서를 남긴다
     node ai-loop/virtual_journey.js --n=200 --quiet    요약만

   ■ 손님 한 명이 밟는 길 — **고객이 하는 그대로**
     ① 홈페이지를 띄운다 (운영 요율을 실제로 받아서 — 기본값으로 재면 고객 금액이 아니다)
     ② 견적 폼을 채우고 「견적 확인하기」를 누른다
     ③ 결과 패널을 **글자로 읽는다** (금액이 화면에 실제로 나오는가)
     ④ 「견적서 받기」를 눌러 브라우저가 만드는 **요청 본문 그대로**를 잡는다
     ⑤ 🔴 서버의 **진짜 검증기**(`api/_lib/quote_verify.js`)에 그대로 넣는다 —
        여기서 `review`가 나오면 **고객은 링크를 못 받는다.** XJ가 정확히 그 자리였다.
     ⑥ 서버가 저장하는 모양 그대로 payload를 만들어 `estimate-view.html`에 그린다
     ⑦ 그려진 견적서를 **글자로 읽어** 금액·번호·이름·일수가 실제로 있는지 본다

   ■ 🔴 운영 DB에 쓰지 않는다
     수백 건을 프로덕션에 보내면 견적번호가 수백 개 소모되고 대장이 쓰레기로 덮인다.
     그래서 **①~⑦을 전부 로컬에서** 한다 — 코드는 프로덕션과 같은 파일이고, 요율은
     운영값을 받아 온다. 프로덕션 왕복이 필요한 확인은 `smoke_prod_journey.js`가
     따로 있고, 그건 소수만 `--live --cleanup`으로 돈다.
     ⚠ 즉 이 도구가 통과했다고 「프로덕션에서 사람이 눌러 봤다」가 아니다. 그 구분을
       무너뜨리지 말 것.

   ■ 결과는 바탕화면 `가상견적서` 폴더에 쌓인다
     손님마다 한 폴더 — 요청·결과·**실제로 그려진 견적서 HTML**.
     맨 위에 `_요약.md`와 `_문제모음.md`.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText, ROOT } = require('./_page_boot');
const { makeAll, makeEdges, makeSweep, MARK } = require('./_virtual_personas');
const { verifyQuote } = require(path.join(ROOT, 'api', '_lib', 'quote_verify.js'));
const COMBINED_FACTOR = require(path.join(ROOT, 'data.js')).estimateCombinedFactor;

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.split('=')[1] : d;
};
const N = Number(arg('n', 200));
const SEED = Number(arg('seed', 1));
const KEEP_ALL = process.argv.includes('--keep');
/* 🔴 **견적서 파일은 기본으로 남긴다** — 대표가 눈으로 보셔야 하기 때문이다.
   손님 한 명당 1MB 남짓이라 수백 명을 돌릴 때는 `--no-docs`로 끈다. */
const DOCS = !process.argv.includes('--no-docs');
const QUIET = process.argv.includes('--quiet');
const OUT = arg('out', path.join(process.env.USERPROFILE || 'C:/Users/최현욱', 'Desktop', '가상견적서'));
const BASE = arg('base', 'https://bizpage-estimate.vercel.app');

const won = (n) => Number(Math.round(n || 0)).toLocaleString('ko-KR');

/* 🔴 **감춰진 패널의 글자까지 읽으면 안 된다** (XS).
   `_page_boot`의 `visibleText`는 `script`·`style`만 걷어낸다 — 그건 「소스가 글자로
   섞이는 것」을 막으려고 만든 것이고, 화면에서 **감춰진 요소**는 그대로 남는다.
   실제로 인쇄용 문서에서 「링크 공유」와 「담당자 확인이 필요한 견적입니다」가 **동시에**
   읽혔다. 둘은 서로 배타적인 상태라 하나는 반드시 감춰져 있다.
   → 그 상태로 「유효기간 문구가 있다」를 재면 **감춰진 안내를 보고 통과**할 수 있다.
     안 보이는 글자로 통과하는 검사는 아무것도 안 지킨다(결함 생성기 ③).

 🔴 **감추는 방식이 화면마다 다르다.** 고객 화면(index.html)은 `.hidden` 클래스를 쓰고,
   인쇄용 팝업은 **인라인 `style="display:none"`**을 쓴다(그 문서는 통째로 템플릿
   문자열이라 클래스를 쓸 자리가 없다). 한쪽만 걷어내면 팝업에서는 **한 글자도 안 줄어든다** —
   실제로 3,059자 → 3,059자였다. 두 방식을 다 본다.
 ⚠ 공용 `visibleText`를 고치지 않는다 — 다른 도구 여럿이 지금 동작에 기대고 있다.
   여기서만 더 좁게 본다.
 ⚠ `.no-print`는 **감춘 것이 아니다**(인쇄할 때만 빠진다). 걷어내면 화면에 멀쩡히
   보이는 버튼이 「없는 것」이 된다. */
function shownText(el) {
  if (!el) return '';
  const c = el.cloneNode(true);
  if (!c.querySelectorAll) return (c.textContent || '').replace(/\s+/g, ' ').trim();
  c.querySelectorAll('script,style,template,[hidden],[aria-hidden="true"],.hidden').forEach((n) => n.remove());
  /* 인라인으로 감춘 것 — 팝업 문서가 쓰는 방식이다 */
  c.querySelectorAll('[style]').forEach((n) => {
    const st = String(n.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
    if (/display:none|visibility:hidden/.test(st)) n.remove();
  });
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}
const ymd = (d) => d.toLocaleDateString('sv-SE');
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

/* ─────────────────────────────────────────────────────────────────────────
   🔴 **대표가 눈으로 볼 수 있어야 한다** (2026-08-27 지시)
   「가상견적서 폴더에 사람이 입력해서 만들어진 견적서까지 **다운로드되는 부분까지**
    구현해 줘. 나도 내 눈으로 직접 만들어지는 견적서를 볼 수 있게.」

   그래서 손님마다 **실제 파일 세 개**를 떨어뜨린다 — 고객이 손에 쥐는 세 형태 그대로:
     · 카톡으로 전달되는 링크 견적서 (`estimate-view.html`이 그린 것)
     · 계산 직후 인쇄·PDF로 만드는 문서 (`openEstimateWindow`가 그린 것)
     · 결재에 붙이는 표 파일 (`downloadEstimateExcel`이 만든 것 — CSV)

 ⚠ **더블클릭하면 그대로 열려야 한다.** 그러려면 `<script>`를 걷어내야 한다 —
   페이지 스크립트가 다시 돌면 서버를 찾다 실패해서 **빈 화면이나 오류 안내**로 덮어쓴다.
   화면은 이미 다 그려진 상태로 저장하므로 스크립트가 할 일이 없다.
   ⚠ 그래서 일정 코스 A/B 탭 전환은 안 된다(고른 코스 한 벌이 보인다). 그 사실을
     문서 맨 위에 적어 둔다 — **안 되는 것을 안 된다고 말한다.**
 ⚠ 스타일은 손댈 필요가 없다. 두 문서 다 `<style>`이 문서 안에 있다(바깥 CSS 파일이 없다).
   ───────────────────────────────────────────────────────────────────────── */
const 안내띠 = (말) => '<div style="background:#FFF8E6;border-bottom:2px solid #F0D89A;'
  + 'padding:10px 16px;font:13px/1.6 -apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
  + 'color:#7A5A10;text-align:center">' + 말 + '</div>';

function 볼수있게(html, 말) {
  const clean = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
  const m = clean.match(/<body[^>]*>/i);
  if (!m) return 안내띠(말) + clean;
  return clean.replace(m[0], m[0] + 안내띠(말));
}

/* ─────────────────────────────────────────────────────────────────────────
   한 손님이 겪은 일을 담는 그릇. **무엇이 안 됐는지**를 이름으로 부른다 —
   「실패」 한 낱말로 뭉치면 200건을 세어도 고칠 자리를 못 찾는다.
   ───────────────────────────────────────────────────────────────────────── */
function newTrouble() { return []; }
const 문제 = (list, 코드, 말, 자세히) => list.push({ code: 코드, say: 말, detail: String(자세히 || '').slice(0, 400) });

async function runOne(p, rates, ctx) {
  const t = newTrouble();
  const out = { no: p.no, persona: p, trouble: t };

  const B = bootPage('index.html', { fixtures: { rates } });
  const { win, doc, log, tick, fixtures: fx } = B;
  await B.ready; await tick(280);

  if (typeof win.getBreakdownData !== 'function') {
    문제(t, 'ENGINE_DEAD', '견적 엔진이 화면에 안 실렸다', '');
    win.close(); return out;
  }
  /* 운영 요율이 실제로 얹혔는가 — 안 얹히면 옛 기본값으로 계산된다(XI) */
  /* 🔴 **창 안의 객체를 그대로 들고 있으면 창이 통째로 안 지워진다** (XS).
     `win.__RATE_SOURCE__`는 JSDOM 창의 realm에서 만들어진 객체다. 그걸 결과 배열에
     400개 담아 두면 **창 400개가 살아 있는 것과 같다** — 창을 닫아도 소용없다.
     세 번째로 여기서 힙이 터졌다(① 견적서 HTML ② 안 닫은 팝업 ③ 이것).
     → **우리 realm의 평범한 값으로 베껴 온다.** 문자열·숫자는 realm에 안 묶인다. */
  out.rateSource = (() => {
    try { return JSON.parse(JSON.stringify(win.__RATE_SOURCE__ || null)); }
    catch (e) { return null; }
  })();
  if (!out.rateSource || out.rateSource.state !== 'applied') {
    문제(t, 'RATE_NOT_APPLIED', '화면이 운영 요율을 못 받았다', JSON.stringify(out.rateSource));
  }

  const ev = (el, k) => el.dispatchEvent(new win.Event(k, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  const check = (id, on) => { const el = doc.getElementById(id); if (el) { el.checked = !!on; ev(el, 'change'); } };
  const radio = (name, v) => {
    const el = doc.querySelector('input[name="' + name + '"][value="' + v + '"]');
    if (el) { el.checked = true; ev(el, 'change'); }
  };
  const click = (el) => el && el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));

  /* ── ② 폼을 채운다 ─────────────────────────────────────────────── */
  set('destination', p.destKey);
  set('programType', p.programType);
  set('organizationType', p.organizationType);
  set('visitMode', p.visitMode);
  set('startDate', p.startDate);
  set('endDate', p.endDate);
  set('participants', p.participants);
  set('days', p.days);
  set('departureCity', p.departureCity);
  radio('cabinClass', p.cabinClass);
  radio('hotelGrade', p.hotelGrade);
  radio('roomConfig', p.roomConfig);
  check('incHotel', p.incHotel); check('incMeal', p.incMeal); check('incVehicle', p.incVehicle);
  check('incGuide', p.incGuide); check('incSightseeing', p.incSightseeing);
  check('incDomestic', p.incDomestic);
  /* 골프는 **목적지가 허락할 때만** 켠다 — 화면이 그렇게 동작한다(TJ) */
  const golfOk = typeof win.getGolfFee === 'function' && win.getGolfFee(p.destKey) > 0;
  out.golfOffered = golfOk;
  if (p.incGolf && golfOk) {
    check('incGolf', true);
    await tick(80);
    set('golfCount', p.golfCount); set('golfRounds', Math.max(1, p.golfRounds));
  }
  if (p.vipCount) { set('bizCount', p.vipCount); set('vipCount', p.vipCount); }
  set('agencyVisits', p.agencyVisits);
  set('organization', p.organization);
  set('contactName', p.contactName);
  set('contactTel', p.contactTel);
  set('requestDetails', p.requestDetails);
  await tick(140);

  /* 제출을 막는 칸이 있나 — 화면과 **같은 잣대**로 센다 */
  const form = doc.getElementById('estimateForm');
  const blockers = Array.from(form.querySelectorAll('[required], input, select, textarea')).filter((el) => {
    if (el.type === 'hidden' || el.disabled) return false;
    if (el.hasAttribute('required') && !String(el.value || '').trim()) return true;
    return !!(el.validity && !el.validity.valid);
  });
  const blockNote = blockers.map((e) => (e.id || e.name) + '=[' + e.value + ']'
    + (e.closest('.hidden') ? ' (감춰져 있다)' : '')).join(', ');
  out.blocked = blockers.length > 0;
  /* ⚠ **막히는 것이 정답인 손님이 있다**(상한 초과 등). 그걸 결함으로 세면 진짜가 묻힌다.
     그래서 「막혔다」가 아니라 **「기대와 다르다」**를 결함으로 부른다(WD의 교훈). */
  if (p.expectBlocked) {
    if (!blockers.length) 문제(t, 'SHOULD_BLOCK', '🔴 막아야 하는 값인데 안 막았다', p.edge || '');
  } else if (blockers.length) {
    문제(t, 'FORM_BLOCKED', '제출을 막는 칸이 있다', blockNote);
  }

  /* ── ③ 「견적 확인하기」 ────────────────────────────────────────── */
  win._lastQuoteRecord = null;
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick(320);
  const rec = win._lastQuoteRecord;
  out.record = rec ? {
    total: rec.total, perPerson: rec.perPerson, destKey: rec.destKey,
    participants: rec.participants, days: rec.days, nights: rec.nights,
    items: (rec.items || []).map((r) => ({ name: r.name, amount: r.amount, hidden: !!r.isHidden })),
  } : null;

  if (!rec) {
    const say = visibleText(doc.querySelector('.step-missing'));
    if (p.expectBlocked) {
      /* 정답이다. 다만 **왜 막혔는지 화면이 말했는지**는 본다 — 조용히 막히면
         고객에게는 죽은 버튼이다(XL이 고친 자리다). */
      out.blockedSay = say;
      if (!say) 문제(t, 'SILENT_BLOCK', '🔴 막긴 했는데 화면이 아무 말도 안 했다', p.edge || '');
    } else {
      문제(t, 'NO_QUOTE', '🔴 견적이 아예 안 나왔다', say || (log.errors[0] && log.errors[0].msg) || '');
    }
    win.close(); return out;
  }
  if (p.expectBlocked) 문제(t, 'SHOULD_BLOCK', '🔴 막아야 하는 값인데 견적이 나왔다',
    (p.edge || '') + ' → ' + won(rec.total));
  if (!(rec.total > 0)) 문제(t, 'ZERO_TOTAL', '🔴 총액이 0이거나 음수다', String(rec.total));
  if (!(rec.perPerson > 0)) 문제(t, 'ZERO_PP', '1인 금액이 0이다', String(rec.perPerson));

  /* 총액과 1인 금액이 서로 말이 되나 — 둘을 각자 계산하는 자리가 있어 어긋날 수 있다 */
  if (rec.total > 0 && rec.perPerson > 0) {
    const gap = Math.abs(rec.perPerson * rec.participants - rec.total) / rec.total;
    if (gap > 0.02) 문제(t, 'PP_MISMATCH', '1인 금액 × 인원이 총액과 다르다',
      won(rec.perPerson) + '×' + rec.participants + '=' + won(rec.perPerson * rec.participants) + ' vs ' + won(rec.total));
  }
  /* 항목 합 × 계수가 총액과 맞나.
     🔴 처음엔 계수를 빼고 재서 **9명 전부를 「항목 합이 다르다」로 잡았다** — 없는 결함이었다.
     엔진의 식이 `총액 = 항목합 × 프로그램계수 × 기관계수`다(`estimateCriteria.formula`).
     같은 착각이 서버 검증기에도 있었고, 그쪽은 **고객이 링크를 못 받게** 만들고 있었다. */
  const itemSum = (rec.items || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const cf = COMBINED_FACTOR(p.programType, p.organizationType);
  if (itemSum > 0 && rec.total > 0 && Math.abs(itemSum * cf - rec.total) / rec.total > 0.02) {
    문제(t, 'ITEM_SUM', '항목 합 × 계수가 총액과 다르다',
      won(itemSum) + ' × ' + cf + ' = ' + won(itemSum * cf) + ' vs ' + won(rec.total));
  }
  /* 말이 안 되는 1인 금액 — 너무 싸거나 너무 비싸면 사람이 봐야 한다 */
  if (rec.perPerson > 0 && rec.perPerson < 150000) 문제(t, 'PP_TOO_LOW', '1인 금액이 비상식적으로 낮다', won(rec.perPerson));
  if (rec.perPerson > 20000000) 문제(t, 'PP_TOO_HIGH', '1인 금액이 비상식적으로 높다', won(rec.perPerson));

  /* 화면이 금액을 **실제로 보여주나** — 계산됐는데 안 그리는 일이 있었다(XP) */
  const shown = shownText(doc.body);
  out.totalShown = shown.includes(won(rec.total));
  if (!out.totalShown) 문제(t, 'TOTAL_NOT_SHOWN', '계산은 됐는데 총액이 화면 글자에 없다', won(rec.total));

  /* ── ④ 「견적서 받기」를 눌러 요청 본문을 잡는다 ──────────────── */
  const dl = doc.getElementById('downloadEstimate');
  if (!dl) 문제(t, 'NO_ISSUE_BUTTON', '견적서 받기 버튼이 없다', '');
  else if (dl.disabled) 문제(t, 'ISSUE_DISABLED', '견적서 받기 버튼이 막혀 있다', '');
  click(dl);
  await tick(320);
  const req = log.requests.find((r) => r.url.includes('quote-shares'));
  if (!req || !req.body) {
    문제(t, 'NO_SHARE_REQUEST', '🔴 브라우저가 견적서 발급 요청을 안 만들었다',
      log.says.map((s) => s.text).join(' | '));
    win.close(); return out;
  }
  const share = req.body.share;
  out.hasQuoteSnapshot = !!req.body.quote;
  if (!share) { 문제(t, 'NO_SHARE_BODY', '발급 요청에 share가 없다', Object.keys(req.body).join(',')); win.close(); return out; }
  if (!out.hasQuoteSnapshot) 문제(t, 'NO_SNAPSHOT', '견적 스냅샷이 안 실렸다 — 서버 검증이 얕아진다', '');

  /* 🔴 **고객이 견적서의 표를 더하면 TOTAL과 얼마나 벌어지나** — 재기만 한다.
     벌어지는 이유는 둘이다: ① 감춘 수익·보험(일부러 안 보여준다) ② 프로그램·기관 계수
     (표에는 흔적이 없다). ①은 방침이고 ②는 방침으로 정해진 적이 없다.
     ⚠ **결함으로 부르지 않는다.** 무엇을 보여줄지는 대표 결정이다(결정대기열).
        다만 「얼마나 벌어지는가」를 숫자로 남겨야 그 결정을 할 수 있다. */
  const 표합 = (share.rows || []).reduce((a, r) => a + (Number(r[1]) || 0), 0);
  out.docRowSum = 표합;
  out.docTotal = Number(share.t) || 0;
  out.docGapPct = out.docTotal > 0 ? (out.docTotal - 표합) / out.docTotal : 0;

  /* 🔴 고객 연락처가 payload에 실리면 안 된다 — 링크를 아는 사람은 누구나 본다(WC) */
  const payloadStr = JSON.stringify(share);
  if (payloadStr.includes(p.contactTel)) 문제(t, 'TEL_IN_PAYLOAD', '🔴 연락처가 견적서 payload에 실렸다', p.contactTel);
  /* 그리고 감춘 수익 줄이 새면 안 된다 */
  const leaked = (share.rows || []).filter((r) => /수익|보험/.test(String(r[0])));
  if (leaked.length) 문제(t, 'MUTED_LEAK', '🔴 감춰야 할 항목이 고객 문서에 실렸다', leaked.map((r) => r[0]).join(','));

  /* ── ⑤ 🔴 **견적서는 두 벌이다** — 팝업 문서도 읽는다 ──────────────
     `openEstimateWindow`(계산 직후 그 자리에서 인쇄·PDF)와 `estimate-view.html`
     (카톡으로 전달되는 정식 문서)은 **같은 견적인데 그리는 코드가 다르다.**
     그래서 한쪽만 고쳐지는 일이 반복됐다 — XP에서 견적번호가 링크 쪽에만 있어서
     팝업에서 인쇄한 고객은 부를 이름이 없었다.
   ⚠ **팝업에는 항목별 금액이 없다 — 일부러 그렇다.** 없다고 결함이라 부르지 말 것. */
  const pop = (log.opened || [])[0];
  if (!pop) {
    문제(t, 'NO_POPUP', '「견적서 받기」를 눌렀는데 인쇄용 문서가 안 열렸다', '');
  } else {
    const ptxt = shownText(pop.document.body);
    out.popupLen = ptxt.length;
    out.popupText = ptxt;   /* ⑪에서 링크 견적서와 대조한다 */
    /* 🔴 파일로 남길 것 — **창을 닫기 전에** 글자로 떠 둔다(닫으면 못 읽는다).
       ⚠ 손님 한 명 것만 살아 있게 곧바로 파일로 흘리고 비운다. 전부 들고 있다가
         힙이 세 번 터졌다. */
    if (DOCS) out.popupHtml = pop.document.documentElement.outerHTML;
    if (ptxt.length < 200) {
      문제(t, 'POPUP_EMPTY', '🔴 인쇄용 견적서가 사실상 비어 있다', String(ptxt.length) + '자');
    } else {
      if (!ptxt.includes(won(rec.total))) 문제(t, 'POPUP_NO_TOTAL', '🔴 인쇄용 견적서에 총액이 없다', won(rec.total));
      if (!ptxt.includes(won(rec.perPerson))) 문제(t, 'POPUP_NO_PP', '인쇄용 견적서에 1인 금액이 없다', won(rec.perPerson));
      if (!ptxt.includes(p.destKey)) 문제(t, 'POPUP_NO_DEST', '인쇄용 견적서에 목적지가 없다', p.destKey);
      if (!ptxt.includes(String(p.participants))) 문제(t, 'POPUP_NO_PAX', '인쇄용 견적서에 인원이 없다', String(p.participants));
      /* 🔴 XP가 고친 자리 — 인쇄한 고객도 부를 이름이 있어야 한다 */
      const fixNo = (fx.shares && fx.shares.quoteNo) || '';
      if (fixNo && !ptxt.includes(fixNo)) 문제(t, 'POPUP_NO_QNO', '🔴 인쇄용 견적서에 견적번호가 없다', fixNo);
      /* 🔴 WQ가 고친 자리 — 인쇄본에 유효기간이 한 줄도 없었다 */
      if (!/유효|만료/.test(ptxt)) 문제(t, 'POPUP_NO_VALIDITY', '인쇄용 견적서에 유효기간이 없다', '');
      /* 🔴 감춘 수익이 새면 안 된다. 같은 값을 두 곳에서 각자 거르므로 새는 자리가 둘이다 */
      if (/ENBT 수익|현지 수익금/.test(ptxt)) 문제(t, 'POPUP_MUTED_LEAK', '🔴 인쇄용 견적서에 수익 항목이 그려졌다', '');
      if (ptxt.includes(p.contactTel)) 문제(t, 'POPUP_HAS_TEL', '🔴 인쇄용 견적서에 연락처가 찍혔다', p.contactTel);
      if (pop.__err && pop.__err.length) 문제(t, 'POPUP_ERROR', '인쇄용 견적서가 오류를 냈다', pop.__err.join(' | '));
    }
  }

  /* 🔴 **결재에 붙이는 표 파일까지 실제로 만들어 본다.**
     고객은 「엑셀」 버튼을 누른다. 우리 하네스에는 xlsx 라이브러리가 없으므로
     `sheet_download.js`가 **CSV로 떨어뜨린다** — 기관·대기업 망에서 남의 CDN이 막혔을 때
     고객이 받는 것과 **같은 파일**이다(XK가 만든 폴백).
   ⚠ 화면이 쓰는 `__toCsv`를 그대로 부른다. 여기서 CSV를 다시 만들면 BOM·따옴표 규칙이
     갈라져, 정작 고객 파일이 깨져도 이 검사는 멀쩡하다고 말한다(결함 생성기 ①). */
  if (typeof win.downloadEstimateExcel === 'function') {
    const realDownload = win.downloadSheet;
    let aoa = null;
    try {
      win.downloadSheet = (rows) => { aoa = rows; return 'csv'; };
      win.downloadEstimateExcel();
      out.sheetRows = aoa ? aoa.length : 0;
      if (!aoa) 문제(t, 'NO_SHEET', '엑셀 버튼이 표를 안 만들었다', '');
      else if (DOCS && typeof win.__toCsv === 'function') out.csvText = win.__toCsv(aoa);
    } catch (e) {
      문제(t, 'SHEET_ERROR', '엑셀을 만들다 터졌다', String(e.message || e));
    } finally { win.downloadSheet = realDownload; }
    /* 🔴 표에도 감춘 수익과 연락처가 없어야 한다 — 고객이 그대로 결재에 붙인다 */
    if (aoa) {
      const flat = aoa.map((r) => (Array.isArray(r) ? r.join(' ') : String(r))).join(' | ');
      if (/ENBT 수익|현지 수익금/.test(flat)) 문제(t, 'SHEET_MUTED_LEAK', '🔴 엑셀에 수익 항목이 실렸다', '');
      if (flat.includes(p.contactTel)) 문제(t, 'SHEET_HAS_TEL', '🔴 엑셀에 연락처가 실렸다', p.contactTel);
      if (!/견적 유효기간/.test(flat)) 문제(t, 'SHEET_NO_VALIDITY', '엑셀에 유효기간이 없다', '');
    }
  }

  /* ── ⑥ 서버의 진짜 검증기 ──────────────────────────────────────── */
  const verifyPayload = req.body.quote || share;
  const v = verifyQuote(verifyPayload, ctx);
  out.verdict = v.verdict;
  out.failedSteps = v.failedSteps || [];
  if (!v.ok) {
    문제(t, 'VERIFY_REVIEW', '🔴 검증을 못 넘겨 고객이 링크를 못 받는다',
      (v.failedSteps || []).join(', ') + ' | '
      + (v.steps || []).filter((s) => !s.ok).map((s) => s.label + ': ' + s.detail).join(' / '));
  }

  /* ── ⑧ 상담 신청(리드) — **견적보다 이쪽이 돈에 더 가깝다** ─────────
     견적은 고객이 스스로 뽑는 값이지만, 상담 신청은 **사람이 답을 기다리는 건**이다.
     여기서 조용히 실패하면 리드가 사라지고, 우리는 사라진 줄도 모른다.
   🔴 **길이 둘이다. 성격이 다르므로 기대도 달라야 한다.**
     · `#inqForm` — 첫 화면 아래의 **일반 문의**. 견적과 무관하다. 연결을 기대하면
       그건 없는 결함이다(실제로 6명 전부를 그렇게 잡았다가 되돌렸다).
     · `submitConsult()` — **방금 낸 견적을 들고** 「바로 연락 요청」하는 길.
       여기서는 견적과 이어지는 것이 핵심이다 — 안 이어지면 담당자가 같은 건인 줄 모른다. */
  const inq = doc.getElementById('inqForm');
  if (!inq) {
    문제(t, 'NO_INQ_FORM', '일반 문의 폼이 화면에 없다', '');
  } else {
    const before = log.requests.length;
    set('inqName', String(p.contactName));
    set('inqOrg', String(p.organization));
    set('inqTel', p.contactTel);
    set('inqMsg', String(p.requestDetails).slice(0, 200));
    await tick(80);
    const inqBad = Array.from(inq.querySelectorAll('input, textarea, select')).filter((el) => {
      if (el.type === 'hidden' || el.disabled) return false;
      if (el.hasAttribute('required') && !String(el.value || '').trim()) return true;
      return !!(el.validity && !el.validity.valid);
    });
    if (inqBad.length) 문제(t, 'INQ_BLOCKED', '일반 문의가 막힌다',
      inqBad.map((e) => (e.id || e.name) + '=[' + e.value + ']').join(', '));
    inq.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await tick(320);
    const sent = log.requests.slice(before).find((r) => /\/api\/inquiries/.test(r.url));
    out.inquirySent = !!sent;
    if (!sent) {
      문제(t, 'INQ_NOT_SENT', '🔴 일반 문의를 눌렀는데 서버로 아무것도 안 갔다',
        log.says.map((s) => s.text).join(' | '));
    } else {
      /* 🔴 **JSON 문자열로 대조하지 않는다** (XS). 이름에 따옴표가 들어간 손님
         (`김"따옴`)에서 「이름이 안 실렸다」가 나왔는데, 실렸다 — `JSON.stringify`가
         `\"`로 이스케이프해서 `includes`가 못 찾은 것뿐이다. **검사가 틀린 것**이고,
         하마터면 멀쩡한 코드를 고칠 뻔했다.
       ⚠ 값이 든 칸을 **직접** 본다. 어떤 칸에 담기는지는 화면이 정한다 — 여기서
         다시 정하지 않는다(`name`/`org`/`tel`은 `#inqForm` 핸들러가 만드는 이름이다). */
      const b0 = sent.body || {};
      [['contactName', '이름', 'name'], ['organization', '소속', 'org'], ['contactTel', '연락처', 'tel']]
        .forEach(([k, ko, key]) => {
          if (String(b0[key] || '') !== String(p[k])) 문제(t, 'INQ_NO_' + k.toUpperCase(),
            '일반 문의에 ' + ko + '이(가) 안 실렸다', '보낸 값 [' + (b0[key] || '') + '] vs 적은 값 [' + p[k] + ']');
        });
    }
  }

  /* ── ⑨ 견적 기반 상담 신청 — 방금 낸 견적을 들고 연락을 요청한다 ── */
  if (typeof win.submitConsult === 'function') {
    const before2 = log.requests.length;
    const cName = doc.getElementById('consultName');
    const cTel = doc.getElementById('consultTel');
    if (!cName || !cTel) {
      문제(t, 'NO_CONSULT_FORM', '견적 기반 상담 신청 칸이 없다', '');
    } else {
      if (typeof win.openConsultForm === 'function') win.openConsultForm();
      await tick(80);
      set('consultName', String(p.contactName));
      set('consultTel', p.contactTel);
      await tick(60);
      win.submitConsult();
      await tick(320);
      const csent = log.requests.slice(before2).find((r) => /\/api\/inquiries/.test(r.url));
      out.consultSent = !!csent;
      if (!csent) {
        문제(t, 'CONSULT_NOT_SENT', '🔴 견적 기반 상담 신청이 서버로 안 갔다',
          log.says.slice(-2).map((s) => s.text).join(' | '));
      } else {
        const b = csent.body || {};
        /* 🔴 담당자가 같은 건인 줄 알아야 한다 */
        if (!b.linkedQuoteId) 문제(t, 'CONSULT_NOT_LINKED',
          '🔴 상담 신청이 방금 낸 견적과 안 이어졌다', Object.keys(b).join(','));
        if (!b.estimate || !(b.estimate.total > 0)) 문제(t, 'CONSULT_NO_SNAPSHOT',
          '상담 신청에 견적 내용이 안 실렸다', JSON.stringify(b.estimate || null).slice(0, 120));
        /* 🔴 고객은 견적 폼에 **소속을 이미 적었다.** 그걸 안 실으면 담당자는
           「누구 회사인지 모르는 연락처」를 받는다 — 기업 고객에게 다시 물어야 한다. */
        if (!String(b.org || '').trim()) 문제(t, 'CONSULT_NO_ORG',
          '🔴 상담 신청에 소속이 빈 채로 나간다(고객은 견적 폼에 적었다)',
          '적은 값: ' + p.organization);
        /* 감춘 수익이 리드 본문으로 새면 안 된다 — 여기도 같은 값을 각자 거른다 */
        const cflat = JSON.stringify(b);
        if (/ENBT 수익|현지 수익금/.test(cflat)) 문제(t, 'CONSULT_MUTED_LEAK',
          '🔴 상담 신청 본문에 수익 항목이 실렸다', '');
      }
    }
  }

  /* ── ⑩ 서버가 저장하는 모양 그대로 만들어 견적서를 그린다 ─────── */
  /* 🔴 **팝업 창을 닫는다** (XS). `_page_boot`의 `win.open()`은 진짜 JSDOM 창을 만들고
     `log.opened`에 담아 둔다. 안 닫으면 그 창의 타이머(`stepTimers`·저장 결과 약속)가
     살아 있어 **창 하나가 통째로 안 지워진다** — 350명에서 힙 6GB를 넘겨 죽었다.
     두 번째로 같은 자리에서 죽었다(처음엔 견적서 HTML을 들고 있어서). */
  (log.opened || []).forEach((wOpened) => { try { wOpened.close(); } catch (e) { /* 이미 닫혔다 */ } });

  const qno = 'V' + ymd(new Date()).slice(2).replace(/-/g, '') + '-' + String(p.no).padStart(4, '0');
  const payload = Object.assign({}, share, {
    iso: share.iso || ymd(new Date()),
    qno,
    _verify: { verdict: v.verdict, failedSteps: v.failedSteps || [], at: new Date().toISOString(), issuedBy: 'auto' },
  });
  out.qno = qno;
  win.close();

  const V = bootPage('estimate-view.html', { query: '?id=virtual', fixtures: { shareDoc: payload } });
  await V.ready; await V.tick(320);
  const docText = shownText(V.doc.body);
  out.docLen = docText.length;
  /* 🔴 **견적서 HTML을 결과 배열에 들고 있지 않는다** — 한 장이 800KB 안팎이라
     300명을 태우니 힙이 4GB를 넘겨 그 자리에서 죽었다(실측). 쓸 곳이 정해지는
     시점에 바로 파일로 흘리고, 메모리에는 길이만 남긴다.
     ⚠ 「나중에 한꺼번에 쓰자」가 이 도구를 못 쓰게 만들었다. */
  if (DOCS) out.docHtml = V.doc.documentElement.outerHTML;

  if (V.log.errors.length) 문제(t, 'DOC_ERROR', '견적서 화면이 오류를 냈다', V.log.errors.map((e) => e.msg).join(' | '));
  if (docText.length < 200) 문제(t, 'DOC_EMPTY', '🔴 견적서가 사실상 비어 있다', String(docText.length) + '자');
  if (!docText.includes(won(share.t))) 문제(t, 'DOC_NO_TOTAL', '🔴 견적서에 총액이 없다', won(share.t));
  if (!docText.includes(qno)) 문제(t, 'DOC_NO_QNO', '견적서에 견적번호가 없다', qno);
  if (!docText.includes(p.destKey) && !docText.includes(String(share.dt || ''))) {
    문제(t, 'DOC_NO_DEST', '견적서에 목적지가 없다', p.destKey + ' / ' + share.dt);
  }
  if (!docText.includes(String(p.participants))) 문제(t, 'DOC_NO_PAX', '견적서에 인원이 없다', String(p.participants));
  /* XD — 받으시는 분의 이름이 문서에 있어야 한다(공문이다) */
  /* ⚠ 문서에 그려진 **글자**를 보는 것이라 이스케이프 함정은 없다(위 JSON 건과 다르다).
     다만 화면이 HTML로 이스케이프해 그리므로 `&`·`<`가 든 이름은 글자로는 그대로 보인다. */
  const 이름조각 = String(p.contactName).replace(MARK, '').trim();
  if (이름조각 && !docText.includes(이름조각)) 문제(t, 'DOC_NO_NAME', '견적서에 받는 사람 이름이 없다', 이름조각);
  /* 🔴 연락처는 반대로 **있으면 안 된다** */
  if (docText.includes(p.contactTel)) 문제(t, 'DOC_HAS_TEL', '🔴 견적서에 연락처가 찍혔다', p.contactTel);
  /* 유효기간 — WQ에서 인쇄본에 한 줄도 없던 자리 */
  if (!/유효|만료/.test(docText)) 문제(t, 'DOC_NO_VALIDITY', '견적서에 유효기간 문구가 없다', '');
  /* 감춘 수익 줄이 그려지면 안 된다 */
  if (/ENBT 수익|현지 수익금/.test(docText)) 문제(t, 'DOC_MUTED_LEAK', '🔴 견적서에 수익 항목이 그려졌다', '');

  /* ── ⑪ 🔴 **두 벌을 서로 대조한다** ────────────────────────────────
     이 저장소는 같은 결함을 네 번 겪었다 — 견적번호(XP) · 유효기간 인쇄(WQ) ·
     일정(XC) · 유효기간 팝업(XS). 전부 **한 벌만 고쳐진** 것이다.
     그래서 「무엇이 빠졌나」를 사람이 매번 세지 말고, **두 문서가 같은 사실을 말하는지**를
     기계가 대조한다. 한쪽에만 있으면 그게 다음 XP다.
   ⚠ 팝업에 **항목별 금액이 없는 것은 일부러다.** 그건 대조 목록에 넣지 않는다. */
  const FACTS = [
    ['총액', won(rec.total)],
    ['1인 금액', won(rec.perPerson)],
    ['목적지', p.destKey],
    ['인원', String(p.participants)],
    ['기관명', String(p.organization).replace(MARK, '').trim()],
    ['담당자', String(p.contactName).replace(MARK, '').trim()],
  ];
  const onlyIn = { 인쇄용: [], 링크: [] };
  FACTS.forEach(([name, v]) => {
    if (!v) return;
    const inPop = out.popupText ? out.popupText.includes(v) : null;
    const inDoc = docText.includes(v);
    if (inPop === null) return;
    if (inPop && !inDoc) onlyIn.인쇄용.push(name);
    if (!inPop && inDoc) onlyIn.링크.push(name);
  });
  /* 조건은 **둘 다** 말해야 한다 */
  [['유효기간', /유효기간|만료/], ['요율 기준', /요율 기준/]].forEach(([name, re]) => {
    const inPop = out.popupText ? re.test(out.popupText) : null;
    const inDoc = re.test(docText);
    if (inPop === null) return;
    if (inPop && !inDoc) onlyIn.인쇄용.push(name);
    if (!inPop && inDoc) onlyIn.링크.push(name);
  });
  out.onlyIn = onlyIn;
  if (onlyIn.인쇄용.length || onlyIn.링크.length) {
    문제(t, 'TWO_DOCS_DIFFER', '🔴 견적서 두 벌이 서로 다른 것을 말한다',
      '인쇄용에만: ' + (onlyIn.인쇄용.join(', ') || '없음')
      + ' · 링크에만: ' + (onlyIn.링크.join(', ') || '없음'));
  }

  V.win.close();
  /* 메모리로 죽지 않게 큰 글자는 놓아준다 */
  out.popupText = null;
  return out;
}

/* ─────────────────────────────────────────────────────────────────────── */
(async () => {
  console.log('\n가상 고객 ' + N + '명을 우리 서비스에 태운다 (씨앗 ' + SEED + ')');
  console.log('결과 폴더: ' + OUT);

  let rates;
  try {
    const r = await fetch(BASE + '/api/rates');
    rates = await r.json();
  } catch (e) {
    console.log('🔴 운영 요율을 못 받았다 — ' + e.message + '\n   기본값으로 재면 고객 금액이 아니다. 멈춘다.');
    process.exit(1);
  }
  console.log('운영 요율 오버라이드 ' + Object.keys(rates.overrides || {}).length + '곳을 받았다\n');

  /* 서버 검증기가 보는 것과 **같은 권위 데이터**를 만든다.
     ⚠ 서버는 DB에서 직접 읽는다(`loadContext`). 여기서는 그 값을 공개 GET으로 받는다 —
       같은 값이지만 **경로가 다르다**는 것을 기억할 것. */
  const ctx = {
    overrides: rates.overrides || {},
    coefficients: Array.isArray(rates.coefficients) ? null : (rates.coefficients || null),
    customRow: null,
  };

  fs.mkdirSync(OUT, { recursive: true });

  /* 무작위 손님만으로는 가장자리를 못 만난다 — 300명이 전부 통과한 뒤에 안 사실이다.
     `--edge`는 일부러 까다로운 손님, `--sweep`은 **목적지 60곳 전수**다. */
  const people = [];
  if (process.argv.includes('--edge')) people.push(...makeEdges(people.length + 1));
  if (process.argv.includes('--sweep')) people.push(...makeSweep(people.length + 1));
  if (!people.length || process.argv.includes('--mix')) people.push(...makeAll(N, SEED).map((x, i) => Object.assign(x, { no: people.length + i + 1 })));
  const results = [];
  const t0 = Date.now();
  for (const p of people) {
    let res;
    try { res = await runOne(p, rates, ctx); }
    catch (e) {
      res = { no: p.no, persona: p, trouble: [{ code: 'CRASH', say: '🔴 손님을 태우다 터졌다', detail: String(e && e.stack || e).slice(0, 600) }] };
    }
    results.push(res);

    /* 손님마다 한 폴더. 🔴 **견적서 파일은 기본으로 남긴다** — 대표가 눈으로 보셔야 한다.
       파일 이름에 번호를 붙인 이유는 **고객이 겪는 순서**로 정렬되게 하기 위해서다. */
    const bad = res.trouble.length > 0;
    if (DOCS || bad || KEEP_ALL) {
      const label = p.edge ? p.edge : (p.destKey + '_' + p.participants + '명_' + p.days + '일');
      const dirName = safe(String(p.no).padStart(4, '0') + '_' + label + (bad ? '_문제' : ''));
      const dir = path.join(OUT, dirName);
      fs.mkdirSync(dir, { recursive: true });
      res.dirName = dirName;
      fs.writeFileSync(path.join(dir, '1. 고객이 넣은 내용.md'), 요청카드(p, res), 'utf8');

      if (res.docHtml) {
        fs.writeFileSync(path.join(dir, '2. 견적서 (카톡으로 보내는 것).html'),
          볼수있게(res.docHtml,
            '이 파일은 <b>고객에게 카카오톡으로 보내는 견적서</b>를 그대로 저장한 것입니다 · '
            + '가상 고객 ' + p.no + '번 · 실제 발급이 아닙니다'), 'utf8');
        res.hasDoc = true;
      }
      if (res.popupHtml) {
        fs.writeFileSync(path.join(dir, '3. 견적서 (인쇄·PDF용).html'),
          볼수있게(res.popupHtml,
            '이 파일은 고객이 계산 직후 <b>인쇄하거나 PDF로 저장하는 문서</b>입니다 · '
            + '브라우저에서 <b>Ctrl+P</b>를 누르면 실제 인쇄 모양을 보실 수 있습니다 · '
            + '(일정 코스 A/B 탭 전환은 저장본에서 동작하지 않습니다 — 고른 코스가 보입니다)'), 'utf8');
        res.hasPopup = true;
      }
      if (res.csvText) {
        /* ⚠ 화면이 만든 문자열 그대로 쓴다. 맨 앞의 BOM이 있어야 엑셀이 한글을 안 깨뜨린다. */
        fs.writeFileSync(path.join(dir, '4. 견적서 (엑셀에서 여는 표).csv'), res.csvText, 'utf8');
        res.hasCsv = true;
      }
      fs.writeFileSync(path.join(dir, '5. 자세한 기록.json'), JSON.stringify({
        record: res.record, verdict: res.verdict, failedSteps: res.failedSteps,
        qno: res.qno, trouble: res.trouble, rateSource: res.rateSource,
        /* 검사가 **실제로 돌았는지**를 남긴다 — 안 돌고 초록인 것과 구별이 안 되면
           그 초록은 거짓말이다(결함 생성기 ③). */
        읽은글자: { 인쇄용: res.popupLen || 0, 링크: res.docLen || 0 },
        엑셀줄수: res.sheetRows || 0,
        견적서표합: res.docRowSum, 견적서총액: res.docTotal,
      }, null, 2), 'utf8');
    }

    /* 🔴 **큰 글자는 여기서 놓아준다.** 전부 들고 있다가 힙이 세 번 터졌다. */
    res.docHtml = null; res.popupHtml = null; res.csvText = null; res.popupText = null;
    res.persona = { no: p.no, destKey: p.destKey, participants: p.participants, days: p.days,
      programType: p.programType, organizationType: p.organizationType };
    if (res.record) res.record.items = res.record.items.length;

    if (!QUIET) {
      const mark = res.trouble.length ? '🔴 ' + res.trouble.map((x) => x.code).join(',') : '✓';
      console.log('  ' + String(p.no).padStart(4) + ' ' + (p.edge || p.destKey).slice(0, 22).padEnd(23)
        + String(p.participants).padStart(4) + '명 ' + p.days + '일  '
        + (res.record ? won(res.record.perPerson).padStart(11) + '원/인' : '     —      ')
        + '  ' + (res.verdict || '-').padEnd(9) + mark);
    } else if (p.no % 25 === 0) {
      /* ⚠ 힙을 함께 찍는다. 세 번 터진 자리라, 다시 새면 **어디서부터** 새는지
         숫자로 보여야 한다(끝나고 나서 스택만 보면 원인을 못 찾는다). */
      const heap = Math.round(process.memoryUsage().heapUsed / 1048576);
      console.log('  ... ' + p.no + '/' + people.length + ' ('
        + Math.round((Date.now() - t0) / 1000) + '초 · 힙 ' + heap + 'MB)');
    }
  }

  요약쓰기(results, OUT, Date.now() - t0);
  process.exit(0);
})();

function 요청카드(p, res) {
  const L = [];
  L.push('# ' + p.organization + ' — ' + p.destKey + ' ' + p.participants + '명 ' + p.days + '일');
  L.push('');
  L.push('> 🔴 **가상 고객입니다.** 실재하지 않는 회사·사람·연락처입니다.');
  L.push('> 이 폴더는 `ai-loop/virtual_journey.js`가 만든 점검 기록입니다.');
  L.push('');
  L.push('## 손님이 요청한 것');
  L.push('');
  L.push('| 항목 | 값 |');
  L.push('|---|---|');
  L.push('| 목적지 | ' + p.destKey + ' |');
  L.push('| 인원 / 일수 | ' + p.participants + '명 / ' + p.days + '일 |');
  L.push('| 출발 | ' + p.startDate + ' (' + p.leadDays + '일 뒤) · ' + p.departureText + ' 출발 |');
  L.push('| 목적 | ' + p.programText + ' · ' + p.orgTypeText + ' |');
  L.push('| 좌석 / 호텔 / 객실 | ' + p.cabinClass + ' / ' + p.hotelGrade + ' / ' + p.roomConfig + ' |');
  L.push('| 포함 | ' + [p.incHotel && '호텔', p.incMeal && '식사', p.incVehicle && '차량',
    p.incGuide && '가이드', p.incSightseeing && '관광', p.incGolf && '골프', p.incDomestic && '국내수송']
    .filter(Boolean).join(' · ') + ' |');
  if (p.agencyVisits) L.push('| 기관 방문 | ' + p.agencyVisits + '회 |');
  if (p.vipCount) L.push('| 1인 1실 | ' + p.vipCount + '명 |');
  L.push('| 담당자 | ' + p.contactName + ' (' + p.contactTel + ') |');
  L.push('');
  L.push('**요청 내용**: ' + p.requestDetails);
  L.push('');
  L.push('## 우리 서비스가 낸 답');
  L.push('');
  if (res.record) {
    L.push('- **총액 ' + won(res.record.total) + '원** · 1인 ' + won(res.record.perPerson) + '원');
    L.push('- 검증 결과: **' + (res.verdict || '—') + '**'
      + (res.verdict === 'verified' ? ' (고객이 견적서 링크를 바로 받는다)' : ' (담당자 확인이 필요하다 — 링크가 안 나간다)'));
    if (res.qno) L.push('- 견적번호: ' + res.qno);
    L.push('');
    L.push('| 항목 | 금액 |');
    L.push('|---|---:|');
    res.record.items.forEach((r) => L.push('| ' + r.name + (r.hidden ? ' *(고객에게 감춤)*' : '') + ' | ' + won(r.amount) + ' |'));
  } else {
    L.push('🔴 **견적이 안 나왔다.**');
  }
  L.push('');
  if (res.trouble.length) {
    L.push('## 🔴 생긴 문제');
    L.push('');
    res.trouble.forEach((x) => L.push('- **' + x.code + '** — ' + x.say + (x.detail ? '\n  - ' + x.detail : '')));
  } else {
    L.push('## 문제 없음');
  }
  return L.join('\n') + '\n';
}

/* ─────────────────────────────────────────────────────────────────────────
   🔴 **한 파일만 열면 전부 보이게** (2026-08-27 대표 지시)
   폴더가 수백 개면 아무도 안 연다. 그래서 맨 위에 **모아보기 한 장**을 둔다 —
   손님 목록에서 바로 그 손님의 견적서 세 형태로 건너뛴다.
 ⚠ 링크는 폴더 이름을 그대로 쓴다. 한글·공백이 들어가므로 `encodeURIComponent`로 감싼다
   (안 하면 이름에 공백이 있는 폴더가 통째로 안 열린다).
   ───────────────────────────────────────────────────────────────────────── */
function 모아보기쓰기(results, dir, ms) {
  const esc = (x) => String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const link = (folder, file) => encodeURIComponent(folder) + '/' + encodeURIComponent(file);

  const ok = results.filter((r) => r.record && r.record.total > 0);
  const verified = results.filter((r) => r.verdict === 'verified');
  const bad = results.filter((r) => r.trouble.length);

  const rows = results.map((r) => {
    const p = r.persona || {};
    const f = r.dirName;
    const 문서 = !f ? '<span class="none">파일 없음</span>' : [
      r.hasDoc ? '<a href="' + link(f, '2. 견적서 (카톡으로 보내는 것).html') + '">카톡용</a>' : '',
      r.hasPopup ? '<a href="' + link(f, '3. 견적서 (인쇄·PDF용).html') + '">인쇄용</a>' : '',
      r.hasCsv ? '<a href="' + link(f, '4. 견적서 (엑셀에서 여는 표).csv') + '">엑셀</a>' : '',
      '<a class="sub" href="' + link(f, '1. 고객이 넣은 내용.md') + '">넣은 내용</a>',
    ].filter(Boolean).join(' · ');
    const 상태 = r.trouble.length
      ? '<span class="bad">' + esc(r.trouble.map((x) => x.code).join(', ')) + '</span>'
      : (r.verdict === 'verified' ? '<span class="good">링크 받음</span>'
        : '<span class="warn">' + esc(r.verdict || '견적 없음') + '</span>');
    return '<tr>'
      + '<td class="no">' + esc(String(r.no).padStart(4, '0')) + '</td>'
      + '<td>' + esc(p.edge || p.destKey || '—') + '</td>'
      + '<td class="num">' + esc(p.participants) + '명 · ' + esc(p.days) + '일</td>'
      + '<td class="won">' + (r.record ? won(r.record.perPerson) : '—') + '</td>'
      + '<td class="won">' + (r.record ? won(r.record.total) : '—') + '</td>'
      + '<td>' + 상태 + '</td>'
      + '<td class="docs">' + 문서 + '</td>'
      + '</tr>';
  }).join('\n');

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>가상 고객 견적서 모아보기</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif;
         color:#1A1A1A; background:#F7F6F3; }
  .warnbar { background:#FFF8E6; border-bottom:2px solid #F0D89A; color:#7A5A10;
             padding:12px 20px; text-align:center; font-weight:700; }
  .wrap { max-width:1100px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:22px; margin:18px 0 6px; }
  .sub1 { color:#6B6B6B; margin-bottom:22px; }
  .cards { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
  .card { background:#fff; border:1px solid #E5E2DC; padding:14px 18px; min-width:150px; }
  .card b { display:block; font-size:24px; margin-bottom:2px; }
  .card span { color:#6B6B6B; font-size:12px; }
  .card.hl b { color:#CC001A; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #E5E2DC; }
  th, td { padding:9px 10px; border-bottom:1px solid #EFEDE8; text-align:left; vertical-align:top; }
  th { background:#FAF9F7; font-size:12px; color:#6B6B6B; position:sticky; top:0; }
  td.no { color:#9A9A9A; font-variant-numeric:tabular-nums; }
  td.num, td.won { white-space:nowrap; font-variant-numeric:tabular-nums; }
  td.won { text-align:right; }
  td.docs a { color:#CC001A; text-decoration:none; border-bottom:1px solid #F0C9CF; }
  td.docs a:hover { border-bottom-color:#CC001A; }
  td.docs a.sub { color:#8A8A8A; border-bottom-color:#E5E2DC; }
  .good { color:#1A7F4B; } .warn { color:#B07A00; } .bad { color:#CC001A; font-weight:700; }
  .none { color:#B0B0B0; }
  .foot { margin-top:26px; color:#6B6B6B; font-size:13px; line-height:1.9; }
  @media (max-width:700px){ .won, th:nth-child(5), td:nth-child(5){ display:none } }
</style></head>
<body>
<div class="warnbar">🔴 전부 <b>가상 고객</b>입니다 — 실재하는 회사·사람·연락처가 아니고, 운영 DB에 아무것도 쓰지 않았습니다</div>
<div class="wrap">
  <h1>가상 고객이 받은 견적서</h1>
  <div class="sub1">손님을 지어 <b>실제 화면에 태우고</b>, 고객이 손에 쥐는 세 형태를 그대로 저장했습니다.<br>
    요율은 프로덕션 운영값을 받아 계산했습니다 · 만든 때 ${esc(new Date().toLocaleString('ko-KR'))} · ${Math.round(ms / 1000)}초</div>

  <div class="cards">
    <div class="card"><b>${results.length}</b><span>태운 손님</span></div>
    <div class="card"><b>${ok.length}</b><span>견적이 나온 손님</span></div>
    <div class="card hl"><b>${verified.length}</b><span>견적서 링크를 받은 손님</span></div>
    <div class="card"><b>${bad.length}</b><span>문제가 난 손님</span></div>
  </div>

  <table>
    <thead><tr><th>번호</th><th>목적지 / 조건</th><th>규모</th><th>1인</th><th>총액</th><th>결과</th><th>견적서 열기</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <div class="foot">
    <b>「카톡용」</b> — 고객에게 링크로 전달되는 정식 견적서입니다.<br>
    <b>「인쇄용」</b> — 고객이 계산 직후 인쇄하거나 PDF로 저장하는 문서입니다. 열고 <b>Ctrl+P</b>를 누르면 실제 인쇄 모양이 보입니다.<br>
    <b>「엑셀」</b> — 결재에 붙이는 표 파일입니다. 엑셀에서 바로 열립니다.<br>
    ⚠ 저장본이라 <b>탭 전환·버튼은 동작하지 않습니다</b>(고른 코스 한 벌이 보입니다). 금액·문구는 고객이 보는 것과 같습니다.<br>
    ⚠ 이 도구가 통과했다고 「프로덕션에서 사람이 눌러 봤다」는 뜻은 아닙니다 — 그 확인은 <code>smoke_prod_journey.js</code>가 따로 합니다.
  </div>
</div>
</body></html>`;
  fs.writeFileSync(path.join(dir, '_모아보기.html'), html, 'utf8');
}

function 요약쓰기(results, dir, ms) {
  const bad = results.filter((r) => r.trouble.length);
  const byCode = new Map();
  bad.forEach((r) => r.trouble.forEach((x) => {
    if (!byCode.has(x.code)) byCode.set(x.code, { say: x.say, list: [] });
    byCode.get(x.code).list.push(r);
  }));
  const codes = [...byCode.entries()].sort((a, b) => b[1].list.length - a[1].list.length);

  const okQuotes = results.filter((r) => r.record && r.record.total > 0);
  const verified = results.filter((r) => r.verdict === 'verified');
  const pps = okQuotes.map((r) => r.record.perPerson).sort((a, b) => a - b);
  const med = pps.length ? pps[Math.floor(pps.length / 2)] : 0;

  const L = [];
  L.push('# 가상 고객 ' + results.length + '명 — 점검 결과');
  L.push('');
  L.push('> 🔴 **전부 가상입니다.** 실재하는 회사·사람·연락처가 아니고, **운영 DB에 아무것도 쓰지 않았습니다.**');
  L.push('> 요율만 프로덕션 값을 받아 왔습니다(고객이 겪는 금액으로 재려고).');
  L.push('> 만든 것: `ai-loop/virtual_journey.js` · ' + new Date().toLocaleString('ko-KR'));
  L.push('');
  L.push('## 한눈에');
  L.push('');
  L.push('| | 건수 | |');
  L.push('|---|---:|---|');
  L.push('| 태운 손님 | ' + results.length + ' | ' + Math.round(ms / 1000) + '초 |');
  L.push('| 견적이 나온 손님 | ' + okQuotes.length + ' | ' + Math.round(okQuotes.length / results.length * 100) + '% |');
  L.push('| 🔴 **견적서 링크를 받는 손님** | ' + verified.length + ' | **' + Math.round(verified.length / results.length * 100) + '%** — 나머지는 「담당자 확인」으로 떨어진다 |');
  L.push('| 문제가 하나라도 난 손님 | ' + bad.length + ' | ' + Math.round(bad.length / results.length * 100) + '% |');
  L.push('| 1인 금액 중앙값 | ' + won(med) + '원 | |');
  L.push('');
  L.push('## 문제를 종류별로');
  L.push('');
  if (!codes.length) L.push('문제 없음.');
  else {
    L.push('| 코드 | 무엇이 | 몇 명 | 예 |');
    L.push('|---|---|---:|---|');
    codes.forEach(([code, v]) => {
      const ex = v.list[0];
      L.push('| `' + code + '` | ' + v.say + ' | ' + v.list.length + ' | ' + ex.persona.destKey + ' ' + ex.persona.participants + '명 |');
    });
  }
  L.push('');
  L.push('## 검증에서 떨어진 이유 (고객이 링크를 못 받는 자리)');
  L.push('');
  const stepCount = new Map();
  results.forEach((r) => (r.failedSteps || []).forEach((s) => stepCount.set(s, (stepCount.get(s) || 0) + 1)));
  if (!stepCount.size) L.push('없음 — 전부 통과했다.');
  else {
    L.push('| 단계 | 몇 명 |');
    L.push('|---|---:|');
    [...stepCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([s, n]) => L.push('| `' + s + '` | ' + n + ' |'));
  }
  L.push('');
  L.push('## 🔴 고객이 견적서의 표를 더하면 TOTAL과 얼마나 벌어지나');
  L.push('');
  const gaps = results.filter((r) => r.docTotal > 0).map((r) => r.docGapPct).sort((a, b) => a - b);
  if (gaps.length) {
    const pc = (x) => (x * 100).toFixed(1) + '%';
    L.push('| 최소 | 사분위 | 중앙 | 사분위 | 최대 |');
    L.push('|---:|---:|---:|---:|---:|');
    L.push('| ' + pc(gaps[0]) + ' | ' + pc(gaps[Math.floor(gaps.length * 0.25)]) + ' | '
      + pc(gaps[Math.floor(gaps.length / 2)]) + ' | ' + pc(gaps[Math.floor(gaps.length * 0.75)]) + ' | '
      + pc(gaps[gaps.length - 1]) + ' |');
    L.push('');
    L.push('견적서에 적힌 항목을 다 더해도 **TOTAL에 이만큼 못 미친다.** 이유는 둘 —');
    L.push('① 감춘 수익·보험(일부러 안 보여주는 방침) ② 프로그램·기관 계수(표에 흔적이 없다).');
    L.push('②는 방침으로 정해진 적이 없다. **결정대기열에 올렸습니다.**');
    L.push('');
  }
  L.push('## 목적지별 1인 금액');
  L.push('');
  const byDest = new Map();
  okQuotes.forEach((r) => {
    const k = r.persona.destKey;
    if (!byDest.has(k)) byDest.set(k, []);
    byDest.get(k).push(r.record.perPerson);
  });
  L.push('| 목적지 | 건 | 1인 최저 | 중앙 | 최고 |');
  L.push('|---|---:|---:|---:|---:|');
  [...byDest.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, arr]) => {
    const s = arr.slice().sort((x, y) => x - y);
    L.push('| ' + k + ' | ' + s.length + ' | ' + won(s[0]) + ' | ' + won(s[Math.floor(s.length / 2)]) + ' | ' + won(s[s.length - 1]) + ' |');
  });
  fs.writeFileSync(path.join(dir, '_요약.md'), L.join('\n') + '\n', 'utf8');

  const T = ['# 문제 모음 — 손님별', '', '> 코드별로 묶었습니다. 폴더 이름에 `_문제`가 붙은 손님이 그 손님입니다.', ''];
  codes.forEach(([code, v]) => {
    T.push('## `' + code + '` — ' + v.say + ' (' + v.list.length + '명)');
    T.push('');
    v.list.slice(0, 40).forEach((r) => {
      const x = r.trouble.find((y) => y.code === code);
      T.push('- **' + String(r.no).padStart(4, '0') + '** ' + r.persona.destKey + ' ' + r.persona.participants + '명 '
        + r.persona.days + '일 — ' + (x.detail || ''));
    });
    if (v.list.length > 40) T.push('- … 외 ' + (v.list.length - 40) + '명');
    T.push('');
  });
  fs.writeFileSync(path.join(dir, '_문제모음.md'), T.join('\n') + '\n', 'utf8');

  console.log('\n' + '─'.repeat(70));
  console.log('손님 ' + results.length + '명 · 견적 나옴 ' + okQuotes.length + ' · 🔴 링크 받음 ' + verified.length
    + ' · 문제 난 손님 ' + bad.length);
  codes.forEach(([code, v]) => console.log('   · ' + code.padEnd(18) + String(v.list.length).padStart(4) + '명  ' + v.say));
  모아보기쓰기(results, dir, ms);
  console.log('');
  console.log('📄 이 파일 하나만 열면 전부 보입니다: ' + path.join(dir, '_모아보기.html'));
  console.log('\n요약: ' + path.join(dir, '_요약.md'));
}

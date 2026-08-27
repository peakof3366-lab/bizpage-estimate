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
const { makeAll, MARK } = require('./_virtual_personas');
const { verifyQuote } = require(path.join(ROOT, 'api', '_lib', 'quote_verify.js'));
const COMBINED_FACTOR = require(path.join(ROOT, 'data.js')).estimateCombinedFactor;

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.split('=')[1] : d;
};
const N = Number(arg('n', 200));
const SEED = Number(arg('seed', 1));
const KEEP_ALL = process.argv.includes('--keep');
const QUIET = process.argv.includes('--quiet');
const OUT = arg('out', path.join(process.env.USERPROFILE || 'C:/Users/최현욱', 'Desktop', '가상견적서'));
const BASE = arg('base', 'https://bizpage-estimate.vercel.app');

const won = (n) => Number(Math.round(n || 0)).toLocaleString('ko-KR');
const ymd = (d) => d.toLocaleDateString('sv-SE');
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

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
  const { win, doc, log, tick } = B;
  await B.ready; await tick(280);

  if (typeof win.getBreakdownData !== 'function') {
    문제(t, 'ENGINE_DEAD', '견적 엔진이 화면에 안 실렸다', '');
    win.close(); return out;
  }
  /* 운영 요율이 실제로 얹혔는가 — 안 얹히면 옛 기본값으로 계산된다(XI) */
  out.rateSource = win.__RATE_SOURCE__ || null;
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
  if (blockers.length) {
    문제(t, 'FORM_BLOCKED', '제출을 막는 칸이 있다',
      blockers.map((e) => (e.id || e.name) + '=[' + e.value + ']'
        + (e.closest('.hidden') ? ' (감춰져 있다)' : '')).join(', '));
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
    문제(t, 'NO_QUOTE', '🔴 견적이 아예 안 나왔다',
      visibleText(doc.querySelector('.step-missing')) || (log.errors[0] && log.errors[0].msg) || '');
    win.close(); return out;
  }
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
  const shown = visibleText(doc.body);
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

  /* ── ⑤ 서버의 진짜 검증기 ──────────────────────────────────────── */
  const verifyPayload = req.body.quote || share;
  const v = verifyQuote(verifyPayload, ctx);
  out.verdict = v.verdict;
  out.failedSteps = v.failedSteps || [];
  if (!v.ok) {
    문제(t, 'VERIFY_REVIEW', '🔴 검증을 못 넘겨 고객이 링크를 못 받는다',
      (v.failedSteps || []).join(', ') + ' | '
      + (v.steps || []).filter((s) => !s.ok).map((s) => s.label + ': ' + s.detail).join(' / '));
  }

  /* ── ⑥ 서버가 저장하는 모양 그대로 만들어 견적서를 그린다 ─────── */
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
  const docText = visibleText(V.doc.body);
  out.docHtml = V.doc.documentElement.outerHTML;
  out.docLen = docText.length;

  if (V.log.errors.length) 문제(t, 'DOC_ERROR', '견적서 화면이 오류를 냈다', V.log.errors.map((e) => e.msg).join(' | '));
  if (docText.length < 200) 문제(t, 'DOC_EMPTY', '🔴 견적서가 사실상 비어 있다', String(docText.length) + '자');
  if (!docText.includes(won(share.t))) 문제(t, 'DOC_NO_TOTAL', '🔴 견적서에 총액이 없다', won(share.t));
  if (!docText.includes(qno)) 문제(t, 'DOC_NO_QNO', '견적서에 견적번호가 없다', qno);
  if (!docText.includes(p.destKey) && !docText.includes(String(share.dt || ''))) {
    문제(t, 'DOC_NO_DEST', '견적서에 목적지가 없다', p.destKey + ' / ' + share.dt);
  }
  if (!docText.includes(String(p.participants))) 문제(t, 'DOC_NO_PAX', '견적서에 인원이 없다', String(p.participants));
  /* XD — 받으시는 분의 이름이 문서에 있어야 한다(공문이다) */
  const 이름조각 = String(p.contactName).replace(MARK, '').trim();
  if (이름조각 && !docText.includes(이름조각)) 문제(t, 'DOC_NO_NAME', '견적서에 받는 사람 이름이 없다', 이름조각);
  /* 🔴 연락처는 반대로 **있으면 안 된다** */
  if (docText.includes(p.contactTel)) 문제(t, 'DOC_HAS_TEL', '🔴 견적서에 연락처가 찍혔다', p.contactTel);
  /* 유효기간 — WQ에서 인쇄본에 한 줄도 없던 자리 */
  if (!/유효|만료/.test(docText)) 문제(t, 'DOC_NO_VALIDITY', '견적서에 유효기간 문구가 없다', '');
  /* 감춘 수익 줄이 그려지면 안 된다 */
  if (/ENBT 수익|현지 수익금/.test(docText)) 문제(t, 'DOC_MUTED_LEAK', '🔴 견적서에 수익 항목이 그려졌다', '');

  V.win.close();
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

  const people = makeAll(N, SEED);
  const results = [];
  const t0 = Date.now();
  for (const p of people) {
    let res;
    try { res = await runOne(p, rates, ctx); }
    catch (e) {
      res = { no: p.no, persona: p, trouble: [{ code: 'CRASH', say: '🔴 손님을 태우다 터졌다', detail: String(e && e.stack || e).slice(0, 600) }] };
    }
    results.push(res);

    /* 손님마다 한 폴더 — 문제가 있으면 무조건 남기고, 없으면 --keep일 때만 */
    const bad = res.trouble.length > 0;
    if (bad || KEEP_ALL) {
      const dir = path.join(OUT, safe(String(p.no).padStart(4, '0') + '_' + p.destKey + '_' + p.participants + '명_' + p.days + '일' + (bad ? '_문제' : '')));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '요청.md'), 요청카드(p, res), 'utf8');
      fs.writeFileSync(path.join(dir, '결과.json'), JSON.stringify({
        record: res.record, verdict: res.verdict, failedSteps: res.failedSteps,
        qno: res.qno, trouble: res.trouble, rateSource: res.rateSource,
      }, null, 2), 'utf8');
      if (res.docHtml) fs.writeFileSync(path.join(dir, '견적서.html'), res.docHtml, 'utf8');
    }

    if (!QUIET) {
      const mark = res.trouble.length ? '🔴 ' + res.trouble.map((x) => x.code).join(',') : '✓';
      console.log('  ' + String(p.no).padStart(4) + ' ' + p.destKey.padEnd(8)
        + String(p.participants).padStart(4) + '명 ' + p.days + '일  '
        + (res.record ? won(res.record.perPerson).padStart(11) + '원/인' : '     —      ')
        + '  ' + (res.verdict || '-').padEnd(9) + mark);
    } else if (p.no % 25 === 0) {
      console.log('  ... ' + p.no + '/' + N + ' (' + Math.round((Date.now() - t0) / 1000) + '초)');
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
  console.log('\n요약: ' + path.join(dir, '_요약.md'));
}

/* ═══════════════════════════════════════════════════════════════════════════
   서버가 죽었을 때 **고객이 무엇을 보는가** (XX)
   ───────────────────────────────────────────────────────────────────────────
   지금까지 이 저장소에서 나온 결함은 거의 전부 **가장자리**와 **고장**에서 나왔다.
   가장자리는 `virtual_journey.js --edge`가 태운다. 고장은 지금까지 **손으로 한 번씩만**
   재 봤고(XI에서 요율, XS에서 저장), 체계적으로 훑은 적이 없다.

   그런데 고장은 반드시 난다. 그때 고객이 보는 화면이 이 셋 중 하나면 사고다:
     ① **아무 말도 안 한다** — 눌렀는데 조용하면 고객은 다시 안 누른다
     ② 🔴 **거짓 성공** — 접수 안 됐는데 「접수되었습니다」. 리드가 통째로 사라진다
     ③ **다시 누르면 되는 것을 문의로 보낸다** — 고객은 기다리고 우리는 응대를 한 건 더 받는다

   ■ 방법 — 손님 한 명을 **고장마다 한 번씩** 태운다
   `_page_boot`의 `fixtures.route`로 특정 요청만 실패시킨다(다른 요청은 정상).
   그리고 **화면에 그려진 글자**를 읽어 무엇을 말했는지 본다.
 ⚠ 「고장인데 화면이 멀쩡하다」가 통과가 아니다. **무엇을 말했는지**를 적고 판정한다.
 ⚠ 운영 DB에 아무것도 안 쓴다(전부 로컬 jsdom).

   실행:
     node ai-loop/fault_journey.js            요약
     node ai-loop/fault_journey.js --verbose  화면이 한 말을 그대로 보여준다
     node ai-loop/fault_journey.js --only=quoteSave500
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { bootPage } = require('./_page_boot');
const { shownText } = require('./_journey_probe');
const { makeAll } = require('./_virtual_personas');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONLY = (() => { const a = args.find((x) => x.startsWith('--only=')); return a ? a.split('=')[1] : null; })();

/* 손님은 **한 명으로 고정한다** — 고장마다 다른 손님을 태우면 차이가 손님 탓인지
   고장 탓인지 알 수 없다. 씨앗을 박아 언제 돌려도 같은 사람이 나온다. */
const 손님 = makeAll(1, 4242)[0];

const POST = (opt) => opt && String(opt.method || '').toUpperCase() === 'POST';

/* 주입할 고장들. `hit`이 참인 요청만 실패시키고 나머지는 평소대로 답한다. */
const FAULTS = [
  { key: 'ratesHttp500', 말: '요율 서버가 500을 준다', hit: (u) => u.includes('/api/rates'), how: 'http500' },
  { key: 'ratesDown', 말: '요율 서버가 응답을 안 한다(네트워크 끊김)', hit: (u) => u.includes('/api/rates'), how: 'reject' },
  { key: 'itineraryFail', 말: '추천 일정 조회가 500', hit: (u) => u.includes('action=itineraries'), how: 'http500' },
  { key: 'contentFail', 말: '홈 콘텐츠 조회가 500', hit: (u) => u.includes('/api/content') && !u.includes('itineraries'), how: 'http500' },
  { key: 'quoteSave500', 말: '🔴 견적 기록 저장이 500', hit: (u, o) => u.includes('/api/quotes') && POST(o), how: 'http500' },
  { key: 'quoteSaveDown', 말: '🔴 견적 기록 저장 중 네트워크가 끊긴다', hit: (u, o) => u.includes('/api/quotes') && POST(o), how: 'reject' },
  { key: 'share500', 말: '🔴 견적서 발급이 500', hit: (u, o) => u.includes('quote-shares') && POST(o), how: 'http500' },
  { key: 'share503', 말: '견적서 발급이 503(잠시 불가)', hit: (u, o) => u.includes('quote-shares') && POST(o), how: 'http503' },
  { key: 'shareDown', 말: '🔴 견적서 발급 중 네트워크가 끊긴다', hit: (u, o) => u.includes('quote-shares') && POST(o), how: 'reject' },
  { key: 'shareNoVerdict', 말: '발급이 200을 주는데 알맹이가 없다', hit: (u, o) => u.includes('quote-shares') && POST(o), how: 'empty200' },
  { key: 'inquiry500', 말: '일반 문의 저장이 500', hit: (u, o) => u.includes('/api/inquiries') && POST(o), how: 'http500' },
  /* 🔴 **둘 다 죽는 경우** — DB가 나가면 저장도 발급도 안 된다. 그때만 리드가 진짜
     사라진다(저장만 실패하면 발급 기록이 대장에 남아 담당자가 찾을 수 있다). */
  { key: 'dbDown', 말: '🔴 저장도 발급도 안 된다(DB가 나갔다)', how: 'http500',
    hit: (u, o) => POST(o) && (u.includes('/api/quotes') || u.includes('quote-shares')) },
];

function 픽스처(fault, rates) {
  return {
    rates,
    route(u, opt, json) {
      if (fault && fault.hit(u, opt)) {
        if (fault.how === 'reject') return Promise.reject(new Error('network down'));
        if (fault.how === 'http500') return json({ error: 'boom' }, false, 500);
        if (fault.how === 'http503') return json({ error: 'busy' }, false, 503);
        if (fault.how === 'empty200') return json({});
      }
      return null;   /* 나머지는 `_page_boot`의 기본 답 */
    },
  };
}

/* 화면이 실제로 그린 글자만 읽는다 — 감춰진 패널로 통과하면 아무것도 안 지킨다 */
function 팝업글(log) {
  const w = log.opened[log.opened.length - 1];
  if (!w || !w.document) return { 있나: false, 글: '', head: '', body: '' };
  const g = (id) => {
    const el = w.document.getElementById(id);
    if (!el) return '';
    /* 감춰져 있으면 고객은 못 본다 */
    const st = el.style || {};
    const 부모감춤 = (() => {
      let n = el.parentElement;
      while (n) { if ((n.style || {}).display === 'none') return true; n = n.parentElement; }
      return false;
    })();
    if (st.display === 'none' || 부모감춤) return '';
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  };
  /* 🔴 **모달을 안 열어도 보이는 글**이 무엇인지가 이 도구의 핵심 질문이다 (XX).
     감춰진 모달 안의 글자로 「말했다」고 세면, 실제로는 아무 말도 안 하는 화면이 통과한다. */
  const 보이는글 = (() => {
    const c = w.document.body.cloneNode(true);
    c.querySelectorAll('script,style').forEach((n) => n.remove());
    c.querySelectorAll('[style]').forEach((n) => {
      const s = String(n.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
      if (/display:none|visibility:hidden/.test(s)) n.remove();
    });
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  })();
  return {
    있나: true,
    head: g('share-review-head'), body: g('share-review-body'),
    알림: g('share-note'),
    보이는글,
    글: shownText(w.document.body),
  };
}

async function 한판(fault, rates) {
  const B = bootPage('index.html', { fixtures: 픽스처(fault, rates) });
  const { win, doc, log, tick } = B;
  await B.ready; await tick(300);

  const ev = (el, k) => el.dispatchEvent(new win.Event(k, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  const radio = (name, v) => { const el = doc.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (el) { el.checked = true; ev(el, 'change'); } };
  const check = (id, on) => { const el = doc.getElementById(id); if (el) { el.checked = !!on; ev(el, 'change'); } };
  const click = (el) => el && el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
  const p = 손님;

  set('destination', p.destKey); set('programType', p.programType);
  set('organizationType', p.organizationType); set('visitMode', p.visitMode);
  set('startDate', p.startDate); set('endDate', p.endDate);
  set('participants', p.participants); set('days', p.days);
  set('departureCity', p.departureCity);
  radio('cabinClass', p.cabinClass); radio('hotelGrade', p.hotelGrade); radio('roomConfig', p.roomConfig);
  check('incHotel', p.incHotel); check('incMeal', p.incMeal); check('incVehicle', p.incVehicle);
  check('incGuide', p.incGuide); check('incSightseeing', p.incSightseeing);
  set('agencyVisits', p.agencyVisits);
  set('organization', p.organization); set('contactName', p.contactName);
  set('contactTel', p.contactTel); set('requestDetails', p.requestDetails);
  await tick(150);

  win._lastQuoteRecord = null;
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick(400);
  const rec = win._lastQuoteRecord;

  const out = { key: fault ? fault.key : 'none', 말: fault ? fault.말 : '고장 없음 (대조군)' };
  out.금액나옴 = !!(rec && rec.total > 0);
  out.화면총액 = out.금액나옴 && shownText(doc.body).includes(Math.round(rec.total).toLocaleString('ko-KR'));

  /* 「견적서 받기」 */
  const dl = doc.getElementById('downloadEstimate');
  out.발급버튼 = !!dl && !dl.disabled;
  if (dl) { click(dl); await tick(600); }

  /* 발급 요청에 견적 스냅샷이 실렸나 — 저장이 실패해도 이게 있으면 대장에 남는다 */
  const 발급요청 = log.requests.find((x) => x.url.includes('quote-shares') && String(x.method).toUpperCase() === 'POST');
  out.스냅샷실림 = !!(발급요청 && 발급요청.body && 발급요청.body.quote);

  const 팝 = 팝업글(log);
  out.팝업열림 = 팝.있나;
  out.머리 = 팝.head; out.본문 = 팝.body; out.알림 = 팝.알림;
  out.보이는글 = 팝.보이는글 || '';
  out.rateSource = (() => {
    try { return JSON.parse(JSON.stringify(win.__RATE_SOURCE__ || null)); } catch (e) { return null; }
  })();
  out.말풍선 = log.says.map((s) => s.text);
  out.오류 = log.errors.map((e) => e.msg).slice(0, 3);

  /* 문의 폼도 눌러 본다 — 고장이 문의 저장일 때 여기서 드러난다.
   ⚠ 처음엔 칸 이름을 짐작해서(`[name="name"]`) 넣었고, 결과 칸도 엉뚱한 것을 읽었다
     (`#inqSuccess`가 진짜 자리다). 그래서 **문의가 아예 제출되지 않은 채로 「✓」**가
     나왔다 — 자가 만든 거짓 초록이다. 화면에 있는 id를 그대로 쓴다. */
  const inq = doc.getElementById('inqForm');
  if (inq) {
    const iset = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = v; ev(el, 'input'); } };
    iset('inqName', '[점검] 문의자');
    iset('inqOrg', '[점검] 회사');
    iset('inqTel', '010-0000-0000');
    iset('inqMsg', '고장 점검 문의입니다.');
    const before = log.says.length;
    inq.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    /* 🔴 **기다릴 줄 알아야 한다.** `submitLead`는 실패하면 2번 더 시도한다(0.6초 → 1.2초).
       0.5초만 기다렸더니 아직 말하기 전이라 **「아무 말도 안 한다」는 없는 결함**이 나왔다.
       나올 때까지(최대 4초) 지켜본다 — 시간을 고정하면 이 자를 못 믿는다. */
    const okEl = doc.getElementById('inqSuccess');
    for (let i = 0; i < 20; i++) {
      await tick(200);
      if (okEl && !okEl.classList.contains('hidden')) break;
    }
    out.문의말 = log.says.slice(before).map((s) => s.text);
    out.문의화면말 = (okEl && !okEl.classList.contains('hidden')) ? (okEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    out.문의보냄 = log.requests.some((x) => x.url.includes('/api/inquiries') && String(x.method).toUpperCase() === 'POST');
  }

  log.opened.forEach((w) => { try { w.close(); } catch (e) { /* 이미 닫힘 */ } });
  win.close();
  return out;
}

/* ── 판정 — **말했는가 / 참말인가 / 무엇을 하라 했는가** ── */
function 판정(r) {
  const 나쁨 = [];
  /* 🔴 **고객이 실제로 볼 수 있는 글자만** 센다. 감춰진 모달 안의 글은 안 본 것과 같다.
   ⚠ **문의 폼의 안내를 여기 섞지 않는다.** 견적서 발급과 일반 문의는 **다른 길**이고,
     문의 성공 문구도 「접수되었습니다」다. 섞었더니 견적 저장 실패 2건이
     「접수 안 됐는데 접수됐다고 했다」로 잡혔다 — 없는 결함이다.
     (WD·XS에서 이미 배운 것: 길이 둘이면 기대도 둘이어야 한다.) */
  const 보임 = (r.보이는글 || '') + ' ' + (r.말풍선 || []).join(' ');
  const 모달안 = [r.머리, r.본문].filter(Boolean).join(' ');

  if (r.key === 'none') {
    if (!r.금액나옴) 나쁨.push('대조군인데 견적이 안 나왔다');
    /* 잘 됐을 때도 「링크가 준비됐다」가 보여야 한다 — 안 그러면 고객은 링크가
       생겼는지도 모르고, 실패와 화면이 구별되지 않는다 */
    if (!/링크가 준비|링크 준비/.test(보임)) 나쁨.push('잘 됐는데 링크가 준비됐다는 말이 화면에 없다');
    return 나쁨;
  }

  const 저장실패 = /quoteSave|dbDown/.test(r.key);
  const 발급실패 = /^share|dbDown/.test(r.key);

  /* ① 🔴 조용한 실패 — **발급이 안 됐는데** 보이는 화면에 아무 흔적이 없다.
     이게 이 도구를 만든 이유다. 예전엔 안내가 감춰진 모달 안에만 쓰였다.
   ⚠ **저장(`/api/quotes`)만 실패한 경우는 여기 넣지 않는다** — 그때 고객은 링크를
     멀쩡히 받는다. 고객에게 할 말이 없는 상황을 결함으로 세면 진짜가 묻힌다.
     (처음엔 둘을 묶어 세어 **없는 결함 2건**을 만들었다. 우리 쪽 유실은 아래 ⑤에서 본다.) */
  if (발급실패 && !/문제|확인이 필요|접수가 확인되지|다시 눌러/.test(보임)) {
    나쁨.push('🔴 발급이 안 됐는데 화면에 아무 표시가 없다'
      + (모달안 ? ' (안내가 감춰진 모달 안에만 있다: 「' + 모달안.slice(0, 30) + '…」)' : ''));
  }

  /* ② 🔴 거짓 성공 — 저장·발급이 실패했는데 「접수되었습니다」 */
  if ((저장실패 || 발급실패) && /접수되었습니다/.test(보임 + ' ' + 모달안)) {
    나쁨.push('🔴 접수 안 됐는데 「접수되었습니다」라고 했다');
  }

  /* ③ 다시 누르면 되는 것인데 그 말을 안 한다(XH의 교훈 — 고쳐야 할 것과 다시 하면
     될 것을 가르지 않으면 고객을 문의로 보내고 우리는 응대를 한 건 더 받는다) */
  if (발급실패 && !/다시 눌러|다시 시도|조금 뒤/.test(보임 + ' ' + 모달안)) {
    나쁨.push('다시 누르면 된다는 말이 없다');
  }

  /* ④ 요율을 못 받았으면 **그 사실이 기록에 남아야** 한다(XI).
     ⚠ 「고객 발급이 막히는가」는 여기서 못 잰다 — 이 도구는 서버 대신 스텁이 답한다.
       그건 `quote_verify.js`의 `ratesrc` 단계가 하고, `test_xI`가 잰다. */
  if (/^rates/.test(r.key)) {
    const st = r.rateSource && r.rateSource.state;
    if (st === 'applied' || !st) 나쁨.push('요율을 못 받았는데 기록의 출처 표식이 「' + st + '」다');
  }

  /* ⑤ 문의 폼 — **접수되지 않았는데 「접수되었습니다」**면 그 리드는 사라진다 */
  if (r.문의보냄 === false) 나쁨.push('문의를 눌렀는데 서버로 아무것도 안 갔다');
  if (/inquiry/.test(r.key)) {
    if (!r.문의화면말) 나쁨.push('🔴 문의 저장이 실패했는데 화면이 아무 말도 안 한다');
    else if (/접수되었습니다/.test(r.문의화면말)) 나쁨.push('🔴 문의가 실패했는데 「접수되었습니다」라고 했다');
  } else if (r.문의화면말 && !/접수되었습니다/.test(r.문의화면말)) {
    나쁨.push('문의가 정상인데 성공 안내가 아니다: ' + r.문의화면말.slice(0, 40));
  }

  /* ⑥ 🔴 **리드가 사라지는가.** 저장만 실패하면 발급 요청에 견적 스냅샷이 함께 실려
     대장에 남는다 — 담당자가 찾을 수 있다. 저장도 발급도 안 되면 그때는 아무 데도 없다.
     그 경우 화면이 **최소한 연락처를 안내**해야 한다. */
  if (저장실패 && !발급실패 && !r.스냅샷실림) {
    나쁨.push('저장이 실패했는데 발급 요청에도 견적 스냅샷이 없다 — 리드가 어디에도 안 남는다');
  }
  if (저장실패 && 발급실패 && !/연락처|문의|전화|02-/.test(보임 + ' ' + 모달안)) {
    나쁨.push('🔴 저장도 발급도 안 됐는데 연락할 곳을 안 알려 준다');
  }
  return 나쁨;
}

/* ═══════════════════════════════════════════════════════════════════════════
   **고객이 카톡으로 받은 링크를 열었을 때**의 고장 (XX 이어서)
   ───────────────────────────────────────────────────────────────────────────
   위 고장들은 「견적을 내는 길」이고, 이건 **이미 받은 견적서를 여는 길**이다.
   여기서 화면이 하는 말은 하나뿐이었다 — 「링크가 올바르지 않거나 만료되었습니다」.
   서버가 500이어도, 네트워크가 끊겨도 같은 말을 했다. **링크는 멀쩡한데** 고객에게
   틀렸다고 말하면서 담당자에게 보내는 셈이다(XH·XS에서 이미 두 번 고친 자리다).
   ═══════════════════════════════════════════════════════════════════════════ */
const VIEW_FAULTS = [
  { key: 'view404', 말: '없는 링크(404)', how: (json) => json({ error: 'not_found' }, false, 404), 우리쪽: false },
  { key: 'view500', 말: '🔴 서버가 500', how: (json) => json({ error: 'boom' }, false, 500), 우리쪽: true },
  { key: 'view503', 말: '🔴 서버가 503', how: (json) => json({ error: 'busy' }, false, 503), 우리쪽: true },
  { key: 'viewDown', 말: '🔴 네트워크가 끊긴다', how: () => Promise.reject(new Error('down')), 우리쪽: true },
  { key: 'viewEmpty', 말: '200인데 알맹이가 없다', how: (json) => json({ error: 'x' }), 우리쪽: true },
];

async function 견적서열기(f) {
  const B = bootPage('estimate-view.html', {
    query: '?id=testshare1',
    fixtures: {
      route(u, opt, json) {
        if (/\/api\/quote-shares\/[^?]+$/.test(u)) return f.how(json);
        return null;
      },
    },
  });
  await B.ready; await B.tick(500);
  const 글 = shownText(B.doc.body);
  const out = { key: f.key, 말: f.말, 글 };
  const 나쁨 = [];
  if (!글.trim()) 나쁨.push('🔴 빈 화면이다');
  /* 못 열었는데 위 띠가 「확인 중…」이면 무언가 도는 것처럼 보인다 */
  if (/유효기간 확인 중/.test(글)) 나쁨.push('못 열었는데 「유효기간 확인 중…」이 남아 있다');
  if (f.우리쪽) {
    /* 우리 쪽이 잠깐 안 되는 것인데 「링크가 틀렸다」고 하면 거짓말이다 */
    if (/링크가 올바르지 않|만료되었습니다/.test(글)) 나쁨.push('🔴 우리 쪽 문제인데 「링크가 올바르지 않다」고 했다');
    if (!/다시|잠시 후|새로고침/.test(글)) 나쁨.push('다시 열어 보라는 말이 없다');
    if (!/유효/.test(글)) 나쁨.push('링크가 그대로 유효하다는 말이 없다');
  } else {
    if (!/링크|만료|담당자/.test(글)) 나쁨.push('없는 링크인데 이유를 안 말한다');
  }
  out.나쁨 = 나쁨;
  B.win.close();
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   **담당자 화면**의 고장 (XX 이어서)
   ───────────────────────────────────────────────────────────────────────────
   담당자 화면이 고장 났을 때 가장 나쁜 것은 **조회 실패를 「없음」으로 보여주는 것**이다.
   「아직 한 건도 없다」와 「지금 못 불러왔다」는 할 일이 정반대인데, 화면이 같은 말을 하면
   담당자는 없는 줄 알고 넘어간다(CLAUDE.md 화면 규칙 2번과 같은 이유).
   요율 저장이 조용히 실패하는 것도 같은 무게다 — **고객 금액이 안 바뀐 채로 남는다.**
   ═══════════════════════════════════════════════════════════════════════════ */
const { adminFixtures, enterDashboard } = require('./_admin_fixtures');

/* 패키지 화면 — XN이 「상품이 0건이면 준비 중이라 말한다」를 넣었다. 그런데
   **못 불러온 것도 0건으로 보인다.** 없는 것과 못 받은 것은 할 일이 정반대다. */
const PKG_FAULTS = [
  { key: 'pkgList500', 말: '패키지 목록 조회가 500', how: (json) => json({ error: 'boom' }, false, 500) },
  { key: 'pkgListDown', 말: '패키지 목록 조회 중 끊김', how: () => Promise.reject(new Error('down')) },
  { key: 'pkgListEmpty', 말: '패키지가 실제로 0건 (대조군)', how: (json) => json({ packages: [] }) },
];

/* 패키지 **발급**(고객이 「견적서 받기」를 누르는 자리)의 고장.
   서버가 주는 거절 코드는 XH가 여덟 개 다 옮겼는데, **네트워크가 끊기거나 본문이
   JSON이 아닐 때**(`.catch`)는 여전히 「문의해 주세요」로 보내고 있었다 — 다시 누르면 되는 것이다. */
const PKG_ISSUE_FAULTS = [
  { key: 'pkgIssueDown', 말: '🔴 발급 중 네트워크가 끊긴다', how: () => Promise.reject(new Error('down')), 다시: true },
  { key: 'pkgIssueBadBody', 말: '🔴 500인데 본문이 JSON이 아니다', how: () => Promise.resolve({
    ok: false, status: 500, json: () => Promise.reject(new Error('not json')), text: () => Promise.resolve('<html>500</html>'),
  }), 다시: true },
  { key: 'pkgIssueInsertFail', 말: '서버가 insert_failed를 준다 (대조군)', how: (json) => json({ error: 'insert_failed' }, false, 500), 다시: true },
  { key: 'pkgIssueClosed', 말: '판매하지 않는 상품 (대조군)', how: (json) => json({ error: 'package_not_available' }, false, 409), 다시: false },
];

async function 패키지발급고장(f) {
  const 상품 = {
    id: 'pk1', title: '[가상] 다낭 3박 5일', destKey: '다낭', destLabel: '다낭',
    nights: 3, days: 5, priceKrw: 890000, priceAsOf: new Date().toLocaleDateString('sv-SE'),
    status: 'open', included: ['항공', '호텔', '조식'], supplier: '하나투어',
  };
  const B = bootPage('packages.html', {
    fixtures: {
      route(u, opt, json) {
        if (u.includes('action=packages')) return json({ packages: [상품] });
        if (u.includes('quote-shares') && u.includes('action=package')) return f.how(json);
        return null;
      },
    },
  });
  const { win, doc, tick } = B;
  await B.ready; await tick(600);
  const out = { key: f.key, 말: f.말, 나쁨: [] };
  /* 상품 카드를 눌러 상세를 연다 */
  const cta = doc.querySelector('.pk-cta, .pk-card button, .pk-card a');
  if (!cta) { out.나쁨.push('🔴 상품 카드를 못 찾았다 — 픽스처를 확인할 것'); win.close(); return out; }
  cta.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
  await tick(300);
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); } };
  set('pkName', '[점검] 김고객'); set('pkTel', '010-0000-0000'); set('pkPax', '20');
  const ask = doc.getElementById('pkAsk') || doc.querySelector('[id^="pkAsk"], .pk-modal button.pk-primary');
  if (!ask) { out.나쁨.push('🔴 「견적서 받기」 버튼을 못 찾았다'); win.close(); return out; }
  ask.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
  for (let i = 0; i < 15; i++) {
    await tick(200);
    const m = doc.getElementById('pkAskMsg');
    if (m && (m.textContent || '').trim() && !/만드는 중/.test(m.textContent)) break;
  }
  const msg = doc.getElementById('pkAskMsg');
  const 글 = msg ? (msg.textContent || '').replace(/\s+/g, ' ').trim() : '';
  out.글 = 글;
  if (!글) out.나쁨.push('🔴 발급이 실패했는데 아무 말도 안 한다');
  else if (f.다시 && !/다시 눌러/.test(글)) out.나쁨.push('🔴 다시 누르면 되는 것인데 그 말이 없다: ' + 글.slice(0, 40));
  else if (!f.다시 && /다시 눌러/.test(글)) out.나쁨.push('다시 눌러도 안 되는 것인데 다시 누르라고 한다');
  /* 다시 누를 수 있어야 한다 — 버튼이 잠긴 채로 남으면 말만 하고 길을 막은 것이다 */
  if (ask.disabled) out.나쁨.push('🔴 버튼이 잠긴 채로 남았다');
  win.close();
  return out;
}

async function 패키지화면(f) {
  const B = bootPage('packages.html', {
    fixtures: {
      route(u, opt, json) {
        if (u.includes('action=packages')) return f.how(json);
        return null;
      },
    },
  });
  await B.ready; await B.tick(600);
  const 글 = shownText(B.doc.body).replace(/\s+/g, ' ').trim();
  const out = { key: f.key, 말: f.말, 글, 나쁨: [] };
  /* ⚠ 처음엔 「준비 중」만 찾아서 **대조군(진짜 0건)까지 결함으로 셌다.**
     화면이 실제로 쓰는 말은 「지금 준비된 패키지 상품이 없습니다」다. 글자를 맞춘다. */
  const 준비중이라함 = /준비된 패키지 상품이 없|준비 중|준비중|아직 없/.test(글);
  const 못받았다고함 = /불러오지 못|불러올 수 없|오류|다시|새로고침/.test(글);
  if (!글) out.나쁨.push('🔴 빈 화면이다');
  if (f.key === 'pkgListEmpty') {
    if (!준비중이라함) out.나쁨.push('상품이 0건인데 그 사실을 안 말한다');
    if (못받았다고함) out.나쁨.push('0건인데 오류라고 말한다');
  } else {
    /* 🔴 못 받은 것을 「준비 중」이라 말하면 고객은 우리가 파는 게 없다고 믿고 나간다 */
    if (준비중이라함 && !못받았다고함) out.나쁨.push('🔴 못 불러온 것을 「준비 중」으로 말한다');
    if (!못받았다고함) out.나쁨.push('못 불러왔다는 말이 없다');
  }
  B.win.close();
  return out;
}

/* 담당자 견적 산출 화면 — **고객에게 나갈 금액을 만드는 자리**다(XV에서 처음 훑었다).
   여기서 저장이 조용히 실패하면 담당자는 만든 줄 알고 넘어가고, 견적 기록이 없다. */
async function 견적산출화면고장(f) {
  const { adminFixtures: AF } = require('./_admin_fixtures');
  const fx = AF('filled');
  const orig = fx.route;
  fx.route = function (u, opt, json) {
    if (f.hit(u, opt)) return f.how ? f.how(json) : json({ error: 'boom' }, false, 500);
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin-quote.html', { fixtures: fx });
  const { win, doc, tick } = B;
  await B.ready; await tick(450);
  const out = { key: f.key, 말: f.말, 나쁨: [] };
  const app = doc.getElementById('quoteApp');
  if (!app || app.classList.contains('hidden')) {
    out.나쁨.push('🔴 화면이 안 열렸다 — 픽스처를 확인할 것');
    win.close(); return out;
  }
  const ev = (el, k) => el.dispatchEvent(new win.Event(k, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  const 날 = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  set('destination', '오키나와'); set('programType', 'industry'); set('organizationType', 'company');
  set('visitMode', 'official'); set('departureCity', 'ICN'); set('participants', '30');
  set('startDate', 날(45)); set('endDate', 날(49));
  set('organization', '[점검] 한빛전자'); set('contactName', '[점검] 김담당');
  set('contactTel', '010-0000-0000'); set('requestDetails', '[점검] 고장 주입');
  await tick(150);
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  /* 저장 결과가 화면에 붙기를 기다린다 — 고정 시간으로 재면 없는 결함이 생긴다(문의에서 겪었다) */
  for (let i = 0; i < 20; i++) {
    await tick(200);
    const w = doc.getElementById('aqSaveWarn');
    if (w && !w.classList.contains('hidden') && (w.textContent || '').trim()) break;
  }
  const card = doc.getElementById('estimateConfirm');
  const 글 = shownText(card || doc.body).replace(/\s+/g, ' ').trim();
  out.글 = 글;
  const 저장경고 = doc.getElementById('aqSaveWarn');
  const 경고글 = (저장경고 && !저장경고.classList.contains('hidden')) ? (저장경고.textContent || '').trim() : '';
  if (f.key === 'aqSave500' || f.key === 'aqSaveDown') {
    if (!경고글 && !/저장|실패|기록되지|다시/.test(글)) {
      out.나쁨.push('🔴 견적 기록 저장이 실패했는데 담당자에게 아무 말도 안 한다');
    }
    if (/기록됨/.test(글) && !경고글) out.나쁨.push('🔴 저장이 안 됐는데 「기록됨」이라고 했다');
  }
  out.경고 = 경고글;
  win.close();
  return out;
}

const AQ_FAULTS = [
  { key: 'aqSave500', 말: '🔴 담당자 견적 저장이 500', hit: (u, o) => u.includes('/api/quotes') && POST(o) },
  { key: 'aqSaveDown', 말: '🔴 담당자 견적 저장 중 끊김', hit: (u, o) => u.includes('/api/quotes') && POST(o), how: () => Promise.reject(new Error('down')) },
];

/* 🔴 **쓰기가 조용히 실패하는 것이 가장 비싸다.** 담당자는 고쳤다고 믿고 넘어가는데
   고객에게 나가는 금액은 안 바뀐 채로 남는다. 요율 저장을 실제로 눌러 본다. */
const WRITE_FAULTS = [
  { key: 'rateSave500', 말: '🔴 요율 저장이 500', how: (json) => json({ error: 'boom' }, false, 500) },
  { key: 'rateSaveDown', 말: '🔴 요율 저장 중 끊김', how: () => Promise.reject(new Error('down')) },
  { key: 'rateSave401', 말: '🔴 저장하려는데 세션이 끊겼다(401)', how: (json) => json({ error: 'unauthorized' }, false, 401) },
];

async function 요율저장고장(f) {
  const fx = adminFixtures('filled', {
    overrides: { 오키나와: { hotel_per_room: 152000, rateDate: '2026-07' } },
    fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {},
  });
  const orig = fx.route;
  fx.route = function (u, opt, json) {
    /* **저장(PATCH)만** 죽인다 — 조회는 살아 있어야 편집창이 열린다 */
    if (u.includes('/api/rates') && String(opt && opt.method).toUpperCase() === 'PATCH') return f.how(json);
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin.html', { fixtures: fx });
  const { win, doc, log, tick } = B;
  await B.ready; await tick(400);
  const got = await enterDashboard(B);
  const out = { key: f.key, 말: f.말, 나쁨: [] };
  if (!got.entered) { out.나쁨.push('🔴 대시보드에 못 들어갔다 — 픽스처를 확인할 것'); win.close(); return out; }

  if (typeof win.openRateEditModal !== 'function' || typeof win.saveRateEdit !== 'function') {
    out.나쁨.push('🔴 요율 편집 함수를 화면에서 못 찾았다 (이름이 바뀌었나)');
    win.close(); return out;
  }
  await win.openRateEditModal('오키나와');
  await tick(300);
  const modal = doc.getElementById('rateEditModal');
  if (!modal || modal.classList.contains('hidden')) {
    out.나쁨.push('🔴 편집창이 안 열렸다');
    win.close(); return out;
  }
  /* 값을 하나 바꾼다 — 실제 담당자가 하는 그대로 */
  const fld = doc.querySelector('#rate-edit-fields input[data-field="hotel_per_room"]');
  if (fld) { fld.value = '999000'; fld.dispatchEvent(new win.Event('input', { bubbles: true })); }

  const 말전 = log.says.length;
  try { await win.saveRateEdit(); } catch (e) { out.나쁨.push('🔴 저장을 누르니 터졌다: ' + String(e.message || e)); }
  await tick(500);

  const 말 = log.says.slice(말전).map((s) => s.text).join(' | ');
  const 닫혔나 = modal.classList.contains('hidden');
  out.말한것 = 말;
  out.닫힘 = 닫혔나;

  /* 🔴 저장이 실패했는데 **창이 닫히면** 담당자는 저장된 줄 안다 */
  if (닫혔나) out.나쁨.push('🔴 저장이 실패했는데 편집창이 닫혔다 (저장된 것처럼 보인다)');
  if (!말.trim()) out.나쁨.push('🔴 저장이 실패했는데 아무 말도 안 한다');
  else if (f.key === 'rateSave401' && !/로그인|세션|다시 접속/.test(말)) {
    out.나쁨.push('세션이 끊긴 것인데 그 사실을 안 말한다: ' + 말.slice(0, 50));
  }
  win.close();
  return out;
}

const ADMIN_FAULTS = [
  { key: 'listQuotes500', 말: '견적 목록 조회가 500', hit: (u) => u.includes('/api/quotes') },
  { key: 'listInq500', 말: '문의 목록 조회가 500', hit: (u) => u.includes('/api/inquiries') },
  { key: 'listShares500', 말: '견적서 대장 조회가 500', hit: (u) => u.includes('/api/quote-shares') },
  { key: 'ratesRead500', 말: '🔴 요율 조회가 500', hit: (u) => u.includes('/api/rates') && !u.includes('action=') },
];

async function 담당자화면고장(f) {
  const fx = adminFixtures('filled');
  const orig = fx.route;
  fx.route = function (u, opt, json) {
    if (f && f.hit(u, opt)) return json({ error: 'boom' }, false, 500);
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin.html', { fixtures: fx });
  await B.ready; await B.tick(400);
  const got = await enterDashboard(B);
  const out = { key: f.key, 말: f.말, 나쁨: [] };
  if (!got.entered) {
    /* ⚠ **못 들어가는 것 자체를 결함이라 부르지 않는다.** 낡은 목록으로 응대하는 것보다
       막는 쪽이 낫다는 판단이 이미 있다(PW). 여기서 볼 것은 **왜 못 들어가는지 말하는가**다 —
       아무 말 없이 로그인 폼만 남으면 담당자는 「비밀번호가 틀렸나?」로 오해한다. */
    const 로그인글 = shownText(B.doc.getElementById('loginPage') || B.doc.body).replace(/\s+/g, ' ').trim();
    out.글 = 로그인글;
    if (!/로그인은 되었지만|받아오지 못|다시 시도/.test(로그인글)) {
      out.나쁨.push('🔴 대시보드에 못 들어가는데 이유를 안 말한다');
    } else if (/오류 (200|201)[\/)]|\/200\)/.test(로그인글)) {
      /* 성공한 응답 코드를 「오류」라고 부르면 담당자가 무엇이 문제인지 못 읽는다 */
      out.나쁨.push('성공한 코드(200)를 오류로 함께 적는다');
    } else {
      out.막힘 = true;   /* 막혔지만 이유를 말했다 — 결함이 아니라 기록할 사실 */
    }
    B.win.close();
    return out;
  }
  /* 탭을 열어 화면이 무엇을 말하는지 본다 */
  const 탭 = { listQuotes500: 'estmgr', listInq500: 'inquiries', listShares500: 'ledger', ratesRead500: 'rates' }[f.key];
  const btn = 탭 && B.doc.querySelector('[data-tab="' + 탭 + '"]');
  if (btn) { btn.dispatchEvent(new B.win.MouseEvent('click', { bubbles: true, cancelable: true, view: B.win })); await B.tick(400); }
  const 칸 = (탭 && B.doc.getElementById('tab-' + 탭)) || B.doc.body;
  const 글 = shownText(칸).replace(/\s+/g, ' ').trim();
  out.글 = 글;

  /* 🔴 조회 실패를 「없음」으로 보여주면 담당자는 없는 줄 알고 넘어간다 */
  const 없다고함 = /없습니다|아직 한 건도|0건/.test(글);
  const 못불렀다고함 = /불러오지 못|불러올 수 없|오류|실패|다시 시도|새로고침/.test(글);
  if (없다고함 && !못불렀다고함) out.나쁨.push('🔴 못 불러온 것을 「없습니다」로 보여준다');
  if (!글.trim()) out.나쁨.push('🔴 빈 화면이다');
  if (!못불렀다고함 && !없다고함) out.나쁨.push('못 불러왔다는 말이 아무 데도 없다');
  B.win.close();
  return out;
}

(async () => {
  console.log('\n서버가 죽었을 때 고객이 무엇을 보는가 — 고장 ' + FAULTS.length + '가지');
  console.log('손님: ' + 손님.destKey + ' ' + 손님.participants + '명 ' + 손님.days + '일 · '
    + 손님.orgTypeText + ' · ' + 손님.programText);

  /* 요율은 프로덕션 값을 받는다 — 고객이 겪는 금액으로 재려고 */
  let rates = { overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {} };
  try {
    const r = await fetch('https://bizpage-estimate.vercel.app/api/rates');
    rates = await r.json();
    console.log('운영 요율 오버라이드 ' + Object.keys(rates.overrides || {}).length + '곳을 받았다\n');
  } catch (e) {
    console.log('⚠ 운영 요율을 못 받았다 — 기본값으로 잰다 (' + String(e.message || e) + ')\n');
  }

  const 목록 = [null].concat(ONLY ? FAULTS.filter((f) => f.key === ONLY) : FAULTS);
  const 결과 = [];
  for (const f of 목록) {
    let r;
    try { r = await 한판(f, rates); }
    catch (e) { r = { key: f ? f.key : 'none', 말: f ? f.말 : '대조군', 터짐: String(e.message || e) }; }
    r.나쁨 = r.터짐 ? ['🔴 태우다 터졌다: ' + r.터짐] : 판정(r);
    결과.push(r);
    const 표시 = r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : '✓';
    console.log('  ' + (r.key + '').padEnd(16) + (r.말 || '').padEnd(34) + 표시);
    if (VERBOSE) {
      console.log('      금액 ' + (r.금액나옴 ? '나옴' : '안 나옴')
        + ' · 발급버튼 ' + (r.발급버튼 ? '눌림' : '없음/막힘'));
      if (r.알림) console.log('      화면에 보이는 알림: ' + r.알림.slice(0, 110));
      if (r.머리) console.log('      모달 안(눌러야 보임): 「' + r.머리 + '」 ' + (r.본문 || '').slice(0, 60));
      if ((r.말풍선 || []).length) console.log('      말풍선: ' + r.말풍선.join(' | ').slice(0, 120));
      if ((r.문의말 || []).length || r.문의화면말) console.log('      문의: ' + [(r.문의말 || []).join(' | '), r.문의화면말].filter(Boolean).join(' / ').slice(0, 120));
      if ((r.오류 || []).length) console.log('      오류: ' + r.오류.join(' | ').slice(0, 120));
    }
  }

  /* ── 고객이 **받은 링크를 여는 길** ── */
  console.log('\n■ 고객이 카톡으로 받은 링크를 열었을 때');
  for (const f of VIEW_FAULTS) {
    if (ONLY && f.key !== ONLY) continue;
    let r;
    try { r = await 견적서열기(f); }
    catch (e) { r = { key: f.key, 말: f.말, 나쁨: ['🔴 열다 터졌다: ' + String(e.message || e)] }; }
    결과.push(r);
    console.log('  ' + r.key.padEnd(16) + (r.말 || '').padEnd(34)
      + (r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : '✓'));
    if (VERBOSE && r.글) console.log('      화면: ' + r.글.replace(/\s+/g, ' ').slice(0, 130));
  }

  /* ── 패키지 화면 ── */
  console.log('\n■ 패키지 화면 — 목록을 못 받았을 때');
  for (const f of PKG_FAULTS) {
    if (ONLY && f.key !== ONLY) continue;
    let r;
    try { r = await 패키지화면(f); }
    catch (e) { r = { key: f.key, 말: f.말, 나쁨: ['🔴 열다 터졌다: ' + String(e.message || e)] }; }
    결과.push(r);
    console.log('  ' + r.key.padEnd(16) + (r.말 || '').padEnd(34)
      + (r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : '✓'));
    if (VERBOSE && r.글) console.log('      화면: ' + r.글.slice(0, 130));
  }

  /* ── 담당자 화면 ── */
  console.log('\n■ 담당자 화면 — 조회가 죽었을 때');
  for (const f of ADMIN_FAULTS) {
    if (ONLY && f.key !== ONLY) continue;
    let r;
    try { r = await 담당자화면고장(f); }
    catch (e) { r = { key: f.key, 말: f.말, 나쁨: ['🔴 열다 터졌다: ' + String(e.message || e)] }; }
    결과.push(r);
    console.log('  ' + r.key.padEnd(16) + (r.말 || '').padEnd(34)
      + (r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : (r.막힘 ? '✓ (막히되 이유를 말한다)' : '✓')));
    if (VERBOSE && r.글) console.log('      화면: ' + r.글.slice(0, 130));
  }

  /* ── 패키지 발급 ── */
  console.log('\n■ 패키지 발급 — 고객이 「견적서 받기」를 눌렀을 때');
  for (const f of PKG_ISSUE_FAULTS) {
    if (ONLY && f.key !== ONLY) continue;
    let r;
    try { r = await 패키지발급고장(f); }
    catch (e) { r = { key: f.key, 말: f.말, 나쁨: ['🔴 열다 터졌다: ' + String(e.message || e)] }; }
    결과.push(r);
    console.log('  ' + r.key.padEnd(20) + (r.말 || '').padEnd(32)
      + (r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : '✓'));
    if (VERBOSE && r.글) console.log('      화면: ' + r.글.slice(0, 120));
  }

  /* ── 담당자 쓰기 경로 ── */
  console.log('\n■ 담당자 화면 — **요율 저장**이 죽었을 때 (고객 금액이 걸린 자리)');
  for (const f of WRITE_FAULTS) {
    if (ONLY && f.key !== ONLY) continue;
    let r;
    try { r = await 요율저장고장(f); }
    catch (e) { r = { key: f.key, 말: f.말, 나쁨: ['🔴 열다 터졌다: ' + String(e.message || e)] }; }
    결과.push(r);
    console.log('  ' + r.key.padEnd(16) + (r.말 || '').padEnd(34)
      + (r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : '✓'));
    if (VERBOSE && r.말한것) console.log('      말한 것: ' + String(r.말한것).slice(0, 130));
  }

  /* ── 담당자 견적 산출 화면 ── */
  console.log('\n■ 담당자 견적 산출 화면 — 저장이 죽었을 때');
  for (const f of AQ_FAULTS) {
    if (ONLY && f.key !== ONLY) continue;
    let r;
    try { r = await 견적산출화면고장(f); }
    catch (e) { r = { key: f.key, 말: f.말, 나쁨: ['🔴 열다 터졌다: ' + String(e.message || e)] }; }
    결과.push(r);
    console.log('  ' + r.key.padEnd(16) + (r.말 || '').padEnd(34)
      + (r.나쁨.length ? '🔴 ' + r.나쁨.join(' · ') : '✓'));
    if (VERBOSE && (r.경고 || r.글)) console.log('      화면: ' + (r.경고 || r.글).slice(0, 130));
  }

  const 나쁜것 = 결과.filter((r) => r.나쁨.length);
  console.log('\n' + '─'.repeat(72));
  console.log('고장 ' + (결과.length - 1) + '가지 · 🔴 문제 ' + 나쁜것.length + '가지');
  if (나쁜것.length) {
    console.log('\n무엇이 문제인가');
    나쁜것.forEach((r) => console.log('  · [' + r.key + '] ' + r.말 + '\n      → ' + r.나쁨.join('\n      → ')));
  }
  console.log('\n⚠ 이 도구가 통과했다고 프로덕션에서 사람이 겪어 본 것은 아니다.');
  process.exit(나쁜것.length ? 1 : 0);
})();

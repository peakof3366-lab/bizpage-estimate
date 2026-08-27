/* ═══════════════════════════════════════════════════════════════════════════
   XX — **발급 결과가 감춰진 모달 안에만 있었다**
   ───────────────────────────────────────────────────────────────────────────
   고장을 주입해 재 보니(`fault_journey.js`), 견적서 링크 발급이 실패해도 고객이 보는
   화면이 **성공했을 때와 사실상 같았다**:

     성공: 보이는 글자 3,638자 · 실패: 3,620자
     어느 쪽에도 「문제」·「다시」 같은 말이 없었다

   안내(`잠시 문제가 있었습니다 …`)는 있었지만 **`#share-modal` 안**에 쓰였고, 그 모달은
   고객이 「고객 링크 공유」를 눌러야 열린다. 링크를 기다린 고객은 영영 모른다.
   → 머리줄 아래 `#share-note` 한 줄로 **모달을 안 열어도 보이게** 한다.

   🔴 잠그는 것 넷:
     ① 발급이 실패하면 **보이는 영역에** 안내가 있다 (감춰진 모달 안이 아니라)
     ② 성공하면 「링크가 준비되었습니다」가 보인다 — 성공과 실패가 구별돼야 한다
     ③ 문구는 `REVIEW_TEXT` **한 곳**에서 온다(모달과 배너가 다른 말을 하면 안 된다)
     ④ 이 줄은 **인쇄물에 남지 않는다**(`no-print`) — 문서 내용이 아니라 지금 상태다.
        ⚠ XU의 「취소되었습니다」는 반대다. 그건 문서의 내용이라 인쇄에도 남아야 한다.
           성격이 다른 두 줄을 같은 규칙으로 다루지 말 것.

   실행: node ai-loop/test_xX_share_note.js
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { bootPage } = require('./_page_boot');
const { makeAll } = require('./_virtual_personas');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const 손님 = makeAll(1, 4242)[0];

/* 고객이 **실제로 볼 수 있는 글자** — 감춘 것은 걷어낸다.
   이 검사의 전부가 여기 달려 있다: 감춰진 모달 글자로 통과하면 아무것도 안 지킨다. */
function 보이는글(doc) {
  const c = doc.body.cloneNode(true);
  c.querySelectorAll('script,style').forEach((n) => n.remove());
  c.querySelectorAll('[style]').forEach((n) => {
    const s = String(n.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
    if (/display:none|visibility:hidden/.test(s)) n.remove();
  });
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}

async function 발급까지(고장) {
  const B = bootPage('index.html', {
    fixtures: {
      rates: { overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {} },
      route(u, opt, json) {
        if (고장 && u.includes('quote-shares') && opt && String(opt.method).toUpperCase() === 'POST') {
          return json({ error: 'boom' }, false, 500);
        }
        return null;
      },
    },
  });
  const { win, doc, log, tick } = B;
  await B.ready; await tick(300);
  const ev = (el, k) => el.dispatchEvent(new win.Event(k, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  const check = (id, on) => { const el = doc.getElementById(id); if (el) { el.checked = !!on; ev(el, 'change'); } };
  const p = 손님;
  ['programType', 'organizationType', 'visitMode', 'startDate', 'endDate', 'participants',
    'days', 'departureCity', 'agencyVisits', 'organization', 'contactName', 'contactTel',
    'requestDetails'].forEach((k) => set(k, p[k]));
  set('destination', p.destKey);
  ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((k) => check(k, p[k]));
  await tick(150);
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick(400);
  const dl = doc.getElementById('downloadEstimate');
  dl.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
  await tick(700);
  const w = log.opened[log.opened.length - 1];
  const 결과 = {
    있나: !!w,
    보임: w ? 보이는글(w.document) : '',
    노트: w && w.document.getElementById('share-note'),
    모달머리: w && w.document.getElementById('share-review-head')
      ? (w.document.getElementById('share-review-head').textContent || '').trim() : '',
  };
  try { if (w) w.close(); } catch (e) { /* 이미 닫힘 */ }
  win.close();
  return 결과;
}

(async () => {
  console.log('\n[1] 🔴 발급이 실패하면 **모달을 안 열어도** 그 사실이 보인다');
  const 실패 = await 발급까지(true);
  ok('견적서 창이 열린다', 실패.있나);
  ok('보이는 글에 「문제」가 있다', /문제/.test(실패.보임), 실패.보임.slice(0, 100));
  ok('무엇을 하면 되는지 말한다(다시 눌러 주세요)', /다시 눌러/.test(실패.보임));
  ok('견적서는 그대로 쓸 수 있다고 알려 준다', /인쇄|저장/.test(실패.보임));
  ok('모달 안에도 같은 사실이 있다(예전 경로도 살아 있다)',
    /문제/.test(실패.모달머리), 실패.모달머리);

  console.log('\n[2] 잘 됐을 때는 **다른 말**을 한다 — 성공과 실패가 구별돼야 한다');
  const 성공 = await 발급까지(false);
  ok('보이는 글에 「링크가 준비」가 있다', /링크가 준비/.test(성공.보임), 성공.보임.slice(0, 100));
  ok('실패 문구는 없다', !/잠시 문제가 있었습니다/.test(성공.보임));
  /* 🔴 이 두 화면이 **같아 보이던 것**이 이번 결함이다. 다시 같아지면 여기서 걸린다. */
  ok('성공과 실패의 화면이 서로 다르다', 성공.보임 !== 실패.보임);

  console.log('\n[3] 문구를 두 곳에 적지 않았다');
  const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  ok('배너가 REVIEW_TEXT에서 문구를 가져온다', /setNote[\s\S]{0,400}REVIEW_TEXT/.test(src));
  ok('showReview가 배너도 함께 갱신한다', /showReview[\s\S]{0,700}setNote\(kind\)/.test(src));

  console.log('\n[4] 인쇄물에는 남지 않는다 (문서 내용이 아니라 지금 상태다)');
  ok('share-note에 no-print가 붙어 있다', /id="share-note"[^>]*class="no-print"/.test(src));
  /* ⚠ XU의 취소 안내는 반대다 — 그건 인쇄에도 남아야 한다. 섞이지 않았는지 함께 본다. */
  ok('XU의 취소 안내는 여전히 인쇄에서 안 숨는다',
    !/no-print[^>]*>[^<]*취소되었습니다/.test(fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8')));

  console.log('\n[5] 🔴 링크를 열 때 — **우리 쪽 고장**과 **없는 링크**를 가른다');
  {
    /* 예전에는 무엇이 실패하든 「링크가 올바르지 않거나 만료되었습니다」 하나였다.
       서버가 500이어도 그렇게 말했다 — **링크는 멀쩡한데** 고객에게 틀렸다고 하고
       담당자에게 보낸 것이다(XH·XS에서 두 번 고친 자리, 세 번째). */
    const 열기 = async (how) => {
      const B = bootPage('estimate-view.html', {
        query: '?id=testshare1',
        fixtures: { route: (u, o, json) => (/\/api\/quote-shares\/[^?]+$/.test(u) ? how(json) : null) },
      });
      await B.ready; await B.tick(400);
      const c = B.doc.body.cloneNode(true);
      c.querySelectorAll('script,style').forEach((n) => n.remove());
      const t = (c.textContent || '').replace(/\s+/g, ' ').trim();
      B.win.close();
      return t;
    };
    const 없는링크 = await 열기((json) => json({ error: 'not_found' }, false, 404));
    ok('404는 「링크가 올바르지 않거나 만료」라고 말한다', /링크가 올바르지 않|만료/.test(없는링크));

    const 서버고장 = await 열기((json) => json({ error: 'boom' }, false, 500));
    ok('500은 「지금 열 수 없습니다」로 말한다', /지금 열 수 없습니다/.test(서버고장), 서버고장.slice(0, 90));
    ok('500에 「링크는 그대로 유효합니다」가 있다', /링크는 그대로 유효/.test(서버고장));
    ok('500에 「링크가 올바르지 않다」는 말이 없다', !/링크가 올바르지 않/.test(서버고장));
    ok('500에 다시 시도할 자리가 있다', /다시 시도|새로고침/.test(서버고장));

    const 끊김 = await 열기(() => Promise.reject(new Error('down')));
    ok('네트워크 끊김도 같은 갈래로 간다', /지금 열 수 없습니다/.test(끊김));

    const 빈답 = await 열기((json) => json({ error: 'x' }));
    ok('200인데 알맹이가 없어도 우리 쪽 문제로 본다', /지금 열 수 없습니다/.test(빈답));

    ok('못 열었을 때 「유효기간 확인 중…」이 안 남는다',
      !/유효기간 확인 중/.test(서버고장) && !/유효기간 확인 중/.test(없는링크));
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

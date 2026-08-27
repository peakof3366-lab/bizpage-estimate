/* ═══════════════════════════════════════════════════════════════════════════
   **담당자가 누를 수 있는 것을 전부 눌러 보는 자** (XT)
   ───────────────────────────────────────────────────────────────────────────
   고객 화면은 `audit_customer_journey.js`가 87개를 눌러 본다. 담당자 화면은
   **지금까지 아무도 이 눈으로 안 봤다** — 탭 17개·버튼 137개·입력칸 69개에,
   목록·표 안에서 스크립트가 그려 내는 버튼이 29개 더 있다.
   그리고 그 화면이 **고객 금액을 정하는 곳**이다(요율 관리).

   ■ 고객 화면과 **같은 자**를 쓴다 (`_journey_probe.js`)
   규칙이 도구마다 한 벌씩 생기면 「터졌다」·「죽은 링크」·「아무 일도 안 났다」의 뜻이
   두 화면에서 달라지고, 그러면 두 결과를 나란히 놓고 볼 수 없다(결함 생성기 ①).

   ■ 🔴 담당자 화면만의 함정 셋
     ① **로그인부터 통과해야** 아무것도 안 보인다(`_admin_fixtures.js`).
        안 그러면 로그인 폼만 훑고 「깨끗하다」고 말한다(결함 생성기 ③).
     ② **탭이 17개**다. 감춘 탭의 버튼은 담당자도 못 누른다 — 한 칸씩 열고
        **그때 눌러 볼 수 있는 것**을 다시 센다.
     ③ **누르면 안 되는 것이 있다.** 로그아웃은 나머지를 못 보게 만들고, 「전체 삭제」류는
        (서버가 스텁이라 실제로는 안 지워지지만) 화면을 비워 뒤 검사가 아무것도 못 본다.
        그런 것은 **건너뛴 사실을 남기고** 지나간다 — 조용히 빼면 「눌러 봤다」가 거짓이 된다.

   ■ 두 상태로 돈다 — **빈 계정과 며칠 쓴 계정은 다른 화면이다**
     목록이 비었을 때만 나는 결함이 있고(XN이 그랬다), 줄이 있을 때만 나는 것도 있다.

   ■ 담당자가 쓰는 화면은 **둘**이다 (XV에서 더했다)
     · `admin.html` — 목록·요율·일정. 탭 17개를 한 칸씩 연다
     · `admin-quote.html` — **고객에게 나갈 견적을 실제로 만드는 자리.** STEP 1 → 2 → 결과
     한쪽만 훑고 「담당자 화면은 깨끗하다」고 말하면 그게 곧 거짓 초록이다.

   실행:
     node ai-loop/audit_admin_journey.js
     node ai-loop/audit_admin_journey.js --verbose
     node ai-loop/audit_admin_journey.js --mode=filled
     node ai-loop/audit_admin_journey.js --mode=quote    (견적 산출 화면만)
   ═══════════════════════════════════════════════════════════════════════════ */
const { auditPage, visibleText } = require('./_journey_probe');
const { adminFixtures, enterDashboard } = require('./_admin_fixtures');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONE = (() => { const a = args.find((x) => x.startsWith('--mode=')); return a ? a.split('=')[1] : null; })();

/* 🔴 누르면 뒤를 못 보게 만드는 것 — **건너뛴 사실을 남긴다**
   ⚠ 「위험해 보여서」가 아니라 **「누르면 이 검사가 눈이 먼다」**가 기준이다.
     서버는 스텁이라 실제로 지워지는 것은 없다. 문제는 화면이 비어 버리는 것이다. */
const 건너뛸것 = /로그아웃|전체 삭제|초기화|모두 지우|되돌리기/;
function skip(el) {
  const t = (visibleText(el) || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  return 건너뛸것.test(t);
}

async function 담당자화면(mode) {
  const r = await auditPage('admin.html', {
    fixtures: adminFixtures(mode),
    settle: 320,
    skipDetached: true,   /* 목록이 늦게 그려져 앞 버튼이 사라지는 일이 잦다 */
    /* 🔴 담당자 화면이 **말을 거는 자리**들. 누르기 전에 비워서, 같은 안내가 이미 떠
       있어 「아무 일도 안 났다」로 세어지는 일을 막는다(그렇게 없는 결함 11개가 났다).
     ⚠ 이 목록은 화면에서 실제로 쓰는 것만 적는다 — 아무 요소나 지우면 화면을 망가뜨린다. */
    messageSelector: '[id$="-msg"], [id$="Msg"], .iti-msg, .cms-field-msg, .detail-message, .err-msg, .recent-msg',
    skip,
    after: async (B) => {
      const got = await enterDashboard(B);
      if (!got.entered) throw new Error('대시보드에 못 들어갔다 — 로그인 픽스처를 확인할 것');
    },
    sections: async (B) => [...new Set(Array.from(B.doc.querySelectorAll('[data-tab]'))
      .map((el) => el.getAttribute('data-tab')).filter(Boolean))]
      .map((tab) => ({
        name: tab,
        enter: async (BB) => {
          const btn = BB.doc.querySelector('[data-tab="' + tab + '"]');
          if (btn) btn.dispatchEvent(new BB.win.MouseEvent('click', { bubbles: true, cancelable: true, view: BB.win }));
          await BB.tick(220);
          /* 🔴 **접힌 것을 펼치고 나서 센다** (XV). 닫힌 `<details>` 속은 화면에 없어서
             `clickables`가 뺀다 — 옳은 규칙이다(담당자도 못 누른다). 그런데 요율 관리처럼
             목적지마다 아코디언인 탭이 있어, 규칙만 넣고 끝내면 **눌러 보는 것이 334 → 226**으로
             조용히 줄어든다. 커버리지가 준 것을 「깨끗해졌다」로 읽으면 그게 가장 나쁘다.
             → 담당자가 실제로 하는 일(펼쳐서 누른다)을 그대로 한다. */
          const 칸 = BB.doc.getElementById('tab-' + tab);
          Array.from((칸 || BB.doc).querySelectorAll('details')).forEach((d) => { d.open = true; });
        },
        /* 🔴 **그 탭 안만 본다.** 안 그러면 같은 버튼을 17번씩 누른다 */
        scope: (d) => d.getElementById('tab-' + tab) || d.body,
      })),
  });
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   **담당자 견적 산출 화면** (`admin-quote.html`) — XV
   ───────────────────────────────────────────────────────────────────────────
   🔴 이 화면은 지금까지 **어느 훑기에도 안 들어 있었다.** `audit_customer_journey`는
   고객 화면 넷을, `audit_admin_journey`는 `admin.html` 하나를 본다. 그런데 담당자가
   **고객에게 나갈 견적을 실제로 만드는 자리**는 여기다(전화 받으면서 여는 화면이다).

   ■ 세 걸음으로 나눠 훑는다 — **한 번에 다 세면 없는 결함이 생긴다**
     STEP 1(여행 정보) → STEP 2(고객 정보) → 결과(견적서·엑셀·일정).
     결과 카드는 `#estimateConfirm` 하나인데 **STEP 2 안에** 들어 있다. 감춰져 있는
     동안은 `clickables`가 알아서 뺀다 — 그래서 STEP 2를 훑을 때 섞이지 않는다.

   ■ ⚠ 이 화면은 **누를 수 있는 것의 모양이 다르다**
     목적지 55곳·프로그램·기관·포함 항목이 전부 `<label class="aq-list-row">` 줄이고,
     목적지는 나라별 `<details>`로 접혀 있다. 기본 선택자로는 **9개**만 잡힌다 —
     실제로 담당자가 누르는 것은 **127개**다. `also`로 더해 준다.
   ═══════════════════════════════════════════════════════════════════════════ */
const 예시 = {
  destination: '다낭', programType: 'industry', organizationType: 'company',
  visitMode: 'official', departureCity: 'ICN', participants: '30',
  organization: '[점검] 한빛전자', contactName: '[점검] 김담당', contactTel: '010-0000-0000',
  /* ⚠ 이 칸도 **필수**다(고객 화면과 같다). 비우면 화면이 「요청 사항 / 메모만
     입력하시면 됩니다」라고 정확히 말하고 제출을 막는다 — 픽스처가 모자란 것이지
     결함이 아니다. 처음에 이걸 빼고 돌려서 「결과 카드가 안 열린다」로 잡혔다. */
  requestDetails: '[점검] 도구가 눌러 본 기록입니다.',
};

function 폼채우기(B) {
  const { win, doc } = B;
  const ev = (el, k) => el.dispatchEvent(new win.Event(k, { bubbles: true }));
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); ev(el, 'input'); ev(el, 'change'); } };
  const 날 = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  Object.keys(예시).forEach((k) => set(k, 예시[k]));
  set('startDate', 날(45));
  set('endDate', 날(49));
}

async function 견적산출화면() {
  const 단계 = (d, n) => d.querySelector('.estimate-step[data-step="' + n + '"]');
  const 열려있나 = (d, n) => { const s = 단계(d, n); return !!s && s.classList.contains('step-active'); };

  return auditPage('admin-quote.html', {
    fixtures: adminFixtures('filled'),
    settle: 320,
    skipDetached: true,
    /* 이 화면에서만 누를 수 있는 것 — 고르는 줄과 나라별 접기 */
    also: 'label.aq-list-row, summary',
    /* 검색으로 걸러진 목적지 줄은 화면에 없다(`.aq-row-hidden { display:none }`) */
    hiddenClasses: ['aq-row-hidden'],
    /* 이 화면이 말을 거는 자리 — 누르기 전에 비우고 잰다(안 그러면 「조용하다」로 세어진다) */
    messageSelector: '.step-missing, #aqSaveWarn, #aqItiState',
    after: async (B) => {
      /* 🔴 **로그인 게이트를 정말 지났는지 확인한다.** 못 지나면 `#quoteApp`이 통째로
         감춰져 있어 「누를 것이 5개뿐인데 전부 깨끗하다」는 거짓 초록이 된다. */
      const app = B.doc.getElementById('quoteApp');
      if (!app || app.classList.contains('hidden')) {
        throw new Error('견적 산출 화면이 안 열렸다 — 로그인 픽스처를 확인할 것');
      }
    },
    sections: async () => [
      {
        name: 'STEP1 여행정보',
        /* 나라별 접기를 전부 펼친다 — 접힌 채로 누르면 「담당자가 못 누르는 것」을
           눌러 놓고 눌러 봤다고 세게 된다. 펼치는 줄(`<summary>`) 자체도 훑는다. */
        enter: async (B) => { Array.from(B.doc.querySelectorAll('details')).forEach((d) => { d.open = true; }); },
        scope: (d) => 단계(d, 1),
      },
      {
        name: 'STEP2 고객정보',
        enter: async (B) => {
          폼채우기(B);
          await B.tick(120);
          const next = B.doc.getElementById('nextStepButton');
          if (next) next.dispatchEvent(new B.win.MouseEvent('click', { bubbles: true, cancelable: true, view: B.win }));
          await B.tick(200);
          if (!열려있나(B.doc, 2)) throw new Error('「다음 단계로 이동」을 눌렀는데 STEP 2가 안 열렸다');
        },
        scope: (d) => 단계(d, 2),
      },
      {
        name: '견적 결과',
        enter: async (B) => {
          const conf = B.doc.getElementById('estimateConfirm');
          if (!conf || conf.classList.contains('hidden')) {
            폼채우기(B);
            await B.tick(120);
            B.doc.getElementById('estimateForm')
              .dispatchEvent(new B.win.Event('submit', { bubbles: true, cancelable: true }));
            await B.tick(400);
          }
          const c2 = B.doc.getElementById('estimateConfirm');
          if (!c2 || c2.classList.contains('hidden')) {
            throw new Error('「견적 산출하기」를 눌렀는데 결과 카드가 안 열렸다');
          }
        },
        scope: (d) => d.getElementById('estimateConfirm'),
      },
    ],
  });
}

(async () => {
  /* `--mode=quote`는 견적 산출 화면만 본다(관리자 화면은 오래 걸린다) */
  const modes = ONE === 'quote' ? [] : (ONE ? [ONE] : ['empty', 'filled']);
  /* 담당자가 쓰는 화면은 **둘**이다 — 관리자 화면과 견적 산출 화면.
     한쪽만 훑고 「담당자 화면은 깨끗하다」고 말하면 그게 곧 거짓 초록이다. */
  const 훑기 = modes.map((mode) => ({
    이름: 'admin.html — ' + (mode === 'empty' ? '빈 계정 (막 만든 팀원)' : '며칠 쓴 계정'),
    run: () => 담당자화면(mode),
  }));
  if (!ONE || ONE === 'quote') 훑기.push({ 이름: 'admin-quote.html — 견적 산출 (STEP 1 → 2 → 결과)', run: 견적산출화면 });

  let 터짐 = 0, 죽은링크 = 0, 조용함 = 0, 눌러본것 = 0, 건너뜀 = 0, 사라짐 = 0;

  for (const 한판 of 훑기) {
    const 이름 = 한판.이름;
    let r;
    try { r = await 한판.run(); }
    catch (e) {
      console.log('\n🔴 ' + 이름 + ' — ' + String(e.message || e));
      터짐++;
      continue;
    }

    console.log('\n' + '═'.repeat(72));
    console.log('■ ' + 이름);
    console.log('═'.repeat(72));

    if (r.loadErrors.length) {
      console.log('\n🔴 열자마자 나는 오류 ' + r.loadErrors.length + '건');
      r.loadErrors.slice(0, 6).forEach((e) => console.log('   · [' + e.where + '] ' + e.msg));
      터짐 += r.loadErrors.length;
    }
    if (r.dead.length) {
      console.log('\n🔴 죽은 링크 ' + r.dead.length + '건');
      r.dead.slice(0, 8).forEach((d) => console.log('   · ' + d.href + ' — ' + d.why + ' (' + d.label + ')'));
      죽은링크 += r.dead.length;
    }

    const pressed = r.results.filter((x) => !x.gone && !x.skipped);
    const skipped = r.results.filter((x) => x.skipped);
    const gone = r.results.filter((x) => x.gone);
    눌러본것 += pressed.length; 건너뜀 += skipped.length; 사라짐 += gone.length;

    const bad = pressed.filter((x) => x.threw || x.errors.length);
    if (bad.length) {
      console.log('\n🔴 누르면 터지는 것 ' + bad.length + '개');
      bad.slice(0, 12).forEach((x) => console.log('   · [' + x.section + '] ' + x.label
        + '  → ' + (x.threw || x.errors[0])));
      터짐 += bad.length;
    } else {
      console.log('\n✓ 누르면 터지는 것 없음 (' + pressed.length + '개 눌러 봤다)');
    }

    /* `picked` — 골라진 것이 바뀌면 일이 난 것이다(XV). 자세한 이유는 `_journey_probe`에 */
    const silent = pressed.filter((x) => !x.threw && !x.errors.length && !x.changed && !x.picked
      && !x.fetched && !x.says.length && !x.navs.length && !x.acted && !x.messaged);
    조용함 += silent.length;
    console.log('\n⚠ 눌러도 아무 일도 안 나는 것 ' + silent.length + '개 (확인 대상 — 결함이 아닐 수 있다)');
    if (VERBOSE || silent.length <= 12) {
      silent.forEach((x) => console.log('   · [' + x.section + '] ' + x.label));
    }

    /* 🔴 **말풍선으로 끝나는 것**은 담당자에게 「했다/안 했다」를 안 알려 준다 */
    const 말풍선 = pressed.filter((x) => x.says.length && !x.fetched && !x.changed && !x.messaged);
    if (말풍선.length) {
      console.log('\n⚠ 말풍선만 뜨고 끝나는 것 ' + 말풍선.length + '개');
      말풍선.slice(0, 8).forEach((x) => console.log('   · [' + x.section + '] ' + x.label
        + '  → ' + x.says[0].text.slice(0, 60)));
    }

    if (skipped.length) {
      console.log('\nℹ 일부러 안 누른 것 ' + skipped.length + '개 (누르면 뒤를 못 본다)');
      if (VERBOSE) skipped.forEach((x) => console.log('   · [' + x.section + '] ' + x.label));
    }
    if (gone.length) {
      console.log('ℹ 앞 버튼이 화면을 다시 그려 사라진 것 ' + gone.length + '개 (결함이 아니다)');
    }
    if ((r.log.notImplemented || []).length) {
      console.log('\nℹ jsdom이 못 하는 일 ' + r.log.notImplemented.length + '건 (실제 브라우저에서는 정상)');
      const 종류 = [...new Set(r.log.notImplemented.map((m) => m.split(':')[1] ? m.split(':')[1].trim().slice(0, 44) : m.slice(0, 44)))];
      종류.slice(0, 4).forEach((m) => console.log('   · ' + m));
    }
    console.log('  (바깥 서버 자원 ' + [...new Set(r.log.external.map((u) => u.split('/')[2]))].join(' · ') + ')');
  }

  console.log('\n' + '─'.repeat(72));
  console.log('합계: 눌러 본 것 ' + 눌러본것 + '개 · 🔴터짐 ' + 터짐 + ' · 🔴죽은 링크 ' + 죽은링크
    + ' · ⚠조용함 ' + 조용함 + ' · 일부러 안 누름 ' + 건너뜀 + ' · 사라짐 ' + 사라짐);
  console.log('⚠ 이 도구가 통과했다고 **프로덕션에서 사람이 눌러 본 것은 아니다.**');
  process.exit(터짐 || 죽은링크 ? 1 : 0);
})();

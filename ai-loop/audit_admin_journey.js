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

   실행:
     node ai-loop/audit_admin_journey.js
     node ai-loop/audit_admin_journey.js --verbose
     node ai-loop/audit_admin_journey.js --mode=filled
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
        },
        /* 🔴 **그 탭 안만 본다.** 안 그러면 같은 버튼을 17번씩 누른다 */
        scope: (d) => d.getElementById('tab-' + tab) || d.body,
      })),
  });
  return r;
}

(async () => {
  const modes = ONE ? [ONE] : ['empty', 'filled'];
  let 터짐 = 0, 죽은링크 = 0, 조용함 = 0, 눌러본것 = 0, 건너뜀 = 0, 사라짐 = 0;

  for (const mode of modes) {
    const 이름 = mode === 'empty' ? '빈 계정 (막 만든 팀원)' : '며칠 쓴 계정';
    let r;
    try { r = await 담당자화면(mode); }
    catch (e) {
      console.log('\n🔴 ' + 이름 + ' — ' + String(e.message || e));
      터짐++;
      continue;
    }

    console.log('\n' + '═'.repeat(72));
    console.log('■ admin.html — ' + 이름);
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

    const silent = pressed.filter((x) => !x.threw && !x.errors.length && !x.changed
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

/* ═══════════════════════════════════════════════════════════════════════════
   고객이 누를 수 있는 것을 **전부 눌러 보는 자** (XK)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-26): 「고객의 입장에서 버튼 하나하나 다 눌러서, 최적화되어
   서비스가 제공되는지 전부 확인하라.」

   ■ 왜 도구로 만드나 — 손으로 훑으면 **다음 주에 또 처음부터**다
   WK~XG에서 손으로 훑어 결함 여섯을 건졌는데, 그 훑기는 기억으로만 남는다. 화면이
   바뀌면 다시 처음부터다. 그래서 **누를 수 있는 것을 세고 눌러 보는 일 자체**를
   도구로 만든다. 세어 보는 도구가 이 저장소에서 가장 많이 건졌다.

   ■ 무엇을 재나
     ① **터지는 버튼** — 누르면 예외가 나 그 자리에서 화면이 죽는 것
     ② **죽은 링크** — 없는 파일·없는 앵커로 보내는 것
     ③ **말풍선으로만 끝나는 것** — 무슨 말을 하는지까지 적는다(막다른 안내가 여기서 보인다)
     ④ **아무 일도 안 하는 버튼** — 눌러도 화면이 그대로이고 요청도 안 나가는 것

   ⚠ ④는 **결함이 아닐 수 있다**(이미 눌린 필터, 스크롤 버튼). 그래서 판정하지 않고
     **목록으로 남긴다** — `audit_rates`의 「확인 대상은 오류가 아니다」와 같은 규칙이다.
   ⚠ 화면이 넘어가는 링크는 여기서 **막고 어디로 가는지만 적는다.** 안 막으면 jsdom이
     「navigation to another Document」를 던져 **멀쩡한 메뉴가 「터지는 버튼」이 된다**
     (처음 돌렸을 때 9건 중 8건이 그것이었다 — 검사가 만든 가짜 결함).
   ⚠ 바뀌었는지는 **글자 수가 아니라 내용 해시**로 본다. 탭·아코디언은 한쪽에서 `on`을
     떼고 다른 쪽에 붙여 **길이가 그대로**라, 길이로 재면 멀쩡한 FAQ 여섯 개가
     「아무 일도 안 하는 버튼」으로 잡힌다(실제로 그렇게 잡혔다).

   실행: node ai-loop/audit_customer_journey.js [--page index.html] [--verbose]
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONLY = (() => { const i = args.indexOf('--page'); return i >= 0 ? args[i + 1] : null; })();

/* 🔴 **훑는 규칙은 `_journey_probe.js` 하나가 진실이다** (XT).
   담당자 화면(`audit_admin_journey.js`)도 같은 자를 쓴다 — 규칙이 두 벌이 되면
   「터졌다」·「죽은 링크」·「아무 일도 안 났다」의 뜻이 두 화면에서 달라지고,
   그러면 두 결과를 나란히 놓고 볼 수 없다(결함 생성기 ①). */
const { auditPage, visibleText, ROOT } = require('./_journey_probe');

(async () => {
  const PAGES = ONLY ? [ONLY] : ['index.html', 'packages.html', 'estimate-view.html', '404.html'];
  let broken = 0, deadCount = 0, quiet = 0, clicks = 0;

  for (const file of PAGES) {
    const r = await auditPage(file);
    clicks += r.results.length;
    console.log('\n' + '═'.repeat(70));
    console.log('■ ' + file + ' — 누를 수 있는 것 ' + r.results.length + '개');
    console.log('═'.repeat(70));

    if (r.loadErrors.length) {
      console.log('\n🔴 열자마자 나는 오류 ' + r.loadErrors.length + '건');
      r.loadErrors.slice(0, 8).forEach((e) => console.log('   · [' + e.where + '] ' + e.msg));
      broken += r.loadErrors.length;
    }

    const bad = r.results.filter((x) => x.threw || x.errors.length);
    if (bad.length) {
      console.log('\n🔴 누르면 터지는 것 ' + bad.length + '개');
      bad.forEach((x) => console.log('   · ' + x.label + '\n       → ' + (x.threw || x.errors.join(' / ')).slice(0, 160)));
      broken += bad.length;
    } else console.log('\n✓ 누르면 터지는 것 없음');

    if (r.dead.length) {
      console.log('\n🔴 죽은 링크 ' + r.dead.length + '개');
      r.dead.forEach((d) => console.log('   · ' + d.label + '  → ' + d.href + ' (' + d.why + ')'));
      deadCount += r.dead.length;
    } else console.log('✓ 죽은 링크 없음');

    const said = r.results.filter((x) => x.says.length);
    if (said.length) {
      console.log('\n■ 누르면 말풍선으로 말하는 것 ' + said.length + '개');
      said.forEach((x) => x.says.forEach((s) => console.log('   · ' + x.label + '  → [' + s.kind + '] ' + s.text.slice(0, 140))));
    }

    if (r.log.missingLocal.length) {
      const miss = [...new Set(r.log.missingLocal)];
      console.log('\n🔴 우리 저장소에 없는 파일을 부른다 ' + miss.length + '건');
      miss.forEach((f) => console.log('   · ' + f));
      broken += miss.length;
    }

    /* ⚠ **사라진 것·건너뛴 것을 「조용함」으로 세지 않는다** (XT). 앞 버튼이 화면을
       다시 그려 없어진 버튼은 고객이 누를 수도 없다 — 그걸 「눌러도 아무 일 없다」로
       세면 고칠 것이 없는 항목이 목록에 남고, 그러면 목록 전체를 안 보게 된다.
       (공용 모듈로 옮기면서 실제로 2건이 그렇게 세어졌고, diff가 잡았다.) */
    const pressed = r.results.filter((x) => !x.gone && !x.skipped);
    const gone = r.results.filter((x) => x.gone);
    const silent = pressed.filter((x) => !x.threw && !x.errors.length && !x.changed
      && !x.fetched && !x.says.length && !x.navs.length && !x.acted);
    if (gone.length) {
      console.log('\nℹ 앞 버튼이 화면을 다시 그려 사라진 것 ' + gone.length + '개 (결함이 아니다)');
    }
    quiet += silent.length;
    console.log('\n⚠ 눌러도 아무 일도 안 나는 것 ' + silent.length + '개 (확인 대상 — 결함이 아닐 수 있다)');
    if (VERBOSE || silent.length <= 6) silent.forEach((x) => console.log('   · ' + x.label));

    const nm = r.nameless;
    const nmTotal = nm.inputs.length + nm.buttons.length + nm.images.length + nm.links.length;
    if (nmTotal) {
      console.log('\n⚠ 이름 없는 조작 장치 ' + nmTotal + '개 (화면 낭독기가 무엇인지 못 말해 준다)');
      if (nm.inputs.length) console.log('   · 라벨 없는 입력칸 ' + nm.inputs.length + ': ' + nm.inputs.slice(0, 8).join(', '));
      if (nm.buttons.length) console.log('   · 글자 없는 버튼 ' + nm.buttons.length + ': ' + nm.buttons.slice(0, 8).join(', '));
      if (nm.images.length) console.log('   · alt 없는 사진 ' + nm.images.length + ': ' + nm.images.slice(0, 5).join(', '));
      if (nm.links.length) console.log('   · 글자 없는 링크 ' + nm.links.length + ': ' + nm.links.slice(0, 5).join(', '));
    }

    const navd = r.results.filter((x) => x.navs.length).length;
    const ext = [...new Set(r.log.external.map((u) => (u.match(/^https?:\/\/[^/]+/) || [u])[0]))];
    console.log('  (화면을 넘기는 링크 ' + navd + '개 · 요청 ' + r.log.requests.length
      + '건 · 새 창 ' + r.log.opened.length + '번 · 인쇄 ' + r.log.printed + '번 · 파일 저장 ' + r.log.downloads.length + '번)');
    if (ext.length) console.log('  ⚠ 바깥 서버 자원 ' + r.log.external.length + '건 (' + ext.join(' · ') + ') — 그쪽이 느리면 고객 화면도 느리다');
  }

  console.log('\n' + '─'.repeat(70));
  console.log('합계: 눌러 본 것 ' + clicks + '개 · 🔴터짐 ' + broken + ' · 🔴죽은 링크 ' + deadCount + ' · ⚠조용함 ' + quiet);
  process.exit(broken || deadCount ? 1 : 0);
})();

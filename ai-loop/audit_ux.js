/* ═══════════════════════════════════════════════════════════════════════════
   **화면을 보자마자 이해되는가**를 재는 자 (XT)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-27): 「고객이든 관리자든, 화면을 봤을 때 바로바로 이해되는 구조로
   레이아웃이든 모든 게 최적의 UI/UX를 갖췄으면 좋겠다.」

   ■ 🔴 왜 도구부터 만드나 — **취향으로 고치면 좋아졌는지 아무도 모른다**
   「예쁘게」는 잴 수 없지만 **「바로 이해되는가」는 잴 수 있는 부분이 있다.** 여기서는
   사람이 판단할 필요 없이 셀 수 있는 것만 센다. 나머지(색·여백·글꼴)는 이 도구가
   다루지 않는다 — 잴 수 없는 것을 재는 척하면 그 숫자가 오히려 판단을 막는다.

   ■ 재는 것 (전부 **세기**다. 판정은 사람이 한다 — `audit_rates`와 같은 원칙)
     ① **이 화면이 무엇인지 말하는가**        제목이 있는가
     ② **지금 무엇을 하라는지 말하는가**      안내 문장이 있는가
     ③ **주요 행동이 하나로 도드라지는가**    강조 버튼이 둘 이상이면 무엇부터일지 모른다
     ④ **버튼이 무슨 일이 날지 말하는가**     「확인」·「적용」처럼 무색인 이름
     ⑤ 🔴 **영문·기술 용어가 고객 눈에 보이는가**  `golfRounds` 같은 것
     ⑥ **비어 있을 때 다음 행동을 말하는가**  0건 화면이 막다른 길인가
     ⑦ **낭독기가 읽을 이름이 없는 것**       아이콘만 있는 버튼·라벨 없는 칸
     ⑧ **한 번에 보이는 조작 수**            인지 부하

   ⚠ **관리자 화면은 로그인부터 통과해야** 아무것도 안 보인다(`_admin_fixtures.js`).
     안 그러면 로그인 폼만 재고 「깨끗하다」고 말하게 된다(결함 생성기 ③).
   ⚠ **감춰진 글자를 세지 않는다.** 화면마다 감추는 방식이 다르다(`.hidden` · 인라인
     `display:none`) — 한쪽만 걷으면 안 보이는 안내를 보고 통과한다(XS에서 실제로 그랬다).

   실행:
     node ai-loop/audit_ux.js                 전 화면
     node ai-loop/audit_ux.js --page index.html
     node ai-loop/audit_ux.js --verbose       걸린 것을 전부 나열
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage } = require('./_page_boot');
const { shownText, namelessControls, ROOT } = require('./_journey_probe');
const { adminFixtures, enterDashboard } = require('./_admin_fixtures');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONLY = (() => { const i = args.indexOf('--page'); return i >= 0 ? args[i + 1] : null; })();

/* 보이는가 — 화면마다 감추는 방식이 다르다 */
function visible(el, doc) {
  let n = el;
  while (n && n !== doc.body) {
    if (n.classList && n.classList.contains('hidden')) return false;
    const st = (n.getAttribute && n.getAttribute('style')) || '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(st)) return false;
    if (n.hasAttribute && n.hasAttribute('hidden')) return false;
    n = n.parentElement;
  }
  return true;
}

/* ④ 무슨 일이 날지 말하지 않는 이름.
   ⚠ 「닫기」·「취소」·「저장」은 뺐다 — 맥락이 하나뿐이라 사람이 헷갈리지 않는다.
     여기 넣으면 고칠 것이 없는 항목이 목록을 채우고, 그러면 목록 전체를 안 보게 된다. */
const 무색 = ['확인', '적용', '실행', '처리', '전송', '등록', '완료', 'OK', '예', '아니오', '선택', '보기'];

/* ⑤ 🔴 고객 눈에 영문 식별자가 보이는 것. 오늘(XS) 「golfRounds」가 그렇게 나갔다.
   ⚠ 브랜드·고유명사·단위는 뺀다 — 그건 영문이어도 사람이 읽는 말이다. */
const 영문허용 = /^(ENBT|VAT|PDF|CSV|OK|ID|API|URL|KTX|ICN|GMP|PUS|TAE|KWJ|CJU|MICE|DAY|COURSE|PER|TOTAL|SHARE|RECOMMENDED|ITINERARY|DESTINATION|PHOTOS|GUIDE|PARTICIPANT|Ver|No|vs)$/i;
function 기술용어(txt) {
  const hits = new Set();
  /* camelCase — 사람이 쓰는 말에는 거의 없다(`golfRounds`·`bizCount`) */
  (txt.match(/\b[a-z]{2,}[A-Z][a-zA-Z]{1,}\b/g) || []).forEach((w) => hits.add(w));
  /* snake_case — DB 칸 이름이 새어 나온 자리 */
  (txt.match(/\b[a-z]{2,}_[a-z_]{2,}\b/g) || []).forEach((w) => hits.add(w));
  return [...hits].filter((w) => !영문허용.test(w));
}

/* ③ 강조 버튼 — 클래스 이름으로 본다(색을 계산할 수 없으니 이름이 유일한 단서다) */
const 강조패턴 = /(^|[\s-])(primary|cta|main|btn-red|btn-primary|btn-main|btn-dl-main|btn-get|ready)([\s-]|$)/i;

function measure(doc, scope) {
  const root = scope || doc.body;
  const txt = shownText(root);

  const btns = Array.from(root.querySelectorAll('button, [role="button"], input[type="submit"], a.btn, .btn'))
    .filter((el) => !el.disabled && visible(el, doc));
  const links = Array.from(root.querySelectorAll('a[href]')).filter((el) => visible(el, doc));
  const fields = Array.from(root.querySelectorAll('input, select, textarea'))
    .filter((el) => el.type !== 'hidden' && !el.disabled && visible(el, doc));

  const btnName = (el) => (shownText(el) || el.getAttribute('aria-label') || '').trim();
  const 강조 = btns.filter((el) => 강조패턴.test(String(el.className || '')));
  const 무색버튼 = btns.filter((el) => {
    const n = btnName(el).replace(/\s+/g, '');
    return n && 무색.some((w) => n === w || n === w + '하기');
  });

  const 제목 = Array.from(root.querySelectorAll('h1, h2, .sec-title, .tab-title, .card-title'))
    .filter((el) => visible(el, doc) && shownText(el).trim())[0];

  return {
    글자수: txt.length,
    제목: 제목 ? shownText(제목).slice(0, 40) : '',
    버튼: btns.length, 링크: links.length, 입력칸: fields.length,
    필수칸: fields.filter((el) => el.hasAttribute('required')).length,
    강조버튼: 강조.map(btnName).filter(Boolean),
    무색버튼: [...new Set(무색버튼.map(btnName))],
    기술용어: 기술용어(txt),
    조작수: btns.length + links.length + fields.length,
  };
}

/* ⑥ 비어 있을 때 다음 행동을 말하는가 — 「없습니다」로 끝나면 막다른 길이다.
 ⚠ **「없다」가 다 빈 상태는 아니다.** 처음엔 「‘금액 확인일’은 비워 둘 수 없습니다」·
   「비활성화된 계정은 로그인할 수 없습니다」 같은 **안내문 3건**을 막다른 길로 세었다.
   그건 규칙을 설명하는 문장이지 빈 목록이 아니다 — 없는 것을 세면 진짜가 묻힌다
   (`audit_rates`의 「확인 대상은 오류가 아니다」와 같은 교훈). */
const 행동어 = /(주세요|하세요|하시면|누르|눌러|등록|추가|만들|보내|문의|시작|불러|올려|골라|선택|넣어)/;
const 규칙문장 = /(수 없습니다|수 없어요|수 없음|필요 없습니다)/;
function 빈상태(doc, scope) {
  const root = scope || doc.body;
  const out = [];
  Array.from(root.querySelectorAll('*')).forEach((el) => {
    if (el.children.length) return;
    if (!visible(el, doc)) return;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 80) return;
    /* 🔴 **「없음」이 들어갔다고 다 빈 상태가 아니다.** 처음엔 선택지(「워크숍·팀빌딩
       중심 (공식 방문 없음)」)·표 값(「날짜 없음」)·상태 설명(「답변을 보냈고 더 할 일이
       없음」)까지 세어 23건이 나왔다. 그중 진짜는 절반도 안 됐다.
       → **문장 끝이 「없습니다」인 것**만 본다. 그게 목록이 비었다고 말하는 자리다. */
    if (!/없습니다\.?$/.test(t)) return;
    if (규칙문장.test(t)) return;   /* 「~할 수 없습니다」는 규칙 설명이지 빈 목록이 아니다 */
    if (el.closest('option, label, th, td, legend, .hint, .fld-hint')) return;
    out.push({ text: t, 행동있음: 행동어.test(t) || 행동어.test(shownText(el.parentElement || el)) });
  });
  return out;
}

async function auditScreen(file, opts = {}) {
  const B = bootPage(file, { fixtures: opts.fixtures, query: opts.query });
  await B.ready;
  await B.tick(opts.settle || 300);
  if (opts.after) await opts.after(B);
  /* ⚠ **열자마자 난 오류와 훑는 중에 난 오류를 갈라서 남긴다.** 합쳐 두었더니
     탭을 누르다 난 것을 「열자마자」라고 적었다 — 어디를 봐야 하는지가 달라진다. */
  const loadErrors = B.log.errors.slice();
  const doc = B.doc;
  const parts = [];
  if (opts.sections) {
    for (const sec of await opts.sections(B)) {
      if (sec.enter) { try { await sec.enter(B); } catch (e) { /* 못 열면 다음 칸 */ } await B.tick(180); }
      parts.push({ name: sec.name, m: measure(doc, sec.scope ? sec.scope(doc) : null), empty: 빈상태(doc, sec.scope ? sec.scope(doc) : null) });
    }
  } else {
    parts.push({ name: '', m: measure(doc), empty: 빈상태(doc) });
  }
  const nameless = namelessControls(doc);
  const walkErrors = B.log.errors.slice(loadErrors.length);
  B.win.close();
  return { file, parts, nameless, loadErrors, walkErrors };
}

module.exports = { auditScreen, measure, 빈상태, 기술용어 };

/* ─────────────────────────────────────────────────────────────────────── */
if (require.main === module) (async () => {
  const 고객화면 = ['index.html', 'packages.html', 'estimate-view.html', '404.html'];
  const 담당자화면 = ['admin.html', 'admin-quote.html', 'manual.html'];
  const 전부 = ONLY ? [ONLY] : [...고객화면, ...담당자화면];

  let 기술용어총 = 0, 무색총 = 0, 막다른길 = 0, 이름없음 = 0, 강조둘이상 = 0;

  for (const file of 전부) {
    const isAdmin = file === 'admin.html';
    const opts = {};
    if (isAdmin) {
      opts.fixtures = adminFixtures('empty');
      opts.after = async (B) => { await enterDashboard(B); };
      opts.sections = async (B) => Array.from(B.doc.querySelectorAll('[data-tab]'))
        .map((el) => el.getAttribute('data-tab'))
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .map((tab) => ({
          name: tab,
          enter: async (BB) => {
            const btn = BB.doc.querySelector('[data-tab="' + tab + '"]');
            if (btn) btn.dispatchEvent(new BB.win.MouseEvent('click', { bubbles: true, cancelable: true, view: BB.win }));
          },
          scope: (d) => d.getElementById('tab-' + tab) || d.body,
        }));
    }
    const r = await auditScreen(file, opts);

    console.log('\n' + '═'.repeat(74));
    console.log('■ ' + file + (r.parts.length > 1 ? ' — 칸 ' + r.parts.length + '개' : ''));
    console.log('═'.repeat(74));
    if (r.loadErrors.length) console.log('🔴 열자마자 나는 오류 ' + r.loadErrors.length + '건: ' + r.loadErrors[0].msg);
    if (r.walkErrors.length) console.log('🔴 칸을 여는 동안 나는 오류 ' + r.walkErrors.length + '건: ' + r.walkErrors[0].msg);

    r.parts.forEach((p) => {
      const m = p.m;
      const 막 = p.empty.filter((e) => !e.행동있음);
      기술용어총 += m.기술용어.length;
      무색총 += m.무색버튼.length;
      막다른길 += 막.length;
      if (m.강조버튼.length > 1) 강조둘이상++;

      const head = p.name ? ('  · ' + p.name.padEnd(13)) : '  ·' + ' '.repeat(14);
      const 문제 = [];
      if (!m.제목) 문제.push('제목없음');
      if (m.강조버튼.length > 1) 문제.push('강조 ' + m.강조버튼.length);
      if (m.무색버튼.length) 문제.push('무색 ' + m.무색버튼.length);
      if (m.기술용어.length) 문제.push('🔴영문 ' + m.기술용어.length);
      if (막.length) 문제.push('막다른길 ' + 막.length);
      console.log(head + ' 조작 ' + String(m.조작수).padStart(3)
        + ' (버튼 ' + String(m.버튼).padStart(3) + ' · 칸 ' + String(m.입력칸).padStart(2)
        + (m.필수칸 ? '/필수' + m.필수칸 : '') + ')'
        + '  ' + (문제.length ? '⚠ ' + 문제.join(' · ') : '✓'));
      if (VERBOSE || m.기술용어.length) {
        if (m.기술용어.length) console.log('       🔴 화면에 보이는 영문·기술 용어: ' + m.기술용어.slice(0, 8).join(', '));
      }
      if (VERBOSE && m.무색버튼.length) console.log('       무슨 일이 날지 안 말하는 버튼: ' + m.무색버튼.join(', '));
      if (VERBOSE && 막.length) 막.slice(0, 3).forEach((e) => console.log('       막다른 안내: ' + e.text));
    });

    const nm = r.nameless;
    const nmTotal = nm.inputs.length + nm.buttons.length + nm.images.length + nm.links.length;
    이름없음 += nmTotal;
    if (nmTotal) {
      console.log('  ⚠ 낭독기가 읽을 이름이 없는 것 ' + nmTotal + '개'
        + ' (칸 ' + nm.inputs.length + ' · 버튼 ' + nm.buttons.length
        + ' · 사진 ' + nm.images.length + ' · 링크 ' + nm.links.length + ')');
      if (VERBOSE) {
        if (nm.inputs.length) console.log('       칸: ' + nm.inputs.slice(0, 10).join(', '));
        if (nm.buttons.length) console.log('       버튼: ' + nm.buttons.slice(0, 10).join(', '));
      }
    }
  }

  console.log('\n' + '─'.repeat(74));
  console.log('합계 · 🔴화면에 보이는 영문 ' + 기술용어총
    + ' · 무슨 일이 날지 안 말하는 버튼 ' + 무색총
    + ' · 막다른 안내 ' + 막다른길
    + ' · 낭독기 이름 없음 ' + 이름없음
    + ' · 강조 버튼이 둘 이상인 칸 ' + 강조둘이상);
  console.log('⚠ 전부 **확인 대상**이다 — 오류가 아니다. 사람이 보고 정한다.');
})();

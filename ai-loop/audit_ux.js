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

/* 보이는가 — 화면마다 감추는 방식이 다르다.
 🔴 **jsdom은 스타일시트를 계산하지 않는다.** 그래서 `.tab-panel { display:none }`처럼
   **CSS 규칙으로** 감춘 것은 여기서 보이는 것처럼 읽힌다 — 실제로 관리자 화면의
   `<h1>`이 「17개 보인다」로 나왔다(한 번에 하나만 보이는데도).
   그 규칙들을 여기 적어 둔다. 새 화면에 같은 방식이 생기면 여기 한 줄 늘린다.
 ⚠ 이건 **완전하지 않다.** 진짜 보이는지는 브라우저로만 알 수 있다
   (`check_quote_form_layout.py`가 그 일을 한다). */
const CSS로감춘것 = [
  { sel: '.tab-panel', 보일때: 'active' },          /* 관리자 탭 */
  { sel: '.estimate-step', 보일때: 'step-active' },  /* 고객 견적 단계 */
];
function visible(el, doc) {
  let n = el;
  while (n && n !== doc.body) {
    if (n.classList && n.classList.contains('hidden')) return false;
    const st = (n.getAttribute && n.getAttribute('style')) || '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(st)) return false;
    if (n.hasAttribute && n.hasAttribute('hidden')) return false;
    for (const r of CSS로감춘것) {
      if (n.matches && n.matches(r.sel) && !n.classList.contains(r.보일때)) return false;
    }
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
  /* ⚠ `<code>`·`<pre>` 안은 **일부러 보여주는 명령어**다(매뉴얼의
     「실행은 개발 담당이 합니다 — `node ai-loop/import_packages.js`」).
     그걸 「고객 눈에 영문이 보인다」로 세면 고칠 것이 없는 항목이 목록에 남는다. */
  const 글자용 = root.cloneNode(true);
  if (글자용.querySelectorAll) 글자용.querySelectorAll('code, pre, kbd, samp').forEach((n) => n.remove());
  const txt = shownText(글자용);

  const btns = Array.from(root.querySelectorAll('button, [role="button"], input[type="submit"], a.btn, .btn'))
    .filter((el) => !el.disabled && visible(el, doc));
  const links = Array.from(root.querySelectorAll('a[href]')).filter((el) => visible(el, doc));
  const fields = Array.from(root.querySelectorAll('input, select, textarea'))
    .filter((el) => el.type !== 'hidden' && !el.disabled && visible(el, doc));

  const btnName = (el) => (shownText(el) || el.getAttribute('aria-label') || '').trim();
  /* 🔴 **강조 버튼은 「한 자리에」 둘 이상일 때만 문제다** (XT).
     처음엔 화면 전체로 세어 고객 첫 화면을 「강조 4개」로 잡았는데, 그 넷은
     ①견적 1단계 ②견적 2단계 ③포트폴리오 ④문의 — **서로 다른 구역**이라 동시에
     보이지 않는다(1·2단계는 아예 배타적이다). jsdom에는 레이아웃이 없어 「같이
     보이는가」를 못 재므로, **구역으로 나눠** 센다. 그게 잴 수 있는 진짜 질문이다. */
  const 구역 = (el) => el.closest('.setting-section, .estimate-step, .card, section, form, .tab-panel') || root;
  /* ⚠ **고르는 쌍(세그먼트)의 「골라진 쪽」은 경쟁하는 행동이 아니다.** 「📄 PDF에서
     읽기 / ✏️ 직접 입력」처럼 하나만 강조되는 짝은 상태 표시지 행동이 아니다 —
     `aria-pressed`나 `role="group"`으로 그 사실이 표시돼 있으면 세지 않는다. */
  const 고르는쌍 = (el) => el.hasAttribute('aria-pressed')
    || !!(el.parentElement && el.parentElement.getAttribute('role') === 'group');
  const 강조전부 = btns.filter((el) => 강조패턴.test(String(el.className || '')) && !고르는쌍(el));
  const 구역별 = new Map();
  강조전부.forEach((el) => {
    const k = 구역(el);
    if (!구역별.has(k)) 구역별.set(k, []);
    구역별.get(k).push(el);
  });
  const 강조 = [...구역별.values()].filter((g) => g.length > 1).flat();
  const 무색버튼 = btns.filter((el) => {
    /* ⚠ **거르개(칩)는 행동 버튼이 아니다.** 문의 탭의 「전체·미확인·확인·처리중·완료」를
       「무슨 일이 날지 안 말하는 버튼」으로 셌는데, 그건 **상태 이름 그 자체**라
       맥락에서 분명하다. 없는 것을 세면 진짜가 묻힌다. */
    if (el.closest('[data-filter], .filter-btn, .chip, .tab-btn, [role="tab"]')) return false;
    if (el.hasAttribute('data-filter')) return false;
    const n = btnName(el).replace(/\s+/g, '');
    return n && 무색.some((w) => n === w || n === w + '하기');
  });

  /* 🔴 **카드 제목은 화면 제목이 아니다** (XT). 처음엔 `.card-title`까지 제목으로 세어
     「제목이 있다」고 읽었는데, 정작 17개 탭 어디에도 **화면이 무엇인지 말하는 줄**이
     없었다. 자가 느슨하면 고칠 것을 못 찾는다. */
  const 제목 = Array.from(root.querySelectorAll('h1, .page-title'))
    .filter((el) => visible(el, doc) && shownText(el).trim())[0];
  const 설명 = Array.from(root.querySelectorAll('.page-sub'))
    .filter((el) => visible(el, doc) && shownText(el).trim())[0];

  return {
    글자수: txt.length,
    제목: 제목 ? shownText(제목).slice(0, 40) : '',
    /* 🔴 **낭독기는 제목으로 화면을 건너뛴다.** `<h1>`이 하나도 없으면 그 길이 막힌다
       — `admin-quote.html`이 그랬다(제목이 `<span>`이었다). 보이는 것만 센다. */
    h1수: Array.from(doc.querySelectorAll('h1')).filter((el) => visible(el, doc)).length,
    설명: 설명 ? shownText(설명).slice(0, 60) : '',
    버튼: btns.length, 링크: links.length, 입력칸: fields.length,
    필수칸: fields.filter((el) => el.hasAttribute('required')).length,
    강조버튼: 강조.map(btnName).filter(Boolean),
    /* 🔴 **같은 이름의 버튼이 무더기로 있으면 구별이 안 된다** (XT).
       콘텐츠 관리 탭에 「저장」 버튼이 **110개** 있는데 이름이 전부 같다 — 낭독기에는
       「저장, 저장, 저장…」으로만 들리고, 어느 것을 저장하는지 알 방법이 없다.
       표 안의 「편집」×60도 마찬가지다(눈으로는 줄이 말해 주지만 귀로는 아니다).
     ⚠ 이건 지금까지 **안 재고 있던 것**이다. 「이름이 없는 칸」은 셌는데
       「이름이 같은 버튼」은 안 셌다 — 사람이 겪는 어려움은 같다. */
    같은이름버튼: (() => {
      const c = new Map();
      btns.forEach((el) => {
        const n = btnName(el).replace(/\s+/g, ' ').trim();
        /* 낭독기가 읽는 이름으로 센다 — `aria-label`이 다르면 다른 버튼이다 */
        const spoken = (el.getAttribute('aria-label') || n).trim();
        if (!spoken) return;
        c.set(spoken, (c.get(spoken) || 0) + 1);
      });
      return [...c.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
    })(),
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
/* ⚠ **명사를 행동어로 넣지 말 것.** 처음엔 「문의」·「선택」을 넣었더니
   「**문의** 내역이 없습니다」가 「행동을 말한다」로 통과했다 — 대시보드 첫 화면의
   막다른 안내를 자가 스스로 가려 준 셈이다. 동사꼴만 센다. */
const 행동어 = /(주세요|하세요|하시면|누르|눌러|등록하|추가하|만들|보내시|문의하|문의해|시작하|불러|올리|올려|고르|골라|선택하|선택해|넣어|입력하)/;
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
    /* ⚠ **문장 속 강조 조각**은 빈 상태가 아니다 — 매뉴얼의 「…있지만 <strong>일정과
       출발일이 없습니다.</strong> 홈페이지에서…」가 그렇게 걸렸다. 부모 문장이 훨씬
       길면 그건 설명문의 한 조각이다. */
    const parentText = ((el.parentElement && el.parentElement.textContent) || '').replace(/\s+/g, ' ').trim();
    if (parentText.length > t.length * 2 + 20) return;
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

  let 기술용어총 = 0, 무색총 = 0, 막다른길 = 0, 이름없음 = 0, 강조둘이상 = 0, 같은이름총 = 0;

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
      같은이름총 += m.같은이름버튼.reduce((t, [, c]) => t + c, 0);

      const head = p.name ? ('  · ' + p.name.padEnd(13)) : '  ·' + ' '.repeat(14);
      const 문제 = [];
      if (!m.제목) 문제.push('제목없음');
      if (m.h1수 === 0) 문제.push('🔴h1없음');
      else if (m.h1수 > 1) 문제.push('h1 ' + m.h1수 + '개');
      else if (!m.설명) 문제.push('설명없음');
      if (m.강조버튼.length > 1) 문제.push('강조 ' + m.강조버튼.length);
      if (m.무색버튼.length) 문제.push('무색 ' + m.무색버튼.length);
      if (m.기술용어.length) 문제.push('🔴영문 ' + m.기술용어.length);
      if (m.같은이름버튼.length) 문제.push('🔴같은이름 ' + m.같은이름버튼.map(([n, c]) => n + '×' + c).join(', '));
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
    + ' · 강조 버튼이 둘 이상인 칸 ' + 강조둘이상
    + ' · 🔴이름이 똑같은 버튼 ' + 같은이름총);
  console.log('⚠ 전부 **확인 대상**이다 — 오류가 아니다. 사람이 보고 정한다.');
})();

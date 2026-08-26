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
const { bootPage, visibleText, ROOT } = require('./_page_boot');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONLY = (() => { const i = args.indexOf('--page'); return i >= 0 ? args[i + 1] : null; })();

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/* 고객이 실제로 누를 수 있는 것 — 감춘 것은 뺀다(감춘 것을 누를 수는 없다) */
function clickables(doc) {
  const sel = 'button, a[href], [onclick], input[type="submit"], [role="button"], .pk-chip, .faq-q, .gal-filter-chip';
  return Array.from(doc.querySelectorAll(sel)).filter((el) => {
    if (el.disabled) return false;
    let n = el;
    while (n && n !== doc.body) {
      if (n.classList && n.classList.contains('hidden')) return false;
      const st = n.style || {};
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return true;
  });
}

const label = (el) => {
  const t = visibleText(el).slice(0, 34);
  const id = el.id ? '#' + el.id : '';
  const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : '';
  return (t || el.getAttribute('aria-label') || el.getAttribute('href') || '(글자 없음)') + ' ' + (id || cls);
};

function deadLinks(doc) {
  const out = [];
  Array.from(doc.querySelectorAll('a[href]')).forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (/^(https?:|mailto:|tel:|javascript:)/i.test(href) || href === '#' || href === '') return;
    if (href.startsWith('#')) {
      if (!doc.querySelector('[id="' + href.slice(1) + '"], [name="' + href.slice(1) + '"]')) {
        out.push({ href, label: label(a), why: '앵커가 없다' });
      }
      return;
    }
    const file = href.split('#')[0].split('?')[0];
    if (!file) return;
    if (!fs.existsSync(path.join(ROOT, file))) out.push({ href, label: label(a), why: '파일이 없다' });
  });
  return out;
}

async function auditPage(file) {
  const B = bootPage(file);
  const { win, doc, log, tick } = B;
  await B.ready;
  await tick(250);

  const loadErrors = log.errors.slice();
  const dead = deadLinks(doc);
  const list = clickables(doc);

  doc.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a) { log.navs.push(a.getAttribute('href')); e.preventDefault(); }
  }, true);

  const results = [];
  for (const el of list) {
    const before = { html: hash(doc.body.innerHTML), text: hash(visibleText(doc.body)), req: log.requests.length, print: log.printed, down: log.downloads.length };
    const errBefore = log.errors.length, sayBefore = log.says.length, navBefore = log.navs.length;
    let threw = '';
    try {
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
    } catch (e) { threw = String(e.message || e); }
    await tick(30);
    const after = { html: hash(doc.body.innerHTML), text: hash(visibleText(doc.body)), req: log.requests.length, print: log.printed, down: log.downloads.length };
    results.push({
      label: label(el),
      threw,
      errors: log.errors.slice(errBefore).map((e) => e.msg),
      says: log.says.slice(sayBefore),
      navs: log.navs.slice(navBefore),
      changed: before.html !== after.html || before.text !== after.text,
      fetched: after.req > before.req,
      acted: after.print > before.print || after.down > before.down,
    });
  }
  return { file, loadErrors, dead, results, log };
}

(async () => {
  const PAGES = ONLY ? [ONLY] : ['index.html', 'packages.html', 'estimate-view.html'];
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

    const silent = r.results.filter((x) => !x.threw && !x.errors.length && !x.changed
      && !x.fetched && !x.says.length && !x.navs.length && !x.acted);
    quiet += silent.length;
    console.log('\n⚠ 눌러도 아무 일도 안 나는 것 ' + silent.length + '개 (확인 대상 — 결함이 아닐 수 있다)');
    if (VERBOSE || silent.length <= 6) silent.forEach((x) => console.log('   · ' + x.label));

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

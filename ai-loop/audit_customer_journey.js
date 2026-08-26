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

/* 눈으로 보지 않는 고객도 있다 — **이름 없는 조작 장치**를 센다 (XP 후속).
   화면 낭독기는 글자를 읽는다. 아이콘만 든 버튼, 라벨 없는 입력칸, alt 없는 사진은
   그 사람에게 「버튼」·「편집」·「이미지」로만 들린다 — 그게 곧 못 쓰는 화면이다.
 ⚠ 여기서도 판정하지 않고 **센다.** 장식용 사진의 `alt=""`는 정상이고(일부러 비운다),
   `aria-hidden` 아이콘도 정상이다. 그런 것은 빼고 센다. */
function namelessControls(doc) {
  const out = { inputs: [], buttons: [], images: [], links: [] };
  const txt = (el) => (visibleText(el) || '').trim();
  const labelled = (el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    if (el.id && doc.querySelector('label[for="' + el.id + '"]')) return true;
    if (el.closest('label')) return true;
    return false;
  };
  Array.from(doc.querySelectorAll('input, select, textarea')).forEach((el) => {
    if (el.type === 'hidden' || el.disabled) return;
    /* ⚠ 화면에서 감춘 칸(엔진이 값만 읽는 라디오 등)은 낭독기도 안 읽는다 — 세지 않는다.
       세면 **고칠 것이 없는 항목**이 목록에 남고, 그러면 목록 전체를 안 보게 된다. */
    if (el.getAttribute('aria-hidden') === 'true') return;
    if ((el.getAttribute('style') || '').replace(/\s/g, '').includes('display:none')) return;
    if (!labelled(el)) out.inputs.push(el.id || el.name || el.type);
  });
  Array.from(doc.querySelectorAll('button, [role="button"]')).forEach((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return;
    if (!txt(el) && !labelled(el)) out.buttons.push(el.id || el.className || '(이름 없음)');
  });
  Array.from(doc.querySelectorAll('img')).forEach((el) => {
    if (el.getAttribute('alt') === null) out.images.push(el.getAttribute('src') || '(src 없음)');
  });
  Array.from(doc.querySelectorAll('a[href]')).forEach((el) => {
    if (!txt(el) && !labelled(el)) out.links.push(el.getAttribute('href'));
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
  return { file, loadErrors, dead, results, log, nameless: namelessControls(doc) };
}

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

    const silent = r.results.filter((x) => !x.threw && !x.errors.length && !x.changed
      && !x.fetched && !x.says.length && !x.navs.length && !x.acted);
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

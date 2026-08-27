/* ═══════════════════════════════════════════════════════════════════════════
   화면을 **눌러 보는 자** — 단일 출처 (XT)
   ───────────────────────────────────────────────────────────────────────────
   `audit_customer_journey.js`(고객 화면)와 `audit_admin_journey.js`(담당자 화면)가
   **같은 자**를 쓴다. 훑는 규칙이 도구마다 한 벌씩 생기면 그 도구만 조용히 다른 것을
   재게 된다(결함 생성기 ①) — 「터졌다」·「죽은 링크」·「아무 일도 안 났다」의 뜻이
   두 화면에서 달라지면 두 결과를 나란히 놓고 볼 수 없다.

   ⚠ 이 파일의 함수들은 `audit_customer_journey.js`에서 **글자 그대로** 옮겨 온 것이다.
     옮긴 뒤 출력이 한 글자도 안 바뀌는 것을 diff로 확인했다.

   🔴 이 도구가 스스로 만들었던 가짜 결함 넷 — 규칙이 여기 들어 있다:
     ① 바깥 자원을 진짜로 받아 오면 죽는다 → `_page_boot`이 우리 파일만 준다
     ② 링크를 누르면 jsdom이 「navigation not implemented」 → 이동을 막고 주소만 적는다
     ③ 바뀜을 **글자 수**로 재면 탭·아코디언이 같은 길이라 「죽은 버튼」이 된다 → 해시로 본다
     ④ `document.write`로 들어온 `<script>`는 jsdom이 실행하지 않는다 → `_page_boot`이 대신 돌린다

   ■ 화면이 여러 칸으로 나뉘어 있으면(관리자 탭 17개) `sections`로 준다.
     한 칸씩 열고, 그 칸에서 **그때 눌러 볼 수 있는 것**을 다시 센다 —
     감춰진 탭의 버튼은 고객도 담당자도 누를 수 없기 때문이다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText, ROOT } = require('./_page_boot');

/* 🔴 **감춰진 패널의 글자까지 읽으면 안 된다** (XS).
   `_page_boot`의 `visibleText`는 `script`·`style`만 걷어낸다 — 그건 「소스가 글자로
   섞이는 것」을 막으려고 만든 것이고, 화면에서 **감춰진 요소**는 그대로 남는다.
   실제로 인쇄용 문서에서 「링크 공유」와 「담당자 확인이 필요한 견적입니다」가 **동시에**
   읽혔다. 둘은 서로 배타적인 상태라 하나는 반드시 감춰져 있다.
   → 그 상태로 「유효기간 문구가 있다」를 재면 **감춰진 안내를 보고 통과**할 수 있다.
     안 보이는 글자로 통과하는 검사는 아무것도 안 지킨다(결함 생성기 ③).

 🔴 **감추는 방식이 화면마다 다르다.** 고객 화면(index.html)은 `.hidden` 클래스를 쓰고,
   인쇄용 팝업은 **인라인 `style="display:none"`**을 쓴다(그 문서는 통째로 템플릿
   문자열이라 클래스를 쓸 자리가 없다). 한쪽만 걷어내면 팝업에서는 **한 글자도 안 줄어든다** —
   실제로 3,059자 → 3,059자였다. 두 방식을 다 본다.
 ⚠ 공용 `visibleText`를 고치지 않는다 — 다른 도구 여럿이 지금 동작에 기대고 있다.
   여기서만 더 좁게 본다.
 ⚠ `.no-print`는 **감춘 것이 아니다**(인쇄할 때만 빠진다). 걷어내면 화면에 멀쩡히
   보이는 버튼이 「없는 것」이 된다. */
function shownText(el) {
  if (!el) return '';
  const c = el.cloneNode(true);
  if (!c.querySelectorAll) return (c.textContent || '').replace(/\s+/g, ' ').trim();
  c.querySelectorAll('script,style,template,[hidden],[aria-hidden="true"],.hidden').forEach((n) => n.remove());
  /* 인라인으로 감춘 것 — 팝업 문서가 쓰는 방식이다 */
  c.querySelectorAll('[style]').forEach((n) => {
    const st = String(n.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
    if (/display:none|visibility:hidden/.test(st)) n.remove();
  });
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/* 고객이 실제로 누를 수 있는 것 — 감춘 것은 뺀다(감춘 것을 누를 수는 없다) */
function clickables(root) {
  const doc = root.ownerDocument || root;
  const sel = 'button, a[href], [onclick], input[type="submit"], [role="button"], .pk-chip, .faq-q, .gal-filter-chip';
  return Array.from(root.querySelectorAll(sel)).filter((el) => {
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

/* 한 화면을 열어 **누를 수 있는 것을 전부 눌러 본다.**
   opts.fixtures — 서버가 줄 답(관리자 화면은 로그인부터 통과해야 한다)
   opts.after    — 열린 뒤 한 번 할 일(로그인 화면을 지나 대시보드로 들어가기 등)
   opts.sections — 화면이 여러 칸이면(관리자 탭 17개) 칸 목록. 없으면 화면 하나로 본다
   opts.skip     — 누르면 안 되는 것(로그아웃처럼 나머지를 못 보게 만드는 것)
   opts.settle   — 화면이 자리잡기를 기다리는 시간 */
async function auditPage(file, opts = {}) {
  const B = bootPage(file, { fixtures: opts.fixtures, query: opts.query });
  const { win, doc, log, tick } = B;
  await B.ready;
  const settle = opts.settle || 250;
  await tick(settle);
  if (opts.after) await opts.after(B);

  const loadErrors = log.errors.slice();
  const dead = deadLinks(doc);

  doc.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a) { log.navs.push(a.getAttribute('href')); e.preventDefault(); }
  }, true);

  const sections = opts.sections ? await opts.sections(B) : [{ name: '' }];
  const results = [];
  for (const sec of sections) {
    if (sec.enter) {
      try { await sec.enter(B); } catch (e) { results.push({ section: sec.name, label: '(칸 열기)', threw: String(e.message || e), errors: [], says: [], navs: [] }); continue; }
      await tick(settle);
    }
    /* 🔴 **그 칸이 열린 뒤에, 그 칸 안에서만 다시 센다.**
       처음엔 문서 전체에서 셌더니 **같은 버튼을 탭 17번씩** 눌렀다 —
       눌러 본 것 1,361개·사라짐 1,760개라는 말이 안 되는 숫자가 나왔고,
       「[dashboard] CSV 내보내기」와 「[inquiries] CSV 내보내기」가 같은 버튼이었다.
       감춘 탭의 버튼은 아무도 못 누른다. `scope`를 주면 그 안만 본다. */
    const 범위 = sec.scope ? (sec.scope(doc) || doc.body) : doc.body;
    const list = clickables(범위);
    for (const el of list) {
      /* 앞의 버튼이 화면을 다시 그려 이 버튼이 사라졌을 수 있다. 그건 결함이 아니다.
       ⚠ **기본은 끈다.** 켜면 고객 화면의 기존 숫자가 바뀐다 — 사라진 버튼의 처리기가
         그래도 돌면서 화면을 바꾸던 것이 있고(`.pk-cta`가 모달을 열었다), 건너뛰면
         그 뒤 버튼(`.pk-modal-close`)이 닫을 것이 없어져 「조용함」으로 넘어간다.
         옮기기는 **동작이 안 바뀌어야** 하므로, 이건 부르는 쪽이 켠다. */
      if (opts.skipDetached && !doc.contains(el)) { results.push({ section: sec.name, label: label(el), gone: true, errors: [], says: [], navs: [] }); continue; }
      if (opts.skip && opts.skip(el)) { results.push({ section: sec.name, label: label(el), skipped: true, errors: [], says: [], navs: [] }); continue; }
      /* 🔴 **앞 버튼이 남긴 안내를 지우고 잰다** (XT).
         「일정 저장」과 「방식 A·B 저장」을 잇달아 누르면 둘 다 「목적지를 먼저
         고르세요」를 띄우는데, 글자가 **똑같아서** 두 번째는 「아무것도 안 바뀌었다」로
         세어졌다. 실제로는 말을 하고 있었다 — 그대로 두면 **없는 결함 11개**가 된다.
       ⚠ 부르는 쪽이 안내 자리를 알려 줄 때만 지운다(`messageSelector`). 모르면 안 지운다 —
         아무 요소나 지우면 화면을 망가뜨리고 그게 또 없는 결함이 된다. */
      const msgEls = opts.messageSelector
        ? Array.from(범위.querySelectorAll(opts.messageSelector)) : [];
      msgEls.forEach((m) => { m.dataset.probeSaved = m.textContent; m.textContent = ''; });
      const before = { html: hash(doc.body.innerHTML), text: hash(visibleText(doc.body)), req: log.requests.length, print: log.printed, down: log.downloads.length };
      const errBefore = log.errors.length, sayBefore = log.says.length, navBefore = log.navs.length;
      let threw = '';
      try {
        el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
      } catch (e) { threw = String(e.message || e); }
      await tick(30);
      const after = { html: hash(doc.body.innerHTML), text: hash(visibleText(doc.body)), req: log.requests.length, print: log.printed, down: log.downloads.length };
      const 말했다 = msgEls.some((m) => String(m.textContent || '').trim().length > 0);
      results.push({
        messaged: 말했다,
        section: sec.name,
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
    if (sec.leave) { try { await sec.leave(B); } catch (e) { /* 돌아가지 못해도 다음 칸을 연다 */ } }
  }
  return { file, loadErrors, dead, results, log, nameless: namelessControls(doc), B };
}

module.exports = { hash, clickables, label, deadLinks, namelessControls, auditPage, shownText, visibleText, ROOT };

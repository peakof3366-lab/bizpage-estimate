/* ═══════════════════════════════════════════════════════════════════════════
   홈페이지 전체 훑기 (WM) — **읽기 전용**. `node ai-loop/audit_site.js [--prod]`

   ■ 왜 필요한가 (2026-08-26 대표 지시: 「홈페이지 전체 오류검토도 진행 부탁」)

   이 저장소의 검사는 **견적 계산**을 아주 촘촘히 본다. 그런데 「고객이 화면을 열었을 때
   실제로 보이는가」를 보는 것이 하나도 없었다. 실제로 이 도구가 처음 돌자마자,
   **홈 화면의 고객사 로고 2건이 브라우저에 아예 안 뜨고 있던 것**을 찾았다 —
   `http://`로 실려 있어서 https 페이지에서 **혼합 콘텐츠로 차단**된 것이다.
   `onerror`가 자리를 접어 주기 때문에 **화면이 깨져 보이지도 않는다.** 그래서
   아무도 못 알아챈다 — 조용한 폴백(결함 생성기 ②)이 화면에서 재현된 자리다.

   ■ 무엇을 보는가

   ① 🔴 혼합 콘텐츠 — https 페이지에 `http://` 자원. **이미지·스크립트·스타일은 차단된다.**
      ⚠ `xmlns="http://www.w3.org/2000/svg"`는 **자원이 아니다.** 이걸 고치면 SVG가 깨진다.
        (없는 결함을 만들지 않는 것이 이 저장소의 반복된 교훈이다.)
   ② 로컬 참조가 **실제로 있는 파일**인가 — 오타 하나면 화면이 조용히 기능을 잃는다.
   ③ 내부 링크가 **있는 페이지**를 가리키는가.
   ④ 🔴 그 로컬 파일이 **배포에서 빠지지 않는가**(`.vercelignore`). 지금은 「빼지 않도록
      주의」라는 주석만 있고 대조하는 것이 없었다.
   ⑤ 페이지가 jsdom에서 **죽지 않고 뜨는가** — 첫 줄에서 죽으면 화면 전체가 백지다.
   ⑥ `--prod`: 프로덕션에서 페이지·로컬 자산이 실제로 200으로 열리는가.

   ⚠ **바깥 링크(blog.naver.com 등)는 두드리지 않는다.** 남의 서버를 우리 검사가
     주기적으로 때릴 이유가 없고, 502 한 번에 빨간 줄이 뜨면 사람이 검사를 안 믿게 된다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROD = 'https://bizpage-estimate.vercel.app';
const WANT_PROD = process.argv.includes('--prod');

const pages = () => fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();

/* 자원 참조만 뽑는다. **속성 이름을 본다** — `xmlns`·`xlink:href`는 자원이 아니다. */
const REF_RE = /(?:^|\s)(src|href)\s*=\s*"([^"]*)"/gi;
function refsOf(html) {
  const out = [];
  let m;
  while ((m = REF_RE.exec(html)) !== null) {
    const attr = m[1].toLowerCase();
    const val = m[2].trim();
    if (!val) continue;
    /* 템플릿 문자열 안에서 만들어지는 주소는 정적으로 못 판단한다 — 세지 않는다.
       ⚠ 「세지 않는다」와 「없다」는 다르다. 그래서 몇 건을 건너뛰었는지 함께 센다. */
    if (/[${}]|'\s*\+|\+\s*'/.test(val)) { out.push({ attr, val, dynamic: true }); continue; }
    out.push({ attr, val, dynamic: false });
  }
  return out;
}

const isExternal = (v) => /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//');
const isLocal = (v) => !isExternal(v) && !v.startsWith('#') && !v.startsWith('?');

/* .vercelignore를 아주 단순하게 흉내 낸다 — 이 저장소가 실제로 쓰는 모양만 다룬다:
   `*.md` 꼴의 확장자 규칙과 `ai-loop/` 꼴의 폴더 규칙.
   ⚠ 흉내라는 것을 숨기지 않는다. 모르는 모양이 나오면 **모른다고 말한다.** */
function ignoreRules() {
  const p = path.join(ROOT, '.vercelignore');
  if (!fs.existsSync(p)) return { exts: [], dirs: [], unknown: [] };
  const exts = [], dirs = [], unknown = [];
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^\*\.[A-Za-z0-9]+$/.test(line)) exts.push(line.slice(1).toLowerCase());
    else if (/^[^*?]+\/$/.test(line)) dirs.push(line);
    else unknown.push(line);
  }
  return { exts, dirs, unknown };
}
const ignoredBy = (rel, rules) => {
  const low = rel.toLowerCase();
  if (rules.exts.some((e) => low.endsWith(e))) return true;
  return rules.dirs.some((d) => low.startsWith(d.toLowerCase()));
};

/* ── ①~④: 파일을 읽어서 되는 검사 (네트워크 안 탄다) ───────────────────── */
function staticAudit() {
  const errors = [], notes = [];
  const rules = ignoreRules();
  const files = pages();
  let dynamicSkipped = 0;

  for (const page of files) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const r of refsOf(html)) {
      if (r.dynamic) { dynamicSkipped++; continue; }

      /* ① 혼합 콘텐츠 */
      if (/^http:\/\//i.test(r.val)) {
        /* 이미지·스크립트·스타일은 **차단**되고, 링크는 리다이렉트된다 — 갈라서 센다 */
        const blocked = r.attr === 'src' || /\.(css|js|png|jpe?g|gif|webp|svg)(\?|$)/i.test(r.val);
        (blocked ? errors : notes).push({
          page, kind: blocked ? '혼합 콘텐츠(차단됨)' : '혼합 콘텐츠(링크)',
          detail: r.val,
          why: blocked
            ? 'https 페이지라 브라우저가 이 자원을 막습니다 — 화면에 안 나옵니다.'
            : 'https로 리다이렉트되지만, 한 번 더 왕복하고 일부 환경에서 경고가 뜹니다.',
        });
        continue;
      }

      if (!isLocal(r.val)) continue;

      /* ② 로컬 파일이 실제로 있는가 (쿼리·앵커는 떼고 본다) */
      const rel = decodeURIComponent(r.val.split(/[?#]/)[0]);
      if (!rel) continue;
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        errors.push({ page, kind: '없는 파일', detail: r.val, why: '참조한 파일이 저장소에 없습니다.' });
        continue;
      }
      /* ③ 내부 링크가 페이지인가 — 있으면 통과, 위에서 이미 확인했다 */

      /* ④ 🔴 배포에서 빠지지 않는가 */
      if (ignoredBy(rel, rules)) {
        errors.push({
          page, kind: '배포에서 빠짐', detail: r.val,
          why: '.vercelignore가 이 파일을 배포에서 제외합니다 — 로컬에서는 되고 프로덕션에서만 조용히 안 됩니다.',
        });
      }
    }
  }
  if (rules.unknown.length) {
    notes.push({
      page: '.vercelignore', kind: '규칙을 못 읽음', detail: rules.unknown.join(' · '),
      why: '이 도구가 흉내내지 못하는 모양입니다 — 배포 제외 검사가 이 줄들에는 안 걸립니다.',
    });
  }
  return { errors, notes, files, dynamicSkipped };
}

/* ── ⑤: 페이지가 뜨는가 (jsdom) ──────────────────────────────────────────
   ⚠ 바깥 스크립트(unpkg·jsdelivr)는 **일부러 안 받는다.** 남의 CDN이 느리면 우리
     검사가 빨개진다. 그래서 「lucide가 없다」류의 잡음은 여기서 걸러 낸다. */
/* ⚠ `IntersectionObserver`는 **jsdom에 없는 것**이지 우리 결함이 아니다 —
     브라우저에는 다 있다(2019년부터). 이걸 오류로 세면 매번 빨간 줄이 뜨고,
     그러면 사람이 이 도구를 안 보게 된다. */
const NOISE = /lucide|xlsx|Could not load script|Could not load link|Not implemented|fetch is not defined|localStorage is not available|IntersectionObserver|ResizeObserver|matchMedia/i;

async function renderAudit(files) {
  let JSDOM, VirtualConsole, requestInterceptor;
  try { ({ JSDOM, VirtualConsole, requestInterceptor } = require('jsdom')); }
  catch (e) {
    return { skipped: 'jsdom이 없습니다 (NODE_PATH를 확인하세요) — 렌더 검사는 건너뜁니다.', errors: [] };
  }

  /* 🔴 **바깥 자원은 아예 안 받는다.** 「안 받는다」고 주석만 적어 두고 실제로는
     `resources:'usable'`이 전부 받아 오고 있었다 — 지도 iframe이 구글 지도 스크립트를
     끌어왔고, 그 스크립트가 jsdom에 없는 `performance.getEntriesByType`을 부르며
     **검사 도구 자체를 죽였다.** 우리 화면의 결함이 아니라 남의 코드가 우리 검사를
     죽인 것이다. 규칙은 주석이 아니라 코드로 지킨다. */
  const localOnly = {
    interceptors: [requestInterceptor((request) => {
      if (/^file:/i.test(request.url)) return undefined;   /* 우리 파일은 그대로 읽는다 */
      /* 바깥 주소는 **빈 200**으로 돌려준다 — 있고 없고는 정적 검사가 이미 본다 */
      return new Response('', { headers: { 'Content-Type': 'text/plain' } });
    })],
  };
  const errors = [];
  for (const page of files) {
    const found = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { if (!NOISE.test(e.message || '')) found.push(String(e.message).slice(0, 160)); });
    vc.on('error', (...a) => { const s = a.join(' '); if (!NOISE.test(s)) found.push(s.slice(0, 160)); });
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, page), 'utf8'), {
      runScripts: 'dangerously', resources: localOnly, virtualConsole: vc,
      url: 'file:///' + path.join(ROOT, page).replace(/\\/g, '/'),
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
        w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });
    await new Promise((res) => {
      if (dom.window.document.readyState === 'complete') return res();
      dom.window.addEventListener('load', res);
      setTimeout(res, 4000);
    });
    /* 화면이 **비어 있지 않은지**도 본다 — 스크립트가 첫 줄에서 죽으면 백지가 된다 */
    const text = (dom.window.document.body && dom.window.document.body.textContent || '').trim();
    if (text.length < 40) errors.push({ page, kind: '화면이 비었다', detail: text.length + '자', why: '본문이 거의 없습니다.' });
    found.slice(0, 3).forEach((f) => errors.push({ page, kind: '스크립트 오류', detail: f, why: '' }));
    /* ⚠ `window.close()`를 부르지 않는다. 페이지가 걸어 둔 타이머가 그 뒤에 깨어나
       `window.location`을 만지면 **jsdom 안쪽에서 죽는다**(실제로 admin-quote에서
       그렇게 죽었다). 페이지 6개짜리 도구라 그냥 두는 편이 안전하다. */
  }
  return { errors };
}

/* ── ⑥: 프로덕션에서 실제로 열리는가 ─────────────────────────────────── */
function head(url) {
  return new Promise((resolve) => {
    require('https').get(url, { timeout: 20000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', () => resolve(0)).on('timeout', function () { this.destroy(); resolve(0); });
  });
}
async function prodAudit(files) {
  const errors = [];
  const assets = new Set();
  for (const page of files) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    refsOf(html).filter((r) => !r.dynamic && isLocal(r.val))
      .forEach((r) => assets.add(decodeURIComponent(r.val.split(/[?#]/)[0])));
  }
  const targets = [...new Set([...files, ...assets])];
  for (const t of targets) {
    const code = await head(PROD + '/' + encodeURI(t) + '?cb=' + targets.indexOf(t));
    if (code !== 200) errors.push({ page: t, kind: '프로덕션 ' + (code || '못 받음'), detail: PROD + '/' + t, why: '' });
  }
  return { errors, checked: targets.length };
}

/* 🔴 순수 함수를 내보낸다 — **검사가 진짜 코드를 부르게** 하기 위해서다.
   `test_wM_site.js`가 이 함수들을 그대로 불러 회귀를 잡는다. 복사하면 곧 어긋난다.
   ⚠ 그래서 아래 실행부는 **직접 돌렸을 때만** 돈다(`require.main`). 안 그러면
     검사가 `require`하는 순간 도구가 통째로 돌고 `process.exit`까지 부른다. */
module.exports = { staticAudit, refsOf, ignoreRules, ignoredBy, isLocal, isExternal };

if (require.main === module) (async () => {
  console.log('\n══ 홈페이지 훑기 ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' ══');
  const s = staticAudit();
  console.log('페이지 ' + s.files.length + '개: ' + s.files.join(' · '));
  console.log('(주소를 코드로 만드는 참조 ' + s.dynamicSkipped + '건은 정적으로 못 봐서 건너뜀)');

  const r = await renderAudit(s.files);
  const p = WANT_PROD ? await prodAudit(s.files) : null;
  if (!WANT_PROD) console.log('(프로덕션 확인은 --prod 를 붙여야 합니다)');
  if (r.skipped) console.log('⚠ ' + r.skipped);

  const all = [...s.errors, ...r.errors, ...(p ? p.errors : [])];
  console.log('─'.repeat(72));
  if (!all.length) console.log('✅ 오류 없음');
  else {
    console.log('🔴 오류 ' + all.length + '건');
    for (const e of all) {
      console.log('  · [' + e.page + '] ' + e.kind + ' — ' + e.detail);
      if (e.why) console.log('      ' + e.why);
    }
  }
  if (s.notes.length) {
    console.log('─'.repeat(72));
    console.log('참고 ' + s.notes.length + '건 (오류 아님 — 사람이 봐야 판단됨)');
    for (const n of s.notes) console.log('  · [' + n.page + '] ' + n.kind + ' — ' + n.detail);
  }
  if (p) console.log('\n프로덕션에서 확인한 주소 ' + p.checked + '개');
  console.log('');
  process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error('실패: ' + e.message); process.exit(1); });

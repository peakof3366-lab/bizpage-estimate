/* ═══════════════════════════════════════════════════════════════════════════
   고객 화면을 **진짜로 띄우는 자** — 단일 출처 (XK)
   ───────────────────────────────────────────────────────────────────────────
   `_engine_boot.js`가 견적 엔진을 띄우는 단일 출처인 것과 같은 이유로 만든다.
   화면을 띄우는 코드가 도구마다 한 벌씩 생기면, 그 도구만 조용히 다른 것을 재게
   된다(결함 생성기 ①). 특히 아래 넷은 **빠뜨리면 없는 결함이 생기는** 것들이다:

     · **바깥 자원 차단** — 안 막으면 구글 지도 스크립트를 진짜로 받아 와 그 자리에서
       죽는다(실측). 남의 서버 사정에 우리 검사 결과가 좌우되면 안 된다.
     · **localStorage** — `file://`은 opaque origin이라 없다. http 오리진으로 띄운다.
     · **말풍선(alert/confirm)** — jsdom 기본값은 「Not implemented」 예외라, 받아 두지
       않으면 **고객이 읽는 문장이 「터진 버튼」으로 둔갑한다.**
     · **레이아웃 없는 것들**(rAF·scrollIntoView·canvas·IntersectionObserver) — 없으면
       핸들러가 중간에 죽어 「화면 결함」으로 오진된다.

   ⚠ 픽스처는 **서버가 실제로 주는 모양** 그대로여야 한다. 코드를 따라가며 지은
     픽스처는 아무것도 못 잡는다(WR에서 `inclItems` vs `included`로 실제로 당했다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* 🔴 **날짜는 로컬 시각으로 만든다** (XQ). `toISOString()`은 UTC라, 한국 시각 0~9시
   사이에는 **하루 전 날짜**를 내놓는다. 화면은 로컬 시각으로 유효기간을 재므로
   그 시간대에만 검사가 무너진다 — 실제로 2026-08-27 07시에 검사 8건이 빨갛게 떴고,
   화면이 아니라 **검사가 틀린 것**이었다(가장 찾기 어려운 종류다: 낮에는 안 나온다).
 ⚠ `sv-SE` 로캘이 `YYYY-MM-DD`를 그대로 준다(로컬 기준). */
const soon = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv-SE');
};

/* 서버 응답 기본값 — 시나리오마다 `fixtures`로 덮어쓴다 */
const DEFAULT_FIXTURES = {
  rates: { overrides: {}, fxRates: {}, fxBaseline: {}, customDestinations: [], coefficients: {} },
  packages: {
    packages: [{
      id: 'hana-okinawa-1203', title: '오키나와 3박4일', destKey: '오키나와', destLabel: '오키나와',
      pricePerPerson: 1190000, nights: 3, days: 4, departDate: soon(60),
      priceAsOf: soon(-2), validUntil: soon(30),
      itinerary: [{ title: '출발', am: '인천 출발', pm: '호텔 체크인', eve: '자유 일정' }],
      included: ['왕복 항공', '호텔 3박'], excluded: ['개인 경비'],
    }],
  },
  itineraries: { itineraries: [] },
  quotes: { ok: true, id: 'testquote1', verdict: 'verified' },
  inquiries: { ok: true, id: 'testinq1' },
  shares: { ok: true, id: 'testshare1', quoteNo: 'Q-260826-001', verdict: 'verified' },
  shareDoc: null,   /* GET /api/quote-shares/<id> — 견적서 화면이 읽는 payload */
};

const TYPE_OF = (f) => (/\.js$/.test(f) ? 'text/javascript'
  : /\.css$/.test(f) ? 'text/css'
  : /\.(png|jpe?g|webp|gif|svg)$/.test(f) ? 'image/png' : 'text/plain');

function localOnlyResources(log) {
  return {
    interceptors: [requestInterceptor((request) => {
      const url = String(request.url);
      const m = /^http:\/\/localhost\/(.*)$/.exec(url);
      if (m) {
        const f = decodeURIComponent(m[1].split('?')[0].split('#')[0]);
        const abs = path.join(ROOT, f);
        if (f && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          return new Response(fs.readFileSync(abs), { headers: { 'Content-Type': TYPE_OF(f) } });
        }
        log.missingLocal.push(f || '(빈 주소)');
        return new Response('', { headers: { 'Content-Type': 'text/plain' } });
      }
      log.external.push(url);
      return new Response('', { headers: { 'Content-Type': 'text/plain' } });
    })],
  };
}

/* 화면이 부르는 API를 서버처럼 답해 준다. 무엇을 어떤 본문으로 불렀는지 전부 남긴다 —
   「화면은 보냈는데 서버가 안 실었다」(XD)류는 **요청 본문을 봐야** 잡힌다. */
function stubFetch(win, log, fx) {
  win.fetch = (url, opt) => {
    const u = String(url);
    let body = null;
    try { body = opt && opt.body ? JSON.parse(opt.body) : null; } catch (e) { body = String(opt.body); }
    log.requests.push({ url: u, method: (opt && opt.method) || 'GET', body });
    const json = (v, ok = true, status = 200) => Promise.resolve({
      ok, status,
      json: () => Promise.resolve(v),
      text: () => Promise.resolve(JSON.stringify(v)),
    });
    if (typeof fx.route === 'function') {
      const custom = fx.route(u, opt, json);
      if (custom) return custom;
    }
    if (u.includes('/api/rates')) return json(fx.rates);
    if (u.includes('action=packages')) return json(fx.packages);
    if (u.includes('action=itineraries')) return json(fx.itineraries);
    if (/\/api\/quote-shares\/[^?]+$/.test(u)) {
      return fx.shareDoc ? json(fx.shareDoc) : json({ error: 'not_found' }, false, 404);
    }
    if (u.includes('/api/quote-shares')) return json(fx.shares);
    if (u.includes('/api/inquiries')) return json(fx.inquiries);
    if (u.includes('/api/quotes')) return json(fx.quotes);
    return json({});
  };
}

function bootPage(file, opts = {}) {
  const fx = Object.assign({}, DEFAULT_FIXTURES, opts.fixtures || {});
  const log = {
    errors: [], requests: [], says: [], navs: [], external: [], missingLocal: [],
    opened: [], printed: 0, downloads: [],
  };
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => log.errors.push({ where: '로드', msg: String((e && e.message) || e) }));

  const dom = new JSDOM(read(file), {
    runScripts: 'dangerously',
    resources: localOnlyResources(log),
    url: 'http://localhost/' + file + (opts.query || ''),
    virtualConsole: vc,
    beforeParse(win) {
      stubFetch(win, log, fx);
      win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      win.scrollTo = () => {};
      win.Element.prototype.scrollTo = () => {};
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 0);
      win.cancelAnimationFrame = (id) => win.clearTimeout(id);
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      win.HTMLCanvasElement.prototype.getContext = () => ctx;
      win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      win.print = () => { log.printed++; };
      win.alert = (m) => { log.says.push({ kind: 'alert', text: String(m) }); };
      win.confirm = (m) => { log.says.push({ kind: 'confirm', text: String(m) }); return true; };
      win.prompt = (m) => { log.says.push({ kind: 'prompt', text: String(m) }); return ''; };
      /* 파일 저장(Blob 다운로드)도 **일어났는지 센다** — 안 세면 「눌렀는데 아무 일도
         안 났다」와 구별이 안 된다. 실제 저장은 jsdom에 없다. */
      win.URL.createObjectURL = (blob) => { log.downloads.push({ size: blob && blob.size, type: blob && blob.type }); return 'blob:fake'; };
      win.URL.revokeObjectURL = () => {};
      /* 새 창(견적서 미리보기)은 **진짜 창**을 준다 — 열리는 척만 하면 그 안에서
         터지는 것도, 그 안의 링크도 못 본다.
       🔴 **스크립트도 돌려야 한다**(XL). `runScripts`를 안 주면 `document.write`로
         들어간 팝업 안의 `<script>`가 실행되지 않아, 그 안의 버튼이 전부 「정의되지
         않은 함수」가 된다 — 화면 결함이 아니라 **하네스 결함**인데 구별이 안 된다
         (실제로 「링크 복사가 아무 일도 안 한다」로 오진할 뻔했다). */
      win.open = () => {
        const sub = new JSDOM('<!doctype html><html><body></body></html>', {
          url: 'http://localhost/', runScripts: 'dangerously',
        });
        const w = sub.window;
        w.close = () => { Object.defineProperty(w, 'closed', { value: true, configurable: true }); };
        w.print = () => { log.printed++; };
        w.alert = (m) => { log.says.push({ kind: 'alert', text: String(m), where: '새 창' }); };
        w.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.addEventListener('error', (e) => log.errors.push({ where: '새 창', msg: String(e.message || e.error) }));
        /* 🔴 그래도 **jsdom은 `document.write`로 들어온 `<script>`를 실행하지 않는다**
           (직접 확인했다 — 태그는 생기는데 안 돈다). 실제 브라우저는 실행한다.
           그 차이를 그대로 두면 팝업 안의 버튼이 전부 「죽은 버튼」으로 보인다.
           → 문서가 닫히는 시점에 우리가 대신 돌린다. 실행 순서는 문서에 적힌 순서 그대로다. */
        const closeDoc = w.document.close.bind(w.document);
        w.document.close = () => {
          closeDoc();
          Array.from(w.document.querySelectorAll('script:not([src])')).forEach((s) => {
            try { w.eval(s.textContent); }
            catch (e) { log.errors.push({ where: '새 창 스크립트', msg: String(e.message || e) }); }
          });
        };
        log.opened.push(w);
        return w;
      };
      win.addEventListener('error', (e) => log.errors.push({ where: '실행', msg: String(e.message || e.error) }));
      win.addEventListener('unhandledrejection', (e) => log.errors.push({ where: '비동기', msg: String((e.reason && e.reason.message) || e.reason) }));
    },
  });

  /* 🔴 **iframe 안에는 스텁이 안 걸린다** (XT). 관리자 화면의 「내부 견적 산출」 탭은
     `admin-quote.html`을 iframe으로 띄우는데, 그 창은 우리가 만든 창이 아니라 jsdom이
     새로 만든 창이라 `fetch`가 없다 — 그 안의 코드가 부르는 순간 터진다.
     실제 브라우저에서는 멀쩡히 도는 코드라, 그대로 두면 **없는 결함**이 생긴다
     (이 하네스가 스스로 만든 가짜 결함 다섯 번째다).
   ⚠ 완전히는 못 막는다. iframe의 스크립트는 우리가 창을 잡기 **전에** 이미 돌 수 있다.
     그래서 이건 소음을 줄이는 것이지 「iframe 안을 봤다」는 뜻이 아니다 —
     **iframe 속 화면은 그 파일을 따로 열어서 봐야 한다**(`admin-quote.html`을 따로 잰다). */
  const stubFrames = (root) => {
    Array.from(root.querySelectorAll ? root.querySelectorAll('iframe') : []).forEach((f) => {
      const give = () => {
        try {
          const w = f.contentWindow;
          if (!w || w.__stubbed) return;
          w.__stubbed = true;
          stubFetch(w, log, fx);
          w.scrollTo = () => {};
          if (w.HTMLElement) w.HTMLElement.prototype.scrollIntoView = function () {};
          w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(Date.now()), 0);
          w.alert = (m) => { log.says.push({ kind: 'alert', text: String(m), where: 'iframe' }); };
          w.print = () => { log.printed++; };
          w.confirm = () => true;
          w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
          w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
          if (w.HTMLCanvasElement) {
            const ctx = new Proxy({}, { get: () => (() => ctx) });
            w.HTMLCanvasElement.prototype.getContext = () => ctx;
          }
        } catch (e) { /* 다른 오리진이면 못 건드린다 — 우리 파일만 띄우므로 여기 안 온다 */ }
      };
      give();
      f.addEventListener('load', give);
    });
  };

  const win = dom.window, doc = win.document;
  const tick = (ms = 30) => new Promise((r) => win.setTimeout(r, ms));
  const ready = new Promise((r) => { if (doc.readyState === 'complete') r(); else win.addEventListener('load', r); })
    .then(() => {
      stubFrames(doc);
      /* 탭을 눌러야 생기는 iframe도 있다 — 생길 때마다 잡는다 */
      if (typeof win.MutationObserver === 'function') {
        new win.MutationObserver(() => stubFrames(doc)).observe(doc.body || doc, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
      }
    });
  return { dom, win, doc, log, tick, ready, fixtures: fx };
}

/* 화면 글자만 본다 — `body.textContent`에는 페이지 안쪽 `<script>` 소스가 통째로
   들어 있어 그대로 검사하면 **없는 결함**이 생긴다(실제로 5건 만들었다). */
function visibleText(el) {
  if (!el) return '';
  const c = el.cloneNode(true);
  if (c.querySelectorAll) c.querySelectorAll('script,style').forEach((n) => n.remove());
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}

module.exports = { bootPage, visibleText, DEFAULT_FIXTURES, soon, ROOT, read };

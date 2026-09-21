/* ═══════════════════════════════════════════════════════════════════════════
   견적 관리 — **발급하지 않고** 고객 견적서를 미리 본다
   ───────────────────────────────────────────────────────────────────────────
   2026-09-17 대표: 「지금은 견적서 링크를 발급해서 웹상에 띄워야만 견적서를 볼 수 있다.
   견적을 담당하는 담당자가 나가는 견적서를 미리 살펴볼 수 있게 해 달라.」

   ■ 고치기 전
   확인하려면 **발급해야** 했다. 발급하면 견적번호가 따이고 대장에 줄이 남는다 —
   되돌릴 수 없는 일을 「보기 위해」 하고 있었다.
   옆에 있던 「관리자용 출력」은 **원가·비공개 항목이 든 내부 문서**라 고객이 받는 것이 아니다.

   ■ 🔴 이 검사가 지키는 것
   ① **미리 본 것과 실제로 나간 것이 같다** — payload를 만드는 곳이 하나(`emBuildShare`)여야
      한다. 미리보기가 따로 만들면 미리보기가 없는 것보다 나쁘다(담당자는 확인했다고 믿는다).
   ② **서버에 아무것도 안 만든다** — 미리보기가 번호를 따면 대장이 더러워진다.
   ③ **비공개 항목·원가가 안 새어 나간다** — 평소엔 서버가 지우는데 이 길은 서버를 안 거친다.
   ④ 🔴 **payload를 URL로 받지 않는다.** URL로 받으면 누구나 조작한 견적서 링크를 만들어
      남에게 보낼 수 있다(`decodeShareData`를 되살리면 안 되는 이유 — CLAUDE.md).
      `sessionStorage`는 그 사람 브라우저 안에서만 살아 **남에게 못 보낸다.**
   ⑤ **미리보기 화면이 스스로 미리보기라고 말한다** — 같은 화면이라 구별이 안 되면
      담당자가 캡처해 보내거나 발급된 것으로 믿는다.
   ⑥ **고객이 받는 링크(`?id=`)는 한 줄도 안 바뀐다.**
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { bootPage } = require('./_page_boot.js');
const { adminFixtures, enterDashboard } = require('./_admin_fixtures.js');
const { adminSource } = require('./_admin_source.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const VIEW = read('estimate-view.html');
const ADMIN = adminSource();

const 견적 = {
  id: 'q-prev-1', ts: new Date().toISOString(),
  destination: '다낭', destKey: '다낭', destLabel: '다낭',
  participants: 30, days: 4, nights: 3, total: 56696074, perPerson: 1889869,
  orgName: '[가상] 새롬물산', contact: '[가상] 김담당', contactTel: '010-1234-5678',
  status: 'new', basis: 'engine', startDate: '2027-05-10',
  items: [
    { name: '항공', amount: 20000000 },
    { name: '호텔', amount: 15000000 },
    /* 🔴 고객에게 가면 안 되는 줄 */
    { name: 'ENBT 수익', amount: 5000000, isHidden: true },
  ],
};

function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
    const p = path.join(ROOT, f.split('?')[0]);
    if (!fs.existsSync(p)) return m;
    return '<script>' + fs.readFileSync(p, 'utf8').replace(/<\/script/g, '<\\/script') + '</script>';
  });
}

/* 관리자 화면에서 미리보기를 눌러 본다 */
async function 눌러보기(rec) {
  const fx = adminFixtures('filled');
  const orig = fx.route;
  const 발급호출 = [];
  fx.route = function (u, opt, json) {
    const s = String(u);
    if (s.includes('quote-shares?action=issue')) { 발급호출.push(s); return json({ id: 'x' }); }
    if (s.includes('/api/quotes') && !s.includes('quote-shares')) return json([rec]);
    return orig.call(this, u, opt, json);
  };
  const B = bootPage('admin.html', { fixtures: fx });
  await B.ready; await enterDashboard(B); await B.tick(300);
  const 열린창 = []; const 알림 = [];
  B.win.open = (u) => { 열린창.push(String(u)); return { focus() {} }; };
  B.win.alert = (m) => 알림.push(String(m));
  const s1 = B.doc.createElement('script'); s1.textContent = "openEstDetail('" + rec.id + "');";
  B.doc.body.appendChild(s1);
  await B.tick(200);
  const s2 = B.doc.createElement('script'); s2.textContent = 'previewShareLink();';
  B.doc.body.appendChild(s2);
  await B.tick(700);
  const raw = B.win.sessionStorage.getItem('bizpage_preview_share');
  return { B, 발급호출, 열린창, 알림, payload: raw ? JSON.parse(raw) : null, raw };
}

/* 고객 견적서 화면을 미리보기 모드로 띄운다 */
async function 띄우기(payload, url) {
  const dom = new JSDOM(inlineScripts(VIEW), {
    runScripts: 'dangerously', url: url || 'http://localhost/estimate-view.html?preview=1',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
    beforeParse(w) {
      if (payload) { try { w.sessionStorage.setItem('bizpage_preview_share', JSON.stringify(payload)); } catch (e) {} }
      w.fetch = (u) => { (w.__calls = w.__calls || []).push(String(u)); return new Promise(() => {}); };
      w.print = () => {};
    },
  });
  const W = dom.window;
  await new Promise((r) => W.addEventListener('load', r));
  await sleep(350);
  return W;
}

(async () => {
  /* ═══ ① 만드는 곳이 하나인가 ═══════════════════════════════════════════ */
  ok('[1] payload를 만드는 함수가 하나다', /function emBuildShare\(/.test(ADMIN));
  ok('[1-b] 발급이 그 함수를 쓴다', (ADMIN.match(/emBuildShare\(rec, itiSnap\)/g) || []).length >= 2,
    String((ADMIN.match(/emBuildShare\(/g) || []).length) + '곳에서 부른다');
  ok('[1-c] 🔴 payload 모양을 두 번 적지 않았다',
    (ADMIN.match(/v: 1, dk: rec\.destKey/g) || []).length === 1,
    '공유 payload 리터럴이 여러 벌이다');

  /* ═══ ② 🔴 URL로 payload를 받지 않는다 ═══════════════════════════════════ */
  ok('[2] 미리보기는 sessionStorage에서만 읽는다',
    /sessionStorage\.getItem\('bizpage_preview_share'\)/.test(VIEW));
  /* ⚠ **주석을 걷어내고 센다.** 위 미리보기 주석이 「decodeShareData를 되살리면 안 된다」고
     적고 있어서, 그대로 세면 **내가 쓴 설명 때문에** 검사가 실패한다 — 이 저장소가
     반복해 겪은 함정이라 `test_tA`도 같은 방식을 쓴다(자기 주석을 읽고 없는 결함을 만든다). */
  const VIEW_CODE = VIEW.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('[2-b] 🔴 URL에서 payload를 복원하지 않는다',
    !/decodeShareData|params\.get\('data'\)|params\.get\('payload'\)/.test(VIEW_CODE),
    '위조 링크 경로가 생겼다');
  ok('[2-c] 고객 링크 경로(?id=)는 그대로다', /const id = params\.get\('id'\);/.test(VIEW));

  /* ═══ ③ 눌러 보기 — 서버를 안 거치고, 비공개가 안 샌다 ═══════════════════ */
  {
    const r = await 눌러보기(견적);
    ok('[3] 미리보기 창을 연다', r.열린창.some((u) => /preview=1/.test(u)), r.열린창.join(','));
    ok('[3-b] 🔴 서버에 아무것도 안 만든다', r.발급호출.length === 0, String(r.발급호출.length) + '건 불렀다');
    ok('[3-c] payload를 건넸다', !!r.payload);
    ok('[3-d] 🔴 비공개 항목이 안 실린다', !/ENBT|수익/.test(r.raw || ''), (r.raw || '').slice(0, 80));
    ok('[3-e] 고객에게 나갈 줄은 실린다',
      (r.payload.rows || []).length === 2 && r.payload.rows[0][0] === '항공');
    ok('[3-f] 일정도 함께 건넨다', !!(r.payload.itiA && (r.payload.itiA.d || []).length));
    r.B.win.close();
  }

  /* ═══ ④ 문서(v2)가 붙은 건 — 내부 값을 지우고 건넨다 ═══════════════════ */
  {
    const 문서견적 = Object.assign({}, 견적, {
      id: 'q-prev-2',
      doc: {
        meta: { client: '[가상] 새롬물산' },
        details: [{ label: '가이드', rows: [{ text: '한국인 우수가이드' }], footnotes: [] }],
        itinerary: [{ day: 1, title: '인천 → 다낭', am: '출발' }],
        _internal: { cost: 40000000, margin: 16696074, memo: '내부 메모' },
      },
    });
    const r = await 눌러보기(문서견적);
    ok('[4] 문서도 함께 건넨다', !!(r.payload && r.payload.doc));
    ok('[4-b] 🔴 원가·마진·내부 메모가 지워져 있다',
      !/내부 메모|40000000|16696074/.test(r.raw || ''), (r.raw || '').slice(0, 100));
    ok('[4-c] 담당자가 적은 내용은 남는다', /한국인 우수가이드/.test(r.raw || ''));
    r.B.win.close();
  }

  /* ═══ ⑤ 미리보기 화면이 스스로 말하는가 ═══════════════════════════════ */
  {
    const payload = {
      v: 1, dk: '다낭', dt: '다낭', n: 30, d: 4, ng: 3,
      org: '[가상] 새롬물산', cn: '[가상] 김담당', t: 56696074, pp: 1889869,
      iso: '2026-09-17', id: 'q-prev-1', rows: [['항공', 20000000]], sd: '2027-05-10',
      itiA: { t: '다낭 코스', d: [{ day: 1, title: '입국' }, { day: 2, title: '산업 시찰' }] }, itiB: null,
    };
    const W = await 띄우기(payload);
    const D = W.document;
    const bar = D.getElementById('preview-bar');
    ok('[5] 미리보기 띠가 뜬다', !!bar);
    ok('[5-b] 아직 안 나갔다고 말한다', /아직 발급되지 않았습니다/.test(bar ? bar.textContent : ''));
    ok('[5-c] 제목에도 표시한다', /^\[미리보기\]/.test(D.title), D.title);
    const 글 = (D.body.textContent || '').replace(/\s+/g, ' ');
    ok('[5-d] 견적 내용이 실제로 그려진다', /새롬물산/.test(글));
    ok('[5-e] 일정도 그려진다', /산업 시찰/.test(글));
    ok('[5-f] 🔴 서버를 안 부른다', !(W.__calls || []).some((u) => /quote-shares/.test(u)),
      (W.__calls || []).join(','));
    W.close();
  }

  /* ═══ ⑥ 주소만 열었을 때 — 고객용 만료 문구를 쓰지 않는다 ═══════════════
     🔴 「링크가 만료됐다」로 읽으면 담당자는 멀쩡한 견적을 처음부터 다시 만든다. */
  {
    const W = await 띄우기(null);
    const 글 = (W.document.getElementById('error-wrap').textContent || '').replace(/\s+/g, ' ');
    ok('[6] 미리보기 안내가 뜬다', /미리보기를 열 수 없습니다/.test(글), 글.slice(0, 80));
    ok('[6-b] 🔴 만료·잘못된 링크라고 말하지 않는다', !/만료|올바르지 않/.test(글), 글.slice(0, 80));
    ok('[6-c] 무엇을 누르면 되는지 말한다', /고객 화면 미리보기/.test(글));
    W.close();
  }

  /* ═══ ⑦ 고객 링크는 그대로 — preview 분기가 ?id= 를 가로채지 않는다 ═══ */
  {
    const W = await 띄우기(null, 'http://localhost/estimate-view.html?id=abc123');
    ok('[7] 🔴 ?id= 링크는 서버를 부른다 (미리보기 분기에 안 걸린다)',
      (W.__calls || []).some((u) => /\/api\/quote-shares\/abc123/.test(u)),
      (W.__calls || []).join(','));
    ok('[7-b] 미리보기 띠가 안 뜬다', !W.document.getElementById('preview-bar'));
    W.close();
  }

  /* ═══ ⑧ 버튼이 「관리자용 출력」과 구별되는가 ═══════════════════════════ */
  ok('[8] 미리보기 버튼이 있다', /onclick="previewShareLink\(\)"/.test(ADMIN));
  ok('[8-b] 이름이 고객 화면임을 말한다', /👁 고객 화면 미리보기/.test(ADMIN));
  ok('[8-c] 내부 문서 버튼은 그대로다', /관리자용 출력/.test(ADMIN));

  console.log('\n' + '─'.repeat(64));
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — ZX 견적서 미리보기');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('터짐:', e); process.exit(1); });

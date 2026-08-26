/* ═══════════════════════════════════════════════════════════════════════════
   WO — 견적서가 **받는 사람에게 맞는 말**을 하는가

   ■ 🔴 무엇이 잘못돼 있었나 (2026-08-26)

   VX가 견적 **화면**의 문구를 갈랐고(「연수」라고만 부르던 자리), VR·VS가 **견적서의
   금액 문구**를 갈랐다. 그런데 **견적서의 나머지가 안 갈려 있었다.**
   친목 모임 손님이 「방콕 자유여행 5일」 견적서를 받으면 이렇게 읽는다:

     · 「**연수** 계획」 · 「**연수** 목적지」 · 「**연수** 방식: —」 · 「**연수** 기간」
     · 「전문 컨설턴트가 맞춤 **연수** 프로그램을 상세히 안내해 드립니다」
     · 그리고 버튼 하나가 「**연수** 일정 더 탐색하기」 → **맞춤 견적 계산기로 보낸다**

   🔴 마지막 것이 가장 위험하다. VV에서 이미 확인된 것: 휴양·일반 고객이 그 계산기의
     칸을 열면 **소매가의 두 배**를 부른다(연수 원가 조립 + 계수 + 마진이 붙는다).
     639,000원짜리 패키지 견적서를 받은 손님이 그 버튼을 눌러 그 금액을 보면,
     **우리 견적서를 못 믿게 된다.** 목록이 흩어져 하나를 빠뜨린 자리다(결함 생성기 ①).

   ■ 이 검사가 지키는 것 — **소스가 아니라 실제로 그린 화면**을 본다

     ① 패키지 견적서에 「연수」가 **한 번도** 안 나온다(회사 소개 문구는 뺀다)
     ② 패키지 손님을 **맞춤 견적 계산기로 보내지 않는다**
     ③ 연수 견적서는 **그대로다** — 갈랐다고 원래 것을 잃으면 안 된다
     ④ 없는 칸(「연수 방식」)에 「—」를 찍지 않는다
     ⑤ 탭 제목도 같이 갈린다 (한 곳에서만 정한다)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WO 견적서의 말투`);
  process.exit(fail ? 1 : 0);
};

/* 실제로 서버가 주는 모양 그대로. **여기서 모양을 바꾸면 검사가 아무것도 못 잡는다.** */
const BASE = {
  dk: '방콕', dt: '방콕', n: 12, d: 5, ng: 3, sd: '2026-11-01',
  t: 7668000, pp: 639000, iso: '2026-08-26', qno: 'Q260826-01',
  rows: [['패키지 상품가 (1인)', 639000]],
  org: '한빛산업', cn: '김보균',
};
const PKG = Object.assign({}, BASE, {
  ptx: '패키지 상품',
  /* issuePackageShare가 넣는 모양(VS·WF) */
  pkg: {
    id: 'hana-x', title: '방콕 자유여행 5일', source: 'hanatour', basis: 'agency',
    asOf: '2026-08-24', validUntil: null,
    included: ['[교통] 왕복항공권'], excluded: ['(선택) [숙박] 객실 1인 사용료'],
  },
  ia: { t: '방콕 자유여행 5일', h: [], d: [{ day: 1, title: '11/01(일)', am: '인천 · 방콕' }] },
});
const TRAINING = Object.assign({}, BASE, {
  ptx: '산업시찰', vm: '기관 방문', ot: '기업', hgl: '4성급', sl: '평시',
});

function render(payload) {
  return new Promise((resolve) => {
    const vc = new VirtualConsole();
    const dom = new JSDOM(read('estimate-view.html'), {
      runScripts: 'dangerously', virtualConsole: vc,
      url: 'https://bizpage-estimate.vercel.app/estimate-view.html?id=test1',
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.print = () => {};
        /* 🔴 이 검사의 핵심 — 서버 대신 우리가 payload를 준다.
           페이지가 그것을 **실제로 그리는 것**을 본다(소스 정규식으로는 못 잰다). */
        w.fetch = (url) => Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(payload),
        });
      },
    });
    const w = dom.window;
    const finish = () => setTimeout(() => resolve(w), 300);   /* 렌더가 fetch 뒤에 온다 */
    if (w.document.readyState === 'complete') finish();
    else w.addEventListener('load', finish);
  });
}

(async () => {
  console.log('\n[1] 패키지 견적서 — 「연수」라고 말하지 않는다');
  {
    const w = await render(PKG);
    const body = w.document.body;
    ok('① 화면이 그려졌다', /방콕/.test(body.textContent), body.textContent.slice(0, 60));

    /* ⚠ 회사 소개(「해외연수 전문 기업」)는 우리 정체성이라 남긴다 — 그것까지 지우면
       회사가 무엇을 하는 곳인지 사라진다. **손님에게 하는 말**만 본다. */
    const said = [...body.querySelectorAll('.sec-title, .field-box-label, .cta-sub, .cta-btn')]
      .map((e) => e.textContent.trim());
    const bad = said.filter((t) => /연수/.test(t));
    ok('① 🔴 표 제목·칸 이름·버튼에 「연수」가 없다', bad.length === 0, JSON.stringify(bad));

    ok('① 「여행 계획」으로 부른다', said.includes('여행 계획'), JSON.stringify(said.slice(0, 8)));
    ok('① 「여행 목적지」', said.includes('여행 목적지'));
    ok('① 「여행 기간」', said.includes('여행 기간'));
    /* ④ 없는 칸에 「—」를 찍지 않는다 */
    ok('① 🔴 「연수 방식」 칸을 아예 안 그린다', !said.includes('연수 방식'));

    /* ② 맞춤 견적 계산기로 보내지 않는다 — VV의 「소매가의 두 배」 자리 */
    const links = [...body.querySelectorAll('a.cta-btn')].map((a) => a.getAttribute('href'));
    ok('② 🔴 맞춤 견적 계산기(index.html?dest=…)로 안 보낸다',
      !links.some((h) => /index\.html\?dest=/.test(h || '')), JSON.stringify(links));
    ok('② 패키지 목록으로 보낸다', links.some((h) => /packages\.html/.test(h || '')), JSON.stringify(links));

    ok('⑤ 탭 제목도 「여행 견적서」', /여행 견적서/.test(w.document.title), w.document.title);
    ok('⑤ 탭 제목에 금액·고객사가 없다',
      !/639|한빛|김보균/.test(w.document.title), w.document.title);

    /* WL이 읽어 온 포함/불포함이 실제로 견적서에 나간다 */
    ok('① 포함사항이 견적서에 실린다', /왕복항공권/.test(body.textContent));
  }

  console.log('\n[2] 연수 견적서 — 원래대로다 (갈랐다고 잃으면 안 된다)');
  {
    const w = await render(TRAINING);
    const body = w.document.body;
    const said = [...body.querySelectorAll('.sec-title, .field-box-label, .cta-sub, .cta-btn')]
      .map((e) => e.textContent.trim());
    ok('③ 「연수 계획」 그대로', said.includes('연수 계획'), JSON.stringify(said.slice(0, 8)));
    ok('③ 「연수 목적지」 그대로', said.includes('연수 목적지'));
    ok('③ 「연수 방식」 칸이 있다', said.includes('연수 방식'));
    ok('③ 「여행 계획」이라고 하지 않는다', !said.includes('여행 계획'));
    const links = [...body.querySelectorAll('a.cta-btn')].map((a) => a.getAttribute('href'));
    ok('③ 맞춤 견적 계산기로 보낸다 (목적지를 달고)',
      links.some((h) => /index\.html\?dest=%EB|index\.html\?dest=방콕/.test(h || '')), JSON.stringify(links));
    ok('③ 탭 제목은 「연수 견적서」', /연수 견적서/.test(w.document.title), w.document.title);
  }

  console.log('\n[3] 목적지 키가 없는 견적서 — 빈 쿼리로 계산기를 열지 않는다');
  {
    const w = await render(Object.assign({}, TRAINING, { dk: '' }));
    const links = [...w.document.body.querySelectorAll('a.cta-btn')].map((a) => a.getAttribute('href'));
    const explore = links.find((h) => /index\.html.*#estimate/.test(h || ''));
    ok('④ 계산기 링크는 여전히 있다', !!explore, JSON.stringify(links));
    /* ⚠ `?dest=&days=&pt=`로 열면 계산기가 아무것도 고른 것 없이 뜬다 */
    ok('④ 🔴 빈 쿼리를 달지 않는다', !/dest=&/.test(explore || ''), explore);
  }

  console.log('\n[4] 소스 규칙 — 한 곳에서만 정한다');
  {
    const src = read('estimate-view.html');
    ok('⑤ 탭 제목을 정하는 곳이 하나뿐이다',
      (src.match(/document\.title\s*=/g) || []).length === 1,
      String((src.match(/document\.title\s*=/g) || []).length));
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

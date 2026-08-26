/* ═══════════════════════════════════════════════════════════════════════════
   WO·WP — 견적서가 **받는 사람에게 맞는 말**을 하는가
   (WP에서 [5]~[7]을 더했다 — 같은 하네스를 두 벌로 만들지 않는다)

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

/* 🔴 **화면 글자만 본다.** `body.textContent`에는 페이지 안쪽 `<script>`의 **소스가
   통째로** 들어 있다 — 그걸 그대로 검사하면 「TRAINING PROGRAM」이 코드 주석·분기에
   남아 있다는 이유로 걸린다. 실제로 이 검사를 처음 돌렸을 때 5건이 그렇게 잘못 걸렸다.
   (없는 결함을 만들지 않는 것 — 이 저장소가 반복해서 배운 것이다.) */
function visibleText(w) {
  const clone = w.document.body.cloneNode(true);
  clone.querySelectorAll('script, style, template').forEach((e) => e.remove());
  return clone.textContent;
}

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
        /* 엑셀 경로를 부를 수 있게 XLSX를 흉내 낸다 — **만들어진 시트 내용을 잡아 둔다**.
           ⚠ 진짜 xlsx는 CDN에서 온다. 검사가 그것을 받으러 나가면 남의 서버가 느린 날
             빨간 줄이 뜬다(WJ에서 세운 규칙). 여기서는 받지 않는다. */
        w.__aoa = null;
        w.XLSX = {
          utils: {
            aoa_to_sheet: (aoa) => { w.__aoa = aoa; return {}; },
            book_new: () => ({}), book_append_sheet: () => {},
          },
          writeFile: () => {},
        };
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

  console.log('\n[5] WP — 유효기간이 한 문서에 두 개 찍히지 않는다');
  {
    /* 🔴 실측으로 나온 것: 상단 바는 「발급 + 30일」(9/25), 금액 기준 박스는 상품
       유효기간(9/30). **같은 문서에 두 날짜**가 찍혔다. 고객은 어느 쪽을 믿나. */
    /* PKG 기본 픽스처는 validUntil이 null이다 — 상품 유효기간이 **있는** 경우를 잰다 */
    const withUntil = JSON.parse(JSON.stringify(PKG));
    withUntil.pkg.validUntil = '2026-09-30';
    const w = await render(withUntil);
    const body = w.document.body;
    const vis = visibleText(w);
    const bar = w.document.getElementById('validity-bar').textContent;
    ok('⑥ 상단 유효기간이 상품 유효기간이다', /9월 30일/.test(bar), bar);
    ok('⑥ 🔴 「발급 + 30일」로 계산한 날짜가 안 보인다', !/9월 25일/.test(vis));
    /* 배너도 「발급 →」이라 말하지 않는다 — 그 날짜는 발급과 무관하다 */
    ok('⑥ 배너가 「상품 유효기간」이라고 말한다', /상품 유효기간/.test(vis));

    ok('⑥ 라벨이 TRAVEL PACKAGE', /TRAVEL PACKAGE/.test(vis));
    ok('⑥ 🔴 「TRAINING PROGRAM」이 없다', !/TRAINING PROGRAM/.test(vis));

    /* 🔴 「우리 요율로 산출했다」는 패키지에 거짓말이다 */
    ok('⑥ 🔴 「요율 기준으로 산출」이라고 안 한다', !/요율 기준으로 산출/.test(vis));
    ok('⑥ 「공급사 판매가」라고 말한다', /공급사 판매가/.test(vis));
    ok('⑥ 조기 마감 가능성을 알린다', /조기 마감/.test(vis));
    /* 푸터의 「발급일로부터 30일간 유효」도 맞춤 견적 규칙이다 */
    ok('⑥ 푸터도 30일 규칙을 말하지 않는다', !/발급일로부터 30일간/.test(vis));

    const said = [...body.querySelectorAll('.sec-title, .field-box-label')].map((e) => e.textContent.trim());
    ok('⑥ 없는 칸을 안 그린다 (호텔 등급·시즌·기관 유형)',
      !said.includes('호텔 등급') && !said.includes('시즌') && !said.includes('기관 유형'),
      JSON.stringify(said));
    ok('⑥ 「요율 기준 · —」을 안 찍는다', !/요율 기준/.test(vis));
    ok('⑥ 🔴 종료일이 없으면 「~ —」를 안 그린다', !/~\s*—/.test(vis),
      (vis.match(/.{0,20}~.{0,10}/) || [''])[0]);
    /* 포함사항이 두 번 찍히지 않는다 */
    ok('⑥ 「포함 항목」이 「포함 사항」과 겹쳐 찍히지 않는다',
      !said.includes('포함 항목') && said.includes('포함 사항'), JSON.stringify(said));
  }

  console.log('\n[6] WP — 🔴 마감된 상품을 「아직 유효」라고 말하지 않는다');
  {
    /* 패키지 방침 3번이 막으려던 자리다. 상품 유효기간이 지났는데 「발급 + 30일」로
       재면 아직 유효한 것으로 보인다 — 그 상태로 고객이 결재를 올린다. */
    const expired = JSON.parse(JSON.stringify(PKG));
    expired.pkg.validUntil = '2026-08-01';        /* 오늘(8/26)보다 前 */
    const w = await render(expired);
    ok('⑦ 🔴 만료로 표시된다', /유효기간이 만료|유효기간 만료/.test(visibleText(w)),
      w.document.getElementById('validity-bar').textContent);
  }

  console.log('\n[7] WP — 발급일 자리에 견적 기록 id를 찍지 않는다');
  {
    /* 🔴 `d.id`는 경로마다 뜻이 다르다: 고객 계산기는 한글 날짜, 담당자 발급은
       **견적 기록 id**(`mfa3k2x`). 그래서 담당자가 낸 견적서를 받은 고객은
       「견적 유효기간: mfa3k2x 발급 → …」을 읽고 있었다. */
    const w = await render(Object.assign({}, TRAINING, { id: 'mfa3k2x' }));
    const t = visibleText(w);
    ok('⑧ 🔴 기록 id가 화면에 안 보인다', !/mfa3k2x/.test(t),
      (t.match(/.{0,30}mfa3k2x.{0,20}/) || [''])[0]);
    ok('⑧ 발급일이 날짜로 나온다', /2026년 8월 26일 발급/.test(t),
      (t.match(/견적 유효기간.{0,40}/) || [''])[0]);
  }

  console.log('\n[8] WQ — 🔴 인쇄한 견적서에 유효기간이 남는다');
  {
    /* 인쇄 CSS가 `.validity-banner`를 숨기고 있었다. 상단 바도 `no-print`라,
       **종이에는 유효기간이 한 줄도 없었다** — 결재 서류로 올라가는 그 문서에서.
       견적번호를 인쇄물에 남기려고 히어로로 옮긴 것(WB)과 같은 자리다. */
    const src = read('estimate-view.html');
    /* ⚠ **주석을 먼저 걷어낸다.** 이 검사를 처음 짤 때 「왜 안 숨기는지」를 적어 둔
       내 주석에 `.validity-banner`가 들어 있어서 그것 때문에 걸렸다 — 규칙이 아니라
       설명을 읽고 결함이라 부른 것이다(WP에서 스크립트 소스를 읽어 5건을 만든 것과
       같은 유형). **숨기는 규칙의 선택자만** 본다. */
    /* ⚠ `@media print {` 자체를 건너뛴다 — 안 그러면 첫 규칙의 선택자가 「@media print」로
       잡힌다(중괄호를 세지 않고 첫 `{`를 만나면 그것이 규칙인 줄 안다). */
    const printBlock = src.slice(src.indexOf('@media print') + '@media print {'.length,
      src.indexOf('@media print') + 900).replace(/\/\*[\s\S]*?\*\//g, '');
    const hideRule = (printBlock.match(/([^{}]*)\{[^}]*display:\s*none[^}]*\}/) || [])[1] || '';
    ok('⑨ 🔴 인쇄에서 유효기간 배너를 숨기지 않는다',
      hideRule.length > 0 && !/validity-banner/.test(hideRule), JSON.stringify(hideRule.trim()));
    ok('⑨ 그래도 상단 바·CTA는 여전히 숨긴다 (화면 장치다)',
      /top-bar/.test(hideRule) && /cta-section/.test(hideRule), JSON.stringify(hideRule.trim()));
    /* ⚠ 「N일 남음」은 종이에 남기지 않는다 — 나중에 읽히면 틀린 말이 된다 */
    const w = await render(TRAINING);
    const daysEl = [...w.document.querySelectorAll('.validity-banner .no-print')];
    ok('⑨ 「N일 남음」은 인쇄에서 빠진다', daysEl.length === 1 && /남음/.test(daysEl[0].textContent),
      JSON.stringify(daysEl.map((e) => e.textContent)));
    ok('⑨ 그래도 화면에는 보인다', /남음/.test(visibleText(w)));
  }

  console.log('\n[9] WQ — 엑셀에도 조건이 실린다 (결재에 붙는 문서다)');
  {
    const withUntil = JSON.parse(JSON.stringify(PKG));
    withUntil.pkg.validUntil = '2026-09-30';
    const w = await render(withUntil);
    w.downloadEstimateExcelShared();
    const aoa = w.__aoa;
    ok('⑩ 시트를 만들었다', Array.isArray(aoa) && aoa.length > 5, JSON.stringify(aoa && aoa.length));
    const flat = (aoa || []).map((r) => r.join('|')).join('\n');
    ok('⑩ 🔴 유효기간이 들어간다', /상품 유효기간\|2026-09-30/.test(flat),
      (flat.match(/.*유효기간.*/) || [''])[0]);
    ok('⑩ 🔴 상품명이 들어간다', /상품명\|방콕 자유여행 5일/.test(flat));
    ok('⑩ 포함 사항이 들어간다', /포함 사항/.test(flat) && /왕복항공권/.test(flat));
    ok('⑩ 불포함 사항도 들어간다', /불포함 사항/.test(flat));
    /* ⚠ 없는 칸은 줄 자체를 안 만든다 — 「기관 유형 · —」이 남으면 빠뜨린 줄 안다 */
    ok('⑩ 패키지에 「기관 유형」 줄이 없다', !/기관 유형/.test(flat));
    ok('⑩ 발행일이 날짜다 (기록 id가 아니다)', /발행일\|2026-08-26/.test(flat),
      (flat.match(/발행일.*/) || [''])[0]);

    /* 연수 견적서는 원래 칸을 유지한다 */
    const w2 = await render(TRAINING);
    w2.downloadEstimateExcelShared();
    const flat2 = (w2.__aoa || []).map((r) => r.join('|')).join('\n');
    ok('⑩ 연수 견적서에는 「기관 유형」이 그대로', /기관 유형\|기업/.test(flat2));
    ok('⑩ 연수 견적서 유효기간은 발급 + 30일', /견적 유효기간\|2026-09-25/.test(flat2),
      (flat2.match(/.*유효기간.*/) || [''])[0]);
  }

  console.log('\n[10] XC — 🔴 패키지 견적서에 **일정이 실린다**');
  {
    /* 서버는 일정을 `ia`로 싣는데(issuePackageShare) 이 화면은 `itiA/itiB`만 읽고 있었다.
       그래서 하나투어에서 일정을 읽어 와 저장하고 발급까지 해도(WI·WJ·WL·WU)
       **고객이 받는 문서에는 일정이 한 줄도 없었다.** 패키지의 핵심 가치가 「정해진
       일정」인데 금액만 나간 셈이다. */
    const withIti = JSON.parse(JSON.stringify(PKG));
    withIti.ia = { t: '방콕 자유여행 5일', h: [], d: [
      { day: 1, title: '11/01(일)', am: '인천 · 방콕 / 식사: 기내식 / 숙박: ibis Styles Bangkok Silom' },
      { day: 2, title: '11/02(월)', am: '방콕 / 자유일정 / 식사: 호텔식' },
    ] };
    const w = await render(withIti);
    const d = w.document;
    const vis = visibleText(w);
    ok('⑪ 🔴 일정이 날짜 수만큼 그려진다', d.querySelectorAll('.pkg-iti-day').length === 2,
      String(d.querySelectorAll('.pkg-iti-day').length));
    ok('⑪ 호텔 이름까지 실린다', /ibis Styles Bangkok Silom/.test(vis));
    ok('⑪ 일차와 날짜를 함께 말한다', /DAY 1 · 11\/01\(일\)/.test(vis.replace(/\s+/g, ' ')));
    /* ⚠ 하나투어는 하루를 **한 줄**로 준다 — 오전/오후/저녁 3칸 표에 넣으면
       「오후 —」가 매일 찍혀 빠뜨린 것처럼 보인다(WP에서 세운 규칙과 같은 자리). */
    ok('⑪ 🔴 「오후 —」 「저녁 —」를 안 찍는다', !/오후 —/.test(vis) && !/저녁 —/.test(vis),
      (vis.match(/.{0,20}오후.{0,10}/) || [''])[0]);
    /* 확정 일정이지 추천이 아니다 */
    ok('⑪ 「추천 코스」라고 하지 않는다', !/추천 코스|탐색하신 일정/.test(vis));
    ok('⑪ 바뀔 수 있다는 것도 말한다', /순서가 바뀔 수 있습니다/.test(vis));

    /* 일정이 없는 패키지(엑셀 투입분 등)에서는 그 자리를 아예 안 그린다 */
    const noIti = JSON.parse(JSON.stringify(PKG));
    noIti.ia = null;
    const w2 = await render(noIti);
    ok('⑪ 일정이 없으면 빈 카드를 안 그린다',
      w2.document.querySelectorAll('.pkg-iti-day').length === 0);

    /* 맞춤 견적서는 그대로 — 추천 코스 자리를 뺏지 않는다 */
    const tr = JSON.parse(JSON.stringify(TRAINING));
    tr.itiA = { t: '도쿄 산업시찰', s: '', h: ['혁신센터'], d: [{ day: 1, title: '1일차', am: '오전 일정', pm: '오후 일정', eve: '' }] };
    const w3 = await render(tr);
    const vis3 = visibleText(w3);
    ok('⑪ 맞춤 견적서는 추천 코스를 그대로 그린다', /추천 코스/.test(vis3), vis3.slice(0, 60));
    ok('⑪ 맞춤 견적서에는 패키지 일정 카드가 없다',
      w3.document.querySelectorAll('.pkg-iti-day').length === 0);
  }

  console.log('\n[11] XD — 🔴 받으시는 분의 이름이 문서에 실린다');
  {
    /* WF는 이름을 받아 **대장 컬럼에만** 넣었다. 그래서 고객이 「받으실 분」에 이름을
       적고 견적서를 받아도 그 문서의 수신처가 「기관명 —」 「담당자 —」로 비어 있었다.
       ⚠ WC의 규칙은 「**연락처**는 문서에 찍힐 이유가 없다」였지 이름까지 빼라는 것이
         아니었다 — 같은 주석이 「이름·회사명은 공문 성격상 문서에 찍혀야 한다」고 한다. */
    const named = Object.assign({}, PKG, { cn: '김보균' });
    delete named.org;
    const w = await render(named);
    const boxes = [...w.document.querySelectorAll('.field-box')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim());
    ok('⑫ 🔴 이름이 문서에 찍힌다', boxes.some((b) => /김보균/.test(b)), JSON.stringify(boxes.slice(0, 3)));
    ok('⑫ 「받으시는 분」이라고 부른다', boxes.some((b) => /^받으시는 분/.test(b)), JSON.stringify(boxes.slice(0, 3)));
    /* ⚠ 패키지 손님에게는 기관이 없다 — 늘 「—」로 남는 칸을 안 그린다 */
    ok('⑫ 패키지에는 「기관명」 칸이 없다', !boxes.some((b) => /^기관명/.test(b)), JSON.stringify(boxes.slice(0, 3)));
    /* 🔴 연락처는 여전히 문서에 없다 */
    ok('⑫ 🔴 연락처는 문서에 없다', !/010|1234-5678/.test(visibleText(w)));

    /* 맞춤 견적서는 그대로 — 기업 견적서에 기관명이 빠지면 공문이 아니다 */
    const w2 = await render(TRAINING);
    const boxes2 = [...w2.document.querySelectorAll('.field-box')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim());
    ok('⑫ 맞춤 견적서에는 「기관명」이 그대로', boxes2.some((b) => /^기관명/.test(b)), JSON.stringify(boxes2.slice(0, 3)));
    ok('⑫ 맞춤 견적서는 「담당자」라고 부른다', boxes2.some((b) => /^담당자/.test(b)));

    /* 서버가 실제로 이름을 싣는지도 원문으로 잰다 — 화면만 고치면 값이 안 온다 */
    const api = read('api/quote-shares.js');
    ok('⑫ 서버가 payload에 이름을 싣는다', /cn: pkgCustomerLabel\(b\.customerName\)/.test(api));
    ok('⑫ 🔴 그런데 연락처는 payload에 안 싣는다',
      !/customerTel[\s\S]{0,60}share/.test(api) && /custTel\}\)/.test(api));
  }

  console.log('\n[12] XE — 🔴 금액 표가 무슨 기준인지 말한다');
  {
    /* 🔴 담당자가 조립한 견적서에서 **항목 합과 TOTAL이 안 맞아 보인다**:
         항공 620,000 + 호텔 380,000 + 지상비 190,000 = 1,190,000 (1인 기준)
         TOTAL 4,760,000 (4명)
       고객은 표를 못 믿거나 우리가 잘못 더한 줄 안다. 값을 곱해서 고치지 않고
       **무슨 기준인지 표가 말하게** 했다(값을 바꾸면 담당자가 넣은 숫자와 달라진다). */
    const ADHOC = {
      dk: null, dt: '오키나와', n: 4, d: 4, ng: 3, sd: '2026-12-03',
      t: 4760000, pp: 1190000, iso: '2026-08-26', qno: 'Q260826-02',
      ptx: '담당자 산출', cn: '최현욱',
      rows: [['항공', 620000], ['호텔 3박', 380000], ['지상비', 190000]],
      pkg: { id: 'adhoc-1', title: '최현욱님 오키나와 휴가', source: 'hanatour', basis: 'assembled',
        asOf: '2026-08-25', validUntil: '2026-09-24', included: ['왕복 항공권'], excluded: [] },
      ia: null,
    };
    const w = await render(ADHOC);
    const heads = [...w.document.querySelectorAll('.price-tbl th')].map((e) => e.textContent.trim());
    ok('⑬ 🔴 금액 표가 「1인 기준」이라고 말한다', heads.includes('금액 (1인 기준)'), JSON.stringify(heads));
    /* ⚠ 조립 견적은 「패키지」가 아니다 — 고객이 정해진 상품을 산 것으로 읽으면 안 된다(VS) */
    ok('⑬ 🔴 조립 견적을 「TRAVEL PACKAGE」라 부르지 않는다',
      w.document.getElementById('hero-label').textContent === 'CUSTOM TRAVEL PLAN',
      w.document.getElementById('hero-label').textContent);
    ok('⑬ 금액 문구도 「담당자 산출」로 갈린다', /담당자 산출 금액/.test(visibleText(w)));

    /* 대리점가 패키지는 그대로 「TRAVEL PACKAGE」 */
    const w2 = await render(PKG);
    ok('⑬ 대리점가 패키지는 TRAVEL PACKAGE',
      w2.document.getElementById('hero-label').textContent === 'TRAVEL PACKAGE',
      w2.document.getElementById('hero-label').textContent);

    /* 🔴 맞춤 견적의 rows는 **총액 기준**이다 — 거기 「1인 기준」을 붙이면 거짓말이 된다 */
    const w3 = await render(TRAINING);
    const heads3 = [...w3.document.querySelectorAll('.price-tbl th')].map((e) => e.textContent.trim());
    ok('⑬ 🔴 맞춤 견적에는 「1인 기준」을 안 붙인다',
      heads3.includes('금액') && !heads3.includes('금액 (1인 기준)'), JSON.stringify(heads3));
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

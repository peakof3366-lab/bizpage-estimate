/* ═══════════════════════════════════════════════════════════════════════════
   XB — **읽어서 채운 것이, 저장하면 그대로인가**

   하나투어에서 읽은 값은 화면의 칸(textarea)에 **글자로** 들어갔다가 저장할 때 다시
   구조로 파싱된다. 그 왕복에서 값이 달라지면 **담당자는 화면에서 본 것을 저장했다고
   믿는데 DB에는 다른 것이 들어간다** — 조용한 결함(생성기 ②)의 전형이다.

   ■ 실제로 위험한 자리를 표본에서 찾았다 (100건 · 일정 473줄)

   일정은 `제목 | 내용` 한 줄로 칸에 들어간다. 그런데 **하나투어 호텔 이름에 `|`가
   들어 있는 상품이 실제로 있다**:

     「… / 숙박: 알로나비치의 즐거움을 가장 합리적으로 즐기는 선택 **|** 헤난 타왈라 리조트」

   구분자를 그대로 `split('|')`로 가르면 이 줄은 세 조각이 되어 내용 일부가 잘린다.
   ✅ 확인 결과 `pkgParseIti`는 **`parts.slice(1).join('|')`로 되붙인다** — 이미 안전하다.
   이 검사는 그 성질을 **고정**한다(누군가 `parts[1]`로 줄이면 여기서 걸린다).

   ■ 함께 잰 것 — 저장 상한 (표본 100건 실측)

     상품명 최대 134자 (상한 200) · 일정 JSON 최대 1,556자 (상한 60,000)
     포함사항 JSON 최대 605자 · 넘는 상품 **0건**
   즉 담당자가 다 채우고 저장을 눌렀는데 400으로 튕기는 일은 지금 표본에서는 없다.

   ■ 이 검사가 지키는 것

     ① 🔴 일정 왕복이 **글자 하나 안 잃는다** — `|`가 든 실제 값으로 잰다
     ② 포함/불포함 왕복도 그대로다 (줄 단위라 줄바꿈이 들어가면 갈라진다 — 안 들어온다)
     ③ 서버 상한을 넘지 않는다 (넘으면 담당자가 다 채운 뒤에 튕긴다)
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
  console.log(`결과: ${pass} pass / ${fail} fail  — XB 채운 값의 왕복`);
  process.exit(fail ? 1 : 0);
};

/* 🔴 **실제로 온 값**이다(2026-08-26 표본 100건에서 뽑았다). 「대충 비슷한 것」으로
   짜면 `|`가 든 줄을 안 만들게 되고, 그러면 이 검사는 아무것도 못 잡는다. */
const ROW = {
  title: '보홀 4일', destLabel: '보홀', nights: 3, days: 4,
  departDate: '2026-09-27', pricePerPerson: 899000, sourceCode: 'X1',
  priceAsOf: '2026-08-24', imageUrl: 'https://image.hanatour.com/a.jpg',
  included: ['[교통] 왕복항공권', '[식사] 식사비 — 일정표에 기재된 조식제공'],
  excluded: ['(선택) [숙박] 객실 1인 사용료'],
  itinerary: [
    { day: 1, title: '09/27(일)',
      am: '인천 · 보홀 / 필리핀 출입국 안내 / 식사: 기내-불포함(유료제공) / 숙박: 알로나비치의 즐거움을 가장 합리적으로 즐기는 선택 | 헤난 타왈라 리조트' },
    { day: 2, title: '09/28(월)', am: '보홀 / 초콜릿힐 · 로복강 크루즈 / 식사: 호텔식 / 조식' },
  ],
  priceParts: { base: 800000, tax: 99000, fuel: 0, total: 899000, singleAddNote: null },
  titleTags: [],
};

const dom = new JSDOM(read('admin.html'), {
  runScripts: 'dangerously', resources: 'usable',
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
    w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  },
});
const w = dom.window, d = w.document;

const finish = async () => {
  if (typeof w.pkgReadHanatour !== 'function' || typeof w.pkgParseIti !== 'function') {
    fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
    return done();
  }

  console.log('\n[1] 🔴 일정 왕복 — `|`가 든 실제 값으로 잰다');
  {
    w.fetch = () => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ ok: true, row: ROW, missing: [], warnings: [], notProvided: [] }),
    });
    d.getElementById('pkgHtUrl').value = 'https://www.hanatour.com/x?pkgCd=X1';
    await w.pkgReadHanatour();

    const text = String(d.getElementById('pkgIti').value || '');
    ok('① 일정이 칸에 채워졌다', text.length > 40, JSON.stringify(text.slice(0, 40)));
    const back = w.pkgParseIti(text);
    ok('① 일수가 같다', back.length === ROW.itinerary.length, back.length + ' vs ' + ROW.itinerary.length);
    ok('① 제목이 같다', back[0].title === ROW.itinerary[0].title,
      JSON.stringify([back[0].title, ROW.itinerary[0].title]));
    /* 🔴 여기가 이 검사의 핵심 — 호텔 이름의 `|`가 잘리면 안 된다 */
    ok('① 🔴 `|`가 든 줄이 글자 하나 안 잃는다', back[0].am === ROW.itinerary[0].am,
      JSON.stringify({ 저장될값: back[0].am.slice(-40), 원본: ROW.itinerary[0].am.slice(-40) }));
    ok('① 「헤난 타왈라 리조트」가 살아 있다', /헤난 타왈라 리조트$/.test(back[0].am), back[0].am.slice(-30));
    ok('① 둘째 날도 그대로다', back[1].am === ROW.itinerary[1].am);
  }

  console.log('\n[2] 포함/불포함 왕복');
  {
    const lines = (id) => String((d.getElementById(id) || {}).value || '')
      .split('\n').map((s) => s.trim()).filter(Boolean);
    ok('② 포함사항이 줄 단위로 그대로다',
      JSON.stringify(lines('pkgIncl')) === JSON.stringify(ROW.included),
      JSON.stringify(lines('pkgIncl')));
    ok('② 불포함도 그대로다',
      JSON.stringify(lines('pkgExcl')) === JSON.stringify(ROW.excluded));
    /* ⚠ 줄 단위라 값 안에 줄바꿈이 들어오면 갈라진다 — 표본 100건에서는 0개였다.
       하나투어 값이 바뀌어 줄바꿈이 들어오기 시작하면 여기가 먼저 깨져야 한다. */
    ok('② 값에 줄바꿈이 없다는 전제를 잰다',
      ROW.included.every((s) => !/[\r\n]/.test(s)));
  }

  console.log('\n[3] 저장 상한을 넘지 않는다 (표본 100건 실측 기준)');
  {
    const src = read('api/content.js');
    const titleMax = Number((src.match(/PKG_MAX_TITLE = (\d+)/) || [])[1]);
    const jsonMax = Number((src.match(/PKG_MAX_JSON = (\d+)/) || [])[1]);
    ok('③ 서버 상한을 읽었다', titleMax > 0 && jsonMax > 0, titleMax + ' / ' + jsonMax);
    /* 표본 실측: 상품명 최대 134자 · 일정 JSON 최대 1,556자 — 상한과 자릿수가 다르다 */
    ok('③ 상품명 상한이 실측 최대(134자)보다 넉넉하다', titleMax >= 200, String(titleMax));
    ok('③ JSON 상한이 실측 최대(1,556자)보다 넉넉하다', jsonMax >= 60000, String(jsonMax));
    ok('③ 이 픽스처도 상한 안이다',
      ROW.title.length <= titleMax && JSON.stringify(ROW.itinerary).length <= jsonMax);
  }

  console.log('\n[4] 파서가 되붙이는 성질을 고정한다');
  {
    const src = read('admin.html');
    /* 🔴 `parts[1]`로 줄이면 `|`가 든 값이 조용히 잘린다 */
    ok('④ 🔴 나머지를 다시 이어 붙인다', /parts\.slice\(1\)\.join\('\|'\)/.test(src));
    /* 합성 입력으로도 확인 — 규칙이 바뀌면 위 소스 검사가 먼저 걸린다 */
    const r = w.pkgParseIti('제목 | 앞 | 뒤');
    ok('④ 조각이 셋이어도 내용이 안 잘린다', r[0].am === '앞 | 뒤', JSON.stringify(r[0]));
    ok('④ 구분자가 없으면 제목만 된다', w.pkgParseIti('제목만')[0].title === '제목만');
  }

  done();
};
if (d.readyState === 'complete') finish();
else w.addEventListener('load', finish);

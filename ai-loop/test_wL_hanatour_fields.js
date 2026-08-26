/* ═══════════════════════════════════════════════════════════════════════════
   WL — 하나투어에서 **더 정확히** 읽는다: 포함/불포함 · 박수 · 사진 · 금액 확인일

   ■ 🔴 WJ의 결론 둘을 정정한다

   ① 「포함/불포함 사항은 안 온다 — 세 엔드포인트를 다 뒤졌지만 없다」 → **틀렸다.**
      같은 `getPkgProdInfo` 응답 안에 `trvlExpnInclList`·`trvlExpnNoneInclList`·
      `trvlChcExpnList`로 들어 있었다. WI에서 「홈페이지에서는 못 가져온다」가 틀렸던
      것과 **같은 유형**이다 — 한 번 훑고 없다고 결론지었다.
   ② 박·일수를 **일정 줄 수로 지어내고 있었다**(`nights = days - 1`). 하나투어는
      `trvlNgtCnt`·`trvlDayCnt`로 직접 말해 준다. 방콕 자유여행 5일은 실제 **3박**인데
      (야간 비행) 우리는 4박으로 만들고 있었다 — 고객 견적서에 찍히는 값이다.

   ■ ⚠ 그리고 내가 만든 없는 결함 하나 — 이것도 여기서 잠근다

   검산을 `상품가 + 제세 = 총액`으로 짰더니 **표본 30건 중 24건이 「안 맞는다」**로
   나왔다. 코드가 아니라 **가정이 틀렸다** — 유류할증료가 빠져 있었다.
   실측(30건 전수): `상품가 + 제세 + 유류 = 총액`. WD의 「없는 결함 22건」과 같은 자리다.

   ■ 이 검사가 지키는 것

     ① HTML이 섞인 문구를 **글자를 잃지 않고** 한 줄로 만든다
     ② 빈 항목·중복을 버린다 (고객 견적서에 빈 줄이 찍히면 안 된다)
     ③ 사진은 **https만** (VZ가 세운 규칙 — 화면이 `<img src>`에 그대로 쓴다)
     ④ 박·일수는 **하나투어 값이 이긴다**, 없을 때만 일정으로 세고 그 사실을 말한다
     ⑤ 검산식에 **유류가 들어 있다** (빼면 없는 결함이 24건 생긴다)
     ⑥ 🔴 관리자 화면이 실제로 그 칸들을 채운다 — jsdom에서 눌러 본다

   ⚠ **네트워크를 타지 않는다.** 하나투어가 잠깐 느리면 빨간 줄이 뜨고, 그러면
     사람이 스위트를 안 믿게 된다(WJ에서 세운 규칙). 실측은 `hanatour_sample.js`가 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const H = require(path.join(ROOT, 'api', '_lib', 'hanatour.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WL 하나투어 읽기 정확도`);
  process.exit(fail ? 1 : 0);
};

const LIB = read('api/_lib/hanatour.js');
const ADMIN = read('admin.html');

console.log('\n[1] HTML이 섞인 문구 — 태그는 지우되 글자는 안 잃는다');
{
  ok('① 태그를 지운다', H.stripHtml('<b>왕복항공권</b>') === '왕복항공권');
  /* 🔴 `<br/>`을 그냥 지우면 두 문장이 붙는다 — 실제로 오는 값이다 */
  ok('① 🔴 <br/>은 공백이 된다 (문장이 안 붙는다)',
    H.stripHtml('앞문장<br/>뒷문장') === '앞문장 뒷문장',
    JSON.stringify(H.stripHtml('앞문장<br/>뒷문장')));
  ok('① <font color=red>도 벗긴다',
    H.stripHtml('<font color=red>확인하세요</font>') === '확인하세요');
  ok('① 실체참조를 되돌린다', H.stripHtml('A&amp;B&nbsp;C') === 'A&B C');
  ok('① null·undefined에도 안 죽는다', H.stripHtml(null) === '' && H.stripHtml(undefined) === '');
}

console.log('\n[2] 포함/불포함 한 줄 만들기 — 실제로 오는 모양으로 잰다');
{
  /* 실측 그대로의 입력. 「대충 비슷한 것」으로 짜면 되돌려도 통과하는 검사가 된다. */
  const incl = [
    { trvlExpnClstNm: '[교통]', trvlExpnDesc: '<b>공항 미팅</b> : 1일차 공항→호텔 편도 픽업서비스 제공<br/>' },
    { trvlExpnClstNm: '[교통]', trvlExpnDesc: '<b>왕복항공권</b>' },
    { trvlExpnClstNm: '[교통]', trvlExpnDesc: '<b>왕복항공권</b>' },   /* 중복 */
    { trvlExpnClstNm: '[관광]', trvlExpnDesc: '' },                   /* 빈 항목 */
  ];
  const lines = H.expenseLines(incl, 40);
  ok('② 제목과 설명을 갈라 붙인다',
    lines[0] === '[교통] 공항 미팅 — 1일차 공항→호텔 편도 픽업서비스 제공',
    JSON.stringify(lines[0]));
  ok('② 설명이 없으면 제목만', lines[1] === '[교통] 왕복항공권', JSON.stringify(lines[1]));
  ok('② 🔴 빈 항목은 버린다 (견적서에 빈 줄이 찍히면 안 된다)',
    lines.length === 2, JSON.stringify(lines));
  ok('② 같은 줄은 한 번만', lines.filter((s) => /왕복항공권/.test(s)).length === 1);
  /* ⚠ 분류를 버리면 「기타 : 가격문의」가 뜻 없는 한 줄이 된다 */
  ok('② 분류를 버리지 않는다', /^\[교통\]/.test(lines[0]));
  ok('② 배열이 아니어도 안 죽는다', H.expenseLines(null).length === 0);
}

console.log('\n[3] 사진 — https만 (VZ 규칙: 화면이 <img src>에 그대로 쓴다)');
{
  const pick = (u) => H.firstImage([{ rprsProdCntntUrlAdrs: u }]);
  ok('③ https는 받는다', pick('https://image.hanatour.com/a.jpg') === 'https://image.hanatour.com/a.jpg');
  ok('③ 🔴 http는 거부한다', pick('http://image.hanatour.com/a.jpg') === null);
  ok('③ 🔴 javascript:는 거부한다', pick('javascript:alert(1)') === null);
  ok('③ 🔴 따옴표가 든 주소는 거부한다', pick('https://a.com/"onerror="alert(1)') === null);
  ok('③ 없으면 null', H.firstImage([]) === null);
  /* 첫 https를 고른다 — 앞에 못 쓰는 것이 있어도 넘어간다 */
  ok('③ 앞에 못 쓰는 것이 있으면 다음 것을 본다',
    H.firstImage([{ rprsProdCntntUrlAdrs: 'javascript:x' }, { rprsProdCntntUrlAdrs: 'https://b.com/1.jpg' }])
      === 'https://b.com/1.jpg');
}

console.log('\n[4] 금액 확인일 — 하나투어가 마지막으로 고친 날');
{
  ok('④ 202608241608 → 2026-08-24', H.ymdOfDttm('202608241608') === '2026-08-24');
  ok('④ 모양이 다르면 비운다 (짐작하지 않는다)', H.ymdOfDttm('2026-08') === null);
  ok('④ 없으면 null', H.ymdOfDttm(null) === null);
}

console.log('\n[4-b] WU — 일정도 HTML을 벗긴다 · 상품명에서 태그를 가른다');
{
  /* 🔴 일정은 **고객 견적서에 그대로 나가는 글**인데 HTML을 안 벗기고 있었다.
     표본 100건(일정 473줄)에서 실제로 나온 값이다:
       「▶ 황산의 하이라이트 서해대협곡<BR> 서쪽의 구름바다를…」
     포함/불포함은 처음부터 벗기고 있었으니(WL) **같은 성격의 값을 두 자리에서
     다르게 다루고 있던 것**이다. */
  const line = H.dayLine({
    schdMainInfoList: [
      { schdCatgNm: '관광지', cardNm: '서해대협곡<BR> 서쪽의 구름바다' },
      { schdCatgNm: '식사', mealTypeNm: '호텔식&nbsp;' },
      { schdCatgNm: '호텔', cardNm: '<b>서해 호텔</b>(5성)' },
    ],
  });
  ok('④b 일정에서 태그를 벗긴다', !/<[a-z/]|&nbsp;/i.test(line), JSON.stringify(line));
  ok('④b 🔴 <BR>이 공백이 되어 글자가 안 붙는다', /서해대협곡 서쪽의/.test(line), JSON.stringify(line));
  ok('④b 호텔 이름도 벗긴다', /숙박: 서해 호텔\(5성\)/.test(line), JSON.stringify(line));

  /* 상품명 — 표본 100건 중 99건이 해시태그 범벅이다 */
  const t1 = H.splitTitleTags('방콕 자유여행 5일 #이비스 스타일스 실롬 #위치BEST');
  ok('④b 제목은 첫 # 앞까지', t1.title === '방콕 자유여행 5일', JSON.stringify(t1.title));
  ok('④b 뺀 태그를 버리지 않는다', t1.tags.length === 2 && /이비스/.test(t1.tags[0]), JSON.stringify(t1.tags));
  ok('④b 태그가 없으면 그대로', H.splitTitleTags('오키나와 3박4일').title === '오키나와 3박4일');
  /* ⚠ 자르면 너무 짧아지는 것은 **원문을 지킨다** — 짐작해서 망가뜨리지 않는다 */
  const t2 = H.splitTitleTags('도쿄 #호텔');
  ok('④b 🔴 자른 결과가 너무 짧으면 원문 유지', t2.title === '도쿄 #호텔' && t2.tags.length === 0,
    JSON.stringify(t2));
}

console.log('\n[5] 소스 규칙 — 되돌리면 여기서 걸린다');
{
  /* 🔴 박·일수: 하나투어 값이 이긴다 */
  ok('⑤ trvlDayCnt / trvlNgtCnt를 읽는다',
    /Number\(P\.trvlDayCnt\)/.test(LIB) && /Number\(P\.trvlNgtCnt\)/.test(LIB));
  ok('⑤ 🔴 그 값이 일정 줄 수보다 **먼저**다',
    /const dayTotal = dayCnt \|\| itinerary\.length/.test(LIB));
  ok('⑤ 일정으로 셌으면 그 사실을 말한다',
    /durationFrom === 'itinerary'/.test(LIB) && /박·일수를 하나투어가 안 알려줘/.test(LIB));

  /* 🔴 검산식에 유류가 들어 있다 — 빼면 없는 결함이 24건 생긴다 */
  ok('⑤ 🔴 검산은 상품가+제세+**유류** = 총액',
    /const sum = \(priceParts\.base \|\| 0\) \+ \(priceParts\.tax \|\| 0\) \+ \(priceParts\.fuel \|\| 0\)/.test(LIB));
  ok('⑤ 그 실측 근거가 적혀 있다', /표본 30건 전수/.test(LIB));
  /* ⚠ 뜻을 모르는 깃발로 경고를 만들지 않는다 */
  ok('⑤ bafInclYn으로는 경고하지 않는다',
    !/warnings\.push\([^)]*유류할증료 표기가 엇갈/.test(LIB));

  /* 포함/불포함이 실제로 row에 실린다 */
  ok('⑤ included / excluded를 채운다',
    /included: included\.length \? included : null/.test(LIB)
    && /excluded: excluded\.length \? excluded : null/.test(LIB));
  /* ⚠ 선택경비는 불포함 쪽에 「(선택)」을 붙여 넣는다 */
  ok('⑤ 선택경비는 (선택)을 달아 불포함에 넣는다',
    /trvlChcExpnList[\s\S]{0,200}\(선택\) /.test(LIB));
  ok('⑤ 못 채운 칸 목록에 새 칸들이 들어 있다',
    /missing\.push\('포함사항'\)/.test(LIB) && /missing\.push\('사진'\)/.test(LIB)
    && /missing\.push\('금액 확인일'\)/.test(LIB));
}

console.log('\n[6] 🔴 관리자 화면이 실제로 그 칸을 채운다 — jsdom에서 눌러 본다');
{
  const dom = new JSDOM(ADMIN, {
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

  const ROW = {
    title: '방콕 자유여행 5일', destLabel: '방콕', nights: 3, days: 5,
    departDate: '2026-11-01', pricePerPerson: 639000, sourceCode: 'AAB261261101TWA',
    priceAsOf: '2026-08-24', imageUrl: 'https://image.hanatour.com/a.jpg',
    included: ['[교통] 왕복항공권', '[숙박] 숙박비'],
    excluded: ['[기타] 기타 — 가격문의', '(선택) [숙박] 객실 1인 사용료'],
    itinerary: [{ day: 1, title: '11/01(일)', am: '인천 · 방콕' }],
    priceParts: { base: 559000, tax: 80000, fuel: 0, total: 639000, singleAddNote: null },
  };

  const finish = async () => {
    if (typeof w.pkgReadHanatour !== 'function') {
      fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    w.fetch = () => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ ok: true, row: ROW, missing: [], warnings: [], notProvided: [] }),
    });
    /* 목적지 select를 요율표대로 채워 둔다 — 화면이 여는 순서 그대로다 */
    if (typeof w.pkgFillDestSelect === 'function') w.pkgFillDestSelect();
    d.getElementById('pkgHtUrl').value = 'https://www.hanatour.com/trp/pkg/X?pkgCd=AAB261261101TWA';
    /* 🔴 「빈 칸만 채운다」를 재려면 **하나는 미리 적어 둬야** 한다 */
    d.getElementById('pkgTitle').value = '사람이 적어 둔 제목';
    await w.pkgReadHanatour();

    const v = (id) => String((d.getElementById(id) || {}).value || '');
    ok('⑥ 포함사항이 채워졌다', v('pkgIncl').includes('왕복항공권'), JSON.stringify(v('pkgIncl')).slice(0, 60));
    ok('⑥ 불포함사항이 채워졌다', v('pkgExcl').includes('가격문의'));
    ok('⑥ 선택경비가 (선택)으로 갈려 들어갔다', v('pkgExcl').includes('(선택)'));
    ok('⑥ 사진이 채워졌다', v('pkgImage') === 'https://image.hanatour.com/a.jpg');
    ok('⑥ 금액 확인일이 채워졌다 (오늘이 아니라 그쪽이 밝힌 날)', v('pkgAsOf') === '2026-08-24');
    ok('⑥ 박수는 하나투어 값 3', v('pkgNights') === '3');
    ok('⑥ 일수는 5', v('pkgDays') === '5');
    /* 🔴 사람이 적어 둔 값은 안 덮는다 — PDF 경로와 같은 규칙이다 */
    ok('⑥ 🔴 이미 적힌 칸은 그대로 둔다', v('pkgTitle') === '사람이 적어 둔 제목');
    ok('⑥ 그리고 그것을 말한다', /그대로 둔 칸/.test(d.getElementById('pkgHtMsg').textContent));
    /* 요율표에 있는 목적지면 골라 준다 */
    ok('⑥ 요율표 목적지를 골라 준다', v('pkgDest') === '방콕', JSON.stringify(v('pkgDest')));
    /* 금액 구성을 화면이 말한다 — 유류가 들어 있어야 한다 */
    ok('⑥ 금액 구성에 유류할증료가 있다',
      /유류할증료/.test(d.getElementById('pkgHtMsg').textContent));

    /* ⚠ 경고가 오면 **빨갛게, 먼저** 읽혀야 한다 */
    d.getElementById('pkgIncl').value = '';
    w.fetch = () => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        ok: true, row: ROW, missing: [],
        warnings: ['금액 구성이 총액과 안 맞습니다 — 그쪽 응답이 바뀌었을 수 있습니다.'],
        notProvided: [],
      }),
    });
    await w.pkgReadHanatour();
    const msg = d.getElementById('pkgHtMsg');
    ok('⑥ 🔴 확인 필요를 그 자리에서 말한다', /확인 필요/.test(msg.textContent));
    ok('⑥ 그리고 빨갛다', msg.style.color === 'rgb(185, 28, 28)' || /B91C1C/i.test(msg.style.color),
      msg.style.color);

    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

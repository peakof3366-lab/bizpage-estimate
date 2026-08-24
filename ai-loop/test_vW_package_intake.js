/* ═══════════════════════════════════════════════════════════════════════════
   VW — 공급사 자료 투입: **형태와 무관한 단일 출처**와, 조용한 오늘 날짜 막기
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「소규모 견적은 하나투어에서 정보를 빼와 DB를 구축하고 싶다.」
   자료 형태(PDF · 엑셀 · 피드)는 대표가 하나투어에 확인 중이다. 어느 쪽이 되든
   「읽는 법」만 다르고 **「행으로 만드는 규칙」은 같으므로** 그 규칙을 한 곳에 뒀다.

   ■ 🔴 이 검사가 지키는 가장 비싼 것 — 조용한 오늘 날짜

   예전 투입기는 문서에 작성일이 없으면 `new Date()`를 넣었다. `note`에 경고를
   적었지만 **화면·고객 견적서·「N일 전 금액」 배지가 읽는 것은 `note`가 아니라
   `price_asof`다.** 실측: 코퍼스 38건 중 **28건**이 그 경로였다. 결과는:
     · 「N일 전 금액」 배지가 7일간 안 뜬다 — 우리가 확인한 적이 없는데도
     · 고객 견적서에 「금액 확인일 (투입한 날)」이 찍힌다 — 확인한 적 없는 날짜
     · 우리는 대리점이라 그 문서가 분쟁 때 **우리 쪽 근거**로 쓰인다
   VP가 `price_asof not null`을 「유일한 안전장치」로 세웠는데 자동화가 그것을
   오늘 날짜로 우회한 셈이다(결함 생성기 ②).
   → 기본은 **만들지 않는다.** 오늘로 채우려면 부르는 쪽이 `assumeToday`를 명시한다.

   ■ 그리고 DB 기본값에 기대던 것도 막았다

   예전 INSERT는 `kind`·`price_basis`를 안 적고 컬럼 기본값에 맡겼다. 기본값이
   바뀌면 투입분이 **조용히 1회용(adhoc)**이 되거나 그 반대가 된다 —
   adhoc은 고객 목록에 안 뜨므로 「투입했는데 아무것도 안 보인다」가 된다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const R = require('./_package_rows');
const IMP = read('ai-loop/import_packages.js');
const LIB = read('ai-loop/_package_rows.js');

/* 온전한 입력 하나 — 여기서 한 칸씩 빼며 무엇이 걸리는지 본다 */
const GOOD = {
  id: 'hana-oki-1',
  title: '오키나와 3박4일',
  destKey: '오키나와',
  nights: 3, days: 4,
  departDate: '2026-10-11',
  pricePerPerson: 1190000,
  priceAsOf: '2026-08-20',
  itinerary: [{ day: 1, title: '출발' }, { day: 2, title: '북부' }],
  origin: '테스트',
};

console.log('\n[1] 🔴 금액 확인일을 오늘로 조용히 채우지 않는다');
{
  const noDate = Object.assign({}, GOOD, { priceAsOf: null });
  const r = R.buildPackageRow(noDate, { today: '2026-08-24' });
  ok('① 작성일이 없으면 만들지 않는다', r.ok === false, JSON.stringify(r.row || {}).slice(0, 60));
  ok('① 왜 못 만들었는지 말한다', /금액 확인일을 만들 수 없다/.test(r.why || ''), r.why);
  ok('① 「확인일만 있으면 되는 건」이라고 표시한다', r.needsAsOf === true);

  /* 명시하면 만든다 — 다만 note가 그 사실을 밝혀야 한다 */
  const forced = R.buildPackageRow(noDate, { assumeToday: true, today: '2026-08-24' });
  ok('① assumeToday를 명시하면 만든다', forced.ok === true);
  ok('① 그때 확인일이 오늘이다', forced.ok && forced.row.priceAsOf === '2026-08-24', forced.ok && forced.row.priceAsOf);
  ok('① note가 「우리가 확인한 날이 아니다」라고 밝힌다',
    forced.ok && /우리가 확인한 날이 아닙니다/.test(forced.row.note), forced.ok && forced.row.note);
  ok('① 문서에서 온 것인지 아닌지를 구분해 남긴다',
    forced.ok && forced.row._asOfFromDoc === false);

  const good = R.buildPackageRow(GOOD, { today: '2026-08-24' });
  ok('① 작성일이 있으면 그것을 쓴다', good.ok && good.row.priceAsOf === '2026-08-20', good.ok && good.row.priceAsOf);
  ok('① 그때는 문서에서 왔다고 표시된다', good.ok && good.row._asOfFromDoc === true);
}

console.log('\n[2] 투입기가 그 정책을 우회하지 않는다');
{
  ok('② 투입기가 단일 출처를 쓴다', /require\('\.\/_package_rows'\)/.test(IMP));
  /* 🔴 예전 코드의 지문 — 이게 남아 있으면 정책을 우회하는 길이 살아 있는 것이다 */
  ok('② 투입기에 `new Date().toISOString()` 폴백이 없다',
    !/priceAsOf \? new Date/.test(IMP) && !/: new Date\(\)\.toISOString\(\)/.test(IMP),
    '오늘 날짜로 조용히 떨어지는 길이 남아 있다');
  ok('② --assume-today가 있어야 우회된다', /ASSUME_TODAY = argv\.includes\('--assume-today'\)/.test(IMP));
  ok('② 기본이 아니라는 것이 주석에 있다', /기본은 안 만든다/.test(IMP));
  ok('② 건너뛴 것을 두 갈래로 갈라 보여준다', /needsAsOf/.test(IMP) && /금액 확인일이 없어 만들지 않은 것/.test(IMP));
  ok('② 무엇을 하면 되는지 알려준다', /--assume-today\*\*를 붙이세요/.test(IMP));
}

console.log('\n[3] DB 기본값에 기대지 않는다');
{
  const r = R.buildPackageRow(GOOD, { today: '2026-08-24' });
  ok('③ kind를 명시한다(공급사 상품은 catalog)', r.ok && r.row.kind === 'catalog', r.ok && r.row.kind);
  ok('③ price_basis를 명시한다(대리점가)', r.ok && r.row.priceBasis === 'agency', r.ok && r.row.priceBasis);
  ok('③ INSERT가 두 칸을 함께 적는다', /kind, price_basis/.test(IMP));
  ok('③ 왜 기본값에 기대면 안 되는지가 적혀 있다',
    /기본값이 바뀌면 투입분이 조용히/.test(LIB + IMP));
}

console.log('\n[4] 항상 「작성중」이다 — 자동화가 고객 화면을 열지 않는다');
{
  const r = R.buildPackageRow(Object.assign({}, GOOD, { status: 'open' }), { today: '2026-08-24' });
  /* 🔴 입력이 open을 우겨도 무시해야 한다 — 피드가 「판매중」이라고 말해도 우리가 확인 전이다 */
  ok('④ 입력이 open을 우겨도 draft로 만든다', r.ok && r.row.status === 'draft', r.ok && r.row.status);
  ok('④ 왜 항상 draft인지가 적혀 있다', /항상 `draft`다/.test(LIB));
}

console.log('\n[5] 없는 것을 지어내지 않는다');
{
  const cases = [
    ['상품명', Object.assign({}, GOOD, { title: '' }), /상품명/],
    ['1인당 금액', Object.assign({}, GOOD, { pricePerPerson: 0 }), /금액/],
    ['출발일', Object.assign({}, GOOD, { departDate: null }), /출발일/],
  ];
  cases.forEach(([what, input, re]) => {
    const r = R.buildPackageRow(input, { today: '2026-08-24' });
    ok('⑤ ' + what + '이 없으면 만들지 않고 이유를 말한다', r.ok === false && re.test(r.why || ''), r.why);
  });
  /* 음수·문자열 금액도 막는다 */
  ok('⑤ 음수 금액을 막는다',
    R.buildPackageRow(Object.assign({}, GOOD, { pricePerPerson: -1 }), {}).ok === false);
  ok('⑤ 숫자가 아닌 금액을 막는다',
    R.buildPackageRow(Object.assign({}, GOOD, { pricePerPerson: '천만원' }), {}).ok === false);
}

console.log('\n[6] 여러 건 — 못 만든 것을 조용히 버리지 않는다');
{
  const out = R.buildPackageRows([
    GOOD,
    Object.assign({}, GOOD, { id: 'x2', priceAsOf: null }),
    Object.assign({}, GOOD, { id: 'x3', departDate: null }),
  ], { today: '2026-08-24' });
  ok('⑥ 만든 것 1건', out.rows.length === 1, String(out.rows.length));
  ok('⑥ 못 만든 것 2건을 함께 준다', out.skipped.length === 2, String(out.skipped.length));
  ok('⑥ 그중 하나는 「확인일만 있으면 되는 것」이다',
    out.skipped.filter((s) => s.needsAsOf).length === 1);
  ok('⑥ 어느 자료였는지 알 수 있다', out.skipped.every((s) => !!s.origin));
}

console.log('\n[7] 형태가 늘어도 규칙은 한 곳이다 — 다음 어댑터를 위한 계약');
{
  ok('⑦ 단일 출처가 buildPackageRow를 내보낸다', typeof R.buildPackageRow === 'function');
  ok('⑦ 묶음 처리도 내보낸다', typeof R.buildPackageRows === 'function');
  ok('⑦ PDF·엑셀·피드가 같은 규칙을 쓴다고 적혀 있다',
    /엑셀\/CSV · 피드\/API|엑셀·피드/.test(LIB));
  /* 어댑터가 늘 때 여기 목록을 늘리지 않도록, 어댑터 쪽에서 정책을 다시 쓰는지만 본다 */
  ok('⑦ 투입기가 draft를 스스로 정하지 않는다', !/status: 'draft'/.test(IMP),
    '어댑터가 정책을 다시 적고 있다');
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — VW 공급사 자료 투입`);
process.exit(fail ? 1 : 0);

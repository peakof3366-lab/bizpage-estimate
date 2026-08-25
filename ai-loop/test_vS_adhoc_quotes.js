/* ═══════════════════════════════════════════════════════════════════════════
   VS — 소규모 1회용 견적(adhoc): **패키지 흐름의 확장** 회귀 검사
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표 결정: 「관리자에서 일반 패키지 및 소규모 손님 견적을 별도로
   산출할 수 있게. 차후 버튼 하나로 고객이 쓰게 한다.」 · 권한은 **매니저 이상**.

   무엇을 지키는가 — 전부 **실측이나 이미 밟은 함정**이 만든 규칙이다:
     ① 🔴 **읽는 조건이 한 곳이다.** VR까지는 고객 목록(content.js)과 발급
        (quote-shares.js)이 각자 쿼리를 썼고, 「같은 조건으로 읽는다」는 주석만
        있었다. 조건이 한쪽만 바뀌면 **고객 화면에 안 보이는 상품의 견적서가
        링크로는 발급된다** — 결함 생성기 ①의 가장 비싼 형태다.
     ② 🔴 **1회용 견적은 고객 목록에 안 나가고, 발급에 관리자 인증이 붙는다.**
        목록에서 감추는 것은 노출 방지지 접근 통제가 아니다 — id를 아는 사람이
        공개 POST로 남의 손님 견적서를 뽑아 갈 수 있다.
     ③ 🔴 **staff가 kind를 빼고 저장해도 adhoc이 catalog로 안 바뀐다.** 들어온 값만
        보면 이 경로가 안 보인다(기본값이 catalog다).
     ④ **항목을 조립했으면 그 합이 이긴다.** 저장할 때도 발급할 때도 다시 구한다 —
        저장된 총액을 믿으면 화면과 견적서가 다른 금액을 말한다.
     ⑤ **verdict가 갈린다.** 대리점가('package')와 담당자 조립('assembled')은
        신뢰의 성격이 다르다. 뭉치면 「검증된 견적서」를 셀 때 거짓이 섞인다.
     ⑥ **엔진 값을 조립 칸에 미리 채우지 않는다.** 소규모 구간에서 엔진이 실측 기준
        +21~42% 틀리는데, 값이 들어가 있으면 담당자는 그대로 저장한다.

   ⚠ 이 검사는 **DB에 붙지 않는다.** 대신 `_lib/packages.js`에 가짜 sql 태그를 넣어
     **실제로 나가는 쿼리 문자열**을 본다 — 소스 정규식만으로 끝내면 "조건이 있다"는
     알아도 "그 조건으로 부른다"는 모른다(결함 생성기 ③).
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

const PKG = require(path.join(ROOT, 'api/_lib/packages.js'));
const CONTENT = read('api/content.js');
const SHARES = read('api/quote-shares.js');
const ADMIN = read('admin.html');
const VIEW = read('estimate-view.html');
const MIG = read('ai-loop/db_migrate.js');
const LIB = read('api/_lib/packages.js');

/* 가짜 sql 태그 — 나간 쿼리를 그대로 붙잡는다 */
function fakeSql(rows) {
  const calls = [];
  const f = (strings, ...vals) => {
    calls.push({ q: strings.join(' ? '), vals });
    return Promise.resolve(rows || []);
  };
  f.calls = calls;
  return f;
}

(async () => {

console.log('\n[1] 🔴 읽는 조건이 한 곳이다 — 두 파일이 자기 필터를 만들지 않는다');
{
  /* 필터 쿼리의 지문. DELETE나 kind 조회 같은 다른 쿼리는 세지 않는다. */
  ok('① content.js에 패키지 필터 쿼리가 없다',
    !/where\s+status\s*=\s*'open'/.test(CONTENT), '자기 조건을 다시 썼다');
  ok('① quote-shares.js에 패키지 필터 쿼리가 없다',
    !/from packages/.test(SHARES), '자기 조건을 다시 썼다');
  ok('① 둘 다 _lib/packages를 쓴다',
    /require\('\.\/_lib\/packages'\)/.test(CONTENT) && /require\('\.\/_lib\/packages'\)/.test(SHARES));
  ok('① 왜 한 곳이어야 하는지가 적혀 있다',
    /안 보이는[\s\S]{0,20}상품의 견적서가 링크로는 발급/.test(LIB));
}

console.log('\n[2] 🔴 실제로 나가는 쿼리 — 소스가 아니라 호출 결과를 본다');
{
  const s1 = fakeSql();
  await PKG.listPublicPackages(s1);
  const q1 = s1.calls[0].q;
  ok('② 고객 목록이 kind=catalog로 거른다', /kind\s*=\s*'catalog'/.test(q1), q1);
  ok('② 고객 목록이 status=open으로 거른다', /status\s*=\s*'open'/.test(q1));
  ok('② 고객 목록이 유효기간을 본다', /valid_until/.test(q1));

  const s2 = fakeSql();
  await PKG.getIssuablePackage(s2, 'x');
  const q2 = s2.calls[0].q;
  /* ⚠ 발급 쪽은 **일부러** kind를 안 따진다 — 1회용은 목록에 없지만 견적서는 나가야 한다.
     그게 존재 이유다. 여기에 kind='catalog'를 넣으면 기능이 통째로 죽는다. */
  ok('② 발급 조건은 kind를 따지지 않는다', !/kind\s*=/.test(q2), q2);
  ok('② 발급 조건도 판매중·기한은 본다', /status\s*=\s*'open'/.test(q2) && /valid_until/.test(q2));
  ok('② 발급은 id로 묶는다', /where\s+id\s*=/.test(q2));

  const s3 = fakeSql();
  await PKG.listAllPackages(s3);
  ok('② 관리자 목록은 아무것도 안 거른다(초안·마감·1회용까지 본다)',
    !/status\s*=/.test(s3.calls[0].q) && !/kind\s*=/.test(s3.calls[0].q));
}

console.log('\n[3] 🔴 1회용 견적은 관리자만 만들고 관리자만 발급한다');
{
  ok('③ 저장이 매니저 이상을 요구한다', /adhoc_requires_manager/.test(CONTENT));
  ok('③ 그 판정이 owner·manager만 통과시킨다',
    /\['owner', 'manager'\]\.includes\(req\.user && req\.user\.role\)/.test(CONTENT));
  /* ⚠ 들어온 kind만 보면 구멍이 남는다 — 기존 adhoc 행을 kind 없이 저장하면
     기본값 catalog로 덮여 고객 목록에 뜬다. */
  ok('③ 기존 adhoc 행을 건드리는 것도 매니저 이상이다',
    /wasAdhoc/.test(CONTENT) && /kind === 'adhoc' \|\| wasAdhoc/.test(CONTENT));
  ok('③ 종류 조회가 실패하면 통과시키지 않는다', /kind_check_failed/.test(CONTENT));
  ok('③ 발급이 adhoc에 관리자 인증을 건다',
    /=== 'adhoc'\)[\s\S]{0,200}requireAdmin/.test(SHARES));
  ok('③ 왜 감추는 것만으로 부족한지가 적혀 있다',
    /노출 방지지 접근 통제가 아니다/.test(SHARES + LIB));
  ok('③ 화면도 매니저 이상에게만 버튼을 보인다',
    /pkgNewAdhoc/.test(ADMIN) && /btnNewAdhoc[\s\S]{0,120}isManagerUp/.test(ADMIN));
}

console.log('\n[4] 항목의 합이 이긴다 — 일부러 어긋나게 넣어 본다');
{
  /* 저장된 총액이 항목 합과 **다른** 행을 만들어 무엇을 믿는지 본다 */
  const broken = {
    price_per_person: 9999999,
    line_items: [{ label: '항공', amount: 620000 }, { label: '호텔', amount: 380000 }],
  };
  ok('④ 항목이 있으면 저장된 총액을 무시한다', PKG.perPersonOf(broken) === 1000000,
    '나온 값 ' + PKG.perPersonOf(broken));
  ok('④ 항목이 없으면 저장된 총액을 쓴다', PKG.perPersonOf({ price_per_person: 1190000 }) === 1190000);
  ok('④ 항목이 견적서 줄로 그대로 나간다',
    JSON.stringify(PKG.shareRowsOf(broken)) === JSON.stringify([['항공', 620000], ['호텔', 380000]]));
  ok('④ 항목이 없으면 한 줄짜리다',
    JSON.stringify(PKG.shareRowsOf({ price_per_person: 500 }, 'X')) === JSON.stringify([['X', 500]]));
  /* 망가진 항목은 조용히 0으로 떨어지지 않고 걸러진다 */
  const dirty = PKG.lineItemsOf({
    line_items: [{ label: '', amount: 1 }, { label: 'a', amount: 'zz' }, { label: 'b', amount: 7 }, 'nope', null],
  });
  ok('④ 이름 없는·숫자 아닌 항목은 걸러진다', dirty.length === 1 && dirty[0].amount === 7);
  ok('④ API가 전부 걸러졌을 때 거절한다', /invalid_line_items/.test(CONTENT));
  ok('④ 저장할 때 합으로 덮어쓴다', /lineItems\.length \? PKG\.perPersonOf/.test(CONTENT));
  ok('④ 발급할 때도 다시 구한다(저장값을 안 믿는다)', /const per = PKG\.perPersonOf\(p\)/.test(SHARES));
  ok('④ 금액이 깨졌으면 발급하지 않는다', /package_price_broken/.test(SHARES));
}

console.log('\n[5] verdict가 갈린다 — 대리점가와 담당자 조립은 성격이 다르다');
{
  ok('⑤ assembled verdict가 따로 있다', /verdict: assembled \? 'assembled' : 'package'/.test(SHARES));
  ok('⑤ 견적서가 어느 쪽인지 함께 싣는다', /basis: assembled \? 'assembled' : 'agency'/.test(SHARES));
  ok('⑤ 고객 화면 문구가 갈린다', /담당자 산출 금액/.test(VIEW));
  ok('⑤ 「금액 확인일」 라벨도 갈린다(조립가는 산출일이다)', /'산출일' : '금액 확인일'/.test(VIEW));
  ok('⑤ 왜 갈라야 하는지가 적혀 있다', /「검증된 견적서」를 셀 때 거짓이 섞인다/.test(SHARES));
}

console.log('\n[6] 스키마 — 축을 뭉치지 않았고, 예약어를 피했다');
{
  ok('⑥ kind 칸이 있다', /kind text not null default 'catalog'/.test(MIG));
  ok('⑥ price_basis 칸이 있다', /price_basis text not null default 'agency'/.test(MIG));
  ok('⑥ line_items 칸이 있다', /line_items jsonb/.test(MIG));
  /* ⚠ ROWS는 Postgres 키워드다. incl_items를 included로 안 지은 것과 같은 이유 */
  ok('⑥ 칸 이름이 rows가 아니다', !/^\s*rows jsonb/m.test(MIG));
  ok('⑥ 왜 rows가 아닌지가 적혀 있다', /ROWS는 Postgres 키워드/.test(MIG));
  /* 이미 만들어진 운영 DB(VP에서 실행 완료)에도 칸이 붙어야 한다 */
  for (const c of ['kind', 'price_basis', 'customer_label', 'line_items']) {
    ok('⑥ 기존 DB에 ' + c + ' 를 더한다',
      new RegExp('alter table packages add column if not exists ' + c).test(MIG));
  }
  ok('⑥ 옛 행의 뜻이 안 바뀐다(기본값이 catalog·agency다)',
    /기존 행은 전부 catalog·agency다/.test(MIG));
  ok('⑥ status에 얹지 않은 이유가 적혀 있다', /status에 얹지 않았다/.test(MIG));
}

console.log('\n[7] 기한 — 1회용 견적이 옛 값으로 남지 않는다');
{
  ok('⑦ 기본 유효기간이 정해져 있다', PKG.ADHOC_DEFAULT_VALID_DAYS === 14);
  ok('⑦ API가 안 넣었을 때 채운다', /ADHOC_DEFAULT_VALID_DAYS \* 86400000/.test(CONTENT));
  ok('⑦ 담당자가 넣은 값이 이긴다', /!validUntil && kind === 'adhoc'/.test(CONTENT));
  ok('⑦ 왜 필요한지가 적혀 있다', /항공가 변동이 그대로 손실/.test(CONTENT + LIB));
}

console.log('\n[8] 화면 — 엔진 값을 미리 채우지 않고, 상태를 말한다');
{
  ok('⑧ 조립 칸에 엔진 값을 미리 채우지 않는다', /엔진 값을 여기 미리 채우지 않는다/.test(ADMIN));
  /* WE로 문구가 「소규모 견적」 탭으로 옮겨 갔다. 줄바꿈이 끼므로 공백을 헐겁게 본다 —
     **여기서 재는 것은 자리가 아니라 「근거가 화면에 적혀 있는가」**다. */
  ok('⑧ 그 근거(+21~42%)와 표본 2건이 화면에 적혀 있다',
    /\+21~42%/.test(ADMIN) && /표본이\s+<b>2건<\/b>/.test(ADMIN));
  ok('⑧ 1회용은 고객 목록에 안 나간다고 화면이 말한다',
    /고객 목록\(패키지 여행\)에는 절대 나가지 않고/.test(ADMIN));
  ok('⑧ 발급이 막히면 이유를 말한다',
    /pkgIssueGate/.test(ADMIN) && /「판매중」 상태에서만 발급/.test(ADMIN));
  ok('⑧ 발급이 금액을 안 보낸다(id와 인원만)',
    /packageId: pkgEditing, pax: pax/.test(ADMIN) && /금액을 보내지 않는다/.test(ADMIN));
  /* 🔴 **WE에서 더 세게 갈렸다** — 예전에는 한 목록에 섞고 종류 필터로 갈랐는데,
     소규모 견적은 손님 수만큼 늘어나므로 그러면 시간이 갈수록 상품이 파묻힌다.
     이제 **탭이 곧 종류**다. 종류 필터는 없앴다(탭 안에서 다른 종류를 고르면
     빈 목록만 보이는 상태가 만들어진다). */
  ok('⑧ 목록이 종류를 갈라 보여준다',
    !/pkgFilterKind/.test(ADMIN)
    && /kind: 'catalog', box: 'pkgList'/.test(ADMIN)
    && /kind: 'adhoc',\s+box: 'adhocList'/.test(ADMIN));
  ok('⑧ 두 목록이 서로의 종류를 안 보여준다',
    /pkgAll\.filter\(p => \(p\.kind \|\| 'catalog'\) === view\.kind\)/.test(ADMIN));
  /* 낡은 금액 배지는 패키지 상품만 센다 — 1회용까지 세면 늘 켜져 있어 아무도 안 본다 */
  ok('⑧ 낡은 금액 배지가 1회용을 세지 않는다',
    /\(p\.kind \|\| 'catalog'\) === 'catalog'[\s\S]{0,90}PKG_STALE_DAYS/.test(ADMIN));
}

console.log('\n[9] 기존 방어선이 살아 있다 — 이번 변경으로 안 뚫렸다');
{
  ok('⑨ 패키지 화면은 여전히 엔진을 안 싣는다',
    !/<script[^>]+src=["']script\.js["']/.test(read('packages.html')));
  /* ⚠ 파일 전체에서 세면 안 된다 — 맞춤 견적 경로는 verifyQuote를 **불러야** 한다.
     패키지 함수 **본문만** 잘라서 본다. 이 구분을 놓치면 검사가 늘 빨갛고,
     늘 빨간 검사는 곧 아무도 안 보는 검사가 된다. */
  {
    const i = SHARES.indexOf('async function issuePackageShare');
    const j = SHARES.indexOf('module.exports', i);
    const body = i >= 0 && j > i ? SHARES.slice(i, j) : '';
    ok('⑨ 패키지 함수 본문이 verifyQuote를 안 부른다', !!body && !/verifyQuote\(/.test(body));
    ok('⑨ 맞춤 견적 경로는 여전히 verifyQuote를 부른다', /verifyQuote\(/.test(SHARES));
  }
  ok('⑨ 금액 확인일은 여전히 필수다', /price_asof_required/.test(CONTENT));
  ok('⑨ 마감·기한 지난 상품은 여전히 발급 안 된다',
    /status = 'open'/.test(LIB) && /valid_until is null or valid_until >= current_date/.test(LIB));
}

console.log('\n' + '─'.repeat(64));
/* ⚠ 「결과:」로 시작해야 `run_all_tests.js`가 집계한다 — 이 접두어가 없으면
   스위트가 **크래시로 세고**, 그 파일의 pass는 합계에 들어가지 않는다. */
console.log(`결과: ${pass} pass / ${fail} fail  — VS 소규모 1회용 견적`);
process.exit(fail ? 1 : 0);

})().catch((e) => { console.error(e); process.exit(1); });

/* ═══════════════════════════════════════════════════════════════════════════
   VP — 패키지 상품: **견적 엔진을 타지 않는 두 번째 흐름** 회귀 검사
   ───────────────────────────────────────────────────────────────────────────
   2026-08-21 대표 결정: 「가격도 그대로 가져온다. 우리가 하나투어 대리점이라
   그 가격 그대로 받아 견적서화만 하면 된다.」

   무엇을 지키는가 — 전부 **실측이 만든 규칙**이다:
     ① 🔴 **패키지 화면이 견적 엔진을 안 싣는다.** 실으면 누군가 계수를 얹고 싶어지고,
        그러면 원본보다 비싸진다 — 코퍼스 실측 2건에서 **+21.5% · +41.7%**였고,
        사양을 가장 싸게 돌려도 +15.7% · +33.2%까지밖에 안 내려간다(VM).
     ② **「금액 확인일」이 없으면 저장이 안 된다.** 스키마 not null + API 거절 + 화면 안내
        셋이 같은 규칙을 말해야 한다. 우리는 대리점이라 낡은 값으로 팔면 그대로 손해다.
     ③ **거르는 일은 서버가 한다.** 고객 GET은 판매중·기한 안 지난 것만 준다 —
        화면에서 거르면 화면을 안 거치는 경로가 반드시 생긴다.
     ④ **`excluded`를 컬럼 이름으로 쓰지 않는다.** Postgres `ON CONFLICT`의 예약 별칭과
        겹친다(처음에 그렇게 지었다가 upsert에서 걸렸다).
     ⑤ 공개 입력 신뢰 금지 — 인라인 onclick에 값을 끼워 넣지 않는다(결함 생성기 ④).

   ⚠ 이 검사는 **DB에 붙지 않는다.** 마이그레이션은 아직 실행 전이고(승인 대기),
     실행 여부와 무관하게 규칙은 지켜져야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const PKG = read('packages.html');
const ADMIN = read('admin.html');
const API = read('api/content.js');
const MIG = read('ai-loop/db_migrate.js');
/* VS에서 **읽는 조건이 `_lib/packages.js` 한 곳으로 옮겨졌다.** 규칙은 그대로고
   사는 곳만 바뀌었으므로, 여기서 보는 자리도 함께 옮긴다.
   ⚠ 옛 자리를 계속 보면 「조건이 사라졌다」로 잘못 읽힌다 — 실제로는 단일 출처가 된 것이다. */
const LIB = read('api/_lib/packages.js');
/* VW에서 **투입 규칙**(항상 draft · 금액 확인일 정책 · kind/basis)이 여기로 모였다.
   자료 형태(PDF·엑셀·피드)마다 다시 쓰지 않기 위함이다 — 투입기는 「읽는 어댑터」가 됐다.
   ⚠ 그래서 아래 ⑨의 몇 줄은 **import_packages.js가 아니라 이 파일**을 봐야 한다. */
const INTAKE = read('ai-loop/_package_rows.js');

console.log('\n[1] 🔴 패키지 흐름이 견적 엔진을 타지 않는다');
{
  /* ⚠ 이것이 이 기능의 **핵심 방어선**이다. script.js를 싣는 순간 계수를 얹을 수 있게 되고,
     그러면 실측이 경고한 +21.5%·+41.7%가 그대로 재현된다. */
  ok('① packages.html이 script.js를 싣지 않는다',
    !/<script[^>]+src=["']script\.js["']/.test(PKG), '견적 엔진이 실렸다');
  ok('① packages.html이 data.js(요율표)를 싣지 않는다',
    !/<script[^>]+src=["']data\.js["']/.test(PKG));
  ok('① 왜 안 싣는지가 파일에 적혀 있다', /견적 엔진을 부르지 않는다|엔진을 타지 않는다/.test(PKG));
  ok('① 실측 근거(+21.5%·+41.7%)가 적혀 있다',
    /\+21\.5%/.test(PKG + ADMIN + API + MIG) && /\+41\.7%/.test(PKG + ADMIN + API + MIG));
  /* 관리자 화면에도 같은 경고가 있어야 한다 — 거기서 요율 칸을 추가하고 싶어질 자리다 */
  ok('① 관리자 패키지 탭이 「요율·계수·마진이 안 붙는다」고 말한다',
    /요율표·계수·마진이 붙지 않습니다|요율·계수·마진이 없다|요율·계수·마진이 하나도 안 붙는다/.test(ADMIN));
}

console.log('\n[2] 「금액 확인일」 — 세 곳이 같은 규칙을 말한다');
{
  ok('② 스키마가 not null이다', /price_asof timestamptz not null/.test(MIG));
  ok('② API가 없으면 거절한다', /price_asof_required/.test(API));
  ok('② 화면이 먼저 안내한다', /금액 확인일/.test(ADMIN));
  /* ⚠ **새 상품에 오늘 날짜를 미리 채우면 안 된다.** 미리 채우면 확인도 안 한 날짜가
     그대로 저장되고, 이 칸이 무의미해진다. */
  ok('② 새 상품에 확인일을 미리 채우지 않는다', /오늘로 미리 채우지 않는다/.test(ADMIN));
  ok('② 왜 필요한지(대리점가라 낡으면 손해)가 적혀 있다',
    /대리점이라.{0,40}팔아야|낡은 값이 견적서로 나가면/.test(MIG + API + ADMIN));
  /* 고객 화면이 조회 시점을 실제로 보여줘야 한다 — 안 보여주면 낡은지 아무도 모른다 */
  ok('② 고객 화면이 priceAsOf를 쓴다', /priceAsOf/.test(PKG));
  ok('② 오래된 금액을 화면이 다르게 표시한다', /stale/.test(PKG));
}

console.log('\n[3] 거르는 일은 서버가 한다');
{
  ok('③ 공개 GET이 판매중만 준다', /where status = 'open'/.test(LIB));
  ok('③ 기한 지난 것을 서버가 뺀다', /valid_until is null or valid_until >= current_date/.test(LIB));
  /* 그리고 API가 **그 함수를 실제로 부르는지**까지 본다 — 조건이 어딘가 있는 것과
     그 조건으로 부르는 것은 다른 이야기다(결함 생성기 ③). */
  ok('③ 공개 GET이 그 단일 출처를 부른다', /PKG\.listPublicPackages\(sql\)/.test(API));
  ok('③ 관리자만 전부 본다(all=1에 권한 검사)',
    /wantAll[\s\S]{0,200}requireRole\(req, res, \['owner', 'manager', 'staff'\]\)/.test(API));
  /* ⚠ 화면에서 또 거르면 규칙이 두 곳이 되고, 어느 쪽이 진실인지 알 수 없어진다 */
  ok('③ 고객 화면이 또 거르지 않는다고 적어 뒀다', /화면에서 또 거르지 않는다/.test(PKG));
  ok('③ 마감 방어 이유가 적혀 있다', /마감된 상품으로 견적서가 나가면/.test(API + MIG));
}

console.log('\n[4] Postgres 예약 별칭과 겹치지 않는다');
{
  /* ⚠ ON CONFLICT DO UPDATE에서 `excluded`는 「들어오려던 행」의 예약 별칭이다.
     컬럼 이름을 그것과 같게 지으면 `excluded = excluded.excluded`가 된다. */
  ok('④ 컬럼 이름이 excluded가 아니다',
    !/^\s*excluded jsonb/m.test(MIG) && /excl_items jsonb/.test(MIG));
  ok('④ included도 함께 바꿨다', /incl_items jsonb/.test(MIG));
  ok('④ upsert가 그 이름을 쓴다', /excl_items = excluded\.excl_items/.test(API));
  ok('④ 왜 그렇게 지었는지가 적혀 있다', /예약 별칭|예약된 별칭/.test(MIG));
}

console.log('\n[5] 공개 입력을 신뢰하지 않는다');
{
  /* 결함 생성기 ④ — 인라인 onclick 안의 JS 문자열은 esc()로 못 막는다 */
  ok('⑤ 고객 화면에 값을 끼운 인라인 onclick이 없다',
    !/onclick="[^"]*\+/.test(PKG) && !/onclick='[^']*\+/.test(PKG));
  ok('⑤ 고객 화면이 esc()를 쓴다', /function \(s\) \{[\s\S]{0,80}replace\(\/\[&<>"'\]/.test(PKG) || /var esc =/.test(PKG));
  ok('⑤ 그 이유가 적혀 있다', /인라인 onclick/.test(PKG) && /인라인 onclick/.test(ADMIN));
  /* API 쪽 — id는 패턴으로, 가격은 숫자로 */
  ok('⑤ API가 id를 패턴으로 검사한다', /\^\[A-Za-z0-9_-\]\+\$/.test(API));
  ok('⑤ API가 가격을 숫자로만 받는다', /Number\.isFinite\(price\)/.test(API));
  ok('⑤ 0원 상품을 막는다', /price <= 0/.test(API));
  ok('⑤ 목적지를 아는 것만 받는다', /unknown_dest_key/.test(API));
}

console.log('\n[6] 화면이 실제로 그려진다 (jsdom)');
{
  const pd = new JSDOM(PKG).window.document;
  ['pkGrid', 'pkEmpty', 'pkFilters', 'pkModal', 'pkDetail', 'pkCount'].forEach((id) => {
    ok('⑥ packages.html #' + id, !!pd.getElementById(id));
  });
  ok('⑥ 본 사이트로 돌아가는 길이 있다', !!pd.querySelector('a[href="index.html"]'));
  /* ⚠ 디자인 토큰을 본 사이트와 공유해야 두 화면이 안 갈라진다 */
  ok('⑥ styles.css를 공유한다', !!pd.querySelector('link[href="styles.css"]'));

  const ad = new JSDOM(ADMIN).window.document;
  ok('⑥ 관리자 사이드바에 패키지 메뉴', !!ad.querySelector('.sidebar-item[data-tab="packages"]'));
  ok('⑥ 관리자 패널 tab-packages', !!ad.getElementById('tab-packages'));
  ['pkgNew', 'pkgList', 'pkgId', 'pkgTitle', 'pkgPrice', 'pkgAsOf', 'pkgStatus',
    'pkgSave', 'pkgDelete', 'pkgEditCard', 'sb-pkg-stale'].forEach((id) => {
    ok('⑥ 관리자 #' + id, !!ad.getElementById(id));
  });
  /* 탭 배선 — 버튼만 있고 renderTab에 안 걸리면 눌러도 아무 일이 없다(결함 생성기 ③) */
  ok('⑥ renderTab이 packages를 안다', /name==='packages'\) renderPackages\(\)/.test(ADMIN));
  /* VS에서 탭이 「패키지 · 소규모 견적」으로 넓어졌다(같은 탭 안에서 두 흐름을 다룬다) */
  ok('⑥ 탭 제목이 있다', /packages:'패키지 · 소규모 견적'/.test(ADMIN));
}

console.log('\n[7] 못 불러온 것을 「0건」으로 보여주지 않는다');
{
  /* ⚠ 실패를 빈 목록으로 그리면 담당자가 상품이 지워진 줄 알고 다시 만든다 */
  ok('⑦ 관리자 목록이 실패를 구분해 말한다', /「상품이 없다」는 뜻이 아닙니다/.test(ADMIN));
  ok('⑦ 고객 화면이 비어 있는 이유를 말한다', /지금 준비된 패키지 상품이 없습니다/.test(PKG));
  ok('⑦ 저장 실패 사유를 그대로 보여준다', /저장하지 못했습니다 — /.test(ADMIN));
}

console.log('\n[8] 서버리스 함수를 늘리지 않았다');
{
  /* Vercel Hobby = 12개 제한에 이미 도달해 있다. 새 파일을 만들면 배포가 깨진다. */
  const apiDir = path.join(ROOT, 'api');
  const count = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '_lib') walk(p); return; }
      if (e.name.endsWith('.js')) count.push(path.relative(apiDir, p));
    });
  })(apiDir);
  ok('⑧ 서버리스 함수가 12개 이하다', count.length <= 12, count.length + '개: ' + count.join(', '));
  ok('⑧ 패키지가 기존 파일에 ?action=으로 붙었다', /action === 'packages'/.test(API));
}

console.log('\n[9] PDF 일괄 투입 — 자동화가 판단을 대신하지 않는다 (VQ)');
{
  const IMP = read('ai-loop/import_packages.js');
  const M = require('./import_packages');

  /* ⚠ **기본이 dry-run이어야 한다.** 운영 DB에 쓰는 도구다 —
     실수로 한 번 돌리는 것과 폴더째 들어가는 것은 위험이 다르다. */
  ok('⑨ 기본이 dry-run이다', /const APPLY = argv\.includes\('--apply'\)/.test(IMP));
  ok('⑨ --apply 없이는 안 쓴다', /if \(!APPLY\) \{[\s\S]{0,200}return;/.test(IMP));

  /* 🔴 이것이 이 자동화의 **유일한 안전장치**다. 열려서 나가는 것은 사람이 정한다 —
     우리는 대리점이라 화면에 적힌 값으로 팔아야 하고, 낡은 값이면 차액을 우리가 문다. */
  /* VW: 규칙이 _package_rows.js로 옮겨졌다. **투입기에는 없어야 정상**이다 —
     어댑터가 정책을 다시 적으면 형태가 늘 때마다 사본이 늘어난다(test_vW ⑦이 그것을 막는다). */
  ok('⑨ 만드는 행이 항상 draft다', /status: 'draft'/.test(INTAKE) && !/status: 'open'/.test(INTAKE));
  ok('⑨ 투입기(어댑터)는 그 정책을 다시 적지 않는다', !/status: 'draft'/.test(IMP));
  ok('⑨ 왜 draft인지가 적혀 있다', /판매중으로 열지 않는다/.test(IMP));
  ok('⑨ 금액 확인일의 출처를 note에 남긴다', /문서의 작성일\('/.test(IMP) || /문서의 작성일/.test(IMP));
  ok('⑨ 작성일이 「뽑은 날」일 수 있다는 실측이 적혀 있다', /PDF로 뽑은 날/.test(IMP));

  /* ⚠ 이미 있는 행을 덮어쓰면 담당자가 손본 값이 조용히 사라진다 */
  ok('⑨ 이미 있으면 건드리지 않는다', /select 1 from packages where id = \$\{p\.id\}/.test(IMP));
  ok('⑨ 그 이유가 적혀 있다', /담당자가 손본 값을 덮어쓰면/.test(IMP));

  /* id가 흔들리면 「이미 있으면 건드리지 않는다」가 통째로 무력해진다 */
  ok('⑨ 같은 파일이면 같은 id가 나온다',
    M.idFrom('Hanatour 견적서_신선혜님(오키나와)_251121.pdf') === M.idFrom('Hanatour 견적서_신선혜님(오키나와)_251121.pdf'));
  ok('⑨ 다른 파일이면 다른 id가 나온다',
    M.idFrom('A(오키나와).pdf') !== M.idFrom('B(오키나와).pdf'));
  ok('⑨ id가 API 패턴을 통과한다', /^[A-Za-z0-9_-]+$/.test(M.idFrom('하나투어 견적서_홍길동님(오키나와)_251121.pdf')));

  /* ⚠ **없는 것을 지어내지 않는다.** 추출기가 오전/오후/저녁을 안 나눠 준 문서가 많은데,
     그럴듯하게 나누면 실제와 다른 「오후 일정」이 고객에게 나간다. */
  ok('⑨ 없는 시간대 구분을 지어내지 않는다', /없는 구분을 지어내지 않는다/.test(IMP));
  {
    const out = M.itineraryFrom({ days: [{ place: '나하', lines: ['도착', '석식'], meals: { b: '호텔식' }, hotel: 'X호텔' }] });
    ok('⑨ 뭉친 일정은 am에 담고 pm·eve를 비운다',
      out && out[0].am === '도착 / 석식' && out[0].pm === '' && out[0].eve === '');
    ok('⑨ 숙박·식사를 tip에 남긴다', out && /X호텔/.test(out[0].tip) && /조:호텔식/.test(out[0].tip));
  }
  ok('⑨ 일정이 없으면 null이다 (빈 배열로 속이지 않는다)', M.itineraryFrom({ days: [] }) === null);

  /* 제목도 지어내지 않는다 — 원본에 없는 말이 고객 화면에 나가면 안 된다 */
  ok('⑨ 제목을 지어내지 않는다', /이름을 지어내지 않는다/.test(IMP));
  {
    const t = M.titleFrom('오키나와 자유일정_251121.pdf', '오키나와', { nights: 3, days: 4 });
    ok('⑨ 확장자·날짜꼬리를 떼고 기간을 붙인다', t === '오키나와 자유일정 (3박 4일)', t);
  }

  /* 못 만든 것을 조용히 넘기지 않는다 — 왜 못 만들었는지 말해야 사람이 고친다 */
  ok('⑨ 못 만든 것의 이유를 말한다', /못 만든 것 ' \+ (skipped|other)\.length/.test(IMP));
  /* VW: 「확인일만 있으면 되는 것」과 「영영 못 읽는 것」을 갈라 보여준다 —
     사람이 할 일이 전혀 다르기 때문이다 */
  ok('⑨ 못 만든 것을 두 갈래로 가른다', /needsAsOf/.test(IMP));
  ok('⑨ 금액·출발일이 없으면 안 만든다',
    /1인당 금액을 못 읽었다/.test(IMP + INTAKE) && /출발일을 못 읽었다/.test(IMP + INTAKE));
  ok('⑨ require만으로 코퍼스를 안 읽는다',
    /require\.main === module/.test(IMP) && typeof M.idFrom === 'function');
}

console.log('\n[10] 패키지 견적서 — 값이 브라우저를 안 지난다 (VR)');
{
  const QS = read('api/quote-shares.js');
  const EV = read('estimate-view.html');

  /* 🔴 **이것이 이 경로의 핵심 방어다.** 위조를 막는 방법이 「검증」이 아니라
     「값이 요청에 없다」는 것이다 — 브라우저는 상품 id와 인원만 보낸다. */
  ok('⑩ 패키지 분기가 있다', /action === 'package'/.test(QS));
  ok('⑩ 상품 id와 인원만 받는다',
    /b\.packageId/.test(QS) && /b\.pax/.test(QS)
    && !/b\.price/.test(QS) && !/b\.total/.test(QS));
  /* VS: 저장된 총액을 그대로 쓰지 않고 **다시 구한다**(조립 항목이 있으면 그 합이 이긴다).
     어느 쪽이든 값의 출처가 DB라는 규칙은 그대로다. */
  ok('⑩ 금액을 DB에서 읽는다', /PKG\.perPersonOf\(p\)/.test(QS));
  ok('⑩ 총액을 서버가 곱한다', /t: per \* pax/.test(QS));
  ok('⑩ 왜 이렇게 했는지가 적혀 있다', /값이 브라우저를 아예 안 지나게 한다/.test(QS));
  /* 고객 화면도 금액을 안 보내야 한다 — 보내면 위 설계가 무의미해진다 */
  ok('⑩ 고객 화면이 금액을 안 보낸다',
    /packageId: p\.id, pax: pax/.test(PKG) && !/pricePerPerson: p\./.test(PKG));

  /* ⚠ verifyQuote를 부르면 엔진 값과 달라 매번 실패하고, 그 실패를 무시하는 코드가
     생기면 그게 곧 무검증 발급이 된다. 아예 안 부르는 것이 맞다. */
  {
    const fn = QS.slice(QS.indexOf('async function issuePackageShare'), QS.indexOf('module.exports'));
    ok('⑩ 패키지 발급이 verifyQuote를 부르지 않는다', !/verifyQuote\(/.test(fn));
    ok('⑩ 그 이유가 적혀 있다', /verifyQuote.{0,10}를 부르지 않는다/.test(QS));
  }
  /* 엔진 검증을 거친 것과 **구분**되어야 한다 — 같은 얼굴이면 나중에 셀 때 거짓이 섞인다 */
  ok('⑩ verdict가 package다', /verdict: 'package'/.test(QS));
  ok('⑩ 왜 그런지도 함께 남긴다', /엔진 대조 대상이 아니다/.test(QS));

  /* 고객 목록과 **같은 조건**으로 읽어야 한다 — 느슨하면 안 보이는 상품이 링크로 나간다 */
  {
    const fn = QS.slice(QS.indexOf('async function issuePackageShare'), QS.indexOf('module.exports'));
    /* VS: 조건이 `_lib/packages.js`로 옮겨졌다. 「조건이 있다」와 「그 조건으로 부른다」를
       둘 다 본다 — 하나만 보면 단일 출처로 옮긴 것과 조건이 사라진 것이 같은 얼굴이 된다. */
    ok('⑩ 판매중만 발급한다', /status = 'open'/.test(LIB));
    ok('⑩ 기한 지난 것은 발급 안 한다', /valid_until >= current_date/.test(LIB));
    ok('⑩ 발급이 그 단일 출처를 부른다', /PKG\.getIssuablePackage\(sql, pkgId\)/.test(fn));
    ok('⑩ 조회가 실패하면 발급하지 않는다', /package_lookup_failed/.test(fn));
    ok('⑩ 인원 범위를 막는다', /PKG_MAX_PAX/.test(QS) && /invalid_pax/.test(fn));
  }

  /* ⚠ 패키지 견적서가 맞춤 견적 기준 문구를 그대로 찍으면 **거짓말이 된다** */
  /* VS: 패키지 안에서 다시 「대리점가 / 담당자 산출」로 갈렸다. 맞춤 견적과 갈라야
     한다는 규칙은 그대로고, 갈래가 둘에서 셋이 된 것이다. */
  ok('⑩ 견적서가 패키지를 구분해 그린다', /패키지 상품가 · 포함\/불포함은 아래 참고/.test(EV));
  ok('⑩ 담당자 산출을 상품가와 구분해 그린다', /담당자 산출 금액 · 포함\/불포함은 아래 참고/.test(EV));
  ok('⑩ 「부대비용 미포함」을 패키지에 안 찍는다', /d\.pkg[\s\S]{0,220}: 'VAT 별도 · 부대비용 미포함'/.test(EV));
  ok('⑩ 금액 확인일을 견적서에 찍는다', /'산출일' : '금액 확인일'/.test(EV));
  ok('⑩ 포함·불포함을 견적서에 낸다', /d\.pkg\.included/.test(EV) && /d\.pkg\.excluded/.test(EV));
  ok('⑩ 견적서가 그 값들을 esc한다', /esc\(s\)/.test(EV));

  /* 실패 사유를 그대로 말한다 — 「실패」로 뭉뚱그리면 고객이 다시 누르기만 한다 */
  ok('⑩ 발급 실패 사유를 고객에게 말한다', /package_not_available/.test(PKG));

  const pd = new JSDOM(PKG).window.document;
  ok('⑩ 인원 입력이 화면에 있다', /id="pkPax"/.test(PKG));
  ok('⑩ 상세가 견적서로 이동한다', /estimate-view\.html\?id=/.test(PKG));
  ok('⑩ (렌더 확인) 상세 칸이 있다', !!pd.getElementById('pkDetail'));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

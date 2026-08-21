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
  ok('③ 공개 GET이 판매중만 준다', /where status = 'open'/.test(API));
  ok('③ 기한 지난 것을 서버가 뺀다', /valid_until is null or valid_until >= current_date/.test(API));
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
  ok('⑥ 탭 제목이 있다', /packages:'패키지 상품'/.test(ADMIN));
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

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

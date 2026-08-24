/* ═══════════════════════════════════════════════════════════════════════════
   패키지·소규모 견적 — **읽는 조건과 금액 계산의 단일 출처** (VS)
   ───────────────────────────────────────────────────────────────────────────
   VR까지는 `packages`를 읽는 곳이 둘이었다:
     · api/content.js       ?action=packages (공개 GET) — 고객 목록
     · api/quote-shares.js  ?action=package  (발급)      — 견적서 발급
   후자에 「고객 목록과 **같은 조건**으로 읽는다」는 주석이 붙어 있었는데, 그 말이
   지켜지는지를 아무것도 검사하지 않았다. 조건이 한쪽만 바뀌면 **고객 화면에 안 보이는
   상품의 견적서가 링크로는 발급된다.** 이 저장소 결함 생성기 ①(목록이 여러 곳에
   흩어져 하나를 빠뜨린다)의 가장 비싼 형태다.

   VS에서 「이 손님 한 명을 위한 1회용 견적」(kind='adhoc')이 같은 테이블에 들어오면서
   조건이 하나 더 늘었다. 그래서 쿼리를 여기 한 곳으로 모은다.
   ⚠ **content.js·quote-shares.js는 `packages` 테이블에 직접 쿼리하지 않는다.**
     `test_vS_adhoc_quotes.js`가 두 파일의 소스에서 `from packages`를 세어 0인지 본다.

   ── 조건이 **둘**인 이유 — 합치면 안 된다 ─────────────────────────────────
   두 질문은 답이 다르다:
     `listPublicPackages` : 「고객 목록(packages.html)에 **나와도 되는가**」
     `getIssuablePackage` : 「이 상품으로 **견적서를 낼 수 있는가**」
   1회용 견적(adhoc)은 **목록에는 안 나오지만 견적서는 나가야 한다.** 그게 존재 이유다.
   하나로 합치면 둘 중 하나가 반드시 틀린다 — 그래서 나란히 두고, 다른 이유를 여기 적는다.

   ⚠ 대신 adhoc은 **발급 자체에 관리자 인증이 붙는다**(quote-shares.js). 안 그러면
     id를 아는 사람이 공개 POST로 남의 손님 견적서를 뽑아 갈 수 있다. 목록에서 감추는
     것은 노출 방지지 접근 통제가 아니다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 상품의 **종류** — 「누구를 위한 값인가」
     catalog : 반복 판매하는 상품. 고객 목록에 나간다.
     adhoc   : 이 손님 한 명을 위해 담당자가 만든 1회용 견적. 목록에 안 나간다. */
const PKG_KINDS = ['catalog', 'adhoc'];

/* 값의 **출처** — 「누가 정한 금액인가」. status·kind와 다른 축이라 칸을 따로 둔다.
     agency    : 대리점가를 받아 적었다. 우리가 만든 값이 아니다 → 낡으면 우리가 문다.
     assembled : 담당자가 항목을 조립해 만들었다 → 틀리면 우리 판단이 틀린 것이다.
   ⚠ 한 칸에 뭉치면 나중에 「검증된 견적서」를 셀 때 성격이 다른 둘이 섞인다.
     `_verify.verdict`도 이 값에서 갈린다(quote-shares.js). */
const PKG_BASIS = ['agency', 'assembled'];

const PKG_STATUS = ['draft', 'open', 'closed'];

/* 조립 항목 상한. 인증 계정 하나가 붙여넣기 사고로 DB를 채우지 못하게 한다. */
const PKG_MAX_ITEMS = 40;
const PKG_MAX_ITEM_LABEL = 60;

/* 1회용 견적의 기본 유효기간(일). 소규모는 항공가 변동이 그대로 손실인데,
   기한 없는 1회용 견적이 쌓이면 언젠가 옛 값으로 발급된다.
   ⚠ 담당자가 직접 넣으면 그 값이 이긴다 — 여기는 **안 넣었을 때의 값**이다. */
const ADHOC_DEFAULT_VALID_DAYS = 14;

/* ── 금액 — **조립 항목이 있으면 그 합이 진실이다** ──────────────────────────
   담당자가 항목을 고친 뒤 총액 칸을 안 고치는 일은 반드시 생긴다. 그때 둘 중
   무엇을 믿을지 정해 두지 않으면 화면과 견적서가 다른 금액을 말한다.
   → **항목의 합이 이긴다.** 저장할 때 서버가 이 값으로 price_per_person을 덮어쓰고,
     발급할 때도 이 함수로 **다시 구한다**(저장된 숫자를 믿지 않는다). */
function lineItemsOf(pkg) {
  const v = pkg && (pkg.line_items || pkg.lineItems);
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const label = typeof it.label === 'string' ? it.label.trim().slice(0, PKG_MAX_ITEM_LABEL) : '';
      const amount = Math.round(Number(it.amount));
      if (!label || !Number.isFinite(amount)) return null;
      return { label, amount };
    })
    .filter(Boolean)
    .slice(0, PKG_MAX_ITEMS);
}

function perPersonOf(pkg) {
  const items = lineItemsOf(pkg);
  if (items.length) return items.reduce((s, it) => s + it.amount, 0);
  const raw = pkg && (pkg.price_per_person != null ? pkg.price_per_person : pkg.pricePerPerson);
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? n : 0;
}

/* 견적서가 받는 모양([이름, 금액] 쌍)으로 옮긴다. 항목이 없으면 한 줄짜리다.
   ⚠ estimate-view.html의 `rows` 규격을 여기서 다시 정의하지 않는다 — 그 화면이
     이미 [라벨, 금액] 쌍을 그린다. 모양을 바꾸려면 그쪽부터 본다. */
function shareRowsOf(pkg, fallbackLabel) {
  const items = lineItemsOf(pkg);
  if (items.length) return items.map((it) => [it.label, it.amount]);
  return [[fallbackLabel || '패키지 상품가 (1인)', perPersonOf(pkg)]];
}

/* ── 읽기 ──────────────────────────────────────────────────────────────────
   ⚠ 두 함수 모두 **서버가 거른다.** 화면에서 거르면 그건 방어가 아니다 —
     화면을 안 거치는 경로(직접 호출·캐시·다음에 만들 다른 화면)가 반드시 생긴다. */

/* 고객 목록 — 판매중 · 기한 안 지남 · **catalog만**.
   1회용 견적이 여기 섞이면 남의 손님 견적이 상품인 척 뜬다. */
async function listPublicPackages(sql) {
  return sql`
    select * from packages
     where status = 'open'
       and kind = 'catalog'
       and (valid_until is null or valid_until >= current_date)
     order by coalesce(depart_date, '2999-12-31') asc`;
}

/* 관리자 목록 — 초안·마감·1회용까지 전부. 관리가 되려면 다 보여야 한다. */
async function listAllPackages(sql) {
  return sql`
    select * from packages order by coalesce(depart_date, '2999-12-31') asc, updated_at desc`;
}

/* 견적서를 낼 수 있는 상품 — 판매중 · 기한 안 지남. **kind는 안 따진다**(위 머리말).
   ⚠ 마감·초안·기한 지난 상품으로 견적서가 나가면 대리점인 우리가 그 값으로 문다. */
async function getIssuablePackage(sql, id) {
  const rows = await sql`
    select * from packages
     where id = ${String(id)} and status = 'open'
       and (valid_until is null or valid_until >= current_date)
     limit 1`;
  return rows.length ? rows[0] : null;
}

module.exports = {
  PKG_KINDS, PKG_BASIS, PKG_STATUS,
  PKG_MAX_ITEMS, PKG_MAX_ITEM_LABEL, ADHOC_DEFAULT_VALID_DAYS,
  lineItemsOf, perPersonOf, shareRowsOf,
  listPublicPackages, listAllPackages, getIssuablePackage,
};

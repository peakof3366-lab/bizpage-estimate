/* ═══════════════════════════════════════════════════════════════════════════
   **하나투어 상품의 지역 표기 → 우리 요율표 목적지** — 판정 단일 출처 (YH)
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 이게 첫 층인가

   하나투어 대표상품리스트(3,550건)를 「시장가 밴드」로 쓰려면 먼저 **그 행이 우리
   어느 목적지인가**가 정해져야 한다. 이게 안 붙으면 그 위에 얹는 것이 전부 헛일이라,
   설계에서 층 0으로 두고 **다른 것을 짓기 전에 붙는 비율부터 잰다.**

   ⚠ 실제로 필요한 일이라는 증거: 2026-09-02에 하나투어 상품 하나를 읽었더니
     상품명은 「도쿄/하코네/아타미 4일」인데 지역이 **「아타미」**로 왔다.
     우리 요율표에 아타미는 없다. 도쿄는 있다.

   ■ 지금 판정 — `import_packages_sheet.js`의 `destKeyOf`를 그대로 옮겼다

   도시명이 요율표 키와 **정확히 같으면** 그 목적지, 아니면 국가명으로 한 번 더.
   여기에 **상품명 훑기**를 한 갈래 더 두되 **따로 센다** — 얼마나 늘려 주는지
   숫자로 보고 나서 믿을지 정하려는 것이다(짐작으로 늘리지 않는다).

   ⚠ **별칭 표(`ALIASES`)를 지어내지 않는다.** 지금은 비어 있다.
     `audit_market_coverage.js`가 **못 붙은 표기를 건수 순으로** 뽑아 주므로,
     그걸 보고 근거가 있는 것만 채운다. 이 저장소에서 짐작값은 언제나 고객 금액이
     되어 돌아왔다(GOLF_FEES를 비워 둔 것과 같은 규칙이다).

   ⚠ **여러 곳이 걸리면 고르지 않는다.** `_guess_dest.js`가 「가장 긴 것」을 집었다가
     대만이 섞인 일정을 푸꾸옥 코스로 심은 전례가 있다. 여기서도 같은 규칙을 쓴다 —
     한쪽이 다른 쪽의 조각일 때(제주 ⊂ 제주도)만 긴 쪽을 집는다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 하나투어 표기 → 우리 목적지 키.
   🔴 **비어 있는 것이 지금의 정답이다.** 채울 때는 `audit_market_coverage.js`가
      뽑아 준 실제 표기와 건수를 근거로 한 줄씩 넣는다. */
const ALIASES = {};

/* 목적지 이름이 다른 낱말의 조각으로 들어 있는 것 — 상품명을 훑기 전에 지운다.
   ⚠ `_guess_dest.js`가 「세부내역서」의 '세부'를 세부(Cebu)로 읽어 견적서 두 건을
     통째로 세부로 만든 적이 있다. 상품명에는 그 낱말이 없지만, 같은 유형을 미리 막는다. */
const TITLE_DECOY_RE = /세부\s*일정|세부\s*사항/g;

/* 상품명에서 목적지를 찾는다. **여러 곳이면 안 고른다.**
   @returns {string|null} */
function fromTitle(title, keys) {
  const t = String(title || '').replace(TITLE_DECOY_RE, ' ');
  const hits = keys.filter((k) => t.indexOf(k) >= 0);
  if (!hits.length) return null;
  const longest = hits.slice().sort((a, b) => b.length - a.length)[0];
  /* 걸린 것이 전부 가장 긴 것의 조각일 때만 그것을 집는다(제주 ⊂ 제주도) */
  return hits.every((k) => k === longest || longest.indexOf(k) >= 0) ? longest : null;
}

/* @param {{city?:string, country?:string, region?:string, title?:string}} row
   @param {string[]} destKeys  요율표 목적지 키 목록 (`data.js`에서 온다)
   @returns {{key: string|null, from: 'city'|'country'|'alias'|'title'|null}}
     from — **어느 갈래로 붙었는가.** 갈래마다 믿을 만한 정도가 다르므로
     붙었다는 사실만 남기면 나중에 「이 값을 믿어도 되나」에 답할 수 없다. */
function marketDest(row, destKeys) {
  const keys = Array.isArray(destKeys) ? destKeys : [];
  const has = (s) => s && keys.indexOf(s) >= 0;
  const city = String((row && row.city) || '').trim();
  const country = String((row && row.country) || '').trim();

  if (has(city)) return { key: city, from: 'city' };
  if (has(country)) return { key: country, from: 'country' };

  const alias = ALIASES[city] || ALIASES[country];
  if (has(alias)) return { key: alias, from: 'alias' };

  const byTitle = fromTitle((row && row.title) || '', keys);
  if (byTitle) return { key: byTitle, from: 'title' };

  return { key: null, from: null };
}

module.exports = { marketDest, fromTitle, ALIASES };

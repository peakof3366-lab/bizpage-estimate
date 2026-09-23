/* ═══════════════════════════════════════════════════════════════════════════
   고객 링크에 실릴 견적서 문서를 만드는 곳 — **여기 하나다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-17 대표 결정(양식 통일)으로 「문서가 없으면 서버가 만들어 붙인다」가
   `api/quote-shares.js` 안에 들어갔다. 그 자리는 맞는데, **그래서 서버 요청을 타지
   않는 것은 무엇도 v2 문서를 못 본다**는 부작용이 있었다.

   🔴 실제로 그 부작용이 검사에 났다 — `virtual_journey.js`가 만든 payload에는 `doc`이
     없어서, 그걸 픽스처로 쓰는 브라우저 검사(`check_contrast.py`·
     `check_customer_screens.py`)가 **롤링 페이지(v2)를 한 번도 잰 적이 없었다.**
     화면은 v1 경로로 그려졌고, 글자와 버튼이 멀쩡히 있으니 검사는 통과했다
     (`CLAUDE.md` 결함 생성기 ③: 실행된 적 없는 안전망).

   → 만드는 순서를 이 파일 하나로 모은다. 서버도 검사 도구도 **같은 것을 부른다.**
     ⚠ 베껴 쓰지 말 것. 한쪽만 고쳐지면 검사가 재는 문서와 고객이 받는 문서가
       갈라지고, 그러면 검사가 아무것도 증명하지 않는다(결함 생성기 ①).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const QDOC = require('../../quote_doc.js');

/** 고객에게 나갈 문서를 만든다.
 *
 * @param {object} share  공유 payload(엔진이 낸 값 그대로 — 금액을 다시 계산하지 않는다)
 * @param {object} [opts]
 *   · `doc`   담당자가 이미 만들어 둔 문서(`quotes.payload.doc`). 있으면 이걸 깎아 쓴다.
 *   · `parts` 「보낼 것만」 체크(`QDOC.applyParts`). 없으면 통째로 나간다.
 * @returns {{doc: object|null, leaks: string[], buildError: string|null}}
 *   🔴 **leaks가 비지 않으면 발급하면 안 된다** — 부르는 쪽이 판단한다.
 *     (이 함수는 막지 않는다. 막는 자리는 HTTP 응답을 아는 쪽이다.)
 */
function buildShareDoc(share, opts) {
  const o = opts || {};
  const given = o.doc;
  let docForShare = null;
  let buildError = null;

  /* 문서가 없으면 **여기서 만들어 붙인다** (2026-09-17 대표 결정).
     고객이 직접 뽑은 건에는 `doc`이 없어 옛 양식(v1)으로 나갔다 — 한 회사가 두 종류의
     견적서를 내보내고 있던 자리다.
     🔴 **금액은 다시 계산하지 않는다** — payload의 값을 그대로 옮긴다. */
  if (!(given && typeof given === 'object')) {
    try {
      const { QUOTE_EXCLUDED, COMPANY_INFO } = require('../../company-info.js');
      const built = QDOC.fromShare(share, { excluded: QUOTE_EXCLUDED, company: COMPANY_INFO });
      /* 문서로 그릴 만한 알맹이가 있을 때만 붙인다 — 빈 껍데기를 붙이면 옛 경로가
         멀쩡히 그리던 것까지 빈 문서로 덮는다. */
      if (built && built.price && built.price.total > 0) docForShare = QDOC.stripInternal(built);
    } catch (err) {
      /* 🔴 못 만들어도 **견적서는 나간다**(옛 양식으로). 여기서 막으면 고객이 아무것도
         못 받는 편이 되고, 그건 더 나쁘다. 부르는 쪽이 기록만 남긴다. */
      buildError = (err && err.message) || String(err);
    }
  } else {
    docForShare = QDOC.stripInternal(given);
  }

  /* 🔴 **고른 것만 남긴다 — 지우는 곳은 여기 하나다.**
     ⚠ `stripInternal` **뒤**다. 「고객에게 나갈 문서」가 완성된 뒤에 깎아야
       무엇이 나가는지 한 자리에서 읽힌다. */
  if (docForShare && o.parts) docForShare = QDOC.applyParts(docForShare, o.parts);

  /* 🔴 **검문은 한 곳에서 한다.** 담당자가 만든 문서든 여기서 만든 문서든 같은 자를 지난다.
     `quote_shares.payload`는 링크를 아는 누구나 읽는다(인증이 없다). */
  const leaks = docForShare ? QDOC.findInternalKeys(docForShare) : [];

  return { doc: docForShare, leaks, buildError };
}

module.exports = { buildShareDoc };

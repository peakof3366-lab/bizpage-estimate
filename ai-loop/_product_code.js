/* ═══════════════════════════════════════════════════════════════════════════
   견적서에 적힌 **하나투어 상품코드에서 출발일을 읽는다** (YK) — 단일 출처
   ───────────────────────────────────────────────────────────────────────────
   ■ 어떻게 알았나

   2026-09-02에 대표가 주신 상품 주소를 읽었더니 판매상품코드가 `JTP140261029TWT`였고,
   그 상품의 출발일이 **2026-10-29**였다. 코드 가운데 여섯 자리가 `261029`다.

   짐작으로 두지 않고 **코퍼스 45건 전수로 검증**했다:

       상품코드 9개 발견 · 문서 출발일과 **일치 7 · 다름 1 · 문서가 출발일을 모름 1**

   다른 1건은 「글로벌 금융판매_웰스 총괄(푸꾸옥)」인데 **같은 문서에 코드가 둘**이고
   하나가 하루 앞선다(`…260310…` / `…260311…`) — 차수·조별 출발로 보인다. 결함이 아니다.

   ■ 🔴 그런데 이걸로 **빈 출발일을 채우면 안 된다.** 실측이 그렇게 말한다

   출발일을 모르는 유일한 문서(「키움에셋플래너 해외연수(하노이)」)의 코드가
   **`AVQ259260405ZED`**인데, 이 코드는 「글로벌 베스트 푸꾸옥 견적서」의 코드와
   **글자 하나까지 같다.** 하노이 문서에 **푸꾸옥 여행의 상품코드**가 붙어 있는 것이다
   (양식을 복사해 쓴 흔적으로 보인다). 그 코드의 날짜로 하노이 견적서의 출발일을
   채웠으면 **다른 여행의 날짜가 정답지가 됐을 것**이다.

   → 그래서 이 파일은 **채우지 않는다. 대조만 한다.**
     · 문서가 출발일을 밝혔고 코드와 다르면  → 사람이 볼 일이라고 말한다
     · 문서가 출발일을 모르는데 코드가 **다른 문서와 겹치면** → 🔴 그 코드를 믿지 말라고 말한다
   ⚠ 「빈칸보다 틀린 값이 위험하다」(대표 방침)가 정확히 이 자리다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* [영문3][숫자3][YYMMDD][영문3] — 실측 9개가 전부 이 모양이었다.
   ⚠ 좁게 잡는다. 넓히면 예약번호·견적번호(`HQ25307666421`·`QA00660900001`)까지 걸린다. */
const CODE_RE = /\b([A-Z]{3})(\d{3})(\d{2})(\d{2})(\d{2})([A-Z]{3})\b/g;

/* @param {string} text 견적서 본문
   @returns {{code: string, date: string}[]}  코드와 그 코드가 말하는 출발일 (중복 제거) */
function productCodes(text) {
  const t = String(text || '');
  const re = new RegExp(CODE_RE.source, 'g');
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(t))) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    const y = 2000 + Number(m[3]), mo = Number(m[4]), d = Number(m[5]);
    /* 날짜가 아닌 것은 코드가 아니다 — 모양만 같은 다른 번호를 걸러낸다 */
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const p = (n) => String(n).padStart(2, '0');
    out.push({ code: m[0], date: y + '-' + p(mo) + '-' + p(d) });
  }
  return out;
}

/* 문서의 출발일과 코드가 맞는가. **판정만 하고 값을 바꾸지 않는다.**
   @param {string} text
   @param {string|null} departDate  문서에서 읽은 출발일 (없으면 null)
   @returns {{codes: {code,date}[], note: string|null}}
     note — 사람이 봐야 하는 것이 있으면 문장, 없으면 null */
function checkProductCode(text, departDate) {
  const codes = productCodes(text);
  if (!codes.length) return { codes: [], note: null };
  if (!departDate) {
    /* 출발일을 모를 때 이 코드로 채우고 싶어지는데, 실측에서 **남의 코드**가 붙어 있었다.
       그래서 「채울 수 있다」가 아니라 「확인이 필요하다」로 말한다. */
    return {
      codes,
      note: '문서가 출발일을 안 밝혔고 상품코드는 ' + codes.map((c) => c.code + '(' + c.date + ')').join(' · ')
        + ' 다 — ⚠ 코드가 다른 견적서와 겹치는지 먼저 확인할 것(남의 코드가 붙어 있던 실측이 있다)',
    };
  }
  const agree = codes.some((c) => c.date === departDate);
  if (agree) return { codes, note: null };
  return {
    codes,
    note: '문서 출발일 ' + departDate + ' 와 상품코드가 말하는 날('
      + codes.map((c) => c.date).join(' · ') + ')이 다르다 — 차수별 출발이면 정상이다',
  };
}

module.exports = { productCodes, checkProductCode, CODE_RE };

/* YK 검증 — 상품코드로 **출발일을 채우지 않는가**

   왜 —  표본에서 빠진 견적서를 되살리려다 나온 것이다. 「키움에셋플래너 해외연수
   (하노이)」는 문서에 연도가 없어 역검증에서 빠져 있고, 대기열 0-f에도
   **「연도 한 칸이면 된다」**로 올라가 있다.

   그 문서에 하나투어 상품코드 `AVQ259260405ZED`가 있었다. 2026-09-02에 대표가 주신
   상품 주소에서 판매상품코드 `JTP140261029TWT`의 출발일이 **2026-10-29**인 것을
   확인했으니, 코드 가운데 여섯 자리가 곧 출발일이다. 코퍼스 전수로 검증했다:

       상품코드 9개 · 문서 출발일과 **일치 7 · 다름 1 · 문서가 출발일을 모름 1**
       (다른 1건은 같은 문서에 코드가 둘이고 하루 차이 — 차수별 출발이라 정상)

   규칙은 쓸 만하다. **그런데 그걸로 채웠으면 사고였다.**

   🔴 그 하노이 문서의 코드 `AVQ259260405ZED`는 **「글로벌 베스트 푸꾸옥 견적서」의
      코드와 글자 하나까지 같다.** 하노이 견적서에 **푸꾸옥 여행의 코드**가 붙어 있다
      (양식을 복사해 쓴 흔적으로 보인다). 코드가 말하는 2026-04-05로 채웠으면
      **다른 여행의 날짜가 정답지**가 되고, 그 위에 모든 실측이 얹혔을 것이다.

   ⚠ 한 문서만 보면 절대 안 보인다. **문서 사이를 세어야** 나온다.
   ⚠ 「빈칸보다 틀린 값이 위험하다」(대표 방침)가 정확히 이 자리다.

   실행: node ai-loop/test_yK_product_code.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { productCodes, checkProductCode } = require('./_product_code');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* ══ [1] 코드에서 날짜를 읽는가 ═══════════════════════════════════════════ */
console.log('[1] 코드 가운데 여섯 자리가 출발일이다');
{
  const c = productCodes('상품코드 JTP140261029TWT 합계 1,689,900');
  ok('코드를 찾는다', c.length === 1 && c[0].code === 'JTP140261029TWT');
  ok('2026-10-29로 읽는다 — 실제 상품의 출발일과 같다', c[0] && c[0].date === '2026-10-29', c[0] && c[0].date);
  const two = productCodes('AVQ351260310ZEA 와 AVQ351260311ZEA');
  ok('한 문서에 코드가 둘이면 둘 다 준다 (차수별 출발)', two.length === 2);
  ok('같은 코드가 두 번 나와도 한 번만 센다',
    productCodes('JTP140261029TWT … JTP140261029TWT').length === 1);
}

/* ══ [2] 코드가 아닌 번호를 코드로 읽지 않는가 ═══════════════════════════ */
console.log('\n[2] 좁게 잡는가');
{
  /* 실측: 같은 문서에 예약코드 HQ25307666421 · 견적번호 QA00660900001이 있었다 */
  ok('예약코드를 코드로 읽지 않는다', productCodes('예약코드HQ25307666421').length === 0);
  ok('견적번호를 코드로 읽지 않는다', productCodes('견적번호QA00660900001').length === 0);
  ok('날짜가 될 수 없는 자리는 버린다 (13월)',
    productCodes('ABC123261399XYZ').length === 0);
}

/* ══ [3] 🔴 **채우지 않는다** — 이번에 가장 비쌌던 자리 ══════════════════ */
console.log('\n[3] 빈 출발일을 코드로 채우지 않는가');
{
  const r = checkProductCode('상품코드 AVQ259260405ZED', null);
  ok('출발일을 모를 때 값을 돌려주지 않는다 (date 필드를 안 만든다)',
    r.note != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.note)));
  ok('대신 「확인이 필요하다」고 말한다', /확인/.test(r.note));
  ok('남의 코드가 붙어 있던 실측을 근거로 든다', /남의 코드/.test(r.note));

  const src = fs.readFileSync(path.join(__dirname, '_product_code.js'), 'utf8');
  ok('모듈이 「채우지 않는다. 대조만 한다」고 못박는다', /채우지 않는다/.test(src) && /대조만/.test(src));
  /* 값을 만들어 내보내는 함수가 아예 없어야 한다 */
  ok('출발일을 반환하는 함수가 없다', !/function\s+departFrom|fillDepart/.test(src));
}

/* ══ [4] 문서가 밝힌 출발일과 맞으면 조용한가 ════════════════════════════ */
console.log('\n[4] 맞을 때는 말하지 않는가');
{
  ok('일치하면 note가 없다',
    checkProductCode('ESQ111250404OZL', '2025-04-04').note === null);
  ok('어긋나면 말하되 「차수별이면 정상」이라고 덧붙인다', (() => {
    const n = checkProductCode('AVQ351260310ZEA', '2026-03-11').note;
    return n && /차수별/.test(n);
  })());
}

/* ══ [5] 문서 사이 겹침을 세는 자리가 있는가 ═════════════════════════════ */
console.log('\n[5] 한 문서만 봐서는 안 보이는 것');
{
  const db = fs.readFileSync(path.join(__dirname, 'build_corpus_db.js'), 'utf8');
  ok('코퍼스 표가 _product_code를 쓴다', /require\('\.\/_product_code'\)/.test(db));
  ok('같은 코드가 두 문서에 있는지 센다', /같은 코드가 두 문서에/.test(db));
  ok('그때 「출발일을 채우지 말 것」이라고 말한다', /출발일을 채우지 말 것/.test(db));
  ok('실제로 걸린 두 문서를 근거로 적어 뒀다',
    /글로벌 베스트 푸꾸옥/.test(db) && /키움에셋플래너 해외연수/.test(db));
  ok('값을 안 바꿨다고 밝힌다', /값은 안 바꿨다/.test(db));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — YK 상품코드 대조`);
process.exit(fail ? 1 : 0);

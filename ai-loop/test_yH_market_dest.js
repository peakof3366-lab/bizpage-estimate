/* YH 검증 — 하나투어 상품 표기를 우리 목적지에 붙이는 자, 그리고 **그 값을 뭐라 부를지**

   왜 —  「하나투어 상품가를 견적의 기초 DB로 쓰자」는 설계의 층 0을 재는 도구를
   만들었다(`audit_market_coverage.js`). 다른 것을 짓기 전에 **붙는 비율부터** 보려던 것이다.

   ① 붙기는 붙었다 — 2,704건 중 1,787건(66.1%), 표본 3건 이상 모이는 목적지 53/60곳.
   ② 🔴 그런데 **그 위에 세운 「밴드」가 거짓이었다.** 엑셀의 「성인총상품가」는
      실판매가가 아니라 그 대표상품의 **최저 출발가**다:

          엑셀   MJT1080 「[출발확정] 도쿄 3~4일 패키지」      979,900원
          실제   JTP140261029TWT 도쿄/하코네/아타미 4일     1,689,900원   ← 1.72배

      그걸 시장가로 부르고 우리 휴양 견적을 견주니 **중앙 +95.5%**가 나왔다.
      그대로 믿었으면 「우리가 시장의 두 배로 판다」는 보고가 나갔고, 그건
      **없는 문제를 고치러 가는 길**이었다.

   → 그래서 이 테스트가 잠그는 것은 「잘 붙는가」보다 **「뭐라 부르는가」**다.
     이 저장소가 반복해 당한 것이 언제나 그 자리였다(YF에서도 같은 유형이었다).

   실행: node ai-loop/test_yH_market_dest.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { marketDest, fromTitle, ALIASES } = require('./_market_dest');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

const KEYS = ['도쿄', '오사카', '제주', '제주도', '다낭', '푸꾸옥', '대만', '세부'];

/* ══ [1] 붙이는 규칙 ═══════════════════════════════════════════════════════ */
console.log('[1] 도시 → 국가 → 별칭 → 상품명 순서');
{
  ok('도시명이 그대로 맞으면 그것',
    marketDest({ city: '도쿄', country: '일본' }, KEYS).key === '도쿄');
  ok('어느 갈래로 붙었는지 남긴다',
    marketDest({ city: '도쿄' }, KEYS).from === 'city');
  ok('도시가 없으면 국가로 한 번 더',
    marketDest({ city: '타이베이', country: '대만' }, KEYS).key === '대만');
  ok('둘 다 아니면 상품명에서 찾는다',
    marketDest({ city: '아타미', country: '일본1', title: '도쿄/하코네/아타미 4일' }, KEYS).key === '도쿄');
  ok('그때 갈래를 title로 남긴다 — 믿을 정도가 다르다',
    marketDest({ city: '아타미', title: '도쿄 4일' }, KEYS).from === 'title');
  ok('아무것도 없으면 비운다 (짐작하지 않는다)',
    marketDest({ city: '말레', country: '몰디브', title: '몰디브 6일' }, KEYS).key === null);
}

/* ══ [2] 여러 곳이 걸리면 고르지 않는다 ═══════════════════════════════════ */
console.log('\n[2] 상품명에 목적지가 둘 이상일 때');
{
  /* 🔴 `_guess_dest.js`가 「가장 긴 것」을 집었다가 대만이 섞인 일정을 푸꾸옥 코스로
     운영 DB에 심은 전례가 있다. 같은 규칙을 여기서도 쓴다. */
  ok('서로 다른 두 곳이 걸리면 안 고른다',
    fromTitle('대만·푸꾸옥 결합 7일', KEYS) === null);
  /* 다만 한쪽이 다른 쪽의 조각이면(제주 ⊂ 제주도) 긴 쪽을 집는다 */
  ok('한쪽이 다른 쪽의 조각이면 긴 쪽',
    fromTitle('제주도 3일', KEYS) === '제주도');
}

/* ══ [3] 별칭 표를 지어내지 않았는가 ═════════════════════════════════════ */
console.log('\n[3] 짐작으로 채우지 않는다');
{
  /* ⚠ 「푸껫 → ?」·「북경 → ?」처럼 그럴듯한 것이 917건 있었다. 하나도 안 넣었다 —
     근거는 감사기가 뽑아 주고, 채우는 것은 사람의 판단이다(GOLF_FEES와 같은 규칙). */
  ok('별칭 표가 비어 있다 (근거 없이 채우지 않았다)', Object.keys(ALIASES).length === 0,
    JSON.stringify(ALIASES));
  const src = fs.readFileSync(path.join(__dirname, '_market_dest.js'), 'utf8');
  ok('왜 비워 뒀는지 적혀 있다', /짐작으로|짐작값/.test(src));
}

/* ══ [4] 🔴 값을 뭐라 부르는가 — 이번에 가장 비쌌던 자리 ═════════════════ */
console.log('\n[4] 엑셀 금액을 「시장가」라 부르지 않는가');
{
  const a = fs.readFileSync(path.join(__dirname, 'audit_market_coverage.js'), 'utf8');
  ok('엑셀 금액이 **최저 출발가**라고 밝힌다', /최저 출발가|최저가/.test(a));
  ok('실측 한 쌍(979,900 vs 1,689,900)을 근거로 남긴다',
    /979,900/.test(a) && /1,689,900/.test(a));
  ok('「우리가 비싸다」의 근거로 쓰지 말라고 말한다', /근거로 쓰지 말/.test(a));
  ok('진짜 밴드는 판매상품 단위라고 말한다', /pkgCd/.test(a));
  /* ⚠ +95.5%를 지우지 않고 **왜 그 숫자가 나왔는지와 함께** 남긴다 —
     지우면 다음 사람이 같은 계산을 다시 해서 같은 결론에 도달한다. */
  ok('그때 나온 +95.5%를 지우지 않고 경위와 함께 남겼다', /95\.5%/.test(a));
}

/* ══ [5] 감사기가 스스로 표본 하한을 말하는가 ════════════════════════════ */
console.log('\n[5] 3건 미만은 밴드라 부르지 않는다');
{
  const a = fs.readFileSync(path.join(__dirname, 'audit_market_coverage.js'), 'utf8');
  ok('MIN_BAND가 있다', /const MIN_BAND\s*=\s*\d/.test(a));
  ok('왜 그 값인지 적혀 있다', /중앙값이 뜻이 없다/.test(a));
  ok('상한이라는 것을 밝힌다 — 출발월 축은 엑셀에 없다', /상한/.test(a) && /출발일이 없다|출발월/.test(a));
}

/* ══ [6] 휴양 경로를 잴 수 있게 됐는가 ═══════════════════════════════════ */
console.log('\n[6] 측정 도구가 휴양(가족여행)을 잴 수 있는가');
{
  /* 🔴 `_engine_boot`의 `run`이 차량·가이드를 **무조건 켜고** 있어서 휴양 경로를
     아예 못 쟀다. 코퍼스 36건이 전부 MICE 단체라 그동안 안 보였다. */
  const b = fs.readFileSync(path.join(__dirname, '_engine_boot.js'), 'utf8');
  ok('incVehicle을 손잡이로 받는다', /incVehicle/.test(b) && /SPEC_DEFAULTS/.test(b));
  ok('안 주면 예전처럼 전부 켠다', /s\[id\] !== false/.test(b));
  ok('왜 열었는지와 실측(+8.2%)이 적혀 있다', /8\.2%/.test(b));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — YH 시장가 재료 검산`);
process.exit(fail ? 1 : 0);

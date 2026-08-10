/* SF 검증 — 문서가 적어 둔 환율을 **읽어낸다**. 그리고 오기를 믿지 않는다.

   왜 —  환율을 모르면 외화 줄은 통째로 버려진다(오늘 환율로 때우지 않는다는 원칙 때문이다.
   그 원칙 자체는 옳다 — 견적 시점과 어긋난 값이 '실측'으로 굳는다). 실측(코퍼스 46건):
   **17건이 환율을 몰라 막혀 있었는데, 그중 12건은 문서가 환율을 적어 두고 있었다.**
   우리 패턴이 못 잡았을 뿐이다. 네 가지 모양을 놓치고 있었다:

     ① "$1 = 1,430원"      기호가 숫자 **앞** — 「1JPY = 9.5원」과 어순이 반대다
     ② "환율($) 1,385"      「**기준** 환율」만 보고 있었다
     ③ "환율 ₩ 1,740"       **통화를 안 밝힌다**
     ④ "1JYP = 9.5원"       문서의 **오타**(JPY를 JYP로 적었다)

   ③을 어떻게 푸느냐가 이 작업의 핵심이다. **짐작하지 않는다** — 견적서의 외화가 한
   종류뿐이면 그 환율은 그 통화의 것일 수밖에 없다. 두 종류 이상이면 쓰지 않는다.

   ⚠ 그리고 **문서가 통화를 잘못 적기도 한다.** 실측 두 건:
       · 호남 북해도 「환율(달러) 9.7」  — 값은 엔 환율인데 라벨이 달러다
       · 다낭 「환율(VND) 23,000」      — 원화 환율이 아니라 1달러 = 23,000동이다
     그대로 믿으면 동화 줄이 23,000배가 된다. 자릿수로 걸러낸다.

   실행: node ai-loop/test_sF_fx_reading.js  (프로젝트 루트에서) */
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 줄 — 실제 견적서를 쓰지 않는다. 셀 하나가 곧 한 칸이다. */
let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 40;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
const doc = (rows) => { ln = 0; return rows.map((r) => line(r)); };
const named = (rows) => X.findFxRates(doc(rows)).named;

/* ══ [1] 통화를 밝힌 네 가지 어순 ═══════════════════════════════════════════ */
console.log('[1] 통화를 밝힌 표기를 전부 읽는가');
{
  ok('1JPY = 9.5원', named([['현재 1JPY = 9.5원 기준']]).JPY === 9.5,
    JSON.stringify(named([['현재 1JPY = 9.5원 기준']])));
  ok('$1 = 1,430원 (기호가 앞)', named([['현재 환율 ($1 = 1,430원 기준)이며']]).USD === 1430,
    JSON.stringify(named([['현재 환율 ($1 = 1,430원 기준)이며']])));
  ok('기준 환율 ($) 1,450', named([['기준 환율 ($)', '1,450']]).USD === 1450);
  ok('환율($) 1,385 — 「기준」이 없어도 읽는다', named([['환율($)', '1,385']]).USD === 1385,
    JSON.stringify(named([['환율($)', '1,385']])));
  ok('환율(달러) 1,390 — 한글 통화명', named([['환율(달러)', '1,390']]).USD === 1390,
    JSON.stringify(named([['환율(달러)', '1,390']])));
  ok('환율(유로) 1,580', named([['환율(유로)', '1,580']]).EUR === 1580);
  ok('100엔 = 950원 → 1엔 9.5원', named([['100엔 = 950원']]).JPY === 9.5);
  ok('문서 오타 1JYP도 엔으로 읽는다', named([['현재 1JYP = 9.5원 기준']]).JPY === 9.5,
    JSON.stringify(named([['현재 1JYP = 9.5원 기준']])));
}

/* ══ [2] 자릿수가 말이 안 되는 값은 믿지 않는다 ═════════════════════════════ */
console.log('\n[2] 문서가 통화를 잘못 적었을 때');
{
  const r1 = X.findFxRates(doc([['환율(달러)', '9.7']]));
  ok('「환율(달러) 9.7」을 USD로 받지 않는다', r1.named.USD === undefined, JSON.stringify(r1.named));
  ok('버렸다는 것을 남긴다', r1.rejected.length === 1 && r1.rejected[0].code === 'USD',
    JSON.stringify(r1.rejected));
  const r2 = X.findFxRates(doc([['환율(VND)', '23,000']]));
  ok('「환율(VND) 23,000」을 받지 않는다(1달러당 동화다)', r2.named.VND === undefined,
    JSON.stringify(r2.named));
  ok('정상 범위는 그대로 통과한다', named([['환율(달러)', '1,430']]).USD === 1430);
  ok('엔 9.5도 통과한다(달러였다면 걸린다)', named([['환율(엔)', '9.5']]).JPY === 9.5);
}

/* ══ [3] 통화를 안 밝힌 「환율 ₩ N」 ════════════════════════════════════════ */
console.log('\n[3] 통화를 안 밝힌 환율을 어떻게 묶는가');
{
  const f = X.findFxRates(doc([['견적번호', 'QA001', '환율', '₩', '1,740']]));
  ok('값은 모아 둔다', f.bare.length === 1 && f.bare[0] === 1740, JSON.stringify(f.bare));
  ok('통화를 밝히지 않았으므로 바로 쓰지 않는다', !Object.keys(f.named).length, JSON.stringify(f.named));

  ok('외화가 한 종류면 그 통화로 본다',
    (X.bindBareFx([1740], ['EUR']).rate || {}).value === 1740);
  ok('그 통화 이름도 함께 준다',
    (X.bindBareFx([1740], ['EUR']).rate || {}).code === 'EUR');
  const two = X.bindBareFx([1740], ['EUR', 'USD']);
  ok('외화가 두 종류면 쓰지 않는다', !two.rate, JSON.stringify(two));
  ok('왜 못 썼는지 남긴다', /여러 종류/.test(two.why), two.why);
  const dis = X.bindBareFx([9.5, 9.39], ['JPY']);
  ok('모아 둔 값끼리 어긋나면 쓰지 않는다', !dis.rate, JSON.stringify(dis));
  ok('어긋났다는 것을 남긴다', /서로 다릅니다/.test(dis.why), dis.why);
  const bad = X.bindBareFx([23000], ['VND']);
  ok('묶은 값도 자릿수를 본다', !bad.rate, JSON.stringify(bad));
  ok('외화가 없으면 아무것도 안 한다', !X.bindBareFx([1740], []).rate);
}

/* ══ [4] 통화를 밝힌 표기가 언제나 이긴다 ═══════════════════════════════════
   실측(키움 북해도): 안내문은 「1JPY = 9.5원」인데 아래 요약표는 「환율 ₩ 9.39」다.
   어느 쪽이 실제 계약 환율인지 코드는 모른다 — 더 분명한 진술을 쓴다. */
console.log('\n[4] 두 표기가 다를 때');
{
  const f = X.findFxRates(doc([
    ['현재 1JPY = 9.5원 기준'],
    ['견적번호', 'QJ001', '환율', '₩', '9.39'],
  ]));
  ok('통화를 밝힌 9.5를 쓴다', f.named.JPY === 9.5, JSON.stringify(f.named));
  ok('안 밝힌 값도 버리지는 않는다', f.bare.indexOf(9.39) >= 0, JSON.stringify(f.bare));
}

/* ══ [5] 단가가 1인 조합은 단가가 아니다 ════════════════════════════════════
   SB가 「곱수는 2,000 이하 정수만」으로 막았지만 그 상한은 원화 기준이라,
   숫자가 작은 외화 견적서에서는 통째로 새어 나갔다. */
console.log('\n[5] 외화 견적서에서 단가가 1이 되지 않는가');
{
  const rows = X.findUnitRows(doc([['차량', '40인승 버스', '$', '777', '1', '1', '$', '777']]), { USD: 1430 });
  ok('단가 1짜리 조합이 없다', !rows.some((r) => r.unit === 1),
    JSON.stringify(rows.map((r) => r.unit + '×' + r.qty)));
  ok('$777이 단가로 남는다', rows.some((r) => r.unit === 777),
    JSON.stringify(rows.map((r) => r.unit)));
}

/* ══ [6] 줄표는 「금액 없음」이라 통화 기호를 써 버린다 ═════════════════════
   실측(신한 썸머페스티벌 푸꾸옥): 「$ - 200,000」에서 `$`가 훌쩍 건너뛰어 동화
   200,000을 달러로 물들였다 → ×1,390 = 2억 7,800만원 → 상한에 걸려 그 칸이 비었다. */
console.log('\n[6] 「$ -」 뒤의 다른 통화 숫자를 물들이지 않는가');
{
  const rows = X.findUnitRows(doc([['인솔자 경비', '$', '-', '200,000', '6', '4', '4,800,000']]), {});
  const tainted = rows.filter((r) => r.unit === 200000 && r.currency === 'USD');
  ok('200,000이 달러로 물들지 않는다', tainted.length === 0,
    JSON.stringify(rows.map((r) => r.unit + (r.currency || 'KRW'))));
  /* 기호 바로 뒤에 숫자가 오면 예전대로 물든다 (환산은 applyFx가 따로 한다) */
  const okRows = X.findUnitRows(doc([['가이드', '$', '500', '1', '1', '$', '500']]), { USD: 1440 });
  ok('기호 바로 뒤 숫자는 그대로 달러다', okRows.some((r) => r.currency === 'USD'),
    JSON.stringify(okRows.map((r) => r.unit + ':' + r.currency)));
}

/* ══ [7] 박수는 여행 길이를 넘을 수 없다 ════════════════════════════════════
   호텔 줄의 '횟수' 열이 양식에 따라 인원이다(「€380 × 2 × 85」의 85는 사람 수).
   그대로 믿으면 86일로 나눠 1인 1일 식비가 4,702원이 된다(실측: 굿리치 체코). */
console.log('\n[7] 인원을 박수로 세지 않는가');
{
  const lines = doc([
    ['인 원', '158'],
    ['호텔', '비엔나 호텔', '661,200', '2', '85', '112,404,000'],
    ['식사', '중식', '100,000', '158', '2', '31,600,000'],
  ]);
  const r = X.readOneBlock(lines, {}, null);
  ok('85를 박수로 세지 않는다', !/85박/.test(String(r.evidence.meal && r.evidence.meal.label)),
    String(r.evidence.meal && r.evidence.meal.label));
  ok('식비가 터무니없이 작아지지 않는다', r.values.meal == null || r.values.meal > 20000,
    String(r.values.meal));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

/* UU 검증: 「1인당을 못 읽었다」가 사실은 **인원이 틀린 것**인 경우를 가른다.

   실측(리더스에셋 어드바이저 · 푸꾸옥):
       총 견적가        128,770,920
       문서의 1인 객단가   1,839,585   ← 문서에 그대로 인쇄돼 있다
       우리가 읽은 인원         50
       128,770,920 ÷ 1,839,585 = **정확히 70.000**

   문서가 적어 놓은 두 숫자가 서로를 증명하고, 어긋나는 것은 **인원 쪽**이다.
   그런데 예전에는 「1인당 × 인원이 총액과 딴판이다」라는 이유로 **1인당을 버렸다.**
   그래서 화면과 감사기가 「1인당 금액을 못 읽음」이라고 말했는데 —
   ① 사실이 아니고(문서에 적혀 있다) ② 사람이 볼 곳도 가리키지 못했다.
   이 견적서는 그 이유로 역검증에서 통째로 빠져 있었고, 원인을 알 방법이 없었다.

   여기서 고정하는 것:
   ① 문서의 총계 ÷ 1인당이 **딱 떨어지면** 1인당을 버리지 않고 「인원 어긋남」으로 돌려준다.
   ② **인원을 조용히 고치지 않는다.** 인원은 규모 계수로 금액에 들어가는 값이라,
      나눗셈이 맞았다는 것만으로 바꾸면 그게 다음 사고가 된다.
   ③ 딱 떨어지지 않으면 **예전 그대로 버린다** — 그건 정말 잘못 집은 값이다.
   ④ 역검증은 그 건을 대조하지 않는다. 틀린 인원으로 잰 오차는 엔진 오차로 둔갑한다.
      대신 **몇 명인지까지 적어** 한 칸만 확인하면 바로 표본이 되게 한다.

   실행: node ai-loop/test_uU_pax_conflict.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ex = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 줄 하나의 모양은 { text, cells:[{s}] }다 — 좌표로 세운 칸이 함께 온다.
   ⚠ cells를 빼면 findTotals가 그 자리에서 터진다(실제로 그랬다). 픽스처를 실제
     모양과 다르게 만들면 이 테스트는 아무것도 검사하지 못한다. */
const L = (arr) => arr.map((t) => ({ text: t, cells: [{ s: t }] }));

console.log('\n[1] 문서의 두 숫자가 서로를 증명하면 1인당을 살린다');
{
  /* ⚠ 총계는 라벨이 아니라 **블록 총액**으로 들어온다(reconcile의 셋째 인자).
     라벨 줄만 넣으면 grand가 null이라 이 검사 전체가 헛돈다 — 실제로 그렇게 짰다가
     [2]·[3]이 조용히 통과했다. 픽스처를 실제 경로와 같게 맞춘다. */
  const GRAND = 128770920;
  const r = ex.reconcile(L(['1인 객단가 1,839,585']), [], GRAND, null);
  ok('총계는 블록 총액에서 온다', r.grand === GRAND, String(r.grand));
  ok('1인당을 읽는다', r.perPerson === 1839585, String(r.perPerson));
}

console.log('\n[2] 인원이 어긋날 때 — 버리는 것이 아니라 가른다');
{
  /* 1,839,585 x 50 = 91,979,250 != 128,770,920 (28.6% 차이 → 예전이면 버렸다)
     그런데 128,770,920 ÷ 1,839,585 = 정확히 70.000이다. */
  const r = ex.reconcile(L(['인원 50명', '1인 객단가 1,839,585']), [], 128770920, null);
  ok('① **1인당을 버리지 않는다** (문서에 적힌 값이다)',
    r.perPerson === 1839585, String(r.perPerson));
  ok('① 대신 「인원 어긋남」을 돌려준다', !!r.paxConflict, JSON.stringify(r.paxConflict));
  ok('① 문서 계산이 몇 명인지 적는다 (사람이 확인할 값)',
    r.paxConflict && r.paxConflict.impliedPax === 70,
    r.paxConflict && String(r.paxConflict.impliedPax));
  ok('① 우리가 읽은 인원도 함께 적는다 (무엇과 무엇이 다른지)',
    r.paxConflict && r.paxConflict.docPax === 50,
    r.paxConflict && String(r.paxConflict.docPax));
  ok('② **인원을 조용히 고치지 않는다** (규모 계수로 금액에 들어가는 값이다)',
    r.pax === 50, String(r.pax));
}

console.log('\n[3] 딱 떨어지지 않으면 예전 그대로 버린다');
{
  /* 128,770,920 ÷ 1,234,567 = 104.3… — 정수 근처가 아니다. 잘못 집은 값이 맞다. */
  const r = ex.reconcile(L(['인원 50명', '1인 객단가 1,234,567']), [], 128770920, null);
  ok('③ 1인당을 버린다', r.perPerson == null, String(r.perPerson));
  ok('③ 「인원 어긋남」으로도 부르지 않는다', !r.paxConflict, JSON.stringify(r.paxConflict));

  /* 인원이 실제로 맞는 정상 문서는 아무 일도 없어야 한다 (호남대 북해도 실측) */
  const good = ex.reconcile(L(['인원 7명', '1인 객단가 1,971,472']), [], 13800306, null);
  ok('맞는 문서는 그대로 통과한다', good.perPerson === 1971472 && !good.paxConflict,
    String(good.perPerson) + ' / ' + JSON.stringify(good.paxConflict));
}

console.log('\n[4] 만들어만 두고 안 도는 안전망이 아닌가');
{
  /* ⚠ 이 표시는 findTotals → reconcile → 블록 → extractQuote → 역검증까지
     다섯 곳을 지난다. 한 곳만 빠뜨려도 영영 안 걸린다 — 실제로 reconcile이
     떨어뜨리고 있어서 가드가 안 돌았다(결함 생성기 ③). 소스로 못 박는다. */
  const src = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'), 'utf8');
  ok('findTotals가 돌려준다', /itemsTotal, paxConflict \}, findDeposit/.test(src));
  ok('reconcile이 받아서 그대로 넘긴다',
    /itemsTotal, paxConflict \} = findTotals/.test(src)
    && /itemsTotal, paxConflict, checks/.test(src));
  ok('블록 결과에 실린다', /paxConflict: rec\.paxConflict/.test(src));

  const bt = fs.readFileSync(path.join(ROOT, 'ai-loop', 'backtest_quotes.js'), 'utf8');
  ok('④ 역검증이 코퍼스 행에 싣는다', /paxConflict: r\.paxConflict/.test(bt));
  ok('④ 역검증이 그 건을 대조하지 않는다', /if \(c\.paxConflict\)/.test(bt));
  ok('④ 조용히 빼지 않고 몇 명인지 적는다',
    /인원 어긋남[\s\S]{0,120}impliedPax/.test(bt));

  const bc = fs.readFileSync(path.join(ROOT, 'ai-loop', 'build_corpus_db.js'), 'utf8');
  ok('코퍼스 표도 같은 사유로 든다', /인원 어긋남/.test(bc));
  ok('코퍼스 행이 그 표시를 들고 다닌다', /paxConflict: r\.paxConflict/.test(bc));
}

console.log('\n[7] UW — 인원 표기가 여럿이면 항목 줄이 투표한다');
{
  /* 실측(리더스에셋 푸꾸옥): 머리말이 둘이다.
       「인 원 50명」  ← 인천 출발분만
       「인원 70명」   ← 전체
     그리고 1인당 항목 줄(식사·보험·수수료)이 전부 70명을 쓴다.
     예전에는 **먼저 나온 50**을 잡아 모든 1인당 단가의 분모가 틀렸다. */
  const rows = (n, k) => Array.from({ length: k }, () => ({ qty: n, times: 1 }));
  const lines = L(['인 원 50명', '인원 70명']);

  const r = ex.reconcile(lines, rows(70, 10).concat(rows(50, 2)), 128770920, null);
  ok('① 항목 줄이 많이 쓰는 인원을 고른다 (먼저 나온 것이 아니라)',
    r.pax === 70, String(r.pax));
  ok('① 어떻게 골랐는지 남긴다', r.paxPick && r.paxPick.via === 'rows',
    JSON.stringify(r.paxPick));
  ok('① 후보를 전부 남긴다 (사람이 다시 판단할 수 있게)',
    r.paxPick && r.paxPick.heads.length === 2 && r.paxPick.heads.indexOf(50) >= 0,
    JSON.stringify(r.paxPick.heads));
  ok('① 몇 줄이 지지했는지 남긴다', r.paxPick.votes === 10, String(r.paxPick.votes));
  ok('① **그 결과 인원 어긋남이 사라진다** (문서와 앞뒤가 맞는다)',
    !r.paxConflict, JSON.stringify(r.paxConflict));

  /* ⚠ 뒤집을 근거가 없으면 안 뒤집는다 — 지지가 같으면 먼저 나온 것(옛 동작) */
  const tie = ex.reconcile(lines, rows(70, 3).concat(rows(50, 3)), 128770920, null);
  ok('② 지지가 같으면 먼저 나온 것을 쓴다 (옛 동작 유지)',
    tie.pax === 50, String(tie.pax));

  /* ⚠ 후보가 하나뿐이면 예전과 완전히 같다 — 나머지 문서는 아무것도 안 바뀐다 */
  const one = ex.reconcile(L(['인원 7명']), rows(7, 5), 13800306, null);
  ok('③ 후보가 하나면 예전 그대로다', one.pax === 7 && one.paxPick.via === 'header',
    String(one.pax) + ' / ' + one.paxPick.via);

  /* ⚠ 인원 표기가 아예 없으면 예전처럼 수량 최댓값 */
  const none = ex.reconcile(L(['품명 단가']), rows(12, 3), 1000000, null);
  ok('③ 표기가 없으면 수량 최댓값 (옛 폴백 유지)',
    none.pax === 12 && none.paxPick.via === 'maxQty', String(none.pax));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

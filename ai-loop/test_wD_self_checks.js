/* WD 검증 — 추출기 자기검산이 **실제로 돌고, 깨질 때 깨지는가**

   왜 —  `reconcile()`은 견적서마다 검산 ①「총계 ÷ 인원 = 1인당」과 ②「뽑은 줄 합계 ≤
   총계」를 계산한다. 그런데 그 결과를 **읽는 곳이 한 군데도 없었다.** 코퍼스 캐시에도
   안 실리고 역검증·오차 분해도 안 본다. 이 저장소의 결함 생성기 ③(안 돌아본 안전망)
   그대로다 — 그래서 `audit_self_checks.js`를 만들었고, 이 테스트가 그 감사기가 재는
   것이 실제로 성립하는지 고정한다.

   ⚠ 검산 ①에 **더 큰 구멍이 있었다.** 예전에는 `grand`(견적 총액)가 있을 때만 돌아서,
   총액이 「합계」 양식으로만 적힌 문서에서는 검산이 **아예 안 돌았다** — 코퍼스 45건 중
   25건이 그랬다. 상해 건이 정확히 그 구멍으로 빠져나갔다:
     문서 「1인 1,030,000원 + 황포강유람선/꽃비용 411,600원」, 총합계 15,861,600원.
     15,861,600 ÷ 15 = 1,057,440인데 우리는 1,030,000만 1인당으로 읽었다.
   그 2.7%가 검산에 안 걸린 채 **역검증의 정답지**로 쓰였다. 정답지가 작으면 엔진이
   그만큼 비싸 보이고, 그 진단으로 요율을 만지면 진짜로 틀어진다.

   ⚠ 그렇다고 「합계 ÷ 인원 ≠ 1인당」을 전부 결함이라 부르면 안 된다. 원가 시트의
   「합계」는 지상비만 담고 항공·마진은 그 밖에 있어서 `합계 ÷ 인원 < 판매가`가
   **정상**이다(코퍼스 14건). 그래서 방향을 가른다 — 아래로 벌어지면 정상, **위로**
   벌어지면 1인당을 덜 읽은 것이라 결함이다. 그 방향 규칙을 여기서 고정한다.

   실행: node ai-loop/test_wD_self_checks.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 줄 — 실제 견적서를 쓰지 않는다(참가자 실명·거래처 단가가 들어 있다). */
let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 0;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
const doc = (rows) => { ln = 0; return rows.map((r) => line(r)); };
const chk = (rec, name) => (rec.checks || []).find((c) => c.name === name) || null;
const C1 = '총계 ÷ 인원 = 1인당';
const C2 = '뽑은 줄 합계 ≤ 총계';

/* ══ [1] 검산 ①이 「합계」 양식에서도 도는가 — 예전엔 25/45건에서 안 돌았다 ══ */
console.log('[1] 검산 ①이 견적 총액 없이 「합계」만 있는 문서에서도 도는가');
{
  /* 총계를 「합계」로만 적는 양식. 1인당은 딱 맞게 둔다(1,000,000 × 10 = 10,000,000). */
  const lines = doc([
    ['인원', '성인 10명'],
    ['상품가격', '1인 1,000,000원'],
    ['합계', '10,000,000원'],
  ]);
  const rec = X.reconcile(lines, [], null, {});
  const c = chk(rec, C1);
  ok('검산 ①이 돌았다', !!c, JSON.stringify(rec.checks));
  ok('분모가 「항목 합계」라고 밝혀진다', !!c && c.basis === 'items', c && c.basis);
  ok('딱 맞으므로 통과', !!c && c.ok === true);
  ok('`matched`로 「대조됐다」가 구분된다', !!c && c.matched === true);
}

/* ══ [2] 🔴 일부러 망가뜨린다 — 상해 모양(1인당 표기가 총계보다 작다) ══ */
console.log('\n[2] 1인당 표기에서 단체 1회분이 빠지면 잡히는가 (상해 모양)');
{
  /* 1인 1,030,000 × 15 = 15,450,000인데 총합계는 15,861,600 (단체 411,600이 더 있다) */
  const lines = doc([
    ['인원', '성인 15명'],
    ['상품가격', '1인 1,030,000원 + 유람선 411,600원'],
    ['합계', '15,861,600원'],
  ]);
  const rec = X.reconcile(lines, [], null, {});
  const c = chk(rec, C1);
  ok('검산 ①이 돌았다', !!c, JSON.stringify(rec.checks));
  ok('🔴 깨진다 — 조용히 넘어가지 않는다', !!c && c.ok === false, c && JSON.stringify(c));
  ok('`matched`도 false다', !!c && c.matched === false);
  ok('detail이 두 값을 함께 말한다',
    !!c && /15,861,600/.test(c.detail) && /1,030,000/.test(c.detail), c && c.detail);
}

/* ══ [3] ⚪ 원가 시트는 결함이 아니다 — 아래 방향은 정상 ══ */
console.log('\n[3] 원가 시트(합계 < 판매가 × 인원)를 결함이라 부르지 않는가');
{
  /* 지상비 합계만 적힌 시트: 20,000,000 ÷ 30 = 666,667 « 판매가 1,492,658 */
  const lines = doc([
    ['인원', '성인 30명'],
    ['판매가', '1,492,658'],
    ['합계', '20,000,000'],
  ]);
  const rec = X.reconcile(lines, [], null, {});
  const c = chk(rec, C1);
  ok('검산 ①이 돌았다', !!c);
  ok('⚪ 아래 방향은 통과로 둔다(항공·마진이 합계 밖)', !!c && c.ok === true,
    c && JSON.stringify(c));
  ok('🔴 그러나 `matched`는 false — **대조된 것이 아니다**', !!c && c.matched === false,
    c && JSON.stringify(c));
}

/* ══ [4] 견적 총액(grand)일 때는 양쪽 다 본다 ══ */
console.log('\n[4] 견적 총액일 때는 아래로 벌어져도 깨지는가');
{
  const lines = doc([
    ['인원', '성인 10명'],
    ['상품가격', '1인 1,000,000원'],
    ['견적 총액', '5,000,000원'],
  ]);
  /* preferGrand로 「이건 견적 총액이다」를 명시한다 — 양식 판별이 아니라 방향 규칙을 잰다 */
  const rec = X.reconcile(lines, [], 5000000, {});
  const c = chk(rec, C1);
  ok('분모가 「총계」다', !!c && c.basis === 'grand', c && c.basis);
  ok('🔴 아래로 벌어져도 깨진다', !!c && c.ok === false, c && JSON.stringify(c));
}

/* ══ [5] 검산 ② — 같은 줄을 두 번 세면 잡히는가 ══ */
console.log('\n[5] 뽑은 줄 합계가 총계를 넘으면 잡히는가');
{
  const lines = doc([
    ['인원', '성인 10명'],
    ['합계', '1,000,000원'],
  ]);
  const over = [{ total: 900000 }, { total: 900000 }];   /* 같은 줄을 두 번 셌다 */
  const under = [{ total: 400000 }, { total: 300000 }];
  ok('🔴 넘으면 깨진다', chk(X.reconcile(lines, over, null, {}), C2).ok === false);
  ok('✓ 안 넘으면 통과', chk(X.reconcile(lines, under, null, {}), C2).ok === true);
}

/* ══ [6] 감사기와 추출기가 같은 폭을 쓰는가 (결함 생성기 ①) ══ */
console.log('\n[6] 감사기가 추출기와 **같은 허용폭**을 적어 두었는가');
{
  const src = fs.readFileSync(path.join(__dirname, 'audit_self_checks.js'), 'utf8');
  const auditTol = /const TOL = ([0-9.]+);/.exec(src);
  const extSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'pdf_extract.js'), 'utf8');
  ok('감사기에 TOL이 있다', !!auditTol, String(auditTol));
  ok('추출기의 허용폭과 같다(0.015)',
    !!auditTol && Number(auditTol[1]) === 0.015 && /near\(calc, perPerson, 0\.015\)/.test(extSrc),
    auditTol && auditTol[1]);
  /* 감사기가 추출기와 **같은 분모**를 쓰는가 — 한쪽만 grand를 보면 감사기가 「0건」이라
     말하는데 추출기는 계속 깨진다(결함 생성기 ①). 실제로 처음 판이 그랬다. */
  ok('감사기도 grand 없으면 itemsTotal로 잰다',
    /r\.grandTotal \|\| r\.itemsTotal/.test(src));
}

/* ══ [7] 안전망이 **읽히는 자리에 있는가** — 감사기가 존재하는가 (결함 생성기 ③) ══ */
console.log('\n[7] 검산 결과를 읽는 곳이 실제로 있는가');
{
  ok('audit_self_checks.js가 있다',
    fs.existsSync(path.join(__dirname, 'audit_self_checks.js')));
  const src = fs.readFileSync(path.join(__dirname, 'audit_self_checks.js'), 'utf8');
  ok('그 감사기가 reconciliation.checks를 읽는다', /reconciliation/.test(src) && /checks/.test(src));
  ok('「통과」와 「대조됨」을 갈라 센다 — 원가 시트를 깨끗한 문서로 세지 않는다',
    /matched1/.test(src) && /dirOk1/.test(src));
  ok('README가 이 도구를 안내한다',
    /audit_self_checks\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — WD 추출기 자기검산`);
process.exit(fail ? 1 : 0);

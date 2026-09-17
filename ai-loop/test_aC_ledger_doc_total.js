/* ═══════════════════════════════════════════════════════════════════════════
   대장이 보여주는 금액 = **고객이 실제로 받은 금액**인가 (2026-09-17)
   ───────────────────────────────────────────────────────────────────────────
   ■ 무엇을 막는가
   대장은 오랫동안 `payload.t`(견적 산출 당시 총액)만 보여줬다. 그런데 고객이 여는
   견적서(v2)는 **`payload.doc`을 그린다** — 그리고 둘은 같을 의무가 없다.
   담당자가 문서에서 단가를 조정해 발급하는 것이 정상 업무이기 때문이다
   (`api/quote-shares.js`: 「담당자 발급은 검증 결과를 기록만 하고 막지 않는다」).

   🔴 **실측(2026-09-17 백업)**: 발급 26건 중 doc이 붙은 1건에서
      대장 20,791,309원 · 고객 문서 18,712,180원 — **정확히 −10.00%**.
      어긋남을 알려 주는 것이 아무 데도 없었다.

   대장의 존재 이유가 「우리가 그 금액을 낸 적 있다」는 기록이다. 고객이 못 본 금액을
   적어 두면 이어받은 사람이 틀린 값으로 응대한다 — 그 자리가 금액 분쟁이 된다.

   ■ ⚠ 일부러 망가진 입력을 넣어 **잡히는지**까지 본다 (CLAUDE.md 결함 생성기 ③)
   규칙만 읽고 「있으니 되겠지」로 끝내지 않는다. doc이 있는 행·없는 행·금액이 0인 행·
   깨진 행을 모두 넣고, 잡아야 할 것만 잡는지 센다.

       node ai-loop/test_aC_ledger_doc_total.js
   ═══════════════════════════════════════════════════════════════════════════ */
/* eslint-disable no-console */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost/db';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const shares = require(path.join(ROOT, 'api/quote-shares.js'));
const QDOC = require(path.join(ROOT, 'quote_doc.js'));

let pass = 0;
let fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('■ 대장 금액 — 고객이 받은 견적서의 금액을 보여주는가\n');

/* ── [1] 함수가 노출돼 있는가 ──────────────────────────────────────────────
   ⚠ 인라인으로 두면 DB 없이는 한 줄도 못 잰다. 노출 자체가 안전망의 조건이다. */
ok(typeof shares.applyDocTotals === 'function',
  '[1] applyDocTotals가 검사에서 불릴 수 있다');

if (typeof shares.applyDocTotals !== 'function') {
  console.log('\n결과: ' + pass + ' pass / ' + (fail + 1) + ' fail');
  process.exit(1);
}
const apply = shares.applyDocTotals;

/* ── [2] 실제로 어긋나 있던 그 건 ──────────────────────────────────────────
   2026-09-17 백업의 Q260917-02. 숫자를 그대로 박아 둔다 — 「이런 일이 실제로
   있었다」가 이 검사의 근거이고, 나중에 규칙이 바뀌면 여기서 걸려야 한다. */
{
  const rows = [{
    quote_no: 'Q260917-02',
    total: '20791309',
    docprice: { lines: [{ qty: 10, unit: 1871218, kind: 'adult', label: '성인' }] },
  }];
  apply(rows);
  const r = rows[0];
  ok(r.total === '18712180', '[2-a] 대장 총액이 고객 문서 금액이 된다 (18,712,180)', r.total);
  ok(r.totalQuoted === '20791309', '[2-b] 산출 당시 금액을 함께 남긴다 (20,791,309)', r.totalQuoted);
  ok(r.totalDrift === -10, '[2-c] 어긋난 폭을 −10.00%로 잰다', String(r.totalDrift));
}

/* ── [3] doc이 없으면 건드리지 않는다 ──────────────────────────────────────
   옛 양식(v1)은 payload의 항목을 그리므로 `t`가 곧 고객이 본 금액이다.
   2026-09-17 기준 발급 26건 중 25건이 여기 해당한다 — 여기서 값이 움직이면
   멀쩡한 대장 25줄이 통째로 틀어진다. */
{
  const rows = [
    { quote_no: 'A', total: '5000000', docprice: null },
    { quote_no: 'B', total: '7000000' },
  ];
  apply(rows);
  ok(rows[0].total === '5000000' && rows[1].total === '7000000',
    '[3-a] doc이 없으면 총액을 그대로 둔다');
  ok(rows[0].totalQuoted === undefined && rows[1].totalQuoted === undefined,
    '[3-b] doc이 없으면 어긋남 표시도 안 붙는다');
}

/* ── [4] 같으면 표시를 안 붙인다 ───────────────────────────────────────────
   ⚠ 늘 붙는 표시는 곧 아무도 안 읽는다(결함 생성기 ③ — 「늘 ✗인 잣대」). */
{
  const rows = [{ quote_no: 'C', total: '3000000', docprice: { lines: [{ qty: 3, unit: 1000000 }] } }];
  apply(rows);
  ok(rows[0].total === '3000000', '[4-a] 금액이 같으면 총액이 그대로다');
  ok(rows[0].totalQuoted === undefined && rows[0].totalDrift === undefined,
    '[4-b] 금액이 같으면 ⚠ 표시가 안 붙는다');
}

/* ── [5] 단가 줄이 화면으로 새지 않는다 ────────────────────────────────────
   🔴 `docprice`에는 **단가**가 들어 있다. 대장 목록은 담당자 화면이라 원가 유출은
     아니지만, 쓰지 않는 값을 목록마다 실어 보내면 응답이 무거워지고 언제 어디로
     흘러갈지 모르게 된다. 계산에 쓰고 **반드시 지운다.** */
{
  const rows = [{ quote_no: 'D', total: '100', docprice: { lines: [{ qty: 1, unit: 100 }] } }];
  apply(rows);
  ok(!('docprice' in rows[0]), '[5] 계산에 쓴 뒤 docprice를 지운다');
}

/* ── [6] 망가진 입력으로 목록을 죽이지 않는다 ──────────────────────────────
   ⚠ 대장의 일은 **찾는 것**이다. 한 줄이 이상하다고 26줄을 못 보면 안 된다
     (차수 계산이 실패해도 목록을 내주는 것과 같은 원칙). */
{
  const rows = [
    { quote_no: 'E', total: '1000', docprice: { lines: 'not-an-array' } },
    { quote_no: 'F', total: '2000', docprice: {} },
    { quote_no: 'G', total: '3000', docprice: { lines: [] } },
    { quote_no: 'H', total: '4000', docprice: { lines: [{ qty: 0, unit: 999 }] } },
    { quote_no: 'I', total: '5000', docprice: { lines: [{ qty: 2, unit: 3000 }] } },
  ];
  let threw = null;
  try { apply(rows); } catch (err) { threw = err; }
  ok(!threw, '[6-a] 망가진 행이 있어도 안 터진다', threw && threw.message);
  ok(rows[0].total === '1000' && rows[1].total === '2000'
     && rows[2].total === '3000' && rows[3].total === '4000',
    '[6-b] 문서 금액이 0이면 산출 총액을 그대로 둔다');
  ok(rows[4].total === '6000' && rows[4].totalDrift === 20,
    '[6-c] 그 뒤 멀쩡한 행은 그대로 계산된다 (+20%)', rows[4].total + '/' + rows[4].totalDrift);
}

/* ── [7] 🔴 합산 규칙을 여기 다시 적지 않았는가 ────────────────────────────
   `금액 = 단가 × 인원`을 정하는 곳은 `quote_doc.js`의 `normalize` 하나다.
   대장이 제 나름의 `reduce`를 갖고 있으면 10+1 같은 규칙이 바뀌는 날 대장만
   옛 규칙으로 남는다(결함 생성기 ①). **두 경로가 같은 답을 내는지**로 잰다. */
{
  const lines = [{ qty: 7, unit: 1234567 }, { qty: 2, unit: 50000 }];
  const viaDoc = QDOC.normalize({ price: { lines } }).price.total;
  const rows = [{ quote_no: 'J', total: '1', docprice: { lines } }];
  apply(rows);
  ok(String(viaDoc) === rows[0].total,
    '[7] 대장의 금액과 quote_doc의 금액이 같다 (규칙이 한 벌이다)',
    viaDoc + ' vs ' + rows[0].total);
}

/* ── [8] 🔴 일부러 규칙을 어긋나게 해 보고 **잡히는지** 확인 ────────────────
   위 [7]이 진짜 대조를 하고 있는지 스스로 검산한다. 단가를 바꿔 넣으면 두 값이
   달라져야 한다 — 안 달라지면 [7]은 늘 통과하는 빈 검사다. */
{
  const rows = [{ quote_no: 'K', total: '1', docprice: { lines: [{ qty: 3, unit: 1000 }] } }];
  apply(rows);
  const wrong = QDOC.normalize({ price: { lines: [{ qty: 3, unit: 1001 }] } }).price.total;
  ok(String(wrong) !== rows[0].total,
    '[8] 단가가 다르면 두 값이 달라진다 ([7]이 빈 검사가 아니다)');
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

/* ═══════════════════════════════════════════════════════════════════════════
   견적 관리 「⚠ 확인 필요」가 **무엇이 문제인지 말하는가** (2026-10-06 대표 지적)
   ───────────────────────────────────────────────────────────────────────────
   ■ 무슨 일이 있었나
   견적 관리 목록에 「⚠ 확인 필요」만 떠서 무엇이 문제인지 알 수 없었다(마우스를 올려야
   「sum, split」 같은 영문 단계 이름이 보였다).
   운영 백업으로 실측(2026-10-06): 걸린 1건은 **담당자가 「현장 부대비용」을 자동값보다 올려 고친 것**
   이었고, 합계 차이가 그 수정 + 반올림 잔차로 **정확히** 설명됐다. 서버 검증은 엔진이 계산한
   항목만 더해 총액과 맞춰 보므로, 정상 손질도 조작과 같은 배지를 받고 있었다.

   ■ 이 검사가 지키는 것
   ① 담당자 손질(고친 줄 · 실무 변수)로 **전부 설명되면** 경고가 아니라 「✎ 직접 수정 +금액」(회색)
   ② 설명 안 되는 몫이 남으면 「⚠ 합계 불일치 +그 몫」 — 손질로 덮이지 않는다
   ③ 합계가 아닌 단계(요율 기준월 등)가 걸리면 **그 단계 이름**을 말한다(영문 id가 아니라)
   ④ 검증을 못 했으면 「검증 못함」
   ⑤ 수정 기록이 없는 건(고객 직접)은 설명하지 않는다 — 차이 금액만 경고로
   ⑥ 상세 창: 전부 설명되면 「무엇을 얼마에서 얼마로」 표, 아니면 기존 경고 + 남는 몫
   ⚠ 숫자는 실제 건과 **구조만 같은 가상 값**이다(고객 정보 없음).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* estmgr.js는 선언만 두지만 실행문 몇 줄(window·document에 귀를 다는 것)이 있다 — 빈 창·빈 문서로 받는다 */
const win = { addEventListener() {}, location: { origin: 'http://x' } };
const ctx = vm.createContext({ esc, console, window: win, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  localStorage: { getItem: () => '[]', setItem() {} }, Math, Number, String, Array, JSON, Object });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'admin', 'estmgr.js'), 'utf8')
  + '\n;this.__T = { verifyExplain, verifyBadgeHtml, verifyDetailHtml };', ctx);
const { verifyExplain, verifyBadgeHtml, verifyDetailHtml } = ctx.__T;

const STEP_LABELS = [
  ['sum', '항목 합계 × 계수 = 총액'], ['split', '공개 + 비공개×계수 = 총액'],
  ['freshness', '요율 기준월 일치'], ['perperson', '1인당 × 인원 = 총액'],
];
function verify(failedIds) {
  return {
    verdict: 'review', failedSteps: failedIds,
    steps: STEP_LABELS.map(([id, label]) => ({ id, label, ok: failedIds.indexOf(id) < 0, detail: '' })),
  };
}
/* 가상 견적 — 항목 합 1,000,000 · 담당자가 「현장비」를 100,000 → 300,000으로 올림 · 잔차 4 */
function quote(over) {
  const base = {
    participants: 10, combinedFactor: 1, total: 1200004,
    items: [{ name: '항공', amount: 600000 }, { name: '현장비', amount: 100000 }, { name: '본사 수익', amount: 300000 }],
    _verify: verify(['sum', 'split']),
    doc: { _internal: { residual: 4, adjust: [], overrides: [{ label: '현장비', autoAmount: 100000, amount: 300000 }] } },
  };
  return Object.assign(base, over || {});
}

console.log('\n[1] 담당자 손질로 전부 설명되면 「✎ 직접 수정」(경고 아님)');
{
  const q = quote();
  const x = verifyExplain(q);
  ok('① 판정 = edit', x && x.kind === 'edit', x && x.kind);
  const b = verifyBadgeHtml(q);
  ok('① 배지가 「✎ 직접 수정 +20만」', /✎ 직접 수정 \+20만/.test(b), b);
  ok('① 회색 배지(badge-edited) — 경고 색이 아니다', /badge-edited/.test(b) && !/badge-pend/.test(b), b);
  ok('① 마우스를 올리면 무엇을 얼마에서 얼마로 고쳤는지', /현장비: 100,000 → 300,000/.test(b), b);
  const d = verifyDetailHtml(q);
  ok('① 상세: 「담당자가 직접 고친 금액」 표', /담당자가 직접 고친 금액/.test(d) && /<table/.test(d) && /현장비/.test(d), d.slice(0, 120));
  ok('① 상세: 경고 문구(「금액 조작일 수도」)를 안 띄운다', !/조작일 수도/.test(d));
}

console.log('\n[1-b] 실무 변수(adjust)도 설명에 든다');
{
  const q = quote({ total: 1250004 });
  q.doc._internal.adjust = [{ label: '현지 행사비', amount: 50000, kind: 'cost' }];
  const x = verifyExplain(q);
  ok('① 실무 변수까지 더하면 설명된다', x.kind === 'edit', JSON.stringify(x && x.unexplained));
  ok('① 배지 금액은 전체 차이(+25만)', /\+25만/.test(verifyBadgeHtml(q)), verifyBadgeHtml(q));
}

console.log('\n[2] 🔴 설명 안 되는 몫이 남으면 경고 + 그 몫');
{
  const q = quote({ total: 1500004 });   /* 손질은 +20만인데 차이는 +50만 → 30만이 남는다 */
  const x = verifyExplain(q);
  ok('② 판정 = mismatch', x.kind === 'mismatch', x.kind);
  const b = verifyBadgeHtml(q);
  ok('② 배지가 「⚠ 합계 불일치 +30만」(남는 몫)', /⚠ 합계 불일치 \+30만/.test(b), b);
  ok('② 경고 색(badge-pend)', /badge-pend/.test(b), b);
  const d = verifyDetailHtml(q);
  ok('② 상세: 남는 몫을 말한다', /\+30만가 설명되지 않습니다/.test(d), d.slice(-300));
  ok('② 상세: 기존 경고 문구도 그대로', /조작일 수도/.test(d));
}

console.log('\n[3] 합계가 아닌 단계가 걸리면 그 단계 이름');
{
  const q = quote({ _verify: verify(['sum', 'split', 'freshness']) });
  const x = verifyExplain(q);
  ok('③ 손질로 덮지 않는다(판정 ≠ edit)', x.kind === 'other', x.kind);
  const b = verifyBadgeHtml(q);
  ok('③ 배지가 한글 단계 이름 「요율 기준월 일치」', /요율 기준월 일치/.test(b) && !/freshness/.test(b.replace(/title="[^"]*"/, '')), b);
}

console.log('\n[4] 검증을 못 했으면 「검증 못함」');
{
  const q = quote({ _verify: { verdict: 'unavailable', failedSteps: [], steps: [] } });
  ok('④ 「검증 못함」', /검증 못함/.test(verifyBadgeHtml(q)), verifyBadgeHtml(q));
}

console.log('\n[5] 수정 기록이 없는 건(고객 직접)은 설명하지 않는다');
{
  const q = quote({ doc: null });
  const x = verifyExplain(q);
  ok('⑤ 판정 = mismatch(설명 재료 없음)', x.kind === 'mismatch', x.kind);
  ok('⑤ 배지 금액 = 전체 차이(+20만)', /⚠ 합계 불일치 \+20만/.test(verifyBadgeHtml(q)), verifyBadgeHtml(q));
}

console.log('\n[6] 통과한 건은 아무것도 안 띄운다');
{
  const q = quote({ _verify: { verdict: 'verified', failedSteps: [], steps: [] } });
  ok('⑥ 배지 없음', verifyBadgeHtml(q) === '');
  ok('⑥ 상세 없음', verifyDetailHtml(q) === '');
}

console.log(`\n결과: ${pass} pass / ${fail} fail  — aN 검증 배지가 무엇이 문제인지 말한다`);
process.exit(fail ? 1 : 0);

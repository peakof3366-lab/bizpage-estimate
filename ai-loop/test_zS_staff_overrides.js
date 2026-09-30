/* ═══════════════════════════════════════════════════════════════════════════
   zS — 담당자 수정 기록 감사(`audit_staff_overrides.js`)가 **제 일을 하는가**

   이 도구는 나중에 요율 수정 제안의 근거가 된다. 그래서 틀리게 세면 곧바로
   틀린 요율로 이어진다. 일부러 망가뜨린 입력을 넣어 잡히는지 본다(결함 생성기 ③).

     ① 문턱을 **모두** 넘어야 점검 후보가 된다 (3건 · 같은 방향 · ±5%)
     ② 🔴 대표 계정의 수정은 근거로 세지 않는다 — 시험이 요율 근거로 둔갑하지 않게
     ③ 🔴 깨진 `_internal`을 조용히 건너뛰지 않는다 — 「읽을 수 없음」으로 센다
     ④ 취소(`void`) 견적은 뺀다
     ⑤ 같은 견적의 수정 여러 번은 1건으로 센다 (한 건을 세 번 저장해 후보가 되면 안 된다)
     ⑥ 등급·차종 꼬리표가 달라도 같은 항목으로 묶는다
   ═══════════════════════════════════════════════════════════════════════════ */
const { analyze, itemKey } = require('./audit_staff_overrides.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const STAFF = [
  { username: 'boss', display_name: '대표', role: 'owner' },
  { username: 'kim', display_name: '김담당', role: 'staff' },
];
let seq = 0;
function quote(dest, who, overrides, extra = {}) {
  seq++;
  return {
    id: 'q' + seq, quote_no: 'BP-T-' + seq, status: 'new', total: 1000000,
    payload: { destKey: dest, createdBy: who, doc: { _internal: { overrides, adjust: [] } } },
    ...extra,
  };
}
const ov = (label, auto, amount) => ({ label, autoAmount: auto, amount });
const group = (r, dest, item) => r.groups.find((g) => g.dest === dest && g.item === item);

console.log('\n① 문턱');
{
  const r = analyze({ staff_accounts: STAFF, quotes: [
    quote('오키나와', '김담당', [ov('식사', 100, 80)]),
    quote('오키나와', '김담당', [ov('식사', 100, 85)]),
    quote('오키나와', '김담당', [ov('식사', 100, 78)]),
    quote('다낭', '김담당', [ov('식사', 100, 80)]),
    quote('다낭', '김담당', [ov('식사', 100, 85)]),
    quote('발리', '김담당', [ov('관광', 100, 80)]),
    quote('발리', '김담당', [ov('관광', 100, 120)]),
    quote('발리', '김담당', [ov('관광', 100, 90)]),
    quote('삿포로', '김담당', [ov('가이드', 100, 102)]),
    quote('삿포로', '김담당', [ov('가이드', 100, 103)]),
    quote('삿포로', '김담당', [ov('가이드', 100, 101)]),
  ] });
  ok(group(r, '오키나와', '식사').candidate, '3건 · 전부 내림 · 중앙값 −20% → 후보');
  ok(!group(r, '다낭', '식사').candidate, '2건뿐 → 후보 아님');
  ok(!group(r, '발리', '관광').candidate && group(r, '발리', '관광').why.includes('방향이 갈린다'), '방향이 갈리면 후보 아님');
  ok(!group(r, '삿포로', '가이드').candidate, '중앙값 +2% → 후보 아님');
}

console.log('\n② 대표 수정');
{
  const r = analyze({ staff_accounts: STAFF, quotes: [
    quote('오키나와', '대표', [ov('식사', 100, 80)]),
    quote('오키나와', '대표', [ov('식사', 100, 80)]),
    quote('오키나와', '대표', [ov('식사', 100, 80)]),
  ] });
  const g = group(r, '오키나와', '식사');
  ok(!g.candidate, '대표가 세 번 고쳐도 후보가 안 된다');
  ok(g.owner.length === 3 && g.staff.length === 0, '대표 수정은 따로 보여 준다');
  ok(r.byWho.owner === 3 && r.byWho.staff === 0, '만든 사람을 역할로 가른다');
}

console.log('\n③ 깨진 입력');
{
  const r = analyze({ staff_accounts: STAFF, quotes: [
    { id: 'x1', quote_no: 'BP-X-1', status: 'new', payload: { createdBy: '김담당', doc: {} } },
    { id: 'x2', quote_no: 'BP-X-2', status: 'new', payload: { createdBy: '김담당', doc: { _internal: { overrides: 'oops' } } } },
    quote('오키나와', '김담당', [ov('식사', 0, 80)]),
    { id: 'x4', quote_no: 'BP-X-4', status: 'new', payload: { createdBy: '' } },
  ] });
  ok(r.unreadable.length === 3, '_internal 없음 · overrides가 배열 아님 · 엔진값 0 → 「읽을 수 없음」 3건 (실제 ' + r.unreadable.length + ')');
  ok(r.noDoc === 1, '문서 없는 견적(고객 직접)은 따로 센다');
  ok(r.edits.length === 0, '깨진 값으로 비율을 만들지 않는다');
  let threw = false; try { analyze({}); } catch (e) { threw = true; }
  ok(!threw, '빈 백업에서도 죽지 않는다');
}

console.log('\n④ 취소 견적');
{
  const r = analyze({ staff_accounts: STAFF, quotes: [
    quote('오키나와', '김담당', [ov('식사', 100, 80)], { status: 'void' }),
    quote('오키나와', '김담당', [ov('식사', 100, 80)]),
  ] });
  ok(r.voided === 1 && r.edits.length === 1, 'void는 빼고 뺀 수를 센다');
}

console.log('\n⑤ 같은 견적 여러 줄');
{
  const q = quote('오키나와', '김담당', [ov('식사', 100, 80), ov('식사 (특식)', 100, 80), ov('식사', 100, 70)]);
  const r = analyze({ staff_accounts: STAFF, quotes: [q] });
  const g = group(r, '오키나와', '식사');
  ok(g.quotesN === 1 && !g.candidate, '한 견적의 수정 3줄은 견적 1건으로 센다');
}

console.log('\n⑥ 항목 이름');
ok(itemKey('호텔 (4성급)') === '호텔', '「호텔 (4성급)」 → 호텔');
ok(itemKey('차량 (소형 · 자동적용)') === '차량', '「차량 (소형 · 자동적용)」 → 차량');
ok(itemKey('💼 본사 수익') === '본사 수익', '이모지를 뗀다');
ok(itemKey('') === '(이름 없음)', '빈 이름을 빈 문자열로 두지 않는다');

console.log(`\n결과: ${pass} pass / ${fail} fail  — zS 담당자 수정 기록 감사`);
process.exit(fail ? 1 : 0);

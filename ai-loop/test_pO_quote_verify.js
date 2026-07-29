/* PO 검증: 서버측 견적 검증 + 공유 링크 발급 게이트.

   배경 — 계산은 전부 브라우저에서 일어나고 서버에는 엔진이 없다. 예전엔
   ① 고객이 조작한 금액을 서버가 그대로 저장했고
   ② 견적 내용을 통째로 URL에 담은 ?d= 링크를 우리 도메인에서 렌더했다.
   즉 누구든 임의 금액의 '우리 회사 견적서'를 만들 수 있었고 발급 기록도 없었다.

   이제 링크는 검증을 통과한 견적에만 발급되고 내용은 DB에만 있다.
   ⚠ 이 파일이 지키는 건 '검증이 실제로 작동하는가'다. 검증 자체의 한계
   (계수와 금액을 앞뒤 맞게 바꾼 미세 조작은 못 잡음)는 quote_verify.js 주석 참고.
   실행: node ai-loop/test_pO_quote_verify.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { verifyQuote, perPersonBand, FACTOR_RANGE } = require(path.join(ROOT, 'api', '_lib', 'quote_verify.js'));
const destinationRates = require(path.join(ROOT, 'data.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const BKK = destinationRates.find((d) => d.destination_key === '방콕');

/* 정상 견적 하나 — 실제 payload 모양을 최대한 따른다. */
function goodQuote(over = {}) {
  const items = [
    { name: '항공료', amount: 12000000, unit: 600000, qty: '20명', isHidden: false },
    { name: '호텔',   amount: 4000000,  unit: 200000, qty: '10실×4박', isHidden: false },
    { name: '마진',   amount: 3000000,  unit: 150000, qty: '20명', isHidden: true },
  ];
  const total = items.reduce((a, i) => a + i.amount, 0);
  const hidden = items.filter((i) => i.isHidden).reduce((a, i) => a + i.amount, 0);
  return {
    destination: '방콕', participants: 20, days: 5, startDate: '2027-05-10',
    total, perPerson: Math.round(total / 20),
    visibleTotal: total - hidden, hiddenTotal: hidden,
    items, rateDate: BKK.rateDate,
    paxFactor: 0.95, seasonFactor: 1.0, leadFactor: 1.0, peakFactor: 1.0,
    fxAdjust: 1.0, bizFactor: 1.0, departureFactor: 1.0,
    ...over,
  };
}
const CTX = { overrides: {}, coefficients: null };
const stepOf = (r, id) => r.steps.find((s) => s.id === id);

console.log('[1] 정상 견적은 통과한다 (정상 업무를 막으면 안 됨)');
const good = verifyQuote(goodQuote(), CTX);
ok('통과', good.ok, JSON.stringify(good.failedSteps));
ok("verdict가 'verified'", good.verdict === 'verified');
ok('모든 단계가 기록된다', good.steps.length >= 8, String(good.steps.length));

console.log('\n[2] 금액 조작을 잡는다');
const halved = goodQuote();
halved.total = Math.round(halved.total / 2);
halved.perPerson = Math.round(halved.total / 20);
const r2 = verifyQuote(halved, CTX);
ok('총액만 반으로 낮추면 실패', !r2.ok);
ok('항목 합계 불일치로 잡힘', stepOf(r2, 'sum') && !stepOf(r2, 'sum').ok);

const itemTampered = goodQuote();
itemTampered.items[0].amount = 1000;
itemTampered.total = itemTampered.items.reduce((a, i) => a + i.amount, 0);
itemTampered.perPerson = Math.round(itemTampered.total / 20);
itemTampered.visibleTotal = itemTampered.total - itemTampered.hiddenTotal;
const r3 = verifyQuote(itemTampered, CTX);
ok('항목까지 앞뒤 맞춰 낮춰도 1인당 상식 범위에서 잡힘', !r3.ok);
ok('상식 범위 단계가 실패', stepOf(r3, 'band') && !stepOf(r3, 'band').ok,
  stepOf(r3, 'band') && stepOf(r3, 'band').detail);

console.log('\n[3] 입력 위조를 잡는다');
ok('없는 목적지', !verifyQuote(goodQuote({ destination: '아틀란티스' }), CTX).ok);
ok('인원 0', !verifyQuote(goodQuote({ participants: 0 }), CTX).ok);
ok('인원 음수', !verifyQuote(goodQuote({ participants: -5 }), CTX).ok);
ok('일수 0', !verifyQuote(goodQuote({ days: 0 }), CTX).ok);
ok('일수 과다(61일)', !verifyQuote(goodQuote({ days: 61 }), CTX).ok);
ok('날짜 형식 오류', !verifyQuote(goodQuote({ startDate: 'tomorrow' }), CTX).ok);

console.log('\n[4] 계수 범위를 벗어나면 잡는다');
for (const [key, [lo, hi]] of Object.entries(FACTOR_RANGE)) {
  const low = verifyQuote(goodQuote({ [key]: lo - 0.5 }), CTX);
  const high = verifyQuote(goodQuote({ [key]: hi + 0.5 }), CTX);
  ok(`${key} 하한 미만 차단`, !low.ok && low.failedSteps.includes('factors'));
  ok(`${key} 상한 초과 차단`, !high.ok && high.failedSteps.includes('factors'));
}

console.log('\n[5] 산술 불일치를 잡는다');
ok('1인당 × 인원 ≠ 총액', !verifyQuote(goodQuote({ perPerson: 1 }), CTX).ok);
ok('공개+비공개 ≠ 총액', !verifyQuote(goodQuote({ visibleTotal: 1, hiddenTotal: 1 }), CTX).ok);
ok('항목 금액이 음수', !verifyQuote(goodQuote({
  items: [{ name: '항공료', amount: -100, isHidden: false }],
}), CTX).ok);

console.log('\n[6] 요율 신선도 — 조작이 아니라 낡음으로 구분한다');
const stale = verifyQuote(goodQuote({ rateDate: '2020-01' }), CTX);
ok('낡은 요율로 만든 견적은 걸린다', !stale.ok);
ok('신선도 단계에서 걸린다', stale.failedSteps.includes('freshness'));
ok("거부가 아니라 'review'로 분류", stale.verdict === 'review');

console.log('\n[7] 관리자 계수 노브가 바뀐 뒤 들어온 낡은 견적');
const drifted = verifyQuote(goodQuote({ coef: { seasonStrength: 1.0 } }),
  { ...CTX, coefficients: { seasonStrength: 1.5 } });
ok('노브 불일치를 잡는다', drifted.failedSteps.includes('coef'));
const same = verifyQuote(goodQuote({ coef: { seasonStrength: 1.5 } }),
  { ...CTX, coefficients: { seasonStrength: 1.5 } });
ok('같으면 통과', same.ok);

console.log('\n[8] 권위 요율(DB 오버라이드)을 반영한다');
const withOv = verifyQuote(goodQuote({ rateDate: '2099-01' }),
  { overrides: { 방콕: { rateDate: '2099-01' } }, coefficients: null });
ok('오버라이드된 기준월과 맞으면 통과', withOv.ok, JSON.stringify(withOv.failedSteps));

console.log('\n[9] 1인당 상식 범위가 요율에서 파생되는가 (고정 상수면 요율 인상 때 낡는다)');
const band5 = perPersonBand(BKK, 5), band10 = perPersonBand(BKK, 10);
ok('일수가 늘면 상한도 늘어난다', band10.ceil > band5.ceil, `${band5.ceil} → ${band10.ceil}`);
ok('하한이 항공+유류에서 파생', band5.floor === Math.round((BKK.airfare + BKK.fuel_surcharge) * 0.5));
/* 현행 55개 목적지의 '평범한 견적'이 전부 범위 안에 드는지 — 범위가 좁으면
   정상 견적이 검증 실패로 떨어져 링크가 안 나간다. */
let tooTight = 0;
for (const d of destinationRates) {
  const b = perPersonBand(d, 5);
  const typical = (d.airfare + d.fuel_surcharge) * 1.2 + d.hotel_per_room * 2
    + d.meal_per_person * 12 + d.guide_fee + d.sightseeing_fee + d.margin_per_traveler;
  if (typical < b.floor || typical > b.ceil) { tooTight++; console.log(`     · ${d.destination_key} 대표견적 ${Math.round(typical)} vs ${b.floor}~${b.ceil}`); }
}
ok('55개 목적지 대표 견적이 전부 범위 안', tooTight === 0, `${tooTight}곳 이탈`);

console.log('\n[10] 발급 경로 — 검증을 통과해야만 링크가 생긴다');
const shareSrc = read(path.join('api', 'quote-shares.js'));
ok('quote-shares가 검증기를 부른다', /verifyQuote\(verifyPayload, ctx\)/.test(shareSrc));
ok('고객 자동 발급은 실패 시 링크를 만들지 않는다',
  /if \(!result\.ok && !isStaffIssue\)[\s\S]{0,200}verdict: 'review'/.test(shareSrc));
ok('담당자 발급(?action=issue)은 인증을 요구한다', /isStaffIssue && !\(await requireAdmin/.test(shareSrc));
ok('권위 데이터를 못 읽으면 자동 발급을 막는다', /ctx\.unavailable && !isStaffIssue/.test(shareSrc));
ok('발급 기록(_verify)을 함께 저장', /issuedBy: isStaffIssue/.test(shareSrc));

const quotesSrc = read(path.join('api', 'quotes.js'));
ok('견적 저장 시에도 검증한다(2중)', /const verified = verifyQuote\(payload, vctx\)/.test(quotesSrc));
ok('검증 실패해도 견적은 저장한다(리드 유실 방지)', /insert into quotes/.test(quotesSrc));

console.log('\n[11] ?d= 위조 경로가 제거됐는가');
const viewSrc = read('estimate-view.html');
ok('decodeShareData 제거', !/function decodeShareData/.test(viewSrc));
ok('?d= 파라미터로 렌더하지 않는다', !/params\.get\('d'\)[\s\S]{0,120}atob/.test(viewSrc));
ok('구버전 링크 안내가 있다', /legacyLinkUsed\(\)/.test(viewSrc));
const scriptSrc = read('script.js');
ok('공개 계산기가 base64 링크를 만들지 않는다', !/estimate-view\.html\?d=/.test(scriptSrc));
ok('검증 중 UI가 있다', /id="share-verifying"/.test(scriptSrc));
ok('검토 필요 UI가 있다', /id="share-review"/.test(scriptSrc));
ok('검증 애니메이션에 reduced-motion 대응', /prefers-reduced-motion:reduce\)\{[\s\S]{0,160}bp-verify-orb/.test(scriptSrc));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

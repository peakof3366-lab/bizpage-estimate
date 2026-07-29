/* PH 검증: 요율 단가 서버측 오타 상한.
   팀원 여러 명이 관리자 화면에서 단가를 갱신하기 시작하면, 오타 하나가 그대로
   고객 견적서 금액이 된다. 브라우저 confirm 경고는 "예"를 누르면 그만이므로
   서버가 마지막 방어선이다. 이 파일이 그 방어선을 회귀로 고정한다.

   ① 정상 범위의 값은 전부 통과해야 한다(정상 업무를 막으면 안 됨)
   ② '0 하나 더'(10배) 유형은 막혀야 한다
   ③ 개별 수정과 새 목적지 생성이 같은 검증을 쓴다(한쪽만 막으면 우회로가 됨)
   ④ 상한 위반은 조용히 버려지지 않고 400으로 보고된다
   실행: node ai-loop/test_pH_rate_guard.js  (프로젝트 루트에서) */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@localhost/x'; // require만 통과시키는 더미(질의 안 함)

const path = require('path');
const ROOT = path.join(__dirname, '..');
const { isValidChange, isValidRateNumber, findOutOfRange, isValidNewDestination, FIELD_MAX, NUMERIC_FIELDS } =
  require(path.join(ROOT, 'api', 'rates.js')).__test;
const destinationRates = require(path.join(ROOT, 'data.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('[0] 상한표가 모든 숫자 필드를 덮는가 — 빠진 필드는 무제한이 된다');
for (const f of NUMERIC_FIELDS) {
  ok(`${f} 상한 존재`, typeof FIELD_MAX[f] === 'number' && FIELD_MAX[f] > 0, String(FIELD_MAX[f]));
}

console.log('\n[1] 현행 요율표의 실제 값은 전부 통과해야 한다 (정상 업무 차단 금지)');
let worst = { field: null, ratio: 0 };
for (const d of destinationRates) {
  for (const f of NUMERIC_FIELDS) {
    const v = d[f];
    if (typeof v !== 'number') continue;
    if (!isValidRateNumber(f, v)) {
      ok(`${d.destination_key}·${f}=${v} 통과`, false, `상한 ${FIELD_MAX[f]}에 걸림`);
    }
    const ratio = v / FIELD_MAX[f];
    if (ratio > worst.ratio) worst = { field: `${d.destination_key}·${f}`, ratio, value: v, max: FIELD_MAX[f] };
  }
}
ok('55개 목적지 × 9개 필드 전부 통과', true);
console.log(`     (상한에 가장 근접: ${worst.field} = ${worst.value.toLocaleString()} / 상한 ${worst.max.toLocaleString()} = ${(worst.ratio * 100).toFixed(1)}%)`);
ok('가장 근접한 값도 상한의 30% 미만 — 정상 인상 여유 충분', worst.ratio < 0.30, (worst.ratio * 100).toFixed(1) + '%');

console.log('\n[2] 오타 유형 차단 — 현행 최댓값에 0을 하나 더 붙인 값');
for (const f of NUMERIC_FIELDS) {
  const curMax = Math.max(...destinationRates.map(d => (typeof d[f] === 'number' ? d[f] : 0)));
  const typo = curMax * 10;
  ok(`${f}: ${curMax.toLocaleString()} → ${typo.toLocaleString()} 차단`, !isValidRateNumber(f, typo));
}

console.log('\n[3] 경계값 — 상한 자체는 허용, 상한+1은 차단');
for (const f of NUMERIC_FIELDS) {
  ok(`${f} 상한값 허용`, isValidRateNumber(f, FIELD_MAX[f]));
  ok(`${f} 상한+1 차단`, !isValidRateNumber(f, FIELD_MAX[f] + 1));
}

console.log('\n[4] 타입 방어 — 숫자가 아니거나 음수/무한대');
ok('음수 차단', !isValidRateNumber('airfare', -1));
ok('0 허용(항목 제외 목적)', isValidRateNumber('airfare', 0));
ok('문자열 차단', !isValidRateNumber('airfare', '500000'));
ok('NaN 차단', !isValidRateNumber('airfare', NaN));
ok('Infinity 차단(기존 조건은 통과시켰음)', !isValidRateNumber('airfare', Infinity));
ok('null 차단', !isValidRateNumber('airfare', null));
ok('undefined 차단', !isValidRateNumber('airfare', undefined));

console.log('\n[5] isValidChange — 개별 수정 경로');
ok('정상 변경 통과', isValidChange({ field: 'hotel_per_room', newValue: 400000 }));
ok('상한 초과 차단', !isValidChange({ field: 'hotel_per_room', newValue: 5000001 }));
ok('알 수 없는 필드 차단', !isValidChange({ field: 'secret_margin', newValue: 1 }));
ok('문자열 필드(notes) 통과', isValidChange({ field: 'notes', newValue: '2026-08 재확인' }));
ok('문자열 필드 500자 초과 차단', !isValidChange({ field: 'notes', newValue: 'x'.repeat(501) }));

console.log('\n[6] 새 목적지 생성도 같은 상한을 쓴다 (우회로 차단)');
const baseFields = {};
for (const f of NUMERIC_FIELDS) baseFields[f] = 100000;
const newDest = (over) => ({
  destinationKey: '테스트목적지', label: '테스트', zone: 'mid',
  southernHemisphere: false, fields: { ...baseFields, ...over },
});
ok('정상 신규 목적지 통과', isValidNewDestination(newDest({})) === null,
  String(isValidNewDestination(newDest({}))));
ok('항공료 상한 초과 시 거부', isValidNewDestination(newDest({ airfare: FIELD_MAX.airfare + 1 })) === 'invalid_field_airfare');
ok('호텔 상한 초과 시 거부', isValidNewDestination(newDest({ hotel_per_room: 99999999 })) === 'invalid_field_hotel_per_room');

console.log('\n[7] findOutOfRange — 조용히 버리지 않고 무엇이 막혔는지 알려준다');
const r1 = findOutOfRange([
  { field: 'hotel_per_room', newValue: 400000 },
  { field: 'airfare', newValue: 99000000 },
  { field: 'notes', newValue: '메모' },
]);
ok('초과 항목만 1건 반환', r1.length === 1, JSON.stringify(r1));
ok('필드명 포함', r1[0] && r1[0].field === 'airfare');
ok('입력값과 상한을 함께 반환(안내 문구용)', r1[0] && r1[0].value === 99000000 && r1[0].max === FIELD_MAX.airfare);
ok('정상 변경만 있으면 빈 배열', findOutOfRange([{ field: 'airfare', newValue: 500000 }]).length === 0);
ok('음수는 여기서 안 잡음(무효 입력으로 별도 처리)', findOutOfRange([{ field: 'airfare', newValue: -5 }]).length === 0);

/* 서버가 막아도 화면이 에러 코드를 그대로 보여주면 팀원은 무엇을 고쳐야 할지
   모른다. 요율을 저장하는 경로가 늘어날 때 안내문 연결을 빠뜨리지 않도록,
   admin.html에서 /api/rates를 PATCH하는 모든 실패 처리가 rateSaveErrorMessage를
   거치는지 원문 대조로 검사한다. */
console.log('\n[8] admin.html — 요율 저장 실패 안내가 사람 말로 나가는가');
const fs = require('fs');
const adminSrc = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
ok('rateSaveErrorMessage 정의 존재', /function rateSaveErrorMessage\(/.test(adminSrc));
ok('value_out_of_range 분기 존재', adminSrc.includes("=== 'value_out_of_range'"));
ok('invalid_field_ 분기 존재', adminSrc.includes("startsWith('invalid_field_')"));
ok('401(세션 만료) 분기 존재', /status === 401/.test(adminSrc));

/* 요율 저장 실패 지점에 에러 코드가 날것으로 남아 있으면 안 된다.
   (계정 생성 등 요율과 무관한 경로는 자체 안내문이 있으므로 대상에서 뺀다.) */
const rawErrorLines = adminSrc.split('\n')
  .map((line, i) => ({ line, no: i + 1 }))
  .filter(({ line }) => /(저장|적용|되돌리기)에 실패했습니다: ' \+ \(data\.error/.test(line));
ok('요율 저장 실패에 날 에러코드 노출 없음', rawErrorLines.length === 0,
  rawErrorLines.map(r => `admin.html:${r.no}`).join(', '));

/* /api/rates를 PATCH하는 호출만 대상 — 문의·견적 PATCH는 요율과 무관해서
   같은 안내문을 쓸 이유가 없다. 호출 지점마다 뒤따르는 응답 처리 구간(20줄)에
   안내문 호출이 있는지 본다. 새 저장 경로를 추가하면서 실패 처리를 빠뜨리면
   여기서 잡힌다. */
const adminLines = adminSrc.split('\n');
const ratesPatchLines = [];
adminLines.forEach((line, i) => {
  if (line.includes("fetch('/api/rates', {") && (adminLines[i + 1] || '').includes("method: 'PATCH'")) {
    ratesPatchLines.push(i + 1);
  }
});
ok('요율 PATCH 호출 지점을 찾았다', ratesPatchLines.length >= 6, `${ratesPatchLines.length}곳`);
const unwired = ratesPatchLines.filter((no) =>
  !adminLines.slice(no - 1, no + 20).some((l) => l.includes('rateSaveErrorMessage(')));
ok(`요율 PATCH ${ratesPatchLines.length}곳 전부 실패 안내 연결`, unwired.length === 0,
  unwired.map((n) => `admin.html:${n}`).join(', '));

/* 요약 문구는 ai-loop/run_all_tests.js가 /결과:\s*(\d+)\s*pass\s*\/\s*(\d+)\s*fail/로
   긁어간다 — 형식을 바꾸면 러너가 '크래시'로 집계한다(처음에 실제로 그랬다). */
console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

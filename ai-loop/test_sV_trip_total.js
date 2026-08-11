/* SV 검증 — 「전 일정 총액이 1일 단가 자리에 왔는가」

   왜 — 「검산 통과 = 맞는 값」이 아니다. 실측(신한 이태리):

       차량   8,848,000 × 3대 × 1 = 26,544,000     (5박6일)
       가이드 2,528,000 × 3명 × 1 =  7,584,000

   곱셈이 맞아떨어져 **검산을 통과한다.** 그런데 8,848,000은 하루치가 아니라
   **버스 한 대의 전 일정 총액**이다 — 6으로 나누면 1,474,667로 요율표 1,400,000과
   ±5% 안에 들어온다(가이드도 421,333 vs 435,000). 그대로 두면 +532% · +481%로 나간다.

   ⚠ **동료 비교로는 못 잡는다.** 그 지역 첫 견적서면 동료가 없어 ⚪「이 값이 기준선이
     된다」로 조용히 통과하고 **그 값이 그대로 요율 기준선이 된다.** 구멍이 거기였다.
     그래서 요율표 한 줄만 있으면 되는 이 검사가 따로 필요하다.

   ⚠ **가장 위험한 것은 오탐이다.** 기간을 이미 곱한 줄에 또 나누면 **맞는 값을 망가뜨린다.**
     실측(뉴퍼스트 다낭): 「797,500 × 1 × 4」의 4가 곧 일수라 797,500이 진짜 1일 단가다.
     그런데 요율표 180,000의 4.4배이고 ÷5하면 159,500(0.89배)이라 **검사 조건은 다 맞는다.**
     막는 것은 「수량·횟수가 기간을 설명하는가」 하나뿐이다 — 이 테스트가 그걸 지킨다.

   ⚠ **자동으로 고치지 않는다.** 나눗셈이 틀리는 경우가 실제로 있었다(몫이 개수가 아니라
     환율이었던 사고). 화면은 버튼을 띄우고 **사람이 누른다.**

   실행: node ai-loop/test_sV_trip_total.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const X = require('../api/_lib/pdf_extract.js');
const P = require('../plausibility.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ══ [1] 추출기 — 「이 줄이 기간을 곱했는가」만 남긴다 ═══════════════════ */
console.log('[1] 추출기는 구조적 사실만 남긴다 (요율표를 모른다)');

const row = (unit, qty, times) => ({ unit, qty, times, total: unit * qty * times, idx: 0, line: '' });

/* 이태리 모양 — 버스 3대 × 1회, 기간(6일)은 어디에도 안 곱해져 있다 */
ok('기간을 안 곱한 줄이면 covered=false',
  X.coversDuration(row(8848000, 3, 1), { days: 6, nights: 5 }).covered === false);
/* 뉴퍼스트 모양 — 「× 4」가 곧 일수다 */
ok('기간을 곱한 줄이면 covered=true',
  X.coversDuration(row(797500, 1, 4), { days: 5, nights: 4 }).covered === true);
ok('±1일은 같은 기간으로 본다 (5박6일 문서가 「×5」로 적는다)',
  X.coversDuration(row(100, 1, 5), { days: 6, nights: 5 }).covered === true);
ok('기간을 모르면 판단하지 않는다 (null)',
  X.coversDuration(row(100, 1, 1), { days: null, nights: null }) === null);
ok('박수만 있어도 일수를 만든다', (X.coversDuration(row(100, 1, 1), { days: null, nights: 5 }) || {}).days === 6);
ok('수량 1·횟수 1은 기간을 설명하지 못한다',
  X.coversDuration(row(100, 1, 1), { days: 6 }).covered === false);
/* ⚠ 인원수가 우연히 일수와 같으면? — 그래도 「기간을 곱했다」로 보고 **건드리지 않는다.**
   틀린 값을 고치는 것보다 맞는 값을 망가뜨리지 않는 것이 우선이다(빈칸 > 틀린 값). */
ok('애매하면 건드리지 않는 쪽으로 기운다', X.coversDuration(row(100, 6, 1), { days: 6 }).covered === true);

/* ══ [2] 판정 — 규칙은 plausibility.js 한 곳 ════════════════════════════ */
console.log('\n[2] 판정 규칙은 공용 잣대 한 곳에 있다');

const no = { days: 6, covered: false };   /* 기간을 안 곱했다 */
const yes = { days: 5, covered: true };   /* 기간을 곱했다 */

/* 이태리 실측 — 이 두 건이 이 기능을 만든 이유다 */
const it1 = P.judgeTripTotal(8848000, 1400000, no);
ok('이태리 차량을 잡는다', !!it1 && Math.round(it1.perDay) === 1474667, JSON.stringify(it1));
ok('나눈 값이 기준가와 ±5% 안이다', it1 && Math.abs(it1.ratioIfSplit - 1) < 0.06, it1 && it1.ratioIfSplit);
const it2 = P.judgeTripTotal(2528000, 435000, no);
ok('이태리 가이드를 잡는다', !!it2 && Math.round(it2.perDay) === 421333, JSON.stringify(it2));

/* ⚠ 오탐 방어 — 이게 이 테스트의 핵심이다 */
ok('**기간을 이미 곱한 줄은 절대 건드리지 않는다** (뉴퍼스트 다낭 797,500)',
  P.judgeTripTotal(797500, 180000, yes) === null);
ok('  ↑ 조건만 보면 걸릴 값이라는 것을 확인 (4.4배 · ÷5하면 0.89배)',
  797500 / 180000 > 3 && (797500 / 5) / 180000 > 0.5 && (797500 / 5) / 180000 < 2);
ok('기간을 모르면(duration null) 판단하지 않는다', P.judgeTripTotal(8848000, 1400000, null) === null);
ok('covered를 모르면(undefined) 판단하지 않는다',
  P.judgeTripTotal(8848000, 1400000, { days: 6 }) === null);
ok('기준가가 없으면 판단하지 않는다', P.judgeTripTotal(8848000, 0, no) === null);
ok('하루짜리는 나눌 것이 없다', P.judgeTripTotal(8848000, 1400000, { days: 1, covered: false }) === null);

/* 평범하게 비싼 값을 건드리지 않는다 */
ok('기준가의 3배 미만이면 말하지 않는다 (성수기·등급으로 벌어진다)',
  P.judgeTripTotal(1110000, 750000, no) === null);
/* 나눠도 안 맞으면 다른 원인이다 — 함부로 「총액이다」라고 하지 않는다 */
ok('나눠도 기준가에 안 맞으면 말하지 않는다', P.judgeTripTotal(50000000, 1400000, no) === null,
  JSON.stringify(P.judgeTripTotal(50000000, 1400000, no)));

ok('문구를 잣대가 만든다 (화면마다 다시 짓지 않는다)',
  /6일로 나누면/.test(P.describeTripTotal(it1, '차량')) && /확인해 주세요/.test(P.describeTripTotal(it1, '차량')));
ok('해당 없으면 문구도 없다', P.describeTripTotal(null, '차량') === '');
ok('1일 단가인 항목만 대상이다 (차량·가이드)',
  JSON.stringify(P.PER_DAY_FIELDS) === '["vehicle","guide"]', JSON.stringify(P.PER_DAY_FIELDS));

/* ══ [3] 추출기가 실제로 근거를 붙이는가 ═══════════════════════════════ */
console.log('\n[3] 추출기가 차량·가이드에 duration을 붙이는가');
const src = read('api/_lib/pdf_extract.js');
ok('차량에 duration을 붙인다', /vehicle: ev\(vehicle, \{ duration: coversDuration\(vehicle, dates\) \}\)/.test(src));
ok('가이드에 duration을 붙인다', /guide: ev\(guide, \{ duration: coversDuration\(guide, dates\) \}\)/.test(src));
ok('호텔·식비·관광에는 안 붙인다 (1일 단가가 아니다)',
  !/hotel: ev\(hotel, \{ duration/.test(src));
ok('왜 또 나누면 안 되는지 적혀 있다', /또 나누면/.test(src));

/* ══ [4] 감사기 — 검산 안 된 값도 **재는 대상**이다 ═══════════════════ */
console.log('\n[4] 감사기가 SN 원칙을 지키는가');
const aud = read('ai-loop/audit_extract_sanity.js');
ok('감사기가 공용 잣대를 쓴다', /P\.judgeTripTotal\(/.test(aud));
ok('감사기 안에 배수를 다시 적지 않았다', !/3;\s*\/\* 전 일정/.test(aud) && !/TRIP_TOTAL_MIN_RATIO\s*=/.test(aud));
/* ⚠ 처음에 「검산된 값이 없으면 return」 뒤에 뒀다가 푸켓·싱가포르가 통째로 빠졌다 */
const idxTrip = aud.indexOf('P.judgeTripTotal(');
const idxGate = aud.indexOf('if (!vals.length) { unverified.push(');
ok('**검산 여부를 보기 전에** 잰다 (자는 검산된 값만, 재는 대상은 전부)',
  idxTrip > 0 && idxGate > 0 && idxTrip < idxGate, idxTrip + ' vs ' + idxGate);
ok('그 순서를 왜 지켜야 하는지 적혀 있다', /재는 대상에서까지 빠져/.test(aud));

/* ══ [5] 화면 — 고치지 않고 묻는다 ═══════════════════════════════════ */
console.log('\n[5] 화면은 고치지 않고 묻는다');
const admin = read('admin.html');
ok('화면이 공용 잣대를 부른다', /PLAUSIBILITY\.judgeTripTotal\(/.test(admin));
ok('화면 안에 규칙을 다시 적지 않았다', !/8848000|1400000\s*\)/.test(admin));
ok('차량·가이드에만 건다', /PLAUSIBILITY\.PER_DAY_FIELDS \|\| \[\]\)\.indexOf\(key\) < 0/.test(admin));
ok('추출기가 남긴 duration을 쓴다', /ev\.duration/.test(admin));
ok('**자동으로 나누지 않고 버튼을 만든다**', /일로 나누기 →/.test(admin));
ok('누르면 무엇을 어떻게 바꿨는지 그 자리에 남긴다', /÷ \$\{trip\.days\}일 = /.test(admin));
/* 줄바꿈을 사이에 두고 적혀 있을 수 있다 — 문구가 아니라 **그 근거가 남아 있는지**를 잰다 */
ok('왜 자동으로 안 고치는지 적혀 있다', /몫이 개수가[\s\S]{0,24}환율/.test(admin));

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

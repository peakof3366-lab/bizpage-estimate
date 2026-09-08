/* ZG 검증: **블랙다운 원가를 요율표와 견주는 자** — 오늘 실제로 속은 자리를 고정한다.

   이 도구를 만들면서 **재는 자가 네 번 틀렸다.** 넷 다 「그럴듯한 숫자」로 나와서
   눈으로는 못 걸렀고, 폴더 이름·파일명과 대조해서야 잡혔다. 여기서 잠근다:

   ① **「세부내역」이 필리핀 세부로 세어졌다.** `NOT_A_DEST`가 「세부내역**서**」만
      지웠다. `유로존_… 스포 9일 - 세부내역(8.7).xlsx`(유럽)가 세부가 됐다.
   ② **표의 열 이름 「세부」가 목적지로 세어졌다.** 「항목 | 세부 | 단가 | 수량」과
      「세부 작성자 인원」. 푸꾸옥 원가 2건·곤명 1건이 세부로 들어갔고, 그 상태의
      「세부 4건」 표가 그럴듯하게 나왔다. **「세부」 하나만 걸려서 「여러 곳」 안전망이
      안 걸리는** 유형이다(아오모리→도쿄와 같다).
   ③ **`dayRows`를 일수로 썼다.** 「날짜처럼 보이는 칸이 있는 줄」의 수라 일수가 아니다
      (오키나와 4일 → 15). 그대로 뒀으면 멀쩡한 문서 10건이 「어긋남」으로 조용히 빠졌다.
   ④ **`destFromName`에 폴더가 든 경로를 넘겼다.** 「폴더는 근거가 아니다」라고 써 놓고
      폴더를 먹였다.

   그리고 이 도구의 뼈대 둘도 함께 잠근다:
   ⑤ **분모는 엔진이 쓰는 수여야 한다**(`_bd_cells`의 DENOM). 분모가 틀리면 그 위의
      모든 배수가 허수다 — 호텔 3.7배(YL)·식비 3.45배(RO)가 그렇게 났다.
   ⑥ **칸 분류표가 한 곳에만 있어야 한다**(결함 생성기 ①). `build_bd_db.js`가 제 사본을
      들고 있으면 두 도구가 다른 칸을 세게 된다.

   실행: node ai-loop/test_zG_bd_rate_gap.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = __dirname;
const { destFromName } = require(path.join(AI, '_dest_from_name.js'));
const { bdFacts, daysFromName, paxFromName, currencyOf } = require(path.join(AI, '_bd_facts.js'));
const { cellOf, CELL_TO_RATE, NOT_COMPARED } = require(path.join(AI, '_bd_cells.js'));
const { vehicleCapacity, roomsDouble } = require(path.join(AI, '_engine_consts.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 「세부내역」은 지명이 아니다 — 「서」가 없어도');
{
  const r = destFromName('유로존_2026.09(하나) QE00705559001 스포 9일 - 세부내역(8.7).xlsx');
  ok('① 세부(Cebu)로 세지 않는다', r.key !== '세부', JSON.stringify(r));
  ok('① 「세부내역서」도 여전히 지운다', destFromName('★세부내역서★ QJ00666408001.xlsx').key !== '세부');
  /* 진짜 세부 문서는 그대로 잡혀야 한다 — 미끼를 지우다 본체까지 지우면 안 된다 */
  ok('① 진짜 세부 문서는 잡는다',
    destFromName('QA00705563001_20261210_세부3박5일_20+0.xlsx').key === '세부',
    JSON.stringify(destFromName('QA00705563001_20261210_세부3박5일_20+0.xlsx')));
}

console.log('\n[2] 표의 열 이름 「세부」는 지명이 아니다 (본문 경로)');
{
  /* 실측 그대로 — 다모아 뉴월드/풀만 원가 시트의 표 머리 */
  const body1 = '추가비용(선정산) <추가비용> 항목 세부 단가 수량 소계 비고 예비비 푸꾸옥 리조트';
  const r1 = destFromName('AVQ351260820LJA 260820 뉴월드3박 111+2.xlsx', body1);
  ok('② 「항목 세부 단가」가 세부로 안 간다', r1.key !== '세부', JSON.stringify(r1));
  ok('② 같은 본문에서 진짜 지명(푸꾸옥)은 살아 있다', r1.key === '푸꾸옥', JSON.stringify(r1));

  /* 곤명 골프 문서의 머리줄 */
  const body2 = '세부 작성자 인원 F.O.C 비고 RATES 견적 산출일 16';
  const r2 = destFromName('(QC00599213001) 0328~0401 곤명 골프 KE 3박 5일 16+0.xlsx', body2);
  ok('② 「세부 작성자」가 세부로 안 간다', r2.key !== '세부', JSON.stringify(r2));

  /* 🔴 미끼가 하나뿐이면 「여러 곳」 안전망이 안 걸린다 — 그래서 미끼 목록이 필요하다 */
  ok('② 미끼가 하나뿐이라 「여러 곳」으로는 못 막는다(그래서 이 검사가 있다)',
    destFromName('아무이름.xlsx', '항목 세부 단가 수량').key === null);
}

console.log('\n[3] 일수·인원은 파일명에서 — 그리고 어긋나면 고르지 않는다');
{
  ok('③ 「나트랑3N5D」 → 5일', daysFromName('QA00697994001_261020_나트랑3N5D_글로벌금융.xlsx').days === 5);
  ok('③ 「4N6D」 → 6일', daysFromName('GA스타글로벌_261130_나트랑4N6D.xlsx').days === 6);
  ok('③ 「3박 5일」 → 5일', daysFromName('0328~0401 곤명 골프 KE 3박 5일 16+0.xlsx').days === 5);
  ok('③ 「후쿠오카3일」 → 3일', daysFromName('기260909 후쿠오카3일_SK가스.xlsx').days === 3);
  ok('③ 「도쿄 3일 (5명)」 → 3일', daysFromName('QJ00705879001_260821 SKT VIP 도쿄 3일 (5명).xlsx').days === 3);
  /* 🔴 날짜를 일수로 집지 않는다 — 「1028 1104」은 날짜다 */
  ok('③ 「1028 1104」을 일수로 안 집는다',
    daysFromName('QJ00710039001 1028 1104 S26 판매우수대리점 해외연수.xlsx').days === null,
    JSON.stringify(daysFromName('QJ00710039001 1028 1104 S26 판매우수대리점 해외연수.xlsx')));

  ok('③ 「62+2」 → 유상 62명', paxFromName('QA00699845002 투투 주부교실 62+2.xlsx') === 62);
  ok('③ 「(22명)」 → 22명', paxFromName('QJ00666408001_0618 북해도 4일 (22명).xlsx') === 22);
  ok('③ 「111+2」 → 111명 (무상은 뺀다)', paxFromName('260820 뉴월드3박 111+2 글로벌다모아.xlsx') === 111);

  /* 🔴 사평초 실측 — 머리글 2 vs 파일명 12. 한쪽을 고르면 1인 원가가 6배가 된다. */
  const f = bdFacts('[세부내역서] QJ00551391001 사평초 241015 4일 12명.xlsx', { pax: 2, days: null, nights: null }, '');
  ok('③ 인원이 어긋나면 conflict로 남긴다(고르지 않는다)', f.conflict.length > 0, JSON.stringify(f.conflict));
}

console.log('\n[4] 🔴 dayRows를 일수로 쓰지 않는다 (오늘 만든 결함)');
{
  /* 「오키나와 4일」 문서의 dayRows가 15였다. 힌트로 줘도 일수를 흔들면 안 된다. */
  const withHint = bdFacts('QJ00710039001 오키나와 4일 35명.xlsx', { pax: 35 }, '', { dayRows: 15 });
  const without = bdFacts('QJ00710039001 오키나와 4일 35명.xlsx', { pax: 35 }, '');
  ok('④ dayRows를 줘도 일수가 안 바뀐다', withHint.days === without.days && withHint.days === 4,
    JSON.stringify({ withHint: withHint.days, without: without.days }));
  ok('④ dayRows 때문에 conflict가 생기지 않는다', withHint.conflict.length === 0, JSON.stringify(withHint.conflict));
}

console.log('\n[5] 통화 — 문서가 밝힌 것만 믿는다');
{
  ok('⑤ 「요금(YEN)」 → JPY', currencyOf('구분 요금(YEN) AMOUNT TOTAL(YEN)').code === 'JPY');
  ok('⑤ 「비용(달러)」 → USD', currencyOf('구분 상세 비용(달러) 객실/인원').code === 'USD');
  ok('⑤ 「106.000엔」 → JPY', currencyOf('입금가 1인당: 106.000엔').code === 'JPY');
  /* 🔴 큐슈 문서의 함정 — 「원  가」는 열 이름이지 통화가 아니다(값은 엔이었다) */
  const krw = currencyOf('월 일 회수 인원 실원 원 가 비고');
  ok('⑤ 「원가」를 원화 확정으로 읽지 않는다', krw.code === 'KRW?' && krw.sure === false, JSON.stringify(krw));
}

console.log('\n[6] 분모는 **엔진이 쓰는 수**여야 한다');
{
  const cap = vehicleCapacity();
  /* 호텔: hotelUnit × rooms × nights, rooms = ceil(pax/2) */
  ok('⑥ 호텔 = 객실수 × 박수', CELL_TO_RATE.호텔.denom({ pax: 20, nights: 3 }) === roomsDouble(20) * 3);
  ok('⑥ 객실수는 2인 1실', roomsDouble(21) === 11);
  /* 식사: mealUnit × 인원 × 일수 (1인 1식이 아니다 — RO) */
  ok('⑥ 식사 = 인원 × 일수', CELL_TO_RATE.식사.denom({ pax: 20, days: 5 }) === 100);
  /* 차량: 대수 × 일수, 대수 = ceil(pax/정원) */
  ok('⑥ 차량 = 대수 × 일수 (26명이면 대형 1대)',
    CELL_TO_RATE.차량.denom({ pax: 26, days: 4 }) === Math.max(1, Math.ceil(26 / cap.large)) * 4);
  ok('⑥ 차량 칸이 인원으로 갈린다 (25명 소형 / 26명 대형)',
    CELL_TO_RATE.차량.field({ pax: 25 }) === 'vehicle_small'
    && CELL_TO_RATE.차량.field({ pax: 26 }) === 'vehicle_large');
  /* 가이드 = 차량 대수 (P13: 버스당 1명) */
  ok('⑥ 가이드 분모 = 차량 분모',
    CELL_TO_RATE.가이드.denom({ pax: 100, days: 5 }) === CELL_TO_RATE.차량.denom({ pax: 100, days: 5 }));
  /* 관광: 인원만 — 일수를 곱하지 않는다(PC: 전 일정 묶음) */
  ok('⑥ 관광 = 인원 (일수를 곱하지 않는다)', CELL_TO_RATE.관광.denom({ pax: 30, days: 9 }) === 30);
  /* 🔴 분모가 0이면 null — Infinity를 만들면 중앙값이 조용히 망가진다 */
  ok('⑥ 인원이 없으면 null (0으로 안 나눈다)',
    CELL_TO_RATE.식사.denom({ pax: 0, days: 5 }) === null
    && CELL_TO_RATE.호텔.denom({ pax: null, nights: 3 }) === null
    && CELL_TO_RATE.차량.denom({ pax: 10, days: 0 }) === null);
}

console.log('\n[7] 칸 분류표는 한 곳에만 있다 (결함 생성기 ①)');
{
  const src = fs.readFileSync(path.join(AI, 'build_bd_db.js'), 'utf8');
  ok('⑦ build_bd_db가 _bd_cells를 쓴다', /require\(['"]\.\/_bd_cells\.js['"]\)/.test(src));
  ok('⑦ build_bd_db가 CELL_RULES 사본을 안 들고 있다', !/const\s+CELL_RULES\s*=/.test(src));
  ok('⑦ build_bd_db가 cellOf 사본을 안 들고 있다', !/function\s+cellOf\s*\(/.test(src));
  /* 분류는 **구분 칸을 줄 이름보다 먼저** 본다 — 업체 이름은 규칙에 안 걸린다 */
  ok('⑦ 구분 칸이 줄 이름을 이긴다', cellOf('점보크랩', '식사') === '식사');
  ok('⑦ 모르는 것은 미분류로 센다', cellOf('헤난', '') === '미분류');
}

console.log('\n[8] 대조하지 않는 칸은 **이유와 함께** 남는다');
{
  ok('⑧ 항공·부대·미분류가 대조 대상이 아니다',
    ['항공', '부대', '미분류'].every((k) => NOT_COMPARED[k] && !CELL_TO_RATE[k]));
  ok('⑧ 대조하는 칸은 다섯', Object.keys(CELL_TO_RATE).length === 5);
}

/* ⚠ 이 줄의 형식은 `run_all_tests.js`가 정규식으로 찾는다 — 「결과: N pass / M fail」.
   다른 형식으로 쓰면 **통과해도 「크래시」로 세어진다**(실제로 한 번 그랬다).
   러너는 요약 줄을 못 찾으면 통과로 세지 않는다 — 조용한 성공 위장을 막는 장치다. */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

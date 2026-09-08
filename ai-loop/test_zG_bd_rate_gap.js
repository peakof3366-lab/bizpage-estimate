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
const { bdFacts, daysFromName, paxFromName, currencyOf, stripWidgets } = require(path.join(AI, '_bd_facts.js'));
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

  /* 🔴 통화 이름이 든 고유명사 — 실측 그대로(바르셀로나 문서) */
  const gaudi = currencyOf('바르셀로나 까사밀라 28 1 2912 바르셀로나 까사바트요 35 1 3640');
  ok('⑤ 「까사바트요」를 태국 바트로 안 읽는다', gaudi.code !== 'THB', JSON.stringify(gaudi));
  ok('⑤ 발신처 「유로존」을 유로로 안 읽는다', currencyOf('발신 김소미 드림 / 유로존 DATE').code !== 'EUR');
  ok('⑤ 숫자가 붙은 「5-10유로」는 유로로 읽는다',
    currencyOf('그룹이 인디비식으로 진행시 추가요금 발생되며 (1인 5-10유로 정도)').code === 'EUR');
}

console.log('\n[5b] 🔴 두 번째 훑기에서 나온 미끼 셋 (닫힌 32건 전수)');
{
  /* 「단**체코**드」 — 하나투어재팬 양식의 머리글 고정 항목. 일본 문서가 전부 동유럽으로 샜다. */
  const r1 = destFromName('도쿄 세부내역서.xlsx', '공급사 하나투어재팬 견적번호 QJ00706096001 단체코드 특이사항 도쿄');
  ok('⑨ 「단체코드」가 체코→동유럽으로 안 간다', r1.key === '도쿄', JSON.stringify(r1));
  /* 「아**로마** 맛사지」 — 하노이 문서 2건이 「하노이, 로마 여러 곳」이 됐다 */
  const r2 = destFromName('비코 블랙다운.xlsx', '하노이 시티투어 200000 42 1 아로마 맛사지 90분(팁포함)');
  ok('⑨ 「아로마 맛사지」가 로마로 안 간다', r2.key === '하노이', JSON.stringify(r2));
  /* 통화 이름 — 시트에 환율 위젯이 통째로 붙어 있다 */
  const r3 = destFromName('도쿄 견적.xlsx', '도쿄 홍콩 달러 HKD 대만 달러 TWD 체코 코루나 CZK 싱가포르 달러 SGD');
  ok('⑨ 「홍콩 달러」가 홍콩으로 안 간다', r3.key === '도쿄', JSON.stringify(r3));
  /* 🔴 다만 **진짜 홍콩 문서**는 그대로 잡혀야 한다 — 미끼를 지우다 본체를 지우면 안 된다 */
  ok('⑨ 진짜 홍콩 문서는 잡는다', destFromName('경기신용보증재단(홍콩) 견적.xlsx').key === '홍콩');
}

console.log('\n[5c] 시트에 붙은 환율 위젯을 걷어낸다');
{
  const raw = 'A <option value="51.12" label="1"> 체코 코루나 CZK</option> <option>홍콩 달러 HKD</option> B';
  const s = stripWidgets(raw);
  ok('⑩ option 안의 글자까지 지운다', !s.includes('체코') && !s.includes('홍콩'), s);
  ok('⑩ 나머지 글은 남는다', s.includes('A') && s.includes('B'), s);
  ok('⑩ 태그가 없으면 그대로', stripWidgets('요금(YEN) 37 명 4 박') === '요금(YEN) 37 명 4 박');
}

console.log('\n[5d] 표의 「박」·「일」 칸 — **서로 검산될 때만** 받는다');
{
  /* 실측: 도쿄 세부내역서. 호텔 4박 · 가이드 5일 · 차량 4일 → 4박5일 */
  const g = [[
    ['① 호텔', '신주쿠 워싱턴', 15500, 37, '명', 4, '박', 2294000],
    ['', '기사 숙박', 11000, 1, '명', 4, '박', 44000],
    ['④ 차량비', '대형버스', 125000, 1, '대', 4, '일', 500000],
    ['⑤ 가이드', '쓰루 가이드', 20000, 1, '명', 5, '일', 100000],
  ]];
  const f = bdFacts('도쿄 세부내역서.xlsx', { pax: 37 }, '', { grids: g });
  ok('⑪ 4박 + 5일 → 4박5일', f.days === 5 && f.nights === 4, JSON.stringify({ d: f.days, n: f.nights }));
  ok('⑪ 출처를 밝힌다', f.daysFrom === '표의 박·일 칸', f.daysFrom);

  /* 🔴 서로 안 맞으면 안 받는다 — 「차량 4일」만 보고 4일이라 하면 하루를 잃는다 */
  const g2 = [[['① 호텔', 'X', 100, 1, '명', 4, '박', 400], ['④ 차량', 'Y', 100, 1, '대', 4, '일', 400]]];
  const f2 = bdFacts('이름없음.xlsx', { pax: 30 }, '', { grids: g2 });
  ok('⑪ 4박 + 4일(안 맞음) → 안 받는다', f2.days === null, JSON.stringify({ d: f2.days }));

  /* 박만 있으면 안 받는다(검산할 짝이 없다) */
  const g3 = [[['① 호텔', 'X', 100, 1, '명', 3, '박', 300]]];
  ok('⑪ 「박」만 있으면 안 받는다', bdFacts('이름없음.xlsx', { pax: 30 }, '', { grids: g3 }).days === null);

  /* 파일명이 있으면 파일명이 먼저고, 표와 다르면 고르지 않는다 */
  const f4 = bdFacts('도쿄 3일 (5명).xlsx', { pax: 5 }, '', { grids: g });
  ok('⑪ 파일명 3일 vs 표 5일 → conflict', f4.conflict.length > 0, JSON.stringify(f4.conflict));
}

console.log('\n[5e] 본문의 「N박M일」 — 머리글이 못 읽은 것을 줍는다');
{
  const f = bdFacts('QA00705913001 - 260810.xlsx', { pax: 40 }, '기준 3박4일 상품 안내');
  ok('⑫ 본문 「3박4일」 → 4일', f.days === 4 && f.daysFrom === '본문N박M일', JSON.stringify(f));
  /* 서로 다른 값이 여럿이면 고르지 않는다 */
  const f2 = bdFacts('이름없음.xlsx', { pax: 40 }, '3박4일 기준 · 연장 시 4박5일');
  ok('⑫ 값이 둘이면 안 고른다', f2.days === null, JSON.stringify({ d: f2.days }));
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

/* RN 검증: 견적서에서 단가를 **지어내지 않고** 뽑는가.

   왜 —
   예전 방식은 PDF 텍스트를 통째로 AI에게 주고 "항공료·호텔·식비를 찾아라"고 시켰다.
   실제 하나투어 견적서로 재 보니 **3칸 중 2칸이 틀렸는데 신뢰도는 high**였다:
       호텔 1박 → 320,000 (항공료를 그대로 복사해 옴)    실제 152,000
       식비 1식 →  90,000 (유류할증료 줄을 집어옴)        실제 17,100 / 33,250
   틀린 값이 자신 있게 들어오는 게 제일 나쁘다 — 담당자가 믿고 제출하면 요율이 오염된다.
   원인은 PDF에서 표가 납작해지는 것이다. 「항공」「호텔」「중식」 라벨이 숫자와 떨어진
   블록에 몰려 있어 AI가 위치로 추측한다.

   고친 구조 —
     ① **코드가 산술로 후보를 만든다.** 여행사 견적서 상세 내역서는 예외 없이
        `단가 × 수량 × 횟수 = 총금액`이다. 검산되는 줄만 남긴다.
     ② **AI는 줄 번호만 고른다.** 숫자를 직접 못 쓰게 하고, 서버가 번호로 값을 되찾는다.
     ③ 그래도 라벨을 잘못 고를 수 있으니 **후보 전체를 화면에 내려보내** 담당자가
        1클릭으로 바꾼다. 숫자를 타이핑할 일이 없다(수백 건을 넣어야 하는 자리다).

   이 파일이 고정하는 것:
   ① 검산되는 줄만 후보가 된다 — 우연히 든 숫자·날짜·전화번호는 안 된다.
   ② **AI가 준 숫자는 절대 쓰이지 않는다.** 없는 번호·소수·문자열·음수를 줘도 null이다.
   ③ 실제 하나투어 견적서 모양에서 항공 320,000 / 호텔 152,000 / 식사 17,100·33,250이
      **후보에 들어 있다** (AI가 무엇을 고르든 담당자가 고를 수 있다).
   ④ 패키지 총액만 있는 견적서는 후보가 0개다 — 못 찾는 게 맞다.
   ⑤ 말이 안 되는 조합(항공=호텔, 식비 10만 초과)은 경고가 뜬다.
   ⑥ 프롬프트가 **라벨 블록이 있는 뒤쪽까지** 포함한다(앞만 자르면 라벨을 못 본다).
   ⑦ 화면이 후보·근거를 보여주고 PDF 모드에서도 값을 고칠 수 있다.

   실행: node ai-loop/test_rN_pdf_rows.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ⚠ 진짜 코드를 부른다. 테스트가 로직을 복사하면 곧 어긋난다(결함 생성기 ①).
   api/quotes.js는 로드 시 _lib/db가 neon(DATABASE_URL)을 부르므로 **형식만 맞는 더미**를
   넣는다. 이 테스트는 순수 함수만 보고 DB에는 한 번도 접속하지 않는다.
   ⚠ 진짜 접속 문자열을 쓰지 않는다 — 테스트가 실수로 운영 DB를 건드릴 여지를 안 만든다. */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://test:test@localhost/test_never_connected';
}
const quotes = require('../api/quotes.js');
const X = quotes._extract;
const adminSrc = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const quotesSrc = fs.readFileSync(path.join(ROOT, 'api', 'quotes.js'), 'utf8');

/* 실제 하나투어 견적서에서 pdf-parse가 뽑아낸 **모양 그대로**를 옮긴 표본.
   ⚠ 고객 이름·연락처는 뺐다. 숫자와 배치만 실제와 같게 둔다 — 이 결함이 바로
   "숫자는 맞는데 라벨이 멀리 있어서" 생겼기 때문에 그 배치가 핵심이다. */
const HANATOUR_LIKE = `견적 담당자명 : (담당자)
기간 	~ 	3박4일
성인 (1인) 	₩1,190,000 x 	14명 	16,660,000	₩
■ 상세 내역
인 원 	14
외화(￥) 원화(￦) 수량/인원 횟수/박수 총금액 	비고 	과세 여부
- 320,000 	15 	1 4,800,000 	아시아나 항공 기준
- 	90,000 	15 	1 1,350,000 	쓰루가이드 포함
6,150,000
16,000 152,000 	7 	3 3,192,000 	2인 1실 기준
3,192,000
1,800 	17,100 	15 	2 	513,000
3,500 	33,250 	15 	2 	997,500
1,510,500
99,000 940,500 	1 	3 2,821,500 45인승 차량*3일기준
20,000 190,000 	1 	3 	570,000
22,000 209,000 	1 	3 	627,000 	3일 기준
10,000 	95,000 	1 	3 	285,000
2,000 	19,000 	14 	1 	266,000
- 	10,000 	15 	1 	150,000 	1억원 보장
총 견적가 	16,660,000
1인 금액 	1,190,000
구분
항공
항공
소계
호텔
식사
중식
석식
차량
가이드
관광
샘플 호텔 나하`;

/* 패키지 총액만 있는 견적서(상해 형태) — 단가표가 없다 */
const PACKAGE_ONLY = `상해 2박3일
상품 가격 1인 1,030,000원 + 황포강유람선/꽃 비용 411,600원 ($280)
계약금 : 1인 300,000원
인원 성인 15명
숙박 위즈덤 로즈 호텔 또는 동급
총 합계 비용 15,861,600 원`;

(() => {
  /* ── [1] 검산되는 줄만 후보가 되는가 (①) ─────────────────────────────── */
  console.log('[1] 산술이 맞는 줄만 후보가 되는가 (①)');
  const rows = X.extractUnitRows(HANATOUR_LIKE);
  ok('후보를 찾았다', rows.length > 0, String(rows.length));
  ok('모든 후보가 실제로 검산된다',
    rows.every(r => Math.abs(r.unit * r.qty * r.times - r.total) <= 1),
    rows.filter(r => Math.abs(r.unit * r.qty * r.times - r.total) > 1).map(r => r.line).join(' | '));
  ok('후보에 번호가 0부터 매겨진다', rows.every((r, i) => r.idx === i));

  const units = rows.map(r => r.unit);
  ok('항공 320,000이 후보에 있다', units.includes(320000), units.join(','));
  ok('호텔 152,000이 후보에 있다', units.includes(152000), units.join(','));
  ok('중식 17,100이 후보에 있다', units.includes(17100), units.join(','));
  ok('석식 33,250이 후보에 있다', units.includes(33250), units.join(','));
  /* 총액·소계는 단가가 아니다 — 곱셈이 안 맞으니 들어오면 안 된다 */
  ok('소계 6,150,000은 후보가 아니다', !units.includes(6150000), units.join(','));

  /* 우연히 곱해지는 작은 숫자를 거르는가 */
  const noise = X.extractUnitRows('기간 3 박 4 일 12 명\n전화 02 2088 4253\n2025 11 21');
  ok('날짜·전화번호 같은 줄은 후보가 안 된다', noise.length === 0,
    noise.map(r => r.line).join(' | '));

  /* ── [2] AI가 준 숫자는 절대 쓰이지 않는가 (②) — 이 기능의 핵심 ────────── */
  console.log('\n[2] AI가 숫자를 지어낼 수 있는 경로가 있는가 (②)');
  const M = X.AIRFARE_UNIT_MAX;
  ok('정상 번호는 그 줄의 단가를 돌려준다',
    X.pickRowValue(rows, 0, M).value === rows[0].unit);
  ok('범위 밖 번호는 null', X.pickRowValue(rows, 999, M) === null);
  ok('음수 번호는 null', X.pickRowValue(rows, -1, M) === null);
  ok('소수 번호는 null', X.pickRowValue(rows, 1.5, M) === null);
  ok('문자열 번호는 null', X.pickRowValue(rows, '1', M) === null);
  ok('null은 null', X.pickRowValue(rows, null, M) === null);
  /* 상한을 넘는 줄은 고를 수 없다 */
  const huge = X.extractUnitRows('9,999,999,999 2 1 19,999,999,998');
  ok('상한을 넘는 단가는 거른다',
    !huge.length || X.pickRowValue(huge, 0, M) === null);
  /* 돌려주는 값이 반드시 후보 줄의 단가와 같은가 — 여기가 뚫리면 의미가 없다 */
  ok('돌려준 값은 언제나 후보 줄의 단가와 같다',
    rows.every((r, i) => {
      const p = X.pickRowValue(rows, i, 50000000);
      return !p || p.value === r.unit;
    }));
  ok('근거 문장을 함께 돌려준다',
    !!X.pickRowValue(rows, 0, M).evidence && !!X.pickRowValue(rows, 0, M).calc);

  /* 서버가 AI의 숫자 필드를 읽지 않는지 소스로 못 박는다 */
  const code = quotesSrc.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('서버가 parsed.airfarePerPerson 같은 숫자를 읽지 않는다',
    !/parsed\.(airfarePerPerson|hotelPerRoom|mealPerPerson)/.test(code),
    '읽으면 AI가 지어낸 숫자가 그대로 들어온다');
  ok('서버는 줄 번호(parsed.*Row)로만 값을 되찾는다',
    /parsed\.airfareRow/.test(code) && /parsed\.hotelRow/.test(code) && /parsed\.mealRow/.test(code));

  /* ── [3] 단가표가 없는 견적서 (④) ─────────────────────────────────────── */
  console.log('\n[3] 패키지 총액만 있는 견적서는 어떻게 되는가 (④)');
  const none = X.extractUnitRows(PACKAGE_ONLY);
  ok('단가 줄이 0개다', none.length === 0, none.map(r => r.line).join(' | '));
  ok('화면이 "단가표가 없다"고 말한다',
    /단가표가 없습니다/.test(adminSrc), '못 찾은 이유를 구분해서 말해야 한다');

  /* ── [4] 말이 안 되는 조합 경고 (⑤) ───────────────────────────────────── */
  console.log('\n[4] 말이 안 되는 조합을 경고하는가 (⑤)');
  const v = (n) => ({ value: n });
  ok('항공료와 호텔이 같으면 경고',
    X.sanityWarnings(v(320000), v(320000), null).length > 0);
  ok('식비가 10만 원을 넘으면 경고',
    X.sanityWarnings(null, null, v(150000)).some(t => /식비/.test(t)));
  ok('호텔이 항공료보다 비싸면 경고',
    X.sanityWarnings(v(300000), v(500000), null).some(t => /호텔/.test(t)));
  ok('정상 조합에는 경고가 없다',
    X.sanityWarnings(v(320000), v(152000), v(17100)).length === 0,
    X.sanityWarnings(v(320000), v(152000), v(17100)).join(' | '));

  /* ── [5] 프롬프트가 뒤쪽(라벨 블록)까지 보는가 (⑥) ────────────────────── */
  console.log('\n[5] 프롬프트가 라벨 블록까지 포함하는가 (⑥)');
  const prompt = X.buildExtractionPrompt(HANATOUR_LIKE, rows);
  ok('후보 목록이 프롬프트에 들어간다', /\[0\] 단가/.test(prompt));
  ok('원문도 함께 넣는다', prompt.includes('상세 내역'));
  ok('문서 **뒤쪽의 라벨 블록**이 잘리지 않는다',
    prompt.includes('중식') && prompt.includes('석식'),
    '앞만 자르면 AI가 라벨을 못 봐서 식비 자리에 입장료가 들어온다');
  ok('숫자를 직접 쓰지 말라고 못 박는다', /숫자를 직접 쓰지 마세요/.test(prompt));
  ok('유류할증료는 항공료가 아니라고 알려준다', /유류할증료/.test(prompt));
  /* 아주 긴 문서에서도 뒤쪽을 가져오는가 */
  const long = 'x\n'.repeat(6000) + HANATOUR_LIKE;
  const longRows = X.extractUnitRows(long);
  const ctx = X.promptContext(long, longRows);
  ok('긴 문서에서도 단가 줄부터 뒤쪽을 가져온다',
    ctx.includes('320,000') && ctx.includes('중식'), String(ctx.length));

  /* ── [6] 화면이 후보·근거를 보여주는가 (③⑦) ──────────────────────────── */
  console.log('\n[6] 화면이 후보에서 고르게 해 주는가 (③⑦)');
  ok('서버가 후보 목록을 내려보낸다', /candidates,/.test(code) || /candidates:/.test(code));
  ok('AI가 고른 번호도 함께 내려보낸다', /picked:/.test(code));
  ok('근거(evidence)도 내려보낸다', /evidence:/.test(code));
  ok('화면이 후보 드롭다운을 만든다', /pr-ev-pick/.test(adminSrc));
  ok('화면이 근거 문장을 보여준다', /pr-ev-src/.test(adminSrc));
  ok('경고를 화면에 띄운다', /pr-warnings/.test(adminSrc));
  /* ⚠ 예전에는 PDF 모드에서 칸을 잠갔다 — 한 칸 틀리면 처음부터 다시 넣어야 했다 */
  ok('PDF 모드에서도 값을 고칠 수 있다',
    /el\.readOnly = false/.test(adminSrc) && !/el\.readOnly = isPdf/.test(adminSrc),
    '잠그면 한 칸 틀릴 때마다 전부 다시 넣어야 한다 — 수백 건에서는 불가능하다');

  /* ── [7] 용량 한도가 base64 팽창을 반영하는가 ─────────────────────────── */
  console.log('\n[7] 용량 한도가 실제로 통하는 크기인가');
  ok('한도가 3.2MB다', /3\.2 \* 1024 \* 1024/.test(adminSrc),
    '4MB면 base64로 5.3MB가 되어 Vercel 본문 한도(4.5MB)를 넘는다');
  ok('왜 3.2MB인지 주석이 있다', /base64/.test(adminSrc) && /4\.5MB/.test(adminSrc));
  ok('안내가 파일 크기를 알려준다', /toFixed\(1\)\}MB/.test(adminSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})();

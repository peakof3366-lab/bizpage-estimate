/* ═══════════════════════════════════════════════════════════════════════════
   가상 고객을 **지어내는 자** — 단일 출처 (XS)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-27): 「가상으로 고객을 만들어서 견적과 관련된 모든 사항을
   직접 가상 속에서 실행해 보고 견적서를 뽑아보는 작업」.

   ■ 왜 파일을 따로 두나
   고객을 지어내는 규칙이 도구마다 한 벌씩 생기면, 그 도구만 조용히 다른 손님을
   부른다(결함 생성기 ①). 「몇 명이 실패했나」를 회차끼리 비교하려면 **같은 손님**이
   나와야 한다.

   ■ 🔴 반드시 지키는 것 — 가상임이 드러나야 한다
   이 손님들은 실재하지 않는다. 그런데 이 값이 견적 기록·견적서·대장에 들어갈 수
   있으므로, **누가 봐도 가상인 표시**를 이름에 박는다(`MARK`). 연락처는 실제로
   존재할 수 있는 번호를 절대 만들지 않는다 — `010-0000-****`만 쓴다.

   ■ 씨앗(seed)이 같으면 같은 손님이 나온다
   `Math.random()`을 쓰면 어제의 실패를 오늘 다시 못 만든다. 결함을 고친 뒤
   **같은 손님으로 다시 확인**하는 것이 이 작업의 절반이다.
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const destinationRates = require(path.join(ROOT, 'data.js'));
/* 상한은 `limits.js` 하나가 안다 — 여기 숫자를 적으면 화면·서버와 어긋난다(XK) */
const LIMITS = require(path.join(ROOT, 'limits.js'));
const LIMITS_MAX_PAX = LIMITS.QUOTE_MAX_PAX;
const LIMITS_MAX_DAYS = LIMITS.QUOTE_MAX_DAYS;

const MARK = '[가상]';

/* mulberry32 — 씨앗 하나로 같은 수열을 낸다(짧고 충분히 고르다) */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 실제 요율표에 있는 목적지만 부른다 — 없는 곳을 부르면 「엔진 결함」이 아니라
   **손님이 틀린 것**인데, 그 둘이 섞이면 결과를 못 읽는다. */
const DEST_KEYS = destinationRates.map((d) => d.destination_key);

/* 실제로 자주 가는 곳에 무게를 준다 — 고르게 뽑으면 1년에 한 번 가는 곳이
   절반을 차지해, 정작 매일 나가는 견적의 결함을 못 만난다. */
const DEST_WEIGHT = {
  다낭: 9, 나트랑: 7, 방콕: 7, 세부: 7, 보홀: 5, 푸켓: 6, 하노이: 5, 호치민: 5,
  오사카: 9, 도쿄: 8, 후쿠오카: 9, 오키나와: 8, 삿포로: 6, 나고야: 4, 가고시마: 3,
  싱가포르: 5, 홍콩: 4, 마카오: 4, 상해: 4, 코타키나발루: 4, 발리: 4, 제주도: 6,
  타이베이: 5, 괌: 3, 사이판: 3,
};
function weightedDests() {
  const bag = [];
  DEST_KEYS.forEach((k) => {
    const w = DEST_WEIGHT[k] !== undefined ? DEST_WEIGHT[k] : 1;
    for (let i = 0; i < w; i++) bag.push(k);
  });
  return bag;
}
const DEST_BAG = weightedDests();

const PROGRAMS = [
  { v: 'industry', w: 8, say: '산업시찰' },
  { v: 'leadership', w: 6, say: '리더십 워크숍' },
  { v: 'leisure', w: 5, say: '포상휴가' },
  { v: 'academic', w: 3, say: '학술연수' },
  { v: 'language', w: 2, say: '어학연수' },
];
const ORG_TYPES = [
  { v: 'company', w: 10, say: '기업' },
  { v: 'public', w: 3, say: '공공기관' },
  { v: 'education', w: 3, say: '학교' },
  { v: 'individual', w: 1, say: '개인/동호회' },
];
const DEPARTURE = [
  { v: 'ICN', w: 10, say: '인천' }, { v: 'GMP', w: 2, say: '김포' },
  { v: 'PUS', w: 3, say: '부산' }, { v: 'TAE', w: 1, say: '대구' },
  { v: 'KWJ', w: 2, say: '광주' }, { v: 'CJU', w: 1, say: '제주' },
];

/* 가상 회사 이름 — 실재 상호와 겹치지 않게 **앞에 [가상]을 박는다** */
const NAME_HEAD = ['한빛', '새롬', '두레', '한결', '온새미', '너울', '아람', '가온', '미르', '해솔',
  '푸른', '초록', '늘봄', '다온', '라온', '벼리', '사름', '슬기', '이든', '하람'];
const NAME_CO = ['전자', '화학', '물산', '건설', '제약', '금융', '에너지', '식품', '중공업', '테크',
  '바이오', '모빌리티', '네트웍스', '캐피탈', '생명', '증권', '유통', '소재', '정밀', '시스템'];
const NAME_PUB = ['진흥원', '공사', '재단', '협회', '연구원', '조합'];
const NAME_EDU = ['대학교', '고등학교', '대학원', '평생교육원'];
const SURNAME = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
const GIVEN = ['민준', '서연', '도윤', '지우', '예준', '하윤', '주원', '지호', '수아', '건우',
  '유진', '태현', '나윤', '성민', '가은', '준서', '다인', '현우', '소율', '재현'];
const TEAM = ['인재개발팀', '경영지원팀', '총무팀', '전략기획팀', '영업본부', '연구소', '교육팀', 'HR팀'];

function pickW(r, arr) {
  const bag = [];
  arr.forEach((o) => { for (let i = 0; i < o.w; i++) bag.push(o); });
  return bag[Math.floor(r() * bag.length)];
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const chance = (r, p) => r() < p;

/* 로컬 날짜 — toISOString()은 UTC라 한국 0~9시에 하루 전을 내놓는다(XQ에서 겪었다) */
const ymd = (d) => d.toLocaleDateString('sv-SE');
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

/* 인원은 고르게 퍼지지 않는다 — 실제 견적은 20·30·40처럼 **동그란 수**에 몰린다 */
const PAX_BAG = [12, 15, 15, 18, 20, 20, 20, 25, 25, 30, 30, 30, 35, 40, 40, 45, 50, 50,
  60, 60, 70, 80, 90, 100, 120, 150, 8, 10, 200];
const DAYS_BAG = [3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 2, 7, 8];

function makePersona(i, seed) {
  const r = rng(seed * 7919 + i * 104729 + 1);
  const destKey = pick(r, DEST_BAG);
  const program = pickW(r, PROGRAMS);
  const orgType = pickW(r, ORG_TYPES);
  const dep = pickW(r, DEPARTURE);
  const pax = pick(r, PAX_BAG);
  const days = pick(r, DAYS_BAG);
  const lead = int(r, 21, 300);
  const start = plusDays(lead);
  const end = plusDays(lead + days - 1);

  const orgName = orgType.v === 'company' ? pick(r, NAME_HEAD) + pick(r, NAME_CO)
    : orgType.v === 'public' ? pick(r, NAME_HEAD) + pick(r, NAME_PUB)
      : orgType.v === 'education' ? pick(r, NAME_HEAD) + pick(r, NAME_EDU)
        : pick(r, NAME_HEAD) + '동호회';
  const person = pick(r, SURNAME) + pick(r, GIVEN);

  /* 포함 항목 — 기본은 전부 켬. 실제로는 **일부를 빼고 물어보는 손님**이 있고,
     그 조합에서만 나는 결함이 있다(항공 빼면 지상비만 남는다). */
  const incHotel = chance(r, 0.97);
  const incMeal = chance(r, 0.93);
  const incVehicle = chance(r, 0.95);
  const incGuide = chance(r, 0.88);
  const incSightseeing = chance(r, 0.80);
  const incGolf = chance(r, 0.14);
  const incDomestic = chance(r, 0.12);

  const cabinClass = chance(r, 0.86) ? 'economy' : (chance(r, 0.5) ? 'business' : 'mixed');
  const hotelGrade = chance(r, 0.6) ? 'superior' : (chance(r, 0.5) ? 'standard' : 'deluxe');
  const roomConfig = chance(r, 0.72) ? 'double' : (chance(r, 0.5) ? 'single' : 'mixed');

  const golfCount = incGolf ? Math.min(pax, int(r, 4, Math.max(4, Math.round(pax * 0.6)))) : 0;
  const golfRounds = incGolf ? int(r, 1, 3) : 0;
  const agencyVisits = program.v === 'industry' ? int(r, 1, 3) : (chance(r, 0.2) ? 1 : 0);
  const vipCount = (roomConfig === 'mixed' || cabinClass === 'mixed')
    ? int(r, 1, Math.max(1, Math.round(pax * 0.15))) : 0;

  const ask = [
    orgName + ' ' + pick(r, TEAM) + ' ' + program.say + ' 건으로 문의드립니다.',
    '총 ' + pax + '명 / ' + days + '일 일정이며 ' + dep.say + ' 출발 희망합니다.',
    incGolf ? '골프 ' + golfRounds + '라운드(' + golfCount + '명) 포함 부탁드립니다.' : '',
    agencyVisits ? '현지 기관 방문 ' + agencyVisits + '회가 필요합니다.' : '',
    vipCount ? '임원 ' + vipCount + '분은 1인 1실로 부탁드립니다.' : '',
    !incGuide ? '가이드는 제외하고 견적 부탁드립니다.' : '',
    !incSightseeing ? '관광 일정 없이 진행 예정입니다.' : '',
    chance(r, 0.35) ? '예산 범위와 함께 항목별 내역을 보고 싶습니다.' : '',
  ].filter(Boolean).join(' ');

  return {
    no: i,
    destKey,
    programType: program.v, programText: program.say,
    organizationType: orgType.v, orgTypeText: orgType.say,
    visitMode: chance(r, 0.5) ? 'official' : 'workshop',
    departureCity: dep.v, departureText: dep.say,
    participants: pax, days,
    startDate: ymd(start), endDate: ymd(end), leadDays: lead,
    cabinClass, hotelGrade, roomConfig,
    incHotel, incMeal, incVehicle, incGuide, incSightseeing, incGolf, incDomestic,
    golfCount, golfRounds, agencyVisits, vipCount,
    /* 🔴 가상임이 드러나는 이름 · 존재할 수 없는 번호 */
    organization: MARK + ' ' + orgName,
    contactName: MARK + ' ' + person,
    contactTel: '010-0000-' + String(1000 + (i % 9000)),
    requestDetails: ask,
  };
}

function makeAll(n, seed) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(makePersona(i, seed));
  return out;
}


/* ═══════════════════════════════════════════════════════════════════════════
   **까다로운 손님** — 얌전한 손님 300명은 아무것도 못 잡았다 (XS)
   ───────────────────────────────────────────────────────────────────────────
   무작위로 지어낸 손님은 가운데로 몰린다. 정작 화면이 무너지는 자리는 **가장자리**다:
   1명 · 상한 인원 · 하루 · 지난 날짜 · 아무것도 안 고른 손님 · 이름에 따옴표가 든 손님.

   ⚠ **전부 「고객이 실제로 넣을 수 있는 값」이다.** 화면이 막아야 하는 값(상한 초과)도
     넣는데, 그건 **막히는 것이 정답**이라 `expectBlocked`로 표시해 둔다 —
     안 그러면 「막혔다」가 결함으로 세어져 진짜 결함이 묻힌다(WD에서 배운 것).
   ═══════════════════════════════════════════════════════════════════════════ */
const ymdOf = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

function edgeBase(i, name) {
  return {
    no: i, edge: name,
    destKey: '다낭',
    programType: 'industry', programText: '산업시찰',
    organizationType: 'company', orgTypeText: '기업',
    visitMode: 'official',
    departureCity: 'ICN', departureText: '인천',
    participants: 30, days: 4,
    startDate: ymdOf(60), endDate: ymdOf(63), leadDays: 60,
    cabinClass: 'economy', hotelGrade: 'superior', roomConfig: 'double',
    incHotel: true, incMeal: true, incVehicle: true, incGuide: true,
    incSightseeing: true, incGolf: false, incDomestic: false,
    golfCount: 0, golfRounds: 0, agencyVisits: 1, vipCount: 0,
    organization: MARK + ' 가장자리',
    contactName: MARK + ' 점검',
    contactTel: '010-0000-0000',
    requestDetails: '가장자리 손님 점검입니다.',
    expectBlocked: false,
  };
}

/* 화면이 막아야 하는 값은 `expectBlocked: true`로 표시한다 */
function makeEdges(startNo) {
  const E = [];
  let n = startNo;
  const add = (name, patch) => { E.push(Object.assign(edgeBase(n++, name), patch)); };

  add('인원 1명', { participants: 1 });
  add('인원 2명', { participants: 2 });
  add('인원 상한 1000명', { participants: LIMITS_MAX_PAX });
  add('🚧 인원 상한 초과', { participants: LIMITS_MAX_PAX + 1, expectBlocked: true });
  add('🚧 인원 0명', { participants: 0, expectBlocked: true });
  add('일수 1일', { days: 1, endDate: ymdOf(60) });
  add('일수 2일', { days: 2, endDate: ymdOf(61) });
  add('일수 상한 60일', { days: LIMITS_MAX_DAYS, endDate: ymdOf(119) });
  add('🚧 일수 상한 초과', { days: LIMITS_MAX_DAYS + 1, endDate: ymdOf(120), expectBlocked: true });
  add('🚧 일수 0일', { days: 0, expectBlocked: true });

  add('오늘 출발', { startDate: ymdOf(0), endDate: ymdOf(3), leadDays: 0 });
  add('내일 출발', { startDate: ymdOf(1), endDate: ymdOf(4), leadDays: 1 });
  /* 🚧 고객 화면에서는 **막히는 것이 정답**이다(XS 이후). 담당자 도구는 허용한다 —
     서버 검증기가 「지난 일정 재견적」을 명시적으로 허용하고, 화면이 서버보다 좁으면
     담당자가 되는 일을 못 하게 된다. 이 도구는 고객 화면을 태우므로 막혀야 맞다. */
  add('🚧 지난 날짜로 재견적(고객)', { startDate: ymdOf(-120), endDate: ymdOf(-117), leadDays: -120, expectBlocked: true });
  add('3년 뒤 출발', { startDate: ymdOf(1095), endDate: ymdOf(1098), leadDays: 1095 });
  /* 🚧 XS 전에는 **금액이 나오고 견적서만 안 왔다.** 이제 그 자리에서 막고 이유를 말한다. */
  add('🚧 출발일 비움', { startDate: '', endDate: '', expectBlocked: true });
  add('끝나는 날이 시작보다 빠름', { startDate: ymdOf(60), endDate: ymdOf(50) });

  add('아무 항목도 안 고름', {
    incHotel: false, incMeal: false, incVehicle: false, incGuide: false,
    incSightseeing: false, incDomestic: false, agencyVisits: 0,
  });
  add('항공만 (지상비 전부 해제)', {
    incHotel: false, incMeal: false, incVehicle: false, incGuide: false, incSightseeing: false,
  });
  add('가이드만', { incHotel: false, incMeal: false, incVehicle: false, incSightseeing: false });

  add('전원 1인 1실', { roomConfig: 'single' });
  add('전원 비즈니스', { cabinClass: 'business' });
  add('임원이 총원보다 많다', { roomConfig: 'mixed', vipCount: 999 });
  add('혼합인데 임원 0명', { roomConfig: 'mixed', vipCount: 0 });
  add('기관 방문 30회', { agencyVisits: 30 });
  add('골프 인원이 총원보다 많다', { destKey: '오키나와', incGolf: true, golfCount: 999, golfRounds: 3 });
  add('골프 라운딩 10회', { destKey: '제주도', incGolf: true, golfCount: 10, golfRounds: 10 });
  add('골프 없는 곳에 골프 요청', { destKey: '도쿄', incGolf: true, golfCount: 10, golfRounds: 2 });

  /* 🔴 결함 생성기 ④ — 공개 입력이 그대로 렌더된다. **막히는지가 아니라 새는지**를 본다 */
  add('이름에 따옴표', { organization: MARK + " 오'브라이언 & 컴퍼니", contactName: MARK + ' 김"따옴' });
  add('이름에 태그 모양', { organization: MARK + ' <b>굵게</b>', contactName: MARK + ' <script>x</script>' });
  add('요청사항에 태그 모양', { requestDetails: '<img src=x onerror="alert(1)"> 안녕하세요 견적 부탁드립니다.' });
  add('아주 긴 요청사항', { requestDetails: ('연수 목적과 세부 요청을 자세히 적습니다. ').repeat(40) });
  add('요청사항에 줄바꿈 많음', { requestDetails: Array.from({ length: 30 }, (_, i) => (i + 1) + '. 요청 항목').join('\n') });
  add('기관명이 아주 김', { organization: MARK + ' ' + '한빛'.repeat(60) + '주식회사' });
  add('이름이 한 글자', { contactName: MARK + ' 김' });
  add('연락처 형식이 다름', { contactTel: '01000001234' });

  add('휴양 × 개인 (계수 1.0)', { programType: 'leisure', programText: '포상휴가', organizationType: 'individual', orgTypeText: '개인/동호회' });
  add('산업시찰 × 공공 (계수 최대)', { programType: 'industry', organizationType: 'public', orgTypeText: '공공기관' });
  add('어학 × 학교 (계수 최저)', { programType: 'language', programText: '어학연수', organizationType: 'education', orgTypeText: '학교' });
  add('지방 출발 (대구)', { departureCity: 'TAE', departureText: '대구' });
  add('제주 출발', { departureCity: 'CJU', departureText: '제주' });
  return E;
}

/* 목적지 전수 — **한 곳도 빠뜨리지 않는다.** 요율이 빈 목적지·골프만 있는 목적지처럼
   한 곳에서만 나는 결함은 무작위 추첨으로는 몇 백 명을 태워도 안 걸린다. */
function makeSweep(startNo) {
  return DEST_KEYS.map((k, i) => Object.assign(edgeBase(startNo + i, '전수: ' + k), { destKey: k }));
}

module.exports = { makeAll, makePersona, makeEdges, makeSweep, MARK, DEST_KEYS, rng };

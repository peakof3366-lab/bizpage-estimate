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

module.exports = { makeAll, makePersona, MARK, DEST_KEYS, rng };

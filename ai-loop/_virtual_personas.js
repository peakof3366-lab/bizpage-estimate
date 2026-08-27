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

   ■ 🔴 **말이 되는 질문만 만든다** (대표 지적, 2026-08-27)
   「사람들이 하루 보내려고 해외여행을 나가는 경우는 없잖어. 가상견적서 폴더를 보니
    질문이 이상한 게 너무 많더라구. 진짜 그럴듯한 질문을 던지고 견적을 받게끔.」

   맞는 지적이었다. 값을 **서로 독립으로** 뽑고 있어서 이런 것들이 나왔다:
     세부 3일 · 뉴욕 5일 · **부산 출발 로스앤젤레스** · 제주 출발 후아힌 ·
     평생교육원 **인재개발팀** · 고등학교 인솔자를 「**임원**」 · 마카오 **어학연수** ·
     사이판에서 「현지 기업 방문」 · 김포 출발인데 「지방에서 공항까지 버스」

   말이 안 되는 질문에서 나온 답은 **맞아도 쓸모가 없다** — 아무도 그렇게 안 물어보니까.
   그래서 순서를 바꿨다: **기관 → 그 기관이 하는 연수 → 그 연수가 가는 곳 → 그 노선의
   출발지 → 그 비행시간이 허용하는 일수.** 뒤로 갈수록 앞의 값에 매인다.
 ⚠ 문의 글도 **같은 값에서 만든다**(`문의글`). 글을 따로 지어내면 「30명이라 적고 폼에는
   25명」이 되고, 그러면 답이 맞는지 틀린지 판단할 근거가 사라진다.
 🔴 이 규칙들은 `test_xW_persona_realism.js`가 씨앗 세 개 · 450명으로 매번 검사한다.

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
   절반을 차지해, 정작 매일 나가는 견적의 결함을 못 만난다.
 ⚠ **요율표에 없는 이름을 적으면 조용히 죽는다** — 예전에 `타이베이: 5`가 있었는데
   요율표의 이름은 `대만`이라 그 무게가 **한 번도 안 쓰였다**(결함 생성기 ②).
   아래 `assertKeys`가 이제 그 자리에서 큰 소리로 알린다. */
const DEST_WEIGHT = {
  다낭: 9, 나트랑: 7, 방콕: 7, 세부: 7, 보홀: 5, 푸켓: 6, 하노이: 5, 호치민: 5,
  오사카: 9, 도쿄: 8, 후쿠오카: 9, 오키나와: 8, 삿포로: 6, 나고야: 4, 가고시마: 3,
  싱가포르: 5, 홍콩: 4, 마카오: 4, 상해: 4, 코타키나발루: 4, 발리: 4, 제주도: 6,
  대만: 5, 괌: 3, 사이판: 3,
};

/* 표에 적은 목적지 이름이 실제 요율표에 있는가 — 없으면 그 줄은 아무 일도 안 한다 */
function assertKeys(표, 이름) {
  const 없는것 = Object.keys(표).filter((k) => !DEST_KEYS.includes(k));
  if (없는것.length) {
    throw new Error(이름 + '에 요율표에 없는 목적지가 있다: ' + 없는것.join(', ')
      + ' — 이름이 바뀌었거나 오타다. 그대로 두면 그 줄은 조용히 안 쓰인다.');
  }
}
assertKeys(DEST_WEIGHT, 'DEST_WEIGHT');

function weightedDests() {
  const bag = [];
  DEST_KEYS.forEach((k) => {
    const w = DEST_WEIGHT[k] !== undefined ? DEST_WEIGHT[k] : 1;
    for (let i = 0; i < w; i++) bag.push(k);
  });
  return bag;
}
const DEST_BAG = weightedDests();

/* ═══════════════════════════════════════════════════════════════════════════
   🔴 **하루 보내려고 해외에 나가는 사람은 없다** (대표 지적, 2026-08-27)
   ───────────────────────────────────────────────────────────────────────────
   무작위로 지어낸 손님이 「세부 3일」·「뉴욕 5일」·「부산 출발 로스앤젤레스」를
   물어보고 있었다. 금액은 나온다 — 엔진은 시키는 대로 계산하니까. 그런데 그건
   **아무도 안 하는 질문**이라, 거기서 나온 답을 보고는 우리 서비스가 실제 고객에게
   어떻게 답하는지 알 수 없다.

   여행 기간을 정하는 것은 **비행시간**이다. 왕복 이동에 이틀이 잡히는 곳을 3일로
   물어보면 현지 체류가 하루도 안 남는다.
 ⚠ 권역은 `data.js`의 `DEST_CLASSIFY`에서 가져온다 — 목적지 목록을 여기 다시 적으면
   목적지가 늘 때마다 어긋난다(결함 생성기 ①). 권역이 같아도 성격이 다른 몇 곳만
   **예외로 이름을 적고**, 표에 없는 권역이 나오면 **큰 소리로 실패한다**(조용한 폴백 금지).
   ═══════════════════════════════════════════════════════════════════════════ */
const CLASSIFY = destinationRates.DEST_CLASSIFY;
if (!CLASSIFY) throw new Error('data.js에 DEST_CLASSIFY가 없다 — 권역을 알 방법이 없다');

/* 권역별 [현실적인 최소 일수, 자주 나오는 일수들] */
const 권역기간 = {
  국내: { min: 2, bag: [2, 2, 3, 3, 3, 4] },
  일본: { min: 3, bag: [3, 3, 4, 4, 4, 5, 5] },
  '홍콩·마카오': { min: 3, bag: [3, 4, 4, 4, 5] },
  중국: { min: 4, bag: [4, 4, 5, 5, 5, 6] },
  '몽골·대만': { min: 4, bag: [4, 4, 5, 5, 6] },
  동남아: { min: 4, bag: [4, 5, 5, 5, 6, 6, 7] },
  중앙아시아: { min: 5, bag: [5, 6, 6, 7, 7] },
  '오세아니아·태평양': { min: 4, bag: [4, 5, 5, 6] },   /* 괌·사이판 기준. 호주·뉴질랜드는 아래 예외 */
  북미: { min: 6, bag: [6, 7, 7, 8, 8, 9] },
  유럽: { min: 7, bag: [7, 8, 8, 9, 9, 10] },
};

/* 같은 권역인데 비행시간이 아주 다른 곳 — **이름을 적는 쪽이 정직하다** */
const 목적지기간예외 = {
  시드니: { min: 6, bag: [6, 7, 7, 8] },
  멜버른: { min: 6, bag: [6, 7, 7, 8] },
  오클랜드: { min: 7, bag: [7, 8, 8, 9] },
  호주: { min: 7, bag: [7, 8, 8, 9, 10] },
  하와이: { min: 5, bag: [5, 6, 6, 7] },       /* 미주지만 휴양이라 북미 본토보다 짧다 */
  미야코지마: { min: 4, bag: [4, 4, 5] },       /* 일본이지만 직항이 드물어 하루 더 걸린다 */
};
assertKeys(목적지기간예외, '목적지기간예외');

function 기간규칙(destKey) {
  if (목적지기간예외[destKey]) return 목적지기간예외[destKey];
  const region = CLASSIFY[destKey] && CLASSIFY[destKey].region;
  const rule = 권역기간[region];
  if (!rule) {
    /* 🔴 조용히 기본값으로 떨어지면 「하루짜리 유럽 연수」가 다시 나온다 */
    throw new Error('목적지 「' + destKey + '」의 권역(' + region + ')에 기간 규칙이 없다 — '
      + '`권역기간`에 한 줄 더하거나 `목적지기간예외`에 적을 것.');
  }
  return rule;
}

/* 국내인가 — 제주도는 항공 노선·출발지 규칙이 통째로 다르다 */
const 국내인가 = (destKey) => (CLASSIFY[destKey] && CLASSIFY[destKey].region) === '국내';
/* 장거리인가 — 좌석·출발지·리드타임이 여기서 갈린다 */
const 장거리인가 = (destKey) => 기간규칙(destKey).min >= 6;

/* 🔴 **어디서 무엇을 하는지가 정해져 있다** — 사이판에 「현지 기업 방문」을 물어보거나
   마카오로 어학연수를 가는 문의는 실제로 오지 않는다.
 ⚠ 이건 판단이 들어간 목록이라 **이름을 적고 근거를 남긴다**(파생할 데이터가 없다).
   목적지가 늘면 `assertKeys`가 오타를 잡아 주지만, 새 목적지의 성격은 사람이 정해야 한다. */
const 휴양지 = ['오키나와', '미야코지마', '괌', '사이판', '하와이', '보홀', '발리', '푸켓',
  '후아힌', '나트랑', '푸꾸옥', '코타키나발루', '치앙마이', '장가계'];
assertKeys(Object.fromEntries(휴양지.map((k) => [k, 1])), '휴양지');

/* 어학연수를 실제로 보내는 곳 — 영어권과, 현지어 연수가 성립하는 곳 */
const 어학연수가능 = ['세부', '마닐라', '싱가포르', '도쿄', '오사카', '후쿠오카', '상해', '대만',
  '영국', '로스앤젤레스', '샌프란시스코', '뉴욕', '워싱턴', '밴쿠버', '토론토', '호주', '시드니',
  '멜버른', '오클랜드'];
assertKeys(Object.fromEntries(어학연수가능.map((k) => [k, 1])), '어학연수가능');

/* 연수 목적이 갈 수 있는 곳만 담은 가방 */
function 목적지가방(programV) {
  if (programV === 'language') return DEST_BAG.filter((k) => 어학연수가능.includes(k));
  /* 산업시찰·학술연수는 **볼 것이 있어야** 간다 — 휴양지에는 방문할 기관이 없다 */
  if (programV === 'industry' || programV === 'academic') return DEST_BAG.filter((k) => !휴양지.includes(k));
  /* 포상휴가는 휴양지 쪽으로 기운다 */
  if (programV === 'leisure') return DEST_BAG.concat(DEST_BAG.filter((k) => 휴양지.includes(k)));
  return DEST_BAG;
}

/* 골프를 **팔지 않는 곳에 골프를 물어보지 않는다.**
 ⚠ `data.js`는 폴백 기본값이라 운영 오버라이드로 골프가 더 열려 있을 수 있다.
   여기서는 적게 잡는 쪽을 고른다 — 손님이 안 파는 것을 물어보는 것보다 낫다. */
const 골프목적지 = destinationRates
  .filter((d) => Number(d.golf_fee || 0) > 0)
  .map((d) => d.destination_key);

/* ⚠ 예전에는 여기 `PROGRAMS`(연수 목적을 기관과 **따로** 뽑는 표)가 있었다. 지웠다 —
   그러면 「동호회 산업시찰」이 나온다. 지금은 `PROGRAM_BY_ORG`가 기관에서 파생한다.
   같은 목록을 두 곳에 두면 반드시 어긋난다(결함 생성기 ①). */
const ORG_TYPES = [
  { v: 'company', w: 10, say: '기업' },
  { v: 'public', w: 3, say: '공공기관' },
  { v: 'education', w: 3, say: '학교' },
  { v: 'individual', w: 1, say: '개인/동호회' },
];
/* ⚠ 출발지 표도 `출발지가방(destKey)` 하나로 옮겼다 — 목적지와 무관하게 뽑으면
   **부산 출발 로스앤젤레스**가 나온다(실제로 나왔다). */

/* 가상 회사 이름 — 실재 상호와 겹치지 않게 **앞에 [가상]을 박는다** */
const NAME_HEAD = ['한빛', '새롬', '두레', '한결', '온새미', '너울', '아람', '가온', '미르', '해솔',
  '푸른', '초록', '늘봄', '다온', '라온', '벼리', '사름', '슬기', '이든', '하람'];
const NAME_CO = ['전자', '화학', '물산', '건설', '제약', '금융', '에너지', '식품', '중공업', '테크',
  '바이오', '모빌리티', '네트웍스', '캐피탈', '생명', '증권', '유통', '소재', '정밀', '시스템'];
const NAME_PUB = ['진흥원', '공사', '재단', '협회', '연구원', '조합'];
const NAME_EDU = ['대학교', '고등학교', '대학원', '평생교육원'];
/* 🔴 **부서 이름은 기관 종류를 따라간다** — 「평생교육원 인재개발팀」이 실제로 나왔다.
   기업의 부서명을 학교·공공기관에 붙이면 그 문의는 사람이 쓴 것으로 안 읽힌다. */
const TEAM_BY_ORG = {
  company: ['인재개발팀', '경영지원팀', '총무팀', '전략기획팀', '영업본부', '연구소', '교육팀', 'HR팀'],
  public: ['총무부', '경영지원실', '기획조정실', '인재개발원', '운영지원팀'],
  individual: [''],   /* 동호회에는 부서가 없다 */
};
/* 담당자에게 직함을 준다 — 실제 문의 메일은 「김민준 대리」처럼 온다 */
const TITLE_BY_ORG = {
  company: ['사원', '주임', '대리', '과장', '차장', '팀장'],
  public: ['주무관', '대리', '과장', '팀장'],
  individual: ['총무', '회장', '운영진'],
};
/* 🔴 **학교는 종류마다 부서도 직함도 다르다** — 「평생교육원 산학협력단 주무관」이
   실제로 나왔다. 산학협력단은 대학에만 있고, 주무관은 공무원 직급이다. */
const EDU_ROLE = {
  대학교: { teams: ['학생처', '교무처', '산학협력단', '국제교류원'], titles: ['조교', '주임', '팀장', '실장'] },
  대학원: { teams: ['교학팀', '학생지원팀', '산학협력단'], titles: ['조교', '주임', '팀장'] },
  /* ⚠ 「행정실 … 행정실장입니다」처럼 부서와 직함이 겹쳐 읽히지 않게 한다 */
  고등학교: { teams: ['행정실', '교무실', '진로진학부'], titles: ['교사', '부장교사', '실장'] },
  평생교육원: { teams: ['운영팀', '행정실', '교육기획팀'], titles: ['주임', '팀장', '실장'] },
};
const SURNAME = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
const GIVEN = ['민준', '서연', '도윤', '지우', '예준', '하윤', '주원', '지호', '수아', '건우',
  '유진', '태현', '나윤', '성민', '가은', '준서', '다인', '현우', '소율', '재현'];
/* ⚠ 부서 목록은 `TEAM_BY_ORG` 하나다(위) — 기관 종류와 안 맞는 부서명을 막는다 */

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

/* 인원은 고르게 퍼지지 않는다 — 실제 견적은 20·30·40처럼 **동그란 수**에 몰린다.
   그리고 **연수 목적마다 규모가 다르다**: 어학연수를 150명이 가지 않고, 포상휴가를
   12명이 가지도 않는다. 목적별로 가방을 나눈다. */
const PROGRAM_RULE = {
  industry: {
    paxBag: [15, 20, 20, 25, 25, 30, 30, 30, 35, 40, 40, 45, 50, 60],
    minDays: 3, visits: [1, 3], sightP: 0.65, golfP: 0.02, mealP: 0.97,
  },
  leadership: {
    paxBag: [20, 20, 25, 30, 30, 35, 40, 40, 50, 60, 80],
    minDays: 3, visits: [0, 1], sightP: 0.85, golfP: 0.12, mealP: 0.95,
  },
  leisure: {
    paxBag: [20, 25, 30, 30, 40, 40, 50, 60, 80, 100, 120, 150],
    minDays: 3, visits: [0, 0], sightP: 0.95, golfP: 0.30, mealP: 0.85,
  },
  academic: {
    paxBag: [15, 15, 20, 20, 25, 30, 30, 35, 40],
    minDays: 4, visits: [1, 2], sightP: 0.6, golfP: 0, mealP: 0.95,
  },
  language: {
    /* 어학연수는 **주 단위**다 — 4일짜리 어학연수를 물어보는 고객은 없다.
       ⚠ 기관 방문은 0이다. 어학연수는 어학원에서 수업을 듣는 일정이라
         「현지 기업·기관 방문」이 붙으면 그 문의는 앞뒤가 안 맞는다. */
    paxBag: [10, 12, 15, 15, 20, 20, 25, 30],
    minDays: 7, visits: [0, 0], sightP: 0.7, golfP: 0, mealP: 0.9,
  },
};

/* 🔴 **기관 종류가 연수 목적을 정한다.** 고르게 뽑으면 「동호회 산업시찰」·
   「고등학교 포상휴가」가 나온다 — 아무도 안 하는 문의다. */
const PROGRAM_BY_ORG = {
  /* ⚠ 기업에 `academic`(학술연수)을 안 넣는다 — 「건설회사 영업본부 학술연수」가 나왔다.
     기업×학술 같은 드문 계수 조합은 **가장자리 손님**(`makeEdges`)이 따로 태운다. */
  company: [{ v: 'industry', w: 8 }, { v: 'leadership', w: 7 }, { v: 'leisure', w: 6 },
    { v: 'language', w: 1 }],
  public: [{ v: 'industry', w: 8 }, { v: 'leadership', w: 4 }, { v: 'academic', w: 4 },
    { v: 'language', w: 1 }],
  education: [{ v: 'academic', w: 8 }, { v: 'language', w: 6 }, { v: 'industry', w: 3 },
    { v: 'leadership', w: 2 }],
  individual: [{ v: 'leisure', w: 9 }, { v: 'leadership', w: 1 }],
};
const PROGRAM_SAY = {
  industry: '산업시찰', leadership: '리더십 워크숍', leisure: '포상휴가',
  academic: '학술연수', language: '어학연수',
};

/* 멀수록 큰 단체가 줄어든다 — 유럽에 150명을 한 번에 보내는 회사는 드물다 */
const 권역인원상한 = (destKey) => (장거리인가(destKey) ? 80 : (국내인가(destKey) ? 200 : 150));

/* 🔴 **출발지는 노선이 정한다.** 부산 출발 로스앤젤레스가 실제로 나왔는데,
   김해에서 미주로 가는 직항은 없다 — 그런 문의는 사람이 쓴 것으로 안 읽힌다.
   국내선 연계로 갈 수는 있지만, 그건 고객이 「부산 출발」이라 적는 방식이 아니다. */
const 공항이름 = { ICN: '인천', GMP: '김포', PUS: '부산', TAE: '대구', KWJ: '광주', CJU: '제주' };

/* 어느 공항에서 어디로 뜨는가 — **국제선이 있는 곳만** 적는다.
   김포 국제선은 하네다·간사이·베이징·상해·타이베이 정도이고, 제주 국제선은 더 적다.
   「제주 출발 후아힌 100명」·「김포 출발 다낭」이 실제로 나왔는데, 그런 문의는 오지 않는다. */
const 권역출발지 = {
  국내: { ICN: 5, GMP: 9, PUS: 4, TAE: 2, KWJ: 2 },
  일본: { ICN: 12, PUS: 5, GMP: 3, TAE: 2, KWJ: 1, CJU: 1 },
  중국: { ICN: 12, PUS: 3, GMP: 2, TAE: 1, CJU: 1 },
  '홍콩·마카오': { ICN: 14, PUS: 3, TAE: 1 },
  '몽골·대만': { ICN: 13, PUS: 3, TAE: 1 },
  동남아: { ICN: 14, PUS: 4, TAE: 1 },
  중앙아시아: { ICN: 1 },
  '오세아니아·태평양': { ICN: 15, PUS: 1 },
  북미: { ICN: 19, PUS: 1 },
  유럽: { ICN: 1 },
};

function 출발지가방(destKey) {
  const region = CLASSIFY[destKey] && CLASSIFY[destKey].region;
  const 표 = 권역출발지[region];
  if (!표) throw new Error('권역 「' + region + '」의 출발지 표가 없다 — `권역출발지`에 한 줄 더할 것');
  return Object.keys(표).map((code) => ({ v: code, w: 표[code], say: 공항이름[code] }));
}

/* 리드타임 — **품의·예산 절차가 있는 곳일수록 길다** */
const 리드타임 = { company: [35, 120], public: [60, 180], education: [45, 150], individual: [30, 90] };

/* 🔴 **손님이 적는 문의 글은 손님이 고른 값에서 만든다** (대표 지시 2026-08-27:
   「사실 관계로 질문과 답변」). 문구를 따로 지어내면 「30명이라 적고 폼에는 25명」
   같은 어긋남이 생기고, 그러면 답(견적서)이 맞는지 틀린지 판단할 근거가 없어진다.
   → 아래 문장들은 **전부 같은 변수에서** 나온다. `test_xW`가 그 일치를 잠근다. */
/* 🔴 **조사(은/는·을/를)가 틀리면 사람이 쓴 글로 안 읽힌다** — 「가이드은 빼고」가
   실제로 나왔다. 받침 유무로 고른다(한글 음절 코드에서 종성만 본다). */
function 받침있나(말) {
  const 끝 = String(말).trim().slice(-1);
  const c = 끝.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return false;   /* 한글 음절이 아니면 없는 것으로 본다 */
  return (c - 0xac00) % 28 !== 0;
}
const 은는 = (말) => 말 + (받침있나(말) ? '은' : '는');
const 을를 = (말) => 말 + (받침있나(말) ? '을' : '를');   /* 포상휴가**를** · 산업시찰**을** */
/* 「이코노미**으로**」가 아니라 「이코노미**로**」다. ㄹ받침도 「로」를 쓴다(1실로). */
function 으로(말) {
  const 끝 = String(말).trim().slice(-1);
  const c = 끝.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return 말 + '로';
  const 종성 = (c - 0xac00) % 28;
  return 말 + (종성 === 0 || 종성 === 8 ? '로' : '으로');   /* 8 = ㄹ */
}

/* 「임원」은 회사 말이다 — 학교·동호회에는 그런 사람이 없다 */
const VIP_SAY = { company: '임원', public: '기관장·간부', education: '인솔 교원', individual: '운영진' };

function 문의글(p, r, 부서, 직함) {
  const 달 = Number(p.startDate.slice(5, 7));
  const 박 = p.days - 1;
  const 포함 = [p.incHotel && '호텔', p.incMeal && '식사', p.incVehicle && '차량',
    p.incGuide && '가이드', p.incSightseeing && '관광'].filter(Boolean);
  const 뺀것 = [!p.incHotel && '호텔', !p.incMeal && '식사', !p.incVehicle && '차량',
    !p.incGuide && '가이드', !p.incSightseeing && '관광'].filter(Boolean);
  const 등급말 = { standard: '3성급', superior: '4성급', deluxe: '5성급' }[p.hotelGrade];
  const vip = VIP_SAY[p.organizationType];
  const 객실말 = { double: '2인 1실', single: '1인 1실', mixed: '2인 1실(' + vip + '만 1인 1실)' }[p.roomConfig];
  const 좌석말 = { economy: '이코노미', business: '비즈니스', mixed: '이코노미(' + vip + '만 비즈니스)' }[p.cabinClass];

  const 줄 = [];
  /* ⚠ **문장 틀이 하나면 60명이 다 한 사람처럼 읽힌다.** 사실(숫자·이름)은 그대로 두고
     말투만 바꾼다 — 아래 어느 갈래를 골라도 인원·일수·목적지·출발지·월은 같은 자리에 있고,
     `test_xW`가 그 조각들을 그대로 대조한다. */
  /* 동호회에는 부서가 없다 — 「라온동호회 총무 류태현 회장입니다」가 나왔다 */
  const 소개 = p.orgNameRaw + (부서 ? ' ' + 부서 : '') + ' ' + p.personRaw + ' ' + 직함 + '입니다.';
  줄.push(pick(r, ['안녕하세요. ', '안녕하세요, 담당자님. ', '수고 많으십니다. ']) + 소개);
  줄.push(pick(r, [
    달 + '월 ' + p.destText + ' ' + p.programText + ' 일정으로 견적을 요청드립니다.',
    달 + '월 ' + p.destText + ' ' + 을를(p.programText) + ' 계획하고 있어 견적 문의드립니다.',
    달 + '월 ' + p.destText + ' ' + p.programText + ' 건으로 연락드립니다.',
  ]));
  줄.push(pick(r, [
    '인원은 ' + p.participants + '명이고 ' + p.days + '일(' + 박 + '박) 일정으로, '
      + p.departureText + ' 출발을 생각하고 있습니다.',
    '총 ' + p.participants + '명이며 ' + p.days + '일(' + 박 + '박) 일정입니다. '
      + p.departureText + ' 출발로 알아보고 있습니다.',
    p.participants + '명 기준 ' + p.days + '일(' + 박 + '박)이고, '
      + p.departureText + ' 출발을 희망합니다.',
  ]));
  줄.push(pick(r, [
    '항공은 ' + 좌석말 + ', 호텔은 ' + 등급말 + ' ' + 객실말 + ' 기준으로 부탁드립니다.',
    '항공은 ' + 으로(좌석말) + ', 숙소는 ' + 등급말 + ' ' + 객실말 + ' 정도면 좋겠습니다.',
    '좌석은 ' + 좌석말 + ', 호텔은 ' + 등급말 + ' ' + 으로(객실말) + ' 잡아 주세요.',
  ]));
  if (포함.length) {
    줄.push(은는(포함.join('·')) + ' 포함으로 잡아 주시고'
      + (뺀것.length ? ', ' + 은는(뺀것.join('·')) + ' 빼고 산출해 주세요.' : ' 산출 부탁드립니다.'));
  }
  if (p.agencyVisits) {
    /* 제주도는 국내다 — 「현지 기관」이라 부르지 않는다 */
    const 어디 = 국내인가(p.destKey) ? '도내' : '현지';
    줄.push(어디 + ' ' + (p.programType === 'academic' ? '대학·연구기관' : '기업·기관') + ' 방문 '
      + p.agencyVisits + '회를 일정에 넣어 주시면 좋겠습니다.');
  }
  if (p.incGolf) 줄.push('일정 중 골프 ' + p.golfRounds + '라운드를 ' + p.golfCount + '명 기준으로 넣어 주세요.');
  if (p.vipCount) 줄.push(vip + ' ' + p.vipCount + '분은 1인 1실로 배정 부탁드립니다.');
  /* 「지방에서 인천공항까지」는 **인천 출발일 때만** 말이 된다 — 김포 출발에 이 문장이
     붙어 있었다. 지방 공항에서 뜨면 그 버스가 필요 없다. */
  if (p.incDomestic) 줄.push('지방 사업장에서 인천공항까지 이동할 전세버스도 함께 잡아 주세요.');
  /* 마무리 한 줄 — 실제 문의 메일이 늘 붙이는 말들 */
  줄.push(pick(r, [
    '내부 품의용이라 항목별 내역이 함께 있으면 좋겠습니다.',
    '출발일은 앞뒤로 2~3일 조정 가능합니다.',
    '가능한 회신 부탁드립니다. 확정되면 바로 계약 진행 예정입니다.',
    '비슷한 조건으로 다녀온 사례가 있으면 함께 알려 주세요.',
    '예산 조정이 필요하면 어느 항목을 줄일 수 있는지도 알려 주시면 감사하겠습니다.',
  ]));
  return 줄.join(' ');
}

function makePersona(i, seed) {
  const r = rng(seed * 7919 + i * 104729 + 1);

  /* ① 어떤 조직인가 → ② 그 조직이 하는 연수 → ③ 그 연수에 맞는 목적지·규모·기간
     순서가 중요하다. 목적지를 먼저 뽑고 나머지를 독립으로 뽑으면
     「고등학교 유럽 포상휴가 150명 3일」 같은 것이 나온다. */
  const orgType = pickW(r, ORG_TYPES);
  const programV = pickW(r, PROGRAM_BY_ORG[orgType.v]).v;
  const rule = PROGRAM_RULE[programV];
  const programText = PROGRAM_SAY[programV];

  /* 목적지는 **연수 목적이 갈 수 있는 곳**에서만 뽑는다 */
  const destKey = pick(r, 목적지가방(programV));
  const 기간 = 기간규칙(destKey);
  const dep = pickW(r, 출발지가방(destKey));

  /* 인원 — 목적별 가방에서 뽑고 **권역 상한**으로 자른다.
     ⚠ 동호회는 회사가 아니다 — 80명 동호회 포상휴가가 나왔다. 따로 낮게 자른다. */
  const 상한 = Math.min(권역인원상한(destKey), orgType.v === 'individual' ? 40 : Infinity);
  const paxBag = rule.paxBag.filter((n) => n <= 상한);
  const pax = pick(r, paxBag.length ? paxBag : [Math.min(상한, 25)]);

  /* 🔴 일수 — **비행시간이 정한 최소**와 **연수 성격이 정한 최소** 중 큰 쪽을 지킨다.
     하루 보내려고 해외에 나가지 않고, 4일짜리 어학연수도 없다.
   ⚠ 어학연수는 근거리라도 주 단위라, 권역 가방에 맞는 날이 없으면 **주 단위로 올린다**
     (예전엔 여기서 한 값으로 떨어져 「마카오 7일 어학연수」 같은 것이 나왔다). */
  const 후보 = 기간.bag.filter((d) => d >= rule.minDays);
  const days = 후보.length ? pick(r, 후보)
    : (programV === 'language' ? pick(r, [7, 7, 10, 14]) : Math.max(기간.min, rule.minDays));

  const [리드lo, 리드hi] = 리드타임[orgType.v];
  const lead = int(r, 리드lo, 리드hi);
  const start = plusDays(lead);
  const end = plusDays(lead + days - 1);

  /* 이름과 부서·직함은 **함께** 정해진다 — 학교는 종류까지 보고 고른다 */
  let orgNameRaw, 부서, 직함;
  if (orgType.v === 'education') {
    const 학교종류 = pick(r, NAME_EDU);
    orgNameRaw = pick(r, NAME_HEAD) + 학교종류;
    부서 = pick(r, EDU_ROLE[학교종류].teams);
    직함 = pick(r, EDU_ROLE[학교종류].titles);
  } else {
    orgNameRaw = orgType.v === 'company' ? pick(r, NAME_HEAD) + pick(r, NAME_CO)
      : orgType.v === 'public' ? pick(r, NAME_HEAD) + pick(r, NAME_PUB)
        : pick(r, NAME_HEAD) + '동호회';
    부서 = pick(r, TEAM_BY_ORG[orgType.v]);
    직함 = pick(r, TITLE_BY_ORG[orgType.v]);
  }
  const personRaw = pick(r, SURNAME) + pick(r, GIVEN);

  /* 포함 항목 — 실제로는 **일부를 빼고 물어보는 손님**이 있고, 그 조합에서만 나는
     결함이 있다(항공 빼면 지상비만 남는다). 다만 빼는 비율은 연수 성격을 따른다:
     포상휴가에서 관광을 빼는 사람은 거의 없다. */
  const incHotel = chance(r, 0.98);
  const incMeal = chance(r, rule.mealP);
  const incVehicle = chance(r, 0.96);
  const incGuide = chance(r, 0.9);
  const incSightseeing = chance(r, rule.sightP);
  /* 골프는 **파는 곳에서만** 물어본다 — 도쿄에 골프를 물어보면 답이 없다 */
  const incGolf = 골프목적지.includes(destKey) && chance(r, rule.golfP);
  /* 지방 전세버스는 **인천에서 뜰 때** 의미가 있다 — 지방 회사가 인천공항까지 올라온다.
     김포·부산에서 뜨면서 「지방에서 공항까지 버스」를 달라는 문의는 말이 안 된다. */
  const incDomestic = dep.v === 'ICN' && chance(r, 0.2);

  /* 좌석·객실 — 장거리에서만 비즈니스가 실제로 붙는다.
     ⚠ **비즈니스석을 태울 임원이 있는 조직만** 그렇다. 동호회·학교에서
       「운영진만 비즈니스」를 요청하는 문의는 오지 않는다. */
  const 임원있나 = orgType.v === 'company' || orgType.v === 'public';
  const cabinClass = !임원있나 ? 'economy'
    : (장거리인가(destKey)
      ? (chance(r, 0.78) ? 'economy' : (chance(r, 0.6) ? 'mixed' : 'business'))
      : (chance(r, 0.96) ? 'economy' : 'mixed'));
  const hotelGrade = programV === 'leisure'
    ? (chance(r, 0.5) ? 'deluxe' : 'superior')
    : (chance(r, 0.68) ? 'superior' : (chance(r, 0.7) ? 'standard' : 'deluxe'));
  /* 전원 1인 1실은 **소규모 임원 연수**에서나 있는 일이다.
     혼합(일부만 1인 1실)은 임원·인솔 교원이 있는 조직에서만 나온다. */
  const 혼합가능 = 임원있나 || orgType.v === 'education';
  const roomConfig = (pax <= 20 && 임원있나 && chance(r, 0.18)) ? 'single'
    : ((혼합가능 && !chance(r, 0.78)) ? 'mixed' : 'double');

  const golfCount = incGolf ? Math.min(pax, int(r, 4, Math.max(4, Math.round(pax * 0.5)))) : 0;
  const golfRounds = incGolf ? int(r, 1, Math.min(3, Math.max(1, days - 2))) : 0;
  /* 🔴 **휴양지에는 방문할 기관이 없다.** 목적지 가방은 산업시찰·학술연수만 걸러서,
     「사이판 리더십 워크숍 + 현지 기업 방문 1회」가 그대로 나왔다. 목적이 아니라
     **목적지**가 정하는 것이므로 여기서 한 번 더 막는다. */
  const agencyVisits = (rule.visits[1] === 0 || 휴양지.includes(destKey)) ? 0
    : Math.min(int(r, rule.visits[0], rule.visits[1]), Math.max(1, days - 2));
  /* 임원 1인 1실은 **혼합일 때만** 화면에 나온다 — 총원의 1할 안쪽이 보통이다 */
  const vipCount = (roomConfig === 'mixed' || cabinClass === 'mixed')
    ? Math.max(1, Math.min(Math.round(pax * 0.12), int(r, 1, 6))) : 0;

  const p = {
    no: i,
    destKey,
    destText: destKey,
    programType: programV, programText,
    organizationType: orgType.v, orgTypeText: orgType.say,
    /* 기관 방문이 있으면 공식 방문, 없으면 워크숍 — **말과 값이 어긋나면 안 된다** */
    visitMode: agencyVisits > 0 ? 'official' : 'workshop',
    departureCity: dep.v, departureText: dep.say,
    participants: pax, days,
    startDate: ymd(start), endDate: ymd(end), leadDays: lead,
    cabinClass, hotelGrade, roomConfig,
    incHotel, incMeal, incVehicle, incGuide, incSightseeing, incGolf, incDomestic,
    golfCount, golfRounds, agencyVisits, vipCount,
    orgNameRaw, personRaw, team: 부서, title: 직함,
    /* 🔴 가상임이 드러나는 이름 · 존재할 수 없는 번호 */
    organization: MARK + ' ' + orgNameRaw,
    contactName: MARK + ' ' + personRaw,
    contactTel: '010-0000-' + String(1000 + (i % 9000)),
  };
  p.requestDetails = 문의글(p, r, 부서, 직함);
  return p;
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

  /* ═══ 날짜 경계 (XY) — 시즌 계수는 **출발일의 달**로만 정해진다 ═══════════════
     실측(오사카 30명): 6/30 출발은 비수기 ×0.90, 7/1 출발은 성수기 ×1.15.
     5일 일정이면 **하루 차이로 +15.9%**, 12일 일정이면 **+16.2%(1,596만원)**다.
     6/30 출발 12일은 **11일을 7월에 보내면서** 통째로 비수기 값으로 계산된다.
   ⚠ 이건 「고치라」는 뜻이 아니다 — 고객 금액 판단은 대표 몫이다(결정대기열 0-x).
     여기서는 **그 경계를 계속 재게** 해 둔다. 값이 바뀌면 이 손님들에서 먼저 보인다. */
  const 다음날짜 = (월, 일, 최소일수) => {
    const 오늘 = new Date();
    let y = 오늘.getFullYear();
    const 만들기 = (yy) => new Date(yy, 월 - 1, 일);
    let d = 만들기(y);
    while ((d - 오늘) / 86400000 < (최소일수 || 40)) { y += 1; d = 만들기(y); }
    return d;
  };
  const 날짜쌍 = (월, 일, days) => {
    const s = 다음날짜(월, 일);
    const e = new Date(s); e.setDate(e.getDate() + days - 1);
    const f = (x) => x.toLocaleDateString('sv-SE');
    return { startDate: f(s), endDate: f(e), days, leadDays: Math.round((s - new Date()) / 86400000) };
  };
  add('성수기 하루 전 출발 (6/30)', Object.assign({ destKey: '오사카' }, 날짜쌍(6, 30, 5)));
  add('성수기 첫날 출발 (7/1)', Object.assign({ destKey: '오사카' }, 날짜쌍(7, 1, 5)));
  add('🔴 6/30 출발인데 11일을 7월에 보낸다', Object.assign({ destKey: '오사카' }, 날짜쌍(6, 30, 12)));
  add('해를 넘기는 일정 (12/29 출발)', Object.assign({ destKey: '오사카' }, 날짜쌍(12, 29, 6)));
  add('2월 29일 출발 (윤년)', Object.assign({ destKey: '도쿄' }, (() => {
    /* 윤년만 고른다 — 없는 날짜를 넣으면 브라우저가 3월 1일로 밀어 버린다 */
    const 윤 = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    let y = new Date().getFullYear();
    while (!윤(y) || new Date(y, 1, 29) - new Date() < 40 * 86400000) y += 1;
    const s = new Date(y, 1, 29), e = new Date(s); e.setDate(e.getDate() + 3);
    const f = (x) => x.toLocaleDateString('sv-SE');
    return { startDate: f(s), endDate: f(e), days: 4, leadDays: Math.round((s - new Date()) / 86400000) };
  })()));

  /* ═══ 새로 생긴 규모·기간 (XW 뒤로 실제 손님이 여기까지 간다) ═══════════════ */
  add('장거리 대형 (유럽 80명 10일)', Object.assign({ destKey: '북유럽', participants: 80 }, 날짜쌍(9, 15, 10)));
  add('전원 1인 1실 장거리 (로마 20명 8일)',
    Object.assign({ destKey: '로마', participants: 20, roomConfig: 'single' }, 날짜쌍(10, 12, 8)));
  add('어학연수 14일 (도쿄 12명)', Object.assign({
    destKey: '도쿄', participants: 12, programType: 'language', programText: '어학연수',
    organizationType: 'education', orgTypeText: '학교', agencyVisits: 0, visitMode: 'workshop',
  }, 날짜쌍(11, 3, 14)));

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

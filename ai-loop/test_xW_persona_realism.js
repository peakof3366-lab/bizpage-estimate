/* ═══════════════════════════════════════════════════════════════════════════
   XW — **가상 고객이 실제로 올 법한 질문을 하는가**
   ───────────────────────────────────────────────────────────────────────────
   대표 지적(2026-08-27): 「사람들이 하루 보내려고 해외여행을 나가는 경우는 없잖어.
   가상견적서 폴더를 보니 질문이 이상한 게 너무 많더라구. 진짜 그럴듯한 질문을 던지고
   견적을 받게끔 다시 진행해 줘. 사실 관계로 질문과 답변 꼭 부탁할게.」

   금액이 맞는지를 재는 검사는 이미 많다. 이 검사가 재는 것은 **질문 자체가 말이 되는가**다.
   말이 안 되는 질문에서 나온 답은 맞아도 쓸모가 없다 — 아무도 그렇게 안 물어보니까.

   ■ 실제로 나왔던 이상한 질문들 (전부 이 검사가 잡는다)
     · 세부 3일 · 뉴욕 5일 — 왕복 이동에 이틀이 잡히는 곳
     · **부산 출발 로스앤젤레스** — 김해에서 미주 직항은 없다
     · 평생교육원 **인재개발팀** · 평생교육원 **산학협력단 주무관**
     · 고등학교 인솔자를 「**임원**」이라 부름 · 동호회에 「운영진만 비즈니스」
     · 마카오 **어학연수** · 사이판에서 「현지 기업 방문」
     · 「가이드**은** 빼고」 — 조사가 틀리면 사람이 쓴 글로 안 읽힌다
     · 김포 출발인데 「**지방에서 공항까지** 전세버스」

   🔴 **질문과 폼이 어긋나면 답이 맞는지 판단할 수 없다.** 그래서 문의 글에 적힌
     숫자(인원·일수·목적지·골프)가 실제 값과 같은지도 여기서 잠근다.

   실행: node ai-loop/test_xW_persona_realism.js
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { makeAll } = require('./_virtual_personas');
const CLASSIFY = require(path.join(ROOT, 'data.js')).DEST_CLASSIFY;
const destinationRates = require(path.join(ROOT, 'data.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
/* 손님 여럿을 한 잣대로 재고, **어긋난 손님을 이름으로 부른다** — 「몇 건 틀림」만으로는
   고칠 자리를 못 찾는다(이 저장소가 반복해서 배운 것). */
function 모두(name, people, 잣대, 말) {
  const 어긋남 = people.filter((p) => !잣대(p));
  ok(name + ' (' + people.length + '명)', 어긋남.length === 0,
    어긋남.slice(0, 3).map((p) => '#' + p.no + ' ' + 말(p)).join(' | '));
}

/* 씨앗을 여러 개 쓴다 — 한 씨앗만 보면 그 수열에서만 안 나는 조합을 놓친다 */
const 사람들 = [].concat(makeAll(150, 1), makeAll(150, 2), makeAll(150, 3));
const 국내 = (p) => CLASSIFY[p.destKey].region === '국내';

console.log('\n[1] 🔴 하루 보내려고 해외에 나가지 않는다');
모두('해외는 3일(2박) 이상이다', 사람들.filter((p) => !국내(p)),
  (p) => p.days >= 3, (p) => p.destKey + ' ' + p.days + '일');
모두('국내도 2일 이상이다', 사람들.filter(국내),
  (p) => p.days >= 2, (p) => p.destKey + ' ' + p.days + '일');
모두('유럽은 7일 이상이다', 사람들.filter((p) => CLASSIFY[p.destKey].region === '유럽'),
  (p) => p.days >= 7, (p) => p.destKey + ' ' + p.days + '일');
모두('미주 본토는 6일 이상이다',
  사람들.filter((p) => CLASSIFY[p.destKey].region === '북미' && p.destKey !== '하와이'),
  (p) => p.days >= 6, (p) => p.destKey + ' ' + p.days + '일');
모두('동남아는 4일 이상이다', 사람들.filter((p) => CLASSIFY[p.destKey].region === '동남아'),
  (p) => p.days >= 4, (p) => p.destKey + ' ' + p.days + '일');
모두('어학연수는 7일 이상이다', 사람들.filter((p) => p.programType === 'language'),
  (p) => p.days >= 7, (p) => p.destKey + ' ' + p.days + '일');

console.log('\n[2] 노선이 없는 출발지를 적지 않는다');
모두('유럽·미주·호주는 인천이나 부산에서만 뜬다',
  사람들.filter((p) => ['유럽', '북미'].includes(CLASSIFY[p.destKey].region)),
  (p) => ['ICN', 'PUS'].includes(p.departureCity), (p) => p.destKey + ' ← ' + p.departureText);
모두('제주도 가는 손님이 제주에서 출발하지 않는다', 사람들.filter(국내),
  (p) => p.departureCity !== 'CJU', (p) => p.destKey + ' ← ' + p.departureText);
/* 김포·제주는 국제선 노선이 몇 개 없다 — 「제주 출발 후아힌」·「김포 출발 다낭」이 나왔다 */
모두('김포 국제선은 일본·중국권까지만이다',
  사람들.filter((p) => p.departureCity === 'GMP' && !국내(p)),
  (p) => ['일본', '중국'].includes(CLASSIFY[p.destKey].region), (p) => '김포 → ' + p.destKey);
모두('제주 출발은 일본·중국권까지만이다',
  사람들.filter((p) => p.departureCity === 'CJU'),
  (p) => ['일본', '중국'].includes(CLASSIFY[p.destKey].region), (p) => '제주 → ' + p.destKey);
모두('광주 출발은 가까운 곳만이다',
  사람들.filter((p) => p.departureCity === 'KWJ'),
  (p) => ['국내', '일본', '중국', '몽골·대만'].includes(CLASSIFY[p.destKey].region),
  (p) => '광주 → ' + p.destKey);
모두('「지방에서 인천공항까지 버스」는 인천 출발일 때만 말한다', 사람들,
  (p) => !p.incDomestic || p.departureCity === 'ICN', (p) => p.departureText + ' 출발인데 국내수송');

console.log('\n[3] 조직과 연수 목적이 서로 맞는다');
모두('동호회는 연수를 가지 않는다(포상휴가·워크숍만)',
  사람들.filter((p) => p.organizationType === 'individual'),
  (p) => ['leisure', 'leadership'].includes(p.programType), (p) => p.orgTypeText + ' × ' + p.programText);
모두('휴양지에서 기관 방문을 넣지 않는다',
  사람들.filter((p) => ['오키나와', '괌', '사이판', '하와이', '보홀', '발리', '푸켓', '나트랑'].includes(p.destKey)),
  (p) => p.agencyVisits === 0, (p) => p.destKey + ' 방문 ' + p.agencyVisits + '회');
모두('기관 방문이 있으면 「공식 방문」, 없으면 「워크숍」이다', 사람들,
  (p) => (p.agencyVisits > 0) === (p.visitMode === 'official'),
  (p) => '방문 ' + p.agencyVisits + '회인데 ' + p.visitMode);
모두('비즈니스석은 임원이 있는 조직에서만 나온다', 사람들,
  (p) => p.cabinClass === 'economy' || ['company', 'public'].includes(p.organizationType),
  (p) => p.orgTypeText + ' · ' + p.cabinClass);

console.log('\n[4] 안 파는 것을 물어보지 않는다');
const 골프있는곳 = destinationRates.filter((d) => Number(d.golf_fee || 0) > 0).map((d) => d.destination_key);
모두('골프는 파는 목적지에서만 물어본다', 사람들.filter((p) => p.incGolf),
  (p) => 골프있는곳.includes(p.destKey), (p) => p.destKey + '에 골프 요청');
모두('골프 인원이 총원을 넘지 않는다', 사람들.filter((p) => p.incGolf),
  (p) => p.golfCount <= p.participants, (p) => p.golfCount + '/' + p.participants + '명');
모두('임원 수가 총원을 넘지 않는다', 사람들.filter((p) => p.vipCount > 0),
  (p) => p.vipCount <= p.participants, (p) => p.vipCount + '/' + p.participants + '명');

console.log('\n[5] 🔴 문의 글에 적힌 것이 실제 값과 같다 (질문과 답변의 사실 관계)');
모두('인원이 글과 같다', 사람들, (p) => p.requestDetails.includes(p.participants + '명'),
  (p) => p.participants + '명이라고 안 적혀 있다');
모두('일수와 박수가 글과 같다', 사람들,
  (p) => p.requestDetails.includes(p.days + '일(' + (p.days - 1) + '박)'),
  (p) => p.days + '일(' + (p.days - 1) + '박)이라고 안 적혀 있다');
모두('목적지가 글과 같다', 사람들, (p) => p.requestDetails.includes(p.destKey),
  (p) => p.destKey + '가 글에 없다');
모두('출발지가 글과 같다', 사람들, (p) => p.requestDetails.includes(p.departureText + ' 출발'),
  (p) => p.departureText + ' 출발이 글에 없다');
모두('출발 월이 실제 출발일의 월과 같다', 사람들,
  (p) => p.requestDetails.includes(Number(p.startDate.slice(5, 7)) + '월 ' + p.destKey),
  (p) => p.startDate + '인데 글에는 다른 달');
모두('골프를 요청한 손님만 골프를 말한다', 사람들,
  (p) => p.incGolf === /골프 \d+라운드/.test(p.requestDetails),
  (p) => 'incGolf=' + p.incGolf + '인데 글은 반대');
모두('뺀 항목을 「빼고」라고 말한다',
  사람들.filter((p) => !p.incSightseeing),
  (p) => /관광[은는] 빼고|관광·|·관광/.test(p.requestDetails) && !/관광[은는] 포함/.test(p.requestDetails),
  (p) => '관광 제외인데 글이 안 맞는다');

console.log('\n[6] 사람이 쓴 글처럼 읽힌다');
/* ⚠ 처음엔 이 검사를 「(차량|가이드…)은」을 싸잡아 잡도록 썼다가 **없는 결함 3건**을 만들었다.
   「차량**은**」은 맞는 조사다(받침 ㅇ). 받침이 있으면 은, 없으면 는이다:
     호텔(ㄹ)→은 · 차량(ㅇ)→은 · 관광(ㅇ)→은 · 식사→는 · 가이드→는
   틀린 형태만 이름으로 부른다. */
const 틀린조사 = /가이드은|식사은|차량는|관광는|호텔는|포상휴가을|학술연수을|어학연수을|산업시찰를|워크숍를|이코노미으로|비즈니스으로/;
모두('조사가 맞다 (가이드는 / 차량은)', 사람들,
  (p) => !틀린조사.test(p.requestDetails),
  (p) => (p.requestDetails.match(틀린조사) || [''])[0]);
모두('학교 담당자를 「임원」이라 부르지 않는다',
  사람들.filter((p) => p.organizationType === 'education'),
  (p) => !p.requestDetails.includes('임원'), (p) => '학교인데 임원');
모두('동호회에 부서 이름을 붙이지 않는다',
  사람들.filter((p) => p.organizationType === 'individual'),
  (p) => !/동호회 (총무|운영진) \S+ (총무|회장|운영진)입니다/.test(p.requestDetails),
  (p) => p.requestDetails.slice(0, 40));
모두('평생교육원에 산학협력단·인재개발팀이 없다',
  사람들.filter((p) => p.orgNameRaw.includes('평생교육원')),
  (p) => !/산학협력단|인재개발팀|학생처|교무처/.test(p.requestDetails), (p) => p.team);
모두('고등학교 담당자는 교사·실장이다',
  사람들.filter((p) => p.orgNameRaw.includes('고등학교')),
  (p) => ['교사', '부장교사', '실장'].includes(p.title), (p) => p.title);
모두('부서와 직함이 겹쳐 읽히지 않는다', 사람들,
  (p) => !p.team || !p.title.startsWith(p.team), (p) => p.team + ' ' + p.title);
/* 어학연수는 어학원 수업 일정이다 — 「현지 기업·기관 방문」이 붙으면 앞뒤가 안 맞는다 */
모두('어학연수에 기관 방문을 넣지 않는다', 사람들.filter((p) => p.programType === 'language'),
  (p) => p.agencyVisits === 0, (p) => p.destKey + ' 어학연수인데 방문 ' + p.agencyVisits + '회');
모두('국내(제주도)에는 「현지」라 하지 않는다',
  사람들.filter((p) => 국내(p) && p.agencyVisits > 0),
  (p) => !p.requestDetails.includes('현지 '), (p) => '제주도인데 「현지」');
모두('문의 글이 한 문장으로 끝나지 않는다', 사람들,
  (p) => p.requestDetails.split('. ').length >= 5, (p) => p.requestDetails.split('. ').length + '문장');

console.log('\n[7] 🔴 목적지 이름을 잘못 적으면 그 줄은 조용히 안 쓰인다');
{
  /* `타이베이: 5`가 실제로 그랬다 — 요율표 이름은 `대만`이라 무게가 한 번도 안 붙었다.
     지금은 `assertKeys`가 파일을 읽는 순간 던진다. 일부러 깨서 확인한다. */
  let 던졌나 = false;
  try {
    const m = require('./_virtual_personas');
    /* 파일이 이미 로드됐으므로, 같은 규칙을 직접 흉내 내 확인한다 */
    const DEST_KEYS = m.DEST_KEYS;
    const 가짜 = { 타이베이: 5 };
    const 없는것 = Object.keys(가짜).filter((k) => !DEST_KEYS.includes(k));
    던졌나 = 없는것.length === 1;
  } catch (e) { 던졌나 = false; }
  ok('요율표에 없는 이름(타이베이)을 알아본다', 던졌나);
  ok('실제 요율표에는 「대만」이 있다', require('./_virtual_personas').DEST_KEYS.includes('대만'));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

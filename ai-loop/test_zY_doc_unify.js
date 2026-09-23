/* ═══════════════════════════════════════════════════════════════════════════
   견적서 양식 통일 — **고객이 직접 뽑은 건도 같은 문서로 나간다** (2026-09-17)
   ───────────────────────────────────────────────────────────────────────────
   ■ 고치기 전
   한 회사가 **두 종류의 견적서**를 내보내고 있었다.
     · 담당자가 내부직원용으로 만든 건 → 새 양식(표준 견적서 + 일정표 탭)
     · 고객이 홈페이지에서 직접 뽑은 건 → 옛 양식(항목·금액 표)
   같은 회사 문서인데 받는 사람에 따라 달랐다.

   ■ 고친 방식
   발급할 때 문서가 없으면 **서버가** payload에서 만들어 붙인다.
   🔴 **서버에서 만드는 이유**: 발급 경로가 여럿이라(관리자 화면·고객 자동) 화면마다
     만들면 경로에 따라 다른 견적서가 나간다(결함 생성기 ①).

   ■ 🔴 이 검사가 지키는 것
   ① **금액을 다시 계산하지 않는다.** payload의 값을 그대로 옮긴다 — 여기서 곱하거나
      나누면 고객이 화면에서 본 금액과 문서의 금액이 달라진다.
   ② **없는 것을 지어내지 않는다.** 그 견적의 금액 줄에 있는 항목만 싣는다.
      호텔이 없는 견적에 「전일정 특급 호텔」이 실리면 계약 분쟁이 된다.
   ③ **표준 문구가 한 곳에만 있다.** 화면과 서버가 다른 문구를 쓰면 두 견적서가
      다른 말을 한다.
   ④ **내부 값이 새지 않는다** — 만든 문서도 담당자가 만든 문서와 **같은 검문**을 지난다.
   ⑤ **옛 링크는 그대로다.** 이미 고객 손에 나간 payload는 건드리지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const QDOC = require(path.join(ROOT, 'quote_doc.js'));
const { QUOTE_EXCLUDED } = require(path.join(ROOT, 'company-info.js'));

let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

/* 고객이 홈페이지에서 직접 뽑았을 때 실제로 만들어지는 모양 */
const SHARE = {
  v: 1, dk: '다낭', dt: '다낭', n: 30, d: 5, ng: 4,
  org: '[가상] 새롬물산(주)', cn: '[가상] 김담당', t: 56696070, pp: 1889869,
  iso: '2026-09-17', id: 'q1', sd: '2027-05-10', qno: 'Q-2609-001', rcl: '2인 1실',
  rows: [['항공료', 20000000], ['유류할증료', 3000000], ['호텔', 15000000],
         ['식사', 4500000], ['차량', 3400000], ['가이드', 2200000],
         ['관광/입장료', 1500000], ['여행자보험', 300000]],
  itiA: { t: '[가상] 다낭 코스', d: [
    { day: 1, title: '입국 · 오리엔테이션', am: '인천 출발', pm: '다낭 도착', eve: '환영 만찬', tip: '에티켓 교육 권장' },
    { day: 2, title: '산업 시찰', am: '하이테크파크', pm: '간담회', eve: '자유', tip: '' },
  ] },
  itiB: null,
};

console.log('[1] 옛 규격 payload가 새 양식 문서가 된다');
const doc = QDOC.fromShare(SHARE, { excluded: QUOTE_EXCLUDED });
ok('[1] 문서가 만들어진다', !!doc && typeof doc === 'object');
ok('[1-b] 단체·지역·인원·일수가 옮겨진다',
  doc.trip.orgName === SHARE.org && doc.trip.region === SHARE.dt
  && doc.trip.pax === 30 && doc.trip.days === 5 && doc.trip.nights === 4,
  JSON.stringify(doc.trip));

/* ═══ ① 🔴 금액은 그대로 ═══════════════════════════════════════════════ */
console.log('\n[2] 🔴 금액을 다시 계산하지 않는다');
ok('[2] 합계가 payload와 한 원까지 같다', doc.price.total === SHARE.t,
  doc.price.total + ' vs ' + SHARE.t);
ok('[2-b] 1인당도 그대로다', (doc.price.lines[0] || {}).unit === SHARE.pp,
  String((doc.price.lines[0] || {}).unit));
ok('[2-c] 인원이 그대로다', (doc.price.lines[0] || {}).qty === SHARE.n);
/* 한글 금액은 문서가 스스로 만든다(계약 문서에서 숫자 위조를 막는 줄) */
ok('[2-d] 한글 금액이 합계와 맞는다', doc.price.totalHangul === QDOC.hangulAmount(SHARE.t),
  doc.price.totalHangul);
ok('[2-e] 유류할증료가 금액에 있으면 그 사실을 적는다', /유류할증료/.test(doc.price.fuelNote || ''),
  doc.price.fuelNote);

/* ═══ ② 🔴 없는 것을 지어내지 않는다 ═══════════════════════════════════ */
console.log('\n[3] 🔴 그 견적에 있는 항목만 싣는다');
const labels = doc.details.map((d) => d.label);
ok('[3] 금액 줄에 있는 것이 실린다',
  ['항공', '호텔', '기사/차량', '가이드', '식사', '입장료', '여행자보험'].every((l) => labels.includes(l)),
  labels.join(','));
ok('[3-b] 불포함내역이 붙는다', labels.includes('불포함내역'));
const air = QDOC.fromShare(Object.assign({}, SHARE, { rows: [['항공료', 20000000]] }), { excluded: QUOTE_EXCLUDED });
const airLabels = air.details.map((d) => d.label);
ok('[3-c] 🔴 호텔이 없는 견적에 호텔을 지어내지 않는다', !airLabels.includes('호텔'), airLabels.join(','));
ok('[3-d] 가이드도 마찬가지다', !airLabels.includes('가이드'), airLabels.join(','));
ok('[3-e] 골프가 없으면 골프도 없다', !airLabels.includes('골프'));
/* 🔴 항공은 편명이 건별이라 약속을 박지 않는다 — 있다는 사실만 적는다 */
const airRow = (doc.details.find((d) => d.label === '항공') || { rows: [{}] }).rows[0];
ok('[3-f] 항공은 편명을 지어내지 않는다', !/[A-Z]{2}\d{3,4}/.test(airRow.text || ''), airRow.text);
ok('[3-g] 대신 확정 후 안내한다고 말한다', /확정 후 안내/.test(airRow.text || ''), airRow.text);

/* ═══ 🔴 고객에게 나가면 안 되는 것 ═══════════════════════════════════
   그려 보고 찾은 셋이다 — 값만 옮기고 끝냈으면 그대로 나갔다. */
console.log('\n[3-2] 🔴 그려 보고 찾은 것 셋');
const CI = require(path.join(ROOT, 'company-info.js')).COMPANY_INFO;
const withCo = QDOC.fromShare(SHARE, { excluded: QUOTE_EXCLUDED, company: CI });
/* ① 담당자 칸이 비면 문서에 **빨간 「미입력」**이 찍힌다. 담당자가 빠뜨린 것을 잡는
   표시지 고객에게 보여 주는 것이 아니다 — 고객 직접 건은 회사 대표 연락처를 넣는다. */
ok('[3-2] 담당자 자리가 비어 있지 않다', !!withCo.meta.staffName && !!withCo.meta.staffTel,
  JSON.stringify({ n: withCo.meta.staffName, t: withCo.meta.staffTel }));
ok('[3-2-b] 그 값이 회사 대표 연락처다', withCo.meta.staffTel === CI.tel);
const html0 = QDOC.renderQuote(withCo);
ok('[3-2-c] 🔴 문서에 「미입력」이 안 찍힌다', !/미입력/.test(html0),
  '고객이 빨간 미입력을 받는다');
/* ② 귀국일은 payload에 없다 — 출발일 + 일수 − 1로 만든다 */
ok('[3-2-d] 도착일이 채워진다', withCo.trip.endDate === '2027-05-14',
  withCo.trip.endDate || '(빈칸)');
/* ③ 객실 구성(「2인 1실」)을 숙박지 칸에 넣었다가 **다른 것이 그 칸에 찍혔다** */
ok('[3-2-e] 🔴 숙박지에 객실 구성을 넣지 않는다', !/1실/.test(withCo.trip.stayLabel || ''),
  withCo.trip.stayLabel);

/* ═══ 제안 일정이 일정표로 옮겨진다 ═══════════════════════════════════ */
console.log('\n[4] 제안 일정이 일정표 탭으로 옮겨진다');
ok('[4] 일정이 옮겨진다', doc.itinerary.length === 2, String(doc.itinerary.length));
ok('[4-b] 내용이 그대로다', doc.itinerary[0].title === '입국 · 오리엔테이션'
  && doc.itinerary[0].am === '인천 출발', JSON.stringify(doc.itinerary[0]).slice(0, 80));
ok('[4-c] 현장 Tip은 참고로 들어간다', /에티켓/.test(doc.itinerary[0].note || ''));
/* 🔴 `doc`이 붙으면 화면은 v2로만 그린다 — 안 옮기면 일정이 통째로 사라진다 */
const noIti = QDOC.fromShare(Object.assign({}, SHARE, { itiA: null, itiB: null }), {});
ok('[4-d] 일정이 없는 건은 빈 채로 둔다 (지어내지 않는다)', noIti.itinerary.length === 0);

/* ═══ ③ 표준 문구가 한 곳에만 ═══════════════════════════════════════════ */
console.log('\n[5] 🔴 표준 문구가 한 곳에만 있다');
const PRO = read('admin-quote-pro.html');
ok('[5] 모듈이 표준 문구를 갖는다', !!QDOC.STD_TEXT && !!QDOC.STD_TEXT['가이드']);
ok('[5-b] 화면이 그것을 가져다 쓴다', /QuoteDoc\.STD_TEXT/.test(PRO));
/* 화면이 같은 문장을 **다시 적지 않았는가** — 두 벌이 되면 두 견적서가 다른 말을 한다 */
const guide = QDOC.STD_TEXT['가이드'];
ok('[5-c] 🔴 화면에 같은 문구를 다시 적지 않았다', PRO.indexOf(guide) < 0,
  '화면에 표준 문구가 그대로 박혀 있다');
/* 🔴 **서버가 하는 일은 이제 두 파일에 걸쳐 있다.** 문서를 만들고·깎고·검문하는
   순서는 `api/_lib/share_doc.js`에 있고, 발급 엔드포인트는 그것을 부른다.
   뗀 이유: 그 순서가 서버 함수 안에만 있어서 **서버를 안 타는 검사**(브라우저 픽스처)가
   v2 견적서를 한 번도 못 보고 있었다.
   ⚠ 그래서 여기도 **두 파일을 같이** 읽는다. 한쪽만 읽으면 규칙이 옮겨간 날
     조용히 빨개지거나(규칙은 사는데 빨강) 조용히 통과한다(규칙이 죽었는데 초록). */
const SRV_API = read(path.join('api', 'quote-shares.js'));
const SRV = SRV_API + '\n' + read(path.join('api', '_lib', 'share_doc.js'));
ok('[5-d] 서버도 모듈을 쓴다(직접 적지 않는다)', /QDOC\.fromShare/.test(SRV) && SRV.indexOf(guide) < 0);
ok('[5-d2] 🔴 발급 경로가 그 모듈을 실제로 부른다', /SHAREDOC\.buildShareDoc\(/.test(SRV_API));
ok('[5-e] 불포함내역은 company-info가 진실이다',
  /require\('[^']*company-info\.js'\)/.test(SRV) && QUOTE_EXCLUDED.length > 0);

/* ═══ ④ 내부 값이 새지 않는다 ═══════════════════════════════════════════ */
console.log('\n[6] 🔴 내부 값이 안 샌다 · 검문은 한 곳');
ok('[6] 만든 문서에 내부 필드가 없다', QDOC.findInternalKeys(QDOC.stripInternal(doc)).length === 0);
/* 담당자 문서든 여기서 만든 문서든 **같은 자**를 지나야 한다 */
const guard = SRV.indexOf('findInternalKeys');
ok('[6-b] 검문이 한 곳이다', (SRV.match(/findInternalKeys/g) || []).length === 1,
  String((SRV.match(/findInternalKeys/g) || []).length) + '곳');
ok('[6-c] 그 검문이 만든 문서에도 걸린다',
  /docForShare \? QDOC\.findInternalKeys\(docForShare\) : \[\]/.test(SRV)
  && /shareDoc\.leaks\.length/.test(SRV_API));

/* ═══ ⑤ 옛 링크는 그대로 ═══════════════════════════════════════════════ */
console.log('\n[7] 옛 링크와 옛 경로를 안 건드린다');
const VIEW = read('estimate-view.html');
ok('[7] 화면의 v1 경로가 살아 있다', /d\.itiA \|\| d\.itiB/.test(VIEW));
ok('[7-b] 갈림은 여전히 `doc` 하나다', /if \(d\.doc && typeof QuoteDoc/.test(VIEW));
/* 알맹이가 없으면 문서를 붙이지 않는다 — 빈 문서로 덮으면 옛 경로가 그리던 것까지 사라진다 */
const empty = QDOC.fromShare({ v: 1, n: 0, t: 0, rows: [] }, {});
ok('[7-c] 알맹이가 없으면 총액이 0이다 (서버가 안 붙인다)', empty.price.total === 0);
ok('[7-d] 서버가 총액 0을 거른다', /built\.price\.total > 0/.test(SRV));

console.log('\n' + '─'.repeat(64));
fails.forEach((f) => console.log('  ✗ ' + f));
console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — ZY 양식 통일');
process.exit(fails.length ? 1 : 0);

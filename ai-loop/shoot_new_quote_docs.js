/* ═══════════════════════════════════════════════════════════════════════════
   새 견적서를 **대표가 눈으로 보게** 뽑는 자 (2026-09-21)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시로 세부견적서·롤링 페이지·보낼 것 고르기를 만들었는데, **대표는 아직
   그 화면을 본 적이 없다.** 승인은 설명만 듣고 한 것이다.
   → 실제로 올 법한 손님 조건으로 견적을 뽑아 **고객이 받는 화면 그대로** 파일로 남긴다.

   🔴 **여기서 견적서를 다시 그리지 않는다.** `estimate-view.html`을 진짜로 띄워
     그 페이지가 그린 결과를 찍는다. 내가 따로 그리면 「대표가 본 것」과
     「고객이 받는 것」이 갈린다 — 이 도구의 존재 이유가 바로 그 자리다.
   🔴 **운영 DB에 아무것도 안 만든다.** 발급 경로를 안 탄다(`?preview=1` +
     sessionStorage). 견적번호도 안 쓴다.
   ⚠ 이 도구가 통과했다고 「프로덕션에서 사람이 눌러 봤다」가 아니다.

   실행: node ai-loop/shoot_new_quote_docs.js
   결과: 바탕화면 `새견적서_보기\` — 손님마다 조합 4가지 + `_보기.html`
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { bootEngine } = require('./_engine_boot');
const { bootPage, ROOT } = require('./_page_boot');
const QDOC = require(path.join(ROOT, 'quote_doc.js'));
/* 🔴 **추천 일정을 여기 베껴 적지 않는다.** 진실은 `data.js`의 `ITINERARY_DB`이고,
   담당자 화면(`admin-quote-pro.html`의 「추천 일정으로 채우기」)도 같은 표를 읽는다.
   여기 따로 적으면 대표가 보는 일정과 담당자가 실제로 까는 초안이 갈린다.
   ⚠ 운영 DB의 `itinerary_overrides`는 안 얹는다 — 지금 세 목적지의 오버라이드는
     견적서에서 일괄로 심은 **「검토 전」**뿐이라 `recApplyOverride`가 기본 코스 **뒤에**
     붙인다(대체가 아니다). 즉 첫 코스는 어느 쪽이든 아래 기본 코스로 같다.
     2026-09-22 실측: 다낭 3건 전부 「검토 필요」 · 코타키나발루·파리는 오버라이드 없음. */
const { ITINERARY_DB } = require(path.join(ROOT, 'data.js'));
/* 🔴 불포함내역의 진실도 `company-info.js` 한 곳이다(`test_zK_excluded.js`가 잠근다). */
const { QUOTE_EXCLUDED } = require(path.join(ROOT, 'company-info.js'));

const OUT = path.join(os.homedir(), 'Desktop', '새견적서_보기');

/* 실제로 올 법한 손님. 🔴 **코퍼스에 실제로 있는 성격**으로 골랐다 —
   금융권 연수(고객 명단이 그쪽이다) · 포상여행 골프 · 공공기관 장거리. */
const GUESTS = [
  { id: '1_금융권연수_다낭', client: '굿리치', org: '굿리치 마케팅본부 해외연수단',
    t: { dest: '다낭', pax: 30, days: 5, date: '2026-11-10' }, spec: {},
    staff: { name: '김소연', tel: '02-2088-4253', email: 'skp1004651@hanatrabiz.com' },
    etc: ['방문 없음 (노쇼핑)', '제안 없음 (노옵션)'],
    options: [
      { label: '선택1', name: '전통 마사지 90분 (전원)', unit: 45000, qty: 30, note: '현지 결제' },
      { label: '선택2', name: '한강 선셋 크루즈 디너', unit: 68000, qty: 30, note: '사전 예약' },
    ],
    remarks: '· 단체 항공 좌석은 계약금 입금 후 확보됩니다.\n'
      + '· 세미나실(30인)·빔프로젝터는 호텔 협의 완료 후 확정 안내드립니다.\n'
      + '· 현수막·명찰 등 행사 물품은 요청 시 별도 견적으로 안내드립니다.' },

  { id: '2_포상여행골프_코타키나발루', client: '한화손해보험', org: '한화손해보험 우수직원 포상',
    t: { dest: '코타키나발루', pax: 16, days: 5, date: '2026-12-08' },
    spec: { golf: true, golfCount: 8, golfRounds: 2 },
    staff: { name: '박준형', tel: '02-2088-4253', email: 'skp1004651@hanatrabiz.com' },
    etc: ['방문 없음 (노쇼핑)', '선셋 크루즈 (선택관광, 현지 결제)'],
    options: [
      { label: '선택1', name: '골프 1라운드 추가 (그린피·카트)', unit: 165000, qty: 8, note: '현지 결제' },
      { label: '선택2', name: '캐디피 (1라운드)', unit: 35000, qty: 8, note: '현지 결제' },
    ],
    remarks: '· 골프 8명 2라운드가 견적에 포함되어 있습니다. 비골프 8명은 시내 관광으로 진행됩니다.\n'
      + '· 티오프 시간은 예약 확정 후 안내드립니다.\n'
      + '· 클럽 대여는 현지 결제이며 1세트 약 RM 100 수준입니다.' },

  { id: '3_공공기관_파리', client: '경기신용보증재단', org: '경기신용보증재단 해외연수단',
    t: { dest: '파리', pax: 20, days: 8, date: '2027-05-18' },
    spec: { hotelGrade: 'deluxe', cabinClass: 'mixed', bizCount: 3 },
    staff: { name: '이하늘', tel: '02-2088-4253', email: 'skp1004651@hanatrabiz.com' },
    etc: ['방문 없음 (노쇼핑)', '베르사유 궁전 (선택관광)'],
    options: [
      { label: '선택1', name: '비즈니스석 추가 업그레이드', unit: 2400000, qty: 3, note: '좌석 확보 후 확정' },
      { label: '선택2', name: '전용 통역사 (일 8시간)', unit: 480000, qty: 3, note: '연수 3일간' },
    ],
    remarks: '· 기관 방문(LVMH·Station F·소르본대)은 요청 기반이며 확정 시 공문이 필요합니다.\n'
      + '· 단장·부단장 3인은 비즈니스석으로 산정되어 있습니다.\n'
      + '· 쉥겐 입국 심사 지연에 대비해 연결편은 3시간 이상으로 잡았습니다.' },
];

/* 🔴 **취소 규정은 지어내지 않는다.** 국외여행 표준약관·소비자분쟁해결기준의 공개 기준을
   그대로 옮긴 것이고, 단체 계약의 실제 조건(항공 발권 후 위약금·호텔 취소 시한)은
   **건별로 공급사 조건을 따른다.** 그래서 숫자를 더 좁히지 않고 그 사실을 적는다. */
const CANCEL_POLICY = '· 여행 개시 30일 전까지 통보 시: 계약금 환급\n'
  + '· 20일 전까지 통보 시: 여행요금의 10% 배상\n'
  + '· 10일 전까지 통보 시: 여행요금의 15% 배상\n'
  + '· 여행 당일 통보 시: 여행요금의 30% 배상\n'
  + '※ 항공권 발권 이후 및 호텔·행사장 확정 이후에는 공급사 취소 규정이 우선 적용됩니다.';

/* 담당자가 고를 수 있는 조합 네 가지 (견적서는 항상 포함 — 대표 결정) */
const COMBOS = [
  { key: 'A_견적서만', parts: { breakdown: false, iti: false }, label: '견적서' },
  { key: 'B_견적서_일정표', parts: { breakdown: false, iti: true }, label: '견적서 + 일정표' },
  { key: 'C_견적서_세부견적서', parts: { breakdown: true, iti: false }, label: '견적서 + 세부견적서' },
  { key: 'D_셋다', parts: { breakdown: true, iti: true }, label: '견적서 + 세부견적서 + 일정표' },
];

const won = (n) => Number(n || 0).toLocaleString('ko-KR');

/* ⚠ `toISOString()`을 쓰지 않는다 — UTC라 한국에서 하루가 밀린다(저장소에서 두 번 밟은 자리). */
function addDays(iso, n) {
  const t = new Date(String(iso) + 'T00:00:00');
  if (isNaN(t.getTime())) return '';
  t.setDate(t.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(iso) {
  const t = new Date(String(iso) + 'T00:00:00');
  if (isNaN(t.getTime())) return '';
  return (t.getMonth() + 1) + '/' + t.getDate() + '(' + WEEK[t.getDay()] + ')';
}

/* ═══ 일정 — **담당자 화면이 까는 초안과 같은 자리에서 가져온다** ══════════════
   `admin-quote-pro.html`의 `applyItiDraft()`가 쓰는 매핑 그대로다(title·am·pm·eve,
   그리고 코스의 `tip` → 「참고」 칸). 그 함수를 직접 부를 수 없어 매핑만 옮겼으므로,
   **틀어지면 아래 [검산]이 잡도록** 코스 원문과 다시 대조한다.
   ⚠ 코스는 전부 5일짜리다. 그보다 긴 여행(파리 8일)은 담당자 화면에서도 **뒤가 빈 채**
     남는다 — 대표가 보려는 것은 「다 채워진 문서」이므로 여기서는 같은 목적지의
     **다른 코스 날**로 이어 붙이고, `_보기.html`에 그 사실을 적는다. */
function courseDays(dest, need) {
  const list = (ITINERARY_DB[dest] || []).filter((c) => c && Array.isArray(c.days) && c.days.length);
  if (!list.length) return { title: '', days: [], filler: 0 };
  const days = list[0].days.slice();
  let filler = 0;
  /* 마지막 날(귀국)은 맨 뒤에 남겨 두고 **가운데에** 다른 코스의 날을 끼운다 —
     뒤에 붙이면 「귀국」 다음에 일정이 또 나온다. */
  if (days.length < need && list[1]) {
    const tail = days.pop();
    for (const d of list[1].days.slice(1, -1)) {
      if (days.length >= need - 1) break;
      days.push(d); filler += 1;
    }
    days.push(tail);
  }
  return { title: list[0].title || '', days, filler };
}

/* 식사·숙박은 **추천 코스에 없다** — 담당자가 직접 적는 칸이다. 대표가 빈 표를 보지
   않도록 실제 단체 일정의 통상적인 모양으로 채운다(임의값, `_보기.html`에 표시). */
function mealsFor(i, last, farAway) {
  if (i === 0) return { b: '', l: farAway ? '기내식' : '기내식', d: farAway ? '기내식' : '현지식' };
  if (i === last) return { b: '호텔식', l: farAway ? '기내식' : '현지식', d: farAway ? '기내식' : '' };
  return { b: '호텔식', l: i % 2 ? '현지식' : '한식', d: i % 2 ? '한식' : '현지식' };
}

/* 담당자가 자동 산출 → 저장할 때 만드는 문서와 **같은 모양**으로 짓는다.
   ⚠ `admin-quote-pro.html`의 `buildDoc`이 하는 일을 옮긴 자리라 두 벌이다.
     그래서 아래 [검산]에서 **항목합 = 총액**을 손님마다 다시 확인한다. */
function buildDoc(g, bd) {
  const visible = (bd.rows || []).filter((r) => !r.muted)
    .map((r) => ({ name: r.name, qty: r.qty, amount: r.amount }));
  const d = QDOC.blank();
  d.meta.client = g.client;
  d.meta.regionLabel = g.t.dest;
  d.meta.quoteNo = 'BZ-샘플-' + g.id.slice(0, 1);
  d.meta.issueDate = '2026-09-21';
  d.meta.validUntil = '2026-10-05';
  /* 🔴 예전엔 「(담당자 이름)」·「02-0000-0000」이 그대로 찍혀 나갔다. 그러면 대표가
     보는 것이 **담당자가 칸을 안 채운 문서**라, 다 채워진 문서가 어떻게 보이는지를
     알 수 없다. 이름은 샘플이고 대표번호·메일은 `company-info.js`의 실제 값이다. */
  d.meta.staffName = g.staff.name;
  d.meta.staffTel = g.staff.tel;
  d.meta.staffEmail = g.staff.email;
  d.trip.orgName = g.org;
  d.trip.startDate = g.t.date;
  /* 귀국일 — 개요표에서 비어 있던 칸이다. 엔진이 쓰는 정의(출발일 + 일수 − 1) 그대로. */
  d.trip.endDate = addDays(g.t.date, g.t.days - 1);
  d.trip.days = g.t.days;
  d.trip.nights = bd.nights;
  d.trip.region = g.t.dest;
  d.trip.stayLabel = g.t.dest + '(' + bd.nights + ')';
  d.trip.pax = g.t.pax;
  d.price.lines = [{ kind: 'adult', label: '성인', unit: bd.perPerson, qty: g.t.pax }];
  d.price.condition = '10+1조건';
  d.price.fuelNote = '#9월 기준 유류할증료 적용 기준';
  d.breakdown = { rows: QDOC.allocateBreakdown(visible, bd.total) };
  d.breakdown.note = ' 환율·유류할증료 변동 시 재견적될 수 있습니다.';

  /* ═══ 상세 내용 ═══════════════════════════════════════════════════════════
     🔴 **불포함내역이 빠져 있었다.** `standardDetails`는 `excluded`를 받아야 그 칸을
       그리는데 여기서 안 넘겼다 — 그래서 대표가 본 문서 셋에는 「불포함내역」이 통째로
       없었다. 고객 문서에서 **「안 해 주는 것」이 빠지면 계약 분쟁이 된다.**
       목록은 `company-info.js` 한 곳이 진실이다(여기 다시 적지 않는다).
     ⚠ 인솔자·골프·기타사항은 `standardDetails`에 없다 — 담당자 화면
       (`admin-quote-pro.html`)이 직접 채우는 칸이다. 대표가 보는 것이 **담당자가
       만든 문서**이므로 그 화면과 같은 라벨·같은 자리로 끼운다.
       🔴 끼우는 자리는 **불포함내역 앞**이다. 그 뒤에 넣으면 빨간 불포함 칸이 문서
         한가운데로 올라가고, 9/17에 「안 해 주는 것이 제일 강하면 안 된다」고 정리한
         그 모양이 도로 무너진다. */
  const details = QDOC.standardDetails(visible.map((r) => r.name), {
    nights: bd.nights, excluded: QUOTE_EXCLUDED,
  });
  const exAt = details.findIndex((s) => s.label === '불포함내역');
  const extra = [
    { label: '인솔자', rows: [{ text: '행사 담당 책임인솔자 동행', note: '전 일정 포함' }], footnotes: [] },
  ];
  if (g.spec.golf) {
    extra.push({ label: '골프',
      rows: [{ text: g.spec.golfCount + '명 · ' + g.spec.golfRounds + '라운드', note: '전 일정 포함' }],
      footnotes: [] });
  }
  extra.push({ label: '기타사항',
    rows: g.etc.map((t, i) => ({ text: i === 0 ? '쇼핑센터 방문' : '선택관광 제안', note: t })),
    footnotes: [] });
  d.details = exAt < 0 ? details.concat(extra)
    : details.slice(0, exAt).concat(extra, details.slice(exAt));

  d.options = g.options;
  d.remarks = g.remarks;
  d.cancelPolicy = CANCEL_POLICY;

  /* ═══ 일정 ═══════════════════════════════════════════════════════════════
     🔴 예전엔 「(오전 일정)」·「(오후 일정)」이 날마다 찍혀 나갔다. 대표는 **표의 모양만**
       볼 수 있었고 **읽을 수 있는 일정표**는 본 적이 없다. 실제 추천 코스를 깐다. */
  const C = courseDays(g.t.dest, g.t.days);
  d.itinerary = Array.from({ length: g.t.days }, (_, i) => {
    const last = g.t.days - 1;
    const src = C.days[i] || {};
    const farAway = g.t.dest === '파리';
    return {
      day: i + 1,
      date: dayLabel(addDays(g.t.date, i)),
      /* 첫날·마지막 날은 **어디서 어디로 가는지**가 제목이어야 한다 — 코스의
         「입국 · 오리엔테이션」만으로는 고객이 출발 공항을 못 읽는다. */
      title: i === 0 ? ('인천 → ' + g.t.dest) : (i === last ? (g.t.dest + ' → 인천') : (src.title || '')),
      am: i === 0 ? '인천국제공항 집결 · 출국 수속' : (src.am || ''),
      pm: i === last ? (src.pm || '공항 이동 · 탑승 수속') : (src.pm || ''),
      eve: i === last ? '인천국제공항 도착 · 해산' : (src.eve || ''),
      meals: mealsFor(i, last, farAway),
      stay: i === last ? '' : (g.t.dest + ' 특급호텔'),
      note: src.tip || '',
    };
  });
  d._sample = { courseTitle: C.title, filler: C.filler };   /* 검산·안내용, 문서에는 안 들어간다 */
  return QDOC.normalize(d);
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  console.log('══ 새 견적서 뽑기 — 고객이 받는 화면 그대로 ══');
  const E = await bootEngine({ quiet: true });   /* 운영 요율을 얹는다 = 고객이 겪는 금액 */
  const made = [];
  const problems = [];
  const css = fs.readFileSync(path.join(ROOT, 'quote_doc.css'), 'utf8');

  for (const g of GUESTS) {
    const bd = E.run(g.t, g.spec);
    if (!bd) { problems.push(g.id + ': 산출 실패'); continue; }
    const doc = buildDoc(g, bd);

    /* [검산] 🔴 항목합 = 총액인가 — 대기열 0-w가 되살아나면 여기서 걸린다 */
    if (!doc.breakdown.matchesTotal) {
      problems.push(g.id + ': 🔴 항목합(' + won(doc.breakdown.sum) + ') ≠ 총액(' + won(doc.price.total) + ')');
    }
    /* [검산] 🔴 **고객은 한 줄을 곱해 본다** — 더하기만 재면 5~9원짜리 어긋남을 놓친다
       (2026-09-21에 실제로 그렇게 놓칠 뻔했다). */
    if (!doc.breakdown.rowsMultiply) {
      const badRow = doc.breakdown.rows.find((r) => r.unit * doc.breakdown.pax !== r.amount);
      problems.push(g.id + ': 🔴 줄 곱셈이 안 맞는다 — ' + (badRow ? badRow.name + ' 1인당 '
        + won(badRow.unit) + ' × ' + doc.breakdown.pax + ' ≠ ' + won(badRow.amount) : ''));
    }
    /* [검산] 🔴 **내부 용어가 고객 문서로 새지 않는가** — 「자동적용」이 실제로 나갔던 자리 */
    const jargon = doc.breakdown.rows.filter((r) => /자동적용|muted|internal/i.test(r.name));
    if (jargon.length) problems.push(g.id + ': 🔴 내부 용어가 항목 이름에 있다 — ' + jargon.map((r) => r.name).join(', '));

    /* [검산] 🔴 **빈 칸이 남았는가** — 이 도구의 목적이 「다 채워진 문서를 보여 주는 것」이라
       빈 칸이 남으면 목적 자체가 깨진다. 「미입력」은 담당자 실수를 잡으라고 있는 표시지
       대표에게 보여 주려고 있는 것이 아니다. */
    const blanks = [];
    if (!doc.meta.staffName || !doc.meta.staffTel || !doc.meta.staffEmail) blanks.push('담당자');
    if (!doc.trip.endDate) blanks.push('귀국일');
    if (!doc.details.some((s) => s.label === '불포함내역')) blanks.push('불포함내역');
    if (!doc.options.length) blanks.push('선택 옵션');
    if (!doc.remarks) blanks.push('비고');
    if (!doc.cancelPolicy) blanks.push('취소 규정');
    const emptyDays = doc.itinerary.filter((it) => !String(it.title || '').trim()
      || !String(it.am || '').trim() || !String(it.pm || '').trim());
    if (emptyDays.length) blanks.push('일정 ' + emptyDays.map((x) => 'DAY' + x.day).join('·'));
    if (blanks.length) problems.push(g.id + ': 🔴 아직 빈 칸이 있다 — ' + blanks.join(', '));

    /* [검산] 🔴 **일정이 진짜 추천 코스에서 왔는가.** 여기서 매핑을 옮겨 적었으므로
       (`applyItiDraft`와 두 벌이다) 원문과 다시 대조한다 — 어긋나면 대표가 보는 일정과
       담당자가 까는 초안이 갈린다. 첫날·마지막 날은 일부러 바꾸므로 가운데만 본다. */
    const src = courseDays(g.t.dest, g.t.days).days;
    for (let i = 1; i < g.t.days - 1; i += 1) {
      const a = doc.itinerary[i] || {}; const b = src[i] || {};
      if (b.am && a.am !== b.am) problems.push(g.id + ': 🔴 DAY' + (i + 1) + ' 오전이 코스 원문과 다르다');
      if (b.tip && a.note !== b.tip) problems.push(g.id + ': 🔴 DAY' + (i + 1) + ' 참고가 코스 tip과 다르다');
    }

    const dir = path.join(OUT, g.id);
    fs.mkdirSync(dir, { recursive: true });

    for (const c of COMBOS) {
      /* 서버가 발급 때 하는 일과 **같은 함수**로 깎는다 */
      const safe = QDOC.applyParts(QDOC.stripInternal(doc), c.parts);
      const leaks = QDOC.findInternalKeys(safe);
      if (leaks.length) {
        problems.push(g.id + '/' + c.key + ': 🔴 내부 항목이 남았다 — ' + leaks.join(', '));
        continue;
      }
      const payload = {
        v: 1, dk: g.t.dest, dt: g.t.dest, org: g.org,
        n: g.t.pax, d: g.t.days, ng: bd.nights, t: bd.total, pp: bd.perPerson,
        sd: g.t.date, iso: '2026-09-21', qno: doc.meta.quoteNo, id: 'sample',
        doc: safe,
      };

      /* 🔴 **진짜 페이지를 띄워 찍는다** */
      const b = bootPage('estimate-view.html', {
        query: '?preview=1',
        beforeBoot(w) { w.sessionStorage.setItem('bizpage_preview_share', JSON.stringify(payload)); },
      });
      await b.ready;
      await b.tick(250);
      const D = b.doc;

      const has = (id) => !!D.getElementById(id);
      /* [검산] 고른 것만 실렸는가 — 화면으로 되묻는다 */
      if (!has('qdvQuote')) problems.push(g.id + '/' + c.key + ': 🔴 견적서 구역이 없다');
      if (has('qdvBd') !== !!c.parts.breakdown) problems.push(g.id + '/' + c.key + ': 🔴 세부견적서가 체크와 다르다');
      if (has('qdvIti') !== !!c.parts.iti) problems.push(g.id + '/' + c.key + ': 🔴 일정표가 체크와 다르다');
      if (b.log.errors.length) problems.push(g.id + '/' + c.key + ': 콘솔 오류 — ' + b.log.errors[0].msg);

      /* 파일로 남길 때 바깥 자원을 끊는다 — 인터넷 없이 더블클릭해도 그대로 보여야 한다.
         CSS는 파일에 박아 넣는다(상대경로가 안 먹는 폴더에 두기 때문이다). */
      let html = D.documentElement.outerHTML;
      html = html.replace(/<link[^>]+fonts\.googleapis[^>]*>/g, '');
      html = html.replace(/<script[^>]*(cdn\.jsdelivr|quote_doc\.js|company-info\.js)[^>]*><\/script>/g, '');
      html = html.replace(/<link[^>]+quote_doc\.css[^>]*>/, '<style>' + css + '</style>');
      fs.writeFileSync(path.join(dir, c.key + '.html'), html, 'utf8');
    }
    made.push({ g, bd, doc });
    console.log('  ' + (g.id + '                                   ').slice(0, 34)
      + won(bd.total).padStart(13) + '원 · 1인 ' + won(bd.perPerson).padStart(10) + '원'
      + ' · 세부 ' + doc.breakdown.rows.length + '줄');
  }

  const idx = '<!doctype html><html lang="ko"><meta charset="utf-8">\n'
    + '<title>새 견적서 보기 — 2026-09-21</title>\n'
    + '<style>\n'
    + " body{font-family:'Malgun Gothic',sans-serif;max-width:880px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}\n"
    + ' h1{font-size:23px;margin:0 0 6px} .sub{color:#777;font-size:14px;margin:0 0 26px}\n'
    + ' .g{border:1px solid #DDD;padding:16px 18px;margin-bottom:16px}\n'
    + ' .g h2{font-size:16px;margin:0 0 4px} .amt{color:#514dc2;font-weight:700}\n'
    + ' .meta{color:#777;font-size:13px;margin:0 0 12px}\n'
    + ' a.c{display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border:1.5px solid #514dc2;color:#514dc2;'
    + 'text-decoration:none;font-size:13px;font-weight:700;border-radius:4px}\n'
    + ' a.c:hover{background:#514dc2;color:#fff}\n'
    + ' .note{background:#FAF9F7;border-left:3px solid #514dc2;padding:13px 17px;font-size:13.5px;margin:22px 0}\n'
    + ' .bad{background:#FFF4F5;border-left-color:#CC001A}\n'
    + '</style>\n'
    + '<h1>새 견적서 보기</h1>\n'
    + '<p class="sub">2026-09-22 · 고객이 받는 화면 <b>그대로</b>입니다. 아무거나 눌러 보세요.</p>\n'
    + '<div class="note"><b>무엇이 달라졌나</b><br>\n'
    + ' ① 견적서·세부견적서·일정표가 <b>한 페이지에 죽</b> 이어집니다(예전엔 탭이라 안 누르면 못 봤습니다).<br>\n'
    + ' ② 문서마다 <b>머리에 이름과 「문서 2 / 3」</b>이 붙고 사이가 벌어집니다 — 어디서 문서가'
    + ' 바뀌는지 보이게 했습니다(2026-09-22 지시).<br>\n'
    + ' ③ <b>세부견적서</b>가 새로 생겼습니다 — 항목별 금액표입니다. <b>다 더하면 총액과 1원까지 맞습니다.</b><br>\n'
    + ' ④ 담당자가 <b>체크해서 고른 것만</b> 나갑니다. 아래 네 가지가 그 조합입니다.</div>\n'
    /* 🔴 **무엇이 실제 값이고 무엇이 임의인지 가른다.** 안 가르면 대표가 이 문서의
       숫자를 실제 조건으로 읽는다 — 추정치가 사실로 굳는 자리다. */
    + '<div class="note"><b>어디까지가 실제 값인가</b> — 섞어 보시면 안 됩니다<br>\n'
    + ' <b>실제 값</b> : 총액·1인당·세부견적서 금액(<b>운영 DB 요율</b>로 산출) ·'
    + ' 일정표 본문(<b>관리자 일정 관리의 추천 코스</b> 원문) · 불포함내역 · 회사 정보·대표번호<br>\n'
    + ' <b>임의로 채운 것</b> : 담당자 <b>이름</b>(연락처는 대표번호) · 식사·숙박 칸 ·'
    + ' <b>선택 옵션 금액</b> · 비고 · 취소 규정 · 견적번호(BZ-샘플-n)<br>\n'
    + ' ⚠ 추천 코스는 전부 <b>5일</b>짜리라, 파리 8일 건은 모자란 3일을 <b>같은 목적지의 다른 코스</b>'
    + '에서 끌어와 채웠습니다. 실제 화면에서는 그 자리가 <b>빈 칸으로 남고 담당자가 적습니다.</b></div>\n'
    + made.map(function (m) {
      return '<div class="g">\n <h2>' + m.g.client + ' — ' + m.g.t.dest + ' ' + m.g.t.pax + '명 ' + m.g.t.days + '일</h2>\n'
        + ' <p class="meta">' + m.g.org + ' · ' + m.g.t.date + ' 출발 · 총액 <span class="amt">' + won(m.bd.total)
        + '원</span> · 1인 ' + won(m.bd.perPerson) + '원 · 세부견적서 ' + m.doc.breakdown.rows.length + '줄'
        + ' · 일정 ' + m.doc.itinerary.length + '일'
        + (m.doc._sample && m.doc._sample.courseTitle ? ' 「' + m.doc._sample.courseTitle + '」' : '')
        + (m.doc._sample && m.doc._sample.filler ? ' <b>(+' + m.doc._sample.filler + '일 다른 코스에서)</b>' : '')
        + '</p>\n'
        + COMBOS.map(function (c) {
          return ' <a class="c" href="' + encodeURIComponent(m.g.id) + '/' + encodeURIComponent(c.key) + '.html">' + c.label + '</a>';
        }).join('\n') + '\n</div>';
    }).join('\n')
    + '\n<div class="note' + (problems.length ? ' bad' : '') + '"><b>자가 검산</b> — '
    + (problems.length ? '🔴 확인할 것 ' + problems.length + '건' : '✅ 이상 없음') + '<br>\n'
    + (problems.length ? problems.map(function (x) { return '· ' + x; }).join('<br>\n')
      : '항목합 = 총액 · 줄마다 1인당 × 인원 = 금액 · 체크한 것만 실림 · 내부 항목 유출 0 · 콘솔 오류 0')
    + '</div>\n'
    + '<p class="sub">⚠ <b>로컬 샘플</b>입니다. 운영 DB에 아무것도 안 만들었고 견적번호도 안 썼습니다.</p>\n</html>';
  fs.writeFileSync(path.join(OUT, '_보기.html'), idx, 'utf8');

  console.log('');
  console.log('── 자가 검산 ──');
  if (problems.length) problems.forEach(function (x) { console.log('  🔴 ' + x); });
  else console.log('  ✅ 항목합 = 총액 · 줄마다 1인당 × 인원 = 금액 · 체크한 것만 실림 · 내부 항목 유출 0 · 콘솔 오류 0');
  console.log('');
  console.log('열어 보실 곳: ' + path.join(OUT, '_보기.html'));
  process.exit(problems.length ? 1 : 0);
})().catch(function (e) { console.log('🔴 터짐: ' + e.message); console.log(e.stack); process.exit(1); });

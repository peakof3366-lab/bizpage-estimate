/* ═══════════════════════════════════════════════════════════════════════════
   방식 A·B가 **비어 있을 때 고객이 실제로 보는 문구** 한 곳 (RJ)

   왜 파일을 따로 뒀는가: 관리자 화면에 '미리보기'를 붙이면서, 미리보기는 담당자가
   비워 둔 칸에 **고객 화면이 실제로 채우는 문구**를 그대로 보여줘야 한다. 빈 칸을
   빈 칸으로 보여주면 "아무것도 안 나간다"고 읽히는데 실제로는 아래 문구가 나간다 —
   미리보기가 거짓말을 하는 셈이고, 그러면 미리보기가 없느니만 못하다.

   그렇다고 이 문구를 admin.html에 다시 적으면 script.js의 것과 두 벌이 되고, 두 벌은
   반드시 어긋난다(결함 생성기 ①). 그래서 아는 곳을 여기 하나로 두고 둘 다 읽어 간다.
   limits.js(QO)와 같은 방식이다.

   - 고객 화면: index.html·admin-quote.html이 <script src="rec_fallbacks.js">로 싣고
     script.js가 전역 REC_FALLBACKS를 읽는다. **script.js보다 먼저 실어야 한다.**
   - 관리자 화면: admin.html이 같은 파일을 싣고 미리보기가 읽는다.
   - 테스트: ai-loop/test_rJ_rec_preview.js가 세 곳이 같은 값을 보는지 대조한다.

   ⚠ 여기 문구를 바꾸면 **고객이 보는 화면이 바뀐다.** 담당자가 채워 넣은 목적지는
   영향이 없지만, 비워 둔 목적지는 이 문구가 그대로 고객에게 나간다.
   ═══════════════════════════════════════════════════════════════════════════ */
const REC_FALLBACKS = {
  /* 방식 이름 배지 — 일정 탐색 카드의 '역량강화형' 자리.
     A·B가 각각 다른 값이라 plan을 키로 둔다. */
  tag: { a: '역량강화형', b: '동기부여·화합형' },

  /* 한 줄 테마 설명 — 카드 제목 아래 */
  desc: '담당 컨설턴트가 맞춤 일정을 제안드립니다.',

  /* 핵심 포인트 — 카드의 ▸ 목록 */
  points: ['목적지별 특화 프로그램 구성', '전문 가이드·통역 동행', '맞춤 일정 협의 가능'],

  /* 일별 주요 활동 — 등록된 코스가 없을 때 가운데 날짜들을 이 목록으로 돌려 채운다 */
  items: ['현지 산업 현장 탐방', '문화 체험 · 팀 활동', '전문가 강의 · 세미나', '자유 탐방 · 만찬'],

  /* 기대 효과 문구 — 고객 견적서(결재 보고용)의 검은 박스 */
  value: '연수 목적에 맞는 맞춤 일정으로 팀 역량 강화 및 결속력 향상',
};

/* ═══════════════════════════════════════════════════════════════════════════
   고객의 '방식 A·B'가 실제로 무엇으로 채워지는가 (RK)

   여기 두 함수가 **관리자 화면과 고객 화면이 갈라지던 지점**이다. 실제로 이렇게 갈렸다:
   담당자가 ✨ 방식 A·B에 써 넣은 배지·설명·포인트를 고객 화면에서 찾을 수 없었고,
   관리자의 '코스 A'가 고객의 '방식 A'로 나가지도 않았다. 두 화면을 나란히 놓고도
   어디가 어디인지 알 수 없었다.

   규칙은 원래 script.js 안에만 있었다(getItineraries·_coursesToDestRec). 관리자 화면은
   script.js를 싣지 않으므로, 관리자에서 같은 것을 보여주려면 규칙을 옮겨 적어야 하는데
   그러면 두 벌이 된다(결함 생성기 ①). 그래서 규칙을 여기로 꺼내 **둘 다 이 함수를 부른다.**
   ═══════════════════════════════════════════════════════════════════════════ */

/* 이 목적지·프로그램 유형에서 방식 A·B가 **몇 번째 코스**인가 → [aIdx, bIdx].
   ⚠ 코스가 2개 미만이거나 이 유형의 우선순위가 없으면 [0, 1]이다. 범위를 넘는
   인덱스는 0/1로 접는다(예전 getItineraries의 `courses[p[0]] || courses[0]`과 같은 결과). */
function recResolvePlanCourseIdx(courseCount, priorityForDest, programType) {
  const n = Number(courseCount) || 0;
  if (n <= 0) return null;
  let p = null;
  if (programType && n >= 2 && priorityForDest) p = priorityForDest[programType] || null;
  if (!p) p = [0, 1];
  const a = p[0] < n ? p[0] : 0;
  const b = p[1] < n ? p[1] : (n > 1 ? 1 : 0);
  return [a, b];
}

/* 코스 하나 → 고객 방식 카드가 보여주는 값.
   ⚠ 코스가 있는 목적지에서는 **이것이 DEST_REC보다 우선한다.** 담당자가 ✨에 써 둔
   글이 아니라 여기서 나온 값이 고객 화면에 뜬다. */
function recPlanFromCourse(course) {
  const c = course || {};
  return {
    tag:    c.title || '',
    desc:   c.subtitle || '',
    points: c.highlights ? c.highlights.slice(0, 3) : [],
    items:  c.days ? c.days.slice(1, -1).map(function (d) { return d.title; }) : [],
    value:  c.subtitle || '',
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   고객이 보는 **일자별 내용**을 만드는 규칙 (RR)

   왜 여기로 왔는가: 관리자 미리보기가 오전·오후·저녁을 보여주지 못하고 있었다.
   이유가 "조립 규칙이 script.js 안에 있고, 그나마 경로에 따라 두 벌이라 옮겨 적으면
   어긋난다"였다. 실제로 두 벌이었고 문구도 서로 달랐다 —
     · 코스가 있을 때  : "… — 오전 코스" / "연계 오후 프로그램 · 현장 방문" / "팀 석식"
     · 코스가 없을 때  : "… — 오전 탐방" / "… 연계 오후 프로그램" / "팀 석식 · 자유 시간"
   같은 성격의 자동 생성 문구인데 고객이 어느 경로로 들어왔느냐로 갈렸다(결함 생성기 ①).
   한 벌로 합치고, **뒤쪽(활동명이 오후에도 들어가는 쪽)**을 남겼다.

   ⚠ 이 문구는 담당자가 쓴 글이 아니라 **시스템이 만들어 고객에게 내보내는 글**이다.
   여기를 고치면 고객 견적서의 일정표와 연수 일정 탐색 타임라인이 함께 바뀐다.
   ═══════════════════════════════════════════════════════════════════════════ */

const REC_DAY_FILL = {
  /* 채울 활동명조차 없을 때 마지막으로 쓰는 이름 */
  act: '현지 탐방 · 자유 시간',

  /* 활동명 하나로 하루를 만든다 */
  make: function (act) {
    const a = String(act || '').trim() || REC_DAY_FILL.act;
    return { title: a, am: a + ' — 오전 탐방', pm: a + ' 연계 오후 프로그램',
             eve: '팀 석식 · 자유 시간', tip: '' };
  },

  /* 코스 자체가 없는 목적지의 첫날·마지막날 (코스가 있으면 코스의 일자를 쓴다) */
  arrival: function (destKey) {
    return { title: '도착 · 오리엔테이션',
             am:  '인천국제공항 출발 → ' + String(destKey || '현지') + ' 현지 도착',
             pm:  '호텔 체크인 · 도심 탐방 · 팀 오리엔테이션',
             eve: '환영 만찬 (현지 특식)',
             tip: '입국 후 현지 화폐 환전 및 교통카드 준비 권장' };
  },
  departure: function () {
    return { title: '귀국', am: '호텔 체크아웃 · 공항 이동', pm: '귀국 탑승',
             eve: '인천국제공항 도착', tip: '출발 3시간 전 공항 도착 권장' };
  },
};

/* 코스에 없는 날을 채울 활동 목록. ✨ 방식 A·B의 '일별 주요 활동'이 우선이고,
   비어 있으면 **그 방식이 실제로 쓰는 코스의** 핵심 하이라이트로 물러난다.
   ⚠ 관리자 미리보기가 이걸 courses[0]으로 잘못 잡고 있었다 — 방식 B는 보통 코스 B에서
   오는데 미리보기만 코스 A의 하이라이트를 보여줬다. 그래서 이 함수를 둘 다 부른다. */
function recDayPool(course, planItems) {
  const clean = function (arr) {
    return (Array.isArray(arr) ? arr : [])
      .map(function (s) { return String(s == null ? '' : s).trim(); })
      .filter(Boolean);
  };
  const items = clean(planItems);
  if (items.length) return items;
  return clean(course && course.highlights);
}

/* 코스 + 고객이 고른 일수 → 고객 화면에 실제로 그려지는 일자 배열.
   코스는 전부 "마지막 날 = 귀국"으로 작성되어 있어, 고객이 더 긴 일수를 고르면
   귀국일이 항상 **실제 마지막 날**에만 오도록 재배치하고 사이는 활동 목록으로 채운다.
   (예전엔 5일 초과 시 코스의 5일차 '귀국'이 중간에 그대로 나왔다.) */
function recBuildDisplayDays(course, planItems, totalDays, destKey) {
  const n = Math.max(1, Number(totalDays) || 5);
  const baseDays = (course && Array.isArray(course.days)) ? course.days : [];
  const pool = recDayPool(course, planItems);
  const out = [];

  /* 코스가 없는(또는 일자가 하나도 없는) 목적지 — 도착·귀국은 정해진 문구를 쓴다.
     ⚠ 여기서 pool이 비면 REC_FALLBACKS.items로 채운다. 예전 코드는 빈 배열을 그대로
     인덱싱해 **"undefined — 오전 탐방"**을 만들 수 있었다(결함 생성기 ②). */
  /* ⚠ 각 날에 **출처**를 함께 실어 보낸다 (RS):
       `_i`    = 코스의 몇 번째 일자에서 왔는가 (담당자가 쓴 날)
       `_auto` = 시스템이 만들어 낸 날 (담당자가 쓴 글이 아니다)
     관리자 미리보기가 "이 칸을 고치면 어디가 바뀌는가"를 이걸로 판단한다. 여기서
     안 주면 관리자가 같은 배치 규칙을 **다시 계산**해야 하고, 그 순간 두 벌이 된다
     (결함 생성기 ①). 고객 화면은 이 두 키를 읽지 않는다. */
  if (!baseDays.length) {
    const p = pool.length ? pool : REC_FALLBACKS.items;
    for (let i = 1; i <= n; i++) {
      if (i === 1)      out.push(Object.assign({ day: i, _auto: true }, REC_DAY_FILL.arrival(destKey)));
      else if (i === n) out.push(Object.assign({ day: i, _auto: true }, REC_DAY_FILL.departure()));
      else              out.push(Object.assign({ day: i, _auto: true }, REC_DAY_FILL.make(p[(i - 2) % p.length])));
    }
    return out;
  }

  const regular   = baseDays.slice(0, -1);            /* 도착~액티비티 (귀국일 제외) */
  const returnDay = baseDays[baseDays.length - 1];    /* 귀국일 템플릿 */
  for (let i = 1; i <= n; i++) {
    if (i === n) {
      out.push(Object.assign({}, returnDay, { day: i, _i: baseDays.length - 1 }));
      continue;
    }
    const regIdx = i - 1;
    if (regIdx < regular.length) {
      out.push(Object.assign({}, regular[regIdx], { day: i, _i: regIdx }));
    } else {
      const act = pool.length ? pool[(i - regular.length - 1) % pool.length] : '';
      out.push(Object.assign({ day: i, _auto: true }, REC_DAY_FILL.make(act)));
    }
  }
  return out;
}

/* 일자 하나 → 화면에 붙는 카드 **엘리먼트**.
   ⚠ 문자열 HTML이 아니라 DOM으로 만든다. 담당자가 친 글(제목·오전·오후·저녁·TIP)이
   그대로 innerHTML에 들어가고 있었다 — 관리자에서 저장한 한 줄이 고객 페이지에서
   실행될 수 있는 구조였다(결함 생성기 ④). textContent로 넣으면 그 경로가 닫힌다.
   ⚠ 관리자 미리보기도 이 함수를 부른다. 카드 모양을 두 곳에 적으면 어긋난다. */
function recRenderDayCard(doc, dayNum, data, totalDays) {
  const d = data || {};
  const el = function (tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const card = el('div', 'itin-day-card');
  const head = el('div', 'itin-day-header');
  const left = el('div', 'itin-day-hd-l');
  left.appendChild(el('span', 'itin-day-num', 'DAY ' + dayNum));
  if (dayNum === 1) left.appendChild(el('span', 'itin-day-badge itin-badge-arrive', '도착일'));
  else if (dayNum === totalDays) left.appendChild(el('span', 'itin-day-badge itin-badge-depart', '귀국일'));
  head.appendChild(left);
  head.appendChild(el('span', 'itin-day-title', String(d.title || '')));
  card.appendChild(head);

  const body = el('div', 'itin-day-body');
  [['am', '오전'], ['pm', '오후'], ['eve', '저녁']].forEach(function (pair) {
    const v = String(d[pair[0]] || '').trim();
    if (!v) return;                                   /* 빈 칸은 줄 자체를 안 그린다 */
    const slot = el('div', 'itin-slot');
    slot.appendChild(el('div', 'itin-slot-time ' + pair[0], pair[1]));
    slot.appendChild(el('div', 'itin-slot-content', v));
    body.appendChild(slot);
  });
  const tip = String(d.tip || '').trim();
  if (tip) {
    const t = el('div', 'itin-tip');
    t.appendChild(el('span', 'itin-tip-label', 'TIP '));
    t.appendChild(doc.createTextNode(tip));
    body.appendChild(t);
  }
  card.appendChild(body);
  return card;
}

/* ═══ TC: 견적서에서 읽은 일정이 있으면 **그것만** 고객에게 나간다 ═══════════
   대표 요청(2026-08-11): 「온라인에서 가져온 정보로 만들어진 추천 일정표는 사용이
   불가능한 경우가 많다. 일정표가 업데이트된 지역은 해당 내용으로, 아직 한 곳도
   업데이트가 안 된 곳은 온라인 정보로.」

   그래서 규칙은 딱 하나다:
     그 목적지의 코스 중 `source === 'quote'`가 **하나라도 있으면 → 그것들만**
     하나도 없으면                                    → 있는 그대로(온라인 기본값)

   ⚠ **여기 한 곳에서만 고른다.** 고객 견적서·일정 탐색·관리자 미리보기가 전부 이
     함수를 지난다. 화면마다 따로 거르면 **고객 견적서와 일정 탐색이 다른 일정을 보여준다**
     — 이 저장소가 RR에서 정확히 그 사고를 겪었다(결함 생성기 ①).
   ⚠ **지우지 않는다.** 온라인 코스는 그대로 남아 있고 화면에만 안 나온다. 견적서 코스를
     담당자가 지우면 자동으로 다시 온라인 코스가 나간다(되돌릴 수 있어야 한다).
   ⚠ 빈 배열이면 손대지 않는다 — 「코스가 없다」와 「전부 걸러졌다」는 다른 상태다. */
function recPreferQuoteCourses(courses) {
  if (!Array.isArray(courses) || !courses.length) return courses;
  const fromQuote = courses.filter((c) => c && c.source === 'quote');
  return fromQuote.length ? fromQuote : courses;
}

/* 이 목적지가 「견적서 일정으로 나가는 곳」인가 — 화면이 그 사실을 밝히는 데 쓴다.
   ⚠ 조용히 바뀌면 담당자는 자기가 고친 온라인 코스가 왜 안 나가는지 모른다. */
function recHasQuoteCourses(courses) {
  return Array.isArray(courses) && courses.some((c) => c && c.source === 'quote');
}

/* ═══════════════════════════════════════════════════════════════════════════
   이 견적서에 실릴 일정 한 벌 (UI)

   왜 여기로 왔는가: 조립 순서(어느 코스가 방식 A인가 → 고른 일수에 맞게 일자를
   재배치 → 고객이 읽는 모양으로 담기)가 **script.js 안에만** 있었다. 그런데
   admin.html은 script.js를 싣지 않는다(견적 엔진이 필요 없으므로). 그 결과
   **직원이 관리자 → 견적 관리에서 발급한 견적서에는 일정이 통째로 빠져 있었다** —
   고객 계산기로 나간 견적서에는 실리는데 직원이 만든 것에는 안 실리는, 같은 회사가
   두 가지 문서를 내보내는 상태였다(결함 생성기 ①이 만든 사고 중 가장 컸다).

   그래서 조립을 여기 한 번만 적고 두 화면이 이 함수를 부른다.

   ⚠ 표(ITINERARY_DB·PROGRAM_PRIORITY·DEST_REC)를 전역에서 읽지 않고 **인자로 받는다.**
     관리자 화면은 오버라이드를 전역에 덮어쓸 수 없기 때문이다 — 일정 관리 화면이
     "기본값 대비 무엇이 수정됐는가"를 보여주려면 기본값 원본이 살아 있어야 한다.
     덮어쓰면 그 비교가 조용히 무너진다.
   ⚠ 돌려주는 `a`·`b`는 **공유 페이로드에 그대로 실리는 모양**이다(estimate-view.html이
     `t`·`s`·`h`·`d`를 읽는다). 키를 바꾸면 고객 견적서의 일정이 빈칸이 된다.
   ═══════════════════════════════════════════════════════════════════════════ */
function recQuoteItinerary(src, opts) {
  const s = src || {};
  const o = opts || {};
  const db = s.itineraryDb || {};
  const priority = s.priority || {};
  const destRec = s.destRec || {};
  const destKey = o.destKey;
  const totalDays = o.totalDays;

  /* QD: 코스가 없는 목적지(관리자가 요율 관리에서 새로 추가한 곳)는 null.
     부르는 쪽이 일정 섹션만 빼고 견적서를 낸다 — 예전엔 여기서 TypeError가 나
     견적서 만들기 자체가 터졌다. */
  const raw = db[destKey];
  if (!Array.isArray(raw) || !raw.length) return null;

  const courses = recPreferQuoteCourses(raw);
  const idx = recResolvePlanCourseIdx(courses.length, priority[destKey], o.programType);
  if (!idx) return null;

  const ca = courses[idx[0]];
  const cb = courses[idx[1]] || courses[idx[0]];
  const rec = destRec[destKey] || null;

  const shape = function (course, plan) {
    const pRec = rec ? rec[plan] : null;
    return {
      t: (course && course.title) || '',
      s: (course && course.subtitle) || '',
      h: (course && course.highlights) || [],
      d: recBuildDisplayDays(course, pRec ? pRec.items : null, totalDays, destKey),
    };
  };

  return {
    /* 코스 원본 — 견적서 문서가 하이라이트·제목을 직접 읽는 데 쓴다.
       ⚠ 공유 페이로드에는 넣지 말 것. `source` 같은 내부 표시가 함께 나간다. */
    courses: [ca, cb],
    a: shape(ca, 'a'),
    b: shape(cb, 'b'),
    /* 이 일정이 견적서에서 읽은 것인가(TC) — 화면이 출처를 밝히는 데 쓴다.
       조용히 바뀌면 담당자는 자기가 고친 온라인 코스가 왜 안 나가는지 모른다. */
    fromQuoteDoc: recHasQuoteCourses(raw),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = REC_FALLBACKS;
  module.exports.recQuoteItinerary = recQuoteItinerary;
  module.exports.recPreferQuoteCourses = recPreferQuoteCourses;
  module.exports.recHasQuoteCourses = recHasQuoteCourses;
  module.exports.recResolvePlanCourseIdx = recResolvePlanCourseIdx;
  module.exports.recPlanFromCourse = recPlanFromCourse;
  module.exports.REC_DAY_FILL = REC_DAY_FILL;
  module.exports.recDayPool = recDayPool;
  module.exports.recBuildDisplayDays = recBuildDisplayDays;
  module.exports.recRenderDayCard = recRenderDayCard;
}

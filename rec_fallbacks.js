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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = REC_FALLBACKS;
  module.exports.recResolvePlanCourseIdx = recResolvePlanCourseIdx;
  module.exports.recPlanFromCourse = recPlanFromCourse;
}

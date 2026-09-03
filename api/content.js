/* 정적 페이지(index.html) 콘텐츠 오버라이드 (신규).
   index.html의 히어로/갤러리/포트폴리오/회사소개/후기/FAQ 문구·이미지는 원래 하드코딩된
   기본값을 그대로 두고, 관리자가 admin.html "콘텐츠 관리" 탭에서 수정한 항목만 이 테이블에
   저장한다. script.js는 페이지 로드 시 이 GET을 호출해 [data-cms-key] 요소 위에 값을
   덮어쓸 뿐이므로, 이 API가 느리거나 실패해도 정적 기본값으로 항상 정상 렌더링된다.

   GET (공개, 인증 불필요 — index.html 로드마다 호출) → { key: value } 플랫 맵
   PATCH (관리자 전용) → body { key, value } 단일 항목 upsert

   ?action=itineraries (QB 신규) — 추천 일정 편집. 위 문구 오버라이드와 성격이 같아
   같은 파일에 둔다.
     GET    ?action=itineraries              (공개) → { destKey: courses[] }
     PUT    ?action=itineraries              (직원+) body { destKey, courses } upsert
     DELETE ?action=itineraries&destKey=…    (직원+) 기본값(data.js)으로 되돌리기

   ?action=packages (VP 신규) — **패키지 상품**. 아래 handlePackages 머리말 참고.
     GET    ?action=packages         (공개) → 판매중이고 기한이 안 지난 것만
     GET    ?action=packages&all=1   (직원+) → 초안·마감 포함 전부
     PUT    ?action=packages         (직원+) upsert
     DELETE ?action=packages&id=…    (직원+)

   content.js/content/[key].js 2개로 나누지 않고 한 파일에서 method 분기하는 이유는
   Vercel Hobby 플랜의 배포당 서버리스 함수 12개 제한 때문(api/admin/insights.js,
   api/admin/account.js와 동일한 이유로 통합).
   ⚠ **함수가 12/12로 꽉 차 있다.** 새 기능은 새 파일이 아니라 여기 `?action=`으로 붙인다 —
     패키지도 그래서 이 파일에 들어왔다. */
const { sql } = require('./_lib/db');
const { requireRole } = require('./_lib/auth');
const { deleteAndLog } = require('./_lib/deletion_log');
/* ⚠ `packages` 테이블을 읽는 조건과 금액 계산은 **`_lib/packages.js` 하나가 진실**이다
   (VS). 여기서 쿼리를 다시 쓰면 고객 목록과 발급 조건이 갈린다 — 그때 생기는 것이
   「고객 화면에 안 보이는 상품의 견적서가 링크로는 발급되는」 상태다. */
const PKG = require('./_lib/packages');
const destinationRates = require('../data');

const KEY_PATTERN = /^[a-z]+\.([0-9]+\.)?[a-z]+$/;
const MAX_VALUE_LENGTH = 3000;

/* ── QB: 추천 일정 ────────────────────────────────────────────────────
   목적지 키는 서버가 아는 목록(data.js)으로만 받는다. 문자열 길이만 재고 통과시키면
   관리자 화면에 영영 안 보이는 유령 목적지가 DB에 쌓이고, 그걸 아무도 모른다.
   ⚠ 관리자가 요율 관리에서 추가한 커스텀 목적지(custom_destinations)도 실제 화면에
   존재하므로 함께 허용한다 — 여기서 빼면 새 목적지만 일정 편집이 조용히 실패한다. */
const BUILTIN_DEST_KEYS = new Set(destinationRates.map((d) => d.destination_key));

/* 한 목적지의 일정 전체 크기 상한. 코스 6개 × 일자 30개 정도면 어떤 실제 연수보다 넉넉하다.
   상한이 없으면 인증된 계정 하나가 실수로(또는 붙여넣기 사고로) DB를 채울 수 있다. */
/* 값은 limits.js가 안다 — 관리자 화면 사전 안내(ITI_MAX_COURSES·ITI_MAX_DAYS)와
   매뉴얼이 같은 값을 읽어야 한다(QO). */
const { MAX_COURSES, MAX_DAYS } = require('../limits');
const MAX_HIGHLIGHTS = 12;
const MAX_TEXT = 400;
const MAX_TITLE = 120;
const MAX_POINTS = 8;   /* QC: 추천 콘텐츠 핵심 포인트 */
const MAX_ITEMS = 12;   /* QC: 추천 콘텐츠 일별 활동 */

function badText(v, limit) {
  return typeof v !== 'string' || v.length > limit;
}

/* 저장 전에 모양을 확인하고, **저장할 값만 남긴 사본**을 돌려준다.
   받은 객체를 그대로 넣지 않는 이유: 화면이 안 쓰는 필드가 섞여 들어오면 나중에
   그게 의미 있는 값인 줄 알고 읽는 코드가 생긴다. 문제가 있으면 이유를 돌려준다
   (조용히 잘라내면 담당자는 저장됐다고 믿고, 화면에는 반쪽만 나온다). */
function normalizeCourses(courses) {
  /* QU: 코스와 추천 콘텐츠를 **다른 화면에서** 관리하게 되면서, 한쪽만 저장하는 호출이
     생겼다. 안 보낸 쪽은 '이번 저장에서 다루지 않음'이고 기존 값을 건드리지 않는다
     (normalizeRec이 rec에 대해 하던 것과 같은 규칙).
     ⚠ 안 보낸 것(undefined)과 **빈 배열**은 다르다. 빈 배열은 "코스를 전부 지웠다"는
     뜻이라 그대로 두면 고객 견적서에 코스가 사라진다 — 그건 되돌리기로 해야 할 일이라
     예전처럼 거절한다. */
  if (courses === undefined || courses === null) return { courses: undefined };
  if (!Array.isArray(courses) || courses.length === 0) return { error: 'courses_empty' };
  if (courses.length > MAX_COURSES) return { error: 'too_many_courses' };

  const out = [];
  for (const c of courses) {
    if (!c || typeof c !== 'object') return { error: 'course_not_object' };
    if (badText(c.title, MAX_TITLE)) return { error: 'invalid_title' };
    if (!c.title.trim()) return { error: 'empty_title' };
    if (badText(c.subtitle ?? '', MAX_TEXT)) return { error: 'invalid_subtitle' };

    const highlights = Array.isArray(c.highlights) ? c.highlights : [];
    if (highlights.length > MAX_HIGHLIGHTS) return { error: 'too_many_highlights' };
    if (highlights.some((h) => badText(h, MAX_TITLE))) return { error: 'invalid_highlight' };

    if (!Array.isArray(c.days) || c.days.length === 0) return { error: 'days_empty' };
    if (c.days.length > MAX_DAYS) return { error: 'too_many_days' };

    const days = [];
    for (let i = 0; i < c.days.length; i++) {
      const d = c.days[i];
      if (!d || typeof d !== 'object') return { error: 'day_not_object' };
      for (const f of ['title', 'am', 'pm', 'eve', 'tip']) {
        if (badText(d[f] ?? '', MAX_TEXT)) return { error: 'invalid_day_' + f };
      }
      /* day 번호는 받은 값을 믿지 않고 순서로 다시 매긴다. 화면(_buildDisplayDays)이
         배열 순서대로 일자를 배치하므로, 번호가 순서와 어긋나면 견적서에 "DAY 3" 다음
         "DAY 2"가 나온다. */
      days.push({
        day: i + 1,
        title: String(d.title ?? '').trim(),
        am:    String(d.am ?? '').trim(),
        pm:    String(d.pm ?? '').trim(),
        eve:   String(d.eve ?? '').trim(),
        tip:   String(d.tip ?? '').trim(),
      });
    }

    /* TC: **이 코스가 어디서 왔는가** (2026-08-11 대표 요청).
       'quote' = 실제 견적서 PDF에서 읽은 일정 · 없으면 온라인 자료로 만든 기본값.
       ⚠ 이 한 칸이 **고객에게 무엇이 나가는가**를 바꾼다 — 그 목적지에 견적서 일정이
         하나라도 있으면 고객은 **그것만** 본다(recPreferQuoteCourses).
         대표: 「온라인에서 가져온 추천 일정표는 사용이 불가능한 경우가 많다.」
       ⚠ 이 함수는 **화이트리스트**다. 여기 안 적으면 화면이 보낸 출처가 저장 때
         조용히 사라지고, 고객은 계속 온라인 일정을 본다(결함 생성기 ②).
       ⚠ 'quote'가 아닌 값은 **버린다**(기본값으로 본다). 아무 문자열이나 받으면
         나중에 'Quote'·'pdf' 같은 변종이 섞여 「견적서 일정인가」를 못 가린다. */
    const src = c.source === 'quote' ? 'quote' : null;
    /* UQ: **검토 전** (2026-08-19). 견적서 PDF에서 일괄로 심은 코스는 사람이 한 번
       봐야 한다 — 문서에 시간대 구분이 없어 오전 칸에 뭉쳐 있는 날이 여럿이고,
       그대로 나가면 오후·저녁이 빈 일정표가 고객에게 간다.
       ⚠ 이 칸이 붙어 있는 동안 그 코스는 **창고에만 있다.** 고객 견적서·일정 탐색에
         자동으로 나가지 않는다(recVisibleCourses). 대신 「출발점 가져오기」 후보에는
         나온다 — 창고는 꺼내 쓰라고 있는 것이다.
       ⚠ 흰 목록이라 여기 안 적으면 저장할 때 조용히 사라지고, 검토도 안 한 일정이
         고객에게 나간다(결함 생성기 ②). */
    out.push({
      title: c.title.trim(),
      subtitle: String(c.subtitle ?? '').trim(),
      highlights: highlights.map((h) => h.trim()).filter(Boolean),
      days,
      ...(src ? { source: src, sourceNote: String(c.sourceNote ?? '').trim().slice(0, 120) } : {}),
      ...(c.pending === true ? { pending: true } : {}),
    });
  }
  return { courses: out };
}

/* QC: 추천 콘텐츠(DEST_REC) — 목적지별 방식 A/B.
   { a: {tag, desc, points[], items[], value}, b: {…} }
   A·B 둘 다 요구한다. 엔진은 rec['a'] / rec['b']를 그대로 찾아 쓰는데, 한쪽만 저장하면
   나머지 한쪽이 통째로 사라진다(그때 화면은 조용히 일반 문구로 떨어진다 — 결함 생성기 ②).
   화면도 두 칸을 같이 보여주므로 반쪽 저장이 나올 이유가 없다. */
function normalizeRec(rec) {
  if (rec === null || rec === undefined) return { rec: undefined };  /* 이번 저장에서 다루지 않음 */
  if (typeof rec !== 'object' || Array.isArray(rec)) return { error: 'rec_not_object' };

  const out = {};
  for (const plan of ['a', 'b']) {
    const p = rec[plan];
    if (!p || typeof p !== 'object') return { error: 'rec_missing_' + plan };
    if (badText(p.tag ?? '', MAX_TITLE))  return { error: 'invalid_rec_tag_' + plan };
    if (badText(p.desc ?? '', MAX_TEXT))  return { error: 'invalid_rec_desc_' + plan };
    if (badText(p.value ?? '', MAX_TEXT)) return { error: 'invalid_rec_value_' + plan };

    const points = Array.isArray(p.points) ? p.points : [];
    const items  = Array.isArray(p.items)  ? p.items  : [];
    if (points.length > MAX_POINTS) return { error: 'too_many_points_' + plan };
    if (items.length  > MAX_ITEMS)  return { error: 'too_many_items_' + plan };
    if (points.some((s) => badText(s, MAX_TITLE))) return { error: 'invalid_point_' + plan };
    if (items.some((s) => badText(s, MAX_TITLE)))  return { error: 'invalid_item_' + plan };

    out[plan] = {
      tag:   String(p.tag ?? '').trim(),
      desc:  String(p.desc ?? '').trim(),
      value: String(p.value ?? '').trim(),
      points: points.map((s) => s.trim()).filter(Boolean),
      items:  items.map((s) => s.trim()).filter(Boolean),
    };
  }
  return { rec: out };
}

async function isKnownDest(destKey) {
  if (BUILTIN_DEST_KEYS.has(destKey)) return true;
  try {
    const rows = await sql`select 1 from custom_destinations where destination_key = ${destKey} limit 1`;
    return rows.length > 0;
  } catch (err) {
    /* 조회가 실패했으면 **모른다**가 정답이다. 통과시키면 이 검사가 DB 장애 때만
       조용히 열린다(auth.js가 같은 이유로 503을 쓴다). */
    console.error('[itineraries] 커스텀 목적지 조회 실패:', err);
    return null;
  }
}

async function handleItineraries(req, res) {
  if (req.method === 'GET') {
    try {
      const rows = await sql`select dest_key, courses, rec, updated_at, updated_by from itinerary_overrides`;
      const map = {};
      const recMap = {};
      const meta = {};
      for (const r of rows) {
        /* ⚠ courses가 null인 행이 있다(추천 콘텐츠만 수정한 목적지 — QU).
           그 키를 map에 넣으면 받는 쪽이 "수정본이 있다"고 읽는다: 고객 화면은
           '건너뛴 목적지' 목록에 올리고, 관리자 목록에는 ✏️ 수정됨이 붙는다.
           둘 다 사실이 아니므로 **키 자체를 넣지 않는다.** rec이 이미 그렇게 하고 있다. */
        if (r.courses) map[r.dest_key] = r.courses;
        if (r.rec) recMap[r.dest_key] = r.rec;
        meta[r.dest_key] = { updatedAt: r.updated_at, updatedBy: r.updated_by };
      }
      return res.status(200).json({ overrides: map, recOverrides: recMap, meta });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
  }

  /* 편집은 산출 담당자의 일이다(요율 단가를 직접 갱신하는 것과 같은 급). 문구·브랜딩을
     건드리는 PATCH가 owner 전용인 것과 달리 여기는 staff까지 연다 — 사용자 요청. */
  if (req.method === 'PUT') {
    if (!(await requireRole(req, res, ['owner', 'manager', 'staff']))) return;
    const { destKey, courses, rec } = req.body || {};
    if (typeof destKey !== 'string' || !destKey || destKey.length > 40) {
      return res.status(400).json({ error: 'invalid_dest_key' });
    }
    const known = await isKnownDest(destKey);
    if (known === null) return res.status(503).json({ error: 'dest_check_failed' });
    if (!known) return res.status(400).json({ error: 'unknown_dest_key' });

    const norm = normalizeCourses(courses);
    if (norm.error) return res.status(400).json({ error: norm.error });
    const normRec = normalizeRec(rec);
    if (normRec.error) return res.status(400).json({ error: normRec.error });

    /* 둘 다 안 보냈으면 할 일이 없다. 조용히 ok를 돌려주면 화면은 "저장했습니다"라고
       말하는데 실제로는 아무 일도 없었던 것이 된다(updated_at만 움직인다). */
    if (norm.courses === undefined && normRec.rec === undefined) {
      return res.status(400).json({ error: 'nothing_to_save' });
    }

    /* 안 보낸 쪽은 기존 값을 그대로 둔다(coalesce). 두 화면이 각자 자기 부분만 저장하므로,
       한쪽 화면이 들고 있던 낡은 사본이 다른 쪽을 덮어쓰는 일이 없어야 한다.
       ⚠ 새 행을 만들 때도 안 보낸 쪽은 null로 들어간다 = "이 목적지의 그 부분은
       손대지 않음(data.js 기본값 사용)". courses의 NOT NULL을 푼 이유가 이것이다. */
    const coursesJson = norm.courses === undefined ? null : JSON.stringify(norm.courses);
    const recJson = normRec.rec === undefined ? null : JSON.stringify(normRec.rec);
    try {
      const saved = await sql`
        insert into itinerary_overrides (dest_key, courses, rec, updated_at, updated_by)
        values (${destKey}, ${coursesJson}::jsonb, ${recJson}::jsonb, now(), ${req.user.displayName || ''})
        on conflict (dest_key) do update
          set courses = coalesce(excluded.courses, itinerary_overrides.courses),
              rec = coalesce(excluded.rec, itinerary_overrides.rec),
              updated_at = now(),
              updated_by = excluded.updated_by
        returning courses, rec
      `;
      return res.status(200).json({
        ok: true,
        courses: saved[0] ? saved[0].courses : norm.courses,
        rec: saved[0] ? saved[0].rec : normRec.rec,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'update_failed' });
    }
  }

  if (req.method === 'DELETE') {
    if (!(await requireRole(req, res, ['owner', 'manager', 'staff']))) return;
    const destKey = req.query && req.query.destKey;
    if (typeof destKey !== 'string' || !destKey) {
      return res.status(400).json({ error: 'invalid_dest_key' });
    }
    /* QU: 화면이 둘로 나뉘었으니 되돌리기도 자기 부분만 할 수 있어야 한다.
       part를 안 주면 예전처럼 둘 다 지운다(기존 호출과 호환). */
    const part = (req.query && req.query.part) || 'all';
    if (!['all', 'courses', 'rec'].includes(part)) {
      return res.status(400).json({ error: 'invalid_part' });
    }

    try {
      if (part === 'all') {
        /* 담당자가 며칠 다듬은 코스가 여기서 통째로 사라진다 — 남긴다 (YP) */
        const { rows } = await deleteAndLog(sql, 'itinerary_overrides',
          { column: 'dest_key', value: destKey },
          { req, reason: '일정 관리에서 기본값으로 되돌리기(전체)' });
        /* 지울 게 없었으면 그렇다고 말한다. ok:true만 돌려주면 화면은 "기본값으로
           되돌렸습니다"라고 하는데 실제로는 아무 일도 없었던 경우와 구분되지 않는다. */
        return res.status(200).json({ ok: true, removed: rows.length > 0 });
      }

      /* 한쪽만 비운다. `and … is not null`을 붙여, **실제로 지울 게 있었을 때만** 행이
         잡히게 한다 — 그래야 위와 같은 기준으로 '지웠다/없었다'를 말할 수 있다. */
      const by = req.user.displayName || '';
      const updated = part === 'courses'
        ? await sql`update itinerary_overrides set courses = null, updated_at = now(), updated_by = ${by}
                    where dest_key = ${destKey} and courses is not null returning courses, rec`
        : await sql`update itinerary_overrides set rec = null, updated_at = now(), updated_by = ${by}
                    where dest_key = ${destKey} and rec is not null returning courses, rec`;

      if (!updated.length) return res.status(200).json({ ok: true, removed: false });

      /* 둘 다 비었으면 행을 남길 이유가 없다. 남겨두면 목록에는 수정 시각만 찍혀 있고
         정작 수정된 내용은 없는, 아무도 설명할 수 없는 흔적이 된다. */
      if (!updated[0].courses && !updated[0].rec) {
        /* 빈 껍데기를 걷어내는 것이라 잃는 내용은 없지만, **삭제 자리를 예외 없이
           한 곳으로 모은다** — 여기만 직접 `delete`를 쓰면 다음 사람이 그걸 본보기로
           삼는다(결함 생성기 ①이 자라는 방식이다). */
        await deleteAndLog(sql, 'itinerary_overrides', { column: 'dest_key', value: destKey },
          { req, reason: '두 부분이 모두 비어 빈 행을 정리' });
      }
      return res.status(200).json({ ok: true, removed: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'delete_failed' });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}

/* ═══════════════════════════════════════════════════════════════════════════
   ?action=packages (VP) — **패키지 상품**. 견적 엔진을 타지 않는 두 번째 흐름이다.
   ───────────────────────────────────────────────────────────────────────────
   2026-08-21 대표 결정: 「가격도 그대로 가져온다. 우리가 하나투어 대리점이라
   그 가격 그대로 받아 **견적서화만** 하면 된다.」
   → `pricePerPerson`이 곧 고객가다. 요율·계수·마진이 하나도 안 붙는다.
   ⚠ 이 구분이 무너지면 실측이 경고한 일이 벌어진다 — 같은 하나투어 상품을 우리
     엔진으로 재산출하면 **+21.5%·+41.7% 비싸게** 나온다(코퍼스 실측 2건).

   GET    ?action=packages              (공개) → **판매중이고 기한이 안 지난 것만**
   GET    ?action=packages&all=1        (직원+) → 초안·마감 포함 전부 (관리자 화면)
   PUT    ?action=packages              (직원+) upsert
   DELETE ?action=packages&id=…         (직원+)

   ⚠ **거르는 일은 서버가 한다.** 화면에서 거르면 그건 방어가 아니다 —
     화면을 안 거치는 경로(직접 호출·캐시·다음에 만들 다른 화면)가 반드시 생긴다.
     마감된 상품으로 견적서가 나가면 대리점인 우리가 그 값으로 물어야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const { PKG_STATUS, PKG_KINDS, PKG_BASIS, ADHOC_DEFAULT_VALID_DAYS } = PKG;
const PKG_MAX_TITLE = 200;
const PKG_MAX_NOTE = 2000;
/* 일정·포함/불포함 묶음의 크기 상한. 인증 계정 하나가 붙여넣기 사고로 DB를 채우지
   못하게 한다(itineraries의 MAX_COURSES와 같은 이유). */
const PKG_MAX_JSON = 60000;

function pkgRowOut(r) {
  return {
    id: r.id,
    source: r.source, sourceCode: r.source_code,
    title: r.title,
    destKey: r.dest_key, destLabel: r.dest_label,
    nights: r.nights, days: r.days,
    departDate: r.depart_date,
    pricePerPerson: r.price_per_person == null ? null : Number(r.price_per_person),
    /* 🔴 **고객이 실제로 낼 1인 금액** (XO 후속). `pricePerPerson`과 다를 수 있다:
       항목별로 조립한 상품은 서버가 **항목 합**을 쓴다(`perPersonOf`). 그런데 화면은
       `pricePerPerson`을 그리고 있어서, **목록에서 본 금액과 받은 견적서의 금액이
       달라질 수 있었다.** 어느 쪽이 이기는지는 서버가 아는 규칙이니 **서버가 계산해
       내보낸다** — 화면이 그 규칙을 다시 구현하면 언젠가 갈라진다(결함 생성기 ①). */
    perPerson: PKG.perPersonOf(r),
    priceCurrency: r.price_currency,
    /* ⚠ **언제 값인지를 항상 함께 준다.** 이 칸이 화면까지 안 가면 고객 견적서에
       조회 시점을 못 찍고, 그러면 낡은 값인지 아무도 모른다. */
    priceAsOf: r.price_asof,
    validUntil: r.valid_until,
    status: r.status,
    /* VS — 종류·출처는 status와 **다른 축**이다. 화면이 셋을 따로 보여야
       「작성중인 상품」과 「이 손님 전용 1회용 견적」이 구분된다. */
    kind: r.kind || 'catalog',
    priceBasis: r.price_basis || 'agency',
    customerLabel: r.customer_label || null,
    lineItems: PKG.lineItemsOf(r),
    /* ⚠ 나갈 때도 https만 통과시킨다(VZ). DB를 직접 고쳤거나 옛 행이 있을 수 있어
       화면 바로 앞에서 한 번 더 막는다 — 화면은 이 값을 <img src>에 그대로 쓴다. */
    imageUrl: (typeof r.image_url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(r.image_url)) ? r.image_url : null,
    itinerary: r.itinerary, included: r.incl_items, excluded: r.excl_items,
    note: r.note,
    updatedAt: r.updated_at, updatedBy: r.updated_by,
  };
}

async function handlePackages(req, res) {
  if (req.method === 'GET') {
    const wantAll = String((req.query && req.query.all) || '') === '1';
    try {
      if (wantAll) {
        /* 관리자 화면 — 초안·마감까지 봐야 관리가 된다 */
        if (!(await requireRole(req, res, ['owner', 'manager', 'staff']))) return;
        const rows = await PKG.listAllPackages(sql);
        return res.status(200).json({ packages: rows.map(pkgRowOut) });
      }
      /* 고객 화면 — **서버가 거른다.** 판매중 · 기한 안 지남 · **catalog만**(VS).
         조건은 `_lib/packages.js`에 있다 — 발급 쪽과 갈라지지 않게 하기 위함이다. */
      const rows = await PKG.listPublicPackages(sql);
      return res.status(200).json({ packages: rows.map(pkgRowOut) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
  }

  /* 등록·수정은 산출 담당자의 일이다(일정 편집과 같은 급) — staff까지 연다 */
  if (req.method === 'PUT') {
    if (!(await requireRole(req, res, ['owner', 'manager', 'staff']))) return;
    const b = req.body || {};

    const id = typeof b.id === 'string' && b.id ? b.id.slice(0, 60) : null;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'invalid_id' });

    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title || title.length > PKG_MAX_TITLE) return res.status(400).json({ error: 'invalid_title' });

    /* ── VS: 종류와 출처 ────────────────────────────────────────────────────
       ⚠ **1회용 소규모 견적(adhoc)은 매니저 이상만 만든다**(2026-08-24 대표 결정).
         이 값은 엔진 검증을 안 거친다 — 담당자가 적은 숫자가 그대로 고객에게 나간다.
         목록 등록(catalog)은 대리점가를 옮겨 적는 일이라 staff까지 열어 둔 것과
         성격이 다르다. 권한이 곧 통제다. */
    const kind = PKG_KINDS.includes(b.kind) ? b.kind : 'catalog';
    /* ⚠ **이미 adhoc인 행을 건드리는 것도 매니저 이상이다.** 안 그러면 구멍이 하나
       남는다 — staff가 `kind`를 빼고 저장하면 기본값 catalog로 덮여서 **남의 손님
       1회용 견적이 고객 목록에 뜬다.** 들어온 값만 보면 이 경로가 안 보인다.
       adhoc → catalog 승격(반복되는 여행을 상품으로 올리는 것)도 같은 이유로 매니저 몫이다. */
    let wasAdhoc = false;
    try {
      const prev = await sql`select kind from packages where id = ${id} limit 1`;
      wasAdhoc = prev.length && prev[0].kind === 'adhoc';
    } catch (err) {
      /* 못 읽었으면 **통과시키지 않는다.** 「모르니까 괜찮겠지」가 곧 위 구멍이다. */
      console.error('[content] 패키지 종류 조회 실패:', err);
      return res.status(503).json({ error: 'kind_check_failed' });
    }
    if ((kind === 'adhoc' || wasAdhoc) && !['owner', 'manager'].includes(req.user && req.user.role)) {
      return res.status(403).json({ error: 'adhoc_requires_manager' });
    }
    const priceBasis = PKG_BASIS.includes(b.priceBasis) ? b.priceBasis : 'agency';

    /* ⚠ **가격은 숫자여야 하고 0보다 커야 한다.** 0을 통과시키면 「무료 상품」이
       고객 화면에 뜬다. 문자열을 그대로 받으면 그게 그대로 견적서에 박힌다.
       ⚠ **항목을 조립했으면 그 합이 이긴다**(VS). 담당자가 항목만 고치고 총액 칸을
         안 고치는 일은 반드시 생긴다 — 그때 화면과 견적서가 다른 금액을 말하지
         않도록 서버가 합으로 덮어쓴다. 판정은 `_lib/packages.js`가 한다. */
    const lineItems = PKG.lineItemsOf({ line_items: b.lineItems });
    if (Array.isArray(b.lineItems) && b.lineItems.length && !lineItems.length) {
      /* 보낸 항목이 **전부** 걸러졌다 — 조용히 0으로 떨어뜨리면 그 순간 총액이
         엉뚱해진다(결함 생성기 ②). 왜 못 받았는지를 말하고 거절한다. */
      return res.status(400).json({ error: 'invalid_line_items' });
    }
    const price = lineItems.length ? PKG.perPersonOf({ line_items: lineItems }) : Number(b.pricePerPerson);
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) {
      return res.status(400).json({ error: 'invalid_price' });
    }

    /* ⚠ **「언제 값인지」가 없으면 저장 자체를 거절한다**(스키마도 not null이다).
       이것 하나가 「낡은 값이 견적서로 나가는」 사고를 막는 유일한 장치다. */
    const asOf = b.priceAsOf ? new Date(b.priceAsOf) : null;
    if (!asOf || isNaN(asOf.getTime())) return res.status(400).json({ error: 'price_asof_required' });

    const status = PKG_STATUS.includes(b.status) ? b.status : 'draft';

    /* ⚠ **1회용 견적에는 기한을 반드시 붙인다**(VS). 소규모는 항공가 변동이 그대로
       손실인데, 기한 없는 1회용 견적이 쌓이면 언젠가 옛 값으로 발급된다.
       담당자가 넣었으면 그 값이 이긴다 — 여기는 **안 넣었을 때의 값**이다. */
    let validUntil = b.validUntil || null;
    if (!validUntil && kind === 'adhoc') {
      const d = new Date(Date.now() + ADHOC_DEFAULT_VALID_DAYS * 86400000);
      validUntil = d.toISOString().slice(0, 10);
    }

    /* 목적지는 **알고 있는 것만** 받는다. 길이만 재고 통과시키면 화면에 영영 안 보이는
       유령 목적지가 쌓인다(itineraries에서 같은 자리를 이미 겪었다).
       ⚠ 다만 **비워 두는 것은 허용**한다 — 요율표에 없는 곳의 패키지가 있을 수 있다. */
    let destKey = typeof b.destKey === 'string' && b.destKey ? b.destKey.slice(0, 40) : null;
    if (destKey) {
      const known = await isKnownDest(destKey);
      if (known === null) return res.status(503).json({ error: 'dest_check_failed' });
      if (!known) return res.status(400).json({ error: 'unknown_dest_key' });
    }

    const jsonOk = (v) => v == null || JSON.stringify(v).length <= PKG_MAX_JSON;
    if (!jsonOk(b.itinerary) || !jsonOk(b.included) || !jsonOk(b.excluded)) {
      return res.status(400).json({ error: 'payload_too_large' });
    }

    const intOr = (v, max) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
    };

    try {
      const who = (req.user && (req.user.username || req.user.id)) || null;
      await sql`
        insert into packages (
          id, source, source_code, title, dest_key, dest_label, nights, days, depart_date,
          price_per_person, price_currency, price_asof, valid_until, status,
          kind, price_basis, customer_label, line_items, image_url,
          itinerary, incl_items, excl_items, note, updated_by, updated_at
        ) values (
          ${id},
          ${typeof b.source === 'string' && b.source ? b.source.slice(0, 40) : 'hanatour'},
          ${typeof b.sourceCode === 'string' ? b.sourceCode.slice(0, 60) : null},
          ${title}, ${destKey},
          ${typeof b.destLabel === 'string' ? b.destLabel.slice(0, 60) : null},
          ${intOr(b.nights, 60)}, ${intOr(b.days, 61)},
          ${b.departDate || null},
          ${Math.round(price)},
          ${typeof b.priceCurrency === 'string' ? b.priceCurrency.slice(0, 8) : 'KRW'},
          ${asOf.toISOString()}, ${validUntil}, ${status},
          ${kind}, ${priceBasis},
          ${typeof b.customerLabel === 'string' ? b.customerLabel.trim().slice(0, 80) || null : null},
          ${lineItems.length ? JSON.stringify(lineItems) : null},
          ${/* https만 저장한다 — 화면이 <img src>에 그대로 쓴다(VZ) */
            (typeof b.imageUrl === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(b.imageUrl.trim()))
              ? b.imageUrl.trim().slice(0, 500) : null},
          ${b.itinerary == null ? null : JSON.stringify(b.itinerary)},
          ${b.included == null ? null : JSON.stringify(b.included)},
          ${b.excluded == null ? null : JSON.stringify(b.excluded)},
          ${typeof b.note === 'string' ? b.note.slice(0, PKG_MAX_NOTE) : ''},
          ${who}, now()
        )
        on conflict (id) do update set
          source = excluded.source, source_code = excluded.source_code,
          title = excluded.title, dest_key = excluded.dest_key, dest_label = excluded.dest_label,
          nights = excluded.nights, days = excluded.days, depart_date = excluded.depart_date,
          price_per_person = excluded.price_per_person, price_currency = excluded.price_currency,
          price_asof = excluded.price_asof, valid_until = excluded.valid_until,
          status = excluded.status,
          kind = excluded.kind, price_basis = excluded.price_basis,
          customer_label = excluded.customer_label, line_items = excluded.line_items,
          image_url = excluded.image_url,
          itinerary = excluded.itinerary, incl_items = excluded.incl_items, excl_items = excluded.excl_items,
          note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
      `;
      return res.status(200).json({ ok: true, id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'save_failed' });
    }
  }

  if (req.method === 'DELETE') {
    if (!(await requireRole(req, res, ['owner', 'manager', 'staff']))) return;
    const id = (req.query && req.query.id) || '';
    if (!id || !/^[A-Za-z0-9_-]+$/.test(String(id))) return res.status(400).json({ error: 'invalid_id' });
    try {
      /* 🔴 **여기가 2026-08-24에 상품 30건이 사라진 자리다** (YP). 그때는 지워도
         아무 데도 안 남아서, 대기열 P-1이 「직접 지우셨습니까?」로 몇 주 열려 있었다.
         이제 지우기 전에 행 전체가 `deletion_log`에 남는다 — 되돌릴 근거가 된다. */
      const { deleted } = await deleteAndLog(sql, 'packages', { column: 'id', value: String(id) },
        { req, reason: '상품 목록에서 삭제' });
      return res.status(200).json({ ok: true, removed: deleted > 0 });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'delete_failed' });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}

module.exports = async (req, res) => {
  if (req.query && req.query.action === 'itineraries') return handleItineraries(req, res);
  if (req.query && req.query.action === 'packages') return handlePackages(req, res);

  if (req.method === 'GET') {
    try {
      const rows = await sql`select key, value from content_overrides`;
      const map = {};
      for (const r of rows) map[r.key] = r.value;
      return res.status(200).json(map);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
  }

  if (req.method === 'PATCH') {
    /* 공개 사이트 문구/브랜딩이라 오탈자·브랜딩 이슈에 민감 — 관리자 전용 */
    if (!(await requireRole(req, res, ['owner']))) return;
    const { key, value } = req.body || {};
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      return res.status(400).json({ error: 'invalid_key' });
    }
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
      return res.status(400).json({ error: 'invalid_value' });
    }
    try {
      await sql`
        insert into content_overrides (key, value, updated_at)
        values (${key}, ${value}, now())
        on conflict (key) do update
          set value = excluded.value, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'update_failed' });
    }
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

/* 테스트가 서버를 띄우지 않고 검증 규칙만 직접 돌릴 수 있게 노출한다.
   (검증 로직을 테스트에 다시 옮겨 적으면 두 벌이 어긋난다 — 결함 생성기 ①) */
module.exports.normalizeCourses = normalizeCourses;
module.exports.normalizeRec = normalizeRec;
module.exports.MAX_COURSES = MAX_COURSES;
module.exports.MAX_DAYS = MAX_DAYS;
module.exports.MAX_POINTS = MAX_POINTS;
module.exports.MAX_ITEMS = MAX_ITEMS;

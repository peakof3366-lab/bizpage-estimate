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

   content.js/content/[key].js 2개로 나누지 않고 한 파일에서 method 분기하는 이유는
   Vercel Hobby 플랜의 배포당 서버리스 함수 12개 제한 때문(api/admin/insights.js,
   api/admin/account.js와 동일한 이유로 통합). */
const { sql } = require('./_lib/db');
const { requireRole } = require('./_lib/auth');
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

    out.push({
      title: c.title.trim(),
      subtitle: String(c.subtitle ?? '').trim(),
      highlights: highlights.map((h) => h.trim()).filter(Boolean),
      days,
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
        const rows = await sql`delete from itinerary_overrides where dest_key = ${destKey} returning dest_key`;
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
        await sql`delete from itinerary_overrides where dest_key = ${destKey}`;
      }
      return res.status(200).json({ ok: true, removed: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'delete_failed' });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}

module.exports = async (req, res) => {
  if (req.query && req.query.action === 'itineraries') return handleItineraries(req, res);

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

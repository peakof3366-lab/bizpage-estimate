const { sql } = require('../_lib/db');
const { requireAdmin, requireRole } = require('../_lib/auth');
/* UI: 견적서 전용 일정도 일정 관리 화면과 **같은 검증**을 지난다 — 모양이 같으므로
   규칙을 다시 적을 이유가 없다(결함 생성기 ①). */
const { normalizeCourses } = require('../content');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = req.body || {};
    try {
      if (body.addLog) {
        const entry = {
          ts: new Date().toISOString(),
          author: String(body.addLog.author || '').slice(0, 40),
          text: String(body.addLog.text || '').slice(0, 500),
        };
        await sql`
          update quotes set activity_log = activity_log || ${JSON.stringify([entry])}::jsonb
          where id = ${id}
        `;
        return res.status(200).json({ ok: true, entry });
      }

      /* 실제 계약 항공료 저장 (신규) — status/note/assignee 일반 저장과 분리된 별도
         분기(addLog와 동일한 이유): 아래 일반 저장은 매번 세 필드를 무조건 덮어쓰므로
         같이 묶으면 실수로 이 값을 null로 되돌릴 위험이 있음. */
      if (body.actualAirfare) {
        const unit = Number(body.actualAirfare && body.actualAirfare.unit);
        if (!Number.isFinite(unit) || unit <= 0 || unit > 50000000) return res.status(400).json({ error: 'invalid_unit' });
        await sql`update quotes set actual_airfare_unit = ${unit} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* 실제 계약 호텔단가 저장 (신규) — 위 actualAirfare 분기와 대칭 */
      if (body.actualHotel) {
        const unit = Number(body.actualHotel && body.actualHotel.unit);
        if (!Number.isFinite(unit) || unit <= 0 || unit > 50000000) return res.status(400).json({ error: 'invalid_unit' });
        await sql`update quotes set actual_hotel_unit = ${unit} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* 실제 계약 식비 저장 (신규 · P1b) — 항공/호텔과 대칭 */
      if (body.actualMeal) {
        const unit = Number(body.actualMeal && body.actualMeal.unit);
        if (!Number.isFinite(unit) || unit <= 0 || unit > 50000000) return res.status(400).json({ error: 'invalid_unit' });
        await sql`update quotes set actual_meal_unit = ${unit} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* 실제 총 계약가 저장 (신규 · P1b) — 종합 정확도 측정용. 총액이라 상한을 크게 둔다. */
      if (body.actualTotal) {
        const value = Number(body.actualTotal && body.actualTotal.value);
        if (!Number.isFinite(value) || value <= 0 || value > 10000000000) return res.status(400).json({ error: 'invalid_total' });
        await sql`update quotes set actual_total = ${value} where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      /* UI: 이 견적서 전용 일정 저장 — 작성자가 마지막에 확인·수정한 그 일정.
         위 actual* 분기와 같은 이유로 일반 저장과 분리한다(아래는 세 필드를 무조건
         덮어쓰므로 같이 묶으면 실수로 일정을 null로 되돌린다).

         ⚠ 검증은 **api/content.js의 normalizeCourses 그대로**다. 일정 관리 화면이
           저장하는 코스와 같은 모양이라, 여기에 검증을 다시 적으면 두 벌이 되고
           반드시 어긋난다(결함 생성기 ①). 그래서 모양 자체를 맞춰 두었다.
         ⚠ 조용히 잘라내지 않는다 — 이유를 돌려준다. 잘라내면 작성자는 저장됐다고
           믿고 고객에게는 반쪽 일정이 나간다.
         ⚠ null을 명시적으로 보내면 **전용 일정을 지운다**(목적지 공통으로 되돌린다).
           되돌릴 수단이 없으면 잘못 저장한 일정을 걷어낼 방법이 없다. */
      if (body.itinerary !== undefined) {
        if (body.itinerary === null) {
          await sql`update quotes set itinerary = null where id = ${id}`;
          return res.status(200).json({ ok: true, removed: true });
        }
        const it = body.itinerary;
        if (!it || typeof it !== 'object') return res.status(400).json({ error: 'invalid_itinerary' });
        const norm = normalizeCourses(it.courses);
        if (norm.error) return res.status(400).json({ error: norm.error });
        /* courses가 undefined면 "이번 저장에서 안 다룸"인데, 전용 일정을 저장하면서
           코스를 안 보내는 호출은 있을 수 없다 — 그대로 두면 빈 껍데기가 저장된다. */
        if (!norm.courses) return res.status(400).json({ error: 'courses_empty' });

        const stored = {
          courses: norm.courses,
          /* 누가·언제 확인했는가. 작성자를 클라이언트가 보낸 값으로 받지 않는다 —
             그러면 확인 기록이 스스로 증명하지 못한다(로그인한 사람이 곧 작성자다). */
          confirmedBy: (req.user && req.user.displayName) || '',
          confirmedAt: new Date().toISOString(),
          /* 확인 당시의 견적 일수. 나중에 견적 일수가 바뀌면 이 일정은 다시 봐야 한다. */
          days: Number.isFinite(Number(it.days)) ? Number(it.days) : null,
        };
        await sql`update quotes set itinerary = ${JSON.stringify(stored)}::jsonb where id = ${id}`;
        return res.status(200).json({ ok: true, itinerary: stored });
      }

      /* 부분 수정 (PU) — 문의(api/inquiries/[id].js)와 같은 이유. 예전에는 안 보낸
         필드를 기본값으로 초기화해서, 담당자만 바꿔도 그 브라우저의 stale한 상태·메모가
         서버 값을 덮었다. 여기는 견적 파이프라인이라 '상담중'이 '신규'로 되돌아가면
         응대 순서 자체가 틀어진다. 보낸 것만 바꾼다(빈 문자열은 유효한 값). */
      const keep = (v) => (v === undefined ? null : v);
      await sql`
        update quotes set
          status   = coalesce(${keep(body.status)}::text,   status),
          note     = coalesce(${keep(body.note)}::text,     note),
          assignee = coalesce(${keep(body.assignee)}::text, assignee)
        where id = ${id}
      `;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'update_failed' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    /* 삭제는 매니저 이상 (신규) — 예전엔 로그인만 하면 누구나 견적 레코드를
       영구 삭제할 수 있었다. 되돌릴 방법도, 누가 지웠는지 남는 기록도 없다.
       고객 리드는 매출로 직결되는 데이터이고 팀원이 여러 명이 되면 실수 한 번의
       대가가 크다. 관리자 화면 권한 매트릭스(데이터 삭제는 상위 권한)와도 어긋나
       있었다 — 목적지 삭제·계수 저장은 이미 매니저 이상으로 잠겨 있다. */
    if (!(await requireRole(req, res, ['owner', 'manager']))) return;
    try {
      await sql`delete from quotes where id = ${id}`;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'delete_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

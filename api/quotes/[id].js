const { sql } = require('../_lib/db');
const { requireAdmin, requireRole } = require('../_lib/auth');
const { deleteAndLog } = require('../_lib/deletion_log');
/* UI: 견적서 전용 일정도 일정 관리 화면과 **같은 검증**을 지난다 — 모양이 같으므로
   규칙을 다시 적을 이유가 없다(결함 생성기 ①). */
const { normalizeCourses } = require('../content');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { id } = req.query;

  /* ── 한 건만 읽는다 (2026-09-23) ───────────────────────────────────────────
     편집 화면이 iframe으로 열릴 때 **그 건 하나**가 필요하다. 목록(`/api/quotes`)은
     1,000건을 통째로 실어 보내므로 창 하나 여는 데 쓸 것이 아니다.
     ⚠ 새 파일을 만들지 않는다 — Vercel 함수 12개 제한에 이미 닿아 있다(CLAUDE.md).
       이 파일은 이미 있으므로 **메서드 분기**는 공짜다. */
  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from quotes where id = ${id}`;
      if (!rows.length) return res.status(404).json({ error: 'quote_not_found' });
      const r = rows[0];
      /* 🔴 컬럼을 payload **뒤에** 둔다 — 화면이 보낸 같은 이름을 덮는다(목록과 같은 규칙) */
      return res.status(200).json({
        ...r.payload, id: r.id, status: r.status, note: r.note,
        quoteNo: r.quote_no || null, sourceQuoteNo: r.source_quote_no || null,
        assignee: r.assignee || '', activityLog: r.activity_log || [],
        itinerary: r.itinerary || null,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'query_failed' });
    }
  }

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

      /* 🔴 **견적서 문서 저장** (2026-09-15, 견적산출 3분류 개편 요구 5).
         `quote_doc.js`가 정한 규격의 문서 1건을 견적에 붙인다. 내부직원용 화면과
         직접견적 화면이 **같은 규격**을 여기로 보낸다(대표 지시: 결과 데이터 규격 동일).

         ⚠ 위 actual*·itinerary 분기와 같은 이유로 일반 저장과 분리한다 — 아래 일반
           저장은 status/note/assignee 세 필드를 무조건 덮어쓰므로, 같이 묶으면 실수로
           문서를 통째로 날린다.
         ⚠ **payload 안에 넣는다**(별도 컬럼이 아니다). 컬럼을 늘리면 마이그레이션이
           배포보다 먼저 돌아야 하고, 순서가 뒤바뀌면 그 기능이 500으로 깨진다.
           `payload`는 이미 jsonb라 추가 비용이 없다.
         🔴 **여기 담기는 것은 내부본이다** — 원가·마진·내부 메모가 들어 있다.
           `quotes`는 로그인한 직원만 읽는다(이 파일 첫 줄 `requireAdmin`).
           고객에게 나가는 `quote_shares.payload`에는 **`stripInternal`을 통과한 것만**
           싣는다 — 그 경계가 이 시스템의 유일한 마진 방어선이다. */
      if (body.doc) {
        const doc = body.doc;
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
          return res.status(400).json({ error: 'invalid_doc' });
        }
        /* 조용히 잘라내지 않는다 — 이유를 돌려준다. 잘라내면 작성자는 저장됐다고 믿고
           고객에게는 반쪽 견적서가 나간다(itinerary 분기와 같은 원칙). */
        const size = JSON.stringify(doc).length;
        if (size > 400000) {
          return res.status(413).json({ error: 'doc_too_large', message: '견적서 문서가 너무 큽니다 (' + size + '바이트). 일정·상세 내용을 줄여 주세요.' });
        }
        const hit = await sql`select payload from quotes where id = ${id}`;
        if (!hit.length) return res.status(404).json({ error: 'quote_not_found' });

        /* ═══ 🔴 금액까지 함께 갱신한다 (2026-09-23 대표 지시 2-4) ═══════════════
           담당자가 세부견적 표에서 금액을 고치면 **문서만 바뀌고 목록·수익 요약은 옛
           금액**으로 남는다. 그 어긋남이 정확히 2026-09-17에 겪은 「대장이 고객이 못 본
           금액을 적고 있었다」이다.
         🔴 **여기서 다시 계산하지 않는다** — 화면이 보낸 값을 그대로 옮긴다. 서버가
           재계산하면 화면이 보여 준 금액과 저장된 금액이 갈릴 수 있다.
         ⚠ 숫자가 아니면 **건드리지 않는다**(지우지 않는다). 빈 값으로 덮으면 목록의
           금액 열이 통째로 비고, 그건 조용한 손실이다. */
        const t = body.totals && typeof body.totals === 'object' ? body.totals : null;
        const numOr = (v, cur) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : cur);
        const prev = hit[0].payload || {};
        const nextTotal = t ? numOr(t.total, prev.total) : prev.total;
        const nextPax = t ? numOr(t.participants, prev.participants) : prev.participants;
        const nextPer = t ? numOr(t.perPerson, prev.perPerson) : prev.perPerson;
        const nextVis = t ? numOr(t.visibleTotal, prev.visibleTotal) : prev.visibleTotal;

        /* ── 수정 이력 — **고치기 전에** 남긴다 (대표 지시 2-4) ────────────────
           🔴 이미 발급된 건인지 함께 적는다. 발급 뒤 수정은 **다음 발급이 차수(R1)를
             받는다**는 뜻이라, 나중에 「왜 R1이 생겼나」의 답이 이 줄이다. */
        let issuedBefore = false;
        try {
          const sh = await sql`select 1 from quote_shares where quote_id = ${id} limit 1`;
          issuedBefore = sh.length > 0;
        } catch (err) { console.error('[quotes/:id] 발급 이력 조회 실패:', err && err.message); }
        const changed = [];
        if (prev.doc && JSON.stringify(prev.doc) !== JSON.stringify(doc)) changed.push('견적서 문서');
        if (t && Number(nextTotal) !== Number(prev.total)) {
          changed.push('총액 ' + Math.round(Number(prev.total) || 0).toLocaleString('ko-KR')
            + ' → ' + Math.round(Number(nextTotal) || 0).toLocaleString('ko-KR'));
        }
        try {
          await sql`
            insert into quote_edit_log (quote_id, by_user, changed, issued_before, prev_doc)
            values (${id}, ${(req.user && (req.user.displayName || req.user.username)) || 'staff'},
                    ${changed.join(' · ') || '변경 없음'}, ${issuedBefore},
                    ${prev.doc ? JSON.stringify(prev.doc) : null}::jsonb)`;
        } catch (err) {
          /* 🔴 이력을 못 남겼다고 저장을 막지 않는다 — 담당자가 고친 내용을 잃는 편이 더 나쁘다.
             대신 조용히 넘어가지 않고 기록한다. */
          console.error('[quotes/:id] 수정 이력을 남기지 못했다:', err && err.message);
        }

        await sql`
          update quotes
             set payload = payload || ${JSON.stringify({
               doc, docAt: new Date().toISOString(),
               ...(t ? { total: nextTotal, participants: nextPax, perPerson: nextPer,
                 ...(nextVis !== undefined ? { visibleTotal: nextVis } : {}) } : {}),
             })}::jsonb
           where id = ${id}
        `;
        /* ⚠ 컬럼(total·participants)은 목록 정렬·통계가 읽는다 — payload만 고치면
           목록의 금액이 안 따라온다. 값이 있을 때만 따로 갱신한다. */
        if (t) {
          await sql`update quotes set total = ${nextTotal}, participants = ${nextPax} where id = ${id}`;
        }
        return res.status(200).json({ ok: true, bytes: size, issuedBefore, changed: changed.join(' · ') });
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
      /* ✅ 위 주석의 「되돌릴 방법도, 누가 지웠는지 남는 기록도 없다」가 여기서 풀린다 (YP).
         지우기 전에 행 전체를 `deletion_log`에 남긴다 — 기록이 실패하면 삭제도 안 간다.
         🔴 실제로 2026-08-24에 이 표의 13행이 통째로 사라졌고, 백업을 뒤져서야 알았다. */
      const { deleted } = await deleteAndLog(sql, 'quotes', { column: 'id', value: id },
        { req, reason: '견적 상세 화면에서 삭제' });
      res.status(200).json({ ok: true, removed: deleted > 0 });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'delete_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

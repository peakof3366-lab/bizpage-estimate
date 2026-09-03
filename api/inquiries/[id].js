const { sql } = require('../_lib/db');
const { requireAdmin, requireRole } = require('../_lib/auth');
const { deleteAndLog } = require('../_lib/deletion_log');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = req.body || {};
    try {
      /* 진행 기록 추가 전용 — 담당자 중 누가 어떤 업데이트를 남겼는지 이력으로 누적 */
      if (body.addLog) {
        const entry = {
          ts: new Date().toISOString(),
          author: String(body.addLog.author || '').slice(0, 40),
          text: String(body.addLog.text || '').slice(0, 500),
        };
        await sql`
          update inquiries set activity_log = activity_log || ${JSON.stringify([entry])}::jsonb
          where id = ${id}
        `;
        return res.status(200).json({ ok: true, entry });
      }

      /* 고객 문의에 대한 공식 답변 확정 (신규) — 진행 기록과 달리 최신 답변 하나만 유지 */
      if (body.setReply) {
        const repliedAt = new Date().toISOString();
        const replyText = String(body.setReply.text || '').slice(0, 4000);
        const repliedBy = String(body.setReply.author || '').slice(0, 40);
        await sql`
          update inquiries
          set reply = ${replyText}, replied_at = ${repliedAt}, replied_by = ${repliedBy}
          where id = ${id}
        `;
        return res.status(200).json({ ok: true, repliedAt, repliedBy });
      }

      /* 부분 수정 (PU) — 예전에는 네 필드를 한꺼번에 덮어쓰고, 클라이언트가 빠뜨린
         필드를 기본값('unread'·''·false·'')으로 **초기화**했다. 그런데 화면은 나머지
         값을 서버가 아니라 **자기 브라우저 localStorage 사본**에서 읽어 함께 보낸다
         (updateAssignee 등). 그래서 담당자만 바꿔도 그 브라우저가 마지막으로 본
         상태·메모가 서버 값을 덮었다 — 5명이 같은 리드를 만지면 남의 상태 변경과
         메모가 조용히 사라진다. 요율에서 고친 동시 편집 유실과 같은 유형인데, 당시
         점검이 콘텐츠 upsert와 activity_log만 보고 이 경로를 놓쳤다.

         coalesce로 "보낸 것만" 바꾼다. 빈 문자열은 유효한 값이라 그대로 반영하고
         (메모 지우기가 되어야 한다), **아예 안 보낸 필드만** 유지한다 —
         그래서 `?? null`이 아니라 undefined만 null로 바꾼다.
         타입 캐스팅을 명시하는 이유: coalesce(NULL, col)에서 파라미터 타입을 추론하지
         못하면 boolean 칼럼(read)에서 실패한다. */
      const keep = (v) => (v === undefined ? null : v);
      await sql`
        update inquiries set
          status   = coalesce(${keep(body.status)}::text,    status),
          note     = coalesce(${keep(body.note)}::text,      note),
          read     = coalesce(${keep(body.read)}::boolean,   read),
          assignee = coalesce(${keep(body.assignee)}::text,  assignee)
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
    /* 삭제는 매니저 이상 (신규) — 예전엔 로그인만 하면 누구나 문의 레코드를
       영구 삭제할 수 있었다. 되돌릴 방법도, 누가 지웠는지 남는 기록도 없다.
       고객 리드는 매출로 직결되는 데이터이고 팀원이 여러 명이 되면 실수 한 번의
       대가가 크다. 관리자 화면 권한 매트릭스(데이터 삭제는 상위 권한)와도 어긋나
       있었다 — 목적지 삭제·계수 저장은 이미 매니저 이상으로 잠겨 있다. */
    if (!(await requireRole(req, res, ['owner', 'manager']))) return;
    try {
      /* ✅ 위 주석의 「되돌릴 방법도, 누가 지웠는지 남는 기록도 없다」가 여기서 풀린다 (YP).
         고객 리드라 특히 중요하다 — 스냅샷에 연락처가 들어가므로 `deletion_log`는
         관리자 인증 뒤에서만 읽는다. */
      const { deleted } = await deleteAndLog(sql, 'inquiries', { column: 'id', value: id },
        { req, reason: '문의 상세 화면에서 삭제' });
      res.status(200).json({ ok: true, removed: deleted > 0 });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'delete_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

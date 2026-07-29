const { sql } = require('../_lib/db');
const { requireAdmin, requireRole } = require('../_lib/auth');

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

      await sql`
        update inquiries
        set status = ${body.status ?? 'unread'}, note = ${body.note ?? ''}, read = ${body.read ?? false},
            assignee = ${body.assignee ?? ''}
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
      await sql`delete from inquiries where id = ${id}`;
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'delete_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

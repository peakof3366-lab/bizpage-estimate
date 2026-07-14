/* 관리자 전용 방문/이벤트 집계 조회 (신규).
   admin.html의 loadRemoteData()가 이 응답을 기존 localStorage 키(linkedt_visits/
   linkedt_events/linkedt_dest_stats)와 동일한 모양으로 채워 넣으므로, 기존 렌더링
   코드(renderStats/renderEvents 등)는 전혀 수정하지 않고 실제 서버 데이터로 전환된다. */
const { sql } = require('../_lib/db');
const { requireAdmin } = require('../_lib/auth');

const CLICK_EVENT_NAMES = ['header_cta', 'estimate_step2', 'estimate_complete', 'kakao'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!(await requireAdmin(req, res))) return;

  try {
    const [visitRows, eventRows, destRows] = await Promise.all([
      sql`select created_at as ts from site_events where name = 'pageview' order by created_at desc limit 3000`,
      sql`select name, count(*)::int as c from site_events where name = any(${CLICK_EVENT_NAMES}) group by name`,
      sql`select meta->>'dest' as dest, count(*)::int as c from site_events
          where name = 'dest_select' and meta ? 'dest' group by dest`,
    ]);

    const events = {};
    for (const row of eventRows) events[row.name] = row.c;

    const dest = {};
    for (const row of destRows) if (row.dest) dest[row.dest] = row.c;

    res.status(200).json({
      visits: visitRows.map((r) => ({ ts: r.ts })),
      events,
      dest,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'query_failed' });
  }
};

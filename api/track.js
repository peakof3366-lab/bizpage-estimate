/* 공개 방문/이벤트 수집 엔드포인트 (신규).
   기존엔 script.js가 localStorage에만 기록해 관리자 페이지 통계가 실제 방문자
   데이터를 반영하지 못했음 — 이 엔드포인트가 site_events 테이블에 실제로 쌓는다.
   되돌리기: 이 파일과 script.js의 관련 fetch 호출만 지우면 원상복귀(로컬 추적은
   그대로 유지되므로 admin.html 표시 기능 자체는 영향 없음). */
const { sql } = require('./_lib/db');

const ALLOWED_NAMES = new Set([
  'pageview', 'header_cta', 'estimate_step2', 'estimate_complete', 'kakao', 'dest_select', 'consult_request',
]);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { name, meta } = req.body || {};
  if (typeof name !== 'string' || !ALLOWED_NAMES.has(name)) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  const safeMeta = meta && typeof meta === 'object' ? meta : {};

  try {
    await sql`insert into site_events (name, meta) values (${name}, ${JSON.stringify(safeMeta)}::jsonb)`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'insert_failed' });
  }
};

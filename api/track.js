/* 공개 방문/이벤트 수집 엔드포인트.
   기존엔 script.js가 localStorage에만 기록해 관리자 페이지 통계가 실제 방문자
   데이터를 반영하지 못했음 — 이 엔드포인트가 site_events 테이블에 실제로 쌓는다.
   되돌리기: 이 파일과 script.js의 관련 fetch 호출만 지우면 원상복귀(로컬 추적은
   그대로 유지되므로 admin.html 표시 기능 자체는 영향 없음).

   ⚠ 이 엔드포인트는 **인증이 없다.** 누구든 임의 본문으로 호출할 수 있는 공개 POST
   넷 중 하나인데(나머지 셋은 quotes·inquiries·quote-shares), 예전엔 `name`만
   화이트리스트로 걸러지고 `meta`는 **아무 검증 없이 통째로 저장**됐다.
   실제 결과: 프로덕션 dest_select 3건의 목적지가 전부 `QA스모크553816` 같은
   값이었고, 그게 관리자 대시보드 "연수지 선택 TOP 5"에 그대로 올라가 있었다.
   → meta는 이제 화이트리스트로 재구성하고 크기 상한을 건다(PZ). */
const { sql } = require('./_lib/db');
const {
  ALLOWED_NAMES,
  BUILTIN_DEST_KEYS,
  metaTooLarge,
  normalizeMeta,
} = require('./_lib/site_events');

/* 목적지 화이트리스트 = 내장(data.js) + 커스텀(DB). 커스텀을 빼면 매니저가 추가한
   목적지의 선택 통계가 조용히 사라진다(PP·PQ에서 반복해 나온 유형).
   조회는 dest_select에서만 한다 — pageview는 방문마다 호출되는 경로라 건드리지 않는다. */
async function loadDestKeys() {
  try {
    const rows = await sql`select destination_key from custom_destinations`;
    const keys = new Set(BUILTIN_DEST_KEYS);
    for (const r of rows) keys.add(r.destination_key);
    return keys;
  } catch (err) {
    console.warn('[track] 커스텀 목적지 조회 실패 — 목적지를 확인하지 못한 채 기록한다:', err.message);
    return null; // normalizeMeta가 destUnverified 흔적을 남긴다
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { name, meta } = req.body || {};
  if (typeof name !== 'string' || !ALLOWED_NAMES.has(name)) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (metaTooLarge(meta)) return res.status(413).json({ error: 'meta_too_large' });

  /* dest_select가 아니면 normalizeMeta가 meta를 보지 않고 {}를 돌려주므로 조회하지 않는다. */
  const destKeys = name === 'dest_select' ? await loadDestKeys() : null;
  const norm = normalizeMeta(name, meta, destKeys);
  if (!norm.ok) return res.status(400).json({ error: norm.error });

  try {
    await sql`insert into site_events (name, meta) values (${name}, ${JSON.stringify(norm.meta)}::jsonb)`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'insert_failed' });
  }
};

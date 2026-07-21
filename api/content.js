/* 정적 페이지(index.html) 콘텐츠 오버라이드 (신규).
   index.html의 히어로/갤러리/포트폴리오/회사소개/후기/FAQ 문구·이미지는 원래 하드코딩된
   기본값을 그대로 두고, 관리자가 admin.html "콘텐츠 관리" 탭에서 수정한 항목만 이 테이블에
   저장한다. script.js는 페이지 로드 시 이 GET을 호출해 [data-cms-key] 요소 위에 값을
   덮어쓸 뿐이므로, 이 API가 느리거나 실패해도 정적 기본값으로 항상 정상 렌더링된다.

   GET (공개, 인증 불필요 — index.html 로드마다 호출) → { key: value } 플랫 맵
   PATCH (관리자 전용) → body { key, value } 단일 항목 upsert

   content.js/content/[key].js 2개로 나누지 않고 한 파일에서 method 분기하는 이유는
   Vercel Hobby 플랜의 배포당 서버리스 함수 12개 제한 때문(api/admin/insights.js,
   api/admin/account.js와 동일한 이유로 통합). */
const { sql } = require('./_lib/db');
const { requireRole } = require('./_lib/auth');

const KEY_PATTERN = /^[a-z]+\.([0-9]+\.)?[a-z]+$/;
const MAX_VALUE_LENGTH = 3000;

module.exports = async (req, res) => {
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

/* 1회성 스키마 마이그레이션. `node ai-loop/db_migrate.js`로 직접 실행 (앱 엔드포인트 아님). */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    create table if not exists quotes (
      id text primary key,
      created_at timestamptz not null default now(),
      status text not null default 'new',
      note text not null default '',
      dest_label text,
      org_name text,
      participants int,
      total bigint,
      payload jsonb not null
    )
  `;

  await sql`
    create table if not exists inquiries (
      id text primary key,
      created_at timestamptz not null default now(),
      read boolean not null default false,
      status text not null default 'unread',
      note text not null default '',
      name text,
      org text,
      tel text,
      message text,
      type text not null default 'contact',
      payload jsonb not null
    )
  `;

  await sql`
    create table if not exists quote_shares (
      id text primary key,
      created_at timestamptz not null default now(),
      payload jsonb not null
    )
  `;

  await sql`
    create table if not exists admin_auth (
      id int primary key default 1,
      username text not null default 'admin',
      password_hash text not null,
      updated_at timestamptz not null default now(),
      constraint admin_auth_singleton check (id = 1)
    )
  `;
  /* 기존에 이미 생성된 테이블에는 username 컬럼이 없을 수 있으므로 추가 보강 */
  await sql`alter table admin_auth add column if not exists username text not null default 'admin'`;

  /* 방문/이벤트 실서버 수집 (기존엔 브라우저 localStorage에만 쌓여 관리자 페이지 통계가
     실제 방문자 데이터를 반영하지 못했음 — /api/track이 이 테이블에 기록) */
  await sql`
    create table if not exists site_events (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      name text not null,
      meta jsonb not null default '{}'::jsonb
    )
  `;
  await sql`create index if not exists site_events_name_idx on site_events (name)`;
  await sql`create index if not exists site_events_created_at_idx on site_events (created_at)`;

  /* 문의/견적요청 자유서술 텍스트에서 GPT로 뽑아낸 마케팅 키워드/인사이트 스냅샷.
     관리자가 "다시 분석하기"를 누를 때마다 한 행씩 추가(이력 조회 가능) */
  await sql`
    create table if not exists marketing_insights (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      source_count int not null default 0,
      result jsonb not null
    )
  `;

  /* 문의/견적 담당자 배정 + 진행 기록 이력 (신규) — 여러 직원이 같은 리드를 보고
     누가 확인했고 어떻게 진행 중인지 공유할 수 있도록 함 */
  await sql`alter table inquiries add column if not exists assignee text not null default ''`;
  await sql`alter table inquiries add column if not exists activity_log jsonb not null default '[]'::jsonb`;
  await sql`alter table quotes add column if not exists assignee text not null default ''`;
  await sql`alter table quotes add column if not exists activity_log jsonb not null default '[]'::jsonb`;

  /* 문의에 대한 공식 답변 (신규) — 진행 기록(내부 이력)과 별개로, 고객에게
     실제로 전달한 확정 답변 텍스트를 관리자 내부에서 확인할 수 있게 함 */
  await sql`alter table inquiries add column if not exists reply text not null default ''`;
  await sql`alter table inquiries add column if not exists replied_at timestamptz`;
  await sql`alter table inquiries add column if not exists replied_by text not null default ''`;

  /* 요율(가격) 실시간 오버라이드 (신규) — data.js의 55개 목적지 단가는 정적 파일로
     "항상 안전한 기본값"으로 유지하고, 관리자가 수정한 항목만 이 테이블에 저장.
     script.js가 페이지 로드 시 비동기로 이 값을 받아와 정적값 위에 얕은 병합함
     (fetch 실패/지연 시에도 정적 기본값으로 항상 정상 동작 — 계산 엔진 자체는
     건드리지 않는 안전한 구조). */
  await sql`
    create table if not exists rate_overrides (
      destination_key text primary key,
      overrides jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      updated_by text not null default ''
    )
  `;
  await sql`
    create table if not exists rate_change_log (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      destination_key text not null,
      field text not null,
      old_value jsonb,
      new_value jsonb,
      author text not null default ''
    )
  `;
  await sql`create index if not exists rate_change_log_created_at_idx on rate_change_log (created_at)`;

  /* 정적 페이지(index.html) 콘텐츠 오버라이드 (신규) — 히어로/갤러리/포트폴리오/
     회사소개/후기/FAQ의 문구·이미지 URL을 관리자 페이지에서 직접 수정할 수 있게 함.
     행이 없는 key는 index.html에 하드코딩된 기본값을 그대로 사용. */
  await sql`
    create table if not exists content_overrides (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `;

  console.log('Migration complete: quotes, inquiries, quote_shares, admin_auth, site_events, marketing_insights, rate_overrides, rate_change_log, content_overrides tables ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

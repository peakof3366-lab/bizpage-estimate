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

  console.log('Migration complete: quotes, inquiries, quote_shares, admin_auth, site_events, marketing_insights tables ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

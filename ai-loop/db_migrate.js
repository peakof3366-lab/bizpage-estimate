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
    create table if not exists admin_auth (
      id int primary key default 1,
      password_hash text not null,
      updated_at timestamptz not null default now(),
      constraint admin_auth_singleton check (id = 1)
    )
  `;

  console.log('Migration complete: quotes, inquiries, admin_auth tables ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

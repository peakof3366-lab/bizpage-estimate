/* 1회성 관리자 비밀번호 시드. 비밀번호는 파일에 쓰지 않고 환경변수(ADMIN_BOOTSTRAP_PW)로만 전달.
   실행: ADMIN_BOOTSTRAP_PW='...' node ai-loop/db_seed_admin.js */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

async function main() {
  const pw = process.env.ADMIN_BOOTSTRAP_PW;
  if (!pw) throw new Error('ADMIN_BOOTSTRAP_PW env var required');

  const hash = await bcrypt.hash(pw, 12);
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    insert into admin_auth (id, password_hash, updated_at)
    values (1, ${hash}, now())
    on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now()
  `;

  console.log('Admin password seeded/updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

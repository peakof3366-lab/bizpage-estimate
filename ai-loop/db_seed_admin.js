/* 1회성 관리자 아이디/비밀번호 시드. 비밀번호는 파일에 쓰지 않고 환경변수(ADMIN_BOOTSTRAP_PW)로만 전달.
   아이디는 ADMIN_BOOTSTRAP_ID로 지정(생략 시 'admin').
   실행: ADMIN_BOOTSTRAP_ID='admin' ADMIN_BOOTSTRAP_PW='...' node ai-loop/db_seed_admin.js */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

async function main() {
  const pw = process.env.ADMIN_BOOTSTRAP_PW;
  if (!pw) throw new Error('ADMIN_BOOTSTRAP_PW env var required');
  const username = process.env.ADMIN_BOOTSTRAP_ID || 'admin';

  const hash = await bcrypt.hash(pw, 12);
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    insert into admin_auth (id, username, password_hash, updated_at)
    values (1, ${username}, ${hash}, now())
    on conflict (id) do update set username = excluded.username, password_hash = excluded.password_hash, updated_at = now()
  `;

  console.log('Admin username/password seeded/updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signSession, setSessionCookie } = require('../_lib/auth');

/* 브루트포스 방지 락아웃 (신규) — 예전엔 비밀번호를 몇 번이든 무제한으로 시도할
   수 있었음. 계정별로 실패 횟수를 세다가 임계치에 도달하면 일정 시간 잠근다.
   값은 limits.js가 안다 — 로그인 화면 안내와 매뉴얼이 같은 값을 읽어야 한다(QO). */
const { LOGIN_MAX_ATTEMPTS: MAX_FAILED_ATTEMPTS, LOGIN_LOCKOUT_MINUTES: LOCKOUT_MINUTES } = require('../../limits');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { username, password } = req.body || {};
  const uname = (username || '').trim();
  if (!uname || !password) return res.status(400).json({ error: 'invalid_credentials' });

  try {
    /* 멀티유저 계정 도입 (신규) — 예전엔 admin_auth 싱글톤(id=1) 한 행만 조회해
       전 직원이 같은 자격증명을 공유했음. 이제 username으로 실제 개인 계정을 찾는다. */
    const rows = await sql`
      select id, username, display_name, password_hash, role, active, self_signup,
             failed_attempts, locked_until
      from staff_accounts where username = ${uname}
    `;
    if (!rows.length) return res.status(401).json({ error: 'invalid_credentials' });
    const acct = rows[0];

    if (acct.locked_until && new Date(acct.locked_until) > new Date()) {
      return res.status(423).json({ error: 'locked', lockedUntil: acct.locked_until });
    }

    /* ⚠ **비밀번호 검증이 계정 상태 판정보다 먼저다.** 예전엔 `!rows.length || !active`를
       한 줄로 묶어 401 invalid_credentials로 돌려줬는데, 그러면 두 가지가 망가진다.
       ① 승인 대기 중인 직원이 맞는 비밀번호를 넣어도 "아이디 또는 비밀번호가 올바르지
          않습니다"를 본다 — 팀원 5명이 가입 신청 직후 전부 지나는 칸이다. 신청자는 자기
          아이디를 의심하며 다시 치고, 사장님 화면에는 그 사람이 ⏳ 승인 대기로 멀쩡히
          보인다. 둘 다 사실이 아닌 안내를 근거로 엉뚱한 곳을 고치게 된다(결함 생성기 ②).
       ② 비활성 계정에는 **락아웃이 아예 걸리지 않았다.** 위에서 먼저 return하니
          failed_attempts가 오르지 않아, 대기·정지 계정은 무제한으로 비밀번호를 시도할 수
          있었다. 브루트포스 방어가 정작 승인 전 계정에만 비어 있던 셈이다.
       순서를 바꾼 지금은 상태를 **비밀번호를 맞춘 사람에게만** 알려주므로 계정 존재
       여부가 새어나가지 않는다(틀리면 예전 그대로 invalid_credentials). */
    const ok = await bcrypt.compare(password, acct.password_hash);
    if (!ok) {
      const attempts = (acct.failed_attempts || 0) + 1;
      const willLock = attempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = willLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null;
      await sql`
        update staff_accounts set failed_attempts = ${attempts}, locked_until = ${lockedUntil}
        where id = ${acct.id}
      `;
      /* 잠긴 순간에도 lockedUntil을 준다 — 안 주면 화면이 "15분"이라고 고정 문구로
         말할 수밖에 없고, 12분 지나 다시 눌러도 또 15분을 기다리라고 안내하게 된다. */
      return willLock
        ? res.status(423).json({ error: 'locked', lockedUntil })
        : res.status(401).json({ error: 'invalid_credentials' });
    }

    await sql`update staff_accounts set failed_attempts = 0, locked_until = null where id = ${acct.id}`;

    /* 비밀번호가 맞았다 — 여기서부터는 계정 상태를 사실대로 말한다.
       '승인 대기'와 '사용 중지'를 구분하는 이유: 앞은 기다리면 되는 일이고 뒤는 사장님께
       연락해야 하는 일이라 신청자가 할 행동이 다르다. 세션은 발급하지 않는다. */
    if (!acct.active) {
      return res.status(403).json({
        error: acct.self_signup ? 'pending_approval' : 'account_disabled',
      });
    }

    const token = await signSession({ id: acct.id, username: acct.username, displayName: acct.display_name, role: acct.role });
    setSessionCookie(res, token);
    res.status(200).json({ ok: true, displayName: acct.display_name, role: acct.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login_failed' });
  }
};

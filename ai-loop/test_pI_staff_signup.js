/* PI 검증: 직원 자가 가입(가입코드 + 승인) 안전 성질.

   이 기능은 /admin.html이 로그인 없이 열리는 주소라는 전제 위에 있다. 가입 경로가
   조금이라도 새면 외부인이 관리자 계정을 만들 수 있으므로, 아래 성질들을 원문
   대조로 고정한다. 핸들러는 DB가 있어야 실행되므로 소스 자체를 검사한다
   (test_pF/test_pG가 쓰는 방식과 동일).

   ① 가입으로는 role/active를 올릴 수 없다 — 항상 staff + 비활성
   ② 승인 전에는 로그인이 막힌다 (login.js가 !active 거부)
   ③ 가입코드가 없으면 기능 자체가 꺼진다 (기본 꺼짐)
   ④ 관리자 전용 액션은 owner로 잠겨 있다
   ⑤ 거절이 '활성화 후 비활성화'로 우회 구현되지 않는다 (그 사이 로그인이 열림)
   실행: node ai-loop/test_pI_staff_signup.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const accountSrc = read(path.join('api', 'admin', 'account.js'));
const loginSrc = read(path.join('api', 'admin', 'login.js'));
const adminSrc = read('admin.html');
const migrateSrc = read(path.join('ai-loop', 'db_migrate.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* account.js에서 한 액션 블록만 잘라낸다 — 다른 액션의 코드가 섞이면
   "owner 검사가 있다" 같은 단언이 엉뚱한 블록을 보고 통과한다. */
function actionBlock(name) {
  const start = accountSrc.indexOf(`if (action === '${name}')`);
  if (start < 0) return null;
  const rest = accountSrc.slice(start + 10);
  const next = rest.search(/\n  if \(action === '/);
  return next < 0 ? rest : rest.slice(0, next);
}

console.log('[0] 액션이 모두 존재하는가');
for (const a of ['signup', 'rejectSignup', 'signupSettings', 'setSignupCode']) {
  ok(`${a} 액션 존재`, actionBlock(a) !== null);
}

console.log('\n[1] 가입으로 권한을 올릴 수 없다 — 가장 중요한 성질');
const signup = actionBlock('signup') || '';
ok('insert가 role을 staff 리터럴로 고정', /values\s*\([^)]*'staff'\s*,\s*false\s*,\s*true\s*\)/.test(signup.replace(/\s+/g, ' ')),
  '리터럴 staff/false/true 패턴 없음');
ok('요청 본문에서 role을 읽지 않는다', !/\brole\b/.test(signup.split('insert into')[0].replace(/'staff'/g, '')),
  'signup 블록에서 role 참조 발견');
ok('요청 본문에서 active를 읽지 않는다', !/req\.body[^;]*active|\bactive\b\s*[,}]\s*=\s*req\.body/.test(signup));
ok('구조분해가 username/displayName/password/code 4개로 한정',
  /const \{ username, displayName, password, code \} = req\.body/.test(signup));

console.log('\n[2] 가입코드가 없으면 기능이 꺼진다 (기본 꺼짐)');
ok('코드 미설정 시 403 signup_disabled', /if \(!configured\) return res\.status\(403\)\.json\(\{ error: 'signup_disabled' \}\)/.test(signup));
ok('코드 확인이 계정 생성보다 먼저', signup.indexOf('invalid_signup_code') < signup.indexOf('insert into'),
  '코드 검사가 insert 뒤에 있음');
ok('코드 비교에 timingSafeEqual 사용', /function safeEqual/.test(accountSrc) && /timingSafeEqual/.test(accountSrc));
ok('getSignupCode가 빈 문자열을 미설정으로 취급', /code && String\(code\)\.length \? String\(code\) : null/.test(accountSrc));

console.log('\n[3] 승인 전에는 로그인이 막힌다');
/* ⚠ 예전엔 `if (!rows.length || !rows[0].active) return 401` 한 줄을 원문으로 대조했다.
   그 형태는 QF에서 바뀌었다 — 승인 대기 계정이 맞는 비밀번호를 넣어도 "비밀번호가
   틀렸다"고 말했고, 비활성 계정에는 락아웃이 아예 안 걸렸기 때문이다. 지금은
   비밀번호를 검증한 **뒤** 상태를 보고 403으로 막는다. 막힌다는 사실 자체는 그대로라
   여기서도 확인하되, 실제 동작은 test_qF_login_states.js가 핸들러를 호출해 본다. */
ok('login.js가 비활성 계정에 세션을 주지 않는다', /if \(!acct\.active\) \{[\s\S]{0,200}res\.status\(403\)/.test(loginSrc));
ok('상태 판정이 비밀번호 검증보다 뒤에 온다',
  loginSrc.indexOf('bcrypt.compare') < loginSrc.indexOf('if (!acct.active)'),
  '상태 판정이 앞서면 대기 계정에 락아웃이 안 걸린다');
ok('가입 응답이 pending을 알린다', /pending: true/.test(signup));

console.log('\n[4] 관리자 전용 액션이 owner로 잠겨 있다');
for (const a of ['rejectSignup', 'signupSettings', 'setSignupCode', 'createStaff', 'updateStaff', 'resetStaffPassword']) {
  const b = actionBlock(a) || '';
  ok(`${a} — owner 전용`, /requireRole\(req, res, \['owner'\]\)/.test(b));
}
ok('signup만 인증 없이 열려 있다', !/requireAdmin|requireRole/.test(signup));

console.log('\n[5] 거절이 로그인을 잠깐도 열지 않는다');
const reject = actionBlock('rejectSignup') || '';
ok('active=false와 self_signup=false를 한 번에', /set active = false, self_signup = false/.test(reject));
ok('승인 대기 건에만 적용(where self_signup = true)', /where id = \$\{id\} and self_signup = true/.test(reject));
ok('본인 계정은 거절 불가', /cannot_modify_self/.test(reject));
ok('화면이 rejectSignup 전용 액션을 호출', adminSrc.includes("action=rejectSignup"));
ok('화면이 활성화→비활성화 우회를 쓰지 않는다',
  !/rejectStaff[\s\S]{0,700}active: true/.test(adminSrc), 'rejectStaff 안에서 active:true 발견');

console.log('\n[6] 승인하면 대기 목록에서 빠진다');
const update = actionBlock('updateStaff') || '';
ok('활성화 시 self_signup을 내린다', /const approved = next\.active \? false : existing\[0\]\.self_signup/.test(update));
ok('update문이 self_signup을 함께 쓴다', /self_signup = \$\{approved\}/.test(update));

console.log('\n[7] 대기열 상한 — 코드가 새어도 DB가 채워지지 않는다');
ok('MAX_PENDING 상수 존재', /const MAX_PENDING = \d+/.test(accountSrc));
ok('대기 수를 self_signup 기준으로 센다', /where self_signup = true/.test(signup));
ok('상한 도달 시 429', /too_many_pending/.test(signup));

console.log('\n[8] 스키마·화면 연결');
ok('db_migrate에 self_signup 컬럼 추가', /alter table staff_accounts add column if not exists self_signup boolean not null default false/.test(migrateSrc));
ok('staffList가 self_signup을 반환', /select id, username, display_name, role, active, self_signup/.test(accountSrc));
ok('staffList가 대기자를 위로 정렬', /order by self_signup desc, created_at/.test(accountSrc));
ok('로그인 화면에 가입 폼', /id="signupForm"/.test(adminSrc));
ok('가입 폼에 가입코드 칸', /id="signupCode"/.test(adminSrc));
ok('목록에 승인 버튼', /approveStaff\(/.test(adminSrc));
ok('목록에 거절 버튼', /rejectStaff\(/.test(adminSrc));
ok('승인 대기 배지', /승인 대기/.test(adminSrc));
ok('관리자 화면에 가입코드 패널', /id="signup-code-input"/.test(adminSrc));
ok('가입 실패 사유를 사람 말로', /const REASONS = \{[\s\S]*?signup_disabled:/.test(adminSrc));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

/* ═══════════════════════════════════════════════════════════════════════════
   WY — **「감춘 것은 막은 것이 아니다」를 세는 장치**

   이 저장소가 반복해서 배운 문장이다. 화면에서 버튼을 감춰도 id를 아는 사람은
   그대로 부른다(VS에서 실제로 그 경로를 막았다). 그런데 「어느 쓰기가 인증을
   요구하는가」를 **세는 것이 없었다** — `api/`에 분기가 늘수록 사람이 눈으로 셌다.

   ■ ⚠ 도구를 만들다 **늘 통과하는 검사**를 한 번 만들었다

   첫 판은 「함수 어딘가에 requireAdmin이 있으면 ✓」였다. 그런데 `module.exports`
   핸들러는 **공개 분기와 관리자 분기가 한 함수에 섞여 있다** — `inquiries`의
   공개 POST를 GET 쪽 인증만 보고 「막는다」로 셌다(결함 생성기 ③).
   → 섞인 핸들러는 **어느 분기가 공개인지 사람이 한 줄 적어야** 통과하게 고쳤다.

   ■ 이 검사가 지키는 것

     ① 지금 `api/`에 **모르는 공개 쓰기가 0건**이다
     ② 🔴 합성 입력으로 **정말 잡히는지** 본다 — 인증 없는 쓰기, 설명 없는 섞인 핸들러
     ③ 주석 안의 예시 SQL을 결함이라 부르지 않는다 (없는 결함 금지)
     ④ 공개 쓰기 목록이 **이유와 함께** 적혀 있다
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const A = require(path.join(__dirname, 'audit_api_auth.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 지금 저장소 상태 — 모르는 공개 쓰기가 없다');
{
  const r = A.auditSources(A.readApiSources());
  ok('① DB에 쓰는 함수를 찾았다 (10개 이상)', r.writeFns >= 10, r.writeFns + '개');
  ok('① 🔴 모르는 공개 쓰기 0건', r.findings.length === 0,
    JSON.stringify(r.findings.map((x) => x.f + '›' + x.name)));
  /* 공개 쓰기는 **이유가 적혀 있어야** 한다 — 이름만 적으면 다음 사람이 판단 못 한다 */
  const reasons = Object.values(A.PUBLIC_WRITES).concat(Object.values(A.MODULE_NOTES));
  ok('④ 목록의 모든 항목에 이유가 있다', reasons.every((v) => typeof v === 'string' && v.length > 8),
    JSON.stringify(reasons.filter((v) => !v || v.length <= 8)));
  ok('④ 섞인 핸들러 설명이 분기를 말한다',
    Object.values(A.MODULE_NOTES).every((v) => /공개/.test(v)), JSON.stringify(A.MODULE_NOTES));
}

console.log('\n[2] 🔴 합성 입력 — 망가뜨리면 실제로 잡는가');
{
  /* ㉠ 인증 없는 쓰기 함수 */
  const r1 = A.auditSources({
    'evil.js': 'async function handleEvil(req, res) {\n  await sql`insert into packages (id) values (1)`;\n}\n',
  });
  ok('② 인증 없는 쓰기를 잡는다', r1.findings.length === 1 && r1.findings[0].name === 'handleEvil',
    JSON.stringify(r1.findings));

  /* ㉡ 인증이 있으면 통과 */
  const r2 = A.auditSources({
    'good.js': 'async function handleGood(req, res) {\n  if (!(await requireAdmin(req, res))) return;\n  await sql`insert into packages (id) values (1)`;\n}\n',
  });
  ok('② 인증이 있으면 안 잡는다', r2.findings.length === 0, JSON.stringify(r2.findings));

  /* ㉢ 🔴 설명 없는 섞인 핸들러 — 첫 판이 놓쳤던 자리 */
  const r3 = A.auditSources({
    'newapi.js': 'module.exports = async (req, res) => {\n'
      + '  if (req.method === "GET") { if (!(await requireAdmin(req, res))) return; }\n'
      + '  await sql`insert into inquiries (id) values (1)`;\n};\n',
  });
  ok('② 🔴 설명 없는 섞인 핸들러를 잡는다',
    r3.findings.length === 1 && /섞인 핸들러/.test(r3.findings[0].why), JSON.stringify(r3.findings));

  /* ㉣ 주석 안의 예시 SQL은 결함이 아니다 */
  const r4 = A.auditSources({
    'doc.js': '/* 예시: await sql`insert into packages (id) values (1)` */\nfunction helper() { return 1; }\n',
  });
  ok('③ 주석 안의 SQL은 세지 않는다', r4.writeFns === 0 && r4.findings.length === 0,
    JSON.stringify(r4));

  /* ㉤ 쓰기가 없는 함수는 애초에 대상이 아니다 */
  const r5 = A.auditSources({
    'read.js': 'async function handleList(req, res) {\n  const rows = await sql`select * from packages`;\n}\n',
  });
  ok('③ 읽기만 하는 함수는 대상이 아니다', r5.writeFns === 0, JSON.stringify(r5.findings));
}

console.log('\n[3] 도구가 자기 한계를 숨기지 않는다');
{
  const src = require('fs').readFileSync(path.join(__dirname, 'audit_api_auth.js'), 'utf8');
  ok('⑤ 0건이 안전의 증명이 아니라고 적는다', /안전의 증명은 아닙니다/.test(src));
  ok('⑤ 권한의 종류는 사람이 본다고 적는다', /권한의 \*\*종류\*\*가 맞는지/.test(src));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — WY 서버가 막는가`);
process.exit(fail ? 1 : 0);

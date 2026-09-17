/* ══════════════════════════════════════════════════════════════════════════
   역할별 화면 검사기(`ai-loop/audit_roles.py`)의 **목록이 화면과 맞는가**

   ■ 왜 필요한가 (2026-09-17)
   화면은 역할로 여러 자리를 가른다(`applyRolePermissionsToUI`). 그런데 그때까지
   **직원(staff)으로 화면을 띄워 본 검사가 하나도 없었다** — 기존 검사는 전부
   로그인을 건너뛰어 `currentUser`가 없는 상태로 잰다. 운영 DB 실측으로
   켜져 있는 직원 계정이 0명이라, 코드가 전달되면 5명이 한꺼번에 처음 들어온다.
   → `audit_roles.py`를 만들어 owner·manager·staff 세 역할로 실제로 띄운다.

   🔴 **그 도구의 `GATED` 목록은 화면 코드의 사본이다**(결함 생성기 ①).
     화면이 새 자리를 가르기 시작하면 목록은 그대로라 **그 자리는 조용히 안 재진다.**
     도구는 여전히 초록이고 아무도 모른다. 그래서 여기서 둘을 대조한다.

   ⚠ 이 검사는 파일만 읽는다. 실제 렌더는 `audit_roles.py`가 브라우저로 잰다
     (파이썬 도구는 Playwright가 필요해 이 러너 대상이 아니다).
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const toolPath = path.join(ROOT, 'ai-loop', 'audit_roles.py');

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (why ? ' \u2014 ' + why : '')); }
};

console.log('\n[1] 도구가 있는가');
ok('audit_roles.py가 있다', fs.existsSync(toolPath),
   '직원이 보는 화면을 재는 자가 사라졌다');
const tool = fs.existsSync(toolPath) ? fs.readFileSync(toolPath, 'utf8') : '';

console.log('\n[2] 화면이 가르는 자리를 도구가 다 알고 있는가');
/* `applyRolePermissionsToUI` 안에서 `getElementById('...')`로 집는 id와
   문자열 배열로 도는 id를 전부 긁는다. */
const fnStart = admin.indexOf('function applyRolePermissionsToUI');
const fnEnd = admin.indexOf('\n  function renderStaffAdmin', fnStart);
ok('권한 함수를 찾았다', fnStart > 0 && fnEnd > fnStart,
   'applyRolePermissionsToUI가 사라졌거나 이름이 바뀌었다');
const body = fnStart > 0 ? admin.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000) : '';
const ids = new Set();
for (const m of body.matchAll(/getElementById\('([A-Za-z0-9_]+)'\)/g)) ids.add(m[1]);
for (const m of body.matchAll(/for \(const id of \[([^\]]+)\]/g)) {
  for (const s of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) ids.add(s[1]);
}
/* 권한과 무관하게 집는 것들은 뺀다 — 설명 자리이거나 갈래가 아니다. */
const NOT_GATES = new Set(['adhocGate']);
const gates = [...ids].filter((x) => !NOT_GATES.has(x));
ok('가르는 자리를 찾았다 (' + gates.length + '곳)', gates.length >= 8);
for (const id of gates) {
  ok('도구가 「' + id + '」을 안다', tool.includes('"' + id + '"'),
     'audit_roles.py의 GATED에 없다 — 그 자리는 조용히 안 재진다');
}

console.log('\n[3] 도구가 진짜 권한 코드를 돌리는가');
/* 🔴 처음엔 `window.currentUser = {...}`로 심었다. 그 변수는 IIFE 안의 `let`이라
     밖에서 넣어도 **안 닿는다** — 권한 함수가 `if (!currentUser) return;`에서
     그냥 빠져나갔고, 아무것도 안 바뀐 화면을 보고 **없는 결함 14건을 찾았다고
     할 뻔했다.** 진짜 경로(`loadCurrentUser()` + 가짜 `?action=me` 응답)를 돈다. */
ok('window.currentUser로 심지 않는다', !/window\.currentUser\s*=/.test(tool),
   '그 변수는 IIFE 안의 let이라 안 닿는다 — 권한 코드가 안 돈 화면을 재게 된다');
ok('진짜 로그인 경로를 부른다', /loadCurrentUser\(\)/.test(tool));
ok('역할을 ?action=me 응답으로 준다', /action=me/.test(tool));
/* 🔴 `file://`에서는 `fetch('/api/...')`를 가로챌 수 없다 — 이 저장소에서 세 번 겪었다. */
ok('제 서버를 띄워 http로 잰다', /http\.server|socketserver/.test(tool),
   'file://로는 가짜 로그인 응답이 안 먹어 조용히 실패한다');
/* 🔴 「감췄다」가 통과가 아니다 — 왜 없는지 말하는지까지 본다. */
ok('감췄을 때 말하는지도 본다', /EXPLAINERS/.test(tool),
   '버튼만 조용히 사라지면 직원은 고장으로 읽는다');
ok('운영 DB에 안 쓴다고 적혀 있다', /운영 DB에 아무것도 안 쓴다/.test(tool));

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

/* ═══════════════════════════════════════════════════════════════════════════
   서버가 실제로 막는가 (WY) — **읽기 전용 감사**. `node ai-loop/audit_api_auth.js`

   ■ 왜 필요한가

   이 저장소가 반복해서 배운 문장이 있다: **「감춘 것은 막은 것이 아니다.」**
   화면에서 버튼을 감춰도 id를 아는 사람은 그대로 부른다(VS에서 실제로 그 경로를
   막았다). 그런데 「어느 엔드포인트가 인증을 요구하는가」를 **세는 것이 없었다** —
   `api/`에 분기가 늘어날수록 사람이 눈으로 세야 했다.

   이 감사는 **DB에 쓰는 함수**를 전부 찾아, 그 함수(또는 그 함수를 부르는 자리)가
   인증을 확인하는지 본다. 확인하지 않는 것은 **공개 쓰기**이고, 공개 쓰기는
   의도된 것만 있어야 한다.

   ■ 두 가지로 나눠 본다

   ① **한 가지 일만 하는 함수**(`handleX`) — 함수 안에 인증이 있으면 막힌 것이다.
      없으면 `PUBLIC_WRITES`에 **왜 공개인지**가 적혀 있어야 통과한다.
   ② 🔴 **`module.exports` 핸들러** — 공개 분기와 관리자 분기가 **한 함수에 섞여 있다.**
      「함수 어딘가에 requireAdmin이 있다」로 ✓를 주면 **늘 통과하는 검사**가 된다.
      실제로 이 도구의 첫 판이 그랬다 — `inquiries`의 **공개 POST**를 GET 쪽 인증만
      보고 「막는다」로 셌다(결함 생성기 ③). 그래서 섞인 핸들러는 **어느 분기가
      공개이고 어느 분기가 막히는지 사람이 한 줄 적어야** 통과한다.
   ⚠ 두 목록에 **새 이름이 늘면 그건 결정**이다. 감사가 「사람이 봐야 한다」로 부른다.

   ■ 한계를 숨기지 않는다

   정적 분석이라 **호출 관계를 완전히는 못 따라간다.** 함수 안에 인증 호출이 없어도
   부르는 쪽에서 막고 있으면 안전하다 — 그래서 「부르는 자리에서 막는가」도 함께 본다.
   그래도 모르는 것은 **모른다고 적는다.** 이 도구가 0건이라고 해서 안전이 증명된
   것은 아니다(권한의 종류가 맞는지는 사람이 본다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api');

/* 의도된 공개 쓰기 — 이름과 **왜 공개인지**를 함께 적는다 */
const PUBLIC_WRITES = {
  saveQuote: '고객 계산기가 남기는 견적 기록 (로그인 없이 쓴다 — 리드다)',
  issuePackageShare: '패키지 견적서 발급 — 고객 경로 (adhoc은 함수 안에서 관리자만)',
};

/* 🔴 **`module.exports` 핸들러는 공개 분기와 관리자 분기가 한 함수에 섞여 있다.**
   그래서 「함수 안 어딘가에 requireAdmin이 있다」로 ✓를 주면 **늘 통과하는 검사**가
   된다(결함 생성기 ③ — 실제로 이 도구의 첫 판이 그랬다: `inquiries`의 공개 POST를
   GET 쪽 인증만 보고 「막는다」로 셌다).
   → 섞인 핸들러는 **어느 분기가 공개이고 어느 분기가 막히는지 사람이 한 줄 적어야**
     통과한다. 새 API 파일이 생기면 그 한 줄을 쓰게 되는 것이 이 도구의 목적이다. */
const MODULE_NOTES = {
  'inquiries:module': 'POST=공개(문의 접수·리드) · GET/PATCH=requireAdmin',
  'quote-shares:module': 'POST=공개(검증 통과해야 발급) · list/status=requireAdmin',
  'quotes:module': 'POST=공개(saveQuote) · 그 외 action=requireAdmin',
  'content:module': 'GET=공개(사이트 문구) · PATCH/PUT/DELETE=requireRole',
  'rates:module': 'GET=공개(요율·환율) · PATCH/POST=requireAdmin+requireRole',
  'track:module': '전부 공개 — 방문·클릭 수집 (이름 화이트리스트 + 2KB 상한)',
};

const AUTH_RE = /requireAdmin\s*\(|requireRole\s*\(/;
const WRITE_RE = /(insert\s+into|update\s+[a-z_]+\s+set|delete\s+from)/i;

/* 파일을 함수 단위로 자른다. 중괄호를 세지 않고 **다음 최상위 선언까지**로 자른다 —
   완벽한 파서가 아니라는 것을 알고 쓴다(그래서 아래에서 「모르는 것」을 따로 센다). */
function cutFunctions(src, file) {
  const out = [];
  const re = /^(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|^module\.exports\s*=\s*async\s*\(/gm;
  const marks = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    marks.push({ name: m[1] || (path.basename(file, '.js') + ':module'), at: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
    out.push({ name: marks[i].name, body: src.slice(marks[i].at, end) });
  }
  return out;
}

/* 🔴 판정을 **함수로 뺀다** — 검사가 진짜 코드를 부르게 하기 위해서다.
   합성 입력(가짜 api 파일)을 넣어 「정말 잡히는지」를 확인할 수 있어야 안전망이다
   (결함 생성기 ③ — 안전망은 망가진 입력으로 잡히는 걸 봐야 안전망이다). */
function auditSources(sources) {
  const findings = [];
  const okList = [];
  let writeFns = 0;
  for (const [f, src] of Object.entries(sources)) {
    /* 주석 안의 예시 SQL을 세지 않는다 — 이 저장소는 주석이 길다(없는 결함 방지) */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const fns = cutFunctions(code, f);
    for (const fn of fns) {
      if (!WRITE_RE.test(fn.body)) continue;
      writeFns++;
      const hasAuth = AUTH_RE.test(fn.body);
      /* 부르는 자리에서 막는 경우 — 같은 파일에서 `if (...requireAdmin...) ... fnName(` 꼴 */
      const calledGuarded = new RegExp('requireAdmin[\\s\\S]{0,200}\\b' + fn.name + '\\s*\\(').test(code);
      if (/:module$/.test(fn.name)) {
        /* 섞인 핸들러 — 설명이 적혀 있어야 통과한다 */
        const note = MODULE_NOTES[fn.name];
        if (note) okList.push({ f, name: fn.name, how: '분기별로 갈린다 — ' + note });
        else findings.push({ f, name: fn.name, why: '공개 분기와 관리자 분기가 섞인 핸들러인데 설명이 없다' });
        continue;
      }
      const known = PUBLIC_WRITES[fn.name];
      if (hasAuth || calledGuarded) { okList.push({ f, name: fn.name, how: hasAuth ? '함수 안에서 막는다' : '부르는 자리에서 막는다' }); continue; }
      if (known) { okList.push({ f, name: fn.name, how: '의도된 공개 쓰기 — ' + known }); continue; }
      findings.push({ f, name: fn.name, why: '인증도 없고 목록에도 없다' });
    }
  }
  return { findings, okList, writeFns };
}

function readApiSources() {
  const out = {};
  for (const f of fs.readdirSync(API).filter((x) => x.endsWith('.js'))) {
    out[f] = fs.readFileSync(path.join(API, f), 'utf8');
  }
  return out;
}

module.exports = { auditSources, readApiSources, cutFunctions, PUBLIC_WRITES, MODULE_NOTES };

if (require.main !== module) return;

const sources = readApiSources();
const files = Object.keys(sources);
const { findings, okList, writeFns } = auditSources(sources);

console.log('\n══ 서버가 실제로 막는가 ' + new Date().toISOString().slice(0, 10) + ' ══');
console.log('파일 ' + files.length + '개 · DB에 쓰는 함수 ' + writeFns + '개');
console.log('─'.repeat(70));
for (const o of okList) console.log('  ✓ ' + (o.f + ' › ' + o.name).padEnd(42) + o.how);
console.log('─'.repeat(70));
if (!findings.length) {
  console.log('✅ 모르는 공개 쓰기 0건');
} else {
  console.log('🔴 사람이 봐야 하는 쓰기 ' + findings.length + '건');
  for (const x of findings) console.log('  · ' + (x.f + ' › ' + x.name).padEnd(40) + x.why);
  console.log('  → 의도한 것이면 이 파일의 PUBLIC_WRITES / MODULE_NOTES에 **이유와 함께** 적으세요.');
}
console.log('\n⚠ 정적 분석이라 호출 관계를 완전히 따라가지 못합니다. 0건이 안전의 증명은 아닙니다');
console.log('  (권한의 **종류**가 맞는지 — owner만인지 staff까지인지 — 는 사람이 봅니다).\n');
process.exit(findings.length ? 1 : 0);

/* PX 검증: 내부 견적 산출 도구(admin-quote.html)의 '담당자'가 자칭이 아니라
   **서버가 세션에서 찍은 신원**인가, 그리고 저장 실패가 담당자에게 보이는가.

   원래 결함 —
   ① `admin-quote.html`이 담당자를 **하드코딩된 이름 5개 드롭다운에서 자기가 골랐다.**
      요율 `author`와 진행 기록에서는 '자칭 신원'을 이미 없앴는데(실계정 도입) 이 도구에만
      남아 있었다. 게다가 그 목록은 `staff_accounts`와 별개로 손으로 적혀 있어 팀원이
      바뀌면 어긋난다 — 같은 목록을 두 번 적는 문제(결함 생성기 ①).
   ② `/api/quotes` POST는 **인증이 없다.** 그런데 `channel`·`createdBy`를 클라이언트가
      보낸 대로 저장했다. 익명 제출자가 `channel:'internal', createdBy:'송주연 팀장'`을
      보내면 관리자 화면에 **"🖥 내부 산출 — 송주연 팀장"** 배지가 그대로 붙는다.
      두 렌더 지점 모두 esc()를 거치므로 XSS는 아니고, **출처 위조**가 문제다.
   ③ 저장 실패가 담당자에게 보이지 않았다. 공개 화면에서 조용한 것은 의도된 판단이지만
      (고객이 요청한 건 '견적 계산'이고 화면에 이미 있다), 내부 도구에서는 담당자의
      목적이 '이 견적을 회사 기록에 남기는 것'이라 정반대다. 견적 관리 목록에 없고
      링크 발급도 안 되는데 화면에는 "견적 산출 완료!"만 떴다.

   실행: node ai-loop/test_pX_internal_quote_origin.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const quotesSrc = read(path.join('api', 'quotes.js'));
const aqSrc = read('admin-quote.html');
const scriptSrc = read('script.js');
const adminSrc = read('admin.html');

console.log('[1] 서버가 출처를 찍는가 (②)');
ok('내부 저장 전용 action이 있다', /if \(action === 'internal' && req\.method === 'POST'\)/.test(quotesSrc));
ok('그 action은 인증을 요구한다',
  /action === 'internal'[\s\S]{0,200}requireAdmin\(req, res\)/.test(quotesSrc));
ok('createdBy를 세션에서 가져온다',
  /createdBy: req\.user\.displayName/.test(quotesSrc));
ok('공개 POST는 public으로 못 박는다',
  /channel: 'public', createdBy: ''/.test(quotesSrc));
/* 순서가 뒤바뀌면 클라이언트 값이 다시 이긴다 — 이게 이 수정의 핵심이라 원문으로 고정한다. */
const storedBlock = (quotesSrc.match(/const stored = \{[\s\S]{0,320}?\};/) || [''])[0];
ok('channel·createdBy가 payload 전개보다 뒤에 온다',
  storedBlock.indexOf('...payload') >= 0
  && storedBlock.indexOf('...payload') < storedBlock.indexOf('channel: origin.channel'),
  storedBlock.slice(0, 120));
ok('삽입 로직이 한 함수로 공유된다 (두 벌로 갈라지지 않게)',
  (quotesSrc.match(/async function saveQuote\(/g) || []).length === 1
  && (quotesSrc.match(/insert into quotes \(id, status/g) || []).length === 1,
  String((quotesSrc.match(/insert into quotes \(id, status/g) || []).length));
ok('멱등성(on conflict do nothing)이 유지된다 — 재시도가 견적을 복제하지 않는다',
  /on conflict \(id\) do nothing/.test(quotesSrc));

console.log('\n[2] 화면이 담당자를 자칭하지 않는가 (①)');
ok('하드코딩 담당자 드롭다운이 사라졌다', !/<select id="aqStaff">/.test(aqSrc));
for (const name of ['송주연', '정직한', '방민정', '오윤정', '조혜련']) {
  ok(`하드코딩된 이름 '${name}'이 남아 있지 않다`, !aqSrc.includes(name));
}
ok('로그인 계정 표시명을 담당자로 쓴다', /window\.__INTERNAL_STAFF__ = me\.displayName/.test(aqSrc));
ok('authGate가 받은 me를 버리지 않는다 (예전엔 r.json()을 읽지도 않았다)',
  /return r\.json\(\);/.test(aqSrc));
ok('표시 전용 요소를 쓴다(입력칸이 아니다)', /<output id="aqStaffName"/.test(aqSrc));
ok('사용자가 바꿀 수 있는 change 리스너가 없다', !/aqStaff'\)\?\.addEventListener\('change'/.test(aqSrc));

console.log('\n[3] 내부 도구는 인증 경로로 보내는가');
ok('엔드포인트를 내부/공개로 나눈다',
  /window\.__INTERNAL_TOOL__ \? '\/api\/quotes\?action=internal' : '\/api\/quotes'/.test(scriptSrc));
ok('공개 경로는 그대로 /api/quotes다 (고객 제출이 인증을 요구하면 안 된다)',
  /: '\/api\/quotes'/.test(scriptSrc));

console.log('\n[4] 저장 실패가 담당자에게 보이는가 (③)');
ok('실패를 알리는 함수가 있다', /function showInternalSaveWarning\(\)/.test(scriptSrc));
ok('내부 도구에서만 띄운다',
  /if \(!saved && window\.__INTERNAL_TOOL__\) showInternalSaveWarning\(\)/.test(scriptSrc));
ok('경고 자리(#aqSaveWarn)가 내부 도구에만 있다',
  /id="aqSaveWarn"/.test(aqSrc) && !/id="aqSaveWarn"/.test(read('index.html')));
const warnFn = (scriptSrc.match(/function showInternalSaveWarning\(\)[\s\S]*?\n\}/) || [''])[0];
ok('요소가 없으면 alert로라도 알린다 (조용히 넘어가지 않는다)',
  /if \(!el\) \{ if \(typeof alert === 'function'\) alert\(/.test(warnFn));
ok('무엇이 안 되는지 말한다(견적 관리·링크 발급)',
  /견적 관리 목록에 아직 나타나지 않고, 견적서 링크 발급도 할 수 없습니다/.test(warnFn));
ok('PDF·엑셀은 정상이라고 구별해 준다', /PDF·엑셀은 정상입니다/.test(warnFn));
ok('textContent로 넣는다 (innerHTML 보간을 피한다)',
  /createTextNode\(line\)/.test(warnFn) && !/innerHTML =/.test(warnFn));

console.log('\n[5] 인증 경로로 바꿔 생긴 재전송 구멍을 막았는가');
/* 내부 견적은 세션이 필요하다. 담당자가 같은 브라우저로 공개 페이지를 열기만 해도
   flushLeadQueue가 401을 받아 시도 횟수를 태우고, 상한(10)을 넘기면 그 견적을 영구히
   포기한다 — 고친 게 아니라 유실 경로를 새로 만드는 셈이 된다. */
const flushFn = (scriptSrc.match(/async function flushLeadQueue\(\)[\s\S]*?\n\}/) || [''])[0];
ok('401은 시도 횟수를 올리지 않는다', /if \(err\.status !== 401\) \{/.test(flushFn), flushFn.slice(-400, -1).slice(0, 80));
ok('그 외 실패는 여전히 시도 횟수를 올린다',
  /target\.tries = \(target\.tries \|\| 0\) \+ 1/.test(flushFn));
ok('대기열이 엔드포인트를 함께 보관한다 (재전송이 같은 경로로 간다)',
  /list\.push\(\{ endpoint, id: record\.id/.test(scriptSrc));
ok('_leadPostOnce가 status를 실어 준다 (401 판별의 근거)', /err\.status = res\.status;/.test(scriptSrc));

console.log('\n[6] 관리자 화면 렌더는 그대로 안전한가 (회귀)');
ok('목록 배지가 esc를 거친다', /channel==='internal'[\s\S]{0,160}esc\(e\.createdBy\)/.test(adminSrc));
ok('상세 배지도 esc를 거친다', /🖥 내부 산출 — \$\{esc\(e\.createdBy\|\|'담당자 미지정'\)\}/.test(adminSrc));

/* ── 실동작: saveQuote가 출처를 실제로 덮어쓰는가 ───────────────────────
   운영 DB에 닿지 않도록 db·auth·verify를 require 캐시에서 갈아끼우고 핸들러를 직접 호출한다.
   원문 대조만으로는 "정말 덮어쓰는지"를 확인할 수 없다. */
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
let inserted = null;
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: (strings, ...vals) => {
      const text = strings.join('?');
      if (/insert into quotes/.test(text)) { inserted = vals; return Promise.resolve([]); }
      return Promise.resolve([]);   /* loadVerifyContext의 조회들 */
    },
  },
};
const authPath = require.resolve(path.join(ROOT, 'api', '_lib', 'auth.js'));
let sessionUser = { id: 1, username: 'tester', displayName: '진짜담당자', role: 'manager' };
let authOk = true;
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true, exports: {
    requireAdmin: async (req, res) => {
      if (!authOk) { res.status(401).json({ error: 'unauthorized' }); return false; }
      req.user = sessionUser; return true;
    },
    requireRole: async () => true,
  },
};

const handler = require(path.join(ROOT, 'api', 'quotes.js'));

function fakeRes() {
  return {
    code: 0, body: null,
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
    setHeader() { return this; },
  };
}
/* 익명 제출자가 내부 산출을 자칭하는 본문. */
const FORGED = {
  id: 'forged1', destination: '도쿄', destLabel: '도쿄', orgName: '위조기관',
  participants: 20, total: 1000000,
  channel: 'internal', createdBy: '송주연 팀장',
};
const storedPayload = () => (inserted ? JSON.parse(inserted[inserted.length - 1]) : null);

(async () => {
  console.log('\n[7] 실동작 — 공개 POST가 내부 산출을 자칭할 수 있는가');
  inserted = null;
  let res = fakeRes();
  await handler({ method: 'POST', query: {}, body: { ...FORGED }, cookies: {} }, res);
  let p = storedPayload();
  ok('저장은 된다 (리드를 버리지 않는다)', res.code === 200 && !!p, `${res.code}`);
  ok("channel이 'public'으로 덮인다 (위조 차단)", p && p.channel === 'public', p && p.channel);
  ok('createdBy가 비워진다', p && p.createdBy === '', JSON.stringify(p && p.createdBy));

  console.log('\n[8] 실동작 — 내부 action은 세션의 이름을 찍는가');
  inserted = null;
  res = fakeRes();
  await handler({ method: 'POST', query: { action: 'internal' },
    body: { ...FORGED, id: 'internal1', createdBy: '남의이름 차장' }, cookies: {} }, res);
  p = storedPayload();
  ok('저장된다', res.code === 200 && !!p, `${res.code}`);
  ok("channel이 'internal'이 된다", p && p.channel === 'internal', p && p.channel);
  ok('createdBy가 세션 표시명이다 (보낸 이름이 아니다)',
    p && p.createdBy === '진짜담당자', p && p.createdBy);

  console.log('\n[9] 실동작 — 세션이 없으면 내부 action이 막히는가');
  authOk = false;
  inserted = null;
  res = fakeRes();
  await handler({ method: 'POST', query: { action: 'internal' }, body: { ...FORGED, id: 'internal2' }, cookies: {} }, res);
  ok('401로 거부된다', res.code === 401, String(res.code));
  ok('저장하지 않는다', inserted === null, JSON.stringify(inserted));
  authOk = true;

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

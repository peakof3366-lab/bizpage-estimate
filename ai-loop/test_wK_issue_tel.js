/* ═══════════════════════════════════════════════════════════════════════════
   WK — 견적 관리에서 발급한 견적서에도 **연락처가 남는다**

   ■ 🔴 무엇이 잘못돼 있었나 (2026-08-26, WF 후속의 미확인 항목을 따라가다 발견)

   WC(8/24)는 연락처 칸을 세 화면에 넣었다 — 고객 계산기(index.html) ·
   담당자 견적 도구(admin-quote.html) · 관리자 패키지 발급(admin.html).
   그런데 담당자 도구의 칸은 **「지금 바로 링크를 발급할 때」만** 읽혔다.

     담당자 도구에서 견적을 만들어 **저장** → 나중에 관리자 → 견적 관리에서 발급

   이 흐름에서 연락처는 어디에도 없다. `estRecord`(견적 기록)에 그 칸이 없었고,
   발급 요청(`?action=issue`)도 `{share, quote}`만 보냈다. 즉 **담당자가 적은
   연락처가 조용히 버려지고 대장에는 빈 칸으로 쌓였다.**
   WB·WC가 만든 목적(「담당자가 휴가여도 응대」)이 정확히 이 경로에서 깨져 있었다.

   ⚠ 이건 세어 보기 전에는 「입구 세 곳은 다 막았다」로 보였다. 입구가 아니라
     **입구에서 발급까지 가는 길**이 끊겨 있었다(결함 생성기 ② — 조용한 폴백).

   ■ 이 검사가 지키는 것

     ① 견적 기록이 연락처를 **담는다** (칸만 있고 안 읽히는 상태로 돌아가지 않는다)
     ② 그래도 **고객 견적서 payload에는 안 실린다** — WC의 규칙은 그대로다
     ③ 발급 요청이 연락처를 **보낸다** (기록에 있으면 그대로)
     ④ 🔴 기록에 없으면 **그 자리에서 받고**, 안 주면 **발급하지 않는다**
     ⑤ 서버가 담당자 발급을 막는다 — 다만 **공개 경로는 안 막는다**(캐시된 옛 화면)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WK 담당자 발급 경로의 연락처`);
  process.exit(fail ? 1 : 0);
};

const SCRIPT = read('script.js');
const ADMIN = read('admin.html');
const SHARES = read('api/quote-shares.js');
const AQ = read('admin-quote.html');

console.log('\n[1] 견적 기록이 연락처를 담는다 — 칸만 있고 안 읽히던 상태를 막는다');
{
  ok('① 담당자 도구에 연락처 칸이 있다 (WC)', /id="contactTel"/.test(AQ));
  ok('① 고객 계산기에도 있다 (WC)', /id="contactTel"/.test(read('index.html')));
  /* 🔴 여기가 이번에 고친 자리다. 칸을 읽어 estRecord에 넣지 않으면
     저장했다가 나중에 발급하는 순간 값이 사라진다. */
  ok('① script.js가 그 칸을 읽는다',
    /const contactTel = document\.getElementById\('contactTel'\)\?\.value\.trim\(\)/.test(SCRIPT));
  ok('① 견적 기록에 `contactTel`로 들어간다', /\r?\n {6}contactTel,\r?\n/.test(SCRIPT));
}

console.log('\n[2] 🔴 그래도 고객 견적서 payload에는 안 실린다 — WC 규칙은 그대로다');
{
  /* 견적서 링크에는 인증이 없다. payload에 섞이면 링크를 아는 사람이 전부 본다.
     ⚠ 소스에 문자열이 있는지가 아니라 **payload를 만드는 자리**를 잘라서 본다. */
  const start = SCRIPT.indexOf('const shareData');
  ok('② shareData를 만드는 자리를 찾았다', start > 0);
  const block = SCRIPT.slice(start, start + 2200);
  ok('② 그 안에 연락처가 없다',
    !/contactTel|customerTel/.test(block),
    block.split('\n').filter((l) => /Tel/.test(l)).join(' | '));

  /* 담당자 발급이 서버로 보내는 share(=payload)도 마찬가지다 */
  const s2 = ADMIN.indexOf('const share = {\n      v: 1, dk: rec.destKey');
  ok('② 담당자 발급 payload 자리를 찾았다', s2 > 0);
  const b2 = ADMIN.slice(s2, ADMIN.indexOf('};', s2));
  ok('② 담당자 발급 payload에도 연락처가 없다', !/Tel/.test(b2));
}

console.log('\n[3] 서버 — 담당자 발급만 막는다. 공개 경로는 안 막는다');
{
  ok('③ `tel_required`로 거절한다', /isStaffIssue && !custTel.*tel_required/s.test(SHARES));
  /* ⚠ **공개 경로까지 막으면 캐시된 옛 화면에서 온 리드가 통째로 사라진다.**
     연락처 없는 리드가, 리드가 아예 없는 것보다 낫다. 조건이 빠지면 여기서 걸린다. */
  const line = (SHARES.match(/^.*tel_required.*$/gm) || []).filter((l) => /isStaffIssue/.test(l));
  ok('③ 그 거절에 `isStaffIssue` 조건이 붙어 있다', line.length === 1, '실제 ' + line.length + '줄');

  /* 자리: requireAdmin **뒤**여야 한다 — 로그인하지 않은 요청에까지 연락처를 먼저
     따지면 「무엇이 문제인지」가 뒤바뀐다(WF 후속에서 세운 규칙). */
  const iAdmin = SHARES.indexOf('isStaffIssue && !(await requireAdmin');
  const iTel = SHARES.indexOf('isStaffIssue && !custTel');
  ok('③ 로그인 확인 다음에 본다', iAdmin > 0 && iTel > iAdmin);

  /* 기준은 normalizeTel 하나다 — 서버가 자릿수를 다시 세면 화면과 갈린다 */
  ok('③ 기준은 `normalizeTel` 하나다', /const custTel = QNO\.normalizeTel\(body\.customerTel\)/.test(SHARES));
  ok('③ 걸러 낸 값을 그대로 저장한다 (두 번 정규화하지 않는다)',
    /custTel\}\)\n/.test(SHARES) && !/QNO\.normalizeTel\(\(req\.body \|\| \{\}\)\.customerTel\)/.test(SHARES));
}

console.log('\n[4] 🔴 실제로 눌러 본다 — 발급 요청에 연락처가 실리는가');
{
  const dom = new JSDOM(ADMIN, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      w.Element.prototype.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.alert = () => {};
      w.confirm = () => true;
      w.prompt = () => null;
      /* 화면이 뜨는 동안에도 fetch를 부른다 — 없으면 스크립트가 거기서 죽는다 */
      w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    },
  });
  const w = dom.window, d = w.document;

  const REC = {
    id: 'wk-1', destKey: 'okinawa', destLabel: '오키나와', participants: 12, days: 4, nights: 3,
    orgName: '한빛산업', contact: '김보균', contactTel: '010-1234-5678',
    total: 14280000, perPerson: 1190000, items: [{ name: '항공', amount: 5000000 }],
  };

  const finish = async () => {
    if (typeof w.issueShareLink !== 'function') {
      fail++;
      console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    /* 발급 경로가 부르는 것들만 갈아 끼운다. 일정·활동로그는 이 검사의 관심이 아니다. */
    const calls = [];
    w.fetch = (url, opt) => {
      calls.push({ url: String(url), body: opt && opt.body ? JSON.parse(opt.body) : null });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'sh1', verdict: 'verified' }) });
    };
    /* ⚠ 저장소는 `file://`에서 못 쓴다(opaque origin) — 견적 기록을 읽는 함수 하나만
         갈아 끼운다. 대신 **화면이 견적을 여는 그 함수로** 연다(`emCurrentId` 직접
         대입 금지 — 화면이 안 거치는 상태를 검사가 만들어 내게 된다). */
    let recs = [REC];
    w.eval(`
      emLoadItiTables = async () => ({});
      emConfirmItinerary = () => true;
      addActivityLogSilent = async () => {};
      recQuoteItinerary = () => null;
    `);
    w.getEstsFull = () => recs;
    w.eval('getEstsFull = window.getEstsFull;');
    /* 로그인한 직원이 여는 화면이다 — 로그인 상태가 없으면 상세가 그리다 죽는다 */
    w.eval('currentUser = { id: "1", username: "tester", displayName: "테스터", role: "manager" };');
    w.openEstDetail('wk-1');

    /* ③ 기록에 연락처가 있으면 그대로 실린다 */
    await w.issueShareLink();
    const issue = calls.filter((c) => /action=issue/.test(c.url));
    ok('④ 발급 요청이 나갔다', issue.length === 1, '실제 ' + issue.length + '건');
    ok('④ body에 `customerTel`이 실렸다',
      issue.length === 1 && issue[0].body.customerTel === '010-1234-5678',
      issue.length ? JSON.stringify(issue[0].body.customerTel) : '요청 없음');
    /* 🔴 그리고 payload에는 여전히 없다 — 실제로 나간 body로 확인한다 */
    ok('④ 그런데 share(payload)에는 없다',
      issue.length === 1 && !JSON.stringify(issue[0].body.share).includes('1234-5678'));

    /* ④ 기록에 없으면 그 자리에서 받는다 — 취소하면 발급하지 않는다 */
    calls.length = 0;
    recs = [Object.assign({}, REC, { contactTel: '' })];
    let asked = 0;
    w.prompt = () => { asked++; return null; };     /* 취소 */
    await w.issueShareLink();
    ok('④ 연락처가 없으면 물어본다', asked === 1, '물어본 횟수 ' + asked);
    ok('④ 🔴 취소하면 발급하지 않는다',
      calls.filter((c) => /action=issue/.test(c.url)).length === 0);

    /* 물어봐서 받은 값이 그대로 실린다 */
    calls.length = 0;
    w.prompt = () => '02)123-4567';
    await w.issueShareLink();
    const issue2 = calls.filter((c) => /action=issue/.test(c.url));
    ok('④ 물어봐서 받은 값이 실린다',
      issue2.length === 1 && issue2[0].body.customerTel === '02)123-4567',
      issue2.length ? JSON.stringify(issue2[0].body.customerTel) : '요청 없음');

    /* ⚠ 형식은 조이지 않되(WC), 숫자가 모자라면 안 보낸다 — 서버 기준과 같은 자리다 */
    calls.length = 0;
    w.prompt = () => '1234';
    await w.issueShareLink();
    ok('④ 숫자가 모자라면 발급하지 않는다',
      calls.filter((c) => /action=issue/.test(c.url)).length === 0);

    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

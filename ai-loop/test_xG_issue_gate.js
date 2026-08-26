/* ═══════════════════════════════════════════════════════════════════════════
   XG — 발급 자리가 **서버와 같은 조건**을 보는가

   소규모 견적을 **처음 만드는 사람의 순서대로** 눌러 보다가 나왔다.
   저장까지는 깨끗했다(기본값·안내·서버 오류 문구가 전부 사람 말로 나온다).
   막힌 곳은 마지막 한 걸음, **발급** 자리였다.

   ■ 🔴 서버는 셋을 보는데 화면은 하나만 봤다

     서버(`getIssuablePackage`, WR): ① status='open' ② 유효기간 ③ **출발일**
     화면(`pkgIssueReset`)          : ① status='open' 만

   그래서 기한이나 출발일이 지난 건은 **버튼이 눌리고, 눌러 보고서야 404**로 거절됐다.
   `limits.js`의 MAX_DAYS 주석이 말한 바로 그 상황이다 —
   「화면이 막지 않고 서버만 거절하면, 담당자는 … 눌러서야 그 사실을 안다」.
   게다가 그때 뜨는 문구는 **출발일을 언급도 안 했다**(WR에서 조건을 늘렸는데
   문구가 안 따라갔다 — 목록이 흩어져 하나를 빠뜨리는 자리다).

   ■ 이 검사가 지키는 것

     ① 🔴 화면이 **세 조건을 다** 본다 — 각각 **다른 이유**를 말한다
     ② 값이 **비어 있는 것은 「지났다」가 아니다** (서버와 같은 규칙)
     ③ 정상일 때는 버튼이 살아 있고 안내가 없다
     ④ 서버 거절 문구가 **세 조건을 다** 말한다
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
  console.log(`결과: ${pass} pass / ${fail} fail  — XG 발급 자리의 조건`);
  process.exit(fail ? 1 : 0);
};

/* 오늘을 기준으로 만든다 — 날짜를 박아 두면 언젠가 검사가 스스로 낡는다 */
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

console.log('\n[1] 서버 거절 문구가 세 조건을 다 말한다');
{
  const admin = read('admin.html');
  const i = admin.indexOf('package_not_available:');
  const line = admin.slice(i, i + 200);
  ok('④ 상태를 말한다', /판매중|확정/.test(line), line.slice(0, 90));
  ok('④ 유효기간을 말한다', /유효기간/.test(line));
  /* 🔴 WR에서 늘어난 조건 — 문구가 안 따라가면 담당자가 무엇을 고칠지 모른다 */
  ok('④ 🔴 출발일을 말한다', /출발일/.test(line), line.slice(0, 120));
}

console.log('\n[2] 🔴 화면이 세 조건을 다 보는가 — 실제로 눌러 본다');
{
  const dom = new JSDOM(read('admin.html'), {
    runScripts: 'dangerously', resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'admin.html').split(path.sep).join('/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
      w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    },
  });
  const w = dom.window, d = w.document;
  const finish = () => {
    if (typeof w.pkgIssueReset !== 'function') {
      fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    const check = (p) => {
      w.pkgIssueReset(p);
      return {
        disabled: !!d.getElementById('pkgIssue').disabled,
        why: (d.getElementById('pkgIssueGate').textContent || '').trim(),
      };
    };
    const base = { id: 'a1', kind: 'adhoc', status: 'open', validUntil: day(14), departDate: day(60) };

    /* ③ 정상 */
    const okCase = check(base);
    ok('③ 정상이면 누를 수 있다', !okCase.disabled, JSON.stringify(okCase));
    ok('③ 정상이면 안내가 없다', okCase.why === '', okCase.why);

    /* ① 상태 */
    const draft = check(Object.assign({}, base, { status: 'draft' }));
    ok('① 작성중이면 막고 이유를 말한다', draft.disabled && /확정/.test(draft.why), draft.why.slice(0, 60));

    /* ① 유효기간 */
    const expired = check(Object.assign({}, base, { validUntil: day(-1) }));
    ok('① 🔴 유효기간이 지나면 막는다', expired.disabled, JSON.stringify(expired));
    ok('① 그 이유를 말한다 (기한)', /유효기간이 지났습니다/.test(expired.why), expired.why.slice(0, 60));

    /* ① 출발일 — WR에서 서버에 더해진 조건 */
    const gone = check(Object.assign({}, base, { departDate: day(-1) }));
    ok('① 🔴 출발일이 지나면 막는다', gone.disabled, JSON.stringify(gone));
    ok('① 그 이유를 말한다 (출발일)', /출발일이 지났습니다/.test(gone.why), gone.why.slice(0, 60));
    /* ⚠ 이유가 **서로 달라야** 한다 — 뭉뚱그리면 무엇을 고칠지 모른다 */
    ok('① 두 이유가 서로 다르다', expired.why !== gone.why);

    /* ② 비어 있는 것은 「지났다」가 아니다 — 서버와 같은 규칙 */
    const noDates = check(Object.assign({}, base, { validUntil: null, departDate: null }));
    ok('② 🔴 기한·출발일이 비면 막지 않는다', !noDates.disabled && noDates.why === '', JSON.stringify(noDates));

    /* 오늘은 살린다 (서버가 `>=`로 본다) */
    const today = check(Object.assign({}, base, { validUntil: day(0), departDate: day(0) }));
    ok('② 오늘이면 아직 살아 있다', !today.disabled, JSON.stringify(today));

    console.log('\n[3] 서버 조건과 대조 — 화면이 본 것과 같은 셋인가');
    {
      const lib = read('api/_lib/packages.js');
      const iss = lib.slice(lib.indexOf('async function getIssuablePackage'));
      ok('⑤ 서버: 상태', /status = 'open'/.test(iss));
      ok('⑤ 서버: 유효기간', /valid_until is null or valid_until >= current_date/.test(iss));
      ok('⑤ 서버: 출발일', /depart_date is null or depart_date >= current_date/.test(iss));
      /* 화면 쪽도 같은 세 가지를 본다 */
      const admin = read('admin.html');
      const fn = admin.slice(admin.indexOf('function pkgIssueReset'), admin.indexOf('function pkgReadHanatour'));
      ok('⑤ 화면: 상태', /p\.status !== 'open'/.test(fn));
      ok('⑤ 화면: 유효기간', /p\.validUntil/.test(fn));
      ok('⑤ 화면: 출발일', /p\.departDate/.test(fn));
      /* ⚠ 「비면 안 막는다」도 양쪽 같아야 한다 */
      ok('⑤ 화면도 빈 값을 「지났다」로 안 본다', /day\(p\.validUntil\) &&/.test(fn) && /day\(p\.departDate\) &&/.test(fn));
    }

    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

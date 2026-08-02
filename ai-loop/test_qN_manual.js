/* QN 검증: 관리자 화면 안 '매뉴얼' 탭과 manual.html.

   매뉴얼의 진짜 위험은 안 열리는 게 아니라 **조용히 낡는 것**이다. 화면이 바뀌었는데
   문서가 그대로면, 직원은 문서를 믿고 엉뚱한 버튼을 찾다가 결국 문서를 안 보게 된다.
   그래서 여기서는 배선뿐 아니라 **문서에 적힌 숫자·이름을 코드와 직접 대조**한다.

   고정하는 것:
   ① 배선 — 사이드바 항목·탭 패널·iframe이 있고, 탭을 열기 전에는 로드하지 않는다.
   ② 권한 — 매뉴얼은 **누구에게도 숨기지 않는다.** 직원이 가장 많이 볼 문서다.
   ③ 배포 — manual.html이 .vercelignore에 걸리지 않는다. 걸리면 프로덕션에서 404가 뜨는데
      로컬에서는 멀쩡해서 알아채기 어렵다(조용히 실패하는 자리).
   ④ 문서 ↔ 코드 대조 — 세션 시간·비밀번호 길이·로그인 잠금·코스 상한·가입코드 길이·
      메뉴 이름·상태값이 실제 코드와 같은가.
   ⑤ 목차 앵커가 전부 실제 섹션으로 연결되는가(깨진 링크는 눌러도 아무 일이 없다).

   실행: node ai-loop/test_qN_manual.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const adminSrc = read('admin.html');
const manualPath = path.join(ROOT, 'manual.html');

(async () => {
  console.log('\n[1] manual.html이 존재하고 배포에서 빠지지 않는가');
  ok('manual.html이 있다', fs.existsSync(manualPath));
  const manualSrc = fs.existsSync(manualPath) ? read('manual.html') : '';

  /* .vercelignore에 걸리면 프로덕션에서만 404가 난다 — 로컬에서는 멀쩡해 보인다. */
  const ignoreLines = read('.vercelignore').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const blocked = ignoreLines.filter((pat) => {
    if (pat.endsWith('/')) return 'manual.html'.startsWith(pat);       // 디렉터리 규칙
    if (pat.startsWith('*.')) return 'manual.html'.endsWith(pat.slice(1)); // 확장자 규칙
    return pat === 'manual.html';
  });
  ok('.vercelignore가 manual.html을 막지 않는다', blocked.length === 0, blocked.join(', '));

  const dom = await bootAdmin();
  const w = dom.window, d = w.document;

  console.log('\n[2] 관리자 화면에 제대로 붙었는가');
  const navBtn = d.querySelector('.sidebar-item[data-tab="manual"]');
  ok('사이드바에 매뉴얼 항목이 있다', !!navBtn);
  ok('이름이 “매뉴얼”이다', !!navBtn && navBtn.querySelector('.si-label').textContent.trim() === '매뉴얼',
    navBtn && navBtn.textContent.trim());
  ok('탭 패널이 있다', !!d.getElementById('tab-manual'));
  const frame = d.getElementById('manualFrame');
  ok('iframe이 있다', !!frame);
  ok('탭을 열기 전에는 불러오지 않는다', !!frame && !frame.getAttribute('src'),
    frame && frame.getAttribute('src'));
  ok('새 탭으로 여는 링크가 있다',
    !!d.querySelector('#tab-manual a[href="manual.html"][target="_blank"]'));
  ok('새 탭 링크에 rel=noopener가 있다',
    (d.querySelector('#tab-manual a[href="manual.html"]') || {}).rel === 'noopener');
  /* 탭 이름표에 없으면 탭을 열었을 때 상단 제목이 빈칸이 된다. */
  ok('탭 이름표(TAB 라벨)에 등록돼 있다', /manual\s*:\s*'매뉴얼'/.test(adminSrc));

  console.log('\n[3] 탭을 열면 그때 불러오는가');
  w.__renderTab('manual');
  ok('iframe src가 manual.html이 된다', frame.getAttribute('src') === 'manual.html',
    frame.getAttribute('src'));

  console.log('\n[4] 매뉴얼은 누구에게도 숨기지 않는가 — 직원이 가장 많이 볼 문서다');
  for (const role of ['staff', 'manager', 'owner']) {
    w.__setUser({ id: '9', role: role, displayName: '테스트' });
    w.__applyRoleUi();
    ok(`${role}에게 매뉴얼 메뉴가 보인다`, !navBtn.classList.contains('hidden'));
  }

  console.log('\n[5] 숫자가 limits.js 한 곳에서만 나오는가 — 손으로 적어두면 문서만 낡는다 (QO)');
  const LIMITS = require(path.join(ROOT, 'limits.js'));
  ok('limits.js가 값을 내놓는다', LIMITS && Object.keys(LIMITS).length >= 7, Object.keys(LIMITS).join(', '));

  /* 서버가 자기 파일에 숫자를 다시 적어두면 limits.js를 고쳐도 서버는 안 바뀐다. */
  const redefined = [
    ['api/_lib/auth.js', /MAX_AGE_SECONDS\s*=\s*\d+\s*\*/],
    ['api/admin/login.js', /MAX_FAILED_ATTEMPTS\s*=\s*\d/],
    ['api/admin/login.js', /LOCKOUT_MINUTES\s*=\s*\d/],
    ['api/content.js', /MAX_COURSES\s*=\s*\d/],
    ['api/admin/account.js', /length\s*<\s*\d/],
    ['api/admin/account.js', /SIGNUP_CODE_RE\s*=\s*\/\^\[[^\]]*\]\{\d/],
  ].filter(([f, re]) => re.test(read(f))).map(([f, re]) => `${f} ${re}`);
  ok('서버가 숫자를 따로 다시 적어두지 않았다', redefined.length === 0, redefined.join(' | '));
  ok('관리자 화면도 limits.js를 싣는다', /<script src="limits\.js">/.test(adminSrc));
  ok('관리자 화면이 코스 상한을 따로 적지 않는다',
    /ITI_MAX_COURSES\s*=\s*LIMITS\.MAX_COURSES/.test(adminSrc));

  /* 매뉴얼은 값을 '적어두는' 게 아니라 '읽어와 렌더'해야 한다. 실제로 띄워서 확인한다. */
  const mdom = await bootManual();
  const md = mdom.window.document;
  const facts = Array.from(md.querySelectorAll('[data-fact]'));
  ok('매뉴얼에 자동으로 채워지는 자리가 있다', facts.length >= 8, `${facts.length}곳`);
  const badKey = facts.map((e) => e.getAttribute('data-fact')).filter((k) => LIMITS[k] === undefined);
  ok('없는 항목을 가리키는 자리가 없다', badKey.length === 0, badKey.join(', '));
  const wrong = facts.filter((e) => e.textContent.trim() !== String(LIMITS[e.getAttribute('data-fact')]));
  ok('모든 자리가 limits.js 값으로 채워졌다', wrong.length === 0,
    wrong.map((e) => `${e.getAttribute('data-fact')}=${e.textContent}`).join(', '));
  const used = new Set(facts.map((e) => e.getAttribute('data-fact')));
  ok('세션·로그인·비밀번호·가입코드·코스 상한이 모두 문서에 나온다',
    ['SESSION_HOURS', 'LOGIN_MAX_ATTEMPTS', 'LOGIN_LOCKOUT_MINUTES', 'PASSWORD_MIN_LENGTH',
     'SIGNUP_CODE_MIN', 'SIGNUP_CODE_MAX', 'MAX_COURSES'].every((k) => used.has(k)),
    [...used].join(', '));
  ok('불러오기 실패를 알리는 자리가 있다', !!md.getElementById('fact-src'));

  console.log('\n[6] 새 메뉴·상태가 생기면 매뉴얼이 낡은 것을 잡아내는가');
  /* 목록을 여기 적어두지 않는다 — 화면에 있는 것 전부를 요구해야 새 탭이 생겼을 때
     "매뉴얼에 없다"로 걸린다. 여기 손으로 적으면 그 목록만 낡는다(결함 생성기 ①). */
  const sidebarLabels = Array.from(d.querySelectorAll('.sidebar-item .si-label')).map((e) => e.textContent.trim());
  ok('사이드바 메뉴를 읽었다', sidebarLabels.length >= 10, `${sidebarLabels.length}개`);
  const undocumented = sidebarLabels.filter((m) => !manualSrc.includes(m));
  ok('모든 메뉴가 매뉴얼에 설명돼 있다', undocumented.length === 0,
    '매뉴얼에 없는 메뉴: ' + undocumented.join(', ') + ' — 화면에 생겼으면 문서에도 넣어야 한다');

  const emStatuses = Array.from(d.querySelectorAll('#em-status-sel option')).map((o) => o.textContent.trim());
  const inqStatuses = Array.from(d.querySelectorAll('#d-status option')).map((o) => o.textContent.trim());
  ok('견적 상태 4개가 화면과 문서에 같이 있다',
    emStatuses.length === 4 && emStatuses.every((s) => manualSrc.includes('>' + s + '<')),
    emStatuses.join(', '));
  ok('문의 상태 4개가 화면과 문서에 같이 있다',
    inqStatuses.length === 4 && inqStatuses.every((s) => manualSrc.includes('>' + s + '<')),
    inqStatuses.join(', '));

  console.log('\n[7] 목차가 전부 실제 섹션으로 이어지는가 — 깨진 앵커는 눌러도 아무 일이 없다');
  const anchors = Array.from(md.querySelectorAll('nav.toc a[href^="#"]')).map((a) => a.getAttribute('href').slice(1));
  ok('목차 항목이 있다', anchors.length >= 10, `${anchors.length}개`);
  const dead = anchors.filter((id) => !md.getElementById(id));
  ok('모든 목차 링크가 실제 섹션으로 이어진다', dead.length === 0, dead.join(', '));
  const sections = Array.from(md.querySelectorAll('main section[id]')).map((s) => s.id);
  const orphan = sections.filter((id) => !anchors.includes(id));
  ok('목차에서 빠진 섹션이 없다', orphan.length === 0, orphan.join(', '));
  ok('본문이 실제로 들어 있다', md.querySelectorAll('main section').length >= 10);
  /* 외부 리소스를 부르면 사내망·오프라인에서 깨진 화면이 된다. 자급자족이어야 한다. */
  ok('외부 CDN·폰트를 부르지 않는다', !/<(script|link)[^>]+https?:\/\//i.test(manualSrc));

  console.log('\n[8] 상수를 못 불러온 경우 낡은 숫자를 조용히 보여주지 않는가 (결함 생성기 ②)');
  const noLimits = await bootManual({ withLimits: false });
  const nd = noLimits.window.document;
  ok('문서 맨 위에 확인하지 못했다고 알린다',
    /확인하지 못했습니다/.test(nd.querySelector('main').textContent));
  ok('무엇이 문제인지 바닥글에도 남는다', /limits\.js/.test(nd.getElementById('fact-src').textContent));
  noLimits.window.close();
  mdom.window.close();

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* manual.html을 실제로 띄운다 — 값이 '적혀' 있는지가 아니라 '채워지는'지를 봐야 한다.
   withLimits:false는 limits.js를 못 불러온 상황을 재현한다(그 자리를 일부러 망가뜨려
   경고가 실제로 뜨는지 확인하기 위해서다 — 결함 생성기 ③). */
async function bootManual(opts) {
  const withLimits = !opts || opts.withLimits !== false;
  let html = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');
  html = html.replace(/<script src="limits\.js"><\/script>/,
    withLimits ? '<script>\n' + fs.readFileSync(path.join(ROOT, 'limits.js'), 'utf8') + '\n</script>' : '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/manual.html' });
  await new Promise((r) => setTimeout(r, 30));
  return dom;
}

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__renderTab = (n) => renderTab(n);
  window.__setUser = (u) => { currentUser = u; };
  window.__applyRoleUi = () => applyRolePermissionsToUI();
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

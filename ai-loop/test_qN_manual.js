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

  /* 역할 호칭은 화면·권한표와 같은 말이어야 한다 — 2026-08-03 사용자 지시로 매뉴얼의
     '사장님'을 전부 '관리자'로 바꿨다. 권한 3단계(직원·매니저·관리자)와 같은 말을 쓰는
     것이 목적이므로, 새 절을 쓰면서 다시 '사장님'이라 적으면 여기서 걸린다.
     (사람 호칭이 두 벌이면 "매니저나 사장님께 요청"과 "관리자에게 요청"이 같은 사람을
      가리키는지 직원이 판단할 수 없다 — 결함 생성기 ①의 문서판이다.) */
  ok('매뉴얼이 역할을 권한표와 같은 말로 부른다 (사장님 → 관리자)',
    !manualSrc.includes('사장님'),
    (manualSrc.match(/.{0,30}사장님.{0,30}/g) || []).slice(0, 3).join(' | '));

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

  console.log('\n[8] 읽기 보조 — 검색·첫날 안내·맨 위로가 실제로 동작하는가 (QP)');
  /* ⚠ 여기를 원문 정규식으로 때우지 않는다. 이 저장소가 반복해서 당한 것이
     "기능은 만들었는데 한 번도 실행해 본 적이 없다"이므로, 실제로 값을 넣고
     이벤트를 쏴서 결과가 나오는지 본다(결함 생성기 ③). */
  const q = md.getElementById('q');
  const hits = md.getElementById('hits');
  ok('검색창과 결과 자리가 있다', !!q && !!hits);

  const type = (value) => {
    q.value = value;
    q.dispatchEvent(new mdom.window.Event('input'));
  };

  /* 한 글자로 검색하면 온 문서가 걸려 결과가 쓸모없어진다 — 일부러 막아둔 동작. */
  type('요');
  ok('한 글자로는 검색하지 않는다', hits.children.length === 0, `${hits.children.length}건`);

  /* 본문에만 있고 목차·제목에는 없는 문구여야 '본문을 색인했는지'가 확인된다. */
  type('확인 필요');
  ok('본문 문구를 찾아낸다 ("확인 필요")', hits.children.length > 0, `${hits.children.length}건`);
  const firstBtn = hits.querySelector('button');
  ok('결과에 어느 장인지 함께 나온다',
    !!firstBtn && !!firstBtn.querySelector('.where') && firstBtn.querySelector('.where').textContent.trim().length > 0,
    firstBtn && firstBtn.textContent.slice(0, 40));
  ok('찾은 말이 결과 안에 강조된다', !!firstBtn && !!firstBtn.querySelector('mark'));

  /* 없으면 "없다"고 말해야 한다. 빈 목록만 남으면 고장인지 없는 건지 구별이 안 된다. */
  type('이런말은문서에없다zzz');
  ok('없는 말은 없다고 알린다', !!hits.querySelector('.none'),
    hits.textContent.trim().slice(0, 40));

  /* 눌렀을 때 그 자리로 갔다는 표시가 나야 한다 — 스크롤만 하면 어디로 왔는지 모른다. */
  type('담당자');
  const jumpBtn = hits.querySelector('button');
  ok('결과가 있다(이동 확인용)', !!jumpBtn);
  if (jumpBtn) {
    jumpBtn.click();
    ok('결과를 누르면 이동한 자리를 표시한다', !!md.querySelector('.flash'));
  }

  /* 첫날 경로 — 12개 장 중 무엇부터 볼지 문서가 스스로 말해야 한다. */
  const kick = md.querySelector('.kickoff');
  ok('첫날 안내가 있다', !!kick);
  const kickLinks = kick ? Array.from(kick.querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href').slice(1)) : [];
  ok('첫날 안내 링크가 3개 이상이다', kickLinks.length >= 3, `${kickLinks.length}개`);
  const kickDead = kickLinks.filter((id) => !md.getElementById(id));
  ok('첫날 안내의 링크가 전부 실제 섹션으로 이어진다', kickDead.length === 0, kickDead.join(', '));
  /* 섹션으로 만들면 목차 번호가 밀려 본문 제목과 어긋난다 — 일부러 div로 둔 것을 고정한다. */
  ok('첫날 안내는 섹션이 아니다 (목차 번호가 밀리지 않게)',
    !kick || kick.tagName.toLowerCase() !== 'section');

  ok('맨 위로 버튼이 있다', !!md.getElementById('backtop'));

  /* ── 줄맞춤이 되돌아가는 것을 막는다 (2026-08-03) ──
     번호 매긴 목록의 li를 2열 격자로 만들고 첫 칸에 ::before 번호를 넣는 방식은
     **글자 덩어리와 인라인 요소가 각각 한 칸을 차지**하기 때문에, 내용이 조각나 있으면
     둘째 조각부터 번호 칸으로 밀려 들어가 한 글자씩 세로로 쏟아진다. 2장 하루 흐름과
     첫날 안내가 실제로 그 상태로 배포됐다.
     jsdom은 레이아웃을 계산하지 않아 '보이는 결과'는 여기서 못 잰다(그건
     ai-loop/check_manual_layout.py가 실제 브라우저로 한다). 대신 **원인이 되는 구조**를
     여기서 막는다 — 이건 브라우저 없이 항상 돌기 때문이다. */
  const styleBlock = (manualSrc.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const NUMBERED_LI = [
    ['ol.flow > li', /ol\.flow > li \{([^}]*)\}/],
    ['ol.steps > li', /ol\.steps > li \{([^}]*)\}/],
    ['ul.dont li', /ul\.dont li \{([^}]*)\}/],
    ['.kickoff ol li', /\.kickoff ol li \{([^}]*)\}/],
    ['nav.toc li', /nav\.toc li \{([^}]*)\}/],
  ];
  for (const [name, re] of NUMBERED_LI) {
    const body = (styleBlock.match(re) || [])[1];
    ok(`${name} 규칙을 찾았다`, !!body);
    if (!body) continue;
    ok(`${name}: 번호를 격자 칸으로 만들지 않았다`,
      !/grid-template-columns/.test(body), body.trim().slice(0, 70));
    ok(`${name}: 번호를 띄우고 내용은 글 흐름에 둔다(position: relative)`,
      /position:\s*relative/.test(body), body.trim().slice(0, 70));
  }
  /* 설명 문장 안의 상태 배지가 블록으로 늘어나던 것 — 직계 자식만 잡아야 한다. */
  ok('ol.flow의 블록 규칙이 직계 자식만 잡는다 (안쪽 배지까지 늘리지 않게)',
    /ol\.flow > li > span \{/.test(styleBlock) && !/^\s*ol\.flow span \{/m.test(styleBlock));

  /* 목차 접기는 좁은 화면 전용이다. 접힌 채 창이 넓어지면 목차가 사라지고 펼 버튼도
     안 보인다(접힘은 브라우저가 내용을 감추므로 CSS로 못 되돌린다). 넓은 폭에서는
     JS가 강제로 펴야 한다 — jsdom 기본 폭은 1024라 여기서 확인된다. */
  const tocDetails = md.querySelector('nav.toc details');
  ok('목차가 접을 수 있게 돼 있다(좁은 화면용)', !!tocDetails);
  ok('넓은 화면에서는 목차가 펼쳐진다', !!tocDetails && tocDetails.open === true,
    `innerWidth=${mdom.window.innerWidth}, open=${tocDetails && tocDetails.open}`);
  if (tocDetails) {
    tocDetails.open = false;
    mdom.window.dispatchEvent(new mdom.window.Event('resize'));
    ok('접힌 채 창이 넓어지면 다시 펴 준다', tocDetails.open === true);
  }

  /* 읽기 보조가 숫자 채우기와 **다른 스크립트 블록**이어야 한다. 한 블록에 두면 여기서
     난 예외 하나가 fillFacts까지 멈추는데, 그건 화면에 티가 안 난다(결함 생성기 ②).

     ⚠ 주석을 먼저 걷어낸 뒤에 센다. 처음엔 원문을 그대로 셌는데, 매뉴얼 주석 안에
     설명용으로 적힌 태그 문자열까지 함께 세어져 **두 블록을 하나로 합쳐도 통과했다**
     (일부러 망가뜨려 보고 나서야 알았다 — 결함 생성기 ③이 말하는 그 상태였다). */
  const srcNoComments = manualSrc
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const inlineScripts = srcNoComments.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || [];
  ok('읽기 보조가 숫자 채우기와 분리된 블록이다', inlineScripts.length >= 2, `${inlineScripts.length}개`);

  console.log('\n[9] 상수를 못 불러온 경우 낡은 숫자를 조용히 보여주지 않는가 (결함 생성기 ②)');
  const noLimits = await bootManual({ withLimits: false });
  const nd = noLimits.window.document;
  ok('문서 맨 위에 확인하지 못했다고 알린다',
    /확인하지 못했습니다/.test(nd.querySelector('main').textContent));
  ok('무엇이 문제인지 바닥글에도 남는다', /limits\.js/.test(nd.getElementById('fact-src').textContent));
  noLimits.window.close();
  mdom.window.close();

  console.log('\n[10] 화면의 메뉴가 매뉴얼에 다 있는가 (WT)');
  /* WE에서 세운 규칙: **화면과 문서가 다른 이름을 쓰면 팀원이 없는 메뉴를 찾는다.**
     그때 메뉴 하나가 둘로 갈렸고 매뉴얼도 함께 갈랐는데, 그 대조를 사람이 했다.
     메뉴는 앞으로도 늘고 갈린다 — 그때마다 사람이 세지 않게 여기서 센다.
   ⚠ 반대 방향(매뉴얼에만 있는 이름)은 세지 않는다. 매뉴얼은 「예전에는 「A」였는데
     이제 「B」입니다」처럼 **옛 이름을 일부러 설명한다** — 그것까지 결함이라 부르면
     없는 결함을 만든다(실제로 「패키지 · 소규모 견적」이 그렇게 걸렸다). */
  const adminDoc = new JSDOM(read('admin.html')).window.document;
  const menus = [...adminDoc.querySelectorAll('.sidebar-item .si-label')]
    .map((e) => e.textContent.trim()).filter(Boolean);
  ok('관리자 메뉴를 읽었다 (10개 이상)', menus.length >= 10, menus.length + '개');
  const manualText = read('manual.html').replace(/<!--[\s\S]*?-->/g, '');
  const missingMenus = menus.filter((m) => !manualText.includes(m));
  ok('🔴 모든 메뉴가 매뉴얼에 나온다', missingMenus.length === 0, JSON.stringify(missingMenus));

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

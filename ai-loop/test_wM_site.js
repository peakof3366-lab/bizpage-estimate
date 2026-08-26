/* ═══════════════════════════════════════════════════════════════════════════
   WM — 화면이 **고객에게 실제로 보이는가**를 지키는 그물

   ■ 🔴 이 검사가 생긴 이유

   이 저장소의 검사 4,800여 건은 **견적 계산**을 아주 촘촘히 본다. 그런데 「화면을
   열었을 때 보이는가」를 보는 것이 하나도 없었다. 그 사이에 **홈 화면의 고객사 로고
   2건이 아무에게도 안 보이고 있었다** — `http://`로 실려 있어 https 페이지에서
   혼합 콘텐츠로 **브라우저가 차단**한다.

   ⚠ 그리고 이것이 조용했던 이유가 중요하다: `onerror`가 자리를 접어 주기 때문에
     **깨져 보이지도 않는다.** 화면은 멀쩡해 보이고 로고만 없다. 조용한 폴백
     (결함 생성기 ②)이 코드가 아니라 **화면에서** 재현된 자리다.

   ■ 이 검사가 지키는 것

     ① 훑기 도구(`audit_site.js`)의 정적 검사가 **오류 0건**이다
        — 새 `http://` 자원, 없는 파일, 배포에서 빠지는 파일이 들어오면 여기서 걸린다
     ② 🔴 `xmlns="http://www.w3.org/2000/svg"`를 **자원으로 세지 않는다**
        — 고치면 SVG가 깨진다. 없는 결함을 만들지 않는 것이 이 저장소의 반복된 교훈이다
     ③ 일부러 망가진 입력을 넣으면 **실제로 잡는다**(결함 생성기 ③)

   ⚠ 네트워크를 타지 않는다. 프로덕션 확인은 `node ai-loop/audit_site.js --prod`가 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const A = require(path.join(__dirname, 'audit_site.js'));

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 홈페이지 정적 훑기 — 오류 0건이어야 한다');
{
  const s = A.staticAudit();
  ok('① 페이지를 6개 이상 훑는다', s.files.length >= 6, s.files.length + '개');
  ok('① 🔴 오류 0건', s.errors.length === 0,
    s.errors.map((e) => '[' + e.page + '] ' + e.kind + ' ' + e.detail).join(' | '));
  /* 참고(링크 http)는 오류가 아니지만 **0이어야 정상**이다 — 지금은 다 고쳤다 */
  ok('① 혼합 콘텐츠 링크도 0건', !s.notes.some((n) => /혼합 콘텐츠/.test(n.kind)),
    s.notes.map((n) => n.detail).join(' | '));
  /* 못 본 것을 「없다」로 세지 않는다 — 몇 건을 건너뛰었는지 말해야 한다 */
  ok('① 정적으로 못 본 참조 수를 센다', typeof s.dynamicSkipped === 'number');
}

console.log('\n[2] 🔴 SVG 네임스페이스를 자원으로 세지 않는다 (없는 결함 금지)');
{
  const refs = A.refsOf('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
  ok('② xmlns는 참조로 안 센다', refs.length === 0, JSON.stringify(refs));
  /* 실제 파일로도 확인한다 — estimate-view에는 xmlns가 7개 들어 있다 */
  const ev = fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8');
  ok('② 실제 페이지에도 xmlns가 있다 (검사가 헛돌지 않는지 확인)',
    (ev.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g) || []).length >= 5);
  ok('② 그래도 그 페이지의 http 자원은 0건',
    !A.staticAudit().errors.some((e) => e.page === 'estimate-view.html'));
}

console.log('\n[3] 합성 입력 — 망가뜨리면 실제로 잡는가');
{
  /* src의 http는 **차단**이다 */
  const bad = A.refsOf('<img src="http://x.com/a.png">');
  ok('③ src http를 참조로 잡는다', bad.length === 1 && /^http:/.test(bad[0].val));
  /* 코드로 만들어지는 주소는 「모른다」로 갈린다 — 「없다」가 아니다 */
  const dyn = A.refsOf('<img src="\' + esc(p.imageUrl) + \'">');
  ok('③ 코드로 만드는 주소는 dynamic으로 갈라 둔다', dyn.length === 1 && dyn[0].dynamic === true);
  /* 배포 제외 규칙 */
  const rules = A.ignoreRules();
  ok('③ ai-loop/ 는 배포에서 빠지는 것으로 본다', A.ignoredBy('ai-loop/x.js', rules));
  ok('③ *.md 도 마찬가지', A.ignoredBy('README.md', rules));
  ok('③ 🔴 script.js 는 빠지지 않는다', !A.ignoredBy('script.js', rules));
  ok('③ 한글 폴더(이미지/)도 빠지지 않는다', !A.ignoredBy('이미지/world-map.svg', rules));
  /* 바깥/안쪽 판정 */
  ok('③ //cdn.example 은 바깥이다', A.isExternal('//cdn.example.com/a.js'));
  ok('③ #anchor 는 파일이 아니다', !A.isLocal('#top'));
  ok('③ styles.css 는 로컬이다', A.isLocal('styles.css'));
}

console.log('\n[4] 검색엔진 · 공유 미리보기 — 목록을 손으로 적지 않는다');
{
  const s = A.staticAudit();
  /* 🔴 「어느 페이지가 공개인가」의 진실은 sitemap.xml 하나다.
     사이트맵에 있으면 공유 카드가 있어야 하고, 없으면 색인되면 안 된다.
     새 페이지를 만들면 둘 중 하나를 반드시 하게 된다 — 목록이 흩어지지 않는다. */
  ok('④ 공개 페이지를 sitemap.xml에서 읽는다', (s.publicPages || []).length >= 2,
    JSON.stringify(s.publicPages));
  ok('④ index.html이 공개다', (s.publicPages || []).includes('index.html'));
  ok('④ packages.html이 공개다', (s.publicPages || []).includes('packages.html'));

  const p2 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* 🔴 견적서 링크는 인증이 없다(WC) — 색인되면 남의 견적서가 검색에 뜬다 */
  ok('④ 🔴 견적서 화면은 noindex', /name="robots"[^>]*noindex/.test(p2('estimate-view.html')));
  ok('④ 관리자 화면도 noindex', /name="robots"[^>]*noindex/.test(p2('admin.html')));
  ok('④ 담당자 견적 도구도 noindex', /name="robots"[^>]*noindex/.test(p2('admin-quote.html')));

  /* ⚠ 견적서 미리보기에 **견적 내용이 들어가면 안 된다** — 링크를 받은 누구에게나 보인다.
     정적 문구뿐인지 실제 태그를 잘라서 본다(WC에서 연락처를 payload에 안 넣은 것과 같은 결). */
  const og = (p2('estimate-view.html').match(/<meta property="og:[^>]*>/g) || []).join(' ');
  ok('④ 🔴 견적서 미리보기가 정적 문구뿐이다 (금액·고객사 안 들어간다)',
    og.length > 0 && !/\$\{|payload|총액|원 |[0-9]{4,}/.test(og), og.slice(0, 140));

  /* robots.txt가 관리자 주소를 알려주지 않는다 — 공개 문서에 숨길 곳을 적으면 알려주는 꼴 */
  const rb = fs.existsSync(path.join(ROOT, 'robots.txt')) ? p2('robots.txt') : '';
  ok('④ robots.txt가 있다', rb.length > 0);
  ok('④ 🔴 robots.txt가 관리자 주소를 적지 않는다',
    !/^\s*Disallow:.*(admin|estimate-view|manual)/mi.test(rb));
  ok('④ 사이트맵 위치를 알려준다', /Sitemap:\s*https:\/\//i.test(rb));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — WM 홈페이지 훑기`);
process.exit(fail ? 1 : 0);

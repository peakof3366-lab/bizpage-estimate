/* RE 검증: 일정 편집 화면 입력칸 높이를 '내용'이 정한다.

   왜 바꿨나 —
   RC에서 모든 칸을 고정 1.8배로 키웠다(38 → 68px, 66 → 119px). 의도는 "이 화면은 고객
   견적서에 그대로 나가는 문구를 쓰는 곳이라 **쓰는 동안 내용이 다 보여야 한다**"였다.
   그 의도는 옳았지만 고정 높이는 그것을 **양쪽에서** 어겼다:
     · 한 줄짜리 문구("도요타 산업기술기념관 견학")도 119px을 쓴다 → 도쿄 한 목적지가
       세로 10,156px이 됐다(실측). 고칠 일자 하나를 찾으려고 10화면을 스크롤한다.
     · 정작 여섯 줄짜리는 119px에서 잘려 스크롤해야 보인다 → "다 보인다"가 거짓이 된다.
   그래서 높이를 내용이 정하게 했다. 실측 결과 10,156 → 6,708px(-34%), 잘린 칸 0건.

   여기서 고정하는 것:
   ① **숫자를 두 벌 적지 않는다.** 한 줄 높이 하나(--iti-line)에서 input의 높이와
      textarea의 최소 높이가 함께 나온다(결함 생성기 ①).
   ② **'auto'로 재지 않는다.** textarea의 auto 높이는 rows 속성(기본 2줄)이라
      scrollHeight가 그 아래로 안 내려간다 — 한 줄짜리도 두 줄 칸이 된다. 실제로 그렇게
      재서 62px이 나왔고, 0으로 눌러 다시 재고 나서야 40px이 됐다.
   ③ **못 재면 손대지 않는다.** 화면에 안 보이는 동안에는 잴 수 없다(scrollHeight가 0).
      거기서 0px를 박으면 칸이 사라진 것처럼 보인다 — 조용한 폴백 금지(결함 생성기 ②).
      그래서 못 쟀으면 false를 돌려주고 높이를 그대로 둔 뒤, 탭을 열 때 다시 부른다.
   ④ **overflow를 hidden으로 잠그지 않는다.** 자동 높이가 어떤 이유로든 못 돌면 내용이
      소리 없이 잘려 안 보이게 된다. auto면 그때도 스크롤로 읽힌다.
   ⑤ **부르는 자리를 빠뜨리지 않는다.** 다시 그린 뒤·탭을 연 뒤·타이핑할 때·고르기로
      값을 넣을 때 — 한 곳이라도 빠지면 그 경로에서만 높이가 안 맞는다.

   ⚠ '보이는 높이'는 여기서 못 잰다(jsdom은 레이아웃을 계산하지 않는다).
      실제 높이는 `python ai-loop/check_editor_layout.py`가 브라우저로 잰다.

   실행: node ai-loop/test_rE_autogrow.js  (프로젝트 루트에서) */
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

const adminSrc = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
/* 자동 높이 함수 본문만 떼어 본다 — 파일 전체에서 'auto'를 찾으면 아무 데서나 걸린다 */
const growFn = (adminSrc.match(/function itiAutoGrow\s*\([\s\S]*?\n  \}/) || [''])[0];

(async () => {
  /* ── [1] 숫자를 두 벌 적지 않았는가 (①) ────────────────────────────── */
  console.log('[1] 높이 숫자가 한 곳에서만 나오는가 (①)');
  ok('한 줄 높이를 변수 하나로 둔다', /--iti-line:\s*\d+px/.test(adminSrc),
    (adminSrc.match(/--iti-line:[^;]*/) || [''])[0]);
  ok('한 줄 칸이 그 변수를 쓴다', /\.iti-inp \{ height: var\(--iti-line\)/.test(adminSrc));
  ok('여러 줄 칸의 최소 높이도 같은 변수에서 나온다',
    /\.iti-ta\s+\{ min-height: var\(--iti-line\)/.test(adminSrc));
  ok('높이를 px로 다시 적어두지 않았다',
    !/\.iti-inp \{ height: \d+px/.test(adminSrc) && !/\.iti-ta\s+\{ min-height: \d+px/.test(adminSrc));
  /* RC의 고정 배율은 이제 쓰지 않는다. 남겨 두면 "어느 쪽이 진짜인가"가 생긴다. */
  ok('쓰지 않게 된 배율 변수를 남겨 두지 않았다',
    !/--iti-box-scale/.test(adminSrc) && !/--iti-ta-base/.test(adminSrc),
    (adminSrc.match(/--iti-(box-scale|ta-base|inp-base)[^;]*/) || [''])[0]);

  /* ── [2] 'auto' 함정을 밟지 않았는가 (②) ───────────────────────────── */
  console.log("\n[2] 높이를 재는 방법 — 'auto'가 아니라 0으로 누른다 (②)");
  ok('자동 높이 함수를 찾았다', growFn.length > 0);
  ok("재기 전에 0으로 누른다", /style\.height\s*=\s*'0px'/.test(growFn), growFn.slice(0, 200));
  ok("'auto'로 재지 않는다 (rows 기본 2줄에 걸린다)", !/style\.height\s*=\s*'auto'/.test(growFn));
  ok('테두리 두께를 더한다 (box-sizing이 border-box라 빼먹으면 매번 모자란다)',
    /borderTopWidth/.test(growFn) && /borderBottomWidth/.test(growFn) && /scrollHeight \+ border/.test(growFn));

  /* ── [3] overflow를 잠그지 않았는가 (④) ────────────────────────────── */
  console.log('\n[3] 자동 높이가 못 돌아도 내용을 읽을 수 있는가 (④)');
  /* ⚠ 높이를 정하는 규칙만 집는다. 그냥 `.iti-ta {`를 찾으면 바로 위의 공용 규칙
     (`.iti-inp, .iti-ta { … }`)이 먼저 걸려 엉뚱한 블록을 검사한다. */
  const taRule = (adminSrc.match(/\.iti-ta\s+\{[^}]*min-height[^}]*\}/) || [''])[0];
  ok('여러 줄 칸을 overflow:hidden으로 잠그지 않았다', !/overflow:\s*hidden/.test(taRule), taRule);
  ok('넘치면 스크롤로 읽히게 둔다', /overflow-y:\s*auto/.test(taRule), taRule);

  /* ── [4] 부르는 자리가 다 있는가 (⑤) ───────────────────────────────── */
  console.log('\n[4] 높이를 맞추는 자리를 빠뜨리지 않았는가 (⑤)');
  ok('다시 그린 뒤 (날짜별 일정)', /itiRenderState\(\); itiRenderLink\(\); itiAutoGrowAll\(\);/.test(adminSrc));
  ok('다시 그린 뒤 (방식 A·B)', /recRenderState\(\);\s*\n\s*itiRenderLink\(\);\s*\n\s*itiAutoGrowAll\(\);/.test(adminSrc));
  ok('탭을 연 뒤 (숨어 있는 동안에는 잴 수 없다)',
    /if \(name === 'itineraries'\) itiAutoGrowAll\(\);/.test(adminSrc));
  ok('타이핑할 때', /onInput\(inp\.value\); dirty\(\);\s*\n\s*if \(multiline\) itiAutoGrow\(inp\);/.test(adminSrc));
  ok('고르기로 값을 넣을 때 (input 이벤트가 안 난다)',
    /inp\.value = next; onInput\(next\); dirty\(\);\s*\n\s*if \(multiline\) itiAutoGrow\(inp\);/.test(adminSrc));
  ok('폭이 바뀔 때', /addEventListener\('resize'[\s\S]{0,220}itiAutoGrowAll/.test(adminSrc));

  /* ── [5] 실제 동작 ─────────────────────────────────────────────────── */
  console.log('\n[5] 실제로 그렇게 도는가');
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;
  w.__itiSelect('도쿄');

  const tas = Array.from(d.querySelectorAll('#iti-body .iti-ta'));
  ok('여러 줄 칸이 그려졌다', tas.length > 0, String(tas.length));
  const inputs = Array.from(d.querySelectorAll('#iti-body .iti-inp'));
  ok('한 줄 칸도 그려졌다', inputs.length > 0, String(inputs.length));

  /* ③ 못 재는 환경(jsdom은 레이아웃이 없어 offsetParent가 null이다)에서 0px를 박지 않는가.
     이게 실제 위험이다 — 탭이 숨어 있을 때 렌더되면 브라우저에서도 같은 상태가 된다. */
  ok('못 재면 false를 돌려준다', w.itiAutoGrow(tas[0]) === false);
  ok('못 잰 칸의 높이를 건드리지 않는다', tas[0].style.height === '',
    '“' + tas[0].style.height + '” — 0px를 박으면 칸이 사라진 것처럼 보인다');
  ok('다시 그려도 0px가 박히지 않는다',
    Array.from(d.querySelectorAll('#iti-body .iti-ta')).every((t) => t.style.height === ''));
  ok('한 줄 칸에는 애초에 자동 높이를 붙이지 않는다 (키워도 보이는 글자가 늘지 않는다)',
    inputs.every((i) => i.style.height === ''));

  /* 잴 수 있는 상황을 만들어 계산이 맞는지 본다 — 테두리를 빼먹는 실수를 여기서 잡는다 */
  const ta = tas[0];
  Object.defineProperty(ta, 'offsetParent', { get: () => d.body, configurable: true });
  Object.defineProperty(ta, 'scrollHeight', { get: () => 100, configurable: true });
  ta.style.borderTopWidth = '1.5px';
  ta.style.borderBottomWidth = '1.5px';
  ok('잴 수 있으면 true를 돌려준다', w.itiAutoGrow(ta) === true);
  ok('높이 = 내용 + 테두리 (border-box라 테두리를 더해야 딱 맞는다)',
    ta.style.height === '103px', ta.style.height + ' (100 + 1.5 + 1.5을 기대)');

  /* 내용이 줄면 높이도 줄어야 한다 — 늘기만 하면 지운 뒤에도 빈 칸이 그대로 남는다 */
  Object.defineProperty(ta, 'scrollHeight', { get: () => 40, configurable: true });
  w.itiAutoGrow(ta);
  ok('내용이 줄면 높이도 줄어든다', ta.style.height === '43px', ta.style.height);

  /* 타이핑 경로가 실제로 자동 높이를 부르는가 — 위에서 소스로 확인했지만,
     붙는 자리가 itiField 한 곳이라 실제 이벤트로도 확인해 둔다(결함 생성기 ③). */
  Object.defineProperty(ta, 'scrollHeight', { get: () => 77, configurable: true });
  ta.value = '여러\n줄\n입력';
  ta.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('타이핑하면 높이가 따라온다', ta.style.height === '80px', ta.style.height);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.itiAutoGrow = itiAutoGrow;
  window.itiAutoGrowAll = itiAutoGrowAll;
  window.__itiSelect = (k) => { itiState.dirty = false; itiSelectDest(k); };
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

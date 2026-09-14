/* ═══════════════════════════════════════════════════════════════════════════
   ZZ — 쪼갠 관리자 화면이 **실제로 돌아가는가** (구조 정리 2b의 안전망)

   ■ 왜 이 파일이 생겼나 — 2026-09-14에 안전망이 비어 있는 것을 발견했다

   2b-1a에서 공용 선언 74줄을 `admin/common.js`로 옮긴 뒤, 그것을 **빈 파일로 바꿔
   놓고** 검사를 전부 돌려 봤다. 결과:

     · JS 검사    → 92개 크래시  ✅ (`_admin_source`의 「조각이 비었다」 가드가 일한다)
     · 🔴 진짜 브라우저(`check_admin_screens.py`) → **🔴 0곳 · ⚠ 164곳, 깨지기 전과 완전히 동일**

   즉 `esc`·`KEYS`·`get`·`set`이 전부 사라져 화면 JS가 죽은 상태인데 **브라우저 검사가
   통과했다.** 그 검사는 글자 크기·색·밀림 같은 **정지된 모양**을 재기 때문이다 —
   마크업은 JS가 죽어도 그대로 있다.

   🔴 **그래서 「쪼갰는데 통과했다」가 거짓 안심이었다.** 2b-3에서 화면 16개를 옮길 때
     로드 순서 하나만 어긋나도 아무도 말해 주지 않는 상태였다.
     (이것이 1-B의 남은 항목 ②가 필요하다고 적어 둔 바로 그 자리다.)

   ■ 이 검사가 지키는 것

     ① 쪼갠 조각(`ADMIN_PARTS`의 .js)이 전부 `<script src>`로 실려 있다
     ② 🔴 조각 로더가 인라인 `<script>`보다 **앞**에 있다 — 뒤면 선언이 늦어 죽는다
     ③ 조각 파일이 비어 있지 않다
     ④ 🔴 **정말로 띄워서** 공용 선언이 살아 있는지 본다(글자가 아니라 실행이다)
     ⑤ 공용 도구가 **동작**한다 — esc가 이스케이프하고, KEYS·REGION_MAP이 값을 준다
     ⑥ 🔴 `... is not defined`가 하나도 없다 — TDZ·로드 순서 결함이 잡히는 자리

   ■ ⚠ ⑥이 할 수 있는 일의 한계 — 실측으로 확인했다
     2026-09-14에 두 가지로 무너뜨려 봤다: ① common.js를 비우기 ② `esc` 한 줄만 지우기.
     ④⑤는 둘 다 잡았는데(5 fail · 2 fail) **⑥은 두 번 다 통과했다.**
     띄우는 시점에는 로그인 화면만 그려져서, `esc`를 쓰는 화면 코드가 **아직 안 돌기**
     때문이다. 즉 ⑥은 「로드 중에 터지는 것」만 본다 — 화면을 눌러야 나오는 결함은
     ④⑤의 이름 목록으로 잡는다. 🔴 ⑥이 통과했다고 안심하지 말 것.

   ■ ⚠ 이 검사를 못 믿게 되는 길 (다음 사람에게)
     조각을 늘렸는데 `COMMON`에 아무것도 안 더하면, 이 검사는 **늘어난 부분을 안 본다.**
     화면을 옮길 때는 그 화면이 쓰는 이름 한둘을 여기 ④에 같이 넣는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { ADMIN_PARTS } = require('./_admin_source');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZZ 쪼갠 관리자 화면이 실제로 도는가`);
  process.exit(fail ? 1 : 0);
};

/* 띄운 화면에 살아 있어야 하는 공용 이름들.
   ⚠ 화면을 새로 떼어낼 때마다 그 화면이 쓰는 이름을 여기 한둘 더한다. */
const COMMON = ['esc', 'get', 'getO', 'set', 'safeId', 'KEYS', 'PAGE_SIZE',
                'fmtDate', 'REGION_MAP', 'REGION_ORDER', 'currentTab',
                /* 2b-2 대장 화면 */ 'renderLedger', 'ledDraw', 'LED_STATUS'];

/* jsdom 환경 자체가 못 주는 것 — 이것만 예외로 둔다.
   ⚠ 목록을 늘릴 때는 반드시 이유를 적을 것. 여기에 이름을 넣는 것은
     「이 오류는 우리 결함이 아니다」라고 선언하는 일이다. */
const ENV_ALLOWED = [
  'fetch is not defined',      /* jsdom에 fetch가 없다 — 브라우저에는 있다 */
];

(async () => {
  const src = read('admin.html');
  const jsParts = ADMIN_PARTS.filter((f) => f.endsWith('.js'));

  console.log('\n■ ① 쪼갠 조각이 화면에 실려 있나  (조각 ' + jsParts.length + '개)');
  for (const f of jsParts) {
    ok('① <script src="' + f + '">가 있다', src.includes('src="' + f + '"'));
  }

  console.log('\n■ ② 🔴 로더가 인라인 <script>보다 앞인가');
  const inlineAt = src.indexOf('\n<script>\n');
  ok('② 인라인 <script>를 찾았다', inlineAt > 0);
  for (const f of jsParts) {
    const at = src.indexOf('src="' + f + '"');
    ok('② ' + f + '이(가) 인라인보다 앞에 있다', at > 0 && at < inlineAt,
      'src ' + at + ' vs 인라인 ' + inlineAt);
  }

  console.log('\n■ ③ 조각이 비어 있지 않나');
  for (const f of jsParts) {
    const body = read(f).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    ok('③ ' + f + '에 주석 말고 내용이 있다', body.length > 50, body.length + '자');
  }

  console.log('\n■ ④⑤⑥ 🔴 진짜로 띄워 본다');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push(String((e && e.message) || e).split('\n')[0]));

  let win = null;
  try {
    const dom = await JSDOM.fromFile(path.join(ROOT, 'admin.html'), {
      runScripts: 'dangerously', resources: 'usable',
      virtualConsole: vc, pretendToBeVisual: true,
    });
    await new Promise((r) => setTimeout(r, 1500));
    win = dom.window;
  } catch (e) {
    ok('④ 화면이 떠야 한다', false, e.message);
    done();
  }
  ok('④ 화면이 떴다', !!win);

  const missing = COMMON.filter((n) => {
    try { return win.eval('typeof ' + n) === 'undefined'; } catch (e) { return true; }
  });
  ok('④ 🔴 공용 선언 ' + COMMON.length + '개가 전부 살아 있다',
    missing.length === 0, '없는 것: ' + missing.join(', '));

  const tryEval = (code) => { try { return win.eval(code); } catch (e) { return '⚠' + e.message; } };
  ok('⑤ esc가 실제로 이스케이프한다', tryEval("esc('<b>')") === '&lt;b&gt;', String(tryEval("esc('<b>')")));
  ok('⑤ KEYS가 값을 준다', tryEval('KEYS.est') === 'linkedt_estimates', String(tryEval('KEYS.est')));
  ok('⑤ REGION_MAP이 목적지를 담고 있다',
    Number(tryEval('Object.keys(REGION_MAP).length')) > 40, String(tryEval('Object.keys(REGION_MAP).length')));

  const real = errs.filter((e) => !ENV_ALLOWED.some((a) => e.includes(a)))
                   .filter((e) => /is not defined|is not a function|Cannot read/.test(e));
  ok('⑥ 🔴 로드 순서·TDZ 결함이 없다 (…is not defined 0건)',
    real.length === 0, real.slice(0, 3).join(' | '));

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

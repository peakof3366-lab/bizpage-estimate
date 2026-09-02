/* ═══════════════════════════════════════════════════════════════════════════
   VM — 엔진 부팅 단일 출처 · 사양 손잡이 · 문서 신호 회귀 검사
   ───────────────────────────────────────────────────────────────────────────
   무엇을 지키는가:
     ① 엔진 부팅이 **한 곳**에서 온다 (네트워크 차단·운영 요율 얹기를 한 벌만 빠뜨려도
        그 도구만 조용히 다른 것을 잰다)
     ② 손잡이를 안 주면 **매번 기본값으로 되돌린다** (앞 호출이 다음 여행을 오염시키지 않는다)
     ③ 없는 손잡이 값을 주면 **조용히 넘어가지 않고 죽는다**
     ④ 문서 신호 탐지기가 **헛돌지 않는다** — 실제로 걸리고, 넓게 잡지 않는다
     ⑤ 부정 결과가 코드에 남아 있다 (지우면 같은 가설을 다시 세운다)

   ⚠ ②·③은 **엔진을 실제로 띄워** 확인한다. 소스만 읽고 끝내면 그게 결함 생성기 ③이다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const AI = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const src = (f) => fs.readFileSync(path.join(AI, f), 'utf8');

const BOOT = require('./_engine_boot');
const CACHE = require('./_corpus_cache');

console.log('\n[1] 엔진 부팅이 한 곳에서 온다');
{
  const boot = src('_engine_boot.js');
  ['backtest_quotes.js', 'audit_error_decomp.js', 'audit_spec_knobs.js'].forEach((f) => {
    const s = src(f);
    ok('① ' + f + ' 가 _engine_boot을 쓴다', /require\(['"]\.\/_engine_boot['"]\)/.test(s));
    /* ⚠ 제 부팅 코드를 다시 들면 갈라진다 — jsdom을 직접 부르는 자리가 있으면 안 된다 */
    ok('① ' + f + ' 가 jsdom을 직접 띄우지 않는다', !/new JSDOM\(/.test(s));
  });
  /* 한 벌만 빠뜨려도 그 도구만 조용히 다른 것을 재는 세 가지 */
  /* ⚠ XI에서 갈래가 하나 생겼다 — `opts.ratesResponse`를 주면 `/api/rates`만
     **주입한 값으로** 답한다(「요율을 못 받은 브라우저」를 재려면 그 경로가 검사
     대상이라서다). 그건 네트워크가 아니라 우리가 넣은 값이고, **나머지는 그대로
     영원히 안 오는 약속**이다. 그래서 기본 갈래를 그대로 잰다. */
  ok('① 네트워크를 막는다',
    /window\.fetch = \(url\) =>/.test(boot) && /return new Promise\(\(\) => \{\}\);/.test(boot));
  ok('① 갈라 준 요율 응답도 네트워크를 안 탄다',
    /o\.ratesResponse === 'fail'/.test(boot) && !/fetch\(['"]https?:/.test(boot));
  ok('① 운영 요율을 얹는다', /applyOverrides\(window\.__DR/.test(boot));
  /* 🔴 주입 모드에서는 **수동으로 또 얹지 않는다** — 두 번 얹으면 무엇을 쟀는지 모른다 */
  ok('① 주입 모드에서는 두 번 얹지 않는다', /selfLoad\s*\?/.test(boot) && /const selfLoad = /.test(boot));
  ok('① rec_fallbacks.js를 함께 eval한다', BOOT.APP_FILES.includes('rec_fallbacks.js'),
    BOOT.APP_FILES.join(','));
  ok('① 합치는 순서가 CLAUDE.md 그대로다',
    BOOT.APP_FILES.join(',') === 'data.js,company-info.js,rec_fallbacks.js,script.js',
    BOOT.APP_FILES.join(','));
}

console.log('\n[2] 기본 손잡이가 화면의 checked와 같다');
{
  const html = fs.readFileSync(path.join(AI, '..', 'index.html'), 'utf8');
  /* ⚠ 기본값이 화면과 어긋나면 「고객이 아무것도 안 건드렸을 때의 금액」이 아니게 된다.
     ⚠ **손잡이가 두 종류다**(YH). 등급·좌석·객실은 라디오(`name=... value=...`)이고,
       포함 여부(`incHotel`…)는 **체크박스**(`id=... checked`)다. 예전에는 라디오만
       있어서 한 가지 모양만 봤는데, 휴양(차량·가이드 끔)을 재려고 포함 다섯을
       손잡이로 열면서 종류가 갈렸다. 모양을 안 가르면 체크박스 다섯이 전부 ✗로 나온다. */
  Object.keys(BOOT.SPEC_DEFAULTS).forEach((name) => {
    const v = BOOT.SPEC_DEFAULTS[name];
    const flat = html.replace(/\s+/g, ' ');
    const re = typeof v === 'boolean'
      ? new RegExp('id="' + name + '"[^>]*' + (v ? 'checked' : ''))
      : new RegExp('name="' + name + '" value="' + v + '" checked');
    ok('② ' + name + ' 기본이 ' + v + ' (화면과 같다)', re.test(flat));
  });
}

console.log('\n[3] 문서 신호 탐지기가 헛돌지 않는다');
{
  const cc = src('_corpus_cache.js');
  ok('③ 캐시 판을 올렸다 (9 이상)', CACHE.CACHE_VERSION >= 9, String(CACHE.CACHE_VERSION));
  ok('③ specHints를 싣는다', /specHints: specHintsOf\(r\.text\)/.test(cc));
  /* ⚠ **넓게 잡으면 신호가 소음이 된다.** 「비즈니스」 한 낱말로 잡으면 「비즈니스 미팅」·
     「비즈니스 센터」가 전부 걸린다. 좌석/객실을 가리키는 말만 보는지 확인한다. */
  const bizRe = (cc.match(/const BUSINESS_RE = (\/.*\/i);/) || [])[1];
  ok('③ 비즈니스 패턴이 좌석을 가리키는 말만 본다', !!bizRe && /석|클래스|class/.test(bizRe), bizRe);
  {
    /* 일부러 걸리는 입력과 안 걸리는 입력을 넣어 본다 — 만들어만 두고 안 도는 안전망 방지 */
    const evalRe = (s) => { const m = s.match(/^\/(.*)\/([a-z]*)$/); return new RegExp(m[1], m[2]); };
    const B = evalRe(bizRe);
    ok('③ 「비즈니스석」은 걸린다', B.test('왕복 항공 비즈니스석 2매'));
    ok('③ 「비즈니스 클래스」는 걸린다', B.test('항공 비즈니스 클래스'));
    ok('③ 「비즈니스 미팅」은 안 걸린다', !B.test('현지 비즈니스 미팅 진행'), '오탐');
    ok('③ 「비즈니스 센터」는 안 걸린다', !B.test('호텔 비즈니스 센터 이용'), '오탐');
    const sRe = (cc.match(/const SINGLE_RE = (\/.*\/i);/) || [])[1];
    const S = evalRe(sRe);
    ok('③ 「1인1실」은 걸린다', S.test('디럭스룸 1인1실_조식포함'));
    ok('③ 「싱글차지」는 걸린다', S.test('싱글차지 별도'));
    ok('③ 「2인1실」만 있으면 안 걸린다', !S.test('스탠다드 2인1실 기준'), '오탐');
  }
  /* ⚠ 본문을 못 얻으면 **null**이다. false로 채우면 「없다」로 읽혀,
     「문서가 말 안 한다」와 「못 읽었다」가 같은 얼굴이 된다(결함 생성기 ②). */
  ok('③ 본문이 없으면 null이다 (false로 채우지 않는다)',
    /if \(!t\) return null;/.test(cc));
}

console.log('\n[4] 부정 결과가 코드에 남아 있다');
{
  const s = src('audit_spec_knobs.js');
  /* ⚠ 이 도구의 「28/36」만 옮겨 적으면 과적합을 진전으로 읽게 된다.
     그래서 **기각됐다는 사실과 그 근거**가 파일에 남아 있어야 한다. */
  ok('④ 가설이 기각됐다는 것이 적혀 있다', /가설이 기각됐다/.test(s));
  ok('④ 문서 뒷받침이 0건이라는 근거가 적혀 있다', /0\/11건/.test(s));
  ok('④ 「비즈니스」 낱말이 코퍼스에 0건임이 적혀 있다', /0건/.test(s) && /비즈니스석/.test(s));
  ok('④ 문서대로 넣으면 나빠진다는 것이 적혀 있다', /7 → 3건/.test(s));
  ok('④ 상한이지 달성치가 아니라고 말한다', /상한이지 달성치가 아니/.test(s));
  /* 화면도 그렇게 말해야 한다 — 주석에만 있으면 표를 읽는 사람은 모른다 */
  ok('④ 화면이 뒷받침 건수를 함께 찍는다', /문서가 뒷받침하는 fit/.test(s));
  ok('④ 나빠지면 나빠졌다고 찍는다', /🔴 \*\*나빠졌다/.test(s));
}

/* ── ⑤ 실제로 띄워 본다 ───────────────────────────────────────────────── */
(async () => {
  console.log('\n[5] 손잡이 — 되돌아오는가 · 없는 값은 죽는가 (엔진을 실제로 띄운다)');
  try {
    const { run } = await BOOT.bootEngine({ quiet: true });
    const trip = { dest: '푸꾸옥', pax: 36, days: 5, date: '2026-10-11' };

    const base = run(trip).perPerson;
    const biz = run(trip, { cabinClass: 'business' }).perPerson;
    ok('⑤ 비즈니스로 돌리면 올라간다', biz > base, base + ' → ' + biz);

    /* ⚠ 핵심 — 손잡이를 안 주면 **기본값으로 되돌아와야** 한다.
       안 되돌아오면 앞 여행의 사양으로 다음 여행을 재게 되고, 표 전체가 조용히 오염된다. */
    const again = run(trip).perPerson;
    ok('⑤ 손잡이를 안 주면 기본값으로 되돌아온다', again === base, base + ' vs ' + again);

    const single = run(trip, { roomConfig: 'single' }).perPerson;
    ok('⑤ 1인1실로 돌리면 올라간다', single > base);
    ok('⑤ 그 다음도 오염되지 않았다', run(trip).perPerson === base);

    /* 골프를 켰다 끄면 수치도 함께 되돌아와야 한다 */
    run(trip, { golf: true, golfRounds: 2 });
    ok('⑤ 골프를 끄면 되돌아온다', run(trip).perPerson === base);

    /* ⚠ 없는 값을 조용히 넘기면 「그 손잡이를 돌렸다」고 믿으면서 기본값으로 잰다 */
    let threw = false;
    try { run(trip, { hotelGrade: '없는등급' }); } catch (e) { threw = /손잡이 값이 없다/.test(e.message); }
    ok('⑤ 없는 손잡이 값은 그 자리에서 죽는다', threw);
  } catch (e) {
    fail++;
    console.log('  ✗ ⑤ 엔진을 띄우지 못했다 → ' + e.message);
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

/* ═══════════════════════════════════════════════════════════════════════════
   YT — **대표가 채운 출발일이 아무 데도 안 닿고 있었다** + 일괄 투입 리포트
   ───────────────────────────────────────────────────────────────────────────
   ■ 🔴 만들다가 찾은 것 — 이게 이 커밋에서 가장 큰 건이다

   `corpus_manual.json`에 사람이 채우는 출발일이 **소비자가 안 읽는 칸**에 들어가고 있었다:

       추출기가 만드는 이름      dates.departDate    ← 도구 여섯이 전부 이 이름을 읽는다
       손으로 채운 값이 가던 곳   dates.depart        ← **아무도 안 읽는다**

   그래서 대표가 값을 채우면:
       `fromHuman: ["depart"]`로 **「받았다」고 찍히고**
       `dates.departDate`는 **여전히 null**
       그 견적서는 계속 「출발일 불명」으로 표본에서 빠진다

   재현해서 확인했다(굿리치 후아힌에 2026-11-19를 넣어 봄 → departDate가 null이었다).
   🔴 **대기열 0-f에서 대표께 요청한 「출발 연도 2건」이 정확히 이 상태였다** —
     채우셔도 표본이 안 늘었을 것이다.
   ⚠ XZ에서 「대표가 환율을 넣어도 채점표에 안 닿는다」를 고쳤는데, **같은 종류가
     날짜 쪽에 남아 있었다.** 그래서 이 검사는 「이름이 같은가」를 구조로 잠근다.

   ■ 리포트 — 이미 내려진 판정을 **모아 세울 뿐** 새로 재지 않는다
     커버리지(YS) · 다도시(TF) · 골프(YD) · 중복(VA)
     줄 세우기는 대표 방침 그대로 **「틀린 값」(🔴)이 「빈칸」(🟡)보다 위**다.

   🔴 잠그는 것 다섯:
     ① 손으로 채운 출발일이 **소비자가 읽는 이름**으로 들어간다
     ② 🔴 **쓰는 이름과 읽는 이름이 실제로 같다** — 파일을 훑어 확인한다
     ③ 틀린 값(🔴)이 빈칸(🟡)보다 위로 선다
     ④ 리포트가 판정을 **다시 하지 않는다**(문턱 숫자를 자기가 안 들고 있다)
     ⑤ 지난 기록이 없으면 「전부 새 것」이라고 **말한다**(조용히 0건이 아니다)

   실행: node ai-loop/test_yT_intake_report.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { reasons } = require('./report_intake.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — YT 손으로 채운 출발일이 닿는가`);
  process.exit(fail ? 1 : 0);
};
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const 주석없이 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n[1] 🔴 ① 손으로 채운 출발일이 소비자가 읽는 이름으로 들어간다');
{
  const src = 주석없이(read('ai-loop/_corpus_cache.js'));
  ok('🔴 ① `dates.departDate`에 넣는다',
    /dates\.departDate\s*=\s*손일정\.depart/.test(src),
    (src.match(/손일정\.depart[^;]{0,40}/) || ['(못 찾음)'])[0]);
  ok('🔴 ① 아무도 안 읽는 `dates.depart`에 넣지 않는다',
    !/dates\.depart\s*=\s*손일정/.test(src));
  ok('① 귀국일도 같은 규칙이다', /dates\.returnDate\s*=\s*손일정\.return/.test(src));
  /* 출처를 남긴다 — 나중에 「이 날짜가 문서에서 온 것인가」를 물을 수 있어야 한다 */
  ok('① 사람이 준 값이라고 표시한다',
    /departVia\s*=\s*'manual'/.test(src) && /fromHuman\.push\('depart'\)/.test(src));
}

console.log('\n[2] 🔴 ② 쓰는 이름과 읽는 이름이 실제로 같다 — 파일을 훑는다');
{
  /* 🔴 이게 이 검사의 핵심이다. 위 [1]은 「지금 이렇게 적혀 있다」이고,
     여기는 **「그 이름을 정말 누가 읽는가」**다. 둘이 갈리면 값이 조용히 버려진다. */
  const 파일들 = fs.readdirSync(path.join(ROOT, 'ai-loop'))
    .filter((f) => f.endsWith('.js') && f !== '_corpus_cache.js' && !f.startsWith('test_'));
  const 읽는곳 = [], 짧은이름읽는곳 = [];
  for (const f of 파일들) {
    const s = 주석없이(read(path.join('ai-loop', f)));
    if (/dates\s*&&\s*\w*\.?dates\.departDate|\.dates\.departDate/.test(s)) 읽는곳.push(f);
    /* `dates.depart` 뒤에 Date/Via/Why가 안 붙는 **맨 이름**만 찾는다 */
    if (/\.dates\.depart(?![A-Za-z])/.test(s)) 짧은이름읽는곳.push(f);
  }
  ok('🔴 ② `departDate`를 읽는 도구가 여럿이다', 읽는곳.length >= 4,
    읽는곳.length + '개: ' + 읽는곳.slice(0, 6).join(', '));
  ok('🔴 ② 맨 이름 `dates.depart`를 읽는 곳은 없다', 짧은이름읽는곳.length === 0,
    짧은이름읽는곳.join(', '));
}

console.log('\n[3] 🔴 ③ 틀린 값(🔴)이 빈칸(🟡)보다 위로 선다');
{
  const 덜읽음 = reasons({ cov: { known: true, verdict: 'low', ratio: 0.003 }, dest: { key: '나트랑' }, perPerson: 1, dates: { departDate: '2026-01-01' } });
  ok('③ 덜 읽은 것은 🔴이다', 덜읽음.red.length === 1 && 덜읽음.yellow.length === 0,
    JSON.stringify(덜읽음));
  ok('③ 몇 %인지 말한다', /0%/.test(덜읽음.red[0]), 덜읽음.red[0]);

  const 두번셈 = reasons({ cov: { known: true, verdict: 'high', ratio: 2.02 }, dest: { key: '아오모리' }, perPerson: 1, dates: { departDate: 'x' } });
  ok('③ 두 번 센 것도 🔴이다', /202%/.test((두번셈.red[0] || '')), JSON.stringify(두번셈.red));

  const 다도시 = reasons({ cov: { known: true, verdict: 'ok', ratio: 1 }, multiCity: true, stays: ['a', 'b', 'c'], dest: { key: '후쿠오카' }, perPerson: 1, dates: { departDate: 'x' } });
  ok('🔴 ③ 여러 곳에서 묵는 것은 🔴이다', /3곳/.test(다도시.red[0] || ''), JSON.stringify(다도시.red));

  const 정답지없음 = reasons({ cov: { known: true, verdict: 'ok', ratio: 1 }, dest: { key: '발리' }, dates: { departDate: 'x' } });
  ok('③ 정답지 없음은 🟡이다(금액이 틀리는 게 아니다)',
    정답지없음.red.length === 0 && /정답지가 없다/.test(정답지없음.yellow[0] || ''),
    JSON.stringify(정답지없음));

  const 목적지없음 = reasons({ cov: { known: true, verdict: 'ok', ratio: 1 }, perPerson: 1, dates: { departDate: 'x' } });
  ok('🔴 ③ 목적지를 못 정한 것은 🔴이다 — 어느 요율에 얹힐지 모른다',
    /목적지를 못 정했다/.test(목적지없음.red[0] || ''), JSON.stringify(목적지없음.red));

  const 깨끗 = reasons({ cov: { known: true, verdict: 'ok', ratio: 1 }, dest: { key: '도쿄' }, perPerson: 1, dates: { departDate: 'x' } });
  ok('③ 멀쩡한 문서는 아무것도 안 걸린다', 깨끗.red.length === 0 && 깨끗.yellow.length === 0,
    JSON.stringify(깨끗));
}

console.log('\n[4] 🔴 ④ 리포트가 판정을 다시 하지 않는다');
{
  const src = 주석없이(read('ai-loop/report_intake.js'));
  /* 🔴 문턱 숫자를 자기가 들고 있으면 `plausibility`·`pdf_extract`와 어긋난다.
     리포트는 `verdict`·`multiCity` 같은 **이미 내려진 판정만** 읽어야 한다. */
  ok('🔴 ④ 커버리지 문턱(0.5 등)을 자기가 안 들고 있다',
    !/0\.5|LOW_COVERAGE\s*=/.test(src), (src.match(/0\.5[^;]{0,20}/) || [''])[0]);
  ok('🔴 ④ 다도시 문턱(3곳)을 자기가 안 세지 않는다',
    !/stays[^;]{0,30}length\s*>=\s*\d/.test(src));
  ok('④ 내려진 판정을 읽는다', /verdict === 'low'/.test(src) && /r\.multiCity/.test(src));
}

console.log('\n[5] ⑤ 지난 기록이 없으면 「전부 새 것」이라고 말한다');
{
  const src = 주석없이(read('ai-loop/report_intake.js'));
  ok('⑤ 기록이 없으면 seen을 null로 둔다', /catch \(e\) \{ seen = null; \}/.test(src));
  ok('🔴 ⑤ 그 사실을 화면에 말한다', /전부 새 것/.test(read('ai-loop/report_intake.js')));
  /* 상태 파일은 이 PC 값이라 저장소에 들어가면 안 된다 */
  ok('⑤ 상태 파일이 gitignore에 있다', /intake_seen/.test(read('.gitignore')));
}

done();

/* TC 검증 — **견적서에서 읽은 일정이 있으면 그것만 고객에게 나간다**

   대표 요청(2026-08-11): 「온라인에서 가져온 정보로 만들어진 추천 일정표는 사용이
   불가능한 경우가 많다. 일정표가 업데이트된 지역은 해당 내용으로, 아직 한 곳도
   업데이트가 안 된 곳은 온라인 정보로.」

   규칙은 딱 하나다:
     그 목적지의 코스 중 source==='quote'가 **하나라도 있으면 → 그것들만**
     하나도 없으면                                    → 있는 그대로(온라인 기본값)

   ⚠ **고르는 자리는 rec_fallbacks.js 한 곳이다.** 고객 견적서 · 일정 탐색 · 관리자
     미리보기가 전부 이 함수를 지난다. 화면마다 따로 거르면 **견적서와 일정 탐색이
     서로 다른 일정을 보여준다** — 이 저장소가 RR에서 정확히 그 사고를 겪었다.
   ⚠ **서버가 코스 필드를 화이트리스트로 거른다.** `source`를 거기 안 적으면 저장 때
     조용히 사라지고, 고객은 계속 온라인 일정을 본다(결함 생성기 ②).
   ⚠ **지우지 않는다.** 온라인 코스는 남아 있고 화면에만 안 나온다 — 견적서 코스를
     지우면 자동으로 다시 온라인 코스가 나간다(되돌릴 수 있어야 한다).

   실행: node ai-loop/test_tC_quote_itinerary.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const R = require('../rec_fallbacks.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const online = (t) => ({ title: t, subtitle: '', highlights: [], days: [{ day: 1, title: '', am: '', pm: '', eve: '', tip: '' }] });
const fromQuote = (t) => Object.assign(online(t), { source: 'quote', sourceNote: '견적서 PDF에서 읽은 일정 (5일)' });

/* ── [1] 고르는 규칙 ─────────────────────────────────────────────────── */
console.log('[1] 무엇이 고객에게 나가는가');
const onlyOnline = [online('온라인 A'), online('온라인 B'), online('온라인 C')];
ok('견적서 일정이 없으면 온라인 코스가 그대로 나간다',
  R.recPreferQuoteCourses(onlyOnline).length === 3);

const mixed = [online('온라인 A'), online('온라인 B'), fromQuote('견적서 일정')];
const picked = R.recPreferQuoteCourses(mixed);
ok('**견적서 일정이 하나라도 있으면 그것만 나간다**', picked.length === 1, String(picked.length));
ok('그 하나가 견적서 코스다', picked[0].title === '견적서 일정');
ok('온라인 코스를 **지우지는 않는다** (원본은 그대로)', mixed.length === 3);

const twoQuotes = [online('온라인'), fromQuote('견적서 1'), fromQuote('견적서 2')];
ok('견적서 코스가 둘이면 둘 다 나간다', R.recPreferQuoteCourses(twoQuotes).length === 2);

ok('이 목적지가 견적서 일정으로 나가는지 물어볼 수 있다',
  R.recHasQuoteCourses(mixed) === true && R.recHasQuoteCourses(onlyOnline) === false);

/* 빈 값·이상한 값에 손대지 않는다 — 「코스가 없다」와 「전부 걸러졌다」는 다른 상태다 */
ok('빈 배열은 그대로 돌려준다', R.recPreferQuoteCourses([]).length === 0);
ok('배열이 아니면 그대로 돌려준다', R.recPreferQuoteCourses(null) === null);
ok('source가 다른 문자열이면 온라인으로 본다',
  R.recPreferQuoteCourses([online('a'), Object.assign(online('b'), { source: 'pdf' })]).length === 2);

/* ── [2] 고객 화면이 전부 그 함수를 지나는가 ─────────────────────────── */
console.log('\n[2] 고객 화면 세 자리가 모두 같은 규칙을 쓰는가');
const script = read('script.js');
ok('견적서·일정 탐색의 본 통로(getItineraries)가 지난다',
  /const courses = recPreferQuoteCourses\(ITINERARY_DB\[destKey\]\);/.test(script));
ok('방식 A·B 카드 변환도 지난다', /const use = recPreferQuoteCourses\(courses\);/.test(script));
ok('일정 탐색이 ITINERARY_DB를 직접 읽는 자리도 지난다',
  /recPreferQuoteCourses\(ITINERARY_DB\[destKey\]\) : null;/.test(script));
/* ⚠ **걸러지지 않은 채 코스 배열로 쓰는 자리가 하나라도 남으면 그 화면만 온라인 일정을
   보여준다.** 개수로 세면 새 자리가 늘어도 통과하므로, 줄마다 **무엇에 쓰는지**를 본다.
   코스로 쓰지 않는 것(있는지 확인 · 사진 유무 · 주석)만 통과시킨다. */
const OK_UNGUARDED = [
  /Array\.isArray\(/,          /* 코스가 있는지 확인 */
  /\]\.length > 0/,            /* 위와 같다 */
  /DEST_PHOTOS/,               /* 목적지 사진이 있는지 확인 */
];
const badLines = script.split(String.fromCharCode(10)).filter((ln) => {
  if (!/ITINERARY_DB\[destKey\]/.test(ln)) return false;
  if (/recPreferQuoteCourses\(ITINERARY_DB\[destKey\]\)/.test(ln)) return false;
  const t = ln.trim();
  if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('//') || t.startsWith('⚠')) return false;
  return !OK_UNGUARDED.some((re) => re.test(ln));
});
ok('코스로 쓰는 자리는 **하나도 빠짐없이** 걸러진다', badLines.length === 0,
  badLines.map((l) => l.trim().slice(0, 60)).join(' | '));
ok('규칙은 rec_fallbacks.js에만 있다 (script.js가 다시 적지 않았다)',
  !/filter\(\(c\) => c && c\.source === 'quote'\)/.test(script));

/* ── [3] 서버가 출처를 저장하는가 ────────────────────────────────────── */
console.log('\n[3] 저장 때 출처가 살아남는가');
const api = read('api/content.js');
ok('화이트리스트에 source가 들어갔다', /source: src, sourceNote:/.test(api));
ok("'quote'가 아닌 값은 버린다", /c\.source === 'quote' \? 'quote' : null/.test(api));
ok('왜 화이트리스트에 적어야 하는지 남겼다', /화이트리스트/.test(api));
ok('근거(sourceNote)도 함께 저장한다', /sourceNote/.test(api));

/* 서버 함수를 직접 돌려 본다 — 「적어 뒀다」가 아니라 **실제로 살아남는지** */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost/db';
const content = require('../api/content.js');
if (typeof content.normalizeCourses === 'function') {
  const out = content.normalizeCourses([fromQuote('견적서 일정'), online('온라인')]);
  ok('실제로 저장 형식에 source가 남는다', out.courses && out.courses[0].source === 'quote',
    JSON.stringify(out.courses && out.courses[0]));
  ok('온라인 코스에는 source가 안 붙는다', out.courses && out.courses[1].source === undefined);
} else {
  ok('normalizeCourses가 내보내져 있지 않아 소스로만 확인함 (참고)', true);
}

/* ── [4] 관리자 화면이 그 사실을 밝히는가 ────────────────────────────── */
console.log('\n[4] 담당자가 그 규칙을 알 수 있는가');
const admin = read('admin.html');
ok('견적서에서 만든 코스에 출처를 찍는다', /source: 'quote',/.test(admin));
ok('어느 견적서 몇 일짜리인지 남긴다', /견적서 PDF에서 읽은 일정 \(/.test(admin));
ok('일정 관리 화면에 「📄 견적서 일정」 배지가 있다', /📄 견적서 일정/.test(admin));
ok('배지에 「고객에게 나갑니다」를 알린다', /이 목적지는 견적서 일정이 고객에게 나갑니다/.test(admin));
/* ⚠ 이걸 안 밝히면 담당자는 자기가 고친 온라인 코스가 왜 안 나가는지 모른다 */
ok('보낼 때도 「고객 일정이 바뀐다」고 말한다',
  /고객 추천 일정이 이 견적서 일정으로 바뀝니다/.test(admin));
ok('온라인 코스가 지워지는 게 아니라는 것도 말한다',
  /온라인 자료로 만든 코스는 남아 있지만 화면에는 안 나갑니다/.test(admin));
/* ⚠ 담당자가 온라인 코스를 열심히 고치고 미리보기까지 봤는데 정작 고객은 다른 일정을
   보는 상태가 되면 안 된다 — 일정 관리 화면이 들어가자마자 그 사실을 말해야 한다. */
ok('일정 관리 화면이 들어가자마자 그 사실을 알린다',
  /이 목적지는 견적서에서 읽은 일정 /.test(admin));
ok('나머지 온라인 코스가 어떻게 되는지도 말한다',
  /저장돼 있지만 고객 화면에는 안 나옵니다/.test(admin));
ok('되돌리는 방법까지 적는다', /견적서 코스를 지우면 다시 나갑니다/.test(admin));
ok('그 판단도 공용 함수가 한다 (화면이 규칙을 다시 적지 않았다)',
  /recHasQuoteCourses\(itiState\.courses\)/.test(admin));

/* ⚠ 이 저장소는 CRLF/LF가 섞이면 diff가 수천 줄로 부푼다 — script.js는 CRLF다 */
console.log('\n[5] 줄바꿈을 지켰는가');
const raw = fs.readFileSync(path.join(ROOT, 'script.js'), 'latin1');
const crlf = (raw.match(/\r\n/g) || []).length;
const lfOnly = (raw.match(/\n/g) || []).length - crlf;
ok('script.js는 CRLF 그대로다 (섞이면 diff가 수천 줄로 부푼다)', lfOnly === 0, 'LF만 ' + lfOnly + '줄');

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

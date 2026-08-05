/* RR 검증: 고객이 보는 **일자별 일정**을 만드는 규칙이 한 곳뿐인가.

   왜 —
   담당자가 📅 날짜별 일정에 쓰는 오전·오후·저녁은 고객에게 **두 화면**으로 나간다:
   ① 홈페이지 '연수 일정 탐색'의 타임라인(script.js _renderTimeline)
   ② 고객 견적서의 일정표(script.js openEstimateWindow → renderDays)
   그리고 관리자 미리보기가 그 둘을 미리 보여준다.

   이 규칙이 갈라져 있었다. 실제로 이랬다:
   · 자동 채움 문구가 **두 벌**이었다 — 코스가 있을 때 「— 오전 코스 / 연계 오후 프로그램 ·
     현장 방문 / 팀 석식」, 없을 때 「— 오전 탐방 / … 연계 오후 프로그램 / 팀 석식 · 자유 시간」.
     같은 성격의 자동 문구인데 고객이 어느 경로로 들어왔느냐로 갈렸다.
   · 그래서 **관리자 미리보기는 오전·오후·저녁을 아예 안 보여줬다** — "규칙이 둘이라 옮겨
     적으면 어긋난다"가 이유였다. 담당자가 가장 오래 쓰는 칸이 미리보기에 안 나왔다.
   · 코스에 일자가 하나도 없으면 견적서는 일정을 **텅 비게** 내보내는데, 같은 목적지의
     일정 탐색은 자동 일정을 보여줬다. 두 고객 화면이 서로 다른 말을 했다.
   · ✨의 '일별 주요 활동'이 빈 배열이면 「undefined — 오전 탐방」이 만들어질 수 있었다.
   · 미리보기는 방식 A·B **둘 다 코스 A**의 하이라이트로 채웠다(고객은 각자 자기 코스).

   이 파일은 그 다섯이 되살아나면 잡는다.
   실행: node ai-loop/test_rR_day_source.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const RF = require('../rec_fallbacks.js');
const { recBuildDisplayDays, recRenderDayCard, recDayPool } = RF;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const scriptSrc = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const adminSrc  = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const rfSrc     = fs.readFileSync(path.join(ROOT, 'rec_fallbacks.js'), 'utf8');

/* ⚠ '이 문구가 코드에 남아 있는가'를 볼 때는 **주석을 빼고** 봐야 한다.
   이 저장소는 없앤 결함을 주석에 그대로 적어 두는 방식으로 기록한다("예전엔 …였다").
   주석까지 세면, 잘 지운 것을 기록했다는 이유로 테스트가 실패한다. */
const noComments = (src) => src
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ');
const scriptCode = noComments(scriptSrc);
const adminCode  = noComments(adminSrc);
const rfCode     = noComments(rfSrc);

const COURSE = {
  title: '코스가', subtitle: '한 줄', highlights: ['하이1', '하이2'],
  days: [
    { day: 1, title: '도착', am: '출국', pm: '체크인', eve: '환영만찬', tip: '환전' },
    { day: 2, title: '현장', am: '공장', pm: '세미나', eve: '석식', tip: '' },
    { day: 3, title: '귀국', am: '체크아웃', pm: '탑승', eve: '도착', tip: '3시간 전' },
  ],
};

/* ── [1] 규칙이 한 곳에만 있는가 ─────────────────────────────────────────── */
console.log('[1] 자동 채움 문구가 한 벌뿐인가 (결함 생성기 ①)');
ok('rec_fallbacks.js가 조립 규칙을 갖고 있다', typeof recBuildDisplayDays === 'function');
ok('카드 만드는 함수도 여기 있다', typeof recRenderDayCard === 'function');
ok('없어진 문구가 되살아나지 않았다 — "오전 코스"',
  !/오전 코스/.test(scriptCode) && !/오전 코스/.test(adminCode) && !/오전 코스/.test(rfCode),
  '두 벌 중 하나였다. 코드에 남아 있으면 다시 갈라진 것이다');
ok('script.js가 자동 문구를 다시 적지 않는다',
  !/오전 탐방/.test(scriptCode), 'script.js에 조립 문구가 있으면 두 벌이다');
ok('admin.html도 자동 문구를 다시 적지 않는다',
  !/오전 탐방/.test(adminCode), '미리보기가 문구를 지어내면 거짓말을 하게 된다');
ok('문구는 rec_fallbacks.js에만 있다', /오전 탐방/.test(rfCode));
ok('타임라인이 공용 함수를 부른다', /recBuildDisplayDays\(/.test(scriptSrc));
ok('미리보기도 같은 함수를 부른다', /recBuildDisplayDays\(/.test(adminSrc));
ok('카드도 공용 함수로 그린다',
  /recRenderDayCard\(/.test(scriptSrc) && /recRenderDayCard\(/.test(adminSrc));

/* ── [2] 귀국일이 항상 실제 마지막 날인가 ───────────────────────────────── */
console.log('\n[2] 귀국일이 항상 실제 마지막 날인가');
[3, 4, 5, 7, 10].forEach((n) => {
  const days = recBuildDisplayDays(COURSE, ['활동1', '활동2'], n, '도쿄');
  ok(n + '일이면 ' + n + '장이 나온다', days.length === n, String(days.length));
  ok(n + '일의 마지막 날이 코스의 귀국일이다', days[n - 1].title === '귀국', days[n - 1].title);
  ok(n + '일에 귀국일이 중간에 끼지 않는다',
    days.slice(0, n - 1).every((d) => d.title !== '귀국'),
    days.map((d) => d.title).join(','));
  ok(n + '일의 DAY 번호가 1..n으로 이어진다',
    days.every((d, i) => d.day === i + 1), days.map((d) => d.day).join(','));
});

/* ── [3] 자동 채움이 어디서 오는가 ──────────────────────────────────────── */
console.log('\n[3] 코스보다 긴 일수를 고르면 무엇으로 채우는가');
const filled = recBuildDisplayDays(COURSE, ['활동1', '활동2'], 5, '도쿄');
ok('코스에 쓴 일자가 앞에서부터 그대로 나온다',
  filled[0].title === '도착' && filled[1].title === '현장',
  filled.map((d) => d.title).join(','));
ok('남는 날은 ✨의 일별 주요 활동으로 채운다',
  filled[2].title === '활동1' && filled[3].title === '활동2',
  filled.map((d) => d.title).join(','));
ok('채운 날의 오전 문장이 활동명으로 조립된다',
  filled[2].am === '활동1 — 오전 탐방', filled[2].am);
ok('담당자가 쓴 일자의 문장은 건드리지 않는다',
  filled[1].am === '공장' && filled[1].pm === '세미나', filled[1].am + '/' + filled[1].pm);

/* ✨이 비면 **그 방식이 쓰는 코스의** 하이라이트로 물러난다 */
const byHi = recBuildDisplayDays(COURSE, [], 5, '도쿄');
ok('✨이 비면 코스의 핵심 하이라이트로 채운다',
  byHi[2].title === '하이1' && byHi[3].title === '하이2',
  byHi.map((d) => d.title).join(','));
ok('recDayPool이 ✨을 먼저 본다',
  recDayPool(COURSE, ['우선'])[0] === '우선', String(recDayPool(COURSE, ['우선'])[0]));
ok('recDayPool이 공백만 있는 항목을 버린다',
  recDayPool(COURSE, ['  ', ''])[0] === '하이1', String(recDayPool(COURSE, ['  ', ''])[0]));

/* 미리보기가 courses[0]으로 잘못 잡던 자리 — 방식 B는 자기 코스에서 와야 한다 */
const COURSE_B = { title: '코스나', subtitle: '', highlights: ['나하이1'],
  days: [{ day: 1, title: 'ㄱ' }, { day: 2, title: 'ㄴ' }] };
ok('방식 B는 코스 B의 하이라이트로 채워진다',
  recBuildDisplayDays(COURSE_B, [], 4, '도쿄')[1].title === '나하이1',
  recBuildDisplayDays(COURSE_B, [], 4, '도쿄').map((d) => d.title).join(','));

/* ── [4] 예전에 실제로 났던 결함들 ──────────────────────────────────────── */
console.log('\n[4] 되살아나면 안 되는 결함들');

/* ① 활동 목록이 비었는데 그대로 인덱싱해 "undefined"를 문장에 넣던 것 */
[[], null, undefined, ['', '   ']].forEach((items, i) => {
  const d = recBuildDisplayDays(null, items, 5, '도쿄');
  const joined = d.map((x) => [x.title, x.am, x.pm, x.eve].join(' ')).join(' ');
  ok('빈 활동목록(' + i + ')에서 undefined가 새 나가지 않는다',
    !/undefined/.test(joined), joined.slice(0, 80));
  ok('빈 활동목록(' + i + ')이면 시스템 기본 목록으로 채운다',
    d[1].title === RF.items[0], d[1].title);
});

/* ② 코스에 일자가 없으면 견적서가 텅 비던 것 — 이제 두 화면이 같은 자동 일정을 쓴다 */
[{ title: 'ㄱ', days: [] }, { title: 'ㄱ' }, null].forEach((c, i) => {
  const d = recBuildDisplayDays(c, ['활동1'], 4, '도쿄');
  ok('일자 없는 코스(' + i + ')도 빈 배열을 돌려주지 않는다', d.length === 4, String(d.length));
  ok('일자 없는 코스(' + i + ')는 첫날이 도착일이다',
    d[0].title === '도착 · 오리엔테이션', d[0].title);
  ok('일자 없는 코스(' + i + ')는 마지막이 귀국이다', d[3].title === '귀국', d[3].title);
  ok('일자 없는 코스(' + i + ')의 도착 문장에 목적지가 들어간다',
    d[0].am.includes('도쿄'), d[0].am);
});

/* ③ 일수를 이상하게 줘도 죽지 않는다 */
[0, -3, null, undefined, 'abc', 1].forEach((n) => {
  let out = null, threw = false;
  try { out = recBuildDisplayDays(COURSE, ['활동1'], n, '도쿄'); } catch (e) { threw = true; }
  ok('일수 ' + JSON.stringify(n) + '에도 죽지 않는다', !threw && Array.isArray(out) && out.length >= 1,
    threw ? '예외' : String(out && out.length));
});

/* ── [5] 담당자가 친 글이 코드가 되지 않는가 (결함 생성기 ④) ────────────── */
console.log('\n[5] 담당자가 친 글이 코드로 해석되지 않는가');
const EVIL = `<img src=x onerror=window.__pwned=1><script>window.__pwned=1<\/script>`;
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
const doc = dom.window.document;
const evilDays = recBuildDisplayDays(
  { title: 'ㄱ', highlights: [], days: [{ day: 1, title: EVIL, am: EVIL, pm: EVIL, eve: EVIL, tip: EVIL }] },
  [EVIL], 3, EVIL);
evilDays.forEach((d, i) => doc.body.appendChild(recRenderDayCard(doc, i + 1, d, 3)));
ok('태그가 만들어지지 않는다', doc.querySelectorAll('img').length === 0,
  String(doc.querySelectorAll('img').length));
ok('스크립트 태그도 만들어지지 않는다', doc.querySelectorAll('script').length === 0);
ok('스크립트가 실행되지 않았다', dom.window.__pwned === undefined);
ok('그래도 글자는 그대로 보인다',
  Array.from(doc.querySelectorAll('.itin-slot-content')).some((e) => e.textContent === EVIL),
  Array.from(doc.querySelectorAll('.itin-slot-content')).map((e) => e.textContent)[0]);

/* 견적서는 문자열로 조립되므로 이스케이프가 유일한 방어선이다 */
console.log('\n[5-b] 견적서 일정표도 이스케이프하는가');
['d.title', 'd.am', 'd.pm', 'd.eve', 'd.tip'].forEach((f) => {
  ok('견적서가 ' + f + '를 그대로 끼워 넣지 않는다',
    !scriptSrc.includes('${' + f + '}'), '문자열 문서라 esc가 유일한 방어선이다');
  ok('견적서가 ' + f + '를 _e()로 감싼다', scriptSrc.includes('_e(' + f + ')'));
});
['itiA.title', 'itiB.title', 'itiA.subtitle', 'itiB.subtitle'].forEach((f) => {
  ok('견적서가 ' + f + '를 _e()로 감싼다', scriptSrc.includes('_e(' + f + ')'));
});

/* ── [6] 카드 모양이 고객 화면 클래스 그대로인가 ────────────────────────── */
console.log('\n[6] 카드가 고객 화면 클래스를 쓰는가');
const card = recRenderDayCard(doc, 1, { title: 'ㄱ', am: '오', pm: '후', eve: '저', tip: 'ㅌ' }, 3);
['itin-day-card', 'itin-day-header', 'itin-day-hd-l', 'itin-day-num', 'itin-day-title',
 'itin-day-body', 'itin-slot', 'itin-slot-content', 'itin-tip'].forEach((c) => {
  ok('카드가 .' + c + '를 만든다', card.className === c || !!card.querySelector('.' + c));
});
ok('첫날에 도착일 배지가 붙는다', card.textContent.includes('도착일'), card.textContent.slice(0, 40));
ok('마지막날에 귀국일 배지가 붙는다',
  recRenderDayCard(doc, 3, { title: 'ㄱ' }, 3).textContent.includes('귀국일'));
ok('가운데 날에는 배지가 없다',
  !recRenderDayCard(doc, 2, { title: 'ㄱ' }, 3).querySelector('.itin-day-badge'));
/* 빈 칸은 줄 자체를 안 그린다 — 빈 '오전' 라벨만 남으면 고객 화면이 이상해진다 */
const sparse = recRenderDayCard(doc, 2, { title: 'ㄱ', am: '오', pm: '', eve: '  ' }, 3);
ok('빈 오후·저녁은 줄을 안 그린다', sparse.querySelectorAll('.itin-slot').length === 1,
  String(sparse.querySelectorAll('.itin-slot').length));
ok('TIP이 없으면 TIP 줄도 없다', !sparse.querySelector('.itin-tip'));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
dom.window.close();
if (fail) process.exit(1);

/* RF 검증: 일정 편집 화면 접기 — 코스는 탭으로 하나씩, 일자는 접어 두고 고칠 것만 편다.

   왜 —
   도쿄 기준 코스 3개 × 일자 5개 = 일자 카드 15장이 늘 전부 펼쳐져 있었다. 정작 고치는 건
   보통 한 코스의 한 일자인데 나머지 14장이 계속 자리를 차지한다. 실측 세로 6,708px
   (RE 이전엔 10,156px) → 접고 나서 1,915px.

   ⚠ 접기의 진짜 위험은 화면이 아니라 **"안 보여서 못 본 채 저장"**이다. 이 파일이 막는
   것도 대부분 그것이다:
   ① **접혀 있어도 저장에는 다 실린다.** 저장은 화면이 아니라 상태(itiState.courses)를
      보낸다. 여기가 어긋나면 접어 둔 일자가 통째로 사라진 채 고객 견적서에 나간다.
      — 이 저장소에서 가장 비싼 실수가 될 수 있는 자리라 실제 PUT 본문으로 확인한다.
   ② **안 보이는 코스의 상태가 탭에서 읽힌다.** 코스 B가 비어 있는데 코스 A만 보고 저장하는
      일을 막는다(탭에 일자 수·빈 칸 수).
   ③ **접힌 줄이 내용을 말한다.** 제목(없으면 첫 활동 문구)과 빈 칸 개수. 여기가 비면
      접기는 그냥 '숨기기'다.
   ④ **접힘은 일자 객체를 따라간다.** 인덱스로 기억하면 ↑↓로 자리를 옮겼을 때 엉뚱한
      일자가 펼쳐진다.
   ⑤ **펼치는 순간 칸 높이를 다시 잰다.** 접혀 있는 동안에는 못 잰다(RE) — 여기서 안 부르면
      여러 줄 문구가 한 줄 칸에 갇힌 채로 보인다.
   ⑥ **순서 바꾸기는 접힌 채로도 된다.** 접기의 가장 큰 쓸모가 "다섯 일자를 한눈에 놓고
      순서를 바꾸는 것"이라, 그러려고 매번 펼쳐야 하면 접은 의미가 없다.

   실행: node ai-loop/test_rF_fold.js  (프로젝트 루트에서) */
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
const manualSrc = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');

const mkDay = (n, over) => Object.assign(
  { day: n, title: '제목' + n, am: '오전' + n, pm: '오후' + n, eve: '저녁' + n, tip: '팁' + n }, over || {});
const THREE_COURSES = [
  { title: '코스가', subtitle: '설명가', highlights: ['하이라이트'], days: [1, 2, 3].map((n) => mkDay(n)) },
  { title: '코스나', subtitle: '설명나', highlights: [], days: [1, 2].map((n) => mkDay(n)) },
  /* 세 번째 코스에 일부러 빈 칸을 둔다 — 안 보이는 탭의 문제가 드러나는지 보려고 */
  { title: '코스다', subtitle: '', highlights: [], days: [mkDay(1, { title: '', am: '' })] },
];

(async () => {
  const put = { body: null };
  const dom = await bootAdmin(put);
  const w = dom.window, d = w.document;

  const days = () => Array.from(d.querySelectorAll('#iti-body .iti-day'));
  const togOf = (box) => box.querySelector('.iti-day-toggle');
  const bodyOf = (box) => box.querySelector('.iti-day-body');
  const btnIn = (box, action) => Array.from(box.querySelectorAll('[data-focus-key]'))
    .find((b) => b.dataset.focusKey.endsWith(':' + action));
  const tabs = () => Array.from(d.querySelectorAll('#iti-ctabs .iti-ctab'));

  w.__setLoaded();
  w.__itiSelect('도쿄');
  w.__setCourses(w.__clone(THREE_COURSES));

  /* ── [1] 코스 탭 (②) ────────────────────────────────────────────────── */
  console.log('[1] 코스를 탭으로 하나씩 보여주는가 (②)');
  ok('탭이 코스 수만큼 있다', tabs().length === 3, String(tabs().length));
  ok('처음에는 코스 A가 켜져 있다', tabs()[0].classList.contains('on'));
  ok('한 번에 한 코스만 그려진다', d.querySelectorAll('#iti-body .iti-course').length === 1);
  ok('보이는 것은 코스 A의 일자다', days().length === 3, String(days().length));
  ok('탭이 코스 제목을 보여준다', tabs()[1].textContent.includes('코스나'), tabs()[1].textContent);
  ok('탭이 일자 수를 보여준다', tabs()[1].textContent.includes('2일'), tabs()[1].textContent);
  /* ⚠ 안 보이는 코스에 문제가 있으면 탭에서 읽혀야 한다 */
  ok('빈 칸이 있는 코스는 탭에 표시된다',
    !!tabs()[2].querySelector('.iti-ctab-warn'), tabs()[2].textContent);
  ok('빈 칸 개수를 숫자로 말한다',
    /빈 칸\s*2/.test(tabs()[2].querySelector('.iti-ctab-warn').textContent),
    tabs()[2].querySelector('.iti-ctab-warn').textContent);
  ok('멀쩡한 코스에는 경고를 붙이지 않는다', !tabs()[0].querySelector('.iti-ctab-warn'));

  tabs()[1].click();
  ok('탭을 누르면 그 코스로 바뀐다', days().length === 2, String(days().length));
  ok('누른 탭이 켜진다', tabs()[1].classList.contains('on') && !tabs()[0].classList.contains('on'));
  tabs()[0].click();

  /* ── [2] 접힌 줄이 내용을 말하는가 (③) ─────────────────────────────── */
  console.log('\n[2] 접힌 줄이 내용을 말하는가 (③)');
  ok('처음에는 전부 접혀 있다', days().every((b) => bodyOf(b).hidden));
  ok('접힌 줄에 DAY 번호가 있다',
    days()[0].querySelector('.iti-day-no').textContent === 'DAY 1');
  ok('접힌 줄에 그날의 제목이 보인다',
    days()[0].querySelector('.iti-day-sum').textContent === '제목1',
    days()[0].querySelector('.iti-day-sum').textContent);
  ok('접혔음을 화살표로 알린다', days()[0].querySelector('.iti-caret').textContent === '▸');
  ok('스크린리더에도 접힘을 알린다', togOf(days()[0]).getAttribute('aria-expanded') === 'false');

  /* 제목이 없으면 첫 활동 문구로 대신한다 — 제목을 안 적는 일자가 실제로 있다 */
  w.__setCourses([{ title: 'ㄱ', subtitle: '', highlights: [],
    days: [mkDay(1, { title: '', am: '오전 활동만 있음' }), mkDay(2, { title: '', am: '', pm: '', eve: '' })] }]);
  ok('제목이 없으면 첫 활동 문구를 보여준다',
    days()[0].querySelector('.iti-day-sum').textContent === '오전 활동만 있음',
    days()[0].querySelector('.iti-day-sum').textContent);
  ok('아무것도 없으면 비었다고 말한다',
    days()[1].querySelector('.iti-day-sum').textContent === '(비어 있음)',
    days()[1].querySelector('.iti-day-sum').textContent);
  ok('빈 칸이 있으면 접힌 줄에 적는다',
    days()[1].querySelector('.iti-day-blank').hidden === false
    && /빈 칸/.test(days()[1].querySelector('.iti-day-blank').textContent),
    days()[1].querySelector('.iti-day-blank').textContent);
  ok('어느 칸이 비었는지까지 적는다',
    /그날의 제목/.test(days()[1].querySelector('.iti-day-blank').textContent)
    && /오전/.test(days()[1].querySelector('.iti-day-blank').textContent),
    days()[1].querySelector('.iti-day-blank').textContent);
  /* 저녁·팁은 비워 두는 게 정상이라 세지 않는다 — 늘 켜진 경고는 아무도 안 본다 */
  w.__setCourses([{ title: 'ㄱ', subtitle: '', highlights: [],
    days: [mkDay(1, { eve: '', tip: '' })] }]);
  ok('저녁·팁이 비어도 경고하지 않는다', days()[0].querySelector('.iti-day-blank').hidden);

  /* ── [3] 펼치기·접기 ───────────────────────────────────────────────── */
  console.log('\n[3] 펼치고 접는 동작');
  w.__setCourses(w.__clone(THREE_COURSES));
  togOf(days()[1]).click();
  ok('누르면 펼쳐진다', bodyOf(days()[1]).hidden === false);
  ok('펼치면 화살표가 바뀐다', days()[1].querySelector('.iti-caret').textContent === '▾');
  ok('펼치면 aria-expanded도 바뀐다', togOf(days()[1]).getAttribute('aria-expanded') === 'true');
  ok('다른 일자는 그대로 접혀 있다', bodyOf(days()[0]).hidden && bodyOf(days()[2]).hidden);
  ok('펼치면 빈 칸 배지는 감춘다 (칸이 눈앞에 있다)',
    days()[1].querySelector('.iti-day-blank').hidden);
  ok('펼친 일자의 입력칸에 값이 들어 있다',
    bodyOf(days()[1]).querySelector('.iti-inp').value === '제목2',
    bodyOf(days()[1]).querySelector('.iti-inp').value);
  togOf(days()[1]).click();
  ok('다시 누르면 접힌다', bodyOf(days()[1]).hidden === true);

  /* 펼쳐서 고친 내용이 접었을 때 요약에 반영돼야 한다 — 안 그러면 접힌 줄이 거짓말한다 */
  togOf(days()[0]).click();
  const titleInput = bodyOf(days()[0]).querySelector('.iti-inp');
  titleInput.value = '고친 제목';
  titleInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  togOf(days()[0]).click();
  ok('고친 내용이 접힌 줄에 바로 반영된다',
    days()[0].querySelector('.iti-day-sum').textContent === '고친 제목',
    days()[0].querySelector('.iti-day-sum').textContent);

  /* 전체 펼치기 */
  d.getElementById('iti-fold-all').click();
  ok('전체 펼치기가 이 코스의 일자를 다 편다', days().every((b) => !bodyOf(b).hidden));
  ok('전부 펼쳐지면 버튼이 전체 접기로 바뀐다',
    d.getElementById('iti-fold-all').textContent === '전체 접기',
    d.getElementById('iti-fold-all').textContent);
  d.getElementById('iti-fold-all').click();
  ok('전체 접기가 다시 다 접는다', days().every((b) => bodyOf(b).hidden));

  /* ── [4] 접힘이 일자를 따라가는가 (④) ──────────────────────────────── */
  console.log('\n[4] 순서를 바꿔도 펼친 일자가 그대로인가 (④)');
  w.__setCourses(w.__clone(THREE_COURSES));
  togOf(days()[2]).click();                         /* DAY 3을 펼쳐 둔다 */
  const openTitle = bodyOf(days()[2]).querySelector('.iti-inp').value;
  btnIn(days()[2], 'up').click();                   /* DAY 3 → DAY 2 자리로 */
  ok('옮겨간 자리에서 여전히 펼쳐져 있다', bodyOf(days()[1]).hidden === false);
  ok('펼쳐져 있는 것이 옮긴 그 일자다',
    bodyOf(days()[1]).querySelector('.iti-inp').value === openTitle,
    bodyOf(days()[1]).querySelector('.iti-inp').value + ' / 기대 ' + openTitle);
  ok('원래 그 자리에 있던 일자는 접혀 있다', bodyOf(days()[2]).hidden === true);

  /* ── [5] 새로 만든 일자는 펼쳐 준다 ────────────────────────────────── */
  console.log('\n[5] 새로 만든 일자는 펼쳐 주는가');
  w.__setCourses(w.__clone(THREE_COURSES));
  btnIn(days()[0], 'dup').click();
  ok('복제한 사본은 펼쳐져 있다 (고치려고 만든 것이다)', bodyOf(days()[1]).hidden === false);
  ok('원본은 접힌 채로 둔다', bodyOf(days()[0]).hidden === true);
  d.querySelectorAll('#iti-body .iti-actions button')[0].click();
  ok('＋ 일자 추가로 만든 빈 일자도 펼쳐져 있다',
    bodyOf(days()[days().length - 1]).hidden === false);

  /* ── [6] 순서 바꾸기가 접힌 채로도 되는가 (⑥) ──────────────────────── */
  console.log('\n[6] 접힌 채로도 순서를 바꿀 수 있는가 (⑥)');
  w.__setCourses(w.__clone(THREE_COURSES));
  ok('접힌 상태에서도 ↑↓·복제·삭제가 보인다',
    days().every((b) => btnIn(b, 'up') && btnIn(b, 'down') && btnIn(b, 'dup')
      && Array.from(b.querySelectorAll('button')).some((x) => x.textContent === '일자 삭제')));
  ok('그 버튼들이 접힌 본문 안에 들어 있지 않다',
    days().every((b) => !bodyOf(b).contains(btnIn(b, 'up'))));
  btnIn(days()[0], 'down').click();
  ok('접힌 채로 순서가 바뀐다',
    w.__courses()[0].days.map((x) => x.title).join(',') === '제목2,제목1,제목3',
    w.__courses()[0].days.map((x) => x.title).join(','));

  /* ── [7] 펼칠 때 칸 높이를 다시 재는가 (⑤ / RE 연결) ───────────────── */
  console.log('\n[7] 펼치는 순간 칸 높이를 다시 재는가 (⑤)');
  ok('펼치기 처리가 자동 높이를 부른다',
    /itiOpenDays\.add\(day\);[\s\S]{0,400}itiAutoGrowAll\(\);/.test(adminSrc),
    '접혀 있는 동안에는 못 잰다 — 펼치는 순간이 처음 잴 수 있는 때다');
  const grew = [];
  w.__onGrow((el) => grew.push(el));
  togOf(days()[0]).click();
  ok('실제로 펼칠 때 불린다', grew.length > 0, String(grew.length));

  /* ── [8] 접혀 있어도 저장에 다 실리는가 (①) — 가장 중요 ───────────── */
  console.log('\n[8] 접혀 있어도 저장에 다 실리는가 (①)');
  w.__itiSelect('도쿄');
  w.__setCourses(w.__clone(THREE_COURSES));
  ok('저장 전: 전부 접혀 있고 코스 A만 보인다',
    days().every((b) => bodyOf(b).hidden) && d.querySelectorAll('#iti-body .iti-course').length === 1);
  await w.itiSave();
  ok('저장이 나갔다', !!put.body);
  ok('안 보이던 코스까지 전부 실린다', put.body.courses.length === 3, String(put.body.courses.length));
  ok('접혀 있던 일자가 하나도 안 빠진다',
    put.body.courses.map((c) => c.days.length).join(',') === '3,2,1',
    put.body.courses.map((c) => c.days.length).join(','));
  ok('접힌 일자의 내용이 그대로 실린다',
    put.body.courses[0].days[2].am === '오전3' && put.body.courses[0].days[2].tip === '팁3',
    JSON.stringify(put.body.courses[0].days[2]));
  ok('안 보이던 코스의 내용도 그대로 실린다',
    put.body.courses[1].title === '코스나' && put.body.courses[1].days[1].pm === '오후2');

  /* 접힌 일자를 고친 뒤 다시 접고 저장해도 실려야 한다 */
  put.body = null;
  togOf(days()[1]).click();
  const am = bodyOf(days()[1]).querySelectorAll('.iti-ta')[0];
  am.value = '접었다 편 뒤 고친 오전';
  am.dispatchEvent(new w.Event('input', { bubbles: true }));
  togOf(days()[1]).click();
  await w.itiSave();
  ok('접은 뒤에 저장해도 고친 내용이 실린다',
    put.body.courses[0].days[1].am === '접었다 편 뒤 고친 오전',
    put.body.courses[0].days[1].am);

  /* ── [9] 코스를 지웠을 때 탭이 깨지지 않는가 ───────────────────────── */
  console.log('\n[9] 코스를 지웠을 때 보던 탭이 깨지지 않는가');
  w.__setCourses(w.__clone(THREE_COURSES));
  tabs()[2].click();
  ok('마지막 코스를 보고 있다', tabs()[2].classList.contains('on'));
  Array.from(d.querySelectorAll('#iti-body .iti-course-head button'))
    .find((b) => b.textContent === '이 코스 삭제').click();
  ok('코스가 하나 줄었다', w.__courses().length === 2, String(w.__courses().length));
  ok('빈 화면이 되지 않고 남은 코스를 보여준다',
    d.querySelectorAll('#iti-body .iti-course').length === 1 && days().length > 0,
    String(days().length));
  ok('켜진 탭이 하나 있다', tabs().filter((t) => t.classList.contains('on')).length === 1);

  /* ── [10] 담당자가 친 글자가 코드로 해석되지 않는가 (결함 생성기 ④) ── */
  console.log('\n[10] 접힌 줄·탭에 들어가는 글자가 HTML로 해석되지 않는가');
  const EVIL = `'"><img src=x onerror=window.__pwned=1>`;
  w.__setCourses([{ title: EVIL, subtitle: '', highlights: [], days: [mkDay(1, { title: EVIL })] }]);
  ok('접힌 줄에서 태그가 만들어지지 않는다', d.querySelectorAll('#iti-body img').length === 0);
  ok('탭에서도 만들어지지 않는다', d.querySelectorAll('#iti-ctabs img').length === 0);
  ok('스크립트가 실행되지 않았다', w.__pwned === undefined);
  ok('그래도 글자는 그대로 보인다',
    days()[0].querySelector('.iti-day-sum').textContent === EVIL);

  /* ── [11] 매뉴얼이 따라왔는가 ──────────────────────────────────────── */
  console.log('\n[11] 매뉴얼에 설명이 있는가');
  ok('코스 탭을 설명한다', /코스 탭|탭으로 하나씩/.test(manualSrc));
  ok('일자 접기를 설명한다', /접어|접기/.test(manualSrc));
  ok('접혀 있어도 저장된다고 못 박는다', /접혀 있어도.*저장|접힌.*함께 저장/.test(manualSrc));
  ok('빈 칸 표시를 설명한다', /빈 칸/.test(manualSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin(put) {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__itiSelect = (k) => { itiState.dirty = false; itiSelectDest(k); };
  window.__courses = () => itiState.courses;
  window.__setCourses = (c) => { itiState.courses = c; itiView.courseIdx = 0; itiState.dirty = false; itiRenderBody(); };
  window.__clone = (v) => JSON.parse(JSON.stringify(v));
  /* 저장은 '불러오기가 끝난 뒤'에만 나간다(덜 불러온 상태로 덮어쓰지 않으려고).
     이 테스트는 서버를 세우지 않으므로 그 조건만 통과시킨다. */
  window.__setLoaded = () => { itiState.loaded = true; };
  /* 자동 높이가 실제로 불렸는지 보려고 갈아끼운다 — 소스만 봐서는 '부르게 짜여 있다'까지만 안다 */
  window.__onGrow = (fn) => { const real = itiAutoGrowAll; itiAutoGrowAll = function () { fn(1); return real(); }; };
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
      w.fetch = (u, opt) => {
        const s = String(u);
        if (s.includes('action=itineraries') && opt && opt.method === 'PUT') {
          put.body = JSON.parse(opt.body);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, courses: put.body.courses }) });
        }
        return new Promise(() => {});
      };
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

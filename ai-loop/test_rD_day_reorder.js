/* RD 검증: 일정 편집 화면의 일자 순서 바꾸기(↑↓)·복제.

   왜 만들었나 —
   이 화면에는 '일자 추가'와 '일자 삭제'밖에 없었다. 그래서 3일차를 5일차로 옮기려면
   다섯 칸(제목·오전·오후·저녁·팁)을 지우고 다시 타이핑해야 했다. 옮기는 것보다
   **옮기다가 문구가 미묘하게 달라지는 것**이 더 나쁘다 — 그 문구는 고객 견적서에
   그대로 나간다.

   여기서 고정하는 것:
   ① **일자 번호는 배열 순서에서만 나온다.** day 필드는 파생값이라 구조가 바뀌면
      (추가·삭제·이동·복제) 즉시 다시 매겨져야 한다. 순서와 번호를 따로 관리하는 순간
      어긋난다(결함 생성기 ①). 서버도 같은 규칙으로 다시 매기므로 둘이 같아야 한다.
   ② **복제는 깊은 복사다.** 얕게 넣으면 두 일자가 같은 객체를 가리켜, 한쪽 오전 칸을
      고치면 다른 쪽도 함께 바뀐다 — 화면에는 그 이유가 전혀 안 보인다(QM에서 코스
      가져오기가 정확히 같은 함정을 밟았다).
   ③ **상한이 한 곳에서만 나온다.** 일자 상한은 원래 api/content.js에만 있었는데,
      화면이 사전 안내를 하려면 같은 값이 필요하다. 두 번 적으면 어긋나므로 limits.js로
      옮겼다(QO와 같은 규칙). 화면이 안 막고 서버만 거절하면, 담당자는 30개를 넘겨
      다 채워 넣은 뒤 저장 버튼을 눌러서야 그 사실을 안다.
   ④ **끝자리는 눌러 보기 전에 알 수 있다.** 첫 일자의 ↑·마지막 일자의 ↓는 비활성이다.
      오류 문구로 알려주는 방식은 여기서 통하지 않는다 — 그 문구가 뜨는 자리(iti-msg)는
      화면 맨 아래인데, 이 화면은 세로 10,000px가 넘는다(RC).
   ⑤ **누른 버튼이 옮겨간 자리로 따라간다.** 화면을 다시 그리면 방금 누른 버튼이
      사라지는데, 두 칸 옮기려면 두 번 눌러야 한다. 포커스를 안 되돌리면 매번 마우스로
      다시 찾아야 하고, 옮긴 일자가 화면 밖으로 나가 어디 갔는지도 모른다.

   실행: node ai-loop/test_rD_day_reorder.js  (프로젝트 루트에서) */
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

const contentSrc = fs.readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');
const adminSrc   = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const manualSrc  = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost/db';

/* 화면에 올릴 일자 5개짜리 코스. 칸마다 서로 다른 값을 넣어 두면 "옮겼다고 했는데
   실은 안 옮겨졌다"를 값으로 잡을 수 있다. */
const FIVE_DAYS = [{
  title: '테스트 코스', subtitle: '설명', highlights: ['하이라이트'],
  days: [1, 2, 3, 4, 5].map((n) => ({
    day: n, title: '제목' + n, am: '오전' + n, pm: '오후' + n, eve: '저녁' + n, tip: '팁' + n,
  })),
}];

const titlesOf  = (courses) => courses[0].days.map((d) => d.title);
const numbersOf = (courses) => courses[0].days.map((d) => d.day);
const renumbered = (courses) => numbersOf(courses).every((n, i) => n === i + 1);

(async () => {
  /* ── [1] 상한이 한 곳에서만 나오는가 (③) ───────────────────────────── */
  console.log('[1] 일자 상한이 limits.js 하나에서 나오는가 (③)');
  const LIMITS = require(path.join(ROOT, 'limits.js'));
  ok('limits.js가 MAX_DAYS를 갖고 있다', Number.isFinite(LIMITS.MAX_DAYS), String(LIMITS.MAX_DAYS));
  ok('서버가 숫자를 따로 적어두지 않았다', !/const\s+MAX_DAYS\s*=\s*\d/.test(contentSrc),
    'api/content.js가 자기 숫자를 쓰면 limits.js를 고쳐도 서버는 안 바뀐다');
  ok('서버가 limits.js에서 읽는다', /require\('\.\.\/limits'\)/.test(contentSrc)
    && /MAX_DAYS/.test((contentSrc.match(/const \{[^}]*\} = require\('\.\.\/limits'\)/) || [''])[0]));
  ok('화면도 숫자를 따로 적어두지 않았다', /ITI_MAX_DAYS\s*=\s*LIMITS\.MAX_DAYS/.test(adminSrc),
    (adminSrc.match(/ITI_MAX_DAYS\s*=.*/) || [''])[0]);
  /* 서버가 실제로 그 값으로 거절하는지까지 본다 — 읽어만 오고 안 쓰면 소용이 없다
     (결함 생성기 ③: 안전망이 실행된 적 없음). */
  const content = require(path.join(ROOT, 'api', 'content.js'));
  const mkDays = (n) => Array.from({ length: n }, (_, i) => ({ day: i + 1, title: '', am: '', pm: '', eve: '', tip: '' }));
  const courseWith = (n) => [{ title: 'ㄱ', subtitle: '', highlights: [], days: mkDays(n) }];
  ok('서버가 상한 이하는 받는다',
    !content.normalizeCourses(courseWith(LIMITS.MAX_DAYS)).error);
  ok('서버가 상한을 넘기면 거절한다',
    content.normalizeCourses(courseWith(LIMITS.MAX_DAYS + 1)).error === 'too_many_days');

  /* ── [2] 서버가 배열 순서대로 번호를 다시 매기는가 (①) ─────────────── */
  console.log('\n[2] 서버가 받은 번호를 믿지 않고 순서로 다시 매기는가 (①)');
  const scrambled = [{
    title: 'ㄱ', subtitle: '', highlights: [],
    days: [{ day: 9, title: 'A', am: '', pm: '', eve: '', tip: '' },
           { day: 3, title: 'B', am: '', pm: '', eve: '', tip: '' }],
  }];
  const norm = content.normalizeCourses(scrambled);
  ok('저장본의 번호는 순서를 따른다', renumbered(norm.courses), JSON.stringify(numbersOf(norm.courses)));
  ok('내용 순서는 보낸 그대로다', titlesOf(norm.courses).join(',') === 'A,B');

  /* ── [3] 화면: 버튼이 자리마다 맞게 그려지는가 (④) ──────────────────── */
  console.log('\n[3] 버튼이 자리마다 맞게 그려지는가 (④)');
  const dom = await bootAdmin();
  const w = dom.window, d = dom.window.document;
  w.__itiSelect('도쿄');
  w.__setCourses(w.__clone(FIVE_DAYS));

  const dayBoxes = () => Array.from(d.querySelectorAll('#iti-body .iti-day'));
  const btnIn = (box, action) =>
    Array.from(box.querySelectorAll('[data-focus-key]'))
      .find((b) => b.dataset.focusKey.endsWith(':' + action));

  ok('일자 카드가 5개 그려진다', dayBoxes().length === 5, String(dayBoxes().length));
  ok('모든 일자에 ↑·↓·복제가 있다',
    dayBoxes().every((b) => btnIn(b, 'up') && btnIn(b, 'down') && btnIn(b, 'dup')));
  ok('첫 일자의 ↑는 비활성이다', btnIn(dayBoxes()[0], 'up').disabled);
  ok('첫 일자의 ↓는 활성이다',  !btnIn(dayBoxes()[0], 'down').disabled);
  ok('마지막 일자의 ↓는 비활성이다', btnIn(dayBoxes()[4], 'down').disabled);
  ok('마지막 일자의 ↑는 활성이다',  !btnIn(dayBoxes()[4], 'up').disabled);
  ok('중간 일자는 양쪽 다 활성이다',
    !btnIn(dayBoxes()[2], 'up').disabled && !btnIn(dayBoxes()[2], 'down').disabled);
  ok('복제는 어느 자리에서나 활성이다', dayBoxes().every((b) => !btnIn(b, 'dup').disabled));
  /* 버튼을 숨기지 않고 흐리게 남기는 선택이 실제로 지켜지는가 — 자리마다 버튼 개수가
     달라지면 카드 오른쪽 끝이 들쭉날쭉해진다. */
  const btnCount = (box) => box.querySelectorAll('.iti-btn').length;
  ok('버튼 개수가 자리마다 같다',
    dayBoxes().every((b) => btnCount(b) === btnCount(dayBoxes()[2])),
    dayBoxes().map(btnCount).join(','));

  /* 이 줄의 버튼이 1개에서 4개로 늘면서 좁은 화면에서 넘쳤다. 실제 브라우저로 360px에서
     재 보니 카드 오른쪽 밖으로 47px 나갔다 — jsdom은 레이아웃을 계산하지 않아 '넘쳤다'를
     못 잰다. 그래서 여기서는 **원인이 되는 구조**가 되돌아가지 않게 막는다
     (README가 매뉴얼 CSS에 쓰는 것과 같은 방식). wrap이 없으면 flex는 넘치는 쪽을
     그냥 밖으로 내보낸다. */
  ok('자리가 없으면 헤더 줄이 줄바꿈한다 (좁은 화면에서 버튼이 카드 밖으로 나가지 않게)',
    /\.iti-day-head\s*\{[^}]*flex-wrap:\s*wrap/.test(adminSrc),
    (adminSrc.match(/\.iti-day-head\s*\{[^}]*\}/) || [''])[0]);

  /* ── [4] ↑↓가 실제로 일자를 옮기는가 ─────────────────────────────── */
  console.log('\n[4] ↑↓가 내용을 통째로 옮기는가');
  ok('처음 순서', titlesOf(w.__courses()).join(',') === '제목1,제목2,제목3,제목4,제목5');
  btnIn(dayBoxes()[2], 'up').click();
  ok('3일차가 2일차 자리로 올라간다',
    titlesOf(w.__courses()).join(',') === '제목1,제목3,제목2,제목4,제목5',
    titlesOf(w.__courses()).join(','));
  ok('내용이 통째로 따라간다',
    w.__courses()[0].days[1].am === '오전3' && w.__courses()[0].days[1].tip === '팁3');
  ok('화면 입력칸도 바뀐 순서로 다시 그려진다',
    dayBoxes()[1].querySelector('.iti-inp').value === '제목3',
    dayBoxes()[1].querySelector('.iti-inp').value);
  ok('DAY 배지는 자리 순서 그대로다',
    dayBoxes().map((b) => b.querySelector('.iti-day-no').textContent).join(',')
      === 'DAY 1,DAY 2,DAY 3,DAY 4,DAY 5');
  ok('저장 안 함 표시가 켜진다', w.__isDirty());

  btnIn(dayBoxes()[1], 'down').click();
  ok('↓로 되돌아온다', titlesOf(w.__courses()).join(',') === '제목1,제목2,제목3,제목4,제목5',
    titlesOf(w.__courses()).join(','));

  /* 두 번 눌러 두 칸 옮기기 — ⑤가 실제로 필요한 이유다 */
  btnIn(dayBoxes()[4], 'up').click();
  btnIn(dayBoxes()[3], 'up').click();
  ok('연달아 눌러 두 칸 옮길 수 있다',
    titlesOf(w.__courses()).join(',') === '제목1,제목2,제목5,제목3,제목4',
    titlesOf(w.__courses()).join(','));
  w.__setCourses(w.__clone(FIVE_DAYS));

  /* ── [5] 포커스가 옮겨간 자리를 따라가는가 (⑤) ─────────────────────── */
  console.log('\n[5] 누른 버튼이 옮겨간 자리로 따라가는가 (⑤)');
  btnIn(dayBoxes()[2], 'up').click();
  ok('↑를 누르면 한 칸 위 ↑에 커서가 간다',
    d.activeElement && d.activeElement.dataset.focusKey === 'c0d1:up',
    d.activeElement && d.activeElement.dataset.focusKey);
  btnIn(dayBoxes()[1], 'down').click();
  ok('↓를 누르면 한 칸 아래 ↓에 커서가 간다',
    d.activeElement && d.activeElement.dataset.focusKey === 'c0d2:down',
    d.activeElement && d.activeElement.dataset.focusKey);
  /* 끝자리로 밀면 그 방향 버튼이 비활성이 된다 — 커서를 비활성 버튼에 두면 그대로
     사라지므로 같은 일자의 반대쪽으로 물러나야 한다. */
  w.__setCourses(w.__clone(FIVE_DAYS));
  btnIn(dayBoxes()[3], 'down').click();
  ok('마지막 자리로 내려가면 같은 일자의 ↑로 물러난다',
    d.activeElement && d.activeElement.dataset.focusKey === 'c0d4:up',
    d.activeElement && d.activeElement.dataset.focusKey);
  ok('커서가 body로 떨어지지 않았다', d.activeElement !== d.body);

  /* ── [6] 번호가 즉시 다시 매겨지는가 (①) ───────────────────────────── */
  console.log('\n[6] 화면 안에서도 번호가 늘 순서와 같은가 (①)');
  w.__setCourses(w.__clone(FIVE_DAYS));
  ok('처음부터 맞다', renumbered(w.__courses()));
  btnIn(dayBoxes()[0], 'down').click();
  ok('순서를 바꾼 뒤에도 맞다', renumbered(w.__courses()), JSON.stringify(numbersOf(w.__courses())));
  btnIn(dayBoxes()[1], 'dup').click();
  ok('복제한 뒤에도 맞다', renumbered(w.__courses()), JSON.stringify(numbersOf(w.__courses())));
  Array.from(dayBoxes()[0].querySelectorAll('button')).find((b) => b.textContent === '일자 삭제').click();
  ok('삭제한 뒤에도 맞다', renumbered(w.__courses()), JSON.stringify(numbersOf(w.__courses())));
  d.getElementById('iti-body').querySelectorAll('.iti-actions button')[0].click();
  ok('추가한 뒤에도 맞다', renumbered(w.__courses()), JSON.stringify(numbersOf(w.__courses())));

  /* ── [7] 복제가 바로 아래에, 깊은 복사로 들어가는가 (②) ────────────── */
  console.log('\n[7] 복제 — 자리와 깊은 복사 (②)');
  w.__setCourses(w.__clone(FIVE_DAYS));
  const before = w.__courses()[0].days.length;
  btnIn(dayBoxes()[1], 'dup').click();
  ok('일자가 하나 늘었다', w.__courses()[0].days.length === before + 1);
  ok('맨 끝이 아니라 바로 아래에 들어간다',
    titlesOf(w.__courses()).join(',') === '제목1,제목2,제목2,제목3,제목4,제목5',
    titlesOf(w.__courses()).join(','));
  ok('다섯 칸이 전부 복사된다',
    ['title', 'am', 'pm', 'eve', 'tip'].every((f) => w.__courses()[0].days[2][f] === w.__courses()[0].days[1][f]));

  const orig = w.__courses()[0].days[1], copy = w.__courses()[0].days[2];
  ok('원본과 사본이 다른 객체다', orig !== copy);
  copy.am = '사본만 고친 오전';
  ok('사본을 고쳐도 원본은 그대로다', orig.am === '오전2', orig.am);
  /* 화면에도 반영되는가 — 상태만 갈라지고 화면이 같은 칸을 공유하면 증상은 똑같다 */
  w.__render();
  const amOf = (i) => Array.from(dayBoxes()[i].querySelectorAll('.iti-ta')).map((t) => t.value);
  ok('화면에서도 두 일자의 오전 칸이 다르다',
    amOf(1)[0] === '오전2' && amOf(2)[0] === '사본만 고친 오전',
    amOf(1)[0] + ' / ' + amOf(2)[0]);
  ok('복제도 저장 안 함 표시를 켠다', w.__isDirty());

  /* 기본값(ITINERARY_DB)이 오염되지 않는가 — 되돌리기가 오염된 기본값으로 되돌아가면
     증상이 화면에 안 보인다(QM에서 같은 함정을 밟았다). */
  w.__itiSelect('파리');
  const rawParis = w.__rawDefault('파리');
  const parisAmBefore = rawParis[0].days[0].am;
  btnIn(dayBoxes()[0], 'dup').click();
  w.__courses()[0].days[1].am = '내가 고친 오전';
  btnIn(dayBoxes()[0], 'down').click();
  ok('복제·이동이 data.js 기본값을 건드리지 않는다',
    rawParis[0].days[0].am === parisAmBefore, parisAmBefore + ' → ' + rawParis[0].days[0].am);

  /* ── [8] 상한에 걸리면 미리 막고 이유를 말하는가 (③) ───────────────── */
  console.log('\n[8] 상한에 걸리면 저장 전에 막는가 (③)');
  w.__itiSelect('도쿄');
  w.__setCourses([{ title: 'ㄱ', subtitle: '', highlights: [], days: mkDays(LIMITS.MAX_DAYS) }]);
  btnIn(dayBoxes()[0], 'dup').click();
  ok('상한이면 복제가 늘리지 않는다', w.__courses()[0].days.length === LIMITS.MAX_DAYS,
    String(w.__courses()[0].days.length));
  ok('복제가 최대 개수를 말해준다', d.getElementById('iti-msg').textContent.includes(String(LIMITS.MAX_DAYS)),
    d.getElementById('iti-msg').textContent);
  d.getElementById('iti-body').querySelectorAll('.iti-actions button')[0].click();
  ok('일자 추가도 같은 자리에서 막힌다', w.__courses()[0].days.length === LIMITS.MAX_DAYS);
  ok('상한 숫자를 화면 문구에 손으로 박아두지 않았다',
    !new RegExp('최대\\s*' + LIMITS.MAX_DAYS + '\\s*개').test(adminSrc),
    'limits.js를 고쳐도 화면 문구가 안 따라가면 거짓말이 된다');
  ok('상한 아래로 내려오면 다시 복제된다', (function () {
    const days = mkDays(LIMITS.MAX_DAYS - 1);
    w.__setCourses([{ title: 'ㄱ', subtitle: '', highlights: [], days }]);
    btnIn(dayBoxes()[0], 'dup').click();
    return w.__courses()[0].days.length === LIMITS.MAX_DAYS;
  })());

  /* ── [9] 담당자가 친 글자가 코드로 해석되지 않는가 (결함 생성기 ④) ─── */
  console.log('\n[9] 옮긴 일자의 내용이 HTML/JS로 해석되지 않는가');
  const EVIL = `'"><img src=x onerror=window.__pwned=1>`;
  w.__setCourses([{
    title: 'ㄱ', subtitle: '', highlights: [],
    days: [{ day: 1, title: EVIL, am: EVIL, pm: EVIL, eve: EVIL, tip: EVIL },
           { day: 2, title: '평범', am: '', pm: '', eve: '', tip: '' }],
  }]);
  btnIn(dayBoxes()[0], 'down').click();
  btnIn(dayBoxes()[1], 'dup').click();
  ok('주입된 태그가 DOM 요소로 만들어지지 않는다', d.querySelectorAll('#iti-body img').length === 0);
  ok('스크립트가 실행되지 않았다', w.__pwned === undefined);
  ok('그래도 값은 입력칸에 그대로 보인다',
    Array.from(d.querySelectorAll('#iti-body input,#iti-body textarea')).some((el) => el.value === EVIL));

  /* ── [10] 매뉴얼이 따라왔는가 ──────────────────────────────────────── */
  console.log('\n[10] 매뉴얼에 새 버튼이 설명돼 있는가');
  ok('↑↓ 순서 바꾸기를 설명한다', /일자 순서 바꾸기/.test(manualSrc));
  ok('복제 버튼을 설명한다', /복제<\/span>|<span class="btn-demo">복제<\/span>/.test(manualSrc));
  ok('사본이 별개라는 것을 적어 뒀다', /사본은 완전히 별개/.test(manualSrc));
  ok('끝자리 버튼이 흐려지는 이유를 적어 뒀다', /더 갈 곳이 없다/.test(manualSrc));
  /* 숫자는 limits.js에서 채운다 — 매뉴얼에 손으로 적으면 상한을 바꾼 날 거짓말이 된다 */
  ok('일자 상한을 data-fact로 적었다', /data-fact="MAX_DAYS"/.test(manualSrc));
  ok('옮겨도 문구 속 "첫날/마지막 날"은 안 바뀐다고 경고한다', /첫날/.test(manualSrc) && /그대로 남습니다/.test(manualSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__itiSelect = (k) => { itiState.dirty = false; itiSelectDest(k); };
  window.__courses = () => itiState.courses;
  window.__setCourses = (c) => { itiState.courses = c; itiState.dirty = false; itiRenderBody(); };
  window.__render = () => itiRenderBody();
  window.__isDirty = () => itiState.dirty;
  window.__clone = (v) => JSON.parse(JSON.stringify(v));
  /* 원본 상수를 그대로 넘긴다(복사하지 않는다) — 기본값 오염 검사가 의미를 가지려면
     테스트가 보는 것이 화면이 읽는 바로 그 객체여야 한다. */
  window.__rawDefault = (k) => ITINERARY_DB[k];
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

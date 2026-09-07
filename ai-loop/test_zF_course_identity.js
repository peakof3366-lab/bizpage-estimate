/* ═══════════════════════════════════════════════════════════════════════════
   ZF — 창고의 코스를 **무엇으로 구별하는가**

   2026-09-07 정리 중 운영 DB를 훑다 나왔다. 실측:
     · 일정 창고 22개 목적지 · 코스 64개
     · **이름이 겹치는 코스 33개** — 견적서에서 심은 코스는 제목이 전부
       「○○ 견적서 일정 (검토 필요)」이고 출처메모까지 글자가 같았다.
     · 그런데 **내용까지 같은 것은 2개뿐**이다(오키나와 1 · 삿포로 1).
       나머지 31개는 **서로 다른 일정**인데 화면에서 구별이 안 되던 것이다.
       나트랑 둘은 김해 BX781 · 인천 RS0527로 **출발지부터 다르다.**

   🔴 「이름이 같다」와 「내용이 같다」는 다른 말이다. 이름만 보고 지웠으면
     **서로 다른 견적서에서 온 일정이 사라졌다.**

   ■ 고친 것 둘

   ① 심는 도구가 **어느 문서에서 왔는지** 남긴다. 엑셀 쪽(`seed_courses_from_bd`)은
      처음부터 파일명을 넣고 있었는데 **PDF 쪽만 안 넣고** 있었다 — 같은 일을 하는
      두 도구가 달랐다(결함 생성기 ①).
   ② 창고 화면이 **일수와 첫날**을 꺼내 보인다. 구별할 것이 이미 안에 있는데
      화면이 안 보여 주고 있었다. 값을 지어내지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZF 코스 구별`);
  process.exit(fail ? 1 : 0);
};

const CORPUS = read('ai-loop/seed_courses_from_corpus.js');
const BD = read('ai-loop/seed_courses_from_bd.js');
const ADMIN = read('admin.html');
const { recItinToCourse } = require(path.join(ROOT, 'rec_fallbacks.js'));

console.log('\n[1] 심는 도구 둘이 같은 것을 남긴다');
{
  /* 🔴 두 도구가 **같은 모양**으로 출처를 남겨야 한다 — 한쪽만 남기면 창고에서
     어느 코스는 출처가 있고 어느 코스는 없는 상태가 된다. */
  ok('① 엑셀 도구가 파일명을 남긴다', /recItinToCourse\([\s\S]{0,80}\+ x\.file\)/.test(BD));
  ok('① 🔴 PDF 도구도 파일명을 남긴다', /recItinToCourse\([\s\S]{0,140}\+ r\.file\)/.test(CORPUS),
    (/recItinToCourse\([^)]*\)/.exec(CORPUS) || [''])[0]);
  ok('① 일수도 함께 남긴다', /견적서 PDF에서 읽은 일정 \(' \+ itin\.days\.length \+ '일\)/.test(CORPUS));
  /* ⚠ 기본 문구로 되돌아가면 이 결함이 그대로 재현된다 */
  ok('① 🔴 기본 문구로 부르지 않는다', !/recItinToCourse\(itin, r\.destination\);/.test(CORPUS));
}

console.log('\n[2] 변환기 자체는 그대로 — 부르는 쪽이 정한다');
{
  const c1 = recItinToCourse({ days: [{ place: '김해 · BX781 · 나트랑', lines: ['전용차량'] }] }, '나트랑');
  const c2 = recItinToCourse({ days: [{ place: '인천 · RS0527 · 나트랑', lines: ['전용차량'] }] }, '나트랑',
    '견적서 PDF에서 읽은 일정 (1일) · 나트랑_A사.pdf');
  ok('② 제목은 목적지 기준 그대로', c1.title === '나트랑 견적서 일정 (검토 필요)', c1.title);
  ok('② note를 주면 그것이 출처가 된다', /나트랑_A사\.pdf/.test(c2.sourceNote), c2.sourceNote);
  ok('② 안 주면 지금까지와 같다', /견적서 PDF에서 읽은 일정/.test(c1.sourceNote), c1.sourceNote);
  /* 🔴 내용은 서로 다르다 — 이것이 「이름이 같다 ≠ 내용이 같다」의 실물이다 */
  ok('② 🔴 첫날이 서로 다르다', c1.days[0].title !== c2.days[0].title,
    c1.days[0].title + ' vs ' + c2.days[0].title);
}

/* ── 화면 ─────────────────────────────────────────────────────────────────── */
function boot() {
  return new Promise((resolve) => {
    const dom = new JSDOM(read('admin.html'), {
      runScripts: 'dangerously', resources: 'usable',
      url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
      virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
        w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });
    const w = dom.window;
    const finish = () => setTimeout(() => resolve(w), 120);
    if (w.document.readyState === 'complete') finish();
    else w.addEventListener('load', finish);
  });
}

const mkCourse = (first, days) => ({
  title: '나트랑 견적서 일정 (검토 필요)', subtitle: '', highlights: [],
  days: Array.from({ length: days }, (_, i) => ({
    day: i + 1, title: i === 0 ? first : '', am: '', pm: '', eve: '', tip: '' })),
  source: 'quote', sourceNote: '견적서 PDF에서 읽은 일정 (' + days + '일)', pending: true,
});

(async () => {
  console.log('\n[3] 🔴 화면이 구별할 것을 꺼내 보인다 — 제목이 같아도');
  {
    const w = await boot();
    if (typeof w.itiRenderCourse !== 'function') {
      fail++; console.log('  ✗ 코스 렌더 함수를 못 찾았다 — 이 묶음은 의미가 없다');
      return done();
    }
    const a = w.itiRenderCourse(mkCourse('김해 · BX781 · 나트랑 · 전용차량', 5), 0);
    const b = w.itiRenderCourse(mkCourse('인천 · RS0527 · 나트랑 · 전용차량', 5), 1);
    const headOf = (el) => el.querySelector('.iti-course-head').textContent.replace(/\s+/g, ' ').trim();
    ok('③ 구별선이 붙는다', !!a.querySelector('.iti-course-hint'));
    ok('③ 일수가 보인다', /5일/.test(headOf(a)), headOf(a));
    ok('③ 🔴 첫날이 보인다', /BX781/.test(headOf(a)), headOf(a));
    /* 🔴 이 검사의 전부 — 제목이 같아도 두 줄이 **다르게 읽혀야** 한다 */
    ok('③ 🔴 두 코스가 화면에서 달라진다', headOf(a) !== headOf(b),
      headOf(a) + ' vs ' + headOf(b));
    ok('③ 기존 배지는 그대로 있다', /견적서 일정/.test(headOf(a)) && /검토 전/.test(headOf(a)));

    /* 일정이 비어 있어도 죽지 않는다 — 옛 저장분에는 days가 없을 수 있다 */
    const empty = w.itiRenderCourse({ title: 'x', days: [] }, 0);
    ok('③ 일정이 비어도 터지지 않는다', !!empty);
    /* 값을 지어내지 않는다 — 없는 첫날을 만들어 붙이지 않는다 */
    const h = empty.querySelector('.iti-course-hint');
    ok('③ 🔴 없는 것을 지어내지 않는다', !h || !/1일차/.test(h.textContent), h && h.textContent);
  }

  console.log('\n[4] 잴 수 있는 것은 취향이 아니다 — 글자 크기');
  {
    /* .68rem = 10.88px이라 「글자는 11px 이상」에 걸렸다 */
    ok('④ 출처 배지가 11px 이상', /\.iti-src-quote \{ font-size: \.7rem/.test(ADMIN),
      (/\.iti-src-quote \{ font-size: [^;]+/.exec(ADMIN) || [''])[0]);
    ok('④ 구별선도 11px 이상', /\.iti-course-hint \{ font-size: \.72rem/.test(ADMIN));
    /* ⚠ 흐림은 색으로 정한다 — opacity는 대비를 한 번 더 깎는다 */
    ok('④ 구별선에 opacity를 쓰지 않는다',
      !/\.iti-course-hint \{[^}]*opacity/.test(ADMIN));
  }

  done();
})().catch((e) => { console.error('실행 오류:', e); process.exit(1); });

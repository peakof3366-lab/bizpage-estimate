/* RK 검증: 관리자의 '코스 A·B·C'와 고객의 '방식 A·B'가 같은 규칙으로 이어지는가.

   왜 —
   사용자가 관리자 화면과 고객 화면을 동시에 열어 놓고 **"어디가 어디인지 못 찾겠다"**고 했다.
   찾을 수 없는 게 맞았다. 두 가지가 겹쳐 있었다:

   ① **✨ 방식 A·B의 네 칸이 코스가 있는 목적지에서는 고객에게 안 나간다.**
      script.js의 renderStep3는 코스가 있으면 _coursesToDestRec()로 **코스의 제목·한 줄
      설명·핵심 하이라이트**를 카드에 넣는다. 담당자가 ✨에 써 넣은 배지·설명·포인트·
      기대효과는 코스가 **하나도 없는** 목적지에서만 쓰인다.
      그런데 관리자 라벨은 그냥 "일정 탐색 화면의 배지"라고 적혀 있었다.

   ② **코스 A가 방식 A가 아니다.** PROGRAM_PRIORITY가 고객이 고른 프로그램 유형에 따라
      순서를 바꾼다. 도쿄 + 언어 집중 연수 → 방식 A는 **코스 C**다.

   이 파일이 고정하는 것:
   ① 매핑 규칙이 **한 곳**(rec_fallbacks.js)에 있고 고객·관리자가 둘 다 그것을 부른다.
      규칙이 두 벌이 되면 관리자 화면이 고객과 다른 매핑을 말하게 되고, 그건 지금보다 나쁘다.
   ② 규칙이 예전 getItineraries와 **같은 답**을 낸다(범위 초과·코스 1개 분기까지).
   ③ PROGRAM_TYPES가 index.html의 select와 어긋나지 않는다.
   ④ 관리자 코스 탭이 그 매핑을 배지로 보여준다.
   ⑤ ✨ 구역이 "지금 이 네 칸이 쓰이는가"를 화면에서 말한다.

   실행: node ai-loop/test_rK_course_role.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');
const RF = require('../rec_fallbacks.js');
const DATA = require('../data.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const adminSrc  = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const indexSrc  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptSrc = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const manualSrc = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');

const { PROGRAM_TYPES, PROGRAM_PRIORITY } = DATA;
const { recResolvePlanCourseIdx, recPlanFromCourse } = RF;

/* 예전 getItineraries가 하던 계산 그대로 — 새 함수가 같은 답을 내는지 대조할 기준.
   ⚠ 이걸 새 함수로 구현하면 대조가 아니라 자기 자신과 비교하는 셈이 된다. */
function legacyPair(courses, destKey, programType) {
  if (programType && courses.length >= 2) {
    const priority = (PROGRAM_PRIORITY[destKey] || {})[programType];
    if (priority) {
      return [courses[priority[0]] || courses[0], courses[priority[1]] || courses[1] || courses[0]];
    }
  }
  return [courses[0], courses[1] || courses[0]];
}

(async () => {
  /* ── [1] 규칙이 한 곳에 있고 둘 다 그것을 부르는가 (①) ─────────────────── */
  console.log('[1] 매핑 규칙이 한 곳에 있는가 (①)');
  ok('rec_fallbacks.js가 매핑 함수를 내보낸다',
    typeof recResolvePlanCourseIdx === 'function' && typeof recPlanFromCourse === 'function');
  ok('script.js가 그 함수를 부른다', /recResolvePlanCourseIdx\(/.test(scriptSrc));
  ok('script.js가 코스→카드 변환도 그 함수를 부른다', /recPlanFromCourse\(/.test(scriptSrc));
  ok('admin.html도 같은 함수를 부른다', /recResolvePlanCourseIdx\(/.test(adminSrc));
  ok('admin.html이 코스→카드 변환도 같은 함수를 쓴다', /recPlanFromCourse\(/.test(adminSrc));
  /* 규칙을 다시 적어 두지 않았는지 — 옛 코드 조각이 남아 있으면 두 벌이다 */
  ok('script.js에 옛 우선순위 계산이 남아 있지 않다',
    !/courses\[priority\[0\]\]/.test(scriptSrc), '남아 있으면 두 벌이 된 것이다');
  ok('admin.html에 우선순위 계산을 옮겨 적지 않았다',
    !/prio\[type\]\s*\)\s*\?\s*prio\[type\]/.test(adminSrc));

  /* ── [2] 새 규칙이 예전과 같은 답을 내는가 (②) ─────────────────────────── */
  console.log('\n[2] 새 규칙이 예전 getItineraries와 같은 답을 내는가 (②)');
  const types = Object.keys(PROGRAM_TYPES);
  let mismatch = 0, checked = 0;
  Object.keys(PROGRAM_PRIORITY).forEach((destKey) => {
    /* 코스 개수를 1~4로 바꿔 가며 본다 — 범위 초과·코스 1개 분기가 여기서 드러난다 */
    for (let n = 1; n <= 4; n++) {
      const courses = Array.from({ length: n }, (_, i) => ({ title: 'C' + i }));
      types.concat(['']).forEach((t) => {
        checked++;
        const want = legacyPair(courses, destKey, t);
        const idx = recResolvePlanCourseIdx(n, PROGRAM_PRIORITY[destKey], t);
        const got = [courses[idx[0]], courses[idx[1]]];
        if (got[0] !== want[0] || got[1] !== want[1]) {
          mismatch++;
          if (mismatch <= 3) console.log('      ' + destKey + ' n=' + n + ' type=' + (t || '(없음)')
            + ' 기대 ' + JSON.stringify(want.map(c => c.title)) + ' 실제 ' + JSON.stringify(got.map(c => c.title)));
        }
      });
    }
  });
  ok('모든 목적지 × 유형 × 코스 수에서 예전과 같은 답이다 (' + checked.toLocaleString() + '건)',
    mismatch === 0, mismatch + '건 불일치');
  ok('코스가 없으면 null을 돌려준다', recResolvePlanCourseIdx(0, {}, 'industry') === null);

  /* 도쿄는 사용자가 실제로 헷갈렸던 사례라 값을 못 박는다 */
  const tokyo = PROGRAM_PRIORITY['도쿄'];
  ok('도쿄 + 언어 집중 연수 → 방식 A는 코스 C(인덱스 2)다',
    recResolvePlanCourseIdx(3, tokyo, 'language')[0] === 2,
    JSON.stringify(recResolvePlanCourseIdx(3, tokyo, 'language')));
  ok('도쿄 + 리더십 → 방식 A는 코스 B(인덱스 1)다',
    recResolvePlanCourseIdx(3, tokyo, 'leadership')[0] === 1);
  ok('도쿄 + 산업체 → 방식 A는 코스 A(인덱스 0)다',
    recResolvePlanCourseIdx(3, tokyo, 'industry')[0] === 0);

  /* 코스→카드 변환도 고객 화면이 쓰는 그대로인가 */
  const conv = recPlanFromCourse({ title: 'T', subtitle: 'S',
    highlights: ['h1', 'h2', 'h3', 'h4'], days: [{ title: 'd1' }, { title: 'd2' }, { title: 'd3' }] });
  ok('코스 제목이 방식 배지가 된다', conv.tag === 'T');
  ok('코스 한 줄 설명이 카드 설명이자 기대 효과가 된다', conv.desc === 'S' && conv.value === 'S');
  ok('핵심 하이라이트는 앞 3개만 쓴다', conv.points.join(',') === 'h1,h2,h3', conv.points.join(','));
  ok('일별 활동은 첫날·마지막날을 뺀 가운데다', conv.items.join(',') === 'd2', conv.items.join(','));

  /* ── [3] PROGRAM_TYPES가 고객 화면 select와 어긋나지 않는가 (③) ───────── */
  console.log('\n[3] 프로그램 유형 이름이 고객 화면과 같은가 (③)');
  const optRe = /<select id="programType"[^>]*>([\s\S]*?)<\/select>/;
  const block = indexSrc.match(optRe);
  ok('index.html에서 programType select를 찾았다', !!block);
  const opts = [];
  if (block) {
    const re = /<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g;
    let m;
    while ((m = re.exec(block[1]))) opts.push({ value: m[1], label: m[2].trim() });
  }
  ok('키 집합이 같다', opts.map((o) => o.value).join(',') === Object.keys(PROGRAM_TYPES).join(','),
    opts.map((o) => o.value).join(',') + ' vs ' + Object.keys(PROGRAM_TYPES).join(','));
  opts.forEach((o) => {
    ok('“' + o.value + '”의 이름이 고객 화면과 같다',
      PROGRAM_TYPES[o.value] && PROGRAM_TYPES[o.value].label === o.label,
      o.label + ' vs ' + (PROGRAM_TYPES[o.value] ? PROGRAM_TYPES[o.value].label : '(없음)'));
  });
  ok('PROGRAM_PRIORITY의 유형 키도 같은 집합이다',
    Object.values(PROGRAM_PRIORITY).every((v) =>
      Object.keys(v).every((k) => PROGRAM_TYPES[k])),
    '우선순위 표에 이름 없는 유형이 있으면 배지가 빈다');
  ok('짧은 이름이 다 있다', Object.values(PROGRAM_TYPES).every((t) => t.short && t.short.length <= 4));

  /* ── [4]·[5] 화면이 실제로 말해 주는가 ─────────────────────────────────── */
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;
  const tabs = () => Array.from(d.querySelectorAll('#iti-ctabs .iti-ctab'));
  const roleTags = (i) => Array.from(tabs()[i].querySelectorAll('.iti-ctab-role')).map((e) => e.textContent);

  console.log('\n[4] 코스 탭이 매핑을 보여주는가 (④)');
  w.__setup('도쿄');
  ok('코스 탭이 3개다', tabs().length === 3, String(tabs().length));
  ok('코스 A에 방식 배지가 붙는다', roleTags(0).length > 0, roleTags(0).join(' | '));
  ok('코스 A는 산업·교육에서 방식 A다',
    roleTags(0).some((t) => /방식 A ←.*산업/.test(t) && /교육/.test(t)), roleTags(0).join(' | '));
  ok('코스 A는 리더십에서는 방식 B다',
    roleTags(0).some((t) => /방식 B ←.*리더십/.test(t)), roleTags(0).join(' | '));
  ok('코스 C는 언어에서 방식 A다',
    roleTags(2).some((t) => /방식 A ←.*언어/.test(t)), roleTags(2).join(' | '));
  ok('배지에 전체 이름이 툴팁으로 붙는다',
    tabs()[0].querySelector('.iti-ctab-role').title.includes('연수'),
    tabs()[0].querySelector('.iti-ctab-role').title);
  /* 배지는 방식별로 묶어야 한다 — 유형마다 하나면 탭이 무너진다 */
  ok('탭 하나에 배지는 최대 2개다 (방식별로 묶는다)',
    tabs().every((t) => t.querySelectorAll('.iti-ctab-role').length <= 2),
    tabs().map((t) => t.querySelectorAll('.iti-ctab-role').length).join(','));

  console.log('\n[5] ✨ 구역이 "지금 이 네 칸이 쓰이는가"를 말하는가 (⑤)');
  const reality = () => d.querySelector('#rec-body .rec-reality');
  ok('코스가 있으면 안 나간다고 말한다',
    /나가지 않습니다/.test(reality().textContent), reality().textContent.slice(0, 60));
  ok('코스가 몇 개인지 숫자로 말한다', /코스가 3개/.test(reality().textContent),
    reality().textContent.slice(0, 60));
  ok('그럼 어디를 고쳐야 하는지 알려준다', /날짜별 일정/.test(reality().textContent));
  ok('그리로 가는 버튼이 있다', !!reality().querySelector('button'));
  ok('실제로 쓰이는 칸이 무엇인지 짚어 준다',
    /일별 주요 활동/.test(reality().textContent));
  ok('안 쓰이는 네 칸을 흐리게 표시한다',
    d.querySelectorAll('#rec-body .rec-fld-idle').length === 8,   /* A·B 각 4칸 */
    String(d.querySelectorAll('#rec-body .rec-fld-idle').length));
  ok('“일별 주요 활동”은 흐리지 않다',
    Array.from(d.querySelectorAll('#rec-body .rec-fld-idle')).every(
      (el) => !/일별 주요 활동/.test(el.textContent)));

  /* 코스를 다 지우면 네 칸이 다시 살아난다 — 상태에 따라 말이 바뀌어야 한다 */
  w.__setCourses([]);
  ok('코스가 없으면 다 나간다고 말한다',
    /모두 고객에게 나갑니다/.test(reality().textContent), reality().textContent.slice(0, 60));
  ok('그때는 흐린 칸이 없다', d.querySelectorAll('#rec-body .rec-fld-idle').length === 0,
    String(d.querySelectorAll('#rec-body .rec-fld-idle').length));
  ok('라벨도 조건 없이 바뀐다',
    !/코스가 없을 때만/.test(d.getElementById('rec-body').textContent));

  /* ── [6] 매뉴얼 ────────────────────────────────────────────────────────── */
  console.log('\n[6] 매뉴얼이 이 관계를 설명하는가');
  ok('코스 A와 방식 A가 다르다는 것을 적는다',
    /코스 A[\s\S]{0,200}방식 A/.test(manualSrc) || /방식 A[\s\S]{0,200}코스 A/.test(manualSrc));
  ok('프로그램 유형에 따라 바뀐다고 적는다', /프로그램 유형/.test(manualSrc));
  ok('코스가 있으면 ✨ 네 칸이 안 나간다고 적는다',
    /안 나갑니다|나가지 않습니다/.test(manualSrc));
  ok('그럼 어디를 고쳐야 하는지 매뉴얼도 알려준다',
    /코스의 제목[\s\S]{0,60}한 줄 설명/.test(manualSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setup = (k) => {
    itiState.loaded = true; itiState.dirty = false; recState.dirty = false;
    itiFillDestSelect(); itiSelectDest(k);
  };
  window.__setCourses = (c) => { itiState.courses = c; itiRenderBody(); recRenderBody(); };
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
  await new Promise((r) => setTimeout(r, 80));
  return dom;
}

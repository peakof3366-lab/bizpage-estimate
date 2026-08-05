/* RS 검증: 미리보기 안에서 **바로 고치기**.

   왜 —
   예전 미리보기는 고객 화면이 아니라 설명서였다. 자리마다 "이 자리는 어디에서 오는가"가
   늘 붙어 있어서 정작 고객이 보는 모양이 안 보였고("머가먼지 모르겠다"), 고치려면 창을
   닫고 아래 편집 칸에서 그 자리에 해당하는 칸을 **찾아야** 했다. 찾는 일 자체가 이 화면의
   원래 문제였다(RK).

   그래서 고객 화면을 그대로 보여주고 그 위에서 고치게 했다. 이 구조가 조용히 망가지는
   길이 몇 가지 있고, 이 파일이 그것들을 막는다:
   ① **엉뚱한 곳에 저장된다.** 코스가 있는 목적지에서 카드 배지는 코스 제목에서 온다.
      배지를 고쳤는데 ✨의 방식 이름에 저장하면, 화면은 안 바뀌고 고친 글은 사라진 것처럼
      보인다. 담당자가 두 화면을 못 맞추던 원인이 정확히 이것이었다.
   ② **저장 안 되는 칸을 고치게 둔다.** 자동으로 만들어진 날은 저장할 곳이 없다.
      고칠 수 있게 두면 고쳐 놓고 저장했는데 아무 데도 안 남는다.
   ③ **다른 줄이 조용히 사라진다.** 기본 문구가 보이던 목록은 배열이 비어 있다.
      한 줄만 고치면 나머지 보이던 줄이 없어지고 배열에 구멍이 생긴다.
   ④ **틀린 구역이 dirty가 된다.** 두 구역은 저장 경로가 다르다(QU). 잘못 걸면 저장이
      동료의 작업을 되돌린다.
   ⑤ **빈 칸 때문에 시간대가 밀린다.** 오후가 비면 그 줄은 안 그려진다. 슬롯 순서로 세면
      저녁 문장이 오후에 저장된다.

   실행: node ai-loop/test_rS_pv_edit.js  (프로젝트 루트에서) */
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

const REC = {
  a: { tag: '역량강화', desc: 'A 설명', points: ['A포인트1', 'A포인트2'],
       items: ['A활동1', 'A활동2'], value: 'A 기대효과' },
  b: { tag: '화합형', desc: 'B 설명', points: ['B포인트1'],
       items: ['B활동1'], value: 'B 기대효과' },
};
const COURSES = [
  { title: '코스가 제목', subtitle: '코스가 한 줄', highlights: ['하이1', '하이2', '하이3', '하이4'],
    days: [
      { day: 1, title: '첫날', am: '출국', pm: '체크인', eve: '만찬', tip: '환전' },
      { day: 2, title: '가운데', am: '공장', pm: '', eve: '석식', tip: '' },
      { day: 3, title: '마지막', am: '체크아웃', pm: '탑승', eve: '도착', tip: '' },
    ] },
  { title: '코스나 제목', subtitle: '코스나 한 줄', highlights: ['나하이1'],
    days: [{ day: 1, title: 'ㄱ', am: 'ㄱ오전' }, { day: 2, title: 'ㄴ', am: 'ㄴ오전' }] },
];

(async () => {
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;
  const btn = d.getElementById('rec-preview');
  const pdoc = () => d.getElementById('recPvFrame').contentDocument;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const pick = (sel, i) => Array.from(pdoc().querySelectorAll(sel))[i || 0];
  /* 사람이 고치는 흉내 — 글자를 바꾸고 칸을 떠난다 */
  const edit = async (el, text) => {
    el.textContent = text;
    el.dispatchEvent(new w.Event('blur'));
    await tick();
  };

  /* ── [1] 손잡이가 고객이 보는 자리에 달리는가 ────────────────────────── */
  console.log('[1] 고객 화면 위에서 바로 고칠 수 있는가');
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(REC); btn.click();
  await tick();
  ok('방식 이름을 고칠 수 있다', !!pick('.plan-type-lbl.pv-edit'));
  ok('한 줄 설명을 고칠 수 있다', !!pick('.plan-desc.pv-edit'));
  /* RU: 탭이 갈려 한 번에 한 방식만 나온다 — 방식 A의 포인트는 두 줄이다 */
  ok('핵심 포인트를 줄마다 고칠 수 있다',
    pdoc().querySelectorAll('.plan-points li.pv-edit').length === 2,
    String(pdoc().querySelectorAll('.plan-points li.pv-edit').length));
  ok('기대 효과 문구를 고칠 수 있다', !!pick('.plan-value-text.pv-edit'));
  ok('어디를 고치는 것인지 알려준다',
    /눌러서 고칩니다/.test(pick('.plan-desc.pv-edit').getAttribute('title') || ''),
    pick('.plan-desc.pv-edit').getAttribute('title'));
  ok('글자만 받는다 (서식 붙여넣기 차단)',
    pick('.plan-desc.pv-edit').getAttribute('contenteditable') === 'plaintext-only',
    pick('.plan-desc.pv-edit').getAttribute('contenteditable'));

  /* ── [2] 코스가 없으면 ✨에 저장되는가 ───────────────────────────────── */
  console.log('\n[2] 코스가 없는 목적지 — ✨ 방식 A·B에 저장되는가');
  await edit(pick('.plan-desc.pv-edit'), '내가 고친 설명');
  ok('✨의 한 줄 설명이 바뀐다', w.__rec().a.desc === '내가 고친 설명', w.__rec().a.desc);
  ok('✨ 구역이 저장 대기가 된다', w.__dirty().rec === true);
  ok('📅 구역은 건드리지 않는다', w.__dirty().iti === false);
  ok('고친 값이 화면에도 남는다',
    pick('.plan-desc.pv-edit').textContent === '내가 고친 설명',
    pick('.plan-desc.pv-edit').textContent);

  /* ── [3] 코스가 있으면 **코스**에 저장되는가 (①) ─────────────────────── */
  console.log('\n[3] 코스가 있는 목적지 — 코스에 저장되는가 (가장 중요)');
  w.__select('도쿄'); w.__setCourses(COURSES); w.__setRec(REC); btn.click();
  await tick();
  ok('배지가 코스 제목을 보여준다', pick('.plan-type-lbl').textContent === '코스가 제목',
    pick('.plan-type-lbl').textContent);
  await edit(pick('.plan-type-lbl.pv-edit'), '새 코스 제목');
  ok('배지 수정이 **코스 제목**으로 간다', w.__courses()[0].title === '새 코스 제목',
    w.__courses()[0].title);
  ok('✨의 방식 이름은 건드리지 않는다', w.__rec().a.tag === '역량강화', w.__rec().a.tag);
  ok('📅 구역이 저장 대기가 된다', w.__dirty().iti === true);

  /* 한 줄 설명과 기대 효과는 코스에서 올 때 같은 값이다 — 함께 바뀌어야 맞다 */
  await edit(pick('.plan-desc.pv-edit'), '새 한 줄');
  ok('설명 수정이 코스의 한 줄 설명으로 간다', w.__courses()[0].subtitle === '새 한 줄',
    w.__courses()[0].subtitle);
  ok('견적서 기대 효과 문구도 함께 바뀐다',
    pick('.plan-value-text').textContent === '새 한 줄',
    pick('.plan-value-text').textContent);
  ok('함께 바뀐다는 것을 미리 알려준다',
    /함께 바뀝니다/.test(pick('.plan-desc.pv-edit').getAttribute('title') || ''),
    pick('.plan-desc.pv-edit').getAttribute('title'));

  /* 포인트는 코스 하이라이트로 — 카드에 안 보이는 4번째가 살아 있어야 한다 (③) */
  await edit(pick('.plan-points li.pv-edit', 1), '고친 하이라이트');
  ok('포인트 수정이 코스 하이라이트로 간다',
    w.__courses()[0].highlights[1] === '고친 하이라이트', w.__courses()[0].highlights.join(','));
  ok('카드에 안 보이던 4번째 하이라이트가 살아 있다',
    w.__courses()[0].highlights.length === 4 && w.__courses()[0].highlights[3] === '하이4',
    w.__courses()[0].highlights.join(','));

  /* ── [4] 일자 — 담당자가 쓴 날만 고칠 수 있는가 (②⑤) ────────────────── */
  console.log('\n[4] 일자 카드 — 쓴 날만 고칠 수 있는가');
  const cards = () => Array.from(pdoc().querySelectorAll('.itin-day-card'));
  ok('일자 카드가 그려진다', cards().length > 0, String(cards().length));
  const authored = cards().filter((c) => !c.className.includes('pv-auto'));
  const auto = cards().filter((c) => c.className.includes('pv-auto'));
  ok('담당자가 쓴 날이 있다', authored.length > 0, String(authored.length));
  ok('자동으로 만들어진 날도 있다 (코스 3일 < 고른 4일)', auto.length > 0, String(auto.length));
  ok('자동인 날에는 손잡이를 안 단다',
    auto.every((c) => c.querySelectorAll('.pv-edit').length === 0),
    '고쳐도 저장될 곳이 없다');
  ok('자동인 날이라고 화면에 적어 준다',
    auto.every((c) => !!c.querySelector('.pv-auto-tag')));
  ok('왜 못 고치는지 말해 준다',
    /코스에 일자를 추가/.test(auto[0].querySelector('.pv-auto-tag').getAttribute('title') || ''),
    auto[0].querySelector('.pv-auto-tag').getAttribute('title'));
  ok('쓴 날은 제목을 고칠 수 있다',
    authored.every((c) => !!c.querySelector('.itin-day-title.pv-edit')));

  /* 2번째 일자는 **오후가 비어 있다** — 줄이 안 그려진다. 순서로 세면 저녁이 오후로 간다 */
  const day2 = authored.find((c) => (c.querySelector('.itin-day-title') || {}).textContent === '가운데');
  ok('오후가 빈 일자는 줄이 두 개다 (오전·저녁)',
    !!day2 && day2.querySelectorAll('.itin-slot').length === 2,
    day2 ? String(day2.querySelectorAll('.itin-slot').length) : '(못 찾음)');
  const slotBodies = Array.from(day2.querySelectorAll('.itin-slot-content'));
  await edit(slotBodies[1], '고친 저녁');
  ok('저녁 수정이 저녁 칸으로 간다 (오후로 밀리지 않는다)',
    w.__courses()[0].days[1].eve === '고친 저녁' && w.__courses()[0].days[1].pm === '',
    'eve=' + w.__courses()[0].days[1].eve + ' / pm=' + w.__courses()[0].days[1].pm);

  const day1 = authored[0];
  await edit(day1.querySelector('.itin-day-title.pv-edit'), '고친 첫날');
  ok('일자 제목 수정이 그 일자로 간다', w.__courses()[0].days[0].title === '고친 첫날',
    w.__courses()[0].days[0].title);

  /* ── [5] 기본 문구 자리를 고치면 보이던 줄이 다 저장되는가 (③) ────────── */
  console.log('\n[5] 기본 문구가 보이던 목록을 고칠 때');
  w.__select('도쿄'); w.__setCourses([]);
  w.__setRec({ a: { tag: '', desc: '', points: [], items: [], value: '' },
               b: { tag: '', desc: '', points: [], items: [], value: '' } });
  btn.click(); await tick();
  /* 카드는 A·B 두 장이다 — 방식 A 것만 본다 */
  const shown = Array.from(pdoc().querySelector('.plan-card').querySelectorAll('.plan-points li'))
    .map((e) => e.textContent);
  ok('비어 있어도 기본 문구 3줄이 보인다', shown.length === 3, shown.join(','));
  await edit(pick('.plan-points li.pv-edit', 1), '둘째 줄만 고침');
  const savedPts = w.__rec().a.points;
  ok('보이던 줄이 통째로 저장된다', savedPts.length === 3, savedPts.join(','));
  ok('배열에 구멍이 생기지 않는다', savedPts.every((s) => typeof s === 'string' && s.length > 0),
    JSON.stringify(savedPts));
  ok('고친 줄만 바뀐다', savedPts[1] === '둘째 줄만 고침' && savedPts[0] === shown[0],
    savedPts.join(','));

  /* 비우면 그 줄이 없어진다 */
  await edit(pick('.plan-points li.pv-edit', 0), '');
  ok('줄을 비우면 그 줄이 없어진다', w.__rec().a.points.length === 2,
    w.__rec().a.points.join(','));

  /* ── [5-b] 줄을 늘릴 수 있는가 (RV) ────────────────────────────────────
     글자는 고쳐지는데 **줄을 추가할 수가 없었다**(사용자 지적). Enter가 편집을 끝내기만
     했다. 목록에서는 Enter가 아래에 줄을 하나 만들고, 카드 바깥의 손잡이로도 만든다
     (목록이 통째로 비면 누를 줄 자체가 없어서 Enter만으로는 못 늘린다). */
  console.log('\n[5-b] 줄을 늘릴 수 있는가');
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(REC); btn.click(); await tick();
  const li = (i) => Array.from(pdoc().querySelectorAll('.plan-points li'))[i];
  ok('처음 방식 A 포인트는 두 줄이다', w.__rec().a.points.length === 2,
    w.__rec().a.points.join(','));
  /* 가운데(첫) 줄에서 Enter — 끝이 아니라 **그 줄 바로 아래**에 생겨야 찾을 수 있다 */
  li(0).dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  ok('Enter로 줄이 하나 늘어난다', w.__rec().a.points.length === 3,
    w.__rec().a.points.join(','));
  ok('누른 줄 바로 아래에 생긴다',
    w.__rec().a.points[0] === 'A포인트1' && w.__rec().a.points[1] === ''
    && w.__rec().a.points[2] === 'A포인트2',
    JSON.stringify(w.__rec().a.points));
  ok('새 줄이 화면에도 나온다', pdoc().querySelectorAll('.plan-points li').length === 3,
    String(pdoc().querySelectorAll('.plan-points li').length));
  ok('커서가 새 줄로 간다',
    (pdoc().activeElement || {}).dataset && pdoc().activeElement.dataset.pvid === 'point:a:1',
    (pdoc().activeElement || {}).dataset ? pdoc().activeElement.dataset.pvid : '(없음)');
  /* 새 줄에 글을 넣으면 그 자리에 저장된다 */
  await edit(li(1), '끼워 넣은 줄');
  ok('새 줄에 쓴 글이 그 자리에 저장된다',
    w.__rec().a.points.join(',') === 'A포인트1,끼워 넣은 줄,A포인트2',
    w.__rec().a.points.join(','));

  /* 손잡이로도 늘어난다 — 목록이 비어 있을 때 유일한 길이다 */
  const addBtn = () => pdoc().querySelector('.pv-addbtn');
  ok('카드 바깥에 줄 추가 손잡이가 있다', !!addBtn());
  ok('손잡이가 카드 안에 들어가 있지 않다', !addBtn().closest('.plan-card'),
    '카드 안에 넣으면 고객이 보는 카드 높이가 달라진다');
  addBtn().click(); await tick();
  ok('손잡이로 맨 끝에 줄이 붙는다', w.__rec().a.points.length === 4,
    w.__rec().a.points.join(','));
  /* 목록이 통째로 빈 상태(코스 하이라이트 없음)에서도 늘어나야 한다 */
  w.__select('도쿄');
  w.__setCourses([{ title: 'ㄱ', subtitle: '', highlights: [], days: [{ day: 1, title: 'ㄱ' }] }]);
  w.__setRec(REC); btn.click(); await tick();
  ok('하이라이트가 없으면 줄이 하나도 안 보인다',
    pdoc().querySelectorAll('.plan-points li').length === 0,
    String(pdoc().querySelectorAll('.plan-points li').length));
  addBtn().click(); await tick();
  ok('그 상태에서도 손잡이로 줄을 만들 수 있다',
    w.__courses()[0].highlights.length === 1, JSON.stringify(w.__courses()[0].highlights));
  ok('만든 줄이 화면에 보인다 (빈 줄도 그려야 쓸 수 있다)',
    pdoc().querySelectorAll('.plan-points li').length === 1,
    String(pdoc().querySelectorAll('.plan-points li').length));

  /* 고객 카드가 코스에서는 앞 3개만 쓴다 — 못 보여줄 줄은 만들지 않고, 왜인지 적는다 */
  w.__setCourses([{ title: 'ㄱ', subtitle: '', highlights: ['1', '2', '3'],
                    days: [{ day: 1, title: 'ㄱ' }] }]);
  btn.click(); await tick();
  ok('코스 하이라이트가 3줄이면 손잡이가 잠긴다', addBtn().disabled === true);
  addBtn().click(); await tick();
  ok('잠긴 손잡이를 눌러도 늘어나지 않는다', w.__courses()[0].highlights.length === 3,
    JSON.stringify(w.__courses()[0].highlights));
  ok('왜 못 늘리는지, 어디로 가야 하는지 적는다',
    /3줄까지 나옵니다/.test(pdoc().querySelector('.pv-addtip').textContent)
    && /핵심 하이라이트/.test(pdoc().querySelector('.pv-addtip').textContent),
    pdoc().querySelector('.pv-addtip').textContent);

  /* ── [5-c] 점선을 묶을 곳은 묶었는가 (RV) ────────────────────────────── */
  console.log('\n[5-c] 같은 칸의 여러 줄은 점선 한 겹인가');
  w.__select('도쿄'); w.__setCourses(COURSES); w.__setRec(REC); btn.click(); await tick();
  ok('포인트 목록이 한 겹으로 묶인다',
    !!pdoc().querySelector('.plan-points.pv-egroup'),
    '줄마다 점선이면 세 겹으로 겹쳐 보인다');
  ok('일자 본문(오전·오후·저녁)도 한 겹으로 묶인다',
    !!pdoc().querySelector('.itin-day-body.pv-egroup'));
  /* 서로 다른 값인 칸은 묶지 않는다 — 묶으면 어디를 고치는지 다시 모르게 된다 */
  ['plan-type-lbl', 'plan-desc', 'plan-value-text', 'itin-day-title'].forEach((c) => {
    const el = pick('.' + c);
    ok('.' + c + '은 따로 둔다', !!el && !el.className.includes('pv-egroup'),
      el ? el.className : '(없음)');
  });
  ok('묶음 안쪽 줄은 평소에 점선을 감춘다',
    /\.pv-egroup \.pv-edit\{outline-color:transparent\}/.test(adminSrc),
    '안쪽까지 점선이면 묶은 의미가 없다');
  ok('가리키면 그 줄만 뜬다', /\.pv-egroup \.pv-edit:hover\{/.test(adminSrc));

  /* ── [6] 저장이 고친 구역만 부르는가 (④) ────────────────────────────── */
  console.log('\n[6] 저장 버튼');
  /* 앞 단계에서 상태를 새로 세웠으므로 여기서 한 번 고쳐 놓고 본다 */
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(REC); btn.click(); await tick();
  await edit(pick('.plan-desc.pv-edit'), '저장 버튼 확인용');
  const save = d.getElementById('recPvSave');
  ok('저장 버튼이 있다', !!save);
  ok('고친 구역을 이름으로 말해 준다', /방식 A·B/.test(save.textContent), save.textContent);
  ok('고친 게 있으면 눌린다', save.disabled === false);
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(REC); btn.click(); await tick();
  ok('고친 게 없으면 눌리지 않는다', d.getElementById('recPvSave').disabled === true);
  ok('저장은 구역별로 나뉜 채다',
    /if \(itiState\.dirty\) await itiSave\(\)/.test(adminSrc)
    && /if \(recState\.dirty\) await recSave\(\)/.test(adminSrc),
    '한쪽만 고쳤는데 둘 다 보내면 동료 작업을 되돌린다(QU)');

  /* ── [7] 설명은 필요할 때만 ──────────────────────────────────────────── */
  console.log('\n[7] 기본은 고객이 보는 그대로인가');
  const chk = d.getElementById('recPvExplain');
  ok('설명 보기 스위치가 있다', !!chk);
  ok('기본은 꺼져 있다', chk.checked === false);
  /* ⚠ body 클래스에는 지금 보고 있는 방식(pv-plan-a/b)도 함께 붙는다(RU).
     정확히 같은지 보지 말고 **설명 표시가 있는지**만 본다. */
  ok('꺼져 있으면 본문에 설명 표시가 없다',
    !/\bpv-explain\b/.test(pdoc().body.className), pdoc().body.className);
  ok('설명은 CSS로 숨긴다 (그리는 코드는 하나다)',
    /body:not\(\.pv-explain\) \.pv-what/.test(adminSrc),
    '두 벌로 그리면 한쪽만 고치게 된다');
  chk.checked = true;
  chk.dispatchEvent(new w.Event('change'));
  await tick();
  ok('켜면 설명이 살아난다', /\bpv-explain\b/.test(pdoc().body.className), pdoc().body.className);
  ok('자리 이름은 끄든 켜든 남는다', pdoc().querySelectorAll('.pv-where').length === 3,
    String(pdoc().querySelectorAll('.pv-where').length));

  /* ── [8] 담당자가 친 글이 코드가 되지 않는가 ─────────────────────────── */
  console.log('\n[8] 고친 글이 코드로 해석되지 않는가');
  chk.checked = false;
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(REC); btn.click(); await tick();
  const EVIL = '<img src=x onerror=window.__pwned=1>';
  await edit(pick('.plan-desc.pv-edit'), EVIL);
  ok('상태에는 글자로만 들어간다', w.__rec().a.desc === EVIL, w.__rec().a.desc);
  ok('다시 그려도 태그가 안 생긴다', pdoc().querySelectorAll('img').length === 0,
    String(pdoc().querySelectorAll('img').length));
  ok('실행되지 않았다', w.__pwned === undefined);

  /* ── [9] 편집 손잡이가 카드 폭을 바꾸지 않는가 ──────────────────────── */
  console.log('\n[9] 손잡이가 고객 화면 배치를 건드리지 않는가');
  /* outline·background는 자리를 차지하지 않는다. border·padding·margin을 주면
     그 순간 카드 폭이 고객 화면과 달라진다(check_rec_preview.py가 실제 브라우저로 잰다). */
  /* 일자 제목은 **코스에서 온 날**에만 고칠 수 있다 — 코스를 세워 두고 본다 */
  w.__select('도쿄'); w.__setCourses(COURSES); w.__setRec(REC); btn.click(); await tick();
  const pvEditCss = (adminSrc.match(/\.pv-edit[^{]*\{[^}]*\}/g) || []).join(' ');
  ok('.pv-edit 규칙이 있다', pvEditCss.length > 0);
  ok('.pv-edit이 자리를 차지하는 속성을 안 쓴다',
    !/(^|[;{])\s*(border|padding|margin|width|font-size)\s*:/.test(pvEditCss),
    pvEditCss);
  /* ⚠ 고칠 수 있는 자리 중에는 **검은 박스 위의 흰 글자**가 있다 — 견적서의 기대 효과
     문구(.plan-value-box)와 일자 제목(.itin-day-header). 거기에 배경을 칠하면 글자가
     사라진다. 실제로 그렇게 배포됐고 사용자가 빈 흰 칸 사진을 보냈다. */
  ok('.pv-edit이 배경을 칠하지 않는다',
    !/background/.test(pvEditCss),
    '어두운 박스 위 흰 글자가 배경에 묻힌다: ' + pvEditCss);
  const darkText = ['.plan-value-text', '.itin-day-title'];
  darkText.forEach((sel) => {
    const el = pick(sel);
    ok('어두운 박스의 ' + sel + '도 고칠 수 있는 자리다',
      !!el && /\bpv-edit\b/.test(el.className || ''), el ? el.className : '(없음)');
  });
  const stylesCss = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  ok('그 자리들이 실제로 흰 글자다 (배경을 칠하면 안 되는 이유)',
    /\.plan-value-text\s*\{[^}]*color:\s*#fff/.test(stylesCss),
    '고객 CSS가 바뀌면 이 판단도 다시 봐야 한다');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__select = (k) => { itiState.dirty = false; recState.dirty = false; itiSelectDest(k); };
  window.__setRec = (r) => { recState.rec = JSON.parse(JSON.stringify(r)); recRenderBody(); };
  window.__setCourses = (c) => { itiState.courses = JSON.parse(JSON.stringify(c)); itiRenderBody(); recRenderBody(); };
  window.__rec = () => recState.rec;
  window.__courses = () => itiState.courses;
  window.__dirty = () => ({ rec: recState.dirty, iti: itiState.dirty });
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

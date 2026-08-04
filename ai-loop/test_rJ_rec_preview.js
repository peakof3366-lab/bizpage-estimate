/* RJ 검증: 방식 A·B '고객 화면 미리보기'.

   왜 —
   담당자가 이 화면에서 채우는 다섯 칸(방식 이름·한 줄 설명·핵심 포인트·일별 주요 활동·
   기대 효과 문구)은 **고객 화면 세 군데로 흩어져** 나간다. 편집 화면만 보고는 어느 글이
   어디로 가는지 알 수 없어서, 확인하려면 저장해서 고객 화면을 여는 수밖에 없었다 —
   그건 고객에게 반영된 뒤에야 본다는 뜻이다.

   미리보기는 **거짓말을 하는 순간 없느니만 못해진다.** 이 파일이 막는 것도 대부분 그것이다:
   ① **저장 전 편집 중인 값**을 보여준다. 저장된 값을 보여주면 방금 고친 것을 확인할 수 없다.
   ② **빈 칸을 빈 칸으로 그리지 않는다.** 고객 화면은 빈 칸을 기본 문구로 채우므로, 비워
      두면 "아무것도 안 나간다"가 아니라 "기본 문구가 나간다"가 맞다. 그 사실을 카드
      **바깥에** 적는다(카드 안에 끼워 넣으면 고객이 보는 모양 자체가 달라진다).
   ③ **기본 문구가 고객 화면과 같은 값**이어야 한다 — rec_fallbacks.js 한 곳에서 읽는다.
      두 벌이 되면 미리보기가 실제와 다른 문구를 보여주게 된다(결함 생성기 ①).
   ④ **고객과 같은 styles.css**를 읽는다. 스타일을 여기 다시 적으면 곧 어긋난다.
   ⑤ **클래스 이름이 실제 고객 화면과 같다.** 여기가 갈라지면 CSS는 그대로여도 모양이 달라진다.
   ⑥ **담당자가 친 글자가 코드로 해석되지 않는다**(결함 생성기 ④).
   ⑦ 저장 전인지 저장된 것인지 **말해 준다.** 미리보기를 보고 "반영됐다"고 읽으면 저장을 건너뛴다.

   실행: node ai-loop/test_rJ_rec_preview.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');
const REC_FALLBACKS = require('../rec_fallbacks.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const adminSrc  = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const indexSrc  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptSrc = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const manualSrc = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');
const aqSrc     = fs.readFileSync(path.join(ROOT, 'admin-quote.html'), 'utf8');

const FULL = {
  a: { tag: '역량강화', desc: 'A 설명', points: ['A포인트1', 'A포인트2'],
       items: ['A활동1', 'A활동2'], value: 'A 기대효과' },
  b: { tag: '화합형', desc: 'B 설명', points: ['B포인트1'],
       items: ['B활동1'], value: 'B 기대효과' },
};
const EMPTY = {
  a: { tag: '', desc: '', points: [], items: [], value: '' },
  b: { tag: '', desc: '', points: [], items: [], value: '' },
};

(async () => {
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;

  const modal = () => d.getElementById('recPvModal');
  const open  = () => !modal().classList.contains('hidden');
  const pdoc  = () => d.getElementById('recPvFrame').contentDocument;
  const texts = (sel) => Array.from(pdoc().querySelectorAll(sel)).map((e) => e.textContent);
  const cards = () => Array.from(pdoc().querySelectorAll('.plan-card'));

  /* ── [1] 버튼과 열고 닫기 ─────────────────────────────────────────────── */
  console.log('[1] 버튼이 있고 열고 닫히는가');
  const btn = d.getElementById('rec-preview');
  ok('방식 A·B 구역에 미리보기 버튼이 있다', !!btn);
  ok('버튼이 방식 A·B 구역 안에 있다',
    !!btn && !!btn.closest('#sec-rec, .sec-rec') || /rec-preview[\s\S]{0,200}rec-save/.test(adminSrc),
    '저장·되돌리기와 같은 줄에 있어야 찾는다');
  ok('처음에는 닫혀 있다', !open());

  /* 목적지를 안 고르고 누르면 조용히 아무 일도 안 일어나면 안 된다 */
  w.__select('');
  btn.click();
  ok('목적지 없이 누르면 열리지 않는다', !open());
  ok('왜 안 열리는지 말해 준다',
    /목적지를 먼저/.test(d.getElementById('rec-msg').textContent),
    d.getElementById('rec-msg').textContent);

  w.__select('도쿄');
  w.__setCourses([]);          /* 코스 없는 상태 = ✨ 방식 A·B가 출처 (RK) */
  w.__setRec(FULL);
  btn.click();
  ok('목적지를 고르면 열린다', open());
  ok('어느 목적지인지 제목에 적는다',
    d.getElementById('recPvDest').textContent === '도쿄',
    d.getElementById('recPvDest').textContent);
  d.getElementById('recPvClose').click();
  ok('✕로 닫힌다', !open());
  btn.click();
  modal().dispatchEvent(new w.Event('click', { bubbles: true }));   /* 바깥 클릭 */
  ok('바깥을 누르면 닫힌다', !open());

  /* ── [2] 저장 전 편집 중인 값을 보여주는가 (①) ────────────────────────── */
  console.log('\n[2] 저장 전 편집 중인 값을 보여주는가 (①)');
  w.__seed({}, { 도쿄: FULL }, {});      /* 서버에 저장된 값은 FULL */
  w.__select('도쿄');
  w.__setCourses([]);
  w.__setRec({ a: Object.assign({}, FULL.a, { desc: '방금 고친 A 설명' }), b: FULL.b });
  w.__markRecDirty();
  btn.click();
  ok('저장하지 않은 수정 내용이 보인다',
    texts('.plan-desc').some((t) => t === '방금 고친 A 설명'), texts('.plan-desc').join(' | '));
  ok('저장된 옛 값은 안 보인다',
    !texts('.plan-desc').includes('A 설명'), texts('.plan-desc').join(' | '));

  /* ── [3] 저장 전인지 알려주는가 (⑦) ───────────────────────────────────── */
  console.log('\n[3] 저장 전인지 저장된 것인지 말해 주는가 (⑦)');
  ok('고치는 중이면 아직 저장 안 됐다고 말한다',
    /저장하지 않았습니다|저장해야/.test(d.getElementById('recPvNote').textContent),
    d.getElementById('recPvNote').textContent);
  d.getElementById('recPvClose').click();
  w.__select('도쿄');                     /* dirty를 지우고 다시 연다 */
  w.__setCourses([]);
  btn.click();
  ok('저장된 상태면 고객이 지금 보는 것이라고 말한다',
    /고객이 지금 보고 있는/.test(d.getElementById('recPvNote').textContent),
    d.getElementById('recPvNote').textContent);

  /* ── [4] 세 군데가 다 나오는가 ─────────────────────────────────────────── */
  console.log('\n[4] 다섯 칸이 나가는 자리를 다 보여주는가 (코스 없는 목적지)');
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(FULL); btn.click();
  ok('방식 선택 카드 두 장이 있다', cards().length === 2, String(cards().length));
  ok('기대 효과 박스가 A·B 둘 다 있다',
    pdoc().querySelectorAll('.plan-value-box').length === 2,
    String(pdoc().querySelectorAll('.plan-value-box').length));
  ok('일별 주요 활동이 날짜 카드로 보인다',
    pdoc().querySelectorAll('.itin-day-card').length === 3,   /* A 2줄 + B 1줄 */
    String(pdoc().querySelectorAll('.itin-day-card').length));
  ok('각 구역이 어디에 나가는지 적혀 있다',
    texts('.pv-where').join(' ').includes('연수 일정 탐색')
    && texts('.pv-where').join(' ').includes('견적서'),
    texts('.pv-where').join(' | '));

  ok('방식 이름이 카드에 보인다', texts('.plan-type-lbl').join(',') === '역량강화,화합형',
    texts('.plan-type-lbl').join(','));
  ok('핵심 포인트가 목록으로 보인다',
    texts('.plan-points li').join(',') === 'A포인트1,A포인트2,B포인트1',
    texts('.plan-points li').join(','));
  ok('기대 효과 문구가 보인다',
    texts('.plan-value-text').join(',') === 'A 기대효과,B 기대효과',
    texts('.plan-value-text').join(','));
  ok('일별 활동명이 보인다',
    texts('.itin-day-title').join(',') === 'A활동1,A활동2,B활동1',
    texts('.itin-day-title').join(','));
  ok('기본 문구 경고는 뜨지 않는다 (다 채웠다)',
    pdoc().querySelectorAll('.pv-warn').length === 0);

  /* ── [5] 빈 칸을 어떻게 보여주는가 (②③) — 가장 중요 ──────────────────── */
  console.log('\n[5] 빈 칸이 고객 화면에서 어떻게 되는지 보여주는가 (②③)');
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(EMPTY); btn.click();
  ok('빈 칸을 빈 채로 두지 않는다',
    texts('.plan-desc').every((t) => t.trim().length > 0), texts('.plan-desc').join(' | '));
  ok('방식 이름이 고객 화면과 같은 기본값이다',
    texts('.plan-type-lbl').join(',') === REC_FALLBACKS.tag.a + ',' + REC_FALLBACKS.tag.b,
    texts('.plan-type-lbl').join(','));
  ok('한 줄 설명이 같은 기본값이다',
    texts('.plan-desc').every((t) => t === REC_FALLBACKS.desc), texts('.plan-desc').join(' | '));
  ok('핵심 포인트가 같은 기본값이다',
    texts('.plan-points li').join(',') === REC_FALLBACKS.points.concat(REC_FALLBACKS.points).join(','),
    texts('.plan-points li').join(','));
  ok('기대 효과가 같은 기본값이다',
    texts('.plan-value-text').every((t) => t === REC_FALLBACKS.value),
    texts('.plan-value-text').join(' | '));
  ok('일별 활동이 같은 기본값이다',
    texts('.itin-day-title').join(',') === REC_FALLBACKS.items.concat(REC_FALLBACKS.items).join(','),
    texts('.itin-day-title').join(','));

  const warns = texts('.pv-warn').join(' ');
  ok('비어 있다는 것을 경고로 알린다', pdoc().querySelectorAll('.pv-warn').length === 3,
    String(pdoc().querySelectorAll('.pv-warn').length));
  ok('어느 칸이 비었는지 이름을 적는다',
    warns.includes('한 줄') && warns.includes('기대 효과 문구'), warns);
  ok('A와 B를 구분해서 적는다', warns.includes('방식 A') && warns.includes('방식 B'), warns);
  ok('이대로 두면 고객에게 나간다고 못 박는다', /고객에게 그대로 나갑니다/.test(warns), warns);
  /* ⚠ 경고는 카드 바깥이어야 한다 — 안에 넣으면 고객이 보는 모양이 달라진다 */
  ok('경고가 카드 안에 들어가 있지 않다',
    Array.from(pdoc().querySelectorAll('.pv-warn')).every((el) => !el.closest('.plan-card')));
  ok('경고가 기대 효과 박스 안에도 없다',
    Array.from(pdoc().querySelectorAll('.pv-warn')).every((el) => !el.closest('.plan-value-box')));

  /* ── [5-b] 코스가 있으면 **코스가 출처다** (RK) — 이 저장소가 실제로 틀렸던 곳 ──
     처음 미리보기를 붙였을 때는 언제나 ✨ 방식 A·B를 보여줬다. 그런데 코스가 등록된
     목적지에서는 고객 화면이 **코스의 제목·한 줄 설명·핵심 하이라이트**를 쓴다
     (script.js renderStep3 → _coursesToDestRec). 그래서 담당자가 ✨에 써 넣은 글을
     고객 화면에서 찾을 수 없었고, 미리보기는 그 사실을 감추고 있었다. */
  console.log('\n[5-b] 코스가 있으면 코스가 출처인가 (RK)');
  const COURSES = [
    { title: '코스가 제목', subtitle: '코스가 한 줄', highlights: ['하이가1', '하이가2', '하이가3', '하이가4'],
      days: [{ day:1, title:'첫날' }, { day:2, title:'가운데' }, { day:3, title:'마지막' }] },
    { title: '코스나 제목', subtitle: '코스나 한 줄', highlights: ['하이나1'],
      days: [{ day:1, title:'첫날' }, { day:2, title:'마지막' }] },
  ];
  w.__select('도쿄'); w.__setCourses(COURSES); w.__setRec(FULL); btn.click();
  ok('카드 배지가 코스 제목이다 (방식 이름이 아니다)',
    texts('.plan-type-lbl').join(',') === '코스가 제목,코스나 제목', texts('.plan-type-lbl').join(','));
  ok('설명이 코스의 한 줄 설명이다',
    texts('.plan-desc').join(',') === '코스가 한 줄,코스나 한 줄', texts('.plan-desc').join(','));
  ok('포인트가 코스 하이라이트 **앞 3개**다',
    texts('.plan-points li').join(',') === '하이가1,하이가2,하이가3,하이나1',
    texts('.plan-points li').join(','));
  ok('기대 효과도 코스의 한 줄 설명이다',
    texts('.plan-value-text').join(',') === '코스가 한 줄,코스나 한 줄', texts('.plan-value-text').join(','));
  ok('✨에 써 둔 방식 이름은 카드에 안 나온다',
    !texts('.plan-type-lbl').includes('역량강화'), texts('.plan-type-lbl').join(','));
  /* 어디를 고쳐야 이 자리가 바뀌는지 말해 준다 — 이게 없으면 또 못 찾는다 */
  const froms = texts('.pv-from').join(' | ');
  ok('각 카드의 출처를 적는다', /코스 A/.test(froms) && /코스 B/.test(froms), froms);
  ok('출처에 코스 제목까지 적는다', froms.includes('코스가 제목'), froms);
  ok('출처가 📅 날짜별 일정을 가리킨다', /날짜별 일정/.test(froms), froms);

  /* 일별 주요 활동만은 코스가 있어도 ✨에서 온다 — 다른 넷과 출처가 다르다 */
  ok('일별 주요 활동은 코스가 있어도 ✨ 방식 A·B에서 온다',
    texts('.itin-day-title').join(',') === 'A활동1,A활동2,B활동1',
    texts('.itin-day-title').join(','));

  /* ⚠ 코스에서 오는 값이 비면 기본 문구로 안 채워진다 — 고객 화면이 빈칸이 된다 */
  w.__setCourses([{ title: '', subtitle: '', highlights: [], days: [{ day:1, title:'ㄱ' }] }]);
  btn.click();
  const hard = Array.from(pdoc().querySelectorAll('.pv-warn-hard')).map((e) => e.textContent).join(' ');
  ok('빈 코스 값은 “빈칸으로 나간다”고 따로 경고한다', hard.length > 0, hard);
  ok('그 경고가 기본 문구 경고와 구분된다', /빈칸으로/.test(hard), hard);

  /* ── [5-c] 프로그램 유형에 따라 A/B가 바뀌는 것을 보여주는가 (RK) ────── */
  console.log('\n[5-c] 프로그램 유형에 따라 코스↔방식 매핑이 바뀌는가');
  w.__select('도쿄'); w.__setCourses(COURSES); btn.click();
  const typeSel = d.getElementById('recPvType');
  ok('프로그램 유형을 고를 수 있다', !!typeSel && typeSel.options.length === 4,
    typeSel ? String(typeSel.options.length) : '(없음)');
  ok('유형 이름이 data.js의 PROGRAM_TYPES에서 온다',
    Array.from(typeSel.options).map((o) => o.value).join(',') === 'language,leadership,industry,academic',
    Array.from(typeSel.options).map((o) => o.value).join(','));
  /* 도쿄 PROGRAM_PRIORITY: language:[2,1] leadership:[1,0] industry:[0,1]
     코스를 2개만 뒀으니 인덱스 2는 범위를 넘어 0으로 접힌다 — 고객 코드와 같은 규칙이다 */
  w.__pvType('leadership');
  ok('리더십에서는 코스 B가 방식 A가 된다',
    w.__planSource('a').courseIdx === 1 && w.__planSource('b').courseIdx === 0,
    JSON.stringify([w.__planSource('a').courseIdx, w.__planSource('b').courseIdx]));
  w.__pvType('industry');
  ok('산업체에서는 코스 A가 방식 A가 된다',
    w.__planSource('a').courseIdx === 0 && w.__planSource('b').courseIdx === 1,
    JSON.stringify([w.__planSource('a').courseIdx, w.__planSource('b').courseIdx]));
  ok('바꾼 유형이 화면 내용에도 반영된다',
    texts('.plan-type-lbl')[0] === '코스가 제목', texts('.plan-type-lbl').join(','));
  ok('지금 매핑을 한 줄로 알려준다',
    /방식 A = 코스 A/.test(d.getElementById('recPvMap').textContent),
    d.getElementById('recPvMap').textContent);

  /* ── [6] 기본 문구가 고객 화면과 같은 곳에서 오는가 (③) ───────────────── */
  console.log('\n[6] 기본 문구를 두 벌로 적지 않았는가 (③)');
  ok('rec_fallbacks.js를 admin.html이 싣는다', /<script src="rec_fallbacks\.js">/.test(adminSrc));
  ok('rec_fallbacks.js를 index.html이 싣는다', /<script src="rec_fallbacks\.js">/.test(indexSrc));
  ok('rec_fallbacks.js를 admin-quote.html도 싣는다', /<script src="rec_fallbacks\.js">/.test(aqSrc));
  /* ⚠ script.js보다 먼저 실려야 한다 — 뒤면 로드 시점에 undefined다 */
  ok('index.html에서 script.js보다 먼저 실린다',
    indexSrc.indexOf('rec_fallbacks.js') < indexSrc.indexOf('<script src="script.js">'));
  ok('admin-quote.html에서도 script.js보다 먼저 실린다',
    aqSrc.indexOf('rec_fallbacks.js') < aqSrc.indexOf('<script src="script.js">'));
  ok('script.js가 REC_FALLBACKS에서 읽는다', /REC_FALLBACKS\.(tag|desc|points|items|value)/.test(scriptSrc));
  /* 옛 하드코딩이 남아 있으면 두 벌이 된 것이다 */
  ok('script.js에 옛 기본 문구가 남아 있지 않다',
    !scriptSrc.includes("'담당 컨설턴트가 맞춤 일정을 제안드립니다.'")
    && !scriptSrc.includes("'목적지별 특화 프로그램 구성'")
    && !scriptSrc.includes("'현지 산업 현장 탐방'"),
    '지우지 않으면 rec_fallbacks.js를 고쳐도 고객 화면은 안 바뀐다');
  ok('admin.html에 기본 문구를 다시 적지 않았다',
    !adminSrc.includes('담당 컨설턴트가 맞춤 일정을 제안드립니다'));

  /* ⚠ 픽스처도 실어야 한다. script.js를 **합쳐 eval하는** 파일이 rec_fallbacks.js를
     빼면 REC_FALLBACKS가 undefined라 일정 탐색이 그 자리에서 죽는다 — 실제로 이
     기능을 넣을 때 test_qD가 그렇게 크래시했다. 조용히 넘어가지 않고 여기서 잡는다.
     (script.js를 정규식 검사용 '문자열로만' 읽는 파일은 eval하지 않으므로 제외한다.) */
  const AI = path.join(ROOT, 'ai-loop');
  const evalers = fs.readdirSync(AI)
    .filter((f) => /\.js$/.test(f))
    .filter((f) => fs.readFileSync(path.join(AI, f), 'utf8').includes("+ read('script.js')"));
  const naked = evalers.filter((f) =>
    !fs.readFileSync(path.join(AI, f), 'utf8').includes("read('rec_fallbacks.js')"));
  ok('script.js를 합쳐 돌리는 픽스처가 하나 이상 있다', evalers.length > 0, String(evalers.length));
  ok('그 픽스처가 전부 rec_fallbacks.js도 싣는다', naked.length === 0, naked.join(', '));

  /* ── [7] 고객과 같은 스타일시트를 읽는가 (④) ──────────────────────────── */
  console.log('\n[7] 고객과 같은 styles.css를 읽는가 (④)');
  const link = pdoc().querySelector('link[rel="stylesheet"]');
  ok('미리보기가 스타일시트를 건다', !!link);
  ok('그 스타일시트가 고객 화면과 같은 styles.css다',
    !!link && link.getAttribute('href') === 'styles.css',
    link ? link.getAttribute('href') : '(없음)');
  ok('미리보기가 카드 스타일을 다시 적지 않았다',
    !/\.plan-card\s*\{/.test(adminSrc) && !/\.plan-value-box\s*\{/.test(adminSrc),
    'admin.html에 고객 카드 CSS를 복사하면 곧 어긋난다');

  /* ── [8] 클래스가 실제 고객 화면과 같은가 (⑤) ─────────────────────────── */
  console.log('\n[8] 미리보기 클래스가 실제 고객 화면과 같은가 (⑤)');
  /* index.html의 진짜 카드가 쓰는 클래스를 그대로 쓰는지 본다 — 여기가 갈라지면
     styles.css는 그대로인데 미리보기만 모양이 달라진다. */
  ['plan-cards', 'plan-card', 'plan-card-hd', 'plan-tag', 'plan-tag-a', 'plan-tag-b',
   'plan-type-lbl', 'plan-desc', 'plan-points'].forEach((c) => {
    ok('index.html도 .' + c + '를 쓴다', indexSrc.includes('class="' + c)
      || new RegExp('class="[^"]*\\b' + c + '\\b').test(indexSrc));
    ok('미리보기에 .' + c + '가 있다', !!pdoc().querySelector('.' + c));
  });
  ['plan-value-box', 'plan-value-label', 'plan-value-text'].forEach((c) => {
    ok('미리보기에 .' + c + '가 있다', !!pdoc().querySelector('.' + c));
  });
  /* 일별 카드 클래스는 script.js의 _renderRichDayCard가 만드는 것과 같아야 한다 */
  ['itin-day-card', 'itin-day-header', 'itin-day-hd-l', 'itin-day-num', 'itin-day-title'].forEach((c) => {
    ok('script.js도 .' + c + '를 만든다', scriptSrc.includes(c));
    ok('미리보기에 .' + c + '가 있다', !!pdoc().querySelector('.' + c));
  });
  /* 그 클래스들이 styles.css에 실제로 정의돼 있어야 모양이 나온다 */
  ['.plan-cards', '.plan-card', '.plan-desc', '.plan-points', '.plan-value-box', '.itin-day-card']
    .forEach((c) => ok('styles.css에 ' + c + '가 정의돼 있다',
      new RegExp('\\' + c + '\\s*[,{]').test(stylesSrc)));

  /* ⚠ 오전·오후·저녁 문장은 미리보기가 만들지 않는다 — script.js에 조립 규칙이 둘이라
     여기 옮겨 적으면 두 벌이 된다. 그 사실을 대신 말해 주는지 본다. */
  ok('미리보기가 오전·오후 문장을 지어내지 않는다',
    pdoc().querySelectorAll('.itin-slot').length === 0,
    String(pdoc().querySelectorAll('.itin-slot').length));
  ok('그 대신 자동으로 만들어진다고 말해 준다',
    /자동으로 만들어집니다/.test(texts('.pv-hint').join(' ')), texts('.pv-hint').join(' | '));
  ok('언제 이 목록이 안 쓰이는지도 말해 준다',
    /쓰이지 않습니다/.test(texts('.pv-hint').join(' ')), texts('.pv-hint').join(' | '));

  /* ── [9] 담당자가 친 글자가 코드가 되지 않는가 (⑥) ────────────────────── */
  console.log('\n[9] 담당자가 친 글자가 코드로 해석되지 않는가 (⑥)');
  const EVIL = `'"><img src=x onerror=parent.__pwned=1><script>parent.__pwned=1<\/script>`;
  w.__select('도쿄');
  w.__setCourses([]);
  w.__setRec({
    a: { tag: EVIL, desc: EVIL, points: [EVIL], items: [EVIL], value: EVIL },
    b: { tag: EVIL, desc: EVIL, points: [EVIL], items: [EVIL], value: EVIL },
  });
  btn.click();
  await new Promise((r) => setTimeout(r, 40));
  ok('미리보기 안에 태그가 만들어지지 않는다', pdoc().querySelectorAll('img').length === 0,
    String(pdoc().querySelectorAll('img').length));
  ok('스크립트 태그도 만들어지지 않는다', pdoc().querySelectorAll('script').length === 0);
  ok('스크립트가 실행되지 않았다', w.__pwned === undefined);
  ok('그래도 글자는 그대로 보인다', texts('.plan-desc').every((t) => t === EVIL),
    texts('.plan-desc')[0]);

  /* ── [10] 매뉴얼이 따라왔는가 ─────────────────────────────────────────── */
  console.log('\n[10] 매뉴얼이 미리보기를 설명하는가');
  ok('미리보기를 설명한다', /미리보기/.test(manualSrc));
  ok('저장 전에도 볼 수 있다고 적는다', /저장하기 전|저장 전/.test(manualSrc));
  ok('빈 칸이면 기본 문구가 나간다고 적는다',
    /기본 문구/.test(manualSrc), '이걸 모르면 비워 두는 것이 안전하다고 오해한다');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__seed = (ov, rec, meta) => {
    itiState.overrides = ov; itiState.recOverrides = rec; itiState.meta = meta;
    itiState.loaded = true; itiFillDestSelect();
  };
  window.__select = (k) => { itiState.dirty = false; recState.dirty = false; itiSelectDest(k); };
  /* 편집 중인 값을 직접 세운다 — 미리보기가 '저장된 값'이 아니라 이걸 봐야 한다 */
  window.__setRec = (r) => { recState.rec = JSON.parse(JSON.stringify(r)); recRenderBody(); };
  window.__markRecDirty = () => recMarkDirty();
  /* ⚠ 코스 유무가 미리보기의 **출처를 바꾼다**(RK). 코스가 있으면 방식 카드는 코스에서,
     없으면 ✨ 방식 A·B에서 온다. 그래서 테스트가 둘을 따로 세울 수 있어야 한다. */
  window.__setCourses = (c) => { itiState.courses = JSON.parse(JSON.stringify(c)); itiRenderBody(); recRenderBody(); };
  window.__pvType = (t) => { document.getElementById('recPvType').value = t; recPvRender(); };
  window.__planSource = (plan) => recPvSource(plan);
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

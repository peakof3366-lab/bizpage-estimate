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
  /* RU: 미리보기가 방식 A·B **탭**으로 갈렸다. 한 번에 한 방식만 그린다 —
     예전엔 카드는 나란히, 기대 효과는 위아래, 일정표는 A 다음 B로 한 화면에 섞여 있어
     "지금 보는 게 어느 방식인지"가 계속 흐릿했다(사용자 지적). */
  ok('고른 탭의 카드 한 장만 나온다', cards().length === 1, String(cards().length));
  ok('기대 효과 박스도 한 장이다',
    pdoc().querySelectorAll('.plan-value-box').length === 1,
    String(pdoc().querySelectorAll('.plan-value-box').length));
  ok('일별 일정이 고객이 보는 일수만큼 나온다',
    pdoc().querySelectorAll('.itin-day-card').length === 5,   /* 5일 × 방식 1 */
    String(pdoc().querySelectorAll('.itin-day-card').length));
  /* ⚠ 카드 폭은 고객 화면과 같아야 한다 — `.plan-cards` 2열 그리드를 남겨 둔 이유다.
     그리드를 빼면 한 장이 두 배 폭이 되어 줄바꿈이 달라진다(실제 px는 브라우저 검사). */
  ok('카드 폭을 잡아 주는 2열 그리드는 그대로다', !!pdoc().querySelector('.plan-cards'));
  ok('각 구역이 어디에 나가는지 적혀 있다',
    texts('.pv-where').join(' ').includes('연수 일정 탐색')
    && texts('.pv-where').join(' ').includes('견적서'),
    texts('.pv-where').join(' | '));

  ok('방식 이름이 카드에 보인다', texts('.plan-type-lbl').join(',') === '역량강화',
    texts('.plan-type-lbl').join(','));
  ok('핵심 포인트가 목록으로 보인다',
    texts('.plan-points li').join(',') === 'A포인트1,A포인트2',
    texts('.plan-points li').join(','));
  ok('기대 효과 문구가 보인다',
    texts('.plan-value-text').join(',') === 'A 기대효과',
    texts('.plan-value-text').join(','));
  /* 코스가 없으면 첫날·마지막날은 정해진 문구, 사이는 ✨의 '일별 주요 활동'이
     돌아가며 들어간다 — 고객 화면(_renderTimeline)과 정확히 같은 규칙이다. */
  ok('일별 활동명이 보인다',
    texts('.itin-day-title').join(',')
      === '도착 · 오리엔테이션,A활동1,A활동2,A활동1,귀국',
    texts('.itin-day-title').join(','));

  /* ── [4-b] 탭을 옮기면 화면이 통째로 그 방식으로 바뀌는가 (RU) ─────────── */
  console.log('\n[4-b] 탭을 옮기면 세 구역이 다 그 방식으로 바뀌는가');
  const tab = (p) => Array.from(d.querySelectorAll('.recpv-tab'))
    .find((x) => x.dataset.pvplan === p);
  ok('방식 A·B 탭이 있다', !!tab('a') && !!tab('b'));
  ok('처음에는 방식 A가 켜져 있다', tab('a').classList.contains('active'));
  tab('b').click();
  ok('탭을 옮기면 그 탭이 켜진다',
    tab('b').classList.contains('active') && !tab('a').classList.contains('active'));
  ok('카드가 B로 바뀐다', texts('.plan-type-lbl').join(',') === '화합형',
    texts('.plan-type-lbl').join(','));
  ok('기대 효과도 B로 바뀐다', texts('.plan-value-text').join(',') === 'B 기대효과',
    texts('.plan-value-text').join(','));
  ok('일정표도 B로 바뀐다',
    texts('.itin-day-title').join(',') === '도착 · 오리엔테이션,B활동1,B활동1,B활동1,귀국',
    texts('.itin-day-title').join(','));
  ok('B 탭에서는 A 내용이 하나도 안 남는다',
    !texts('.plan-type-lbl').includes('역량강화')
    && !texts('.plan-points li').some((t) => t.startsWith('A포인트')),
    texts('.plan-points li').join(','));
  /* 탭 이름만으로는 "방식 A가 코스 A인가"를 매번 다시 확인해야 한다 — 유형에 따라
     짝이 바뀌기 때문이다(RK). 탭에 출처를 적어 그 질문을 없앤다. */
  ok('탭이 그 방식의 출처를 적는다',
    /방식 A·B|코스/.test(d.getElementById('recPvTabSubA').textContent),
    d.getElementById('recPvTabSubA').textContent);
  /* 카드 옆 빈자리가 "고객은 두 장을 나란히 본다"를 말해 주는가 — 그냥 비워 두면
     "고객도 한 장만 보나?"로 읽힌다. 그리고 눌러서 그 탭으로 넘어갈 수 있어야 한다. */
  const ghost = () => pdoc().querySelector('.pv-ghost');
  ok('카드 옆에 다른 방식 자리가 표시된다', !!ghost());
  ok('고객은 두 장을 나란히 본다고 적는다', /나란히/.test(ghost().textContent), ghost().textContent);
  ok('그 자리가 카드로 세어지지 않는다', cards().length === 1, String(cards().length));
  ghost().click();
  ok('빈자리를 누르면 그 방식 탭으로 넘어간다',
    tab('a').classList.contains('active'), '지금 B 탭이므로 A로 넘어가야 한다');
  ok('오전 문장이 활동명으로 조립된다',
    texts('.itin-slot-content').includes('A활동1 — 오전 탐방'),
    texts('.itin-slot-content').slice(0, 6).join(' | '));
  /* 다섯 칸을 다 채웠으므로 '기본 문구가 나갑니다' 경고는 없어야 한다.
     ⚠ 자동 채움 경고(일수가 코스보다 길다)는 성격이 다르므로 여기서 세지 않는다. */
  ok('기본 문구 경고는 뜨지 않는다 (다 채웠다)',
    !/기본 문구가 나갑니다/.test(texts('.pv-warn').join(' ')),
    texts('.pv-warn').join(' | '));

  /* ── [5] 빈 칸을 어떻게 보여주는가 (②③) — 가장 중요 ──────────────────── */
  console.log('\n[5] 빈 칸이 고객 화면에서 어떻게 되는지 보여주는가 (②③)');
  w.__select('도쿄'); w.__setCourses([]); w.__setRec(EMPTY); btn.click();
  ok('빈 칸을 빈 채로 두지 않는다',
    texts('.plan-desc').every((t) => t.trim().length > 0), texts('.plan-desc').join(' | '));
  ok('방식 이름이 고객 화면과 같은 기본값이다',
    texts('.plan-type-lbl').join(',') === REC_FALLBACKS.tag.a,
    texts('.plan-type-lbl').join(','));
  ok('한 줄 설명이 같은 기본값이다',
    texts('.plan-desc').every((t) => t === REC_FALLBACKS.desc), texts('.plan-desc').join(' | '));
  ok('핵심 포인트가 같은 기본값이다',
    texts('.plan-points li').join(',') === REC_FALLBACKS.points.join(','),
    texts('.plan-points li').join(','));
  ok('기대 효과가 같은 기본값이다',
    texts('.plan-value-text').every((t) => t === REC_FALLBACKS.value),
    texts('.plan-value-text').join(' | '));
  /* 5일이면 가운데 3일이 채워진다 — 목록 앞 3개가 순서대로 들어간다 */
  ok('일별 활동이 같은 기본값이다',
    texts('.itin-day-title').filter((t) => REC_FALLBACKS.items.includes(t)).join(',')
      === REC_FALLBACKS.items.slice(0, 3).join(','),
    texts('.itin-day-title').join(','));
  /* B 탭도 같은 기본값이어야 한다 — 탭이 갈리면서 한쪽만 확인하게 되기 쉽다 */
  Array.from(d.querySelectorAll('.recpv-tab')).find((x) => x.dataset.pvplan === 'b').click();
  ok('B 탭도 같은 기본값이다',
    texts('.plan-type-lbl').join(',') === REC_FALLBACKS.tag.b
    && texts('.plan-desc').every((t) => t === REC_FALLBACKS.desc),
    texts('.plan-type-lbl').join(',') + ' / ' + texts('.plan-desc').join(' | '));
  Array.from(d.querySelectorAll('.recpv-tab')).find((x) => x.dataset.pvplan === 'a').click();

  const warns = texts('.pv-warn').join(' ');
  /* 탭당 세 구역이므로 경고도 그 방식 것만 뜬다 */
  ok('비어 있다는 것을 경고로 알린다', pdoc().querySelectorAll('.pv-warn').length === 3,
    String(pdoc().querySelectorAll('.pv-warn').length));
  ok('어느 칸이 비었는지 이름을 적는다',
    warns.includes('한 줄') && warns.includes('기대 효과 문구'), warns);
  ok('어느 방식인지 적는다', warns.includes('방식 A'), warns);
  ok('보고 있지 않은 방식은 섞이지 않는다', !warns.includes('방식 B'), warns);
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
  const pvTab = (p) => Array.from(d.querySelectorAll('.recpv-tab'))
    .find((x) => x.dataset.pvplan === p);
  ok('A 탭 배지가 코스 A의 제목이다 (방식 이름이 아니다)',
    texts('.plan-type-lbl').join(',') === '코스가 제목', texts('.plan-type-lbl').join(','));
  ok('A 탭 설명이 코스 A의 한 줄 설명이다',
    texts('.plan-desc').join(',') === '코스가 한 줄', texts('.plan-desc').join(','));
  ok('포인트가 코스 하이라이트 **앞 3개**다',
    texts('.plan-points li').join(',') === '하이가1,하이가2,하이가3',
    texts('.plan-points li').join(','));
  ok('기대 효과도 코스의 한 줄 설명이다',
    texts('.plan-value-text').join(',') === '코스가 한 줄', texts('.plan-value-text').join(','));
  ok('✨에 써 둔 방식 이름은 카드에 안 나온다',
    !texts('.plan-type-lbl').includes('역량강화'), texts('.plan-type-lbl').join(','));
  /* B 탭은 **다른 코스**에서 와야 한다 — 탭이 갈렸어도 짝은 그대로다 */
  pvTab('b').click();
  ok('B 탭은 코스 B에서 온다',
    texts('.plan-type-lbl').join(',') === '코스나 제목'
    && texts('.plan-points li').join(',') === '하이나1',
    texts('.plan-type-lbl').join(',') + ' / ' + texts('.plan-points li').join(','));
  ok('B 탭의 출처 표시도 코스 B다', /코스 B/.test(texts('.pv-from').join(' | ')),
    texts('.pv-from').join(' | '));
  pvTab('a').click();
  /* 어디를 고쳐야 이 자리가 바뀌는지 말해 준다 — 이게 없으면 또 못 찾는다 */
  const froms = texts('.pv-from').join(' | ');
  ok('보고 있는 카드의 출처를 적는다', /코스 A/.test(froms), froms);
  ok('출처에 코스 제목까지 적는다', froms.includes('코스가 제목'), froms);
  ok('출처가 📅 날짜별 일정을 가리킨다', /날짜별 일정/.test(froms), froms);
  ok('탭에도 어느 코스인지 적힌다',
    d.getElementById('recPvTabSubA').textContent.includes('코스 A')
    && d.getElementById('recPvTabSubB').textContent.includes('코스 B'),
    d.getElementById('recPvTabSubA').textContent + ' / ' + d.getElementById('recPvTabSubB').textContent);

  /* RR: 코스가 있으면 **코스에 쓴 일자가 그대로** 나오고, 코스보다 긴 날만 ✨의
     '일별 주요 활동'으로 채워진다. 예전 미리보기는 코스 일자를 아예 안 보여주고
     활동 목록만 나열해서, 담당자가 쓴 DAY 1~3이 어디로 가는지 알 수 없었다.
     코스가 3일이라 기본 일수는 4일 — 마지막 일자(귀국)는 항상 실제 마지막 날로 밀린다. */
  ok('코스에 쓴 일자가 그대로 보인다',
    texts('.itin-day-title').join(',') === '첫날,가운데,A활동1,마지막',
    texts('.itin-day-title').join(','));
  ok('코스의 마지막 일자가 실제 마지막 날로 밀린다',
    texts('.itin-day-title')[3] === '마지막' && texts('.itin-day-num')[3].trim() === 'DAY 4',
    texts('.itin-day-num').join(',') + ' / ' + texts('.itin-day-title').join(','));
  ok('자동으로 채워진 날이 있으면 숫자로 알려준다',
    /자동 문구/.test(texts('.pv-warn').join(' ')), texts('.pv-warn').join(' | '));

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
  /* ⚠ 개수와 키를 **여기 적지 않는다**(VV에서 휴양이 늘면서 4로 못 박아 둔 것이 걸렸다).
     기대값을 data.js에서 파생시킨다 — 그러면 유형이 늘어도 이 검사는 「화면이 그 표를
     그대로 쓰는가」만 묻는다. 목록을 두 번 적지 않는다는 이 저장소 원칙 그대로다. */
  const EXPECT_TYPES = Object.keys(require('../data').PROGRAM_TYPES);
  ok('프로그램 유형을 고를 수 있다', !!typeSel && typeSel.options.length === EXPECT_TYPES.length,
    typeSel ? typeSel.options.length + '개 vs data.js ' + EXPECT_TYPES.length + '개' : '(없음)');
  ok('유형 이름이 data.js의 PROGRAM_TYPES에서 온다',
    Array.from(typeSel.options).map((o) => o.value).join(',') === EXPECT_TYPES.join(','),
    Array.from(typeSel.options).map((o) => o.value).join(',') + ' vs ' + EXPECT_TYPES.join(','));
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
  /* ⚠ RU 이후 미리보기는 **한 번에 한 방식**만 그린다. 그래서 A 전용·B 전용 클래스는
     각자의 탭에서 확인한다 — 한 탭만 보고 "B 클래스가 없다"고 하면 오탐이다. */
  const onTab = (p, fn) => {
    Array.from(d.querySelectorAll('.recpv-tab')).find((x) => x.dataset.pvplan === p).click();
    const r = fn();
    Array.from(d.querySelectorAll('.recpv-tab')).find((x) => x.dataset.pvplan === 'a').click();
    return r;
  };
  ['plan-cards', 'plan-card', 'plan-card-hd', 'plan-tag', 'plan-tag-a', 'plan-tag-b',
   'plan-type-lbl', 'plan-desc', 'plan-points'].forEach((c) => {
    ok('index.html도 .' + c + '를 쓴다', indexSrc.includes('class="' + c)
      || new RegExp('class="[^"]*\\b' + c + '\\b').test(indexSrc));
    const plan = c === 'plan-tag-b' ? 'b' : 'a';
    ok('미리보기에 .' + c + '가 있다', onTab(plan, () => !!pdoc().querySelector('.' + c)));
  });
  ['plan-value-box', 'plan-value-label', 'plan-value-text'].forEach((c) => {
    ok('미리보기에 .' + c + '가 있다', !!pdoc().querySelector('.' + c));
  });
  /* 일별 카드 클래스는 rec_fallbacks.js의 recRenderDayCard가 만든다 (RR).
     예전엔 script.js의 _renderRichDayCard가 문자열로 만들었고, 미리보기는 그 모양을
     **따로 조립**했다 — 두 벌이라 미리보기가 오전·오후·저녁을 아예 못 보여줬다. */
  const rfSrc = fs.readFileSync(path.join(ROOT, 'rec_fallbacks.js'), 'utf8');
  ['itin-day-card', 'itin-day-header', 'itin-day-hd-l', 'itin-day-num', 'itin-day-title',
   'itin-slot', 'itin-slot-time', 'itin-slot-content'].forEach((c) => {
    ok('rec_fallbacks.js가 .' + c + '를 만든다', rfSrc.includes(c));
    ok('미리보기에 .' + c + '가 있다', !!pdoc().querySelector('.' + c));
  });
  ok('script.js가 일별 카드 모양을 따로 적지 않는다',
    !/itin-slot-content/.test(scriptSrc),
    'script.js에 카드 마크업이 남아 있으면 두 벌이 된다(결함 생성기 ①)');
  /* ⚠ admin.html은 만들어진 카드에 **편집 손잡이만 얹는다**(RS) — 찾기 위해 클래스
     이름을 쓰는 것은 정상이고, 그 클래스를 **직접 만드는 것**이 두 벌이 되는 신호다. */
  ok('admin.html이 일별 카드를 직접 조립하지 않는다',
    !/className\s*=\s*['"]itin-/.test(adminSrc)
    && !/createElement\([^)]*\)[^;]*itin-day-card/.test(adminSrc),
    'admin.html이 itin-* 클래스를 만들어 붙이면 카드가 두 벌이 된다');
  /* 그 클래스들이 styles.css에 실제로 정의돼 있어야 모양이 나온다 */
  ['.plan-cards', '.plan-card', '.plan-desc', '.plan-points', '.plan-value-box', '.itin-day-card',
   '.itin-slot', '.itin-tip']
    .forEach((c) => ok('styles.css에 ' + c + '가 정의돼 있다',
      new RegExp('\\' + c + '\\s*[,{]').test(stylesSrc)));

  /* ⚠ 이제는 오전·오후·저녁을 **보여줘야 한다** (RR). 담당자가 가장 많은 시간을 쓰는
     칸인데 미리보기에 한 글자도 안 나오던 것이 이 화면의 가장 큰 구멍이었다. */
  const slotTimes = texts('.itin-slot-time');
  ok('미리보기가 오전·오후·저녁을 보여준다', slotTimes.length > 0, String(slotTimes.length));
  ok('시간 라벨이 고객 화면과 같다',
    ['오전', '오후', '저녁'].every((t) => slotTimes.includes(t)),
    slotTimes.slice(0, 6).join(', '));
  ok('DAY 번호가 붙는다', /^DAY\s*1$/.test((texts('.itin-day-num')[0] || '').trim()),
    texts('.itin-day-num').slice(0, 3).join(' | '));
  ok('도착일·귀국일 배지가 고객 화면과 같이 붙는다',
    texts('.itin-day-badge').includes('도착일') && texts('.itin-day-badge').includes('귀국일'),
    texts('.itin-day-badge').join(', '));
  ok('일수를 바꿔 볼 수 있다', !!d.getElementById('recPvDays'),
    '고객이 코스보다 긴 일수를 고르면 자동 문구가 섞인다 — 고정하면 그걸 못 본다');

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

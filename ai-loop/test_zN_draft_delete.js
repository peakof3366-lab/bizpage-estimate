/* ═══════════════════════════════════════════════════════════════════════════
   ZN·ZO — **목록 줄에서 상태에 맞는 동작 하나**: 실제로 눌러 본다

   2026-09-08 대표: 「작성중이던 견적서를 지울 수 있는 기능도 있어야 할 것 같다.」
   그전에는 **편집 화면을 열어야만** 지울 수 있었다.

   🔴 **그리고 같은 날 규칙이 하나 더 정해졌다 (ZO).**
     지우고 싶은 것의 대부분은 「지우기」가 아니라 **「내리기」**다. 그래서 상태마다
     **맞는 동작 하나만** 준다:

         작성중        아무 데도 안 나갔다        → 지운다 (되돌릴 수 없다)
         확정·판매중    나갔거나 나갈 수 있다      → **내린다** (되돌릴 수 있다)
         종료·마감      지난 기록                 → 아무것도 안 준다

     확정 건에 삭제를 안 다는 것은 **견적서 대장이 지우지 않고 `void`로 내리는 것과
     같은 규칙**이다. 지우면 「우리가 그 값을 낸 적 있다」가 사라진다.

   🔴 이 검사가 지키는 것은 「버튼이 있다」가 아니라 **「아무거나 지워지지 않는다」**이다:

     ① **작성중(`draft`)에만** 버튼이 붙는다.
        발급은 `status='open'`일 때만 되므로(`api/_lib/packages.js`) 작성중은
        **견적서가 나간 적이 없다** — 지워도 고객 쪽에 영향이 없는 유일한 상태다.
     ② 버튼을 눌러도 **편집 화면이 열리면 안 된다**(줄 클릭과 겹친다).
        열리면 담당자는 무슨 일이 일어났는지 알 수 없다.
     ③ 물을 때 **무엇을 지우는지 이름을 말한다.** 「이 항목을 지울까요?」로는 목록에서
        누른 줄이 맞는지 확인할 방법이 없다.
     ④ 목록이 낡아 상태가 그 사이 바뀌었으면 **코드가 한 번 더 막는다.**
     ⑤ 자리는 늘 차지한다 — 있는 줄만 넓어지면 목록이 들쭉날쭉해진다.
     ⑥ **서버는 상태를 안 가린다.** 가리면 편집 화면의 기존 삭제(마감 건 포함)가 막힌다.
        이 제한은 **목록이라는 지름길의 조건**이지 삭제 자체의 규칙이 아니다.

   ⚠ VU/WE가 밟은 함정: data.js를 안 실으면 admin의 top-level이 죽어 전부 기본값으로
     보이면서 **통과**한다. [0]에서 먼저 확인하고 아니면 즉시 멈춘다.

   실행: node ai-loop/test_zN_draft_delete.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { adminSource } = require('./_admin_source');

const ROOT = path.join(__dirname, '..');
const ADMIN = adminSource();
const CONTENT = fs.readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZN·ZO 목록 줄의 상태별 동작`);
  process.exit(fail ? 1 : 0);
};

const dom = new JSDOM(ADMIN, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    w.Element.prototype.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
  },
});
const w = dom.window, d = w.document;

const FIXTURE = [
  { id: 'adhoc-260908-aa', kind: 'adhoc', title: '김보균님 오키나와', status: 'draft',
    pricePerPerson: 1190000, customerLabel: '김보균님 4명', destLabel: '오키나와' },
  { id: 'adhoc-260908-bb', kind: 'adhoc', title: '○○교회 보홀', status: 'open',
    pricePerPerson: 1450000, customerLabel: '○○교회 20명', destLabel: '보홀' },
  { id: 'adhoc-260908-cc', kind: 'adhoc', title: '지난 건 세부', status: 'closed',
    pricePerPerson: 990000, customerLabel: '세부 12명', destLabel: '세부' },
];

function rowsOf(boxId) { return [...d.querySelectorAll('#' + boxId + ' .pkg-row')]; }

function run() {
  console.log('\n[0] 🔴 스크립트가 살아 있는가 — 이걸 먼저 안 보면 기본값을 읽는다');
  if (typeof w.pkgDrawList !== 'function' || typeof w.pkgDeleteRow !== 'function') {
    fail++;
    console.log('  ✗ 관리자 스크립트가 죽었거나 pkgDeleteRow가 없다 — 아래는 의미가 없다');
    return done();
  }
  ok('⓪ pkgDrawList·pkgDeleteRow가 살아 있다', true);

  /* 🔴 `pkgAll`은 스크립트 최상위 `let`이라 **window 속성으로는 못 바꾼다** —
     `w.pkgAll = …`은 조용히 다른 값을 만들고 목록은 0줄로 그려진다(실제로 겪었다).
     전역 스코프에서 실행해야 그 바인딩에 닿는다. */
  w.eval('pkgAll = ' + JSON.stringify(FIXTURE) + '; pkgDrawList();');

  console.log('\n[1] 삭제 버튼은 **작성중에만** 붙는다');
  const rows = rowsOf('adhocList');
  if (rows.length !== 3) {
    fail++;
    console.log('  ✗ ① 목록에 3줄이 그려졌다 → 실제 ' + rows.length + ' — 아래는 의미가 없어 멈춘다');
    return done();
  }
  ok('① 목록에 3줄이 그려졌다', true);
  const has = rows.map((r) => !!r.querySelector('.pkg-del'));
  const closeBtn = rows.map((r) => r.querySelector('.pkg-close'));
  ok('① 작성중에는 버튼이 있다', has[0] === true);
  ok('① 판매중·확정에는 없다', has[1] === false);
  ok('① 마감에는 없다', has[2] === false);
  /* ⑤ 자리는 늘 차지한다 — 빈 칸이라도 있어야 줄 높이가 안 흔들린다 */
  /* ⚠ 빈 배열에서 `every`는 **무조건 참**이다 — 줄이 0개면 이 검사가 늘 통과한다.
     줄 수를 함께 본다(늘 통과하는 검사는 아무것도 안 지킨다). */
  ok('⑤ 버튼이 없는 줄도 자리는 남긴다',
    rows.length === 3 && rows.every((r) => !!r.querySelector('.pkg-act-slot')));

  console.log('\n[1b] 🔴 확정 건에는 삭제가 아니라 **내리기**가 붙는다 (ZO)');
  /* 대표와 합의한 규칙: 지우고 싶은 것의 대부분은 「지우기」가 아니라 「내리기」다.
     확정 건에 삭제를 달지 않는 것은 견적서 대장이 지우지 않고 `void`로 내리는 것과
     같은 규칙이다 — 지우면 「우리가 그 값을 낸 적 있다」가 사라진다. */
  ok('⑧ 확정에는 삭제가 없고 내리기가 있다', has[1] === false && !!closeBtn[1]);
  ok('⑧ 직접견적에서는 「종료」라고 부른다',
    !!closeBtn[1] && closeBtn[1].textContent.trim() === '종료',
    closeBtn[1] && closeBtn[1].textContent);
  ok('⑧ 종료·마감에는 아무것도 안 준다', has[2] === false && !closeBtn[2]);
  ok('⑧ 작성중에는 내리기가 없다 — 지우는 게 맞다', !closeBtn[0]);
  /* 되돌릴 수 있는 동작이라 삭제와 **같은 색을 쓰지 않는다** — 둘 다 빨강이면
     정작 되돌릴 수 없는 삭제가 안 무서워진다. */
  ok('⑧ 내리기와 삭제가 다른 색이다',
    /\.pkg-close:hover \{ border-color: var\(--heading\)/.test(ADMIN)
    && /\.pkg-del:hover \{ border-color: var\(--danger\)/.test(ADMIN));

  console.log('\n[2] 눌러도 편집 화면이 열리면 안 된다 (줄 클릭과 겹친다)');
  {
    let asked = null;
    w.confirm = (m) => { asked = m; return false; };   /* 「취소」를 누른 셈 */
    const card = d.getElementById('pkgEditCard');
    if (card) card.style.display = 'none';
    rows[0].querySelector('.pkg-del').click();
    ok('② 편집 카드가 안 열렸다', !card || card.style.display === 'none',
      card && card.style.display);
    ok('③ 무엇을 지우는지 **이름을 넣어** 물었다',
      typeof asked === 'string' && asked.includes('김보균님 오키나와'), String(asked));
    ok('③ 되돌릴 수 없다고 말했다', typeof asked === 'string' && /되돌릴 수 없습니다/.test(asked));
    ok('② 취소하면 줄이 그대로다', rowsOf('adhocList').length === 3);
  }

  console.log('\n[3] 목록이 낡았을 때 — 코드가 한 번 더 막는다');
  {
    let alerted = null, asked = false;
    w.alert = (m) => { alerted = m; };
    w.confirm = () => { asked = true; return true; };
    /* 화면에는 버튼이 없지만, 목록이 낡아 그 사이 「확정」이 된 경우를 흉내낸다 */
    w.pkgDeleteRow({ id: 'x', title: '확정된 건', status: 'open' });
    ok('④ 작성중이 아니면 지우지 않는다', asked === false);
    ok('④ 왜 못 지우는지 말한다',
      typeof alerted === 'string' && alerted.includes('작성중'), String(alerted));
  }

  console.log('\n[3b] 내리기 — 상태만 바꾸고, 되돌릴 수 있다고 말한다 (ZO)');
  {
    let asked = null;
    w.confirm = (m) => { asked = m; return false; };
    const card = d.getElementById('pkgEditCard');
    if (card) card.style.display = 'none';
    closeBtn[1].click();
    ok('⑨ 편집 카드가 안 열렸다', !card || card.style.display === 'none');
    ok('⑨ 무엇을 어떤 상태로 바꾸는지 말한다',
      typeof asked === 'string' && asked.includes('○○교회 보홀') && asked.includes('종료'), String(asked));
    ok('⑨ 되돌릴 수 있다고 말한다', typeof asked === 'string' && /되돌릴 수 있습니다/.test(asked));
    /* ⚠ 확인 창은 **글자 그대로** 보인다 — 마크다운 표기가 새면 별표가 그대로 뜬다.
       실제로 한 번 새어 나갔고 브라우저로 눌러 보다 잡았다. */
    ok('⑨ 확인 창에 마크다운 표기가 안 샌다', typeof asked === 'string' && !asked.includes('**'));

    let alerted = null, asked2 = false;
    w.alert = (m) => { alerted = m; };
    w.confirm = () => { asked2 = true; return true; };
    /* 목록이 낡아 그 사이 상태가 바뀐 경우 */
    w.pkgCloseRow({ id: 'x', title: '이미 종료된 건', status: 'closed' }, true);
    ok('⑨ 확정이 아니면 안 바꾼다', asked2 === false);
    ok('⑨ 왜 못 바꾸는지 말한다', typeof alerted === 'string' && alerted.includes('확정'), String(alerted));
  }

  console.log('\n[3c] 저장 규칙을 두 벌로 만들지 않았다 (결함 생성기 ①)');
  {
    /* 상태만 바꾸는 전용 API를 새로 파면 검증·권한·기본값이 두 곳이 되고 반드시
       어긋난다. 목록이 가진 행을 그대로 PUT으로 되돌려 보내되 status만 바꾼다.
       ⚠ Vercel 함수 12개 한도에 이미 도달해 새 API 파일 자체가 불가능하기도 하다. */
    ok('⑩ 기존 PUT을 그대로 쓴다',
      /pkgCloseRow[\s\S]{0,1600}method: 'PUT'[\s\S]{0,400}status: 'closed'/.test(ADMIN));
    ok('⑩ 권한 거절을 사람 말로 옮긴다',
      /adhoc_requires_manager[\s\S]{0,200}매니저 이상만 바꿀 수 있습니다/.test(ADMIN));
  }

  console.log('\n[4] 인라인 onclick을 안 쓴다 (CLAUDE.md 결함 생성기 ④)');
  {
    /* 지금 넣는 값은 우리 목록의 위치(i)뿐이라 안전하지만, 그 구조를 열어 두면
       나중에 사람이 적은 제목이 그 자리에 들어온다 — `esc()`로도 못 막는다. */
    ok('⑦ 삭제 버튼에 인라인 onclick이 없다',
      !/class="pkg-del"[^>]*onclick/.test(ADMIN) && /data-del="/.test(ADMIN));
    ok('⑦ 줄 클릭을 끊는다(stopPropagation)',
      /pkg-del'\)\.forEach[\s\S]{0,220}stopPropagation/.test(ADMIN));
  }

  console.log('\n[5] 🔴 서버는 상태를 안 가린다 — 편집 화면의 삭제가 막히면 안 된다');
  {
    /* 마감된 건을 정리하는 길은 편집 화면에 남아 있어야 한다. 서버에 상태 조건을
       넣으면 그 길이 조용히 막히고, 담당자는 「왜 안 지워지지」만 겪는다. */
    ok('⑥ packages DELETE에 status 조건이 없다',
      !/delete[\s\S]{0,400}from packages[\s\S]{0,200}status\s*=/.test(CONTENT));
    ok('⑥ 지우기 전에 기록을 남긴다(deleteAndLog)',
      /deleteAndLog\(sql, 'packages'/.test(CONTENT), '지운 근거가 남아야 한다(YP)');
    ok('⑥ 그 자리에 왜 기록이 필요한지 적혀 있다',
      /2026-08-24에 상품 30건이 사라진 자리/.test(CONTENT));
  }

  done();
}

if (d.readyState === 'complete' || d.readyState === 'interactive') setTimeout(run, 60);
else w.addEventListener('DOMContentLoaded', () => setTimeout(run, 60));

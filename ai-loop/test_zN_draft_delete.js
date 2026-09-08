/* ═══════════════════════════════════════════════════════════════════════════
   ZN — **작성중인 견적을 목록에서 바로 지운다**: 실제로 눌러 본다

   2026-09-08 대표: 「작성중이던 견적서를 지울 수 있는 기능도 있어야 할 것 같다.」
   그전에는 **편집 화면을 열어야만** 지울 수 있었다.

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

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const CONTENT = fs.readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — ZN 작성중 견적 목록 삭제`);
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
  ok('① 작성중에는 버튼이 있다', has[0] === true);
  ok('① 판매중·확정에는 없다', has[1] === false);
  ok('① 마감에는 없다', has[2] === false);
  /* ⑤ 자리는 늘 차지한다 — 빈 칸이라도 있어야 줄 높이가 안 흔들린다 */
  /* ⚠ 빈 배열에서 `every`는 **무조건 참**이다 — 줄이 0개면 이 검사가 늘 통과한다.
     줄 수를 함께 본다(늘 통과하는 검사는 아무것도 안 지킨다). */
  ok('⑤ 버튼이 없는 줄도 자리는 남긴다',
    rows.length === 3 && rows.every((r) => !!r.querySelector('.pkg-del-slot')));

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

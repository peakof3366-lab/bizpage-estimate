/* ═══════════════════════════════════════════════════════════════════════════
   ZK — 견적서가 **무엇이 빠졌는지도 말한다** (2026-09-15 대표 지시)

   ■ 대표가 말한 것
   실제 업무용 표준 양식(트립페이지/PAGE ONE)을 우리 견적서와 나란히 놓고 보시고
   「지금은 너무 두루뭉실해 보이는 견적서로 보인다. 추가할 부분이 보이면 반영해 달라.」

   ■ 대조해서 나온 가장 큰 차이
   **우리 견적서는 「포함 항목」만 보여주고 「무엇이 빠졌는지」는 한 줄도 없었다.**
   표준 양식은 「불포함내역」을 **빨간 글씨로 강조**한다 — 나중에 「이건 왜 따로 받나」가
   나오는 자리라 문서에서 미리 못 박는 대목이기 때문이다.
   ⚠ 패키지 견적서에는 이미 불포함이 있었다(`d.pkg.excluded`, 공급사가 준 목록).
     **맞춤 견적에만 없었다** — 그래서 눈에 안 띄고 오래 남아 있었다.

   ■ 🔴 이 검사가 지키는 핵심 — **견적서는 두 벌이다**
     · 팝업 문서(`script.js`의 `openEstimateWindow`) — 계산 직후 그 자리에서 인쇄·PDF
     · 링크 견적서(`estimate-view.html`) — 카톡으로 전달되는 정식 문서
   이 저장소는 그 둘이 갈려 **한쪽만 고쳐지는 사고**를 거듭 겪었다(XC·XD·XP·WQ).
   → 목록을 **`company-info.js` 한 곳**(`window.QUOTE_EXCLUDED`)에 두고 둘 다 읽는다.
     여기서 「두 문서가 같은 출처를 본다」를 잠근다.

   ■ ⚠ 패키지는 이 목록을 쓰지 않는다
   패키지 불포함은 **공급사가 준 값이 진실**이다(2026-08-21 대표 결정 — 우리가
   재산출하지 않는다). 링크 견적서에서 `!d.pkg` 조건으로 갈라 둔 것을 여기서 지킨다.

   ■ ⚠ 여기 **없는 것**은 대표가 정해야 하는 값이다 (결정대기열 0-ac·0-ad)
   가이드·기사 **팁**이 포함인지, 여행자보험 **보장 한도**가 얼마인지, 「요청 시 사후정산」을
   약속할지는 **실거래 조건**이라 지어내지 않았다. 정해지면 `QUOTE_EXCLUDED`에 한 줄씩
   더하면 두 문서에 동시에 반영된다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CI = read('company-info.js');
const VIEW = read('estimate-view.html');
const SCRIPT = read('script.js');

/* 주석을 걷은 판 — 경위 주석에 옛 코드와 문구가 인용돼 있어, 안 걷으면 설명 때문에
   검사가 통과하거나 실패한다(이 저장소가 여러 번 겪은 함정이다). */
const strip = (s, open, close) => {
  let out = '', i = 0;
  for (;;) {
    const a = s.indexOf(open, i);
    if (a < 0) { out += s.slice(i); break; }
    out += s.slice(i, a);
    const b = s.indexOf(close, a);
    if (b < 0) break;
    i = b + close.length;
  }
  return out;
};
const code = (s) => strip(strip(s, '/*', '*/'), '<!--', '-->');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 불포함 목록이 **한 곳**에 있다');
/* 실제로 불러와 본다 — 글자만 보면 오타가 있어도 통과한다 */
const win = {};
// eslint-disable-next-line no-new-func
new Function('window', CI)(win);
const list = win.QUOTE_EXCLUDED;
ok('① company-info.js가 QUOTE_EXCLUDED를 내준다', Array.isArray(list), typeof list);
ok('① 비어 있지 않다', Array.isArray(list) && list.length >= 3, list && list.length);
ok('① 전부 사람이 읽는 문장이다', Array.isArray(list)
  && list.every((s) => typeof s === 'string' && s.trim().length > 2), JSON.stringify(list));
/* 🔴 회사 정보와 같은 파일에 둔 이유가 「두 문서가 다 싣는 유일한 파일」이다.
   회사 정보 자체가 사라지면 이 전제가 깨진다 — 함께 확인한다. */
ok('① 회사 정보도 그대로 있다(같은 파일을 쓰는 전제)', !!(win.COMPANY_INFO && win.COMPANY_INFO.legalName));

console.log('\n[2] 🔴 **두 문서가 같은 출처를 읽는다** (견적서는 두 벌이다)');
const viewCode = code(VIEW);
const scriptCode = code(SCRIPT);
ok('② 링크 견적서가 QUOTE_EXCLUDED를 읽는다', viewCode.indexOf('window.QUOTE_EXCLUDED') >= 0);
ok('② 팝업 견적서도 QUOTE_EXCLUDED를 읽는다', scriptCode.indexOf('window.QUOTE_EXCLUDED') >= 0);
/* 🔴 한쪽이 목록을 **자기 파일에 따로 적으면** 두 문서가 갈린다. 그걸 막는다. */
for (const [이름, src] of [['링크 견적서', viewCode], ['팝업 견적서', scriptCode]]) {
  const 박아둠 = Array.isArray(list) && list.some((s) => src.indexOf(s) >= 0);
  ok(`② 🔴 ${이름}가 목록을 자기 파일에 베껴 적지 않았다`, !박아둠,
    '두 문서가 갈린다 — company-info.js 하나만 읽을 것');
}
/* 두 문서가 싣는지도 본다 — 안 실으면 값이 undefined라 조용히 아무것도 안 그린다 */
ok('② 링크 견적서가 company-info.js를 싣는다', VIEW.indexOf('src="company-info.js"') >= 0);
ok('② 팝업을 만드는 화면도 싣는다(index.html)', read('index.html').indexOf('src="company-info.js"') >= 0);
ok('② 담당자 산출 화면도 싣는다(admin-quote-pro.html)',
  read('admin-quote-pro.html').indexOf('src="company-info.js"') >= 0);

console.log('\n[3] 두 문서가 **같은 제목**으로 보여 준다');
ok('③ 링크 견적서에 「불포함 내역」 제목이 있다', viewCode.indexOf('>불포함 내역<') >= 0);
ok('③ 팝업 견적서에도 있다', scriptCode.indexOf('>불포함 내역<') >= 0);
/* 제목만 있고 안내가 없으면 「그래서 어쩌라는 건가」가 된다 */
ok('③ 링크 견적서가 무엇을 하면 되는지 말한다', viewCode.indexOf('exc-note') >= 0);
ok('③ 팝업 견적서도 말한다', scriptCode.indexOf('exc-note') >= 0);

console.log('\n[4] 🔴 포함과 **눈으로 구별**된다');
/* 같은 모양이면 고객이 「포함 목록이 길구나」로 읽는다 — 정반대로 읽히는 사고다. */
for (const [이름, src] of [['링크 견적서', VIEW], ['팝업 견적서', SCRIPT]]) {
  ok(`④ ${이름}에 불포함 전용 모양(.exc-tag)이 있다`, src.indexOf('.exc-tag') >= 0);
}
/* ⚠ 색만으로 가르지 않는다 — 제목이 글자로 말한다(WCAG 1.4.1).
   위 [3]이 그 제목을 지키므로 여기서는 「색도 다르다」만 확인한다. */
ok('④ 불포함 칩이 흰 바탕이다(포함은 연분홍 채움)',
  VIEW.indexOf('background: #fff; color: #6E6E6E;') >= 0 || VIEW.indexOf('background:#fff') >= 0);

console.log('\n[5] ⚠ **패키지는 이 목록을 쓰지 않는다** (공급사 값이 진실이다)');
/* 패키지에 우리 표준 불포함을 덧붙이면 **공급사가 준 조건과 다른 말**을 하게 된다.
   2026-08-21 대표 결정: 패키지는 재산출하지 않고 받은 값 그대로 판다. */
const excBlockAt = viewCode.indexOf('window.QUOTE_EXCLUDED');
const around = excBlockAt >= 0 ? viewCode.slice(Math.max(0, excBlockAt - 200), excBlockAt + 60) : '';
ok('⑤ 링크 견적서가 패키지를 제외하고 그린다', around.indexOf('!d.pkg') >= 0, around.slice(0, 120));
ok('⑤ 패키지 전용 불포함(공급사 목록)은 그대로 있다', viewCode.indexOf('d.pkg.excluded') >= 0);

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — ZK 불포함 내역`);
process.exit(fail ? 1 : 0);

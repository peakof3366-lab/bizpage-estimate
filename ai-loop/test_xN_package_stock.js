/* ═══════════════════════════════════════════════════════════════════════════
   XN — **없는 것을 있는 것처럼 권하지 않는다**

   ■ 원래 이 검사가 보던 자리 (2026-08-26 ~ 2026-09-14)
   첫 화면 갈림길 카드가 「고르시면 일정표와 견적서를 그 자리에서 만들어 드립니다」라고
   권하는데, 누르면 **아무것도 없는 목록**이었다(운영 실측 `{"packages":[]}`).
   그래서 재고를 보고 카드가 스스로 「준비 중」으로 바뀌게 해 두었다.

   ■ 왜 자리를 옮겼나 (2026-09-14)
   대표 지시로 **갈림길 구역을 통째로 뺐다**(「쓸데없는 문구로 방문자 접근만 어렵게
   만든다」 — `test_vT_second_entrance.js`에 경위가 있다). 카드가 없어졌으니 카드를 보는
   검사도 뜻이 없다.
   🔴 **그렇다고 지우면 원칙까지 같이 사라진다.** 패키지로 가는 문은 **상단 메뉴에**
     그대로 있고(`index.html`의 `.nav-pkg`), 그 문을 지나면 여전히 빈 목록을 만난다.
     즉 원칙은 살아 있고 **자리만 `packages.html`로 옮겨간 것**이다.

   ■ 무엇을 지키는가 — 「조용한 거짓말」을 막는 셋 (XX)
     ① **못 불러왔다**  → 일시적 오류라고 말하고 **다시 시도**할 길을 준다
     ② **고른 지역에만 없다** → 다른 지역이나 맞춤 견적으로 보낸다
     ③ **정말 없다**    → 솔직히 말하고 **맞춤 견적**으로 보낸다
   셋을 한 문장으로 뭉뚱그리면 손님은 고장인지 없는 건지 모른 채 그냥 나간다.
   ⚠ 그리고 **빈 화면을 그냥 두지 않는다** — 비어 있으면 고장으로 읽히고 문의가 안 온다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const pk = read('packages.html');
const idx = read('index.html');

console.log('\n[1] 패키지로 가는 문이 아직 있다 — 없으면 이 검사 전체가 뜻이 없다');
/* 🔴 갈림길을 빼면서 이 링크까지 사라지면 packages.html은 아무도 못 닿는 방이 된다.
   그때는 「빈 목록 안내」를 아무리 잘 써도 보는 사람이 없다. */
ok('① 첫 화면 메뉴에 패키지 링크가 있다', /href="packages\.html"/.test(idx));

console.log('\n[2] 빈 목록이 **세 가지를 갈라서** 말한다');
ok('② 못 불러왔을 때를 따로 말한다', /불러오지 못했습니다/.test(pk));
ok('② 그때 다시 시도할 길을 준다', /다시 시도/.test(pk) && /location\.reload\(\)/.test(pk));
ok('② 고른 지역에만 없을 때를 따로 말한다', /고르신 지역에는 지금 열린 상품이 없습니다/.test(pk));
ok('② 정말 없을 때를 따로 말한다', /지금 준비된 패키지 상품이 없습니다/.test(pk));

console.log('\n[3] 🔴 막다른 곳으로 두지 않는다 — 할 수 있는 다음 걸음을 준다');
const emptyBlock = (pk.match(/empty\.innerHTML =[\s\S]{0,900}/) || [''])[0];
ok('③ 비었을 때 맞춤 견적으로 가는 길을 준다',
  /맞춤 견적/.test(emptyBlock) && /href="index\.html"/.test(emptyBlock));
ok('③ 안내를 빈 채로 두지 않는다', /empty\.style\.display = ''/.test(pk));

console.log('\n[4] 상품이 있으면 개수를 말한다');
/* 사람이 문구를 되돌리는 일을 남기면 그 일은 잊힌다 — 숫자가 저절로 따라와야 한다. */
ok('④ 개수를 화면에 쓴다', /'상품 ' \+ list\.length \+ '개'/.test(pk));

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — XN 없는 것을 있는 것처럼 권하지 않는다`);
process.exit(fail ? 1 : 0);

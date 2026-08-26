/* ═══════════════════════════════════════════════════════════════════════════
   XN — 첫 화면이 **빈 방으로 안내하고** 있었다
   ───────────────────────────────────────────────────────────────────────────
   2026-08-26 프로덕션 실측: `/api/content?action=packages` → `{"packages":[]}`.
   고객이 보는 패키지 목록이 **0건**이다(상품을 여는 것은 대표 결정 — 대기열 P-1).

   그런데 첫 화면의 갈림길 카드는 이렇게 권하고 있었다:
     「일정이 이미 정해진 여행이라면 … 고르시면 **일정표와 견적서를 그 자리에서**
       만들어 드립니다 · 패키지 상품 보기 →」
   누르면 **아무것도 없는 목록**이다. 상품을 여는 것은 우리가 정할 수 없지만,
   **없는 것을 있는 것처럼 권하는 것**은 고칠 수 있다.

   ■ 규칙 셋 (셋 다 「조용한 거짓말」을 막는 것이다)
     ① 0건이면 「준비 중」이라고 말하고 **할 수 있는 다음 걸음**으로 보낸다
     ② 상품이 있으면 **개수를 말한다** — 그리고 문구는 저절로 원래대로 돌아온다
        (사람이 되돌리는 일을 남기면 그 일은 잊힌다)
     ③ **못 받았으면 아무것도 바꾸지 않는다** — 네트워크가 잠깐 안 될 때
        「준비 중」이라고 말하는 것이 더 나쁜 거짓말이다
   ═══════════════════════════════════════════════════════════════════════════ */
const { bootPage, visibleText } = require('./_page_boot');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XN 빈 방으로 안내하지 않는다`);
  process.exit(fail ? 1 : 0);
};

const PKG = (n) => ({
  packages: Array.from({ length: n }, (_, i) => ({
    id: 'p' + i, title: '상품 ' + i, destLabel: '오키나와',
    pricePerPerson: 1190000, nights: 3, days: 4, priceAsOf: '2026-08-25',
  })),
});

(async () => {
  console.log('\n[1] 🔴 상품이 0건일 때 — 지금 프로덕션 상태다');
  {
    const B = bootPage('index.html', { fixtures: { packages: PKG(0) } });
    await B.ready; await B.tick(300);
    const card = B.doc.getElementById('trackPkg');
    const text = visibleText(card);
    ok('① 카드가 「준비 중」이라고 말한다', /준비 중/.test(text), text.slice(0, 90));
    ok('① 「그 자리에서 만들어 드립니다」라고 더 이상 말하지 않는다',
      !/그 자리에서 만들어 드립니다/.test(text), text.slice(0, 120));
    ok('① 할 수 있는 다음 걸음으로 보낸다(견적 계산기)',
      card.getAttribute('href') === '#estimate', card.getAttribute('href'));
    ok('① 무엇을 알려 달라는지 말한다', /지역·일정|지역.{0,3}일정/.test(text), text.slice(0, 120));
    ok('① 화면이 오류 없이 떴다', B.log.errors.length === 0, B.log.errors.map((e) => e.msg).join(' | '));
  }

  console.log('\n[2] 상품이 있으면 — 개수를 말하고 원래 문구로 돌아온다');
  {
    const B = bootPage('index.html', { fixtures: { packages: PKG(12) } });
    await B.ready; await B.tick(300);
    const card = B.doc.getElementById('trackPkg');
    const text = visibleText(card);
    ok('② 개수를 말한다', /12개 상품/.test(text), text.slice(0, 60));
    ok('② 원래 안내가 그대로 있다', /일정표와 견적서/.test(text));
    ok('② 링크는 패키지 목록으로 간다', card.getAttribute('href') === 'packages.html');
    ok('② 「준비 중」이라고 하지 않는다', !/준비 중/.test(text));
    /* 🔴 VP가 세운 경계 — **첫 화면에서 상품·금액을 다루지 않는다.** 패키지가는
       요율·계수·마진이 안 붙는 값이라, 엔진 화면과 한자리에 섞이면 그대로 사고다.
       개수까지는 재고 이야기지만 **금액·상품명이 나오면 그건 나열**이다. */
    ok('② 상품 금액이 첫 화면에 안 나온다', !/1,190,000/.test(visibleText(B.doc.body)));
    ok('② 상품 이름도 안 나온다', !/상품 0|상품 1(?!\d)/.test(text), text.slice(0, 80));
  }

  console.log('\n[3] 🔴 못 받았을 때는 **아무것도 바꾸지 않는다**');
  {
    /* 네트워크가 잠깐 안 되는 것과 상품이 없는 것은 다르다 */
    const B = bootPage('index.html', {
      fixtures: { route: (u, o, json) => (u.includes('action=packages') ? json({ error: 'x' }, false, 503) : null) },
    });
    await B.ready; await B.tick(300);
    const text = visibleText(B.doc.getElementById('trackPkg'));
    ok('③ 「준비 중」이라고 말하지 않는다', !/준비 중/.test(text), text.slice(0, 80));
    ok('③ 원래 문구 그대로다', /일정표와 견적서/.test(text));
    ok('③ 링크도 그대로다', B.doc.getElementById('trackPkg').getAttribute('href') === 'packages.html');
  }

  console.log('\n[4] 목록 화면도 빈 상태를 사람 말로 말한다(이미 있던 것 — 회귀 방지)');
  {
    const P = bootPage('packages.html', { fixtures: { packages: PKG(0) } });
    await P.ready; await P.tick(250);
    const empty = visibleText(P.doc.getElementById('pkEmpty'));
    ok('④ 왜 비었는지 말한다', /준비된 패키지 상품이 없습니다/.test(empty), empty.slice(0, 80));
    ok('④ 맞춤 견적으로 가는 길을 준다', !!P.doc.querySelector('#pkEmpty a[href="index.html"]'));
  }

  done();
})();

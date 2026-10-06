/* ═══════════════════════════════════════════════════════════════════════════
   업력 숫자 — **「SINCE 2010」 기준 올해 연차**와 화면 숫자가 같은가 (2026-10-06 대표 결정)
   ───────────────────────────────────────────────────────────────────────────
   ■ 무슨 일이 있었나
   첫 화면에 「SINCE 2010」과 「14년이 증명하는」이 함께 있었다. 2026년에 세면 16년이다 —
   숫자를 적은 해(2024년 무렵)에서 멈춰 있었다. 대표가 「SINCE 2010을 기준으로」라고 정했다.

   ■ 🔴 숫자가 흩어져 있다 (결함 생성기 ①)
   한 숫자가 **여섯 갈래**에 따로 적혀 있다:
     index.html — 탭 제목 · 검색 설명 · 공유 제목 · 첫 화면 제목 · 숫자 띠 · 목적지 설명 · 서비스 제목 ·
                  FAQ 답 · 회사 소개
     script.js  — 숫자 띠 **카운트업의 목표값**(`end: 16`). ⚠ HTML만 고치면 효과가 끝날 때 옛 숫자로 돌아간다.
     admin.html — 콘텐츠 관리의 **기본 문구**(def). 그대로 두면 누가 저장할 때 옛 숫자가 되살아난다.
   ⚠ 후기 3번(「14년의 노하우가 느껴지는…」)은 **고객이 한 말**로 올라가 있어 손대지 않는다 — 이 검사도 안 센다.

   ■ 이 검사가 지키는 것
   ① 위 자리들의 숫자가 **올해 − 2010**과 같다. → **해가 바뀌면(2027-01-01) 일부러 실패한다.**
      그게 이 검사의 일이다 — 숫자를 한 해씩 올리라는 알림이다(위 목록을 한꺼번에 고칠 것).
   ② 「14년」(옛 숫자)이 후기 밖에 남아 있지 않다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

const FOUNDED = 2010;
const Y = new Date().getFullYear() - FOUNDED;
const idx = read('index.html');
const js = read('script.js');
const adm = read('admin.html');

console.log(`\n[1] 올해(${new Date().getFullYear()}) 기준 업력 ${Y}년이 모든 자리에 있다`);
ok('SINCE 2010 표기가 그대로다(기준점)', idx.includes('SINCE 2010'));
ok('탭 제목', idx.includes(`<title>비즈페이지 | ${Y}년 검증`));
ok('공유 제목(og:title)', idx.includes(`content="비즈페이지 | ${Y}년 검증`));
ok('검색 설명', idx.includes(`${Y}년 1,400건+`));
ok('첫 화면 제목', idx.includes(`data-cms-key="hero.headline">${Y}년이 증명하는`));
ok('숫자 띠', idx.includes(`<div class="stat-num-hero">${Y}<span class="stat-unit">YRS`));
ok('🔴 숫자 띠 카운트업 목표값(script.js)', new RegExp(`stat-item:nth-child\\(1\\) \\.stat-num-hero', end: ${Y},`).test(js));
ok('목적지 설명', idx.includes(`${Y}년간 1,400건 이상의 연수로 검증된 목적지`));
ok('서비스 제목', idx.includes(`<h2 class="svc-title">${Y}년 현장 경험으로`));
ok('FAQ 답', idx.includes(`비즈페이지는 ${Y}년간 축적된`));
ok('회사 소개', idx.includes(`책임집니다. ${Y}년간 1,400건`));
ok('관리자 기본 문구 — 첫 화면 제목', adm.includes(`def:'${Y}년이 증명하는`));
ok('관리자 기본 문구 — 회사 소개', adm.includes(`책임집니다. ${Y}년간 1,400건`));
ok('관리자 기본 문구 — FAQ 답', adm.includes(`비즈페이지는 ${Y}년간 축적된`));

console.log('\n[2] 옛 숫자(14년)가 후기 밖에 남아 있지 않다');
/* 주석(<!-- -->) 안과 후기 문단은 뺀다 — 후기는 고객의 말이다 */
const visible = idx.replace(/<!--[\s\S]*?-->/g, '').replace(/<p class="testi-text"[^>]*>[\s\S]*?<\/p>/g, '');
const left = (visible.match(/14년|>14<span class="stat-unit">/g) || []).length;
ok('index.html 화면 문구에 「14년」 0곳', left === 0, left + '곳');

console.log(`\n결과: ${pass} pass / ${fail} fail  — aL 업력 숫자(SINCE ${FOUNDED})`);
process.exit(fail ? 1 : 0);

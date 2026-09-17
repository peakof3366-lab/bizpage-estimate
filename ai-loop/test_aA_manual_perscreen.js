/* ══════════════════════════════════════════════════════════════════════════
   화면마다 「이 화면 매뉴얼」 — 링크가 진짜 그 절로 가는가 (2026-09-17 대표 지시)

   🔴 **이 연결은 조용히 썩는다.** 매뉴얼의 절 id를 바꾸거나 절을 지우면, 버튼은
     그대로 있는데 눌러도 **전체 매뉴얼**이 뜬다(그렇게 떨어지게 만들어 뒀다 —
     빈 화면보다 낫기 때문이다). 화면은 멀쩡해 보이고 아무도 모른다.
     그래서 **목록과 문서를 대조하는 검사**가 있어야 한다(결함 생성기 ①).
   ⚠ 이 검사는 화면을 띄우지 않고 **파일을 읽어 대조**한다. 링크가 실제로 붙는지는
     `test_zZ_admin_boot.js`가 보는 화면 쪽 일이고, 여기서는 **목록 ↔ 문서**만 본다.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const manual = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');
/* 🔴 목록은 **admin.html이 아니라 `admin/manual.js`**에 있다 — 처음엔 admin.html에
   넣었다가 `test_zQ`([3-c] 그 파일을 다시 부지 말 것)에 걸려 떼어냈다. */
const mjs = fs.readFileSync(path.join(ROOT, 'admin', 'manual.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (why ? ' \u2014 ' + why : '')); }
};

console.log('\n[1] admin.html의 매뉴얼 목록을 읽는다');
const setM = mjs.match(/const SECTIONS = \[([\s\S]*?)\]/);
ok('화면 목록(SECTIONS)을 찾았다', !!setM, 'admin/manual.js에서 목록이 사라졌다');
ok('admin.html이 다시 부지 않았다', admin.includes('admin/manual.js'),
   '스크립트를 불러오지 않으면 버튼이 하나도 안 붙는다');
const tabs = setM ? [...setM[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [];
ok('목록이 비어 있지 않다', tabs.length > 0, '탭이 하나도 없다');

const aliasM = mjs.match(/const ALIAS = \{([^}]*)\}/);
ok('별칭 표를 찾았다', !!aliasM);
const alias = {};
if (aliasM) for (const m of aliasM[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) alias[m[1]] = m[2];

console.log('\n[2] 가리키는 절이 매뉴얼에 실제로 있는가');
const sections = new Set([...manual.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]));
ok('매뉴얼에서 절을 읽었다', sections.size > 0);
for (const t of tabs) {
  const sec = alias[t] || t;
  ok('「' + t + '」 → 매뉴얼 절 「' + sec + '」', sections.has(sec),
     '그런 절이 없다 — 버튼을 눌러도 전체 매뉴얼이 뜬다');
}

console.log('\n[3] 가리키는 화면이 admin.html에 실제로 있는가');
for (const t of tabs) {
  ok('「' + t + '」 화면이 있다', admin.includes('id="tab-' + t + '"'),
     'admin.html에 그 화면이 없다 — 버튼이 아무 데도 안 붙는다');
  /* 🔴 처음엔 `id="tab-x"` 뒤 **400자**만 봤다 — 그 사이에 긴 주석이 있어
     9개 화면 전부 「자리가 없다」로 나왔다. 브라우저로 재보니 다 있었다 — **자가 틀렸다.**
     화면 한 칸을 통째로 잘라 그 안에서 찾는다(다음 화면까지 넘어가지 않게). */
  const at = admin.indexOf('id="tab-' + t + '"');
  const nx = at < 0 ? -1 : admin.indexOf('class="tab-panel"', at + 1);
  const block = at < 0 ? '' : admin.slice(at, nx < 0 ? admin.length : nx);
  ok('「' + t + '」에 제목 줄(.page-head)이 있다',
     block.includes('class="page-head"'),
     '버튼을 붙일 자리가 없다');
}

console.log('\n[4] 매뉴얼이 절만 뽑아 보여 줄 수 있는가');
ok('?only= 를 읽는다', manual.includes("get('only')"));
ok('없는 절이면 전체를 보여 준다', /console\.warn\('\[manual\][^)]*\);\s*\n\s*return;/.test(manual)
   || manual.includes('그런 절이 없어 전체를 보여 준다'),
   '빈 화면이 뜨면 사람은 고장으로 읽는다');
ok('전체 매뉴얼로 돌아가는 길이 있다', manual.includes('전체 매뉴얼 보기'));
ok('PDF로 저장하는 버튼이 있다', manual.includes('PDF로 저장'));

console.log('\n[5] 두 화면 비교표와 칸별 안내가 있는가');
ok('비교표(#which-screen)가 있다', manual.includes('id="which-screen"'));
ok('칸별 안내(#fields)가 있다', manual.includes('id="fields"'));
ok('직접 견적 절이 비교표로 안내한다', manual.includes('href="#which-screen"'));

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

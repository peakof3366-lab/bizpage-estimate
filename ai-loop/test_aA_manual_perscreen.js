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

console.log('\n[6] 직접 견적 작성 절이 지금 화면과 같은가');
/* 🔴 **2026-09-17에 이 검사의 대상이 통째로 바뀌었다.** 예전엔 `admin/packages.js`의
     adhoc 상태 라벨(「확정 (견적서 발급 가능)」 등)을 매뉴얼과 대조했다.
     그런데 직접 견적 작성이 **마법사**가 되면서 그 목록·모달 경로를 걷어냈고,
     그 라벨은 **화면에서 닿을 길이 없어졌다.** 계속 대조하면 매뉴얼에 **쓰면 안 되는
     말을 쓰라고 요구**하게 된다 — 자가 화면을 거꾸로 끌고 가는 자리다.
   → 이제 **새 흐름**을 잰다. */
const adhocSec = manual.match(/<section id="adhoc">([\s\S]*?)<\/section>/);
ok('매뉴얼에 직접 견적 절이 있다', !!adhocSec);
if (adhocSec) {
  const t = adhocSec[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok('5단계 마법사라고 말한다', /5단계|다섯 단계/.test(t),
     '목록·모달 시절 설명이 남아 있으면 직원이 없는 버튼을 찾는다');
  ok('「금액 입력 시작」 버튼을 말한다', t.includes('금액 입력 시작'));
  ok('엔진을 안 탄다고 말한다', /엔진을 안 탑?니다|엔진을 안 타/.test(t));
  ok('매니저 이상이라고 말한다', t.includes('매니저 이상'));
  ok('저장 뒤 어디로 가는지 말한다', t.includes('견적 요청 관리'),
     '저장하고 나서 어디서 발급하는지 모르면 거기서 멈춘다');
  ok('비교표로 가는 길이 있다', adhocSec[1].includes('href="#which-screen"'));
  /* 🔴 **없어진 경로를 설명하면 안 된다.** 직원이 없는 버튼을 찾아 헤맨다. */
  for (const 옛말 of ['+ 직접 견적 작성', '「판매중」으로']) {
    ok('없어진 「' + 옛말 + '」을 안 쓴다', !t.includes(옛말),
       '그 버튼은 화면에 없다');
  }
}

console.log('\n[7] 대장의 개정 버튼 설명이 화면과 같은가');
/* 🔴 **대표가 「개정 아님으로가 무슨 뜻이냐」고 물었다**(2026-09-17). 매뉴얼에 그 말이
     아예 없었다 — 화면에만 있는 버튼은 아무도 못 배운다.
   ⚠ 버튼 글자는 `admin/ledger.js`에 있다. 거기서 이름을 바꾸면 매뉴얼이 조용히
     낡는다 — 그래서 **파일에서 읽어** 대조한다(문자열을 여기 다시 적지 않는다). */
const ledjs = fs.readFileSync(path.join(ROOT, 'admin', 'ledger.js'), 'utf8');
const ledSec = manual.match(/<section id="ledger">([\s\S]*?)<\/section>/);
ok('매뉴얼에 견적서 대장 절이 있다', !!ledSec);
const cut = ledjs.includes('개정 아님으로') ? '개정 아님으로' : null;
ok('화면에 「개정 아님으로」 버튼이 있다', !!cut, 'admin/ledger.js에서 사라졌다');
if (ledSec && cut) {
  const t = ledSec[1].replace(/<[^>]+>/g, '');
  ok('매뉴얼이 「' + cut + '」을 설명한다', t.includes(cut),
     '화면에만 있고 매뉴얼엔 없다 — 담당자가 물어보게 된다');
  ok('언제 누르는지도 적혀 있다', t.includes('A안') || t.includes('개정 아님으로」는 언제'),
     '이름만 적고 쓰는 때를 안 적으면 여전히 모른다');
  ok('「최신본」 경고를 설명한다', t.includes('최신본'),
     '옛 견적서로 응대하는 것을 막는 표시인데 설명이 없다');
  ok('「차수 모름」을 설명한다', t.includes('차수 모름'));
  /* 🔴 **금액이 안 바뀐다는 말이 꼭 있어야 한다.** 없으면 담당자가 무서워서 안 누른다 —
     못 누르는 안전장치는 없는 것과 같다. */
  ok('끊어도 금액이 안 바뀐다고 말한다', t.includes('금액은 아무것도 안 바뀝니다'),
     '무서워서 안 누르면 잘못 이어진 채로 남는다');
}
/* ⚠ 매뉴얼은 관리자 CSS를 안 싣는다 — `pkg-st` 같은 관리자 전용 클래스를 쓰면
     배지가 **맨 글자**로 나온다(2026-09-17에 실제로 그렇게 썼다가 재서 알았다). */
ok('매뉴얼이 관리자 전용 클래스를 안 쓴다', !manual.includes('pkg-st'),
   '관리자 CSS가 없어 배지가 맨 글자로 나온다');


console.log('\n[8] 매뉴얼 그림');
/* 🔴 **그림은 낡아도 눈에 안 띈다.** 글이 틀리면 읽다가 걸리지만, 화면이 바뀌어도
     옛 캡처는 멀쩡해 보인다. 그래서 두 가지를 검사한다:
       ① 파일이 실제로 있는가 (없으면 깨진 그림이 나간다)
       ② 다시 찍는 도구가 저장소에 남아 있는가 (없으면 다음 사람이 손으로 찍는다) */
const shots = [...manual.matchAll(/<img[^>]+src="(이미지\/매뉴얼\/[^"]+)"/g)].map((m) => m[1]);
ok('매뉴얼에 화면 캡처가 있다', shots.length > 0, '한 장도 없다');
for (const rel of shots) {
  ok('그림 파일이 있다 — ' + rel.split('/').pop(),
     fs.existsSync(path.join(ROOT, decodeURIComponent(rel))), '파일이 없다 — 깨진 그림이 나간다');
}
/* ⚠ 낭독기와, 그림이 안 뜰 때를 위해 대체 글이 있어야 한다. */
const imgs = [...manual.matchAll(/<img[^>]+src="이미지\/매뉴얼\/[^"]*"[^>]*>/g)].map((m) => m[0]);
ok('모든 그림에 대체 글(alt)이 있다', imgs.every((t) => /alt="[^"]+"/.test(t)),
   '그림이 안 뜨면 아무것도 안 남는다');
ok('모든 그림에 설명(figcaption)이 붙어 있다',
   (manual.match(/figure class="shot"/g) || []).length === imgs.length,
   '그림만 있고 무엇을 보라는 말이 없으면 못 읽는다');
ok('다시 찍는 도구가 있다', fs.existsSync(path.join(ROOT, 'ai-loop', 'shoot_manual.py')),
   '손으로 찍으면 화면이 바뀌어도 아무도 다시 안 찍는다');
/* 🔴 **프로덕션에서 찍으면 고객 이름·연락처가 그림에 박힌다.** 도구가 그것을 막는지 본다. */
if (fs.existsSync(path.join(ROOT, 'ai-loop', 'shoot_manual.py'))) {
  const sh = fs.readFileSync(path.join(ROOT, 'ai-loop', 'shoot_manual.py'), 'utf8');
  ok('찍는 도구가 로컬 주소만 허용한다', sh.includes('localhost') && /def guard/.test(sh),
     '프로덕션에서 찍으면 실제 고객 정보가 그림에 남는다');
}


console.log('\n[9] 30초 요약과 「한 절만 보기」');
/* 🔴🔴 **`hidden`은 display 규칙에 진다 — 이 저장소에서 세 번째로 밟았다.**
     `section { display:flex }`가 브라우저 기본값 `[hidden]{display:none}`을 이겨서,
     `?only=`가 감췄다고 믿은 15개 절이 **그대로 다 보이고 있었다.**
   🔴 더 나쁜 것은 **내가 만든 검사가 그걸 통과시켰다**는 것이다 — `el.hidden`(속성)을
     재고 「감췄다」고 읽었다. 속성은 내가 방금 넣은 값이라 늘 참이다.
     **감춰졌는지는 `getComputedStyle().display`로 재야 한다.**
   ⚠ 여기서는 파일만 읽으므로 **CSS 방어선이 있는지**를 본다. 실제 렌더는 브라우저로 잰다. */
ok('[hidden]을 display로 눌러 두었다',
   /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(manual),
   'section의 display 규칙이 hidden을 이겨 감춘 절이 다 보인다');

const tldrSecs = [...manual.matchAll(/<section id="([^"]+)">([\s\S]*?)<\/section>/g)]
  .filter(([, , body]) => body.includes('class="tldr"'))
  .map(([, id]) => id);
/* 🔴 **있어야 할 절을 못 박는다.** 처음엔 「요약이 있는 절」만 훑었는데, 요약이
     통째로 **사라지면 그 절을 건너뛰어** 아무것도 안 걸렸다(일부러 지워 보고 알았다).
     자가 늘 통과하면 아무것도 말하지 않는다 — 목록을 여기 적어 둔다.
   ⚠ 짧은 절(roles·errors·dont·flow·inquiries·owner)에는 일부러 안 단다. 요약보다 짧다. */
const MUST_TLDR = ['start', 'estmgr', 'quotepro', 'itinerary', 'packages',
                   'adhoc', 'ledger', 'pricereport', 'rates', 'newdest'];
for (const id of MUST_TLDR) {
  ok('「' + id + '」에 30초 요약이 있다', tldrSecs.includes(id),
     '요약이 사라졌다 — 화면 매뉴얼을 열면 첫 화면이 다시 벽이 된다');
}
/* ⚠ 요약은 **절 맨 위(<h2> 바로 뒤)**에만 있어야 한다 — 중간에 있으면 요약이 아니다. */
for (const [, id, body] of manual.matchAll(/<section id="([^"]+)">([\s\S]*?)<\/section>/g)) {
  const n = (body.match(/class="tldr"/g) || []).length;
  if (!n) continue;
  ok('「' + id + '」 요약이 하나뿐이다', n === 1, n + '개나 있다');
  ok('「' + id + '」 요약이 제목 바로 뒤에 있다',
     /^\s*<h2[\s\S]*?<\/h2>\s*<div class="tldr">/.test(body),
     '중간에 있으면 요약이 아니다');
}
/* 🔴 요약이 길면 요약이 아니다. 30초에 읽을 수 있어야 한다. */
for (const m of manual.matchAll(/<div class="tldr">([\s\S]*?)<\/div>/g)) {
  const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  ok('요약이 320자 이하다 (' + t.length + '자)', t.length <= 320, t.slice(0, 40) + '…');
}


console.log('\n[10] 매뉴얼을 읽는지 세는 장치');
/* 🔴 **주석을 먼저 걷어낸다.** 처음엔 원문을 그대로 봤는데, 내가 주석에 써 둔
     「public: false」를 코드로 읽어 **일부러 망가뜨려도 통과했다**(확인하다 알았다).
     이 저장소에서 두 번째로 밟은 함정이다(`test_tA`도 같은 이유로 주석을 지운다). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const ev  = strip(fs.readFileSync(path.join(ROOT, 'api', '_lib', 'site_events.js'), 'utf8'));
const ins = strip(fs.readFileSync(path.join(ROOT, 'api', 'admin', 'insights.js'), 'utf8'));
const mjs2 = strip(fs.readFileSync(path.join(ROOT, 'admin', 'manual.js'), 'utf8'));

ok('이벤트 이름이 단일 출처에 있다', /name:\s*'manual_open'/.test(ev),
   'site_events.js에 없으면 서버가 안 받는다');
/* 🔴 **공개 `/api/track`이 받으면 안 된다.** 인증이 없어 바깥에서 부를 수 있고,
     한 건만 섞여도 「우리 직원이 읽는가」라는 물음의 답이 못 쓰게 된다. */
ok('공개 엔드포인트는 이 이름을 안 받는다', /public:\s*false/.test(ev),
   '누구나 숫자를 부풀릴 수 있다 — 그러면 세는 의미가 없다');
ok('ALLOWED_NAMES가 public:false를 걸러낸다',
   /ALLOWED_NAMES[\s\S]{0,160}public !== false/.test(ev),
   '거르지 않으면 public 표시가 장식이다');
/* ⚠ 고객 퍼널(버튼 클릭 통계)에 직원 행동을 섞으면 안 된다. */
ok('고객 퍼널에 안 섞인다', /manual_open'[^}]*click:\s*false/.test(ev),
   '직원 행동이 고객 전환율에 들어간다');
ok('어느 화면인지 함께 남긴다', /invalid_screen/.test(ev),
   '몇 번인지만 남으면 어느 화면이 안 읽히는지 모른다');

ok('인증된 기록 경로가 있다', /type === 'event'/.test(ins) && /ADMIN_EVENT_NAMES/.test(ins));
ok('인증된 조회 경로가 있다', /type === 'manual'/.test(ins));
/* ⚠ Vercel Hobby 함수 12개 한도 — 새 파일을 만들면 배포가 깨진다. */
const fnCount = (function walk(d) {
  let n = 0;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === '_lib') continue;
    const p2 = path.join(d, f.name);
    n += f.isDirectory() ? walk(p2) : (f.name.endsWith('.js') ? 1 : 0);
  }
  return n;
})(path.join(ROOT, 'api'));
ok('서버리스 함수가 12개를 안 넘는다 (' + fnCount + '개)', fnCount <= 12,
   'Vercel Hobby 한도 — 넘으면 배포가 안 된다');

ok('버튼을 누르면 기록을 보낸다', /manual_open/.test(mjs2) && /type=event/.test(mjs2));
/* 🔴 통계 때문에 매뉴얼이 안 열리면 본말이 뒤집힌다. */
ok('기록이 링크를 막지 않는다', /keepalive/.test(mjs2) && /\.catch\(/.test(mjs2),
   '응답을 기다리면 매뉴얼이 늦게 열린다');
/* 🔴 **0과 「못 셌다」는 다른 말이다.** 못 센 것을 0으로 보이게 하면
     「아무도 안 읽는다」는 틀린 결론을 내리게 된다(결함 생성기 ②). */
ok('0회와 「못 셌다」를 구별해 말한다',
   /연 사람이 없습니다/.test(mjs2) && /0회라는 뜻이 아닙니다/.test(mjs2),
   '못 센 것을 0으로 보이게 하면 틀린 결론을 내린다');
ok('관리자 화면에 볼 자리가 있다',
   admin.includes('id="manualStats"'), '숫자를 쌓기만 하고 아무도 못 보면 없는 것과 같다');


console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

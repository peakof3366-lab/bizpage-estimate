/* ═══════════════════════════════════════════════════════════════════════════
   VT — 첫 화면의 **갈림길 구역은 뺐다** (2026-09-14 대표 지시)

   ■ 무엇이 있었나
   히어로와 견적 계산기 사이에 「WHICH ONE / 연수가 아니어도 괜찮습니다」 구역이 있었다.
   카드 두 장(맞춤 견적 · 패키지 여행)으로 손님을 갈라 보내는 자리였고, 만든 이유는
   견적서 45건 중 12건이 연수가 아니었기 때문이다(포상 여행·워크샵·교회 단체·동호회).

   ■ 왜 뺐나
   대표 판단: **「쓸데없는 문구로 방문자 접근만 어렵게 만든다」.**
   바로 아래가 견적을 뽑는 자리인데, 그 앞에 한 화면을 세워 두면 손님이 계산기에
   닿기까지 한 번 더 스크롤해야 한다. 들어온 사람을 가르는 것보다 **바로 계산하게**
   하는 쪽을 택했다.

   ■ 왜 검사를 지우지 않고 반대로 잠그는가
   그냥 지우면 **판단이 아무 데도 안 남는다.** 이 구역에는 「45건 중 12건」이라는 근거가
   붙어 있었으므로, 다음 사람이 그 근거를 다시 발견하고 되살려 놓아도 아무도 모른다.
   되살리는 것 자체가 나쁜 게 아니라, **모르고 되살리는 것**이 나쁘다. 그래서 여기서 막고,
   막힌 사람이 이 글을 읽게 한다.

   ■ 되살리려면
   `git show fc9982a~1:index.html`(이 커밋 직전)에서 `section-tracks` 구역과
   `script.js`의 `reflectPackageStock` 블록을 되살리고, 이 파일을 예전 판으로 되돌린다.
   ⚠ 되살릴 때는 **견적 계산기가 뒤로 밀리는 것**이 대표가 문제 삼은 바로 그 점이라는
     것을 알고 결정할 것.
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

const html = read('index.html');
const js = read('script.js');

console.log('\n[1] 갈림길 구역이 첫 화면에 없다');
for (const [what, needle] of [
  ['구역 자체', 'section-tracks'],
  ['카드', 'track-card'],
  ['제목', '연수가 아니어도 괜찮습니다'],
  ['머리말', 'WHICH ONE'],
]) {
  ok('① ' + what + '이(가) 없다', !html.includes(needle), needle);
}

console.log('\n[2] 그 카드만 쓰던 코드도 남기지 않았다');
/* 🔴 마크업만 지우고 코드를 남기면, 그 코드는 **아무도 안 부르는 채로 살아 있다.**
   나중에 읽는 사람은 그게 도는 줄 알고, 고치려다 시간을 쓴다. */
ok('② script.js에 trackPkg를 만지는 코드가 없다', !js.includes('trackPkg'));
ok('② reflectPackageStock 블록이 없다', !js.includes('reflectPackageStock'));

console.log('\n[3] 🔴 그래서 얻은 것 — 견적 계산기가 히어로 바로 다음이다');
/* 이것이 뺀 목적이다. 순서가 다시 밀리면 뺀 뜻이 없어지므로 여기서 잡는다. */
const ids = [...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map((m) => m[1]);
ok('③ 첫 구역이 히어로다', ids[0] === 'home', ids.slice(0, 3).join(' → '));
ok('③ 🔴 그 다음이 바로 견적 계산기다', ids[1] === 'estimate', ids.slice(0, 3).join(' → '));

console.log('\n[4] 판단의 근거가 코드에 남아 있다');
/* 지운 이유를 사람이 읽을 수 있는 곳에 남긴다 — 이 파일 머리말이 그 자리다. */
const me = read('ai-loop/test_vT_second_entrance.js');
ok('④ 왜 뺐는지가 적혀 있다', /방문자 접근만 어렵게/.test(me));
ok('④ 되살리는 법이 적혀 있다', /되살리려면/.test(me));

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — VT 갈림길 구역은 뺐다`);
process.exit(fail ? 1 : 0);

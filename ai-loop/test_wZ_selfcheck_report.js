/* ═══════════════════════════════════════════════════════════════════════════
   WZ — 「검산이 안 돌았다」를 **이름으로 부른다**

   ■ 왜

   `audit_self_checks.js`(WD)는 「검산 ①이 안 돌았다 7건」이라고만 말했다.
   숫자만 있으면 다음 사람이 **무엇을 고쳐야 할지 못 고른다.** WG에서 배운 자리와
   같다 — 「항공을 못 읽는 9건」이 세어 보니 3건이었고 원인이 하나였다.

   세어 보니 7건이 **세 무리**로 갈렸다(2026-08-26 실측):
     · 총계·1인당 **둘 다** 없음 3건 — 바르셀로나 · 다모아 · 하노이(전부 환율 미정, 0-f)
     · **1인당만** 없음 2건 — 굿리치 158명 건(줄 합계 3.94억은 읽힌다)
     · **총계만** 없음 2건 — 마카오(1인당 1,260,000) · 발리(2,662,798)

   ■ ⚠ 「없다」가 곧 「결함」은 아니다

   원가 시트에는 판매가가 애초에 없고, 환율이 안 정해지면 원화 총계도 없다.
   그래서 이 보고는 **원인을 말하지 않는다** — 무엇이 없는지만 적고 판단은 사람이 한다.
   (없는 결함을 만들지 않는 것 — 이 저장소가 반복해서 배운 것이다.)

   ■ 이 검사가 지키는 것

     ① 안 돈 건을 **무엇이 없는지로 묶어** 이름과 함께 보고한다
     ② 「없다」를 「결함」이라 부르지 않는다는 말이 보고에 남아 있다
     ③ 🔴 검산이 **돈 건과 안 돈 건을 합쳐 세지 않는다** — WD가 세운 규칙
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(__dirname, 'audit_self_checks.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 안 돈 건을 이름으로 부르는 자리가 있다');
{
  ok('① 안 돈 건만 따로 모은다', /const noRunRows = rows\.filter\(\(r\) => !r\.c1\)/.test(SRC));
  ok('① 무엇이 없는지로 묶는다', /miss\.push\('인원'\)/.test(SRC)
    && /miss\.push\('총계'\)/.test(SRC) && /miss\.push\('1인당'\)/.test(SRC));
  ok('① 파일 이름을 찍는다', /noRunRows[\s\S]{0,1200}pad\(String\(r\.file\)/.test(SRC));
  /* 읽은 값도 함께 보여준다 — 「무엇을 채우면 되는지」가 보이게 */
  ok('① 읽은 값(인원·총계·1인당)을 함께 보여준다',
    /bits\.push\('인원 '/.test(SRC) && /bits\.push\('1인당 '/.test(SRC));
}

console.log('\n[2] ⚠ 「없다」를 「결함」이라 부르지 않는다');
{
  ok('② 그 말이 보고에 있다', /「없다」가 곧 결함은 아니다/.test(SRC));
  ok('② 왜 없을 수 있는지도 적는다', /원가 시트|환율이 안 정해져/.test(SRC));
}

console.log('\n[3] 🔴 돈 것과 안 돈 것을 합쳐 세지 않는다 (WD 규칙)');
{
  /* 합쳐 세면 못 읽은 문서가 깨끗한 문서로 둔갑한다 */
  ok('③ 「안 돌았다」를 따로 센다', /const noRun1 = rows\.length - ran1\.length/.test(SRC));
  ok('③ 대조된 것과 방향만 맞은 것을 가른다',
    /matched1 = ran1\.filter\(\(r\) => r\.c1\.ok && r\.c1\.matched\)/.test(SRC)
    && /dirOk1 = ran1\.filter\(\(r\) => r\.c1\.ok && !r\.c1\.matched\)/.test(SRC));
  ok('③ 「정답지가 실제로 대조된 것은 여기까지」라고 말한다',
    /정답지가 실제로 대조된 것은 여기까지다/.test(SRC));
}

console.log('\n[4] 묶는 규칙이 실제로 갈라지는가 (합성 입력)');
{
  /* 보고 코드를 그대로 부를 수는 없어(콘솔 출력 함수다) **같은 규칙**을 여기서 돌린다.
     ⚠ 규칙을 베껴 적는 것이라, 원본이 바뀌면 [1]의 소스 검사가 먼저 걸리게 해 뒀다. */
  const classify = (r) => {
    const miss = [];
    if (!r.pax) miss.push('인원');
    if (!r.grand && !r.itemsTotal) miss.push('총계');
    if (!r.perPerson) miss.push('1인당');
    return miss.join(' · ');
  };
  ok('④ 총계·1인당 둘 다 없음', classify({ pax: 138 }) === '총계 · 1인당');
  ok('④ 1인당만 없음', classify({ pax: 158, itemsTotal: 394122180 }) === '1인당');
  ok('④ 총계만 없음', classify({ pax: 26, perPerson: 1260000 }) === '총계');
  /* ⚠ 줄 합계라도 있으면 「총계 없음」이 아니다 — 둘을 같은 자리로 본다 */
  ok('④ 줄 합계도 총계로 친다', classify({ pax: 1, itemsTotal: 100, perPerson: 100 }) === '');
  ok('④ 인원이 없으면 그것도 말한다', classify({ grand: 100, perPerson: 1 }) === '인원');
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — WZ 안 돈 검산 보고`);
process.exit(fail ? 1 : 0);

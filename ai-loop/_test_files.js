/* ═══════════════════════════════════════════════════════════════════════════
   회귀 스위트가 돌릴 파일 목록 — **단일 출처**

   ■ 왜 이 파일이 생겼나 (2026-09-14)

   러너가 파일을 고르는 규칙은 이 저장소가 실제로 당한 결함과 맞닿아 있다.
   예전 패턴은 `/^test_p.*\.js$/`였고, 작업 알파벳이 pZ를 넘어 qA로 가는 순간
   **새 테스트가 조용히 스위트에서 빠졌다** — 파일은 있고, 러너는 초록이고,
   아무도 그게 안 돌았다는 걸 몰랐다(결함 생성기 ③).

   그래서 `test_qA_staff_quote_flow.js`가 「러너가 나를 집는가」를 검사하는데,
   그 방식이 **러너 소스를 정규식으로 뜯어보는 것**이었다:

       runnerSrc.match(/\.filter\(f => \/(.+?)\/\.test\(f\)\)/)

   🔴 그래서 2026-09-14에 러너를 병렬로 바꾸면서 `f =>`가 `(f) =>`가 되자
     **그 검사가 깨졌다.** 지키려던 것은 멀쩡한데 재는 방법이 부러진 것이다.

   → 목록을 만드는 자리를 **여기 하나**로 모은다. 러너도 검사도 이 함수를 부른다.
     이제 규칙을 바꾸면 양쪽이 함께 따라가고, 「러너 소스가 어떻게 생겼는지」는
     아무도 알 필요가 없다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;

/* 🔴 접두사를 고정하지 않는다 — 위 사고의 원인이 그것이었다. */
const TEST_PATTERN = /^test_.*\.js$/;

/* 파이썬 테스트(test_*.py)는 Playwright·서버가 필요해 이 러너 대상이 아니다.
   여기서 도는 건 jsdom 기반 순수 검증뿐 — 외부 의존 없이 항상 돌아야 한다. */
function testFiles(filters) {
  const keys = (filters || []).filter((k) => k && !k.startsWith('--'));
  return fs.readdirSync(HERE)
    .filter((f) => TEST_PATTERN.test(f))
    .filter((f) => !keys.length || keys.some((k) => f.includes(k)))
    .sort();
}

/* 「이 파일이 스위트에 들어 있는가」 — 검사가 묻는 방식이다.
   ⚠ 이름만 보지 않고 **실제 목록**에 들어 있는지 본다. 파일이 없으면 false다. */
function isInSuite(fileName) {
  return testFiles([]).includes(fileName);
}

module.exports = { testFiles, isInSuite, TEST_PATTERN, HERE };

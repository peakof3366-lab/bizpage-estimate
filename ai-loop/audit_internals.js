/* ═══════════════════════════════════════════════════════════════════════════
   **안쪽**을 재는 자 — 아무도 안 부르는 것 · 두 번 적힌 것 · 아무도 안 보는 것 (XQ)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-27): 「표면적으로 보여진 부분은 어제 했으니, 오늘은 안에서
   내적인 부분을 정리하라.」

   ■ 왜 도구로 만드나
   안쪽 부채는 **눈에 안 띄어서** 쌓인다. 화면은 멀쩡하고 검사도 초록인데, 저장소에는
   아무도 안 부르는 도구가 늘고, 같은 값이 두 곳에 적히고, 아무 검사도 안 읽는 파일이
   남는다. 「지금 몇 개인가」를 세는 도구가 없으면 그 수는 조용히 는다.

   ■ 무엇을 재나 (전부 **세기**다 — 판정은 사람이 한다)
     ① **아무도 안 부르는 파일** — 어디에서도 이름이 안 나오는 도구·자산
     ② **서버리스 함수 수 vs 한도** — Vercel Hobby 12개(`_`로 시작하면 함수가 아니다)
     ③ **아무 검사도 안 읽는 파일** — 고객·서버 코드인데 테스트가 이름조차 안 부르는 것
     ④ **두 번 적힌 값** — 같은 긴 문자열/숫자 목록이 여러 파일에 있는 것(결함 생성기 ①)
     ⑤ **남겨진 흔적** — TODO·FIXME·debugger·임시 파일
     ⑥ **큰 파일** — 한 파일이 커질수록 「거기만 고치면 되는데」가 늘어난다

   ⚠ ①④는 **후보지 결함이 아니다.** 문서에만 이름이 있는 도구도 있고, 우연히 같은
     숫자일 수도 있다 — `audit_rates`의 「확인 대상은 오류가 아니다」와 같은 규칙이다.

   실행: node ai-loop/audit_internals.js [--verbose]
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const VERBOSE = process.argv.includes('--verbose');

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };
const kb = (p) => Math.round(fs.statSync(p).size / 1024);
const lines = (s) => s.split('\n').length;

/* 저장소에서 **사람이 관리하는 파일**만 모은다(백업·의존성·산출물은 뺀다) */
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'logs', '__pycache__', '이미지', '대표상품리스트', 'fixtures']);
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const ALL = walk(ROOT).map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
const CODE = ALL.filter((f) => /\.(js|html|css|py|json|md|bat|txt)$/.test(f) && !f.startsWith('.'));
const TEXT = new Map(CODE.map((f) => [f, read(path.join(ROOT, f))]));

/* 어떤 파일 이름이 **다른 파일 어딘가에** 나오는가 */
function mentionedIn(name, skipSelf) {
  const base = path.basename(name);
  const stem = base.replace(/\.[a-z]+$/, '');
  const hits = [];
  for (const [f, t] of TEXT) {
    if (f === skipSelf) continue;
    if (t.includes(base) || (stem.length > 6 && t.includes(stem))) hits.push(f);
  }
  return hits;
}

let issues = 0;

console.log('\n' + '═'.repeat(70));
console.log('■ ① 아무도 안 부르는 파일 — 이름이 어디에도 안 나오는 것');
console.log('═'.repeat(70));
{
  /* 도구·자산만 본다. 테스트는 러너가 이름으로 안 부르고 **폴더를 훑어** 돌리므로 뺀다. */
  const candidates = CODE.filter((f) =>
    (f.startsWith('ai-loop/') && /\.(js|py)$/.test(f) && !/\/test_/.test(f) && !/\/_/.test(f))
    || (/^[^/]+\.(js|css)$/.test(f)));
  const orphans = [];
  candidates.forEach((f) => {
    const hits = mentionedIn(f, f);
    if (!hits.length) orphans.push({ f, kb: kb(path.join(ROOT, f)) });
  });
  if (!orphans.length) console.log('\n✓ 없음 — 모든 도구·자산이 어딘가에서 불린다');
  else {
    console.log('\n⚠ ' + orphans.length + '개 (확인 대상 — 한 번 쓰고 끝난 도구일 수 있다)');
    orphans.sort((a, b) => b.kb - a.kb).forEach((o) => console.log('   · ' + o.f.padEnd(44) + o.kb + ' KB'));
    issues += orphans.length;
  }
}

console.log('\n' + '═'.repeat(70));
console.log('■ ② 서버리스 함수 수 — Vercel Hobby 한도는 12개');
console.log('═'.repeat(70));
{
  /* Vercel은 `api/` **아래 모든 깊이의** 파일 하나를 함수 하나로 만든다.
     `api/admin/login.js` → `/api/admin/login` · `api/quotes/[id].js` → `/api/quotes/:id`.
     빠지는 것은 **경로 어느 칸이든 `_`로 시작할 때**(`api/_lib/…`)뿐이다.
     🔴 2026-08-27: 여기가 `^api/[^/]+.js$`라 **맨 윗칸만 세고 있었다** — 실제 12개를
        6개로 세고, 그 숫자로 「CLAUDE.md가 낡았다」는 **정반대 결론**을 매번 냈다.
        빠진 것은 하위 폴더 6개(admin 셋 · `[id]` 셋). 프로덕션 응답으로 12개 전부 확인했다.
        세는 자를 믿고 문서를 고쳤으면 **한도가 풀렸다고 적어 둘 뻔했다.** */
  const fns = ALL.filter((f) => /^api\/.+\.js$/.test(f) && !f.split('/').some((s) => s.startsWith('_')));
  const libs = ALL.filter((f) => /^api\/_lib\//.test(f));
  console.log('\n  함수: ' + fns.length + ' / 12   (여유 ' + (12 - fns.length) + '개)');
  fns.forEach((f) => console.log('   · ' + f));
  console.log('  공용 모듈(함수 아님): ' + libs.length + '개');
  /* 🔴 한도에 닿았으면 그것부터 말한다 — 새 파일 하나가 배포를 통째로 막는다 */
  if (fns.length >= 12) {
    console.log('\n🔴 한도다 — **새 API를 파일로 추가하면 배포가 실패한다.**'
      + ' 기존 파일에 `?action=` 분기로 넣을 것(CLAUDE.md와 같은 말이다).');
    issues++;
  }
  /* 문서와 사실이 어긋나면 **어느 쪽이 틀렸는지 먼저 가른다** — 위 🔴이 그 교훈이다 */
  const claude = TEXT.get('CLAUDE.md') || '';
  if (/12개 제한에 이미 도달/.test(claude) && fns.length < 12) {
    console.log('\n⚠ CLAUDE.md는 「12개 제한에 이미 도달」이라 적었는데 여기서는 '
      + fns.length + '개로 세었다 — 문서가 낡았거나 **이 세는 자가 틀렸다.**'
      + ' 문서를 고치기 전에 프로덕션 응답으로 실제 라우트 수를 먼저 셀 것.');
    issues++;
  }
}

console.log('\n' + '═'.repeat(70));
console.log('■ ③ 아무 검사도 이름조차 안 부르는 파일');
console.log('═'.repeat(70));
{
  const tests = CODE.filter((f) => /^ai-loop\/test_.*\.js$/.test(f));
  const testText = tests.map((f) => TEXT.get(f)).join('\n');
  const shipped = CODE.filter((f) =>
    /^[^/]+\.(js|html)$/.test(f) || /^api\//.test(f))
    .filter((f) => !/^(package|package-lock)\.json$/.test(f));
  const untested = shipped.filter((f) => {
    const base = path.basename(f);
    return !testText.includes(base);
  });
  if (!untested.length) console.log('\n✓ 없음 — 배포되는 파일은 전부 어떤 검사든 이름을 부른다');
  else {
    console.log('\n⚠ ' + untested.length + '개 (이름조차 안 나온다 — 커버리지가 아니라 **존재조차** 안 보는 것)');
    untested.forEach((f) => console.log('   · ' + f.padEnd(40) + kb(path.join(ROOT, f)) + ' KB'));
    issues += untested.length;
  }
}

console.log('\n' + '═'.repeat(70));
console.log('■ ④ 두 번 적힌 값 — 같은 긴 목록이 여러 파일에 있다 (결함 생성기 ①)');
console.log('═'.repeat(70));
{
  /* 따옴표 안 한글/영문 토큰이 6개 이상 이어지는 배열 리터럴을 찾아 지문을 만든다 */
  const sig = new Map();
  const RE = /\[\s*((?:'[^']{1,40}'|"[^"]{1,40}")\s*,\s*){5,}(?:'[^']{1,40}'|"[^"]{1,40}")\s*\]/g;
  CODE.filter((f) => /\.(js|html)$/.test(f)).forEach((f) => {
    const t = TEXT.get(f) || '';
    let m;
    while ((m = RE.exec(t))) {
      const norm = m[0].replace(/\s+/g, '').replace(/"/g, "'");
      if (!sig.has(norm)) sig.set(norm, new Set());
      sig.get(norm).add(f);
    }
  });
  const dup = [...sig.entries()].filter(([, files]) => files.size > 1);
  if (!dup.length) console.log('\n✓ 같은 목록이 여러 파일에 박힌 자리는 없다');
  else {
    console.log('\n⚠ ' + dup.length + '곳');
    dup.forEach(([lit, files]) => {
      console.log('   · ' + [...files].join(' · '));
      console.log('     ' + lit.slice(0, 100) + (lit.length > 100 ? '…' : ''));
    });
    issues += dup.length;
  }
}

console.log('\n' + '═'.repeat(70));
console.log('■ ⑤ 남겨진 흔적 — TODO·디버그·임시');
console.log('═'.repeat(70));
{
  const marks = [];
  /* ⚠ **자기 자신은 세지 않는다.** 이 파일에는 「TODO」라는 글자가 검사 규칙으로 들어
     있어서, 안 빼면 **자기가 만든 결함 3건**이 매번 목록에 뜬다 — 어제 버튼 훑기
     도구가 스스로 가짜 결함을 네 번 만든 것과 같은 자리다. */
  CODE.filter((f) => /\.(js|html|css|py)$/.test(f) && f !== 'ai-loop/audit_internals.js').forEach((f) => {
    const t = TEXT.get(f) || '';
    t.split('\n').forEach((ln, i) => {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(ln) || /\bdebugger\b/.test(ln)) {
        marks.push({ f, n: i + 1, ln: ln.trim().slice(0, 90) });
      }
    });
  });
  if (!marks.length) console.log('\n✓ 없음');
  else {
    console.log('\n⚠ ' + marks.length + '곳');
    marks.slice(0, VERBOSE ? 999 : 12).forEach((m) => console.log('   · ' + m.f + ':' + m.n + '  ' + m.ln));
    if (!VERBOSE && marks.length > 12) console.log('   … --verbose로 전부 보기');
    issues += marks.length;
  }
}

console.log('\n' + '═'.repeat(70));
console.log('■ ⑥ 큰 파일 — 한 파일이 커질수록 「거기만 고치면 되는데」가 늘어난다');
console.log('═'.repeat(70));
{
  const big = CODE.filter((f) => /\.(js|html|css)$/.test(f) && !f.startsWith('ai-loop/'))
    .map((f) => ({ f, kb: kb(path.join(ROOT, f)), ln: lines(TEXT.get(f) || '') }))
    .sort((a, b) => b.kb - a.kb).slice(0, 8);
  console.log('');
  big.forEach((b) => console.log('   ' + b.f.padEnd(24) + String(b.kb).padStart(5) + ' KB  '
    + String(b.ln).padStart(6) + '줄' + (b.kb > 300 ? '   ⚠ 한 화면에 안 들어온다' : '')));
}

console.log('\n' + '─'.repeat(70));
console.log('확인 대상 합계: ' + issues + '건 (오류가 아니다 — 사람이 판단할 목록이다)');
process.exit(0);

/* ═══════════════════════════════════════════════════════════════════════════
   미리보기 카드 — 메신저가 실제로 읽을 수 있는 모양인가 (2026-09-17, P-6)
   ───────────────────────────────────────────────────────────────────────────
   ■ 무엇을 막는가
   `og:image`는 **틀려도 아무 소리가 안 난다.** 상대경로로 적거나, 그림 파일이
   없거나, 규격이 어긋나도 화면은 멀쩡하고 배포도 성공한다. 잘못된 것은
   **카톡에 링크를 보낸 사람만** 본다 — 그리고 그 사람은 보통 고객이다.
   그래서 소스 쪽에서 잡을 수 있는 것을 전부 여기서 잡는다.

   ■ ⚠ 이 검사가 **못** 잡는 것
   프로덕션에 그 주소가 실제로 열리는지는 여기서 모른다(파일 존재만 본다).
   배포 뒤 `curl`로 확인하는 것은 사람이 해야 한다 — 이 저장소의 배포 확인 규칙과 같다.

       node ai-loop/test_aD_og_card.js
   ═══════════════════════════════════════════════════════════════════════════ */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('■ 미리보기 카드 (og:image)\n');

/* ── [1] 그림 파일 자체 ─────────────────────────────────────────────────── */
const img = path.join(ROOT, 'og-card.png');
ok(fs.existsSync(img), '[1-a] og-card.png가 저장소에 있다');
if (fs.existsSync(img)) {
  const b = fs.readFileSync(img);
  ok(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    '[1-b] 진짜 PNG다 (이름만 png가 아니다)');
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  /* 🔴 규격이 틀리면 카톡이 잘라 버린다. 「파일이 있다」로 통과시키면 그걸 못 잡는다. */
  ok(w === 1200 && h === 630, '[1-c] 규격이 1200×630이다', w + '×' + h);
  /* 크롤러 상한. 넘으면 아예 안 뜨는 곳이 있다. */
  ok(b.length <= 5 * 1024 * 1024, '[1-d] 5MB를 안 넘는다', (b.length / 1024).toFixed(0) + 'KB');
}

/* ── [2] 링크가 나가는 화면 셋 ──────────────────────────────────────────────
   🔴 `estimate-view.html`이 가장 중요하다 — **고객에게 실제로 보내는 링크**다.
     여기가 빠지면 카톡에 그림 없는 카드가 나가고, 우리는 그 사실을 모른다. */
const PAGES = [
  ['index.html', '홈페이지'],
  ['estimate-view.html', '🔴 고객 견적서 링크'],
  ['packages.html', '패키지'],
];
for (const [file, label] of PAGES) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = s.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  ok(!!m, '[2] ' + label + ' — og:image가 있다 (' + file + ')');
  if (!m) continue;
  const url = m[1];
  /* 🔴 **절대 주소여야 한다.** 카톡·페이스북 크롤러는 상대경로를 못 읽는다 —
     그런데 화면에서는 아무 차이가 없어서 눈으로는 절대 안 걸린다. */
  ok(/^https:\/\//.test(url), '  └ 절대 주소다 (상대경로면 크롤러가 못 읽는다)', url);
  /* ⚠ 한글 경로를 주소에 실으면 인코딩이 한 겹 더 낀다 — ASCII로 못 박는다. */
  ok(/^[\x20-\x7E]+$/.test(url), '  └ 주소가 ASCII다 (한글 경로가 아니다)', url);
  /* 적어 둔 주소의 파일이 실제로 저장소에 있는가 */
  const rel = url.replace(/^https?:\/\/[^/]+\//, '');
  ok(fs.existsSync(path.join(ROOT, rel)), '  └ 그 주소의 파일이 저장소에 있다', rel);
  /* 크기를 함께 주면 카톡이 그림을 받기 전에 자리를 잡는다(안 주면 빈칸이 깜빡인다) */
  ok(/og:image:width"\s+content="1200"/.test(s) && /og:image:height"\s+content="630"/.test(s),
    '  └ 가로·세로를 함께 알려 준다');
  /* 큰 카드로 뜨게 한다 — 작은 카드는 그림을 정사각형으로 잘라 버린다 */
  ok(/twitter:card"\s+content="summary_large_image"/.test(s),
    '  └ 큰 카드로 뜬다 (summary_large_image)');
}

/* ── [3] 🔴 카드에 금액·목적지를 싣지 않는다 ───────────────────────────────
   견적서 링크는 **인증이 없다** — 아는 사람 누구나 연다. 고객이 사내 단톡방에
   붙이는 순간 카드가 그 방 전부에게 「어디 몇 명 얼마」를 보여 준다.
   그래서 og 문구에 금액·인원 같은 값이 **박혀 들어가지 않았는지** 본다.
   (대기열 P-6의 미결 항목이다 — 대표가 넣자고 정하면 그때 이 검사를 함께 고친다.) */
{
  const s = fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8');
  const head = s.slice(0, s.indexOf('</head>'));
  const metas = head.match(/<meta[^>]*og:(title|description|image:alt)[^>]*>/g) || [];
  const txt = metas.join(' ');
  ok(!/[0-9]{1,3},[0-9]{3}|원\b|명\b/.test(txt),
    '[3] 🔴 카드 문구에 금액·인원이 안 들어간다 (링크는 인증이 없다)', txt.slice(0, 120));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

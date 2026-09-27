/* ═══════════════════════════════════════════════════════════════════════════
   관리자 화면 간소화 S-1 (2026-09-27 대표 승인) — 걷어낸 것이 **되살아나지 않는가**
   ───────────────────────────────────────────────────────────────────────────
   관리자 탭 17개를 브라우저로 재서(버튼·입력칸 수 · 화면 길이) 찾은 다섯 가지.
   이 파일은 그중 **소스로 잴 수 있는 것**을 잠근다. 화면 모양은 브라우저로 쟀다(커밋 메시지).

   ② 설정의 「초기화」 셋 — 브라우저 사본만 지우고 「삭제되었습니다」라고 말했다.
   ③ 요율표 「🌤️ 시즌 확인하기」 ×60 — 누르면 아무 일도 안 하는 버튼이었다.
   ④ 견적 상세 「기관 정보·연수 조건」 — 한 줄 요약·고치기 ①과 겹쳐 「자세히」로 접었다.
   ⑤ 견적 상세 고치기 화면 — 고정 높이 틀 안의 스크롤(스크롤 속 스크롤)을 없앴다.
   ① 콘텐츠 관리 — 칸마다 「저장」(110개) → 바뀐 칸만 모아 저장하는 버튼 하나.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };
/* 주석은 걷고 잰다 — 경위를 적은 주석의 글자에 걸려 통과하면 안 된다(test_zC에서 겪었다) */
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const ADMIN = noComments(read('admin.html'));

/* ═══ ② 설정 「초기화」 ═══════════════════════════════════════════════════ */
ok('[2] 🔴 방문 기록 초기화가 없다 (새로고침하면 서버에서 다시 채워졌다)',
  !/clearData\('linkedt_visits'/.test(ADMIN));
ok('[2-b] 🔴 이벤트 통계 초기화가 없다', !/clearMulti\(/.test(ADMIN));
ok('[2-c] 견적 기록 초기화가 없다', !/clearData\('linkedt_estimates'/.test(ADMIN));
ok('[2-d] 진짜로 서버를 지우는 「문의 전체 삭제」는 남아 있다',
  /clearData\('linkedt_contacts'/.test(ADMIN));

console.log('\n' + '─'.repeat(64));
fails.forEach((f) => console.log('  ✗ ' + f));
console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — aF 관리자 화면 간소화');
process.exit(fails.length ? 1 : 0);

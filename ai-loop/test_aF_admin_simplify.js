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

/* ═══ ③ 요율표 시즌 — 누르면 헛일인 버튼 ═══════════════════════════════════ */
const RATES = noComments(read(path.join('admin', 'rates.js')));
const seasonCell = (RATES.match(/eff\.season_note \? `[^`]*`/) || [''])[0];
ok('[3] 🔴 시즌 칸이 버튼이 아니다 (onclick이 없어 눌러도 헛일이었다)',
  seasonCell && !/<button/.test(seasonCell), seasonCell.slice(0, 80));
ok('[3-b] 시즌 안내 전문은 풍선말·낭독기로 남아 있다 (지운 것이 아니다)',
  /title="\$\{esc\(eff\.season_note\)\}"/.test(seasonCell) && /aria-label=/.test(seasonCell));
ok('[3-c] 🔴 표 안의 버튼은 전부 무슨 일을 한다 (onclick 없는 btn-detail이 없다)',
  !/<button[^>]*class="btn-detail"(?![^>]*onclick)[^>]*>/.test(RATES));

/* ═══ ⑤ 고치기 화면 — 스크롤 속 스크롤 ═══════════════════════════════════════ */
const PRO = noComments(read('admin-quote-pro.html'));
const EST = noComments(read(path.join('admin', 'estmgr.js')));
ok('[5] 편집 화면이 자기 키를 바깥에 알린다', /emitEdit\('height', \{ h \}\)/.test(PRO));
ok('[5-b] 🔴 키는 내용(#app)의 바닥으로 잰다 (documentElement.scrollHeight면 틀이 안 줄어든다)',
  /\$\('app'\)[\s\S]{0,200}getBoundingClientRect\(\)\.bottom/.test(PRO)
  && !/emitEdit\('height'[^)]*scrollHeight/.test(PRO));
ok('[5-c] 단계를 넘기면 바깥에 머리로 데려가 달라고 한다', (PRO.match(/emitEdit\('top'\)/g) || []).length >= 2);
ok('[5-d] 🔴 바깥은 **자기 틀이 보낸 것만** 받는다 (자동 견적 산출 탭도 같은 화면을 쓴다)',
  /ev\.source === emEditFrame\(\)\.contentWindow/.test(EST)
  && /\(d\.__aqp === 'height' \|\| d\.__aqp === 'top'\) && !fromMine\) return/.test(EST));
ok('[5-e] 틀 안에서 따로 스크롤하지 않는다', /id="em-edit-frame"[^>]*scrolling="no"/.test(ADMIN));

console.log('\n' + '─'.repeat(64));
fails.forEach((f) => console.log('  ✗ ' + f));
console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — aF 관리자 화면 간소화');
process.exit(fails.length ? 1 : 0);

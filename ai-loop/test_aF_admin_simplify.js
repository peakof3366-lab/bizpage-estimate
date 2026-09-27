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

/* ═══ ① 콘텐츠 관리 — 「저장」 110개 → 하나 ═══════════════════════════════════ */
const fieldFn = (ADMIN.match(/function renderContentField\([\s\S]*?\n  \}/) || [''])[0];
ok('[1] 🔴 칸마다 「저장」 버튼이 없다 (110개였다)', fieldFn && !/<button/.test(fieldFn));
ok('[1-b] 결과 표시(저장됨·실패)는 칸 옆에 남아 있다', /class="cms-field-msg"/.test(fieldFn));
ok('[1-c] 저장 버튼은 하나다', (ADMIN.match(/onclick="saveAllContent\(\)"/g) || []).length === 1);
ok('[1-d] 🔴 고친 칸은 **캐시와 값 비교**로 센다 (건드린 것으로 세면 되돌린 칸까지 간다)',
  /function cmsDirtyFields\(\)[\s\S]{0,300}el\.value !== \(contentOverridesCache\[f\.key\] \|\| ''\)/.test(ADMIN));
ok('[1-e] 🔴 저장은 예전 경로(saveContentField)를 그대로 탄다', /await saveContentField\(f\.key,/.test(ADMIN));
ok('[1-f] 🔴 저장 안 한 채 다른 탭으로 가면 묻는다', /function switchTab\(name\) \{\s*\n[^\n]*\n?\s*if \(name !== currentTab && typeof cmsLeaveGuard === 'function' && !cmsLeaveGuard\(\)\) return;/.test(read('admin.html')));
ok('[1-g] 창을 닫을 때도 묻는다', /beforeunload[\s\S]{0,120}cmsDirtyFields\(\)\.length/.test(ADMIN));
ok('[1-h] 🔴 저장 상자가 sticky가 아니다 (.dash-main 안에서 sticky는 화면 바닥에 안 붙었다)',
  /\.cms-savebar \{ position: fixed;/.test(read('admin.css')));
ok('[1-i] 구역이 접히는 카드다', /<details class="card fold-card" data-cms-sec=/.test(ADMIN));

/* ═══ 새 견적을 두 번 만들지 않게 (2026-09-27) ═══════════════════════════════════
   저장 뒤 버튼이 다시 풀려 한 번 더 누르면 같은 내용의 견적이 새 번호로 또 생겼다. */
ok('[D] 🔴 새 견적 저장 뒤 다시 누르면 묻는다 (두 경로 모두 저장됨을 기록)',
  /if \(savedNewOnce && !EDIT_ID[\s\S]{0,40}!confirm\(/.test(PRO)
  && (PRO.match(/savedNewOnce = true;/g) || []).length === 2);

/* 저장하면 견적 관리 목록이 바로 다시 읽힌다 — 「업로드 완료」인데 목록에 없으면 다시 만든다 */
ok('[D-b] 🔴 새 견적 저장이 바깥에 알린다 (두 경로)', (PRO.match(/emitEdit\('created'\)/g) || []).length === 2);
ok('[D-c] 🔴 바깥은 알림을 받으면 목록을 다시 읽는다', /d\.__aqp === 'created'[\s\S]{0,200}loadRemoteData\(\)/.test(EST));

/* ═══ 내보내기 (2026-09-27) ═══════════════════════════════════════════════════
   견적 CSV의 「고객총액」·「내부총액」이 뒤바뀌었고, 문의 CSV엔 연락처가 없었고, 전체 백업엔 견적이 0건이었다. */
const estCsv = (ADMIN.match(/function exportEstimatesCsv\(\)[\s\S]*?\n  \}/) || [''])[0];
ok('[X] 🔴 견적 CSV: 청구 금액 칸에 청구액, 원가 칸에 원가 (뒤바뀌지 않는다)',
  /'청구 금액','원가'/.test(estCsv) && /M\.sell, M\.known \? M\.cost : ''/.test(estCsv) && !/내부총액/.test(estCsv));
const inqCsv = (ADMIN.match(/function exportCsv\(\)[\s\S]*?\n  \}/) || [''])[0];
ok('[X-b] 🔴 문의 CSV에 연락처가 있다', /'연락처'/.test(inqCsv) && /c\.tel/.test(inqCsv));
const expAll = (ADMIN.match(/function exportAll\(\)[\s\S]*?\n  \}/) || [''])[0];
ok('[X-c] 🔴 전체 백업이 실제 견적 목록을 담는다 (옛 브라우저 키가 아니라)', /estimates: getEstsFull\(\)/.test(expAll));
const rateCsv = (ADMIN.match(/function exportRatesCsv\(\)[\s\S]*?\n  \}/) || [''])[0];
ok('[X-d] 🔴 요율 CSV에 단가가 실리고, 운영 값(effectiveRate)을 쓴다',
  /RATE_FIELD_ORDER/.test(rateCsv) && /effectiveRate\(d0\)/.test(rateCsv));

/* ═══ 조사 — 「을(를)」·「이(가)」가 화면에 그대로 찍혔다 (2026-09-27) ═══════════════ */
{
  const src = read(path.join('admin', 'common.js'));
  const m = src.match(/const josa = [\s\S]*?\n  \};/);
  let josa = null;
  try { josa = m && new Function(m[0].replace('const josa =', 'return') )(); } catch (e) { josa = null; }
  ok('[J] josa 함수가 있다', typeof josa === 'function');
  if (josa) {
    ok('[J-b] 받침 있으면 을/이/은', josa('다낭', '을', '를') === '을' && josa('호텔', '이', '가') === '이');
    ok('[J-c] 받침 없으면 를/가/는', josa('코스', '을', '를') === '를' && josa('항공료', '은', '는') === '는');
    ok('[J-d] 한글이 아니면 둘 다 적는다 (틀린 조사보다 낫다)', josa('ABC', '을', '를') === '을(를)');
  }
  const leftovers = ['estmgr.js', 'itinerary.js', 'packages.js', 'pricereport.js', 'rates.js']
    .filter((f) => /[을이은]\((를|가|는)\)/.test(noComments(read(path.join('admin', f)))));
  ok('[J-e] 🔴 관리 화면 스크립트에 「을(를)」 꼴이 남아 있지 않다', leftovers.length === 0, leftovers.join(','));
}

console.log('\n' + '─'.repeat(64));
fails.forEach((f) => console.log('  ✗ ' + f));
console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — aF 관리자 화면 간소화');
process.exit(fails.length ? 1 : 0);

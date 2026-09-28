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
  && /\(d\.__aqp === 'height' \|\| d\.__aqp === 'top'( \|\| d\.__aqp === 'step')?\) && !fromMine\) return/.test(EST));
ok('[5-e] 틀 안에서 따로 스크롤하지 않는다', /id="em-edit-frame"[^>]*scrolling="no"/.test(ADMIN));

/* ═══ ① 콘텐츠 관리 — 「저장」 110개 → 하나 ═══════════════════════════════════ */
const fieldFn = (ADMIN.match(/function renderContentField\([\s\S]*?\n  \}/) || [''])[0];
ok('[1] 🔴 칸마다 「저장」 버튼이 없다 (110개였다)', fieldFn && !/<button/.test(fieldFn));
ok('[1-b] 결과 표시(저장됨·실패)는 칸 옆에 남아 있다', /class="cms-field-msg"/.test(fieldFn));
ok('[1-c] 저장 버튼은 하나다', (ADMIN.match(/onclick="saveAllContent\(\)"/g) || []).length === 1);
ok('[1-d] 🔴 고친 칸은 **캐시와 값 비교**로 센다 (건드린 것으로 세면 되돌린 칸까지 간다)',
  /function cmsDirtyFields\(\)[\s\S]{0,300}cmsStoreValue\(f\.key, el\.value\) !== \(contentOverridesCache\[f\.key\] \|\| ''\)/.test(ADMIN));
/* 🔴 칸에 지금 나가는 글을 넣는다 (2026-09-27) — 비어 있고 회색 placeholder뿐이라 긴 FAQ 답변의 오타 하나에
   답변 전체를 다시 쳐야 했다. 대신 기본 문구와 같은 값은 빈 값으로 저장해 기본값을 덮어쓴 칸으로 굳지 않게 한다. */
{
  const m = ADMIN.match(/function cmsStoreValue\(key, raw\) \{[\s\S]*?\n  \}/);
  let fn = null;
  try { fn = m && new Function('CMS_FIELDS', m[0] + '; return cmsStoreValue;')([{ key: 'faq.1.a', def: '기본 답변' }]); } catch (e) { fn = null; }
  ok('[1-j] 기본 문구 그대로면 빈 값으로 저장한다(기본값을 덮어쓰지 않는다)', !!fn && fn('faq.1.a', '기본 답변') === '');
  ok('[1-k] 고친 글은 그대로 저장한다', !!fn && fn('faq.1.a', '기본 답변!') === '기본 답변!');
  ok('[1-l] 🔴 칸에는 지금 나가는 글이 들어 있다 (placeholder만이 아니다)',
    /const shown\s*= val \|\| f\.def/.test(ADMIN) && /value="\$\{esc\(shown\)\}"/.test(ADMIN) && />\$\{esc\(shown\)\}<\/textarea>/.test(ADMIN));
}
/* 🔴 칸에 넣는 기본 문구가 **지금 홈페이지 글과 같아야** 한다 — 이제 그 글을 「지금 나가는 글」로 보여준다.
   index.html만 고치고 여기를 안 고치면 담당자는 틀린 글을 현재 글로 믿고 고친다(결함 생성기 ①). */
{
  const RAW = read('admin.html');
  const a = RAW.indexOf('  const CMS_FIELDS = ['), b = RAW.indexOf('  let contentOverridesCache');
  let F = null;
  try { F = new Function(RAW.slice(a, b) + '; return CMS_FIELDS;')(); } catch (e) { F = null; }
  const { JSDOM } = require('jsdom');
  const home = new JSDOM(read('index.html')).window.document;
  const n = (s) => String(s || '').replace(/\s+/g, '');
  const diff = (F || []).filter((f) => {
    const el = home.querySelector('[data-cms-key="' + f.key + '"]');
    return !el || n(f.type === 'img' ? el.getAttribute('src') : el.textContent) !== n(f.def);
  }).map((f) => f.key);
  ok('[1-m] 🔴 콘텐츠 칸 기본 문구 110개가 홈페이지 글과 같다', !!F && F.length >= 100 && diff.length === 0,
    (F ? F.length + '칸 · 다름 ' : '못 읽음 ') + diff.slice(0, 5).join(','));
}
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

/* ═══ 사이드바 배지는 setSideBadge 한 곳으로 (2026-09-27) ═══════════════════════════
   대시보드가 배지 글자를 직접 덮어써서, 배지는 「1」인데 「지금 할 일」엔 미확인 문의가 빠져 있었다. */
{
  const srcs = [ADMIN, noComments(read(path.join('admin', 'packages.js')))].join('\n');
  const direct = srcs.match(/(badge|el|b)\.textContent\s*=\s*[^;]*;[^\n]*\n?[^\n]*\.style\.display\s*=/g) || [];
  /* setSideBadge 본문 하나만 허용한다 */
  ok('[B] 🔴 배지를 직접 쓰는 곳이 setSideBadge 하나뿐이다', direct.length <= 1, direct.length + '곳');
}

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
    ok('[J-g] 으로/로 — ㄹ 받침은 「로」 (서울로·이직원으로·김매니저로)',
      josa('서울', '으로', '로') === '로' && josa('이직원', '으로', '로') === '으로' && josa('김매니저', '으로', '로') === '로');
    /* ⚠ 우연히 맞는 예(호텔(1박) — 「호텔」도 「박」도 받침 있음)로는 괄호 처리가 안 재진다. 갈라지는 예로 잰다:
       「가이드(1일)」 — 「가이드」는 받침 없음(를), 괄호 안 「일」은 받침 있음(을). 한 번 순서를 틀려 우연히 통과했다. */
    ok('[J-f] 🔴 괄호 덧말·따옴표를 건너뛰고 본말로 고른다',
      josa('가이드(1일)', '을', '를') === '를' && josa('"코스"', '을', '를') === '를' && josa('「호텔」', '이', '가') === '이');
  }
  const leftovers = ['estmgr.js', 'itinerary.js', 'packages.js', 'pricereport.js', 'rates.js']
    .filter((f) => /[을이은]\((를|가|는)\)/.test(noComments(read(path.join('admin', f)))));
  ok('[J-e] 🔴 관리 화면 스크립트에 「을(를)」 꼴이 남아 있지 않다', leftovers.length === 0, leftovers.join(','));
  ok('[J-h] 🔴 관리자 화면에 「(으)로」 꼴이 남아 있지 않다 (담당자 바꾸기 확인창)', !/\(으\)로/.test(ADMIN));
}

/* ═══ 고치기 — 실무 변수 줄이 0개로 열리던 것 (2026-09-27) ═══════════════════════════
   저장된 줄만 되살려서, 실무 변수를 저장하지 않은 견적은 머리줄만 있고 FOC·인솔자 칸이 없었다. */
{
  const rs = (PRO.match(/const savedAdj = [\s\S]*?\.concat\(adjTmpl\.filter[^;]*/) || [''])[0];
  ok('[E] 🔴 고치기에서 표준 실무 변수 줄(FOC 등)이 늘 있다 — 저장값은 그 위에 얹는다',
    /buildAdjust\(\{ perPerson: 0 \}\)/.test(rs) && /adjTmpl\.filter\(\(t\) => !savedAdj\.some/.test(rs));
  ok('[E-b] 저장된 줄의 kind를 새 규칙으로 바꾸지 않는다 (원가·마진이 조용히 바뀐다)',
    /Object\.assign\(\{\}, a, \{ qtyLabel: t\.qtyLabel, auto: t\.auto/.test(rs) && !/kind: t\.kind/.test(rs));
}

/* ═══ 「지금 할 일」은 그 건들만 걸러 연다 (2026-09-27) — 탭만 바꾸면 「전체」에서 다시 찾아야 했다 ═══ */
ok('[T] 🔴 미확인 문의 → 「미확인」 필터, 미처리 견적 → 「신규」 필터를 함께 누른다',
  /what: '미확인 문의', pick: '#tab-inquiries \.filter-btn\[data-filter="unread"\]'/.test(ADMIN)
  && /what: '미처리 견적', pick: '#tab-estmgr \.filter-btn\[data-emfilter="new"\]'/.test(ADMIN)
  && /switchTab\(btn\.dataset\.go\);\s*const pick = btn\.dataset\.pick[^\n]*\n\s*if \(pick\) pick\.click\(\);/.test(ADMIN));

/* ═══ 문의 창 상태칸 = 목록 배지 (2026-09-27) ═══════════════════════════════════════
   열면 read만 true가 되고 status는 unread로 남아, 창에선 「신규」·목록에선 「확인」이었다.
   게다가 메모·담당자 자동 저장이 그 「신규」를 같이 보내 **방금 읽은 문의가 다시 안 읽음이 됐다.** */
{
  const m = read('admin.html').match(/document\.getElementById\('d-status'\)\.value =\s*\n?\s*([^;]+);/);
  let f = null;
  try { f = m && new Function('c', 'return ' + m[1] + ';'); } catch (e) { f = null; }
  ok('[S] 🔴 열어서 읽은 문의(status=unread, read=true)는 창에서도 「확인」', !!f && f({ status: 'unread', read: true }) === 'read');
  ok('[S-b] 처리중·완료는 그대로, 안 읽은 건 「신규」',
    !!f && f({ status: 'pending', read: true }) === 'pending' && f({ status: 'done' }) === 'done' && f({ status: 'unread', read: false }) === 'unread');
}

/* ═══ Esc — 창 하나만 닫히던 것 (2026-09-27) ═══════════════════════════════════════ */
ok('[K] 🔴 Esc는 맨 위 창의 ✕를 누른다 (창마다의 닫기 처리를 거친다) · 칸에 쓰는 중이면 안 닫는다',
  /if \(e\.key !== 'Escape'\) return;/.test(ADMIN) && /top\.querySelector\('\.modal-close'\)/.test(ADMIN)
  && /ae\.closest\('\.modal-overlay'\)\) return;/.test(ADMIN)
  && !/if\(e\.key==='Escape'\) document\.getElementById\('modal'\)/.test(ADMIN));
ok('[K-b] 창마다 ✕가 있다 (Esc가 누를 자리)',
  (ADMIN.match(/class="modal-overlay/g) || []).length === (ADMIN.match(/class="modal-close/g) || []).length);

/* ═══ 확인창에 마크다운 별표가 그대로 찍히던 것 (2026-09-27) ═══════════════════════════
   confirm/alert는 글자 그대로 보여준다 — 「**일정이 실리지 않습니다.**」가 별표째 떴다. */
{
  const bad = [];
  ['admin/estmgr.js', 'admin/itinerary.js', 'admin/rates.js', 'admin/packages.js', 'admin/ledger.js', 'admin/pricereport.js', 'admin/recommend.js']
    .forEach((f) => {
      const src = noComments(read(f));
      for (const m of src.matchAll(/(?:confirm|alert)\(([\s\S]{0,600}?)\)\s*(?:\)|;|\{|return)/g)) if (/\*\*/.test(m[1])) bad.push(f);
    });
  ok('[Q] 🔴 확인창·알림 글에 ** 가 없다', bad.length === 0, [...new Set(bad)].join(','));
}

/* ═══ 자동 견적 산출 — 다시 산출하면 앞뒤가 어긋나던 것 (2026-09-27) ═══════════════════════
   다낭 23명으로 산출한 뒤 방콕 30명으로 바꿔 다시 산출하면 견적서가 「다낭 · 성인 23명 · 3월 일정」으로 남아
   총액이 엔진보다 1,343만원 적게 찍혔다. 반대로 담당자가 적은 상세 칸·실무 변수는 말없이 지워졌다. */
{
  const seed = (PRO.match(/function seedDoc\(bd, v\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok('[P] 🔴 견적서 머리 칸은 「자동값 그대로면」 새 조건을 따른다 (비었을 때만 채우지 않는다)',
    /const follow = \(id, val\)/.test(seed) && /follow\('dRegion', dest\)/.test(seed) && /follow\('dStay'/.test(seed)
    && /follow\('dFuel'/.test(seed) && !/if \(!\$\('dRegion'\)\.value\) \$\('dRegion'\)\.value = dest/.test(seed));
  ok('[P-b] 🔴 성인 수도 자동값이면 새 인원을 따른다 (나눠 적었으면 안 건드린다)',
    /AUTO\.dAdult !== undefined && \$\('dAdult'\)\.value === AUTO\.dAdult/.test(seed));
  ok('[P-c] 🔴 상세 내용은 다시 산출해도 사람이 고친 줄·더한 줄을 남긴다',
    /S\.autoDetails = autoCopy/.test(seed) && /!same\(oc\.rows\[j\], oa\.rows\[j\]\)/.test(seed));
  ok('[P-d] 🔴 골프 줄은 엔진과 같은 규칙(요금 있음 · 총원 상한 · 0명이면 안 씀)',
    /getGolfFee\(dest\)/.test(seed) && /Math\.min\(Number\(v\.golfCount\) \|\| 0, Number\(v\.pax\) \|\| 0\)/.test(seed) && /v\.incGolf && gCount > 0/.test(seed));
  const itiFn = (PRO.match(/function seedItinerary\(v\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok('[P-e] 🔴 일정: 손대지 않은 초안은 새 조건으로 다시 깔고, 고친 일정은 남기되 날짜를 맞추고 말한다',
    /const untouched = S\.itiAuto !== undefined/.test(itiFn) && /S\.iti = \[\];/.test(itiFn) && /stampDates\(\); renderIti\(\);\s*itiState\(/.test(itiFn));
  ok('[P-f] 🔴 다시 산출: ②단계에서 고친 금액이 있으면 먼저 묻고, 실무 변수는 남긴다',
    /editedRows && !confirm\(/.test(PRO) && /keepAdj\.forEach/.test(PRO));
  ok('[P-h] 🔴 산출 뒤 ①단계를 바꾸면 ②~⑤를 다시 잠근다 (옛 총액 ÷ 새 인원이 경고 없이 발급되던 자리)',
    /\$\('sec1'\)\.addEventListener\('input', markCalcStale\)/.test(PRO) && /staleCalc = true;\s*unlocked = false;/.test(PRO)
    && /function unlockSteps\(\) \{\s*unlocked = true;\s*staleCalc = false;/.test(PRO));
  ok('[P-i] 🔴 직접 입력·고치기: ①단계를 바꾸면 견적서 머리·일정이 따라간다 (잠그지 않는다)',
    /\$\('sec1'\)\.addEventListener\('change', \(e\) => \{\s*if \(!ADHOC \|\| !unlocked\) return;[\s\S]{0,300}seedDoc\(S\.bd \|\| \{ rows: \[\], hotelGrade: \{ label: '' \} \}, v\);\s*seedItinerary\(v\);/.test(PRO));
  ok('[P-j] 🔴 고치기: 불러온 칸 중 조건과 맞는 것만 자동값으로 치고, 저장된 상세 내용은 건드리지 않는다',
    /const A = S\.autoDoc = \{\};/.test(PRO) && /if \(!prevAuto && prevCur && prevCur\.length\) \{\s*S\.details = prevCur;/.test(PRO));
  ok('[P-k] 🔴 「손댄 일정」은 날짜·일차를 빼고 가른다 (출발일만 바꿔도 손댄 것으로 읽혔다)',
    /const itiSig = \(arr\)/.test(PRO) && /delete o\.date; delete o\.day;/.test(PRO) && !/JSON\.stringify\(S\.iti\) === S\.itiAuto/.test(PRO));
  ok('[P-l] 출발일이 없으면 「#00월 기준 유류할증료」를 쓰지 않는다', /if \(m\) follow\('dFuel'/.test(PRO));
  ok('[P-g] 🔴 골프 요금이 없는 목적지는 골프를 잠근다 (고객 화면과 같은 규칙)',
    /function syncGolfLock\(\)/.test(PRO) && /box\.disabled = lock/.test(PRO) && /rateOverridesReady\)\.then\(syncGolfLock\)/.test(PRO));
}

/* ═══ 저장 안 한 수정이 있는데 발급하면 고치기 전 견적서가 나가던 것 (2026-09-27) ═══════════ */
ok('[U] 🔴 발급·미리보기 전에 저장 안 한 수정을 묻는다 (마지막 저장본이 나간다고 말한다)',
  /function emUnsavedOk\(what\)/.test(ADMIN)
  && /async function issueShareLink\(\) \{[\s\S]{0,200}if \(!emUnsavedOk\('발급'\)\) return;/.test(ADMIN)
  && /async function previewShareLink\(\) \{[\s\S]{0,200}if \(!emUnsavedOk\('미리보기'\)\) return;/.test(ADMIN));

/* ═══ 방문 통계 시간대 — 홀수 시 방문이 버려졌다 (2026-09-27) ═══════════════════════
   짝수 시만 골라 그려서(filter i%2===0) 1·3·…·15시 방문이 그래프에서 통째로 사라졌다. */
{
  const m = read('admin.html').match(/function buildHourData\(visits\) \{[\s\S]*?\n  \}/);
  let fn = null;
  try { fn = m && new Function(m[0] + '; return buildHourData;')(); } catch (e) { fn = null; }
  const at = (h) => ({ ts: new Date(2026, 8, 27, h, 10).getTime() });
  const vs = [at(0), at(1), at(15), at(15), at(23)];
  const r = fn ? fn(vs) : [];
  const sum = r.reduce((a, x) => a + x.value, 0);
  ok('[H] 🔴 시간대 그래프가 방문을 하나도 버리지 않는다 (홀수 시 포함)', !!fn && sum === vs.length, 'sum=' + sum);
  ok('[H-b] 14시 칸에 15시 방문 둘이 들어간다', !!fn && (r.find((x) => x.label === '14시') || {}).value === 2);
}

/* ═══ 매뉴얼 장 번호 — 목차·본문·「N장」 링크가 셋 다 달랐다 (2026-09-27) ═══════════
   목차는 CSS 카운터로 1~16을 세는데 본문 제목은 6-2·6-3…으로 따로 적혀 있었고,
   「권한은 9장」(실제 13장)·「막혔을 때 10장」(실제 14장)처럼 링크 글자가 한 칸씩 밀려 있었다.
   → 본문 제목 번호가 1부터 빠짐없이 이어지고, 「N장」 링크가 가리키는 절의 제목이 N으로 시작하는지 잰다. */
{
  const man = read('manual.html');
  const nums = [...man.matchAll(/<h2>(\d+(?:-\d+)?)\.\s/g)].map((m) => m[1]);
  ok('[M] 매뉴얼 본문 장 번호가 1부터 빠짐없이 이어진다 (목차 카운터와 같은 번호)',
    nums.length > 10 && nums.every((n, i) => n === String(i + 1)), nums.join(','));
  const bad = [];
  for (const m of man.matchAll(/<a href="#([\w-]+)">(\d+)장/g)) {
    const at = man.indexOf('id="' + m[1] + '"');
    /* h3 앵커(which-screen)는 그 앞의 가장 가까운 장 제목을 본다 */
    const before = man.slice(0, at + 400);
    const h2s = [...before.matchAll(/<h2>(\d+)\.\s/g)];
    const ch = h2s.length ? h2s[h2s.length - 1][1] : '?';
    if (ch !== m[2]) bad.push('#' + m[1] + ' ' + m[2] + '장→실제 ' + ch + '장');
  }
  ok('[M-b] 🔴 「N장」 링크가 실제 그 장을 가리킨다', bad.length === 0, bad.join(' / '));
}

console.log('\n' + '─'.repeat(64));
fails.forEach((f) => console.log('  ✗ ' + f));
console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — aF 관리자 화면 간소화');
process.exit(fails.length ? 1 : 0);

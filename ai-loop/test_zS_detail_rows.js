/* ═══════════════════════════════════════════════════════════════════════════
   내부직원용 견적서 — 상세 내용의 **줄**과 **빠지는 항목** 검사
   ───────────────────────────────────────────────────────────────────────────
   2026-09-16 대표 지적: 「내부 직원용은 첨부한 이미지에서 누락된 항목들이 있다.」
   대조해 보니 사실이었다. 기준은 `quote_doc.js` 머리말이 가리키는 표준 양식 이미지다.

   ■ 무엇이 빠져 있었나 (고치기 전 실측)
   ① **인솔자 행이 아예 없었다** — 화면이 만드는 상세 항목 목록에 없다.
   ② **한 항목에 두 줄을 못 넣었다** — 양식의 「기타사항」은 쇼핑센터 방문 / 선택관광
      제안 **두 줄**이고 「식사」도 두 줄인데, 화면은 항목당 내용 칸이 하나였다.
      규격(`QuoteDoc`)은 `rows`가 배열이라 되는데 **화면이 못 만드는** 상태였다.
   ③ 🔴 **빈 칸이면 그 항목이 문서에서 통째로 사라지는데 화면이 말하지 않았다.**
      기본값이 공란인 항목이 여섯이라(항공·기사/차량·가이드·식사·여행자보험·기타사항)
      담당자가 아무것도 안 적으면 상세 내용이 **3줄짜리 문서**가 됐다. 이게 이 저장소가
      「결함 생성기 ②(조용한 폴백)」라 부르는 모양이다.

   ■ 이 검사가 재는 방식 — 🔴 **화면을 실제로 띄워서 잰다**
   글자만 세면 「칸은 있는데 안 나간다」를 못 잡는다(이 저장소가 그 유형으로 세 번
   당했다). 그래서 `admin-quote-pro.html`을 jsdom으로 **띄우고**, 자동 산출을 **누르고**,
   칸에 **적어 넣고**, 그 결과로 그려진 **견적서 미리보기**에서 항목을 찾는다.
   ⚠ 미리보기는 `stripInternal` 뒤의 고객본이다 — 고객이 보는 그 문서다.
   ⚠ 예시 문구(placeholder)는 **값이 아니다.** 값으로 새어 들어가면 「노쇼핑」 같은
     건별 약속이 아무도 안 고친 채 나간다 — [4]가 그것을 잠근다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

/* ── 화면이 싣는 파일을 **그 자리에 그대로** 끼워 넣는다 ──
   jsdom 30에는 `ResourceLoader`가 없다(30.0.1에서 확인). 파일을 따로 eval하면
   **순서**가 달라지는데, 이 화면은 순서가 곧 동작이다 — `QuoteEngineHost.mount()`가
   `script.js`보다 먼저여야 엔진이 뜬다. 그래서 `<script src>` 자리를 그 파일 내용으로
   바꾸기만 한다. 순서·타이밍이 브라우저와 같아진다.
   ⚠ `script.js` 안에 `</script` 한 곳이 있다 — 그대로 끼우면 문서가 거기서 잘린다.
     `<\/script`로 바꾼다(문자열·주석 어느 쪽이든 뜻이 같다). */
function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return m;
    return '<script>' + fs.readFileSync(p, 'utf8').replace(/<\/script/g, '<\\/script') + '</script>';
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const vc = new VirtualConsole();   /* 화면 로그를 검사 출력에 섞지 않는다 */
  const dom = new JSDOM(inlineScripts(fs.readFileSync(path.join(ROOT, 'admin-quote-pro.html'), 'utf8')), {
    runScripts: 'dangerously', url: 'http://localhost/admin-quote-pro.html',
    virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(window) {
      /* ⚠ 네트워크를 막는다. 로그인만 통과시키고 나머지는 **영원히 안 오는 약속**이다
         (거절로 바꾸면 `.catch` 경로가 기본 동작이 되어 다른 것을 재게 된다). */
      window.fetch = (url) => {
        if (String(url).includes('/api/admin/account')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '검사용 직원' }) });
        }
        return new Promise(() => {});
      };
      window.print = () => {};
    },
  });
  const W = dom.window, D = W.document;
  await new Promise((r) => W.addEventListener('load', r));
  await sleep(150);   /* 로그인 약속이 풀리고 `app`이 열릴 때까지 */

  ok('[0] 화면이 열렸다 (로그인 게이트 통과)', !D.getElementById('app').classList.contains('hidden'));
  ok('[0-b] 견적서 공통 모듈이 실렸다', typeof W.QuoteDoc === 'object' && !!W.QuoteDoc);

  /* ── 자동 산출을 실제로 누른다 ── */
  const set = (id, v) => {
    const e = D.getElementById(id); e.value = v;
    e.dispatchEvent(new W.Event('input', { bubbles: true }));
    e.dispatchEvent(new W.Event('change', { bubbles: true }));
  };
  const destSel = D.getElementById('pDest');
  const dest = Array.from(destSel.options).map((o) => o.value).filter(Boolean)[0];
  ok('[0-c] 목적지 목록이 채워졌다', !!dest, '첫 목적지: ' + dest);
  set('pDest', dest); set('pDays', '5'); set('pPax', '30'); set('pStart', '2026-11-10');
  D.getElementById('btnCalc').click();
  await sleep(50);

  const err = D.getElementById('calcErr');
  ok('[0-d] 산출이 오류 없이 끝났다', err.classList.contains('hidden'), err.textContent);
  /* 🔴 2026-09-16부터 이 화면은 **한 번에 한 단계만** 보인다(예전엔 산출 한 번에
     다섯이 동시에 열려 문서 높이가 10,886px였다). 산출 직후 열리는 것은 2단계(금액)이고
     견적서 내용은 3단계다 — **담당자와 같은 순서로** 단계를 눌러서 연다.
     ⚠ 칸이 감춰졌을 뿐 DOM에는 그대로 있다. 아래 항목 검사는 영향을 받지 않는다. */
  ok('[0-e] 산출이 끝나면 2단계가 열린다', !D.getElementById('secMoney').classList.contains('hidden'));
  ok('[0-e2] 3단계 막대가 잠금 해제됐다', !D.querySelector('.step[data-step="3"]').disabled);
  D.querySelector('.step[data-step="3"]').click();
  await sleep(30);
  ok('[0-e3] 견적서 내용 칸이 열렸다', !D.getElementById('secDoc').classList.contains('hidden'));

  /* ═══ ⓪ 2026-09-28 대표 요청 — 위쪽은 날짜 둘(자동) + 내부 메모만, 「저장하기」는 견적서에 반영하고 그리로 간다 ═══ */
  {
    const ymdL = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const now = new W.Date();
    const nm = new W.Date(now.getFullYear(), now.getMonth() + 1, 1);
    nm.setDate(Math.min(now.getDate(), new W.Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate()));
    const v = (id) => (D.getElementById(id) || { value: '(칸 없음)' }).value;
    /* 🔴 고치기 전: 원래 칸엔 날짜가 있는데 **위 칸은 비어 있었다**(코드로 채우면 input 이벤트가 안 난다) */
    ok('[0-f] 위 작성일자 칸에 오늘이 보인다', v('dIssue2') === ymdL(now), v('dIssue2'));
    ok('[0-f2] 위 유효기간 칸에 한 달 뒤가 보인다', v('dValid2') === ymdL(nm), v('dValid2') + ' / 기대 ' + ymdL(nm));
    const top = D.querySelector('#secDoc .sec-b > .grid');
    ok('[0-f3] 위에는 거래처명·고객 연락처가 없다',
      !!top && !top.querySelector('#dClient') && !D.getElementById('dCustTel2'));
    ok('[0-f4] 거래처명은 「견적서 내용 보충」 안으로 옮겼다(대장·문서 제목이 쓴다)',
      !!D.querySelector('#docFormFold #dClient') && /견적서 내용 보충/.test(D.querySelector('#docFormFold > summary').textContent));
    ok('[0-f5] 보충은 접혀 시작한다', !D.getElementById('docFormFold').open);
    /* 저장하기 — 보충에 적은 것이 위 견적서에 나오고, 그리로 스크롤한다 */
    const org = D.getElementById('dOrgName');
    org.value = '반영점검 연수단'; org.dispatchEvent(new W.Event('input', { bubbles: true }));
    let scrolled = false;
    D.getElementById('docEdit').scrollIntoView = () => { scrolled = true; };
    const btn = D.getElementById('btnDocApply');
    ok('[0-g] 「다음: 일정」 옆에 「저장하기」가 있다', !!btn && btn.textContent.trim() === '저장하기'
      && btn.nextElementSibling && btn.nextElementSibling.getAttribute('data-goto') === '4');
    if (btn) { btn.click(); await sleep(10); }
    ok('[0-g2] 누르면 위 견적서에 반영된다', /반영점검 연수단/.test(D.getElementById('docEdit').textContent));
    ok('[0-g3] 누르면 견적서로 옮겨 간다', scrolled);
    ok('[0-g4] 서버 저장이 아니라고 말한다', /최종 저장은/.test(D.getElementById('docApplyMsg').textContent));
    org.value = ''; org.dispatchEvent(new W.Event('input', { bubbles: true }));
  }

  /* ═══ ⓪-b 🔴 브라우저 자동완성이 고객·장소 칸을 덮지 못한다 (2026-09-28 — 멜버른 견적 제목에 「_대한민국」) ═══
     jsdom엔 자동완성이 없다 — 크롬이 하는 일을 흉내 낸다: 담당자 칸에 들어가(focusin) 주소록을 고르면
     여러 칸에 값이 들어가고 그 칸들에 `:autofill` 표시가 붙은 채 input이 난다. */
  {
    const fakeAutofill = (el, v) => {
      const orig = el.matches.bind(el);
      el.matches = (sel) => (/autofill/.test(sel) ? true : orig(sel));
      el.value = v; el.dispatchEvent(new W.Event('input', { bubbles: true }));
      el.matches = orig;
    };
    const region = D.getElementById('dRegion'), tel = D.getElementById('dStaffTel'), cust = D.getElementById('dCustTel');
    const before = region.value;
    tel.dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    fakeAutofill(tel, '010-9767-3366');
    fakeAutofill(region, '대한민국');
    fakeAutofill(cust, '010-9767-3366');
    await sleep(10);
    ok('[0-h] 🔴 자동완성이 지역 칸에 넣은 「대한민국」을 되돌린다', region.value === before && before !== '대한민국', region.value + ' / 원래 ' + before);
    ok('[0-h2] 🔴 고객 연락처에 들어간 내 휴대폰도 되돌린다', cust.value === '', cust.value);
    ok('[0-h3] 담당자 칸의 자동완성은 막지 않는다 (내 정보가 맞다)', tel.value === '010-9767-3366', tel.value);
    ok('[0-h4] 견적서 제목에 「대한민국」이 안 붙는다', !/대한민국/.test((D.querySelector('#docEdit h1') || { textContent: '' }).textContent));
    /* 대조군 — 사람이 직접 적은 값은 그대로 */
    region.value = '호주_멜버른'; region.dispatchEvent(new W.Event('input', { bubbles: true }));
    ok('[0-h5] 대조군: 사람이 적은 지역 표기는 남는다', region.value === '호주_멜버른', region.value);
    region.value = before; region.dispatchEvent(new W.Event('input', { bubbles: true }));
    tel.value = ''; tel.dispatchEvent(new W.Event('input', { bubbles: true }));
    ok('[0-h6] 칸에 자동완성 끄기가 붙어 있다', region.getAttribute('autocomplete') === 'off' && cust.getAttribute('autocomplete') === 'off');
  }

  /* ═══ ① 표준 양식의 항목이 **칸으로 존재하는가** ═══════════════════════ */
  const secs = Array.from(D.querySelectorAll('#detailRows .day'));
  const labelOf = (s) => (s.querySelector('.day-h').childNodes[0].textContent || '').trim();
  const labels = secs.map(labelOf);
  ok('[1] 인솔자 칸이 있다', labels.indexOf('인솔자') >= 0, '있는 항목: ' + labels.join(' · '));
  ok('[1-b] 기타사항 칸이 있다', labels.indexOf('기타사항') >= 0);
  ['항공', '호텔', '기사/차량', '가이드', '식사', '입장료', '불포함내역'].forEach((L) => {
    ok('[1-c] ' + L + ' 칸이 있다', labels.indexOf(L) >= 0);
  });

  /* ② 기타사항은 **두 줄**이다 — 양식이 두 줄이다 */
  /* ⚠ **없으면 죽지 말고 실패로 말한다.** 대조군(고치기 전 화면)으로 돌려 보니 여기서
     통째로 죽어 무엇이 빠졌는지 한 줄도 못 보여 줬다 — 재는 자가 그러면 안 된다. */
  const find = (L) => Array.from(D.querySelectorAll('#detailRows .day')).find((s) => labelOf(s) === L);
  const rowsOf = (L) => { const s = find(L); return s ? s.querySelectorAll('textarea[data-dr]') : []; };
  const etc = find('기타사항');
  ok('[2] 기타사항이 두 줄로 열린다', rowsOf('기타사항').length === 2, '줄 수: ' + rowsOf('기타사항').length);
  ok('[2-b] 두 줄의 예시가 서로 다르다',
    Array.from(rowsOf('기타사항')).map((t) => t.placeholder).join('|') === '쇼핑센터 방문|선택관광 제안',
    etc ? Array.from(rowsOf('기타사항')).map((t) => t.placeholder).join('|') : '기타사항 칸이 없음');

  /* ③ 줄을 **늘릴 수 있다** — 양식의 「식사」가 두 줄이다 */
  const mealAdd = find('식사') && find('식사').querySelector('[data-dadd]');
  ok('[3-a] 식사에 「줄 추가」 버튼이 있다', !!mealAdd);
  if (mealAdd) {
    mealAdd.click(); await sleep(10);
    ok('[3] 줄 추가 버튼이 줄을 늘린다', rowsOf('식사').length === 2, '줄 수: ' + rowsOf('식사').length);
    const rm = find('식사').querySelectorAll('[data-drm]');
    ok('[3-b] 두 줄부터 「이 줄 삭제」가 나온다', rm.length === 2, '삭제 버튼 수: ' + rm.length);
    if (rm.length) { rm[rm.length - 1].click(); await sleep(10); }
    ok('[3-c] 줄을 지우면 되돌아온다', rowsOf('식사').length === 1, '줄 수: ' + rowsOf('식사').length);
  }

  /* ═══ ④ 🔴 예시 문구는 **값이 아니다** ═══════════════════════════════════
     「무사고 경력의 베테랑 기사」·「노쇼핑」은 건별 사실이다. 기본값으로 박히면
     아무도 안 고치고 그대로 고객에게 나간다. */
  const vals = Array.from(D.querySelectorAll('#detailRows textarea[data-dr]')).map((t) => t.value).join('\n');
  const phCount = Array.from(D.querySelectorAll('#detailRows textarea[data-dr]'))
    .filter((t) => (t.placeholder || '').trim()).length;
  /* ⚠ 자동으로 채워지는 **값**은 따로 있다(호텔 등급·입장료·불포함내역) — 그건 산출
     결과지 예시가 아니다. 여기서 막는 것은 **양식 문구가 값으로 새는 것**이다. */
  ok('[4] 표준 양식 예시 문구가 값으로 들어가 있지 않다',
    !/무사고 경력|우수가이드|책임인솔자|조식은 호텔식|쇼핑센터 방문|선택관광 제안|1억원 보장/.test(vals),
    vals.replace(/\n/g, ' | '));
  ok('[4-b] 예시 문구는 보인다 (placeholder)', phCount >= 6, '예시가 붙은 칸: ' + phCount);
  const pv0 = D.getElementById('prevBox').textContent;
  ok('[4-c] 예시가 견적서로 새지 않는다',
    !/무사고 경력|노쇼핑|책임인솔자|FSC \(Full/.test(pv0));

  /* ═══ ⑤ 비면 빠진다 — 🔴 2026-09-28 대표 요청으로 화면의 「비어 있음」 배지·「빠지는 항목 n개」 안내는 걷었다 ═══
     ⚠ 빠지는 것 자체는 그대로다 — 아래 [5-b]가 문서에서 직접 본다. 말로 알려 주지 않을 뿐이다(매뉴얼 ③이 말한다). */
  ok('[5] 배지·빠지는 항목 안내를 걷었다(대표 요청)',
    !D.getElementById('detailWarn') && !D.querySelector('[data-dempty]'));
  ok('[5-b] 비워 둔 인솔자는 견적서에 안 나온다', !/인솔자/.test(D.getElementById('prevBox').textContent));
  /* 🔴 칸 순서 — 내용 → 각주 → 비고 (2026-09-28 대표 요청). DOM 순서로 잰다 */
  {
    const etc = find('기타사항');
    const order = etc ? Array.from(etc.querySelectorAll('textarea[data-dr], textarea[data-df], input[data-dn]'))
      .map((el) => el.dataset.dr !== undefined ? '내용' : el.dataset.df !== undefined ? '각주' : '비고') : [];
    const firstFoot = order.indexOf('각주'), lastBody = order.lastIndexOf('내용'), firstNote = order.indexOf('비고');
    ok('[5-c] 칸 순서가 내용 → 각주 → 비고다', firstFoot > lastBody && firstNote > firstFoot, order.join(' · '));
    const noteLabels = etc ? Array.from(etc.querySelectorAll('input[data-dn]')).map((el) => el.closest('label').textContent.trim()) : [];
    ok('[5-d] 줄이 둘이면 비고가 어느 줄 것인지 말한다', noteLabels.length === 2 && /1번째 줄/.test(noteLabels[0]) && /2번째 줄/.test(noteLabels[1]),
      noteLabels.join(' | '));
  }

  /* ═══ ⑥ 🔴 적으면 **견적서에 나온다** — 이게 진짜 그물이다 ═══════════════ */
  const type = (sec, j, text, note) => {
    if (!sec) return;
    const t = sec.querySelectorAll('textarea[data-dr]')[j];
    if (!t) return;   /* 줄이 없으면 적을 곳도 없다 — [2]·[3]이 이미 실패로 말한다 */
    t.value = text; t.dispatchEvent(new W.Event('input', { bubbles: true }));
    const n = sec.querySelectorAll('input[data-dn]')[j];
    if (note !== undefined && n) { n.value = note; n.dispatchEvent(new W.Event('input', { bubbles: true })); }
  };
  type(find('인솔자'), 0, '행사 담당 PM 1명 동행');
  type(find('기타사항'), 0, '쇼핑센터 방문', '방문 없음 (노쇼핑)');
  type(find('기타사항'), 1, '선택관광 제안', '제안 없음 (노옵션)');
  await sleep(10);
  const pv = D.getElementById('prevBox').textContent.replace(/\s+/g, ' ');
  ok('[6] 인솔자 행이 견적서에 나온다', /인솔자/.test(pv) && /행사 담당 PM 1명 동행/.test(pv));
  ok('[6-b] 기타사항 두 줄이 모두 나온다',
    /쇼핑센터 방문/.test(pv) && /선택관광 제안/.test(pv));
  ok('[6-c] 줄마다 다른 비고가 나온다', /노쇼핑/.test(pv) && /노옵션/.test(pv));

  /* ⑦ 항공 각주 — 적은 것만 나간다 */
  const air = find('항공');
  const foot = air && air.querySelector('textarea[data-df]');
  ok('[7] 항공 각주 칸에 표준 문구가 예시로 붙어 있다',
    !!foot && /FSC/.test(foot.placeholder) && /LCC/.test(foot.placeholder),
    foot ? foot.placeholder.slice(0, 40) : '각주 칸이 없다');
  if (foot) {
    foot.value = '※ LCC : 유료 서비스 포함 가능';
    foot.dispatchEvent(new W.Event('input', { bubbles: true }));
    await sleep(10);
  }
  ok('[7-b] 적은 각주가 견적서에 나온다', /유료 서비스 포함 가능/.test(D.getElementById('prevBox').textContent));
  /* 🔴 **각주는 항공만의 것이 아니다** — 기준 양식은 식사·여행자보험에도 파란 줄이 붙는다 */
  const mealFoot = find('식사') && find('식사').querySelector('textarea[data-df]');
  ok('[7-c] 식사에도 각주 칸이 있다', !!mealFoot,
    '식사 각주 칸이 없다 — 「※ 계약 체결 후 …」를 적을 자리가 없다');
  ok('[7-d] 식사 각주에 표준 문구가 예시로 붙어 있다',
    !!mealFoot && /계약 체결 후/.test(mealFoot.placeholder));
  if (mealFoot) {
    /* 식사 내용이 비면 항목째 빠지므로 내용도 함께 적는다 */
    type(find('식사'), 0, '조식은 호텔식');
    mealFoot.value = '※ 계약 체결 후 협의하에 변경 가능';
    mealFoot.dispatchEvent(new W.Event('input', { bubbles: true }));
    await sleep(10);
  }
  const detHtml = (D.querySelector('#prevBox .qd-det') || { innerHTML: '' }).innerHTML;
  ok('[7-e] 식사 각주가 파란 글씨로 나간다', /qd-foot[\s\S]{0,80}협의하에 변경 가능/.test(detHtml),
    '견적서에서 식사 각주를 못 찾음');

  /* ⑧ 작성일자 — 오늘로 박히지 않는다 */
  const iss = D.getElementById('dIssue');
  ok('[8] 작성일자 입력칸이 있다', !!iss);
  ok('[8-b] 기본값이 오늘이다', !!iss && !!iss.value);
  if (iss) {
    iss.value = '2026-09-01';
    iss.dispatchEvent(new W.Event('input', { bubbles: true }));
    await sleep(10);
  }
  ok('[8-c] 적은 작성일자가 견적서에 나온다',
    /2026-09-01/.test(D.getElementById('prevBox').textContent),
    '미리보기에서 못 찾음');

  /* ⑨ 🔴 원가·마진이 미리보기로 새지 않는다 (기존 방어선이 살아 있는지 함께 본다) */
  const pvAll = D.getElementById('prevBox').textContent;
  ok('[9] 미리보기에 원가·마진 낱말이 없다', !/원가|마진|공급가/.test(pvAll));

  /* ═══ ⑩ 🔴 원가 줄을 고치면 — 고객 가격에 반영 / 우리 마진에서 부담 (2026-09-28 대표 요청) ═══
     「부대비용을 올렸는데 왜 마진은 그대로냐」 — 기본(고객 가격에 반영)은 총액이 오르고 마진은 그대로다.
     「우리 마진에서 부담」이면 본사 수익이 같은 만큼 내려가 **총액은 그대로 · 마진만 준다.** */
  {
    D.querySelector('.step[data-step="2"]').click(); await sleep(30);
    const sumNum = (label) => {
      const box = Array.from(D.querySelectorAll('#sumBox > div')).find((d) => (d.querySelector('b') || {}).textContent === label);
      return box ? Number(box.querySelector('strong').textContent.replace(/[^\d-]/g, '')) : NaN;
    };
    const rowInput = (re) => Array.from(D.querySelectorAll('#moneyRows tr')).map((tr) => [tr.querySelector('.nm'), tr.querySelector('input[data-k]')])
      .find(([n, i]) => n && i && re.test(n.textContent)) || [];
    const [, anc] = rowInput(/부대비용/);
    ok('[10] 부대비용 줄이 있다 (검사 준비)', !!anc);
    if (anc) {
      const T0 = sumNum('최종 총액'), M0 = sumNum('마진'), base = Number(anc.value.replace(/[^\d-]/g, ''));
      const bump = (v) => { const [, a] = rowInput(/부대비용/); a.value = String(v); a.dispatchEvent(new W.Event('change', { bubbles: true })); };
      bump(base + 500000); await sleep(10);
      ok('[10-b] 기본(고객 가격에 반영): 총액 +50만 · 마진 그대로', sumNum('최종 총액') === T0 + 500000 && sumNum('마진') === M0,
        (sumNum('최종 총액') - T0) + ' / ' + (sumNum('마진') - M0));
      bump(base); await sleep(10);
      D.querySelector('input[name="absorb"][value="margin"]').checked = true;
      bump(base + 500000); await sleep(10);
      ok('[10-c] 🔴 우리 마진에서 부담: 총액 그대로 · 마진 −50만', sumNum('최종 총액') === T0 && sumNum('마진') === M0 - 500000,
        (sumNum('최종 총액') - T0) + ' / ' + (sumNum('마진') - M0));
      const [, hq] = rowInput(/본사/);
      ok('[10-d] 본사 수익 줄이 내려가 「수정됨」이 붙는다', !!hq && hq.closest('tr').classList.contains('edited'));
      ok('[10-e] 무엇을 옮겼는지 말한다', /본사 수익 −500,000 · 고객 총액 그대로/.test(D.getElementById('absorbMsg').textContent),
        D.getElementById('absorbMsg').textContent);
      bump(base); await sleep(10);
      ok('[10-f] 되돌리면 둘 다 원래대로', sumNum('최종 총액') === T0 && sumNum('마진') === M0);
    }
  }

  dom.window.close();
}

run().then(() => {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 내부직원용 견적서 — 상세 내용의 줄 · 빠지는 항목 (표준 양식 대조)');
  console.log('══════════════════════════════════════════════════════════════════');
  fails.forEach((f) => console.log(' ✗ ' + f));
  if (!fails.length) console.log(' ✓ 전부 통과');
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
}).catch((e) => {
  console.log('검사가 죽었습니다: ' + e.stack);
  process.exit(1);
});

/* QA 검증: 내부 견적 산출 도구(admin-quote.html)를 담당자가 실제로 쓸 수 있는가.
   jsdom으로 페이지를 띄워 **클릭해서** 확인한다 — 소스에 코드가 있는지가 아니라
   화면에 결과가 나오는지를 본다(코드만 봤을 때는 셋 다 "있으니 괜찮겠지"로 넘어간다).

   원래 결함 —
   ① **"다음 단계로 이동" 버튼이 죽은 것처럼 보였다.** 목적지를 안 고르고 누르면
      script.js가 `validateStep(1)` 실패 후 `[required]:invalid`에 focus()만 하고 끝나는데,
      이 페이지의 원본 <select>는 전부 `.aq-native-hidden`(opacity:0 · 1px)이라
      focus가 화면에 아무 흔적도 남기지 않는다. 단계는 안 넘어가고, 이유도 안 보인다.
      (공개 계산기(index.html)에서는 같은 코드가 멀쩡하다 — 거기선 select가 보인다.
       내부 도구가 그 select를 숨기면서 안내 경로가 통째로 끊긴 것이다.)
   ② **조건별 금액 비교를 하려면 견적 기록이 쌓였다.** 금액을 보는 유일한 방법이
      STEP2까지 다 채우고 "견적 산출하기"를 누르는 것이었고, 그 한 번마다 서버에
      견적이 한 건씩 저장된다. "20명이면 얼마?"를 세 번 물어보면 기록이 세 건 늘었다.
   ③ **산출이 끝나도 화면에 금액이 없었다.** 확인 카드에는 "견적 산출 완료!"라는
      문장과 다운로드 버튼뿐이라, 금액을 알려면 PDF를 열어야 했다.
   ④ "↩ 새 견적 다시 계산하기"는 **입력값을 지우지 않는다**(script.js resetBtn.onclick은
      setActiveStep(1)만 한다). 이름이 동작과 달라 담당자가 못 눌렀다.

   실행: node ai-loop/test_qA_staff_quote_flow.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* admin-quote.html을 실제 의존성과 함께 띄운다.
   ⚠ script.js는 <script src>를 인라인으로 치환하면 안 된다 — 내부에 견적서 팝업용
   HTML 템플릿이 있고 거기 리터럴 '</script>'가 들어 있어 스크립트가 그 자리에서
   잘린다. 그래서 다른 jsdom 테스트들과 같이 파싱 후 eval로 싣는다. */
function boot() {
  const calls = { quotePosts: 0, urls: [] };
  const dom = new JSDOM(read('admin-quote.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u, opt) => {
        calls.urls.push(String(u));
        if (String(u).includes('account?action=me')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '홍길동', role: 'staff' }) });
        }
        if (String(u).includes('/api/quotes')) {
          calls.quotePosts++;
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
        }
        return new Promise(() => {});
      };
      /* jsdom에 없는 브라우저 API — 없으면 예외가 나면서 뒤 코드가 안 돈다 */
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.Element.prototype.scrollIntoView = function () {};
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js');
  try { dom.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  return { dom, window: dom.window, doc: dom.window.document, calls };
}

const setDest = (window, doc, key) => {
  const sel = doc.getElementById('destination');
  sel.value = key;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
};

(async () => {
  const { window, doc, calls } = boot();
  await new Promise(r => setTimeout(r, 300));

  /* ── ① 미입력 안내 ─────────────────────────────────────────────── */
  console.log('[1] 목적지를 안 고르고 "다음 단계로 이동" (①)');
  const msgEl  = doc.getElementById('aqValidateMsg');
  const step2  = doc.querySelector('.estimate-step[data-step="2"]');
  ok('안내 자리가 페이지에 있다', !!msgEl);
  ok('처음에는 안내가 숨어 있다', msgEl.classList.contains('hidden'));
  ok('목적지가 비어 있는 상태다', doc.getElementById('destination').value === '');

  doc.getElementById('nextStepButton').click();
  ok('단계는 넘어가지 않는다(기존 동작 유지)', !step2.classList.contains('step-active'));
  ok('**이유가 화면에 뜬다** (예전엔 아무 반응이 없었다)', !msgEl.classList.contains('hidden'));
  ok('비어 있는 항목 이름을 사람이 읽는 말로 알려준다',
    msgEl.textContent.includes('여행 목적지'), JSON.stringify(msgEl.textContent));
  ok('눌러야 할 목적지 선택창이 실제로 열린다', doc.getElementById('destMaster').open === true);

  /* 라벨을 코드에 따로 적지 않고 필드에서 얻는지 — 목록 이중 관리(결함 생성기 ①) 방지 */
  const aqSrc = read('admin-quote.html');
  ok('라벨을 필드 자신(data-field-label)에서 얻는다', /data-field-label="여행 목적지"/.test(aqSrc));
  ok('id→이름 하드코딩 표가 없다', !/aqLabelMap|FIELD_LABELS\s*=/.test(aqSrc));

  /* ── 목적지를 고르면 안내가 사라지고 진행된다 ── */
  console.log('\n[2] 목적지 선택 후');
  setDest(window, doc, '파리');
  ok('조건이 바뀌면 안내가 사라진다', msgEl.classList.contains('hidden'));
  doc.getElementById('participants').value = '20';
  doc.getElementById('nextStepButton').click();
  ok('STEP 2로 넘어간다', step2.classList.contains('step-active'));

  /* ── ② 금액 미리보기: 계산은 하되 아무것도 저장하지 않는다 ─────── */
  console.log('\n[3] 금액 미리보기 (②)');
  doc.getElementById('backStepButton').click();
  const previewEl = doc.getElementById('aqPreview');
  const before = { posts: calls.quotePosts, ls: window.localStorage.getItem('linkedt_estimates_full') };
  doc.getElementById('aqPreviewBtn').click();
  const bd = window.getBreakdownData();
  ok('엔진이 금액을 계산했다', !!bd && bd.total > 0, String(bd && bd.total));
  ok('미리보기 패널이 열린다', !previewEl.classList.contains('hidden'));
  const totalStr = '₩ ' + Math.round(bd.total).toLocaleString('ko-KR');
  ok('총액이 화면에 그대로 보인다', previewEl.textContent.includes(totalStr), totalStr);
  ok('1인당 금액도 보인다',
    previewEl.textContent.includes('₩ ' + Math.round(bd.perPerson).toLocaleString('ko-KR')));
  ok('조건 요약(목적지·인원·기간)이 함께 보인다',
    previewEl.textContent.includes('파리') && previewEl.textContent.includes('20명'));
  ok('**서버에 아무것도 보내지 않는다**', calls.quotePosts === before.posts, String(calls.quotePosts));
  ok('**견적 기록(localStorage)도 늘지 않는다**',
    window.localStorage.getItem('linkedt_estimates_full') === before.ls);
  ok('저장되지 않는다는 사실이 화면에 적혀 있다', previewEl.textContent.includes('저장'));

  /* 내부 전용 행이 담당자에게는 보이되, 고객용이 아님이 구분되는가 */
  const mutedRows = bd.rows.filter(r => r.muted);
  ok('이 조건에 내부 전용 행이 존재한다(전제 확인)', mutedRows.length > 0, String(mutedRows.length));
  ok('내부 전용 행도 담당자에게는 보인다(마진 판단용)',
    mutedRows.every(r => previewEl.textContent.includes(r.name)),
    mutedRows.map(r => r.name).join(','));
  ok('그 행은 내부 표시로 구분된다', previewEl.querySelectorAll('tr.is-internal').length === mutedRows.length);

  /* 조건을 고치면 낡은 금액이 화면에 남지 않는다 */
  console.log('\n[4] 조건을 고치면 낡은 미리보기가 남지 않는가');
  doc.getElementById('participants').value = '40';
  doc.getElementById('participants').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('이전 조건의 금액이 화면에서 내려간다', previewEl.classList.contains('hidden'));

  /* ── ③ 산출 완료 후 금액 요약 ──────────────────────────────────── */
  console.log('\n[5] 견적 산출 완료 카드 (③)');
  doc.getElementById('nextStepButton').click();
  doc.getElementById('organization').value = '테스트기업';
  doc.getElementById('contactName').value = '김담당';
  /* WC: 연락처가 필수가 됐다 — 대장에서 담당자 부재 시 이어받는 데 쓴다.
     ⚠ 이 값은 견적서·링크에 안 실린다(payload 밖으로 간다). */
  doc.getElementById('contactTel').value = '010-1234-5678';
  doc.getElementById('requestDetails').value = '연수 문의';
  doc.getElementById('estimateForm').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 200));

  const confirmEl = doc.getElementById('estimateConfirm');
  const summaryEl = doc.getElementById('aqSummary');
  const bd2 = window.getBreakdownData();
  ok('확인 카드가 뜬다', !confirmEl.classList.contains('hidden'));
  ok('요약이 채워진다', !summaryEl.classList.contains('hidden'));
  ok('**총액이 화면에 보인다** (예전엔 PDF를 열어야 알 수 있었다)',
    summaryEl.textContent.includes('₩ ' + Math.round(bd2.total).toLocaleString('ko-KR')),
    String(bd2.total));
  ok('1인당 금액도 보인다',
    summaryEl.textContent.includes('₩ ' + Math.round(bd2.perPerson).toLocaleString('ko-KR')));
  ok('40명으로 고친 조건이 반영돼 있다', summaryEl.textContent.includes('40명'));
  ok('요약 복사 버튼이 있다', /요약 복사/.test(summaryEl.textContent));
  ok('이 건은 기록된다고 표시된다', summaryEl.textContent.includes('기록됨'));
  ok('견적은 서버로 전송된다(미리보기와 달리)', calls.quotePosts > 0, String(calls.quotePosts));
  ok('내부 전용 저장 경로를 쓴다(PX 유지)',
    calls.urls.some(u => u.includes('/api/quotes?action=internal')));

  /* ── ④ 버튼 이름이 실제 동작과 맞는가 ──────────────────────────── */
  console.log('\n[6] "다시 계산" 버튼 이름과 실제 동작 (④)');
  const scriptSrc = read('script.js');
  const resetBody = scriptSrc.slice(scriptSrc.indexOf('const resetBtn = document.getElementById'),
                                    scriptSrc.indexOf('/* 추적 */'));
  ok('전제: 이 버튼은 입력값을 지우지 않는다(reset()·value=\'\' 없음)',
    !/\.reset\(\)/.test(resetBody) && !/\.value\s*=\s*''/.test(resetBody));
  const resetBtn = doc.getElementById('resetEstimateBtn');
  ok('버튼 이름이 실제 동작(조건 수정)을 말한다', /조건 수정/.test(resetBtn.textContent), resetBtn.textContent.trim());
  ok('입력값이 유지된다는 점이 적혀 있다', /입력값 유지/.test(resetBtn.textContent));
  resetBtn.click();
  ok('눌렀을 때 STEP 1로 돌아간다',
    doc.querySelector('.estimate-step[data-step="1"]').classList.contains('step-active'));
  ok('입력값이 실제로 남아 있다',
    doc.getElementById('organization').value === '테스트기업'
    && doc.getElementById('participants').value === '40'
    && doc.getElementById('destination').value === '파리');

  /* ── 공개 계산기에 번지지 않았는가 ─────────────────────────────── */
  console.log('\n[7] 공개 계산기(index.html)는 영향받지 않는가');
  const indexSrc = read('index.html');
  for (const id of ['aqValidateMsg', 'aqPreview', 'aqSummary', 'aqPreviewBtn']) {
    ok(`견적 엔진(script.js)이 ${id}을 알지 못한다`, !scriptSrc.includes(id));
    ok(`공개 화면(index.html)에 ${id}이 없다`, !indexSrc.includes(id));
  }
  ok('공개 화면의 "새 견적" 버튼 이름은 그대로다',
    /새 견적 다시 계산하기/.test(indexSrc));

  /* ── 화면 폭 (RW) ─────────────────────────────────────────────────
     이 화면만 안쪽에서 폭이 한 번 더 잘려(1100px) 오른쪽이 크게 비어 있었다.
     관리자의 다른 탭은 `.dash-body`(96% · 최대 1680px)까지 쓴다.
     ⚠ 그렇다고 전부 늘리면 안 된다 — 문장을 쓰는 칸과 버튼까지 1,600px로 벌어지면
     폭이 넓어진 만큼 오히려 쓰기 어려워진다. **넓히는 것은 목록, 묶는 것은 문장**이다.
     실제 px는 `python ai-loop/check_quotetool_width.py`가 브라우저로 잰다. */
  console.log('\n[8] 화면 폭이 다른 탭과 같은 기준을 쓰는가 (RW)');
  const aqCss = read('admin-quote.html');
  ok('관리자 안에서는 카드 폭을 끝까지 쓴다',
    /\.aq-embedded \.aq-shell\s*\{[^}]*max-width:\s*none/.test(aqCss),
    '카드가 이미 폭을 정한다 — 안에서 또 자르면 오른쪽이 빈다');
  ok('예전 1100px 상한이 되살아나지 않았다',
    !/\.aq-shell\s*\{[^}]*max-width:\s*1100px/.test(aqCss), aqCss.slice(0, 0) || '');
  ok('단독으로 열어도 다른 탭과 같은 상한(1680px)이다',
    /\.aq-shell\s*\{[^}]*max-width:\s*1680px/.test(aqCss));
  ok('머리줄도 본문과 같은 폭이다',
    /\.aq-topbar-inner\s*\{[^}]*max-width:\s*1680px/.test(aqCss),
    '다르면 머리줄만 안쪽으로 들어가 보인다');
  /* 늘어나면 안 되는 칸들 — 하나라도 상한이 없어지면 그 칸이 화면 끝까지 벌어진다 */
  [['#organization', '고객사/기관명'], ['#requestDetails', '요청 사항'],
   ['#destSearch', '목적지 검색'], ['.date-block', '연수 날짜 블록'],
   ['.step-actions', '단계 이동 버튼']].forEach(([sel, name]) => {
    ok(name + '에 폭 상한이 있다',
      new RegExp('\\' + sel.replace('#', '#').replace('.', '.') + '[^{}]*\\{[^}]*max-width')
        .test(aqCss) || new RegExp(sel.replace(/[.#]/g, '\\$&') + '[\\s,][^{}]*\\{[^}]*max-width').test(aqCss),
      sel + '이 화면 끝까지 늘어나면 폭을 넓힌 것이 손해가 된다');
  });
  ok('브라우저 폭 검사 도구가 있다',
    fs.existsSync(path.join(ROOT, 'ai-loop', 'check_quotetool_width.py')),
    'jsdom은 폭을 계산하지 못한다 — 실제 px는 브라우저가 재야 한다');
  ok('README가 그 도구를 안내한다', /check_quotetool_width\.py/.test(read('README.md')),
    '문서에 없으면 아무도 안 돌린다');

  /* ── 러너가 이 파일을 실제로 집는가 (결함 생성기 ③) ────────────── */
  console.log('\n[8] 이 테스트가 회귀 스위트에 실제로 포함되는가');
  const runnerSrc = read(path.join('ai-loop', 'run_all_tests.js'));
  const m = runnerSrc.match(/\.filter\(f => \/(.+?)\/\.test\(f\)\)/);
  ok('러너의 파일 패턴을 찾았다', !!m, String(m && m[1]));
  ok('그 패턴이 이 파일(test_qA_…)을 집는다',
    !!m && new RegExp(m[1]).test('test_qA_staff_quote_flow.js'),
    'p로 시작하지 않는 테스트가 조용히 빠지면 안 된다');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

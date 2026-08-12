/* TG 검증 — 계약가 업데이트의 **입력 방식 선택**

   2026-08-12 사장님 지시 두 가지:
     ① 「직접입력을 뒤로 빼고, 기본으로 PDF 제출을 앞으로」
        — 실무자가 하는 일은 견적서를 올리는 것이다. 직접 입력은 문서가 없을 때의 예외다.
     ② 「출발일 들 선택하고 난 이후에 방식 버튼을 눌렀을 때 새로고침되는 현상 막아달라」

   ⚠ ②는 새로고침이 아니었다. `setPriceReportMode`가 방식을 바꿀 때 비우는 목록에
     **공통 칸(출발일·견적작성일·박수)까지 들어 있었다.** 위에서 날짜를 먼저 넣고
     방식 버튼을 누르면 그 값이 통째로 사라져 화면이 다시 그려진 것처럼 보였다.
     출발일은 시즌·리드타임 검증의 유일한 근거라(RZ 후속), 다시 넣게 만들면 결국
     비워 둔 채로 넘어가게 된다 — 조용히 데이터를 잃는 쪽이다.

   ⚠ **가격 칸은 계속 비워야 한다.** 한 방식의 입력이 다른 방식으로 섞이면 안 된다
     (PDF가 채운 값이 '직접 입력'으로 둔갑하면 출처가 거짓이 된다).

   실행: node ai-loop/test_tG_report_mode.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const src = read('admin.html');

  /* ── [0] 소스에서 확인할 것 — 초기 화면과 초기값이 어긋나면 안 된다 ────────── */
  console.log('[0] 기본값과 초기 화면이 같은 것을 가리키는가');
  ok('기본 방식이 PDF다', /let\s+priceReportMode\s*=\s*'pdf'/.test(src));
  /* ⚠ 버튼 순서는 화면 순서 그대로여야 한다 — 기본이 PDF인데 직접 입력이 앞에 있으면
     담당자는 앞의 것을 기본으로 읽는다. */
  ok('PDF 버튼이 직접 입력보다 앞에 있다',
    src.indexOf('id="pr-mode-pdf"') > 0 && src.indexOf('id="pr-mode-pdf"') < src.indexOf('id="pr-mode-manual"'),
    'pdf@' + src.indexOf('id="pr-mode-pdf"') + ' manual@' + src.indexOf('id="pr-mode-manual"'));
  /* 초기 HTML이 hidden이면 화면을 연 순간 PDF 칸이 접혀 보였다가 펴진다 */
  ok('PDF 칸이 처음부터 열려 있다', /id="pr-pdf-block"(?![^>]*\bclass="[^"]*hidden)/.test(src));

  /* ── jsdom으로 실제 화면을 띄워 본다 ──────────────────────────────────────── */
  const dom = new JSDOM(htmlWithDeps('admin.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true; w.alert = () => {};
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));

  const $ = (id) => doc.getElementById(id);

  console.log('\n[1] 화면을 열면 PDF 제출이 골라져 있는가');
  ok('PDF 버튼이 선택 상태다', /btn-primary/.test(($('pr-mode-pdf') || {}).className || ''),
    ($('pr-mode-pdf') || {}).className);
  ok('직접 입력 버튼은 선택 안 된 상태다', /btn-outline-p/.test(($('pr-mode-manual') || {}).className || ''),
    ($('pr-mode-manual') || {}).className);
  ok('PDF 업로드 칸이 보인다', $('pr-pdf-block') && !$('pr-pdf-block').classList.contains('hidden'));
  ok('안내 문구가 PDF 기준이다', /PDF에서 추출된 값/.test(($('pr-fields-label') || {}).textContent || ''),
    ($('pr-fields-label') || {}).textContent);

  /* ── [2] 사장님이 겪은 그대로 재현한다 ────────────────────────────────────
     출발일·견적작성일·박수를 먼저 넣고 → 방식 버튼을 누른다. */
  console.log('\n[2] 날짜를 먼저 넣고 방식을 바꿔도 남아 있는가 (2026-08-12 지적)');
  $('pr-depart').value = '2026-10-11';
  $('pr-quote-date').value = '2026-08-05';
  $('pr-nights').value = '4';
  /* 가격 칸에도 값을 넣어 둔다 — 이건 반대로 **지워져야** 한다 */
  $('pr-airfare').value = '320000';
  $('pr-hotel').value = '152000';

  win.setPriceReportMode('manual');

  ok('출발일이 남아 있다', $('pr-depart').value === '2026-10-11', $('pr-depart').value);
  ok('견적 작성일이 남아 있다', $('pr-quote-date').value === '2026-08-05', $('pr-quote-date').value);
  ok('박 수가 남아 있다', $('pr-nights').value === '4', $('pr-nights').value);
  /* ⚠ 이게 핵심이다 — 위 셋 중 하나라도 비면 담당자 눈에는 새로고침으로 보인다 */
  ok('세 칸이 **한꺼번에** 살아 있다 (하나라도 비면 새로고침으로 보인다)',
    $('pr-depart').value && $('pr-quote-date').value && $('pr-nights').value);

  console.log('\n[3] 가격 칸은 그래도 비워지는가 (방식이 섞이면 출처가 거짓이 된다)');
  ok('항공료가 비워졌다', $('pr-airfare').value === '', $('pr-airfare').value);
  ok('호텔단가가 비워졌다', $('pr-hotel').value === '', $('pr-hotel').value);
  ok('직접 입력 모드로 바뀌었다', /btn-primary/.test($('pr-mode-manual').className));
  ok('PDF 칸이 접혔다', $('pr-pdf-block').classList.contains('hidden'));
  ok('안내 문구가 직접 입력 기준으로 바뀌었다', /직접 입력할 값/.test($('pr-fields-label').textContent),
    $('pr-fields-label').textContent);

  console.log('\n[4] 되돌아와도 마찬가지인가');
  $('pr-airfare').value = '999999';
  win.setPriceReportMode('pdf');
  ok('PDF로 돌아와도 출발일이 남아 있다', $('pr-depart').value === '2026-10-11', $('pr-depart').value);
  ok('PDF로 돌아오면 가격 칸은 다시 비워진다', $('pr-airfare').value === '');
  ok('같은 방식을 다시 눌러도 값이 안 지워진다', (() => {
    $('pr-airfare').value = '320000';
    win.setPriceReportMode('pdf');            /* 이미 pdf다 — 아무것도 지우면 안 된다 */
    return $('pr-airfare').value === '320000';
  })(), $('pr-airfare').value);

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

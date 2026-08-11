/* SW 검증 — 담당자가 **그 자리에서 확정**한다 (실무자가 직접 올리는 흐름)

   왜 (2026-08-11 대표 방침) — 앞으로 실무자가 견적서를 직접 올린다. 그러면 오류를
   사장님이 뒤에서 잡는 게 아니라 **문서를 손에 든 사람이 그 자리에서 확정**해야 한다.

   ⚠ 칸은 예전부터 편집 가능했는데(RN에서 잠갔다가 품) **입력을 듣는 곳이 없었다.**
     담당자가 숫자를 그냥 치면:
       · 배지가 「견적서」로 남아 다음 사람이 AI가 읽은 값으로 믿고
       · 근거 줄이 옛 계산식을 그대로 보여주며(화면이 거짓말을 한다)
       · 타당성 검토(SO)가 새 값에 안 돌아 오타 방어가 사라졌다
     후보 목록으로 고를 때만 막히고 **타이핑은 안 막혔다.** 이 테스트가 그 구멍을 지킨다.

   ⚠ 식비·관광비는 「1인 1일」·「1인 전 일정」인데 견적서엔 **총액만** 있다. 화면이 식을
     보여주기만 해서 담당자가 암산해야 했다 — 계산 도우미가 그걸 없앤다.

   ⚠ **어떻게 나온 값인지(how)를 저장한다.** 비워 두면 나중에 근거를 잃는다.

   실행: node ai-loop/test_sW_confirm_field.js  (프로젝트 루트에서) */
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

/* 추출 결과 — 뉴퍼스트 다낭 모양(식비가 3일로 계산돼 있다. 실제로는 4일이 맞다) */
const EXTRACT = {
  kind: { label: '단가표가 있는 견적서' }, rowCount: 20, pax: 26,
  values: { airfare: 700000, hotel: 224750, meal: 77649, vehicle: 797500, sight: 139722 },
  evidence: {
    airfare: { via: 'rule', label: '항공', calc: '700,000 × 19 × 1 = 13,300,000', rowIdx: 3 },
    hotel: { via: 'rule', label: '호텔', calc: '224,750 × 26 × 3 = 17,530,500', rowIdx: 5 },
    meal: { via: 'calc', label: '식사 4줄', calc: '식사 총액 6,056,650 ÷ 인원 26 ÷ 3일 = 77,649', dayCount: 3, rowIdxs: [7, 8] },
    vehicle: { via: 'unchecked', label: '차량', calc: '797,500 — 수량·횟수가 없어 검산되지 않았습니다' },
    sight: { via: 'calc', label: '관광 3줄', calc: '관광 총액 3,632,782 ÷ 인원 26 = 139,722' },
  },
  candidates: [], groups: [], warnings: [],
  reconciliation: { total: 2, passed: 2, checks: [] },
  blockCount: 1, selectedBlock: 0, blocks: [], dates: {}, itinerary: null,
};

(async () => {
  /* ── [1] 저장 자리와 서버 규칙 ──────────────────────────────────────── */
  console.log('[1] 칸별 출처를 저장하는가');
  const mig = read('ai-loop/db_migrate.js');
  ok('마이그레이션이 additive다',
    /alter table actual_price_reports add column if not exists manual_fields jsonb/.test(mig));
  ok('왜 행 단위 source로는 부족한지 적혀 있다', /9칸 중 3칸만/.test(mig));

  const api = read('api/quotes.js');
  ok('제출이 manualFields를 받는다', /manualFields/.test(api));
  ok('모르는 항목 키는 **거절**한다 (조용히 버리지 않는다)',
    /invalid_manual_fields/.test(api) && /MANUAL_FIELD_KEYS\.indexOf\(k\) < 0/.test(api));
  ok('작성자는 클라이언트 값을 믿지 않고 세션 표시명을 쓴다', /by: safeAuthor/.test(api));
  ok('저장 컬럼에 들어간다', /manual_fields, author, source\)/.test(api));
  ok('조회가 manualFields를 내려준다', /manualFields: \(r\.manual_fields/.test(api));

  /* ── [2] 화면 (jsdom) ───────────────────────────────────────────────── */
  console.log('\n[2] 직접 치면 화면이 따라오는가');
  let posted = null;
  const adminHtml = (function () {
    const html = htmlWithDeps('admin.html');
    const EXPOSE = '\n;try{window.__setUser=u=>{currentUser=u};'
      + 'window.__manual=()=>PR_MANUAL_FIELDS;window.__setReports=v=>{priceReportsCache=v};}catch(e){}\n';
    let injected = false;
    return html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
      if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  })();
  const dom = new JSDOM(adminHtml, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (u, opt) => {
        const s = String(u);
        if (s.includes('action=priceReport') && opt && opt.method === 'POST') {
          posted = JSON.parse(opt.body);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        if (s.includes('action=priceReports')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        return new Promise(() => {});
      };
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.Element.prototype.scrollTo = function () {};
      w.confirm = () => true; w.alert = () => {};
    },
  });
  const win = dom.window; const doc = win.document;
  await new Promise((r) => setTimeout(r, 250));
  win.__setUser({ id: 1, role: 'admin', displayName: '김실무' });
  win.__setReports([]);

  /* 안내 문구가 「직접 넣어도 된다」를 말하는가 — 실무자에겐 이 한 줄이 사용법이다 */
  win.setPriceReportMode('pdf');
  ok('화면이 직접 넣어도 된다고 말한다',
    /직접 넣으면 됩니다/.test(doc.getElementById('pr-fields-label').textContent),
    doc.getElementById('pr-fields-label').textContent);
  ok('칸이 잠겨 있지 않다', doc.getElementById('pr-meal').readOnly === false);

  doc.getElementById('pr-dest').innerHTML = '<option value="다낭">다낭</option>';
  doc.getElementById('pr-dest').value = '다낭';
  win.renderPdfEvidence(EXTRACT);

  const airInput = doc.getElementById('pr-airfare');
  airInput.value = '700000';
  const box = () => doc.getElementById('pr-ev-airfare');
  ok('처음에는 추출값 배지다', /via-rule/.test(box().className), box().className);

  /* ⚠ 이게 이 커밋의 핵심 — 타이핑이 잡히는가 */
  airInput.value = '650000';
  airInput.dispatchEvent(new win.Event('change'));
  ok('**직접 치면 「담당자 확정」으로 바뀐다**', /via-confirmed/.test(box().className), box().className);
  ok('근거 줄이 옛 계산식을 계속 보여주지 않는다',
    !/700,000 × 19/.test(box().textContent), box().textContent.slice(0, 80));
  ok('원래 추출값을 남긴다 (되돌릴 수 있어야 손대는 게 무섭지 않다)',
    /추출값은 700,000원이었습니다/.test(box().textContent));
  ok('되돌리기 버튼이 있다',
    !!Array.from(box().querySelectorAll('button')).find((b) => b.textContent === '되돌리기'));
  ok('확정한 칸이 기록된다', !!win.__manual().airfare, JSON.stringify(win.__manual()));

  /* 값을 되돌리면 추출 상태로 돌아간다 */
  const rev = Array.from(box().querySelectorAll('button')).find((b) => b.textContent === '되돌리기');
  rev.dispatchEvent(new win.Event('click'));
  ok('되돌리면 값이 원래대로', doc.getElementById('pr-airfare').value === '700000');

  /* 값을 안 바꾸고 포커스만 옮긴 것은 확정이 아니다 */
  const hotelInput = doc.getElementById('pr-hotel');
  hotelInput.dispatchEvent(new win.Event('change'));
  ok('값이 그대로면 확정으로 보지 않는다', !win.__manual().hotel, JSON.stringify(win.__manual()));

  /* ── [3] 식비 계산 도우미 ───────────────────────────────────────────── */
  console.log('\n[3] 식비·관광비 계산 도우미');
  win.renderPdfEvidence(EXTRACT);
  const mealBox = doc.getElementById('pr-ev-meal');
  const inputs = Array.from(mealBox.querySelectorAll('input[type=number]'));
  ok('총액·인원·일수 세 칸이 열린다', inputs.length === 3, String(inputs.length));
  ok('인원이 추출값으로 미리 채워진다', inputs[1].value === '26', inputs[1].value);
  ok('일수도 추출값으로 미리 채워진다 (보통 이 칸만 고치면 된다)', inputs[2].value === '3', inputs[2].value);

  /* 담당자가 「일수는 3일이 아니라 4일이다」를 고친다 */
  inputs[0].value = '6056650'; inputs[1].value = '26'; inputs[2].value = '4';
  const goBtn = Array.from(mealBox.querySelectorAll('button')).find((b) => b.textContent === '넣기');
  ok('넣기 버튼이 있다', !!goBtn);
  goBtn.dispatchEvent(new win.Event('click'));
  ok('1인 1일이 계산돼 들어간다 (6,056,650 ÷ 26 ÷ 4 = 58,237)',
    doc.getElementById('pr-meal').value === '58237', doc.getElementById('pr-meal').value);
  ok('담당자 확정으로 바뀐다', /via-confirmed/.test(doc.getElementById('pr-ev-meal').className));
  ok('**어떻게 나온 값인지 그대로 남는다**',
    /÷ 인원 26 ÷ 4일/.test(win.__manual().meal.how), win.__manual().meal.how);

  /* 관광비는 일수가 없다 — 1인당 전 일정이다 */
  const sightBox = doc.getElementById('pr-ev-sight');
  const sInputs = Array.from(sightBox.querySelectorAll('input[type=number]'));
  ok('관광비는 총액·인원 두 칸만 연다 (전 일정 값이라 일수가 없다)', sInputs.length === 2, String(sInputs.length));

  /* ── [4] 확정한 값이 제출에 실려 가는가 ─────────────────────────────── */
  console.log('\n[4] 제출');
  doc.getElementById('pr-hotel-name').value = '노보텔';
  await win.submitPriceReport();
  ok('제출이 나갔다', !!posted);
  ok('확정한 칸만 manualFields로 간다',
    posted && posted.manualFields && posted.manualFields.meal && !posted.manualFields.hotel,
    posted && JSON.stringify(Object.keys(posted.manualFields || {})));
  ok('근거(how)가 함께 간다', posted && /÷ 인원 26 ÷ 4일/.test(posted.manualFields.meal.how));
  ok('식비 값이 담당자가 고친 값으로 간다', posted && posted.mealUnit === 58237, posted && posted.mealUnit);

  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

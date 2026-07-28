/* PF 검증: 새 계수(PB 보험·PC 관광일수)가 ① 역검증 스냅샷에 저장되고 ② 관리자 계수
   기여도 패널에 표시되는지. 계수를 엔진에만 넣고 이 두 경로를 빠뜨리면, 나중에 계수를
   조정했을 때 "이 견적이 당시 어떤 배율을 썼는지" 복원할 수 없고(스냅샷),
   내부 검토자는 계수 일부만 보고 판단하게 된다(패널).
   실행: node ai-loop/test_pF_snapshot_panel.js  (프로젝트 루트에서) */
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
  /* ── A. 저장 경로: script.js가 스냅샷에 새 계수를 싣는가 ───────────────── */
  console.log('[1] 역검증 스냅샷(P6)에 새 계수 포함');
  const scriptSrc = read('script.js');
  const snapBlock = scriptSrc.slice(scriptSrc.indexOf('P6: 계수 역검증용 스냅샷'));
  const snapEnd = snapBlock.indexOf("status: 'new'");
  const snap = snapBlock.slice(0, snapEnd);
  for (const [field, why] of [
    ['seasonFactor', '시즌(P2)'], ['leadFactor', '리드타임(P2)'], ['peakFactor', '피크(P2)'],
    ['hotelPeakFactor', '호텔피크(P7)'], ['fxAdjust', '환율(P3)'], ['coef', '노브(P2b)'],
    ['insuranceInfo', '보험 권역·기간(PB)'], ['sightDuration', '관광 일수(PC)'],
  ]) {
    ok(`스냅샷에 ${field} (${why})`, new RegExp(`${field}\\s*:`).test(snap));
  }

  /* ── B. 실제 계산 결과가 스냅샷 필드에 들어갈 값을 갖고 있는가 ─────────── */
  console.log('\n[2] 엔진이 해당 값을 실제로 내보내는가');
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
  doc.getElementById('destination').value = '파리';
  doc.getElementById('participants').value = '20';
  doc.getElementById('days').value = '7';
  doc.getElementById('startDate').value = '2027-05-10';
  ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id => { const e = doc.getElementById(id); if (e) e.checked = true; });
  const bd = window.getBreakdownData();
  ok('insuranceInfo에 zoneFactor 숫자', typeof bd.insuranceInfo?.zoneFactor === 'number', JSON.stringify(bd.insuranceInfo));
  ok('insuranceInfo에 durationFactor 숫자', typeof bd.insuranceInfo?.durationFactor === 'number');
  ok('insuranceInfo에 rate 숫자', typeof bd.insuranceInfo?.rate === 'number');
  ok('sightDuration에 factor 숫자', typeof bd.sightDuration?.factor === 'number', JSON.stringify(bd.sightDuration));
  ok('파리 7일 관광 일수계수 = 1.3', bd.sightDuration.factor === 1.3);

  /* ── C. 표시 경로: 관리자 패널이 새 계수를 렌더하는가 ──────────────────── */
  console.log('\n[3] 관리자 계수 기여도 패널(P12) 렌더');
  const adminSrc = read('admin.html');
  /* 패널 함수는 바로 위의 COEF_VOL_CAP·COEF_DEFAULTS에 의존하므로 그 선언부터 함께 뜬다 */
  const fnStart = adminSrc.indexOf('const COEF_VOL_CAP');
  const fnSrc = adminSrc.slice(fnStart, adminSrc.indexOf('\n  }', adminSrc.indexOf('function coefContribHtml')) + 4);
  ok('패널 함수 추출 성공', fnSrc.length > 500 && fnSrc.includes('function coefContribHtml'));

  /* 함수만 떼어 실행 — esc()는 패널이 쓰는 유일한 외부 의존이라 최소 스텁으로 대체 */
  const mkPanel = new Function('esc', fnSrc + '; return coefContribHtml;')(s => String(s));
  const baseSnap = {
    seasonFactor: 1.15, leadFactor: 1.0, peakFactor: 1.0, departureFactor: 1.0,
    bizFactor: 1.0, fxAdjust: 0.98, hotelPeakFactor: 1.0, combinedFactor: 1.0, paxFactor: 1.0,
    seasonId: 'peak', peakLabel: '',
  };
  const withNew = {
    ...baseSnap,
    insuranceInfo: { zone: 'highCost', zoneFactor: 1.8, durationFactor: 1.2, rate: 38880, zoneLabel: '미주·유럽', durationLabel: '6~7일' },
    sightDuration: { factor: 1.3, label: '6~7일' },
  };
  const htmlNew = mkPanel(withNew);
  ok('보험 행 렌더됨', /보험/.test(htmlNew));
  ok('보험 권역 배율 1.800 표시', /1\.800/.test(htmlNew), '');
  ok('보험 권역 라벨(미주·유럽) 표시', /미주·유럽/.test(htmlNew));
  ok('보험 1인 요율 38,880원 표시', /38,880/.test(htmlNew));
  ok('관광 행 렌더됨 + 일수 배율 1.300', /관광/.test(htmlNew) && /1\.300/.test(htmlNew));
  ok('보험이 환율 무관임을 명시', /원가 기반이라 시즌·리드·피크·환율 무관/.test(htmlNew));
  ok('낡은 문구("식사·관광은 인원 볼륨") 제거됨', !/식사·관광은 인원 볼륨/.test(htmlNew));

  console.log('\n[4] 구버전 견적 하위호환 — 새 필드 없는 스냅샷도 깨지지 않음');
  const htmlOld = mkPanel(baseSnap);
  ok('구버전 스냅샷도 렌더 성공(예외 없음)', typeof htmlOld === 'string' && htmlOld.length > 100);
  ok('구버전엔 보험 행 미표시(없는 값을 지어내지 않음)', !/원가 기반이라/.test(htmlOld));
  ok('구버전엔 관광 행 미표시', !/인원 볼륨 할인은 단가에 이미 반영/.test(htmlOld));
  ok('구버전도 항공·호텔 행은 정상 표시', /항공/.test(htmlOld) && /호텔/.test(htmlOld));
  const htmlNoSnap = mkPanel({});
  ok('스냅샷 자체가 없으면 안내 문구', /계수 기여도 정보가 없습니다/.test(htmlNoSnap));

  console.log('\n[5] 부분 결손 방어 — 필드가 반쪽만 있어도 안 깨짐');
  ok('insuranceInfo가 빈 객체여도 렌더', typeof mkPanel({ ...baseSnap, insuranceInfo: {} }) === 'string');
  ok('sightDuration에 factor 없어도 렌더', typeof mkPanel({ ...baseSnap, sightDuration: { label: 'x' } }) === 'string');
  ok('insuranceInfo가 null이어도 렌더', typeof mkPanel({ ...baseSnap, insuranceInfo: null }) === 'string');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

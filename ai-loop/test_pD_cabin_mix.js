/* PD 검증: 좌석 등급 '혼합'(임원만 비즈니스) 항공료 가중평균 계산.
   ① 양 끝단 일치 — bizCount=0은 전원 이코노미와, bizCount=총원은 전원 비즈니스와 동일
   ② 기존 economy/business 경로는 완전 무회귀
   ③ bizCount는 객실 vipCount와 독립(서로 간섭 없음), 총원 초과 입력 방어
   ④ 유류할증료는 좌석 등급과 무관(비즈 배율 미적용) 유지
   실행: node ai-loop/test_pD_cabin_mix.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__COEF=COEF_STATE;window.__gbf=getBizFactor;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise(r => setTimeout(r, 100));
  const doc = window.document;
  const gbd = window.getBreakdownData, COEF = window.__COEF, getBizFactor = window.__gbf;
  if (typeof gbd !== 'function') { console.log('✗ 로드 실패'); process.exit(1); }
  const reset = () => { COEF.seasonStrength=1; COEF.leadTimeStrength=1; COEF.peakStrength=1; COEF.hotelPeakWeight=0.8; };
  const air = bd => bd.rows.find(r => r.name === '항공').amount;
  const fuel = bd => bd.rows.find(r => r.name === '유류할증료').amount;
  const setCabin = v => { doc.querySelectorAll('input[name="cabinClass"]').forEach(r => { r.checked = (r.value === v); }); };
  const setRoom  = v => { doc.querySelectorAll('input[name="roomConfig"]').forEach(r => { r.checked = (r.value === v); }); };
  const setForm = (dest, pax, cabin, bizN = 0, days = 5) => {
    doc.getElementById('destination').value = dest;
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = String(days);
    doc.getElementById('startDate').value = '2027-05-10';
    ['incHotel','incMeal','incVehicle','incGuide','incSightseeing'].forEach(id=>{const e=doc.getElementById(id);if(e)e.checked=true;});
    setCabin(cabin);
    doc.getElementById('bizCount').value = String(bizN);
    return gbd();
  };
  reset();

  console.log('[0] UI 요소 존재 — 혼합 옵션과 전용 입력칸');
  const mixedRadio = doc.querySelector('input[name="cabinClass"][value="mixed"]');
  ok('좌석 등급에 mixed 라디오 존재', !!mixedRadio);
  ok('bizCount 입력칸 존재', !!doc.getElementById('bizCount'));
  ok('bizCountRow 존재', !!doc.getElementById('bizCountRow'));
  ok('bizCountRow는 기본 hidden(혼합 선택 전)', doc.getElementById('bizCountRow').classList.contains('hidden'));
  ok('bizCount와 vipCount는 서로 다른 요소(재사용 아님)',
     doc.getElementById('bizCount') !== doc.getElementById('vipCount'));

  console.log('[1] 회귀 — 기존 economy / business 경로 불변');
  const eco = setForm('파리', 20, 'economy');
  const biz = setForm('파리', 20, 'business');
  ok('이코노미 bizFactor = 1.0', eco.bizFactor === 1.0, String(eco.bizFactor));
  ok('비즈니스 bizFactor = 노선 배율', biz.bizFactor === getBizFactor('파리'), String(biz.bizFactor));
  ok('비즈니스 항공료 > 이코노미', air(biz) > air(eco));
  ok('이코노미 라벨', eco.cabinClassLabel === '이코노미', eco.cabinClassLabel);
  ok('비즈니스 라벨', biz.cabinClassLabel === '비즈니스', biz.cabinClassLabel);
  ok('economy에서 bizCount는 0으로 무시', setForm('파리', 20, 'economy', 7).bizCount === 0);
  ok('economy에 bizCount 넣어도 항공료 불변', air(setForm('파리', 20, 'economy', 7)) === air(eco));

  console.log('[2] 양 끝단 일치 — 혼합이 기존 두 경로를 정확히 포함');
  const mix0  = setForm('파리', 20, 'mixed', 0);
  const mixAll= setForm('파리', 20, 'mixed', 20);
  ok('bizCount=0 → 전원 이코노미와 항공료 동일', air(mix0) === air(eco), `${air(mix0)} vs ${air(eco)}`);
  ok('bizCount=0 → bizFactor 정확히 1.0', mix0.bizFactor === 1.0);
  ok('bizCount=총원 → 전원 비즈니스와 항공료 동일', air(mixAll) === air(biz), `${air(mixAll)} vs ${air(biz)}`);
  ok('bizCount=총원 → bizFactor = 노선 배율', approx(mixAll.bizFactor, getBizFactor('파리')));

  console.log('[3] 가중평균 정확성 — 여러 목적지·인원 조합');
  for (const [dest, pax, bizN] of [['파리',20,2],['도쿄',30,3],['방콕',50,5],['뉴욕',15,4],['몽골',10,1]]) {
    const bd = setForm(dest, pax, 'mixed', bizN);
    const bsf = getBizFactor(dest);
    const expect = (bizN * bsf + (pax - bizN)) / pax;
    ok(`${dest} ${pax}명 중 ${bizN}명 비즈 → bizFactor ${expect.toFixed(4)}`,
       approx(bd.bizFactor, expect), String(bd.bizFactor));
    ok(`  └ bizSeatFactor는 노선 원 배율(${bsf}) 보존`, bd.bizSeatFactor === bsf, String(bd.bizSeatFactor));
  }

  console.log('[4] 단조성 — 비즈니스 인원이 늘수록 항공료 증가');
  let mono = true, prev = -1, at = '';
  for (let n = 0; n <= 20; n++) {
    const a = air(setForm('파리', 20, 'mixed', n));
    if (a < prev) { mono = false; at = `bizCount ${n}에서 감소`; }
    prev = a;
  }
  ok('bizCount 0~20 항공료 non-decreasing', mono, at);
  ok('중간값(2명)은 전원이코노미와 전원비즈 사이',
     air(setForm('파리',20,'mixed',2)) > air(eco) && air(setForm('파리',20,'mixed',2)) < air(biz));

  console.log('[5] 유류할증료는 좌석 등급 무관(기존 설계 유지)');
  ok('혼합 유류 = 이코노미 유류', fuel(setForm('파리',20,'mixed',5)) === fuel(eco));
  ok('전원비즈 유류 = 이코노미 유류', fuel(biz) === fuel(eco));

  console.log('[6] 객실(vipCount)과 완전 독립 — 상호 간섭 없음');
  setRoom('double');
  const mixDouble = setForm('파리', 20, 'mixed', 3);
  ok('객실 2인1실이어도 좌석 혼합 동작(vipCount 미사용)', mixDouble.bizCount === 3 && mixDouble.bizFactor > 1);
  const roomsDouble = mixDouble.rooms;
  setRoom('mixed');
  doc.getElementById('vipCount').value = '4';
  const mixMixed = setForm('파리', 20, 'mixed', 3);
  ok('vipCount(4)를 바꿔도 bizCount는 3 그대로', mixMixed.bizCount === 3 && mixMixed.vipCount === 4);
  ok('vipCount는 객실 수에만 영향', mixMixed.rooms !== roomsDouble);
  ok('vipCount 변경이 항공료를 바꾸지 않음', air(mixMixed) === air(mixDouble));
  doc.getElementById('vipCount').value = '0';
  setRoom('double');

  console.log('[7] 이상 입력 방어');
  ok('bizCount > 총원 → 총원으로 클램프', setForm('파리', 10, 'mixed', 999).bizCount === 10);
  ok('클램프 시 전원 비즈니스와 동일', air(setForm('파리', 10, 'mixed', 999)) === air(setForm('파리', 10, 'business')));
  ok('음수 → 0', setForm('파리', 10, 'mixed', -5).bizCount === 0);
  ok('빈 문자열 → 0', (() => { const b = setForm('파리',10,'mixed',0); doc.getElementById('bizCount').value=''; return gbd().bizCount === 0; })());

  console.log('[8] 라벨 — 혼합 구성이 견적서에 드러남');
  const lbl = setForm('파리', 20, 'mixed', 3).cabinClassLabel;
  ok('혼합 라벨에 비즈/이코노미 인원 표기', /비즈니스 3명/.test(lbl) && /이코노미 17명/.test(lbl), lbl);

  console.log('[9] 다른 항목 무영향 — 좌석은 항공에만');
  const m = setForm('파리', 20, 'mixed', 5);
  ok('호텔 단가 동일', m.rows.find(r=>/호텔/.test(r.name)).unit === eco.rows.find(r=>/호텔/.test(r.name)).unit);
  ok('식사 단가 동일', m.rows.find(r=>r.name==='식사').unit === eco.rows.find(r=>r.name==='식사').unit);
  ok('관광 총액 동일', m.rows.find(r=>r.name==='관광').amount === eco.rows.find(r=>r.name==='관광').amount);
  ok('보험 단가 동일', m.rows.find(r=>/여행자보험/.test(r.name)).unit === eco.rows.find(r=>/여행자보험/.test(r.name)).unit);

  console.log('[10] 실제 상호작용 — 라디오 change 이벤트로 입력칸이 열리고 닫히는가');
  /* 존재만 확인하면 이벤트 배선 누락을 놓친다. 실제 사용자가 하는 것과 같은
     change 이벤트를 발생시켜 hidden 토글과 라이브 재계산이 도는지 본다. */
  const bizRow = doc.getElementById('bizCountRow');
  const fire = v => {
    setCabin(v);
    doc.querySelector(`input[name="cabinClass"][value="${v}"]`)
       .dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  fire('mixed');
  ok('혼합 선택 → 입력칸 노출(hidden 해제)', !bizRow.classList.contains('hidden'));
  fire('economy');
  ok('이코노미로 되돌리면 다시 숨김', bizRow.classList.contains('hidden'));
  fire('business');
  ok('비즈니스에서도 숨김 유지', bizRow.classList.contains('hidden'));
  fire('mixed');
  ok('다시 혼합 → 재노출', !bizRow.classList.contains('hidden'));
  /* 객실 라디오를 건드려도 좌석 입력칸은 영향받지 않아야(두 행이 독립) */
  const vipRow = doc.getElementById('vipCountRow');
  doc.querySelector('input[name="roomConfig"][value="mixed"]')?.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('객실 혼합 선택이 좌석 입력칸을 닫지 않음', !bizRow.classList.contains('hidden'));
  ok('객실 혼합 선택 시 vipCountRow는 별도로 열림', vipRow && !vipRow.classList.contains('hidden'));
  doc.querySelector('input[name="roomConfig"][value="double"]')?.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('객실 2인1실 복귀 시 vipCountRow만 닫힘', vipRow.classList.contains('hidden') && !bizRow.classList.contains('hidden'));
  fire('economy');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('테스트 실행 오류:', e); process.exit(1); });

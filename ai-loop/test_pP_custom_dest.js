/* PP 검증: 관리자가 추가한 커스텀 목적지가 '내장 목적지와 같은 대접'을 받는가.

   배경 — 커스텀 목적지는 /api/rates GET으로 내려와 script.js가 런타임에 편입한다.
   그런데 편입 대상 목록을 하나라도 빠뜨리면 **그 목적지만 조용히 다르게 계산된다.**
   실제로 INSURANCE_ZONES가 빠져 있었다: getInsuranceZone이 어디에서도 못 찾아
   보험 권역 계수를 1.00(중립)으로 폴백했다. 권역별 계수가 0.85~1.80이라 최대 80%
   어긋나는데, 콘솔 경고만 남고 화면에는 아무 표시가 없었다.

   ⚠ 이 검사는 '데이터'가 아니라 '연결'을 본다 — 커스텀 목적지가 0건이어도
   코드 경로가 끊기면 잡아야 하므로 원문 대조와 실제 주입 시뮬레이션을 함께 쓴다.
   실행: node ai-loop/test_pP_custom_dest.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const scriptSrc = read('script.js');
const ratesSrc = read(path.join('api', 'rates.js'));
const adminSrc = read('admin.html');
const migrateSrc = read(path.join('ai-loop', 'db_migrate.js'));

console.log('[1] 보험 권역이 세 곳에 모두 연결됐는가 (하나만 빠져도 조용히 틀어진다)');
ok('DB 컬럼 존재', /alter table custom_destinations add column if not exists insurance_zone/.test(migrateSrc));
ok('생성 시 저장한다', /insurance_zone\n\s*\) values \(/.test(ratesSrc) || /region, insurance_zone/.test(ratesSrc));
ok('생성 API가 값을 검증한다', /INSURANCE_ZONE_KEYS\.has\(body\.insuranceZone\)/.test(ratesSrc));
ok('GET이 값을 내려보낸다', /insurance_zone: r\.insurance_zone \|\| 'asiaMid'/.test(ratesSrc));
ok('엔진이 INSURANCE_ZONES에 편입한다', /INSURANCE_ZONES\[insZone\]\.push\(row\.destination_key\)/.test(scriptSrc));
ok('관리자 폼에 입력칸이 있다', /id="new-dest-insurance"/.test(adminSrc));
ok('폼이 값을 실어 보낸다', /insuranceZone: document\.getElementById\('new-dest-insurance'\)\.value/.test(adminSrc));

console.log('\n[2] 서버 허용 키와 엔진 권역 키가 일치하는가');
const serverKeys = (ratesSrc.match(/const INSURANCE_ZONE_KEYS = new Set\(\[([^\]]+)\]\)/) || [])[1] || '';
const serverSet = serverKeys.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
const engineBlock = (scriptSrc.match(/const INSURANCE_ZONES = \{[\s\S]*?\n\};/) || [''])[0];
const engineSet = [...engineBlock.matchAll(/^\s{2}(\w+):\s*\[/gm)].map((m) => m[1]).sort();
ok('서버 키 목록을 읽었다', serverSet.length > 0, serverSet.join(','));
ok('엔진 권역 목록을 읽었다', engineSet.length > 0, engineSet.join(','));
ok('두 목록이 정확히 일치', JSON.stringify(serverSet) === JSON.stringify(engineSet),
  `서버 [${serverSet}] vs 엔진 [${engineSet}]`);
/* 관리자 폼의 선택지도 같아야 한다 — 폼에만 있는 값을 고르면 서버가 400을 준다. */
const formOpts = [...adminSrc.matchAll(/<select id="new-dest-insurance"[\s\S]*?<\/select>/g)]
  .flatMap((m) => [...m[0].matchAll(/<option value="(\w+)"/g)].map((x) => x[1])).sort();
ok('관리자 폼 선택지도 같다', JSON.stringify(formOpts) === JSON.stringify(engineSet),
  `폼 [${formOpts}]`);

console.log('\n[3] 실제 주입 시뮬레이션 — 커스텀 목적지가 보험 계수를 제대로 받는가');
(async () => {
  const EXPOSE = '\n;try{window.__IZ=INSURANCE_ZONES;window.__giz=getInsuranceZone;'
    + 'window.__gii=getInsuranceInfo;window.__DR=destinationRates;window.__BZ=BIZ_ZONES;}catch(e){}';
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
  await new Promise((r) => setTimeout(r, 150));
  const IZ = window.__IZ, giz = window.__giz, gii = window.__gii;
  if (!IZ || typeof giz !== 'function') { console.log('  ✗ 엔진 로드 실패'); process.exit(1); }

  /* applyRateOverrides의 편입 로직을 그대로 재현한다(fetch를 막아둬 실제 호출은 안 됨).
     ⚠ 이 블록이 script.js의 실제 코드와 어긋나면 테스트가 거짓 안심을 준다 —
     그래서 [1]에서 원문 대조를 함께 한다. */
  const inject = (key, insurance_zone) => {
    const insZone = IZ[insurance_zone] ? insurance_zone : 'asiaMid';
    if (!IZ[insZone].includes(key)) IZ[insZone].push(key);
  };

  inject('테스트괌', 'highCost');
  ok('지정한 권역에 편입된다', giz('테스트괌') === 'highCost', String(giz('테스트괌')));
  const infoHigh = gii('테스트괌', 5);
  ok('보험 계수가 중립(1.00)이 아니다', infoHigh && infoHigh.zoneFactor !== 1.0,
    infoHigh ? `zoneFactor ${infoHigh.zoneFactor}` : 'null');

  inject('테스트미지정', 'nonsense');
  ok('모르는 키는 기준 권역으로 떨어진다', giz('테스트미지정') === 'asiaMid');
  const infoMid = gii('테스트미지정', 5);
  ok('기준 권역은 계수 1.00 (옛 폴백과 같은 동작)', infoMid && infoMid.zoneFactor === 1.0,
    infoMid ? String(infoMid.zoneFactor) : 'null');

  /* 편입하지 않은 목적지는 여전히 못 찾는다 = 이 연결이 실제로 필요하다는 증거 */
  ok('편입 안 하면 못 찾는다(폴백 경로 확인)', giz('테스트미편입') === null);

  console.log('\n[4] 다른 목록도 여전히 연결돼 있는가 (회귀)');
  ok('BIZ_ZONES 편입 코드 존재', /BIZ_ZONES\[zone\]\.push\(row\.destination_key\)/.test(scriptSrc));
  ok('남반구 목록 편입 코드 존재', /SOUTHERN_HEMISPHERE_DESTS\.push\(row\.destination_key\)/.test(scriptSrc));
  ok('목적지 select 주입 코드 존재', /injectDestinationOption\(row\.destination_key/.test(scriptSrc));
  ok('내장 목적지를 덮어쓰지 않는다', /destinationRates\.some\(\(d\) => d\.destination_key === row\.destination_key\)\) return/.test(scriptSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

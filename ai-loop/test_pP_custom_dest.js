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
/* ⚠ 예전엔 `region, insurance_zone`처럼 **바로 앞 컬럼 이름까지** 박아뒀다. RY에서 그
   사이에 country가 들어가자 실제로는 멀쩡한데 이 단언만 깨졌다 — 검사하려는 건
   "INSERT 컬럼 목록에 insurance_zone이 있는가"이지 이웃이 누구인가가 아니다. */
ok('생성 시 저장한다', /insert into custom_destinations \([^)]*\binsurance_zone\b/.test(ratesSrc));
ok('생성 API가 값을 검증한다', /INSURANCE_ZONE_KEYS\.has\(body\.insuranceZone\)/.test(ratesSrc));
ok('GET이 값을 내려보낸다', /insurance_zone: r\.insurance_zone \|\| 'asiaMid'/.test(ratesSrc));
ok('엔진이 INSURANCE_ZONES에 편입한다', /INSURANCE_ZONES\[insZone\]\.push\(row\.destination_key\)/.test(scriptSrc));
ok('관리자 폼에 입력칸이 있다', /id="new-dest-insurance"/.test(adminSrc));
ok('폼이 값을 실어 보낸다', /insuranceZone: document\.getElementById\('new-dest-insurance'\)\.value/.test(adminSrc));

console.log('\n[2] 서버 허용 키와 엔진 권역 키가 일치하는가');
const serverKeys = (ratesSrc.match(/const INSURANCE_ZONE_KEYS = new Set\(\[([^\]]+)\]\)/) || [])[1] || '';
const serverSet = serverKeys.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
/* PY: 엔진의 권역 목록은 더 이상 리터럴이 아니라 destGroupsBy에 넘기는 구간명 배열이다
   (목적지 소속은 data.js DEST_CLASSIFY에서 파생). 구간명 자체는 여전히 서버 허용 키·
   관리자 폼 선택지와 맞아야 하므로 이 세 곳 대조는 그대로 의미가 있다. */
const engineCall = (scriptSrc.match(/destGroupsBy\('ins',\s*\[([^\]]*)\]\)/) || [])[1] || '';
const engineSet = engineCall.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
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
    + 'window.__gii=getInsuranceInfo;window.__DR=destinationRates;window.__BZ=BIZ_ZONES;'
    + 'window.__SP=DEST_SEASON_PROFILES;window.__gsi=getSeasonInfo;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
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

  console.log('\n[4] 시즌 프로파일이 모든 경로에 연결됐는가 (PQ)');
  /* 보험 권역과 같은 유형이지만 폴백이 '중립'이 아니라 '다른 계절'이라 더 크게 어긋난다:
     동남아를 추가하고 7월에 출발하면 공용표 1.20 vs 동남아 우기 0.88. */
  ok('DB 컬럼 존재', /alter table custom_destinations add column if not exists season_profile/.test(migrateSrc));
  ok('생성 시 저장한다', /insurance_zone, season_profile/.test(ratesSrc) && /\$\{seasonProfile\}/.test(ratesSrc));
  ok('생성 API가 값을 검증한다', /SEASON_PROFILE_KEYS\.has\(body\.seasonProfile\)/.test(ratesSrc));
  ok('허용 목록을 data.js에서 가져온다(중복 정의 금지)',
    /SEASON_PROFILE_KEYS = new Set\(\s*\(destinationRates\.DEST_SEASON_PROFILES/.test(ratesSrc));
  ok('GET이 값을 내려보낸다', /season_profile: r\.season_profile \|\| null/.test(ratesSrc));
  ok('엔진이 프로파일 keys에 편입한다', /prof\.keys\.push\(row\.destination_key\)/.test(scriptSrc));
  ok('관리자 폼에 입력칸이 있다', /id="new-dest-season-profile"/.test(adminSrc));
  ok('폼 선택지를 DEST_SEASON_PROFILES로 만든다', /DEST_SEASON_PROFILES\.filter\(p => p\.id\)\.forEach/.test(adminSrc));
  ok('폼이 값을 실어 보낸다', /seasonProfile,/.test(adminSrc));
  ok('season_profile이 요율 필드로 새지 않는다(destructure에서 제외)',
    /const \{ zone, southern_hemisphere, insurance_zone, season_profile, \.\.\.destFields \} = row;/.test(scriptSrc));

  console.log('\n[5] 모든 프로파일에 id·name이 있는가 (하나만 빠지면 그 권역을 고를 수 없다)');
  const profs = window.__SP;
  ok('DEST_SEASON_PROFILES를 읽었다', Array.isArray(profs) && profs.length > 0, String(profs && profs.length));
  const missing = (profs || []).filter((p) => !p.id || !p.name).map((p) => (p.keys || []).join('/'));
  ok('id·name 누락 없음', missing.length === 0, missing.join(' | '));
  const ids = (profs || []).map((p) => p.id);
  ok('id 중복 없음', new Set(ids).size === ids.length, ids.join(','));

  console.log('\n[6] 실제 주입 시뮬레이션 — 커스텀 목적지가 권역 시즌표를 받는가');
  const gsi = window.__gsi;
  if (typeof gsi !== 'function') {
    ok('getSeasonInfo 로드', false, 'getSeasonInfo를 못 찾음');
  } else {
    /* script.js의 편입 로직을 그대로 재현한다([4]에서 원문 대조를 함께 하는 이유). */
    const injectSeason = (key, id) => {
      const prof = profs.find((p) => p.id === id);
      if (prof && !prof.keys.includes(key)) prof.keys.push(key);
    };
    /* 편입 전 = 공용표. 7월은 공용표 성수기(1.20)라 동남아 실제 계수와 부호가 반대다. */
    const before = gsi('2026-07-15', '테스트세부');
    ok('편입 전에는 공용표 성수기(1.20)로 계산된다', before && before.factor === 1.20,
      before ? `${before.id} ${before.factor}` : 'null');
    injectSeason('테스트세부', 'seasia');
    const after = gsi('2026-07-15', '테스트세부');
    ok('편입 후 동남아 우기 비수기(0.88)로 바뀐다', after && after.factor === 0.88,
      after ? `${after.id} ${after.factor}` : 'null');
    ok('두 계수 차이가 36%다 (이 연결이 필요한 이유)',
      Math.abs((1.20 / 0.88) - 1.3636) < 0.001, String(1.20 / 0.88));
    /* 건기(1월)에는 반대로 공용표보다 낮다 — 단순 가감산이 아니라 달력 자체가 다르다. */
    const dry = gsi('2027-01-15', '테스트세부');
    ok('건기 1월은 동남아 성수기 1.15 (공용표는 1.20)', dry && dry.factor === 1.15,
      dry ? String(dry.factor) : 'null');
    /* 프로파일을 안 고른 목적지는 종전 폴백 그대로 — 마이그레이션만으로 금액이 안 튄다. */
    const none = gsi('2026-07-15', '테스트미지정');
    ok('프로파일 없으면 공용표 폴백(옛 동작 유지)', none && none.factor === 1.20,
      none ? String(none.factor) : 'null');
    /* 모르는 id는 서버가 400으로 막지만, 뚫려도 엔진은 폴백으로 안전하게 떨어져야 한다. */
    injectSeason('테스트헛소리', 'nonsense');
    const bogus = gsi('2026-07-15', '테스트헛소리');
    ok('모르는 id도 폴백으로 안전하게 떨어진다', bogus && bogus.factor === 1.20,
      bogus ? String(bogus.factor) : 'null');
  }

  console.log('\n[7] 다른 목록도 여전히 연결돼 있는가 (회귀)');
  ok('BIZ_ZONES 편입 코드 존재', /BIZ_ZONES\[zone\]\.push\(row\.destination_key\)/.test(scriptSrc));
  ok('남반구 목록 편입 코드 존재', /SOUTHERN_HEMISPHERE_DESTS\.push\(row\.destination_key\)/.test(scriptSrc));
  ok('목적지 select 주입 코드 존재', /injectDestinationOption\(row\.destination_key/.test(scriptSrc));
  ok('내장 목적지를 덮어쓰지 않는다', /destinationRates\.some\(\(d\) => d\.destination_key === row\.destination_key\)\) return/.test(scriptSrc));

  /* ── [8] 종단 검증 — 위 [3]·[6]은 편입 로직을 '재현'한 것이라 실제 코드가 바뀌면
     거짓 안심을 줄 수 있다. 여기서는 fetch를 가짜 /api/rates 응답으로 바꿔
     applyRateOverrides가 실제로 돌게 만든 뒤 결과만 본다. 순서 의존(오버라이드가
     커스텀 목적지보다 먼저 적용되면 편집분이 사라지는 문제)도 여기서 잡힌다. */
  console.log('\n[8] 종단 검증 — 실제 /api/rates 응답으로 applyRateOverrides를 돌린다');
  const PAYLOAD = {
    overrides: { 테스트세부e2e: { airfare: 777000 } },
    fxRates: {}, fxBaseline: {}, coefficients: {},
    customDestinations: [{
      destination_key: '테스트세부e2e', label: '테스트세부e2e',
      zone: 'mid', southern_hemisphere: false,
      airfare: 500000, fuel_surcharge: 280000, hotel_per_room: 200000, meal_per_person: 20000,
      vehicle_large: 250000, vehicle_small: 120000, guide_fee: 220000,
      sightseeing_fee: 60000, margin_per_traveler: 150000,
      rateDate: '2026-07', notes: '', season_note: '',
      currency: 'PHP', region: '동남아',
      insurance_zone: 'asiaShort', season_profile: 'seasia',
    }],
  };
  const dom2 = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = (url) => (String(url).includes('/api/rates')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(PAYLOAD) })
        : new Promise(() => {}));
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  try { dom2.window.eval(APP); } catch (e) { console.log('  [eval warn]', e.message); }
  await new Promise((r) => setTimeout(r, 300));
  const w2 = dom2.window;
  const e2eSeason = w2.__gsi ? w2.__gsi('2026-07-15', '테스트세부e2e') : null;
  ok('커스텀 목적지가 요율표에 편입됐다',
    !!(w2.__DR || []).find((d) => d.destination_key === '테스트세부e2e'));
  ok('시즌이 동남아 우기 비수기(0.88)로 계산된다', e2eSeason && e2eSeason.factor === 0.88,
    e2eSeason ? `${e2eSeason.id} ${e2eSeason.factor}` : 'null');
  ok('보험 권역도 함께 편입됐다', w2.__giz && w2.__giz('테스트세부e2e') === 'asiaShort',
    String(w2.__giz && w2.__giz('테스트세부e2e')));
  const e2eRow = (w2.__DR || []).find((d) => d.destination_key === '테스트세부e2e');
  ok('요율 오버라이드가 커스텀 목적지에도 적용됐다(순서 의존 회귀)',
    e2eRow && e2eRow.airfare === 777000, e2eRow ? String(e2eRow.airfare) : 'null');
  ok('season_profile이 요율 행에 섞여 들어가지 않았다',
    e2eRow && e2eRow.season_profile === undefined, e2eRow ? String(e2eRow.season_profile) : 'null');

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();

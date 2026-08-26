/* 목적지 메타데이터 교차 정합성 감사 — 읽기 전용.
   실행: node ai-loop/audit_consistency.js  (프로젝트 루트에서)

   audit_rates.js가 '값이 타당한가'(도메인 판단 필요)를 본다면, 이쪽은
   '목록끼리 앞뒤가 맞는가'(객관적 사실)만 본다. 여기서 걸리는 건 취향 문제가 아니라
   전부 오류다 — 한 목록에만 등록하고 다른 목록을 빠뜨리면 견적이 조용히 틀어진다.

   검사 대상 목록:
     data.js  destinationRates       (요율 원본 — 기준)
     data.js  DEST_CLASSIFY          (분류의 단일 진실 — 좌석·보험·지역·통화·시즌·반구)
     index.html <select id=destination>  (고객이 고를 수 있는 목록 — 아직 별도 관리)
     ↓ 아래 넷은 PY부터 DEST_CLASSIFY에서 '파생'된다. 그래도 파생 결과를 실제로 만들어
       대조한다 — 파생 호출 자체가 사라지거나 구간명이 어긋나면 여기서 잡혀야 한다.
     script.js BIZ_ZONES             (비즈니스 좌석 배율 구간)
     script.js INSURANCE_ZONES       (여행자보험 권역)
     admin.html REGION_MAP           (관리자 그룹핑·지역별 일괄조정 기준)
     dest_currency.js DEST_CURRENCY  (환율 보정 통화)
     data.js DEST_SEASON_PROFILES    (권역별 시즌 달력)

   PQ: 관리자가 추가한 목적지(custom_destinations)도 검사 대상에 넣었다. 전에는 정적값만
   봤기 때문에, 매니저가 목적지를 하나 추가하면 그 목적지는 감사기 시야 밖에 있었다.
   ⚠ 커스텀 목적지를 위 정적 목록들과 대조하면 안 된다 — 정적 목록에 없는 것이 정상이고
   (런타임에 script.js·admin.html이 DB 값으로 편입한다) 그렇게 짜면 목적지를 추가하는
   순간 '오류 6건'이 뜬다. 그래서 커스텀 목적지는 **DB 행의 분류값이 채워져 있는가**를
   따로 본다: 값이 비면 편입할 것이 없어 엔진이 조용히 폴백하기 때문. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const grab = (src, re, name) => {
  const m = src.match(re);
  if (!m) throw new Error(`${name} 파싱 실패 — 원본 형태가 바뀐 것 같습니다. 감사기를 고치세요.`);
  return m[0];
};

const scriptSrc = read('script.js'), adminSrc = read('admin.html'), idxSrc = read('index.html');

/* PY: data.js를 실제 모듈로 불러 파생 결과를 그대로 본다(예전엔 소스에서 리터럴을
   정규식으로 긁었는데, 이제 목록이 리터럴이 아니라 분류표에서 파생되므로 그 방식은
   맞지도 않고 파생 과정에서 생긴 문제를 못 본다). */
const DATA = require('../data');
const s = { DR: DATA, SP: DATA.DEST_SEASON_PROFILES || null };
/* KEYS는 '정적 목록끼리의 대조' 기준이라 반드시 정적값만 담는다(커스텀 목적지를 넣으면
   모든 정적 목록에서 누락으로 잡힌다 — 위 ⚠ 참고). 커스텀 목적지는 아래 전용 절에서 본다. */
const KEYS = s.DR.map(d => d.destination_key);

/* 운영 실판매가·커스텀 목적지 로드 (PQ). 기본이 라이브이고 --static으로 정적 강제.
   실패 시 정적으로 내려가되 그 사실을 화면에 찍는다(live_rates.js가 처리). */
const { loadRatesForAudit } = require('./live_rates');
const { rates: LIVE_RATES, live: IS_LIVE } = loadRatesForAudit(s.DR);
const CUSTOM = LIVE_RATES.filter(d => d.__custom);

/* 좌석·보험 구간 목록은 script.js가 destGroupsBy에 넘기는 '구간명 배열'로 정해진다.
   그 배열을 소스에서 그대로 떼어내 같은 함수에 먹인다 — 여기에 구간명을 다시 적으면
   그것 자체가 이 리팩터가 없애려는 이중 관리가 된다. 구간명이 script.js에서 빠지면
   (예: 'evac'를 지우면) 그 권역 목적지들이 편입되지 않고 아래 검사에 잡힌다. */
const deriveGroups = (re, name) =>
  new Function('destGroupsBy', 'return ' + grab(scriptSrc, re, name))(DATA.destGroupsBy);
const BIZ_ZONES = deriveGroups(/destGroupsBy\('zone',\s*\[[^\]]*\]\)/, 'BIZ_ZONES 파생 호출');
/* 🔴 **보험 권역 이름 목록은 이제 data.js가 갖는다**(XQ) — 서버(api/rates.js)와 엔진이
   같은 것을 읽는다. 그래서 여기서도 소스에서 리터럴을 떼어내지 않고 그 값을 그대로 쓴다.
   ⚠ 다만 **엔진이 정말 그 목록을 쓰는지**는 확인한다. 안 그러면 이 감사기는 data.js만
     혼자 보고 「일치」라고 말하게 된다 — 대조하는 척하는 검사가 된다(결함 생성기 ③). */
grab(scriptSrc, /destGroupsBy\('ins',\s*INSURANCE_ZONE_IDS\)/, 'INSURANCE_ZONES 파생 호출');
const INS_ZONES = DATA.destGroupsBy('ins', DATA.INSURANCE_ZONE_IDS || []);
/* admin.html·dest_currency.js도 같은 분류표에서 파생한다. 통화는 실제 모듈을 그대로
   불러 파생 경로(브라우저/Node 분기 포함)가 살아 있는지까지 확인한다. */
grab(adminSrc, /const REGION_MAP = destFieldMap\('region'\);/, 'REGION_MAP 파생 호출');
const REGION_MAP = DATA.destFieldMap('region');
const DEST_CURRENCY = require('../dest_currency');

/* index.html의 목적지 select 옵션 값 */
const selBlock = grab(idxSrc, /<select id="destination"[\s\S]*?<\/select>/, 'destination select');
const SELECT_KEYS = [...selBlock.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]).filter(v => v && v !== '');

/* errors = 확실히 깨진 것(exit 1로 알림). notes = 사람이 봐야 판단되는 것.
   둘을 섞으면 "오류 0건"이 의미를 잃는다 — 러너·CI가 믿을 수 있게 분리한다. */
const errors = [];
const notes  = [];
const err  = (cat, msg) => errors.push({ cat, msg });
const note = (cat, msg) => notes.push({ cat, msg });

const cmp = (name, listKeys) => {
  const missing = KEYS.filter(k => !listKeys.includes(k));
  const extra   = listKeys.filter(k => !KEYS.includes(k));
  console.log(`  ${name.padEnd(22)} ${String(listKeys.length).padStart(3)}개  `
    + (missing.length || extra.length ? `누락 ${missing.length} · 유령 ${extra.length}` : '완전 일치'));
  if (missing.length) err(name, `요율표에 있으나 ${name}에 없음: ${missing.join(', ')}`);
  if (extra.length)   err(name, `${name}에 있으나 요율표에 없음: ${extra.join(', ')}`);
};

console.log(`■ 목록 간 커버리지 (정적 요율표 기준 ${KEYS.length}개`
  + (CUSTOM.length ? ` · 커스텀 ${CUSTOM.length}개는 아래 전용 절에서 검사` : '') + ')');
/* PY 이전에는 네 목록을 따로 대조했다. 이제 넷 다 DEST_CLASSIFY에서 파생되므로
   "요율표에 있는데 어느 목록에 없다"는 사태는 **분류표에 행이 없다** 하나로 수렴한다.
   그래서 네 줄을 늘어놓는 대신 분류표 커버리지 한 줄로 본다 — 넷을 그대로 두면
   같은 원인으로 항상 함께 실패해 '검사 4개'라는 착시만 준다.
   반대로 index.html select는 여전히 손으로 적는 별도 목록이라 따로 대조한다. */
cmp('index.html select', SELECT_KEYS);
cmp('DEST_CLASSIFY', Object.keys(DATA.DEST_CLASSIFY));
/* 파생 결과도 실제로 확인한다 — 분류표에 행은 있는데 구간명이 오타면 커버리지는
   통과하고 파생 목록에서만 빠진다(그 경우 아래 DEST_CLASSIFY_ISSUES에도 잡힌다). */
cmp('BIZ_ZONES(파생)', Object.values(BIZ_ZONES).flat());
cmp('INSURANCE_ZONES(파생)', Object.values(INS_ZONES).flat());
cmp('REGION_MAP(파생)', Object.keys(REGION_MAP));
cmp('DEST_CURRENCY(파생)', Object.keys(DEST_CURRENCY));

/* 분류표 파생 중 버려진 값 — 구간명 오타, 빈 값, 존재하지 않는 시즌 프로파일.
   ⚠ 여기가 비어 있지 않다는 건 '어떤 목적지가 조용히 폴백 중'이라는 뜻이다.
   중복 등록 검사는 없앴다 — 목적지 하나가 축마다 값을 하나씩만 가지므로 두 구간에
   동시에 들어가는 것 자체가 불가능해졌고, 절대 실패할 수 없는 검사는 '통과'라는
   말로 사람을 안심시키기만 한다(이 저장소가 여러 번 당한 유형). */
console.log('\n■ 분류표 파생 이상 (DEST_CLASSIFY_ISSUES)');
if (DATA.DEST_CLASSIFY_ISSUES.length) {
  DATA.DEST_CLASSIFY_ISSUES.forEach(m => err('분류표', m));
  console.log(`  ${DATA.DEST_CLASSIFY_ISSUES.length}건`);
} else {
  console.log('  없음');
}

/* 지리 분류가 서로 모순되는지 — REGION_MAP(관리자 그룹) vs 보험/좌석 권역.
   이름 자체가 지리를 말하는 그룹인데 다른 목록에서는 전혀 다른 대륙 취급이면 오류다. */
console.log('\n■ 분류 모순 — REGION_MAP 그룹명과 다른 목록의 권역이 어긋나는 목적지');
const insZoneOf = k => Object.keys(INS_ZONES).find(z => INS_ZONES[z].includes(k));
/* REGION_MAP 그룹명 → 그 그룹이 실제로 어느 보험권역이어야 하는지의 기대값 */
const REGION_EXPECT = {
  '국내': 'domestic',
  '유럽': 'highCost', '북미': 'highCost',
  '일본': 'asiaShort', '중국': 'asiaShort', '홍콩·마카오': 'asiaShort',
  '동남아': 'asiaMid',
};
for (const [k, reg] of Object.entries(REGION_MAP)) {
  if (!KEYS.includes(k)) continue;
  const expect = REGION_EXPECT[reg];
  const actual = insZoneOf(k);
  if (expect && actual && expect !== actual) {
    err('분류모순', `${k}: REGION_MAP '${reg}'인데 INSURANCE_ZONES는 '${actual}'(기대 '${expect}')`);
  }
}
/* 그룹 안에서 혼자 다른 보험권역을 쓰는 목적지.
   ⚠ 이건 '오류'가 아니라 '참고'다 — 그룹명이 애초에 잡동사니 묶음이면(예 '몽골·대만')
   구성원이 서로 다른 권역인 게 정상이다. 위의 REGION_EXPECT 검사와 달리 그룹명이
   지리를 단언하지 않으므로 자동으로 틀렸다고 말할 수 없다. */
const groups = {};
for (const k of KEYS) (groups[REGION_MAP[k]] ||= []).push(k);
for (const [reg, list] of Object.entries(groups)) {
  if (list.length < 3) continue;
  const counts = {};
  list.forEach(k => { const z = insZoneOf(k); counts[z] = (counts[z] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[sorted.length - 1][1] === 1) {
    const oddZone = sorted[sorted.length - 1][0];
    const odd = list.filter(k => insZoneOf(k) === oddZone);
    note('그룹구성', `REGION_MAP '${reg}' 그룹(${list.length}곳) 중 ${odd.join(', ')}만 보험권역이 '${oddZone}' — 나머지는 '${sorted[0][0]}'`);
  }
}
console.log(`  오류 ${errors.filter(e => e.cat === '분류모순').length}건 · 참고 ${notes.length}건`);

/* 시즌 프로파일 커버리지 — 미등록이면 공용표로 폴백(동작은 하나 목적지 특성 미반영) */
if (s.SP) {
  console.log('\n■ 시즌 프로파일(DEST_SEASON_PROFILES) 커버리지');
  const covered = s.SP.flatMap(p => p.keys);
  const dupSeason = covered.filter((k, i) => covered.indexOf(k) !== i);
  const uncovered = KEYS.filter(k => !covered.includes(k));
  const ghost = covered.filter(k => !KEYS.includes(k));
  console.log(`  등록 ${covered.length} · 미등록(공용표 폴백) ${uncovered.length} · 유령 ${ghost.length} · 중복 ${dupSeason.length}`);
  if (uncovered.length) console.log(`  미등록: ${uncovered.join(', ')}`);
  if (ghost.length)    err('시즌프로파일', `요율표에 없는 키가 등록됨: ${[...new Set(ghost)].join(', ')}`);
  if (dupSeason.length) err('시즌프로파일', `여러 프로파일에 중복 등록(먼저 매칭되는 쪽이 이김): ${[...new Set(dupSeason)].join(', ')}`);
}

/* ── 커스텀 목적지 런타임 분류값 (PQ) ────────────────────────────────
   내장 목적지는 분류가 코드에 박혀 있어 위 대조로 잡히지만, 커스텀 목적지의 분류는
   DB 행에 들어 있고 런타임에 편입된다. 값이 비면 편입할 게 없어 엔진이 폴백하는데
   화면에는 아무 표시가 없다 — 여기가 그 유일한 감시 지점이다. */
console.log('\n■ 커스텀 목적지 런타임 분류값');
const SEASON_IDS = (s.SP || []).map(p => p.id).filter(Boolean);
/* REGION_MAP 그룹 → 그 그룹이 써야 할 시즌 프로파일. 그룹 하나에 프로파일이 둘인 곳은
   둘 다 허용한다('몽골·대만'은 계절이 정반대라 한 프로파일로 묶을 수 없고,
   '오세아니아·태평양'은 괌·사이판과 남반구가 섞여 있다). */
const REGION_SEASON_EXPECT = {
  '일본': ['japan'], '홍콩·마카오': ['hkmo'], '중국': ['china'], '동남아': ['seasia'],
  '유럽': ['europe'], '북미': ['northAmerica'], '중앙아시아': ['centralAsia'],
  '몽골·대만': ['mongolia', 'taiwan'], '오세아니아·태평양': ['guamSaipan', 'southern'],
};
if (!IS_LIVE) {
  console.log('  건너뜀 — 정적 모드에서는 커스텀 목적지를 알 수 없습니다(라이브로 다시 돌리세요).');
} else if (!CUSTOM.length) {
  console.log('  커스텀 목적지 0건 (검사할 것 없음)');
} else {
  console.log(`  커스텀 목적지 ${CUSTOM.length}건 — 정적 목록 대조에서는 제외됨(런타임 편입 대상)`);
  for (const d of CUSTOM) {
    const k = d.destination_key;
    /* 좌석 구간 — 없으면 BIZ_ZONES에 편입되지 않아 비즈니스석 배율이 안 붙는다. */
    if (!Object.keys(BIZ_ZONES).includes(d.__zone)) {
      err('커스텀목적지', `${k}: 좌석 구간(zone)이 '${d.__zone}' — BIZ_ZONES 키(${Object.keys(BIZ_ZONES).join('/')})가 아니라 편입되지 않음`);
    }
    /* 보험 권역 — 모르는 키면 엔진이 asiaMid(1.00)로 폴백해 저장값이 무의미해진다. */
    if (!Object.keys(INS_ZONES).includes(d.insurance_zone)) {
      err('커스텀목적지', `${k}: 보험 권역이 '${d.insurance_zone}' — INSURANCE_ZONES에 없어 계수 1.00(중립)으로 폴백됨`);
    }
    /* 시즌 프로파일 — 폴백이 '중립'이 아니라 '다른 계절'이라 부호까지 반대일 수 있다. */
    if (!d.season_profile) {
      const expect = REGION_SEASON_EXPECT[d.region];
      const msg = `${k}: 시즌 프로파일 미지정 — 공용표(7·8·12·1월 성수기)로 계산됨`;
      if (expect) err('커스텀목적지', `${msg}. 지역이 '${d.region}'이므로 '${expect.join(' 또는 ')}'가 맞습니다`);
      else note('커스텀목적지', `${msg}. 지역 분류도 없어 어느 프로파일이 맞는지 판단 불가 — 담당자 확인 필요`);
    } else if (!SEASON_IDS.includes(d.season_profile)) {
      err('커스텀목적지', `${k}: 시즌 프로파일 '${d.season_profile}'이 DEST_SEASON_PROFILES에 없어 공용표로 폴백됨`);
    } else {
      const expect = REGION_SEASON_EXPECT[d.region];
      if (expect && !expect.includes(d.season_profile)) {
        err('커스텀목적지', `${k}: 지역은 '${d.region}'인데 시즌 프로파일은 '${d.season_profile}'(기대 '${expect.join(' 또는 ')}') — 성수기 달력이 어긋남`);
      }
    }
    /* 지역·통화는 비어도 '의도적으로 안 씀'이 가능하므로 참고로만 (내장 동유럽도 한때 통화가 없었다). */
    if (!d.region) note('커스텀목적지', `${k}: 지역 분류 없음 — 요율 일괄조정에서 '기타'로 빠져 조용히 누락됨`);
    if (!d.currency) note('커스텀목적지', `${k}: 현지 통화 없음 — 환율 보정이 항상 1.0(내장 목적지와 동작이 갈림)`);
    const insExpect = REGION_EXPECT[d.region];
    if (insExpect && d.insurance_zone && insExpect !== d.insurance_zone) {
      err('커스텀목적지', `${k}: 지역은 '${d.region}'인데 보험 권역은 '${d.insurance_zone}'(기대 '${insExpect}')`);
    }
    console.log(`  · ${k} — zone ${d.__zone} · 보험 ${d.insurance_zone} · 시즌 ${d.season_profile || '(없음)'} · 지역 ${d.region || '(없음)'} · 통화 ${d.currency || '(없음)'}`);
  }
}

/* 요율 값 자체의 형식 오류 — 음수·0·누락.
   PQ: 정적값이 아니라 라이브 병합값을 본다 — 오타로 0을 저장한 오버라이드나 커스텀
   목적지의 잘못된 값은 정적표에 안 나타나므로 예전엔 통과했다. */
console.log('\n■ 요율 값 형식');
const NUM = ['airfare','fuel_surcharge','hotel_per_room','meal_per_person',
             'vehicle_large','vehicle_small','guide_fee','sightseeing_fee','margin_per_traveler'];
let bad = 0;
for (const d of LIVE_RATES) for (const f of NUM) {
  const v = d[f];
  if (typeof v !== 'number' || !isFinite(v)) { err('값형식', `${d.destination_key}·${f} = ${v} (숫자 아님)`); bad++; }
  else if (v <= 0) { err('값형식', `${d.destination_key}·${f} = ${v} (0 이하)`); bad++; }
}
for (const d of LIVE_RATES) if (d.vehicle_small > d.vehicle_large) {
  err('값형식', `${d.destination_key}: 소형 차량비(${d.vehicle_small})가 대형(${d.vehicle_large})보다 비쌈`);
  bad++;
}
console.log(`  ${bad}건`);

console.log(`\n${'═'.repeat(78)}`);
if (!errors.length) {
  console.log('✓ 교차 정합성 오류 없음 — 모든 목록이 앞뒤가 맞습니다.');
} else {
  console.log(`✗ 교차 정합성 오류 ${errors.length}건 (전부 객관적 오류 — 취향 문제 아님)\n`);
  let cur = '';
  for (const e of errors) {
    if (e.cat !== cur) { cur = e.cat; console.log(`[${cur}]`); }
    console.log(`  · ${e.msg}`);
  }
}
if (notes.length) {
  console.log(`\n─ 참고 ${notes.length}건 (오류 아님 — 사람이 봐야 판단됨, exit code에 반영 안 함)`);
  let cur = '';
  for (const n of notes) {
    if (n.cat !== cur) { cur = n.cat; console.log(`[${cur}]`); }
    console.log(`  · ${n.msg}`);
  }
}
process.exit(errors.length ? 1 : 0);

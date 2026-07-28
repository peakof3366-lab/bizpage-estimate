/* 목적지 메타데이터 교차 정합성 감사 — 읽기 전용.
   실행: node ai-loop/audit_consistency.js  (프로젝트 루트에서)

   audit_rates.js가 '값이 타당한가'(도메인 판단 필요)를 본다면, 이쪽은
   '목록끼리 앞뒤가 맞는가'(객관적 사실)만 본다. 여기서 걸리는 건 취향 문제가 아니라
   전부 오류다 — 한 목록에만 등록하고 다른 목록을 빠뜨리면 견적이 조용히 틀어진다.

   검사 대상 목록:
     data.js  destinationRates       (요율 원본 — 기준)
     index.html <select id=destination>  (고객이 고를 수 있는 목록)
     script.js BIZ_ZONES             (비즈니스 좌석 배율 구간)
     script.js INSURANCE_ZONES       (여행자보험 권역)
     admin.html REGION_MAP           (관리자 그룹핑·지역별 일괄조정 기준)
     dest_currency.js DEST_CURRENCY  (환율 보정 통화)
     data.js DEST_SEASON_PROFILES    (권역별 시즌 달력) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const grab = (src, re, name) => {
  const m = src.match(re);
  if (!m) throw new Error(`${name} 파싱 실패 — 원본 형태가 바뀐 것 같습니다. 감사기를 고치세요.`);
  return m[0];
};
const evalObj = (literal, prefix) =>
  new Function('return ' + literal.replace(prefix, '').replace(/;$/, ''))();

const dataSrc = read('data.js'), scriptSrc = read('script.js'),
      adminSrc = read('admin.html'), idxSrc = read('index.html'), curSrc = read('dest_currency.js');

const s = {};
new Function('g', dataSrc + '\n;g.DR=destinationRates;'
  + 'g.SP=(typeof DEST_SEASON_PROFILES!=="undefined")?DEST_SEASON_PROFILES:null;')(s);
const KEYS = s.DR.map(d => d.destination_key);

const BIZ_ZONES  = evalObj(grab(scriptSrc, /const BIZ_ZONES = \{[\s\S]*?\n\};/, 'BIZ_ZONES'), /^const BIZ_ZONES = /);
const INS_ZONES  = evalObj(grab(scriptSrc, /const INSURANCE_ZONES = \{[\s\S]*?\n\};/, 'INSURANCE_ZONES'), /^const INSURANCE_ZONES = /);
const REGION_MAP = evalObj(grab(adminSrc, /const REGION_MAP = \{[\s\S]*?\n  \};/, 'REGION_MAP'), /^const REGION_MAP = /);
const DEST_CURRENCY = evalObj(grab(curSrc, /const DEST_CURRENCY = \{[\s\S]*?\n\};/, 'DEST_CURRENCY'), /^const DEST_CURRENCY = /);

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

console.log(`■ 목록 간 커버리지 (요율표 기준 ${KEYS.length}개)`);
cmp('index.html select', SELECT_KEYS);
cmp('BIZ_ZONES', Object.values(BIZ_ZONES).flat());
cmp('INSURANCE_ZONES', Object.values(INS_ZONES).flat());
cmp('REGION_MAP', Object.keys(REGION_MAP));
cmp('DEST_CURRENCY', Object.keys(DEST_CURRENCY));

/* 중복 등록 — 한 목적지가 두 구간에 들어가면 먼저 걸리는 쪽이 조용히 이긴다 */
console.log('\n■ 구간 목록 내부 중복');
for (const [name, obj] of [['BIZ_ZONES', BIZ_ZONES], ['INSURANCE_ZONES', INS_ZONES]]) {
  const all = Object.values(obj).flat();
  const dup = all.filter((k, i) => all.indexOf(k) !== i);
  console.log(`  ${name.padEnd(22)} ${dup.length ? '중복 ' + dup.join(', ') : '없음'}`);
  if (dup.length) err(name, `구간 간 중복 등록(먼저 매칭되는 구간이 조용히 이김): ${[...new Set(dup)].join(', ')}`);
}

/* 지리 분류가 서로 모순되는지 — REGION_MAP(관리자 그룹) vs 보험/좌석 권역.
   이름 자체가 지리를 말하는 그룹인데 다른 목록에서는 전혀 다른 대륙 취급이면 오류다. */
console.log('\n■ 분류 모순 — REGION_MAP 그룹명과 다른 목록의 권역이 어긋나는 목적지');
const insZoneOf = k => Object.keys(INS_ZONES).find(z => INS_ZONES[z].includes(k));
/* REGION_MAP 그룹명 → 그 그룹이 실제로 어느 보험권역이어야 하는지의 기대값 */
const REGION_EXPECT = {
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

/* 요율 값 자체의 형식 오류 — 음수·0·누락 */
console.log('\n■ 요율 값 형식');
const NUM = ['airfare','fuel_surcharge','hotel_per_room','meal_per_person',
             'vehicle_large','vehicle_small','guide_fee','sightseeing_fee','margin_per_traveler'];
let bad = 0;
for (const d of s.DR) for (const f of NUM) {
  const v = d[f];
  if (typeof v !== 'number' || !isFinite(v)) { err('값형식', `${d.destination_key}·${f} = ${v} (숫자 아님)`); bad++; }
  else if (v <= 0) { err('값형식', `${d.destination_key}·${f} = ${v} (0 이하)`); bad++; }
}
for (const d of s.DR) if (d.vehicle_small > d.vehicle_large) {
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

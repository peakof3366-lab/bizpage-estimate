/* PY 검증: 목적지 분류가 data.js의 DEST_CLASSIFY 한 곳에서만 정해지는가.
   실행: node ai-loop/test_pY_single_source.js  (프로젝트 루트에서)

   왜 이 테스트가 있는가 — 이 저장소 결함의 최대 원인은 '같은 목적지 목록이 파일마다
   따로 적혀 있고 하나를 빠뜨리는 것'이었다(동유럽 통화·지역, PF 스냅샷/패널,
   PG 견적서 표시, PP 보험권역, PQ 시즌 — 여섯 번). 빠뜨린 쪽은 예외를 던지지 않고
   중립값이나 다른 계절로 조용히 폴백해 틀린 금액이 그대로 나갔다.
   PY에서 좌석·보험·지역·통화·시즌·반구를 DEST_CLASSIFY 한 표로 모으고 나머지를
   파생시켰다. 이 테스트가 지키는 것은 셋이다:
     ① 리팩터로 어느 목적지의 분류도 바뀌지 않았다(아래 EXPECT는 리팩터 이전 스냅샷)
     ② 소비자가 실제로 쓰는 목록이 그 표와 일치한다(파생이 실제로 도는지)
     ③ 표가 망가지면 조용히 넘어가지 않고 잡힌다(일부러 망가뜨려 확인) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const DATA = require('../data');
const DEST_CURRENCY = require('../dest_currency');
const scriptSrc = read('script.js');
const adminSrc = read('admin.html');
const curSrc = read('dest_currency.js');
const dataSrc = read('data.js');

/* 리팩터 **이전**의 네 목록(script.js BIZ_ZONES·INSURANCE_ZONES, admin.html REGION_MAP,
   dest_currency.js DEST_CURRENCY)과 시즌 프로파일 keys·남반구 목록에서 그대로 뽑은
   스냅샷. 형식은 'zone|ins|region|currency|season|hemi'.
   ⚠ 이 값을 고칠 일이 생겼다면 그건 '분류를 바꾸는 도메인 판단'이다 — 리팩터 중에
   슬쩍 바뀌는 것과 구별하려고 일부러 여기 박아둔다. */
const EXPECT = {
  /* TE: 유일한 국내 목적지 — 보험 domestic · 통화 KRW · 시즌 korea로 축이 셋 다 새것이다 */
  '제주도':    'short|domestic|국내|KRW|korea|',
  '도쿄':     'short|asiaShort|일본|JPY|japan|',
  '오사카':    'short|asiaShort|일본|JPY|japan|',
  '후쿠오카':   'short|asiaShort|일본|JPY|japan|',
  '가고시마':   'short|asiaShort|일본|JPY|japan|',
  '나고야':    'short|asiaShort|일본|JPY|japan|',
  '삿포로':    'short|asiaShort|일본|JPY|japan|',
  '아오모리':   'short|asiaShort|일본|JPY|japan|',
  '오키나와':   'short|asiaShort|일본|JPY|japan|',
  '미야코지마':  'short|asiaShort|일본|JPY|japan|',
  '홍콩':     'short|asiaShort|홍콩·마카오|HKD|hkmo|',
  '마카오':    'short|asiaShort|홍콩·마카오|MOP|hkmo|',
  '상해':     'short|asiaShort|중국|CNY|china|',
  '장가계':    'short|asiaShort|중국|CNY|china|',
  '청도':     'short|asiaShort|중국|CNY|china|',
  '연태':     'short|asiaShort|중국|CNY|china|',
  '몽골':     'short|evac|몽골·대만|MNT|mongolia|',
  '대만':     'short|asiaShort|몽골·대만|TWD|taiwan|',
  '가오슝':    'short|asiaShort|몽골·대만|TWD|taiwan|',
  '라오스':    'mid|asiaMid|동남아|LAK|seasia|',
  '싱가포르':   'mid|asiaMid|동남아|SGD|seasia|',
  '하노이':    'mid|asiaMid|동남아|VND|seasia|',
  '호치민':    'mid|asiaMid|동남아|VND|seasia|',
  '다낭':     'mid|asiaMid|동남아|VND|seasia|',
  '나트랑':    'mid|asiaMid|동남아|VND|seasia|',
  '푸꾸옥':    'mid|asiaMid|동남아|VND|seasia|',
  '세부':     'mid|asiaMid|동남아|PHP|seasia|',
  '마닐라':    'mid|asiaMid|동남아|PHP|seasia|',
  '보홀':     'mid|asiaMid|동남아|PHP|seasia|',
  '코타키나발루': 'mid|asiaMid|동남아|MYR|seasia|',
  '캄보디아':   'mid|asiaMid|동남아|KHR|seasia|',
  '방콕':     'mid|asiaMid|동남아|THB|seasia|',
  '푸켓':     'mid|asiaMid|동남아|THB|seasia|',
  '후아힌':    'mid|asiaMid|동남아|THB|seasia|',
  '치앙마이':   'mid|asiaMid|동남아|THB|seasia|',
  '발리':     'mid|asiaMid|동남아|IDR|seasia|',
  '괌':      'mid|highCost|오세아니아·태평양|USD|guamSaipan|',
  '사이판':    'mid|highCost|오세아니아·태평양|USD|guamSaipan|',
  '시드니':    'mid|oceania|오세아니아·태평양|AUD|southern|S',
  '멜버른':    'mid|oceania|오세아니아·태평양|AUD|southern|S',
  '오클랜드':   'mid|oceania|오세아니아·태평양|NZD|southern|S',
  '호주':     'long|oceania|오세아니아·태평양|AUD|southern|S',
  '서유럽':    'long|highCost|유럽|EUR|europe|',
  '로마':     'long|highCost|유럽|EUR|europe|',
  '파리':     'long|highCost|유럽|EUR|europe|',
  '영국':     'long|highCost|유럽|GBP|europe|',
  '스페인':    'long|highCost|유럽|EUR|europe|',
  '독일':     'long|highCost|유럽|EUR|europe|',
  '네덜란드':   'long|highCost|유럽|EUR|europe|',
  '북유럽':    'long|highCost|유럽|EUR|europe|',
  '동유럽':    'long|highCost|유럽|EUR|europe|',
  '로스앤젤레스': 'long|highCost|북미|USD|northAmerica|',
  '샌프란시스코': 'long|highCost|북미|USD|northAmerica|',
  '워싱턴':    'long|highCost|북미|USD|northAmerica|',
  '뉴욕':     'long|highCost|북미|USD|northAmerica|',
  '하와이':    'long|highCost|북미|USD|northAmerica|',
  '밴쿠버':    'long|highCost|북미|CAD|northAmerica|',
  '토론토':    'long|highCost|북미|CAD|northAmerica|',
  '카자흐스탄':  'mid|evac|중앙아시아|KZT|centralAsia|',
  '우즈베키스탄': 'mid|evac|중앙아시아|UZS|centralAsia|',
};

console.log('[1] 분류표가 리팩터 이전 값과 정확히 같은가 (목적지 60개 × 6축)');
/* ⚠ 이 표는 **스냅샷**이다. 목적지를 늘리면 여기서 걸리는 것이 정상이고, 늘린 사람이
   여기에도 한 줄을 적어야 통과한다 — 그게 「목적지를 추가할 때 한 곳을 빠뜨린다」를
   막는 장치다(결함 생성기 ①). 2026-08-11 TD에서 가고시마·후아힌을 넣어 57개가 됐다.
   2026-08-20 VC에서 아오모리·미야코지마를 넣어 **60개**가 됐다 — 대표 방침
   「지역이 달라지면 별도로 추가한다」에 따라 미야코지마를 오키나와에서 분리했다. */
const DC = DATA.DEST_CLASSIFY;
const dcKeys = Object.keys(DC).sort();
const expKeys = Object.keys(EXPECT).sort();
ok('목적지 수가 같다', dcKeys.length === expKeys.length, `${dcKeys.length} vs ${expKeys.length}`);
ok('목적지 집합이 같다', JSON.stringify(dcKeys) === JSON.stringify(expKeys),
  '차이: ' + dcKeys.filter((k) => !expKeys.includes(k)).concat(expKeys.filter((k) => !dcKeys.includes(k))).join(','));
let mismatched = [];
for (const k of expKeys) {
  const r = DC[k] || {};
  const actual = [r.zone, r.ins, r.region, r.currency, r.season, r.hemi || ''].join('|');
  if (actual !== EXPECT[k]) mismatched.push(`${k}: ${EXPECT[k]} → ${actual}`);
}
ok('모든 목적지의 6축 분류가 스냅샷과 동일', mismatched.length === 0, mismatched.slice(0, 5).join(' / '));

console.log('\n[2] 요율표와 분류표가 1:1인가 (한쪽에만 있으면 조용히 폴백된다)');
const RATE_KEYS = DATA.map((d) => d.destination_key);
ok('요율표에 있는데 분류표에 없는 목적지 0건',
  RATE_KEYS.filter((k) => !DC[k]).length === 0, RATE_KEYS.filter((k) => !DC[k]).join(','));
ok('분류표에 있는데 요율표에 없는 목적지 0건',
  dcKeys.filter((k) => !RATE_KEYS.includes(k)).length === 0, dcKeys.filter((k) => !RATE_KEYS.includes(k)).join(','));
ok('파생 이상(DEST_CLASSIFY_ISSUES) 0건',
  DATA.DEST_CLASSIFY_ISSUES.length === 0, DATA.DEST_CLASSIFY_ISSUES.join(' / '));

console.log('\n[3] 소비자가 실제로 쓰는 목록이 분류표에서 나오는가');
/* 구간명 배열은 script.js의 호출부에 있다 — 여기 다시 적으면 그게 이중 관리다. */
const callArgs = (re, src) => {
  const m = src.match(re);
  return m ? m[1].split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean) : null;
};
const bizGroups = callArgs(/destGroupsBy\('zone',\s*\[([^\]]*)\]\)/, scriptSrc);
/* XQ: 보험 권역 **이름 목록**은 이제 script.js가 아니라 data.js가 갖는다(서버도 같은
   것을 읽는다). 그래서 소스에서 긁지 않고 내보낸 값을 그대로 쓴다.
   ⚠ 대신 **엔진이 정말 그 목록을 쓰는지**는 확인한다 — 안 그러면 이 검사는 data.js만
     혼자 보고 통과한다(대조하는 척하는 검사). */
const insGroups = DATA.INSURANCE_ZONE_IDS || null;
ok('script.js가 BIZ_ZONES를 destGroupsBy로 만든다', !!bizGroups, String(bizGroups));
ok('보험 권역 이름 목록이 data.js에서 온다', Array.isArray(insGroups) && insGroups.length >= 6,
  String(insGroups));
ok('script.js가 그 목록으로 INSURANCE_ZONES를 만든다',
  /destGroupsBy\('ins',\s*INSURANCE_ZONE_IDS\)/.test(scriptSrc));
ok('admin.html이 REGION_MAP을 destFieldMap으로 만든다',
  /const REGION_MAP = destFieldMap\('region'\);/.test(adminSrc));
ok('dest_currency.js가 destFieldMap으로 만든다', /destFieldMap\('currency'\)/.test(curSrc));

const BIZ = DATA.destGroupsBy('zone', bizGroups || []);
const INS = DATA.destGroupsBy('ins', insGroups || []);
const REG = DATA.destFieldMap('region');
const SEASON_OF = {};
DATA.DEST_SEASON_PROFILES.forEach((p) => p.keys.forEach((k) => { SEASON_OF[k] = p.id; }));

const zoneOf = (k) => Object.keys(BIZ).find((z) => BIZ[z].includes(k)) || '';
const insOf = (k) => Object.keys(INS).find((z) => INS[z].includes(k)) || '';
let derivedBad = [];
for (const k of expKeys) {
  const got = [zoneOf(k), insOf(k), REG[k], DEST_CURRENCY[k], SEASON_OF[k] || '',
    DATA.destKeysWhere('hemi', 'S').includes(k) ? 'S' : ''].join('|');
  if (got !== EXPECT[k]) derivedBad.push(`${k}: ${EXPECT[k]} → ${got}`);
}
ok('파생된 6개 목록이 스냅샷과 완전히 일치', derivedBad.length === 0, derivedBad.slice(0, 5).join(' / '));
ok('좌석 구간이 세 개(short/mid/long) 전부 비어 있지 않다',
  ['short', 'mid', 'long'].every((z) => Array.isArray(BIZ[z]) && BIZ[z].length > 0));
ok('보험 권역 다섯 개가 전부 비어 있지 않다',
  ['asiaShort', 'asiaMid', 'evac', 'oceania', 'highCost'].every((z) => Array.isArray(INS[z]) && INS[z].length > 0));
/* 런타임에 커스텀 목적지가 push되므로 배열이어야 한다(객체로 바뀌면 조용히 깨진다) */
ok('파생 결과가 push 가능한 배열이다',
  Object.values(BIZ).every(Array.isArray) && Object.values(INS).every(Array.isArray));
ok('SOUTHERN_HEMISPHERE_DESTS도 파생이다', /const SOUTHERN_HEMISPHERE_DESTS = destKeysWhere\('hemi', 'S'\);/.test(dataSrc));
ok('시즌 프로파일 keys도 파생이다', /p\.keys = destKeysWhere\('season', p\.id\)/.test(dataSrc));

console.log('\n[4] 하드코딩 목록이 다시 생기지 않았는가 (재발 방지)');
ok('script.js에 BIZ_ZONES 리터럴 없음', !/const BIZ_ZONES = \{[\s\S]{0,50}short:/.test(scriptSrc));
ok('script.js에 INSURANCE_ZONES 리터럴 없음', !/const INSURANCE_ZONES = \{[\s\S]{0,50}asiaShort:/.test(scriptSrc));
ok('admin.html에 REGION_MAP 리터럴 없음', !/const REGION_MAP = \{/.test(adminSrc));
ok('dest_currency.js에 통화 리터럴 없음', !/'도쿄'\s*:\s*'JPY'/.test(curSrc));
ok('시즌 프로파일에 keys 리터럴 없음', !/^\s*keys: \[/m.test(dataSrc));

console.log('\n[5] 표가 망가지면 실제로 잡히는가 (일부러 망가뜨려 확인)');
/* ⚠ 이 저장소 관례 — 안전망을 만들면 일부러 깨진 입력을 넣어 잡히는지 확인하고
   그 확인을 테스트로 남긴다. 감사기가 '통과'만 출력하는 걸 믿으면 안 된다.
   data.js 소스에서 '방콕' 한 줄만 바꿔치기해 별도 샌드박스에서 평가한다
   (운영 파일도, require 캐시도 건드리지 않는다). */
const BANGKOK_RE = /'방콕':\s*\{[^}]*\},/;
ok('바꿔치기할 방콕 행을 찾았다', BANGKOK_RE.test(dataSrc));

/* 일부러 낸 경고로 테스트 출력이 지저분해지지 않게 억제한다.
   ⚠ 파생 함수(g.groups·g.map)는 부를 때마다 다시 경고를 내므로 **평가 이후의
   재파생까지** 이 안에서 해야 한다. 평가만 감쌌다가 경고가 새어 나왔었다. */
function quiet(fn) {
  const realWarn = console.warn;
  console.warn = () => {};
  try { return fn(); } finally { console.warn = realWarn; }
}
function evalData(src) {
  const g = {};
  new Function('g', src
    + '\n;g.DC=DEST_CLASSIFY;g.ISSUES=DEST_CLASSIFY_ISSUES;g.DR=destinationRates;'
    + 'g.SP=DEST_SEASON_PROFILES;g.groups=destGroupsBy;g.map=destFieldMap;g.where=destKeysWhere;')(g);
  return g;
}
const broken = (replacement) => evalData(dataSrc.replace(BANGKOK_RE, replacement));

/* ① 분류표에서 행이 통째로 빠진 경우 — 예전에 목적지를 추가하며 한 목록을 빠뜨린 것과 같은 상황 */
{
  const { g, biz } = quiet(() => {
    const g2 = broken('');
    return { g: g2, biz: g2.groups('zone', ['short', 'mid', 'long']) };
  });
  ok('행 누락: 파생 좌석 구간에서 방콕이 빠진다',
    !Object.values(biz).flat().includes('방콕'));
  ok('행 누락: 요율표에는 남아 있어 1:1 검사가 깨진다(감사기가 잡는 지점)',
    g.DR.some((d) => d.destination_key === '방콕') && !g.DC['방콕']);
}
/* ② 구간명 오타 — 저장은 되는데 어느 구간에도 안 들어가 조용히 폴백되던 유형 */
{
  const { g, biz } = quiet(() => {
    const g2 = broken("'방콕': { zone:'huge', ins:'asiaMid', region:'동남아', currency:'THB', season:'seasia' },");
    return { g: g2, biz: g2.groups('zone', ['short', 'mid', 'long']) };
  });
  ok('구간명 오타: 기록이 남는다', g.ISSUES.some((m) => /방콕/.test(m) && /huge/.test(m)), g.ISSUES.join('/'));
  ok('구간명 오타: 모르는 구간을 새로 만들지 않는다(만들면 계수표에 없어 NaN이 된다)',
    biz.huge === undefined);
  ok('구간명 오타: 어느 구간에도 편입되지 않는다', !Object.values(biz).flat().includes('방콕'));
}
/* ③ 통화 누락 — 동유럽이 실제로 이 상태였고 환율 보정이 통째로 빠졌다 */
{
  const { g, cur } = quiet(() => {
    const g2 = broken("'방콕': { zone:'mid', ins:'asiaMid', region:'동남아', currency:'', season:'seasia' },");
    return { g: g2, cur: g2.map('currency') };
  });
  ok('통화 누락: 기록이 남는다', g.ISSUES.some((m) => /방콕/.test(m) && /currency/.test(m)), g.ISSUES.join('/'));
  ok('통화 누락: 맵에 빈 값이 들어가지 않는다', cur['방콕'] === undefined);
}
/* ④ 없는 시즌 프로파일 — 폴백이 '중립'이 아니라 다른 계절이라 최대 36% 어긋난다(PQ) */
{
  const g = quiet(() => broken("'방콕': { zone:'mid', ins:'asiaMid', region:'동남아', currency:'THB', season:'nonexistent' },"));
  ok('없는 시즌 id: 기록이 남는다',
    g.ISSUES.some((m) => /방콕/.test(m) && /시즌 프로파일/.test(m)), g.ISSUES.join('/'));
  ok('없는 시즌 id: 어느 프로파일에도 안 들어간다',
    !g.SP.some((p) => p.keys.includes('방콕')));
}
/* ⑤ 멀쩡한 표에서는 거짓 경보가 없어야 한다 — 위 넷이 항상 켜지는 검사면 쓸모가 없다 */
{
  const g = quiet(() => evalData(dataSrc));
  ok('정상 표에서는 기록이 0건(거짓 경보 없음)', g.ISSUES.length === 0, g.ISSUES.join('/'));
}

/* ⚠ 이 줄의 형식('결과: N pass / N fail')은 run_all_tests.js가 정규식으로 읽는다.
   다르게 쓰면 통과해도 '크래시'로 집계된다(처음에 '합계:'라고 써서 그렇게 됐다). */
console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

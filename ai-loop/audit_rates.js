/* 요율표(data.js) '값' 정합성 감사 — 읽기 전용. 아무것도 고치지 않고 보고만 한다.
   실행: node ai-loop/audit_rates.js  (프로젝트 루트에서)

   시장 실거래가와 대조할 방법이 없으므로(실측 데이터 0건), 여기서 보는 건
   '외부 정답 대비 오차'가 아니라 **내부 정합성**이다:
     ① 같은 권역 안에서 혼자 튀는 값 (입력 실수·낡은 값 후보)
     ② 필드 간 비율이 다른 목적지와 어긋나는 값 (대형/소형 차량비, 유류/항공비 등)
     ③ 순서가 뒤집힌 값 (장거리인데 단거리보다 싼 항공료 등)
     ④ 요율 갱신일(rateDate) 노후도
   ①은 '틀렸다'가 아니라 '확인 대상'이다 — 실제로 그 도시만 비싼 정당한 이유가 있을 수 있다. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* data.js와 script.js의 상수를 실제로 평가해서 가져온다(하드코딩 복사 금지 — 원본과 어긋나면
   감사 자체가 거짓말이 된다). script.js는 DOM에 의존하는 부분이 많아 필요한 상수만 정규식으로. */
const sandbox = {};
new Function('g', read('data.js') + '\n;g.DR=destinationRates;g.META=RATE_META;')(sandbox);

/* 검사 대상은 '고객이 실제로 받는 값'이어야 한다 — 관리자 화면에서 수정한 단가는
   data.js가 아니라 DB에 저장되므로, 기본으로 운영 요율을 덮어쓴 표를 감사한다.
   네트워크가 없거나 --static이면 정적값으로 내려가되 그 사실을 화면에 찍는다. */
const { loadRatesForAudit } = require('./live_rates');
const DR = loadRatesForAudit(sandbox.DR).rates;

/* PY: 지역·좌석 구간은 data.js의 DEST_CLASSIFY에서 파생한다(예전엔 admin.html·script.js의
   리터럴을 정규식으로 긁었다 — 그 리터럴들이 이제 없다). 커스텀 목적지는 분류표에 없고
   DB 행이 값을 들고 오므로, 라이브 병합값의 __zone·region을 먼저 쓰고 없으면 분류표를 본다. */
const DATA_MOD = require('../data');
const REGION_MAP = DATA_MOD.destFieldMap('region');
const zoneOf = k => (DATA_MOD.DEST_CLASSIFY[k] || {}).zone
  || (DR.find(d => d.destination_key === k) || {}).__zone
  || 'short';

const FIELDS = ['airfare','fuel_surcharge','hotel_per_room','meal_per_person',
                'vehicle_large','vehicle_small','guide_fee','sightseeing_fee','margin_per_traveler'];
const LBL = { airfare:'항공료', fuel_surcharge:'유류할증료', hotel_per_room:'호텔(1박)',
  meal_per_person:'1인 식비', vehicle_large:'대형차량', vehicle_small:'소형차량',
  guide_fee:'가이드비', sightseeing_fee:'관광비', margin_per_traveler:'1인 마진' };

const won = n => Math.round(n).toLocaleString('ko-KR');
const median = a => { const s=[...a].sort((x,y)=>x-y); const m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };

const findings = [];
const add = (sev, cat, msg) => findings.push({ sev, cat, msg });

/* ── ① 권역 내 이상치 ───────────────────────────────────────────────────── */
const byRegion = {};
for (const d of DR) (byRegion[REGION_MAP[d.destination_key] || '기타'] ||= []).push(d);

console.log('■ 권역별 요율 중앙값');
console.log('권역'.padEnd(20) + '수  ' + FIELDS.map(f => LBL[f].padStart(11)).join(''));
console.log('─'.repeat(20 + 4 + 11 * FIELDS.length));
for (const [reg, list] of Object.entries(byRegion)) {
  const row = FIELDS.map(f => won(median(list.map(d => d[f]))).padStart(11)).join('');
  console.log(reg.padEnd(20) + String(list.length).padStart(2) + '  ' + row);
}

console.log('\n■ ① 권역 내 이상치 — 같은 권역 중앙값 대비 ±50% 밖 (권역 3곳 이상만)');
let outCount = 0;
for (const [reg, list] of Object.entries(byRegion)) {
  if (list.length < 3) continue;
  for (const f of FIELDS) {
    const med = median(list.map(d => d[f]));
    if (!med) continue;
    for (const d of list) {
      const r = d[f] / med;
      if (r > 1.5 || r < 0.5) {
        outCount++;
        add(r > 2.2 || r < 0.3 ? 'HIGH' : 'MED', '권역내이상치',
          `${reg} · ${d.destination_key} · ${LBL[f]} = ${won(d[f])} (권역 중앙값 ${won(med)}의 ${r.toFixed(2)}배)`);
      }
    }
  }
}
if (!outCount) console.log('  (없음)');

/* ①-b 한 목적지 안에서 항목별 상대위치가 제각각인 경우.
   같은 도시라면 물가 수준이 일관돼야 한다 — 식비는 권역 최상위인데 가이드비는 최하위라면
   서로 다른 기준(다른 시점·다른 공급사)으로 입력됐을 가능성이 있다. */
console.log('\n■ ①-b 목적지 내부 일관성 — 같은 도시인데 항목별 물가 위치가 엇갈리는 곳');
for (const [reg, list] of Object.entries(byRegion)) {
  if (list.length < 4) continue;
  for (const d of list) {
    const ratios = FIELDS.map(f => {
      const med = median(list.map(x => x[f]));
      return { f, r: med ? d[f] / med : 1 };
    });
    const hi = ratios.reduce((a, b) => a.r > b.r ? a : b);
    const lo = ratios.reduce((a, b) => a.r < b.r ? a : b);
    if (hi.r / lo.r >= 3.5) {
      add('MED', '내부일관성',
        `${reg} · ${d.destination_key} — ${LBL[hi.f]}는 권역 중앙값의 ${hi.r.toFixed(2)}배인데 ${LBL[lo.f]}는 ${lo.r.toFixed(2)}배 (${(hi.r/lo.r).toFixed(1)}배 벌어짐)`);
    }
  }
}

/* ①-c 권역 그룹이 서로 다른 가격 티어를 섞고 있는지.
   섞여 있으면 관리자 '지역별 일괄조정'이 무딘 도구가 된다(한쪽엔 과하고 한쪽엔 부족). */
console.log('\n■ ①-c 권역 그룹 내부 가격 티어 분열 — 일괄조정이 무뎌지는 그룹');
for (const [reg, list] of Object.entries(byRegion)) {
  if (list.length < 3) continue;
  const airs = list.map(d => d.airfare).sort((a, b) => a - b);
  const spread = airs[airs.length - 1] / airs[0];
  if (spread >= 1.8) {
    const lowSide  = list.filter(d => d.airfare <= airs[0] * 1.15).map(d => d.destination_key);
    const highSide = list.filter(d => d.airfare >= airs[airs.length-1] * 0.85).map(d => d.destination_key);
    add('MED', '권역분열',
      `${reg} — 항공료가 ${spread.toFixed(1)}배 벌어짐 (저가군 ${lowSide.join('·')} ${won(airs[0])} / 고가군 ${highSide.join('·')} ${won(airs[airs.length-1])})`);
  }
}

/* ①-d 1,000원 단위로 안 떨어지는 값 = 과거 일괄조정(%)의 잔재일 수 있다.
   요율표는 손으로 관리하는 평문이라 라운드 값이 관례인데, 특정 목적지만 소수점이 남아 있으면
   그 목적지에만 비율 조정이 적용됐거나 계산 결과가 그대로 저장된 흔적이다. */
console.log('\n■ ①-d 라운드 관례 이탈 — 1,000원 단위로 안 떨어지는 요율');
const nonRound = [];
for (const d of DR) for (const f of FIELDS) {
  if (d[f] % 1000 !== 0) nonRound.push({ k: d.destination_key, f, v: d[f] });
}
console.log(`  ${nonRound.length}건`);
if (nonRound.length) {
  /* 어떤 배율을 곱했길래 소수점이 남았는지 역추적한다. 흔한 일괄조정 배율로 나눴을 때
     전부 라운드 값이 되면, 그 배율의 일괄조정이 이 목적지들에만 적용된 잔재로 볼 수 있다. */
  /* '라운드'의 기준을 1,000 단위로만 잡으면 22,500 같은 정상적인 값이 탈락해 배율을
     잘못 짚는다. 500 단위까지 라운드로 보고, 조건을 만족하는 배율을 전부 보고한다
     — 어느 배율인지 단정할 수 없다는 것 자체가 정직한 결과다. */
  const CANDIDATES = [0.8, 0.85, 0.9, 0.95, 1.05, 1.1, 1.15, 1.2, 1.25, 1.35, 1.5];
  const isRound = n => Math.abs(n - Math.round(n)) < 1e-6 && Math.round(n) % 500 === 0;
  const hits = CANDIDATES.filter(c => nonRound.every(x => isRound(x.v / c)));
  const list = nonRound.map(x => `${x.k}·${LBL[x.f]}=${won(x.v)}`).join(', ');

  /* 배율 추측보다 먼저 볼 것: 외화 환산 흔적.
     현지 지상비를 USD 등으로 받아 고정 환율로 환산해 넣으면 원화 값이 라운드를 벗어난다.
     이때 값들의 최대공약수가 곧 그 환율이고, 각 값을 그 수로 나누면 깔끔한 외화 단가가 나온다.
     2026-07-29 확인: 이 10건의 gcd가 정확히 1,350이고 몫이 $150·$160·$35·$15·$274·$30 —
     '일괄조정 잔재'가 아니라 USD×1,350 환산이었다. 배율 추측(×1.35)은 1,350의 다른 표현일
     뿐이라 같은 숫자를 설명하며, 이쪽이 몫까지 말이 되므로 먼저 제시한다.
     ⚠ 환산 흔적이면 '고칠 오류'가 아니다. 대신 DEST_CURRENCY가 그 외화를 가리키는지 봐야
     한다 — 원가가 USD 고정인데 매핑이 현지통화면 환율 보정이 엉뚱한 통화를 따라간다. */
  const gcd2 = (a, b) => b ? gcd2(b, a % b) : a;
  const g = nonRound.reduce((a, x) => gcd2(a, x.v), 0);
  if (g >= 800 && g <= 2500) {
    const quots = nonRound.map(x => `${x.k}·${LBL[x.f]}=${x.v / g}`).join(', ');
    add('MED', '라운드이탈',
      `${nonRound.length}건의 최대공약수가 ${won(g)} — 외화를 ${won(g)}에 환산해 넣은 흔적으로 보임`
      + `(오류가 아닐 수 있음). 환산 단가: ${quots}. 확인할 것은 값이 아니라 `
      + `dest_currency.js의 통화 매핑이 그 외화와 맞는지다.`);
    console.log(`  → 환산 환율 추정: ${won(g)} (몫이 전부 정수)`);
  } else if (hits.length) {
    const desc = hits.map(c => `×${c}(${c > 1 ? '+' : ''}${((c - 1) * 100).toFixed(0)}%)`).join(' 또는 ');
    add('MED', '라운드이탈',
      `${nonRound.length}건이 모두 ${desc} 배율의 흔적을 보임 — 과거 일괄조정이 이 항목들에만 적용되고 `
      + `같은 목적지의 다른 항목들은 안 따라갔을 가능성. 조정이 의도한 범위였는지 확인 필요: ${list}`);
    console.log(`  → 가능한 배율: ${desc}`);
  } else {
    add('LOW', '라운드이탈', `${nonRound.length}건(배율 추정 실패) — ${list}`);
  }
}

/* ①-e 거의 쌍둥이인데 한 항목만 크게 다른 목적지 쌍.
   같은 권역에서 나머지 요율이 대부분 일치한다면 같은 기준으로 입력된 것인데,
   그 중 한 항목만 2배 가까이 벌어져 있으면 그 항목만 잘못 들어갔을 가능성이 높다.
   (권역 중앙값 기준 이상치 검사로는 둘 다 범위 안이라 안 걸린다.) */
console.log('\n■ ①-e 쌍둥이 목적지 — 나머지는 같은데 한 항목만 크게 다른 곳');
for (const [reg, list] of Object.entries(byRegion)) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const same = FIELDS.filter(f => a[f] && b[f] && Math.abs(a[f] - b[f]) / Math.max(a[f], b[f]) <= 0.1);
    if (same.length < FIELDS.length - 1) continue;          /* 한 항목 빼고 전부 비슷해야 */
    const diff = FIELDS.filter(f => !same.includes(f));
    for (const f of diff) {
      const ratio = Math.max(a[f], b[f]) / Math.min(a[f], b[f]);
      if (ratio >= 1.5) {
        add('MED', '쌍둥이불일치',
          `${reg} · ${a.destination_key} vs ${b.destination_key} — 다른 ${same.length}개 항목은 거의 동일한데 `
          + `${LBL[f]}만 ${won(a[f])} vs ${won(b[f])} (${ratio.toFixed(2)}배 차이)`);
      }
    }
  }
}

/* ── ② 필드 간 비율 정합성 ─────────────────────────────────────────────── */
console.log('\n■ ② 필드 간 비율 — 전체 분포에서 벗어난 조합');

/* 소형/대형 차량비: 정원이 45 vs 25라 통상 0.6~0.8 사이에 몰려야 한다 */
const vr = DR.map(d => ({ k: d.destination_key, r: d.vehicle_small / d.vehicle_large }));
const vrMed = median(vr.map(x => x.r));
console.log(`  · 소형/대형 차량비 중앙값 ${vrMed.toFixed(3)}`);
for (const x of vr) {
  if (Math.abs(x.r - vrMed) / vrMed > 0.15) {
    add('MED', '차량비율', `${x.k} · 소형/대형 = ${x.r.toFixed(3)} (중앙값 ${vrMed.toFixed(3)} 대비 ${((x.r/vrMed-1)*100).toFixed(0)}%)`);
  }
  if (x.r >= 1) add('HIGH', '차량비율', `${x.k} · 소형 차량비가 대형보다 비싸거나 같음 (${x.r.toFixed(3)})`);
}

/* 유류할증료/항공료: 노선 거리에 따라 다르지만 같은 zone 안에선 비슷해야 한다 */
console.log('  · 유류할증료/항공료 비 (권역별)');
for (const z of ['short','mid','long']) {
  const list = DR.filter(d => zoneOf(d.destination_key) === z);
  const med = median(list.map(d => d.fuel_surcharge / d.airfare));
  console.log(`      ${z.padEnd(6)} 중앙값 ${med.toFixed(3)} (n=${list.length})`);
  for (const d of list) {
    const r = d.fuel_surcharge / d.airfare;
    if (Math.abs(r - med) / med > 0.45) {
      add('MED', '유류비율', `${d.destination_key}(${z}) · 유류/항공 = ${r.toFixed(3)} (권역 중앙값 ${med.toFixed(3)}) — 항공 ${won(d.airfare)} / 유류 ${won(d.fuel_surcharge)}`);
    }
  }
}

/* ── ③ 거리 권역 간 순서 뒤집힘 ────────────────────────────────────────── */
/* 개별 도시끼리 교차 비교하면(예: mid 최저 vs short 최고) 정상적인 분포에서도 반드시
   걸려 나와 노이즈만 쌓인다 — 홍콩이 마닐라보다 비싼 건 이상한 일이 아니다.
   실제로 문제인 건 '권역 전체의 중앙값 순서'가 뒤집히는 경우뿐이다. */
console.log('\n■ ③ 거리 권역(BIZ_ZONES) 간 항공료 중앙값 순서');
const byZone = { short: [], mid: [], long: [] };
for (const d of DR) byZone[zoneOf(d.destination_key)].push(d);
const zMed = {};
for (const z of ['short','mid','long']) {
  zMed[z] = median(byZone[z].map(d => d.airfare));
  console.log(`  ${z.padEnd(6)} 중앙값 ${won(zMed[z]).padStart(10)} (n=${byZone[z].length})`);
}
if (!(zMed.short < zMed.mid && zMed.mid < zMed.long)) {
  add('HIGH', '권역역전', `BIZ_ZONES 항공료 중앙값 순서가 short<mid<long이 아님 — ${won(zMed.short)}/${won(zMed.mid)}/${won(zMed.long)}`);
} else {
  console.log('  → 순서 정상 (short < mid < long)');
}

/* ── ③-b 코드×데이터 정합성 — 차량 정원 상수와 자동 선택 임계값 ─────────── */
/* script.js: useLarge = (auto && participants >= 10),  VEHICLE_CAPACITY.small = 25.
   즉 10~25명 구간에서는 소형(정원 25)으로 충분한데도 대형 요금이 잡힌다.
   의도된 것(수하물·좌석 여유)일 수 있으나, 두 상수가 서로 말이 안 맞는 상태라
   요금 차이가 큰 목적지에서는 과대추정 폭이 커진다. */
console.log('\n■ ③-b 코드×데이터 — 소형 정원(25)과 대형 자동전환 임계(10명)의 불일치');
const capSrc = read('script.js').match(/const VEHICLE_CAPACITY = \{[^}]*\}/);
const autoSrc = read('script.js').match(/participants >= (\d+)\)/);
if (capSrc && autoSrc) {
  const smallCap = Number(capSrc[0].match(/small:\s*(\d+)/)[1]);
  const threshold = Number(autoSrc[1]);
  console.log(`  소형 정원 ${smallCap}명 / 대형 자동전환 ${threshold}명 → ${threshold}~${smallCap}명 구간이 겹침`);
  if (threshold < smallCap) {
    /* 그 구간에서 금액 차이가 가장 큰 목적지들을 같이 보여준다 */
    const worst = DR.map(d => ({ k: d.destination_key, gap: d.vehicle_large - d.vehicle_small,
                                 ratio: d.vehicle_large / d.vehicle_small }))
                    .sort((a, b) => b.gap - a.gap).slice(0, 5);
    add('MED', '코드×데이터',
      `소형 정원 ${smallCap}명인데 ${threshold}명부터 대형 자동선택 — ${threshold}~${smallCap}명 견적은 소형으로 충분해도 대형 요금. `
      + `차액 큰 곳: ` + worst.map(w => `${w.k} +${won(w.gap)}/일(${w.ratio.toFixed(1)}배)`).join(', '));
  }
}

/* ── ④ 요율 갱신일 ─────────────────────────────────────────────────────── */
console.log('\n■ ④ 요율 갱신일(rateDate) 분포');
const dateCount = {};
for (const d of DR) dateCount[d.rateDate || '(없음)'] = (dateCount[d.rateDate || '(없음)'] || 0) + 1;
for (const [k, v] of Object.entries(dateCount).sort()) console.log(`  ${k}: ${v}곳`);
for (const d of DR) if (!d.rateDate) add('MED', '갱신일', `${d.destination_key} · rateDate 비어 있음`);

/* ── ⑤ 구조적 분류 확인 ───────────────────────────────────────────────── */
console.log('\n■ ⑤ 분류 정합성 — 목적지가 여러 목록에 일관되게 들어가 있는가');
const keys = DR.map(d => d.destination_key);
const noRegion = keys.filter(k => !REGION_MAP[k]);
if (noRegion.length) add('MED', '분류', `REGION_MAP 미등록(관리자에서 '기타'로 표시됨): ${noRegion.join(', ')}`);

/* REGION_MAP(관리자 그룹핑)과 BIZ_ZONES(거리)가 서로 다른 얘기를 하는 목적지 찾기.
   REGION_MAP은 관리자 화면 그룹핑·지역별 일괄조정의 기준이라, 여기서 엉뚱한 그룹에
   들어가 있으면 일괄조정 시 빠지거나 잘못 딸려간다. */
const zoneNames = { short: '단거리', mid: '중거리', long: '장거리' };
const regionZoneMix = {};
for (const k of keys) (regionZoneMix[REGION_MAP[k]] ||= new Set()).add(zoneOf(k));
for (const [reg, zs] of Object.entries(regionZoneMix)) {
  if (zs.size > 1) {
    const detail = keys.filter(k => REGION_MAP[k] === reg)
      .map(k => `${k}(${zoneNames[zoneOf(k)]})`).join(', ');
    add('MED', '분류', `REGION_MAP '${reg}' 그룹에 거리 권역이 섞여 있음 — ${detail}`);
  }
}
/* 지역명과 실제 지리가 어긋나는 경우 — 관리자 화면 그룹핑·일괄조정 대상이 틀어진다 */
for (const [k, reg] of Object.entries(REGION_MAP)) {
  if (!keys.includes(k)) add('LOW', '분류', `REGION_MAP에 있으나 요율표에 없는 키: ${k}`);
}
console.log(`  REGION_MAP 미등록 ${noRegion.length}건`);

/* ── 결과 ─────────────────────────────────────────────────────────────── */
const order = { HIGH: 0, MED: 1, LOW: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.cat.localeCompare(b.cat));
console.log(`\n${'═'.repeat(78)}`);
console.log(`감사 결과: ${findings.length}건 (HIGH ${findings.filter(f=>f.sev==='HIGH').length}` +
            ` · MED ${findings.filter(f=>f.sev==='MED').length}` +
            ` · LOW ${findings.filter(f=>f.sev==='LOW').length})`);
console.log('※ 전부 "확인 대상"이지 "틀렸다"가 아니다 — 그 목적지만 그럴 정당한 이유가 있을 수 있다.\n');
let cur = '';
for (const f of findings) {
  if (f.cat !== cur) { cur = f.cat; console.log(`[${cur}]`); }
  console.log(`  ${f.sev.padEnd(4)} ${f.msg}`);
}

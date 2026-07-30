/* PQ 검증: audit_consistency.js가 '관리자가 추가한 목적지'를 실제로 검사하는가.

   배경 — 이 감사기는 오래 정적값(data.js)만 봤다. 즉 매니저가 목적지를 하나 추가하면
   그 목적지는 감사기 시야 밖이었고, 분류값이 비어 엔진이 조용히 폴백해도 "오류 0건"이
   찍혔다. PQ에서 라이브(/api/rates)로 전환하고 커스텀 목적지 전용 절을 만들었다.

   ⚠ 이 테스트가 필요한 이유: 운영 커스텀 목적지가 지금 0건이라, 그 새 절은 **한 번도
   실행되지 않은 코드**다. 이 프로젝트에서 반복된 사고 유형이 정확히 그것("안전망이
   있는데 아무도 안 돌려봤다")이라, 일부러 망가진 목적지를 만들어 잡히는지 확인한다.

   방법 — live_rates.js는 curl로 요율을 받고 URL은 BIZPAGE_RATES_URL로 바꿀 수 있다.
   curl은 file:// 도 읽으므로, 가짜 응답 파일을 만들어 감사기를 그 위에서 돌린다.
   (운영 DB·네트워크를 건드리지 않는다.)

   실행: node ai-loop/test_pQ_custom_dest_audit.js  (프로젝트 루트에서) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const AUDIT = path.join(__dirname, 'audit_consistency.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 가짜 요율 응답 한 벌. 커스텀 목적지 외의 필드는 감사기가 안 보므로 비워 둔다. */
const RATE_FIELDS = {
  airfare: 500000, fuel_surcharge: 280000, hotel_per_room: 200000, meal_per_person: 20000,
  vehicle_large: 250000, vehicle_small: 120000, guide_fee: 220000,
  sightseeing_fee: 60000, margin_per_traveler: 150000,
};
const dest = (key, over) => ({
  destination_key: key, label: key, zone: 'mid', southern_hemisphere: false,
  ...RATE_FIELDS, rateDate: '2026-07', notes: '', season_note: '',
  currency: 'PHP', region: '동남아', insurance_zone: 'asiaMid', season_profile: 'seasia',
  ...over,
});

/* 감사기를 가짜 응답 위에서 한 번 돌리고 { code, out }을 준다. */
function runAudit(customDestinations) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pq-audit-')), 'rates.json');
  fs.writeFileSync(file, JSON.stringify({
    overrides: {}, fxRates: {}, fxBaseline: {}, coefficients: {}, customDestinations,
  }), 'utf8');
  /* Windows 경로(C:\...)도 file:///C:/... 형태여야 curl이 읽는다. */
  const url = 'file:///' + file.replace(/\\/g, '/').replace(/^\//, '');
  const env = { ...process.env, BIZPAGE_RATES_URL: url };
  try {
    const out = execFileSync(process.execPath, [AUDIT], { cwd: ROOT, env, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* curl이 없거나 file://을 못 읽으면 감사기가 정적값으로 내려간다 — 그때는 이 테스트가
   아무것도 검증하지 못하므로 조용히 통과시키지 않고 그 사실을 알린다. */
function assertLive(r, label) {
  const isLive = /요율 소스: 운영 실판매가/.test(r.out);
  ok(`${label}: 가짜 응답을 실제로 읽었다`, isLive,
    isLive ? '' : '감사기가 정적값으로 폴백했다(curl이 file://을 못 읽는 환경) — 이 테스트는 무의미');
  return isLive;
}

console.log('[1] 정상 커스텀 목적지 — 오류가 없어야 한다 (거짓 경보 방지)');
{
  const r = runAudit([dest('정상세부')]);
  if (assertLive(r, '정상')) {
    ok('exit 0 (오류 없음)', r.code === 0, `exit ${r.code}`);
    ok('커스텀 목적지 절이 실행됐다', /커스텀 목적지 1건/.test(r.out));
    ok('분류값이 화면에 찍힌다', /정상세부 — zone mid · 보험 asiaMid · 시즌 seasia/.test(r.out));
    /* 가장 중요한 성질 — 커스텀 목적지는 정적 목록(BIZ_ZONES 등)에 없는 게 정상이다.
       여기를 '누락'으로 잡으면 목적지를 추가하는 순간 오류 6건이 떠서 감사기를 못 쓴다. */
    ok('정적 목록 대조에서 누락으로 잡히지 않는다', !/정상세부/.test(
      (r.out.match(/■ 목록 간 커버리지[\s\S]*?■ 구간 목록/) || [''])[0]));
    ok('정적 기준 개수는 그대로 55개', /정적 요율표 기준 55개/.test(r.out));
  }
}

console.log('\n[2] 시즌 프로파일 미지정 — 지역으로 기대값을 알 수 있으면 오류');
{
  const r = runAudit([dest('시즌빠진하노이', { season_profile: null })]);
  if (assertLive(r, '시즌누락')) {
    ok('exit 1', r.code === 1, `exit ${r.code}`);
    ok('공용표로 계산된다는 사실을 말한다', /시즌 프로파일 미지정 — 공용표/.test(r.out));
    ok('어느 프로파일이 맞는지까지 알려준다', /'seasia'가 맞습니다/.test(r.out));
  }
}

console.log('\n[3] 지역과 시즌 프로파일이 어긋난 경우 — 성수기 달력이 반대가 된다');
{
  const r = runAudit([dest('엉망프라하', { region: '유럽', season_profile: 'japan' })]);
  if (assertLive(r, '시즌불일치')) {
    ok('exit 1', r.code === 1, `exit ${r.code}`);
    ok('불일치를 지적한다', /시즌 프로파일은 'japan'\(기대 'europe'\)/.test(r.out));
    /* 같은 행의 보험 권역도 유럽 기대값과 어긋나므로 함께 잡혀야 한다. */
    ok('보험 권역 불일치도 함께 잡는다', /보험 권역은 'asiaMid'\(기대 'highCost'\)/.test(r.out));
  }
}

console.log('\n[4] 모르는 키 — 저장은 됐지만 엔진이 못 찾는 값들');
{
  const r = runAudit([dest('엉터리키', {
    zone: 'huge', insurance_zone: 'nonsenseZone', season_profile: 'nonsenseSeason',
  })]);
  if (assertLive(r, '모르는키')) {
    ok('exit 1', r.code === 1, `exit ${r.code}`);
    ok('좌석 구간이 BIZ_ZONES 키가 아님을 잡는다', /좌석 구간\(zone\)이 'huge'/.test(r.out));
    ok('보험 권역 폴백을 잡는다', /보험 권역이 'nonsenseZone'/.test(r.out));
    ok('시즌 프로파일 폴백을 잡는다', /시즌 프로파일 'nonsenseSeason'이 DEST_SEASON_PROFILES에 없어/.test(r.out));
  }
}

console.log('\n[5] 지역·통화 누락은 오류가 아니라 참고 (의도적으로 안 쓸 수 있다)');
{
  const r = runAudit([dest('분류없는곳', { region: null, currency: null, season_profile: 'seasia' })]);
  if (assertLive(r, '참고')) {
    ok('exit 0 — 참고는 exit code에 반영 안 함', r.code === 0, `exit ${r.code}`);
    ok('지역 누락을 참고로 남긴다', /지역 분류 없음 — 요율 일괄조정에서 '기타'로/.test(r.out));
    ok('통화 누락을 참고로 남긴다', /현지 통화 없음 — 환율 보정이 항상 1\.0/.test(r.out));
    ok('참고 절에 들어갔다(오류 절 아님)',
      /─ 참고 [\s\S]*분류없는곳/.test(r.out) && !/오류 [1-9][\s\S]*분류없는곳/.test(r.out));
  }
}

console.log('\n[6] 라이브 값의 형식 오류 — 정적표에는 없는 값도 검사하는가');
{
  /* 예전엔 값 형식 검사가 data.js만 봤다. 커스텀 목적지의 뒤집힌 차량비는 통과했다. */
  const r = runAudit([dest('차량뒤집힘', { vehicle_large: 800000, vehicle_small: 900000 })]);
  if (assertLive(r, '값형식')) {
    ok('exit 1', r.code === 1, `exit ${r.code}`);
    ok('소형>대형 차량비를 잡는다', /차량뒤집힘: 소형 차량비\(900000\)가 대형\(800000\)보다 비쌈/.test(r.out));
  }
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

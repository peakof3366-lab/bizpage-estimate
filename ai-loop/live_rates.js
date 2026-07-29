/* 운영 중인 '실제 판매가'를 가져와 data.js 정적표 위에 덮는 공용 모듈.

   왜 필요한가 — 관리자 화면에서 요율을 고치면 값은 data.js가 아니라 DB(rate_overrides)에
   저장되고, 고객 견적서는 그 덮인 값으로 계산된다. 감사 도구가 data.js만 읽으면
   **아무도 팔지 않는 가격을 검사하게 된다.** 2026-07-29 확인 시점에 이미 일본 6개
   목적지의 항공료가 어긋나 있었다(도쿄 380,000 vs 실제 399,000).
   팀원 여러 명이 단가를 갱신하기 시작하면 이 격차가 표 전체로 번진다.

   /api/rates의 GET은 공개 엔드포인트다(공개 견적 계산기가 그대로 쓴다) — 인증 없이
   읽을 수 있고, 읽기만 하므로 운영에 아무 영향이 없다.

   동기 함수인 이유: 감사 스크립트들이 전부 위에서 아래로 흐르는 동기 코드라,
   async를 도입하면 파일 전체를 감싸는 리팩터링이 필요해진다. 읽기 전용 CLI 도구
   하나 때문에 검증된 파일을 흔들 이유가 없어 curl을 동기로 부른다. */
const { execFileSync } = require('child_process');

const DEFAULT_URL = process.env.BIZPAGE_RATES_URL
  || 'https://bizpage-estimate.vercel.app/api/rates';

/* 운영 요율을 받아온다. 실패하면 null — 호출부가 정적값으로 계속 갈지 정할 수 있게
   예외를 던지지 않는다(네트워크 없는 곳에서도 감사는 돌아야 한다). */
function fetchLiveRates(url = DEFAULT_URL) {
  try {
    const out = execFileSync('curl', ['-s', '--max-time', '15', url], {
      encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const data = JSON.parse(out);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

/* 정적 destinationRates에 운영 오버라이드·커스텀 목적지를 반영한 새 배열을 만든다.
   원본 배열·객체는 건드리지 않는다(감사기가 정적값과 비교할 수 있어야 하므로).

   병합 순서는 script.js applyRateOverrides()와 동일하게 맞춘다 — 커스텀 목적지를
   먼저 편입한 뒤 오버라이드를 적용해야, 커스텀 목적지의 요율 수정분이 대상 행을
   찾아 반영된다. 순서가 어긋나면 감사기와 실제 견적이 다른 값을 보게 된다. */
function applyLiveRates(staticRates, live) {
  const merged = staticRates.map((d) => ({ ...d }));
  const byKey = new Map(merged.map((d) => [d.destination_key, d]));

  if (Array.isArray(live.customDestinations)) {
    for (const row of live.customDestinations) {
      if (byKey.has(row.destination_key)) continue; // 내장값 우선(서버와 동일한 방어)
      const { zone, southern_hemisphere, ...fields } = row;
      const copy = { ...fields, __custom: true, __zone: zone, __southern: !!southern_hemisphere };
      merged.push(copy);
      byKey.set(row.destination_key, copy);
    }
  }

  const changed = [];
  if (live.overrides && typeof live.overrides === 'object') {
    for (const [key, fields] of Object.entries(live.overrides)) {
      const dest = byKey.get(key);
      if (!dest || !fields || typeof fields !== 'object') continue;
      for (const [f, v] of Object.entries(fields)) {
        if (dest[f] !== v) changed.push({ key, field: f, from: dest[f], to: v });
        dest[f] = v;
      }
    }
  }
  return { rates: merged, changed, customCount: (live.customDestinations || []).length };
}

/* 감사 스크립트 공통 진입점.
   기본은 라이브(실제 판매가)다 — "고객이 보는 값을 검사한다"가 맞는 기본값이고,
   opt-in으로 두면 아무도 안 켠다. --static을 주거나 네트워크가 없으면 정적값으로
   내려가되, **어느 쪽으로 돌았는지 반드시 화면에 찍는다.** 조용히 정적값으로
   떨어지면 "감사 통과"가 거짓말이 되기 때문이다. */
function loadRatesForAudit(staticRates, argv = process.argv) {
  const wantStatic = argv.includes('--static');
  if (wantStatic) {
    console.log('· 요율 소스: data.js 정적값 (--static)\n');
    return { rates: staticRates, live: false };
  }
  const live = fetchLiveRates();
  if (!live) {
    console.log('⚠ 요율 소스: data.js 정적값 — 운영 요율을 못 받아왔습니다(네트워크/배포 확인).');
    console.log('  관리자 화면에서 수정된 단가는 이 감사에 반영되지 않았습니다.\n');
    return { rates: staticRates, live: false };
  }
  const { rates, changed, customCount } = applyLiveRates(staticRates, live);
  console.log(`· 요율 소스: 운영 실판매가 (${DEFAULT_URL})`);
  console.log(`  정적값과 다른 항목 ${changed.length}건, 관리자 추가 목적지 ${customCount}건 반영`);
  if (changed.length) {
    for (const c of changed.slice(0, 12)) {
      console.log(`    · ${c.key} ${c.field}: ${c.from} → ${c.to}`);
    }
    if (changed.length > 12) console.log(`    · ... 외 ${changed.length - 12}건`);
  }
  console.log('');
  return { rates, live: true, changed };
}

module.exports = { fetchLiveRates, applyLiveRates, loadRatesForAudit, DEFAULT_URL };

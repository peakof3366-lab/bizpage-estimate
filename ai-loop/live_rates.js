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

  /* 🔴 **금액은 바뀌었는데 「요율 기준월」은 안 바뀐 목적지** (WW).
     `rateDate`는 고객 견적서에 「요율 기준: 2026년 06월」로 찍히는 값이다. 그런데
     `ai-loop/apply_rate_updates.js`(견적서 실측 중앙값을 얹는 도구)는 숫자 칸만 쓰고
     `rateDate`는 **일부러 안 건드린다** — 실측은 코퍼스 전체(2025~2026)에서 나온 값이라
     「그 달에 확인했다」가 아니기 때문이다(오늘로 채우면 그게 지어내기다).
     그 결과 **값과 기준월이 어긋난 채로 고객 문서에 나간다.** 감사가 이것을 센다.
   ⚠ 여기서 고치지 않는다. 어떻게 표기할지는 대표 결정이고(대기열), 기준월을 올리면
     「오래된 요율」 경고(QG)가 함께 꺼진다 — 못 지킬 안심을 주는 쪽이다. */
  const NUMERIC_RATE_FIELDS = new Set(['airfare', 'fuel_surcharge', 'hotel_per_room',
    'meal_per_person', 'vehicle_large', 'vehicle_small', 'guide_fee', 'sightseeing_fee',
    'margin_per_traveler', 'golf_fee']);
  const changed = [];
  const dateNotUpdated = [];
  if (live.overrides && typeof live.overrides === 'object') {
    for (const [key, fields] of Object.entries(live.overrides)) {
      const dest = byKey.get(key);
      if (!dest || !fields || typeof fields !== 'object') continue;
      const shownDate = dest.rateDate || null;
      const numChanged = [];
      for (const [f, v] of Object.entries(fields)) {
        if (dest[f] !== v) {
          changed.push({ key, field: f, from: dest[f], to: v });
          if (NUMERIC_RATE_FIELDS.has(f)) numChanged.push(f);
        }
        dest[f] = v;
      }
      /* 숫자가 바뀌었는데 오버라이드에 `rateDate`가 없으면 화면은 **옛 기준월**을 계속 말한다 */
      if (numChanged.length && !fields.rateDate) {
        dateNotUpdated.push({ key, shownDate, fields: numChanged });
      }
    }
  }
  return { rates: merged, changed, dateNotUpdated, customCount: (live.customDestinations || []).length };
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
  const { rates, changed, dateNotUpdated, customCount } = applyLiveRates(staticRates, live);
  console.log(`· 요율 소스: 운영 실판매가 (${DEFAULT_URL})`);
  console.log(`  정적값과 다른 항목 ${changed.length}건, 관리자 추가 목적지 ${customCount}건 반영`);
  if (changed.length) {
    for (const c of changed.slice(0, 12)) {
      console.log(`    · ${c.key} ${c.field}: ${c.from} → ${c.to}`);
    }
    if (changed.length > 12) console.log(`    · ... 외 ${changed.length - 12}건`);
  }
  /* 🔴 값과 기준월이 어긋난 것을 **숫자로** 말한다 — 조용히 두면 고객 문서가
     계속 옛 기준월을 말한다(WW). */
  if (dateNotUpdated && dateNotUpdated.length) {
    const cells = dateNotUpdated.reduce((n, x) => n + x.fields.length, 0);
    console.log(`  🔴 금액은 바뀌었는데 「요율 기준월」이 그대로인 목적지 ${dateNotUpdated.length}곳 (${cells}칸)`);
    console.log('     → 고객 견적서에 그 옛 기준월이 그대로 찍힙니다. 표기를 어떻게 할지는 대표 결정입니다.');
    for (const x of dateNotUpdated.slice(0, 8)) {
      console.log(`     · ${x.key} — 화면 표기 「${x.shownDate || '(없음)'}」 · 바뀐 칸 ${x.fields.length}개`);
    }
    if (dateNotUpdated.length > 8) console.log(`     · ... 외 ${dateNotUpdated.length - 8}곳`);
  }
  console.log('');
  return { rates, live: true, changed, dateNotUpdated };
}

module.exports = { fetchLiveRates, applyLiveRates, loadRatesForAudit, DEFAULT_URL };

/* 고객 브라우저가 계산한 견적을 서버가 다단계로 검증한다.

   ■ 왜 필요한가
   견적 계산 로직은 전부 브라우저(script.js)에 있고 서버에는 없다. 즉 고객이 개발자
   도구로 금액을 바꿔 저장하거나, 그 금액이 담긴 공유 링크를 우리 도메인에서 만들 수
   있었다. 링크가 우리 도메인에 있으면 "이 가격으로 봤다"는 주장에 우리 쪽 근거가
   붙는 셈이라 분쟁 소지가 된다.

   ■ 왜 '재계산'이 아니라 '대조'인가
   서버에서 완전히 재계산하려면 5,000줄짜리 엔진을 서버로 옮겨야 하고, 옮기지 않고
   공식만 다시 구현하면 **두 벌의 공식이 서로 어긋나는** 문제가 생긴다(이 프로젝트에서
   이미 여러 번 겪은 유형이다 — 계수를 한 곳만 고쳐 다른 곳이 낡는 것).
   대신 견적 payload에 이미 들어 있는 P6 스냅샷을 쓴다. 스냅샷에는 **입력 전체와
   적용된 계수 전체, 항목별 단가·수량·금액**이 들어 있다. 그래서 공식을 복제하지 않고도
   "선언한 계수가 서버가 아는 값과 맞는가", "선언한 계수로 그 금액이 나오는가",
   "권위 요율표 대비 말이 되는가"를 층층이 확인할 수 있다.

   ■ 잡을 수 있는 것 / 못 잡는 것 (과장하지 않기 위해 명시)
   잡는다  : 총액·항목 금액 조작, 존재하지 않는 목적지, 요율표에 없는 단가, 범위를
             벗어난 계수, 산술 불일치, 원가 하한 미달, 낡은 요율로 만든 견적
   못 잡는다: 계수와 금액을 서로 앞뒤 맞게 조작한 미세 조작(±수%). 그건 엔진을
             서버로 옮겨야 잡힌다(별도 과제).
   → 그래서 결과는 ok/fail 두 값이 아니라 단계별 기록으로 남긴다. 관리자가 어느
     단계에서 걸렸는지 보고 판단할 수 있어야 한다. */
const destinationRates = require('../../data');

const BUILTIN = new Map(destinationRates.map((d) => [d.destination_key, d]));

/* 계수별 허용 범위 — script.js가 실제로 만들어낼 수 있는 값의 바깥 경계다.
   너무 좁으면 정상 견적이 걸리고, 너무 넓으면 조작을 놓친다. 각 값의 근거:
     paxFactor      PAX_TIERS 최소~최대
     seasonFactor   시즌표 최저(비수기)~최고(성수기)에 노브 상한 2.0을 곱한 여유
     leadFactor     LEAD_TIME_BANDS 최저~최고
     peakFactor     PEAK_CALENDAR·LUNAR_PEAKS 최대 1.35
     fxAdjust       getFxAdjust의 클램프 0.7~1.3과 동일
     bizFactor      1.0(전원 이코노미)~4.0(전원 비즈니스 장거리)
     departureFactor 지방 출발 할증 범위
   ⚠ script.js에서 이 범위를 넘는 값이 나오게 계수를 바꾸면 정상 견적이 '검증 실패'로
     떨어진다. 계수 상한을 바꿀 때는 여기도 같이 볼 것(test_pO가 대조한다). */
const FACTOR_RANGE = {
  paxFactor:       [0.5, 1.5],
  seasonFactor:    [0.5, 2.0],
  leadFactor:      [0.5, 2.0],
  peakFactor:      [1.0, 2.0],
  hotelPeakFactor: [1.0, 2.0],
  fxAdjust:        [0.7, 1.3],
  bizFactor:       [1.0, 4.0],
  departureFactor: [0.8, 1.5],
};

/* 1인당 총액 상식 범위 — 목적지별 요율에서 파생한다(고정 상수로 두면 요율이 오를 때
   낡는다). 최저가 구성(1박·최소 항목)과 최대 구성(장기·전원 비즈니스·최대 계수)의
   대략적인 바깥 경계이며, 조작을 잡는 최후 그물이지 정밀 검산이 아니다. */
function perPersonBand(dest, days) {
  const nights = Math.max(0, days - 1);
  /* 하한: 항공·유류만 있고 나머지를 다 뺀 뒤 할인까지 최대로 먹은 수준 */
  const floor = (dest.airfare + dest.fuel_surcharge) * 0.5;
  /* 상한: 전 항목 포함 + 좌석 4배 + 계수 곱이 최대로 겹친 수준 */
  const perDayGround = dest.hotel_per_room + dest.meal_per_person * 3
    + dest.vehicle_large + dest.guide_fee;
  const ceil = ((dest.airfare + dest.fuel_surcharge) * 4.0
    + perDayGround * Math.max(nights, 1)
    + dest.sightseeing_fee * 2.1
    + dest.margin_per_traveler) * 2.5;
  return { floor: Math.round(floor), ceil: Math.round(ceil) };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* 권위 요율 = data.js 정적값 위에 DB 오버라이드를 덮은 것.
   고객 브라우저가 보는 것과 같은 소스여야 하므로 병합 순서도 같다. */
function authoritativeRate(destKey, overrides, customRow) {
  const base = BUILTIN.get(destKey) || customRow || null;
  if (!base) return null;
  const ov = overrides && overrides[destKey];
  return ov && typeof ov === 'object' ? { ...base, ...ov } : { ...base };
}

/* 견적 하나를 검증한다.
   payload : 브라우저가 /api/quotes로 보낸 견적 레코드(P6 스냅샷 포함)
   ctx     : { overrides, customRow, coefficients } — 서버가 DB에서 읽어온 권위 데이터
   반환    : { ok, verdict, steps: [{ id, label, ok, detail }] }
             verdict = 'verified' | 'review' — review는 '거부'가 아니라 '사람이 봐야 함'.
             고객 리드를 버리지 않기 위해서다(견적은 상담의 시작점이다). */
function verifyQuote(payload, ctx = {}) {
  const steps = [];
  const step = (id, label, ok, detail = '') => { steps.push({ id, label, ok, detail }); return ok; };
  const p = payload || {};

  /* ── 1단계: 입력이 실재하는 값인가 ─────────────────────────────
   🔴 **이름이 둘이다** (XJ). 브라우저가 보내는 견적 스냅샷(`estRecord`)은 목적지를
     `destKey`로 담고, 공유 payload에서 만든 얕은 대조판(`shareToVerifyPayload`)은
     `destination`으로 담는다. 여기서는 `destination`만 봤다 —
     **그래서 스냅샷이 딸려 온 견적은 언제나 「알 수 없는 목적지: undefined」**였다.
     즉 촘촘하라고 보낸 스냅샷이 오히려 검증을 통째로 무력화했고(1단계에서 걸리면
     요율표 대조·기준월 검사가 아예 안 돈다), 고객 자동 발급은 늘 「담당자 확인」으로
     떨어졌다. `test_pO`가 못 잡은 이유는 픽스처를 **코드를 보고** 만들어서다
     (`destination`으로 지어 놓았다) — 「픽스처는 서버가 실제로 받는 모양이어야 한다」.
   ⚠ 둘 다 받는다. 한쪽 이름으로 통일하려면 이미 나간 브라우저의 캐시된 `script.js`가
     전부 바뀌기를 기다려야 하는데, 그동안 들어오는 견적은 검증을 못 받는다. */
  const destKey = p.destination || p.destKey;
  const dest = authoritativeRate(destKey, ctx.overrides, ctx.customRow);
  step('dest', '목적지 확인', !!dest, dest ? destKey : `알 수 없는 목적지: ${destKey}`);

  const pax = num(p.participants);
  const days = num(p.days);
  step('pax', '인원 범위', pax !== null && pax >= 1 && pax <= 1000, `인원 ${p.participants}`);
  step('days', '일수 범위', days !== null && days >= 1 && days <= 60, `일수 ${p.days}`);

  /* 출발일은 과거여도 견적 자체는 성립한다(지난 일정 재견적). 다만 리드타임 계수가
     의미를 잃으므로 기록만 남기고 실패로 치지 않는다. */
  const sd = typeof p.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : null;
  step('date', '출발일 형식', !!sd, sd || `형식 오류: ${p.startDate}`);

  /* ── 2단계: 선언한 계수가 허용 범위 안인가 ───────────────────── */
  const outOfRange = [];
  for (const [key, [lo, hi]] of Object.entries(FACTOR_RANGE)) {
    const v = num(p[key]);
    if (v === null) continue;           // 안 보낸 계수는 검사 대상이 아님
    if (v < lo || v > hi) outOfRange.push(`${key}=${v} (허용 ${lo}~${hi})`);
  }
  step('factors', '계수 범위', outOfRange.length === 0, outOfRange.join(', ') || '전부 정상 범위');

  /* ── 3단계: 관리자 계수 노브가 서버 값과 같은가 ───────────────
     고객이 노브를 바꿔 보낼 수는 없지만, 오래된 탭에서 옛 노브로 계산한 견적이
     들어올 수 있다. 그건 조작이 아니라 '낡음'이라 구분해서 기록한다. */
  if (p.coef && ctx.coefficients) {
    const drift = Object.keys(ctx.coefficients)
      .filter((k) => num(p.coef[k]) !== null && Math.abs(p.coef[k] - ctx.coefficients[k]) > 1e-6)
      .map((k) => `${k}: 견적 ${p.coef[k]} vs 현재 ${ctx.coefficients[k]}`);
    step('coef', '계수 노브 일치', drift.length === 0, drift.join(', ') || '현재 설정과 일치');
  }

  /* ── 4단계: 항목 산술이 맞는가 ─────────────────────────────────
   🔴 **항목이 아예 안 온 경우와 비어서 온 경우는 다르다** (XJ).
     `shareToVerifyPayload`는 항목을 **일부러 안 넘긴다** — 공유 payload의 rows에는
     비공개 항목이 빠져 있어 합계가 총액과 안 맞는 게 정상이라, 그대로 대조하면
     **거짓 실패**가 난다. 그 파일 주석은 「그래서 해당 단계를 건너뛴다」고 적혀 있었는데
     **여기가 안 건너뛰고 있었다** — 그 경로로 온 견적은 늘 `items`·`sum`에서 걸렸다.
     (스냅샷이 온 경로는 `destKey`를 못 읽어 걸렸으니, **두 경로가 각자 다른 이유로**
      전부 걸리고 있었다. 검증은 통과하는 견적이 없으면 아무것도 지키지 못한다.)
   ⚠ 그렇다고 조용히 건너뛰지 않는다 — **건너뛴 사실을 단계로 남긴다.** 안 남기면
     관리자 화면에 「통과」로만 보여서, 얕게 본 것과 촘촘히 본 것이 구별되지 않는다.
   ⚠ **빈 배열은 그대로 실패다**(`items: []`). 엔진이 만든 견적에 항목이 0개일 수는 없다. */
  const total = num(p.total);
  const hasItems = Array.isArray(p.items);
  const items = hasItems ? p.items : [];
  if (!hasItems) {
    step('items', '항목 대조 생략', true, '항목이 없는 payload — 총액·1인당·상식 범위로만 본다');
  } else {
    step('items', '항목 존재', items.length > 0, `${items.length}개 항목`);

    const badAmounts = items.filter((it) => num(it.amount) === null || it.amount < 0)
      .map((it) => it.name);
    step('amounts', '항목 금액 형식', badAmounts.length === 0, badAmounts.join(', ') || '전부 정상');

    const sum = items.reduce((a, it) => a + (num(it.amount) || 0), 0);
    step('sum', '항목 합계 = 총액', total !== null && Math.abs(sum - total) <= 2,
      total === null ? '총액 없음' : `합계 ${sum.toLocaleString()} vs 총액 ${total.toLocaleString()}`);
  }

  const visible = num(p.visibleTotal), hidden = num(p.hiddenTotal);
  if (visible !== null && hidden !== null && total !== null) {
    step('split', '공개+비공개 = 총액', Math.abs(visible + hidden - total) <= 2,
      `${visible.toLocaleString()} + ${hidden.toLocaleString()} vs ${total.toLocaleString()}`);
  }

  const perPerson = num(p.perPerson);
  if (perPerson !== null && total !== null && pax) {
    step('perperson', '1인당 × 인원 = 총액', Math.abs(perPerson * pax - total) <= pax + 2,
      `${perPerson.toLocaleString()} × ${pax} vs ${total.toLocaleString()}`);
  }

  /* ── 5단계: 권위 요율표 대비 말이 되는 금액인가 ──────────────── */
  if (dest && pax && days && perPerson !== null) {
    const band = perPersonBand(dest, days);
    step('band', '1인당 금액 상식 범위',
      perPerson >= band.floor && perPerson <= band.ceil,
      `1인당 ${perPerson.toLocaleString()} (허용 ${band.floor.toLocaleString()}~${band.ceil.toLocaleString()})`);
  }

  /* ── 6단계: 이 견적이 만들어진 뒤 요율이 바뀌었는가 ───────────
     조작이 아니라 신선도 문제다. 바뀌었으면 담당자가 재산출해야 한다.
   ⚠ **이 검사는 오버라이드가 `rateDate`를 함께 가질 때만 돈다.** 실측(2026-08-26)으로
     운영 오버라이드 23곳 중 **2곳만** 그렇다 — 나머지 21곳은 금액만 바뀌고 기준월이
     data.js 값 그대로라(WW의 「21곳 59칸」), 기본 요율로 만든 견적과 구별되지 않는다.
     그래서 7단계가 따로 있다. 이 둘을 하나로 여기지 말 것. */
  if (dest) {
    const same = !p.rateDate || !dest.rateDate || p.rateDate === dest.rateDate;
    step('freshness', '요율 기준월 일치', same,
      same ? `기준월 ${dest.rateDate || '—'}` : `견적 ${p.rateDate} vs 현재 ${dest.rateDate} — 재산출 권장`);
  }

  /* ── 7단계: 이 견적이 **운영 요율로** 계산됐는가 (XI) ──────────
     브라우저가 `/api/rates`를 못 받으면 엔진은 `data.js` 기본값으로 계산한다. 화면에는
     그냥 「견적 금액」으로 보이고, 지금까지는 그 견적이 저장되고 **견적서 링크까지**
     나갔다. 실측(2026-08-26 · 30명 4일): 오버라이드가 있는 23개 목적지 **전부**가
     움직이고 중앙값 5.9% · 최대 27.3%다. 방향이 아래로 벌어지면(동유럽 −19.5%)
     **우리가 그 차액을 문다.**
   ⚠ 이건 조작 방어가 아니다 — 표식을 지우고 보내면 그만이다. 조작은 다른 단계가
     본다. 여기서 막는 것은 **우리 쪽 사고**(요율 로드 실패)로 만들어진 문서다.
   ⚠ 없으면 통과시킨다. 캐시된 옛 `script.js`가 열려 있는 브라우저는 이 칸을 안 보내는데,
     그걸 실패로 치면 **멀쩡히 돌던 견적이 통째로 「담당자 확인」으로 떨어진다.** */
  if (p.rateSource && typeof p.rateSource === 'object') {
    const st = String(p.rateSource.state || 'unknown');
    const WHY = {
      failed:  '운영 요율을 못 받아 기본값으로 계산됨',
      pending: '운영 요율이 도착하기 전에 계산됨',
      skipped: '요율표 자체가 로드되지 않음',
      unknown: '요율 출처를 알 수 없음',
    };
    step('ratesrc', '운영 요율로 계산', st === 'applied',
      st === 'applied'
        ? `오버라이드 ${Number(p.rateSource.n) || 0}곳 · 환율 ${Number(p.rateSource.fx) || 0}건`
        : `${WHY[st] || st} — 재산출 필요` + (p.rateSource.error ? ` (${String(p.rateSource.error).slice(0, 80)})` : ''));
  }

  const failed = steps.filter((s) => !s.ok);
  return {
    ok: failed.length === 0,
    verdict: failed.length === 0 ? 'verified' : 'review',
    failedSteps: failed.map((s) => s.id),
    steps,
  };
}

module.exports = { verifyQuote, perPersonBand, authoritativeRate, FACTOR_RANGE };

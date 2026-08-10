/* SG 검증 — 견적서에서 뽑은 실측을 **오늘 환율 기준으로 되돌려** 요율과 비교한다

   왜 —  요율표 단가는 「오늘 환율 기준」이라는 약속 위에 서 있다. `rate_fx_baseline`에
   기준 환율을 적어 두고 견적 엔진이 `오늘 ÷ 기준`으로 보정한다(script.js getFxAdjust).
   그런데 견적서에서 뽑은 실측 금액에는 **그 견적서의 환율**이 박혀 있다. 그대로 기준가와
   비교하면 두 환율의 차이가 통째로 '오차'로 둔갑하고, 그 오차가 갱신 제안을 타고 요율을
   밀어올린다.

   크기(코퍼스 34건, 2026-08-10 환율 대비): 어긋남 **중앙값 5.1% · 최대 12.1%**
     · BSI 도쿄       ¥ 10   vs 오늘 8.92   → +12.1%
     · 굿리치 체코    € 1,740 vs 오늘 1,627  → + 6.9%
     · 일본 견적서 10건이 전부 ¥9.5          → + 6.5%
   트랙 A 목표가 ±5%다 — 이것 하나로 목표가 깨진다.

   ⚠ `rate_fx_baseline`을 견적서 환율로 심는 방법은 **쓸 수 없다.** 그 표는 목적지당 한
     줄인데, 한 견적서 안에서도 **항목마다 환율이 다르다**(키움 하노이: 항공 420,000원은
     원화, 차량 $600은 환산). 그래서 값을 고치지 않고 "이 값은 이 환율로 환산됐다"만
     남기고, 요율과 견줄 때 되돌린다.

   이 파일이 고정하는 성질 —
     ① 추출기가 항목마다 **어느 환율로 환산했는지**를 근거에 실어 보낸다
     ② 원화로 적힌 항목에는 붙지 않는다(환산한 적이 없으므로 되돌릴 것도 없다)
     ③ 화면이 제보 금액을 기준가와 견줄 때 **세 곳 모두** 되돌린다
     ④ 담당자가 손으로 고친 칸은 되돌릴 대상에서 빠진다

   실행: node ai-loop/test_sG_report_fx.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 40;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
const doc = (rows) => { ln = 0; return rows.map((r) => line(r)); };

/* ══ [1] 추출기가 항목별 환율을 근거에 실어 보내는가 ═══════════════════════ */
console.log('[1] 어느 환율로 환산했는지 항목마다 알려주는가');
{
  /* 항공은 원화, 호텔·식사는 달러 — 한 견적서 안에서 섞이는 실제 모양이다 */
  const r = X.readOneBlock(doc([
    ['현재 $1 = 1,440원 기준'],
    ['인 원', '30'],
    ['항공', '항공료', '420,000', '30', '1', '12,600,000'],
    ['호텔', '쉐라톤', '$', '217', '3', '15', '$', '9,765'],
    ['식사', '1일차 중식', '$', '20', '1', '30', '$', '600'],
  ]), { USD: 1440 }, null);

  ok('환산된 호텔에 환율이 붙는다',
    r.evidence.hotel && r.evidence.hotel.fx && r.evidence.hotel.fx.rate === 1440,
    JSON.stringify(r.evidence.hotel && r.evidence.hotel.fx));
  ok('통화도 함께 온다', r.evidence.hotel.fx.currency === 'USD');
  ok('원화로 적힌 항공에는 붙지 않는다',
    r.evidence.airfare && !r.evidence.airfare.fx,
    JSON.stringify(r.evidence.airfare && r.evidence.airfare.fx));
  ok('계산 항목(식비)에도 붙는다',
    r.evidence.meal && r.evidence.meal.fx && r.evidence.meal.fx.rate === 1440,
    JSON.stringify(r.evidence.meal && r.evidence.meal.fx));
  ok('호텔 값이 환산된 원화다', r.values.hotel === 217 * 1440, String(r.values.hotel));
}
{
  /* 환율을 모르면 환산 자체가 없으므로 fx도 없다 */
  const r = X.readOneBlock(doc([
    ['인 원', '30'],
    ['호텔', '쉐라톤', '$', '217', '3', '15', '$', '9,765'],
  ]), {}, null);
  ok('환산하지 않은 외화 줄에는 환율이 안 붙는다', !(r.evidence.hotel && r.evidence.hotel.fx),
    JSON.stringify(r.evidence.hotel));
}

/* ══ [2] 서버가 셋을 함께 받고, 하나라도 빠지면 거절하는가 ═════════════════
   ⚠ 통화만 있고 환율이 없으면 되돌릴 수 없고, 환율만 있고 항목 목록이 없으면
     원화 항목까지 잘못 되돌린다. 조용히 버리면 그 제보는 영영 못 되돌린다. */
console.log('\n[2] 서버가 환율 정보를 온전할 때만 받는가');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'quotes.js'), 'utf8');
  ok('세 값을 함께 받는다', /fxCurrency,\s*fxRate,\s*fxFields/.test(src));
  ok('하나라도 빠지면 거절한다', /fxGiven\.length\s*!==\s*3/.test(src));
  ok('자릿수 검사를 추출기와 같은 함수로 한다', /pdfExtract\.fxPlausible/.test(src));
  ok('DB에 세 칸을 함께 넣는다', /fx_currency,\s*fx_rate,\s*fx_fields/.test(src));
  ok('조회에서도 세 칸을 돌려준다', /fxCurrency:\s*r\.fx_currency/.test(src) && /fxFields:/.test(src));
  const mig = fs.readFileSync(path.join(__dirname, 'db_migrate.js'), 'utf8');
  ok('마이그레이션에 세 칸이 있다',
    /fx_currency text/.test(mig) && /fx_rate numeric/.test(mig) && /fx_fields text/.test(mig));
}

/* ══ [3] 화면이 되돌리는가 — 실제 admin.html의 함수를 그대로 돌린다 ════════ */
console.log('\n[3] 제보 금액을 오늘 기준으로 되돌리는가');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  /* ⚠ 소스에 문자열이 있는지만 보면 "함수는 있는데 아무도 안 부른다"를 못 잡는다.
     그래서 함수 본문을 꺼내 **실제로 실행**한다. */
  const m = html.match(/const REPORT_FX_KEY = \{[\s\S]*?function reportValueToday\(report, rateField\) \{[\s\S]*?\n  \}/);
  ok('reportValueToday를 소스에서 찾았다', !!m);
  if (m) {
    const fxRatesCache = { USD: 1400, JPY: 8.92 };
    const body = m[0].replace(/const REPORT_FX_KEY/, 'var REPORT_FX_KEY');
    const reportValueToday = new Function('fxRatesCache', body + '; return reportValueToday;')(fxRatesCache);

    const rep = {
      airfareUnit: 420000, hotelUnit: 312480, mealUnit: 28800,
      fxCurrency: 'USD', fxRate: 1440, fxFields: ['hotel', 'meal'],
    };
    ok('환산된 호텔은 오늘 기준으로 내려간다',
      Math.round(reportValueToday(rep, 'hotel_per_room')) === Math.round(312480 * 1400 / 1440),
      String(reportValueToday(rep, 'hotel_per_room')));
    ok('원화 항공은 손대지 않는다', reportValueToday(rep, 'airfare') === 420000,
      String(reportValueToday(rep, 'airfare')));
    ok('fxFields에 없는 항목은 손대지 않는다',
      reportValueToday({ vehicleUnit: 100000, fxCurrency: 'USD', fxRate: 1440, fxFields: ['hotel'] }, 'vehicle_large') === 100000);
    ok('환율 정보가 없는 옛 제보는 그대로다',
      reportValueToday({ hotelUnit: 312480 }, 'hotel_per_room') === 312480);
    ok('오늘 환율을 모르면 손대지 않는다',
      reportValueToday({ hotelUnit: 100, fxCurrency: 'EUR', fxRate: 1740, fxFields: ['hotel'] }, 'hotel_per_room') === 100);
    ok('값이 없으면 null이다', reportValueToday({ fxCurrency: 'USD', fxRate: 1440, fxFields: ['hotel'] }, 'hotel_per_room') === null);

    /* 엔화 12.1% — 되돌리지 않으면 이만큼이 통째로 '오차'로 둔갑한다 */
    const jp = { hotelUnit: 320000, fxCurrency: 'JPY', fxRate: 10, fxFields: ['hotel'] };
    const back = reportValueToday(jp, 'hotel_per_room');
    ok('엔화 견적서(¥10)가 오늘(8.92) 기준으로 11% 내려간다',
      Math.abs(back / 320000 - 0.892) < 0.001, String(back));
  }
}

/* ══ [4] 되돌리는 곳이 **세 군데 모두**인가 ════════════════════════════════
   ⚠ 결함 생성기 ① — 한 곳만 고치면 나머지 자리는 조용히 옛 환율로 비교한다.
   제보 금액을 기준가와 견주는 자리는 갱신 제안 · 기준가 이상 경고 · 견적 정확도 셋이다. */
console.log('\n[4] 비교하는 자리가 전부 되돌리는가');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  const calls = (html.match(/reportValueToday\(/g) || []).length;
  ok('reportValueToday를 정의 포함 4번 이상 쓴다(정의 1 + 사용 3)', calls >= 4, String(calls));
  /* 옛 방식(제보 값을 직접 꺼내 기준가와 나누기)이 남아 있지 않은가 */
  ok('갱신 제안이 raw 값을 직접 쓰지 않는다', !/const reported = r\[reportKey\]/.test(html));
  ok('기준가 경고가 raw 값을 직접 쓰지 않는다', !/put\(r\.destinationKey, 'airfare', ts, r\.airfareUnit\)/.test(html));
}

/* ══ [5] 손으로 고친 칸은 되돌릴 대상에서 빠지는가 ═════════════════════════ */
console.log('\n[5] 담당자가 고쳐 쓴 칸을 환산값으로 취급하지 않는가');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  ok('추출 당시의 값을 함께 기억한다', /PR_FX_BY_FIELD\[f\.key\]\s*=\s*\{[^}]*value:\s*input\.value/.test(html));
  ok('값이 바뀌었으면 뺀다', /String\(el\.value\)\s*===\s*String\(PR_FX_BY_FIELD\[k\]\.value\)/.test(html));
  ok('제출 본문에 실어 보낸다', /fxPayload/.test(html) && /\}, fxPayload,/.test(html));
  ok('화면이 환산 환율을 보여준다', /으로 환산/.test(html));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

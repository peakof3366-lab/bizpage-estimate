const { sql } = require('./_lib/db');
const { requireAdmin } = require('./_lib/auth');
const OpenAI = require('openai');
/* 내장 목적지 키 집합 — 제보(priceReport)의 destinationKey가 실제 목적지인지 검증해
   존재하지 않는/오타 키로 실측 통계가 오염되는 것을 막는다(커스텀 목적지는 DB 조회로 보강). */
const destinationRates = require('../data');
const BUILTIN_DEST_KEYS = new Set(destinationRates.map((d) => d.destination_key));
const { safeId, payloadTooLarge, toNumberOrNull, trimText } = require('./_lib/public_input');
const { verifyQuote } = require('./_lib/quote_verify');
/* 견적서 PDF 층 구조 추출 (RZ) — 왜 이렇게 나눴는지는 그 파일 머리말에 있다 */
const pdfExtract = require('./_lib/pdf_extract');
/* 「이 값을 실측으로 반영해도 되는가」의 잣대 — 화면·감사기와 **같은 파일**을 쓴다.
   여기에 규칙을 다시 적으면 서버는 빼고 화면은 반영하는 상태가 된다(결함 생성기 ①). */
const PLAUSIBILITY = require('../plausibility');

/* 검증에 필요한 권위 데이터(요율 오버라이드·계수 노브·커스텀 목적지)를 모은다.
   조회에 실패하면 unavailable로 표시한다 — 빈 값으로 통과시키면 '검증했다'는
   기록만 남고 실제로는 아무것도 대조하지 않은 게 되기 때문이다. */
async function loadVerifyContext(destKey) {
  try {
    const [ovRows, coefRows, customRows] = await Promise.all([
      sql`select destination_key, overrides from rate_overrides`,
      sql`select value from app_settings where key = 'coefficients'`,
      destKey ? sql`select * from custom_destinations where destination_key = ${destKey}` : Promise.resolve([]),
    ]);
    const overrides = {};
    for (const r of ovRows) overrides[r.destination_key] = r.overrides;
    return {
      overrides,
      coefficients: coefRows.length ? coefRows[0].value : null,
      customRow: customRows.length ? customRows[0] : null,
    };
  } catch (err) {
    console.error('[quotes] 검증 컨텍스트 조회 실패:', err);
    return { unavailable: true };
  }
}

/* ?action= 분기 (신규) — "실제 계약가 업데이트" 위젯(요율 관리 탭 맨 위)이 쓰는
   관리자 전용 엔드포인트 3개. action이 없으면 기존 공개 POST(견적 제출)/관리자 GET(견적
   목록)이 그대로 동작한다(하위호환). Vercel Hobby 함수 12개 한도라 새 파일을 안 만들고
   이 파일에 얹었다. */

/* 항목별 상한 — 이 이상은 LLM 오독/사용자 오타로 보고 거부한다. 크래시 방지가 아니라
   명백히 말이 안 되는 값이 "제안"으로 화면에 뜨는 것 자체를 막기 위한 상식적 상한선.
   항목마다 현실적인 규모가 달라(항공료 > 호텔 1박 > 식사 1인) 상한도 따로 둔다. */
const AIRFARE_UNIT_MAX = 50000000;
const HOTEL_UNIT_MAX = 10000000;
const MEAL_UNIT_MAX = 1000000;
/* RQ: 추가 항목 상한. 요율표의 현실적 규모에 맞춘다 —
   유류할증은 1인당이라 작고, 차량·가이드는 '대당/일' 또는 '일당'이라 크다. */
const FUEL_UNIT_MAX = 2000000;
const VEHICLE_UNIT_MAX = 10000000;
const GUIDE_UNIT_MAX = 5000000;
const SIGHT_UNIT_MAX = 2000000;
/* TJ: 골프 1인 1회 라운딩(그린피+카트+캐디피). 실측 범위 133,000(오키나와)~267,180(카자흐).
   관광비와 자릿수가 달라 칸도 상한도 따로 둔다. */
const GOLF_UNIT_MAX = 2000000;
/* 1인 최종 판매가 — 요율이 아니라 우리 견적의 정확도를 재는 기준선이다. */
const SELL_UNIT_MAX = 50000000;
const HOTEL_NAME_MAX_LEN = 80;

/* ═══════════════════════════════════════════════════════════════════════════
   견적서에서 단가 뽑기 (RN) — **AI에게 숫자를 찾게 하지 않는다. 고르게만 한다.**

   왜 바꿨나: 예전에는 텍스트를 통째로 주고 "항공료·호텔·식비를 찾아라"고 시켰다.
   실제 하나투어 견적서로 재 보니 **3칸 중 2칸이 틀렸고 신뢰도는 high**였다:
     호텔 1박 → 320,000 (항공료를 그대로 복사)   실제 152,000
     식비 1식 → 90,000  (유류할증료를 집어옴)     실제 17,100 / 33,250
   원인은 PDF 텍스트에서 표가 납작해지는 것이다. 「항공」「호텔」「식사」 라벨은
   숫자와 한참 떨어진 다른 블록에 있어서, AI가 위치로 추측하다 옆 줄을 가져온다.

   고친 구조 — 두 단계로 나눈다:
     ① **산술로 후보를 만든다(코드).** 여행사 견적서의 상세 내역서는 예외 없이
        `단가 × 수량 × 횟수 = 총금액`이다. 이 관계가 실제로 성립하는 줄만 남긴다.
        → 이 단계에서 나온 숫자는 문서에 실제로 있는 값이고, 서로 검산까지 맞다.
     ② **AI는 그중 몇 번 줄인지만 고른다.** 숫자를 직접 말하지 못하게 하고
        **줄 번호**로만 답하게 한다. 서버는 그 번호로 값을 되찾는다.
        → AI가 없는 숫자를 지어낼 수 있는 경로가 **구조적으로** 사라진다.

   ⚠ 이 방식의 한계도 분명히 해 둔다: 상세 내역서가 없는 패키지 견적(총액만 있는 것)은
   후보가 안 나온다. 그건 못 찾는 게 맞고, 화면이 "이 견적서에는 단가표가 없다"고 말한다.
   ai-loop/test_rN_pdf_rows.js가 실제 견적서 텍스트로 이 두 단계를 고정한다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 한 줄에서 숫자만 뽑는다(₩·쉼표·괄호 제거). 0과 음수는 단가가 될 수 없어 버린다. */
function numbersInLine(line) {
  return (String(line).match(/\d[\d,]*/g) || [])
    .map((s) => Number(s.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/* 총금액이 이 값보다 작으면 단가 줄로 보지 않는다 — 날짜·인원·전화번호가
   우연히 곱셈으로 맞아떨어지는 것을 걸러낸다. */
const ROW_MIN_TOTAL = 10000;
const ROW_MAX_CANDIDATES = 40;

function extractUnitRows(text) {
  const found = [];
  String(text).split(/\r?\n/).forEach((rawLine, lineNo) => {
    const line = rawLine.trim();
    const ns = numbersInLine(line);
    if (ns.length < 3 || ns.length > 12) return;   /* 12개 넘게 든 줄은 표가 아니라 문단이다 */
    for (let a = 0; a < ns.length; a++) {
      for (let b = 0; b < ns.length; b++) {
        if (b === a) continue;
        for (let d = 0; d < ns.length; d++) {
          if (d === a || d === b) continue;
          if (ns[d] < ROW_MIN_TOTAL) continue;
          /* 단가 × 수량 = 총금액 */
          if (Math.abs(ns[a] * ns[b] - ns[d]) <= 1) {
            found.push({ lineNo, line, unit: ns[a], qty: ns[b], times: 1, total: ns[d] });
          }
          /* 단가 × 수량 × 횟수(박수) = 총금액 */
          for (let c = 0; c < ns.length; c++) {
            if (c === a || c === b || c === d) continue;
            if (Math.abs(ns[a] * ns[b] * ns[c] - ns[d]) <= 1) {
              found.push({ lineNo, line, unit: ns[a], qty: ns[b], times: ns[c], total: ns[d] });
            }
          }
        }
      }
    }
  });
  /* 한 줄에서 여러 조합이 맞을 수 있다(152,000×7×3 과 7×3×… 등). 같은 (줄,총액)이면
     **단가가 가장 큰 것**만 남긴다 — 우리가 찾는 것은 단가이지 수량이 아니다. */
  const best = new Map();
  found.forEach((r) => {
    const k = r.lineNo + '|' + r.total;
    const cur = best.get(k);
    if (!cur || r.unit > cur.unit) best.set(k, r);
  });
  return Array.from(best.values())
    .sort((x, y) => x.lineNo - y.lineNo)
    .slice(0, ROW_MAX_CANDIDATES)
    .map((r, i) => Object.assign({ idx: i }, r));
}

/* ═══ 소계로 줄을 묶는다 (RP) ══════════════════════════════════════════════
   왜: 식사는 하루치라 여러 줄을 더해야 하는데(중식+석식), 후보가 15개면 담당자가
   무엇을 체크할지 매번 판단해야 한다. 수백 건을 넣는 자리에서 그건 너무 무겁다.

   여행사 견적서는 항목 묶음마다 **소계 줄**이 따로 있다:
       17,100 × 15 × 2 =   513,000  ┐
       33,250 × 15 × 2 =   997,500  ┘
                          1,510,500   ← 소계 (앞 두 줄의 합)
   이 소계도 **산술로 찾을 수 있다.** 앞선 연속 줄들의 총금액 합과 정확히 같은 숫자가
   단독으로 나오는 줄이 소계다. 그러면 개별 줄이 아니라 **묶음**을 고르게 된다.

   ⚠ 그리고 이게 검증이 된다 — 고른 묶음의 총액 합이 소계와 일치하면 **빠진 줄이 없다는
   뜻**이다. 눈대중이 아니라 산수로 "다 골랐다"를 확인할 수 있다. */
const GROUP_MAX = 12;
function extractRowGroups(text, rows) {
  if (!rows.length) return [];
  const lines = String(text).split(/\r?\n/);
  const byLine = new Map();
  rows.forEach((r) => {
    if (!byLine.has(r.lineNo)) byLine.set(r.lineNo, []);
    byLine.get(r.lineNo).push(r);
  });

  const groups = [];
  let pending = [];
  for (let i = 0; i < lines.length && groups.length < GROUP_MAX; i++) {
    if (byLine.has(i)) { pending = pending.concat(byLine.get(i)); continue; }
    if (!pending.length) continue;
    const ns = numbersInLine(lines[i]);
    if (!ns.length) continue;
    /* ⚠ 쌓인 줄 **전부**와만 맞춰 보면 안 된다. 견적서 맨 위의 '총 판매가' 같은 줄이
       먼저 잡혀 있으면 그 뒤로는 어떤 소계와도 안 맞아 묶음이 하나도 안 나온다
       (실제로 그래서 0개가 나왔다). **뒤에서부터 몇 줄씩** 맞춰 본다 —
       소계는 바로 앞의 연속된 줄들을 더한 값이기 때문이다. */
    let matched = null;
    for (let k = pending.length; k >= 1 && !matched; k--) {
      const tail = pending.slice(pending.length - k);
      const sum = tail.reduce((n, r) => n + r.total, 0);
      if (ns.some((n) => Math.abs(n - sum) <= 1)) matched = { tail, sum };
    }
    if (matched) {
      groups.push({
        idx: groups.length,
        rowIdxs: matched.tail.map((r) => r.idx),
        unitSum: matched.tail.reduce((n, r) => n + r.unit, 0),
        totalSum: matched.sum,
        subtotal: matched.sum,
        rows: matched.tail.slice(),
        lines: matched.tail.map((r) => r.line.replace(/\s+/g, ' ').slice(0, 70)),
      });
      pending = [];
    }
  }
  return annotateGroups(groups);
}

/* 묶음이 무엇일지 **코드가 먼저 짐작한다** (RP).
   ⚠ AI에게만 맡기면 이 문서에서 계속 틀린다 — 항목 이름이 숫자와 떨어져 있어서다.
   그런데 **수량 패턴은 결정적이다**:
       수량 = 1        → 차량·가이드처럼 전체 단위 (1인당 항목이 아니다)
       수량 ≈ 인원      → 1인당 항목 (항공·식사·입장료)
       수량 ≈ 인원 ÷ 2  → 객실 수 (호텔)
   여기에 '횟수'를 더하면 식사(횟수 2 이상 = 여러 끼)와 입장료(횟수 1)가 갈린다.
   이건 힌트일 뿐 확정이 아니다 — 담당자가 최종으로 고른다. */
function annotateGroups(groups) {
  const allQty = [];
  groups.forEach((g) => g.rows.forEach((r) => allQty.push(r.qty)));
  const pax = allQty.length ? Math.max.apply(null, allQty) : 0;
  const near = (a, b) => b > 0 && Math.abs(a - b) / b <= 0.25;

  groups.forEach((g) => {
    const rs = g.rows;
    const everyQty1 = rs.every((r) => r.qty === 1);
    const perPerson = pax > 0 && rs.every((r) => near(r.qty, pax));
    const roomLike = pax > 0 && rs.every((r) => near(r.qty, pax / 2)) && rs.some((r) => r.times > 1);
    const multiTimes = rs.some((r) => r.times >= 2);

    let hint = '';
    if (everyQty1) hint = '전체 단위 (차량·가이드 등) — 1인당 항목 아님';
    else if (roomLike) hint = '객실 단위 — 호텔일 가능성';
    else if (perPerson && multiTimes) hint = '1인당 · 여러 회 — 식사일 가능성';
    else if (perPerson) hint = '1인당 · 1회 — 항공 또는 입장료';
    g.hint = hint;
    g.perPerson = perPerson;
  });
  return groups;
}

/* AI에게 보낼 원문 구간을 고른다 (RN).
   ⚠ 앞에서부터 잘라 보내면 안 된다. 하나투어 견적서는 「항공·호텔·중식·석식」 같은
   **항목 이름이 표 맨 뒤 별도 블록**에 몰려 있어서, 앞부분만 보내면 AI가 라벨을 아예
   못 본다. 실제로 그래서 식비 자리에 입장료 줄이 들어왔다.
   그래서 **머리(호텔명·기간이 있는 곳) + 단가 줄이 시작되는 곳부터 끝까지**를 보낸다. */
const PROMPT_HEAD_CHARS = 1500;
const PROMPT_TAIL_CHARS = 6500;
function promptContext(text, rows) {
  const s = String(text);
  if (s.length <= PROMPT_HEAD_CHARS + PROMPT_TAIL_CHARS) return s;
  const head = s.slice(0, PROMPT_HEAD_CHARS);
  /* 첫 단가 줄이 있는 지점부터 뒤쪽을 가져온다 — 라벨 블록은 표 뒤에 온다 */
  let from = 0;
  if (rows.length) {
    const firstLine = rows[0].line;
    const at = s.indexOf(firstLine);
    if (at >= 0) from = at;
  }
  const tail = s.slice(from, from + PROMPT_TAIL_CHARS);
  return head + '\n…(중략)…\n' + tail;
}

function buildExtractionPrompt(text, rows, groups) {
  const list = rows.map((r) =>
    `[${r.idx}] 단가 ${r.unit.toLocaleString()}원 × 수량 ${r.qty} × 횟수 ${r.times} = ${r.total.toLocaleString()}원   ← 원문: ${r.line.replace(/\s+/g, ' ').slice(0, 110)}`
  ).join('\n');

  const glist = (groups || []).map((g) =>
    `{${g.idx}} 줄 ${g.rowIdxs.join('·')} → 1인 단가 합 ${g.unitSum.toLocaleString()}원 · 소계 ${g.subtotal.toLocaleString()}원`
    + (g.hint ? `   [수량 패턴: ${g.hint}]` : '')
  ).join('\n');

  return `당신은 여행사 견적서를 읽는 어시스턴트입니다.

아래 [후보 줄]은 견적서에서 **산술이 실제로 맞는 것만** 골라낸 단가 줄입니다
(단가 × 수량 × 횟수 = 총금액이 검산된 줄입니다).

[후보 줄]
${list || '(단가 줄을 찾지 못했습니다)'}

[묶음] — 견적서의 **소계 줄**로 묶은 것입니다. 소계가 맞아떨어지는 덩어리라
같은 항목(항공 묶음 / 호텔 묶음 / 식사 묶음 …)일 가능성이 높습니다.
${glist || '(소계로 묶이는 덩어리를 찾지 못했습니다)'}

[견적서 원문]
⚠ 이 견적서는 표가 납작하게 펴져 있어, **항목 이름(항공·호텔·중식·석식·차량·가이드·
입장료 등)이 숫자와 떨어진 별도 블록에 모여 있을 수 있습니다.** 그 이름 목록은 보통
위 후보 줄과 **같은 순서**로 나열됩니다. 순서를 맞춰 보고 판단하세요.

${promptContext(text, rows)}

위 [후보 줄] 중에서 각 항목에 해당하는 줄을 **번호로만** 고르세요.
⚠ 숫자를 직접 쓰지 마세요. 반드시 후보 줄의 번호를 쓰고, 해당하는 줄이 없으면 null입니다.
⚠ 억지로 고르지 마세요. 애매하면 null이 맞습니다.

판단 기준:
- airfareRow  : 1인당 **항공 운임**. 유류할증료·택스·공항세는 항공료가 아니므로 고르지 마세요.
- hotelRow    : **객실 1박당** 숙박비. 보통 수량이 '객실 수', 횟수가 '박 수'입니다.
- mealGroup   : **식사 묶음의 번호**(위 [묶음]의 {번호}). 중식·석식이 한 묶음으로 잡혀
                있으면 그 번호 하나만 쓰면 됩니다 — 가장 확실한 방법입니다.
                식사 묶음이 없으면 null로 두고 아래 mealRows를 쓰세요.
- mealRows    : 묶음으로 안 잡힐 때만 쓰는 예비 수단. 식사 줄 번호 전부(배열).
                ⚠ 입장료·유류할증료·보험·쇼핑은 식사가 아닙니다.
- 차량·가이드·입장료·보험·쇼핑·수수료 줄은 위 셋 중 어느 것도 아닙니다.

**수량으로 걸러내세요 — 이게 가장 확실한 단서입니다.**
- 항공료·식사는 **1인당** 항목이라 수량이 **인원 수와 비슷**합니다(예: 14, 15).
- 차량·가이드·도로유류주차는 **전체 단위**라 수량이 **1**입니다. → 항공·식사가 될 수 없습니다.
- 호텔은 수량이 **객실 수**(인원의 절반쯤), 횟수가 **박 수**입니다.
- 식사는 보통 한 줄의 단가가 **몇만 원대**입니다. 20만 원이 넘으면 식사가 아닐 가능성이 큽니다.

다음 JSON 형식으로만 답하세요(설명 없이):
{
  "airfareRow": 후보 줄 번호 또는 null,
  "hotelRow": 후보 줄 번호 또는 null,
  "mealGroup": 묶음 번호 또는 null,
  "mealRows": [후보 줄 번호, ...] 또는 [],
  "hotelName": "실제 이용 호텔 이름" 또는 null,
  "confidence": "high" | "medium" | "low",
  "note": "왜 그 줄들을 골랐는지 한 문장"
}`;
}

function validatedNumber(raw, max) {
  return (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= max) ? Math.round(raw) : null;
}

/* AI가 고른 줄 번호 → 실제 단가. **AI가 준 숫자는 절대 쓰지 않는다.**
   번호가 범위를 벗어나거나 상한을 넘으면 버린다(없는 값을 만들어내는 경로를 막는다). */
function pickRowValue(rows, rawIdx, max) {
  if (typeof rawIdx !== 'number' || !Number.isInteger(rawIdx)) return null;
  const row = rows[rawIdx];
  if (!row) return null;
  const val = validatedNumber(row.unit, max);
  if (val == null) return null;
  return { value: val, evidence: row.line.replace(/\s+/g, ' ').slice(0, 140),
           calc: `${row.unit.toLocaleString()} × ${row.qty} × ${row.times} = ${row.total.toLocaleString()}` };
}

/* 식사는 **하루치를 합산**한다 (RO). 견적서는 중식·석식이 따로 줄로 나오는데,
   요율의 meal_per_person은 '1인 1일' 식대이기 때문이다.
   ⚠ 여러 줄을 더하므로 근거도 "17,100 + 33,250 = 50,350"처럼 합산 과정을 그대로 보인다. */
/* 묶음 번호 → 하루치 식대 (RP). 소계가 맞아떨어지는 덩어리라 **빠진 줄이 없다**는 것을
   산수로 확인할 수 있다 — 화면이 "소계 1,510,500과 일치"라고 말해 준다. */
function pickMealGroup(rows, groups, rawIdx, max) {
  if (typeof rawIdx !== 'number' || !Number.isInteger(rawIdx)) return null;
  const g = (groups || []).find((x) => x.idx === rawIdx);
  if (!g) return null;
  const picked = pickMealDaily(rows, g.rowIdxs, max);
  if (!picked) return null;
  return Object.assign(picked, {
    groupIdx: g.idx,
    subtotal: g.subtotal,
    /* 고른 줄들의 총액 합이 소계와 같은가 — 같으면 그 묶음을 통째로 골랐다는 뜻 */
    subtotalMatched: true,
  });
}

function pickMealDaily(rows, rawIdxs, max) {
  const list = Array.isArray(rawIdxs) ? rawIdxs : (rawIdxs == null ? [] : [rawIdxs]);
  const picked = [];
  const seen = new Set();
  list.forEach((i) => {
    if (typeof i !== 'number' || !Number.isInteger(i) || seen.has(i)) return;
    const row = rows[i];
    if (!row) return;
    seen.add(i);
    picked.push(row);
  });
  if (!picked.length) return null;
  const sum = picked.reduce((n, r) => n + r.unit, 0);
  const value = validatedNumber(sum, max);
  if (value == null) return null;
  return {
    value,
    rowIdxs: picked.map((r) => r.idx),
    evidence: picked.map((r) => r.line.replace(/\s+/g, ' ').slice(0, 70)).join('  /  ').slice(0, 200),
    calc: picked.length > 1
      ? picked.map((r) => r.unit.toLocaleString()).join(' + ') + ' = ' + value.toLocaleString() + ' (1인 1일)'
      : `${picked[0].unit.toLocaleString()} (1인 1일)`,
  };
}

/* 말이 안 되는 조합을 잡는다 — AI가 같은 줄을 두 항목에 고르는 실수가 실제로 있었다
   (호텔에 항공료를 넣었다). 사람이 눈으로 잡기 전에 화면이 먼저 말하게 한다. */
function sanityWarnings(a, h, m) {
  const w = [];
  if (a && h && a.value === h.value) w.push('항공료와 호텔단가가 같은 값입니다 — 같은 줄을 골랐을 수 있습니다.');
  if (a && m && a.value === m.value) w.push('항공료와 식비가 같은 값입니다 — 같은 줄을 골랐을 수 있습니다.');
  if (h && m && h.value === m.value) w.push('호텔단가와 식비가 같은 값입니다 — 같은 줄을 골랐을 수 있습니다.');
  /* ⚠ 기준이 '하루치'라 1식 기준보다 커야 정상이다. 20만 원을 넘으면 유류할증료·
     보험 같은 다른 줄이 섞였을 가능성이 높다. */
  if (m && m.value > 200000) w.push('식비가 하루 20만 원을 넘습니다 — 유류할증료·보험 줄이 섞였을 수 있습니다.');
  if (h && a && h.value > a.value) w.push('호텔 1박이 항공료보다 비쌉니다 — 확인해 주세요.');
  return w;
}

/* 견적서 PDF 추출 (RZ에서 층 구조로 다시 씀 — api/_lib/pdf_extract.js 머리말 참조)
   여기는 **입출력만** 맡는다: 업로드를 받고, 층 구조 추출기를 돌리고, 규칙이 못 채운
   칸만 AI에게 물어보고(L5), 화면이 쓸 모양으로 내려보낸다. */
async function handleExtractPdf(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const { pdfBase64, fxRate } = req.body || {};
  if (!pdfBase64 || typeof pdfBase64 !== 'string') return res.status(400).json({ error: 'invalid_body' });

  /* 담당자가 넣어 준 환율 — 문서가 환율을 안 밝힌 외화 견적서에서만 쓰인다.
     통화 코드는 3자 대문자, 값은 상식적인 범위만 받는다(공개 입력은 아니지만 같은 원칙). */
  const userFx = {};
  if (fxRate && typeof fxRate === 'object') {
    Object.keys(fxRate).slice(0, 6).forEach((k) => {
      const v = Number(fxRate[k]);
      if (/^[A-Z]{3}$/.test(k) && Number.isFinite(v) && v > 0 && v <= 100000) userFx[k] = v;
    });
  }

  let out;
  try {
    /* ⚠ pdf-parse는 **1.x를 쓴다. 2.x로 올리지 말 것.**
       2.4.5는 내부적으로 pdfjs-dist + `@napi-rs/canvas`(네이티브 바이너리)를 쓰는데,
       Vercel 번들에 그 모듈이 들어가지 않아 **프로덕션에서 이 기능이 한 번도 동작한 적이
       없었다.** 로컬에서는 멀쩡해서 더 늦게 발견됐다. 실제 함수 로그:
         Cannot load "@napi-rs/canvas": Error: Cannot find module '@napi-rs/canvas'
         [quotes extractPdf] pdf-parse 실패: ReferenceError: DOMMatrix is not defined

       ⚠ `require('pdf-parse')`가 아니라 **lib을 직접** 부른다. 1.x의 index.js에는
       `!module.parent`일 때 테스트용 PDF를 읽는 디버그 분기가 있어, 번들러에 따라
       로드 시점에 ENOENT로 죽는다. lib을 직접 부르면 그 분기를 아예 지난다.
       ai-loop/test_rL_pdf_extract.js가 이 두 가지를 소스에서 지킨다.

       ⚠ **반드시 사본(new Uint8Array)으로 넘긴다.** Node Buffer는 공용 풀에서 잘라 쓰므로
       byteOffset이 0이 아닐 수 있는데 pdf.js는 그걸 무시하고 0번지부터 읽어
       'bad XRef entry'로 죽는다. 간헐적으로만 터져서 찾기 어렵다. */
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    const raw = Buffer.from(pdfBase64, 'base64');
    out = await pdfExtract.extractQuote(new Uint8Array(raw), pdf, { fxRate: userFx });
  } catch (err) {
    console.error('[quotes extractPdf] pdf 읽기 실패:', err);
    return res.status(200).json({ error: 'pdf_parse_failed' });
  }
  if (!out || !out.text) return res.status(200).json({ error: 'no_text_found' });

  /* ── L2 예비 경로 ─────────────────────────────────────────────────────────
     좌표가 아예 안 나오는 PDF가 있을 수 있다(글자를 이미지로 그리는 생성기 등).
     그때는 예전(RN) **납작한 텍스트** 추출기로 물러난다. 정확도는 낮지만 0건보다는 낫고,
     무엇보다 이 경로가 **살아 있는 코드**로 남아 회귀 테스트가 실제로 뭔가를 지킨다.
     ⚠ 여기서 나온 줄에는 항목 이름이 없다 — 그래서 분류는 못 하고 후보 목록만 준다. */
  let fallbackUsed = false;
  let fallbackGroups = [];
  if (!out.candidates.length) {
    const flatRows = extractUnitRows(out.text);
    if (flatRows.length) {
      fallbackUsed = true;
      fallbackGroups = extractRowGroups(out.text, flatRows);
      out.candidates = flatRows.map((r) => ({
        idx: r.idx, unit: r.unit, qty: r.qty, times: r.times, total: r.total,
        label: '', note: '', category: null, line: String(r.line).slice(0, 140),
        converted: null, unconvertible: false, currency: null,
      }));
      /* 예비 경로에서는 항목 이름이 없으므로 **예전처럼 AI가 줄 번호를 고른다.**
         숫자는 여전히 서버가 번호로 되찾는다(pickRowValue) — 지어낼 경로는 없다. */
      if (process.env.OPENAI_API_KEY) {
        try {
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const completion = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: buildExtractionPrompt(out.text, flatRows, fallbackGroups) }],
            response_format: { type: 'json_object' }, max_tokens: 300,
          });
          const parsed = JSON.parse(completion.choices[0].message.content);
          const a = pickRowValue(flatRows, parsed.airfareRow, pdfExtract.LIMITS.airfare);
          const h = pickRowValue(flatRows, parsed.hotelRow, pdfExtract.LIMITS.hotel);
          const m = pickMealGroup(flatRows, fallbackGroups, parsed.mealGroup, pdfExtract.LIMITS.meal)
            || pickMealDaily(flatRows, parsed.mealRows, pdfExtract.LIMITS.meal);
          if (a) { out.values.airfare = a.value; out.evidence.airfare = { rowIdx: parsed.airfareRow, line: a.evidence, calc: a.calc, label: '', via: 'fallback' }; }
          if (h) { out.values.hotel = h.value; out.evidence.hotel = { rowIdx: parsed.hotelRow, line: h.evidence, calc: h.calc, label: '', via: 'fallback' }; }
          if (m) { out.values.meal = m.value; out.evidence.meal = { rowIdxs: m.rowIdxs, calc: m.calc, label: '', via: 'fallback' }; }
          if (typeof parsed.hotelName === 'string' && parsed.hotelName.trim()) {
            out.values.hotelName = parsed.hotelName.trim().slice(0, pdfExtract.LIMITS.hotelNameLen);
          }
          out.fallbackWarnings = sanityWarnings(a, h, m);
        } catch (err) {
          console.error('[quotes extractPdf] 예비 경로 AI 실패:', err.message);
        }
      }
    }
  }

  const values = Object.assign({}, out.values);
  const evidence = Object.assign({}, out.evidence);
  const picked = {};
  Object.keys(evidence).forEach((k) => {
    const e = evidence[k];
    if (e && typeof e.rowIdx === 'number') picked[k] = e.rowIdx;
  });
  if (evidence.meal && Array.isArray(evidence.meal.rowIdxs)) picked.mealRows = evidence.meal.rowIdxs;

  /* ── L5: 규칙이 못 채운 칸만 AI에게 물어본다 ──────────────────────────────
     ⚠ 9칸을 통째로 AI에게 시키지 않는다. 라벨 추측이 흔들려 여러 칸이 한꺼번에
     틀리는 것을 이미 겪었다(RN). 좌표 덕에 이제 줄마다 **자기 항목 이름**이 붙어 있어
     규칙이 대부분을 정하고, AI는 이름이 없는 줄만 본다. 여기서도 AI는 **줄 번호**로만
     답한다 — 숫자를 지어낼 경로는 그대로 막혀 있다. */
  const missing = ['airfare', 'hotel', 'meal'].filter((k) => values[k] == null);
  const usableCands = (out.candidates || []).filter((c) => !c.unconvertible);
  let aiNote = '';
  if (missing.length && usableCands.length && process.env.OPENAI_API_KEY) {
    try {
      const list = usableCands.map((c) =>
        `[${c.idx}] ${c.label ? c.label + ' — ' : ''}단가 ${c.unit.toLocaleString()} × 수량 ${c.qty} × 횟수 ${c.times} = ${c.total.toLocaleString()}`
        + (c.note ? `  (비고: ${c.note.slice(0, 40)})` : '')).join('\n');
      const prompt = `여행사 견적서에서 뽑은 **산술이 검산된 단가 줄** 목록입니다.\n`
        + `줄마다 그 줄의 항목 이름이 앞에 붙어 있습니다(없는 줄도 있습니다).\n\n${list}\n\n`
        + `아래 항목 중 **아직 못 채운 것**만 골라 주세요: ${missing.join(', ')}\n`
        + `⚠ 숫자를 쓰지 마세요. 줄 번호만 쓰고, 해당하는 줄이 없으면 null입니다.\n`
        + `⚠ 억지로 고르지 마세요. 애매하면 null이 맞습니다.\n`
        + `- airfare: 1인당 항공 운임(유류할증료·택스는 제외)\n`
        + `- hotel: 객실 1박당 숙박비\n`
        + `- meal: 1인 1끼 식사 줄 번호들(배열)\n\n`
        + `JSON으로만 답하세요: {"airfare": 번호|null, "hotel": 번호|null, "mealRows": [번호,...]}`;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }, max_tokens: 200,
      });
      const parsed = JSON.parse(completion.choices[0].message.content);
      const byIdx = (i) => usableCands.find((c) => c.idx === i);
      const take = (key, max) => {
        if (values[key] != null) return;
        const c = byIdx(parsed[key]);
        if (!c || !(c.unit > 0 && c.unit <= max)) return;
        values[key] = Math.round(c.unit);
        evidence[key] = { rowIdx: c.idx, line: c.line, label: c.label || '', via: 'ai',
          calc: `${c.unit.toLocaleString()} × ${c.qty} × ${c.times} = ${c.total.toLocaleString()}` };
        picked[key] = c.idx;
        aiNote = 'AI 보조';
      };
      take('airfare', pdfExtract.LIMITS.airfare);
      take('hotel', pdfExtract.LIMITS.hotel);
      if (values.meal == null && Array.isArray(parsed.mealRows) && parsed.mealRows.length && out.pax) {
        const rows = parsed.mealRows.map(byIdx).filter(Boolean);
        const sum = rows.reduce((n, c) => n + c.unit, 0);
        if (sum > 0 && sum <= pdfExtract.LIMITS.meal) {
          values.meal = Math.round(sum);
          evidence.meal = { rowIdxs: rows.map((c) => c.idx), label: `식사 ${rows.length}줄`, via: 'ai',
            calc: rows.map((c) => c.unit.toLocaleString()).join(' + ') + ' = ' + sum.toLocaleString() + ' (1인 1일)' };
          picked.mealRows = rows.map((c) => c.idx);
          aiNote = 'AI 보조';
        }
      }
    } catch (err) {
      /* AI가 실패해도 규칙이 뽑은 값은 그대로 쓴다 — 여기서 500을 내면 멀쩡한 결과가 버려진다 */
      console.error('[quotes extractPdf] AI 보조 실패(규칙 결과는 유지):', err.message);
    }
  }

  const warnings = (out.fallbackWarnings || []).slice();
  if (fallbackUsed) warnings.push('이 PDF는 표 좌표를 읽을 수 없어 예전 방식으로 물러났습니다 — 항목 이름이 없으니 후보에서 직접 골라 주세요.');
  if (values.meal != null && values.meal > 200000) warnings.push('식비가 하루 20만 원을 넘습니다 — 다른 항목이 섞였는지 확인해 주세요.');
  if (values.hotel != null && values.airfare != null && values.hotel > values.airfare) warnings.push('호텔 1박이 항공료보다 비쌉니다 — 확인해 주세요.');
  if (out.blockCount > 1) warnings.push(`이 PDF에 견적이 ${out.blockCount}개 들어 있습니다 — 아래에서 어느 것을 읽을지 골라 주세요.`);
  if (out.needsFxRate) warnings.push(`${out.needsFxRate.currency} 기준 견적서인데 문서에 환율이 없습니다 — 환율을 넣으면 ${out.needsFxRate.rowCount}줄이 살아납니다.`);

  /* ══ UV: 추출기가 **화면에 쓰라고 만들어 둔 신호 세 가지**가 여기까지 오지 않았다.
     셋 다 금액에 직결되는데, 지금까지는 담당자가 올리는 순간에 아무 말도 못 들었다
     (만들어만 두고 안 도는 안전망 — 이 저장소가 반복해서 당한 유형이다).
     ⚠ 값을 여기서 고치지 않는다. **무엇을 봐야 하는지만** 말한다. ══════════════ */

  /* ① 인원 어긋남 (UU) — 총계 ÷ 1인당이 딱 떨어지는데 우리가 읽은 인원과 다르다.
     실측(리더스에셋 푸꾸옥): 128,770,920 ÷ 1,839,585 = 정확히 70인데 50으로 읽었다.
     인원은 **모든 1인당 단가의 분모**라, 틀리면 그 견적서의 값이 통째로 어긋난다. */
  if (out.paxConflict) {
    warnings.push(`인원이 어긋납니다 — 우리가 읽은 ${out.paxConflict.docPax}명인데 `
      + `문서 계산(총계 ÷ 1인당)은 ${out.paxConflict.impliedPax}명입니다. `
      + '어느 쪽이 맞는지 확인해 주세요 — 인원이 틀리면 1인당 단가가 전부 어긋납니다.');
  }

  /* ①-b UW: 인원 표기가 **여럿이라 골랐다**면 무엇을 보고 골랐는지 말한다.
     출발지가 나뉘면 머리말이 한 그룹만 적는 일이 흔하다(리더스에셋: 「인 원 50명」이
     인천 출발분, 실제는 70명). 이제 항목 줄이 투표해 스스로 고르지만, **고쳤다는
     사실과 근거를 말하지 않으면 조용히 바꾼 것**이 된다. */
  const pk = out.paxPick;
  if (pk && pk.via === 'rows' && Array.isArray(pk.heads) && pk.heads.length > 1) {
    warnings.push(`인원 표기가 여럿이라(${pk.heads.join('·')}명) `
      + `**${pk.pax}명**으로 봤습니다 — 1인당 항목 줄 ${pk.votes}건이 이 인원을 씁니다. `
      + '출발지가 나뉜 행사면 머리말이 한 그룹만 적기도 합니다. 맞는지 확인해 주세요.');
  }

  /* ② 문서가 스스로 모순된다 — 제목의 「N박」과 기간 표기가 다르다.
     날짜 범위가 더 구체적인 증거라 그쪽을 쓰지만, **어긋났다는 사실은 말한다.**
     일수는 식비에 정비례해서 들어간다. */
  /* ②-b UX: 기간이 어긋났던 것을 **일정표가 증인이 되어** 풀었다면 그렇게 말한다.
     조용히 고르면 담당자는 왜 그 일수인지 모른다(조용한 폴백). */
  const nr = out.nightsResolved;
  if (nr) {
    warnings.push(nr.side === 'labelled'
      ? `기간 표기가 어긋났는데 **일정표가 ${nr.days}일**이라 문서에 적힌 쪽을 따랐습니다 — 맞는지 봐 주세요.`
      : `기간 표기가 어긋났는데 **일정표도 ${nr.days}일**이라 날짜 범위 쪽으로 정했습니다 — 맞는지 봐 주세요.`);
  }

  /* ②-c 박수만 다른 것은 모순이 아니다 — 대개 기내박(야간 비행)이라 호텔 박수가 하나 적다.
     예전에는 이것까지 「문서가 모순된다」로 띄워 46건 중 10건이 잡음이었다. 조용히
     버리지도 않는다 — 그렇게 봤다고 한 줄 남긴다. */
  const re0 = out.dates && out.dates.redEye;
  if (re0) {
    warnings.push(`문서는 ${re0.hotelNights}박 ${re0.days}일인데 날짜 범위로는 ${re0.travelNights}박입니다 `
      + '— 귀국이 야간 비행이면 호텔이 한 밤 적습니다(모순 아님). 일수는 '
      + re0.days + '일로 봤습니다.');
  }

  const nc = out.dates && out.dates.nightsConflict;
  if (nc) {
    warnings.push(`문서 안에서 기간이 어긋납니다 — 날짜 범위로는 ${nc.fromDates}박인데 `
      + `문서에 적힌 것은 ${nc.labelled}박${nc.labelledDays ? ' ' + nc.labelledDays + '일' : ''}입니다. `
      + `날짜 범위(${nc.fromDates}박)를 썼습니다 — 맞는지 봐 주세요.`);
  }

  /* ③ 일수를 기간 표기가 아니라 **일정표를 세어** 얻었다.
     일정표는 「선택일정」이 여러 줄이거나 차수가 섞이면 날이 부푼다(KT CES: 9일 → 13일). */
  if (out.daysVia === 'itinerary') {
    warnings.push(`여행 일수를 문서의 기간 표기가 아니라 **일정표를 세어** ${out.dates && out.dates.days}일로 봤습니다 `
      + '— 선택일정이나 차수가 섞이면 날이 부풀 수 있으니 확인해 주세요.');
  }
  (out.reconciliation.checks || []).filter((c) => !c.ok).forEach((c) => {
    warnings.push(`문서 검산 불일치: ${c.name} (${c.detail})`);
  });

  return res.status(200).json({
    kind: out.kind,
    values, evidence, picked, warnings,
    candidates: out.candidates,
    rowCount: (out.candidates || []).length,
    pax: out.pax, grandTotal: out.grandTotal, perPerson: out.perPerson,
    mealDays: (out.evidence.meal && out.evidence.meal.dayCount) || null,
    dates: out.dates,
    /* UV: 화면이 그대로 다시 쓸 수 있게 원본 신호도 함께 보낸다(문구만 주면
       나중에 화면이 다른 방식으로 보여 주려 할 때 다시 서버를 고쳐야 한다). */
    paxConflict: out.paxConflict || null,
    paxPick: out.paxPick || null,
    nightsResolved: out.nightsResolved || null,
    daysVia: out.daysVia || null,
    reconciliation: out.reconciliation,
    blockCount: out.blockCount, selectedBlock: out.selectedBlock, blocks: out.blocks,
    needsFxRate: out.needsFxRate, fxRates: out.fxRates, fxFromDocument: out.fxFromDocument,
    /* L7 일정표 (SS) — **금액과 무관한 층**이다. 화면이 「📅 날짜별 일정으로 넣기」에 쓴다.
       ⚠ 값이 아니라 문서의 글이라 검증할 숫자가 없다. 그래서 그대로 넘기고 사람이 본다. */
    itinerary: out.itinerary || null,
    source: aiNote || '규칙',
    /* 좌표가 안 나와 예전 방식으로 물러났는가 — 화면이 "항목 이름이 없어 직접 고르셔야
       합니다"라고 말할 수 있어야 한다(조용히 품질이 떨어지지 않게). */
    fallbackUsed,
  });
}

async function handlePriceReport(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const { destinationKey, airfareUnit, hotelUnit, hotelName, mealUnit,
          fuelUnit, vehicleUnit, guideUnit, sightUnit, golfUnit, sellPriceUnit,
          departDate, quoteDate, nights,
          fxCurrency, fxRate, fxFields, manualFields, fieldSources,
          author, source } = req.body || {};
  if (typeof destinationKey !== 'string' || !destinationKey.trim() || destinationKey.length > 100) {
    return res.status(400).json({ error: 'invalid_body' });
  }
  const parseOptional = (v, max) => {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const n = Number(v);
    return (Number.isFinite(n) && n > 0 && n <= max) ? { ok: true, value: n } : { ok: false, value: null };
  };
  const airfare = parseOptional(airfareUnit, AIRFARE_UNIT_MAX);
  const hotel = parseOptional(hotelUnit, HOTEL_UNIT_MAX);
  const meal = parseOptional(mealUnit, MEAL_UNIT_MAX);
  /* RQ: 요율표의 나머지 항목도 받는다 — 견적서에서 이미 뽑히고 있던 값들이다.
     상한은 각 항목의 현실적 규모에 맞춘다(차량은 대당 하루라 크고, 유류할증은 작다). */
  const fuel = parseOptional(fuelUnit, FUEL_UNIT_MAX);
  const vehicle = parseOptional(vehicleUnit, VEHICLE_UNIT_MAX);
  const guide = parseOptional(guideUnit, GUIDE_UNIT_MAX);
  const sight = parseOptional(sightUnit, SIGHT_UNIT_MAX);
  /* TJ: 골프 1인 1회 라운딩. 관광비와 **다른 칸**이다(자릿수가 다르다). */
  const golf = parseOptional(golfUnit, GOLF_UNIT_MAX);
  const sell = parseOptional(sellPriceUnit, SELL_UNIT_MAX);
  const parsed = [airfare, hotel, meal, fuel, vehicle, guide, sight, golf, sell];
  if (parsed.some((p) => !p.ok)) return res.status(400).json({ error: 'invalid_body' });
  const safeHotelName = typeof hotelName === 'string' ? hotelName.trim().slice(0, HOTEL_NAME_MAX_LEN) : '';
  /* 출발일·견적 작성일 (RZ 후속) — 시즌·리드타임 계수를 실측으로 검증하려면 필요하다.
     ⚠ 형식이 틀리면 **조용히 버리지 않고 거절**한다. 날짜가 어긋난 채 쌓이면
     "9월 출발 견적"을 모을 때 엉뚱한 게 섞이는데, 그건 나중에 찾기 아주 어렵다. */
  const parseDate = (v) => {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, value: null };
    const t = Date.parse(v + 'T00:00:00Z');
    if (!Number.isFinite(t)) return { ok: false, value: null };
    const y = Number(v.slice(0, 4));
    return (y >= 2000 && y <= 2100) ? { ok: true, value: v } : { ok: false, value: null };
  };
  const depart = parseDate(departDate);
  const quoted = parseDate(quoteDate);
  if (!depart.ok || !quoted.ok) return res.status(400).json({ error: 'invalid_date' });
  const nightsN = (nights === undefined || nights === null || nights === '') ? null : Number(nights);
  if (nightsN !== null && !(Number.isInteger(nightsN) && nightsN >= 0 && nightsN <= 60)) {
    return res.status(400).json({ error: 'invalid_nights' });
  }
  if (parsed.every((p) => p.value == null) && !safeHotelName) {
    return res.status(400).json({ error: 'invalid_body' });
  }
  /* SG: **이 값들이 어느 환율로 환산됐는가.** 값을 고치지 않고 되돌릴 수단만 남긴다 —
     요율과 비교할 때 화면이 `오늘환율 ÷ fx_rate`로 오늘 기준으로 되돌린다.
     ⚠ 셋이 **함께** 와야 뜻이 생긴다. 통화만 있고 환율이 없으면 되돌릴 수 없고,
       환율만 있고 항목 목록이 없으면 원화 항목까지 잘못 되돌린다. 하나라도 빠지면 거절한다
       — 조용히 버리면 그 제보는 영영 되돌릴 수 없는 값으로 남는다.
     ⚠ 자릿수 검사는 추출기와 **같은 함수**를 쓴다(`fxPlausible`). 두 곳에 다른 기준을 적으면
       화면은 통과시키고 서버가 거절하거나 그 반대가 된다(결함 생성기 ①). */
  const FX_FIELD_KEYS = ['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight', 'sell'];
  let fxCur = null, fxR = null, fxF = null;
  const fxGiven = [fxCurrency, fxRate, fxFields].filter((v) => v !== undefined && v !== null && v !== '');
  if (fxGiven.length) {
    if (fxGiven.length !== 3) return res.status(400).json({ error: 'invalid_fx' });
    fxCur = String(fxCurrency).trim().toUpperCase().slice(0, 8);
    fxR = Number(fxRate);
    if (!/^[A-Z]{3}$/.test(fxCur)) return res.status(400).json({ error: 'invalid_fx' });
    if (!Number.isFinite(fxR) || fxR <= 0 || !pdfExtract.fxPlausible(fxCur, fxR)) {
      return res.status(400).json({ error: 'invalid_fx' });
    }
    const list = String(fxFields).split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length || list.some((k) => FX_FIELD_KEYS.indexOf(k) < 0)) {
      return res.status(400).json({ error: 'invalid_fx' });
    }
    fxF = Array.from(new Set(list)).join(',');
  }
  /* destinationKey 유효성 — 내장 목적지가 아니면 커스텀 목적지 존재 확인. 오타/미존재
     키로 실측 통계(갱신제안·정확도)가 오염되는 것을 막는다. */
  if (!BUILTIN_DEST_KEYS.has(destinationKey)) {
    try {
      const cd = await sql`select 1 from custom_destinations where destination_key = ${destinationKey} limit 1`;
      if (!cd.length) return res.status(400).json({ error: 'unknown_destination' });
    } catch (err) {
      console.error('[quotes priceReport] 목적지 확인 실패:', err);
      return res.status(500).json({ error: 'insert_failed' });
    }
  }
  /* author는 클라이언트 값이 아니라 세션에서 검증된 실사용자 표시명을 쓴다(위조 방지) —
     요율 PATCH(api/rates.js)와 동일 원칙. requireAdmin이 req.user를 세팅한다. */
  const safeAuthor = String((req.user && req.user.displayName) || '').slice(0, 40);

  /* SW: **칸별로 담당자가 확정한 값인가.** 실무자가 견적서를 보면서 그 자리에서 고친 칸을
     추출값과 갈라 둔다 — 그래야 「담당자가 확정한 칸은 다시 묻지 않는다」가 성립한다.
     ⚠ `by`는 클라이언트 값을 믿지 않고 **세션의 표시명**으로 덮어쓴다(author와 같은 원칙).
     ⚠ `how`(어떻게 나온 값인가)를 안 받으면 나중에 근거를 잃는다 — 화면이 채워 보낸다.
     ⚠ 모르는 항목 키는 **버리지 않고 거절**한다. 조용히 버리면 화면은 저장됐다고 믿는다. */
  const MANUAL_FIELD_KEYS = ['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight', 'golf', 'sell'];
  let manualJson = null;
  if (manualFields !== undefined && manualFields !== null && manualFields !== '') {
    if (typeof manualFields !== 'object' || Array.isArray(manualFields)) {
      return res.status(400).json({ error: 'invalid_manual_fields' });
    }
    const keys = Object.keys(manualFields);
    if (keys.some((k) => MANUAL_FIELD_KEYS.indexOf(k) < 0)) {
      return res.status(400).json({ error: 'invalid_manual_fields' });
    }
    if (keys.length) {
      const out = {};
      keys.forEach((k) => {
        const v = manualFields[k] || {};
        out[k] = {
          by: safeAuthor,
          at: new Date().toISOString(),
          how: String(v.how || '').slice(0, 200),
        };
      });
      manualJson = JSON.stringify(out);
    }
  }

  /* SX: **칸마다 그 값이 어떻게 나왔는가.** 제출과 함께 버려지던 정보다 —
     이게 없으면 나중에 「어느 칸이 확인 대상인가」를 물었을 때 값만 보고는 답할 수 없다.
     ⚠ 모르는 항목 키·모르는 출처는 **거절**한다(조용히 버리면 화면은 저장됐다고 믿는다). */
  const VIA_KEYS = ['rule', 'calc', 'doc', 'unchecked', 'ai', 'fallback', 'manual', 'confirmed', 'none'];
  let sourcesJson = null;
  if (fieldSources !== undefined && fieldSources !== null && fieldSources !== '') {
    if (typeof fieldSources !== 'object' || Array.isArray(fieldSources)) {
      return res.status(400).json({ error: 'invalid_field_sources' });
    }
    const keys = Object.keys(fieldSources);
    if (keys.some((k) => MANUAL_FIELD_KEYS.indexOf(k) < 0 || VIA_KEYS.indexOf(String(fieldSources[k])) < 0)) {
      return res.status(400).json({ error: 'invalid_field_sources' });
    }
    if (keys.length) {
      const out = {};
      keys.forEach((k) => { out[k] = String(fieldSources[k]); });
      sourcesJson = JSON.stringify(out);
    }
  }

  /* ── TI: **정확한 값을 찾지 못한 칸은 실측에 반영하지 않는다** (2026-08-12 대표 지시) ──
     지금까지는 「검산 안 됨」 값이 저장되고 **📊 갱신 제안에서만** 빠졌다(SN·TB).
     ✅실측 N건 배지 · 기준가 이상 경고 · 견적 정확도 카드 **세 곳에는 그대로 들어갔다.**
     일괄 투입이 시작되면 사람이 모든 칸을 눈으로 볼 수 없으므로(2026-08-10 방침),
     저장하는 자리에서 한 번에 빼야 네 곳이 같은 말을 한다.

     ⚠ **행도 값도 지우지 않는다.** `excluded_fields`에 넣어 평균에서만 빼고, 원래 값은
       그대로 남는다. 담당자가 「확인 필요」 목록에서 확정하면 그 자리에서 되살아난다
       (아래 handleConfirmReportField). 조용히 버리는 것과 다르다.
     ⚠ **사람이 뺀 것과 구분해야 한다.** 심천 호텔처럼 「값은 맞지만 다른 도시 것」이라
       사람이 뺀 항목이 있다(SU). 그건 확정해도 되살아나면 안 된다 — 그래서 자동으로 뺀
       것에만 표시를 붙이고, 되살리는 것도 그 표시가 붙은 것만 한다.
     ⚠ 잣대는 `plausibility.countsAsMeasured` 하나다. 출처를 **모르는** 옛 제보는 빼지 않는다. */
  const autoExcluded = autoExcludedFields({
    airfare: airfare.value, fuel: fuel.value, hotel: hotel.value, meal: meal.value,
    vehicle: vehicle.value, guide: guide.value, sight: sight.value, golf: golf.value,
  }, sourcesJson ? JSON.parse(sourcesJson) : null);
  const excludedJson = Object.keys(autoExcluded).length ? JSON.stringify(autoExcluded) : null;

  try {
    /* ⚠ 새 컬럼(fuel/vehicle/guide/sight/sell_price)은 **마이그레이션이 먼저** 돌아야 한다.
       배포가 앞서면 여기서 500이 난다 — CLAUDE.md의 순서 규칙 그대로다.
       `node ai-loop/db_migrate.js` (additive, if not exists) */
    await sql`
      insert into actual_price_reports
        (destination_key, airfare_unit, hotel_unit, hotel_name, meal_unit,
         fuel_unit, vehicle_unit, guide_unit, sight_unit, golf_unit, sell_price_unit,
         depart_date, quote_date, nights, fx_currency, fx_rate, fx_fields,
         excluded_fields, manual_fields, field_sources, author, source)
      values (${destinationKey}, ${airfare.value}, ${hotel.value}, ${safeHotelName || null}, ${meal.value},
              ${fuel.value}, ${vehicle.value}, ${guide.value}, ${sight.value}, ${golf.value}, ${sell.value},
              ${depart.value}, ${quoted.value}, ${nightsN}, ${fxCur}, ${fxR}, ${fxF},
              ${excludedJson}::jsonb, ${manualJson}::jsonb, ${sourcesJson}::jsonb,
              ${safeAuthor}, ${source === 'pdf' ? 'pdf' : 'manual'})
    `;
    /* 화면이 「무엇이 왜 빠졌는지」를 그 자리에서 말할 수 있어야 한다 — 조용히 빼면
       담당자는 다 반영된 줄 안다(이 저장소가 반복해서 당한 유형이다). */
    return res.status(200).json({ ok: true, autoExcluded: Object.keys(autoExcluded) });
  } catch (err) {
    console.error('[quotes priceReport] 저장 실패:', err);
    return res.status(500).json({ error: 'insert_failed' });
  }
}

async function handlePriceReports(req, res) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await sql`select id, destination_key, airfare_unit, hotel_unit, hotel_name, meal_unit,
                                  fuel_unit, vehicle_unit, guide_unit, sight_unit, golf_unit, sell_price_unit,
                                  depart_date, quote_date, nights,
                                  fx_currency, fx_rate, fx_fields, excluded_fields, manual_fields, field_sources,
                                  author, source, created_at
                           from actual_price_reports order by created_at desc limit 1000`;
    const num = (v) => (v != null ? Number(v) : null);
    return res.status(200).json(rows.map((r) => ({
      id: Number(r.id),
      destinationKey: r.destination_key,
      airfareUnit: num(r.airfare_unit),
      hotelUnit: num(r.hotel_unit),
      hotelName: r.hotel_name || null,
      mealUnit: num(r.meal_unit),
      /* RQ: 요율표의 나머지 항목 + 검증용 판매가 */
      fuelUnit: num(r.fuel_unit),
      vehicleUnit: num(r.vehicle_unit),
      guideUnit: num(r.guide_unit),
      sightUnit: num(r.sight_unit),
      /* TJ: 골프 1인 1회 라운딩 — 관광비와 다른 칸이다 */
      golfUnit: num(r.golf_unit),
      sellPriceUnit: num(r.sell_price_unit),
      /* 날짜는 화면이 그대로 쓰도록 YYYY-MM-DD 문자열로 내린다(타임존 때문에 하루가
         밀리는 사고를 막는다 — Date로 넘기면 브라우저가 현지시각으로 해석한다). */
      departDate: r.depart_date ? String(r.depart_date).slice(0, 10) : null,
      quoteDate: r.quote_date ? String(r.quote_date).slice(0, 10) : null,
      nights: r.nights == null ? null : Number(r.nights),
      /* SG: 이 제보의 금액이 **어느 환율로 환산된 것인가.** 화면이 요율과 비교할 때
         `오늘환율 ÷ fxRate`로 오늘 기준으로 되돌린다. fxFields에 적힌 항목만 되돌린다 —
         같은 제보 안에서도 원화로 적힌 항목이 섞여 있다. */
      fxCurrency: r.fx_currency || null,
      fxRate: num(r.fx_rate),
      fxFields: r.fx_fields ? String(r.fx_fields).split(',').filter(Boolean) : [],
      /* SU: 담당자가 **평균에서 뺀** 항목과 그 이유. {항목키: 사유}.
         ⚠ 화면은 이 항목을 집계에서 빼되 **값은 그대로 보여준다** — 참고자료로는 쓴다. */
      excludedFields: (r.excluded_fields && typeof r.excluded_fields === 'object') ? r.excluded_fields : {},
      /* SW: 담당자가 그 자리에서 확정한 칸 {항목: {by, at, how}}. 추출값과 갈라서 본다 —
         이 칸은 「확인 대상」에서 빠지고, 요율 집계에서 더 믿을 수 있는 값이다. */
      manualFields: (r.manual_fields && typeof r.manual_fields === 'object') ? r.manual_fields : {},
      /* SX: 칸마다 그 값이 어떻게 나왔는가 — 「확인 필요」 목록이 이걸로 고른다 */
      fieldSources: (r.field_sources && typeof r.field_sources === 'object') ? r.field_sources : {},
      author: r.author || '', source: r.source, createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[quotes priceReports] 조회 실패:', err);
    return res.status(500).json({ error: 'query_failed' });
  }
}

/* 잘못 입력된 실제 계약가 제보 삭제(신규) — 제출 시 오타 등으로 잘못 들어간 값이
   갱신제안·검증배지에 계속 악영향을 주므로, 관리자 페이지에서 해당 제보를 지울 수
   있게 한다. 로그인한 담당자면 삭제 가능(제보 제출과 동일 권한). id 하나만 지운다. */
async function handleDeletePriceReport(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const id = Number((req.query && req.query.id) || (req.body && req.body.id));
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  try {
    const deleted = await sql`delete from actual_price_reports where id = ${id} returning id`;
    if (!deleted.length) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[quotes deletePriceReport] 삭제 실패:', err);
    return res.status(500).json({ error: 'delete_failed' });
  }
}

/* TI: 자동으로 뺀 것임을 나타내는 표시. **사람이 사유를 적어 뺀 것과 갈라야** 하기 때문에
   있다 — 사람이 뺀 항목(심천 호텔)은 확정해도 평균에 돌아오면 안 된다(SU).
   ⚠ **값은 `plausibility.js`에 있다.** 서버 두 곳(저장·확정)뿐 아니라 화면의 「확인 필요」
     목록도 이 표시를 봐야 하기 때문이다. 여기 다시 적으면 한쪽만 고쳤을 때 자동 제외가
     영영 안 풀린다 — 「확인했는데 왜 그대로지」가 된다(결함 생성기 ①). */
const AUTO_EXCLUDE_MARK = PLAUSIBILITY.AUTO_EXCLUDE_MARK;
const AUTO_EXCLUDE_WHY = {
  unchecked: '검산 안 됨 — 수량·횟수가 없어 1인 단가인지 전 일정 총액인지 확인되지 않았습니다',
  ai: 'AI 추정 — 규칙이 못 채워 AI가 고른 값입니다',
  fallback: '예비 경로 — 표 좌표를 못 읽어 예전 방식으로 물러난 값입니다',
};

/* 어느 칸을 실측 평균에서 자동으로 뺄 것인가 — **순수 함수**라 테스트가 직접 부른다.
     values  { airfare, fuel, hotel, meal, vehicle, guide, sight } (원화, 없으면 null)
     sources { 항목: via } — 화면이 보낸 field_sources (없으면 null)
   반환 { 항목: 사유 } — 비어 있으면 뺄 것이 없다.
   ⚠ 판매가(sell)는 들어오지 않는다. 요율 항목이 아니라 검증용이라 평균에 안 들어간다.
   ⚠ 잣대는 plausibility 하나다 — 여기에 via 목록을 다시 적지 말 것. */
function autoExcludedFields(values, sources) {
  const out = {};
  if (!sources || typeof sources !== 'object') return out;
  Object.keys(sources).forEach((k) => {
    if (!(k in values)) return;
    if (values[k] == null) return;                       /* 값이 없으면 뺄 것도 없다 */
    if (PLAUSIBILITY.countsAsMeasured(sources[k])) return;
    out[k] = AUTO_EXCLUDE_MARK
      + (AUTO_EXCLUDE_WHY[sources[k]] || '확인되지 않은 값입니다')
      + ' · 확인 필요 목록에서 확정하면 다시 반영됩니다';
  });
  return out;
}

/* SU: 제보의 한 항목을 **평균에서 빼거나 되돌린다** (2026-08-11 대표 지시).
   ⚠ 행을 지우지 않는다 — 같은 견적서의 나머지 항목은 그 목적지 것이라 그대로 쓴다.
   ⚠ **사유를 반드시 받는다.** 사유 없이 빠진 값은 나중에 아무도 이유를 몰라
     "왜 이 견적서만 빠졌지"가 되고, 결국 누군가 되돌려 놓는다.
   reason이 비어 있으면 **해제**(다시 평균에 넣는다)로 본다. */
const EXCLUDABLE = ['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight'];
async function handleExcludeReportField(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const body = req.body || {};
  const id = Number(body.id);
  const field = String(body.field || '');
  const reason = String(body.reason || '').trim().slice(0, 200);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  if (EXCLUDABLE.indexOf(field) < 0) return res.status(400).json({ error: 'invalid_field' });
  try {
    const cur = await sql`select excluded_fields from actual_price_reports where id = ${id}`;
    if (!cur.length) return res.status(404).json({ error: 'not_found' });
    const map = (cur[0].excluded_fields && typeof cur[0].excluded_fields === 'object')
      ? Object.assign({}, cur[0].excluded_fields) : {};
    if (reason) map[field] = reason; else delete map[field];
    await sql`update actual_price_reports set excluded_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
    return res.status(200).json({ ok: true, id, excludedFields: map });
  } catch (err) {
    console.error('[quotes excludeReportField] 저장 실패:', err);
    return res.status(500).json({ error: 'update_failed' });
  }
}

/* SX: 「확인 필요」 목록에서 **나중에** 한 칸을 확정한다 (2026-08-11).
   제출할 때 확정하지 못하고 넘어간 칸을, 목록에서 값을 고치거나 그대로 확인하고 닫는다.
   ⚠ 값을 함께 받는다(`value`) — 목록에서 고쳐 넣는 것이 이 화면의 절반이다.
     값이 없으면 **지금 값 그대로 「확인했다」**는 뜻이다(그것도 확정이다).
   ⚠ `by`는 세션 표시명으로 덮어쓴다. `how`가 없으면 그 자리에서 만든다 — 근거 없는
     확정을 남기지 않는다(SW와 같은 원칙). */
const REPORT_VALUE_COL = {
  airfare: 'airfare_unit', fuel: 'fuel_unit', hotel: 'hotel_unit', meal: 'meal_unit',
  vehicle: 'vehicle_unit', guide: 'guide_unit', sight: 'sight_unit', golf: 'golf_unit',
  sell: 'sell_price_unit',
};
const REPORT_VALUE_MAX = {
  airfare: AIRFARE_UNIT_MAX, fuel: FUEL_UNIT_MAX, hotel: HOTEL_UNIT_MAX, meal: MEAL_UNIT_MAX,
  vehicle: VEHICLE_UNIT_MAX, guide: GUIDE_UNIT_MAX, sight: SIGHT_UNIT_MAX, golf: GOLF_UNIT_MAX,
  sell: SELL_UNIT_MAX,
};
async function handleConfirmReportField(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const body = req.body || {};
  const id = Number(body.id);
  const field = String(body.field || '');
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  if (!REPORT_VALUE_COL[field]) return res.status(400).json({ error: 'invalid_field' });

  let newValue = null;
  if (body.value !== undefined && body.value !== null && body.value !== '') {
    const n = Number(body.value);
    if (!Number.isFinite(n) || n <= 0 || n > REPORT_VALUE_MAX[field]) {
      return res.status(400).json({ error: 'value_out_of_range' });
    }
    newValue = n;
  }
  const safeAuthor = String((req.user && req.user.displayName) || '').slice(0, 40);
  try {
    const cur = await sql`select manual_fields, excluded_fields from actual_price_reports where id = ${id}`;
    if (!cur.length) return res.status(404).json({ error: 'not_found' });
    const map = (cur[0].manual_fields && typeof cur[0].manual_fields === 'object')
      ? Object.assign({}, cur[0].manual_fields) : {};
    /* TI: 저장할 때 **자동으로 빠진** 칸이면, 사람이 확정하는 순간 되살린다.
       ⚠ 안 되살리면 확정해도 평균에 안 들어가 「확인했는데 왜 그대로지」가 된다 —
         확정 화면이 거짓말을 하는 상태다.
       ⚠ **사람이 뺀 것은 건드리지 않는다.** 심천 호텔처럼 「값은 맞지만 다른 도시 것」이라
         뺀 항목은 확정한다고 평균에 돌아오면 안 된다(SU). 그래서 `[자동]` 표시가 붙은
         것만 지운다. 표시가 없으면 사람이 사유를 적어 뺀 것이다. */
    const exMap = (cur[0].excluded_fields && typeof cur[0].excluded_fields === 'object')
      ? Object.assign({}, cur[0].excluded_fields) : {};
    let revived = false;
    if (PLAUSIBILITY.isAutoExcluded(exMap[field])) {
      delete exMap[field];
      revived = true;
    }
    map[field] = {
      by: safeAuthor,
      at: new Date().toISOString(),
      how: String(body.how || (newValue == null ? '목록에서 값을 확인했습니다' : '목록에서 값을 고쳤습니다')).slice(0, 200),
    };
    /* ⚠ 컬럼 이름을 문자열로 조립하지 않는다 — 항목마다 명시적으로 쓴다.
       (neon 태그드 템플릿에 식별자를 끼워 넣을 수 없고, 넣으면 주입 경로가 된다.) */
    if (newValue != null) {
      const v = newValue;
      if (field === 'airfare') await sql`update actual_price_reports set airfare_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else if (field === 'fuel') await sql`update actual_price_reports set fuel_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else if (field === 'hotel') await sql`update actual_price_reports set hotel_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else if (field === 'meal') await sql`update actual_price_reports set meal_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else if (field === 'vehicle') await sql`update actual_price_reports set vehicle_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else if (field === 'guide') await sql`update actual_price_reports set guide_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else if (field === 'sight') await sql`update actual_price_reports set sight_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      /* ⚠ **골프는 반드시 이 else 위에** 있어야 한다. 맨 아래 else는 sell 전용 갈래라,
         빠뜨리면 골프 확정값이 조용히 **판매가 칸에 쓰인다**(값도 잃고 판매가도 망가진다). */
      else if (field === 'golf') await sql`update actual_price_reports set golf_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
      else await sql`update actual_price_reports set sell_price_unit = ${v}, manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
    } else {
      await sql`update actual_price_reports set manual_fields = ${JSON.stringify(map)}::jsonb where id = ${id}`;
    }
    /* TI: 자동으로 빠졌던 칸을 되살린다. **확정을 먼저 쓰고 이걸 나중에 쓰는 순서가 중요하다** —
       이 쓰기가 실패하면 「확정됐지만 아직 평균에서 빠진」 상태로 남는다(안전한 쪽).
       순서를 뒤집으면 실패했을 때 「확인 안 된 값이 평균에 들어간」 상태가 된다.
       ⚠ 위 9갈래에 얹지 않는다 — 컬럼 이름을 조립하지 않기 위해 갈래를 늘어놓은 것이라,
         거기에 컬럼을 더하면 갈래가 18개가 된다. */
    if (revived) {
      await sql`update actual_price_reports set excluded_fields = ${JSON.stringify(exMap)}::jsonb where id = ${id}`;
    }
    return res.status(200).json({ ok: true, id, field, value: newValue, manualFields: map, revived });
  } catch (err) {
    console.error('[quotes confirmReportField] 저장 실패:', err);
    return res.status(500).json({ error: 'update_failed' });
  }
}

/* 견적서 단가 뽑기의 **순수 함수**를 테스트가 직접 부를 수 있게 내보낸다 (RN).
   ⚠ 핸들러(module.exports)에 얹는 형태다 — Vercel은 함수 export만 보므로 영향이 없다.
   테스트가 이 함수를 복사해 쓰면 곧 어긋나므로, 진짜 코드를 그대로 부르게 한다. */
module.exports = async (req, res) => {
  const action = req.query && req.query.action;
  if (action === 'extractPdf' && req.method === 'POST') return handleExtractPdf(req, res);
  if (action === 'priceReport' && req.method === 'POST') return handlePriceReport(req, res);
  if (action === 'priceReports' && req.method === 'GET') return handlePriceReports(req, res);
  if (action === 'deletePriceReport' && req.method === 'DELETE') return handleDeletePriceReport(req, res);
  /* ⚠ Vercel Hobby 함수 12개 제한에 도달해 있다 — 새 파일이 아니라 ?action= 분기다 */
  if (action === 'excludeReportField' && req.method === 'POST') return handleExcludeReportField(req, res);
  if (action === 'confirmReportField' && req.method === 'POST') return handleConfirmReportField(req, res);

  /* 내부 산출 저장 (PX) — 담당자 신원을 **서버가** 찍는다.
     예전에는 공개 POST 하나뿐이었고 `channel:'internal'`·`createdBy`를 클라이언트가
     그대로 보냈다. 그런데 이 엔드포인트는 인증이 없다:
     ① 익명 제출자가 `channel:'internal', createdBy:'송주연 팀장'`을 보내면 관리자
        화면에 **"🖥 내부 산출 — 송주연 팀장"** 배지가 그대로 붙는다(위조된 출처).
     ② admin-quote.html은 담당자를 하드코딩 목록에서 **자기가 골랐다** — 요율 author와
        진행 기록에서 이미 없앤 '자칭 신원'이 이 도구에만 남아 있었다.
     그래서 내부 저장은 인증이 필요한 별도 action으로 분리하고, 공개 POST는 두 필드를
     **강제로 덮어쓴다**(아래 saveQuote 호출부). 삽입 로직은 한 함수를 공유한다 —
     복사하면 두 벌이 어긋난다(이 저장소가 여러 번 겪은 유형). */
  if (action === 'internal' && req.method === 'POST') {
    if (!(await requireAdmin(req, res))) return;
    return saveQuote(req, res, { channel: 'internal', createdBy: req.user.displayName || '' });
  }

  if (req.method === 'POST') {
    /* 공개 제출은 내부 산출을 자칭할 수 없다 — 값을 지우지 않고 'public'으로 못 박는다. */
    return saveQuote(req, res, { channel: 'public', createdBy: '' });
  }

  if (req.method === 'GET') {
    if (!(await requireAdmin(req, res))) return;
    try {
      const rows = await sql`select * from quotes order by created_at desc limit 1000`;
      res.status(200).json(rows.map((r) => ({
        ...r.payload, id: r.id, status: r.status, note: r.note,
        assignee: r.assignee || '', activityLog: r.activity_log || [],
        actualAirfareUnit: r.actual_airfare_unit !== null && r.actual_airfare_unit !== undefined ? Number(r.actual_airfare_unit) : null,
        actualHotelUnit: r.actual_hotel_unit !== null && r.actual_hotel_unit !== undefined ? Number(r.actual_hotel_unit) : null,
        actualMealUnit: r.actual_meal_unit !== null && r.actual_meal_unit !== undefined ? Number(r.actual_meal_unit) : null,
        actualTotal: r.actual_total !== null && r.actual_total !== undefined ? Number(r.actual_total) : null,
        /* UI: 이 견적서 전용 일정. null = 없음(목적지 공통 일정으로 물러난다).
           ⚠ payload 뒤에 둔다 — 클라이언트가 payload에 같은 이름을 넣어 보내도
             컬럼 값이 이긴다(channel·createdBy를 payload 뒤에 두는 것과 같은 이유). */
        itinerary: r.itinerary || null,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};

/* 공개 제출과 내부 산출이 **같은 삽입 경로**를 쓴다 — 검증(_verify)·id 강제·숫자 강제·
   on-conflict 멱등성이 한 벌만 존재해야 두 경로가 어긋나지 않는다. 차이는 `origin`
   하나뿐이고, 그 값은 호출부(=인증 여부)가 정한다. */
async function saveQuote(req, res, origin) {
  const payload = req.body || {};
  if (payloadTooLarge(payload)) return res.status(413).json({ error: 'payload_too_large' });
  /* id는 관리자 화면에서 onclick 안에 들어가므로 형태를 강제한다 — 자세한 이유는
     api/_lib/public_input.js 주석. 형식을 벗어나면 견적을 버리지 않고 id만 교체한다. */
  const id = safeId(payload.id);
  /* 인원·총액은 관리자 화면이 숫자로 다루는 값이라 저장 시점에 숫자로 못 박는다
     (문자열이 들어오면 화면 포맷터가 원문을 그대로 출력한다). */
  const participants = toNumberOrNull(payload.participants);
  const total = toNumberOrNull(payload.total);
  try {
    /* 저장 시점 검증 (신규) — 계산은 브라우저에서 일어나므로 서버가 받은 금액을
       그대로 믿을 근거가 없다. 권위 요율표·계수와 대조한 결과를 payload에 함께
       남겨, 관리자가 견적 상세에서 "이 건은 어느 단계에서 걸렸는지"를 볼 수 있게 한다.
       걸려도 저장은 한다 — 고객 리드를 버리는 쪽이 훨씬 큰 손해다. 링크 발급
       (api/quote-shares)에서 한 번 더, 그때는 통과해야만 발급된다. */
    const vctx = await loadVerifyContext(payload.destination);
    const verified = verifyQuote(payload, vctx);
    /* ⚠ channel·createdBy는 **payload 뒤에** 넣어야 클라이언트가 보낸 값을 덮는다.
       순서가 뒤바뀌면 익명 제출자가 다시 '내부 산출'을 자칭할 수 있다 (PX). */
    const stored = { ...payload, id, participants, total,
      channel: origin.channel, createdBy: origin.createdBy,
      _verify: {
        verdict: vctx.unavailable ? 'unavailable' : verified.verdict,
        failedSteps: verified.failedSteps,
        steps: verified.steps,
        at: new Date().toISOString(),
      } };
    await sql`
      insert into quotes (id, status, note, dest_label, org_name, participants, total, payload)
      values (${id}, 'new', '', ${trimText(payload.destLabel, 100)}, ${trimText(payload.orgName, 100)},
              ${participants}, ${total}, ${JSON.stringify(stored)}::jsonb)
      on conflict (id) do nothing
    `;
    res.status(200).json({ ok: true, id, verdict: stored._verify.verdict });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'insert_failed' });
  }
}

/* ── 테스트용 노출 (RN) — ai-loop/test_rN_pdf_rows.js가 이 함수들을 직접 검사한다.
   ⚠ 복사해서 테스트하면 곧 어긋난다. 진짜 코드를 그대로 부르게 한다. */
module.exports._extract = {
  extractUnitRows, extractRowGroups, buildExtractionPrompt,
  pickRowValue, pickMealDaily, pickMealGroup, sanityWarnings, promptContext,
  AIRFARE_UNIT_MAX, HOTEL_UNIT_MAX, MEAL_UNIT_MAX,
};

/* TI: 「정확한 값을 못 찾은 칸은 반영하지 않는다」의 순수 함수 — 테스트가 직접 부른다 */
module.exports._report = { autoExcludedFields, AUTO_EXCLUDE_MARK, AUTO_EXCLUDE_WHY };

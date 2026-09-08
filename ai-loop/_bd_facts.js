/* ═══════════════════════════════════════════════════════════════════════════
   블랙다운 한 건에서 **대조에 필요한 사실 넷**을 확정한다 (ZG)
   ───────────────────────────────────────────────────────────────────────────
   인원 · 일수 · 통화 · 목적지. 넷 중 하나라도 틀리면 그 위의 모든 대조가 허수다.

   🔴 **머리글만으로는 안 된다 — 실측으로 확인했다.**
     닫힌 블랙다운 43건을 훑어 보니 `readHeader`가 읽어 낸 것은
       · 일수: **43건 중 1건**  (양식이 「3박5일」로 붙여 쓰지 않는다)
       · 인원: 34건 (9건은 못 읽음)
     이었다. 그런데 **파일 이름에는 거의 다 들어 있다** — 「도쿄 3일 (5명)」
     「나트랑3N5D」「기260909 후쿠오카3일」「62+2」「111+2」.
     견적서 쪽에서 목적지를 파일명으로 정하는 것과 같은 근거다(이 회사의 관행).

   🔴 **머리글과 파일명이 어긋나면 고르지 않고 뺀다.**
     실측: `[세부내역서] QJ00551391001 사평초 241015 4일 12명.xlsx`의 머리글 인원이
     **2명**으로 읽혔다(파일명은 12명). 한쪽을 고르면 그 문서의 1인 원가가 6배가
     되는데, 그 값은 그럴듯해서 눈으로는 안 걸린다. **빈칸보다 틀린 값이 위험하다.**

   🔴 **「원가」는 통화가 아니다.** 큐슈 문서의 금액 열 머리가 「원  가」인데 값은 **엔**이다
     (스기노이 20,800엔/박). 「원」으로 원화를 판정하면 그 문서가 통째로 원화가 된다.
     → 통화는 **외화 표시가 있는가**로만 정하고, 없으면 「원화로 보임(확정 아님)」이라
       말한다. 확정과 추정을 같은 얼굴로 두지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 일수 ──────────────────────────────────────────────────────────────────
   ⚠ 순서가 규칙이다. 「3박5일」·「3N5D」처럼 **박과 일이 함께** 적힌 것을 먼저 본다.
     맨 앞에 두지 않으면 「3박5일」에서 `(\d+)일`이 5를 먼저 집는 것은 맞지만,
     「0328~0401 … 3박 5일」 같은 줄에서 날짜가 먼저 걸린다. */
const DAYS_PATTERNS = [
  { re: /(\d{1,2})\s*박\s*(\d{1,2})\s*일/, nights: 1, days: 2 },
  { re: /(\d{1,2})\s*N\s*(\d{1,2})\s*D/i, nights: 1, days: 2 },
  /* 「4일」 단독. ⚠ 앞에 숫자가 붙은 것(날짜 `1028`)을 집지 않도록 경계를 둔다. */
  { re: /(?:^|[^0-9])(\d{1,2})\s*일(?![0-9])/, days: 1 },
  { re: /(?:^|[^0-9])(\d{1,2})\s*박(?![0-9])/, nights: 1 },
];

function daysFromName(name) {
  const s = String(name || '');
  for (const p of DAYS_PATTERNS) {
    const m = s.match(p.re);
    if (!m) continue;
    const nights = p.nights ? Number(m[p.nights]) : null;
    const days = p.days ? Number(m[p.days]) : null;
    /* 말이 되는 범위만 받는다 — 「9일」은 있어도 「41일」짜리 연수는 없다 */
    if (days !== null && (days < 2 || days > 15)) continue;
    if (nights !== null && (nights < 1 || nights > 14)) continue;
    return { days: days !== null ? days : nights + 1, nights: nights !== null ? nights : days - 1 };
  }
  return { days: null, nights: null };
}

/* ── 인원 ──────────────────────────────────────────────────────────────────
   「(22명)」「12명」「62+2」「111+2」「16+」「35명」. **무상(FOC)은 빼고 유상만** 센다 —
   엔진의 `participants`가 돈을 내는 사람 수이기 때문이다. */
const PAX_PATTERNS = [
  /(\d{1,4})\s*\+\s*\d{1,2}\s*(?:foc|t\/?g|명)?/i,
  /(\d{1,4})\s*명/,
  /(\d{1,4})\s*pax/i,
];

function paxFromName(name) {
  const s = String(name || '');
  for (const re of PAX_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 2 && n <= 2000) return n;
  }
  return null;
}

/* ── 통화 ──────────────────────────────────────────────────────────────────
   문서가 스스로 밝힌 외화 표시만 본다. **원화 표시는 판정에 쓰지 않는다**(위 ⚠ 참고).
   ⚠ 한 문서에 여러 표시가 나오면 **가장 자주 나온 것**을 고르고 개수를 함께 돌려준다 —
     「달러」가 비고에 한 번 나온 원화 문서를 달러 문서로 만들지 않기 위해서다. */
/* 🔴 **통화 이름이 든 고유명사에 속지 않는다** (2026-09-08 실측, ZG).
   「바트」로 찾았더니 바르셀로나 문서가 **태국 바트**가 됐다 — 걸린 것은 가우디 건축물
   **까사바트요**(Casa Batlló)였다. 그 문서는 실제로 유로다. 같은 유형으로
   「유로」는 발신처 이름 **「유로존」**에 걸린다.
   → 한글 통화 이름은 **숫자가 붙어 있을 때만** 통화로 본다(「5-10유로」 · 「106.000엔」).
     ISO 코드(EUR·THB)와 기호(€·¥)는 고유명사가 될 일이 없어 그대로 둔다.
   ⚠ 「달러」만 숫자 없이 둔다 — 실측에서 **열 이름 「비용(달러)」**로 나오기 때문이다.
     그 자리에는 숫자가 안 붙는다. */
const CURRENCY_TOKENS = [
  ['JPY', /YEN|엔화|[0-9]\s*엔|円|¥/gi],
  ['USD', /달러|USD|US\$|\$\s*[0-9]/gi],
  ['VND', /VND|베트남\s*동|[0-9]\s*동(?![0-9가-힣])/gi],
  ['PHP', /PHP|[0-9]\s*페소/gi],
  ['TWD', /TWD|대만\s*달러|NT\$/gi],
  ['EUR', /EUR|유로화|€|[0-9]\s*유로(?![가-힣])/gi],
  ['THB', /THB|[0-9]\s*바트(?![가-힣])/gi],
  ['CNY', /CNY|[0-9]\s*위안(?![가-힣])/gi],
];

function currencyOf(text) {
  const s = String(text || '');
  const hits = [];
  for (const [code, re] of CURRENCY_TOKENS) {
    const m = s.match(re);
    if (m && m.length) hits.push({ code, n: m.length });
  }
  if (!hits.length) return { code: 'KRW?', sure: false, why: '외화 표시가 없다 — 원화로 보이지만 문서가 밝힌 것은 아니다' };
  hits.sort((a, b) => b.n - a.n);
  return { code: hits[0].code, sure: true, n: hits[0].n, others: hits.slice(1).map((h) => h.code + '×' + h.n) };
}

/* ── 시트에 붙어 있는 위젯을 걷어낸다 ─────────────────────────────────────────
   🔴 실측(2026-09-08): 하나투어재팬 양식 3건에 **환율 변환 위젯의 HTML이 통째로**
     셀에 들어 있다 — 한 문서에 `<option>` **370개**. 그 목록에 「홍콩 달러 HKD」
     「대만 달러 TWD」 「체코 코루나 CZK」가 있어서, 도쿄 견적이 **홍콩·대만·체코가
     함께 나오는 문서**가 된다. 통화 판정도 같이 흔든다(USD·EUR·CNY가 전부 나온다).
   ⚠ 문서가 실제로 쓰는 통화는 「요금(YEN)」처럼 **표 머리**에 있다. 위젯은 남의 목록이다.
   ⚠ 태그만 지우면 안 된다 — `<option>` 안의 **글자까지** 지워야 목록이 사라진다. */
function stripWidgets(text) {
  return String(text || '')
    .replace(/<option[^>]*>[^<]*(?:<\/option>)?/gi, ' ')   /* 목록 항목은 글자까지 */
    .replace(/<[^>]{1,200}>/g, ' ');                        /* 남은 태그 */
}

/* ── 표 안의 「박」·「일」 단위 칸에서 일수를 읽는다 ──────────────────────────
   🔴 **일수를 못 읽어 빠지는 것이 남은 최대 손실이다**(닫힌 43건 중 22건).
     그런데 문서는 말하고 있다 — 하나투어재팬 양식은 줄마다 단위를 칸으로 적는다:

       ① 호텔 │ 신주쿠 워싱턴 │ 15500 │ 37 │ 명 │ **4** │ **박** │ 2294000
       ⑤ 가이드 │ 쓰루 가이드  │ 20000 │  1 │ 명 │ **5** │ **일** │  100000

   ⚠ **줄마다 다르다.** 호텔은 4박인데 「휴전일 UP」 줄은 1박이고, 차량은 4일인데
     가이드는 5일이다. 그래서 **가장 큰 값**을 쓴다 — 전 일정을 덮는 줄이 그것이다.

   🔴 **그리고 둘이 서로 맞을 때만 받는다: 일 = 박 + 1.** 한쪽만 보고 정하면
     「차량 4일」을 여행 일수로 읽어 하루를 잃는다. 서로 검산되지 않으면 **비워 둔다** —
     빈칸보다 틀린 값이 위험하다(이 저장소의 규칙). */
function unitsFromGrid(grids) {
  let maxN = null, maxD = null;
  for (const grid of (grids || [])) {
    for (const row of grid) {
      for (let c = 0; c < row.length; c++) {
        const t = String(row[c] === null || row[c] === undefined ? '' : row[c]).trim();
        if (t !== '박' && t !== '일') continue;
        /* 단위 칸 **왼쪽 두 칸**까지 본다 — 빈 칸이 하나 끼는 양식이 있다 */
        for (let k = c - 1; k >= Math.max(0, c - 2); k--) {
          const v = Number(String(row[k] === null || row[k] === undefined ? '' : row[k]).replace(/,/g, ''));
          if (!Number.isInteger(v) || v < 1) continue;
          if (t === '박' && v <= 14) maxN = Math.max(maxN === null ? 0 : maxN, v);
          if (t === '일' && v <= 15) maxD = Math.max(maxD === null ? 0 : maxD, v);
          break;
        }
      }
    }
  }
  if (maxN && maxD && maxD === maxN + 1) return { nights: maxN, days: maxD };
  return { nights: null, days: null };
}

/* ── 넷을 한 번에 ──────────────────────────────────────────────────────────
   @returns {{pax, days, nights, paxFrom, daysFrom, currency, conflict}}
   conflict가 있으면 **쓰지 않는다** — 부르는 쪽이 세어서 밝힌다. */
function bdFacts(fileName, header, text, hints) {
  const h = header || {};
  const fromName = { pax: paxFromName(fileName), ...daysFromName(fileName) };
  const conflict = [];
  /* 🔴 **`dayRows`를 일수로 쓰지 않는다 — 써 봤고, 틀렸다** (2026-09-08, ZG).
     세 번째 출처로 넣었다가 파일명과 전수 대조해 보니 계통적으로 어긋났다:
       나트랑 4N6D → 5 · 도쿄 3일 → 6 · 후쿠오카 3일 → 4 · 북해도 4일 → 10 ·
       오키나와 4일 → 15 · 세부 3박5일 → 11
     `dayMarkers`는 **날짜처럼 보이는 칸이 있는 「줄」의 수**를 센다(`_bd_extract`).
     한 날에 여러 줄이 걸리고 날짜(9/9)도 걸리므로 **일수가 아니다.** 그 함수의
     원래 쓰임(일정표인가 아닌가 — 2 이상이면 일정표)에는 맞지만 여기엔 안 맞는다.
     그대로 뒀으면 멀쩡한 문서 10건이 「어긋남」으로 조용히 빠지고 있었다.
     ⚠ 그래서 `hints`는 받기만 하고 일수로 쓰지 않는다. 다시 넣고 싶으면 **먼저
       파일명과 전수 대조**할 것. */

  let pax = h.pax, paxFrom = '머리글';
  if (pax == null) { pax = fromName.pax; paxFrom = '파일명'; }
  else if (fromName.pax != null && fromName.pax !== pax) {
    conflict.push('인원: 머리글 ' + pax + ' vs 파일명 ' + fromName.pax);
  }

  /* 본문의 **「N박M일」** — `dayRows`와 달리 이건 **문서가 직접 적은 값**이다.
     머리글은 앞 40줄·40자 이내만 훑어서 표 아래쪽에 적힌 것을 놓친다(대만·방콕·오키나와).
     ⚠ 서로 다른 값이 여럿 나오면(옵션 설명 등) **고르지 않는다.** */
  const bodyPairs = [...new Set((String(text || '').match(/(\d{1,2})\s*박\s*(\d{1,2})\s*일/g) || []))];
  let fromBody = { days: null, nights: null };
  if (bodyPairs.length === 1) {
    const m = bodyPairs[0].match(/(\d{1,2})\s*박\s*(\d{1,2})\s*일/);
    const n = +m[1], d = +m[2];
    if (d >= 2 && d <= 15 && n >= 1 && n <= 14) fromBody = { days: d, nights: n };
  }

  /* 표의 단위 칸(「4 박」·「5 일」). 서로 검산될 때만 값이 온다 — 위 `unitsFromGrid` 참고. */
  const fromUnits = unitsFromGrid(hints && hints.grids);

  let days = h.days, nights = h.nights, daysFrom = '머리글';
  if (days == null && fromName.days != null) {
    days = fromName.days; nights = fromName.nights; daysFrom = '파일명';
  } else if (days == null && fromBody.days != null) {
    days = fromBody.days; nights = fromBody.nights; daysFrom = '본문N박M일';
  } else if (days == null && fromUnits.days != null) {
    days = fromUnits.days; nights = fromUnits.nights; daysFrom = '표의 박·일 칸';
  } else if (days != null && fromName.days != null && fromName.days !== days) {
    conflict.push('일수: 머리글 ' + days + ' vs 파일명 ' + fromName.days);
  }
  /* 파일명·본문으로 정한 일수가 표의 단위 칸과 다르면 **고르지 않는다.** */
  if ((daysFrom === '파일명' || daysFrom === '본문N박M일') && fromUnits.days != null && fromUnits.days !== days)
    conflict.push('일수: ' + daysFrom + ' ' + days + ' vs 표의 박·일 칸 ' + fromUnits.days);
  /* 파일명과 본문이 둘 다 있는데 다르면 고르지 않는다 — 인원 쪽과 같은 규칙이다. */
  if (daysFrom === '파일명' && fromBody.days != null && fromBody.days !== days)
    conflict.push('일수: 파일명 ' + days + ' vs 본문 ' + fromBody.nights + '박' + fromBody.days + '일');
  /* 박수만 알면 일수는 +1이다(이건 셈이지 추정이 아니다) */
  if (days == null && nights > 0) { days = nights + 1; daysFrom += '(박수+1)'; }
  if (nights == null && days > 1) nights = days - 1;

  /* ⚠ **`undefined`가 아니라 `null`로 돌려준다.** 머리글에 그 칸이 아예 없으면
     `h.days`가 `undefined`인데, 그대로 흘리면 `JSON.stringify`가 **칸을 통째로 지운다** —
     「값이 없다」와 「칸이 없다」가 같은 얼굴이 되어 로그에서 원인을 못 찾는다.
     (테스트가 이걸 잡았다: `{"d":null}`이어야 할 자리가 `{}`로 찍혔다.) */
  const orNull = (v) => (v === undefined ? null : v);
  return {
    pax: orNull(pax), days: orNull(days), nights: orNull(nights),
    paxFrom, daysFrom, currency: currencyOf(text), conflict,
  };
}

module.exports = { bdFacts, daysFromName, paxFromName, currencyOf, stripWidgets };

/* ═══════════════════════════════════════════════════════════════════════════
   견적서 PDF 층 구조 추출 (RZ)
   ───────────────────────────────────────────────────────────────────────────
   왜 다시 만드나 — 예전 추출기(RN)는 **납작하게 편 텍스트에서 한 줄**을 봤다.
   `단가 × 수량 × 총금액`이 **같은 텍스트 줄에 나란히 있어야** 동작하는데, 그게 되느냐는
   pdf-parse가 글자를 뱉는 순서에 달려 있고 **그 순서는 견적서 양식마다 다르다.**
   실측(견적서 46건):
     · 하나투어 세부내역서(한화 뉴퍼스트) → 검산줄 40개
     · 하나투어 요약형(신한 썸머페스티벌)  → 검산줄 **0개** (단가표는 멀쩡히 있다)
   단가표 머리글이 있는데 한 줄도 못 잡은 파일이 7건이었다. 즉 **옛 구조가 양식에
   의존**하고 있었다.

   이 파일은 그 의존을 없앤다. 층마다 하는 일이 다르고, 위층이 실패해도 아래층이 남는다:

     L0 문서 종류 판별 — 단가표가 있는 문서인가. 없으면 "없다"고 말한다(추측하지 않는다).
     L1 좌표로 줄 세우기 — "같은 높이에 그려진 글자는 같은 줄"이라는 기하학만 쓴다.
                           양식을 몰라도 되고, 표를 그리는 PDF면 전부 참이다.
     L1.5 견적 블록 분리 — **PDF 하나에 견적이 여러 벌 들어 있을 수 있다.**
                           한화 뉴퍼스트 건이 그랬다(2쪽 81,887,120 / 3쪽 85,878,235 — 골프조
                           게임비가 더해진 다른 버전). 나누지 않으면 두 벌의 줄이 섞여
                           식비·관광비가 부풀고 총계 검산이 깨진다. 실제로 그렇게 나왔고
                           L4가 잡아냈다. **어느 쪽이 맞는지는 사람만 안다 — 고르게 한다.**
     L2 산술 검산 — 단가 × 수량 × 횟수 = 총금액이 맞는 줄만 후보로 삼는다(RN에서 유지).
     L3 어휘 분류 — 회사가 달라도 **쓰는 낱말은 같다**(항공료·유류할증·조식/중식/석식·
                    차량·가이드·입장료). L1이 낱말을 숫자 옆에 되돌려 놓았으므로
                    여기서부터는 양식과 무관하다.
     L4 문서 자체 검산 — 소계·총계·1인당이 서로 맞는지 본다. 고객에게 나간 견적서는
                        숫자가 맞으므로, **맞아떨어지면 우리가 제대로 읽었다는 증거**다.
                        정답지 없이 정확도를 잴 수 있는 유일한 방법이다.

   그 위에 기존 방어선을 그대로 얹는다:
     L5 AI — L3가 못 가른 줄만 **번호로** 고르게 한다. 숫자를 지어낼 경로는 여전히 없다.
     L6 사람 — 후보 목록에서 1클릭 정정. 최종 결정은 언제나 사람이다.

   ⚠ pdf.js를 직접 require하지 않는다. pdf-parse의 `pagerender` 옵션으로 **프로덕션이
   이미 쓰는 그 경로 그대로** 좌표를 받는다. 새 번들 리스크가 없다(pdf-parse 2.x가
   Vercel에서 통째로 죽은 전례가 있어 여기는 보수적으로 간다).
   ═══════════════════════════════════════════════════════════════════════════ */

/* 항목별 상한 — 이 이상은 오독/오타로 보고 버린다. 여기 한 곳에서만 정한다
   (api/quotes.js가 POST 검증에도 같은 값을 쓴다 — 두 곳에 적으면 화면은 통과시키고
   서버가 거절하는 일이 생긴다). */
const LIMITS = {
  airfare: 50000000,
  fuel: 2000000,
  hotel: 10000000,
  meal: 1000000,
  vehicle: 10000000,
  guide: 5000000,
  sight: 2000000,
  /* 골프 1인 1회 라운딩(그린피+카트+캐디피). 실측 범위 170,000(제주)~242,550(후아힌) —
     해외 고급 코스를 감안해 넉넉히 잡되, 전 일정 총액이 들어오면 걸리게 둔다. */
  golf: 2000000,
  sell: 50000000,
  hotelNameLen: 80,
};

/* 총금액이 이보다 작으면 단가 줄로 보지 않는다 — 날짜·인원·전화번호가 우연히
   곱셈으로 맞아떨어지는 것을 걸러낸다. */
const ROW_MIN_TOTAL = 10000;
const ROW_MAX_CANDIDATES = 60;

/* ═══ L1 — 좌표로 줄 세우기 ═════════════════════════════════════════════════
   pdf.js는 글자 조각마다 변환행렬을 준다. transform[4]=x, transform[5]=y.
   y가 같으면 같은 줄이다. 이건 양식이 아니라 기하학이라 회사가 달라도 성립한다.

   ⚠ 허용오차가 중요하다. 실측에서 표의 줄 간격은 8~10pt인데, 같은 줄 안에서도
   글꼴이 다르면 baseline이 2pt쯤 어긋난다(라벨과 숫자가 갈라지는 원인이 이것이다).
   그래서 3.5pt로 묶는다 — 2pt 어긋남은 흡수하고 8pt 간격은 안 건드린다. */
const Y_TOLERANCE = 3.5;

async function readLayout(buffer, pdfParse) {
  const pages = [];
  await pdfParse(buffer, {
    /* ⚠ pagerender가 빈 문자열을 돌려주므로 result.text는 안 쓴다.
       대신 아래에서 **좌표로 세운 줄**을 이어 붙여 텍스트를 만든다 —
       pdf-parse 기본 평탄화보다 원본 표에 가깝다. */
    pagerender: (pageData) =>
      pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then((tc) => {
          pages.push(tc.items
            .map((it) => ({ s: String(it.str), x: it.transform[4], y: it.transform[5] }))
            .filter((it) => it.s.trim() !== ''));
          return '';
        }),
  });

  const lines = [];
  pages.forEach((items, pageIdx) => {
    /* y 내림차순(PDF는 아래가 0)으로 훑으며 허용오차 안이면 같은 줄로 붙인다 */
    const sorted = items.slice().sort((a, b) => b.y - a.y);
    let cur = null;
    sorted.forEach((it) => {
      if (!cur || Math.abs(it.y - cur.y) > Y_TOLERANCE) {
        cur = { page: pageIdx + 1, y: it.y, cells: [] };
        lines.push(cur);
      }
      cur.cells.push(it);
    });
  });

  lines.forEach((ln, i) => {
    ln.cells.sort((a, b) => a.x - b.x);
    ln.idx = i;
    ln.text = ln.cells.map((c) => c.s.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  });

  return { lines, text: lines.map((l) => l.text).join('\n'), pageCount: pages.length };
}

/* ═══ L1.5 — 견적 블록 분리 ═════════════════════════════════════════════════
   PDF 한 개에 견적서가 여러 벌 들어 있는 일이 실제로 있다. 견적을 고치면서 옛 장을
   지우지 않고 뒤에 새 장을 붙이는 방식이다. 나누지 않으면 두 벌의 단가 줄이 한 덩어리로
   섞여 **식비·관광비가 부풀고 총계가 안 맞는다**.

   가르는 기준은 '총 견적가/총 금액' 줄이다 — 견적서 한 장은 반드시 그것으로 끝난다.
   ⚠ 같은 값의 총계 줄이 연달아 두 줄 나오는 양식이 있어('총 금액' 다음 '총 견적가'),
   **값이 바뀔 때만** 장을 끊는다. 안 그러면 한 장이 둘로 쪼개진다.
   ⚠ 어느 장이 '맞는' 견적인지는 코드가 알 수 없다(둘 다 실제로 보낸 견적일 수 있다).
   그래서 고르지 않고 **전부 돌려주고 사람이 고르게** 한다. 기본값은 단가 줄이 가장 많은
   장 — 표가 가장 온전한 쪽이지 '최신'이라는 뜻이 아니며, 화면이 그렇게 말한다. */
const TOTAL_RE = /총\s*견\s*적\s*가|총\s*금\s*액|총\s*액\s*계|합\s*계\s*금\s*액/;

function splitQuoteBlocks(lines) {
  const blocks = [];
  let cur = [];
  let lastTotal = null;
  let tableRows = 0;   /* 이번 장에 단가표가 실제로 있었는가 */
  lines.forEach((ln) => {
    cur.push(ln);
    /* 단가표의 한 줄인가 — 정확할 필요는 없다. "이 장에 표가 있었나"만 알면 된다.
       ⚠ '큰 숫자 3개'로 세면 안 된다. 표 한 줄은 `단가 수량 횟수 총금액`이라
       **수량·횟수가 작은 수**다(가이드 140 196,000 2 3 1,176,000 → 1000 넘는 건 2개뿐).
       그렇게 셌더니 표를 한 줄도 못 찾아 3장짜리 문서가 1장으로 붙었다(실측). */
    const ns0 = numbersIn(ln.text);
    if (ns0.length >= 4 && ns0.filter((n) => n >= 1000).length >= 2) tableRows++;
    if (!TOTAL_RE.test(ln.text)) return;
    const ns = numbersIn(ln.text).filter((n) => n >= 100000);
    if (!ns.length) return;
    const v = Math.max.apply(null, ns);
    /* ⚠ 총계 줄이 **연달아 세 줄** 나오는 양식이 있다(실측, 한화 상하이):
           총 금액                    114,057,720
           총 견적가                  114,057,720
           총 견적가 (백원 단위 절삭)  114,057,000   ← 값이 다르다!
       값이 정확히 같을 때만 안 끊으면 절삭 줄에서 장이 하나 더 생긴다(3장 → 6장).
       그래서 두 가지로 막는다:
         ① 앞 총계와 **1만 원 안쪽**이면 같은 장의 다시 쓴 총계로 본다
         ② 마지막 경계 이후 **단가표가 없었으면** 장이 아니다 — 견적서 한 장에는
            반드시 단가표가 있다
       ⚠ ①을 비율(1%)로 잡으면 안 된다. 같은 문서의 다른 차수 견적이 114,057,720과
       112,934,220으로 **0.98% 차이**여서 통째로 삼켜졌다(3장 → 2장). 절삭은 백원·천원
       단위라 차이가 1만 원을 넘지 않으므로 **절대값**으로 재는 게 맞다. */
    if (lastTotal != null && Math.abs(v - lastTotal) <= 10000) return;
    if (tableRows < 3) return;
    lastTotal = v;
    blocks.push({ lines: cur, total: v });
    cur = [];
    tableRows = 0;
  });
  if (cur.length) {
    /* 총계 없이 끝난 꼬리 — 앞 장의 부록(안내문 등)이면 마지막 장에 붙이고,
       장이 하나도 없으면(총계가 아예 없는 문서) 그 자체가 한 장이다. */
    if (blocks.length) blocks[blocks.length - 1].lines = blocks[blocks.length - 1].lines.concat(cur);
    else blocks.push({ lines: cur, total: null });
  }
  return blocks.map((b, i) => Object.assign({ idx: i }, b));
}

/* ═══ L2 — 산술 검산 ════════════════════════════════════════════════════════
   RN에서 유지한다. 달라진 것은 **무엇을 한 줄로 보느냐**뿐이다(L1이 정한다).
   이 단계를 통과한 숫자는 문서에 실제로 있고, 서로 검산까지 맞다. */

function numbersIn(s) {
  return (String(s).match(/\d[\d,]*/g) || [])
    .map((t) => Number(t.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

const isMoneyish = (s) => /^[\d,]+$/.test(String(s).trim().replace(/[₩원]/g, ''));

/* 견적서의 **요약 줄** — 항목이 아니라 총계·1인당을 풀어 쓴 줄이다.
   ⚠ '소계'는 여기 넣지 않는다. 소계 줄은 숫자가 둘뿐이라 어차피 단가 줄이 안 되고,
      L3.5가 **묶음 경계**로 쓰고 있다(빼면 구분 열 상속이 통째로 죽는다).
   ⚠ '1인'만으로 거르면 안 된다 — 「가이드 1인」·「기사 1인」 같은 진짜 항목 줄이 걸린다.
      실제 요약 줄의 모양(성인/아동 (1인), N인 요금, 1인당)만 좁혀서 적는다. */
const SUMMARY_LINE_RE = /총\s*견\s*적\s*가|총\s*금\s*액|합\s*계\s*요금|합\s*계\s*금액|1\s*인\s*당|1\s*인\s*요금|1\s*인\s*상품가|(성인|아동)\s*\(\s*1\s*인\s*\)/;

/* ═══ L2.5 — 통화 판별 ══════════════════════════════════════════════════════
   ⚠ 이것을 안 하면 **10배 틀린 값이 조용히 요율에 들어간다.** 실측에서 발견:
     대림벧엘교회(큐슈) — 표 전체가 엔화다.
       「식사 1일차 중식 | ¥ | 2,000 | 1 | 46 | ¥ | 92,000」
     산술은 완벽히 맞는다(2,000 × 46 = 92,000). 하지만 2,000은 **엔**이고 원화로는
     19,000원이다. 그대로 넣으면 식비 기준가가 1/10로 무너지고, 그 값이 갱신 제안을 타고
     고객 견적까지 간다. 겉으로는 아무 문제 없어 보이는 종류의 결함이라 특히 위험하다.

   판별 방법 — 좌표 덕분에 셀 단위로 볼 수 있다. **통화 기호 셀은 바로 다음 숫자 하나에만**
   적용한다(`¥ 2,000 1 46 ¥ 92,000`에서 1·46은 통화가 아니다).
   환율은 문서가 스스로 밝힌 것만 쓴다. **없으면 환산하지 않고 비워 둔다** —
   오늘 환율로 임의 환산하면 견적 시점과 어긋나고, 그건 추정치를 사실로 굳히는 짓이다. */
const CURRENCIES = [
  { code: 'JPY', re: /[¥￥]|円|\bJPY\b/i },
  { code: 'USD', re: /\$|\bUSD\b|\bUS\$/i },
  { code: 'EUR', re: /€|\bEUR\b/i },
  { code: 'VND', re: /₫|\bVND\b/i },
  { code: 'CNY', re: /元|\bCNY\b|\bRMB\b/i },
];

function cellCurrency(s) {
  const t = String(s).trim();
  if (!t) return null;
  for (const c of CURRENCIES) if (c.re.test(t)) return c.code;
  return null;
}

/* 문서가 밝힌 환율을 찾는다 (SF에서 넓혔다).
   ⚠ 이 함수가 한 칸을 못 읽으면 그 견적서의 **외화 줄이 통째로 버려진다** — 환율 없이는
   환산하지 않는다는 원칙 때문이다(그 원칙 자체는 옳다. 오늘 환율로 때우면 견적 시점과
   어긋난 값이 '실측'으로 굳는다). 실측: 코퍼스 46건 중 17건이 여기 걸려 있었는데,
   **그중 12건은 문서가 환율을 적어 두고 있었다.** 우리 패턴이 못 잡았을 뿐이다.

   겪은 표기 — 앞의 셋은 통화를 밝히고, 넷째는 밝히지 않는다:
     ① "급격한 환율 변동시 … (현재 1JPY = 9.5원 기준)"   통화가 숫자 **앞**
     ② "현재 환율 ($1 = 1,430원 기준)"                  기호가 숫자 앞 — ①과 어순이 다르다
     ③ "기준 환율 ($) 1,450" · "환율(달러) 1,390" · "환율(VND) 23,000"   ← 「기준」이 없기도 하다
     ④ "환율 ₩ 1,740"                                 **통화를 안 밝힌다** — 아래 참고 */
const FX_SYMBOL = { $: 'USD', '€': 'EUR', '¥': 'JPY', '￥': 'JPY', '₫': 'VND' };
const FX_WORD = { 엔: 'JPY', 달러: 'USD', 유로: 'EUR', 동: 'VND', 위안: 'CNY' };
/* ⚠ 실측된 **문서의 오타**다(KS두레: 「현재 1JYP = 9.5원 기준」). 사람이 쓴 문서라
   오타가 있고, 그것 하나로 그 견적서 25줄이 통째로 버려졌다. 겪은 것만 적는다 —
   짐작으로 늘리지 말 것. */
const FX_TYPO = { JYP: 'JPY' };
const FX_CODE = '(?:JPY|USD|EUR|VND|CNY|JYP)';
const fxNorm = (raw) => {
  const s = String(raw).trim();
  return FX_SYMBOL[s] || FX_WORD[s] || FX_TYPO[s.toUpperCase()] || s.toUpperCase();
};

/* 1단위가 몇 원인가 — **자릿수만** 본다. 튜닝 값이 아니라 통화에 대한 사실이다.
   ⚠ 이게 없으면 문서의 오기를 그대로 믿는다. 실측 두 건:
     · 호남 북해도 「환율(달러) 9.7」 — 값은 **엔** 환율인데 라벨이 달러다(문서가 틀렸다).
     · 다낭 「환율(VND) 23,000」 — 이건 원화 환율이 아니라 **1달러 = 23,000동**이다.
       그대로 믿으면 동화 줄이 23,000배가 된다. 겉으로는 아무 문제 없어 보이는 종류다.
   범위는 넉넉하게 잡는다 — 걸러내려는 것은 '요즘 시세와 다름'이 아니라 **자릿수가 말이
   안 되는 값**이다. 애매하면 통과시키고 사람이 화면에서 본다. */
const FX_PLAUSIBLE = {
  JPY: [3, 30], USD: [500, 3000], EUR: [500, 4000], CNY: [50, 500], VND: [0.01, 0.5],
};
const fxPlausible = (code, v) => {
  const band = FX_PLAUSIBLE[code];
  if (!band) return true;              /* 모르는 통화는 판단하지 않는다 */
  return v >= band[0] && v <= band[1];
};

function findFxRates(lines) {
  const named = {};   /* 통화를 밝힌 표기 — 언제나 이쪽이 이긴다 */
  const bare = [];    /* 통화를 안 밝힌 「환율 ₩ N」 */
  const rejected = [];/* 자릿수가 말이 안 돼 버린 것 — 조용히 버리지 않는다 */
  const put = (code, v) => {
    if (!code || !Number.isFinite(v) || v <= 0 || named[code]) return;
    if (!fxPlausible(code, v)) { rejected.push({ code, value: v }); return; }
    named[code] = v;
  };
  const num = (s) => Number(String(s).replace(/,/g, ''));

  lines.forEach((ln) => {
    const t = ln.text;
    let m;
    /* ① 통화가 숫자 앞:  1JPY = 9.5원 / 1 달러 = 1,430원 */
    if ((m = t.match(new RegExp('1\\s*(' + FX_CODE + '|엔|달러|유로|동|위안)\\s*[=:]\\s*([\\d,.]+)\\s*원', 'i')))) {
      put(fxNorm(m[1]), num(m[2]));
    }
    /* ② 기호가 숫자 앞:  $1 = 1,430원 / US$1 = … — ①과 어순이 반대라 따로 봐야 한다 */
    if ((m = t.match(/(?:US)?([$€¥￥₫])\s*1\s*[=:]\s*([\d,.]+)\s*원/i))) {
      put(fxNorm(m[1]), num(m[2]));
    }
    if ((m = t.match(/100\s*(엔|JPY)\s*[=:]\s*([\d,.]+)\s*원/i))) {
      put('JPY', num(m[2]) / 100);
    }
    /* ③ 「(기준) 환율 (통화) 값」 — ⚠ 「기준」은 있을 수도 없을 수도 있다.
       그것 하나 때문에 「환율($) 1,385」·「환율(달러) 1,390」을 못 읽고 있었다. */
    if ((m = t.match(new RegExp('환\\s*율\\s*\\(?\\s*([$€¥￥₫]|' + FX_CODE + '|달러|엔|유로|동|위안)\\s*\\)?\\s*[:=]?\\s*([\\d,.]+)', 'i')))) {
      put(fxNorm(m[1]), num(m[2]));
    }
    /* ④ 통화를 안 밝힌 「환율 ₩ 1,740」. 원화 기호는 '얼마짜리냐'를 말할 뿐 무슨 통화의
       환율인지는 말하지 않는다 — 그래서 여기서 바로 쓰지 않고 모아만 둔다. */
    if ((m = t.match(/환\s*율\s*[₩원]\s*([\d,.]+)/))) {
      const v = num(m[1]);
      if (Number.isFinite(v) && v > 0) bare.push(v);
    }
  });
  return { named, bare, rejected };
}

/* 통화를 안 밝힌 환율을 **어느 통화의 것으로 볼지** 정한다.
   ⚠ 짐작이 아니다. 견적서에 외화가 **한 종류뿐이면** 그 환율은 그 통화의 것일 수밖에 없다.
      두 종류 이상이면(₫와 $를 함께 쓰는 양식이 있다) 어느 쪽인지 알 수 없으므로 쓰지 않는다.
   ⚠ 통화를 밝힌 표기가 이미 있으면 **그쪽이 이긴다.** 실측(키움 북해도): 안내문은
      「1JPY = 9.5원」인데 아래 요약표는 「환율 ₩ 9.39」다. 둘이 다르고, 어느 쪽이 실제
      계약 환율인지는 코드가 모른다 — 통화를 밝힌 쪽이 더 분명한 진술이므로 그것을 쓴다.
   ⚠ 모아 둔 값끼리 어긋나면 쓰지 않는다. 하나로 모일 때만 그 문서의 환율이다. */
function bindBareFx(bare, currencies) {
  if (!bare.length) return { rate: null, why: '' };
  const lo = Math.min.apply(null, bare), hi = Math.max.apply(null, bare);
  if (hi - lo > lo * 0.001) return { rate: null, why: '환율 표기가 서로 다릅니다(' + bare.join(' / ') + ')' };
  if (currencies.length !== 1) {
    return { rate: null, why: currencies.length ? '외화가 ' + currencies.join('·') + ' 여러 종류라 어느 환율인지 알 수 없습니다' : '' };
  }
  /* 묶어 놓고 보니 자릿수가 말이 안 되면 그 환율은 그 통화의 것이 아니다 */
  if (!fxPlausible(currencies[0], bare[0])) {
    return { rate: null, why: '「환율 ' + bare[0] + '」은 ' + currencies[0] + ' 환율로 볼 수 없는 자릿수입니다' };
  }
  return { rate: { code: currencies[0], value: bare[0] }, why: '' };
}

/* 한 줄에서 라벨(앞쪽 글자)과 비고(뒤쪽 글자)를 갈라낸다.
   ⚠ 이게 L1을 만든 이유다 — 옛 구조에서는 이 라벨이 문서 딴 곳에 흩어져 있었다. */
function splitLabel(cells) {
  const texts = cells.map((c) => c.s.trim()).filter(Boolean);
  let first = texts.length;
  for (let i = 0; i < texts.length; i++) {
    if (isMoneyish(texts[i]) || /^\d[\d,]*$/.test(texts[i])) { first = i; break; }
  }
  let last = -1;
  for (let i = texts.length - 1; i >= 0; i--) {
    if (isMoneyish(texts[i]) || /^\d[\d,]*$/.test(texts[i])) { last = i; break; }
  }
  return {
    label: texts.slice(0, first).join(' ').trim(),
    note: last >= 0 ? texts.slice(last + 1).join(' ').trim() : '',
  };
}

/* 한 줄을 **숫자 + 그 숫자의 통화**로 쪼갠다.
   통화 기호 셀은 바로 뒤 숫자 하나에만 붙는다 — `¥ 2,000 1 46 ¥ 92,000`에서 1·46은
   개수이지 금액이 아니다. 숫자와 기호가 한 셀에 붙어 있는 표기(`$137`)도 함께 본다. */
function lineNumbers(cells) {
  const out = [];
  let pending = null;
  cells.forEach((c) => {
    const s = String(c.s).trim();
    if (!s) return;
    const own = cellCurrency(s);
    if (!/\d/.test(s)) {
      if (own) { pending = own; return; }
      /* ⚠ **줄표는 「금액 없음」이다.** 그 칸이 비었다는 뜻이므로 앞의 통화 기호를
         여기서 **써 버린다** — 안 그러면 기호가 훌쩍 건너뛰어 **다음 칸의 다른 통화**
         숫자를 물들인다. 실측(신한 썸머페스티벌 푸꾸옥): 「인솔자 경비 $ - 200,000 6명」에서
         `$`가 동화 200,000을 달러로 물들여 200,000 × 1,390 = **2억 7,800만원**이 되고,
         상한에 걸려 그 칸이 통째로 비었다(원래 값 236,300원이 사라졌다). */
      if (/^[-–—]+$/.test(s)) pending = null;
      return;
    }
    const cur = own || pending;
    /* ⚠ **x를 함께 들고 다닌다**(SL). 견적서 한 장에 표가 **좌우로 둘** 있는 양식이 있어
       (오키나와 바모스: 왼쪽 관광조 48명 · 오른쪽 골프조 20명), L1이 「같은 높이 = 같은 줄」로
       묶으면 두 표의 숫자가 한 줄에 섞인다. 어느 표의 숫자인지는 **x로만** 알 수 있다. */
    numbersIn(s).forEach((n) => { out.push({ n, cur: cur || null, x: c.x }); });
    pending = null;   /* 기호는 한 숫자만 물들인다 */
  });
  return out;
}

/* cutX — 좌우로 나란한 두 표의 **경계 x**(SL 후속). 주어지면 한 조합의 숫자가 그 선을
   넘나들지 못하게 한다.
   ⚠ 이 선은 **짐작이 아니라 그 문서에서 찾아낸 것**이다. 1차로 줄을 뽑아 총액 칸의 x가
      두 무리로 갈리는지 보고(splitSideTables), 갈렸으면 그 경계로 2차를 돌린다.
   ⚠ 「숫자 사이 간격이 넓으면 다른 표」로는 못 가른다 — 실측해 보니 **정상 조합의
      단가↔총액 거리가 중앙값 104pt**로, 표 사이 틈(90~99pt)보다 오히려 넓다.
      한 줄 안의 간격만 보고는 절대 구분되지 않는다. */
function findUnitRows(lines, fx, cutX) {
  const rates = fx || {};
  /* 총금액 하한 — 날짜·인원·전화번호가 우연히 곱셈으로 맞는 것을 걸러낸다.
     ⚠ 외화 줄은 자릿수가 작다(¥2,000 = 19,000원). 원화 기준으로 재야 한다.
     환율을 모르면 최소한의 크기(500)만 본다 — 그 줄은 어차피 값 후보에서 빠진다. */
  const bigEnough = (val, cur) => {
    if (!cur) return val >= ROW_MIN_TOTAL;
    const rate = rates[cur];
    return rate ? val * rate >= ROW_MIN_TOTAL : val >= 500;
  };
  const found = [];
  lines.forEach((ln) => {
    /* ⚠ **요약 줄은 단가 줄이 아니다.** 견적서 머리에는 「성인 (1인) ₩3,020,000 x 10명
       ₩ 30,200,000」처럼 **총계를 풀어 쓴 줄**이 있는데, 이것이 `3,020,000 × 10 =
       30,200,000`으로 산술 검산을 그대로 통과한다. 그러면 그 문서의 금액이 **두 번**
       세어져(실측: 좋은친구 양식 4건이 전부 커버리지 200%), 「뽑은 줄 합계 ≤ 총계」
       검산이 깨지고 우리가 얼마나 읽었는지도 알 수 없게 된다.
       ⚠ 게다가 그 줄은 **1인당 금액을 단가 자리에** 들고 있어, 분류만 붙으면 곧바로
       엉뚱한 항목의 대표 단가가 된다. 처음부터 뺀다. */
    if (SUMMARY_LINE_RE.test(ln.text)) return;
    const toks = lineNumbers(ln.cells);
    if (toks.length < 3 || toks.length > 14) return;
    const ns = toks.map((t) => t.n);
    const { label, note } = splitLabel(ln.cells);
    /* 단가와 총금액이 **같은 통화**여야 그 줄의 통화로 인정한다. 둘 중 하나만 기호가
       붙어 있으면 그 기호를 따른다(양식에 따라 합계에만 기호를 찍는 곳이 있다). */
    const push = (a, b, c, d) => {
      /* ⚠ **한 조합의 숫자는 같은 표에서 나와야 한다.** 실측(글로벌 웰스 푸꾸옥):
           「호텔 풀만 트윈 $150 3 55 $24,750 … 호텔 풀만 트윈 $150 1 3 $450 선발대 3」
         왼쪽은 본 행사(55룸 3박), 오른쪽은 **선발대 3명**이다. 그런데 오른쪽 총액 450과
         왼쪽 수량 55가 묶여 `450 × 55 = 24,750`이 성립했고, **1박 단가 자리에 3박 총액**이
         들어가 객실 단가가 643,500원이 됐다(동료 견적서들은 214,825원).
         ⚠ 줄 단위 가르기만으로는 못 막는다 — 그건 완성된 조합이 어느 표에 속하는지만 보는데,
           이 사고는 **조합이 만들어지는 순간** 일어난다. */
      if (cutX != null) {
        const side = (i) => (toks[i].x < cutX ? 0 : 1);
        const s0 = side(a);
        if (side(b) !== s0 || side(d) !== s0 || (c != null && side(c) !== s0)) return;
      }
      const cur = toks[a].cur || toks[d].cur || null;
      found.push({
        lineIdx: ln.idx, page: ln.page, line: ln.text, label, note,
        unit: ns[a], qty: ns[b], times: c == null ? 1 : ns[c], total: ns[d],
        currency: cur,
        /* 이 조합이 줄의 **어디쯤**에서 나왔나 — 좌우로 나란한 표를 가르는 데 쓴다(SL).
           총액 칸은 표마다 한 열이라 가장 안정적인 기준점이다. */
        xTotal: toks[d].x, xUnit: toks[a].x,
      });
    };

    for (let a = 0; a < ns.length; a++) {
      /* ⚠ **단가가 1인 조합은 단가가 아니다.** 1원·1달러짜리 항목은 없다 — 그 1은
         수량 열이나 횟수 열을 단가 자리로 잘못 읽은 것이다. SB가 「곱수는 2,000 이하
         정수만 개수로 본다」로 막았지만 그 상한은 **원화 기준**이라, 숫자가 작은 외화
         견적서에서는 통째로 새어 나간다. 실측(글로벌 푸켓·세부, 환율을 읽게 된 뒤 드러남):
         「40인승 버스 $ 777 1 1 $ 777」에서 `1 × 777 = 777`이 검산된 조합으로 이겨
         단가가 **1**이 됐고, 화면에는 1 × 환율 = **1,430원**이 대형버스 1일 단가로 나갔다
         (문서가 같은 줄에 적어 둔 원화는 1,118,447원이다). */
      if (ns[a] === 1) continue;
      for (let b = 0; b < ns.length; b++) {
        if (b === a) continue;
        for (let d = 0; d < ns.length; d++) {
          if (d === a || d === b) continue;
          if (!bigEnough(ns[d], toks[d].cur || toks[a].cur)) continue;
          if (Math.abs(ns[a] * ns[b] - ns[d]) <= 1) push(a, b, null, d);
          for (let c = 0; c < ns.length; c++) {
            if (c === a || c === b || c === d) continue;
            if (Math.abs(ns[a] * ns[b] * ns[c] - ns[d]) <= 1) push(a, b, c, d);
          }
        }
      }
    }
  });

  /* 한 줄에서 여러 조합이 맞을 수 있다. 같은 (줄,총액)이면 **단가가 가장 큰 것**만
     남긴다 — 우리가 찾는 것은 단가이지 수량이 아니다.
     ⚠ 단, 그 앞에 **검산이 실제로 이뤄졌는지**를 먼저 본다(SB). 아래 vacuous 참고. */
  const best = new Map();
  found.forEach((r) => {
    const k = r.lineIdx + '|' + r.total;
    const cur = best.get(k);
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && r.unit > cur.unit)) best.set(k, r);
  });
  return pruneVacuous(Array.from(best.values()))
    .sort((x, y) => x.lineIdx - y.lineIdx)
    .slice(0, ROW_MAX_CANDIDATES)
    .map((r, i) => Object.assign({ idx: i }, r));
}

/* ═══ 공허한 검산 줄 (SB) ═══════════════════════════════════════════════════
   `단가 × 1 × 1 = 총금액`은 **곱셈이 아무것도 증명하지 않는다.** 한 줄에 같은 숫자가
   두 번 나오기만 하면 통과한다. 즉 이 줄은 "검산에 통과한 줄"이 아니라 **검산이 없었던
   줄**이다. 그런데 지금까지 검산된 줄과 똑같이 취급했고, 그래서 두 가지가 터졌다.

   ① **줄 병합 오염.** L1은 "같은 높이 = 같은 줄"로 묶는데, 견적서 오른쪽에 딴 표(원가
      요약)가 있으면 그 숫자가 같은 높이로 딸려 들어온다. 실측(글로벌 금융판매 북해도):
        「가이드 가이드 일비 ¥ 10,000 4 1 ¥ 40,000 **지상 720,609 746,210** 지상 814,4」
      왼쪽이 진짜 가이드 줄(¥10,000×4)이고 오른쪽 746,210은 **지상비**다. 그런데
      `746,210 × 1 × 1 = 746,210`이 검산을 통과해 같은 라벨('가이드')을 물려받고,
      단가가 더 크다는 이유로 **대표 가이드 일당이 됐다** — 실제 95,000의 7.9배.
   ② 같은 줄에 `단가 × 수량`과 `총금액 × 1 × 1`이 둘 다 성립하면 총금액이 단가 자리를
      차지한다(같은 총액이라 ①의 dedup에서 만난다).

   그래서 **검산된 조합이 공허한 조합을 이긴다.** 다만 공허한 줄을 통째로 버리지는
   않는다 — 「항공 320,000 1 1 320,000」처럼 **진짜 1인 단가**가 그 모양인 양식이 많고
   (실측 46건 중 여러 건), 버리면 그 칸이 통째로 빈다. 대신 같은 줄에 검산된 조합이
   있을 때만 물러나게 하고, 살아남은 공허한 값은 `ev()`가 신뢰도를 낮춰 내보낸다.

   ⚠ **나눗셈으로 단가를 복원하지 않는다.** 「현지 차량 590 885,000」의 몫 1500은
   개수가 아니라 **환율**이다(타이베이 건 — 그 문서는 전 줄이 USD열·원화열 쌍이다).
   몫이 개수라는 보장이 없으면 복원은 10배 틀린 값을 '실측'으로 굳힌다. */
/* ⚠ '검산됐다'는 곱수가 **개수로 말이 되는** 곱셈이었다는 뜻이다. 이 단서를 빠뜨렸다가
   회귀 테스트에 바로 걸렸다: 「항공 320,000 1 1 320,000」에서 `1 × 320,000 = 320,000`도
   성립하므로(수량이 320,000!) 그쪽이 '검산된 조합'으로 이겨 **단가가 1**이 됐다.
   곱셈은 순서를 안 가리므로 크기로 가려야 한다 — 인원·박수·대수는 2,000을 넘지 않는다
   (findPax가 인원을 셀 때 쓰는 범위와 같은 뜻이다). */
const COUNT_MAX = 2000;
const isCount = (n) => Number.isInteger(n) && n >= 1 && n <= COUNT_MAX;
const checkedRow = (r) => isCount(r.qty) && isCount(r.times) && (r.qty > 1 || r.times > 1);
const vacuous = (r) => !checkedRow(r);
const rank = (r) => (vacuous(r) ? 0 : 1);

function pruneVacuous(rows) {
  const byLine = new Map();
  rows.forEach((r) => {
    const l = byLine.get(r.lineIdx) || [];
    l.push(r); byLine.set(r.lineIdx, l);
  });
  const keep = [];
  byLine.forEach((list) => {
    /* 그 줄이 검산된 조합을 내놓았다면, 검산 안 된 조합은 그 줄의 값이 아니다. */
    const checked = list.filter((r) => !vacuous(r));
    if (checked.length) { keep.push.apply(keep, checked); return; }
    /* 전부 공허하면 — **통화 기호가 붙은 쪽**이 그 줄의 값이다. 기호가 없는 숫자는
       옆 표에서 흘러든 것일 가능성이 높다(위 ①에서 746,210·450,000이 정확히 그랬다).
       ⚠ 그 줄에 기호가 하나도 없으면 이 판단을 하지 않는다 — 원화 전용 양식이다. */
    const marked = list.filter((r) => r.currency);
    keep.push.apply(keep, marked.length ? marked : list);
  });
  return keep;
}

/* ═══ L3 — 어휘 분류 ════════════════════════════════════════════════════════
   여기가 사장님 지적("전부 틀이 다르다")에 대한 답이다. 표 모양은 회사마다 다르지만
   **한국어 견적서가 쓰는 낱말은 같다.** 46건 전부에서 아래 어휘가 쓰이는 것을 확인했다.

   ⚠ 순서가 의미를 갖는다. '유류할증료'는 '항공'보다 먼저 봐야 항공료로 빨려들지 않고,
   '룸드랍'은 '룸'(호텔)이 아니라 식사다. 이런 것은 규칙으로 못 박아 둔다 —
   AI에게 맡기면 같은 문서에서도 답이 흔들린다(실측으로 확인한 성질이다). */
const VOCAB = [
  /* [분류, 맞으면 그 분류, 아니면 제외할 패턴] */
  /* ⚠ 패널티·취소료는 **단가가 아니라 사고 비용**이다. 가장 먼저 걸러야 한다(SB).
     실측: 「호텔 패널티 180,000」(1명 취소)이 그 문서의 유일한 'hotel' 줄이라
     **대표 객실 단가로 채택**됐고, 호텔명이 `패널티`로 화면에 나갔다(BSI 도쿄).
     「항공 취소패널티 50,000」도 항공료 후보에 들어가 있었다(EnBT 타이베이).
     그 목적지의 요율 기준이 통째로 뒤집히는 값이라 조용히 두면 안 된다.
     ⚠ 버리지 않고 **분류만 따로 준다** — 화면 후보 목록에는 그대로 보이고,
     담당자가 정말 필요하면 1클릭으로 고를 수 있다(조용히 버리지 않는다). */
  { key: 'penalty', re: /패널티|penalty|취소료|취소\s*수수료|위약금|노\s*쇼|no.?show/i },
  /* ⚠ **공동경비는 유류·택스보다 먼저 본다.** 「공동경비&인두세」는 '인두세' 때문에
     유류·택스 칸의 대표가 되어 **진짜 「유류/택스 100,000원」 줄을 밀어냈다**(실측:
     글로벌 베스트 푸꾸옥 100,000 → 152,440, 키움 하노이 125,000 → 99,400).
     공동경비는 여러 항목을 한데 묶어 인원수로 나눈 돈이라 어느 칸의 단가도 아니다 —
     기타로 두면 그 칸들이 각자 제 줄을 찾아간다. */
  { key: 'etc', re: /공동\s*경비/ },
  /* ⚠ **인두세를 여기 두면 안 된다.** 유류할증료는 15만~75만인데 인두세는 1만~3만이라
     자릿수가 다르다. 실측: 「인두세(세금) $ 12,510」이 유류할증료 대표가 됐고(요율표
     최소의 12분의 1), 「현지 수수료/인두세 30,000」도 같은 자리를 차지했다.
     현지 입국세는 항공 유류할증이 아니라 부대비용이다 — 아래 fee로 간다. */
  { key: 'fee', re: /인두세/ },
  { key: 'fuel', re: /유류|할증|택스|TAX|공항세|출국납부금|관광진흥/i },
  { key: 'insurance', re: /보험/ },
  { key: 'fee', re: /수수료|알선|대행료|커미션/ },
  /* ⚠ **객실 줄이 식비로 가던 것** (2026-08-12, 고은회 제주도). 실측:
       「150,000원 X 2박 X **17객실** ₩5,100,000 · 1인1실_조식포함」
     이건 호텔 객실 줄인데 '조식'이 먼저 걸려 **식비**가 됐다. 결과가 둘 다 틀린다 —
       · 식비가 86,984원이 됐다(제주 기준가 60,000의 1.45배). 그 문서는 애초에
         「전일정식사」가 불포함이라 **식비 줄 자체가 없는** 견적서다.
       · 호텔은 17객실짜리 **본 줄을 잃고** 1객실짜리 170,000이 대표가 됐다.
     「조식포함」은 끼니 값이 아니라 **객실 조건**이다. 그래서 객실을 세는 줄은
     식비보다 먼저 호텔로 잡는다. `객실`은 다른 분류와 겹치지 않는 낱말이다.
     ⚠ 아래 hotel 줄에도 `객실`이 그대로 있다 — 지우지 말 것. 이 줄은 **순서**를 위한
       것이고, 저 줄은 「호텔·리조트」처럼 객실이라는 말이 없는 줄을 위한 것이다. */
  { key: 'hotel', re: /객\s*실/ },
  { key: 'meal', re: /조식|중식|석식|중\s*:|석\s*:|조\s*:|식사|만찬|정찬|뷔페|도시락|기내식|룸드랍|룸서비스|간식|야식|음료|주류|스낵|숙취/ },
  { key: 'hotel', re: /호텔|숙박|객실|리조트|스위트|싱글룸|트윈|디럭스|체크인|HOTEL|RESORT/i },
  /* ⚠ **'편도·왕복'만으로 항공이라 보면 안 된다.** 지상 교통도 그렇게 적는다 —
     실측: 홍콩 「픽트램 편도 13,050」이 **항공료 대표**가 됐다(요율표 최소의 20분의 1).
     '편도·왕복'은 항공을 가리키는 다른 낱말과 **함께 있을 때만** 항공으로 본다. */
  { key: 'airfare', re: /항공|운임|사입석|비즈니스석|이코노미|좌석|내항기|(편도|왕복)\s*(항공|운임|티켓|권)|(항공|운임)\s*(편도|왕복)/ },
  { key: 'vehicle', re: /차량|버스|승합|인승|리무진|전용차|주차|톨비|도로유류|기사\s*경비/ },
  { key: 'guide', re: /가이드|인솔자|현지\s*가이드|한국인|기사(?!\s*경비)|\bTC\b/i },
  /* ⚠ 골프는 관광과 **따로 센다.** 요율표의 `sightseeing_fee`는 일반 연수의 관광·입장료인데,
     골프 라운딩비는 자릿수가 다르다(한화 건: 골프 11,136,000 vs 나머지 관광 전부 4,4백만).
     한 칸에 섞으면 그 목적지의 관광비 기준이 통째로 왜곡되고, 그 왜곡이 갱신 제안을 타고
     고객 견적까지 간다. 빼되 **화면에 얼마를 뺐는지 남긴다**(조용히 버리지 않는다). */
  /* ⚠ **골프장을 `C.C`로 적은 문서를 못 알아봤다** (2026-08-12, 고은회 제주도).
     `\bCC\b`는 「오라 CC」는 잡지만 「라헨느 **C.C**」는 못 잡는다. 그 결과:
       · 「입장료 라헨느 C.C 170,000 x 24명」이 **관광비 대표**가 됐다(제주 기준가와
         우연히 같은 170,000이라 눈으로도 안 걸린다).
       · 「오라 C.C」·「그린필드 C.C」는 아예 분류가 안 붙어 조용히 빠졌다.
     골프를 관광비와 따로 세는 이유(위 주석)가 표기 하나로 무너진다. 국내 골프 연수는
     C.C 표기가 흔하므로 마침표가 있든 없든 같게 본다. 「컨트리클럽」도 함께 넣는다. */
  { key: 'golf', re: /골프|라운딩|그린피|캐디|\bGOLF\b|\bC\s*\.\s*C\b|\bCC\b\s*\d*홀?|컨트리\s*클럽/i },
  /* ⚠ 라틴 문자가 섞인 낱말은 대소문자를 무시해야 한다 — '다낭/몽고메리 GOLF'가
     '골프'에 안 걸려 관광비에서 통째로 빠지던 것을 실측에서 잡았다. */
  { key: 'sight', re: /입장|관광|스파|마사지|케이블카|티켓|투어|체험|공연|박물관|수족관|테마파크|유람|크루즈|요트/i },
  /* ⚠ 공동경비는 **위로 올라갔다**(유류·택스보다 먼저). 여기 남겨 두면 같은 낱말이
     두 번 세어져 「공동경비&인두세」가 세 분류로 보이고, 일괄 줄로 오해받아 통째로
     분류가 빈다(회귀 테스트가 잡았다). 어휘를 옮길 때는 옛 자리를 지울 것. */
  { key: 'etc', re: /현수막|기념품|피켓|명찰|네임텐트|프로젝터|현장추가|패스트\s*트랙|비자|인쇄|디자인|\bAV\b/i },
];

/* ⚠ **여러 항목을 한 줄로 묶은 줄**이 있다 — 「지상 차량, 관광지, 식사 등」·
   「호텔+식사+차량 일체」. 어휘 분류는 먼저 걸리는 것 하나를 고르므로 이런 줄이
   그중 한 칸의 대표값이 된다. 실측(굿리치 아오모리): 지상비 일괄 296,000/인이
   **식비**로 분류돼 1인 1일 식비가 98,667원으로 나갔다(일본 요율 25,000의 4배).
   낱말이 **셋 이상 다른 분류**를 가리키면 그건 항목이 아니라 묶음이다 — 고르지 않는다.
   ⚠ 둘로 낮추면 안 된다. 「인솔/가이드 공동경비」(guide+etc)·「기타 알선 수수료」처럼
   정상적인 줄이 둘까지는 흔하다. */
const BUNDLE_MIN_CATS = 3;

function labelCategories(text) {
  const s = String(text || '');
  if (!s.trim()) return [];
  return VOCAB.filter((v) => v.re.test(s)).map((v) => v.key);
}

function classifyLabel(text) {
  const cats = labelCategories(text);
  if (!cats.length) return null;
  if (cats.length >= BUNDLE_MIN_CATS) return null;
  return cats[0];
}

/* 줄 하나의 분류 — 라벨을 먼저 보고, 없으면 비고를 본다.
   ⚠ 라벨과 비고를 한 덩어리로 합쳐서 보면 안 된다. 비고에 "항공,숙박,식비 등 일체"처럼
   **다른 항목 이름이 나열된** 줄이 실제로 있다(공동경비). 라벨이 이길 수 있게 나눠 본다.
   ⚠ 라벨과 비고 **사이에** 구분 열이 들어간다(L3.5) — readOneBlock을 볼 것.
      이 함수는 구분 열을 모르는 자리(예전 예비 경로·테스트)에서 쓰는 기본형이다. */
/* ⚠ **수량 단위는 비고 문구보다 정직하다** (2026-08-12, 고은회 제주도).
     「150,000원 X 2박 X **17객실** ₩5,100,000 · 1인1실_조식포함」
   이 줄은 라벨이 비어 있고 비고에 '조식'이 있어 **식비**로 분류됐다. 그런데 이 줄은
   **객실을 세고 있다** — 끼니를 객실 단위로 세는 견적서는 없다. 「조식포함」은 그 방에
   무엇이 딸렸는지를 말하는 객실 조건이다.
   그 한 줄 때문에 둘이 함께 틀어졌다: 식비가 86,984원이 되고(그 문서는 「전일정식사」가
   불포함이라 식비 줄이 아예 없다), 호텔은 **17객실짜리 본 줄을 잃고** 1객실짜리
   170,000이 대표가 됐다.
   ⚠ **라벨이 있으면 라벨이 먼저다.** 라벨은 문서가 스스로 붙인 이름이라 가장 세다.
     단위는 라벨이 없을 때 비고보다 먼저 보는 근거다. */
const ROOM_UNIT_RE = /X\s*\d[\d,]*\s*객\s*실/;

function classifyRow(row) {
  const byLabel = classifyLabel(row.label);
  if (byLabel) return byLabel;
  if (ROOM_UNIT_RE.test(String(row.line || ''))) return 'hotel';
  return classifyLabel(row.note) || null;
}

/* ═══ L2.7 — 좌우로 나란한 표 가르기 (SL) ═══════════════════════════════════
   견적서 한 장에 표가 **좌우로 둘** 들어가는 양식이 있다. 실측(글로벌 바모스 오키나와):
   왼쪽은 **관광조 48명**, 오른쪽은 **골프조 20명**이고 항목 이름이 그대로 겹친다
   (조식·중식·석식이 두 벌씩). L1은 「같은 높이에 그려진 글자는 같은 줄」이라는 기하학만
   쓰므로 **두 표가 한 줄로 합쳐진다.**

   왜 고쳐야 하나 — 단가를 고르는 칸(호텔·차량·가이드)은 '가장 비싼 줄' 하나를 뽑으니
   티가 안 나지만, **식비·관광비는 합을 인원으로 나눈다.** 두 조의 식사를 다 더한 뒤
   한 조의 인원으로만 나누면 그대로 부푼다:
     · 바모스 오키나와 1인 1일 식비 **99,177원** (요율표 25,000의 4배)
     · 줄 커버리지 **153%** — 총계보다 많이 읽었다는 뜻이다
   그리고 그 부푼 값이 **목적지 중앙값을 끌어올려**, 정작 맞는 값(하나투어 오키나와
   26,973)이 감사기에서 '이상값'으로 뜨게 만든다. 다수 쪽이 틀린 상태가 된다.

   가르는 방법 — **총액 칸의 x**로 무리를 짓는다. 총액은 표마다 한 열이라 가장 안정적이다.
   무리 사이에 진짜 틈이 있고 양쪽 다 줄이 여럿이면 그건 두 표다.
   ⚠ **두 표 다 진짜 견적이다.** 오른쪽을 '오염'이라 부르면 안 된다 — 골프조도 이 행사의
     일부다. 다만 **한 조를 골라 그 조로만 계산**해야 1인당이 맞는다. 큰 쪽(줄이 많은 쪽)을
     쓰고, 나머지는 **후보 목록에는 그대로 남긴다**(담당자가 1클릭으로 고를 수 있다).
   ⚠ SB의 「줄 병합 오염」과 같은 뿌리다. 그때는 옆 표의 숫자 하나가 단가를 물들였고
     (가이드 746,210 — 실제 95,000), 여기서는 표 전체가 합에 섞인다. */
const SIDE_TABLE_GAP = 80;      /* 총액 열 사이가 이보다 벌어지면 다른 표다(실측 106~237pt) */
const SIDE_TABLE_MIN_ROWS = 2;  /* 양쪽 다 이만큼은 있어야 '표'라고 부를 수 있다 */

function splitSideTables(rows) {
  if (!rows || rows.length < 4) return { rows, info: null };
  const xs = rows.map((r) => r.xTotal).filter((n) => Number.isFinite(n));
  if (xs.length !== rows.length) return { rows, info: null };
  const sorted = xs.slice().sort((a, b) => a - b);
  /* 가장 큰 틈에서 한 번만 자른다 — 표가 셋인 양식은 아직 겪지 않았다 */
  let gap = 0, cut = null;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > gap) { gap = d; cut = (sorted[i] + sorted[i - 1]) / 2; }
  }
  if (gap < SIDE_TABLE_GAP || cut == null) return { rows, info: null };
  const left = rows.filter((r) => r.xTotal < cut);
  const right = rows.filter((r) => r.xTotal >= cut);
  if (left.length < SIDE_TABLE_MIN_ROWS || right.length < SIDE_TABLE_MIN_ROWS) return { rows, info: null };
  /* 큰 쪽을 본 표로 본다. 같으면 왼쪽 — 읽는 순서가 그렇고, 오른쪽은 대개 부속 표다. */
  const main = right.length > left.length ? right : left;
  const other = main === left ? right : left;
  return {
    rows: rows.map((r) => (main.indexOf(r) >= 0 ? r : Object.assign({}, r, { otherTable: true }))),
    info: { tables: 2, mainSide: main === left ? 'left' : 'right', mainRows: main.length, otherRows: other.length, cutX: Math.round(cut) },
  };
}

/* ═══ L3.5 — 구분 열 상속 (SE) ══════════════════════════════════════════════
   어휘 분류가 못 잡는 것이 하나 있다. **브랜드명뿐인 줄**이다 —
   「메트로폴리탄 이케부쿠로(토)」·「쉐라톤 가든뷰」·「도야 만세각」에는 호텔이라는
   낱말이 없다. 실측(코퍼스 46건): 검산줄 960개 중 **224개(23.3%)가 분류 없음**이고,
   그래서 **46건 중 22건이 객실 단가를 아예 못 낸다.** 어휘를 늘려 브랜드명을 쫓는 것은
   끝이 없다(호텔 브랜드는 계속 생긴다).

   그런데 견적서 표에는 답이 이미 그려져 있다. 맨 왼쪽에 **구분 열**이 있고 거기에
   '항공·호텔·식사·차량·가이드'가 적혀 있다. 다만 그 칸이 **병합 셀**이라 글자가
   묶음의 **한 줄에만** 떨어진다. 그 한 줄이 어디냐는 양식마다 다르다:
     · BSI 도쿄  — 묶음의 **가운데** 줄에 떨어진다 (호텔 묶음 3줄 중 2번째)
     · 글로벌 세부 — 묶음의 **첫** 줄에 떨어진다
   ⚠ 그래서 「앞 줄의 분류를 물려받는다」로는 못 푼다. BSI에서는 호텔 묶음 바로 위가
     「항공사 패널티」라 **패널티를 물려받는다.** 방향을 가정하면 반드시 틀린다.

   대신 **소계 줄**을 경계로 쓴다. 견적서 표는 묶음마다 소계로 끝난다(코퍼스 36/46건).
   소계와 소계 사이가 한 묶음이고, 그 안에 구분 글자가 **하나만** 있으면 그게 그 묶음의
   분류다. 둘 이상이면 고르지 않는다.

   지켜야 할 것:
   - 구분 열은 **좌표로** 찾는다. 낱말만 보면 라벨('중식'·'대형버스')도 걸린다.
     표 줄들의 첫 셀 x보다 왼쪽에 있는 x 무리, 그것이 구분 열이다.
   - **자기 라벨이 이긴다.** 「호텔 패널티」는 penalty로 남는다 — 상속으로 되살아나면
     SB에서 고친 것이 그대로 풀린다(패널티가 대표 객실 단가가 됐던 그 결함).
   - 구분 열은 **비고보다 강하다.** 비고는 옆 표에서 흘러든 글자일 수 있다(SB의 줄 병합
     오염). 실측: 북해도 「도야 만세각」 줄이 오른쪽 원가표의 '인솔자'·'가이드' 글자에
     걸려 가이드로 분류됐다 — 구분 열은 '호텔'이라고 적혀 있는데도.
   - 구조가 안 보이면 **상속하지 않는다.** 왜 못 했는지는 `why`로 남긴다(조용한 폴백 금지). */
const SUBTOTAL_CELL_RE = /^(소\s*계|합\s*계|계)$/;
const GROUP_X_TOL = 4;        /* 같은 열로 볼 x 오차(pt) */
const GROUP_MARK_MAXLEN = 10; /* 구분 글자는 짧다 — 긴 것은 라벨이다 */
/* 첫 묶음의 구분 글자는 **첫 검산줄보다 위**에 있을 수 있다(세부 건: 2줄 위. 그 묶음의
   첫 줄들이 단가 '-'라 검산줄이 아니다). 표 머리글 언저리까지만 위로 훑는다. */
const GROUP_LOOKBACK = 12;

function groupColumn(lines, rows) {
  const no = (why) => ({ byLine: null, marks: [], why });
  if (!lines || !lines.length || !rows || rows.length < 2) return no('표 줄이 부족합니다');

  const byIdx = new Map();
  lines.forEach((ln) => byIdx.set(ln.idx, ln));
  const rowLines = rows.map((r) => byIdx.get(r.lineIdx)).filter((ln) => ln && ln.cells.length);
  if (!rowLines.length) return no('좌표가 없습니다');
  const from = Math.min.apply(null, rows.map((r) => r.lineIdx));
  const to = Math.max.apply(null, rows.map((r) => r.lineIdx));
  const rowMinX = Math.min.apply(null, rowLines.map((ln) => ln.cells[0].x));

  /* 마크 후보 — 첫 셀이 **짧고 숫자가 없는 분류 낱말**인 줄 */
  const cands = [];
  for (let i = Math.max(0, from - GROUP_LOOKBACK); i <= to; i++) {
    const ln = byIdx.get(i);
    if (!ln || !ln.cells.length) continue;
    const t = String(ln.cells[0].s).trim();
    if (!t || t.length > GROUP_MARK_MAXLEN || /\d/.test(t)) continue;
    const cat = classifyLabel(t);
    if (cat) cands.push({ lineIdx: i, x: ln.cells[0].x, text: t, cat });
  }
  if (!cands.length) return no('구분 낱말이 없습니다');

  /* 가장 왼쪽 x 무리만 구분 열로 본다. 그 무리가 표 줄의 첫 셀보다 오른쪽이면
     그건 구분 열이 아니라 그냥 라벨이다(구분 열이 없는 양식). */
  const markX = Math.min.apply(null, cands.map((c) => c.x));
  if (markX > rowMinX + GROUP_X_TOL) return no('구분 열이 표 왼쪽에 없습니다');
  /* ⚠ **구분 열은 라벨 열과 다른 열이어야 한다.** 구분 열이 없는 양식에서는 라벨이
     맨 왼쪽이라, 위 검사만으로는 「항공료」·「차량」 같은 **라벨을 구분 글자로 착각**한다.
     구분 열이 진짜로 있다면 그 열이 비어 라벨부터 시작하는 표 줄이 반드시 있다
     (병합 셀이라 글자가 묶음의 한 줄에만 떨어지므로). 그 줄이 하나도 없으면 그만둔다. */
  if (!rowLines.some((ln) => ln.cells[0].x > markX + GROUP_X_TOL)) return no('구분 열과 라벨 열이 같습니다');
  const marks = cands.filter((c) => c.x <= markX + GROUP_X_TOL);
  const catCount = new Set(marks.map((m) => m.cat)).size;
  if (marks.length < 2 || catCount < 2) return no('구분 열로 볼 마크가 부족합니다');

  /* 경계 = 소계 줄. 없으면 묶음을 끊을 수 없다 — 마크가 묶음의 위에 있는지 가운데
     있는지 알 방법이 사라지므로, 가정하지 않고 그만둔다. */
  const segStart = Math.min(from, marks[0].lineIdx);
  const bounds = [];
  for (let i = segStart; i <= to; i++) {
    const ln = byIdx.get(i);
    if (ln && ln.cells.some((c) => SUBTOTAL_CELL_RE.test(String(c.s).trim()))) bounds.push(i);
  }
  if (!bounds.length) return no('소계 줄이 없어 묶음을 끊을 수 없습니다');

  const byLine = new Map();
  let start = segStart, assigned = 0, ambiguous = 0;
  bounds.concat([to + 1]).forEach((end) => {
    const cats = Array.from(new Set(marks.filter((m) => m.lineIdx >= start && m.lineIdx < end).map((m) => m.cat)));
    if (cats.length === 1) { for (let i = start; i < end; i++) byLine.set(i, cats[0]); assigned++; }
    else if (cats.length > 1) ambiguous++;
    start = end + 1;
  });
  return { byLine, marks, groups: assigned, ambiguous, why: '' };
}

/* ═══ L4 — 문서 자체 검산 ═══════════════════════════════════════════════════
   고객에게 나간 견적서는 숫자가 맞다(사장님 확인). 그러면 문서 안의
   소계 · 총계 · 인원 · 1인당이 서로 맞아떨어져야 한다. 우리가 읽은 결과로 그 관계가
   재현되면 **정답지 없이도** "제대로 읽었다"를 말할 수 있다.
   ⚠ 이 검산은 값을 고치지 않는다. 화면과 감사에 **증거로 남기기만** 한다
   (조용한 폴백을 만들지 않는다는 이 저장소의 규칙 그대로다). */
/* UW: **맨 처음 나온 「인원 N명」을 고르지 않는다.** 한 문서에 인원 표기가 둘 이상
   있는 일이 흔하다 — 출발지가 나뉘면 그렇다. 실측(리더스에셋 푸꾸옥):

       인 원 50명        ← 머리말 (인천 출발분)
       인원 70명         ← 머리말 (전체)
       대한항공(1) … 50명   비엣젯항공(2) … 20명      = 70
       1일차 석식 … 70명 · 여행자보험 … 70명 · 알선수수료 … 70명

   예전에는 먼저 나온 50을 잡아 **모든 1인당 단가의 분모가 틀렸고**, 그 탓에 문서에
   적힌 1인당 금액까지 검산에서 버려져 그 견적서가 표본에서 통째로 빠졌다.

   그래서 후보를 전부 모으고 **항목 줄이 가장 많이 쓰는 인원**을 고른다. 짐작이 아니라
   문서 안의 표가 투표하는 것이다.
   ⚠ 후보가 하나뿐이면 예전과 완전히 같다 — 45건은 아무것도 안 바뀐다.
   ⚠ 지지가 같으면 **먼저 나온 것**을 쓴다(옛 동작). 뒤집을 근거가 없으면 안 뒤집는다.
   ⚠ 어떻게 골랐는지 함께 돌려준다. 조용히 바꾸면 담당자는 왜 인원이 그 값인지 모른다. */
function findPax(lines, rows) {
  const heads = [];
  for (const ln of lines) {
    const m = ln.text.match(/인\s*원[^\d]{0,4}(\d{1,4})\s*명?/) || ln.text.match(/총\s*인\s*원[^\d]{0,4}(\d{1,4})/);
    if (m) { const n = Number(m[1]); if (n >= 2 && n <= 2000 && heads.indexOf(n) < 0) heads.push(n); }
  }
  /* 항목 줄이 그 인원을 몇 번 쓰는가 — 식사·보험·수수료처럼 전원에게 걸리는 줄이 표를 준다 */
  const tally = new Map();
  (rows || []).forEach((r) => {
    const q = Number(r && r.qty);
    if (q >= 2 && q <= 2000) tally.set(q, (tally.get(q) || 0) + 1);
  });

  if (heads.length === 1) return { pax: heads[0], via: 'header', heads, votes: tally.get(heads[0]) || 0 };
  if (heads.length > 1) {
    let best = heads[0], bestVotes = tally.get(heads[0]) || 0;
    for (const h of heads.slice(1)) {
      const v = tally.get(h) || 0;
      if (v > bestVotes) { best = h; bestVotes = v; }
    }
    return {
      pax: best,
      via: best === heads[0] ? 'header' : 'rows',
      heads, votes: bestVotes,
    };
  }
  /* 못 찾으면 수량의 최댓값으로 본다 — 1인당 항목의 수량이 곧 인원이다 */
  const qtys = (rows || []).map((r) => Math.max(r.qty, r.times)).filter((n) => n >= 2 && n <= 2000);
  return { pax: qtys.length ? Math.max.apply(null, qtys) : 0, via: qtys.length ? 'maxQty' : 'none', heads, votes: 0 };
}

/* 1인 판매가로 인정할 범위 — 밖이면 그 줄은 1인당이 아니라 총액이거나 딴 숫자다.
   ⚠ '판매가'라는 말은 양식에 따라 총액에도 쓰인다. 범위와 인원 대조로 갈라낸다. */
const PER_PERSON_MIN = 100000;
const PER_PERSON_MAX = 20000000;

function findTotals(lines, pax, preferGrand, fx) {
  let grand = preferGrand || null, perPerson = null, itemsTotal = null;
  const rates = fx || {};
  /* 그 줄에 적힌 금액을 **원화로** 읽는다 (SH).
     ⚠ 총계를 외화로만 적는 양식이 많다(「합계 ¥ 2,557,000」·「합계 $ 16,135」).
        엔·달러 숫자를 원화로 착각하면 총계가 1/10~1/1500이 되고, 그러면 「뽑은 줄 합계
        ≤ 총계」 검산이 통째로 뒤집힌다. 환율을 모르면 **읽지 않는다**(추측하지 않는다).
     ⚠ 통화가 붙지 않은 숫자는 예전대로 원화로 본다 — 원화 전용 양식이 다수다. */
  /* ⚠ **코드는 금액이 아니다.** 견적서 아래쪽에는 「상품코드 APQ221260609PR9」·
     「예약코드 QA00664748001」·「견적번호 QJ00666408001」이 있고, 그 줄에 합계가 함께
     그려져 **한 줄로 합쳐진다**(L1은 같은 높이를 한 줄로 본다). 코드 속 숫자를 금액으로
     읽으면 총계가 **23억**이 된다(실측: 대림벧엘 보홀 2,322,603,097 — 실제는 1,700만 원대).
     글자와 숫자가 한 칸에 섞여 있으면 그건 코드다. 통화 표기(원·₩·$·¥·€)는 예외다. */
  const isCodeCell = (s) => /\d/.test(s) &&
    /[A-Za-z가-힣]/.test(String(s).replace(/원|₩|¥|￥|\$|€|₫|USD|JPY|EUR|VND|CNY/gi, ''));
  const wonNumbers = (ln) => lineNumbers(ln.cells.filter((c) => !isCodeCell(String(c.s).trim()))).map((tk) => {
    if (!tk.cur) return tk.n;
    const rate = rates[tk.cur];
    return rate ? tk.n * rate : null;
  }).filter((n) => n != null);

  /* ── 자간이 벌어진 금액을 되살린다 (UF) ──────────────────────────────────
     PDF에서 글자가 하나씩 떨어져 나오는 양식이 있다. 실측(하나투어 상해):

         「총 합계 비용 **15, 861 , 6 00** 원」   ← 15,861,600원이다

     이걸 그대로 읽으면 15 · 861 · 6 · 00으로 흩어져 **총계가 통째로 빈다.**
     그 견적서는 총계가 없다는 이유로 역검증에서 빠진다.

     ⚠ **아무 공백이나 붙이면 안 된다.** 「인원 15 20」이 1520이 되면 없던 금액이 생긴다.
       그래서 **붙였을 때 세 자리 콤마 형식이 완성될 때만** 금액으로 받는다
       (`15,861,600` ✓ / `1520` ✗). 콤마 자리가 맞는다는 것은 그 숫자가 원래 한 덩어리로
       찍힌 금액이었다는 뜻이다 — 우연히 맞기 어렵다.
     ⚠ **평소 경로가 실패했을 때만** 쓴다. 정상 줄을 건드리지 않기 위해서다. */
  const SPACED_AMOUNT = /\d{1,3}(?:,\d{3})+/g;
  /* ⚠ **외화가 적힌 줄에는 절대 쓰지 않는다.** 이 되살리기는 통화를 안 보기 때문에,
     「합계 ¥ 2,557,000」을 그대로 원화 2,557,000으로 읽어 버린다 — 「환율을 모르면
     환산하지 않는다」(SH·SF)를 통째로 뚫는다. 실제로 회귀 테스트가 그걸 잡았다.
     원화 전용 줄에서 자간만 복원하는 것이 이 도구의 전부다. */
  const HAS_CURRENCY = /[¥￥$€₫]|USD|JPY|EUR|VND|CNY|SGD|THB|IDR/i;
  const spacedNumbers = (ln) => {
    if (HAS_CURRENCY.test(String(ln.text || ''))) return [];
    const joined = String(ln.text || '').replace(/(?<=[\d,])[ \t]+(?=[\d,])/g, '');
    const out = [];
    (joined.match(SPACED_AMOUNT) || []).forEach((s) => {
      const n = Number(s.replace(/,/g, ''));
      if (Number.isFinite(n)) out.push(n);
    });
    return out;
  };

  lines.forEach((ln) => {
    const t = ln.text;
    /* ⚠ '총액'이라는 말이 견적 총액이 아닌 곳에 쓰인다 — 실측에서
       「최종 투찰금(총액) 320,000,000」(입찰 상한)을 견적 총계로 집어
       1인당 검산이 통째로 깨졌다. 이런 줄은 처음부터 뺀다. */
    if (/투찰|입찰|예산|한도|가입\s*금액|보상|보장/.test(t)) return;
    /* ⚠ '입금가'는 총액이 아니라 **1인 원가**로 쓰는 양식이 있다(대림벧엘 큐슈).
       총액으로 잘못 잡으면 그보다 큰 판매가가 "총액보다 크다"는 이유로 버려진다 —
       실제로 그래서 판매가가 비어 있었다. 총액 후보에서 뺀다. */
    /* ⚠ **「총 여행경비」라고만 적는 양식이 있다** (UH). 실측(굿리치 가고시마·아오모리):
           총 여행경비  14   26,619,180
           1인 여행경비      1,901,370
       「총 견적가」·「총 금액」을 요구하는 패턴에 하나도 안 걸려 **총계가 통째로 비었고**,
       그러면 그 견적서는 1인당도 못 얻어 역검증에서 빠진다(가고시마가 그 상태였다).
       ⚠ **「여행경비」만으로 보면 안 된다.** 코퍼스 46건 중 9건이 맺음말에
         「※ 여행 경비 중 과세 항목은 '알선 수수료'이며」를 달고 있다 — 총계가 아니라
         안내문이다. 그래서 **앞에 「총」이 붙은 것만** 받는다. */
    if (/총\s*견\s*적\s*가|총\s*금\s*액|총\s*계|합\s*계\s*금액|총액|총\s*여\s*행\s*경\s*비/.test(t)) {
      const ns = wonNumbers(ln).filter((n) => n >= 100000);
      /* 블록 경계에서 읽은 총계가 있으면 그걸 믿는다 — 그 줄이 곧 '총 견적가'다 */
      if (ns.length && !preferGrand) { const v = Math.max.apply(null, ns); if (grand == null || v > grand) grand = v; }
    }
    /* ⚠ **「합계」와 「총 견적가」는 같은 말이 아니다.** 하나투어·글로벌 원가 시트는
       항목을 다 더한 줄을 그냥 「합계 ¥ 2,557,000」이라고 적는데, 그건 **원가 합계**이고
       고객에게 나가는 총 견적가가 아니다(마진이 빠져 있다).
       처음엔 이것도 `grand`로 받았다가 **1인 판매가가 14건에서 통째로 사라졌다** —
       「1인당 × 인원 ≈ 총액」 검사가 원가 합계를 기준으로 도니 판매가가 전부 탈락했다.
       그래서 칸을 나눈다: `grand`는 견적 총액, `itemsTotal`은 항목 합계.
       ⚠ '소계'는 걸리지 않는다(`합\s*계`는 '소계'에 매칭되지 않는다). */
    if (/합\s*계/.test(t)) {
      /* 평소 경로가 빈손이면 **자간이 벌어진 금액**을 되살려 본다(위 주석) */
      let ns = wonNumbers(ln).filter((n) => n >= 100000);
      if (!ns.length) ns = spacedNumbers(ln).filter((n) => n >= 100000);
      if (ns.length) { const v = Math.max.apply(null, ns); if (itemsTotal == null || v > itemsTotal) itemsTotal = v; }
    }
    /* '판매가·상품가·객단가'도 1인 기준으로 쓰는 양식이 많다(대림벧엘 큐슈: 판매가 1,251,350).
       ⚠ 총액에 같은 말을 쓰는 양식도 있어, **1인 범위 안이고 총액보다 작을 때만** 받는다.
       ⚠ **표기가 이것 말고도 많다**(SP). 예전엔 「1인당」·「인당 요금」만 봐서 아래를 전부
          놓쳤고, 그 때문에 역검증에서 **12건이 통째로 빠졌다**(대조 46건 중 16건뿐이었다).
          1인당을 못 읽으면 그 견적서는 채점표가 되지 못한다 — 오차를 잴 수가 없다.
            「성인 (1인) ₩3,020,000 x 10명」  ← '1인'과 '당'이 떨어져 있다
            「1 인 금액 1,479,125」            ← '금액'은 패턴에 없었다
            「● 인당 : ₩3,750,000」           ← '요금'이 없다
            「1인(유로) € 1,434」·「일인당 € 1,944」 ← **외화**라 환산도 필요하다
       ⚠ 금액은 `wonNumbers`로 읽는다 — 외화로만 적힌 1인당을 원화로 착각하면 1/1000이 된다
          (환율을 모르면 아예 읽지 않는다. 그 원칙은 그대로다). */
    /* ⚠ **「당」이 없는 양식이 있다.** 실측(하나투어 상해):
         「**1 인 1,030,000 원** + 황포강유람선 / 꽃 비용 411,600 원」
       15명 x 1,030,000 + 411,600 = 15,861,600 으로 총계와 정확히 맞는데, 패턴이
       「1인**당**」을 요구해 통째로 못 읽었다. 그 견적서는 1인당이 없다는 이유로
       역검증에서 빠진다.
       ⚠ 🔴 **「1인 1실」에 걸려 실제로 회귀를 냈다.** 처음에 「1 인」 뒤 숫자 한 자리만
         봤더니 「호텔 아시아호텔 90,000 2 24명 4,320,000 **1인 1실**」이 걸렸고,
         그 줄의 4,320,000이 1인당 후보로 들어가 `Math.max`가 그것을 골랐다.
         그러면 1인당 x 인원 검산(4,320,000 x 24)이 총계와 딴판이라 **맞는 값
         1,137,780까지 함께 버려졌다.** 늘린 패턴이 멀쩡한 값을 죽인 것이다.
       → 「1 인」 **바로 뒤가 금액 꼴**일 때만 받는다(숫자·콤마 5자 이상).
         「1인 1실」의 '1'은 한 자리라 안 걸리고, 「1 인 1,030,000」은 걸린다. */
    /* ⚠ 「1인 여행경비」도 같은 양식의 짝이다(위 총계 주석 참고, UH).
       여기서도 **「1인」이 앞에 붙은 것만** 받는다 — 맺음말의 「여행 경비」와 갈라야 한다. */
    if (/1\s*인\s*당|일\s*인\s*당|객단가|상품가|인\s*당\s*[:：]|인당\s*요금|1\s*인\s*요금|1\s*인\s*금액|1\s*인\s*여\s*행\s*경\s*비|1\s*인\s+[₩$¥€]?\d[\d,]{4,}|(성인|아동)\s*\(\s*1\s*인\s*\)|판\s*매\s*가/.test(t)) {
      /* ⚠ **여기서 환산하지 않는다.** `wonNumbers`로 바꿔 봤다가 크게 당했다 — 엔화
         견적서의 「¥289,800」이 원화로 환산돼(×9.5 = 2,753,100) 1인당 후보에 들어갔고,
         `Math.max`가 그것을 골라 삿포로 1인당이 1,746,000 → 2,753,100이 됐다.
         역검증 중앙값이 -9.6% → -13.0%, 최악이 -63.4%가 됐다.
         1인당 표기는 **원화로 적히는 것이 압도적**이라(코퍼스 실측), 외화 1인당은
         읽지 않고 비워 둔다. 틀린 값보다 빈칸이 낫다. */
      const ns = numbersIn(t).filter((n) => n >= PER_PERSON_MIN && n <= PER_PERSON_MAX);
      const ok = ns.filter((n) => grand == null || n < grand);
      if (ok.length) { const v = Math.max.apply(null, ok); if (perPerson == null || v > perPerson) perPerson = v; }
    }
  });
  /* 인원을 아는데 1인당 × 인원이 총액과 딴판이면 잘못 집은 것이다 — 버린다(조용히 쓰지 않는다).

     ⚠ UU: 다만 **버릴 것이 1인당이 아닌 경우가 있다.** 실측(리더스에셋 푸꾸옥):
         총 견적가 128,770,920 · 문서의 1인 객단가 1,839,585 · 우리가 읽은 인원 50
         → 128,770,920 ÷ 1,839,585 = **정확히 70.000**
       문서가 적어 놓은 두 숫자가 서로를 증명하고, 어긋나는 것은 **인원 쪽**이다.
       그런데 예전에는 1인당을 버려서, 화면과 감사기가 「1인당을 못 읽었다」고 말했다 —
       실제로는 읽었고 인원이 틀렸는데, 그 신호가 통째로 사라진 것이다.
       이 문서는 그 이유로 역검증에서 빠져 있었고, 사람이 보기 전에는 원인을 알 수 없었다.
     ⚠ **인원을 여기서 고치지 않는다.** 인원은 규모 계수를 통해 금액에 들어가는 값이라,
       나눗셈이 맞았다는 것만으로 조용히 바꾸면 그게 다음 사고가 된다. 값을 살려 두고
       **어긋났다는 사실을 돌려준다** — 부르는 쪽이 사람에게 한 칸 물어보게 한다. */
  /* ── 라벨이 다음 줄로 밀린 양식 — **문서가 스스로 증명하게 한다** (VE) ───────────
     실측(키움에셋플래너 카자흐스탄):
         114줄  45,776,978  3,269,784
         115줄  총 합계 - ①            ← 라벨이 **금액 다음 줄**에 있다
     위의 모든 패턴은 「라벨과 금액이 같은 줄」을 전제한다. 그래서 이 견적서는 1인당이
     통째로 안 읽혀 역검증에서 빠져 있었다(문서에는 분명히 적혀 있는데도).

     ⚠ **라벨을 쫓지 않는다.** 「총 합계」·「종합」·「① 」… 양식마다 말이 다르고, 다음 줄을
       보기 시작하면 어디까지 볼지 끝이 없다. 대신 **산술이 증명하게 한다** —
       한 줄에 `총액`과 `1인당`이 나란히 있고 `총액 ≈ 1인당 × 인원`이면 그 줄이 곧 근거다.
       이 저장소가 이미 쓰는 방식이다(UU의 「문서가 적어 놓은 두 숫자가 서로를 증명한다」).

     ⚠ **위 경로가 빈손일 때만 돈다.** 지금 잘 읽히는 견적서는 이 규칙을 아예 지나지 않는다 —
       패턴을 넓혀 멀쩡한 값을 죽인 전례가 이 파일에만 두 번 있다(「1인 1실」·엔화 환산).
       빈칸을 채우는 규칙이 채워진 칸을 건드리게 두지 않는다.
     ⚠ 허용 오차 0.5%는 **반올림만 흡수한다.** 넓히면 우연히 맞는 두 숫자가 들어온다
       (실측: 14명 문서에서 3,269,784 × 14 = 45,776,976 vs 문서 45,776,978 — 2원 차이다). */
  if (perPerson == null && pax >= 2) {
    lines.forEach((ln) => {
      const ns = numbersIn(ln.text || '');
      if (ns.length < 2) return;
      for (const per of ns) {
        if (per < PER_PERSON_MIN || per > PER_PERSON_MAX) continue;
        const proven = ns.some((tot) => tot > per && Math.abs(tot - per * pax) <= tot * 0.005);
        if (proven && (perPerson == null || per > perPerson)) perPerson = per;
      }
    });
  }

  let discarded = false;
  let paxConflict = null;
  if (perPerson && grand && pax && Math.abs(perPerson * pax - grand) / grand > 0.25) {
    const implied = grand / perPerson;
    const n = Math.round(implied);
    /* 「나누어떨어진다」는 **사람 수의 절대 오차**로 잰다(0.02명). 상대오차(0.5%)로
       두면 인원이 클수록 헐거워져 우연이 걸린다 — 실측으로 확인했다:
       128,770,920 ÷ 1,234,567 = 104.30인데 104의 0.5%는 0.52라 통과해 버린다.
       그건 잘못 집은 값이지 인원 어긋남이 아니다.
       ⚠ 엄격해서 놓치는 건은 **예전 그대로 버려진다** — 새 위험이 생기지 않는다. */
    const clean = n >= 2 && n <= 2000 && Math.abs(implied - n) <= 0.02;
    if (clean && n !== pax) paxConflict = { docPax: pax, impliedPax: n };
    else { perPerson = null; discarded = true; }
  }

  /* ── 1인당을 **총 견적가 ÷ 인원**으로 유도한다 (UE) ────────────────────────
     문서가 총 견적가와 인원을 둘 다 밝혔는데 1인당만 안 적는 양식이 있다
     (실측: 리더스에셋 푸꾸옥 — 「총견적가 128,770,920」 · 인원 50인데 1인당 표기가 없다).
     그 견적서는 1인당이 없다는 이유만으로 **역검증에서 통째로 빠진다.**
     나눗셈은 문서가 이미 밝힌 두 값으로만 하므로 짐작이 섞이지 않는다.

     ⚠ **`grandTotal`일 때만 한다. `itemsTotal`로는 안 한다**(SH의 구분 그대로) —
       항목 합계는 마진이 빠진 원가 합계라, 그걸 나누면 「1인 판매가」가 아니라
       1인 원가가 된다. 그 둘을 섞으면 오차의 부호를 해석할 수 없게 된다.
     ⚠ 문서에 적힌 1인당이 있으면 **그쪽이 언제나 이긴다.** 유도값은 빈자리만 채운다.
     ⚠ 범위 밖이면 안 쓴다 — 총계가 코드나 딴 숫자였을 수 있다. */
  /* ⚠ **문서가 1인당을 적었는데 검산에서 버린 경우에는 유도하지 않는다.**
     그건 「이 문서에 뭔가 어긋난 것이 있다」는 신호다 — 나눗셈으로 덮으면 그 신호가
     사라진다. 회귀 테스트(test_sP)가 정확히 이 자리를 지킨다: 1인당 3,020,000이 총액과
     안 맞아 버려진 건인데, 유도값 3,149,505로 채우면 「비운다」는 판단이 무력해진다.
     **1인당 표기가 아예 없는 문서에서만** 나눈다. */
  let perPersonVia = perPerson ? 'doc' : null;
  if (!perPerson && !discarded && grand && pax >= 2) {
    const v = Math.round(grand / pax);
    if (v >= PER_PERSON_MIN && v <= PER_PERSON_MAX) { perPerson = v; perPersonVia = 'derived'; }
  }
  return Object.assign({ grand, perPerson, perPersonVia, itemsTotal, paxConflict }, findDeposit(lines));
}

/* 「입금가」 = **우리가 랜드사·홀세일러에 내는 1인 원가**다 (SC).
   ⚠ 이건 판매가가 아니다. 하나투어 원가 시트는 두 숫자를 나란히 찍는다:
        입금가 1,347,276   판매가 1,490,000   HNT 수익 50,000
     · 입금가 = 우리가 하나투어에 내는 돈  (= 우리 원가)
     · 판매가 = 하나투어가 권하는 고객가   (판매가 − 입금가 = 하나투어가 권하는 **우리** 마진)
     · HNT 수익 = 하나투어 자기 몫 (입금가 안에 이미 들어 있다)
   실측: 코퍼스 46건 중 23건이 이 원가 시트다. 원가를 읽을 수 있으면 **엔진 금액이 원가
   아래인지**를 목적지별로 잴 수 있다 — 요율을 올릴지 내릴지가 거기서 나온다.
   ⚠ `perPerson`(판매가)과 **절대 섞지 않는다.** 섞으면 마진이 통째로 사라진 채
   '실측'으로 굳는다. 그래서 칸을 따로 둔다. */
function findDeposit(lines) {
  const cands = [];
  lines.forEach((ln) => {
    if (!/입\s*금\s*가/.test(ln.text)) return;
    /* ⚠ 같은 줄에 판매가·수익이 함께 오는 양식이 있다(「입금가 1,347,276 판매가 1,490,000」).
       '입금가' 뒤에 오는 숫자만 본다 — 줄 전체에서 최댓값을 집으면 판매가를 원가로 읽는다. */
    const after = ln.text.slice(ln.text.search(/입\s*금\s*가/));
    const cut = after.search(/판\s*매\s*가|권장|수익/);
    const seg = cut > 0 ? after.slice(0, cut) : after;
    numbersIn(seg).filter((n) => n >= PER_PERSON_MIN && n <= PER_PERSON_MAX).forEach((n) => cands.push(n));
  });
  if (!cands.length) return { deposit: null, depositAll: [] };
  /* ⚠ **입금가 열이 여러 벌인 문서가 있다.** 실측:
       「소계 ¥ 77,000 입금가 1,347,276 1,313,952 입금가 1,449,409 1,373,952」(북해도)
       「입금가 1,007,000 977,000 1,007,000 1,083,320」(마카오)
     출발지(인천/김해)나 등급이 갈리면 원가도 갈린다. **어느 열이 기준인지는 사람만 안다.**
     큰 쪽을 쓴다 — 원가를 크게 잡으면 「원가 아래」 판정이 더 잘 나오므로 **놓치는 쪽으로
     틀리지 않는다.** 다만 조용히 고르지 않고 후보를 전부 넘겨, 흩어져 있으면 화면·감사가
     말할 수 있게 한다(결함 생성기 ② — 폴백은 흔적을 남긴다). */
  const uniq = Array.from(new Set(cands)).sort((a, b) => b - a);
  return { deposit: uniq[0], depositAll: uniq };
}

function reconcile(lines, rows, preferGrand, fx) {
  /* UW: findPax가 「몇 명인가」와 **어떻게 골랐는가**를 함께 준다. 뒤엣것을 버리면
     화면이 「인원을 왜 그 값으로 봤는지」를 말할 수 없다(조용한 폴백이 된다). */
  const paxPick = findPax(lines, rows);
  const pax = paxPick.pax;
  const { grand, perPerson, deposit, depositAll, itemsTotal, paxConflict } = findTotals(lines, pax, preferGrand, fx);
  const checks = [];
  const near = (a, b, tolPct) => a > 0 && b > 0 && Math.abs(a - b) / b <= tolPct;

  /* ① 총계 ÷ 인원 = 1인당 — 천원 단위 절삭이 흔해 1.5%까지 봐준다 */
  if (grand && perPerson && pax) {
    const calc = grand / pax;
    checks.push({
      name: '총계 ÷ 인원 = 1인당',
      ok: near(calc, perPerson, 0.015),
      detail: `${grand.toLocaleString()} ÷ ${pax} = ${Math.round(calc).toLocaleString()} vs 문서의 ${perPerson.toLocaleString()}`,
    });
  }

  /* ② 뽑아낸 줄들의 총액 합이 총계를 넘지 않는가 — 넘으면 같은 줄을 두 번 셌다는 뜻.
     ⚠ 견적 총액이 없으면 **항목 합계**로 잰다(SH) — 원가 시트는 「합계」만 적는 양식이
     많아서, 견적 총액만 보면 46건 중 27건에서 이 검산이 아예 돌지 않았다.
     ⚠ 외화 줄은 환산되지 못했으면 원화가 아니다 — 합에서 뺀다(자릿수가 뒤섞인다). */
  const scale = grand || itemsTotal;
  if (scale && rows.length) {
    const sum = rows.filter((r) => !r.unconvertible).reduce((n, r) => n + r.total, 0);
    checks.push({
      name: '뽑은 줄 합계 ≤ 총계',
      ok: sum <= scale * 1.02,
      detail: `${sum.toLocaleString()} vs ${grand ? '총계' : '항목 합계'} ${scale.toLocaleString()}`,
    });
  }

  const done = checks.filter((c) => c.ok).length;
  return { pax, paxPick, grand, perPerson, deposit, depositAll, itemsTotal, paxConflict, checks, passed: done, total: checks.length };
}

/* ═══ L4b — 날짜 (견적 작성일 · 출발일) ════════════════════════════════════
   왜 필요한가 — 실측 단가에 **"언제 출발하는 여행이었나"**가 안 붙으면 그 숫자는
   반쪽이다. 요율 엔진은 시즌(월별)과 리드타임(얼마나 미리 잡았나)으로 금액을 움직이는데
   (data.js DEST_SEASON_PROFILES는 스스로 "도메인 초안"이라고 적어 두었다),
   그 계수를 **실측으로 검증할 방법이 지금 없다.** 출발일이 붙으면:
     · 같은 목적지의 2월 견적과 8월 견적을 실제 단가로 비교 → 시즌 계수 검증
     · 출발일 − 작성일 = 리드타임 → 리드타임 계수 검증
     · 고객이 "9월 출발"을 물으면 9월에 실제로 나간 견적을 근거로 댈 수 있다

   ⚠ 그리고 이게 **견적 블록을 가르는 근거**이기도 하다. 한화 상하이 건은 2쪽이
   2025.11.08 출발, 3쪽이 2025.11.15 출발이다 — 같은 문서에 든 **서로 다른 두 견적**이다.
   블록마다 따로 읽어야 그 사실이 보인다.

   ⚠ 억지로 채우지 않는다. 46건 중 날짜가 아예 안 적힌 견적서가 있고, 그건 없는 게 맞다. */
const pad2 = (n) => String(n).padStart(2, '0');

/* 2자리 연도는 2000년대로 본다(견적서에 1900년대가 나올 일은 없다) */
function yr(y) {
  const n = Number(y);
  return n < 100 ? 2000 + n : n;
}
const ymd = (y, m, d) => `${yr(y)}-${pad2(m)}-${pad2(d)}`;
const validYmd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return s;
};

/* 견적 작성일 — "날짜 2026-08-06", "견적서 작성일 2026-08-05", "작성일 2026.08.05" */
function findQuoteDate(lines) {
  for (const ln of lines) {
    const t = ln.text;
    /* ⚠ `\b날짜\b`로 쓰면 **한 건도 안 걸린다** — 자바스크립트의 \b는 한글을 낱말
       문자로 안 봐서 한글 앞뒤에서는 경계가 성립하지 않는다. 실측에서 한화 건의
       「수신 … 날짜 2026-08-04」가 통째로 빠졌고, 테스트를 쓰고서야 드러났다. */
    /* ⚠ **영문 「DATE :」도 작성일이다.** 실측(굿리치 바르셀로나): 머리글이
       「2호차 확정 일정표 DATE : 2026-08-06」인데 한글 낱말만 봐서 못 읽었고, 그 결과
       그 날짜가 **출발일로** 들어갔다(진짜 출발일은 일정표의 「04/04/Fri」다).
       작성일을 못 읽으면 「출발일 = 작성일이면 버린다」는 방어도 함께 무력해진다. */
    if (!/작성일|발행일|견적일|날짜|\bDATE\b/i.test(t)) continue;
    const m = t.match(/(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
    if (m) { const v = validYmd(ymd(m[1], m[2], m[3])); if (v) return v; }
  }
  return null;
}

/* 여행 기간 — 표기가 제각각이라 실측에서 본 모양을 전부 받는다:
     "일정 2026.02.04~02.08"          (연도 한 번, 뒤는 월.일)
     "일정 2025.11.08 (2박3일)"        (출발일만 + 박수)
     "행사기간 2025. 11. 8 ~ 11. 12(3박 5일)"
     "여행기간 25.03.12∼25.03.17 (4박6일)"
     "26.07.09 출발 기준"
   ⚠ 물결표가 `~`·`∼`·`-` 세 가지로 나온다. 하나만 받으면 그 양식이 통째로 빠진다. */
const TILDE = '[~∼〜～\\-–—]';

/* 「N박 M일」을 **문서 전체에서** 찾는다 (SA).
   ⚠ 예전에는 이 표기를 아래 관문(`일정|기간|출발…`)을 통과한 줄에서만 읽었다.
   그런데 실제 견적서에서 박수는 대개 **제목 줄**에 있고 그 줄에는 그런 낱말이 없다:
       「키움에셋플래너 해외연수 (북해도) | 3박 4일」
       「대림벧엘교회 해외여행 (큐슈) | 2박 3일」
   그래서 46건 중 **19건이 '일수 불명'**으로 빠졌고, 역검증 대조가 4건밖에 안 됐다.

   박수는 날짜와 달리 문서 전체에서 찾아도 안전하다 — 「N박 M일」은 여행 기간 말고
   쓰일 데가 없는 표기다. 다만 두 가지를 지킨다:
     · 일수가 박수+1 또는 +2일 때만 받는다(4박 6일은 야간 비행으로 실제 있다.
       그 밖의 조합은 표를 잘못 읽은 것이다).
     · 문서에 **서로 다른 값이 여럿**이면(차수·옵션이 섞인 견적서) 가장 많이 나온 것을
       쓰고, 최다가 동점이면 **고르지 않고 비워 둔다.** 둘 중 하나를 찍으면 그 절반은
       조용히 틀린 일수로 요율과 대조된다. */
function findNightsDays(lines) {
  const tally = new Map();
  lines.forEach((ln) => {
    const m = ln.text.replace(/\s+/g, ' ').match(/(\d{1,2})\s*박\s*(\d{1,2})\s*일/);
    if (!m) return;
    const n = +m[1], d = +m[2];
    if (n < 1 || n > 30) return;
    if (d !== n + 1 && d !== n + 2) return;
    const k = n + '/' + d;
    tally.set(k, (tally.get(k) || 0) + 1);
  });
  if (!tally.size) return { nights: null, days: null };
  const ranked = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return { nights: null, days: null };
  const [n, d] = ranked[0][0].split('/').map(Number);
  return { nights: n, days: d };
}

/* 「연도 월 일」 한 덩어리 (SQ에서 넓혔다).
   ⚠ 실측으로 걸린 두 가지 —
     ① **연도와 월 사이가 공백**인 양식: 「행사기간 2026 06. 09 ~ 06. 13」.
        예전엔 구분자(`.`·`-`·`/`)를 요구해 이 줄을 통째로 놓쳤다.
     ② **요일이 날짜와 물결표 사이에 낀다**: 「2026. 4. 7 (화) ~ 4. 11 (토)」.
        날짜와 `~` 사이에 공백만 허용해서 `(화)`에 막혔다.
   이 둘 때문에 **출발일을 못 읽는 문서가 5건**이었고, 출발일이 없으면 역검증에서
   시즌 계수를 맞출 수 없어 그 견적서는 채점에서 통째로 빠진다.
   ⚠ 괄호 안은 **3글자까지만** 받는다 — 요일·「확정」 같은 짧은 표시만 건너뛰려는 것이지
      아무 괄호나 넘으라는 뜻이 아니다(긴 괄호를 넘기면 엉뚱한 날짜 둘이 이어진다). */
const DOW = '(?:\\s*\\([^)]{1,3}\\))?';
/* ⚠ **한글 「년·월·일」도 구분자다** (2026-08-13). 구분자를 `.`·`-`·`/`로만 받아서
     「여행 기간 ( 예정 ) **2025 년 11 월 28 일** ( 금 ) ~ 11 월 30 일 ( 일 ) / 2 박 3 일」이
     통째로 안 걸렸다. 제대로 된 기간 표기인데도 출발일이 비었고, 그러면 그 견적서는
     시즌 계수를 맞출 수 없어 **역검증에서 통째로 빠진다.**
   ⚠ PDF에서 글자 사이가 벌어져 나오는 일이 흔하다(「2025 년 11 월 28 일」) — 그래서
     구분자 앞뒤 공백을 모두 허용한다.
   ⚠ 숫자 셋이 그 순서로 이어져야만 걸리므로 오탐 여지는 좁다. */
const Y_SEP = '(?:\\s*[.\\-\\/]\\s*|\\s*년\\s*|\\s+)';   /* 연도 다음 */
const M_SEP = '(?:\\s*[.\\-\\/]\\s*|\\s*월\\s*)';         /* 월 다음 */
const D_TAIL = '(?:\\s*일)?';                             /* 일 뒤의 '일' */
const YMD = `(\\d{2,4})${Y_SEP}(\\d{1,2})${M_SEP}(\\d{1,2})${D_TAIL}${DOW}`;
/* 연도가 생략된 「월.일」 — 범위의 뒤쪽에 쓴다 */
const MD = `(\\d{1,2})${M_SEP}(\\d{1,2})${D_TAIL}`;

function findTripDates(lines) {
  let depart = null, ret = null, nights = null, days = null;

  const takeNightsDays = (t) => {
    const m = t.match(/(\d{1,2})\s*박\s*(\d{1,2})\s*일/);
    if (m) { nights = +m[1]; days = +m[2]; }
    else {
      const m2 = t.match(/(\d{1,2})\s*박/);
      if (m2) nights = +m2[1];
    }
  };

  /* 관문을 **두 번** 돈다. 1차는 예전 그대로(낱말이 있는 줄만) — 기존 동작을 그대로 둔다.
     2차는 낱말 없이 **기간 범위 표기만** 다시 훑는다. 「2026. 06. 19 ~ 06. 22」처럼
     날짜 두 개를 물결표로 이은 표기는 그 자체로 충분히 특이해서 오탐이 잘 안 난다
     (실측: 「행 2026. 06. 19 ~ 06. 22 (3박 4일)」 — 세로쓰기 '여행기간'이 잘려
     '행'만 남는 바람에 1차 관문에서 통째로 버려지던 줄이다).
     ⚠ 단일 날짜(③)는 2차에서 쓰지 않는다 — 문서 아무 데나 있는 날짜가 출발일로
     둔갑한다. 범위 표기만 믿는다. */
  for (const pass of [1, 2]) {
    if (depart) break;
    for (const ln of lines) {
      const t = ln.text.replace(/\s+/g, ' ');
      const gated = /일정|기간|출발|출국|여행일/.test(t);
      if (pass === 1 && !gated) continue;
      if (pass === 2 && gated) continue;   /* 1차에서 이미 봤다 */

      /* ① 연도.월.일 ~ 연도.월.일 */
      let m = t.match(new RegExp(`${YMD}\\s*${TILDE}\\s*${YMD}`));
      if (m) {
        depart = validYmd(ymd(m[1], m[2], m[3])) || depart;
        ret = validYmd(ymd(m[4], m[5], m[6])) || ret;
        takeNightsDays(t);
        if (depart) break;
      }
      /* ② 연도.월.일 ~ 월.일 (뒤쪽에 연도 생략) */
      m = t.match(new RegExp(`${YMD}\\s*${TILDE}\\s*${MD}(?!\\s*[.\\-\\/]\\s*\\d)`));
      if (m) {
        depart = validYmd(ymd(m[1], m[2], m[3])) || depart;
        /* ⚠ 뒤쪽에 연도가 없으니 앞쪽 연도를 빌려 쓰는데, **해를 넘기는 일정**에서는
           그게 귀국일을 출발일보다 앞으로 보낸다(「2025. 12. 3 ~ 1. 6」 → 2025-01-06).
           그 상태로는 날짜로 센 박수가 음수라 조용히 버려지고, 문서가 밝힌 기간이
           통째로 없는 것이 된다. 여행은 떠난 뒤에 돌아온다 — 다음 해로 넘긴다. */
        let r2 = validYmd(ymd(m[1], m[4], m[5]));
        if (r2 && depart && r2 < depart) r2 = validYmd(ymd(Number(m[1]) + 1, m[4], m[5]));
        ret = r2 || ret;
        takeNightsDays(t);
        if (depart) break;
      }
      /* ②-b 연도.월.일 ~ 일 (**월까지 생략**) — 「행 사 기 간 2025. 12. 3 ~ 6 (3박 4일)」
         실측 2건이 이 표기로만 기간을 밝히고 있었다(리더스에셋 푸꾸옥 · 호남대 북해도).
         둘 다 출발일이 통째로 비어 있어 시즌·리드타임 검증에서 빠져 있었다.
         ⚠ **②보다 반드시 뒤**여야 한다. 앞에 두면 「2026. 06. 19 ~ 06. 22」의 '06'을
           일자로 읽어 6일이 귀국일이 된다 — 있던 값을 틀린 값으로 바꾸는 자리다.
         ⚠ 오른쪽 일자가 왼쪽보다 **커야** 받는다. 작으면 다음 달로 넘어간 것인데
           **몇 월인지는 문서가 말하지 않았다.** 짐작하면 그게 곧 틀린 출발일이 되고,
           출발일은 시즌 계수를 통해 금액에 들어간다 — 비워 두는 편이 낫다. */
      m = t.match(new RegExp(`${YMD}\\s*${TILDE}\\s*(\\d{1,2})${D_TAIL}(?!\\s*[.\\-\\/월]\\s*\\d)`));
      if (m) {
        const d1 = validYmd(ymd(m[1], m[2], m[3]));
        const d2 = validYmd(ymd(m[1], m[2], m[4]));
        if (d1 && d2 && Number(m[4]) > Number(m[3])) {
          depart = d1; ret = d2;
          takeNightsDays(t);
          break;
        }
      }

      /* ③ 출발일 하나만 (+ 박수) — 낱말 관문을 통과한 줄에서만 */
      if (pass !== 1) continue;
      m = t.match(new RegExp(YMD));
      if (m) {
        const v = validYmd(ymd(m[1], m[2], m[3]));
        if (v) { depart = v; takeNightsDays(t); break; }
      }
    }
  }

  /* 위에서 박수·일수를 못 얻었으면 문서 전체에서 찾는다(제목 줄에 있는 경우).
     ⚠ 「4박」만 있고 일수가 없을 때 5일로 채우지 않는다 — 4박 6일이 실제로 있다
     (야간 비행). 일수는 「N박 M일」로 **함께 적힌 것**만 받는다. */
  const labelled = findNightsDays(lines);

  /* 날짜 범위로 센 박수 — 출발일과 귀국일이 둘 다 있을 때만 */
  let fromDates = null;
  if (depart && ret) {
    const diff = Math.round((new Date(ret + 'T00:00:00Z') - new Date(depart + 'T00:00:00Z')) / 86400000);
    if (diff > 0 && diff < 60) fromDates = diff;
  }

  /* ⚠ 문서가 **스스로 모순되는** 일이 있다. 실측(대림벧엘교회 큐슈):
         제목  「대림벧엘교회 해외여행 (큐슈) | 2박 3일」
         기간  「2026. 03. 10 ~ 03. 13 (예정)」  → 3박 4일
     둘 중 하나를 조용히 고르면 그 문서의 일수가 통째로 틀린 채 요율과 대조된다
     (일수는 엔진 금액에 정비례로 들어가는 값이라 그대로 견적 오차가 된다).
     그래서 **날짜 범위를 쓰되(구체적인 증거다) 어긋났다는 사실을 남긴다.**
     화면이 이 표시를 보고 담당자에게 한 칸 물어볼 수 있다 — 조용한 폴백을 만들지 않는다. */
  /* UX: **검사가 잘못된 것을 묻고 있었다.**
     예전에는 「날짜 범위로 센 박수 ≠ 문서에 적힌 박수」면 모순으로 봤다. 그런데 실측
     46건 중 12건이 걸렸고, 그중 10건은 이런 모양이었다:

         행 사 기 2026. 4. 7 (화) ~ 4. 11 (토) / **3박 5일**   ← 한 줄에 같이 적혀 있다
         5일차 인천 6:45 도착                                  ← 귀국이 야간 비행

     4/7~4/11은 여행 밤이 4박이고, 호텔은 3박이다(마지막 밤은 기내). 문서는 **호텔
     박수**를 적은 것이고 모순이 아니다. 발리 건은 문서가 스스로 「캠핀스키 4박 …
     (4박6일)」이라고 두 번 적어 두기까지 했다.

     ⚠ **금액에 들어가는 값은 일수(days)다** — 엔진은 nights를 안 쓴다. 그러니 일수가
       같으면 다툼이 없다. 그런데도 12건에 경고를 띄우면 **10건이 잡음**이고, 잡음이
       섞인 경고는 곧 안 읽힌다 — 그러면 진짜 하나(대림벧엘 큐슈)가 묻힌다.
     → 일수가 어긋날 때만 모순으로 본다. 박수만 다른 것은 조용히 버리지 않고
       `redEye`(기내박으로 보인다)로 남긴다. */
  let nightsConflict = null;
  let redEye = null;
  if (fromDates != null && labelled.nights && labelled.nights !== fromDates) {
    const rangeDays = fromDates + 1;
    if (labelled.days && labelled.days === rangeDays) {
      /* 일수는 같다 — 호텔 박수와 여행 박수의 차이다(대개 기내박). */
      redEye = { hotelNights: labelled.nights, travelNights: fromDates, days: rangeDays };
    } else {
      nightsConflict = { fromDates, labelled: labelled.nights, labelledDays: labelled.days };
    }
  }

  if (fromDates != null) {
    nights = fromDates;
    days = nightsConflict ? fromDates + 1 : (labelled.days && labelled.nights === fromDates ? labelled.days : fromDates + 1);
  } else if (!nights || !days) {
    /* 날짜로 못 세면 제목의 「N박 M일」을 쓴다.
       ⚠ 「4박」만 있고 일수가 없을 때 5일로 채우지 않는다 — 4박 6일이 실제로 있다
       (야간 비행). 일수는 「N박 M일」로 **함께 적힌 것**만 받는다. */
    if (labelled.nights && (!nights || labelled.nights === nights)) {
      nights = labelled.nights; days = labelled.days;
    }
  }

  /* 귀국일이 없고 박수를 알면 채운다 — 다만 **추정한 값임을 표시**한다(조용히 섞지 않게) */
  let returnEstimated = false;
  if (depart && !ret && nights) {
    const d = new Date(depart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + nights);
    ret = d.toISOString().slice(0, 10);
    returnEstimated = true;
  }
  return { depart, ret, nights, days, returnEstimated, nightsConflict, redEye };
}

/* 머리글에 기간이 안 적힌 견적서가 절반이 넘는다(실측 46건 중 28건). 그런 문서도
   **일정표에는** 날짜가 있다 — 다만 「02월 04일」처럼 **연도가 없다.**
   그래서 연도를 다른 데서 데려온다:
     ① 견적 작성일의 연도 (그 날짜보다 앞서면 이듬해로 본다 — 여행은 견적 뒤에 간다)
     ② 문서 어딘가의 4자리 연도가 딱 하나면 그것
     ③ 둘 다 없으면 **추정하지 않는다**
   ⚠ 이렇게 얻은 날짜는 `departVia:'itinerary'`로 표시해 화면이 "일정표에서 추정"이라고
   말한다. 담당자가 제출 전에 눈으로 확인하는 칸이므로, 비워 두는 것보다 낫다. */
/* 일정표가 날짜를 적는 모양들. **한글 「N월 N일」만 보면 유럽 견적서를 통째로 놓친다** —
   실측(2026-08-13): 굿리치 체코·바르셀로나·2026 굿리치 일정표 세 건이 전부
   「4/4(토)」·「04/04/Fri」 꼴이라 출발일·일수를 하나도 못 읽고 있었다.
   ⚠ **슬래시 표기는 반드시 요일이 붙어 있을 때만** 받는다. 그냥 「4/4」는 항공편·좌석·
     비율 등 아무 데나 나오는 모양이라, 요일이라는 자물쇠가 없으면 엉뚱한 수를 날짜로 읽는다.
   ⚠ 「12/25」처럼 월이 12를 넘으면 날짜가 아니다 — 아래 범위 검사가 거른다. */
const ITIN_DATE_PATTERNS = [
  { re: /(\d{1,2})\s*월\s*(\d{1,2})\s*일/, dow: 0 },                                   /* 02월 04일 */
  { re: /(\d{1,2})\s*\/\s*(\d{1,2})\s*\(\s*([월화수목금토일])\s*\)/, dow: 3 },            /* 4/4(토) */
  { re: /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i, dow: 3 },  /* 04/04/Fri */
];

/* ═══ 요일은 자물쇠이면서 **열쇠**다 (UH) ═══════════════════════════════════
   위 패턴에서 요일은 「그냥 4/4는 날짜가 아니다」를 가르는 자물쇠로만 쓰고 있었다.
   그런데 요일은 **연도까지 증명한다** — 4월 4일이 토요일인 해는 몇 년에 한 번뿐이다.

   실측(2026-08-14). 연도를 못 정해 출발일이 통째로 비거나 틀려 있었다:
     · 굿리치 체코        본문에 「2025 …연도대상」과 「2026 굿리치 RM 연도대상」이 **둘 다**
                          있어 `years.size === 1`이 깨졌다 → 출발일 **없음**.
                          4/4은 2025년 금 · **2026년 토** → 문서의 「4/4(토)」가 2026을 고른다.
     · 굿리치 바르셀로나   작성일 2026-08-06(실은 **PDF로 뽑은 날**)에서 연도를 데려와
                          「견적보다 앞서면 이듬해」 규칙이 **2027-04-04**를 만들었다.
                          문서는 「04/04/Fri」라고 적혀 있고 4/4이 금요일인 해는 **2025**다.
                          → 그 행사는 지난 행사였다. 이듬해 규칙의 전제(여행은 견적 뒤에
                            간다)가 **PDF 재출력일 앞에서 무너진다**.

   ⚠ **짐작을 늘리는 것이 아니라 줄이는 장치다.** 후보 연도는 문서가 밝힌 것
     (작성일의 해·그 이듬해·본문의 4자리 연도)뿐이고, 그중 **요일이 실제로 맞는 해**만
     남긴다. 딱 하나 남을 때만 쓴다 — 같은 월/일의 요일은 5~6년에 한 번 돌아오므로
     이 좁은 후보 안에서는 둘이 남는 일이 사실상 없다.
   ⚠ 요일이 적혀 있는데 **맞는 해가 하나도 없으면 비운다.** 문서가 반증한 연도를
     그래도 쓰는 것은 짐작이고, 그 값 하나가 시즌·리드타임 계수를 통째로 틀리게 만든다
     (결함 생성기 ② 조용한 폴백 — 여기서는 폴백하지 않는 쪽이 옳다).
   ⚠ 「02월 04일」처럼 요일이 없는 표기는 **예전 규칙 그대로** 간다(dow: 0). */
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DOW_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function dowIndex(s) {
  if (!s) return -1;
  const t = String(s).trim().toLowerCase();
  const ko = DOW_KO.indexOf(t);
  return ko >= 0 ? ko : DOW_EN.indexOf(t.slice(0, 3));
}

function findItineraryDepart(lines, quoteDate) {
  let md = null;
  for (const ln of lines) {
    for (const p of ITIN_DATE_PATTERNS) {
      const m = ln.text.match(p.re);
      if (m) { md = { mo: +m[1], d: +m[2], dow: p.dow ? dowIndex(m[p.dow]) : -1 }; break; }
    }
    if (md) break;
  }
  if (!md || md.mo < 1 || md.mo > 12 || md.d < 1 || md.d > 31) return null;

  /* 문서가 밝힌 연도 후보 — 여기 없는 해는 애초에 고려하지 않는다 */
  const docYears = new Set();
  lines.forEach((ln) => {
    const g = ln.text.match(/\b(20\d{2})\b/g);
    if (g) g.forEach((y) => docYears.add(Number(y)));
  });

  /* ① 요일이 적혀 있으면 그것으로 가른다.
     후보는 **문서가 밝힌 해와 그 앞뒤 1년**이다. 앞뒤를 여는 이유가 있다 —
     바르셀로나 문서에 2025가 적혀 있던 것은 **우연**이었다(합성 검사에서 드러났다).
     작성일이 PDF 재출력일이면 문서 어디에도 실제 여행 연도가 안 적힐 수 있다.
     ⚠ 그래도 창은 좁게 둔다. 같은 월/일의 요일은 5~6년 주기로 돌아오므로 **연속 4년
       안에서는 맞는 해가 둘일 수 없다** — 이 창이 곧 「하나만 남는다」의 근거다.
       (창을 더 넓히면 둘이 남을 수 있는데, 그때는 아래 `fit.length === 1`이 막는다.) */
  if (md.dow >= 0) {
    const anchors = new Set(docYears);
    if (quoteDate) anchors.add(Number(quoteDate.slice(0, 4)));
    const cands = new Set();
    anchors.forEach((y) => { cands.add(y - 1); cands.add(y); cands.add(y + 1); });
    const fit = [...cands].filter((y) => {
      const iso = validYmd(ymd(y, md.mo, md.d));
      if (!iso) return false;
      const dt = new Date(iso + 'T00:00:00Z');
      /* ⚠ `validYmd`는 일자를 31까지만 본다 — 「2/30」은 3월 2일로 굴러가 엉뚱한 요일과
         우연히 맞을 수 있다. 되짚어 같은 달·같은 날인지 확인한다. */
      if (dt.getUTCMonth() + 1 !== md.mo || dt.getUTCDate() !== md.d) return false;
      return dt.getUTCDay() === md.dow;
    });
    if (fit.length === 1) return validYmd(ymd(fit[0], md.mo, md.d));
    return null;   /* 문서가 반증했거나 못 가렸다 — 짐작하지 않는다 */
  }

  /* ② 요일이 없을 때 — 예전 규칙 그대로 */
  let year = null;
  if (quoteDate) {
    year = Number(quoteDate.slice(0, 4));
    const cand = ymd(year, md.mo, md.d);
    if (cand < quoteDate) year += 1;      /* 견적보다 앞선 날짜면 이듬해 여행이다 */
  } else if (docYears.size === 1) {
    year = [...docYears][0];
  }
  if (!year) return null;
  return validYmd(ymd(year, md.mo, md.d));
}

function findDates(lines) {
  const quoteDate = findQuoteDate(lines);
  const trip = findTripDates(lines);
  let departVia = trip.depart ? 'header' : null;
  /* ⚠ **출발일이 견적 작성일과 같으면 그건 출발일이 아니다** (2026-08-13).
     실측(굿리치 연도대상/바르셀로나): 문서 머리에 「2호차 확정 일정표 DATE : 2026-08-06」이
     있는데 그 **작성일**을 출발일로 읽었다. 정작 진짜 출발일은 일정표의 「04/04/Fri 1일차」다.
     리드타임 0인 행사는 없다 — 견적을 낸 날 출발하지 않는다. 그리고 이 값 하나가
     **시즌 계수와 리드타임 계수를 통째로 틀리게** 만든다(둘 다 출발일로 계산한다).
     ⚠ 그래서 **버리고 일정표 쪽을 다시 본다.** 지우기만 하면 그 문서는 출발일을 영영
       못 얻는데, 일정표에는 대개 날짜가 있다. */
  if (trip.depart && quoteDate && trip.depart === quoteDate) {
    trip.depart = null;
    departVia = null;
  }
  if (!trip.depart) {
    const guess = findItineraryDepart(lines, quoteDate);
    if (guess) { trip.depart = guess; departVia = 'itinerary'; }
  }
  /* ── 출발일을 못 얻었으면 **무엇이 없어서인지** 말한다 (VE) ────────────────────
     예전엔 그냥 null이었고, 역검증은 「출발일 불명」이라고만 찍었다. 그러면 **코드가
     고칠 것과 사람이 한 칸 넣을 것이 같은 얼굴**이 된다 — 환율 쪽에서 이미 겪었다.

     실측으로 갈린다:
       키움에셋플래너 해외연수(하노이) — 일정표에 「04월 02일 ~ 04월 05일」이 또렷한데
         **문서 어디에도 연도가 없다.** 작성일도 없어서 `findItineraryDepart`가 연도를
         추정할 근거조차 없다. → 사람이 **연도 한 칸**이면 들어온다.
       굿리치 RM재무(후아힌) — 「11월 19~22일」은 있는데 연도 후보가 **넷**이다
         (2024·2025·2026·2012). 하나를 고르면 시즌 계수가 조용히 틀린다.
     ⚠ **연도를 추측하지 않는다.** 출발일 하나가 시즌·리드타임 계수를 둘 다 움직인다
       (바로 위 주석이 그 사고를 적어 두고 있다). 모르면 비우되, **왜 비었는지는 말한다.** */
  let departWhy = null;
  if (!trip.depart) {
    const all = lines.map((l) => l.text || '').join(' ');
    const md = [...new Set(all.match(/\d{1,2}\s*월\s*\d{1,2}\s*일/g) || [])];
    const years = [...new Set(all.match(/20\d{2}/g) || [])];
    if (md.length) {
      departWhy = years.length === 0
        ? '문서에 연도가 없다 (' + md.slice(0, 2).join('~') + ' — 연도 한 칸이면 된다)'
        : '연도 후보가 ' + years.length + '개라 고르지 않았다 (' + md.slice(0, 2).join('~')
          + ' · ' + years.slice(0, 4).join('·') + ')';
    }
  }
  /* 리드타임 = 출발일 − 견적 작성일. 요율의 리드타임 계수를 실측으로 재려면 이 값이 있어야 한다.
     ⚠ 음수면(작성일이 출발일보다 뒤) 계산하지 않는다 — 지난 여행을 정산한 문서일 수 있다. */
  let leadDays = null;
  if (quoteDate && trip.depart) {
    const d = Math.round((new Date(trip.depart + 'T00:00:00Z') - new Date(quoteDate + 'T00:00:00Z')) / 86400000);
    if (d >= 0 && d < 1000) leadDays = d;
  }
  return {
    quoteDate,
    departDate: trip.depart,
    /* 'header' = 문서가 기간을 명시했다 · 'itinerary' = 일정표에서 읽고 연도는 추정했다 */
    departVia,
    /* 못 얻었을 때 **왜**인지 (VE). null이면 날짜 흔적 자체가 없다는 뜻이다. */
    departWhy,
    returnDate: trip.ret,
    returnEstimated: trip.returnEstimated,
    nights: trip.nights,
    days: trip.days,
    /* 문서 안에서 기간 표기가 서로 어긋났다 — 화면이 한 칸 물어야 한다(null이면 이상 없음) */
    nightsConflict: trip.nightsConflict || null,
    /* UX: 박수만 다른 것(대개 기내박)은 모순이 아니다. ⚠ 이 흰 목록에 안 적으면
       여기서 조용히 사라져 화면이 「그렇게 봤다」고 말할 수 없다 — 실제로 한 번
       빠뜨려서 실측에서 undefined가 나왔다(결함 생성기 ②). */
    redEye: trip.redEye || null,
    leadDays,
  };
}

/* ═══ L7 — 일정표 읽기 (SS) ════════════════════════════════════════════════
   왜 만드나 — 회의록이 정한 **본 미션은 트랙 B**다. PM이 시간을 쓰는 곳은 금액 산정이
   아니라 **일정표 작성**이고, 견적서 PDF에는 그 일정표가 이미 DAY별로 다 들어 있다.
   지금까지는 사람이 📅 날짜별 일정에 손으로 옮겨 적었다.

   ⚠ **금액 쪽과 완전히 분리된 층이다.** 여기서 무엇을 읽든 고객이 보는 금액은 1원도
   안 바뀐다. 단가 줄(L2)은 이 함수를 쓰지 않는다.

   실측(코퍼스 46건)에서 양식은 넷이었는데 **기하학은 하나**였다. 열이 있다:

     일자      지역    교통     시간   행 사 내 용                    식사
     제1일    샌프란시스 KE0023  16:00  인천공항 2터미널 출발          석: 기내식
     1일차    도야     전용차량  전일   호텔 조식 후 …                조: 호텔식
     제 01일                          인천국제공항 … 집결            중: 기내식
     4/4(토)                          대한항공 KE969편 인천 출발

   그래서 L1의 좌표를 그대로 쓴다. 하는 일은 셋뿐이다:
     ① **일자 열을 찾는다** — 「제N일」·「N일차」·「DAY N」이 같은 x에 세로로 늘어선 곳.
     ② **내용 열·식사 열을 찾는다** — 문서의 표 머리글(「행사내용」·「식사」)이 있으면
        그 x를 쓰고, 없으면 글자가 가장 많이 쌓인 열을 내용 열로 본다.
     ③ 일자 사이의 줄을 그 날에 담는다.

   ⚠ **단가표에도 「2일차 중식」 같은 줄이 있다**(후아힌·싱가포르·북해도 전부). 일자
     표기만 보면 단가표를 일정표로 착각한다. 그래서 **열 단위로 후보를 세우고 금액이
     붙은 열을 떨어뜨린다** — 단가표의 일자 열과 일정표의 일자 열은 x가 다르다
     (북해도: 일정표 147 / 단가표 97).
   ⚠ **오전·오후·저녁으로 나누는 것은 문서가 나눠 줄 때만 한다.** 문서에 시각도 끼니
     구분도 없으면 나누지 않고 줄 목록을 그대로 넘긴다(`split:'none'`). 이 저장소의
     원칙 그대로 — **빈칸이 틀린 값보다 낫다.** 담당자가 끌어다 놓는 편이 낫지,
     코드가 하루를 셋으로 지어내면 그게 '실측 일정'으로 굳는다. */

/* 일자 표기 — 첫 칸에서만 본다. 문장 한가운데의 「4일차 오후에 방문합니다」를 일자로
   잡으면 안내문이 일정표가 된다(제주개발공사 건에서 실제로 그렇게 걸렸다). */
const DAY_MARK_RE = /^(?:제\s*0?(\d{1,2})\s*일(?:\s*차)?|0?(\d{1,2})\s*일\s*차|DAY\s*0?(\d{1,2})|D\s*0?(\d{1,2}))(?:\s|$)/i;
/* 일자 칸 바로 아래에 붙는 날짜 — 「4/4(토)」·「(12/3)」·「1/19(월)」 */
const DAY_DATE_RE = /^\(?\s*(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*\)?\s*(?:\(\s*[월화수목금토일]\s*\))?\s*\)?$/;
/* 식사 열 — 「조 : 호텔식」·「석: 기내식」 */
const MEAL_CELL_RE = /^([조중석])\s*[:：]\s*(.*)$/;
/* 표 머리글 — 있으면 열 x를 문서가 직접 알려 주는 셈이다 */
const ITIN_HEAD_CONTENT_RE = /^(?:행\s*사\s*내\s*용|일\s*정|행\s*사|내\s*용|세부\s*일정)$/;
const ITIN_HEAD_MEAL_RE = /^식\s*사$/;
const ITIN_HEAD_DAY_RE = /^(?:일\s*자|구\s*분|날\s*짜)$/;
/* 호텔 줄 */
const ITIN_HOTEL_RE = /HOTEL|호\s*텔\s*[:：]|예정\s*호텔|숙\s*박\s*[:：]/i;
/* 하루를 가르는 끼니 — 내용 열 **안에** 나오는 것만 본다(식사 열의 「중: 현지식」은
   그날의 식사 계획이지 순서가 아니다).
   ⚠ **줄의 맨 앞에 있을 때만** 구분선으로 본다. 문장 한가운데의 끼니는 그 시각을
     가리키지 않는다 — 「선택1) 전일 관광 + 석식(삼겹살 특식)」은 **그 선택지의 제목**이고
     「가이드 미팅 후 석식당 이동」은 식당 이름이다. 처음에 아무 데나 걸리게 했더니
     체코 2일차·4일차가 통째로 '저녁'이 됐다(하루의 90%가 저녁으로 밀렸다). */
const LEAD_SYM_RE = /^[\s*·♣□▣★#\-–—'"○●◆◇▶>[\](){}]+/;
const MEAL_PM_RE = /^(?:중\s*식|점\s*심)/;
const MEAL_EVE_RE = /^(?:석\s*식|만\s*찬|디\s*너|저\s*녁\s*식사)/;
/* 시각 — 「[17:05]」·「(08:00)」처럼 괄호에 싸여 나오는 것이 흔하다. 처음에 공백만
   허용했다가 그런 줄을 통째로 놓쳐 하루가 안 나뉘었다. */
const TIME_TOK_RE = /(?:^|[\s[(（])([01]?\d|2[0-3])\s*[:：]\s*[0-5]\d/;
/* 선택일정 — 하루에 대안이 여럿이면 **줄로 세울 수 없다**(같은 시간대가 여러 벌이다) */
const OPTION_RE = /^선\s*택\s*\d\s*\)/;
const X_TOL = 6;          /* 같은 열로 볼 x 오차 — 표 열 간격(실측 20pt+)보다 훨씬 좁다 */
const MIN_ITIN_DAYS = 2;  /* 하루짜리는 일정표로 보지 않는다 */

/* 금액이 붙은 줄인가 — 단가표의 일자 열을 떨어뜨리는 데 쓴다.
   ⚠ 시각(7:10)·항공편(KE0023)·인원(33)은 금액이 아니다. 통화 기호나 천단위 쉼표가
     붙은 큰 수만 금액으로 본다. */
function looksPriced(text) {
  if (/[¥₩$€£]|USD|JPY|EUR|VND/i.test(text)) return true;
  const big = String(text).match(/\d{1,3}(?:,\d{3})+/g);
  return !!(big && big.some((s) => Number(s.replace(/,/g, '')) >= ROW_MIN_TOTAL));
}

/* ① 일자 열 고르기 — 후보를 x로 묶고, 가장 일정표다운 무리를 고른다. */
function pickDayColumn(lines) {
  const marks = [];
  lines.forEach((ln) => {
    /* ⚠ 일자 표기가 **첫 칸이 아닌** 양식이 있다 — 바르셀로나는 「04/04/Fri │ 1일차 │ …」로
       날짜가 먼저 오고, 「2 일차」처럼 한 칸이 둘로 쪼개져 나오기도 한다. 그래서 앞의
       세 칸까지 보고, 이웃한 두 칸을 붙인 것도 함께 본다. 자리(x)는 표기가 시작된 칸의 것이다.
       ⚠ 그래도 **줄 한가운데**는 보지 않는다 — 「…4일차 오후에 방문합니다」 같은 안내문이
       일정표로 둔갑한다(제주개발공사 건에서 실제로 그렇게 걸렸다). */
    for (let i = 0; i < Math.min(3, ln.cells.length); i++) {
      const c = ln.cells[i]; if (!c) break;
      const solo = String(c.s).trim();
      const pair = ln.cells[i + 1] ? (solo + String(ln.cells[i + 1].s).trim()) : '';
      const m = solo.match(DAY_MARK_RE) || (pair ? pair.match(DAY_MARK_RE) : null);
      if (!m) continue;
      const n = Number(m[1] || m[2] || m[3] || m[4]);
      if (!n || n < 1 || n > 40) continue;
      marks.push({ line: ln, x: c.x, day: n, priced: looksPriced(ln.text) });
      break;
    }
  });
  if (!marks.length) return null;

  /* ⚠ **금액이 붙은 일자 줄은 단가표다.** 묶기 **전에** 떨어뜨린다.
     처음엔 묶은 뒤 비율로 감점했는데, 세부 건에서 일정표 일자 열(x=121)과 단가표
     일자 열(x=118)이 **3pt밖에 안 떨어져** 한 열로 묶여 버렸다. 그러면 어떤 점수를
     매겨도 둘을 못 가른다 — 묶이기 전에 갈라야 한다. */
  const clean = marks.filter((m) => !m.priced);
  const usable = clean.length >= MIN_ITIN_DAYS ? clean : marks;
  const droppedPriced = marks.length - usable.length;

  /* x로 묶는다 */
  const cols = [];
  usable.slice().sort((a, b) => a.x - b.x).forEach((mk) => {
    const col = cols.find((c) => Math.abs(c.x - mk.x) <= X_TOL);
    if (col) { col.marks.push(mk); col.x = (col.x * (col.marks.length - 1) + mk.x) / col.marks.length; }
    else cols.push({ x: mk.x, marks: [mk] });
  });
  /* ⚠ **문서 순서로 되돌린다.** x로 정렬해 묶었기 때문에 이 상태의 marks는 줄 순서가
     아니다. 그대로 두면 KT CES가 10,11,12,13,1,…,9로 읽히고 「날이 되돌아가면 끊는다」가
     엉뚱한 자리에서 끊는다. */
  cols.forEach((c) => c.marks.sort((a, b) => a.line.idx - b.line.idx));

  const scored = cols.map((c) => {
    const days = c.marks.map((m) => m.day);
    const distinct = new Set(days).size;
    const score = distinct * 10 - c.x / 100;   /* 같은 조건이면 왼쪽 열 — 표의 첫 열이 일자다 */
    return { x: c.x, marks: c.marks, distinct, droppedPriced, hasFirst: days.includes(1), score };
  }).filter((c) => c.hasFirst)                 /* 일정표는 반드시 1일차에서 시작한다 */
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.distinct < MIN_ITIN_DAYS) return null;
  return best;
}

/* ② 내용 열·식사 열 찾기.
   ⚠ **표 머리글의 x는 열의 왼쪽 끝이 아니다 — 가운데다.** 처음에 머리글 x를 그대로
     썼다가 통째로 헛짚었다(굿리치 체코: 머리글 「일 정」 x=260인데 실제 내용은 x=122,
     머리글 「식사」 x=477인데 실제 식사 칸은 x=466). 머리글은 가운데 정렬이고 내용은
     왼쪽 정렬이라 **문서마다 어긋나는 방향과 크기가 다르다.** 그래서 머리글은
     **어떤 열이 있는지**를 알려 주는 데만 쓰고, **자리는 데이터에서 잡는다.** */
function itineraryColumns(lines, dayCol) {
  const firstIdx = dayCol.marks[0].line.idx;
  let via = 'guess'; let headerSaysMeal = false;

  /* 머리글은 첫 일자 줄 **바로 위** 몇 줄 안에 있다 */
  for (let i = Math.max(0, firstIdx - 6); i < firstIdx; i++) {
    const ln = lines[i]; if (!ln) continue;
    const flat = (c) => String(c.s).trim().replace(/\s+/g, ' ');
    const cx = ln.cells.some((c) => ITIN_HEAD_CONTENT_RE.test(flat(c)));
    const mx = ln.cells.some((c) => ITIN_HEAD_MEAL_RE.test(flat(c)));
    const dx = ln.cells.some((c) => ITIN_HEAD_DAY_RE.test(flat(c)));
    if (cx && (dx || mx)) { via = 'header'; headerSaysMeal = mx; break; }
  }

  const span = itinerarySpan(lines, dayCol);

  /* 식사 열 — 「조:」꼴 칸이 세로로 늘어선 자리. 그 **왼쪽 끝**부터 오른쪽 전부가
     식사 구역이다(식사 칸은 「조:」와 「호텔식」이 다른 칸으로 쪼개져 나온다). */
  let mealX = null;
  const tally = {};
  span.forEach((ln) => ln.cells.forEach((c) => {
    if (!MEAL_CELL_RE.test(String(c.s).trim())) return;
    if (c.x <= dayCol.x + X_TOL) return;
    const k = Object.keys(tally).find((x) => Math.abs(Number(x) - c.x) <= X_TOL) || String(c.x);
    tally[k] = (tally[k] || 0) + 1;
  }));
  const bestMeal = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || Number(b) - Number(a))[0];
  if (bestMeal && tally[bestMeal] >= 2) mealX = Number(bestMeal);
  /* 머리글이 식사 열이 있다고 했는데 못 찾았으면 그 사실을 남긴다(조용히 넘어가지 않는다) */
  const mealMissing = headerSaysMeal && mealX === null;

  /* 내용 열 — 글자가 가장 많이 쌓인 x. 일자 열 오른쪽, 식사 구역 왼쪽에서만 센다. */
  const chars = {};
  span.forEach((ln) => ln.cells.forEach((c) => {
    const t = String(c.s).trim();
    if (!t || c.x <= dayCol.x + X_TOL) return;
    if (mealX !== null && c.x >= mealX - X_TOL) return;
    const k = Object.keys(chars).find((x) => Math.abs(Number(x) - c.x) <= X_TOL) || String(c.x);
    chars[k] = (chars[k] || 0) + t.length;
  }));
  const bestContent = Object.keys(chars).sort((a, b) => chars[b] - chars[a])[0];
  const contentX = bestContent === undefined ? null : Number(bestContent);

  return { contentX, mealX, via, mealMissing };
}

/* 일정표가 차지하는 줄 범위 — 첫 일자 줄부터, 마지막 일자 다음의 몇 줄까지.
   ⚠ 끝을 안 자르면 뒤따르는 단가표가 마지막 날에 통째로 딸려 들어간다. */
function itinerarySpan(lines, dayCol) {
  const first = dayCol.marks[0].line.idx;
  const last = dayCol.marks[dayCol.marks.length - 1].line.idx;
  const out = [];
  for (let i = first; i < lines.length; i++) {
    const ln = lines[i];
    if (i > last) {
      /* 마지막 날 뒤로는 **금액이 나오거나 다른 열로 넘어가면** 거기서 끝난다 */
      if (looksPriced(ln.text)) break;
      if (i - last > 12) break;
    }
    out.push(ln);
  }
  return out;
}

/* ③ 하루를 오전·오후·저녁으로 — **문서가 나눠 줄 때만** 한다.
   시각이 있으면 시각으로, 없고 끼니 구분이 있으면 끼니로, 둘 다 없으면 나누지 않는다. */
function splitDayParts(rows) {
  const texts = rows.map((r) => r.text);
  const empty = { am: [], pm: [], eve: [] };
  const head = (t) => String(t).replace(LEAD_SYM_RE, '');

  /* ⚠ 선택일정이 둘 이상인 날은 **나누지 않는다.** 같은 오전이 선택지 수만큼 있어서
     한 줄로 세우면 어느 선택지의 오전인지 알 수 없다. 담당자가 하나를 고르는 게 맞다. */
  if (texts.filter((t) => OPTION_RE.test(head(t))).length >= 2) {
    return { parts: empty, split: 'none', why: 'options' };
  }

  if (texts.some((t) => TIME_TOK_RE.test(t))) {
    const parts = { am: [], pm: [], eve: [] };
    let slot = 'am';
    texts.forEach((t) => {
      const m = t.match(TIME_TOK_RE);
      if (m) { const h = Number(m[1]); slot = h < 12 ? 'am' : (h < 17 ? 'pm' : 'eve'); }
      parts[slot].push(t);
    });
    return { parts, split: 'time', why: null };
  }

  if (texts.some((t) => MEAL_PM_RE.test(head(t)) || MEAL_EVE_RE.test(head(t)))) {
    const parts = { am: [], pm: [], eve: [] };
    let slot = 'am';
    texts.forEach((t) => {
      const h = head(t);
      /* 구분선이 되는 끼니 줄은 **그 칸의 첫 줄**이 된다(그 끼니부터 다음 시간대다).
         ⚠ 시간대는 되돌아가지 않는다 — 저녁 뒤의 「중식」은 다음 선택지의 것이다. */
      if (MEAL_EVE_RE.test(h)) slot = 'eve';
      else if (MEAL_PM_RE.test(h) && slot === 'am') slot = 'pm';
      parts[slot].push(t);
    });
    return { parts, split: 'meal', why: null };
  }

  return { parts: empty, split: 'none', why: 'no-marker' };
}

/* ── TF: 이 견적서가 **한 도시 견적인가** ─────────────────────────────────────
   실측 사고(2026-08-11, `actual_price_reports` id 17 — `KT CES참관.pdf`): 샌프란시스코 →
   라스베가스 → LA → **칸쿤(멕시코)** 9일 일정이 목적지 「샌프란시스코」 실측 한 줄로
   들어갔다. 저장된 호텔 단가는 칸쿤 리조트(770,000)였고, 차량은 「CUN 버스」,
   가이드는 「LAX 한국인 가이드」였다. 샌프란시스코 표본이 그 하나뿐이라 **그 행이 곧
   그 목적지의 실측**이 됐다.
   ⚠ **기존 안전망은 이걸 못 잡는다.** 타당성 검토(SO)는 기준가의 3배를 넘어야 말하는데,
     샌프란시스코는 원래 비싼 목적지라 칸쿤 호텔이 2.08배에 그쳤다. 「검산 안 됨」도
     아니었다(단가×박수×실수가 멀쩡히 맞는 줄이다). 값이 이상한 게 아니라 **다른 도시
     것**이라, 금액만 보는 자는 영영 못 잡는다.

   왜 하필 「묵는 곳 수」인가 — 46건 코퍼스에 다른 후보를 전부 재 봤고 전부 떨어졌다:
     · 같은 항목에 라벨이 여럿  → 44건 중 **37건**이 걸린다(기사팁·가이드 숙박·주중/주말
       객실이 전부 정상이다). 쓸 수 없다.
     · 본문에서 아는 목적지 이름 세기 → 46건 중 **31건**이 걸리고, 정작 KT CES는 **0곳**이다
       (칸쿤·라스베가스가 요율표에 없다). 잡아야 할 것만 못 잡는다.
     · 묵는 곳 수 → 일정표가 있는 41건 중 **2곳 이상 10건 / 3곳 이상 2건**(KT CES 7곳,
       큐슈 3곳)이다. 큐슈도 4일에 세 도시라 확인할 값어치가 있다.
   ⚠ **막지 않는다. 세기만 한다.** 국내 지방 이동처럼 한 요율로 덮는 게 맞는 일정도 있다 —
     한 도시 견적이 맞는지는 문서를 손에 든 사람만 안다(SW와 같은 원칙).
   ⚠ 문턱(3곳)은 **여기 한 곳에만** 적는다. 화면이 다시 세면 감사기와 어긋난다(결함 생성기 ①). */
const MULTI_CITY_STAYS = 3;
/* 같은 호텔이 표기 차이로 갈리면 문턱이 흔들린다 — 실측: 「베스트 웨스턴 프리미어…」와
   「베스트웨스턴 프리미어…」가 두 곳으로 세어졌다(신한금융플러스 푸꾸옥). 머리말
   (「HOTEL :」·「예정 호텔 :」)과 꼬리말(「| 2인 1실」·「또는 동급」)을 떼고 공백을 지운다. */
function stayKey(s) {
  return String(s || '')
    .replace(/^[^:：]*[:：]/, '')
    .split(/[|[(]/)[0]
    .replace(/또는\s*동급.*$/, '')
    .replace(/[\s·,.\-]/g, '')
    .toLowerCase();
}
function distinctStays(days) {
  const seen = new Map();
  (days || []).forEach((d) => {
    const k = stayKey(d.hotel);
    if (!k || seen.has(k)) return;
    /* 보여줄 때는 **문서에 적힌 그대로**를 쓴다 — 정규화한 글자를 화면에 내보내면
       담당자가 견적서에서 그 줄을 찾을 수 없다. 머리말과 「또는 동급」꼬리만 뗀다
       (모든 줄에 똑같이 붙어 있어 이름을 가린다). */
    seen.set(k, String(d.hotel)
      .replace(/^[^:：]*[:：]\s*/, '')
      .replace(/\s*또는\s*동급.*$/, '')
      .trim());
  });
  return Array.from(seen.values());
}

function findItinerary(lines) {
  const dayCol = pickDayColumn(lines);
  if (!dayCol) return null;
  const { contentX, mealX, via, mealMissing } = itineraryColumns(lines, dayCol);
  if (contentX === null) return null;

  const span = itinerarySpan(lines, dayCol);
  const spanSet = new Set(span.map((l) => l.idx));
  let marks = dayCol.marks.filter((m) => spanSet.has(m.line.idx));

  /* ⚠ **같은 일정표가 두 번 실린 문서가 있다**(한화 다낭 — 견적 2벌이라 일정표도 2벌).
     날 번호가 되돌아가면 거기서 끊는다. 뒤엣것을 버리지 않고 `repeated`로 알린다 —
     둘이 다를 수 있고, 어느 쪽이 맞는지는 사람만 안다(L1.5와 같은 원칙). */
  let repeated = false;
  for (let i = 1; i < marks.length; i++) {
    if (marks[i].day <= marks[i - 1].day) { marks = marks.slice(0, i); repeated = true; break; }
  }
  if (marks.length < MIN_ITIN_DAYS) return null;

  /* 줄을 세 구역으로 가른다 — 일자 구역 / 내용 구역 / 식사 구역.
     경계는 전부 **문서에서 잡은 x**다(내용 열 왼쪽 끝, 식사 칸 왼쪽 끝). */
  const zoneOf = (c) => {
    if (mealX !== null && c.x >= mealX - X_TOL) return 'meal';
    if (c.x < contentX - X_TOL) return 'day';
    return 'content';
  };

  const days = [];
  marks.forEach((mk, i) => {
    const from = mk.line.idx;
    const to = i + 1 < marks.length ? marks[i + 1].line.idx : (span[span.length - 1].idx + 1);
    const meals = {}; let date = null; let hotel = null;
    const places = []; const byLine = [];

    for (let j = from; j < to; j++) {
      const ln = lines[j]; if (!ln || !spanSet.has(j)) continue;
      const zones = { day: [], content: [], meal: [] };
      ln.cells.forEach((c) => {
        const t = String(c.s).trim(); if (!t) return;
        zones[zoneOf(c)].push(t);
      });

      /* 식사 — 「조:」와 「호텔식」이 **다른 칸으로 쪼개져** 나오므로 구역을 통째로 잇는다 */
      const mealText = zones.meal.join(' ').replace(/\s+/g, ' ').trim();
      const mm = mealText.match(MEAL_CELL_RE);
      if (mm && mm[2].trim()) {
        const k = { '조': 'b', '중': 'l', '석': 'd' }[mm[1]];
        if (!meals[k]) meals[k] = mm[2].trim();
      }

      /* 일자 구역 — 날짜·지역·교통, 그리고 **시각 열**이 여기 있다.
         ⚠ 시각이 내용과 **다른 열**인 양식이 많다(머리글이 「일자 지역 교통편 시간 일정」).
           처음에 이 구역을 통째로 버렸더니 KT CES 13일이 **한 날도 안 나뉘었다** —
           시각이 문서에 멀쩡히 있는데 우리가 안 읽은 것이었다. 시각은 내용 앞에 붙인다. */
      let time = null;
      zones.day.forEach((t) => {
        const dm = t.match(DAY_DATE_RE);
        if (dm) { if (!date) date = `${Number(dm[1])}/${Number(dm[2])}`; return; }
        if (DAY_MARK_RE.test(t)) return;
        if (!time && TIME_TOK_RE.test(t) && t.length <= 8) { time = t; return; }
        if (t.length <= 12 && !places.includes(t)) places.push(t);
      });

      const body = zones.content.join(' ').replace(/\s+/g, ' ').trim();
      const text = (time && body) ? (time + ' ' + body) : body;
      if (text) byLine.push({ idx: j, text });
    }

    const hotelRow = byLine.find((r) => ITIN_HOTEL_RE.test(r.text));
    if (hotelRow) hotel = hotelRow.text.replace(/^[^0-9A-Za-z가-힣]*/, '').trim();

    const { parts, split, why } = splitDayParts(byLine);
    days.push({
      day: mk.day, date, hotel,
      /* 지역·교통 열(「도야」·「전용차량」) — 있으면 그대로, 지어내지 않는다 */
      place: places.length ? places.join(' · ') : null,
      meals: { b: meals.b || null, l: meals.l || null, d: meals.d || null },
      lines: byLine.map((r) => r.text),
      am: parts.am.join(' / ') || null,
      pm: parts.pm.join(' / ') || null,
      eve: parts.eve.join(' / ') || null,
      /* 'time'·'meal' = 문서가 나눠 줬다 · 'none' = 안 나눴다(why가 이유를 말한다:
         'options' 선택일정이 여럿 · 'no-marker' 시각도 끼니 구분도 없다) */
      split, splitWhy: why,
    });
  });

  const withText = days.filter((d) => d.lines.length);
  if (withText.length < MIN_ITIN_DAYS) return null;

  const stays = distinctStays(days);

  return {
    days,
    repeated,
    /* 어떻게 열을 찾았는지 — 화면이 근거를 말할 수 있어야 한다(조용한 폴백 금지) */
    columnsVia: via,
    /* 머리글은 식사 열이 있다고 했는데 「조:」꼴 칸을 못 찾았다 — 조용히 빈칸으로
       두지 않고 알린다(결함 생성기 ② — 폴백이 조용하면 아무도 못 본다) */
    mealMissing: !!mealMissing,
    dayX: Math.round(dayCol.x), contentX: Math.round(contentX),
    mealX: mealX === null ? null : Math.round(mealX),
    /* 문서가 시간대를 나눠 주지 않은 날이 몇 개인가 — 담당자가 손볼 양이다 */
    unsplitDays: days.filter((d) => d.split === 'none').length,
    /* TF: 며칠씩 **어디에서 묵는가**. 3곳 이상이면 한 목적지 요율의 근거로 삼기 전에
       사람이 확인해야 한다(위 MULTI_CITY_STAYS 주석 참고). 판정은 여기서 끝낸다 —
       화면이 다시 세지 않게 `multiCity`까지 함께 준다. */
    stays,
    multiCity: stays.length >= MULTI_CITY_STAYS,
  };
}

/* ═══ L0 — 문서 종류 판별 ═══════════════════════════════════════════════════
   46건 중 16건은 **단가표가 아예 없다**(요약 견적·일정표). 어떤 파서로도 못 뽑는다.
   지금까지는 그걸 "추출 실패"로만 보여줘서 전부 오류로 보였다. 종류를 갈라
   화면이 "이 문서엔 단가표가 없습니다"라고 말하게 한다 — 담당자가 할 일이 달라진다. */
function triage(lines, rows, classified) {
  const text = lines.map((l) => l.text).join('\n');
  const hasUnitHeader = /단\s*가/.test(text) && /(수량|인원)/.test(text) && /(총\s*금액|금액)/.test(text);
  const namedRows = classified.filter((r) => r.category).length;

  if (rows.length >= 8 && namedRows >= 4) return { kind: 'detail', label: '세부 내역서 — 단가표가 있습니다' };
  if (rows.length >= 3) return { kind: 'partial', label: '단가 줄이 일부만 잡혔습니다' };
  if (hasUnitHeader) return { kind: 'unreadable_table', label: '단가표는 있는데 줄을 잡지 못했습니다' };
  return { kind: 'summary', label: '이 문서에는 단가표가 없습니다 (총액·일정만 있는 견적서)' };
}

/* ═══ 항목별로 값을 고른다 ══════════════════════════════════════════════════
   L3가 분류한 줄들 중에서 **무엇을 대표값으로 삼을지**를 정한다.
   기준은 항목마다 다르고, 그 이유를 각각 적어 둔다 — 나중에 바꿀 때 근거가 필요하다. */
/* ⚠ 환산하지 못한 외화 줄은 값 후보에서 뺀다 — 원화인 척 들어가면 10배 틀린다.
   화면의 후보 목록에는 남으므로 담당자가 보고 직접 넣을 수는 있다. */
/* ⚠ 좌우로 나란한 다른 표의 줄은 **자동 선택에서 뺀다**(SL) — 다른 조의 값이라
   1인당 계산이 어긋난다. 후보 목록에는 그대로 남아 담당자가 고를 수 있다. */
const usable = (r) => !r.unconvertible && !r.otherTable;

/* 부수 비용 줄 — 그 묶음에 딸린 잔비용이지 그 항목의 단가가 아니다.
   ⚠ **'팁'·'경비'·'일비'를 넣지 말 것.** 본 단가 줄 이름에도 그대로 붙는다 —
   「가이드 인건비 &팁」·「기사일비/팁」·「인솔/가이드 공동경비」가 전부 진짜 대표 줄이다.
   넣어 봤더니 고친 것 1건에 **없애 버린 것 4건**이었다(실측). 식대 계열만 남긴다. */
const INCIDENTAL_RE = /식대|식사|간식|통신비/;
const notIncidental = (r) => !INCIDENTAL_RE.test(String(r.label || ''));

function pickBy(rows, category, how, prefer) {
  const list = rows.filter((r) => r.category === category && usable(r));
  if (!list.length) return null;
  /* 거름망이 있으면 먼저 그것으로 고른다. 다 걸러지면 **비운다** —
     남은 것이 부수 줄뿐인데 그것을 단가로 내보내면 틀린 값이 '실측'으로 굳는다. */
  if (prefer) { const kept = list.filter(prefer); return kept.length ? how(kept) : null; }
  return how(list);
}

const byMaxQty = (list) => list.slice().sort((a, b) => headCount(b) - headCount(a) || b.unit - a.unit)[0];
const byMaxTotal = (list) => list.slice().sort((a, b) => b.total - a.total)[0];
const byMaxUnit = (list) => list.slice().sort((a, b) => b.unit - a.unit)[0];

/* 식사는 하루치다 (RO). 견적서는 끼니마다 줄이 따로라 **그냥 더하면 전 일정 합**이 된다.
   ⚠ 실제로 그래서 한화 건이 343,650원(4일치 전부)으로 나왔다 — 요율은 1인 1일이라 4배다.
   그래서 총 식대를 인원과 **식사 일수**로 나눈다. 일수는 라벨의 'N일'에서 세고,
   없으면 호텔 박수+1, 그것도 없으면 나누지 않는다(나눌 근거가 없으면 나누지 않는다). */
/* 1인당 항목을 모을 때 쓰는 거름망 (RZ).
   ⚠ 견적서 뒤쪽 '현장추가' 구간에는 `585,441 × 1 × 1`처럼 **일괄 금액**이 한 줄로 들어온다.
   1인당 단가가 아니라 그 자리에서 쓴 총액이다. 이걸 1인당 항목에 넣으면 식비가 몇 배로
   부푼다(한화 건에서 실제로 그랬다). **수량이 2 이상**인 줄 = 사람 수만큼 곱한 줄만 센다. */
/* ⚠ 수량 열과 횟수 열의 **순서가 양식마다 다르다.** 실측:
     하나투어  「단가 | 수량/인원 | 횟수/박수 | 총금액」  → 26 × 3
     EnBT·굿리치「비용 | 박수/횟수 | 인원/수량 | 합계」  → 1 × 46   (인원이 뒤!)
   산술 검산은 어느 쪽이 어느 열인지 모른다(곱셈은 순서를 안 가린다). 그래서
   '사람 수만큼 곱해진 줄인가'는 **둘 중 큰 쪽**으로 판단한다. */
const PER_HEAD_MIN_QTY = 2;
const MAX_NIGHTS = 30;   /* 기업연수 일정의 상한 — 이보다 크면 박수 열이 아니다 */
const headCount = (r) => Math.max(r.qty, r.times);
const perHeadRows = (rows, category) =>
  rows.filter((r) => r.category === category && usable(r) && headCount(r) >= PER_HEAD_MIN_QTY);

/* ═══ L3.7 — 조 편성 (TJ) ═══════════════════════════════════════════════════
   기업연수 견적서는 **한 행사 안에서 일행이 조로 갈린다.** 낮에 관광을 도는 조와
   골프를 치는 조가 따로 움직이고, 견적서는 그 사실을 비고에 그대로 적어 둔다.
   실측(코퍼스 46건 중 9건에 흔적, 조 표기가 있는 것은 5건):

     한화 뉴퍼스트/다낭  「2일 조식(클럽식) 29,000 × 23  **골프조만**」
                         「바나힐 50,750 × 3           **관광조 3명 기준**」
     신한/발리           「중식 자유식 $20 × 55  **관광조**」 / 「클럽중식 $20 × 25 **골프조**」
     글로벌/카자흐스탄   「관광지 케이블카·박물관 $99 × 5  **Only 관광조**」
     글로벌/오키나와     좌우로 나란한 두 표 — 왼쪽 관광조 48명 · 오른쪽 골프조 20명(SL이 가른다)

   왜 고쳐야 하나 — **식비·관광비만 1인당으로 나눈다.** 그런데 분모가 언제나 전체
   인원이라, 한 조만의 비용을 전원으로 나눠 버린다:

     카자흐스탄 관광비  722,700 ÷ **32명**(전원) = 22,584
                        722,700 ÷  **5명**(관광조) = 144,540   ← 실제로 관광을 한 사람 기준

   6배 넘게 어긋난다. 그리고 그 값이 그 목적지의 실측 중앙값이 되어 요율 갱신 제안을
   타고 **고객 견적까지 간다.** 방향이 한쪽으로만 틀리지도 않는다 — 골프조 전용 식사가
   전원으로 나눠지면 식비는 반대로 낮아진다.

   그래서 1인당 항목의 분모를 **그 줄이 실제로 대상으로 한 사람 수**로 바꾼다:
     · 조 표시가 없는 줄  → 전체 인원 (전원이 함께 쓴 비용)
     · 관광조 전용 줄     → 관광조 인원
     · 골프조 전용 줄     → **요율에서 뺀다** (요율표는 일반 연수 기준이다)
   합치면 「관광조에 속한 한 사람의 1인당 비용」이 되고, 그것이 요율표가 뜻하는 값이다.

   ⚠ **단가 항목(항공·호텔·차량·가이드)에는 조를 적용하지 않는다.** 그건 1인당이 아니라
     '좌석 1석·객실 1박·대당 1일' 단가라 어느 조가 탔든 그 지역 단가다. 실측(카자흐스탄):
     골프조 대형버스 $364 / 관광조 밴 $120인데, 골프조를 빼면 **밴이 대형버스 단가**가 된다.
     요율의 `vehicle_large`는 대형버스 단가이므로 그쪽이 오히려 틀린다.
     → **나누는 항목에만 적용한다.** 이 경계를 넓히지 말 것.

   ⚠ **조건문을 조 표시로 착각하지 말 것.** 실측(한화/다낭): 기사 경비 줄의 비고가
     「**(미포함)관광조 추가시 인원 추가**」다. 이건 "관광조를 추가하면"이라는 가정이지
     그 줄이 관광조 전용이라는 뜻이 아니다. 그 줄을 관광조로 붙이면 3명짜리 분모가
     엉뚱한 줄에 걸린다. 그래서 가정·미포함 어구가 있으면 표시로 읽지 않는다.

   ⚠ **표시가 없는 문서를 조로 나누지 않는다.** 46건 중 41건은 조 표기가 아예 없다.
     「골프」라는 낱말이 있다고 조가 갈린 것이 아니다(전원이 골프를 치는 행사가 있다 —
     고은회 제주도는 21명 전원이 라운딩한다). **문서가 말할 때만 나눈다.** */

/* 조 표시를 읽는 자리는 라벨과 비고다. 줄 전체(line)를 보면 옆 표에서 흘러든 글자에
   걸린다(SB의 줄 병합 오염 — 실제로 오키나와 바모스가 그 모양이다). */
const CREW_GOLF_RE = /골프\s*(조|팀)|골프조만/;
const CREW_TOUR_RE = /관광\s*(조|팀)/;
/* ⚠ 가정·미포함 어구가 붙으면 그 줄의 소속이 아니라 **안내문**이다(위 주석 참고). */
const CREW_HYPOTHETICAL_RE = /추가\s*시|추가시|미포함|불포함|별도\s*문의|선택\s*시/;

function crewOf(r) {
  const s = String(r.label || '') + ' ' + String(r.note || '');
  if (CREW_HYPOTHETICAL_RE.test(s)) return null;
  const golf = CREW_GOLF_RE.test(s);
  const tour = CREW_TOUR_RE.test(s);
  /* 둘 다 적힌 줄은 어느 조 것인지 문서가 말한 게 아니다 — 고르지 않는다 */
  if (golf === tour) return null;
  return golf ? 'golf' : 'tour';
}

/* 이 줄이 **몇 사람을 대상으로 한 것인가.**
   ⚠ **조 인원을 문서 전체에서 하나로 뽑으려다 실패했다** (2026-08-13, 되돌리기 전 실측).
     조 표시가 붙은 줄들의 `headCount` 최댓값을 그 조 인원으로 삼았더니:
       카자흐스탄 「기사 식사 $15 **12** 1 관광조」 → 12를 관광조 인원으로 셌다(12는 **끼니 횟수**)
       카자흐스탄 「차량(대형/**5**일간) $364 5 1 골프조」 → 5를 골프조 인원으로 셌다(5는 **일수**)
     한 조의 인원을 문서가 한 곳에 적어 두지 않는다. 여러 줄에서 모으면 **인원이 아닌 수**가
     반드시 섞인다 — SF에서 「인원을 박수로 센다」로 이미 한 번 당한 자리다.
   → 그래서 **줄마다 그 줄의 수로 나눈다.** 「관광지 $99 × **5**명 = $495」는 그 줄 안에서
     완결되어 있어 다른 줄의 숫자에 오염되지 않는다. 인원 판단 규칙은 이미 있는 것을
     그대로 쓴다(수량·횟수 중 **큰 쪽**이 인원 — RZ 주석).
   ⚠ 전체 인원보다 많으면 그건 인원이 아니다(횟수·박수). 그때는 전체 인원으로 나눈다. */
function rowHeads(r, pax) {
  const n = headCount(r);
  return (n >= PER_HEAD_MIN_QTY && n <= pax) ? n : pax;
}

/* 조가 갈린 문서인가. **인원은 여기서 정하지 않는다**(위 주석) — 화면에 보여줄 용도로만,
   그 조 줄들이 **모두 같은 수**를 말할 때에 한해 인원을 밝힌다. 서로 다르면 밝히지 않는다:
   짐작한 인원을 화면에 적으면 담당자가 그것을 사실로 읽는다. */
function readCrews(rows, pax) {
  const marked = rows.filter((r) => usable(r) && r.crew);
  if (!marked.length) return null;
  const agreedSize = (crew) => {
    const ns = [...new Set(marked.filter((r) => r.crew === crew)
      .map((r) => rowHeads(r, pax)).filter((n) => n < pax))];
    return ns.length === 1 ? ns[0] : 0;   /* 줄마다 다르면 말하지 않는다 */
  };
  const golfRows = marked.filter((r) => r.crew === 'golf');
  const tourRows = marked.filter((r) => r.crew === 'tour');
  return {
    split: true,
    golfSize: agreedSize('golf'), tourSize: agreedSize('tour'),
    golfRows: golfRows.length, tourRows: tourRows.length,
    /* 요율에서 뺀 골프조 전용 금액 — 화면이 「얼마를 왜 뺐는지」 말할 수 있게 */
    golfOnlyCost: golfRows.reduce((n, r) => n + (r.total || 0), 0),
  };
}

/* 1인당 합 — **조 표시가 붙은 줄만** 그 줄의 인원으로 나누고, 나머지는 전체 인원으로 나눈다.
   ⚠ 표시가 없는 줄까지 줄 인원으로 나누면 46건 전부가 움직인다. 문서가 「이 줄은 한 조
     것이다」라고 말한 곳에서만 분모를 바꾼다 — 고칠 자리를 문서가 지목한 것이다. */
function perPersonSum(list, pax, crews) {
  return list.reduce((n, r) => {
    const heads = (crews && r.crew) ? rowHeads(r, pax) : pax;
    return n + (r.total || 0) / (heads || pax);
  }, 0);
}

/* 요율표의 `meal_per_person`은 **여행자 1인 1일 조·중·석식**이다. 그 정의 밖의 줄은
   합에서 뺀다 — 관광비에서 골프를 빼는 것과 같은 이유이고, 같은 방식으로 **얼마를
   뺐는지 화면에 남긴다**(조용히 버리지 않는다).
   ⚠ **인솔진 식사**(가이드·기사·인솔자·스텝)는 여행자 식비가 아니다. 그 사람들 밥값은
      가이드비·기사비 쪽에 속한다. 실측(글로벌 카자흐스탄): 「기사 식사 262,800」과
      「가이드 식사 262,800」이 여행자 식비 합에 들어가 있었다 — 라벨에 '식사'가 있어
      어휘 순서상 meal이 먼저 걸린다.
   ⚠ **끼니가 아닌 것**(음료·주류·간식·다과·룸드랍)도 뺀다. 실측: 다낭 「미케비치 음료」
      (1잔씩 제공) 3,462,500원, 키움 카자흐스탄 「룸드랍」(객실당 라면 2개) 210,000원.
      요율표 식비는 끼니 기준이라, 이런 것이 섞이면 그 목적지 기준이 조용히 올라간다.
   ⚠ **라벨만 본다.** 비고에 「주류/음료 제공」이 적힌 정상 중식 줄이 있다(키움 카자흐스탄) —
      비고까지 보면 그 끼니가 통째로 빠진다. */
const MEAL_STAFF_RE = /가이드|기사|인솔|스텝|스태프|TC/i;
const MEAL_NOT_A_MEAL_RE = /음료|주류|간식|야식|스낵|다과|커피|룸\s*드랍|룸서비스/;

function mealPerDay(rows, pax, trip, crews) {
  const all = perHeadRows(rows, 'meal');
  if (!all.length || !pax) return null;
  const isStaff = (r) => MEAL_STAFF_RE.test(String(r.label || ''));
  const isNotMeal = (r) => MEAL_NOT_A_MEAL_RE.test(String(r.label || ''));
  /* ⚠ **골프조 전용 끼니는 요율의 식비가 아니다**(L3.7). 요율표는 일반 연수 기준이라
     그 조만의 클럽식을 전원으로 나누면 그 목적지 식비가 조용히 낮아진다. */
  const isGolfCrew = (r) => !!(crews && r.crew === 'golf');
  const meals = all.filter((r) => !isStaff(r) && !isNotMeal(r) && !isGolfCrew(r));
  /* 전부 빠지면 **비운다** — 여행자 끼니가 하나도 없는데 인솔진 밥값을 식비라 우기지 않는다 */
  if (!meals.length) return null;
  const staffCost = all.filter(isStaff).reduce((n, r) => n + r.total, 0);
  const notMealCost = all.filter((r) => !isStaff(r) && isNotMeal(r) && !isGolfCrew(r)).reduce((n, r) => n + r.total, 0);
  const golfCrewCost = all.filter(isGolfCrew).reduce((n, r) => n + r.total, 0);
  const totalCost = meals.reduce((n, r) => n + r.total, 0);

  /* ⚠ **일수는 뺀 줄까지 포함해 센다.** 인솔진 식사도 「× 5회」처럼 며칠짜리 일정인지를
     말해 주기 때문이다 — 금액에서 뺐다고 일수 단서까지 버리면 안 된다.
     실측(굿리치 체코): 「기사식사 × 5」·「가이드식사 × 5」를 빼자 남은 줄이 「중식 × 2」뿐이라
     일수가 5 → 2로 떨어졌고, 1인 1일 식비가 80,877 → 193,382(+139%)로 뛰었다.
     **금액과 일수는 다른 문제다.** */
  const days = new Set();
  all.forEach((r) => {
    const m = (r.label + ' ' + r.note).match(/(\d{1,2})\s*일\s*차?/g);
    if (m) m.forEach((t) => days.add(t.replace(/\D/g, '')));
  });
  /* ⚠ **'N일차'가 하나만 나오면 그건 일수가 아니다.** 그 낱말은 특정 끼니를 가리키는
     메모일 뿐이다 — 실측(키움 카자흐스탄): 「스테이크 추가비」의 비고 「3일차 중식 특식」
     하나 때문에 일수를 **1일**로 세어 1인 1일 식비가 372,857원이 됐다(요율표 최대의 5배).
     날짜가 **둘 이상** 나올 때만 "일정이 며칠짜리인지 라벨이 말해 준다"고 볼 수 있다. */
  let dayCount = days.size >= 2 ? days.size : 0;
  let basis = `라벨의 'N일' ${dayCount}개`;
  /* ⚠ **문서가 밝힌 일수가 호텔 줄보다 정확하다.** 호텔 묶음은 한 숙박이 여러 줄로
     쪼개진다 — 「하버그랜드 주중 4박」+「주말 1박」, 「메트로폴리탄(금) 1박」+「(토) 1박」.
     `max(박수)`는 그 경우 실제보다 **적게** 세고, 식비는 그만큼 부푼다(실측: BSI 도쿄가
     2박을 1박으로 세어 1인 1일 식비가 38,978 — 실제 일수로 나누면 25,985다).
     일수는 금액에 거의 정비례하므로 조용히 고르면 안 된다. 그래서 문서 → 호텔 줄 순. */
  if (!dayCount && trip && trip.days >= 2 && trip.days <= 30) {
    dayCount = trip.days;
    basis = `문서의 ${trip.nights ? trip.nights + '박 ' : ''}${trip.days}일`;
  }
  /* **끼니 횟수** — 견적서가 「조식 × 9명 × 8회」처럼 적어 두면 그 8이 곧 일수다.
     ⚠ 수량 열과 횟수 열의 순서가 양식마다 다르므로(RZ 주석 참고) 인원은 **큰 쪽**,
        횟수는 **작은 쪽**이다. 가장 자주 나오는 끼니가 하루 한 번이므로 그 최댓값을 쓴다.
     ⚠ 호텔 줄보다 **먼저** 본다 — 호텔은 한 숙박이 여러 줄로 쪼개져 박수를 적게 세지만,
        끼니 횟수는 그 줄 안에서 완결된다. 실측(KT CES참관): 조·중·석식이 전부 `× 8회`인데
        호텔이 1박짜리 줄 여럿이라 2일로 세어 1인 1일 식비가 630,000원이었다. */
  if (!dayCount) {
    const times = all.map((r) => Math.min(r.qty, r.times)).filter((n) => n >= 2 && n <= MAX_NIGHTS + 1);
    if (times.length) { dayCount = Math.max.apply(null, times); basis = `끼니 ${dayCount}회`; }
  }
  if (!dayCount) {
    const hotel = rows.filter((r) => r.category === 'hotel' && usable(r));
    /* ⚠ **박수는 여행 길이를 넘을 수 없다.** 호텔 줄의 '횟수' 열이 양식에 따라 인원일 때가
       있어(「€380 × 2 × 85」의 85는 사람 수다) 그대로 믿으면 86일로 나눈다 — 실측(굿리치
       체코)에서 1인 1일 식비가 4,702원으로 나왔다. 30박을 넘는 기업연수는 없다. */
    const nights = hotel.length
      ? Math.max.apply(null, [0].concat(hotel.map((r) => r.times).filter((n) => n <= MAX_NIGHTS)))
      : 0;
    if (nights >= 1) { dayCount = nights + 1; basis = `호텔 ${nights}박 + 1`; }
  }
  if (!dayCount) return null;

  /* 줄마다 **그 줄이 대상으로 한 사람 수**로 나눈다(L3.7). 조가 안 갈린 문서에서는
     분모가 전부 pax라 예전의 `총액 ÷ pax`와 값이 정확히 같다. */
  const perPerson = perPersonSum(meals, pax, crews);
  const value = Math.round(perPerson / dayCount);
  /* 분모가 여럿이면 식을 「총액 ÷ 인원」으로 쓸 수 없다 — 있는 그대로 밝힌다.
     화면이 이 식을 그대로 보여주므로, 여기서 얼버무리면 담당자가 검산할 수 없다. */
  const crewSplit = !!(crews && meals.some((r) => r.crew === 'tour'));
  return {
    value,
    rowIdxs: meals.map((r) => r.idx),
    calc: crewSplit
      ? `식사 ${meals.length}줄을 줄마다 그 조 인원으로 나눠 더하면 1인 ${Math.round(perPerson).toLocaleString()}`
        + ` (관광조 ${crews.tourSize || pax}명 · 그 밖은 전원 ${pax}명) ÷ ${dayCount}일 = ${value.toLocaleString()} (1인 1일)`
      : `식사 총액 ${totalCost.toLocaleString()} ÷ 인원 ${pax} ÷ ${dayCount}일 = ${value.toLocaleString()} (1인 1일)`,
    basis,
    dayCount,
    fx: fxOf(meals),   /* 어느 환율로 환산된 합인가 (SG) */
    /* 뺀 것들 — 화면이 「얼마를 왜 뺐는지」 말할 수 있게 (골프비와 같은 방식) */
    staffExcluded: staffCost || 0,
    notMealExcluded: notMealCost || 0,
    golfCrewExcluded: golfCrewCost || 0,
  };
}

/* 관광비는 '1인당 여행 전체 일정의 관광비 묶음'이다(data.js sightseeing_fee 주석).
   그래서 대표 한 줄이 아니라 **관광으로 분류된 총액 ÷ 인원**이다. */
function sightPerPerson(rows, pax, crews) {
  const all = perHeadRows(rows, 'sight');
  if (!all.length || !pax) return null;
  /* ⚠ **골프조 전용 관광 줄은 뺀다**(L3.7) — 요율의 관광비는 일반 연수 기준이다. */
  const list = all.filter((r) => !(crews && r.crew === 'golf'));
  if (!list.length) return null;
  const golfCrewCost = all.filter((r) => crews && r.crew === 'golf').reduce((n, r) => n + r.total, 0);
  const totalCost = list.reduce((n, r) => n + r.total, 0);
  /* 줄마다 그 조 인원으로 나눈다(L3.7). 실측(카자흐스탄): 「Only 관광조」 722,700을
     전원 32명으로 나누면 22,584인데, 실제로 관광을 한 5명으로 나누면 144,540이다. */
  const perPerson = perPersonSum(list, pax, crews);
  const value = Math.round(perPerson);
  const crewSplit = !!(crews && list.some((r) => r.crew === 'tour'));
  /* 뺀 골프비를 함께 돌려준다 — 화면이 "골프 ○○원은 뺐습니다"라고 말할 수 있게. */
  const golf = perHeadRows(rows, 'golf');
  const golfCost = golf.reduce((n, r) => n + r.total, 0);
  return {
    value, rowIdxs: list.map((r) => r.idx),
    calc: crewSplit
      ? `관광 ${list.length}줄을 줄마다 그 조 인원으로 나눠 더하면 1인 ${value.toLocaleString()}`
        + ` (관광조 ${crews.tourSize || pax}명 · 그 밖은 전원 ${pax}명, 1인당 전 일정)`
      : `관광 총액 ${totalCost.toLocaleString()} ÷ 인원 ${pax} = ${value.toLocaleString()} (1인당 전 일정)`,
    golfExcluded: golfCost || 0,
    golfRowIdxs: golf.map((r) => r.idx),
    golfCrewExcluded: golfCrewCost || 0,
    fx: fxOf(list),   /* 어느 환율로 환산된 합인가 (SG) */
  };
}

/* 골프비 — **1인 1회 라운딩** (그린피+카트+캐디피). 요율의 관광비와 자릿수가 달라
   따로 센다(그래서 관광비에서 빼 왔다). 지금까지는 빼기만 하고 **값으로 만들지 않아**
   골프를 파는 목적지의 실측이 통째로 버려지고 있었다.

   ⚠ 분모는 **골프를 친 사람 수**다. 조가 갈렸으면 골프조 인원, 아니면 전체 인원이다
     (고은회 제주도는 21명 전원이 라운딩한다).
   ⚠ 분자는 **라운딩 횟수로 나눈다.** 견적서는 라운딩을 날마다 한 줄씩 적는다
     (제주도 3줄 = 3회, 카자흐스탄 그린피 2곳 + 캐디피 2곳 = 2회). 회차를 안 나누면
     3라운드짜리 행사의 단가가 1회 단가의 3배로 굳는다.
     세는 법은 **그린피·라운딩 줄의 수**다 — 캐디피·카트는 같은 회차에 딸린 비용이라
     따로 세면 회차가 부풀고 단가가 그만큼 낮아진다. */
const GOLF_ROUND_RE = /라운딩|그린피|골프|C\s*\.?\s*C\b|컨트리\s*클럽/i;
const GOLF_ADDON_RE = /캐디|카트|그늘집|팁|인식표|피켓/;
function golfPerRound(rows, pax, crews) {
  const list = perHeadRows(rows, 'golf');
  if (!list.length || !pax) return null;
  /* ⚠ **줄마다 그 줄의 인원으로 나눈다**(rowHeads 주석). 골프는 조 표시가 없어도 전원이
     치지 않는 일이 흔하다 — 「오라 CC 175,000 × **18명**」처럼 그 줄이 직접 말해 준다.
     전체 21명으로 나누면 175,000이 150,000이 되어 그 코스의 그린피가 아니게 된다. */
  const perPerson = list.reduce((n, r) => n + (r.total || 0) / rowHeads(r, pax), 0);
  const totalCost = list.reduce((n, r) => n + r.total, 0);
  /* 회차 = 라운딩 줄의 수. 딸린 비용(캐디·카트·그늘집·팁)은 **회차를 만들지 않는다** —
     같은 회차에 딸린 비용이라 따로 세면 회차가 부풀고 1회 단가가 그만큼 낮아진다. */
  const roundRows = list.filter((r) => {
    const s = String(r.label || '');
    return GOLF_ROUND_RE.test(s) && !GOLF_ADDON_RE.test(s);
  });
  /* ⚠ **라운딩 줄이 하나도 없으면 값을 내지 않는다.** 실측(한화 뉴퍼스트/다낭): 골프로
     분류된 줄이 「캐디팁」·「골프조 인식표」·「빈펄CC 그늘집 등」뿐이고 정작 그린피 줄이
     없다. 그것을 1회로 세면 딸린 비용만 더해 **1인 1회 510,400원**이 나가는데, 그 문서에
     적힌 라운딩 요금이 아니다. 회차를 모르면 나누는 수를 모르는 것이고, 나누는 수를
     모르면 단가를 만들 수 없다 — **빈칸이 틀린 값보다 낫다**(2026-08-10 대표 방침). */
  if (!roundRows.length) return null;
  const rounds = roundRows.length;
  const value = Math.round(perPerson / rounds);
  const heads = [...new Set(list.map((r) => rowHeads(r, pax)))];
  return {
    value, rounds,
    /* 몇 명 기준인지 — 줄마다 다르면 그대로 여럿을 밝힌다(하나로 뭉뚱그리지 않는다) */
    heads: heads.length === 1 ? heads[0] : 0,
    rowIdxs: list.map((r) => r.idx),
    calc: `골프 ${list.length}줄 (총 ${totalCost.toLocaleString()})을 줄마다 그 줄 인원`
      + `(${heads.join('·')}명)으로 나눠 더하면 1인 ${Math.round(perPerson).toLocaleString()}`
      + ` ÷ ${rounds}회 = ${value.toLocaleString()} (1인 1회 라운딩)`,
    fx: fxOf(list),
  };
}

const capped = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null);

/* 근거 한 덩어리. `via`가 **값의 출처**다 — 화면이 이걸로 "확인이 필요한 칸"을 표시한다.
   ⚠ 문구(label)에서 'AI가 고름' 같은 말을 정규식으로 찾아 쓰지 말 것. 문구는 바뀌고
   그러면 표시가 조용히 틀린다. 출처는 값으로 넘긴다.
     rule      견적서의 한 줄을 규칙(어휘 분류)이 그대로 집었다  — 가장 믿을 만하다
     calc      여러 줄을 합쳐 계산했다(식비·관광비)             — 식을 보여줘야 한다
     doc       문서에 그대로 적힌 값(1인당 금액)
     unchecked 검산이 없었던 줄이다(수량·횟수가 둘 다 1)        — 사람이 꼭 봐야 한다
     ai        규칙이 못 채워 AI가 골랐다                       — 사람이 꼭 봐야 한다
     fallback  좌표를 못 읽어 예전 방식으로 물러났다            — 사람이 꼭 봐야 한다 */
/* ⚠ `단가 × 1 × 1`은 검산을 **통과한** 게 아니라 검산이 **없었던** 것이다(SB).
   같은 줄에 검산된 조합이 없어 살아남았을 뿐이므로, 이 값이 1인 단가인지 전 일정
   총액인지 코드는 모른다. 실측(EnBT 싱가포르): 「싱가포르 가이드 1,600 1,840,000」은
   6일치 총액인데 **가이드 1일 단가** 자리에 들어간다(실제 일당의 6배).
   반대로 「항공 320,000 1 1 320,000」은 진짜 1인 운임이다 — 둘이 같은 모양이라
   코드가 가를 수 없다. 그래서 **고르지 않고, 확실한 척도 하지 않는다.** */
/* 이 값이 **어느 환율로 환산된 것인가** (SG).
   ⚠ 이걸 안 남기면 그 원화값은 **견적서 시점 환율이 박힌 채** 실측으로 굳는다.
   요율표 단가는 「오늘 환율 기준」이라는 약속 위에 서 있고(`rate_fx_baseline`), 엔진은
   거기서 `오늘 ÷ 기준`으로 보정한다. 그런데 견적서에서 뽑은 값은 **그 견적서의 환율**이
   박혀 있으므로, 두 환율의 차이만큼 처음부터 어긋난 채 요율에 들어간다.
   실측(코퍼스 34건, 2026-08-10 환율 대비): 어긋남 **중앙값 5.1% · 최대 12.1%**
   (BSI 도쿄 ¥10 vs 8.92). 트랙 A 목표가 ±5%라 이것 하나로 목표가 깨진다.
   → 값을 고치지 않는다. **어느 환율로 환산했는지를 함께 넘겨** 쓰는 쪽이 되돌리게 한다.
   ⚠ 원화로 적힌 줄에는 붙지 않는다(환산한 적이 없으므로 되돌릴 것도 없다). */
const fxOf = (rows) => {
  const conv = (rows || []).filter((r) => r && r.converted);
  if (!conv.length) return null;
  const cur = conv[0].converted.from, rate = conv[0].converted.rate;
  /* 통화가 섞인 묶음은 하나로 말할 수 없다 — 말하지 않는다(짐작하지 않는다) */
  if (conv.some((r) => r.converted.from !== cur || r.converted.rate !== rate)) return null;
  return { currency: cur, rate, partial: conv.length !== rows.length };
};

/* ═══ 「이 줄이 기간을 곱했는가」 (SV) ══════════════════════════════════════
   차량·가이드 단가는 **1일 단가**다. 그런데 견적서에 이렇게 적힌 줄이 있다:

     차량   8,848,000 × 3 × 1 = 26,544,000     (버스 3대, 5박6일)
     가이드 2,528,000 × 3 × 1 =  7,584,000     (가이드 3명, 5박6일)

   곱셈은 맞아떨어져 **검산을 통과한다.** 그런데 8,848,000은 하루 단가가 아니라
   **버스 한 대의 전 일정 총액**이다(6으로 나누면 1,474,667 — 이태리 요율표 1,400,000과
   ±5%로 맞는다. 가이드도 421,333 vs 435,000). 지금은 각각 +532% · +481%로 나간다.

   ⚠ **이건 「동료와 어긋난다」로는 못 잡는다.** 그 지역 첫 견적서면 동료가 없어서
     ⚪「이 값이 기준선이 된다」로 조용히 통과하고, 그대로 요율 기준선이 된다.
     구멍이 정확히 거기다.

   여기서는 **판정하지 않고 구조적 사실만** 남긴다 — 이 줄의 수량·횟수가 **여행 기간을
   설명하는가.** 요율표를 아는 것은 화면·감사기(plausibility.js)의 몫이다.

   ⚠ **기간을 이미 곱한 줄에 또 나누면 안 된다.** 실측(뉴퍼스트 다낭):
     「797,500 × 1 × 4」의 4가 곧 일수라 797,500이 진짜 1일 단가다. 여기에 또 나누면
     199,375가 되어 **맞는 값을 망가뜨린다.** 그래서 수량·횟수 중 하나라도 기간과
     맞으면 후보에서 뺀다. */
const DURATION_TOL = 1;   /* 5박6일 문서가 「×5」로 적는 일이 흔하다 — ±1일은 같은 기간으로 본다 */
function coversDuration(row, trip) {
  if (!row || !trip) return null;
  const days = Number(trip.days) || (Number(trip.nights) ? Number(trip.nights) + 1 : 0);
  if (!(days >= 2)) return null;         /* 기간을 모르면 판단하지 않는다 */
  const covered = [row.qty, row.times].some((n) =>
    Number(n) >= 2 && Math.abs(Number(n) - days) <= DURATION_TOL);
  return { days, covered };
}

function ev(row, extra) {
  if (!row) return null;
  const unchecked = vacuous(row);
  return Object.assign({
    fx: fxOf([row]),
    rowIdx: row.idx,
    line: String(row.line).slice(0, 140),
    calc: unchecked
      ? `${row.total.toLocaleString()} — 수량·횟수가 없어 검산되지 않았습니다 (1인 단가인지 전 일정 총액인지 확인해 주세요)`
      : `${row.unit.toLocaleString()} × ${row.qty} × ${row.times} = ${row.total.toLocaleString()}`,
    label: row.label || '',
    /* 이 줄이 **왜 이 항목으로 분류됐는가** (L3.5). 브랜드명뿐인 줄은 라벨만 봐서는
       담당자가 왜 호텔로 잡혔는지 알 수 없다 — 표의 구분 열에서 왔다고 말해 준다. */
    categoryFrom: row.categoryFrom || null,
    via: unchecked ? 'unchecked' : 'rule',
  }, extra || {});
}

/* 외화 줄을 원화로 옮긴다 — **문서가 밝힌 환율로만.**
   ⚠ 환율이 없으면 환산하지 않고 `unconvertible`로 표시해 값 선택에서 뺀다.
   오늘 환율로 대신 계산하면 견적 시점과 어긋난 값이 '실측'으로 굳는다. */
function applyFx(rows, fx) {
  return rows.map((r) => {
    if (!r.currency) return r;
    const rate = fx[r.currency];
    if (!rate) return Object.assign({}, r, { unconvertible: true });
    return Object.assign({}, r, {
      unit: Math.round(r.unit * rate),
      total: Math.round(r.total * rate),
      converted: { from: r.currency, rate, originalUnit: r.unit, originalTotal: r.total },
    });
  });
}

/* ═══ L2.9 — 1인 기준 안(案) 비교표 (UG) ═══════════════════════════════════
   곱셈이 없는 양식이 있다. 실측(신한 금융플러스 감탄/마카오) — **한 줄도 검산이 안 된다:**

       항공      240,000  190,000  250,000  250,000  | 7C 205,000 21,800 47,700 274,500
       유류/택스   75,000   75,000   75,000   92,400  | NX 170,000 27,400 47,700 245,100
       지상     615,000  615,000  615,000  673,920
       보험      10,000   10,000   10,000   10,000
       하나수익   67,000   87,000   57,000   57,000
       입금가  1,007,000  977,000 1,007,000 1,083,320
       대리점수익 213,000  263,000  233,000  176,680
       판매가  1,220,000 1,240,000 1,240,000 1,260,000

   **열 하나가 안(案) 하나**이고 값이 전부 **1인 기준**이다. L2는 「단가 x 수량 x 횟수 =
   총금액」을 요구하므로 이런 표에서는 한 줄도 못 건진다 — 그래서 이 문서는 검산줄 0개다.

   ⚠ **어느 열이 채택된 안인지 짐작하면 안 된다.** 대신 **문서가 스스로 증명하게** 한다:

       항공 + 유류 + 지상 + 보험 + 수익  ==  입금가        (열마다)
       입금가 + 대리점수익              ==  판매가

   실측에서 **네 열이 전부 맞았다.** 세로 합이 맞는다는 것은 그 열이 한 벌의 견적이라는
   뜻이고, 그게 곧 이 양식이라는 증거다. 맞지 않으면 이 층은 아무것도 하지 않는다.
   그리고 **이미 읽어 둔 1인당(판매가)과 같은 열**을 고른다 — 고르는 근거가 문서 안에 있다.

   ⚠ **검산줄이 하나도 없을 때만 돈다.** 정상 표가 있는 문서를 건드리지 않기 위해서다.
   ⚠ **「지상」은 쓰지 않는다.** 차량·가이드·관광·식사를 한 덩어리로 묶은 줄이라 어느 칸의
     단가도 아니다(SE에서 정한 원칙 그대로).
   ⚠ 오른쪽에 항공사별 운임 내역표가 붙어 있다(SL의 좌우 두 표). 안의 개수는 **판매가 행이
     정하고**, 그 개수만큼만 앞에서 쓴다 — 세로 합 검산이 그 선택이 옳음을 증명한다. */
const SUMMARY_ROWS = {
  airfare: /^항공(료|권)?$/,
  fuel: /^(유류\s*\/?\s*택스|유류할증(료)?|유류|택스|T\/?S)$/i,
  ground: /^(지상(비|경비)?|랜드(비)?)$/,
  insurance: /^보험(료)?$/,
  margin: /^(하나|HNT|현지)?\s*수익$/i,
  deposit: /^입금가$/,
  agent: /^(대리점|여행사)\s*수익$/,
  sell: /^(판매가|고객가)$/,
};
function readSummaryTable(lines, perPerson) {
  const got = {};
  lines.forEach((ln) => {
    const cells = ln.cells || [];
    if (!cells.length) return;
    const head = String(cells[0].s).replace(/\s+/g, '').trim();
    Object.keys(SUMMARY_ROWS).forEach((k) => {
      if (got[k] || !SUMMARY_ROWS[k].test(head)) return;
      const ns = String(ln.text).slice(head.length)
        .match(/\d{1,3}(?:,\d{3})+|\d{5,}/g);
      if (ns && ns.length) got[k] = ns.map((s) => Number(s.replace(/,/g, '')));
    });
  });
  /* 안의 개수는 **판매가 행이 정한다** — 다른 행에는 옆 표가 붙어 있을 수 있다 */
  if (!got.sell || !got.deposit || got.sell.length < 2) return null;
  const n = Math.min(got.sell.length, got.deposit.length);
  const at = (k, c) => ((got[k] || [])[c] || 0);

  /* 세로 합 검산 — **이게 이 양식이라는 유일한 증거다** */
  const okCols = [];
  for (let c = 0; c < n; c++) {
    const sum = at('airfare', c) + at('fuel', c) + at('ground', c)
      + at('insurance', c) + at('margin', c);
    if (sum > 0 && sum === at('deposit', c)
      && at('deposit', c) + at('agent', c) === at('sell', c)) okCols.push(c);
  }
  if (okCols.length < n) return null;          /* 한 열이라도 안 맞으면 이 양식이 아니다 */

  /* 이미 읽어 둔 1인당과 같은 열을 고른다 — 짐작하지 않는다 */
  const pick = perPerson ? okCols.find((c) => at('sell', c) === perPerson) : null;
  if (pick == null) return null;
  return {
    col: pick, cols: n,
    airfare: at('airfare', pick) || null,
    fuel: at('fuel', pick) || null,
    deposit: at('deposit', pick) || null,
    sell: at('sell', pick) || null,
    groundBundled: at('ground', pick) || null,   /* 묶음이라 값으로 쓰지 않는다 — 화면 설명용 */
  };
}

/* ═══ 견적 한 장을 읽는다 ══════════════════════════════════════════════════ */
function readOneBlock(lines, fx, blockTotal) {
  /* 1차로 뽑아 좌우 두 표인지 본다. 갈렸으면 **그 경계로 다시 뽑는다** — 조합이 두 표에
     걸쳐 만들어지는 것을 그때서야 막을 수 있다(경계를 알아야 막을 수 있기 때문이다). */
  const first = splitSideTables(applyFx(findUnitRows(lines, fx), fx || {}));
  const sided = first.info
    ? splitSideTables(applyFx(findUnitRows(lines, fx, first.info.cutX), fx || {}))
    : first;
  const rawRows = sided.rows;
  /* 분류 우선순위 — **자기 라벨 → 구분 열 → 수량 단위 → 비고** (L3.5 머리말에 이유가 있다).
     비고가 구분 열보다 뒤인 것이 핵심이다: 비고에는 옆 표에서 흘러든 글자가 섞인다.
     ⚠ **수량 단위가 비고보다 앞이다**(2026-08-12 신설). 비고는 사람이 자유롭게 쓰는 칸이라
       「1인1실_조식포함」처럼 다른 분류의 낱말이 흔히 들어간다. 반면 「X 17 **객실**」은
       그 줄이 무엇을 세는지 문서가 직접 말한 것이라 뒤집힐 여지가 없다. */
  const grp = groupColumn(lines, rawRows);
  const rows = rawRows.map((r) => {
    const own = classifyLabel(r.label);
    const fromGroup = grp.byLine ? (grp.byLine.get(r.lineIdx) || null) : null;
    /* ⚠ 라벨이 이길 때 **구분 열로 뒤집지 말 것.** 구분 열이 항목 종류가 아니라 *누구의*
       비용인지를 적는 양식이 있다 — 「인솔자」 묶음 안의 「인솔자 항공 380,000」은
       항공료이지 가이드비가 아니다. 뒤집게 했더니 정확히 그 줄이 가이드 일당이 됐다. */
    /* 객실을 세는 줄은 호텔이다 — 끼니를 객실 단위로 세는 견적서는 없다(ROOM_UNIT_RE 주석) */
    const byUnit = ROOM_UNIT_RE.test(String(r.line || '')) ? 'hotel' : null;
    const category = own || fromGroup || byUnit || classifyLabel(r.note) || null;
    return Object.assign({}, r, {
      category,
      /* 어디서 온 분류인지 남긴다 — 화면이 근거를 말할 수 있어야 한다 */
      categoryFrom: !category ? null
        : own ? 'label'
          : (fromGroup === category ? 'group' : (byUnit === category ? 'unit' : 'note')),
      /* 이 줄이 어느 조 전용인가 (L3.7) — 문서가 비고에 적어 둘 때만 붙는다 */
      crew: crewOf(r),
    });
  });
  const rec = reconcile(lines, rows, blockTotal || null, fx);
  const kind = triage(lines, rows, rows);
  const dates = findDates(lines);   /* 블록마다 따로 읽는다 — 출발일이 서로 다를 수 있다 */
  const pax = rec.pax;

  /* 항공료: 1인당 운임. 여러 출발지(인천·김해)로 줄이 갈리면 **수량이 가장 많은 줄**이
     대표다 — 소수 인원의 예외 요금이 대표값이 되면 안 된다. */
  const airfare = pickBy(rows, 'airfare', byMaxQty);
  const fuel = pickBy(rows, 'fuel', byMaxQty);
  /* 호텔은 총액이 가장 큰 줄 = 본 숙소. 단가가 '객실 1박'이다. */
  const hotel = pickBy(rows, 'hotel', byMaxTotal);
  /* 차량·가이드는 '대당 1일'·'1일'이라 **가장 비싼 줄**이 기준선이다(대형차·한국인 가이드).
     ⚠ 그 묶음에는 **부수 비용 줄**이 섞여 있다(기사 팁·기사 식대·가이드 통신비).
     본 단가 줄이 있으면 더 비싸니 문제가 없지만, 본 줄이 검산에서 빠지면 부수 줄이
     그대로 대표가 된다 — 실측(키움 카자흐스탄): 진짜 차량 줄은 수량이 `4.5`라 검산이
     안 돼 빠지고, 「차량 기사 식사 22,500」이 차량 1일 단가로 나갔다(실제 1,200,000).
     그래서 부수 줄은 빼고 고른다. **다 빼면 비운다** — 부수 줄을 단가라 우기지 않는다. */
  const vehicle = pickBy(rows, 'vehicle', byMaxUnit, notIncidental);
  const guide = pickBy(rows, 'guide', byMaxUnit, notIncidental);
  /* 조가 갈린 문서인가 (L3.7) — **문서가 비고에 적어 둘 때만** 갈린 것으로 본다.
     ⚠ 인원(pax)을 알아야 조 인원이 뜻을 갖는다(전체보다 큰 수는 조 인원이 아니다). */
  const crews = readCrews(rows, pax);
  const meal = mealPerDay(rows, pax, dates, crews);
  const sight = sightPerPerson(rows, pax, crews);
  /* 골프비 — 관광비에서 빼기만 하던 것을 **값으로 만든다**(1인 1회 라운딩) */
  const golf = golfPerRound(rows, pax, crews);

  /* L2.9 — **검산줄이 하나도 없을 때만** 1인 기준 안 비교표를 본다(위 주석).
     정상 표가 있는 문서는 건드리지 않는다. */
  const summary = rows.length ? null : readSummaryTable(lines, rec.perPerson);

  /* 호텔명 — 호텔 줄의 라벨이 곧 호텔명이다(예: '노보텔'). 라벨이 비면 비고에서 찾는다. */
  /* 호텔명 — 호텔 줄의 라벨이 곧 호텔명이다. 다만 두 가지를 걷어내야 한다:
       ① 구분 열의 '호텔/숙박' 글자가 라벨 앞에 붙어 온다("호텔 Hotel Kadoman")
       ② 통화 기호가 뒤에 매달려 온다("Hotel Kadoman ¥")
     둘 다 실측에서 그대로 화면에 나갔다. */
  let hotelName = '';
  if (hotel) {
    const cand = (hotel.label || '').trim() || (hotel.note || '').trim();
    hotelName = cand
      .replace(/^(호텔|숙박|객실)\s+/, '')
      .replace(/[¥￥$€₫]/g, '')
      .replace(/\s*\d[\d,]*.*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LIMITS.hotelNameLen);
  }

  return {
    kind, lineCount: lines.length,
    /* 좌우로 나란한 표를 갈랐는가 (SL) — 화면과 감사기가 「다른 조 N줄은 뺐다」를 말할 수 있게 */
    sideTables: sided.info,
    /* 관광조·골프조로 갈린 문서인가 (L3.7) — 화면이 「어느 조 기준인지」 말할 수 있게.
       ⚠ **문서가 비고에 적어 둘 때만** 채워진다. 없으면 null이고 계산은 예전과 같다. */
    crews,
    /* 구분 열을 읽었는가 — 못 읽었으면 **왜 못 읽었는지**를 남긴다(감사기가 센다) */
    groupColumn: { used: !!grp.byLine, groups: grp.groups || 0, ambiguous: grp.ambiguous || 0, why: grp.why || '' },
    pax, grandTotal: rec.grand, perPerson: rec.perPerson,
    /* UU: 문서의 총계 ÷ 1인당이 딱 떨어지는데 우리가 읽은 인원과 다르다.
       인원을 여기서 고치지는 않는다 — 사람이 한 칸 확인해야 하는 자리라고 말할 뿐이다. */
    paxConflict: rec.paxConflict || null,
    /* UW: 인원을 어떻게 골랐는가 — 후보가 여럿이면 항목 줄이 투표한다. */
    paxPick: rec.paxPick || null,
    /* 항목을 다 더한 줄(「합계」) — 견적 총액과 다르다(SH). 커버리지 측정의 분모다. */
    itemsTotal: rec.itemsTotal || null,
    /* 우리 1인 원가 — 원가 시트에만 있다. 판매가(perPerson)와 섞지 말 것 (SC) */
    depositPerPerson: rec.deposit, depositCandidates: rec.depositAll || [],
    dates,
    reconciliation: rec,
    values: {
      /* L2.9: 검산줄이 없는 1인 기준 요약표에서 온 값(UG). 세로 합 검산을 통과한 열의
         값이라 근거가 문서 안에 있다. ⚠ 「지상」은 묶음이라 안 쓴다. */
      airfare: airfare ? capped(airfare.unit, LIMITS.airfare)
        : (summary ? capped(summary.airfare, LIMITS.airfare) : null),
      fuel: fuel ? capped(fuel.unit, LIMITS.fuel)
        : (summary ? capped(summary.fuel, LIMITS.fuel) : null),
      hotel: hotel ? capped(hotel.unit, LIMITS.hotel) : null,
      hotelName: hotelName || null,
      meal: meal ? capped(meal.value, LIMITS.meal) : null,
      vehicle: vehicle ? capped(vehicle.unit, LIMITS.vehicle) : null,
      guide: guide ? capped(guide.unit, LIMITS.guide) : null,
      sight: sight ? capped(sight.value, LIMITS.sight) : null,
      /* 골프 1인 1회 라운딩 (L3.7) — 요율의 관광비와 자릿수가 달라 칸을 따로 둔다 */
      golf: golf ? capped(golf.value, LIMITS.golf) : null,
      sell: rec.perPerson ? capped(rec.perPerson, LIMITS.sell) : null,
    },
    /* L2.9 — 1인 기준 안 비교표를 읽었는가(UG). 화면이 「몇 번째 안을 읽었는지」를
       말할 수 있어야 한다 — 안이 여럿인 문서라 담당자가 확인할 자리다. */
    summaryTable: summary,
    evidence: {
      /* ⚠ 요약표에서 온 값은 **어느 안에서 왔는지** 밝힌다(조용한 폴백 금지) */
      airfare: airfare ? ev(airfare) : (summary && summary.airfare ? {
        calc: `1인 기준 요약표의 ${summary.col + 1}번째 안 (전체 ${summary.cols}개 안)`
          + ` — 세로 합이 입금가 ${(summary.deposit || 0).toLocaleString()}와 맞는 열입니다`,
        label: '항공 (안 비교표)', via: 'rule',
      } : null),
      fuel: fuel ? ev(fuel) : (summary && summary.fuel ? {
        calc: `1인 기준 요약표의 ${summary.col + 1}번째 안 (전체 ${summary.cols}개 안)`,
        label: '유류·택스 (안 비교표)', via: 'rule',
      } : null),
      hotel: ev(hotel),
      /* SV: 차량·가이드만 **1일 단가**라 「전 일정 총액이 단가 자리에 왔는가」를 따진다.
         호텔은 1박 단가고 식비·관광비는 애초에 나눗셈으로 구한다 — 여기 넣지 말 것. */
      vehicle: ev(vehicle, { duration: coversDuration(vehicle, dates) }),
      guide: ev(guide, { duration: coversDuration(guide, dates) }),
      meal: meal ? {
        rowIdxs: meal.rowIdxs, calc: meal.calc, dayCount: meal.dayCount, via: 'calc',
        label: `식사 ${meal.rowIdxs.length}줄 · ${meal.basis}`,
        fx: meal.fx || null,
        /* 뺀 것은 **따로** 준다 — label에 이어 붙이면 화면에서 잘리거나 묻힌다(골프와 같다) */
        note: [
          meal.staffExcluded ? `인솔진 식사 ${meal.staffExcluded.toLocaleString()}원은 뺐습니다 — 여행자 식비가 아닙니다` : '',
          meal.notMealExcluded ? `음료·간식류 ${meal.notMealExcluded.toLocaleString()}원은 뺐습니다 — 끼니가 아닙니다` : '',
          meal.golfCrewExcluded ? `골프조 전용 식사 ${meal.golfCrewExcluded.toLocaleString()}원은 뺐습니다 — 요율의 식비는 일반 연수 기준입니다` : '',
        ].filter(Boolean).join(' · '),
      } : null,
      sight: sight ? {
        rowIdxs: sight.rowIdxs, calc: sight.calc, via: 'calc',
        label: `관광 ${sight.rowIdxs.length}줄`,
        fx: sight.fx || null,
        /* 뺀 골프비는 **따로** 준다 — label에 문장으로 이어 붙이면 화면에서 잘리거나 묻힌다 */
        note: [
          sight.golfExcluded
            ? `골프 ${sight.golfExcluded.toLocaleString()}원은 뺐습니다 — 요율의 관광비와 성격이 다릅니다`
              + (golf ? ` (골프비 칸으로 갔습니다: 1인 1회 ${golf.value.toLocaleString()}원)` : '')
            : '',
          sight.golfCrewExcluded
            ? `골프조 전용 관광 ${sight.golfCrewExcluded.toLocaleString()}원은 뺐습니다` : '',
        ].filter(Boolean).join(' · '),
      } : null,
      /* 골프비 — 요율의 관광비와 자릿수가 달라 따로 센다(L3.7) */
      golf: golf ? {
        rowIdxs: golf.rowIdxs, calc: golf.calc, via: 'calc',
        label: `골프 ${golf.rowIdxs.length}줄 · ${golf.rounds}회 라운딩`,
        fx: golf.fx || null,
        note: golf.heads
          ? `${golf.heads}명이 라운딩한 것으로 봤습니다 (전체 ${pax}명) — 다르면 고쳐 주세요`
          : `줄마다 인원이 달라 줄별로 나눴습니다 (전체 ${pax}명) — 식을 확인해 주세요`,
      } : null,
      /* ⚠ **유도한 값임을 밝힌다.** 문서에 1인당이 없어 `총 견적가 ÷ 인원`으로 만든
         값은 `via:'calc'`로 나가 화면이 계산식을 그대로 보여준다 — 담당자가 그 나눗셈이
         맞는지 눈으로 볼 수 있어야 한다(조용한 폴백을 만들지 않는다). */
      sell: rec.perPerson ? (rec.perPersonVia === 'derived'
        ? {
          calc: `총 견적가 ${(rec.grand || 0).toLocaleString()} ÷ 인원 ${pax} = ${rec.perPerson.toLocaleString()} (1인당)`,
          label: '1인당 (문서에 없어 총액에서 나눴습니다)', via: 'calc',
        }
        : { calc: `문서에 적힌 1인당 금액 ${rec.perPerson.toLocaleString()}원`, label: '1인당', via: 'doc' }) : null,
      /* 호텔명은 호텔 줄에서 나온다 — 그 줄이 검산 안 된 줄이면 이름도 같은 신뢰도다.
         (실측: 검산 안 된 「호텔 패널티」 줄이 대표가 되어 호텔명이 '패널티'로 나갔다) */
      hotelName: hotelName ? { calc: hotelName, label: hotel ? (hotel.label || '') : '', via: hotel && vacuous(hotel) ? 'unchecked' : 'rule' } : null,
    },
    /* 화면이 1클릭 정정에 쓰는 후보 목록 — 분류까지 함께 준다 */
    candidates: rows.map((r) => ({
      idx: r.idx, unit: r.unit, qty: r.qty, times: r.times, total: r.total,
      label: r.label || '', note: r.note || '', category: r.category,
      /* 'label' 자기 라벨 · 'group' 표의 구분 열 · 'note' 비고 (L3.5) */
      categoryFrom: r.categoryFrom || null,
      /* 좌우로 나란한 **다른 표**의 줄인가 (SL) — 자동 선택에서 빠졌지만 고를 수는 있다 */
      otherTable: !!r.otherTable,
      /* 어느 조 전용 줄인가 (L3.7) — 'golf' | 'tour' | null. 화면이 배지로 보여준다 */
      crew: r.crew || null,
      line: String(r.line).slice(0, 140),
      /* 외화였던 줄은 화면이 "¥2,000 × 9.5 = 19,000원"처럼 보여줘야 담당자가 믿을 수 있다 */
      converted: r.converted || null,
      unconvertible: !!r.unconvertible,
      currency: r.currency || null,
    })),
    namedCount: rows.filter((r) => r.category).length,
  };
}

/* ═══ 전체 실행 ═════════════════════════════════════════════════════════════
   opts.fxRate — 문서가 환율을 안 밝혔을 때 **담당자가 넣어 주는** 환율 `{USD: 1450}`.
   ⚠ 문서에 적힌 환율이 있으면 그쪽이 이긴다. 그게 실제 계약에 쓰인 환율이기 때문이다.
   담당자 값은 **빈 자리만** 채운다. 어느 쪽을 썼는지는 화면에 남긴다. */
async function extractQuote(buffer, pdfParse, opts) {
  const { lines, text, pageCount } = await readLayout(buffer, pdfParse);
  /* 환율은 문서 전체에서 찾는다 — 보통 1쪽 안내문에 있고 단가표는 2쪽에 있다. */
  const found = findFxRates(lines);
  const docFx = Object.assign({}, found.named);
  /* 어떻게 알아낸 환율인지 남긴다 — 화면이 「통화를 밝히지 않은 표기라 이렇게 봤다」를
     말할 수 있어야 한다(조용한 폴백을 만들지 않는다). */
  const fxHow = {};
  Object.keys(docFx).forEach((k) => { fxHow[k] = 'named'; });
  /* 통화를 안 밝힌 「환율 ₩ N」 — 견적서의 외화가 한 종류뿐일 때만 그 통화로 본다.
     ⚠ 통화 판별은 **단가표의 셀**로 한다. 안내문에 섞여 나오는 기호를 세면 안 된다. */
  const rowCurrencies = Array.from(new Set(
    findUnitRows(lines, {}).map((r) => r.currency).filter(Boolean)
  )).sort();
  const bound = bindBareFx(found.bare, rowCurrencies.filter((c) => !docFx[c]));
  if (bound.rate) { docFx[bound.rate.code] = bound.rate.value; fxHow[bound.rate.code] = 'bare'; }
  const userFx = (opts && opts.fxRate) || {};
  const fx = Object.assign({}, userFx, docFx);   /* 문서 값이 덮어쓴다 = 문서 우선 */
  const rawBlocks = splitQuoteBlocks(lines);
  const blocks = rawBlocks.map((b) => Object.assign({ idx: b.idx, blockTotal: b.total }, readOneBlock(b.lines, fx, b.total)));

  /* 기본으로 보여줄 장 — **단가 줄이 가장 많은**(표가 가장 온전한) 장이다.
     ⚠ '최신'이나 '맞는' 장이라는 뜻이 아니다. 코드는 그걸 알 수 없다.
     장이 둘 이상이면 화면이 그 사실을 말하고 사람이 바꿀 수 있게 한다. */
  let selected = 0;
  blocks.forEach((b, i) => {
    const cur = blocks[selected];
    if (b.namedCount > cur.namedCount ||
      (b.namedCount === cur.namedCount && b.candidates.length > cur.candidates.length)) selected = i;
  });

  const chosen = blocks[selected] || readOneBlock(lines, fx);

  /* 환율을 몰라 손대지 못한 외화 줄 — **가장 많이 걸린 통화 하나**를 물어보면 대부분 풀린다.
     ⚠ 실측에서 46건 중 15건이 여기 걸렸다(달러·유로 기준 견적서인데 환율 표기가 없다).
     오늘 환율로 대신 계산하지 않는다 — 견적 시점과 어긋난 값이 '실측'으로 굳는다.
     그 대신 화면이 딱 한 칸을 물어보고, 담당자가 넣으면 6~7칸이 한 번에 채워진다. */
  const stuck = {};
  chosen.candidates.forEach((c) => {
    if (c.unconvertible && c.currency) stuck[c.currency] = (stuck[c.currency] || 0) + 1;
  });
  const stuckList = Object.keys(stuck).sort((a, b) => stuck[b] - stuck[a]);
  const needsFxRate = stuckList.length
    ? { currency: stuckList[0], rowCount: stuck[stuckList[0]], all: stuck }
    : null;

  /* ── 일정표에서 **일수**를 채운다 (UC) ────────────────────────────────────
     기간 표기가 없어 일수를 못 읽는 견적서가 46건 중 9건이다. 그런데 그중 8건은
     **일정표를 이미 읽고 있다**(L7이 41/46건에서 읽는다). 일정표에 며칠이 있으면
     그게 곧 여행 일수다 — 새로 읽을 것이 없고 이미 가진 것을 쓰면 된다.

     ⚠ **문서가 밝힌 기간이 언제나 이긴다.** 여기서 채우는 것은 **비어 있을 때뿐**이다.
       일정표는 「선택일정」이 여러 줄이거나 차수가 섞이면 날이 부풀 수 있다
       (실측: KT CES는 9일 일정인데 13일치로 읽힌다). 그런 값으로 문서의 명시 기간을
       덮으면 금액이 통째로 어긋난다 — 일수는 식비에 정비례한다.
     ⚠ **박수와 어긋나면 안 쓴다.** 박수는 호텔 줄에서 따로 나오는 값이라 교차 검증이 된다.
     ⚠ 상한을 둔다(MAX_NIGHTS+1). 부풀어 오른 일정표를 그대로 받으면 식비가 그만큼 줄어든다.
     ⚠ 이렇게 얻은 일수는 `daysVia:'itinerary'`로 표시한다 — 화면이 「일정표에서 셌다」고
       말해야 담당자가 눈으로 확인할 자리를 안다(조용한 폴백을 만들지 않는다). */
  const itinerary = findItinerary(lines);
  const itinDays = (itinerary && itinerary.days) ? itinerary.days.length : 0;

  /* UX: 기간이 어긋난 건은 **일정표를 제3의 증인으로 세운다.**
     지금까지는 「날짜 범위를 쓰되 어긋났다고 표시」에서 멈췄다 — 사람이 매번 봐야 했다.
     그런데 일정표에 며칠이 있는지가 세어지면, 둘 중 어느 쪽이 맞는지 **문서가 스스로
     증명한다**(실측: 대림벧엘 큐슈 — 제목 2박3일 · 기간 3박4일 · 일정표 4일차까지).
     ⚠ 일정표를 **일수의 출처로 쓰는 것이 아니다.** 이미 문서에 있는 두 후보 중
       하나를 고르는 데만 쓴다 — 일정표는 선택일정·차수가 섞이면 부풀기 때문에
       (KT CES 9일 → 13일) 스스로 답이 될 수는 없다. 증인과 출처는 다르다.
     ⚠ 어느 쪽도 지지하지 않으면 **고르지 않는다.** 표시를 그대로 두고 사람이 본다. */
  let nightsResolved = null;
  const nc0 = chosen.dates && chosen.dates.nightsConflict;
  if (nc0 && itinDays >= 2) {
    const rangeDays = nc0.fromDates + 1;
    if (itinDays === rangeDays && itinDays !== nc0.labelledDays) {
      nightsResolved = { by: 'itinerary', days: itinDays, side: 'range' };
      chosen.dates = Object.assign({}, chosen.dates, { nightsConflict: null });
    } else if (nc0.labelledDays && itinDays === nc0.labelledDays && itinDays !== rangeDays) {
      /* 문서에 적힌 쪽이 맞았다 — 일수·박수를 그쪽으로 돌린다. */
      nightsResolved = { by: 'itinerary', days: itinDays, side: 'labelled' };
      chosen.dates = Object.assign({}, chosen.dates, {
        days: nc0.labelledDays, nights: nc0.labelled, nightsConflict: null,
      });
    }
  }

  let daysVia = chosen.dates && chosen.dates.days >= 2 ? 'header' : null;
  if (chosen.dates && !(chosen.dates.days >= 2) && itinDays >= 2 && itinDays <= MAX_NIGHTS + 1) {
    const n = chosen.dates.nights;
    /* 박수를 이미 아는데 일정표와 어긋나면 **고르지 않는다** — 둘 중 어느 쪽이 맞는지 모른다 */
    if (n == null || n + 1 === itinDays) {
      chosen.dates = Object.assign({}, chosen.dates, {
        days: itinDays,
        nights: n == null ? itinDays - 1 : n,
      });
      daysVia = 'itinerary';
    }
  }

  return Object.assign({}, chosen, {
    pageCount, text,
    /* 일수를 어디서 얻었나 — 'header'(문서가 밝힌 기간) / 'itinerary'(일정표에서 셌다) */
    daysVia,
    /* UX: 기간이 어긋났던 것을 **일정표가 증인이 되어** 풀었는가. 화면이 「무엇을 보고
       이쪽으로 정했는지」를 말할 수 있어야 한다 — 조용히 고르면 그게 조용한 폴백이다. */
    nightsResolved,
    /* L7 — 일정표. **문서 전체**에서 읽는다(견적 장이 갈려도 일정표는 한 벌인 문서가
       대부분이라 장별로 나누면 오히려 조각난다). 금액과 무관한 층이다. */
    itinerary,
    fxRates: fx, fxFromDocument: docFx, fxFromUser: userFx,
    /* 통화별로 **어떻게** 알아낸 환율인가 — 'named'(통화를 밝힌 표기) / 'bare'(통화를
       안 밝힌 「환율 ₩ N」을 견적서의 유일한 외화로 묶었다). bareFxWhy는 못 묶은 이유. */
    fxHow, bareFxWhy: bound.why || '',
    /* 자릿수가 말이 안 돼 **쓰지 않은** 환율 표기 — 문서의 오기다. 조용히 버리지 않는다
       (실측: 「환율(달러) 9.7」은 엔 환율이고, 「환율(VND) 23,000」은 1달러당 동화다). */
    fxRejected: found.rejected || [],
    needsFxRate,
    /* 환율을 못 찾아 손대지 못한 외화 줄이 몇 개인가 — 화면이 이유를 말할 수 있게 */
    unconvertible: chosen.candidates.filter((c) => c.unconvertible).length,
    /* 여러 장이 든 문서인지 — 화면이 반드시 이걸 보여줘야 한다(조용히 하나 고르지 않는다) */
    blockCount: blocks.length,
    selectedBlock: selected,
    /* ⚠ 블록마다 **전체 결과**를 함께 준다. 화면이 "다른 견적으로 바꾸기"를 눌렀을 때
       PDF를 다시 올리지 않고 그 자리에서 갈아 끼울 수 있어야 한다(수백 건을 넣는 자리다). */
    blocks: blocks.map((b, i) => ({
      idx: i, total: b.grandTotal || b.blockTotal || null, perPerson: b.perPerson || null,
      rows: b.candidates.length, named: b.namedCount, pax: b.pax,
      dates: b.dates, kind: b.kind,
      selected: i === selected,
      values: b.values, evidence: b.evidence, candidates: b.candidates,
      reconciliation: b.reconciliation,
    })),
  });
}

module.exports = {
  LIMITS, extractQuote, readOneBlock, readLayout, splitQuoteBlocks, findUnitRows,
  findDates, findQuoteDate, findTripDates, findFxRates, bindBareFx, fxPlausible,
  classifyRow, classifyLabel, groupColumn, reconcile, triage, mealPerDay, sightPerPerson,
  splitLabel, numbersIn, VOCAB,
  findItinerary, pickDayColumn, splitDayParts,
  coversDuration,
  /* TF: 「한 도시 견적인가」의 잣대 — 화면·감사기가 같은 것을 쓴다 */
  MULTI_CITY_STAYS, stayKey, distinctStays,
};

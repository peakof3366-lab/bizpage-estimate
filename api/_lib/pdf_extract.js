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

/* 문서가 밝힌 환율을 찾는다. 여러 표기를 겪었다:
     "급격한 환율 변동시 … (현재 1JPY = 9.5원 기준)"
     "기준 환율 ($) 1,450"
     "100엔 = 950원" */
function findFxRates(lines) {
  const out = {};
  const put = (code, v) => {
    if (code && Number.isFinite(v) && v > 0 && !out[code]) out[code] = v;
  };
  lines.forEach((ln) => {
    const t = ln.text;
    let m;
    if ((m = t.match(/1\s*(JPY|USD|EUR|VND|CNY|엔|달러|유로|동)\s*[=:]\s*([\d,.]+)\s*원/i))) {
      const map = { 엔: 'JPY', 달러: 'USD', 유로: 'EUR', 동: 'VND' };
      put(map[m[1]] || m[1].toUpperCase(), Number(m[2].replace(/,/g, '')));
    }
    if ((m = t.match(/100\s*(엔|JPY)\s*[=:]\s*([\d,.]+)\s*원/i))) {
      put('JPY', Number(m[2].replace(/,/g, '')) / 100);
    }
    if ((m = t.match(/기준\s*환율\s*\(?\s*([$€¥￥]|USD|JPY|EUR|VND|CNY)\s*\)?\s*[:=]?\s*([\d,.]+)/i))) {
      const sym = { $: 'USD', '€': 'EUR', '¥': 'JPY', '￥': 'JPY' };
      put(sym[m[1]] || m[1].toUpperCase(), Number(m[2].replace(/,/g, '')));
    }
  });
  return out;
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
    if (!/\d/.test(s)) { if (own) pending = own; return; }
    const cur = own || pending;
    numbersIn(s).forEach((n) => { out.push({ n, cur: cur || null }); });
    pending = null;   /* 기호는 한 숫자만 물들인다 */
  });
  return out;
}

function findUnitRows(lines, fx) {
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
    const toks = lineNumbers(ln.cells);
    if (toks.length < 3 || toks.length > 14) return;
    const ns = toks.map((t) => t.n);
    const { label, note } = splitLabel(ln.cells);
    /* 단가와 총금액이 **같은 통화**여야 그 줄의 통화로 인정한다. 둘 중 하나만 기호가
       붙어 있으면 그 기호를 따른다(양식에 따라 합계에만 기호를 찍는 곳이 있다). */
    const push = (a, b, c, d) => {
      const cur = toks[a].cur || toks[d].cur || null;
      found.push({
        lineIdx: ln.idx, page: ln.page, line: ln.text, label, note,
        unit: ns[a], qty: ns[b], times: c == null ? 1 : ns[c], total: ns[d],
        currency: cur,
      });
    };

    for (let a = 0; a < ns.length; a++) {
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
  { key: 'fuel', re: /유류|할증|택스|TAX|공항세|인두세|출국납부금|관광진흥/i },
  { key: 'insurance', re: /보험/ },
  { key: 'fee', re: /수수료|알선|대행료|커미션/ },
  { key: 'meal', re: /조식|중식|석식|중\s*:|석\s*:|조\s*:|식사|만찬|정찬|뷔페|도시락|기내식|룸드랍|룸서비스|간식|야식|음료|주류|스낵|숙취/ },
  { key: 'hotel', re: /호텔|숙박|객실|리조트|스위트|싱글룸|트윈|디럭스|체크인|HOTEL|RESORT/i },
  { key: 'airfare', re: /항공|운임|사입석|편도|왕복|비즈니스석|이코노미|좌석|내항기/ },
  { key: 'vehicle', re: /차량|버스|승합|인승|리무진|전용차|주차|톨비|도로유류|기사\s*경비/ },
  { key: 'guide', re: /가이드|인솔자|현지\s*가이드|한국인|기사(?!\s*경비)|\bTC\b/i },
  /* ⚠ 골프는 관광과 **따로 센다.** 요율표의 `sightseeing_fee`는 일반 연수의 관광·입장료인데,
     골프 라운딩비는 자릿수가 다르다(한화 건: 골프 11,136,000 vs 나머지 관광 전부 4,4백만).
     한 칸에 섞으면 그 목적지의 관광비 기준이 통째로 왜곡되고, 그 왜곡이 갱신 제안을 타고
     고객 견적까지 간다. 빼되 **화면에 얼마를 뺐는지 남긴다**(조용히 버리지 않는다). */
  { key: 'golf', re: /골프|라운딩|그린피|캐디|\bGOLF\b|\bCC\b\s*\d*홀?/i },
  /* ⚠ 라틴 문자가 섞인 낱말은 대소문자를 무시해야 한다 — '다낭/몽고메리 GOLF'가
     '골프'에 안 걸려 관광비에서 통째로 빠지던 것을 실측에서 잡았다. */
  { key: 'sight', re: /입장|관광|스파|마사지|케이블카|티켓|투어|체험|공연|박물관|수족관|테마파크|유람|크루즈|요트/i },
  { key: 'etc', re: /현수막|기념품|피켓|명찰|네임텐트|프로젝터|공동경비|현장추가|패스트\s*트랙|비자|인쇄|디자인|\bAV\b/i },
];

function classifyLabel(text) {
  const s = String(text || '');
  if (!s.trim()) return null;
  for (const v of VOCAB) if (v.re.test(s)) return v.key;
  return null;
}

/* 줄 하나의 분류 — 라벨을 먼저 보고, 없으면 비고를 본다.
   ⚠ 라벨과 비고를 한 덩어리로 합쳐서 보면 안 된다. 비고에 "항공,숙박,식비 등 일체"처럼
   **다른 항목 이름이 나열된** 줄이 실제로 있다(공동경비). 라벨이 이길 수 있게 나눠 본다. */
function classifyRow(row) {
  return classifyLabel(row.label) || classifyLabel(row.note) || null;
}

/* ═══ L4 — 문서 자체 검산 ═══════════════════════════════════════════════════
   고객에게 나간 견적서는 숫자가 맞다(사장님 확인). 그러면 문서 안의
   소계 · 총계 · 인원 · 1인당이 서로 맞아떨어져야 한다. 우리가 읽은 결과로 그 관계가
   재현되면 **정답지 없이도** "제대로 읽었다"를 말할 수 있다.
   ⚠ 이 검산은 값을 고치지 않는다. 화면과 감사에 **증거로 남기기만** 한다
   (조용한 폴백을 만들지 않는다는 이 저장소의 규칙 그대로다). */
function findPax(lines, rows) {
  for (const ln of lines) {
    const m = ln.text.match(/인\s*원[^\d]{0,4}(\d{1,4})\s*명?/) || ln.text.match(/총\s*인\s*원[^\d]{0,4}(\d{1,4})/);
    if (m) { const n = Number(m[1]); if (n >= 2 && n <= 2000) return n; }
  }
  /* 못 찾으면 수량의 최댓값으로 본다 — 1인당 항목의 수량이 곧 인원이다 */
  const qtys = rows.map((r) => Math.max(r.qty, r.times)).filter((n) => n >= 2 && n <= 2000);
  return qtys.length ? Math.max.apply(null, qtys) : 0;
}

/* 1인 판매가로 인정할 범위 — 밖이면 그 줄은 1인당이 아니라 총액이거나 딴 숫자다.
   ⚠ '판매가'라는 말은 양식에 따라 총액에도 쓰인다. 범위와 인원 대조로 갈라낸다. */
const PER_PERSON_MIN = 100000;
const PER_PERSON_MAX = 20000000;

function findTotals(lines, pax, preferGrand) {
  let grand = preferGrand || null, perPerson = null;
  lines.forEach((ln) => {
    const t = ln.text;
    /* ⚠ '총액'이라는 말이 견적 총액이 아닌 곳에 쓰인다 — 실측에서
       「최종 투찰금(총액) 320,000,000」(입찰 상한)을 견적 총계로 집어
       1인당 검산이 통째로 깨졌다. 이런 줄은 처음부터 뺀다. */
    if (/투찰|입찰|예산|한도|가입\s*금액|보상|보장/.test(t)) return;
    /* ⚠ '입금가'는 총액이 아니라 **1인 원가**로 쓰는 양식이 있다(대림벧엘 큐슈).
       총액으로 잘못 잡으면 그보다 큰 판매가가 "총액보다 크다"는 이유로 버려진다 —
       실제로 그래서 판매가가 비어 있었다. 총액 후보에서 뺀다. */
    if (/총\s*견\s*적\s*가|총\s*금\s*액|총\s*계|합\s*계\s*금액|총액/.test(t)) {
      const ns = numbersIn(t).filter((n) => n >= 100000);
      /* 블록 경계에서 읽은 총계가 있으면 그걸 믿는다 — 그 줄이 곧 '총 견적가'다 */
      if (ns.length && !preferGrand) { const v = Math.max.apply(null, ns); if (grand == null || v > grand) grand = v; }
    }
    /* '판매가·상품가·객단가'도 1인 기준으로 쓰는 양식이 많다(대림벧엘 큐슈: 판매가 1,251,350).
       ⚠ 총액에 같은 말을 쓰는 양식도 있어, **1인 범위 안이고 총액보다 작을 때만** 받는다. */
    if (/1\s*인\s*당|객단가|상품가|인당\s*요금|1인\s*요금|판\s*매\s*가/.test(t)) {
      const ns = numbersIn(t).filter((n) => n >= PER_PERSON_MIN && n <= PER_PERSON_MAX);
      const ok = ns.filter((n) => grand == null || n < grand);
      if (ok.length) { const v = Math.max.apply(null, ok); if (perPerson == null || v > perPerson) perPerson = v; }
    }
  });
  /* 인원을 아는데 1인당 × 인원이 총액과 딴판이면 잘못 집은 것이다 — 버린다(조용히 쓰지 않는다). */
  if (perPerson && grand && pax && Math.abs(perPerson * pax - grand) / grand > 0.25) perPerson = null;
  return { grand, perPerson };
}

function reconcile(lines, rows, preferGrand) {
  const pax = findPax(lines, rows);
  const { grand, perPerson } = findTotals(lines, pax, preferGrand);
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

  /* ② 뽑아낸 줄들의 총액 합이 총계를 넘지 않는가 — 넘으면 같은 줄을 두 번 셌다는 뜻 */
  if (grand && rows.length) {
    const sum = rows.reduce((n, r) => n + r.total, 0);
    checks.push({
      name: '뽑은 줄 합계 ≤ 총계',
      ok: sum <= grand * 1.02,
      detail: `${sum.toLocaleString()} vs 총계 ${grand.toLocaleString()}`,
    });
  }

  const done = checks.filter((c) => c.ok).length;
  return { pax, grand, perPerson, checks, passed: done, total: checks.length };
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
    if (!/작성일|발행일|견적일|날짜/.test(t)) continue;
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
      let m = t.match(new RegExp(`(\\d{2,4})\\s*[.\\-\\/]\\s*(\\d{1,2})\\s*[.\\-\\/]\\s*(\\d{1,2})\\s*${TILDE}\\s*(\\d{2,4})\\s*[.\\-\\/]\\s*(\\d{1,2})\\s*[.\\-\\/]\\s*(\\d{1,2})`));
      if (m) {
        depart = validYmd(ymd(m[1], m[2], m[3])) || depart;
        ret = validYmd(ymd(m[4], m[5], m[6])) || ret;
        takeNightsDays(t);
        if (depart) break;
      }
      /* ② 연도.월.일 ~ 월.일 (뒤쪽에 연도 생략) */
      m = t.match(new RegExp(`(\\d{2,4})\\s*[.\\-\\/]\\s*(\\d{1,2})\\s*[.\\-\\/]\\s*(\\d{1,2})\\s*${TILDE}\\s*(\\d{1,2})\\s*[.\\-\\/]\\s*(\\d{1,2})(?!\\s*[.\\-\\/]\\s*\\d)`));
      if (m) {
        depart = validYmd(ymd(m[1], m[2], m[3])) || depart;
        ret = validYmd(ymd(m[1], m[4], m[5])) || ret;
        takeNightsDays(t);
        if (depart) break;
      }
      /* ③ 출발일 하나만 (+ 박수) — 낱말 관문을 통과한 줄에서만 */
      if (pass !== 1) continue;
      m = t.match(/(\d{2,4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
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
  let nightsConflict = null;
  if (fromDates != null && labelled.nights && labelled.nights !== fromDates) {
    nightsConflict = { fromDates, labelled: labelled.nights, labelledDays: labelled.days };
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
  return { depart, ret, nights, days, returnEstimated, nightsConflict };
}

/* 머리글에 기간이 안 적힌 견적서가 절반이 넘는다(실측 46건 중 28건). 그런 문서도
   **일정표에는** 날짜가 있다 — 다만 「02월 04일」처럼 **연도가 없다.**
   그래서 연도를 다른 데서 데려온다:
     ① 견적 작성일의 연도 (그 날짜보다 앞서면 이듬해로 본다 — 여행은 견적 뒤에 간다)
     ② 문서 어딘가의 4자리 연도가 딱 하나면 그것
     ③ 둘 다 없으면 **추정하지 않는다**
   ⚠ 이렇게 얻은 날짜는 `departVia:'itinerary'`로 표시해 화면이 "일정표에서 추정"이라고
   말한다. 담당자가 제출 전에 눈으로 확인하는 칸이므로, 비워 두는 것보다 낫다. */
function findItineraryDepart(lines, quoteDate) {
  let md = null;
  for (const ln of lines) {
    const m = ln.text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (m) { md = { mo: +m[1], d: +m[2] }; break; }
  }
  if (!md || md.mo < 1 || md.mo > 12 || md.d < 1 || md.d > 31) return null;

  let year = null;
  if (quoteDate) {
    year = Number(quoteDate.slice(0, 4));
    const cand = ymd(year, md.mo, md.d);
    if (cand < quoteDate) year += 1;      /* 견적보다 앞선 날짜면 이듬해 여행이다 */
  } else {
    const years = new Set();
    lines.forEach((ln) => {
      const g = ln.text.match(/\b(20\d{2})\b/g);
      if (g) g.forEach((y) => years.add(y));
    });
    if (years.size === 1) year = Number([...years][0]);
  }
  if (!year) return null;
  return validYmd(ymd(year, md.mo, md.d));
}

function findDates(lines) {
  const quoteDate = findQuoteDate(lines);
  const trip = findTripDates(lines);
  let departVia = trip.depart ? 'header' : null;
  if (!trip.depart) {
    const guess = findItineraryDepart(lines, quoteDate);
    if (guess) { trip.depart = guess; departVia = 'itinerary'; }
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
    returnDate: trip.ret,
    returnEstimated: trip.returnEstimated,
    nights: trip.nights,
    days: trip.days,
    /* 문서 안에서 기간 표기가 서로 어긋났다 — 화면이 한 칸 물어야 한다(null이면 이상 없음) */
    nightsConflict: trip.nightsConflict || null,
    leadDays,
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
const usable = (r) => !r.unconvertible;

function pickBy(rows, category, how) {
  const list = rows.filter((r) => r.category === category && usable(r));
  if (!list.length) return null;
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
const headCount = (r) => Math.max(r.qty, r.times);
const perHeadRows = (rows, category) =>
  rows.filter((r) => r.category === category && usable(r) && headCount(r) >= PER_HEAD_MIN_QTY);

function mealPerDay(rows, pax) {
  const meals = perHeadRows(rows, 'meal');
  if (!meals.length || !pax) return null;
  const totalCost = meals.reduce((n, r) => n + r.total, 0);

  const days = new Set();
  meals.forEach((r) => {
    const m = (r.label + ' ' + r.note).match(/(\d{1,2})\s*일\s*차?/g);
    if (m) m.forEach((t) => days.add(t.replace(/\D/g, '')));
  });
  let dayCount = days.size;
  let basis = `라벨의 'N일' ${dayCount}개`;
  if (!dayCount) {
    const hotel = rows.filter((r) => r.category === 'hotel');
    const nights = hotel.length ? Math.max.apply(null, hotel.map((r) => r.times)) : 0;
    if (nights >= 1) { dayCount = nights + 1; basis = `호텔 ${nights}박 + 1`; }
  }
  if (!dayCount) return null;

  const value = Math.round(totalCost / pax / dayCount);
  return {
    value,
    rowIdxs: meals.map((r) => r.idx),
    calc: `식사 총액 ${totalCost.toLocaleString()} ÷ 인원 ${pax} ÷ ${dayCount}일 = ${value.toLocaleString()} (1인 1일)`,
    basis,
    dayCount,
  };
}

/* 관광비는 '1인당 여행 전체 일정의 관광비 묶음'이다(data.js sightseeing_fee 주석).
   그래서 대표 한 줄이 아니라 **관광으로 분류된 총액 ÷ 인원**이다. */
function sightPerPerson(rows, pax) {
  const list = perHeadRows(rows, 'sight');
  if (!list.length || !pax) return null;
  const totalCost = list.reduce((n, r) => n + r.total, 0);
  const value = Math.round(totalCost / pax);
  /* 뺀 골프비를 함께 돌려준다 — 화면이 "골프 ○○원은 뺐습니다"라고 말할 수 있게. */
  const golf = perHeadRows(rows, 'golf');
  const golfCost = golf.reduce((n, r) => n + r.total, 0);
  return {
    value, rowIdxs: list.map((r) => r.idx),
    calc: `관광 총액 ${totalCost.toLocaleString()} ÷ 인원 ${pax} = ${value.toLocaleString()} (1인당 전 일정)`,
    golfExcluded: golfCost || 0,
    golfRowIdxs: golf.map((r) => r.idx),
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
function ev(row, extra) {
  if (!row) return null;
  const unchecked = vacuous(row);
  return Object.assign({
    rowIdx: row.idx,
    line: String(row.line).slice(0, 140),
    calc: unchecked
      ? `${row.total.toLocaleString()} — 수량·횟수가 없어 검산되지 않았습니다 (1인 단가인지 전 일정 총액인지 확인해 주세요)`
      : `${row.unit.toLocaleString()} × ${row.qty} × ${row.times} = ${row.total.toLocaleString()}`,
    label: row.label || '',
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

/* ═══ 견적 한 장을 읽는다 ══════════════════════════════════════════════════ */
function readOneBlock(lines, fx, blockTotal) {
  const rawRows = applyFx(findUnitRows(lines, fx), fx || {});
  const rows = rawRows.map((r) => Object.assign({}, r, { category: classifyRow(r) }));
  const rec = reconcile(lines, rows, blockTotal || null);
  const kind = triage(lines, rows, rows);
  const dates = findDates(lines);   /* 블록마다 따로 읽는다 — 출발일이 서로 다를 수 있다 */
  const pax = rec.pax;

  /* 항공료: 1인당 운임. 여러 출발지(인천·김해)로 줄이 갈리면 **수량이 가장 많은 줄**이
     대표다 — 소수 인원의 예외 요금이 대표값이 되면 안 된다. */
  const airfare = pickBy(rows, 'airfare', byMaxQty);
  const fuel = pickBy(rows, 'fuel', byMaxQty);
  /* 호텔은 총액이 가장 큰 줄 = 본 숙소. 단가가 '객실 1박'이다. */
  const hotel = pickBy(rows, 'hotel', byMaxTotal);
  /* 차량·가이드는 '대당 1일'·'1일'이라 **가장 비싼 줄**이 기준선이다(대형차·한국인 가이드). */
  const vehicle = pickBy(rows, 'vehicle', byMaxUnit);
  const guide = pickBy(rows, 'guide', byMaxUnit);
  const meal = mealPerDay(rows, pax);
  const sight = sightPerPerson(rows, pax);

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
    pax, grandTotal: rec.grand, perPerson: rec.perPerson,
    dates,
    reconciliation: rec,
    values: {
      airfare: airfare ? capped(airfare.unit, LIMITS.airfare) : null,
      fuel: fuel ? capped(fuel.unit, LIMITS.fuel) : null,
      hotel: hotel ? capped(hotel.unit, LIMITS.hotel) : null,
      hotelName: hotelName || null,
      meal: meal ? capped(meal.value, LIMITS.meal) : null,
      vehicle: vehicle ? capped(vehicle.unit, LIMITS.vehicle) : null,
      guide: guide ? capped(guide.unit, LIMITS.guide) : null,
      sight: sight ? capped(sight.value, LIMITS.sight) : null,
      sell: rec.perPerson ? capped(rec.perPerson, LIMITS.sell) : null,
    },
    evidence: {
      airfare: ev(airfare), fuel: ev(fuel), hotel: ev(hotel),
      vehicle: ev(vehicle), guide: ev(guide),
      meal: meal ? {
        rowIdxs: meal.rowIdxs, calc: meal.calc, dayCount: meal.dayCount, via: 'calc',
        label: `식사 ${meal.rowIdxs.length}줄 · ${meal.basis}`,
      } : null,
      sight: sight ? {
        rowIdxs: sight.rowIdxs, calc: sight.calc, via: 'calc',
        label: `관광 ${sight.rowIdxs.length}줄`,
        /* 뺀 골프비는 **따로** 준다 — label에 문장으로 이어 붙이면 화면에서 잘리거나 묻힌다 */
        note: sight.golfExcluded
          ? `골프 ${sight.golfExcluded.toLocaleString()}원은 뺐습니다 — 요율의 관광비와 성격이 다릅니다`
          : '',
      } : null,
      sell: rec.perPerson ? { calc: `문서에 적힌 1인당 금액 ${rec.perPerson.toLocaleString()}원`, label: '1인당', via: 'doc' } : null,
      /* 호텔명은 호텔 줄에서 나온다 — 그 줄이 검산 안 된 줄이면 이름도 같은 신뢰도다.
         (실측: 검산 안 된 「호텔 패널티」 줄이 대표가 되어 호텔명이 '패널티'로 나갔다) */
      hotelName: hotelName ? { calc: hotelName, label: hotel ? (hotel.label || '') : '', via: hotel && vacuous(hotel) ? 'unchecked' : 'rule' } : null,
    },
    /* 화면이 1클릭 정정에 쓰는 후보 목록 — 분류까지 함께 준다 */
    candidates: rows.map((r) => ({
      idx: r.idx, unit: r.unit, qty: r.qty, times: r.times, total: r.total,
      label: r.label || '', note: r.note || '', category: r.category,
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
  const docFx = findFxRates(lines);
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

  return Object.assign({}, chosen, {
    pageCount, text,
    fxRates: fx, fxFromDocument: docFx, fxFromUser: userFx,
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
  findDates, findQuoteDate, findTripDates,
  classifyRow, classifyLabel, reconcile, triage, mealPerDay, sightPerPerson,
  splitLabel, numbersIn, VOCAB,
};

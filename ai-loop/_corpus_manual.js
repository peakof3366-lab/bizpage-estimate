/* ═══════════════════════════════════════════════════════════════════════════
   **사람이 채운 값**을 코퍼스에 이어 주는 한 곳 (XZ)
   ───────────────────────────────────────────────────────────────────────────
   🔴 왜 만들었나 — **고리가 끊겨 있었다.**

   결정대기열 0-f는 「관리자 화면에서 환율 한 칸을 넣으면 역검증 표본이 36 → 42건이
   된다」고 적혀 있었다. 그런데 실제로는 그렇게 안 된다:

     · 화면에서 넣은 환율 → `actual_price_reports`(운영 DB)에 저장된다. 요율 갱신
       제안·실측 배지는 그걸 쓴다.
     · 그러나 **역검증(`backtest_quotes.js`)은 로컬 PDF를 다시 추출한다.**
       `_corpus_cache.js`가 `extractQuote(buf, pdfParse, {})` — **빈 옵션**으로 부른다.
       환율이 안 들어가니 그 견적서는 **여전히 제외**된다.

   즉 대표가 30초를 써도 채점표는 그대로였다. 추출기는 `opts.fxRate`를 받을 준비가
   되어 있었는데(SF), **부르는 쪽이 안 주고 있었다** — 결함 생성기 ③(실행된 적 없는
   안전망)의 전형이다.

   → 사람이 준 값을 `corpus_manual.json` 한 곳에 두고, 코퍼스가 그것을 읽는다.

 ⚠ **여기서 값을 지어내지 않는다.** 파일이 비어 있으면 지금과 똑같이 동작한다
   (그 견적서는 표본에서 빠진다). 빈 채로 두는 것은 안전하고, 지어낸 값은 모든
   실측을 오염시킨다.
 ⚠ **어떤 값이 사람에게서 왔는지 흔적을 남긴다**(`manualFx`) — 나중에 「이 실측이
   문서에서 나온 것인가 사람이 넣은 것인가」를 물을 때 그 구분이 없으면 답할 수 없다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const FILE = path.join(HERE, 'corpus_manual.json');

function 읽기() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    /* 파일이 없거나 깨졌으면 **조용히 빈 값**이 아니라 이유를 남긴다 —
       조용히 넘어가면 「왜 표본이 안 늘지」를 다시 파게 된다. */
    if (e.code !== 'ENOENT') console.warn('[corpus_manual] 읽지 못했습니다: ' + e.message);
    return {};
  }
}

/* 그 견적서에 사람이 넣은 환율이 있으면 `{USD: 1450}` 모양으로 준다.
   ⚠ 추출기는 `opts.fxRate`를 **통화 → 원화** 표로 받는다(`pdf_extract.js` 2776행). */
function fxFor(file) {
  const 표 = (읽기().환율 || {})[file];
  if (!표 || 표.값 == null || !표.통화) return null;
  const v = Number(표.값);
  if (!Number.isFinite(v) || v <= 0) return null;
  return { [String(표.통화)]: v };
}

/* 사람이 채운 판매가(원가 시트에 계약가가 비어 있는 건) */
function priceFor(file) {
  const 표 = (읽기().판매가 || {})[file];
  if (!표) return null;
  const 총계 = Number(표.총계);
  /* ⚠ 변수 이름은 숫자로 시작할 수 없다 — `1인당`은 문법 오류다(여기서 한 번 밟았다) */
  const 일인당 = Number(표['1인당']);
  const out = {};
  if (Number.isFinite(총계) && 총계 > 0) out.grand = 총계;
  if (Number.isFinite(일인당) && 일인당 > 0) out.perPerson = 일인당;
  return Object.keys(out).length ? out : null;
}

/* 지금 몇 칸이 채워져 있나 — 도구들이 「사람 손이 얼마나 들어갔는지」를 말할 수 있게 */
function 채워진것() {
  const d = 읽기();
  const fx = Object.entries(d.환율 || {}).filter(([, v]) => v && v.값 != null).map(([k]) => k);
  const price = Object.entries(d.판매가 || {})
    .filter(([k, v]) => k !== '_읽는법' && v && (v.총계 != null || v['1인당'] != null)).map(([k]) => k);
  const 빈칸 = {
    환율: Object.keys(d.환율 || {}).filter((k) => !fx.includes(k)),
    판매가: Object.keys(d.판매가 || {}).filter((k) => k !== '_읽는법' && !price.includes(k)),
  };
  return { fx, price, 빈칸, FILE };
}

/* 문서에 1인당·총계가 없어 대조를 못 하는 건에 사람이 넣어 주는 정답지.
   ⚠ **환율과 다른 문제다.** 환율은 항목 줄을 살리고(칸별 분석), 이 값은 채점표를 만든다.
     실측(XZ): 환율 넷을 다 채워도 대조 가능 건수는 36건 그대로였고, 제외 사유만
     「외화인데 환율이 없다」에서 「1인당 금액을 못 읽음」으로 옮겨갔다. */
function answerFor(file) {
  const 표 = (읽기().정답지 || {})[file];
  if (!표) return null;
  const 총계 = Number(표.총계);
  const 일인당 = Number(표['1인당']);
  const out = {};
  if (Number.isFinite(총계) && 총계 > 0) out.grand = 총계;
  if (Number.isFinite(일인당) && 일인당 > 0) out.perPerson = 일인당;
  return Object.keys(out).length ? out : null;
}

/* 문서에 연도가 없어 출발일을 못 정하는 건. **연도 한 칸**이면 풀린다.
   ⚠ 출발일은 시즌·리드타임 계수를 통째로 바꾼다 — 짐작해서 채우면 그 견적서의
     오차가 통째로 딴 값이 된다(UH에서 바르셀로나가 2년 어긋나 있었다). */
function datesFor(file) {
  const 표 = (읽기().일정 || {})[file];
  if (!표) return null;
  const ok = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const out = {};
  if (ok(표.출발일)) out.depart = 표.출발일;
  if (ok(표.귀국일)) out.return = 표.귀국일;
  if (out.depart && out.return) {
    out.days = Math.round((new Date(out.return) - new Date(out.depart)) / 86400000) + 1;
  }
  return Object.keys(out).length ? out : null;
}

/* 🔴 **적어 둔 파일 이름이 코퍼스에 실제로 있는가.**
   이름이 한 글자만 달라도 그 값은 **아무 일도 안 한다** — 채운 사람은 「넣었는데 왜
   안 늘지」를 한참 찾게 된다(`타이베이: 5`가 요율표엔 `대만`이라 한 번도 안 쓰인 것과
   같은 종류다, XW). 조용히 지나가지 않고 그 자리에서 말한다. */
function 이름확인(files, say) {
  const 있는것 = new Set(files || []);
  const d = 읽기();
  const 낯선것 = [];
  ['환율', '판매가', '정답지', '일정'].forEach((구역) => {
    Object.keys(d[구역] || {}).forEach((k) => {
      if (k === '_읽는법') return;
      if (!있는것.has(k)) 낯선것.push(구역 + ' › ' + k);
    });
  });
  if (낯선것.length && typeof say === 'function') {
    say('⚠ `corpus_manual.json`에 코퍼스에 없는 파일 이름이 ' + 낯선것.length + '건 있습니다 '
      + '— 그 값은 아무 일도 안 합니다:\n   · ' + 낯선것.join('\n   · '));
  }
  return 낯선것;
}

/* 사람이 채운 값의 **지문**. 이 값이 바뀌면 캐시를 버려야 한다 —
   안 그러면 채워도 옛 결과가 계속 나온다. 파일 전체가 아니라 **채운 값만** 본다
   (주석·메모를 고쳤다고 1~3분짜리 재추출을 시키지 않는다). */
function manualSig() {
  const d = 읽기();
  const 환 = Object.entries(d.환율 || {}).map(([k, v]) => k + '=' + (v && v.통화) + ':' + (v && v.값));
  const 금액 = ['판매가', '정답지'].reduce((acc, 구역) => acc.concat(
    Object.entries(d[구역] || {}).filter(([k]) => k !== '_읽는법')
      .map(([k, v]) => 구역 + ':' + k + '=' + (v && v.총계) + '/' + (v && v['1인당']))), []);
  const 일정 = Object.entries(d.일정 || {}).filter(([k]) => k !== '_읽는법')
    .map(([k, v]) => k + '=' + (v && v.출발일) + '~' + (v && v.귀국일));
  return 환.concat(금액, 일정).sort().join('|');
}

module.exports = { fxFor, priceFor, answerFor, datesFor, 이름확인, 채워진것, manualSig, FILE };

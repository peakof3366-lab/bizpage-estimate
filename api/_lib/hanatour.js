/* ═══════════════════════════════════════════════════════════════════════════
   하나투어 상품 하나를 읽어 우리 상품 칸으로 옮긴다 (WI·WJ) — **단일 출처**
   ───────────────────────────────────────────────────────────────────────────
   CLI(`ai-loop/fetch_hanatour.js`)와 관리자 화면(`?action=hanatour`)이 **같은 이 파일**을
   쓴다. 두 벌로 두면 한쪽만 고쳐지고, 터미널에서 본 값과 화면에 뜬 값이 달라진다
   (결함 생성기 ① — 이 저장소가 여섯 번 당한 유형).

   ⚠ **문서화된 공개 API가 아니다.** 하나투어 홈페이지가 내부적으로 쓰는 것이라
     예고 없이 바뀐다. 2026-08-25 대표 결정: 「하나투어 답은 없어. 그냥 임의로 우리가
     진행하면 될 것 같아.」 → 진행하되, **깨질 때 조용히 틀린 값을 넣지 않는 것**이
     이 파일의 가장 중요한 일이다:
       · 못 읽은 칸은 **비운다.** 짐작해서 채우지 않는다.
       · 무엇을 못 읽었는지 `missing`에 담아 **부르는 쪽이 말할 수 있게** 한다.
       · 응답 모양이 달라지면 `ok:false`로 **실패라고 말한다.** 빈 상품을 돌려주지 않는다.

   실측으로 맞춘 칸 (2026-08-25 · 상품 10건 전수 성공):
     getPkgProdInfo         → saleProdNm(상품명) · adtTotlAmt(성인 총액)
                              · rprsProdCd(**대표상품코드 — 엑셀과 맞추는 다리**)
                              · cityBasInfoList[0].cityNm(도시)
     getPkgProdItnrInfo     → schdInfoList(일차별 일정) · 식사 · 호텔
     getPkgTrvlProdCoreInfo → depDay(출발일) · minDepNop(최소 출발 인원)

   🔴 **2026-08-26(WL) 정정 — 포함/불포함은 온다.** WJ에서 「세 엔드포인트를 다 뒤졌지만
     없다」고 적었는데 **틀렸다.** 같은 `getPkgProdInfo` 응답 안에 들어 있었다:
       trvlExpnInclList(포함) · trvlExpnNoneInclList(불포함) · trvlChcExpnList(선택경비)
     WI에서 「홈페이지에서는 못 가져온다」가 틀렸던 것과 **같은 유형의 실수**다 —
     한 번 훑고 없다고 결론지었다. 목록을 끝까지 세지 않으면 또 이렇게 된다.

   WL에서 함께 맞춘 칸 (실측):
     trvlDayCnt / trvlNgtCnt → 🔴 **박·일수는 하나투어가 직접 말해 준다.** 그전에는
       일정 줄 수로 days를 세고 `nights = days - 1`로 **지어냈다** — 방콕 자유여행
       5일은 실제로 **3박**인데(야간 비행) 우리는 4박으로 만들고 있었다.
       고객 견적서에 찍히는 값이라 그대로 사고다.
     adtAmt + adtTaduAmt = adtTotlAmt → 금액 구성(상품가 + 제세공과금). **검산한다.**
     updDttm                → 하나투어가 이 상품을 마지막으로 고친 시각 = **금액 확인일**
     rppdCntntInfoList      → 대표 이미지(https)
     depCityNm / arrCityNm  → 출발 도시 · 도착 도시
   ═══════════════════════════════════════════════════════════════════════════ */
const https = require('https');

const GW = 'gw.hanatour.com';
const BASE = '/package/pkg/api/common/pkgcomprod';
/* 홈페이지가 쓰는 기본값 — 번들에서 확인했다(`inpPathCd: "H01"===v ? "WPP" : (_||"DCP")`).
   이 값이 없으면 서버가 400 「입력경로코드 값이 입력되지 않았습니다」로 거절한다. */
const INP_PATH = 'DCP';
const TIMEOUT_MS = 20000;

/* URL이면 pkgCd를 뽑고, 코드면 그대로. ⚠ **모양을 검사한다** — 아무 문자열이나 실어
   보내면 남의 엔드포인트에 이상한 값을 던지는 셈이고 오는 응답도 우리가 못 읽는다. */
function pkgCdOf(s) {
  if (typeof s !== 'string') return null;
  const m = /[?&]pkgCd=([A-Za-z0-9]+)/.exec(s);
  const cd = (m ? m[1] : s.trim());
  return /^[A-Za-z0-9]{6,30}$/.test(cd) ? cd : null;
}

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      host: GW, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('JSON이 아닙니다')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('시간 초과')));
    req.on('error', reject);
    req.end(data);
  });
}

/* 하루를 한 줄로. 실측으로 칸을 맞췄다:
     [도시간이동]  depCityNm (도착은 대개 비어 있다)
     [식사]        mealTypeNm(호텔식) 또는 mealCont(기내-불포함(유료제공))
     [관광지]      🔴 **cardNm이 진짜 이름이다.** schdCatgNm은 「관광지」라는 분류명일
                   뿐이라, 그것만 읽으면 일정이 「관광지 / 관광지 / 관광지」가 된다.
     [호텔/크루즈] cardNm — **같은 호텔이 여러 번 나온다**(실측 3회). 접는다.
     [텍스트입력]  안내 문구다 — 일정이 아니라 뺀다.
   ⚠ **조식·중식·석식으로 가르지 않는다.** 순서로 짐작할 수는 있지만 문서가 그렇게
     말해 준 것이 아니다(dtlMealDvNm은 비어 온다). 나온 순서대로 적고 사람이 다듬는다. */
const CATG_SKIP = /텍스트입력/;
const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i);

function dayLine(d) {
  const moves = [], meals = [], sights = [], stays = [];
  (d.schdMainInfoList || []).forEach((m) => {
    const nm = String(m.schdCatgNm || '').trim();
    if (CATG_SKIP.test(nm)) return;
    const card = String(m.cardNm || '').trim();
    if (/도시간이동/.test(nm)) {
      const from = String(m.depCityNm || '').trim();
      const to = String(m.arrCityNm || '').trim();
      if (from) moves.push(from + (to ? ' → ' + to : ''));
      return;
    }
    if (/식사/.test(nm)) {
      const v = String(m.mealTypeNm || '').trim() || String(m.mealCont || '').trim();
      if (v) meals.push(v);
      return;
    }
    if (/호텔|크루즈/.test(nm)) { if (card) stays.push(card); return; }
    if (card) sights.push(card);
    else if (nm) sights.push(nm);   /* 「자유일정」처럼 분류명 자체가 뜻을 갖는 것 */
  });
  const parts = [];
  if (moves.length) parts.push(uniq(moves).join(' · '));
  if (sights.length) parts.push(uniq(sights).join(' · '));
  if (meals.length) parts.push('식사: ' + meals.join(' / '));
  /* 호텔은 htlInfoList가 비어 오는 일이 있어(실측 null) 카드 이름을 함께 본다 */
  const htl = uniq(stays.concat((d.htlInfoList || [])
    .map((h) => String(h.htlNm || h.htlKorNm || '').trim()).filter(Boolean)));
  if (htl.length) parts.push('숙박: ' + htl.join(' / '));
  return parts.join(' / ');
}

const ymd = (s) => (/^\d{8}$/.test(String(s || ''))
  ? String(s).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : null);

/* `updDttm`은 「202608241608」 꼴이다 — 앞 8자만 날짜로 쓴다.
   ⚠ 시분은 버린다. 금액 확인일은 **날짜** 칸이고, 시각까지 남기면 정밀해 보이지만
     그 정밀함이 우리 것이 아니다(그쪽 시스템 시각이고 표준시도 확인 못 했다). */
const ymdOfDttm = (s) => ymd(String(s || '').slice(0, 8));

/* 포함/불포함 문구는 HTML이 섞여 온다: `<b>왕복항공권</b>`, `<br/>`,
   `<font color=red>…`. **태그를 지우되 글자는 지우지 않는다.**
   ⚠ 태그를 그냥 지우면 `<br/>`로 나뉘던 두 문장이 붙어 한 줄이 된다 — 줄바꿈 태그는
     먼저 공백으로 바꾼다. 고객 견적서에 그대로 나갈 수 있는 글이라 여기서 뭉개면
     사람이 읽고 고칠 기회가 없다. */
function stripHtml(s) {
  return String(s == null ? '' : s)
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\/\s*(p|div|li)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 한 줄로 만든다: `[교통] 왕복항공권` · `[식사] 식사비 — 일정표에 기재된 조식제공`
   ⚠ **분류를 버리지 않는다.** 「기타 : 가격문의」처럼 제목만으로는 뜻이 없는 항목이
     실제로 온다 — 분류가 붙어야 사람이 무엇을 손볼지 안다.
   ⚠ 제목도 설명도 없는 빈 항목이 실제로 온다(선택경비 [관광]). **버린다** — 빈 줄을
     포함사항에 넣으면 고객 견적서에 빈 항목이 찍힌다. */
function expenseLines(list, cap) {
  const out = [];
  for (const x of (Array.isArray(list) ? list : [])) {
    const clst = stripHtml(x && x.trvlExpnClstNm);
    const desc = stripHtml(x && x.trvlExpnDesc);
    /* 하나투어 자료에서 제목과 설명이 한 칸(trvlExpnDesc)에 `<b>제목</b> : 설명`으로
       들어온다. 굵게 표시된 앞부분이 제목이다 — 태그를 지우기 **전에** 갈라 둔다. */
    const raw = String((x && x.trvlExpnDesc) || '');
    const m = /<\s*b\s*>([\s\S]*?)<\s*\/\s*b\s*>\s*:?\s*([\s\S]*)/i.exec(raw);
    const title = m ? stripHtml(m[1]) : desc;
    const rest = m ? stripHtml(m[2]) : '';
    const body = rest && rest !== title ? title + ' — ' + rest : title;
    if (!body) continue;
    const line = (clst ? clst + ' ' : '') + body;
    if (!out.includes(line)) out.push(line.slice(0, 300));
    if (cap && out.length >= cap) break;
  }
  return out;
}

/* 대표 이미지 — **https만 받는다.** VZ가 세운 규칙 그대로다(화면이 `<img src>`에 그대로
   쓴다). 여기서 거르지 않으면 `_package_rows.js`·`api/content.js`가 저장 때 거르는데,
   그러면 담당자는 화면에서 본 사진이 저장 뒤 사라지는 것을 겪는다. */
function firstImage(list) {
  for (const x of (Array.isArray(list) ? list : [])) {
    const url = String((x && x.rprsProdCntntUrlAdrs) || '').trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(url) && url.length <= 500) return url;
  }
  return null;
}

/* 상품 하나를 읽는다. 던지지 않고 **{ok, row, missing, why}**를 준다 —
   부르는 쪽(CLI·API)이 같은 말로 사람에게 전할 수 있어야 한다. */
async function fetchProduct(input) {
  const pkgCd = pkgCdOf(input);
  if (!pkgCd) {
    return { ok: false, why: '상품코드를 못 읽었습니다 — 하나투어 상품 주소나 pkgCd를 넣어 주세요.' };
  }

  let info;
  try {
    info = await post(BASE + '/getPkgProdInfo/v1.00',
      { pkgCd, inpPathCd: INP_PATH, smplYn: 'N', coopYn: 'N', ptnCd: '' });
  } catch (e) {
    /* ⚠ 「없는 상품」이 아니라 **우리가 못 불렀다**는 뜻이다. 갈라서 말한다 */
    return { ok: false, why: '하나투어에 물어보지 못했습니다 (' + e.message + '). 잠시 뒤 다시 눌러 주세요.' };
  }
  const P = (info && info.data) || {};
  if (!P.saleProdCd || !P.saleProdNm) {
    return {
      ok: false,
      why: P.message
        ? ('하나투어가 거절했습니다 — ' + String(P.message).slice(0, 120))
        : '그 코드로는 상품을 못 찾았습니다. 판매가 끝났거나 주소가 다를 수 있습니다.',
    };
  }

  /* 일정·핵심정보는 **없어도 상품은 만든다** — 다만 없다고 말한다 */
  let days = [], core = {};
  try {
    const r = await post(BASE + '/getPkgProdItnrInfo/v1.00', { pkgCd });
    days = (r && r.data && r.data.schdInfoList) || [];
  } catch (e) { days = []; }
  try {
    const r = await post(BASE + '/getPkgTrvlProdCoreInfo/v1.00', { pkgCd, inpPathCd: INP_PATH });
    core = (r && r.data && r.data.pkgKeyBcVo) || {};
  } catch (e) { core = {}; }

  const itinerary = days.map((d, i) => ({
    day: Number(d.schdDay) || i + 1,
    title: (ymd(d.strtDt) ? ymd(d.strtDt).slice(5).replace('-', '/') : '')
      + (d.strDow ? '(' + d.strDow + ')' : '') || ('DAY ' + (i + 1)),
    am: dayLine(d), pm: '', eve: '',
  })).filter((d) => d.am);

  const city = (((P.cityBasInfoList || [])[0]) || {});
  /* ⚠ 금액이 없으면 **비운다.** 다른 칸에서 끌어와 채우지 않는다 — 그 값이 곧 고객가다. */
  const price = Number(P.adtTotlAmt) > 0 ? Number(P.adtTotlAmt) : null;

  /* 🔴 박·일수는 **하나투어가 말해 준 값이 이긴다**(WL). 일정 줄 수로 세면 야간 비행
     상품에서 틀린다(방콕 자유여행 5일 = 실제 3박인데 4박이 된다).
     ⚠ 그래도 폴백은 남긴다 — 없으면 일정 줄 수로 세되, **어디서 온 값인지**를 함께
       돌려준다. 조용히 떨어지면 어느 상품이 지어낸 값인지 나중에 알 수 없다. */
  const dayCnt = Number(P.trvlDayCnt) > 0 ? Number(P.trvlDayCnt) : null;
  const ngtCnt = Number(P.trvlNgtCnt) >= 0 && P.trvlNgtCnt !== null && P.trvlNgtCnt !== undefined
    && Number.isFinite(Number(P.trvlNgtCnt)) ? Number(P.trvlNgtCnt) : null;
  /* ⚠ 이름을 `days`로 짓지 않는다 — 위에서 일정 응답(`schdInfoList`)을 담는 변수가
       이미 `days`다. 같은 이름을 다시 쓰면 「무엇의 일수인가」가 흐려진다. */
  const dayTotal = dayCnt || itinerary.length || null;
  const nightTotal = ngtCnt !== null ? ngtCnt : (dayTotal ? dayTotal - 1 : null);
  const durationFrom = dayCnt ? 'hanatour' : (itinerary.length ? 'itinerary' : null);

  /* 금액 구성 — 상품가 + 제세공과금 = 총액. **검산한다.**
     ⚠ 어긋나면 고치지 않는다. 우리가 아는 것은 「총액이 그쪽이 파는 값」이라는 것뿐이고,
       구성을 우리가 다시 계산해 맞추면 그 순간 지어낸 값이 된다. 어긋났다고 **말한다**. */
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const priceParts = {
    base: num(P.adtAmt), tax: num(P.adtTaduAmt), fuel: num(P.fuelExchgAmt), total: price,
    /* 하나투어 표기 그대로 옮긴다(Y/N). 뜻을 우리가 해석하지 않는다. */
    fuelIncludedFlag: P.bafInclYn == null ? null : String(P.bafInclYn),
    singleAddAmt: num(P.snglAddAmt),
    singleAddNote: stripHtml(P.snglAddAmtDesc) || null,
  };

  const included = expenseLines(P.trvlExpnInclList, 40);
  const excludedBase = expenseLines(P.trvlExpnNoneInclList, 40);
  /* ⚠ 선택경비는 포함도 불포함도 아니다 — 손님이 **더 낼 수 있는 돈**이다.
     둘 중 하나에 넣어야 한다면 불포함 쪽이 맞다(포함에 넣으면 안 받은 돈을 받은 척한다).
     대신 「(선택)」을 붙여 사람이 갈라 볼 수 있게 한다. */
  const choice = expenseLines(P.trvlChcExpnList, 20).map((s) => '(선택) ' + s);
  const excluded = excludedBase.concat(choice);

  const row = {
    id: 'hana-' + String(P.saleProdCd).toLowerCase(),
    source: 'hanatour',
    sourceCode: String(P.saleProdCd),
    rprsProdCd: P.rprsProdCd ? String(P.rprsProdCd) : null,
    title: String(P.saleProdNm).trim(),
    destLabel: String(city.cityNm || P.arrCityNm || city.cntryNm || '').trim() || null,
    days: dayTotal,
    nights: nightTotal,
    durationFrom,
    departDate: ymd(core.depDay) || ymd(P.depDay),
    returnDate: ymd(P.arrDay),
    departCity: String(P.depCityNm || '').trim() || null,
    pricePerPerson: price,
    priceParts,
    /* 🔴 금액 확인일 = **공급사가 이 상품을 마지막으로 고친 날**(WL).
       WJ에서 「오늘로 채우지 않는다」고 한 원칙은 그대로다 — 오늘이 아니라 **그쪽이
       밝힌 날**이라 이 칸의 뜻(「누가 언제 확인해 준 값인가」)에 맞는다.
       못 읽으면 비운다. 사람이 넣는다. */
    priceAsOf: ymdOfDttm(P.updDttm),
    minPax: Number(core.minDepNop) > 0 ? Number(core.minDepNop)
      : (Number(P.minDepNop) > 0 ? Number(P.minDepNop) : null),
    itinerary: itinerary.length ? itinerary : null,
    included: included.length ? included : null,
    excluded: excluded.length ? excluded : null,
    imageUrl: firstImage(P.rppdCntntInfoList),
    origin: '하나투어 상품 ' + P.saleProdCd + (P.rprsProdCd ? ' (대표 ' + P.rprsProdCd + ')' : ''),
  };

  /* 🔴 **못 채운 칸을 조용히 넘기지 않는다.** 화면이 그대로 사람에게 말한다 */
  const missing = [];
  if (!row.pricePerPerson) missing.push('금액');
  if (!row.itinerary) missing.push('일정');
  if (!row.destLabel) missing.push('지역');
  if (!row.included) missing.push('포함사항');
  if (!row.excluded) missing.push('불포함사항');
  if (!row.imageUrl) missing.push('사진');
  if (!row.priceAsOf) missing.push('금액 확인일');
  if (!dayTotal) missing.push('기간');

  /* ⚠ 「못 읽음」과 다른 것 — **읽었는데 앞뒤가 안 맞는 것**이다. 값을 고치지 않고
     사람에게 말한다. 조용히 맞춰 두면 틀린 값이 확인된 값처럼 보인다(결함 생성기 ②). */
  const warnings = [];
  /* 🔴 검산식은 **실측이 정했다**(2026-08-26, 표본 30건 전수):
       상품가(adtAmt) + 제세공과금(adtTaduAmt) + 유류할증료(fuelExchgAmt) = 총액(adtTotlAmt)
     ⚠ 처음에 유류를 빼고 `상품가+제세=총액`으로 짰다가 **30건 중 24건이 「안 맞는다」로
       나왔다.** 코드가 아니라 **내 가정이 틀린 것**이었다 — WD에서 「없는 결함 22건을
       만들어 내고 있었다」와 정확히 같은 자리다. 없는 경고는 소음이 아니라, 진짜가
       생겼을 때 그것을 묻히게 만드는 것이다.
     그래서 이 검산은 **지금 0건**이 정상이고, 울리면 그쪽 응답이 바뀐 것이다. */
  const sum = (priceParts.base || 0) + (priceParts.tax || 0) + (priceParts.fuel || 0);
  if (priceParts.base !== null && price !== null && sum !== price) {
    warnings.push('금액 구성이 총액과 안 맞습니다 — 상품가 ' + (priceParts.base || 0).toLocaleString()
      + ' + 제세 ' + (priceParts.tax || 0).toLocaleString()
      + ' + 유류 ' + (priceParts.fuel || 0).toLocaleString()
      + ' = ' + sum.toLocaleString() + ' ≠ 총액 ' + price.toLocaleString()
      + '. 총액을 그대로 넣었습니다 — 그쪽 응답이 바뀌었을 수 있습니다.');
  }
  /* ⚠ `bafInclYn`으로는 경고하지 않는다. 「N인데 포함사항에 유류할증료가 있다」를
     처음에 엇갈림으로 봤는데, 실측하니 **유류할증료는 어느 쪽이든 총액에 들어 있었다**
     (30건 전수). 고객에게 나가는 값은 총액이므로 이 깃발은 총액을 바꾸지 않는다.
     뜻을 모르는 깃발로 경고를 만들면 담당자가 경고 자체를 안 읽게 된다. */
  if (row.departDate && row.departDate < new Date().toISOString().slice(0, 10)) {
    warnings.push('출발일(' + row.departDate + ')이 이미 지났습니다 — 지난 출발편일 수 있습니다.');
  }
  if (durationFrom === 'itinerary') {
    warnings.push('박·일수를 하나투어가 안 알려줘 일정 줄 수로 셌습니다 — 야간 비행이면 박수가 다를 수 있습니다.');
  }

  /* 이건 「못 읽은 것」이 아니라 **애초에 안 오는 것**이다 — 갈라서 적는다 */
  const notProvided = [];

  return { ok: true, row, missing, warnings, notProvided };
}

/* ⚠ 순수 함수를 내보내는 이유는 **검사가 진짜 코드를 부르게** 하기 위해서다.
   검사가 정규식으로 소스만 보면 「있다」까지밖에 못 재고, 복사해 쓰면 곧 어긋난다. */
module.exports = {
  fetchProduct, pkgCdOf, dayLine, GW, BASE, INP_PATH,
  stripHtml, expenseLines, firstImage, ymdOfDttm,
};

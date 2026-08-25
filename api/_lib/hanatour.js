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

   ⚠ **포함/불포함 사항은 이 경로로 안 온다.** 세 엔드포인트를 다 뒤졌지만 없다.
     일정에서 「식사 불포함」 같은 것을 모아 만들 수는 있지만 그건 **우리가 지어내는
     것**이라 안 한다 — 사람이 적는다. `missing`에 그렇게 적어 둔다.
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
  const dayCount = itinerary.length || null;

  const row = {
    id: 'hana-' + String(P.saleProdCd).toLowerCase(),
    source: 'hanatour',
    sourceCode: String(P.saleProdCd),
    rprsProdCd: P.rprsProdCd ? String(P.rprsProdCd) : null,
    title: String(P.saleProdNm).trim(),
    destLabel: String(city.cityNm || city.cntryNm || '').trim() || null,
    days: dayCount,
    nights: dayCount ? dayCount - 1 : null,
    departDate: ymd(core.depDay),
    pricePerPerson: price,
    minPax: Number(core.minDepNop) > 0 ? Number(core.minDepNop) : null,
    itinerary: itinerary.length ? itinerary : null,
    included: null, excluded: null,
    imageUrl: null,
    origin: '하나투어 상품 ' + P.saleProdCd + (P.rprsProdCd ? ' (대표 ' + P.rprsProdCd + ')' : ''),
  };

  /* 🔴 **못 채운 칸을 조용히 넘기지 않는다.** 화면이 그대로 사람에게 말한다 */
  const missing = [];
  if (!row.pricePerPerson) missing.push('금액');
  if (!row.itinerary) missing.push('일정');
  if (!row.destLabel) missing.push('지역');
  /* 이건 「못 읽은 것」이 아니라 **애초에 안 오는 것**이다 — 갈라서 적는다 */
  const notProvided = ['포함/불포함 사항 (하나투어가 이 경로로 주지 않습니다 — 직접 적어 주세요)'];

  return { ok: true, row, missing, notProvided };
}

module.exports = { fetchProduct, pkgCdOf, dayLine, GW, BASE, INP_PATH };

/* ═══════════════════════════════════════════════════════════════════════════
   하나투어 상품 하나를 읽어 우리 상품 행으로 만든다 (WI) — **읽기만 한다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-25 대표: 「하나투어 홈페이지에서 팔고 있는 패키지 상품 정보를 가져와
   우리 견적서를 만들 수 없나?」

   🔴 **2026-08-24의 결론을 정정한다.** 그때 「홈페이지에서 가져오는 길은 막혔다」고
     적었는데, 그것은 **SSR HTML만 보고 내린 판단**이었다. 페이지에 일정이 없는 것은
     맞다(`window.__NUXT__`의 `botItineraryData`가 null이다) — 브라우저가 뜬 뒤
     API로 따로 부르기 때문이다. **그 API를 직접 불러 보지 않았다.**

   실측으로 확인한 것 (2026-08-25):
     · `getPkgProdInfo`     → 상품명 · **성인 총액** · **대표상품코드** · 지역
     · `getPkgProdItnrInfo` → **일차별 일정** · 식사 · 호텔 · 골프 · 항공 여정
     둘 다 **인증 없이 200**. 하나투어 사이트맵에 상품 17,937개가 공개돼 있고
     robots.txt는 이 경로를 막지 않는다.

   🔴 그리고 8/24의 걸림돌이던 **코드 체계 불일치가 풀린다.** 엑셀은 대표상품코드
     (`MCP1008`)이고 사이트는 판매상품코드(`AAB261261101TWA`)라 17,929개 중 0건이
     맞았는데, `getPkgProdInfo`가 `rprsProdCd`(대표상품코드)를 함께 준다 — **다리가
     API 안에 있었다.**

   ⚠ **문서화된 공개 API가 아니다.** 하나투어 홈페이지가 내부적으로 쓰는 것이라
     예고 없이 바뀔 수 있다. 그래서 이 도구는:
       · **저장하지 않는다.** 만든 행을 화면에 찍기만 한다(`--json`으로 파일에 낼 수 있다).
       · 값이 안 오면 **빈 값으로 채우지 않고 그 사실을 말한다**(결함 생성기 ②).
       · **한 번에 한 건.** 목록을 훑지 않는다 — 파실 상품만 부른다.
   ⚠ **의존성을 쓰지 않는다.** Node 기본 https만 쓴다. 사장님이 쓰실 도구가
     `npm install` 한 번에 깨지면 안 된다(VY에서 xlsx를 안 쓴 것과 같은 이유).
   ⚠ 브라우저에서는 못 부른다 — 우리 Origin에는 **403**이 온다(실측). 서버가 불러야 한다.

   실행:
     node ai-loop/fetch_hanatour.js <URL 또는 pkgCd>
     node ai-loop/fetch_hanatour.js <...> --json out.json
   ═══════════════════════════════════════════════════════════════════════════ */
const https = require('https');
const fs = require('fs');
const path = require('path');

const GW = 'gw.hanatour.com';
const BASE = '/package/pkg/api/common/pkgcomprod';
/* 홈페이지가 쓰는 기본값 — 번들에서 확인했다(`inpPathCd: "H01"===v ? "WPP" : (_||"DCP")`) */
const INP_PATH = 'DCP';

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const jsonAt = (() => { const i = argv.indexOf('--json'); return i >= 0 ? argv[i + 1] : null; })();

if (!target) {
  console.log('쓰는 법: node ai-loop/fetch_hanatour.js <하나투어 상품 URL 또는 pkgCd> [--json out.json]');
  process.exit(1);
}

/* URL이면 pkgCd를 뽑는다. 그냥 코드면 그대로 쓴다.
   ⚠ 코드 모양을 **검사한다** — 아무 문자열이나 그대로 보내면 남의 엔드포인트에
     이상한 값을 던지는 셈이고, 오는 응답도 우리가 못 읽는다. */
function pkgCdOf(s) {
  const m = /[?&]pkgCd=([A-Za-z0-9]+)/.exec(s);
  const cd = m ? m[1] : String(s).trim();
  return /^[A-Za-z0-9]{6,30}$/.test(cd) ? cd : null;
}

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      host: GW, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 20000,
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('JSON이 아니다: ' + buf.slice(0, 80))); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('시간 초과(20초)')); });
    req.on('error', reject);
    req.end(data);
  });
}

/* 일정 한 줄 만들기 — 우리 화면의 모양은 `{day, title, am, pm, eve}`다(pkgParseIti).
   ⚠ 하나투어는 하루를 **여러 항목**으로 준다(도시간이동·관광지·식사·안내문).
     오전/오후/저녁으로 **가르지 않는다** — 문서가 그렇게 나눠 주지 않기 때문이다.
     지어내서 나누면 담당자가 고친 것처럼 보이고, 실제로는 우리가 찍은 값이 된다.
     전부 `am`에 넣고 **사람이 다듬는다**(WA의 PDF 경로와 같은 규칙). */
/* 하루를 한 줄로 (실측으로 칸을 맞췄다 — 2026-08-25):
     [도시간이동]  `depCityNm` (도착은 대개 비어 있다)
     [식사]        `mealTypeNm`(호텔식) 또는 `mealCont`(기내-불포함(유료제공))
     [관광지]      🔴 **`cardNm`이 진짜 이름이다.** `schdCatgNm`은 「관광지」라는 분류명일
                   뿐이라, 그것만 읽으면 일정이 「관광지 / 관광지 / 관광지」가 된다.
     [호텔/크루즈] `cardNm` — **같은 호텔이 여러 번 나온다**(실측 3회). 접는다.
     [텍스트입력]  안내 문구다 — 일정이 아니라 뺀다.
   ⚠ **조식·중식·석식으로 가르지 않는다.** 순서로 짐작할 수는 있지만 문서가 그렇게
     말해 준 것이 아니다(`dtlMealDvNm`은 비어 온다). 지어내면 담당자가 확인한 값처럼
     보이고 실제로는 우리가 찍은 값이 된다 — 나온 순서대로 적고 사람이 다듬는다. */
const CATG_SKIP = /텍스트입력/;
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
    if (card) { sights.push(card); return; }
    if (nm) sights.push(nm);        /* 자유일정처럼 분류명 자체가 뜻을 갖는 것 */
  });
  const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i);
  const parts = [];
  if (moves.length) parts.push(uniq(moves).join(' · '));
  if (sights.length) parts.push(uniq(sights).join(' · '));
  if (meals.length) parts.push('식사: ' + meals.join(' / '));
  /* 호텔은 `htlInfoList`가 비어 오는 일이 있어(실측 null) 카드 이름을 함께 본다 */
  const htl = uniq(stays.concat((d.htlInfoList || [])
    .map((h) => String(h.htlNm || h.htlKorNm || '').trim()).filter(Boolean)));
  if (htl.length) parts.push('숙박: ' + htl.join(' / '));
  return parts.join(' / ');
}

const won = (n) => Number(n || 0).toLocaleString();

(async () => {
  const cd = pkgCdOf(target);
  if (!cd) {
    console.log('🔴 상품코드를 못 읽었습니다 — 하나투어 상품 URL이나 pkgCd를 주세요.');
    console.log('   예: https://www.hanatour.com/trp/pkg/CHPC0PKG0200M200?pkgCd=AAB261261101TWA');
    process.exit(1);
  }
  console.log('상품코드: ' + cd + '  (gw.hanatour.com에 2회 요청)\n');

  let info, itnr;
  try {
    info = await post(BASE + '/getPkgProdInfo/v1.00',
      { pkgCd: cd, inpPathCd: INP_PATH, smplYn: 'N', coopYn: 'N', ptnCd: '' });
  } catch (e) { console.log('🔴 상품 정보를 못 받았습니다 — ' + e.message); process.exit(1); }
  const P = (info && info.data) || {};
  if (P.exception || !P.saleProdCd) {
    /* ⚠ 「없는 상품」과 「우리가 잘못 불렀다」를 갈라서 말한다 */
    console.log('🔴 상품 정보가 비어 있습니다 — ' + (P.message || '응답에 saleProdCd가 없습니다.'));
    console.log('   (판매가 끝난 상품이거나 코드가 틀렸을 수 있습니다)');
    process.exit(1);
  }

  try {
    itnr = await post(BASE + '/getPkgProdItnrInfo/v1.00', { pkgCd: cd });
  } catch (e) {
    console.log('⚠ 일정을 못 받았습니다 — ' + e.message);
    itnr = null;
  }
  const days = ((itnr && itnr.data && itnr.data.schdInfoList) || []);

  const itinerary = days.map((d, i) => ({
    day: Number(d.schdDay) || i + 1,
    title: (d.strtDt ? String(d.strtDt).replace(/^(\d{4})(\d{2})(\d{2})$/, '$2/$3') : '')
      + (d.strDow ? '(' + d.strDow + ')' : '') || ('DAY ' + (i + 1)),
    am: dayLine(d), pm: '', eve: '',
  })).filter((d) => d.am);

  /* 금액 — `adtTotlAmt`(성인 총액)가 엑셀의 「성인총상품가」와 같은 자리다.
     ⚠ 둘 중 **큰 쪽을 고르지 않는다.** 총액이 없으면 비운다 — 지어내면 그게 고객가가 된다. */
  const price = Number(P.adtTotlAmt) || null;

  console.log('─'.repeat(70));
  console.log('상품명      ' + (P.saleProdNm || '(없음)'));
  console.log('판매상품코드  ' + P.saleProdCd);
  console.log('대표상품코드  ' + (P.rprsProdCd || '(없음)') + '   ← 엑셀과 맞추는 다리');
  console.log('성인 총액    ' + (price ? won(price) + '원' : '🔴 못 읽음'));
  console.log('일정        ' + (itinerary.length ? itinerary.length + '일치' : '🔴 못 읽음'));
  console.log('─'.repeat(70));
  itinerary.forEach((d) => {
    console.log('  DAY ' + d.day + ' · ' + d.title);
    console.log('     ' + (d.am || '(비어 있음)').slice(0, 160));
  });

  /* 우리 상품 행 모양 그대로 — `_package_rows.buildPackageRow`가 받는 입력이다.
     ⚠ 여기서 **저장하지 않는다.** 사람이 보고 넣는다(WA의 PDF 경로와 같은 규칙). */
  const row = {
    id: 'hana-' + String(P.saleProdCd).toLowerCase(),
    source: 'hanatour',
    sourceCode: P.saleProdCd,
    title: P.saleProdNm || null,
    destLabel: null,          /* 지역은 아래 「아직 안 채운 것」에 적는다 */
    days: itinerary.length || null,
    nights: itinerary.length ? itinerary.length - 1 : null,
    pricePerPerson: price,
    itinerary: itinerary.length ? itinerary : null,
    included: null, excluded: null,
    imageUrl: null,
    origin: '하나투어 상품 ' + P.saleProdCd + ' (대표 ' + (P.rprsProdCd || '?') + ')',
  };

  /* 🔴 **못 채운 칸을 조용히 넘기지 않는다.** 무엇이 비었는지 세어서 말한다 */
  const missing = [];
  if (!row.title) missing.push('상품명');
  if (!row.pricePerPerson) missing.push('금액');
  if (!row.itinerary) missing.push('일정');
  if (!row.destLabel) missing.push('지역(이 도구가 아직 안 읽는다)');
  if (!row.included) missing.push('포함사항(이 도구가 아직 안 읽는다)');
  console.log('─'.repeat(70));
  console.log(missing.length ? '⚠ 아직 안 채운 칸: ' + missing.join(' · ') : '✅ 필요한 칸이 다 찼습니다');

  if (jsonAt) {
    fs.writeFileSync(path.resolve(jsonAt), JSON.stringify(row, null, 1));
    console.log('저장(파일만): ' + path.resolve(jsonAt));
  }
  console.log('\n⚠ 이 도구는 **운영 DB에 아무것도 넣지 않습니다.**');
})();

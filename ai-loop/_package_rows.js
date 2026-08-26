/* ═══════════════════════════════════════════════════════════════════════════
   공급사 자료 → **`packages` 행**: 형태와 무관한 단일 출처 (VW)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「소규모 견적은 하나투어에서 정보를 빼와 DB를 구축하고 싶다.」
   자료를 **어떤 형태로 받을지는 아직 미정**이다(대표가 하나투어에 확인 중).
   PDF · 엑셀/CSV · 피드/API 셋 중 무엇이 되든 「읽는 법」만 다르고
   **「행으로 만드는 규칙」은 같다.** 그 규칙을 여기 한 곳에 둔다.

   ⚠ 안 그러면 형태마다 같은 안전장치를 다시 쓰게 되고, 한 곳을 빠뜨린다 —
     이 저장소가 여섯 번 당한 결함 생성기 ①이다. 특히 아래 셋은 빠뜨리면
     **고객이 보는 금액이나 날짜가 거짓이 된다.**

   ── 지키는 것 셋 ───────────────────────────────────────────────────────────
   ① **항상 `draft`다.** 고객에게 나가려면 사람이 관리자 화면에서 연다.
   ② **`kind`·`price_basis`를 명시한다.** 예전 투입기는 DB 기본값에 맡겼다 —
      기본값이 바뀌면 투입분이 조용히 1회용(adhoc)이 되거나 그 반대가 된다.
      「기본값이 마침 맞다」에 기대는 코드는 언젠가 틀린다.
   ③ 🔴 **금액 확인일을 오늘로 조용히 채우지 않는다.**
      예전 투입기는 문서에 작성일이 없으면 `new Date()`를 넣었다. `note`에 경고를
      적었지만 **화면·견적서·「N일 전 금액」 배지가 읽는 것은 `note`가 아니라
      `price_asof`다.** 그래서 실측 38건 중 **28건**이 「오늘 확인함」으로 들어가고:
        · 배지가 7일간 안 뜬다 — 확인한 적이 없는데도
        · 고객 견적서에 「금액 확인일 2026-08-24」가 찍힌다 — 우리가 확인한 적 없는 날
        · 대리점이라 그 문서가 분쟁 때 우리 쪽 근거로 쓰인다
      VP가 `price_asof not null`을 「유일한 안전장치」로 세웠는데 자동화가 그것을
      오늘 날짜로 우회한 셈이다(결함 생성기 ②).
      → **기본은 만들지 않는다.** 정말 오늘로 채우려면 부르는 쪽이
        `assumeToday: true`를 **명시**해야 한다(`--apply`·`--force-reseed`와 같은 규칙).
   ═══════════════════════════════════════════════════════════════════════════ */

/* 만들려면 반드시 있어야 하는 것. **없는 것을 지어내지 않는다** — 빈칸으로 만들어 두면
   사람이 채우려고 원본을 다시 열어야 하고, 그럴 바에는 처음부터 안 만든 것이 낫다. */
function requiredMissing(input, opts) {
  const i = input || {};
  const o = opts || {};
  if (!i.title) return '상품명을 못 얻었다';
  if (!(Number(i.pricePerPerson) > 0)) return '1인당 금액을 못 읽었다';
  /* ⚠ **출발일이 필수인 것은 자료의 성격에 달렸다**(VY).
       견적서 PDF  = 특정 여행 한 건이라 출발일이 없으면 무엇을 견적한 건지 모른다 → 필수
       대표상품 리스트 = 「오사카 3일 749,000원」처럼 **날짜를 고객이 고르는 상품**이라
                        출발일 칸이 아예 없다(하나투어 실제 파일 3,550건에 없었다) → 필수 아님
     여기서 무조건 막았더니 실제 파일 **3,550건이 전부 걸렸다.** 부르는 쪽이 정한다.
     ⚠ 기본은 true다 — 기존 PDF 경로의 동작을 바꾸지 않는다. */
  if (o.requireDepart !== false && !i.departDate) return '출발일을 못 읽었다';
  return null;
}

/* 파일 이름의 날짜 — `…_260824.xlsx` · `Hanatour 견적서_김보균님(상해)_251127.pdf`
   ⚠ **문서가 밝힌 작성일이 먼저다.** 이건 그것이 없을 때의 두 번째 후보다.
     실측: 하나투어 견적서 2건 중 1건이 문서에 작성일이 없어 걸렸는데, 파일 이름에는
     `_251127`이 있었다. 그 한 건 때문에 「오늘 날짜를 넣자」로 물러나면 안 된다 —
     파일 이름은 **자료가 스스로 밝힌 날짜**이고 오늘은 아니다.
   ⚠ 두 자리 연도는 2000년대로 읽는다. 「26」이 1926년일 수는 없다.
   ⚠ 어디서 왔는지를 note에 남긴다(`asOfSource`) — 「확인한 날」과 성격이 다르다. */
function dateFromFileName(name) {
  const m = /_(\d{2})(\d{2})(\d{2})(?:\D|$)/.exec(String(name || '').split(/[\\/]/).pop());
  if (!m) return null;
  const y = 2000 + Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const p = (n) => String(n).padStart(2, '0');
  return y + '-' + p(mo) + '-' + p(d);
}

/* 날짜를 YYYY-MM-DD로. 못 읽으면 null (조용히 오늘로 떨어지지 않는다). */
function dayOf(v) {
  if (!v) return null;
  const t = new Date(v);
  if (isNaN(t.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

/* 입력 한 건 → 행 하나. 만들 수 없으면 **왜 못 만들었는지**를 준다.
   opts.assumeToday : 작성일이 없어도 오늘로 채워 만든다(부르는 쪽이 명시해야 한다)
   opts.today       : 테스트가 날짜를 고정할 수 있게 (없으면 실제 오늘) */
function buildPackageRow(input, opts) {
  const i = input || {};
  const o = opts || {};

  const why = requiredMissing(i, o);
  if (why) return { ok: false, why };

  /* 금액 확인일의 후보 순서 — **자료가 밝힌 것부터**, 오늘은 끝까지 안 쓴다.
       ① 문서가 밝힌 작성일
       ② 파일 이름의 날짜 (①이 없을 때만)
       ③ 없으면 만들지 않는다 (`assumeToday`로만 우회) */
  let asOf = dayOf(i.priceAsOf);
  let asOfWhy;
  const fromName = asOf ? null : dateFromFileName(i.fileName || '');
  if (!asOf && fromName) asOf = fromName;

  if (asOf) {
    asOfWhy = fromName
      ? '금액 확인일은 **파일 이름의 날짜**(' + asOf + ')에서 가져왔습니다 — 문서에 작성일이 없었습니다. 실제로 확인한 날로 고쳐 주세요.'
      : '금액 확인일은 문서의 작성일(' + asOf + ')에서 가져왔습니다 — 실제로 확인한 날로 고쳐 주세요.';
  } else if (!o.assumeToday) {
    /* 🔴 여기서 멈추는 것이 이 파일의 핵심이다. 위 머리말 ③ 참고. */
    return {
      ok: false,
      why: '문서에 작성일이 없어 **금액 확인일을 만들 수 없다** — 관리자 화면에서 직접 등록하거나(확인일 한 칸), --assume-today를 명시하세요',
      needsAsOf: true,
    };
  } else {
    asOfWhy = '⚠ 문서에 작성일이 없어 **투입한 날(' + (o.today || dayOf(new Date()))
      + ')을 넣었습니다** — 우리가 확인한 날이 아닙니다. 반드시 확인한 날로 고쳐 주세요.';
  }

  return {
    ok: true,
    row: {
      id: i.id,
      source: i.source || 'hanatour',
      sourceCode: i.sourceCode || null,
      /* ⚠ 눈에 안 보이는 공백을 턴다 — 실제 파일에 상품명 끝에 탭이 여럿 붙어 있었다.
         그대로 두면 고객 화면과 견적서 제목에 빈 자리가 생긴다. */
      title: String(i.title).replace(/\s+/g, ' ').trim(),
      destKey: i.destKey || null,
      destLabel: i.destLabel || i.destKey || null,
      nights: i.nights || null,
      days: i.days || null,
      /* 대표상품은 날짜를 고객이 고른다 — 없으면 null로 두고 화면이 「출발일 미정」으로 낸다 */
      departDate: i.departDate || null,
      pricePerPerson: Math.round(Number(i.pricePerPerson)),
      priceAsOf: asOf || (o.today || dayOf(new Date())),
      validUntil: dayOf(i.validUntil),
      /* ① 항상 작성중 */
      status: 'draft',
      /* ② 명시한다 — 기본값에 기대지 않는다.
         공급사 상품은 **반복 판매(catalog)**이고 값은 **대리점가(agency)**다.
         1회용(adhoc)은 담당자가 관리자 화면에서 만드는 것이고 여기로 오지 않는다. */
      kind: 'catalog',
      priceBasis: 'agency',
      itinerary: (Array.isArray(i.itinerary) && i.itinerary.length) ? i.itinerary : null,
      /* ⚠ 이름을 `included`/`excluded`로 맞춘다 (WR). 예전엔 여기만 `inclItems`였는데,
         서버(`api/content.js`)도 API 응답도 관리자 저장도 전부 `included`다. 이름이
         갈리면 **읽는 쪽이 조용히 못 찾는다** — 실제로 관리자 목록의 「포함사항 없음」
         배지가 그래서 늘 켜져 있었다(결함 생성기 ①). */
      included: (Array.isArray(i.included) && i.included.length) ? i.included : null,
      excluded: (Array.isArray(i.excluded) && i.excluded.length) ? i.excluded : null,
      /* ⚠ **https만 받는다**(VZ). http면 브라우저가 막아 깨진 사진 자리만 남고,
         javascript:·data: 같은 것은 애초에 주소가 아니다. 형식이 아니면 **비운다** —
         「사진 없음」은 화면이 접으면 되지만, 이상한 주소는 그대로 렌더된다. */
      imageUrl: (typeof i.imageUrl === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(i.imageUrl.trim()))
        ? i.imageUrl.trim().slice(0, 500) : null,
      note: asOfWhy + (i.origin ? ' (출처: ' + i.origin + ')' : ''),
      /* 화면 표시용 — DB에 안 들어간다 */
      _asOfFromDoc: !!asOf && !fromName,
      _asOfFromName: !!fromName,
      _dayCount: (i.itinerary || []).length,
    },
  };
}

/* 여러 건. 만든 것과 못 만든 것을 **갈라서** 준다 —
   ⚠ 못 만든 것을 조용히 버리면 「38건 중 10건만 들어갔다」를 아무도 모른다. */
function buildPackageRows(inputs, opts) {
  const rows = [], skipped = [];
  (inputs || []).forEach((i) => {
    const r = buildPackageRow(i, opts);
    if (r.ok) rows.push(r.row);
    else skipped.push({ origin: (i && i.origin) || (i && i.id) || '(이름 없음)', why: r.why, needsAsOf: !!r.needsAsOf });
  });
  return { rows, skipped };
}

module.exports = { buildPackageRow, buildPackageRows, requiredMissing, dayOf, dateFromFileName };

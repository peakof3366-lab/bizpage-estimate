/* ═══════════════════════════════════════════════════════════════════════════
   타당성 11회 검토 (TQ·TW) — **요율에 올려도 되는 값만 통과시킨다**
   ───────────────────────────────────────────────────────────────────────────
   사장님 2026-08-13: 「견적서에서 뽑아온 DB를 **견적서 하나당 10회** 타당성 검토를
   거치고, 통과한 DB는 요율 관리에 업데이트까지 진행해 줘.」

   ⚠ **같은 검사를 10번 돌리는 것은 아무것도 잡지 못한다.** 추출은 결정적이라 같은 입력에
     같은 답이 나온다 — 열 번 돌려도 열 번 같은 값이다. 그래서 **서로 다른 열한 개의 잣대**로
     짰다. 하나가 못 보는 것을 다른 하나가 보게 하는 것이 요점이다.

   열한 개의 잣대 — 각각 **다른 것을 본다**:
     ①  산술 검산      단가 x 수량 x 횟수 = 총금액이 맞는 줄에서 나왔는가 (L2)
     ②  자릿수         그 항목의 현실적 상한 안인가 (pdf_extract LIMITS)
     ③  기준가 대비    그 목적지 요율의 3배를 넘지 않는가 (plausibility.judge)
     ④  동료 대비      같은 목적지 다른 견적서들의 중앙값과 2.5배 안인가 (SK)
     ⑤  전 일정 총액   차량·가이드가 하루치가 아니라 전 일정 총액인가 (SV)
     ⑥  총계 정합      우리가 읽은 줄의 합이 문서 총계를 넘지 않는가 (L4)
     ⑦  1인당 검산     총계 ÷ 인원이 문서에 적힌 1인당과 맞는가
     ⑧  통화·환율      외화였다면 문서가 환율을 밝혔는가 (짐작 환산이 아닌가, SF)
     ⑨  기간 정합      제목의 N박과 날짜 범위가 모순되지 않는가 (SA)
     ⑩  표·조 분리     좌우 두 표나 관광조/골프조가 섞이지 않았는가 (SL·L3.7)
     ⑪  항목 간 비     항목끼리의 비가 코퍼스 분포를 크게 벗어나지 않는가 (TW)
                       ↑ 앞의 열은 전부 「이 칸 하나가 그럴듯한가」를 본다. **한 칸이
                         옆 항목을 삼킨 사고**는 각 칸만 봐서는 안 걸린다 — 그 자리다.
                         기준가를 안 쓰므로 「추정치를 자로 삼는」 순환도 없다.

   ⚠ **판정 규칙을 여기서 새로 짓지 않는다.** 전부 `plausibility.js`와 `pdf_extract.js`가
     이미 쓰는 것을 부른다. 여기서 다시 지으면 화면·감사기와 어긋난다(결함 생성기 ①).
   ⚠ **못 본 것과 통과는 다르다.** 기준가가 없어 판단을 못 한 칸은 `skip`이지 `pass`가
     아니다. 둘을 합치면 「10회 통과」가 「10회 중 8회는 아예 안 봤다」를 감춘다.
   ⚠ 결과 파일은 저장소 밖 규칙을 따른다(.gitignore).

   실행:
     node ai-loop/validate_corpus.js                  검토만
     node ai-loop/validate_corpus.js --show 푸꾸옥     한 목적지 자세히
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const SHOW = argOf('--show');
const JSON_OUT = path.join(ROOT, '.corpus_validated.json');

const destinationRates = require(path.join(ROOT, 'data.js'));
const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
const { destFromName } = require('./_dest_from_name');
/* ⚠ 기준가(`base`)는 운영 DB가 진실이다(VB). 기본값으로 재면 **실측에 맞춰 고쳐 둔
   목적지일수록** 멀쩡한 추출값이 「기준가에서 벗어났다」로 걸린다. */
const { loadOverrides, applyOverrides } = require('./_rate_overrides');

const CELL = {
  airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room',
  meal: 'meal_per_person', vehicle: 'vehicle_large', guide: 'guide_fee',
  sight: 'sightseeing_fee', golf: 'golf_fee',
};
const LABEL = {
  airfare: '항공', fuel: '유류', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광', golf: '골프',
};
/* pdf_extract의 LIMITS와 같은 값이어야 한다 — 다르면 한쪽만 거른다 */
const LIMITS = {
  airfare: 50000000, fuel: 2000000, hotel: 10000000, meal: 1000000,
  vehicle: 10000000, guide: 5000000, sight: 2000000, golf: 2000000,
};
const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());

/* ── ⑪ 항목 간 비 (TW) — **목적지를 몰라도 되는 잣대** ────────────────────────
   앞의 열 잣대는 전부 「이 칸 하나가 그럴듯한가」를 본다. 그래서 **한 칸이 옆 항목을
   삼킨 사고**는 각 칸만 봐서는 안 걸린다 — SB에서 가이드가 746,210(실제 95,000)이 됐던
   것이 그 모양이다. 옆 표의 지상비 숫자가 가이드 줄로 흘러들었는데, 그 값 자체는
   「가이드비로 있을 법한 금액」이라 자릿수·상한을 다 통과한다.

   그런데 항목끼리의 **비**는 목적지가 달라도 잘 안 변한다. 코퍼스 35건 실측:

       호텔 / 가이드   중앙값 1.03   사분위 0.80 ~ 1.21   (폭이 중앙값의 0.41배)
       호텔 / 식비     중앙값 4.89   사분위 3.13 ~ 6.01   (0.59배)
       항공 / 호텔     중앙값 2.22   사분위 1.54 ~ 3.06   (0.68배)

   ⚠ **흩어지는 비는 안 쓴다.** 차량/호텔(1.37배)·관광/식비(1.03배)는 폭이 너무 넓어
     잣대가 못 된다 — 넣으면 오탐만 늘고 곧 아무도 안 읽는다.
   ⚠ **기준가를 안 쓴다는 것이 요점이다.** ③기준가 대비는 잣대로 쓰는 기준가 자체가
     「근거 없는 온라인 추정치」(CLAUDE.md)라 순환이다. 이 잣대는 그 문제가 없다.
   ⚠ **한계도 분명하다** — 두 항목이 **같은 비율로** 함께 틀리면 못 잡는다(예: 환율을
     통째로 잘못 곱한 경우). 그건 ⑧통화환율과 ⑦1인당검산이 보는 자리다. */
/* ⚠ **짝은 「같은 것이 값을 움직이는」 항목끼리여야 한다.** 호텔·식비·가이드는 셋 다
     현지 물가가 움직인다 — 그래서 목적지가 달라도 비가 모인다.
   ⚠ **항공 ÷ 호텔은 넣었다가 뺐다.** 폭(0.68배)만 보면 문턱을 통과하는데, 항공은 **거리**가
     움직이고 호텔은 **현지 물가**가 움직인다. 축이 달라서 중앙값(2.15)이 아시아 단거리에
     끌려가고, 유럽 장거리가 구조적으로 걸린다 — 실측: 로마(이태리) 항공 1,450,000 ÷
     호텔 189,600 = 7.65로 3.6배 벗어남. 둘 다 멀쩡한 값인데 비만 보고 떨어뜨렸다.
     차량 ÷ 호텔·관광 ÷ 식비를 뺀 것과 같은 이유이되, 이쪽은 **폭이 아니라 축**이 문제다. */
const SHAPE_PAIRS = [
  { a: 'hotel', b: 'guide', label: '호텔 ÷ 가이드' },
  { a: 'hotel', b: 'meal', label: '호텔 ÷ 식비' },
];
/* 코퍼스 중앙값에서 이 배수 넘게 벗어나면 확인 대상. 사분위 폭(0.41~0.68배)의 바깥에서
   넉넉히 잡는다 — 성수기·등급으로 2배까지는 실제로 벌어진다. */
const SHAPE_SPREAD = 3;

/* 검사 하나의 결과. **pass / fail / skip 셋이다** — skip을 pass로 세지 않는다. */
const P = (why) => ({ r: 'pass', why: why || '' });
const F = (why) => ({ r: 'fail', why });
const S = (why) => ({ r: 'skip', why });

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  const ovRes = await loadOverrides();
  console.log('요율 오버라이드 ' + applyOverrides(destinationRates, ovRes.overrides) + '칸 적용 — ' + ovRes.from);
  console.log('견적서 ' + files.length + '건 · 칸마다 11회 검토… (2~4분)\n');

  /* 1차 — 전부 추출한다. ④(동료 대비)는 **다른 견적서들을 알아야** 하므로 두 번 돈다. */
  const docs = [];
  for (const f of files) {
    try {
      const r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {});
      docs.push({ f, r, dest: destFromName(f, r.text).key });
    } catch (e) { /* 못 읽는 문서는 검토 대상이 아니다 */ }
  }
  /* 동료 표본 — 목적지별·칸별. **검산된 값만** 기준이 된다(SN). */
  const peers = {};
  docs.forEach(({ r, dest }) => {
    if (!dest) return;
    Object.keys(CELL).forEach((k) => {
      const v = (r.values || {})[k];
      const via = ((r.evidence || {})[k] || {}).via;
      if (v == null || !(v > 0) || !PLAUSIBILITY.isTrusted(via)) return;
      peers[dest] = peers[dest] || {};
      (peers[dest][k] = peers[dest][k] || []).push(v);
    });
  });

  /* ⑪의 기준 — **코퍼스 전체**에서 항목 간 비의 중앙값을 만든다.
     ⚠ 검산된 값만 쓴다(SN 그대로). 검산 안 된 값으로 기준을 만들면 그 오독이 기준이 된다. */
  const trusted = (r, k) => {
    const v = (r.values || {})[k];
    const via = ((r.evidence || {})[k] || {}).via;
    return (v > 0 && PLAUSIBILITY.isTrusted(via)) ? v : null;
  };
  /* ⚠ **짝이 틀렸을 때 이쪽을 탓하면 안 된다.** ⑪은 「비가 벗어났다」만 말할 뿐
     **두 항목 중 어느 쪽이 문제인지 모른다.** 실측으로 바로 겪었다:
       로마 호텔 189,600이 걸렸는데, 원인은 짝인 **가이드 2,528,000이 전 일정 총액**이라
       비가 0.07이 된 것이다(SV가 이미 아는 값이다). 호텔은 멀쩡한데 함께 떨어졌다.
       보홀 호텔 214,500도 같다 — 짝인 가이드 842,270이 기준가의 3.8배다.
     → 짝으로 쓸 값은 **그 자체로 이미 이상하지 않은 것**만 쓴다. 앞 잣대가 「이상하다」고
       말한 값을 자로 삼으면, 그 오독이 멀쩡한 옆 칸까지 떨어뜨린다. */
  const partnerOk = (r, dest, k) => {
    const v = trusted(r, k);
    if (!v) return null;
    const dRow = dest ? destinationRates.find((d) => d.destination_key === dest) : null;
    const base = dRow ? Number(dRow[CELL[k]]) || 0 : 0;
    if (base) {
      const j = PLAUSIBILITY.judge(v, [], base);
      if (j.level === 'check') return null;                       /* ③에 걸린 값 */
      if (PLAUSIBILITY.PER_DAY_FIELDS.indexOf(k) >= 0) {
        const ev = (r.evidence || {})[k] || {};
        if (PLAUSIBILITY.judgeTripTotal(v, base, ev.duration)) return null;  /* ⑤에 걸린 값 */
      }
    }
    return v;
  };

  const shapeBase = {};
  SHAPE_PAIRS.forEach((p) => {
    const rs = [];
    docs.forEach(({ r, dest }) => {
      const a = partnerOk(r, dest, p.a), b = partnerOk(r, dest, p.b);
      if (a && b) rs.push(a / b);
    });
    shapeBase[p.a + '/' + p.b] = rs.length >= 5 ? PLAUSIBILITY.median(rs) : null;
    if (rs.length < 5) console.log('  ⚠ ' + p.label + ' 표본 ' + rs.length + '건 — 기준을 만들지 않는다');
  });

  const out = [];
  docs.forEach(({ f, r, dest }) => {
    const rec = r.reconciliation || {};
    const dRow = dest ? destinationRates.find((d) => d.destination_key === dest) : null;
    Object.keys(CELL).forEach((k) => {
      const v = (r.values || {})[k];
      if (v == null || !(v > 0)) return;
      const ev = (r.evidence || {})[k] || {};
      const base = dRow ? Number(dRow[CELL[k]]) || 0 : 0;
      const mine = (peers[dest] && peers[dest][k]) || [];
      const others = mine.filter((x) => x !== v);
      const checks = {};

      /* ① 산술 검산 — via가 rule/calc/doc이면 검산된 줄에서 나온 값이다 */
      checks['①산술검산'] = PLAUSIBILITY.isTrusted(ev.via)
        ? P(ev.via) : F('검산 안 된 값이다(' + (ev.via || '출처 없음') + ')');

      /* ② 자릿수 */
      checks['②자릿수'] = v <= LIMITS[k] ? P() : F('상한 ' + won(LIMITS[k]) + ' 초과');

      /* ③ 기준가 대비 — 기준가가 없으면 **판단하지 않는다**(그 지역 첫 견적서) */
      if (!base) checks['③기준가대비'] = S('이 목적지 기준가가 없다');
      else {
        const j = PLAUSIBILITY.judge(v, [], base);
        checks['③기준가대비'] = j.level === 'check'
          ? F(PLAUSIBILITY.describe(j, LABEL[k]).replace(/\*\*/g, '')) : P();
      }

      /* ④ 동료 대비 — 동료가 둘은 있어야 중앙값이 뜻을 갖는다(MIN_PEERS) */
      if (others.length < PLAUSIBILITY.MIN_PEERS) checks['④동료대비'] = S('동료 ' + others.length + '건');
      else {
        const j = PLAUSIBILITY.judge(v, others, 0);
        checks['④동료대비'] = j.level === 'check'
          ? F(PLAUSIBILITY.describe(j, LABEL[k]).replace(/\*\*/g, '')) : P('동료 ' + others.length + '건');
      }

      /* ⑤ 전 일정 총액 — **차량·가이드에만** 뜻이 있다(1일 단가라서) */
      if (PLAUSIBILITY.PER_DAY_FIELDS.indexOf(k) < 0) checks['⑤전일정총액'] = S('1일 단가 항목이 아니다');
      else if (!base) checks['⑤전일정총액'] = S('기준가가 없다');
      else {
        const t = PLAUSIBILITY.judgeTripTotal(v, base, ev.duration);
        checks['⑤전일정총액'] = t
          ? F(PLAUSIBILITY.describeTripTotal(t, LABEL[k]).replace(/\*\*/g, '')) : P();
      }

      /* ⑥ 총계 정합 — 우리가 읽은 줄의 합이 문서 총계를 넘으면 두 번 셌다는 뜻이다 */
      const denom = r.grandTotal || r.itemsTotal || 0;
      const rowSum = (r.candidates || []).filter((c) => !c.unconvertible)
        .reduce((n, c) => n + (c.total || 0), 0);
      if (!denom) checks['⑥총계정합'] = S('문서 총계를 못 읽었다');
      else checks['⑥총계정합'] = rowSum <= denom * 1.05
        ? P() : F('읽은 줄 합이 총계의 ' + (rowSum / denom * 100).toFixed(0) + '%다(두 번 셌을 수 있다)');

      /* ⑦ 1인당 검산 — 문서가 스스로 채점표다(견적 총액 ÷ 인원 = 1인당).
         ⚠ **`itemsTotal`을 쓰면 안 된다.** SH에서 갈라 놓은 이유가 그것이다 —
           원가 시트의 「합계」는 마진이 빠진 **항목 합계**라, 그걸 총액으로 받으면
           1인 판매가와 당연히 어긋나고 멀쩡한 값이 무더기로 탈락한다(실제로 91칸이
           그렇게 걸렸다). 견적 총액(`grandTotal`)이 있을 때만 이 검사를 한다. */
      if (!r.perPerson || !r.pax || !r.grandTotal) checks['⑦1인당검산'] = S('견적 총액·1인당·인원 중 없는 것이 있다');
      else {
        const calc = r.grandTotal / r.pax;
        const off = Math.abs(calc - r.perPerson) / r.perPerson;
        checks['⑦1인당검산'] = off <= 0.15
          ? P('오차 ' + (off * 100).toFixed(1) + '%')
          : F('총계÷인원(' + won(calc) + ')과 문서의 1인당(' + won(r.perPerson) + ')이 '
            + (off * 100).toFixed(0) + '% 어긋난다');
      }

      /* ⑧ 통화·환율 — **짐작해서 환산한 값이 아닌가.** 문서가 환율을 밝혔어야 한다(SF) */
      if (!ev.fx) checks['⑧통화환율'] = P('원화 줄이다');
      else if (r.fxFromDocument && r.fxFromDocument[ev.fx.currency]) checks['⑧통화환율'] = P('문서에 적힌 환율');
      else checks['⑧통화환율'] = F('문서에 환율이 없는데 ' + ev.fx.currency + '로 환산된 값이다');

      /* ⑨ 기간 정합 — 일수는 금액에 거의 정비례한다.
         ⚠ **일수로 나누는 칸에만 뜻이 있다.** 호텔 1박 단가나 항공 1인 운임은 문서의
           N박 표기가 흔들려도 값이 안 변한다. 전부에 걸면 46건 중 절반이 근거 없이
           탈락한다(실제로 56칸이 그렇게 걸렸다).
         ⚠ 모순 자체는 추출기가 이미 **날짜 범위 쪽으로 풀었다**(SA에서 「틀린 쪽은
           언제나 제목」이 실측으로 확인됐다). 그래도 식비는 그 일수로 나눈 값이라
           사람이 한 번 봐야 한다. */
      const nc = r.dates && r.dates.nightsConflict;
      if (k !== 'meal') checks['⑨기간정합'] = S('일수로 나누는 칸이 아니다');
      else checks['⑨기간정합'] = nc
        ? F('제목의 ' + nc.labelled + '박과 날짜 범위 ' + nc.fromDates + '박이 달라 일수가 흔들린다')
        : P();

      /* ⑩ 표·조 분리 — 섞이면 1인당이 통째로 어긋난다(SL·L3.7) */
      if (r.sideTables && !r.crews) checks['⑩표조분리'] = P('좌우 두 표를 갈랐다');
      else if (r.crews && r.crews.split) checks['⑩표조분리'] = P('관광조·골프조를 갈랐다');
      else checks['⑩표조분리'] = P('한 표·한 조 문서다');

      /* ⑪ 항목 간 비 — 이 칸이 들어가는 **안정적인 비**를 전부 본다.
         ⚠ 상대 칸이 없거나 기준이 없으면 **판단하지 않는다**(skip). 못 본 것을 통과로
           세면 「11회 통과」가 「그중 몇 번은 아예 안 봤다」를 감춘다. */
      const shapeNotes = [];
      let shapeSeen = 0;
      SHAPE_PAIRS.forEach((p) => {
        if (p.a !== k && p.b !== k) return;
        const base = shapeBase[p.a + '/' + p.b];
        /* ⚠ **짝은 그 자체로 이상하지 않은 값만 쓴다**(partnerOk 주석 참고).
           내 쪽은 trusted면 충분하다 — 지금 재는 대상이 나이기 때문이다. */
        const other = p.a === k ? p.b : p.a;
        if (!trusted(r, k) || !partnerOk(r, dest, other)) return;
        const av = trusted(r, p.a) || partnerOk(r, dest, p.a);
        const bv = trusted(r, p.b) || partnerOk(r, dest, p.b);
        if (!base || !av || !bv) return;
        shapeSeen++;
        const ratio = av / bv;
        const dev = ratio > base ? ratio / base : base / ratio;
        if (dev >= SHAPE_SPREAD) {
          shapeNotes.push(p.label + '가 ' + ratio.toFixed(2)
            + '로 코퍼스 중앙값(' + base.toFixed(2) + ')의 ' + dev.toFixed(1) + '배 벗어난다');
        }
      });
      checks['⑪항목간비'] = !shapeSeen ? S('견줄 상대 항목이 없다')
        : shapeNotes.length ? F(shapeNotes.join(' / ')) : P(shapeSeen + '개 비를 봤다');

      const list = Object.entries(checks);
      const fails = list.filter(([, c]) => c.r === 'fail');
      const skips = list.filter(([, c]) => c.r === 'skip');
      /* 그 값이 **어느 줄에서 어떻게** 나왔는지 함께 남긴다 — 뒤에서 「단위가 우리 칸과
         같은가」를 따지려면 값만으로는 못 한다(TZ). 값이 맞아도 뜻이 다를 수 있다. */
      const srcRow = (r.candidates || []).find((c) => c.idx === (ev.rowIdxs || [])[0]
        || (ev.rowIdxs == null && String(c.line || '') === String(ev.line || '')));
      out.push({
        file: f, dest, cell: k, label: LABEL[k], value: v, rateCell: CELL[k], base,
        pax: r.pax || null,
        line: String(ev.line || (srcRow && srcRow.line) || '').slice(0, 140),
        qty: srcRow ? Math.max(Number(srcRow.qty) || 0, Number(srcRow.times) || 0) : null,
        pass: list.length - fails.length - skips.length,
        skip: skips.length, fail: fails.length,
        ok: fails.length === 0,
        checks: Object.fromEntries(list.map(([n, c]) => [n, c.r + (c.why ? ' — ' + c.why : '')])),
        failWhy: fails.map(([n, c]) => n + ': ' + c.why),
      });
    });
  });

  /* ── 표 ── */
  const shown = SHOW ? out.filter((o) => o.dest === SHOW) : out;
  if (SHOW) {
    shown.forEach((o) => {
      console.log('▪ ' + o.label + ' ' + won(o.value) + '   ' + (o.ok ? '✅ 통과' : '❌ 걸림')
        + '  (통과 ' + o.pass + ' · 못 봄 ' + o.skip + ' · 걸림 ' + o.fail + ')  ' + o.file.slice(0, 40));
      Object.entries(o.checks).forEach(([n, v]) => console.log('      ' + n.padEnd(12) + v));
    });
  }

  const okRows = out.filter((o) => o.ok);
  const bad = out.filter((o) => !o.ok);
  console.log('═'.repeat(100));
  console.log('검토한 칸 ' + out.length + '개 (견적서 ' + docs.length + '건)');
  console.log('  ✅ 열한 잣대를 전부 지난 칸  ' + okRows.length + '개');
  console.log('  ❌ 하나라도 걸린 칸        ' + bad.length + '개');
  const avgSkip = out.reduce((n, o) => n + o.skip, 0) / (out.length || 1);
  console.log('  ⚠ 칸당 평균 **못 본 검사 ' + avgSkip.toFixed(1) + '개** — 통과가 아니라 판단을 못 한 것이다');

  /* 어느 잣대가 무엇을 잡는가 — 잣대가 일을 하고 있는지 본다.
     ⚠ 아무것도 안 잡는 잣대는 **잡히는지 확인하지 않은 안전망**이다(결함 생성기 ③). */
  const byCheck = {};
  out.forEach((o) => Object.entries(o.checks).forEach(([n, v]) => {
    byCheck[n] = byCheck[n] || { pass: 0, fail: 0, skip: 0 };
    byCheck[n][v.split(' ')[0]]++;
  }));
  console.log('\n  ── 잣대별로 무엇을 잡았나 ──');
  Object.entries(byCheck).forEach(([n, c]) => {
    console.log('   ' + n.padEnd(12) + '통과 ' + String(c.pass).padStart(4)
      + ' · 걸림 ' + String(c.fail).padStart(3) + ' · 못 봄 ' + String(c.skip).padStart(4)
      + (c.fail === 0 ? '   ⚠ 아무것도 안 잡았다' : ''));
  });

  console.log('\n  ── 걸린 칸 (요율에 올리지 않는다) ──');
  bad.slice(0, 20).forEach((o) => {
    console.log('   ' + String(o.dest || '—').padEnd(10) + o.label.padEnd(5) + won(o.value).padStart(12)
      + '  ' + o.failWhy.join(' / ').slice(0, 88));
  });
  if (bad.length > 20) console.log('   … ' + (bad.length - 20) + '개 더');

  fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1), 'utf8');
  console.log('\n저장: ' + JSON_OUT + ' (' + out.length + '행)');
  console.log('다음: node ai-loop/apply_rate_updates.js --dry-run   (통과한 칸만 요율 제안으로 만든다)');
})();

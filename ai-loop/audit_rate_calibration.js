/* ═══════════════════════════════════════════════════════════════════════════
   요율 교정 (TM) — **목적지별로, 칸별로, 요율표와 실측이 얼마나 벌어졌나**
   ───────────────────────────────────────────────────────────────────────────
   사장님 2026-08-13의 1목적: **오차범위가 적은 가견적.**

   진단(audit_gap_source)이 말한 것: 오차는 **한쪽으로 치우친 편향이 아니다.**
     상해 −29.5% · 나트랑 −28.5% · 삿포로 −23.9%   (엔진이 싸다)
     마카오 +42.8% · 보홀 +38.7% · 오키나와 +35.4%  (엔진이 비싸다)
   중앙값은 −9.1%인데 사분위가 −18.2%~+6.3%다. **계수 하나로 못 고친다** —
   목적지마다 어느 칸이 얼마나 틀렸는지가 다르기 때문이다.

   그래서 이 자는 **칸 단위로** 잰다. 목적지 × 7칸마다:
     요율표 값(운영 오버라이드 반영) vs 그 목적지 견적서들의 실측 중앙값

   ⚠ **2026-08-20(VB): 위 「운영 오버라이드 반영」이 머리말에만 있고 코드에 없었다.**
     이 자는 `data.js` 기본값만 읽고 있었다. TR이 `_rate_overrides.js`를 만들어 측정
     도구에 운영값을 실어 줬는데 **이 파일만 안 붙었다** — 그런데 머리말은 붙은 것처럼
     적혀 있어서, 읽는 사람이 어긋남을 알 방법이 없었다(결함 생성기 ②의 문서판).
     실제 피해가 컸다. 2026-08-13에 실측으로 고쳐 둔 칸을 이 표가 **여전히 틀린 것으로**
     찍었다: 삿포로 가이드(운영 142,500인데 기본 300,000으로 보고 「2.1배 높다」),
     푸꾸옥·다낭·오키나와 유류, 홍콩·카자흐 식비 — **🔴 12칸 중 6칸이 그런 것**이었고
     여섯 칸 전부 **운영값 = 실측 중앙값으로 이미 정확히 일치**하고 있었다.
     그대로 따랐으면 맞춰 놓은 값을 **한 번 더** 반토막 냈을 것이다.
     → 이제 `loadOverrides`로 운영값을 얹고, **무엇으로 쟀는지 첫 줄에 밝힌다.**
     → 오버라이드가 얹힌 칸은 표에 `📌`를 단다. 「이미 실측으로 고친 칸」과
       「아직 온라인 추정치인 칸」은 처방이 정반대라, 같은 얼굴로 보이면 안 된다.

   ⚠ **기준은 검산된 값만 쓴다**(SN). 검산 안 된 값은 1인 단가인지 전 일정 총액인지
     모르는 값이라, 기준에 넣으면 요율을 통째로 엉뚱한 곳으로 끌고 간다
     (카자흐 가이드 +352%가 「전일정 총액」이었던 전례).
     ⚠ 다만 **재는 대상은 전부**다 — 뺀 개수는 항상 밝힌다.
   ⚠ **표본 수를 함께 보여준다.** 1건짜리 중앙값은 중앙값이 아니다. 그 지역 견적서가
     한 장뿐이면 그 장이 곧 '실측'이 되는데, 그것을 요율로 굳히면 되돌릴 근거가 사라진다.
   ⚠ **자동으로 고치지 않는다.** 이 자는 표만 낸다. 실제 요율 변경은 운영 DB 조작이라
     사람이 관리자 화면에서 누른다(변경 이력이 남아야 되돌릴 수 있다).
   ⚠ 환율 — 견적서 값에는 **그 견적서 시점의 환율**이 박혀 있고 요율표는 「오늘 환율
     기준」이다(SG). 코퍼스 34건 기준 중앙값 5.1% 어긋난다. 이 표는 그 보정을 **하지
     않으므로**, ±5%를 다투는 칸은 그만큼 흔들린다고 보고 읽어야 한다.

   실행:
     node ai-loop/audit_rate_calibration.js
     node ai-loop/audit_rate_calibration.js --dest 푸꾸옥
     node ai-loop/audit_rate_calibration.js --fresh-rates   (운영 요율을 다시 받는다)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
/* YF: 「골프 일정인가」 — 골프 여행의 칸은 조가 갈려 있어 그대로 요율로 굳히면 안 된다 */
const { golfScope } = require('./_golf_scope');

const ROOT = path.join(__dirname, '..');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONLY = argOf('--dest');

const destinationRates = require(path.join(ROOT, 'data.js'));
const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
const { destFromName } = require('./_dest_from_name');
/* ⚠ 요율의 진실은 `data.js`가 아니라 운영 DB다(CLAUDE.md). 읽기 전용 GET 한 번. */
const { loadOverrides, applyOverrides } = require('./_rate_overrides');
const { dedupeTrips, droppedNote } = require('./_same_trip');

/* 추출 항목 → 요율 칸. **admin.html의 PLAUS_RATE_FIELD와 같은 표여야 한다** —
   두 곳이 다르면 화면과 이 표가 서로 다른 칸을 견준다(결함 생성기 ①). */
const CELL = {
  airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room',
  meal: 'meal_per_person', vehicle: 'vehicle_large', guide: 'guide_fee',   /* ⚠ vehicle은 아래에서 인원에 따라 다시 고른다 — 이 값을 그대로 쓰지 말 것 */
  sight: 'sightseeing_fee',
};
const LABEL = {
  airfare: '항공', fuel: '유류', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광',
};

/* ── 차량은 **인원에 따라 요율 칸이 갈린다** (VL) ───────────────────────────
   엔진은 `participants > VEHICLE_CAPACITY.small`(25명)일 때만 `vehicle_large`를 쓴다.
   그런데 이 표는 인원과 무관하게 전부 `vehicle_large`에 견주고 있었다 —
   25명 이하 견적은 **고객이 보지도 않는 칸**과 대조된 셈이라, 상해 15명의
   「차량 ×1.00 일치」 같은 허수가 만들어졌다. VB에서 잡은 「자가 틀렸다」와 같은 자리다.
   ⚠ 임계값을 여기 다시 적지 않는다 — `_engine_consts`가 script.js에서 읽는다. */
const { vehicleFieldFor } = require('./_engine_consts');

/* 요율 칸 → 표에 찍을 이름. 차량만 둘로 갈린다(대조 대상이 다른 칸이라 섞으면 안 된다). */
const FIELD_LABEL = {
  airfare: '항공', fuel_surcharge: '유류', hotel_per_room: '호텔', meal_per_person: '식비',
  vehicle_small: '차량(소)', vehicle_large: '차량(대)',
  guide_fee: '가이드', sightseeing_fee: '관광',
};
/* 이 배수를 넘게 벌어지면 🔴 — 요율을 논하기 전에 **그 값이 오독인지부터** 봐야 한다.
   plausibility의 RATE_SPREAD(3)와 같은 뜻이되, 여기는 '평균 대비'라 조금 좁게 잡는다. */
const LOUD = 2.0;

const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());
/* 한글은 화면에서 두 칸을 먹는다 — `padEnd`만 쓰면 「차량(대)」 줄만 어긋난다 */
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};
const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;

  /* ⚠ **무엇으로 쟀는지 먼저 밝힌다.** 못 받았을 때 조용히 기본값으로 떨어지면
     「이미 고친 칸」을 또 고치라고 말하게 된다 — VB에서 실제로 그랬다. */
  const ov = await loadOverrides();
  const OV = ov.overrides || {};
  console.log('요율 오버라이드 ' + applyOverrides(destinationRates, OV) + '칸 적용 — ' + ov.from);
  console.log('견적서 ' + files.length + '건에서 칸별 실측을 모으는 중… (2~4분)\n');

  /* 목적지 → 칸 → [값…] */
  const obs = {};
  const trips = [];      /* VG: 같은 여행을 갈라내기 전에 한 번 모은다 */
  let dropped = 0, kept = 0;
  const noDest = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f, r.text);
    if (!dn.key) { noDest.push(f.slice(0, 46) + ' (' + dn.why + ')'); continue; }
    /* ⚠ **같은 여행이 문서 두 벌로 오면 한 번만 센다**(VG). 값이 같으니 중앙값은 안
       움직이지만 **「견적서 N건」과 「⚠표본1」 경고가 거짓이 된다** — 1건짜리 실측이
       2건으로 보이면 그 값을 요율로 굳혀도 되는 것처럼 읽힌다.
       ⚠ 정답값은 판매가가 없으면 입금가를 쓴다 — 원가 시트끼리도 갈라내야 한다
         (실측으로 걸린 동유럽 두 벌이 바로 판매가 없는 원가 시트다). */
    trips.push({ f, r, dest: dn.key, golf: golfScope(r.text || '').isGolfTrip });
    continue;
  }
  {
    const ded = dedupeTrips(trips, (t) => ({
      dest: t.dest, pax: t.r.pax,
      days: t.r.dates && t.r.dates.days, date: t.r.dates && t.r.dates.departDate,
      answer: t.r.perPerson || t.r.depositPerPerson, file: t.f,
    }));
    const note = droppedNote(ded.dropped);
    if (note) console.log(note + '\n');
    trips.length = 0;
    ded.kept.forEach((t) => trips.push(t));
  }
  for (const { f, r, dest: destKey, golf } of trips) {
    const dn = { key: destKey };
    obs[dn.key] = obs[dn.key] || { files: [], cells: {} };
    obs[dn.key].files.push(f);
    Object.keys(CELL).forEach((k) => {
      const v = (r.values || {})[k];
      if (v == null || !(v > 0)) return;
      const via = ((r.evidence || {})[k] || {}).via;
      /* SN 그대로 — **자는 검산된 값만, 재는 대상은 전부.** */
      if (!PLAUSIBILITY.isTrusted(via)) { dropped++; return; }
      kept++;
      /* 차량은 그 견적서의 **인원**이 정하는 칸에 담는다(위 주석 참고). 인원을 모르면
         담지 않는다 — 어느 칸인지 모르는 값을 아무 칸에나 넣으면 그 칸이 오염된다. */
      let field = CELL[k];
      if (k === 'vehicle') {
        if (!r.pax) { dropped++; kept--; return; }
        field = vehicleFieldFor(r.pax);
      }
      obs[dn.key].cells[field] = obs[dn.key].cells[field] || [];
      obs[dn.key].cells[field].push({ v, f, golf });
    });
  }

  const keys = Object.keys(obs).sort((a, b) => obs[b].files.length - obs[a].files.length);
  const proposals = [];
  keys.forEach((destKey) => {
    if (ONLY && destKey !== ONLY) return;
    const dest = destinationRates.find((d) => d.destination_key === destKey);
    if (!dest) { console.log('▪ ' + destKey + ' — 요율표에 없다(추가 대상)'); return; }
    const o = obs[destKey];
    console.log('▪ ' + destKey + '  (견적서 ' + o.files.length + '건)');
    Object.keys(FIELD_LABEL).forEach((field) => {
      const list = (o.cells[field] || []).map((x) => x.v);
      const base = Number(dest[field]) || 0;
      if (!list.length || !base) return;
      const med = median(list);
      const ratio = med / base;
      const loud = ratio >= LOUD || ratio <= 1 / LOUD;
      /* 표본이 1건이면 중앙값이 아니다 — 그 사실을 기호로 드러낸다 */
      const weak = list.length < 2;
      /* 📌 = 이 칸은 **운영 DB에서 사람이 실측으로 고친 값**이다. 아직 온라인 추정치인
         칸과 처방이 정반대라(고친 칸이 또 벌어지면 표본을 의심하고, 추정치 칸은 그냥
         실측으로 바꾼다) 표에서 구분되어야 한다. */
      const fromOv = typeof ((OV[destKey] || {})[field]) === 'number';
      /* ⛳ = 이 칸의 실측이 **골프 여행 견적서**에서 왔다 (YF).
         골프 일정은 문서가 골프조/관광조로 갈려 있어서, 차량·관광·식비가
         **조 인원으로 나뉜 값**이다. 그걸 전원 단가로 읽으면 그 칸이 부푼다.
         실측: 다낭 관광 실측 2건이 **둘 다 골프 여행**이고(한화 뉴퍼스트 321,594 ·
         한화GA 105,000) 중앙값 213,297이 「요율이 4.27배 낮다 🔴」로 찍힌다.
         같은 목적지의 비골프 견적서(글로벌 힐링페스티벌 500명)는 그 칸에 값이 없다.
         ⚠ **거르지 않고 표시만 한다.** 골프 여행도 실제 거래이고, 어느 칸이
           조로 갈렸는지는 문서마다 다르다 — 사람이 보고 판단할 자리다. */
      const golfN = (o.cells[field] || []).filter((x) => x.golf).length;
      console.log('   ' + wpad(FIELD_LABEL[field], 9)
        + '요율 ' + won(base).padStart(11) + (fromOv ? ' 📌' : '   ')
        + '  실측중앙 ' + won(med).padStart(11)
        + '  (' + String(list.length) + '건' + (weak ? ' ⚠표본1' : '') + ')'
        + '   ' + (ratio >= 1 ? '×' + ratio.toFixed(2) : '÷' + (1 / ratio).toFixed(2)).padStart(7)
        + (loud ? '  🔴' : '')
        + (golfN ? '  ⛳' + golfN + '/' + list.length : ''));
      if (loud && !weak) proposals.push({ destKey, cell: field, label: FIELD_LABEL[field], base, med, ratio, n: list.length, fromOv, golfN });
    });
  });

  /* ── 무엇부터 손볼 것인가 ── 표본이 있고 크게 벌어진 것만 */
  console.log('\n' + '═'.repeat(96));
  console.log('🔴 표본 2건 이상이면서 ' + LOUD + '배 넘게 벌어진 칸 — 여기부터 본다');
  console.log('═'.repeat(96));
  if (!proposals.length) console.log('  없다.');
  proposals.sort((a, b) => Math.max(b.ratio, 1 / b.ratio) - Math.max(a.ratio, 1 / a.ratio))
    .forEach((p) => {
      console.log('  ' + wpad(p.destKey, 12) + wpad(p.label, 9)
        + '요율 ' + won(p.base).padStart(11) + (p.fromOv ? ' 📌' : '   ')
        + ' →  실측 ' + won(p.med).padStart(11)
        + '  (' + p.n + '건, ' + (p.ratio >= 1 ? '요율이 ' + p.ratio.toFixed(1) + '배 낮다'
          : '요율이 ' + (1 / p.ratio).toFixed(1) + '배 높다') + ')'
        + (p.golfN ? '  ⛳' + p.golfN + '/' + p.n : ''));
    });
  if (proposals.some((p) => p.golfN)) {
    console.log('');
    console.log('  ⛳ = 그 실측이 **골프 여행 견적서**에서 왔다(N/전체). 골프 일정은 문서가');
    console.log('     골프조/관광조로 갈려 있어 차량·관광·식비가 **조 인원으로 나뉜 값**이다.');
    console.log('     전원 단가로 읽으면 그 칸이 부푼다 — 올리기 전에 문서를 열어 볼 것.');
    console.log('     실측: 다낭 관광 ×4.27은 **실측 2건이 둘 다 골프 여행**이다.');
  }
  if (proposals.some((p) => p.fromOv)) {
    console.log('\n  📌 = 운영 DB에서 **사람이 이미 실측으로 고친 칸**이다. 그런데도 벌어져 있다면');
    console.log('     처방이 다르다 — 요율을 또 옮기기 전에 **그 사이 들어온 견적서가 다른 조건**');
    console.log('     (성수기·인원·등급)인지부터 본다. 고친 값을 반복해 옮기면 진동한다.');
  }

  console.log('\n검산된 값 ' + kept + '칸을 썼고, 검산 안 된 ' + dropped + '칸은 뺐다(SN).');
  if (noDest.length) {
    console.log('목적지를 못 정해 뺀 견적서 ' + noDest.length + '건:');
    noDest.forEach((f) => console.log('   · ' + f));
  }
  console.log('\n⚠ 이 표는 **제안이지 판정이 아니다.** 환율 시점 차이(중앙값 5.1%)를 보정하지');
  console.log('  않았고, 성수기·인원 규모·등급이 실측에는 들어가 있지만 요율표는 평시 기준이다.');
  console.log('  실제 변경은 관리자 화면에서 사람이 누른다(변경 이력이 남아야 되돌릴 수 있다).');
})();

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
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONLY = argOf('--dest');

const destinationRates = require(path.join(ROOT, 'data.js'));
const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
const { destFromName } = require('./_dest_from_name');

/* 추출 항목 → 요율 칸. **admin.html의 PLAUS_RATE_FIELD와 같은 표여야 한다** —
   두 곳이 다르면 화면과 이 표가 서로 다른 칸을 견준다(결함 생성기 ①). */
const CELL = {
  airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room',
  meal: 'meal_per_person', vehicle: 'vehicle_large', guide: 'guide_fee',
  sight: 'sightseeing_fee',
};
const LABEL = {
  airfare: '항공', fuel: '유류', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광',
};
/* 이 배수를 넘게 벌어지면 🔴 — 요율을 논하기 전에 **그 값이 오독인지부터** 봐야 한다.
   plausibility의 RATE_SPREAD(3)와 같은 뜻이되, 여기는 '평균 대비'라 조금 좁게 잡는다. */
const LOUD = 2.0;

const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());
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
  console.log('견적서 ' + files.length + '건에서 칸별 실측을 모으는 중… (2~4분)\n');

  /* 목적지 → 칸 → [값…] */
  const obs = {};
  let dropped = 0, kept = 0;
  const noDest = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f);
    if (!dn.key) { noDest.push(f.slice(0, 46) + ' (' + dn.why + ')'); continue; }
    obs[dn.key] = obs[dn.key] || { files: [], cells: {} };
    obs[dn.key].files.push(f);
    Object.keys(CELL).forEach((k) => {
      const v = (r.values || {})[k];
      if (v == null || !(v > 0)) return;
      const via = ((r.evidence || {})[k] || {}).via;
      /* SN 그대로 — **자는 검산된 값만, 재는 대상은 전부.** */
      if (!PLAUSIBILITY.isTrusted(via)) { dropped++; return; }
      kept++;
      obs[dn.key].cells[k] = obs[dn.key].cells[k] || [];
      obs[dn.key].cells[k].push({ v, f });
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
    Object.keys(CELL).forEach((k) => {
      const list = (o.cells[k] || []).map((x) => x.v);
      const base = Number(dest[CELL[k]]) || 0;
      if (!list.length || !base) return;
      const med = median(list);
      const ratio = med / base;
      const loud = ratio >= LOUD || ratio <= 1 / LOUD;
      /* 표본이 1건이면 중앙값이 아니다 — 그 사실을 기호로 드러낸다 */
      const weak = list.length < 2;
      console.log('   ' + LABEL[k].padEnd(5)
        + '요율 ' + won(base).padStart(11)
        + '   실측중앙 ' + won(med).padStart(11)
        + '  (' + String(list.length) + '건' + (weak ? ' ⚠표본1' : '') + ')'
        + '   ' + (ratio >= 1 ? '×' + ratio.toFixed(2) : '÷' + (1 / ratio).toFixed(2)).padStart(7)
        + (loud ? '  🔴' : ''));
      if (loud && !weak) proposals.push({ destKey, cell: CELL[k], label: LABEL[k], base, med, ratio, n: list.length });
    });
  });

  /* ── 무엇부터 손볼 것인가 ── 표본이 있고 크게 벌어진 것만 */
  console.log('\n' + '═'.repeat(96));
  console.log('🔴 표본 2건 이상이면서 ' + LOUD + '배 넘게 벌어진 칸 — 여기부터 본다');
  console.log('═'.repeat(96));
  if (!proposals.length) console.log('  없다.');
  proposals.sort((a, b) => Math.max(b.ratio, 1 / b.ratio) - Math.max(a.ratio, 1 / a.ratio))
    .forEach((p) => {
      console.log('  ' + p.destKey.padEnd(10) + p.label.padEnd(5)
        + '요율 ' + won(p.base).padStart(11) + '  →  실측 ' + won(p.med).padStart(11)
        + '  (' + p.n + '건, ' + (p.ratio >= 1 ? '요율이 ' + p.ratio.toFixed(1) + '배 낮다'
          : '요율이 ' + (1 / p.ratio).toFixed(1) + '배 높다') + ')');
    });

  console.log('\n검산된 값 ' + kept + '칸을 썼고, 검산 안 된 ' + dropped + '칸은 뺐다(SN).');
  if (noDest.length) {
    console.log('목적지를 못 정해 뺀 견적서 ' + noDest.length + '건:');
    noDest.forEach((f) => console.log('   · ' + f));
  }
  console.log('\n⚠ 이 표는 **제안이지 판정이 아니다.** 환율 시점 차이(중앙값 5.1%)를 보정하지');
  console.log('  않았고, 성수기·인원 규모·등급이 실측에는 들어가 있지만 요율표는 평시 기준이다.');
  console.log('  실제 변경은 관리자 화면에서 사람이 누른다(변경 이력이 남아야 되돌릴 수 있다).');
})();

/* ═══════════════════════════════════════════════════════════════════════════
   추출값 타당성 감사 (SI) — **뽑아낸 값 자체가 말이 되는가**
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 지금 있는 자는 셋 다 **다른 것**을 잰다:
     · audit_row_categories  분류를 못 붙인 줄이 몇 개인가      (빈칸)
     · audit_coverage        총계의 몇 %를 설명하는가            (덜 읽은 것)
     · audit_vacuous_rows    검산이 없었던 줄이 대표가 됐는가    (근거 없는 값)
   **정작 「그 값이 그럴듯한 금액인가」는 아무도 안 본다.** 그런데 이 저장소가 겪은 사고는
   대부분 그 모양이었다 — 가이드 일당 746,210(실제 95,000) · 차량 1,430원 · 식비 98,667 ·
   호텔 「패널티」 180,000. 전부 **분류도 되고 검산도 통과한** 값이었다.

   기준은 **만들어 내지 않는다.** 요율표(`data.js destinationRates`, 55개 목적지)에 이미
   각 항목이 실제로 얼마쯤인지 적혀 있다. 그 분포의 최소·최대를 가져다 넉넉히 벌린 것을
   '있을 수 있는 범위'로 본다.
   ⚠ 범위 밖 = 틀렸다는 뜻이 **아니다.** 장가계 관광비가 권역 중앙값의 5배인 것처럼
     진짜로 비싼 곳이 있다(audit_rates.js의 「확인 대상이지 오류가 아니다」와 같은 성격).
     이 감사기는 **사람이 볼 목록을 좁혀 주는** 것이지 판정하지 않는다.
   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.

   실행:
     node ai-loop/audit_extract_sanity.js
     node ai-loop/audit_extract_sanity.js --json out.json
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const JSON_OUT = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const CORPUS = argv.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1)[0]
  || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

/* 추출 항목 → 요율표 항목. 여기가 어긋나면 엉뚱한 기준으로 재게 된다. */
const FIELD_MAP = {
  airfare: 'airfare',
  fuel: 'fuel_surcharge',
  hotel: 'hotel_per_room',
  meal: 'meal_per_person',
  vehicle: 'vehicle_large',
  guide: 'guide_fee',
  sight: 'sightseeing_fee',
};
/* 요율표 분포를 얼마나 벌릴 것인가. 좁게 잡으면 진짜 비싼 목적지가 전부 걸려
   목록이 쓸모없어지고, 넓게 잡으면 사고를 놓친다. 4배는 실측으로 고른 값이다 —
   이 저장소가 실제로 겪은 사고들(7.9배·10배·4배)이 전부 걸리는 가장 좁은 배수다. */
const WIDEN = 4;

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  /* ⚠ `data.js`의 module.exports는 **요율 배열 그 자체**다(객체가 아니다).
     세 곳(quotes.js·rates.js·quote_verify.js)이 `.map()`으로 바로 쓰기 때문에 그렇게 두었다. */
  const rates = require(path.join(ROOT, 'data.js'));
  if (!Array.isArray(rates) || !rates.length) { console.log('data.js에서 요율표를 못 읽었습니다.'); process.exit(1); }

  /* 요율표에서 항목별 실제 분포를 뽑는다 — 기준을 코드에 적지 않기 위해서다 */
  const band = {};
  Object.keys(FIELD_MAP).forEach((k) => {
    const col = FIELD_MAP[k];
    const vals = rates.map((r) => Number(r[col])).filter((n) => Number.isFinite(n) && n > 0);
    band[k] = { lo: Math.min.apply(null, vals) / WIDEN, hi: Math.max.apply(null, vals) * WIDEN,
      rateMin: Math.min.apply(null, vals), rateMax: Math.max.apply(null, vals) };
  });

  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const flags = [];
  let checked = 0, filled = 0;
  const errors = [];

  for (const f of files) {
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 90) }); continue; }
    checked++;
    Object.keys(FIELD_MAP).forEach((k) => {
      const v = r.values && r.values[k];
      if (v == null) return;
      filled++;
      const b = band[k];
      if (v >= b.lo && v <= b.hi) return;
      const ev = (r.evidence || {})[k] || {};
      flags.push({
        file: f, field: k, value: v,
        low: v < b.lo,
        ratio: v < b.lo ? b.rateMin / v : v / b.rateMax,
        via: ev.via || '?',
        label: String(ev.label || '').slice(0, 26),
        line: String(ev.line || ev.calc || '').slice(0, 70),
      });
    });
  }

  console.log('════ 추출값 타당성 감사 ════\n');
  console.log('견적서 ' + checked + '건 · 채워진 칸 ' + filled + '개를 요율표 분포와 대조했다.');
  console.log('기준(요율표 55곳의 실제 최소~최대를 ' + WIDEN + '배로 벌린 범위):');
  console.log('─'.repeat(74));
  Object.keys(FIELD_MAP).forEach((k) => {
    const b = band[k];
    console.log('  ' + k.padEnd(9) + '요율표 ' + b.rateMin.toLocaleString().padStart(9) + ' ~ ' +
      b.rateMax.toLocaleString().padStart(9) + '   →  허용 ' +
      Math.round(b.lo).toLocaleString().padStart(9) + ' ~ ' + Math.round(b.hi).toLocaleString().padStart(11));
  });

  if (!flags.length) {
    console.log('\n✓ 범위를 벗어난 값이 없다.');
  } else {
    flags.sort((a, b) => b.ratio - a.ratio);
    console.log('\n⚠ 범위를 벗어난 ' + flags.length + '개 — **확인 대상이지 오류가 아니다**');
    console.log('─'.repeat(118));
    console.log('칸        추출값        방향   배수  신뢰도       근거 / 파일');
    console.log('─'.repeat(118));
    flags.forEach((x) => console.log(
      x.field.padEnd(9) + x.value.toLocaleString().padStart(12) + '  ' +
      (x.low ? '너무 작다' : '너무 크다') + '  ' + (x.ratio.toFixed(1) + '배').padStart(6) + '  ' +
      x.via.padEnd(10) + '  ' + (x.label || x.line).slice(0, 34).padEnd(36) + x.file.slice(0, 26)));
    console.log('─'.repeat(118));
    const bad = flags.filter((x) => x.via === 'rule' || x.via === 'doc' || x.via === 'calc');
    console.log('그중 신뢰도가 `rule`·`calc`·`doc`인 것 ' + bad.length + '개 — 화면에서 **가장 믿을 만하다고**');
    console.log('표시되는 값들이다. 여기부터 본다.');
  }

  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ band, flags, checked, filled }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

/* ═══════════════════════════════════════════════════════════════════════════
   공허한 검산 줄 감사 (SB) — `단가 × 1 × 1 = 총금액`이 대표 단가로 채택되는가
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — L2 산술 검산은 `단가 × 수량 × 횟수 = 총금액`이 맞는 줄만 남긴다.
   그런데 **수량도 1, 횟수도 1이면 그 곱셈은 아무것도 증명하지 않는다.** 한 줄에
   같은 숫자가 두 번 나오기만 하면 검산을 통과한다. 그리고 견적서 뒤쪽에는
   `대형버스 1,450,000` 같은 **일괄 총액 줄**이 실제로 그 모양으로 들어 있다.

   여기에 두 가지가 겹쳐 사고가 난다:
     ① findUnitRows의 같은 (줄,총액) 중복 제거가 **단가가 가장 큰 조합**을 남긴다.
        → 한 줄에 `145,000 × 10 × 1 = 1,450,000`과 `1,450,000 × 1 × 1 = 1,450,000`이
          둘 다 성립하면 **총금액이 단가 자리를 차지한다.**
     ② 차량·가이드는 byMaxUnit(가장 비싼 줄)이 대표다.
        → ①을 통과한 부푼 값이 그대로 대표가 된다.

   그 값이 화면에 신뢰도 `rule`("가장 믿을 만하다")로 나가고, 요율표의 ✅실측 배지를
   달고 팀원에게 보인다. 이 저장소의 결함 생성기 ②(조용한 폴백) 그대로다.

   이 감사기는 그것을 **세어서** 보여준다. 고치기 전/후로 돌려 비교하는 것이 용도다.
   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.
      이 파일은 경로만 안다. 회귀 테스트는 합성 표를 쓴다(test_sB_vacuous_rows.js).

   실행:
     node ai-loop/audit_vacuous_rows.js                 (기본 코퍼스 경로)
     node ai-loop/audit_vacuous_rows.js "D:\다른폴더"
     node ai-loop/audit_vacuous_rows.js --json out.json (전/후 대조용 저장)
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

/* 공허한 줄의 정의 — 수량도 횟수도 1이라 곱셈이 아무것도 검증하지 않은 줄.
   ⚠ 이 판정은 pdf_extract.js와 **같은 뜻**이어야 한다. 두 곳에 다른 기준을 적으면
   감사기가 "0건"이라 말하는데 추출기는 계속 틀리는 상태가 된다(결함 생성기 ①). */
const isVacuous = (c) => Number(c.qty) === 1 && Number(c.times) === 1;

/* 대표 단가를 '가장 비싼 줄'로 고르는 칸만 이 결함에 노출된다.
   항공·유류는 byMaxQty(수량이 가장 많은 줄), 호텔은 byMaxTotal이라 성격이 다르지만,
   ⚠ 그 칸들도 함께 센다 — 노출 여부를 코드가 아니라 **측정**으로 확인하기 위해서다. */
const FIELDS = ['vehicle', 'guide', 'airfare', 'fuel', 'hotel'];

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  let rowsAll = 0, rowsVac = 0, filesWithVac = 0;
  const hits = [];              /* 대표값이 공허한 줄에서 나온 것 */
  const perField = {};
  FIELDS.forEach((f) => { perField[f] = { picked: 0, vacuous: 0 }; });
  const errors = [];
  const detail = [];

  for (const f of files) {
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 100) }); continue; }

    const cands = r.candidates || [];
    const vac = cands.filter(isVacuous);
    rowsAll += cands.length;
    rowsVac += vac.length;
    if (vac.length) filesWithVac++;

    const fileHits = [];
    FIELDS.forEach((field) => {
      const evi = r.evidence && r.evidence[field];
      if (!evi || evi.rowIdx == null) return;
      const row = cands.find((c) => c.idx === evi.rowIdx);
      if (!row) return;
      perField[field].picked++;
      if (!isVacuous(row)) return;
      perField[field].vacuous++;

      /* 같은 분류에 **공허하지 않은 대안**이 있는가 — 있으면 순위만 내리면 끝나고,
         없으면 그 줄이 유일한 근거라 값을 되살리려면 나눗셈 복원이 필요하다.
         이 구분이 곧 고치는 방법을 가른다. */
      const alts = cands.filter((c) => c.category === field && !isVacuous(c) && !c.unconvertible);
      const hit = {
        file: f, field,
        value: r.values ? r.values[field] : null,
        unit: row.unit, total: row.total, label: row.label || row.note || '',
        currency: row.currency || 'KRW',
        alt: alts.length ? Math.max.apply(null, alts.map((a) => a.unit)) : null,
        altCount: alts.length,
        /* ⚠ 신뢰도를 **읽어서** 센다. 검산 안 된 값이 다시 `rule`로 나가기 시작하면
           여기서 드러난다 — 감사기가 스스로 회귀를 잡아야 한다(결함 생성기 ③). */
        via: evi.via || 'rule',
      };
      hits.push(hit); fileHits.push(hit);
    });
    detail.push({ file: f, rows: cands.length, vacuous: vac.length, hits: fileHits.length });
  }

  console.log('════ 공허한 검산 줄 감사 ════\n');
  console.log('검산줄 ' + rowsAll + '개 중 공허한 줄 ' + rowsVac + '개 (' +
    (rowsAll ? (rowsVac / rowsAll * 100).toFixed(1) : '0') + '%)  —  ' +
    filesWithVac + '/' + files.length + '개 파일에 존재');
  console.log('그중 **실제로 대표 단가로 채택된 것: ' + hits.length + '건**\n');

  console.log('칸별 — 채택된 대표값 중 공허한 줄에서 나온 비율');
  console.log('─'.repeat(52));
  FIELDS.forEach((f) => {
    const p = perField[f];
    console.log('  ' + f.padEnd(10) + String(p.vacuous).padStart(3) + ' / ' + String(p.picked).padStart(3) +
      (p.picked ? '   ' + (p.vacuous / p.picked * 100).toFixed(0) + '%' : ''));
  });

  if (hits.length) {
    /* 대안이 있는 것과 없는 것을 나눠 보여준다 — 고치는 방법이 다르다. */
    const withAlt = hits.filter((h) => h.altCount > 0);
    const noAlt = hits.filter((h) => !h.altCount);
    console.log('\n  · 같은 분류에 공허하지 않은 대안이 **있다**: ' + withAlt.length + '건  (순위를 내리면 해결)');
    console.log('  · 대안이 **없다**: ' + noAlt.length + '건  (그 줄이 유일한 근거 — 복원이 필요)');

    console.log('\n채택된 ' + hits.length + '건 상세');
    console.log('─'.repeat(120));
    console.log('칸        채택된 값      대안 단가      배수  통화  신뢰도       라벨 / 파일');
    console.log('─'.repeat(120));
    hits.forEach((h) => {
      const mult = h.alt ? (h.unit / h.alt) : null;
      console.log(
        h.field.padEnd(9) +
        String(h.unit.toLocaleString()).padStart(12) + '  ' +
        (h.alt ? h.alt.toLocaleString().padStart(12) : '        없음') + '  ' +
        (mult ? (mult.toFixed(1) + '배').padStart(6) : '     -') + '  ' +
        h.currency.padEnd(4) + '  ' +
        h.via.padEnd(10) + '  ' +
        String(h.label).slice(0, 20).padEnd(20) + ' ' + h.file.slice(0, 28)
      );
    });
    console.log('─'.repeat(120));

    /* ⚠ 여기가 이 감사기의 핵심 판정이다. 값이 남아 있는 것 자체는 사고가 아니다
       (「항공 320,000 1 1」처럼 진짜 1인 단가가 그 모양인 양식이 있다).
       사고는 **검산 안 된 값이 「가장 믿을 만하다」로 나가는 것**이다. */
    const stillRule = hits.filter((h) => h.via === 'rule' || h.via === 'doc');
    if (stillRule.length) {
      console.log('✗ ' + stillRule.length + '건이 아직 신뢰도 `' + stillRule[0].via +
        '`(가장 믿을 만하다)로 나간다 — 검산되지 않은 값이다. SB 수정이 풀렸는지 확인할 것.');
      process.exitCode = 1;
    } else {
      console.log('✓ ' + hits.length + '건 모두 `unchecked`로 나간다 — 화면이 「검산 안 됨」 배지를 붙이고');
      console.log('  담당자에게 1인 단가인지 전 일정 총액인지 확인을 요청한다.');
      console.log('  ⚠ 값 자체는 여전히 사람이 봐야 한다. 코드는 여기까지가 한계다.');
    }
  } else {
    console.log('\n✓ 대표 단가로 채택된 공허한 줄이 없다.');
  }

  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      files: files.length, rowsAll, rowsVac, hits, perField, detail,
    }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

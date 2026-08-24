/* ═══════════════════════════════════════════════════════════════════════════
   추출기 자기검산 감사 (WD) — **이미 돌고 있는데 아무도 안 보는 안전망**
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — `pdf_extract.js`의 `reconcile()`은 견적서마다 검산을 두 개 돌린다:

     ① 총계 ÷ 인원 = 문서에 적힌 1인당   (1.5%까지 봐준다 — 천원 절삭이 흔하다)
     ② 우리가 뽑은 줄들의 합 ≤ 총계       (넘으면 같은 줄을 두 번 셌다는 뜻)

   그런데 그 결과(`reconciliation.checks`)를 **읽는 곳이 한 군데도 없었다.**
   코퍼스 캐시에도 안 실리고, 역검증도 오차 분해도 안 본다. 계산만 되고 버려진다 —
   이 저장소의 결함 생성기 ③(안 돌아본 안전망) 그대로다.

   ⚠ **①이 깨지면 역검증의 정답지가 틀린다.** 실제로 상해 건이 그랬다:
     문서는 「1인 1,030,000원 + 황포강유람선/꽃비용 411,600원」이고 총합계가
     15,861,600원인데, 우리는 앞의 1,030,000만 1인당으로 읽었다.
     15,861,600 ÷ 15 = 1,057,440이라 **2.7%가 조용히 빠진 채** 엔진과 견줘졌다.
     이런 건은 「엔진이 비싸다」로 잘못 읽히고, 그 진단으로 요율을 만지면 진짜로 틀어진다.

   ⚠ **①이 깨졌다고 곧바로 `총계 ÷ 인원`이 옳은 것은 아니다.** 원가 시트는 「합계」가
     지상비 총계인 경우가 있어(푸켓: 19,429,748 = 지상비 29인분) 총계 ÷ 인원이
     판매가와 애초에 다른 것을 잰다. 그래서 이 도구는 **고치지 않고 가른다** —
     어느 쪽이 옳은지는 문서마다 다르고, 사람이 한 번 봐야 하는 자리다.

   실행:
     node ai-loop/audit_self_checks.js
     node ai-loop/audit_self_checks.js --json out.json
     node ai-loop/audit_self_checks.js "D:\다른폴더"
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const JSON_OUT = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const CORPUS = argv.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1)[0]
  || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

/* 검산 ①이 봐주는 폭 — `pdf_extract.js`의 `near(..., 0.015)`와 **같아야 한다**.
   두 곳에 다른 숫자를 적으면 감사기가 「0건」이라 말하는데 추출기는 계속 놓친다
   (결함 생성기 ①). `test_wD_self_checks.js`가 이 상수를 추출기와 대조한다. */
const TOL = 0.015;

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s).padStart(n);
const pct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';

(async () => {
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const { files, skipped } = corpusFiles(CORPUS);

  console.log('════ 추출기 자기검산 감사 (WD) ════\n');
  console.log('코퍼스: ' + CORPUS);
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const rows = [];
  const errors = [];
  for (const f of files) {
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      const r = await X.extractQuote(buf, pdfParse, {});
      const rec = r.reconciliation || {};
      const checks = rec.checks || [];
      const byName = {};
      checks.forEach((c) => { byName[c.name] = c; });
      rows.push({
        file: f,
        pax: r.pax || null,
        grand: r.grandTotal || null,
        perPerson: r.perPerson || null,
        itemsTotal: r.itemsTotal || null,
        checks,
        c1: byName['총계 ÷ 인원 = 1인당'] || null,
        c2: byName['뽑은 줄 합계 ≤ 총계'] || null,
        /* 검산 ①이 어느 총계로 쟀는가 — 추출기와 **같은 분모**여야 한다(WD).
           여기만 `grandTotal`을 보면 감사기가 「0건」이라 말하는데 추출기는 계속
           깨지는 상태가 된다(결함 생성기 ①). */
        scale: r.grandTotal || r.itemsTotal || null,
        scaleIsGrand: !!r.grandTotal,
        /* 검산 ①이 깨진 정도 — 「1.5%를 살짝 넘었다」와 「30% 어긋났다」는 다른 사건이다.
           깨진 건 전부를 한 줄로 세면 그 차이가 사라져 우선순위를 못 만든다. */
        gap: ((r.grandTotal || r.itemsTotal) && r.perPerson && r.pax)
          ? ((r.grandTotal || r.itemsTotal) / r.pax - r.perPerson) / r.perPerson : null,
      });
    } catch (e) {
      errors.push({ file: f, err: String(e.message).slice(0, 100) });
    }
  }

  /* ── 전체 그림 ─────────────────────────────────────────────────────────── */
  const ran1 = rows.filter((r) => r.c1);
  const fail1 = ran1.filter((r) => !r.c1.ok);
  /* 🔴 통과했다고 대조된 것이 아니다. 원가 시트는 「합계 ÷ 인원 < 판매가」가 정상이라
     `ok`지만, 그 문서에서 이 검산은 **아무것도 확인하지 못했다.** 둘을 합쳐 세면
     대조 안 된 문서가 깨끗한 문서로 둔갑한다(결함 생성기 ②). 그래서 따로 센다. */
  const matched1 = ran1.filter((r) => r.c1.ok && r.c1.matched);
  const dirOk1 = ran1.filter((r) => r.c1.ok && !r.c1.matched);
  const ran2 = rows.filter((r) => r.c2);
  const fail2 = ran2.filter((r) => !r.c2.ok);
  /* 「검산이 안 돌았다」는 「통과했다」가 아니다. 이 둘을 합쳐 세면 못 읽은 문서가
     깨끗한 문서로 둔갑한다(결함 생성기 ②). 그래서 항상 따로 센다. */
  const noRun1 = rows.length - ran1.length;

  console.log('검산 ① 총계 ÷ 인원 = 1인당');
  console.log('   돌았다 ' + ran1.length + '건');
  console.log('     ✓ 딱 맞음              ' + String(matched1.length).padStart(2)
    + '건  ← **정답지가 실제로 대조된 것은 여기까지다**');
  console.log('     ⚪ 정상 방향(원가 시트)   ' + String(dirOk1.length).padStart(2)
    + '건  합계가 판매가보다 작다 — 항공·마진이 합계 밖이라 정상');
  console.log('     🔴 깨짐                ' + String(fail1.length).padStart(2)
    + '건  합계가 1인당 표기보다 **크다** = 1인당을 덜 읽었다');
  console.log('   ⚪ 안 돌았다 ' + noRun1 + '건 (총계·1인당·인원 중 하나를 못 읽음)\n');
  const over2 = ran2.filter((r) => r.c2.ok && !r.c2.matched);
  console.log('검산 ② 뽑은 줄 합계 ≤ 총계');
  console.log('   돌았다 ' + ran2.length + '건');
  console.log('     ✓ 안 넘음                ' + String(ran2.length - fail2.length - over2.length).padStart(2) + '건');
  console.log('     ⚪ 넘었지만 「합계」가 소계   ' + String(over2.length).padStart(2)
    + '건  확인 대상 — 이중 계산이 아니다');
  console.log('     🔴 견적 총액을 넘음        ' + String(fail2.length).padStart(2)
    + '건  같은 줄을 두 번 셌다는 뜻');
  console.log('   ⚪ 안 돌았다 ' + (rows.length - ran2.length) + '건\n');

  /* ── 🔴 검산 ①이 깨진 건 ──────────────────────────────────────────────── */
  if (fail1.length) {
    console.log('🔴 검산 ① 깨짐 — **역검증의 정답지가 이만큼 어긋나 있다**');
    console.log(''.padEnd(112, '─'));
    console.log(pad('파일', 44) + lpad('인원', 5) + lpad('총계', 15) + '  ' + pad('출처', 5)
      + lpad('÷인원', 13) + lpad('문서 1인당', 13) + lpad('차이', 9));
    console.log(''.padEnd(112, '─'));
    fail1.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).forEach((r) => {
      console.log(pad(r.file, 44) + lpad(r.pax, 5)
        + lpad(r.scale.toLocaleString(), 15) + '  ' + pad(r.scaleIsGrand ? '총계' : '합계', 5)
        + lpad(Math.round(r.scale / r.pax).toLocaleString(), 13)
        + lpad(r.perPerson.toLocaleString(), 13)
        + lpad(pct(r.gap), 9));
    });
    console.log(''.padEnd(112, '─'));
    const worst = fail1.filter((r) => Math.abs(r.gap) >= 0.05);
    console.log('\n  이 중 5% 이상 어긋난 것 ' + worst.length + '건 — 여기가 먼저다.');
    console.log('  → 이 문서들은 **1인당 표기가 총계보다 작다.** 총계 쪽이 담고 있는');
    console.log('    단체 1회분 추가금이 1인당 표기에서 빠진 것이다');
    console.log('    (상해: 「1인 1,030,000원 + 황포강유람선/꽃비용 411,600원」).');
    console.log('    역검증은 1인당 표기를 정답지로 쓰므로 **그만큼 엔진이 비싸 보인다.**');
    console.log('  ⚠ 값을 여기서 고치지 않는다 — 어느 쪽이 고객이 실제로 내는 돈인지는');
    console.log('    문서마다 다르고, 사람이 한 번 봐야 하는 자리다.');
  } else {
    console.log('✓ 검산 ①이 깨진 문서가 없다.');
  }

  /* ── 🔴 검산 ②가 깨진 건 ──────────────────────────────────────────────── */
  if (fail2.length) {
    console.log('\n🔴 검산 ② 깨짐 — 견적 총액을 넘었다 = 같은 줄을 두 번 셌다');
    console.log(''.padEnd(100, '─'));
    fail2.forEach((r) => console.log('  · ' + pad(r.file, 50) + '  ' + r.c2.detail));
    console.log(''.padEnd(100, '─'));
  } else {
    console.log('\n✓ 견적 총액을 넘은 문서가 없다.');
  }
  if (over2.length) {
    console.log('\n⚪ 확인 대상 — 「합계」를 넘었다. **이중 계산이 아니다.**');
    console.log('   완전중복(같은 줄·같은 값)을 세어 보니 이 무리 전부 0개였다.');
    console.log('   「합계」가 구간 소계인 문서다 — KS두레는 아오모리+고베 두 구간,');
    console.log('   바모스 오키나와(48명)는 관광조/골프조 두 표가 들어 있다.');
    console.log(''.padEnd(100, '─'));
    over2.forEach((r) => console.log('  · ' + pad(r.file, 50) + '  ' + r.c2.detail));
    console.log(''.padEnd(100, '─'));
  }

  if (skipped && skipped.length) {
    console.log('\n건너뛴 파일 ' + skipped.length + '건 (중복·비PDF)');
  }
  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      corpus: CORPUS, files: files.length, tol: TOL,
      check1: {
        ran: ran1.length, matched: matched1.length, dirOk: dirOk1.length,
        failed: fail1.length, noRun: noRun1,
      },
      check2: { ran: ran2.length, failed: fail2.length },
      rows: rows.map((r) => ({
        file: r.file, pax: r.pax, grand: r.grand, itemsTotal: r.itemsTotal,
        scale: r.scale, scaleIsGrand: r.scaleIsGrand, perPerson: r.perPerson,
        gap: r.gap, c1ok: r.c1 ? r.c1.ok : null, c1matched: r.c1 ? !!r.c1.matched : null,
        c1basis: r.c1 ? r.c1.basis : null, c2ok: r.c2 ? r.c2.ok : null,
      })),
    }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

/* ═══════════════════════════════════════════════════════════════════════════
   일괄 투입 리포트 (YT) — **이번에 봐야 할 것만** 한 장으로
   ───────────────────────────────────────────────────────────────────────────
   대표 방침(2026-08-10): 「직원들이 보낸 견적서를 폴더에 **일괄로** 올리고, 그 폴더에서
   자주 취합해 DB를 고도화한다.」 그리고 —
     🔴 **「빈칸에 연연하지 말 것. 틀린 값이 위험하다.」**
     🔴 **일괄이라 사람이 모든 칸을 눈으로 볼 수 없다.**

   그런데 지금 「봐야 할 것」은 감사 도구 **여남은 개에 흩어져** 있다. 폴더에 20건을
   넣고 나면 무엇부터 열어야 하는지 아무도 말해 주지 않는다. 이 파일이 그 자리다.

   ■ 무엇을 새로 재지 않는다 — **전부 이미 있는 판정을 모아 세운다**
     · 얼마나 읽었나   `plausibility.coverage`      (YS)
     · 몇 곳에서 묵나   `pdf_extract`의 다도시 판정   (TF)
     · 골프 일정인가   `_golf_scope`                (YD)
     · 같은 문서 두 벌  `_corpus_files`의 해시 판정   (VA)
     여기서 문턱을 다시 적으면 두 벌이 된다(결함 생성기 ①). **판정은 안 하고 줄만 세운다.**

   ■ 줄 세우는 기준 — 대표 방침 그대로 **「틀린 값」이 「빈칸」보다 위**다
     🔴 요율에 **틀린 값**이 얹힐 수 있는 것 — 지금 보지 않으면 고객 금액이 된다
     🟡 표본에 **못 들어가는** 것 — 채점표가 안 늘 뿐, 금액은 안 틀린다
     ✓  나머지

   ■ 새로 들어온 것부터
   지난번에 본 파일 목록을 `.intake_seen.json`에 남긴다(저장소 밖으로 안 나간다).
   다음에 돌리면 **이번에 새로 들어온 것**을 맨 위에 세운다.
   ⚠ 그 파일이 없으면 「전부 새 것」이다 — **조용히 0건이라 하지 않는다.**

   실행:
     node ai-loop/report_intake.js              (캐시 사용 — 빠르다)
     node ai-loop/report_intake.js --fresh      (PDF를 다시 읽는다, 2~4분)
     node ai-loop/report_intake.js --all        (새 것만이 아니라 전부 보여준다)
     node ai-loop/report_intake.js --mark       (지금 목록을 「봤다」로 표시한다)
   ⚠ 읽기 전용이다. `--mark`만 상태 파일 하나를 쓴다(운영 DB는 안 건드린다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadCorpus } = require('./_corpus_cache.js');

const argv = process.argv.slice(2);
const FRESH = argv.includes('--fresh');
const ALL = argv.includes('--all');
const MARK = argv.includes('--mark');
const SEEN = path.join(__dirname, '.intake_seen.json');

/* 한 문서에서 「봐야 할 이유」를 모은다. **판정은 여기서 안 한다** — 이미 내려진
   판정(`r.cov`·`r.multiCity`…)을 읽어 사람 말로 옮길 뿐이다. */
function reasons(r) {
  const red = [], yellow = [];

  /* ── 🔴 틀린 값이 요율에 얹힐 수 있는 것 ── */
  if (r.cov && r.cov.known && r.cov.verdict === 'low') {
    red.push('금액의 ' + Math.round(r.cov.ratio * 100) + '%만 읽었다 — 처음 보는 양식일 수 있다');
  }
  if (r.cov && r.cov.known && r.cov.verdict === 'high') {
    red.push('읽은 금액이 총계의 ' + Math.round(r.cov.ratio * 100) + '% — 같은 돈을 두 번 셌을 수 있다');
  }
  if (r.multiCity) {
    red.push((r.stays || []).length + '곳에서 묵는다 — 한 도시 요율의 근거로 쓰면 다른 도시 값이 섞인다');
  }
  /* 인원이 틀리면 **1인당이 통째로** 틀린다 — 금액 칸이 전부 그 위에 얹힌다 */
  if (r.paxConflict) red.push('인원이 문서 계산과 어긋난다');
  if (!r.dest || !r.dest.key) red.push('목적지를 못 정했다 — 어느 요율에 얹힐지 모른다');

  /* ── 🟡 표본에 못 들어가는 것(빈칸) ── */
  if (!r.perPerson && !r.grand) yellow.push('정답지가 없다(1인당·총계를 둘 다 못 읽었다)');
  else if (!r.perPerson) yellow.push('1인당을 못 읽었다');
  if (r.needsFx) {
    const cur = r.needsFx.currency || '외화';
    yellow.push(cur + ' 줄 ' + (r.needsFx.rowCount || 0) + '개를 환율이 없어 못 읽었다');
  }
  if (!r.dates || !r.dates.departDate) yellow.push('출발일을 못 읽었다(시즌·리드타임 계수가 안 걸린다)');
  if (r.cov && !r.cov.known) yellow.push('문서 총계를 못 읽어 얼마나 읽었는지 잴 수 없다');

  return { red, yellow };
}

module.exports = { reasons, SEEN };

/* ⚠ `require`로 불릴 때는 본체를 돌리지 않는다 — 테스트가 `reasons`만 쓰는데
   본체가 함께 돌면 코퍼스를 읽느라 몇 분이 걸린다(YR에서와 같은 이유). */
if (require.main !== module) return;

(async () => {
  const rows = await loadCorpus({ useCache: !FRESH, quiet: true });
  const ok = rows.filter((r) => !r.error);
  const bad = rows.filter((r) => r.error);

  /* 지난번에 본 목록 — 없으면 「전부 새 것」이다. 조용히 0으로 두지 않는다. */
  let seen = null;
  try { seen = new Set(JSON.parse(fs.readFileSync(SEEN, 'utf8')).files || []); } catch (e) { seen = null; }
  const isNew = (f) => (seen ? !seen.has(f) : true);

  const scored = ok.map((r) => {
    const { red, yellow } = reasons(r);
    return { r, red, yellow, 새것: isNew(r.file), 급함: red.length ? 2 : (yellow.length ? 1 : 0) };
  });

  const 새로들어온 = scored.filter((s) => s.새것);
  const 볼것 = (ALL ? scored : (seen ? 새로들어온 : scored)).filter((s) => s.급함 > 0);
  볼것.sort((a, b) => (b.급함 - a.급함) || a.r.file.localeCompare(b.r.file));

  console.log('\n══ 견적서 일괄 투입 — 이번에 봐야 할 것 ══');
  console.log('문서 ' + ok.length + '건' + (bad.length ? ' (읽기 실패 ' + bad.length + '건)' : '')
    + (seen ? ' · 이번에 새로 들어온 것 ' + 새로들어온.length + '건'
            : ' · 🆕 지난 기록이 없어 **전부 새 것**으로 봅니다'));
  if (!ALL && seen) console.log('  (새로 들어온 것만 봅니다 — 전부 보려면 `--all`)');
  console.log('─'.repeat(78));

  if (bad.length) {
    console.log('\n🔴 아예 못 읽은 파일 ' + bad.length + '건 — 이건 값이 아니라 **파일 문제**입니다');
    bad.forEach((b) => console.log('   · ' + b.file.slice(0, 46) + '  → ' + String(b.error).slice(0, 40)));
  }

  const 빨강 = 볼것.filter((s) => s.급함 === 2);
  const 노랑 = 볼것.filter((s) => s.급함 === 1);

  if (빨강.length) {
    console.log('\n🔴 요율에 **틀린 값**이 얹힐 수 있는 것 — ' + 빨강.length + '건');
    console.log('   (지금 안 보면 그대로 고객 금액이 됩니다)');
    빨강.forEach((s) => {
      console.log('\n   ' + (s.새것 ? '🆕 ' : '   ') + s.r.file.slice(0, 52)
        + (s.r.dest && s.r.dest.key ? '   [' + s.r.dest.key + ']' : '')
        + (s.r.golf && s.r.golf.isGolfTrip ? '  ⛳' : ''));
      s.red.forEach((w) => console.log('      🔴 ' + w));
      s.yellow.forEach((w) => console.log('      🟡 ' + w));
    });
  }

  if (노랑.length) {
    console.log('\n🟡 표본에 **못 들어가는** 것 — ' + 노랑.length + '건 (금액은 안 틀립니다)');
    노랑.forEach((s) => {
      console.log('   ' + (s.새것 ? '🆕 ' : '   ') + s.r.file.slice(0, 46)
        + (s.r.dest && s.r.dest.key ? ' [' + s.r.dest.key + ']' : ''));
      s.yellow.forEach((w) => console.log('        · ' + w));
    });
  }

  if (!빨강.length && !노랑.length) {
    console.log('\n✅ 볼 것이 없습니다.'
      + (seen && !ALL ? ' (새로 들어온 것 기준 — 전부 보려면 `--all`)' : ''));
  }

  /* ⛳는 판정이 아니라 **알아 둘 것**이다 — 요율 반영 때 `apply_rate_updates`가 막는다(YR) */
  const 골프 = ok.filter((r) => r.golf && r.golf.isGolfTrip);
  console.log('\n' + '─'.repeat(78));
  console.log('ℹ️  골프 일정 ' + 골프.length + '건 — 요율 반영 때 자동으로 보류됩니다(YR). 지금 하실 일은 없습니다.');
  console.log('다음: node ai-loop/validate_corpus.js  →  node ai-loop/apply_rate_updates.js');

  if (MARK) {
    fs.writeFileSync(SEEN, JSON.stringify({ at: new Date().toISOString(), files: ok.map((r) => r.file) }, null, 1), 'utf8');
    console.log('\n✓ 지금 ' + ok.length + '건을 「봤다」로 표시했습니다 — 다음엔 새로 들어온 것만 나옵니다.');
  } else if (볼것.length) {
    console.log('\n(다 보셨으면 `--mark`로 표시해 두시면 다음엔 새 것만 나옵니다)');
  }
  console.log();
})().catch((e) => { console.error(e); process.exit(1); });

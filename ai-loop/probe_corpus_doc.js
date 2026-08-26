/* ═══════════════════════════════════════════════════════════════════════════
   견적서 한 장을 **사람 눈으로 보기 전에** 훑어 준다 (XA) — 읽기 전용

   실행:
     node ai-loop/probe_corpus_doc.js "신한 금융플러스연도대상(발리).pdf"
     node ai-loop/probe_corpus_doc.js --all-missing     ← 검산이 안 돈 문서만

   ■ 왜 필요한가

   `audit_self_checks.js`가 「검산 ①이 안 돈 7건」을 이름으로 부르게 됐다(WZ).
   그다음 질문은 언제나 같다: **「그 값이 문서에 애초에 있는가?」**
   없으면 추출을 고칠 일이 아니고(WG에서 배운 것 — 9건인 줄 알았는데 3건이었다),
   있으면 고칠 자리가 생긴다. 그 판단을 하려고 매번 손으로 PDF를 뜯고 있었다.

   ■ 이 도구가 하는 일

   문서에서 **총계·1인당·환율로 보이는 것**을 찾아 앞뒤 글자와 함께 보여준다.
   ⚠ **판정하지 않는다.** 「이게 총계다」라고 말하지 않고 「이런 게 보인다」까지만 한다 —
     이 저장소에서 값을 지어내면 그게 곧 정답지 오염이고, 실측이 그 위에 얹힌다.
   ⚠ pdf-parse로 읽는다 — **추출기와 같은 경로**다. 다른 도구로 읽으면 다른 글자를 본다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORPUS = process.env.CORPUS_DIR || 'C:/Users/최현욱/Desktop/견적서 모음';

/* WZ 시점(2026-08-26)에 검산 ①이 안 돌던 7건. 목록을 여기 박아 두는 것이 아니라
   **그날 실측의 기록**이다 — 지금 상태는 `audit_self_checks.js`가 매번 다시 센다. */
const MISSING_AT_WZ = [
  '굿리치_연도대상(바르셀로나).pdf',
  '글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf',
  '신한 금융플러스 파워스타트(하노이).pdf',
  '2026 굿리치 일정표(확정).pdf',
  '굿리치RM_연도대상 체코&오스트리.pdf',
  '신한 금융플러스_감탄(마카오).pdf',
  '신한 금융플러스연도대상(발리).pdf',
];

const argv = process.argv.slice(2);
const wantAll = argv.includes('--all-missing');
const targets = wantAll ? MISSING_AT_WZ : argv.filter((a) => !a.startsWith('--'));

if (!targets.length) {
  console.log('쓰는 법: node ai-loop/probe_corpus_doc.js "<파일명.pdf>"   또는   --all-missing');
  process.exit(1);
}

/* 「이런 말이 붙어 있으면 금액 표기일 수 있다」 — 판정이 아니라 **후보**다 */
const TOTAL_WORDS = /(총\s*합\s*계|총\s*계|합\s*계|총액|입금가|판매가|계약금|TOTAL)/i;
const PER_WORDS = /(1\s*인당|1\s*인\s*기준|인당|1인\(|per\s*person)/i;
const FX_WORDS = /(환율|적용환율|기준환율|USD|EUR|＄|\$|€)/i;

const won = (n) => Number(n).toLocaleString();
const numsIn = (s) => (s.match(/[0-9][0-9,]*\.?[0-9]*/g) || [])
  .map((x) => Number(x.replace(/,/g, ''))).filter((n) => Number.isFinite(n) && n > 0);

(async () => {
  const pdf = require(path.join(ROOT, 'node_modules', 'pdf-parse'));
  for (const name of targets) {
    const p = path.join(CORPUS, name);
    console.log('\n' + '═'.repeat(78));
    console.log('■ ' + name);
    if (!fs.existsSync(p)) { console.log('   파일이 없습니다: ' + p); continue; }
    let doc;
    try { doc = await pdf(fs.readFileSync(p)); }
    catch (err) { console.log('   못 읽었습니다: ' + err.message); continue; }

    const text = doc.text;
    const lines = text.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    console.log('   ' + doc.numpages + '쪽 · ' + text.length + '자 · 줄 ' + lines.length + '개');

    const show = (title, re, cap) => {
      const hit = lines.filter((l) => re.test(l));
      console.log('\n   ── ' + title + ' (' + hit.length + '줄)');
      if (!hit.length) { console.log('      🔴 그런 글자가 문서에 없습니다'); return; }
      hit.slice(0, cap).forEach((l) => console.log('      · ' + l.slice(0, 150)));
      if (hit.length > cap) console.log('      · … 외 ' + (hit.length - cap) + '줄');
    };
    show('총계로 보이는 말', TOTAL_WORDS, 8);
    show('1인당으로 보이는 말', PER_WORDS, 8);
    show('환율·외화로 보이는 말', FX_WORDS, 6);

    /* 큰 숫자 — 총액 후보. ⚠ **붙어 나온 숫자**를 조심하라고 함께 말한다.
       실측: 발리 문서에서 `$1,836.4` 와 `12,662,798₩` 가 한 덩어리로 붙어 나왔다. */
    const big = [...new Set(numsIn(text).filter((n) => n >= 3000000))].sort((a, b) => b - a);
    console.log('\n   ── 300만 이상 숫자 (' + big.length + '개)');
    if (!big.length) {
      console.log('      🔴 없습니다 — 이 문서에는 **총액이 안 적혀 있을 수 있습니다**');
      console.log('         (1인 기준 표만 있는 양식이 실제로 있습니다 — 마카오가 그렇습니다)');
    } else {
      console.log('      ' + big.slice(0, 10).map(won).join(' · '));
      const weird = big.filter((n) => n > 1e12);
      if (weird.length) {
        console.log('      ⚠ 자릿수가 이상한 것 ' + weird.length + '개 — **두 숫자가 붙어 나온 것**일 수 있습니다');
        console.log('        (예: `$1,836.4` + `12,662,798₩` → `1,836.412,662,798`)');
      }
    }
    console.log('\n   ⚠ 이 도구는 **판정하지 않습니다.** 「이게 총계다」는 사람이 정합니다 —');
    console.log('      값을 지어내면 그게 곧 정답지 오염이고, 모든 실측이 그 위에 얹힙니다.');
  }
  console.log('');
})().catch((e) => { console.error('실패: ' + e.message); process.exit(1); });

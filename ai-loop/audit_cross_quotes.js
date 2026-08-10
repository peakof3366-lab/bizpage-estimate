/* ═══════════════════════════════════════════════════════════════════════════
   목적지별 교차 대조 (SJ) — **같은 곳 견적서끼리 서로 채점한다**
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 견적서는 앞으로 **계속 쌓인다**(직원들이 고객에게 보낸 견적서를 폴더에
   일괄로 올리고 자주 취합한다, 2026-08-10 대표 방침). 그러면 **빈칸은 저절로 메워진다** —
   어느 문서가 못 채운 칸은 다음 문서가 채운다. 대신 **틀린 값은 반대로 위험해진다.**
   한 번 들어가면 요율에 얹혀 고객이 보는 금액이 되고, 뒤에 쌓이는 정상값들 사이에 섞여
   오히려 찾기 어려워진다. 게다가 일괄 투입이라 **사람이 모든 칸을 눈으로 볼 수 없다.**

   그래서 문서가 쌓일수록 **강해지는** 검사가 필요하다. 같은 목적지의 견적서 여러 건은
   서로에게 채점표다 — 오키나와 호텔 단가가 다섯 건에서 15만~17만인데 하나만 45만이면
   그건 시세가 아니라 **오독**이다. 요율표 대비 검사(audit_extract_sanity)가 못 잡는
   것도 여기서 걸린다: 요율표 범위 안이면서 **동료들과만 어긋나는** 값이다.

   ⚠ 어긋남 = 틀렸다는 뜻이 **아니다.** 성수기/비수기, 4성/5성, 인원 규모로 실제로 벌어진다.
     이 감사기는 **사람이 볼 목록을 좁혀 주는** 것이지 판정하지 않는다.
   ⚠ 목적지 판정은 `_dest_from_name.js` **한 곳**에서 온다(역검증과 같은 표를 쓴다).
     여기에 표를 다시 적으면 두 자가 서로 다른 목적지로 세게 된다(결함 생성기 ①).
   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.

   실행:
     node ai-loop/audit_cross_quotes.js
     node ai-loop/audit_cross_quotes.js --json out.json
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { destFromName } = require('./_dest_from_name');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const JSON_OUT = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const CORPUS = argv.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1)[0]
  || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

const FIELDS = ['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight'];
/* 같은 목적지 안에서 이 배수를 넘게 벌어지면 확인 대상. 성수기·등급 차이로 2배까지는
   실제로 벌어지므로(요율표의 시즌 계수 진폭이 그 정도다) 그보다 넉넉히 잡는다. */
const SPREAD = 2.5;
/* 동료가 최소 둘은 있어야 '중앙값'이 뜻을 갖는다 — 둘이 다르면 누가 이상한지 알 수 없다. */
const MIN_PEERS = 3;

const median = (arr) => {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const byDest = {};
  const noDest = [];
  const errors = [];
  for (const f of files) {
    const d = destFromName(f);
    if (!d.key) { noDest.push({ file: f, why: d.why }); continue; }
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 90) }); continue; }
    (byDest[d.key] || (byDest[d.key] = [])).push({
      file: f, values: r.values || {}, evidence: r.evidence || {},
    });
  }

  const dests = Object.keys(byDest).sort();
  const enough = dests.filter((k) => byDest[k].length >= MIN_PEERS);
  console.log('════ 목적지별 교차 대조 ════\n');
  console.log('목적지 ' + dests.length + '곳 · 그중 ' + MIN_PEERS + '건 이상 모인 곳 ' + enough.length + '곳');
  console.log('  ' + dests.map((k) => k + ' ' + byDest[k].length).join(' · '));
  console.log('\n⚠ 문서가 쌓일수록 이 자는 강해진다 — 지금은 ' + MIN_PEERS + '건 이상 모인 곳만 볼 수 있다.\n');

  const flags = [];
  enough.forEach((key) => {
    const docs = byDest[key];
    FIELDS.forEach((f) => {
      const vals = docs.map((d) => ({ file: d.file, v: d.values[f], ev: d.evidence[f] }))
        .filter((x) => x.v != null && isFinite(x.v) && x.v > 0);
      if (vals.length < MIN_PEERS) return;
      vals.forEach((x) => {
        /* **자기를 뺀** 동료들의 중앙값과 견준다 — 자기가 들어가면 스스로를 정상으로 만든다 */
        const peers = vals.filter((y) => y !== x).map((y) => y.v);
        if (peers.length < 2) return;
        const med = median(peers);
        if (!med) return;
        const ratio = x.v > med ? x.v / med : med / x.v;
        if (ratio < SPREAD) return;
        flags.push({
          dest: key, field: f, file: x.file, value: x.v, peerMedian: med, ratio,
          high: x.v > med, peers: peers.length,
          via: (x.ev && x.ev.via) || '?',
          label: String((x.ev && (x.ev.label || x.ev.calc)) || '').slice(0, 30),
        });
      });
    });
  });

  if (!flags.length) {
    console.log('✓ 같은 목적지 안에서 ' + SPREAD + '배 넘게 벌어지는 값이 없다.');
  } else {
    flags.sort((a, b) => b.ratio - a.ratio);
    console.log('⚠ 동료들과 ' + SPREAD + '배 넘게 벌어진 ' + flags.length + '개 — **확인 대상이지 오류가 아니다**');
    console.log('─'.repeat(120));
    console.log('목적지     칸        이 문서의 값    동료 중앙값   배수  방향  신뢰도      근거 / 파일');
    console.log('─'.repeat(120));
    flags.forEach((x) => console.log(
      x.dest.padEnd(10) + x.field.padEnd(9) +
      x.value.toLocaleString().padStart(12) + '  ' + Math.round(x.peerMedian).toLocaleString().padStart(11) + '  ' +
      (x.ratio.toFixed(1) + '배').padStart(6) + '  ' + (x.high ? '높다' : '낮다') + '  ' +
      x.via.padEnd(10) + '  ' + x.label.slice(0, 22).padEnd(24) + x.file.slice(0, 24)));
    console.log('─'.repeat(120));
    const trusted = flags.filter((x) => ['rule', 'calc', 'doc'].includes(x.via));
    console.log('그중 신뢰도가 `rule`·`calc`·`doc`인 것 ' + trusted.length + '개 — 화면에서 **가장 믿을 만하다고**');
    console.log('표시되는 값들이다. 여기부터 본다.');
  }

  if (noDest.length) {
    const why = {};
    noDest.forEach((n) => { why[n.why] = (why[n.why] || 0) + 1; });
    console.log('\n⚪ 목적지를 못 정해 뺀 ' + noDest.length + '건 — ' +
      Object.keys(why).map((k) => k + ' ' + why[k]).join(' · '));
  }
  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ flags, dests: dests.map((k) => ({ key: k, n: byDest[k].length })) }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

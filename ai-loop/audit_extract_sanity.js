/* ═══════════════════════════════════════════════════════════════════════════
   추출값 타당성 감사 (SI · SK에서 목적지 기준으로 다시 씀)
   — **뽑아낸 값이 그 지역 기준과 견줘 말이 되는가**
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가 — 다른 자들은 셋 다 **다른 것**을 잰다:
     · audit_row_categories  분류를 못 붙인 줄이 몇 개인가      (빈칸)
     · audit_coverage        총계의 몇 %를 설명하는가            (덜 읽은 것)
     · audit_vacuous_rows    검산이 없었던 줄이 대표가 됐는가    (근거 없는 값)
   **정작 「그 값이 그럴듯한 금액인가」는 아무도 안 본다.** 그런데 이 저장소가 겪은 사고는
   대부분 그 모양이었다 — 가이드 746,210(실제 95,000) · 차량 1,430원 · 호텔 「패널티」.
   전부 **분류도 되고 검산도 통과한** 값이었다.

   ⚠ **기준은 반드시 그 지역 것이어야 한다**(2026-08-10 대표 지시).
     「지역마다 비용이 천차만별이라 다 모아서 절대 평균값을 내지 말라.」 실제로 그렇다 —
     같은 '가이드 일당'이라도 발리 99,000과 시드니 400,000이 둘 다 정상이다.
     전 목적지를 한 통에 넣고 재면 비싼 지역이 통째로 '이상값'이 되고, 그 목록은 쓸모없다.

   그래서 기준을 **세 단으로** 둔다. 위에서부터 있는 것을 쓴다:
     ① **같은 목적지 견적서 동료들의 중앙값** — 문서가 쌓일수록 정확해지는 진짜 기준.
        자기를 뺀 동료들과 견준다(자기가 들어가면 스스로를 정상으로 만든다).
     ② **그 목적지의 요율표 한 줄** — 아직 동료가 없을 때의 출발점.
        ⚠ 그 지역 견적서가 **하나뿐이면 그 하나가 기준이 된다**(대표 지시). 그래서 1건짜리
          목적지는 '어긋났다'고 말하지 않고, 아래 ⚪ 목록에 **기준선이 됐다**고 적는다.
     ③ 전 목적지 범위 — 목적지를 못 정한 문서에만 쓰는 마지막 그물(자릿수만 본다).

   그리고 **두 가지를 갈라서 보고한다.** 고치는 자리가 완전히 다르기 때문이다:
     🔴 **동료와 어긋난다** → 그 문서만 튄다 = **오독 후보.** 우리가 고칠 것.
     🟡 **동료끼리는 맞는데 요율표와 어긋난다** → 여러 문서가 같은 말을 한다 =
        **요율 갱신 후보.** 우리 코드가 아니라 요율표가 낡은 것이다.
     이걸 안 가르면 「동남아 식비가 요율표의 5배」 같은 것이 오독 목록을 가득 채워
     정작 진짜 오독을 묻어 버린다(실제로 그랬다 — 31건 중 대부분이 이쪽이었다).

   ⚠ 어긋남 = 틀렸다는 뜻이 **아니다.** 성수기/등급/인원으로 실제로 벌어진다.
     이 감사기는 **사람이 볼 목록을 좁혀 주는** 것이지 판정하지 않는다.
   ⚠ 목적지 판정은 `_dest_from_name.js` 한 곳에서 온다(역검증과 같은 표).
   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.

   실행:
     node ai-loop/audit_extract_sanity.js
     node ai-loop/audit_extract_sanity.js --json out.json
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

/* 추출 항목 → 요율표 항목. 여기가 어긋나면 엉뚱한 기준으로 재게 된다. */
const FIELD_MAP = {
  airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room',
  meal: 'meal_per_person', vehicle: 'vehicle_large', guide: 'guide_fee',
  sight: 'sightseeing_fee',
};
/* 동료들과 이 배수 넘게 벌어지면 오독 후보. 같은 지역·같은 항목이라도 성수기·등급으로
   2배까지는 실제로 벌어지므로 그보다 넉넉히 잡는다. */
const PEER_SPREAD = 2.5;
/* 요율표와 이 배수 넘게 벌어지면 요율 갱신 후보. 요율표는 '기준가'라 실제 견적이
   1.5배쯤 되는 것은 흔하다 — 그보다 확실히 벌어질 때만 말한다. */
const RATE_SPREAD = 2.5;
/* 동료가 최소 둘은 있어야 중앙값이 뜻을 갖는다(둘이 다르면 누가 이상한지 알 수 없다) */
const MIN_PEERS = 2;
/* 목적지를 못 정한 문서에만 쓰는 마지막 그물 — 전 목적지 분포를 이만큼 벌린다 */
const WIDEN = 4;

const median = (arr) => {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(0) + '%';

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  /* ⚠ `data.js`의 module.exports는 **요율 배열 그 자체**다(객체가 아니다). */
  const rates = require(path.join(ROOT, 'data.js'));
  if (!Array.isArray(rates) || !rates.length) { console.log('data.js에서 요율표를 못 읽었습니다.'); process.exit(1); }

  const band = {};
  Object.keys(FIELD_MAP).forEach((k) => {
    const vals = rates.map((r) => Number(r[FIELD_MAP[k]])).filter((n) => Number.isFinite(n) && n > 0);
    band[k] = { lo: Math.min.apply(null, vals) / WIDEN, hi: Math.max.apply(null, vals) * WIDEN,
      rateMin: Math.min.apply(null, vals), rateMax: Math.max.apply(null, vals) };
  });

  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const docs = [];
  const errors = [];
  for (const f of files) {
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { errors.push({ file: f, err: String(e.message).slice(0, 90) }); continue; }
    docs.push({ file: f, dest: destFromName(f).key, values: r.values || {}, evidence: r.evidence || {} });
  }

  /* 목적지별로 모은다 — 여기가 이 감사기의 뼈대다 */
  const byDest = {};
  docs.forEach((d) => { if (d.dest) (byDest[d.dest] || (byDest[d.dest] = [])).push(d); });

  const misread = [];   /* 🔴 동료와 어긋난다 = 오독 후보 */
  const rateGap = [];   /* 🟡 동료끼리는 맞는데 요율표와 어긋난다 = 요율 갱신 후보 */
  const noPeer = [];    /* ⚪ 그 목적지의 첫 견적서 — 이 값이 기준선이 된다 */
  const noDest = [];    /* 목적지를 못 정한 문서 (마지막 그물) */
  let filled = 0;

  Object.keys(byDest).forEach((dest) => {
    const list = byDest[dest];
    const drow = rates.find((x) => x.destination_key === dest);
    Object.keys(FIELD_MAP).forEach((f) => {
      const vals = list.map((d) => ({ d, v: d.values[f] })).filter((x) => x.v > 0 && isFinite(x.v));
      if (!vals.length) return;
      const base = drow ? Number(drow[FIELD_MAP[f]]) : 0;

      if (vals.length === 1) {
        /* ⚠ **하나뿐이면 그것이 기준이 된다**(대표 지시) — '어긋났다'고 말하지 않는다.
           다만 요율표와 얼마나 다른지는 적어 둔다. 다음 견적서가 오면 둘이 서로 잰다. */
        const x = vals[0];
        noPeer.push({ dest, field: f, file: x.d.file, value: x.v, rate: base || null,
          gap: base ? x.v / base - 1 : null, via: (x.d.evidence[f] || {}).via || '?' });
        return;
      }

      /* ① 동료 중앙값과 견준다 — 자기를 뺀다 */
      vals.forEach((x) => {
        const peers = vals.filter((y) => y !== x).map((y) => y.v);
        if (peers.length < MIN_PEERS) return;
        const med = median(peers);
        if (!med) return;
        const ratio = x.v > med ? x.v / med : med / x.v;
        if (ratio < PEER_SPREAD) return;
        const ev = x.d.evidence[f] || {};
        misread.push({ dest, field: f, file: x.d.file, value: x.v, peerMedian: med, ratio,
          high: x.v > med, peers: peers.length, via: ev.via || '?',
          label: String(ev.label || ev.calc || '').slice(0, 24) });
      });

      /* ② 동료들이 **입을 모아** 요율표와 다르면 그건 요율표가 낡은 것이다 */
      if (base > 0) {
        const med = median(vals.map((x) => x.v));
        const ratio = med > base ? med / base : base / med;
        if (ratio >= RATE_SPREAD) {
          rateGap.push({ dest, field: f, docMedian: med, rate: base, ratio, high: med > base,
            n: vals.length, gap: med / base - 1 });
        }
      }
    });
  });

  docs.filter((d) => !d.dest).forEach((d) => {
    Object.keys(FIELD_MAP).forEach((f) => {
      const v = d.values[f];
      if (!(v > 0)) return;
      const b = band[f];
      if (v >= b.lo && v <= b.hi) return;
      const ev = d.evidence[f] || {};
      noDest.push({ file: d.file, field: f, value: v, low: v < b.lo,
        ratio: v < b.lo ? b.rateMin / v : v / b.rateMax, via: ev.via || '?' });
    });
  });
  docs.forEach((d) => Object.keys(FIELD_MAP).forEach((f) => { if (d.values[f] > 0) filled++; }));

  const dests = Object.keys(byDest).sort();
  console.log('════ 추출값 타당성 감사 ════\n');
  console.log('견적서 ' + docs.length + '건 · 채워진 칸 ' + filled + '개.');
  console.log('목적지 ' + dests.length + '곳 — ' + dests.map((k) => k + ' ' + byDest[k].length).join(' · '));
  console.log('목적지를 못 정한 문서 ' + docs.filter((d) => !d.dest).length + '건 (전 목적지 범위로만 잰다)\n');

  /* ── 🔴 오독 후보 ─────────────────────────────────────────────────────── */
  if (misread.length) {
    misread.sort((a, b) => b.ratio - a.ratio);
    console.log('🔴 **같은 지역 동료와 어긋난다 — 오독 후보 ' + misread.length + '개** (우리가 고칠 것)');
    console.log('─'.repeat(116));
    console.log('목적지     칸        이 문서의 값    동료 중앙값   배수  방향  신뢰도      근거 / 파일');
    console.log('─'.repeat(116));
    misread.forEach((x) => console.log(
      x.dest.padEnd(10) + x.field.padEnd(9) + x.value.toLocaleString().padStart(12) + '  ' +
      Math.round(x.peerMedian).toLocaleString().padStart(11) + '  ' + (x.ratio.toFixed(1) + '배').padStart(6) +
      '  ' + (x.high ? '높다' : '낮다') + '  ' + x.via.padEnd(10) + '  ' +
      x.label.padEnd(26) + x.file.slice(0, 24)));
    console.log('─'.repeat(116));
  } else {
    console.log('🔴 같은 지역 동료와 어긋나는 값 없음.');
  }

  /* ── 🟡 요율 갱신 후보 ────────────────────────────────────────────────── */
  if (rateGap.length) {
    rateGap.sort((a, b) => b.ratio - a.ratio);
    console.log('\n🟡 **견적서들이 입을 모아 요율표와 다르다 — 요율 갱신 후보 ' + rateGap.length + '개**');
    console.log('   (우리 코드가 아니라 요율표가 낡은 것이다. 견적서가 쌓일수록 이 목록이 정확해진다.)');
    console.log('─'.repeat(88));
    console.log('목적지     칸        견적서 중앙값   요율표 기준가   차이     표본');
    console.log('─'.repeat(88));
    rateGap.forEach((x) => console.log(
      x.dest.padEnd(10) + x.field.padEnd(9) + Math.round(x.docMedian).toLocaleString().padStart(13) + '  ' +
      x.rate.toLocaleString().padStart(13) + '  ' + pct(x.gap).padStart(7) + '   ' + x.n + '건'));
    console.log('─'.repeat(88));
  }

  /* ── ⚪ 그 지역의 첫 견적서 ───────────────────────────────────────────── */
  const firstOnes = {};
  noPeer.forEach((x) => { (firstOnes[x.dest] || (firstOnes[x.dest] = [])).push(x); });
  const firstDests = Object.keys(firstOnes).sort();
  if (firstDests.length) {
    console.log('\n⚪ **그 지역의 첫 견적서라 아직 견줄 동료가 없다 — 이 값이 기준선이 된다**');
    console.log('   (다음 견적서가 오면 둘이 서로 잰다. 지금은 「어긋났다」고 말하지 않는다.)');
    console.log('─'.repeat(88));
    firstDests.forEach((d) => {
      const items = firstOnes[d].filter((x) => x.gap != null && Math.abs(x.gap) >= 0.5);
      const head = '  ' + d.padEnd(10) + firstOnes[d][0].file.slice(0, 40);
      if (!items.length) { console.log(head + '   (요율표와 큰 차이 없음)'); return; }
      console.log(head);
      items.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).forEach((x) => console.log(
        '      ' + x.field.padEnd(9) + x.value.toLocaleString().padStart(12) +
        '  vs 요율표 ' + x.rate.toLocaleString().padStart(10) + '  ' + pct(x.gap).padStart(7)));
    });
  }

  if (noDest.length) {
    console.log('\n⚪ 목적지를 못 정한 문서에서 자릿수가 이상한 ' + noDest.length + '개');
    noDest.sort((a, b) => b.ratio - a.ratio).forEach((x) => console.log(
      '  ' + x.field.padEnd(9) + x.value.toLocaleString().padStart(12) + '  ' +
      (x.low ? '작다' : '크다') + ' ' + x.ratio.toFixed(1) + '배  ' + x.via.padEnd(10) + x.file.slice(0, 40)));
  }
  if (errors.length) {
    console.log('\n추출 오류 ' + errors.length + '건');
    errors.forEach((e) => console.log('  · ' + e.file + ' — ' + e.err));
  }
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ misread, rateGap, noPeer, noDest }, null, 1), 'utf8');
    console.log('\n저장: ' + JSON_OUT);
  }
})();

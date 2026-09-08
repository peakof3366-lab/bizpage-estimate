/* ═══════════════════════════════════════════════════════════════════════════
   블랙다운 원가 시트 vs 우리 요율표 — 어느 칸이 어긋나 있나 (ZG)
   ───────────────────────────────────────────────────────────────────────────
   역검증(`backtest_quotes.js`)이 말하는 것: 목표선 안 15/36건이고, **아픈 쪽인
   「싸게 불렀다」가 12건**이다(최악 다낭 −41.9%). 지금까지 그 12건의 원인은
   **판매가 쪽에서만** 봤다 — 「엔진이 왜 싼가」를 견적서 총액으로 되짚는 방식이다.

   2026-09-07에 새 표본이 들어오면서 처음으로 **매입 쪽**이 손에 들어왔다:
   블랙다운 = 현지 랜드사가 **실제로 청구한 지상비 원가 시트**. 검산이 닫힌 43건에
   단가 줄이 853개 있다. 그런데 **그 853줄을 요율표와 대조한 도구가 없었다** —
   블랙다운을 읽는 도구는 `audit_bd_markup.js`(수익률) 하나뿐이었다.

   ── 자를 둘 쓴다. 하나는 통화가 필요하고, 하나는 필요 없다 ──────────────────

   🎯 **① 구성비 (통화 무관 · 이 도구의 본체)**
      「지상비 100원 중 호텔이 몇 원인가」를 랜드사 원가와 엔진에서 각각 재어 견준다.
      **비율이라 통화가 약분된다** — 엔화 문서든 동(VND) 문서든 그대로 쓸 수 있다.
      실측: 닫힌 43건 중 원화가 확실한 것은 소수고 나머지는 전부 현지 통화다.
      절대 단가만 고집하면 표본 대부분을 버리게 된다.
      ⚠ 구성비는 **어느 칸이 상대적으로 낮은가**만 말한다. 「얼마로 올려야 하나」는
        말하지 못한다 — 그건 ②가 할 일이다.

   💱 **② 절대 단가 (원화 문서만)**
      요율표 값과 1:1로 견준다. 「얼마로」까지 말할 수 있는 대신 표본이 적다.
      ⚠ **환율을 지어내 채우지 않았다.** 오늘 환율로 때우면 채점표가 망가진다는 것은
        이미 실측으로 확인된 것이다(결정대기열 0-f: 중앙값 5.1%·최대 12.1% 어긋남).
        외화 문서는 **통화별로 세어서 보고만** 한다 — 환율은 대표가 주실 값이다.

   🔴 **재는 자를 먼저 검산한다.** 2026-09-02 하루에 세 번 속은 자리다(YM·YF·YL).
     표를 내기 전에 스스로 확인하고 화면에 밝히는 것 넷:
       ① 칸으로 나눈 돈의 합 == 문서에서 읽은 합 (분류가 새면 여기서 걸린다)
       ② 목적지를 **문서 내용**으로 정했는가 — 폴더 이름은 근거가 아니다(_bd_files 실측)
       ③ 인원·일수가 머리글과 파일명에서 **어긋나지 않는가** (_bd_facts)
       ④ 분모가 **엔진이 쓰는 수**인가 (_bd_cells의 DENOM)

   ⚠ **이 표는 제안이지 판정이 아니다.** 요율 변경은 운영 DB 조작이라 사람이
     관리자 화면에서 누른다(변경 이력이 남아야 되돌릴 수 있다).
   ⚠ 요율표는 평시·기본 등급이고 원가에는 성수기·등급·협상력이 들어가 있다. 엔진은
     그 위에 계수(seasonFactor·hotelGrade·볼륨할인)를 **따로** 곱하므로, 이 표의
     배수를 그대로 요율에 넣으면 계수만큼 두 번 얹힌다.

   실행:
     node ai-loop/audit_bd_rate_gap.js
     node ai-loop/audit_bd_rate_gap.js --dest 다낭
     node ai-loop/audit_bd_rate_gap.js --doc 도쿄      # 그 문서의 계산을 눈으로
     node ai-loop/audit_bd_rate_gap.js --fresh-rates   # 운영 요율을 다시 받는다
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const { bdFiles } = require('./_bd_files.js');
const { extractBd, gridOf } = require('./_bd_extract.js');
const { cellOf, CELL_TO_RATE, NOT_COMPARED } = require('./_bd_cells.js');
const { bdFacts, stripWidgets } = require('./_bd_facts.js');
const { destFromName } = require('./_dest_from_name');
const { loadOverrides, applyOverrides } = require('./_rate_overrides');
const { golfScope } = require('./_golf_scope');
const destinationRates = require(path.join(ROOT, 'data.js'));

const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONLY = argOf('--dest');
const DOC = argOf('--doc');

/* `audit_rate_calibration.js`와 **같은 문턱**이다. 두 자가 다른 문턱을 쓰면
   같은 칸이 한쪽에서만 빨개져 판단이 갈린다. */
const LOUD = 2.0;
/* 원화로 볼 수 있는 1인 지상비의 하한. 외화 표시가 없는 문서에만 쓰는 **어림**이라,
   걸러낸 문서는 값과 함께 전부 찍는다 — 사람이 눈으로 뒤집을 수 있어야 한다. */
const KRW_FLOOR = 100000;
/* 구성비를 말할 수 있는 최소 칸 수. 호텔 하나만 읽힌 문서의 「호텔 100%」는
   구성비가 아니라 **덜 읽은 것**이다. */
const MIN_CELLS = 3;

const CELL_ORDER = ['호텔', '식사', '차량', '가이드', '관광'];
const FIELD_LABEL = {
  hotel_per_room: '호텔', meal_per_person: '식비',
  vehicle_small: '차량(소)', vehicle_large: '차량(대)',
  guide_fee: '가이드', sightseeing_fee: '관광',
};

const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());
const pct = (n) => (n == null ? '  —  ' : (n * 100).toFixed(1).padStart(5));
/* 한글은 화면에서 두 칸을 먹는다 — `padEnd`만 쓰면 한글 줄만 어긋난다 */
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

/* 문서를 한 번만 열어 **글과 격자를 함께** 돌려준다. 폴더 이름은 쓰지 않는다.
   ⚠ 글은 목적지·통화 판정용, 격자는 「4 박」·「5 일」 단위 칸용이다(_bd_facts). */
function readSheet(abs) {
  try {
    const wb = XLSX.read(fs.readFileSync(abs), { type: 'buffer', cellDates: true });
    const out = [], grids = [];
    for (const name of wb.SheetNames) {
      out.push(name);
      const g = gridOf(wb.Sheets[name]);
      grids.push(g);
      for (const row of g) for (const v of row) if (v !== null && v !== undefined) out.push(String(v));
    }
    return { text: out.join(' '), grids };
  } catch (e) { return { text: '', grids: [] }; }
}

(async () => {
  /* ⚠ **무엇으로 쟀는지 먼저 밝힌다.** 못 받았을 때 조용히 기본값으로 떨어지면
     「이미 고친 칸」을 또 고치라고 말하게 된다 — VB에서 실제로 그랬다. */
  const ov = await loadOverrides();
  const OV = ov.overrides || {};
  const nOv = applyOverrides(destinationRates, OV);

  const { files, root } = bdFiles(null, { quiet: true });
  console.log('■ ' + root);
  console.log('  요율 오버라이드 ' + nOv + '칸 적용 — ' + ov.from);
  console.log('  블랙다운을 읽는 중… (2~4분)\n');

  const drop = { 안닫힘: 0, 목적지: [], 어긋남: [], 인원일수: [], 요율표없음: [], 칸부족: [] };
  const docs = [];
  let bdCount = 0;

  /* ── 1차: 읽기만 한다. 목적지 판정은 아직 하지 않는다 ─────────────────────
     🔴 **두 번 도는 이유**: 문서가 스스로 목적지를 말한 것들에서 먼저
       「하나투어 견적번호 접두사 → 권역」을 **배워야** 하기 때문이다. 그 표가 있어야
       폴더 이름을 **검증**할 수 있다(아래 2차). 한 번에 돌면 배우기 전에 써 버린다. */
  const raw = [];
  for (const f of files) {
    let e;
    try { e = extractBd(f.abs); } catch (err) { continue; }
    if (e.kind !== 'bd') continue;
    bdCount++;
    if (!e.closedBy) { drop.안닫힘++; continue; }
    /* 🔴 시트에 붙은 환율 위젯을 먼저 걷어낸다 — 안 걷으면 「홍콩 달러 HKD」 같은
       **남의 통화 목록**이 목적지·통화 판정에 그대로 들어간다(도쿄 문서에 370개). */
    const sheet = readSheet(f.abs);
    const txt = stripWidgets(sheet.text);
    /* 🔴 **`f.rel`이 아니라 `basename`을 넘긴다.** rel에는 폴더 이름이 들어 있어서
       그대로 넘기면 「폴더는 근거가 아니다」라고 써 놓고 폴더로 판정하게 된다.
       첫 판에서 실제로 그랬다 — 스스로 세운 규칙을 스스로 어긴 자리다. */
    const base = path.basename(f.rel);
    const dn = destFromName(base, txt);
    const qn = f.quoteNo || (txt.match(/Q[A-Z]0{2}\d{9}/) || [])[0] || null;
    raw.push({ f, e, txt, base, dn, grids: sheet.grids, prefix: qn ? qn.slice(0, 2) : null });
  }

  /* ── 접두사 → 권역: **문서가 스스로 말한 건에서만** 배운다 ────────────────
     실측(2026-09-08): QJ는 일본 9건 · QA는 동남아 16건이고 **예외가 0건**이다.
     ⚠ 이건 도시가 아니라 **권역**이다. 「하노이 폴더인데 실은 다낭」은 못 잡는다.
       잡는 것은 「일본 문서가 베트남 폴더에 있다」 같은 **크게 어긋난 분류**이고,
       `_bd_files.js`가 기록한 실제 사고(같은 파일이 「대만」과 「시드니」 폴더에)가
       바로 그 유형이다. */
  const CLASSIFY = destinationRates.DEST_CLASSIFY || {};
  const regionOf = (key) => (CLASSIFY[key] || {}).region || null;
  const prefixRegions = {};
  for (const r of raw) {
    if (!r.dn.key || !r.prefix) continue;
    const rg = regionOf(r.dn.key);
    if (!rg) continue;
    (prefixRegions[r.prefix] = prefixRegions[r.prefix] || new Set()).add(rg);
  }

  /* ── 2차: 목적지를 확정하고 나머지를 판정한다 ───────────────────────────── */
  for (const { f, e, txt, base, dn, grids, prefix } of raw) {
    let destKey = dn.key, destFrom = dn.from, weak = false;

    /* 문서가 말하지 않았을 때만 폴더를 **후보**로 본다 — 그리고 문서 안의 견적번호로
       권역을 대조한다. 대조가 안 되면 쓰지 않는다(폴더는 답이 아니라 후보다).
       ⚠ 폴더 이름도 **같은 별칭표로** 정규화한다(「북해도」→「삿포로」). 여기서 따로
         이름을 맞추면 별칭표가 두 벌이 된다(결함 생성기 ①). */
    if (!destKey && f.folderHint) {
      const folderKey = (destFromName(f.folderHint) || {}).key;
      const want = folderKey ? regionOf(folderKey) : null;
      const seen = prefix ? prefixRegions[prefix] : null;
      if (want && seen && seen.size === 1 && seen.has(want)) {
        destKey = folderKey; destFrom = '폴더(번호권역 대조)'; weak = true;
      }
    }
    if (!destKey) { drop.목적지.push({ f: f.rel, why: dn.why, hint: f.folderHint, prefix }); continue; }
    const dest = destinationRates.find((d) => d.destination_key === destKey);
    if (!dest) { drop.요율표없음.push({ f: f.rel, key: destKey }); continue; }

    /* ③ 인원·일수·통화 */
    const facts = bdFacts(base, e.header, txt, { dayRows: e.dayRows, grids });
    if (facts.conflict.length) { drop.어긋남.push({ f: f.rel, why: facts.conflict.join(' · ') }); continue; }
    if (!(facts.pax > 0) || !(facts.days > 0)) {
      drop.인원일수.push({ f: f.rel, pax: facts.pax, days: facts.days });
      continue;
    }

    /* 칸별로 돈을 모은다. **문서 통화 그대로** — 구성비는 통화가 약분된다. */
    const cells = {};
    for (const x of (e.rows || [])) {
      const c = cellOf(x.label, x.group);
      cells[c] = (cells[c] || 0) + x.total;
    }
    const filled = CELL_ORDER.filter((c) => cells[c] > 0).length;
    if (filled < MIN_CELLS) {
      drop.칸부족.push({ f: f.rel, filled, cells: CELL_ORDER.filter((c) => cells[c] > 0).join('·') });
      continue;
    }

    docs.push({
      file: f.rel, hint: f.folderHint, destKey, destFrom, dest, weak,
      pax: facts.pax, days: facts.days, nights: facts.nights,
      paxFrom: facts.paxFrom, daysFrom: facts.daysFrom, cur: facts.currency,
      cells, sum: e.rowSum, golf: golfScope(txt).isGolfTrip,
    });
  }

  const dropLines = () => {
    console.log('📉 블랙다운 ' + bdCount + '건 → 쓸 수 있는 것 ' + docs.length + '건');
    console.log('   검산이 안 닫혀 뺌        ' + String(drop.안닫힘).padStart(3) + '건');
    console.log('   목적지를 못 정해 뺌      ' + String(drop.목적지.length).padStart(3) + '건');
    console.log('   요율표에 없는 목적지     ' + String(drop.요율표없음.length).padStart(3) + '건');
    console.log('   머리글·파일명이 어긋나 뺌 ' + String(drop.어긋남.length).padStart(3) + '건');
    console.log('   인원·일수를 못 읽어 뺌   ' + String(drop.인원일수.length).padStart(3) + '건');
    console.log('   칸이 ' + MIN_CELLS + '개 미만이라 뺌      ' + String(drop.칸부족.length).padStart(3) + '건');
  };
  if (!docs.length) {
    dropLines();
    console.log('\n🔴 쓸 수 있는 문서가 0건이다 — 위에서 가장 큰 수가 원인이다.');
    process.exit(1);
  }

  /* ── 🔴 자가 검산 ───────────────────────────────────────────────────────── */
  let mismatch = 0;
  for (const d of docs) {
    const s = Object.values(d.cells).reduce((a, b) => a + b, 0);
    if (Math.abs(s - d.sum) > Math.max(1, Math.abs(d.sum) * 1e-6)) mismatch++;
  }
  console.log('🔎 재는 자 검산');
  console.log('   칸 합계 = 문서 합계 : ' + (mismatch ? '🔴 ' + mismatch + '건 어긋남' : '✅ ' + docs.length + '건 전부 일치'));
  const strict = docs.filter((d) => !d.weak);
  console.log('   목적지 판정 출처    : 문서본문 ' + docs.filter((d) => d.destFrom === 'text').length
    + '건 · 파일명 ' + docs.filter((d) => d.destFrom === 'filename').length + '건'
    + ' · 📁폴더(번호권역 대조) ' + docs.filter((d) => d.weak).length + '건');
  console.log('   인원 출처           : 머리글 ' + docs.filter((d) => d.paxFrom === '머리글').length
    + '건 · 파일명 ' + docs.filter((d) => d.paxFrom === '파일명').length + '건');
  console.log('   일수 출처           : 머리글 ' + docs.filter((d) => /^머리글/.test(d.daysFrom)).length
    + '건 · 파일명 ' + docs.filter((d) => /^파일명/.test(d.daysFrom)).length
    + '건 · 본문N박M일 ' + docs.filter((d) => d.daysFrom === '본문N박M일').length
    + '건 · 표의 박·일 칸 ' + docs.filter((d) => d.daysFrom === '표의 박·일 칸').length + '건');
  if (docs.length !== strict.length) {
    console.log('   ⚠ 📁 = 문서가 목적지를 안 말해 **폴더 이름을 후보로 쓴 것**이다. 문서 안의');
    console.log('     하나투어 견적번호 접두사(권역)와 대조해 통과한 것만 받았다. 아래 합산은');
    console.log('     **문서 근거만**과 **폴더 포함**을 나란히 낸다 — 결론이 폴더에 기대고 있는지 보라.');
  }
  console.log('');
  dropLines();

  /* ── 통화 실태 ─────────────────────────────────────────────────────────── */
  const byCur = {};
  docs.forEach((d) => {
    const k = d.cur.code;
    byCur[k] = byCur[k] || { n: 0, dests: new Set() };
    byCur[k].n++; byCur[k].dests.add(d.destKey);
  });
  console.log('\n💱 문서가 밝힌 통화');
  Object.entries(byCur).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => {
    console.log('   ' + wpad(k, 6) + String(v.n).padStart(3) + '건   ' + [...v.dests].join(' · '));
  });
  console.log('   ⚠ `KRW?` = 외화 표시가 없어 원화로 **보이는** 것이다. 문서가 밝힌 것이 아니다.');
  console.log('     (「원가」라는 열 이름은 통화가 아니다 — 큐슈 문서가 그 함정이다.)');

  /* ── --doc: 한 문서의 계산을 통째로 눈으로 (검산용) ── */
  if (DOC) {
    const key = DOC.normalize('NFC');
    const hit = docs.filter((d) => d.file.normalize('NFC').includes(key));
    if (!hit.length) { console.log('\n그런 문서가 없습니다: ' + DOC); process.exit(0); }
    for (const d of hit) {
      const cmpSum = CELL_ORDER.reduce((a, c) => a + (d.cells[c] || 0), 0);
      console.log('\n■ ' + d.file);
      console.log('   ' + d.destKey + '(' + d.destFrom + ') · 인원 ' + d.pax + '(' + d.paxFrom + ')'
        + ' · ' + d.nights + '박' + d.days + '일(' + d.daysFrom + ') · ' + d.cur.code
        + (d.golf ? ' · ⛳골프' : ''));
      console.log('   ' + wpad('칸', 7) + '원가'.padStart(14) + '  비중  |  엔진 분모  요율        엔진금액   비중');
      for (const cell of CELL_ORDER) {
        const spec = CELL_TO_RATE[cell];
        const amt = d.cells[cell] || 0;
        const den = spec.denom(d);
        const field = spec.field(d);
        const eng = den > 0 ? Number(d.dest[field] || 0) * den : null;
        console.log('   ' + wpad(cell, 7) + won(amt).padStart(14) + pct(cmpSum ? amt / cmpSum : null)
          + '%  |  ' + String(den == null ? '—' : den).padStart(6) + ' (' + spec.unit + ') '
          + won(d.dest[field]).padStart(10) + ' ' + won(eng).padStart(12));
      }
      for (const cell of Object.keys(NOT_COMPARED))
        if (d.cells[cell]) console.log('   ' + wpad(cell, 7) + won(d.cells[cell]).padStart(14) + '   — 대조 안 함: ' + NOT_COMPARED[cell]);
    }
    process.exit(0);
  }

  /* ═══ ① 구성비 — 통화 무관 ══════════════════════════════════════════════
     지상비 100 중 이 칸이 몇인가. 랜드사 원가와 엔진에서 각각 재어 견준다.
     ⚠ 분모는 **양쪽 다 「대조하는 5칸의 합」**이다. 한쪽에만 부대·미분류를 넣으면
       비중이 통째로 밀린다. 엔진은 그 칸을 아예 못 만드므로 양쪽에서 뺀다. */
  /* 🔴 **문서에 없는 칸을 0%로 세지 않는다.** 첫 판에서 「대만 가이드 0% vs 엔진
     10.7%」·「오사카 가이드 0% vs 19.0%」가 나왔는데, 그 문서에 가이드 줄이 아예
     없어서였다(항공처럼 불포함이거나 다른 시트에 있다). 그걸 「엔진이 두껍다」로
     읽으면 **없는 것을 틀린 것으로** 세는 것이고, 게다가 그 0%가 다른 칸의 비중을
     통째로 부풀린다.
     → **양쪽 분모를 「그 문서에 실제로 있는 칸」으로 맞춘다.** 같은 것끼리 견준다. */
  const mix = {};   /* destKey → cell → [{real, eng, file, golf}] */
  for (const d of docs) {
    const present = CELL_ORDER.filter((c) => d.cells[c] > 0);
    if (present.length < MIN_CELLS) continue;
    const realSum = present.reduce((a, c) => a + d.cells[c], 0);
    const engAmt = {};
    let engSum = 0;
    for (const cell of present) {
      const spec = CELL_TO_RATE[cell];
      const den = spec.denom(d);
      const v = den > 0 ? Number(d.dest[spec.field(d)] || 0) * den : 0;
      engAmt[cell] = v; engSum += v;
    }
    if (!(realSum > 0) || !(engSum > 0)) continue;
    mix[d.destKey] = mix[d.destKey] || { files: [], cells: {} };
    mix[d.destKey].files.push({ file: d.file, golf: d.golf, weak: d.weak });
    for (const cell of present) {
      mix[d.destKey].cells[cell] = mix[d.destKey].cells[cell] || [];
      mix[d.destKey].cells[cell].push({
        real: d.cells[cell] / realSum, eng: engAmt[cell] / engSum,
        file: d.file, golf: d.golf, weak: d.weak,
      });
    }
  }

  console.log('\n' + '═'.repeat(92));
  console.log('🎯 ① 구성비 — 지상비 100 중 이 칸이 몇인가  (통화 무관 · 전 표본)');
  console.log('═'.repeat(92));
  console.log('   「원가>엔진」이면 랜드사가 그 칸에 더 썼다는 뜻 = **엔진이 그 칸을 얇게 잡고 있다.**');

  const allDests = Object.keys(mix).sort((a, b) => mix[b].files.length - mix[a].files.length);
  const bigGaps = [];
  for (const destKey of allDests) {
    if (ONLY && destKey !== ONLY) continue;
    const o = mix[destKey];
    const golfN = o.files.filter((x) => x.golf).length;
    const weakN = o.files.filter((x) => x.weak).length;
    console.log('\n▪ ' + destKey + '  (블랙다운 ' + o.files.length + '건'
      + (golfN ? ' · ⛳' + golfN : '') + (weakN ? ' · 📁' + weakN : '') + ')');
    console.log('     ' + wpad('칸', 7) + '원가비중   엔진비중      차이   표본');
    for (const cell of CELL_ORDER) {
      const list = o.cells[cell] || [];
      /* ⚠ 표본 수를 칸마다 따로 찍는다 — **문서에 그 칸이 있을 때만** 세기 때문에
         칸별로 다르다. 「3건」이라 적어 놓고 실은 1건인 칸이 있으면 안 된다. */
      if (!list.length) {
        console.log('     ' + wpad(cell, 7) + '   —        —          —     0건  (그 칸이 있는 문서가 없다)');
        continue;
      }
      const r = median(list.map((x) => x.real));
      const g = median(list.map((x) => x.eng));
      const diff = r - g;
      const loud = Math.abs(diff) >= 0.10;
      console.log('     ' + wpad(cell, 7) + pct(r) + '%   ' + pct(g) + '%   '
        + (diff >= 0 ? '+' : '') + (diff * 100).toFixed(1).padStart(5) + 'pp'
        + String(list.length).padStart(4) + '건'
        + (loud ? (diff > 0 ? '  🔴 엔진이 얇다' : '  🔵 엔진이 두껍다') : ''));
      if (loud && list.length >= 2) bigGaps.push({ destKey, cell, r, g, diff, n: list.length, golfN });
    }
  }

  console.log('\n' + '═'.repeat(92));
  console.log('🔴 표본 2건 이상 · 10pp 넘게 벌어진 칸 — 폭을 줄이려면 여기부터다');
  console.log('═'.repeat(92));
  if (!bigGaps.length) console.log('  없다.');
  bigGaps.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).forEach((x) => {
    console.log('  ' + wpad(x.destKey, 12) + wpad(x.cell, 7)
      + '원가 ' + pct(x.r) + '%  엔진 ' + pct(x.g) + '%   '
      + (x.diff >= 0 ? '+' : '') + (x.diff * 100).toFixed(1).padStart(5) + 'pp'
      + '  (' + x.n + '건)' + (x.diff > 0 ? '  ← 엔진이 얇게 잡는다' : '  ← 엔진이 두껍게 잡는다')
      + (x.golfN ? '  ⛳' + x.golfN : ''));
  });

  /* ── 🔴 합산을 내기 전에 **표본이 어느 쪽으로 쏠렸는지** 먼저 말한다 ──────────
     실측(2026-09-08): 표본이 10 → 13 → 16으로 늘 때 호텔이 **−12.6pp → −4.8pp →
     +2.8pp**로 **부호까지 뒤집혔다.** 원인은 잡음이 아니라 **구성**이다 — 새로 읽힌
     4건이 전부 일본(하나투어재팬) 문서였고, 일본 원가는 호텔 비중이 높다(도쿄 58.5%).
     즉 이 합산은 「엔진의 계통 편향」이 아니라 **「어느 나라 문서가 읽혔나」**를 재고 있다.
     → 쏠림을 숨기면 다음에 읽는 사람이 이 표를 그대로 믿는다. 그래서 먼저 찍는다. */
  const byRegion = {};
  for (const d of docs) {
    const rg = regionOf(d.destKey) || '(분류 없음)';
    byRegion[rg] = (byRegion[rg] || 0) + 1;
  }
  const regionRank = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
  console.log('\n🧭 표본 구성 — ' + regionRank.map(([k, v]) => k + ' ' + v).join(' · '));
  const topShare = regionRank.length ? regionRank[0][1] / docs.length : 0;
  if (topShare >= 0.4) {
    console.log('   🔴 **「' + regionRank[0][0] + '」가 표본의 ' + Math.round(topShare * 100)
      + '%다 — 아래 합산은 계통 편향이 아니라 이 쏠림을 재고 있을 수 있다.**');
    console.log('      실측: 표본이 10→13→16으로 늘 때 호텔이 -12.6pp → -4.8pp → +2.8pp로 **부호까지 뒤집혔다.**');
    console.log('      권역별로 원가 구성이 다르기 때문이다(일본은 호텔이 두껍다). **목적지별 표를 보라.**');
  }

  /* 전 목적지 합산 — 계통 편향이 있는지.
     🔴 **문서 근거만**과 **폴더 포함**을 나란히 낸다. 둘이 같은 말을 하면 결론이
       폴더에 기대고 있지 않다는 뜻이고, 갈라지면 그 자체가 발견이다. */
  console.log('\n── 전 표본 합산 (목적지 무관) — 계통 편향이 있는가');
  console.log('   ' + wpad('칸', 7) + '      문서 근거만            │      📁폴더 포함');
  for (const cell of CELL_ORDER) {
    const all = allDests.flatMap((k) => mix[k].cells[cell] || []);
    if (!all.length) continue;
    const line = (list) => {
      if (!list.length) return wpad('—', 30);
      const r = median(list.map((x) => x.real));
      const g = median(list.map((x) => x.eng));
      return '원가 ' + pct(r) + '%  엔진 ' + pct(g) + '%  '
        + ((r - g) >= 0 ? '+' : '') + ((r - g) * 100).toFixed(1).padStart(5) + 'pp (' + String(list.length).padStart(2) + '건)';
    };
    console.log('   ' + wpad(cell, 7) + line(all.filter((x) => !x.weak)) + ' │ ' + line(all));
  }

  /* ═══ ② 절대 단가 — 원화 문서만 ═════════════════════════════════════════ */
  const krwDocs = docs.filter((d) => {
    if (d.cur.sure) return false;                       /* 외화 표시가 있으면 아니다 */
    return d.sum / d.pax >= KRW_FLOOR;                  /* 크기가 원화로 말이 되는가 */
  });
  console.log('\n' + '═'.repeat(92));
  console.log('💱 ② 절대 단가 — **원화 문서 ' + krwDocs.length + '건만** (환율을 지어내지 않았다)');
  console.log('═'.repeat(92));
  const notKrw = docs.filter((d) => !krwDocs.includes(d));
  if (notKrw.length) {
    const grp = {};
    notKrw.forEach((d) => {
      const k = d.cur.sure ? d.cur.code : 'KRW?(1인 ' + won(d.sum / d.pax) + ' — 원화로 보기엔 작다)';
      grp[k] = grp[k] || [];
      grp[k].push(d.destKey);
    });
    console.log('   ⛔ 빠진 ' + notKrw.length + '건 — **환율만 있으면 그대로 열린다**:');
    Object.entries(grp).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) =>
      console.log('      ' + wpad(k, 10) + String(v.length).padStart(2) + '건   ' + [...new Set(v)].join(' · ')));
  }
  if (!krwDocs.length) console.log('   원화 문서가 없다.');
  else {
    const obs = {};
    for (const d of krwDocs) {
      obs[d.destKey] = obs[d.destKey] || { files: [], cells: {} };
      obs[d.destKey].files.push(d.file);
      for (const cell of CELL_ORDER) {
        const spec = CELL_TO_RATE[cell];
        const amt = d.cells[cell];
        const den = spec.denom(d);
        if (!(amt > 0) || !(den > 0)) continue;
        const field = spec.field(d);
        obs[d.destKey].cells[field] = obs[d.destKey].cells[field] || [];
        obs[d.destKey].cells[field].push({ v: amt / den, golf: d.golf });
      }
    }
    Object.keys(obs).sort((a, b) => obs[b].files.length - obs[a].files.length).forEach((destKey) => {
      if (ONLY && destKey !== ONLY) return;
      const dest = destinationRates.find((d) => d.destination_key === destKey);
      console.log('\n▪ ' + destKey + '  (원화 블랙다운 ' + obs[destKey].files.length + '건)');
      Object.keys(FIELD_LABEL).forEach((field) => {
        const list = obs[destKey].cells[field] || [];
        const base = Number(dest[field]) || 0;
        if (!list.length || !base) return;
        const med = median(list.map((x) => x.v));
        const ratio = med / base;
        const fromOv = typeof ((OV[destKey] || {})[field]) === 'number';
        const golfN = list.filter((x) => x.golf).length;
        console.log('   ' + wpad(FIELD_LABEL[field], 9)
          + '요율 ' + won(base).padStart(11) + (fromOv ? ' 📌' : '   ')
          + '  원가중앙 ' + won(med).padStart(11)
          + '  (' + list.length + '건' + (list.length < 2 ? ' ⚠표본1' : '') + ')'
          + '   ' + (ratio >= 1 ? '×' + ratio.toFixed(2) : '÷' + (1 / ratio).toFixed(2)).padStart(7)
          + ((ratio >= LOUD || ratio <= 1 / LOUD) ? '  🔴' : '')
          + (golfN ? '  ⛳' + golfN + '/' + list.length : ''));
      });
    });
  }

  /* ═══ 엔진이 낼 수 없는 돈 ═══════════════════════════════════════════════
     🔴 요율로는 못 고친다. 견적서 PDF 쪽에서 「돈의 12.4%가 우리 9칸 밖」을 알아낸
       것과 같은 자리인데, 이번엔 **원가 쪽에서** 같은 것을 잰다.
     ⚠ 문서마다 통화가 달라 금액을 더할 수 없다 — **문서별 비중의 중앙값**으로 낸다. */
  console.log('\n' + '═'.repeat(92));
  console.log('■ 엔진이 낼 수 없는 돈 — 요율표에 칸이 없는 원가 (문서별 비중의 중앙값)');
  console.log('═'.repeat(92));
  const outsideShares = {};
  const totalOutside = [];
  for (const d of docs) {
    const all = Object.values(d.cells).reduce((a, b) => a + b, 0);
    if (!(all > 0)) continue;
    let o = 0;
    for (const cell of Object.keys(NOT_COMPARED)) {
      const s = (d.cells[cell] || 0) / all;
      (outsideShares[cell] = outsideShares[cell] || []).push(s);
      o += s;
    }
    totalOutside.push(o);
  }
  for (const [cell, arr] of Object.entries(outsideShares).sort((a, b) => median(b[1]) - median(a[1])))
    console.log('   ' + wpad(cell, 7) + pct(median(arr)) + '%   ' + NOT_COMPARED[cell]);
  console.log('   ' + wpad('합', 7) + pct(median(totalOutside)) + '%  ← 이만큼은 **요율을 고쳐도 안 줄어든다**');

  /* ── 폴더 이름 vs 문서 판정 ── */
  const clash = docs.filter((d) => d.hint && d.hint !== d.destKey);
  console.log('\n📁 폴더 이름과 문서 판정이 다른 것 ' + clash.length + '건 / ' + docs.length);
  clash.slice(0, 12).forEach((d) => console.log('   폴더「' + d.hint + '」 → 문서 「' + d.destKey + '」  ' + path.basename(d.file).slice(0, 52)));
  if (clash.length > 12) console.log('   … 그 밖 ' + (clash.length - 12) + '건');
  if (clash.length) {
    console.log('   ⚠ 「북해도→삿포로」처럼 **같은 곳의 다른 이름**이면 정상이다.');
    console.log('     다른 곳이면 그 문서를 열어 봐야 한다 — 폴더가 틀렸을 수도, 판정이 틀렸을 수도 있다.');
  }

  /* ── 뺀 것들을 이름과 함께 ── */
  const showDrop = (title, arr, fmt) => {
    if (!arr.length) return;
    console.log('\n▫ ' + title + ' ' + arr.length + '건');
    arr.slice(0, 12).forEach((x) => console.log('   · ' + fmt(x)));
    if (arr.length > 12) console.log('   … 그 밖 ' + (arr.length - 12) + '건');
  };
  showDrop('머리글과 파일명이 어긋나 뺐다 — **고르지 않는다**', drop.어긋남,
    (x) => wpad(x.why, 40) + path.basename(x.f).slice(0, 46));
  showDrop('목적지를 못 정해 뺐다 (폴더 힌트는 참고일 뿐 답이 아니다)', drop.목적지,
    (x) => wpad(String(x.hint || '—'), 10) + wpad(x.why, 26) + path.basename(x.f).slice(0, 46));
  showDrop('인원·일수를 못 읽어 뺐다', drop.인원일수,
    (x) => '인원 ' + (x.pax || '?') + ' · 일수 ' + (x.days || '?') + '  ' + path.basename(x.f).slice(0, 50));
  showDrop('칸이 ' + MIN_CELLS + '개 미만이라 뺐다 (덜 읽은 것을 구성비라 부르지 않는다)', drop.칸부족,
    (x) => wpad(x.cells || '—', 20) + path.basename(x.f).slice(0, 50));
  showDrop('요율표에 없는 목적지', drop.요율표없음, (x) => wpad(x.key, 12) + path.basename(x.f).slice(0, 50));

  console.log('\n' + '─'.repeat(92));
  console.log('⚠ 읽는 법');
  console.log('  · 구성비의 「엔진이 얇다」는 **그 칸의 요율이 낮다**는 뜻의 후보다. 다만 비중은');
  console.log('    다른 칸이 두꺼워도 얇아 보인다 — 한 칸만 보고 올리면 나머지가 그만큼 밀린다.');
  console.log('  · ⛳ = 골프 여행 문서. 조가 갈려 있어 차량·관광·식비가 조 인원으로 나뉜 값이라 부푼다(YF).');
  console.log('  · 📌 = 운영 DB에서 사람이 이미 실측으로 고친 칸. 그런데도 벌어졌다면 표본부터 의심한다.');
  console.log('  · 식비의 「1인 1일」은 엔진이 그렇게 곱하기 때문이다(RO). 요율의 식비가 무슨 뜻인지는');
  console.log('    **아직 대표 결정 전이다**(결정대기열 0-n) — 그 결정이 이 칸의 해석을 바꾼다.');
})();

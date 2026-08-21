/* ═══════════════════════════════════════════════════════════════════════════
   버스 1대당 실제 배차 인원 감사 (SD)
   ───────────────────────────────────────────────────────────────────────────
   엔진은 `대형버스 대수 = ceil(인원 ÷ VEHICLE_CAPACITY.large)`로 차량비와 가이드
   인원을 함께 정한다(`guideCount = vehicleCount`). 그래서 **정원 하나가 두 항목을
   동시에 움직인다.** 지금 값은 45다.

   그런데 실측에서 어긋났다. 삿포로 135명 건의 견적서는 대형버스를 **4대** 물렸는데
   ceil(135÷45)=3대라 엔진이 1대를 덜 센다. 1인당 차량+가이드가 약 43,000원 낮게
   나오고, 그 방향이 하필 **원가 미달** 쪽이다.

   이 감사기는 견적서에서 (인원, 실제 대수)를 뽑아 **1대당 실제 탑승 인원**을 센다.
   정원은 추측하지 않고 여기서 나온 분포로 정한다.

   ⚠ 대수를 읽는 법 — 차량 줄은 `대당1일단가 × 일수 × 대수 = 총액`이다. 그런데
   **수량 열과 횟수 열의 순서가 양식마다 다르다**(CLAUDE.md). 게다가 4일 일정에
   4대면 두 숫자가 똑같아 순서로는 못 가린다. 그래서 순서를 믿지 않고
   `대수 = 총액 ÷ (단가 × 일수)`로 역산한다 — 일수는 문서에서 따로 읽은 값이다.

   실행: node ai-loop/audit_bus_capacity.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const CORPUS = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

/* 대형버스로 볼 낱말. ⚠ 벤·승합·스타렉스는 **소형**이라 뺀다 — 섞으면 정원이 낮게 나온다. */
const LARGE = /대형\s*버스|45\s*인승|47\s*인승|리무진\s*버스|대형차/i;
const SMALL = /벤|승합|스타렉스|미니|카니발|\d{1,2}\s*인승\s*(벤|승합)/i;

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const rows = [];
  const skipped = [];
  for (const f of files) {
    let r;
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      r = await X.extractQuote(buf, pdfParse, {});
    } catch (e) { skipped.push({ f, why: '추출 오류' }); continue; }

    const pax = r.pax;
    const days = (r.dates && (r.dates.days || (r.dates.nights ? r.dates.nights + 1 : 0))) || 0;
    if (!pax || pax < 2) { skipped.push({ f, why: '인원 불명' }); continue; }
    if (!days) { skipped.push({ f, why: '일수 불명' }); continue; }

    const cands = (r.candidates || []).filter((c) => {
      const s = (c.label || '') + ' ' + (c.note || '');
      return LARGE.test(s) && !SMALL.test(s);
    });
    if (!cands.length) { skipped.push({ f, why: '대형버스 줄 없음' }); continue; }

    /* 같은 버스 줄이 페이지마다 반복될 수 있다 — 총액이 가장 큰 한 줄만 본다. */
    const c = cands.slice().sort((a, b) => b.total - a.total)[0];
    /* 대수 = 총액 ÷ (대당1일단가 × 일수). 순서를 안 믿는 이유는 머리말 참고. */
    const raw = c.total / (c.unit * days);
    const buses = Math.round(raw);
    /* 정수에서 크게 벗어나면 우리가 단가·일수를 잘못 읽은 것이다 — 조용히 반올림하지 않는다. */
    if (!buses || Math.abs(raw - buses) > 0.12) {
      skipped.push({ f, why: '대수가 정수로 안 떨어짐 (' + raw.toFixed(2) + '대) — 단가·일수 오독 의심' });
      continue;
    }
    /* ⚠ 정수로 떨어져도 말이 안 되는 것이 있다 — 실측에서 「30명 / 110대」가 나왔다
       (「미•샌딩 45인승 $ 110」의 110은 대수가 아니라 1인 달러 단가였다).
       버스 한 대에 5명 미만이면 그건 배차가 아니라 우리가 잘못 읽은 것이다. */
    const perBus = pax / buses;
    if (perBus < 5) {
      skipped.push({ f, why: '1대당 ' + perBus.toFixed(1) + '명 — 대수 자리를 잘못 읽었다(단가로 보임)' });
      continue;
    }
    rows.push({ f, pax, days, buses, perBus, label: c.label || '' });
  }

  rows.sort((a, b) => a.perBus - b.perBus);
  console.log('════ 대형버스 1대당 실제 탑승 인원 ════\n');
  console.log('인원  일수  대수   1대당    라벨 / 파일');
  console.log('─'.repeat(92));
  rows.forEach((r) => console.log(
    String(r.pax).padStart(4) + String(r.days).padStart(5) + String(r.buses).padStart(6) +
    r.perBus.toFixed(1).padStart(9) + '    ' +
    String(r.label).slice(0, 16).padEnd(18) + r.f.slice(0, 34)));
  console.log('─'.repeat(92));

  if (rows.length) {
    const per = rows.map((r) => r.perBus).sort((a, b) => a - b);
    const max = per[per.length - 1];
    console.log('표본 ' + rows.length + '건 · 1대당 최소 ' + per[0].toFixed(1) +
      ' · 중앙값 ' + per[Math.floor(per.length / 2)].toFixed(1) + ' · **최대 ' + max.toFixed(1) + '**');
    console.log('\n⚠ 정원을 정할 때 봐야 하는 것은 평균이 아니라 **최대**다.');
    console.log('  "이만큼까지는 한 대에 태우더라"의 상한이 곧 정원이기 때문이다.');
    console.log('  실측 최대 ' + max.toFixed(1) + '명 → 정원 후보 ' + Math.ceil(max) + '명.');
    /* ⚠ **엔진에서 읽는다**(VL). 여기 숫자를 적어 두었더니 45로 굳어 있었는데 엔진은
       이미 38이었다 — 「지금 정원 45로는 N건이 어긋난다」가 통째로 틀린 진단이었다.
       VB의 「자가 낡은 값으로 재고 있었다」와 같은 자리다. */
    const CUR = require('./_engine_consts').vehicleCapacity().large;
    const fit = (cap) => rows.filter((r) => Math.ceil(r.pax / cap) === r.buses).length;
    console.log('\n지금 정원 ' + CUR + ' 로는 ' + (rows.length - fit(CUR)) + '/' + rows.length + '건이 실측 대수와 어긋난다.');
    /* 정원을 하나 고르는 게 아니라 **데이터가 허용하는 구간**을 찾는다.
       실측 대수를 전부 맞추는 정원이 여럿이면, 그 사이에서 고르는 것은 값 판단이지
       측정이 아니다 — 그 구분을 흐리지 않는다. */
    const okCaps = [];
    for (let cap = 20; cap <= 60; cap++) if (fit(cap) === rows.length) okCaps.push(cap);
    console.log('실측 대수를 **전부** 맞추는 정원: ' +
      (okCaps.length ? okCaps[0] + ' ~ ' + okCaps[okCaps.length - 1] + ' (' + okCaps.length + '개 값)' : '없음'));
    if (okCaps.length) {
      const bind = rows.filter((r) => Math.ceil(r.pax / (okCaps[0] - 1)) !== r.buses)
        .map((r) => r.pax + '명/' + r.buses + '대').join(', ');
      console.log('  · 아래쪽을 묶는 건: ' + (bind || '없음') + '  → 정원이 이보다 작으면 대수가 더 나온다');
      const bind2 = rows.filter((r) => Math.ceil(r.pax / (okCaps[okCaps.length - 1] + 1)) !== r.buses)
        .map((r) => r.pax + '명/' + r.buses + '대').join(', ');
      console.log('  · 위쪽을 묶는 건: ' + (bind2 || '없음') + '  → 정원이 이보다 크면 대수가 모자란다');
      console.log('\n  ⚠ 이 구간 안에서 어느 값을 쓸지는 **측정이 아니라 판단**이다.');
      console.log('    작게 잡으면 대수가 늘어 견적이 오른다(원가 미달을 덜 낸다).');
      /* ⚠ 예전엔 이 줄을 **무조건** 찍었다. 상수를 엔진에서 읽게 되자 지금 값이 구간
         안일 수도 있는데, 그때도 「밖이다」라고 말하면 그게 새 거짓말이 된다. */
      console.log(okCaps.includes(CUR)
        ? '    지금 정원 ' + CUR + '은 이 구간 **안**이다 — 데이터가 배제하지 않는다.'
        : '    지금 정원 ' + CUR + '은 이 구간 **밖**이다 — 데이터가 배제한다.');
    }
    console.log('\n정원별 일치 건수:');
    for (let cap = 30; cap <= 46; cap += 2) {
      console.log('  정원 ' + String(cap).padStart(2) + ' → ' + String(fit(cap)).padStart(2) + '/' + rows.length +
        '건' + (fit(cap) === rows.length ? '  ← 전부 맞음' : ''));
    }
  }

  console.log('\n──── 제외 ' + skipped.length + '건 ────');
  const byWhy = {};
  skipped.forEach((s) => { (byWhy[s.why] = byWhy[s.why] || []).push(s.f); });
  Object.keys(byWhy).sort((a, b) => byWhy[b].length - byWhy[a].length)
    .forEach((w) => console.log('  ' + String(byWhy[w].length).padStart(2) + '건  ' + w));
})();

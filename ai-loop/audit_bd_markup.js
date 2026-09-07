/* ═══════════════════════════════════════════════════════════════════════════
   「원가에 얼마가 얹혀 고객가가 되는가」 — 문서가 스스로 밝힌 것만 모은다 (ZA)
   ───────────────────────────────────────────────────────────────────────────
   2026-09-07 대표가 「우선 하나투어 10% + 비즈페이지 10%로 정리하고 차후에 맞춰가자」고
   하셨다. 이 도구는 **그 퍼센트를 언젠가 실측으로 바꾸기 위한 자**다.

   ⚠ **가정을 검산하지 않는다.** `_bd_revenue.js`의 10%+10%는 우리가 정한 값이라,
     그것으로 만든 가상 판매가를 여기서 다시 재면 아무것도 증명하지 못한다.
     여기서 재는 것은 **문서에 원래 적혀 있던 숫자**뿐이다.

   돈이 세 번 얹힌다. 층마다 근거가 다른 문서에 있다:

     ① 랜드사(DMC) 수익   블랙다운 안에 「DMC 수익」「협력사 수익」 줄로 들어 있다
     ② 하나투어 수익      견적서에 「하나수익」「입금가」로 나뉘어 적힌 문서가 있다
     ③ 대리점(우리) 수익  견적서에 「대리점수익」 또는 「알선 수수료」로 적혀 있다

   🔴 **①은 이미 블랙다운 합계 안에 들어 있다.** 그래서 대표 결정(「지상비에 붙인다」)의
     지상비 = 랜드사 수익이 포함된 **하나투어 매입가**다. 실측으로 확인했다 —
     나트랑 3건에서 「인당 공급가(원화) ÷ 우리가 읽은 1인당(USD)」이 1523·1501·1522로
     전부 그때 환율이었다. 랜드사가 그 위에 따로 더 얹지 않는다.

   ⚠ **표본이 작다.** 층 ②·③이 숫자로 적힌 견적서는 코퍼스 45건 중 몇 건뿐이다.
     그래서 이 도구는 **중앙값을 계수로 굳히지 않고** 분포를 그대로 보여준다.
     계수로 굳히는 것은 표본이 는 다음이고, 그때도 대표 결정이 필요하다(실거래가).

   실행: node ai-loop/audit_bd_markup.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { corpusFiles } = require('./_corpus_files.js');
const { bdFiles } = require('./_bd_files.js');
const { extractBd } = require('./_bd_extract.js');
const { ASSUMPTION } = require('./_bd_revenue.js');

const CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const n = (s) => Number(String(s).replace(/[^\d.]/g, '')) || null;
const pct = (x) => (x * 100).toFixed(2) + '%';
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);

/* ── ① 랜드사 수익 — 블랙다운이 스스로 밝힌 줄 ─────────────────────────────── */
const PROFIT_ROW = /(DMC\s*수익|협력사\s*수익|랜드\s*수익|회사\s*수익|랜드\s*수수료|유로존\s*수수료|DMC\s*수수료|^수익$)/i;
function landProfit() {
  const out = [];
  const { files } = bdFiles(null, { quiet: true });
  for (const f of files) {
    const e = extractBd(f.abs);
    /* 🔴 **검산이 닫힌 문서만.** 안 닫힌 문서의 합은 분모로 못 쓴다 — 덜 읽은 원가로
       나누면 수익률이 부풀어 오른다(그리고 그건 조용히 틀린 값이다). */
    if (e.kind !== 'bd' || !e.closedBy) continue;
    const rows = e.rows.filter((x) => PROFIT_ROW.test(String(x.label || '')) || PROFIT_ROW.test(String(x.group || '')));
    const p = rows.reduce((a, x) => a + x.total, 0);
    if (p <= 0) continue;
    const base = e.rowSum - p;
    if (base <= 0) continue;
    out.push({ file: path.basename(f.rel), rate: p / base, profit: p, base });
  }
  return out;
}

/* ── ②③ 견적서가 밝힌 층 ──────────────────────────────────────────────────
   두 양식이 있다:
     ㉮ 「하나수익 / 입금가 / 대리점수익 / 판매가」가 **안(案)별로 나란히** 적힌 표
     ㉯ 「알선 수수료 <단가> <인원> <총액>」 + 「1인 여행경비/객단가」 */
const L_HANA = /^하나\s*수익\s*([\d,\s.]+)$/;
const L_DEPOSIT = /^입금가\s*([\d,\s.]+)$/;
const L_AGENCY = /^대리점\s*수익\s*([\d,\s.]+)$/;
const L_SELL = /^판매가\s*([\d,\s.]+)$/;
const L_FEE = /알선\s*수수료\s*([\d,]{4,})\s+(\d{1,4})\s+([\d,]{5,})/;
const L_FEE_PCT = /알선\s*수수료\s*\(\s*(\d{1,2}(?:\.\d)?)\s*%\s*\)/;
const L_PP = /1\s*인\s*(?:여행경비|객단가|상품가)[^\d]*([\d,]{5,})/;

function nums(s) { return String(s).trim().split(/\s+/).map(n).filter((x) => x !== null); }

async function quoteLayers() {
  const { files } = corpusFiles(CORPUS, { quiet: true });
  const out = [];
  for (const f of files) {
    let text;
    try { text = (await pdf(fs.readFileSync(path.join(CORPUS, f)))).text; } catch (e) { continue; }
    const lines = text.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const pick = (re) => { for (const l of lines) { const m = l.match(re); if (m) return m; } return null; };

    /* ㉮ 층이 전부 적힌 표 — 안이 여럿이면 안마다 한 줄씩 낸다 */
    const hana = pick(L_HANA), dep = pick(L_DEPOSIT), agc = pick(L_AGENCY), sell = pick(L_SELL);
    if (hana && dep && agc) {
      const H = nums(hana[1]), D = nums(dep[1]), A = nums(agc[1]), S = sell ? nums(sell[1]) : [];
      const k = Math.min(H.length, D.length, A.length);
      for (let i = 0; i < k; i++) {
        const cost = D[i] - H[i];                    /* 입금가에서 하나수익을 뺀 것이 매입원가 */
        if (cost <= 0) continue;
        out.push({
          file: f, 안: k > 1 ? '안' + (i + 1) : null, 근거: '층이 표로 적혀 있다',
          원가: cost, 하나수익: H[i], 입금가: D[i], 대리점수익: A[i],
          판매가: S[i] || D[i] + A[i],
          하나율: H[i] / cost, 대리점율: A[i] / D[i],
          총배수: (S[i] || D[i] + A[i]) / cost,
        });
      }
      continue;
    }

    /* ㉯ 알선 수수료 + 1인 여행경비 */
    const fee = pick(L_FEE), pp = pick(L_PP), fpct = pick(L_FEE_PCT);
    if (fee && pp) {
      const unit = n(fee[1]), sellPP = n(pp[1]);
      if (unit && sellPP && sellPP > unit) {
        out.push({
          file: f, 안: null, 근거: '알선 수수료가 금액으로 적혀 있다',
          입금가: sellPP - unit, 대리점수익: unit, 판매가: sellPP,
          대리점율: unit / (sellPP - unit),
        });
        continue;
      }
    }
    if (fpct) out.push({ file: f, 안: null, 근거: '알선 수수료가 **비율로** 적혀 있다', 대리점율: Number(fpct[1]) / 100 });
  }
  return out;
}

(async () => {
  console.log('■ 원가에 얼마가 얹히는가 — 문서가 스스로 밝힌 것만\n');

  const land = landProfit();
  console.log('── ① 랜드사(DMC) 수익 — 블랙다운 안의 줄 (검산이 닫힌 문서만)');
  for (const x of land) console.log('     ' + pct(x.rate).padStart(7) + '   ' + x.file.slice(0, 48));
  const lm = med(land.map((x) => x.rate));
  console.log('     → ' + land.length + '건 · 중앙값 ' + (lm === null ? '—' : pct(lm)));
  console.log('     ⚠ 이 수익은 **이미 블랙다운 합계 안에** 있다. 따로 더 얹는 것이 아니다.');

  const q = await quoteLayers();
  const full = q.filter((x) => x.하나율 !== undefined);
  const agency = q.filter((x) => x.대리점율 !== undefined);

  console.log('\n── ② 하나투어 수익 — 「하나수익 / 입금가」가 나뉘어 적힌 문서');
  if (!full.length) console.log('     없다.');
  for (const x of full) console.log('     ' + pct(x.하나율).padStart(7)
    + '   원가 ' + Math.round(x.원가).toLocaleString().padStart(10)
    + ' → 입금가 ' + Math.round(x.입금가).toLocaleString().padStart(10)
    + '   ' + x.file.slice(0, 30) + (x.안 ? ' ' + x.안 : ''));
  const hm = med(full.map((x) => x.하나율));
  console.log('     → ' + full.length + '건 · 중앙값 ' + (hm === null ? '—' : pct(hm))
    + '   (가정 ' + pct(ASSUMPTION.하나투어) + ')');

  console.log('\n── ③ 대리점(비즈페이지) 수익');
  for (const x of agency) console.log('     ' + pct(x.대리점율).padStart(7) + '   ' + x.근거.padEnd(26)
    + ' ' + x.file.slice(0, 32) + (x.안 ? ' ' + x.안 : ''));
  const am = med(agency.map((x) => x.대리점율));
  /* 🔴 **한 문서를 여러 번 세지 않는다.** 마카오는 안이 셋이라 줄이 셋인데, 그대로 세면
     한 문서가 중앙값을 셋 몫으로 끈다 — 코퍼스에서 같은 PDF 한 벌 때문에 「일본이 낮다」의
     27%가 중복이었던 일이 있다(VA). 그래서 **문서 단위 중앙값을 함께** 낸다. */
  const perDoc = [];
  for (const [, v] of new Map(agency.map((x) => [x.file, null]))) void v;
  const byDoc = new Map();
  for (const x of agency) (byDoc.get(x.file) || byDoc.set(x.file, []).get(x.file)).push(x.대리점율);
  for (const [, list] of byDoc) perDoc.push(med(list));
  const amDoc = med(perDoc);
  console.log('     → 줄 ' + agency.length + '개 · 중앙값 ' + (am === null ? '—' : pct(am)));
  console.log('     → **문서 ' + byDoc.size + '건** · 중앙값 ' + (amDoc === null ? '—' : pct(amDoc))
    + '   (가정 ' + pct(ASSUMPTION.비즈페이지) + ')  ← 이쪽을 읽는다');

  console.log('\n── 원가 → 고객가 **총 배수**');
  const tot = full.filter((x) => x.총배수);
  for (const x of tot) console.log('     ×' + x.총배수.toFixed(3) + '   ' + x.file.slice(0, 34) + (x.안 ? ' ' + x.안 : ''));
  if (hm !== null && amDoc !== null) {
    const implied = (1 + hm) * (1 + amDoc);
    console.log('     중앙값끼리 이으면  ×' + implied.toFixed(3)
      + '    가정 ×' + ((1 + ASSUMPTION.하나투어) * (1 + ASSUMPTION.비즈페이지)).toFixed(3));
  }

  console.log('\n🔴 읽는 법');
  console.log('   · 표본이 작다. **중앙값을 계수로 굳히지 말 것** — 지금은 자릿수만 안다.');
  console.log('   · 「알선 수수료」가 우리 몫의 전부라는 보장이 없다. 지상비 안에 숨은 마진은');
  console.log('     이 자로 안 보인다 — 그래서 이 값은 **하한**으로 읽어야 한다.');
  console.log('   · 층이 표로 적힌 문서는 지금 한 건뿐이고, 그 한 건이 하필 역검증에서');
  console.log('     엔진 오차가 가장 컸던 건이다(마카오 +42.8%). 대표성을 가정하지 말 것.');
})();

/* ═══════════════════════════════════════════════════════════════════════════
   「확인 필요 · 제안 못 만듦」을 판정한다 (TY)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-13 사장님: 「갱신 제안 중 확인이 필요한 항목들은 자체 검토 또는 예측치 적용을
   통해 문제 해결을 진행해 줘.」

   갱신 제안(TB)은 실측 ÷ 기준가가 **0.5~2배 밖**이면 제안을 못 만들고 「확인 필요」로만
   띄운다. 오타일 수도, 요율이 낡은 것일 수도 있어 사람이 봐야 하기 때문이다.
   이 도구가 그 판단을 **좁혀 준다** — 결론을 대신 내리는 게 아니라, 갈림길 중 어느 쪽인지
   말할 수 있는 근거를 모은다.

   갈림길은 셋뿐이다:
     ① **오독**       그 값이 견적서를 잘못 읽은 것 → 제보에서 빼야 한다
     ② **요율이 낡음** 값은 맞고 기준가가 틀렸다 → 요율을 고쳐야 한다
     ③ **판단 불가**   근거가 모자란다 → 사람에게 넘긴다

   무엇으로 가르는가 (전부 이미 있는 잣대를 부른다):
     · 11회 검토를 통과했는가 (`.corpus_validated.json`)
     · 같은 목적지 **다른 견적서**도 같은 쪽으로 벌어지는가 (혼자면 오독 쪽)
     · **같은 나라 동료 목적지**의 기준가와 견줘 그럴듯한가 (예측치 — 요율표에 값이
       없거나 낡았을 때 쓸 수 있는 유일한 근거다)
     · 항목 간 비(⑪)가 그 값을 지지하는가

   ⚠ **자동으로 고치지 않는다.** ①로 판정되면 「제보에서 빼기」를, ②면 「요율 갱신」을
     제안만 한다. 실제 반영은 `--apply-exclude` / `--apply-rate`로 나눠서 한다 —
     둘은 고치는 자리가 완전히 다르다(하나는 제보, 하나는 요율).

   실행:
     node ai-loop/resolve_far_off.js                 판정만
     node ai-loop/resolve_far_off.js --apply-exclude 오독으로 판정된 것을 제보에서 뺀다
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const APPLY_EX = argv.indexOf('--apply-exclude') >= 0;
const APPLY_RATE = argv.indexOf('--apply-rate') >= 0;
/* api/rates.js FIELD_MAX와 같은 값이어야 한다 — 직접 DB에 쓰면 API 검증을 안 지난다 */
const FIELD_MAX = {
  airfare: 8000000, fuel_surcharge: 4000000, hotel_per_room: 3000000,
  meal_per_person: 400000, vehicle_large: 20000000, vehicle_small: 15000000,
  guide_fee: 3000000, sightseeing_fee: 1500000, margin_per_traveler: 2000000,
  golf_fee: 1500000,
};
const RATE_AUTHOR = '확인 필요 해소(실측 기반)';
const VALIDATED = path.join(ROOT, '.corpus_validated.json');

const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
const destinationRates = require(path.join(ROOT, 'data.js'));
const DATA = require(path.join(ROOT, 'data.js'));

const CELLS = ['airfare', 'fuel', 'hotel', 'meal', 'vehicle', 'guide', 'sight', 'golf'];
const COL = {
  airfare: 'airfare_unit', fuel: 'fuel_unit', hotel: 'hotel_unit', meal: 'meal_unit',
  vehicle: 'vehicle_unit', guide: 'guide_unit', sight: 'sight_unit', golf: 'golf_unit',
};
const RATE = {
  airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room', meal: 'meal_per_person',
  vehicle: 'vehicle_large', guide: 'guide_fee', sight: 'sightseeing_fee', golf: 'golf_fee',
};
const LABEL = {
  airfare: '항공', fuel: '유류', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광', golf: '골프',
};
/* 화면(TB)과 같은 대역이어야 한다 — 다르면 화면에 뜨는 목록과 이 표가 어긋난다 */
const OK_LOW = 0.5, OK_HIGH = 2;
const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());

/* 같은 나라 동료 목적지의 기준가 — **예측치의 유일한 근거**다.
   ⚠ 지역(region)이 아니라 **나라(country)**로 묶는다. '동남아' 하나에 베트남·태국·
     필리핀이 다 들어 있어 단가가 서너 배 벌어진다(RY에서 축을 나눈 이유 그대로). */
function countryPeers(destKey) {
  const country = (DATA.DEST_CLASSIFY[destKey] || {}).country;
  if (!country) return [];
  return Object.keys(DATA.DEST_CLASSIFY)
    .filter((k) => k !== destKey && (DATA.DEST_CLASSIFY[k] || {}).country === country);
}

(async () => {
  const verdictMap = fs.existsSync(VALIDATED)
    ? JSON.parse(fs.readFileSync(VALIDATED, 'utf8'))
    : [];
  require('./_load_env')();
  const { sql } = require(path.join(ROOT, 'api', '_lib', 'db'));
  const reports = await sql`select * from actual_price_reports order by id`;
  const ovRows = await sql`select destination_key, overrides from rate_overrides`;
  const ov = {};
  ovRows.forEach((r) => { ov[r.destination_key] = r.overrides || {}; });
  const effective = (destKey, cell) => {
    const row = destinationRates.find((d) => d.destination_key === destKey);
    if (!row) return 0;
    const o = ov[destKey] || {};
    return Number(o[RATE[cell]] != null ? o[RATE[cell]] : row[RATE[cell]]) || 0;
  };

  /* 목적지×칸으로 실측을 모은다. **평균에서 뺀 칸은 안 센다**(화면과 같은 관문). */
  const groups = {};
  reports.forEach((r) => {
    const ex = r.excluded_fields || {};
    CELLS.forEach((k) => {
      const v = r[COL[k]];
      if (v == null || !(v > 0)) return;
      if (ex[k] != null) return;
      const key = r.destination_key + '|' + k;
      (groups[key] = groups[key] || { dest: r.destination_key, cell: k, items: [] })
        .items.push({ id: r.id, v: Number(v), via: (r.field_sources || {})[k] || null });
    });
  });

  const farOff = [];
  Object.values(groups).forEach((g) => {
    const base = effective(g.dest, g.cell);
    if (!base) return;
    const ratios = g.items.map((x) => x.v / base);
    const clean = ratios.filter((x) => x >= OK_LOW && x <= OK_HIGH);
    if (clean.length) return;                       /* 제안을 만들 수 있다 — 대상 아님 */
    farOff.push({ ...g, base, ratios, med: PLAUSIBILITY.median(g.items.map((x) => x.v)) });
  });

  console.log('「확인 필요 · 제안 못 만듦」 ' + farOff.length + '건\n');
  const toExclude = [], toRate = [], toHuman = [];

  farOff.sort((a, b) => a.dest.localeCompare(b.dest)).forEach((g) => {
    const ratio = g.med / g.base;
    /* 근거 ① — 11회 검토 결과 */
    const checks = verdictMap.filter((v) => v.dest === g.dest && v.cell === g.cell);
    const failed = checks.filter((v) => !v.ok);
    /* 근거 ② — 같은 나라 동료 목적지의 기준가 (예측치) */
    const peers = countryPeers(g.dest).map((k) => effective(k, g.cell)).filter((n) => n > 0);
    const peerMed = peers.length ? PLAUSIBILITY.median(peers) : null;
    /* 근거 ③ — 실측이 여러 건이고 전부 같은 쪽으로 벌어지는가 */
    const allSameSide = g.ratios.length >= 2
      && (g.ratios.every((x) => x > OK_HIGH) || g.ratios.every((x) => x < OK_LOW));
    /* 근거 ④ — **실측끼리 서로 맞는가.**
       ⚠ 「여러 건이 전부 같은 쪽으로 벌어진다」만으로는 부족하다. 실측 둘이 서로 크게
         다르면 **둘 다 덜 읽은 것**일 수 있다 — 실측(홍콩 관광): 15,950과 4,440으로
         서로 3.6배다. 문서에 관광 줄이 하나뿐이라 덜 읽은 것으로 보인다고 결정대기열
         0-a가 이미 적어 뒀다. 그런 값들로 요율을 정하면 오독이 기준가가 된다.
       → **자기들끼리 2배 넘게 벌어지면 요율을 논하지 않는다.** */
    const vals = g.items.map((x) => x.v);
    const selfSpread = Math.max.apply(null, vals) / Math.min.apply(null, vals);
    const selfConsistent = vals.length < 2 || selfSpread <= 2;
    if (vals.length >= 2 && !selfConsistent) {
      console.log('     ⚠ 실측끼리 ' + selfSpread.toFixed(1) + '배 벌어진다 — 둘 다 덜 읽었을 수 있다');
    }

    console.log('■ ' + g.dest + ' ' + LABEL[g.cell]
      + '   기준가 ' + won(g.base) + '  vs  실측 ' + won(g.med)
      + '  (' + (ratio >= 1 ? '×' + ratio.toFixed(1) : '÷' + (1 / ratio).toFixed(1)) + ', ' + g.items.length + '건)');
    g.items.forEach((x) => console.log('     id ' + String(x.id).padStart(3) + '  ' + won(x.v).padStart(12)
      + '  출처 ' + (x.via || '없음')));
    if (peerMed) {
      console.log('     같은 나라 동료 기준가 중앙값 ' + won(peerMed)
        + ' (' + peers.length + '곳)  → 실측이 그와 '
        + (g.med > peerMed ? '×' + (g.med / peerMed).toFixed(1) : '÷' + (peerMed / g.med).toFixed(1)));
    } else {
      console.log('     같은 나라 동료 목적지가 없다 — 예측치를 만들 근거가 없다');
    }
    if (failed.length) {
      console.log('     ⚠ 11회 검토에서 걸린 적 있다: ' + failed[0].failWhy.join(' / ').slice(0, 78));
    }

    /* ── 판정 ─────────────────────────────────────────────────────────────
       ⚠ **오독 쪽으로 기울 때만 뺀다.** 요율이 낡은 것을 오독으로 몰아 빼면 그 목적지의
         유일한 실측이 사라지고, 요율은 영영 추정치로 남는다. */
    if (failed.length && g.items.length === 1) {
      console.log('     → ① **오독으로 본다** — 11회 검토가 이미 걸렀고 실측이 그 한 건뿐이다.');
      toExclude.push({ ...g, why: failed[0].failWhy.join(' / ').slice(0, 120) });
    } else if (!selfConsistent) {
      console.log('     → ③ **판단 불가** — 실측끼리 안 맞는다. 요율을 정할 근거가 못 된다.');
      toHuman.push(g);
    } else if (peerMed && g.med >= peerMed / OK_HIGH && g.med <= peerMed * OK_HIGH) {
      console.log('     → ② **요율이 낡은 것으로 본다** — 실측이 같은 나라 동료 기준가와 맞는다.');
      toRate.push({ ...g, peerMed });
    } else if (allSameSide) {
      console.log('     → ② **요율이 낡은 것으로 본다** — 실측 ' + g.items.length + '건이 전부 같은 쪽으로 벌어진다.');
      toRate.push({ ...g, peerMed });
    } else {
      console.log('     → ③ **판단 불가** — 사람이 문서를 봐야 한다.');
      toHuman.push(g);
    }
    console.log('');
  });

  console.log('═'.repeat(100));
  console.log('① 오독으로 보이는 것 ' + toExclude.length + '건 — 제보에서 빼면 「확인 필요」가 사라진다');
  toExclude.forEach((g) => console.log('   ' + g.dest.padEnd(9) + LABEL[g.cell].padEnd(5) + won(g.med)));
  console.log('② 요율이 낡은 것으로 보이는 것 ' + toRate.length + '건 — **요율 판단은 실거래가라 사람이 정한다**');
  toRate.forEach((g) => console.log('   ' + g.dest.padEnd(9) + LABEL[g.cell].padEnd(5)
    + won(g.base) + ' → 실측 ' + won(g.med)
    + (g.peerMed ? '  (같은 나라 기준가 ' + won(g.peerMed) + ')' : '')));
  console.log('③ 판단 불가 ' + toHuman.length + '건');
  toHuman.forEach((g) => console.log('   ' + g.dest.padEnd(9) + LABEL[g.cell].padEnd(5) + won(g.med)));

  /* ── ②를 요율에 반영한다 ────────────────────────────────────────────────
     2026-08-13 사장님이 「자체 검토 또는 **예측치 적용**으로 해결하라」고 했다.
     ⚠ 안전장치는 `apply_rate_updates`와 **같은 것**을 건다:
       · 사람이 이미 정한 칸은 안 건드린다
       · api/rates.js와 같은 오타 상한
       · rate_change_log에 이력을 남긴다(없으면 관리자 화면 되돌리기가 못 돈다) */
  if (APPLY_RATE) {
    console.log('\n── ② 요율 반영 ──');
    console.log('⚠ **끝나면 반드시 `node ai-loop/audit_cost_floor.js`를 돌릴 것.**');
    console.log('  2026-08-13에 실제로 깼다: 나트랑 유류를 280,000 → 120,000으로 내렸더니');
    console.log('  그 목적지가 원가 대비 +12.0% → **-1.5%**가 되어 팔수록 손해인 상태가 됐다.');
    console.log('  되돌리고 나서야 3건으로 복구됐다 — **요율을 내리는 변경은 특히 그렇다.**\n');
    for (const g of toRate) {
      const cell = RATE[g.cell];
      const cur = ov[g.dest] || {};
      if (cur[cell] != null) { console.log('   건너뜀: ' + g.dest + '.' + cell + ' — 이미 사람이 정한 값'); continue; }
      const next = Math.round(g.med);
      if (FIELD_MAX[cell] != null && next > FIELD_MAX[cell]) {
        console.log('   건너뜀: ' + g.dest + '.' + cell + ' — 오타 상한 초과'); continue;
      }
      const merged = Object.assign({}, cur, { [cell]: next });
      await sql`
        insert into rate_overrides (destination_key, overrides, updated_by)
        values (${g.dest}, ${JSON.stringify(merged)}::jsonb, ${RATE_AUTHOR})
        on conflict (destination_key) do update
          set overrides = ${JSON.stringify(merged)}::jsonb, updated_at = now(), updated_by = ${RATE_AUTHOR}
      `;
      await sql`
        insert into rate_change_log (destination_key, field, old_value, new_value, author)
        values (${g.dest}, ${cell}, ${JSON.stringify(g.base)}::jsonb, ${JSON.stringify(next)}::jsonb, ${RATE_AUTHOR})
      `;
      ov[g.dest] = merged;
      console.log('   ✓ ' + g.dest + '.' + cell + '  ' + won(g.base) + ' → ' + won(next));
    }
  }

  if (!APPLY_EX) {
    if (!APPLY_RATE) console.log('\n── 아무것도 쓰지 않았다. ①은 --apply-exclude · ②는 --apply-rate ──');
    return;
  }

  for (const g of toExclude) {
    for (const it of g.items) {
      const cur = await sql`select excluded_fields from actual_price_reports where id = ${it.id}`;
      const ex = Object.assign({}, (cur[0] && cur[0].excluded_fields) || {});
      if (ex[g.cell] != null) continue;
      ex[g.cell] = PLAUSIBILITY.AUTO_EXCLUDE_MARK + '11회 검토에서 걸린 값입니다 — ' + g.why
        + ' · 확인 필요 목록에서 확정하면 다시 반영됩니다';
      await sql`update actual_price_reports set excluded_fields = ${JSON.stringify(ex)}::jsonb where id = ${it.id}`;
      console.log('   ✓ id ' + it.id + ' ' + g.dest + ' ' + LABEL[g.cell] + ' 평균에서 뺐다(값은 남는다)');
    }
  }
})();

/* ═══════════════════════════════════════════════════════════════════════════
   검토를 통과한 실측을 요율에 올린다 (TQ) — **고객이 보는 금액이 바뀌는 자리다**
   ───────────────────────────────────────────────────────────────────────────
   사장님 2026-08-13: 「10회 검토를 거친 DB는 요율 관리에 업데이트까지 진행해 줘.」

   입력은 `validate_corpus.js`가 **열 잣대를 전부 지난 칸**뿐이다. 하나라도 걸린 값은
   여기 오지 않는다(검산 안 된 값·기준가의 3배·전 일정 총액·두 번 센 줄 등).

   ⚠ **여기서부터는 되돌리기가 비싸다.** 그래서 안전장치를 겹쳐 둔다:
     · 기본이 `--dry-run`이다. 실제로 쓰려면 `--apply`를 명시해야 한다.
     · **표본 2건 미만은 올리지 않는다.** 한 장짜리 중앙값은 중앙값이 아니고,
       그 값이 요율이 되면 되돌릴 근거가 사라진다.
     · **지금 값의 3배를 넘는 변경은 올리지 않는다.** 그건 요율 문제가 아니라
       「그 실측이 오독인지 먼저 봐야 하는」 것이다(홍콩 관광 70,000 -> 10,195이 그 예다 —
       요율이 높은 게 아니라 우리가 덜 읽은 것이다).
     · **서버와 같은 오타 상한**(api/rates.js FIELD_MAX)을 여기서도 건다. 직접 DB에 쓰면
       API 검증을 지나가지 않으므로, 그 검증을 여기 옮겨 온다.
     · **변경 이력(rate_change_log)을 반드시 남긴다.** 이력이 없으면 관리자 화면의
       되돌리기가 못 돌아간다 — 조용히 바뀐 요율은 아무도 못 되돌린다.

   ⚠ **환율 시점은 보정하지 않는다.** 견적서 값에는 그 시점 환율이 박혀 있고 요율표는
     「오늘 환율 기준」이다(SG, 중앙값 5.1% 차이). 그래서 ±5%를 다투는 칸은 그만큼
     흔들린다 — 이 도구는 **2배 이상 벌어진 칸만** 다루므로 그 흔들림에 묻히지 않는다.

   실행:
     node ai-loop/apply_rate_updates.js              (기본 = dry-run, 아무것도 안 쓴다)
     node ai-loop/apply_rate_updates.js --apply      (운영 DB에 실제로 쓴다)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.indexOf('--apply') >= 0;
/* `--simulate-cache` — 실제로 쓰지 않고 **오버라이드 캐시에만** 얹는다.
   그러면 audit_cost_floor / audit_gap_source가 「이 변경을 하면 어떻게 되는가」를
   그대로 잰다. 요율은 고객 금액이라 **재 보고 나서 쓰는 것이 기본 절차**다. */
const SIM = argv.indexOf('--simulate-cache') >= 0;
const IN = path.join(ROOT, '.corpus_validated.json');

const destinationRates = require(path.join(ROOT, 'data.js'));

/* api/rates.js의 FIELD_MAX와 **같은 값이어야 한다.** 직접 DB에 쓰면 API 검증을
   지나가지 않으므로 여기서 같은 상한을 건다(한쪽에만 걸면 다른 쪽이 우회로가 된다). */
const FIELD_MAX = {
  airfare: 8000000, fuel_surcharge: 4000000, hotel_per_room: 3000000,
  meal_per_person: 400000, vehicle_large: 20000000, vehicle_small: 15000000,
  guide_fee: 3000000, sightseeing_fee: 1500000, margin_per_traveler: 2000000,
  golf_fee: 1500000,
};
/* 표본 요건 — `--min-samples 1`로 낮출 수 있다.
   ⚠ **1건을 받아들일 때는 문턱을 좁힌다.** 한 장짜리 값에는 그 행사의 조건(성수기·등급·
     인원)이 박혀 있어 중앙값이 아니다. 그래서 1건일 때는 `SINGLE_MAX_RATIO`(2배)까지만
     받고, 그보다 벌어진 것은 「오독인지 먼저 봐야 하는」 쪽으로 보낸다.
   ⚠ 그래도 1건을 받는 이유 — 지금 요율표의 값은 저장소가 스스로 **「근거 없는 온라인
     추정치」**라고 적어 둔 것들이고(CLAUDE.md), 대표 방침도 「실제 견적이 올라가면 그
     내용으로 교체하면서 기존 온라인 추정치를 삭제한다」(2026-08-04)다.
     실측 1건은 추정치 0건보다 낫다. 코퍼스 21개 목적지 중 **14곳이 견적서 1건뿐**이라,
     2건을 고집하면 그 14곳은 영영 추정치로 남는다. */
const MIN_SAMPLES = Number(argOf('--min-samples', 2));
const SINGLE_MAX_RATIO = 2;
const MAX_RATIO = 3;     /* 이보다 벌어지면 요율이 아니라 **오독인지부터** 봐야 한다 */
const AUTHOR = '실측 자동 반영(검토 10회 통과)';

const won = (n) => Number(Math.round(n)).toLocaleString();
const median = (a) => {
  const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  if (!fs.existsSync(IN)) {
    console.log('먼저 검토를 돌려 주세요: node ai-loop/validate_corpus.js');
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(IN, 'utf8')).filter((r) => r.ok && r.dest && r.rateCell);
  console.log('검토를 통과한 칸 ' + rows.length + '개로 요율 제안을 만든다\n');

  /* 목적지 x 요율칸으로 모은다 */
  const groups = {};
  rows.forEach((r) => {
    const key = r.dest + '|' + r.rateCell;
    groups[key] = groups[key] || { dest: r.dest, cell: r.rateCell, label: r.label, vals: [], files: [] };
    groups[key].vals.push(r.value);
    groups[key].files.push(r.file);
  });

  const proposals = [], held = [];
  Object.values(groups).forEach((g) => {
    const dRow = destinationRates.find((d) => d.destination_key === g.dest);
    if (!dRow) return;
    const base = Number(dRow[g.cell]) || 0;
    const med = Math.round(median(g.vals));
    const why = [];
    if (g.vals.length < MIN_SAMPLES) why.push('표본 ' + g.vals.length + '건 (' + MIN_SAMPLES + '건 미만)');
    if (!base) why.push('지금 요율이 0이다(안 파는 곳일 수 있다)');
    else {
      const ratio = med > base ? med / base : base / med;
      /* 표본이 1건이면 **더 좁은 문턱**을 쓴다(위 주석) */
      const cap = g.vals.length >= 2 ? MAX_RATIO : SINGLE_MAX_RATIO;
      if (ratio > cap) {
        why.push('지금 값의 ' + ratio.toFixed(1) + '배'
          + (g.vals.length < 2 ? ' — 실측이 1건뿐이라 ' + SINGLE_MAX_RATIO + '배까지만 받는다' : ' — 오독인지부터 봐야 한다'));
      }
      if (ratio < 1.15) why.push('차이가 15% 미만이라 굳이 바꿀 값이 아니다');
    }
    if (FIELD_MAX[g.cell] != null && med > FIELD_MAX[g.cell]) why.push('오타 상한 초과');
    const item = { ...g, base, med, n: g.vals.length };
    if (why.length) { item.why = why; held.push(item); } else proposals.push(item);
  });

  console.log('▪ 올릴 것 ' + proposals.length + '개');
  proposals.sort((a, b) => a.dest.localeCompare(b.dest)).forEach((p) => {
    console.log('   ' + p.dest.padEnd(10) + p.label.padEnd(5)
      + won(p.base).padStart(12) + '  →  ' + won(p.med).padStart(12)
      + '   (' + p.n + '건 중앙값)');
  });

  console.log('\n▪ 보류 ' + held.length + '개 — **왜 안 올리는지 반드시 남긴다**');
  held.sort((a, b) => a.dest.localeCompare(b.dest)).slice(0, 30).forEach((h) => {
    console.log('   ' + h.dest.padEnd(10) + h.label.padEnd(5)
      + won(h.base).padStart(12) + ' vs 실측 ' + won(h.med).padStart(12)
      + '   ' + h.why.join(' · '));
  });
  if (held.length > 30) console.log('   … ' + (held.length - 30) + '개 더');

  /* ── 시뮬레이션 ── 운영 DB는 안 건드리고 **오버라이드 캐시에만** 얹는다.
     그 뒤 `audit_cost_floor` / `audit_gap_source`를 돌리면 이 변경을 했을 때 원가 하한과
     오차가 어떻게 되는지 그대로 나온다. 요율은 고객 금액이라 **재 보고 나서 쓴다.**
     ⚠ 끝나면 `--fresh-rates`로 캐시를 되돌릴 것 — 안 그러면 다음 측정이 가짜 값으로 돈다. */
  if (SIM) {
    const CACHE = path.join(ROOT, '.rate_overrides_cache.json');
    const cur = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { overrides: {} };
    const ov = cur.overrides || {};
    proposals.forEach((p) => {
      if (ov[p.dest] && ov[p.dest][p.cell] != null) return;   /* 사람이 정한 칸은 안 건드린다 */
      ov[p.dest] = Object.assign({}, ov[p.dest], { [p.cell]: p.med });
    });
    fs.writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), overrides: ov, simulated: true }, null, 1), 'utf8');
    console.log('\n── 캐시에만 얹었다(운영 DB는 그대로). 이제 재 보면 된다: ──');
    console.log('   node ai-loop/audit_cost_floor.js');
    console.log('   node ai-loop/audit_gap_source.js');
    console.log('   ⚠ 끝나면 `--fresh-rates`로 캐시를 되돌릴 것.');
    return;
  }

  if (!APPLY) {
    console.log('\n── dry-run이라 아무것도 쓰지 않았다. 실제로 올리려면 --apply ──');
    return;
  }

  /* ── 실제 반영 ── 운영 DB의 rate_overrides에 얹고 이력을 남긴다. */
  require('./_load_env')();
  const { sql } = require(path.join(ROOT, 'api', '_lib', 'db'));
  const cur = await sql`select destination_key, overrides from rate_overrides`;
  const byDest = {};
  cur.forEach((r) => { byDest[r.destination_key] = r.overrides || {}; });

  let n = 0;
  for (const p of proposals) {
    const before = byDest[p.dest] || {};
    /* ⚠ **담당자가 이미 손으로 고친 칸은 건드리지 않는다.** 사람이 정한 값을 자동으로
       덮으면 그 판단이 조용히 사라진다 — 이 저장소가 반복해서 지켜 온 원칙이다. */
    if (before[p.cell] != null) {
      console.log('   건너뜀: ' + p.dest + '.' + p.cell + ' — 이미 사람이 정한 값이 있다('
        + won(before[p.cell]) + ')');
      continue;
    }
    const next = Object.assign({}, before, { [p.cell]: p.med });
    await sql`
      insert into rate_overrides (destination_key, overrides, updated_by)
      values (${p.dest}, ${JSON.stringify(next)}::jsonb, ${AUTHOR})
      on conflict (destination_key) do update
        set overrides = ${JSON.stringify(next)}::jsonb, updated_at = now(), updated_by = ${AUTHOR}
    `;
    await sql`
      insert into rate_change_log (destination_key, field, old_value, new_value, author)
      values (${p.dest}, ${p.cell}, ${JSON.stringify(p.base)}::jsonb, ${JSON.stringify(p.med)}::jsonb, ${AUTHOR})
    `;
    byDest[p.dest] = next;
    n++;
    console.log('   ✓ ' + p.dest + '.' + p.cell + '  ' + won(p.base) + ' → ' + won(p.med));
  }
  console.log('\n반영 ' + n + '칸. 관리자 → 요율 관리에서 변경 이력으로 확인·되돌리기가 된다.');
})();

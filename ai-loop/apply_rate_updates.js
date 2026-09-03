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

/* 🔴 **표본이 늘수록 문턱이 함께 조여져야 한다** (YR, 2026-09-03).
   ───────────────────────────────────────────────────────────────────────────
   대표 방침: 견적서는 계속 쌓인다. 그런데 지금 문턱은 **1건 2배 → 2건 3배**로
   표본이 늘자마자 **느슨해지기만** 한다. 즉 **문서가 쌓이는 것 자체가 위험을 키운다** —
   가장 흔들리는 2건짜리 중앙값에 가장 넓은 문을 내주고 있었다.

   → 배율 상한을 표본 수에 매단다. 근거가 두꺼워질수록 큰 변경을 허용한다:

       1건  2.0배   (한 행사의 조건이 그대로 박힌 값이다)
       2건  2.5배   ← 새로 조인 자리. 예전엔 여기서 바로 3.0배였다
       3건+ 3.0배   (여러 문서가 같은 방향을 가리킨다)

   ⚠ **오늘 올라오는 제안 14개 중 이 변경으로 막히는 것은 없다**(실측으로 확인했다 —
     2건짜리 제안의 최대 배율이 1.62배다). 지금을 바꾸는 규칙이 아니라 **앞으로
     쌓일 때** 작동하는 규칙이다. 그래서 안전하게 넣을 수 있다.
   ⚠ 느슨하게 되돌리려면 근거를 숫자로 남길 것 — 이 문턱은 고객 금액을 지킨다. */
const RATIO_BY_SAMPLES = [
  { n: 3, cap: 3.0 },
  { n: 2, cap: 2.5 },
  { n: 1, cap: SINGLE_MAX_RATIO },
];
function capFor(n) {
  for (const r of RATIO_BY_SAMPLES) if (n >= r.n) return r.cap;
  return SINGLE_MAX_RATIO;
}

/* 🔴 골프 판정 — **한 곳에서 한다**(YR). 부르는 쪽에 흩어 두면 규칙이 두 벌이 된다.
   @param cell      요율 칸 이름
   @param files     이 칸의 근거 문서들(중복 있어도 된다)
   @param golfByFile Map<파일명, 골프인가> — `null`이면 「판정 못 함」이다
   @returns {{hold:boolean, 전체:number, 골프:number, 이유:string|null}}
     ⚠ 판정을 못 하면 `hold:false`지만 **`이유`가 아니라 `알수없음`으로 표시**한다 —
       부르는 쪽이 「골프 아님」과 「모름」을 구별할 수 있어야 한다. */
function golfHold(cell, files, golfByFile) {
  if (!golfByFile) return { hold: false, 알수없음: true, 전체: 0, 골프: 0, 이유: null };
  /* golf_fee는 골프 문서에서 나오는 것이 당연하다 — 여기 걸면 진짜가 묻힌다 */
  if (cell === 'golf_fee') return { hold: false, 면제: true, 전체: 0, 골프: 0, 이유: null };
  const 문서들 = [...new Set(files || [])];
  const 골프 = 문서들.filter((f) => golfByFile.get(f) === true).length;
  const hold = 문서들.length > 0 && 골프 === 문서들.length;
  return {
    hold, 전체: 문서들.length, 골프,
    이유: hold ? ('⛳ 근거 ' + 문서들.length + '건이 전부 골프 문서') : null,
  };
}
const AUTHOR = '실측 자동 반영(검토 10회 통과)';

const won = (n) => Number(Math.round(n)).toLocaleString();
const median = (a) => {
  const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

module.exports = { capFor, golfHold, RATIO_BY_SAMPLES, SINGLE_MAX_RATIO, MAX_RATIO };

/* ⚠ **`require`로 불릴 때는 본체를 돌리지 않는다.** 테스트가 위 함수만 가져다 쓰는데
   본체가 함께 돌면 코퍼스를 읽느라 몇 분이 걸리고, 스위트에서 그 파일만 느려진다. */
if (require.main !== module) return;

(async () => {
  if (!fs.existsSync(IN)) {
    console.log('먼저 검토를 돌려 주세요: node ai-loop/validate_corpus.js');
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(IN, 'utf8')).filter((r) => r.ok && r.dest && r.rateCell);
  console.log('검토를 통과한 칸 ' + rows.length + '개로 요율 제안을 만든다\n');

  /* 🔴 **골프 견적서에서만 나온 값으로 요율을 바꾸지 않는다** (YR).
     ───────────────────────────────────────────────────────────────────────
     골프 일정 문서는 **골프조/관광조로 갈려** 있어서, 차량·관광 같은 줄이
     「전원」이 아니라 **조 인원 기준**으로 적힌다. 그걸 전원 단가로 읽으면 부푼다.
     그리고 그 값이 요율이 되면 **골프 아닌 그 목적지 손님 전부**가 그 값을 문다.

     실제로 걸려 있는 자리다:
       · 제주도 호텔 제안의 근거 2건이 **둘 다 고은회 골프 여행**이다(0-p).
       · 다낭 관광 「요율이 4.3배 낮다」의 실측 2건도 **둘 다 골프**다(0-m·YF).
         같은 다낭의 비골프 견적서는 그 칸이 아예 비어 있다.
     대기열 0-m에 「그 목적지 견적서가 **한 장만 더 들어오면 통과합니다**」라고
     적어 둔 그 자리를 여기서 막는다.

   ⚠ **막는 게 아니라 보류다.** 골프에서만 나온 값이 틀렸다는 뜻이 아니라,
     사람이 문서를 보고 「이 줄이 조 인원 기준인가」를 확인해야 한다는 뜻이다.
     그래서 이유를 적어 보류 목록에 넣는다(오류라고 부르지 않는다).
   ⚠ **판정을 못 하면 조용히 통과시키지 않는다** — 아래에서 `--apply`를 막는다.
     알 수 없는 것을 「골프 아님」으로 두면 이 가드는 있으나 마나다(결함 생성기 ②). */
  let golfByFile = null;
  try {
    const { loadCorpus } = require('./_corpus_cache.js');
    const corpus = await loadCorpus({ useCache: true, quiet: true });
    golfByFile = new Map();
    corpus.forEach((c) => { if (c && c.file) golfByFile.set(c.file, !!(c.golf && c.golf.isGolfTrip)); });
    const 골프수 = [...golfByFile.values()].filter(Boolean).length;
    console.log('골프 판정: 문서 ' + golfByFile.size + '건 중 골프 일정 ' + 골프수 + '건\n');
  } catch (e) {
    golfByFile = null;
    console.log('⚠ 골프 판정을 못 했습니다 — ' + String(e.message).slice(0, 90));
    console.log('   (코퍼스 폴더나 캐시가 없을 때입니다. 아래 제안은 **골프 가드를 안 지난 것**입니다.)\n');
  }

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
      /* 표본 수에 매단 문턱 — 근거가 두꺼울수록 큰 변경을 허용한다 (YR) */
      const cap = capFor(g.vals.length);
      if (ratio > cap) {
        why.push('지금 값의 ' + ratio.toFixed(1) + '배'
          + ' — 실측 ' + g.vals.length + '건이라 ' + cap + '배까지만 받는다');
      }
      if (ratio < 1.15) why.push('차이가 15% 미만이라 굳이 바꿀 값이 아니다');
    }
    if (FIELD_MAX[g.cell] != null && med > FIELD_MAX[g.cell]) why.push('오타 상한 초과');

    /* 🔴 골프 가드 (YR) — 이 칸의 근거가 **전부 골프 일정 문서**인가
     ⚠ **`golf_fee`는 빼야 한다.** 골프 요금이 골프 견적서에서 나오는 것은 당연하고,
       오히려 그것 말고는 나올 데가 없다. 여기 걸어 두면 「⛳」 목록이 늘 20건쯤 되고,
       그러면 **진짜 봐야 할 건(제주도 호텔·다낭 관광)이 묻힌다.**
       「없는 것을 세면 진짜가 묻힌다」 — 이 저장소가 이미 여러 번 겪은 자리다. */
    /* 이유는 짧게 — 왜 문제인지는 목록 머리에서 **한 번만** 말한다.
       줄마다 같은 문장을 붙이면 그 줄이 길어져 정작 값이 안 보인다(YQ에서 배운 것). */
    const golf = golfHold(g.cell, g.files, golfByFile);
    if (golf.hold) why.push(golf.이유);

    const item = { ...g, base, med, n: g.vals.length, golf };
    if (why.length) { item.why = why; held.push(item); } else proposals.push(item);
  });

  console.log('▪ 올릴 것 ' + proposals.length + '개');
  proposals.sort((a, b) => a.dest.localeCompare(b.dest)).forEach((p) => {
    console.log('   ' + p.dest.padEnd(10) + p.label.padEnd(5)
      + won(p.base).padStart(12) + '  →  ' + won(p.med).padStart(12)
      + '   (' + p.n + '건 중앙값)');
  });

  const 한줄 = (h) => '   ' + h.dest.padEnd(10) + h.label.padEnd(5)
    + won(h.base).padStart(12) + ' vs 실측 ' + won(h.med).padStart(12)
    + '   ' + h.why.join(' · ');

  /* 🔴 **골프로 걸린 것은 잘리면 안 된다** (YR).
     보류 목록은 30개에서 자르는데, 그러면 ⛳ 건이 그 아래로 밀려 **안 보인 채로**
     남는다. 실제로 제주도 호텔이 그렇게 사라졌다 — 가드는 일했는데 화면에는
     「제안이 하나 줄었다」만 보였다. **가드가 일한 것을 사람이 못 보면 안 한 것과 같다.**
     ⛳는 사람이 문서를 열어 판단해야 하는 것이므로 **전부, 먼저** 보여준다. */
  const 골프보류 = held.filter((h) => h.why.some((w) => w.startsWith('⛳')));
  const 나머지보류 = held.filter((h) => !h.why.some((w) => w.startsWith('⛳')));

  console.log('\n▪ 보류 ' + held.length + '개 — **왜 안 올리는지 반드시 남긴다**');
  if (골프보류.length) {
    console.log('\n  ⛳ 골프 견적서에서만 나온 값 ' + 골프보류.length + '개 — **사람이 문서를 보고 정할 것**');
    골프보류.sort((a, b) => a.dest.localeCompare(b.dest)).forEach((h) => console.log(한줄(h)));
    console.log('     ↳ 골프 문서는 골프조/관광조로 갈려 1인당이 부풀 수 있습니다.');
    console.log('       그 값이 요율이 되면 **골프 아닌 그 목적지 손님 전부**가 그 값을 뭅니다.');
    console.log('\n  ── 나머지 보류 ──');
  }
  나머지보류.sort((a, b) => a.dest.localeCompare(b.dest)).slice(0, 30).forEach((h) => console.log(한줄(h)));
  if (나머지보류.length > 30) console.log('   … ' + (나머지보류.length - 30) + '개 더');

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

  /* 🔴 **골프 판정을 못 했으면 쓰지 않는다** (YR).
     못 한 것을 「골프 아님」으로 넘기면 이 가드는 있으나 마나다 — 그리고 그때
     써지는 값이 바로 가드가 막으려던 값이다(결함 생성기 ② 조용한 폴백).
     정말 없이 진행해야 하면 **그렇게 적으라고** 별도 스위치를 요구한다.
   ⚠ dry-run은 그대로 보여준다 — 무엇이 올라올지는 봐야 하고, 그건 아무것도 안 바꾼다. */
  if (!golfByFile && argv.indexOf('--skip-golf-guard') < 0) {
    console.log('\n🔴 골프 판정을 못 해서 **쓰지 않았습니다.**');
    console.log('   골프 견적서에서만 나온 값이 요율이 되면 골프 아닌 손님 전부가 그 값을 뭅니다.');
    console.log('   · 코퍼스를 읽을 수 있게 한 뒤 다시 돌리시거나(권장),');
    console.log('   · 정말 가드 없이 진행하려면 `--skip-golf-guard`를 함께 주십시오.');
    process.exit(1);
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
  /* 🔴 **기준월(rateDate)은 일부러 안 건드린다** (WW).
     이 값은 고객 견적서에 「요율 기준: 2026년 06월」로 찍히는 근거 날짜다.
     여기서 오늘 달로 채우면 「그 달에 우리가 확인했다」는 뜻이 되는데, 이 도구가 얹는
     값은 **견적서 코퍼스(2025~2026) 전체의 중앙값**이라 그 말이 사실이 아니다 —
     패키지의 「금액 확인일을 오늘로 채우지 않는다」(VP·WJ)와 같은 원칙이다.
     대신 **어긋난 상태를 감춰 두지 않는다**: 아래 한 줄로 말하고,
     `node ai-loop/audit_rates.js`가 그 목적지 수를 매번 센다. */
  if (n) {
    console.log('\n⚠ 「요율 기준월」은 바꾸지 않았습니다 — 이 값들은 코퍼스 전체의 중앙값이라');
    console.log('  「이번 달에 확인했다」가 아니기 때문입니다. 그래서 고객 견적서에는');
    console.log('  옛 기준월이 그대로 찍힙니다. 표기를 어떻게 할지는 대표 결정입니다');
    console.log('  (결정대기열 0-u). 지금 어긋난 목적지 수는 audit_rates.js가 셉니다.');
  }
})();

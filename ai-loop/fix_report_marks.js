/* ═══════════════════════════════════════════════════════════════════════════
   TI 이전에 들어간 제보에 자동 제외 표시를 소급한다 (TX 후속)
   ───────────────────────────────────────────────────────────────────────────
   되짚기(recheck_reports)가 찾은 것 — **TI(자동 제외)를 만들기 전에 관리자 화면으로
   들어간 제보**에는 검산 안 된 값에 표시가 안 붙어 있다. 그래서 그 값들이 실측 평균에
   그대로 들어간다:

     id 15 싱가포르 차량·가이드   출처 `unchecked`  (전 일정 총액일 수 있는 값)
     id 18 제주도   항공·유류     출처 `none`

   ⚠ 제주도 항공 194,000은 **골프 라운딩 값이 항공으로 들어간 오독**으로 보인다.
     같은 문서를 지금 추출기로 다시 읽으면 항공은 안 나오고 **골프 175,000**이 나온다
     (TH에서 「오라 C.C」 표기를, TJ에서 골프 단가를 고친 뒤다).
     그래도 **값을 지우거나 고치지 않는다** — 원본 기록은 남기고 평균에서만 뺀다.
     담당자가 「확인 필요」 목록에서 보고 정한다(TI와 같은 원칙).

   ⚠ **잣대는 `plausibility.countsAsMeasured` 하나**다. 여기서 다시 정하지 않는다.
   ⚠ 기본이 dry-run이다. 실제로 쓰려면 `--apply`.

   실행: node ai-loop/fix_report_marks.js [--apply]
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.indexOf('--apply') >= 0;
const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));

/* XQ: 항목 키는 `api/_lib/item_keys.js` 한 곳에서 온다 */
const CELLS = require('../api/_lib/item_keys').CORPUS_ITEM_KEYS;
const COL = {
  airfare: 'airfare_unit', fuel: 'fuel_unit', hotel: 'hotel_unit', meal: 'meal_unit',
  vehicle: 'vehicle_unit', guide: 'guide_unit', sight: 'sight_unit', golf: 'golf_unit',
};
const LABEL = {
  airfare: '항공', fuel: '유류', hotel: '호텔', meal: '식비',
  vehicle: '차량', guide: '가이드', sight: '관광', golf: '골프',
};
const WHY = {
  unchecked: '검산 안 됨 — 1인 단가인지 전 일정 총액인지 확인되지 않았습니다',
  ai: 'AI 추정 — 규칙이 못 채워 AI가 고른 값입니다',
  fallback: '예비 경로 — 표 좌표를 못 읽어 예전 방식으로 물러난 값입니다',
  none: '출처가 남지 않은 값입니다 (자동 제외 기능을 만들기 전에 들어온 제보)',
};
const won = (n) => Number(Math.round(n)).toLocaleString();

(async () => {
  require('./_load_env')();
  const { sql } = require(path.join(ROOT, 'api', '_lib', 'db'));
  const rows = await sql`select id, destination_key, excluded_fields, field_sources,
                                airfare_unit, fuel_unit, hotel_unit, meal_unit,
                                vehicle_unit, guide_unit, sight_unit, golf_unit
                         from actual_price_reports order by id`;

  const plan = [];
  rows.forEach((row) => {
    const srcs = row.field_sources || {};
    /* ⚠ **출처가 통째로 없는 옛 제보는 건드리지 않는다.** TI의 규칙 그대로다 —
       모르는 것을 「믿을 수 없다」로 바꾸면 그때 넣은 것이 통째로 사라진다. */
    if (!Object.keys(srcs).length) return;
    const ex = Object.assign({}, row.excluded_fields || {});
    const add = [];
    CELLS.forEach((k) => {
      if (row[COL[k]] == null) return;
      const via = srcs[k];
      if (!via) return;
      if (PLAUSIBILITY.countsAsMeasured(via)) return;
      if (ex[k] != null) return;                              /* 이미 표시가 있다 */
      ex[k] = PLAUSIBILITY.AUTO_EXCLUDE_MARK + (WHY[via] || '확인되지 않은 값입니다')
        + ' · 확인 필요 목록에서 확정하면 다시 반영됩니다';
      add.push({ k, via, v: row[COL[k]] });
    });
    if (add.length) plan.push({ row, ex, add });
  });

  console.log('표시를 붙일 행 ' + plan.length + '개');
  plan.forEach((p) => {
    console.log('  id ' + String(p.row.id).padStart(3) + '  ' + String(p.row.destination_key).padEnd(10)
      + p.add.map((a) => LABEL[a.k] + ' ' + won(a.v) + '(' + a.via + ')').join(' · '));
  });

  if (!APPLY) { console.log('\n── dry-run이라 아무것도 쓰지 않았다. 붙이려면 --apply ──'); return; }
  for (const p of plan) {
    await sql`update actual_price_reports set excluded_fields = ${JSON.stringify(p.ex)}::jsonb
              where id = ${p.row.id}`;
  }
  console.log('\n' + plan.length + '행에 표시를 붙였다. 값은 그대로 남아 있고 평균에서만 빠진다 —');
  console.log('관리자 → 견적서 업데이트 → 「⚠ 확인 필요」 목록에서 확정하면 되살아난다.');
})();

/* ═══════════════════════════════════════════════════════════════════════════
   견적서 모음을 **제보로 일괄 투입한다** (TV)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-13 사장님: 「요율 관리에 업데이트 체크가 필요해 보여.」

   화면이 거짓말을 하고 있었다. 요율 값은 실제 견적서에서 뽑아 넣었는데, 셀 배지는
   **「❓ 온라인 추정」**이라고 말한다. 배지(RM)는 `actual_price_reports`(제보)를 세는데
   실측을 `rate_overrides`에만 썼기 때문이다. 그러면:
     · 담당자가 **이미 실측으로 바꾼 곳을 또 작업**하게 된다(「온라인 추정만」 필터에 남는다)
     · 갱신 제안·기준가 경고·견적 정확도가 그 값을 못 본다(전부 제보를 본다)

   원래 설계가 그쪽이다 — 대표 방침(2026-08-10): 「직원들이 고객에게 보낸 견적서를
   폴더에 일괄로 올리고, 그 폴더에서 자주 취합해 DB의 견적 자료를 고도화한다.」
   `견적서 모음` 폴더가 바로 그 폴더인데, **폴더째 넣는 경로가 없어서** 여태 한 건씩
   관리자 화면으로만 들어갔다(프로덕션에 8행). 이 스크립트가 그 자리다.

   ⚠ **중복을 만들면 그 값이 실측 중앙값을 끌어당긴다**(SY가 화면에서 막는 그것).
     이미 들어간 8행 중 다섯이 이 코퍼스에서 온 것이라, 목적지+출발일+금액으로 막는다.
   ⚠ **10회 검토에서 걸린 칸은 값을 넣지 않는다.** 검산 안 된 값·기준가 3배 초과 등은
     제보에 들어가면 그대로 요율 근거가 된다 — validate_corpus의 판정을 그대로 쓴다.
   ⚠ **자동 제외 표시를 붙인다**(TI와 같은 방식). 뺀 것이 아니라 평균에서만 빠지고,
     담당자가 확인하면 되살아난다.
   ⚠ 기본이 dry-run이다. 실제로 쓰려면 `--apply`.

   실행:
     node ai-loop/import_corpus_reports.js              (dry-run)
     node ai-loop/import_corpus_reports.js --apply
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const APPLY = argv.indexOf('--apply') >= 0;
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const VALIDATED = path.join(ROOT, '.corpus_validated.json');

const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
const { destFromName } = require('./_dest_from_name');

/* 제보 테이블의 칸 ↔ 추출 항목 */
const COLS = {
  airfare: 'airfare_unit', fuel: 'fuel_unit', hotel: 'hotel_unit', meal: 'meal_unit',
  vehicle: 'vehicle_unit', guide: 'guide_unit', sight: 'sight_unit', golf: 'golf_unit',
};
const AUTHOR = '견적서 모음 일괄 투입';
const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  if (!fs.existsSync(VALIDATED)) {
    console.log('먼저 10회 검토를 돌려 주세요: node ai-loop/validate_corpus.js');
    process.exit(1);
  }
  /* 10회 검토 결과 — **걸린 칸은 값을 안 넣는다** */
  const verdict = {};
  JSON.parse(fs.readFileSync(VALIDATED, 'utf8')).forEach((v) => { verdict[v.file + '|' + v.cell] = v.ok; });

  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건 읽는 중… (2~4분)\n');

  require('./_load_env')();
  const { sql } = require(path.join(ROOT, 'api', '_lib', 'db'));
  const existing = await sql`select destination_key, depart_date, airfare_unit, hotel_unit, sell_price_unit
                             from actual_price_reports`;
  /* ⚠ 중복 판정은 SY와 같은 축이다 — **출발일이 둘 다 있고 다르면 다른 건**이다
     (상하이 11/08·11/15·11/22 차수별 견적을 중복으로 막았던 전례). */
  /* ⚠ **금액으로만 막으면 샌다.** 프로덕션에 이미 들어간 PDF 5건은 그 뒤 추출기가
     여러 번 좋아져서(SE·SF·SR·SV·TH·TJ) 지금 뽑으면 값이 다르다 — 같은 견적서인데
     금액이 달라 「다른 건」으로 통과한다. 그러면 같은 행사가 두 번 세어져 실측 중앙값을
     끌어당긴다(SY가 화면에서 막는 바로 그것).
     그래서 **목적지 + 출발일**을 먼저 본다. 같은 목적지·같은 출발일이면 같은 행사로 본다.
     ⚠ 출발일이 없는 문서는 그 자물쇠가 없으므로 금액으로 막는다(차선). */
  /* ⚠ **`String(날짜).slice(0,10)`은 「Mon Mar 09」가 된다.** DB 드라이버가 `date` 컬럼을
     **Date 객체**로 돌려주기 때문이다. 그대로 열쇠로 쓰면 「2026-03-09」와 절대 안 맞아
     중복 방어가 통째로 무력해진다 — 실제로 이 버그로 싱가포르·오키나와·제주도·도쿄·
     대만·홍콩이 두 번 들어갈 뻔했다(dry-run에서 잡았다).
     이 저장소가 이미 적어 둔 함정이다: 「날짜는 YYYY-MM-DD 문자열로 내린다 — Date로
     넘기면 현지시각으로 해석돼 하루가 밀린다」(api/quotes.js).
     ⚠ **`toISOString()`도 안 된다.** `date` 컬럼은 **로컬 자정**의 Date로 오기 때문에
       UTC로 바꾸면 한국(UTC+9)에서는 **전날**이 된다(2026-03-09 → 2026-03-08).
       그래서 로컬 날짜 조각을 그대로 읽는다. */
  const ymd = (v) => {
    if (!v) return '';
    if (v instanceof Date) {
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0')
        + '-' + String(v.getDate()).padStart(2, '0');
    }
    return String(v).slice(0, 10);
  };
  const byDate = new Set(), byAmount = new Set();
  existing.forEach((r) => {
    const d = ymd(r.depart_date);
    if (d) byDate.add(r.destination_key + '|' + d);
    byAmount.add([r.destination_key,
      r.airfare_unit == null ? '' : Math.round(Number(r.airfare_unit)),
      r.hotel_unit == null ? '' : Math.round(Number(r.hotel_unit))].join('|'));
  });
  /* ⚠ 중복 열쇠를 **눈에 보이게 찍는다.** 날짜 형식이 어긋나면 방어가 통째로 무력해지는데
     그건 조용히 일어난다(실제로 「Mon Mar 09」로 잘려 안 맞았다). 찍어 두면 바로 보인다. */
  console.log('이미 들어 있는 제보 ' + existing.length + '행 — 이것과 겹치는 것은 안 넣는다');
  console.log('  중복 열쇠(목적지|출발일): ' + [...byDate].sort().join(' · ') + '\n');

  const rows = [], skipped = [];
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { skipped.push({ f, why: '읽기 실패' }); continue; }
    const dn = destFromName(f);
    if (!dn.key) { skipped.push({ f, why: dn.why }); continue; }

    const values = {}, sources = {}, excluded = {};
    let filled = 0, dropped = 0;
    Object.keys(COLS).forEach((k) => {
      const v = (r.values || {})[k];
      if (v == null || !(v > 0)) return;
      /* 10회 검토에서 걸린 칸은 **값을 넣지 않는다** — 제보에 들어가면 요율 근거가 된다 */
      if (verdict[f + '|' + k] === false) { dropped++; return; }
      values[k] = v;
      sources[k] = ((r.evidence || {})[k] || {}).via || 'rule';
      /* TI와 같은 잣대 — 검산 안 된 값은 평균에서 자동으로 뺀다(값은 남는다) */
      if (!PLAUSIBILITY.countsAsMeasured(sources[k])) {
        excluded[k] = PLAUSIBILITY.AUTO_EXCLUDE_MARK
          + '검산 안 됨 — 확인 필요 목록에서 확정하면 다시 반영됩니다';
      }
      filled++;
    });
    if (!filled) { skipped.push({ f, why: '넣을 값이 없다(전부 검토에서 걸리거나 못 읽음)' }); continue; }

    const depart = (r.dates && r.dates.departDate) || null;
    const dateKey = depart ? dn.key + '|' + depart : null;
    const amtKey = [dn.key, values.airfare == null ? '' : Math.round(values.airfare),
      values.hotel == null ? '' : Math.round(values.hotel)].join('|');
    if (dateKey && byDate.has(dateKey)) {
      skipped.push({ f, why: '이미 들어 있다 — 같은 목적지·같은 출발일' }); continue;
    }
    if (!dateKey && byAmount.has(amtKey)) {
      skipped.push({ f, why: '이미 들어 있다 — 출발일이 없어 금액으로 대조' }); continue;
    }
    if (dateKey) byDate.add(dateKey);
    byAmount.add(amtKey);

    rows.push({
      file: f, dest: dn.key, values, sources, excluded,
      depart, quote: (r.dates && r.dates.quoteDate) || null,
      nights: (r.dates && r.dates.nights) || null,
      hotelName: (r.values && r.values.hotelName) || null,
      sell: (r.values && r.values.sell) || null,
      dropped,
    });
  }

  console.log('▪ 넣을 것 ' + rows.length + '건');
  rows.forEach((x) => console.log('   ' + x.dest.padEnd(9)
    + Object.keys(x.values).length + '칸'
    + (x.dropped ? ' (검토에서 걸린 ' + x.dropped + '칸은 뺐다)' : '').padEnd(24)
    + (x.depart || '출발일 없음').padEnd(12) + x.file.slice(0, 42)));

  console.log('\n▪ 안 넣는 것 ' + skipped.length + '건');
  const byWhy = {};
  skipped.forEach((s) => { (byWhy[s.why] = byWhy[s.why] || []).push(s.f); });
  Object.entries(byWhy).forEach(([why, fs2]) => {
    console.log('   ' + String(fs2.length).padStart(3) + '건  ' + why);
    fs2.slice(0, 5).forEach((f) => console.log('        · ' + f.slice(0, 58)));
    if (fs2.length > 5) console.log('        … ' + (fs2.length - 5) + '건 더');
  });

  if (!APPLY) { console.log('\n── dry-run이라 아무것도 쓰지 않았다. 넣으려면 --apply ──'); return; }

  let n = 0;
  for (const x of rows) {
    const v = x.values;
    await sql`
      insert into actual_price_reports
        (destination_key, airfare_unit, hotel_unit, hotel_name, meal_unit,
         fuel_unit, vehicle_unit, guide_unit, sight_unit, golf_unit, sell_price_unit,
         depart_date, quote_date, nights,
         excluded_fields, field_sources, author, source)
      values (${x.dest}, ${v.airfare ?? null}, ${v.hotel ?? null}, ${x.hotelName}, ${v.meal ?? null},
              ${v.fuel ?? null}, ${v.vehicle ?? null}, ${v.guide ?? null}, ${v.sight ?? null},
              ${v.golf ?? null}, ${x.sell ?? null},
              ${x.depart}, ${x.quote}, ${x.nights},
              ${Object.keys(x.excluded).length ? JSON.stringify(x.excluded) : null}::jsonb,
              ${JSON.stringify(x.sources)}::jsonb, ${AUTHOR}, 'pdf')
    `;
    n++;
  }
  console.log('\n제보 ' + n + '건을 넣었다. 요율 관리의 ✅실측 배지·갱신 제안·견적 정확도가 이제 이 값을 본다.');
})();

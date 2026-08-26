/* ═══════════════════════════════════════════════════════════════════════════
   제보 되짚기 (TX) — **운영 DB에 들어간 값을 원본 견적서로 다시 맞춰 본다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-13 사장님: 「업데이트된 견적사항들 제대로 세분화시켜서 잘 뽑아냈는지 리체크.」

   넣는 쪽(import_corpus_reports)과 재는 쪽이 **같은 추출기**를 쓰므로, 「같은 값이
   나온다」는 것만으로는 아무것도 증명하지 못한다. 그래서 이 도구는 **세 가지 다른 것**을 본다:

     ① 저장 뒤틀림  DB 값 ≠ 지금 다시 뽑은 값 인가 (숫자·날짜·박수가 도중에 바뀌었나)
     ② 세분화       9칸 중 몇 칸이 찼는가 · **빈 칸은 왜 비었는가**
     ③ 표시 정합    검산 안 된 값에 자동 제외 표시가 붙었는가 · 출처가 남았는가
     ④ 요율 정합    요율 오버라이드가 그 목적지 제보와 어긋나지 않는가

   ⚠ ①에서 값이 **다르게 나오는 것 자체는 오류가 아닐 수 있다** — 그 사이 추출기가
     좋아졌으면 지금 값이 더 맞다. 그래서 「다르다」가 아니라 **「어느 쪽이 더 맞아
     보이는가」**를 함께 찍는다(11회 검토 결과를 옆에 둔다).
   ⚠ 읽기 전용이다. 고치지 않는다 — 무엇을 고칠지는 사람이 본 뒤에 정한다.

   실행: node ai-loop/recheck_reports.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');

const ROOT = path.join(__dirname, '..');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const VALIDATED = path.join(ROOT, '.corpus_validated.json');

const PLAUSIBILITY = require(path.join(ROOT, 'plausibility.js'));
const destinationRates = require(path.join(ROOT, 'data.js'));
const { destFromName } = require('./_dest_from_name');

/* XQ: 항목 키는 `api/_lib/item_keys.js` 한 곳에서 온다 */
const CELLS = require('../api/_lib/item_keys').CORPUS_ITEM_KEYS;
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
const won = (n) => (n == null ? '—' : Number(Math.round(n)).toLocaleString());
/* `date` 컬럼은 **로컬 자정**의 Date로 온다 — toISOString을 쓰면 한국에서 전날이 된다(TV). */
const ymd = (v) => {
  if (!v) return '';
  if (v instanceof Date) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0')
      + '-' + String(v.getDate()).padStart(2, '0');
  }
  return String(v).slice(0, 10);
};

(async () => {
  if (!fs.existsSync(CORPUS)) { console.log('코퍼스 폴더가 없습니다: ' + CORPUS); process.exit(1); }
  const verdict = fs.existsSync(VALIDATED)
    ? JSON.parse(fs.readFileSync(VALIDATED, 'utf8')).reduce((o, v) => {
      o[v.file + '|' + v.cell] = v; return o;
    }, {})
    : {};

  require('./_load_env')();
  const { sql } = require(path.join(ROOT, 'api', '_lib', 'db'));
  const reports = await sql`select * from actual_price_reports order by id`;
  const ovRows = await sql`select destination_key, overrides from rate_overrides`;
  const ov = {};
  ovRows.forEach((r) => { ov[r.destination_key] = r.overrides || {}; });

  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('제보 ' + reports.length + '행 · 견적서 ' + files.length + '건을 다시 뽑아 맞춰 본다… (2~4분)\n');

  /* 견적서를 다시 뽑아 [목적지|출발일]로 색인한다 — 넣을 때 쓴 열쇠와 같다 */
  const fresh = {};
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f, r.text);
    if (!dn.key) continue;
    const key = dn.key + '|' + ((r.dates && r.dates.departDate) || '');
    fresh[key] = { file: f, r };
  }

  /* ── ①② 행마다 되짚기 ─────────────────────────────────────────────────── */
  let matched = 0, drift = 0, noSource = 0;
  const driftRows = [], unmatched = [];
  console.log('목적지      출발일        찬칸  원본과   빈 칸이 왜 비었나');
  console.log('─'.repeat(112));
  reports.forEach((row) => {
    const key = row.destination_key + '|' + ymd(row.depart_date);
    const hit = fresh[key];
    const filled = CELLS.filter((k) => row[COL[k]] != null);
    const srcs = row.field_sources || {};
    if (!Object.keys(srcs).length) noSource++;

    if (!hit) {
      unmatched.push(row);
      console.log(String(row.destination_key).padEnd(11) + (ymd(row.depart_date) || '출발일없음').padEnd(13)
        + String(filled.length).padStart(3) + '칸   원본없음  ' + String(row.author).slice(0, 22));
      return;
    }
    matched++;
    /* ① 저장 뒤틀림 — DB 값과 지금 뽑은 값이 다른가 */
    const diffs = [];
    CELLS.forEach((k) => {
      const dbv = row[COL[k]] == null ? null : Math.round(Number(row[COL[k]]));
      const nowv = (hit.r.values || {})[k] == null ? null : Math.round(hit.r.values[k]);
      /* 넣을 때 11회 검토에서 걸려 **일부러 안 넣은 칸**은 차이가 아니다 */
      const v = verdict[hit.file + '|' + k];
      const droppedOnPurpose = dbv == null && nowv != null && v && v.ok === false;
      if (dbv !== nowv && !droppedOnPurpose) diffs.push({ k, dbv, nowv });
    });
    if (diffs.length) {
      drift++;
      /* UY: **왜 어긋났는지**를 함께 담는다. 예전에는 「DB 115,827 ↔ 지금 111,891」만
         찍혀서, 사람이 그 자리에서 곱셈을 해 봐야 원인을 알 수 있었다. 실측 3행의
         원인은 전부 **분모가 달라진 것**이었다:
           후아힌  인원 199 → 206  (관광 115,827×199 = 111,891×206, 총액은 같다)
           다낭    일수 4 → 5      (식비 40,950×4 = 32,760×5)
         분모가 바뀐 것이면 **지금 값이 맞다**(추출기가 좋아진 것). 그 판단이 30초짜리가
         되도록 곱셈까지 해서 보여 준다 — 안 그러면 이 도구는 「뭔가 다르다」에서 멈춘다. */
      const nowPax = hit.r.pax || null;
      const nowDays = (hit.r.dates && hit.r.dates.days) || null;
      const nowNights = (hit.r.dates && hit.r.dates.nights) || null;
      const dbNights = row.nights == null ? null : Number(row.nights);
      /* ⚠ **비율만 보고 원인을 고르지 않는다.** 실측에서 다낭 건의 비율 1.25가 인원과
         일수 둘 다에 맞아떨어져, 먼저 시도한 「인원 30 → 24」로 잘못 단정했다.
         (실제로는 일수 4 → 5였다.) 제보 행에 저장된 **박수**가 그 자리의 증인이다 —
         박수가 달라졌으면 일수 쪽, 그대로면 인원 쪽으로 본다.
         증인이 없거나 둘 다 맞으면 **하나를 고르지 않고 둘 다 적는다.** */
      const nightsMoved = dbNights != null && nowNights != null && dbNights !== nowNights;
      diffs.forEach((x) => {
        if (!x.dbv || !x.nowv) return;
        const ratio = x.dbv / x.nowv;
        const fits = [];
        /* ⚠ 방향에 주의한다. 1인당 단가 = 총액 ÷ 분모이므로
             옛값 ÷ 지금값 = 지금분모 ÷ 옛분모  →  **옛분모 = 지금분모 ÷ 비율**이다.
           처음에 `지금분모 × 비율`로 적었다가 후아힌(206 ÷ 1.0352 = 199)을 놓치고
           다낭에는 「인원 30」이라는 없는 값을 붙였다 — 곱셈이 우연히 정수가 나온 것이다.
           실측 두 건으로 방향을 확인했다: 후아힌 199 → 206 · 다낭 일수 4 → 5. */
        const fit = (what, now) => {
          if (!now) return;
          const then = Math.round(now / ratio);
          if (then >= 1 && then !== now && Math.abs(now / ratio - then) <= 0.02) {
            fits.push({ what, now, then });
          }
        };
        fit('인원', nowPax);
        fit('일수', nowDays);
        if (!fits.length) return;
        const say = (c) => c.what + ' ' + c.then + ' → ' + c.now;
        if (fits.length === 1) {
          x.why = say(fits[0]) + '로 다시 읽혔다 (총액은 같다)';
          return;
        }
        /* 둘 다 맞는다 — 저장된 박수가 갈라 준다 */
        const byNights = fits.find((c) => c.what === '일수');
        const byPax = fits.find((c) => c.what === '인원');
        if (nightsMoved && byNights) {
          x.why = say(byNights) + '로 다시 읽혔다 (제보에 저장된 박수 ' + dbNights
            + '박과도 맞는다 · 총액은 같다)';
        } else if (dbNights != null && nowNights === dbNights && byPax) {
          x.why = say(byPax) + '로 다시 읽혔다 (박수는 그대로 ' + dbNights + '박 · 총액은 같다)';
        } else {
          x.why = '분모가 달라졌다 — ' + fits.map(say).join(' 또는 ') + ' (총액은 같다 · 어느 쪽인지는 사람이 봐야 한다)';
        }
      });
      driftRows.push({ row, hit, diffs });
    }

    /* ② 빈 칸이 왜 비었나 */
    const why = CELLS.filter((k) => row[COL[k]] == null).map((k) => {
      const v = verdict[hit.file + '|' + k];
      if (v && v.ok === false) return LABEL[k] + '(검토탈락)';
      if ((hit.r.values || {})[k] == null) return LABEL[k] + '(못읽음)';
      return LABEL[k] + '(?)';
    });
    console.log(String(row.destination_key).padEnd(11) + (ymd(row.depart_date) || '출발일없음').padEnd(13)
      + String(filled.length).padStart(3) + '칸   ' + (diffs.length ? '🔴다름 ' + diffs.length : '  일치 ').padEnd(9)
      + why.join(' · ').slice(0, 62));
  });

  /* ── ③ 표시 정합 ──────────────────────────────────────────────────────── */
  console.log('\n═══ ③ 표시 정합 — 검산 안 된 값에 자동 제외가 붙었는가 ═══');
  let badMark = 0;
  reports.forEach((row) => {
    const srcs = row.field_sources || {};
    const ex = row.excluded_fields || {};
    CELLS.forEach((k) => {
      if (row[COL[k]] == null) return;
      const via = srcs[k];
      if (!via) return;                                   /* 옛 제보는 출처가 없다 */
      const should = !PLAUSIBILITY.countsAsMeasured(via);
      const has = ex[k] != null;
      if (should && !has) {
        badMark++;
        console.log('  🔴 id ' + row.id + ' ' + row.destination_key + ' ' + LABEL[k]
          + ' — 출처가 「' + via + '」인데 제외 표시가 없다 (평균에 그대로 들어간다)');
      }
    });
  });
  if (!badMark) console.log('  ✅ 어긋난 칸 없음');

  /* ── ④ 요율 정합 ──────────────────────────────────────────────────────── */
  console.log('\n═══ ④ 요율 오버라이드가 그 목적지 제보와 어긋나지 않는가 ═══');
  const byDest = {};
  reports.forEach((row) => {
    CELLS.forEach((k) => {
      const v = row[COL[k]];
      if (v == null) return;
      const ex = row.excluded_fields || {};
      if (ex[k] != null) return;                          /* 평균에서 뺀 값은 기준이 아니다 */
      ((byDest[row.destination_key] = byDest[row.destination_key] || {})[k] ||= []).push(Number(v));
    });
  });
  let odd = 0;
  Object.entries(ov).forEach(([dest, fields]) => {
    Object.keys(fields).forEach((rateCell) => {
      const k = CELLS.find((c) => RATE[c] === rateCell);
      if (!k) return;
      const list = (byDest[dest] || {})[k];
      if (!list || !list.length) {
        console.log('  ⚠ ' + dest.padEnd(9) + LABEL[k].padEnd(5) + '요율 ' + won(fields[rateCell]).padStart(11)
          + '  ← 이 목적지 제보에 그 칸이 없다(다른 근거로 넣은 값)');
        return;
      }
      const med = PLAUSIBILITY.median(list);
      const ratio = fields[rateCell] > med ? fields[rateCell] / med : med / fields[rateCell];
      if (ratio >= 1.5) {
        odd++;
        console.log('  🔴 ' + dest.padEnd(9) + LABEL[k].padEnd(5) + '요율 ' + won(fields[rateCell]).padStart(11)
          + '  vs 제보 중앙값 ' + won(med).padStart(11) + '  (' + ratio.toFixed(1) + '배, 제보 ' + list.length + '건)');
      }
    });
  });
  if (!odd) console.log('  ✅ 1.5배 넘게 벌어진 칸 없음');

  console.log('\n' + '═'.repeat(112));
  console.log('원본과 맞춰 본 제보 ' + matched + '행 · 원본을 못 찾은 ' + unmatched.length + '행');
  console.log('  🔴 저장 뒤틀림이 있는 행 ' + drift + '행');
  driftRows.slice(0, 10).forEach((d) => {
    console.log('     ' + d.row.destination_key + ' (id ' + d.row.id + ') ' + d.hit.file.slice(0, 36));
    d.diffs.forEach((x) => console.log('        ' + LABEL[x.k].padEnd(5)
      + 'DB ' + won(x.dbv).padStart(12) + '  ↔  지금 ' + won(x.nowv).padStart(12)
      + (x.why ? '   ← ' + x.why : '')));
  });
  console.log('  출처(field_sources)가 비어 있는 옛 제보 ' + noSource + '행');
})();

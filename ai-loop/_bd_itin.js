/* ═══════════════════════════════════════════════════════════════════════════
   엑셀 일정표 → 일정 객체 (ZA)
   ───────────────────────────────────────────────────────────────────────────
   견적서 PDF 쪽(`api/_lib/pdf_extract.js`의 `findItinerary`)과 **똑같은 모양**을 낸다.

       { days: [{ day, date, hotel, place, meals:{b,l,d}, lines, am, pm, eve, split }] }

   ⚠ **변환을 새로 짓지 않으려고** 모양을 맞춘다. 이 객체를 `rec_fallbacks.js`의
     `recItinToCourse`에 그대로 넘기면, 담당자 화면이 쓰는 것과 **같은 함수**가 코스를
     만든다. 여기서 코스를 직접 조립하면 화면과 두 벌이 되고 반드시 어긋난다(결함 생성기 ①).

   엑셀이 PDF보다 쉬운 이유: 열이 이미 나뉘어 있다.

       일자 | 지역 | 교통편 | 시간 | 세부일정 | … | 식사

     PDF에서는 이 열들이 줄 하나로 납작해져서 x좌표로 되살려야 했다(UG에서 고생한 자리).
     엑셀에서는 **머리글을 찾아 열 번호만 잡으면** 된다.

   ⚠ **지어내지 않는다.** 지역·교통·식사·호텔은 문서에 그 칸이 있을 때만 채운다.
     빈 칸을 그럴듯한 문장으로 메우면 담당자가 그것을 사실로 읽는다.
   ⚠ 시각은 엑셀에서 **하루의 분수**(0.4201 = 10:05)로 온다. 숫자를 그대로 쓰면
     「0.42에 출발」이 된다.

   실행: node ai-loop/_bd_itin.js "북해도"     — 그 문서에서 읽은 일정을 눈으로
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const XLSX = require('xlsx');
const { gridOf } = require('./_bd_extract.js');

const txt = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).replace(/\s+/g, ' ').trim();
};

/* 「제 1 일」「1일차」「DAY 1」 — 날의 시작을 알리는 표기.
   🔴 여기에 단어경계(\b)를 쓰면 안 된다. 그것은 [A-Za-z0-9_] 기준이라
     **한글 뒤에는 경계가 생기지 않는다** — 「제 1 일」이 통째로 안 걸려
     일정표 33건이 전부 0일이 됐다. 막을 것은 뒤에 숫자가 더 붙는 경우뿐이다. */
const DAY_RE = /^(?:제\s*0?(\d{1,2})\s*일|0?(\d{1,2})\s*일\s*차|DAY\s*0?(\d{1,2}))(?!\d)/i;
function dayNo(s) {
  const m = String(s || '').trim().match(DAY_RE);
  return m ? Number(m[1] || m[2] || m[3]) : null;
}

/* 머리글 이름 → 우리가 쓰는 열 이름. 문서마다 띄어쓰기가 다르다(「일  자」「세부일정」). */
const HEAD = [
  /* ⚠ 「일 정」은 **본문** 열 이름이지 날짜 열이 아니다(「일 자 | 행 선 지 | 교 통 편 |
     시 간 | 일 정 | 식 사」). 날짜 쪽에 넣어 두면 본문을 못 찾아 그 문서가 통째로 빠진다. */
  ['day', /^일\s*자$|^날\s*짜$|^월\s*일$/],
  ['area', /^지\s*역$|^도\s*시$|^장\s*소$|^행\s*선\s*지$/],
  ['move', /^교\s*통\s*(편)?$|^교통수단$/],
  ['time', /^시\s*간$|^시\s*각$/],
  ['body', /^세\s*부\s*일\s*정$|^여\s*행\s*일\s*정$|^일\s*정$|^내\s*용$|^일정\s*내용$|^세\s*부\s*내\s*역$/],
  ['meal', /^식\s*사$|^식\s*음$/],
];

/* 머리글 줄을 찾는다 — 「일자」와 「세부일정」이 **같은 줄에** 있어야 한다.
   ⚠ 하나만 보고 정하면 표 밖의 낱말에 걸린다(「식사」는 포함사항 안내에도 나온다). */
function findHeader(grid) {
  for (let R = 0; R < Math.min(grid.length, 60); R++) {
    const col = {};
    for (let C = 0; C < grid[R].length; C++) {
      const t = txt(grid[R][C]);
      if (!t || t.length > 10) continue;
      for (const [key, re] of HEAD) if (col[key] === undefined && re.test(t)) col[key] = C;
    }
    if (col.day !== undefined && col.body !== undefined) return { row: R, col };
  }
  return null;
}

/* 엑셀 시각(하루의 분수) → 「10:05」. 1을 넘으면 시각이 아니다(그냥 숫자다). */
function hhmm(v) {
  /* 🔴 `cellDates:true`로 읽으면 **시각도 Date로 온다**(1899-12-30 언저리의 날짜).
     숫자만 받으면 시간대 분리가 전 문서에서 0이 된다 — 실측으로 그랬다.
     ⚠ 그 Date는 UTC로 만들어지므로 `getUTCHours`로 읽어야 시간대만큼 밀리지 않는다. */
  if (v instanceof Date && !isNaN(v)) {
    const h = v.getUTCHours(), m = v.getUTCMinutes();
    if (h === 0 && m === 0) return null;          /* 자정은 「시각 없음」이다 */
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  /* 「07:00」처럼 글자로 적힌 양식도 있다 */
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\s*[:：]\s*(\d{2})$/);
    if (m && +m[1] < 24 && +m[2] < 60) return String(+m[1]).padStart(2, '0') + ':' + m[2];
    return null;
  }
  if (typeof v !== 'number' || v <= 0 || v >= 1) return null;
  const mins = Math.round(v * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
function dateOf(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  /* 엑셀 일련번호(1900-01-01 기준). 4만 언저리가 2000년대다. */
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

const MEAL_RE = /(조식|중식|석식|아침|점심|저녁)\s*[:：]?\s*(.*)$/;
const MEAL_KEY = { 조식: 'b', 아침: 'b', 중식: 'l', 점심: 'l', 석식: 'd', 저녁: 'd' };
const HOTEL_RE = /^\s*(HOTEL|호텔)\s*[:：]/i;

/* 시각으로 오전·오후·저녁을 가른다. 문서가 시각을 준 날만 나뉜다 —
   ⚠ 시각이 없으면 **나누지 않는다**(`split:'none'`). 짐작해서 흩으면 엉뚱한 때에 놓인다. */
function zoneOf(hm) {
  if (!hm) return null;
  const h = Number(hm.slice(0, 2));
  if (h < 12) return 'am';
  if (h < 17) return 'pm';
  return 'eve';
}

function itinFromGrid(grid) {
  const h = findHeader(grid);
  if (!h) return null;
  const { col } = h;
  const cBody = col.body;
  const cMeal = col.meal !== undefined ? col.meal : null;

  /* 세부일정 열은 한 칸이 아니라 **여러 칸에 걸쳐** 적힌다(병합 흔적). 식사 열 앞까지 잇는다. */
  const bodyEnd = cMeal !== null && cMeal > cBody ? cMeal : cBody + 8;
  const joinBody = (row) => {
    const out = [];
    for (let C = cBody; C < Math.min(bodyEnd, row.length); C++) { const t = txt(row[C]); if (t) out.push(t); }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  };
  const joinMeal = (row) => {
    if (cMeal === null) return '';
    const out = [];
    for (let C = cMeal; C < Math.min(cMeal + 4, row.length); C++) { const t = txt(row[C]); if (t) out.push(t); }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  };

  const days = [];
  let cur = null;
  for (let R = h.row + 1; R < grid.length; R++) {
    const row = grid[R];
    const dcell = col.day !== undefined ? row[col.day] : null;
    const no = dayNo(txt(dcell));
    if (no !== null) {
      cur = { day: no, date: null, hotel: null, places: [], meals: {}, byLine: [] };
      days.push(cur);
    }
    if (!cur) continue;

    if (cur.date === null) { const d = dateOf(dcell); if (d) cur.date = d; }
    if (col.area !== undefined) { const a = txt(row[col.area]); if (a && a.length <= 12 && !cur.places.includes(a)) cur.places.push(a); }

    const body = joinBody(row);
    /* ⚠ 「HOTEL :」 줄은 본문 열에 있지 않다 — 표 **왼쪽 끝**에 걸쳐 적히는 양식이 많다
       (실측: 본문 열만 보면 숙박이 33건 전부 0이 된다). 그래서 줄 전체에서 찾는다. */
    const whole = row.map(txt).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (HOTEL_RE.test(whole)) {
      if (!cur.hotel) cur.hotel = whole.replace(HOTEL_RE, '').trim();
      continue;
    }

    const mealTxt = joinMeal(row);
    if (mealTxt) {
      const m = mealTxt.match(MEAL_RE);
      if (m) { const k = MEAL_KEY[m[1]]; if (k && !cur.meals[k]) cur.meals[k] = (m[2] || '').trim() || '포함'; }
    }

    if (!body) continue;
    const hm = col.time !== undefined ? hhmm(row[col.time]) : null;
    const move = col.move !== undefined ? txt(row[col.move]) : '';
    const head = [hm, move].filter(Boolean).join(' ');
    cur.byLine.push({ text: (head ? head + ' ' : '') + body, zone: zoneOf(hm) });
  }

  const out = days.filter((d) => d.byLine.length).map((d) => {
    const zoned = d.byLine.filter((x) => x.zone);
    /* 시각이 하나라도 있으면 시각으로 나눈다. 시각이 없는 줄은 **직전 시각대**를 잇는다
       (한 시각 아래 여러 줄이 딸리는 것이 이 양식의 기본 모습이다). */
    let split = 'none';
    const parts = { am: [], pm: [], eve: [] };
    if (zoned.length >= 2) {
      split = 'time';
      let z = null;
      for (const x of d.byLine) { if (x.zone) z = x.zone; if (z) parts[z].push(x.text); }
      /* 첫 시각 앞에 놓인 줄은 버리지 않고 오전에 붙인다 */
      const before = [];
      for (const x of d.byLine) { if (x.zone) break; before.push(x.text); }
      if (before.length) parts.am = before.concat(parts.am);
    }
    return {
      day: d.day, date: d.date, hotel: d.hotel,
      place: d.places.length ? d.places.join(' · ') : null,
      meals: { b: d.meals.b || null, l: d.meals.l || null, d: d.meals.d || null },
      lines: d.byLine.map((x) => x.text),
      am: parts.am.join(' / ') || null,
      pm: parts.pm.join(' / ') || null,
      eve: parts.eve.join(' / ') || null,
      split, splitWhy: split === 'none' ? 'no-time' : null,
    };
  });
  return out.length ? { days: out } : null;
}

/* 통합문서 한 권 → 일정. **일정이 가장 굵은 시트**를 고른다(견적 시트와 섞여 있다). */
function itinFromFile(abs) {
  let wb;
  try { wb = XLSX.read(fs.readFileSync(abs), { type: 'buffer', cellDates: true }); }
  catch (e) { return { ok: false, why: '열지 못함: ' + e.message.slice(0, 50) }; }
  let best = null;
  for (const name of wb.SheetNames) {
    const it = itinFromGrid(gridOf(wb.Sheets[name]));
    if (it && (!best || it.days.length > best.itin.days.length)) best = { sheet: name, itin: it };
  }
  if (!best) return { ok: false, why: '일정 격자를 못 찾음 (머리글에 「일자」와 「세부일정」이 함께 없다)' };
  const d = best.itin.days;
  return {
    ok: true, sheet: best.sheet, itin: best.itin,
    dayCount: d.length,
    splitDays: d.filter((x) => x.split !== 'none').length,
    mealDays: d.filter((x) => x.meals.b || x.meals.l || x.meals.d).length,
    hotelDays: d.filter((x) => x.hotel).length,
    dateDays: d.filter((x) => x.date).length,
  };
}

module.exports = { itinFromFile, itinFromGrid, findHeader, dayNo, hhmm, dateOf };

if (require.main === module) {
  const { bdFiles } = require('./_bd_files.js');
  const key = (process.argv[2] || '').normalize('NFC');
  const { files } = bdFiles(null, { quiet: true });
  const hit = files.filter((f) => !key || f.rel.normalize('NFC').includes(key));
  for (const f of hit.slice(0, 3)) {
    const r = itinFromFile(f.abs);
    console.log('■ ' + f.rel);
    if (!r.ok) { console.log('   🔴 ' + r.why + '\n'); continue; }
    console.log('   [' + r.sheet + '] ' + r.dayCount + '일 · 시간대 나뉜 날 ' + r.splitDays
      + ' · 식사 ' + r.mealDays + ' · 숙박 ' + r.hotelDays + ' · 날짜 ' + r.dateDays);
    for (const d of r.itin.days) {
      console.log('   DAY ' + d.day + (d.date ? ' (' + d.date + ')' : '') + (d.place ? '  ' + d.place : ''));
      if (d.split === 'none') console.log('      · ' + d.lines.join(' / ').slice(0, 150));
      else ['am', 'pm', 'eve'].forEach((z) => { if (d[z]) console.log('      ' + z.padEnd(4) + d[z].slice(0, 130)); });
      const m = d.meals;
      if (m.b || m.l || m.d) console.log('      식사  ' + [m.b && '조:' + m.b, m.l && '중:' + m.l, m.d && '석:' + m.d].filter(Boolean).join(' / '));
      if (d.hotel) console.log('      숙박  ' + d.hotel.slice(0, 90));
    }
    console.log('');
  }
}

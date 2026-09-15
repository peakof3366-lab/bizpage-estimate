/* ═══════════════════════════════════════════════════════════════════════════
   달력 계수 감사 — **월 시즌과 날짜 피크가 겹쳐 몇 배까지 붙는가**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표: 「추가 오류 검토도 부탁한다.」

   ■ 왜 보는가
   견적 엔진은 항공·유류에 **`seasonFactor × peakFactor`를 곱한다**(script.js:983).
   그런데 이 둘은 **서로 모르는 두 표**에서 온다:
     · `DEST_SEASON_PROFILES`(data.js) — **월 단위 넓은 시즌**, 항공·유류·**호텔**에
     · `PEAK_CALENDAR` / `LUNAR_PEAKS`(script.js) — **날짜 단위 짧은 피크**, 항공·유류에
   data.js 머리말이 그렇게 역할을 갈라 두었는데, 두 표가 **같은 날을 동시에 성수기로**
   잡으면 그 날은 두 번 오른다.
   🔴 실제로 일본이 그랬다(2026-09-15): 벚꽃 3/25~4/10 ×1.20이 날짜로 붙는데
     월 시즌표도 3·4월을 ×1.15로 잡아 **항공에 1.38배**가 걸리고 있었다.

   ■ 이 도구가 하는 일
   목적지 60곳 × 1년 365일을 전부 돌려 **겹치는 날**을 찾고, 최종 배율이 큰 순으로 센다.
   ⚠ **겹침이 곧 오류는 아니다.** 여름 최성수기처럼 실제로 두 배 가까이 뛰는 자리도 있다.
     여기서는 **어디가 얼마나 겹치는지 보여주기만** 한다(`audit_rates`와 같은 성격).

       node ai-loop/audit_calendar_stack.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* 🔴 엔진을 **실제로 띄운다.** 두 표를 각자 파싱해 다시 계산하면, 정작 엔진이
   바뀌었을 때 이 도구만 옛 답을 말한다(결함 생성기 ①). 엔진 함수를 그대로 부른다.
   ⚠ 띄우는 방법은 `_engine_boot.js` **하나가 진실이다** — 이 저장소가 「화면을 띄우는
     규칙이 도구마다 한 벌씩 생기면 그 도구만 조용히 다른 것을 잰다」고 여러 번 겪은
     자리다. 여기서 JSDOM을 새로 만들지 않는다. */
const { bootEngine } = require('./_engine_boot');

/* ⚠ `bootEngine`은 **async**다(운영 요율을 받아 얹는다). 전부 그 안에서 돌린다. */
(async () => {
const B = await bootEngine({ quiet: true });
const W = B.window;
/* `_engine_boot`가 창에 올려 준다(`window.__CAL`). 최상위 `const`는 밖에서 안 보여
   거기 한 줄을 더했다 — **읽기 전용 노출**이라 다른 검사에는 영향이 없다. */
const E = W.__CAL || {};
if (typeof E.getSeasonInfo !== 'function') {
  console.error('getSeasonInfo를 못 찾았습니다 — 엔진 구조가 바뀌었을 수 있습니다.');
  process.exit(1);
}
if (!E.PEAK_CALENDAR.length) {
  console.error('PEAK_CALENDAR가 비어 있습니다 — 노출 방식이 바뀌었는지 확인하세요.');
  process.exit(1);
}

/* 날짜 피크는 엔진 안에서 계산된다. 여기서는 **같은 규칙을 그대로 읽어** 날짜별로 본다.
   ⚠ 규칙이 바뀌면 여기도 같이 바뀌어야 한다 — 그래서 표 자체를 엔진에서 꺼내 쓴다. */
const inRange = (mmdd, from, to) => (from <= to ? (mmdd >= from && mmdd <= to) : (mmdd >= from || mmdd <= to));
function peakOf(dateStr, key) {
  const mmdd = dateStr.slice(5);
  let best = { factor: 1, label: '' };
  (E.PEAK_CALENDAR || []).forEach((p) => {
    const hit = p.keys === 'ALL' || (Array.isArray(p.keys) && p.keys.includes(key));
    if (hit && inRange(mmdd, p.from, p.to) && p.factor > best.factor) best = p;
  });
  (E.LUNAR_PEAKS || []).forEach((p) => {
    const hit = p.keys === 'ALL' || (Array.isArray(p.keys) && p.keys.includes(key));
    if (hit && dateStr >= p.from && dateStr <= p.to && p.factor > best.factor) best = p;
  });
  return best;
}

const YEAR = String(new Date().getFullYear() + 1); // 내년 한 해를 훑는다
const keys = Object.keys(E.DEST_CLASSIFY);
const hits = [];
keys.forEach((k) => {
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const ds = `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (new Date(ds + 'T00:00:00').getMonth() + 1 !== m) continue; // 없는 날짜
      let si;
      try { si = E.getSeasonInfo(ds, k); } catch (e) { continue; }
      const sf = (si && si.factor) || 1;
      const pk = peakOf(ds, k);
      if (sf > 1.001 && pk.factor > 1.001) {
        hits.push({ key: k, date: ds, sf, pf: pk.factor, label: pk.label,
          total: sf * pk.factor, sLabel: (si && si.label) || '' });
      }
    }
  }
});

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' 달력 계수 감사 — 월 시즌 × 날짜 피크가 겹치는 자리');
console.log('══════════════════════════════════════════════════════════════════');
console.log(` ${YEAR}년 · 목적지 ${keys.length}곳 × 365일 전수\n`);

if (!hits.length) {
  console.log(' ✓ 겹치는 날이 없습니다 — 두 표가 서로 다른 날을 맡고 있습니다.');
} else {
  /* 목적지·피크 이름별로 묶어 **구간**으로 보여준다. 날짜를 다 찍으면 못 읽는다. */
  const groups = {};
  hits.forEach((h) => {
    const gk = `${h.key}|${h.label}|${h.sLabel}|${h.total.toFixed(3)}`;
    (groups[gk] = groups[gk] || []).push(h.date);
  });
  /* ⚠ **날짜를 정렬해 처음~끝으로 찍으면 안 된다.** 연말연시(12/20~1/03)처럼 해를
     넘는 구간은 `01-01~12-31`로 보여 「1년 내내」로 읽힌다 — 처음에 그렇게 찍혀서
     고쳤다. **연속 구간으로 묶어** 보여준다. */
  const spans = (list) => {
    const ds = list.slice().sort();
    const out = []; let a = ds[0], prev = ds[0];
    for (let i = 1; i < ds.length; i++) {
      const gap = (new Date(ds[i]) - new Date(prev)) / 86400000;
      if (gap > 1) { out.push([a, prev]); a = ds[i]; }
      prev = ds[i];
    }
    out.push([a, prev]);
    return out;
  };
  const rows = Object.keys(groups).map((gk) => {
    const [key, label, sLabel, total] = gk.split('|');
    const sp = spans(groups[gk]);
    const txt = sp.map(([x, y]) => (x === y ? x.slice(5) : x.slice(5) + '~' + y.slice(5))).join(', ');
    return { key, label, sLabel, total: Number(total), n: groups[gk].length, txt };
  }).sort((a, b) => b.total - a.total || b.n - a.n);

  console.log(` 겹치는 자리 ${rows.length}종 (날짜 합계 ${hits.length}일)\n`);
  console.log('   배율    일수  목적지        기간                    월 시즌 × 날짜 피크');
  rows.slice(0, 40).forEach((r) => {
    console.log(`   ×${r.total.toFixed(2)}  ${String(r.n).padStart(3)}일  ${r.key.padEnd(12)} ${r.txt.padEnd(22)} ${r.sLabel} × ${r.label}`);
  });
  if (rows.length > 40) console.log(`   … 그리고 ${rows.length - 40}종 더`);

  const max = rows[0];
  console.log(`\n 🔴 가장 높은 배율: **×${max.total.toFixed(2)}** — ${max.key} ${max.txt}`);
  console.log(`    (${max.sLabel} × ${max.label})`);
}

console.log('\n──────────────────────────────────────────────────────────────────');
console.log(' ⚠ **겹침이 곧 오류는 아니다** — 여름 최성수기처럼 실제로 두 배 가까이 뛰는');
console.log('   자리도 있다. 다만 「월 시즌표가 이미 올린 달을 날짜 피크가 또 올리는가」를');
console.log('   보고, 그 배율이 실거래 감각과 맞는지는 대표가 판단한다.');
console.log(`결과: 겹치는 자리 ${hits.length}일 / ${keys.length}곳 × 365일`);
process.exit(0);
})();

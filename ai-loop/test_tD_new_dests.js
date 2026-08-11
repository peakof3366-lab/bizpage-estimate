/* TD 검증 — 목적지 추가(가고시마·후아힌) + 목적지 선택을 **나라별로** 묶기

   대표 요청(2026-08-11): 「여행 목적지에 제주도·가고시마·후아힌 추가. 그리고 목적지
   선택 시 나라별로 분리.」

   ⚠ **제주도는 이번에 안 넣었다** — 국내라 축 두 개(여행자보험 권역 계수 · 시즌
     프로파일)를 새로 정해야 하고, 그건 실거래가에 걸린 **대표 판단**이다
     (CLAUDE.md: 계수 값은 추정치로 밀지 말고 물어본다). 결정대기열에 올렸다.

   ⚠ **목적지 하나를 늘리면 손댈 곳이 여섯이다.** 하나만 빠뜨려도 조용히 폴백한다
     (결함 생성기 ①). 이 테스트가 그 여섯을 전부 센다:
       ① data.js 요율 행   ② DEST_CLASSIFY 6축   ③ ITINERARY_DB 코스
       ④ DEST_REC 방식 A·B  ⑤ 화면 select 두 곳    ⑥ 견적서 파일명 판정표
     실제로 TD에서 ③만 넣고 ④를 빠뜨렸다가 test_qL이 잡았다 —
     「활동 고르기 후보 0건」으로 나타났다.

   실행: node ai-loop/test_tD_new_dests.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RATES = require('../data.js');
const { destFromName } = require('./_dest_from_name.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const dataSrc = read('data.js');
const D = (function () {
  const o = {};
  new Function('module', 'exports', dataSrc + '\n;this.ITINERARY_DB=ITINERARY_DB;this.DEST_REC=DEST_REC;this.DEST_CLASSIFY=DEST_CLASSIFY;')
    .call(o, { exports: {} }, {});
  return o;
})();

const NEW = [
  { key: '가고시마', peer: '후쿠오카', country: '일본', currency: 'JPY', season: 'japan' },
  { key: '후아힌', peer: '방콕', country: '태국', currency: 'THB', season: 'seasia' },
];

/* ── [1] 손댈 곳 여섯을 전부 채웠는가 ────────────────────────────────── */
console.log('[1] 목적지 하나에 손댈 곳 여섯');
NEW.forEach(({ key, peer, country, currency, season }) => {
  const row = RATES.find((d) => d.destination_key === key);
  ok(`① ${key} 요율 행이 있다`, !!row);
  const cls = D.DEST_CLASSIFY[key];
  ok(`② ${key} 분류 6축이 있다`, !!cls && cls.country === country && cls.currency === currency && cls.season === season,
    JSON.stringify(cls));
  ok(`③ ${key} 기본 코스가 있다`, Array.isArray(D.ITINERARY_DB[key]) && D.ITINERARY_DB[key].length >= 1,
    String((D.ITINERARY_DB[key] || []).length));
  ok(`④ ${key} 방식 A·B가 있다`, !!(D.DEST_REC[key] && D.DEST_REC[key].a && D.DEST_REC[key].b));
  ok(`⑤ ${key} 화면 select 두 곳에 있다`,
    read('index.html').includes(`<option value="${key}">`) && read('admin-quote.html').includes(`<option value="${key}">`));
  ok(`⑥ ${key} 견적서 파일명으로 알아본다`, destFromName(`굿리치 ${key} 워크샵.pdf`).key === key,
    JSON.stringify(destFromName(`굿리치 ${key} 워크샵.pdf`)));

  /* 단가는 같은 나라 동료를 복제했다 — **실측을 그대로 넣지 않았다.**
     가고시마 호텔 727,000(온천 료칸 1건) · 후아힌 식비 110,376(199명 만찬)은
     요율표의 '평시 기준'과 성격이 다르다. 실측은 제보로 들어와 갱신 제안이 알린다. */
  const p = RATES.find((d) => d.destination_key === peer);
  const same = ['airfare', 'fuel_surcharge', 'hotel_per_room', 'meal_per_person',
    'vehicle_large', 'guide_fee', 'sightseeing_fee', 'margin_per_traveler']
    .every((f) => Number(row[f]) === Number(p[f]));
  ok(`${key} 단가가 ${peer}와 같다 (추정치를 지어내지 않았다)`, same);
  ok(`${key} 행에 「복사한 출발점」이라고 적혀 있다`, /복사한 출발점/.test(row.notes || ''), row.notes);
});

/* TE: 제주도는 **대표 지시로 온라인 취합값을 먼저 넣었다**(「나중에 손으로 고치겠다」).
   ⚠ 국내라 축 셋이 새것이다 — 보험 domestic · 통화 KRW · 시즌 korea.
     그 셋이 실제로 걸려 있는지는 test_tE가 따로 잰다. */
ok('제주도가 들어갔다', RATES.some((d) => d.destination_key === '제주도'));

/* ── [2] 목록이 서로 어긋나지 않는가 ─────────────────────────────────── */
console.log('\n[2] 목록끼리 어긋나지 않는가');
const rateKeys = RATES.map((d) => d.destination_key);
ok('요율표와 분류표가 1:1', rateKeys.every((k) => D.DEST_CLASSIFY[k])
  && Object.keys(D.DEST_CLASSIFY).length === rateKeys.length,
  rateKeys.length + ' vs ' + Object.keys(D.DEST_CLASSIFY).length);
ok('요율표 목적지가 전부 코스를 갖는다',
  rateKeys.filter((k) => !Array.isArray(D.ITINERARY_DB[k])).length === 0,
  rateKeys.filter((k) => !Array.isArray(D.ITINERARY_DB[k])).join(','));
ok('요율표 목적지가 전부 방식 A·B를 갖는다',
  rateKeys.filter((k) => !D.DEST_REC[k]).length === 0,
  rateKeys.filter((k) => !D.DEST_REC[k]).join(','));

/* ── [3] 나라별로 묶는가 ─────────────────────────────────────────────── */
console.log('\n[3] 목적지 선택을 나라별로 묶는가');
const admin = read('admin.html');
ok('나라별로 묶는 도우미가 한 곳에 있다', /function appendDestOptionsByCountry/.test(admin));
ok('견적서 업데이트가 그것을 쓴다', /appendDestOptionsByCountry\(sel, destinationRates\.map/.test(admin));
ok('일정 관리도 그것을 쓴다', /appendDestOptionsByCountry\(sel, itiDestKeys\(\)/.test(admin));
/* ⚠ 나라 표를 화면이 다시 적으면 목록이 두 벌이 된다 */
ok('나라는 DEST_COUNTRY에서만 온다 (표를 다시 적지 않았다)',
  /const c = destCountryOf\(k\) \|\| '기타';/.test(admin));
ok('나라를 모르는 목적지도 「기타」로 남는다 (버리지 않는다)', /\|\| '기타'/.test(admin));
ok('머리줄에 몇 곳인지 적는다', /g\.label = c \+ ' \(' \+ byName\[c\]\.length \+ '\)';/.test(admin));
/* 나라가 머리줄에 있으므로 옵션에 또 붙이지 않는다 */
ok('옵션에 「(나라)」를 두 번 적지 않는다', !/const suffix = \(c && c !== d\.label\)/.test(admin));

/* 고객 화면은 원래 나라별이었다 — 새 목적지가 **맞는 나라 그룹**에 들어갔는지 본다 */
const idx = read('index.html');
const inGroup = (label, opt) => {
  const i = idx.indexOf('<optgroup label="' + label + '"');
  if (i < 0) return false;
  const j = idx.indexOf('</optgroup>', i);
  return idx.slice(i, j).includes(opt);
};
ok('가고시마가 일본 그룹에 있다', inGroup('동북아시아 — 일본', '<option value="가고시마">'));
ok('후아힌이 태국 그룹에 있다', inGroup('동남아시아 — 태국', '<option value="후아힌">'));

/* ── [4] 실제로 견적이 나오는가 (jsdom으로 진짜 엔진을 돌린다) ────────
   ⚠ 소스만 봐서는 「행을 넣었다」까지밖에 모른다. 분류 축 하나가 어긋나면 견적이
     조용히 폴백하거나 0이 된다 — 실제로 계산해 봐야 안다. */
(async () => {
  const { JSDOM } = require('jsdom');
  const NL = String.fromCharCode(10);
  const EXPOSE = NL + ';try{window.__gbd=getBreakdownData;}catch(e){}';
  const APP = read('data.js') + NL + read('company-info.js') + NL
    + read('rec_fallbacks.js') + NL + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const w = dom.window;
  try { w.eval(APP); } catch (e) { console.log('  [eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 120));
  const doc = w.document;
  const gbd = w.__gbd;

  console.log(NL + '[4] 새 목적지로 견적이 실제로 나오는가');
  if (typeof gbd !== 'function') {
    ok('엔진을 불러오지 못했다', false);
  } else {
    const quote = (dest) => {
      doc.getElementById('destination').value = dest;
      doc.getElementById('participants').value = '20';
      doc.getElementById('days').value = '5';
      doc.getElementById('startDate').value = '2027-05-10';
      ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing']
        .forEach((id) => { const e = doc.getElementById(id); if (e) e.checked = true; });
      return gbd();
    };
    NEW.forEach(({ key, peer }) => {
      const a = quote(key); const b = quote(peer);
      ok(key + ' 견적이 실제로 나온다', !!a && a.total > 0, a && String(a.total));
      /* 단가를 복제했으므로 **같은 조건이면 동료와 금액이 같아야 한다** —
         다르면 분류 축(시즌·보험·좌석·통화) 중 하나가 어긋난 것이다. */
      ok(key + ' 금액이 ' + peer + '와 같다 (분류 축이 어긋나지 않았다)',
        a && b && a.total === b.total, (a && a.total) + ' vs ' + (b && b.total));
      /* 여행자보험이 실제로 붙는지 — 권역 등록을 빠뜨리면 중립값으로 조용히 폴백한다 */
      const ins = a && a.rows.find((r) => /여행자보험/.test(r.name));
      ok(key + ' 여행자보험이 붙는다 (보험 권역에 등록됐다)', !!ins && ins.amount > 0,
        ins && String(ins.amount));
    });
    /* 일정도 실제로 나오는가 — 코스만 넣고 방식 A·B를 빠뜨리면 여기서 드러난다 */
    NEW.forEach(({ key }) => {
      const it = w.getItineraries ? w.getItineraries(key, 'industry') : null;
      ok(key + ' 추천 일정이 나온다', Array.isArray(it) && it.length === 2 && it[0] && it[0].days.length > 0,
        it ? String(it.length) : 'null');
    });
  }
  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

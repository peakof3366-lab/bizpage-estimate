/* TE 검증 — 제주도(유일한 **국내** 목적지)

   대표 지시(2026-08-11): 「제주도는 온라인 상에서 정보를 취합해서 먼저 구현해 줘.
   차후에 우리가 직접 손으로 수정작업을 거치든지 할게.」
   → 그래서 **온라인 취합값**이다. 어디를 손봐야 하는지 행의 notes와 결정대기열에 남겼다.

   국내라 해외와 축이 셋 다르다:
     ① 보험 `domestic` — 국내여행자보험은 해외여행자보험과 성격이 다르다(계수 0.15)
     ② 시즌 `korea`    — 여름 휴가철(7~8월) 성수기. 일본(벚꽃·단풍)과도, 동남아(건기)와도 다르다
     ③ 통화 `KRW`      — 환율 보정 대상이 아니다

   ⚠ **보험 구간 이름은 세 곳에 있다** — 엔진(script.js) · 서버(api/rates.js) ·
     관리자 새 목적지 폼(admin.html). 실제로 엔진에만 넣었다가 test_pP가 잡았다.
     한 곳이라도 빠지면 그 목적지 보험이 **조용히 중립값 1.00으로 폴백**한다
     (해외 최고 구간과 12배 차이가 난다 — 결함 생성기 ②).
   ⚠ **환율은 KRW를 건너뛰어야 한다.** 안 그러면 KRW→KRW 기준선 1.0을 만들어 두고
     「보정하고 있다」는 착각을 준다.
   ⚠ **견적서 파일명 별칭은 '제주도'여야 한다.** '제주'로 하면 코퍼스의
     「EnBT 세부내역서-제주개발공사 싱가포르,조호바루」가 「목적지 여러 곳」으로 빠져
     지금 잘 되던 싱가포르 건이 조용히 사라진다(세부내역서→세부 전례와 같은 함정).

   실행: node ai-loop/test_tE_jeju_domestic.js  (프로젝트 루트에서) */
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
  new Function('module', 'exports', dataSrc
    + '\n;this.ITINERARY_DB=ITINERARY_DB;this.DEST_REC=DEST_REC;this.DEST_CLASSIFY=DEST_CLASSIFY;'
    + 'this.DEST_SEASON_PROFILES=DEST_SEASON_PROFILES;')
    .call(o, { exports: {} }, {});
  return o;
})();

(async () => {
  /* ── [1] 손댈 곳을 다 채웠는가 ──────────────────────────────────────── */
  console.log('[1] 제주도가 제대로 들어갔는가');
  const row = RATES.find((d) => d.destination_key === '제주도');
  ok('요율 행이 있다', !!row);
  const cls = D.DEST_CLASSIFY['제주도'];
  ok('국내 축 셋이 걸려 있다 (보험 domestic · 통화 KRW · 시즌 korea)',
    cls && cls.ins === 'domestic' && cls.currency === 'KRW' && cls.season === 'korea',
    JSON.stringify(cls));
  ok('나라가 대한민국이다', cls && cls.country === '대한민국');
  ok('기본 코스가 있다', Array.isArray(D.ITINERARY_DB['제주도']) && D.ITINERARY_DB['제주도'].length >= 1);
  ok('방식 A·B가 있다', !!(D.DEST_REC['제주도'] && D.DEST_REC['제주도'].a && D.DEST_REC['제주도'].b));
  ok('고객 화면 select 두 곳에 있다',
    read('index.html').includes('<option value="제주도">')
    && read('admin-quote.html').includes('<option value="제주도">'));
  ok('국내 그룹으로 묶였다', /<optgroup label="국내 — 대한민국">/.test(read('index.html')));

  /* ⚠ 온라인 취합값이라는 것을 행이 스스로 말해야 한다 — 나중에 손볼 자리를 잃지 않게 */
  ok('어느 칸이 추정인지 행에 적혀 있다',
    /온라인 취합 추정/.test(row.notes || ''), row.notes);

  /* ── [2] 견적서 파일명 판정 — '제주'가 아니라 '제주도' ───────────────── */
  console.log('\n[2] 파일명 판정이 남의 건을 뺏지 않는가');
  ok('「고은회 제주도.pdf」를 제주도로 본다', destFromName('고은회 제주도.pdf').key === '제주도');
  /* ⚠ 이것이 이 절의 핵심 — 회사 이름에 지명이 들어간 건이 사라지면 안 된다 */
  const jeju = destFromName('EnBT 세부내역서-제주개발공사 싱가포르,조호바루 4박6일.pdf');
  ok('**「제주개발공사 싱가포르」는 여전히 싱가포르다**', jeju.key === '싱가포르', JSON.stringify(jeju));
  ok('별칭이 「제주」가 아니라 「제주도」다', /\['제주도', \['제주도'\]\]/.test(read('ai-loop/_dest_from_name.js')));

  /* ── [3] 보험 구간이 세 곳에 다 있는가 ──────────────────────────────── */
  console.log('\n[3] 보험 구간 이름이 세 곳에 다 있는가');
  /* 🔴 XQ에서 **목록을 한 곳으로 모았다**(data.js). 그래서 「세 곳에 이름이 다 있는가」가
     아니라 「한 곳에 있고 나머지가 그것을 읽는가」를 본다 — 이름이 세 곳에 있으면
     그 자체가 결함이다(한쪽만 늘어나면 보험 계수가 조용히 1.00으로 떨어진다). */
  const DATA_TE = require(path.join(ROOT, 'data.js'));
  ok('① 목록에 국내(domestic)가 있다', (DATA_TE.INSURANCE_ZONE_IDS || []).includes('domestic'),
    String(DATA_TE.INSURANCE_ZONE_IDS));
  ok('① 엔진이 그 목록을 읽는다', /destGroupsBy\('ins',\s*INSURANCE_ZONE_IDS\)/.test(read('script.js')));
  ok('② 서버도 그 목록을 읽는다',
    /INSURANCE_ZONE_KEYS = new Set\(destinationRates\.INSURANCE_ZONE_IDS/.test(read('api/rates.js')));
  ok('③ 관리자 새 목적지 폼(admin.html)', /<option value="domestic">국내/.test(read('admin.html')));
  ok('국내 계수가 해외 최저 구간보다 낮다',
    /domestic: 0\.15, asiaShort: 0\.85/.test(read('script.js')));

  /* ── [4] 환율은 KRW를 건너뛰는가 ────────────────────────────────────── */
  console.log('\n[4] 환율이 원화를 건드리지 않는가');
  const seed = read('ai-loop/fx_seed.js');
  ok('시드가 KRW를 뺀다', /toUpperCase\(\) !== 'KRW'/.test(seed));
  ok('몇 곳을 뺐는지 조용히 넘기지 않는다', /원화\(KRW\) 목적지 ' \+ KRW_SKIPPED/.test(seed));

  /* ── [5] 시즌 프로파일이 실제로 쓰이는가 ────────────────────────────── */
  console.log('\n[5] 국내 시즌 프로파일');
  const korea = (D.DEST_SEASON_PROFILES || []).find((p) => p.id === 'korea');
  ok('korea 프로파일이 있다', !!korea);
  const peak = korea && korea.config.find((c) => c.id === 'peak');
  ok('여름(7~8월)이 성수기다', peak && peak.months.join(',') === '7,8', peak && peak.months.join(','));
  /* ⚠ 일본과 달라야 한다 — 같으면 프로파일을 새로 만든 뜻이 없다 */
  const japan = (D.DEST_SEASON_PROFILES || []).find((p) => p.id === 'japan');
  ok('일본 프로파일과 다르다 (벚꽃·단풍이 아니라 휴가철이다)',
    !japan || JSON.stringify(japan.config) !== JSON.stringify(korea.config));

  /* ── [6] 진짜 엔진으로 확인 ─────────────────────────────────────────── */
  console.log('\n[6] 실제 견적이 나오고 국내 축이 걸리는가');
  const { JSDOM } = require('jsdom');
  const NL = String.fromCharCode(10);
  const EXPOSE = NL + ';try{window.__gbd=getBreakdownData;window.__gii=getInsuranceInfo;'
    + 'window.__fx=getFxAdjust;}catch(e){}';
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

  if (typeof gbd !== 'function') {
    ok('엔진을 불러오지 못했다', false);
  } else {
    const quote = (dest, date) => {
      doc.getElementById('destination').value = dest;
      doc.getElementById('participants').value = '20';
      doc.getElementById('days').value = '4';
      doc.getElementById('startDate').value = date || '2027-05-10';
      ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing']
        .forEach((id) => { const e = doc.getElementById(id); if (e) e.checked = true; });
      return gbd();
    };
    const a = quote('제주도');
    ok('제주도 견적이 실제로 나온다', !!a && a.total > 0, a && String(a.total));

    /* 보험이 **국내 계수**로 붙는지 — 폴백하면 6배 넘게 비싸진다 */
    const ins = a && a.rows.find((r) => /여행자보험/.test(r.name));
    const insJp = quote('도쿄').rows.find((r) => /여행자보험/.test(r.name));
    ok('여행자보험이 붙는다', !!ins && ins.amount > 0, ins && String(ins.amount));
    ok('**국내 보험이 일본보다 싸다** (중립값으로 폴백하지 않았다)',
      ins && insJp && ins.amount < insJp.amount, (ins && ins.amount) + ' vs ' + (insJp && insJp.amount));

    /* 환율 보정이 없어야 한다 — 국내니까 */
    ok('환율 보정이 1.0이다 (국내라 보정 대상이 아니다)',
      typeof w.__fx !== 'function' || w.__fx('제주도') === 1.0, String(w.__fx && w.__fx('제주도')));

    /* 시즌이 실제로 갈리는지 — 7월(성수기)이 5월(평시)보다 비싸야 한다 */
    const peakQ = quote('제주도', '2027-07-20');
    const normQ = quote('제주도', '2027-05-10');
    ok('여름 성수기가 평시보다 비싸다 (korea 프로파일이 걸린다)',
      peakQ && normQ && peakQ.total > normQ.total, (peakQ && peakQ.total) + ' vs ' + (normQ && normQ.total));

    /* 추천 일정도 실제로 나오는가 */
    const it = w.getItineraries ? w.getItineraries('제주도', 'industry') : null;
    ok('추천 일정이 나온다', Array.isArray(it) && it.length === 2 && it[0] && it[0].days.length > 0,
      it ? String(it.length) : 'null');
  }
  dom.window.close();

  /* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
})();

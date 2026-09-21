/* ═══════════════════════════════════════════════════════════════════════════
   견적 엔진을 jsdom으로 띄우는 자 — 단일 출처 (VM)
   ───────────────────────────────────────────────────────────────────────────
   `script.js`의 엔진은 화면과 엮여 있어 jsdom으로 띄워야 한다. 그 부팅 코드가
   `backtest_quotes.js`와 `audit_error_decomp.js`에 **두 벌**로 있었고, 손잡이를
   돌려 재는 도구(`audit_spec_knobs.js`)가 생기면 세 벌이 된다.

   세 벌이 되면 무엇이 어긋나는가 — 겉으로는 안 보이는 것들이다:
     · 합쳐 eval하는 파일 목록(`rec_fallbacks.js`를 빼면 그 자리에서 죽는다)
     · **네트워크 차단**(안 막으면 운영 DB `site_events`에 행이 쌓인다)
     · **운영 요율 얹기**(안 얹으면 고객이 겪는 금액이 아니다 — VB에서 6칸이 허수였다)
   한 벌만 빠뜨려도 그 도구만 조용히 다른 것을 재게 된다(결함 생성기 ①).

   ⚠ **기본 손잡이 상태를 여기 한 곳에서 정한다.** 도구마다 다른 기본값으로 띄우면
     같은 여행에 대해 서로 다른 금액이 나오고, 그 차이는 숫자만 봐서는 못 잡는다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* CLAUDE.md가 정한 그대로 — 순서와 목록을 임의로 바꾸지 말 것 */
const APP_FILES = ['data.js', 'company-info.js', 'rec_fallbacks.js', 'script.js'];

/* 라디오 손잡이의 기본값 = 화면의 `checked` 그대로. 여기서 벗어나면 「고객이
   아무것도 안 건드렸을 때의 금액」이 아니게 된다. */
const SPEC_DEFAULTS = {
  hotelGrade: 'superior',   /* 4성급 */
  cabinClass: 'economy',
  roomConfig: 'double',
  /* 🔴 **휴양(가족여행) 경로를 잴 수 있게 열었다** (YH). 예전에는 이 다섯 칸을
     `run`이 **무조건 켜고** 있어서, 측정 도구가 「휴양 / 자유여행」을 아예 못 쟀다.
     코퍼스 견적서 36건이 전부 MICE 단체라 그동안 문제가 안 보였을 뿐이다.
     ⚠ 기본값은 예전과 같은 **전부 켬**이다 — 안 주면 지금까지와 똑같이 돈다. */
  incHotel: true,
  incMeal: true,
  incVehicle: true,
  incGuide: true,
  incSightseeing: true,
};

/* ═══ 🔴 시계를 얼린다 — 「재는 자가 날짜에 흔들린다」를 막는 유일한 방법 ═══════
   `script.js`의 `getLeadTimeFactor()`는 **오늘부터 출발일까지 남은 일수**로 항공·유류
   계수를 고른다(`LEAD_TIME_BANDS`). 그래서 출발일을 고정해도 **오늘이 움직이면
   금액이 움직인다.**
   실제로 당했다: `test_zL`의 「시드니-남반구」(2027-01-15)가 2026-09-17에는 120일
   남아 0.92였는데, **9/18에 119일이 되면서 0.95로 뛰었다.** 코드는 한 줄도 안 바뀌었는데
   기준선 검사가 빨개졌다. 그대로 두면 2027이 다가오며 24건이 차례로 깨진다.
   → 기준선을 다시 뜨는 것(`--update`)은 **진짜 표류까지 덮는다.** 시계를 얼려야 한다.

   ⚠ **`new Date()`(인자 없음)와 `Date.now()`만** 바꾼다. 날짜 문자열 파싱은 그대로
     둬야 출발일·귀국일 계산이 산다.
   ⚠ `D.prototype = Real.prototype`이라 `instanceof`도 그대로 산다.
   ⚠ 옵트인이다 — `now`를 안 주면 지금까지와 똑같이 실제 시계로 돈다. */
function freezeClock(window, iso) {
  if (!iso) return;
  const Real = window.Date;
  /* 정오(KST)로 못 박는다 — 자정에 걸치면 시간대 때문에 하루가 밀린다 */
  const fixed = new Real(iso + 'T12:00:00+09:00').getTime();
  if (isNaN(fixed)) throw new Error('freezeClock: 날짜를 못 읽었습니다 — ' + iso);
  function D(...a) {
    if (!(this instanceof D)) return new Real().toString();
    return a.length === 0 ? new Real(fixed) : new Real(...a);
  }
  D.prototype = Real.prototype;
  D.now = () => fixed;
  D.parse = Real.parse.bind(Real);
  D.UTC = Real.UTC.bind(Real);
  window.Date = D;
}

async function bootEngine(opts) {
  const o = opts || {};
  const say = o.quiet ? () => {} : (m) => console.log(m);

  /* ⚠ **운영 요율을 얹고 잰다**(TR·VB). 안 얹으면 data.js 기본값으로 재는데 고객은
     오버라이드로 계산된 금액을 본다 — 그러면 그 표는 고객이 겪는 오차가 아니다.

   🔴 예외 하나 (XI): `opts.ratesResponse`를 주면 **`script.js`가 스스로 `/api/rates`를
     받게** 한다(값 그대로 응답, `'fail'`이면 거절). 「요율을 못 받은 브라우저」를
     재려면 그 경로 자체가 검사 대상이라, 우리가 대신 얹으면 아무것도 못 잰다.
   ⚠ 이때는 **수동 applyOverrides를 하지 않는다** — 두 번 얹으면 무엇을 쟀는지 모른다. */
  const selfLoad = o.ratesResponse !== undefined;
  const { loadOverrides, applyOverrides } = require('./_rate_overrides');
  const ov = selfLoad ? { overrides: {}, from: 'script.js가 직접 받음' } : await loadOverrides();

  /* ⚠ 최상위 `const`는 창 밖에서 안 보인다 — 필요한 것만 여기서 올린다.
     `__DR`은 예전부터 있던 것이고, `__CAL`은 2026-09-15에 더했다
     (`audit_calendar_stack.js`가 월 시즌 × 날짜 피크 겹침을 세는 데 쓴다).
     🔴 **읽기 전용 노출만 늘린다** — 값을 바꾸거나 새 동작을 넣지 않으므로 이 파일을
       쓰는 검사들의 결과는 그대로다(회귀로 확인함). */
  const EXPOSE = '\n;try{window.__DR=destinationRates;}catch(e){}'
    + '\n;try{window.__CAL={getSeasonInfo:getSeasonInfo,PEAK_CALENDAR:PEAK_CALENDAR,'
    + 'LUNAR_PEAKS:(typeof LUNAR_PEAKS!=="undefined"?LUNAR_PEAKS:[]),DEST_CLASSIFY:DEST_CLASSIFY};}catch(e){}';
  const APP = APP_FILES.map(read).join('\n') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      /* 🔴 `o.now`를 주면 그 날짜로 얼린다 — 리드타임 계수가 오늘에 흔들리는 것을 막는다.
         **다른 무엇보다 먼저** 걸어야 한다(뒤에 오는 코드가 `new Date()`를 쓸 수 있다). */
      freezeClock(window, o.now);
      /* ⚠ 네트워크를 막는다 — 안 막으면 운영 DB의 site_events에 행이 쌓인다.
         ⚠ 막는 방식은 **영원히 안 오는 약속**이다(거절이 아니다). 거절로 바꾸면
           `.catch`가 도는 코드가 기본 동작이 되어, 지금까지 잰 표들과 달라진다. */
      window.fetch = (url) => {
        if (selfLoad && String(url).includes('/api/rates')) {
          return o.ratesResponse === 'fail'
            ? Promise.reject(new Error('rates_unreachable'))
            : Promise.resolve({ ok: true, json: () => Promise.resolve(o.ratesResponse) });
        }
        return new Promise(() => {});
      };
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { say('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') {
    throw new Error('엔진 로드 실패 — getBreakdownData 없음');
  }
  say(selfLoad
    ? '요율 — ' + ov.from + ' (state=' + ((window.__RATE_SOURCE__ || {}).state || '?') + ')'
    : '요율 오버라이드 ' + applyOverrides(window.__DR, ov.overrides) + '칸 적용 — ' + ov.from);

  const doc = window.document;
  const DR = window.__DR;

  const setRadio = (name, value) => {
    const list = doc.querySelectorAll('input[name="' + name + '"]');
    let hit = false;
    list.forEach((el) => { const on = el.value === value; el.checked = on; if (on) hit = true; });
    /* ⚠ 없는 값을 조용히 넘기면 「그 손잡이를 돌렸다」고 믿으면서 기본값으로 잰다 */
    if (!hit) throw new Error('손잡이 값이 없다: ' + name + '=' + value);
  };
  const setNum = (id, v) => { const el = doc.getElementById(id); if (el) el.value = String(v); };
  const setChk = (id, on) => { const el = doc.getElementById(id); if (el) el.checked = !!on; };

  /* 여행 조건 + (선택) 사양 손잡이. **손잡이를 안 주면 매번 기본값으로 되돌린다** —
     앞 호출이 남긴 상태로 다음 여행을 재면 표 전체가 조용히 오염된다. */
  const run = (t, spec) => {
    const s = Object.assign({}, SPEC_DEFAULTS, spec || {});
    doc.getElementById('destination').value = t.dest;
    doc.getElementById('participants').value = String(t.pax);
    doc.getElementById('days').value = String(t.days);
    doc.getElementById('startDate').value = t.date;
    /* ⚠ 안 주면 전부 켠다(예전 동작 그대로). 휴양은 차량·가이드를 끄고 잰다 —
       2026-08-24 실측: 오키나와 3박4일 4명이 그 둘을 빼면 2,398,906 → 1,287,106으로
       소매가(1,190,000) 대비 **+8.2%**가 된다. 그 둘은 인원과 무관한 정액이라
       소수 일행에서 1인당이 통째로 부푼다. */
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => setChk(id, s[id] !== false));

    setRadio('hotelGrade', s.hotelGrade);
    setRadio('cabinClass', s.cabinClass);
    setRadio('roomConfig', s.roomConfig);
    /* 혼합은 인원을 함께 줘야 뜻이 생긴다. 0이면 혼합이 아니라 전원 기본과 같다. */
    setNum('bizCount', s.bizCount || 0);
    setNum('vipCount', s.vipCount || 0);

    /* 골프는 켤 때만 인원·라운드가 뜻을 갖는다. **끌 때 수치도 함께 0으로 되돌린다** */
    const golfOn = !!s.golf;
    setChk('incGolf', golfOn);
    setNum('golfCount', golfOn ? (s.golfCount || t.pax) : 0);
    setNum('golfRounds', golfOn ? (s.golfRounds || 1) : 1);

    return window.getBreakdownData();
  };

  /* ⚠ `destinationRates`는 이름을 키로 쓰는 객체가 아니라 **배열**이다 */
  const rowOf = (dest) => DR.find((x) => x.destination_key === dest);

  /* 요율 칸을 잠깐 바꿔 돌리고 **반드시 되돌린다.** 안 되돌리면 다음 견적서가 앞 건의
     값으로 계산되어 표 전체가 조용히 오염된다(가장 찾기 어려운 종류다). */
  const runWith = (t, patch, spec) => {
    const row = rowOf(t.dest);
    if (!row) return null;
    const saved = {};
    Object.keys(patch).forEach((f) => { saved[f] = row[f]; row[f] = patch[f]; });
    try { return run(t, spec); } finally {
      Object.keys(saved).forEach((f) => { row[f] = saved[f]; });
    }
  };

  return { run, runWith, rowOf, window, SPEC_DEFAULTS };
}

module.exports = { bootEngine, freezeClock, APP_FILES, SPEC_DEFAULTS };

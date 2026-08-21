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
};

async function bootEngine(opts) {
  const o = opts || {};
  const say = o.quiet ? () => {} : (m) => console.log(m);

  /* ⚠ **운영 요율을 얹고 잰다**(TR·VB). 안 얹으면 data.js 기본값으로 재는데 고객은
     오버라이드로 계산된 금액을 본다 — 그러면 그 표는 고객이 겪는 오차가 아니다. */
  const { loadOverrides, applyOverrides } = require('./_rate_overrides');
  const ov = await loadOverrides();

  const EXPOSE = '\n;try{window.__DR=destinationRates;}catch(e){}';
  const APP = APP_FILES.map(read).join('\n') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      /* ⚠ 네트워크를 막는다 — 안 막으면 운영 DB의 site_events에 행이 쌓인다. */
      window.fetch = () => new Promise(() => {});
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
  say('요율 오버라이드 ' + applyOverrides(window.__DR, ov.overrides) + '칸 적용 — ' + ov.from);

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
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => setChk(id, true));

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

module.exports = { bootEngine, APP_FILES, SPEC_DEFAULTS };

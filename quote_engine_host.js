/* ═══════════════════════════════════════════════════════════════════════════
   견적 엔진 호스트 — **엔진을 쓰려고 화면을 베끼지 않는다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15, 견적산출 3분류 개편 중에 생겼다.

   ■ 문제
   견적 엔진(`script.js`의 `getBreakdownData()`)은 **DOM에서 값을 읽는다.** 그래서
   엔진을 쓰려면 그 입력칸들이 문서에 있어야 한다. 지금 그 칸 묶음이 **두 벌**이다:
     · `index.html`      — 고객이 보는 진짜 폼
     · `admin-quote.html` — 담당자용. 엔진이 읽을 칸을 숨겨 두고 그 위에 자기 UI를 얹는다
   🔴 내부직원용 화면(`admin-quote-pro.html`)을 만들면서 **세 벌째를 복사하려다 멈췄다.**
     목록이 셋으로 갈리면 엔진에 입력칸이 하나 늘었을 때 어느 한 화면만 조용히
     옛 값으로 계산한다 — 이 저장소가 여섯 번 당한 그 유형이다(결함 생성기 ①).

   ■ 그래서 이렇게 한다
   엔진이 **실제로 읽는 칸만** 코드로 만든다(`mount()`). 기존 두 화면은 **손대지 않는다** —
   이미 잘 돌고 있고, 건드리면 고객 화면이 위험해진다. 새 화면만 이 호스트를 쓴다.

   ⚠ 그래도 목록은 여전히 둘 이상이다. 그래서 **검사로 대조한다**(`test_zP`):
     `script.js`의 `getBreakdownData` 본문에서 `getElementById('…')`와
     `input[name="…"]`를 **뽑아** 여기 `FIELDS`와 맞춰 본다.
     엔진에 칸이 하나 늘면 그 검사가 빨개진다. CLAUDE.md가 말한
     「불가피하게 나뉘면 테스트로 대조한다」가 이 자리다.

   ■ ⚠ `mount()`는 **`script.js`보다 먼저** 돌아야 한다
   `script.js`는 최상위에서 `const destinationSelect = document.getElementById('destination')`을
   잡는다. 그 시점에 칸이 없으면 엔진 전체가 `null`을 붙들고 시작한다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuoteEngineHost = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* 🔴 **엔진이 읽는 칸의 목록.** 여기 없는 칸을 엔진이 읽으면 그 칸은 기본값이 되고,
     화면은 「손잡이를 돌렸다」고 믿으면서 다른 금액을 낸다(_engine_boot의 setRadio가
     없는 값에 예외를 던지는 것과 같은 이유). `test_zP`가 script.js와 대조한다. */
  const FIELDS = {
    /* select — 값은 `destinationRates`의 `destination_key`(한글)다 */
    select: ['destination', 'programType', 'organizationType', 'departureCity'],
    /* 날짜 */
    date: ['startDate'],
    /* 숫자 */
    number: ['participants', 'days', 'vipCount', 'bizCount', 'golfCount', 'golfRounds', 'agencyVisits'],
    /* 체크박스 — 기본 켬/끔이 **고객 화면의 `checked`와 같아야** 한다 */
    check: {
      incHotel: true, incMeal: true, incVehicle: true, incGuide: true, incSightseeing: true,
      incGolf: false, incDomestic: false,
    },
    /* 라디오 — 기본값은 고객 화면의 `checked` 그대로 */
    radio: {
      hotelGrade: { values: ['standard', 'superior', 'deluxe'], def: 'superior' },
      cabinClass: { values: ['economy', 'business', 'mixed'], def: 'economy' },
      roomConfig: { values: ['double', 'single', 'mixed'], def: 'double' },
      vehicleType: { values: ['auto', 'large', 'small'], def: 'auto' },
    },
  };

  /* 엔진이 읽지는 않지만 견적서에 들어가는 칸들. 있으면 화면이 채워 넣는다. */
  const EXTRA_IDS = ['endDate', 'visitMode', 'organization', 'contactName', 'contactTel', 'requestDetails'];

  /* 🔴 **`script.js`가 최상위에서 붙드는 요소들.** 없으면 `addEventListener`에서 던지고,
     그 순간 `getBreakdownData`까지 **선언도 안 된다** — 엔진이 통째로 안 뜬다.
     ⚠ 소스를 읽어 짐작한 목록이 아니라, **띄워 보고 터진 자리를 따라가 찾은 것**이다
       (script.js 1~5행 + `form`). `test_zP`가 script.js 최상위와 대조한다. */
  const SHELL = [
    { id: 'estimateForm', tag: 'form' },
    { id: 'nextStepButton', tag: 'button' },
    { id: 'backStepButton', tag: 'button' },
    { id: 'downloadEstimate', tag: 'button' },
  ];

  function el(tag, attrs) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === 'checked' || k === 'value') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    return e;
  }

  /* 화면에 안 보이지만 **DOM에는 있어야** 한다.
     ⚠ `display:none`이 아니라 화면 밖으로 밀어 둔다 — 일부 브라우저는 `display:none`
       요소의 `.value`는 읽어도 라디오 `:checked` 선택자는 정상 동작하지만, 나중에
       이 칸을 실제로 보여 줄 일이 생겼을 때 전환이 쉽다. 낭독기에는 감춘다. */
  const BOX_STYLE = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';

  function mount(opts) {
    const o = opts || {};
    if (document.getElementById('__qeh')) return document.getElementById('__qeh');
    const box = el('div', { id: '__qeh', style: BOX_STYLE, 'aria-hidden': 'true' });

    FIELDS.select.forEach((id) => box.appendChild(el('select', { id, tabindex: '-1' })));
    FIELDS.date.forEach((id) => box.appendChild(el('input', { type: 'date', id, tabindex: '-1' })));
    FIELDS.number.forEach((id) => box.appendChild(el('input', { type: 'number', id, value: '0', tabindex: '-1' })));
    Object.keys(FIELDS.check).forEach((id) => {
      box.appendChild(el('input', { type: 'checkbox', id, checked: FIELDS.check[id], tabindex: '-1' }));
    });
    Object.keys(FIELDS.radio).forEach((name) => {
      const g = FIELDS.radio[name];
      g.values.forEach((v) => {
        box.appendChild(el('input', { type: 'radio', name, value: v, checked: v === g.def, tabindex: '-1' }));
      });
    });
    EXTRA_IDS.forEach((id) => {
      if (id === 'visitMode') box.appendChild(el('select', { id, tabindex: '-1' }));
      else if (id === 'requestDetails') box.appendChild(el('textarea', { id, tabindex: '-1' }));
      else box.appendChild(el('input', { type: 'text', id, tabindex: '-1' }));
    });
    SHELL.forEach((x) => {
      const e = el(x.tag, { id: x.id, tabindex: '-1' });
      if (x.tag === 'button') e.type = 'button';
      box.appendChild(e);
    });

    (o.container || document.body).appendChild(box);
    /* ⚠ 보기 목록은 여기서 안 채운다 — `estimateCriteria`가 `script.js`에 있어 아직 없다.
       `script.js`를 실은 **뒤에 `ready(...)`를 부른다.** */
    return box;
  }

  /* select의 보기를 **`data.js`/`script.js`에서 만든다.** 화면에 목록을 적으면 또 한 벌이다.
     ⚠ 목적지 키는 **한글**이다(`destination_key`). 영문 슬러그가 아니다 — 검사를
       만들면서 그걸 영문으로 넣어 24건이 전부 산출 실패였다(2026-09-15).
     🔴 두 번 부른다: `mount()` 직후(목적지)와 `script.js` 로드 뒤(`ready()` — 프로그램·
       단체 유형). 한 번만 부르면 둘 중 하나는 **빈 select**가 되고, 엔진은 빈 값을
       기본 계수로 조용히 떨어뜨린다(결함 생성기 ②). */
  function fillOptions(g) {
    const src = g || {};
    const set = (id, list) => {
      const s = document.getElementById(id);
      if (!s || !list || !list.length) return false;
      const keep = s.value;
      s.innerHTML = '';
      list.forEach((v) => s.appendChild(el('option', { value: v })));
      if (keep && list.indexOf(keep) >= 0) s.value = keep;
      return true;
    };
    const DR = src.destinationRates || [];
    const okDest = set('destination', DR.map((d) => d.destination_key));
    const EC = src.estimateCriteria;
    const okProg = set('programType', EC && EC.programFactor ? Object.keys(EC.programFactor) : []);
    const okOrg = set('organizationType', EC && EC.organizationFactor ? Object.keys(EC.organizationFactor) : []);
    const DC = src.DEPARTURE_CITIES;
    const okDep = set('departureCity',
      DC ? (Array.isArray(DC) ? DC.map((c) => c.key || c.value || c) : Object.keys(DC)) : []);
    return { dest: okDest, prog: okProg, org: okOrg, dep: okDep };
  }

  /* 🔴 **`script.js`를 실은 뒤에 반드시 부른다.**
         QuoteEngineHost.ready({ destinationRates, estimateCriteria, DEPARTURE_CITIES });
     안 부르면 프로그램·단체 유형 select가 비어 있고, 그러면 그 계수가 조용히 기본값이
     된다 — 금액이 달라지는데 화면은 아무 말도 안 한다(결함 생성기 ②).

     ⚠ **전역을 알아서 찾아 오지 않는다.** 처음엔 `new Function`으로 전역 `const`를
       읽었는데, 그러면 브라우저에서는 되고 **jsdom 검사에서는 안 된다**(검사는 파일들을
       한 문자열로 합쳐 `eval`하는데, eval 안의 `const`는 전역 어휘 환경에 안 올라간다).
       재는 곳과 도는 곳이 다르게 동작하면 검사가 아무것도 못 지킨다 — 그래서 **부르는
       쪽이 명시적으로 넘긴다.** 인라인 `<script>`는 전역 `const`를 그냥 볼 수 있다.

     채워졌는지 **돌려준다** — 부르는 쪽이 그걸 보고 화면에 말할 수 있게. */
  function ready(g) {
    const r = fillOptions(g);
    const missing = [];
    if (!r.dest) missing.push('목적지');
    if (!r.prog) missing.push('프로그램 유형');
    if (!r.org) missing.push('단체 유형');
    if (typeof document.getElementById === 'function' && !document.getElementById('__qeh')) missing.push('입력칸(mount 미실행)');
    return { ok: !missing.length, missing };
  }

  /* ── 값 넣기 ──
     🔴 **주지 않은 칸은 기본값으로 되돌린다.** 앞 계산이 남긴 상태로 다음 견적을 내면
       표 전체가 조용히 오염된다 — `_engine_boot.js`의 `run`이 같은 이유로 그렇게 한다.
       가장 찾기 어려운 종류의 결함이다. */
  function set(input) {
    const v = input || {};
    const put = (id, val) => { const e = document.getElementById(id); if (e) e.value = String(val == null ? '' : val); };

    /* 🔴 **select의 기본값은 「첫 보기」다.** 고객 화면(`index.html`)의 select에는
       `selected`가 하나도 없어서 브라우저가 첫 보기를 고른다.
       처음엔 여기에 `'industry'`·`'corporate'`를 박아 넣었는데 — 실측 결과 **금액이
       18% 높게** 나왔다. `industry`는 첫 보기(`language`)와 계수가 다르고, `corporate`는
       **존재하지도 않는 값**이라 계수가 조용히 1.0으로 떨어지고 있었다(결함 생성기 ②).
       이름을 박지 않고 **첫 보기를 쓴다** — 그러면 고객 화면이 바뀌어도 같이 따라간다. */
    const firstOf = (id) => { const e = document.getElementById(id); return (e && e.options && e.options.length) ? e.options[0].value : ''; };
    put('destination', v.dest || '');
    put('programType', v.programType || firstOf('programType'));
    put('organizationType', v.orgType || firstOf('organizationType'));
    put('departureCity', v.departureCity || firstOf('departureCity'));
    put('startDate', v.startDate || '');
    put('endDate', v.endDate || '');
    put('participants', Math.max(0, Math.floor(Number(v.pax) || 0)));
    put('days', Math.max(0, Math.floor(Number(v.days) || 0)));
    put('vipCount', Math.max(0, Math.floor(Number(v.vipCount) || 0)));
    put('bizCount', Math.max(0, Math.floor(Number(v.bizCount) || 0)));
    put('agencyVisits', Math.max(0, Math.floor(Number(v.agencyVisits) || 0)));

    Object.keys(FIELDS.check).forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.checked = (v[id] === undefined ? FIELDS.check[id] : !!v[id]);
    });
    /* 골프는 켤 때만 인원·라운드가 뜻을 갖는다. **끌 때 수치도 0으로 되돌린다.** */
    const golfOn = !!v.incGolf;
    put('golfCount', golfOn ? Math.max(0, Math.floor(Number(v.golfCount) || 0)) : 0);
    put('golfRounds', golfOn ? Math.max(1, Math.floor(Number(v.golfRounds) || 1)) : 1);

    Object.keys(FIELDS.radio).forEach((name) => {
      const g = FIELDS.radio[name];
      const want = v[name] && g.values.indexOf(v[name]) >= 0 ? v[name] : g.def;
      document.querySelectorAll('input[name="' + name + '"]').forEach((e) => { e.checked = (e.value === want); });
    });
  }

  /* ── 계산 ── 엔진을 **그대로** 부른다. 값을 다시 만지지 않는다.
     🔴 여기서 금액에 한 줄이라도 손대면 「고객용 산출값 불변」이 깨진다(대표 지시 제약 6).
       이 화면이 하는 조정은 **엔진 밖에서**, 산출 결과 위에 얹는다. */
  function compute(input) {
    set(input);
    const f = (typeof getBreakdownData === 'function') ? getBreakdownData
      : (typeof window !== 'undefined' && window.getBreakdownData);
    if (typeof f !== 'function') throw new Error('견적 엔진을 찾지 못했습니다 — script.js가 실렸는지 확인하세요.');
    return f();
  }

  return { FIELDS, EXTRA_IDS, SHELL, mount, fillOptions, ready, set, compute };
});

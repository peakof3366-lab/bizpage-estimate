/* ═══════════════════════════════════════════════════════════════════════════
   VV — 휴양 / 일반 고객: **소수인원 견적이 두 배가 되지 않는지** 실제 엔진으로 잰다
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-24): 「일반고객 대상으로 휴양 관련 부분을 새롭게 추가하고 싶다.」

   ■ 🔴 칸만 열면 계산기가 소매가의 두 배를 부른다 — 실측이 그것을 막았다

   차량·가이드는 **인원과 무관한 정액**이다. 오키나와 3박4일 실측:
       차량 3,080,000원 · 가이드 836,000원  ← 4명이든 20명이든 같은 금액
   4명이면 1인당 979,000원이 여기서만 붙는다. 그래서:
       전부 포함   2,320,246원   하나투어 소매(1,190,000) 대비 **+95.0%**
       차량·가이드 빼면 1,208,446원                        **+1.6%**
   2명은 더 심하다 — 전부 포함이 3,495,046원(**+193.7%**)이고, 빼면 4명과 같은 값이다.

   → 그래서 `leisure`를 고르면 **차량·가이드를 기본으로 끈다.** 잠그지는 않는다
     (휴양이라도 밴을 부르는 팀이 있다). 그리고 **왜 꺼졌는지 화면이 말한다.**

   ⚠ **계수는 1.0이다 — 값을 지어내지 않았다는 뜻이다.** 연수 계수는 프로그램 운영
     난이도(강사·기관 섭외)를 반영한 것인데 휴양에는 그 일이 없고, 1.0인 상태에서
     실측이 +1.6%였다. 올릴 근거가 없다. 바꾸는 것은 대표 결정이다.

   ⚠ 이 파일은 **숫자를 옮겨 적지 않는다.** 운영 요율을 얹은 실제 엔진을 돌려
     「차량·가이드를 끄면 소수인원 1인당이 크게 내려간다」를 그 자리에서 확인한다 —
     옮겨 적으면 요율이 바뀐 뒤에도 옛 숫자가 사실인 척한다(이 저장소가 반복해서 당한 것).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — VV 휴양 / 일반 고객`);
  process.exit(fail ? 1 : 0);
};

const INDEX = read('index.html');
const AQ = read('admin-quote.html');
const SCRIPT = read('script.js');
const CSS = read('styles.css');
const { PROGRAM_TYPES } = require(path.join(ROOT, 'data.js'));

/* 화면의 <select> 안 option 값을 뽑는다 */
function optsOf(html, id) {
  const d = new JSDOM(html).window.document;
  const sel = d.getElementById(id);
  return sel ? Array.from(sel.options).map((o) => ({ v: o.value, t: o.textContent.trim() })) : null;
}

console.log('\n[1] 🔴 목록이 세 곳에 있다 — 셋을 함께 대조한다');
{
  /* 예전엔 test_rK가 index.html만 data.js와 대조했다. admin-quote.html은 아무도 안 봤다 —
     담당자 화면에만 유형이 빠져도 조용히 통과하는 상태였다(결함 생성기 ①). */
  const iP = optsOf(INDEX, 'programType');
  const aP = optsOf(AQ, 'programType');
  const keys = Object.keys(PROGRAM_TYPES);
  ok('① 세 곳 다 프로그램 유형 목록을 갖는다', !!iP && !!aP && keys.length > 0);
  ok('① index.html이 data.js와 키가 같다', iP.map((o) => o.v).join(',') === keys.join(','),
    iP.map((o) => o.v).join(',') + ' vs ' + keys.join(','));
  ok('① admin-quote.html도 data.js와 키가 같다', aP.map((o) => o.v).join(',') === keys.join(','),
    aP.map((o) => o.v).join(',') + ' vs ' + keys.join(','));
  ok('① 이름(label)까지 같다',
    iP.every((o) => PROGRAM_TYPES[o.v] && PROGRAM_TYPES[o.v].label === o.t)
    && aP.every((o) => PROGRAM_TYPES[o.v] && PROGRAM_TYPES[o.v].label === o.t));
  ok('① 휴양이 들어 있다', keys.includes('leisure'), keys.join(','));

  const iO = optsOf(INDEX, 'organizationType');
  const aO = optsOf(AQ, 'organizationType');
  ok('① 기관 유형에 「일반 고객」이 있다', iO.some((o) => o.v === 'individual'),
    iO.map((o) => o.v).join(','));
  ok('① 기관 유형도 두 화면이 같다', iO.map((o) => o.v).join(',') === aO.map((o) => o.v).join(','),
    iO.map((o) => o.v).join(',') + ' vs ' + aO.map((o) => o.v).join(','));
}

console.log('\n[2] 계수 — 값을 지어내지 않았다');
{
  /* 🔴 **값 자체를 본다 — 소스 글자를 긁지 않는다** (XS).
     예전엔 `script.js`를 정규식으로 훑었는데, XS에서 계수 표를 `data.js` 한 곳으로
     모으자 **긁을 글자가 없어져** 이 검사 넷이 한꺼번에 깨졌다. XQ에서 똑같은 일이
     다섯 건 났다 — 단일 출처로 모을 때마다 반복된다.
     ⚠ 더 나쁜 쪽은 「깨지는 것」이 아니라 **「아무것도 안 지키면서 초록이 되는 것」**이다.
       값으로 보면 표가 어디로 옮겨 가도 따라간다. */
  const FACT = require(path.join(ROOT, 'data.js')).ESTIMATE_FACTORS;
  const combined = require(path.join(ROOT, 'data.js')).estimateCombinedFactor;
  ok('② 휴양 계수가 1.0이다(= 조정 없음)', FACT.programFactor.leisure === 1.0,
    String(FACT.programFactor.leisure));
  ok('② 일반 고객 계수가 1.0이다', FACT.organizationFactor.individual === 1.0,
    String(FACT.organizationFactor.individual));
  ok('② 휴양 × 일반 고객은 계수를 아예 안 건다', combined('leisure', 'individual') === 1.0);
  /* 산문은 값이 있는 파일에 있어야 한다 — 값과 이유가 갈라지면 이유부터 낡는다 */
  const DATA_SRC = read('data.js');
  ok('② 왜 1.0인지가 적혀 있다', /값을 지어내지 않았다는 뜻이다/.test(DATA_SRC));
  ok('② 바꾸는 것이 대표 결정이라고 적혀 있다', /대표 결정이다/.test(DATA_SRC));
  /* 화면이 그 표를 **다시 적지 않고 읽어 가는지** — 두 벌이 되면 반드시 어긋난다 */
  ok('② 화면은 표를 다시 적지 않고 data.js에서 읽는다',
    /programFactor:\s*ESTIMATE_FACTORS\.programFactor/.test(SCRIPT));
}

console.log('\n[3] 화면 — 왜 꺼졌는지 말하고, 다시 켤 수 있다');
{
  ok('③ 안내 문구 자리가 있다', /id="leisureNote"/.test(INDEX));
  ok('③ 기본으로 꺼진다고 말한다', /전용 차량과 가이드를 기본으로 빼고/.test(INDEX));
  ok('③ 정액이라 나눠도 안 줄어든다고 말한다', /정액이라 나눠도 줄지 않습니다/.test(INDEX));
  ok('③ 다시 켤 수 있다고 말한다', /다시 선택하시면 금액에 바로 반영/.test(INDEX));
  ok('③ 그 문구에 스타일이 있다', /\.inc-leisure-note\s*\{/.test(CSS));
  ok('③ 사람이 켠 것을 지우지 않는다(자동으로 끈 것만 되돌린다)', /autoOff/.test(SCRIPT));
  ok('③ 끄기만 하고 잠그지 않는다고 적혀 있다', /끄기만 하고 잠그지는 않는다/.test(SCRIPT));
}

/* ── [4] 실제 엔진 — 숫자를 옮겨 적지 않고 그 자리에서 잰다 ─────────────── */
(async () => {
  console.log('\n[4] 🔴 실제 엔진 — 소수인원에서 차량·가이드가 무엇을 하는가');
  let boot;
  try {
    boot = await require('./_engine_boot').bootEngine({ quiet: true });
  } catch (e) {
    fail++;
    console.log('  ✗ 엔진을 띄우지 못했다 — ' + e.message);
    return done();
  }
  const { window } = boot;
  const doc = window.document;

  /* 유형 선택이 실제로 차량·가이드를 끄는지 — 클릭으로 잰다 */
  const prg = doc.getElementById('programType');
  ok('④ 휴양 option이 계산기에 실제로 있다',
    !!prg && Array.from(prg.options).some((o) => o.value === 'leisure'));
  const veh = doc.getElementById('incVehicle');
  const gd = doc.getElementById('incGuide');
  ok('④ 처음엔 차량·가이드가 켜져 있다', veh.checked && gd.checked);
  prg.value = 'leisure'; prg.dispatchEvent(new window.Event('change'));
  ok('④ 휴양을 고르면 차량이 꺼진다', veh.checked === false);
  ok('④ 휴양을 고르면 가이드가 꺼진다', gd.checked === false);
  ok('④ 안내 문구가 드러난다', !doc.getElementById('leisureNote').classList.contains('hidden'));
  prg.value = 'language'; prg.dispatchEvent(new window.Event('change'));
  ok('④ 연수로 되돌리면 다시 켜진다', veh.checked && gd.checked);
  ok('④ 안내 문구가 숨는다', doc.getElementById('leisureNote').classList.contains('hidden'));

  /* 금액 — 「끄면 크게 내려간다」를 그 자리에서 확인한다(숫자를 못 박지 않는다) */
  const runWithIncludes = (pax, on) => {
    doc.getElementById('destination').value = '오키나와';
    doc.getElementById('participants').value = String(pax);
    doc.getElementById('days').value = '4';
    doc.getElementById('startDate').value = '2026-10-15';
    ['incHotel', 'incMeal', 'incSightseeing'].forEach((id) => { doc.getElementById(id).checked = true; });
    veh.checked = on; gd.checked = on;
    const g = doc.getElementById('incGolf'); if (g) g.checked = false;
    ['bizCount', 'vipCount', 'golfCount'].forEach((id) => {
      const el = doc.getElementById(id); if (el) el.value = '0';
    });
    return window.getBreakdownData().perPerson;
  };

  const on4 = runWithIncludes(4, true), off4 = runWithIncludes(4, false);
  const on20 = runWithIncludes(20, true), off20 = runWithIncludes(20, false);
  console.log('     4명  포함 ' + on4.toLocaleString() + '원 → 제외 ' + off4.toLocaleString() + '원');
  console.log('    20명  포함 ' + on20.toLocaleString() + '원 → 제외 ' + off20.toLocaleString() + '원');

  ok('④ 4명은 차량·가이드를 빼면 1인당이 30% 이상 내려간다',
    off4 < on4 * 0.70, ((off4 / on4 - 1) * 100).toFixed(1) + '%');
  /* 🔴 핵심 — **소수인원일 때 훨씬 크게 내려간다.** 이게 정액이라는 증거이고,
     휴양에서 기본으로 끄는 이유다. 두 폭이 비슷해지면 전제가 무너진 것이니 알아야 한다. */
  ok('④ 그 내려가는 폭이 20명보다 4명에서 더 크다',
    (1 - off4 / on4) > (1 - off20 / on20) * 1.5,
    '4명 ' + ((1 - off4 / on4) * 100).toFixed(1) + '% vs 20명 ' + ((1 - off20 / on20) * 100).toFixed(1) + '%');
  /* 정액이면 빼고 난 뒤의 1인당은 인원과 (거의) 무관해진다 */
  ok('④ 빼고 나면 4명과 20명의 1인당 차이가 15% 안으로 좁혀진다',
    Math.abs(off4 / off20 - 1) < 0.15,
    ((off4 / off20 - 1) * 100).toFixed(1) + '% (빼기 전 ' + ((on4 / on20 - 1) * 100).toFixed(1) + '%)');

  /* 기존 유형의 금액이 안 움직였는지 — 계수를 더한 것이 옛 견적을 흔들면 안 된다 */
  prg.value = 'language'; prg.dispatchEvent(new window.Event('change'));
  const langOn = runWithIncludes(20, true);
  ok('④ 기존 유형(언어)의 20명 금액은 예전 계산 그대로다', langOn === on20,
    langOn.toLocaleString() + ' vs ' + on20.toLocaleString());

  done();
})().catch((e) => { console.error(e); fail++; done(); });

/* ═══════════════════════════════════════════════════════════════════════════
   VX — 고객 견적 화면: **일반 고객이 읽어서 자기 것으로 보이는가**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「고객들이 볼 때 어려움이 없었으면 좋겠다. 정말 너무 쉽게
   견적에 접근하게 만들고자 한다.」

   실제 화면을 보니 **「휴양 / 일반 고객」을 골라도 화면은 여전히 연수 담당자에게
   말을 걸고 있었다.** 가족·친목 손님이 읽으면 어긋나는 자리가 열두 곳이었다:
     연수 목적지 · 연수 방식 · 연수 날짜 · 연수 기간(수정 불가) · 참가 인원 ·
     기관 방문·섭외 · 「지상비의 20%」 · 기업 단체연수 체크리스트 ·
     회사/기관명(필수) · 「연수의 핵심 성과」 · 예상 총액이 제일 큼 · 요율 기준일

   ■ 두 가지 방법을 갈라 썼다 — 이게 이 변경의 핵심이다

     ① **말투는 하나로 통일**했다(연수 → 여행). 유형마다 라벨을 갈아 끼우면 문구가
        두 벌이 되고 반드시 어긋난다. 「여행 목적지」는 연수 담당자에게도 어색하지 않다.
     ② **연수에만 있는 일은 자리째 숨긴다**(연수 방식·기관 섭외·단체 체크리스트).
        ⚠ 라벨을 바꾸는 것으로는 안 된다 — 「기관 방문·섭외 0회」는 이름을 뭐라 붙여도
          가족 손님이 고를 수 있는 것이 아니고, **고를 수 없는 칸이 보이면 그 사람은
          폼 전체를 남의 것으로 읽는다.** 그게 이 화면의 진짜 문제였다.

   ⚠ **숨기는 것으로 끝내지 않는다.** 숨긴 칸의 값이 금액에 남아 있으면 고객은
     자기가 안 고른 비용을 내게 된다(결함 생성기 ②). 0으로 되돌리고, 연수로 돌아가면
     원래 값을 복구한다.
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
  console.log(`결과: ${pass} pass / ${fail} fail  — VX 쉬운 말로 된 견적 화면`);
  process.exit(fail ? 1 : 0);
};

const INDEX = read('index.html');
const CSS = read('styles.css');

/* STEP1·STEP2 폼 안쪽만 본다 — 페이지 아래 회사 소개·서비스 설명의 「연수」는
   그대로 두는 것이 맞다(우리가 14년 해 온 일이 그것이다). 고치는 것은 **입력 화면**이다. */
/* ⚠ **HTML 주석을 걷어내고 본다.** 주석은 개발자가 읽는 글이라 「지상비」 같은
   정확한 내부 용어가 그대로 있어야 한다 — 오히려 지워지면 다음 사람이 이 계수가
   무엇의 20%인지 모른다. 고객이 읽는 것은 화면에 찍히는 글자뿐이다. */
const FORM = (() => {
  const a = INDEX.indexOf('id="estimateForm"');
  const b = INDEX.indexOf('<!-- ═══ STEP 3');
  const raw = a >= 0 && b > a ? INDEX.slice(a, b) : '';
  return raw.replace(/<!--[\s\S]*?-->/g, ' ');
})();

console.log('\n[1] 입력 화면이 「연수」라고 말하지 않는다');
{
  ok('① 폼 구간을 잘라냈다', FORM.length > 2000, String(FORM.length));
  const badLabels = [
    ['연수 목적지', /연수 목적지/],
    ['연수 날짜', /연수 날짜/],
    ['참가 인원', /참가 인원/],
    ['연수 기간', /연수 기간 <small/],
    ['연수의 핵심 성과', /연수의 핵심 성과/],
  ];
  badLabels.forEach(([what, re]) =>
    ok('① 「' + what + '」이 입력 화면에 없다', !re.test(FORM)));
  ok('① 대신 「여행 목적지」라고 부른다', /여행 목적지/.test(FORM));
  ok('① 「여행 인원」이라고 부른다', /여행 인원/.test(FORM));
  /* 「수정 불가」는 겁을 준다 — 무엇이 일어나는지 말한다 */
  ok('① 기간 칸이 「수정 불가」 대신 이유를 말한다',
    !/수정 불가/.test(FORM) && /날짜에서 자동 계산/.test(FORM));
}

console.log('\n[2] 업계 말을 걷어냈다');
{
  ok('② 입력 화면에 「지상비」가 없다', !/지상비/.test(FORM), '일반 고객은 이 말을 모른다');
  ok('② 뜻을 풀어 썼다(현지 비용)', /현지 비용의 20%/.test(FORM));
  ok('② 「견적서 46건 실측」 근거는 남겼다', /견적서 46건/.test(FORM));
}

console.log('\n[3] 회사/기관명이 더는 길을 막지 않는다');
{
  const d = new JSDOM(INDEX).window.document;
  const org = d.getElementById('organization');
  ok('③ 회사/기관명이 필수가 아니다', org && !org.hasAttribute('required'),
    '가족·모임 손님은 여기서 막혀 나간다');
  ok('③ 비워도 된다고 말한다', /없으면 비워 두셔도 됩니다/.test(FORM));
  ok('③ 모임 손님도 적을 것이 있다고 알린다', /모임 이름/.test(FORM));
  /* 담당자 이름·연락처는 그대로 필수여야 한다 — 리드가 유실되면 안 된다 */
  ok('③ 담당자 이름은 여전히 필수다', d.getElementById('contactName').hasAttribute('required'));
}

console.log('\n[4] 1인당이 주인공이다');
{
  const iPer = INDEX.indexOf('id="perPersonValue"');
  const iTot = INDEX.indexOf('id="resultValue"');
  ok('④ 1인당이 총액보다 먼저 나온다', iPer > 0 && iTot > 0 && iPer < iTot,
    'per@' + iPer + ' total@' + iTot);
  ok('④ 강조(검은 상자)가 1인당에 붙는다', /\.total-per\s+\{ background:var\(--ink\)/.test(CSS));
  ok('④ 큰 글씨도 1인당이다', /\.total-per\s+\.total-amt \{ color:var\(--red\); font-size:32px; \}/.test(CSS));
  /* ⚠ 총액을 없애면 안 된다 — 기업 담당자에게는 그게 결재 숫자다 */
  ok('④ 총액은 그대로 남아 있다', /id="resultValue"/.test(INDEX) && /예상 총액/.test(FORM));
  ok('④ 좁은 화면 크기도 1인당으로 옮겼다', /\.total-per \.total-amt \{ font-size:26px; \}/.test(CSS));
}

/* ── [5] 실제로 눌러 본다 ─────────────────────────────────────────────────── */
(async () => {
  console.log('\n[5] 🔴 휴양을 고르면 연수 전용 칸이 실제로 사라지는가');
  let boot;
  try { boot = await require('./_engine_boot').bootEngine({ quiet: true }); }
  catch (e) { fail++; console.log('  ✗ 엔진을 띄우지 못했다 — ' + e.message); return done(); }

  const { window } = boot;
  const doc = window.document;
  const prg = doc.getElementById('programType');
  const hidden = (id) => {
    const el = doc.getElementById(id);
    return !el || el.classList.contains('hidden');
  };
  const IDS = ['visitModeField', 'agencyVisitRow', 'groupChecklist'];

  IDS.forEach((id) => ok('⑤ ' + id + ' 자리가 화면에 있다', !!doc.getElementById(id)));

  prg.value = 'language'; prg.dispatchEvent(new window.Event('change'));
  ok('⑤ 연수에서는 연수 전용 칸이 보인다', IDS.every((id) => !hidden(id)),
    IDS.filter(hidden).join(', ') + ' 가 숨어 있다');

  prg.value = 'leisure'; prg.dispatchEvent(new window.Event('change'));
  ok('⑤ 휴양에서는 전부 사라진다', IDS.every(hidden),
    IDS.filter((id) => !hidden(id)).join(', ') + ' 가 남아 있다');

  prg.value = 'academic'; prg.dispatchEvent(new window.Event('change'));
  ok('⑤ 연수로 돌아오면 다시 나타난다', IDS.every((id) => !hidden(id)));

  console.log('\n[6] 🔴 숨긴 칸의 값이 금액에 남지 않는다');
  {
    const av = doc.getElementById('agencyVisits');
    doc.getElementById('destination').value = '오사카';
    doc.getElementById('participants').value = '8';
    doc.getElementById('days').value = '5';
    doc.getElementById('startDate').value = '2026-09-18';

    prg.value = 'language'; prg.dispatchEvent(new window.Event('change'));
    av.value = '3'; av.dispatchEvent(new window.Event('input'));
    const withVisits = window.getBreakdownData().perPerson;

    prg.value = 'leisure'; prg.dispatchEvent(new window.Event('change'));
    ok('⑥ 휴양으로 바꾸면 기관 섭외 횟수가 0이 된다', av.value === '0', av.value);
    const leisurePer = window.getBreakdownData().perPerson;
    ok('⑥ 그만큼 금액이 내려간다', leisurePer < withVisits,
      leisurePer.toLocaleString() + ' vs ' + withVisits.toLocaleString());

    prg.value = 'language'; prg.dispatchEvent(new window.Event('change'));
    ok('⑥ 연수로 돌아오면 넣었던 횟수가 되살아난다', av.value === '3', av.value);
    ok('⑥ 금액도 원래대로 돌아온다', window.getBreakdownData().perPerson === withVisits);
  }

  done();
})().catch((e) => { console.error(e); fail++; done(); });

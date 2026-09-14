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

/* ⚠ **STEP 3까지 함께 본다**(VX 후속). 처음엔 FORM을 STEP 3 앞에서 끊었는데,
   그 바람에 「연수 일정 탐색하기」·「목적지 연수 일정」·「두 가지 연수 방식 중 팀
   목적에 맞는…」 셋을 놓쳤다. 셋 다 **휴양 손님에게도 그대로 보이는 자리**였고,
   프로덕션 화면을 grep해서야 나왔다 — 검사가 보는 범위가 곧 지켜지는 범위다. */
const FLOW = (() => {
  const a = INDEX.indexOf('id="estimateForm"');
  const b = INDEX.indexOf('id="destinations"');
  const raw = a >= 0 && b > a ? INDEX.slice(a, b) : '';
  return raw.replace(/<!--[\s\S]*?-->/g, ' ');
})();

console.log('\n[0] 🔴 고객이 지나는 길 전체에 남은 「연수」— 허용 목록으로만 통과');
{
  ok('⓪ STEP1~3 구간을 잘라냈다', FLOW.length > FORM.length, FLOW.length + ' > ' + FORM.length);
  /* 남아 있어도 되는 것은 **연수를 고른 사람에게만 보이는 것**뿐이다:
       · 프로그램 유형 선택지 이름 — 그게 그 유형의 정확한 이름이다
       · 단체연수 체크리스트 안쪽 — 휴양이면 자리째 숨는다(아래 [5]가 확인) */
  const ALLOWED = [
    '언어 집중 연수', '산업체 실무 연수', '교육기관 / 연구 연수',
    '기업 단체연수 준비 체크리스트', '연수 목적 및 핵심 성과 목표 설정', '출발일 · 연수 기간 확정',
  ];
  const hits = [...FLOW.matchAll(/[^>]{0,20}연수[^<]{0,20}/g)].map((m) => m[0].trim());
  const leaked = [...new Set(hits)].filter((h) => !ALLOWED.some((a) => h.includes(a)));
  ok('⓪ 허용 목록 밖에 「연수」가 없다', leaked.length === 0, leaked.join(' | '));
  /* 허용 목록이 낡지 않도록 — 목록에 적어 둔 것이 실제로 화면에 있는지도 본다 */
  ok('⓪ 허용 목록이 실제 화면과 맞다', ALLOWED.every((a) => FLOW.includes(a)),
    ALLOWED.filter((a) => !FLOW.includes(a)).join(' | ') + ' 가 화면에 없다(목록이 낡았다)');
}

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
  /* 🔴 **2026-09-14 대표 지시로 「여행 기간」 보이는 칸을 통째로 뺐다.**
     원래 여기서 「수정 불가」 대신 「날짜에서 자동 계산」이라고 이유를 말하는지 봤다.
     칸이 없어졌으니 그 문구도 없다 — 대신 **값은 살아 있어야 한다**를 본다.
     🔴 `#days`는 견적 엔진이 읽는 값이다(script.js 6곳). 마크업에서 빼면서 이것까지
       지웠으면 금액이 통째로 틀어진다. 숨김 칸으로 남겼는지 여기서 잡는다.
     ⚠ `required`가 붙어 있으면 안 된다 — 보이지 않는 필수 칸은 브라우저가
       **제출 자체를 막는다**(그러면 견적을 낼 수 없다). */
  ok('① 「수정 불가」라고 겁주지 않는다', !/수정 불가/.test(FORM));
  {
    /* 이 구간에서는 아직 DOM을 안 띄웠으므로 마크업 문자열로 본다 */
    const tag = (FORM.match(/<input[^>]*id="days"[^>]*>/) || [''])[0];
    ok('① 🔴 기간 값(#days)은 살아 있다 — 엔진이 읽는다', !!tag, '없으면 금액이 틀어진다');
    ok('① 🔴 그 칸은 감춰져 있다', /type="hidden"/.test(tag), tag.slice(0, 70));
    ok('① 🔴 required가 아니다 — 보이지 않는 필수 칸은 제출을 막는다',
      !!tag && !/required/.test(tag), tag.slice(0, 70));
  }
}

console.log('\n[2] 업계 말을 걷어냈다');
{
  ok('② 입력 화면에 「지상비」가 없다', !/지상비/.test(FORM), '일반 고객은 이 말을 모른다');
  /* 🔴 **2026-09-14 대표 지시로 부대비용 안내를 통째로 뺐다.**
     원래 여기 있던 것: 「통역·행사 운영·현지 진행비는 **현지 비용의 20%**로 이미
     포함돼 있습니다 (견적서 46건 실측)」 — 구역 이름 「현지 기타 비용」과 함께 지웠다.
     대표 판단: 첫 화면 폼에 글자가 너무 많다.

     ⚠ **무엇을 잃었는지 적어 둔다** — 고객은 이제 「현지 비용의 20%가 이미 들어 있다」를
       화면에서 알 수 없다. 금액은 그대로고 숨긴 요금도 아니지만, **그 20%가 어디서
       온 숫자인지 말해 주던 유일한 자리**였다. 되살릴 값어치가 있다고 판단되면
       `index.html`의 `#ancSecLbl`·`#ancBaseNote` 자리에 다시 넣는다.
     ⚠ 그냥 지우지 않고 **없다는 것을 잠근다** — 모르고 되살아나면 대표 지시가 조용히
       뒤집히고, 아무도 그 사실을 모른다. */
  ok('② 부대비용 안내를 화면에서 뺐다(대표 지시)',
    !/현지 비용의 20%/.test(FORM) && !/견적서 46건/.test(FORM));
}

console.log('\n[3] 담당자 정보 칸 — 대표 지시로 셋을 뺐다');
{
  const d = new JSDOM(INDEX).window.document;
  /* 🔴 **2026-09-14 대표 지시: 회사/모임 이름 · 담당자 이름 · 요청 사항 세 칸을 뺐다.**
     원래 이 구역은 「회사/기관명이 길을 막지 않는가」를 보던 자리였다(VX에서 필수를
     풀었던 곳). 칸 자체가 없어졌으니 막힐 일도 없다.

     🔴 **무엇을 잃었는지 적어 둔다 — 이게 이 변경의 값이다.**
       · 견적 요청에 **회사명·담당자 이름이 안 실린다.** 견적서에도 그 두 줄이 안 찍힌다
         (빈 줄을 찍지 않도록 `script.js`·`estimate-view.html`을 함께 고쳤다).
       · 견적 결과에서 바로 누르는 「상담 신청」에도 소속이 안 간다.
     ✅ **안 잃은 것**: 하단 문의 폼(`#inqOrg`)은 회사/기관명을 **필수로 그대로 받는다.**
       연락처(`#contactTel`)도 필수 그대로다 — 연락처 없는 견적은 리드가 아니다.
     ⚠ 되살리려면 `index.html` 2단계에 세 칸을 다시 넣는다. `script.js`는 값을 읽는
       자리가 그대로 남아 있어 칸만 돌아오면 다시 실린다. */
  for (const id of ['organization', 'contactName', 'requestDetails']) {
    ok('③ ' + id + ' 칸이 없다(대표 지시)', !d.getElementById(id));
  }
  ok('③ 🔴 연락처는 남아 있고 여전히 필수다',
    !!d.getElementById('contactTel') && d.getElementById('contactTel').hasAttribute('required'),
    '연락처 없는 견적은 우리가 먼저 연락할 수 없어 리드가 아니다');
  ok('③ 🔴 하단 문의 폼은 회사/기관명을 그대로 받는다',
    !!d.getElementById('inqOrg') && d.getElementById('inqOrg').hasAttribute('required'));
}
console.log('\n[4] 1인당이 주인공이다');
{
  const iPer = INDEX.indexOf('id="perPersonValue"');
  const iTot = INDEX.indexOf('id="resultValue"');
  ok('④ 1인당이 총액보다 먼저 나온다', iPer > 0 && iTot > 0 && iPer < iTot,
    'per@' + iPer + ' total@' + iTot);
  ok('④ 강조(검은 상자)가 1인당에 붙는다', /\.total-per\s+\{ background:var\(--ink\)/.test(CSS));
  /* 🔴 **2026-09-14 대표 지시로 두 숫자를 같은 크기로 맞췄다**(32px/18px → 28px/28px).
     그래서 「1인당이 더 크다」는 이제 사실이 아니다.
     ⚠ 하지만 **이 단언이 지키려던 것은 그게 아니다** — VX에서 순서를 뒤집은 이유는
       「8명 여행에서 총액이 제일 먼저 눈에 들어오면 사람이 놀라서 나간다」였다.
       즉 진짜 규칙은 **「총액이 1인당보다 크면 안 된다」**이고, 같은 크기는 그 규칙을
       어기지 않는다. 그래서 단언을 **그 규칙 그대로** 다시 쓴다.
     ⚠ 먼저 읽히는 것은 여전히 1인당이다 — 검은 바탕 + 빨강(바로 위 단언이 잡는다). */
  {
    /* ⚠ 정규식에 역슬래시를 쓰지 않는다 — 이 저장소를 고치는 도구를 거치면서
       역슬래시가 먹히는 일이 반복됐다(2026-09-14에 여기서만 두 번). 문자열 찾기 +
       [0-9]로 똑같은 일을 한다. */
    const px = (marker) => {
      const i = CSS.indexOf(marker);
      if (i < 0) return -1;
      const m = CSS.slice(i, i + 200).match(/font-size:([0-9]+)px/);
      return m ? Number(m[1]) : -1;
    };
    const per = px('.total-per   .total-amt');
    const tot = px('.total-grand .total-amt');
    ok('④ 두 금액의 글자 크기를 읽었다', per > 0 && tot > 0, per + 'px / ' + tot + 'px');
    ok('④ 🔴 총액이 1인당보다 크지 않다', tot <= per, '1인당 ' + per + 'px · 총액 ' + tot + 'px');
  }
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

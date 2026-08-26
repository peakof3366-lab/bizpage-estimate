/* ═══════════════════════════════════════════════════════════════════════════
   WW — **금액과 「요율 기준월」이 어긋난 것을 세고, 몰래 맞추지 않는다**

   ■ 🔴 무엇을 찾았나 (2026-08-26 실측)

   고객 견적서는 「요율 기준: 2026년 06월」이라는 **근거 날짜**를 찍는다.
   그런데 운영 요율을 받아 보니, **21개 목적지 59칸이 금액만 바뀌고 기준월은
   옛 날짜 그대로**였다(상해 6칸·삿포로 5칸·카자흐스탄 5칸 …).
   즉 고객이 읽는 날짜와 실제로 쓰인 값의 시점이 다르다.

   원인은 `ai-loop/apply_rate_updates.js`다 — 견적서 실측 중앙값을 얹으면서
   숫자 칸만 쓰고 `rateDate`는 안 쓴다.

   ■ ⚠ 그런데 **오늘로 채우는 것이 답이 아니다**

   그 값은 코퍼스(2025~2026) 전체의 중앙값이라 「이번 달에 확인했다」가 사실이 아니다.
   패키지의 「금액 확인일을 오늘로 채우지 않는다」(VP·WJ)와 같은 자리다.
   게다가 기준월을 올리면 **「오래된 요율」 경고(QG)가 함께 꺼진다** — 못 지킬
   안심을 주는 쪽이다. 그래서 **고치지 않고 세어서 말한다.** 표기 방침은 대표 결정이다.

   ■ 이 검사가 지키는 것

     ① 어긋남을 **세는 장치가 살아 있다** (합성 입력으로 실제로 잡히는지 본다)
     ② 🔴 `apply_rate_updates.js`가 **rateDate를 쓰지 않는다** —
        누군가 「오늘로 채우자」고 고치면 여기서 걸린다
     ③ 어긋난 상태를 **말하는 자리**가 있다(감사 출력·도구 끝맺음)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { applyLiveRates } = require('./live_rates');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 어긋남을 세는 장치 — 합성 입력으로 실제로 잡는가');
{
  const STATIC = [
    { destination_key: '상해', label: '상해', airfare: 300000, hotel_per_room: 200000, rateDate: '2026-06' },
    { destination_key: '도쿄', label: '도쿄', airfare: 380000, hotel_per_room: 300000, rateDate: '2026-06' },
    { destination_key: '방콕', label: '방콕', airfare: 500000, hotel_per_room: 200000, rateDate: '2026-06' },
  ];
  const LIVE = {
    overrides: {
      /* 숫자만 바뀌고 기준월은 안 옴 → 어긋남 */
      상해: { airfare: 350000, hotel_per_room: 250000 },
      /* 숫자와 기준월이 함께 옴 → 정상 */
      도쿄: { airfare: 399000, rateDate: '2026-07' },
      /* 비고만 바뀜 → 숫자가 안 바뀌었으므로 어긋남이 아니다 */
      방콕: { notes: '메모만 고침' },
    },
  };
  const out = applyLiveRates(STATIC, LIVE);
  const keys = (out.dateNotUpdated || []).map((x) => x.key);
  ok('① 숫자만 바뀐 목적지를 잡는다', keys.includes('상해'), JSON.stringify(keys));
  ok('① 🔴 기준월이 함께 온 목적지는 안 잡는다', !keys.includes('도쿄'), JSON.stringify(keys));
  /* ⚠ 비고만 바뀐 것을 결함이라 부르면 없는 결함을 만든다 */
  ok('① 비고만 바뀐 목적지도 안 잡는다', !keys.includes('방콕'), JSON.stringify(keys));
  ok('① 어긋난 칸 수를 함께 센다',
    (out.dateNotUpdated[0] || {}).fields.length === 2, JSON.stringify(out.dateNotUpdated));
  ok('① 화면이 말하고 있는 옛 날짜를 함께 준다',
    (out.dateNotUpdated[0] || {}).shownDate === '2026-06', JSON.stringify(out.dateNotUpdated));
  /* 값 자체는 그대로 얹힌다 — 세는 일이 병합을 바꾸면 안 된다 */
  const merged = out.rates.find((d) => d.destination_key === '상해');
  ok('① 값 병합은 그대로다', merged.airfare === 350000 && merged.rateDate === '2026-06');
}

console.log('\n[2] 🔴 실측을 얹는 도구가 기준월을 오늘로 채우지 않는다');
{
  const src = read('ai-loop/apply_rate_updates.js');
  /* 주석이 아니라 **코드**에서 rateDate를 쓰는지 본다 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('② 🔴 코드가 rateDate를 쓰지 않는다', !/rateDate/.test(code),
    (code.match(/.{0,40}rateDate.{0,40}/) || [''])[0]);
  ok('② 왜 안 쓰는지가 주석에 남아 있다', /코퍼스 전체의 중앙값/.test(src));
  /* ③ 어긋난 상태를 말하는 자리가 있다 */
  ok('② 도구가 그 사실을 사람에게 말한다', /요율 기준월」은 바꾸지 않았습니다/.test(src));
  ok('② 감사가 그 수를 센다', /요율 기준월」이 그대로인 목적지/.test(read('ai-loop/live_rates.js')));
}

console.log('\n[3] 값이 하나도 안 바뀐 경우 — 조용해야 한다');
{
  const STATIC = [{ destination_key: '도쿄', label: '도쿄', airfare: 380000, rateDate: '2026-06' }];
  const out = applyLiveRates(STATIC, { overrides: { 도쿄: { airfare: 380000 } } });
  ok('③ 같은 값이면 어긋남으로 세지 않는다', (out.dateNotUpdated || []).length === 0,
    JSON.stringify(out.dateNotUpdated));
  ok('③ 오버라이드가 아예 없어도 안 죽는다', (applyLiveRates(STATIC, {}).dateNotUpdated || []).length === 0);
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — WW 요율 기준월`);
process.exit(fail ? 1 : 0);

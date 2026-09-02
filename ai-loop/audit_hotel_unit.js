/* ═══════════════════════════════════════════════════════════════════════════
   **호텔 단가가 그 문서와 앞뒤가 맞는가** (YL) — 읽기 전용
   ───────────────────────────────────────────────────────────────────────────
   ■ 어떻게 찾았나

   `audit_margin_gap`이 「우리 원가 > 그쪽 판매가」인 건 3건을 이름으로 불렀다.
   있을 수 없는 값이라 뜯어보니, 「글로벌 베스트 푸꾸옥(100명 5일)」에서 엔진이
   **호텔만 1인당 905,760원**을 매기고 있었다. 문서의 판매가가 1,410,000원인데
   항공 380,000 + 유류 100,000만 더해도 1,385,760이라 식사·차량·마진 자리가 없다.

   원인은 **총액이 아니라 단가**였다. 문서에서 읽은 호텔 줄이 이렇다:

       452,880 × 3 × 18 = 24,455,520      (인원은 100명)

   총액 24,455,520은 맞다 — 1인당 244,555원으로 말이 된다. 그런데 엔진은 452,880을
   **1실 1박 요금**(`hotel_per_room`)으로 받아 `× 박수 ÷ 2인1실`로 다시 조립한다:
   452,880 × 4박 ÷ 2 = **905,760**. 실제의 3.7배다.

   ■ 그래서 이 자가 재는 것

       엔진식 = 단가 × (일수−1) ÷ 2        ← 엔진이 그 단가로 만들 1인당
       문서식 = 호텔 총액 ÷ 인원            ← 문서가 실제로 쓴 1인당
       두 값이 크게 다르면 **그 단가를 엔진 기준으로 옮길 수 없다.**

   ⚠ **총액을 의심하는 자가 아니다.** 총액은 대체로 맞다. 의심하는 것은 **단가**이고,
     요율 갱신·요율 천장·마진 비교가 전부 그 단가를 쓴다.
   ⚠ **거르지 않고 이름만 부른다.** 어느 쪽이 틀렸는지(실 수를 잘못 읽었는지, 그 문서가
     1인 1실인지)는 문서를 열어 봐야 안다. 이 저장소가 값을 지어내면 그게 곧 정답지 오염이다.

   ■ 지금 막고 있는 것 / 못 막는 것

   ✅ 요율 갱신은 **중앙값 + 표본 2건 하한**이라 이상치 하나가 요율을 못 흔든다
      (실측: 푸꾸옥 호텔 실측중앙 214,500 — 452,880이 섞여 있어도 ×1.07로 안전).
   🔴 그런데 **요율 천장(`audit_error_decomp`)과 마진 비교(`audit_margin_gap`)는
      건별로 그 단가를 그대로 쓴다.** 그래서 그 세 건이 「원가 > 판매가」로 나왔다.
      금액이 아니라 **판단이 오염되는** 자리다.

   실행: node ai-loop/audit_hotel_unit.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, '.corpus_db.json');

/* 엔진식과 문서식이 몇 배까지 벌어지면 「못 믿는다」로 볼 것인가.
   ⚠ 딱 떨어지지 않는다 — 엔진은 `일수−1`을 박수로 쓰고 문서는 실제 박수를 쓰므로
     하루 차이만으로도 1.3배쯤은 그냥 난다. 그 정도를 결함이라 부르면 목록이 소음이 된다.
     2배를 넘으면 **구조가 다른 것**이다(실 수를 인원으로 읽은 것 같은). */
const LOUD = 2.0;

const won = (n) => (n == null ? '—' : Math.round(n).toLocaleString());
const wpad = (s, w) => {
  const width = String(s).split('').reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, w - width));
};

if (!fs.existsSync(DB)) {
  console.log('코퍼스 DB가 없습니다 — 먼저 `node ai-loop/build_corpus_db.js`를 돌리십시오.');
  process.exit(1);
}

const db = require(DB);
const rows = [];
for (const r of db) {
  const it = (r.items || {}).hotel;
  if (!it || !it.calc || !r.pax || !(r.days >= 2)) continue;
  const m = /([\d,]+)\s*×\s*([\d,]+)\s*×\s*([\d,]+)\s*=\s*([\d,]+)/.exec(it.calc);
  if (!m) continue;
  const num = (s) => Number(String(s).replace(/,/g, ''));
  const unit = num(m[1]), total = num(m[4]);
  if (!(unit > 0) || !(total > 0)) continue;
  const engine = unit * (r.days - 1) / 2;   /* 엔진이 이 단가로 만들 1인당 */
  const doc = total / r.pax;                /* 문서가 실제로 쓴 1인당 */
  rows.push({
    file: r.file, pax: r.pax, days: r.days, unit, total, engine, doc,
    ratio: doc > 0 ? engine / doc : null,
    perPerson: r.perPerson || r.depositPerPerson || null,
    calc: it.calc,
  });
}

console.log('════ 호텔 단가가 그 문서와 앞뒤가 맞는가 ════');
console.log('엔진식 = 단가 × (일수−1) ÷ 2   ·   문서식 = 호텔 총액 ÷ 인원');
console.log('호텔 줄을 읽은 견적서 ' + rows.length + '건\n');

/* 🔴 **「어긋났다」를 전부 결함이라 부르면 안 된다** (WD에서 두 번 그럴 뻔했다).
   실측에서 어긋난 10건이 **두 무리로 깨끗하게 갈렸다**:

     · 딱 절반(÷2.0)인 4건 — 문서가 **1인 1실**이라 단가가 1인 1박이다. 엔진은
       2인 1실을 기본으로 ÷2 하므로 정확히 절반이 된다. **사양 차이지 결함이 아니다**
       (엔진에 `roomConfig` 손잡이가 있다). 결함이라 부르면 목록이 소음이 된다.
     · 2배 이상 큰 쪽 — 여기가 진짜다. 실 수를 인원으로 읽었거나 그 반대다.

   ⚠ 「딱 절반」의 폭을 좁게 잡는다(0.45~0.55). 넓히면 진짜가 그 안으로 숨는다. */
const isSingleRoom = (r) => r.ratio >= 0.45 && r.ratio <= 0.55;
const off = rows.filter((r) => r.ratio != null && (r.ratio >= LOUD || r.ratio <= 1 / LOUD));
const single = off.filter(isSingleRoom);
const bad = off.filter((r) => !isSingleRoom(r))
  .sort((a, b) => Math.max(b.ratio, 1 / b.ratio) - Math.max(a.ratio, 1 / a.ratio));

if (single.length) {
  console.log('⚪ 딱 절반(÷2.0)인 ' + single.length + '건 — **1인 1실 문서로 보인다. 결함이 아니다.**');
  single.forEach((r) => console.log('   ' + wpad(r.file.slice(0, 40), 42)
    + String(r.pax).padStart(4) + '명   ' + r.calc));
  console.log('   ↳ 엔진은 2인 1실을 기본으로 ÷2 한다. 사양 손잡이(roomConfig)가 있는 자리다.\n');
}

if (!bad.length) {
  console.log('✅ 확인 대상이 없습니다.');
} else {
  /* 🔴 **이 목록은 「오류」가 아니라 「확인 대상」이다** — 처음엔 결함이라 불렀다가
     문서를 열어 보고 대부분 아니라는 것을 알았다(YM). 문서식의 분모가 문제다:

     여기서 쓰는 「호텔 총액」은 추출기가 **고른 줄 하나**의 총액이다. 호텔 줄이
     여럿이면 그 하나가 전부가 아니라서 문서식이 통째로 과소해진다. 실측:

       신한금융플러스(푸꾸옥) — 문서에 호텔 줄이 둘이다
         베스트웨스턴 디럭스  204,545 × 18실 × 3박 = 11,045,455   ← 본 객실
         인솔자 숙박          204,545 ×  1실 × 3박 =    613,636   ← 고른 줄
       **단가(204,545)는 양쪽이 같아서 추출은 맞다.** 총액만 작은 쪽이라 ×24.0으로 찍혔다.

     체코 2건도 마찬가지다(다구간 여행이라 호텔 줄이 구간마다 있다).
     → 그래서 아래 「1인당의 절반 이상」이 **진짜 잣대**다. 그건 고른 줄에 안 흔들린다. */
  console.log('⚠ 확인 대상 ' + bad.length + '건 — ' + LOUD + '배 넘게 **큰** 쪽');
  console.log('  ⚠ **오류 목록이 아니다.** 문서식의 분모가 「고른 줄 하나」의 총액이라,');
  console.log('     호텔 줄이 여럿인 문서는 여기 걸려도 단가가 맞을 수 있다(실측 다수가 그랬다).');
  console.log('     진짜 잣대는 아래 「1인당의 절반 이상」이다.\n');
  bad.forEach((r) => {
    console.log('  ' + wpad(r.file.slice(0, 34), 36)
      + String(r.pax).padStart(4) + '명' + String(r.days).padStart(3) + '일'
      + '   엔진식 ' + won(r.engine).padStart(9)
      + '   문서식 ' + won(r.doc).padStart(9)
      + '   ' + (r.ratio >= 1 ? '×' + r.ratio.toFixed(1) : '÷' + (1 / r.ratio).toFixed(1)).padStart(6));
    console.log('     └ ' + r.calc
      + (r.perPerson ? '   · 문서 1인당 ' + won(r.perPerson) : ''));
  });
}

/* ── 🔴 가장 무거운 것 — 호텔만으로 판매가를 먹어치우는 건 ──────────────── */
const eats = rows.filter((r) => r.perPerson > 0 && r.engine / r.perPerson >= 0.5)
  .sort((a, b) => (b.engine / b.perPerson) - (a.engine / a.perPerson));
if (eats.length) {
  console.log('\n🔴 **진짜 잣대** — 엔진식 호텔이 문서 1인당의 절반 이상을 먹는 건 ' + eats.length + '건');
  console.log('   — 항공까지 더하면 자리가 안 남는다. 그 단가는 거의 확실히 틀렸다.');
  console.log('   ⚠ 이 잣대는 **고른 줄에 안 흔들린다** — 분모가 문서의 1인당이라서다.');
  eats.forEach((r) => console.log('   ' + wpad(r.file.slice(0, 34), 36)
    + '  호텔 ' + won(r.engine).padStart(9) + ' / 1인당 ' + won(r.perPerson).padStart(10)
    + '  = ' + Math.round(r.engine / r.perPerson * 100) + '%'));
}

if (!eats.length) {
  console.log('\n✅ **진짜 잣대** — 엔진식 호텔이 문서 1인당의 절반을 넘는 건이 없습니다.');
}

console.log('\n════ 읽는 법 ════');
console.log('· 🔴 **위 두 목록은 무게가 다르다.** 「배수」는 **확인 대상**이고(분모가 고른 줄');
console.log('  하나의 총액이라 호텔 줄이 여럿이면 헛걸린다), **「1인당의 절반 이상」이 결함**이다.');
console.log('  실측: 배수로 걸린 6건 중 진짜는 1건이었다. 나머지는 12~36%로 멀쩡했다.');
console.log('· **총액을 의심하는 자가 아니다.** 총액은 대체로 맞다 — 틀린 것은 단가다.');
console.log('· 요율 갱신은 중앙값 + 표본 2건 하한이라 이상치 하나로는 안 흔들린다.');
console.log('  🔴 그러나 **요율 천장과 마진 비교는 건별로 이 단가를 쓴다** — 거기가 오염된다.');
console.log('· 어느 쪽이 틀렸는지(실 수를 인원으로 읽었는지, 정말 1인 1실인지)는');
console.log('  문서를 열어 봐야 안다. **여기서 값을 고치지 않는다.**');

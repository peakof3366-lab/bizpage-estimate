/* TF 검증 — 「여러 도시를 도는 견적서」를 한 목적지 실측으로 넣는 것

   왜 만들었나 — 2026-08-11에 실제로 났다. `actual_price_reports` id 17:
   `KT CES참관.pdf`(샌프란시스코 → 라스베가스 → 페이지 → 라플린 → LA → **칸쿤**)가
   목적지 「샌프란시스코」 실측 한 줄로 저장됐다. 저장된 값은
     호텔 770,000 = `Wyndham Grand Cancun All Inclusive`(칸쿤 리조트)
     차량 1,120,000 = 「차량 CUN 버스」 · 가이드 700,000 = 「LAX 한국인 가이드」
   샌프란시스코 실측 표본이 그 하나뿐이라 **그 행이 곧 그 목적지의 실측**이 된다.

   ⚠ **기존 안전망이 왜 못 잡았나** — 이 테스트의 존재 이유다.
     · 타당성 검토(SO)는 기준가의 3배를 넘어야 말한다. 샌프란시스코 호텔 기준가가
       369,900이라 칸쿤 770,000은 **2.08배**에 그쳤다.
     · 「검산 안 됨」도 아니었다 — 단가×박수×실수가 맞는 멀쩡한 줄이다.
     → 값이 이상한 게 아니라 **다른 도시 것**이다. 금액만 보는 자로는 영영 못 잡는다.

   ⚠ 이 검사는 **막지 않는다. 세기만 한다.** 지방 이동처럼 한 요율로 덮는 게 맞는
     일정도 있다(큐슈 3곳이 그렇다). 한 도시 견적이 맞는지는 문서를 손에 든 사람만 안다.

   실행: node ai-loop/test_tF_multi_city.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ex = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('TF — 여러 도시 견적서 판별\n' + '─'.repeat(60));

/* ── ① 잣대가 한 곳에만 있는가 ────────────────────────────────────────────── */
ok('문턱을 추출기가 갖는다 (MULTI_CITY_STAYS)', ex.MULTI_CITY_STAYS === 3, String(ex.MULTI_CITY_STAYS));

/* ⚠ 화면이 숫자를 다시 적으면 감사기와 어긋난다(결함 생성기 ①).
   admin.html은 itin.multiCity를 **읽기만** 해야 한다. */
const adminSrc = read('admin.html');
ok('화면이 문턱을 다시 세지 않는다', !/stays\.length\s*>=\s*\d/.test(adminSrc),
  'admin.html에서 stays.length >= 숫자 비교가 발견됐다');
ok('화면이 추출기 판정을 읽는다 (multiCity)', /PR_LAST_ITIN\s*&&\s*PR_LAST_ITIN\.multiCity/.test(adminSrc));
ok('제출 전에 한 번 묻는다', /여러 도시|곳에서 묵는 일정입니다/.test(adminSrc));
/* ⚠ 앞 문서의 판정이 다음 문서로 새면, 없던 경고가 붙거나(성가심) **있어야 할 경고가
   사라진다**(위험). 지우는 자리가 있는지 본다. */
ok('새 문서를 올리면 앞 판정을 버린다', /PR_LAST_ITIN = null/.test(adminSrc));

/* ── ② 이름 정규화 — 같은 호텔이 표기 차이로 갈리면 문턱이 흔들린다 ──────────
   실측: 「베스트 웨스턴 프리미어…」 / 「베스트웨스턴 프리미어…」가 두 곳으로 세어졌다. */
ok('머리말(HOTEL :)을 뗀다', ex.stayKey('◎ HOTEL :  Aquarius Hotel') === ex.stayKey('Aquarius Hotel'));
ok('공백 차이를 같은 곳으로 본다',
  ex.stayKey('베스트 웨스턴 프리미어 소나시') === ex.stayKey('베스트웨스턴 프리미어 소나시'));
ok('「또는 동급」 꼬리를 뗀다',
  ex.stayKey('Planet Hollywood Hotel 또는 동급') === ex.stayKey('Planet Hollywood Hotel'));
ok('객실 표기(| [2인 1실])를 뗀다',
  ex.stayKey('예정 호텔 : 힐튼 | [2인 1실]') === ex.stayKey('힐튼'));
ok('빈 값은 세지 않는다', ex.stayKey('') === '' && ex.stayKey(null) === '');

/* ── ③ 일부러 망가진 입력을 넣어 실제로 잡히는지 (결함 생성기 ③) ───────────── */
const day = (h) => ({ hotel: h });
const sfoToCancun = ex.distinctStays([
  day('◎ HOTEL :  Hilton San Francisco Airport Bayfront 또는 동급'),
  day('◎ HOTEL :  Hilton San Francisco Airport Bayfront 또는 동급'),   /* 같은 곳 2박 */
  day('◎ HOTEL :  Planet Hollywood Hotel 또는 동급'),
  day('◎ HOTEL :  Wyndham Grand Cancun All Inclusive Resort & Villas 또는 동급'),
]);
ok('KT CES꼴(미국→멕시코)을 3곳으로 센다', sfoToCancun.length === 3, JSON.stringify(sfoToCancun));
ok('같은 호텔에 이틀 묵은 것은 한 곳이다', sfoToCancun.filter((s) => /Hilton/.test(s)).length === 1);
ok('보여주는 이름은 문서의 이름 그대로다', sfoToCancun[0] === 'Hilton San Francisco Airport Bayfront',
  sfoToCancun[0]);

const oneCity = ex.distinctStays([
  day('◎ HOTEL : 르와지르 호텔 나하'), day('◎ HOTEL : 르와지르 호텔 나하'), day(null),
]);
ok('한 도시 일정은 걸리지 않는다', oneCity.length === 1 && oneCity.length < ex.MULTI_CITY_STAYS,
  JSON.stringify(oneCity));

const twoCity = ex.distinctStays([day('HOTEL : Grandior Hotel Prague'), day('HOTEL : Vienna Marriott Hotel')]);
/* ⚠ 2곳(프라하·비엔나)은 **일부러 안 잡는다.** 코퍼스 41건 중 2곳 이상이 10건이라
   문턱으로 쓰면 4건 중 1건에 경고가 붙어 곧 무시된다. 3곳은 2건뿐이다. */
ok('2곳짜리는 문턱 아래다 (경고를 값싸게 만들지 않는다)', twoCity.length < ex.MULTI_CITY_STAYS,
  String(twoCity.length));

/* ── ④ 실제 코퍼스에서 몇 건이 걸리는가 — 오탐 수를 테스트가 고정한다 ────────
   ⚠ 견적서 폴더는 저장소 밖이라 **없을 수 있다.** 없으면 건너뛴다(실패로 만들지 않는다). */
const CORPUS = 'C:/Users/최현욱/Desktop/견적서 모음';
if (fs.existsSync(CORPUS)) {
  (async () => {
    const pdfParse = require('pdf-parse');
    let withItin = 0; const flagged = [];
    for (const f of corpusFiles(CORPUS, { quiet: true }).files) {
      try {
        const r = await ex.extractQuote(fs.readFileSync(path.join(CORPUS, f)), pdfParse, {});
        const itin = r.itinerary || (r.blocks && r.blocks[0] && r.blocks[0].itinerary);
        if (!itin) continue;
        withItin++;
        if (itin.multiCity) flagged.push(f + '(' + itin.stays.length + ')');
      } catch (e) { /* 못 읽는 문서는 이 테스트의 대상이 아니다 */ }
    }
    console.log('\n  코퍼스: 일정표 ' + withItin + '건 중 ' + flagged.length + '건 걸림');
    flagged.forEach((f) => console.log('    · ' + f));
    ok('KT CES가 걸린다 (실제로 사고가 난 문서)', flagged.some((f) => /KT CES/.test(f)),
      JSON.stringify(flagged));
    /* ⚠ 이 수가 늘면 경고가 흔해져 무시된다. 늘어야 할 이유가 생기면 여기를 고치되,
       **왜 늘었는지 세어 보고** 고칠 것. 지금은 KT CES(7곳)와 큐슈(3곳) 둘뿐이다. */
    ok('걸리는 문서가 3건을 넘지 않는다 (경고가 흔해지면 무시된다)', flagged.length <= 3,
      String(flagged.length));

    console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
    process.exit(fail === 0 ? 0 : 1);
  })();
} else {
  console.log('\n  (견적서 코퍼스가 없어 실측 검사는 건너뜁니다: ' + CORPUS + ')');
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
}

/* TH 검증 — 객실 줄이 식비로 가던 것 · 골프장 `C.C` 표기

   2026-08-12 사장님 지적: 「고은회 제주도 견적서 PDF 추출은 너무 엉망이야」.
   제주도는 이번에 새로 넣은 목적지(TE)라 이 양식이 처음 들어왔다. 셋이 틀렸다.

   ① **객실 줄이 식비가 됐다** — 「150,000원 X 2박 X 17객실 · 1인1실_조식포함」
      라벨이 비어 있어 비고를 봤고, 비고의 '조식'이 걸렸다. 그 한 줄 때문에 둘이 틀어진다:
        · 식비 86,984원 — 그 문서는 「전일정식사」가 **불포함**이라 식비 줄이 아예 없다
        · 호텔은 17객실짜리 **본 줄을 잃고** 1객실짜리 170,000이 대표가 됐다
      「조식포함」은 끼니 값이 아니라 **객실 조건**이다.

   ② **골프장을 `C.C`로 적으면 못 알아봤다** — 「입장료 라헨느 C.C 170,000 x 24명」이
      관광비 대표가 됐다. 하필 제주 관광 기준가와 같은 170,000이라 눈으로도 안 걸린다.
      골프를 관광과 따로 세는 규칙이 표기 하나로 무너졌다.

   ③ 항공 줄은 **여전히 못 잡는다.** 이 문서는 구분 열이 소계 없이 묶음 **세로 중앙**에
      붙어 있어(「항공」이 첫 줄과 둘째 줄 사이) 어느 줄이 어느 묶음인지 규칙으로 못 가른다.
      「가장 가까운 라벨」로 붙여 봤더니 호텔 줄이 차량과 동점이 되어 차량으로 갔다 —
      **고치려다 더 나빠지는 쪽**이라 접었다. 담당자가 후보에서 1클릭으로 고른다.

   실행: node ai-loop/test_tH_room_unit.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
const ex = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('TH — 객실 단위 · 골프 C.C\n' + '─'.repeat(60));

/* ── ① 어휘만으로 되는 것 ────────────────────────────────────────────────── */
console.log('[1] 골프장 표기');
ok('「오라 CC」를 골프로 본다', ex.classifyLabel('오라 CC') === 'golf', String(ex.classifyLabel('오라 CC')));
ok('**「라헨느 C.C」도 골프다** (마침표가 있어도)', ex.classifyLabel('라헨느 C.C') === 'golf',
  String(ex.classifyLabel('라헨느 C.C')));
ok('「입장료 라헨느 C.C」가 관광비로 안 간다', ex.classifyLabel('입장료 라헨느 C.C') === 'golf',
  String(ex.classifyLabel('입장료 라헨느 C.C')));
ok('「컨트리클럽」도 골프다', ex.classifyLabel('제주 컨트리클럽') === 'golf');
/* ⚠ 진짜 관광비는 그대로 관광비여야 한다 — 골프 규칙을 넓히다 관광을 삼키면 안 된다 */
ok('「입장료 성산일출봉」은 관광비 그대로다', ex.classifyLabel('입장료 성산일출봉') === 'sight',
  String(ex.classifyLabel('입장료 성산일출봉')));
ok('「관광 케이블카」도 관광비 그대로다', ex.classifyLabel('관광 케이블카') === 'sight');

console.log('\n[2] 수량 단위가 비고보다 앞선다');
const row = (over) => Object.assign({
  label: '', note: '', line: '150,000 원 X 2 박 X 17 객실 ₩5,100,000 1인1실_조식포함',
}, over);
ok('**객실을 세는 줄은 호텔이다** (비고에 조식이 있어도)',
  ex.classifyRow(row()) === 'hotel', String(ex.classifyRow(row())));
ok('2인1실_조식포함도 마찬가지다',
  ex.classifyRow(row({ line: '190,000 원 X 2 박 X 1 객실 ₩380,000 2인1실_조식포함' })) === 'hotel');
/* ⚠ 라벨은 문서가 스스로 붙인 이름이라 가장 세다 — 단위로 뒤집으면 안 된다 */
ok('라벨이 있으면 라벨이 이긴다',
  ex.classifyRow(row({ label: '식사 조식' })) === 'meal', String(ex.classifyRow(row({ label: '식사 조식' }))));
/* ⚠ 객실이 없는 줄까지 호텔로 끌고 오면 안 된다 */
ok('객실을 안 세는 줄은 비고를 그대로 본다',
  ex.classifyRow(row({ line: '30,000 원 X 3 회 X 21 명 ₩1,890,000', note: '조식' })) === 'meal');
ok('아무 근거도 없으면 분류하지 않는다',
  ex.classifyRow(row({ line: '194,000 원 X 1 회 X 18 명 ₩3,492,000' })) === null,
  String(ex.classifyRow(row({ line: '194,000 원 X 1 회 X 18 명 ₩3,492,000' }))));

/* ── ③ 실제 문서로 확인 — 안전망은 진짜 입력에서 잡혀야 한다 ───────────────── */
const CORPUS = 'C:/Users/최현욱/Desktop/견적서 모음';
const FILE_A = path.join(CORPUS, '고은회 제주도.pdf');
const FILE_B = path.join(CORPUS, '고은회_(제주도).pdf');

if (fs.existsSync(FILE_A) && fs.existsSync(FILE_B)) {
  (async () => {
    const pdfParse = require('pdf-parse');
    const A = await ex.extractQuote(fs.readFileSync(FILE_A), pdfParse, {});
    const B = await ex.extractQuote(fs.readFileSync(FILE_B), pdfParse, {});

    console.log('\n[3] 고은회 제주도.pdf — 골프 3회 + 호텔 3종');
    ok('호텔이 **17객실짜리 본 줄** 150,000이다 (예전 170,000)', A.values.hotel === 150000,
      String(A.values.hotel));
    ok('**식비가 비어 있다** (이 문서는 전일정식사 불포함)', A.values.meal === null,
      String(A.values.meal));
    ok('차량은 그대로 500,000', A.values.vehicle === 500000, String(A.values.vehicle));
    ok('골프 3줄은 관광비로 안 샌다', A.values.sight === null, String(A.values.sight));
    /* ⚠ 아직 못 잡는 것 — 고쳐졌다고 착각하지 않도록 여기 박아 둔다(위 ③ 참고) */
    ok('(알려진 한계) 항공은 여전히 비어 있다 — 구분 열이 세로 중앙이라 못 가른다',
      A.values.airfare === null, String(A.values.airfare));
    ok('  ↑ 그래도 후보 목록에는 194,000이 있어 1클릭으로 고를 수 있다',
      (A.candidates || []).some((c) => c.unit === 194000));

    console.log('\n[4] 고은회_(제주도).pdf — 골프장이 「입장료 ○○ C.C」로 적힌 문서');
    ok('**관광비가 비었다** (라헨느 C.C는 골프다 · 예전 170,000)', B.values.sight === null,
      String(B.values.sight));
    ok('항공 189,400은 그대로 잡는다', B.values.airfare === 189400, String(B.values.airfare));
    ok('호텔 90,000도 그대로', B.values.hotel === 90000, String(B.values.hotel));
    ok('호텔명(아시아호텔)도 그대로', B.values.hotelName === '아시아호텔', String(B.values.hotelName));

    /* ── 나머지 44건이 조용히 바뀌지 않았는가 ───────────────────────────────
       ⚠ 분류 우선순위를 건드리면 **다른 문서가 조용히 틀어진다.** 이 저장소에서 실제로
         여러 번 났다(공동경비·인두세·픽트램). 그래서 바뀐 문서 수를 여기 박아 둔다. */
    console.log('\n[5] 코퍼스 나머지가 조용히 안 바뀌었는가');
    let touched = 0, total = 0;
    for (const f of corpusFiles(CORPUS, { quiet: true }).files) {
      if (/고은회/.test(f)) continue;
      total++;
      try {
        const r = await ex.extractQuote(fs.readFileSync(path.join(CORPUS, f)), pdfParse, {});
        /* 객실 단위로 분류가 **뒤집힌** 줄이 있으면 그 문서는 영향권이다 */
        if ((r.candidates || []).some((c) => c.categoryFrom === 'unit')) touched++;
      } catch (e) { /* 못 읽는 문서는 대상이 아니다 */ }
    }
    console.log('    고은회 밖 ' + total + '건 중 단위로 분류된 줄이 있는 문서: ' + touched + '건');
    ok('고은회 밖 문서는 단위 규칙에 걸리지 않는다 (객실 단위 표기가 이 양식만의 것)',
      touched === 0, String(touched));

    console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
    process.exit(fail === 0 ? 0 : 1);
  })();
} else {
  console.log('\n  (고은회 견적서가 없어 실측 검사는 건너뜁니다: ' + CORPUS + ')');
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
}

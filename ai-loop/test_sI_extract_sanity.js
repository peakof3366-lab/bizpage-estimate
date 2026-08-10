/* SI 검증 — 뽑아낸 값 **자체가 말이 되는가**를 재고, 거기서 나온 결함을 고정한다

   왜 —  기존 자 셋은 전부 다른 것을 잰다: 분류를 못 붙인 줄(빈칸) · 총계의 몇 %를
   설명하는가(덜 읽은 것) · 검산이 없었던 줄(근거 없는 값). **정작 「그 값이 그럴듯한
   금액인가」는 아무도 안 봤다.** 그런데 이 저장소가 겪은 사고는 대부분 그 모양이었다 —
   가이드 746,210(실제 95,000) · 차량 1,430원 · 호텔 「패널티」. 전부 **분류도 되고 검산도
   통과한** 값이었다.

   `ai-loop/audit_extract_sanity.js`를 만들어 요율표 55곳의 실제 분포와 대조했더니
   **9개가 범위 밖**이었고, 그중 7개가 화면에서 「가장 믿을 만하다」로 나가고 있었다.
   파 보니 결함이 넷이었다. 이 파일이 그 넷을 고정한다.

     ① 「픽트램 편도」가 **항공료**가 됐다(13,050원). '편도·왕복'이 항공 어휘에 있는데
        지상 교통도 그렇게 적는다. → 항공을 가리키는 다른 낱말과 함께 있을 때만 항공.
     ② 「인두세」가 **유류할증료**를 가로챘다(12,510원). 유류할증은 15만~75만인데
        인두세는 1만~3만이라 자릿수가 다르다. → 현지 입국세는 부대비용(fee)이다.
     ③ 비고의 「3일차」 **하나** 때문에 식사 일수를 1일로 셌다(1인 1일 372,857원).
        날짜가 하나만 나오는 건 특정 끼니를 가리키는 메모일 뿐 일수가 아니다.
     ④ 조·중·석식이 전부 `× 8회`라고 적혀 있는데 **호텔 1박+1**로 2일을 써서 식비가
        630,000원이 됐다. → **끼니 횟수**를 호텔 박수보다 먼저 본다.

   실행: node ai-loop/test_sI_extract_sanity.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const X = require('../api/_lib/pdf_extract.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

let ln = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - ln * 10, idx: ln, cells: [], text: '' };
  let x = 40;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  ln++;
  return out;
};
const doc = (rows) => { ln = 0; return rows.map((r) => line(r)); };

/* ══ [1] '편도·왕복'만으로 항공이라 보지 않는가 ═══════════════════════════ */
console.log("[1] 지상 교통을 항공료로 세지 않는가");
{
  ok('「픽트램 편도」는 항공이 아니다', X.classifyLabel('픽트램 편도') !== 'airfare',
    String(X.classifyLabel('픽트램 편도')));
  ok('「페리 왕복」도 항공이 아니다', X.classifyLabel('페리 왕복') !== 'airfare',
    String(X.classifyLabel('페리 왕복')));
  ok('「항공 왕복」은 항공이다', X.classifyLabel('항공 왕복') === 'airfare');
  ok('「왕복 항공권」도 항공이다', X.classifyLabel('왕복 항공권') === 'airfare',
    String(X.classifyLabel('왕복 항공권')));
  ok('「항공료」는 그대로 항공이다', X.classifyLabel('항공료') === 'airfare');
  ok('「이코노미」·「비즈니스석」도 그대로다',
    X.classifyLabel('이코노미') === 'airfare' && X.classifyLabel('비즈니스석') === 'airfare');
}
{
  /* 실제로 항공료 칸이 지상 교통에 뺏기지 않는지 — 값까지 본다 */
  const r = X.readOneBlock(doc([
    ['인 원', '10'],
    ['항공', '항공 운임', '430,000', '6', '1', '2,580,000'],
    ['입장료', '픽트램 편도', '13,050', '10', '1', '130,500'],
  ]), {}, null);
  ok('항공료가 진짜 항공 줄에서 나온다', r.values.airfare === 430000, String(r.values.airfare));
}

/* ══ [2] 인두세가 유류할증료를 가로채지 않는가 ════════════════════════════ */
console.log('\n[2] 인두세를 유류할증료로 세지 않는가');
{
  ok('「인두세(세금)」는 유류할증이 아니다', X.classifyLabel('인두세(세금)') !== 'fuel',
    String(X.classifyLabel('인두세(세금)')));
  ok('「현지 수수료/인두세」도 아니다', X.classifyLabel('현지 수수료/인두세') !== 'fuel',
    String(X.classifyLabel('현지 수수료/인두세')));
  ok('「유류할증료+TAX」는 그대로 유류다', X.classifyLabel('유류할증료+TAX') === 'fuel');
  ok('「공항세」도 그대로 유류·택스다', X.classifyLabel('공항세') === 'fuel');
}
{
  const r = X.readOneBlock(doc([
    ['인 원', '10'],
    ['항공', '유류할증료', '124,000', '10', '1', '1,240,000'],
    ['기타', '인두세(세금)', '12,510', '10', '1', '125,100'],
  ]), {}, null);
  ok('유류할증료가 진짜 유류 줄에서 나온다', r.values.fuel === 124000, String(r.values.fuel));
}

/* ══ [3] 'N일차'가 하나뿐이면 일수가 아니다 ═══════════════════════════════ */
console.log("\n[3] 비고의 「3일차」 하나로 하루라고 세지 않는가");
{
  const r = X.readOneBlock(doc([
    ['인 원', '14'],
    ['식사', '전 일정 중식', '37,500', '14', '4', '2,100,000'],
    ['식사', '전 일정 석식', '37,500', '14', '4', '2,100,000'],
    ['식사', '스테이크 추가비', '45,000', '14', '1', '630,000', '3일차 중식 특식'],
  ]), {}, null);
  const lab = String(r.evidence.meal && r.evidence.meal.label);
  ok("'N일' 한 개짜리를 일수로 쓰지 않는다", !/'N일' 1개/.test(lab), lab);
  ok('끼니 횟수 4회로 나눈다', r.evidence.meal && r.evidence.meal.dayCount === 4,
    String(r.evidence.meal && r.evidence.meal.dayCount));
  ok('1인 1일 식비가 터무니없이 크지 않다', r.values.meal < 100000, String(r.values.meal));
}
{
  /* 날짜가 둘 이상이면 예전대로 그것을 쓴다 */
  const r = X.readOneBlock(doc([
    ['인 원', '10'],
    ['식사', '1일차 중식', '30,000', '10', '1', '300,000'],
    ['식사', '2일차 중식', '30,000', '10', '1', '300,000'],
    ['식사', '3일차 중식', '30,000', '10', '1', '300,000'],
  ]), {}, null);
  ok("'N일'이 셋이면 3일로 센다", r.evidence.meal && r.evidence.meal.dayCount === 3,
    String(r.evidence.meal && r.evidence.meal.dayCount));
}

/* ══ [4] 끼니 횟수를 호텔 박수보다 먼저 보는가 ════════════════════════════
   호텔은 한 숙박이 여러 줄로 쪼개져 박수를 적게 세지만, 끼니 횟수는 그 줄 안에서
   완결된다. 실측(KT CES참관): 조·중·석식이 전부 `× 8회`인데 1박짜리 호텔 줄이
   여럿이라 2일로 세어 1인 1일 식비가 630,000원이 됐다. */
console.log('\n[4] 「× 8회」라고 적힌 끼니를 2일로 세지 않는가');
{
  const build = (mealTimes) => doc([
    ['인 원', '9'],
    ['호텔', 'Hilton San Francisco', '406,000', '7', '1', '2,842,000'],
    ['호텔', 'Hyatt Place Page', '350,000', '7', '1', '2,450,000'],
    ['식사', '조식', '28,000', '9', String(mealTimes), String(28000 * 9 * mealTimes)],
    ['식사', '석식', '70,000', '9', String(mealTimes), String(70000 * 9 * mealTimes)],
  ]);
  const r = X.readOneBlock(build(8), {}, null);
  ok('끼니 8회를 일수로 쓴다', r.evidence.meal && r.evidence.meal.dayCount === 8,
    String(r.evidence.meal && r.evidence.meal.dayCount));
  ok('호텔 1박+1(2일)로 세지 않는다', !/호텔/.test(String(r.evidence.meal && r.evidence.meal.label)),
    String(r.evidence.meal && r.evidence.meal.label));
  /* 끼니 횟수가 없으면(전부 1회) 예전대로 호텔 박수로 물러난다 */
  const one = X.readOneBlock(build(1), {}, null);
  ok('끼니 횟수가 없으면 호텔 박수로 물러난다',
    /호텔/.test(String(one.evidence.meal && one.evidence.meal.label)),
    String(one.evidence.meal && one.evidence.meal.label));
}

/* ══ [5] 자를 만들어 두고 실제로 돌리는가 ═════════════════════════════════
   ⚠ 결함 생성기 ③ — 감사기를 만들고 아무도 안 돌리면 없는 것과 같다.
   README의 「손대기 전에 돌릴 것」에 등록돼 있어야 다음 사람이 돌린다. */
console.log('\n[5] 감사기가 README에 등록돼 있는가');
{
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  ['audit_row_categories.js', 'audit_coverage.js', 'audit_extract_sanity.js'].forEach((f) => {
    ok(f + ' 가 README에 있다', readme.indexOf(f) >= 0);
  });
  ok('감사기 파일이 실제로 있다',
    fs.existsSync(path.join(__dirname, 'audit_extract_sanity.js')));
  /* ⚠ 목적지 판정표는 **한 곳**에만 있어야 한다(결함 생성기 ①) — 역검증과 타당성 감사가
     서로 다른 표를 쓰면 한쪽에서 빠진 건이 다른 쪽에서 엉뚱한 목적지로 세어진다. */
  const shared = fs.readFileSync(path.join(__dirname, '_dest_from_name.js'), 'utf8');
  ok('목적지 판정표가 공용 모듈에 있다', /const DEST_ALIAS = \[/.test(shared));
  ['backtest_quotes.js', 'audit_extract_sanity.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    ok(f + ' 가 그 모듈을 쓴다', /require\('\.\/_dest_from_name'\)/.test(src));
    ok(f + ' 안에 표를 다시 적지 않았다', !/const DEST_ALIAS = \[/.test(src));
  });
  /* ⚠ **기준은 그 지역 것이어야 한다**(2026-08-10 대표 지시) — 전 목적지를 한 통에 넣고
     재면 비싼 지역이 통째로 이상값이 된다. 감사기가 목적지별로 모으는지 검사한다. */
  const aud = fs.readFileSync(path.join(__dirname, 'audit_extract_sanity.js'), 'utf8');
  ok('목적지별로 모아서 잰다', /const byDest = \{\}/.test(aud) && /byDest\[d\.dest\]/.test(aud));
  ok('동료가 없으면 그 값을 기준선으로 둔다(어긋났다고 하지 않는다)',
    /vals\.length === 1/.test(aud) && /noPeer\.push/.test(aud));
  ok('오독 후보와 요율 갱신 후보를 갈라서 낸다',
    /misread/.test(aud) && /rateGap/.test(aud));
  /* 화면(갱신 제안)도 같은 원칙을 따라야 한다 — 1건이어도 그 목적지의 기준이 된다.
     ⚠ 집계 키에 목적지가 들어 있어야 지역이 섞이지 않는다. */
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  ok('1건짜리 목적지도 갱신 제안에 뜬다', /RATE_SUGGEST_MIN_COUNT = 1/.test(html));
  ok('자동 적용은 여전히 5건 이상만', /RATE_SUGGEST_CONFIDENT_COUNT = 5/.test(html));
  ok('1건일 때 「첫 실측」이라고 밝힌다', /이 목적지의 첫 실측/.test(html));
  ok('제안 집계가 목적지별로 묶인다', /\$\{r\.destinationKey\}\|\$\{field\}/.test(html));
}

/* ⚠ 이 요약 줄의 형식은 run_all_tests.js가 정규식으로 읽는다(「결과: N pass / M fail」). */
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);

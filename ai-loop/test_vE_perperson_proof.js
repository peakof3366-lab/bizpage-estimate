/* VE 검증: **라벨이 다음 줄로 밀린 1인당을 산술로 읽는다** + 제외 사유를 세 갈래로 가른다.

   왜 —
   ① 실측(키움에셋플래너 카자흐스탄):
        114줄  45,776,978  3,269,784
        115줄  총 합계 - ①            ← 라벨이 **금액 다음 줄**에 있다
      1인당을 찾는 모든 패턴이 「라벨과 금액이 같은 줄」을 전제해서, 이 견적서는 문서에
      분명히 적혀 있는데도 통째로 못 읽혀 역검증에서 빠져 있었다.
      → **라벨을 쫓지 않고 산술이 증명하게 한다** — `총액 ≈ 1인당 × 인원`.

   ② 그리고 제외 사유가 셋을 하나로 뭉뚱그리고 있었다. 「1인당 금액을 못 읽음」 5건을
      열어 보니 성격이 전혀 달랐다:
        굿리치 2건  → **원가 시트라 판매가가 없다**(문서에 「* 계약서상 판매가??」로 비어 있다)
        바르셀로나·하노이 → **외화인데 문서에 환율이 없다**(사람이 한 칸)
        카자흐스탄   → **진짜로 못 읽은 것**(코드가 고칠 것)
      고칠 수 있는 것과 없는 것이 같은 얼굴이면 계속 헛짚는다. 실제로 헛짚었다.

   여기서 고정하는 것:
   ① 산술이 증명하면 라벨 없이도 읽는다.
   ② **빈칸일 때만 돈다** — 이미 읽은 값은 건드리지 않는다. 이 파일에서 패턴을 넓혀
      멀쩡한 값을 죽인 전례가 둘이다(「1인 1실」·엔화 환산).
   ③ 허용 오차는 반올림만 흡수한다 — 넓히면 우연히 맞는 두 숫자가 들어온다.
   ④ 인원을 모르면 아예 안 돈다(pax >= 2).
   ⑤ 역검증 제외 사유가 세 갈래로 갈리고, 그 신호가 **캐시에도 실린다**.

   실행: node ai-loop/test_vE_perperson_proof.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 줄 픽스처 — 다른 추출 테스트(test_sC 등)와 같은 모양이어야 한다.
   `cells`가 없으면 `wonNumbers`가 그 자리에서 죽는다. */
let lnNo = 0;
const line = (cells) => {
  const out = { page: 1, y: 700 - lnNo * 10, idx: lnNo, cells: [], text: '' };
  let x = 0;
  cells.forEach((s) => { out.cells.push({ s: String(s), x }); x += 40; });
  out.text = out.cells.map((c) => c.s.trim()).filter(Boolean).join(' ');
  lnNo++;
  return out;
};
const L = (...rows) => { lnNo = 0; return rows.map((r) => line(Array.isArray(r) ? r : [r])); };
const per = (lines) => X.reconcile(lines, [], null, {}).perPerson;

console.log('\n[1] 라벨이 다음 줄에 있어도 읽는다 (산술이 증명한다)');
{
  /* 실측 그대로 — 14명, 총합계 45,776,978, 1인당 3,269,784 (곱하면 2원 차이) */
  const lines = L(
    '인원 14 명',
    '행사경비 종합43,390,500 3,099,321',
    '45,776,978 3,269,784',
    '총 합계 - ①',
  );
  ok('① 라벨 없는 줄에서 1인당을 읽는다', per(lines) === 3269784, String(per(lines)));

  /* 여러 줄이 증명되면 **가장 큰 것**이 총합계다 — 구간 소계에 멈추면 안 된다 */
  ok('① 구간 소계(3,099,321)가 아니라 총합계를 고른다', per(lines) !== 3099321);
}

console.log('\n[2] 빈칸일 때만 돈다 — 이미 읽은 값을 건드리지 않는다');
{
  /* 라벨이 있는 줄에서 이미 1,030,000을 읽는다. 아래 산술 증명 줄이 있어도 그것을
     덮어쓰면 안 된다 — 이 파일은 그런 방식으로 회귀를 두 번 냈다. */
  const lines = L(
    '인원 14 명',
    '1 인 1,030,000 원',
    '45,776,978 3,269,784',
  );
  ok('② 라벨로 읽은 값이 산술 규칙에 덮이지 않는다', per(lines) === 1030000, String(per(lines)));
}

console.log('\n[3] 허용 오차는 반올림만 흡수한다');
{
  const base = (tot) => L('인원 14 명', tot + ' 3,269,784');
  /* 3,269,784 × 14 = 45,776,976 — 2원 차이는 반올림이다 */
  ok('③ 2원 차이는 받는다 (반올림)', per(base('45,776,978')) === 3269784);
  /* 5% 어긋난 총액은 그 1인당의 근거가 아니다 */
  ok('③ 5% 어긋나면 받지 않는다', per(base('48,065,825')) === null, String(per(base('48,065,825'))));
}

console.log('\n[4] 인원을 모르면 아예 안 돈다');
{
  /* 인원이 없으면 「총액 ÷ 1인당 = 인원」을 세울 수 없다 — 추측하지 않는다 */
  const lines = L('45,776,978 3,269,784', '총 합계 - ①');
  ok('④ 인원이 없으면 읽지 않는다', per(lines) === null, String(per(lines)));
}

console.log('\n[5] 우연히 맞는 두 숫자를 받지 않는다');
{
  /* 1인당 범위(PER_PERSON_MIN~MAX) 밖의 값은 후보가 아니다 —
     「호텔 90,000 · 2박 · 14명 = 2,520,000」 같은 줄이 1인당이 되면 안 된다 */
  const lines = L('인원 14 명', '호텔 아시아호텔 90,000 2 14명 2,520,000 1인 1실');
  const v = per(lines);
  ok('⑤ 90,000은 1인당 하한 아래라 후보가 아니다', v !== 90000, String(v));
}

console.log('\n[6] 역검증이 제외 사유를 세 갈래로 가른다');
{
  const s = fs.readFileSync(path.join(ROOT, 'ai-loop', 'backtest_quotes.js'), 'utf8');
  ok('⑥ 원가 시트를 따로 말한다', /원가 시트라 판매가가 없다/.test(s));
  ok('⑥ 그 경우 --basis=cost로는 잰다고 알려준다', /--basis=cost/.test(s));
  ok('⑥ 환율이 없는 경우를 따로 말한다', /문서에 환율이 없다/.test(s));
  ok('⑥ 그 경우 사람이 할 일임을 가리킨다', /0-f/.test(s));
  /* ⚠ 캐시에 안 실으면 `--cache`일 때만 사유가 뭉뚱그려진다(결함 생성기 ③) */
  ok('⑥ 환율 신호를 캐시에 싣는다', /needsFx:\s*r\.needsFxRate/.test(s));
  const v = (s.match(/const CACHE_VERSION = (\d+)/) || [])[1];
  ok('⑥ 캐시 판을 올렸다 (5 이상)', Number(v) >= 5, 'CACHE_VERSION=' + v);
}

console.log('\n[7] 날짜를 못 얻었을 때 **무엇이 없어서인지** 말한다');
{
  const why = (lines) => (X.findDates(lines).departWhy || null);

  /* 실측(키움에셋플래너 해외연수 하노이): 일정표에 04월 02~05일이 또렷한데
     문서 어디에도 연도가 없다. 작성일도 없어 연도를 추정할 근거조차 없다. */
  const noYear = why(L('제1일 04월 02일 하노이 13:10 공항 도착', '제2일 04월 03일 하노이 시내'));
  ok('⑦ 연도가 아예 없으면 그렇게 말한다', /연도가 없다/.test(noYear || ''), String(noYear));
  ok('⑦ 무엇을 넣으면 되는지 말한다', /연도 한 칸/.test(noYear || ''), String(noYear));

  /* 실측(굿리치 RM재무 후아힌): 11월 19~22일은 있는데 연도 후보가 여럿이다.
     하나를 고르면 시즌·리드타임 계수가 조용히 틀린다. */
  const many = why(L('11월 19일 출발 11월 22일 귀국', '2025 굿리치 · 2026 행사 기준'));
  ok('⑦ 연도 후보가 여럿이면 고르지 않고 그 사실을 말한다',
    /연도 후보가/.test(many || ''), String(many));

  /* 날짜 흔적이 아예 없으면 할 말이 없다 — 없는 말을 지어내지 않는다 */
  ok('⑦ 날짜 흔적이 없으면 null이다', why(L('행사 진행표 호차1 호차2')) === null,
    String(why(L('행사 진행표 호차1 호차2'))));

  /* ⚠ 출발일을 **얻은** 문서에는 켜지면 안 된다 — 켜지면 화면이 멀쩡한 값을 두고
     「연도가 없다」고 말하게 된다(조용한 폴백의 반대 방향 사고). */
  const good = X.findDates(L('여행기간 2026. 04. 02 ~ 04. 05 (3박 4일)'));
  ok('⑦ 출발일을 얻었으면 켜지지 않는다', !!good.departDate && !good.departWhy,
    JSON.stringify({ d: good.departDate, w: good.departWhy }));

  const bt = fs.readFileSync(path.join(ROOT, 'ai-loop', 'backtest_quotes.js'), 'utf8');
  ok('⑦ 역검증이 그 이유를 그대로 보여준다', /departWhy/.test(bt));
  const v2 = (bt.match(/const CACHE_VERSION = (\d+)/) || [])[1];
  ok('⑦ 캐시 판을 다시 올렸다 (6 이상)', Number(v2) >= 6, 'CACHE_VERSION=' + v2);
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

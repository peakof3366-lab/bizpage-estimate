/* ═══════════════════════════════════════════════════════════════════════════
   XZ — **사람이 채운 값**이 실제로 채점표에 닿는가
   ───────────────────────────────────────────────────────────────────────────
   🔴 고리가 끊겨 있었다. 결정대기열 0-f는 「관리자 화면에서 환율 한 칸을 넣으면
   역검증 표본이 36 → 42건이 된다」고 적어 두었는데, 실제로는:

     · 화면에서 넣은 환율 → 운영 DB(`actual_price_reports`)에 저장된다
     · 그러나 역검증은 **로컬 PDF를 다시 추출**하고, 그때
       `extractQuote(buf, pdfParse, {})` — **빈 옵션**으로 부르고 있었다

   추출기는 `opts.fxRate`를 받을 준비가 되어 있었는데(SF) **부르는 쪽이 안 줬다.**
   결함 생성기 ③(실행된 적 없는 안전망)의 전형이다.

   ■ 그리고 값을 넣어 실측해 보니 **약속 자체가 틀렸다**
   환율 넷을 다 채워도 대조 가능은 **36건 그대로**였다. 제외 사유만
   「외화인데 환율이 없다」 → 「1인당 금액을 못 읽음」으로 옮겨갔다.
   즉 바르셀로나·하노이에 필요한 것은 **환율이 아니라 정답지**다.
   (환율은 항목 줄을 살려 **칸별 분석**에 값이 있다. 채점표를 만드는 것은 정답지다.)

   이 검사가 잠그는 것:
     ① 비어 있으면 **지금과 똑같이** 동작한다 (빈 파일이 안전한 기본값이다)
     ② 값을 넣으면 **실제로 추출에 들어간다**
     ③ 🔴 **문서가 이긴다** — 문서에서 읽힌 값을 사람 값으로 덮지 않는다
     ④ 사람에게서 온 칸은 **표시가 남는다**(`fromHuman`)
     ⑤ 파일 이름이 코퍼스에 없으면 **그 자리에서 말한다**(조용히 안 먹는 값 금지)

   실행: node ai-loop/test_xZ_corpus_manual.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const M = require('./_corpus_manual');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 실제 파일을 잠깐 바꿔 확인하고 **반드시 되돌린다** —
   되돌리지 않으면 다음 역검증이 이 시험값으로 계산된다(가장 찾기 어려운 오염이다). */
const 원본 = fs.readFileSync(M.FILE, 'utf8');
const 되돌리기 = () => fs.writeFileSync(M.FILE, 원본, 'utf8');

try {
  console.log('\n[1] 비어 있으면 아무 일도 안 한다 (빈 파일이 안전한 기본값)');
  {
    const d = JSON.parse(원본);
    const 빈칸수 = ['환율', '판매가', '정답지', '일정'].reduce((n, 구역) =>
      n + Object.entries(d[구역] || {}).filter(([k, v]) => k !== '_읽는법'
        && v && v.값 == null && v.총계 == null && v['1인당'] == null && v.출발일 == null).length, 0);
    ok('지금은 채워진 값이 하나도 없다', M.채워진것().fx.length === 0 && M.채워진것().price.length === 0);
    ok('채울 자리는 이미 적혀 있다(무엇이 필요한지 목록이 있다)', 빈칸수 >= 6, 빈칸수 + '칸');
    ok('빈 값은 null로 돌아온다', M.fxFor('굿리치_연도대상(바르셀로나).pdf') === null);
    ok('없는 파일도 null로 돌아온다', M.fxFor('있을 리 없는 파일.pdf') === null);
  }

  console.log('\n[2] 값을 넣으면 그 모양 그대로 나온다');
  {
    const d = JSON.parse(원본);
    d.환율['굿리치_연도대상(바르셀로나).pdf'].값 = 1500;
    d.정답지['신한 금융플러스 파워스타트(하노이).pdf']['1인당'] = 2000000;
    d.일정['키움에셋플래너 해외연수(하노이).pdf'].출발일 = '2026-04-02';
    d.일정['키움에셋플래너 해외연수(하노이).pdf'].귀국일 = '2026-04-03';
    fs.writeFileSync(M.FILE, JSON.stringify(d, null, 2), 'utf8');

    ok('환율은 추출기가 받는 모양이다 {통화: 값}',
      JSON.stringify(M.fxFor('굿리치_연도대상(바르셀로나).pdf')) === '{"EUR":1500}');
    ok('정답지는 1인당으로 나온다',
      (M.answerFor('신한 금융플러스 파워스타트(하노이).pdf') || {}).perPerson === 2000000);
    const dt = M.datesFor('키움에셋플래너 해외연수(하노이).pdf') || {};
    ok('일정은 출발·귀국에서 일수를 계산한다', dt.depart === '2026-04-02' && dt.days === 2, JSON.stringify(dt));
    /* 🔴 값이 바뀌면 캐시가 낡아야 한다 — 안 그러면 채워도 옛 결과가 계속 나온다 */
    ok('채운 값이 바뀌면 지문도 바뀐다', M.manualSig() !== '' && M.manualSig().includes('1500'));
  }

  console.log('\n[3] 🔴 문서가 이긴다 — 사람 값으로 덮지 않는다');
  {
    /* 코퍼스를 여기서 돌리지 않는다(1~3분 걸리고 PDF가 있어야 한다).
       대신 **덮어쓰기 규칙이 코드에 그렇게 적혀 있는지**를 본다. */
    const src = fs.readFileSync(path.join(__dirname, '_corpus_cache.js'), 'utf8');
    ok('1인당은 문서 값이 먼저다', /const perPerson = r\.perPerson \|\|/.test(src));
    ok('총계도 문서 값이 먼저다', /const grand = r\.grandTotal \|\|/.test(src));
    /* 🔴 **이 줄이 버그를 고정하고 있었다** (YT에서 드러났다).
       예전엔 `!dates.depart`를 찾았는데, 추출기가 만들고 **소비자 여섯이 읽는** 이름은
       `dates.departDate`다. 그래서 손으로 채운 출발일이 아무도 안 읽는 칸에 들어갔고,
       이 검사는 그 상태를 「통과」로 지키고 있었다.
       뜻(**비어 있을 때만 채운다** — 문서 값을 덮지 않는다)은 그대로다. 이름만 바로잡는다.
     ⚠ 이름이 또 갈리지 않게 `test_yT_intake_report.js`가 **읽는 곳과 쓰는 곳을 대조**한다. */
    ok('출발일은 비어 있을 때만 채운다', /if \(!dates\.departDate && 손일정\.depart\)/.test(src));
    ok('🔴 출발일이 **소비자가 읽는 이름**으로 들어간다', /dates\.departDate = 손일정\.depart/.test(src));
    ok('사람에게서 온 칸을 표시한다(fromHuman)', /fromHuman/.test(src));
    ok('캐시 판이 올라갔다(옛 캐시가 이 칸 없이 통과하지 않게)', /CACHE_VERSION = 1[2-9]/.test(src));
  }

  console.log('\n[4] 이름이 틀리면 조용히 안 먹지 않고 말한다');
  {
    const 말한것 = [];
    const 낯선 = M.이름확인(['있는 파일.pdf'], (m) => 말한것.push(m));
    ok('코퍼스에 없는 이름을 찾아낸다', 낯선.length >= 4, 낯선.length + '건');
    ok('그 사실을 말한다', 말한것.length === 1 && /아무 일도 안 합니다/.test(말한것[0]));
    const 없음 = M.이름확인(Object.keys(JSON.parse(fs.readFileSync(M.FILE, 'utf8')).환율 || {}), () => {});
    ok('이름이 맞으면 조용하다', 없음.filter((x) => x.startsWith('환율')).length === 0);
  }
} finally {
  되돌리기();
  const 확인 = M.채워진것();
  ok('시험이 끝나면 파일이 원래대로다 (시험값이 남으면 채점표가 오염된다)',
    확인.fx.length === 0 && 확인.price.length === 0);
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

/* YD 검증 — 「이 견적서가 골프 일정인가」를 재는 자가 **실제로 잡는가**

   왜 —  같은 질문에 답하는 자가 둘이었고(결함 생성기 ①), 쓰이던 쪽이 틀렸다.

     · `audit_error_axes.js`가 `/골프|그린피|캐디/`를 3회 이상 세어 골프로 봤다
     · `_corpus_cache.js`의 `shape.golfLines`는 **금액 줄** 수라 애초에 다른 질문이다

   앞엣것이 놓친 것: 「11월 20일 ■ 다낭 BRG CC 18홀 라운딩 / 11월 21일 ■ 몽고메리 CC
   18홀 라운딩 … 골프조 · 관광조」로 적은 문서(한화손해보험 25년GA 다낭 24명). 전 일정이
   골프인데 「골프」라는 낱말이 1회뿐이라 **「골프 일정 아님」**으로 세어졌다.
   그 문서는 역검증에서 -34.7%로 두 번째로 큰 음수 오차다.

   그 결과 골프 축은 양쪽이 3건씩이라 `MIN_GROUP`(4)에 못 미쳐 **「아직 못 잰다」**로만
   출력됐다 — 즉 이 축은 한 번도 재어진 적이 없다. 세는 자가 틀려서 축이 안 보인 것이지
   견적서가 모자라서가 아니었다.

   ⚠ 이 테스트는 **일부러 망가진 입력**을 넣어 잡히는지 본다(결함 생성기 ③).
     「골프」 낱말이 아예 없는 골프 일정 · 지나가는 말 한 번 · 골프와 무관한데
     「CC」만 있는 문서 — 셋 다 답이 달라야 한다.

   실행: node ai-loop/test_yD_golf_scope.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const { golfScope, MIN_KINDS } = require('./_golf_scope');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
};

/* 합성 본문 — 실제 견적서를 쓰지 않는다(참가자 실명·거래처 단가가 들어 있다).
   문장 모양은 코퍼스에서 그대로 본뜨되 이름·숫자는 지어낸다. */

/* ══ [1] 「골프」라는 낱말을 안 쓰는 골프 일정 — 예전 자가 놓치던 것 ══════════════ */
console.log('[1] 「골프」를 안 쓰고 「18홀 라운딩」으로만 적은 문서');
{
  const t = '제2일 전용차량 전일 호텔 조식 ■ 남부 BRG CC 18홀 라운딩 중: 클럽식 '
          + '제3일 ■ 몽고메리 CC 18홀 라운딩 중: 클럽식 석: 정찬식';
  const g = golfScope(t);
  ok('골프 일정으로 본다', g.isGolfTrip, JSON.stringify(g.evidence));
  ok('갈래가 둘 이상이다 (라운딩 · n홀)', g.kinds >= MIN_KINDS, '갈래 ' + g.kinds);
  ok('「골프」 낱말이 실제로 없다 — 예전 자였다면 못 잡는다', !/골프/.test(t));
}

/* ══ [2] 지나가는 말 한 번은 골프 일정이 아니다 ═══════════════════════════════ */
console.log('\n[2] 선택 일정에 이름만 오른 경우');
{
  /* 실측에서 이 모양이 3건이었다: KT CES · 미야코지마 · 리더스 푸꾸옥 */
  const g = golfScope('오후 자유시간 (선택: 시내관광 / 골프 / 휴식) 석식 후 호텔 투숙');
  ok('골프 일정으로 보지 않는다', !g.isGolfTrip, JSON.stringify(g.evidence));
  ok('그래도 증거는 남긴다 — 「왜 아닌가」를 답할 수 있어야 한다', g.evidence.length === 1);
}

/* ══ [3] 「CC」만 있는 문서를 골프로 오인하지 않는다 ══════════════════════════ */
console.log('\n[3] 골프와 무관한데 「CC」가 들어간 문서');
{
  /* 실측: 좋은친구 홍콩 2건 · EnBT 타이베이 · EnBT 싱가포르 · Hanatour 오키나와가
     전부 「CC」 1회씩 걸렸다. 그래서 CC를 증거 갈래에 넣지 않았다. */
  const g = golfScope('회의실 A/V 시스템 CC 카메라 설치 · 만찬 · 시내관광 · 전신마사지 90분');
  ok('골프 일정으로 보지 않는다', !g.isGolfTrip, JSON.stringify(g.evidence));
  ok('CC를 증거로 세지 않는다', !g.evidence.some((e) => /CC/.test(e)));
}

/* ══ [4] 금액이 없는 골프 일정도 잡는다 ════════════════════════════════════ */
console.log('\n[4] 라벨만 있고 금액이 없는 골프 (shape.golfLines가 0인 자리)');
{
  const g = golfScope('캐디팁 (현장 지불) · 그린피 별도 안내 · 골프조 인식표 제작');
  ok('골프 일정으로 본다', g.isGolfTrip, JSON.stringify(g.evidence));
}

/* ══ [5] 잣대가 한 곳인가 — 옛 잣대가 되살아나지 않았는지 ═══════════════════ */
console.log('\n[5] 골프 판정이 한 곳에서만 온다 (결함 생성기 ①)');
{
  const axes = fs.readFileSync(path.join(__dirname, 'audit_error_axes.js'), 'utf8');
  ok('축 분석이 _golf_scope를 쓴다', /require\('\.\/_golf_scope'\)/.test(axes));
  ok('축 분석 안에 골프 정규식 사본이 없다',
    !/const\s+GOLF_RE\s*=/.test(axes));
  /* `shape.golfLines`는 **다른 질문**(금액 줄 수)이라 남겨 두되, 일정 판정으로
     오해하지 않게 캐시에 그 사실이 적혀 있어야 한다. */
  const cache = fs.readFileSync(path.join(__dirname, '_corpus_cache.js'), 'utf8');
  ok('캐시가 golfLines는 일정 판정이 아니라고 밝힌다',
    /_golf_scope/.test(cache) && /금액 줄/.test(cache));
}

/* ══ [6] 처방이 어디로 가는지가 적혀 있는가 ════════════════════════════════ */
console.log('\n[6] 이 축이 갈리면 무엇을 해야 하는가');
{
  const src = fs.readFileSync(path.join(__dirname, '_golf_scope.js'), 'utf8');
  ok('요율 조정이 아니라 골프 요금을 넣는 일이라고 적혀 있다', /0-m/.test(src));
  ok('엔진이 골프 줄을 아예 못 만든다는 근거(getGolfFee)가 적혀 있다', /getGolfFee/.test(src));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — YD 골프 일정 판정`);
process.exit(fail ? 1 : 0);

/* UY 검증: 운영 DB 값이 지금 추출기와 어긋날 때 **왜 어긋났는지**를 말하는가.

   왜 —
   `recheck_reports.js`가 운영 DB의 실측 제보를 원본 견적서로 다시 맞춰 본다. 그런데
   어긋난 것을 찾고도 「DB 115,827 ↔ 지금 111,891」까지만 찍었다. 사람이 그 자리에서
   곱셈을 해 봐야 원인을 알 수 있었고, 그러면 판단이 미뤄진다.

   실측 3행의 원인은 전부 **분모가 달라진 것**이었다(총액은 그대로):
       후아힌  관광 115,827 → 111,891   인원 199 → 206   (오늘 UW로 다시 읽었다)
       다낭    식비  40,950 →  32,760   일수   4 →   5

   ⚠ 이 계산에서 **방향을 두 번 틀렸다.** 여기 고정해 두지 않으면 또 틀린다:
     ① 1인당 단가 = 총액 ÷ 분모이므로
          옛값 ÷ 지금값 = 지금분모 ÷ 옛분모  →  **옛분모 = 지금분모 ÷ 비율**
        처음엔 `지금분모 × 비율`로 적어 후아힌(206 ÷ 1.0352 = 199)을 놓쳤다.
     ② 비율이 인원·일수 **양쪽에 맞는** 일이 있다(다낭 1.25). 먼저 시도한 쪽으로
        단정하면 「인원 30」처럼 문서에 없는 값을 사실처럼 적게 된다.
        → 둘 다 맞으면 제보에 저장된 **박수**를 증인으로 쓰고, 그래도 못 가리면
          **하나를 고르지 않고 둘 다 적는다.**

   실행: node ai-loop/test_uY_drift_cause.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 도구는 운영 DB에 붙으므로 통째로 돌릴 수 없다. 원인을 정하는 **계산 규칙만** 떼어
   같은 식으로 검사한다.
   ⚠ 규칙을 여기 옮겨 적는 것이 아니라 **소스에서 읽어** 확인한다(두 벌이 되면 어긋난다). */
const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'recheck_reports.js'), 'utf8');

console.log('\n[1] 방향 — 옛 분모 = 지금 분모 ÷ 비율');
{
  ok('나눗셈으로 되돌린다 (곱셈이 아니다)',
    /Math\.round\(now \/ ratio\)/.test(src), '소스에서 now / ratio 를 찾지 못했다');
  ok('곱셈으로 되돌리는 옛 식이 남아 있지 않다',
    !/Math\.round\(nowPax \* ratio\)/.test(src) && !/Math\.round\(nowDays \* ratio\)/.test(src));

  /* 실측 두 건을 그 식으로 재현해 본다 */
  const back = (now, dbv, nowv) => Math.round(now / (dbv / nowv));
  ok('후아힌: 인원 206에서 옛 199가 되돌려진다',
    back(206, 115827, 111891) === 199, String(back(206, 115827, 111891)));
  ok('다낭: 일수 5에서 옛 4가 되돌려진다',
    back(5, 40950, 32760) === 4, String(back(5, 40950, 32760)));
  ok('다낭: 인원 24로는 정수가 안 나온다 (그래서 일수 쪽이다)',
    Math.abs(24 / (40950 / 32760) - Math.round(24 / (40950 / 32760))) > 0.02,
    String(24 / (40950 / 32760)));
}

console.log('\n[2] 둘 다 맞을 때 — 짐작하지 않는다');
{
  ok('저장된 박수를 증인으로 쓴다', /const dbNights = row\.nights/.test(src));
  ok('박수가 달라졌으면 일수 쪽으로 본다', /nightsMoved && byNights/.test(src));
  ok('박수가 그대로면 인원 쪽으로 본다', /nowNights === dbNights && byPax/.test(src));
  ok('그래도 못 가리면 **하나를 고르지 않는다**',
    /어느 쪽인지는 사람이 봐야 한다/.test(src));
  ok('둘 다 적는다', /fits\.map\(say\)\.join\(' 또는 '\)/.test(src));
}

console.log('\n[3] 근거 없는 말은 안 붙인다');
{
  ok('맞아떨어지지 않으면 사유를 비운다 (없는 원인을 지어내지 않는다)',
    /if \(!fits\.length\) return;/.test(src));
  ok('한쪽 값이 비어 있으면 계산하지 않는다', /if \(!x\.dbv \|\| !x\.nowv\) return;/.test(src));
  ok('사유가 있을 때만 화면에 덧붙인다', /x\.why \? ' *← ' \+ x\.why : ''/.test(src));
  ok('「총액은 같다」를 함께 말한다 (지금 값이 맞다는 뜻)', /총액은 같다/.test(src));
}

console.log('\n[4] 이 도구는 읽기만 한다');
{
  /* 운영 DB를 고치는 것은 대표 승인 사항이다. 되짚기 도구가 스스로 고치면
     승인 절차가 무력해진다. */
  ok('update/insert/delete 구문이 없다',
    !/\b(update|insert into|delete from)\b/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    '쓰기 구문이 보인다');
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

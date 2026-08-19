/* UZ 검증: 목적지 판정이 **두 곳에서 어긋나지 않는가**.

   왜 —
   이 저장소에는 목적지 판정이 두 벌 있다:
     `_dest_from_name.js`  역검증·감사기가 쓴다 (별칭 표: 북해도 → 삿포로)
     `_guess_dest.js`      코퍼스·심기 도구가 쓴다 (요율표 키)

   보는 표가 달라 하나로 합치기 어려운데, 그 사이 **「여러 곳이면 거부한다」는 규칙이
   한쪽에서만 지켜지고 있었다.** 실측으로 실제 사고가 났다:

       「글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf」
         역검증  → 목적지 여러 곳 (제외)
         코퍼스  → 푸꾸옥          ← 파일명에서 「가장 긴 것」을 집었다
       → **대만이 섞인 일정이 푸꾸옥 공통 코스로 운영 DB에 심겼다.**

   ⚠ 「가장 긴 것」 규칙 자체는 필요하다 — 「제주」⊂「제주도」처럼 **한쪽이 다른 쪽의
     조각**일 때 쓰라고 만든 것이다. 서로 다른 두 목적지까지 그걸로 집은 게 문제였다.

   여기서 고정하는 것:
   ① 서로 다른 목적지가 여럿 걸리면 **거부한다**(ambiguous).
   ② 한쪽이 다른 쪽의 조각이면 **긴 쪽을 쓴다**(옛 동작 유지).
   ③ 파일명 경로와 본문 경로가 **같은 규칙**을 쓴다.
   ④ **두 판정이 「여러 곳」에서 어긋나지 않는다** — 한쪽이 거부하면 다른 쪽도
      단일 목적지로 단정하지 않는다. 합치지 못하면 대조라도 한다(결함 생성기 ①).
   ⑤ 미끼 낱말(세부내역서·손해보험 등)은 예전 그대로 먼저 지운다.

   실행: node ai-loop/test_uZ_guess_dest.js  (프로젝트 루트에서) */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { guessDest } = require(path.join(ROOT, 'ai-loop', '_guess_dest.js'));
const { destFromName } = require(path.join(ROOT, 'ai-loop', '_dest_from_name.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 요율표 키를 흉내낸 목록 — 조각 관계(제주/제주도)를 일부러 넣는다 */
const KEYS = ['제주', '제주도', '대만', '푸꾸옥', '세부', '다낭', '가오슝', '삿포로'];

console.log('\n[1] 서로 다른 목적지가 여럿이면 고르지 않는다');
{
  const d = guessDest('글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf', '', KEYS);
  ok('① 실측 그 파일이 ambiguous로 빠진다', d.key === null && d.from === 'ambiguous',
    JSON.stringify(d));
  ok('① 무엇이 걸렸는지 남긴다 (사람이 볼 수 있게)',
    d.all && d.all.indexOf('대만') >= 0 && d.all.indexOf('푸꾸옥') >= 0, JSON.stringify(d.all));
  ok('① 「가장 긴 것」으로 조용히 집지 않는다', d.key !== '푸꾸옥', String(d.key));

  ok('한 곳만 걸리면 그대로 쓴다',
    guessDest('신한금융플러스(푸꾸옥).pdf', '', KEYS).key === '푸꾸옥');
}

console.log('\n[2] 조각 관계는 예전 그대로 긴 쪽 (② 회귀)');
{
  const d = guessDest('고은회 제주도.pdf', '', KEYS);
  ok('② 「제주」와 「제주도」가 함께 걸리면 제주도를 쓴다',
    d.key === '제주도' && d.from === 'filename', JSON.stringify(d));
}

console.log('\n[3] 본문 경로도 같은 규칙 (③)');
{
  ok('③ 본문에 한 곳이면 쓴다',
    guessDest('무제.pdf', '다낭 4박 5일', KEYS).key === '다낭');
  const d = guessDest('무제.pdf', '대만 일정 후 푸꾸옥으로 이동', KEYS);
  ok('③ 본문에 여러 곳이면 거부한다', d.key === null && d.from === 'ambiguous', JSON.stringify(d));
  ok('③ 아무 곳도 없으면 none',
    guessDest('무제.pdf', '내용 없음', KEYS).from === 'none');
}

console.log('\n[4] 미끼 낱말은 먼저 지운다 (⑤ 회귀)');
{
  ok('⑤ 「세부내역서」의 세부는 목적지가 아니다',
    guessDest('(세부내역서) 한화손해보험 다낭.pdf', '', KEYS).key === '다낭',
    JSON.stringify(guessDest('(세부내역서) 한화손해보험 다낭.pdf', '', KEYS)));
  ok('⑤ 진짜 세부는 그대로 잡는다',
    guessDest('필리핀 세부 연수.pdf', '', KEYS).key === '세부');
}

console.log('\n[5] 두 판정이 「여러 곳」에서 어긋나지 않는가 (④)');
{
  /* ⚠ 두 판정은 보는 표가 달라 **같은 답을 내지는 않는다**(별칭 vs 요율표 키).
     그래서 같은지를 묻지 않고, **한쪽이 「여러 곳」이라고 한 것을 다른 쪽이 단일
     목적지로 단정하지 않는지**만 본다 — 실제 사고가 정확히 그 모양이었다. */
  const CASES = [
    '글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf',
    'KS두레 VIP 아오모리,고베.pdf',
    '신한 금융플러스_썸머 페스티벌(이태리).pdf',
    '고은회 제주도.pdf',
    '신한금융플러스(푸꾸옥).pdf',
  ];
  /* 실제 요율표 키로 대조한다 — 흉내낸 목록으로는 이 검사가 의미가 없다. */
  const fs = require('fs');
  const vm = require('vm');
  const ctx = { window: {}, module: { exports: {} }, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8')
    + '\n;__KEYS = destinationRates.map(function (d) { return d.destination_key; });', ctx);
  const realKeys = ctx.__KEYS;
  ok('요율표 키를 읽었다', Array.isArray(realKeys) && realKeys.length > 30, String(realKeys && realKeys.length));

  let clash = [];
  CASES.forEach((f) => {
    const a = destFromName(f);
    const b = guessDest(f, '', realKeys);
    /* a가 「목적지 여러 곳」인데 b가 한 곳으로 단정하면 어긋난 것이다 */
    if (a.key === null && a.why === '목적지 여러 곳' && b.key !== null) {
      clash.push(f + ' — 역검증: 여러 곳 / 코퍼스: ' + b.key);
    }
  });
  ok('④ 한쪽이 「여러 곳」이라 한 것을 다른 쪽이 단정하지 않는다',
    clash.length === 0, clash.join(' · '));

  /* 그리고 문제의 그 파일은 **양쪽 다** 거부해야 한다 */
  const f = '글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf';
  ok('④ 실측 파일을 역검증이 거부한다', destFromName(f).key === null, JSON.stringify(destFromName(f)));
  ok('④ 실측 파일을 코퍼스도 거부한다', guessDest(f, '', realKeys).key === null,
    JSON.stringify(guessDest(f, '', realKeys)));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

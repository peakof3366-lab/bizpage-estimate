/* VC 검증: **파일명에 목적지가 없으면 본문을 본다 — 다만 조용히 틀리지 않는다**.

   왜 —
   역검증·교정표는 `destFromName`(파일명만)을 쓰는데, 코퍼스 45건 중 7건이 파일명에
   목적지가 없어 통째로 빠지고 있었다. 그런데 그중 둘은 본문이 분명히 말한다:

     (세부내역서) 한화손해보험 뉴퍼스트 …   본문 「다낭 국제공항 도착」 → 다낭
     2026 굿리치 일정표(확정)              본문 「연도대상(체코&오스트리아)」 → 동유럽

   그래서 본문 경로를 열었다. **여는 순간 세 가지가 함께 위험해진다** — 셋 다 실측으로
   확인했고, 여기서 고정한다:

   ① 파일명이 「여러 곳」이라 답한 것을 본문으로 넘겨 한쪽을 고르면, UZ에서 고친 사고
      (「대만, 푸꾸옥」이 푸꾸옥으로 심긴 것)가 그대로 되돌아온다.
      → **못 찾았을 때만** 본문을 본다. 거부는 못 찾은 것이 아니다.
   ② 「굿리치_재무분석 관리자 워크샵(**미야코지**)」 본문에는 **오키나와가 나온다**
      (같은 현이라 문서가 그렇게 쓴다). 본문을 읽으면 2026-08-13에 일부러 떼어낸
      그 오분류가 살아난다 — 그때 「오키나와가 원가보다 30.4% 싸다」의 원인이었다.
      → NEAR_MISS로 **고르지 않고 뺀다.**
   ③ **「공동경비」의 '동경'이 도쿄로 잡힌다.** 파일명으로 목적지를 못 정한 7건 중
      **5건**에 있다. 무서운 것은 「굿리치_마케팅임원 워크샵(**아오모리**)」다 —
      본문에 걸리는 것이 이 미끼 하나뿐이라 **「여러 곳」 안전망이 안 걸리고**,
      아오모리 견적서가 조용히 **도쿄로 세어진다.** 실제로 그 상태를 한 번 만들었다.

   ④ 그리고 **판정이 한 번만 일어나야 한다.** 역검증은 추출 결과를 캐시하는데 본문은
      캐시에 안 싣는다. 소비하는 쪽에서 다시 부르면 본문 없이 파일명만 보게 되어
      `--cache`일 때만 답이 달라진다(결함 생성기 ③ — VA에서 겪은 그 자리).

   실행: node ai-loop/test_vC_dest_from_text.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = path.join(ROOT, 'ai-loop');
const { destFromName, NEAR_MISS, BODY_DECOY_RE } = require(path.join(AI, '_dest_from_name.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('\n[1] 파일명이 먼저다 — 있으면 본문을 안 본다');
{
  /* 본문이 다른 말을 해도 파일명을 이긴다. 파일명은 이 회사의 관행이라 더 믿을 만하다. */
  const r = destFromName('신한 금융플러스(푸꾸옥).pdf', '다낭 국제공항 도착');
  ok('① 파일명 푸꾸옥이 본문 다낭을 이긴다', r.key === '푸꾸옥' && r.from === 'filename', JSON.stringify(r));
  ok('① 본문을 안 줘도 예전처럼 동작한다', destFromName('신한 금융플러스(푸꾸옥).pdf').key === '푸꾸옥');
}

console.log('\n[2] 파일명이 「여러 곳」이면 본문으로 넘어가지 않는다 (UZ 회귀)');
{
  /* 실측 파일 그대로. 본문에는 푸꾸옥이 또렷하게 나오지만, 파일명이 이미 **거부**했다.
     넘겨서 한쪽을 고르면 대만이 섞인 일정이 푸꾸옥 코스가 된다 — UZ가 고친 그 사고다. */
  const r = destFromName('글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf', '푸꾸옥 국제공항 도착 푸꾸옥 호텔');
  ok('② 「여러 곳」은 본문으로 구제되지 않는다', r.key === null && r.why === '목적지 여러 곳', JSON.stringify(r));
}

console.log('\n[3] 파일명에 없으면 본문이 답한다');
{
  const r1 = destFromName('(세부내역서) 한화손해보험 뉴퍼스트 26명 - 최종 260211 V2.pdf',
    '제1일 인천 OZ755 18:45 인천 국제공항 출발 02월 04일 다낭 21:45 다낭 국제공항 도착');
  ok('③ 뉴퍼스트를 다낭으로 본다', r1.key === '다낭' && r1.from === 'text', JSON.stringify(r1));

  /* 체코와 오스트리아는 **같은 요율 키(동유럽)**의 별칭이라 「여러 곳」이 아니다 */
  const r2 = destFromName('2026 굿리치 일정표(확정).pdf', '굿리치 RM 연도대상(체코&오스트리아) 프라하 도착');
  ok('③ 체코+오스트리아는 한 곳(동유럽)이다', r2.key === '동유럽', JSON.stringify(r2));
}

console.log('\n[4] 미끼 — 「공동경비」가 도쿄가 되지 않는다');
{
  /* ⚠ **이 무리가 가장 위험하다.** 미끼가 하나만 걸리면 「여러 곳」 안전망이 안 걸린다. */
  const aomori = destFromName('굿리치_마케팅임원 워크샵(아오모리).pdf',
    '아오모리 국제공항 도착 여행자 보험 인솔/가이드 공동경비 124,000');
  ok('④ 아오모리 문서가 도쿄로 세어지지 않는다', aomori.key === null, JSON.stringify(aomori));
  ok('④ 그리고 이유를 말한다', /요율표에 없는/.test(aomori.why || ''), aomori.why);

  /* 미끼를 지운 뒤에도 진짜 도쿄는 살아 있어야 한다 — 미끼 제거가 과녁까지 지우면 안 된다 */
  ok('④ 진짜 「동경」은 여전히 도쿄다',
    destFromName('연수 견적.pdf', '동경 나리타 공항 도착 후 호텔 이동').key === '도쿄');

  ok('④ 「세부금액」이 세부(Cebu)가 되지 않는다',
    destFromName('연수 견적.pdf', '지역 항목 세부금액 수량 DAY EXTRA').key === null);
  ok('④ 진짜 세부는 여전히 세부다',
    destFromName('연수 견적.pdf', '세부 막탄 리조트 체크인').key === '세부');
}

console.log('\n[5] 미야코지는 오키나와가 아니다 (2026-08-13 결정 유지)');
{
  const r = destFromName('굿리치_재무분석 관리자 워크샵(미야코지).pdf',
    '예정 호텔 : 힐튼 오키나와 미야코 아일랜드 리조트 미야코지마 도착');
  ok('⑤ 본문에 오키나와가 있어도 오키나와로 세지 않는다', r.key !== '오키나와', JSON.stringify(r));
  ok('⑤ 무엇 때문에 뺐는지 이름을 밝힌다', /미야코지/.test(r.why || ''), r.why);
  ok('⑤ NEAR_MISS가 비어 있지 않다 (검사가 헛돌지 않는다)', NEAR_MISS.length > 0);
}

console.log('\n[6] 본문에서 여러 곳이면 고르지 않는다');
{
  const r = destFromName('KS두레 VIP 워크샵.pdf', '다낭 도착 후 이동, 이튿날 홍콩으로 향발');
  ok('⑥ 본문 두 곳이면 뺀다', r.key === null && r.why === '목적지 여러 곳', JSON.stringify(r));
}

console.log('\n[7] 판정은 한 번만 — 역검증 캐시가 답을 들고 다닌다');
{
  const s = fs.readFileSync(path.join(AI, 'backtest_quotes.js'), 'utf8');
  ok('⑦ 추출할 때 본문까지 보고 판정해 캐시에 싣는다', /dest:\s*destFromName\(f,\s*r\.text\)/.test(s));
  ok('⑦ 소비하는 쪽은 캐시가 준 판정을 쓴다 (다시 부르지 않는다)', /c\.dest\s*\|\|\s*\{\}/.test(s));
  /* 판이 안 올라가면 옛 캐시에 dest가 없어 `--cache`일 때만 전건이 빠진다 */
  const v = (s.match(/const CACHE_VERSION = (\d+)/) || [])[1];
  ok('⑦ 캐시 판을 올렸다 (4 이상)', Number(v) >= 4, 'CACHE_VERSION=' + v);
}

console.log('\n[8] 코퍼스 도구가 전부 본문을 넘긴다 (한쪽만 고치면 답이 갈린다)');
{
  /* 주석 속 예시가 걸리지 않게 주석을 먼저 지운다 */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const ONE_ARG = /destFromName\(\s*[^,()]+\s*\)/g;
  const offenders = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && !f.startsWith('test_') && !f.startsWith('_'))
    .filter((f) => {
      const s = strip(fs.readFileSync(path.join(AI, f), 'utf8'));
      return /_corpus_files/.test(s) && ONE_ARG.test(s);
    });
  ok('⑧ 본문 없이 부르는 코퍼스 도구가 없다', offenders.length === 0,
    offenders.length ? '본문을 안 넘기는 도구: ' + offenders.join(' · ') : '');

  const users = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && !f.startsWith('test_') && !f.startsWith('_'))
    .filter((f) => {
      const s = fs.readFileSync(path.join(AI, f), 'utf8');
      return /_corpus_files/.test(s) && /destFromName\(/.test(s);
    });
  ok('⑧ 검사가 실제로 도구를 보고 있다 (헛돌지 않는다)', users.length >= 8, users.length + '개');
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

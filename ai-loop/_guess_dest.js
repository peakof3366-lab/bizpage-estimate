/* 파일 이름·본문 → 요율표 목적지 키 (UZ에서 build_corpus_db.js에서 떼어냈다).

   ⚠ **왜 떼어냈나.** 이 판정이 `build_corpus_db.js` 안에만 있어서 테스트할 수 없었고,
   그 사이 `_dest_from_name.js`(역검증이 쓰는 판정)와 **답이 갈렸다.** 실측:

       「글로벌 금융판매(다모아)_대만, 푸꾸옥.pdf」
         역검증  → 목적지 여러 곳 (제외)
         코퍼스  → 푸꾸옥        ← 파일명에서 「가장 긴 것」을 집었다

   그 결과 **대만이 섞인 일정이 푸꾸옥 공통 코스로 운영 DB에 심겼다.**
   판정을 두 곳에 두면 반드시 어긋난다(결함 생성기 ①) — 지금은 최소한 한 파일에 모아
   두고, `test_uZ_guess_dest.js`가 두 판정이 「여러 곳」에서 어긋나지 않는지 대조한다.

   ⚠ 두 판정을 하나로 합치지 **않은** 이유: 보는 표가 다르다.
     `_dest_from_name.js`는 **별칭 표**(북해도→삿포로)를 쓰고, 여기는 **요율표 키**를 쓴다.
     합치려면 별칭을 요율표에 얹는 설계 결정이 필요하다 — 지금 조용히 할 일이 아니다. */

/* 목적지 이름이 다른 낱말의 조각으로 들어 있는 것들. **먼저 지운다.**
   ⚠ 실측에서 「세부내역서」의 '세부'가 목적지 세부(Cebu)로 잡혀 아오모리 건과
     한화 다낭 건이 통째로 '세부'가 됐다 — 파일 이름과 본문 양쪽에서 났다. */
const DEST_DECOY_RE = /세부\s*내역서|세부\s*견적|손해보험|상해\s*보험|여행자\s*보험/g;

/* @param {string} file       파일 이름
   @param {string} text       문서 본문
   @param {string[]} destKeys 요율표 목적지 키 목록
   @returns {{key: string|null, from: 'filename'|'text'|'ambiguous'|'none', all?: string[]}} */
function guessDest(file, text, destKeys) {
  const keys = Array.isArray(destKeys) ? destKeys : [];
  const clean = (s) => String(s || '').replace(DEST_DECOY_RE, ' ');

  const hits = keys.filter((k) => clean(file).indexOf(k) >= 0);
  if (hits.length) {
    /* ⚠ **여러 곳이 걸리면 고르지 않는다.** 예전에는 「가장 긴 것」을 집었는데, 그 규칙은
       「제주」⊂「제주도」처럼 **한쪽이 다른 쪽의 조각일 때** 쓰라고 만든 것이다.
       서로 다른 두 목적지가 걸린 경우까지 그걸로 집으면 조용히 한쪽이 된다 —
       바로 아래 본문 경로는 같은 상황에서 이미 거부하고 있었다. */
    const longest = hits.slice().sort((a, b) => b.length - a.length)[0];
    const allPieces = hits.every((k) => k === longest || longest.indexOf(k) >= 0);
    if (allPieces) return { key: longest, from: 'filename' };
    return { key: null, from: 'ambiguous', all: hits.slice(0, 6) };
  }

  const inText = keys.filter((k) => clean(text).indexOf(k) >= 0);
  if (inText.length === 1) return { key: inText[0], from: 'text' };
  if (inText.length > 1) return { key: null, from: 'ambiguous', all: inText.slice(0, 6) };
  return { key: null, from: 'none' };
}

module.exports = { guessDest, DEST_DECOY_RE };

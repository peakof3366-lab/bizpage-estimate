/* 같은 **여행**을 두 번 세지 않는다 (VG)
   ───────────────────────────────────────────────────────────────────────────
   VA는 **같은 파일**을 두 번 세던 것을 잡았다(바이트 해시). 여기는 그 다음 층이다 —
   **파일은 다른데 같은 여행**인 경우다. 실측으로 나왔다:

       2026 굿리치 일정표(확정).pdf          동유럽 158명 6일 2026-04-04 입금가 4,569,397
       굿리치RM_연도대상 체코&오스트리.pdf     동유럽 158명 6일 2026-04-04 입금가 4,569,397

   한 여행을 두고 「일정표」와 「견적서」가 따로 온 것이다. 바이트가 다르니 VA는 통과하고,
   원가 기준 역검증에서 **15건 중 2건이 같은 줄**이 됐다(둘 다 +0.1%, 사분위 경계에 있다).
   ⚠ 그리고 VC로 본문까지 목적지를 읽기 시작하면서 **칸별 실측 표에서도 동유럽이
     「견적서 2건」**이 된다 — 「⚠표본1」 경고가 거짓으로 사라지는 자리다.
     표본이 30건대라 한 건이 중앙값을 움직인다. 빈칸보다 틀린 값이 위험하다(VA와 같은 이유).

   ⚠ **차수별 견적을 지우면 안 된다.** 코퍼스에 상하이 11/08·11/15·11/22가 있고
     항공료만 다르다 — 진짜 데이터다. SY에서 점수제로 그 함정을 이미 한 번 밟았다.
     그래서 판정은 **점수가 아니라 규칙**이고, 열쇠에 **출발일**을 넣는다.
     차수별은 출발일이 다르므로 절대 뭉쳐지지 않는다.

   ⚠ 열쇠에 **파일 이름을 넣지 않는다.** 이름이 다른 것이 바로 이 문제의 출발점이다.

   ⚠ 남기는 것은 **먼저 온 것**이다(목록 순서 = 이름 순). 두 번 돌려도 같은 것이 남아야
     전/후 대조가 흔들리지 않는다.
   ⚠ 뺀 것이 있으면 **부르는 쪽이 반드시 말한다** — 조용히 줄어든 표본은 「원래 그랬다」로
     읽힌다(결함 생성기 ②). 그래서 이 함수는 `dropped`를 함께 돌려준다. */

/* 한 여행을 가리키는 열쇠. 하나라도 비면 null — **모르는 것끼리 묶지 않는다.**
   (전부 null인 두 문서가 「같은 여행」으로 뭉치면 그게 더 큰 사고다.) */
function tripKey(t) {
  const parts = [t && t.dest, t && t.pax, t && t.days, t && t.date, t && t.answer];
  if (parts.some((p) => p == null || p === '' || p === 0)) return null;
  return parts.join('|');
}

/* @param {Array} items 재는 대상
   @param {Function} pick (item) => {dest, pax, days, date, answer}
   @returns {{kept: Array, dropped: Array<{key, keptFile, dropFile}>}} */
function dedupeTrips(items, pick) {
  const seen = new Map();
  const kept = [];
  const dropped = [];
  (items || []).forEach((it) => {
    const t = pick(it) || {};
    const k = tripKey(t);
    if (k == null) { kept.push(it); return; }      /* 판정할 수 없으면 남긴다 */
    if (seen.has(k)) {
      dropped.push({ key: k, keptFile: seen.get(k), dropFile: t.file || '' });
      return;
    }
    seen.set(k, t.file || '');
    kept.push(it);
  });
  return { kept, dropped };
}

/* 부르는 쪽이 그대로 찍으면 되는 문장. **뺀 것이 없으면 아무 말도 하지 않는다.** */
function droppedNote(dropped) {
  if (!dropped || !dropped.length) return '';
  const lines = ['⚠ 같은 여행이 문서 두 벌로 들어와 ' + dropped.length + '건을 뺐습니다'
    + ' (파일은 다르지만 목적지·인원·일수·출발일·금액이 같습니다):'];
  dropped.forEach((d) => {
    lines.push('   · ' + String(d.dropFile).slice(0, 52) + '  ← ' + String(d.keptFile).slice(0, 52) + ' 와 같은 여행');
  });
  return lines.join('\n');
}

module.exports = { tripKey, dedupeTrips, droppedNote };

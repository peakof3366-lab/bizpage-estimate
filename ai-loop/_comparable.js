/* ═══════════════════════════════════════════════════════════════════════════
   **이 견적서를 엔진과 대조할 수 있는가** — 판정 단일 출처 (VL)
   ───────────────────────────────────────────────────────────────────────────
   역검증(`backtest_quotes.js`)이 표본 36건을 고르는 규칙이 그 파일 루프 안에 있었다.
   칸별 오차 분해(`audit_error_decomp.js`)도 **같은 36건**을 봐야 한다 —
   표본이 다르면 「분해한 합」과 「역검증의 오차」가 서로 다른 이야기를 하게 되고,
   그 어긋남은 숫자만 봐서는 못 잡는다(결함 생성기 ①의 가장 비싼 형태).

   그래서 판정을 여기 한 곳에 두고 둘 다 파생한다.

   ⚠ **엔진은 여기서 돌리지 않는다.** 이 파일은 「대조할 수 있는가」까지만 답한다.
     엔진 예외·금액 없음은 도구마다 처리가 다르다(하나는 건너뛰고 하나는 크래시가 맞다).

   ⚠ **왜 뺐는지를 문장으로 남긴다**(VE). 「불명」만 찍으면 코드가 고칠 것과 사람이
     한 칸 넣으면 되는 것이 같은 얼굴이 된다 — 실제로 그 표시를 보고 영영 못 읽는
     문서를 고치려 든 적이 있다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 정답지 — 판매가(기본)인가 우리 원가(입금가)인가. 섞지 않는다 (SC). */
function answerOf(c, basis) {
  return basis === 'cost' ? c.deposit : c.perPerson;
}

/* 왜 정답지를 못 얻었는가 — 셋으로 가른다. ③만 코드가 고칠 몫이다 (VE). */
function whyNoAnswer(c, basis) {
  if (basis === 'cost') return '「입금가」가 없음 (원가 시트가 아니다 — 고객용 견적서로 보인다)';
  if (c.deposit) {
    return '원가 시트라 판매가가 없다 (입금가 ' + Number(c.deposit).toLocaleString()
      + ' — `--basis=cost`로는 잰다)';
  }
  if (c.needsFx && c.needsFx.currency) {
    return '외화(' + c.needsFx.currency + ' ' + c.needsFx.rowCount
      + '줄)인데 문서에 환율이 없다 — 사람이 한 칸 (결정대기열 0-f)';
  }
  return '견적서에서 1인당 금액을 못 읽음';
}

/* 캐시 한 행 → 대조 가능 여부.
   반환: { ok:true, dest, pax, days, date, actual, conflict } | { ok:false, why } */
function comparable(c, basis) {
  const B = basis === 'cost' ? 'cost' : 'sell';
  if (c.error) return { ok: false, why: '추출 오류: ' + c.error };

  /* ⚠ **캐시가 준 판정을 그대로 쓴다.** 여기서 `destFromName(c.file)`을 다시 부르면
     본문이 없어 파일명만 보게 되고, 추출할 때와 캐시를 쓸 때의 답이 갈린다(VC). */
  const { key, why } = c.dest || {};
  if (!key) return { ok: false, why: why || '목적지 판정 없음(캐시가 낡았다)' };

  const actual = answerOf(c, B);
  if (!actual) return { ok: false, why: whyNoAnswer(c, B) };

  if (!c.pax || c.pax < 2) return { ok: false, why: '인원 불명' };

  const days = (c.dates && (c.dates.days || (c.dates.nights ? c.dates.nights + 1 : 0))) || 0;
  const dw = (c.dates && c.dates.departWhy) || null;
  if (!days) return { ok: false, why: dw ? '일수 불명 — ' + dw : '일수 불명(출발·도착일이 없음)' };

  /* 출발일이 없으면 시즌 계수를 못 맞춘다 — 그 대조는 계절 오차를 엔진 오차로 오해하게 한다 */
  if (!c.dates.departDate) {
    return { ok: false, why: dw ? '출발일 불명 — ' + dw : '출발일 불명(시즌 계수를 맞출 수 없음)' };
  }

  /* UU: 문서의 총계 ÷ 1인당이 딱 떨어지는데 우리가 읽은 인원과 다르면 대조하지 않는다.
     인원은 규모 계수로 금액에 들어가므로, 틀린 인원으로 잰 오차는 엔진 오차로 둔갑한다.
     ⚠ 조용히 빼지 않는다 — **문서 계산이 몇 명인지까지 적어** 사람이 한 칸 확인하면
       바로 표본이 되게 한다(빈칸보다 틀린 값이 위험하다는 원칙 그대로다). */
  if (c.paxConflict) {
    return { ok: false, why: '인원 어긋남 — 우리가 읽은 ' + c.paxConflict.docPax
      + '명 vs 문서 계산 ' + c.paxConflict.impliedPax + '명 (총계 ÷ 1인당)' };
  }

  /* 문서가 스스로 모순된 기간을 적은 건 — **빼지 않고 표시만 한다.**
     처음엔 뺐다가 되돌렸다. 7건이 걸렸는데 전부 같은 모양이었고(제목이 날짜보다 1박 적다),
     열어 보니 **틀린 쪽은 언제나 제목**이었다. 날짜 범위가 더 구체적인 증거이므로 그쪽을
     쓰되 ⚠로 남긴다 — 7건을 버리면 표본이 15→8로 줄어 분포가 더 흔들린다. */
  return {
    ok: true,
    dest: key,
    pax: c.pax,
    days,
    date: c.dates.departDate,
    actual,
    conflict: c.dates.nightsConflict || null,
  };
}

module.exports = { comparable, answerOf, whyNoAnswer };

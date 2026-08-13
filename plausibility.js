/* ═══════════════════════════════════════════════════════════════════════════
   추출값 타당성 판정 한 곳 (SO) — **화면과 감사기가 같은 잣대를 쓴다**

   왜 파일을 따로 뒀는가 — 타당성 판정이 `ai-loop/audit_extract_sanity.js` 안에만 있었다.
   그건 **코퍼스를 한 번에 훑는 개발 도구**라, 담당자가 견적서를 한 장 올릴 때는 아무
   판정도 하지 않았다. 사장님 지시(2026-08-10): 「앞으로 업데이트되는 **모든 견적서**에서
   숫자가 타당한지 함께 검토되게 할 것.」
   그렇다고 화면에 같은 규칙을 다시 적으면 **반드시 어긋난다**(결함 생성기 ①) —
   `limits.js`가 만들어진 이유와 똑같다. 그래서 값을 아는 곳을 여기 하나로 둔다.
     - 브라우저: <script src="plausibility.js"> → 전역 PLAUSIBILITY
     - Node:     require('../plausibility')

   ⚠ **기준은 반드시 그 지역 것이어야 한다**(대표 지시). 지역마다 비용이 천차만별이라
     전 목적지를 한 통에 넣고 재면 비싼 지역이 통째로 '이상값'이 된다.
     같은 '가이드 일당'이라도 발리 99,000과 시드니 400,000이 둘 다 정상이다.

   기준은 위에서부터 있는 것을 쓴다:
     ① **같은 목적지의 기존 실측 중앙값** — 쌓일수록 정확해지는 진짜 기준
     ② **그 목적지의 현재 기준가**(요율표/오버라이드) — 아직 실측이 없을 때의 출발점
     ③ 둘 다 없으면 **판단하지 않는다.** 그 지역 첫 견적서는 그 자체가 기준선이 된다.

   ⚠ **판정이 아니라 「확인해 보세요」다.** 성수기·등급·인원 규모로 실제로 벌어진다.
     사람이 볼 자리를 좁혀 줄 뿐, 값을 고치거나 막지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  /* 같은 지역 실측과 이 배수 넘게 벌어지면 확인 대상. 같은 목적지·같은 항목이라도
     성수기·등급으로 2배까지는 실제로 벌어지므로 그보다 넉넉히 잡는다. */
  var PEER_SPREAD = 2.5;
  /* 기준가와 이 배수 넘게 벌어지면 확인 대상. 기준가는 '평시 기준'이라 실제 견적이
     1.5~2배가 되는 것은 흔하다 — 그보다 확실히 벌어질 때만 말한다. */
  var RATE_SPREAD = 3;
  /* 동료가 최소 둘은 있어야 중앙값이 뜻을 갖는다(둘이 다르면 누가 이상한지 알 수 없다) */
  var MIN_PEERS = 2;

  /* ⚠ **검산 안 된 값은 기준을 만들지 못한다.** 화면이 그런 값에 「검산 안 됨」 배지를
     붙여 확인을 요청하는데, 그것을 기준에 넣으면 **화면과 판정이 서로 다른 말을 한다.**
     실측(카자흐스탄 가이드): 「$1,100 1 1 **전일정**」이 전 일정 총액인데 일당 자리에
     들어가 1,606,000이 됐고, 그 하나가 중앙값을 끌어올려 요율표 대비 +352%가 나왔다.
     검산된 값만 쓰면 345,000(+60%)이다 — 전혀 다른 결론이다.
     ⚠ 다만 **재는 대상은 전부**다. 검산 안 된 값도 오독일 수 있으니 봐야 한다.
        자(기준)와 재는 대상은 다른 문제다. */
  var TRUSTED_VIA = ['rule', 'calc', 'doc'];

  function isTrusted(via) { return TRUSTED_VIA.indexOf(String(via || '')) >= 0; }

  /* 사람이 넣었거나 눈으로 확인한 값 — 추출기의 신뢰도와 **무관하게** 반영한다.
       manual    직접 입력 방식으로 담당자가 친 값
       confirmed 견적서를 보고 그 자리에서 확정한 값(SW) 또는 「확인 필요」 목록에서 확정(SX)
     ⚠ 이걸 TRUSTED_VIA에 합치면 안 된다. TRUSTED_VIA는 「**추출기**가 검산했는가」를
       재는 자라, 감사기가 추출 품질을 잴 때 사람 손이 섞이면 숫자가 거짓이 된다. */
  var HUMAN_VIA = ['manual', 'confirmed'];
  function isHuman(via) { return HUMAN_VIA.indexOf(String(via || '')) >= 0; }

  /* ── 이 값을 **실측으로 반영해도 되는가** (2026-08-12 대표 지시) ──────────────
     「PDF 제출 시 정확한 값을 찾지 못한 경우에는 반영이 안 되도록 해 달라」.
     대표 방침과 같은 방향이다 — **빈칸은 다음 견적서가 채우지만, 틀린 값은 요율에 얹혀
     고객이 보는 금액이 된다**(2026-08-10). 일괄 투입이라 사람이 모든 칸을 볼 수 없다.

     반영하지 않는 것:
       unchecked  수량·횟수가 없어 곱셈 검산이 안 된 줄 — 1인 단가인지 전 일정 총액인지 모른다
       ai         규칙이 못 채워 AI가 고른 값
       fallback   표 좌표를 못 읽어 예전 방식으로 물러난 값
     ⚠ **버리는 게 아니라 평균에서 빼는 것이다.** 값은 그대로 저장되고, 담당자가 확인하면
       그 자리에서 되살아난다(조용히 버리지 않는다 — 이 저장소의 규칙).
     ⚠ 출처를 **모르는** 값은 빼지 않는다. 옛 제보(SX 이전)는 field_sources가 비어 있어
       모두 빠져 버리고, 그러면 그때 넣은 것이 통째로 사라진다(화면의 기존 판단과 같다). */
  function countsAsMeasured(via) {
    var v = String(via || '');
    if (!v) return true;                    /* 출처를 모른다 — 옛 제보를 지우지 않는다 */
    return isTrusted(v) || isHuman(v);
  }

  /* ── **자동으로 뺐다**는 표시 (TI) ──────────────────────────────────────────
     `excluded_fields`에는 성격이 다른 두 가지가 섞인다:
       · **사람이 사유를 적어 뺀 것**(SU) — 심천 호텔처럼 「값은 맞지만 다른 도시 것」.
         이미 사람이 판단했으므로 확정해도 평균에 돌아오면 안 되고, 「확인 필요」
         목록에도 뜨면 안 된다.
       · **자동으로 뺀 것**(TI) — 아직 **아무도 안 본** 값이다. 「확인 필요」 목록에
         반드시 남아야 하고, 담당자가 확정하면 그 자리에서 되살아나야 한다.
     둘을 못 가르면 자동 제외가 **되살릴 길이 없는 삭제**가 된다.

     ⚠ 이 표시가 서버와 화면에 각각 적히면 한쪽만 고쳤을 때 영영 안 풀린다.
       그래서 잣대와 **같은 파일**에 둔다(limits.js·countsAsMeasured와 같은 이유). */
  var AUTO_EXCLUDE_MARK = '[자동] ';
  function isAutoExcluded(reason) {
    return String(reason || '').indexOf(AUTO_EXCLUDE_MARK) === 0;
  }

  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* 값 하나를 판정한다.
       value    잰 값 (원화)
       peers    같은 목적지의 기존 실측값들 (원화, **오늘 환율 기준으로 되돌린 것**)
       rateBase 그 목적지의 현재 기준가 (없으면 0/null)
     반환 { level, basis, ref, ratio, high }
       level 'ok'    기준 안이다
             'check' 기준과 크게 벌어졌다 — 사람이 확인할 자리
             'none'  기준이 없어 판단하지 않았다(그 지역 첫 견적서) */
  function judge(value, peers, rateBase) {
    var v = Number(value);
    if (!isFinite(v) || v <= 0) return { level: 'none', why: '값이 없습니다' };
    var list = (peers || []).map(Number).filter(function (n) { return isFinite(n) && n > 0; });
    var ref = 0, basis = '', spread = 0;
    if (list.length >= MIN_PEERS) {
      ref = median(list); basis = 'peers'; spread = PEER_SPREAD;
    } else if (Number(rateBase) > 0) {
      ref = Number(rateBase); basis = 'rate'; spread = RATE_SPREAD;
    } else {
      return { level: 'none', why: '이 지역의 첫 견적서라 견줄 기준이 없습니다' };
    }
    var ratio = v > ref ? v / ref : ref / v;
    return {
      level: ratio >= spread ? 'check' : 'ok',
      basis: basis, ref: ref, ratio: ratio, high: v > ref, peerCount: list.length,
    };
  }

  /* ── SV: 「전 일정 총액이 1일 단가 자리에 왔는가」 ─────────────────────────
     실측(신한 이태리): 「차량 8,848,000 × 3대 × 1」은 **검산을 통과**하지만 8,848,000은
     하루치가 아니라 **버스 한 대의 전 일정(6일) 총액**이다. 6으로 나누면 1,474,667로
     요율표 1,400,000과 ±5% 안에 들어온다. 가이드도 2,528,000 → 421,333 vs 435,000.
     그대로 두면 +532% · +481%로 나간다.

     ⚠ **동료 비교로는 못 잡는다.** 그 지역 첫 견적서면 동료가 없어 ⚪로 통과하고
       **그 값이 그대로 기준선이 된다.** 그래서 요율표만 있으면 되는 이 검사가 따로 필요하다.
     ⚠ **기간을 이미 곱한 줄은 건드리지 않는다**(duration.covered). 뉴퍼스트 다낭의
       「797,500 × 1 × 4」는 4가 곧 일수라 797,500이 진짜 1일 단가다 — 또 나누면 망가진다.
     ⚠ **고치지 않는다. 묻는다.** 나눗셈이 틀리는 경우가 실제로 있었다(몫이 개수가 아니라
       환율이었던 사고). 화면은 「일수로 나눌까요?」를 묻고 사람이 누른다.

       value    잰 값 (1일 단가 자리에 들어온 원화)
       rateBase 그 목적지의 1일 기준가
       duration pdf_extract가 남긴 { days, covered } — 없으면 판단하지 않는다
     반환 null(해당 없음) 또는 { days, perDay, ratioNow, ratioIfSplit } */
  /* 지금 값이 기준가의 이 배수를 넘을 때만 의심한다 — 평범하게 비싼 값을 건드리지 않는다 */
  var TRIP_TOTAL_MIN_RATIO = 3;
  /* 나눈 값이 기준가의 이 범위 안에 들어와야 「나누니 맞는다」고 말한다 */
  var TRIP_TOTAL_OK_LOW = 0.5;
  var TRIP_TOTAL_OK_HIGH = 2;
  function judgeTripTotal(value, rateBase, duration) {
    var v = Number(value); var base = Number(rateBase);
    if (!isFinite(v) || v <= 0 || !(base > 0)) return null;
    if (!duration || duration.covered !== false) return null;   /* 기간을 이미 곱했거나 모른다 */
    var days = Number(duration.days);
    if (!(days >= 2)) return null;
    var ratioNow = v / base;
    if (ratioNow < TRIP_TOTAL_MIN_RATIO) return null;
    var perDay = v / days;
    var ratioIfSplit = perDay / base;
    if (ratioIfSplit < TRIP_TOTAL_OK_LOW || ratioIfSplit > TRIP_TOTAL_OK_HIGH) return null;
    return { days: days, perDay: perDay, ratioNow: ratioNow, ratioIfSplit: ratioIfSplit };
  }

  function describeTripTotal(res, fieldLabel) {
    if (!res) return '';
    return fieldLabel + '이(가) 기준가의 ' + res.ratioNow.toFixed(1) + '배인데, '
      + res.days + '일로 나누면 ' + Math.round(res.perDay).toLocaleString() + '원으로 기준가에 맞습니다'
      + ' — **전 일정 총액**이 1일 단가 자리에 들어온 것으로 보입니다. 확인해 주세요.';
  }

  /* 화면에 그대로 쓸 한 줄 — 문구를 화면마다 다시 짓지 않게 여기서 만든다. */
  function describe(res, fieldLabel) {
    if (!res || res.level !== 'check') return '';
    var what = res.basis === 'peers'
      ? '이 목적지 기존 실측 ' + res.peerCount + '건의 중앙값'
      : '이 목적지 기준가';
    return fieldLabel + '이(가) ' + what + '(' + Math.round(res.ref).toLocaleString() + '원)의 ' +
      res.ratio.toFixed(1) + '배' + (res.high ? '입니다' : ' 아래입니다') +
      ' — 값을 확인해 주세요.';
  }

  var API = {
    PEER_SPREAD: PEER_SPREAD, RATE_SPREAD: RATE_SPREAD, MIN_PEERS: MIN_PEERS,
    TRUSTED_VIA: TRUSTED_VIA, isTrusted: isTrusted, median: median,
    /* 실측으로 반영해도 되는가 — 서버(저장 시 자동 제외)와 화면이 같은 잣대를 쓴다 */
    HUMAN_VIA: HUMAN_VIA, isHuman: isHuman, countsAsMeasured: countsAsMeasured,
    /* 자동으로 뺀 것인가 — 서버(되살리기)와 화면(확인 필요 목록)이 같은 표시를 본다 */
    AUTO_EXCLUDE_MARK: AUTO_EXCLUDE_MARK, isAutoExcluded: isAutoExcluded,
    judge: judge, describe: describe,
    /* SV: 「전 일정 총액이 1일 단가 자리에」 — 차량·가이드에만 쓴다 */
    TRIP_TOTAL_MIN_RATIO: TRIP_TOTAL_MIN_RATIO,
    PER_DAY_FIELDS: ['vehicle', 'guide'],
    judgeTripTotal: judgeTripTotal, describeTripTotal: describeTripTotal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PLAUSIBILITY = API;
})(typeof window !== 'undefined' ? window : this);

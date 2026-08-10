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
    judge: judge, describe: describe,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PLAUSIBILITY = API;
})(typeof window !== 'undefined' ? window : this);

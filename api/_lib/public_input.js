/* 공개(비인증) POST 본문 검증 공용 모듈.

   /api/quotes · /api/inquiries · /api/quote-shares는 고객 브라우저가 인증 없이
   호출하는 엔드포인트다. 지금까지 이 셋은 받은 본문을 사실상 그대로 DB에 넣었고,
   그 중 id는 관리자 화면에서 onclick 속성 안에 이스케이프 없이 보간됐다.
   그래서 익명 제출자가 넣은 문자열이 로그인한 관리자의 세션에서 실행될 수 있었다
   (2026-07-29 jsdom으로 재현 확인. 운영 데이터 26건은 전부 정상이라 악용 흔적은 없었다).

   화면 쪽에서도 막지만(admin.html safeId), 서버가 애초에 이상한 id를 저장하지 않는
   것이 근본 방어선이다 — 화면은 앞으로도 여러 곳에서 이 값을 쓰게 되고, 그때마다
   이스케이프를 기억해야 하는 구조는 언젠가 샌다. */

/* 클라이언트(script.js)가 만드는 id는 Date.now().toString(36) + 랜덤 영숫자다.
   그 형태만 허용하고, 벗어나면 조용히 서버 생성 id로 대체한다 — 400으로 거절하면
   고객 문의가 통째로 유실되므로, 리드는 살리고 id만 안전한 값으로 바꾼다. */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* 클라이언트가 보낸 id를 신뢰할 수 있을 때만 그대로 쓴다(같은 id 재전송 =
   네트워크 재시도이므로 on conflict do nothing 멱등성이 계속 동작한다). */
function safeId(raw) {
  return (typeof raw === 'string' && SAFE_ID_RE.test(raw)) ? raw : newId();
}

/* 본문 크기 상한 — 인증이 없으므로 누구든 반복 호출할 수 있다. Vercel이 요청 하나의
   크기는 막아 주지만 누적 저장량은 막아 주지 않는다. 견적 공유 payload가 실측 3.4KB라
   64KB면 정상 사용에는 한참 여유가 있다. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

function payloadTooLarge(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload || {}), 'utf8') > MAX_PAYLOAD_BYTES;
  } catch {
    return true; // 순환 참조 등 직렬화 불가 = 정상 제출이 아님
  }
}

/* 관리자 화면이 숫자로 다루는 필드가 문자열로 들어오면 화면에서 그대로 출력된다
   (fmt()의 toLocaleString은 문자열에 대해 원문을 돌려준다). 저장 시점에 숫자로
   못 박아 화면이 무엇을 받든 숫자만 보게 한다. */
function toNumberOrNull(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
}

/* 자유 입력 문자열(이름·연락처·메시지 등) — 길이만 자른다. HTML 이스케이프는
   출력하는 쪽 책임이라 여기서 하지 않는다(저장값을 변형하면 원문이 사라진다). */
function trimText(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : null;
}

module.exports = { SAFE_ID_RE, newId, safeId, payloadTooLarge, toNumberOrNull, trimText, MAX_PAYLOAD_BYTES };

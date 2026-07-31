/* 방문/이벤트 수집(site_events)의 단일 진실 (PZ).

   예전엔 "어떤 이벤트를 수집하는가"가 세 곳에 따로 적혀 있었다 —
   `api/track.js`의 ALLOWED_NAMES(수집 허용), `api/admin/insights.js`의
   CLICK_EVENT_NAMES(집계), `admin.html`의 btnMap(화면 라벨).
   그래서 `consult_request`가 **수집 목록에만 있고 집계·화면에는 없어서**,
   상담 신청 클릭이 DB에 쌓이기만 하고 아무도 볼 수 없는 지표였다.
   퍼널에서 리드 직전 단계라 제일 보고 싶은 축인데 통째로 빠져 있었다
   (결함 생성기 ① — 목록이 여러 곳에 흩어져 하나를 빠뜨린다).

   서버 두 곳(track·insights)은 이 파일에서 파생한다. `admin.html`은 브라우저라
   이 모듈을 읽을 수 없어 라벨 사본이 남는데, `ai-loop/test_pZ_site_events.js`가
   원문 대조로 어긋남을 잡는다(CLAUDE.md: 불가피하게 나뉘면 테스트로 대조한다). */
const destinationRates = require('../../data');

/* click:true = admin.html "버튼 클릭 통계"에 세로로 나열되는 이벤트.
   pageview·dest_select는 클릭이 아니라 각각 방문 추이·연수지 TOP N으로 따로 쓴다. */
const EVENT_DEFS = [
  { name: 'pageview',          label: '페이지 방문',               click: false },
  { name: 'header_cta',        label: '상단 "1분 견적 받기" 버튼', click: true },
  { name: 'estimate_step2',    label: '견적 계산기 → 2단계 이동',  click: true },
  { name: 'estimate_complete', label: '견적 확인 완료',            click: true },
  { name: 'kakao',             label: '카카오톡 상담 버튼',        click: true },
  { name: 'consult_request',   label: '상담 신청 제출',            click: true },
  { name: 'dest_select',       label: '연수지 선택',               click: false },
];

const ALLOWED_NAMES = new Set(EVENT_DEFS.map((d) => d.name));
const CLICK_EVENT_NAMES = EVENT_DEFS.filter((d) => d.click).map((d) => d.name);
const EVENT_LABELS = Object.fromEntries(EVENT_DEFS.map((d) => [d.name, d.label]));

/* 내장 목적지 키 — 커스텀 목적지는 DB에 있으므로 호출부가 합쳐서 넘긴다. */
const BUILTIN_DEST_KEYS = new Set(destinationRates.map((d) => d.destination_key));

/* meta 크기 상한. /api/track은 인증이 없어 누구든 반복 호출할 수 있는데,
   `public_input.js`의 64KB 상한은 quotes·inquiries·quote-shares 셋에만 걸려 있고
   이 넷째 공개 엔드포인트만 밖에 있었다(그 파일 주석도 셋만 열거한다).
   정상 meta는 `{"dest":"방콕"}` 수준이라 실측 23바이트 — 2KB면 한참 여유다. */
const MAX_META_BYTES = 2 * 1024;

/* 목적지 키 길이 상한. 정상값은 index.html select의 option value라 짧다.
   DB 조회가 실패해 화이트리스트를 못 쓸 때의 최후 방어선이다. */
const MAX_DEST_LENGTH = 60;

function metaTooLarge(meta) {
  try {
    return Buffer.byteLength(JSON.stringify(meta || {}), 'utf8') > MAX_META_BYTES;
  } catch {
    return true; // 순환 참조 등 직렬화 불가 = 정상 수집이 아님
  }
}

/* 받은 meta를 **화이트리스트로 재구성**한다. 원본을 그대로 저장하지 않는다.

   ⚠ 모르는 목적지는 `{}`로 떨어뜨리지 않고 400으로 거절한다. 빈 meta로 저장하면
   dest_select 건수만 늘고 목적지는 사라지는 **조용한 폴백**이 된다(결함 생성기 ②).
   통계 이벤트는 리드와 달리 한 건 유실이 손해가 아니므로 거절이 정직하다.

   knownDestKeys가 null = 커스텀 목적지 조회 실패. 이때는 형식만 보고 통과시키되
   `destUnverified: true`를 남긴다 — 확인하지 못했다는 사실 자체를 데이터에 적는다. */
function normalizeMeta(name, meta, knownDestKeys) {
  if (name !== 'dest_select') return { ok: true, meta: {} };

  const dest = meta && typeof meta === 'object' ? meta.dest : undefined;
  if (typeof dest !== 'string' || !dest.trim()) return { ok: false, error: 'invalid_dest' };
  if (dest.length > MAX_DEST_LENGTH) return { ok: false, error: 'invalid_dest' };

  if (knownDestKeys === null) return { ok: true, meta: { dest, destUnverified: true } };
  if (!knownDestKeys.has(dest)) return { ok: false, error: 'unknown_dest' };
  return { ok: true, meta: { dest } };
}

module.exports = {
  EVENT_DEFS,
  ALLOWED_NAMES,
  CLICK_EVENT_NAMES,
  EVENT_LABELS,
  BUILTIN_DEST_KEYS,
  MAX_META_BYTES,
  MAX_DEST_LENGTH,
  metaTooLarge,
  normalizeMeta,
};

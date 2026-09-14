/* ═══════════════════════════════════════════════════════════════════════════
   관리자 화면 공용 선언 — 화면 여럿이 같이 쓰는 것만 (구조 정리 2b-1a)

   ■ 🔴 여기에는 **선언만** 둔다. 실행문을 넣지 말 것.
     이 파일은 admin.html의 인라인 <script> **바로 앞**에서 로드된다. 그 자리는
     본문 마크업 **뒤**라서 document.getElementById가 돌긴 하지만, 여기서 화면을
     건드리기 시작하면 「무엇이 언제 도는가」가 두 파일로 갈린다. 초기화는 2b-1b에서
     따로 다룬다(admin.html 안에 최상위 실행문이 74개 있다 — 전부 DOM에 걸려 있다).

   ■ 왜 「문서 최상단」이 아닌가
     <head>로 올리면 admin.html의 실행문들이 마크업보다 먼저 돌아 null로 즉사한다.
     9/9에 정한 「로드 순서 최상단」은 **쪼갠 파일들 중 첫 번째**라는 뜻이다.

   ■ 옮겨도 되는 것의 기준 (2b-2·2b-3에서 늘릴 때도 이 기준)
     선언 시점에 **admin.html 안의 함수를 부르지 않는 것**만 옮긴다.
     · 리터럴·화살표 함수는 안전하다(몸통은 나중에 돈다).
     · `destFieldMap()`처럼 **먼저 로드되는 파일**(data.js)의 함수는 불러도 된다.
     · admin.html에 정의된 함수를 부르는 선언은 **아직 못 옮긴다** — 그 화면과 함께 간다.

   ■ 검사가 따라오는 자리
     `ai-loop/_admin_source.js`의 ADMIN_PARTS. 조각을 늘리면 여기 한 줄을 늘린다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ── 상수 — KEYS ── */
  /* ════ CONSTANTS ════ */
  const KEYS = {
    contacts:  'linkedt_contacts',
    visits:    'linkedt_visits',
    events:    'linkedt_events',
    dest:      'linkedt_dest_stats',
    est:       'linkedt_estimates',
    estFull:   'linkedt_estimates_full',
    /* 방문 원본 행은 서버가 최근 3,000건까지만 보낸다(PZ). 그 상한에 걸렸는지와
       실제 전체 건수를 여기 따로 담는다 — 예전엔 visits.length를 "전체 방문"으로
       그대로 썼기 때문에 3,000을 넘는 순간 숫자가 조용히 멈췄다. */
    visitMeta: 'linkedt_visit_meta',
  };

  /* ── 로그인 계정(멀티유저) ────────────────────────────────────────────
     예전엔 전 직원이 같은 관리자 로그인을 공유해서, "지금 이 브라우저를 쓰는
     사람이 누구인지"를 매번 자기선택하는 위젯(STAFF_LIST + localStorage)으로
     때웠다 — 클라이언트가 아무 이름이나 자칭할 수 있어 위조 가능했음. 이제는
     로그인 자체가 개인별 계정이라 서버가 세션에서 검증한 진짜 신원을 그대로
     쓴다. currentUser는 showDash()에서 /api/admin/account?action=me로,
     staffListCache는 같은 시점에 ?action=staffList로 채운다(담당자 배정
     드롭다운용 — 누구에게 배정할지 고르는 것이지 "내가 누구인지"가 아니므로
     여전히 선택 UI가 필요함). */

  /* ── 화면 상태 · 공용 도구 ── */
  const PAGE_SIZE  = 15;

  /* ════ STATE ════ */
  let currentFilter = 'all';
  let currentPage   = 1;
  let searchQuery   = '';
  let currentModalId = null;
  let currentTab    = 'dashboard';

  /* ════ HELPERS ════ */
  const get  = (k) => { try { return JSON.parse(localStorage.getItem(k) || (Array.isArray([]) ? '[]' : 'null')) || []; } catch { return []; } };
  const getO = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
  const set  = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const esc  = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* 레코드 id 전용 살균 (신규) — 문의·견적 id는 onclick="openDetail('${id}')" 같은
     인라인 핸들러 안으로 들어간다. 이 자리는 esc()로 못 막는다: esc()는 홑따옴표를
     안 바꾸고, 설령 &#39;로 바꿔도 HTML 파서가 다시 '로 되돌린 뒤 JS가 해석하므로
     문자열을 그대로 탈출한다. 그래서 이스케이프가 아니라 '안전한 문자만 남기기'로
     간다 — id는 원래 영숫자뿐이라 정상 값은 아무 영향이 없다.

     왜 필요했나: /api/quotes·/api/inquiries POST는 인증 없이 누구나 호출할 수 있고
     예전엔 payload.id를 검증 없이 저장했다. 즉 익명 제출자가 넣은 문자열이 로그인한
     관리자의 세션에서 실행됐다(2026-07-29 jsdom 재현 확인). 서버에서도 막았지만
     (api/_lib/public_input.js), 화면은 앞으로도 이 값을 여기저기 쓰게 되므로
     양쪽 다 건다. ⚠ id를 템플릿에 넣을 때는 반드시 이 함수를 거칠 것. */
  const safeId = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '');
  const isToday = (ts) => new Date(ts).toDateString() === new Date().toDateString();
  const isThisWeek = (ts) => { const d=new Date(ts); const now=new Date(); const weekAgo=new Date(now-7*864e5); return d>=weekAgo; };
  const fmtDate  = (ts) => new Date(ts).toLocaleDateString('ko-KR',{year:'2-digit',month:'2-digit',day:'2-digit'})+' '+new Date(ts).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
  const fmtDateS = (ts) => new Date(ts).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'});

  /* ── 권역·나라 분류 맵 (data.js의 destFieldMap에서 파생) ── */
  /* 지역 분류 맵 — PY: data.js의 DEST_CLASSIFY(region)에서 파생한다.
     예전엔 이 맵을 여기 직접 적었는데, 그래서 '동유럽'이 요율은 유럽 티어인데 그룹만
     중앙아시아로 남아 지역별 일괄조정에서 유럽에는 빠지고 중앙아시아에 잘못 딸려간
     적이 있다(2026-07-28 수정). 좌석·보험 권역은 처음부터 유럽 취급이었고 이 맵만
     어긋나 있었다 — 목록이 흩어져 있으면 반드시 이런 식으로 한 곳만 낡는다.
     ⚠ 런타임에 커스텀 목적지가 여기 추가되므로(아래 loadRates) 매번 새 객체여야 한다. */
  const REGION_MAP = destFieldMap('region');

  /* 나라 분류 맵 (RY) — 같은 방식으로 DEST_CLASSIFY(country)에서 파생한다.
     ⚠ 지역(region)과 역할이 다르다. region은 **요율 일괄조정 단위**(가격 축)이고
     country는 **실물 축**이다. '동남아' 하나에 베트남·태국·필리핀·인도네시아가 다 들어
     있어서, 같은 이름의 체인 호텔이 어느 나라 것인지 실제 이용 호텔 목록에서 구분되지
     않았다. 가격 계산에는 전혀 쓰이지 않는다 — 목록을 가르는 데만 쓴다.
     ⚠ REGION_MAP과 마찬가지로 런타임에 커스텀 목적지가 추가되므로 매번 새 객체여야 한다. */
  const DEST_COUNTRY = destFieldMap('country');
  /* 커스텀 목적지가 나라를 안 골랐을 때 쓰는 말 — 빈칸으로 두면 목록에서 "나라가 없는
     호텔"이 조용히 섞여 들어간다(결함 생성기 ②). 화면에 그대로 보여 채우게 만든다. */
  const COUNTRY_UNSET = '나라 미지정';

  const REGION_ORDER = ['일본','홍콩·마카오','중국','몽골·대만','동남아','오세아니아·태평양','유럽','북미','중앙아시아'];

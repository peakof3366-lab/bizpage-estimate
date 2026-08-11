/* 1회성 스키마 마이그레이션. `node ai-loop/db_migrate.js`로 직접 실행 (앱 엔드포인트 아님). */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    create table if not exists quotes (
      id text primary key,
      created_at timestamptz not null default now(),
      status text not null default 'new',
      note text not null default '',
      dest_label text,
      org_name text,
      participants int,
      total bigint,
      payload jsonb not null
    )
  `;

  await sql`
    create table if not exists inquiries (
      id text primary key,
      created_at timestamptz not null default now(),
      read boolean not null default false,
      status text not null default 'unread',
      note text not null default '',
      name text,
      org text,
      tel text,
      message text,
      type text not null default 'contact',
      payload jsonb not null
    )
  `;

  await sql`
    create table if not exists quote_shares (
      id text primary key,
      created_at timestamptz not null default now(),
      payload jsonb not null
    )
  `;

  await sql`
    create table if not exists admin_auth (
      id int primary key default 1,
      username text not null default 'admin',
      password_hash text not null,
      updated_at timestamptz not null default now(),
      constraint admin_auth_singleton check (id = 1)
    )
  `;
  /* 기존에 이미 생성된 테이블에는 username 컬럼이 없을 수 있으므로 추가 보강 */
  await sql`alter table admin_auth add column if not exists username text not null default 'admin'`;

  /* 멀티유저 관리자 계정 (신규) — admin_auth는 id=1 싱글톤이라 전 직원이 비밀번호
     하나를 공유했음(누가 뭘 바꿨는지 추적 불가, "작성자"는 브라우저에서 자유
     선택하는 localStorage 값이라 위조 가능했음). 이 테이블로 대체하되 admin_auth는
     삭제하지 않는다(되돌릴 수 없는 작업 지양). role 3단계: owner(전체 권한) /
     manager(요율 일괄조정·목적지 추가삭제까지) / staff(일상 업무만). failed_attempts/
     locked_until은 로그인 브루트포스 방지용(5회 실패 시 15분 잠금, api/admin/login.js
     에서 갱신). */
  await sql`
    create table if not exists staff_accounts (
      id bigserial primary key,
      username text not null unique,
      display_name text not null,
      password_hash text not null,
      role text not null default 'staff' check (role in ('owner','manager','staff')),
      active boolean not null default true,
      failed_attempts int not null default 0,
      locked_until timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  /* 기존 admin_auth 싱글톤 계정을 owner 첫 계정으로 그대로 이관(비밀번호 재설정 불필요) */
  await sql`
    insert into staff_accounts (username, display_name, password_hash, role)
    select username, username, password_hash, 'owner' from admin_auth where id = 1
    on conflict (username) do nothing
  `;

  /* 방문/이벤트 실서버 수집 (기존엔 브라우저 localStorage에만 쌓여 관리자 페이지 통계가
     실제 방문자 데이터를 반영하지 못했음 — /api/track이 이 테이블에 기록) */
  await sql`
    create table if not exists site_events (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      name text not null,
      meta jsonb not null default '{}'::jsonb
    )
  `;
  await sql`create index if not exists site_events_name_idx on site_events (name)`;
  await sql`create index if not exists site_events_created_at_idx on site_events (created_at)`;

  /* 문의/견적요청 자유서술 텍스트에서 GPT로 뽑아낸 마케팅 키워드/인사이트 스냅샷.
     관리자가 "다시 분석하기"를 누를 때마다 한 행씩 추가(이력 조회 가능) */
  await sql`
    create table if not exists marketing_insights (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      source_count int not null default 0,
      result jsonb not null
    )
  `;

  /* 커스텀 목적지 보험 권역 (신규) — 없으면 getInsuranceZone이 어디에도 못 찾아
     보험 권역 계수 1.00(중립)으로 조용히 폴백한다. 권역별 계수가 0.85~1.80이라
     최대 80% 어긋나는데 콘솔 경고만 남고 화면에는 아무 표시가 없었다.
     기본값 asiaMid는 '기준 권역'(계수 1.00)이라 기존 폴백과 동작이 같다 —
     즉 이 마이그레이션만으로는 금액이 변하지 않고, 담당자가 값을 고르면 그때 반영된다. */
  await sql`alter table custom_destinations add column if not exists insurance_zone text not null default 'asiaMid'`;

  /* 커스텀 목적지 시즌 프로파일 (PQ) — 없으면 getSeasonInfo가 DEST_SEASON_PROFILES에서
     그 목적지를 못 찾아 공용표(SEASON_CONFIG)로 폴백한다. 보험 권역과 달리 폴백이
     '중립값'이 아니라 **다른 계절**이다: 동남아를 추가하고 7월 출발이면 공용표는
     성수기 1.20, 실제 동남아는 우기 비수기 0.88 — 항공·유류·호텔이 36% 어긋난다.
     nullable이고 null이면 종전 폴백과 100% 동일 동작이라, 이 마이그레이션만으로는
     금액이 변하지 않는다(담당자가 프로파일을 고르면 그때부터 반영). */
  await sql`alter table custom_destinations add column if not exists season_profile text`;

  /* 직원 자가 가입 (신규) — 가입 신청으로 만들어진 계정인지 표시한다.
     staff_accounts.active만으로는 "가입하고 승인을 기다리는 사람"과 "관리자가
     일부러 꺼둔 사람"이 똑같이 비활성으로 보여, 관리자가 대기자를 놓치거나
     내보낸 계정을 되살릴 수 있다. 승인(활성화)하면 false로 되돌려 대기 목록에서
     빠진다 — 이후로는 평범한 직원 계정과 구분할 이유가 없기 때문. */
  await sql`alter table staff_accounts add column if not exists self_signup boolean not null default false`;

  /* 문의/견적 담당자 배정 + 진행 기록 이력 (신규) — 여러 직원이 같은 리드를 보고
     누가 확인했고 어떻게 진행 중인지 공유할 수 있도록 함 */
  await sql`alter table inquiries add column if not exists assignee text not null default ''`;
  await sql`alter table inquiries add column if not exists activity_log jsonb not null default '[]'::jsonb`;
  await sql`alter table quotes add column if not exists assignee text not null default ''`;
  await sql`alter table quotes add column if not exists activity_log jsonb not null default '[]'::jsonb`;

  /* 문의에 대한 공식 답변 (신규) — 진행 기록(내부 이력)과 별개로, 고객에게
     실제로 전달한 확정 답변 텍스트를 관리자 내부에서 확인할 수 있게 함 */
  await sql`alter table inquiries add column if not exists reply text not null default ''`;
  await sql`alter table inquiries add column if not exists replied_at timestamptz`;
  await sql`alter table inquiries add column if not exists replied_by text not null default ''`;

  /* 요율(가격) 실시간 오버라이드 (신규) — data.js의 55개 목적지 단가는 정적 파일로
     "항상 안전한 기본값"으로 유지하고, 관리자가 수정한 항목만 이 테이블에 저장.
     script.js가 페이지 로드 시 비동기로 이 값을 받아와 정적값 위에 얕은 병합함
     (fetch 실패/지연 시에도 정적 기본값으로 항상 정상 동작 — 계산 엔진 자체는
     건드리지 않는 안전한 구조). */
  await sql`
    create table if not exists rate_overrides (
      destination_key text primary key,
      overrides jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      updated_by text not null default ''
    )
  `;
  await sql`
    create table if not exists rate_change_log (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      destination_key text not null,
      field text not null,
      old_value jsonb,
      new_value jsonb,
      author text not null default ''
    )
  `;
  await sql`create index if not exists rate_change_log_created_at_idx on rate_change_log (created_at)`;

  /* 정적 페이지(index.html) 콘텐츠 오버라이드 (신규) — 히어로/갤러리/포트폴리오/
     회사소개/후기/FAQ의 문구·이미지 URL을 관리자 페이지에서 직접 수정할 수 있게 함.
     행이 없는 key는 index.html에 하드코딩된 기본값을 그대로 사용. */
  await sql`
    create table if not exists content_overrides (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `;

  /* 요율 관리: 환율 변동 감시 (신규) — 항공료 자체는 인원 규모별로 그때그때 협상
     견적을 받는 구조라 자동 갱신 대상이 아니지만, 환율은 객관적으로 공개된 값이라
     자동 감시가 가능함. fx_rates는 cron(api/rates.js?cron=1)이 매일 덮어쓰는 "오늘의
     환율", rate_fx_baseline은 목적지별 "마지막으로 가격을 확인/확정했을 때의 환율"
     스냅샷(그 이후 환율이 얼마나 움직였는지 재는 기준점) — 관리자가 요율 관리에서
     가격을 저장할 때마다 그 시점 환율로 재설정됨. */
  await sql`
    create table if not exists fx_rates (
      currency text primary key,
      rate_to_krw numeric not null,
      fetched_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists rate_fx_baseline (
      destination_key text primary key,
      currency text not null,
      baseline_rate numeric not null,
      baseline_at timestamptz not null default now()
    )
  `;

  /* 관리자 신규 목적지 (신규) — rate_overrides(기존 목적지의 부분 diff)와 달리
     완전한 한 행을 저장한다. 신규 목적지는 애초에 data.js에 기본값이 없어 병합할
     대상이 없기 때문. 9개 단가 필드를 모두 not null로 강제해 미완성 상태로 공개
     견적 계산기에 노출되는 걸 원천 차단한다. zone은 script.js BIZ_ZONES(short/mid/
     long) 버킷, southern_hemisphere는 SOUTHERN_HEMISPHERE_DESTS 편입 여부에
     대응하며, 둘 다 클라이언트가 /api/rates 응답을 받아 해당 배열에 push한다
     (data.js/script.js 원본은 건드리지 않음 — 항상 안전한 정적 기본값 유지). */
  await sql`
    create table if not exists custom_destinations (
      destination_key text primary key,
      label text not null,
      zone text not null check (zone in ('short','mid','long')),
      southern_hemisphere boolean not null default false,
      airfare numeric not null, fuel_surcharge numeric not null,
      hotel_per_room numeric not null, meal_per_person numeric not null,
      vehicle_large numeric not null, vehicle_small numeric not null,
      guide_fee numeric not null, sightseeing_fee numeric not null,
      margin_per_traveler numeric not null,
      rate_date text not null, notes text not null default '', season_note text not null default '',
      created_at timestamptz not null default now(), created_by text not null default ''
    )
  `;
  /* 커스텀 목적지 부가 메타 (신규) — 최초 추가 시 가격 9개만 받고 통화·지역을 안 받아
     내장 목적지와 동작이 갈리던 문제 보강. currency: 환율 보정(rate_fx_baseline/getFxAdjust)
     대상 통화(없으면 FX 미적용, 동유럽 등 내장과 동일 폴백). region: REGION_MAP 지역 분류
     — 없으면 요율 일괄조정(지역 단위)에서 '기타'로 빠져 조용히 누락되던 것을 막는다.
     둘 다 nullable — 기존 커스텀 목적지 행은 값이 없어도 종전대로 안전하게 동작. */
  await sql`alter table custom_destinations add column if not exists currency text`;
  await sql`alter table custom_destinations add column if not exists region text`;
  /* 나라 (RY) — region과 별개 축이다. region은 요율 일괄조정 단위(가격 축), country는
     '실제 이용 호텔' 목록을 가르는 실물 축이다('동남아' 하나에 베트남·태국·필리핀이
     다 들어 있어 체인 호텔이 구분되지 않았다). 가격 계산에는 전혀 쓰이지 않는다.
     ⚠ createDestination의 INSERT가 이 컬럼을 쓴다 — **배포보다 이 마이그레이션이 먼저**여야
     새 목적지 추가가 500으로 깨지지 않는다. 조회(GET)는 `select *`라 순서에 무관하다. */
  await sql`alter table custom_destinations add column if not exists country text`;

  /* 실제 계약 항공료 (신규) — 항공료는 인원별 협상 견적이라 공개 API로 자동 갱신할
     수 없지만, 계약완료된 견적의 진짜 최종 항공료를 담당자가 한 번 입력해 두면
     그게 쌓여서 요율표 갱신 여부를 판단하는 실데이터 근거가 된다(admin.html 요율
     관리 탭의 "실제 계약 데이터 기반 갱신 제안" 카드가 이 값을 집계함). */
  await sql`alter table quotes add column if not exists actual_airfare_unit numeric`;

  /* 실제 계약 호텔단가 (신규) — 위 actual_airfare_unit과 대칭 구조. 항공료만 이중
     소스(견적관리+실제계약가위젯)이고 호텔은 위젯 하나뿐이던 비대칭을 해소한다. */
  await sql`alter table quotes add column if not exists actual_hotel_unit numeric`;

  /* 실제 계약 식비 + 실제 총 계약가 (신규 · P1b, 정확도 측정) — 항목별 실측을 식비까지
     넓히고, 실제 최종 총 계약가를 남겨 "견적 총액이 실제와 얼마나 맞았나"(종합 오차)를
     요율 관리 탭 "견적 정확도" 카드에서 집계한다. */
  await sql`alter table quotes add column if not exists actual_meal_unit numeric`;
  await sql`alter table quotes add column if not exists actual_total numeric`;

  /* 실제 가격 제보 (신규) — 위 quotes.actual_airfare_unit은 특정 견적 레코드에 종속돼
     견적관리 상세 모달을 열어야만 입력 가능했음. 이 테이블은 목적지만 고르면 어떤
     견적 레코드와도 무관하게 요율 관리 탭 맨 위에서 누구나(로그인한 임직원 누구나)
     바로 남길 수 있는 독립적인 실제 항공료 제보 — 직접 입력 또는 PDF 견적서 업로드
     후 AI 추출(반드시 사람이 확인 후 제출) 두 경로 모두 여기로 쌓인다. */
  await sql`
    create table if not exists actual_price_reports (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      destination_key text not null,
      airfare_unit numeric not null,
      author text not null default '',
      source text not null default 'manual'
    )
  `;
  await sql`create index if not exists actual_price_reports_dest_idx on actual_price_reports (destination_key)`;

  /* 실제 가격 제보 확장 (신규) — 항공료 하나만 받던 것을 호텔·식비까지 넓힌다.
     한 건의 제보에 모든 항목이 다 채워질 필요는 없으므로(예: 호텔명만 남기는 경우)
     airfare_unit도 이제 nullable로 바꾸고, hotel_unit/meal_unit도 nullable로 추가한다.
     hotel_name은 요율 계산에 전혀 쓰이지 않는 순수 참고 텍스트(어떤 호텔을 실제로
     썼는지) — 공개 견적 계산기(index.html/script.js)는 이 테이블을 아예 조회하지
     않고 관리자 전용 API(requireAdmin)로만 읽으므로 자동으로 관리자만 볼 수 있다. */
  await sql`alter table actual_price_reports alter column airfare_unit drop not null`;
  await sql`alter table actual_price_reports add column if not exists hotel_unit numeric`;
  await sql`alter table actual_price_reports add column if not exists hotel_name text`;
  await sql`alter table actual_price_reports add column if not exists meal_unit numeric`;

  /* RQ: 실제 계약가 항목 확대 — 항공·호텔·식비 셋만 받던 것을 요율표의 나머지 항목까지
     넓힌다. 2026-08-04 회의(견적 자동화)에서 정의한 추출 필드가 근거다:
       "항공료, 호텔, 차량, 가이드비, 식사비, 기관 섭외비, 기타 / 최종 판매가(인당), 수익 책정액"
     ⚠ 이 값들은 **이미 견적서에서 산술로 뽑히고 있었다**(오키나와 실측: 차량 940,500 /
     가이드 209,000 / 유류할증 90,000). 받을 칸이 없어서 버리고 있었을 뿐이다.
     전부 nullable — 한 건의 제보에 모든 항목이 채워질 필요는 없다(기존 셋과 같은 규칙).
     ⚠ 컬럼을 따로 두는 이유: 갱신 제안·정확도·실측 배지가 항목별로 집계하는데,
     jsonb 한 칸에 몰아넣으면 그 집계가 전부 복잡해진다. 요율표 필드와 1:1로 맞춘다. */
  await sql`alter table actual_price_reports add column if not exists fuel_unit numeric`;
  await sql`alter table actual_price_reports add column if not exists vehicle_unit numeric`;
  await sql`alter table actual_price_reports add column if not exists guide_unit numeric`;
  await sql`alter table actual_price_reports add column if not exists sight_unit numeric`;
  /* 1인 최종 판매가 — 요율 항목이 아니라 **검증용**이다. 우리 견적이 실제 판매가와
     얼마나 맞았는지 재는 기준선이 된다(회의록의 '오차 ±5%' 판정에 직결). */
  await sql`alter table actual_price_reports add column if not exists sell_price_unit numeric`;

  /* 언제 출발하는 여행이었나 (RZ 후속) — 실측 단가에 이게 안 붙으면 숫자가 반쪽이다.
     요율 엔진은 **시즌(월별)**과 **리드타임(얼마나 미리 잡았나)**으로 금액을 움직이는데
     (data.js DEST_SEASON_PROFILES는 스스로 "도메인 초안"이라고 적어 두었다),
     그 계수를 검증할 방법이 지금 없다. 출발일이 쌓이면:
       · 같은 목적지의 2월 견적과 8월 견적을 실제 단가로 비교 → 시즌 계수 검증
       · 출발일 − 견적 작성일 = 리드타임 → 리드타임 계수 검증
       · 고객이 "9월 출발"을 물으면 9월에 실제로 나간 견적을 근거로 댈 수 있다
     ⚠ 리드타임은 저장하지 않는다 — depart_date − quote_date로 언제든 나온다.
     같은 사실을 두 곳에 적으면 반드시 어긋난다(결함 생성기 ①). */
  await sql`alter table actual_price_reports add column if not exists depart_date date`;
  await sql`alter table actual_price_reports add column if not exists quote_date date`;
  await sql`alter table actual_price_reports add column if not exists nights int`;
  /* 출발일로 모아 보는 조회가 곧 주 용도라 인덱스를 함께 둔다 */
  await sql`create index if not exists actual_price_reports_depart_idx on actual_price_reports (depart_date)`;

  /* SG: **어느 환율로 환산된 값인가.** 안 남기면 그 원화값은 견적서 시점 환율이 박힌 채
     실측으로 굳는다. 요율표 단가는 「오늘 환율 기준」이라는 약속 위에 서 있고
     (`rate_fx_baseline`), 엔진이 `오늘 ÷ 기준`으로 보정한다. 견적서에서 뽑은 값은
     **그 견적서의 환율**이 박혀 있으므로 두 환율의 차이만큼 처음부터 어긋난다.
     실측(코퍼스 34건, 2026-08-10 환율 대비): 어긋남 **중앙값 5.1% · 최대 12.1%**
     (BSI 도쿄 ¥10 vs 8.92 · 일본 견적서 10건이 전부 9.5). 트랙 A 목표가 ±5%다.
     ⚠ `rate_fx_baseline`을 이 환율로 심는 방법은 **쓸 수 없다** — 그 표는 목적지당 한 줄인데
     항공은 원화, 호텔은 달러처럼 **항목마다 환율이 다르다.** 그래서 값을 고치지 않고
     "이 값은 이 환율로 환산됐다"만 남기고, 요율과 비교할 때 오늘 기준으로 되돌린다.
     ⚠ fx_fields가 필요한 이유 — 한 견적서 안에서도 **환산된 항목과 원화 항목이 섞인다**
     (키움 하노이: 항공 420,000원은 원화, 차량 $600은 환산). 전부 되돌리면 원화 항목이
     엉뚱하게 움직인다. 되돌릴 항목 이름만 쉼표로 적는다. */
  await sql`alter table actual_price_reports add column if not exists fx_currency text`;
  await sql`alter table actual_price_reports add column if not exists fx_rate numeric`;
  await sql`alter table actual_price_reports add column if not exists fx_fields text`;

  /* SU: 항목별 **평균에서 빼기** (2026-08-11 대표 지시).
     한 견적서가 **두 도시**를 도는 일이 실제로 있다 — 「(주)좋은친구 경기신용보증재단
     (홍콩,심천)」은 목적지가 홍콩인데 호텔이 **선전(심천)**이다. 그 호텔값을 홍콩 평균에
     넣으면 홍콩 기준가가 엉뚱하게 내려간다. 대표 판단: 「지역이 달라지니 심천 호텔비는
     홍콩 평균에 넣지 말 것.」
     ⚠ **행을 지우지 않는다.** 나머지 항목(항공·차량·가이드)은 홍콩 것이라 그대로 쓴다.
       그래서 삭제가 아니라 **항목 단위**로 뺀다.
     ⚠ **어느 항목이 어느 도시 것인지는 사람만 안다.** 호텔 이름에 '선전'이 들어 있다고
       코드가 판단하게 만들면, 이름을 그렇게 안 적은 문서에서 조용히 틀린다.
       그래서 자동 판정이 아니라 담당자가 표시한다(이 저장소의 규칙 그대로).
     모양: {"hotel": "심천 호텔 — 홍콩과 다른 도시"} — 키는 화면의 항목 키,
     값은 **왜 뺐는지**다. 사유 없이 빼면 나중에 아무도 이유를 모른다. */
  await sql`alter table actual_price_reports add column if not exists excluded_fields jsonb`;

  /* SW: **칸별로 누가 정한 값인가** (2026-08-11 대표 방침 — 앞으로는 실무자가 직접 올린다).
     지금은 행 단위 `source`('pdf' | 'manual') 하나뿐이라, 9칸 중 3칸만 담당자가 문서를 보고
     고친 경우를 **구분할 수 없다.** 그러면 요율을 집계할 때 「사람이 확정한 값」과
     「AI가 읽은 값」이 같은 무게로 섞인다.
     ⚠ 이 구분이 있어야 실무자에게 넘길 수 있다 — 담당자가 확정한 칸은 **다시 묻지 않고**,
       추출 그대로인 칸만 확인 대상으로 남길 수 있다.
     모양: {"meal": {"by": "김실무", "at": "2026-08-11T...", "how": "총액 6,056,650 ÷ 26명 ÷ 4일"}}
     `how`는 **어떻게 그 값이 나왔는지**다 — 비워 두면 나중에 근거를 잃는다. */
  await sql`alter table actual_price_reports add column if not exists manual_fields jsonb`;

  /* P2b: 전역 앱 설정 KV (신규) — 견적 계수 스칼라 노브(coefficients) 등 사이트 전역 설정을
     key→jsonb로 저장. 공개 계산기는 /api/rates GET이 이 중 'coefficients' 행을 코드 기본값 위에
     폴백-우선 병합한다(행이 없으면 기본값=현재 동작). content_overrides와 같은 KV 형태이되 값이
     구조적이라 jsonb를 쓴다. */
  await sql`
    create table if not exists app_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now(),
      updated_by text not null default ''
    )
  `;

  /* QB: 추천 일정 오버라이드 (신규) — 목적지별 추천 코스(제목·하이라이트·일자별
     오전/오후/저녁/팁)를 산출 담당자가 관리자 화면에서 직접 고칠 수 있게 한다.
     예전에는 이 내용이 script.js의 ITINERARY_DB 상수에만 있어서, 한 줄을 고치려면
     개발자가 코드를 수정하고 배포해야 했다.
     rate_overrides가 data.js 요율의 진실인 것과 같은 구조다 — 행이 없는 목적지는
     data.js의 ITINERARY_DB 기본값을 그대로 쓴다(그래서 이 테이블이 비어 있어도
     지금과 100% 같은 화면이 나온다).
     courses는 코스 배열 전체를 통째로 담는다. 코스·일자 단위로 행을 쪼개면 순서
     컬럼과 부분 저장 실패가 생기는데, 한 목적지의 일정은 항상 통째로 편집·저장되므로
     쪼갤 이유가 없다. */
  await sql`
    create table if not exists itinerary_overrides (
      dest_key text primary key,
      courses jsonb not null,
      updated_at timestamptz not null default now(),
      updated_by text not null default ''
    )
  `;
  /* QC: 같은 목적지의 추천 콘텐츠(DEST_REC — 방식 A/B의 레이블·테마·핵심 포인트·
     일별 활동·기대 효과 문구)도 같은 행에 담는다. 담당자는 한 화면에서 일정과 추천을
     함께 고치고 한 번에 저장하므로, 테이블을 나누면 절반만 저장된 상태가 생긴다.
     null = 이 목적지의 추천 콘텐츠는 아직 손대지 않음(data.js 기본값 사용). */
  await sql`alter table itinerary_overrides add column if not exists rec jsonb`;

  /* QU: 추천 콘텐츠(방식 A·B)를 일정과 **다른 화면에서** 관리하게 되면서,
     "코스는 기본값을 쓰고 추천 콘텐츠만 수정한 목적지"가 생긴다. 그 상태를 표현할
     방법이 없으면 추천만 저장하려는 호출이 코스를 함께 보내야 하고, 그러면 그 화면이
     들고 있던 낡은 코스 사본이 **동료가 방금 고친 코스를 조용히 되돌린다.**
     null = 이 목적지의 코스는 손대지 않음(data.js 기본값 사용) — rec이 null인 것과 같은 뜻이다.
     ⚠ 제약을 '푸는' 변경이라 기존 행·기존 코드에 영향이 없다(예전 코드는 항상 courses를
     보낸다). 여러 번 실행해도 안전하다. */
  await sql`alter table itinerary_overrides alter column courses drop not null`;

  console.log('Migration complete: quotes, inquiries, quote_shares, admin_auth, staff_accounts, site_events, marketing_insights, rate_overrides, rate_change_log, content_overrides, fx_rates, rate_fx_baseline, actual_price_reports, custom_destinations, app_settings, itinerary_overrides tables ready. (quotes.actual_airfare_unit/actual_hotel_unit columns ensured; actual_price_reports now covers airfare/hotel/meal + hotel_name; admin_auth owner account seeded into staff_accounts)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

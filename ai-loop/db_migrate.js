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

  console.log('Migration complete: quotes, inquiries, quote_shares, admin_auth, staff_accounts, site_events, marketing_insights, rate_overrides, rate_change_log, content_overrides, fx_rates, rate_fx_baseline, actual_price_reports, custom_destinations tables ready. (quotes.actual_airfare_unit/actual_hotel_unit columns ensured; actual_price_reports now covers airfare/hotel/meal + hotel_name; admin_auth owner account seeded into staff_accounts)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

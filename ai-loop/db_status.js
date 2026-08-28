/* 운영 DB 현황 — **읽기 전용**. `node ai-loop/db_status.js`
   이 스크립트는 DB에 아무것도 쓰지 않는다(select만 한다).

   ── 왜 만들었나 ────────────────────────────────────────────────────────
   WF 후속이 「대장에 연락처 없이 들어온 건이 몇 건인가」를 세어 보고 정하자고
   남겼는데, 그때마다 손으로 쿼리를 짜고 있었다. 손으로 짜면 **매번 다른 것을 세게**
   되고, 그러면 지난번 숫자와 비교할 수 없다(결함 생성기 ① — 목록의 산포).
   여기 한 곳에서 세고, 무엇을 세었는지 화면에 함께 적는다.

   ── 🔴 고객 개인정보를 화면에 뿌리지 않는다 ───────────────────────────
   대장에는 고객 이름·연락처가 들어 있다. 이 스크립트는 **연락처를 마스킹**하고
   (뒤 4자리만), 이름은 세는 데만 쓴다. 터미널 기록·스크린샷으로 새는 자리라
   「있다/없다」만 알면 되는 곳에 원본을 찍지 않는다.
   ⚠ 전체를 봐야 할 때는 `--full`을 명시한다(사람이 의도해서 켜는 것).

   ── 무엇을 세는가 ─────────────────────────────────────────────────────
   · 견적서 대장(quote_shares) — 발급 건수 · 상태 · **연락처가 빈 건** · 입구별
   · 견적 기록(quotes) · 문의(inquiries) · 패키지 상품(packages) — 최근 활동일
   숫자 옆에 **언제 것인지**를 함께 적는다. 「10건」만으로는 그게 이번 달 것인지
   7월에 멈춘 것인지 알 수 없다. */
const path = require('path');
require('./_load_env')();

const FULL = process.argv.includes('--full');
const ROOT = path.join(__dirname, '..');
const { neon } = require(path.join(ROOT, 'node_modules', '@neondatabase', 'serverless'));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL이 없습니다 (.env.local을 확인하세요). 아무것도 세지 못했습니다.');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const maskTel = (t) => {
  if (!t) return '';
  if (FULL) return t;
  const d = String(t).replace(/\D/g, '');
  return d.length >= 4 ? '***-' + d.slice(-4) : '***';
};
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const count = (rows, f) => rows.filter(f).length;

/* 며칠 전인지 — 「10건」과 「7월에 멈춘 10건」은 다른 이야기다 */
const ago = (d) => {
  if (!d) return '';
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return n <= 0 ? ' (오늘)' : ` (${n}일 전)`;
};

(async () => {
  console.log('\n═══ 운영 DB 현황 (읽기 전용) ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC ═══');

  /* ── 견적서 대장 ── */
  const shares = await sql`
    select quote_no, created_at, issued_by, customer_label, customer_tel, status,
           payload->'pkg'->>'id' as pkg_id, payload->>'dt' as dest
      from quote_shares order by created_at`;
  console.log('\n■ 견적서 대장 (quote_shares) — ' + shares.length + '건');
  if (shares.length) {
    const last = shares[shares.length - 1].created_at;
    console.log('  · 마지막 발급: ' + day(last) + ago(last));
    console.log('  · 상태: ' + ['issued', 'won', 'lost', 'void']
      .map((s) => s + ' ' + count(shares, (r) => (r.status || 'issued') === s)).join(' · '));
    /* 🔴 이 줄이 WF 후속이 물었던 것이다 */
    const noTel = shares.filter((r) => !r.customer_tel);
    console.log('  · 🔴 연락처가 빈 건: ' + noTel.length + '건'
      + (noTel.length ? ' (마지막 ' + day(noTel[noTel.length - 1].created_at) + ')' : ''));
    /* ⚠ 연락처를 받기 시작한 것은 WC(2026-08-24)다. 그 앞의 건이 비어 있는 것은
         결함이 아니라 **기능이 없던 때의 것**이다 — 갈라서 세지 않으면 오래된
         빈 칸이 지금도 새고 있는 것처럼 보인다. */
    const WC = new Date('2026-08-24T00:00:00Z');
    const after = shares.filter((r) => new Date(r.created_at) >= WC);
    console.log('    ↳ 연락처 기능(2026-08-24) 이후 발급: ' + after.length + '건'
      + (after.length ? ' · 그중 빈 건 ' + count(after, (r) => !r.customer_tel) + '건'
                      : ' — **표본이 없다.** 지금은 셀 것이 없다는 뜻이지 통과가 아니다.'));
    console.log('  · 입구: 패키지 ' + count(shares, (r) => r.pkg_id)
      + ' · 계산기/담당자 ' + count(shares, (r) => !r.pkg_id));
    console.log('  · 발급자: ' + [...new Set(shares.map((r) => r.issued_by || '(없음)'))].join(' · '));
    if (FULL || shares.length <= 30) {
      console.log('  ┌ 건별');
      for (const r of shares) {
        console.log('  │ ' + [r.quote_no, day(r.created_at), r.issued_by || '—',
          r.customer_label || '—', maskTel(r.customer_tel) || '연락처없음',
          r.pkg_id ? 'PKG' : 'CALC', r.status || 'issued', r.dest || ''].join(' | '));
      }
    }
  }

  /* ── 견적 기록 · 문의 · 패키지 ── */
  const rows = async (t) => {
    try { return await sql(Object.assign([`select * from "${t}"`], { raw: [`select * from "${t}"`] })); }
    catch (err) { console.log('  (못 읽음: ' + err.message + ')'); return null; }
  };

  const quotes = await rows('quotes');
  if (quotes) {
    console.log('\n■ 견적 기록 (quotes) — ' + quotes.length + '건');
    if (quotes.length) {
      const last = quotes.map((r) => r.created_at).sort().pop();
      console.log('  · 마지막: ' + day(last) + ago(last));
      /* WK: 연락처가 기록에 담기기 시작했다. 앞으로 이 숫자가 안 늘면 그 길이 또 끊긴 것이다 */
      const withTel = quotes.filter((r) => r.payload && r.payload.contactTel);
      console.log('  · 연락처가 담긴 기록: ' + withTel.length + '건 (WK 이후 생긴 것만 해당)');
    }
  }

  const inq = await rows('inquiries');
  if (inq) {
    console.log('\n■ 문의 (inquiries) — ' + inq.length + '건'
      + (inq.length ? ' · 마지막 ' + day(inq.map((r) => r.created_at).sort().pop()) : ''));
    if (inq.length) console.log('  · 안 읽음: ' + count(inq, (r) => !r.read) + '건');
  }

  const pkgs = await rows('packages');
  if (pkgs) {
    console.log('\n■ 패키지 상품 (packages) — ' + pkgs.length + '건');
    const by = {};
    for (const p of pkgs) by[p.status || '(없음)'] = (by[p.status || '(없음)'] || 0) + 1;
    console.log('  · 상태: ' + Object.entries(by).map(([k, v]) => k + ' ' + v).join(' · '));
    /* 🔴 고객이 보는 것은 open뿐이다. 0이면 패키지 입구가 빈 목록이다. */
    console.log('  · 🔴 고객에게 보이는 것(open): ' + (by.open || 0) + '건');
    const filled = pkgs.filter((p) => Array.isArray(p.itinerary) && p.itinerary.length);
    console.log('  · 일정이 채워진 것: ' + filled.length + '건 / ' + pkgs.length);
  }

  /* 🔴 **이 화면을 쓰는 사람이 있는가** (YC). 여기 있는 다른 숫자가 전부 0인 이유를
     설명하는 것이 이 줄이다 — 결정대기열 2번(가입코드 전달)이 2026-08-02부터 걸려
     있는데, 그 항목이 풀렸는지 아닌지를 **매번 손으로 쿼리해서** 확인해 왔다.
     ⚠ 비밀번호 해시는 **읽지 않는다.** 세는 데 필요 없다.
   🔴 **칸 이름을 지어내지 말 것.** 처음에 `is_active`·`status`로 셌는데 실제 칸은
     `active`·`self_signup`이다. `undefined !== false`가 참이라 **비활성 계정 둘이
     「실제로 쓰는 계정 2명」으로 찍혔다** — 0명인데 2명이라고 보고할 뻔했다.
     그래서 이제 **없는 칸이면 그렇다고 말한다**(조용히 기본값으로 떨어지지 않는다). */
  const staff = await rows('staff_accounts');
  if (staff) {
    console.log('\n■ 담당자 계정 (staff_accounts) — ' + staff.length + '건');
    const hasCol = (k) => staff.some((s) => Object.prototype.hasOwnProperty.call(s, k));
    const byRole = {};
    for (const s of staff) byRole[s.role || '(없음)'] = (byRole[s.role || '(없음)'] || 0) + 1;
    console.log('  · 역할: ' + Object.entries(byRole).map(([k, v]) => k + ' ' + v).join(' · '));

    if (!hasCol('active')) {
      console.log('  ⚠ `active` 칸이 없다 — 활성 여부를 셀 수 없다(스키마가 바뀌었다).');
    } else {
      /* 승인 대기 = `self_signup = true` (api/admin/account.js와 같은 기준).
         승인하면 그 값을 내려 대기 목록에서 뺀다. */
      const pending = hasCol('self_signup') ? staff.filter((s) => s.self_signup === true) : null;
      console.log('  · 승인 대기: ' + (pending ? pending.length + '건' : '(self_signup 칸 없음)'));
      /* 🔴 사장님(owner)을 뺀 **활성** 계정이 실제로 일하는 사람이다. 이게 0이면
         견적서를 만드는 직원이 0명이라는 뜻이고, 위 숫자들이 0인 것이 **정상**이다
         — 코드가 아니라 사람이 없는 것이다(결정대기열 2번). */
      const workers = staff.filter((s) => s.active === true && (s.role || '') !== 'owner');
      console.log((workers.length ? '  · ' : '  · 🔴 ')
        + '사장님 말고 **켜져 있는** 계정: ' + workers.length + '명'
        + (workers.length ? '' : ' — 견적서를 만드는 직원이 0명이다'));
      const off = staff.filter((s) => s.active === false);
      if (off.length) console.log('    ↳ 꺼져 있는 계정 ' + off.length + '건: '
        + off.map((s) => s.display_name || s.username).join(' · '));
      /* 자기 가입으로 들어온 사람이 하나도 없으면 **가입코드가 전달되지 않은 것**이다. */
      if (hasCol('self_signup')) {
        const selfs = staff.filter((s) => s.self_signup === true || s.self_signup === false);
        const joined = staff.filter((s) => s.self_signup === true).length;
        console.log('  · 가입코드로 스스로 들어온 사람: ' + joined + '명'
          + (joined === 0 && selfs.length ? ' — 🔴 코드가 아직 전달되지 않았다는 뜻이다' : ''));
      }
    }
    const last = staff.map((s) => s.updated_at || s.created_at).filter(Boolean).sort().pop();
    console.log('  · 마지막 계정 변경: ' + day(last) + ago(last));
  }

  console.log('\n⚠ 이 스크립트는 select만 한다. 숫자가 이상하면 DB가 아니라 여기를 먼저 의심할 것.\n');
})().catch((err) => { console.error('실패: ' + err.message); process.exit(1); });

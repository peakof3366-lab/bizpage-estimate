/* ═══════════════════════════════════════════════════════════════════════════
   견적번호 — **형식과 발급의 단일 출처** (WB)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「관리자에서 만들어진 모든 견적서는 넘버링이 되어야 한다.
   그리고 모든 자료가 공유되어야 담당자가 연차/휴가일 때도 응대가 가능하다.」

   감사에서 나온 것 — 전부 실측:
     · 식별자가 `mrx9l0xqhudmf1` 같은 랜덤 문자열이었다. 전화로 부를 수 없다.
     · 고객 견적서 엑셀이 **「발행일」 칸에 그 문자열**을 찍고 있었다(`d.iso`가 있는데 `d.id`를 썼다).
     · 웹사이트 FAQ는 「발행일, 견적 번호가 공문 수준으로 정리되어」라고 **말하고 있었다.**

   ── 형식: `BP-2609-0001`  (BP + YYMM + 그달 일련번호) ─────────────────────
   2026-09-23 대표 지시로 **날짜(YYMMDD) → 달(YYMM)**, 순번 4자리로 바꿨다.
   ⚠ 예전 형식은 `Q260824-03`이었다. 그때 날짜를 넣은 이유는 「지난주 화요일쯤 받았다」로
     찾으려는 것이었는데, 그 자리는 이제 **대장 검색**(발행일 열·번호 검색)이 한다.
   ⚠ 앞이 'BP'라 엑셀이 **문자로 읽는다.** 숫자로 시작하면 앞자리 0이 사라진다.
   🔴 **옛 형식을 읽을 줄은 안다**(`LEGACY_QUOTE_NO_RE`). 아직 남아 있는 줄을 「번호 없음」
     으로 읽으면 마이그레이션이 그 줄에 번호를 **하나 더** 붙인다.

   ── 🔴 번호를 붙이는 시점: **견적을 저장할 때**다 (2026-09-23) ──────────────
   예전에는 **견적서 링크를 발급할 때**만 붙었다. 그래서 견적 관리에 저장만 된 건은
   번호가 없었고, 담당자끼리 「그 대만 건」이라고 부를 수밖에 없었다.
   → `quotes.quote_no`가 **기본 번호**(유일)이고, 발급된 견적서(`quote_shares.quote_no`)는
     그 번호를 **물려받는다.**

   ── 차수는 번호가 아니라 **관계**다 (2026-09-07 합의를 지킨다) ──────────────
   대표 지시: 「수정본은 기본 번호 뒤에 차수를 붙인다(-R1, R2). 최초 발행본은 차수 없이.」
   🔴 **기본 번호는 안 건드린다.** 차수는 `revision_of` 관계에서 **세어서** 붙인다
     (`withRevision`). 번호 안에 차수를 따로 저장하면 관계와 숫자 두 곳에 같은 사실이
     적히고, 그 둘은 반드시 어긋난다(결함 생성기 ①).
   ⚠ 다만 **발급된 견적서에는 그때 찍힌 문자열을 그대로 저장한다** — 이미 고객 손에
     나간 종이에 적힌 번호라 나중에 다시 계산해 바뀌면 안 된다.

   ── 🔴 날짜는 **한국 시간**으로 잰다 ────────────────────────────────────────
   운영 DB(Neon)의 TimeZone이 **GMT**다(실측). `current_date`를 그대로 쓰면
   **한국 오전 9시 이전에 발급한 건이 전날 번호**를 받는다. 아침에 낸 견적서가
   어제 것으로 찍히면 대장에서 못 찾는다.
   → `(now() at time zone 'Asia/Seoul')::date`로 잰다. 같은 이유로 화면 쪽
     `new Date().toISOString().slice(0,10)`도 KST로 고쳤다(그게 `iso`=발행일이다).

   ── 순번: 한 문장으로 원자적으로 딴다 ───────────────────────────────────────
     insert into quote_seq (day, n) values (KST오늘, 1)
       on conflict (day) do update set n = quote_seq.n + 1
       returning n
   `ON CONFLICT DO UPDATE`는 그 행에 **락을 잡고** 갱신하므로 동시 요청이 겹쳐도
   같은 n이 두 번 나오지 않는다(서버리스라 인스턴스가 여러 개다).

   ⚠ **번호에 구멍이 나는 것은 정상이다.** 번호를 딴 뒤 insert가 실패하면 그 번호는
     버려진다. 재사용하지 않는다 — 재사용하면 「같은 번호의 다른 견적서」가 생기고,
     그게 세금계산서보다 훨씬 나쁜 사고다. 견적번호는 연속성이 아니라 **유일성**이 일이다.
   ⚠ 하루 100건을 넘으면 자릿수가 저절로 늘어난다(`-100`). 자릿수를 고정하지 않았다 —
     유일하기만 하면 되고, 실측상 한 달에 10건 수준이라 올 일이 없다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 번호 모양 — 화면·검사·엑셀이 전부 이 하나를 본다.
   ⚠ 차수까지 붙은 모양(`BP-2609-0001-R1`)은 `QUOTE_NO_ANY_RE`다. 기본 번호만 받아야
     하는 자리(대장 컬럼·유일 제약)와 **표시용**을 섞지 않는다. */
const QUOTE_NO_RE = /^BP-\d{4}-\d{4,}$/;
const QUOTE_NO_ANY_RE = /^BP-\d{4}-\d{4,}(-R\d+)?$/;
/* 🔴 옛 형식(`Q260824-03`). **버리지 않는다** — 이미 이 번호로 나간 문서가 있고,
   마이그레이션이 「번호 없음」과 구별해야 한다. */
const LEGACY_QUOTE_NO_RE = /^Q\d{6}-\d{2,}$/;

/* 'YYYY-MM-DD'·Date·'YYMM' 어느 것으로 줘도 받는다 — 부르는 쪽이 셋 다 있다 */
function toYymm(kstDayOrYm) {
  if (typeof kstDayOrYm === 'string' && /^\d{4}$/.test(kstDayOrYm)) return kstDayOrYm;
  const s = typeof kstDayOrYm === 'string' ? kstDayOrYm : kstToday(kstDayOrYm);
  return s.slice(2, 4) + s.slice(5, 7);
}

function formatQuoteNo(kstDayOrYm, n) {
  return 'BP-' + toYymm(kstDayOrYm) + '-' + String(n).padStart(4, '0');
}

/* 차수 표기. 🔴 **최초 발행본은 차수 없이** (대표 지시) — revNo 1이 최초다.
   ⚠ `revNo`가 null이면(관계가 끊겨 셀 수 없으면) **붙이지 않는다.** 틀린 차수는
     「최신이 아닌데 최신처럼 보이는」 자리를 만든다(`buildRevisionMap`의 revBroken과 같은 규칙). */
function withRevision(baseNo, revNo) {
  const base = String(baseNo || '');
  const n = Number(revNo);
  if (!base || !Number.isFinite(n) || n <= 1) return base;
  return base + '-R' + (n - 1);
}

/* 표시된 번호에서 기본 번호만 떼어 낸다 — 검색·대조가 차수 때문에 빗나가지 않게. */
function baseQuoteNo(anyNo) {
  const s = String(anyNo || '').trim();
  const m = s.match(/^(BP-\d{4}-\d{4,})(?:-R\d+)?$/);
  return m ? m[1] : s;
}

/* 한국 날짜 'YYYY-MM-DD'. ⚠ toISOString()은 UTC라 한국 오전 9시 전에 **어제**가 나온다. */
function kstToday(now) {
  const t = now ? new Date(now) : new Date();
  const kst = new Date(t.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

/* 다음 번호를 딴다. **한 번 부르면 한 번 는다** — 부르고 안 쓰면 그 번호는 버려진다.
   ⚠ 실패하면 던진다. 번호 없이 발급하면 대장에서 그 건만 영영 못 찾는다 —
     「번호는 나중에 붙이자」가 곧 안 붙는다는 뜻이다(조용한 폴백 금지). */
async function nextQuoteNo(sql) {
  const rows = await sql`
    insert into quote_seq_m (ym, n)
    values (to_char((now() at time zone 'Asia/Seoul'), 'YYMM'), 1)
    on conflict (ym) do update set n = quote_seq_m.n + 1
    returning n, ym`;
  if (!rows.length) throw new Error('견적번호를 발급하지 못했습니다');
  return formatQuoteNo(rows[0].ym, rows[0].n);
}

/* ── 발급된 견적서가 쓸 번호 ────────────────────────────────────────────────
   🔴 **새로 따지 않고 견적의 번호를 물려받는다.** 같은 건을 두 번 발급하면 예전에는
     번호가 둘 났고, 그러면 고객과 담당자가 **서로 다른 번호로 같은 건**을 부른다.
   차수는 그 건의 발급 횟수로 센다 — 1차는 차수 없이, 2차부터 `-R1`.
   ⚠ 견적 기록이 없는 건(옛 링크·기록 저장이 실패한 건)은 **새로 딴다.** 번호 없이
     내보내지 않는다(그 건만 대장에서 영영 못 찾는다). */
async function shareQuoteNo(sql, quoteId) {
  if (!quoteId) return { no: await nextQuoteNo(sql), base: null, revNo: 1, inherited: false };
  const rows = await sql`select quote_no from quotes where id = ${quoteId}`;
  const base = rows.length ? rows[0].quote_no : null;
  if (!base) return { no: await nextQuoteNo(sql), base: null, revNo: 1, inherited: false };
  const cnt = await sql`select count(*)::int as n from quote_shares where quote_id = ${quoteId}`;
  const revNo = (cnt.length ? cnt[0].n : 0) + 1;
  return { no: withRevision(base, revNo), base, revNo, inherited: true };
}

/* ── 고객 연락처 (WC) ──────────────────────────────────────────────────────
   🔴 **이 값은 payload에 절대 넣지 않는다.** 견적서 링크는 인증이 없어서, 링크를 아는
     사람은 누구나 payload를 본다. 고객이 결재권자에게 링크를 넘기는 것은 정상 동선이고,
     그 링크가 더 퍼지면 **고객 연락처가 같이 퍼진다.** 대장 컬럼에만 둔다.
   ⚠ 형식을 빡빡하게 잡지 않는다 — 「010-1234-5678」·「01012345678」·「02)123-4567」·
     내선·해외번호가 다 온다. 숫자가 **9자 이상**이면 받고, 나머지는 그대로 보관한다.
     너무 조이면 진짜 번호가 막히고, 막히면 사람이 아예 안 적는다. */
function normalizeTel(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, 40);
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 20 ? t : null;
}

/* ── 공급사 견적번호 (ZC) ───────────────────────────────────────────────────
   하나투어·랜드사가 **원가 견적서**에 찍어 보내는 번호. 우리 번호(`Q260907-01`)와
   짝을 이뤄 **원가와 판매가를 잇는 유일한 열쇠**다 — 지금은 블랙다운 엑셀과 우리
   견적서를 사람이 기억으로 맞추고 있어서 건별 실마진을 잴 수 없다.

   🔴 **형식을 짐작해서 조이지 않는다.** 공급사마다 다르고(`A2609-0123`·`HNT-26-0907`·
     숫자만·한글 섞임), 실물을 다 본 적이 없다. 조이면 진짜 번호가 막히고, 막히면
     담당자는 아예 안 적는다 — 그러면 이 칸을 만든 이유가 통째로 사라진다.
     연락처(`normalizeTel`)·고객 이름(`pkgCustomerLabel`)에서 이미 배운 것과 같다.
   ⚠ 그래도 **모양은 다듬는다.** 이 값의 일은 대조라서, 눈에 안 보이는 차이로
     안 맞는 것이 제일 나쁘다: 앞뒤 공백·연속 공백을 없애고 길이만 자른다.
   ⚠ 빈 값은 `null`이다 — 빈 문자열로 두면 「안 적었다」와 「지웠다」가 구별되지 않고,
     `where vendor_quote_no is not null` 인덱스도 빈 문자열을 값으로 센다. */
const VENDOR_NO_MAX = 60;

function normalizeVendorNo(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().replace(/\s+/g, ' ').slice(0, VENDOR_NO_MAX);
  return t || null;
}

/* ── 차수·개정 관계 (ZE) ────────────────────────────────────────────────────
   같은 건으로 견적서를 다시 내는 것은 **정상 업무**다(인원이 바뀌고, 조건이 바뀐다).
   그런데 지금은 그렇게 나간 견적서 셋이 대장에 **나란히 세 줄**로 있을 뿐이라,
   이어받은 사람이 **어느 것이 최신인지 모른다.** 옛 금액으로 응대하면 그대로 손해다.

   🔴 **번호 형식은 건드리지 않는다**(2026-09-07 대표와 합의). `Q260907-02`는 그날의
     두 번째 발급이지 「2차」가 아니다 — 번호에 차수를 섞으면 이미 나간 것과 앞으로가
     갈린다. 차수는 **번호가 아니라 관계**(`revision_of`)로 센다.

   ⚠ **차수를 숫자 컬럼으로 저장하지 않는다.** 관계와 숫자 두 곳에 적으면 반드시
     어긋난다(결함 생성기 ①). 관계 하나만 저장하고 **셀 때마다 여기서 센다.**
   ⚠ 🔴 **모르면 모른다고 말한다.** 앞선 견적서가 목록에 없으면(오래돼서 안 실렸거나
     끊겼거나) 차수를 **짐작하지 않고** `revBroken`으로 표시한다 — 틀린 차수는
     「최신본이 아닌데 최신처럼 보이는」 자리를 만든다(결함 생성기 ②).
   ⚠ 고리(A→B→A)가 생겨도 멈춘다. 사람이 손으로 이을 수 있으니 언젠가 생긴다. */
function buildRevisionMap(rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.id) : [];
  const byId = new Map(list.map((r) => [String(r.id), r]));
  const at = (r) => {
    const t = r && r.created_at ? new Date(r.created_at).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  const kids = new Map();
  for (const r of list) {
    if (!r.revision_of) continue;
    const p = String(r.revision_of);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(r);
  }

  const out = {};
  for (const r of list) {
    const id = String(r.id);
    /* ① 위로 걸어 차수를 센다 */
    let revNo = 1, broken = false, seen = new Set([id]), cur = r;
    while (cur && cur.revision_of) {
      const pid = String(cur.revision_of);
      if (seen.has(pid) || !byId.has(pid)) { broken = true; break; }
      seen.add(pid);
      cur = byId.get(pid);
      revNo += 1;
    }
    /* ② 아래로 걸어 이 갈래의 최신을 찾는다 (자기 자신 포함) */
    let latest = r, stack = [r], walked = new Set([id]);
    while (stack.length) {
      const cu = stack.pop();
      for (const k of kids.get(String(cu.id)) || []) {
        const kid = String(k.id);
        if (walked.has(kid)) continue;
        walked.add(kid);
        stack.push(k);
        if (at(k) >= at(latest)) latest = k;
      }
    }
    /* ③ 아직 안 이어졌다면 **이을 후보**를 찾아 둔다 — 같은 문의의 직전 견적서다.
       ⚠ 후보를 제시만 한다. 여기서 자동으로 잇지 않는다(그 판단은 발급 시점에 한다). */
    let prev = null;
    if (!r.revision_of && r.quote_id) {
      for (const o of list) {
        if (String(o.id) === id || String(o.quote_id || '') !== String(r.quote_id)) continue;
        if (at(o) >= at(r)) continue;
        if (!prev || at(o) > at(prev)) prev = o;
      }
    }
    const parent = r.revision_of && byId.get(String(r.revision_of));
    out[id] = {
      revNo: broken ? null : revNo,
      revBroken: broken,
      revOf: r.revision_of ? String(r.revision_of) : null,
      revOfNo: parent ? parent.quote_no || null : null,
      latestId: String(latest.id),
      latestNo: latest.quote_no || null,
      isLatest: String(latest.id) === id,
      prevId: prev ? String(prev.id) : null,
      prevNo: prev ? prev.quote_no || null : null,
    };
  }
  return out;
}

module.exports = { QUOTE_NO_RE, QUOTE_NO_ANY_RE, LEGACY_QUOTE_NO_RE, toYymm,
  withRevision, baseQuoteNo, shareQuoteNo,
  formatQuoteNo, kstToday, nextQuoteNo, normalizeTel, normalizeVendorNo, VENDOR_NO_MAX, buildRevisionMap };

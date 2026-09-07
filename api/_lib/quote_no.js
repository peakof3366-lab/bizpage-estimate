/* ═══════════════════════════════════════════════════════════════════════════
   견적번호 — **형식과 발급의 단일 출처** (WB)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「관리자에서 만들어진 모든 견적서는 넘버링이 되어야 한다.
   그리고 모든 자료가 공유되어야 담당자가 연차/휴가일 때도 응대가 가능하다.」

   감사에서 나온 것 — 전부 실측:
     · 식별자가 `mrx9l0xqhudmf1` 같은 랜덤 문자열이었다. 전화로 부를 수 없다.
     · 고객 견적서 엑셀이 **「발행일」 칸에 그 문자열**을 찍고 있었다(`d.iso`가 있는데 `d.id`를 썼다).
     · 웹사이트 FAQ는 「발행일, 견적 번호가 공문 수준으로 정리되어」라고 **말하고 있었다.**

   ── 형식: `Q260824-03`  (Q + YYMMDD + 그날 순번) ───────────────────────────
   **날짜를 번호에 넣는다.** 고객이 번호를 잊어도 「지난주 화요일쯤 받았다」로 찾을 수
   있어야 하기 때문이다 — 담당자가 휴가일 때 실제로 필요한 것이 그것이다.
   ⚠ 앞이 'Q'라 엑셀이 **문자로 읽는다.** 숫자로 시작하면 앞자리 0이 사라진다.

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

/* 번호 모양 — 화면·검사·엑셀이 전부 이 하나를 본다 */
const QUOTE_NO_RE = /^Q\d{6}-\d{2,}$/;

function formatQuoteNo(kstDay, n) {
  /* kstDay: 'YYYY-MM-DD' 또는 Date */
  const s = typeof kstDay === 'string' ? kstDay : new Date(kstDay).toISOString().slice(0, 10);
  const yymmdd = s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10);
  return 'Q' + yymmdd + '-' + String(n).padStart(2, '0');
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
    insert into quote_seq (day, n)
    values (((now() at time zone 'Asia/Seoul')::date), 1)
    on conflict (day) do update set n = quote_seq.n + 1
    returning n, day::text as day`;
  if (!rows.length) throw new Error('견적번호를 발급하지 못했습니다');
  return formatQuoteNo(rows[0].day, rows[0].n);
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

module.exports = { QUOTE_NO_RE, formatQuoteNo, kstToday, nextQuoteNo, normalizeTel, normalizeVendorNo, VENDOR_NO_MAX, buildRevisionMap };

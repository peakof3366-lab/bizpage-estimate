/* ═══════════════════════════════════════════════════════════════════════════
   ⛽ 유류할증료 월별 표 — 항공사 공지를 읽는 **단일 출처** (2026-10-02 대표 지시)
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 「링크 붙여넣기」인가
     대한항공 사이트는 서버 요청을 403으로 막고, 아시아나는 「이번 달 공지」를 찾는 목록을 막는다.
     **차단을 우회하지 않는다**(약관·무단 접근 소지, 그리고 막히면 틀린 값이 조용히 들어간다).
     공지 **상세 페이지는 공개**라, 담당자가 매달 중순 그 링크를 한 번 붙여넣으면 서버가 읽는다.
     아시아나는 매달 16일쯤 **다음 달 표를 미리 공지**한다 — 그래서 이 표가 「다음 달 예고」도 된다.

   ■ 🔴 서버가 직접 읽는다
     화면이 읽은 숫자를 받아 저장하지 않는다. 저장할 때 서버가 그 주소를 **다시 받아 다시 읽는다**
     (결함 생성기 ④ — 공개 입력을 신뢰한다). 주소는 **아시아나 공지 상세** 꼴만 받는다(SSRF 방지).

   ■ 🔴 틀리면 저장하지 않는다 (검산 넷)
     · 구간이 8개 이상 · 마일이 끊김 없이 이어진다 · 마지막 구간은 상한이 없다
     · 금액이 **거리순으로 줄지 않는다**(먼 곳이 가까운 곳보다 싸면 잘못 읽은 것이다)
     · 적용 월을 문서에서 읽었다
     하나라도 어긋나면 이유를 말하고 멈춘다 — 짐작해서 채우지 않는다.
     (실제로 첫 판이 마지막 구간 「5,000~」(mile 글자 없음)을 못 읽었고, 이 검산이 저장을 막았다.)

   ■ 양식이 달마다 조금 다르다 (2025-01 · 2025-10 · 2026-04 공지로 확인)
     `<li><strong>대권거리 A~B mile</strong> 도시들 <span>(3월) X원</span> <b>(4월) Y원</b></li>` 또는
     `<span>X원</span> <span>Y원</span>`(월 표시 없음). → **적용 월 표시가 있으면 그 금액, 없으면 마지막 금액.**
   ═══════════════════════════════════════════════════════════════════════════ */

/* 🔴 주소는 **공지 번호(id)만** 믿는다. 담당자가 목록에서 눌러 들어가 주소창을 복사하면
     `&dispCt=all&page=1` 같은 꼬리가 붙는다(실제 검색 결과 주소가 그랬다) — 꼬리를 탓해 거절하지 않고,
     번호만 뽑아 **표준 주소로 다시 만들어** 읽는다. 다른 사이트·다른 경로는 받지 않는다(SSRF 방지). */
const NOTICE_HOSTS = new Set(['m.flyasiana.com', 'flyasiana.com', 'www.flyasiana.com']);
const NOTICE_PATH = '/C/KR/KO/customer/notice/detail';
function normalizeNoticeUrl(u) {
  let x;
  try { x = new URL(String(u || '').trim()); } catch (e) { return null; }
  if (x.protocol !== 'https:' || !NOTICE_HOSTS.has(x.hostname) || x.pathname !== NOTICE_PATH) return null;
  if (x.username || x.password || x.port) return null;
  const id = x.searchParams.get('id') || '';
  if (!/^CM\d{10,30}$/.test(id)) return null;
  return `https://m.flyasiana.com${NOTICE_PATH}?id=${id}`;
}
function isAllowedNoticeUrl(u) { return normalizeNoticeUrl(u) !== null; }

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s).replace(/,/g, ''));

function parseAsianaNotice(html) {
  const errors = [];
  const src = String(html || '');
  const a = src.indexOf('cms_wrap');
  const body = a >= 0 ? src.slice(a, src.indexOf('//cms_wrap', a) > 0 ? src.indexOf('//cms_wrap', a) : a + 40000) : src;
  const text = stripTags(body);
  if (!/유류할증료/.test(text)) return { ok: false, errors: ['유류할증료 공지가 아닙니다'] };
  if (!/한국\s*출발\s*국제선/.test(text)) errors.push('「한국 출발 국제선」 공지가 아닙니다');

  /* 적용 월 — 「발권 적용일 : 2026년 4월 1일 ~」 → 없으면 첫 문장 「2026년 4월 1일 부」 */
  let m = text.match(/발권\s*적용일\s*:?\s*(\d{4})년\s*(\d{1,2})월/) || text.match(/(\d{4})년\s*(\d{1,2})월\s*1일\s*부/);
  const month = m ? `${m[1]}-${String(m[2]).padStart(2, '0')}` : null;
  if (!month) errors.push('적용 월을 문서에서 찾지 못했습니다');
  const monthNo = m ? Number(m[2]) : null;

  const bands = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let li;
  while ((li = liRe.exec(body)) !== null) {
    const inner = li[1];
    const head = inner.match(/<strong[^>]*>\s*대권거리\s*([\d,]*)\s*~\s*([\d,]*)\s*(?:mile|마일)?\s*<\/strong>/i);
    if (!head) continue;
    const min = head[1] ? num(head[1]) : 0;
    const max = head[2] ? num(head[2]) : null;
    const afterHead = inner.slice(inner.indexOf(head[0]) + head[0].length);
    const citiesPart = afterHead.split(/<span|<b[\s>]/)[0];
    const cities = stripTags(citiesPart).split(/\s*,\s*/).map((c) => c.trim()).filter(Boolean);
    const amounts = [];
    const amtRe = /(?:\((\d{1,2})월\)\s*)?([\d,]{3,})\s*원/g;
    const flat = stripTags(afterHead);
    let am;
    while ((am = amtRe.exec(flat)) !== null) amounts.push({ mon: am[1] ? Number(am[1]) : null, v: num(am[2]) });
    if (!amounts.length) { errors.push(`${min}~${max || ''}마일 구간의 금액을 못 읽었습니다`); continue; }
    const labeled = monthNo != null ? amounts.find((x) => x.mon === monthNo) : null;
    const pick = labeled || amounts[amounts.length - 1];
    bands.push({ min, max, oneway: pick.v, cities, prevOneway: amounts.length > 1 && amounts[0] !== pick ? amounts[0].v : null });
  }

  /* 검산 */
  if (bands.length < 8) errors.push(`구간이 ${bands.length}개뿐입니다(8개 이상이어야 합니다)`);
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (!(b.oneway > 0)) errors.push(`${b.min}마일~ 구간 금액이 0입니다`);
    if (i === 0 && b.min !== 0) errors.push('첫 구간이 0마일부터 시작하지 않습니다');
    if (i > 0) {
      const p = bands[i - 1];
      if (p.max == null || b.min !== p.max + 1) errors.push(`${p.min}~${p.max}마일 다음이 ${b.min}마일로 이어지지 않습니다`);
      if (b.oneway < p.oneway) errors.push(`${b.min}마일~ 구간(${b.oneway}원)이 더 가까운 구간(${p.oneway}원)보다 쌉니다 — 잘못 읽었을 수 있습니다`);
    }
  }
  if (bands.length && bands[bands.length - 1].max != null) errors.push('마지막 구간에 상한이 있습니다(「5,000~」 꼴이어야 합니다)');
  return { ok: errors.length === 0, errors, month, airline: 'OZ', bands };
}

async function fetchNotice(url, opts = {}) {
  const canon = normalizeNoticeUrl(url);
  if (!canon) return { ok: false, errors: ['아시아나 공지 상세 주소만 받습니다 (m.flyasiana.com/C/KR/KO/customer/notice/detail?id=CM…)'] };
  const fetchFn = opts.fetch || fetch;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs || 10000) : null;
  try {
    /* ⚠ 다른 곳으로 넘겨 주는 응답(redirect)은 따라가지 않는다 — 넘겨진 곳이 아시아나가 아닐 수 있다 */
    const r = await fetchFn(canon, { headers: { 'User-Agent': 'Mozilla/5.0 (bizpage fuel notice reader)' }, redirect: 'error', signal: ctrl ? ctrl.signal : undefined });
    if (!r.ok) return { ok: false, errors: [`공지 페이지를 받지 못했습니다 (HTTP ${r.status})`] };
    const html = await r.text();
    if (html.length > 2000000) return { ok: false, errors: ['페이지가 너무 큽니다'] };
    return Object.assign(parseAsianaNotice(html), { url: canon });
  } catch (e) {
    return { ok: false, errors: ['공지 페이지를 받지 못했습니다 (' + (e && e.name === 'AbortError' ? '시간 초과' : '접속 실패') + ')'] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ── 목적지 → 구간 ───────────────────────────────────────────────────────── */
const EDGE_MILES = 100;
function bandOfMiles(bands, miles) {
  return bands.findIndex((b) => miles >= b.min && (b.max == null || miles <= b.max));
}
function nearEdge(bands, miles) {
  return bands.some((b, i) => i > 0 && Math.abs(miles - b.min) < EDGE_MILES);
}

/* 한 목적지의 구간을 정한다. 순서: 담당자 지정 → 공지의 도시 → 거리 계산.
   🔴 공지 도시와 거리 계산이 갈리면 **공지를 따르되 어긋났다고 말한다.** */
function resolveBand(destKey, route, bands, overrides) {
  if (!route) return { band: -1, basis: 'unknown' };
  if (route.domestic) return { band: -1, basis: 'domestic' };
  const byMiles = bandOfMiles(bands, route.miles);
  const ov = overrides && overrides[destKey];
  if (ov != null) {
    const i = bands.findIndex((b) => b.min === Number(ov));
    if (i >= 0) return { band: i, basis: 'override', byMiles };
  }
  if (route.city) {
    const i = bands.findIndex((b) => (b.cities || []).includes(route.city));
    if (i >= 0) return { band: i, basis: 'city', byMiles, cityMismatch: i !== byMiles };
  }
  return { band: byMiles, basis: 'miles', byMiles, nearEdge: nearEdge(bands, route.miles) };
}

/* 적용 중인 표 · 다음 달 예고 (KST 기준 월) */
function kstMonth(d) {
  const t = new Date((d || new Date()).getTime() + 9 * 3600 * 1000);
  return t.toISOString().slice(0, 7);
}
function pickTables(months, today) {
  const cur = today || kstMonth();
  const keys = Object.keys(months || {}).sort();
  const active = keys.filter((k) => k <= cur).pop() || null;
  const next = keys.filter((k) => k > cur).shift() || null;
  return { current: cur, active, next, currentMissing: active !== cur };
}

module.exports = {
  normalizeNoticeUrl, isAllowedNoticeUrl, parseAsianaNotice, fetchNotice,
  bandOfMiles, nearEdge, resolveBand, kstMonth, pickTables, EDGE_MILES,
  TABLES_KEY: 'fuel_tables',
  OVERRIDES_KEY: 'fuel_band_overrides',
};

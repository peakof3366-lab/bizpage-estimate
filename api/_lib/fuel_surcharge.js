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

  validateBands(bands, errors, []);
  return { ok: errors.length === 0, errors, month, airline: 'OZ', bands };
}

/* ── 검산 — **두 읽기 방식(링크·본문 붙여넣기)이 같은 함수를 지난다** ─────────────
   규칙이 두 벌이면 한쪽만 느슨해진다(결함 생성기 ①).
   ⚠ 마지막 구간: 아시아나는 「5,000~」(상한 없음)이고 대한항공은 「10,000~」(상파울루)까지 있다.
     대한항공 10,000마일 이상처럼 **금액이 빈 맨 끝 구간**은 빼고(경고로 남김), 대신 남은 표가
     **우리 목적지 중 가장 먼 곳까지 덮는지** 본다 — 덮으면 상한이 있어도 괜찮다. */
const MIN_BANDS = 8;
function maxRouteMiles() {
  try {
    const R = require('../../data.js').DEST_FUEL_ROUTE || {};
    return Math.max(0, ...Object.values(R).filter((v) => !v.domestic).map((v) => v.miles));
  } catch (e) { return 0; }
}
function validateBands(bands, errors, warnings) {
  /* 금액이 빈 **맨 끝** 구간은 걷어 낸다(대한항공 10,000마일~ 상파울루) */
  while (bands.length && !(bands[bands.length - 1].oneway > 0)) {
    const b = bands.pop();
    warnings.push(`${b.min.toLocaleString()}마일~ 구간은 금액이 비어 뺐습니다`);
  }
  if (bands.length < MIN_BANDS) errors.push(`구간이 ${bands.length}개뿐입니다(${MIN_BANDS}개 이상이어야 합니다)`);
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
  const last = bands[bands.length - 1];
  const need = maxRouteMiles();
  if (last && last.max != null && last.max < need) errors.push(`표가 ${last.max.toLocaleString()}마일까지만 있어 우리 목적지(최대 ${need.toLocaleString()}마일)를 다 덮지 못합니다`);
}

/* ── 본문 붙여넣기 (2026-10-02 대표 결정: 기준 = 대한항공) ──────────────────────
   대한항공 사이트는 서버 요청을 막는다(403). 그래서 서버가 받으러 가지 않고, **담당자가
   공지 화면에서 표를 복사해 붙여넣은 글**을 읽는다. 사람이 보는 화면을 옮기는 것이라 차단을 건드리지 않는다.
   12/17 합병 뒤에도(아시아나 공지가 없어져도) 그대로 쓴다.
   ⚠ 표를 복사하면 **한 줄에 한 구간**이 온다(브라우저 표 복사는 칸을 탭으로, 줄을 줄바꿈으로 준다).
   ⚠ 줄에서 읽는 것: 구간(「500 ~ 999」·「~ 499」·「10,000 ~」·「대권거리 500~999 mile」) · 금액(「65,800원」).
     금액이 둘이면(전월·이번 달) **머리의 월 순서**로 고르고, 모르면 뒤의 것.
   ⚠ 날짜 줄(「2026년 10월 1일 ~ 10월 31일」)을 구간으로 읽지 않는다 — 「년/월/일」이 든 줄은 구간 후보에서 뺀다. */
const AIRLINES = { KE: '대한항공', OZ: '아시아나항공' };
function parseNoticeText(text, opts = {}) {
  const errors = [];
  const warnings = [];
  const src = String(text || '').replace(/ /g, ' ').replace(/\r/g, '');
  if (src.length > 200000) return { ok: false, errors: ['붙여넣은 글이 너무 깁니다'], warnings };
  if (!/유류\s*할증료|Fuel\s*Surcharge/i.test(src)) errors.push('유류할증료 공지가 아닌 것 같습니다 — 공지 제목·안내 문장까지 함께 복사해 주세요');
  let airline = opts.airline && AIRLINES[opts.airline] ? opts.airline : null;
  if (!airline) airline = /대한항공|Korean\s*Air/i.test(src) ? 'KE' : (/아시아나/.test(src) ? 'OZ' : null);
  if (!airline) errors.push('어느 항공사 공지인지 모릅니다 — 항공사를 골라 주세요');
  if (/국내선/.test(src) && !/국제선/.test(src)) errors.push('국내선 공지입니다 — 「국제선」 공지를 넣어 주세요');

  /* 적용 월 — 「YYYY년 M월 1일 부/~/부터」 → 없으면 글에 나온 가장 늦은 「YYYY년 M월」 */
  const monthsSeen = [...src.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월/g)].map((m) => `${m[1]}-${String(m[2]).padStart(2, '0')}`);
  const app = src.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*1\s*일\s*(?:부|~|부터|발권)/);
  const month = app ? `${app[1]}-${String(app[2]).padStart(2, '0')}` : (monthsSeen.length ? monthsSeen.slice().sort().pop() : null);
  if (!month) errors.push('적용 월을 글에서 찾지 못했습니다 — 「2026년 10월 1일 ~」 같은 안내 문장까지 복사해 주세요');
  /* 머리줄의 월 순서 — 「2026년 9월 2026년 10월」 꼴이 한 줄에 둘 이상이면 금액 칸 순서다 */
  let colMonths = null;
  for (const line of src.split('\n')) {
    const ms = [...line.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)/g)].map((m) => `${m[1]}-${String(m[2]).padStart(2, '0')}`);
    if (ms.length >= 2 && !/원/.test(line)) { colMonths = ms; break; }
  }

  const bands = [];
  const RANGE = /(?:대권\s*거리\s*)?(\d{1,2},\d{3}|\d{1,5})?\s*[~∼～\-–]\s*(\d{1,2},\d{3}|\d{1,5})?\s*(?:마일|mile|miles)?/i;
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || /\d\s*(?:년|월|일)/.test(line)) continue;
    const r = line.match(RANGE);
    if (!r || (!r[1] && !r[2])) continue;
    /* 구간이 줄 **앞쪽**에 있어야 한다(도시 이름 안의 「-」를 구간으로 읽지 않게) */
    if (r.index > 12) continue;
    const min = r[1] ? num(r[1]) : 0;
    const max = r[2] ? num(r[2]) : null;
    if (max != null && max < min) continue;
    const rest = line.slice(r.index + r[0].length);
    const amounts = [...rest.matchAll(/([\d,]{3,})\s*원/g)].map((m) => num(m[1]));
    const cities = rest.split(/[\d,]{3,}\s*원/)[0].replace(/^[\s|·:]+/, '').split(/\s*[,，/]\s*/).map((c) => c.trim()).filter(Boolean);
    let oneway = null;
    if (amounts.length) {
      const idx = colMonths && colMonths.length === amounts.length && month ? colMonths.indexOf(month) : -1;
      oneway = idx >= 0 ? amounts[idx] : amounts[amounts.length - 1];
    }
    const prev = amounts.length > 1 ? amounts.find((v) => v !== oneway) || null : null;
    bands.push({ min, max, oneway: oneway || 0, cities, prevOneway: prev });
  }
  if (!bands.length) errors.push('표에서 거리 구간을 하나도 찾지 못했습니다 — 표를 줄 단위로(드래그해서) 복사해 주세요');
  bands.sort((a, b) => a.min - b.min);
  validateBands(bands, errors, warnings);
  return { ok: errors.length === 0, errors, warnings, month, airline, bands };
}

/* ── 저장 모양 — 달마다 항공사별로 ─────────────────────────────────────────
   { months: { '2026-10': { KE: {bands,…}, OZ: {bands,…} } } }
   ⚠ 첫 판은 { months: { '2026-10': {airline:'OZ', bands} } }였다 — 읽을 때 새 모양으로 바꿔 읽는다. */
const BASIS_AIRLINE = 'KE';   /* 2026-10-02 대표 결정 — 12/17 합병 뒤 남는 회사 · 국내 대형사 중 높은 편(모자라지 않게) */
function normalizeMonths(months) {
  const out = {};
  for (const [m, v] of Object.entries(months || {})) {
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v.bands)) out[m] = { [v.airline || 'OZ']: v };
    else out[m] = Object.fromEntries(Object.entries(v).filter(([k, t]) => AIRLINES[k] && t && Array.isArray(t.bands)));
  }
  return out;
}
/* 기준 항공사 표를 고른다. 기준 항공사 표가 없는 달은 **건너뛴다** — 다른 항공사 표로 조용히 갈아타지 않는다(결함 생성기 ②).
   대신 「이번 달 아시아나 표는 있다」를 `otherOnly`로 알려 화면이 말하게 한다. */
function pickBasis(months, today, basis) {
  const B = basis || BASIS_AIRLINE;
  const norm = normalizeMonths(months);
  const keys = Object.keys(norm).filter((k) => norm[k][B]).sort();
  const p = pickTables(Object.fromEntries(keys.map((k) => [k, 1])), today);
  const cur = p.current;
  const otherOnly = norm[cur] && !norm[cur][B] ? Object.keys(norm[cur]) : [];
  return Object.assign(p, { basis: B, otherOnly });
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
/* ⚠ 공지 도시로 맞추는 것은 **아시아나 표에서만** 한다 — `city`는 아시아나 공지 표기다.
     대한항공 표는 「나리타」「상하이 푸동」처럼 다르게 적어서, 같은 이름으로 맞추면 엉뚱하게 맞거나 빠진다. */
function resolveBand(destKey, route, bands, overrides, opts) {
  if (!route) return { band: -1, basis: 'unknown' };
  if (route.domestic) return { band: -1, basis: 'domestic' };
  const byMiles = bandOfMiles(bands, route.miles);
  const ov = overrides && overrides[destKey];
  if (ov != null) {
    const i = bands.findIndex((b) => b.min === Number(ov));
    if (i >= 0) return { band: i, basis: 'override', byMiles };
  }
  if (route.city && !(opts && opts.noCity)) {
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
  parseNoticeText, validateBands, normalizeMonths, pickBasis, BASIS_AIRLINE, AIRLINES,
  bandOfMiles, nearEdge, resolveBand, kstMonth, pickTables, EDGE_MILES,
  TABLES_KEY: 'fuel_tables',
  OVERRIDES_KEY: 'fuel_band_overrides',
};

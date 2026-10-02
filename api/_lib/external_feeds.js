/* ═══════════════════════════════════════════════════════════════════════════
   바깥 공식 자료를 매일 받아 온다 — **단일 출처** (2026-10-02 대표 지시)
   ───────────────────────────────────────────────────────────────────────────
   「외부에서 가져와서 우리 견적에 도움이 될 정보를 주기적으로 업데이트」.
   매일 05:00(KST) `api/rates.js?cron=1`이 이 파일을 부른다(vercel.json).

   ■ 받는 것 둘
     ① **환율** — 한국수출입은행 매매기준율(공식). 그 표에 없는 통화(VND·PHP·TWD 등)는
        예전 출처(fawazahmed0 currency-api)로 메운다. **통화마다 어디서 왔는지 남긴다.**
     ② **한국 공휴일** — 한국천문연구원 특일정보(공공데이터포털). 올해~2년 뒤.
        받은 날짜로 **우리 성수기 달력(data.js LUNAR_PEAKS·PEAK_CALENDAR)을 대조**한다.

   ■ 🔴 금액을 스스로 바꾸지 않는다
     환율은 예전부터 그랬듯 `fx_rates`에 들어가 엔진이 ±30% 안에서 보정한다(그대로다).
     공휴일은 **달력을 고치지 않는다** — 빠진 연휴·어긋난 날짜를 **알리기만** 한다.
     성수기 계수는 고객 금액이라 사람이 판단한다(CLAUDE.md 승인 범위).

   ■ 🔴 조용히 실패하지 않는다 (결함 생성기 ②·③)
     예전 자동 실행은 결과를 **어디에도 안 남겼다** — 매일 실패해도 아무도 몰랐다.
     이제 매 실행이 `app_settings.ext_feed_status`에 「언제·무엇이·어디서·왜 실패」를 적고,
     요율 관리 화면이 그걸 띄운다. 인증키가 없으면 `no_key`라고 **말한다**(빈 성공이 아니다).

   ■ 인증키 (Vercel 환경변수 — 대표가 넣는다)
     EXIM_API_KEY     https://www.koreaexim.go.kr → Open API → 환율 (무료)
     DATA_GO_KR_KEY   https://www.data.go.kr → 「한국천문연구원_특일 정보」 활용신청 (무료)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 공통: 날짜 (KST) ───────────────────────────────────────────────────── */
function kstYmd(d) {
  const t = new Date((d || new Date()).getTime() + 9 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}
function addDays(ymd, n) {
  const t = new Date(ymd + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/* ── ① 환율 — 수출입은행 ───────────────────────────────────────────────────
   ⚠ 함정 셋 (문서·실측):
     · 영업일 **11시 전후**에 그날 값이 올라온다. 자동 실행은 05:00이라 **오늘은 비어 있다** —
       빈 배열이면 하루씩 거슬러 간다(주말·공휴일도 비어 있다). 최대 7일.
     · `JPY(100)`·`IDR(100)`은 **100단위** 값이다. 나눠야 1단위가 된다.
     · 숫자가 `"1,358.6"`처럼 **쉼표 든 문자열**이다.
     · `result !== 1`이면 키 오류·한도 초과 등이다 — 빈 값과 다르게 말한다.
   🔴 코드는 **그대로만** 쓴다. `CNH`(역외 위안)를 `CNY` 자리에 넣지 않는다 — 비슷해도 다른 값이다. */
const EXIM_URL = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';

function parseEximRows(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || Number(r.result) !== 1) continue;
    const m = String(r.cur_unit || '').trim().match(/^([A-Z]{3})(?:\((\d+)\))?$/);
    if (!m) continue;
    const per = m[2] ? Number(m[2]) : 1;
    const v = Number(String(r.deal_bas_r || '').replace(/,/g, ''));
    if (!Number.isFinite(v) || v <= 0 || !per) continue;
    out[m[1]] = v / per;
  }
  return out;
}

async function fetchEximRates(authKey, opts = {}) {
  const fetchFn = opts.fetch || fetch;
  const today = opts.today || kstYmd();
  if (!authKey) return { ok: false, reason: 'no_key', rates: {} };
  let lastErr = '';
  for (let back = 0; back < 7; back++) {
    const day = addDays(today, -back);
    const url = `${EXIM_URL}?authkey=${encodeURIComponent(authKey)}&searchdate=${day.replace(/-/g, '')}&data=AP01`;
    try {
      const r = await fetchFn(url);
      if (!r.ok) { lastErr = 'http_' + r.status; continue; }
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length && rows.every((x) => Number(x && x.result) !== 1)) {
        /* 2 = 데이터 코드 오류, 3 = 인증키 오류, 4 = 일일 제한 — 날을 바꿔도 안 풀린다 */
        return { ok: false, reason: 'exim_result_' + Number(rows[0].result), rates: {} };
      }
      const rates = parseEximRows(rows);
      if (Object.keys(rates).length) return { ok: true, date: day, rates };
      lastErr = 'empty';
    } catch (e) {
      lastErr = 'fetch_error';
    }
  }
  return { ok: false, reason: lastErr || 'empty', rates: {} };
}

/* 예전 출처 (api/rates.js에 있던 것을 그대로 옮겼다) — 수출입은행 표에 없는 통화를 메운다 */
async function fetchFallbackRate(currency, opts = {}) {
  const fetchFn = opts.fetch || fetch;
  const code = currency.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${code}.json`,
  ];
  for (const url of urls) {
    try {
      const r = await fetchFn(url);
      if (!r.ok) continue;
      const data = await r.json();
      const rate = data[code] && data[code].krw;
      if (typeof rate === 'number' && rate > 0) return { rate, date: data.date || null };
    } catch {
      /* 다음 URL로 */
    }
  }
  return null;
}

/* 통화 목록을 받아 { currency: {rate, source, date} }와 상태를 만든다. 저장은 부르는 쪽이 한다. */
async function collectFx(currencies, opts = {}) {
  const exim = await fetchEximRates(opts.eximKey, opts);
  const got = {};
  const failed = [];
  for (const cur of currencies) {
    if (cur === 'KRW') continue;
    if (exim.ok && exim.rates[cur]) { got[cur] = { rate: exim.rates[cur], source: 'exim', date: exim.date }; continue; }
    const fb = await fetchFallbackRate(cur, opts);
    if (fb) got[cur] = { rate: fb.rate, source: 'fallback', date: fb.date };
    else failed.push(cur);
  }
  const bySource = { exim: 0, fallback: 0 };
  for (const v of Object.values(got)) bySource[v.source]++;
  return {
    got,
    status: {
      ok: Object.keys(got).length, failed, bySource,
      exim: exim.ok ? { ok: true, date: exim.date } : { ok: false, reason: exim.reason },
    },
  };
}

/* ── ② 한국 공휴일 — 특일정보 ──────────────────────────────────────────────
   ⚠ `items.item`은 **하나면 객체, 여럿이면 배열**이다(공공데이터포털 공통 함정).
   ⚠ `locdate`는 숫자 20260925다. */
const HOLIDAY_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

function parseHolidayBody(body) {
  const header = body && body.response && body.response.header;
  if (header && String(header.resultCode) !== '00') return { ok: false, reason: 'api_' + header.resultCode };
  const items = body && body.response && body.response.body && body.response.body.items;
  let list = items && items.item;
  if (!list) list = [];
  if (!Array.isArray(list)) list = [list];
  const out = [];
  for (const it of list) {
    const s = String(it && it.locdate || '');
    if (!/^\d{8}$/.test(s)) continue;
    if (it.isHoliday && it.isHoliday !== 'Y') continue;
    out.push({ date: s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8), name: String(it.dateName || '').trim() });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, holidays: out };
}

async function fetchKrHolidays(serviceKey, years, opts = {}) {
  const fetchFn = opts.fetch || fetch;
  if (!serviceKey) return { ok: false, reason: 'no_key', years: {} };
  const result = {};
  const errors = [];
  for (const y of years) {
    /* ⚠ 공공데이터포털 키는 「인코딩 키」를 그대로 넣거나 「디코딩 키」를 인코딩해 넣는다.
         둘 중 무엇을 받았는지 모르므로, 이미 %가 들어 있으면 다시 인코딩하지 않는다. */
    const key = /%[0-9A-Fa-f]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
    const url = `${HOLIDAY_URL}?serviceKey=${key}&solYear=${y}&numOfRows=100&_type=json`;
    try {
      const r = await fetchFn(url);
      if (!r.ok) { errors.push(y + ':http_' + r.status); continue; }
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { errors.push(y + ':not_json'); continue; }  /* 키 오류는 XML로 온다 */
      const p = parseHolidayBody(body);
      if (!p.ok) { errors.push(y + ':' + p.reason); continue; }
      /* 🔴 0건은 실패로 친다 — 한 해에 공휴일이 없을 수는 없다. 빈 성공으로 저장하면
           대조가 「빠진 연휴 0」이라고 거짓말한다(결함 생성기 ②). */
      if (!p.holidays.length) { errors.push(y + ':empty'); continue; }
      result[y] = p.holidays;
    } catch {
      errors.push(y + ':fetch_error');
    }
  }
  return { ok: Object.keys(result).length > 0, years: result, errors };
}

/* ── 대조: 공식 공휴일 ↔ 우리 성수기 달력 ──────────────────────────────────
   ① 설날·추석 — 공식 날짜(3일)가 우리 `LUNAR_PEAKS`의 「설 연휴」·「추석 연휴」(keys:'ALL')
      구간 안에 **다 들어 있는가.** 해가 통째로 없으면 `missing`, 걸치면 `mismatch`.
      (data.js 주석: 「음력→양력 날짜는 사장님 확인 필요(공식 관공서 달력 기준)」 — 그 확인을 이것이 한다.)
   ② 긴 연휴 — 주말+공휴일이 **4일 이상 이어지는 구간** 중 우리 'ALL' 피크와 **하루도 안 겹치는** 것.
      ⚠ 이건 「후보」다. 연휴라고 항공권이 꼭 오르지는 않는다 — 판단은 사람이 한다. */
function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
function inPeakAll(ymd, peakCalendar, lunarPeaks) {
  for (const p of lunarPeaks || []) {
    if (p.keys === 'ALL' && ymd >= p.from && ymd <= p.to) return p.label;
  }
  const md = ymd.slice(5);
  for (const p of peakCalendar || []) {
    if (p.keys !== 'ALL') continue;
    const hit = p.from <= p.to ? (md >= p.from && md <= p.to) : (md >= p.from || md <= p.to);
    if (hit) return p.label;
  }
  return '';
}

function checkCalendar(holidayYears, peakCalendar, lunarPeaks, opts = {}) {
  const lunar = [];
  const longBreaks = [];
  const today = opts.today || kstYmd();
  for (const [y, list] of Object.entries(holidayYears || {})) {
    for (const [name, label] of [['설날', '설 연휴'], ['추석', '추석 연휴']]) {
      const days = list.filter((h) => h.name === name).map((h) => h.date);
      if (!days.length) continue;
      const lo = days[0], hi = days[days.length - 1];
      const peak = (lunarPeaks || []).find((p) => p.keys === 'ALL' && p.label === label && p.from.slice(0, 4) === String(y));
      let state = 'ok';
      if (!peak) state = 'missing';
      else if (!(peak.from <= lo && peak.to >= hi)) state = 'mismatch';
      lunar.push({ year: Number(y), name, official: { from: lo, to: hi }, ours: peak ? { from: peak.from, to: peak.to } : null, state });
    }
    /* 긴 연휴 — 그 해 공휴일 주변의 주말까지 이어 붙인다 */
    const set = new Set(list.map((h) => h.date));
    const isOff = (d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6 || set.has(d); };
    const seen = new Set();
    for (const h of list) {
      if (seen.has(h.date)) continue;
      let a = h.date, b = h.date;
      while (isOff(addDays(a, -1))) a = addDays(a, -1);
      while (isOff(addDays(b, 1))) b = addDays(b, 1);
      const span = dayRange(a, b);
      span.forEach((d) => seen.add(d));
      if (span.length < 4 || b < today) continue;
      if (span.some((d) => inPeakAll(d, peakCalendar, lunarPeaks))) continue;
      const names = [...new Set(list.filter((x) => x.date >= a && x.date <= b).map((x) => x.name))];
      longBreaks.push({ from: a, to: b, days: span.length, names });
    }
  }
  lunar.sort((p, q) => (p.official.from < q.official.from ? -1 : 1));
  longBreaks.sort((p, q) => (p.from < q.from ? -1 : 1));
  return {
    lunar,
    lunarProblems: lunar.filter((x) => x.state !== 'ok').length,
    longBreaks,
  };
}

module.exports = {
  kstYmd, addDays,
  parseEximRows, fetchEximRates, fetchFallbackRate, collectFx,
  parseHolidayBody, fetchKrHolidays,
  checkCalendar, inPeakAll,
  STATUS_KEY: 'ext_feed_status',
  HOLIDAYS_KEY: 'ext_kr_holidays',
};

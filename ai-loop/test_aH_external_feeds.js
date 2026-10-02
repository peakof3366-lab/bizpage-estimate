/* ══════════════════════════════════════════════════════════════════════════
   바깥 공식 자료 자동 갱신 (2026-10-02) — 환율(수출입은행) · 한국 공휴일(특일정보)

   ■ 왜 필요한가
   대표: 「외부에서 가져와서 우리 견적에 도움이 될 정보를 주기적으로 업데이트」.
   그리고 예전 자동 실행은 **결과를 어디에도 안 남겼다** — 매일 실패해도 아무도 몰랐다.

   ■ 무엇을 보나 (바깥 접속 없음 — 가짜 응답을 흘린다, 운영 DB 미접속)
     [1] 수출입은행 응답 읽기 — 100단위·쉼표·실패 코드·코드 그대로(CNH≠CNY)
     [2] 05:00엔 오늘 값이 없다 → 거슬러 간다 · 키 오류는 날을 바꿔도 안 풀린다
     [3] 표에 없는 통화는 예전 출처로 메우고 **어디서 왔는지 남긴다**
     [4] 공휴일 응답 — 한 건이면 객체 · 키 오류는 XML · 0건은 실패
     [5] 🔴 공식 설·추석 ↔ 우리 LUNAR_PEAKS 대조 — 지금 달력 + 고장 주입
     [6] 🔴 자동 실행이 **실패해도 기록을 남기고**, 어제의 좋은 값을 안 지운다
   ══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
};

/* ── 가짜 DB (운영 미접속) — app_settings·fx_rates만 흉내 ── */
const DB = { settings: {}, fx: {} };
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: (strings, ...vals) => Promise.resolve().then(() => {
      const q = strings.join('?');
      if (/select value from app_settings where key/.test(q)) {
        return DB.settings[vals[0]] !== undefined ? [{ value: DB.settings[vals[0]] }] : [];
      }
      if (/insert into app_settings/.test(q)) { DB.settings[vals[0]] = JSON.parse(vals[1]); return []; }
      if (/insert into fx_rates/.test(q)) { DB.fx[vals[0]] = vals[1]; return []; }
      if (/select distinct currency from custom_destinations/.test(q)) return [{ currency: 'XAF' }];
      return [];
    }),
  },
};

const F = require(path.join(ROOT, 'api', '_lib', 'external_feeds.js'));
const D = require(path.join(ROOT, 'data.js'));
const resp = (body, { status = 200, text } = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => (text !== undefined ? text : JSON.stringify(body)),
});

(async () => {
  console.log('\n[1] 수출입은행 응답 읽기');
  {
    const r = F.parseEximRows([
      { result: 1, cur_unit: 'USD', deal_bas_r: '1,358.6' },
      { result: 1, cur_unit: 'JPY(100)', deal_bas_r: '857.5' },
      { result: 1, cur_unit: 'IDR(100)', deal_bas_r: '8.21' },
      { result: 1, cur_unit: 'CNH', deal_bas_r: '190.1' },
      { result: 2, cur_unit: 'EUR', deal_bas_r: '1,500' },
      { result: 1, cur_unit: 'KRW', deal_bas_r: '1' },
    ]);
    ok('① 쉼표를 걷는다 (USD 1,358.6 → 1358.6)', r.USD === 1358.6, String(r.USD));
    ok('🔴 ① JPY(100)은 100으로 나눈다', Math.abs(r.JPY - 8.575) < 1e-9, String(r.JPY));
    ok('① IDR(100)도', Math.abs(r.IDR - 0.0821) < 1e-9, String(r.IDR));
    ok('🔴 ① CNH를 CNY 자리에 넣지 않는다', r.CNY === undefined && r.CNH === 190.1);
    ok('① result가 1이 아닌 줄은 버린다', r.EUR === undefined);
  }

  console.log('\n[2] 오늘 값이 없으면 거슬러 간다 · 키 오류는 바로 멈춘다');
  {
    const asked = [];
    const fake = async (url) => {
      const d = url.match(/searchdate=(\d{8})/)[1]; asked.push(d);
      if (d === '20261002' || d === '20261001') return resp([]);       /* 05:00 · 공휴일 */
      return resp([{ result: 1, cur_unit: 'USD', deal_bas_r: '1,357.0' }]);
    };
    const r = await F.fetchEximRates('K', { fetch: fake, today: '2026-10-02' });
    ok('② 빈 날을 건너 9/30 값을 쓴다', r.ok && r.date === '2026-09-30' && r.rates.USD === 1357, JSON.stringify(r));
    ok('② 세 번 물었다 (10/2 → 10/1 → 9/30)', asked.join(',') === '20261002,20261001,20260930', asked.join(','));
    let n = 0;
    const bad = async () => { n++; return resp([{ result: 3 }]); };
    const r3 = await F.fetchEximRates('K', { fetch: bad, today: '2026-10-02' });
    ok('🔴 ② 인증키 오류(result 3)는 이유를 말하고 한 번만 묻는다', !r3.ok && r3.reason === 'exim_result_3' && n === 1, JSON.stringify(r3) + ' n=' + n);
    const r0 = await F.fetchEximRates('', { fetch: bad });
    ok('🔴 ② 키가 없으면 no_key (빈 성공이 아니다)', !r0.ok && r0.reason === 'no_key');
  }

  console.log('\n[3] 표에 없는 통화는 예전 출처로 — 어디서 왔는지 남긴다');
  {
    const fake = async (url) => {
      if (/koreaexim/.test(url)) return resp([{ result: 1, cur_unit: 'USD', deal_bas_r: '1,357.0' }, { result: 1, cur_unit: 'JPY(100)', deal_bas_r: '857' }]);
      if (/currencies\/vnd\.json/.test(url)) return resp({ date: '2026-10-01', vnd: { krw: 0.0523 } });
      return resp({}, { status: 404 });
    };
    const { got, status } = await F.collectFx(['USD', 'JPY', 'VND', 'MNT', 'KRW'], { eximKey: 'K', fetch: fake, today: '2026-10-02' });
    ok('③ USD·JPY는 수출입은행', got.USD.source === 'exim' && got.JPY.source === 'exim');
    ok('③ VND는 예전 출처로 메운다', got.VND && got.VND.source === 'fallback' && got.VND.rate === 0.0523);
    ok('🔴 ③ 아무 데도 없는 MNT는 「실패」로 남는다 (조용히 빠지지 않는다)', status.failed.join() === 'MNT', status.failed.join());
    ok('③ KRW는 묻지 않는다', !got.KRW && !status.failed.includes('KRW'));
    ok('③ 출처별 개수', status.bySource.exim === 2 && status.bySource.fallback === 1, JSON.stringify(status.bySource));
  }

  console.log('\n[4] 공휴일 응답');
  {
    const one = F.parseHolidayBody({ response: { header: { resultCode: '00' }, body: { items: { item: { locdate: 20260301, dateName: '삼일절', isHoliday: 'Y' } } } } });
    ok('🔴 ④ 한 건이면 객체로 온다 — 그래도 읽는다', one.ok && one.holidays.length === 1 && one.holidays[0].date === '2026-03-01');
    const err = F.parseHolidayBody({ response: { header: { resultCode: '30' } } });
    ok('④ resultCode가 00이 아니면 실패', !err.ok && err.reason === 'api_30');
    const asked = [];
    const xml = async (url) => { asked.push(url); return resp(null, { text: '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>' }); };
    const rx = await F.fetchKrHolidays('a%2Bb', [2026], { fetch: xml });
    ok('🔴 ④ 키 오류는 XML로 온다 — 실패로 친다', !rx.ok && rx.errors[0] === '2026:not_json', JSON.stringify(rx.errors));
    ok('④ 이미 인코딩된 키(%)를 두 번 인코딩하지 않는다', /serviceKey=a%2Bb&/.test(asked[0]), asked[0]);
    const empty = async () => resp({ response: { header: { resultCode: '00' }, body: { items: '' } } });
    const re = await F.fetchKrHolidays('K', [2030], { fetch: empty });
    ok('🔴 ④ 0건은 실패다 (한 해에 공휴일이 없을 수 없다)', !re.ok && re.errors[0] === '2030:empty', JSON.stringify(re.errors));
    const rn = await F.fetchKrHolidays('', [2026], { fetch: empty });
    ok('④ 키가 없으면 no_key', !rn.ok && rn.reason === 'no_key');
  }

  console.log('\n[5] 🔴 공식 설·추석 ↔ 우리 성수기 달력 (data.js)');
  /* 2026·2027 공식 날짜 (대한민국 관공서 공휴일 — 설·추석은 전날·당일·다음날) */
  const OFFICIAL = {
    2026: [
      { date: '2026-02-16', name: '설날' }, { date: '2026-02-17', name: '설날' }, { date: '2026-02-18', name: '설날' },
      { date: '2026-09-24', name: '추석' }, { date: '2026-09-25', name: '추석' }, { date: '2026-09-26', name: '추석' },
      { date: '2026-10-03', name: '개천절' }, { date: '2026-10-05', name: '대체공휴일' }, { date: '2026-10-09', name: '한글날' },
    ],
    2027: [
      { date: '2027-02-05', name: '설날' }, { date: '2027-02-06', name: '설날' }, { date: '2027-02-07', name: '설날' },
      { date: '2027-09-14', name: '추석' }, { date: '2027-09-15', name: '추석' }, { date: '2027-09-16', name: '추석' },
    ],
  };
  {
    ok('⑤ data.js가 달력을 내보낸다 (서버가 읽는다)', Array.isArray(D.LUNAR_PEAKS) && D.LUNAR_PEAKS.length >= 9 && Array.isArray(D.PEAK_CALENDAR));
    const c = F.checkCalendar(OFFICIAL, D.PEAK_CALENDAR, D.LUNAR_PEAKS, { today: '2026-01-01' });
    ok('⑤ 네 연휴를 다 대조했다', c.lunar.length === 4, JSON.stringify(c.lunar.map((x) => x.year + x.name)));
    ok('🔴 ⑤ 지금 달력은 공식 날짜를 다 덮는다', c.lunarProblems === 0, JSON.stringify(c.lunar.filter((x) => x.state !== 'ok')));
    /* 고장 주입 ① — 2027 추석을 하루 늦게 잡았다면 */
    const shifted = D.LUNAR_PEAKS.map((p) => (p.label === '추석 연휴' && p.from.startsWith('2027') ? Object.assign({}, p, { from: '2027-09-15', to: '2027-09-19' }) : p));
    const c2 = F.checkCalendar(OFFICIAL, D.PEAK_CALENDAR, shifted, { today: '2026-01-01' });
    ok('🔴 ⑤ 날짜가 어긋나면 mismatch로 잡는다', c2.lunar.some((x) => x.year === 2027 && x.name === '추석' && x.state === 'mismatch'), JSON.stringify(c2.lunar.filter((x) => x.state !== 'ok')));
    /* 고장 주입 ② — 그 해가 통째로 없다면 */
    const gone = D.LUNAR_PEAKS.filter((p) => !p.from.startsWith('2027'));
    const c3 = F.checkCalendar(OFFICIAL, D.PEAK_CALENDAR, gone, { today: '2026-01-01' });
    ok('🔴 ⑤ 해가 빠지면 missing으로 잡는다', c3.lunar.filter((x) => x.year === 2027 && x.state === 'missing').length === 2);
    /* 긴 연휴 후보 — 10/3(토)~10/5(월 대체) = 3일 → 후보 아님 · 4일짜리를 만들면 후보 */
    ok('⑤ 3일 연휴는 후보가 아니다', !c.longBreaks.some((b) => b.from === '2026-10-03'), JSON.stringify(c.longBreaks));
    const plus = { 2026: OFFICIAL[2026].concat([{ date: '2026-10-02', name: '임시공휴일' }]) };
    const c4 = F.checkCalendar(plus, D.PEAK_CALENDAR, D.LUNAR_PEAKS, { today: '2026-01-01' });
    const b = c4.longBreaks.find((x) => x.from === '2026-10-02');
    ok('🔴 ⑤ 달력에 없는 4일 연휴(10/2~10/5)는 후보로 올린다', !!b && b.days === 4 && b.names.includes('임시공휴일'), JSON.stringify(c4.longBreaks));
    ok('⑤ 우리 피크와 겹치는 연휴(추석)는 후보에서 뺀다', !c4.longBreaks.some((x) => x.from <= '2026-09-25' && x.to >= '2026-09-25'));
    const past = F.checkCalendar(plus, D.PEAK_CALENDAR, D.LUNAR_PEAKS, { today: '2026-12-01' });
    ok('⑤ 지나간 연휴는 후보에 안 올린다', !past.longBreaks.some((x) => x.from === '2026-10-02'));
  }

  console.log('\n[6] 🔴 자동 실행 — 실패해도 기록을 남기고, 어제의 좋은 값을 안 지운다');
  {
    process.env.CRON_SECRET = 'cron-test';
    delete process.env.EXIM_API_KEY; delete process.env.DATA_GO_KR_KEY;
    const rates = require(path.join(ROOT, 'api', 'rates.js'));
    const call = async (headers) => {
      const out = {};
      const res = { status(c) { out.code = c; return res; }, json(o) { out.body = o; return res; }, setHeader() {} };
      await rates({ method: 'GET', query: { cron: '1' }, headers: headers || {} }, res);
      return out;
    };
    const no = await call({});
    ok('⑥ 비밀 없이는 안 돈다', no.code === 401);

    /* 어제 받은 좋은 공휴일 값이 있다고 치자 */
    DB.settings[F.HOLIDAYS_KEY] = { fetchedAt: '2026-10-01T20:00:00Z', years: { 2026: OFFICIAL[2026] } };
    DB.settings[F.STATUS_KEY] = { fx: { lastSuccessAt: '2026-10-01T20:00:00Z' }, holidays: { lastSuccessAt: '2026-10-01T20:00:00Z' } };
    const realFetch = global.fetch;
    global.fetch = async () => { throw new Error('network down'); };   /* 바깥이 다 죽은 날 */
    const r = await call({ authorization: 'Bearer cron-test' });
    global.fetch = realFetch;
    const st = DB.settings[F.STATUS_KEY];
    ok('🔴 ⑥ 다 실패해도 상태가 기록된다', r.code === 200 && st && st.runAt && st.fx && st.holidays, JSON.stringify(st).slice(0, 160));
    ok('⑥ 환율 실패 목록이 남는다 (관리자 추가 통화 XAF 포함)', st.fx.saved === 0 && st.fx.failed.includes('USD') && st.fx.failed.includes('XAF'), JSON.stringify(st.fx.failed));
    ok('⑥ 키가 없다고 말한다', st.fx.exim.reason === 'no_key' && st.holidays.reason === 'no_key');
    ok('🔴 ⑥ 마지막 성공 시각은 어제 그대로 (지우지 않는다)', st.fx.lastSuccessAt === '2026-10-01T20:00:00Z' && st.holidays.lastSuccessAt === '2026-10-01T20:00:00Z');
    ok('🔴 ⑥ 어제 받은 공휴일을 지우지 않았다', DB.settings[F.HOLIDAYS_KEY].years[2026].length === OFFICIAL[2026].length);
    ok('⑥ 환율 표에 아무것도 안 썼다', Object.keys(DB.fx).length === 0);
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`결과: ${pass} pass / ${fail} fail  — aH 바깥 공식 자료 자동 갱신`);
  process.exit(fail ? 1 : 0);
})();

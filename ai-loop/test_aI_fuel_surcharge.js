/* ══════════════════════════════════════════════════════════════════════════
   ⛽ 유류할증료 월별 표 — 공지 링크 붙여넣기 (2026-10-02 대표 지시)

   ■ 왜 필요한가
   항공사가 자동 수집을 막는다(대한항공 403 · 아시아나 공지 목록 차단). **우회하지 않는다.**
   공지 상세는 공개라 담당자가 매달 링크를 붙여넣고, 서버가 읽어 검산해 저장한다.
   ⚠ 이 단계에서는 견적 금액이 바뀌지 않는다(엔진 연결은 대기열 0-ap 결정 뒤).

   ■ 무엇을 보나 (바깥 접속 없음 · 운영 DB 미접속)
     [1] 🔴 실제 공지 세 달치(fixtures/fuel_notice_oz_*.html) — 양식 둘을 다 읽는다
     [2] 🔴 검산 — 일부러 망가뜨린 공지는 저장하지 않는다
     [3] 주소 — 아시아나 공지 상세만 · 꼬리는 걷고 번호만 · 다른 곳은 거절
     [4] 목적지 60곳 거리표 — 빠짐 없음 · 공지 도시 표기가 공지와 같다 · 공지와 거리 계산이 갈리지 않는다
     [5] 구간 정하기 — 담당자 지정 > 공지 도시 > 거리 · 국내선 제외 · 경계 근처 표시
     [6] 적용 중 / 다음 달 예고 / 이번 달 없음
     [7] 🔴 API — 직원은 못 넣는다 · 서버가 **다시 받아 읽는다**(화면이 보낸 숫자를 안 믿는다)
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
};

/* ── 가짜 DB · 가짜 인증 (운영 미접속) ── */
const DB = { settings: {} };
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (strings, ...vals) => Promise.resolve().then(() => {
    const q = strings.join('?');
    if (/select value from app_settings where key/.test(q)) return DB.settings[vals[0]] !== undefined ? [{ value: DB.settings[vals[0]] }] : [];
    if (/insert into app_settings/.test(q)) { DB.settings[vals[0]] = JSON.parse(vals[1]); return []; }
    if (/select destination_key, overrides from rate_overrides/.test(q)) return [{ destination_key: '도쿄', overrides: { fuel_surcharge: 150000, rateDate: '2026-09' } }];
    return [];
  }),
} };
const authPath = require.resolve(path.join(ROOT, 'api', '_lib', 'auth.js'));
const realAuth = require(authPath);
require.cache[authPath].exports = Object.assign({}, realAuth, {
  requireAdmin: async (req, res) => { if (!req.fakeRole) { res.status(401).json({ error: 'unauthorized' }); return false; } req.user = { role: req.fakeRole, displayName: '시험' }; return true; },
  requireRole: async (req, res, roles) => {
    if (!req.fakeRole) { res.status(401).json({ error: 'unauthorized' }); return false; }
    req.user = { role: req.fakeRole, displayName: '시험' };
    if (!roles.includes(req.fakeRole)) { res.status(403).json({ error: 'forbidden' }); return false; }
    return true;
  },
});

const F = require(path.join(ROOT, 'api', '_lib', 'fuel_surcharge.js'));
const D = require(path.join(ROOT, 'data.js'));
const FX = (m) => fs.readFileSync(path.join(__dirname, 'fixtures', `fuel_notice_oz_${m}.html`), 'utf8');

(async () => {
  console.log('\n[1] 🔴 실제 공지 세 달치 — 양식 둘을 다 읽는다');
  const real = {};
  for (const [m, first, last] of [['2025-01', 15500, 90300], ['2025-10', 13900, 75200], ['2026-04', 43900, 251900]]) {
    const r = F.parseAsianaNotice(FX(m));
    real[m] = r;
    ok(`① ${m} — 검산 통과 · 9구간`, r.ok && r.bands.length === 9, r.errors.join(' | '));
    ok(`① ${m} — 적용 월을 문서에서 읽었다`, r.month === m, r.month);
    ok(`① ${m} — 첫·끝 구간 금액 (${first} · ${last})`, r.bands[0].oneway === first && r.bands[8].oneway === last, r.bands.map((b) => b.oneway).join(','));
  }
  ok('🔴 ① 「(3월) X원 (4월) Y원」에서 **4월** 금액을 고른다 (14,600이 아니라 43,900)', real['2026-04'].bands[0].oneway === 43900 && real['2026-04'].bands[0].prevOneway === 14600);
  ok('① 월 표시 없는 「X원 Y원」은 뒤의 것 (2025-10 500~999마일: 19,400 → 19,500)', real['2025-10'].bands[1].oneway === 19500);
  ok('🔴 ① 마지막 「5,000~」(mile 글자 없음)도 읽는다 — 첫 판이 여기서 막혔다', real['2026-04'].bands[8].min === 5000 && real['2026-04'].bands[8].max === null);

  console.log('\n[2] 🔴 검산 — 망가진 공지는 저장하지 않는다');
  {
    const base = FX('2026-04');
    const swap = base.replace('<b>(4월) 86,400원</b>', '<b>(4월) 6,400원</b>');
    const r1 = F.parseAsianaNotice(swap);
    ok('② 먼 구간이 더 싸면 거절', !r1.ok && r1.errors.some((e) => /더 가까운 구간/.test(e)), r1.errors.join(' | '));
    const drop = base.replace(/<li>\s*<strong>대권거리 1,000~1,499 mile<\/strong>[\s\S]*?<\/li>/, '');
    const r2 = F.parseAsianaNotice(drop);
    ok('② 구간이 빠지면(끊기면) 거절', !r2.ok && r2.errors.some((e) => /이어지지 않습니다|8개 이상/.test(e)), r2.errors.join(' | '));
    const nomonth = base.replace(/2026년 4월 1일 부/, '').replace(/발권 적용일 :<\/strong> 2026년 4월/, '발권 적용일 :</strong> 곧');
    const r3 = F.parseAsianaNotice(nomonth);
    ok('② 적용 월을 못 찾으면 거절', !r3.ok && r3.errors.some((e) => /적용 월/.test(e)), r3.errors.join(' | '));
    const r4 = F.parseAsianaNotice('<div class="cms_wrap"><p>국내선 운임 안내</p></div>');
    ok('② 유류할증료 공지가 아니면 거절', !r4.ok);
    const r5 = F.parseAsianaNotice(base.replace(/한국\s*출발/g, '해외 출발')  /* ⚠ 원문 띄어쓰기에 NBSP가 섞여 있다 — 글자 그대로 바꾸면 안 바뀐다 */);
    ok('② 「한국 출발 국제선」이 아니면 거절', !r5.ok);
  }

  console.log('\n[3] 주소 — 아시아나 공지 상세만');
  {
    const good = 'https://m.flyasiana.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531';
    ok('③ 표준 주소', F.normalizeNoticeUrl(good) === good);
    ok('🔴 ③ 목록에서 들어온 꼬리(&dispCt=all&page=1)는 걷고 번호만 남긴다', F.normalizeNoticeUrl(good + '&dispCt=all&dispCtVal=&searchOption=&searchText=&page=1') === good);
    ok('③ PC 주소(flyasiana.com)도 모바일 표준 주소로', F.normalizeNoticeUrl('https://flyasiana.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531') === good);
    for (const [why, u] of [
      ['http', 'http://m.flyasiana.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531'],
      ['다른 사이트', 'https://evil.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531'],
      ['닮은 이름', 'https://m.flyasiana.com.evil.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531'],
      ['다른 경로', 'https://m.flyasiana.com/C/KR/KO/customer/notice/list?id=CM202603160002528531'],
      ['포트', 'https://m.flyasiana.com:8443/C/KR/KO/customer/notice/detail?id=CM202603160002528531'],
      ['계정 끼움', 'https://a:b@m.flyasiana.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531'],
      ['번호 아님', 'https://m.flyasiana.com/C/KR/KO/customer/notice/detail?id=../../x'],
    ]) ok(`🔴 ③ 거절 — ${why}`, F.normalizeNoticeUrl(u) === null);
    let asked = null;
    await F.fetchNotice(good + '&page=1', { fetch: async (u, o) => { asked = { u, o }; return { ok: true, status: 200, text: async () => FX('2026-04') }; } });
    ok('③ 실제로 묻는 주소는 표준 주소', asked && asked.u === good, asked && asked.u);
    ok('🔴 ③ 다른 곳으로 넘겨 주는 응답(redirect)은 안 따라간다', asked && asked.o && asked.o.redirect === 'error');
  }

  console.log('\n[4] 목적지 60곳 거리표 (data.js DEST_FUEL_ROUTE)');
  {
    const R = D.DEST_FUEL_ROUTE || {};
    const keys = D.map((r) => r.destination_key);
    const missing = keys.filter((k) => !R[k]);
    ok('🔴 ④ 요율표의 모든 목적지가 거리표에 있다 (새 목적지를 추가하면 여기서 잡힌다)', missing.length === 0, missing.join(','));
    ok('④ 거리표에 요율표에 없는 목적지가 없다', Object.keys(R).every((k) => keys.includes(k)), Object.keys(R).filter((k) => !keys.includes(k)).join(','));
    ok('④ 거리는 0~12,000마일 정수', Object.values(R).every((v) => Number.isInteger(v.miles) && v.miles > 0 && v.miles < 12000));
    ok('④ 국내선은 제주도 하나', Object.entries(R).filter(([, v]) => v.domestic).map(([k]) => k).join() === '제주도');
    /* 공지 도시 표기가 **실제 공지 어느 달에든** 나오는가 — 「푸켓」처럼 우리 표기로 적으면 영영 안 맞는다 */
    const allCities = new Set();
    for (const r of Object.values(real)) r.bands.forEach((b) => b.cities.forEach((c) => allCities.add(c)));
    const typo = Object.entries(R).filter(([, v]) => v.city && !allCities.has(v.city)).map(([k, v]) => `${k}→${v.city}`);
    ok('🔴 ④ 공지 도시 표기가 실제 공지에 나온다 (오타면 늘 거리 계산으로 떨어진다)', typo.length === 0, typo.join(', '));
    for (const [m, r] of Object.entries(real)) {
      const mism = Object.entries(R).filter(([k, v]) => F.resolveBand(k, v, r.bands, {}).cityMismatch).map(([k]) => k);
      ok(`🔴 ④ ${m} 공지 — 공지 도시 분류와 거리 계산이 갈리는 목적지 0`, mism.length === 0, mism.join(','));
    }
    ok('④ 북유럽은 4,000~4,999마일 (다른 유럽보다 한 단계 낮다)', F.bandOfMiles(real['2026-04'].bands, R['북유럽'].miles) === 7);
  }

  console.log('\n[5] 구간 정하기');
  {
    const bands = real['2026-04'].bands;
    const R = D.DEST_FUEL_ROUTE;
    const t = F.resolveBand('도쿄', R['도쿄'], bands, {});
    ok('⑤ 공지에 도시가 있으면 공지 (도쿄 → 500~999)', t.basis === 'city' && bands[t.band].min === 500);
    const k = F.resolveBand('가고시마', R['가고시마'], bands, {});
    ok('⑤ 없으면 거리 (가고시마 460 → 0~499) + 경계 근처 표시', k.basis === 'miles' && k.band === 0 && k.nearEdge === true);
    const ko = F.resolveBand('가고시마', R['가고시마'], bands, { '가고시마': 500 });
    ok('⑤ 담당자 지정이 이긴다 (가고시마 → 500~999)', ko.basis === 'override' && bands[ko.band].min === 500);
    const bad = F.resolveBand('가고시마', R['가고시마'], bands, { '가고시마': 777 });
    ok('⑤ 없는 구간을 지정해 두면 무시하고 거리로', bad.basis === 'miles');
    ok('⑤ 제주도는 국내선 — 구간 없음', F.resolveBand('제주도', R['제주도'], bands, {}).basis === 'domestic');
    /* 고장 주입 — 공지가 도쿄를 1,000마일대로 옮겼다면: 공지를 따르되 어긋났다고 말한다 */
    const moved = bands.map((b, i) => Object.assign({}, b, { cities: i === 1 ? b.cities.filter((c) => c !== '도쿄') : (i === 2 ? b.cities.concat('도쿄') : b.cities) }));
    const tm = F.resolveBand('도쿄', R['도쿄'], moved, {});
    ok('🔴 ⑤ 공지와 거리가 갈리면 공지를 따르고 「어긋남」을 말한다', tm.band === 2 && tm.cityMismatch === true);
  }

  console.log('\n[6] 적용 중 · 다음 달 예고 · 이번 달 없음');
  {
    const months = { '2026-09': {}, '2026-10': {}, '2026-11': {} };
    const p = F.pickTables(months, '2026-10');
    ok('⑥ 이번 달 표가 적용 중 · 다음 달은 예고', p.active === '2026-10' && p.next === '2026-11' && !p.currentMissing);
    const q = F.pickTables({ '2026-04': {} }, '2026-10');
    ok('🔴 ⑥ 이번 달 표가 없으면 지난 표로 보되 「없음」이라고 말한다', q.active === '2026-04' && q.currentMissing === true);
    ok('⑥ 아무 표도 없으면 active 없음', F.pickTables({}, '2026-10').active === null);
  }

  console.log('\n[7] 🔴 API — 권한 · 서버가 다시 읽는다');
  {
    const rates = require(path.join(ROOT, 'api', 'rates.js'));
    const call = async (method, action, body, role) => {
      const out = {};
      const res = { status(c) { out.code = c; return res; }, json(o) { out.body = o; return res; }, setHeader() {} };
      await rates({ method, query: { action }, headers: {}, body, fakeRole: role }, res);
      return out;
    };
    const realFetch = global.fetch;
    let fetched = 0;
    global.fetch = async (u) => { fetched++; return { ok: true, status: 200, text: async () => FX('2026-04') }; };
    const url = 'https://m.flyasiana.com/C/KR/KO/customer/notice/detail?id=CM202603160002528531';
    ok('⑦ 로그인 없이 조회 401', (await call('GET', 'fuel', null, null)).code === 401);
    ok('🔴 ⑦ 직원은 저장 못 한다 (403)', (await call('POST', 'fuelSave', { url }, 'staff')).code === 403 && !DB.settings[F.TABLES_KEY]);
    const pv = await call('POST', 'fuelPreview', { url }, 'manager');
    ok('⑦ 읽어 보기는 저장하지 않는다', pv.code === 200 && pv.body.month === '2026-04' && !DB.settings[F.TABLES_KEY]);
    fetched = 0;
    const sv = await call('POST', 'fuelSave', { url, bands: [{ min: 0, max: null, oneway: 1 }], month: '2099-01' }, 'manager');
    ok('🔴 ⑦ 저장할 때 서버가 **다시 받아 읽는다**', sv.code === 200 && fetched === 1);
    const saved = DB.settings[F.TABLES_KEY] && DB.settings[F.TABLES_KEY].months;
    ok('🔴 ⑦ 화면이 보낸 숫자·월은 무시한다', saved && saved['2026-04'] && saved['2026-04'].OZ && !saved['2099-01'] && saved['2026-04'].OZ.bands[0].oneway === 43900);
    ok('⑦ 달마다 **항공사별로** 저장한다 (아시아나 링크 → OZ)', saved['2026-04'].OZ.source === 'url' && !saved['2026-04'].KE);
    global.fetch = async () => ({ ok: true, status: 200, text: async () => FX('2026-04').replace('<b>(4월) 86,400원</b>', '<b>(4월) 6,400원</b>') });
    const bad = await call('POST', 'fuelSave', { url: url.replace('8531', '8532') }, 'owner');
    ok('🔴 ⑦ 검산에 걸리면 422 · 이유를 말한다', bad.code === 422 && (bad.body.errors || []).length > 0);
    ok('⑦ 다른 사이트 주소는 받지도 않는다', (await call('POST', 'fuelPreview', { url: 'https://evil.com/x' }, 'owner')).code === 422);
    global.fetch = realFetch;
    ok('⑦ 직원은 구간 지정도 못 한다', (await call('POST', 'fuelBand', { destKey: '가고시마', minMiles: 500 }, 'staff')).code === 403);
    ok('⑦ 없는 목적지 거절', (await call('POST', 'fuelBand', { destKey: '화성', minMiles: 500 }, 'manager')).code === 400);
    ok('⑦ 매니저는 구간 지정', (await call('POST', 'fuelBand', { destKey: '가고시마', minMiles: 500 }, 'manager')).code === 200 && DB.settings[F.OVERRIDES_KEY]['가고시마'] === 500);
    /* 🔴 기준은 대한항공 — 아시아나 표만 있으면 「적용 중」이 없다(아시아나로 갈아타지 않는다) */
    const g0 = await call('GET', 'fuel', null, 'staff');
    ok('🔴 ⑦ 기준 = 대한항공 · 아시아나 표만 있으면 적용 중 없음', g0.body.pick.basis === 'KE' && g0.body.pick.active === null && !g0.body.rows[1].roundTrip, JSON.stringify(g0.body.pick));

    /* 대한항공 본문 붙여넣기 — 서버가 받으러 가지 않는다 */
    const KE = fs.readFileSync(path.join(__dirname, 'fixtures', 'fuel_paste_ke_2026-10_reconstructed.txt'), 'utf8');
    fetched = 0;
    global.fetch = async () => { fetched++; throw new Error('붙여넣기는 바깥에 안 나간다'); };
    ok('🔴 ⑦ 직원은 붙여넣기도 못 한다', (await call('POST', 'fuelSave', { text: KE, airline: 'KE' }, 'staff')).code === 403);
    const kp = await call('POST', 'fuelSave', { text: KE, airline: 'KE', bands: [{ min: 0, max: null, oneway: 1 }] }, 'manager');
    ok('⑦ 매니저 붙여넣기 저장 · 바깥 접속 0', kp.code === 200 && kp.body.month === '2026-10' && kp.body.airline === 'KE' && fetched === 0, JSON.stringify(kp.body));
    const keSaved = DB.settings[F.TABLES_KEY].months['2026-10'].KE;
    ok('🔴 ⑦ 붙여넣기도 서버가 읽은 값으로 저장 (화면이 보낸 구간 무시) · 원문을 근거로 남긴다', keSaved.bands.length === 9 && keSaved.bands[0].oneway === 49000 && keSaved.source === 'paste' && /유류할증료/.test(keSaved.text));
    const kbad = await call('POST', 'fuelPreview', { text: KE.replace('116,200원', '16,200원'), airline: 'KE' }, 'manager');
    ok('🔴 ⑦ 붙여넣기도 검산에 걸리면 422', kbad.code === 422 && kbad.body.errors.some((e) => /더 가까운 구간/.test(e)), JSON.stringify(kbad.body.errors));
    global.fetch = realFetch;

    const g = await call('GET', 'fuel', null, 'staff');
    const tokyo = g.body && g.body.rows.find((r) => r.dest === '도쿄');
    ok('⑦ 조회 — 대한항공 10월 표 적용 중 (기준 = 대한항공)', g.body.pick.active === '2026-10' && g.body.pick.basis === 'KE');
    ok('⑦ 조회 — 도쿄 대한항공 왕복 131,600 · 지금 칸은 운영 덮어쓰기 값(150,000)', tokyo && tokyo.roundTrip === 131600 && tokyo.current === 150000, JSON.stringify(tokyo));
    ok('⑦ 조회 — 대한항공 표는 거리로 맞춘다 (아시아나 도시 표기를 안 쓴다)', tokyo.basis === 'miles');
    const pq = g.body.rows.find((r) => r.dest === '푸꾸옥');
    ok('⑦ 대한항공 2,000~2,999 한 구간 — 푸꾸옥 왕복 324,800', pq.roundTrip === 324800 && pq.band.min === 2000 && pq.band.max === 2999, JSON.stringify(pq));
    ok('⑦ 조회 — 가고시마는 지정한 500마일 구간', g.body.rows.find((r) => r.dest === '가고시마').basis === 'override');
    const ny = g.body.rows.find((r) => r.dest === '뉴욕');
    ok('⑦ 대한항공 6,500~9,999 — 뉴욕 왕복 725,200', ny.roundTrip === 725200, JSON.stringify(ny));
  }

  console.log('\n[8] 본문 붙여넣기 읽기 (대한항공 기준 — 원문을 받으면 그 원문으로 바꾼다)');
  {
    const KE = fs.readFileSync(path.join(__dirname, 'fixtures', 'fuel_paste_ke_2026-10_reconstructed.txt'), 'utf8');
    const r = F.parseNoticeText(KE);
    ok('⑧ 대한항공 · 2026-10 · 9구간 · 검산 통과', r.ok && r.airline === 'KE' && r.month === '2026-10' && r.bands.length === 9, r.errors.join(' | '));
    ok('🔴 ⑧ 이번 달이 전월보다 싼 칸에서도 **이번 달 칸**을 고른다 (500~999: 66,000 → 65,800)', r.bands[1].oneway === 65800 && r.bands[1].prevOneway === 66000);
    ok('⑧ 금액이 빈 맨 끝 「10,000 ~」(상파울루)은 빼고 경고로 남긴다', r.bands[8].max === 9999 && r.warnings.some((w) => /10,000마일/.test(w)));
    ok('⑧ 날짜 줄(10월 1일 ~ 10월 31일)을 구간으로 읽지 않는다', r.bands[0].min === 0 && r.bands.every((b) => b.min !== 1 && b.min !== 10));
    /* 🔴 칸 순서가 「이번 달, 전월」이면 — 「무조건 마지막 칸」으로 읽으면 여기서 틀린다 */
    const swapped = KE.split('\n').map((l) => {
      if (/^운항거리/.test(l)) return l.replace('2026년 9월\t2026년 10월', '2026년 10월\t2026년 9월');
      const m = l.match(/^(.*\t)([\d,]+원)\t([\d,]+원)$/);
      return m ? m[1] + m[3] + '\t' + m[2] : l;
    }).join('\n');
    const sw = F.parseNoticeText(swapped);
    ok('🔴 ⑧ 칸 순서가 「10월, 9월」이어도 머리줄을 보고 10월을 고른다', sw.ok && sw.bands[1].oneway === 65800 && sw.bands[7].oneway === 322000, sw.bands.map((b) => b.oneway).join(','));
    const sp = F.parseNoticeText(KE.replace(/\t/g, '   '));
    ok('⑧ 칸이 탭이 아니라 띄어쓰기여도 읽는다', sp.ok && sp.bands[4].oneway === 162400);
    const short = F.parseNoticeText(KE.split('\n').filter((l) => !/^6,500/.test(l)).join('\n'));
    ok('🔴 ⑧ 먼 구간이 빠져 우리 목적지(워싱턴 6,943마일)를 못 덮으면 거절', !short.ok && short.errors.some((e) => /덮지 못합니다/.test(e)), short.errors.join(' | '));
    const flat = F.parseNoticeText(KE.replace(/\n/g, ' '));
    ok('⑧ 줄바꿈 없이 한 줄로 붙이면 거절하고 「줄 단위로 복사」를 말한다', !flat.ok && flat.errors.some((e) => /줄 단위|구간이 \d개뿐/.test(e)), flat.errors.join(' | '));
    ok('⑧ 유류할증료 글이 아니면 거절', !F.parseNoticeText('안녕하세요\n500 ~ 999  10,000원').ok);
    const noAir = F.parseNoticeText(KE.replace(/대한항공/g, '항공사'));
    ok('⑧ 항공사를 모르면 거절 — 고르면 통과', !noAir.ok && F.parseNoticeText(KE.replace(/대한항공/g, '항공사'), { airline: 'KE' }).ok);
    const dom = F.parseNoticeText('국내선 유류할증료 2026년 10월 1일 ~\n~ 499  20,900원');
    ok('⑧ 국내선 공지는 거절', !dom.ok && dom.errors.some((e) => /국내선/.test(e)));
  }

  console.log('\n[9] 기준 항공사 고르기');
  {
    const m = { '2026-10': { KE: { bands: [] }, OZ: { bands: [] } }, '2026-11': { OZ: { bands: [] } } };
    const p = F.pickBasis(m, '2026-11');
    ok('🔴 ⑨ 이번 달에 아시아나 표만 있으면 대한항공 지난 표를 쓰고 「아시아나만 있다」고 말한다', p.active === '2026-10' && p.currentMissing && p.otherOnly.join() === 'OZ', JSON.stringify(p));
    const legacy = F.normalizeMonths({ '2026-04': { airline: 'OZ', bands: [1] } });
    ok('⑨ 첫 판 저장 모양({airline, bands})도 읽는다', legacy['2026-04'].OZ && legacy['2026-04'].OZ.bands.length === 1);
    ok('⑨ 기준 항공사는 대한항공', F.BASIS_AIRLINE === 'KE');
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`결과: ${pass} pass / ${fail} fail  — aI 유류할증료 월별 표`);
  process.exit(fail ? 1 : 0);
})();

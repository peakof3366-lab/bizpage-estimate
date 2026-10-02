/* ══════════════════════════════════════════════════════════════════════════
   📊 월 1회 요율 점검표 — 갱신 제안 카드 (2026-10-02 대표 지시)

   ■ 왜 필요한가
   대표: 「이 카드를 우리가 어떻게 쓸 수 있는지 모르겠다」. 30건이 %만 늘어서 있고,
   판정·영향·근거가 안 보이고, 보고 나서 할 수 있는 일이 없어 목록이 줄지 않았다.

   ■ 무엇을 보나 (운영 DB 미접속 · 바깥 접속 없음)
     [1] 🔴 판정 규칙 한 벌(PLAUSIBILITY.reviewFarOff) — 일곱 갈래와 순서
     [2] 🔴 개발 도구(resolve_far_off.js)가 **같은 함수를 부른다** — 규칙이 두 벌이 되지 않게
     [3] 1인 영향(대략) — 엔진의 항목 공식과 같은 꼴
     [4] 🔴 화면 — 영향순 · 판정 표시 · 이대로 둠 → 접힘 · 새 실측이 들어오면 다시 올라옴 · 직원은 결정 버튼 없음
     [5] 🔴 서버 — 「이대로 둠」은 매니저 이상 · 이유 필수 · 항목 이름은 정해진 것만
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'plausibility.js'));

let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — aK 월 1회 요율 점검표`);
  process.exit(fail ? 1 : 0);
};

/* ── 가짜 DB · 가짜 인증 (서버 검사용) ── */
const DB = { settings: {} };
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  sql: (strings, ...vals) => Promise.resolve().then(() => {
    const q = strings.join('?');
    if (/select value from app_settings where key/.test(q)) return DB.settings[vals[0]] !== undefined ? [{ value: DB.settings[vals[0]] }] : [];
    if (/insert into app_settings/.test(q)) { DB.settings[vals[0]] = JSON.parse(vals[1]); return []; }
    return [];
  }),
} };
const authPath = require.resolve(path.join(ROOT, 'api', '_lib', 'auth.js'));
const realAuth = require(authPath);
require.cache[authPath].exports = Object.assign({}, realAuth, {
  requireAdmin: async (req, res) => { if (!req.fakeRole) { res.status(401).json({}); return false; } req.user = { role: req.fakeRole, displayName: '시험' }; return true; },
  requireRole: async (req, res, roles) => {
    if (!req.fakeRole) { res.status(401).json({}); return false; }
    req.user = { role: req.fakeRole, displayName: '시험' };
    if (!roles.includes(req.fakeRole)) { res.status(403).json({ error: 'forbidden' }); return false; }
    return true;
  },
});

(async () => {
  console.log('\n[1] 🔴 판정 규칙 — 일곱 갈래와 순서');
  {
    const R = (o) => P.reviewFarOff(o);
    ok('① 단위가 전부 다르면 오독(unit)', R({ values: [727000], base: 200000, unitBadAll: true, unitBad: '2박 묶음' }).rule === 'unit');
    ok('① 검토에서 걸렸고 한 건뿐이면 오독', R({ values: [500000], base: 100000, failed: true }).kind === 'misread');
    const sp = R({ values: [15950, 4440], base: 70000 });
    ok('🔴 ① 실측끼리 2배 넘게 벌어지면 판단 불가 (홍콩 관광 3.6배)', sp.kind === 'unclear' && sp.rule === 'self-spread', JSON.stringify(sp));
    ok('① 같은 나라 다른 목적지 기준가와 맞으면 요율 낡음', R({ values: [120000], base: 280000, peerMed: 123850 }).rule === 'peer');
    ok('① 여러 건이 모두 같은 쪽이면 요율 낡음', R({ values: [60000, 70000], base: 20000 }).rule === 'same-side');
    ok('① 걸린 데가 없으면 요율 낡음(실측 채택 — 2026-08-13 대표 방침)', R({ values: [51861], base: 18000 }).rule === 'passed');
    ok('① 걸린 적 있고 여러 건 · 같은 쪽 아님 · 동료와 안 맞으면 판단 불가', R({ values: [15000, 25000], base: 10000, failed: true, peerMed: 999999 }).rule === 'failed');
    ok('🔴 ① 순서 — 실측끼리 안 맞으면 동료 기준가가 맞아도 판단 불가가 먼저', R({ values: [10000, 40000], base: 100000, peerMed: 20000 }).kind === 'unclear');
    ok('① 이유 문장이 있다(화면이 그대로 보여 준다)', /습니다/.test(R({ values: [51861], base: 18000 }).why));
  }

  console.log('\n[2] 🔴 개발 도구가 같은 함수를 부른다');
  {
    const tool = fs.readFileSync(path.join(ROOT, 'ai-loop', 'resolve_far_off.js'), 'utf8');
    ok('② resolve_far_off.js가 PLAUSIBILITY.reviewFarOff를 부른다', /PLAUSIBILITY\.reviewFarOff\(/.test(tool));
    ok('② 옛 판정 사슬(else if (allSameSide))이 남아 있지 않다', !/else if \(allSameSide\)/.test(tool));
    const ui = fs.readFileSync(path.join(ROOT, 'admin', 'rates.js'), 'utf8');
    ok('② 화면도 같은 함수를 부른다', /PLAUSIBILITY\.reviewFarOff\(/.test(ui));
    ok('② 화면에 판정 규칙을 다시 적지 않았다(2배·0.5배 잣대 숫자가 화면에 없다)', !/REVIEW_SELF_SPREAD|spread > 2/.test(ui));
  }

  console.log('\n[3] 1인 영향(대략) — 20명·4박5일·2인 1실');
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const dom = new JSDOM(require('./_admin_source').adminSource(), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      w.alert = () => {}; w.confirm = () => true; w.prompt = () => '성수기 견적이라 다름';
      w.fetch = (u, o) => {
        const url = String(u);
        if (/action=reviewKeep/.test(url)) {
          const b = JSON.parse(o.body);
          w.__saved = b;
          w.__decisions[`${b.destKey}|${b.field}|${b.source}`] = b.note ? { sig: b.sig, note: b.note, by: '시험', at: '2026-10-02T00:00:00Z' } : undefined;
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
        }
        if (/action=review/.test(url)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ decisions: w.__decisions }) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      };
      w.__decisions = {};
    },
  });
  const w = dom.window;
  await new Promise((r) => (w.document.readyState === 'complete' ? r() : w.addEventListener('load', r)));
  {
    ok('③ 항공·유류·관광은 1인당 그대로', w.perPersonImpact('airfare', 100000) === 100000 && w.perPersonImpact('sightseeing_fee', 5000) === 5000);
    ok('③ 식비는 1인 × 5일', w.perPersonImpact('meal_per_person', 10000) === 50000);
    ok('③ 호텔은 10실 × 4박 ÷ 20명', w.perPersonImpact('hotel_per_room', 100000) === 200000);
    ok('③ 차량·가이드는 5일 × 1대 ÷ 20명', w.perPersonImpact('vehicle_large', 400000) === 100000 && w.perPersonImpact('guide_fee', 200000) === 50000);
    ok('③ 화면이 「대략」이라고 말한다', /1인 영향\(대략\)/.test(fs.readFileSync(path.join(ROOT, 'admin', 'rates.js'), 'utf8')));
  }

  console.log('\n[4] 🔴 화면');
  {
    const it = (id, v, b, via) => ({ kind: 'report', id, value: v, ratio: v / b, date: '2026-06-01', via: via === undefined ? 'calc' : via, what: '' });
    const base = (o) => Object.assign({ outlierCount: 0, excludedCount: 0, uncheckedCount: 0, unknownCount: 0, confident: false, farOff: false, source: 'report' }, o);
    w.__S = [
      base({ destKey: '하노이', field: 'meal_per_person', fieldLabel: '식비', label: '하노이', count: 1, diffPct: 188, currentBase: 18000, suggestedBase: 51861, farOff: true, items: [it(36, 51861, 18000)] }),
      base({ destKey: '홍콩', field: 'sightseeing_fee', fieldLabel: '관광비', label: '홍콩', count: 2, diffPct: -85, currentBase: 70000, suggestedBase: 10195, farOff: true, unknownCount: 2, items: [it(11, 15950, 70000, null), it(12, 4440, 70000, null)] }),
      base({ destKey: '다낭', field: 'airfare', fieldLabel: '항공료', label: '다낭', count: 3, diffPct: 27, currentBase: 495000, suggestedBase: 630000, items: [it(1, 630000, 495000), it(2, 610000, 495000), it(3, 660000, 495000)] }),
      base({ destKey: '삿포로', field: 'guide_fee', fieldLabel: '가이드비', label: '삿포로', count: 2, diffPct: 38, currentBase: 142500, suggestedBase: 197350, uncheckedCount: 1, items: [it(8, 190000, 142500), it(9, 204700, 142500)] }),
    ];
    w.eval('computeRateSuggestions = () => window.__S.map((x) => Object.assign({}, x));');
    w.eval('currentUser = { id: "1", username: "m", displayName: "매니저", role: "manager" };');
    w.renderRateSuggestions();
    const doc = w.document;
    const rows = () => [...doc.querySelectorAll('#airfare-suggestion-list .sug-row')];
    ok('④ 네 줄', rows().length === 4, String(rows().length));
    const far = [...doc.querySelectorAll('.sug-sec-far .sug-row')].map((r) => r.querySelector('.sug-what').textContent);
    ok('🔴 ④ 확인 필요 묶음은 1인 영향순 (하노이 +169,305 > 홍콩 −59,805)', far[0].includes('하노이') && far[1].includes('홍콩'), far.join(' / '));
    const ref = [...doc.querySelectorAll('.sug-sec-ref .sug-row')].map((r) => r.querySelector('.sug-what').textContent);
    ok('④ 참고 묶음도 영향순 (다낭 항공 +135,000 > 삿포로 가이드)', ref[0].includes('다낭'), ref.join(' / '));
    const pills = [...doc.querySelectorAll('.sug-sec-far .sug-verdict .ext-pill')].map((p) => p.textContent);
    ok('🔴 ④ 판정이 줄에 보인다 (요율 낡음 · 판단 불가)', pills.join() === '요율 낡음,판단 불가', pills.join());
    ok('④ 쓰는 법을 한 줄로 말한다', /쓰는 법/.test(doc.getElementById('airfare-suggestion-list').textContent));
    ok('④ 자세히 안에 근거 견적서·검산 표시가 있다', /제보 #36/.test(doc.getElementById('sug-d-0').textContent) && /검산됨/.test(doc.getElementById('sug-d-0').textContent));
    ok('④ 「검산 안 된」「출처 미상」 건수를 자세히 안에서 밝힌다', /검산 안 된 1건 제외/.test(doc.getElementById('airfare-suggestion-list').innerHTML) && /출처 미상 2건 포함/.test(doc.getElementById('airfare-suggestion-list').innerHTML));
    ok('④ 매니저에게는 결정 버튼이 있다', /이대로 둠/.test(doc.getElementById('sug-d-0').textContent) && /제보가 틀림/.test(doc.getElementById('sug-d-0').textContent));

    /* 이대로 둠 → 접힌다 */
    await w.reviewKeep(0);
    ok('④ 이대로 둠 — 이유와 근거 목록(sig)을 보낸다', w.__saved && w.__saved.note === '성수기 견적이라 다름' && w.__saved.sig === 'r36');
    ok('🔴 ④ 둔 줄은 아래 「이대로 둔 항목」으로 접힌다', doc.querySelectorAll('.sug-sec-far .sug-row').length === 1 && /이대로 둔 항목 1건/.test(doc.querySelector('.sug-kept summary').textContent));
    ok('④ 머리 건수는 남은 할 일만 센다', doc.getElementById('airfare-suggestion-count').textContent === '3건 · 둔 것 1', doc.getElementById('airfare-suggestion-count').textContent);
    /* 새 실측이 들어오면 다시 올라온다 */
    w.__S[0].items = w.__S[0].items.concat([it(99, 50000, 18000)]);
    w.renderRateSuggestions();
    ok('④ 다시 올라온 줄은 지난번 결정을 함께 보여 준다', /지난번엔 이대로 뒀습니다/.test(doc.getElementById('airfare-suggestion-list').textContent));
    ok('🔴 ④ 새 실측이 들어오면(근거 목록이 바뀌면) 다시 목록에 올라온다', doc.querySelectorAll('.sug-sec-far .sug-row').length === 2 && !doc.querySelector('.sug-kept'));

    /* 직원 */
    w.eval('currentUser = { id: "2", username: "s", displayName: "직원", role: "staff" };');
    w.renderRateSuggestions();
    ok('🔴 ④ 직원에게는 결정 버튼이 없다(보기만)', doc.querySelectorAll('#sug-d-0 button').length === 0 && /결정은 매니저 이상/.test(doc.getElementById('airfare-suggestion-list').textContent));
  }

  console.log('\n[5] 🔴 서버');
  {
    const rates = require(path.join(ROOT, 'api', 'rates.js'));
    const call = async (method, action, body, role) => {
      const out = {};
      const res = { status(c) { out.code = c; return res; }, json(o) { out.body = o; return res; }, setHeader() {} };
      await rates({ method, query: { action }, headers: {}, body, fakeRole: role }, res);
      return out;
    };
    const B = { destKey: '하노이', field: 'meal_per_person', source: 'report', sig: 'r36', note: '성수기 견적' };
    ok('⑤ 로그인 없이 조회 401', (await call('GET', 'review', null, null)).code === 401);
    ok('🔴 ⑤ 직원은 결정 못 한다 (403)', (await call('POST', 'reviewKeep', B, 'staff')).code === 403);
    ok('⑤ 없는 목적지 거절', (await call('POST', 'reviewKeep', Object.assign({}, B, { destKey: '화성' }), 'manager')).code === 400);
    ok('⑤ 정해진 항목 이름만', (await call('POST', 'reviewKeep', Object.assign({}, B, { field: 'drop_table' }), 'manager')).code === 400);
    ok('🔴 ⑤ 이유가 한 글자면 거절', (await call('POST', 'reviewKeep', Object.assign({}, B, { note: '아' }), 'manager')).code === 400);
    const s1 = await call('POST', 'reviewKeep', B, 'manager');
    ok('⑤ 매니저가 저장 — 누가·언제·이유', s1.code === 200 && DB.settings.rate_review_decisions['하노이|meal_per_person|report'].note === '성수기 견적' && DB.settings.rate_review_decisions['하노이|meal_per_person|report'].by === '시험');
    const g = await call('GET', 'review', null, 'staff');
    ok('⑤ 조회는 로그인한 누구나', g.code === 200 && g.body.decisions['하노이|meal_per_person|report'].sig === 'r36');
    const s2 = await call('POST', 'reviewKeep', Object.assign({}, B, { note: '' }), 'manager');
    ok('⑤ 이유를 비우면 결정을 지운다(다시 목록에)', s2.code === 200 && !DB.settings.rate_review_decisions['하노이|meal_per_person|report']);
  }

  w.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });

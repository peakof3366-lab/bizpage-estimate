/* ═══════════════════════════════════════════════════════════════════════════
   고객 주력 경로를 **프로덕션에 대고** 한 번 밟아 보는 자 (XK)
   ───────────────────────────────────────────────────────────────────────────
   로컬에서 되는 것과 고객이 겪는 것은 다르다. XJ에서 확인한 것이 그 예다 —
   로컬 검사는 통과했는데 **실제 고객은 견적서 링크를 한 번도 못 받고 있었다.**
   그래서 「사람이 프로덕션에서 눌러 본 적이 있는가」를 도구로 남긴다.

   ■ 무엇을 하나
     ① 고객 브라우저를 **진짜로 띄워** 견적을 계산한다(요율은 운영값을 받는다)
     ② 그 브라우저가 보내는 **요청 본문 그대로** 프로덕션 `/api/quotes`에 보낸다
     ③ 이어서 `/api/quote-shares`에 보내 **견적서 링크가 나오는지** 본다
     ④ 나온 링크의 문서를 받아 **견적서 화면에 실제로 그려** 금액·번호를 읽는다
     ⑤ 🔴 **만든 것을 지운다** — 점검이 대장에 쓰레기를 남기면 안 된다

   ⚠ **운영 DB에 쓴다.** 그래서 기본은 `--dry-run`(보내지 않고 무엇을 보낼지만 보여준다).
     실제로 보내려면 `--live`, 지우기까지 하려면 `--live --cleanup`(권장).
   ⚠ 남기는 흔적은 **알아볼 수 있어야 한다** — 기관명·담당자에 「[시스템 점검]」을 박는다.
     지우기가 실패해도 사람이 대장에서 알아보고 지울 수 있다.

   실행: node ai-loop/smoke_prod_journey.js --live --cleanup
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const { bootPage, visibleText } = require('./_page_boot');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const CLEANUP = args.includes('--cleanup');
const BASE = 'https://bizpage-estimate.vercel.app';
const MARK = '[시스템 점검]';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  — ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const post = async (url, body) => {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch (e) { /* 본문이 JSON이 아닐 수 있다 */ }
  return { status: r.status, ok: r.ok, json: j };
};

(async () => {
  console.log('\n[1] 고객 브라우저를 띄워 견적을 계산한다 (요율은 운영값)');
  /* 운영 요율을 실제로 받아 화면에 넣어 준다 — 기본값으로 계산하면 고객이 겪는
     금액이 아니고, XI가 만든 `ratesrc` 단계에서 걸려 링크가 안 나온다. */
  const ratesRes = await fetch(BASE + '/api/rates');
  const rates = await ratesRes.json();
  ok('운영 요율을 받았다', !!rates && !!rates.overrides,
    '오버라이드 ' + Object.keys((rates && rates.overrides) || {}).length + '곳');

  const B = bootPage('index.html', { fixtures: { rates } });
  const { win, doc, log, tick } = B;
  await B.ready; await tick(300);
  ok('견적 엔진이 살아 있다', typeof win.getBreakdownData === 'function');
  ok('화면이 운영 요율을 받았다고 말한다', (win.__RATE_SOURCE__ || {}).state === 'applied',
    JSON.stringify(win.__RATE_SOURCE__));

  const dep = new Date(); dep.setDate(dep.getDate() + 90);
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new win.Event('change', { bubbles: true })); } };
  set('destination', '다낭'); set('participants', '30'); set('days', '4');
  set('startDate', dep.toISOString().slice(0, 10));
  doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
    if (String(el.value || '').trim()) return;
    if (el.tagName === 'SELECT') el.value = el.options[el.options.length - 1].value;
    else if (el.type === 'tel') el.value = '010-0000-0000';
    else el.value = MARK;
  });
  set('organization', MARK + ' 자동 점검');
  set('contactName', MARK);
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick(300);

  const rec = win._lastQuoteRecord;
  ok('견적이 계산됐다', !!rec && rec.total > 0, rec && rec.total.toLocaleString() + '원');
  ok('기록이 어느 요율표로 계산했는지 말한다(XI)', !!(rec && rec.rateSource) && rec.rateSource.state === 'applied',
    JSON.stringify(rec && rec.rateSource));

  const dl = doc.getElementById('downloadEstimate');
  if (dl) dl.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
  await tick(300);
  const shareReq = log.requests.find((r) => r.url.includes('quote-shares'));
  ok('브라우저가 공유 요청을 만들었다', !!shareReq && !!shareReq.body,
    shareReq && Object.keys(shareReq.body).join(','));
  if (!rec || !shareReq) { console.log('\n여기서 멈춘다 — 브라우저 단계가 안 끝났다.'); process.exit(1); }

  console.log('\n[2] 그 요청 본문 **그대로** 프로덕션에 보낸다');
  if (!LIVE) {
    console.log('  (dry-run — 보내지 않는다. 실제로 보내려면 --live)');
    console.log('  견적 저장 본문 키: ' + Object.keys(rec).length + '개 · 총액 ' + rec.total.toLocaleString());
    console.log('  공유 요청 키: ' + Object.keys(shareReq.body).join(', '));
    console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail (dry-run)');
    process.exit(fail ? 1 : 0);
  }

  const saved = await post(BASE + '/api/quotes', rec);
  ok('견적이 저장됐다', saved.ok && saved.json && saved.json.ok, JSON.stringify(saved.json));
  /* 🔴 여기가 XJ가 고친 자리다 — 예전에는 언제나 'review'였다 */
  ok('서버 검증을 통과했다(verdict verified)', saved.json && saved.json.verdict === 'verified',
    saved.json && saved.json.verdict);

  const shared = await post(BASE + '/api/quote-shares?', shareReq.body);
  const link = shared.json && shared.json.id ? BASE + '/estimate-view.html?id=' + shared.json.id : null;
  ok('🔴 고객이 견적서 링크를 받는다', !!link, JSON.stringify(shared.json).slice(0, 200));
  if (link) console.log('     ' + link + '  (견적번호 ' + (shared.json.quoteNo || '—') + ')');

  console.log('\n[3] 그 링크의 문서를 받아 **견적서 화면에 그려 본다**');
  let shareDoc = null;
  if (shared.json && shared.json.id) {
    const r = await fetch(BASE + '/api/quote-shares/' + shared.json.id);
    shareDoc = r.ok ? await r.json() : null;
  }
  ok('문서를 받았다', !!shareDoc, shareDoc ? '키 ' + Object.keys(shareDoc).length + '개' : '못 받음');
  if (shareDoc) {
    const V = bootPage('estimate-view.html', { query: '?id=' + shared.json.id, fixtures: { shareDoc } });
    await V.ready; await V.tick(300);
    const text = visibleText(V.doc.body);
    ok('견적서에 금액이 보인다', text.includes(rec.total.toLocaleString('ko-KR')),
      text.slice(0, 60));
    ok('견적번호가 보인다', !!shareDoc.qno && text.includes(String(shareDoc.qno)), String(shareDoc.qno));
    ok('목적지가 보인다', text.includes('다낭'));
    ok('견적서 화면이 오류 없이 그려졌다', V.log.errors.length === 0,
      V.log.errors.map((e) => e.msg).join(' | '));
  }

  console.log('\n[4] 🔴 만든 것을 지운다 — 점검이 대장에 쓰레기를 남기면 안 된다');
  if (!CLEANUP) {
    console.log('  ⚠ `--cleanup`을 안 줬다. 아래를 **사람이 지워야 한다**:');
    console.log('     quotes.id = ' + rec.id + ' · quote_shares.id = ' + ((shared.json && shared.json.id) || '(없음)'));
  } else {
    try {
      require('./_load_env')();
      const { sql } = require(path.join(ROOT, 'api', '_lib', 'db.js'));
      const delQ = await sql`delete from quotes where id = ${rec.id} returning id`;
      const shareId = (shared.json && shared.json.id) || '';
      const delS = shareId ? await sql`delete from quote_shares where id = ${shareId} returning id` : [];
      ok('견적 기록을 지웠다', delQ.length === 1, rec.id);
      ok('견적서 발급 기록을 지웠다', !shareId || delS.length === 1, shareId);
      /* ⚠ 지운 뒤 **정말 없는지** 다시 센다 — 지웠다고 말만 하는 도구가 이 저장소에 있었다 */
      const left = await sql`select count(*)::int as n from quotes where org_name like ${'%' + MARK + '%'}`;
      ok('점검 흔적이 남아 있지 않다', left[0].n === 0, '남은 것 ' + left[0].n + '건');
    } catch (e) {
      fail++;
      console.log('  ✗ 지우지 못했다 — ' + String(e.message || e));
      console.log('     사람이 지울 것: quotes.id=' + rec.id + ' quote_shares.id=' + ((shared.json && shared.json.id) || '—'));
    }
  }

  console.log('\n' + '─'.repeat(64));
  console.log('결과: ' + pass + ' pass / ' + fail + ' fail — 프로덕션 고객 경로');
  process.exit(fail ? 1 : 0);
})();

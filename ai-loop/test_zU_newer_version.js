/* ═══════════════════════════════════════════════════════════════════════════
   zU — 옛 판 견적서에 「더 최근 판이 있습니다」 (2026-09-30 대표 결정)

   대표 질문: 「최종본만 남기고 이전 버전은 삭제하는 게 좋을까?」
   → 지우지 않는다(고객 손의 옛 링크·금액 분쟁 근거·협상 이력). 대신 **옛 판을 연
     고객에게 새 판이 있다고 말한다.** 그 전에는 _V3이 나와도 _V1 링크를 연 고객은
     옛 금액을 유효한 견적으로 보고 있었다.

     ① 서버가 같은 견적의 **나중에 발급된**, 취소 안 된 판 중 가장 최근 것을 준다
     ② 🔴 최신 판·견적 기록 없는 옛 링크에는 띠가 없다 (늘 뜨는 띠는 아무도 안 읽는다)
     ③ 🔴 취소된 판은 가리키지 않는다 — 취소된 견적서로 보내면 안 된다
     ④ 🔴 조회가 실패해도 문서는 나간다 (띠만 빠진다)
     ⑤ 🔴 payload에 `newer`를 심어 와도 서버 값이 이긴다 (공개 POST — 위조 경로)
     ⑥ 화면: 번호와 「최신 견적서 보기」 링크 · v1·v2 둘 다 · 인쇄에도 남는다
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const { bootPage, ROOT } = require('./_page_boot');
const { shownText } = require('./_journey_probe');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB: 같은 견적(q1)의 판 넷 — V1 · V2(취소) · V3 · 그리고 기록 없는 옛 링크 ── */
const T = (h) => '2026-09-28T0' + h + ':00:00Z';
const SHARES = [
  { id: 's1', quote_id: 'q1', quote_no: 'BP-2609-0030', status: 'issued', created_at: T(1), payload: { dt: '멜버른', t: 100, iso: '2026-09-28' } },
  { id: 's2', quote_id: 'q1', quote_no: 'BP-2609-0030_V2', status: 'issued', created_at: T(2), payload: { dt: '멜버른', t: 110, iso: '2026-09-28' } },
  { id: 's3', quote_id: 'q1', quote_no: 'BP-2609-0030_V3', status: 'void', created_at: T(3), payload: { dt: '멜버른', t: 120, iso: '2026-09-28' } },
  { id: 'old', quote_id: null, quote_no: 'Q260801-01', status: 'issued', created_at: T(0), payload: { dt: '다낭', t: 90, iso: '2026-08-01', newer: { id: 'evil', qno: '가짜' } } },
  { id: 'fake', quote_id: 'q9', quote_no: 'BP-2609-0099', status: 'issued', created_at: T(1), payload: { newer: { id: 'evil', qno: '가짜' } } },
];
let failNewer = false;
const fakeSql = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ');
  if (/^select payload, status, quote_no, quote_id, created_at from quote_shares where id = \? limit 1$/.test(q.trim())) {
    return Promise.resolve(SHARES.filter((s) => s.id === vals[0]).map((s) => ({ ...s })));
  }
  if (/select id, quote_no from quote_shares where quote_id = \? and id <> \? and created_at > \? and coalesce\(status, 'issued'\) <> 'void' order by created_at desc limit 1/.test(q)) {
    if (failNewer) return Promise.reject(new Error('db down'));
    const [qid, id, at] = vals;
    const hit = SHARES.filter((s) => s.quote_id === qid && s.id !== id && s.created_at > at && (s.status || 'issued') !== 'void')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return Promise.resolve(hit.slice(0, 1).map((s) => ({ id: s.id, quote_no: s.quote_no })));
  }
  return Promise.reject(new Error('가짜 DB가 모르는 쿼리: ' + q.slice(0, 100)));
};
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: fakeSql } };
const shareGet = require(path.join(ROOT, 'api', 'quote-shares', '[id].js'));
const get = async (id) => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  const orig = console.error; console.error = () => {};
  try { await shareGet({ method: 'GET', query: { id } }, r); } finally { console.error = orig; }
  return r;
};

const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const 문서 = (newer, v2) => {
  const d = {
    v: 1, dk: '다낭', dt: '다낭 (Da Nang)', n: 30, d: 4, ng: 3,
    org: '점검기관', cn: '점검담당', sd: ymd(60), ed: ymd(63),
    t: 56696074, pp: 1889869, iso: ymd(0), qno: 'BP-2609-0030', st: 'issued',
    rows: [['항공', 10393137], ['호텔', 28647465]], newer,
  };
  if (v2) {
    d.doc = {
      meta: { client: '점검기관', quoteNo: 'BP-2609-0030', issueDate: d.iso, validUntil: ymd(30),
        staffName: '점검담당', staffTel: '02-0000-0000', staffEmail: 'a@b.c' },
      trip: { orgName: '점검기관', startDate: d.sd, days: 4, nights: 3, region: '다낭', pax: 30 },
      price: { lines: [{ kind: 'adult', label: '성인', unit: 1889869, qty: 30 }] },
    };
  }
  return d;
};

(async () => {
  console.log('\n[1] 서버 — 더 최근 판');
  {
    const r = await get('s1');
    ok('① V1을 열면 더 최근 판을 준다', r.code === 200 && r.body.newer && r.body.newer.id === 's2', JSON.stringify(r.body && r.body.newer));
    ok('🔴 ③ 취소된 V3이 아니라 V2를 가리킨다', r.body.newer && r.body.newer.qno === 'BP-2609-0030_V2');
    ok('① 문서 내용은 그대로 온다', r.body.t === 100 && r.body.qno === 'BP-2609-0030');
    const r2 = await get('s2');
    ok('🔴 ② 살아 있는 최신 판(V2)에는 띠가 없다', r2.body.newer === null, JSON.stringify(r2.body.newer));
    const r3 = await get('s3');
    ok('② 취소된 V3보다 나중 판은 없다', r3.body.newer === null);
    const r4 = await get('old');
    ok('🔴 ⑤ 기록 없는 옛 링크 — payload에 심은 newer를 서버가 지운다', r4.code === 200 && r4.body.newer === null, JSON.stringify(r4.body.newer));
    const r5 = await get('fake');
    ok('🔴 ⑤ 기록이 있어도 payload 값이 아니라 서버 값이다', r5.body.newer === null, JSON.stringify(r5.body.newer));
    failNewer = true;
    const r6 = await get('s1');
    failNewer = false;
    ok('🔴 ④ 조회가 실패해도 문서는 나간다(띠만 빠진다)', r6.code === 200 && r6.body.t === 100 && r6.body.newer === null, JSON.stringify(r6));
  }

  console.log('\n[6] 화면');
  for (const v2 of [false, true]) {
    const tag = v2 ? 'v2' : 'v1';
    let V = bootPage('estimate-view.html', { query: '?id=s1', fixtures: { shareDoc: 문서({ id: 's2', qno: 'BP-2609-0030_V2' }, v2) } });
    await V.ready; await V.tick(320);
    const bn = V.doc.querySelector('.newer-banner');
    const t = bn ? shownText(bn) : '';
    ok('⑥ ' + tag + ' — 띠가 보인다', !!bn);
    ok('⑥ ' + tag + ' — 새 판 번호를 말한다', /BP-2609-0030_V2/.test(t), t.slice(0, 80));
    const a = bn && bn.querySelector('a.newer-banner-link');
    ok('⑥ ' + tag + ' — 링크가 새 판으로 간다', !!a && /estimate-view\.html\?id=s2$/.test(a.getAttribute('href')), a && a.getAttribute('href'));
    ok('⑥ ' + tag + ' — 링크 이름이 할 일을 말한다', !!a && /최신 견적서 보기/.test(a.textContent));
    ok('🔴 ⑥ ' + tag + ' — 인쇄에서 숨기는 유효기간 띠와 다른 클래스다', !!bn && !bn.classList.contains('validity-banner'));
    ok('⑥ ' + tag + ' — 원래 문서(금액)도 그대로 보인다', /1,889,869|56,696,074/.test(shownText(V.doc.body)));
    ok('⑥ ' + tag + ' — 화면 오류가 없다', V.log.errors.length === 0, V.log.errors.map((e) => e.msg).join(' | '));
    V.win.close();

    V = bootPage('estimate-view.html', { query: '?id=s2', fixtures: { shareDoc: 문서(null, v2) } });
    await V.ready; await V.tick(320);
    ok('🔴 ② ' + tag + ' — 최신 판에는 띠가 없다', !V.doc.querySelector('.newer-banner'));
    V.win.close();
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — zU 옛 판 견적서 안내`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`결과: ${pass} pass / ${fail + 1} fail  — zU 옛 판 견적서 안내`); process.exit(1); });

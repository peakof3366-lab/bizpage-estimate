/* ═══════════════════════════════════════════════════════════════════════════
   XU — **담당자가 「취소」로 바꾼 견적서를 고객은 유효한 것으로 보고 있었다**
   ───────────────────────────────────────────────────────────────────────────
   견적서를 발급한 **뒤의 길**을 처음 밟아 보다 나왔다(대장 → 상태 변경 → 고객 재열람).

   ■ 🔴 무엇이 잘못돼 있었나

   대장은 방침이 분명하다 — 주석에 이렇게 적혀 있다:
     「삭제 버튼을 두지 않았다. 견적서를 지우면 **「우리가 그 금액을 낸 적 있다」는
       근거가 사라진다.** 무산은 `status='void'`로 남긴다.」
   담당자는 대장에서 상태를 바꿀 수 있고(`?action=status`), 서버는 `status`·`status_by`·
   `status_at`까지 남긴다.

   그런데 **고객이 문서를 받는 자리**는 이랬다:
     `select payload from quote_shares where id = ${id} limit 1`
   **`status`를 아예 안 읽는다.** 그래서 담당자가 「취소」로 바꾼 견적서를 고객이 열면
   **「이 견적서는 발급일로부터 30일간 유효합니다」**라고 적힌 문서가 그대로 나왔다.
   취소한 금액을 고객이 계속 유효한 것으로 들고 있는 상태다.

   ■ 고친 방향
     · 서버가 `status`를 함께 읽어 `st`로 실어 준다. **상태는 서버가 넣는다** —
       payload에 담겨 온 값을 믿으면 그게 곧 위조 경로다.
     · 문서는 `st === 'void'`일 때 **「취소되었습니다」**라고 말하고, 유효기간을 말하지 않는다.
   ⚠ **내용을 감추지 않는다.** 금액·견적번호는 그대로 둔다 — 대장이 삭제 버튼을 두지
     않은 것과 같은 이유(근거는 남긴다). 다만 **유효하다고 말하지 않는다.**
   ⚠ `won`(계약)·`lost`(무산)은 화면을 안 바꾼다. 계약은 오히려 근거이고,
     무산은 **우리 쪽 영업 상태**지 고객에게 알릴 일이 아니다.
   ⚠ 옛 링크는 `status`가 없을 수 있다 → `issued`로 본다(화면이 안 바뀐다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, ROOT } = require('./_page_boot');
const { shownText } = require('./_journey_probe');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XU 취소된 견적서`);
  process.exit(fail ? 1 : 0);
};

/* ── 서버를 **실제로 불러** 본다 (DB만 흉내 낸다) ────────────────── */
let 마지막쿼리 = '';
const fakeSql = (strings, ...vals) => {
  마지막쿼리 = strings.join('?');
  if (/from quote_shares/.test(마지막쿼리)) {
    return Promise.resolve([{ payload: { dt: '다낭', t: 100, iso: '2026-08-27' }, status: 'void' }]);
  }
  return Promise.resolve([]);
};
const dbPath = require.resolve(path.join(ROOT, 'api', '_lib', 'db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: fakeSql } };
const shareGet = require(path.join(ROOT, 'api', 'quote-shares', '[id].js'));

function fakeRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const 문서 = (st) => {
  const d = {
    v: 1, dk: '다낭', dt: '다낭 (Da Nang)', n: 30, d: 4, ng: 3,
    org: '점검기관', cn: '점검담당', sd: ymd(60), ed: ymd(63),
    t: 56696074, pp: 1889869, iso: ymd(0), qno: 'Q-260827-01',
    rows: [['항공', 10393137], ['호텔', 28647465]],
    _verify: { verdict: 'verified' },
  };
  if (st) d.st = st;
  return d;
};

(async () => {
  console.log('\n[1] 🔴 서버가 상태를 **실제로 읽어 실어 주는가** (핸들러를 직접 부른다)');
  {
    const res = fakeRes();
    await shareGet({ method: 'GET', query: { id: 'abc' } }, res);
    ok('① 200으로 문서를 준다', res.code === 200, String(res.code));
    ok('🔴 ① 상태를 함께 실어 준다', res.body && res.body.st === 'void', JSON.stringify(res.body));
    ok('① 원래 내용도 그대로 있다', res.body && res.body.dt === '다낭');
    /* 쿼리가 status를 안 읽으면 위 검사는 통과할 수 없다 — 그래도 한 번 더 못 박는다 */
    ok('① 쿼리가 status를 읽는다', /select[\s\S]*status[\s\S]*from quote_shares/i.test(마지막쿼리),
      마지막쿼리.slice(0, 80));
  }

  console.log('\n[2] 🔴 취소된 견적서를 고객이 열면 — 유효하다고 말하지 않는다');
  {
    const V = bootPage('estimate-view.html', { query: '?id=x', fixtures: { shareDoc: 문서('void') } });
    await V.ready; await V.tick(320);
    const t = shownText(V.doc.body);
    ok('🔴 ② 취소되었다고 말한다', /취소되었습니다/.test(t), t.slice(0, 80));
    ok('🔴 ② 「유효기간」이라고 말하지 않는다', !/유효기간/.test(t), (t.match(/유효기간[^.]{0,30}/) || [''])[0]);
    ok('② 상단 바도 취소라고 말한다',
      /취소된 견적서/.test(shownText(V.doc.getElementById('validity-bar'))));
    ok('② 무엇을 하면 되는지 말한다', /문의|고객센터/.test(t));
    /* ⚠ 근거는 남긴다 — 대장이 삭제 버튼을 두지 않은 것과 같은 이유 */
    ok('② 금액은 그대로 보인다(근거를 지우지 않는다)', t.includes('56,696,074'));
    ok('② 견적번호도 그대로 보인다', t.includes('Q-260827-01'));
    ok('② 화면 오류가 없다', V.log.errors.length === 0, V.log.errors.map((e) => e.msg).join(' | '));
    V.win.close();
  }

  console.log('\n[3] 나머지 상태는 **화면을 안 바꾼다**');
  {
    for (const st of [undefined, 'issued', 'won', 'lost']) {
      const V = bootPage('estimate-view.html', { query: '?id=x', fixtures: { shareDoc: 문서(st) } });
      await V.ready; await V.tick(300);
      const t = shownText(V.doc.body);
      const 이름 = st || '(없음 — 옛 링크)';
      ok('③ ' + 이름 + ' — 취소라고 말하지 않는다', !/취소되었습니다/.test(t));
      ok('③ ' + 이름 + ' — 유효기간을 말한다', /유효기간/.test(t));
      V.win.close();
    }
  }

  console.log('\n[4] 인쇄해도 취소 안내가 남는가 — WQ가 당한 함정');
  {
    /* 유효기간 배너를 인쇄에서 숨기면 **취소 안내도 함께 사라진다**(같은 배너를 쓴다).
       WQ가 정확히 그 자리에서 「인쇄물에 유효기간이 없다」를 겪었다.
     ⚠ 주석을 걷어내고 **숨기는 규칙의 선택자만** 본다(WQ가 자기 주석을 읽고 없는
       결함을 만든 적이 있다). */
    const src = fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8');
    const printBlk = (src.match(/@media print\s*\{[\s\S]*?\n\s*\}/) || [''])[0]
      .replace(/\/\*[\s\S]*?\*\//g, '');
    ok('④ 인쇄 규칙을 찾았다', printBlk.length > 40, String(printBlk.length));
    const hides = printBlk.split('\n').filter((l) => /display\s*:\s*none/.test(l)).join(' ');
    ok('🔴 ④ 인쇄에서 유효기간·취소 배너를 숨기지 않는다',
      !/\.validity-banner\b/.test(hides), hides.slice(0, 90));
  }

  console.log('\n[5] 상태 목록이 한 곳에서 온다 — 두 벌이 되면 반드시 어긋난다');
  {
    const srv = fs.readFileSync(path.join(ROOT, 'api', 'quote-shares.js'), 'utf8');
    const m = srv.match(/const SHARE_STATUS = \[([^\]]+)\]/);
    ok('⑤ 서버가 아는 상태 목록이 있다', !!m, String(m));
    const 서버상태 = m ? m[1].split(',').map((x) => x.trim().replace(/['"]/g, '')) : [];
    ok('⑤ 넷이다(발급·계약·무산·취소)', 서버상태.length === 4, 서버상태.join(','));
    const adm = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    const led = adm.match(/const LED_STATUS = \{([^}]+)\}/);
    const 화면상태 = led ? led[1].split(',').map((x) => x.split(':')[0].trim()) : [];
    ok('🔴 ⑤ 화면 목록이 서버 목록과 같다',
      서버상태.every((s) => 화면상태.includes(s)) && 화면상태.length === 서버상태.length,
      '서버 ' + 서버상태.join(',') + ' vs 화면 ' + 화면상태.join(','));
    /* 고객 문서는 `void` 하나만 다르게 다룬다 — 그게 의도다 */
    const view = fs.readFileSync(path.join(ROOT, 'estimate-view.html'), 'utf8');
    ok('⑤ 고객 문서는 취소만 따로 다룬다', /d\.st === 'void'/.test(view));
  }

  done();
})();

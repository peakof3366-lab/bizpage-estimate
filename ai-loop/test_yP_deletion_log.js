/* ═══════════════════════════════════════════════════════════════════════════
   YP — **지운 것이 아무 데도 안 남았다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-03에 백업 이력을 훑다가 두 건을 찾았다:
     · 2026-08-24  `packages` 31행 → 1행   상품 30건
     · 같은 날      `quotes`   13행 → 0행   고객 견적 요청 13건
   둘 다 **백업 파일을 뒤져서야** 알았다. 대기열 P-1은 그 때문에 「직접 지우셨습니까?」로
   몇 주 열려 있었다 — 코드가 답할 수 있는 질문이 아니었기 때문이다.

   그런데 `quotes/[id].js`·`inquiries/[id].js`의 주석에는 이미 이렇게 적혀 있었다:
     「되돌릴 방법도, **누가 지웠는지 남는 기록도 없다**」
   알고는 있었는데 안 만든 것이다. 이번에 만들었다.

   🔴 잠그는 것 다섯:
     ① **기록이 먼저, 삭제가 나중** — 순서가 뒤집히면 기록 실패 시 아무 데도 안 남는
        삭제가 생긴다. 그 순간이 지금까지의 상태다
     ② **기록이 실패하면 아무것도 안 지운다** — 일부러 던져서 확인한다(결함 생성기 ③)
     ③ **행 전체를 남긴다** — id만 남기면 「무언가 사라졌다」만 알고 되돌릴 수 없다
     ④ **모르는 표·컬럼이면 그 자리에서 던진다** — 오타 하나로 그 삭제만 조용히
        기록에서 빠지는 것을 막는다(조용한 폴백을 만들지 않는다)
     ⑤ 🔴 **`api/` 어디에도 직접 `delete from`이 남아 있지 않다** — 삭제 자리가
        6개 파일에 9곳이었다. 하나라도 새 나가면 그 표만 기록이 비는데, 비어 있다는
        것 자체를 아무도 모른다(결함 생성기 ① — 이 저장소가 여섯 번 당한 유형)

   실행: node ai-loop/test_yP_deletion_log.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { deleteAndLog, actorOf, KNOWN_TABLES } = require(path.join(ROOT, 'api', '_lib', 'deletion_log.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — YP 지운 것이 안 남던 것`);
  process.exit(fail ? 1 : 0);
};

/* DB를 흉내 내되 **부른 순서를 그대로 적어 둔다** — 이 검사의 핵심이 순서다. */
function makeSql(opts = {}) {
  const calls = [];
  const row = opts.row === undefined
    ? { id: 'pkg-1', title: '오키나와 3박4일', status: 'draft', price: 1290000 }
    : opts.row;
  const sql = (text, params) => {
    calls.push({ text: String(text).replace(/\s+/g, ' ').trim(), params });
    if (/^select \* from/.test(text)) return Promise.resolve(row ? [row] : []);
    if (/^insert into deletion_log/.test(text)) {
      if (opts.logThrows) return Promise.reject(new Error('deletion_log 쓰기 실패(주입)'));
      return Promise.resolve([]);
    }
    if (/^delete from/.test(text)) {
      if (opts.deleteThrows) return Promise.reject(new Error('delete 실패(주입)'));
      return Promise.resolve(row ? [row] : []);
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}
const req = { user: { id: '7', username: 'manager1', role: 'manager' } };

(async () => {
  console.log('\n[1] 🔴 ①③ 기록이 먼저, 그리고 행 전체를 남긴다');
  {
    const sql = makeSql();
    const out = await deleteAndLog(sql, 'packages', { column: 'id', value: 'pkg-1' },
      { req, reason: '상품 목록에서 삭제' });

    const kinds = sql.calls.map((c) => c.text.split(' ').slice(0, 3).join(' '));
    ok('① 세 번 부른다 (읽기 → 기록 → 삭제)', sql.calls.length === 3, kinds.join(' | '));
    ok('🔴 ① 읽기가 맨 먼저다', /^select \* from packages/.test(sql.calls[0].text));
    ok('🔴 ① 기록이 삭제보다 **먼저**다',
      /^insert into deletion_log/.test(sql.calls[1].text)
      && /^delete from packages/.test(sql.calls[2].text),
      kinds.join(' | '));

    const p = sql.calls[1].params;
    ok('③ 표 이름을 남긴다', p[0] === 'packages', String(p[0]));
    ok('③ 행 id를 남긴다', p[1] === 'pkg-1', String(p[1]));
    const snap = JSON.parse(p[2]);
    ok('🔴 ③ 행을 **통째로** 남긴다(제목·상태·금액까지)',
      snap.title === '오키나와 3박4일' && snap.status === 'draft' && snap.price === 1290000,
      JSON.stringify(snap));
    ok('③ 누가 지웠는지 남긴다', p[3] === 'manager1#7', String(p[3]));
    ok('③ 왜 지웠는지 남긴다', p[4] === '상품 목록에서 삭제', String(p[4]));
    ok('① 지운 수를 돌려준다', out.deleted === 1, JSON.stringify(out.deleted));
  }

  console.log('\n[2] 🔴 ② 기록이 실패하면 — 아무것도 안 지운다 (고장 주입)');
  {
    const sql = makeSql({ logThrows: true });
    let threw = null;
    try {
      await deleteAndLog(sql, 'quotes', { column: 'id', value: 'q-1' }, { req });
    } catch (e) { threw = e; }
    ok('② 실패를 삼키지 않는다(던진다)', !!threw, String(threw));
    const deletes = sql.calls.filter((c) => /^delete from/.test(c.text));
    ok('🔴 ② `delete`가 **한 번도 안 갔다**', deletes.length === 0,
      sql.calls.map((c) => c.text.slice(0, 24)).join(' | '));
  }

  console.log('\n[3] ④ 모르는 표·컬럼이면 그 자리에서 던진다');
  {
    const sql = makeSql();
    let a = null, b = null;
    try { await deleteAndLog(sql, 'staff_accounts', { column: 'id', value: 1 }, { req }); } catch (e) { a = e; }
    try { await deleteAndLog(sql, 'packages', { column: 'title', value: 'x' }, { req }); } catch (e) { b = e; }
    ok('④ 모르는 표를 거절한다', !!a && /모르는 표/.test(a.message), String(a && a.message));
    ok('④ 모르는 컬럼을 거절한다', !!b && /모르는 컬럼/.test(b.message), String(b && b.message));
    ok('🔴 ④ 거절했으면 DB를 아예 안 건드린다', sql.calls.length === 0,
      String(sql.calls.length));
  }

  console.log('\n[4] 지울 것이 없으면 기록도 안 남긴다');
  {
    const sql = makeSql({ row: null });
    const out = await deleteAndLog(sql, 'inquiries', { column: 'id', value: 'nope' }, { req });
    ok('없으면 0을 돌려준다', out.deleted === 0 && out.rows.length === 0, JSON.stringify(out));
    ok('빈 기록을 남기지 않는다', !sql.calls.some((c) => /^insert into deletion_log/.test(c.text)));
    ok('삭제도 안 간다', !sql.calls.some((c) => /^delete from/.test(c.text)));
  }

  console.log('\n[5] 로그인 정보가 없으면 — 빈 값이 아니라 「모른다」고 적는다');
  {
    ok('⑤ 빈 문자열로 두지 않는다', actorOf(null) === '(로그인 정보 없음)', actorOf(null));
    ok('⑤ 로그인했으면 계정을 적는다', actorOf(req) === 'manager1#7', actorOf(req));
  }

  console.log('\n[6] 🔴 ⑤ `api/` 어디에도 직접 `delete from`이 남아 있지 않다');
  {
    /* 파일을 실제로 훑는다 — 「모았다」는 기억이 아니라 지금 상태로 확인한다. */
    const 새는곳 = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.js')) continue;
        if (p.endsWith(path.join('_lib', 'deletion_log.js'))) continue;   /* 여기가 그 한 곳이다 */
        const src = fs.readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');  /* 주석의 설명은 근거가 아니다 */
        if (/delete\s+from/i.test(src)) 새는곳.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, 'api'));
    ok('🔴 ⑤ 직접 지우는 자리가 없다', 새는곳.length === 0, 새는곳.join(' · '));

    /* 대조군 — 이 검사가 정말 무언가를 보고 있는지. 아는 표가 여덟이어야 한다.
       (0이면 위 통과는 「아무것도 안 봤다」와 구별되지 않는다) */
    ok('⑤ (대조군) 아는 표 목록이 비어 있지 않다', KNOWN_TABLES.size >= 8, String(KNOWN_TABLES.size));
  }

  console.log('\n[7] 🔴 지운 기록을 읽는 자리가 공개로 열려 있지 않다');
  {
    /* `quotes`·`inquiries` 스냅샷에는 고객 연락처가 들어간다.
       공개 GET에 얹히면 그 자체가 유출이다(결함 생성기 ④). */
    const 샌곳 = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.js')) continue;
        if (p.endsWith(path.join('_lib', 'deletion_log.js'))) continue;
        const src = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (/from\s+deletion_log/i.test(src)) 샌곳.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, 'api'));
    ok('🔴 ⑦ 아직 어떤 API도 이 표를 읽지 않는다', 샌곳.length === 0, 샌곳.join(' · '));
    console.log('     ℹ 읽는 길을 낼 때는 **반드시 requireAdmin 뒤**에 둔다. 이 검사를');
    console.log('       그때 「인증 뒤인가」로 바꿔야 한다 — 지우고 끝내지 말 것.');
  }

  done();
})();

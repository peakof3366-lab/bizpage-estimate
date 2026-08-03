/* QJ 검증: 백업·복원이 **실제로 되는가**.

   백업 도구의 유일한 존재 이유는 "그날" 되돌리는 것이다. 그런데 백업 스크립트만큼
   확인 없이 방치되기 쉬운 것도 없다 — 이 저장소가 반복해서 당한 결함 생성기 ③
   (안전망이 실제로 실행된 적이 없다)이 가장 비싸게 나타나는 자리다. 그래서 여기서는
   가짜 DB로 **덤프 → 파일 저장 → 검증 → 다른 DB에 복원**까지 한 바퀴를 돌리고,
   일부러 망가뜨린 입력이 잡히는지도 확인한다.

   특히 확인하는 것:
   · 테이블 목록을 db_migrate.js에서 읽는가(손으로 옮겨 적으면 새 테이블이 조용히 빠진다)
   · 못 읽은 테이블을 '빈 테이블'로 둔갑시키지 않는가
   · 저장한 파일을 다시 읽어 행 수까지 대조하는가
   · 복원이 기본적으로 아무것도 지우지 않는가(--replace일 때만 지운다)
   · bigserial 시퀀스를 다시 맞추는가(안 맞추면 복원 며칠 뒤 '계정 추가'가 깨진다)

   실행: node ai-loop/test_qJ_backup_restore.js  (프로젝트 루트에서) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const backupTool = require('./db_backup');
const restoreTool = require('./db_restore');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ── 가짜 DB ──────────────────────────────────────────────────────────────
   태그드 템플릿 호출을 그대로 받아 기록한다. neon 드라이버처럼 지연 실행(thenable)이라
   sql.transaction([...])에 넣어도 그 자리에서 실행되지 않는다. */
function fakeDb(tables = {}, { failOn = [] } = {}) {
  const log = [];
  const store = JSON.parse(JSON.stringify(tables));
  const run = (text, vals) => {
    log.push({ text, vals });
    const m = text.match(/from "([a-z_]+)"|into "([a-z_]+)"|update "([a-z_]+)"/);
    const t = m && (m[1] || m[2] || m[3]);
    if (failOn.includes(t)) throw new Error(`의도적으로 끊은 연결(${t})`);

    if (/^select \* from/.test(text)) return store[t] || [];
    if (/^select count/.test(text)) return [{ n: (store[t] || []).length }];
    if (/^delete from/.test(text)) { store[t] = []; return []; }
    if (/^insert into/.test(text)) {
      const rows = JSON.parse(vals[0]);
      const existing = store[t] || (store[t] = []);
      /* on conflict do nothing 흉내 — id가 같으면 넣지 않는다. */
      for (const r of rows) if (!existing.some(e => String(e.id) === String(r.id))) existing.push(r);
      return [];
    }
    if (/setval/.test(text)) { log.push({ setval: text }); return [{ setval: 1 }]; }
    return [];
  };

  const sql = (chunks, ...vals) => {
    const text = chunks.join('?').trim();
    let done = false, result;
    const exec = () => { if (!done) { result = run(text, vals); done = true; } return result; };
    return {
      __text: text,
      then(res, rej) { try { return Promise.resolve(exec()).then(res, rej); } catch (e) { return Promise.reject(e).catch(rej || (x => { throw x; })); } },
      catch(rej) { return this.then(undefined, rej); },
    };
  };
  sql.transaction = async (queries) => {
    log.push({ transaction: queries.map(q => q.__text) });
    for (const q of queries) await q;
    return [];
  };
  return { sql, log, store };
}

const SAMPLE = {
  quotes: [{ id: 'q1', org: '○○기업', total: 1000000 }, { id: 'q2', org: '△△공사', total: 2000000 }],
  inquiries: [{ id: 'i1', name: '홍길동', assignee: '김직원' }],
  staff_accounts: [{ id: '1', username: 'boss', display_name: '사장님' }, { id: '7', username: 'staff1', display_name: '김직원' }],
  rate_overrides: [{ destination_key: '도쿄', overrides: { airfare: 399000 } }],
  app_settings: [],   // 진짜로 빈 테이블 — '못 읽음'과 구별돼야 한다
};

(async () => {
  console.log('[1] 테이블 목록은 db_migrate.js 하나에서 온다');

  const migrateSrc = fs.readFileSync(path.join(__dirname, 'db_migrate.js'), 'utf8');
  const tables = backupTool.readTableNames(migrateSrc);
  ok('실제 마이그레이션에서 테이블을 찾아낸다', tables.length >= 16, String(tables.length));
  for (const t of ['quotes', 'inquiries', 'staff_accounts', 'rate_overrides', 'rate_change_log',
                   'actual_price_reports', 'itinerary_overrides', 'app_settings']) {
    ok(`${t}가 백업 대상에 들어 있다`, tables.includes(t));
  }
  ok('중복 없이 모은다', new Set(tables).size === tables.length);

  /* 새 테이블이 생겨도 자동으로 따라오는지 — 목록을 손으로 적었다면 여기서 갈린다. */
  const withNew = backupTool.readTableNames(migrateSrc + '\ncreate table if not exists 새_테이블_예시 (\n  id text\n)\n'
    .replace('새_테이블_예시', 'brand_new_table'));
  ok('마이그레이션에 테이블이 추가되면 백업 대상도 자동으로 늘어난다',
    withNew.includes('brand_new_table') && withNew.length === tables.length + 1);

  console.log('\n[2] 못 읽은 테이블을 빈 테이블로 둔갑시키지 않는다');

  const dbAll = fakeDb(SAMPLE);
  let dumped = await backupTool.dumpTables(dbAll.sql, Object.keys(SAMPLE));
  ok('정상 덤프는 실패 목록이 비어 있다', Object.keys(dumped.failed).length === 0);
  ok('행 수를 테이블별로 기록한다', dumped.counts.quotes === 2 && dumped.counts.inquiries === 1,
    JSON.stringify(dumped.counts));
  ok('진짜 빈 테이블은 0행으로 남는다', dumped.counts.app_settings === 0 && !dumped.failed.app_settings);

  const dbBroken = fakeDb(SAMPLE, { failOn: ['inquiries'] });
  dumped = await backupTool.dumpTables(dbBroken.sql, Object.keys(SAMPLE));
  ok('못 읽은 테이블은 failed에 남는다', !!dumped.failed.inquiries, JSON.stringify(dumped.failed));
  ok('못 읽은 테이블은 0행으로 기록되지 않는다', dumped.counts.inquiries === undefined);

  let partial = backupTool.buildBackup(dumped, Object.keys(SAMPLE));
  ok('부분 백업이라고 스스로 표시한다', partial.meta.partial === true);

  const full = backupTool.buildBackup(
    await backupTool.dumpTables(dbAll.sql, Object.keys(SAMPLE)), Object.keys(SAMPLE));
  ok('정상 백업은 partial이 아니다', full.meta.partial === false);
  ok('총 행 수를 센다', full.meta.totalRows === 6, String(full.meta.totalRows));

  console.log('\n[3] 저장한 파일을 다시 읽어 확인한다');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bizpage-backup-test-'));
  const goodFile = path.join(dir, 'bizpage_backup_2026-07-31T00-00-00-000Z.json');
  fs.writeFileSync(goodFile, JSON.stringify(full, null, 1), 'utf8');
  ok('온전한 파일은 통과한다', backupTool.verifyFile(goodFile).ok);

  /* 일부러 망가뜨린다 — 안전망은 발동하는 것까지 봐야 안전망이다. */
  const tampered = JSON.parse(JSON.stringify(full));
  tampered.data.quotes.pop();                       // 메타는 2행인데 실제는 1행
  const tamperedFile = path.join(dir, 'bizpage_backup_2026-07-31T00-00-01-000Z.json');
  fs.writeFileSync(tamperedFile, JSON.stringify(tampered), 'utf8');
  const tamperedCheck = backupTool.verifyFile(tamperedFile);
  ok('행 수가 안 맞으면 잡아낸다', !tamperedCheck.ok && /quotes/.test(tamperedCheck.problems.join('|')),
    tamperedCheck.problems.join('|'));

  const brokenFile = path.join(dir, 'bizpage_backup_2026-07-31T00-00-02-000Z.json');
  fs.writeFileSync(brokenFile, '{"meta": {"tables"', 'utf8');   // 쓰다 만 파일
  ok('중간에 끊긴 파일을 잡아낸다', !backupTool.verifyFile(brokenFile).ok);

  const notBackup = path.join(dir, 'bizpage_backup_2026-07-31T00-00-03-000Z.json');
  fs.writeFileSync(notBackup, '{"hello":"world"}', 'utf8');
  ok('백업 형식이 아니면 잡아낸다', !backupTool.verifyFile(notBackup).ok);

  console.log('\n[4] 오래된 백업 정리가 남의 파일을 건드리지 않는다');

  const decoy = path.join(dir, '중요한_다른_파일.json');
  fs.writeFileSync(decoy, '{}', 'utf8');
  const pruned = backupTool.pruneOld(dir, 2);
  ok('오래된 것부터 지운다', pruned.length === 2, JSON.stringify(pruned));
  ok('남긴 개수가 맞다', backupTool.listBackups(dir).length === 2);
  ok('이름 규칙이 다른 파일은 그대로 둔다', fs.existsSync(decoy));

  console.log('\n[4-2] 자동 백업이 멈춘 것을 알아채는가');

  /* 스케줄러가 조용히 죽는 것이 이 구조의 가장 큰 위험이다. 아무도 로그를 안 보므로,
     목록을 볼 때마다 마지막 백업이 며칠 전인지 말하고 오래됐으면 실패로 끝낸다. */
  const now = new Date('2026-07-31T09:00:00.000Z');
  const fresh = stale => backupTool.stalenessNote([`bizpage_backup_${stale}.json`], now);
  ok('오늘 받은 백업은 정상으로 본다', !fresh('2026-07-31T08-42-21-328Z').stale,
    fresh('2026-07-31T08-42-21-328Z').text);
  ok('하루 전까지는 정상', !fresh('2026-07-30T08-42-21-328Z').stale, fresh('2026-07-30T08-42-21-328Z').text);
  const old = fresh('2026-07-25T08-42-21-328Z');
  ok('며칠 지났으면 경고한다', old.stale && old.days === 6, JSON.stringify(old));
  ok('경고문이 "자동 백업이 멈췄는지"를 짚는다', /자동 백업/.test(old.text), old.text);
  const partialNote = fresh('2026-07-31T08-42-21-328Z_PARTIAL');
  ok('가장 최근이 부분 백업이면 그것도 경고한다', partialNote.stale && /부분 백업/.test(partialNote.text),
    partialNote.text);
  ok('백업이 하나도 없으면 경고한다', backupTool.stalenessNote([], now).stale);

  console.log('\n[5] 복원 — 기본은 아무것도 지우지 않는다');

  /* 사고 상황 재현: 문의 1건이 사라지고, 견적 1건은 그 뒤에 새로 들어왔다. */
  const live = fakeDb({
    quotes: [{ id: 'q1', org: '○○기업', total: 1000000 }, { id: 'q3', org: '새 견적', total: 3000000 }],
    inquiries: [],
    staff_accounts: [{ id: '1', username: 'boss', display_name: '사장님' }],
    rate_overrides: [],
    app_settings: [],
  });
  const serialTables = restoreTool.readSerialTables(migrateSrc);
  ok('bigserial 테이블을 찾아낸다', serialTables.includes('staff_accounts'), JSON.stringify(serialTables.slice(0, 5)));
  ok('id가 text인 테이블은 시퀀스 대상이 아니다', !serialTables.includes('quotes'));

  for (const t of ['quotes', 'inquiries', 'staff_accounts']) {
    await restoreTool.restoreTable(live.sql, t, full.data[t], {
      replace: false, serial: serialTables.includes(t),
    });
  }
  ok('사라진 문의가 되살아난다', live.store.inquiries.length === 1, JSON.stringify(live.store.inquiries));
  ok('백업 이후에 생긴 견적을 지우지 않는다',
    live.store.quotes.some(q => q.id === 'q3'), JSON.stringify(live.store.quotes.map(q => q.id)));
  ok('이미 있는 행을 중복으로 넣지 않는다', live.store.quotes.length === 3,
    JSON.stringify(live.store.quotes.map(q => q.id)));
  ok('기본 모드는 delete를 한 번도 쓰지 않는다',
    !live.log.some(e => /^delete from/.test(e.text || '')), JSON.stringify(live.log.filter(e => e.text).map(e => e.text)));
  ok('bigserial 테이블은 시퀀스를 다시 맞춘다',
    live.log.some(e => /setval/.test(e.text || '') && /staff_accounts/.test(e.text || '')));
  ok('id가 text인 테이블에는 setval을 하지 않는다',
    !live.log.some(e => /setval/.test(e.text || '') && /"quotes"/.test(e.text || '')));

  console.log('\n[6] --replace는 지우고 넣되, 한 트랜잭션으로 한다');

  const live2 = fakeDb({ quotes: [{ id: 'q3', org: '새 견적', total: 3000000 }] });
  await restoreTool.restoreTable(live2.sql, 'quotes', full.data.quotes, { replace: true, serial: false });
  ok('백업본 그대로가 된다', live2.store.quotes.map(q => q.id).join(',') === 'q1,q2',
    JSON.stringify(live2.store.quotes.map(q => q.id)));
  const tx = live2.log.find(e => e.transaction);
  ok('delete와 insert가 같은 트랜잭션 안에 있다',
    !!tx && /^delete from "quotes"/.test(tx.transaction[0]) && /^insert into "quotes"/.test(tx.transaction[1]),
    JSON.stringify(tx));

  console.log('\n[7] 데이터는 반드시 파라미터로 넘어간다');

  const injected = fakeDb({ quotes: [] });
  await restoreTool.restoreTable(injected.sql, 'quotes',
    [{ id: "q'; drop table quotes; --", org: '<script>' }], { replace: false, serial: false });
  const insertLog = injected.log.find(e => /insert into/.test(e.text || ''));
  ok('SQL 문에는 데이터가 들어가지 않는다',
    !/drop table/.test(insertLog.text), insertLog.text);
  ok('데이터는 값으로 전달된다', /drop table/.test(insertLog.vals[0]));
  ok('테이블 이름만 문자열에 들어간다', /jsonb_populate_recordset\(null::"quotes"/.test(insertLog.text));
  await (async () => {
    let threw = false;
    try { await restoreTool.restoreTable(injected.sql, 'quotes"; drop table quotes; --', [], {}); }
    catch { threw = true; }
    ok('이상한 테이블 이름은 거부한다', threw);
  })();

  console.log('\n[8] 계획 출력이 사실을 말한다');

  const plan = restoreTool.planRestore(partial, [], { quotes: 3, inquiries: 0 });
  const inqRow = plan.find(p => p.table === 'inquiries');
  ok('백업 당시 못 읽은 테이블은 복원 대상에서 이유와 함께 빠진다',
    !!inqRow.skipped, JSON.stringify(inqRow));
  const qRow = plan.find(p => p.table === 'quotes');
  ok('백업본과 현재 DB 건수를 나란히 보여준다', qRow.inBackup === 2 && qRow.inDb === 3, JSON.stringify(qRow));

  fs.rmSync(dir, { recursive: true, force: true });

  console.log('\n[9] 저장 위치를 설정으로 뺀 것 — 클라우드 동기화 폴더를 쓰기 위해 (QR)');
  /* 백업을 클라우드 동기화 폴더에 두면 노트북이 고장나도 사본이 남는다. 그 경로는
     이 PC에만 해당하는 값이라 .env.local(gitignore됨)에서 읽는다. */
  const R = (argv, env) => backupTool.resolveBackupDir(argv, env);

  ok('아무것도 없으면 기본 폴더', R([], {}).source === '기본값');
  ok('기본 폴더는 저장소 밖이다',
    !R([], {}).dir.startsWith(path.join(__dirname, '..') + path.sep), R([], {}).dir);
  ok('BACKUP_DIR가 있으면 그쪽을 쓴다',
    R([], { BACKUP_DIR: 'D:\\동기화\\백업' }).source === 'BACKUP_DIR');
  ok('--dir가 BACKUP_DIR보다 우선한다',
    R(['--dir', 'E:\\임시'], { BACKUP_DIR: 'D:\\동기화\\백업' }).source === '--dir');
  ok('공백만 있는 BACKUP_DIR는 없는 것으로 본다',
    R([], { BACKUP_DIR: '   ' }).source === '기본값');

  /* ⚠ 여기가 이 절의 핵심이다. 동기화 폴더가 사라졌는데 조용히 새로 만들면
     백업은 매일 '성공'하면서 클라우드에는 한 건도 안 올라간다 — 정작 필요한 날
     알게 된다(결함 생성기 ②). 그래서 멈추고 말해야 한다. */
  const fakeExists = (p) => p === 'D:\\동기화';
  ok('동기화 폴더의 상위가 있으면 통과(첫 실행이라 폴더만 없는 경우)',
    backupTool.backupDirProblem({ dir: 'D:\\동기화\\백업', source: 'BACKUP_DIR' }, fakeExists) === null);
  ok('상위 경로까지 없으면 멈춘다 (조용히 새로 만들지 않는다)',
    typeof backupTool.backupDirProblem({ dir: 'Z:\\없는곳\\백업', source: 'BACKUP_DIR' }, fakeExists) === 'string');
  ok('기본값·--dir일 때는 이 검사를 적용하지 않는다',
    backupTool.backupDirProblem({ dir: 'Z:\\없는곳\\백업', source: '기본값' }, fakeExists) === null
    && backupTool.backupDirProblem({ dir: 'Z:\\없는곳\\백업', source: '--dir' }, fakeExists) === null);

  /* 백업과 복원이 **같은 규칙**으로 폴더를 찾아야 한다. 예전엔 복원 쪽에 경로가
     손으로 복사돼 있어서, 백업 위치를 바꾸면 복원만 옛 폴더를 뒤지게 돼 있었다. */
  const restoreSrc = fs.readFileSync(path.join(__dirname, 'db_restore.js'), 'utf8');
  ok('복원도 같은 규칙으로 폴더를 찾는다', /resolveBackupDir\(/.test(restoreSrc));
  ok('복원 쪽에 폴더 이름이 손으로 복사돼 있지 않다', !/비즈페이지_백업/.test(restoreSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

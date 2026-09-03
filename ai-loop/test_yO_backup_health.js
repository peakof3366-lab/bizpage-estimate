/* ═══════════════════════════════════════════════════════════════════════════
   YO — **운영 DB 백업이 조용히 멈춰 있었다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-03에 재 보니 9/2 18:00 백업이 **돌다가 죽어 있었다.** 작업 스케줄러 기록은
   `3221225786`(0xC000013A · 강제 종료), 로그는 `^C`로 끊겨 있었고, **아무도 몰랐다.**
   원인은 노트북 전원 설정이었다(`DisallowStartIfOnBatteries`·`StopIfGoingOnBatteries`).

   `db_backup.js`에 이미 `stalenessNote`가 있었다. 그 주석에 「자동 백업이 조용히 멈춘
   것을 알아채는 **유일한 창구**」라고 적혀 있는데 **`--list`를 부를 때만 나온다.**
   아무도 안 불렀다 — 결함 생성기 ③(실행된 적 없는 안전망) 그대로다.
   → `audit_backup_health.js`가 그 창구를 한 곳으로 모았다. 여기서는 그 **판정 규칙**을 잠근다.

   🔴 잠그는 것 넷:
     ① 죽은 회차를 **죽었다고 읽는다** — `exit=` 줄이 **없는 것**이 신호다
        (「exit이 0이 아님」만 찾으면 죽은 회차는 통째로 안 보인다. 실제로 그럴 뻔했다)
     ② 파일 이름의 **UTC를 한국 시각으로** 바꿔 센다 — 안 바꾸면 18시 백업이
        **다음 날 09시**로 읽혀 날짜가 하루씩 밀린다
     ③ 🔴 **보관 개수로 지워진 날을 「없던 날」로 세지 않는다** — 처음 돌렸을 때
        8/20~8/25가 빨간 줄로 나왔는데 그중 일부는 **성공했지만 지워진** 날이었다.
        (이 저장소가 반복해 겪은 「재는 자가 틀리면 고칠 것을 못 찾는다」 그 자리다)
     ④ 강제 종료 코드에 **사람이 읽는 이름**이 붙는다 — 숫자만 찍으면 아무 뜻도 안 남는다

   실행: node ai-loop/test_yO_backup_health.js
   ═══════════════════════════════════════════════════════════════════════════ */
const H = require('./audit_backup_health.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — YO 백업이 조용히 멈춘 것`);
  process.exit(fail ? 1 : 0);
};

/* 실제 로그에서 그대로 따온 모양 — 성공 하나, `^C`로 죽은 것 하나,
   그리고 **끝맺음 줄만 없는 것**(제일 놓치기 쉬운 모양) 하나. */
const LOG = [
  '',
  '==== 2026-09-01 18:00:02.41 ====',
  '운영 DB 백업 — 테이블 18개',
  '✓ 총 372행 백업 완료',
  'exit=0 ',
  '',
  '==== 2026-09-02 18:00:03.68 ====',
  '운영 DB 백업 — 테이블 18개',
  '^C',
  '',
  '==== 2026-09-04 18:00:01.10 ====',
  '운영 DB 백업 — 테이블 18개',
  '',
  '==== 2026-09-05 18:00:01.10 ====',
  '오류가 났다',
  'exit=1 ',
].join('\n');

console.log('\n[1] 🔴 ① 로그가 어떻게 끝났는지 읽는다');
{
  const runs = H.readLogRuns(LOG);
  ok('① 실행 4회를 찾았다', runs.length === 4, String(runs.length));
  ok('① 성공은 성공이라 읽는다', runs[0].ok === true && runs[0].code === 0);
  ok('🔴 ① `^C`로 죽은 것을 잡는다', runs[1].ok === false && runs[1].killed === true);
  ok('① 그 이유를 사람 말로 적는다', /강제 종료/.test(runs[1].why), runs[1].why);
  /* 여기가 핵심이다 — exit 줄이 **아예 없는** 회차 */
  ok('🔴 ① 끝맺음 줄이 없는 회차도 실패로 센다',
    runs[2].ok === false && runs[2].code === null, JSON.stringify(runs[2]));
  ok('① 0이 아닌 exit도 실패로 센다', runs[3].ok === false && runs[3].code === 1);
  ok('① 시각을 그대로 남긴다', runs[1].stamp === '2026-09-02 18:00:03.68', runs[1].stamp);
}

console.log('\n[2] 🔴 ② 파일 이름의 UTC를 한국 날짜로 바꾼다');
{
  /* 18:00 KST 백업은 파일 이름에 **09:00Z**로 찍힌다 — 그날로 세야 한다 */
  const d1 = H.fileDatesKST(['bizpage_backup_2026-09-01T09-00-16-062Z.json']);
  ok('🔴 ② 09:00Z → 그날(09-01)로 센다', d1.has('2026-09-01'), [...d1].join());
  /* 자정 넘긴 UTC는 **한국에서는 같은 날 오전**이다 */
  const d2 = H.fileDatesKST(['bizpage_backup_2026-09-03T00-15-18-414Z.json']);
  ok('🔴 ② 00:15Z → 한국 09-03 오전으로 센다', d2.has('2026-09-03'), [...d2].join());
  /* UTC 그대로 셌다면 15:00Z가 다음 날이 된다 — 그 실수를 못 박는다 */
  const d3 = H.fileDatesKST(['bizpage_backup_2026-09-01T15-30-00-000Z.json']);
  ok('② 15:30Z → 한국 09-02 (날짜가 넘어간다)', d3.has('2026-09-02'), [...d3].join());
  ok('② 이름 규칙에 안 맞는 파일은 무시한다',
    H.fileDatesKST(['메모.txt', 'bizpage_backup_이상한이름.json']).size === 0);
}

console.log('\n[3] 🔴 ③ 보관 개수로 지워진 날을 「없던 날」로 세지 않는다');
{
  const now = new Date('2026-09-03T01:00:00Z');          /* 한국 09-03 10:00 */
  /* 남은 파일은 09-01·09-03 둘뿐이다(그 앞은 지워졌다고 본다) */
  const files = [
    'bizpage_backup_2026-09-01T09-00-00-000Z.json',
    'bizpage_backup_2026-09-03T00-15-00-000Z.json',
  ];
  const cov = H.dayCoverage(files, 14, now);
  ok('🔴 ③ 창을 가장 오래된 파일까지만 잡는다', cov.clipped === true && cov.window === 2,
    JSON.stringify({ window: cov.window, clipped: cov.clipped }));
  ok('③ 어디서 잘랐는지 말한다', cov.oldest === '2026-09-01', String(cov.oldest));
  /* 09-02만 진짜 빈 날이다. 08월 날짜가 섞여 나오면 자가 틀린 것이다. */
  ok('🔴 ③ 빈 날은 09-02 하나뿐이다', cov.missing.length === 1 && cov.missing[0] === '2026-09-02',
    cov.missing.join(' · '));
  ok('③ 지워진 8월을 빈 날로 세지 않는다', !cov.missing.some((d) => d.startsWith('2026-08')),
    cov.missing.join(' · '));

  /* 대조군 — 안 지워졌으면 창을 안 자른다 */
  const 촘촘 = ['2026-08-31T09-00-00-000Z', '2026-09-01T09-00-00-000Z', '2026-09-02T09-00-00-000Z']
    .map((s) => `bizpage_backup_${s}.json`);
  const c2 = H.dayCoverage(촘촘, 3, now);
  ok('③ (대조군) 연속이면 빠진 날 0', c2.missing.length === 0 && c2.clipped === false,
    JSON.stringify(c2));
}

console.log('\n[4] ④ 강제 종료 코드에 사람이 읽는 이름이 있다');
{
  ok('🔴 ④ 0xC000013A에 이름이 붙어 있다',
    /강제 종료/.test(H.CODE_NAMES[3221225786] || ''), String(H.CODE_NAMES[3221225786]));
  ok('④ 0은 정상이라 부른다', H.CODE_NAMES[0] === '정상');
}

console.log('\n[5] 모르는 것을 「정상」이라 말하지 않는다');
{
  /* 윈도우가 아니거나 작업이 없으면 `known:false`여야 한다 —
     여기서 조용히 「이상 없음」을 반환하면 그게 결함 생성기 ②다. */
  const t = H.taskInfo('존재하지-않는-작업-이름-yO');
  ok('🔴 ⑤ 못 읽으면 known=false로 말한다', t.known === false, JSON.stringify(t).slice(0, 90));
  ok('⑤ 왜 못 읽었는지 남긴다', typeof t.why === 'string' && t.why.length > 0, String(t.why));
}

done();

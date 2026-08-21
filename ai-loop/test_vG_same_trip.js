/* VG 검증: **같은 여행을 두 번 세지 않는다** (파일은 다른데 같은 여행인 경우).

   왜 —
   VA는 **같은 파일**을 두 번 세던 것을 잡았다(바이트 해시가 같은 PDF 두 벌).
   여기는 그 다음 층이다. 실측으로 나왔다:

       2026 굿리치 일정표(확정).pdf          동유럽 158명 6일 2026-04-04 입금가 4,569,397
       굿리치RM_연도대상 체코&오스트리.pdf     동유럽 158명 6일 2026-04-04 입금가 4,569,397

   한 여행을 두고 「일정표」와 「견적서」가 따로 온 것이다. 바이트가 다르니 VA는 통과한다.
   그래서 **원가 기준 역검증 15건 중 2건이 같은 줄**이었다(둘 다 +0.1%, 사분위 경계).
   그리고 VC로 본문까지 목적지를 읽기 시작하면서 **칸별 실측 표에서도 동유럽이
   「견적서 2건」**이 됐다 — 「⚠표본1」 경고가 거짓으로 사라지는 자리다.

   여기서 고정하는 것:
   ① 목적지·인원·일수·출발일·금액이 모두 같으면 한 번만 센다.
   ② **차수별 견적은 절대 뭉치지 않는다** — 출발일이 다르다(상하이 11/08·11/15·11/22).
      SY에서 점수제로 그 함정을 이미 한 번 밟았다. 그래서 점수가 아니라 규칙이다.
   ③ 하나라도 모르는 값이 있으면 **묶지 않는다.** 모르는 것끼리 뭉치는 게 더 큰 사고다.
   ④ 뺀 것은 **조용히 사라지지 않는다** — 무엇을 무엇 때문에 뺐는지 말한다(결함 생성기 ②).
   ⑤ 두 번 돌려도 같은 것이 남는다 — 안 그러면 전/후 대조가 흔들린다.
   ⑥ 재는 도구들이 **같은 판정**을 쓴다(결함 생성기 ①).

   실행: node ai-loop/test_vG_same_trip.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = path.join(ROOT, 'ai-loop');
const { tripKey, dedupeTrips, droppedNote } = require(path.join(AI, '_same_trip.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const T = (o) => Object.assign({ dest: '동유럽', pax: 158, days: 6, date: '2026-04-04', answer: 4569397 }, o);
const run = (list) => dedupeTrips(list, (x) => x);

console.log('\n[1] 같은 여행이면 한 번만 센다');
{
  const r = run([T({ file: '2026 굿리치 일정표(확정).pdf' }), T({ file: '굿리치RM_연도대상 체코&오스트리.pdf' })]);
  ok('① 두 벌이 한 줄로 줄어든다', r.kept.length === 1, String(r.kept.length));
  ok('① 먼저 온 것이 남는다', r.kept[0].file === '2026 굿리치 일정표(확정).pdf', r.kept[0].file);
  ok('① 무엇을 뺐는지 들고 있다', r.dropped.length === 1 && /체코/.test(r.dropped[0].dropFile));
}

console.log('\n[2] 차수별 견적은 뭉치지 않는다 (SY의 함정)');
{
  /* 실측: 상하이 11/08·11/15·11/22 — 항공료만 다르다. 지우면 진짜 데이터가 사라진다. */
  const shanghai = ['2025-11-08', '2025-11-15', '2025-11-22'].map((d, i) => T({
    dest: '상해', pax: 50, days: 3, date: d, answer: 1745720 + i, file: '상해 ' + d + '.pdf',
  }));
  ok('② 출발일이 다르면 셋 다 남는다', run(shanghai).kept.length === 3);

  /* 같은 날 같은 목적지라도 **단체가 다르면** 인원·금액이 다르다 */
  ok('② 인원이 다르면 남는다', run([T({ file: 'a' }), T({ pax: 100, file: 'b' })]).kept.length === 2);
  ok('② 금액이 다르면 남는다', run([T({ file: 'a' }), T({ answer: 4569398, file: 'b' })]).kept.length === 2);
  ok('② 목적지가 다르면 남는다', run([T({ file: 'a' }), T({ dest: '로마', file: 'b' })]).kept.length === 2);
}

console.log('\n[3] 모르는 값이 있으면 묶지 않는다');
{
  ok('③ 출발일을 모르면 열쇠가 없다', tripKey(T({ date: null })) === null);
  ok('③ 금액을 모르면 열쇠가 없다', tripKey(T({ answer: null })) === null);
  /* ⚠ 전부 모르는 두 건이 「같은 여행」으로 뭉치면 그게 더 큰 사고다 */
  const blind = [T({ date: null, file: 'a' }), T({ date: null, file: 'b' })];
  ok('③ 판정할 수 없으면 둘 다 남긴다', run(blind).kept.length === 2, String(run(blind).kept.length));
}

console.log('\n[4] 뺀 것을 조용히 버리지 않는다');
{
  const r = run([T({ file: 'A.pdf' }), T({ file: 'B.pdf' })]);
  const note = droppedNote(r.dropped);
  ok('④ 뺐으면 문장을 만든다', /1건을 뺐습니다/.test(note), note);
  ok('④ 어느 것을 어느 것 때문에 뺐는지 적는다', /B\.pdf/.test(note) && /A\.pdf/.test(note), note);
  ok('④ 뺀 것이 없으면 아무 말도 하지 않는다', droppedNote([]) === '');
}

console.log('\n[5] 두 번 돌려도 같은 것이 남는다');
{
  const list = [T({ file: 'A.pdf' }), T({ file: 'B.pdf' })];
  const once = run(list).kept.map((x) => x.file).join(',');
  const twice = run(run(list).kept).kept.map((x) => x.file).join(',');
  ok('⑤ 결과가 흔들리지 않는다', once === twice && once === 'A.pdf', once + ' vs ' + twice);
}

console.log('\n[6] 재는 도구들이 같은 판정을 쓴다');
{
  /* ⚠ 판정을 도구마다 따로 적으면 반드시 갈라진다 — VA·UZ에서 이미 두 번 겪었다 */
  const users = ['backtest_quotes.js', 'audit_rate_calibration.js'];
  users.forEach((f) => {
    const s = fs.readFileSync(path.join(AI, f), 'utf8');
    ok('⑥ ' + f + ' 가 _same_trip을 쓴다', /_same_trip/.test(s));
    ok('⑥ ' + f + ' 가 뺀 것을 화면에 말한다', /droppedNote/.test(s));
  });
  /* 제자리에서 같은 판정을 다시 지은 도구가 없는지 — 다음에 또 갈라지지 않게.
     ⚠ **낱말만 보면 오탐이 난다.** 「같은 여행」은 다른 뜻으로도 쓰인다 — VM에서
       `_engine_boot.js`가 「도구마다 기본값이 다르면 *같은 여행*에 서로 다른 금액이
       나온다」라고 적었다가 걸렸다. 그 파일은 코퍼스를 읽지도 않는다.
     → **코퍼스를 읽는 파일만** 본다. 코퍼스를 안 읽으면 같은 여행을 두 번 셀 수가 없다.
       오탐이 쌓이면 그 검사는 곧 무시되고, 그때부터는 진짜도 못 잡는다. */
  const rogue = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && !f.startsWith('test_') && f !== '_same_trip.js')
    .filter((f) => {
      const s = fs.readFileSync(path.join(AI, f), 'utf8');
      const readsCorpus = /_corpus_files|_corpus_cache/.test(s);
      return readsCorpus && /같은 여행/.test(s) && !/_same_trip/.test(s);
    });
  ok('⑥ 제자리에서 같은 판정을 다시 지은 도구가 없다', rogue.length === 0, rogue.join(' · '));
}

console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

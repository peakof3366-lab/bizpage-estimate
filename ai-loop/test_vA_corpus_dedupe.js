/* VA 검증: **같은 견적서를 두 번 세지 않는가**.

   왜 —
   코퍼스 폴더에 바이트 단위로 똑같은 PDF가 두 벌 있었다(`키움에셋플래너(북해도).pdf`와
   `… (1).pdf`, md5 동일). 그런데 코퍼스를 읽는 도구가 **저마다 제자리에서**
   `readdirSync(...).sort()`를 하고 있어서(결함 생성기 ①) 그 문서가 어디서나 두 건으로
   세어졌다 — 역검증 표본, 축 분석의 「일본」 무리, 요율 보정 중앙값 전부.

   여기서 고정하는 것:
   ① 내용이 같으면 하나만 남긴다. 남기는 것은 **「(N)」 꼬리가 없는 이름**이다.
   ② **한 바이트라도 다르면 둘 다 남긴다** — 차수별 견적(항공료만 다른 상하이 3건)을
      지우면 진짜 데이터가 사라진다. SY에서 점수제로 그 함정을 이미 밟았다.
   ③ 뺀 것을 **조용히 버리지 않는다**(결함 생성기 ②) — 그 자리에서 말한다.
   ④ 코퍼스를 읽는 도구가 **직접 목록을 만들지 않는다** — 한 곳에서만 만든다.
   ⑤ 역검증의 `--cache` 경로도 중복을 거른다 — 캐시는 파일 목록을 안 거치므로
      여기서 안 걸면 안전망이 `--cache`일 때만 조용히 안 돈다(결함 생성기 ③).

   실행: node ai-loop/test_vA_corpus_dedupe.js  (프로젝트 루트에서) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { corpusFiles } = require(path.join(ROOT, 'ai-loop', '_corpus_files.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 일부러 망가진 폴더를 만들어 잡히는지 본다 — 만들어만 두고 안 도는 안전망을 막는다 */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-va-'));
const put = (name, body) => fs.writeFileSync(path.join(TMP, name), body);

console.log('\n[1] 내용이 같으면 하나만 남는다');
{
  put('키움에셋플래너(북해도).pdf', 'AAAA');
  put('키움에셋플래너(북해도) (1).pdf', 'AAAA');
  put('다른 견적서.pdf', 'BBBB');
  const { files, dropped } = corpusFiles(TMP, { quiet: true });
  ok('① 3개 중 2개만 남는다', files.length === 2, files.join(' · '));
  ok('① 남는 것은 꼬리 없는 이름이다',
    files.indexOf('키움에셋플래너(북해도).pdf') >= 0 && files.indexOf('키움에셋플래너(북해도) (1).pdf') < 0,
    files.join(' · '));
  ok('③ 무엇을 왜 뺐는지 말한다',
    dropped.length === 1 && dropped[0].file === '키움에셋플래너(북해도) (1).pdf'
      && dropped[0].sameAs === '키움에셋플래너(북해도).pdf', JSON.stringify(dropped));
  ok('① 목록은 사전순 그대로다', files[0] < files[1], files.join(' · '));
}

console.log('\n[2] 비슷하기만 한 것은 **둘 다 남는다** (차수별 견적 함정)');
{
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP);
  /* 상하이 11/08·11/15·11/22 — 항공료만 다르고 나머지는 전부 같다 */
  put('상하이 1차.pdf', '항공 360000 지상 500000 인원 50');
  put('상하이 2차.pdf', '항공 345000 지상 500000 인원 50');
  put('상하이 3차.pdf', '항공 330000 지상 500000 인원 50');
  const { files, dropped } = corpusFiles(TMP, { quiet: true });
  ok('② 한 바이트만 달라도 셋 다 남는다', files.length === 3, files.join(' · '));
  ok('② 아무것도 안 뺐다', dropped.length === 0, JSON.stringify(dropped));
}

console.log('\n[3] 꼬리가 붙은 것만 있으면 사전순으로 하나를 고른다 (결과가 재현돼야 한다)');
{
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP);
  put('견적서 (1).pdf', 'CCCC');
  put('견적서 (2).pdf', 'CCCC');
  const a = corpusFiles(TMP, { quiet: true }).files;
  const b = corpusFiles(TMP, { quiet: true }).files;
  ok('두 번 불러도 같은 것을 남긴다', a.length === 1 && a[0] === b[0], a.join(' · '));
  ok('사전순으로 앞선 것을 남긴다', a[0] === '견적서 (1).pdf', a.join(' · '));
}
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n[4] 코퍼스를 읽는 도구가 **직접 목록을 만들지 않는다**');
{
  const AI = path.join(ROOT, 'ai-loop');
  /* ⚠ 이 검사 파일 자신과 공용 목록 파일은 뺀다 — 둘 다 그 패턴을 **문자열로** 담고 있다.
     (처음에 안 뺐다가 이 검사가 스스로를 위반자로 지목했다.) */
  const SELF = ['_corpus_files.js', path.basename(__filename)];
  const offenders = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && SELF.indexOf(f) < 0)
    .filter((f) => {
      const src = fs.readFileSync(path.join(AI, f), 'utf8');
      return /readdirSync\(CORPUS\)/.test(src);
    });
  ok('④ 제자리에서 readdirSync(CORPUS)를 하는 파일이 없다', offenders.length === 0,
    offenders.join(' · '));

  const users = fs.readdirSync(AI)
    .filter((f) => f.endsWith('.js') && SELF.indexOf(f) < 0)
    .filter((f) => /corpusFiles\(/.test(fs.readFileSync(path.join(AI, f), 'utf8')));
  ok('④ 실제로 공용 목록을 쓰는 도구가 여럿이다 (17개 이상)', users.length >= 17,
    users.length + '개');
}

console.log('\n[5] 역검증의 --cache 경로도 중복을 거른다');
{
  const src = fs.readFileSync(path.join(ROOT, 'ai-loop', 'backtest_quotes.js'), 'utf8');
  const block = src.slice(src.indexOf('if (USE_CACHE'), src.indexOf('const pdfParse'));
  ok('⑤ 캐시를 그대로 돌려주지 않는다', !/return cached\.rows;/.test(block), block.slice(0, 200));
  ok('⑤ 캐시 행을 공용 목록으로 거른다',
    /corpusFiles\(CORPUS\)/.test(block) && /cached\.rows\.filter/.test(block), block.slice(0, 400));
}


console.log('\n[6] 심기 도구가 **이미 창고에 있는 코스를 다시 심지 않는다**');
{
  const { pickFresh, courseBody } = require(path.join(ROOT, 'ai-loop', 'seed_courses_from_corpus.js'));
  const day = (am) => ({ day: 1, title: '', am, pm: '', eve: '', tip: '' });
  const mk = (am, extra) => Object.assign({ title: '오키나와 견적서 일정 (검토 필요)', days: [day(am)] }, extra || {});

  /* 실측 그대로: 담당자가 검토해 저장하면 그 코스의 source 표시가 사라진다.
     예전 판은 「source === 'quote'」만 봐서 그 코스를 못 알아보고 **같은 것을 또 심었다**
     — 운영 DB 오키나와 [2,3]이 그렇게 두 벌이 됐다. */
  const cur = [mk('나하공항 도착 후 입국 수속', { source: undefined })];
  const list = [{ file: 'Hanatour(오키나와).pdf', course: mk('나하공항 도착 후 입국 수속', { source: 'quote', pending: true }) }];
  const r = pickFresh(cur, list);
  ok('⑥ 검토해 저장한 코스와 내용이 같으면 다시 심지 않는다',
    r.fresh.length === 0 && r.already.length === 1,
    JSON.stringify({ fresh: r.fresh.length, already: r.already.length }));

  const cur2 = [mk('나하공항 도착 후 입국 수속', { source: 'quote', pending: true })];
  ok('⑥ 검토 전 코스와 같아도 다시 심지 않는다', pickFresh(cur2, list).fresh.length === 0);

  /* 내용이 다르면 심는다 — 지우면 안 되는 진짜 재고다 */
  const other = [{ file: '바모스(오키나와).pdf', course: mk('5:35 김해 국제공항에서 미팅', { source: 'quote', pending: true }) }];
  ok('⑥ 내용이 다르면 심는다', pickFresh(cur, other).fresh.length === 1);

  const twin = [list[0], { file: '사본.pdf', course: mk('나하공항 도착 후 입국 수속', { source: 'quote', pending: true }) }];
  const r3 = pickFresh([], twin);
  ok('⑥ 후보끼리 같은 것도 하나만 심는다', r3.fresh.length === 1 && r3.already.length === 1,
    JSON.stringify({ fresh: r3.fresh.length, already: r3.already.length }));

  /* 제목·source·pending은 검토하면서 바뀌는 칸이라 판정에서 뺀다 */
  ok('⑥ 제목·source·pending은 내용 판정에 안 쓴다',
    courseBody(mk('같은 내용', { source: 'quote', pending: true, title: '가' }))
      === courseBody(mk('같은 내용', { title: '나' })));
}
console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

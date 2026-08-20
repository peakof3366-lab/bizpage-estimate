/* 코퍼스 폴더의 견적서 목록 — **같은 문서를 두 번 세지 않는다** (VA).

   ⚠ **왜 만들었나.** 코퍼스 폴더에 바이트 단위로 **똑같은 PDF가 두 벌** 있었다:

       키움에셋플래너(북해도).pdf
       키움에셋플래너(북해도) (1).pdf     ← 같은 파일을 두 번 내려받은 흔적

   둘 다 md5 `d3c737ec…`로 같고 크기도 같다. 그런데 코퍼스를 읽는 도구 17개가
   전부 제자리에서 `readdirSync(...).filter(.pdf).sort()`를 하고 있어서(결함 생성기 ①)
   **그 문서 하나가 어디서나 두 건으로 세어졌다.** 실측으로 드러난 것:

     · 역검증  33건 중 2건이 같은 삿포로 135명 건(둘 다 −19.2%) — 표본은 실제로 32건이다
     · 축 분석 「일본」 9건 중 2건이 그 하나라 중앙값 −16.6%가 그쪽으로 끌린다
     · 요율 보정(`audit_rate_calibration`)의 실측 중앙값도 같은 값을 두 번 센다

   ⚠ **가중치가 두 배가 되는 게 진짜 피해다.** 지금 표본이 30건대라 한 건이 중앙값을
     움직인다. 그리고 이건 「빈칸」이 아니라 **틀린 값** 쪽이다(대표 방침: 빈칸보다
     틀린 값이 위험하다) — 조용히 요율에 얹힌다.

   ⚠ **판정은 바이트 해시다. 점수가 아니라 규칙이다.**
     비슷한 문서를 지우면 안 된다 — 차수별 견적(상하이 11/08·11/15·11/22)은 항공료만
     다르고 나머지가 전부 같아서 점수제로는 중복으로 걸린다. 실제로 SY에서 그 함정을
     한 번 밟았다. 여기서는 **내용이 한 바이트라도 다르면 둘 다 남긴다.**

   ⚠ **조용히 버리지 않는다**(결함 생성기 ②). 뺀 것이 있으면 이 함수가 그 자리에서
     한 줄 찍는다. 부르는 쪽이 안 찍어도 흔적이 남게 하려고 여기 두었다.

   실행: `node ai-loop/_corpus_files.js` — 지금 폴더에서 무엇이 겹치는지만 본다.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');

/* 「무엇무엇 (1).pdf」 — 윈도우가 같은 이름을 또 받을 때 붙이는 꼬리.
   같은 내용이 여럿이면 **꼬리 없는 이름을 남긴다**(사람이 원래 넣은 것). */
const COPY_SUFFIX_RE = /\s\(\d+\)(?=\.[^.]+$)/;

/* @param {string} dir              코퍼스 폴더
   @param {{quiet?: boolean}} opts  quiet면 안내를 안 찍는다(테스트용)
   @returns {{files: string[], dropped: {file: string, sameAs: string}[]}} */
function corpusFiles(dir, opts) {
  const quiet = !!(opts && opts.quiet);
  const all = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();

  /* 해시 → 같은 내용인 파일들 */
  const byHash = new Map();
  for (const f of all) {
    const h = crypto.createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }

  const drop = new Map(); // 버릴 파일 → 남길 파일
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    /* 꼬리 없는 이름을 먼저, 그다음 사전순. 남기는 것이 매번 같아야 결과가 재현된다. */
    const keep = group.slice().sort((a, b) => {
      const ca = COPY_SUFFIX_RE.test(a) ? 1 : 0;
      const cb = COPY_SUFFIX_RE.test(b) ? 1 : 0;
      return ca !== cb ? ca - cb : (a < b ? -1 : 1);
    })[0];
    for (const f of group) if (f !== keep) drop.set(f, keep);
  }

  const files = all.filter((f) => !drop.has(f));
  const dropped = [...drop.entries()].map(([file, sameAs]) => ({ file, sameAs }));
  if (dropped.length && !quiet) {
    console.log('⚠ 내용이 같은 견적서 ' + dropped.length + '건을 뺐습니다 (같은 문서를 두 번 세면 중앙값이 그쪽으로 끌립니다):');
    for (const d of dropped) console.log('   · ' + d.file + '  ← ' + d.sameAs + '와 같은 파일');
  }
  return { files, dropped };
}

module.exports = { corpusFiles, DEFAULT_CORPUS, COPY_SUFFIX_RE };

if (require.main === module) {
  const dir = process.argv[2] || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
  if (!fs.existsSync(dir)) { console.log('코퍼스 폴더가 없습니다: ' + dir); process.exit(1); }
  const { files, dropped } = corpusFiles(dir);
  console.log('견적서 ' + files.length + '건 (중복 ' + dropped.length + '건 제외)');
}

/* ═══════════════════════════════════════════════════════════════════════════
   코퍼스 추출 + 캐시 — 단일 출처 (VL)
   ───────────────────────────────────────────────────────────────────────────
   견적서 PDF를 훑어 `.backtest_cache.json`에 담는다. 역검증·칸별 오차 분해가
   **같은 캐시 파일**을 쓰므로 판(version)과 담는 칸이 한 곳에 있어야 한다.
   두 벌로 두면 한쪽이 칸을 늘렸을 때 다른 쪽이 조용히 낡은 캐시를 재사용한다
   (`--cache`일 때만 어긋나는, 가장 늦게 발견되는 종류의 결함이다 — VC에서 겪었다).

   ⚠ 코퍼스 PDF는 **저장소에 넣지 않는다** — 참가자 실명과 거래처 단가가 들어 있다.
     캐시도 `.gitignore`에 있어야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
const { destFromName } = require('./_dest_from_name');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.backtest_cache.json');

/* ⚠ 캐시에 칸이 늘면 **판을 올린다.** 안 올리면 옛 캐시에 그 칸이 없어
   `--cache`일 때만 조용히 비는, 안 도는 안전망이 된다(결함 생성기 ③).
     6 — VC: `dest` · VE: `needsFx`·`dates.departWhy`
     7 — VL: `evidence`(칸별 실측을 **믿어도 되는가**). 없으면 오차 분해가
         검산 안 된 값까지 요율에 얹어 재게 된다.
     8 — VL: `mealDayCount`(견적서가 식비를 **몇 일로 나눴는가**). 엔진은
         `mealDays = days`로 여행 일수 전부에 식비를 매기는데, 견적서는 끼니가 적힌
         날 수로 나눈다(실측: 5일 일정인데 3일). 이 칸이 없으면 두 값을 그대로
         견주게 되고, 그러면 식비 배수가 통째로 부푼다. */
const CACHE_VERSION = 8;

const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');

async function loadCorpus(opts) {
  const o = opts || {};
  const CORPUS = o.corpus || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
  const say = o.quiet ? () => {} : (m) => console.log(m);

  if (o.useCache && fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (cached && cached.version === CACHE_VERSION) {
      say('캐시 사용: ' + CACHE + '  (--cache 빼면 다시 추출)');
      /* ⚠ VA: 캐시는 **파일 목록을 거치지 않는다.** 여기서 다시 거르지 않으면 중복 제거가
         `--cache`일 때만 조용히 안 먹는다(결함 생성기 ③). 옛 캐시에 남아 있는 중복 행도
         이 한 줄이 걷어낸다. */
      const allow = new Set(corpusFiles(CORPUS).files);
      return cached.rows.filter((r) => allow.has(r.file));
    }
    say('캐시가 낡았습니다(판 ' + (cached && cached.version) + ' ≠ ' + CACHE_VERSION + ') — 다시 추출합니다.');
  }

  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  say('견적서 ' + files.length + '건 추출 중… (1~3분)');
  const out = [];
  for (const f of files) {
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      const r = await X.extractQuote(buf, pdfParse, {});
      out.push({
        file: f, pax: r.pax, perPerson: r.perPerson, grand: r.grandTotal,
        deposit: r.depositPerPerson || null, depositAll: r.depositCandidates || [],
        dates: r.dates, kind: r.kind && r.kind.kind, values: r.values,
        /* VC: 목적지 판정을 **여기서 한 번만** 한다. 본문이 필요한데 본문은 캐시에
           싣지 않기 때문이다(46건 전문이면 캐시가 몇 MB로 부푼다). 판정 결과만 싣는다. */
        dest: destFromName(f, r.text),
        /* VE: 「못 읽음」의 이유를 가르는 데 쓴다. */
        needsFx: r.needsFxRate || null,
        /* UU: 인원이 문서 계산과 어긋난다는 표시. */
        paxConflict: r.paxConflict || null,
        /* VL: 칸별 실측을 **믿어도 되는가**(`evidence[k].via`). 전문은 안 싣고
           `via`만 남긴다 — 캐시를 부풀리지 않으면서 판정에 필요한 것은 이것뿐이다.
           ⚠ 값만 싣고 이 칸을 빼면, 검산 안 된 값이 「실측」 얼굴로 요율에 얹힌다. */
        via: Object.keys(r.evidence || {}).reduce((m, k) => {
          const v = (r.evidence || {})[k];
          if (v && v.via) m[k] = v.via;
          return m;
        }, {}),
        /* VL: 견적서가 식비를 **몇 일로 나눴는가**. 엔진의 `mealDays`와 다를 수 있고,
           다르면 1인 1일 식비를 그대로 견줄 수 없다. 없으면 null — 0으로 채우면
           「안 나눴다」와 「모른다」가 같은 얼굴이 된다(결함 생성기 ②). */
        mealDayCount: ((r.evidence || {}).meal || {}).dayCount || null,
      });
    } catch (e) {
      out.push({ file: f, error: String(e.message).slice(0, 120) });
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify({ version: CACHE_VERSION, rows: out }, null, 1), 'utf8');
  return out;
}

module.exports = { loadCorpus, CACHE, CACHE_VERSION, DEFAULT_CORPUS };

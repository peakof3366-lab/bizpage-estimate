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
/* 사람이 채운 값(환율·판매가)의 단일 출처 — 없으면 지금과 똑같이 동작한다 (XZ) */
const { fxFor: manualFxFor, answerFor: manualAnswerFor, datesFor: manualDatesFor, 이름확인: manualNameCheck, manualSig } = require('./_corpus_manual');

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
         견주게 되고, 그러면 식비 배수가 통째로 부푼다.
     9 — VM: `specHints`(문서가 **비즈니스석·1인1실을 말하는가**). 사양 손잡이가
         「맞출 수 있다」와 「실제로 그랬다」를 가르는 데 쓴다 — 없으면 손잡이 탐색이
         우연히 맞은 것과 진짜를 구분하지 못한다(과적합).
    10 — VM: `specHints.airExcluded`(문서가 **항공 불포함이라 말하는가**). 「항공 단가를
         못 읽음」을 「항공 없음」이라 부르던 오진을 가른다 — 처방이 정반대다.
    11 — VN: `specHints.fee/vat` · `shape`(미분류 비중·골프 줄 수). **정답지의 성격**을
         가르는 데 쓴다 — 가설 셋이 기각된 뒤 남은 의심이 표본 자체라서다.
    12 — XZ: `fromHuman`(이 행의 어느 칸이 **사람에게서 왔는가**). 문서에서 읽은 값과
         사람이 채운 값을 섞어 놓고 표시가 없으면, 나중에 「이 실측이 문서에서 나온
         것인가」를 물을 때 아무도 답할 수 없다. */
const CACHE_VERSION = 12;

const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');

/* ── 문서가 사양을 말하는가 (VM) ────────────────────────────────────────────
   ⚠ **좌석/객실을 가리키는 말만** 본다. 「비즈니스」 한 낱말로 잡으면 「비즈니스 미팅」·
     「비즈니스 센터」·「비즈니스 캐주얼」이 전부 걸려 신호가 소음이 된다.
   ⚠ 이 판정은 「그렇게 적혀 있다」까지다. 부정문(「비즈니스 불가」)도 걸리므로
     **단독 근거로 쓰지 말고 대조에만** 쓴다. 그 경고를 쓰는 쪽에도 적어 둔다. */
const BUSINESS_RE = /비즈니스\s*(석|클래스)|프레스티지\s*(석|클래스)|business\s*class|비즈니스석/i;
const SINGLE_RE = /1\s*인\s*1\s*실|싱글\s*차지|single\s*(charge|room)/i;

/* ── 🔴 **항공이 문서에 있는가**와 **추출했는가**는 다른 문제다 (VM) ─────────
   `audit_gap_source`가 「항공 단가를 못 읽음」을 **「항공 없음(지상비)」이라 부르고
   있었다.** 그 무리는 중앙값 +21.7%라 「지상비 견적이라 엔진이 구조적으로 비싸다」는
   그럴듯한 결론이 나왔는데, **문서를 열어 보니 7건 중 6건에 항공이 또렷이 있었다**
   (「왕복 항공권 포함」·「인천 OZ747 17:00 출발」 같은 줄). 즉 **추출 실패**였다.
   진짜 불포함은 1건뿐이다(고은회 제주도: 「불포함사항 왕복항공료…」).

   처방이 정반대다 — 추출 실패는 **우리가 고칠 결함**이고, 진짜 불포함은 **대조하면
   안 되는 문서**다(엔진은 항공을 항상 넣는다). 그래서 둘을 갈라 싣는다.
   ⚠ 「불포함」 낱말이 항공 근처에 있어야 한다. 문서 전체에서 두 낱말을 따로 찾으면
     「불포함사항: 개인경비」와 「항공 시간 변경 가능」이 있는 문서가 전부 걸린다. */
const AIR_EXCLUDED_RE = /불포함[^\n]{0,40}항공|항공[^\n]{0,20}불포함|항공료\s*(별도|불포함)/;

/* ── 문서의 **성격**을 재는 신호 (VN) ──────────────────────────────────────
   VL·VM에서 가설 셋이 기각됐다(요율 · 사양 · 지상비). 남은 의심은 **정답지**다 —
   36건이 정말 우리 가견적과 같은 상품인가.
   ⚠ 전부 「문서가 그렇게 적었다」까지다. 뜻을 단정하지 않는다.

   알선 수수료 = 여행사가 **우리 마진에 해당하는 몫**을 별도 줄로 적은 것.
   이 줄이 있으면 그 견적서 총액에 여행사 이윤이 **명시적으로** 들어 있다. 없으면
   단가에 녹아 있거나 아예 없다 — 우리와 견주는 뜻이 서로 다르다.

   부가세 = 우리 화면은 「예상 총액 (VAT 별도)」인데, 견적서 10건은 「부가세 포함 ·
   세금계산서 발행 가능」이라 적는다. 해외여행은 여행경비가 면세이고 **알선수수료만
   과세**라 그렇게 쓰는 것이 관행이다. 둘이 같은 것을 세고 있는지 봐야 한다. */
const FEE_RE = /알선\s*수수료|여행\s*수수료|대행\s*수수료|취급\s*수수료/;
const VAT_RE = /부가세|부가가치세|\bVAT\b|세금계산서/i;

function specHintsOf(text) {
  const t = String(text || '');
  if (!t) return null;                      /* 본문을 못 얻었다 — false로 채우면 「없다」로 읽힌다 */
  return {
    business: BUSINESS_RE.test(t),
    single: SINGLE_RE.test(t),
    airExcluded: AIR_EXCLUDED_RE.test(t),
    fee: FEE_RE.test(t),
    vat: VAT_RE.test(t),
  };
}

/* 문서 돈의 몇 %가 **우리 9칸 어디에도 안 들어가는가**.
   ⚠ `audit_item_taxonomy`·`audit_gap_source`와 **같은 목록**을 써야 한다 —
     세 곳이 다른 칸을 세면 어느 쪽을 믿을지 알 수 없다(결함 생성기 ①). */
const RATE_CATS = require('../api/_lib/item_keys').CORPUS_ITEM_KEYS;

function shapeOf(r) {
  const cands = (r.candidates || []).filter((c) => !c.unconvertible);
  if (!cands.length) return null;           /* 줄을 하나도 못 읽었다 — 0%로 채우면 「깨끗하다」로 읽힌다 */
  const denom = r.grandTotal || r.itemsTotal || 0;
  const unclass = cands.filter((c) => RATE_CATS.indexOf(c.category) < 0)
    .reduce((n, c) => n + (c.total || 0), 0);
  return {
    unclassRatio: denom ? unclass / denom : null,
    golfLines: cands.filter((c) => c.category === 'golf').length,
    lines: cands.length,
  };
}

async function loadCorpus(opts) {
  const o = opts || {};
  const CORPUS = o.corpus || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;
  const say = o.quiet ? () => {} : (m) => console.log(m);

  if (o.useCache && fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    /* 🔴 **사람이 값을 채우면 캐시는 그 자리에서 낡는다** (XZ). 안 그러면 환율을
       넣어도 `--cache`로 돌리는 도구들이 **옛 결과를 계속 보여준다** — 채운 사람은
       「왜 안 늘지」를 한참 찾게 된다(VA에서 캐시가 목록을 안 거쳐 겪은 것과 같은 종류). */
    if (cached && cached.version === CACHE_VERSION && cached.manualSig !== manualSig()) {
      say('사람이 채운 값이 바뀌었습니다 — 캐시를 버리고 다시 추출합니다.');
    } else if (cached && cached.version === CACHE_VERSION) {
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
  manualNameCheck(files, say);   /* 손으로 채운 이름이 실제로 있는가 (XZ) */
  say('견적서 ' + files.length + '건 추출 중… (1~3분)');
  const out = [];
  for (const f of files) {
    try {
      const buf = new Uint8Array(fs.readFileSync(path.join(CORPUS, f)));
      /* 🔴 **사람이 채운 환율을 여기서 준다** (XZ). 예전엔 `{}`를 넘겼다 —
         추출기는 `opts.fxRate`를 받을 준비가 되어 있었는데(SF) **부르는 쪽이 안 줬다.**
         그래서 관리자 화면에서 환율을 넣어도 역검증 표본은 그대로였다(결함 생성기 ③).
       ⚠ 값이 없으면 `null`이라 지금과 똑같이 동작한다 — 그 견적서는 표본에서 빠진다. */
      const 손으로준환율 = manualFxFor(f);
      const r = await X.extractQuote(buf, pdfParse, 손으로준환율 ? { fxRate: 손으로준환율 } : {});

      /* 🔴 **문서가 말하지 않은 것만 사람 값으로 채운다** (XZ).
         정답지(1인당·총계)와 출발일은 문서에서 읽혔으면 **문서가 이긴다** —
         사람 값으로 덮으면 추출기가 틀렸을 때 그 사실이 영영 안 보인다.
         비어 있을 때만 채우고, **사람에게서 왔다는 표시를 남긴다**(`fromHuman`).
       ⚠ 표시가 없으면 나중에 「이 실측이 문서에서 나온 것인가」를 물을 때 답할 수 없다. */
      const 손정답 = manualAnswerFor(f) || {};
      const 손일정 = manualDatesFor(f) || {};
      const fromHuman = [];
      const perPerson = r.perPerson || (손정답.perPerson && (fromHuman.push('perPerson'), 손정답.perPerson)) || null;
      const grand = r.grandTotal || (손정답.grand && (fromHuman.push('grand'), 손정답.grand)) || null;
      const dates = Object.assign({}, r.dates);
      if (!dates.depart && 손일정.depart) { dates.depart = 손일정.depart; fromHuman.push('depart'); }
      if (!dates.return && 손일정.return) { dates.return = 손일정.return; }
      if (!dates.days && 손일정.days) { dates.days = 손일정.days; fromHuman.push('days'); }
      if (손으로준환율) fromHuman.push('fx');

      out.push({
        file: f, pax: r.pax, perPerson, grand, dates, fromHuman: fromHuman.length ? fromHuman : null,
        deposit: r.depositPerPerson || null, depositAll: r.depositCandidates || [],
        kind: r.kind && r.kind.kind, values: r.values,
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
        /* VM: 문서가 사양을 말하는가. **본문은 캐시에 안 싣고 판정만 싣는다**(VC와 같은 이유).
           ⚠ 이것은 「그렇게 적혀 있다」이지 「그 여행이 그랬다」가 아니다 — 견적서에
             「비즈니스 불가」처럼 부정문으로 적힌 경우도 걸린다. 그래서 이 신호는
             **손잡이 탐색 결과를 대조하는 데만** 쓰고, 단독 근거로 쓰지 않는다.
           ⚠ 낱말을 넓게 잡지 않았다 — 「비즈니스」만으로 잡으면 「비즈니스 미팅」·
             「비즈니스 센터」가 전부 걸린다. 좌석/객실을 가리키는 말만 본다. */
        specHints: specHintsOf(r.text),
        /* VN: 문서 돈의 성격 — 미분류 비중·골프 줄 수. 못 읽으면 null이다(0%로 채우면
           「깨끗한 문서」로 읽혀, 비교 가능성 판정이 통째로 거짓이 된다). */
        shape: shapeOf(r),
      });
    } catch (e) {
      out.push({ file: f, error: String(e.message).slice(0, 120) });
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify({ version: CACHE_VERSION, manualSig: manualSig(), rows: out }, null, 1), 'utf8');
  return out;
}

module.exports = { loadCorpus, CACHE, CACHE_VERSION, DEFAULT_CORPUS };

/* VB 검증: **측정 도구가 「지금 요율」로 재는가**.

   왜 —
   요율의 진실은 `data.js`가 아니라 운영 DB(`rate_overrides`)다(CLAUDE.md). TR이
   `_rate_overrides.js`를 만들어 측정 도구에 운영값을 실어 줬는데, **세 자리가 안 붙었다**:

     audit_rate_calibration.js  머리말엔 「운영 오버라이드 반영」이라 적어 두고 코드엔 없었다
     sim_rate_change.js         「한 번은 **지금 요율**로」라면서 '전'이 기본값이었다
     validate_corpus.js         기준가(base)가 기본값이라 ③·⑤ 판정이 낡은 자로 재고 있었다

   피해가 실제로 컸다. 2026-08-13에 실측으로 고쳐 둔 칸을 요율 교정표가 **여전히 틀린
   것으로** 찍었다 — 🔴 12칸 중 6칸(삿포로 가이드·푸꾸옥/다낭/오키나와 유류·홍콩/카자흐
   식비)이 그것이고, 여섯 칸 전부 **운영값 = 실측 중앙값으로 이미 정확히 일치**했다.
   그대로 따랐으면 맞춰 놓은 값을 한 번 더 반토막 냈을 것이다.

   여기서 고정하는 것:
   ① 코퍼스를 읽으면서 **요율값을 기준으로 쓰는** 도구는 전부 `_rate_overrides`를 부른다.
      (결함 생성기 ① — 도구가 저마다 제 요율을 들고 있으면 반드시 갈라진다)
   ② **머리말이 코드보다 앞서가지 않는다.** 「오버라이드 반영」이라 적었으면 실제로 부른다.
      이번 결함이 오래 안 보인 이유가 이것이다 — 문서만 읽으면 붙은 것처럼 보였다.
   ③ 운영값을 **계획보다 먼저** 얹는다. 반대면 `mul`이 기본값에 곱해져, 이미 고쳐 둔
      칸이 시뮬레이션에서 사라진다.
   ④ 못 받으면 **조용히 기본값으로 떨어지지 않는다**(결함 생성기 ②) — 무엇으로 쟀는지 밝힌다.
   ⑤ 얹는 방식은 script.js와 같다 — 숫자 칸만, 있는 칸만.

   실행: node ai-loop/test_vB_rate_overrides.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = path.join(ROOT, 'ai-loop');
const { loadOverrides, applyOverrides } = require(path.join(AI, '_rate_overrides.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const srcOf = (f) => fs.readFileSync(path.join(AI, f), 'utf8');
const tools = fs.readdirSync(AI)
  .filter((f) => f.endsWith('.js') && !f.startsWith('test_') && !f.startsWith('_'));

/* **요율값을 기준으로 쓰는가** — 개념이 아니라 증상으로 찾는다(test_vA ④와 같은 방식).
   두 갈래뿐이다: 목적지 행에서 요율 칸을 직접 꺼내 쓰거나(`dRow[CELL[k]]`),
   data.js를 실어 엔진을 띄우거나(jsdom). 둘 다 아니면 요율을 자로 쓰지 않는 도구다
   (추출 검사·코퍼스 적재·일정 심기 — 이들은 오버라이드가 필요 없다). */
/* ⚠ VL에서 두 군데가 넓어졌다. 증상으로 찾는 검사는 **문법이 바뀌면 조용히 못 찾는다** —
   그게 「검사는 통과하는데 실제로는 안 보고 있는」 상태를 만든다(결함 생성기 ③):
     · 교정표가 `dest[CELL[k]]` → `dest[field]`로 바뀌면서 `[CELL[` 패턴에서 빠졌다.
     · 새 도구(`audit_error_decomp`)가 코퍼스를 `_corpus_cache`로 읽어 `_corpus_files`
       패턴에서 빠졌다. 요율을 자로 쓰는데도 이 검사 밖에 있었다. */
const usesRateBaseline = (s) => /\[\s*CELL\[/.test(s) || /FIELD_LABEL\[/.test(s)
  || (/new JSDOM\(/.test(s) && /read\('data\.js'\)/.test(s));
const readsCorpus = (s) => /_corpus_files/.test(s) || /_corpus_cache/.test(s);

console.log('\n[1] 요율을 자로 쓰는 코퍼스 도구는 전부 운영값을 얹는다');
{
  const measuring = tools.filter((f) => { const s = srcOf(f); return readsCorpus(s) && usesRateBaseline(s); });
  ok('① 자로 쓰는 도구를 실제로 찾아냈다 (검사가 헛돌지 않는다)', measuring.length >= 6,
    measuring.join(' · '));
  const missing = measuring.filter((f) => !/_rate_overrides/.test(srcOf(f)));
  ok('① 그 도구 전부가 _rate_overrides를 부른다', missing.length === 0,
    missing.length ? '안 부르는 도구: ' + missing.join(' · ') : '');

  /* VB에서 실제로 고친 세 자리 — 이름을 박아 둔다. 지우면 그 자리가 조용히 되돌아간다. */
  /* VL 추가: 새 분해기도 요율을 자로 쓴다. 이름을 박아 두지 않으면 탐지기 문법이
     바뀔 때 조용히 빠지고, 그러면 낡은 요율로 재고도 아무도 모른다. */
  ['audit_rate_calibration.js', 'sim_rate_change.js', 'validate_corpus.js',
    'audit_error_decomp.js'].forEach((f) => {
    ok('① ' + f + ' 가 목록에 있다', measuring.indexOf(f) >= 0);
  });

  /* 자로 안 쓰는 도구까지 끌고 오면 검사가 소란스러워져 곧 안 읽힌다 */
  ['build_corpus_db.js', 'seed_courses_from_corpus.js'].forEach((f) => {
    ok('① ' + f + ' 는 요율을 자로 쓰지 않으므로 대상이 아니다', measuring.indexOf(f) < 0);
  });
}

console.log('\n[2] 머리말이 코드보다 앞서가지 않는다');
{
  /* ⚠ 이 검사가 처음 돌 때 `live_rates.js`를 잡았는데, 그건 거짓말이 아니라
     **오버라이드를 얹는 두 번째 구현**이었다(동기 curl · 커스텀 목적지까지 병합).
     그래서 「스스로 /api/rates를 받아오는 것」도 인정한다. 두 벌이라는 사실 자체는
     [6]에서 대조한다 — 없앤 게 아니라 어긋나는지 지켜보는 것이다. */
  const handlesOv = (s) => /_rate_overrides/.test(s) || /api\/rates/.test(s);
  const liars = tools.filter((f) => {
    const s = srcOf(f);
    return /오버라이드\s*반영|운영\s*오버라이드/.test(s) && !handlesOv(s);
  });
  ok('② 「오버라이드 반영」이라 적은 파일은 실제로 그 일을 한다', liars.length === 0,
    liars.join(' · '));
}

console.log('\n[3] 운영값을 계획보다 먼저 얹는다');
{
  const s = srcOf('sim_rate_change.js');
  const iOv = s.indexOf('applyOverrides(window.__DR');
  const iPlan = s.indexOf('applyPlan(window.__DR');
  ok('③ sim_rate_change: 오버라이드 → 계획 순서다', iOv > 0 && iPlan > 0 && iOv < iPlan,
    'ov=' + iOv + ' plan=' + iPlan);
}

console.log('\n[4] 못 받으면 조용히 넘어가지 않는다');
{
  /* 일부러 죽은 주소를 물려 잡히는지 본다 — 만들어만 두고 안 도는 안전망을 막는다 */
  const savedUrl = process.env.BIZPAGE_RATES_URL;
  const savedCache = path.join(ROOT, '.rate_overrides_cache.json');
  const hadCache = fs.existsSync(savedCache);
  const backup = hadCache ? fs.readFileSync(savedCache, 'utf8') : null;
  if (hadCache) fs.unlinkSync(savedCache);            /* 캐시가 있으면 네트워크를 안 탄다 */
  process.env.BIZPAGE_RATES_URL = 'http://127.0.0.1:9/none';
  /* loadOverrides는 모듈 로드 시점에 URL을 읽으므로 캐시를 비우고 다시 require 한다 */
  delete require.cache[require.resolve(path.join(AI, '_rate_overrides.js'))];
  const fresh = require(path.join(AI, '_rate_overrides.js'));
  fresh.loadOverrides({ fresh: true }).then((r) => {
    ok('④ 못 받으면 그 사실을 문자열로 말한다', /❌|못 받음/.test(r.from), r.from);
    ok('④ 그리고 기본값으로 잰다는 것까지 밝힌다', /기본값/.test(r.from), r.from);
    if (hadCache) fs.writeFileSync(savedCache, backup, 'utf8');
    if (savedUrl === undefined) delete process.env.BIZPAGE_RATES_URL;
    else process.env.BIZPAGE_RATES_URL = savedUrl;
    finish();
  });
}

function finish() {
  console.log('\n[5] 얹는 방식은 script.js와 같다 — 숫자 칸만, 있는 칸만');
  {
    const rows = [{ destination_key: '푸꾸옥', fuel_surcharge: 280000, meal_per_person: 15000 }];
    const n = applyOverrides(rows, {
      푸꾸옥: { fuel_surcharge: 113000, rateDate: '2026-08', 없는칸: 1 },
      없는목적지: { fuel_surcharge: 1 },
    });
    ok('⑤ 숫자 칸만 얹는다 (rateDate 같은 칸은 세지 않는다)', n === 1, '얹힌 칸=' + n);
    ok('⑤ 값이 실제로 바뀐다', rows[0].fuel_surcharge === 113000, String(rows[0].fuel_surcharge));
    ok('⑤ 요율표에 없는 칸은 만들지 않는다', !('없는칸' in rows[0]));
    ok('⑤ 안 건드린 칸은 그대로다', rows[0].meal_per_person === 15000);
  }

  console.log('\n[6] 오버라이드를 얹는 구현이 두 벌이다 — 어긋나는지 대조한다');
  {
    /* `live_rates.applyLiveRates`(감사기용, 동기 curl)와 `_rate_overrides.applyOverrides`
       (측정 도구용, async+캐시)가 같은 일을 한다. **합치지 않았다** — 하나는 원본을
       그대로 두고 커스텀 목적지까지 병합하고, 다른 하나는 제자리에서 숫자만 얹는다.
       설계가 다르므로 합치려면 판단이 필요하고, 그건 조용히 할 일이 아니다(UZ와 같은 자리).
       → 합치지 못하면 **대조라도 한다.** 이 저장소의 규칙 그대로다. */
    const { applyLiveRates } = require(path.join(AI, 'live_rates.js'));
    const base = () => [{ destination_key: '푸꾸옥', fuel_surcharge: 280000, meal_per_person: 15000 }];
    const ovs = { 푸꾸옥: { fuel_surcharge: 113000, meal_per_person: 58037 } };

    const a = base(); applyOverrides(a, ovs);
    const b = applyLiveRates(base(), { overrides: ovs }).rates;
    ok('⑥ 두 구현이 같은 값을 낸다',
      a[0].fuel_surcharge === b[0].fuel_surcharge && a[0].meal_per_person === b[0].meal_per_person,
      JSON.stringify({ a: a[0], b: b[0] }));

    /* ⚠ **알려진 차이 하나를 여기 못 박는다.** `_rate_overrides`는 커스텀 목적지를
       안 본다 — 관리자가 목적지를 추가하면 측정 도구는 그 목적지를 통째로 못 잰다.
       2026-08-20 운영 확인 시점에 커스텀 목적지는 **0건**이라 아직 아무 데도 안 물렸다.
       생기는 날 이 테스트가 「알고 있던 차이」로 먼저 말하게 하려고 남긴다. */
    const withCustom = applyLiveRates(base(), {
      overrides: {}, customDestinations: [{ destination_key: '신규지', airfare: 1 }],
    }).rates;
    const plain = base(); applyOverrides(plain, {});
    ok('⑥ live_rates는 커스텀 목적지를 편입한다', withCustom.length === 2);
    ok('⑥ _rate_overrides는 편입하지 않는다 (알려진 차이)', plain.length === 1);
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

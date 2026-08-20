/* ═══════════════════════════════════════════════════════════════════════════
   원가 하한 감사 (TS) — **우리 원가보다 싸게 견적이 나가면 안 된다**
   ───────────────────────────────────────────────────────────────────────────
   사장님 2026-08-13: 「우리는 마진을 우리 원가 견적 테이블보다 낮출 수는 없어.」

   이건 정확도 목표(±5%)와 **성격이 다른 제약**이다. 오차는 양쪽으로 벌어져도 평균이
   맞으면 되지만, **원가 아래는 한 건이라도 나가면 그 건은 팔수록 손해**다.
   그래서 「중앙값이 좋아졌다」로 덮을 수 없고, **건수로** 봐야 한다.

   재는 법 — 하나투어 원가 시트에는 두 숫자가 나란히 찍힌다:
       입금가 1,347,276 (우리가 내는 돈)   판매가 1,490,000 (권장 고객가)
   `depositPerPerson`(입금가)을 정답지로 삼아 엔진 1인당과 견준다. 엔진이 낮으면 위반이다.

   ⚠ **엔진에는 이미 마진·수익이 들어 있다.** 그런데도 원가보다 낮다는 것은
     요율 단가가 실제 원가보다 낮게 잡혀 있다는 뜻이다 — 마진을 올려서 덮을 문제가
     아니라 **그 목적지의 요율이 틀린 것**이다.
   ⚠ **운영 요율을 얹고 잰다**(TR). data.js 기본값으로 재면 고객이 겪는 값이 아니다.
   ⚠ 코퍼스는 저장소 밖이라 **없을 수 있다.** 없으면 건너뛴다(실패로 만들지 않는다).

   ⚠ **허용 건수를 위로만 고치지 말 것.** 이 수는 「지금 알고 있는 위반」이고, 줄이는
     것이 일이다. 늘려야 할 이유가 생기면 **왜 늘었는지 세어 보고** 고친다(TF와 같은 규칙).

   실행: node ai-loop/audit_cost_floor.js
         → 위반이 허용 건수를 넘으면 **exit 1**
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./_corpus_files.js');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CORPUS = process.env.BIZPAGE_CORPUS
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const { destFromName } = require('./_dest_from_name');

/* 지금 알고 있는 위반 건수. **줄이는 것이 일이다.** 2026-08-13 기준 3건:
     오키나와(바모스 48명) -26.4% · 삿포로 135명 -9.0% x2

   여기까지 밝혀진 것 — **셋 다 요율 단가 문제가 아니다:**
   · 미야코지 -30.4%는 **없어졌다.** 다른 섬을 오키나와 요율로 재고 있었다
     (`_dest_from_name`에서 별칭을 뺐다). 오키나와 요율 자체는 실측과 거의 일치한다.
   · 삿포로는 TQ에서 요율을 실측에 **정확히 맞췄는데도** 원가에 못 미친다 —
     SD가 찾아낸 「우리가 읽은 항목을 다 더해도 1인 385,935원(25%)이 설명되지 않는다」가
     그대로 남아 있다는 뜻이다. 요율을 더 올려서 덮으면 **틀린 칸을 올리는 것**이 된다.
   · 오키나와 바모스는 관광조 48명·골프조 20명이 한 문서에 있다. 문서의 입금가가 어느
     인원 기준인지가 우리 48명 계산과 다를 수 있다 — 비교 자체를 먼저 봐야 한다.

   ⚠ **허용 건수를 위로만 고치지 말 것.** 늘려야 할 이유가 생기면 **왜 늘었는지 세어 보고**
     고친다(TF와 같은 규칙). 줄었으면 곧바로 낮춰 되돌아가지 못하게 한다. */
const ALLOWED = 3;

const won = (n) => Number(Math.round(n)).toLocaleString();

async function bootEngine() {
  const { loadOverrides, applyOverrides } = require('./_rate_overrides');
  const ov = await loadOverrides();
  const EXPOSE = '\n;try{window.__DR=destinationRates;}catch(e){}';
  const APP = read('data.js') + '\n' + read('company-info.js') + '\n'
    + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});     /* 운영 site_events에 행을 쌓지 않는다 */
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const { window } = dom;
  try { window.eval(APP); } catch (e) { console.log('[eval warn] ' + e.message); }
  await new Promise((r) => setTimeout(r, 150));
  if (typeof window.getBreakdownData !== 'function') throw new Error('엔진 로드 실패');
  const applied = applyOverrides(window.__DR, ov.overrides);
  console.log('요율 오버라이드 ' + applied + '칸 적용 — ' + ov.from + '\n');
  const doc = window.document;
  return (o) => {
    doc.getElementById('destination').value = o.dest;
    doc.getElementById('participants').value = String(o.pax);
    doc.getElementById('days').value = String(o.days);
    doc.getElementById('startDate').value = o.date;
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
      const e = doc.getElementById(id); if (e) e.checked = true;
    });
    return window.getBreakdownData();
  };
}

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('(견적서 코퍼스가 없어 원가 하한 검사를 건너뜁니다: ' + CORPUS + ')');
    process.exit(0);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = corpusFiles(CORPUS).files;
  console.log('견적서 ' + files.length + '건에서 **입금가가 적힌 원가 시트**를 골라 잰다… (2~4분)');

  const engine = await bootEngine();
  const rows = [], skipped = {};
  for (const f of files) {
    let r;
    try { r = await X.extractQuote(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse, {}); }
    catch (e) { continue; }
    const dn = destFromName(f);
    const pax = r.pax, days = r.dates && r.dates.days, date = r.dates && r.dates.departDate;
    const cost = r.depositPerPerson || null;
    const why = !cost ? '입금가(원가)가 없는 문서' : !dn.key ? (dn.why || '목적지')
      : !pax ? '인원 불명' : !(days >= 2) ? '일수 불명' : !date ? '출발일 불명' : null;
    if (why) { skipped[why] = (skipped[why] || 0) + 1; continue; }
    let bd;
    try { bd = engine({ dest: dn.key, pax, days, date }); } catch (e) { continue; }
    if (!bd || !bd.perPerson) continue;
    rows.push({
      file: f, dest: dn.key, pax, days, cost, engine: bd.perPerson,
      gap: (bd.perPerson - cost) / cost,
      lossPer: cost - bd.perPerson,
    });
  }

  const bad = rows.filter((r) => r.gap < 0).sort((a, b) => a.gap - b.gap);
  console.log('\n원가가 적힌 견적서 ' + rows.length + '건을 쟀다.');
  console.log('🔴 **원가보다 싸게 나가는 건: ' + bad.length + '건**');
  bad.forEach((b) => {
    console.log('   ' + b.dest.padEnd(8) + '원가 ' + won(b.cost).padStart(11)
      + ' → 엔진 ' + won(b.engine).padStart(11)
      + '   ' + (b.gap * 100).toFixed(1) + '%'
      + '   1인 ' + won(b.lossPer) + '원 손해 · ' + b.pax + '명이면 '
      + won(b.lossPer * b.pax) + '원   ' + b.file.slice(0, 40));
  });

  const okRows = rows.filter((r) => r.gap >= 0).sort((a, b) => a.gap - b.gap);
  console.log('\n   ── 원가 위지만 여유가 얇은 순 ──');
  okRows.slice(0, 5).forEach((b) => {
    console.log('   ' + b.dest.padEnd(8) + '원가 ' + won(b.cost).padStart(11)
      + ' → 엔진 ' + won(b.engine).padStart(11) + '   +' + (b.gap * 100).toFixed(1) + '%   '
      + b.file.slice(0, 40));
  });
  console.log('\n제외: ' + Object.entries(skipped).map(([k, v]) => k + ' ' + v + '건').join(' · '));

  if (bad.length > ALLOWED) {
    console.log('\n❌ 원가 아래 건수가 허용치(' + ALLOWED + ')를 넘었다 — **팔수록 손해인 견적이 늘었다.**');
    console.log('   요율을 만졌다면 그 변경을 다시 볼 것. 허용치를 올려서 덮지 말 것.');
    process.exit(1);
  }
  console.log('\n✅ 원가 아래 ' + bad.length + '건 (허용 ' + ALLOWED + ') — 늘지 않았다.');
  if (bad.length < ALLOWED) console.log('   ⚠ 줄었다. `ALLOWED`를 ' + bad.length + '로 낮춰 되돌아가지 못하게 할 것.');
})();

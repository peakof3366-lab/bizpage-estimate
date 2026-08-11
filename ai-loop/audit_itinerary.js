/* ═══════════════════════════════════════════════════════════════════════════
   일정표 추출 감사 (SS) — **견적서에서 일정표를 얼마나 읽어냈는가**
   ───────────────────────────────────────────────────────────────────────────
   트랙 B(일정표 자동 생성)의 자다. 금액 쪽 감사기들과 재는 것이 완전히 다르다 —
   여기서 무엇을 읽든 **고객이 보는 금액은 안 바뀐다.**

   재는 것 넷:
     ① 일정표를 찾은 문서 수            → L7이 아예 못 여는 문서가 어느 것인가
     ② 읽은 날 수 vs 문서의 일수(L4b)   → 며칠짜리인데 몇 날을 읽었나
     ③ 시간대를 나눈 날 / 못 나눈 날    → 담당자가 손볼 양이 얼마나 되나
     ④ 식사·호텔·날짜를 채운 비율      → 옮겨 적을 때 실제로 쓸 수 있는 칸인가

   ⚠ **100%가 목표가 아니다.** 요약형 견적서에는 일정표가 아예 없다(그런 문서를
     "실패"로 세면 숫자가 거짓말을 한다). 그래서 **일정표가 있는데 못 읽은 것**과
     **애초에 없는 것**을 갈라서 센다.
   ⚠ 코퍼스 PDF는 저장소에 넣지 않는다 — 참가자 실명·거래처 단가가 들어 있다.

   실행:
     node ai-loop/audit_itinerary.js
     node ai-loop/audit_itinerary.js --json out.json      (전/후 대조용)
     node ai-loop/audit_itinerary.js --show "북해도"       (그 문서의 읽은 결과를 눈으로)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CORPUS = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const showAt = argv.indexOf('--show');
const JSON_OUT = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const SHOW = showAt >= 0 ? argv[showAt + 1] : null;
const CORPUS = argv.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1 && i !== showAt + 1)[0]
  || process.env.BIZPAGE_CORPUS || DEFAULT_CORPUS;

/* 문서에 일정표가 **있어 보이는가** — 못 읽은 것과 없는 것을 가르는 데만 쓴다.
   ⚠ 이 판단은 L7과 독립이어야 한다. 같은 규칙으로 재면 "내가 읽은 것만 있다고 본다"가
     되어 감사기가 언제나 100%를 말한다(결함 생성기 ③ — 실행된 적 없는 안전망). */
const LOOKS_LIKE_ITIN = /(?:^|\s)(?:제\s*0?\d{1,2}\s*일|0?\d{1,2}\s*일\s*차|DAY\s*0?\d{1,2})(?:\s|$)/i;
const LOOKS_PRICED = /[¥₩$€£]|\d{1,3}(?:,\d{3}){2,}|\d{2,3},\d{3}/;
/* 🟠 아직 지원하지 않는 양식 — 일자 칸이 「1일」이고 **세로 병합**되어 칸의 가운데에
   글자가 떨어진다(EnBT 제주개발공사). 표기를 받아들이는 것만으로는 안 된다:
   표기가 그 날의 첫 줄이 아니라 **가운데**에 있어서, 「표기부터 다음 표기까지」로 담으면
   뒷날의 줄이 앞날에 섞인다. 조용히 빼지 않고 몇 건인지 항상 밝힌다. */
const BARE_DAY_CELL = /^\d{1,2}\s*일$/;

(async () => {
  if (!fs.existsSync(CORPUS)) {
    console.log('코퍼스 폴더가 없습니다: ' + CORPUS);
    process.exit(1);
  }
  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));
  const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()
    .filter((f) => !SHOW || f.includes(SHOW));
  console.log('견적서 ' + files.length + '건 추출 중… (1~3분)\n');

  const rows = [];
  const errors = [];

  for (const f of files) {
    let r;
    try {
      const raw = fs.readFileSync(path.join(CORPUS, f));
      r = await X.extractQuote(new Uint8Array(raw), pdfParse, {});
    } catch (e) { errors.push([f, e.message]); continue; }

    const lay = await X.readLayout(new Uint8Array(fs.readFileSync(path.join(CORPUS, f))), pdfParse);
    /* 일정표처럼 보이는 줄이 **일자 표기만으로** 몇 줄인가 — L7과 무관한 잣대.
       ⚠ **금액이 붙은 줄은 빼야 한다.** 단가표에도 「2일차 중식 ¥2,300 …」이 있어서,
         안 빼면 일정표가 아예 없는 문서(후아힌)가 🔴 「있어 보이는데 못 읽음」으로
         올라온다. 자가 거짓말을 하면 고칠 자리를 잘못 짚게 된다. */
    const hint = lay.lines.filter((l) => LOOKS_LIKE_ITIN.test(l.text) && !LOOKS_PRICED.test(l.text)).length;
    /* 「1일」꼴 일자 칸이 세로로 여럿 늘어서 있는가 — 미지원 양식을 세는 잣대 */
    const bareDay = lay.lines.filter((l) => l.cells.some((c) => BARE_DAY_CELL.test(String(c.s).trim()))
      && !LOOKS_PRICED.test(l.text)).length;

    const it = r.itinerary;
    const docDays = r.dates && r.dates.days ? r.dates.days : null;
    const row = {
      file: f,
      hint, bareDay,
      found: !!it,
      days: it ? it.days.length : 0,
      docDays,
      via: it ? it.columnsVia : null,
      repeated: it ? !!it.repeated : false,
      unsplit: it ? it.unsplitDays : 0,
      withText: it ? it.days.filter((d) => d.lines.length).length : 0,
      withMeal: it ? it.days.filter((d) => d.meals.b || d.meals.l || d.meals.d).length : 0,
      withHotel: it ? it.days.filter((d) => d.hotel).length : 0,
      withDate: it ? it.days.filter((d) => d.date).length : 0,
      textLines: it ? it.days.reduce((s, d) => s + d.lines.length, 0) : 0,
    };
    rows.push(row);

    if (SHOW && it) {
      console.log('=== ' + f);
      console.log('    열: 일자 x=' + it.dayX + ' 내용 x=' + it.contentX + ' 식사 x=' + it.mealX
        + ' (' + it.columnsVia + ')' + (it.repeated ? '  ⚠ 일정표가 두 벌' : ''));
      it.days.forEach((d) => {
        console.log('  ── DAY ' + d.day + (d.date ? '  ' + d.date : '') + '   [' + d.split + ']');
        if (d.am) console.log('     오전 ' + d.am);
        if (d.pm) console.log('     오후 ' + d.pm);
        if (d.eve) console.log('     저녁 ' + d.eve);
        if (d.split === 'none') d.lines.forEach((t) => console.log('     · ' + t));
        const m = [d.meals.b && '조:' + d.meals.b, d.meals.l && '중:' + d.meals.l, d.meals.d && '석:' + d.meals.d].filter(Boolean);
        if (m.length) console.log('     식사 ' + m.join(' / '));
        if (d.hotel) console.log('     숙박 ' + d.hotel);
      });
      console.log('');
    }
  }

  if (SHOW) { if (errors.length) console.log('오류: ' + errors.map((e) => e[0]).join(', ')); return; }

  const found = rows.filter((r) => r.found);
  /* 🟠 미지원 양식(세로 병합된 「1일」 칸)을 **먼저** 갈라낸다 — 못 읽은 이유가 달라서
     같은 통에 넣으면 "규칙을 늘리면 풀린다"고 잘못 읽게 된다. */
  const merged = rows.filter((r) => !r.found && r.bareDay >= 2);
  const missed = rows.filter((r) => !r.found && r.bareDay < 2 && r.hint >= 2);
  const absent = rows.filter((r) => !r.found && r.bareDay < 2 && r.hint < 2);

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
  console.log('══ 일정표 추출 (견적서 ' + rows.length + '건) ══════════════════════════════');
  console.log('  일정표를 읽은 문서      ' + found.length + '건  (' + pct(found.length, rows.length) + ')');
  console.log('  일정표가 있어 보이는데 못 읽음  ' + missed.length + '건   ← 여기가 고칠 자리다');
  console.log('  🟠 미지원 양식(일자 칸 세로 병합) ' + merged.length + '건'
    + (merged.length ? '  ' + merged.map((r) => r.file.slice(0, 28)).join(', ') : ''));
  console.log('  일정표가 없는 문서      ' + absent.length + '건  (요약형 견적서 등)');
  if (errors.length) console.log('  추출 오류               ' + errors.length + '건');

  const totalDays = found.reduce((s, r) => s + r.days, 0);
  const totalUnsplit = found.reduce((s, r) => s + r.unsplit, 0);
  console.log('\n  읽은 날 합계            ' + totalDays + '일');
  console.log('  시간대를 나눈 날        ' + (totalDays - totalUnsplit) + '일  (' + pct(totalDays - totalUnsplit, totalDays) + ')');
  console.log('  못 나눈 날              ' + totalUnsplit + '일   ← 담당자가 끌어다 놓아야 하는 양');
  const sum = (k) => found.reduce((s, r) => s + r[k], 0);
  console.log('  식사가 붙은 날          ' + sum('withMeal') + '일  (' + pct(sum('withMeal'), totalDays) + ')');
  console.log('  숙박이 붙은 날          ' + sum('withHotel') + '일  (' + pct(sum('withHotel'), totalDays) + ')');
  console.log('  날짜가 붙은 날          ' + sum('withDate') + '일  (' + pct(sum('withDate'), totalDays) + ')');
  console.log('  머리글로 열을 찾은 문서  ' + found.filter((r) => r.via === 'header').length + '건 / 나머지는 글자 분포로');

  /* 문서 일수와 어긋나는 것 — 며칠짜리인지는 L4b가 따로 읽는다(독립된 잣대다) */
  const mismatch = found.filter((r) => r.docDays && Math.abs(r.days - r.docDays) >= 1)
    .sort((a, b) => Math.abs(b.days - b.docDays) - Math.abs(a.days - a.docDays));
  console.log('\n  문서 일수와 어긋난 건    ' + mismatch.length + '건'
    + (mismatch.length ? '   ← 덜 읽었거나 더 읽었다' : ''));
  mismatch.slice(0, 12).forEach((r) => {
    console.log('    ' + (r.days > r.docDays ? '＋' : '－') + ' ' + r.file.slice(0, 44).padEnd(46)
      + '읽음 ' + r.days + '일 / 문서 ' + r.docDays + '일' + (r.repeated ? '  (일정표 두 벌)' : ''));
  });

  if (missed.length) {
    console.log('\n  🔴 있어 보이는데 못 읽은 문서');
    missed.sort((a, b) => b.hint - a.hint).forEach((r) => {
      console.log('    ' + r.file.slice(0, 50).padEnd(52) + '일자 표기 ' + r.hint + '줄');
    });
  }
  const bare = found.filter((r) => r.unsplit === r.days);
  if (bare.length) {
    console.log('\n  🟡 시간대를 한 날도 못 나눈 문서 ' + bare.length + '건 (문서에 시각·끼니 구분이 없다)');
    bare.slice(0, 10).forEach((r) => console.log('    ' + r.file.slice(0, 50).padEnd(52) + r.days + '일'));
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ rows, errors }, null, 2), 'utf8');
    console.log('\n  → ' + JSON_OUT);
  }
})();

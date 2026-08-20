/* 견적서 모음 → 목적지 공통 코스 심기 (UL). **기본은 dry-run이다.**

   왜 —
   요율표는 55곳인데 담당자가 공통 일정에 손댄 곳은 **4곳뿐**이다(2026-08-18 실사:
   도쿄·삿포로·싱가포르·오키나와. 상해는 방식 A/B만). 55곳을 사람이 채우는 건
   끝나지 않는 숙제라 실제로 4곳에서 멈춰 있었다.

   그런데 견적서 모음 46건 중 **41건에 실제 일정표가 들어 있다.** 서랍 안에 이미
   있는 것을 꺼내 쓰지 않고 손으로 채우려 한 것이 문제였다.

   이 도구는 그 41건을 읽어 **목적지 공통 코스**로 심는다. 그러면 작성자는 견적서
   편집기의 「출발점 가져오기」에서 그것을 꺼내 이 고객에 맞게 고치면 된다.

   ⚠ **심으면 고객이 보는 것이 바뀐다.** 그 목적지에 견적서 일정이 하나라도 있으면
     고객은 **그것만** 본다(recPreferQuoteCourses · TC). 온라인 코스는 지워지지 않고
     화면에만 안 나온다. 대표 방침과 같은 방향이지만(2026-08-11: 「온라인에서 가져온
     추천 일정표는 사용이 불가능한 경우가 많다」), 한꺼번에 여러 곳이 바뀌는 일이라
     **--apply 없이는 아무것도 쓰지 않는다.**
   ⚠ 목적지 판정을 여기서 새로 짓지 않는다. `.corpus_db.json`이 이미 파일마다
     목적지를 적어 두었고(build_corpus_db.js의 guessDest), 그것이 46건 표의 기준이다.
     여기서 다시 추측하면 코퍼스 표와 어긋난다(결함 생성기 ①).
   ⚠ 변환도 새로 짓지 않는다. 화면(관리자 → 견적서 업데이트 → 일정 관리로 보내기)이
     쓰는 것과 **같은 함수**를 부른다 — rec_fallbacks.js의 recItinToCourse.

   실행:
     node ai-loop/seed_courses_from_corpus.js            # dry-run (아무것도 안 쓴다)
     node ai-loop/seed_courses_from_corpus.js --apply    # 운영 DB에 심는다
     node ai-loop/seed_courses_from_corpus.js --only=다낭
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { recItinToCourse } = require(path.join(ROOT, 'rec_fallbacks.js'));
const { MAX_COURSES, MAX_DAYS } = require(path.join(ROOT, 'limits.js'));
/* US: 기본 코스(data.js)도 본다 — 검토 전 코스는 기본값을 밀어내지 않고 그 위에
   얹히므로(recApplyOverride), 기본 개수를 안 세면 코스 상한을 넘겨 심게 된다. */
const { ITINERARY_DB } = require(path.join(ROOT, 'data.js'));

/* VA: **이미 창고에 있는 것과 내용이 같은 코스는 다시 심지 않는다.**

   실측으로 운영 DB에 두 벌이 들어가 있었다:
     · 삿포로 [3,4] — 같은 PDF가 코퍼스에 두 벌 있었다(`… (1).pdf`). 그건 `_corpus_files.js`가 막는다.
     · 오키나와 [2,3] — **이쪽이 진짜 결함이다.** 아래 `skip`은 「이미 견적서 일정이 있나」를
       `source === 'quote'`로 판정하는데, 담당자가 검토해 저장하면 그 표시가 사라진다.
       그러면 도구는 그 코스를 못 알아보고 **같은 것을 또 심는다** — 담당자가 검토할수록
       중복이 늘어나는, 돌릴 때마다 쌓이는 구조였다.

   ⚠ 판정은 **날짜 칸의 내용**이다. 제목·source·pending은 검토하면서 바뀌므로 뺀다.
   ⚠ 그리고 내용이 조금이라도 다르면 **둘 다 남긴다** — 차수별·인원별로 일정이 미세하게
     다른 견적서가 흔하고, 그건 지우면 안 되는 진짜 재고다(`_corpus_files.js`와 같은 원칙). */
function courseBody(c) {
  const days = (c && Array.isArray(c.days)) ? c.days : [];
  return JSON.stringify(days.map((d) => [d && d.title, d && d.am, d && d.pm, d && d.eve, d && d.tip]));
}

/* 후보 중 **아직 창고에 없는 것**만 고른다. 판정을 여기 한 곳에 두어야 테스트할 수 있다 —
   `_guess_dest.js`를 떼어낸 이유와 같다(안에 묻혀 있으면 검사할 수 없다).
   @param {object[]} cur   지금 그 목적지에 있는 코스 (검토 완료·검토 전 전부)
   @param {{course: object}[]} list 심으려는 후보
   @returns {{fresh: object[], already: object[]}} */
function pickFresh(cur, list) {
  const known = new Set((cur || []).map(courseBody));
  const already = [], fresh = [];
  for (const cand of (list || [])) {
    const body = courseBody(cand.course);
    if (known.has(body)) { already.push(cand); continue; }
    known.add(body);          /* 후보끼리 겹치는 것도 하나만 남긴다 */
    fresh.push(cand);
  }
  return { fresh, already };
}

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const CORPUS_DB = path.join(ROOT, '.corpus_db.json');
const PDF_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');

async function main() {
  if (!fs.existsSync(CORPUS_DB)) {
    console.log('.corpus_db.json이 없습니다. 먼저 `node ai-loop/build_corpus_db.js`를 돌리세요.');
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(CORPUS_DB, 'utf8'));

  /* 일정표가 있고 목적지를 아는 것만. 목적지를 모르는 건은 **버리지 않고 세어서
     알린다** — 조용히 빠지면 "왜 이 견적서는 안 심겼지"에 답할 수 없다. */
  const targets = rows.filter((r) => Number(r.itineraryDays) > 0 && r.destination);
  const noDest = rows.filter((r) => Number(r.itineraryDays) > 0 && !r.destination);
  const noItin = rows.filter((r) => !(Number(r.itineraryDays) > 0));

  console.log('견적서 ' + rows.length + '건 중 — 일정표 있음 ' + (targets.length + noDest.length)
    + ' · 그중 목적지 아는 것 ' + targets.length
    + ' / 목적지 모름 ' + noDest.length + ' · 일정표 없음 ' + noItin.length);
  if (noDest.length) console.log('  ⚠ 목적지를 못 읽어 제외: ' + noDest.map((r) => r.file).join(', '));
  console.log('');

  const pdfParse = require('pdf-parse');
  const X = require(path.join(ROOT, 'api', '_lib', 'pdf_extract.js'));

  /* 운영 DB의 현재 상태 — 무엇을 덮어쓰게 되는지 알아야 판단할 수 있다. */
  let existing = {};
  try {
    require('./_load_env')();
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const ov = await sql`select dest_key, courses from itinerary_overrides`;
    ov.forEach((r) => { existing[r.dest_key] = Array.isArray(r.courses) ? r.courses : null; });
  } catch (e) {
    /* 조용히 넘어가지 않는다 — 현재 상태를 모르면 "덮어쓰지 않는다"고 말할 수 없다. */
    console.log('⚠ 운영 DB 현재 상태를 못 읽었습니다: ' + String(e.message).slice(0, 80));
    console.log('  이 상태에서는 --apply를 쓰지 마세요(무엇을 덮는지 알 수 없습니다).\n');
    existing = null;
  }

  const byDest = {};
  const failed = [];
  for (const r of targets) {
    if (ONLY && r.destination.indexOf(ONLY) < 0) continue;
    const file = path.join(PDF_DIR, r.file);
    if (!fs.existsSync(file)) { failed.push(r.file + ' (파일 없음)'); continue; }
    let ex;
    try {
      ex = await X.extractQuote(new Uint8Array(fs.readFileSync(file)), pdfParse, {});
    } catch (e) { failed.push(r.file + ' (' + String(e.message).slice(0, 50) + ')'); continue; }

    const itin = ex && ex.itinerary;
    if (!itin || !Array.isArray(itin.days) || !itin.days.length) {
      /* 코퍼스 표는 일정표가 있다는데 지금 다시 읽으니 없다 = 추출기가 그 사이 바뀌었다. */
      failed.push(r.file + ' (다시 읽으니 일정표가 없다 — 코퍼스 표와 어긋남)');
      continue;
    }
    if (itin.days.length > MAX_DAYS) { failed.push(r.file + ' (' + itin.days.length + '일 — 상한 ' + MAX_DAYS + ' 초과)'); continue; }

    const course = recItinToCourse(itin, r.destination);
    /* UQ (2026-08-19): 일괄로 심는 코스는 **검토 전**으로 들어간다.
       이 표시가 있는 동안 그 코스는 창고에만 있고 고객에게 자동으로 안 나간다.
       ⚠ 이게 없으면 심는 순간 19곳의 고객 화면이 다듬기 전 상태로 바뀐다 —
         문서에 시간대 구분이 없어 오후·저녁이 빈 일정표가 여럿 나온다.
         담당자가 관리자 → 일정 관리에서 「검토 완료」를 눌러야 나가기 시작한다. */
    course.pending = true;
    /* 문서에 시간대 구분이 없어 오전 칸에 모아 둔 날이 몇 개인가 — 사람이 나눠야 한다. */
    const unsplit = itin.days.filter((d) => !(d.split === 'time' || d.split === 'meal')).length;
    (byDest[r.destination] = byDest[r.destination] || []).push({
      file: r.file, days: itin.days.length, unsplit, course,
    });
  }

  const dests = Object.keys(byDest).sort();
  console.log('심을 수 있는 목적지 ' + dests.length + '곳\n');
  console.log('목적지        견적서  일수        지금 상태            심은 뒤');
  console.log('─'.repeat(78));

  let willChange = 0, willSkip = 0;
  const plan = [];
  for (const d of dests) {
    const list = byDest[d].sort((a, b) => b.days - a.days).slice(0, MAX_COURSES);
    const cur = existing && existing[d];
    const curQuote = (cur || []).filter((c) => c && c.source === 'quote').length;
    const state = !cur ? '기본값(손 안 댐)'
      : (curQuote ? '견적서 일정 ' + curQuote + '개' : '담당자 수정본 ' + cur.length + '개');

    /* 이미 견적서 일정이 있는 곳은 건드리지 않는다 — 사람이 이미 검토한 것을
       자동으로 덮으면 그 판단이 조용히 사라진다(요율 자동 반영과 같은 원칙). */
    const skip = curQuote > 0;

    /* ⚠ **담당자가 손으로 만든 코스는 남긴다.** 예전 판(첫 dry-run)이 courses를
       통째로 갈아끼우게 돼 있어서, 도쿄·삿포로·오키나와의 수정본이 지워질 뻔했다
       — 이 저장소가 반복해서 겪은 「사람이 정한 값을 자동으로 덮는」 사고 그대로다.
       기존 것을 앞에 두고 견적서 코스를 **뒤에 덧붙인다.** 화면에는 TC 규칙에 따라
       견적서 코스만 나가지만, 온라인 코스는 남아 있어 되돌릴 수 있다. */
    const keep = (cur || []).filter((c) => c && c.source !== 'quote');

    /* VA: 이미 있는 코스(검토 완료·검토 전 가리지 않고 **전부**)와 내용이 같은 후보를 뺀다.
       뺀 것은 아래에서 말한다 — 조용히 버리면 「왜 이 견적서는 안 심겼지」에 답할 수 없다
       (결함 생성기 ②). */
    const { fresh, already } = pickFresh(cur, list);
    /* US: 자리를 셀 때 **화면에 실제로 올라올 개수**를 센다.
       오버라이드가 검토 전뿐이면 기본 코스가 그 앞에 얹혀 올라오므로(recApplyOverride),
       keep만 세면 상한을 넘겨 심는다. 그러면 담당자가 그 목적지를 저장하는 순간
       서버가 too_many_courses로 거절한다 — 심을 때는 조용하고 나중에 사람이 막힌다. */
    const baseCount = keep.length ? keep.length : ((ITINERARY_DB && ITINERARY_DB[d]) || []).length;
    const room = Math.max(0, MAX_COURSES - baseCount);
    const add = fresh.slice(0, room);
    const dropped = fresh.length - add.length;

    if (skip || !add.length) willSkip++;
    else { willChange++; plan.push({ dest: d, courses: keep.concat(add.map((x) => x.course)) }); }

    console.log(
      d.padEnd(13) + String(list.length).padStart(4) + '건'
      + ('  ' + list.map((x) => x.days + '일').join(',')).padEnd(14)
      + state.padEnd(21)
      + (skip ? '건드리지 않음(이미 견적서 일정)'
        : !add.length ? (already.length && !fresh.length
          ? '건드리지 않음(이미 같은 내용)' : '건드리지 않음(자리 없음)')
          : (keep.length ? '수정본 ' + keep.length + '개 유지 + '
            : (baseCount ? '기본 ' + baseCount + '개 유지 + ' : ''))
            + '검토 전 ' + add.length + '개 추가'));
    const uns = add.reduce((n, x) => n + x.unsplit, 0);
    if (!skip && uns) console.log('    ⚠ ' + uns + '일은 문서에 시간대 구분이 없어 오전 칸에 모여 있습니다 — 사람이 나눠야 합니다.');
    /* 잘라낸 것은 반드시 말한다 — 조용히 자르면 「다 심었다」로 읽힌다. */
    if (dropped) console.log('    ⚠ 코스 상한(' + MAX_COURSES + ')이라 ' + dropped + '건은 넣지 않았습니다: '
      + fresh.slice(room).map((x) => x.file).join(', '));
    if (already.length) console.log('    · 이미 창고에 같은 내용이 있어 건너뜀 ' + already.length + '건: '
      + already.map((x) => x.file).join(', '));
  }

  console.log('─'.repeat(78));
  console.log('바뀔 목적지 ' + willChange + '곳 · 건드리지 않을 곳 ' + willSkip + '곳');
  if (failed.length) {
    console.log('\n읽지 못한 견적서 ' + failed.length + '건:');
    failed.forEach((f) => console.log('  · ' + f));
  }

  /* UQ에서 바뀐 안내다. 예전엔 「심으면 고객 화면이 바뀐다」였는데, 이제 심는 코스에는
     검토 전 표시가 붙어 창고에만 들어간다. 문구를 안 고치면 도구가 자기 동작에 대해
     거짓말을 하고, 사장님은 안 바뀔 일을 걱정하며 승인을 미루게 된다. */
  console.log('\n✓ 심어도 **고객 화면은 바뀌지 않습니다.** 심는 코스에는 「검토 전」이 붙어');
  console.log('  창고(관리자 → 일정 관리)에만 들어갑니다. 담당자가 「검토 완료」를 누른');
  console.log('  코스부터 고객 견적서에 나가기 시작합니다.');
  console.log('  견적서별 일정의 「출발점 가져오기」에서는 검토 전에도 꺼내 쓸 수 있습니다.');
  console.log('  제목·요약·핵심 포인트는 비어 있습니다 — 지어내지 않았습니다.');

  if (!APPLY) {
    console.log('\n지금은 dry-run입니다. 아무것도 저장하지 않았습니다.');
    console.log('실제로 심으려면: node ai-loop/seed_courses_from_corpus.js --apply');
    return;
  }

  if (!existing) { console.log('\n운영 DB 현재 상태를 못 읽어 중단합니다.'); process.exit(1); }
  require('./_load_env')();
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  console.log('\n심는 중…');
  for (const p of plan) {
    const courses = p.courses;
    await sql`
      insert into itinerary_overrides (dest_key, courses, updated_at, updated_by)
      values (${p.dest}, ${JSON.stringify(courses)}::jsonb, now(), '견적서 일괄 심기(UL)')
      on conflict (dest_key) do update
        set courses = excluded.courses, updated_at = now(), updated_by = excluded.updated_by
    `;
    console.log('  ✓ ' + p.dest + ' — 코스 ' + courses.length + '개');
  }
  console.log('완료: ' + plan.length + '곳. 관리자 → 일정 관리에서 확인하세요.');
}

/* ⚠ 직접 실행할 때만 돈다 — 검사가 `pickFresh`를 부르려고 require하는 순간
   운영 DB에 심는 코드가 도는 일이 없어야 한다. */
module.exports = { courseBody, pickFresh };
if (require.main === module) main();

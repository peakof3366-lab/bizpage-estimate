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

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const CORPUS_DB = path.join(ROOT, '.corpus_db.json');
const PDF_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '견적서 모음');

(async () => {
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
    const room = Math.max(0, MAX_COURSES - keep.length);
    const add = list.slice(0, room);
    const dropped = list.length - add.length;

    if (skip || !add.length) willSkip++;
    else { willChange++; plan.push({ dest: d, courses: keep.concat(add.map((x) => x.course)) }); }

    console.log(
      d.padEnd(13) + String(list.length).padStart(4) + '건'
      + ('  ' + list.map((x) => x.days + '일').join(',')).padEnd(14)
      + state.padEnd(21)
      + (skip ? '건드리지 않음(이미 견적서 일정)'
        : !add.length ? '건드리지 않음(자리 없음)'
          : (keep.length ? '수정본 ' + keep.length + '개 유지 + ' : '') + '견적서 ' + add.length + '개 추가'));
    const uns = add.reduce((n, x) => n + x.unsplit, 0);
    if (!skip && uns) console.log('    ⚠ ' + uns + '일은 문서에 시간대 구분이 없어 오전 칸에 모여 있습니다 — 사람이 나눠야 합니다.');
    /* 잘라낸 것은 반드시 말한다 — 조용히 자르면 「다 심었다」로 읽힌다. */
    if (dropped) console.log('    ⚠ 코스 상한(' + MAX_COURSES + ')이라 ' + dropped + '건은 넣지 않았습니다: '
      + list.slice(room).map((x) => x.file).join(', '));
  }

  console.log('─'.repeat(78));
  console.log('바뀔 목적지 ' + willChange + '곳 · 건드리지 않을 곳 ' + willSkip + '곳');
  if (failed.length) {
    console.log('\n읽지 못한 견적서 ' + failed.length + '건:');
    failed.forEach((f) => console.log('  · ' + f));
  }

  console.log('\n⚠ 심으면 이 ' + willChange + '곳의 **고객 추천 일정이 견적서 일정으로 바뀝니다.**');
  console.log('  온라인 코스는 지워지지 않고 화면에만 안 나갑니다(되돌릴 수 있습니다).');
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
})();

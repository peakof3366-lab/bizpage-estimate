/* 일정표 엑셀 → 목적지 공통 코스 심기 (ZA). **기본은 dry-run이다.**

   `seed_courses_from_corpus.js`(견적서 PDF)와 **같은 일을 다른 표본에** 한다.
   2026-09-07 대표가 주신 `일정표 & 블랙다운` 폴더에 일정표가 들어 있다.

   ⚠ **판정도 변환도 새로 짓지 않는다.** 셋 다 이미 있는 것을 부른다:
     · 목적지 판정  `_dest_from_name.js`의 `destFromName`  (북해도→삿포로 같은 표가 거기 있다)
     · 코스 변환    `rec_fallbacks.js`의 `recItinToCourse`  (담당자 화면이 쓰는 그 함수)
     · 중복 판정    `seed_courses_from_corpus.js`의 `pickFresh` (VA에서 만든 그 규칙)
     여기서 다시 지으면 두 벌이 되고 반드시 어긋난다(결함 생성기 ①). 특히 중복 판정은
     **돌릴 때마다 쌓이던 결함**을 고친 자리라 절대 복사하면 안 된다.

   ⚠ 심는 코스에는 `pending`(검토 전)이 붙는다 — 창고에만 들어가고 **고객 화면은
     안 바뀐다.** 담당자가 「검토 완료」를 눌러야 나가기 시작한다(UQ와 같은 규칙).

   실행:
     node ai-loop/seed_courses_from_bd.js            # dry-run (아무것도 안 쓴다)
     node ai-loop/seed_courses_from_bd.js --apply    # 운영 DB에 심는다
     node ai-loop/seed_courses_from_bd.js --only=오사카
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { recItinToCourse } = require(path.join(ROOT, 'rec_fallbacks.js'));
const { MAX_COURSES, MAX_DAYS } = require(path.join(ROOT, 'limits.js'));
const { ITINERARY_DB } = require(path.join(ROOT, 'data.js'));
const { destFromName } = require('./_dest_from_name.js');
const { pickFresh, courseBody } = require('./seed_courses_from_corpus.js');
const { bdFiles } = require('./_bd_files.js');
const { itinFromFile } = require('./_bd_itin.js');

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

async function main() {
  const { files } = bdFiles(null, { quiet: true });

  /* 일정을 읽은 것 · 목적지를 아는 것을 **따로 센다.** 합쳐 세면 「왜 이 문서는
     안 심겼지」에 답할 수 없다(결함 생성기 ②). */
  const read = [], noItin = [], noDest = [], tooLong = [];
  for (const f of files) {
    const r = itinFromFile(f.abs);
    if (!r.ok) { noItin.push(f.rel); continue; }
    if (r.dayCount > MAX_DAYS) { tooLong.push(f.rel + ' (' + r.dayCount + '일 — 상한 ' + MAX_DAYS + ')'); continue; }
    /* 파일 이름으로 먼저 보고, 없으면 폴더 이름으로 본다. 둘 다 없으면 **비운다** —
       억지로 가까운 목적지에 붙이면 그 오차가 엔진 오차로 둔갑한다. */
    /* ⚠ `destFromName`은 **{key, why}**를 돌려준다. 그대로 쓰면 목적지 키가
       「[object Object]」가 되어 32건이 한 곳에 뭉친다(실제로 한 번 그랬다).
       그리고 `why`를 버리면 안 된다 — 「요율표에 없는 목적지」와 「여러 곳」은
       할 일이 정반대다(전자는 목적지를 만들어야 하고, 후자는 사람이 갈라야 한다). */
    const byFile = destFromName(path.basename(f.rel));
    const byFolder = byFile.key ? null : destFromName(String(f.folderHint || ''));
    const dest = byFile.key || (byFolder && byFolder.key);
    if (!dest) {
      noDest.push(f.rel + '  → ' + ((byFolder && byFolder.why) || byFile.why)
        + ' (폴더: ' + (f.folderHint || '?') + ')');
      continue;
    }
    read.push({ file: path.basename(f.rel), rel: f.rel, dest, r });
  }

  console.log('문서 ' + files.length + '개 — 일정을 읽은 것 ' + (read.length + noDest.length + tooLong.length)
    + ' · 그중 목적지 아는 것 ' + read.length + ' · 목적지 모름 ' + noDest.length
    + ' · 일정 없음 ' + noItin.length);
  if (noDest.length) {
    console.log('  ⚠ 목적지를 못 정해 제외 ' + noDest.length + '건 — **요율표에 없는 곳일 수 있습니다**:');
    noDest.forEach((x) => console.log('     · ' + x));
  }
  if (tooLong.length) tooLong.forEach((x) => console.log('  ⚠ 일수 상한 초과: ' + x));
  console.log('');

  /* 운영 DB의 현재 상태 — 무엇을 덮게 되는지 모르면 「안 덮는다」고 말할 수 없다. */
  let existing = {};
  try {
    require('./_load_env')();
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const ov = await sql`select dest_key, courses from itinerary_overrides`;
    ov.forEach((r) => { existing[r.dest_key] = Array.isArray(r.courses) ? r.courses : null; });
  } catch (e) {
    console.log('⚠ 운영 DB 현재 상태를 못 읽었습니다: ' + String(e.message).slice(0, 80));
    console.log('  이 상태에서는 --apply를 쓰지 마세요(무엇을 덮는지 알 수 없습니다).\n');
    existing = null;
  }

  const byDest = {};
  for (const x of read) {
    if (ONLY && x.dest.indexOf(ONLY) < 0) continue;
    const course = recItinToCourse(x.r.itin, x.dest, '일정표 엑셀에서 읽은 일정 (' + x.r.dayCount + '일) · ' + x.file);
    course.pending = true;                       /* 검토 전 — 창고에만 들어간다 */
    /* 문서가 시간대를 안 나눠 준 날이 몇 개인가. 사람이 나눠야 하므로 반드시 말한다. */
    const unsplit = x.r.dayCount - x.r.splitDays;
    (byDest[x.dest] = byDest[x.dest] || []).push({ file: x.file, days: x.r.dayCount, unsplit, course });
  }

  const dests = Object.keys(byDest).sort();
  console.log('심을 수 있는 목적지 ' + dests.length + '곳\n');
  console.log('목적지        문서  일수          지금 상태            심은 뒤');
  console.log('─'.repeat(84));

  let willChange = 0, willSkip = 0;
  const plan = [];
  for (const d of dests) {
    const list = byDest[d].sort((a, b) => b.days - a.days).slice(0, MAX_COURSES);
    const cur = existing && existing[d];
    const curQuote = (cur || []).filter((c) => c && c.source === 'quote').length;
    const state = !cur ? '기본값(손 안 댐)'
      : (curQuote ? '코스 ' + cur.length + '개(견적서 ' + curQuote + ')' : '담당자 수정본 ' + cur.length + '개');
    /* 🔴 **덮어쓰기가 아니라 덧붙이기다.** 견적서 PDF 쪽 도구는 이미 견적서 일정이 있는
       목적지를 통째로 건너뛰는데(더 새 것으로 갈아끼우는 도구라 그렇다), 여기서 그러면
       새 표본이 거의 아무것도 못 넣는다 — 실측: 8곳 중 7곳이 그 규칙에 걸려 멈췄다.
       이 도구는 **다른 출처를 보태는** 것이라 규칙이 다르다:
         · 있는 것은 견적서 일정이든 담당자 수정본이든 **하나도 안 지운다**
         · 남는 자리에만 넣는다(상한을 넘기지 않는다)
         · 내용이 같은 것은 `pickFresh`가 이미 거른다
       그래서 사람이 검토한 판단이 사라질 길이 없다. */
    const keep = (cur || []).slice();
    const skip = false;
    const { fresh, already } = pickFresh(cur, list);
    const baseCount = keep.length ? keep.length : ((ITINERARY_DB && ITINERARY_DB[d]) || []).length;
    const room = Math.max(0, MAX_COURSES - baseCount);
    const add = fresh.slice(0, room);
    const dropped = fresh.length - add.length;

    if (skip || !add.length) willSkip++;
    else { willChange++; plan.push({ dest: d, courses: keep.concat(add.map((x) => x.course)) }); }

    console.log(
      d.padEnd(13) + String(list.length).padStart(4) + '건'
      + ('  ' + list.map((x) => x.days + '일').join(',')).padEnd(16)
      + state.padEnd(21)
      + (!add.length ? (already.length && !fresh.length
          ? '건드리지 않음(이미 같은 내용)' : '건드리지 않음(자리 없음)')
          : (keep.length ? '기존 ' + keep.length + '개 유지 + '
            : (baseCount ? '기본 ' + baseCount + '개 유지 + ' : ''))
            + '검토 전 ' + add.length + '개 추가'));
    const uns = add.reduce((n, x) => n + x.unsplit, 0);
    if (!skip && uns) console.log('    ⚠ ' + uns + '일은 문서에 시각이 없어 오전 칸에 모여 있습니다 — 사람이 나눠야 합니다.');
    if (dropped) console.log('    ⚠ 코스 상한(' + MAX_COURSES + ')이라 ' + dropped + '건은 넣지 않았습니다: '
      + fresh.slice(room).map((x) => x.file).join(', '));
    if (already.length) console.log('    · 이미 창고에 같은 내용이 있어 건너뜀 ' + already.length + '건');
    /* 내용이 같아 안 넣은 코스라도 **출처 메모가 틀려 있으면 고친다.** 안 고치면
       화면이 「견적서 PDF에서 읽은 일정」이라고 계속 말한다(엑셀에서 읽었는데도).
       ⚠ 새로 넣을 것이 **있을 때도** 고쳐야 한다 — 「없을 때만」으로 걸어 두었더니
         오사카 4개가 옛 메모 그대로 남았다(같은 턴에 새것도 들어가고 있었기 때문). */
    if (already.length && cur) {
      const want = new Map(already.map((x) => [courseBody(x.course), x.course.sourceNote]));
      const target = plan.find((x) => x.dest === d);
      const base = target ? target.courses : cur.slice();
      let fixed = 0;
      const patched = base.map((c) => {
        const w = want.get(courseBody(c));
        if (!w || c.sourceNote === w) return c;
        fixed++; return Object.assign({}, c, { sourceNote: w });
      });
      if (fixed) {
        if (target) { target.courses = patched; target.noteOnly = fixed; }
        else { plan.push({ dest: d, courses: patched, noteOnly: fixed }); willChange++; willSkip--; }
      }
    }
  }

  console.log('─'.repeat(84));
  console.log('바뀔 목적지 ' + willChange + '곳 · 건드리지 않을 곳 ' + willSkip + '곳');

  console.log('\n✓ 심어도 **고객 화면은 바뀌지 않습니다.** 심는 코스에는 「검토 전」이 붙어');
  console.log('  창고(관리자 → 일정 관리)에만 들어갑니다. 담당자가 「검토 완료」를 누른');
  console.log('  코스부터 고객 견적서에 나가기 시작합니다.');
  console.log('  제목·요약·핵심 포인트는 비어 있습니다 — 지어내지 않았습니다.');

  if (!APPLY) {
    console.log('\n지금은 dry-run입니다. 아무것도 저장하지 않았습니다.');
    console.log('실제로 심으려면: node ai-loop/seed_courses_from_bd.js --apply');
    return;
  }
  if (!existing) { console.log('\n운영 DB 현재 상태를 못 읽어 중단합니다.'); process.exit(1); }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  console.log('\n심는 중…');
  for (const p of plan) {
    await sql`
      insert into itinerary_overrides (dest_key, courses, updated_at, updated_by)
      values (${p.dest}, ${JSON.stringify(p.courses)}::jsonb, now(), '일정표 엑셀 일괄 심기(ZA)')
      on conflict (dest_key) do update
        set courses = excluded.courses, updated_at = now(), updated_by = excluded.updated_by
    `;
    console.log('  ✓ ' + p.dest + ' — 코스 ' + p.courses.length + '개'
      + (p.noteOnly ? ' (출처 메모만 ' + p.noteOnly + '개 고침)' : ''));
  }
  console.log('완료: ' + plan.length + '곳. 관리자 → 일정 관리에서 확인하세요.');
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

/* 고르기 후보를 **기업 연수 적합도**로 분류한다 (QX).
   `node ai-loop/rank_activities.js`로 직접 실행. 결과는 루트 `activity_rank.js`로 저장된다.

   ── 실행 ────────────────────────────────────────────────────────────────
   node ai-loop/rank_activities.js --count      대상 문구가 몇 건인지만 센다(호출 없음)
   node ai-loop/rank_activities.js --dry-run    프롬프트 1건만 만들어 보여준다(호출 없음)
   node ai-loop/rank_activities.js              실제 분류 후 activity_rank.js 저장
   node ai-loop/rank_activities.js --limit 200  앞의 200건만 (시험용)

   ── 왜 미리 만들어 두는가 ──────────────────────────────────────────────
   담당자가 '고르기'를 누를 때마다 외부에 물어보면 ① 창이 느려지고 ② 호출 비용이 계속
   들고 ③ Vercel 함수 12개 제한에 새 창구를 낼 자리도 없다. 무엇보다 **사람이 먼저 보고
   반영할 수 없다.** 그래서 여기서 한 번 만들어 파일로 커밋하고, 화면은 그 파일만 읽는다.
   문구가 바뀌면 다시 돌리면 된다.

   ── 등급 ────────────────────────────────────────────────────────────────
   점수 대신 **세 등급**으로 나눈다. 0~100점은 사람이 검토할 수도, 화면에 설명할 수도
   없다(“73점”이 무슨 뜻인지 아무도 모른다). 등급은 담당자에게 그 자체로 정보가 된다.
     1 연수 — 견학·특강·워크숍처럼 연수 목적에 바로 쓰이는 것 (결재 보고서에 그대로 들어간다)
     2 보완 — 이동·식사·오리엔테이션처럼 일정을 이루지만 목적은 아닌 것
     3 여가 — 쇼핑·자유시간·야경처럼 휴식·관광에 가까운 것
   순위는 1 → 2 → 3. ⚠ 3등급이 나쁜 문구라는 뜻이 **아니다** — 연수 일정에도 여가는
   필요하다. 다만 빈칸을 채울 때 먼저 보여야 하는 것은 1등급이다.

   ⚠ GPT의 판단을 그대로 믿지 않는다. 이 저장소 규칙대로 1라운드는 검증 대상이다.
   `--dry-run`으로 프롬프트를 먼저 보고, 저장 후에는 `--sample`로 등급별 예시를 뽑아
   사람이 훑을 수 있게 한다. 결과 파일은 사람이 읽고 고칠 수 있는 평범한 JS다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'activity_rank.js');
const BATCH = 60;          /* 한 번에 물어볼 문구 수 — 너무 크면 뒤쪽 판단이 흐려진다 */
const MODEL = 'gpt-4o-mini';

/* data.js는 브라우저 전역용이라 ITINERARY_DB·DEST_REC을 export하지 않는다.
   ⚠ 목록을 여기 다시 적지 않는다 — 원본을 평가해서 그대로 읽는다(결함 생성기 ①). */
function loadData() {
  const src = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  const box = {};
  new Function('module', 'exports', src + '\n;this.ITINERARY_DB=ITINERARY_DB;this.DEST_REC=DEST_REC;')
    .call(box, { exports: {} }, {});
  return box;
}

/* 고르기 창이 후보로 쓰는 칸과 **같은 자리**에서 모은다. 여기가 어긋나면 순위가 있는
   문구와 실제 후보가 서로 다른 목록이 된다. */
function collectPhrases({ ITINERARY_DB, DEST_REC }) {
  const set = new Set();
  const add = (v) => { const s = String(v == null ? '' : v).trim(); if (s) set.add(s); };

  for (const courses of Object.values(ITINERARY_DB || {})) {
    for (const c of courses || []) {
      (c.highlights || []).forEach(add);
      for (const d of c.days || []) { add(d.title); add(d.am); add(d.pm); add(d.eve); add(d.tip); }
    }
  }
  for (const rec of Object.values(DEST_REC || {})) {
    for (const plan of ['a', 'b']) {
      const p = (rec && rec[plan]) || {};
      (p.points || []).forEach(add);
      (p.items || []).forEach(add);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

function buildPrompt(phrases) {
  return `당신은 기업 해외연수(MICE) 프로그램을 설계하는 담당자입니다.
아래는 연수 일정에 들어가는 활동 문구 목록입니다. 각 문구를 **기업 연수 프로그램으로서의
적합도** 기준으로 셋 중 하나로 분류하세요.

1 = 연수 : 견학·특강·워크숍·기업 방문·산업 시찰처럼 **연수 목적에 바로 쓰이는** 활동.
           결재 보고서에 "이래서 갔다"고 쓸 수 있는 것.
2 = 보완 : 이동·체크인·식사·오리엔테이션·자유 정비처럼 일정을 이루지만 목적은 아닌 것.
3 = 여가 : 쇼핑·자유시간·야경·테마파크·관광 명소처럼 휴식·관광에 가까운 것.

판단이 애매하면 **더 낮은 번호(연수 쪽)로 올리지 말고** 보수적으로 2 또는 3을 주세요.
설명 없이 JSON만 답하세요. 형식:
{"ranks": [{"i": 0, "r": 1}, {"i": 1, "r": 3}, ...]}
i는 아래 목록의 번호, r은 1·2·3입니다. 목록에 있는 모든 번호를 빠짐없이 넣으세요.

${phrases.map((p, i) => `${i}. ${p}`).join('\n')}`;
}

async function classify(client, phrases) {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: buildPrompt(phrases) }],
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  });
  let parsed;
  try {
    parsed = JSON.parse(res.choices[0].message.content);
  } catch (err) {
    throw new Error('응답을 JSON으로 읽지 못했습니다: ' + (err && err.message));
  }
  const out = new Map();
  for (const row of (parsed.ranks || [])) {
    const i = Number(row.i);
    const r = Number(row.r);
    if (Number.isInteger(i) && phrases[i] && [1, 2, 3].includes(r)) out.set(phrases[i], r);
  }
  return out;
}

function writeOut(ranks, meta) {
  /* 사람이 읽고 직접 고칠 수 있는 평범한 파일로 쓴다 — GPT가 틀린 한 줄을 고치려고
     도구를 다시 돌려야 한다면 아무도 안 고친다. */
  const entries = [...ranks.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  const body = entries.map(([text, r]) => `  ${JSON.stringify(text)}: ${r},`).join('\n');
  const src = `/* 고르기 후보의 **기업 연수 적합도** 등급 (QX).
   ai-loop/rank_activities.js가 만들었고, **사람이 직접 고쳐도 된다** — 틀린 줄은 숫자만 바꾸면 된다.
   1 = 연수(견학·특강·워크숍 등 연수 목적에 바로 쓰임)
   2 = 보완(이동·식사·오리엔테이션 등 일정을 이루지만 목적은 아님)
   3 = 여가(쇼핑·자유시간·관광 등 휴식에 가까움)
   ⚠ 3이 나쁜 문구라는 뜻이 아니다. 빈칸을 채울 때 **먼저 보여야 할 순서**일 뿐이다.
   여기 없는 문구는 등급이 없는 것으로 보고 순위에서 중립으로 다룬다(화면이 알아서 처리한다).

   만든 시각: ${meta.at}   모델: ${meta.model}   대상: ${meta.total}건 (분류됨 ${entries.length}건) */
const ACTIVITY_RANK = {
${body}
};

if (typeof module !== 'undefined' && module.exports) module.exports = ACTIVITY_RANK;
`;
  fs.writeFileSync(OUT_FILE, src, 'utf8');
  return entries.length;
}

function sample(ranks, n = 6) {
  const by = { 1: [], 2: [], 3: [] };
  ranks.forEach((r, text) => { if (by[r].length < n) by[r].push(text); });
  const LABEL = { 1: '연수', 2: '보완', 3: '여가' };
  for (const r of [1, 2, 3]) {
    console.log(`\n[${r} ${LABEL[r]}] ${ranks.size ? [...ranks.values()].filter(v => v === r).length : 0}건`);
    by[r].forEach((t) => console.log('   · ' + t));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const data = loadData();
  let phrases = collectPhrases(data);

  const limitIdx = argv.indexOf('--limit');
  if (limitIdx >= 0 && argv[limitIdx + 1]) phrases = phrases.slice(0, Number(argv[limitIdx + 1]));

  console.log(`대상 문구 ${phrases.length}건 (중복 제거·정렬 완료)`);
  console.log(`배치 ${BATCH}건씩 → 호출 약 ${Math.ceil(phrases.length / BATCH)}회 · 모델 ${MODEL}`);

  if (argv.includes('--count')) return;
  if (argv.includes('--dry-run')) {
    console.log('\n─── 첫 배치 프롬프트 ' + '─'.repeat(40));
    console.log(buildPrompt(phrases.slice(0, 5)));
    return;
  }

  require('./_load_env')();
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY가 없습니다 (ai-loop/.env 확인).');
    process.exit(1);
  }
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const ranks = new Map();
  const failed = [];
  for (let i = 0; i < phrases.length; i += BATCH) {
    const batch = phrases.slice(i, i + BATCH);
    const no = Math.floor(i / BATCH) + 1;
    try {
      const got = await classify(client, batch);
      got.forEach((r, t) => ranks.set(t, r));
      /* 빠진 문구를 조용히 넘기지 않는다 — 등급 없는 문구가 늘면 순위가 조용히 약해진다. */
      const missing = batch.filter((t) => !got.has(t));
      if (missing.length) failed.push(...missing);
      console.log(`  [${no}] ${got.size}/${batch.length}건 분류${missing.length ? ` (빠짐 ${missing.length})` : ''}`);
    } catch (err) {
      console.error(`  [${no}] 실패 — ${(err && err.message) || err}`);
      failed.push(...batch);
    }
  }

  const saved = writeOut(ranks, { at: new Date().toISOString(), model: MODEL, total: phrases.length });
  console.log(`\n저장: ${OUT_FILE}  (${saved}건)`);
  if (failed.length) {
    console.log(`⚠ 등급을 못 받은 문구 ${failed.length}건 — 다시 돌리면 채워진다. 예: ${failed.slice(0, 3).join(' / ')}`);
  }
  sample(ranks);
  console.log('\n⚠ GPT 판단이다. 위 예시를 훑어보고 이상하면 activity_rank.js에서 숫자만 고치면 된다.');
}

module.exports = { collectPhrases, buildPrompt, loadData };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

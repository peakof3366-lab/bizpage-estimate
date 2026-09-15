/* ═══════════════════════════════════════════════════════════════════════════
   시즌 감사 — **우리가 적어 둔 현지 시즌**과 **금액에 쓰는 시즌표**가 같은 말을 하는가
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표: 「관리자 모드에서 지역별 시즌이 잘못된 곳도 있는 것 같다. 검토해 달라.」

   ■ 이 도구가 재는 것
   `destinationRates[].season_note`는 목적지마다 **우리가 조사해 적어 둔 현지 시즌**이다
   (「성수기: 4~10월(건기) · 비수기: 11~3월(우기)」처럼). 그런데 금액을 움직이는 것은
   `DEST_SEASON_PROFILES`의 **권역 단위 달력**이다. 둘은 서로 참조하지 않는다.
   → **두 값을 나란히 놓고 어긋나는 달을 센다.**

   ■ 🔴 왜 이 방법인가
   「발리는 원래 4~10월이 성수기다」는 내 지식이지만, **`season_note`는 이 저장소의 데이터**다.
   즉 어긋남을 찾는 데 바깥 지식이 필요 없다 — **파일이 스스로 모순**인 자리를 센다.
   판정이 사람 감각에 기대지 않으므로 다음 사람도 같은 결과를 얻는다.

   ■ ⚠ 이 도구는 **고치지 않는다**
   시즌 계수는 금액에 직접 붙고(성수기 +15% / 비수기 −12%), 「우리 관광 성수기」는
   실거래 감각이 필요한 값이다(CLAUDE.md: 도메인 값 판단은 대표). 여기서는 **세어서
   보여주기만** 한다. `audit_rates.js`와 같은 성격이다 — 결과는 「확인 대상」이지 「오류」가 아니다.

       node ai-loop/audit_season_match.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { window: {}, console, Math, Date, JSON, Object, Array, String, Number, Boolean };
vm.createContext(ctx);
/* `const`는 vm 전역에 안 붙는다 — 소스 끝에 노출 줄을 붙여 꺼낸다(저장소 관례). */
const EXPOSE = ';window.__X={P:DEST_SEASON_PROFILES,C:DEST_CLASSIFY,R:destinationRates,'
  + 'S:(typeof SOUTHERN_HEMISPHERE_DESTS!=="undefined"?SOUTHERN_HEMISPHERE_DESTS:[])};';
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8') + EXPOSE, ctx);
const { P, C, R, S } = ctx.window.__X;

const profById = {};
P.forEach((p) => { profById[p.id] = p; });
const monthsOf = (prof, id) => ((prof.config.find((c) => c.id === id) || {}).months || []);

/* season_note에서 달을 뽑는다.
   ⚠ **역슬래시 없는 정규식만 쓴다** — 이 저장소는 도구를 거치며 역슬래시가 소실돼
     검사가 조용히 통과한 적이 있다. 숫자는 [0-9]로 쓴다. */
const RANGE = /([0-9]{1,2})[~-]([0-9]{1,2})월/g;
const SINGLE = /([0-9]{1,2})월/g;
function monthsIn(text) {
  const out = new Set();
  let m;
  const r = new RegExp(RANGE.source, 'g');
  while ((m = r.exec(text))) {
    let a = Number(m[1]), b = Number(m[2]);
    /* 11~3월처럼 해를 넘는 구간 */
    for (let i = 0, cur = a; i < 12; i++) { out.add(cur); if (cur === b) break; cur = cur === 12 ? 1 : cur + 1; }
  }
  const s = new RegExp(SINGLE.source, 'g');
  while ((m = s.exec(text))) out.add(Number(m[1]));
  return [...out].filter((n) => n >= 1 && n <= 12);
}
/* 「성수기: … · 비수기: …」에서 각 구역만 잘라 본다 */
function slice(note, key) {
  const i = note.indexOf(key);
  if (i < 0) return '';
  const rest = note.slice(i + key.length);
  const stop = rest.search(/성수기|비수기|평시/);
  return stop < 0 ? rest : rest.slice(0, stop);
}

const rows = [];
R.forEach((d) => {
  const key = d.destination_key;
  const cls = C[key];
  if (!cls || !cls.season) return;
  const prof = profById[cls.season];
  if (!prof) return;
  const note = String(d.season_note || '');
  if (!note) return;
  const notePeak = monthsIn(slice(note, '성수기'));
  const noteOff = monthsIn(slice(note, '비수기'));
  if (!notePeak.length && !noteOff.length) return;
  const profPeak = monthsOf(prof, 'peak');
  const profOff = monthsOf(prof, 'offpeak');
  /* 🔴 가장 나쁜 어긋남: **우리가 성수기라 적은 달을 시즌표가 비수기로 매기는 것**
     (그 반대도 같다). 평시로 매기는 것보다 훨씬 크게 틀린다. */
  const 성수기인데비수기 = notePeak.filter((m) => profOff.includes(m));
  const 비수기인데성수기 = noteOff.filter((m) => profPeak.includes(m));
  const 뒤집힘 = 성수기인데비수기.length + 비수기인데성수기.length;
  if (뒤집힘) {
    const pf = (prof.config.find((c) => c.id === 'peak') || {}).factor || 1;
    const of = (prof.config.find((c) => c.id === 'offpeak') || {}).factor || 1;
    /* 🔴🔴 **여기서 한 번 갈라야 한다 — 안 그러면 숫자를 부풀린다.**
       처음에 이 도구는 어긋난 곳을 28곳으로 셌는데, **그중 대부분이 오탐**이었다.
       두 값이 **애초에 다른 것을 재기 때문**이다:
         · `season_note` = 목적지의 **현지 기후·관광 시즌**(웹 조사 기반, 관리자 화면에
           「참고용」으로 뜬다)
         · `DEST_SEASON_PROFILES` = **한국 출발 항공·호텔 수요**(data.js 머리말에
           「북반구/한국 출발 수요 기준」이라고 적혀 있다)
       도쿄가 그 예다 — 적어 둔 것은 「혹서기 7~8월 비수기」(현지 날씨), 시즌표는
       「7·8월 성수기」(한국 방학 수요). **둘 다 맞다.** 이걸 오류로 세면 진짜 오류가 묻힌다.

     → **`season_note`가 한국 수요를 직접 말하는 경우만** 같은 축으로 본다.
       「방학·연휴·한국·성수기 최」처럼 우리 손님 기준이 적힌 자리다. 그때의 어긋남은
       관점 차이로 설명되지 않는다. */
    const 수요언급 = /방학|연휴|한국|최성수기/.test(note);
    rows.push({ key, prof: prof.id, notePeak, noteOff, profPeak, profOff,
      성수기인데비수기, 비수기인데성수기, 뒤집힘, 수요언급,
      폭: Math.round((pf / of - 1) * 1000) / 10, note });
  }
});

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' 시즌 감사 — 적어 둔 현지 시즌 vs 금액에 쓰는 시즌표');
console.log('══════════════════════════════════════════════════════════════════');
console.log(` 목적지 ${R.length}곳 · 시즌표 ${P.length}개 · season_note가 있는 곳만 대조\n`);

const 그림 = (r) => {
  console.log(` ── ${r.key}  [시즌표: ${r.prof}]  어긋난 달 ${r.뒤집힘}개 · 성수기/비수기 폭 ${r.폭}%`);
  if (r.성수기인데비수기.length) console.log(`     우리가 **성수기**라 적은 달을 시즌표는 **비수기**로 매긴다: ${r.성수기인데비수기.join('·')}월`);
  if (r.비수기인데성수기.length) console.log(`     우리가 **비수기**라 적은 달을 시즌표는 **성수기**로 매긴다: ${r.비수기인데성수기.join('·')}월`);
  console.log(`     적어 둔 것: ${r.note.slice(0, 96)}`);
  console.log(`     시즌표    : 성수기[${r.profPeak.join(',')}] 비수기[${r.profOff.join(',')}]`);
  console.log('');
};

const A = rows.filter((r) => r.수요언급).sort((a, b) => b.뒤집힘 - a.뒤집힘);
const B = rows.filter((r) => !r.수요언급).sort((a, b) => b.뒤집힘 - a.뒤집힘);

if (!rows.length) {
  console.log(' ✓ 뒤집힌 곳 없음 — 적어 둔 시즌과 시즌표가 같은 방향입니다.');
} else {
  console.log('┌─ 🔴 A. **관점 차이로 설명이 안 되는 곳** ' + A.length + '곳 ────────────────');
  console.log('│  적어 둔 글이 **한국 손님 수요**(방학·연휴·최성수기)를 직접 말하는데도');
  console.log('│  시즌표가 그 반대로 매긴다. 여기가 먼저 볼 자리다.');
  console.log('└──────────────────────────────────────────────────────────────\n');
  A.length ? A.forEach(그림) : console.log('   (없음)\n');

  console.log('┌─ 🟡 B. 관점 차이일 수 있는 곳 ' + B.length + '곳 ──────────────────────────');
  console.log('│  적어 둔 글은 **현지 기후**만 말한다(예: 도쿄 「혹서기 7~8월」).');
  console.log('│  우리 시즌표는 **한국 출발 수요** 기준이라 7~8월이 성수기인 것이 맞다.');
  console.log('│  즉 대부분 정상이다 — 다만 목록으로 남겨 대표가 훑어볼 수 있게 한다.');
  console.log('└──────────────────────────────────────────────────────────────');
  console.log('   ' + B.map((r) => `${r.key}(${r.뒤집힘})`).join(' · ') + '\n');
}

/* 남반구인데 남반구 표시가 없는 곳 — 계절이 통째로 반대일 수 있다 */
const 남반구의심 = ['발리', '자카르타', '리마', '상파울루', '부에노스아이레스', '요하네스버그', '나이로비'];
const 빠진남반구 = 남반구의심.filter((k) => C[k] && !S.includes(k));
if (빠진남반구.length) {
  console.log(' ⚠ 남반구일 수 있는데 남반구 목록에 없는 곳: ' + 빠진남반구.join(' · '));
  console.log('   (적도 근처는 계절보다 건기/우기가 지배적이라 남반구표가 정답이 아닐 수 있다 —');
  console.log('    위 「뒤집힌 곳」과 함께 보고 판단할 것)');
}

console.log('\n──────────────────────────────────────────────────────────────────');
console.log(' ⚠ 이 결과는 **확인 대상**이지 «오류»가 아니다 — 시즌 계수는 금액에 직접');
console.log('   붙고, 「우리 관광 성수기」는 실거래 감각이 필요한 값이다(대표 판단).');
console.log(`결과: A ${A.length}곳(먼저 볼 것) · B ${B.length}곳(관점 차이 가능) / ${R.length} 목적지`);
/* ⚠ exit 0 — 이 도구는 막는 자가 아니라 보여주는 자다(audit_rates와 같은 성격) */
process.exit(0);

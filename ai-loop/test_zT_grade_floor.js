/* ═══════════════════════════════════════════════════════════════════════════
   등급 역전 보정 검사 — 「등급을 올렸는데 총액이 내려간다」를 막는다
   ───────────────────────────────────────────────────────────────────────────
   2026-09-16 대표 승인((b)안, 결정대기열 0-af).

   ■ 무엇을 막는가
   호텔 등급을 올리면 호텔비는 오른다. 그런데 1인당 원가소계가 `MARGIN_BANDS`의
   구간을 넘으면 마진 배수가 한 칸 떨어지고, 그 계단이 호텔 인상분보다 큰 구간이 있다.
   고치기 전 실측: 270조합 중 **27자리(10%)**에서 총액이 뒤집혔다.
   가장 큰 것 — 나트랑 50명 5일: 3성급 76,954,850 → 4성급 75,099,700 (−1,855,150원).

   ■ 어떻게 막았나 (원인은 그대로 둔다)
   마진 밴드의 계단은 **손대지 않았다** — 비싼 여행일수록 마진율을 낮추는 것은 실거래
   관행이고, 계단을 완만하게 만들면 금액이 전면적으로 움직인다(대표가 (b)를 고른 이유).
   대신 **한 등급 아래 금액을 바닥으로 깐다.**

   ■ 🔴 이 검사가 지키는 것 — 「안 내려간다」만이 아니다
   ① 등급 셋이 **단조 비감소**다.
   ② 보정이 걸리면 **흔적이 남는다**(`gradeFloor` + `⚖️ 등급 역전 보정` 줄).
      조용히 숫자만 바꾸면 담당자가 「왜 4성급과 금액이 같은가」를 설명할 수 없다
      (`CLAUDE.md` 결함 생성기 ②).
   ③ 그 줄은 `muted`라 **고객 견적서에 안 나간다**(원가·마진과 같은 취급).
   ④ 🔴 **안 걸린 자리는 한 원도 안 움직인다.** 이게 (b)안의 약속이다 —
      「기존 금액을 대부분 그대로 두면서 역전만 없앤다」. 보정 줄이 없으면 총액은
      계수 적용 전 합계 그대로여야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const { bootEngine } = require('./_engine_boot');

let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

const GRADES = [['standard', '3성급'], ['superior', '4성급'], ['deluxe', '5성급']];
/* 역전이 실제로 났던 자리를 반드시 포함한다 — 나트랑 50명 5일·다낭 30명 5일 */
const CASES = [
  { dest: '나트랑', pax: 50, days: 5 },
  { dest: '다낭', pax: 30, days: 5 },
  { dest: '다낭', pax: 8, days: 5 },
  { dest: '장가계', pax: 20, days: 4 },
  { dest: '방콕', pax: 100, days: 5 },
  { dest: '오키나와', pax: 20, days: 4 },
  { dest: '파리', pax: 20, days: 8 },
  { dest: '세부', pax: 12, days: 5 },
];
const DATE = '2027-05-20';

(async () => {
  /* 🔴 운영 요율을 안 얹는다 — 담당자가 요율을 고칠 때마다 이 검사의 숫자가 달라지면
     「무엇이 깨졌는지」를 두 번 볼 수 없다(`audit_hotel_grade.js`와 같은 규칙). */
  const B = await bootEngine({ quiet: true, ratesResponse: 'fail' });

  let floored = 0, cells = 0;
  CASES.forEach((c) => {
    const got = GRADES.map(([g, label]) => {
      const r = B.run({ dest: c.dest, pax: c.pax, days: c.days, date: DATE }, { hotelGrade: g });
      return r ? { g, label, r } : null;
    });
    if (got.some((x) => !x)) { ok('[0] ' + c.dest + ' 산출이 됐다', false, '엔진이 null'); return; }
    const where = `${c.dest} ${c.pax}명 ${c.days}일`;

    /* ① 단조 비감소 */
    for (let i = 1; i < got.length; i++) {
      cells++;
      ok(`[1] ${where} — ${got[i].label}이 ${got[i - 1].label}보다 싸지 않다`,
        got[i].r.total >= got[i - 1].r.total,
        `${got[i - 1].label} ${got[i - 1].r.total.toLocaleString()} → ${got[i].label} ${got[i].r.total.toLocaleString()}`);
    }

    got.forEach(({ label, r }) => {
      const gf = r.gradeFloor;
      const line = (r.rows || []).find((x) => /등급 역전 보정/.test(x.name));
      if (gf && gf.applied) {
        floored++;
        /* ② 흔적이 남는다 */
        ok(`[2] ${where} ${label} — 보정 줄이 남는다`, !!line);
        ok(`[2-b] ${where} ${label} — 어느 등급을 바닥으로 깔았는지 적는다`,
          !!gf.fromLabel && /성급/.test(gf.fromLabel), String(gf.fromLabel));
        /* ③ 고객에게 안 나간다 */
        ok(`[3] ${where} ${label} — 보정 줄이 muted다`, !!line && line.muted === true);
        /* 바닥이 실제로 그 등급 금액이다 (1원 이내 — ceil이라 위로만 붙는다) */
        ok(`[3-b] ${where} ${label} — 바닥이 아래 등급 금액과 같다`,
          r.total >= gf.lowerTotal && r.total - gf.lowerTotal <= 1,
          `총액 ${r.total.toLocaleString()} / 바닥 ${gf.lowerTotal.toLocaleString()}`);
      } else {
        /* ④ 🔴 안 걸린 자리는 손대지 않는다 */
        ok(`[4] ${where} ${label} — 보정이 없으면 줄도 없다`, !line);
        const base = (r.rows || []).reduce((s, x) => s + x.amount, 0);
        ok(`[4-b] ${where} ${label} — 총액이 합계×계수 그대로다`,
          r.total === Math.round(base * r.combinedFactor),
          `${r.total} vs ${Math.round(base * r.combinedFactor)}`);
      }
    });
  });

  /* ⑤ 재는 자 검산 — 보정이 **한 번도 안 걸렸다면** 이 검사는 아무것도 안 잰 것이다.
     🔴 이 저장소는 「늘 통과하는 잣대」에 여러 번 속았다. 표본에 역전 자리를 일부러
       넣어 뒀으므로, 0이면 표본이 낡았거나 엔진이 바뀐 것이다. */
  ok('[5] 표본 안에서 보정이 실제로 걸렸다 (안 걸리면 이 검사는 빈 그물이다)',
    floored > 0, '걸린 자리: ' + floored);

  /* ⑥ 호텔을 빼면 등급은 금액에 닿지 않는다 — 보정도 걸리지 않아야 한다 */
  const noHotel = GRADES.map(([g]) =>
    B.run({ dest: '다낭', pax: 30, days: 5, date: DATE }, { hotelGrade: g, incHotel: false }));
  ok('[6] 호텔 미포함이면 등급별 금액이 같다',
    noHotel.every((r) => r && r.total === noHotel[0].total),
    noHotel.map((r) => r && r.total).join(' / '));
  ok('[6-b] 호텔 미포함이면 보정이 안 걸린다',
    noHotel.every((r) => r && !r.gradeFloor));

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 등급 역전 보정 — 등급을 올리면 총액이 안 내려간다 (대표 승인 (b)안)');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(` 잰 등급 전이: ${cells}쌍 · 바닥이 깔린 자리: ${floored}`);
  fails.forEach((f) => console.log(' ✗ ' + f));
  if (!fails.length) console.log(' ✓ 전부 통과');
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log('검사가 죽었습니다: ' + e.stack); process.exit(1); });

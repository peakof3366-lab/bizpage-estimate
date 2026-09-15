/* ═══════════════════════════════════════════════════════════════════════════
   호텔 등급 감사 — **등급을 올렸는데 총액이 내려가는 자리가 있다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15에 우연히 걸렸다. 내부직원용 화면의 엔진 호스트를 검사하면서
   「등급을 올리면 총액이 오른다」를 당연한 것으로 썼는데 **실패했다.**
   호스트 결함인 줄 알았으나 고객 엔진(`index.html`을 실제로 띄운 것)도 같았다.

   ■ 무슨 일이 일어나는가 (다낭 30명 5일, 2027-05-20, 기본 요율)
       3성급  43,362,758   호텔  5,940,000   ENBT 6,703,350  현지 5,872,500
       4성급  45,738,758   호텔  7,920,000   ENBT 6,703,350  현지 5,872,500
       5성급  45,637,508   호텔 11,088,000   ENBT 4,623,000  현지 4,050,000   ← 4성급보다 싸다
   호텔비는 +3,168,000인데 **마진이 −3,902,850** 줄어 총액이 101,250원 **내려간다.**
   원인은 마진 밴드다 — 1인당 단가가 어느 구간을 넘으면 `margin_per_traveler`에
   적용되는 밴드가 한 칸 떨어진다. 그 계단이 호텔 등급 인상분보다 큰 자리가 생긴다.

   ■ ⚠ 이 도구는 **고치지 않는다. 센다.**
   금액은 대표 승인 없이 못 건드린다(CLAUDE.md 승인 범위: 「도메인 값 판단」).
   그리고 마진 밴드 자체는 의도된 장치다 — 비싼 여행일수록 마진율을 낮추는 것은
   실거래 관행이다. **문제는 그 계단이 너무 커서 총액이 역전되는 구간**이고, 그게
   어디에 몇 개나 있는지는 지금까지 아무도 센 적이 없다.
   `audit_rates.js`와 같은 성격이다 — 여기 나오는 건 **「확인 대상」이지 「오류」가 아니다.**

       node ai-loop/audit_hotel_grade.js
       node ai-loop/audit_hotel_grade.js --all   # 목적지 전체 (느리다)
   ═══════════════════════════════════════════════════════════════════════════ */
const { bootEngine } = require('./_engine_boot');

const ALL = process.argv.includes('--all');
const GRADES = [['standard', '3성급'], ['superior', '4성급'], ['deluxe', '5성급']];
const PAX = [8, 15, 20, 30, 50];
const DAYS = [4, 5, 7];
const DATE = '2027-05-20';

(async () => {
  /* 🔴 운영 요율을 안 얹고 `data.js` 기본값으로 잰다 — 담당자가 요율을 고칠 때마다
     숫자가 달라지면 「어디가 역전인가」를 두 번 볼 수 없다. 요율을 얹은 실제 금액은
     `--all` 없이도 화면에서 확인할 수 있다. */
  const B = await bootEngine({ quiet: true, ratesResponse: 'fail' });
  const DR = B.window.__DR || [];
  const keys = ALL ? DR.map((d) => d.destination_key)
    : ['다낭', '오키나와', '방콕', '세부', '파리', '도쿄', '발리', '하노이', '괌', '상해',
      '싱가포르', '푸꾸옥', '나트랑', '코타키나발루', '홍콩', '뉴욕', '시드니', '삿포로'];

  const hits = [];
  let cells = 0;
  keys.forEach((dest) => {
    PAX.forEach((pax) => {
      DAYS.forEach((days) => {
        const t = { dest, pax, days, date: DATE };
        const got = GRADES.map(([g, label]) => {
          const r = B.run(t, { hotelGrade: g });
          return r ? { g, label, total: r.total, per: r.perPerson,
            hotel: (r.rows.find((x) => /호텔/.test(x.name)) || {}).amount || 0,
            margin: (r.rows || []).filter((x) => x.muted && !/여행자보험/.test(x.name))
              .reduce((s, x) => s + x.amount, 0) } : null;
        });
        if (got.some((x) => !x)) return;
        cells++;
        for (let i = 1; i < got.length; i++) {
          if (got[i].total < got[i - 1].total) {
            hits.push({ dest, pax, days,
              from: got[i - 1], to: got[i],
              gap: got[i].total - got[i - 1].total,
              hotelUp: got[i].hotel - got[i - 1].hotel,
              marginDown: got[i].margin - got[i - 1].margin });
          }
        }
      });
    });
  });

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 호텔 등급 감사 — 등급을 올렸는데 총액이 내려가는 자리');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(` 목적지 ${keys.length}곳 × 인원 ${PAX.length} × 일수 ${DAYS.length} = ${cells}조합 (${DATE} 기준)\n`);

  if (!hits.length) {
    console.log(' ✓ 역전되는 자리가 없습니다 — 등급을 올리면 언제나 총액이 오릅니다.');
  } else {
    const byDest = {};
    hits.forEach((h) => { (byDest[h.dest] = byDest[h.dest] || []).push(h); });
    console.log(` 🔴 역전 ${hits.length}자리 / 목적지 ${Object.keys(byDest).length}곳\n`);
    console.log('   목적지       인원 일수  등급          총액 차이      호텔 인상   마진 감소');
    hits.sort((a, b) => a.gap - b.gap).slice(0, 30).forEach((h) => {
      console.log('   ' + h.dest.padEnd(12) + String(h.pax).padStart(3) + '명'
        + String(h.days).padStart(3) + '일  ' + (h.from.label + '→' + h.to.label).padEnd(12)
        + String(h.gap.toLocaleString('ko-KR')).padStart(12)
        + String('+' + h.hotelUp.toLocaleString('ko-KR')).padStart(12)
        + String(h.marginDown.toLocaleString('ko-KR')).padStart(12));
    });
    if (hits.length > 30) console.log(`   … 그리고 ${hits.length - 30}자리 더`);
    const worst = hits[0];
    console.log(`\n 🔴 가장 큰 역전: ${worst.dest} ${worst.pax}명 ${worst.days}일 — `
      + `${worst.from.label} ${worst.from.total.toLocaleString('ko-KR')}원 → `
      + `${worst.to.label} ${worst.to.total.toLocaleString('ko-KR')}원 `
      + `(${worst.gap.toLocaleString('ko-KR')}원)`);
  }

  console.log('\n──────────────────────────────────────────────────────────────────');
  console.log(' ⚠ **역전이 곧 오류는 아니다.** 마진 밴드(비싼 여행일수록 마진율을 낮춘다)는');
  console.log('   의도된 장치이고 실거래 관행이다. 다만 「계단이 호텔 인상분보다 커서 총액이');
  console.log('   뒤집히는 구간」을 그대로 둘지는 **대표가 판단한다** — 고객이 5성급을 고르고');
  console.log('   더 싼 견적을 받으면 설명하기 어렵다.');
  console.log(`결과: 역전 ${hits.length}자리 / ${cells}조합`);
  process.exit(0);
})();

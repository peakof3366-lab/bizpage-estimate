/* 견적 엔진 불변식 퍼저 — 값이 '틀렸는지'가 아니라 '말이 안 되는지'를 본다.

   기존 fuzz_estimate*.py는 playwright로 조합을 훑지만, 여기서는 jsdom으로
   getBreakdownData를 직접 때리면서 아래 성질만 검사한다. 어떤 조합에서든
   깨지면 안 되는 것들이라, 깨지면 그 자체로 버그다:

     ① 모든 금액이 유한한 숫자 (NaN·Infinity 없음)
     ② 모든 금액이 음수가 아님
     ③ 총액 = 행 합계 (표시와 실제가 어긋나지 않음)
     ④ 1인당 금액 × 인원 ≈ 총액 (반올림 오차 범위)
     ⑤ 일수를 늘리면 총액이 줄지 않음 (단조성)
     ⑥ 고객 노출 총액 ≤ 전체 총액 (비공개 항목이 새지 않음)
     ⑦ 인원 경계에서 1인당 금액이 급변하지 않음 (볼륨 할인 절벽)

   실행: node ai-loop/fuzz_invariants.js [--full]  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EXPOSE = '\n;try{window.__DR=destinationRates;window.__COEF=COEF_STATE;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('rec_fallbacks.js') + '\n' + read('script.js') + EXPOSE;

const FULL = process.argv.includes('--full');
const problems = [];
const note = (kind, ctx, detail) => problems.push({ kind, ctx, detail });

(async () => {
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(window) {
      window.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    },
  });
  const { window } = dom;
  try { window.eval(APP_SRC); } catch (e) { console.log('[eval warn]', e.message); }
  await new Promise((r) => setTimeout(r, 150));
  const doc = window.document;
  const gbd = window.getBreakdownData;
  const DR = window.__DR;
  if (typeof gbd !== 'function' || !DR) { console.log('✗ 엔진 로드 실패'); process.exit(1); }

  const setForm = (o) => {
    doc.getElementById('destination').value = o.dest;
    doc.getElementById('participants').value = String(o.pax);
    doc.getElementById('days').value = String(o.days);
    doc.getElementById('startDate').value = o.date || '2027-05-10';
    ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
      const e = doc.getElementById(id); if (e) e.checked = o.inc === undefined ? true : o.inc;
    });
    return gbd();
  };

  const dests = FULL ? DR.map((d) => d.destination_key) : [
    '도쿄', '방콕', '발리', '괌', '하와이', '뉴욕', '서유럽', '장가계', '카자흐스탄', '호주', '동유럽',
  ];
  const paxList = FULL ? [1, 2, 5, 9, 10, 15, 20, 24, 25, 26, 30, 40, 50, 80, 100, 150, 200]
    : [1, 2, 9, 10, 20, 25, 26, 40, 100, 200];
  const dayList = FULL ? [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16, 20, 30] : [1, 3, 5, 7, 10, 16, 30];
  const dates = ['2027-01-15', '2027-05-10', '2027-08-05', '2027-12-24'];

  let cases = 0;
  for (const dest of dests) {
    for (const date of dates) {
      /* ⑤ 단조성 검사를 위해 같은 조건에서 일수만 늘려가며 총액을 모은다 */
      for (const pax of paxList) {
        let prevTotal = -Infinity, prevDays = null;
        for (const days of dayList) {
          let bd;
          try { bd = setForm({ dest, pax, days, date }); }
          catch (e) { note('예외', `${dest}/${pax}명/${days}일/${date}`, e.message); continue; }
          cases++;
          if (!bd) { note('결과없음', `${dest}/${pax}명/${days}일/${date}`, 'getBreakdownData가 null'); continue; }
          const ctx = `${dest} ${pax}명 ${days}일 ${date}`;

          const nums = [['total', bd.total], ['perPerson', bd.perPerson],
            ...(bd.rows || []).flatMap((r) => [[`행:${r.name}.unit`, r.unit], [`행:${r.name}.amount`, r.amount]])];
          for (const [label, v] of nums) {
            if (typeof v !== 'number' || !Number.isFinite(v)) note('비정상숫자', ctx, `${label} = ${v}`);
            else if (v < 0) note('음수', ctx, `${label} = ${v}`);
          }

          const rowSum = (bd.rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
          if (Number.isFinite(bd.total) && Math.abs(rowSum - bd.total) > 2) {
            note('총액불일치', ctx, `행 합계 ${rowSum} vs 총액 ${bd.total} (차이 ${bd.total - rowSum})`);
          }

          if (Number.isFinite(bd.perPerson) && pax > 0 && Number.isFinite(bd.total)) {
            const diff = Math.abs(bd.perPerson * pax - bd.total);
            if (diff > pax + 2) note('1인당불일치', ctx, `perPerson×인원 ${bd.perPerson * pax} vs 총액 ${bd.total}`);
          }

          if (Number.isFinite(bd.visibleTotal) && Number.isFinite(bd.total) && bd.visibleTotal > bd.total + 2) {
            note('노출총액초과', ctx, `visibleTotal ${bd.visibleTotal} > total ${bd.total}`);
          }

          if (prevDays !== null && Number.isFinite(bd.total) && Number.isFinite(prevTotal) && bd.total < prevTotal - 2) {
            note('일수단조성', `${dest} ${pax}명 ${date}`, `${prevDays}일 ${prevTotal} → ${days}일 ${bd.total} (감소)`);
          }
          prevTotal = bd.total; prevDays = days;
        }
      }

      /* ⑦ 인원 경계 절벽 — 1명 늘었을 뿐인데 1인당 금액이 크게 뛰는 지점 */
      for (const days of [4, 7]) {
        let prev = null;
        for (let pax = 2; pax <= (FULL ? 60 : 40); pax++) {
          let bd; try { bd = setForm({ dest, pax, days, date }); } catch { continue; }
          if (!bd || !Number.isFinite(bd.perPerson)) continue;
          if (prev && prev.perPerson > 0) {
            const jump = bd.perPerson / prev.perPerson - 1;
            if (jump > 0.15) {
              note('인원절벽', `${dest} ${days}일 ${date}`,
                `${prev.pax}명 ${prev.perPerson.toLocaleString()} → ${pax}명 ${bd.perPerson.toLocaleString()} (+${(jump * 100).toFixed(1)}%)`);
            }
          }
          prev = { pax, perPerson: bd.perPerson };
        }
      }
    }
  }

  console.log(`검사 조합 ${cases.toLocaleString()}건 (${FULL ? '전체' : '샘플'} 모드)\n`);
  if (!problems.length) { console.log('✓ 불변식 위반 없음'); process.exit(0); }

  const byKind = {};
  for (const p of problems) (byKind[p.kind] = byKind[p.kind] || []).push(p);
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`■ ${kind} — ${list.length}건`);
    /* 같은 원인이 수천 건 찍히면 읽을 수 없으므로 종류별로 앞부분만 */
    for (const p of list.slice(0, 8)) console.log(`   · ${p.ctx}  ${p.detail}`);
    if (list.length > 8) console.log(`   · ... 외 ${list.length - 8}건`);
    console.log('');
  }
  process.exit(1);
})();

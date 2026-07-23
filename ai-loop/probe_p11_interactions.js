/* P11 진단: 견적 계수들이 곱해질 때 총 배수 분포/최댓값을 측정. 특히 '월 시즌 × 날짜 피크'
   중복 적용(여름·연말)과 P2b 노브 최대치에서의 스택을 정량화. (수정 전 측정용 — 판단 근거)
   실행: node ai-loop/probe_p11_interactions.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* getSeasonInfo/getPeakInfo/getLeadTimeFactor를 직접 쓰기 위해 노출 */
const EXPOSE = '\n;try{window.__gsi=getSeasonInfo;window.__gp=getPeakInfo;window.__glt=getLeadTimeFactor;window.__DR=destinationRates;window.__BIZ=BIZ_ZONE_FACTORS;}catch(e){}';
const APP_SRC = read('data.js') + '\n' + read('company-info.js') + '\n' + read('script.js') + EXPOSE;

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
  await new Promise(r => setTimeout(r, 100));
  const gsi = window.__gsi, gp = window.__gp;
  const applyStrength = (f, s) => 1 + (f - 1) * s;

  const DESTS = window.__DR.map(d => d.destination_key);
  /* 대표 날짜(계절/피크 아키타입). 리드타임은 today(2026-07-23) 기준이라 별도 취급. */
  const DATES = [
    ['여름피크', '2027-07-20'], ['연말연시', '2027-12-25'], ['설날', '2027-02-06'],
    ['골든위크', '2027-05-01'], ['벚꽃', '2027-04-01'], ['추석', '2027-09-15'],
    ['평시6월', '2027-06-15'], ['비수기2월말', '2027-02-20'],
  ];
  const KNOBS = [
    ['기본(1,1,1)', { s: 1, l: 1, p: 1 }],
    ['최대(2,2,2)', { s: 2, l: 2, p: 2 }],
  ];
  const DEP_MAX = 1.16; // 제주(최대 출발지 계수)

  // 1) 월시즌 × 날짜피크 중복 정량화 (리드=1, 출발=ICN=1.0, 기본노브)
  console.log('=== [A] 월 시즌 × 날짜 피크 중복(기본 노브, 리드/출발 제외) ===');
  console.log('날짜        | 대표목적지 | season | datePeak | season×peak');
  const sampleDest = '방콕';
  for (const [lbl, d] of DATES) {
    const s = gsi(d, sampleDest).factor, p = gp(d, sampleDest).factor;
    const prod = s * p;
    const flag = prod >= 1.4 ? '  ⚠중복스택' : '';
    console.log(`${lbl.padEnd(10)} | ${sampleDest} | ${s.toFixed(3)} | ${p.toFixed(3)} | ${prod.toFixed(3)}${flag}`);
  }

  // 2) 이코노미 변동배수(season×dep×lead×peak)의 전 목적지×날짜×노브 최댓값
  console.log('\n=== [B] 이코노미 변동배수(season×dep×lead×peak) 스윕 최댓값 ===');
  const today = new Date('2026-07-23');
  const leadFor = (d) => window.__glt(d); // today 기준(모듈 내 new Date() 사용)
  let worst = [];
  for (const [klbl, k] of KNOBS) {
    let mx = { mult: 0 };
    for (const dest of DESTS) {
      for (const [dlbl, d] of DATES) {
        const s = applyStrength(gsi(d, dest).factor, k.s);
        const p = applyStrength(gp(d, dest).factor, k.p);
        const l = applyStrength(leadFor(d), k.l);
        const mult = s * DEP_MAX * l * p; // 최대 출발지
        if (mult > mx.mult) mx = { mult, dest, dlbl, s, p, l };
      }
    }
    console.log(`${klbl}: 최대 변동배수 ${mx.mult.toFixed(3)}  (${mx.dest} · ${mx.dlbl} · season${mx.s.toFixed(2)}×lead${mx.l.toFixed(2)}×peak${mx.p.toFixed(2)}×dep1.16)`);
    worst.push({ klbl, ...mx });
  }

  // 3) 근시일(리드 임박) + 여름 겹침 — 현실 최악(막판 여름 예약)
  console.log('\n=== [C] 리드 임박 + 여름피크 현실 최악(오늘 2026-07-23 기준 근시일) ===');
  for (const nd of ['2026-08-04', '2026-08-10']) {
    const s = gsi(nd, sampleDest).factor, p = gp(nd, sampleDest).factor, l = leadFor(nd);
    console.log(`${nd}: season${s.toFixed(2)} × peak${p.toFixed(2)} × lead${l.toFixed(2)} × dep1.16 = ${(s*p*l*1.16).toFixed(3)} (이코노미, 기본노브)`);
  }

  // 4) 비즈니스 포함 총배수(가장 큰 zone long 4.0) 참고
  console.log('\n=== [D] 참고: 비즈니스석 포함 시(long zone 4.0×) 최악 변동배수 × 4.0 ===');
  const wMax = Math.max(...worst.map(w => w.mult));
  console.log(`이코노미 최악 ${wMax.toFixed(2)} × 비즈 4.0 = ${(wMax*4.0).toFixed(2)} (단, 비즈 배수는 의도된 좌석등급 차이)`);

  console.log('\n(측정 완료 — 판단 근거용. ⚠중복스택 표시는 월시즌·날짜피크가 같은 시기를 이중 반영하는 구간)');
})().catch(e => { console.error('오류:', e); process.exit(1); });

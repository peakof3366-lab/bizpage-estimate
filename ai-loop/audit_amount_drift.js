/* ═══════════════════════════════════════════════════════════════════════════
   고객 금액 표류 감사 — **옛 커밋의 코드로 직접 돌려 대조한다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 지시(견적산출 3분류 개편, 제약 6):
   「고객용 자동견적 산출 결과는 불변이어야 한다. 개편 전후로 동일한 입력을 넣었을 때
     동일한 금액이 나오는지 **수치 대조로 검증**하고 그 결과를 보고한다.」

   ■ 왜 `test_zL`만으로는 부족한가
   `test_zL`은 스냅샷과 대조한다. 그런데 **그 스냅샷도 내가 만든 것**이다 —
   내가 금액을 바꾸고 `--update`를 돌리면 그 검사는 조용히 통과한다.
   이 도구는 다르다: **git에서 옛 커밋의 파일을 그대로 꺼내** 그때 코드로 엔진을 띄우고,
   지금 코드와 같은 입력을 넣어 **두 금액을 직접 비교**한다. 중간에 내가 손댈 자리가 없다.

   ■ ⚠ 사례 목록은 `test_zL`이 진실이다
   여기 다시 적으면 두 도구가 서로 다른 여행을 재게 된다(결함 생성기 ①).
   `test_zL_customer_amounts.js`의 `CASES`를 **소스에서 읽어** 쓴다.

   ■ ⚠ 두 쪽 모두 **운영 요율을 안 얹는다**
   요율은 담당자가 수시로 고친다. 얹으면 「코드가 바꾼 차이」와 「요율이 바뀐 차이」가
   섞여 아무것도 못 가린다. 둘 다 `data.js` 기본값으로 재고, 그래서 차이가 나오면
   그건 **코드가 낸 차이**다.

       node ai-loop/audit_amount_drift.js              # 개편 시작 직전과 대조
       node ai-loop/audit_amount_drift.js <커밋>        # 아무 커밋과나 대조
   ═══════════════════════════════════════════════════════════════════════════ */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
/* 개편(견적산출 3분류)을 시작하기 **직전** 커밋. 바꿀 일이 생기면 인자로 준다. */
const BASE = process.argv.find((a) => !a.startsWith('-') && /^[0-9a-f]{7,40}$/.test(a)) || 'cca1afd';
const FILES = ['data.js', 'company-info.js', 'limits.js', 'rec_fallbacks.js', 'script.js', 'index.html'];

/* 🔴 사례는 `test_zL`에서 읽는다 — 여기 다시 적지 않는다 */
function loadCases() {
  const src = fs.readFileSync(path.join(__dirname, 'test_zL_customer_amounts.js'), 'utf8');
  const i = src.indexOf('const CASES = [');
  const j = src.indexOf('\n];', i);
  if (i < 0 || j < 0) throw new Error('test_zL에서 사례 목록을 못 읽었습니다 — 모양이 바뀌었는지 확인하세요.');
  /* eslint-disable-next-line no-new-func */
  return new Function('return ' + src.slice(i + 'const CASES = '.length, j + 2))();
}

function boot(dir) {
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const dom = new JSDOM(read('index.html'), {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      /* 요율을 못 받게 한다 — 양쪽 모두 data.js 기본값으로 잰다(위 머리말 참조) */
      w.fetch = (u) => (String(u).includes('/api/rates')
        ? Promise.reject(new Error('rates_unreachable')) : new Promise(() => {}));
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    },
  });
  const W = dom.window;
  const APP = ['data.js', 'company-info.js', 'limits.js', 'rec_fallbacks.js', 'script.js'].map(read).join('\n');
  let err = '';
  try { W.eval(APP); } catch (e) { err = e.message; }
  if (typeof W.getBreakdownData !== 'function') throw new Error('엔진이 안 떴습니다 (' + dir + ') ' + err);
  return W;
}

/* 손잡이를 돌리는 규칙은 `_engine_boot.js`의 `run`과 같아야 한다.
   ⚠ 여기서만 다르게 돌리면 이 도구만 다른 것을 잰다 — 그래서 값·기본값을 그대로 옮겼다.
     (옛 커밋의 `_engine_boot`을 쓸 수 없어 불가피하게 한 벌이 더 생긴 자리다.) */
function run(W, t, spec) {
  const d = W.document;
  const s = Object.assign({
    hotelGrade: 'superior', cabinClass: 'economy', roomConfig: 'double',
    incHotel: true, incMeal: true, incVehicle: true, incGuide: true, incSightseeing: true,
  }, spec || {});
  d.getElementById('destination').value = t.dest;
  d.getElementById('participants').value = String(t.pax);
  d.getElementById('days').value = String(t.days);
  d.getElementById('startDate').value = t.date;
  ['incHotel', 'incMeal', 'incVehicle', 'incGuide', 'incSightseeing'].forEach((id) => {
    const e = d.getElementById(id); if (e) e.checked = s[id] !== false;
  });
  ['hotelGrade', 'cabinClass', 'roomConfig'].forEach((n) => {
    let hit = false;
    d.querySelectorAll('input[name="' + n + '"]').forEach((e) => {
      const on = e.value === s[n]; e.checked = on; if (on) hit = true;
    });
    /* 없는 값을 조용히 넘기면 「손잡이를 돌렸다」고 믿으며 기본값으로 잰다 */
    if (!hit) throw new Error('손잡이 값이 없다: ' + n + '=' + s[n]);
  });
  const setN = (id, v) => { const e = d.getElementById(id); if (e) e.value = String(v); };
  setN('bizCount', s.bizCount || 0);
  setN('vipCount', s.vipCount || 0);
  const g = !!s.golf;
  const ge = d.getElementById('incGolf'); if (ge) ge.checked = g;
  setN('golfCount', g ? (s.golfCount || t.pax) : 0);
  setN('golfRounds', g ? (s.golfRounds || 1) : 1);
  return W.getBreakdownData();
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amtdrift-'));
try {
  FILES.forEach((f) => {
    const buf = execSync('git show ' + BASE + ':' + f, { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 });
    fs.writeFileSync(path.join(tmp, f), buf);
  });

  const CASES = loadCases();
  const A = boot(tmp);
  const B = boot(ROOT);

  const rows = CASES.map((c) => {
    let a = null; let b = null; let err = '';
    try { a = run(A, c.t, c.spec); } catch (e) { err = '전: ' + e.message; }
    try { b = run(B, c.t, c.spec); } catch (e) { err += ' 후: ' + e.message; }
    const same = !!a && !!b && a.total === b.total && a.perPerson === b.perPerson;
    return { id: c.id, a: a && a.total, b: b && b.total, same, err };
  });
  const bad = rows.filter((r) => !r.same);

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 고객 금액 표류 감사 — ' + BASE + ' 의 코드 vs 지금');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(' 사례 ' + rows.length + '건 · 양쪽 모두 data.js 기본 요율\n');
  console.log('   목적지·조건                    개편 전          지금');
  rows.forEach((r) => {
    console.log('   ' + r.id.padEnd(24)
      + String(r.a === null ? '—' : r.a.toLocaleString('ko-KR')).padStart(13)
      + String(r.b === null ? '—' : r.b.toLocaleString('ko-KR')).padStart(15)
      + (r.same ? '   ✓' : '   🔴 ' + (r.err || ((r.b - r.a) >= 0 ? '+' : '') + (r.b - r.a).toLocaleString('ko-KR')
        + ' (' + (r.a ? ((r.b - r.a) / r.a * 100).toFixed(2) : '—') + '%)')));
  });

  console.log('\n──────────────────────────────────────────────────────────────────');
  if (!bad.length) {
    console.log(' ✓ **' + rows.length + '건 전부 한 원까지 같습니다.** 고객이 받는 금액은 안 움직였습니다.');
  } else {
    console.log(' 🔴 **' + bad.length + '건의 금액이 움직였습니다.** 의도한 변경인지 확인하세요.');
  }
  console.log(`결과: 같음 ${rows.length - bad.length} / 다름 ${bad.length}`);
  process.exit(bad.length ? 1 : 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

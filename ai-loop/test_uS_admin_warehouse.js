/* US 검증: 일괄로 심은 목적지에서 **담당자 화면이 기본 코스를 잃지 않는다.**

   UQ가 「검토 전」을 만들고 UR이 고객 화면의 병합(recApplyOverride)을 넣었는데,
   관리자 쪽에 같은 규칙을 안 쓰는 자리가 세 곳 남아 있었다. 남겨 두면 이렇게 된다:

     고객 화면 : 기본 코스 2개가 나간다        (UR의 병합이 살렸다)
     담당자 화면: 검토 전 1개만 보인다          (오버라이드를 그대로 읽는다)

   **두 화면이 서로 다른 말을 하는 상태**가 정확히 이 저장소가 RR에서 겪은 사고다
   (결함 생성기 ①). 담당자는 자기 화면에서 사라진 코스가 고객에게 나가는 줄 모른다.

   여기서 고정하는 것:
   ① 편집기에 올라오는 코스 = **창고 전체**(기본값 + 검토 전). 오버라이드만 올리지 않는다.
   ② 후보 모으기(itiLiveCourses)도 같은 규칙. 후보에서 빠지면 「꺼내 쓰라고 만든 창고」가
      정작 기본 코스를 못 꺼낸다.
   ③ 「수정됨」은 **사람이 고친 행에만** 붙는다. 일괄로 심은 행을 수정본이라 부르면
      담당자는 동료가 손본 줄 알고 그대로 둔다 — 검토가 영영 안 일어난다
      (결함 생성기 ③: 안전망이 실행된 적이 없다).
   ④ 사람이 고친 오버라이드는 **예전처럼 대체**다. 담당자가 일부러 지운 기본 코스를
      여기서 되살리면 그 판단을 조용히 뒤집는다.

   ⚠ 소스에 함수 이름이 있는지로 끝내지 않는다 — jsdom으로 실제 화면을 띄워
     목적지를 골라 보고, 화면에 올라온 코스를 센다.

   실행: node ai-loop/test_uS_admin_warehouse.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const day = (n, t) => ({ day: n, title: t, am: t + ' 오전', pm: t + ' 오후', eve: '석식', tip: '' });
/* 심기 도구가 만드는 모양 그대로 — recItinToCourse가 붙이는 칸을 그대로 쓴다 */
const SEEDED = () => ({
  title: '다낭 견적서 일정 (검토 필요)', subtitle: '', highlights: [],
  days: [day(1, '도착'), day(2, '현장'), day(3, '귀국')],
  source: 'quote', sourceNote: '견적서 PDF에서 읽은 일정 (3일)', pending: true,
});
const HUMAN = () => ({
  title: '담당자가 만든 코스', subtitle: '손으로 고침', highlights: ['ㄱ'],
  days: [day(1, '도착'), day(2, '귀국')],
});

/* 편집 화면을 실제로 띄운다. const 전역은 window에 안 붙으므로 선언한 스크립트 블록
   끝에 노출을 심는다(test_uQ·test_uI가 쓰는 것과 같은 방법이다). */
function openAdmin(exposeName, exposeBody) {
  const EXPOSE = '\n;try{ window.' + exposeName + ' = ' + exposeBody + '; }'
    + 'catch(e){ window.__exposeError = String(e); }\n';
  let injected = false;
  const patched = htmlWithDeps('admin.html').replace(
    /(<script(?![^>]*src=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, open, code, close) => {
      if (!injected && /const\s+itiView/.test(code)) { injected = true; return open + code + EXPOSE + close; }
      return m;
    });
  if (!injected) throw new Error('itiView를 선언한 스크립트 블록을 찾지 못했습니다');
  return new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const c = new Proxy({}, { get: () => (() => c) });
      w.HTMLCanvasElement.prototype.getContext = () => c;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
    },
  });
}

(async () => {
  console.log('=== US: 일괄로 심은 목적지에서 담당자 화면이 기본 코스를 잃지 않는다 ===');

  /* ── [1] 편집기·후보가 창고 전체를 본다 ─────────────────────────────── */
  console.log('\n[1] 일괄로 심은 목적지를 열면 무엇이 올라오는가');
  {
    /* ⚠ ITINERARY_DB는 const 전역이라 window에 안 붙는다 — 여기서 함께 꺼낸다.
       못 꺼내면 기본 코스가 0개로 읽혀 아래 검사가 「빈 것끼리 비교」가 된다. */
    const dom = openAdmin('__us', '{ state: itiState, select: itiSelectDest,'
      + ' live: itiLiveCourses, renderState: itiRenderState, db: ITINERARY_DB }');
    await new Promise((r) => setTimeout(r, 80));
    const w = dom.window, d = w.document;
    if (w.__exposeError) throw new Error('주입 실패: ' + w.__exposeError);
    const us = w.__us;

    /* data.js 기본 코스가 실제로 몇 개인지부터 확인한다 — 이 숫자가 0이면 아래
       검사가 통과해도 아무것도 증명하지 못한다(빈 것끼리 비교하게 된다). */
    const baseCount = ((us.db && us.db['다낭']) || []).length;
    ok('다낭에 data.js 기본 코스가 있다 (검사의 전제)', baseCount >= 2, '기본 ' + baseCount + '개');

    /* 심기 도구가 남기는 상태 그대로: 오버라이드에 검토 전 코스 하나뿐 */
    us.state.overrides['다낭'] = [SEEDED()];
    us.select('다낭');

    const cs = us.state.courses;
    const pend = cs.filter((c) => c.pending === true).length;
    const kept = cs.filter((c) => c.pending !== true).length;
    ok('① 편집기에 기본 코스가 그대로 남아 있다', kept === baseCount,
      '기본 ' + kept + '개 (기대 ' + baseCount + ')');
    ok('① 검토 전 코스도 함께 올라온다 (창고니까 보여야 한다)', pend === 1, '검토 전 ' + pend + '개');
    ok('① 기본 코스가 앞, 심은 것이 뒤다 (읽는 순서가 곧 우선순위다)',
      cs.length >= 2 && cs[0].pending !== true && cs[cs.length - 1].pending === true);

    const live = us.live('다낭');
    ok('② 후보 모으기도 같은 목록을 본다', live.length === cs.length,
      '후보 ' + live.length + ' / 편집기 ' + cs.length);

    const stateText = d.getElementById('iti-state').textContent;
    ok('③ 「수정됨」이라고 하지 않는다 (사람이 손댄 적이 없다)', !/수정됨/.test(stateText), stateText);
    ok('③ 검토가 몇 개 기다리는지 말해 준다', /검토 전 1개/.test(stateText), stateText);

    /* ④ 사람이 고친 오버라이드는 예전 그대로 **대체**여야 한다 */
    us.state.overrides['다낭'] = [HUMAN()];
    us.select('다낭');
    ok('④ 사람이 고친 오버라이드는 기본 코스를 대체한다 (되살리지 않는다)',
      us.state.courses.length === 1 && us.state.courses[0].title === '담당자가 만든 코스',
      us.state.courses.map((c) => c.title).join(' | '));
    ok('④ 그때는 「수정됨」이라고 말한다',
      /수정됨/.test(d.getElementById('iti-state').textContent),
      d.getElementById('iti-state').textContent);

    dom.window.close();
  }

  /* ── [2] 규칙을 다시 적은 자리가 남지 않았는가 ──────────────────────── */
  console.log('\n[2] 오버라이드를 코스 목록으로 그냥 읽는 자리가 남았는가');
  {
    const admin = read('admin.html');
    /* ⚠ 개수로 세면 새 자리가 늘어도 통과한다. 줄마다 **무엇에 쓰는지**를 본다 —
       코스 목록으로 쓰지 않는 것(대입·삭제·존재 확인·rec 함수 경유)만 통과시킨다. */
    const OK_RAW = [
      /recApplyOverride\(/,        /* 병합을 지난다 */
      /recOverrideIsEdited\(/,     /* 사람이 고쳤는가 판정 */
      /recPendingCount\(/,         /* 검토 대기 개수 */
      /itiState\.overrides\[[^\]]+\]\s*=/,   /* 저장 결과 캐시(대입) */
      /delete itiState\.overrides\[/,        /* 기본값으로 되돌리기 */
      /if \(!itiState\.overrides\[/,         /* 존재 확인 */
      /\|\| itiState\.overrides\[[^\]]+\] \? '' :/, /* 목록 라벨의 존재 확인 */
      /* 저장 직후 화면 되맞추기 — 그 시점의 오버라이드는 **방금 저장한 병합 목록**이라
         다시 병합할 것이 없다(서버가 정규화해 돌려준 값을 그대로 쓴다). */
      /itiState\.courses = itiClone\(itiState\.overrides\[itiState\.destKey\]\)/,
    ];
    /* ⚠ 한 줄만 보면 안 된다 — 호출이 두 줄에 걸치거나(recApplyOverride(…,
  …))
       판정이 다음 줄에 있는 자리가 실제로 있다. 앞뒤 한 줄까지 함께 보고 판단한다.
       (넓히면 이웃 줄 때문에 새는 경우가 생길 수 있지만, 좁혀 두면 정상 코드가
       계속 걸려 결국 이 검사를 꺼 버리게 된다 — 그게 더 나쁘다.) */
    const lines = admin.split(String.fromCharCode(10));
    const bad = lines.filter((ln, i) => {
      if (!/itiState\.overrides\[/.test(ln)) return false;
      const t = ln.trim();
      if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('//') || t.startsWith('⚠')) return false;
      const ctx = [lines[i - 1] || '', ln, lines[i + 1] || ''].join(String.fromCharCode(10));
      return !OK_RAW.some((re) => re.test(ctx));
    });
    ok('오버라이드를 코스로 쓰는 자리는 전부 병합을 지난다', bad.length === 0,
      bad.map((l) => l.trim().slice(0, 70)).join(' | '));
    ok('옛 방식(오버라이드만 편집기에 올리기)이 남아 있지 않다',
      !/itiState\.overrides\[destKey\] \? itiClone\(itiState\.overrides\[destKey\]\)/.test(admin));
    ok('병합 규칙을 admin이 다시 적지 않았다 (rec_fallbacks 한 곳)',
      !/some\(\(c\) => c && c\.pending !== true\)/.test(admin));
  }

  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

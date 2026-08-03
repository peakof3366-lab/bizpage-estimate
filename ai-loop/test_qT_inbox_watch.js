/* QT 검증: 새 문의·견적을 **화면이 스스로 알아채는가**.

   이 서비스에는 메일·문자 알림이 하나도 없다. 그런데 관리자 화면은 로그인할 때와 탭을
   바꿀 때만 데이터를 다시 읽어서, 하루 종일 켜 둬도 새 문의가 온 것을 알 수 없었다.
   실사용 첫 주에 가장 사고나기 쉬운 지점이라 세 겹으로 표시하게 만들었고, 여기서
   **실제로 그렇게 동작하는지**를 확인한다(원문 정규식 대조가 아니라 실행으로).

   고정하는 것:
   ① 서버 — 집계만 내려주는가(목록을 통째로 주면 데이터가 쌓일수록 느려진다),
      `latest`가 미처리가 아니라 전체 기준인가(먼저 연 사람 때문에 알림이 사라지면 안 된다)
   ② 실패 — 못 읽었을 때 0건으로 보이지 않는가(결함 생성기 ②)
   ③ 첫 확인 — 로그인 직후 기존 건 전부가 '새 것'으로 쏟아지지 않는가
   ④ 그 뒤 — 실제로 새 건이 오면 알리는가
   ⑤ 탭 제목 — 알림 권한이 없어도 보이는 창구가 살아 있는가

   실행: node ai-loop/test_qT_inbox_watch.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const insightsSrc = fs.readFileSync(path.join(ROOT, 'api', 'admin', 'insights.js'), 'utf8');

(async () => {
  console.log('\n[1] 서버 — 가볍게, 그리고 사실대로');
  ok('?type=inbox 분기가 있다', /type === 'inbox'/.test(insightsSrc));
  ok('GET만 받는다', /if \(type === 'inbox'\)[\s\S]{0,120}method !== 'GET'/.test(insightsSrc));
  ok('로그인 없이는 못 부른다(파일 전체가 requireAdmin 뒤에 있다)',
    /module\.exports = async \(req, res\) => \{\s*if \(!\(await requireAdmin\(req, res\)\)\) return;/.test(insightsSrc));
  /* 목록을 통째로 내려주면 데이터가 쌓일수록 매분 호출이 무거워지고, 결국 주기를
     늘리게 되어 알림이 늦어진다. 집계만 내려주는지 고정한다. */
  const inboxFn = (insightsSrc.match(/async function handleInbox[\s\S]*?\n\}/) || [''])[0];
  ok('집계만 조회한다 (select * 로 행을 받아오지 않는다)',
    inboxFn.length > 0 && !/select \*/.test(inboxFn));
  ok('미처리 건수를 센다', /count\(\*\) filter \(where read = false\)/.test(inboxFn));
  ok('견적은 status=new를 미처리로 본다', /count\(\*\) filter \(where status = 'new'\)/.test(inboxFn));
  /* ⚠ latest가 미처리 기준이면, 누가 먼저 열어 '확인'으로 바꾼 순간 그 건이 빠져
     다른 사람에게는 알림이 영영 안 간다. 전체 기준이어야 한다. */
  ok('latest는 전체 기준이다 (먼저 연 사람 때문에 알림이 사라지지 않게)',
    /max\(created_at\) as latest from inquiries/.test(inboxFn)
    && /max\(created_at\) as latest from quotes/.test(inboxFn));
  /* 실패를 0건으로 내려보내면 화면이 "새 문의 없음"으로 읽는다 — 그건 사실이 아니라
     '모른다'는 뜻이다(결함 생성기 ②). 500으로 알리고, 응답에 0을 싣지 않는지 본다. */
  ok('조회 실패를 0건으로 내려보내지 않는다 (500으로 알린다)',
    /catch \(err\)[\s\S]*?res\.status\(500\)/.test(inboxFn)
    && !/catch \(err\)[\s\S]*?pending:\s*0/.test(inboxFn));

  console.log('\n[2] 화면 — 배지·탭 제목이 붙어 있는가');
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;

  const inqBadge = d.getElementById('sb-unread');
  const quoBadge = d.getElementById('sb-new-quotes');
  ok('문의 배지가 있다', !!inqBadge);
  ok('견적 배지가 새로 생겼다', !!quoBadge);
  ok('견적 배지가 견적 관리 메뉴 안에 있다',
    !!quoBadge && quoBadge.closest('.sidebar-item')?.dataset.tab === 'estmgr');
  ok('알림 켜기 안내가 대시보드 안에 있다',
    !!d.getElementById('notify-cta') && d.getElementById('tab-dashboard').contains(d.getElementById('notify-cta')));

  const shown = (el) => el.style.display !== 'none' && el.textContent !== '';

  console.log('\n[3] 로그아웃 상태에서는 서버를 부르지 않는다');
  let calls = 0;
  w.fetch = () => { calls++; return Promise.reject(new Error('불러선 안 됨')); };
  w.__setUser(null);
  await w.__pollInbox();
  ok('로그인 안 했으면 호출하지 않는다', calls === 0, `${calls}회 호출됨`);

  console.log('\n[4] 못 읽었을 때 0건으로 보이지 않는가 (결함 생성기 ②)');
  w.__setUser({ id: '1', role: 'staff', displayName: '직원' });
  w.fetch = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  await w.__pollInbox();
  ok('문의 배지가 "?"로 남는다', inqBadge.textContent === '?', inqBadge.textContent);
  ok('견적 배지도 "?"로 남는다', quoBadge.textContent === '?', quoBadge.textContent);
  ok('모른다는 사실을 툴팁으로 말한다', /불러오지 못했습니다/.test(inqBadge.title || ''), inqBadge.title);

  console.log('\n[5] 기준값이 없으면 알리지 않는다 — 기존 건이 한꺼번에 쏟아지지 않게');
  const fired = [];
  w.Notification = function (title, opts) { fired.push({ title, body: opts && opts.body }); };
  w.Notification.permission = 'granted';

  const reply = (inqLatest, inqPending, quoLatest, quoPending) => () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({
      inquiries: { pending: inqPending, total: 9, latest: inqLatest },
      quotes: { pending: quoPending, total: 9, latest: quoLatest },
    }),
  });

  w.localStorage.removeItem('bizpage_inbox_seen');
  w.fetch = reply('2026-08-03T01:00:00.000Z', 3, '2026-08-03T01:00:00.000Z', 2);
  await w.__pollInbox();
  ok('이 브라우저에서 처음이면 알림이 안 뜬다', fired.length === 0, JSON.stringify(fired));
  ok('배지는 바로 채워진다 (문의 3)', inqBadge.textContent === '3', inqBadge.textContent);
  ok('배지는 바로 채워진다 (견적 2)', quoBadge.textContent === '2', quoBadge.textContent);
  ok('탭 제목에 합계가 붙는다 (3+2=5)', /^\(5\)/.test(d.title), d.title);
  ok('기준 시각을 저장해 둔다 (다음 확인부터 비교하려고)',
    /2026-08-03T01:00/.test(w.localStorage.getItem('bizpage_inbox_seen') || ''),
    w.localStorage.getItem('bizpage_inbox_seen'));

  console.log('\n[5-2] 자리를 비운 사이 들어온 건은 로그인 직후에도 알린다');
  /* ⚠ 여기가 '첫 확인이면 무조건 건너뛴다'로 만들면 안 되는 이유다. 퇴근했다가 아침에
     로그인했을 때 밤새 들어온 문의를 바로 알아야 한다 — 그게 알림의 존재 이유다.
     판단 근거는 '첫 확인인가'가 아니라 '저장해 둔 기준보다 최근인가' 하나여야 한다. */
  w.localStorage.setItem('bizpage_inbox_seen',
    JSON.stringify({ inq: '2026-08-02T09:00:00.000Z', quote: '2026-08-02T09:00:00.000Z' }));
  fired.length = 0;
  w.fetch = reply('2026-08-03T08:00:00.000Z', 5, '2026-08-02T09:00:00.000Z', 2);
  await w.__pollInbox();
  ok('밤새 들어온 문의를 로그인 직후 알린다', fired.some(f => /문의/.test(f.title)), JSON.stringify(fired));
  ok('변화 없는 견적은 알리지 않는다', !fired.some(f => /견적/.test(f.title)));

  /* 다음 절이 기대하는 기준 시각으로 맞춰 둔다 */
  fired.length = 0;
  w.localStorage.setItem('bizpage_inbox_seen',
    JSON.stringify({ inq: '2026-08-03T01:00:00.000Z', quote: '2026-08-03T01:00:00.000Z' }));

  console.log('\n[6] 그 뒤로 새 건이 오면 알린다');
  w.fetch = reply('2026-08-03T02:00:00.000Z', 4, '2026-08-03T01:00:00.000Z', 2);
  await w.__pollInbox();
  ok('새 문의가 오면 알린다', fired.length === 1 && /문의/.test(fired[0].title), JSON.stringify(fired));
  ok('견적은 그대로라 알리지 않는다', fired.filter(f => /견적/.test(f.title)).length === 0);
  ok('탭 제목이 따라 바뀐다 (4+2=6)', /^\(6\)/.test(d.title), d.title);

  w.fetch = reply('2026-08-03T02:00:00.000Z', 4, '2026-08-03T03:00:00.000Z', 5);
  await w.__pollInbox();
  ok('새 견적이 오면 알린다', fired.some(f => /견적/.test(f.title)), JSON.stringify(fired.map(f => f.title)));

  console.log('\n[7] 같은 상태를 다시 확인해도 다시 알리지 않는다');
  const before = fired.length;
  await w.__pollInbox();
  ok('변화가 없으면 조용하다', fired.length === before, `${fired.length - before}건 더 떴다`);

  console.log('\n[8] 처리하면 배지가 사라지고 탭 제목도 돌아온다');
  w.fetch = reply('2026-08-03T02:00:00.000Z', 0, '2026-08-03T03:00:00.000Z', 0);
  await w.__pollInbox();
  ok('문의 배지가 사라진다', !shown(inqBadge), `${JSON.stringify(inqBadge.textContent)} display=${inqBadge.style.display}`);
  ok('견적 배지가 사라진다', !shown(quoBadge));
  ok('탭 제목에서 숫자가 빠진다', !/^\(\d/.test(d.title), d.title);

  console.log('\n[9] 알림 권한이 없어도 탭 제목은 계속 동작한다');
  /* ⚠ 알림에만 기대면 권한을 거부한 사람에게는 예전 상태(아무것도 모름)로 돌아간다.
     탭 제목은 권한과 무관하게 보이는 유일한 창구다. */
  w.Notification.permission = 'denied';
  const before2 = fired.length;
  w.fetch = reply('2026-08-03T05:00:00.000Z', 7, '2026-08-03T03:00:00.000Z', 0);
  await w.__pollInbox();
  ok('권한이 없으면 알림은 안 뜬다', fired.length === before2);
  ok('그래도 탭 제목에는 숫자가 뜬다 (7건)', /^\(7\)/.test(d.title), d.title);
  ok('그래도 사이드바 배지는 뜬다', inqBadge.textContent === '7', inqBadge.textContent);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* admin.html을 실제로 띄우고 감시 함수만 밖으로 꺼낸다. */
async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setUser = (u) => { currentUser = u; };
  window.__pollInbox = () => pollInbox();
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

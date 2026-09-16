/* ═══════════════════════════════════════════════════════════════════════════
   내부직원용 견적 산출 — **출발일 · 귀국일 · 일수가 서로 맞는가**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-16 대표 지적: 「출발일수와 귀국일수를 체크 하는데 그 앞칸에 일수가 맞게
   수정이 안되고 있는 상황이야.」 사실이었다.

   ■ 무엇이 문제였나 (고치기 전 실측)
   🔴 연동이 **한 방향뿐**이었다. `pEnd`의 change 처리는 `dataset.touched = '1'`만 세우고
      **일수를 안 고쳤다.** 담당자가 달력에서 11/10~11/16을 고르면 화면에는 7일이 아니라
      직전 값(5일)이 남았다.
   🔴 그리고 **그 일수가 금액에 그대로 들어간다** — 호텔 박수 · 차량 일수 · 가이드 일당이
      전부 `days`로 계산된다. 즉 아무도 모르는 채 **틀린 금액**이 나갔다.
      (결함 생성기 ②: 폴백이 조용하다 — 화면도 감사 도구도 흔적을 안 남겼다.)
   🔴 게다가 귀국일을 한 번이라도 건드리면 그 `touched` 때문에 `syncEnd()`가 즉시
      return이라, **출발일을 바꿔도 귀국일이 안 따라왔다.** 일정을 통째로 옮기면
      귀국일만 옛 날짜로 남는다.

   ■ 고친 뒤의 규칙 — 고객 화면(`script.js` `initDatePicker`)과 **같다**
     · 귀국일을 고치면 → 일수 = (귀국일 − 출발일) + 1
     · 일수를 고치면   → 귀국일 = 출발일 + 일수 − 1
     · 출발일을 고치면 → **기간을 유지한 채** 귀국일을 민다
     · 귀국일이 출발일보다 앞서면 → 말하고 **아무것도 안 바꾼다**
       (담당자가 방금 고른 값을 지우면 다시 골라야 한다)
     ⚠ 박수만은 손댄 값을 지킨다 — 「기내박이면 하루 적게」가 실무에 있다.

   ■ 재는 방식 — 🔴 **화면을 실제로 띄워서 잰다**
   소스에 핸들러가 있는지만 보면 「달렸는데 값이 안 바뀐다」를 못 잡는다. 그래서
   `admin-quote-pro.html`을 jsdom으로 띄우고 칸을 **실제로 고쳐** 결과를 읽는다.
   ⚠ 날짜는 `ymd()`로만 만든다 — `toISOString()`은 UTC라 한국에서 **하루가 밀린다.**
     이 저장소가 이미 두 번 당한 자리라, 밀렸으면 [3]·[4]가 바로 걸린다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };

/* `<script src>` 자리를 파일 내용으로 바꾼다 — 순서가 곧 동작이다
   (`QuoteEngineHost.mount()`가 `script.js`보다 먼저여야 엔진이 뜬다).
   ⚠ `script.js` 안의 `</script`를 안 바꾸면 문서가 거기서 잘린다. */
function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return m;
    return '<script>' + fs.readFileSync(p, 'utf8').replace(/<\/script/g, '<\\/script') + '</script>';
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(inlineScripts(fs.readFileSync(path.join(ROOT, 'admin-quote-pro.html'), 'utf8')), {
    runScripts: 'dangerously', url: 'http://localhost/admin-quote-pro.html',
    virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = (url) => {
        if (String(url).includes('/api/admin/account')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '검사용 직원' }) });
        }
        return new Promise(() => {});   /* 영원히 안 오는 약속 — 거절로 바꾸면 .catch가 기본 경로가 된다 */
      };
      window.print = () => {};
    },
  });
  const W = dom.window, D = W.document;
  await new Promise((r) => W.addEventListener('load', r));
  await sleep(150);

  ok('[0] 화면이 열렸다 (로그인 게이트 통과)', !D.getElementById('app').classList.contains('hidden'));

  const $ = (id) => D.getElementById(id);
  const fire = (id, type) => $(id).dispatchEvent(new W.Event(type, { bubbles: true }));
  const setDate = (id, v) => { $(id).value = v; fire(id, 'change'); };
  const setNum  = (id, v) => { $(id).value = v; fire(id, 'input'); };
  const days   = () => $('pDays').value;
  const nights = () => $('pNights').value;
  const end    = () => $('pEnd').value;
  const bar    = () => ($('dateState').textContent || '').trim();

  /* ═══ ① 귀국일이 필수 칸과 같은 줄에 있는가 ═══════════════════════════════
     🔴 접힌 「세부 조건」 안에 두었더니 날짜 둘이 떨어져, 고르려면 매번 펼쳐야 하고
     일수와 맞는지도 눈으로 못 봤다. 이 검사가 그 자리를 잠근다. */
  const sec1 = $('sec1');
  ok('[1] 귀국일이 1단계에 있다', !!sec1 && sec1.contains($('pEnd')));
  ok('[1-b] 귀국일이 접힌 칸 **바깥**에 있다', !$('moreCond').contains($('pEnd')));
  ok('[1-c] 박수는 접힌 칸 안이다 (드물게 고친다)', $('moreCond').contains($('pNights')));
  ok('[1-d] 날짜 상태 줄이 있다', !!$('dateState'));

  /* ═══ ② 출발일을 고르면 귀국일이 따라온다 (기간 유지) ═══════════════════ */
  ok('[2] 처음엔 날짜가 비어 있고 무엇을 할지 말한다',
    !$('pStart').value && /출발일을 고르면/.test(bar()), bar());
  setNum('pDays', '5');
  setDate('pStart', '2026-11-10');
  ok('[2-b] 출발일 11/10 · 일수 5 → 귀국일 11/14', end() === '2026-11-14', '귀국일=' + end());
  ok('[2-c] 박수가 4로 따라왔다', nights() === '4', '박수=' + nights());
  ok('[2-d] 상태 줄이 4박 5일이라고 말한다', /4박 5일/.test(bar()), bar());

  /* ═══ ③ 🔴 귀국일을 고치면 **일수가 따라온다** — 이게 빠져 있던 자리 ═══════ */
  setDate('pEnd', '2026-11-16');
  ok('[3] 귀국일 11/16 → 일수가 7이 된다', days() === '7', '일수=' + days());
  ok('[3-b] 박수도 6으로 따라왔다', nights() === '6', '박수=' + nights());
  ok('[3-c] 상태 줄이 6박 7일이라고 말한다', /6박 7일/.test(bar()), bar());

  /* ═══ ④ 출발일을 바꾸면 기간을 유지한 채 귀국일을 민다 ═══════════════════
     🔴 예전엔 귀국일을 한 번 건드린 뒤라 `touched` 때문에 **안 움직였다.** */
  setDate('pStart', '2026-11-20');
  ok('[4] 출발일 11/20 → 귀국일 11/26 (7일 유지)', end() === '2026-11-26', '귀국일=' + end());
  ok('[4-b] 일수는 7 그대로', days() === '7', '일수=' + days());

  /* ═══ ⑤ 일수를 고치면 귀국일이 따라온다 ═══════════════════════════════════ */
  setNum('pDays', '3');
  ok('[5] 일수 3 → 귀국일 11/22', end() === '2026-11-22', '귀국일=' + end());
  ok('[5-b] 박수 2', nights() === '2', '박수=' + nights());

  /* ═══ ⑥ 귀국일이 출발일보다 앞서면 — 말하고 **아무것도 안 바꾼다** ═══════ */
  setDate('pEnd', '2026-11-15');
  ok('[6] 거꾸로 된 날짜를 말한다', /출발일보다 앞섭니다/.test(bar()), bar());
  ok('[6-b] 그 자리에서 알린다 (err 표시)', /err/.test($('dateState').className));
  ok('[6-c] 일수를 건드리지 않는다', days() === '3', '일수=' + days());
  ok('[6-d] 담당자가 고른 귀국일을 지우지 않는다', end() === '2026-11-15', '귀국일=' + end());

  /* ═══ ⑦ 박수는 손댄 값을 지킨다 (기내박) ═════════════════════════════════ */
  setDate('pEnd', '2026-11-26');
  setNum('pNights', '5');          /* 7일인데 5박 — 기내박 */
  setNum('pDays', '8');
  ok('[7] 일수를 바꿔도 손댄 박수를 덮어쓰지 않는다', nights() === '5', '박수=' + nights());
  ok('[7-b] 어긋난 것을 상태 줄이 말한다', /직접 정한 값/.test(bar()), bar());

  /* ═══ ⑧ 🔴 일수가 **금액에 들어간다** — 그래서 이 검사가 필요하다 ═══════════
     날짜를 고쳐 일수가 달라지면 총액도 달라져야 한다. 안 달라지면 일수가 금액까지
     못 가고 있다는 뜻이다(화면만 맞고 계산은 옛 값인 상태). */
  const destSel = $('pDest');
  const dest = Array.from(destSel.options).map((o) => o.value).filter(Boolean)[0];
  destSel.value = dest; fire('pDest', 'change');
  $('pNights').removeAttribute('data-touched');
  setNum('pPax', '10');
  setDate('pStart', '2026-11-10');
  setDate('pEnd', '2026-11-14');           /* 5일 */
  ok('[8] 5일로 맞춰졌다', days() === '5', '일수=' + days());
  $('btnCalc').click();
  await sleep(60);
  const total5 = (W.QuoteEngineHost && $('calcState').textContent) || '';
  const num5 = Number((total5.match(/총액 ([\d,]+)원/) || [0, '0'])[1].replace(/,/g, ''));
  ok('[8-b] 5일 견적이 나왔다', num5 > 0, total5);

  setDate('pEnd', '2026-11-19');           /* 10일 */
  ok('[8-c] 귀국일만 고쳤는데 일수가 10이 됐다', days() === '10', '일수=' + days());
  $('btnCalc').click();
  await sleep(60);
  const total10 = $('calcState').textContent || '';
  const num10 = Number((total10.match(/총액 ([\d,]+)원/) || [0, '0'])[1].replace(/,/g, ''));
  ok('[8-d] 🔴 일수가 늘면 총액도 는다 (일수가 금액까지 간다)',
    num10 > num5, '5일 ' + num5.toLocaleString() + '원 → 10일 ' + num10.toLocaleString() + '원');

  dom.window.close();
}

run().catch((e) => { fails.push('검사가 끝까지 못 갔다 — ' + e.message); }).then(() => {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' 내부직원용 견적 — 출발일 · 귀국일 · 일수가 서로 맞는가');
  console.log('══════════════════════════════════════════════════════════════════');
  fails.forEach((f) => console.log(' ✗ ' + f));
  if (!fails.length) console.log(' ✓ 전부 통과');
  console.log(`결과: ${pass} pass / ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
});

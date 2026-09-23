/* ═══════════════════════════════════════════════════════════════════════════
   내부직원용 견적 산출 — ④단계 **추천 일정 초안**이 깔리는가 (0-ah)
   ───────────────────────────────────────────────────────────────────────────
   ■ 왜 생겼나
   2026-09-17에 「자동 견적 산출 (고객용)」을 대표 지시로 지웠다. 그 화면은 산출이
   끝나면 **목적지 공통 일정을 견적서에 자동으로** 실었다. 지우고 나니 남은 내부직원용은
   ④단계가 **빈 칸**이라, 담당자가 전화를 받으면서 5일치를 처음부터 적어야 했다.
   → 대표 승인(0-ah ㉮)으로 추천 코스를 **초안으로** 깔아 준다.

   ■ 🔴 이 검사가 지키는 것 — 초안은 「편하게」가 아니라 **틀리기 쉬운** 기능이다
   ① **목록을 두 벌로 만들지 않는다**(결함 생성기 ①). 진실은 `data.js`의 `ITINERARY_DB`다.
      화면이 코스를 베껴 적으면 관리자가 고친 내용과 영원히 어긋난다.
   ② **관리자 수정본을 기다렸다가 깐다**(결함 생성기 ②). 안 기다리면 `data.js` 기본
      일정이 깔리는데 **화면은 아무 말도 안 한다** — 담당자는 최신본인 줄 안다.
   ③ **담당자가 적어 둔 글을 덮지 않는다.** 한 번이라도 덮으면 아무도 이 버튼을 안 누른다.
   ④ **못 불러왔으면 말한다.** 그때도 초안은 깔되(일을 세우지 않는다) 기본 일정임을 알린다.

   ■ 재는 방식
   🔴 **화면을 실제로 띄워 산출 버튼을 누르고 칸의 값을 읽는다.** 소스에 코드가 있는지만
     보면 「함수는 있는데 안 불린다」를 못 잡는다(이 저장소가 반복해서 당한 자리).
   ⚠ 일정 오버라이드는 `fetch('/api/content?action=itineraries')`로 들어오므로, 그 응답을
     갈아 끼워 ②④를 **실제로 발동시켜** 본다(결함 생성기 ③: 안전망은 발동시켜 봐야 안다).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else fails.push(n + (x ? ' — ' + x : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRO = fs.readFileSync(path.join(ROOT, 'admin-quote-pro.html'), 'utf8');

/* `<script src>` 자리를 파일 내용으로 바꾼다 — 순서가 곧 동작이다(zU와 같은 방식).
   ⚠ `script.js` 안의 `</script`를 안 바꾸면 문서가 거기서 잘린다. */
function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return m;
    return '<script>' + fs.readFileSync(p, 'utf8').replace(/<\/script/g, '<\\/script') + '</script>';
  });
}

/* 일정 오버라이드 응답만 갈아 끼우며 화면을 띄운다.
   `iti`: undefined(빈 오버라이드) · 객체(오버라이드) · 'fail'(500)
   `delay`: 응답을 늦게 준다 —
     🔴 **이게 없으면 이 검사는 아무것도 안 잡는다.** jsdom에서는 응답이 즉시 와서
     담당자가 산출을 누르기 **전에** 이미 도착해 있다. 그러면 「기다린다」를 지워도
     검사가 통과한다(실제로 지워 보고 확인했다 — 29건이 그대로 통과했다).
     느린 망을 흉내 내 **산출 뒤에 응답이 오게** 만들어야 그 자리가 드러난다. */
async function boot(iti, delay) {
  const dom = new JSDOM(inlineScripts(PRO), {
    runScripts: 'dangerously', url: 'http://localhost/admin-quote-pro.html',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (url) => {
        const u = String(url);
        if (u.includes('/api/admin/account')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: '검사용 직원' }) });
        }
        if (u.includes('action=itineraries')) {
          const 답 = (iti === 'fail')
            ? { ok: false, status: 500, json: () => Promise.resolve({}) }
            : { ok: true, status: 200, json: () => Promise.resolve({ overrides: iti || {}, recOverrides: {}, meta: {} }) };
          if (!delay) return Promise.resolve(답);
          return new Promise((r) => setTimeout(() => r(답), delay));
        }
        /* 나머지는 영원히 안 오는 약속 — 거절로 바꾸면 .catch가 기본 경로가 된다 */
        return new Promise(() => {});
      };
      w.print = () => {};
    },
  });
  const W = dom.window, D = W.document;
  await new Promise((r) => W.addEventListener('load', r));
  await sleep(200);
  const $ = (id) => D.getElementById(id);
  const fire = (id, t) => $(id).dispatchEvent(new W.Event(t, { bubbles: true }));
  const set = (id, v) => { $(id).value = String(v); fire(id, 'input'); fire(id, 'change'); };
  const 산출 = async (dest, days) => {
    const d = new Date(); d.setDate(d.getDate() + 40);
    set('pDest', dest); set('pPax', 20); set('pDays', days);
    set('pStart', d.toLocaleDateString('sv-SE'));
    await sleep(120);
    fire('btnCalc', 'click');
    await sleep(450);
  };
  const cell = (i, k) => {
    const row = D.querySelectorAll('#itiDays .day')[i];
    const el = row && row.querySelector('[data-k="' + k + '"]');
    return el ? el.value : null;
  };
  const 상태 = () => ($('itiDraftState').textContent || '').replace(/\s+/g, ' ').trim();
  return { W, D, $, set, fire, 산출, cell, 상태, dom };
}

/* data.js의 도쿄 코스 — **검사가 값을 베껴 적지 않는다.** 여기서 읽어 화면과 대조한다 */
function 도쿄코스0() {
  const ctx = { window: {}, document: {} };
  require('vm').createContext(ctx);
  require('vm').runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8')
    + ';globalThis.__I = ITINERARY_DB;', ctx);
  return ctx.__I['도쿄'][0];
}

async function run() {
  const 기본 = 도쿄코스0();

  /* ═══ ① 목록을 베껴 적지 않았다 ═══════════════════════════════════════════ */
  ok('[1] 화면이 `ITINERARY_DB`를 읽는다', /ITINERARY_DB/.test(PRO));
  ok('[1-b] 🔴 코스 내용을 화면에 베껴 적지 않았다',
    !PRO.includes(기본.title) && !PRO.includes(기본.days[0].am),
    '화면 소스에 코스 글이 그대로 들어 있다 — 관리자가 고쳐도 안 바뀐다');
  ok('[1-c] 오버라이드를 기다린다', /itineraryOverridesReady/.test(PRO));

  /* ═══ ② 산출하면 초안이 깔린다 ═══════════════════════════════════════════ */
  {
    const B = await boot();
    ok('[2] 화면이 열렸다', !B.$('app').classList.contains('hidden'));
    ok('[2-b] 산출 전에는 일정 칸이 없다', B.D.querySelectorAll('#itiDays .day').length === 0);
    await B.산출('도쿄', 5);
    ok('[2-c] 일수만큼 DAY 칸이 생겼다', B.D.querySelectorAll('#itiDays .day').length === 5,
      String(B.D.querySelectorAll('#itiDays .day').length));
    ok('[2-d] 🔴 DAY1 지역이 data.js 코스와 같다', B.cell(0, 'title') === 기본.days[0].title,
      B.cell(0, 'title') + ' vs ' + 기본.days[0].title);
    ok('[2-e] 오전·오후·저녁까지 깔린다',
      B.cell(0, 'am') === 기본.days[0].am && B.cell(0, 'pm') === 기본.days[0].pm
      && B.cell(0, 'eve') === 기본.days[0].eve, B.cell(0, 'am'));
    ok('[2-f] 현장 Tip이 「참고」로 들어간다', B.cell(0, 'note') === 기본.days[0].tip, B.cell(0, 'note'));
    ok('[2-g] 무엇을 깔았는지 말한다', /채웠습니다/.test(B.상태()), B.상태().slice(0, 80));
    ok('[2-h] 🔴 「그대로 고객에게 나간다」를 말한다', /고객 일정표에 그대로/.test(B.상태()));

    /* ═══ ③ 적어 둔 칸은 덮지 않는다 ═════════════════════════════════════ */
    const am = B.D.querySelectorAll('#itiDays .day')[0].querySelector('[data-k="am"]');
    am.value = '[담당자가 적은 값]';
    am.dispatchEvent(new B.W.Event('input', { bubbles: true }));
    B.fire('btnItiDraft', 'click');
    await sleep(150);
    ok('[3] 🔴 담당자가 적은 값이 그대로 남는다', B.cell(0, 'am') === '[담당자가 적은 값]', B.cell(0, 'am'));
    ok('[3-b] 몇 칸을 그대로 뒀는지 말한다', /그대로 뒀습니다/.test(B.상태()), B.상태().slice(0, 100));
    ok('[3-c] 바꾸는 방법도 말한다 (막다른 안내가 아니다)', /비우고 다시/.test(B.상태()));

    /* ═══ ④ 일정표 문서에 실린다 ═══════════════════════════════════════════ */
    /* ⚠ 2026-09-23: 미리보기 탭이 없어졌다 — 셋을 **쌓아서** 그리므로 누를 것이 없다.
       그냥 ⑤단계를 열면 일정표까지 한 번에 들어 있다. */
    B.D.querySelector('[data-goto="5"]').dispatchEvent(new B.W.Event('click', { bubbles: true }));
    await sleep(250);
    const prev = (B.$('prevBox').textContent || '').replace(/\s+/g, ' ');
    ok('[4] 미리보기 일정표에 그 내용이 나간다', prev.includes(기본.days[1].title), prev.slice(0, 120));
    B.W.close();
  }

  /* ═══ ⑤ 🔴 관리자 수정본을 기다렸다가 쓴다 ═══════════════════════════════
     이게 이 기능에서 가장 틀리기 쉬운 자리다. 오버라이드가 도착하기 **전에** 깔면
     기본 일정이 들어가고, 담당자는 최신본인 줄 안다. */
  {
    const 고친코스 = [{
      title: '[검사] 관리자가 고친 도쿄 코스', subtitle: '고친 설명', highlights: ['고친 포인트'],
      status: 'reviewed', reviewed: true,
      days: [
        { day: 1, title: '고친DAY1지역', am: '고친DAY1오전', pm: '고친DAY1오후', eve: '고친DAY1저녁', tip: '고친DAY1팁' },
        { day: 2, title: '고친DAY2지역', am: '고친DAY2오전', pm: '고친DAY2오후', eve: '고친DAY2저녁', tip: '' },
      ],
    }];
    /* 🔴 **응답을 산출보다 늦게 준다.** 즉시 주면 「기다린다」를 지워도 통과한다 —
       실제로 그 줄을 지워 보고 29건이 그대로 통과하는 것을 확인했다. 늦게 주면
       기다리지 않는 코드는 `data.js` 기본 일정을 깔고 [5]에서 걸린다. */
    const B = await boot({ '도쿄': 고친코스 }, 600);
    await B.산출('도쿄', 3);
    await sleep(500);   /* 응답이 온 뒤 초안이 깔릴 시간 */
    ok('[5] 🔴 관리자가 고친 일정이 깔린다 (기본 일정이 아니다)',
      B.cell(0, 'title') === '고친DAY1지역', B.cell(0, 'title'));
    ok('[5-b] 고른 코스 이름도 고친 것이다',
      /관리자가 고친/.test((B.$('itiCourse').options[0] || {}).textContent || ''),
      (B.$('itiCourse').options[0] || {}).textContent);
    ok('[5-c] 코스보다 일정이 길면 뒤 칸은 비워 둔다', !B.cell(2, 'title'), B.cell(2, 'title'));
    /* 🔴 **한 문구에 걸지 않는다** (2026-09-17). 예전에는 「코스에 없어 비어 있습니다」라는
       **낱말 그대로**를 봤는데, 그러면 문구를 다듬을 때마다 검사가 깨지면서 정작
       「무엇을 말해야 하는가」는 아무도 안 잰다. 대표가 「날짜가 길어지면 왜 더 추가가
       안 되느냐」고 물으신 것이 그 증거다 — 화면은 말하고 있었지만 읽히지 않았다.
       → 재는 것은 **세 가지 사실이 다 적혔는가**다: 코스가 몇 일인지 · 어느 DAY가 비었는지 ·
         비었다는 것. 문구는 바뀌어도 이 셋이 빠지면 걸린다. */
    const 말 = B.상태();
    ok('[5-d] 🔴 코스가 몇 일짜리인지 말한다', /코스는 2일|2일짜리/.test(말), 말.slice(0, 160));
    ok('[5-e] 🔴 어느 DAY가 비었는지 말한다', /DAY\s*3/.test(말), 말.slice(0, 160));
    ok('[5-f] 🔴 비어 있다는 사실을 말한다 (조용히 넘어가지 않는다)',
      /빈칸|비어 있습니다/.test(말), 말.slice(0, 160));
    B.W.close();
  }

  /* ═══ ⑥ 못 불러왔을 때 — 깔되 말한다 ═══════════════════════════════════ */
  {
    const B = await boot('fail');
    await B.산출('도쿄', 3);
    ok('[6] 못 불러와도 기본 일정으로 초안은 깔린다 (일을 세우지 않는다)',
      B.cell(0, 'title') === 기본.days[0].title, B.cell(0, 'title'));
    ok('[6-b] 🔴 기본 일정이라는 사실을 말한다', /못 불러왔습니다/.test(B.상태()), B.상태().slice(0, 160));
    ok('[6-c] 경고로 보이게 표시한다', B.$('itiDraftState').classList.contains('note-err'));
    ok('[6-d] 코스가 3일보다 길면 안 실은 만큼 말한다', /안 실었습니다/.test(B.상태()), B.상태().slice(0, 160));
    B.W.close();
  }

  /* ═══ ⑦ 코스가 없는 목적지 — 잠그되 **왜** 잠겼는지 말한다 ═══════════════
     지금은 60곳 모두 코스가 있다. 새 목적지를 넣으면 그날 이 자리가 처음 열린다
     (목적지 추가는 실제로 여러 번 있었다). 그래서 지금 미리 재 둔다. */
  {
    const B = await boot();
    B.W.eval("delete ITINERARY_DB['도쿄'];");
    B.set('pDest', '도쿄');
    await sleep(120);
    ok('[7] 코스가 없으면 버튼이 잠긴다', B.$('btnItiDraft').disabled === true);
    ok('[7-b] 🔴 왜 잠겼는지 칸이 스스로 말한다',
      /추천 일정이 없습니다/.test((B.$('itiCourse').options[0] || {}).textContent || ''),
      (B.$('itiCourse').options[0] || {}).textContent);
    await B.산출('도쿄', 3);
    ok('[7-c] 그래도 DAY 칸은 만들어진다 (직접 적을 수 있다)',
      B.D.querySelectorAll('#itiDays .day').length === 3);
    ok('[7-d] 초안이 없다고 터지지 않는다', B.cell(0, 'title') === '', String(B.cell(0, 'title')));
    B.W.close();
  }

  /* ═══ ⑧ 금액과 무관하다 ═══════════════════════════════════════════════
     일정은 문서 내용이지 계산이 아니다. 초안을 깔기 전후로 총액이 움직이면 안 된다. */
  {
    const B = await boot();
    await B.산출('도쿄', 4);
    const 산출직후 = (B.$('calcState').textContent || '');
    B.fire('btnItiDraft', 'click');
    await sleep(150);
    ok('[8] 초안을 깔아도 총액이 그대로다', (B.$('calcState').textContent || '') === 산출직후,
      산출직후 + ' → ' + B.$('calcState').textContent);
    ok('[8-b] 총액이 실제로 찍혀 있었다 (빈 값끼리 비교한 게 아니다)',
      /총액/.test(산출직후), 산출직후);
    B.W.close();
  }

  console.log('\n' + '─'.repeat(64));
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('결과: ' + pass + ' pass / ' + fails.length + ' fail  — ZV 추천 일정 초안');
  process.exit(fails.length ? 1 : 0);
}

run().catch((e) => { console.error('터짐:', e); process.exit(1); });

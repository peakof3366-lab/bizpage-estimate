/* ═══════════════════════════════════════════════════════════════════════════
   XM — 「링크 복사」가 **카카오톡에서 죽는다**
   ───────────────────────────────────────────────────────────────────────────
   고객이 견적서를 받는 마지막 걸음은 「링크 복사」다. 그 버튼은 이렇게만 돼 있었다:

       navigator.clipboard.writeText(...).then(() => 버튼을 「복사됨!」으로)

   🔴 `navigator.clipboard`는 **https가 아니거나, 카카오톡·네이버 인앱 브라우저 같은
     곳에서는 아예 없다.** 그러면 그 줄에서 예외가 나고 — `.catch`도 없어서 —
     **버튼이 아무 반응 없이 죽는다.** 하필 우리 고객은 링크를 **카톡으로 주고받고
     카톡에서 연다.** 가장 흔한 자리에서 못 쓰는 버튼이었다.

   → 세 겹으로 고쳤다:
       ① 표준 clipboard API
       ② 옛 `document.execCommand('copy')`
       ③ **주소를 선택해 주고** 「길게 눌러 복사해 주세요」라고 **말한다**
     안 되면 안 된다고 말하는 것이 마지막 겹이다(조용한 실패 금지 — 결함 생성기 ②).

   ⚠ 이 검사가 성립하려면 **팝업 안의 스크립트가 실제로 돌아야** 한다. jsdom은
     `document.write`로 들어온 `<script>`를 실행하지 않아서(직접 확인), 그대로 두면
     팝업의 모든 버튼이 「죽은 버튼」으로 보인다 — 화면 결함과 구별이 안 된다.
     `_page_boot.js`가 문서를 닫는 시점에 대신 돌려 준다.
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const { bootPage, visibleText, ROOT } = require('./_page_boot');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XM 링크 복사`);
  process.exit(fail ? 1 : 0);
};

console.log('\n[1] 소스에 남아 있으면 안 되는 것');
{
  const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  /* 예전 코드는 catch 없이 clipboard 하나만 불렀다 */
  ok('① 인라인 clipboard 호출이 버튼에 박혀 있지 않다',
    !/onclick="\(function\(\)\{navigator\.clipboard/.test(src));
  ok('① 폴백 함수가 있다', /function shareCopyLink\(\)/.test(src));
  ok('① execCommand 폴백이 있다', /document\.execCommand\('copy'\)/.test(src));
  ok('① 안내 문구가 있다', /길게 눌러/.test(src));
  /* ⚠ 팝업 문서는 통째로 템플릿 문자열이라, **주석에 backtick 하나만 잘못 들어가도
     그 자리에서 문자열이 끊겨 `script.js` 전체가 죽는다**(이번에 실제로 한 번 죽였다 —
     계산기가 통째로 안 뜬다). 개수를 세는 것은 답이 아니다(중첩 템플릿이 정상적으로
     여럿 있다). **파싱이 되는지**를 본다 — 그게 진짜 조건이다. */
  ok('① script.js가 문법 오류 없이 파싱된다', (() => {
    try { new Function(src); return true; } catch (e) { return false; }
  })(), '템플릿 문자열이 끊겼을 수 있다');
}

(async () => {
  const B = bootPage('index.html');
  const { win, doc, log, tick } = B;
  await B.ready; await tick(250);

  const dep = new Date(); dep.setDate(dep.getDate() + 90);
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new win.Event('change', { bubbles: true })); } };
  set('destination', '다낭'); set('participants', '30'); set('days', '4');
  set('startDate', dep.toLocaleDateString('sv-SE'));
  doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
    if (String(el.value || '').trim()) return;
    if (el.tagName === 'SELECT') el.value = el.options[el.options.length - 1].value;
    else if (el.type === 'tel') el.value = '010-1234-5678';
    else el.value = '테스트';
  });
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick(250);
  doc.getElementById('downloadEstimate').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
  await tick(400);

  console.log('\n[2] 팝업이 열리고 링크가 나온다');
  const w = log.opened[0];
  ok('② 새 창이 열렸다', !!w);
  if (!w) return done();
  const d2 = w.document;
  ok('② 팝업 안 스크립트가 실제로 돌았다(하네스 확인)', typeof w.shareCopyLink === 'function');
  const inp = d2.getElementById('share-url-inp');
  ok('② 링크 칸에 견적서 주소가 들어 있다', !!inp && /estimate-view\.html\?id=/.test(inp.value), inp && inp.value);

  console.log('\n[2-b] 🔴 인쇄되는 문서에도 **견적번호**가 있는가');
  {
    /* 이 창에서 바로 「이 견적서 인쇄하기」를 누르는 고객이 있다. 그 종이에 번호가
       없으면 전화가 왔을 때 **고객도 우리도 무엇에 대한 이야기인지 못 찾는다**
       (WB가 번호를 만든 이유가 그것이다). 링크로 여는 견적서에만 있었다. */
    const docText = visibleText(d2.getElementById('quote'));
    ok('②b 견적서 문서에 번호가 찍힌다', /견적번호 Q-260826-001/.test(docText),
      docText.slice(0, 80));
    ok('②b 발행일도 함께 있다', /\d{4}년 \d{1,2}월 \d{1,2}일/.test(docText));
  }

  const press = async () => {
    d2.getElementById('copy-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
    await new Promise((r) => w.setTimeout(r, 60));
    return {
      label: d2.getElementById('copy-btn').textContent,
      help: d2.getElementById('copy-help').style.display,
    };
  };

  console.log('\n[3] ① 표준 API가 되는 브라우저');
  {
    let copied = null;
    w.navigator.clipboard = { writeText: (t) => { copied = t; return Promise.resolve(); } };
    const r = await press();
    ok('③ 주소가 복사된다', copied === inp.value, String(copied));
    ok('③ 「복사됨!」이라고 말한다', /복사됨/.test(r.label), r.label);
    ok('③ 수동 안내는 안 뜬다(정상일 땐 조용하다)', r.help === 'none', r.help);
  }

  console.log('\n[4] ② 권한이 거절되는 브라우저 — 옛 방식으로 한 번 더');
  {
    w.navigator.clipboard = { writeText: () => Promise.reject(new Error('denied')) };
    d2.execCommand = () => true;
    const r = await press();
    ok('④ 그래도 복사됐다고 말한다', /복사됨/.test(r.label), r.label);
  }

  console.log('\n[5] 🔴 ③ 카카오톡 인앱 — clipboard도 execCommand도 없는 곳');
  {
    delete w.navigator.clipboard;
    d2.execCommand = () => false;
    const r = await press();
    ok('⑤ 조용히 죽지 않는다', r.label !== '링크 복사', r.label);
    ok('⑤ 「직접 복사」라고 말한다', /직접 복사/.test(r.label), r.label);
    ok('⑤ 길게 눌러 복사하라고 안내한다', r.help === 'block', r.help);
    ok('⑤ 안내 문구가 화면에 실제로 보인다',
      /길게 눌러/.test(visibleText(d2.getElementById('copy-help'))));
    /* 선택까지 해 준다 — 안 그러면 「길게 눌러」가 한 번에 안 된다 */
    ok('⑤ 주소를 선택해 둔다', inp.selectionEnd === inp.value.length,
      inp.selectionStart + '~' + inp.selectionEnd);
  }

  console.log('\n[6] 팝업의 다른 버튼도 살아 있다');
  {
    const before = log.printed;
    d2.querySelector('.btn-print').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
    await tick(40);
    ok('⑥ 「견적서 인쇄」가 인쇄를 부른다', log.printed === before + 1);

    const modal = d2.getElementById('share-modal');
    d2.querySelector('.btn-share').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
    await tick(40);
    ok('⑥ 「고객 링크 공유」가 창을 연다', modal && modal.style.display === 'flex', modal && modal.style.display);

    d2.querySelector('.btn-close').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
    await tick(40);
    ok('⑥ 「닫기」가 창을 닫는다', w.closed === true, String(w.closed));
  }

  console.log('\n[6-b] 번호를 못 받았으면 **자리를 접는다**');
  {
    /* 옛 서버·부분 응답에서 번호가 없을 수 있다. 「견적번호 undefined」가 찍히면
       그게 더 나쁘다 — 없는 것은 안 보이는 쪽이 맞다. */
    const N = bootPage('index.html', { fixtures: { shares: { ok: true, id: 'noqno', verdict: 'verified' } } });
    await N.ready; await N.tick(250);
    const setN = (id, v) => { const el = N.doc.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new N.win.Event('change', { bubbles: true })); } };
    setN('destination', '다낭'); setN('participants', '30'); setN('days', '4');
    setN('startDate', dep.toLocaleDateString('sv-SE'));
    N.doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
      if (String(el.value || '').trim()) return;
      if (el.tagName === 'SELECT') el.value = el.options[el.options.length - 1].value;
      else if (el.type === 'tel') el.value = '010-1234-5678';
      else el.value = '테스트';
    });
    N.doc.getElementById('estimateForm').dispatchEvent(new N.win.Event('submit', { bubbles: true, cancelable: true }));
    await N.tick(250);
    N.doc.getElementById('downloadEstimate').dispatchEvent(new N.win.MouseEvent('click', { bubbles: true, cancelable: true, view: N.win }));
    await N.tick(400);
    const nw = N.log.opened[0];
    const el = nw && nw.document.getElementById('doc-qno');
    ok('⑥b 번호 자리가 접혀 있다', !!el && el.style.display === 'none', el && el.style.display);
    ok('⑥b 「undefined」가 찍히지 않는다',
      !/견적번호/.test(visibleText(nw.document.getElementById('quote'))));
  }

  console.log('\n[7] 팝업이 막힌 브라우저 — 그냥 아무 일도 안 일어나면 안 된다');
  {
    const C = bootPage('index.html');
    await C.ready; await C.tick(250);
    C.win.open = () => null;             /* 팝업 차단 */
    const set2 = (id, v) => { const el = C.doc.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new C.win.Event('change', { bubbles: true })); } };
    set2('destination', '다낭'); set2('participants', '30'); set2('days', '4');
    set2('startDate', dep.toLocaleDateString('sv-SE'));
    C.doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
      if (String(el.value || '').trim()) return;
      if (el.tagName === 'SELECT') el.value = el.options[el.options.length - 1].value;
      else if (el.type === 'tel') el.value = '010-1234-5678';
      else el.value = '테스트';
    });
    C.doc.getElementById('estimateForm').dispatchEvent(new C.win.Event('submit', { bubbles: true, cancelable: true }));
    await C.tick(250);
    C.doc.getElementById('downloadEstimate').dispatchEvent(new C.win.MouseEvent('click', { bubbles: true, cancelable: true, view: C.win }));
    await C.tick(200);
    ok('⑦ 팝업이 막히면 그렇게 말해 준다',
      C.log.says.some((s) => /팝업/.test(s.text)), JSON.stringify(C.log.says.map((s) => s.text)));
    ok('⑦ 무엇을 하면 되는지도 말한다',
      C.log.says.some((s) => /허용/.test(s.text)), JSON.stringify(C.log.says.map((s) => s.text)));
  }

  done();
})();

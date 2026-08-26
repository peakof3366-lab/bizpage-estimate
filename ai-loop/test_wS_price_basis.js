/* ═══════════════════════════════════════════════════════════════════════════
   WS — **같은 금액이 화면마다 같은 뜻이어야 한다**

   ■ 🔴 ① 견적서가 자기 항목표와 모순된 말을 하고 있었다

   맞춤 견적서 총액 밑에 「VAT 별도 · **부대비용 미포함**」이 찍혔다. 그런데
   2026-08-13(TP)부터 엔진은 **「현장 부대비용」을 항목으로 넣어 총액에 포함**한다
   (기관 섭외·통역·국내수송·행사운영 — 코퍼스 46건에서 견적서 돈의 12.4%가 여기다).
   즉 **바로 위 항목표에 그 줄이 보이는 채로** 아래에서 「미포함」이라고 말했다.
   TP가 항목을 더할 때 이 문구를 안 고쳤고, 그 뒤 아무도 두 자리를 함께 세지 않았다.

   ■ 🔴 ② VAT 표기가 첫 화면에만 없었다

     계산기(index.html)      : 「예상 총액」           ← VAT 이야기 없음
     인쇄용 견적 창(script.js): 「예상 총액 (VAT 별도)」
     고객 견적서             : 「VAT 별도」

   고객은 계산기에서 본 숫자를 최종가로 이해했다가 견적서에서 다른 기준을 읽는다.
   20명 견적이면 그 차이가 수백만 원이다.

   ■ 이 검사가 지키는 것

     ① 「부대비용 미포함」이 **고객에게 보이는 글자로는** 다시 안 나온다
        (설명 주석은 남아 있어도 된다 — 화면 글자만 본다)
     ② 세 자리의 VAT 표기가 **같이 간다**
     ③ 그런데 「현장 부대비용」은 여전히 **항목으로 총액에 들어간다**
        — 문구를 고친다고 계산을 건드리면 안 된다
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const visible = (html) => html
  .replace(/<!--[\s\S]*?-->/g, '')          /* HTML 주석 */
  .replace(/\$\{\/\*[\s\S]*?\*\/''\}/g, '') /* 템플릿 안 주석 */
  .replace(/\/\*[\s\S]*?\*\//g, '');        /* JS 주석 */

console.log('\n[1] 🔴 「부대비용 미포함」이 고객 글자에서 사라졌다');
{
  const view = visible(read('estimate-view.html'));
  ok('① 견적서에 안 남았다', !/부대비용\s*미포함/.test(view),
    (view.match(/.{0,40}부대비용\s*미포함.{0,20}/) || [''])[0]);
  /* ⚠ 설명은 남아 있어야 한다 — 왜 지웠는지가 사라지면 누군가 되돌린다 */
  ok('① 왜 지웠는지는 주석에 남아 있다', /부대비용 미포함/.test(read('estimate-view.html')));
  ok('① 매뉴얼도 같이 고쳤다', !/「VAT 별도 · 부대비용 미포함」/.test(visible(read('manual.html'))));
}

console.log('\n[2] VAT 표기가 세 자리에서 같이 간다');
{
  ok('② 계산기 화면', /예상 총액 \(VAT 별도\)/.test(visible(read('index.html'))));
  ok('② 인쇄용 견적 창', /예상 총액 \(VAT 별도\)/.test(visible(read('script.js'))));
  ok('② 고객 견적서', /'VAT 별도'/.test(visible(read('estimate-view.html'))));
  /* ⚠ 패키지에는 이 문구가 안 붙는다 — 상품가에 다 들어 있다(VR) */
  ok('② 🔴 패키지 견적서에는 안 붙는다',
    /d\.pkg[\s\S]{0,200}패키지 상품가[\s\S]{0,120}'VAT 별도'/.test(visible(read('estimate-view.html'))));
}

console.log('\n[3] 🔴 문구를 고쳤다고 계산이 바뀌면 안 된다');
{
  /* 「현장 부대비용」은 여전히 rows에 들어가고 총액에 포함된다 */
  const s = read('script.js');
  ok('③ 부대비용이 항목으로 들어간다', /rows\.push\(\{\s*\n?\s*name: \(typeof ANCILLARY/.test(s)
    || /ANCILLARY\.label : '현장 부대비용'/.test(s));
  ok('③ 그 항목이 숨김이 아니다 (고객에게 보인다)',
    !/현장 부대비용[\s\S]{0,200}muted:\s*true/.test(s));
  ok('③ 부대비용 기준이 지상비라는 근거가 남아 있다', /기준은 지상비다/.test(s));
}

console.log('\n[4] 🔴 실제로 그려서 확인한다 — 견적서 총액 밑 문구');
{
  const BASE = {
    dk: '방콕', dt: '방콕', n: 20, d: 5, ng: 4, sd: '2026-11-01',
    t: 46973139, pp: 2348657, iso: '2026-08-26', qno: 'Q260826-01',
    ptx: '산업시찰', vm: '기관 방문', ot: '기업', hgl: '4성급', sl: '평시',
    rows: [['항공', 9000000], ['현장 부대비용', 5600000]],
    org: '한빛산업', cn: '김보균',
  };
  const dom = new JSDOM(read('estimate-view.html'), {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
    url: 'https://bizpage-estimate.vercel.app/estimate-view.html?id=t1',
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {}; w.print = () => {};
      w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BASE) });
    },
  });
  const w = dom.window;
  const finish = () => setTimeout(() => {
    const clone = w.document.body.cloneNode(true);
    clone.querySelectorAll('script,style').forEach((e) => e.remove());
    const vis = clone.textContent;
    ok('④ 화면이 그려졌다', /방콕/.test(vis));
    ok('④ 🔴 「부대비용 미포함」이 안 보인다', !/부대비용\s*미포함/.test(vis),
      (vis.match(/.{0,30}부대비용.{0,20}/) || [''])[0]);
    ok('④ 「현장 부대비용」 항목은 그대로 보인다', /현장 부대비용/.test(vis));
    ok('④ 「VAT 별도」는 남아 있다', /VAT 별도/.test(vis));
    console.log('\n' + '─'.repeat(64));
    console.log(`결과: ${pass} pass / ${fail} fail  — WS 금액의 뜻`);
    process.exit(fail ? 1 : 0);
  }, 300);
  if (w.document.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

/* ═══════════════════════════════════════════════════════════════════════════
   VU — 소규모 견적 만들기: **실제로 눌러 본다**
   ───────────────────────────────────────────────────────────────────────────
   VS는 규칙이 소스에 있는지를 봤다. 이 검사는 **버튼을 눌러 값이 들어오는지**를 본다.
   둘은 다른 이야기다 — 실제로 VS를 통과한 상태에서 아래 둘이 남아 있었다:

     🔴 **1회용 견적의 ID를 사람이 지어내야 했다.** 영문·숫자만 받는 칸이라
        「adhoc-kim-0824」를 손님 앞에서 짜고 있어야 했다. 상품(catalog)은 나중에
        다시 편집하고 CLI로 골라 쓰기도 해서 이름이 뜻을 갖지만, 1회용은 한 번 쓰고
        끝이라 아무 뜻도 없다. → 자동으로 붙인다(겹치면 다시 뽑는다 — upsert가 남의
        견적을 덮어쓰기 때문이다).
     🔴 **「금액 확인일」이 1회용에도 빈칸으로 요구됐다.** 그 칸의 뜻이 출처마다 갈린다:
          대리점가   = 공급사가 그 값을 확인해 준 날 → 확인해야 알 수 있다
          담당자 산출 = 우리가 그 값을 만든 날      → 지금 만들고 있으니 오늘이 사실이다
        VP가 「오늘로 미리 채우지 않는다」를 세운 이유는 **확인 안 한 날짜가 굳는 것**을
        막으려던 것이라, 사람이 직접 만드는 값에는 그 위험이 없다.
        → 담당자 산출일 때만 채우고, 대리점가로 바꾸면 **자동으로 넣은 값을 비운다.**
        ⚠ 사람이 직접 넣은 값은 건드리지 않는다(`dataset.auto`가 그것을 가른다).

   ⚠ **이 검사를 짜다가 오진을 한 번 했다.** data.js를 안 싣고 열었더니 admin의
     top-level 코드가 `destFieldMap is not defined`로 죽어서 **DOMContentLoaded 등록이
     통째로 안 붙었다.** 그 상태로 재니 「종류가 catalog다·ID가 비어 있다」가 전부
     통과로 보였다 — 실은 아무 핸들러도 안 붙어 **기본값**을 읽고 있었다.
     → 그래서 아래 [0]에서 **스크립트가 살아 있는지 먼저 확인하고, 아니면 즉시 실패**한다.
       이 순서가 없으면 이 파일은 「늘 통과하는 검사」가 된다(결함 생성기 ③).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — VU 소규모 견적 만들기(실제 조작)`);
  process.exit(fail ? 1 : 0);
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  /* data.js를 실제로 싣는다 — 안 싣으면 위 머리말의 오진이 그대로 재현된다 */
  resources: 'usable',
  url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
  virtualConsole: new (require('jsdom').VirtualConsole)(),  /* CDN 실패 소음을 삼킨다 */
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
  },
});

const w = dom.window, d = w.document;
const val = (id) => d.getElementById(id).value;
const txt = (id) => (d.getElementById(id).textContent || '');

const today = (() => {
  const t = new Date(), p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
})();

function run() {
  console.log('\n[0] 🔴 스크립트가 살아 있는가 — 이걸 먼저 안 보면 기본값을 읽는다');
  if (typeof w.switchTab !== 'function') {
    fail++;
    console.log('  ✗ 관리자 스크립트가 죽었다 — 아래 검사는 의미가 없어 여기서 멈춘다');
    return done();
  }
  ok('⓪ 관리자 스크립트가 살아 있다(data.js가 실렸다)', true);
  ok('⓪ 소규모 버튼이 실제로 배선돼 있다', !!d.getElementById('pkgNewAdhoc'));

  console.log('\n[1] 「+ 소규모 견적」을 누른 직후');
  d.getElementById('pkgNewAdhoc').click();
  ok('① 편집 칸이 열린다', d.getElementById('pkgEditCard').style.display !== 'none');
  ok('① 종류가 소규모로 선다', val('pkgKind') === 'adhoc', val('pkgKind'));
  ok('① 출처가 담당자 산출로 선다', val('pkgBasis') === 'assembled', val('pkgBasis'));
  ok('① ID가 자동으로 붙는다', /^adhoc-\d{6}-[a-z0-9]{3,}$/.test(val('pkgId')), val('pkgId'));
  ok('① ID 칸이 잠긴다(무엇을 적을지 고민하지 않게)', d.getElementById('pkgId').readOnly === true);
  ok('① 산출일이 오늘로 채워진다', val('pkgAsOf') === today, val('pkgAsOf') + ' vs ' + today);
  ok('① 라벨이 「산출일」이라고 말한다', /산출일/.test(txt('pkgAsOfLbl')));
  ok('① 고객 목록에 안 나간다고 화면이 말한다', /고객 목록에 나가지 않습니다/.test(txt('pkgKindNote')));
  ok('① 발급은 아직 막혀 있다(먼저 저장해야 한다)', d.getElementById('pkgIssue').disabled === true);
  ok('① 왜 막혔는지 말한다', /먼저 저장/.test(txt('pkgIssueGate')));

  console.log('\n[2] 출처를 「대리점가」로 바꾸면 자동 날짜를 비운다');
  const basis = d.getElementById('pkgBasis');
  basis.value = 'agency'; basis.dispatchEvent(new w.Event('change'));
  ok('② 자동으로 넣은 날짜를 비운다(확인한 날로 둔갑하지 않는다)', val('pkgAsOf') === '', val('pkgAsOf'));
  ok('② 라벨이 「금액 확인일」로 바뀐다', /금액 확인일/.test(txt('pkgAsOfLbl')));

  console.log('\n[3] 사람이 직접 넣은 날짜는 건드리지 않는다');
  d.getElementById('pkgAsOf').value = '2026-08-01';
  basis.value = 'assembled'; basis.dispatchEvent(new w.Event('change'));
  basis.value = 'agency'; basis.dispatchEvent(new w.Event('change'));
  ok('③ 사람이 넣은 값은 그대로 남는다', val('pkgAsOf') === '2026-08-01', val('pkgAsOf'));

  console.log('\n[4] 항목별 조립 — 합이 그 자리에서 보인다');
  const items = d.getElementById('pkgItems');
  items.value = '항공 | 620,000원\n호텔 3박 | 380000\n읽을 수 없는 줄';
  items.dispatchEvent(new w.Event('input'));
  const sum = txt('pkgItemsSum');
  ok('④ 쉼표·「원」이 섞여도 합을 낸다', /1,000,000원/.test(sum), sum.trim());
  ok('④ 읽을 수 없는 줄은 안 센다', /항목 2개/.test(sum), sum.trim());
  ok('④ 합이 1인 금액을 덮어쓴다고 말한다', /덮어씁니다/.test(sum));

  console.log('\n[5] 「+ 새 상품」은 예전 규칙 그대로다 — 약화시키지 않았는지');
  d.getElementById('pkgNew').click();
  ok('⑤ 종류가 상품으로 선다', val('pkgKind') === 'catalog', val('pkgKind'));
  ok('⑤ ID는 비어 있다(상품은 사람이 뜻 있는 이름을 짓는다)', val('pkgId') === '', val('pkgId'));
  ok('⑤ ID 칸이 열려 있다', d.getElementById('pkgId').readOnly === false);
  /* 🔴 VP의 핵심 규칙 — 확인도 안 한 날짜가 굳는 것을 막는 유일한 장치다 */
  ok('⑤ 금액 확인일을 미리 채우지 않는다 (VP 규칙 유지)', val('pkgAsOf') === '', val('pkgAsOf'));
  ok('⑤ 라벨이 「공급사에게 확인한 날」이라고 묻는다', /공급사에게 확인한 날/.test(txt('pkgAsOfLbl')));

  console.log('\n[6] 자동 ID가 겹치지 않는다');
  const seen = new Set();
  for (let i = 0; i < 40; i++) { d.getElementById('pkgNewAdhoc').click(); seen.add(val('pkgId')); }
  ok('⑥ 40번 만들어도 전부 다른 ID다', seen.size === 40, seen.size + '개');

  done();
}

/* data.js·DOMContentLoaded가 끝난 뒤에 잰다 */
w.addEventListener('load', () => setTimeout(run, 30));
setTimeout(() => {
  fail++;
  console.log('  ✗ load 이벤트가 오지 않았다 — 페이지가 뜨지 못했다');
  done();
}, 25000);

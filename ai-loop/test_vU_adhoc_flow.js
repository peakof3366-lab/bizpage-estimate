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
const { adminSource } = require('./_admin_source');

const ROOT = path.join(__dirname, '..');
const html = adminSource();

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
  if (!w.pkgOpen) { fail++; console.log('  ✗ ⓪ pkgOpen이 없다 — 아래는 의미가 없다'); return done(); }
  ok('⓪ 관리자 스크립트가 살아 있다(data.js가 실렸다)', true);

  /* 🔴 **2026-09-17: 「+ 소규모 견적」 버튼으로 시작하던 흐름이 없어졌다**(대표 지시 —
     직접 견적 작성이 마법사가 됐다). 그 버튼·목록·종류 보기를 전부 걷어냈으므로
     아래 검사도 **패키지 상품 쪽에서** 연다.

     ⚠ **이 파일이 혼자 들고 있던 규칙 하나를 살려 둔다** — 「금액의 출처」를 바꿀 때의
       날짜 처리다. 화면을 걷어낼 때 그 화면이 혼자 지키던 안전망이 같이 사라지는 것이
       이 저장소가 반복해서 당한 유형이라, 지우기 전에 무엇이 남는지 세어 보고 옮겼다.
     ⚠ 없어진 규칙(자동 ID·1회용 상태 라벨·항목별 조립)은 **닿을 길이 없어 안 잰다.**
       소스에는 그대로 있다(`pkgNewAdhocId`·`pkgSyncNotes`의 adhoc 분기). */
  w.pkgOpen(null, 'catalog');
  ok('⓪ 편집 칸이 열린다', d.getElementById('pkgEditCard').style.display !== 'none');

  console.log('\n[1] 🔴 출처를 「대리점가」로 바꾸면 자동 날짜를 비운다');
  /* 담당자가 만든 날을 **「공급사에게 확인한 날」로 둔갑시키지 않는다.** 그 날짜가
     견적서에 찍히고 유효기간 판단에 쓰이므로, 뜻이 다른 값을 물려받으면 안 된다. */
  const basis = d.getElementById('pkgBasis');
  basis.value = 'assembled'; basis.dispatchEvent(new w.Event('change'));
  d.getElementById('pkgAsOf').value = '';
  basis.value = 'assembled'; basis.dispatchEvent(new w.Event('change'));
  basis.value = 'agency'; basis.dispatchEvent(new w.Event('change'));
  ok('① 라벨이 「금액 확인일」로 바뀐다', /금액 확인일/.test(txt('pkgAsOfLbl')), txt('pkgAsOfLbl'));
  basis.value = 'assembled'; basis.dispatchEvent(new w.Event('change'));
  ok('① 라벨이 「산출일」로 바뀐다', /산출일/.test(txt('pkgAsOfLbl')), txt('pkgAsOfLbl'));

  console.log('\n[2] 사람이 직접 넣은 날짜는 건드리지 않는다');
  /* ⚠ **먼저 「대리점가」로 가서 자동 표시를 떼어 낸다.** 그 표시(`dataset.auto`)가
     붙어 있는 동안 값을 넣으면 화면은 여전히 「우리가 채운 값」으로 보고 지운다 —
     그게 맞는 동작이다. 이 순서를 안 지켜서 **멀쩡한 코드를 결함으로 읽을 뻔했다.** */
  basis.value = 'agency'; basis.dispatchEvent(new w.Event('change'));
  d.getElementById('pkgAsOf').value = '2026-08-01';
  basis.value = 'assembled'; basis.dispatchEvent(new w.Event('change'));
  basis.value = 'agency'; basis.dispatchEvent(new w.Event('change'));
  ok('② 사람이 넣은 값은 그대로 남는다', val('pkgAsOf') === '2026-08-01', val('pkgAsOf'));

  console.log('\n[3] 🔴 직접견적을 새로 만들 길이 닫혀 있다');
  /* 남겨 두면 고른 순간 **어느 목록에도 안 나오는 기록**이 생긴다. */
  const kindSel = d.getElementById('pkgKind');
  ok('③ 편집 모달에 「직접견적」 보기가 없다',
    !!kindSel && !Array.from(kindSel.options).some((o) => o.value === 'adhoc'));
  ok('③ 「+ 직접견적」 버튼도 없다', !d.getElementById('pkgNewAdhoc'));

  done();
}

/* data.js·DOMContentLoaded가 끝난 뒤에 잰다 */
w.addEventListener('load', () => setTimeout(run, 30));
setTimeout(() => {
  fail++;
  console.log('  ✗ load 이벤트가 오지 않았다 — 페이지가 뜨지 못했다');
  done();
}, 25000);

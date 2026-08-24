/* ═══════════════════════════════════════════════════════════════════════════
   WA — 「파는 상품에만 PDF로 일정을 채운다」 (2026-08-24 대표 결정)
   ───────────────────────────────────────────────────────────────────────────
   하나투어가 데이터를 안 준다. 홈페이지에서 긁는 길도 실측으로 막혔다:
     · 코드 체계가 다르다 — 사이트맵 상품 URL 17,929개에 우리 대표상품코드 **0건**
     · 일정이 페이지에 안 담겨 온다 — 브라우저가 뜬 뒤 API로 따로 부른다
   → 그래서 **실제로 팔 상품 30~50건에만** 상세 PDF로 일정을 채운다.
     3,550건 전부에 일정을 넣는 것은 어차피 무리고, 파는 것만 있으면 된다.

   ■ 이 검사가 지키는 것

   ① 🔴 **금액 확인일의 후보 순서** — 문서 작성일 → **파일 이름의 날짜** → 없으면 안 만듦.
      실측: 하나투어 견적서 2건 중 1건이 문서에 작성일이 없어 걸렸는데 파일 이름에
      `_251127`이 있었다. 그 한 건 때문에 「오늘을 넣자」로 물러나면 안 된다 —
      **파일 이름은 자료가 밝힌 날짜고, 오늘은 우리가 지어낸 날짜다.**
      ⚠ 그리고 셋을 **갈라서 말해야** 한다. 「파일 이름에서 왔다」와 「오늘을 넣었다」를
        뭉치면 사람이 고쳐야 할 것과 안 고쳐도 될 것을 구분하지 못한다.
   ② 🔴 **관리자 화면 PDF 불러오기가 저장하지 않는다.** 추출은 사람이 볼 초안이지
      확정이 아니다. 자동 저장하면 잘못 읽은 값이 그대로 고객가가 된다.
   ③ 🔴 **이미 적힌 칸을 덮지 않는다.** 담당자가 손본 값을 자동이 지우면 그 수정이
      조용히 사라진다(일정 심기에서 이미 겪은 자리다).
   ④ **새 API를 만들지 않았다** — Vercel Hobby 함수 12개 제한에 이미 도달해 있다.
      「견적서 업데이트」가 쓰는 `?action=extractPdf`를 그대로 쓴다.
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
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WA PDF로 상품 일정 채우기`);
  process.exit(fail ? 1 : 0);
};

const R = require('./_package_rows');
const ADMIN = read('admin.html');
const IMP = read('ai-loop/import_packages.js');

console.log('\n[1] 🔴 금액 확인일 — 자료가 밝힌 것부터, 오늘은 끝까지 안 쓴다');
{
  const base = { id: 'a', title: '오키나와 3박4일', pricePerPerson: 1190000, departDate: '2025-12-03' };

  /* ① 문서 작성일이 있으면 그것 */
  const a = R.buildPackageRow(Object.assign({}, base, {
    priceAsOf: '2025-11-21', fileName: 'Hanatour 견적서_신선혜님(오키나와)_251121.pdf',
  }), {});
  ok('① 문서 작성일이 있으면 그것을 쓴다', a.ok && a.row.priceAsOf === '2025-11-21', a.ok && a.row.priceAsOf);
  ok('① 그때는 「문서에서 왔다」로 표시한다', a.ok && a.row._asOfFromDoc === true && a.row._asOfFromName === false);

  /* ② 없으면 파일 이름의 날짜 */
  const b = R.buildPackageRow(Object.assign({}, base, {
    priceAsOf: null, fileName: 'Hanatour 견적서_김보균님(상해)_251127.pdf',
  }), {});
  ok('② 문서에 작성일이 없으면 파일 이름의 날짜를 쓴다', b.ok && b.row.priceAsOf === '2025-11-27',
    b.ok ? b.row.priceAsOf : b.why);
  ok('② 「파일 이름에서 왔다」를 따로 표시한다', b.ok && b.row._asOfFromName === true && b.row._asOfFromDoc === false);
  ok('② note가 어디서 왔는지 밝힌다', b.ok && /파일 이름의 날짜/.test(b.row.note), b.ok && b.row.note);

  /* ③ 둘 다 없으면 만들지 않는다 — 오늘로 떨어지지 않는다 */
  const c = R.buildPackageRow(Object.assign({}, base, { priceAsOf: null, fileName: '견적서.pdf' }), {});
  ok('③ 둘 다 없으면 만들지 않는다', c.ok === false && c.needsAsOf === true, c.why);

  /* 파일 이름 날짜 자체의 규칙 */
  ok('③ 두 자리 연도는 2000년대로 읽는다', R.dateFromFileName('x_251127.pdf') === '2025-11-27');
  ok('③ 말이 안 되는 날짜는 안 받는다', R.dateFromFileName('x_259999.pdf') === null);
  ok('③ 경로가 붙어 있어도 파일명만 본다',
    R.dateFromFileName('C:/a_991231/견적서_260824.pdf') === '2026-08-24');
  ok('③ 엑셀도 같은 규칙을 쓴다', R.dateFromFileName('대표상품리스트_260824.xlsx') === '2026-08-24');

  /* 🔴 셋을 갈라 말하는가 — 뭉치면 사람이 무엇을 고쳐야 하는지 모른다 */
  ok('③ 투입기가 「파일 이름」과 「투입한 날」을 갈라 말한다',
    /_asOfFromName\) console\.log/.test(IMP) && /파일 이름의 날짜\*\*다/.test(IMP) && /투입한 날\*\*이다/.test(IMP));
}

console.log('\n[2] 관리자 화면 — 새 API를 만들지 않았다');
{
  ok('④ 기존 추출기를 그대로 쓴다', /\/api\/quotes\?action=extractPdf/.test(ADMIN));
  ok('④ 왜 새로 안 만들었는지가 적혀 있다', /함수 12개 제한/.test(ADMIN));
  ok('④ 파일 고르는 자리가 있다', /id="pkgPdf"/.test(ADMIN) && /accept="application\/pdf"/.test(ADMIN));
  ok('④ 화면이 「저장하지 않는다」고 말한다', /저장은 하지 않습니다/.test(ADMIN));
  ok('④ 화면이 「이미 적은 칸은 안 건드린다」고 말한다', /이미 적어 두신 칸은 건드리지 않습니다/.test(ADMIN));
}

/* ── [3] 실제로 눌러 본다 ─────────────────────────────────────────────────── */
(async () => {
  console.log('\n[3] 🔴 실제 조작 — 채우되, 저장하지 않고, 덮지 않는다');

  const dom = new JSDOM(ADMIN, {
    runScripts: 'dangerously', resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      /* 추출기 응답을 흉내 낸다 — 실제 하나투어 오키나와 PDF에서 나온 모양 그대로 */
      w.__saved = 0;
      w.fetch = (url, opt) => {
        if (String(url).indexOf('extractPdf') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            perPerson: 1190000,
            dates: { departDate: '2025-12-03', nights: 3, days: 4, quoteDate: null },
            itinerary: { days: [
              { place: '인천 출발 · 나하 도착', lines: ['오전 인천공항 집결', '오후 나하 도착'] },
              { place: '북부 관광', lines: ['츄라우미 수족관'] },
              { place: '자유일정', lines: ['국제거리'] },
              { place: '나하 출발', lines: ['면세점'] },
            ] },
          }) });
        }
        /* 🔴 저장 API가 불리면 세어 둔다 — 불리면 안 된다 */
        if (String(url).indexOf('action=packages') >= 0 && opt && opt.method === 'PUT') w.__saved++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      };
    },
  });
  const w = dom.window, d = w.document;

  await new Promise((r) => { w.addEventListener('load', () => setTimeout(r, 40)); setTimeout(r, 20000); });
  if (typeof w.switchTab !== 'function') { fail++; console.log('  ✗ 관리자 스크립트가 죽었다'); return done(); }

  /* 새 상품을 열고, 상품명만 사람이 미리 적어 둔다 */
  d.getElementById('pkgNew').click();
  d.getElementById('pkgTitle').value = '내가 적은 상품명';

  /* PDF를 고른 것처럼 만든다 */
  const file = new w.File([new w.Blob(['%PDF-1.4'])], 'Hanatour 견적서_신선혜님(오키나와)_251121.pdf',
    { type: 'application/pdf' });
  const input = d.getElementById('pkgPdf');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  d.getElementById('pkgPdfRead').click();
  await new Promise((r) => setTimeout(r, 400));

  const val = (id) => d.getElementById(id).value;
  ok('⑤ 금액을 채웠다', val('pkgPrice') === '1190000', val('pkgPrice'));
  ok('⑤ 박·일을 채웠다', val('pkgNights') === '3' && val('pkgDays') === '4',
    val('pkgNights') + '박 ' + val('pkgDays') + '일');
  ok('⑤ 출발일을 채웠다', val('pkgDepart') === '2025-12-03', val('pkgDepart'));
  /* 🔴 문서에 작성일이 없었다 → 파일 이름의 날짜가 들어와야 한다(오늘이 아니라) */
  ok('⑤ 금액 확인일이 파일 이름의 날짜다', val('pkgAsOf') === '2025-11-21', val('pkgAsOf'));
  ok('⑤ 일정 4일을 채웠다', val('pkgIti').split('\n').filter(Boolean).length === 4,
    JSON.stringify(val('pkgIti')).slice(0, 80));
  ok('⑤ 일정에 없는 구분을 지어내지 않는다', !/오전 \| /.test(val('pkgIti')));

  /* ③ 사람이 적어 둔 상품명은 그대로여야 한다 */
  ok('⑥ 🔴 이미 적어 둔 상품명을 덮지 않았다', val('pkgTitle') === '내가 적은 상품명', val('pkgTitle'));
  ok('⑥ 무엇을 그대로 뒀는지 말한다', /이미 적혀 있어 그대로 둠/.test(d.getElementById('pkgPdfMsg').textContent),
    d.getElementById('pkgPdfMsg').textContent);
  ok('⑥ 무엇을 채웠는지도 말한다', /채웠습니다/.test(d.getElementById('pkgPdfMsg').textContent));

  /* ② 저장은 하지 않았어야 한다 */
  ok('⑦ 🔴 저장 API를 부르지 않았다', w.__saved === 0, String(w.__saved) + '회 불렀다');
  ok('⑦ 사람에게 저장을 누르라고 안내한다', /「저장」을 누르세요/.test(d.getElementById('pkgPdfMsg').textContent));

  done();
})().catch((e) => { console.error(e); fail++; done(); });

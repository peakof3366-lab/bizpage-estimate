/* ═══════════════════════════════════════════════════════════════════════════
   WC — 고객 연락처: **대장에는 남고, 견적서 링크에는 안 실린다**
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「연락처 정보가 필요할 것 같다.」

   대장(WB)을 만들고 보니 **연락처가 없어서 우리가 먼저 연락할 수 없었다.** 고객이
   전화해 오면 이름으로 찾을 수 있지만 반대는 안 됐다 — 담당자가 휴가일 때 이어받는
   것이 목적인데, 이어받아도 걸 곳이 없으면 목적이 반쯤 깨진다.

   ■ 🔴 이 검사가 지키는 단 하나 — 연락처는 payload에 들어가면 안 된다

   견적서 링크(`estimate-view.html?id=…`)에는 **인증이 없다.** 링크를 아는 사람은
   누구나 payload를 본다. 그리고 고객이 결재권자에게 링크를 넘기는 것은 **정상 동선**이다
   (이 시스템이 그러라고 만든 것이다). 그 링크가 한 번 더 퍼지면 **고객 연락처가 같이 퍼진다.**

   이름·회사명은 다르다 — 견적서가 공문 성격이라 문서에 찍혀야 한다. 연락처는 문서에
   찍힐 이유가 하나도 없다.
   → **컬럼(`quote_shares.customer_tel`)에만 저장하고 payload에는 절대 안 넣는다.**
     화면도 「견적서에는 표시되지 않습니다」라고 미리 말한다 — 안 말하면 고객이
     연락처가 문서에 박히는 줄 알고 안 적는다.

   ⚠ 형식을 빡빡하게 잡지 않았다. 「010-1234-5678」·「01012345678」·「02)123-4567」·
     내선·해외번호가 다 온다. **너무 조이면 진짜 번호가 막히고, 막히면 사람이 아예 안 적는다.**
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const QNO = require(path.join(ROOT, 'api', '_lib', 'quote_no.js'));
const SHARES = read('api/quote-shares.js');
const SCRIPT = read('script.js');
const INDEX = read('index.html');
const AQ = read('admin-quote.html');
const ADMIN = read('admin.html');
const VIEW = read('estimate-view.html');
const MIG = read('ai-loop/db_migrate.js');

console.log('\n[1] 🔴 연락처가 견적서 payload에 안 들어간다 — 이 검사의 전부');
{
  /* 서버: payload를 만드는 곳(JSON.stringify)과 컬럼 값이 **분리**돼야 한다.
     payload 안에 tel/연락처가 들어가면 링크를 아는 사람이 전부 본다. */
  const bodies = [...SHARES.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)\}::jsonb/g)].map((m) => m[1]);
  ok('① payload를 만드는 자리를 찾았다', bodies.length === 2, bodies.length + '곳');
  ok('① payload 어디에도 연락처가 없다',
    bodies.every((b) => !/tel|Tel|연락처|phone/i.test(b)),
    bodies.map((b, i) => i + ':' + (/(tel|phone)/i.exec(b) || [''])[0]).join(' '));
  /* 컬럼으로는 들어가야 한다 */
  ok('① 컬럼에는 저장한다', (SHARES.split('customer_tel').length - 1) >= 3);
  /* ⚠ WK에서 자리가 한 번 옮겨졌다 — 저장 직전에 정규화하던 것을 **위에서 한 번**
     걸러 두고 그 값을 그대로 저장한다(담당자 발급은 그 값이 없으면 400이다).
     검사는 「어느 줄에 있는가」가 아니라 **payload가 아니라 body 바깥 칸에서 온다**를
     지킨다 — 그것이 WC가 세운 규칙이다. */
  ok('① 값은 body의 바깥 칸에서 온다',
    SHARES.includes('QNO.normalizeTel(body.customerTel)')
    && SHARES.includes('QNO.normalizeTel(b.customerTel)'));
  ok('① 왜 payload에 넣으면 안 되는지가 적혀 있다',
    /링크를 아는[\s\S]{0,80}payload를 본다/.test(SHARES + read('api/_lib/quote_no.js')));

  /* 화면: share 객체(=payload)에 넣지 않고 바깥으로 보낸다 */
  ok('① 고객 화면이 share가 아니라 바깥 칸으로 보낸다',
    /customerTel: \(document\.getElementById\('contactTel'\)/.test(SCRIPT));
  const shareObj = (/const shareData = \{([\s\S]*?)\n  \};/.exec(SCRIPT) || [])[1] || '';
  /* ⚠ 「tel」만 찾으면 **`hotelGrade`가 걸린다**(실제로 걸렸다). 값이 아니라
     **칸 이름**을 본다 — `tel:`·`customerTel`·`연락처`. */
  ok('① shareData 안에 연락처 칸이 없다',
    shareObj.length > 100 && !/(^|[^A-Za-z])tel\s*:|customerTel|연락처|phone\s*:/i.test(shareObj),
    (/((^|[^A-Za-z])tel\s*:|customerTel|연락처|phone\s*:)/i.exec(shareObj) || [''])[0]);
}

console.log('\n[2] 견적서 화면이 연락처를 그리지 않는다');
{
  /* 서버가 안 보내면 화면이 그릴 수 없지만, 나중에 누가 넣을 때 걸리게 검사를 둔다 */
  ok('② 견적서가 d.tel 류를 안 쓴다', !/d\.tel|d\.phone|d\.customerTel/.test(VIEW));
  ok('② 엑셀 내보내기에도 연락처 줄이 없다', !/\['연락처'/.test(VIEW));
}

console.log('\n[3] 화면이 「견적서에 안 나온다」고 먼저 말한다');
{
  /* 안 말하면 고객이 연락처가 문서에 박히는 줄 알고 안 적는다 */
  ok('③ 고객 계산기가 말한다', /견적서에는 표시되지 않습니다/.test(INDEX));
  ok('③ 담당자 도구도 말한다', /견적서에는 표시되지 않습니다/.test(AQ));
  ok('③ 관리자 발급 자리도 말한다', /견적서에 표시되지 않고 링크에도 실리지 않습니다/.test(ADMIN));
}

console.log('\n[4] 세 입구에서 다 받는다');
{
  const d1 = new JSDOM(INDEX).window.document;
  const t1 = d1.getElementById('contactTel');
  ok('④ 고객 계산기에 칸이 있다', !!t1);
  ok('④ 필수다(연락처 없는 견적은 리드가 아니다)', t1 && t1.hasAttribute('required'));
  ok('④ type=tel이다(휴대폰에서 숫자 자판이 뜬다)', t1 && t1.getAttribute('type') === 'tel');

  const d2 = new JSDOM(AQ).window.document;
  const t2 = d2.getElementById('contactTel');
  ok('④ 담당자 견적 도구에도 있다', !!t2 && t2.hasAttribute('required'));

  const d3 = new JSDOM(ADMIN).window.document;
  ok('④ 패키지·소규모 발급 자리에도 있다', !!d3.getElementById('pkgIssueTel'));
  ok('④ 그 값도 바깥 칸으로 보낸다', /customerTel: \(document\.getElementById\("pkgIssueTel"\)/.test(ADMIN));
}

console.log('\n[5] 번호 형식 — 조이지 않되 쓰레기는 막는다');
{
  ['010-1234-5678', '01012345678', '02)123-4567', '+82 10 1234 5678', '031 123 4567 (내선 12)']
    .forEach((v) => ok('⑤ 「' + v + '」를 받는다', QNO.normalizeTel(v) === v.trim()));
  ok('⑤ 빈칸은 null이다', QNO.normalizeTel('') === null && QNO.normalizeTel('   ') === null);
  ok('⑤ 숫자가 모자라면 안 받는다', QNO.normalizeTel('1234') === null);
  ok('⑤ 글자만 있으면 안 받는다', QNO.normalizeTel('나중에 알려드림') === null);
  ok('⑤ 문자열이 아니면 안 받는다', QNO.normalizeTel(1012345678) === null && QNO.normalizeTel(null) === null);
  ok('⑤ 너무 길면 자른다', (QNO.normalizeTel('0'.repeat(200)) || '').length <= 40);
  /* ⚠ 적은 그대로 보관한다 — 「02)123-4567」을 우리가 고쳐 쓰면 원본이 사라진다 */
  ok('⑤ 적은 모양 그대로 보관한다', QNO.normalizeTel(' 010-1234-5678 ') === '010-1234-5678');
}

console.log('\n[6] 대장에서 찾고, 눌러서 걸 수 있다');
{
  ok('⑥ 연락처로도 검색된다', /customer_tel ilike/.test(SHARES));
  ok('⑥ 목록이 연락처를 함께 읽는다', (SHARES.split('customer_label, customer_tel, status').length - 1) === 2);
  ok('⑥ 대장 화면에 열이 있다', /<th>연락처<\/th>/.test(ADMIN));
  ok('⑥ 눌러서 바로 걸 수 있다', /href="tel:/.test(ADMIN));
  /* 🔴 전화번호를 href에 넣을 때 숫자와 +만 남긴다 — 따옴표가 섞이면 속성이 깨진다 */
  ok('⑥ tel: 링크에 숫자·+만 넣는다', /replace\(\/\[\^0-9\+\]\/g, ''\)/.test(ADMIN));
  ok('⑥ 화면 안내에도 연락처 검색을 적었다', /연락처 · 목적지 · 담당자로 검색/.test(ADMIN));
  ok('⑥ 스키마에 칸이 있다', /add column if not exists customer_tel/.test(MIG));
  ok('⑥ 스키마 주석이 payload 금지를 말한다', /payload에 넣지 않고 컬럼에만 둔다/.test(MIG));
}

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — WC 고객 연락처`);
process.exit(fail ? 1 : 0);

/* ═══════════════════════════════════════════════════════════════════════════
   WB — 견적번호와 견적서 대장 (2026-08-24 대표 요구)
   ───────────────────────────────────────────────────────────────────────────
   「관리자에서 만들어진 모든 견적서는 넘버링이 되어야 한다. 그리고 모든 자료가
   공유되어야 담당자가 연차·휴가일 때도 응대가 가능하다.」

   ■ 감사에서 나온 사실 — 전부 실측이고, 전부 여기 회귀로 박는다

   ① 🔴 **견적번호가 없었다.** 식별자가 `mrx9l0xqhudmf1` 같은 랜덤 문자열이라
      전화로 부를 수 없었다.
   ② 🔴 **고객 견적서 엑셀이 「발행일」 칸에 그 랜덤 문자열을 찍고 있었다.**
      발행일 데이터는 처음부터 `payload.iso`에 있었는데 `d.id`를 읽었을 뿐이다.
   ③ 🔴 **웹사이트 FAQ가 「발행일, 견적 번호가 공문 수준으로 정리되어」라고 말했다** —
      없는 기능을 고객에게 있다고 말하고 있었다(index.html·admin.html 두 곳).
   ④ 🔴 **발급된 견적서를 볼 화면이 없었다.** 운영 DB에 10건이 있는데 quote_shares를
      조회하는 관리자 코드가 0건이었다. 담당자가 휴가면 아무도 못 찾는다.
   ⑤ 🔴 **패키지 발급 경로가 `iso`를 안 넣어 만료 판정이 조용히 무력했다.**
      `calcValidity(undefined)` → Invalid Date → `expired: NaN < 0` = **false**.
   ⑥ 🔴 **견적서 제목이 항상 「○○ 연수 견적서」였다** — 가족·친목 손님이 받는 문서에도.

   ■ 번호 형식과 날짜 — GPT 협의(pWB_prompt*.txt)에서 건진 것

   `Q260824-03` (Q + YYMMDD + 그날 순번).
   ⚠ 🔴 **날짜는 한국 시간으로 잰다.** 운영 DB(Neon) TimeZone이 **GMT**다(실측).
     `current_date`를 그대로 쓰면 **한국 오전 9시 이전 발급이 전날 번호**를 받는다.
     아침에 낸 견적서가 어제 것으로 찍히면 대장에서 못 찾는다.
   ⚠ 번호에 **구멍이 나는 것은 정상이다** — 재사용하면 「같은 번호의 다른 견적서」가
     생긴다. 견적번호의 일은 연속성이 아니라 **유일성**이다.
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
  console.log(`결과: ${pass} pass / ${fail} fail  — WB 견적번호·견적서 대장`);
  process.exit(fail ? 1 : 0);
};

const QNO = require(path.join(ROOT, 'api', '_lib', 'quote_no.js'));
const SHARES = read('api/quote-shares.js');
const VIEW = read('estimate-view.html');
const ADMIN = read('admin.html');
const INDEX = read('index.html');
const MIG = read('ai-loop/db_migrate.js');

console.log('\n[1] 번호 형식 — 전화로 부를 수 있고, 엑셀이 안 망가뜨린다');
{
  ok('① 형식이 Q+YYMMDD-순번이다', QNO.formatQuoteNo('2026-08-24', 3) === 'Q260824-03',
    QNO.formatQuoteNo('2026-08-24', 3));
  ok('① 정규식이 그 형식을 통과시킨다', QNO.QUOTE_NO_RE.test('Q260824-03'));
  ok('① 엉뚱한 것은 막는다', !QNO.QUOTE_NO_RE.test('mrx9l0xqhudmf1') && !QNO.QUOTE_NO_RE.test('Q26-3'));
  /* 🔴 앞이 'Q'라 엑셀이 문자로 읽는다 — 숫자로 시작하면 앞자리 0이 사라진다 */
  ok('① 숫자로 시작하지 않는다(엑셀이 앞자리 0을 지운다)', /^Q/.test(QNO.formatQuoteNo('2026-01-05', 1)));
  ok('① 한 자리 순번도 두 자리로 채운다', QNO.formatQuoteNo('2026-08-24', 7) === 'Q260824-07');
  /* 하루 100건을 넘으면 자릿수가 늘어난다 — 유일하기만 하면 된다 */
  ok('① 100건을 넘어도 유일하다', QNO.formatQuoteNo('2026-08-24', 100) === 'Q260824-100');
  ok('① 해가 바뀌어도 번호가 겹치지 않는다',
    QNO.formatQuoteNo('2026-01-01', 1) !== QNO.formatQuoteNo('2027-01-01', 1));
}

console.log('\n[2] 🔴 날짜는 한국 시간이다 — DB TimeZone이 GMT다');
{
  /* 한국 오전 8시 = UTC 전날 23시. UTC로 재면 **전날**이 나온다. */
  const kstMorning = new Date('2026-08-24T08:00:00+09:00');
  ok('② 한국 오전 8시에도 그날 날짜가 나온다', QNO.kstToday(kstMorning) === '2026-08-24',
    QNO.kstToday(kstMorning) + ' (UTC로 재면 ' + kstMorning.toISOString().slice(0, 10) + ')');
  ok('② UTC로 재면 실제로 하루가 밀린다(그래서 고쳤다)',
    kstMorning.toISOString().slice(0, 10) === '2026-08-23');
  const kstNight = new Date('2026-08-24T23:30:00+09:00');
  ok('② 한국 밤에도 그날이다', QNO.kstToday(kstNight) === '2026-08-24', QNO.kstToday(kstNight));
  /* 발급 쿼리도 KST로 잰다 */
  ok('② 순번 쿼리가 Asia/Seoul로 잰다', /at time zone 'Asia\/Seoul'/.test(read('api/_lib/quote_no.js')));
  ok('② current_date를 그대로 쓰지 않는다', !/values \(\(current_date\)/.test(read('api/_lib/quote_no.js')));
  ok('② 왜 그런지가 적혀 있다', /TimeZone이 \*\*GMT\*\*/.test(read('api/_lib/quote_no.js')));
}

console.log('\n[3] 순번 발급 — 동시 요청에서 겹치지 않는다');
{
  const lib = read('api/_lib/quote_no.js');
  ok('③ 한 문장으로 원자적으로 딴다', /on conflict \(day\) do update set n = quote_seq\.n \+ 1/.test(lib));
  ok('③ returning으로 받는다(따로 select 안 한다)', /returning n, day::text as day/.test(lib));
  ok('③ 구멍을 재사용하지 않는다고 적혀 있다', /재사용하지 않는다/.test(lib));
  ok('③ 순번 테이블이 스키마에 있다', /create table if not exists quote_seq/.test(MIG));
  /* 🔴 같은 번호가 두 건에 붙으면 대장이 무너진다 — DB가 막아야 한다 */
  ok('③ 번호에 unique 제약이 있다', /unique index if not exists quote_shares_no_idx/.test(MIG));
  ok('③ 화면이 아니라 DB가 막는다고 적혀 있다', /\*\*DB가 막는다\*\*\(화면이 아니라\)/.test(MIG));
}

console.log('\n[4] 🔴 세 발급 경로가 전부 번호와 발행일을 넣는다');
{
  /* 번호를 못 따면 **발급하지 않는다** — 번호 없이 나간 건은 대장에서 영영 못 찾는다 */
  const tries = SHARES.split('QNO.nextQuoteNo(sql)').length - 1;
  ok('④ 두 발급 경로가 모두 번호를 딴다', tries === 2, tries + '곳');
  ok('④ 번호를 못 따면 발급하지 않는다', (SHARES.split('quote_no_failed').length - 1) === 2);
  /* ⑤ 패키지 경로가 iso를 안 넣어 만료가 무력했다 */
  ok('④ 두 경로가 모두 iso(발행일)를 넣는다', (SHARES.split('QNO.kstToday()').length - 1) === 2);
  ok('④ payload에 견적번호도 싣는다(견적서가 찍어야 한다)', (SHARES.split('qno: quoteNo').length - 1) === 2);
  ok('④ 대장 컬럼에도 번호·발급자·고객을 남긴다',
    (SHARES.split('quote_no, issued_by, customer_label').length - 1) === 2);
  ok('④ 왜 iso가 필요한지가 적혀 있다', /Invalid Date → \*\*expired:false\*\*|expired:false/.test(SHARES));
}

console.log('\n[5] 🔴 고객 견적서 — 「발행일」에 랜덤 id를 찍지 않는다');
{
  ok('⑤ 발행일이 iso를 쓴다', /\['발행일', d\.iso \|\| '—'\]/.test(VIEW));
  ok('⑤ 그 자리에 d.id를 쓰지 않는다', !/\['발행일', d\.id/.test(VIEW));
  ok('⑤ 견적번호 줄이 생겼다', /\['견적번호', d\.qno \|\| '—'\]/.test(VIEW));
  /* 인쇄물에 나와야 한다 — 상단 바는 no-print라 인쇄하면 사라진다 */
  ok('⑤ 번호가 인쇄되는 자리에 있다', /id="quote-no"/.test(VIEW) && /hero-strip-qno/.test(VIEW));
  ok('⑤ 그 자리에 스타일이 있다', /\.hero-strip-qno\s*\{/.test(VIEW));
  /* ⑥ 제목 */
  ok('⑤ 패키지 견적서를 「연수」라 부르지 않는다',
    /d\.pkg \? ' 여행 견적서' : ' 연수 견적서'/.test(VIEW));
  /* ⑤ 만료 판정이 조용히 무력해지지 않는다 */
  ok('⑤ 발행일이 없으면 「모른다」고 한다', /unknown: true/.test(VIEW) && /유효기간은 담당자에게 확인/.test(VIEW));
  ok('⑤ 왜 그런지가 적혀 있다', /조용히 무력해진다/.test(VIEW));
}

console.log('\n[6] 🔴 FAQ가 없는 기능을 있다고 말하지 않는다');
{
  const OLD = '발행일, 견적 번호, 포함 항목 내역이 공문 수준으로 정리되어';
  ok('⑥ 옛 문구가 index.html에서 사라졌다', !INDEX.includes(OLD));
  ok('⑥ 옛 문구가 admin.html에서 사라졌다', !ADMIN.includes(OLD));
  ok('⑥ 실제 번호 예시를 든다', /Q260824-03/.test(INDEX));
}

console.log('\n[7] 대장 — 담당자가 휴가여도 찾을 수 있다');
{
  ok('⑦ 목록 API가 있다', /action === 'list' && req\.method === 'GET'/.test(SHARES));
  ok('⑦ 로그인해야 본다', /handleList[\s\S]{0,120}requireAdmin/.test(SHARES));
  /* 🔴 고객이 전화로 말할 수 있는 것으로 찾아야 한다 */
  ['quote_no', 'customer_label', "payload->>'dt'", "payload->>'org'", 'issued_by'].forEach((f) =>
    ok('⑦ ' + f + '로 검색된다', new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ilike').test(SHARES)));
  /* ⚠ payload에 있는 것을 컬럼으로 복사하지 않았다 — 두 벌이 되면 어긋난다 */
  ok('⑦ 목적지·금액을 컬럼으로 복사하지 않았다',
    !/add column if not exists dest_label/.test(MIG) && !/add column if not exists total /.test(MIG));
  ok('⑦ 그 이유가 적혀 있다', /payload에 이미 있는 것[\s\S]{0,60}다시 적지 않는다/.test(MIG));
  /* 상한에 걸린 것을 말한다 */
  ok('⑦ 상한에 걸리면 말한다', /capped/.test(SHARES) && /capped/.test(ADMIN));
  /* 견적서는 지우지 않는다 */
  ok('⑦ 삭제가 아니라 상태로 남긴다', /'issued', 'won', 'lost', 'void'/.test(SHARES));
  ok('⑦ 누가 언제 바꿨는지 남는다', /status_by/.test(SHARES) && /status_at = now\(\)/.test(SHARES));
  ok('⑦ 화면에 삭제 버튼이 없다', !/led-delete/.test(ADMIN));
  ok('⑦ 왜 안 지우는지가 화면에 적혀 있다', /견적서는 <strong>지우지 않습니다/.test(ADMIN));
}

/* ── [8] 실제로 열어 본다 ─────────────────────────────────────────────────── */
(async () => {
  console.log('\n[8] 🔴 실제 조작 — 대장이 뜨고, 실패하면 0건으로 위장하지 않는다');
  const dom = new JSDOM(ADMIN, {
    runScripts: 'dangerously', resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      /* ⚠ jsdom에는 `Element.prototype.scrollTo`가 없다 — 브라우저에는 있다.
         안 채우면 switchTab이 그 자리에서 죽고, **코드 문제로 오진하게 된다.** */
      w.Element.prototype.scrollTo = () => {};
      w.__mode = 'ok';
      w.fetch = (url) => {
        if (String(url).indexOf('action=list') >= 0) {
          if (w.__mode === 'fail') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            shares: [{
              id: 'abc123', quote_no: 'Q260824-03', created_at: '2026-08-24T00:00:00Z',
              issued_by: '최현욱', customer_label: '김보균님', status: 'issued',
              dest: '상해', org: '', cn: '김보균', iso: '2026-08-24',
              pax: '15', total: '15450000', per: '1030000', verdict: 'package',
            }], capped: false, max: 300 }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      };
    },
  });
  const w = dom.window, d = w.document;
  await new Promise((r) => { w.addEventListener('load', () => setTimeout(r, 40)); setTimeout(r, 20000); });
  if (typeof w.switchTab !== 'function') { fail++; console.log('  ✗ 관리자 스크립트가 죽었다'); return done(); }

  ok('⑧ 사이드바에 「견적서 대장」이 있다',
    Array.from(d.querySelectorAll('.si-label')).some((e) => e.textContent.trim() === '견적서 대장'));

  w.switchTab('ledger');
  await new Promise((r) => setTimeout(r, 300));
  const html = d.getElementById('ledList').innerHTML;
  ok('⑧ 견적번호가 목록에 보인다', /Q260824-03/.test(html));
  ok('⑧ 고객·목적지·발급자가 보인다', /김보균/.test(html) && /상해/.test(html) && /최현욱/.test(html));
  ok('⑧ 엔진 검증을 안 거친 건임을 표시한다', /패키지/.test(html));
  ok('⑧ 링크를 열고 복사할 수 있다', /led-open/.test(html) && /led-copy/.test(html));
  ok('⑧ 상태를 바꿀 수 있다', /led-st/.test(html) && /무산/.test(html));

  /* 🔴 못 불러왔을 때 「0건」으로 위장하지 않는다 */
  w.__mode = 'fail';
  await w.renderLedger();
  await new Promise((r) => setTimeout(r, 200));
  const failHtml = d.getElementById('ledList').innerHTML;
  ok('⑧ 실패를 「없음」으로 위장하지 않는다', /뜻이 아닙니다/.test(failHtml), failHtml.slice(0, 80));

  done();
})().catch((e) => { console.error(e); fail++; done(); });

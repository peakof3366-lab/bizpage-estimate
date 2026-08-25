/* ═══════════════════════════════════════════════════════════════════════════
   하나투어 상품 하나를 읽어 본다 (WI) — **읽기만 한다**
   ───────────────────────────────────────────────────────────────────────────
   ⚠ **읽는 규칙은 여기 없다.** `api/_lib/hanatour.js` 한 곳에 있고 관리자 화면
     (`?action=hanatour`)도 그것을 쓴다 — 두 벌로 두면 터미널에서 본 값과 화면에 뜬
     값이 달라진다(결함 생성기 ①). 이 파일은 **보여주기만** 한다.

   ⚠ 이 도구는 **운영 DB에 아무것도 넣지 않는다.** 상품을 실제로 만드는 것은 관리자
     화면이고, 거기서도 **채우기만 하고 저장은 사람이** 누른다(WA의 PDF 경로와 같다).

   실행:
     node ai-loop/fetch_hanatour.js <URL 또는 pkgCd> [--json out.json]
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, '..', 'api', '_lib', 'hanatour.js'));

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const jsonAt = (() => { const i = argv.indexOf('--json'); return i >= 0 ? argv[i + 1] : null; })();

if (!target) {
  console.log('쓰는 법: node ai-loop/fetch_hanatour.js <하나투어 상품 URL 또는 pkgCd> [--json out.json]');
  console.log('  예: node ai-loop/fetch_hanatour.js "https://www.hanatour.com/trp/pkg/CHPC0PKG0200M200?pkgCd=AAB261261101TWA"');
  process.exit(1);
}

const won = (n) => Number(n || 0).toLocaleString();

(async () => {
  const r = await H.fetchProduct(target);
  if (!r.ok) { console.log('🔴 ' + r.why); process.exit(1); }
  const row = r.row;

  console.log('─'.repeat(72));
  console.log('상품명       ' + row.title);
  console.log('판매상품코드   ' + row.sourceCode);
  console.log('대표상품코드   ' + (row.rprsProdCd || '(없음)') + '   ← 엑셀과 맞추는 다리');
  console.log('지역         ' + (row.destLabel || '🔴 못 읽음'));
  console.log('기간         ' + (row.days ? row.nights + '박 ' + row.days + '일' : '🔴 못 읽음'));
  console.log('출발일       ' + (row.departDate || '(없음)')
    + (row.minPax ? '   · 최소 출발 ' + row.minPax + '명' : ''));
  console.log('1인 금액     ' + (row.pricePerPerson ? won(row.pricePerPerson) + '원' : '🔴 못 읽음'));
  console.log('─'.repeat(72));
  (row.itinerary || []).forEach((d) => {
    console.log('  DAY ' + d.day + ' · ' + d.title);
    console.log('     ' + d.am);
  });
  console.log('─'.repeat(72));
  if (r.missing.length) console.log('🔴 못 읽은 칸: ' + r.missing.join(' · '));
  else console.log('✅ 필요한 칸이 다 찼습니다');
  r.notProvided.forEach((s) => console.log('⚠ ' + s));

  if (jsonAt) {
    fs.writeFileSync(path.resolve(jsonAt), JSON.stringify(row, null, 1));
    console.log('파일로만 저장: ' + path.resolve(jsonAt));
  }
  console.log('\n⚠ 이 도구는 운영 DB에 아무것도 넣지 않습니다.');
})();

/* RY 검증: '실제 이용 호텔'을 나라 단위로 가르고, 담당자 누구나 보고 정리할 수 있게 한 것.

   왜 —
   ① 호텔명 칸에만 🔒 "관리자 전용"이 붙어 있었다. 실제로는 이 값을 쓰는 API가
      로그인한 담당자면 누구나 부를 수 있는데(requireAdmin = 로그인 확인이지 역할 확인이
      아니다), 화면 문구만 "관리자 전용"이라 직원이 못 건드리는 칸으로 읽혔다.
      **막혀 있지도 않은 것을 막힌 것처럼 보이게 한 문구**라 지우는 게 맞다.
   ② 호텔 체인은 이름만으로 나라를 알 수 없다. 같은 브랜드가 베트남에도 태국에도 있는데,
      지역(region)은 '동남아' 하나라 목록에서 섞였다. 그래서 **나라(country) 축**을
      DEST_CLASSIFY에 추가했다 — region은 요율 일괄조정 단위(가격 축)라 잘게 쪼갤 수 없다.
   ③ 예전 목록은 "목적지별 최근 1건"만 보여줬다. 같은 도시에 두 번째 호텔을 넣으면 첫
      번째가 화면에서 사라졌다 — 쌓아도 정리가 안 됐다.

   여기서 고정하는 것:
   ⓐ 나라는 data.js DEST_CLASSIFY 한 곳에서만 정해지고 admin.html은 파생한다(결함 생성기 ①).
   ⓑ 나라 값이 빠지면 조용히 넘어가지 않는다(결함 생성기 ②) — 파생 이상으로 잡히고,
      화면에서도 '나라 미지정'으로 빨갛게 드러난다.
   ⓒ 호텔명 칸에서 '관리자 전용' 표시가 사라졌고 다른 칸과 같은 모양이다.
   ⓓ 같은 도시의 호텔 여러 개가 전부 남는다(옛 결함 재발 방지). 같은 호텔은 합쳐 횟수를 센다.
   ⓔ 커스텀 목적지도 나라를 받는 경로가 네 곳(DB·검증·저장·조회·화면) 전부 이어져 있다.

   실행: node ai-loop/test_rY_hotel_country.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const adminSrc = read('admin.html');
const dataSrc = read('data.js');
const ratesSrc = read(path.join('api', 'rates.js'));
const migrateSrc = read(path.join('ai-loop', 'db_migrate.js'));
const DATA = require('../data');

let seq = 0;
/* createdAt은 문자열로 넣는다 — 실제 API가 그렇게 준다(타임스탬프로 넣으면 픽스처가
   실제와 달라진다). 순번으로 시간을 벌려 '최근' 판정이 흔들리지 않게 한다. */
const report = (destKey, hotelName, over) => Object.assign({
  id: ++seq, destinationKey: destKey, hotelName,
  airfareUnit: null, hotelUnit: null, mealUnit: null,
  fuelUnit: null, vehicleUnit: null, guideUnit: null, sightUnit: null, sellPriceUnit: null,
  author: '김직원', source: 'manual',
  createdAt: new Date(Date.UTC(2026, 0, seq)).toISOString(),
}, over || {});

(async () => {
  /* ── [1] 나라 축이 한 곳에서만 정해지는가 (ⓐ) ───────────────────────── */
  console.log('[1] 나라(country)가 DEST_CLASSIFY 한 곳에서만 정해지는가');
  const DC = DATA.DEST_CLASSIFY;
  const keys = Object.keys(DC);
  const missing = keys.filter((k) => !DC[k].country || !String(DC[k].country).trim());
  ok('모든 목적지에 나라가 있다', missing.length === 0, missing.join(','));
  ok('요율표와 개수가 같다', keys.length === DATA.length, `${keys.length} vs ${DATA.length}`);

  const COUNTRY = DATA.destFieldMap('country');
  ok('파생이 실제로 돈다 (destFieldMap)', Object.keys(COUNTRY).length === keys.length,
    String(Object.keys(COUNTRY).length));
  ok('파생 이상 0건', DATA.DEST_CLASSIFY_ISSUES.length === 0, DATA.DEST_CLASSIFY_ISSUES.join(' / '));

  ok('admin.html이 destFieldMap으로 만든다',
    /const DEST_COUNTRY = destFieldMap\('country'\);/.test(adminSrc));
  ok('admin.html에 나라 목록 리터럴이 없다 (목록을 두 번 적지 않는다)',
    !/const DEST_COUNTRY = \{/.test(adminSrc));

  /* 한 나라가 두 지역에 걸치면 목록이 두 군데로 쪼개져 보인다 — 분류가 어긋났다는 신호다.
     (지역 하나에 여러 나라가 있는 건 정상이다. 그게 이 축을 만든 이유다.) */
  const regionsOf = {};
  keys.forEach((k) => { (regionsOf[DC[k].country] = regionsOf[DC[k].country] || new Set()).add(DC[k].region); });
  const split = Object.keys(regionsOf).filter((c) => regionsOf[c].size > 1);
  ok('한 나라가 두 지역에 걸치지 않는다', split.length === 0,
    split.map((c) => `${c}: ${[...regionsOf[c]].join('+')}`).join(' / '));
  const multi = Object.keys(regionsOf).length;
  ok('지역보다 나라가 촘촘하다 (안 그러면 축을 새로 만든 의미가 없다)',
    multi > new Set(keys.map((k) => DC[k].region)).size, `나라 ${multi}`);
  /* 이 축을 만든 실제 이유 — '동남아' 안에서 나라가 갈리는지 직접 확인한다 */
  const seaCountries = new Set(keys.filter((k) => DC[k].region === '동남아').map((k) => DC[k].country));
  ok('동남아 한 지역이 여러 나라로 갈린다', seaCountries.size >= 5, [...seaCountries].join(','));
  ok('베트남 도시들이 한 나라로 묶인다',
    ['하노이', '호치민', '다낭'].every((k) => DC[k].country === '베트남'));
  ok('태국 도시들이 베트남과 갈린다',
    ['방콕', '푸켓'].every((k) => DC[k].country === '태국'));

  /* ── [2] 값이 빠지면 조용히 넘어가지 않는가 (ⓑ) ─────────────────────── */
  console.log('\n[2] 나라를 빠뜨리면 잡히는가 (일부러 망가뜨려 확인)');
  const BANGKOK_RE = /'방콕':\s*\{[^}]*\},/;
  ok('바꿔치기할 방콕 행을 찾았다', BANGKOK_RE.test(dataSrc));
  const quiet = (fn) => {
    const realWarn = console.warn;
    console.warn = () => {};
    try { return fn(); } finally { console.warn = realWarn; }
  };
  const broken = quiet(() => {
    const g = {};
    const src = dataSrc.replace(BANGKOK_RE,
      "'방콕':     { zone:'mid'  , ins:'asiaMid'  , region:'동남아',       currency:'THB', season:'seasia'        },");
    new Function('g', src + '\n;g.ISSUES=DEST_CLASSIFY_ISSUES;g.map=destFieldMap;')(g);
    const m = g.map('country');
    return { issues: g.ISSUES, map: m };
  });
  ok('나라가 빠지면 파생 이상으로 기록된다',
    broken.issues.some((s) => /방콕/.test(s) && /country/.test(s)), broken.issues.join(' / '));
  ok('빠진 목적지는 나라 맵에 아예 안 들어간다 (엉뚱한 값으로 때우지 않는다)',
    !('방콕' in broken.map));

  /* ── [3] 입력칸이 다른 칸과 같아졌는가 (ⓒ) ──────────────────────────── */
  console.log('\n[3] 호텔명 칸이 다른 입력칸과 같아졌는가');
  const hotelFieldBlock = (adminSrc.match(/실제 이용 호텔명[\s\S]{0,600}?pr-hotel-scope[^>]*><\/div>/) || [''])[0];
  ok('호텔명 칸 영역을 찾았다', hotelFieldBlock.length > 0);
  ok('칸 이름에 🔒가 없다', !/🔒/.test(hotelFieldBlock), hotelFieldBlock.slice(0, 160));
  ok('칸 이름에 "관리자 전용"이 없다', !/관리자 전용/.test(hotelFieldBlock));
  ok('다른 칸과 같은 입력 스타일을 쓴다', /id="pr-hotel-name" class="pw-input"/.test(adminSrc));
  ok('안내문에도 "관리자 전용"이 남아 있지 않다',
    !/관리자 전용/.test((adminSrc.match(/실제 계약가 업데이트[\s\S]{0,2500}?<\/div>/) || [''])[0]));
  ok('호텔 카드 제목에서도 "관리자 전용"이 빠졌다',
    /<span class="card-title">🏨 실제 이용 호텔<\/span>/.test(adminSrc));
  /* 고객에게 안 나간다는 사실 자체는 남아 있어야 한다 — 지운 건 '권한' 오해뿐이다 */
  ok('고객에게 안 나간다는 안내는 남아 있다', /고객이 보는 견적서·공개 페이지에는 나가지 않습니다/.test(adminSrc));

  /* ── [4] 화면에서 실제로 나라별로 갈리는가 (ⓓ) ──────────────────────── */
  console.log('\n[4] 실제로 렌더해서 확인 (지역 → 나라 → 도시)');
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;
  ok('픽스처에 목적지 요율표가 실려 있다', Array.isArray(w.__destinationRates()) && w.__destinationRates().length > 50,
    String((w.__destinationRates() || []).length));

  const card = d.getElementById('hotel-reference-card');
  w.__setPriceReports([]);
  w.renderHotelReference();
  ok('호텔 제보가 하나도 없으면 카드를 숨긴다', card.classList.contains('hidden'));

  /* 같은 이름의 체인 호텔을 서로 다른 나라에 넣는다 — 이게 이 작업의 출발점이다 */
  w.__setPriceReports([
    report('하노이', '롯데호텔'),
    report('도쿄', '롯데호텔'),
    report('방콕', '아난타라'),
    report('다낭', '나만리트리트'),
    report('다낭', '빈펄리조트'),          /* 같은 도시 두 번째 호텔 — 옛 코드에선 사라졌다 */
    report('다낭', ' 나만리트리트 '),       /* 같은 호텔(공백만 다름) — 합쳐져야 한다 */
  ]);
  w.renderHotelReference();
  ok('제보가 있으면 카드를 보여준다', !card.classList.contains('hidden'));

  const list = d.getElementById('hotel-reference-list');
  const text = list.textContent.replace(/\s+/g, ' ');
  const groupTexts = Array.from(list.querySelectorAll('details')).map((el) => el.textContent.replace(/\s+/g, ' '));
  const groupWith = (needle) => groupTexts.find((t) => t.includes(needle)) || '';

  ok('지역 묶음이 두 개 이상 만들어진다', groupTexts.length >= 2, String(groupTexts.length));
  ok('일본 묶음에 도쿄 롯데호텔이 있다', /도쿄/.test(groupWith('일본')) && /롯데호텔/.test(groupWith('일본')));
  ok('동남아 묶음에 베트남과 태국이 함께 있다',
    /베트남/.test(groupWith('동남아')) && /태국/.test(groupWith('동남아')), groupWith('동남아').slice(0, 200));
  /* 핵심: 같은 이름의 체인 호텔이 **나라 단위로** 갈린다.
     롯데호텔은 도쿄에도 하노이에도 있으므로 두 군데 다 나와야 맞다 — 요점은 "안 보인다"가
     아니라 **어느 나라 것인지 구분되어** 보인다는 것이다. 예전 목록은 목적지 이름만 있어
     둘이 나란히 놓이면 어느 쪽이 어느 나라인지 알 수 없었다. */
  const countryBlocks = Array.from(list.querySelectorAll('details > div'));
  const blockOf = (country) => {
    const el = countryBlocks.find((b) => (b.firstElementChild || {}).textContent &&
      b.firstElementChild.textContent.trim().startsWith(country));
    return el ? el.textContent.replace(/\s+/g, ' ') : '';
  };
  ok('나라 단위 묶음이 만들어진다', ['일본', '베트남', '태국'].every((c) => blockOf(c)),
    countryBlocks.map((b) => (b.firstElementChild || {}).textContent || '').join('|'));
  ok('일본 롯데호텔은 도쿄 아래에 있다',
    /롯데호텔/.test(blockOf('일본')) && /도쿄/.test(blockOf('일본')), blockOf('일본'));
  ok('베트남 롯데호텔은 하노이 아래에 있다',
    /롯데호텔/.test(blockOf('베트남')) && /하노이/.test(blockOf('베트남')), blockOf('베트남'));
  ok('두 롯데호텔이 서로 다른 나라 묶음에 들어간다', blockOf('일본') !== blockOf('베트남'));
  ok('일본 묶음에 베트남 도시가 섞이지 않는다', !/하노이|다낭/.test(blockOf('일본')), blockOf('일본'));
  ok('태국 묶음은 베트남과 따로다',
    /아난타라/.test(blockOf('태국')) && !/아난타라/.test(blockOf('베트남')), blockOf('태국'));

  /* ⓓ 옛 결함 재발 방지 — 같은 도시 두 번째 호텔이 첫 번째를 밀어내지 않는다 */
  ok('같은 도시의 호텔이 둘 다 남는다 (옛 "최근 1건"의 결함)',
    /나만리트리트/.test(text) && /빈펄리조트/.test(text));
  ok('같은 호텔은 한 줄로 합쳐 횟수를 센다', /나만리트리트 ×2회/.test(text), text.slice(0, 400));
  ok('합쳐진 줄이 두 번 나오지 않는다',
    (text.match(/나만리트리트/g) || []).length === 1, String((text.match(/나만리트리트/g) || []).length));
  ok('개수 요약이 나라 수까지 말해 준다',
    /5곳/.test(d.getElementById('hotel-ref-count').textContent) && /나라/.test(d.getElementById('hotel-ref-count').textContent),
    d.getElementById('hotel-ref-count').textContent);

  /* 검색 — 나라 이름으로도 찾을 수 있어야 "나라별로 정리"가 실제로 된다 */
  const search = d.getElementById('hotel-ref-search');
  search.value = '베트남';
  w.renderHotelReference();
  const t2 = list.textContent.replace(/\s+/g, ' ');
  ok('나라 이름으로 검색된다', /하노이/.test(t2) && /다낭/.test(t2));
  ok('다른 나라는 걸러진다', !/도쿄/.test(t2) && !/방콕/.test(t2), t2.slice(0, 200));
  search.value = '아난타라';
  w.renderHotelReference();
  ok('호텔명으로도 검색된다', /방콕/.test(list.textContent) && !/도쿄/.test(list.textContent));
  search.value = '없는호텔';
  w.renderHotelReference();
  ok('0건이어도 카드는 남는다 (검색어를 지울 곳이 사라지면 안 된다)', !card.classList.contains('hidden'));
  ok('0건이면 그렇다고 말해 준다', /검색 조건에 맞는 호텔이 없습니다/.test(list.textContent));
  search.value = '';
  w.renderHotelReference();

  /* 나라를 모르는 목적지 — 조용히 섞이지 않고 드러나야 한다 (ⓑ) */
  w.__setPriceReports([report('테스트미등록목적지', '이름없는호텔')]);
  w.renderHotelReference();
  ok('나라를 모르면 "나라 미지정"으로 드러낸다', /나라 미지정/.test(list.textContent), list.textContent.slice(0, 200));
  /* ⚠ 안내 문구는 **할 수 있는 일**만 말해야 한다. 나라는 목적지를 추가할 때만 정하고
     나중에 고치는 화면이 아직 없으므로 "요율 관리에서 지정하세요"는 거짓 안내다. */
  ok('왜 비었는지 알려준다', /'나라' 칸이 비어 있던 곳/.test(list.textContent), list.textContent.slice(0, 240));
  ok('할 수 없는 일을 시키지 않는다', !/요율 관리에서 이 목적지의 나라를 지정/.test(adminSrc));

  /* 저장형 XSS — 호텔명은 담당자가 넣지만 그대로 innerHTML에 들어간다 */
  w.__setPriceReports([report('도쿄', '<img src=x onerror="window.__xss=1">호텔')]);
  w.renderHotelReference();
  ok('호텔명이 HTML로 실행되지 않는다', !list.querySelector('img') && w.__xss === undefined);
  ok('그래도 글자는 보인다', /호텔/.test(list.textContent));

  /* 입력칸 아래 안내 — 넣기 전에 어느 나라로 정리되는지 보여준다 */
  const sel = d.getElementById('pr-dest');
  ok('목적지 선택지에 나라가 함께 적혀 있다',
    Array.from(sel.options).some((o) => o.value === '가오슝' && /대만/.test(o.textContent)),
    (Array.from(sel.options).find((o) => o.value === '가오슝') || {}).textContent);
  sel.value = '다낭';
  sel.dispatchEvent(new w.Event('change'));
  const hint = d.getElementById('pr-hotel-scope').textContent;
  ok('고른 목적지의 나라를 입력 전에 보여준다', /베트남/.test(hint) && /다낭/.test(hint), hint);
  ok('지역도 함께 보여준다', /동남아/.test(hint), hint);

  /* CSV — 화면에서 접어 보는 것과 별개로 엑셀로 옮길 수 있어야 "정리"가 끝난다 */
  ok('CSV 내보내기가 있다', typeof w.exportHotelReferenceCsv === 'function');
  ok('CSV 머리글에 나라 칸이 있다', /\['지역', '나라', '도시', '호텔명'/.test(adminSrc));
  ok('CSV가 화면과 같은 검색 결과를 쓴다', /const \{ rows \} = hotelReferenceGroups\(\);/.test(adminSrc));

  /* ── [5] 커스텀 목적지도 나라가 붙는가 (ⓔ) ──────────────────────────── */
  console.log('\n[5] 커스텀 목적지 경로가 전부 이어져 있는가');
  ok('DB 컬럼이 있다',
    /alter table custom_destinations add column if not exists country/.test(migrateSrc));
  ok('생성 API가 값을 검증한다', /body\.country != null &&/.test(ratesSrc));
  ok('INSERT 컬럼 목록에 있다',
    /insert into custom_destinations \([^)]*\bcountry\b/.test(ratesSrc));
  ok('GET이 값을 내려보낸다', /country: r\.country \|\| null/.test(ratesSrc));
  ok('관리자 폼에 나라 칸이 있다', /id="new-dest-country"/.test(adminSrc));
  ok('폼이 값을 보낸다', /country: document\.getElementById\('new-dest-country'\)/.test(adminSrc));
  ok('폼을 열 때 이전 값이 남지 않는다',
    /getElementById\('new-dest-country'\)\.value = '';/.test(adminSrc));
  ok('화면이 DEST_COUNTRY에 편입한다',
    /if \(row\.country\) DEST_COUNTRY\[destFields\.destination_key\] = row\.country;/.test(adminSrc));
  /* 실제로 편입되는지까지 확인한다 — 문자열 검사만 믿지 않는다 */
  w.__addCustomCountry('제주테스트', '대한민국');
  w.__setPriceReports([report('제주테스트', '테스트호텔')]);
  w.renderHotelReference();
  ok('커스텀 목적지 나라가 실제로 목록에 반영된다',
    /대한민국/.test(list.textContent) && !/나라 미지정/.test(list.textContent),
    list.textContent.slice(0, 200));

  /* ── [6] 나라는 가격에 닿지 않는다 ─────────────────────────────────── */
  console.log('\n[6] 나라 축이 가격 계산에 새지 않았는가');
  ok('견적 엔진(script.js)이 country를 보지 않는다',
    !/\bcountry\b/.test(read('script.js')));
  ok('요율 일괄조정은 여전히 region으로 한다',
    /\(REGION_MAP\[d\.label\] \|\| '기타'\) === region/.test(adminSrc));

  /* ── [7] 매뉴얼 ────────────────────────────────────────────────────── */
  console.log('\n[7] 매뉴얼이 바뀐 화면을 설명하는가');
  const manualSrc = read('manual.html');
  ok('호텔명 항목에서 🔒·"관리자 전용"이 빠졌다',
    !/실제 이용 호텔명 🔒/.test(manualSrc) && !/호텔명[\s\S]{0,120}관리자 전용/.test(manualSrc));
  ok('누구나 넣고 볼 수 있다고 적혀 있다', /담당자 누구나<\/strong> 넣고 볼 수 있습니다/.test(manualSrc));
  ok('지역 → 나라 → 도시로 정리된다고 적혀 있다', /지역 → 나라 → 도시/.test(manualSrc));
  ok('체인 호텔이 왜 문제인지 적혀 있다', /체인 호텔/.test(manualSrc) && /브랜드/.test(manualSrc));
  ok('고객에게 안 나간다는 사실은 남아 있다', /고객이 보는 견적서·홈페이지에도 나가지 않습니다/.test(manualSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.__setPriceReports = (rows) => { priceReportsCache = rows; };
  window.__destinationRates = () => (typeof destinationRates !== 'undefined' ? destinationRates : null);
  /* 커스텀 목적지가 loadRates에서 편입되는 것과 같은 모양으로 흉내 낸다 */
  window.__addCustomCountry = (key, country) => {
    if (!destinationRates.some(d => d.destination_key === key)) {
      destinationRates.push({ destination_key: key, label: key, rateDate: '2026-01', notes: '' });
    }
    DEST_COUNTRY[key] = country;
    REGION_MAP[key] = '동남아';
  };
  window.renderHotelReference = renderHotelReference;
  window.exportHotelReferenceCsv = exportHotelReferenceCsv;
  window.populatePriceReportDestSelect = populatePriceReportDestSelect;
  currentUser = { id: '7', username: 'staff1', displayName: '김직원', role: 'staff' };
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
      /* CSV 내보내기가 실제로 불릴 수 있는지만 본다 — 파일 저장은 jsdom에 없다 */
      w.URL.createObjectURL = () => 'blob:test';
      w.URL.revokeObjectURL = () => {};
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  /* 목적지 select는 견적서 업데이트 탭을 열 때 채워진다 — 픽스처에서 직접 부른다 */
  dom.window.populatePriceReportDestSelect();
  return dom;
}

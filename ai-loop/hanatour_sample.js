/* ═══════════════════════════════════════════════════════════════════════════
   하나투어 읽기가 **얼마나 채우는지**를 표본으로 잰다 (WL) — 읽기 전용

   ■ 왜 필요한가

   WJ는 상품 10건으로 「전수 성공」이라 적었다. 그런데 10건은 우리가 손으로 고른
   10건이었다 — **못 읽는 양식은 애초에 표본에 안 들어왔다.** WG에서 「9건인 줄
   알았는데 세어 보니 3건」이었던 것과 같은 자리다: **세기 전에는 모른다.**

   ■ 무엇을 세는가

   칸마다 「몇 %가 찼는가」와 **왜 안 찼는가**를 함께 센다. 채움률만 보면 「금액이
   90%」가 좋아 보이지만, 못 채운 10%가 전부 같은 양식이면 그건 결함이다.

   ■ ⚠ 남의 서버다 — 예의를 코드로 지킨다

   · **기본 30건**, `--limit`로 올려도 200건이 상한이다. 목록 전체(18,000건)를
     훑는 도구가 아니다. 훑고 싶어지면 그때는 정식 연동을 요청하는 것이 맞다.
   · 한 건마다 **쉰다**(기본 400ms). 동시에 여러 건을 부르지 않는다.
   · 스위트(`run_all_tests.js`)가 이걸 부르지 않는다 — **네트워크를 타는 것은
     검사가 아니다.** 하나투어가 잠깐 느리면 빨간 줄이 뜨고, 그러면 사람이
     스위트를 안 믿게 된다(WJ에서 세운 규칙).

   실행:
     node ai-loop/hanatour_sample.js                 # 사이트맵에서 30건 골라 잰다
     node ai-loop/hanatour_sample.js --limit 60
     node ai-loop/hanatour_sample.js --codes A,B,C   # 특정 상품만
     node ai-loop/hanatour_sample.js --json out.json # 결과를 파일로
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const https = require('https');
const H = require(path.join(__dirname, '..', 'api', '_lib', 'hanatour.js'));

const SITEMAP = 'https://static.hanatour.com/sitemap/desktop/dynamic/package-detail.xml';
const HARD_CAP = 200;
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const LIMIT = Math.min(HARD_CAP, Math.max(1, Number(argOf('--limit', 30)) || 30));
const PAUSE = Math.max(200, Number(argOf('--pause', 400)) || 400);
const JSON_AT = argOf('--json', null);
const CODES = argOf('--codes', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(b));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('시간 초과')); });
  });
}

/* 표본은 **고르게** 뽑는다. 앞에서 30개를 자르면 같은 지역·같은 양식만 걸린다
   (코드가 지역순으로 몰려 있다 — AAB…가 연달아 나온다). 일정 간격으로 훑는다.
   ⚠ 무작위로 뽑지 않는다. 돌릴 때마다 표본이 바뀌면 **전/후 대조를 못 한다** —
     이 저장소에서 전/후 대조가 회귀를 네 번 잡았다. */
function spread(all, n) {
  if (all.length <= n) return all.slice();
  const step = all.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(all[Math.floor(i * step)]);
  return out;
}

const FIELDS = [
  ['title', '상품명'], ['destLabel', '지역'], ['days', '기간'], ['departDate', '출발일'],
  ['pricePerPerson', '1인 금액'], ['priceAsOf', '금액 확인일'], ['itinerary', '일정'],
  ['included', '포함사항'], ['excluded', '불포함사항'], ['imageUrl', '사진'],
];

(async () => {
  let codes;
  if (CODES) {
    codes = CODES.split(',').map((s) => s.trim()).filter(Boolean).slice(0, HARD_CAP);
  } else {
    process.stdout.write('사이트맵을 받는 중… ');
    const xml = await get(SITEMAP);
    /* ⚠ 잘라내기(`slice`)로 접두사를 떼지 않는다 — 「pkgCd=」는 6자인데 7로 세어
       **모든 코드의 첫 글자를 먹은** 적이 있다(30건 전부 HTTP 400이 나서 알았다).
       길이를 손으로 세는 대신 **정규식이 잡은 부분**을 쓴다. */
    const all = [...new Set([...xml.matchAll(/pkgCd=([A-Za-z0-9]+)/g)].map((m) => m[1]))];
    console.log(all.length.toLocaleString() + '건 중 ' + LIMIT + '건을 고르게 뽑습니다.');
    codes = spread(all, LIMIT);
  }

  const rows = [];
  const fails = [];
  for (let i = 0; i < codes.length; i++) {
    const cd = codes[i];
    let r;
    try { r = await H.fetchProduct(cd); }
    catch (err) { r = { ok: false, why: '예외: ' + err.message }; }
    if (r.ok) rows.push({ cd, row: r.row, missing: r.missing, warnings: r.warnings || [] });
    else fails.push({ cd, why: r.why });
    process.stdout.write('\r  읽는 중 ' + (i + 1) + '/' + codes.length + '  (성공 ' + rows.length + ' · 실패 ' + fails.length + ')   ');
    if (i < codes.length - 1) await sleep(PAUSE);
  }
  console.log('\n');

  console.log('─'.repeat(70));
  console.log('표본 ' + codes.length + '건 → 읽음 ' + rows.length + ' · 못 읽음 ' + fails.length);
  console.log('─'.repeat(70));
  const has = (v) => !(v == null || v === '' || (Array.isArray(v) && !v.length));
  for (const [key, label] of FIELDS) {
    const n = rows.filter((x) => has(x.row[key])).length;
    const pct = rows.length ? Math.round((n / rows.length) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '·');
    console.log('  ' + label.padEnd(12) + bar + ' ' + String(pct).padStart(3) + '%  (' + n + '/' + rows.length + ')');
  }

  /* 🔴 「읽었는데 앞뒤가 안 맞는 것」은 채움률에 안 잡힌다 — 따로 센다.
     WD에서 배운 것: `ok`(결함인가)와 `matched`(대조됐나)를 합쳐 세면 깨끗해 보인다. */
  const wcount = {};
  rows.forEach((x) => x.warnings.forEach((w) => {
    const key = w.split(' — ')[0].split(' (')[0].slice(0, 40);
    wcount[key] = (wcount[key] || 0) + 1;
  }));
  console.log('─'.repeat(70));
  const wkeys = Object.keys(wcount).sort((a, b) => wcount[b] - wcount[a]);
  if (!wkeys.length) console.log('🔴 확인 필요: 0건');
  else {
    console.log('🔴 확인 필요 (값은 왔는데 앞뒤가 안 맞는 것):');
    wkeys.forEach((k) => console.log('   · ' + wcount[k] + '건  ' + k));
  }

  /* 못 읽은 칸이 **어느 상품에 몰렸는지**를 본다 — 흩어져 있으면 양식 차이고,
     한 상품에 몰렸으면 그 상품이 특이한 것이다. */
  const worst = rows.filter((x) => x.missing.length)
    .sort((a, b) => b.missing.length - a.missing.length).slice(0, 8);
  if (worst.length) {
    console.log('─'.repeat(70));
    console.log('못 채운 칸이 많은 상품:');
    worst.forEach((x) => console.log('   · ' + x.cd + '  [' + x.missing.join(',') + ']  '
      + String(x.row.title || '').slice(0, 34)));
  }
  if (fails.length) {
    console.log('─'.repeat(70));
    console.log('못 읽은 상품 ' + fails.length + '건:');
    fails.slice(0, 12).forEach((f) => console.log('   · ' + f.cd + '  ' + f.why));
  }

  if (JSON_AT) {
    fs.writeFileSync(path.resolve(JSON_AT), JSON.stringify({ codes, rows, fails }, null, 1));
    console.log('\n결과를 파일로: ' + path.resolve(JSON_AT));
  }
  console.log('\n⚠ 읽기만 했습니다 — 운영 DB에 아무것도 넣지 않았습니다.');
})().catch((e) => { console.error('실패: ' + e.message); process.exit(1); });

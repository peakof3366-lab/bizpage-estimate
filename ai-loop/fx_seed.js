/* 요율 관리 환율 감시 최초 시드. `node ai-loop/fx_seed.js`로 직접 실행(앱 엔드포인트
   아님). dest_currency.js에 매핑된 55개 중 54개 목적지에 대해 "지금 이 순간의 환율"을
   rate_fx_baseline의 초기 기준점으로 채운다(과거 환율을 재구성하지 않음 — 오늘부터 변동을
   추적 시작한다는 정직한 단순화). db_migrate.js 실행 후, 배포 시 1회만 실행하면 됨.
   이후로는 관리자가 요율 관리에서 가격을 저장할 때마다 api/rates.js가 자동으로
   재기준하므로 이 스크립트를 다시 돌릴 필요는 없다. */
require('./_load_env')();
const { neon } = require('@neondatabase/serverless');
const DEST_CURRENCY = require('../dest_currency');

async function fetchRateToKrw(currency) {
  const code = currency.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${code}.json`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data[code] && data[code].krw;
      if (typeof rate === 'number') return rate;
    } catch {
      // 다음 URL(fallback)로 계속
    }
  }
  return null;
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const currencies = [...new Set(Object.values(DEST_CURRENCY))];

  const rateByCurrency = {};
  for (const currency of currencies) {
    const rate = await fetchRateToKrw(currency);
    if (rate === null) {
      console.warn(`[fx_seed] ${currency} 환율 조회 실패 — 이 통화를 쓰는 목적지는 건너뜀`);
      continue;
    }
    rateByCurrency[currency] = rate;
    await sql`
      insert into fx_rates (currency, rate_to_krw, fetched_at)
      values (${currency}, ${rate}, now())
      on conflict (currency) do update set rate_to_krw = excluded.rate_to_krw, fetched_at = now()
    `;
  }

  let seeded = 0;
  const skipped = [];
  for (const [destinationKey, currency] of Object.entries(DEST_CURRENCY)) {
    const rate = rateByCurrency[currency];
    if (rate === undefined) { skipped.push(destinationKey); continue; }
    await sql`
      insert into rate_fx_baseline (destination_key, currency, baseline_rate, baseline_at)
      values (${destinationKey}, ${currency}, ${rate}, now())
      on conflict (destination_key) do update
        set currency = excluded.currency, baseline_rate = excluded.baseline_rate, baseline_at = now()
    `;
    seeded++;
  }

  console.log(`fx_seed 완료: 통화 ${Object.keys(rateByCurrency).length}/${currencies.length}개 조회 성공, 목적지 ${seeded}개 기준선 생성.`);
  if (skipped.length) console.log('환율 조회 실패로 건너뛴 목적지:', skipped.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

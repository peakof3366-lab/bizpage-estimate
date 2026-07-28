/* 요율 관리 환율 감시 시드. `node ai-loop/fx_seed.js`로 직접 실행(앱 엔드포인트 아님).
   dest_currency.js에 매핑된 목적지에 대해 rate_fx_baseline의 기준점을 채운다.
   db_migrate.js 실행 후 배포 시 1회 실행. 이후로는 관리자가 요율 관리에서 가격을
   저장할 때마다 api/rates.js가 자동 재기준하므로 보통 다시 돌릴 일이 없다.

   ── 실행 모드 ──────────────────────────────────────────────────────────
   node ai-loop/fx_seed.js                 기준선이 '없는' 목적지만 채움 (기본·안전·멱등)
   node ai-loop/fx_seed.js --only 동유럽    지정한 목적지만 채움
   node ai-loop/fx_seed.js --force-reseed  전 목적지 기준선을 오늘 환율로 덮어씀 ⚠파괴적

   ⚠ 왜 기본이 '없는 것만'인가 (2026-07-28 변경):
   원래는 무조건 덮어쓰기(on conflict do update ... baseline_at = now())였다. 그래서
   목적지 하나가 빠진 걸 고치려고 이 스크립트를 다시 돌리면, 멀쩡하던 나머지 전부의
   기준선이 오늘 환율로 리셋된다. 기준선이 현재 환율과 같아지면 getFxAdjust가 전부
   1.0이 되어 그동안 쌓인 환율 변동이 견적에서 통째로 사라진다. 실제로 '동유럽'이
   DEST_CURRENCY에서 누락돼 기준선이 없던 걸 발견했는데(55개 중 54개), 그 하나를
   채우려다 54개를 망가뜨릴 뻔했다.

   ⚠ 누락분을 채울 때는 '오늘 환율'이 아니라 '같은 통화 동료의 기존 기준선'을 복사한다.
   오늘 환율로 넣으면 그 목적지만 adjust=1.0이 되어, 같은 EUR인데 파리는 환율 반영되고
   동유럽은 안 되는 불일치가 그대로 남는다. 동료가 없을 때만 오늘 환율로 시작한다. */
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
  const argv = process.argv.slice(2);
  const force = argv.includes('--force-reseed');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  const dryRun = argv.includes('--dry-run');

  if (only && !DEST_CURRENCY[only]) {
    console.error(`[fx_seed] '${only}'는 dest_currency.js에 없습니다. 먼저 통화를 매핑하세요.`);
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  /* 이미 기준선이 있는 목적지를 먼저 읽어 둔다 — 무엇을 건드릴지 판단하고,
     누락분에 복사해 줄 '같은 통화 동료'를 찾는 데 쓴다. */
  const existingRows = await sql`select destination_key, currency, baseline_rate, baseline_at from rate_fx_baseline`;
  const existing = new Map(existingRows.map(r => [r.destination_key, r]));
  const peerByCurrency = new Map();
  for (const r of existingRows) if (!peerByCurrency.has(r.currency)) peerByCurrency.set(r.currency, r);

  const targets = Object.entries(DEST_CURRENCY).filter(([k]) => {
    if (only) return k === only;
    if (force) return true;
    return !existing.has(k);          /* 기본: 없는 것만 */
  });

  console.log(`[fx_seed] 모드: ${force ? '⚠ 전체 재시드(덮어쓰기)' : only ? `단일 대상(${only})` : '누락분만'}`
    + ` · DB 기존 기준선 ${existing.size}건 · 이번 대상 ${targets.length}건`);
  if (force) {
    console.log('[fx_seed] ⚠ 전 목적지 기준선이 오늘 환율로 리셋됩니다 — 그동안 쌓인 환율 변동이 견적에서 사라집니다.');
  }
  if (!targets.length) { console.log('[fx_seed] 채울 대상이 없습니다. 종료.'); return; }

  /* 동료 기준선을 복사할 수 없는 대상에 한해서만 오늘 환율을 조회한다(불필요한 외부 호출 방지) */
  const needFetch = [...new Set(targets
    .filter(([k, cur]) => force || !peerByCurrency.has(cur))
    .map(([, cur]) => cur))];
  const rateByCurrency = {};
  for (const currency of needFetch) {
    const rate = await fetchRateToKrw(currency);
    if (rate === null) { console.warn(`[fx_seed] ${currency} 환율 조회 실패 — 이 통화를 쓰는 목적지는 건너뜀`); continue; }
    rateByCurrency[currency] = rate;
    if (!dryRun) await sql`
      insert into fx_rates (currency, rate_to_krw, fetched_at)
      values (${currency}, ${rate}, now())
      on conflict (currency) do update set rate_to_krw = excluded.rate_to_krw, fetched_at = now()
    `;
  }

  let seeded = 0, copied = 0;
  const skipped = [];
  for (const [destinationKey, currency] of targets) {
    const peer = peerByCurrency.get(currency);
    /* 전체 재시드가 아니면 동료 기준선을 그대로 복사 — 같은 통화인데 이 목적지만
       환율 반영이 안 되는 불일치를 없애는 게 목적이라, 오늘 환율로 새로 잡으면 안 된다. */
    const useePeer = !force && peer;
    const rate = useePeer ? Number(peer.baseline_rate) : rateByCurrency[currency];
    if (rate === undefined || rate === null || !isFinite(rate)) { skipped.push(destinationKey); continue; }

    const src = useePeer ? `${peer.destination_key}의 기준선 복사(${rate}, ${new Date(peer.baseline_at).toISOString().slice(0,10)})`
                         : `오늘 환율(${rate})`;
    console.log(`  ${dryRun ? '[dry-run] ' : ''}${destinationKey} (${currency}) ← ${src}`);
    if (!dryRun) {
      if (useePeer) {
        await sql`
          insert into rate_fx_baseline (destination_key, currency, baseline_rate, baseline_at)
          values (${destinationKey}, ${currency}, ${rate}, ${peer.baseline_at})
          on conflict (destination_key) do update
            set currency = excluded.currency, baseline_rate = excluded.baseline_rate, baseline_at = excluded.baseline_at
        `;
      } else {
        await sql`
          insert into rate_fx_baseline (destination_key, currency, baseline_rate, baseline_at)
          values (${destinationKey}, ${currency}, ${rate}, now())
          on conflict (destination_key) do update
            set currency = excluded.currency, baseline_rate = excluded.baseline_rate, baseline_at = now()
        `;
      }
    }
    seeded++; if (useePeer) copied++;
  }

  console.log(`fx_seed ${dryRun ? '(dry-run) ' : ''}완료: ${seeded}건 처리(동료 기준선 복사 ${copied}건 · 신규 조회 ${seeded - copied}건).`);
  if (skipped.length) console.log('환율 조회 실패로 건너뛴 목적지:', skipped.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

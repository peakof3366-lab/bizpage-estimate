/* 운영 요율 오버라이드를 측정 도구에 실어 준다 (TR)
   ───────────────────────────────────────────────────────────────────────────
   ⚠ **요율의 진실은 `data.js`가 아니라 운영 DB(`rate_overrides`)다**(CLAUDE.md).
     그런데 측정 도구(backtest·sim·gap)는 전부 jsdom으로 엔진을 띄우면서 **네트워크를
     막는다** — 안 막으면 운영 `site_events`에 행이 쌓이기 때문이다. 그 결과
     **측정은 data.js 기본값으로, 고객은 오버라이드로** 계산되는 상태가 된다.

     2026-08-13에 실측 15칸을 오버라이드에 올리면서 이 어긋남이 실제 문제가 됐다:
     그대로 두면 앞으로의 오차 수치가 전부 「고치기 전」 값이 된다.

   그래서 **공개 GET 한 번**으로 오버라이드만 받아 엔진에 얹는다.
   ⚠ 읽기 전용 API다(`/api/rates` GET) — 쓰지 않고, site_events에도 안 쌓인다.
   ⚠ 받은 값은 파일로 캐시한다. 매번 부르면 측정할 때마다 값이 달라져 전/후 대조가 깨진다.
     `--fresh-rates`를 주면 다시 받는다.
   ⚠ 못 받으면 **조용히 넘어가지 않는다.** 어느 값으로 쟀는지 화면에 반드시 밝힌다 —
     이 구분이 무너지면 측정 전체를 못 믿는다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.rate_overrides_cache.json');
const URL = process.env.BIZPAGE_RATES_URL || 'https://bizpage-estimate.vercel.app/api/rates';

async function loadOverrides(opts) {
  const fresh = (opts && opts.fresh) || process.argv.indexOf('--fresh-rates') >= 0;
  if (!fresh && fs.existsSync(CACHE)) {
    try {
      const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      return { overrides: c.overrides || {}, from: '캐시(' + String(c.at).slice(0, 19) + ')' };
    } catch (e) { /* 깨진 캐시는 다시 받는다 */ }
  }
  try {
    const res = await fetch(URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const overrides = j.overrides || {};
    fs.writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), overrides }, null, 1), 'utf8');
    return { overrides, from: '운영 DB에서 새로 받음' };
  } catch (e) {
    /* ⚠ 조용히 기본값으로 떨어지지 않는다 — 무엇으로 쟀는지 부르는 쪽이 밝히게 한다 */
    return { overrides: {}, from: '❌ 못 받음(' + String(e.message).slice(0, 40) + ') — **data.js 기본값으로 잰다**' };
  }
}

/* 엔진 안의 요율 배열에 오버라이드를 얹는다. script.js가 하는 것과 **같은 방식**이다
   (얕은 병합 Object.assign) — 다르게 얹으면 측정과 고객 화면이 다른 값을 쓴다. */
function applyOverrides(destinationRates, overrides) {
  let n = 0;
  Object.entries(overrides || {}).forEach(([key, fields]) => {
    const d = destinationRates.find((x) => x.destination_key === key);
    if (!d || !fields || typeof fields !== 'object') return;
    Object.keys(fields).forEach((f) => {
      if (!(f in d)) return;                    /* rateDate 같은 비숫자 칸은 엔진과 무관하다 */
      if (typeof fields[f] !== 'number') return;
      d[f] = fields[f]; n++;
    });
  });
  return n;
}

module.exports = { loadOverrides, applyOverrides, CACHE };

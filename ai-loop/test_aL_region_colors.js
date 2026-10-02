/* ══════════════════════════════════════════════════════════════════════════
   🎨 요율 관리 지역 색 (2026-10-02 대표 지시 「카테고리별로 색상을」)

   ■ 무엇을 보나
     [1] 지역마다 색이 있다 — REGION_ORDER 전부 + 국내 (빠지면 회청색으로 떨어진다)
     [2] 🔴 상태 색과 겹치지 않는다 — 표 안에서 빨강 = 경고 · 주황 = 확인 권장 · 초록 = 최신이다.
         지역 색이 그 계열이면 「주황 띠 = 확인 필요?」로 잘못 읽힌다.
         (채도가 낮은 회갈색처럼 거의 무채색이면 괜찮다 — 채도 0.35 미만은 빼고 잰다)
     [3] 색은 한 곳(admin/common.js)에서만 정한다 — 화면 코드에 지역 색 값을 다시 적지 않는다
     [4] 지역 제목 줄에 한글 자간·대문자 변환이 없다(CLAUDE.md 화면 규칙)
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, why) => {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (why ? ' \u2014 ' + why : '')); }
};
const common = fs.readFileSync(path.join(ROOT, 'admin', 'common.js'), 'utf8');
const rates = fs.readFileSync(path.join(ROOT, 'admin', 'rates.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'admin.css'), 'utf8');
const order = eval(common.match(/const REGION_ORDER = (\[[^\]]+\]);/)[1]);
const colors = eval('(' + common.match(/const REGION_COLORS = (\{[\s\S]*?\});/)[1] + ')');

console.log('\n[1] 지역마다 색이 있다');
const missing = order.concat(['국내']).filter((r) => !colors[r]);
ok('① REGION_ORDER 전부 + 국내에 색이 있다', missing.length === 0, missing.join(','));
const vals = Object.values(colors);
ok('① 지역끼리 색이 겹치지 않는다', new Set(vals.map((v) => v.toLowerCase())).size === vals.length);

console.log('\n[2] 🔴 상태 색(빨강·주황·초록)과 겹치지 않는다');
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
for (const [region, hex] of Object.entries(colors)) {
  const { h, s } = hsl(hex);
  const zone = s < 0.35 ? '' : (h >= 350 || h < 15) ? '빨강' : (h >= 15 && h < 50) ? '주황' : (h >= 90 && h < 160) ? '초록' : '';
  ok(`② ${region} ${hex} (색상 ${h.toFixed(0)}° · 채도 ${s.toFixed(2)})`, !zone, zone + ' 계열 — 상태 색과 헷갈린다');
}

console.log('\n[3] 색은 한 곳에서만');
ok('③ 화면 코드가 regionColor()를 부른다', /regionColor\(/.test(rates));
const leaked = vals.filter((v) => rates.includes(v));
ok('③ admin/rates.js에 지역 색 값을 다시 적지 않았다', leaked.length === 0, leaked.join(','));

console.log('\n[4] 지역 제목 줄');
const rule = (css.match(/\.rate-region-row td \{[^}]*\}/) || [''])[0];
ok('④ 제목 줄 규칙이 있다', !!rule);
ok('④ 한글 자간을 벌리지 않는다 · 대문자 변환 없음', !/letter-spacing/.test(rule) && !/uppercase/.test(rule), rule);
ok('④ 지역 색을 바탕·띠로 쓴다(--rg)', /var\(--rg/.test(rule));

console.log('\n' + '─'.repeat(64));
console.log(`결과: ${pass} pass / ${fail} fail  — aL 요율 관리 지역 색`);
process.exit(fail ? 1 : 0);

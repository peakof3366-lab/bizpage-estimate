/* 관리자 글자 크기 값 → px (2026-10-12 글자 크기 표 도입)

   admin.css의 글자 크기는 이제 `var(--fs-xs)` 같은 **토큰**이다. 「11px 이상인가」를 CSS 글자로 읽던 검사들이
   토큰을 못 읽어 「못 찾음」으로 떨어졌다. 토큰 표는 admin.css `:root` 한 곳이 진실이다 —
   여기서 값을 다시 적지 않고 **그 파일에서 읽는다**(두 벌이 되면 표를 바꿀 때 검사만 옛 값을 본다).

   fsPx('var(--fs-xs)') → 12.8 · fsPx('.85rem') → 13.6 · fsPx('13px') → 13 · 못 읽으면 NaN */
const fs = require('fs');
const path = require('path');

let TOKENS = null;
function tokens() {
  if (TOKENS) return TOKENS;
  const css = fs.readFileSync(path.join(__dirname, '..', 'admin.css'), 'utf8');
  TOKENS = {};
  for (const m of css.matchAll(/--(fs-[\w-]+)\s*:\s*([\d.]+)(rem|px)/g)) {
    TOKENS[m[1]] = m[3] === 'rem' ? parseFloat(m[2]) * 16 : parseFloat(m[2]);
  }
  return TOKENS;
}

function fsPx(value) {
  const v = String(value || '').replace(/!important/, '').trim();
  let m = /^var\(--(fs-[\w-]+)\)$/.exec(v);
  if (m) return tokens()[m[1]] !== undefined ? tokens()[m[1]] : NaN;
  m = /^([\d.]+)(rem|px)$/.exec(v);
  if (m) return m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
  return NaN;
}

/* 규칙 본문(`.x { … }`)에서 font-size 값을 꺼내 px로 */
function ruleFsPx(src, selectorRe) {
  const m = new RegExp(selectorRe + '\\s*\\{[^}]*?font-size:\\s*([^;}]+)').exec(src);
  return m ? fsPx(m[1]) : NaN;
}

module.exports = { fsPx, ruleFsPx, tokens };

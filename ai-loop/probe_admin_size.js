/* ═══════════════════════════════════════════════════════════════════════════
   `admin.html` **안에 무엇이 들어 있는가**를 세는 자 (XR) — 읽기 전용

   실행: node ai-loop/probe_admin_size.js [--all]

   ■ 왜 만들었나
   `audit_internals.js`가 「admin.html 865KB / 13,881줄」이라고 짚는다. 그런데 그 한 줄로는
   **쪼갤 수 있는지**를 판단할 수 없다. 쪼개려면 세 가지를 먼저 알아야 한다:
     ① 덩치가 어디에 있나 — 모양(CSS)인가 · 뼈대(HTML)인가 · 동작(JS)인가
     ② 그 안이 **하나의 괴물**인가, 아니면 잘게 갈려 있나 (괴물이면 그것부터)
     ③ 🔴 **쪼개면 무엇이 조용히 눈이 머나** — 이게 결론을 뒤집는다

   ■ 🔴 ③이 이 도구의 존재 이유다
   저장소의 검사 상당수가 `admin.html`을 **글자로 읽어** 정규식으로 대조한다.
   인라인 `<script>`를 바깥 파일로 빼면 그 검사들은 **읽을 글자가 없어져**
   아무것도 안 지키면서 초록이 된다. XQ에서 목록을 단일 출처로 모았을 때
   정확히 이 일이 다섯 건 났다 — 여기서는 그 규모가 훨씬 크다.
   그래서 이 도구는 **그 검사 수를 함께 센다.** 그 수가 쪼개기의 문턱이다.

   ⚠ 이 도구는 아무것도 안 고친다. 세기만 한다 — 판단은 사람이 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ALL = process.argv.includes('--all');

const src = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const lineAt = (i) => src.slice(0, i).split('\n').length;
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const kb = (n) => Math.round(n / 1024) + 'KB';
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0) + '%';

console.log('\n' + '═'.repeat(70));
console.log('■ ① 덩치가 어디에 있나 — 모양 · 뼈대 · 동작');
console.log('═'.repeat(70));

/* `<style>`·인라인 `<script>` 블록을 실제 위치로 잡는다(정규식 한 방으로는 못 센다) */
function blocks(tag) {
  const out = [];
  const re = new RegExp('<' + tag + '(\s[^>]*)?>', 'g');
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('</' + tag + '>', start);
    if (end < 0) continue;
    out.push({ start, end, from: lineAt(m.index), to: lineAt(end), size: bytes(src.slice(start, end)) });
  }
  return out;
}
const styles = blocks('style');
const scripts = blocks('script').filter((b) => b.size > 0);
const total = bytes(src);
const styleSum = styles.reduce((a, b) => a + b.size, 0);
const scriptSum = scripts.reduce((a, b) => a + b.size, 0);
const markup = total - styleSum - scriptSum;

console.log('\n  전체 ' + kb(total) + ' · ' + src.split('\n').length + '줄');
console.log('   · 동작(인라인 <script>) ' + kb(scriptSum).padStart(7) + '  ' + pct(scriptSum, total).padStart(4)
  + '   블록 ' + scripts.length + '개');
console.log('   · 모양(<style>)         ' + kb(styleSum).padStart(7) + '  ' + pct(styleSum, total).padStart(4)
  + '   블록 ' + styles.length + '개');
console.log('   · 뼈대(HTML)           ' + kb(markup).padStart(7) + '  ' + pct(markup, total).padStart(4));
const ext = [...src.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
console.log('   · 바깥 파일로 이미 나가 있는 것: ' + ext.length + '개 — ' + ext.join(' · '));

console.log('\n' + '═'.repeat(70));
console.log('■ ② 그 안은 하나의 괴물인가 — 최상위 조각으로 갈라 본다');
console.log('═'.repeat(70));

const big = scripts.slice().sort((a, b) => b.size - a.size)[0];
const jsLines = src.slice(big.start, big.end).split('\n');
console.log('\n  가장 큰 <script>: 줄 ' + big.from + '-' + big.to + ' (' + jsLines.length + '줄 · ' + kb(big.size) + ')');

/* 들여쓰기 2칸이 이 블록의 최상위다(전체가 `<script>` 안에 한 단 들어가 있다) */
const DECL = /^ {2}(?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|\(function\s*([A-Za-z_$][\w$]*)?)/;
const decls = [];
jsLines.forEach((l, i) => {
  const m = DECL.exec(l);
  if (m) decls.push({ i, name: m[1] || m[2] || m[3] || '(이름 없는 IIFE)' });
});
const chunks = decls.map((d, k) => ({
  name: d.name,
  line: big.from + d.i,
  size: (k + 1 < decls.length ? decls[k + 1].i : jsLines.length) - d.i,
}));
chunks.sort((a, b) => b.size - a.size);
console.log('  최상위 조각 ' + chunks.length + '개 — 가장 큰 것이 ' + chunks[0].size + '줄('
  + pct(chunks[0].size, jsLines.length) + ')이다.');
console.log('  → **괴물 함수 하나를 떼는 문제가 아니다.** 넓게 깔려 있다.\n');
(ALL ? chunks : chunks.slice(0, 12)).forEach((c) => {
  console.log('   · ' + String(c.size).padStart(4) + '줄  ' + c.name.padEnd(30) + ' admin.html:' + c.line);
});

/* 이름 첫 낱말로 묶으면 **화면 단위**가 보인다 — 쪼갠다면 이 경계다 */
const groups = new Map();
chunks.forEach((c) => {
  const m = /^[a-z]+/.exec(c.name);
  const k = m ? m[0] : c.name;
  groups.set(k, (groups.get(k) || 0) + c.size);
});
const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\n  이름 첫 낱말별 합계(= 화면 단위에 가깝다) 상위 10:');
top.forEach(([k, v]) => console.log('   · ' + k.padEnd(12) + String(v).padStart(5) + '줄  ' + pct(v, jsLines.length)));

console.log('\n' + '═'.repeat(70));
console.log('■ ③ 탭 패널 — 뼈대는 이미 잘게 갈려 있다');
console.log('═'.repeat(70));
const tabs = [...src.matchAll(/id="tab-([^"]+)"/g)].map((m) => ({ name: m[1], at: m.index }));
let tabSum = 0;
const rows = tabs.map((t, i) => {
  const end = i + 1 < tabs.length ? tabs[i + 1].at : t.at;
  const size = bytes(src.slice(t.at, end));
  tabSum += size;
  return { name: t.name, from: lineAt(t.at), size };
});
console.log('\n  탭 ' + tabs.length + '개 · 합 ' + kb(tabSum) + ' (뼈대의 ' + pct(tabSum, markup) + ')');
rows.sort((a, b) => b.size - a.size).slice(0, ALL ? rows.length : 6)
  .forEach((r) => console.log('   · ' + r.name.padEnd(14) + String(r.size).padStart(6) + '자  admin.html:' + r.from));

console.log('\n' + '═'.repeat(70));
console.log('■ ④ 🔴 쪼개면 무엇이 눈이 머나 — 이게 문턱이다');
console.log('═'.repeat(70));
const AI = path.join(ROOT, 'ai-loop');
let textReaders = 0; let bootOnly = 0;
const names = [];
for (const f of fs.readdirSync(AI)) {
  if (!f.endsWith('.js')) continue;
  if (f === path.basename(__filename)) continue;   /* 자기 자신은 세지 않는다 */
  const t = fs.readFileSync(path.join(AI, f), 'utf8');
  if (!t.includes('admin.html')) continue;
  /* **글자로 읽는가** — 읽는다면 인라인 <script>를 빼는 순간 대조할 것이 사라진다 */
  if (/readFileSync\([^)]*admin\.html|read\(\s*['"]admin\.html/.test(t)) { textReaders++; names.push(f); }
  else bootOnly++;
}
console.log('\n  `admin.html`을 **글자로 읽어** 대조하는 검사: 🔴 ' + textReaders + '개');
console.log('  이름만 나오는 것(띄우기만 하거나 언급): ' + bootOnly + '개');
console.log('\n  → 인라인 `<script>`를 바깥 파일로 빼면 이 ' + textReaders + '개가 **읽을 글자를 잃는다.**');
console.log('    깨지면 차라리 낫다 — 대개는 **조용히 통과**한다(정규식이 아무것도 못 찾으면 0건이고,');
console.log('    0건을 「지킬 것이 없다」로 읽는 검사가 있다). XQ에서 다섯 건이 정확히 그랬다.');
console.log('\n  🔴 **쪼개기 전에 할 일은 쪼개기가 아니다** — 이 ' + textReaders + '개가 「admin의 스크립트」를');
console.log('    한 곳(예: `ai-loop/_admin_src.js`)에서 받아 가게 먼저 바꾼다. 그러면 파일이');
console.log('    갈라져도 검사는 따라온다. 그 전에는 쪼개면 안 된다.');
if (ALL) { console.log('\n  글자로 읽는 검사 전체:'); names.forEach((n) => console.log('   · ' + n)); }
console.log('');

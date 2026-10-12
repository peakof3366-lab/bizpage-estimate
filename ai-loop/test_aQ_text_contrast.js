/* 관리자 화면 「잘 안 보이는 글자」 정리 (2026-10-12, 대표 「글자 크기·배경색 때문에 안 보이는 것 전체적으로」)

   브라우저 실측(`check_contrast.py`, 진짜 핸들러 데이터로 관리자 18화면 + 견적 작성 ①~⑤ + 일정 미리보기)에서
   흐린 글자(대비 4.5:1 미만) **408곳 → 0곳**. 그중 378곳(93%)이 보조 회색 `--muted` #787878 **하나**였다 —
   흰 바탕에선 겨우 통과하지만 관리자 바탕(#F4F4F2)·색 띠 위에서 3.6~4.3:1로 떨어졌다.

   브라우저 검사는 회귀 스위트에 못 넣는다(설치가 필요). 그래서 여기서는 **다시 무너지는 두 길**을 막는다:
   ① 색 토큰이 다시 옅어진다 → 관리자에서 실제로 쓰이는 바탕 15종 위에서 계산한다.
   ② 오늘 걷어낸 흐린 회색이 글자색으로 다시 박힌다 → 그 값들을 찾는다.
   ⚠ 흰 바탕만 기준으로 모든 색을 정적으로 재면 **어두운 바탕 위 흰 글자**를 전부 오탐한다(실제로 해 봤다).
     바탕은 정적으로 알 수 없다 — 그건 브라우저 도구의 몫이다.

   실행: node ai-loop/test_aQ_text_contrast.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const lum = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* 2026-10-12 실측에서 보조 회색이 놓였던 바탕 15종 (check_contrast.py 결과 그대로) */
const BGS = ['#FFFFFF', '#F4F4F2', '#E1F3F2', '#E3F3FA', '#E4E8F0', '#E8EEFA', '#ECEDEE', '#EFF6FF', '#F0ECFA',
  '#F0F4F8', '#F1F0FB', '#F5F3FF', '#F6EAF9', '#FBE8EE', '#FFFBEB'];
const token = (src, name) => { const m = src.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{3,6})')); return m && m[1]; };

console.log('[1] 색 토큰 — 관리자 바탕 15종 위에서 4.5:1 이상');
const ADMIN_CSS = read('admin.css'), MANUAL = read('manual.html'), PRO = read('admin-quote-pro.html');
for (const [file, src, name, bgs] of [
  ['admin.css', ADMIN_CSS, 'muted', BGS],
  ['manual.html', MANUAL, 'muted', BGS],
  ['admin-quote-pro.html', PRO, 't-dim', ['#FFFFFF', '#F4F4F0', '#FBF7F7', '#FBFBF9']],
  ['admin.css', ADMIN_CSS, 'danger', ['#FFFFFF', '#F4F4F2', '#FEF2F2']],
  ['manual.html', MANUAL, 'danger', ['#FFFFFF', '#F4F4F2', '#FEF2F2']],
]) {
  const c = token(src, name);
  const worst = c ? Math.min(...bgs.map((b) => cr(c, b))) : 0;
  ok(`${file} --${name} ${c} — 가장 나쁜 바탕에서 ${worst.toFixed(2)}:1`, c && worst >= 4.5);
}
ok('관리자와 매뉴얼의 보조 회색이 같다(두 벌이 되면 한쪽만 낡는다)', token(ADMIN_CSS, 'muted') === token(MANUAL, 'muted'));

console.log('[2] 걷어낸 흐린 회색이 글자색으로 다시 박히지 않았다');
const BANNED = ['#888888', '#888', '#999999', '#999', '#aaaaaa', '#aaa', '#9a9a94', '#9a9a9a', '#94a3b8',
  '#7a8fa6', '#8a8a8a', '#787878', '#777777', '#777'];
/* 이유가 적힌 예외 — 비활성 버튼(관례: 못 누른다는 표시) · 미리보기 빈 칸 안내(밝은·어두운 바탕 겸용으로 고른 값) */
const ALLOWED = [/:disabled/, /pv-edit:empty::before/];
const files = ['admin.html', 'admin.css', 'admin-quote-pro.html', 'manual.html', 'quote_doc.css',
  ...fs.readdirSync(path.join(ROOT, 'admin')).filter((f) => f.endsWith('.js')).map((f) => 'admin/' + f)];
const hits = [];
for (const f of files) {
  read(f).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) {
      if (!BANNED.includes(m[1].toLowerCase())) continue;
      if (ALLOWED.some((re) => re.test(line))) continue;
      hits.push(`${f}:${i + 1} ${m[1]}`);
    }
  });
}
ok('흐린 회색 글자색 0곳', hits.length === 0, hits.join(' · '));

console.log('[3] 고객 견적서 편집 칸(노란 바탕) — 흐린 글자를 진하게');
const QD = read('quote_doc.css');
ok('편집 칸이 물려받은 색을 진하게 섞는다', /\.qd-ed \{[^}]*color: color-mix\(in srgb, currentColor 70%, #000\)/.test(QD));
ok('담당자 칸(더 구체적인 규칙이 이기는 자리)도 따로 진하게', /\.qd-staff span\.qd-ed \{ color: color-mix/.test(QD));
ok('고객 문서의 기본 보조색은 그대로다(편집 칸만 바꿨다)', /--qd-muted: #6B7280;/.test(QD));

console.log('[4] 작은 글자 — 관리자 파일에 11px 이하가 없다');
const tiny = [];
for (const f of ['admin.html', 'admin.css', ...fs.readdirSync(path.join(ROOT, 'admin')).filter((x) => x.endsWith('.js')).map((x) => 'admin/' + x)]) {
  read(f).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) < 12) tiny.push(`${f}:${i + 1} ${m[1]}px`);
  });
}
ok('관리자 화면 파일에 12px 미만 글자 규칙이 없다', tiny.length === 0, tiny.join(' · '));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

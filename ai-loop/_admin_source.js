/* ═══════════════════════════════════════════════════════════════════════════
   관리자 화면의 **소스 전체**를 문자열로 준다 — 단일 출처 (구조 정리 1단계)

   ■ 왜 이 파일이 생겼나

   `admin.html` 한 파일에 화면 17개가 들어 있다(15,148줄 · 981KB). 그중 76%가
   인라인 `<script>` 하나(11,500줄)다. 대장 버튼 하나를 고치려고 15,148줄짜리
   파일을 여는 구조라, 이 파일을 화면 단위로 쪼개려 한다.

   그런데 검사 **124개 파일 · 286곳**이 `admin.html` 경로를 직접 적고 있었다.
   그중 82개는 파일을 **문자열로 읽어 정규식으로 잰다**:

       ok('저장 버튼이 있다', /led-st-save/.test(read('admin.html')));

   🔴 **이 모양이 쪼개기의 진짜 위험이다.** 글자가 `admin/ledger.js`로 옮겨 가는
     순간 저 정규식은 그냥 `false`가 된다 — **틀렸다고 말하지 않고, 검사는
     「없다」고 판정한다.** 반대로 판정이 뒤집히는 검사(`!/…/.test()`)는 **조용히
     통과한다.** 안전망 82개가 한꺼번에 무력해지는 자리다(결함 생성기 ③).

   → 그래서 「관리자 화면의 소스」가 **무엇으로 이루어져 있는지**를 여기 한 곳에만
     적는다. 파일을 쪼갤 때 손댈 곳은 아래 `ADMIN_PARTS` **한 줄**이다.

   ■ 쓰는 법

       const { adminSource } = require('./_admin_source');
       ok('저장 버튼이 있다', /led-st-save/.test(adminSource()));

   ■ ⚠ 화면을 **띄우는** 것은 여기가 아니다
     `new JSDOM(read('admin.html'))`처럼 화면을 띄우는 자리는 이 함수를 쓰면 안 된다.
     쪼갠 뒤 이 함수는 **여러 파일을 이어 붙인 것**을 돌려주므로, 그대로 파서에
     먹이면 스크립트가 두 번 실행되거나 마크업이 겹친다. 띄우는 쪽은 `_admin_boot`가
     맡는다(다음 단계).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 🔴 **관리자 화면을 이루는 파일 목록 — 여기가 진실이다.**
   `admin.html`을 쪼갤 때(2a: CSS, 2b: 화면별 스크립트) 이 배열만 늘린다.
   ⚠ 순서는 「사람이 읽는 순서」다. 이 문자열은 **정규식으로 재는 용도**이지
     실행하거나 파싱하는 용도가 아니라, 로드 순서와 같을 필요는 없다. */
const ADMIN_PARTS = ['admin.html'];

/* 🔴 **정말 관리자 화면을 읽었는지 확인하는 닻.**
   이어 붙인 결과에 이것이 없으면 목록이 틀렸거나 파일이 비었다는 뜻이다.
   없으면 **던진다** — 빈 문자열을 돌려주면 82개 검사가 전부 「없다」로 조용히
   판정을 뒤집는다. 이 파일이 막으려는 것이 바로 그것이다. */
const ANCHORS = ['id="dashPage"', 'class="tab-panel"'];

let _cache = null;

function adminSource() {
  if (_cache !== null) return _cache;

  const parts = ADMIN_PARTS.map((f) => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) {
      throw new Error(
        `[_admin_source] 관리자 화면 조각이 없습니다: ${f}\n`
        + '  → 파일을 옮겼거나 이름을 바꿨다면 ADMIN_PARTS를 함께 고쳐야 합니다.');
    }
    const s = fs.readFileSync(p, 'utf8');
    if (!s.trim()) throw new Error(`[_admin_source] 조각이 비어 있습니다: ${f}`);
    return s;
  });

  /* ⚠ 조각 사이에 줄바꿈을 넣는다. 안 넣으면 앞 파일의 마지막 줄과 뒤 파일의
     첫 줄이 한 줄로 붙어, 줄 단위로 재는 검사가 그 한 줄을 못 본다. */
  const src = parts.join('\n');

  const missing = ANCHORS.filter((a) => !src.includes(a));
  if (missing.length) {
    throw new Error(
      `[_admin_source] 관리자 화면이 아닌 것을 읽었습니다 — 닻이 없습니다: ${missing.join(', ')}\n`
      + `  읽은 조각: ${ADMIN_PARTS.join(', ')} (합계 ${src.length}자)`);
  }

  _cache = src;
  return src;
}

/* 쪼개기 진행 상황을 사람이 볼 수 있게 — 검사가 아니라 보고용이다 */
function adminParts() {
  return ADMIN_PARTS.map((f) => ({
    file: f,
    bytes: fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : 0,
  }));
}

module.exports = { adminSource, adminParts, ADMIN_PARTS };

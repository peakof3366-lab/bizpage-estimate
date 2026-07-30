/* PK 검증: 여러 명이 동시에 쓰는 상황에서 깨지던 것들.

   ① 요율 동시 편집 변경 유실 — 예전 PATCH는 select로 현재값을 읽고 JS에서 합쳐
      통째로 덮어썼다(read-modify-write). A가 도쿄 항공료를, B가 도쿄 호텔비를 거의
      동시에 저장하면 나중 사람이 '자기가 읽은 낡은 전체 값'으로 덮어써서 먼저 저장한
      쪽 변경이 조용히 사라진다. 둘 다 "저장됐습니다"를 받고 변경 이력에도 두 건 다
      남으므로 아무도 눈치채지 못한다. 팀원이 1명일 땐 안 보이다가 5명이 되면 밟는다.
      → 병합을 SQL 안(jsonb ||)에서 하도록 바꿨고, 이 파일이 그 성질을 고정한다.

   ② 문의·견적 개별 삭제 권한 — 예전엔 로그인만 하면 누구나 고객 리드를 영구 삭제할
      수 있었다. 되돌릴 방법도 누가 지웠는지 남는 기록도 없다.

   DB 없이 소스 대조로 검사한다(핸들러 실행에는 운영 DB가 필요하고, 검증하려는 건
   '어떤 SQL을 쓰는가'라는 구조적 성질이라 원문 확인이 정확하다).
   실행: node ai-loop/test_pK_concurrency_perms.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const ratesSrc = read(path.join('api', 'rates.js'));
/* PATCH 블록만 잘라낸다 — 다른 액션의 SQL이 섞이면 단언이 엉뚱한 곳을 본다. */
const patchStart = ratesSrc.indexOf("if (req.method === 'PATCH')");
const patchBlock = patchStart < 0 ? '' : ratesSrc.slice(patchStart);

console.log('[1] 요율 저장이 원자적 병합인가');
ok('PATCH 블록을 찾았다', patchBlock.length > 0);
ok('SQL 안에서 jsonb 병합(||)을 쓴다',
  /set overrides = coalesce\(rate_overrides\.overrides, '\{\}'::jsonb\) \|\| excluded\.overrides/.test(patchBlock));
ok('저장 결과를 returning으로 되받는다', /returning overrides/.test(patchBlock));
ok('보낼 값은 이번에 바뀐 필드만(patch)', /const patch = \{\};[\s\S]{0,120}patch\[c\.field\] = c\.newValue/.test(patchBlock));

/* 되돌아가면 안 되는 옛 구현의 흔적 */
ok('저장 전에 현재값을 select 하지 않는다(read-modify-write 제거)',
  !/select overrides from rate_overrides/.test(patchBlock),
  'select overrides ... 가 다시 등장함');
ok('전체 값을 통째로 덮어쓰지 않는다',
  !/set overrides = excluded\.overrides/.test(patchBlock),
  'excluded.overrides 통짜 덮어쓰기가 다시 등장함');
ok('응답이 DB가 확정한 값이다', /const merged = saved\.length \? saved\[0\]\.overrides : patch/.test(patchBlock));

console.log('\n[2] 다른 공유 데이터도 통짜 덮어쓰기가 아닌가');
const contentSrc = read(path.join('api', 'content.js'));
ok('콘텐츠 오버라이드는 키 단위 upsert(경합 무관)', /insert into content_overrides \(key, value, updated_at\)/.test(contentSrc));
const inqIdSrc = read(path.join('api', 'inquiries', '[id].js'));
const qIdSrc = read(path.join('api', 'quotes', '[id].js'));
ok('문의 진행기록은 SQL에서 append(활동 이력 유실 없음)', /activity_log = activity_log \|\|/.test(inqIdSrc));
ok('견적 진행기록은 SQL에서 append', /activity_log = activity_log \|\|/.test(qIdSrc));

console.log('\n[3] 문의·견적 개별 삭제 권한');
for (const [label, src] of [['문의', inqIdSrc], ['견적', qIdSrc]]) {
  const delStart = src.indexOf("if (req.method === 'DELETE')");
  const delBlock = delStart < 0 ? '' : src.slice(delStart);
  ok(`${label} DELETE 블록을 찾았다`, delBlock.length > 0);
  ok(`${label} 삭제가 매니저 이상으로 잠김`,
    /requireRole\(req, res, \['owner', 'manager'\]\)/.test(delBlock));
  ok(`${label} 권한 검사가 실제 삭제보다 먼저`,
    delBlock.indexOf('requireRole') < delBlock.indexOf('delete from'));
}

console.log('\n[4] 화면도 같은 기준으로 가려지는가');
const adminSrc = read('admin.html');
ok('삭제 버튼에 id가 붙어 있다', /id="btnDeleteInquiry"/.test(adminSrc) && /id="btnDeleteQuote"/.test(adminSrc));
/* PV에서 목록에 일괄 삭제 버튼 셋이 추가됐다(문의 전체·견적 선택·견적 전체 — 서버는
   매니저 이상으로 막는데 화면에서 빠져 있었다). 여기서는 개별 삭제 두 개가 여전히
   그 목록에 있고 !isManagerUp 기준으로 가려지는지만 본다. */
const roleHideBlock = (adminSrc.match(/for \(const id of \[[\s\S]{0,240}?\]\)[\s\S]{0,240}?!isManagerUp/) || [''])[0];
ok('역할에 따라 삭제 버튼을 숨긴다',
  roleHideBlock.includes("'btnDeleteInquiry'") && roleHideBlock.includes("'btnDeleteQuote'"),
  roleHideBlock.slice(0, 120));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

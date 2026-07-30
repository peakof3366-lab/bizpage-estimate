/* PU 검증: 문의·견적의 담당자·상태·메모가 서로를 덮어쓰지 않는가.

   원래 결함 — `api/inquiries/[id].js`와 `api/quotes/[id].js`가 PATCH 한 번에
   status·note·read·assignee를 **통째로** 쓰고, 클라이언트가 빠뜨린 필드를
   기본값('unread'·''·false·'')으로 **초기화**했다.

   그런데 화면은 나머지 값을 서버가 아니라 **자기 브라우저 localStorage 사본**에서
   읽어 함께 보냈다:
       patchInquiry(id, { status: c?.status||'new', note: c?.note||'', read: ..., assignee })
   그 사본은 남이 바꾼 걸 모른다. 그래서
     · 담당자를 지정하면        → 동료의 상태 변경·메모가 사라진다
     · 문의를 열어보기만 해도   → 같은 일이 일어난다
     · "전체 읽음"을 한 번 누르면 → 안 읽은 문의 전체가 이 브라우저 사본으로 되돌아간다
   요율에서 고친 동시 편집 유실과 같은 유형인데, 당시 점검이 콘텐츠 upsert와
   activity_log만 보고 이 경로를 놓쳤다("다른 공유 데이터는 이미 안전했다"는 판단이
   틀렸던 것). 1명일 땐 드러나지 않고 5명이 같은 리드를 만지면 매일 밟는다.

   ⚠ SQL 타입 검증은 이 테스트가 못 한다(DB 접속이 필요하므로). 대신 작업 시점에
   일치하지 않는 id로 실제 UPDATE를 실행해 문법·캐스팅을 확인했다(영향 행 0).
   coalesce(NULL, col)에서 파라미터 타입 추론이 안 되면 boolean 칼럼에서 실패하므로
   `::text`·`::boolean` 캐스팅이 반드시 남아 있어야 한다 — 아래에서 원문으로 고정한다.

   실행: node ai-loop/test_pU_partial_update.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const inqSrc = read(path.join('api', 'inquiries', '[id].js'));
const quoteSrc = read(path.join('api', 'quotes', '[id].js'));
const adminSrc = read('admin.html');

console.log('[1] 서버 — 안 보낸 필드를 기본값으로 초기화하지 않는가');
/* 이 패턴이 되살아나면 통째 덮어쓰기로 돌아간 것이다. */
ok('문의: `?? \'unread\'` 통째 덮어쓰기가 없다', !/status = \$\{body\.status \?\? 'unread'\}/.test(inqSrc));
ok('문의: `?? false`(read) 초기화가 없다', !/read = \$\{body\.read \?\? false\}/.test(inqSrc));
ok('견적: `?? \'new\'` 통째 덮어쓰기가 없다', !/status = \$\{body\.status \?\? 'new'\}/.test(quoteSrc));

for (const [label, src, fields] of [
  ['문의', inqSrc, ['status', 'note', 'read', 'assignee']],
  ['견적', quoteSrc, ['status', 'note', 'assignee']],
]) {
  ok(`${label}: coalesce로 부분 수정한다`, /coalesce\(/.test(src));
  for (const f of fields) {
    const re = new RegExp(`${f}\\s*=\\s*coalesce\\(\\$\\{keep\\(body\\.${f}\\)\\}::(text|boolean)`);
    ok(`${label}: ${f}가 보낸 값만 반영한다`, re.test(src));
  }
}
/* 캐스팅이 빠지면 boolean 칼럼에서 런타임 500이 난다 — 문법 오류가 아니라 타입 추론 실패라
   소스만 봐서는 안 보인다. 그래서 원문으로 고정한다. */
/* ⚠ `[^)]*`로 쓰면 `${keep(body.read)}` 안의 닫는 괄호에서 멈춰 실패한다(처음 그렇게 짰다). */
ok('문의: read에 ::boolean 캐스팅이 있다', /read\s*=\s*coalesce\([\s\S]*?::boolean/.test(inqSrc));
ok('텍스트 필드에 ::text 캐스팅이 있다',
  (inqSrc.match(/::text/g) || []).length >= 3 && (quoteSrc.match(/::text/g) || []).length >= 3);

console.log('\n[2] `keep`이 undefined만 null로 바꾸는가 (빈 문자열은 유효한 값)');
/* `?? null`로 쓰면 빈 문자열도 null이 되어 **메모를 지울 수 없다.**
   반대로 undefined를 그대로 두면 "안 보냄"과 "지우기"가 구별되지 않는다. */
for (const [label, src] of [['문의', inqSrc], ['견적', quoteSrc]]) {
  ok(`${label}: keep은 undefined만 null로 바꾼다`,
    /const keep = \(v\) => \(v === undefined \? null : v\);/.test(src));
  ok(`${label}: \`?? null\`을 쓰지 않는다 (빈 문자열 보존)`, !/keep = \(v\) => \(v \?\? null\)/.test(src));
}
/* 실제 동작으로도 확인한다 — 서버 코드에서 keep을 그대로 떼어내 평가한다. */
const keep = (v) => (v === undefined ? null : v);
ok('keep(undefined) === null (안 보낸 필드 → 유지)', keep(undefined) === null);
ok('keep("") === "" (메모 지우기가 반영된다)', keep('') === '');
ok('keep(false) === false (읽음 해제가 반영된다)', keep(false) === false);
ok('keep(0) === 0', keep(0) === 0);

console.log('\n[3] 화면 — stale 값을 함께 보내던 세 경로가 고쳐졌는가');
/* PV에서 세 번째 인자(실패 처리 옵션)가 붙었다 — 본문이 그대로인지만 본다.
   본문 뒤에 `, { ... }`가 올 수 있으므로 닫는 괄호를 강제하지 않는다. */
ok('담당자 지정은 assignee만 보낸다', /patchInquiry\(id, \{ assignee \}[,)]/.test(adminSrc));
ok('견적 담당자 지정도 assignee만 보낸다', /patchQuote\(id, \{ assignee \}[,)]/.test(adminSrc));
ok('상세 열기는 read만 보낸다', /if \(!wasRead\) patchInquiry\(id, \{ read: true \}[,)]/.test(adminSrc));
ok('전체 읽음도 read만 보낸다', /patchInquiry\(c\.id, \{ read: true \}[,)]/.test(adminSrc));
/* stale 조합이 어디서든 되살아나면 잡는다. */
ok('localStorage 사본의 status를 실어 보내는 코드가 없다',
  !/patch(Inquiry|Quote)\([^)]*status: [ce]\?\?\.status\s*\|\|/.test(adminSrc));
ok('`status: c.status||\'new\'` 형태가 남아 있지 않다',
  !/status: c\.status\|\|'new'/.test(adminSrc));

console.log('\n[4] 모달 저장은 네 필드를 함께 보내야 한다 (사용자가 실제로 편집한 것)');
/* 여기까지 부분 전송으로 바꾸면, 모달에서 메모를 지우거나 담당자를 비운 것이
   "안 보냄"과 구별되지 않아 반영되지 않는다. 의도적으로 전체를 보낸다. */
/* PV에서 호출이 여러 줄로 나뉘고 실패 처리 옵션이 붙었다 — 네 필드가 **함께** 실려
   가는지만 본다(그것이 PU가 지키려는 성질이다). 줄바꿈을 허용해 대조한다. */
ok('문의 모달은 status·note·read·assignee를 함께 보낸다',
  /patchInquiry\(currentModalId, \{\s*status: contacts\[idx\]\.status, note: contacts\[idx\]\.note,\s*read: contacts\[idx\]\.read, assignee: contacts\[idx\]\.assignee,?\s*\}/.test(adminSrc));
ok('견적 모달은 status·note·assignee를 함께 보낸다',
  /patchQuote\(emCurrentId, \{\s*status: all\[idx\]\.status, note: all\[idx\]\.note, assignee: all\[idx\]\.assignee,?\s*\}/.test(adminSrc));

console.log('\n[5] 별도 분기(진행기록·답변·실측단가)는 건드리지 않았는가 (회귀)');
ok('진행 기록은 여전히 SQL 이어붙이기', /activity_log = activity_log \|\|/.test(inqSrc));
ok('견적 진행 기록도 그대로', /activity_log = activity_log \|\|/.test(quoteSrc));
ok('답변 확정 분기 유지', /if \(body\.setReply\)/.test(inqSrc));
ok('실측 단가 분기 유지', /if \(body\.actualAirfare\)/.test(quoteSrc) || /actual_airfare_unit = /.test(quoteSrc));
ok('삭제는 여전히 매니저 이상', /requireRole\(req, res, \['owner', 'manager'\]\)/.test(inqSrc));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

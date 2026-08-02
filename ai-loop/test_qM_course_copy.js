/* QM 검증: 일정 관리 '코스 가져오기' + 저장 실패 문구.

   여기서 고정하는 것:
   ① **깊은 복사**. 참조를 그대로 넣으면 가져온 코스를 고칠 때 원본 ITINERARY_DB가 함께
      바뀐다. 그러면 '기본값으로 되돌리기'가 **이미 오염된 기본값**으로 되돌아가고,
      다른 목적지의 후보 목록에도 남의 목적지 문구가 섞인다. 화면에는 아무 증상이 없다.
   ② 클라이언트 상한(ITI_MAX_COURSES)이 서버(api/content.js MAX_COURSES)와 **같은 값**인가.
      두 파일을 직접 대조한다 — CLAUDE.md가 "불가피하게 나뉘면 테스트로 대조한다"고 정한 자리.
   ③ 가져온 코스에 원래 목적지 이름이 남은 것을 **말해 주는가**. 자동 치환은 '도쿄 도청'
      같은 고유명사를 망가뜨리므로 하지 않되, 조용히 두면 오사카 일정에 '도쿄'가 적힌 채
      고객에게 나간다(결함 생성기 ②).
   ④ 저장이 거절됐을 때 서버 코드('too_many_courses')가 화면에 그대로 나오지 않는가.
      api/content.js에서 코드를 **직접 뽑아** 전부 한국어로 옮겨지는지 본다 — 서버에 새
      거절 사유가 생기면 이 테스트가 먼저 잡는다.

   실행: node ai-loop/test_qM_course_copy.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const contentSrc = fs.readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');
const adminSrc   = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

(async () => {
  console.log('\n[1] 코스 상한이 한 곳에서만 나오는가 (QO — 예전엔 두 파일을 대조했다)');
  /* 예전에는 서버와 화면이 각자 6이라고 적어두고 이 테스트가 둘을 비교했다. 지금은
     limits.js 하나에서 둘 다 읽으므로 '갈라졌는가'가 아니라 '따로 적어뒀는가'를 본다. */
  const srvMax = require(path.join(ROOT, 'limits.js')).MAX_COURSES;
  ok('limits.js가 MAX_COURSES를 갖고 있다', Number.isFinite(srvMax), String(srvMax));
  ok('서버가 숫자를 따로 적어두지 않았다', !/const\s+MAX_COURSES\s*=\s*\d/.test(contentSrc),
    'api/content.js가 limits.js 대신 자기 숫자를 쓰면 limits.js를 고쳐도 서버는 안 바뀐다');
  ok('화면이 숫자를 따로 적어두지 않았다', /ITI_MAX_COURSES\s*=\s*LIMITS\.MAX_COURSES/.test(adminSrc),
    (adminSrc.match(/ITI_MAX_COURSES\s*=.*/) || [''])[0]);

  const dom = await bootAdmin();
  const w = dom.window, d = w.document;

  console.log('\n[2] 가져오기 창이 열리고 후보가 맞는가');
  w.__itiSelect('오사카');
  ok('가져오기 버튼이 화면에 있다', !!d.getElementById('iti-copy-course'));
  d.getElementById('iti-copy-course').click();
  ok('창이 열린다', !d.getElementById('itiCopyModal').classList.contains('hidden'));
  const items = Array.from(d.querySelectorAll('#itiCopyList .itip-item'));
  ok('코스가 목록에 그려진다', items.length > 0, `${items.length}건`);
  ok('자기 목적지(오사카)는 후보에서 빠진다',
    w.__copyCands('all').every((c) => c.from !== '오사카'));
  ok('같은 지역(일본) 범위가 전체보다 적다',
    w.__copyCands('region').length < w.__copyCands('all').length,
    `${w.__copyCands('region').length} / ${w.__copyCands('all').length}`);
  ok('같은 지역 후보 출처가 전부 일본이다',
    w.__copyCands('region').every((c) => w.REGION_MAP[c.from] === '일본'));

  console.log('\n[3] 후보가 “지금 쓰이는 값”을 따르는가');
  w.__setOverride('도쿄', [{
    title: '오버라이드된 도쿄 코스', subtitle: '덮어쓴 설명', highlights: [],
    days: [{ day: 1, title: '하루', am: '', pm: '', eve: '', tip: '' }],
  }]);
  const titles = w.__copyCands('all').filter((c) => c.from === '도쿄').map((c) => c.course.title);
  ok('오버라이드한 코스가 후보에 나온다', titles.includes('오버라이드된 도쿄 코스'), titles.join(' | '));
  ok('덮인 기본 코스는 후보에서 사라진다', titles.length === 1, titles.join(' | '));
  w.__clearOverrides();

  console.log('\n[4] 검색이 제목·설명·목적지로 걸리는가');
  d.getElementById('iti-copy-course').click();
  const before = d.querySelectorAll('#itiCopyList .itip-item').length;
  w.__copySearch('도쿄');
  const hits = Array.from(d.querySelectorAll('#itiCopyList .itip-item'));
  ok('목적지 이름으로 좁혀진다', hits.length > 0 && hits.length < before, `${before} → ${hits.length}`);
  w.__copySearch('zzz없는것zzz');
  ok('없으면 범위를 넓히라고 말해준다', /넓혀/.test(d.getElementById('itiCopyList').textContent));
  w.__copySearch('');

  console.log('\n[5] 가져오면 코스가 늘고 편집 표시가 켜지는가');
  const n0 = w.__courses().length;
  const target = w.__copyCands(w.__copyScope())[0];
  d.querySelectorAll('#itiCopyList .itip-item')[0].click();
  ok('코스가 하나 늘었다', w.__courses().length === n0 + 1, `${n0} → ${w.__courses().length}`);
  ok('창이 닫힌다', d.getElementById('itiCopyModal').classList.contains('hidden'));
  ok('편집 중(저장 안 함) 표시가 켜진다', w.__isDirty());
  ok('어디서 가져왔는지 알려준다', d.getElementById('iti-msg').textContent.includes(target.from),
    d.getElementById('iti-msg').textContent);
  ok('저장해야 반영된다고 말한다', /저장/.test(d.getElementById('iti-msg').textContent));

  console.log('\n[6] 깊은 복사인가 — 원본이 오염되면 되돌리기가 망가진다');
  const src = w.__rawDefault(target.from)[target.idx];
  const srcTitleBefore = src.title;
  const srcAmBefore = src.days[0].am;
  const copied = w.__courses()[w.__courses().length - 1];
  copied.title = '내가 고친 제목';
  copied.days[0].am = '내가 고친 오전';
  copied.highlights.push('내가 더한 하이라이트');
  ok('원본 코스 제목이 그대로다', src.title === srcTitleBefore, `${srcTitleBefore} → ${src.title}`);
  ok('원본 일자 내용이 그대로다', src.days[0].am === srcAmBefore, `${srcAmBefore} → ${src.days[0].am}`);
  ok('원본 하이라이트 개수가 그대로다',
    !src.highlights.includes('내가 더한 하이라이트'), src.highlights.join(' | '));
  ok('원본과 복사본이 다른 객체다', copied !== src && copied.days[0] !== src.days[0]);

  console.log('\n[7] 원래 목적지 이름이 남은 것을 말해주는가 (자동 치환은 하지 않는다)');
  w.__itiSelect('오사카');
  const tokyo = w.__copyCands('all').find((c) => c.from === '도쿄' && w.__mentions(c.course, '도쿄') > 0);
  ok('“도쿄”가 본문에 남은 코스가 실제로 있다', !!tokyo);
  w.__copyApply(tokyo);
  const msg = d.getElementById('iti-msg').textContent;
  ok('몇 곳에 남았는지 숫자로 말해준다', new RegExp('도쿄.*' + w.__mentions(tokyo.course, '도쿄') + '곳').test(msg), msg);
  ok('본문을 마음대로 바꾸지 않았다',
    w.__courses()[w.__courses().length - 1].title === tokyo.course.title,
    '자동 치환은 “도쿄 도청” 같은 고유명사를 망가뜨린다');

  console.log('\n[8] 상한에 걸리면 열리지 않고 이유를 말하는가');
  const maxCourses = [];
  for (let i = 0; i < srvMax; i++) maxCourses.push({ title: '코스' + i, subtitle: '', highlights: [], days: [{ day: 1, title: '', am: '', pm: '', eve: '', tip: '' }] });
  w.__setCourses(maxCourses);
  d.getElementById('iti-copy-course').click();
  ok('창이 열리지 않는다', d.getElementById('itiCopyModal').classList.contains('hidden'));
  ok('최대 개수를 말해준다', d.getElementById('iti-msg').textContent.includes(String(srvMax)),
    d.getElementById('iti-msg').textContent);
  ok('코스가 늘지 않았다', w.__courses().length === srvMax);

  console.log('\n[9] 저장 거절 사유가 담당자 말로 나오는가 — 서버 코드에서 직접 뽑아 대조');
  const codes = collectPutErrorCodes(contentSrc);
  ok('서버에서 거절 코드를 뽑았다', codes.length >= 10, `${codes.length}건: ${codes.slice(0, 6).join(', ')}…`);
  const raw = codes.filter((c) => {
    const t = w.__saveErrText(c);
    return !t || t.includes(c);          /* 코드가 그대로 보이면 안 옮겨진 것 */
  });
  ok('모든 거절 사유가 한국어로 옮겨진다', raw.length === 0, '안 옮겨진 것: ' + raw.join(', '));
  ok('처음 보는 코드는 개발자에게 알리라고 안내한다',
    /개발 담당자/.test(w.__saveErrText('완전히_새로운_코드')));
  ok('상한 숫자를 화면 문구에 박아두지 않았다',
    !/\d+\s*개(까지|입니다)/.test(w.__saveErrText('too_many_courses')),
    '서버 상한이 바뀌면 화면이 거짓말을 하게 된다: ' + w.__saveErrText('too_many_courses'));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* PUT(일정 저장) 경로에서 나올 수 있는 거절 코드를 서버 소스에서 뽑는다.
   normalizeCourses·normalizeRec 두 함수 본문만 본다 — GET·PATCH 쪽 코드까지 섞으면
   저장 화면과 상관없는 것까지 번역하라고 요구하게 된다.
   `'invalid_day_' + f`처럼 이어붙이는 코드는 실제 필드 이름으로 펴 준다. */
function collectPutErrorCodes(src) {
  const bodies = ['normalizeCourses', 'normalizeRec']
    .map((n) => (src.match(new RegExp('function ' + n + '[\\s\\S]*?\\n}\\n')) || [''])[0]).join('\n');
  const out = new Set(['unknown_dest_key', 'dest_check_failed', 'update_failed', 'forbidden', 'unauthorized']);
  const re = /error:\s*'([a-z_]+)'/g;
  let m;
  while ((m = re.exec(bodies))) {
    const code = m[1];
    if (!code.endsWith('_')) { out.add(code); continue; }
    const suffixes = code.startsWith('invalid_day_') ? ['title', 'am', 'pm', 'eve', 'tip'] : ['a', 'b'];
    suffixes.forEach((s) => out.add(code + s));
  }
  return Array.from(out);
}

async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.REGION_MAP = REGION_MAP;
  window.__itiSelect = (k) => { itiState.dirty = false; itiSelectDest(k); };
  window.__setOverride = (k, courses) => { itiState.overrides[k] = courses; };
  window.__clearOverrides = () => { itiState.overrides = {}; itiState.recOverrides = {}; };
  window.__isDirty = () => itiState.dirty;
  window.__courses = () => itiState.courses;
  window.__setCourses = (c) => { itiState.courses = c; itiRenderBody(); };
  window.__copyCands = (scope) => itiCopyCandidates(scope);
  window.__copyScope = () => itiCopy.scope;
  window.__copySearch = (q) => { itiCopy.q = q; itiCopyRender(); };
  window.__copyApply = (c) => itiCopyApply(c);
  window.__mentions = (course, word) => itiCountMentions(course, word);
  window.__saveErrText = (code) => itiSaveErrorText(code);
  /* 원본 상수를 그대로 넘긴다(복사하지 않는다) — 깊은 복사 검사가 의미를 가지려면
     테스트가 보는 것이 화면이 읽는 바로 그 객체여야 한다. */
  window.__rawDefault = (k) => ITINERARY_DB[k];
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.confirm = () => true; w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

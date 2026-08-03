/* RI 검증: '수정됨' 표시는 자기 구역의 저장본만 보고 말한다.

   왜 —
   일정 관리 화면에는 구역이 둘이다(📅 날짜별 일정 = 코스 / ✨ 방식 A·B). 그런데 저장은
   `itinerary_overrides` **한 행**에 `courses`·`rec` 두 칸으로 들어가고, 시각·담당자
   (`updated_at`/`updated_by`)는 **행 하나에 하나뿐**이다. api/content.js는 행이 있으면
   courses가 null이어도 meta를 채운다.

   → meta만 보고 '수정됨'을 말하면 **방식 A·B만 저장한 목적지의 기본 일정이 '수정됨'이
   된다.** 프로덕션 상해가 실제로 그 상태였다(rec 저장본만 있고 courses는 없음). 목적지
   드롭다운은 `✏️ 방식`이라고 맞게 적는데 구역 상태줄은 '수정됨'이라 서로 어긋났다.
   코스를 기본값으로 되돌린 직후에도 방식 저장본이 남아 있으면 meta가 남아 '수정됨'이
   그대로 붙었다 — 되돌렸는데 수정됨이라 말하는 게 제일 헷갈린다.

   이건 결함 생성기 ①(같은 사실을 두 기준으로 판단)이다. 방식 A·B 구역은 처음부터
   자기 저장본을 봤고(recRenderState), 일정 구역만 meta를 봤다. 여기서 둘을 같은
   규칙으로 고정한다:

   ① **각 구역은 자기 저장본이 있을 때만 '수정됨'이라 한다.** meta는 '누가·언제'에만 쓴다.
   ② **드롭다운 ✏️ 표시와 구역 상태줄이 어긋나지 않는다.** 어긋남이 이 결함을 드러낸 신호였다.
   ③ **방식 A·B를 저장해도 일정 구역은 '기본 일정'으로 남는다** — 상해가 생긴 바로 그 경로다.
   ④ **되돌린 직후 '수정됨'이 남지 않는다.**
   ⑤ 저장 안 한 편집(dirty) 표시는 그대로 살아 있다 — 위를 고치면서 QZ를 깨지 않는다.

   실행: node ai-loop/test_rI_edited_badge.js  (프로젝트 루트에서) */
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

const adminSrc = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const manualSrc = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');

const COURSES = [{ title: '코스가', subtitle: '설명', highlights: ['ㄱ'],
  days: [{ day: 1, title: '제목', am: '오전', pm: '오후', eve: '', tip: '' }] }];
const REC = {
  a: { title: '방식가', desc: '설명가', points: ['ㄱ'], items: ['ㄴ'] },
  b: { title: '방식나', desc: '설명나', points: ['ㄷ'], items: ['ㄹ'] },
};
const WHEN = '2026-08-03T12:34:56.000Z';
const META = { updatedAt: WHEN, updatedBy: '홍길동' };

(async () => {
  const net = { put: null, del: null };
  const dom = await bootAdmin(net);
  const w = dom.window, d = w.document;

  const itiText = () => d.getElementById('iti-state').textContent;
  const recText = () => d.getElementById('rec-state').textContent;
  const optText = (k) => Array.from(d.getElementById('iti-dest').options)
    .find((o) => o.value === k).textContent;

  /* ── [1] 네 가지 저장 조합 (①) ─────────────────────────────────────────
     rec만 / 코스만 / 둘 다 / 아무것도 — meta는 저장이 한 번이라도 있었으면 붙는다.
     서버가 주는 모양 그대로 넣는다(api/content.js는 값이 있는 칸만 map에 담고,
     meta는 행이 있으면 무조건 담는다). */
  console.log('[1] 각 구역이 자기 저장본만 보고 말하는가 (①)');
  w.__seed({ 도쿄: COURSES, 싱가포르: COURSES },
           { 상해: REC, 싱가포르: REC },
           { 도쿄: META, 상해: META, 싱가포르: META });

  w.__select('상해');            /* ← 프로덕션에서 실제로 이 상태였다 */
  ok('rec만 저장된 목적지: 일정 구역은 기본 일정이라 말한다',
    itiText().startsWith('기본 일정'), itiText());
  ok('rec만 저장된 목적지: 일정 구역에 수정됨이 없다',
    !itiText().includes('수정됨'), itiText());
  ok('rec만 저장된 목적지: 일정 구역에 담당자 이름이 새지 않는다',
    !itiText().includes('홍길동'), itiText());
  ok('rec만 저장된 목적지: 방식 구역은 수정됨이라 말한다',
    recText().startsWith('수정됨'), recText());
  ok('방식 구역은 누가 고쳤는지 함께 말한다', recText().includes('홍길동'), recText());

  w.__select('도쿄');
  ok('코스만 저장된 목적지: 일정 구역은 수정됨이라 말한다',
    itiText().startsWith('수정됨'), itiText());
  ok('코스만 저장된 목적지: 일정 구역이 누가 고쳤는지 말한다',
    itiText().includes('홍길동'), itiText());
  ok('코스만 저장된 목적지: 방식 구역은 기본값이라 말한다',
    recText() === '기본값', recText());

  w.__select('싱가포르');
  ok('둘 다 저장된 목적지: 양쪽 다 수정됨이다',
    itiText().startsWith('수정됨') && recText().startsWith('수정됨'),
    itiText() + ' / ' + recText());

  w.__select('오사카');          /* 아무것도 저장 안 된 목적지 */
  ok('저장본이 없는 목적지: 일정 구역은 기본 일정이다',
    itiText().startsWith('기본 일정'), itiText());
  ok('저장본이 없는 목적지: 방식 구역은 기본값이다', recText() === '기본값', recText());

  /* ── [2] 드롭다운 ✏️와 구역 상태줄이 어긋나지 않는가 (②) ──────────────
     이 어긋남이 결함을 드러낸 신호였다 — 한쪽만 고치면 다시 어긋난다.
     ⚠ '수정됨'이 아니라 **'수정됨으로 시작하는가'**로 본다(뒤에 담당자·시각이 붙는다). */
  console.log('\n[2] 목록의 ✏️ 표시와 구역 상태줄이 같은 말을 하는가 (②)');
  ['상해', '도쿄', '싱가포르', '오사카'].forEach((k) => {
    w.__select(k);
    const label = optText(k);
    const itiEdited = itiText().startsWith('수정됨');
    const recEdited = recText().startsWith('수정됨');
    ok(k + ': 목록의 일정 표시와 일정 구역이 일치한다',
      label.includes('일정') === itiEdited, label + ' / ' + itiText());
    ok(k + ': 목록의 방식 표시와 방식 구역이 일치한다',
      label.includes('방식') === recEdited, label + ' / ' + recText());
  });

  /* ── [3] 방식만 저장했을 때 일정 구역이 따라 물들지 않는가 (③) ────────
     상해가 만들어진 바로 그 경로를 실제 저장으로 재현한다. 위 [1]은 서버가 준 상태를
     넣은 것이고, 여기는 화면에서 저장했을 때 **저장 직후의 화면**을 본다. 저장 핸들러가
     meta를 새로 쓰기 때문에 여기가 따로 깨질 수 있다. */
  console.log('\n[3] 방식 A·B를 저장해도 일정 구역이 기본 일정으로 남는가 (③)');
  w.__seed({}, {}, {});
  w.__select('도쿄');
  ok('저장 전: 양쪽 다 기본값이다',
    itiText().startsWith('기본 일정') && recText() === '기본값',
    itiText() + ' / ' + recText());
  w.__markRecDirty();
  ok('고치는 중에는 저장하지 않음이라 말한다 (⑤)',
    recText().includes('저장하지 않음'), recText());
  await w.__recSave();
  ok('저장이 방식만 보냈다 (코스는 안 건드린다)',
    net.put && net.put.rec && net.put.courses === undefined, JSON.stringify(net.put));
  ok('저장 후: 방식 구역은 수정됨이다', recText().startsWith('수정됨'), recText());
  ok('저장 후: 일정 구역은 여전히 기본 일정이다  ← 이 결함의 본체',
    itiText().startsWith('기본 일정'), itiText());
  ok('저장 후: 목록에도 방식만 붙는다',
    optText('도쿄').includes('방식') && !optText('도쿄').includes('일정'), optText('도쿄'));

  /* ── [4] 되돌린 직후 (④) ──────────────────────────────────────────────
     코스를 되돌려도 방식 저장본이 남아 있으면 meta는 남는다(행이 살아 있으니까).
     그 meta를 보고 '수정됨'이라 말하면 방금 되돌린 사람이 되돌리기가 안 먹었다고 읽는다. */
  console.log('\n[4] 되돌린 직후에 수정됨이 남지 않는가 (④)');
  w.__seed({ 도쿄: COURSES }, { 도쿄: REC }, { 도쿄: META });
  w.__select('도쿄');
  ok('되돌리기 전: 일정 구역이 수정됨이다', itiText().startsWith('수정됨'), itiText());
  await w.__itiRevert();
  ok('코스 되돌리기가 나갔다', net.del && net.del.includes('part=courses'), String(net.del));
  ok('되돌린 뒤: 일정 구역은 기본 일정이라 말한다',
    itiText().startsWith('기본 일정'), itiText());
  ok('되돌린 뒤에도 방식 구역은 수정됨 그대로다 (한쪽만 되돌렸다)',
    recText().startsWith('수정됨'), recText());

  /* 반대 방향도 본다 — 방식을 되돌려도 코스 저장본은 그대로 말해야 한다 */
  w.__seed({ 도쿄: COURSES }, { 도쿄: REC }, { 도쿄: META });
  w.__select('도쿄');
  await w.__recRevert();
  ok('방식 되돌리기가 나갔다', net.del && net.del.includes('part=rec'), String(net.del));
  ok('방식을 되돌린 뒤: 방식 구역은 기본값이다', recText() === '기본값', recText());
  ok('방식을 되돌린 뒤에도 일정 구역은 수정됨 그대로다',
    itiText().startsWith('수정됨'), itiText());

  /* ── [5] 저장 안 한 편집 표시를 깨지 않았는가 (⑤ / QZ) ────────────────
     '수정됨'을 저장본 기준으로 바꾸면서 dirty 표시를 함께 지우기 쉽다. dirty는
     '서버에 뭐가 있는가'와 무관하게 **지금 화면에 저장 안 한 게 있는가**를 말한다. */
  console.log('\n[5] 저장 안 한 편집 표시가 그대로 살아 있는가 (⑤)');
  w.__seed({}, {}, {});
  w.__select('오사카');
  w.__markItiDirty();
  ok('저장본이 없어도 저장 안 함은 뜬다', itiText().includes('저장 안 함'), itiText());
  ok('그래도 기본 일정이라는 사실은 함께 말한다',
    itiText().includes('기본 일정'), itiText());
  ok('사이드바 ● 표시도 뜬다', !!d.querySelector('.nav-unsaved:not([hidden])')
    || /저장 안 함/.test(d.getElementById('savebar-what') ? d.getElementById('savebar-what').textContent : ''),
    d.getElementById('savebar-what') ? d.getElementById('savebar-what').textContent : '(savebar 없음)');

  /* ── [6] meta를 단독 판단 근거로 다시 쓰지 않는가 ─────────────────────
     동작 테스트가 본체지만, 되돌아가기 쉬운 한 줄이라 소스에도 못을 박는다. */
  console.log('\n[6] 두 구역이 같은 규칙으로 짜여 있는가');
  ok('일정 구역이 자기 저장본(overrides)을 근거로 삼는다',
    /const saved = itiState\.overrides\[itiState\.destKey\];/.test(adminSrc));
  ok('방식 구역이 자기 저장본(recOverrides)을 근거로 삼는다',
    /const saved = itiState\.recOverrides\[itiState\.destKey\];/.test(adminSrc));

  /* ── [7] 매뉴얼이 따라왔는가 ──────────────────────────────────────────── */
  console.log('\n[7] 매뉴얼이 이 규칙을 설명하는가');
  ok('수정됨이 구역별로 따로 뜬다고 적혀 있다',
    /구역별|각 구역|그 구역/.test(manualSrc) && /수정됨/.test(manualSrc));

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

async function bootAdmin(net) {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  /* 서버가 준 모양 그대로 넣는다 — 여기서 모양을 바꾸면 픽스처가 실제와 달라진다. */
  window.__seed = (ov, rec, meta) => {
    itiState.overrides = ov; itiState.recOverrides = rec; itiState.meta = meta;
    itiState.loaded = true; itiFillDestSelect();
  };
  window.__select = (k) => { itiState.dirty = false; recState.dirty = false; itiSelectDest(k); };
  window.__markItiDirty = () => itiMarkDirty();
  window.__markRecDirty = () => recMarkDirty();
  window.__recSave = () => recSave();
  window.__itiRevert = () => itiRevert();
  window.__recRevert = () => recRevert();
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
      w.fetch = (u, opt) => {
        const s = String(u);
        const method = (opt && opt.method) || 'GET';
        if (s.includes('action=itineraries') && method === 'PUT') {
          net.put = JSON.parse(opt.body);
          /* 서버는 안 보낸 쪽을 건드리지 않고(coalesce), 정규화한 결과를 돌려준다 */
          return Promise.resolve({ ok: true, json: () => Promise.resolve(
            { ok: true, courses: net.put.courses, rec: net.put.rec }) });
        }
        if (s.includes('action=itineraries') && method === 'DELETE') {
          net.del = s;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, removed: true }) });
        }
        return new Promise(() => {});
      };
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

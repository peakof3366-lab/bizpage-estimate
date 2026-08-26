/* ═══════════════════════════════════════════════════════════════════════════
   WX — 관리자 화면이 **「지금 값이 아니다」를 말하는가**

   대표가 가장 먼저 여는 화면이다. 여기 숫자가 낡았는데 그 사실이 안 보이면
   **판단이 틀린다** — 특히 방문·이벤트 통계는 광고를 켜고 끌 때 보는 값이다.

   ■ 🔴 ① 실패 경로 셋 중 하나가 아무 말도 안 했다

   `loadRemoteData`는 세 가지로 실패한다:
     ㉠ 응답이 실패 코드(500·503)   → `lastSyncFailure` 설정 ✓
     ㉡ 🔴 **응답 형식이 배열이 아님** → 설정 안 함 ✗
     ㉢ 네트워크 예외               → 설정 ✓
   ㉡이면 대시보드는 안 열리는데 `showSyncFailureOnLogin`이 **이유가 없어 그냥 돌아간다**
   — 로그인은 됐는데 **아무 안내 없이 로그인 폼만** 남는다.
   PW가 없애려던 바로 그 상태이고(「비밀번호가 틀렸나?」로 오해하는 자리),
   세 경로 중 이것 하나만 빠져 있었다(결함 생성기 ① — 목록의 산포).

   ■ 🔴 ② 방문·이벤트 통계가 낡아도 화면이 조용했다

   이 통계는 **부분 실패를 허용**한다(문의·견적 동기화는 계속 간다). 그런데 실패하면
   화면은 마지막 캐시를 **아무 말 없이** 보여줬다 — 콘솔 경고로 끝나는 조용한 폴백
   (결함 생성기 ②). 「어제 것인지 방금 것인지」를 모르면 광고 판단이 틀린다.

   ■ 이 검사가 지키는 것

     ① 세 실패 경로가 **전부** 사람이 읽을 이유를 남긴다
     ② 형식 오류일 때 화면에 그 이유가 실제로 뜬다 (jsdom에서 확인)
     ③ 🔴 통계가 낡으면 화면이 그렇게 말한다 — 그리고 **잘림 안내와 겹쳐도 둘 다 남는다**
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ADMIN = read('admin.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — WX 동기화 신호`);
  process.exit(fail ? 1 : 0);
};

console.log('\n[1] 실패 경로 셋이 전부 이유를 남기는가 (소스)');
{
  const i = ADMIN.indexOf('async function loadRemoteData');
  /* ⚠ 함수 **끝까지** 잘라야 한다 — `await loadRateOverrides`에서 끊으면 그 뒤의
     네트워크 catch가 빠져 「이유를 남기는 자리가 둘」로 잘못 세어진다(실제로 그랬다). */
  const block = ADMIN.slice(i, ADMIN.indexOf('function showSyncFailureOnLogin', i));
  ok('① 함수를 찾았다', i > 0 && block.length > 200);
  const marks = (block.match(/lastSyncFailure = \{/g) || []).length;
  /* ㉠ 실패 코드 · ㉡ 형식 오류 · ㉢ 네트워크 — 셋 다 */
  ok('① 🔴 이유를 남기는 자리가 셋이다', marks === 3, marks + '곳');
  ok('① 형식 오류에도 남긴다', /lastSyncFailure = \{ shape: true \}/.test(block));
  ok('① 캐시는 그대로 둔다 (낡은 값이 오류 객체보다 낫다)', /캐시를 유지한다/.test(block));
}

console.log('\n[2] 🔴 형식 오류일 때 화면이 실제로 이유를 띄우는가');
{
  const dom = new JSDOM(ADMIN, {
    runScripts: 'dangerously', resources: 'usable',
    url: 'file:///' + path.join(ROOT, 'admin.html').replace(/\\/g, '/'),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;
      /* ⚠ `file://`은 opaque origin이라 저장소를 못 쓴다 — 관리자 화면은 캐시를
         localStorage에 쓰므로, 스텁이 없으면 **동기화가 저장 단계에서 죽어**
         엉뚱하게 「네트워크 실패」로 잡힌다(실제로 그렇게 헤맸다). */
      const store = {};
      const ls = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        key: () => null, length: 0,
      };
      Object.defineProperty(w, 'localStorage', { value: ls, configurable: true });
      /* 🔴 200인데 **배열이 아닌** 응답 — 서버가 `{error:...}`를 200으로 줄 때다 */
      w.fetch = (url) => Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(/inquiries|quotes/.test(String(url)) ? { error: 'boom' } : {}),
      });
    },
  });
  const w = dom.window, d = w.document;
  const finish = async () => {
    if (typeof w.loadRemoteData !== 'function' || typeof w.showSyncFailureOnLogin !== 'function') {
      fail++; console.log('  ✗ 관리자 스크립트가 죽었다 — 이 묶음은 의미가 없다');
      return done();
    }
    const okFlag = await w.loadRemoteData();
    ok('② 형식이 이상하면 동기화 실패로 본다', okFlag === false, String(okFlag));
    w.showSyncFailureOnLogin();
    const errEl = d.getElementById('loginErr');
    ok('② 🔴 로그인 화면에 이유가 뜬다', !errEl.classList.contains('hidden'),
      'hidden=' + errEl.classList.contains('hidden'));
    ok('② 사람이 읽을 말이다', /형식이 예상과 다릅니다/.test(errEl.textContent), errEl.textContent);
    /* ⚠ 「비밀번호가 틀렸나?」로 오해하지 않게, 로그인은 됐다고 먼저 말한다 */
    ok('② 로그인은 됐다고 먼저 말한다', /로그인은 되었지만/.test(errEl.textContent));

    console.log('\n[3] 🔴 통계가 낡으면 화면이 그렇게 말하는가');
    {
      /* 통계만 실패시키고(부분 실패) 문의·견적은 정상으로 준다 */
      w.fetch = (url) => (/insights/.test(String(url))
        ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }));
      const ok2 = await w.loadRemoteData();
      ok('③ 통계만 실패해도 문의·견적 동기화는 성공으로 본다', ok2 === true, String(ok2));
      w.renderStats();
      const note = d.getElementById('s-trunc-note');
      ok('③ 🔴 「방금 받은 값이 아닙니다」라고 말한다',
        note && !note.classList.contains('hidden') && /방금 받은 값이 아닙니다/.test(note.textContent),
        note ? note.textContent.slice(0, 80) : '(칸 없음)');

      /* ⚠ 잘림 안내와 **겹쳐도 둘 다 남아야 한다** — 하나가 덮으면 그 사실이 사라진다 */
      w.eval("(function(){var m={visitTotal:5000,visitWindow:1000,visitsTruncated:true,destTotal:10,destTruncated:false};"
        + "localStorage.setItem('linkedt_visit_meta', JSON.stringify(m));})()");
      w.renderStats();
      ok('③ 잘림 안내와 겹쳐도 둘 다 남는다',
        /방금 받은 값이 아닙니다/.test(note.textContent) && /최근 1,000건만/.test(note.textContent),
        note.textContent.slice(0, 160));

      /* 정상으로 돌아오면 조용해진다 — 늘 켜져 있으면 아무도 안 본다 */
      w.fetch = (url) => Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(/insights/.test(String(url))
          ? { visits: [], events: {}, dest: {} } : []),
      });
      await w.loadRemoteData();
      w.renderStats();
      ok('③ 다시 받아오면 그 안내가 사라진다', !/방금 받은 값이 아닙니다/.test(note.textContent),
        note.textContent.slice(0, 80));
    }
    done();
  };
  if (d.readyState === 'complete') finish();
  else w.addEventListener('load', finish);
}

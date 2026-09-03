/* YB 검증 — **담당자 화면 가독성 손질이 되돌아가지 않는가**

   대표 지시(2026-08-28): 「관리자 페이지 가독성 좋게 만드는 방법 찾아서 적용」.
   브라우저로 재서 고친 것들인데(`python ai-loop/check_admin_screens.py`), 그 도구는
   **브라우저 설치가 필요해 회귀 스위트에 못 넣는다.** 그래서 스위트가 지킬 수 있는
   부분만 여기서 잠근다.

   ■ 잠그는 것

   ① 🔴 **요율표의 「지역」 열이 정렬 모드에 따라 달라진다**
      · 「지역순」  — 그룹 머리줄(「일본」…)이 지역을 말하므로 지역 칸은 **늘 빈다**
        (실측 60/60). 그래서 감춘다.
      · 「확인 필요한 순」 — 그룹 머리줄이 **없어서** 그 칸이 실제로 채워진다. 보여야 한다.
      🔴 **열을 지우면 두 번째가 깨진다.** 지우기 전에 다른 정렬을 눌러 본 것이
        그 실수를 막았다 — 이 검사는 그 확인을 남기는 것이다.
      ⚠ 그룹 머리줄은 `colspan` 한 칸이라, `td:first-child`로 감추면 **머리줄이 통째로
        사라진다.** 그것도 함께 잰다(감춘 뒤에도 머리줄이 남아 있는가).

   ② **줄글에 최대 폭이 걸려 있다** — 안내문이 91자/줄이었다. 한글은 45~50자가 편하고
      60자를 넘으면 눈이 다음 줄 첫머리로 못 돌아온다.
      ⚠ **폭이 몇 px인지는 재지 않는다** — jsdom은 레이아웃을 계산하지 않는다.
        「그 클래스들이 같은 토큰을 쓰는가」만 본다. 실제 자릿수는 브라우저 도구가 잰다.
        (이 구분을 흐리면 「스위트가 통과하니 괜찮다」는 거짓 안심이 생긴다.)

   ③ **글자 크기 바닥** — 담당자 화면에서 가장 작던 글자(사이드바 구분 라벨)가
      다시 10px 아래로 내려가지 않는가.

   실행: node ai-loop/test_yB_admin_readability.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { bootPage } = require('./_page_boot');
const { adminFixtures, enterDashboard } = require('./_admin_fixtures');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 운영 요율을 한 벌 받아 둔 것(`check_admin_screens.py`가 쓰는 것과 같은 파일).
   ⚠ 없으면 표가 비어 「지역 칸이 안 보인다」가 **늘 참**이 되어 아무것도 안 지킨다.
     그래서 없으면 그 사실을 말하고 그 항목을 건너뛴다 — 조용히 통과시키지 않는다. */
const RATES_FIXTURE = path.join(__dirname, 'fixtures', 'rates_live.json');
const rates = fs.existsSync(RATES_FIXTURE)
  ? JSON.parse(fs.readFileSync(RATES_FIXTURE, 'utf8')) : null;

(async () => {
  console.log('[1] 요율표 「지역」 열 — 정렬 모드에 따라 갈린다');
  if (!rates) {
    console.log('  ! ai-loop/fixtures/rates_live.json 이 없어 건너뜁니다');
    fail++;   /* 조용히 넘어가지 않는다 */
  } else {
    const A = bootPage('admin.html', { fixtures: adminFixtures('filled', rates) });
    await A.ready; await A.tick(400);
    /* 🔴 **로그인을 통과해야 아무것도 안 보인다.** 안 들어갔는데 계속하면
       빈 화면을 재면서 통과한다(결함 생성기 ③). 들어갔는지부터 확인한다. */
    const entry = await enterDashboard(A);
    ok('① 담당자 화면 안쪽까지 들어갔다', entry.entered);
    await A.tick(200);

    const run = (mode) => {
      const sel = A.doc.getElementById('rateSortMode');
      if (sel) sel.value = mode;
      A.win.renderRates();
      const tbody = A.doc.getElementById('rate-tbody');
      const table = tbody && tbody.closest('table');
      const rows = Array.from(tbody ? tbody.querySelectorAll('tr') : []);
      /* 🔴 **DOM에 있는 것과 보이는 것은 다르다.** 처음엔 「머리줄이 DOM에 있는가」만
         셌는데, `td:first-child`로 감추는 흔한 실수를 넣어도 **20 pass로 통과했다** —
         감춰진 머리줄도 DOM에는 그대로 있기 때문이다(결함 생성기 ③).
         jsdom은 클래스 규칙의 `display:none`을 계산해 준다(실제로 확인함). 그것으로 잰다. */
      const shown = (el) => el && A.win.getComputedStyle(el).display !== 'none';
      const regionCells = Array.from(tbody ? tbody.querySelectorAll('td.rate-region') : []);
      return {
        table,
        byRegion: !!(table && table.classList.contains('by-region')),
        dataRows: rows.filter((r) => r.querySelectorAll('td').length > 3).length,
        regionCells: regionCells.length,
        regionShown: regionCells.filter((td) => shown(td) && (td.textContent || '').trim()).length,
        groupCells: rows.map((r) => r.querySelector('td[colspan]'))
          .filter((td) => td && (td.textContent || '').trim()).length,
        groupShown: rows.map((r) => r.querySelector('td[colspan]'))
          .filter((td) => td && (td.textContent || '').trim() && shown(td)).length,
      };
    };

    const region = run('region');
    ok('① 지역순: 목적지 줄이 그려졌다', region.dataRows > 10, String(region.dataRows));
    ok('① 지역순: 표에 by-region 표시가 붙는다', region.byRegion);
    ok('🔴 ① 지역순: 그룹 머리줄이 **눈에 보인다** (colspan 칸을 안 감췄다)',
      region.groupCells > 0 && region.groupShown === region.groupCells,
      '보임 ' + region.groupShown + ' / 있음 ' + region.groupCells);
    ok('🔴 ① 지역순: 빈 지역 칸이 실제로 감춰졌다',
      region.regionShown === 0, '보이는 지역 칸 ' + region.regionShown + '개');
    /* 감추는 것이지 지우는 것이 아니다 — 칸은 그대로 있어야 모드를 되돌릴 수 있다 */
    ok('① 지역순: 지역 칸을 지우지 않고 남겨 둔다',
      region.regionCells === region.dataRows,
      region.regionCells + ' / ' + region.dataRows);

    const priority = run('priority');
    ok('② 확인 필요한 순: 목적지 줄이 그려졌다', priority.dataRows > 10, String(priority.dataRows));
    ok('🔴 ② 확인 필요한 순: by-region 표시가 없다 (지역이 보여야 한다)', !priority.byRegion);
    ok('🔴 ② 확인 필요한 순: 지역이 **눈에 보이고** 채워져 있다',
      priority.regionShown === priority.dataRows && priority.dataRows > 0,
      priority.regionShown + ' / ' + priority.dataRows);
    ok('② 확인 필요한 순: 그룹 머리줄은 없다', priority.groupCells === 0, String(priority.groupCells));

    /* 되돌아가는지도 본다 — 한 번 붙은 표시가 안 떨어지면 두 번째 모드가 늘 깨진다 */
    const back = run('region');
    ok('③ 모드를 되돌리면 표시도 되돌아온다', back.byRegion);
    A.win.close();
  }

  console.log('\n[2] 줄글 최대 폭 — 안내문이 91자/줄이었다');
  const admin = read('admin.html');
  ok('폭 토큰이 정의돼 있다', /--measure:\s*\d+(\.\d+)?em/.test(admin));
  /* ⚠ `em`이어야 한다 — 한글은 1자 ≈ 1em이라 글자 크기가 달라도 글자 수가 같다.
     `ch`(숫자 0의 폭)로 바꾸면 한글에서 절반쯤으로 어긋난다. */
  ok('🔴 폭 단위가 em이다 (ch는 한글에서 어긋난다)',
    !/--measure:\s*[\d.]+ch/.test(admin));
  for (const cls of ['.rate-update-info', '.pr-intro', '.empty-state p', '.card-body p', '.page-sub']) {
    const re = new RegExp(cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[^{]*\\{[^}]*max-width:\\s*var\\(--measure\\)');
    ok(`줄글에 폭이 걸려 있다 — ${cls}`, re.test(admin));
  }

  console.log('\n[3] 글자 크기·누를 크기 바닥');
  /* 사이드바 구분 라벨이 10.2px이었다(담당자 화면에서 가장 작은 글자). */
  const sepM = /\.sidebar-sep-lbl\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(admin);
  ok('사이드바 구분 라벨이 11px 이상이다',
    !!sepM && Number(sepM[1]) * 16 >= 11, sepM ? (Number(sepM[1]) * 16).toFixed(1) + 'px' : '못 찾음');
  /* 견적서 대장 검색칸이 클래스 없는 맨 input이라 높이 19px이었다. */
  ok('🔴 대장 검색칸에 높이 규칙이 있다',
    /\.iti-bar input\[type="search"\][^{]*\{[^}]*height:\s*40px/.test(admin));
  ok('PDF 파일칸에 높이가 있다', /id="pr-pdf"[^>]*height:\s*34px/.test(admin));

  console.log('\n[4] 🔴 읽어야 하는 글의 양 (YQ — 대표 지시 2026-09-03 「글자가 너무 많다」)');
  {
    /* 🔴 **규칙을 여기 다시 쓰지 않는다.** 「긴 안내문」의 정의(문턱 120자 · 접힌 것은
       세지 않음)는 `audit_ux.js`가 가진다 — 두 곳에 두면 어긋난다(결함 생성기 ①).
       탭을 훑는 방법도 거기서 가져온다. */
    const { measure, adminSections, 긴안내문문턱 } = require('./audit_ux.js');
    const B2 = bootPage('admin.html', { fixtures: adminFixtures('empty') });
    await B2.ready; await B2.tick(200);
    await enterDashboard(B2);

    let 총자 = 0;
    const 걸린것 = [];
    const 탭들 = adminSections(B2);
    ok('④ 탭을 실제로 훑었다 (0개면 아래 통과는 의미가 없다)', 탭들.length >= 15, String(탭들.length));
    for (const sec of 탭들) {
      try { await sec.enter(B2); } catch (e) { /* 못 열면 다음 탭 */ }
      await B2.tick(150);
      const m = measure(B2.doc, sec.scope(B2.doc));
      총자 += m.안내문총자;
      m.긴안내문.forEach((t) => 걸린것.push(sec.name + ' ' + t.length + '자: ' + t.slice(0, 40)));
    }

    /* 🔴 **이게 진짜 규칙이다** — 한 문단이 120자를 넘으면 훑는 게 아니라 멈춰서
       읽어야 한다. 2026-09-03에 4개(205·173·154·135자)를 걷어내 0으로 만들었다.
     ⚠ 다시 생기면 **글을 지우지 말고 `<details>`로 접을 것.** 접은 글은 안 세므로
       근거를 잃지 않고 통과한다. 그게 이 자를 그렇게 만든 이유다. */
    ok('🔴 ④ ' + 긴안내문문턱 + '자 넘는 안내문이 없다', 걸린것.length === 0, 걸린것.join(' | '));

    /* 총량은 **래칫**이다 — 지금보다 크게 늘면 걸린다.
       2026-09-03 실측 2,750자(손질 전 3,374자).
     ⚠ 이 숫자를 올려야 한다면 **왜 늘었는지 커밋 메시지에 적을 것.** 화면이 늘면
       자연히 늘 수 있으므로 금지가 아니라 「눈에 띄게」 하는 장치다. */
    const 천장 = 3000;
    ok('④ 읽어야 하는 글이 ' + 천장 + '자를 넘지 않는다', 총자 <= 천장, 총자 + '자');
    console.log('       (지금 ' + 총자 + '자 · 손질 전 3,374자)');
    B2.win.close();
  }

  console.log('\n' + '─'.repeat(64));
  /* ⚠ **이 줄의 형식은 `run_all_tests.js`가 정규식으로 읽는다**(「결과: N pass / M fail」).
     처음에 「합계:」로 적었더니 러너가 요약을 못 찾아 **크래시로 셌다** — 그 판정은
     「요약이 없으면 통과로 세지 않는다」는 안전장치라 러너가 옳았다. */
  console.log('\n결과: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

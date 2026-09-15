/* ═══════════════════════════════════════════════════════════════════════════
   패키지 · 소규모 견적 화면 — admin.html에서 떼어낸 화면 (구조 정리 2b-3)

   ■ 로드 규칙  `admin/common.js` 다음, admin.html의 인라인 <script> 앞에서 실린다.
     여기 있는 것은 전부 **선언**이다. 실행문(addEventListener·fetch)은 admin.html에
     그대로 남아 있다 — 그쪽은 DOM 순서에 걸려 있어 따로 다룬다(2b-1b).

   ■ 검사  `ai-loop/_admin_source.js`의 ADMIN_PARTS + `ai-loop/test_zZ_admin_boot.js`가
     **띄워서** 이 화면의 이름이 사는지 본다. 이 파일을 비우면 test_zZ가 실패해야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════
     패키지 상품 (VP) — **견적 엔진을 타지 않는다**

     2026-08-21 대표 결정: 「가격도 그대로 가져온다. 우리가 하나투어 대리점이라
     그 가격 그대로 받아 견적서화만 하면 된다.」
     → 여기서 입력한 1인 금액이 곧 고객가다. 요율·계수·마진이 하나도 안 붙는다.

     ⚠ **이 화면에 요율 관련 입력을 추가하지 말 것.** 같은 상품을 우리 엔진으로
       재산출하면 실측 기준 +21.5%·+41.7% 비싸게 나온다(코퍼스 오키나와·상해).
       그 실측이 이 흐름을 만든 이유다.
     ══════════════════════════════════════════════════════════════════ */
  const PKG_STALE_DAYS = 7;
  let pkgAll = [];
  let pkgEditing = null;   /* 지금 편집 중인 id (신규는 null) */

  const pkgDaysSince = (d) => {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : Math.floor((Date.now() - t.getTime()) / 86400000);
  };
  const pkgDateStr = (d) => {
    if (!d) return '';
    const t = new Date(d);
    return isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10);
  };
  /* ⚠ toISOString()은 UTC라 한국 오전 9시 전에는 **어제**가 나온다. 「오늘 산출했다」를
     적는 칸에 어제가 들어가면 그 칸의 뜻이 무너진다 — 지역 시간으로 만든다. */
  const pkgToday = () => {
    const t = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate());
  };
  /* 1회용 견적의 id — 사람이 읽을 필요가 없지만 **겹치면 안 된다**(upsert가 덮어쓴다).
     날짜 + 무작위 넷. 이미 불러온 목록과 대조해 겹치면 다시 뽑는다(최대 20번). */
  function pkgNewAdhocId() {
    const day = pkgToday().replace(/-/g, '').slice(2);
    for (let i = 0; i < 20; i++) {
      const tail = Math.random().toString(36).slice(2, 6);
      const id = 'adhoc-' + day + '-' + tail;
      if (!pkgAll.some((p) => p.id === id)) return id;
    }
    /* 20번 다 겹치는 것은 사실상 없다. 그래도 **조용히 겹친 값을 주지 않는다** —
       시간까지 붙여 반환한다(조용한 폴백 금지). */
    return 'adhoc-' + day + '-' + Date.now().toString(36);
  }

  /* 두 목록의 자리 (WE). 종류마다 상자·상태필터·빈 목록 문구가 다르다 — 여기 한 곳에서만
     가른다. 화면 여러 곳에 `kind === 'adhoc'`를 흩으면 반드시 한 곳이 빠진다. */
  const PKG_VIEWS = [
    { kind: 'catalog', box: 'pkgList',   filter: 'pkgFilterStatus',
      empty: '등록된 상품이 없습니다. 「+ 새 상품」으로 시작하세요.',
      none:  '그 상태의 상품이 없습니다.' },
    { kind: 'adhoc',   box: 'adhocList', filter: 'adhocFilterStatus',
      empty: '아직 만든 직접견적이 없습니다. 담당자가 금액을 직접 적어 내는 곳입니다 — 「+ 직접견적」으로 시작하세요.',
      none:  '그 상태의 견적이 없습니다.' },
  ];

  async function renderPackages() {
    /* ⚠ 두 탭 중 **열려 있는 쪽만** 있는 것이 아니다 — 둘 다 그려 둔다. 탭을 옮길 때마다
       다시 부르지만, 한쪽만 그리면 돌아왔을 때 옛 목록이 남는다. */
    const boxes = PKG_VIEWS.map(v => document.getElementById(v.box)).filter(Boolean);
    if (!boxes.length) return;
    boxes.forEach(b => { b.innerHTML = '<div style="padding:16px;color:#888;font-size:.85rem">불러오는 중…</div>'; });
    try {
      /* 관리자는 초안·마감까지 봐야 관리가 된다 — `all=1` */
      const r = await fetch('/api/content?action=packages&all=1');
      if (!r.ok) throw new Error('http_' + r.status);
      const d = await r.json();
      pkgAll = (d && d.packages) || [];
    } catch (err) {
      /* ⚠ **못 불러온 것을 「0건」으로 보여주지 않는다.** 그러면 담당자가 상품이
         지워진 줄 알고 다시 만든다(결함 생성기 ②). */
      boxes.forEach(b => {
        b.innerHTML = '<div style="padding:16px;color:#B91C1C;font-size:.85rem">'
          + '목록을 불러오지 못했습니다 — <strong>「없다」는 뜻이 아닙니다.</strong> '
          + '잠시 뒤 다시 열어 주세요. (' + String(err.message || err) + ')</div>';
      });
      return;
    }
    pkgDrawList();
    pkgFillDestSelect();
  }

  function pkgDrawList() {
    /* 종류마다 자기 상자에만 그린다 (WE) — 예전에는 한 목록에 둘을 섞고 필터로 갈랐는데,
       소규모 견적은 **손님 수만큼 늘어나므로** 시간이 갈수록 상품이 파묻힌다. */
    PKG_VIEWS.forEach(pkgDrawOne);
    pkgDrawStale();
  }

  function pkgDrawStale() {
    /* 금액 확인이 오래된 것 — 사이드바 배지와 위쪽 안내에 같은 수를 쓴다 */
    /* ⚠ **패키지 상품만 센다**(VS). 1회용 소규모 견적은 기한(valid_until)이 그 일을
       이미 하고 있어서, 여기까지 세면 배지가 늘 켜져 있고 그러면 아무도 안 본다. */
    const stale = pkgAll.filter(p => p.status === 'open' && (p.kind || 'catalog') === 'catalog'
      && (pkgDaysSince(p.priceAsOf) ?? 0) > PKG_STALE_DAYS);
    const badge = document.getElementById('sb-pkg-stale');
    if (badge) {
      badge.textContent = stale.length || '';
      badge.style.display = stale.length ? '' : 'none';
    }
    const note = document.getElementById('pkgStaleNote');
    if (note) {
      note.classList.toggle('hidden', !stale.length);
      note.textContent = stale.length
        ? `⚠ 금액 확인이 ${PKG_STALE_DAYS}일 넘은 판매중 상품 ${stale.length}건`
        : '';
    }

    /* 31건이 어떤 모양인지 **스크롤 전에** 한 줄로 말한다 (WH).
       ⚠ 목록을 다 내려 봐야 아는 것은 안 본 것과 같다 — 대표가 31번 열어 본 자리다. */
    const shape = document.getElementById('pkgShape');
    if (shape) {
      const cat = pkgAll.filter((p) => (p.kind || 'catalog') === 'catalog');
      const ready = cat.filter(pkgSellable).length;
      const noIti = cat.filter((p) => !(Array.isArray(p.itinerary) && p.itinerary.length)).length;
      shape.classList.toggle('hidden', !cat.length);
      shape.innerHTML = !cat.length ? '' :
        '상품 <b>' + cat.length + '건</b> · 팔 준비된 것 <b>' + ready + '건</b>'
        + (noIti ? ' · <b>일정이 없는 것 ' + noIti + '건</b>' : '')
        + (noIti ? '<br><span class="pkg-shape-why">엑셀로 들여온 상품은 이름·지역·기간·금액·사진만 들어옵니다 — '
            + '<b>일정과 포함사항은 하나투어 상품 주소를 붙여넣으면 함께 옵니다</b>'
            + '(상품을 열고 「🔗 하나투어 상품 주소로 불러오기」). '
            + '주소를 못 찾으시면 상세 PDF로도 채웁니다.</span>' : '');
    }
  }

  /* ═══ 「팔 준비가 됐는가」 (WH) ══════════════════════════════════════════════
     🔴 대표: 「패키지 상품 페이지에서 내용 확인이 너무 어렵다.」
     열어 보니 **확인할 내용이 아직 없었다.** 엑셀 투입(VY·VZ)이 채우는 것은
     이름·지역·기간·1인 금액·사진 다섯뿐이고, **일정·포함/불포함·출발일은 안 채운다**
     (엑셀 파일에 그 칸이 없다 — 그래서 WA에서 PDF로 채우는 길을 만들었다).
     🔴 **「하나투어가 그 자료를 안 준다」고 적어 뒀는데 틀렸다**(YG). WL(2026-08-26)에서
       상품 주소로 **일정·포함·불포함이 다 온다**는 것이 확인됐고, 2026-09-02에 실제
       상품(JTP140261029TWT 도쿄/하코네/아타미 4일)으로 다시 확인했다 — 일정 4일치·
       포함 12줄·불포함 2줄이 그대로 들어온다. 그런데 **화면 안내는 안 고쳐서**, 빈
       상품을 채우려는 담당자를 여전히 **더 어려운 PDF 길로** 보내고 있었다.
       (엑셀은 `대표상품코드`를, 주소는 `판매상품코드`를 쓴다 — 주소로 읽으면
        `rprsProdCd`가 함께 와서 엑셀 행과 맞출 수 있다.)
     즉 30건이 껍데기인데, **그걸 알려면 31번을 하나씩 열어 봐야 했다.**
     → 무엇이 비었는지를 **목록에서** 말한다. 훑는 일이 열어 보는 일이 되면 안 된다.
     ⚠ 「없음」을 결함처럼 빨갛게 쓰지 않는다 — 아직 안 채운 것이지 고장이 아니다.
     ⚠ 소규모 견적에는 안 붙인다. 그쪽은 일정·포함사항이 없는 게 정상이다. */
  const PKG_GAPS = [
    { key: 'iti',  label: '일정',   has: (p) => Array.isArray(p.itinerary) && p.itinerary.length > 0 },
    /* 🔴 여기가 `p.inclItems`였다 (WR). 서버가 주는 이름은 **`included`**다
       (`api/content.js`의 `pkgRowOut`). 그래서 목록에서는 **포함사항을 채워도
       「포함사항 없음」이 안 사라지고**, 「✓ 팔 준비됨」이 **한 번도 안 떴다** —
       「채움」 필터의 「팔 준비된 것」도 늘 0건이었다.
       편집 폼 미리보기만 같은 틀린 이름을 써서 거기서는 멀쩡해 보였다(그래서 못 봤다).
     ⚠ 한 값에 이름을 두 개 두지 않는다 — 서버가 부르는 이름 하나로 간다. */
    { key: 'incl', label: '포함사항', has: (p) => Array.isArray(p.included) && p.included.length > 0 },
    { key: 'img',  label: '사진',   has: (p) => !!p.imageUrl },
  ];
  const pkgGaps = (p) => PKG_GAPS.filter((g) => !g.has(p));
  /* 고객에게 내보내도 되는 상태인가 — 일정과 포함사항이 이 판단의 전부다.
     ⚠ 사진은 없어도 팔린다(카드가 사진 없이도 그려진다). 그래서 여기 안 센다. */
  const pkgSellable = (p) => PKG_GAPS.filter((g) => g.key !== 'img').every((g) => g.has(p));

  function pkgDrawOne(view) {
    const box = document.getElementById(view.box);
    if (!box) return;
    const want = (document.getElementById(view.filter) || {}).value || '';
    /* 「채움」 필터는 패키지 상품에만 있다 — 소규모 견적은 일정·포함사항이 없는 게 정상 */
    const wantGap = view.kind === 'catalog'
      ? ((document.getElementById('pkgFilterGap') || {}).value || '') : '';
    const mine = pkgAll.filter(p => (p.kind || 'catalog') === view.kind);
    const list = mine.filter(p => (!want || p.status === want)
      && (!wantGap || (wantGap === 'ready' ? pkgSellable(p) : !pkgSellable(p))));
    const isAdhocView = view.kind === 'adhoc';

    if (!list.length) {
      /* ⚠ 왜 비었는지를 **거른 조건에 맞춰** 말한다. 「그 상태의 상품이 없습니다」를
         채움 필터에도 쓰면 담당자는 상태를 들여다보며 헤맨다. */
      const why = !mine.length ? view.empty
        : wantGap === 'ready' ? '팔 준비가 된 상품이 아직 없습니다 — 일정과 포함사항을 채우면 여기 올라옵니다.'
        : wantGap === 'gap' ? '덜 채워진 상품이 없습니다. 전부 팔 준비가 됐습니다.'
        : view.none;
      box.innerHTML = '<div style="padding:16px;color:#888;font-size:.85rem">' + why + '</div>';
      return;
    }

    box.innerHTML = list.map((p, i) => {
      const age = pkgDaysSince(p.priceAsOf);
      const old = p.status === 'open' && age != null && age > PKG_STALE_DAYS;
      const dur = (p.nights && p.days) ? `${p.nights}박 ${p.days}일` : '';
      /* 목록에서도 같은 말을 쓴다(VU) — 목록은 「판매중」, 편집 칸은 「확정」이면
         담당자는 자기가 무엇을 눌렀는지 확신하지 못한다. */
      const stLabel = (isAdhocView
        ? { open: '확정', draft: '작성중', closed: '종료' }
        : { open: '판매중', draft: '작성중', closed: '마감' })[p.status] || p.status;
      /* 썸네일 (WE) — 30건을 훑어 고르는 일이라 이름만으로는 안 골라진다.
         ⚠ **패키지 상품에만** 붙인다. 소규모 견적은 사진 칸을 안 쓴다.
         ⚠ 사진이 없어도 자리를 남긴다 — 있는 줄만 넓어지면 목록이 들쭉날쭉해진다.
         ⚠ https만 통과한 값이지만(서버가 거른다) 그래도 esc()로 속성을 닫는다.
           깨지면 자리만 남긴다(VZ 카드와 같은 규칙 — 빈 상자가 고장으로 보인다). */
      const thumb = isAdhocView ? ''
        : (p.imageUrl
            ? '<img class="pkg-thumb" src="' + esc(p.imageUrl) + '" alt="" loading="lazy"'
              + ' onerror="this.className=\'pkg-thumb-none\';this.removeAttribute(\'src\')">'
            : '<div class="pkg-thumb-none"></div>');
      return '<div class="pkg-row' + (isAdhocView ? ' pkg-row--nothumb' : '') + '" data-i="' + i + '">'
        + thumb
        + '<div>'
        +   '<div class="pkg-row-t">' + esc(p.title) + '</div>'
        +   '<div class="pkg-row-s">' + esc([p.customerLabel || null,
              p.destLabel || p.destKey || '지역 미지정', dur,
              p.departDate ? '출발 ' + pkgDateStr(p.departDate) : ''].filter(Boolean).join(' · ')) + '</div>'
        /* 빠진 칸을 그 자리에서 말한다 (WH) — 열어 보지 않고 훑을 수 있어야 한다 */
        +   (isAdhocView ? '' : (() => {
              const gaps = pkgGaps(p);
              return gaps.length
                ? '<div class="pkg-gaps">' + gaps.map((g) =>
                    '<span class="pkg-gap">' + esc(g.label) + ' 없음</span>').join('') + '</div>'
                : '<div class="pkg-gaps"><span class="pkg-gap is-ok">✓ 팔 준비됨</span></div>';
            })())
        + '</div>'
        + '<div style="text-align:right;font-weight:800">' + Number(p.pricePerPerson || 0).toLocaleString() + '원</div>'
        + '<div class="pkg-stale">' + (old ? '⚠ ' + age + '일 전 금액' : '') + '</div>'
        + '<div><span class="pkg-st ' + esc(p.status) + '">' + esc(stLabel) + '</span></div>'
        /* ── 상태마다 **맞는 동작 하나만** 준다 (ZO) ─────────────────────────
             작성중  아무 데도 안 나갔다            → 지운다
             확정·판매중  나갔거나 나갈 수 있다      → **내린다**(되돌릴 수 있다)
             종료·마감  지난 기록                   → 아무것도 안 준다
           🔴 확정 건에 삭제를 달지 않는다 — 견적서 대장이 지우지 않고 `void`로
             내리는 것과 같은 규칙이다. 지우면 「그 값을 낸 적 있다」가 사라진다.
           ⚠ 자리는 늘 차지한다 — 있는 줄만 넓어지면 목록이 들쭉날쭉해진다. */
        + '<div class="pkg-act-slot">' + (
            p.status === 'draft'
            ? '<button type="button" class="pkg-del" data-del="' + i + '" '
              + 'aria-label="' + esc(p.title) + ' 지우기 — 작성중인 건만 지울 수 있습니다">삭제</button>'
            : p.status === 'open'
            ? '<button type="button" class="pkg-close" data-close="' + i + '" '
              + 'aria-label="' + esc(p.title) + ' ' + (isAdhocView ? '종료' : '내리기')
              + ' — ' + (isAdhocView ? '「종료」' : '「마감」') + '으로 바꿉니다">'
              + (isAdhocView ? '종료' : '내리기') + '</button>'
            : '') + '</div>'
        + '</div>';
    }).join('');

    /* ⚠ 인라인 onclick에 값을 끼워 넣지 않는다 — 그 구조는 esc()로 못 막는다
       (CLAUDE.md 결함 생성기 ④). 위치만 넘기고 값은 배열에서 꺼낸다. */
    box.querySelectorAll('.pkg-row').forEach(row => {
      row.addEventListener('click', () => pkgOpen(list[Number(row.dataset.i)]));
    });
    /* ⚠ **줄 클릭(편집 열기)까지 같이 일어나면 안 된다** — 지우려다 편집 화면이
       열리면 무엇이 일어났는지 알 수 없다. `stopPropagation`으로 끊는다. */
    box.querySelectorAll('.pkg-del').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pkgDeleteRow(list[Number(btn.dataset.del)]);
      });
    });
    box.querySelectorAll('.pkg-close').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pkgCloseRow(list[Number(btn.dataset.close)], isAdhocView);
      });
    });
  }

  function pkgFillDestSelect() {
    const sel = document.getElementById('pkgDest');
    if (!sel || sel.dataset.filled) return;
    /* 목적지 목록은 **요율표가 진실**이다(data.js). 여기 이름을 다시 적지 않는다. */
    const opts = (typeof destinationRates !== 'undefined' ? destinationRates : [])
      .map(d => '<option value="' + esc(d.destination_key) + '">' + esc(d.label || d.destination_key) + '</option>')
      .join('');
    sel.innerHTML = '<option value="">(요율표에 없는 곳 — 아래 지역명을 직접 적습니다)</option>' + opts;
    sel.dataset.filled = '1';
  }

  function pkgOpen(p, newKind) {
    const card = document.getElementById('pkgEditCard');
    if (!card) return;
    pkgEditing = p ? p.id : null;
    const kind = p ? (p.kind || 'catalog') : (newKind === 'adhoc' ? 'adhoc' : 'catalog');
    /* 편집 카드는 **한 벌뿐**이라 열 때마다 맞는 탭으로 옮긴다 (WE).
       ⚠ 두 탭에 같은 20칸을 복사하지 않는 이유다 — 두 벌이 되면 한쪽만 고쳐지고,
         담당자는 어느 화면을 열었느냐에 따라 다른 폼을 보게 된다(결함 생성기 ①). */
    const host = document.getElementById(kind === 'adhoc' ? 'pkgHostAdhoc' : 'pkgHostCatalog');
    if (host && card.parentNode !== host) host.appendChild(card);
    document.getElementById('pkgEditTitle').textContent = p
      ? ((kind === 'adhoc' ? '직접견적 — ' : '상품 편집 — ') + p.title)
      : (kind === 'adhoc' ? '새 직접견적' : '새 상품');
    const v = (id, val) => { const e = document.getElementById(id); if (e) e.value = val == null ? '' : val; };
    v('pkgKind', kind);
    /* 새 1회용 견적의 기본 출처는 **담당자 산출**이다 — 대부분 우리가 조립한다.
       공급사에게 받아 적은 것이면 담당자가 바꾸면 된다. */
    v('pkgBasis', p ? (p.priceBasis || 'agency') : (kind === 'adhoc' ? 'assembled' : 'agency'));
    v('pkgCustomer', p ? (p.customerLabel || '') : '');
    v('pkgItems', p && Array.isArray(p.lineItems)
      ? p.lineItems.map(it => it.label + ' | ' + it.amount).join('\n') : '');
    /* ⚠ **1회용 견적의 ID는 사람이 지어낼 것이 아니다**(VU). 상품(catalog)은 나중에
       같은 것을 다시 편집하고 CLI로 골라 쓰기도 해서 `hana-okinawa-1203` 같은 이름이
       뜻을 갖는다. 1회용은 한 번 쓰고 끝이라 그 이름이 아무 뜻도 없는데, 영문·숫자만
       받는 칸이라 **손님 앞에서 영문 ID를 짜고 있어야 했다.** 자동으로 붙인다.
       ⚠ 겹치면 upsert가 **남의 견적을 덮어쓴다** — 이미 불러온 목록과 대조해 다시 뽑는다. */
    const idEl = document.getElementById('pkgId');
    if (p) { v('pkgId', p.id); delete idEl.dataset.auto; }
    else if (kind === 'adhoc') { v('pkgId', pkgNewAdhocId()); idEl.dataset.auto = '1'; }
    else { v('pkgId', ''); delete idEl.dataset.auto; }
    v('pkgTitle', p ? p.title : '');
    v('pkgDest', p ? (p.destKey || '') : '');
    v('pkgDestLabel', p ? (p.destLabel || '') : '');
    v('pkgNights', p ? p.nights : '');
    v('pkgDays', p ? p.days : '');
    v('pkgDepart', p ? pkgDateStr(p.departDate) : '');
    v('pkgPrice', p ? p.pricePerPerson : '');
    /* ⚠ 새 상품의 「금액 확인일」을 **오늘로 미리 채우지 않는다.** 미리 채우면
       담당자가 확인도 안 한 날짜를 그대로 저장하게 되고, 그 순간 이 칸이 무의미해진다.
       비워 두면 서버가 거절하고, 그 거절이 곧 「확인하고 적으라」는 뜻이다.

       ⚠ **단, 「담당자 산출」은 다르다**(VU). 그 칸의 뜻이 갈린다:
         대리점가  = 「공급사가 그 값을 확인해 준 날」 → 실제로 확인해야 알 수 있다
         담당자 산출 = 「우리가 그 값을 만든 날」      → 지금 만들고 있으니 오늘이 사실이다
       확인 안 한 날짜가 굳는 것을 막으려던 규칙이라, 사람이 직접 만드는 값에는
       그 위험이 없다. 위 규칙을 약화시킨 게 아니라 **적용 범위를 지킨 것이다.**
       자동으로 넣은 날짜는 `dataset.auto`로 표시해 두고, 출처를 대리점가로 바꾸면 비운다. */
    const asOfEl = document.getElementById('pkgAsOf');
    const basisNow = (document.getElementById('pkgBasis') || {}).value;
    if (p) { v('pkgAsOf', pkgDateStr(p.priceAsOf)); delete asOfEl.dataset.auto; }
    else if (basisNow === 'assembled') { v('pkgAsOf', pkgToday()); asOfEl.dataset.auto = '1'; }
    else { v('pkgAsOf', ''); delete asOfEl.dataset.auto; }
    v('pkgValid', p ? pkgDateStr(p.validUntil) : '');
    v('pkgStatus', p ? p.status : 'draft');
    v('pkgSourceCode', p ? (p.sourceCode || '') : '');
    v('pkgImage', p ? (p.imageUrl || '') : '');
    const lines = (arr) => Array.isArray(arr) ? arr.join('\n') : (arr || '');
    v('pkgIncl', p ? lines(p.included) : '');
    v('pkgExcl', p ? lines(p.excluded) : '');
    v('pkgIti', p && Array.isArray(p.itinerary)
      ? p.itinerary.map(d => [d.title || '', [d.am, d.pm, d.eve].filter(Boolean).join(' / ')]
          .filter(Boolean).join(' | ')).join('\n')
      : '');
    document.getElementById('pkgMsg').textContent = '';
    /* 기존 건은 id를 못 바꾼다. 새 1회용은 **자동으로 붙었으니** 역시 손대지 않는다 —
       열어 두면 「여기에 무엇을 적어야 하나」를 다시 고민하게 된다. */
    document.getElementById('pkgId').readOnly = !!p || kind === 'adhoc';
    pkgSyncNotes();
    pkgIssueReset(p);
    card.style.display = '';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── 화면이 지금 상태를 스스로 말하게 한다 ──────────────────────────────────
     ⚠ 종류·출처를 고르는 것만으로는 **무엇이 달라지는지** 알 수 없다. 조용히
       달라지면 담당자는 1회용 견적을 상품으로 저장하고도 모른다(결함 생성기 ②). */
  function pkgSyncNotes() {
    const kind = (document.getElementById('pkgKind') || {}).value || 'catalog';
    const basis = (document.getElementById('pkgBasis') || {}).value || 'agency';
    /* 그 일에 안 쓰는 칸은 감춘다 (WE) — 폼이 20칸인데 절반이 안 쓰이면 **쓰는 칸을
       못 찾는다.** 대표가 「어떻게 써야 할지 모르겠다」고 한 이유의 절반이 이것이다.
       ⚠ **값은 지우지 않는다.** 감추는 것과 비우는 것은 다르다 — 종류를 잘못 골랐다
         되돌리면 적어 둔 값이 사라져 있으면 안 된다(VS에서 세운 「감춘 것 ≠ 막은 것」). */
    document.querySelectorAll('#pkgEditCard [data-pkg-only]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.pkgOnly !== kind);
    });
    const note = document.getElementById('pkgKindNote');
    if (note) {
      note.innerHTML = (kind === 'adhoc'
        ? '이 건은 <b>고객 목록에 나가지 않습니다.</b> 견적서 링크로만 나가고, 발급도 로그인한 담당자만 됩니다. '
          + '유효기간을 비우면 <b>14일</b>이 자동으로 붙습니다.'
        : '이 건은 <b>고객 화면(패키지 여행)에 나갑니다.</b> 「판매중」으로 두는 순간 누구나 볼 수 있습니다.')
        + '<br>'
        + (basis === 'assembled'
          ? '금액 출처가 <b>담당자 산출</b>입니다 — 견적서에 「담당자 산출」로 찍히고 엔진 검증을 거치지 않은 것으로 기록됩니다.'
          : '금액 출처가 <b>대리점가</b>입니다 — 공급사에게 받은 값 그대로라는 뜻입니다. 우리가 조립했다면 위에서 바꿔 주세요.');
    }
    /* 🔴 **일정·포함사항이 빈 채로 「판매중」이 되는 것을 그 자리에서 말한다** (WH).
       고객 화면은 빈 칸을 **그냥 안 그린다** — 사진·제목·금액만 있는 얇은 상품이 되고,
       그 상태로 받아 간 견적서에는 일정이 없다. 막지는 않는다(팔지 말지는 대표 판단이고
       일정 없이 파는 상품도 있을 수 있다). 다만 **모르고 열리는 일은 없어야 한다.** */
    const gapNote = document.getElementById('pkgGapNote');
    if (gapNote) {
      const cur = {
        itinerary: pkgParseIti((document.getElementById('pkgIti') || {}).value),
        included: pkgLines('pkgIncl'),
        imageUrl: (document.getElementById('pkgImage') || {}).value || null,
      };
      const gaps = kind === 'adhoc' ? [] : pkgGaps(cur);
      const blocking = gaps.filter((g) => g.key !== 'img');
      gapNote.classList.toggle('hidden', !blocking.length);
      gapNote.innerHTML = !blocking.length ? '' :
        '⚠ <b>' + blocking.map((g) => g.label).join(' · ') + '</b>이(가) 비어 있습니다. '
        + '이대로 「판매중」으로 두면 고객 화면에 <b>그 칸이 아예 안 나오고</b>, '
        + '받아 가는 견적서에도 안 실립니다. '
        + '<b>📄 PDF에서 불러오기</b>로 채우실 수 있습니다.';
    }
    /* 편집 칸 안에서 종류를 바꿨을 때도 id가 따라온다(VU). **새로 만드는 중일 때만** —
       이미 저장된 건의 id를 바꾸면 upsert가 새 행을 만들고 원본이 남는다. */
    const idEl2 = document.getElementById('pkgId');
    if (idEl2 && !pkgEditing) {
      if (kind === 'adhoc' && (!idEl2.value || idEl2.dataset.auto)) {
        if (!idEl2.dataset.auto) { idEl2.value = pkgNewAdhocId(); idEl2.dataset.auto = '1'; }
        idEl2.readOnly = true;
      } else if (kind !== 'adhoc') {
        if (idEl2.dataset.auto) { idEl2.value = ''; delete idEl2.dataset.auto; }
        idEl2.readOnly = false;
      }
    }

    /* 🔴 **상태 라벨이 1회용에는 거짓말이었다**(VU). 값은 셋 그대로인데 뜻이 갈린다:
         catalog: open = 「고객 화면에 뜬다」          ← 노출 이야기
         adhoc  : open = 「이 값으로 견적서를 내도 된다」 ← 발급 허가 이야기. 고객 목록엔
                  절대 안 뜬다. 그런데 「판매중(고객에게 보임)」이라 적혀 있어서,
                  담당자가 **손님 견적을 공개하는 것으로 읽고 못 누르게** 돼 있었다.
       ⚠ 값(draft/open/closed)은 안 건드린다 — 서버·필터·인덱스가 그 값을 본다.
         **라벨만** 바꾼다. 값과 표시를 함께 바꾸면 저장된 데이터의 뜻이 흔들린다. */
    const stSel = document.getElementById('pkgStatus');
    if (stSel) {
      const L = kind === 'adhoc'
        ? { draft: '작성중 (아직 견적서를 낼 수 없음)', open: '확정 (견적서 발급 가능)', closed: '종료 (발급 중지)' }
        : { draft: '작성중 (고객에게 안 보임)', open: '판매중 (고객에게 보임)', closed: '마감 (고객에게 안 보임)' };
      Array.from(stSel.options).forEach((o) => { if (L[o.value]) o.textContent = L[o.value]; });
    }

    /* 같은 칸이지만 출처에 따라 묻는 것이 다르다(VU) */
    const lbl = document.getElementById('pkgAsOfLbl');
    if (lbl) {
      lbl.innerHTML = basis === 'assembled'
        ? '💡 산출일 <em>— 이 금액을 만든 날</em>'
        : '💡 금액 확인일 <em>— 공급사에게 확인한 날 · 필수</em>';
    }
    /* 출처를 대리점가로 돌리면 **자동으로 넣은 날짜는 비운다.** 그대로 두면
       「우리가 만든 날」이 「공급사가 확인해 준 날」로 둔갑한다.
       ⚠ 사람이 직접 넣은 값은 건드리지 않는다(dataset.auto가 그것을 가른다). */
    const asOf = document.getElementById('pkgAsOf');
    if (asOf && asOf.dataset.auto) {
      if (basis === 'agency') { asOf.value = ''; delete asOf.dataset.auto; }
    } else if (asOf && basis === 'assembled' && !asOf.value) {
      asOf.value = pkgToday(); asOf.dataset.auto = '1';
    }
    /* 항목 합을 실시간으로 보여준다 — 저장 뒤에야 알면 이미 늦다 */
    const sumBox = document.getElementById('pkgItemsSum');
    if (sumBox) {
      const items = pkgParseItems((document.getElementById('pkgItems') || {}).value);
      /* 🔴 **상한을 넘으면 저장할 때 조용히 사라진다** (XF).
         서버(`lineItemsOf`)가 41번째부터 잘라 내고, 이름이 긴 것은 60자에서 자른다.
         그런데 **항목 합이 곧 1인 금액**이라(그 위에 그렇게 적혀 있다) 잘린 만큼
         **고객가가 조용히 줄어든다.** 화면이 「덮어씁니다」라고 약속해 놓고 다른 값이
         저장되는 셈이다 — 저장을 누르기 전에 그 자리에서 말한다.
       ⚠ **막지는 않는다.** 저장 자체를 못 하게 하면 담당자가 적어 둔 것을 잃는다.
         무엇이 잘릴지 알려 주고 판단은 사람이 한다(MAX_DAYS에서 세운 규칙과 같다). */
      const maxItems = (typeof LIMITS !== 'undefined' && LIMITS.PKG_MAX_ITEMS) || 40;
      const maxLabel = (typeof LIMITS !== 'undefined' && LIMITS.PKG_MAX_ITEM_LABEL) || 60;
      const over = items.length > maxItems;
      const longLabels = items.filter((it) => it.label.length > maxLabel);
      const warn = [];
      if (over) {
        warn.push('🔴 ' + maxItems + '줄을 넘었습니다 — ' + (maxItems + 1) + '번째부터는 **저장되지 않고**, '
          + '그만큼 1인 금액이 줄어듭니다(' + items.slice(maxItems).reduce((s, it) => s + it.amount, 0).toLocaleString() + '원).');
      }
      if (longLabels.length) {
        warn.push('🔴 이름이 ' + maxLabel + '자를 넘는 줄 ' + longLabels.length + '개 — 저장할 때 잘립니다.');
      }
      sumBox.textContent = items.length
        ? '항목 ' + items.length + '개 · 합계 ' + items.reduce((s, it) => s + it.amount, 0).toLocaleString()
          + '원 → 저장하면 이 값이 위 「1인 금액」을 덮어씁니다.'
          + (warn.length ? '  ' + warn.join('  ') : '')
        : '';
      sumBox.style.color = warn.length ? '#B91C1C' : '#777';
    }
  }

  /* 「이름 | 금액」 한 줄씩. 금액에 쉼표가 섞여 들어오는 일이 흔해 먼저 턴다. */
  function pkgParseItems(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.lastIndexOf('|');
      if (i < 0) return null;
      const label = l.slice(0, i).trim();
      const amount = Math.round(Number(l.slice(i + 1).replace(/[,\s원]/g, '')));
      return label && Number.isFinite(amount) ? { label, amount } : null;
    }).filter(Boolean);
  }

  function pkgParseIti(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
      const parts = l.split('|');
      const title = (parts[0] || '').trim();
      const body = (parts.slice(1).join('|') || '').trim();
      return { day: i + 1, title, am: body, pm: '', eve: '' };
    });
  }
  const pkgLines = (id) => String((document.getElementById(id) || {}).value || '')
    .split('\n').map(s => s.trim()).filter(Boolean);

  /* ── 견적서 발급 ──────────────────────────────────────────────────────────
     ⚠ **막는 이유를 말한다.** 버튼만 죽여 두면 담당자는 왜 안 되는지 모르고,
       그 상태가 오래가면 「원래 안 되는 기능」으로 굳는다(결함 생성기 ②). */
  function pkgIssueReset(p) {
    const out = document.getElementById('pkgIssueOut');
    const btn = document.getElementById('pkgIssue');
    const gate = document.getElementById('pkgIssueGate');
    const msg = document.getElementById('pkgIssueMsg');
    if (out) out.classList.add('hidden');
    if (msg) msg.textContent = '';
    /* 🔴 **앞 손님의 값을 비운다**(WF). 이 함수는 상품을 열 때마다 불리는데 인원·이름·
       연락처를 안 지우고 있었다 — 김보균님께 발급한 뒤 다른 상품을 열면 그 칸이 그대로
       남아, 다음 견적서가 **남의 이름과 연락처로** 대장에 박힌다. 인원도 마찬가지다:
       앞 건의 4명이 남으면 총액이 조용히 틀린 채 고객에게 나간다.
       ⚠ 감추는 것과 비우는 것은 다르다 — 여기는 **비우는 게 맞는** 자리다(사람이
         바뀌었다). 편집 폼에서 값을 지키는 것과 반대 방향이지만 이유가 다르다. */
    ['pkgIssueName', 'pkgIssueTel'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const paxEl = document.getElementById('pkgIssuePax');
    if (paxEl) paxEl.value = '2';
    let why = '';
    if (!p) why = '먼저 저장하세요 — 견적서는 저장된 내용을 서버가 읽어서 만듭니다.';
    else if (p.status !== 'open') {
      /* ⚠ 상태 이름을 화면과 **같은 말**로 부른다(VU). 1회용에서 open은 「확정」이고
         상품에서는 「판매중」인데, 여기서 한쪽 말만 쓰면 담당자가 자기 화면에 없는
         버튼을 찾는다. 뜻은 하나다 — 「이 값으로 견적서를 내도 된다」. */
      const adhoc = (p.kind || 'catalog') === 'adhoc';
      const now = (adhoc
        ? { draft: '작성중', closed: '종료' }
        : { draft: '작성중', closed: '마감' })[p.status] || p.status;
      why = adhoc
        ? '「확정」 상태에서만 발급됩니다. 지금은 「' + now + '」입니다 — 확인 안 된 금액으로 견적서가 나가면 그 금액을 우리가 물게 됩니다.'
        : '「판매중」 상태에서만 발급됩니다. 지금은 「' + now + '」입니다 — 마감·작성중인 값으로 견적서가 나가면 그 금액을 우리가 물게 됩니다.';
    }
    /* 🔴 **서버는 세 가지를 본다**(`_lib/packages.js`의 `getIssuablePackage`, WR):
         ① status='open'  ② 유효기간이 안 지남  ③ **출발일이 안 지남**
       그런데 이 화면은 **①만** 보고 있었다. 그래서 기한이나 출발일이 지난 건은
       **버튼이 눌리고, 눌러 보고서야 404로 거절**당했다 — `limits.js`의 MAX_DAYS
       주석이 말한 바로 그 상황이다(「화면이 막지 않고 서버만 거절하면 담당자는
       눌러서야 안다」). 그리고 그때 뜨던 문구는 **출발일을 언급도 안 했다**(WR에서
       조건을 늘렸는데 문구가 안 따라갔다).
     ⚠ 조건이 서버·화면 두 곳에 있게 된다 — `test_xG`가 **셋이 같은지 대조**한다.
     ⚠ 값이 **비어 있는 것은 「지났다」가 아니다**(서버와 같은 규칙). */
    else {
      const today = new Date().toISOString().slice(0, 10);
      const day = (v) => (v ? String(v).slice(0, 10) : '');
      if (day(p.validUntil) && day(p.validUntil) < today) {
        why = '유효기간이 지났습니다 (' + day(p.validUntil) + ') — 기한을 늘리고 저장하신 뒤에 발급됩니다.';
      } else if (day(p.departDate) && day(p.departDate) < today) {
        why = '출발일이 지났습니다 (' + day(p.departDate) + ') — 지난 출발편으로 견적서가 나가면 그 금액을 우리가 물게 됩니다.';
      }
    }
    if (gate) gate.textContent = why;
    if (btn) btn.disabled = !!why;
  }

  async function pkgIssueNow() {
    const msg = document.getElementById('pkgIssueMsg');
    const out = document.getElementById('pkgIssueOut');
    if (!pkgEditing) return;
    const pax = Number((document.getElementById('pkgIssuePax') || {}).value);
    if (!Number.isFinite(pax) || pax < 1 || pax > 500) {
      msg.style.color = '#B91C1C'; msg.textContent = '인원을 1~500명 사이로 넣어 주세요.'; return;
    }
    /* 연락처는 서버가 막는다(WF 후속) — 눌러 보고 알게 하지 말고 **여기서 먼저** 말한다.
       ⚠ 기준을 여기 다시 적지 않는다: 숫자 9자는 `normalizeTel`이 정하는 값이고,
         화면이 따로 세면 언젠가 어긋난다. 같은 숫자를 쓰되 이유를 적어 둔다. */
    const issueTel = String((document.getElementById('pkgIssueTel') || {}).value || '').trim();
    if (issueTel.replace(/\D/g, '').length < 9) {
      msg.style.color = '#B91C1C';
      msg.textContent = '고객 연락처를 넣어 주세요 — 연락처 없는 견적서는 담당자가 자리를 비웠을 때 이어받을 수 없습니다. (견적서에는 표시되지 않습니다)';
      return;
    }
    msg.style.color = '#666'; msg.textContent = '만드는 중…';
    try {
      /* ⚠ **금액을 보내지 않는다.** id와 인원만 보내고 나머지는 서버가 DB에서 읽는다. */
      const r = await fetch('/api/quote-shares?action=package', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkgEditing, pax: pax,
          /* 🔴 payload가 아니라 바깥 칸이다(WC·WF) — 서버가 대장 컬럼에만 저장한다.
             ⚠ 비워 두면 서버가 「고객 표시 → 상품명」 순으로 채운다(지우지 않았다). */
          customerName: (document.getElementById("pkgIssueName") || {}).value || "",
          customerTel: (document.getElementById("pkgIssueTel") || {}).value || "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) {
        /* 🔴 **다시 누르면 되는 것**과 **고쳐야 되는 것**을 가른다(XH). 아래 셋은
           우리 쪽이 잠깐 안 된 것이라 담당자가 고칠 게 없다 — 예전엔 표에 없어서
           `quote_no_failed` 같은 코드가 **영문 그대로** 화면에 찍혔다. */
        const soon = ' — 조금 뒤 다시 눌러 주세요. (담당자가 고칠 것은 없습니다.)';
        const why = {
          /* ⚠ WR에서 발급 조건에 **출발일**이 더해졌는데 이 문구는 안 따라갔다.
             서버가 막는 이유를 다 적어야 담당자가 무엇을 고칠지 안다. */
          package_not_available: '지금 발급할 수 없는 상태입니다 — 「판매중(확정)」인지, 유효기간과 **출발일**이 지나지 않았는지 보세요.',
          invalid_pax: '인원을 다시 확인해 주세요.',
          tel_required: '고객 연락처를 넣어 주세요 (견적서에는 표시되지 않습니다).',
          package_price_broken: '금액이 비어 있습니다 — 1인 금액이나 조립 항목을 채우고 저장해 주세요.',
          invalid_package_id: '상품을 다시 고른 뒤 눌러 주세요 (상품 id가 올바르지 않습니다).',
          package_lookup_failed: '상품을 읽지 못했습니다' + soon,
          /* 🔴 **번호를 못 따면 발급 자체를 안 한다**(WB) — 번호 없이 나간 건은 대장에서
             영영 못 찾기 때문이다. 그러니 이건 「실패」가 아니라 「아직 안 만들었다」다. */
          quote_no_failed: '견적번호를 받지 못해 **만들지 않았습니다**' + soon,
          insert_failed: '저장하지 못했습니다' + soon,
          unauthorized: '로그인이 풀렸습니다. 새로고침 후 다시 시도해 주세요.',
          /* ⚠ **`unauthorized`와 갈라야 한다.** 이건 로그인이 풀린 게 아니라 계정 조회가
             잠깐 안 된 것이다(503). 「로그인이 풀렸습니다」로 말하면 담당자는 멀쩡한
             세션을 두고 재로그인을 반복한다 — `api/_lib/auth.js`가 그래서 코드를 갈라 놨다. */
          session_check_failed: '로그인 상태를 확인하지 못했습니다' + soon,
        }[d.error] || (d.error || ('오류 ' + r.status));
        msg.style.color = '#B91C1C'; msg.textContent = '만들지 못했습니다 — ' + why;
        return;
      }
      const url = location.origin + '/estimate-view.html?id=' + encodeURIComponent(d.id);
      document.getElementById('pkgIssueUrl').value = url;
      document.getElementById('pkgIssueOpen').href = url;
      out.classList.remove('hidden');
      msg.style.color = '#166534';
      msg.textContent = '만들었습니다 (' + (d.verdict === 'assembled' ? '담당자 산출' : '패키지 상품') + ').';
    } catch (err) {
      msg.style.color = '#B91C1C';
      msg.textContent = '만들지 못했습니다 — ' + String(err.message || err);
    }
  }

  /* ── 📄 PDF에서 불러오기 (WA) ───────────────────────────────────────────────
     `/api/quotes?action=extractPdf`를 그대로 쓴다 — 「견적서 업데이트」가 쓰는 그 추출기다.
     ⚠ **새 API를 만들지 않았다.** Vercel Hobby 함수 12개 제한에 이미 도달해 있다. */

  /* 🔗 하나투어 상품 주소로 불러오기 (WJ).
     ⚠ PDF 경로(pkgReadPdf)와 **같은 규칙**을 쓴다 — 빈 칸만 채우고, 저장은 안 하고,
       무엇을 채우고 무엇을 그대로 뒀는지 말한다. 규칙이 갈리면 담당자는 두 버튼이
       서로 다르게 동작한다고 배우게 된다. */
  async function pkgReadHanatour() {
    const msg = document.getElementById('pkgHtMsg');
    const url = String((document.getElementById('pkgHtUrl') || {}).value || '').trim();
    if (!url) { msg.style.color = '#B91C1C'; msg.textContent = '하나투어 상품 주소를 넣어 주세요.'; return; }
    msg.style.color = '#666'; msg.textContent = '하나투어에서 읽는 중…';

    let d;
    try {
      const r = await fetch('/api/quotes?action=hanatour', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        /* 🔴 **왜 안 됐는지를 그대로 말한다.** 「실패」로 뭉뚱그리면 담당자는 다시
           누르기만 하고, 그러다 손으로 채워야 하는 상황을 못 알아챈다. */
        msg.style.color = '#B91C1C';
        msg.textContent = '읽지 못했습니다 — ' + (d.why || {
          invalid_url: '주소가 잘못됐습니다.',
          fetch_failed: '하나투어에 물어보지 못했습니다. 잠시 뒤 다시 눌러 주세요.',
          unauthorized: '로그인이 풀렸습니다. 새로고침 후 다시 시도해 주세요.',
        }[d.error] || (d.error || ('오류 ' + r.status)));
        return;
      }
    } catch (err) {
      msg.style.color = '#B91C1C'; msg.textContent = '읽지 못했습니다 — ' + String(err.message || err);
      return;
    }

    const row = d.row || {};
    /* ⚠ **빈 칸만 채운다.** 사람이 적어 둔 값을 덮으면 그 수정이 조용히 사라진다. */
    const filled = [], kept = [];
    const put = (id, val, label) => {
      const el = document.getElementById(id);
      if (!el || val == null || val === '') return;
      if (String(el.value).trim()) { kept.push(label); return; }
      el.value = val; filled.push(label);
    };
    put('pkgTitle', row.title, '상품명');
    put('pkgDestLabel', row.destLabel, '지역');
    put('pkgNights', row.nights, '박');
    put('pkgDays', row.days, '일');
    put('pkgDepart', row.departDate, '출발일');
    put('pkgPrice', row.pricePerPerson, '1인 금액');
    put('pkgSourceCode', row.sourceCode, '공급사 상품코드');
    /* WL — 이제 함께 온다. 포함/불포함은 **고객 견적서에 그대로 나가는 글**이라
       빈 칸일 때만 넣고, 사람이 읽고 다듬는다. */
    put('pkgImage', row.imageUrl, '사진');
    if (row.included && row.included.length) put('pkgIncl', row.included.join('\n'), '포함사항');
    if (row.excluded && row.excluded.length) put('pkgExcl', row.excluded.join('\n'), '불포함사항');
    if (row.itinerary && row.itinerary.length) {
      put('pkgIti', row.itinerary.map((x) => (x.title || ('DAY ' + x.day)) + ' | ' + (x.am || '')).join('\n'), '일정');
    }
    /* 🔴 **금액 확인일은 「오늘」로 채우지 않는다**(VP·WA에서 세운 원칙). 다만 WL부터는
       **하나투어가 이 상품을 마지막으로 고친 날**을 함께 받는다 — 그건 우리가 읽은 날이
       아니라 **공급사가 밝힌 날**이라 이 칸의 뜻에 맞는다. 못 받으면 여전히 비워 둔다. */
    put('pkgAsOf', row.priceAsOf, '금액 확인일');

    /* 요율표에 있는 목적지면 골라 준다 — 지역명만 적혀 있으면 우리 목적지와 안 이어진다.
       ⚠ **정확히 같은 이름일 때만.** 「방콕」→「방콕」은 되지만 비슷한 이름을 짐작해
         고르면 다른 목적지의 요율·시즌이 붙는다(지역이 다르면 별도 목적지 방침). */
    const destSel = document.getElementById('pkgDest');
    if (destSel && !destSel.value && row.destLabel) {
      const hit = Array.from(destSel.options).find((o) => o.value && o.value === String(row.destLabel).trim());
      if (hit) { destSel.value = hit.value; filled.push('요율표 목적지'); }
    }

    const bits = [];
    /* 🔴 상품명에서 뺀 해시태그를 **버리지 않고 보여준다** (WU).
       하나투어 상품명의 99%가 「… #이비스 스타일스 실롬 #위치BEST」 꼴이라 그대로 두면
       고객 견적서 제목이 태그 범벅이 된다. 그렇다고 조용히 지우면 담당자는 무엇이
       사라졌는지 모른다 — 뺀 것을 그 자리에서 말하고, 필요하면 직접 붙이게 한다. */
    if ((row.titleTags || []).length) {
      bits.push('상품명에서 태그를 뺐습니다 — ' + row.titleTags.map((t) => '#' + t).join(' ')
        + ' (필요하면 제목 칸에 직접 붙이세요)');
    }
    if (filled.length) bits.push('채웠습니다: ' + filled.join(' · '));
    if (kept.length) bits.push('이미 적혀 있어 그대로 둔 칸: ' + kept.join(' · '));
    if ((d.missing || []).length) bits.push('🔴 못 읽은 칸: ' + d.missing.join(' · '));
    /* 🔴 「못 읽음」보다 이쪽이 더 위험하다 — 값은 들어왔는데 앞뒤가 안 맞는 것이다.
       빨갛게, 그리고 못 읽은 칸보다 **먼저** 읽히게 둔다. */
    (d.warnings || []).forEach((t) => bits.push('🔴 확인 필요: ' + t));
    (d.notProvided || []).forEach((t) => bits.push('⚠ ' + t));
    if (row.priceParts && row.priceParts.base != null) {
      bits.push('금액 구성(하나투어 표기): 상품가 ' + Number(row.priceParts.base).toLocaleString()
        + ' + 제세공과금 ' + Number(row.priceParts.tax || 0).toLocaleString()
        + ' + 유류할증료 ' + Number(row.priceParts.fuel || 0).toLocaleString()
        + ' = ' + Number(row.pricePerPerson || 0).toLocaleString() + '원'
        + (row.priceParts.singleAddNote ? ' · ' + row.priceParts.singleAddNote : ''));
    }
    bits.push('저장은 하지 않았습니다 — 값을 확인하신 뒤 「저장」을 누르세요.');
    msg.style.color = (d.warnings || []).length ? '#B91C1C'
      : ((d.missing || []).length ? '#92400E' : '#166534');
    msg.innerHTML = bits.map(esc).join('<br>');
    pkgSyncNotes();
  }

  async function pkgReadPdf() {
    const msg = document.getElementById('pkgPdfMsg');
    const file = (document.getElementById('pkgPdf') || {}).files?.[0];
    if (!file) { msg.style.color = '#B45309'; msg.textContent = 'PDF를 고르세요.'; return; }
    msg.style.color = '#666'; msg.textContent = '읽는 중… (10초쯤 걸립니다)';
    let d;
    try {
      const b64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1]);
        fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
        fr.readAsDataURL(file);
      });
      const r = await fetch('/api/quotes?action=extractPdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: b64 }),
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        msg.style.color = '#B91C1C';
        msg.textContent = '읽지 못했습니다 — ' + ({
          pdf_parse_failed: 'PDF를 열지 못했습니다',
          no_text_found: '글자가 없는 PDF입니다(사진으로만 된 문서)',
          invalid_body: '파일이 잘못되었습니다',
        }[d.error] || (d.error || ('오류 ' + r.status)));
        return;
      }
    } catch (err) {
      msg.style.color = '#B91C1C'; msg.textContent = '읽지 못했습니다 — ' + String(err.message || err);
      return;
    }

    /* ⚠ **빈 칸만 채운다.** 사람이 적어 둔 값을 덮으면 그 수정이 조용히 사라진다. */
    const filled = [], skippedF = [];
    const put = (id, val, label) => {
      const el = document.getElementById(id);
      if (!el || val == null || val === '') return;
      if (String(el.value).trim()) { skippedF.push(label); return; }
      el.value = val; filled.push(label);
    };
    const dates = d.dates || {};
    put('pkgTitle', file.name.replace(/\.pdf$/i, '').replace(/_\d{6,8}$/, '').trim(), '상품명');
    put('pkgNights', dates.nights || '', '박');
    put('pkgDays', dates.days || '', '일');
    put('pkgDepart', dates.departDate || '', '출발일');
    put('pkgPrice', d.perPerson || '', '1인 금액');
    /* 🔴 금액 확인일: 문서 작성일 → 없으면 **파일 이름의 날짜**. 오늘은 절대 안 넣는다.
       규칙은 `ai-loop/_package_rows.js`와 같다(그쪽이 투입 도구의 단일 출처다). */
    let asOf = dates.quoteDate || '';
    let asOfFrom = '문서 작성일';
    if (!asOf) {
      const m = /_(\d{2})(\d{2})(\d{2})(?:\D|$)/.exec(file.name);
      if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) {
        asOf = '20' + m[1] + '-' + m[2] + '-' + m[3]; asOfFrom = '파일 이름';
      }
    }
    put('pkgAsOf', asOf ? String(asOf).slice(0, 10) : '', '금액 확인일(' + asOfFrom + ')');

    /* 일정 — 「제목 | 내용」 한 줄씩. 없는 구분(오전/오후)을 지어내지 않는다. */
    const days = (d.itinerary && Array.isArray(d.itinerary.days)) ? d.itinerary.days : [];
    if (days.length) {
      const text = days.map((x) => {
        const lines = Array.isArray(x.lines) ? x.lines.filter(Boolean) : [];
        return [String(x.place || x.date || '').trim(), lines.join(' / ')].filter(Boolean).join(' | ');
      }).join('\n');
      put('pkgIti', text, '일정 ' + days.length + '일');
    }

    pkgSyncNotes();
    msg.style.color = filled.length ? '#166534' : '#B45309';
    msg.textContent = (filled.length ? '채웠습니다: ' + filled.join(' · ') : '채울 것이 없었습니다')
      + (skippedF.length ? '  /  이미 적혀 있어 그대로 둠: ' + skippedF.join(' · ') : '')
      + (days.length ? '' : '  /  ⚠ 일정을 못 읽었습니다 — 손으로 넣으셔야 합니다')
      + '  →  확인하시고 「저장」을 누르세요.';
  }

  async function pkgSave() {
    const msg = document.getElementById('pkgMsg');
    const g = (id) => (document.getElementById(id) || {}).value || '';
    const asOf = g('pkgAsOf');
    /* ⚠ 서버도 막지만 화면에서 먼저 말해 준다 — 서버 오류 문자열보다 이쪽이 친절하다.
       ⚠ 다만 **화면 검사를 방어선으로 삼지 않는다.** 서버가 not null로 거절한다. */
    if (!asOf) { msg.style.color = '#B91C1C'; msg.textContent = '「금액 확인일」을 넣어 주세요 — 언제 확인한 금액인지가 고객 견적서에 함께 나갑니다.'; return; }

    const body = {
      id: g('pkgId').trim(),
      title: g('pkgTitle').trim(),
      destKey: g('pkgDest') || null,
      destLabel: g('pkgDestLabel').trim() || null,
      nights: g('pkgNights') || null,
      days: g('pkgDays') || null,
      departDate: g('pkgDepart') || null,
      pricePerPerson: g('pkgPrice'),
      priceAsOf: asOf,
      validUntil: g('pkgValid') || null,
      status: g('pkgStatus'),
      kind: g('pkgKind') || 'catalog',
      priceBasis: g('pkgBasis') || 'agency',
      customerLabel: g('pkgCustomer').trim() || null,
      /* ⚠ 합계는 **서버가** 다시 구한다. 여기서 계산해 보낸 총액은 쓰이지 않는다 —
         금액을 브라우저가 정하게 두는 순간 그게 위조 경로다(VQ 원칙). */
      lineItems: pkgParseItems(g('pkgItems')),
      sourceCode: g('pkgSourceCode').trim() || null,
      imageUrl: g('pkgImage').trim() || null,
      included: pkgLines('pkgIncl'),
      excluded: pkgLines('pkgExcl'),
      itinerary: pkgParseIti(g('pkgIti')),
    };

    msg.style.color = '#666'; msg.textContent = '저장 중…';
    try {
      const r = await fetch('/api/content?action=packages', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        /* 서버가 왜 거절했는지를 **그대로 보여준다.** 「저장 실패」로 뭉뚱그리면
           담당자가 무엇을 고쳐야 할지 모른다. */
        const why = {
          invalid_id: '상품 ID는 영문·숫자·- _ 만 됩니다',
          invalid_title: '상품명을 넣어 주세요',
          invalid_price: '1인 금액을 숫자로 넣어 주세요',
          price_asof_required: '「금액 확인일」이 필요합니다',
          unknown_dest_key: '요율표에 없는 목적지입니다',
          payload_too_large: '일정·포함사항이 너무 깁니다',
          invalid_line_items: '조립 항목을 읽지 못했습니다 — 「이름 | 금액」 형식인지 보세요',
          adhoc_requires_manager: '직접견적은 매니저 이상만 만들 수 있습니다 (엔진 검증을 거치지 않는 값이라 그렇습니다)',
          kind_check_failed: '기존 내용을 확인하지 못했습니다 — 잠시 뒤 다시 시도해 주세요',
        }[out.error] || (out.error || ('오류 ' + r.status));
        msg.style.color = '#B91C1C'; msg.textContent = '저장하지 못했습니다 — ' + why;
        return;
      }
      msg.style.color = '#166534'; msg.textContent = '저장했습니다.';
      const savedId = body.id;
      await renderPackages();
      /* 저장 직후 **발급 자리를 다시 판정한다.** 안 그러면 방금 「판매중」으로 바꾼
         담당자가 계속 「먼저 저장하세요」를 보게 된다. */
      pkgEditing = savedId;
      pkgIssueReset(pkgAll.find(p => p.id === savedId) || null);
    } catch (err) {
      msg.style.color = '#B91C1C';
      msg.textContent = '저장하지 못했습니다 — ' + String(err.message || err);
    }
  }

  /* ── 목록에서 바로 지우기 (ZN) ───────────────────────────────────────────
     🔴 **작성중(`draft`)만 받는다.** 발급은 `status='open'`일 때만 되므로
       (`api/_lib/packages.js`) 작성중은 **견적서가 나간 적이 없다** — 지워도
       고객 쪽에 아무 영향이 없는 유일한 상태다. 버튼을 작성중에만 달고 **여기서 한 번
       더 본다** — 목록이 낡은 상태로 남아 있을 때(다른 사람이 그 사이 「확정」으로 바꿨다면)
       버튼만으로는 못 막는다.
     ⚠ **서버는 상태를 안 가린다.** 가리면 편집 화면의 기존 삭제가 막힌다 — 그쪽은
       마감된 것도 지울 수 있어야 하는 길이다. 즉 이 제한은 **목록이라는 지름길의
       조건**이지 삭제 자체의 규칙이 아니다.
     ⚠ 무엇을 지우는지 **이름을 넣어 묻는다.** 「이 항목을 지울까요?」는 목록에서
       누른 줄이 맞는지 확인할 방법이 없다.
     ⚠ 서버가 `deletion_log`에 행 전체를 남긴다(YP) — 2026-08-24에 상품 30건이
       흔적 없이 사라진 자리라 그 장치가 생겼다. 여기서 다시 세우지 않는다. */
  /* ── 목록에서 내리기 (ZO) ─────────────────────────────────────────────────
     대표와 합의한 규칙: **지우고 싶은 것의 대부분은 「지우기」가 아니라 「내리기」다.**
     견적서 대장이 삭제 대신 `void`로 내리는 것과 같은 판단이고, 여기서도 확정 건에는
     삭제 대신 이것을 준다.

     🔴 **상태만 바꾼다 — 되돌릴 수 있다.** 그래서 삭제와 달리 빨강을 안 쓰고,
       확인 창에서도 「되돌릴 수 있습니다」라고 말한다. 실수해도 손해가 없다는 것이
       이 버튼을 목록에 둘 수 있는 이유다.
     ⚠ **저장 경로를 새로 만들지 않았다.** 목록이 가진 행을 그대로 PUT으로 되돌려
       보내되 `status`만 바꾼다 — 저장 규칙(검증·권한·기본값)이 두 벌이 되면 반드시
       어긋난다(결함 생성기 ①). GET이 주는 이름과 PUT이 읽는 이름이 전부 같은 것을
       확인하고 이 방식을 골랐다.
     ⚠ 직접견적(adhoc)은 **매니저 이상만** 저장할 수 있다(서버 규칙). 권한이 없으면
       서버가 거절하고, 여기서 그 이유를 그대로 보여준다 — 「안 되네」로 끝나면 안 된다. */
  async function pkgCloseRow(p, isAdhoc) {
    if (!p || !p.id) return;
    const verb = isAdhoc ? '종료' : '내리기';
    const stateName = isAdhoc ? '종료' : '마감';
    if (p.status !== 'open') {
      alert('「' + (isAdhoc ? '확정' : '판매중') + '」인 건만 ' + verb + '할 수 있습니다.');
      return;
    }
    if (!confirm('「' + (p.title || p.id) + '」을(를) 「' + stateName + '」으로 바꿉니다.\n'
      + (isAdhoc ? '새 견적서를 발급할 수 없게 됩니다.' : '고객 목록에서 사라집니다.') + '\n\n'
      /* ⚠ 확인 창은 **글자 그대로** 보인다 — `**강조**` 같은 표기를 쓰면 별표가 그대로 뜬다. */
      + '지우는 것이 아니라 상태만 바뀌므로 되돌릴 수 있습니다 (편집 → 상태 → 저장).')) return;
    try {
      const r = await fetch('/api/content?action=packages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, status: 'closed' }),
      });
      if (!r.ok) {
        let why = 'http_' + r.status;
        try { const j = await r.json(); if (j && j.error) why = j.error; } catch (e) { /* 본문이 없을 수 있다 */ }
        if (why === 'adhoc_requires_manager') {
          throw new Error('직접견적은 매니저 이상만 바꿀 수 있습니다 — 팀장님께 요청해 주세요.');
        }
        throw new Error(why);
      }
      await renderPackages();
    } catch (err) {
      /* ⚠ 조용히 실패하지 않는다 — 목록이 그대로면 「안 바뀌었다」와 「화면이 안 그려졌다」가
         같은 얼굴이 된다(결함 생성기 ②). */
      alert(verb + '하지 못했습니다 — ' + String(err.message || err));
    }
  }

  async function pkgDeleteRow(p) {
    if (!p || !p.id) return;
    if (p.status !== 'draft') {
      alert('「작성중」인 건만 목록에서 지울 수 있습니다.\n'
        + '이 건은 「' + (p.status === 'open' ? '판매중·확정' : '마감') + '」이라 '
        + '고객에게 나갔을 수 있습니다 — 열어서 확인한 뒤 지워 주세요.');
      return;
    }
    if (!confirm('「' + (p.title || p.id) + '」을(를) 지우시겠습니까?\n'
      + '작성중이라 고객에게 나간 적은 없습니다. 되돌릴 수 없습니다.')) return;
    try {
      const r = await fetch('/api/content?action=packages&id=' + encodeURIComponent(p.id), { method: 'DELETE' });
      if (!r.ok) throw new Error('http_' + r.status);
      /* 지우던 것을 편집 중이었으면 그 카드도 닫는다 — 안 닫으면 없는 것을 고치게 된다 */
      if (pkgEditing === p.id) {
        const card = document.getElementById('pkgEditCard');
        if (card) card.style.display = 'none';
        pkgEditing = null;
      }
      await renderPackages();
    } catch (err) {
      /* ⚠ 조용히 실패하지 않는다 — 목록이 그대로면 「안 지워졌다」와 「화면이 안 바뀌었다」가
         같은 얼굴이 된다(결함 생성기 ②). */
      alert('지우지 못했습니다 — ' + String(err.message || err) + '\n다시 시도해 주세요.');
    }
  }

  async function pkgDelete() {
    if (!pkgEditing) { document.getElementById('pkgEditCard').style.display = 'none'; return; }
    if (!confirm('이 상품을 지우시겠습니까? 되돌릴 수 없습니다.')) return;
    const msg = document.getElementById('pkgMsg');
    try {
      const r = await fetch('/api/content?action=packages&id=' + encodeURIComponent(pkgEditing), { method: 'DELETE' });
      if (!r.ok) throw new Error('http_' + r.status);
      document.getElementById('pkgEditCard').style.display = 'none';
      pkgEditing = null;
      await renderPackages();
    } catch (err) {
      msg.style.color = '#B91C1C';
      msg.textContent = '지우지 못했습니다 — ' + String(err.message || err);
    }
  }

/* ── 화면에 손잡이를 건다 (2b-1b-②) ─────────────────────────────────────────
   패키지 · 소규모 견적 화면.
   🔴 `DOMContentLoaded`로 감싸는 이유는 DOM이 아니라 **파일 사이의 순서**다
   (자세한 것은 admin/ledger.js 머리에 적었다).
   ⚠ 이 블록은 원래 admin.html에서 **이미 DOMContentLoaded로 감싸져 있었다** —
     그대로 옮기기만 했다. 안을 한 줄도 안 고쳤다.
   ───────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pkgNew')?.addEventListener('click', () => pkgOpen(null));
  document.getElementById('pkgNewAdhoc')?.addEventListener('click', () => pkgOpen(null, 'adhoc'));

  /* ══ 견적서 상세 작성 (2026-09-15, 개편 요구 4) ═════════════════════════════
     대표 지시: 「직접 견적 작성도 **3번(내부직원용)과 동일한 수준의 세부 입력**이
     가능해야 하고, **결과 데이터 규격은 완전히 동일**해야 한다.」

     🔴 **그 화면을 여기 다시 만들지 않는다.** 같은 화면을 `?mode=adhoc`으로 연다 —
       엔진만 안 타고(금액은 담당자가 적는다) 견적서·일정표를 만드는 부분은 **같은 코드**다.
       두 벌로 두면 한쪽만 고쳐지는 순간 두 경로가 다른 견적서를 낸다(결함 생성기 ①).
     ⚠ **저장 전에는 못 연다.** 그 화면은 상품 id로 값을 읽어 오는데, 저장 안 된 건은
       서버에 없다 — 열어 봐야 빈 화면이고 담당자는 고장으로 읽는다(결함 생성기 ②).
       그래서 「먼저 저장하세요」를 그 자리에서 말한다.
     ⚠ 새 탭으로 연다. 편집 중이던 내용을 잃지 않기 위해서다. */
  document.getElementById('pkgDocBtn')?.addEventListener('click', () => {
    const msg = document.getElementById('pkgMsg');
    const id = (document.getElementById('pkgId') || {}).value || '';
    if (!pkgEditing || !id) {
      if (msg) { msg.textContent = '먼저 「저장」을 눌러 주세요 — 저장된 건만 견적서를 만들 수 있습니다.'; msg.style.color = '#B45309'; }
      return;
    }
    window.open('admin-quote-pro.html?mode=adhoc&pkg=' + encodeURIComponent(id), '_blank', 'noopener');
  });
  document.getElementById('pkgSave')?.addEventListener('click', pkgSave);
  document.getElementById('pkgDelete')?.addEventListener('click', pkgDelete);
  document.getElementById('pkgCancel')?.addEventListener('click', () => {
    document.getElementById('pkgEditCard').style.display = 'none';
  });
  /* 종류 필터는 없앴다 (WE) — **탭이 곧 종류**다. 남겨 두면 「소규모 견적」 탭에서
     종류를 「패키지 상품」으로 골라 빈 목록을 보는 상태가 만들어진다. */
  document.getElementById('pkgFilterStatus')?.addEventListener('change', pkgDrawList);
  document.getElementById('pkgFilterGap')?.addEventListener('change', pkgDrawList);
  document.getElementById('adhocFilterStatus')?.addEventListener('change', pkgDrawList);
  /* 종류·출처·항목을 고치면 안내와 합계가 **그 자리에서** 따라간다 */
  ['pkgKind', 'pkgBasis'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', pkgSyncNotes));
  document.getElementById('pkgItems')?.addEventListener('input', pkgSyncNotes);
  /* 일정·포함사항·사진을 채우면 「비어 있습니다」 안내가 **그 자리에서** 사라져야 한다
     (WH). 안 사라지면 담당자는 채웠는데도 못 채운 줄 알고 다시 연다. */
  ['pkgIti', 'pkgIncl', 'pkgImage'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', pkgSyncNotes));
  document.getElementById('pkgIssue')?.addEventListener('click', pkgIssueNow);
  document.getElementById('pkgPdfRead')?.addEventListener('click', pkgReadPdf);
  document.getElementById('pkgHtRead')?.addEventListener('click', pkgReadHanatour);
  document.getElementById('pkgIssueCopy')?.addEventListener('click', () => {
    const el = document.getElementById('pkgIssueUrl');
    el.select();
    navigator.clipboard?.writeText(el.value).catch(() => {});
    document.getElementById('pkgIssueMsg').textContent = '복사했습니다.';
  });
});

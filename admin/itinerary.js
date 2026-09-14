/* ═══════════════════════════════════════════════════════════════════════════
   일정 관리 화면 (QB) — admin.html에서 떼어낸 화면 (구조 정리 2b-3)

   ■ 로드 규칙  `admin/common.js` 다음, admin.html의 인라인 <script> 앞에서 실린다.
     여기 있는 것은 전부 **선언**이다. 실행문(addEventListener·fetch)은 admin.html에
     그대로 남아 있다 — 그쪽은 DOM 순서에 걸려 있어 따로 다룬다(2b-1b).

   ■ 검사  `ai-loop/_admin_source.js`의 ADMIN_PARTS + `ai-loop/test_zZ_admin_boot.js`가
     **띄워서** 이 화면의 이름이 사는지 본다. 이 파일을 비우면 test_zZ가 실패해야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ════ QB: 일정 관리 ═══════════════════════════════════════════════════
     목적지별 추천 코스를 산출 담당자가 직접 고친다. data.js의 ITINERARY_DB가 기본값,
     DB(itinerary_overrides)에 저장된 것이 실제로 고객에게 나가는 값이다.

     ⚠ DOM은 innerHTML 문자열이 아니라 createElement로 만든다. 여기 들어가는 값은
     담당자가 방금 친 자유 문자열이고, 인라인 onclick 안의 JS 문자열은 esc()로 막을 수
     없다(CLAUDE.md — 홑따옴표를 안 바꾸고, &#39;로 바꿔도 HTML 파서가 되돌린 뒤 JS가
     해석한다). 그 구조 자체를 쓰지 않는 게 안전하다.
     ═══════════════════════════════════════════════════════════════════════ */
  const itiState = {
    destKey: '',
    courses: [],        /* 화면에서 편집 중인 일정 사본 */
    rec: null,          /* 화면에서 편집 중인 추천 콘텐츠 사본 (QC) */
    overrides: {},      /* 서버에 저장된 목적지별 일정 수정본 */
    recOverrides: {},   /* 서버에 저장된 목적지별 추천 콘텐츠 수정본 (QC) */
    meta: {},           /* 목적지별 { updatedAt, updatedBy } */
    loaded: false,
    dirty: false,
  };

  /* ════ RF: 지금 고치는 것만 펼쳐 둔다 ═════════════════════════════════════
     도쿄 기준으로 코스 3개 × 일자 5개 = 일자 카드 15장이 늘 전부 펼쳐져 있었다. 정작
     고치는 건 보통 한 코스의 한 일자인데 나머지 14장이 계속 자리를 차지한다(실측:
     세로 6,708px). 코스는 탭으로 하나씩, 일자는 접어 두고 고칠 것만 편다.

     ⚠ 접힘 상태는 **일자 객체 자체**로 기억한다(인덱스가 아니라). ↑↓로 자리를 옮기면
     인덱스는 바뀌지만 펼쳐 둔 일자는 그대로 펼쳐져 있어야 한다 — 인덱스로 기억하면
     3일차를 올렸을 때 엉뚱한 일자가 펼쳐진다. WeakSet이라 목적지를 바꿔 코스를 새로
     복제하면(itiClone) 저절로 전부 접힌 상태로 시작한다.

     ⚠ 접는 것의 진짜 위험은 **"안 보여서 못 본 채 저장"**이다. 그래서 접힌 줄이
     비어 있지 않다: 그날의 제목(없으면 첫 활동 문구)과, 빈 칸이 있으면 그 개수를 적는다.
     접혀 있어도 무엇이 들었고 무엇이 비었는지 읽힌다.
     ═══════════════════════════════════════════════════════════════════════ */
  const itiOpenDays = new WeakSet();
  const itiView = { courseIdx: 0 };

  const itiEmptyDay    = () => ({ day: 1, title: '', am: '', pm: '', eve: '', tip: '' });
  /* 배열 순서가 곧 일자 번호다. day 필드는 그 파생값이라 **구조가 바뀔 때마다 여기서
     다시 매긴다**(추가·삭제·순서 바꾸기·복제). 순서와 번호를 각각 관리하면 반드시
     어긋난다(결함 생성기 ①). 서버도 저장할 때 배열 순서로 다시 매기므로
     (api/content.js normalizeCourses), 화면에 보이는 번호와 저장된 번호가 같아진다. */
  function itiRenumberDays(course) {
    (course.days || []).forEach((d, i) => { d.day = i + 1; });
  }
  const itiEmptyCourse = () => ({ title: '', subtitle: '', highlights: [], days: [itiEmptyDay()] });
  const itiEmptyPlan   = () => ({ tag: '', desc: '', points: [], items: [], value: '' });
  /* 편집은 항상 사본으로 한다 — 기본값(ITINERARY_DB·DEST_REC)을 직접 건드리면
     되돌리기가 "되돌릴 원본이 이미 바뀐" 상태가 된다. */
  const itiClone = (v) => JSON.parse(JSON.stringify(v));

  function itiDefaults(destKey) {
    const db = (typeof ITINERARY_DB !== 'undefined') ? ITINERARY_DB[destKey] : null;
    return Array.isArray(db) ? itiClone(db) : [];
  }

  /* QC: 추천 콘텐츠 기본값. a·b 둘 다 있어야 서버가 받아준다(한쪽만 저장되면 화면
     그 자리가 조용히 일반 문구로 떨어진다) — 없는 쪽은 빈 칸으로 채워 보여준다. */
  function itiRecDefaults(destKey) {
    const src = (typeof DEST_REC !== 'undefined') ? DEST_REC[destKey] : null;
    const base = src ? itiClone(src) : {};
    return {
      a: Object.assign(itiEmptyPlan(), base.a || {}),
      b: Object.assign(itiEmptyPlan(), base.b || {}),
    };
  }

  function itiSetMsg(text, kind) {
    const el = document.getElementById('iti-msg');
    el.textContent = text || '';
    el.className = 'iti-msg' + (kind ? ' ' + kind : '');
  }

  function itiMarkDirty() {
    itiState.dirty = true;
    itiRenderState();
    /* 코스 일수가 바뀌면 두 구역의 관계 안내도 따라가야 한다 (QY). */
    itiRenderLink();
  }

  function itiRenderState() {
    /* 저장 안 함 표시(사이드바 ●·떠 있는 저장 바)를 여기서 함께 갱신한다 (QZ) —
       dirty가 바뀌는 모든 경로가 결국 이 함수를 지난다. */
    itiRefreshUnsavedUi();
    const el = document.getElementById('iti-state');
    if (!el) return;
    el.textContent = '';
    el.className = 'iti-state';
    if (!itiState.destKey) return;

    /* '수정됨'은 **이 구역 기준**으로만 말한다 — recRenderState와 같은 규칙이다 (RI).
       ⚠ meta는 목적지 **한 행 전체**(코스+방식 A·B)의 저장 시각이다. 코스와 방식이
       `itinerary_overrides` 한 행에 같이 들어가고, api/content.js는 행이 있으면
       courses가 null이어도 meta를 채운다. 그래서 meta만 보고 판단하면
       **방식 A·B만 저장한 목적지의 기본 일정이 '수정됨'이 된다**(프로덕션 상해가 그랬다).
       코스를 기본값으로 되돌린 직후에도 방식 저장본이 남아 있으면 meta가 남아
       '수정됨'이 그대로 붙었다 — 되돌렸는데 수정됨이라 말하는 게 제일 헷갈린다.
       무엇이 저장돼 있는지는 이 구역의 저장본이 정하고, meta는 '누가·언제'에만 쓴다. */
    /* ⚠ US: 「저장본이 있다」와 「사람이 고쳤다」는 다르다. 일괄로 심은 검토 전
       코스만 든 행을 '수정됨'이라 하면 담당자는 동료가 손본 줄 알고 그대로 둔다 —
       그러면 검토가 영영 안 일어난다. 판단은 rec_fallbacks 한 곳(recOverrideIsEdited)이고
       목적지 목록의 ✏️ 배지도 같은 함수를 쓴다. */
    const saved = itiState.overrides[itiState.destKey];
    if (!recOverrideIsEdited(saved)) {
      const pending = recPendingCount(itiState.courses);
      el.textContent = '기본 일정 (아직 수정한 적 없음)'
        + (pending ? ' · 🕒 검토 전 ' + pending + '개가 검토를 기다립니다' : '');
    } else {
      el.classList.add('is-edited');
      const m = itiState.meta[itiState.destKey];
      const when = m && m.updatedAt ? new Date(m.updatedAt).toLocaleString('ko-KR') : '';
      el.textContent = '수정됨 · ' + ((m && m.updatedBy) || '담당자 미상') + (when ? ' · ' + when : '');
    }
    if (itiState.dirty) {
      const tag = document.createElement('span');
      tag.className = 'iti-dirty';
      tag.textContent = '저장 안 함';
      tag.style.marginLeft = '.5rem';
      el.appendChild(tag);
    }
  }

  /* ════ RE: 칸 높이를 내용이 정한다 ═══════════════════════════════════════
     고정 높이는 짧은 문구에는 빈 자리를, 긴 문구에는 잘림을 만든다 — 둘 다 "쓰는 동안
     내용이 다 보여야 한다"(RC)를 어긴다. 여기서 높이를 실제 내용 높이로 맞춘다.

     ⚠ box-sizing이 border-box라 height에 테두리가 포함되는데 scrollHeight에는 안 들어간다.
     그냥 scrollHeight를 넣으면 매번 테두리 두께(3px)만큼 모자라 스크롤바가 생긴다.
     ⚠ **화면에 안 보이는 동안에는 잴 수 없다**(display:none이면 scrollHeight가 0이다).
     그때 0px를 박아 두면 칸이 사라진 것처럼 보이므로, 못 쟀으면 **손대지 않고 그대로 둔다**
     (결함 생성기 ②: 조용한 폴백 금지). 탭을 여는 순간 다시 부른다 — 그때는 잴 수 있다.
     ═══════════════════════════════════════════════════════════════════════ */
  function itiAutoGrow(el) {
    if (!el || !el.isConnected || el.offsetParent === null) return false;
    const cs = getComputedStyle(el);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    /* ⚠ 여기서 'auto'를 쓰면 안 된다. textarea의 auto 높이는 rows 속성(기본 2줄)이라
       scrollHeight가 절대 그 아래로 안 내려간다 — 한 줄짜리 문구도 두 줄 칸이 된다
       (실제로 그렇게 재서 62px이 나왔다). 0으로 눌러야 내용 높이가 그대로 읽힌다.
       0으로 눌러도 CSS의 min-height가 바닥을 잡아 주므로 칸이 사라지지 않는다. */
    el.style.height = '0px';
    el.style.height = (el.scrollHeight + border) + 'px';
    return true;
  }

  /* 다시 그린 뒤·탭을 연 뒤에 한 번에 맞춘다. 칸마다 부르는 자리를 따로 두면 언젠가
     한 곳을 빠뜨려 그 칸만 높이가 안 맞는다(결함 생성기 ①). */
  /* UM: 범위를 인자로 받는다. 예전엔 '#tab-itineraries' 안만 훑었는데, 견적서별
     일정 편집기는 그 탭 밖(모달)에 있어 **한 칸도 늘어나지 않았다** — 여러 줄 문구가
     두 줄짜리 칸에 갇혀 담당자가 쓴 글의 뒷부분이 안 보였다. */
  function itiAutoGrowAll(rootSel) {
    let done = 0;
    document.querySelectorAll((rootSel || '#tab-itineraries') + ' .iti-ta')
      .forEach((el) => { if (itiAutoGrow(el)) done++; });
    return done;
  }

  /* 라벨 있는 입력칸 한 줄. oninput에서 상태 객체의 해당 필드를 바로 갱신한다.
     pickKind를 주면 라벨 옆에 '고르기' 버튼이 붙는다(QL) — 칸마다 따로 만들지 않고
     여기 한 곳에서 붙여야 새 칸이 생겨도 빠지지 않는다. */
  /* markDirty를 받는 이유 (QU): 추천 콘텐츠가 별도 화면으로 나가면서 '수정 중' 표시를
     둘 중 어느 화면에 할지가 달라졌다. 기본값은 일정 관리 쪽이라 기존 호출은 그대로 둔다. */
  /* getDest까지 받는 이유 (QW): 고르기 창은 이제 두 화면에서 열린다. 후보의 '이 목적지'·
     '같은 지역'은 **연 화면이 고른 목적지**를 기준으로 해야 한다. 예전에는 무조건
     itiState.destKey를 봐서, ✨ 방식 A·B 소개에서 열면 📅 날짜별 일정 쪽 목적지가
     기준이 됐다(그쪽이 비어 있으면 아예 안 열렸다). */
  function itiField(labelText, value, multiline, onInput, pickKind, markDirty, getDest) {
    const dirty = markDirty || itiMarkDirty;
    const destOf = getDest || (() => itiState.destKey);
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.className = 'iti-lbl';
    lbl.textContent = labelText;
    const inp = document.createElement(multiline ? 'textarea' : 'input');
    inp.className = multiline ? 'iti-ta' : 'iti-inp';
    inp.value = value == null ? '' : String(value);
    /* 타이핑·붙여넣기·되돌리기 전부 input 이벤트를 낸다 — 여기 한 곳이면 충분하다.
       (여러 줄 칸만 늘어난다. 한 줄 칸은 아무리 키워도 보이는 글자가 늘지 않는다.) */
    inp.addEventListener('input', function () {
      onInput(inp.value); dirty();
      if (multiline) itiAutoGrow(inp);
    });

    if (pickKind && ITI_PICK_KINDS[pickKind]) {
      /* 라벨과 버튼을 한 줄에 둔다. 입력칸 옆에 넣으면 오전·오후·저녁·팁 2×2 그리드에서
         칸 폭이 제각각 줄어든다 — iti-day-head에서 이미 같은 문제를 겪었다. */
      const row = document.createElement('div');
      row.className = 'iti-lbl-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'iti-pick-btn';
      btn.textContent = '고르기';
      btn.addEventListener('click', function () {
        itiOpenPicker(pickKind, function () { return inp.value; }, function (next) {
          /* 고르기로 넣은 값은 input 이벤트를 내지 않는다 — 여기서 직접 맞춰 주지 않으면
             줄이 서너 개 붙는 목록 칸(하이라이트·핵심 포인트)에서 넣은 줄이 안 보인다. */
          inp.value = next; onInput(next); dirty();
          if (multiline) itiAutoGrow(inp);
        }, destOf());
      });
      row.appendChild(lbl); row.appendChild(btn);
      wrap.appendChild(row);
    } else {
      wrap.appendChild(lbl);
    }
    wrap.appendChild(inp);
    return wrap;
  }

  /* ════ QL: 활동 고르기 ══════════════════════════════════════════════════
     담당자가 빈 칸을 매번 새로 타이핑하던 것을, 이미 있는 문구에서 고르게 한다.

     ⚠ 후보 목록을 따로 만들어 두지 않는다. 지금 실제로 쓰이는 값(오버라이드가 있으면
     그것, 없으면 data.js 기본값)에서 열 때마다 뽑는다 — 목록을 복사해 두면 일정을
     고쳐도 후보는 안 바뀌어 반드시 어긋난다(결함 생성기 ①). 재료는 이미 충분하다:
     55개 목적지 × 코스 115개 × 일자 575개.

     mode가 둘인 이유: '오전'처럼 값이 하나인 칸은 바꿔치기(replace)지만, '핵심
     하이라이트'처럼 한 줄에 하나씩 적는 목록 칸은 줄을 더하는 것(line)이 맞다.
     같은 동작으로 묶으면 목록 칸에서 기존 줄이 통째로 날아간다.
     ═══════════════════════════════════════════════════════════════════════ */
  /* pick은 **문구와 함께 '그 목적지 안에서 어디서 왔는지'**를 돌려준다 (RB).
     후보를 이 목적지 안으로 좁히고 나면 "어느 목적지 것인가"는 전부 같아져서 쓸모가 없다.
     대신 "코스 B · DAY 2 오전"이 실제로 필요한 단서다 — 같은 목적지 안에서도 코스마다
     성격이 다르고(언어·리더십·산업), 몇 일차 문구인지가 그대로 판단 근거가 된다. */
  const ITI_PICK_KINDS = {
    dayTitle:  { label: '그날의 제목',      mode: 'replace', from: 'courses',
                 pick: (c) => (c.days || []).map((d, i) => ({ text: d.title, where: 'DAY ' + (i + 1) })) },
    dayAct:    { label: '오전·오후 활동',   mode: 'replace', from: 'courses',
                 pick: (c) => (c.days || []).reduce((a, d, i) => a.concat(
                   { text: d.am, where: 'DAY ' + (i + 1) + ' 오전' },
                   { text: d.pm, where: 'DAY ' + (i + 1) + ' 오후' }), []) },
    dayEve:    { label: '저녁 일정',        mode: 'replace', from: 'courses',
                 pick: (c) => (c.days || []).map((d, i) => ({ text: d.eve, where: 'DAY ' + (i + 1) })) },
    dayTip:    { label: '참고 팁',          mode: 'replace', from: 'courses',
                 pick: (c) => (c.days || []).map((d, i) => ({ text: d.tip, where: 'DAY ' + (i + 1) })) },
    highlight: { label: '핵심 하이라이트',   mode: 'line',    from: 'courses',
                 pick: (c) => (c.highlights || []).map((h) => ({ text: h, where: '하이라이트' })) },
    recPoint:  { label: '핵심 포인트',      mode: 'line',    from: 'rec',
                 pick: (r) => [].concat(
                   ((r.a && r.a.points) || []).map((t) => ({ text: t, where: '방식 A' })),
                   ((r.b && r.b.points) || []).map((t) => ({ text: t, where: '방식 B' }))) },
    recItem:   { label: '일별 주요 활동',    mode: 'line',    from: 'rec',
                 pick: (r) => [].concat(
                   ((r.a && r.a.items) || []).map((t) => ({ text: t, where: '방식 A' })),
                   ((r.b && r.b.items) || []).map((t) => ({ text: t, where: '방식 B' }))) },
  };

  const itiPick = { kind: '', read: null, write: null, q: '', destKey: '', fit: 0 };

  /* 기업 연수 적합도 등급 이름 (QX) — activity_rank.js의 1·2·3과 짝이다. */
  const ITI_FIT_LABEL = { 1: '연수', 2: '보완', 3: '여가' };

  /* 이 목적지의 **창고 전체** — 후보(활동 고르기·코스 가져오기)가 꺼내 쓸 수 있는 것.
     오버라이드가 있으면 그것이 진실이다(요율에서 data.js보다 rate_overrides가 진실인
     것과 같다). 후보도 같은 규칙을 따라야 화면과 안 어긋난다.
     ⚠ US: 다만 「검토 전(UQ)만 든 오버라이드」는 기본 코스를 **밀어내지 않는다.**
       예전 규칙 그대로 두면 일괄로 심은 목적지에서 기본 코스 2개가 후보 목록에서
       조용히 사라진다 — 고객에게는 그 기본 코스가 나가고 있는데(recApplyOverride)
       담당자 화면에서는 안 보이는, 두 화면이 어긋나는 상태다.
       병합 규칙은 rec_fallbacks.js 한 곳이고 고객 화면도 같은 함수를 부른다.
     ⚠ 검토 전도 **후보에는 남긴다.** 창고는 꺼내 쓰라고 있는 것이고, 검토 전이라는
       사실은 라벨이 따로 밝힌다(eqImportCandidates·목적지 목록의 🕒). */
  function itiLiveCourses(destKey) {
    const base = (typeof ITINERARY_DB !== 'undefined' && ITINERARY_DB[destKey]) || null;
    const merged = recApplyOverride(base, itiState.overrides[destKey]);
    return Array.isArray(merged) ? merged : [];
  }
  function itiLiveRec(destKey) {
    if (itiState.recOverrides[destKey]) return itiState.recOverrides[destKey];
    return (typeof DEST_REC !== 'undefined' && DEST_REC[destKey]) || null;
  }

  /* 후보는 **이 목적지 안에서만** 모은다 (RB).

     ⚠ 예전에는 '같은 지역'·'전체' 범위가 있어서 다른 나라 문구까지 후보로 나왔다.
     사용자 지적으로 걷어냈다 — 도쿄 일정에 파리 문구를 넣을 일은 없다. 한 번의 연수로
     두 지역을 가지 않기 때문이다. 실제로 그 후보들 때문에 "왜 다른 지역 문구가 여기
     있지?"가 나왔고, 매뉴얼에는 "넣은 뒤 목적지 이름이 남아 있는지 확인하라"는 경고까지
     적어야 했다. **경고가 필요하다는 것은 그 후보를 보여주면 안 된다는 뜻이었다.**
     (다른 목적지 것을 통째로 가져오는 길은 따로 있다 — '다른 목적지에서 가져오기'.
      거기서는 남은 목적지 이름을 세어 알려주므로 그 경고가 제자리에 있다.)

     55곳 × 7종류 = 385개 조합을 전부 세어 확인했다: 이 목적지만 남겨도 최소 4건,
     중앙값 8~19건이라 '고르기'가 빈 창이 되는 조합은 하나도 없다.

     순위 — 위에서부터:
       ① 기업 연수 적합도 등급 (연수 → 보완 → 여가, QX)
       ② 같은 등급이면 가나다순 (매번 흔들리면 아까 본 것을 다시 못 찾는다) */
  function itiPickCandidates(kind, destKey) {
    const spec = ITI_PICK_KINDS[kind];
    if (!spec) return [];
    const cur = destKey || itiPick.destKey || itiState.destKey;
    if (!cur) return [];

    /* 어디서 왔는지(코스·일자)를 함께 모은다. 같은 문구가 여러 자리에 있으면 처음 것만
       남긴다 — 같은 문구를 두 번 보여줄 이유가 없다. */
    const found = new Map();
    const add = (text, where) => {
      const s = String(text == null ? '' : text).trim();
      if (!s || found.has(s)) return;
      found.set(s, {
        text: s, where: where,
        /* 등급이 없는 문구(담당자가 새로 쓴 것)는 **중립(2)**. 3으로 밀면 새 문구가
           영영 맨 아래에 깔리고, 1로 올리면 검증 안 된 문구가 맨 위에 온다. */
        fit: (typeof ACTIVITY_RANK !== 'undefined' && ACTIVITY_RANK[s]) || 2,
      });
    };

    if (spec.from === 'courses') {
      itiLiveCourses(cur).forEach((c, i) => {
        const courseLabel = '코스 ' + String.fromCharCode(65 + i);
        (spec.pick(c) || []).forEach((p) => add(p.text, courseLabel + ' · ' + p.where));
      });
    } else {
      const rec = itiLiveRec(cur);
      if (rec) (spec.pick(rec) || []).forEach((p) => add(p.text, p.where));
    }

    const out = [...found.values()];
    out.sort((a, b) => (a.fit - b.fit) || a.text.localeCompare(b.text, 'ko'));
    return out;
  }

  function itiPickClose() {
    document.getElementById('itiPickModal').classList.add('hidden');
    /* ⚠ destKey도 반드시 비운다. 안 비우면 창을 닫은 뒤에도 그 목적지가 남아, 다음에
       기준을 명시하지 않고 후보를 물어보는 곳에서 **닫힌 창의 목적지**가 이긴다.
       (테스트가 실제로 이걸 잡았다 — 오사카에서 창을 닫은 뒤 도쿄 후보를 물었는데
       오사카 후보가 돌아왔다.) */
    itiPick.kind = ''; itiPick.read = null; itiPick.write = null; itiPick.destKey = '';
  }

  function itiOpenPicker(kind, read, write, destKey) {
    const spec = ITI_PICK_KINDS[kind];
    if (!spec) return;
    /* ⚠ 연 화면이 고른 목적지를 쓴다. 예전에는 무조건 itiState.destKey를 봐서,
       ✨ 방식 A·B 소개에서 열면 📅 날짜별 일정 쪽 목적지가 기준이 됐다(QW). */
    const cur = destKey || itiState.destKey;
    if (!cur) { (destKey === undefined ? itiSetMsg : recSetMsg)('목적지를 먼저 고르세요.', 'err'); return; }
    itiPick.kind = kind; itiPick.read = read; itiPick.write = write; itiPick.q = '';
    itiPick.destKey = cur;
    /* 등급 필터는 열 때마다 초기화한다 — 지난번에 '여가'로 걸러 둔 채 다시 열면
       "후보가 왜 이것뿐이지?"가 된다(창을 새로 여는 사람은 그 사실을 모른다). */
    itiPick.fit = 0;

    document.getElementById('itiPickTitle').textContent = spec.label + ' 고르기';
    const search = document.getElementById('itiPickSearch');
    search.value = '';
    search.placeholder = spec.mode === 'line'
      ? '검색 — 고른 문구가 한 줄씩 더해집니다'
      : '검색 — 고르면 이 칸의 내용이 바뀝니다';
    document.getElementById('itiPickModal').classList.remove('hidden');
    itiPickRender();
    search.focus();
  }

  function itiPickRender() {
    const spec = ITI_PICK_KINDS[itiPick.kind];
    if (!spec) return;
    const curText = itiPick.read ? String(itiPick.read() || '') : '';

    /* 현재 칸에 무엇이 들어 있는지 위에 보여준다 — 바꿔치기 칸에서 무엇을 잃는지
       모른 채 고르는 일을 없앤다. */
    const curBox = document.getElementById('itiPickCur');
    curBox.textContent = '';
    if (curText.trim()) {
      const b = document.createElement('strong');
      b.textContent = spec.mode === 'line' ? '지금 이 칸의 줄: ' : '지금 이 칸의 내용: ';
      curBox.appendChild(b);
      curBox.appendChild(document.createTextNode(
        spec.mode === 'line' ? String(curText.split('\n').filter((s) => s.trim()).length) + '줄' : curText));
      curBox.classList.remove('hidden');
    } else {
      curBox.classList.add('hidden');
    }

    /* 기업 연수 적합도 필터 (QZ) — 등급으로 한 번 더 좁힌다.
       ⚠ 건수를 함께 적는다. 눌렀는데 0건이면 고장으로 읽히므로 빈 칸은 아예 못 누르게 한다. */
    const all = itiPickCandidates(itiPick.kind, itiPick.destKey);
    const fitBar = document.getElementById('itiPickFits');
    fitBar.textContent = '';
    const fitCounts = { 0: all.length, 1: 0, 2: 0, 3: 0 };
    all.forEach((c) => { fitCounts[c.fit] = (fitCounts[c.fit] || 0) + 1; });
    [{ id: 0, label: '전체' }, { id: 1, label: '연수' }, { id: 2, label: '보완' }, { id: 3, label: '여가' }]
      .forEach((f) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'itip-chip' + (itiPick.fit === f.id ? ' on' : '');
        b.textContent = f.label + ' ' + (fitCounts[f.id] || 0);
        if (!fitCounts[f.id]) b.disabled = true;
        b.addEventListener('click', function () { itiPick.fit = f.id; itiPickRender(); });
        fitBar.appendChild(b);
      });

    const q = itiPick.q.trim().toLowerCase();
    const scoped = itiPick.fit ? all.filter((c) => c.fit === itiPick.fit) : all;
    const list = q ? scoped.filter((c) => c.text.toLowerCase().includes(q)) : scoped;
    /* 이미 들어 있는 줄은 다시 고를 수 없게 표시한다 — 조용히 무시하면 눌렀는데
       아무 일도 안 일어난 것처럼 보인다. */
    const already = new Set(spec.mode === 'line'
      ? curText.split('\n').map((s) => s.trim()).filter(Boolean)
      : [curText.trim()].filter(Boolean));

    document.getElementById('itiPickCount').textContent =
      list.length ? (q ? list.length + '건 (검색 ' + scoped.length + '건 중)' : list.length + '건') : '';

    const box = document.getElementById('itiPickList');
    box.textContent = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'itip-empty';
      p.textContent = q
        ? '검색어와 맞는 문구가 없습니다. 단어를 줄이거나, 범위·등급을 “전체”로 넓혀 보세요.'
        : '이 조건에는 후보가 없습니다. 범위나 등급을 “전체”로 넓혀 보세요.';
      box.appendChild(p);
      return;
    }
    const MAX = 300;   /* 한 번에 그리는 상한 — 넘으면 아래에 몇 건이 잘렸는지 적는다 */
    list.slice(0, MAX).forEach((c) => {
      const used = already.has(c.text);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'itip-item';
      btn.disabled = used;
      if (used) btn.style.opacity = '.45';
      const t = document.createElement('span');
      t.className = 'itip-item-text';
      /* 등급을 문구 앞에 붙인다 (QX). 순서만 바꾸면 담당자는 왜 그 순서인지 모르고,
         무엇보다 **이 문구가 연수용인지 여가용인지**가 그 자체로 필요한 정보다. */
      const tag = document.createElement('span');
      tag.className = 'itip-fit fit-' + c.fit;
      tag.textContent = ITI_FIT_LABEL[c.fit] || '보완';
      /* ⚠ 문구는 **자기 요소**에 담는다. 배지와 한 덩어리로 두면 "이 항목의 문구"를
         읽으려는 쪽이 배지까지 함께 집어 간다(테스트가 실제로 그렇게 걸렸다). */
      const phrase = document.createElement('span');
      phrase.className = 'itip-phrase';
      phrase.textContent = c.text;
      t.appendChild(tag);
      t.appendChild(phrase);
      const f = document.createElement('span');
      f.className = 'itip-item-from';
      /* 출처 표시 (RB) — 후보가 전부 이 목적지 것이므로 목적지 이름은 쓸모가 없다.
         대신 **이 목적지 안에서 어디 문구인지**를 적는다: "코스 B · DAY 2 오전".
         같은 목적지 안에서도 코스마다 성격이 다르고(언어·리더십·산업), 몇 일차 문구인지가
         그대로 판단 근거가 된다 — 3일차 오후 문구를 1일차 오전에 넣으면 어색하다. */
      if (used) {
        f.textContent = '이미 이 칸에 있음';
      } else {
        f.textContent = c.where || '';
        f.classList.add('from-here');
      }
      btn.appendChild(t); btn.appendChild(f);
      btn.addEventListener('click', function () { itiPickApply(c.text); });
      box.appendChild(btn);
    });
    if (list.length > MAX) {
      const p = document.createElement('p');
      p.className = 'itip-empty';
      p.textContent = (list.length - MAX) + '건은 화면에 다 담지 못했습니다. 검색으로 좁혀 주세요.';
      box.appendChild(p);
    }
  }

  function itiPickApply(text) {
    const spec = ITI_PICK_KINDS[itiPick.kind];
    if (!spec || !itiPick.write) return;
    const cur = String(itiPick.read ? (itiPick.read() || '') : '');

    if (spec.mode === 'line') {
      /* 목록 칸은 줄을 더한다. 창은 열어 둔다 — 하이라이트 서너 개를 연달아 고르는 게
         가장 흔한 흐름인데 매번 다시 열게 하면 고르기가 타이핑보다 번거로워진다. */
      const lines = cur.split('\n').map((s) => s.trim()).filter(Boolean);
      lines.push(text);
      itiPick.write(lines.join('\n'));
      itiPickRender();
      return;
    }
    /* 값이 하나인 칸은 바꿔치기다. 이미 쓴 내용이 있으면 되돌릴 방법이 없으므로 한 번 묻는다. */
    if (cur.trim() && cur.trim() !== text && !confirm('이 칸의 내용을 고른 문구로 바꿉니다.\n\n지금: ' + cur.trim() + '\n\n바꿀 내용: ' + text)) return;
    itiPick.write(text);
    itiPickClose();
  }

  /* ════ QM: 코스 가져오기 ════════════════════════════════════════════════
     일정이 비어 있는 목적지를 처음부터 만드는 게 가장 오래 걸린다. 비슷한 목적지의
     완성된 코스를 통째로 복사해 오면 제목과 몇 칸만 고치면 된다.

     ⚠ 코스 목록도 후보를 따로 만들지 않는다 — 활동 고르기와 같은 itiLiveCourses를
     쓴다(오버라이드가 있으면 그것이 진실).
     ⚠ 반드시 깊은 복사(itiClone)로 넣는다. 참조를 그대로 넣으면 편집이 원본
     ITINERARY_DB/오버라이드를 건드려, '기본값으로 되돌리기'가 이미 바뀐 원본으로
     되돌아간다(itiDefaults 주석이 경고하는 바로 그 자리다).
     ═══════════════════════════════════════════════════════════════════════ */
  /* 서버가 진짜 상한이고 여기는 "다 채운 뒤에야 저장에서 튕기는" 일을 막는 사전 안내다.
     예전엔 이 숫자를 여기 따로 적어 두고 test_qM이 두 파일을 대조했는데, 이제는
     limits.js 하나에서 서버(api/content.js)와 함께 읽으므로 갈라질 수가 없다(QO). */
  const ITI_MAX_COURSES = LIMITS.MAX_COURSES;
  const ITI_MAX_DAYS    = LIMITS.MAX_DAYS;

  const itiCopy = { scope: 'region', q: '' };

  /* 전 목적지의 코스를 한 목록으로 편다. 자기 자신은 뺀다 — 같은 목적지 안의 복제는
     '＋ 코스 추가' 뒤 활동 고르기로 하는 편이 빠르고, 여기 섞이면 목록만 지저분해진다. */
  function itiCopyCandidates(scope) {
    const cur = itiState.destKey;
    const region = (typeof REGION_MAP !== 'undefined' && REGION_MAP[cur]) || '';
    const out = [];
    for (const k of itiDestKeys()) {
      if (k === cur) continue;
      if (scope === 'region') {
        const r = (typeof REGION_MAP !== 'undefined' && REGION_MAP[k]) || '';
        if (!region || r !== region) continue;
      }
      (itiLiveCourses(k) || []).forEach((c, i) => {
        if (c && String(c.title || '').trim()) out.push({ from: k, idx: i, course: c });
      });
    }
    return out;
  }

  /* 가져온 코스에 원래 목적지 이름이 몇 군데 남았는지 센다. 자동으로 바꾸지 않는 이유:
     '도쿄 도청'처럼 고유명사의 일부일 수 있어 기계적 치환은 문장을 망가뜨린다.
     대신 몇 곳인지 말해줘서 담당자가 직접 보게 한다(조용히 두면 고객 견적서에
     '오사카 일정'인데 '도쿄'가 적힌 채로 나간다). */
  function itiCountMentions(course, word) {
    if (!word) return 0;
    let n = 0;
    const bump = (s) => { const t = String(s || ''); let i = t.indexOf(word); while (i !== -1) { n++; i = t.indexOf(word, i + word.length); } };
    bump(course.title); bump(course.subtitle);
    (course.highlights || []).forEach(bump);
    (course.days || []).forEach((d) => { bump(d.title); bump(d.am); bump(d.pm); bump(d.eve); bump(d.tip); });
    return n;
  }

  function itiCopyClose() { document.getElementById('itiCopyModal').classList.add('hidden'); }

  function itiCopyOpen() {
    if (!itiState.destKey) { itiSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    if (itiState.courses.length >= ITI_MAX_COURSES) {
      itiSetMsg('코스는 최대 ' + ITI_MAX_COURSES + '개입니다. 쓰지 않는 코스를 지운 뒤 가져오세요.', 'err');
      return;
    }
    itiCopy.q = '';
    itiCopy.scope = itiCopyCandidates('region').length ? 'region' : 'all';
    document.getElementById('itiCopySearch').value = '';
    document.getElementById('itiCopyModal').classList.remove('hidden');
    itiCopyRender();
    document.getElementById('itiCopySearch').focus();
  }

  function itiCopyRender() {
    const bar = document.getElementById('itiCopyScopes');
    bar.textContent = '';
    const counts = { region: itiCopyCandidates('region').length, all: itiCopyCandidates('all').length };
    [{ id: 'region', label: '같은 지역' }, { id: 'all', label: '전체' }].forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'itip-chip' + (itiCopy.scope === s.id ? ' on' : '');
      b.textContent = s.label + ' ' + counts[s.id];
      if (!counts[s.id]) b.disabled = true;
      b.addEventListener('click', function () { itiCopy.scope = s.id; itiCopyRender(); });
      bar.appendChild(b);
    });

    const q = itiCopy.q.trim().toLowerCase();
    const all = itiCopyCandidates(itiCopy.scope);
    const list = q ? all.filter((c) =>
      (c.course.title + ' ' + (c.course.subtitle || '') + ' ' + c.from).toLowerCase().includes(q)) : all;

    document.getElementById('itiCopyCount').textContent =
      list.length ? (q ? list.length + '건 (검색 ' + all.length + '건 중)' : list.length + '건') : '';

    const box = document.getElementById('itiCopyList');
    box.textContent = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'itip-empty';
      p.textContent = q ? '검색어와 맞는 코스가 없습니다. 범위를 “전체”로 넓혀 보세요.'
                        : '가져올 코스가 없습니다. 범위를 “전체”로 넓혀 보세요.';
      box.appendChild(p);
      return;
    }
    list.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'itip-item';
      const t = document.createElement('span');
      t.className = 'itic-title';
      t.textContent = c.course.title;
      btn.appendChild(t);
      if (c.course.subtitle) {
        const s = document.createElement('span');
        s.className = 'itic-sub';
        s.textContent = c.course.subtitle;
        btn.appendChild(s);
      }
      const f = document.createElement('span');
      f.className = 'itic-facts';
      f.textContent = c.from + ' · ' + (c.course.days || []).length + '일'
        + ' · 하이라이트 ' + (c.course.highlights || []).length + '개';
      btn.appendChild(f);
      btn.addEventListener('click', function () { itiCopyApply(c); });
      box.appendChild(btn);
    });
  }

  function itiCopyApply(cand) {
    /* 창이 열려 있는 동안 다른 탭에서 코스를 늘렸을 수도 있으니 넣기 직전에 다시 본다. */
    if (itiState.courses.length >= ITI_MAX_COURSES) {
      itiCopyClose();
      itiSetMsg('코스는 최대 ' + ITI_MAX_COURSES + '개입니다. 쓰지 않는 코스를 지운 뒤 가져오세요.', 'err');
      return;
    }
    const copy = itiClone(cand.course);
    itiState.courses.push(copy);
    /* 가져온 코스로 옮겨 준다 (RF) — 아래 안내가 "○○이 몇 곳에 남아 있으니 고치라"고
       말하는데, 정작 그 코스가 안 보이는 탭에 있으면 고칠 수가 없다. */
    itiView.courseIdx = itiState.courses.length - 1;
    itiMarkDirty();
    itiCopyClose();
    itiRenderBody();

    const mentions = itiCountMentions(copy, cand.from);
    itiSetMsg('“' + cand.course.title + '”을(를) ' + cand.from + '에서 가져왔습니다. 코스 '
      + String.fromCharCode(65 + itiState.courses.length - 1) + '로 추가됐습니다.'
      + (mentions ? ' ⚠ “' + cand.from + '”이(가) ' + mentions + '곳에 남아 있으니 고쳐 주세요.' : '')
      + ' 저장해야 반영됩니다.', mentions ? 'err' : 'ok');
  }

  /* QC: 추천 콘텐츠(방식 A/B) 편집 카드.
     이 값이 어디에 쓰이는지 화면에 적어둔다 — "핵심 포인트"·"일별 활동"·"기대 효과"가
     각각 다른 자리에 나가는데, 이름만 봐서는 어디를 고치는 건지 알 수 없다. */
  const ITI_REC_PLAN_LABEL = { a: '방식 A', b: '방식 B' };

  /* 편집 대상(rec)을 인자로 받는다 — 이 카드는 이제 추천 콘텐츠 화면(recState)이 쓴다. */
  function itiRenderRecPlan(rec, plan) {
    const p = rec[plan];
    const box = document.createElement('div');
    box.className = 'iti-course rec-plan plan-' + plan;

    /* 큰 A·B 표식 + 이 방식이 무엇인지 (QY) — 두 칸이 나란히 있을 때 어느 쪽이 A인지
       한눈에 보여야 한다. 배지 글자만으로는 스크롤 중에 헷갈린다. */
    const head = document.createElement('div');
    head.className = 'iti-course-head';
    const mark = document.createElement('span');
    mark.className = 'plan-mark';
    mark.textContent = plan.toUpperCase();
    const name = document.createElement('span');
    name.className = 'plan-name';
    name.textContent = ITI_REC_PLAN_LABEL[plan];
    const hint = document.createElement('span');
    hint.className = 'plan-hint';
    hint.textContent = plan === 'a' ? '보통 “역량강화형”' : '보통 “동기부여·화합형”';
    head.appendChild(mark); head.appendChild(name); head.appendChild(hint);
    box.appendChild(head);

    const D = recMarkDirty;
    const G = () => itiState.destKey;   /* 목적지 선택은 하나다 (QY) */

    /* ⚠ 이 네 칸(방식 이름·한 줄 설명·핵심 포인트·기대 효과)은 **코스가 하나도 없는
       목적지에서만** 고객에게 나간다 (RK). 코스가 있으면 script.js의 renderStep3가
       _coursesToDestRec()로 **코스의 제목·한 줄 설명·핵심 하이라이트**를 카드에 넣고,
       기대 효과도 코스의 한 줄 설명을 쓴다.
       예전 라벨은 그냥 "일정 탐색 화면의 배지"라고 적혀 있어서, 여기를 채운 담당자가
       고객 화면에서 그 글을 찾다가 못 찾았다(사용자가 실제로 겪었다).
       라벨이 조건을 말하게 하고, 안 쓰이는 상태면 칸을 흐리게 해서 눈으로도 구분되게 한다. */
    const live = itiRecFieldsLive();
    /* ⚠ 이름을 mark로 두지 말 것 — 이 함수 위쪽에 A·B 표식용 `mark`가 이미 있다. */
    const fld = (el, used) => {
      el.className = 'rec-fld' + (used ? '' : ' rec-fld-idle');
      return el;
    };
    const onlyWhenNoCourse = ' — 이 목적지에 코스가 없을 때만 고객에게 나갑니다';

    box.appendChild(fld(itiField('방식 이름 (예: 역량강화형)' + (live ? ' — 일정 탐색 카드의 배지' : onlyWhenNoCourse),
      p.tag, false, (v) => { p.tag = v; }, null, D, G), live));
    box.appendChild(fld(itiField('한 줄 테마 설명' + (live ? '' : onlyWhenNoCourse),
      p.desc, true, (v) => { p.desc = v; }, null, D, G), live));
    box.appendChild(fld(itiField('핵심 포인트 (한 줄에 하나씩)' + (live ? ' — 일정 탐색 카드에 표시' : onlyWhenNoCourse),
      (p.points || []).join('\n'), true,
      (v) => { p.points = v.split('\n').map(s => s.trim()).filter(Boolean); }, 'recPoint', D, G), live));
    /* ✅ 이 칸만은 코스가 있든 없든 늘 쓰인다 — _buildDisplayDays의 pool이다. */
    box.appendChild(fld(itiField('일별 주요 활동 (한 줄에 하나씩) — 연수 일수가 코스보다 길 때 남는 날을 이 목록으로 채웁니다',
      (p.items || []).join('\n'), true,
      (v) => { p.items = v.split('\n').map(s => s.trim()).filter(Boolean); }, 'recItem', D, G), true));
    box.appendChild(fld(itiField('기대 효과 문구 — 고객 견적서(결재 보고용)' + (live ? '에 나갑니다' : onlyWhenNoCourse),
      p.value, true, (v) => { p.value = v; }, null, D, G), live));
    return box;
  }

  /* 이 목적지에서 방식 A·B의 소개 네 칸이 실제로 고객에게 나가는가 (RK).
     ⚠ 판단 기준은 script.js의 renderStep3와 같아야 한다 — 거기서는 getItineraries가
     코스를 돌려주면 코스 기반으로 카드를 채운다. 관리자에서는 지금 편집 중인
     itiState.courses가 곧 그 코스다(저장 전 상태까지 반영해야 화면이 안 어긋난다). */
  function itiRecFieldsLive() {
    return (itiState.courses || []).length === 0;
  }


  /* A와 B를 **나란히** 놓는다 (QY). 고객이 둘 중 하나를 고르는 '대안'이라 위아래로 쌓으면
     순서가 있는 것처럼 읽히고, 둘을 견주며 쓰기도 어렵다. 고객 화면(카드 두 장)과 같은 모양. */
  function itiRenderRecSection(rec) {
    const wrap = document.createElement('div');
    wrap.className = 'rec-pair';
    wrap.appendChild(itiRenderRecPlan(rec, 'a'));
    wrap.appendChild(itiRenderRecPlan(rec, 'b'));
    return wrap;
  }

  /* 순서를 바꾸거나 복제하면 화면을 통째로 다시 그린다. 그러면 방금 누른 버튼이
     사라져 포커스가 body로 떨어지는데, 3일차를 1일차로 올리려면 ↑를 두 번 눌러야
     하므로 매번 마우스로 버튼을 다시 찾아야 한다는 뜻이다. 게다가 이 화면은 세로
     10,000px가 넘어(RC) 옮긴 일자가 화면 밖으로 나가기도 한다.
     그래서 **옮겨간 자리의 같은 버튼**으로 포커스를 되돌린다 — 브라우저가 그 자리로
     스크롤까지 해 주므로 "어디로 갔지"가 없다. 그 버튼이 끝자리라 비활성이면
     (마지막 일자의 ↓) 같은 일자의 다른 버튼으로 물러난다.
     ⚠ 키를 선택자 문자열로 만들지 않고 훑어서 찾는다. 지금 키에는 담당자가 친 글자가
     안 들어가지만, 이 화면에서 문자열을 선택자로 조립하는 습관 자체를 두지 않는다. */
  function itiRenderBodyFocus(keys) {
    itiRenderBody();
    const btns = Array.from(document.querySelectorAll('#iti-body [data-focus-key]'));
    for (const k of (keys || [])) {
      const b = btns.find((x) => x.dataset.focusKey === k && !x.disabled);
      if (b) { b.focus(); return; }
    }
  }

  /* 접힌 줄에 무엇을 적을지 (RF). 여기가 비면 접기는 그냥 '숨기기'가 된다.
     제목이 없으면 첫 활동 문구로 대신한다 — 제목을 안 적는 일자가 실제로 있다. */
  function itiDaySummary(day) {
    const title = String(day.title || '').trim();
    if (title) return title;
    const first = [day.am, day.pm, day.eve].map((s) => String(s || '').trim()).find(Boolean);
    return first || '(비어 있음)';
  }

  /* 빈 칸 세기 — 저녁·팁은 비워 두는 게 정상이라 세지 않는다. 아무 칸이나 세면
     경고가 늘 켜져 있어서 아무도 안 본다. */
  const ITI_DAY_MUST = [
    { key: 'title', label: '그날의 제목' }, { key: 'am', label: '오전' }, { key: 'pm', label: '오후' },
  ];
  function itiDayBlanks(day) {
    return ITI_DAY_MUST.filter((f) => !String(day[f.key] || '').trim()).map((f) => f.label);
  }

  function itiRenderDay(course, day, dayIdx, courseIdx) {
    const box = document.createElement('div');
    box.className = 'iti-day';

    const head = document.createElement('div');
    head.className = 'iti-day-head';

    /* 접기 손잡이. DAY 배지와 요약을 통째로 버튼으로 만든다 — 작은 삼각형만 누르게
       하면 매번 조준해야 한다. ⚠ 요약은 담당자가 친 자유 문자열이라 textContent로만
       넣는다(결함 생성기 ④). */
    const tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'iti-day-toggle';
    const caret = document.createElement('span');
    caret.className = 'iti-caret';
    caret.setAttribute('aria-hidden', 'true');
    const no = document.createElement('span');
    no.className = 'iti-day-no';
    no.textContent = 'DAY ' + (dayIdx + 1);
    const sum = document.createElement('span');
    sum.className = 'iti-day-sum';
    sum.textContent = itiDaySummary(day);
    const blank = document.createElement('span');
    blank.className = 'iti-day-blank';
    tog.appendChild(caret); tog.appendChild(no); tog.appendChild(sum); tog.appendChild(blank);
    /* 배지와 삭제 버튼만 헤더 줄에 두고, 제목은 아래 필드들과 같은 폭으로 내린다.
       예전엔 제목 입력칸이 이 줄 안에 flex:1로 들어가 있어서 ① 버튼 폭만큼 짧아져
       오전·오후·저녁·팁과 오른쪽 끝이 어긋났고, ② align-items:center가 '라벨+입력칸'
       묶음 기준으로 버튼을 세로 정렬해 버튼이 입력칸보다 위로 떴다.
       바로 위 코스 카드(iti-course-head)가 이미 쓰는 구조라 모양도 통일된다. */
    const spacer = document.createElement('span');
    spacer.style.marginLeft = 'auto';

    /* RD: 순서 바꾸기·복제. 예전에는 삭제와 추가밖에 없어서, 3일차를 5일차로 옮기려면
       다섯 칸(제목·오전·오후·저녁·팁)을 다시 타이핑해야 했다 — 그 과정에서 문구가
       미묘하게 달라지는 것이 더 나쁘다. 일자 번호는 배열 순서에서 나오므로(서버도
       같은 규칙으로 다시 매긴다) 여기서는 원소를 옮기기만 하면 된다.
       끝자리에서 못 가는 방향은 **버튼을 비활성으로 보여준다.** 눌러 본 뒤 오류 문구로
       알려주면, 그 문구는 화면 맨 아래(iti-msg)에 뜨는데 여기는 세로로 아주 긴 화면이라
       담당자 눈에 안 들어온다. */
    const dayBtn = (label, title, action, disabled, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'iti-btn';
      b.textContent = label;
      b.title = title;
      b.dataset.focusKey = 'c' + courseIdx + 'd' + dayIdx + ':' + action;
      if (disabled) b.disabled = true;
      else b.addEventListener('click', fn);
      return b;
    };
    const swap = (a, b) => {
      const t = course.days[a]; course.days[a] = course.days[b]; course.days[b] = t;
      itiRenumberDays(course);
      itiMarkDirty();
    };
    const up = dayBtn('↑', '한 칸 위로 (DAY ' + dayIdx + '와 자리 바꾸기)', 'up', dayIdx === 0, function () {
      swap(dayIdx, dayIdx - 1);
      itiRenderBodyFocus(['c' + courseIdx + 'd' + (dayIdx - 1) + ':up',
                          'c' + courseIdx + 'd' + (dayIdx - 1) + ':down']);
    });
    const down = dayBtn('↓', '한 칸 아래로 (DAY ' + (dayIdx + 2) + '와 자리 바꾸기)', 'down',
      dayIdx >= course.days.length - 1, function () {
        swap(dayIdx, dayIdx + 1);
        itiRenderBodyFocus(['c' + courseIdx + 'd' + (dayIdx + 1) + ':down',
                            'c' + courseIdx + 'd' + (dayIdx + 1) + ':up']);
      });
    /* 복제는 **바로 아래**에 넣는다. 맨 끝에 붙이면 비슷한 날을 이어서 만들 때
       매번 다시 끌어올려야 한다 — 실제로 복제하는 이유가 "앞날과 비슷한 다음 날"이다.
       사본은 깊은 복사다(itiClone). 얕게 넣으면 두 일자가 같은 객체를 가리켜, 한쪽
       오전 칸을 고치면 다른 쪽도 같이 바뀌는데 화면상 이유가 전혀 안 보인다. */
    const dup = dayBtn('복제', '이 일자를 바로 아래에 하나 더 만듭니다', 'dup', false, function () {
      if (course.days.length >= ITI_MAX_DAYS) {
        itiSetMsg('일자는 코스당 최대 ' + ITI_MAX_DAYS + '개입니다.', 'err'); return;
      }
      const copy = itiClone(course.days[dayIdx]);
      course.days.splice(dayIdx + 1, 0, copy);
      itiOpenDays.add(copy);   /* 사본은 고치려고 만든 것이라 펼쳐 준다 */
      itiRenumberDays(course);
      itiMarkDirty();
      itiRenderBodyFocus(['c' + courseIdx + 'd' + (dayIdx + 1) + ':dup']);
    });

    const del = document.createElement('button');
    del.className = 'iti-btn danger';
    del.textContent = '일자 삭제';
    del.addEventListener('click', function () {
      if (course.days.length <= 1) { itiSetMsg('일자는 최소 1개가 필요합니다.', 'err'); return; }
      course.days.splice(dayIdx, 1);
      itiRenumberDays(course);
      itiMarkDirty(); itiRenderBody();
    });
    /* ⚠ ↑ ↓ 복제 삭제는 **접힌 채로도 쓸 수 있어야 한다.** 접기의 가장 큰 쓸모가
       "다섯 일자를 한눈에 놓고 순서를 바꾸는 것"이라, 이 버튼들을 본문에 넣으면
       순서를 바꾸려고 매번 펼쳐야 한다. 그래서 헤더 줄에 남긴다. */
    head.appendChild(tog); head.appendChild(spacer);
    head.appendChild(up); head.appendChild(down); head.appendChild(dup); head.appendChild(del);
    box.appendChild(head);

    const bodyBox = document.createElement('div');
    bodyBox.className = 'iti-day-body';
    bodyBox.appendChild(itiField('그날의 제목 (예: 첨단 제조업 현장)', day.title, false, (v) => { day.title = v; }, 'dayTitle'));

    const grid = document.createElement('div');
    grid.className = 'iti-day-grid';
    grid.appendChild(itiField('오전', day.am,  true, (v) => { day.am = v; }, 'dayAct'));
    grid.appendChild(itiField('오후', day.pm,  true, (v) => { day.pm = v; }, 'dayAct'));
    grid.appendChild(itiField('저녁', day.eve, true, (v) => { day.eve = v; }, 'dayEve'));
    grid.appendChild(itiField('참고 팁 (고객 견적서에 함께 나갑니다)', day.tip, true, (v) => { day.tip = v; }, 'dayTip'));
    bodyBox.appendChild(grid);
    box.appendChild(bodyBox);

    /* 접힌 줄의 글(요약·빈 칸)은 **접을 때마다 다시 만든다.** 펼쳐서 고친 내용이
       접으면 바로 반영돼야 한다 — 안 그러면 접힌 줄이 옛 내용을 말하는 거짓말이 된다. */
    const applyOpen = () => {
      const open = itiOpenDays.has(day);
      bodyBox.hidden = !open;
      box.classList.toggle('is-open', open);
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      caret.textContent = open ? '▾' : '▸';
      sum.textContent = itiDaySummary(day);
      const blanks = itiDayBlanks(day);
      blank.textContent = blanks.length ? '빈 칸 ' + blanks.join('·') : '';
      blank.hidden = !blanks.length || open;   /* 펼쳐 두면 빈 칸이 눈앞에 있다 */
      tog.title = open ? '접기' : '펼쳐서 고치기';
    };
    tog.addEventListener('click', function () {
      if (itiOpenDays.has(day)) itiOpenDays.delete(day);
      else itiOpenDays.add(day);
      applyOpen();
      /* ⚠ 접혀 있는 동안에는 칸 높이를 잴 수 없다(RE — display:none이면 scrollHeight가 0).
         펼치는 이 순간이 처음으로 잴 수 있게 되는 때라, 여기서 안 부르면 여러 줄 문구가
         한 줄 칸에 갇힌 채로 보인다. */
      itiAutoGrowAll();
    });
    applyOpen();
    return box;
  }

  function itiRenderCourse(course, courseIdx) {
    const box = document.createElement('div');
    box.className = 'iti-course';

    const head = document.createElement('div');
    head.className = 'iti-course-head';
    const no = document.createElement('span');
    no.className = 'iti-course-no';
    no.textContent = '코스 ' + String.fromCharCode(65 + courseIdx);
    /* TC: 이 코스가 **견적서에서 온 것**인지 밝힌다. 안 밝히면 담당자는 자기가 고친
       온라인 코스가 왜 고객에게 안 나가는지 알 수 없다(조용한 규칙 — 결함 생성기 ②). */
    const srcTag = document.createElement('span');
    if (course && course.source === 'quote') {
      srcTag.className = 'iti-src-quote';
      srcTag.textContent = '📄 견적서 일정';
      srcTag.title = (course.sourceNote || '') + ' — 이 목적지는 견적서 일정이 고객에게 나갑니다';
    }
    /* UQ: 「검토 전」 — 일괄로 심은 코스는 사람이 한 번 봐야 한다.
       이 표시가 붙어 있는 동안 그 코스는 **고객에게 나가지 않는다**(recVisibleCourses).
       ⚠ 배지만 두고 떼는 방법을 안 주면 창고에 영원히 쌓인다(결함 생성기 ③) —
         바로 옆에 「검토 완료」 버튼을 둔다. */
    const pendTag = document.createElement('span');
    if (course && course.pending === true) {
      pendTag.className = 'iti-src-pending';
      pendTag.textContent = '🕒 검토 전 — 고객에게 안 나감';
      pendTag.title = '견적서에서 일괄로 심은 코스입니다. 확인해 다듬은 뒤 「검토 완료」를 누르면 고객 견적서에 나가기 시작합니다.';
    }

    /* 🔴 **무엇으로 구별하는가** (ZF). 견적서에서 심은 코스는 제목이 전부
       「○○ 견적서 일정 (검토 필요)」라 창고에서 **코스 A~F가 글자까지 똑같이** 보였다
       (실측: 이름이 겹치는 코스 33개. 푸꾸옥은 6개 중 5개가 일수까지 같다).
       그런데 **내용은 서로 다르다** — 나트랑 둘은 김해 BX781 · 인천 RS0527로
       출발지부터 다르다. 구별할 것이 이미 안에 있는데 화면이 안 꺼내 보이고 있었다.
     ⚠ 값을 지어내지 않는다. 저장된 일정에서 **첫날 첫 줄과 일수**만 꺼낸다.
     ⚠ 하나뿐인 목적지에도 그냥 보여준다. 「겹칠 때만」으로 만들면 그 판정이 또
       틀릴 자리가 되고, 일수는 어차피 늘 쓸모가 있다. */
    const hint = document.createElement('span');
    hint.className = 'iti-course-hint';
    {
      const days = (course && Array.isArray(course.days)) ? course.days : [];
      const d0 = days[0] || {};
      const first = String(d0.title || d0.am || '').replace(/\s+/g, ' ').trim();
      hint.textContent = (days.length ? days.length + '일' : '')
        + (first ? ' · 1일차 ' + (first.length > 30 ? first.slice(0, 30) + '…' : first) : '');
      hint.title = course && course.sourceNote ? course.sourceNote : '';
    }

    const spacer = document.createElement('span');
    spacer.style.marginLeft = 'auto';

    const done = document.createElement('button');
    if (course && course.pending === true) {
      done.type = 'button';
      done.className = 'iti-btn';
      done.textContent = '✓ 검토 완료 — 고객에게 내보내기';
      done.addEventListener('click', function () {
        if (!confirm('이 코스를 고객 견적서에 내보냅니다.' + String.fromCharCode(10) + String.fromCharCode(10)
          + '「' + (course.title || '(제목 없음)') + '」' + String.fromCharCode(10)
          + '오전·오후·저녁이 비어 있지 않은지 확인하셨나요?' + String.fromCharCode(10) + String.fromCharCode(10)
          + '(저장을 눌러야 실제로 반영됩니다.)')) return;
        delete course.pending;
        itiMarkDirty(); itiRenderBody();
        itiSetMsg('검토 완료로 표시했습니다 — 저장을 눌러야 고객에게 나갑니다.', 'err');
      });
    }

    const del = document.createElement('button');
    del.className = 'iti-btn danger';
    del.textContent = '이 코스 삭제';
    del.addEventListener('click', function () {
      if (itiState.courses.length <= 1) { itiSetMsg('코스는 최소 1개가 필요합니다.', 'err'); return; }
      itiState.courses.splice(courseIdx, 1);
      /* 지금 보던 탭이 사라졌으니 어디를 볼지 정해 준다. 안 정하면 마지막 코스를
         지웠을 때 없는 탭을 가리켜 빈 화면이 된다. */
      if (itiView.courseIdx >= itiState.courses.length) itiView.courseIdx = itiState.courses.length - 1;
      itiMarkDirty(); itiRenderBody();
    });

    /* 이 코스의 일자를 한 번에 펴고 접는다 (RF). 처음 보는 목적지를 통독할 때 다섯 번
       누르게 하지 않는다. 전부 펼쳐져 있으면 '전체 접기'로 바뀐다. */
    const allOpen = (course.days || []).length > 0 && course.days.every((d) => itiOpenDays.has(d));
    const foldAll = document.createElement('button');
    foldAll.type = 'button';
    foldAll.className = 'iti-btn';
    foldAll.id = 'iti-fold-all';
    foldAll.textContent = allOpen ? '전체 접기' : '전체 펼치기';
    foldAll.addEventListener('click', function () {
      (course.days || []).forEach((d) => { if (allOpen) itiOpenDays.delete(d); else itiOpenDays.add(d); });
      itiRenderBody();
    });

    head.appendChild(no);
    if (srcTag.textContent) head.appendChild(srcTag);   /* TC: 견적서 출처 배지 */
    if (pendTag.textContent) head.appendChild(pendTag); /* UQ: 검토 전 배지 */
    if (hint.textContent) head.appendChild(hint);       /* ZF: 무엇으로 구별하는가 */
    head.appendChild(spacer);
    if (done.textContent) head.appendChild(done);       /* UQ: 검토 완료 */
    head.appendChild(foldAll); head.appendChild(del);
    box.appendChild(head);

    box.appendChild(itiField('코스 제목', course.title, false, (v) => { course.title = v; }));
    box.appendChild(itiField('한 줄 설명', course.subtitle, true, (v) => { course.subtitle = v; }));
    box.appendChild(itiField('핵심 하이라이트 (한 줄에 하나씩)', (course.highlights || []).join('\n'), true,
      (v) => { course.highlights = v.split('\n').map(s => s.trim()).filter(Boolean); }, 'highlight'));

    const daysWrap = document.createElement('div');
    (course.days || []).forEach((d, i) => daysWrap.appendChild(itiRenderDay(course, d, i, courseIdx)));
    box.appendChild(daysWrap);

    const acts = document.createElement('div');
    acts.className = 'iti-actions';
    const addDay = document.createElement('button');
    addDay.className = 'iti-btn';
    addDay.textContent = '＋ 일자 추가';
    addDay.addEventListener('click', function () {
      /* 서버가 진짜 상한이다. 여기서 막는 것은 30개를 넘겨 다 채워 넣은 뒤 저장에서야
         튕기는 일을 막기 위해서다 — 코스 개수(ITI_MAX_COURSES)와 같은 방식. */
      if (course.days.length >= ITI_MAX_DAYS) {
        itiSetMsg('일자는 코스당 최대 ' + ITI_MAX_DAYS + '개입니다.', 'err'); return;
      }
      const fresh = itiEmptyDay();
      course.days.push(fresh);
      itiOpenDays.add(fresh);   /* 방금 만든 빈 일자는 펼쳐 준다 — 채우려고 만든 것이다 */
      itiRenumberDays(course);
      itiMarkDirty(); itiRenderBody();
    });
    acts.appendChild(addDay);
    box.appendChild(acts);
    return box;
  }

  function itiRenderBody() {
    const body = document.getElementById('iti-body');
    body.textContent = '';
    /* ⚠ 두 구역의 관계 안내(itiRenderLink)는 **여기 한 곳에서만** 갱신한다.
       itiRenderBody는 코스가 바뀌는 거의 모든 자리에서 불리므로, 부르는 쪽마다
       따로 챙기게 하면 언젠가 한 곳을 빠뜨리고 숫자가 낡는다(결함 생성기 ①). */
    const done = () => { itiRenderState(); itiRenderLink(); itiAutoGrowAll(); };
    if (!itiState.destKey) {
      const p = document.createElement('p');
      p.className = 'iti-note';
      p.textContent = '위에서 목적지를 먼저 고르세요.';
      body.appendChild(p);
      done();
      return;
    }
    if (!itiState.courses.length) {
      const p = document.createElement('p');
      p.className = 'iti-note';
      p.textContent = '이 목적지에는 아직 등록된 코스가 없습니다. “＋ 코스 추가”로 만들어 주세요.';
      body.appendChild(p);
      done();
      return;
    }
    /* RF: 코스는 탭으로 하나씩 보여준다. 세 코스를 한꺼번에 펼쳐 두면 지금 고치는
       코스를 찾는 데만 스크롤을 쓴다. 고르는 순간 바뀌는 것은 **보이는 것뿐**이고,
       안 보이는 코스도 저장할 때 함께 저장된다(itiState.courses 전체를 보낸다).
       ⚠ 그래서 탭에 **일자 수와 빈 칸 수**를 적는다 — 안 보이는 코스에 문제가 있으면
       탭에서 보여야 한다. 안 그러면 "코스 B가 비어 있는 줄 몰랐다"가 된다. */
    if (itiView.courseIdx >= itiState.courses.length) itiView.courseIdx = itiState.courses.length - 1;
    if (!(itiView.courseIdx >= 0)) itiView.courseIdx = 0;

    /* TC: 이 목적지에 **견적서 일정**이 있으면 고객은 그것만 본다(recPreferQuoteCourses).
       ⚠ 이걸 안 밝히면 담당자가 온라인 코스를 열심히 고치고 미리보기까지 봤는데
         **정작 고객은 다른 일정을 보는** 상태가 된다. 조용한 규칙은 만들지 않는다
         (결함 생성기 ②). 규칙 판단은 rec_fallbacks.js가 한다 — 여기서 다시 적지 않는다. */
    if (typeof recHasQuoteCourses === 'function' && recHasQuoteCourses(itiState.courses)) {
      const n = itiState.courses.filter((c) => c && c.source === 'quote').length;
      const other = itiState.courses.length - n;
      const note = document.createElement('p');
      note.className = 'iti-note';
      note.style.cssText = 'border-left:4px solid #1B5E20;padding-left:.6rem;font-weight:700';
      note.textContent = '📄 이 목적지는 견적서에서 읽은 일정 ' + n + '개가 고객에게 나갑니다.'
        + (other ? ' 나머지 ' + other + '개(온라인 자료)는 저장돼 있지만 고객 화면에는 안 나옵니다 — 견적서 코스를 지우면 다시 나갑니다.' : '');
      body.appendChild(note);
    }

    body.appendChild(itiRenderCourseTabs());
    body.appendChild(itiRenderCourse(itiState.courses[itiView.courseIdx], itiView.courseIdx));
    done();
  }

  /* ════ 코스 → 고객의 '방식 A/B' 매핑 (RK) ═══════════════════════════════
     관리자의 **코스 A·B·C**와 고객의 **방식 A·B**는 다른 것이다. 고객이 고른
     프로그램 유형에 따라 어느 코스가 방식 A로 나갈지가 바뀐다
     (예: 도쿄 + 언어 집중 연수 → 방식 A는 코스 C다).

     ⚠ 규칙을 여기 옮겨 적지 않는다. script.js의 getItineraries()가 부르는 것과
     **같은 함수**(rec_fallbacks.js의 recResolvePlanCourseIdx)를 부른다. 규칙이 두 벌이
     되면 관리자 화면이 고객 화면과 다른 매핑을 말하게 되고, 그건 지금 문제보다 더 나쁘다.
     ═══════════════════════════════════════════════════════════════════════ */
  function itiCourseRoles(destKey, courseIdx) {
    if (!destKey || typeof PROGRAM_TYPES === 'undefined') return [];
    const courses = itiState.courses || [];
    if (!courses.length) return [];
    const prio = (typeof PROGRAM_PRIORITY !== 'undefined' ? PROGRAM_PRIORITY[destKey] : null) || {};
    const out = [];
    Object.keys(PROGRAM_TYPES).forEach((type) => {
      const pair = recResolvePlanCourseIdx(courses.length, prio, type);
      const primary = pair[0], secondary = pair[1];
      const t = PROGRAM_TYPES[type];
      if (courseIdx === primary)        out.push({ plan: 'a', type, label: t.label, short: t.short });
      else if (courseIdx === secondary) out.push({ plan: 'b', type, label: t.label, short: t.short });
    });
    return out;
  }

  /* 배지는 **방식별로 묶는다.** 유형마다 하나씩 붙이면 탭 하나에 배지가 넷이라
     탭 줄이 무너지고, 정작 알고 싶은 "이 코스가 A냐 B냐"가 안 읽힌다. */
  function itiCourseRoleTags(destKey, courseIdx) {
    const roles = itiCourseRoles(destKey, courseIdx);
    return ['a', 'b'].map((plan) => {
      const mine = roles.filter((r) => r.plan === plan);
      if (!mine.length) return null;
      return { plan, text: '방식 ' + plan.toUpperCase() + ' ← ' + mine.map((r) => r.short).join('·'),
               title: mine.map((r) => r.label).join(', ') + '을(를) 고른 고객에게는 이 코스가 방식 '
                      + plan.toUpperCase() + '로 나갑니다' };
    }).filter(Boolean);
  }

  function itiRenderCourseTabs() {
    const bar = document.createElement('div');
    bar.className = 'iti-ctabs';
    bar.id = 'iti-ctabs';
    itiState.courses.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'iti-ctab' + (i === itiView.courseIdx ? ' on' : '');
      b.dataset.courseIdx = String(i);
      const name = document.createElement('span');
      name.className = 'iti-ctab-no';
      name.textContent = '코스 ' + String.fromCharCode(65 + i);
      /* 코스 제목은 담당자가 친 자유 문자열이다 — textContent로만 넣는다 */
      const title = document.createElement('span');
      title.className = 'iti-ctab-title';
      title.textContent = String(c.title || '(제목 없음)').trim() || '(제목 없음)';
      const meta = document.createElement('span');
      meta.className = 'iti-ctab-meta';
      const blanks = (c.days || []).reduce((n, d) => n + itiDayBlanks(d).length, 0);
      meta.textContent = (c.days || []).length + '일';
      b.appendChild(name); b.appendChild(title); b.appendChild(meta);
      /* 이 코스가 고객 화면에서 '방식 A'로 나가는지 'B'로 나가는지 (RK).
         관리자의 코스 A·B·C와 고객의 방식 A·B는 **다른 것**이고, 고객이 고른
         프로그램 유형에 따라 매핑이 바뀐다. 여기 안 적으면 두 화면을 나란히 놓고도
         어느 것이 어느 것인지 알 수 없다(사용자가 실제로 그래서 못 찾았다). */
      itiCourseRoleTags(itiState.destKey, i).forEach((r) => {
        const tag = document.createElement('span');
        tag.className = 'iti-ctab-role role-' + r.plan;
        tag.textContent = r.text;
        tag.title = r.title;
        b.appendChild(tag);
      });
      if (blanks) {
        const warn = document.createElement('span');
        warn.className = 'iti-ctab-warn';
        warn.textContent = '빈 칸 ' + blanks;
        b.appendChild(warn);
      }
      b.addEventListener('click', function () {
        if (itiView.courseIdx === i) return;
        itiView.courseIdx = i;
        itiRenderBody();
      });
      bar.appendChild(b);
    });
    return bar;
  }

  function itiSelectDest(destKey) {
    /* 두 구역 중 **어느 쪽이라도** 저장 안 한 게 있으면 묻는다 — 방식 A·B만 고쳐 놓고
       목적지를 바꾸면 그것도 그대로 날아간다. */
    if ((itiState.dirty || recState.dirty)
        && !confirm('저장하지 않은 수정 내용이 있습니다. 목적지를 바꾸면 사라집니다. 계속할까요?')) {
      document.getElementById('iti-dest').value = itiState.destKey;
      return;
    }
    itiState.destKey = destKey;
    itiState.dirty = false;
    itiView.courseIdx = 0;   /* 목적지를 바꾸면 코스 A부터 본다 (RF) */
    itiSetMsg('');
    /* US: 편집기에도 **창고 전체**를 올린다. 예전엔 오버라이드가 있으면 그것만
       올렸는데, 일괄로 심은 목적지는 오버라이드가 「검토 전」뿐이라 담당자 화면에서
       기본 코스 2개가 사라졌다 — 정작 고객에게 나가는 건 그 기본 코스다.
       ⚠ 여기서 저장하면 병합된 목록이 그대로 오버라이드가 된다. 그건 맞는 동작이다 —
         사람이 이 목적지를 손본 순간이고, 그때부터는 오버라이드가 진실이 된다. */
    itiState.courses = destKey
      ? itiClone(recApplyOverride(itiDefaults(destKey), itiState.overrides[destKey]))
      : [];
    /* QY: 목적지 선택은 하나다 — 두 구역이 항상 같은 목적지를 본다. 예전(QU)처럼
       따로 고르게 두면 "지금 어느 목적지를 고치는 중인가"가 두 개가 되어 헷갈린다. */
    recState.rec = destKey
      ? (itiState.recOverrides[destKey] ? itiClone(itiState.recOverrides[destKey]) : itiRecDefaults(destKey))
      : null;
    recState.dirty = false;
    recSetMsg('');
    itiRenderBody();
    recRenderBody();
  }

  /* 목록은 요율표(data.js destinationRates)에서 파생한다 — 목적지 목록을 여기에
     또 적으면 목적지가 늘 때 한 곳을 빠뜨린다(결함 생성기 ①).
     목적지 드롭다운과 활동 고르기(QL)의 후보 범위가 **같은 규칙**을 써야 하므로
     함수로 빼 둔다. 한쪽만 커스텀 목적지를 포함하면 "화면에는 있는데 못 고르는" 칸이 생긴다. */
  function itiDestKeys() {
    return (typeof destinationRates !== 'undefined')
      ? destinationRates.map((d) => d.destination_key) : Object.keys(itiState.overrides);
  }

  function itiFillDestSelect() {
    const sel = document.getElementById('iti-dest');
    const prev = itiState.destKey;
    sel.textContent = '';
    const blank = document.createElement('option');
    blank.value = ''; blank.textContent = '목적지를 선택하세요';
    sel.appendChild(blank);
    /* TD: 여기도 나라별로 묶는다 — 일정 관리도 57곳을 훑는 자리다 */
    appendDestOptionsByCountry(sel, itiDestKeys(), (k) => {
      const o = document.createElement('option');
      o.value = k;
      const hasDefault = (typeof ITINERARY_DB !== 'undefined') && Array.isArray(ITINERARY_DB[k]);
      /* 무엇이 수정됐는지까지 적는다 (QY) — '수정됨'만 적으면 일정인지 방식 A·B인지
         목록에서 알 수 없다. 한 화면이 둘을 다 다루므로 여기서 구별해 준다. */
      /* ⚠ UR: 일괄로 심은 검토 전 코스만 든 행은 「✏️ 수정됨」이 아니다 — 사람이
         손댄 적이 없다. 판단은 rec_fallbacks 한 곳(recOverrideIsEdited). */
      const edited = [
        (typeof recOverrideIsEdited === 'function'
          ? recOverrideIsEdited(itiState.overrides[k]) : !!itiState.overrides[k]) ? '일정' : '',
        itiState.recOverrides[k] ? '방식' : '',
      ].filter(Boolean).join('·');
      /* UR: 이 목적지에 **검토를 기다리는 코스가 몇 개 있는가**.
         일괄로 심은 코스는 사람이 봐야 고객에게 나가기 시작하는데, 목록에서 안 보이면
         목적지를 하나씩 열어봐야 알 수 있다 — 그러면 아무도 검토하지 않고 창고에만
         쌓인다(결함 생성기 ③: 안전망이 실행된 적이 없다).
         ⚠ 세는 규칙은 rec_fallbacks 한 곳이다. 여기서 직접 filter를 적으면 「검토 전」의
           정의가 두 벌이 된다. */
      const pending = (typeof recPendingCount === 'function')
        ? recPendingCount(itiState.overrides[k] || (typeof ITINERARY_DB !== 'undefined' ? ITINERARY_DB[k] : null))
        : 0;
      o.textContent = k
        + (edited ? '  ✏️ ' + edited : '')
        + (pending ? '  🕒 검토 전 ' + pending : '')
        + (hasDefault || itiState.overrides[k] ? '' : '  (일정 없음)');
      return o;
    });
    if (prev) sel.value = prev;
    itiRenderPendingTotal();
  }

  /* UR: 검토 대기 합계. 목적지 목록과 **같은 규칙**으로 센다(recPendingCount) —
     따로 세면 목록에는 있는데 합계에는 없는 일이 생긴다. */
  function itiRenderPendingTotal() {
    const el = document.getElementById('iti-pending-total');
    if (!el) return;
    if (typeof recPendingCount !== 'function') { el.classList.add('hidden'); return; }
    let dests = 0, total = 0;
    itiDestKeys().forEach((k) => {
      const n = recPendingCount(itiState.overrides[k]
        || (typeof ITINERARY_DB !== 'undefined' ? ITINERARY_DB[k] : null));
      if (n) { dests++; total += n; }
    });
    if (!total) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = '🕒 검토 대기 ' + total + '개 · ' + dests + '곳';
    el.title = '견적서에서 일괄로 심은 코스입니다. 확인해 다듬고 「검토 완료」를 눌러야 고객에게 나갑니다.';
    el.classList.remove('hidden');
  }

  /* 탭을 열 때마다 서버 상태를 다시 읽는다 — 동료가 방금 고친 것을 덮어쓰지 않기 위해.
     (요율에서 '되돌리기가 그 사이 남이 바꾼 값을 말없이 덮어쓰던' 문제를 이미 겪었다.)
     ⚠ 두 화면(일정 관리·추천 콘텐츠)이 **같은 조회**를 쓴다. 각자 부르게 두면 한쪽만
     새로고침되어 서로 다른 값을 보게 되고, 그 상태로 저장하면 어느 쪽이 맞는지 알 수 없다.
     조용히 기본값으로 떨어지지도 않는다 — 그러면 담당자가 남의 수정본 위에 기본값을 덮어쓴다. */
  async function itiLoadServer() {
    try {
      const r = await fetch('/api/content?action=itineraries');
      if (!r.ok) throw new Error('http_' + r.status);
      const data = await r.json();
      itiState.overrides    = (data && data.overrides) || {};
      itiState.recOverrides = (data && data.recOverrides) || {};
      itiState.meta         = (data && data.meta) || {};
      itiState.loaded = true;
      return null;
    } catch (err) {
      console.warn('[admin] 일정·추천 콘텐츠 조회 실패:', err);
      itiState.loaded = false;
      return err;
    }
  }

  async function renderItineraries() {
    const err = await itiLoadServer();
    /* 두 구역이 같은 조회를 쓰므로 실패도 양쪽에 알린다 — 한쪽만 조용하면 그 구역에서
       낡은 값 위에 저장하게 된다. */
    if (err) {
      const msg = '저장된 값을 불러오지 못했습니다. 지금 저장하면 다른 사람의 수정본을 덮어쓸 수 있으니, 새로고침 후 다시 시도해 주세요.';
      itiSetMsg(msg, 'err'); recSetMsg(msg, 'err');
    } else { itiSetMsg(''); recSetMsg(''); }
    itiFillDestSelect();
    if (itiState.destKey) {
      /* 편집 중이던 목적지가 있으면 화면은 유지하되, 서버 상태 표시는 갱신한다 */
      itiRenderState();
      recRenderState();
      itiRenderLink();
    } else {
      itiRenderBody();
      recRenderBody();
    }
  }

  async function itiSave() {
    if (!itiState.destKey) { itiSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    if (!itiState.loaded) { itiSetMsg('저장된 일정을 아직 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'err'); return; }
    const empty = itiState.courses.findIndex(c => !String(c.title || '').trim());
    if (empty >= 0) { itiSetMsg('코스 ' + String.fromCharCode(65 + empty) + '의 제목을 입력해 주세요.', 'err'); return; }

    itiSetMsg('저장 중…');
    try {
      const r = await fetch('/api/content?action=itineraries', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        /* ⚠ rec을 보내지 않는다 (QU). 추천 콘텐츠는 다른 화면이 관리하므로, 여기서 함께
           보내면 이 화면이 들고 있던 낡은 사본이 **동료가 방금 고친 추천 콘텐츠를
           조용히 되돌린다.** 서버는 안 보낸 쪽을 건드리지 않는다(coalesce). */
        body: JSON.stringify({ destKey: itiState.destKey, courses: itiState.courses }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || ('http_' + r.status));
      /* 서버가 정규화한 결과(일자 번호 재부여·공백 정리)를 화면에 그대로 반영한다.
         보낸 값을 그대로 믿고 두면 화면과 실제 저장값이 조금씩 달라진다. */
      itiState.overrides[itiState.destKey] = out.courses || itiState.courses;
      itiState.courses = itiClone(itiState.overrides[itiState.destKey]);
      /* 서버가 돌려준 rec은 다른 화면이 쓰는 값이라 캐시만 최신으로 맞춰 둔다. */
      if (out.rec) itiState.recOverrides[itiState.destKey] = out.rec;
      itiState.meta[itiState.destKey] = { updatedAt: new Date().toISOString(), updatedBy: (currentUser && currentUser.displayName) || '' };
      itiState.dirty = false;
      itiFillDestSelect();
      itiRenderBody();
      itiSetMsg('저장했습니다. 고객 견적서·일정 탐색에 바로 반영됩니다.', 'ok');
    } catch (err) {
      console.warn('[admin] 일정 저장 실패:', err);
      itiSetMsg('저장하지 못했습니다 — ' + itiSaveErrorText(err.message)
        + ' 수정 내용은 화면에 그대로 있습니다.', 'err');
    }
  }

  /* 서버가 거절한 이유를 담당자 말로 옮긴다. 예전에는 'too_many_courses'가 그대로
     화면에 나왔다 — 무엇을 어떻게 고쳐야 하는지 알 수 없어 같은 저장을 반복하게 된다.
     ⚠ 숫자(6개·30일 등)는 여기 적지 않는다. api/content.js의 상한과 갈라지면 화면이
     틀린 안내를 하게 되고, 그건 오류 메시지 중 가장 나쁜 종류다(결함 생성기 ①).
     상한을 아는 곳은 서버 하나이고, 여기서는 '무엇이 너무 많은지'만 말한다. */
  function itiSaveErrorText(code) {
    const c = String(code || '');
    const MAP = {
      courses_empty:      '코스가 하나도 없습니다. 코스를 하나 이상 남겨 주세요.',
      too_many_courses:   '코스가 너무 많습니다. 쓰지 않는 코스를 지워 주세요.',
      empty_title:        '제목이 빈 코스가 있습니다.',
      invalid_title:      '코스 제목이 너무 깁니다.',
      invalid_subtitle:   '코스의 한 줄 설명이 너무 깁니다.',
      too_many_highlights:'핵심 하이라이트가 너무 많습니다. 줄을 줄여 주세요.',
      invalid_highlight:  '핵심 하이라이트 한 줄이 너무 깁니다.',
      days_empty:         '일자가 하나도 없는 코스가 있습니다.',
      too_many_days:      '일자가 너무 많습니다.',
      /* 아래 셋은 화면을 정상으로 쓰면 나오지 않는다(보낸 값의 모양 자체가 틀린 경우).
         그래도 코드를 그대로 보여주지 않는다 — 담당자가 할 수 있는 일을 말해준다. */
      course_not_object:  '코스 데이터 형식이 잘못됐습니다. 새로고침 후 다시 시도해 주세요.',
      day_not_object:     '일자 데이터 형식이 잘못됐습니다. 새로고침 후 다시 시도해 주세요.',
      rec_not_object:     '추천 콘텐츠 형식이 잘못됐습니다. 새로고침 후 다시 시도해 주세요.',
      unknown_dest_key:   '없는 목적지입니다. 새로고침 후 다시 골라 주세요.',
      dest_check_failed:  '목적지를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      forbidden:          '이 작업은 권한이 없습니다.',
      unauthorized:       '로그인이 만료되었습니다. 새로고침 후 다시 로그인해 주세요.',
      update_failed:      '서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
    if (MAP[c]) return MAP[c];
    /* 칸 이름이 뒤에 붙는 것들 — invalid_day_am, rec_missing_a, too_many_points_b 등 */
    if (c.indexOf('invalid_day_') === 0)   return '일자의 “' + ({ title: '그날의 제목', am: '오전', pm: '오후', eve: '저녁', tip: '참고 팁' }[c.slice(12)] || c.slice(12)) + '” 칸이 너무 깁니다.';
    if (c.indexOf('rec_missing_') === 0)   return '추천 콘텐츠 “' + (ITI_REC_PLAN_LABEL[c.slice(12)] || c.slice(12)) + '”가 비어 있습니다. 방식 A·B 둘 다 채워야 합니다.';
    if (c.indexOf('too_many_points_') === 0) return '추천 콘텐츠 “' + (ITI_REC_PLAN_LABEL[c.slice(16)] || c.slice(16)) + '”의 핵심 포인트 줄이 너무 많습니다.';
    if (c.indexOf('too_many_items_') === 0)  return '추천 콘텐츠 “' + (ITI_REC_PLAN_LABEL[c.slice(15)] || c.slice(15)) + '”의 일별 주요 활동 줄이 너무 많습니다.';
    if (c.indexOf('invalid_point_') === 0)   return '추천 콘텐츠의 핵심 포인트 한 줄이 너무 깁니다.';
    if (c.indexOf('invalid_item_') === 0)    return '추천 콘텐츠의 일별 주요 활동 한 줄이 너무 깁니다.';
    if (c.indexOf('invalid_rec_') === 0)     return '추천 콘텐츠의 문구가 너무 깁니다.';
    if (c.indexOf('http_') === 0)            return '서버가 응답하지 않았습니다 (' + c + '). 잠시 후 다시 시도해 주세요.';
    return '알 수 없는 이유입니다 (' + c + '). 계속되면 개발 담당자에게 알려 주세요.';
  }

  async function itiRevert() {
    if (!itiState.destKey) { itiSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    /* QU: 이제 코스만 되돌린다. 추천 콘텐츠는 그 화면에서 따로 되돌린다 —
       한 버튼이 다른 화면의 작업까지 지우면 누른 사람이 예상하지 못한 손실이 난다. */
    if (!confirm(itiState.destKey + '의 **추천 일정(코스)** 수정 내용을 지우고 기본값으로 되돌립니다.\n(추천 콘텐츠 방식 A·B는 그대로 남습니다.)\n계속할까요?')) return;
    try {
      const r = await fetch('/api/content?action=itineraries&part=courses&destKey=' + encodeURIComponent(itiState.destKey), { method: 'DELETE' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || ('http_' + r.status));
      delete itiState.overrides[itiState.destKey];
      if (!itiState.recOverrides[itiState.destKey]) delete itiState.meta[itiState.destKey];
      itiState.courses = itiDefaults(itiState.destKey);
      itiState.dirty = false;
      itiFillDestSelect();
      itiRenderBody();
      /* '지울 게 없었다'와 '지웠다'를 구분해서 말한다 */
      itiSetMsg(out.removed ? '기본 일정으로 되돌렸습니다.' : '이 목적지에는 수정 내용이 없었습니다 (이미 기본 일정입니다).', 'ok');
    } catch (err) {
      console.warn('[admin] 일정 되돌리기 실패:', err);
      itiSetMsg('되돌리지 못했습니다 (' + err.message + ').', 'err');
    }
  }

  /* ════ 추천 콘텐츠 (QU) ═══════════════════════════════════════════════════
     방식 A·B 전용 화면. 일정 관리와 **완전히 독립**이다 — 목적지 선택도, 저장도,
     되돌리기도 각자다(사용자 결정). 서버 데이터(itiState.overrides/recOverrides/meta)만
     같은 것을 본다.

     ⚠ 고객이 보는 결과는 하나도 바뀌지 않는다. 저장되는 곳도 예전과 같은 행이고
     (itinerary_overrides.rec), 엔진도 예전처럼 DEST_REC을 읽는다. 나뉜 것은 관리 화면뿐이다.
     ═══════════════════════════════════════════════════════════════════════ */
  /* ⚠ destKey가 없다 (QY). 목적지 선택은 화면에 하나뿐이고 itiState.destKey가 진실이다.
     여기 또 두면 두 값이 어긋나는 순간 "지금 어느 목적지를 고치는 중인가"를 아무도
     모르게 된다(결함 생성기 ①의 상태판). */
  const recState = { rec: null, dirty: false };

  function recSetMsg(text, kind) {
    const el = document.getElementById('rec-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'iti-msg' + (kind ? ' ' + kind : '');
  }

  function recMarkDirty() {
    recState.dirty = true;
    recRenderState();
    /* '일별 주요 활동' 줄 수가 바뀌면 아래 코스 구역의 안내 숫자도 따라가야 한다 (QY). */
    itiRenderLink();
  }

  function recRenderState() {
    itiRefreshUnsavedUi();   /* itiRenderState와 같은 이유 (QZ) */
    const el = document.getElementById('rec-state');
    if (!el) return;
    el.textContent = '';
    el.className = 'iti-state';
    if (!itiState.destKey) return;
    if (recState.dirty) { el.textContent = '● 저장하지 않음'; el.classList.add('dirty'); return; }
    /* '수정됨'은 **이 구역 기준**으로만 말한다. 일정만 고친 목적지에까지 수정됨이 붙으면
       이 구역에서 무엇이 바뀐 건지 알 수 없다(구역이 둘이라 특히). */
    const saved = itiState.recOverrides[itiState.destKey];
    const meta = itiState.meta[itiState.destKey];
    if (!saved) { el.textContent = '기본값'; return; }
    const when = meta && meta.updatedAt ? new Date(meta.updatedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    el.textContent = '수정됨' + (meta && meta.updatedBy ? ' · ' + meta.updatedBy : '') + (when ? ' · ' + when : '');
  }

  function recRenderBody() {
    const body = document.getElementById('rec-body');
    if (!body) return;
    body.textContent = '';
    if (!itiState.destKey || !recState.rec) {
      const p = document.createElement('p');
      p.className = 'iti-note';
      p.textContent = '목적지를 선택하면 그 목적지의 방식 A·B가 올라옵니다.';
      body.appendChild(p);
      recRenderState();
      itiRenderLink();
      return;
    }
    /* 코스가 있는 목적지에서는 이 구역의 네 칸이 고객에게 안 나간다 — 그 사실을
       칸 라벨보다 먼저, 구역 맨 위에서 말한다 (RK). 라벨만으로는 이미 다 채워 놓고
       나서야 알게 된다. */
    body.appendChild(recRenderReality());
    body.appendChild(itiRenderRecSection(recState.rec));
    recRenderState();
    itiRenderLink();
    itiAutoGrowAll();   /* RE: 붙인 뒤에 잰다 — DOM에 없는 동안에는 높이를 못 잰다 */
  }

  /* ✨ 구역 맨 위 — "이 목적지에서는 무엇이 실제로 고객에게 나가는가" (RK) */
  function recRenderReality() {
    const n = (itiState.courses || []).length;
    const box = document.createElement('div');
    box.className = 'rec-reality' + (n ? ' is-idle' : ' is-live');

    const t = document.createElement('p');
    t.className = 'rec-reality-t';
    const b = document.createElement('div');
    b.className = 'rec-reality-b';

    if (!n) {
      t.textContent = '✅ 이 목적지는 등록된 코스가 없어, 아래 다섯 칸이 모두 고객에게 나갑니다.';
      b.textContent = '고객의 “연수 일정 탐색” 카드와 견적서 기대 효과 문구가 여기 내용으로 채워집니다.';
    } else {
      t.textContent = '⚠ 이 목적지는 코스가 ' + n + '개 있어, 아래 네 칸은 고객에게 나가지 않습니다.';
      b.textContent = '코스가 있으면 고객 화면의 방식 카드는 📅 날짜별 일정에 있는 '
        + '코스의 제목 · 한 줄 설명 · 핵심 하이라이트로 채워지고, 견적서의 기대 효과 문구도 '
        + '코스의 한 줄 설명을 씁니다. 여기서 실제로 쓰이는 것은 「일별 주요 활동」 한 칸뿐입니다 '
        + '(연수 일수가 코스보다 길 때 남는 날을 채웁니다).';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'iti-btn';
      go.textContent = '📅 날짜별 일정에서 고치기';
      go.addEventListener('click', () => itiJump('sec-days'));
      b.appendChild(document.createElement('br'));
      b.appendChild(go);
    }
    box.appendChild(t); box.appendChild(b);
    return box;
  }

  /* ── 두 구역의 의존관계를 숫자로 (QY) ────────────────────────────────────
     연수 일수가 코스보다 길면 남는 날은 **방식 A·B의 '일별 주요 활동'**으로 채워진다.
     화면이 갈려 있을 때는 이걸 매뉴얼로 세 번 설명해야 했다. 지금은 코스 구역에서
     바로 숫자로 보여준다 — 설명이 필요 없어진다. 이것이 두 구역을 한 화면에 둔 이유다. */
  function itiRenderLink() {
    const el = document.getElementById('iti-link');
    if (!el) return;
    el.textContent = '';
    el.className = 'sec-link';
    if (!itiState.destKey) return;

    const maxDays = itiState.courses.reduce((n, c) => Math.max(n, (c.days || []).length), 0);
    const rec = recState.rec || {};
    const itemsA = ((rec.a && rec.a.items) || []).length;
    const itemsB = ((rec.b && rec.b.items) || []).length;
    const fewest = Math.min(itemsA, itemsB);

    const add = (text, bold) => {
      const s = document.createElement(bold ? 'strong' : 'span');
      s.textContent = text;
      el.appendChild(s);
    };
    add('이 목적지는 코스가 최대 ');
    add(maxDays + '일', true);
    add(' · 방식 A·B의 “일별 주요 활동”은 ');
    add(`A ${itemsA}줄 / B ${itemsB}줄`, true);
    add('입니다. ');
    add(`${maxDays}일보다 긴 견적이 오면 남는 날은 그 목록에서 채워집니다.`);

    if (maxDays && fewest < 3) {
      el.classList.add('warn');
      el.appendChild(document.createElement('br'));
      add('⚠ 목록이 짧아 긴 일정에서 빈 날이 생길 수 있습니다. ');
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'sl-go';
      go.textContent = '✨ 방식 A·B에서 채우기';
      go.addEventListener('click', () => itiJump('sec-rec'));
      el.appendChild(go);
    }
  }

  function itiJump(id) {
    const el = document.getElementById(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function recSave() {
    if (!itiState.destKey) { recSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    if (!itiState.loaded) { recSetMsg('저장된 값을 아직 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'err'); return; }

    recSetMsg('저장 중…');
    try {
      const r = await fetch('/api/content?action=itineraries', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        /* ⚠ courses를 보내지 않는다. 한 화면이 되었어도 **구역별 저장은 유지한다** —
           이 구역이 들고 있는 코스 사본은 화면을 연 시점의 것이라, 함께 보내면 그 사이
           동료가 고친 코스를 조용히 되돌린다. 서버는 안 보낸 쪽을 건드리지 않는다(coalesce). */
        body: JSON.stringify({ destKey: itiState.destKey, rec: recState.rec }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || ('http_' + r.status));
      if (out.rec) {
        itiState.recOverrides[itiState.destKey] = out.rec;
        recState.rec = itiClone(out.rec);
      }
      itiState.meta[itiState.destKey] = { updatedAt: new Date().toISOString(), updatedBy: (currentUser && currentUser.displayName) || '' };
      recState.dirty = false;
      itiFillDestSelect();
      recRenderBody();
      recSetMsg('방식 A·B를 저장했습니다. 고객 견적서·일정 탐색에 바로 반영됩니다.', 'ok');
    } catch (err) {
      console.warn('[admin] 방식 A·B 저장 실패:', err);
      recSetMsg('저장하지 못했습니다 — ' + itiSaveErrorText(err.message)
        + ' 수정 내용은 화면에 그대로 있습니다.', 'err');
    }
  }

  async function recRevert() {
    if (!itiState.destKey) { recSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    if (!confirm(itiState.destKey + '의 방식 A·B 수정 내용을 지우고 기본값으로 되돌립니다.\n(아래 날짜별 일정은 그대로 남습니다.)\n계속할까요?')) return;
    try {
      const r = await fetch('/api/content?action=itineraries&part=rec&destKey=' + encodeURIComponent(itiState.destKey), { method: 'DELETE' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || ('http_' + r.status));
      delete itiState.recOverrides[itiState.destKey];
      if (!itiState.overrides[itiState.destKey]) delete itiState.meta[itiState.destKey];
      recState.rec = itiRecDefaults(itiState.destKey);
      recState.dirty = false;
      itiFillDestSelect();
      recRenderBody();
      recSetMsg(out.removed ? '기본 방식 A·B로 되돌렸습니다.' : '이 목적지에는 수정 내용이 없었습니다 (이미 기본값입니다).', 'ok');
    } catch (err) {
      console.warn('[admin] 방식 A·B 되돌리기 실패:', err);
      recSetMsg('되돌리지 못했습니다 (' + err.message + ').', 'err');
    }
  }


  /* 미리보기는 **두 구역 모두에서** 열린다 (RK). 한 곳에만 두면, 다른 구역에서
     작업하던 사람은 버튼이 없는 줄 안다 — 실제로 그래서 "버튼이 안 보인다"가 나왔다. */

  let itiResizeTimer = null;

/* ── 화면에 손잡이를 건다 (2b-1b-②) ─────────────────────────────────────────
   일정 편집 화면 — 저장·되돌리기·코스 추가·활동 고르기·폭 변화.
   🔴 `DOMContentLoaded`로 감싸는 이유는 DOM이 아니라 **파일 사이의 순서**다.
   이 파일은 마크업 뒤에서 실리므로 DOM은 이미 있다. 감싸지 않으면 이 줄들이
   **실리는 순간에** 돌고, 그때 아직 안 실린 다른 조각의 값을 부르면 죽는다.
   
   ───────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('rec-save').addEventListener('click', recSave);
  document.getElementById('rec-revert').addEventListener('click', recRevert);
  /* 떠 있는 저장 바는 **같은 함수**를 부른다 — 저장 경로가 둘이면 언젠가 갈라진다. */
  document.getElementById('savebar-rec').addEventListener('click', recSave);
  document.getElementById('savebar-days').addEventListener('click', itiSave);
  document.querySelectorAll('[data-jump]').forEach((b) => {
    b.addEventListener('click', () => itiJump(b.dataset.jump));
  });

  document.getElementById('iti-dest').addEventListener('change', function () { itiSelectDest(this.value); });
  document.getElementById('iti-save').addEventListener('click', itiSave);
  document.getElementById('iti-revert').addEventListener('click', itiRevert);
  document.getElementById('iti-add-course').addEventListener('click', function () {
    if (!itiState.destKey) { itiSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    const fresh = itiEmptyCourse();
    itiState.courses.push(fresh);
    /* 방금 만든 코스로 옮겨 준다 (RF). 안 옮기면 "＋ 코스 추가를 눌렀는데 아무 일도
       안 일어난다" — 새 코스는 안 보이는 탭에 생기고 화면은 그대로다. */
    itiView.courseIdx = itiState.courses.length - 1;
    (fresh.days || []).forEach((d) => itiOpenDays.add(d));
    itiMarkDirty(); itiRenderBody();
  });

  /* 활동 고르기 창 (QL). 검색은 입력할 때마다 다시 그린다 — 후보가 1,000건대라
     실시간으로 좁혀지지 않으면 스크롤로 찾게 되고, 그러면 타이핑보다 느려진다. */
  document.getElementById('itiPickClose').addEventListener('click', itiPickClose);
  document.getElementById('itiPickSearch').addEventListener('input', function () {
    itiPick.q = this.value; itiPickRender();
  });
  document.getElementById('itiPickModal').addEventListener('click', function (e) {
    if (e.target === this) itiPickClose();          /* 바깥을 눌러도 닫힌다 */
  });

  /* 코스 가져오기 창 (QM) */
  document.getElementById('iti-copy-course').addEventListener('click', itiCopyOpen);
  document.getElementById('itiCopyClose').addEventListener('click', itiCopyClose);
  document.getElementById('itiCopySearch').addEventListener('input', function () {
    itiCopy.q = this.value; itiCopyRender();
  });
  document.getElementById('itiCopyModal').addEventListener('click', function (e) {
    if (e.target === this) itiCopyClose();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('itiPickModal').classList.contains('hidden')) itiPickClose();
    else if (!document.getElementById('itiCopyModal').classList.contains('hidden')) itiCopyClose();
  });

  /* RE: 폭이 바뀌면 같은 글이 차지하는 줄 수가 달라진다(2×2 격자가 좁은 화면에서 1열이
     되는 자리라 특히 크게 바뀐다). 다시 재지 않으면 그 뒤로 계속 어긋난 높이로 남는다.
     연속으로 쏟아지는 이벤트라 마지막 한 번만 처리한다. */
  window.addEventListener('resize', function () {
    if (currentTab !== 'itineraries') return;
    clearTimeout(itiResizeTimer);
    itiResizeTimer = setTimeout(itiAutoGrowAll, 120);
  });
});

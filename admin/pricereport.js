/* ═══════════════════════════════════════════════════════════════════════════
   견적서 업데이트 · PDF 추출 화면 — admin.html에서 떼어낸 화면 (구조 정리 2b-3)

   ■ 로드 규칙  `admin/common.js` 다음, admin.html의 인라인 <script> 앞에서 실린다.
     여기 있는 것은 전부 **선언**이다. 실행문(addEventListener·fetch)은 admin.html에
     그대로 남아 있다 — 그쪽은 DOM 순서에 걸려 있어 따로 다룬다(2b-1b).

   ■ 검사  `ai-loop/_admin_source.js`의 ADMIN_PARTS + `ai-loop/test_zZ_admin_boot.js`가
     **띄워서** 이 화면의 이름이 사는지 본다. 이 파일을 비우면 test_zZ가 실패해야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ════ 실제 계약가 업데이트 위젯 (신규) ════ */
  let prDestSelectBuilt = false;
  function populatePriceReportDestSelect() {
    const sel = document.getElementById('pr-dest');
    if (!sel || prDestSelectBuilt || typeof destinationRates === 'undefined') return;
    /* 목적지 이름만으로는 어느 나라인지 모르는 것이 많다(가오슝·나트랑·보홀·코타키나발루…).
       호텔명을 넣는 화면이라 나라를 옵션에 같이 적어 둔다 — 고르는 순간 이미 보이게. */
    /* TD: **나라별로 묶는다.** 예전엔 57곳이 한 줄로 늘어서 있었다.
       나라가 머리줄에 있으므로 옵션에 「(나라)」를 또 붙이지 않는다(같은 말이 두 번 나온다). */
    sel.textContent = '';
    appendDestOptionsByCountry(sel, destinationRates.map((d) => d.destination_key), (k) => {
      const d = destinationRates.find((x) => x.destination_key === k);
      const o = document.createElement('option');
      o.value = k; o.textContent = (d && d.label) || k;
      return o;
    });
    sel.addEventListener('change', updateHotelScopeHint);
    prDestSelectBuilt = true;
    updateHotelScopeHint();
  }

  /* ── TD: 목적지 드롭다운을 **나라별로 묶는다** (2026-08-11 대표 요청) ──────
     고객 화면(index.html)은 이미 나라별 optgroup인데, **관리자 화면은
     평평한 목록**이었다 — 57곳이 한 줄로 늘어서서 원하는 곳을 눈으로 찾아야 했다.
     ⚠ 나라는 `DEST_COUNTRY`(DEST_CLASSIFY 파생)에서만 온다. 여기서 목적지→나라 표를
       다시 적으면 목록이 두 벌이 된다(결함 생성기 ①).
     ⚠ 나라를 모르는 목적지(커스텀 등)는 **버리지 않고** 「기타」로 모은다 — 빠뜨리면
       담당자는 그 목적지를 아예 고를 수 없다.
     ⚠ 나라 안 순서와 나라 순서는 **원래 목록 순서**를 따른다. 가나다순으로 다시 정렬하면
       요율표·고객 화면과 순서가 어긋나 같은 것을 찾는 자리가 둘로 갈린다. */
  function appendDestOptionsByCountry(sel, keys, makeOption) {
    const groups = [];
    const byName = {};
    keys.forEach((k) => {
      const c = destCountryOf(k) || '기타';
      if (!byName[c]) { byName[c] = []; groups.push(c); }
      byName[c].push(k);
    });
    groups.forEach((c) => {
      const g = document.createElement('optgroup');
      g.label = c + ' (' + byName[c].length + ')';
      byName[c].forEach((k) => g.appendChild(makeOption(k)));
      sel.appendChild(g);
    });
  }

  /* 목적지 → 나라/지역 (RY). 내장은 DEST_CLASSIFY 파생, 커스텀은 loadRates에서 편입된다.
     ⚠ REGION_MAP은 label로, DEST_COUNTRY는 destination_key로 색인된다(각각 만들어진
     방식 그대로다). 여기서 한 번에 흡수해 호출부가 그 차이를 몰라도 되게 한다. */
  function destCountryOf(destKey) {
    return (typeof DEST_COUNTRY !== 'undefined' && DEST_COUNTRY[destKey]) || '';
  }
  function destRegionOf(destKey) {
    const d = (typeof destinationRates !== 'undefined')
      ? destinationRates.find(x => x.destination_key === destKey) : null;
    return (typeof REGION_MAP !== 'undefined' && REGION_MAP[d ? d.label : destKey]) || '기타';
  }

  /* 호텔명 입력칸 아래 "어디로 정리되는지" 안내 (RY) */
  function updateHotelScopeHint() {
    const el = document.getElementById('pr-hotel-scope');
    const sel = document.getElementById('pr-dest');
    if (!el || !sel) return;
    const key = sel.value;
    if (!key) { el.textContent = ''; return; }
    const dest = (typeof destinationRates !== 'undefined')
      ? destinationRates.find(d => d.destination_key === key) : null;
    const country = destCountryOf(key);
    const region = destRegionOf(key);
    /* ⚠ "…다낭 로 정리됩니다"처럼 조사를 붙이지 않는다 — 도시 이름마다 받침이 달라
       '으로/로'가 틀린다. 목록에서 실제로 접히는 순서를 그대로 보여주는 편이 짧고 정확하다. */
    const path = `${region} › ${country || COUNTRY_UNSET} › ${dest ? dest.label : key}`;
    /* ⚠ "요율 관리에서 지정하세요"라고 쓰지 않는다 — 나라는 **목적지를 추가할 때만** 받고
       나중에 고치는 화면이 아직 없다. 할 수 없는 일을 안내하면 그게 더 나쁜 결함이다. */
    el.textContent = country
      ? `정리되는 자리: ${path}`
      : `정리되는 자리: ${path} — 이 목적지는 추가될 때 '나라' 칸이 비어 있었습니다`;
    el.style.color = country ? 'var(--muted)' : 'var(--danger)';
  }

  /* 실제 계약가 입력 방식 (신규) — "직접 입력"과 "PDF 제출"을 상호배타로 분리한다.
     · manual: 담당자가 가격 필드를 직접 편집. PDF 컨트롤은 숨김(=PDF 제출 비활성).
     · pdf   : PDF 업로드→추출만 사용. 가격 필드는 readonly로 잠가 사람이 손대지 못하게
               하고, extractPdfDetails가 채운 값 그대로만 제출된다.
     방식 전환 시에는 값을 초기화해 한 방식의 입력이 다른 방식으로 섞이지 않게 한다. */
  /* 가격 칸 — **방식마다 다른 값**이다. 방식을 바꾸면 비운다(한 방식의 입력이 다른
     방식으로 섞이면 안 된다). */
  const PR_PRICE_IDS = ['pr-airfare', 'pr-hotel', 'pr-hotel-name', 'pr-meal',
    'pr-fuel', 'pr-vehicle', 'pr-guide', 'pr-sight', 'pr-golf', 'pr-sell'];
  /* 공통 칸 — 방식 선택 **위**에 있는 것들이다. 어느 방식이든 같은 값이라 방식을 바꿔도
     지우지 않는다.
     ⚠ 예전엔 이것들도 함께 지웠다. 그래서 출발일·견적작성일·박수를 먼저 넣고
       방식 버튼을 누르면 **넣은 값이 통째로 사라져** 화면이 새로고침된 것처럼 보였다
       (2026-08-12 사장님 지적). 출발일은 시즌·리드타임 검증의 근거라 다시 넣게 하면
       그냥 비워 두고 넘어가게 된다. */
  const PR_COMMON_IDS = ['pr-depart', 'pr-quote-date', 'pr-nights'];
  const PR_FIELD_IDS = PR_PRICE_IDS.concat(PR_COMMON_IDS);
  /* 기본은 **PDF 제출**이다 (2026-08-12 사장님 지시) — 실무자가 견적서를 들고 오는 자리라
     직접 입력은 예외 경로다. 화면의 버튼 순서도 이 순서와 같아야 한다. */
  let priceReportMode = 'pdf';

  function applyPriceReportModeUI() {
    const isPdf = priceReportMode === 'pdf';
    const mBtn = document.getElementById('pr-mode-manual');
    const pBtn = document.getElementById('pr-mode-pdf');
    if (mBtn) mBtn.className = 'btn-act ' + (isPdf ? 'btn-outline-p' : 'btn-primary');
    if (pBtn) pBtn.className = 'btn-act ' + (isPdf ? 'btn-primary' : 'btn-outline-p');
    const pdfBlock = document.getElementById('pr-pdf-block');
    if (pdfBlock) pdfBlock.classList.toggle('hidden', !isPdf);
    const fieldsLabel = document.getElementById('pr-fields-label');
    /* ⚠ SW: 「후보에서 고르세요」만 적혀 있어서 담당자가 **직접 쳐도 된다는 것을 몰랐다.**
       실무자가 올리는 자리라 이 한 줄이 곧 사용법이다. */
    /* 🔴 PDF 모드 안내 한 줄은 **2026-09-08 대표 지시로 걷어냈다.** 직접 입력 모드의
       「직접 입력할 값」은 남는다 — 그건 안내가 아니라 이 칸 무리의 이름이다.
       ⚠ 빈 문자열이면 요소를 **감춘다.** 안 감추면 PDF 모드에서 빈 줄 높이만큼 칸 무리가
          아래로 밀려, 지운 글이 자리로만 남는다.
       ⚠ 요소 자체는 지우지 않는다 — renderPdfSummary가 이 자리를 닻으로 쓴다. */
    if (fieldsLabel) {
      fieldsLabel.textContent = isPdf ? '' : '직접 입력할 값 (아는 항목만)';
      fieldsLabel.classList.toggle('hidden', !fieldsLabel.textContent);
    }
    /* PDF 모드면 가격 필드를 잠근다(직접 수정 불가) — 값은 extractPdfDetails가 채움 */
    PR_FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      /* ⚠ 예전에는 PDF 모드에서 칸을 잠갔다 (RN에서 품). 한 칸만 틀려도 '직접 입력'으로
         바꿔 처음부터 다시 넣어야 했는데, 견적서를 수백 건 넣는 자리에서 그건 치명적이다.
         이제는 **고쳐 쓸 수 있다.** 대신 값의 출처(견적서 어느 줄에서 왔는지)를 칸 밑에
         적어 두고, 사람이 바꾸면 '직접 고침'으로 표시가 바뀐다. */
      el.readOnly = false;
      el.style.opacity = '';
      el.style.cursor = '';
    });
    if (!isPdf) clearPdfEvidence();
  }

  /* ── PDF 추출 근거·후보 (RN) ────────────────────────────────────────────────
     AI가 고른 값이 왜 그 값인지 칸 밑에 적고, 틀렸으면 **후보 목록에서 1클릭으로**
     바꾸게 한다. 담당자가 숫자를 타이핑할 일이 없고, 값은 언제나 견적서에 실제로 있는
     (단가×수량×횟수=총액이 검산된) 줄에서만 온다. */
  /* ⚠ 항공·호텔·식비만 AI가 고른다. 나머지(유류할증·차량·가이드·관광·판매가)는
     **후보 목록만 붙여** 담당자가 직접 고르게 한다 (RQ) — AI에게 9개를 다 시키면
     식사에서 겪은 것처럼 라벨 추측이 흔들리고, 틀린 값이 여러 칸에 한꺼번에 들어간다.
     후보는 어차피 산술 검증된 줄이라 고르기만 하면 되고, 안 고르면 비어 있을 뿐이다. */
  /* RZ: 좌표로 표를 복원하면서 **줄마다 자기 항목 이름**이 붙었다. 그래서 이제 9칸을
     전부 규칙이 채운다(AI는 못 채운 칸만 본다). pickOnly 구분은 없어졌고, 대신 값이
     어디서 왔는지(규칙/AI/예비경로)와 계산식을 칸 밑에 그대로 적는다. */
  const PR_EVIDENCE_FIELDS = [
    { key: 'airfare', input: 'pr-airfare', label: '항공료' },
    { key: 'hotel', input: 'pr-hotel', label: '호텔단가' },
    { key: 'meal', input: 'pr-meal', label: '식비' },
    { key: 'fuel', input: 'pr-fuel', label: '유류할증료' },
    { key: 'vehicle', input: 'pr-vehicle', label: '차량비' },
    { key: 'guide', input: 'pr-guide', label: '가이드비' },
    { key: 'sight', input: 'pr-sight', label: '관광·입장료' },
    /* TJ: 골프는 관광과 **다른 칸**이다 — 자릿수가 달라 섞으면 관광비 기준이 왜곡된다.
       골프가 없는 견적서에서는 그냥 빈칸으로 남는다(대부분이 그렇다). */
    { key: 'golf', input: 'pr-golf', label: '골프(1인 1회)' },
    { key: 'sell', input: 'pr-sell', label: '최종 판매가' },
  ];

  /* 추출된 한 칸이 그 목적지 기준과 견줘 타당한가 (SO).
     ⚠ 잣대·문구는 전부 `plausibility.js`에서 온다 — 여기서 다시 정하지 않는다.
     ⚠ 기존 실측은 **검산된 것만** 기준이 된다(plausibility.isTrusted). 제보 테이블에는
        신뢰도가 없지만, 제보는 담당자가 화면에서 확인하고 저장한 값이라 신뢰한다.
     ⚠ 요율 항목 이름과 추출 항목 이름이 다르다 — REPORT_VALUE_KEY의 역방향이다. */
  const PLAUS_RATE_FIELD = {
    airfare: 'airfare', fuel: 'fuel_surcharge', hotel: 'hotel_per_room',
    meal: 'meal_per_person', vehicle: 'vehicle_large', guide: 'guide_fee',
    sight: 'sightseeing_fee',
    /* TJ: 골프도 요율 칸이 생겼다(golf_fee). 다만 값이 0인 목적지가 대부분이라
       기준가가 없고, 그때 plausibility.judge는 'none'(판단하지 않음)을 돌려준다 —
       그 지역 첫 견적서와 같은 취급이다. 그것이 맞다: 안 파는 곳의 골프 요금은 기준이 없다. */
    golf: 'golf_fee',
  };
  function judgePdfValue(key, rawValue, ev) {
    if (typeof PLAUSIBILITY === 'undefined') return null;   /* 파일을 못 불러왔으면 조용히 넘어간다 */
    const rateField = PLAUS_RATE_FIELD[key];
    if (!rateField) return null;                            /* sell은 요율 항목이 아니다 */
    const v = Number(String(rawValue || '').replace(/[^\d.-]/g, ''));
    if (!(v > 0)) return null;
    const destKey = (document.getElementById('pr-dest') || {}).value || '';
    if (!destKey) return null;                              /* 목적지를 아직 안 골랐다 */
    const dest = (typeof destinationRates !== 'undefined')
      ? destinationRates.find((d) => d.destination_key === destKey) : null;
    const base = dest ? (effectiveRate(dest) || {})[rateField] : 0;
    /* 같은 목적지의 기존 실측 — **오늘 환율 기준으로 되돌려서** 견준다(SG) */
    const peers = (priceReportsCache || [])
      .filter((r) => r.destinationKey === destKey)
      .map((r) => reportValueToday(r, rateField))
      .filter((n) => n > 0);
    return PLAUSIBILITY.judge(v, peers, base);
  }

  /* SV: 「전 일정 총액이 1일 단가 자리에」 — 차량·가이드에만 해당한다.
     ⚠ 판정 규칙은 `plausibility.js`가 갖고, 여기서는 **재료만 모은다**(요율 기준가와
       추출기가 남긴 duration). 규칙을 여기 다시 적으면 감사기와 어긋난다(결함 생성기 ①).
     ⚠ 기준은 **그 목적지의 1일 기준가**다. 동료 실측을 쓰지 않는 이유: 이 검사는
       **그 지역 첫 견적서**에서 가장 필요한데 그때는 동료가 없다. */
  let PR_LAST_EVIDENCE = null;
  function judgeTripTotalValue(key, rawValue) {
    if (typeof PLAUSIBILITY === 'undefined' || !PLAUSIBILITY.judgeTripTotal) return null;
    if ((PLAUSIBILITY.PER_DAY_FIELDS || []).indexOf(key) < 0) return null;
    const ev = PR_LAST_EVIDENCE ? PR_LAST_EVIDENCE[key] : null;
    if (!ev || !ev.duration) return null;
    const rateField = PLAUS_RATE_FIELD[key];
    const destKey = (document.getElementById('pr-dest') || {}).value || '';
    if (!rateField || !destKey) return null;
    const dest = (typeof destinationRates !== 'undefined')
      ? destinationRates.find((d) => d.destination_key === destKey) : null;
    const base = dest ? (effectiveRate(dest) || {})[rateField] : 0;
    const v = Number(String(rawValue || '').replace(/[^\d.-]/g, ''));
    return PLAUSIBILITY.judgeTripTotal(v, base, ev.duration);
  }

  /* 값의 출처를 한 낱말로 (RZ 후속) — 담당자가 **어느 칸을 확인해야 하는지**를
     칸마다 보게 한다. 배지가 없으면 9칸이 전부 똑같아 보여서, 결국 아무것도 확인 안 하거나
     전부 다시 대조하게 된다. */
  const PR_VIA = {
    rule: { text: '견적서', title: '견적서의 한 줄을 그대로 집었습니다 (항목 이름까지 일치)' },
    doc: { text: '견적서', title: '문서에 그대로 적힌 값입니다' },
    calc: { text: '계산', title: '여러 줄을 합쳐 계산했습니다 — 아래 식을 확인해 주세요' },
    unchecked: { text: '검산 안 됨', title: '수량·횟수가 없는 줄이라 곱셈 검산이 이뤄지지 않았습니다 — 1인 단가인지 전 일정 총액인지 꼭 확인해 주세요' },
    ai: { text: 'AI 추정', title: '규칙이 못 채워 AI가 골랐습니다 — 꼭 확인해 주세요' },
    fallback: { text: '예비 경로', title: '표 좌표를 못 읽어 예전 방식으로 물러났습니다 — 꼭 확인해 주세요' },
    none: { text: '못 찾음', title: '이 항목을 찾지 못했습니다 — 후보에서 고르거나 직접 넣어 주세요' },
    manual: { text: '직접 고침', title: '담당자가 후보에서 고른 값입니다' },
    /* SW: 담당자가 견적서를 보면서 **직접 넣은** 값 — 추출값보다 믿을 수 있고,
       「검산 안 됨」·타당성 경고를 닫는다(다시 묻지 않는다). */
    confirmed: { text: '담당자 확정 ✓', title: '담당자가 견적서를 보고 직접 확정한 값입니다 — 추출값이 아닙니다' },
  };

  function setFieldBadge(inputId, via) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const label = input.previousElementSibling;
    if (!label || !label.classList.contains('detail-label')) return;
    const old = label.querySelector('.pr-badge');
    if (old) old.remove();
    const info = PR_VIA[via];
    if (!info) return;
    const b = document.createElement('span');
    b.className = 'pr-badge via-' + via;
    b.textContent = info.text;
    b.title = info.title;
    label.appendChild(b);
  }

  /* SG: **이 칸의 값이 어느 환율로 환산됐는가.** 견적서에서 뽑은 원화값에는 그 견적서의
     환율이 박혀 있는데, 요율표 단가는 「오늘 환율 기준」이라는 약속 위에 서 있다
     (rate_fx_baseline). 그대로 넣으면 두 환율의 차이만큼 처음부터 어긋난다 —
     실측으로 중앙값 5.1%, 최대 12.1%였다. 값은 고치지 않고 **되돌릴 수단**을 함께 보낸다.
     ⚠ 담당자가 칸을 직접 고쳐 쓰면 그 값은 더 이상 환산값이 아니다. 그래서 추출 당시의
     값을 함께 기억해 두고, **바뀌지 않은 칸만** 되돌릴 대상으로 보낸다. */
  /* ── SW: 담당자가 그 자리에서 확정한 칸 ─────────────────────────────────────
     2026-08-11 대표 방침 — **앞으로 실무자가 직접 견적서를 올린다.** 그러면 오류를
     사장님이 뒤에서 잡는 게 아니라, **문서를 손에 든 사람이 그 자리에서 확정**해야 한다.

     ⚠ 칸은 예전부터 편집 가능했는데(RN에서 잠갔다가 품) **입력을 듣는 곳이 없었다.**
       그래서 담당자가 숫자를 그냥 치면:
         · 배지가 「견적서」로 남아 다음 사람이 AI가 읽은 값으로 믿고
         · 근거 줄이 옛 계산식을 그대로 보여주며(화면이 거짓말을 한다)
         · 타당성 검토(SO)가 새 값에 안 돌아 오타 방어가 사라졌다.
       후보 목록으로 고를 때만 막히고 **타이핑은 안 막혔다.** 실무자에게 넘기기 전에
       반드시 닫아야 하는 구멍이다.
     ⚠ 확정한 칸은 **다시 묻지 않는다** — 「검산 안 됨」·타당성 경고를 닫는다.
       그래야 실무자가 확정한 것을 사장님이 또 확인하지 않는다.
       다만 **닫기 전에 한 번은 보여준다**(오타를 확정으로 굳히지 않게). */
  let PR_MANUAL_FIELDS = {};   /* { key: { how } } — 무엇을 어떻게 정했는지 */
  let PR_FX_BY_FIELD = {};

  function clearPdfEvidence() {
    PR_FX_BY_FIELD = {};
    PR_MANUAL_FIELDS = {};
    /* TF: 앞 문서의 판정을 다음 문서로 물려주지 않는다 — 여러 도시 견적서를 올린 뒤
       다른 문서를 올리면 없던 경고가 따라붙는다(그 반대가 더 나쁘다). */
    PR_LAST_ITIN = null;
    document.querySelectorAll('.detail-label .pr-badge').forEach((b) => b.remove());
    PR_EVIDENCE_FIELDS.forEach((f) => {
      const box = document.getElementById('pr-ev-' + f.key);
      if (box) box.remove();
    });
    const warn = document.getElementById('pr-warnings');
    if (warn) warn.remove();
    const sum = document.getElementById('pr-pdf-summary');
    if (sum) sum.remove();
  }

  /* 식사 줄 고르기 (RZ) — 요율의 식비는 **1인 1일**이다.
     ⚠ 예전에는 고른 줄의 **단가를 그냥 더했다.** 그건 '식사 소계 = 하루치'인 견적서에서만
     맞고, 전 일정 식대를 한 소계로 묶는 견적서에서는 **4배 넘게 부푼다**(한화 뉴퍼스트에서
     343,650원이 나왔다 — 실제 하루치는 9만 원대). 그래서 서버와 **똑같은 식**으로 계산한다:
         고른 줄의 총액 합 ÷ 인원 ÷ 식사 일수
     인원·일수는 서버가 문서에서 읽어 함께 내려준다. 화면이 그 식을 그대로 보여주므로
     담당자가 결과만이 아니라 **왜 그 값인지**를 보고 고칠 수 있다. */
  function buildMealChecks(cands, data, input, onUpdate) {
    const wrap = document.createElement('div');
    wrap.className = 'pr-ev-checks';
    const chosen = new Set((data.picked || {}).mealRows || []);
    const pax = Number(data.pax) || 0;
    const days = Number(data.mealDays) || 0;
    const recalc = () => {
      const picked = cands.filter((c) => chosen.has(c.idx));
      if (!picked.length) { input.value = ''; onUpdate('식사 줄을 고르지 않았습니다', ''); return; }
      const totalCost = picked.reduce((n, c) => n + c.total, 0);
      if (pax > 0 && days > 0) {
        const v = Math.round(totalCost / pax / days);
        input.value = v;
        onUpdate(`식사 ${picked.length}줄을 직접 골랐습니다`,
          `${totalCost.toLocaleString()} ÷ 인원 ${pax} ÷ ${days}일 = ${v.toLocaleString()} (1인 1일)`);
      } else {
        /* 인원·일수를 못 읽었으면 나눌 근거가 없다 — 단가 합만 보이고 **왜 못 나눴는지 말한다** */
        const sum = picked.reduce((n, c) => n + c.unit, 0);
        input.value = sum;
        onUpdate('인원·일수를 못 읽어 하루치로 나누지 못했습니다 — 직접 확인해 주세요',
          `단가 합 ${sum.toLocaleString()}`);
      }
    };
    cands.forEach((c) => {
      const lab = document.createElement('label');
      lab.className = 'pr-ev-check';
      lab.title = c.line;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = chosen.has(c.idx);
      cb.addEventListener('change', () => {
        if (cb.checked) chosen.add(c.idx); else chosen.delete(c.idx);
        recalc();
      });
      lab.appendChild(cb);
      lab.append(' ' + (c.label ? c.label.slice(0, 14) + ' ' : '') + c.unit.toLocaleString() + ' (×' + c.qty + '×' + c.times + ')');
      wrap.appendChild(lab);
    });
    return wrap;
  }

  /* 후보 고르기는 **접어 둔다** (RZ 후속, 사장님 지시).
     9칸 전부에 드롭다운·체크박스가 펼쳐져 있으면 화면이 시끄러워서, 정작 손봐야 할
     칸("AI 추정"·"못 찾음")이 안 보인다. 값을 못 찾았거나 확인이 필요한 칸만 펼쳐 두고
     나머지는 "다른 줄로 바꾸기"로 접는다 — 필요할 때 한 번 누르면 된다. */
  function wrapPicker(summaryText, inner, openByDefault) {
    const det = document.createElement('details');
    det.className = 'pr-ev-more';
    if (openByDefault) det.open = true;
    const sm = document.createElement('summary');
    sm.textContent = summaryText;
    det.appendChild(sm);
    det.appendChild(inner);
    return det;
  }

  /* 후보 한 줄을 사람이 읽을 수 있는 한 문장으로 (RZ).
     ⚠ 항목 이름과 통화 환산을 반드시 함께 보인다 — "130,000원"만 보여주면 그게
     ¥13,000을 환산한 값인지 알 수 없고, 담당자가 대조할 방법이 없다. */
  function prCandLabel(c) {
    const head = c.label ? c.label.slice(0, 22) + ' — ' : '';
    const conv = c.converted
      ? `  [${c.converted.from} ${c.converted.originalUnit.toLocaleString()} × ${c.converted.rate}]`
      : (c.unconvertible ? '  [환율을 몰라 환산 못 함]' : '');
    return `${head}${c.unit.toLocaleString()}원 (× ${c.qty} × ${c.times} = ${c.total.toLocaleString()})${conv}`;
  }

  /* 읽은 결과의 '머리말' (RZ) — 값을 보기 전에 담당자가 알아야 하는 세 가지를 먼저 말한다:
       ① 이 문서가 어떤 종류인가 (단가표가 없는 문서면 아무리 해도 못 뽑는다)
       ② 문서 자체 검산이 맞는가 (총계 ÷ 인원 = 1인당 — 맞으면 제대로 읽었다는 증거)
       ③ 손이 필요한 것 — 견적이 여러 장이거나, 외화인데 환율이 없거나
     ⚠ 이걸 안 보여주면 "왜 비어 있지?"를 담당자가 추측하게 된다. 그게 지금까지의 문제였다. */
  let prLastPdfBase64 = null;   /* 환율을 넣고 다시 계산할 때 파일을 다시 읽지 않으려고 */

  function renderPdfSummary(data) {
    const old = document.getElementById('pr-pdf-summary');
    if (old) old.remove();
    const anchor = document.getElementById('pr-fields-label');
    if (!anchor) return;

    const box = document.createElement('div');
    box.id = 'pr-pdf-summary';
    box.className = 'pr-ev';
    box.style.cssText = 'margin-bottom:.75rem;padding:.6rem .8rem;border:1.5px solid var(--border);background:var(--bg)';

    const line = (html) => { const p = document.createElement('div'); p.style.cssText = 'font-size:.76rem;line-height:1.7'; p.innerHTML = html; box.appendChild(p); return p; };

    const kind = data.kind || {};
    line(`📄 <strong>${esc(kind.label || '문서 종류를 판별하지 못했습니다')}</strong>`
      + (data.rowCount ? ` · 검산된 단가 줄 <strong>${Number(data.rowCount)}개</strong>` : '')
      + (data.pax ? ` · 인원 <strong>${Number(data.pax)}명</strong>` : ''));

    const rec = data.reconciliation || {};
    if (rec.total) {
      const allOk = rec.passed === rec.total;
      line(`${allOk ? '✅' : '⚠️'} 문서 자체 검산 <strong>${Number(rec.passed)}/${Number(rec.total)}</strong> 통과`
        + (allOk ? ' — 견적서의 총계·1인당과 앞뒤가 맞습니다(제대로 읽었다는 뜻입니다).'
                 : ' — 아래 경고를 확인해 주세요.'));
    }

    /* 🔴 **얼마나 읽었는지 말한다** (YS). 위 두 줄은 「몇 개 읽었나」와 「읽은 것끼리
       앞뒤가 맞나」이지, **얼마나 읽었나**가 아니다. 그래서 총계의 0.3%만 읽고도
       화면이 성공처럼 보이는 자리가 있었다(키움 나트랑 — 검산줄 2개·22만원 vs 총계 6,977만원).
       발행처마다 양식이 다르고 앞으로 계속 새 양식이 들어오므로, 못 읽는 양식이 오면
       **그 사실 자체가 첫 줄로 보여야** 한다.
     ⚠ 판정과 문구는 `plausibility.js` 한 곳에서 온다 — 화면에 다시 적으면 감사기와
       어긋난다(결함 생성기 ①, 이 파일이 만들어진 이유 그대로). */
    const cov = (window.PLAUSIBILITY && window.PLAUSIBILITY.coverage)
      ? window.PLAUSIBILITY.coverage(data.candidates, data.grandTotal) : null;
    if (cov) {
      const mark = !cov.known ? 'ℹ️' : (cov.verdict === 'ok' ? '✅' : '🔴');
      const el = line(`${mark} ${esc(window.PLAUSIBILITY.describeCoverage(cov))}`);
      if (cov.known && cov.verdict !== 'ok') {
        el.style.color = 'var(--danger)';
        el.style.fontWeight = '700';
      }
      /* 환산 못 한 외화 줄은 합에서 빠져 있다 — 비율이 낮은 이유일 수 있으므로 말해 준다 */
      if (cov.stuck) {
        line(`<span style="color:var(--muted)">↳ 환율을 몰라 못 더한 외화 줄 <strong>${Number(cov.stuck)}개</strong>가 있습니다 — 그만큼 비율이 낮게 나옵니다.</span>`);
      }
    }

    /* 견적이 여러 장이면 **실제로 골라 바꿀 수 있게** 한다 (RZ 후속).
       ⚠ 예전엔 목록만 보여주고 바꿀 방법이 없었다 — "2개 들어 있습니다"라고 말해 놓고
       다른 쪽을 볼 수가 없으니 안내가 아니라 약만 올리는 셈이었다.
       ⚠ 어느 것이 맞는지는 **사람만 안다.** 한화 상하이 건은 출발일이 11/08·11/15·11/22로
       갈리는 **차수별 견적 3건**이고, 뉴퍼스트 건은 같은 날짜의 **일정 A/B 2건**이다.
       그래서 출발일·인원·총계를 나란히 보여주고 담당자가 고르게 한다. */
    if (Number(data.blockCount) > 1 && Array.isArray(data.blocks)) {
      const p = line(`📑 이 PDF에 <strong>견적이 ${Number(data.blockCount)}개</strong> 들어 있습니다 — 어느 것을 넣을지 골라 주세요:`);
      const ul = document.createElement('div');
      ul.style.cssText = 'display:grid;gap:.3rem;margin-top:.35rem';
      data.blocks.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-act ' + (b.selected ? 'btn-primary' : 'btn-outline-p');
        btn.style.cssText = 'text-align:left;font-size:.74rem;padding:.35rem .6rem;line-height:1.5';
        const dt = (b.dates && b.dates.departDate) ? b.dates.departDate : '출발일 모름';
        btn.textContent = `${b.selected ? '▶ ' : ''}${dt} 출발`
          + ` · 총계 ${b.total ? Number(b.total).toLocaleString() : '—'}원`
          + (b.perPerson ? ` · 1인당 ${Number(b.perPerson).toLocaleString()}원` : '')
          + (b.pax ? ` · ${Number(b.pax)}명` : '')
          + ` · 단가 줄 ${Number(b.rows)}개`;
        btn.addEventListener('click', () => selectQuoteBlock(data, b.idx));
        ul.appendChild(btn);
      });
      p.appendChild(ul);
    }

    /* 외화 견적서인데 문서에 환율이 없을 때 — **딱 한 칸만** 물어본다. */
    if (data.needsFxRate && data.needsFxRate.currency) {
      const cur = String(data.needsFxRate.currency);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:.5rem;padding:.5rem .7rem;border:1.5px solid var(--danger,#dc2626);display:flex;gap:.5rem;align-items:center;flex-wrap:wrap';
      const lab = document.createElement('span');
      lab.style.cssText = 'font-size:.76rem;font-weight:700;color:var(--danger,#dc2626)';
      lab.textContent = `💱 ${cur} 기준 견적서인데 문서에 환율이 없습니다 — 1 ${cur} =`;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.className = 'pw-input'; inp.id = 'pr-fx-input';
      inp.style.cssText = 'max-width:110px'; inp.placeholder = '예: 1450'; inp.step = 'any';
      const unit = document.createElement('span');
      unit.style.cssText = 'font-size:.76rem'; unit.textContent = '원';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn-act btn-primary'; btn.textContent = '이 환율로 다시 읽기';
      btn.addEventListener('click', () => {
        const v = Number(inp.value);
        if (!(v > 0)) { alert('환율을 숫자로 넣어 주세요.'); return; }
        const fx = {}; fx[cur] = v;
        extractPdfDetails({ fxRate: fx });
      });
      const note = document.createElement('div');
      note.style.cssText = 'font-size:.72rem;color:var(--muted);width:100%';
      note.textContent = `넣으면 ${Number(data.needsFxRate.rowCount)}줄이 원화로 환산되어 빈 칸이 채워집니다. `
        + '오늘 환율로 임의 환산하지 않는 이유는, 견적 시점과 다른 값이 실측으로 굳으면 요율이 틀어지기 때문입니다.';
      wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(unit); wrap.appendChild(btn); wrap.appendChild(note);
      box.appendChild(wrap);
    }

    if (data.fxFromDocument && Object.keys(data.fxFromDocument).length) {
      line('💱 문서에 적힌 환율을 그대로 썼습니다 — '
        + esc(Object.keys(data.fxFromDocument).map((k) => `1 ${k} = ${data.fxFromDocument[k]}원`).join(' · ')));
    }

    /* TJ: 골프 라운딩 요금. 아래 골프 칸에 채워지지만 **여기서도 한 번 말한다** —
       회차를 몇 번으로 셌는지가 단가를 배수로 바꾸는데, 그건 값만 봐서는 안 보인다.
       ⚠ 관광 줄이 없는 문서에서는 관광비 근거에도 안 나온다(고은회 제주도가 그 모양이다). */
    const gEv = (data.evidence || {}).golf;
    if (data.values && data.values.golf && gEv) {
      line('⛳ 골프 라운딩 <strong>1인 1회 ' + Number(data.values.golf).toLocaleString() + '원</strong>을 읽었습니다 — '
        + esc(gEv.calc || '') + '<br>'
        + '<span style="color:var(--muted)">' + esc(gEv.note || '') + '</span><br>'
        + '<span style="color:var(--muted)">관광비와 자릿수가 달라 <strong>관광비에서는 뺐습니다</strong>'
        + ' — 아래 「실제 골프」 칸으로 갔습니다.</span>');
    }

    renderPdfCrews(box, data);
    renderPdfItinerary(box, data);

    anchor.insertAdjacentElement('beforebegin', box);
  }

  /* ════ TJ: 관광조·골프조로 갈린 견적서 ══════════════════════════════════════
     사장님 2026-08-13: 「관광조가 있고 골프조가 있어.」 문서가 비고에 그렇게 적어 두면
     추출기가 **1인당 항목의 분모를 그 줄 인원으로 바꾼다**(pdf_extract L3.7).
     실측(카자흐스탄): 「관광지 $99 × 5명 Only 관광조」 722,700을 전원 32명으로 나누면
     22,584인데 실제 관광조 5명으로 나누면 144,540이다 — 6배 넘게 다르다.

     ⚠ **금액이 달라지는 구역이다.** 일정표 안내(「금액에는 영향이 없습니다」)와 성격이
       다르므로 따로 세워 눈에 걸리게 한다. 담당자가 이 문서가 왜 다르게 계산됐는지
       모르면 값을 의심하고 손으로 되돌려 버린다.
     ⚠ **판정도 인원도 추출기가 한다.** 여기서 다시 세면 감사기와 어긋난다(결함 생성기 ①). */
  function renderPdfCrews(box, data) {
    const c = data && data.crews;
    if (!c || !c.split) return;
    const wrap = document.createElement('div');
    /* ⚠ 배경은 바깥 상자를 물려받는다 — 여기서 색을 깔면 그 위 글자의 대비를 알 수 없다 */
    wrap.style.cssText = 'margin-top:.6rem;padding:.55rem .75rem;border:1.5px solid var(--border)';
    const head = document.createElement('div');
    head.style.cssText = 'font-size:.78rem;line-height:1.7;font-weight:700';
    head.textContent = '⛳ 이 견적서는 관광조와 골프조로 나뉩니다'
      + (c.tourSize ? ` — 관광조 ${c.tourSize}명` : '')
      + (c.golfSize ? ` · 골프조 ${c.golfSize}명` : '');
    wrap.appendChild(head);

    const note = document.createElement('div');
    note.style.cssText = 'font-size:.72rem;line-height:1.7;color:var(--muted);margin-top:.2rem';
    const bits = [];
    bits.push(`문서가 「관광조」·「골프조」라고 적어 둔 줄이 <strong>${c.tourRows + c.golfRows}개</strong>입니다`
      + ` (관광조 ${c.tourRows} · 골프조 ${c.golfRows}).`);
    bits.push('식비·관광비는 <strong>그 줄이 대상으로 한 인원</strong>으로 나눴습니다 — 한 조만의 비용을'
      + ' 전원으로 나누면 1인당이 어긋나기 때문입니다. 각 칸의 계산식에 분모가 적혀 있습니다.');
    if (c.golfOnlyCost) {
      bits.push(`골프조 전용 <strong>${Number(c.golfOnlyCost).toLocaleString()}원</strong>은 요율 값에서 뺐습니다`
        + ' — 요율표는 일반 연수 기준입니다. (줄은 아래 후보 목록에 그대로 있습니다.)');
    }
    if (!c.tourSize && c.tourRows) {
      bits.push('⚠ 관광조 인원이 줄마다 달라 <strong>하나로 말하지 않았습니다</strong> — 줄별로 나눴습니다.');
    }
    bits.push('⚠ 차량·가이드 <strong>단가는 조로 나누지 않습니다</strong>'
      + ' — 「대당 1일」 단가라 어느 조가 탔든 그 지역 단가입니다.');
    note.innerHTML = bits.join('<br>');
    wrap.appendChild(note);
    box.appendChild(wrap);
  }

  /* ════ 견적서에서 읽은 일정표 (SS·ST) ═══════════════════════════════════════
     ⚠ **금액과 무관한 구역이다.** 여기 값이 요율로 들어가는 경로는 없다 — 문서의 글을
     그대로 옮기는 것이고, 최종 결정은 언제나 일정 관리 화면에서 사람이 한다.

     ⚠ **시간대를 지어내지 않는다.** 문서에 시각도 끼니 구분도 없는 날은 추출기가
     나누지 않고 넘긴다(split:'none'). 그런 날은 줄을 **오전 칸에 모아** 보내되,
     몇 날이 그런지 화면이 반드시 말한다 — 조용히 오전에 넣으면 담당자는 문서가
     원래 그런 줄 알고 지나간다(결함 생성기 ②). */
  /* UL: 변환 규칙은 rec_fallbacks.js의 recItinToCourse 한 곳으로 옮겼다.
     견적서 모음을 일괄로 심는 도구(ai-loop/seed_courses_from_corpus.js)가 **같은
     변환**을 해야 하는데 node에서 이 파일을 부를 수 없어서다. 두 벌이 되면 화면으로
     넣은 코스와 일괄로 심은 코스가 서로 다른 모양이 된다(결함 생성기 ①).
     ⚠ 빈 일정일 때의 자리 채움만 화면 쪽 규칙(itiEmptyDay)을 유지한다. */
  function prItinToCourse(itin, destKey) {
    const course = recItinToCourse(itin, destKey);
    if (!(itin.days || []).length) course.days = [itiEmptyDay()];
    return course;
  }

  /* TF: 「여러 도시를 도는 견적서인가」 — **판정은 추출기가 한다**(pdf_extract의
     MULTI_CITY_STAYS). 여기서 다시 세면 감사기와 어긋난다(결함 생성기 ①).
     제출 시점에도 같은 값을 봐야 하므로 마지막 추출 결과를 들고 있는다. */
  let PR_LAST_ITIN = null;

  function renderPdfItinerary(box, data) {
    const itin = data && data.itinerary;
    if (!itin || !Array.isArray(itin.days) || !itin.days.length) return;

    const wrap = document.createElement('div');
    /* ⚠ 배경은 바깥 상자(var(--bg))를 그대로 물려받는다. 여기서 다른 색을 깔면
       그 위의 var(--muted) 글자가 어느 테마에서 안 읽히는지 알 수 없다
       (같은 유형 사고가 세 번 났다 — check_contrast.py가 그래서 생겼다). */
    wrap.style.cssText = 'margin-top:.6rem;padding:.55rem .75rem;border:1.5px solid var(--border)';

    const unsplit = Number(itin.unsplitDays) || 0;
    const head = document.createElement('div');
    head.style.cssText = 'font-size:.78rem;line-height:1.7;font-weight:700';
    head.textContent = `📅 이 견적서에 일정표가 있습니다 — ${itin.days.length}일`;
    wrap.appendChild(head);

    const note = document.createElement('div');
    note.style.cssText = 'font-size:.72rem;line-height:1.7;color:var(--muted);margin-top:.2rem';
    const bits = [];
    if (unsplit) bits.push(`⚠ ${unsplit}일은 문서에 시각·끼니 구분이 없어 <strong>시간대를 나누지 않았습니다</strong> — 그 날은 줄을 오전 칸에 모아 두니 나눠 주세요.`);
    if (itin.repeated) bits.push('⚠ 같은 일정표가 <strong>두 벌</strong> 실려 있어 앞엣것만 읽었습니다.');
    if (itin.mealMissing) bits.push('⚠ 문서에 식사 열이 있다고 돼 있는데 「조:」꼴 칸을 찾지 못했습니다.');
    bits.push('문서의 글을 그대로 옮긴 것이라 <strong>금액에는 영향이 없습니다.</strong>');
    note.innerHTML = bits.join('<br>');
    wrap.appendChild(note);

    /* TF: 여러 도시를 도는 견적서 — **금액에 영향이 있다.** 위 안내(“금액에는 영향이
       없습니다”)는 일정 글에 대한 말이고, 이건 실측 값이 어느 도시 것이냐의 문제라
       따로 세워 눈에 걸리게 한다. 실측 사고 id 17(KT CES)이 여기서 안 걸렸다. */
    if (itin.multiCity && Array.isArray(itin.stays)) {
      const warn = document.createElement('div');
      warn.style.cssText = 'font-size:.74rem;line-height:1.7;margin-top:.45rem;padding:.45rem .6rem;'
        + 'border:1.5px solid var(--danger);color:var(--danger);font-weight:700';
      warn.innerHTML = `🏨 이 일정은 <strong>${itin.stays.length}곳</strong>에서 묵습니다 — 한 도시 견적이 아닐 수 있습니다.`
        + '<div style="font-weight:400;margin-top:.25rem">' + itin.stays.map(esc).join(' · ') + '</div>'
        + '<div style="font-weight:400;margin-top:.25rem">추출된 호텔·차량·가이드가 <strong>고른 목적지가 아닌 다른 도시</strong>의 값일 수 있습니다.'
        + ' 근거 줄의 항목 이름을 확인해 주세요.</div>';
      wrap.appendChild(warn);
    }

    /* 날짜별 미리보기 — 접어 둔다(하루 카드가 길어 목록이 화면을 밀어낸다) */
    const det = document.createElement('details');
    det.style.cssText = 'margin-top:.4rem';
    const sum = document.createElement('summary');
    sum.style.cssText = 'font-size:.74rem;cursor:pointer';
    sum.textContent = '읽은 일정 보기';
    det.appendChild(sum);
    itin.days.forEach((d) => {
      const p = document.createElement('div');
      p.style.cssText = 'font-size:.72rem;line-height:1.65;margin-top:.35rem;padding-left:.5rem;border-left:2px solid var(--border)';
      const parts = [];
      if (d.am) parts.push('<strong>오전</strong> ' + esc(d.am));
      if (d.pm) parts.push('<strong>오후</strong> ' + esc(d.pm));
      if (d.eve) parts.push('<strong>저녁</strong> ' + esc(d.eve));
      if (!parts.length) parts.push('<span style="color:var(--muted)">시간대 미분류</span> ' + esc((d.lines || []).join(' / ')));
      const meals = d.meals && [d.meals.b && '조: ' + d.meals.b, d.meals.l && '중: ' + d.meals.l,
        d.meals.d && '석: ' + d.meals.d].filter(Boolean).join(' / ');
      p.innerHTML = `<strong>DAY ${Number(d.day)}</strong>${d.date ? ' · ' + esc(d.date) : ''}`
        + `${d.place ? ' · ' + esc(d.place) : ''}<br>` + parts.join('<br>')
        + (meals ? '<br><span style="color:var(--muted)">식사 ' + esc(meals) + '</span>' : '')
        + (d.hotel ? '<br><span style="color:var(--muted)">숙박 ' + esc(d.hotel) + '</span>' : '');
      det.appendChild(p);
    });
    wrap.appendChild(det);

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-act btn-primary';
    btn.style.cssText = 'margin-top:.5rem';
    btn.textContent = '📅 일정 관리로 보내기';
    btn.addEventListener('click', () => {
      const destKey = (document.getElementById('pr-dest') || {}).value || '';
      if (!destKey) { alert('먼저 위에서 목적지를 골라 주세요 — 어느 목적지의 일정으로 넣을지 알아야 합니다.'); return; }
      prSendItinerary(destKey, itin);
    });
    wrap.appendChild(btn);

    const btnNote = document.createElement('div');
    btnNote.style.cssText = 'font-size:.71rem;color:var(--muted);margin-top:.25rem';
    btnNote.textContent = '새 코스로 넣기만 합니다 — 기존 코스는 건드리지 않고, 일정 관리에서 저장을 눌러야 반영됩니다.';
    wrap.appendChild(btnNote);

    box.appendChild(wrap);
  }

  /* 일정 관리 화면으로 옮겨 새 코스로 넣는다.
     ⚠ **저장하지 않는다.** 담당자가 눈으로 보고 저장을 눌러야 고객에게 나간다 —
     견적서에서 읽은 글이 검토 없이 고객 화면에 뜨면 안 된다.
     ⚠ 탭을 바꾸면 renderItineraries()가 비동기로 다시 그린다. 기다리지 않고 코스를
     밀어 넣으면 그 결과가 덮여 **아무 일도 안 일어난 것처럼** 보인다. */
  async function prSendItinerary(destKey, itin) {
    switchTab('itineraries');
    await renderItineraries();
    const sel = document.getElementById('iti-dest');
    if (sel) sel.value = destKey;
    itiSelectDest(destKey);
    if (itiState.destKey !== destKey) return;   /* 저장 안 한 수정이 있어 사용자가 취소했다 */

    if (itiState.courses.length >= ITI_MAX_COURSES) {
      itiSetMsg('코스는 최대 ' + ITI_MAX_COURSES + '개입니다. 쓰지 않는 코스를 지운 뒤 다시 보내 주세요.', 'err');
      return;
    }
    const course = prItinToCourse(itin, destKey);
    itiState.courses.push(course);
    itiView.courseIdx = itiState.courses.length - 1;
    itiMarkDirty();
    itiRenderBody();
    itiAutoGrowAll();

    const unsplit = Number(itin.unsplitDays) || 0;
    itiSetMsg('견적서에서 읽은 일정을 코스 ' + String.fromCharCode(65 + itiState.courses.length - 1)
      + '로 넣었습니다(' + itin.days.length + '일).'
      + (unsplit ? ' ⚠ ' + unsplit + '일은 문서에 시간대 구분이 없어 오전 칸에 모아 두었습니다 — 오후·저녁으로 나눠 주세요.' : '')
      + ' 제목·요약·핵심 포인트는 비어 있습니다(지어내지 않았습니다).'
      + ' ⭐ 저장하면 **이 목적지의 고객 추천 일정이 이 견적서 일정으로 바뀝니다**'
      + '(온라인 자료로 만든 코스는 남아 있지만 화면에는 안 나갑니다).',
      unsplit ? 'err' : 'ok');
  }

  /* 다른 견적으로 갈아 끼운다 (RZ 후속).
     서버가 블록마다 **전체 결과**를 함께 내려주므로 PDF를 다시 올리지 않아도 된다
     (수백 건을 넣는 자리에서 재업로드는 치명적이다). */
  function selectQuoteBlock(data, idx) {
    const b = (data.blocks || []).find((x) => x.idx === idx);
    if (!b) return;
    const merged = Object.assign({}, data, {
      values: b.values, evidence: b.evidence, candidates: b.candidates,
      reconciliation: b.reconciliation, rowCount: (b.candidates || []).length,
      pax: b.pax, dates: b.dates, kind: b.kind || data.kind,
      mealDays: (b.evidence && b.evidence.meal && b.evidence.meal.dayCount) || null,
      grandTotal: b.total, perPerson: b.perPerson,
      /* 고른 줄 번호를 다시 만든다 — 블록마다 후보 번호가 따로 매겨져 있다 */
      picked: (() => {
        const pk = {};
        Object.keys(b.evidence || {}).forEach((k) => {
          const e = b.evidence[k];
          if (e && typeof e.rowIdx === 'number') pk[k] = e.rowIdx;
        });
        if (b.evidence && b.evidence.meal && Array.isArray(b.evidence.meal.rowIdxs)) pk.mealRows = b.evidence.meal.rowIdxs;
        return pk;
      })(),
      blocks: (data.blocks || []).map((x) => Object.assign({}, x, { selected: x.idx === idx })),
      selectedBlock: idx,
    });
    Object.keys(PR_VALUE_TO_INPUT).forEach((k) => {
      const el = document.getElementById(PR_VALUE_TO_INPUT[k]);
      if (el) el.value = (merged.values || {})[k] == null ? '' : merged.values[k];
    });
    applyPdfDates(merged.dates);
    renderPdfEvidence(merged);
    const msg = document.getElementById('pr-msg');
    if (msg) {
      msg.style.color = 'var(--primary)';
      msg.textContent = `${(b.dates && b.dates.departDate) || ''} 출발 견적으로 바꿨습니다 — 값을 다시 확인해 주세요.`;
    }
  }

  function renderPdfEvidence(data) {
    clearPdfEvidence();
    /* SV: 이번 추출의 근거를 기억해 둔다 — 「전 일정 총액인가」 판단에 추출기가 남긴
       duration(수량·횟수가 기간을 설명하는가)이 필요하다. */
    PR_LAST_EVIDENCE = data.evidence || null;
    /* TF: 제출 직전에도 「여러 도시인가」를 물어야 한다. 화면 경고만으로는 지나간다 —
       실제로 id 17은 칸쿤 호텔명이 화면에 그대로 떠 있는 채로 제출됐다. */
    PR_LAST_ITIN = data.itinerary || null;
    const cands = Array.isArray(data.candidates) ? data.candidates : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];

    PR_EVIDENCE_FIELDS.forEach((f) => {
      const input = document.getElementById(f.input);
      if (!input) return;
      const box = document.createElement('div');
      box.className = 'pr-ev';
      box.id = 'pr-ev-' + f.key;

      const ev = (data.evidence || {})[f.key];
      /* ── 타당성 검토 (SO) — **올리는 견적서마다** 그 자리에서 한다 ──────────
         감사기(ai-loop/audit_extract_sanity.js)는 코퍼스를 한 번에 훑는 개발 도구라
         담당자가 한 장 올릴 때는 아무 판정도 하지 않았다. 사장님 지시로 화면에서도
         같이 돈다. ⚠ 잣대는 `plausibility.js` **한 곳**에서 온다(감사기와 같은 파일).
         ⚠ 기준은 **그 목적지 것**만 쓴다 — 지역을 섞으면 비싼 지역이 통째로 이상값이 된다.
         ⚠ 기존 실측은 **오늘 환율로 되돌려서** 견준다(SG) — 안 그러면 환율 차이가
            그대로 '이상하다'로 둔갑한다. */
      const plaus = judgePdfValue(f.key, input.value, ev);
      if (plaus && plaus.level === 'check') box.classList.add('via-check');
      /* 환산된 칸이면 그 환율과 **추출 당시의 값**을 함께 기억한다(SG) */
      if (ev && ev.fx && ev.fx.currency && ev.fx.rate > 0) {
        PR_FX_BY_FIELD[f.key] = { currency: ev.fx.currency, rate: ev.fx.rate, value: input.value };
      }
      /* 출처를 배지와 왼쪽 색 띠 양쪽에 표시한다 — 배지는 훑을 때, 띠는 어느 근거가
         어느 칸에 속하는지 볼 때 쓰인다. */
      const via = ev ? (ev.via || 'rule') : 'none';
      box.classList.add('via-' + via);
      setFieldBadge(f.input, via);

      /* 한 줄에 다 쓰지 않는다 (RZ 후속, 사장님 지시). 세 줄로 나눈다:
           ① 무엇에서 왔는가 — 견적서의 항목 이름
           ② 어떻게 나온 값인가 — 계산식(고정폭이라 숫자가 읽힌다)
           ③ 꼭 알아야 할 것 — 골프 제외 같은 판단 근거 */
      const src = document.createElement('div');
      src.className = 'pr-ev-src';
      /* 브랜드명뿐인 줄(「메트로폴리탄 이케부쿠로」)은 라벨만 보면 왜 호텔로 잡혔는지
         알 수 없다 — 표의 구분 열에서 온 분류라고 밝힌다(SE). */
      /* 환산된 값이면 **어느 환율로 바꾼 것인지** 그 자리에 적는다(SG) — 담당자가
         「이 금액은 그때 환율 기준」이라는 걸 알아야 요율에 넣을 때 판단이 선다. */
      const fxNote = ev && ev.fx && ev.fx.rate
        ? ` · ${ev.fx.currency} 1 = ${Number(ev.fx.rate).toLocaleString()}원으로 환산${ev.fx.partial ? '(일부)' : ''}`
        : '';
      src.textContent = ev
        ? (ev.label || PR_VIA[via].text) + (ev.categoryFrom === 'group' ? ' · 표의 구분 열' : '') + fxNote
        : '이 항목을 찾지 못했습니다 — 아래에서 골라 주세요';
      if (ev) src.title = ev.line || '';
      box.appendChild(src);

      if (ev && ev.calc) {
        const calc = document.createElement('div');
        calc.className = 'pr-ev-calc';
        calc.textContent = ev.calc;
        box.appendChild(calc);
      }
      if (ev && ev.note) {
        const note = document.createElement('div');
        note.className = 'pr-ev-note';
        note.textContent = '⚠ ' + ev.note;
        box.appendChild(note);
      }
      /* 타당성 한 줄 — 문구는 plausibility.js가 만든다(화면마다 다시 짓지 않는다) */
      if (plaus && plaus.level === 'check') {
        const warn = document.createElement('div');
        warn.className = 'pr-ev-note pr-ev-plaus';
        warn.textContent = '🔍 ' + PLAUSIBILITY.describe(plaus, f.label);
        box.appendChild(warn);
      }

      /* ── SV: 「전 일정 총액이 1일 단가 자리에 왔는가」 ─────────────────────
         실측(신한 이태리): 「차량 8,848,000 × 3대 × 1」은 **검산을 통과**하지만
         8,848,000은 하루치가 아니라 버스 한 대의 **전 일정(6일) 총액**이다.
         6으로 나누면 1,474,667 — 요율표 1,400,000과 ±5%로 맞는다.
         ⚠ 이건 위의 **동료 비교로는 못 잡는다.** 그 지역 첫 견적서면 동료가 없어
           조용히 통과하고 **그 값이 그대로 기준선이 된다.** 구멍이 정확히 거기였다.
         ⚠ **자동으로 고치지 않는다.** 나눗셈이 틀리는 경우가 실제로 있었다(몫이 개수가
           아니라 환율이었던 사고) — 버튼을 만들어 **사람이 누른다.** */
      const trip = judgeTripTotalValue(f.key, input.value);
      if (trip) {
        box.classList.add('via-check');
        const wrap = document.createElement('div');
        wrap.className = 'pr-ev-note pr-ev-plaus';
        const line = document.createElement('div');
        line.textContent = '📏 ' + PLAUSIBILITY.describeTripTotal(trip, f.label).replace(/\*\*/g, '');
        wrap.appendChild(line);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn-act btn-outline-p';
        btn.style.cssText = 'margin-top:.25rem;padding:.15rem .5rem;font-size:.72rem';
        btn.textContent = `${trip.days}일로 나누기 → ${Math.round(trip.perDay).toLocaleString()}원`;
        btn.addEventListener('click', () => {
          const before = Number(String(input.value).replace(/[^\d.-]/g, ''));
          input.value = String(Math.round(trip.perDay));
          /* 무엇을 어떻게 바꿨는지 **그 자리에 남긴다** — 나중에 「이 값 어디서 나왔지」가 없게 */
          showManual(`${f.label} — 전 일정 총액을 ${trip.days}일로 나눴습니다 (담당자 확인)`,
            `${before.toLocaleString()} ÷ ${trip.days}일 = ${Math.round(trip.perDay).toLocaleString()} (1일 단가)`);
          wrap.remove();
        });
        wrap.appendChild(btn);
        box.appendChild(wrap);
      }
      /* ── SW: 담당자가 **직접 타이핑**해도 화면이 따라온다 ─────────────────
         ⚠ 예전에는 후보 목록으로 고를 때만 배지가 바뀌었다. 숫자를 그냥 치면 화면은
           「견적서」라고 적힌 채 옛 계산식을 계속 보여줬다 — 화면이 거짓말을 하는 상태다.
         ⚠ **타당성 검토를 새 값으로 다시 돌린다.** 안 그러면 오타(4,200,000)를 잡던
           방어가 담당자가 손댄 순간 사라진다. */
      /* ⚠ 원래값은 **추출 결과**에서 읽는다. 입력칸에서 읽으면 그리는 순서에 따라
         비어 있을 수 있고, 그러면 되돌리기가 조용히 사라진다(테스트에서 실제로 걸렸다). */
      const origValue = (data.values && data.values[f.key] != null)
        ? String(data.values[f.key]) : String(input.value || '');
      const confirmField = (how) => {
        PR_MANUAL_FIELDS[f.key] = { how: how || '담당자가 직접 넣은 값' };
        box.className = 'pr-ev via-confirmed';
        box.id = 'pr-ev-' + f.key;
        setFieldBadge(f.input, 'confirmed');
        src.textContent = how || '담당자가 견적서를 보고 직접 넣은 값입니다';
        /* ⚠ **옛 계산식을 반드시 지운다.** 안 지우면 값은 담당자 것인데 근거는 추출값의
           식이 남아 화면이 거짓말을 한다 — 이 커밋이 없애려던 바로 그 상태다. */
        const oldCalc = box.querySelector('.pr-ev-calc');
        if (oldCalc) oldCalc.remove();
        const oldNote = box.querySelector('.pr-ev-note:not(.pr-ev-plaus):not(.pr-ev-revert)');
        if (oldNote && /^⚠/.test(oldNote.textContent)) oldNote.remove();
        /* 원래 추출값을 남긴다 — 되돌릴 수 있어야 손대는 것이 무섭지 않다 */
        let back = box.querySelector('.pr-ev-revert');
        if (!back && origValue !== '') {
          back = document.createElement('div');
          back.className = 'pr-ev-note pr-ev-revert';
          const t = document.createElement('span');
          t.textContent = `추출값은 ${Number(origValue).toLocaleString()}원이었습니다 · `;
          const a = document.createElement('button');
          a.type = 'button'; a.className = 'btn-detail';
          a.style.cssText = 'padding:.05rem .35rem;font-size:.7rem';
          a.textContent = '되돌리기';
          a.addEventListener('click', () => { input.value = origValue; renderPdfEvidence(data); });
          back.appendChild(t); back.appendChild(a);
          box.appendChild(back);
        }
        /* 확정한 값도 **한 번은** 타당성을 본다 — 오타를 확정으로 굳히지 않게 */
        const old = box.querySelector('.pr-ev-plaus');
        if (old) old.remove();
        const re = judgePdfValue(f.key, input.value, ev);
        if (re && re.level === 'check') {
          const w = document.createElement('div');
          w.className = 'pr-ev-note pr-ev-plaus';
          w.textContent = '🔍 ' + PLAUSIBILITY.describe(re, f.label) + ' (확정하신 값입니다 — 맞으면 그대로 두세요)';
          box.appendChild(w);
        }
      };
      /* 값이 실제로 **달라졌을 때만** 확정으로 본다 — 칸을 눌렀다 뗀 것은 확정이 아니다.
         ⚠ **칸을 비운 것도 확정이 아니다.** 지운 칸에 「담당자 확정 ✓」이 붙으면
           없는 값에 근거가 달린다. 확정 기록도 함께 지운다.
         ⚠ 숫자로 견준다 — 「700000」과 「0700000」이 다른 값으로 잡히면 안 된다. */
      input.addEventListener('change', () => {
        if (String(input.value).trim() === '') { delete PR_MANUAL_FIELDS[f.key]; return; }
        if (origValue !== '' && Number(input.value) === Number(origValue)) return;
        confirmField();
      });

      /* ── SW: 식비·관광비 계산 도우미 ─────────────────────────────────────
         이 둘은 「1인 1일」·「1인 전 일정」 값인데 **견적서에는 총액만 있다.**
         화면이 `총액 ÷ 인원 ÷ 일수` 식을 보여주기만 해서, 담당자가 일수가 틀린 것을
         알아채도 **암산해서 결과만** 쳐야 했다. 세 칸을 열어 준다 —
         추출값으로 미리 채워 두므로 보통 **일수 한 칸만** 고치면 된다. */
      if ((f.key === 'meal' || f.key === 'sight') && ev) {
        const helper = document.createElement('div');
        helper.className = 'pr-ev-note';
        helper.style.cssText = 'display:flex;gap:.3rem;align-items:center;flex-wrap:wrap;margin-top:.25rem';
        const num = (ph, val) => {
          const i = document.createElement('input');
          i.type = 'number'; i.className = 'pw-input'; i.placeholder = ph;
          i.style.cssText = 'max-width:96px;padding:.15rem .3rem;font-size:.72rem';
          if (val != null) i.value = String(val);
          return i;
        };
        const total = num('총액', null);
        const pax = num('인원', data.pax || null);
        const days = num('일수', f.key === 'meal' ? (ev.dayCount || null) : null);
        const lab = document.createElement('span');
        lab.style.cssText = 'font-size:.71rem;font-weight:700';
        lab.textContent = f.key === 'meal' ? '계산: 총액 ÷ 인원 ÷ 일수 =' : '계산: 총액 ÷ 인원 =';
        const go = document.createElement('button');
        go.type = 'button'; go.className = 'btn-act btn-outline-p';
        go.style.cssText = 'padding:.12rem .45rem;font-size:.72rem';
        go.textContent = '넣기';
        go.addEventListener('click', () => {
          const t = Number(total.value); const p = Number(pax.value);
          const d = f.key === 'meal' ? Number(days.value) : 1;
          if (!(t > 0) || !(p > 0) || !(d > 0)) { alert('총액·인원' + (f.key === 'meal' ? '·일수' : '') + '을 넣어 주세요.'); return; }
          const v = Math.round(t / p / d);
          input.value = String(v);
          /* **어떻게 나온 값인지 그대로 저장한다** — 비워 두면 나중에 근거를 잃는다 */
          confirmField(f.key === 'meal'
            ? `담당자 계산 · 총액 ${t.toLocaleString()} ÷ 인원 ${p} ÷ ${d}일 = ${v.toLocaleString()} (1인 1일)`
            : `담당자 계산 · 총액 ${t.toLocaleString()} ÷ 인원 ${p} = ${v.toLocaleString()} (1인당 전 일정)`);
        });
        helper.appendChild(lab); helper.appendChild(total);
        helper.appendChild(pax);
        if (f.key === 'meal') helper.appendChild(days);
        helper.appendChild(go);
        box.appendChild(helper);
      }

      /* 값을 바꿀 때마다 배지와 근거를 함께 갱신하는 도우미 —
         화면에는 '견적서'라고 적혀 있는데 값은 사람이 바꾼 것, 같은 상태를 막는다. */
      const showManual = (title, calcText) => {
        box.className = 'pr-ev via-manual';
        box.id = 'pr-ev-' + f.key;
        setFieldBadge(f.input, 'manual');
        src.textContent = title;
        const c = box.querySelector('.pr-ev-calc');
        if (calcText) {
          if (c) c.textContent = calcText;
          else { const n = document.createElement('div'); n.className = 'pr-ev-calc'; n.textContent = calcText; src.insertAdjacentElement('afterend', n); }
        } else if (c) c.remove();
      };

      /* RZ: 식사는 분류된 '식사' 줄만 체크박스로 보여준다 — 후보 40개를 다 늘어놓으면
         무엇을 체크할지 매번 판단해야 한다. 분류가 없으면(예비 경로) 전체를 보여준다. */
      const mealCands = cands.filter((c) => c.category === 'meal');
      if (f.key === 'meal' && !groups.length) {
        box.appendChild(wrapPicker(`식사 줄 고르기 (${(mealCands.length ? mealCands : cands).length}개)`,
          buildMealChecks(mealCands.length ? mealCands : cands, data, input, showManual), !ev));
      } else if (f.key === 'meal' && groups.length) {
        /* ⚠ 식사는 **묶음으로 고른다** (RP). 요율의 식비는 '1인 1일'이라 중식+석식을
           더해야 하는데, 후보 15개를 매번 판단하는 건 수백 건을 넣는 자리에서 너무 무겁다.
           견적서의 **소계 줄**로 묶으면 "식사 묶음" 하나를 고르는 일이 되고,
           고른 묶음의 총액이 소계와 맞으므로 **빠진 줄이 없다는 것까지 산수로 확인**된다. */
        const sel = document.createElement('select');
        sel.className = 'pr-ev-pick';
        const none = document.createElement('option');
        none.value = ''; none.textContent = '— 고르지 않음 —';
        sel.appendChild(none);
        groups.forEach((g) => {
          const o = document.createElement('option');
          o.value = String(g.idx);
          /* ⚠ 힌트를 함께 적는다 — 이게 담당자의 판단 근거다. 금액만 보여주면
             "1인 940,500원"이 식사인지 차량인지 알 수 없다. 수량 패턴은 코드가
             결정적으로 판별하므로(수량 1 = 전체 단위 등) 여기 그대로 노출한다. */
          o.textContent = `1인 ${g.unitSum.toLocaleString()}원 · ${g.rowIdxs.length}줄`
            + (g.hint ? '  — ' + g.hint : '');
          o.title = (g.lines || []).join('\n') + '\n소계 ' + g.subtotal.toLocaleString();
          sel.appendChild(o);
        });
        const pickedG = (data.picked || {}).mealGroup;
        sel.value = (pickedG === 0 || pickedG) ? String(pickedG) : '';
        const applyGroup = () => {
          const g = groups.find((x) => String(x.idx) === sel.value);
          input.value = g ? g.unitSum : '';
          src.textContent = g
            ? '✅ 소계 ' + g.subtotal.toLocaleString() + '원과 일치 — '
              + g.rowIdxs.length + '줄 합계 ' + g.unitSum.toLocaleString() + '원 (1인 1일)'
            : '📄 고르지 않음';
          if (g) src.title = (g.lines || []).join('\n');
        };
        sel.addEventListener('change', applyGroup);
        box.appendChild(sel);
        /* 묶음이 안 맞는 견적서를 위해 줄 단위 체크도 접어서 남겨 둔다 */
        const det = document.createElement('details');
        det.className = 'pr-ev-more';
        const sum = document.createElement('summary');
        sum.textContent = '묶음이 안 맞으면 — 줄을 직접 고르기';
        det.appendChild(sum);
        det.appendChild(buildMealChecks(cands, data, input, showManual));
        box.appendChild(det);
      } else if (f.key === 'meal' && cands.length) {
        box.appendChild(wrapPicker(`식사 줄 고르기 (${cands.length}개)`,
          buildMealChecks(cands, data, input, showManual), !ev));
      } else if (cands.length) {
        const sel = document.createElement('select');
        sel.className = 'pr-ev-pick';
        const none = document.createElement('option');
        none.value = ''; none.textContent = '— 고르지 않음 —';
        sel.appendChild(none);
        /* ⚠ 관광비·판매가처럼 **한 줄이 아니라 계산으로 나온 값**은 고를 줄 번호가 없다.
           그런데 목록이 '고르지 않음'에 멈춰 있으면 값이 채워져 있는데도 "아무것도 안
           골랐다"로 읽힌다(2026-08-06 사장님 화면에서 그렇게 보였다). 그 경우
           **계산 결과를 목록의 첫 항목으로** 넣어 지금 무엇이 들어 있는지 보이게 한다. */
        const evPicked = (data.picked || {})[f.key];
        /* ⚠ 입력칸 값이 아니라 **서버가 준 값**을 본다. 입력칸을 읽으면 "채우기 → 그리기"
           순서에 매달리게 되고, 순서가 바뀌면 조용히 안 나온다(테스트에서 실제로 걸렸다). */
        const serverVal = (data.values || {})[f.key];
        const computed = (ev && evPicked == null && serverVal != null && serverVal !== '')
          ? String(serverVal) : null;
        if (computed) {
          const o = document.createElement('option');
          o.value = '__calc__';
          o.textContent = `▣ 계산으로 나온 값 — ${Number(computed).toLocaleString()}원`;
          o.title = ev.calc || '';
          sel.appendChild(o);
        }
        /* 그 항목으로 분류된 줄을 먼저 보여주고, 나머지는 뒤에 붙인다 (RZ) —
           40개를 그냥 늘어놓으면 고를 수가 없다. 분류가 틀렸을 수 있으니 숨기지는 않는다. */
        const mine = cands.filter((c) => c.category === f.key);
        const rest = cands.filter((c) => c.category !== f.key);
        const addOpt = (c, prefix) => {
          const o = document.createElement('option');
          o.value = String(c.idx);
          o.textContent = (prefix || '') + prCandLabel(c);
          o.title = c.line;
          sel.appendChild(o);
        };
        mine.forEach((c) => addOpt(c, '● '));
        if (mine.length && rest.length) {
          const sep = document.createElement('option');
          sep.disabled = true; sep.textContent = '─── 다른 항목으로 분류된 줄 ───';
          sel.appendChild(sep);
        }
        rest.forEach((c) => addOpt(c, ''));
        const picked = (data.picked || {})[f.key];
        sel.value = (picked === 0 || picked) ? String(picked) : (computed ? '__calc__' : '');
        sel.addEventListener('change', () => {
          if (sel.value === '__calc__') {
            /* 계산 결과로 되돌린다 — 줄을 하나 골랐다가 무르고 싶을 때가 있다 */
            input.value = computed;
            box.className = 'pr-ev via-' + via;
            box.id = 'pr-ev-' + f.key;
            setFieldBadge(f.input, via);
            src.textContent = ev.label || PR_VIA[via].text;
            const c0 = box.querySelector('.pr-ev-calc');
            if (c0) c0.textContent = ev.calc || '';
            return;
          }
          const c = cands.find((x) => String(x.idx) === sel.value);
          input.value = c ? c.unit : '';
          if (c) {
            showManual(c.label || '직접 고른 줄', prCandLabel(c));
            src.title = c.line;
          } else {
            showManual('고르지 않았습니다', '');
          }
        });
        box.appendChild(wrapPicker(`다른 줄로 바꾸기 (${cands.length}개)`, sel, !ev));
      }
      input.insertAdjacentElement('afterend', box);
    });

    /* 호텔명은 숫자가 아니라 고를 후보가 없다 — 배지만 붙인다.
       배지가 빠지면 그 칸만 출처를 알 수 없어 "왜 이건 표시가 없지?"가 된다. */
    const nameEv = (data.evidence || {}).hotelName;
    setFieldBadge('pr-hotel-name', nameEv ? (nameEv.via || 'rule') : 'none');

    renderPdfSummary(data);

    const ws = Array.isArray(data.warnings) ? data.warnings : [];
    if (ws.length) {
      const w = document.createElement('div');
      w.id = 'pr-warnings';
      w.className = 'pr-warn';
      ws.forEach((t) => {
        const p = document.createElement('p');
        p.textContent = '⚠ ' + t;
        w.appendChild(p);
      });
      const anchor = document.getElementById('pr-msg');
      if (anchor) anchor.insertAdjacentElement('beforebegin', w);
    }
  }

  function setPriceReportMode(mode) {
    if (mode !== 'manual' && mode !== 'pdf') return;
    if (mode !== priceReportMode) {
      /* 방식 전환 시에만 입력값·PDF파일·메시지 초기화.
         ⚠ **가격 칸만** 비운다 — 공통 칸(출발일·견적작성일·박수)은 방식과 무관하다.
           함께 지우면 먼저 넣어 둔 날짜가 사라져 새로고침된 것처럼 보인다. */
      PR_PRICE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const pdfInput = document.getElementById('pr-pdf'); if (pdfInput) pdfInput.value = '';
      const msg = document.getElementById('pr-msg'); if (msg) msg.textContent = '';
    }
    priceReportMode = mode;
    /* 고른 것을 낭독기에도 알린다 — 색만으로는 어느 쪽이 골라졌는지 안 들린다 */
    const pdfBtn = document.getElementById('pr-mode-pdf');
    const manBtn = document.getElementById('pr-mode-manual');
    if (pdfBtn) pdfBtn.setAttribute('aria-pressed', String(mode === 'pdf'));
    if (manBtn) manBtn.setAttribute('aria-pressed', String(mode === 'manual'));
    applyPriceReportModeUI();
  }

  /* PDF에서 항공료·호텔단가·호텔명·식비 추출 시도 — 결과는 찾은 항목만 입력창에
     채워 넣고 저장은 안 함(사람이 확인 후 "제출"을 눌러야 실제 반영됨). 텍스트
     없는 스캔 PDF나 AI 미설정 등 실패 사유별로 알아보기 쉬운 안내를 보여준다. */
  async function extractPdfDetails(opts) {
    const fileInput = document.getElementById('pr-pdf');
    const msg = document.getElementById('pr-msg');
    const file = fileInput.files && fileInput.files[0];
    /* 환율을 넣고 '다시 읽기'를 누른 경우 — 파일을 다시 고르게 하지 않는다.
       앞서 읽어 둔 base64를 그대로 쓴다(수백 건을 넣는 자리에서 재선택은 치명적이다). */
    const reusing = !!(opts && opts.fxRate && prLastPdfBase64);
    if (!file && !reusing) { msg.style.color = 'var(--danger)'; msg.textContent = 'PDF 파일을 먼저 선택해 주세요.'; return; }
    if (reusing) return runPdfExtract(prLastPdfBase64, opts.fxRate);
    /* ⚠ 한도가 3.2MB인 이유 (RN): 파일을 base64로 바꿔 보내면 크기가 **1.33배**로 불어난다.
       Vercel 서버리스 함수의 요청 본문 한도는 4.5MB라, 예전 기준(4MB)이면 5.3MB가 되어
       **화면 검사는 통과하고 서버에는 닿지 못한다.** 그때 뜨는 말이 "요청에 실패했습니다"라
       담당자는 네트워크를 의심하게 된다. 3.2MB면 base64로도 4.3MB라 한도 안이다. */
    const PDF_MAX_BYTES = 3.2 * 1024 * 1024;
    if (file.size > PDF_MAX_BYTES) {
      msg.style.color = 'var(--danger)';
      msg.textContent = `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB · 3.2MB 이하만 가능). `
        + 'PDF를 압축하거나 필요한 페이지만 잘라서 올려 주세요 — 보통 견적서는 1MB 안쪽입니다.';
      return;
    }
    msg.style.color = 'var(--muted)'; msg.textContent = 'PDF 분석 중... (최대 30초 정도 걸릴 수 있습니다)';
    let base64;
    try {
      base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } catch (err) {
      msg.style.color = 'var(--danger)'; msg.textContent = '파일을 읽지 못했습니다 — 다시 선택해 주세요.';
      return;
    }
    prLastPdfBase64 = base64;
    return runPdfExtract(base64, (opts && opts.fxRate) || null);
  }

  /* 견적서에서 읽은 날짜를 칸에 채운다 (RZ 후속).
     ⚠ '일정표에서 읽고 연도는 추정한' 날짜는 그렇다고 **말한다.** 견적서 절반은 머리글에
     기간이 없고 일정표에 「02월 04일」처럼 연도 없이 적혀 있어, 연도를 견적 작성일에서
     끌어와야 한다. 맞을 때가 많지만 틀릴 수도 있으므로 담당자가 보고 넘어가야 한다. */
  function applyPdfDates(dates) {
    const dep = document.getElementById('pr-depart');
    const qd = document.getElementById('pr-quote-date');
    const nt = document.getElementById('pr-nights');
    const depNote = document.getElementById('pr-depart-note');
    const leadNote = document.getElementById('pr-lead-note');
    if (!dep || !qd || !nt) return;
    const d = dates || {};
    dep.value = d.departDate || '';
    qd.value = d.quoteDate || '';
    nt.value = d.nights == null ? '' : d.nights;

    if (depNote) {
      if (!d.departDate) {
        depNote.textContent = '견적서에서 출발일을 못 찾았습니다 — 직접 넣어 주세요';
        depNote.style.color = 'var(--danger)';
      } else if (d.departVia === 'itinerary') {
        depNote.textContent = '⚠ 일정표에서 읽었고 연도는 추정했습니다 — 맞는지 봐 주세요';
        depNote.style.color = '#8A5A00';
      } else {
        depNote.textContent = '견적서 머리글에서 읽었습니다'
          + (d.returnDate ? ` (~ ${d.returnDate}${d.returnEstimated ? ', 귀국일은 박수로 계산' : ''})` : '');
        depNote.style.color = 'var(--muted)';
      }
    }
    if (leadNote) {
      leadNote.textContent = d.leadDays == null
        ? '' : `출발 ${d.leadDays}일 전에 뽑은 견적입니다 (리드타임)`;
      leadNote.style.color = 'var(--muted)';
    }
  }

  /* 추출 요청 한 번 (RZ) — 파일 읽기와 분리했다. 환율을 넣고 '다시 읽기'를 누를 때
     같은 파일을 다시 고르지 않아도 되게 하기 위해서다. */
  const PR_VALUE_TO_INPUT = {
    airfare: 'pr-airfare', fuel: 'pr-fuel', hotel: 'pr-hotel', hotelName: 'pr-hotel-name',
    meal: 'pr-meal', vehicle: 'pr-vehicle', guide: 'pr-guide', sight: 'pr-sight',
    golf: 'pr-golf', sell: 'pr-sell',
  };
  const PR_VALUE_LABEL = {
    airfare: '항공료', fuel: '유류할증료', hotel: '호텔단가', hotelName: '호텔명',
    meal: '식비', vehicle: '차량비', guide: '가이드비', sight: '관광·입장료',
    golf: '골프(1인 1회)', sell: '판매가',
  };

  async function runPdfExtract(base64, fxRate) {
    const msg = document.getElementById('pr-msg');
    msg.style.color = 'var(--muted)'; msg.textContent = 'PDF 분석 중... (최대 30초 정도 걸릴 수 있습니다)';
    try {
      const body = { pdfBase64: base64 };
      if (fxRate) body.fxRate = fxRate;
      const res = await fetch('/api/quotes?action=extractPdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const reasons = {
          openai_not_configured: 'AI 분석 기능이 아직 설정되지 않았습니다 — 직접 입력해 주세요.',
          pdf_parse_failed: 'PDF를 읽지 못했습니다(손상되었거나 지원하지 않는 형식) — 직접 입력해 주세요.',
          no_text_found: '이 PDF에서 텍스트를 찾지 못했습니다(스캔 이미지 PDF는 지원 안 함) — 직접 입력해 주세요.',
          not_found: '항목을 찾지 못했습니다 — 직접 입력해 주세요.',
          analysis_failed: '분석 중 오류가 발생했습니다 — 직접 입력해 주세요.',
        };
        msg.style.color = 'var(--danger)'; msg.textContent = reasons[data.error] || '추출에 실패했습니다 — 직접 입력해 주세요.';
        return;
      }
      /* RZ: 9칸을 한 번에 채운다. 예전에는 4칸만 채우고 나머지는 담당자가 후보에서
         직접 골라야 했다 — 좌표 덕에 줄마다 항목 이름이 붙어 규칙으로 정할 수 있게 됐다. */
      const values = data.values || {};
      const found = [];
      Object.keys(PR_VALUE_TO_INPUT).forEach((k) => {
        const el = document.getElementById(PR_VALUE_TO_INPUT[k]);
        if (!el) return;
        if (values[k] == null || values[k] === '') { el.value = ''; return; }
        el.value = values[k];
        found.push(PR_VALUE_LABEL[k]);
      });
      applyPdfDates(data.dates);
      /* 근거·후보 목록을 칸 밑에 붙인다 (RN) — 찾은 게 없어도 후보가 있으면 붙여야
         담당자가 직접 고를 수 있다. */
      renderPdfEvidence(data);
      const nCand = (data.candidates || []).length;
      if (!found.length) {
        msg.style.color = 'var(--danger)';
        msg.textContent = nCand
          ? `항목을 자동으로 고르지 못했습니다 — 아래 후보 ${nCand}개 중에서 직접 골라 주세요.`
          : ((data.kind && data.kind.kind === 'summary')
            ? '이 문서에는 단가표가 없습니다(총액·일정만 있는 견적서) — 직접 입력해 주세요.'
            : '단가 줄을 찾지 못했습니다 — 직접 입력해 주세요.');
        return;
      }
      msg.style.color = 'var(--primary)';
      msg.textContent = `PDF에서 ${found.length}칸 채웠습니다 (${found.join('·')}) — `
        + '⚠ 각 칸 아래 근거를 견적서와 대조하고, 틀렸으면 후보에서 다시 골라 주세요.'
        + (nCand ? ` 후보 ${nCand}개.` : '');
    } catch (err) {
      msg.style.color = 'var(--danger)'; msg.textContent = '요청에 실패했습니다. 네트워크를 확인해 주세요.';
    }
  }

  /* 최종 제출 — 여기서 실제로 DB(actual_price_reports)에 저장되고 갱신 제안 집계에
     들어간다. PDF로 채워졌든 직접 입력했든 이 단계에서만 반영됨. 네 필드 모두
     채울 필요는 없고, 최소 하나(항공료/호텔단가/호텔명/식비)만 있으면 된다. */
  async function submitPriceReport() {
    const destKey = document.getElementById('pr-dest').value;
    const airfareInput = document.getElementById('pr-airfare');
    const hotelInput = document.getElementById('pr-hotel');
    const hotelNameInput = document.getElementById('pr-hotel-name');
    const mealInput = document.getElementById('pr-meal');
    const pdfInput = document.getElementById('pr-pdf');
    const msg = document.getElementById('pr-msg');
    const author = currentUser.displayName;
    if (!destKey) { msg.style.color = 'var(--danger)'; msg.textContent = '목적지를 선택해 주세요.'; return; }

    const parseField = (input, max) => {
      if (!input.value) return { ok: true, value: null };
      const n = Number(input.value);
      return (Number.isFinite(n) && n > 0 && n <= max) ? { ok: true, value: n } : { ok: false, value: null };
    };
    const airfare = parseField(airfareInput, 50000000);
    const hotel = parseField(hotelInput, 10000000);
    const meal = parseField(mealInput, 1000000);
    /* RQ: 요율표의 나머지 항목 + 검증용 판매가. 상한은 서버(api/quotes.js)와 같은 값이다 —
       다르면 화면은 통과시키고 서버가 거절하는 일이 생긴다. */
    const extra = {
      fuelUnit: parseField(document.getElementById('pr-fuel'), 2000000),
      vehicleUnit: parseField(document.getElementById('pr-vehicle'), 10000000),
      guideUnit: parseField(document.getElementById('pr-guide'), 5000000),
      sightUnit: parseField(document.getElementById('pr-sight'), 2000000),
      /* TJ: 골프 1인 1회. 상한은 서버의 GOLF_UNIT_MAX와 같은 값이다 */
      golfUnit: parseField(document.getElementById('pr-golf'), 2000000),
      sellPriceUnit: parseField(document.getElementById('pr-sell'), 50000000),
    };
    const allParsed = [airfare, hotel, meal].concat(Object.keys(extra).map((k) => extra[k]));
    if (allParsed.some((p) => !p.ok)) { msg.style.color = 'var(--danger)'; msg.textContent = '입력값을 확인해 주세요(0보다 큰 올바른 범위의 숫자여야 합니다).'; return; }
    const hotelName = hotelNameInput.value.trim().slice(0, 80);
    if (allParsed.every((p) => p.value == null) && !hotelName) {
      msg.style.color = 'var(--danger)'; msg.textContent = '항목 중 최소 하나는 입력해 주세요.'; return;
    }
    /* 오타 방어(신규) — 기준가에서 크게 벗어난 값은 제출 전에 한 번 더 확인받는다.
       cancel하면 제출 중단(모달 유지, 담당자가 값을 고칠 수 있음). */
    const prDest = destinationRates.find(d => d.destination_key === destKey);
    const prEff = prDest ? effectiveRate(prDest) : {};
    if (!confirmPlausibleValue('항공료', airfare.value, prEff.airfare)) return;
    if (!confirmPlausibleValue('호텔단가', hotel.value, prEff.hotel_per_room)) return;
    if (!confirmPlausibleValue('식비', meal.value, prEff.meal_per_person)) return;

    /* ── SY: 같은 견적서를 **두 번** 넣는 것 ──────────────────────────────────
       실무자 여러 명이 폴더에서 일괄로 올리기 시작하면 반드시 생긴다. 두 번 세면
       그 값이 **실측 중앙값을 그쪽으로 끌어당긴다** — 요율에 그대로 얹힌다.
       ⚠ **막지 않는다.** 같은 날 같은 금액의 다른 행사가 실제로 있을 수 있다.
         대신 무엇이 같은지 보여 주고 사람이 정한다.
       ⚠ 차수별 견적을 중복으로 오해하면 안 된다 — 상하이 건은 11/08·11/15·11/22
         **출발일이 다른 3건**이다. 그래서 출발일이 같아야 의심한다. */
    /* ── TF: 여러 도시를 도는 견적서를 **한 목적지 실측**으로 넣는 것 ──────────────
       2026-08-11에 실제로 났다(id 17, KT CES): 샌프란시스코→라스베가스→LA→칸쿤 일정이
       「샌프란시스코」 한 줄로 저장돼, 호텔은 칸쿤 리조트·차량은 CUN 버스·가이드는 LAX
       가 됐다. 그 목적지 표본이 그것 하나뿐이라 **그 행이 곧 실측**이 된다.
       ⚠ **막지 않는다** — 지방 이동처럼 한 요율로 덮는 게 맞는 일정도 있다. 다만
         고른 목적지 이름을 **그 자리에 함께 보여 주고** 사람이 정하게 한다.
       ⚠ 판정(몇 곳부터인가)은 추출기가 이미 했다. 여기서 다시 세지 않는다. */
    if (PR_LAST_ITIN && PR_LAST_ITIN.multiCity) {
      const stays = Array.isArray(PR_LAST_ITIN.stays) ? PR_LAST_ITIN.stays : [];
      const destLabel = prDest ? prDest.label : destKey;
      if (!confirm(`이 견적서는 ${stays.length}곳에서 묵는 일정입니다.\n\n`
        + stays.join('\n') + '\n\n'
        + `지금 이 값들은 전부 「${destLabel}」 실측으로 저장됩니다.\n`
        + '다른 도시의 호텔·차량·가이드가 섞여 있으면 그 목적지 단가가 왜곡됩니다.\n'
        + `(호텔명: ${hotelName || '없음'})\n\n`
        + `「${destLabel}」 한 곳의 값이 맞습니까?`)) {
        msg.style.color = 'var(--muted)';
        msg.textContent = '제출을 멈췄습니다 — 다른 도시 값이 섞였으면 그 칸을 지우거나 직접 고쳐 주세요.';
        return;
      }
    }

    const dup = findDuplicateReports(destKey, {
      departDate: (document.getElementById('pr-depart') || {}).value || null,
      sell: extra.sellPriceUnit.value, nights: (document.getElementById('pr-nights') || {}).value || null,
      hotelName,
      values: { airfare: airfare.value, hotel: hotel.value, meal: meal.value,
        fuel: extra.fuelUnit.value, vehicle: extra.vehicleUnit.value,
        guide: extra.guideUnit.value, sight: extra.sightUnit.value },
    });
    if (dup.length) {
      const d = dup[0];
      const when = d.report.createdAt ? new Date(d.report.createdAt).toISOString().slice(0, 10) : '';
      if (!confirm('같은 견적서를 이미 넣으셨을 수 있습니다.\n\n'
        + `이미 있는 제보: ${d.report.destinationKey} · ${when} · ${d.report.author || ''}\n`
        + `같은 것: ${d.why.join(' · ')}\n\n`
        + '같은 견적서를 두 번 넣으면 그 값이 실측 중앙값을 끌어당깁니다.\n'
        + '다른 행사가 맞으면 그대로 진행하세요. 넣을까요?')) {
        msg.style.color = 'var(--muted)';
        msg.textContent = '제출을 멈췄습니다 — 「제보 내역·삭제」에서 이미 넣은 것을 확인해 보세요.';
        return;
      }
    }

    const source = priceReportMode; // 'manual' | 'pdf' — 선택한 방식 그대로 기록
    /* SG: 환산된 칸만 골라 「어느 환율로 바꾼 값인가」를 함께 보낸다.
       ⚠ **담당자가 손으로 고친 칸은 뺀다** — 그 값은 더 이상 환산값이 아니라서,
         나중에 오늘 기준으로 되돌리면 엉뚱하게 움직인다.
       ⚠ 통화·환율이 섞이면 하나로 말할 수 없다 — 가장 많은 쪽만 남기고 나머지는 뺀다
         (짐작해서 뭉뚱그리지 않는다). */
    const fxPayload = (() => {
      const live = Object.keys(PR_FX_BY_FIELD).filter((k) => {
        const f = PR_EVIDENCE_FIELDS.find((x) => x.key === k);
        const el = f && document.getElementById(f.input);
        if (!el || el.value === '') return false;
        return String(el.value) === String(PR_FX_BY_FIELD[k].value);   // 손대지 않은 칸만
      });
      if (!live.length) return {};
      const tally = {};
      live.forEach((k) => {
        const s = PR_FX_BY_FIELD[k].currency + '|' + PR_FX_BY_FIELD[k].rate;
        tally[s] = (tally[s] || 0) + 1;
      });
      const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      const [cur, rate] = top.split('|');
      const fields = live.filter((k) => PR_FX_BY_FIELD[k].currency === cur && String(PR_FX_BY_FIELD[k].rate) === rate);
      return { fxCurrency: cur, fxRate: Number(rate), fxFields: fields.join(',') };
    })();
    try {
      const res = await fetch('/api/quotes?action=priceReport', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          destinationKey: destKey, airfareUnit: airfare.value, hotelUnit: hotel.value,
          hotelName, mealUnit: meal.value, author, source,
          departDate: (document.getElementById('pr-depart') || {}).value || null,
          quoteDate: (document.getElementById('pr-quote-date') || {}).value || null,
          nights: (document.getElementById('pr-nights') || {}).value || null,
          /* SW: **어느 칸을 담당자가 확정했는가.** 값이 비어 있는 칸은 뺀다 —
             고쳤다가 지운 칸을 '확정'으로 보내면 없는 값에 근거가 붙는다. */
          /* SX: **칸마다 그 값이 어떻게 나왔는가**를 함께 보낸다. 지금까지는 이 정보가
             추출 화면에만 있다가 제출과 함께 버려져서, 나중에 「어느 칸이 확인 대상인가」를
             물으면 값만 보고는 답할 수 없었다(특히 「검산 안 됨」을 잃는 것이 크다). */
          fieldSources: PR_EVIDENCE_FIELDS.reduce((o, f) => {
            const el = document.getElementById(f.input);
            if (!el || el.value === '') return o;
            o[f.key] = PR_MANUAL_FIELDS[f.key] ? 'confirmed'
              : (priceReportMode === 'manual' ? 'manual' : (PR_LAST_EVIDENCE && PR_LAST_EVIDENCE[f.key] ? (PR_LAST_EVIDENCE[f.key].via || 'rule') : 'none'));
            return o;
          }, {}),
          manualFields: Object.keys(PR_MANUAL_FIELDS).reduce((o, k) => {
            const fld = PR_EVIDENCE_FIELDS.find((x) => x.key === k);
            const el = fld && document.getElementById(fld.input);
            if (el && el.value !== '') o[k] = PR_MANUAL_FIELDS[k];
            return o;
          }, {}),
        }, fxPayload, Object.keys(extra).reduce((o, k) => { o[k] = extra[k].value; return o; }, {}))),
      });
      const data = await res.json();
      if (!res.ok) { msg.style.color = 'var(--danger)'; msg.textContent = '제출 실패: ' + (data.error || ''); return; }
      /* TI: **무엇이 왜 빠졌는지 그 자리에서 말한다** (2026-08-12 대표 지시).
         조용히 빼면 담당자는 아홉 칸이 다 반영된 줄 알고, 나중에 「왜 3건인데 2건이지」가
         된다. 서버가 뺀 칸 목록을 그대로 돌려주므로 화면이 다시 판단하지 않는다. */
      const skipped = Array.isArray(data.autoExcluded) ? data.autoExcluded : [];
      /* ⚠ 항목 이름을 여기 다시 적지 않는다 — 칸 라벨과 같은 곳에서 가져온다 */
      const labelOf = (k) => {
        const f = PR_EVIDENCE_FIELDS.find((x) => x.key === k);
        return f ? f.label : k;
      };
      msg.style.color = skipped.length ? 'var(--danger)' : 'var(--success)';
      msg.textContent = skipped.length
        ? '제출되었습니다 — 다만 ' + skipped.map(labelOf).join('·')
          + '은(는) 정확한 값을 못 찾아 실측 평균에서 뺐습니다. '
          + '「확인 필요」 목록에서 견적서를 보고 확정하면 그때 반영됩니다.'
        : '제출되었습니다 — 갱신 제안에 반영됩니다.';
      PR_FIELD_IDS.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
      PR_MANUAL_FIELDS = {};
      pdfInput.value = '';
      clearPdfEvidence();
      await loadPriceReports();
      renderRateSuggestions();
      renderHotelReference();
    } catch (err) {
      msg.style.color = 'var(--danger)'; msg.textContent = '제출 요청에 실패했습니다. 네트워크를 확인해 주세요.';
    }
  }

  /* 제보 내역·삭제 모달(신규) — 잘못 입력된 제보를 찾아 지운다. priceReportsCache를
     최근순 그대로 목록화하고 목적지 필터를 건다. 삭제 후 캐시 재적재 + 요율표(갱신제안·
     검증배지·참고카드 포함) 재렌더. */
  /* ════ SY: 같은 견적서를 두 번 넣는 것 ══════════════════════════════════════
     실무자 여러 명이 폴더에서 일괄로 올리면 반드시 생긴다. 두 번 세면 그 값이
     **실측 중앙값을 끌어당기고** 요율에 그대로 얹힌다. 빈칸과 달리 **틀린 값**이라
     대표 방침상 우선순위가 높다.

     무엇을 같다고 볼 것인가 — **문서를 가리키는 것**만 센다:
       출발일 3점 · 1인 판매가 3점 · 박수 1점 · 호텔명 1점 · 값이 같은 칸 1점씩
     6점부터 의심한다(출발일+판매가만 같아도 6점).

     ⚠ **출발일이 다르면 의심하지 않는다.** 한 문서에 차수별 견적이 여럿인 일이 흔하다
       (상하이 11/08·11/15·11/22 3건 · 항공료도 360/345/330천원으로 다르다).
       그걸 중복으로 막으면 진짜 데이터를 잃는다.
     ⚠ **막지 않고 물어본다.** 같은 날 같은 금액의 다른 행사가 실제로 있을 수 있고,
       그 판단은 사람만 할 수 있다. */
  const SY_DUP_SCORE = 6;
  const SY_VALUE_KEY = {
    airfare: 'airfareUnit', fuel: 'fuelUnit', hotel: 'hotelUnit', meal: 'mealUnit',
    vehicle: 'vehicleUnit', guide: 'guideUnit', sight: 'sightUnit',
  };
  function findDuplicateReports(destKey, payload, excludeId) {
    const same = (priceReportsCache || []).filter((r) => r.destinationKey === destKey
      && (excludeId == null || Number(r.id) !== Number(excludeId)));
    const num = (v) => (v == null || v === '' ? null : Number(v));
    return same.map((r) => {
      let score = 0; const why = [];
      /* ⚠ **출발일이 둘 다 있고 서로 다르면 중복이 아니다 — 점수로 따지지 않고 끊는다.**
         처음에 점수제로만 했다가 회귀 테스트가 잡았다: 차수별 견적은 **항공료만 다르고
         나머지는 전부 같은 것이 정상**이라(상하이 11/08·11/15·11/22), 값 6칸 + 박수 +
         호텔명이 겹쳐 8점이 나왔다. 그대로 뒀으면 **진짜 데이터를 중복으로 막았을 것**이다. */
      if (payload.departDate && r.departDate) {
        if (r.departDate !== payload.departDate) return { report: r, score: 0, why: [] };
        score += 3; why.push('출발일');
      }
      if (num(payload.sell) != null && num(r.sellPriceUnit) === num(payload.sell)) { score += 3; why.push('1인 판매가'); }
      if (num(payload.nights) != null && num(r.nights) === num(payload.nights)) { score += 1; why.push('박수'); }
      if (payload.hotelName && r.hotelName && r.hotelName === payload.hotelName) { score += 1; why.push('호텔명'); }
      const sameCells = Object.keys(SY_VALUE_KEY).filter((k) => {
        const v = num((payload.values || {})[k]);
        return v != null && num(r[SY_VALUE_KEY[k]]) === v;
      });
      score += sameCells.length;
      if (sameCells.length) why.push('값 ' + sameCells.length + '칸');
      return { report: r, score, why };
    }).filter((x) => x.score >= SY_DUP_SCORE).sort((a, b) => b.score - a.score);
  }

  /* 이미 들어간 것들 중 서로 중복인 쌍 — 목록 화면이 배지로 알린다.
     ⚠ 자기 자신은 뺀다(안 빼면 모든 제보가 자기와 중복으로 잡힌다). */
  function duplicateIdSet() {
    const out = new Set();
    (priceReportsCache || []).forEach((r) => {
      const hit = findDuplicateReports(r.destinationKey, {
        departDate: r.departDate, sell: r.sellPriceUnit, nights: r.nights, hotelName: r.hotelName,
        values: Object.keys(SY_VALUE_KEY).reduce((o, k) => { o[k] = r[SY_VALUE_KEY[k]]; return o; }, {}),
      }, r.id);
      if (hit.length) { out.add(Number(r.id)); hit.forEach((h) => out.add(Number(h.report.id))); }
    });
    return out;
  }

  /* ════ SX: 확인 필요 목록 ═══════════════════════════════════════════════════
     ⚠ **판정 규칙을 여기 새로 적지 않는다.** 타당성은 `plausibility.js`(SO·SK),
       「검산 안 됨」은 제출 때 저장한 `fieldSources`(SX)에서 온다. 화면이 규칙을
       다시 지으면 감사기와 어긋난다(결함 생성기 ①).
     ⚠ 이미 **평균에서 뺀 칸**은 확인할 이유가 없다 — 어차피 기준에 안 들어간다. */
  const NC_FIELDS = [
    { key: 'airfare', rate: 'airfare', label: '항공료' },
    { key: 'fuel', rate: 'fuel_surcharge', label: '유류할증' },
    { key: 'hotel', rate: 'hotel_per_room', label: '호텔단가' },
    { key: 'meal', rate: 'meal_per_person', label: '식비' },
    { key: 'vehicle', rate: 'vehicle_large', label: '차량비' },
    { key: 'guide', rate: 'guide_fee', label: '가이드비' },
    { key: 'sight', rate: 'sightseeing_fee', label: '관광비' },
    /* TJ: 골프도 확인 대상이다 — 회차를 잘못 세면 단가가 배수로 틀리는데
       그건 값만 봐서는 안 보인다(라운딩 줄 수로 나눈다). */
    { key: 'golf', rate: 'golf_fee', label: '골프(1인 1회)' },
  ];
  const NC_VALUE_KEY = {
    airfare: 'airfareUnit', fuel: 'fuelUnit', hotel: 'hotelUnit', meal: 'mealUnit',
    vehicle: 'vehicleUnit', guide: 'guideUnit', sight: 'sightUnit', golf: 'golfUnit',
  };

  /* TI: 이 칸이 **자동으로** 평균에서 빠져 있는가. 사람이 사유를 적어 뺀 것(SU)과 갈라야
     한다 — 표시를 아는 곳은 plausibility.js 하나다(서버도 같은 것을 본다). */
  function ncAutoExcluded(report, f) {
    const ex = (report.excludedFields || {})[f.key];
    return !!(ex && typeof PLAUSIBILITY !== 'undefined' && PLAUSIBILITY.isAutoExcluded(ex));
  }

  /* 한 칸이 왜 확인 대상인가 — 이유가 없으면 null(그 칸은 목록에 안 뜬다) */
  function ncReason(report, f) {
    const base = ncReasonBase(report, f);
    if (!base) return null;
    /* TI: 자동으로 빠진 칸은 **그 사실을 목록에서 말한다.** 여기서 확정하는 것이 곧
       되살리는 것이라, 안 적으면 담당자는 "이미 반영된 값을 왜 또 보라는 거지"로 읽는다. */
    if (!ncAutoExcluded(report, f)) return base;
    return {
      level: 'high',
      why: base.why + ' · **지금은 실측 평균에서 빠져 있습니다** — 확정하면 그때 반영됩니다',
    };
  }

  function ncReasonBase(report, f) {
    const v = report[NC_VALUE_KEY[f.key]];
    if (v == null || !(v > 0)) return null;
    if (report.manualFields && report.manualFields[f.key]) return null;      /* 이미 확정 */
    /* ⚠ 제외에는 **두 종류**가 있다. 사람이 사유를 적어 뺀 것은 이미 판단이 끝났으므로
       목록에서 뺀다. 하지만 **자동으로 뺀 것은 아무도 안 본 값**이라 반드시 남아야 한다 —
       여기서 함께 빼 버리면, 제출 화면이 「확인 필요 목록에서 확정하세요」라고 안내한
       바로 그 목록에 정작 안 떠서 **되살릴 길이 막힌다**(결함 생성기 ③). */
    if (report.excludedFields && report.excludedFields[f.key]
        && !ncAutoExcluded(report, f)) return null;                          /* 사람이 뺐다 */
    const via = (report.fieldSources || {})[f.key];
    if (via === 'unchecked') return { level: 'high', why: '검산 안 됨 — 1인 단가인지 전 일정 총액인지 모릅니다' };
    if (via === 'ai') return { level: 'high', why: 'AI가 고른 값입니다' };
    if (via === 'fallback') return { level: 'high', why: '표 좌표를 못 읽어 예전 방식으로 물러났습니다' };
    /* 타당성 — 기준은 그 목적지 것만 쓴다(SK). 동료는 오늘 환율로 되돌려 견준다(SG). */
    if (typeof PLAUSIBILITY !== 'undefined') {
      const dest = destinationRates.find((d) => d.destination_key === report.destinationKey);
      const base = dest ? (effectiveRate(dest) || {})[f.rate] : 0;
      const peers = (priceReportsCache || [])
        .filter((r) => r.id !== report.id && r.destinationKey === report.destinationKey)
        .map((r) => reportValueToday(r, f.rate)).filter((n) => n > 0);
      const res = PLAUSIBILITY.judge(v, peers, base);
      if (res && res.level === 'check') return { level: 'high', why: PLAUSIBILITY.describe(res, f.label) };
    }
    return { level: 'low', why: '추출값 그대로입니다 (담당자가 확인하지 않았습니다)' };
  }

  function ncRows() {
    const out = [];
    (priceReportsCache || []).forEach((r) => {
      NC_FIELDS.forEach((f) => {
        const reason = ncReason(r, f);
        if (reason) out.push({ report: r, f, reason, value: r[NC_VALUE_KEY[f.key]] });
      });
    });
    /* 위험한 것부터, 그다음 오래된 것부터 — 방치가 위로 올라와야 눈에 띈다 */
    return out.sort((a, b) => (a.reason.level === b.reason.level ? 0 : a.reason.level === 'high' ? -1 : 1)
      || new Date(a.report.createdAt) - new Date(b.report.createdAt));
  }

  function updateNeedCheckCount() {
    const el = document.getElementById('pr-need-count');
    if (!el) return;
    const n = ncRows().filter((x) => x.reason.level === 'high').length;
    el.textContent = n ? '(' + n + ')' : '';
    el.style.cssText = n ? 'color:var(--danger);font-weight:800' : '';
  }

  function openNeedCheckModal() {
    const filter = document.getElementById('nc-filter');
    if (filter) {
      const dests = [...new Set((priceReportsCache || []).map((r) => r.destinationKey))];
      filter.innerHTML = '<option value="">전체</option>'
        + dests.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    }
    document.getElementById('nc-msg').textContent = '';
    document.getElementById('needCheckModal').classList.remove('hidden');
    renderNeedCheck();
  }

  function renderNeedCheck() {
    const tbody = document.getElementById('nc-tbody');
    if (!tbody) return;
    /* ⚠ 건수는 **목록을 그릴 때마다** 다시 센다. 탭을 그릴 때 한 번만 세면, 목록에서
       몇 건을 처리하고 닫아도 버튼에는 옛 숫자가 남는다(그러면 아무도 그 숫자를 안 믿는다). */
    updateNeedCheckCount();
    const dest = document.getElementById('nc-filter')?.value || '';
    const onlyRisky = document.getElementById('nc-only-risky')?.checked;
    let rows = ncRows();
    if (dest) rows = rows.filter((x) => x.report.destinationKey === dest);
    if (onlyRisky) rows = rows.filter((x) => x.reason.level === 'high');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">확인할 것이 없습니다.</td></tr>';
      return;
    }
    const days = (ts) => Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 86400000));
    tbody.innerHTML = rows.map((x) => {
      const d = days(x.report.createdAt);
      return `<tr>
        <td style="white-space:nowrap"><strong>${esc(x.report.destinationKey)}</strong>
          <br><span style="font-size:.7rem;color:var(--muted)">${d === 0 ? '오늘' : d + '일 전'} · ${esc(x.report.author || '')}</span></td>
        <td style="white-space:nowrap">${esc(x.f.label)}</td>
        <td style="text-align:right"><input type="number" class="pw-input" style="max-width:120px;text-align:right"
             id="nc-v-${x.report.id}-${x.f.key}" value="${Number(x.value)}"></td>
        <td style="font-size:.74rem;${x.reason.level === 'high' ? 'color:#8A6100;font-weight:700' : 'color:var(--muted)'}">${esc(x.reason.why)}</td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn-detail" onclick="confirmNeedCheck(${Number(x.report.id)},'${x.f.key}')">확인</button>
          <button class="btn-detail" onclick="togglePriceReportExclude(${Number(x.report.id)},'${x.f.key}')">평균에서 빼기</button>
        </td>
      </tr>`;
    }).join('');
  }

  /* 값을 고쳤으면 그 값으로, 안 고쳤으면 **그대로 확인**으로 닫는다.
     ⚠ 둘 다 「담당자가 확정했다」로 남는다 — 누가 언제 확인했는지가 기록돼야
       다음 사람이 또 확인하지 않는다. */
  async function confirmNeedCheck(id, fieldKey) {
    const msg = document.getElementById('nc-msg');
    const row = (priceReportsCache || []).find((r) => Number(r.id) === Number(id));
    const el = document.getElementById(`nc-v-${id}-${fieldKey}`);
    if (!row || !el) return;
    const before = Number(row[NC_VALUE_KEY[fieldKey]]);
    const now = Number(el.value);
    if (!(now > 0)) { msg.style.color = 'var(--danger)'; msg.textContent = '0보다 큰 값이어야 합니다.'; return; }
    const changed = now !== before;
    const body = { id, field: fieldKey };
    if (changed) {
      body.value = now;
      body.how = `확인 필요 목록에서 ${before.toLocaleString()} → ${now.toLocaleString()}으로 고쳤습니다`;
    } else {
      body.how = `확인 필요 목록에서 ${before.toLocaleString()}이 맞다고 확인했습니다`;
    }
    try {
      const res = await fetch('/api/quotes?action=confirmReportField', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { msg.style.color = 'var(--danger)'; msg.textContent = '저장에 실패했습니다.'; return; }
      await loadPriceReports();
      renderNeedCheck();
      updateNeedCheckCount();
      renderRates();
      msg.style.color = 'var(--success)';
      msg.textContent = changed ? '고친 값으로 확정했습니다.' : '확인 완료 — 이 칸은 다시 묻지 않습니다.';
    } catch (err) {
      msg.style.color = 'var(--danger)'; msg.textContent = '요청에 실패했습니다. 네트워크를 확인해 주세요.';
    }
  }

  function openPriceReportsModal() {
    const filter = document.getElementById('pr-list-filter');
    if (filter) {
      const dests = [...new Set(priceReportsCache.map(r => r.destinationKey))];
      const optLabel = k => { const d = destinationRates.find(x => x.destination_key === k); return d ? d.label : k; };
      filter.innerHTML = `<option value="">전체 (${priceReportsCache.length}건)</option>` +
        dests.map(k => `<option value="${esc(k)}">${esc(optLabel(k))}</option>`).join('');
      const prDest = document.getElementById('pr-dest');
      filter.value = (prDest && dests.includes(prDest.value)) ? prDest.value : '';
    }
    document.getElementById('pr-list-msg').textContent = '';
    renderPriceReportsList();
    document.getElementById('priceReportsModal').classList.remove('hidden');
  }

  function renderPriceReportsList() {
    const tbody = document.getElementById('pr-list-tbody');
    if (!tbody) return;
    const filterKey = document.getElementById('pr-list-filter')?.value || '';
    const rows = priceReportsCache.filter(r => !filterKey || r.destinationKey === filterKey);
    const optLabel = k => { const d = destinationRates.find(x => x.destination_key === k); return d ? d.label : k; };
    /* SU: 숫자를 누르면 「평균에서 빼기」를 걸고 풀 수 있다. 뺀 값은 **지우지 않는다** —
       취소선과 사유를 붙여 그대로 보여준다(참고자료로는 쓴다). */
    const cell = (r, rateField, v) => {
      if (v == null) return '<span style="color:var(--muted)">—</span>';
      const off = reportFieldExcluded(r, rateField);
      const why = reportExcludeReason(r, rateField);
      return `<button type="button" class="btn-detail" style="padding:.1rem .35rem;font-weight:700;`
        + (off ? 'text-decoration:line-through;color:var(--muted)' : '')
        + `" title="${off ? esc('평균에서 뺌 — ' + why + ' (눌러서 되돌리기)') : '눌러서 평균에서 빼기'}"`
        + ` onclick="togglePriceReportExclude(${Number(r.id)},'${REPORT_FX_KEY[rateField]}')">${fmtWon(v)}</button>`
        + (off ? `<div style="font-size:.66rem;color:var(--muted);font-weight:700">평균 제외 · ${esc(why)}</div>` : '');
    };
    /* 출발일·견적 작성일 — **참고자료**다(2026-08-11 대표 지시로 그대로 저장한다).
       ⚠ 작성일이 출발일보다 **뒤**면 그건 견적을 낸 날이 아니라 **문서를 PDF로 뽑은 날**일
         수 있다(코퍼스 실측: 작성일을 읽은 10건 중 6건이 그랬고, 그 날짜가 2026-08-04·06
         두 날에 몰려 있었다). 값은 지우지 않고 **참고용이라고 밝힌다** — 리드타임은
         원래부터 이런 건에서 계산되지 않는다(음수라 버려진다). */
    const dateCell = (r) => {
      const dep = r.departDate || '—';
      const q = r.quoteDate || '—';
      const suspect = r.departDate && r.quoteDate && r.quoteDate > r.departDate;
      return `<span style="white-space:nowrap">${esc(dep)}</span>`
        + `<br><span style="font-size:.7rem;color:var(--muted);white-space:nowrap">작성 ${esc(q)}`
        + (suspect ? ` <span title="작성일이 출발일보다 뒤입니다 — 견적을 낸 날이 아니라 문서를 뽑은 날일 수 있어 리드타임 계산에는 쓰지 않습니다" style="color:#b45309;font-weight:700">· 참고용</span>` : '')
        + `</span>`;
    };
    /* SY: 이미 들어간 것들 중 서로 중복인 것 — **넣을 때 놓쳤어도 여기서 보인다** */
    const dupIds = duplicateIdSet();
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:1.5rem">제보가 없습니다.</td></tr>`; return; }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="white-space:nowrap">${r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '—'}</td>
        <td style="white-space:nowrap"><strong>${esc(optLabel(r.destinationKey))}</strong>${
          dupIds.has(Number(r.id))
            ? ' <span style="font-size:.66rem;font-weight:800;color:var(--danger)" title="같은 목적지에 출발일·판매가·값이 겹치는 제보가 또 있습니다 — 같은 견적서를 두 번 넣으면 실측 중앙값이 그쪽으로 끌립니다">⚠ 중복 의심</span>'
            : ''}${(() => {
          /* 나라를 함께 보여준다 (RY) — 호텔명 칸이 바로 옆이라, 도시 이름만으로는
             어느 나라 호텔인지 모르는 줄이 이 표에서 제일 자주 나온다. */
          const c = destCountryOf(r.destinationKey);
          return c && c !== optLabel(r.destinationKey) ? `<br><span style="font-size:.7rem;color:var(--muted);font-weight:400">${esc(c)}</span>` : '';
        })()}</td>
        <td>${dateCell(r)}</td>
        <td style="text-align:right">${cell(r, 'airfare', r.airfareUnit)}</td>
        <td style="text-align:right">${cell(r, 'hotel_per_room', r.hotelUnit)}</td>
        <td style="text-align:right">${cell(r, 'meal_per_person', r.mealUnit)}</td>
        <td>${r.hotelName ? esc(r.hotelName) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${esc(r.author || '—')}</td>
        <td><span style="font-size:.7rem;color:var(--muted)">${r.source === 'pdf' ? 'PDF' : '직접'}</span></td>
        <td style="text-align:right"><button class="btn-detail" onclick="deletePriceReportById(${r.id})">🗑 삭제</button></td>
      </tr>`).join('');
  }

  /* SU: 한 항목을 평균에서 빼거나 되돌린다 (2026-08-11 대표 지시).
     ⚠ **사유를 반드시 받는다.** 사유 없이 빠진 값은 나중에 아무도 이유를 몰라
       "왜 이 견적서만 빠졌지"가 되고 결국 누군가 되돌려 놓는다.
     ⚠ 행을 지우는 것이 아니다 — 같은 견적서의 나머지 항목은 그 목적지 것이라 그대로 쓴다. */
  const PR_EXCLUDE_LABEL = { airfare: '항공료', fuel: '유류할증', hotel: '호텔단가',
    meal: '식비', vehicle: '차량', guide: '가이드', sight: '관광비' };
  async function togglePriceReportExclude(id, fieldKey) {
    const msg = document.getElementById('pr-list-msg');
    const row = (priceReportsCache || []).find((r) => Number(r.id) === Number(id));
    if (!row) return;
    const on = !!(row.excludedFields && row.excludedFields[fieldKey]);
    const label = PR_EXCLUDE_LABEL[fieldKey] || fieldKey;
    let reason = '';
    if (on) {
      if (!confirm(`이 제보의 ${label}을(를) 다시 평균에 넣을까요?\n(지금 사유: ${row.excludedFields[fieldKey]})`)) return;
    } else {
      reason = (prompt(`이 제보의 ${label}을(를) 평균에서 뺍니다.\n왜 빼는지 적어 주세요 (예: 심천 호텔 — 홍콩과 다른 도시).`,
        '') || '').trim();
      if (!reason) { if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = '사유를 적어야 뺄 수 있습니다 — 나중에 이유를 알 수 없으면 누군가 되돌려 놓습니다.'; } return; }
    }
    try {
      const res = await fetch('/api/quotes?action=excludeReportField', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field: fieldKey, reason }),
      });
      if (!res.ok) { if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = '저장에 실패했습니다.'; } return; }
      await loadPriceReports();
      renderPriceReportsList();
      renderRates();
      if (msg) {
        msg.style.color = 'var(--success)';
        msg.textContent = on ? `${label}을(를) 다시 평균에 넣었습니다.`
          : `${label}을(를) 평균에서 뺐습니다 — 값은 그대로 남아 참고자료로 보입니다.`;
      }
    } catch (err) {
      if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = '요청에 실패했습니다. 네트워크를 확인해 주세요.'; }
    }
  }

  async function deletePriceReportById(id) {
    const msg = document.getElementById('pr-list-msg');
    if (!confirm('이 제보를 삭제할까요?\n삭제하면 갱신제안·검증에서 즉시 빠지며 되돌릴 수 없습니다.')) return;
    try {
      const res = await fetch(`/api/quotes?action=deletePriceReport&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) { msg.style.color = 'var(--danger)'; msg.textContent = '삭제에 실패했습니다.'; return; }
      await loadPriceReports();
      renderPriceReportsList();
      renderRates();
      msg.style.color = 'var(--success)'; msg.textContent = '삭제되었습니다.';
    } catch (err) {
      msg.style.color = 'var(--danger)'; msg.textContent = '삭제 요청에 실패했습니다. 네트워크를 확인해 주세요.';
    }
  }

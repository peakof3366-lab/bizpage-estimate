/* ═══════════════════════════════════════════════════════════════════════════
   요율 관리 화면 (앞부분) — admin.html에서 떼어낸 화면 (구조 정리 2b-3)

   ■ 로드 규칙  `admin/common.js` 다음, admin.html의 인라인 <script> 앞에서 실린다.
     여기 있는 것은 전부 **선언**이다. 실행문(addEventListener·fetch)은 admin.html에
     그대로 남아 있다 — 그쪽은 DOM 순서에 걸려 있어 따로 다룬다(2b-1b).

   ■ 검사  `ai-loop/_admin_source.js`의 ADMIN_PARTS + `ai-loop/test_zZ_admin_boot.js`가
     **띄워서** 이 화면의 이름이 사는지 본다. 이 파일을 비우면 test_zZ가 실패해야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
  function renderRates() {
    renderRateStaleBanner();
    refreshRateUndoBanner();
    renderRateSuggestions();
    renderAccuracyStats();
    renderCoefficients();  /* P2b: 견적 계수 조정 카드 */
    /* ⚠ renderHotelReference·populatePriceReportDestSelect는 여기서 안 부른다 (RM) —
       그 카드들은 '견적서 업데이트' 화면으로 옮겼다. 여기서 부르면 없는 DOM을 찾는다. */
    if (typeof destinationRates === 'undefined' || typeof RATE_META === 'undefined') {
      document.getElementById('rate-tbody').innerHTML =
        '<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:2rem">data.js를 찾을 수 없습니다.</td></tr>';
      return;
    }

    rateActualValidationMap = buildActualValidationMap();
    const measured = countMeasuredCells();

    /* 메타 배너 */
    const allStatus   = destinationRates.map(d => adminGetCombinedStatus(d.destination_key, d.rateDate));
    const cntOk       = allStatus.filter(s => s.status === 'ok').length;
    const cntCheck    = allStatus.filter(s => s.status === 'check').length;
    const cntStale    = allStatus.filter(s => s.status === 'stale').length;
    const bannerEl    = document.getElementById('rate-meta-banner');
    if (bannerEl) {
      bannerEl.innerHTML = `
        <div class="rate-meta-box"><div class="rate-meta-label">요율 버전</div><div class="rate-meta-value">${esc(RATE_META.version)}</div></div>
        <div class="rate-meta-box"><div class="rate-meta-label">최종 갱신</div><div class="rate-meta-value">${esc(RATE_META.updated)} · ${esc(RATE_META.updatedBy)}</div></div>
        <div class="rate-meta-box ${cntCheck+cntStale > 0 ? 'warn' : ''}">
          <div class="rate-meta-label">다음 검토 예정</div>
          <div class="rate-meta-value">${esc(RATE_META.nextReview)}</div>
        </div>
        <div class="rate-meta-box ${cntStale > 0 ? 'danger' : cntCheck > 0 ? 'warn' : ''}">
          <div class="rate-meta-label">상태 요약</div>
          <div class="rate-meta-value">✅ ${cntOk} · ⚠️ ${cntCheck} · 🔴 ${cntStale}</div>
        </div>
        <!-- RM: 실측 전환 진행률 — 견적서를 수백 건 넣는 동안 "어디까지 바뀌었나"가
             안 보이면 끝이 없게 느껴지고, 어느 목적지가 아직 추정인지도 모른다. -->
        <div class="rate-meta-box">
          <div class="rate-meta-label">실측 전환</div>
          <div class="rate-meta-value" title="항공료·호텔·식비 세 단가 중 실제 견적서로 확인된 칸의 비율입니다">${measured.done} / ${measured.total} 칸 (${measured.pct}%)</div>
        </div>`;
    }

    /* 갱신 안내 — 담당자는 바로 위 메타 배너 "최종 갱신" 박스에 이미 표시되므로 중복 생략 */
    const infoEl = document.getElementById('rate-update-info');
    if (infoEl) infoEl.textContent = `📌 ${RATE_META.note}`;

    /* 검색어 + 상태 필터를 목적지/지역 구분 없이 먼저 공통 적용 (신규) */
    const q = rateSearchQuery.toLowerCase();
    const matchesSearch = d => !q || d.label.toLowerCase().includes(q) || (REGION_MAP[d.label] || '기타').toLowerCase().includes(q);
    /* ⚠ 필터가 두 축이다 (RM). 'ok/check/stale'은 **기준월이 얼마나 지났나**이고,
       'estimated/measured'는 **실측 근거가 있느냐**다. 섞어서 한 줄로 판단하면
       "갱신 필요인데 실측은 있음" 같은 경우를 표현할 수 없다. */
    const measuredCount = (d) => RATE_MEASURED_FIELDS
      .filter(f => (rateActualValidationMap[`${d.destination_key}|${f}`] || {}).latestTs).length;
    const matchesFilter = (d) => {
      if (rateFilter === 'all') return true;
      if (rateFilter === 'estimated') return measuredCount(d) === 0;
      if (rateFilter === 'measured') return measuredCount(d) > 0;
      return adminGetCombinedStatus(d.destination_key, d.rateDate).status === rateFilter;
    };
    const searched = destinationRates.filter(d => matchesSearch(d) && matchesFilter(d));

    const sortMode = document.getElementById('rateSortMode')?.value || 'region';
    const tbody = document.getElementById('rate-tbody');
    /* 🔴 지역순에서는 그룹 머리줄이 지역을 말하므로 **지역 칸이 늘 비어 있다**
       (실측 60/60). 그 열을 감춘다. 우선순위순에서는 머리줄이 없어 채워지므로 보인다. */
    tbody?.closest('table')?.classList.toggle('by-region', sortMode !== 'priority');
    let html = '';

    if (sortMode === 'priority') {
      /* 우선순위순 (신규): 지역 구분 없이 갱신 필요 → 확인 권장 → 최신 순으로,
         같은 상태 안에서는 경과 개월이 큰 것부터. "어디부터 봐야 하지?"에 바로
         답이 되도록 지역 그룹 헤더 없이 평평하게 나열하고, 대신 각 행에 지역명을
         표시한다. */
      const severity = { stale: 2, check: 1, ok: 0 };
      const sorted = [...searched].sort((a, b) => {
        const sa = adminGetCombinedStatus(a.destination_key, a.rateDate);
        const sb = adminGetCombinedStatus(b.destination_key, b.rateDate);
        if (severity[sb.status] !== severity[sa.status]) return severity[sb.status] - severity[sa.status];
        return (sb.months <= 999 ? sb.months : 999) - (sa.months <= 999 ? sa.months : 999);
      });
      sorted.forEach(d => {
        const region = REGION_MAP[d.label] || '기타';
        html += renderRateRow(d, region);
      });
      if (!sorted.length) html = `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:2rem">검색/필터 조건에 맞는 목적지가 없습니다.</td></tr>`;
    } else {
      /* 지역순 (기존 방식) */
      const grouped = {};
      searched.forEach(d => {
        const region = REGION_MAP[d.label] || '기타';
        if (!grouped[region]) grouped[region] = [];
        grouped[region].push(d);
      });
      REGION_ORDER.forEach(region => {
        if (!grouped[region] || !grouped[region].length) return;
        html += `<tr class="rate-region-row"><td colspan="11">${esc(region)}</td></tr>`;
        grouped[region].forEach(d => { html += renderRateRow(d, ''); });
      });
      /* REGION_ORDER에 없는 나머지 그룹(주로 관리자 신규 목적지의 '기타') — 이게
         없으면 REGION_ORDER에 명시된 지역만 그려져서 커스텀 목적지가 지역순 보기
         에서 통째로 사라진다(신규). */
      Object.keys(grouped).filter(r => !REGION_ORDER.includes(r)).forEach(region => {
        html += `<tr class="rate-region-row"><td colspan="11">${esc(region)}</td></tr>`;
        grouped[region].forEach(d => { html += renderRateRow(d, ''); });
      });
      if (!searched.length) html = `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:2rem">검색/필터 조건에 맞는 목적지가 없습니다.</td></tr>`;
    }
    tbody.innerHTML = html;
  }

  /* 요율 테이블 한 행 렌더 — 지역순 모드에서는 regionLabel=''(지역 그룹 헤더로 이미
     표시됨), 우선순위순 모드에서는 regionLabel에 실제 지역명을 넣어 첫 칸에 보여준다. */
  function renderRateRow(d, regionLabel) {
        const eff = effectiveRate(d);
        const rs = adminGetCombinedStatus(d.destination_key, eff.rateDate);
        return `<tr>
          <td class="rate-region" style="color:var(--muted);font-size:.76rem">${esc(regionLabel)}</td>
          <td style="white-space:nowrap"><strong>${esc(d.label)}</strong></td>
          <!-- 🔴 표의 버튼은 **눈으로는 줄이 말해 주지만 귀로는 아니다** (XT).
               낭독기에는 「시즌 확인하기」가 60번, 「편집」이 60번 똑같이 들려 어느
               목적지의 것인지 알 방법이 없었다. 줄의 목적지를 버튼 이름에 넣는다. -->
          <td>${eff.season_note ? `<button type="button" class="btn-detail" aria-label="${esc(d.label || d.destination_key)} 시즌 안내 보기" title="${esc(eff.season_note)}" style="font-size:.68rem;padding:.2rem .5rem;width:100%">🌤️ 시즌 확인하기</button>` : ''}</td>
          <td style="text-align:right">${fmtWon(eff.airfare)}${rateValidationBadge(d.destination_key, 'airfare', eff.airfare)}</td>
          <td style="text-align:right">${fmtWon(eff.hotel_per_room)}${rateValidationBadge(d.destination_key, 'hotel_per_room', eff.hotel_per_room)}</td>
          <td style="text-align:right">${fmtWon(eff.meal_per_person)}${rateValidationBadge(d.destination_key, 'meal_per_person', eff.meal_per_person)}</td>
          <td style="text-align:right">${fmtWon(eff.margin_per_traveler)}</td>
          <td>${fmtRateDate(eff.rateDate)}</td>
          <td style="color:var(--muted)">${rs.months <= 999 ? rs.months + '개월' : '—'}</td>
          <td><span class="rate-badge ${rs.fxClamped ? 'stale' : rs.status}"${rs.fxPct != null ? ` title="환율 ${rs.fxPct.toFixed(1)}% 변동${rs.fxClamped ? ' — ±30% 상한에 걸려 견적에 다 반영되지 않습니다. 요율을 다시 잡아 주세요.' : ''}"` : ''}>${rs.icon} ${rs.label}${rs.fxClamped ? ' 🚨환율상한' : (rs.fxPct != null ? ' 💱' : '')}</span></td>
          <td style="display:flex;gap:.3rem">
            <button class="btn-detail" aria-label="${esc(d.label || d.destination_key)} 요율 편집" onclick="openRateEditModal('${d.destination_key}')">편집</button>
            <button class="btn-detail" aria-label="${esc(d.label || d.destination_key)} 요율을 오늘 확인함으로 기록" title="가격은 그대로, 오늘 확인했다는 것만 기록" onclick="confirmRateNoChange('${d.destination_key}')">✓ 확인함</button>
            ${(isManagerUpRole() && customDestinationKeys.has(d.destination_key)) ? `<button class="btn-detail" onclick="deleteCustomDestination('${esc(d.destination_key)}')">🗑 삭제</button>` : ''}
          </td>
        </tr>`;
  }

  /* ── 요율 편집 모달 ── */
  let rateEditCurrentKey = null;

  async function openRateEditModal(destKey) {
    const dest = destinationRates.find(d => d.destination_key === destKey);
    if (!dest) return;
    rateEditCurrentKey = destKey;
    /* 편집창을 열기 직전에 서버 최신값으로 다시 맞춘다 — 다른 브라우저/동료가
       방금 일괄 조정으로 이 목적지 가격을 이미 바꿔놨는데 화면에는 예전 값이 남아
       있는 상태로 편집·저장하면 그 변경을 모르고 덮어써버릴 수 있어서(편집·일괄
       조정 두 경로가 충돌할 수 있는 지점), 열 때마다 한 번 새로 받아온다.
       ⚠ 그 새로 받아오기가 **실패하면 편집창을 열지 않는다.** 예전엔 실패를 무시하고
       그대로 열었는데, 그건 이 안전망이 정확히 필요한 상황(값을 모르는 상황)에서만
       무력해진다는 뜻이다 — 화면엔 data.js 기본값이 뜨고, 저장하면 살아 있던 기준가를
       그 값으로 덮어쓴다. */
    if (!(await ensureFreshRates('단가 편집창 열기'))) return;
    const eff = effectiveRate(dest);
    document.getElementById('rateEditTitle').textContent = `단가 편집 — ${dest.label}`;
    document.getElementById('rate-edit-fields').innerHTML = RATE_FIELD_ORDER.map(f => `
      <div>
        <div class="detail-label" style="margin-bottom:.3rem">${RATE_FIELD_LABELS[f]}</div>
        <input type="number" class="pw-input" data-field="${f}" value="${eff[f] ?? 0}" min="0" />
      </div>`).join('');
    document.getElementById('rate-edit-notes').value = eff.notes || '';
    document.getElementById('rate-edit-season').value = eff.season_note || '';
    const authorTag = document.getElementById('rate-edit-author');
    authorTag.textContent = `작성자: ${currentUser.displayName}`;
    const region = REGION_MAP[dest.label] || '기타';
    document.getElementById('rate-edit-bulk-handoff').textContent = `📊 [${region}] 지역 전체 일괄 조정하기`;
    document.getElementById('rateEditModal').classList.remove('hidden');
    renderRateEditHistory(destKey);
  }

  /* 단가 편집 모달 ↔ 일괄 조정 모달 연결 (신규) — 지금 편집 중인 목적지가 속한
     지역을 미리 선택해 둔 채로 일괄 조정 모달을 열어 준다. "이 목적지 하나만 살짝
     고치려 했는데 알고 보니 같은 지역 전체가 다 오래됐더라" 같은 상황에서, 일괄
     조정 모달을 다시 찾아 지역을 처음부터 고르지 않아도 되게 한다. */
  function handoffToRateBulk() {
    const dest = destinationRates.find(d => d.destination_key === rateEditCurrentKey);
    if (!dest) return;
    const region = REGION_MAP[dest.label] || '기타';
    document.getElementById('rateEditModal').classList.add('hidden');
    openRateBulkModal();
    document.getElementById('rate-bulk-region').value = region;
    updateRateBulkPreview();
  }

  async function saveRateEdit() {
    const dest = destinationRates.find(d => d.destination_key === rateEditCurrentKey);
    if (!dest) return;
    const eff = effectiveRate(dest);
    const author = currentUser.displayName;

    const changes = [];
    document.querySelectorAll('#rate-edit-fields input[data-field]').forEach(inp => {
      const field = inp.dataset.field;
      const newValue = Number(inp.value);
      if (!isNaN(newValue) && newValue !== Number(eff[field] || 0)) {
        changes.push({ field, oldValue: eff[field] ?? 0, newValue });
      }
    });
    const newNotes = document.getElementById('rate-edit-notes').value.trim();
    if (newNotes !== (eff.notes || '')) changes.push({ field: 'notes', oldValue: eff.notes || '', newValue: newNotes });
    const newSeason = document.getElementById('rate-edit-season').value.trim();
    if (newSeason !== (eff.season_note || '')) changes.push({ field: 'season_note', oldValue: eff.season_note || '', newValue: newSeason });

    if (!changes.length) { alert('변경된 내용이 없습니다.'); return; }
    /* 오타 방어(신규) — 가격 항목이 기존 값에서 크게 벗어나면 저장 전에 확인.
       기준 비교값은 "바꾸기 전 값(oldValue)". cancel하면 저장 중단(편집창 유지). */
    for (const c of changes) {
      if (c.field === 'notes' || c.field === 'season_note' || c.field === 'rateDate') continue;
      if (!confirmPlausibleValue(RATE_FIELD_LABELS[c.field] || c.field, c.newValue, Number(c.oldValue) || 0)) return;
    }
    if (!confirm(`"${dest.label}" 요율을 수정하시겠습니까? (${changes.length}개 항목 변경)`)) return;

    /* 가격이 실제로 바뀌면 "요율 확인월"도 오늘로 자동 갱신 */
    const priceChanged = changes.some(c => c.field !== 'notes');
    if (priceChanged) {
      const today = new Date();
      const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      changes.push({ field: 'rateDate', oldValue: eff.rateDate || '', newValue: ym });
    }

    try {
      const res = await fetch('/api/rates', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationKey: rateEditCurrentKey, author, changes }),
      });
      const data = await res.json();
      if (!res.ok) { alert(rateSaveErrorMessage(data, res.status)); return; }
      rateOverridesCache[rateEditCurrentKey] = data.overrides;
      rateHistoryLoaded = false;   /* SZ: 이력이 바뀌었다 — 다음에 펼칠 때 새로 받는다 */
      setLastRateAction({ label: `방금 "${dest.label}" 요율을 수정했습니다.`, entries: [{ destinationKey: rateEditCurrentKey, changes }] });
      document.getElementById('rateEditModal').classList.add('hidden');
      renderRates();
    } catch (err) {
      alert('저장 요청에 실패했습니다. 네트워크를 확인해 주세요.');
    }
  }

  /* ── 새 목적지 추가 모달 (신규) ── */
  async function openNewDestModal() {
    document.getElementById('new-dest-key').value = '';
    document.getElementById('new-dest-label').value = '';
    document.getElementById('new-dest-zone').value = 'short';
    document.getElementById('new-dest-southern').checked = false;
    document.getElementById('new-dest-currency').value = '';
    document.getElementById('new-dest-region').value = '';
    document.getElementById('new-dest-country').value = '';
    document.getElementById('new-dest-notes').value = '';
    document.getElementById('new-dest-season').value = '';
    /* 시즌 프로파일 선택지 (PQ) — data.js의 DEST_SEASON_PROFILES로 매번 다시 만든다.
       하드코딩하면 프로파일을 추가했을 때 폼에만 없어서 담당자가 고를 수 없고,
       그 목적지는 조용히 공용표로 계산된다. 첫 항목(공용표)은 HTML에 두고 뒤에 붙인다. */
    const spSel = document.getElementById('new-dest-season-profile');
    spSel.length = 1;
    if (typeof DEST_SEASON_PROFILES !== 'undefined') {
      DEST_SEASON_PROFILES.filter(p => p.id).forEach(p => {
        spSel.add(new Option(p.name || p.id, p.id));
      });
    }
    spSel.value = '';
    document.getElementById('new-dest-msg').textContent = '';
    document.getElementById('new-dest-fields').innerHTML = RATE_FIELD_ORDER.map(f => `
      <div>
        <div class="detail-label" style="margin-bottom:.3rem">${RATE_FIELD_LABELS[f]}</div>
        <input type="number" class="pw-input" data-field="${f}" value="0" min="0" />
      </div>`).join('');
    const authorTag = document.getElementById('new-dest-author');
    authorTag.textContent = `작성자: ${currentUser.displayName}`;
    document.getElementById('newDestModal').classList.remove('hidden');
  }

  async function saveNewDestination() {
    const msg = document.getElementById('new-dest-msg');
    msg.textContent = '';
    const author = currentUser.displayName;

    const destinationKey = document.getElementById('new-dest-key').value.trim();
    const label = document.getElementById('new-dest-label').value.trim();
    const zone = document.getElementById('new-dest-zone').value;
    const southernHemisphere = document.getElementById('new-dest-southern').checked;
    if (!destinationKey || !label) { msg.style.color = 'var(--danger)'; msg.textContent = '목적지 키와 표시명은 필수입니다.'; return; }
    if (destinationRates.some(d => d.destination_key === destinationKey)) {
      msg.style.color = 'var(--danger)'; msg.textContent = '이미 존재하는 목적지 키입니다(내장 목적지 포함).'; return;
    }

    const fields = {};
    let fieldsValid = true;
    document.querySelectorAll('#new-dest-fields input[data-field]').forEach(inp => {
      const v = Number(inp.value);
      if (!Number.isFinite(v) || v < 0) fieldsValid = false;
      fields[inp.dataset.field] = v;
    });
    if (!fieldsValid) { msg.style.color = 'var(--danger)'; msg.textContent = '모든 단가 필드는 0 이상의 숫자여야 합니다.'; return; }

    /* 시즌 프로파일을 안 고르면 공용표(7·8·12·1월 성수기)로 계산된다는 사실을 저장 직전에
       한 번 알린다 — 권역에 따라 성수기가 정반대라(동남아 7~8월은 우기 비수기) 빈 값이
       '중립'이 아니다. 막지는 않는다: 맞는 프로파일이 없는 목적지도 실제로 있다. */
    const seasonProfile = document.getElementById('new-dest-season-profile').value;
    const seasonLine = seasonProfile
      ? `시즌: ${document.getElementById('new-dest-season-profile').selectedOptions[0].textContent}`
      : '시즌: 공용표(7·8·12·1월 성수기) — 권역 프로파일 없음';
    if (!confirm(`"${label}"을(를) 새 목적지로 추가하시겠습니까?\n${seasonLine}\n저장 즉시 공개 견적 계산기에서 선택 가능해집니다.`)) return;

    try {
      const res = await fetch('/api/rates?action=createDestination', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationKey, label, zone, southernHemisphere, fields,
          notes: document.getElementById('new-dest-notes').value.trim(),
          seasonNote: document.getElementById('new-dest-season').value.trim(),
          currency: document.getElementById('new-dest-currency').value,
          region: document.getElementById('new-dest-region').value,
          country: document.getElementById('new-dest-country').value.trim(),
          insuranceZone: document.getElementById('new-dest-insurance').value,
          seasonProfile,
          author,
        }),
      });
      const data = await res.json();
      if (!res.ok) { msg.style.color = 'var(--danger)'; msg.textContent = rateSaveErrorMessage(data, res.status).replace(/\n+/g, ' '); return; }
      await loadRateOverrides();
      document.getElementById('newDestModal').classList.add('hidden');
      renderRates();
    } catch (err) {
      msg.style.color = 'var(--danger)'; msg.textContent = '저장 요청에 실패했습니다. 네트워크를 확인해 주세요.';
    }
  }

  /* 관리자 신규 목적지 삭제 (신규) — customDestinationKeys에 있는(=내장이 아닌)
     목적지만 대상. 서버도 내장 목적지 삭제를 403으로 막지만, 여기서도 한 번 더
     방어한다. destinationRates는 const이므로 반드시 splice로 제거(재할당 금지 —
     이미 이 배열을 참조 중인 다른 클로저를 깨뜨림). */
  async function deleteCustomDestination(destKey) {
    if (!customDestinationKeys.has(destKey)) return;
    const dest = destinationRates.find(d => d.destination_key === destKey);
    if (!confirm(`"${dest ? dest.label : destKey}" 목적지를 삭제하시겠습니까?\n공개 견적 계산기에서 더 이상 선택할 수 없게 됩니다(과거 견적 기록은 유지됨).`)) return;
    try {
      const res = await fetch(`/api/rates?action=deleteDestination&destinationKey=${encodeURIComponent(destKey)}`, { method: 'DELETE' });
      if (!res.ok) { alert('삭제에 실패했습니다.'); return; }
      const idx = destinationRates.findIndex(d => d.destination_key === destKey);
      if (idx !== -1) destinationRates.splice(idx, 1);
      delete rateOverridesCache[destKey];
      customDestinationKeys.delete(destKey);
      renderRates();
    } catch (err) {
      alert('삭제 요청에 실패했습니다. 네트워크를 확인해 주세요.');
    }
  }

  /* "확인함(변경 없음)" (신규) — 편집 모달은 값을 하나라도 바꿔야만 저장이 되게
     막혀 있어서, "요율을 다시 확인해봤는데 그대로였다"는 아주 흔한 경우를 기록할
     방법이 없었다. 요율 기준월만 오늘로 갱신하는 최소 PATCH를 보내서, 굳이 9개
     항목이 있는 편집창을 열지 않고도 "확인 완료"만 빠르게 남길 수 있게 한다. */
  async function confirmRateNoChange(destKey) {
    const dest = destinationRates.find(d => d.destination_key === destKey);
    if (!dest) return;
    const author = currentUser.displayName;
    /* 이 버튼은 값을 안 바꾸는 것처럼 보이지만 환율 기준점을 오늘로 재설정한다 —
       기준값·환율 변동폭을 못 읽은 상태에서 누르면 아래 경고문의 숫자부터 틀린다. */
    if (!(await ensureFreshRates('요율 확인 기록'))) return;
    const eff = effectiveRate(dest);
    /* 환율 기준점 재설정을 반드시 알려준다 (신규) — 이 버튼은 "가격 그대로"라고만
       안내했지만, 서버는 rateDate가 갱신되면 그 목적지의 환율 기준점도 오늘로
       재설정한다(api/rates.js). 즉 그동안 쌓인 환율 보정이 사라지고 앞으로의 견적
       금액이 그만큼 내려간다(또는 올라간다).
       어느 쪽이 맞는지는 담당자가 랜드사에서 확인한 것이 '원화 금액'인지 '현지통화
       금액'인지에 달렸다 — 시스템은 그걸 알 수 없다. 그래서 지금 얼마가 걸려 있는지
       숫자로 보여주고 사람이 판단하게 한다. 조용히 바꾸는 것만은 하지 않는다. */
    const drift = adminGetFxDrift ? adminGetFxDrift(destKey) : null;
    const driftPct = drift && typeof drift.signedPct === 'number' ? drift.signedPct : 0;
    const fxWarn = Math.abs(driftPct) >= 0.5
      ? `\n\n⚠ 이 목적지는 마지막 저장 이후 환율이 ${driftPct > 0 ? '+' : ''}${driftPct.toFixed(1)}% 움직였습니다.`
        + `\n"확인함"을 누르면 환율 기준점이 오늘로 재설정되어 그 보정분이 사라집니다.`
        + `\n\n· 랜드사가 "원화 금액 그대로"라고 했다면 → 확인 누르세요`
        + `\n· 랜드사가 "현지 가격 그대로"라고 했다면 → 취소하고 원화 단가를 다시 계산해 편집하세요`
      : '';
    if (!confirm(`"${dest.label}" 요율을 확인했다고 기록할까요?\n(가격은 그대로 두고, 요율 기준월만 오늘로 갱신됩니다)${fxWarn}`)) return;

    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const changes = [{ field: 'rateDate', oldValue: eff.rateDate || '', newValue: ym }];
    try {
      const res = await fetch('/api/rates', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationKey: destKey, author, changes }),
      });
      const data = await res.json();
      if (!res.ok) { alert(rateSaveErrorMessage(data, res.status)); return; }
      rateOverridesCache[destKey] = data.overrides;
      rateHistoryLoaded = false;   /* SZ: 이력이 바뀌었다 — 다음에 펼칠 때 새로 받는다 */
      setLastRateAction({ label: `방금 "${dest.label}" 요율을 확인함으로 기록했습니다.`, entries: [{ destinationKey: destKey, changes }] });
      renderRates();
    } catch (err) {
      alert('저장 요청에 실패했습니다. 네트워크를 확인해 주세요.');
    }
  }

  /* ── 요율 일괄 조정 모달 ── */
  function openRateBulkModal() {
    const regionSel = document.getElementById('rate-bulk-region');
    /* '기타' 옵션 추가 — 지역을 지정하지 않은 커스텀 목적지(REGION_MAP에 없어 '기타'로
       분류됨)도 일괄조정 대상으로 고를 수 있게 한다(getRateBulkTargets가 '기타'를 매칭). */
    regionSel.innerHTML = '<option value="__all__">전체 지역</option>' +
      REGION_ORDER.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('') +
      '<option value="기타">기타 (지역 미지정)</option>';
    /* 재오픈 시 이전에 고른 '조정 항목'이 남아 엉뚱한 항목에 %가 적용되는 것 방지 */
    const fieldSel = document.getElementById('rate-bulk-field');
    if (fieldSel) fieldSel.selectedIndex = 0;
    const authorTag = document.getElementById('rate-bulk-author');
    authorTag.textContent = `작성자: ${currentUser.displayName}`;
    document.getElementById('rate-bulk-pct').value = '';
    updateRateBulkPreview();
    document.getElementById('rateBulkModal').classList.remove('hidden');
  }

  function getRateBulkTargets() {
    const region = document.getElementById('rate-bulk-region').value;
    return destinationRates.filter(d => region === '__all__' || (REGION_MAP[d.label] || '기타') === region);
  }

  function updateRateBulkPreview() {
    const targets = getRateBulkTargets();
    document.getElementById('rate-bulk-preview').textContent = `대상 목적지: ${targets.length}곳`;
  }

  async function applyRateBulk(btn) {
    const region = document.getElementById('rate-bulk-region').value;
    const field = document.getElementById('rate-bulk-field').value;
    const pct = Number(document.getElementById('rate-bulk-pct').value);
    const author = currentUser.displayName;
    if (!pct || isNaN(pct)) { alert('조정 비율을 입력해 주세요.'); return; }

    const targets = getRateBulkTargets();
    if (!targets.length) { alert('대상 목적지가 없습니다.'); return; }

    const fieldLabel = RATE_FIELD_LABELS[field] || field;
    const regionLabel = region === '__all__' ? '전체 지역' : region;
    if (!confirm(`${regionLabel}의 목적지 ${targets.length}곳 "${fieldLabel}"를 ${pct}% 조정하시겠습니까?\n(적용 직후 화면에서 바로 되돌릴 수 있습니다)`)) return;

    if (btn) { btn.disabled = true; btn.textContent = '적용 중...'; }
    /* 실제로 값을 쓰기 직전에 서버 최신값으로 한 번 더 맞춘다 — 모달을 열어둔 사이
       다른 곳(동료의 개별 편집 등)에서 같은 목적지 가격이 바뀌었을 수 있어서, 그
       변경 위에 안전하게 %를 적용하기 위함(편집·일괄 조정 두 경로가 서로의 최신
       값을 무시하고 덮어쓰는 충돌을 줄임).
       ⚠ 실패하면 **한 곳도 쓰지 않고 멈춘다.** 일괄 조정은 %를 곱하는 연산이라 기준값이
       틀리면 지역 전체가 한 번에 틀린 값으로 덮인다 — 개별 편집보다 피해 범위가 넓은데
       예전엔 여기서도 실패를 무시하고 그대로 진행했다. */
    if (!(await ensureFreshRates('일괄 조정'))) {
      if (btn) { btn.disabled = false; btn.textContent = '일괄 적용'; }
      return;
    }
    /* 개별 편집(saveRateEdit)은 가격이 바뀌면 요율 기준월도 오늘로 자동 갱신하는데
       일괄 조정은 그동안 이 처리가 빠져 있었음 — 방금 일괄로 가격을 확정했는데도
       "요율 기준월"이 예전 그대로 남아 갱신 필요 배지가 잘못 뜨는 불일치가 있었어서
       개별 편집과 동일하게 맞춘다. */
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    let successCount = 0;
    const succeededEntries = [];
    /* 실패 사유 수집(신규) — 예전엔 실패를 조용히 삼키고 "3/16 적용" 같은 숫자만
       띄웠다. 일부만 적용된 상태는 권역 안에서 가격이 어긋난 채 남는다는 뜻인데
       어디가 왜 빠졌는지 알 방법이 없었다. 목적지별 사유를 모아 함께 보여준다. */
    const failures = [];
    for (const dest of targets) {
      const eff = effectiveRate(dest);
      const oldValue = Number(eff[field] || 0);
      const newValue = Math.round(oldValue * (1 + pct / 100));
      const changes = [{ field, oldValue, newValue }, { field: 'rateDate', oldValue: eff.rateDate || '', newValue: ym }];
      try {
        const res = await fetch('/api/rates', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinationKey: dest.destination_key, author, changes }),
        });
        if (res.ok) {
          const data = await res.json();
          rateOverridesCache[dest.destination_key] = data.overrides;
          rateHistoryLoaded = false;   /* SZ: 이력이 바뀌었다 — 다음에 펼칠 때 새로 받는다 */
          succeededEntries.push({ destinationKey: dest.destination_key, changes });
          successCount++;
        } else {
          const data = await res.json().catch(() => null);
          failures.push(`· ${dest.label}: ${rateSaveErrorMessage(data, res.status).split('\n')[0]}`);
        }
      } catch {
        failures.push(`· ${dest.label}: 네트워크 오류`);
      }
    }
    if (btn) { btn.disabled = false; btn.textContent = '일괄 적용'; }
    alert(`${successCount}/${targets.length}개 목적지에 적용되었습니다.`
      + (failures.length ? `\n\n적용되지 않은 ${failures.length}곳:\n${failures.join('\n')}` : ''));
    document.getElementById('rateBulkModal').classList.add('hidden');
    if (succeededEntries.length) {
      setLastRateAction({ label: `방금 ${regionLabel} ${succeededEntries.length}곳 "${fieldLabel}"를 ${pct}% 일괄 조정했습니다.`, entries: succeededEntries });
    }
    renderRates();
  }

  /* ── 요율 변경 이력 모달 ── */
  let rateHistoryRowsCache = [];      /* 전체 이력 모달이 받아온 행 */
  let rateEditHistoryCache = [];      /* 편집창의 "이 목적지 이력"이 받아온 행 (PT) */
  /* api/rates.js의 HISTORY_LIMIT과 같아야 한다 — 잘렸는지 판단 기준이라 어긋나면
     잘렸는데 안 알리거나 안 잘렸는데 알린다(test_pT가 두 값을 대조한다). */
  const RATE_HISTORY_LIMIT = 300;

  function rateFieldLabel(field) {
    return RATE_FIELD_LABELS[field] || (field === 'notes' ? '비고' : field === 'rateDate' ? '요율 기준월' : field === 'season_note' ? '시즌 정보' : field);
  }

  /* 변경 이력 한 건의 HTML — 전체 이력 모달과 편집창 하단의 "이 목적지 이력"이 공유한다.
     ⚠ 되돌리기 버튼은 **위치(idx)가 아니라 행 id**를 넘긴다 (PT에서 변경).
     예전에는 두 화면이 같은 배열(rateHistoryRowsCache)을 보고 idx를 넘겼는데, 목적지별
     조회를 따로 하게 되면서 배열이 둘로 나뉘었다. 그 상태로 idx를 넘기면 두 화면이 동시에
     열렸을 때 **엉뚱한 항목을 되돌린다** — 되돌리기에서 그건 원래 결함보다 더 나쁘다.
     id는 DB serial이라 어느 배열에 있든 같은 행을 정확히 가리킨다.
     showDest=true면 목적지 이름도 표시(전체 이력 모달용), false면 필드명만. */
  function renderRateHistoryRow(r, showDest) {
    const dest = destinationRates.find(d => d.destination_key === r.destination_key);
    const label = dest ? dest.label : r.destination_key;
    const fieldLabel = rateFieldLabel(r.field);
    const title = showDest ? `${esc(label)} · ${esc(fieldLabel)}` : esc(fieldLabel);
    return `<div style="padding:.6rem .8rem;border:1px solid var(--border);background:var(--bg)">
      <div style="display:flex;justify-content:space-between;font-size:.76rem;color:var(--muted);margin-bottom:.25rem">
        <strong style="color:var(--heading)">${title}</strong>
        <span>${esc(r.author || '—')} · ${fmtDate(r.created_at)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem">
        <div style="font-size:.85rem">${esc(String(r.old_value ?? '—'))} → <strong>${esc(String(r.new_value))}</strong></div>
        <button type="button" class="btn-act btn-outline-p" style="font-size:.7rem;padding:.25rem .6rem;flex-shrink:0" onclick="revertRateChange('${safeId(String(r.id))}')">↩️ 되돌리기</button>
      </div>
    </div>`;
  }

  /* destKey를 주면 그 목적지만 조회한다 (PT) — 캐시에 넣지 않고 행을 돌려주므로
     호출부가 어느 캐시에 담을지 정한다(전체 모달과 편집창이 서로 덮어쓰지 않게). */
  async function fetchRateHistory(destKey) {
    const url = '/api/rates?history=1'
      + (destKey ? '&destinationKey=' + encodeURIComponent(destKey) : '');
    const res = await fetch(url);
    const rows = await res.json();
    return (res.ok && Array.isArray(rows)) ? rows : [];
  }

  /* 목록이 상한에 닿았으면 그 사실을 알린다 — 잘린 걸 모르면 "이력이 없다"를
     "변경이 없었다"로 오해하고, 되돌릴 수 있는 항목을 못 찾은 채 포기한다. */
  function rateHistoryTruncatedHtml(rows, scope) {
    if (rows.length < RATE_HISTORY_LIMIT) return '';
    return `<p style="color:var(--warn,#8F5D0C);font-size:.78rem;margin-bottom:.5rem">`
      + `⚠ ${scope} 최근 ${RATE_HISTORY_LIMIT}건까지만 표시됩니다. 더 오래된 변경은 여기 없습니다.</p>`;
  }

  /* 요율 관리 페이지 **맨 아래의 접힌 섹션** (SZ, 사용자 요청).
     ⚠ **펼칠 때 처음 한 번만 부른다.** 탭을 열 때마다 최근 300건을 받아오면 정작 자주
       쓰는 표가 느려진다. 다시 펼칠 때는 이미 받아 둔 것을 그대로 보여준다.
     ⚠ 요율을 저장·되돌리면 `rateHistoryLoaded`를 내려 **다음에 펼칠 때 새로 받게** 한다 —
       안 그러면 방금 한 변경이 이력에 없어서 "안 남았나?"로 읽힌다. */
  let rateHistoryLoaded = false;

  async function loadRateHistoryPanel(force) {
    const listEl = document.getElementById('rate-history-list');
    if (!listEl) return;
    if (rateHistoryLoaded && !force) return;
    listEl.innerHTML = '<p style="color:var(--muted);font-size:.82rem">불러오는 중...</p>';
    try {
      rateHistoryRowsCache = await fetchRateHistory();
      const rows = rateHistoryRowsCache;
      rateHistoryLoaded = true;
      if (!rows.length) {
        listEl.innerHTML = '<p style="color:var(--muted);font-size:.82rem">변경 이력이 없습니다.</p>';
        return;
      }
      /* 버튼 onclick에는 값을 직접 넣지 않고 행 id만 넘긴다 — 비고 등 자유서술 필드에
         따옴표가 섞여도 안전하게 캐시에서 원본 값을 그대로 읽는다. */
      listEl.innerHTML = rateHistoryTruncatedHtml(rows, '전체 목적지 기준')
        + rows.map((r) => renderRateHistoryRow(r, true)).join('');
    } catch (err) {
      /* 실패하면 **다시 시도할 수 있게** 로드 표시를 되돌린다 — 안 그러면 한 번 실패한
         뒤로는 접었다 펴도 계속 빈 채로 남는다(조용한 폴백). */
      rateHistoryLoaded = false;
      listEl.innerHTML = '<p style="color:var(--muted);font-size:.82rem">조회에 실패했습니다. 접었다 다시 펼치면 재시도합니다.</p>';
    }
  }

  /* 펼치는 순간에만 부른다 — <details>의 toggle이 그 신호다 */

/* ═══════════════════════════════════════════════════════════════════════════
   요율 관리 — 갱신 제안 · 실측 검증 · 정확도 (2b-3에서 이어 붙였다)

   🔴 **`reportValueToday`가 여기 있다.** 실측 제보를 거르는 자리는 **이 함수 하나**다
   (갱신 제안 · 기준가 경고 · 견적 정확도 · 실측 배지 네 곳이 전부 여기를 지난다).
   다른 데서 또 거르지 말 것 — 2026-08-11 대표 지시로 한 곳으로 모은 것이다.

   ⚠ 옮길 때 금액을 대조했다: 목적지 60곳 × 요율 9칸의 `effectiveRate`와
     `adminGetRateStatus`, 순수 계산 함수까지 **631건 전부 동일**(해시 대조).
     이 덩이를 다시 손댈 때도 같은 대조를 건다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ════ RATES ════════════════════════════════════════════════════════ */


  let rateFilter = 'all';

  /* 요율 신선도 판정 (admin 자체 함수 — data.js에서 RATE_META, destinationRates 사용) */
  /* ⚠ 중복 구현 주의: script.js의 getRateStatus()와 로직(3개월/6개월 임계값)이
     동일한 별도 구현입니다. 한쪽 임계값만 수정하면 고객용/관리자용 "요율 최신성"
     배지가 서로 어긋날 수 있으니, 임계값을 바꿀 때는 두 함수를 함께 수정하세요.
     (2026-07-06 야간 점검 시 확인 결과 현재는 정확히 동일함) */
  function adminGetRateStatus(rateDate) {
    if (!rateDate) return { status:'stale', months:999, label:'미확인', icon:'🔴' };
    const [y, m] = rateDate.split('-').map(Number);
    const now    = new Date();
    const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    if (months <= 3) return { status:'ok',    months, label:'최신',      icon:'✅' };
    if (months <= 6) return { status:'check', months, label:'확인 권장', icon:'⚠️' };
    return             { status:'stale', months, label:'갱신 필요',  icon:'🔴' };
  }

  /* 환율 변동 감시 (신규) — 항공료 자체는 인원 규모별 협상 견적이라 자동 갱신 대상이
     아니지만, 환율은 객관적 공개값이라 자동 감시가 가능함. 목적지 저장 시점의 환율
     (rate_fx_baseline, api/rates.js가 PATCH마다 재설정)과 오늘의 환율(fx_rates, 매일
     cron이 갱신)을 비교해 임계값 이상 움직였으면 시간 기반 판정이 아직 "최신"이어도
     "확인 권장"으로 승격시킨다. */
  const FX_DRIFT_THRESHOLD_PCT = 5;

  function adminGetFxDrift(destKey) {
    const currency = typeof DEST_CURRENCY !== 'undefined' ? DEST_CURRENCY[destKey] : null;
    if (!currency) return null;
    const baseline = fxBaselineCache[destKey];
    const current  = fxRatesCache[currency];
    if (!baseline || !baseline.rate || typeof current !== 'number') return null;
    /* pct는 절댓값(배지 표시용, 기존 호출부가 그렇게 쓴다). signedPct는 방향까지
       필요한 곳을 위해 따로 준다 — "환율이 얼마나 움직였나"만이 아니라 "올랐나
       내렸나"를 알아야 담당자가 판단할 수 있는 안내문이 있다(확인함 버튼). */
    const signedPct = (current - baseline.rate) / baseline.rate * 100;
    const pct = Math.abs(signedPct);
    /* 클램프 경고 (신규) — 견적 엔진(script.js getFxAdjust)은 환율 보정을 ±30%로
       자릅니다. 걸리면 실제 환율 변동이 견적에 덜 반영되는데, 예전엔 그 사실이
       어디에도 안 보여서 원가와 견적이 벌어진 채 방치됐습니다. 여기서 같은 임계로
       판정해 요율 표에 띄웁니다(admin.html은 script.js를 로드하지 않으므로 엔진 쪽
       기록을 그대로 쓸 수 없어 임계값만 맞춰 별도로 계산합니다).
       ⚠ script.js의 FX_CLAMP_MIN/MAX(0.7/1.3)를 바꾸면 여기 30도 같이 바꿀 것. */
    return { pct, signedPct, drift: pct >= FX_DRIFT_THRESHOLD_PCT, clamped: pct >= 30 };
  }

  function adminGetCombinedStatus(destKey, rateDate) {
    const rs = adminGetRateStatus(rateDate);
    const fx = adminGetFxDrift(destKey);
    if (fx && fx.drift && rs.status === 'ok') {
      return { status:'check', months: rs.months, label:'확인 권장', icon:'⚠️', fxPct: fx.pct, fxClamped: fx.clamped };
    }
    return { ...rs, fxPct: (fx && fx.drift) ? fx.pct : null, fxClamped: !!(fx && fx.clamped) };
  }

  function fmtRateDate(rd) {
    if (!rd) return '—';
    const [y, m] = rd.split('-');
    return `${y}.${m}`;
  }

  /* ════ 요율 실시간 오버라이드 (신규) ════
     data.js 정적값은 그대로 두고, 관리자가 수정한 항목만 rate_overrides에 저장 →
     이 캐시로 화면에서는 "실제 적용 중인 값"(정적+오버라이드 병합)을 보여준다. */
  let rateOverridesCache = {};
  let fxRatesCache = {};
  let fxBaselineCache = {};
  let coefficientsCache = {};  /* P2b: /api/rates가 준 계수 노브 오버라이드(없으면 {} → 기본값) */

  /* P2b: 견적 계수 노브 UI 스펙 — script.js/api의 COEF_SPEC와 기본값·min·max를 반드시
     동일하게 유지(한쪽만 바꾸면 관리자 입력 범위와 실제 적용 범위가 어긋남). */
  const COEF_UI_SPEC = [
    { key:'seasonStrength',   def:1.0, min:0.5, max:2.0, step:0.05, label:'시즌 강도', hint:'성수기·비수기 진폭 (항공·유류·호텔 공통)' },
    { key:'leadTimeStrength', def:1.0, min:0.5, max:2.0, step:0.05, label:'리드타임 강도', hint:'예약 임박/조기 항공 진폭 (항공·유류)' },
    { key:'peakStrength',     def:1.0, min:0.5, max:2.0, step:0.05, label:'피크 강도', hint:'골든위크·연말 등 날짜 피크 진폭 (항공·유류)' },
    { key:'hotelPeakWeight',  def:0.8, min:0.0, max:1.0, step:0.05, label:'호텔 피크 비중', hint:'항공 피크 중 호텔이 받는 비율 (0=호텔 피크 없음)' },
  ];
  function coefClamp(spec, v) {
    if (typeof v !== 'number' || !isFinite(v)) return spec.def;
    return Math.max(spec.min, Math.min(spec.max, v));
  }

  /* 관리자 신규 목적지(커스텀 목적지) 키 집합 (신규) — loadRateOverrides()가
     destinationRates에 push한 커스텀 목적지의 destination_key를 여기 기록해 두고,
     renderRateRow()에서 이 Set에 있을 때만 🗑 삭제 버튼을 노출한다(내장 56개는
     절대 삭제 버튼이 뜨지 않음). */
  let customDestinationKeys = new Set();

  /* 방금 한 편집/일괄조정 실행취소 (신규) — saveRateEdit()/applyRateBulk()가 성공할
     때마다 "지금 막 한 일"을 localStorage에 기록해 두고, 상단 배너의 되돌리기
     버튼 하나로 즉시 원복할 수 있게 한다. 단순 JS
     변수로만 두면 페이지를 새로고침하는 순간 사라져 버튼이 안 보이는 문제가 있어서
     localStorage로 저장 — 같은 브라우저라면 새로고침/탭 이동 후에도 배너가 유지됨.
     30분이 지난 기록은 오래돼 혼동을 줄 수 있어 자동으로 숨긴다(삭제는 안 하므로
     그 안에 다시 열면 여전히 되돌리기 가능). 그보다 오래된 변경은 기존 "🕘 변경
     이력" 모달의 항목별 되돌리기로 복구한다(그쪽은 DB 기반이라 기간 제한 없음). */
  const LAST_RATE_ACTION_KEY = 'linkedt_last_rate_action';
  const LAST_RATE_ACTION_TTL_MS = 30 * 60 * 1000;

  function setLastRateAction(action) {
    localStorage.setItem(LAST_RATE_ACTION_KEY, JSON.stringify({ ...action, at: Date.now() }));
  }

  function getLastRateAction() {
    const raw = localStorage.getItem(LAST_RATE_ACTION_KEY);
    if (!raw) return null;
    try {
      const action = JSON.parse(raw);
      if (!action || !action.at || Date.now() - action.at > LAST_RATE_ACTION_TTL_MS) return null;
      return action;
    } catch { return null; }
  }

  function clearLastRateAction() {
    localStorage.removeItem(LAST_RATE_ACTION_KEY);
  }

  /* 요율 관리 탭을 그릴 때마다(최초 진입 포함) 호출 — localStorage에 유효한 최근
     작업이 남아 있으면 배너를 다시 띄운다. */
  function refreshRateUndoBanner() {
    const action = getLastRateAction();
    if (action) {
      document.getElementById('rate-undo-text').textContent = action.label;
      document.getElementById('rate-undo-banner').classList.remove('hidden');
    } else {
      document.getElementById('rate-undo-banner').classList.add('hidden');
    }
  }

  function hideRateUndoBanner() {
    clearLastRateAction();
    document.getElementById('rate-undo-banner').classList.add('hidden');
  }

  async function undoLastRateAction() {
    const action = getLastRateAction();
    if (!action) { refreshRateUndoBanner(); return; }
    const author = currentUser.displayName;

    /* 배너 되돌리기도 같은 위험이 있다 (PS) — 배너는 30분간 떠 있고 그 사이 다른 사람이
       같은 목적지를 저장했을 수 있다. 예전엔 목적지 이름도 현재 값도 안 보여주고
       "○○ 되돌릴까요?"만 물었으므로, 누르는 사람은 남의 변경을 지우는 줄 알 수 없었다.
       배너는 localStorage(내 브라우저)에 있어 남의 저장을 전혀 모른다는 점도 같은 이유다.
       ⚠ 예전엔 "실패해도 되돌리기 자체는 진행"이었다. 그 조회가 바로 아래 충돌 검사
       (rateRevertConflict)의 근거인데, 실패하면 기본값과 대조하게 되어 **남의 변경을
       충돌로 잡지 못한 채 덮어쓴다** — PS에서 고친 결함이 연결 장애일 때만 되살아난다. */
    if (!(await ensureFreshRates('되돌리기'))) return;
    const undoConflicts = [];
    for (const entry of action.entries) {
      for (const c of (entry.changes || [])) {
        if (!RATE_FIELD_LABELS[c.field]) continue;   /* rateDate 같은 메타는 대조 대상이 아니다 */
        const cf = rateRevertConflict(entry.destinationKey, c.field, c.newValue);
        if (cf) {
          undoConflicts.push(`· ${entry.destinationKey} ${rateFieldLabel(c.field)}`
            + `: 지금 ${cf.current ?? '—'} → 되돌리면 ${c.oldValue ?? '—'}`);
        }
      }
    }
    let undoMsg = `${action.label} 되돌릴까요?`;
    if (undoConflicts.length) {
      undoMsg += `\n\n⚠ 그 뒤에 다른 변경이 있는 항목 ${undoConflicts.length}건 —`
        + ` 되돌리면 아래 '지금' 값이 사라집니다:\n`
        + undoConflicts.slice(0, 8).join('\n')
        + (undoConflicts.length > 8 ? `\n· ... 외 ${undoConflicts.length - 8}건` : '');
    }
    if (!confirm(undoMsg)) return;

    let successCount = 0;
    const undoFailures = [];
    for (const entry of action.entries) {
      const reversedChanges = entry.changes.map(c => ({ field: c.field, oldValue: c.newValue, newValue: c.oldValue }));
      try {
        const res = await fetch('/api/rates', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinationKey: entry.destinationKey, author, changes: reversedChanges }),
        });
        if (res.ok) {
          const data = await res.json();
          rateOverridesCache[entry.destinationKey] = data.overrides;
          rateHistoryLoaded = false;   /* SZ: 이력이 바뀌었다 — 다음에 펼칠 때 새로 받는다 */
          successCount++;
        } else {
          const data = await res.json().catch(() => null);
          undoFailures.push(`· ${entry.destinationKey}: ${rateSaveErrorMessage(data, res.status).split('\n')[0]}`);
        }
      } catch { undoFailures.push(`· ${entry.destinationKey}: 네트워크 오류`); }
    }
    /* 되돌리기가 일부만 성공하면 '실수를 물렀다'고 믿은 채 원래 값과 바뀐 값이
       섞여 남는다 — 되돌리기야말로 실패를 숨기면 안 되는 경로라 사유까지 띄운다. */
    alert(`${successCount}/${action.entries.length}건 되돌렸습니다.`
      + (undoFailures.length ? `\n\n되돌리지 못한 ${undoFailures.length}건:\n${undoFailures.join('\n')}\n\n요율 변경 이력에서 개별로 되돌릴 수 있습니다.` : ''));
    clearLastRateAction();
    renderRates();
  }
  const RATE_FIELD_LABELS = {
    airfare: '항공료', fuel_surcharge: '유류할증료', hotel_per_room: '호텔(1박)',
    meal_per_person: '1인 1일 식비', vehicle_large: '대형 차량', vehicle_small: '소형 차량',
    guide_fee: '가이드비', sightseeing_fee: '관광비', margin_per_traveler: '1인당 마진',
    /* TJ: 골프 라운딩 1인 1회(그린피+카트+캐디피). **0이면 「골프를 안 판다」**는 뜻이고
       고객 화면에서 골프 옵션이 잠긴다 — 「값을 아직 모른다」가 아니다.
       ⚠ 관광비와 자릿수가 달라 따로 둔 칸이다. 관광비에 섞으면 그 목적지 관광비 기준이
         왜곡되고 골프를 안 치는 고객의 견적까지 간다. */
    golf_fee: '골프(1인 1회)',
  };
  const RATE_FIELD_ORDER = Object.keys(RATE_FIELD_LABELS);

  /* 서버에서 현재 기준가(rate_overrides)를 읽지 못한 상태를 기억한다.
     ⚠ 예전엔 실패를 console.warn으로만 남기고 캐시를 그대로 뒀다. 그러면 화면이
     **data.js 폴백 기본값을 운영 중인 기준가인 것처럼** 그린다(CLAUDE.md: 요율의 진실은
     data.js가 아니라 운영 DB다). 담당자는 "값이 낡았네"로 읽고 고쳐 저장하고, 그 저장은
     살아 있던 오버라이드를 덮어쓴다. 변경 이력에는 실제로 존재한 적 없는 '이전 값'이
     남으므로 되돌리기(PS)도 그 값으로 돌아간다 — 조용한 폴백이 데이터를 지우는 자리다.
     더 나쁜 건, 편집창을 열 때와 일괄 조정 직전에 "서버 최신값으로 다시 맞춘다"는
     안전망이 이미 있었는데 **그 안전망이 실패하면 아무 일도 하지 않았다**는 점이다
     (결함 생성기 ③ — 안전망은 발동하는 것까지 확인해야 안전망이다). */
  let rateOverridesStale = null;   // null = 정상, { status } | { network: true } = 못 읽음

  /* 못 읽었다는 사실을 사람 말로. 세션 만료(401)와 서버·네트워크 문제는 할 일이 다르다. */
  function rateStaleReason() {
    if (!rateOverridesStale) return '';
    if (rateOverridesStale.status === 401 || rateOverridesStale.status === 403) {
      return '로그인이 만료되어 현재 기준가를 불러오지 못했습니다. 다시 로그인해 주세요.';
    }
    return rateOverridesStale.network
      ? '네트워크 문제로 현재 기준가를 불러오지 못했습니다.'
      : `서버가 현재 기준가를 주지 못했습니다 (오류 ${rateOverridesStale.status}).`;
  }

  async function loadRateOverrides() {
    try {
      const res = await fetch('/api/rates');
      if (!res.ok) {
        console.warn('[admin] 요율 오버라이드 조회 실패:', res.status);
        rateOverridesStale = { status: res.status };
        return false;
      }
      {
        const data = await res.json();
        rateOverridesCache = data.overrides || {};
        fxRatesCache = data.fxRates || {};
        fxBaselineCache = data.fxBaseline || {};
        coefficientsCache = data.coefficients || {};  /* P2b */
        /* 관리자 신규 목적지 병합 (신규) — 이 함수가 여러 곳에서 호출되므로(편집
           모달 열기, 일괄조정, 새 목적지 저장 후 등) .some() 중복 체크가 없으면
           호출할 때마다 같은 커스텀 행이 destinationRates에 계속 쌓인다. */
        (data.customDestinations || []).forEach(row => {
          const { zone, southern_hemisphere, ...destFields } = row;
          if (!destinationRates.some(d => d.destination_key === destFields.destination_key)) destinationRates.push(destFields);
          customDestinationKeys.add(destFields.destination_key);
          /* 지역 분류를 REGION_MAP에 편입 — 안 하면 label이 REGION_MAP에 없어 '기타'로
             빠지고 요율 일괄조정(지역 단위)에서 조용히 누락된다. region이 비면 종전대로 '기타'. */
          if (row.region) REGION_MAP[row.label] = row.region;
          /* 나라 분류도 같이 편입 (RY) — 안 하면 커스텀 목적지의 호텔이 '나라 미지정'으로
             빠진다. 값이 없으면 일부러 넣지 않는다(아래 화면이 COUNTRY_UNSET으로 드러낸다). */
          if (row.country) DEST_COUNTRY[destFields.destination_key] = row.country;
          /* 통화를 클라이언트 DEST_CURRENCY에 편입 — adminGetFxDrift가 이 맵을 보므로,
             안 하면 커스텀 목적지는 환율 변동 감지(💱)가 안 뜬다. 서버는 이미
             custom_destinations.currency로 rate_fx_baseline을 심어 FX 계산은 동작한다. */
          if (row.currency && typeof DEST_CURRENCY !== 'undefined') DEST_CURRENCY[destFields.destination_key] = row.currency;
        });
        rateOverridesStale = null;
        return true;
      }
    } catch (err) {
      console.warn('[admin] 요율 오버라이드 조회 실패:', err);
      rateOverridesStale = { network: true };
      return false;
    }
  }

  function effectiveRate(dest) {
    return { ...dest, ...(rateOverridesCache[dest.destination_key] || {}) };
  }

  /* ── P2b: 견적 계수 조정 UI ────────────────────────────────────────────
     매니저+만 카드가 보이고, 직원에겐 숨긴다(서버도 매니저+ 권한을 강제). 입력값은
     COEF_UI_SPEC의 min/max로 클램프해 저장하고, 저장 즉시 캐시를 갱신해 다음 견적부터
     반영된다(공개 계산기는 페이지 로드 시 /api/rates로 같은 값을 받아 적용). */
  function coefCurrentValue(spec) {
    const v = coefficientsCache[spec.key];
    return (typeof v === 'number' && isFinite(v)) ? coefClamp(spec, v) : spec.def;
  }
  function renderCoefficients() {
    const wrap = document.getElementById('coef-fields');
    const card = document.getElementById('coef-tuning-card');
    if (!wrap || !card) return;
    /* 매니저+ 전용 — 서버가 진짜 방어선이지만 직원에겐 애초에 안 보이게 한다. */
    card.classList.toggle('hidden', !isManagerUpRole());
    if (!isManagerUpRole()) return;
    wrap.innerHTML = COEF_UI_SPEC.map(s => {
      const val = coefCurrentValue(s);
      const changed = Math.abs(val - s.def) > 1e-9;
      return `
        <label style="display:flex;flex-direction:column;gap:.3rem;font-size:.82rem">
          <span style="font-weight:700;color:var(--heading)">${s.label}
            ${changed ? '<span class="rate-badge check" style="margin-left:.3rem">조정됨</span>' : ''}
          </span>
          <input type="number" data-coef="${s.key}" value="${val}" min="${s.min}" max="${s.max}" step="${s.step}"
                 style="padding:.45rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.9rem" />
          <span style="font-size:.72rem;color:var(--muted)">${s.hint}<br>범위 ${s.min}~${s.max} · 기본 ${s.def}</span>
        </label>`;
    }).join('');
    const msg = document.getElementById('coef-save-msg');
    if (msg) msg.textContent = '';
  }
  function resetCoefficientsToDefault() {
    document.querySelectorAll('#coef-fields input[data-coef]').forEach(inp => {
      const spec = COEF_UI_SPEC.find(s => s.key === inp.dataset.coef);
      if (spec) inp.value = spec.def;
    });
    const msg = document.getElementById('coef-save-msg');
    if (msg) { msg.style.color = 'var(--muted)'; msg.textContent = '기본값으로 채웠습니다. "계수 저장"을 눌러야 반영됩니다.'; }
  }
  async function saveCoefficients() {
    const msg = document.getElementById('coef-save-msg');
    const payload = {};
    let valid = true;
    document.querySelectorAll('#coef-fields input[data-coef]').forEach(inp => {
      const spec = COEF_UI_SPEC.find(s => s.key === inp.dataset.coef);
      if (!spec) return;
      const v = Number(inp.value);
      if (!Number.isFinite(v) || v < spec.min || v > spec.max) valid = false;
      payload[spec.key] = v;
    });
    if (!valid) {
      if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = '각 값은 지정된 범위 안의 숫자여야 합니다.'; }
      return;
    }
    if (!confirm('견적 계수를 저장하시겠습니까?\n전 목적지·전 견적의 계산에 즉시 반영됩니다.')) return;
    try {
      const res = await fetch('/api/rates?action=saveCoefficients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coefficients: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = '저장 실패: ' + (data.error || res.status); }
        return;
      }
      coefficientsCache = data.coefficients || payload;
      renderCoefficients();
      if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '저장되었습니다. 새 견적부터 반영됩니다.'; }
    } catch (err) {
      if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = '저장 요청 실패 — 네트워크를 확인해 주세요.'; }
    }
  }

  function fmtWon(n) { return '₩' + Math.round(n || 0).toLocaleString('ko-KR'); }

  /* 실제 계약 데이터 기반 갱신 제안 (신규) — 계약완료 견적에 담당자가 입력한 실제
     항공료를, 그 견적을 계산할 당시의 추정 항공료(items의 '항공' 항목 unit)와
     견적 하나하나 비율(실제/추정)로 비교한다. 견적마다 계절·출발지 등 조건이
     달라도 "그 조건에서 우리가 얼마나 벗어났는지" 비율은 조건과 무관하게 비교
     가능하므로, 목적지별 (이상치 제외 후) 중앙값 비율을 현재 기준가에 곱해 제안값을 만든다.
     항공료 외에 호텔(hotel_per_room)·식비(meal_per_person)도 같은 방식으로 계산한다.
     세 항목 모두 두 소스를 쓴다: (1) 견적관리 상세 모달의 실제 계약가(actual*Unit —
     항공료·호텔·식비 필드가 모두 존재) (2) "실제 계약가 업데이트" 위젯 제보. 단 두
     소스는 비율의 분모가 달라(EM=계수 포함 추정단가 대비, 제보=계수 없는 기준가 대비)
     절대 섞지 않고 source로 분리 집계하며, 자동적용은 계수 보정된 EM 소스에만 허용한다
     (제보로 기준가를 올리면 견적에서 시즌·피크가 이중 반영되므로). 표본이
     RATE_SUGGEST_CONFIDENT_COUNT(5건) 미만이면
     데이터 하나(오타·특가 등)에 공개 견적 계산기 가격이 흔들릴 위험이 있어
     "요율 편집하기"로 사람이 한 번 더 들여다보게 하고, 그 이상 쌓인 것만 확인
     1클릭으로 바로 반영 가능한 "지금 바로 적용" 버튼을 보여준다(완전 자동
     반영은 하지 않음 — 논의 후 절충). */
  /* ⚠ **1건이어도 제안한다**(2026-08-10 대표 지시). 예전엔 2건 미만이면 아무것도 안
     띄웠는데, 그러면 **그 목적지의 첫 견적서가 통째로 묻힌다** — 지시는 이렇다:
     「특정 지역에 견적이 하나뿐이면 우선 그걸 기준으로 잡고, 이후 그 지역 견적이 쌓이면
      그 지역 것들끼리만 평균을 내면서 오차를 줄여라.」
     ⚠ 안전장치는 그대로다 — 이건 **제안**이고 사람이 눌러야 반영된다. 「지금 바로 적용」
       버튼은 여전히 5건 이상 + 계수 보정된 EM 소스에만 붙는다(confident).
     ⚠ 집계는 **언제나 목적지별**이다(`${destKey}|${field}` 키). 지역을 섞어 평균 내면
       발리 가이드 99,000과 시드니 400,000이 한 통에 들어간다 — 그건 기준이 아니다. */
  const RATE_SUGGEST_MIN_COUNT = 1;
  const RATE_SUGGEST_CONFIDENT_COUNT = 5;
  /* 최근성(신규) — 이 개월 수 이내 데이터만 집계에 쓴다. 오래된 계약가가 계속 평균을
     붙잡아 최신 시세 반영을 늦추는 문제를 막는다. 요율 검토 주기가 분기라 12개월이면
     최근 4개 분기치가 남아 표본이 과하게 줄지 않으면서 1년 넘은 건 배제된다. */
  const RATE_SUGGEST_RECENT_MONTHS = 12;
  /* 최근성 컷오프 — 30일×개월 근사(360일) 대신 실제 달력 기준 N개월 전 날짜를 쓴다.
     아래 rateValidationBadge의 개월 계산(달력 기반)과 경계가 정확히 맞도록 통일. */
  const RATE_SUGGEST_RECENT_CUTOFF = () => { const d = new Date(); d.setMonth(d.getMonth() - RATE_SUGGEST_RECENT_MONTHS); return d.getTime(); };
  /* 두 시각(ms) 사이의 달력 개월 수 — getRateStatus/adminGetRateStatus와 동일 공식. */
  const monthsSince = (tsMs) => { const t = new Date(tsMs), n = new Date(); return (n.getFullYear() - t.getFullYear()) * 12 + (n.getMonth() - t.getMonth()); };
  /* 이상치 방어(신규) — 기준가 대비 이 배율 범위를 벗어난 제보(예: 420,000을
     4,200,000으로 오타)는 집계에서 제외하고, 제외 건수는 UI에 알려 사람이 확인하게 한다.
     남은 값은 평균이 아니라 중앙값(median)으로 대표값을 잡아 한두 건의 이상치에 덜
     흔들리게 한다. */
  const RATE_SUGGEST_RATIO_MIN = 0.5;
  const RATE_SUGGEST_RATIO_MAX = 2.0;
  function ratioMedian(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length;
    if (!n) return null;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  /* TB: **9칸을 뽑는데 제안은 셋만 보고 있었다.** 유류·차량·가이드·관광이 제보에 다
     들어 있는데 갱신 제안에는 안 떴다 — 실측(제보 9건): 항공·호텔·식비 13건 외에
     **19건이 화면 밖에 있었다**(싱가포르 가이드 +426% · 다낭 차량 +343% · 다낭 관광 +179% …).
     사장님이 요율을 정하려면 그게 보여야 한다.
     ⚠ 판매가(sell)는 넣지 않는다 — 요율 항목이 아니라 **우리 견적의 정확도를 재는 기준선**이다. */
  const RATE_SUGGEST_REPORT_FIELDS = {
    airfare: 'airfareUnit', fuel_surcharge: 'fuelUnit', hotel_per_room: 'hotelUnit',
    meal_per_person: 'mealUnit', vehicle_large: 'vehicleUnit', guide_fee: 'guideUnit',
    sightseeing_fee: 'sightUnit',
    /* TJ: 골프도 여기 들어와야 견적서가 쌓일 때 제안이 알려 준다. 빠뜨리면 골프만
       영영 손으로 넣어야 한다 — 이 칸을 만든 이유가 바로 그것이다. */
    golf_fee: 'golfUnit',
  };

  /* TB: **검산 안 된 값으로 요율을 논하지 않는다**(SN에서 정한 원칙 그대로).
     그냥 넓혔으면 싱가포르 가이드 1,840,000이 「가이드 요율을 35만 → 184만으로」라는
     제안이 됐을 것이다 — 그 값은 **전 일정 총액**이다(÷6일 하면 306,667로 기준가에 맞는다).
     화면은 그 값에 「검산 안 됨」 배지를 붙여 확인을 요청하는데, 제안이 그걸 무시하고
     집계하면 **화면과 제안이 서로 다른 말을 한다.**
     ⚠ `field_sources`가 **없는 옛 제보는 「모름」**이다 — 빼지 않고 집계하되 그 사실을
       화면에 밝힌다. 빼 버리면 SX 이전에 넣은 제보가 통째로 사라진다(조용한 손실). */
  const reportFieldVia = (r, rateField) => (r.fieldSources || {})[REPORT_FX_KEY[rateField]] || null;
  const reportFieldUnchecked = (r, rateField) => reportFieldVia(r, rateField) === 'unchecked';
  const reportFieldViaUnknown = (r, rateField) => reportFieldVia(r, rateField) === null;

  /* ── SG: 제보 금액을 **오늘 환율 기준으로 되돌린다** ──────────────────────────
     요율표 단가는 「오늘 환율 기준」이라는 약속 위에 서 있다 — `rate_fx_baseline`에
     기준 환율을 적어 두고, 견적 엔진이 `오늘 ÷ 기준`으로 보정한다(getFxAdjust).
     그런데 견적서에서 뽑은 제보 금액에는 **그 견적서의 환율**이 박혀 있다.
     그대로 기준가와 비교하면 두 환율의 차이가 통째로 '오차'로 둔갑한다.
     실측(코퍼스 34건, 2026-08-10 환율 대비): 중앙값 5.1% · 최대 12.1%
     (BSI 도쿄 ¥10 vs 8.92 · 일본 견적서 10건이 전부 9.5). 트랙 A 목표가 ±5%라
     이것 하나로 갱신 제안이 통째로 흔들린다.
     ⚠ **제보의 fxFields에 적힌 항목만** 되돌린다. 한 견적서 안에서도 원화로 적힌 항목이
        섞인다(키움 하노이: 항공은 원화, 차량은 달러). 전부 되돌리면 원화 항목이 엉뚱하게 움직인다.
     ⚠ 오늘 환율을 모르면 **손대지 않는다.** 모르는 채로 고치는 것보다 그대로 두는 게 낫다.
     ⚠ 이 함수를 거치지 않고 `r.airfareUnit`을 직접 쓰면 그 자리만 조용히 옛 환율로
        비교된다. 제보 금액을 기준가와 견주는 곳은 **전부 이 함수를 통한다**(세 곳: 갱신
        제안 · 기준가 이상 경고 · 견적 정확도). */
  const REPORT_FX_KEY = {
    airfare: 'airfare', fuel_surcharge: 'fuel', hotel_per_room: 'hotel',
    meal_per_person: 'meal', vehicle_large: 'vehicle', guide_fee: 'guide',
    sightseeing_fee: 'sight', golf_fee: 'golf',
  };
  const REPORT_VALUE_KEY = {
    airfare: 'airfareUnit', fuel_surcharge: 'fuelUnit', hotel_per_room: 'hotelUnit',
    meal_per_person: 'mealUnit', vehicle_large: 'vehicleUnit', guide_fee: 'guideUnit',
    sightseeing_fee: 'sightUnit',
    /* TJ: 골프도 이 셋(REPORT_FX_KEY·REPORT_VALUE_KEY·RATE_SUGGEST_REPORT_FIELDS)에
       **다 들어가야** 한다. 하나만 빠뜨리면 그 자리에서만 조용히 빠진다 — 환율 되돌리기가
       안 되거나(옛 환율로 비교), 「평균에서 빼기」가 안 먹거나, 제안에서 사라진다. */
    golf_fee: 'golfUnit',
  };
  /* SU: 담당자가 「평균에서 빼기」로 표시한 항목 (2026-08-11 대표 지시).
     ⚠ **여기 한 곳에서만 뺀다.** 이 함수가 제보 금액을 기준가와 견주는 **유일한 관문**이라
       (갱신 제안 · 기준가 경고 · 견적 정확도 · 실측 N건 배지 네 곳이 전부 여기를 지난다)
       여기서 빼면 네 곳이 한 번에 빠진다. 화면마다 따로 거르면 반드시 한 곳을 빠뜨린다
       (결함 생성기 ①).
     ⚠ **값을 지우는 것이 아니다.** 제보 목록에는 그대로 보이고 사유가 함께 뜬다 —
       참고자료로는 쓴다. 평균에만 안 들어간다. */
  const reportFieldExcluded = (report, rateField) =>
    !!(report && report.excludedFields && report.excludedFields[REPORT_FX_KEY[rateField]]);
  const reportExcludeReason = (report, rateField) =>
    (report && report.excludedFields && report.excludedFields[REPORT_FX_KEY[rateField]]) || '';

  function reportValueToday(report, rateField) {
    if (reportFieldExcluded(report, rateField)) return null;
    const v = report ? report[REPORT_VALUE_KEY[rateField]] : null;
    if (v == null || !isFinite(v)) return null;
    const cur = report.fxCurrency, rate = Number(report.fxRate);
    if (!cur || !(rate > 0)) return v;                                    // 원화 제보다
    if ((report.fxFields || []).indexOf(REPORT_FX_KEY[rateField]) < 0) return v;  // 이 항목은 원화였다
    const today = Number(fxRatesCache[cur]);
    if (!(today > 0)) return v;                                           // 오늘 환율을 모른다
    return v * (today / rate);
  }
  /* 오타 방어(신규) — 제보/편집 시 입력값이 기준가에서 이 배율 밖으로 벗어나면
     오타(예: 420,000→4,200,000)일 확률이 높으니 확인창을 띄운다. base가 없으면(신규
     등) 비교 불가 → 통과. 반환 true면 진행해도 됨. */
  const PLAUSIBLE_HIGH = 3;
  const PLAUSIBLE_LOW = 1 / 3;
  function confirmPlausibleValue(fieldLabel, value, base) {
    if (value == null || !isFinite(value) || !base || base <= 0) return true;
    const ratio = value / base;
    if (ratio > PLAUSIBLE_HIGH || ratio < PLAUSIBLE_LOW) {
      const desc = ratio >= 1 ? `약 ${ratio.toFixed(1)}배` : `약 1/${(1 / ratio).toFixed(1)}`;
      return confirm(`입력하신 ${fieldLabel} ${fmtWon(value)}은(는) 현재 기준가 ${fmtWon(base)}의 ${desc}입니다.\n오타가 아닌지 확인해 주세요. 이대로 진행할까요?`);
    }
    return true;
  }

  /* 요율 저장 실패 사유를 사람 말로 (신규) — 서버가 오타 상한(value_out_of_range)을
     새로 막기 시작했는데, 기존 실패 처리는 에러 코드를 그대로 노출해서
     "저장에 실패했습니다: value_out_of_range"가 뜬다. 팀원이 보고 무엇을 어떻게
     고쳐야 할지 알 수 없으므로 어느 항목이 얼마나 넘었는지까지 풀어서 보여준다.
     위 confirm 경고(3배)를 무시하고 진행했을 때 마지막으로 만나는 안내문이다. */
  function rateSaveErrorMessage(data, status) {
    if (data && data.error === 'value_out_of_range' && Array.isArray(data.fields)) {
      const lines = data.fields.map(f =>
        `· ${RATE_FIELD_LABELS[f.field] || f.field}: 입력 ${fmtWon(f.value)} (허용 상한 ${fmtWon(f.max)})`);
      return '입력값이 너무 큽니다. 0을 하나 더 붙이지 않았는지 확인해 주세요.\n\n'
        + lines.join('\n') + '\n\n저장된 값은 없습니다. 수정 후 다시 저장해 주세요.';
    }
    /* 새 목적지 생성 경로는 항목별로 invalid_field_<필드>를 돌려준다 — 같은 상한에
       걸린 것이므로 여기서 함께 사람 말로 바꾼다. */
    if (data && typeof data.error === 'string' && data.error.startsWith('invalid_field_')) {
      const f = data.error.slice('invalid_field_'.length);
      return `"${RATE_FIELD_LABELS[f] || f}" 값을 확인해 주세요.\n숫자가 아니거나, 음수이거나, 허용 범위를 넘었습니다(0을 하나 더 붙이지 않았는지 확인).`;
    }
    if (data && data.error === 'forbidden') return '이 작업은 권한이 없습니다. 관리자에게 문의해 주세요.';
    /* 새 목적지의 분류값(권역·통화·시즌) 거절 — 여기까지 오면 화면 선택지와 서버 허용
       목록이 어긋난 것이므로, 담당자에게 "다시 입력"이 아니라 "고칠 수 없다"를 알려야 한다. */
    const CLASSIFY_ERRORS = {
      invalid_season_profile: '시즌 프로파일',
      invalid_insurance_zone: '보험 권역',
      invalid_currency: '현지 통화',
      invalid_region: '지역 분류',
      invalid_zone: '비즈니스석 구간',
    };
    if (data && CLASSIFY_ERRORS[data.error]) {
      return `"${CLASSIFY_ERRORS[data.error]}" 선택값이 서버에서 허용되지 않았습니다.\n`
        + '화면의 선택지와 서버 설정이 어긋난 상태이므로, 값을 바꿔 다시 시도하기보다 개발 담당자에게 알려주세요.';
    }
    if (status === 401) return '로그인이 만료되었습니다. 새로고침 후 다시 로그인해 주세요.';
    /* 세션 확인 자체가 실패한 경우 (PW) — 계정이 만료된 게 아니라 서버가 계정 상태를
       못 읽은 것이다. '만료'로 안내하면 담당자가 재로그인을 반복하게 된다. */
    if (data && data.error === 'session_check_failed') {
      return '서버가 계정 상태를 확인하지 못해 저장되지 않았습니다.\n'
        + '로그인이 풀린 것은 아니니 잠시 후 다시 시도해 주세요.';
    }
    return '저장에 실패했습니다: ' + ((data && data.error) || status || '');
  }
  /* 기준가 이상 경고(신규) — 현재 기준가가 최근 실측 중앙값과 이 비율 이상 벌어지면
     요율표에 경고 배지를 띄운다(잘못 반영된 기준가가 견적을 계속 망치는 걸 탐지). */
  const RATE_BASE_DRIFT_WARN = 0.4;

  /* "실제 계약가 업데이트" 위젯이 남긴 목적지 무관 제보 목록(신규) — 견적관리 상세
     모달의 quotes.actual_airfare_unit과 달리 특정 견적 계산 당시의 "추정가"가 없으므로,
     아래 computeRateSuggestions()에서는 이 소스의 비율을 "현재 기준가 대비"로
     계산해 견적 기반 비율과 함께 평균 낸다. */
  let priceReportsCache = [];
  /* 제보를 못 읽은 것과 제보가 없는 것은 화면에서 똑같이 보인다 — 갱신 제안 카드가
     그냥 숨겨지기 때문이다(renderRateSuggestions는 후보 0건이면 카드를 감춘다).
     담당자는 "실측 대비 고칠 게 없구나"로 읽지만 사실은 아무것도 대조하지 못한 것이다.
     조회 실패를 기억해 두고 경고띠에 함께 적는다(결함 생성기 ② — 폴백은 흔적을 남긴다). */
  let priceReportsStale = false;
  async function loadPriceReports() {
    try {
      const res = await fetch('/api/quotes?action=priceReports');
      if (!res.ok) {
        console.warn('[admin] 실제 가격 제보 조회 실패:', res.status);
        priceReportsCache = []; priceReportsStale = true;
        return false;
      }
      const data = await res.json();
      /* 🔴 **배열이 아니면 배열인 척 쓰지 않는다** (2026-09-15).
         서버는 정상 경로에서 늘 배열을 준다(`handlePriceReports`가 `rows.map(...)`).
         HTTP 실패와 JSON 파싱 실패도 이미 위아래에서 막힌다. 그런데 **200인데 배열이
         아닌 본문** 한 가지가 남아 있었다(프록시·배포 전환 중 끼어드는 응답 따위).
         그러면 `priceReportsCache`가 객체가 되어 **요율 갱신 제안·검증 배지·제보 내역
         모달이 통째로 죽는다**(`.forEach`/`.map`/`.some`이 7곳에서 맨몸으로 돈다).

       ⚠ **`(priceReportsCache || [])` 방어는 이걸 못 막는다.** 그 꼴이 9곳 있는데
         `{}`는 truthy라 그대로 통과한다 — **막는 척만 하고 있었다.** 그래서 쓰는 쪽
         14곳에 방어를 흩뿌리는 대신 **들어오는 이 한 곳**에서 거른다(목록이 흩어지면
         반드시 하나를 빠뜨린다 — 결함 생성기 ①).

       ⚠ 조용히 비우지 않는다. `priceReportsStale`을 세워 **경고띠에 흔적을 남긴다** —
         「제보를 못 읽은 것」과 「제보가 없는 것」은 화면에서 똑같이 보이기 때문이다
         (바로 위 주석이 그래서 이 깃발을 만든 것이다). */
      if (!Array.isArray(data)) {
        console.warn('[admin] 실제 가격 제보가 배열이 아닙니다:', typeof data);
        priceReportsCache = []; priceReportsStale = true;
        return false;
      }
      priceReportsCache = data;
      priceReportsStale = false;
      return true;
    } catch (err) {
      console.warn('[admin] 실제 가격 제보 조회 실패:', err);
      priceReportsCache = []; priceReportsStale = true;
      return false;
    }
  }

  function computeRateSuggestions() {
    if (typeof destinationRates === 'undefined') return [];
    const byKey = {}; // `${destKey}|${field}` -> { destKey, field, label, ratios }
    /* SU: 담당자가 평균에서 뺀 건수 — 조용히 빼지 않고 표에 적는다 */
    const excludedByKey = {};
    /* TB: 검산 안 돼 뺀 건수 · 출처를 몰라 그냥 쓴 건수 — 둘 다 표에 적는다 */
    const uncheckedByKey = {};
    const unknownByKey = {};

    /* 최근성 필터(신규) — 최근 RATE_SUGGEST_RECENT_MONTHS개월 이내 데이터만 집계.
       날짜가 없거나 파싱 안 되는 건 데이터 유실 방지를 위해 배제하지 않는다. */
    const recentCutoff = RATE_SUGGEST_RECENT_CUTOFF();
    const isRecent = (dateVal) => {
      if (dateVal == null || dateVal === '') return true;
      const t = new Date(dateVal).getTime();
      return isNaN(t) ? true : t >= recentCutoff;
    };

    /* ⚠ 두 소스는 비율의 '분모'가 달라 절대 한 배열에 섞으면 안 된다:
       · EM(계약완료 견적): 실제가 / estItem.unit — estItem.unit엔 시즌·피크·리드타임·PAX
         등 계수가 이미 곱해져 있으므로, 이 비율로 기준가를 조정하면 계수가 제거된 순수
         원가가 나온다(올바른 방향). → 자동적용(confident) 자격 부여.
       · 제보(위젯): 실제가 / effectiveRate(원본 기준가) — 계수가 하나도 안 들어간 값 대비라
         성수기·피크 프리미엄이 그대로 비율에 섞인다. 이 비율로 기준가를 올리면 나중에 견적
         계산에서 시즌·피크 계수가 다시 곱해져 이중 반영된다. 제보엔 출발월/시즌 메타가 없어
         계수 복원이 불가하므로, 참고용 제안으로만 두고 자동적용은 금지(사람이 편집 판단).
       그래서 byKey 키에 source를 포함해 EM과 제보를 분리 집계한다. */

    /* 항공료·호텔·식비: 견적관리 상세 모달에 남긴 실제/추정 비율 (계수 보정됨).
       세 실측 소스(갱신제안·정확도·검증배지)가 같은 필드 집합을 보도록 식비까지 포함. */
    const EM_FIELD_SOURCES = [
      { field: 'airfare', actualKey: 'actualAirfareUnit', match: it => it.name === '항공' },
      { field: 'hotel_per_room', actualKey: 'actualHotelUnit', match: it => (it.name || '').startsWith('호텔') },
      { field: 'meal_per_person', actualKey: 'actualMealUnit', match: it => it.name === '식사' },
    ];
    EM_FIELD_SOURCES.forEach(({ field, actualKey, match }) => {
      getEstsFull().filter(e => e.status === 'contracted' && e[actualKey] != null && e.destKey && isRecent(e.ts)).forEach(e => {
        const estItem = (e.items || []).find(match);
        if (!estItem || !estItem.unit) return;
        const key = `${e.destKey}|${field}|em`;
        if (!byKey[key]) byKey[key] = { destKey: e.destKey, field, label: e.destLabel || e.destKey, source: 'em', ratios: [] };
        byKey[key].ratios.push(e[actualKey] / estItem.unit);
      });
    });

    /* 항공료·호텔·식비: "실제 계약가 업데이트" 위젯 제보 (계수 미보정 — 참고용) */
    priceReportsCache.forEach(r => {
      if (!isRecent(r.createdAt)) return;
      const dest = destinationRates.find(d => d.destination_key === r.destinationKey);
      if (!dest) return;
      const eff = effectiveRate(dest);
      Object.keys(RATE_SUGGEST_REPORT_FIELDS).forEach((field) => {
        /* SU: 담당자가 평균에서 뺀 항목은 **몇 건인지 세어 화면에 적는다.**
           조용히 빼면 "왜 3건인데 2건이라 하지"가 되고, 그러면 아무도 이 표를 못 믿는다
           (SN에서 「검산 안 된 N건 제외」를 표에 찍기로 한 것과 같은 이유다). */
        if (reportFieldExcluded(r, field)) {
          const ek = `${r.destinationKey}|${field}|report`;
          excludedByKey[ek] = (excludedByKey[ek] || 0) + 1;
          return;
        }
        /* TB: **검산 안 된 값은 요율을 논하는 데 쓰지 않는다**(SN). 화면이 그 값에
           「검산 안 됨」 배지를 붙여 확인을 요청하는데 제안이 그걸 무시하고 집계하면
           **화면과 제안이 서로 다른 말을 한다.** 뺀 개수는 아래에서 표에 찍는다. */
        if (reportFieldUnchecked(r, field)) {
          const uk = `${r.destinationKey}|${field}|report`;
          uncheckedByKey[uk] = (uncheckedByKey[uk] || 0) + 1;
          return;
        }
        /* 출처를 모르는 옛 제보(SX 이전)는 **빼지 않는다** — 빼면 그때 넣은 것이
           통째로 사라진다. 대신 몇 건이 그런지 밝힌다. */
        if (reportFieldViaUnknown(r, field)) {
          const nk = `${r.destinationKey}|${field}|report`;
          unknownByKey[nk] = (unknownByKey[nk] || 0) + 1;
        }
        /* 옛 환율이 박힌 금액을 그대로 기준가와 견주면 환율 차이가 '오차'로 둔갑한다(SG) */
        const reported = reportValueToday(r, field);
        if (reported == null) return;
        const currentBase = eff[field];
        if (!currentBase) return;
        const key = `${r.destinationKey}|${field}|report`;
        if (!byKey[key]) byKey[key] = { destKey: r.destinationKey, field, label: dest.label, source: 'report', ratios: [] };
        byKey[key].ratios.push(reported / currentBase);
      });
    });

    const suggestions = [];
    Object.values(byKey).forEach(data => {
      /* 이상치 방어 — 기준 대비 RATE_SUGGEST_RATIO_MIN~MAX 배 밖의 비율(오타·특가 등)은
         집계에서 빼고(clean), 제외 건수는 UI로 알린다. 대표값은 평균이 아니라 중앙값. */
      const clean = data.ratios.filter(r => r >= RATE_SUGGEST_RATIO_MIN && r <= RATE_SUGGEST_RATIO_MAX);
      const outlierCount = data.ratios.length - clean.length;
      /* ⚠ TB: **전부 이상치면 지금까지 통째로 사라졌다.** 그런데 그게 제일 큰 신호일 수
         있다 — 실측: 다낭 차량 797,500 vs 기준 180,000(**4.4배**)은 오타가 아니라
         **베트남 차량 요율이 낮은 것**이다(감사기는 🟡 요율 갱신 후보로 잡고 있는데
         화면만 못 봤다). 이상치 대역(0.5~2배)은 오타를 막는 장치지 「없던 일」로 만드는
         장치가 아니다. 제안은 못 만들되 **따로 알린다.** */
      if (!clean.length) {
        if (!data.ratios.length) return;
        const destF = destinationRates.find(d => d.destination_key === data.destKey);
        if (!destF) return;
        const baseF = effectiveRate(destF)[data.field] || 0;
        if (!baseF) return;
        const medAll = ratioMedian(data.ratios);
        suggestions.push({
          destKey: data.destKey, field: data.field, fieldLabel: RATE_FIELD_LABELS[data.field] || data.field,
          label: data.label, count: data.ratios.length, outlierCount: 0, diffPct: (medAll - 1) * 100,
          source: data.source, currentBase: baseF, suggestedBase: Math.round(baseF * medAll),
          confident: false, farOff: true,
          excludedCount: excludedByKey[`${data.destKey}|${data.field}|report`] || 0,
          uncheckedCount: uncheckedByKey[`${data.destKey}|${data.field}|report`] || 0,
          unknownCount: unknownByKey[`${data.destKey}|${data.field}|report`] || 0,
        });
        return;
      }
      if (clean.length < RATE_SUGGEST_MIN_COUNT) return;
      const medRatio = ratioMedian(clean);
      const diffPct = (medRatio - 1) * 100;
      if (Math.abs(diffPct) < 10) return;
      const dest = destinationRates.find(d => d.destination_key === data.destKey);
      if (!dest) return;
      const currentBase = effectiveRate(dest)[data.field] || 0;
      suggestions.push({
        destKey: data.destKey, field: data.field, fieldLabel: RATE_FIELD_LABELS[data.field] || data.field,
        label: data.label, count: clean.length, outlierCount, diffPct, source: data.source,
        excludedCount: excludedByKey[`${data.destKey}|${data.field}|report`] || 0,
        uncheckedCount: uncheckedByKey[`${data.destKey}|${data.field}|report`] || 0,
        unknownCount: unknownByKey[`${data.destKey}|${data.field}|report`] || 0,
        currentBase, suggestedBase: Math.round(currentBase * medRatio),
        /* 자동적용(지금 바로 적용)은 계수 보정된 EM 소스에만 부여. 제보 소스는 계수 미보정
           이라 기준가를 밀어올리면 견적에서 시즌·피크가 이중 반영되므로 confident 불가. */
        confident: data.source === 'em' && clean.length >= RATE_SUGGEST_CONFIDENT_COUNT,
      });
    });
    /* TB: 「너무 벌어져 제안을 못 만든 것」을 맨 위로 — 제일 크게 벌어진 것들이고
       사람이 봐야 판단이 되는 자리다. 그 안에서는 벌어진 순. */
    suggestions.sort((a, b) => (a.farOff === b.farOff ? 0 : a.farOff ? -1 : 1)
      || Math.abs(b.diffPct) - Math.abs(a.diffPct));
    return suggestions;
  }

  function renderRateSuggestions() {
    const card = document.getElementById('airfare-suggestion-card');
    const list = document.getElementById('airfare-suggestion-list');
    if (!card || !list) return;
    const suggestions = computeRateSuggestions();
    /* TA: 접혀 있어도 **몇 건인지는 보인다** — 숫자까지 숨기면 펼쳐 보기 전에는
       할 일이 있는지조차 모른다(접는 것의 유일한 위험이 그것이다). */
    const cntEl = document.getElementById('airfare-suggestion-count');
    if (cntEl) cntEl.textContent = suggestions.length ? suggestions.length + '건' : '';
    if (!suggestions.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    list.innerHTML = suggestions.map(s => {
      const isReport = s.source === 'report';
      /* confident(EM 표본 충분)만 파랑(액션색)으로 강조. 빨강(danger)은 이상치 등 실제
         경고에만 남긴다. 제보 소스는 참고용이라 강조 없음. */
      /* TB: farOff = 기준가와 너무 벌어져(0.5~2배 밖) 제안을 만들 수 없는 것.
         **버리지 않고 따로 보여준다** — 오타일 수도, 요율이 낡은 것일 수도 있는데
         그 판단은 사람만 한다. 주황 테두리로 「확인 대상」임을 밝힌다. */
      const frameColor = s.farOff ? '#E0A100' : (s.confident ? 'var(--primary)' : 'var(--border)');
      const frameBg    = s.farOff ? '#fffbeb' : (s.confident ? '#eff6ff' : 'var(--bg)');
      const srcBadge = isReport
        ? '<span style="font-size:.66rem;font-weight:700;background:#f1f5f9;color:var(--muted);border:1px solid var(--border);padding:.1rem .4rem;margin-right:.4rem">실측 제보 · 참고용</span>'
        : '<span style="font-size:.66rem;font-weight:700;background:#eef2ff;color:var(--primary);border:1px solid #c7d2fe;padding:.1rem .4rem;margin-right:.4rem">실제 계약</span>';
      const confBadge = s.farOff
        ? '<span style="font-size:.68rem;font-weight:700;background:#E0A100;color:#fff;padding:.1rem .4rem;margin-right:.4rem">확인 필요 · 제안 못 만듦</span>'
        : (s.confident
          ? '<span style="font-size:.68rem;font-weight:700;background:var(--primary);color:#fff;padding:.1rem .4rem;margin-right:.4rem">지금 적용 가능</span>'
          : '');
      return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem;padding:.6rem .8rem;border:1px solid ${frameColor};border-left-width:${s.confident ? '4px' : '1px'};background:${frameBg};flex-wrap:wrap">
        <div style="font-size:.85rem">
          ${confBadge}${srcBadge}
          <!-- ⚠ 1건일 때 '중앙값'이라 쓰면 여러 건을 모은 것처럼 읽힌다. 그 목적지의
               **첫 실측**이라는 사실이 판단에 중요하다(대표 지시로 1건도 제안한다). -->
          <strong>${esc(s.label)} · ${esc(s.fieldLabel)}</strong> · 최근 ${RATE_SUGGEST_RECENT_MONTHS}개월 ${isReport ? '실측 제보' : '실제 계약'} ${s.count === 1 ? '<b>1건</b>(이 목적지의 첫 실측)이' : `${s.count}건 중앙값이`} 기준 대비
          <strong>${s.diffPct > 0 ? '+' : ''}${s.diffPct.toFixed(1)}%</strong>
          — 기준 ${fmtWon(s.currentBase)}${s.farOff ? ` · 제보값 ${fmtWon(s.suggestedBase)}` : ` → 제안 ${fmtWon(s.suggestedBase)}`}${s.outlierCount ? ` <span style="color:var(--danger);font-weight:700">· 이상치 ${s.outlierCount}건 제외</span>` : ''}${s.excludedCount ? ` <span style="color:var(--muted);font-weight:700">· 평균에서 뺀 ${s.excludedCount}건 제외</span>` : ''}${s.uncheckedCount ? ` <span style="color:#8A6100;font-weight:700">· 검산 안 된 ${s.uncheckedCount}건 제외</span>` : ''}${s.unknownCount ? ` <span style="color:var(--muted);font-weight:700">· 출처 미상 ${s.unknownCount}건 포함</span>` : ''}
          ${s.farOff ? `<div style="color:#8A6100;font-size:.72rem;margin-top:.25rem;font-weight:700">※ 기준가의 ${(Math.abs(s.diffPct) / 100 + 1).toFixed(1)}배 안팎이라 <b>제안 금액을 만들지 않았습니다</b> — 오타일 수도, 요율이 낡은 것일 수도 있어 사람이 봐야 합니다. 견적서를 열어 확인한 뒤 <b>요율 편집하기</b>로 직접 넣어 주세요.</div>` : ''}
          ${isReport && !s.farOff ? '<div style="color:var(--muted);font-size:.72rem;margin-top:.25rem">※ 제보값은 성수기·피크 프리미엄이 섞여 있어 참고용입니다 — 값을 확인하고 <b>요율 편집하기</b>로 판단해 반영하세요(자동 적용 대상 아님).</div>' : ''}
        </div>
        <div style="display:flex;gap:.4rem;flex-shrink:0">
          ${s.confident ? `<button type="button" class="btn-act btn-primary" onclick="applyRateSuggestion('${s.destKey}','${s.field}',${s.suggestedBase},${s.count})">✅ 지금 바로 적용</button>` : ''}
          <button type="button" class="btn-act btn-outline-p" onclick="openRateEditModal('${s.destKey}')">요율 편집하기</button>
        </div>
      </div>`;
    }).join('');
  }

  /* 실제 이용 호텔 목록 (RY) — 가격 비교가 아니라 "어느 나라 어느 도시에서 어느 호텔을
     썼는지"를 담당자 누구나 정리해 볼 수 있게 하는 화면. 요율 계산에는 전혀 반영되지 않는다.

     ⚠ 예전(RM)에는 "목적지별 최신 1건"만 한 줄씩 보여줬다. 두 가지가 문제였다:
       ① 같은 목적지에 두 번째 호텔을 넣으면 첫 번째가 화면에서 사라졌다 — 쌓아도 안 보였다.
       ② 지역·나라 구분이 없어 체인 호텔(같은 브랜드가 여러 나라에 있다)이 뒤섞였다.
     그래서 **전부** 보여주되 같은 호텔은 한 줄로 묶고, 지역 → 나라 → 도시로 접는다.
     나라는 DEST_COUNTRY(=data.js DEST_CLASSIFY 파생)에서 오고 여기서 따로 정하지 않는다.

     ⚠ 호텔명은 인증된 담당자가 넣은 값이지만 그대로 innerHTML에 들어가므로 반드시 esc().
     접기는 <details>로 해서 인라인 onclick에 문자열을 끼워 넣지 않는다(결함 생성기 ④). */
  function hotelReferenceGroups() {
    /* 같은 도시·같은 호텔은 한 줄로 합친다. 표기 흔들림(공백·대소문자)까지 같은 것으로
       보되, 화면에는 **가장 최근에 적힌 표기**를 쓴다(담당자가 고쳐 적었으면 그쪽이 맞다). */
    const merged = {};
    priceReportsCache.forEach(r => {
      const name = (r.hotelName || '').trim();
      if (!name) return;
      const norm = name.replace(/\s+/g, ' ').toLowerCase();
      const k = r.destinationKey + '|' + norm;
      const at = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      const cur = merged[k];
      if (!cur) merged[k] = { destKey: r.destinationKey, name, count: 1, latestAt: at, author: r.author || '' };
      else {
        cur.count++;
        if (at >= cur.latestAt) { cur.latestAt = at; cur.name = name; cur.author = r.author || ''; }
      }
    });

    const q = (document.getElementById('hotel-ref-search')?.value || '').trim().toLowerCase();
    const rows = Object.values(merged).map(h => {
      const dest = destinationRates.find(d => d.destination_key === h.destKey);
      return Object.assign({}, h, {
        label: dest ? dest.label : h.destKey,
        country: destCountryOf(h.destKey) || COUNTRY_UNSET,
        region: destRegionOf(h.destKey),
      });
    }).filter(h => !q || [h.name, h.country, h.region, h.label].some(v => v.toLowerCase().includes(q)));

    /* 지역 → 나라 → 도시. 지역은 요율표와 같은 순서(REGION_ORDER)를 쓰고, 나머지는 가나다순. */
    const byRegion = {};
    rows.forEach(h => {
      const rg = byRegion[h.region] || (byRegion[h.region] = {});
      const ct = rg[h.country] || (rg[h.country] = {});
      (ct[h.label] || (ct[h.label] = [])).push(h);
    });
    const regionKeys = Object.keys(byRegion).sort((a, b) => {
      const ia = REGION_ORDER.indexOf(a), ib = REGION_ORDER.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'ko');
    });
    return { rows, byRegion, regionKeys };
  }

  function renderHotelReference() {
    const card = document.getElementById('hotel-reference-card');
    const list = document.getElementById('hotel-reference-list');
    const countEl = document.getElementById('hotel-ref-count');
    if (!card || !list || typeof destinationRates === 'undefined') return;

    /* 검색어 때문에 0건이 됐을 때 카드까지 사라지면 "검색을 지울 곳"이 없어진다.
       카드를 숨기는 건 **호텔 제보 자체가 하나도 없을 때**뿐이다. */
    const anyHotel = priceReportsCache.some(r => (r.hotelName || '').trim());
    if (!anyHotel) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');

    const { rows, byRegion, regionKeys } = hotelReferenceGroups();
    if (countEl) {
      const cities = new Set(rows.map(h => h.label)).size;
      const countries = new Set(rows.map(h => h.country)).size;
      countEl.textContent = `호텔 ${rows.length}곳 · ${countries}개 나라 · ${cities}개 도시`;
    }
    if (!rows.length) {
      list.innerHTML = `<div style="color:var(--muted);font-size:.82rem;padding:1rem 0">검색 조건에 맞는 호텔이 없습니다.</div>`;
      return;
    }

    const dateOf = ms => ms ? new Date(ms).toISOString().slice(0, 10) : '—';
    list.innerHTML = regionKeys.map(region => {
      const countries = Object.keys(byRegion[region]).sort((a, b) => {
        /* '나라 미지정'은 채워야 할 것이므로 맨 위로 올려 눈에 띄게 한다. */
        if (a === COUNTRY_UNSET) return -1;
        if (b === COUNTRY_UNSET) return 1;
        return a.localeCompare(b, 'ko');
      });
      const regionCount = countries.reduce((n, c) => n + Object.values(byRegion[region][c]).reduce((m, arr) => m + arr.length, 0), 0);
      const body = countries.map(country => {
        const cities = Object.keys(byRegion[region][country]).sort((a, b) => a.localeCompare(b, 'ko'));
        const unset = country === COUNTRY_UNSET;
        const cityRows = cities.map(city => {
          const hotels = byRegion[region][country][city].sort((a, b) => b.latestAt - a.latestAt);
          return `<div style="display:grid;grid-template-columns:minmax(90px,110px) 1fr;gap:.5rem;padding:.35rem 0;border-top:1px solid var(--border)">
            <div style="font-weight:700;font-size:.8rem">${esc(city)}</div>
            <div style="display:grid;gap:.25rem">${hotels.map(h => `
              <div style="display:flex;justify-content:space-between;gap:.75rem;flex-wrap:wrap;font-size:.82rem">
                <span>${esc(h.name)}${h.count > 1 ? ` <span style="color:var(--muted);font-size:.74rem">×${h.count}회</span>` : ''}</span>
                <span style="color:var(--muted);font-size:.74rem">${esc(h.author || '—')} · ${dateOf(h.latestAt)}</span>
              </div>`).join('')}</div>
          </div>`;
        }).join('');
        return `<div style="padding:.5rem .75rem;border:1px solid ${unset ? 'var(--danger,#dc2626)' : 'var(--border)'};margin-top:.4rem">
          <div style="font-size:.78rem;font-weight:800;color:${unset ? 'var(--danger,#dc2626)' : 'var(--heading)'}">
            ${esc(country)}${unset ? " — 목적지를 추가할 때 '나라' 칸이 비어 있던 곳입니다 (나라는 목적지를 만들 때만 정합니다)" : ''}
          </div>
          ${cityRows}
        </div>`;
      }).join('');
      return `<details open style="border:1px solid var(--border);padding:.5rem .75rem">
        <summary style="cursor:pointer;font-weight:800;font-size:.85rem">${esc(region)} <span style="color:var(--muted);font-weight:400;font-size:.76rem">호텔 ${regionCount}곳</span></summary>
        ${body}
      </details>`;
    }).join('');
  }

  /* CSV 내보내기 (RY) — 화면에서 접어 보는 것과 별개로, 엑셀에 옮겨 정리하고 싶을 때.
     요율표 CSV(exportRatesCsv)와 같은 방식(BOM + 따옴표 이스케이프)이라 한글이 깨지지 않는다.
     지금 걸린 검색어 그대로 내보낸다 — 화면에 보이는 것과 파일이 다르면 안 된다. */
  function exportHotelReferenceCsv() {
    if (typeof destinationRates === 'undefined') return;
    const { rows } = hotelReferenceGroups();
    if (!rows.length) { alert('내보낼 호텔이 없습니다.'); return; }
    const sorted = [...rows].sort((a, b) =>
      a.region.localeCompare(b.region, 'ko') || a.country.localeCompare(b.country, 'ko') ||
      a.label.localeCompare(b.label, 'ko') || b.latestAt - a.latestAt);
    const out = [['지역', '나라', '도시', '호텔명', '사용횟수', '최근사용일', '최근작성자']];
    sorted.forEach(h => out.push([h.region, h.country, h.label, h.name, h.count,
      h.latestAt ? new Date(h.latestAt).toISOString().slice(0, 10) : '', h.author || '']));
    const csv = out.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hotels_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* 확인 1클릭 적용 (신규) — 완전 자동 반영은 아니고, 표본이 충분히 쌓였을 때
     "요율 편집하기"로 9개 필드 모달을 열어 값을 다시 옮겨 적을 필요 없이 해당
     항목 하나만 바로 반영하는 지름길. saveRateEdit()과 동일하게 요율 확인월도
     함께 갱신되고(→ api/rates.js가 환율 기준점도 재설정), 기존 실행취소 배너로
     바로 되돌릴 수도 있다. */
  async function applyRateSuggestion(destKey, field, suggestedBase, count) {
    const author = currentUser.displayName;
    const dest = destinationRates.find(d => d.destination_key === destKey);
    if (!dest) return;
    const fieldLabel = RATE_FIELD_LABELS[field] || field;
    /* 제안값은 "현재 기준가 대비" 비율로 만들어진다 — 기준가를 못 읽은 상태면 제안
       자체가 기본값 위에서 계산된 것이라 적용해서는 안 된다. */
    if (!(await ensureFreshRates('제안 적용'))) return;
    const eff = effectiveRate(dest);
    if (!confirm(`"${dest.label}" ${fieldLabel}를 실제 데이터 ${count}건 평균 기준 ${fmtWon(suggestedBase)}(으)로 바로 적용할까요?\n(현재: ${fmtWon(eff[field] || 0)})`)) return;

    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const changes = [
      { field, oldValue: eff[field] || 0, newValue: suggestedBase },
      { field: 'rateDate', oldValue: eff.rateDate || '', newValue: ym },
    ];
    try {
      const res = await fetch('/api/rates', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationKey: destKey, author, changes }),
      });
      const data = await res.json();
      if (!res.ok) { alert(rateSaveErrorMessage(data, res.status)); return; }
      rateOverridesCache[destKey] = data.overrides;
      rateHistoryLoaded = false;   /* SZ: 이력이 바뀌었다 — 다음에 펼칠 때 새로 받는다 */
      setLastRateAction({ label: `방금 "${dest.label}" ${fieldLabel}를 실제 계약 데이터 기준(${fmtWon(suggestedBase)})으로 적용했습니다.`, entries: [{ destinationKey: destKey, changes }] });
      renderRates();
    } catch (err) {
      alert('적용 요청에 실패했습니다. 네트워크를 확인해 주세요.');
    }
  }


  /* 실측 검증 현황(신규) — "이 기준가가 실제 계약가와 대조된 적이 있는가"를 목적지×항목
     (항공료/호텔/식비)별로 집계한다. 소스는 갱신제안과 동일하게 (1) 실제 계약가 위젯 제보
     (2) 계약완료 견적의 실제가 필드. 항목별로 가장 최근 실측일(ms)만 남긴다. 식비는 위젯
     제보에만 있어 견적 소스에선 안 잡힘(정상). */
  const RATE_ACTUAL_FIELDS = ['airfare', 'hotel_per_room', 'meal_per_person'];
  let rateActualValidationMap = {};
  function buildActualValidationMap() {
    const map = {}; // `${destKey}|${field}` -> { latestTs, recentVals:[] }
    const cutoff = RATE_SUGGEST_RECENT_CUTOFF();
    const put = (destKey, field, tsMs, val) => {
      if (!destKey || !field || !isFinite(tsMs)) return;
      const k = `${destKey}|${field}`;
      if (!map[k]) map[k] = { latestTs: 0, recentVals: [], count: 0 };
      map[k].count++;   /* RM: 몇 건의 견적서가 이 단가를 뒷받침하는지 — 배지에 적는다 */
      if (tsMs > map[k].latestTs) map[k].latestTs = tsMs;
      /* 기준가 이상 경고용 — 최근성 창 이내의 실측값만 모아 중앙값 비교에 쓴다 */
      if (tsMs >= cutoff && val != null && isFinite(val) && val > 0) map[k].recentVals.push(val);
    };
    (priceReportsCache || []).forEach(r => {
      const ts = new Date(r.createdAt).getTime();
      /* RQ: 새로 받기 시작한 항목들도 실측 근거로 센다 — 그래야 요율표 배지와
         '실측 전환' 진행률이 실제로 채워진 만큼 올라간다.
         ⚠ 값은 **오늘 환율 기준으로 되돌려서** 넣는다(SG). 이 값이 기준가 중앙값과
         비교되므로, 옛 환율 그대로면 환율 차이가 '기준가가 이상하다'로 둔갑한다. */
      Object.keys(REPORT_VALUE_KEY).forEach((field) => {
        const v = reportValueToday(r, field);
        if (v != null) put(r.destinationKey, field, ts, v);
      });
    });
    getEstsFull().filter(e => e.status === 'contracted' && e.destKey).forEach(e => {
      const ts = new Date(e.ts).getTime();
      if (e.actualAirfareUnit != null) put(e.destKey, 'airfare', ts, e.actualAirfareUnit);
      if (e.actualHotelUnit != null) put(e.destKey, 'hotel_per_room', ts, e.actualHotelUnit);
      /* 식비 실측도 반영 — 안 넣으면 견적모달에 실제 식비를 입력해도 요율표 식비 셀이
         계속 '◽미검증'으로 남는다(정확도 카드는 이미 이 값을 집계하는데 검증배지만 사각지대). */
      if (e.actualMealUnit != null) put(e.destKey, 'meal_per_person', ts, e.actualMealUnit);
    });
    return map;
  }

  /* 실측으로 확인된 칸이 몇 개인가 (RM).
     ⚠ 세는 기준을 배지와 **같은 것**(rateActualValidationMap)으로 둔다. 따로 세면
     "표에는 ✅인데 진행률은 안 올라간다"가 생긴다. 배지가 진실이고 여기는 그 합계다. */
  /* ⚠ 진행률에 세는 항목 (RQ). 요율표에 실제로 **보이는 칸**만 센다 —
     차량·가이드·관광은 요율에 있지만 표에는 열이 없어, 여기 넣으면 "배지는 없는데
     진행률만 오른다"가 된다. 표에 열을 늘릴 때 여기도 함께 늘린다. */
  const RATE_MEASURED_FIELDS = ['airfare', 'hotel_per_room', 'meal_per_person'];
  function countMeasuredCells() {
    const keys = (typeof destinationRates !== 'undefined' ? destinationRates : []).map(d => d.destination_key);
    let done = 0;
    keys.forEach((k) => RATE_MEASURED_FIELDS.forEach((f) => {
      const info = rateActualValidationMap[`${k}|${f}`];
      if (info && info.latestTs) done++;
    }));
    const total = keys.length * RATE_MEASURED_FIELDS.length;
    return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  /* 요율표 셀에 붙는 실측 검증 배지 — ✅실측 N건 / ⚠오래됨 / ❓온라인 추정 /
     ❗실측대비 ±N%. "이 숫자가 어디서 왔는지"를 셀마다 말해 준다 (RM). */
  function rateValidationBadge(destKey, field, base) {
    const info = rateActualValidationMap[`${destKey}|${field}`];
    const style = 'font-size:.62rem;margin-top:.15rem;white-space:nowrap;font-weight:700';
    /* RM: '미검증'이라고만 하면 **이 숫자가 어디서 왔는지**를 말하지 않는다. 이 값들은
       온라인 조사로 넣은 추정치이고, 실제 견적서가 들어오면 그 값으로 교체할 대상이다.
       그 사실을 배지가 직접 말하게 한다 — 수백 건을 넣는 동안 "아직 안 바뀐 곳"이
       한눈에 보여야 한다. */
    if (!info || !info.latestTs) return `<div style="${style};color:var(--muted)" title="온라인 조사로 넣은 추정치입니다 — 실제 견적서가 들어오면 그 값으로 교체할 대상입니다">❓ 온라인 추정</div>`;
    /* 기준가 이상 경고(신규) — 최근 실측 중앙값과 크게 벌어지면 최우선 표시. 실측이
       2건 이상일 때만(오타 1건에 의한 오탐 방지). 잘못 반영된 기준가 탐지용. */
    if (base && base > 0 && info.recentVals.length >= 2) {
      const med = ratioMedian(info.recentVals);
      if (med > 0) {
        const drift = base / med - 1;
        if (Math.abs(drift) >= RATE_BASE_DRIFT_WARN) {
          const pct = Math.round(drift * 100);
          return `<div style="${style};color:var(--danger)" title="현재 기준가 ${fmtWon(base)}이(가) 최근 실측 중앙값 ${fmtWon(med)}과(와) ${pct > 0 ? '+' : ''}${pct}% 차이 — 기준가가 실제와 어긋났을 수 있어 확인 권장">❗ 실측대비 ${pct > 0 ? '+' : ''}${pct}%</div>`;
        }
      }
    }
    const months = monthsSince(info.latestTs);
    const n = info.count || 0;
    if (months >= RATE_SUGGEST_RECENT_MONTHS) return `<div style="${style};color:#b45309" title="견적서 ${n}건에서 확인했지만 마지막이 약 ${months}개월 전입니다 — 최근 견적서로 다시 확인 권장">⚠ 실측 ${n}건 · ${months}개월 전</div>`;
    return `<div style="${style};color:var(--success)" title="실제 견적서 ${n}건에서 확인된 단가입니다 (최근 약 ${months}개월 전). 온라인 추정치가 아닙니다">✅ 실측 ${n}건</div>`;
  }

  /* ── 견적 정확도 측정 (신규 · P1) ─────────────────────────────────────
     "견적이 실제 계약과 얼마나 맞았나"를 목적지×항목별 오차(actual/estimate − 1)로
     측정한다. 소스는 갱신제안과 동일: (1) 계약완료 견적의 실제가 vs 그 견적의 추정 unit,
     (2) 실제 계약가 위젯 제보 vs 현재 기준가. 오타 방어와 같은 이상치 밴드로 입력오류는
     제외한다. 견적 계산식은 전혀 건드리지 않는 순수 측정 레이어. */
  function pctile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    return sorted[idx];
  }
  function computeAccuracyStats() {
    if (typeof destinationRates === 'undefined') return [];
    const recentCutoff = RATE_SUGGEST_RECENT_CUTOFF();
    const isRecent = (d) => { if (d == null || d === '') return true; const t = new Date(d).getTime(); return isNaN(t) ? true : t >= recentCutoff; };
    const inBand = (ratio) => ratio >= RATE_SUGGEST_RATIO_MIN && ratio <= RATE_SUGGEST_RATIO_MAX;
    const byKey = {};
    const add = (destKey, field, label, ratio) => {
      if (!inBand(ratio)) return;
      const k = `${destKey}|${field}`;
      if (!byKey[k]) byKey[k] = { destKey, field, label, errs: [] };
      byKey[k].errs.push(ratio - 1);
    };
    /* (1) 계약완료 견적: 실제가 vs 그 견적 계산 당시의 추정 unit (항목별) */
    [{ field: 'airfare', actualKey: 'actualAirfareUnit', match: it => it.name === '항공' },
     { field: 'hotel_per_room', actualKey: 'actualHotelUnit', match: it => (it.name || '').startsWith('호텔') },
     { field: 'meal_per_person', actualKey: 'actualMealUnit', match: it => it.name === '식사' }
    ].forEach(({ field, actualKey, match }) => {
      getEstsFull().filter(e => e.status === 'contracted' && e[actualKey] != null && e.destKey && isRecent(e.ts)).forEach(e => {
        const estItem = (e.items || []).find(match);
        if (!estItem || !estItem.unit) return;
        add(e.destKey, field, e.destLabel || e.destKey, e[actualKey] / estItem.unit);
      });
    });
    /* (1-종합) 계약완료 견적: 실제 총 계약가 vs 견적 총액 → 목적지별 '종합' 오차 (P1b) */
    getEstsFull().filter(e => e.status === 'contracted' && e.actualTotal != null && e.total && e.destKey && isRecent(e.ts)).forEach(e => {
      add(e.destKey, 'total', e.destLabel || e.destKey, e.actualTotal / e.total);
    });
    /* (2) 실제 계약가 위젯 제보: 실측 vs 현재 기준가 */
    priceReportsCache.forEach(r => {
      if (!isRecent(r.createdAt)) return;
      const dest = destinationRates.find(d => d.destination_key === r.destinationKey);
      if (!dest) return;
      const eff = effectiveRate(dest);
      Object.keys(RATE_SUGGEST_REPORT_FIELDS).forEach((field) => {
        const reported = reportValueToday(r, field);   /* 오늘 환율 기준으로 되돌린다(SG) */
        if (reported == null || !eff[field]) return;
        add(r.destinationKey, field, dest.label, reported / eff[field]);
      });
    });
    const out = [];
    Object.values(byKey).forEach(d => {
      if (d.errs.length < RATE_SUGGEST_MIN_COUNT) return;
      const sorted = d.errs.slice().sort((a, b) => a - b);
      out.push({
        destKey: d.destKey, field: d.field, label: d.label,
        fieldLabel: d.field === 'total' ? '종합(총액)' : (RATE_FIELD_LABELS[d.field] || d.field),
        medianErr: ratioMedian(sorted), p10: pctile(sorted, 10), p90: pctile(sorted, 90),
        count: d.errs.length,
      });
    });
    out.sort((a, b) => Math.abs(b.medianErr) - Math.abs(a.medianErr));
    return out;
  }

  /* ── P5: 견적 총액의 실측 기준 신뢰구간 ──────────────────────────────
     computeAccuracyStats()가 이미 내는 목적지별 '종합(total)' 오차 분포(실제
     총계약가/견적총액 − 1의 p10·중앙·p90)를 이 견적의 총액에 곱해 "실측 기준
     예상 범위"를 낸다. 견적 계산식은 건드리지 않는 순수 표시(additive)이며 관리자
     내부 전용이다. 표본이 CONF_MIN_COUNT 미만이면 범위 대신 '데이터 부족' 안내를
     돌려준다(insufficient). total 오차는 계약완료 견적에 '실제 총 계약가'가
     입력돼야만 쌓이므로, 실적이 적은 초기에는 대부분 부족 상태가 정상이다. */
  const CONF_MIN_COUNT = 3;
  function computeQuoteConfidence(e) {
    if (!e || !e.total || !e.destKey) return null;
    const stat = computeAccuracyStats().find(s => s.destKey === e.destKey && s.field === 'total');
    if (!stat || stat.count < CONF_MIN_COUNT) return { insufficient: true, count: stat ? stat.count : 0 };
    return {
      lo: Math.round(e.total * (1 + stat.p10)),
      hi: Math.round(e.total * (1 + stat.p90)),
      mid: Math.round(e.total * (1 + stat.medianErr)),
      medianErr: stat.medianErr, p10: stat.p10, p90: stat.p90, count: stat.count,
    };
  }

  function renderAccuracyStats() {
    const card = document.getElementById('accuracy-stats-card');
    const tbody = document.getElementById('accuracy-stats-tbody');
    if (!card || !tbody) return;
    const monthsEl = document.getElementById('accuracy-months');
    if (monthsEl) monthsEl.textContent = RATE_SUGGEST_RECENT_MONTHS;
    const stats = computeAccuracyStats();
    const accCntEl = document.getElementById('accuracy-stats-count');
    if (accCntEl) accCntEl.textContent = stats.length ? stats.length + '건' : '';
    if (!stats.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const pct = v => v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
    const color = v => { const a = Math.abs(v); return a <= 0.10 ? 'var(--success)' : a <= 0.25 ? '#b45309' : 'var(--danger)'; };
    tbody.innerHTML = stats.map(s => `
      <tr>
        <td style="white-space:nowrap"><strong>${esc(s.label)}</strong></td>
        <td>${esc(s.fieldLabel)}</td>
        <td style="text-align:right;font-weight:700;color:${color(s.medianErr)}">${pct(s.medianErr)}</td>
        <td style="text-align:right;color:var(--muted)">${pct(s.p10)} ~ ${pct(s.p90)}</td>
        <td style="text-align:right">${s.count}</td>
      </tr>`).join('');
  }

  /* 못 읽은 사실을 요율 화면 맨 위에 남긴다. 표는 data.js 기본값으로도 그려지므로
     이 띠가 없으면 화면이 "정상"으로 보인다 — 그게 이 결함의 핵심이었다. */
  function renderRateStaleBanner() {
    const el = document.getElementById('rate-stale-banner');
    if (!el) return;
    if (!rateOverridesStale && !priceReportsStale) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const lines = [];
    if (rateOverridesStale) {
      lines.push(`⚠ ${esc(rateStaleReason())}`);
      lines.push('아래 표의 단가는 <b>기본값이라 실제 운영 값과 다를 수 있습니다.</b> '
        + '이 상태에서는 편집·일괄 조정이 잠깁니다(잘못된 값으로 덮어쓰는 것을 막기 위해).');
    }
    if (priceReportsStale) {
      lines.push('⚠ 실제 계약가 제보를 불러오지 못했습니다 — '
        + '<b>갱신 제안이 비어 있는 것은 "고칠 것이 없다"는 뜻이 아닙니다.</b>');
    }
    lines.push('<button type="button" class="btn-act btn-outline-p" style="margin-top:.5rem" onclick="reloadRateData(this)">다시 불러오기</button>');
    el.innerHTML = lines.join('<br>');
    el.classList.remove('hidden');
  }

  /* 요율을 쓰기 직전의 공통 관문.
     네 경로(편집창 열기·일괄 조정·제안 적용·확인함 기록)가 모두 "쓰기 직전에 서버
     최신값으로 맞춘다"는 같은 안전망을 갖고 있었는데, 넷 다 결과를 보지 않았다.
     실패를 무시하면 그 안전망은 **정확히 필요한 순간에만** 없는 것이 된다 —
     기준값을 모르는 채로 쓰고, 살아 있던 오버라이드를 기본값으로 덮는다.
     문구를 한 곳에 두는 이유도 같다(네 곳에 따로 적으면 반드시 어긋난다). */
  async function ensureFreshRates(actionLabel) {
    if (await loadRateOverrides()) return true;
    renderRates();   // 경고띠를 띄워 왜 멈췄는지 화면에 남긴다
    alert(`${rateStaleReason()}\n\n지금 화면의 단가는 기본값일 수 있어 중단했습니다 — ${actionLabel}.\n`
      + '아무것도 변경되지 않았습니다. 이 상태로 저장하면 실제 운영 중인 값을 덮어쓸 수 있습니다.\n'
      + '연결을 확인한 뒤 다시 시도해 주세요.');
    return false;
  }

  /* TT: **요율 관리 탭을 열 때마다 서버 값을 다시 읽는다** (2026-08-13 사장님 지적).
     ⚠ `loadRateOverrides()`는 여태 **로그인할 때 한 번만** 불렸다. 그래서 화면을 열어 둔
       채로 요율이 바뀌면(다른 담당자가 고쳤거나, 실측 자동 반영이 돌았거나) 탭을 다시
       눌러도 **로그인 시점의 값**이 계속 보인다. 실제로 2026-08-13에 실측 15칸을 반영한
       뒤 「요율관리에 업데이트된 내용이 없는데 DB가 업데이트된 건가?」라는 질문이 나왔다 —
       DB도 API도 정상이었고, 화면만 낡아 있었다.
     ⚠ **먼저 그리고 나서 갱신한다.** 네트워크를 기다렸다가 그리면 탭이 빈 채로 멈춘 것처럼
       보인다. 그래서 캐시로 즉시 그린 뒤, 서버 값이 오면 그때 다시 그린다.
     ⚠ **실패해도 조용히 넘어가지 않는다** — loadRateOverrides가 `rateOverridesStale`을
       세워 두고 renderRates가 경고띠를 띄운다(그 경로를 그대로 쓴다). */
  async function refreshRatesOnOpen() {
    const ok = await loadRateOverrides();
    await loadPriceReports();
    renderRates();
    return ok;
  }

  /* 경고띠의 '다시 불러오기' — 성공하면 표까지 새 값으로 다시 그린다. */
  async function reloadRateData(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '불러오는 중...'; }
    await loadRateOverrides();
    await loadPriceReports();
    if (btn) { btn.disabled = false; btn.textContent = '다시 불러오기'; }
    renderRates();
  }

  /* ════ 견적서 업데이트 화면 (RM) ═══════════════════════════════════════════
     요율 관리에서 뗀 화면. **넣는 일만** 한다 — 요율 표·계수 조정처럼 잘못 누르면
     전 목적지에 영향이 가는 것은 여기 두지 않는다.
     ⚠ 요율 관리와 **같은 조회 결과**(rateOverridesStale/priceReportsCache)를 본다.
     각자 부르게 두면 한쪽만 낡은 값을 보게 된다(일정·방식에서 이미 겪은 문제). */
  function renderPriceReportTab() {
    renderRateStaleBanner();
    populatePriceReportDestSelect();
    applyPriceReportModeUI();
    renderHotelReference();
    renderPriceReportProgress();
    /* SX: 버튼에 건수를 띄운다 — **건수가 곧 할 일의 양**이라 열기 전에 보여야 한다 */
    updateNeedCheckCount();
  }

  /* "어디까지 넣었나" — 수백 건을 넣을 때 같은 견적서를 두 번 넣거나 빠뜨리는 것을 막는다. */
  function renderPriceReportProgress() {
    const el = document.getElementById('pr-progress');
    if (!el) return;
    el.textContent = '';
    const rows = priceReportsCache || [];
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'iti-note';
      p.textContent = priceReportsStale
        ? '제보 내역을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.'
        : '아직 넣은 견적서가 없습니다. 위에서 목적지를 고르고 값을 넣어 주세요.';
      el.appendChild(p);
      return;
    }
    const byDest = {};
    rows.forEach((r) => {
      const k = r.destinationKey || '(목적지 없음)';
      byDest[k] = (byDest[k] || 0) + 1;
    });
    const total = document.createElement('p');
    total.className = 'pr-progress-total';
    total.textContent = '전체 ' + rows.length + '건 · 목적지 ' + Object.keys(byDest).length + '곳';
    el.appendChild(total);
    const grid = document.createElement('div');
    grid.className = 'pr-progress-grid';
    Object.keys(byDest).sort((a, b) => byDest[b] - byDest[a]).forEach((k) => {
      const chip = document.createElement('span');
      chip.className = 'pr-chip';
      const n = document.createElement('b');
      n.textContent = String(byDest[k]);
      chip.append(k + ' ', n);
      grid.appendChild(chip);
    });
    el.appendChild(grid);
  }


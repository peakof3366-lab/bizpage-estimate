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

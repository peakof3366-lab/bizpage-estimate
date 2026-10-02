/* ═══════════════════════════════════════════════════════════════════════════
   견적 관리 화면 (estmgr) — admin.html에서 떼어냈다 (구조 정리 2b-3)

   🔴 **여기에 계수 기여도 패널(coefContribHtml)이 있다.**
   `COEF_VOL_CAP = 2.5`처럼 **엔진(script.js)의 값을 베껴 적은 상수**가 들어 있어,
   옮길 때 전후 출력을 대조했다(계수 조합 1,372건 · 해시 동일). 이 덩이를 다시
   손댈 때도 **반드시 같은 대조**를 건다 — 숫자는 화면 표시용이지만, 담당자가
   그 표를 보고 판단하므로 틀리면 판단이 틀린다.
   ⚠ 엔진에 계수를 추가하면 여기도 같이 늘려야 한다(원래 주석이 경고하는 그대로다).

   ■ 로드 규칙  `admin/common.js` 다음, 인라인 <script> 앞. 선언만 둔다.
     실행문 4개(필터 버튼·검색칸·openQuoteItineraryEditor·emModal)는 아직 admin.html에
     있다 — 이 구간을 갈라놓는 것이 그 넷이다. 손잡이는 따로 옮긴다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════
     견적 관리 탭 (estmgr)
     ════════════════════════════════════════ */
  const EM_KEY      = 'linkedt_estimates_full';
  const EM_PAGE     = 12;
  let   emFilter    = 'all';
  let   emPage      = 1;
  let   emSearch    = '';
  let   emCurrentId = null;
  let   emSelectedIds = new Set(); // 체크박스로 선택한 견적 id (신규 — 선택 삭제용, 필터/페이지 이동해도 유지)

  /* 「검색 지우기」 — 검색칸을 비우고 다시 그린다(2026-10-02) */
  function emClearSearch() {
    const box = document.getElementById('emSearch');
    if (box) box.value = '';
    emSearch = ''; emPage = 1;
    renderEstMgr();
  }

  function getEstsFull() {
    try { return JSON.parse(localStorage.getItem(EM_KEY) || '[]'); }
    catch { return []; }
  }



  /* ── 메인 렌더 ── */
  /* ── 「이 문의, 견적서 나갔나」 (ZB) ────────────────────────────────────────
     견적 관리(고객이 남긴 요청)와 견적서 대장(우리가 낸 문서)이 서로를 모르고 있었다.
     담당자가 기억으로 이어야 했고, 휴가면 못 이었다 — 넘버링을 만든 목적이 그것인데도.
     ⚠ 대장 목록을 대신 쓰지 않는다. 그쪽은 상한(LIST_MAX)이 걸려 있어 **오래된 문의가
       조용히 「견적 안 나감」으로 보인다.** 전용 조회(`action=links`)는 이은 것만 준다.
     ⚠ 못 불러왔을 때 **빈 값으로 그리지 않는다.** 「견적서가 없다」와 「모른다」는 다른
       말이고, 여기서 헷갈리면 담당자가 같은 견적서를 두 번 낸다. */
  let emShareLinks = null;          /* null = 아직 모른다 · {} = 이은 것이 없다 */
  let emShareLinksTried = false;
  async function loadShareLinks(redraw) {
    if (emShareLinksTried) return;
    emShareLinksTried = true;
    try {
      const r = await fetch('/api/quote-shares?action=links');
      if (!r.ok) throw new Error('http_' + r.status);
      const d = await r.json();
      emShareLinks = (d && d.links) || {};
    } catch (err) {
      emShareLinks = null;
      console.warn('[견적 관리] 발급 견적서 연결을 못 읽었습니다:', err);
    }
    if (redraw) renderEstMgr();
  }
  const EM_SHARE_ST = { issued: '발급', won: '계약', lost: '무산', void: '취소' };
  /* 진행 중 = 신규 + 상담중. 서버 배지(api/admin/insights.js `active`)와 같은 정의 — 바꾸면 둘 다 바꾼다(test_aM이 대조) */
  function emIsActive(e) { const s = e.status || 'new'; return s === 'new' || s === 'consulting'; }

  function emShareBadge(quoteId, ownNo) {
    if (emShareLinks === null) return '';         /* 모르면 아무 말도 하지 않는다 */
    const list = emShareLinks[quoteId];
    if (!list || !list.length) return '';
    const first = list[0];
    const more = list.length > 1 ? ' 외 ' + (list.length - 1) : '';
    /* ⚠ 2026-09-27 발급 번호가 이 견적의 번호와 같으면(9/23부터 그렇다 — 차수 -R1만 다르다) 번호를 다시 적지 않는다.
       바로 왼쪽 「견적번호」 칸과 같은 글자가 한 줄에 두 번 찍혔다. 다를 때(옛 Q번호 등)만 번호를 적는다. */
    const base = (s) => String(s || '').replace(/(?:-R\d+|_V\d+)$/i, '');   /* 옛 -R1 · 새 _V2 둘 다 */
    const label = ownNo && base(first.no) === base(ownNo) ? '발급됨' + (first.no !== ownNo ? ' (' + String(first.no).slice(String(ownNo).length + 1) + ')' : '') : (first.no || '견적서');
    return '<span class="em-tag em-tag-doc" title="견적서 대장에 있는 문서 — ' + esc(list.map((x) => x.no + ' (' + (EM_SHARE_ST[x.status] || x.status) + ')').join(', '))
      + '">📄 '
      + esc(label) + esc(more) + '</span>';
  }

  function renderEstMgr() {
    loadShareLinks(true);
    const all = getEstsFull();

    /* ⚠ 숫자 카드는 2026-09-27 「견적 분석」(renderEstimates)으로 옮겼다 — 여기서 세지 않는다 */

    /* RG: 실적 미입력 — 계약은 됐는데 '실제 총 계약가'가 비어 있는 건.
       ⚠ 이 화면에서 이 숫자만 별도로 세는 이유: 견적 정확도를 높이는 남은 작업
       (실측 신뢰구간 P5·요율 갱신 제안)이 전부 actualTotal에서 나온다. 그런데 이 값은
       **계약할 때 잠깐만 알 수 있고 시간이 지나면 다시 알아내기 어렵다.** 안 챙기면
       "데이터가 없어서 못 한다"가 영원히 계속된다. */
    const emNeedsActual = (e) => e.status === 'contracted' && e.actualTotal == null;
    const needsActualCount = all.filter(emNeedsActual).length;
    /* 검색 — **목록과 버튼 숫자가 같은 함수로** 거른다 */
    const emMatches = (e) => {
      if (!emSearch) return true;
      /* 🔴 **번호로도 찾는다** (2026-09-23 대표 지시 1-5). 고객이 전화로 대는 것은
         목적지가 아니라 번호다. 차수(`-R1`)까지 적힌 번호를 그대로 붙여 넣어도
         찾히게 기본 번호도 함께 본다 — 그러지 않으면 「BP-2609-0001-R1」로 검색했을 때
         정작 그 견적 기록(차수가 없는 쪽)이 안 나온다. */
      const no = String(e.quoteNo || '');
      const hay = (e.destLabel+e.orgName+e.contact+e.programLabel+no+(e.sourceQuoteNo||'')).toLowerCase();
      if (hay.includes(emSearch)) return true;
      const q = emSearch.replace(/(?:-r\d+|_v\d+)$/i, '');
      return !!no && q !== emSearch && no.toLowerCase().includes(q);
    };
    const searched = all.filter(emMatches);
    /* 🔢 2026-10-02 필터 버튼에 건수 — 🔴 **검색어가 걸려 있으면 검색 결과 안에서 센다.**
         처음엔 전체로 셌더니, 브라우저가 검색칸에 「admin」을 자동으로 채운 상태에서 버튼은 「전체 4 · 신규 3」인데
         목록은 2건·1건만 보였다(대표 캡처) — 버튼과 목록이 다른 것을 셌다. 이제 둘이 같은 `searched`를 본다. */
    document.querySelectorAll('#tab-estmgr [data-emfilter]').forEach((b) => {
      const k = b.dataset.emfilter;
      if (k === 'needs-actual') return;
      if (!b.dataset.label) b.dataset.label = b.textContent.trim();
      const n = k === 'all' ? searched.length : searched.filter((e) => (k === 'active' ? emIsActive(e) : e.status === k)).length;
      b.textContent = b.dataset.label + ' ' + n;
    });
    /* 검색 중이면 **눈에 보이게** 말한다 — 검색칸 글자만으로는 걸러진 줄 모른다 */
    const note = document.getElementById('emSearchNote');
    if (note) {
      note.classList.toggle('hidden', !emSearch);
      if (emSearch) note.innerHTML = `「${esc(emSearch)}」 검색 중 — 전체 ${all.length}건 중 ${searched.length}건 <button type="button" class="btn-act btn-outline-p em-search-clear" onclick="emClearSearch()">검색 지우기</button>`;
    }
    const naBtn = document.getElementById('emNeedsActualBtn');
    if (naBtn) {
      naBtn.textContent = '💰 실적 미입력' + (needsActualCount ? ' ' + needsActualCount : '');
      naBtn.classList.toggle('has-work', needsActualCount > 0);
      naBtn.title = needsActualCount
        ? `계약완료인데 '실제 총 계약가'가 비어 있는 견적 ${needsActualCount}건 — 상세에서 넣어 주세요.`
        : '계약완료 건의 실제 총 계약가가 모두 입력돼 있습니다.';
    }

    /* 필터 */
    let list = all.slice().reverse();
    if (emFilter === 'needs-actual') list = list.filter(emNeedsActual);
    else if (emFilter === 'active') list = list.filter(emIsActive);
    else if (emFilter !== 'all') list = list.filter(e => e.status === emFilter);
    list = list.filter(emMatches);

    const total = list.length;
    const pages = Math.ceil(total/EM_PAGE) || 1;
    if (emPage > pages) emPage = pages;
    const slice = list.slice((emPage-1)*EM_PAGE, emPage*EM_PAGE);

    const emEmpty = document.getElementById('emEmpty');
    const emTable = document.getElementById('emTable');
    const emBody  = document.getElementById('emBody');
    const emPager = document.getElementById('emPager');

    if (!total) {
      /* 🔴 2026-09-27 걸러서 0건이면 「아직 산출된 견적이 없습니다」가 아니다 — 견적은 있는데 없다고 말했다 */
      const p = emEmpty.querySelector('p');
      if (p) p.textContent = (emFilter !== 'all' || emSearch) && all.length
        ? '조건에 맞는 견적이 없습니다 — 필터를 「전체」로 바꾸거나 검색어를 지워 보세요.'
        : '아직 산출된 견적이 없습니다 — 고객이 홈페이지에서 견적을 내거나, 왼쪽 「견적 산출」에서 만들면 여기에 쌓입니다.';
      emEmpty.classList.remove('hidden'); emTable.classList.add('hidden'); emPager.innerHTML=''; return;
    }
    emEmpty.classList.add('hidden'); emTable.classList.remove('hidden');

    const statusMap = { new:'신규', consulting:'상담중', contracted:'계약완료', closed:'종료' };
    const statusBadge = { new:'badge-new', consulting:'badge-pend', contracted:'badge-done', closed:'badge-read' };

    /* 상담 신청으로 연결된 견적 id 집합 (신규) — 목록에서 바로 표시 */
    const linkedQuoteIds = new Set(get(KEYS.contacts).map(c => c.linkedQuoteId).filter(Boolean));

    /* 🔴 **13열 → 9열** (2026-09-27). 실측(1440 모니터): 표 1,431px · 보이는 폭 1,169px —
       맨 오른쪽 **담당자·「상세」 열이 화면 밖**이라 옆으로 밀어야 상세를 열 수 있었다.
       열을 지우지 않고 **짝지어 두 줄로** 묶었다(견적서 대장과 같은 방식):
         견적번호+접수일시 · 기관명+목적지 · 청구 금액+1인당 · 이익률+이익(원가는 풍선말)
       ⚠ 열을 다시 늘리면 이 표는 또 잘린다 — 붙일 것은 짝 칸의 둘째 줄에 붙인다. */
    const man = (n) => '₩' + Math.round((Number(n) || 0) / 10000).toLocaleString() + '만';
    emBody.innerHTML = slice.map((e, i) => {
      /* ① 청구 금액 = data.total = 수익금 포함, 홈페이지 고객 표시와 동일
         ② 원가 = visibleTotal = 수익금 제외 순수 운영비 · 이익 = ① − ② (셈은 emMoney 한 곳) */
      const M          = emMoney(e);
      const per        = e.perPerson || 0;
      const st         = e.status || 'new';
      const rateCell = M.rate !== null
        ? `<b style="color:${M.low ? 'var(--danger)' : 'var(--success)'}">${(M.rate * 100).toFixed(1)}%</b>`
          + `<span class="em-sub">이익 ${man(M.profit)}</span>`
        : '<b style="color:var(--muted)">—</b><span class="em-sub">원가 기록 없음</span>';
      return `<tr>
        <td><input type="checkbox" class="em-row-check" data-id="${safeId(e.id)}" ${emSelectedIds.has(e.id) ? 'checked' : ''} onchange="toggleEmRowSelect('${safeId(e.id)}', this.checked)" aria-label="${esc((e.quoteNo || '번호 없음') + ' 선택')}" /></td>
        ${/* 🔴 번호가 없으면 **없다고 말한다.** 빈 칸으로 두면 담당자는 화면이 안 그린
             줄 알고, 그 건은 영영 번호 없이 남는다(결함 생성기 ②). */''}
        <td class="em-qno">${e.quoteNo
          ? `<strong>${esc(e.quoteNo)}</strong>`
          : '<span title="번호가 없는 옛 건입니다 — 번호 붙이기는 개발 담당에게 요청하세요" style="color:var(--warn)">번호 없음</span>'}<span class="em-sub date-col">${fmtDate(e.ts)}</span></td>
        <td class="em-who"><strong>${esc(e.orgName||'(기관명 없음)')}</strong><span class="em-sub em-who-sub">${/* 2026-10-02 대표 「꼬리표가 글자 끝에 붙어 들쭉날쭉」 — 칸을 고정한다: 목적지 | 내부산출 | 상담 | 발급. 없는 칸도 자리는 남긴다 */''}<span class="em-dest">${esc(e.destLabel||e.destKey||'-')}</span><span class="em-slot">${e.channel==='internal'?`<span class="em-tag em-tag-int" title="직원이 관리자 페이지에서 직접 산출${e.createdBy?' ('+esc(e.createdBy)+')':''}">🖥 내부산출</span>`:''}</span><span class="em-slot">${linkedQuoteIds.has(e.id)?'<span class="em-tag em-tag-cs" title="상담 신청됨">☎ 상담</span>':''}</span><span class="em-slot">${emShareBadge(e.id, e.quoteNo)}</span></span></td>
        <td style="white-space:nowrap">${e.participants ? e.participants + '명' : '—'} / ${e.days ? e.days + '일' : '—'}</td>
        ${/* 금액이 0이면 「₩0만」이 아니라 **적지 않았다**고 말한다 (2026-09-27) — 직접 작성 초안이 그렇게 저장된다 */''}
        <td class="em-num">${M.sell > 0
          ? `<b style="color:var(--primary)">${man(M.sell)}</b><span class="em-sub">1인당 ${man(per)}</span>`
          : '<b style="color:var(--muted);font-weight:600">금액 미입력</b>'}</td>
        <td class="em-num" title="${M.known ? '원가 ' + man(M.cost) + ' · 이익 = 청구 금액 − 원가' : '이 견적 기록에 원가가 없습니다'}">${rateCell}</td>
        <td><span class="badge ${statusBadge[st]||'badge-new'}">${statusMap[st]||st}</span>${verifyBadgeHtml(e)}${emNeedsActual(e)?' <span class="badge-need-actual" title="실제 총 계약가가 비어 있습니다 — 상세에서 넣어 주세요">💰 실적</span>':''}</td>
        <td>${assigneeSelectHtml(e.assignee, `data-id="${safeId(e.id)}" onchange="updateAssignee(this,'quote')"`)}</td>
        <td><button class="btn-detail" onclick="openEstDetail('${safeId(e.id)}')">상세</button></td>
      </tr>`;
    }).join('');

    /* 페이저 */
    let pg = '';
    if (pages > 1) {
      pg = `<span class="pager-info">${total}건 중 ${(emPage-1)*EM_PAGE+1}-${Math.min(emPage*EM_PAGE,total)}</span>`;
      if (emPage>1) pg+=`<button class="pager-btn" onclick="emGoto(${emPage-1})">‹</button>`;
      for (let p=1;p<=pages;p++) pg+=`<button class="pager-btn ${p===emPage?'active':''}" onclick="emGoto(${p})">${p}</button>`;
      if (emPage<pages) pg+=`<button class="pager-btn" onclick="emGoto(${emPage+1})">›</button>`;
    }
    emPager.innerHTML = pg;

    /* 체크박스 선택 상태 반영 (신규) — 이미 삭제된 id는 선택 목록에서 정리 */
    const liveIds = new Set(all.map(e => e.id));
    emSelectedIds.forEach(id => { if (!liveIds.has(id)) emSelectedIds.delete(id); });
    updateEmSelectedUI();
  }

  /* 견적 체크박스 선택 (신규) — 개별 선택, 전체선택, 선택삭제 버튼/헤더 체크박스
     상태 동기화까지 담당. "전체 선택"은 지금 화면(페이지)에 보이는 행 기준으로만
     동작한다(다른 페이지 항목은 건드리지 않음) — 헤더 체크박스 상태도 현재 DOM에
     보이는 행들만 보고 판단하므로 필터/페이지 로직을 따로 다시 구현할 필요가 없다. */
  function updateEmSelectedUI() {
    const btn = document.getElementById('emDeleteSelectedBtn');
    if (btn) {
      const n = emSelectedIds.size;
      btn.textContent = `🗑️ 선택 삭제 (${n})`;
      btn.disabled = n === 0;
    }
    const selectAll = document.getElementById('emSelectAll');
    const rowChecks = document.querySelectorAll('#emBody .em-row-check');
    if (selectAll) {
      const visibleChecked = document.querySelectorAll('#emBody .em-row-check:checked').length;
      selectAll.checked = rowChecks.length > 0 && visibleChecked === rowChecks.length;
      selectAll.indeterminate = visibleChecked > 0 && visibleChecked < rowChecks.length;
    }
  }

  function toggleEmRowSelect(id, checked) {
    if (checked) emSelectedIds.add(id); else emSelectedIds.delete(id);
    updateEmSelectedUI();
  }

  function toggleEmSelectAll(checked) {
    document.querySelectorAll('#emBody .em-row-check').forEach(cb => {
      cb.checked = checked;
      if (checked) emSelectedIds.add(cb.dataset.id); else emSelectedIds.delete(cb.dataset.id);
    });
    updateEmSelectedUI();
  }

  async function deleteSelectedEstimates() {
    const n = emSelectedIds.size;
    if (!n) return;
    if (!confirm(`선택한 견적 ${n}건을 삭제하시겠습니까?`)) return;
    const idsToDelete = [...emSelectedIds];
    localStorage.setItem(EM_KEY, JSON.stringify(getEstsFull().filter(e => !emSelectedIds.has(e.id))));
    emSelectedIds.clear();
    renderEstMgr();
    /* 실패 건수를 모아 한 번 알리고 서버 값으로 되돌린다 (PV) — 예전엔 전건 실패해도
       목록에서는 지워진 것으로 보였다. */
    await leadWriteBatch('견적 선택 삭제', idsToDelete.map(id => () => deleteQuote(id, { defer: true })));
  }

  function emGoto(p) { emPage = p; renderEstMgr(); }

  /* ── P12: 계수 기여도 패널 ──────────────────────────────────────────────
     저장된 계수 스냅샷(P6/P2b)으로 이 견적의 계산 배수를 재구성해 보여준다. 순수 표시라
     계산식·서버 변경은 없다. 스냅샷 이전(2026-07 도입 전) 견적은 필드가 없어 '정보 없음'으로
     처리. 배수 체인은 실제 엔진(script.js getBreakdownData)과 동일하게 맞춘다:
       항공 = 시즌×출발지×비즈×리드×피크×volScale,  유류 = 시즌×출발지×리드×피크×volScale,
       호텔 = 시즌×환율×호텔피크(등급은 기본단가 선택이라 계수에서 제외),
       식사·차량·가이드 = 환율,  관광 = 환율×관광일수(PC),  보험 = 권역×기간(PB, 환율 무관·원화),
       전체 = 프로그램×기관(combined) / 인원 tier.
     volScale은 스냅샷에 없어 시즌×리드×피크로 재계산(P11 상한 2.5, 기본노브에선 항상 1).
     ⚠ 엔진에 계수를 추가하면 여기도 같이 늘려야 한다 — 안 그러면 이 패널이 '이 견적의
     전체 계수'를 보여준다고 해놓고 일부를 빠뜨려, 내부 검토자가 잘못 판단하게 된다.
     (2026-07-28: PB 보험·PC 관광일수가 빠져 있던 것을 보완. 그 이전 견적은 스냅샷에
     해당 필드가 없으므로 각 행을 조건부로만 렌더한다.) */
  const COEF_VOL_CAP = 2.5;  /* script.js VOL_MULTIPLIER_CAP과 동일하게 유지 */
  const COEF_DEFAULTS = { seasonStrength:1.0, leadTimeStrength:1.0, peakStrength:1.0, hotelPeakWeight:0.8 };
  function coefContribHtml(e) {
    const hasSnap = ['seasonFactor','leadFactor','peakFactor'].some(k => typeof e[k] === 'number');
    if (!hasSnap) {
      return `<div class="detail-label" style="margin-bottom:.5rem">계수 기여도</div>
        <div style="color:var(--muted);font-size:.82rem">2026-07 이전 견적이라 계수 기록이 없습니다.</div>`;
        /* ⚠ 2026-09-15 대표 지시로 줄였다. 예전: 「이 견적은 계수 스냅샷 도입(2026-07)
           이전에 생성되어 계수 기여도 정보가 없습니다. 이후 생성된 견적부터 표시됩니다.」
           🔴 **지우지 않는다** — 왜 비었는지 말하는 줄이다. 잃은 것은 「이후 견적부터
             표시된다」는 안내인데, 최신 견적을 한 번 열면 바로 알 수 있는 사실이다. */
    }
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : 1;
    const season = num(e.seasonFactor), lead = num(e.leadFactor), peak = num(e.peakFactor),
          dep = num(e.departureFactor), biz = num(e.bizFactor), fx = num(e.fxAdjust),
          hotelPeak = num(e.hotelPeakFactor), combined = num(e.combinedFactor), pax = num(e.paxFactor);
    const volProduct = season * lead * peak;
    const volScale = volProduct > COEF_VOL_CAP ? COEF_VOL_CAP / volProduct : 1;
    const airNet   = season * dep * biz * lead * peak * volScale;
    const fuelNet  = season * dep * lead * peak * volScale;
    const hotelNet = season * fx * hotelPeak;

    /* 🎨 2026-09-28 대표 요청 「박스들 딱딱 떨어지게 · 더 이쁘게」 — **숫자는 한 글자도 안 바뀐다**(표시만).
       예전엔 칩이 글자 길이만큼 늘고 설명 글이 칩 사이에 끼어, 줄마다 칩 자리가 달랐다.
       → 칩은 **모든 줄이 같은 5칸 격자**(세로 줄이 맞는다) · 이름(위)/배수(아래) 두 줄 · 설명은 칩 아래 한 줄 ·
         결과 배수는 오른쪽 한 열의 알약. 색: 1.0 = 회색 · 오름 = 붉게 · 내림 = 푸르게.
       ⚠ 바꾸기 전후로 226가지 조합의 숫자(×배수·%·원/인)를 대조했다 — 같다. 규칙은 admin.css `.cc-*`. */
    const chip = (label, v, note) => {
      const on = Math.abs(v - 1) > 1e-6;
      const dir = !on ? 'eq' : (v > 1 ? 'up' : 'dn');
      const pct = on ? ` <small>(${v > 1 ? '+' : ''}${((v - 1) * 100).toFixed(0)}%)</small>` : '';
      const nt = note ? ` <i>${esc(note)}</i>` : '';
      return `<span class="cc-chip cc-${dir}"><span class="cc-k">${esc(label)}${nt}</span><span class="cc-v"><b>×${v.toFixed(3)}</b>${pct}</span></span>`;
    };
    const netBadge = (v) => {
      const strong = v >= 2.0;
      const cls = strong ? 'hi' : (v > 1 ? 'up' : (v < 1 ? 'dn' : 'eq'));
      return `<span class="cc-net cc-net-${cls}">×${v.toFixed(3)}</span>` + (strong ? `<span class="cc-warn">높은 변동배수 · 확인 권장</span>` : '');
    };
    const row = (title, chipsHtml, netHtml, note) => `
      <div class="cc-row">
        <div class="cc-t">${title}</div>
        <div class="cc-chips">${chipsHtml}</div>
        <div class="cc-r">${netHtml}</div>
        ${note ? `<div class="cc-note">${note}</div>` : ''}
      </div>`;

    const seasonLabelMap = { peak:'성수기', offpeak:'비수기', normal:'평시' };
    const seasonNote = seasonLabelMap[e.seasonId] || '';
    const peakNote = e.peakLabel || '';

    /* 항공·유류: 수요 변동이 가장 크게 스택되는 지점 */
    const airChips = [
      chip('시즌', season, seasonNote),
      chip('출발지', dep),
      chip('비즈', biz),
      chip('리드', lead),
      chip('피크', peak, peakNote),
      (volScale < 1 ? chip('변동상한', volScale, `변동 폭이 ${COEF_VOL_CAP}배를 넘어 줄임`) : ''),
    ].join('');
    const fuelChips = [
      chip('시즌', season, seasonNote),
      chip('출발지', dep),
      chip('리드', lead),
      chip('피크', peak, peakNote),
      (volScale < 1 ? chip('변동상한', volScale, '') : ''),
    ].join('');
    const hotelChips = [ chip('시즌', season, seasonNote), chip('환율', fx), chip('호텔피크', hotelPeak) ].join('');
    const groundChips = chip('환율', fx);

    /* PC: 관광은 환율 위에 '여행 일수' 계수가 더 붙는다(sightseeing_fee가 4~5일 기준
       전체 묶음이라). 스냅샷에 없으면(PC 이전 견적) 이 행 자체를 렌더하지 않는다. */
    const sightF = (e.sightDuration && typeof e.sightDuration.factor === 'number') ? e.sightDuration.factor : null;
    const sightRow = sightF === null ? '' : row('관광',
      chip('환율', fx) + chip('일수', sightF, e.sightDuration.label || ''),
      netBadge(fx * sightF), '인원 볼륨 할인은 단가에 이미 반영됨');

    /* PB: 보험은 권역(현지 의료비)×기간. 환율·시즌·노브 대상이 아니라 별도 행으로 둔다
       — 다른 행과 같은 자리에 섞으면 '보험도 환율을 받는다'고 오해하게 된다. */
    const ins = e.insuranceInfo;
    const insRow = (!ins || typeof ins.zoneFactor !== 'number') ? '' : row('보험',
      chip('권역', ins.zoneFactor, ins.zoneLabel || '') + chip('기간', ins.durationFactor, ins.durationLabel || ''),
      netBadge(ins.zoneFactor * ins.durationFactor) +
        (typeof ins.rate === 'number' ? `<span class="cc-sub">= ${ins.rate.toLocaleString('ko-KR')}원/인</span>` : ''),
      '원가 기반이라 시즌·리드·피크·환율 무관');

    const wholeChips = chip('프로그램×기관', combined) + chip('인원(항공·유류)', pax);

    /* VK: 금액 구간별 마진 계수. **마진 두 줄(본사·현지)에만** 걸리므로 위 행들과 섞지
       않는다 — 같은 자리에 두면 「항공·호텔에도 붙는다」고 오해하게 된다(보험 행과 같은 이유).
       ⚠ 스냅샷에 없으면(VK 이전 견적) 행 자체를 렌더하지 않는다 — 1.0으로 보이면
         「구간 계수가 없었다」와 「1배 구간이었다」가 구분되지 않는다(조용한 폴백). */
    const mb = (typeof e.marginBandMul === 'number') ? e.marginBandMul : null;
    const marginRow = mb === null ? '' : row('마진(구간)',
      chip('금액구간', mb, e.marginBandLabel || ''),
      netBadge(mb),
      (typeof e.costSubtotalUnit === 'number'
        ? `판정 기준 원가소계 ${Math.round(e.costSubtotalUnit).toLocaleString('ko-KR')}원/인 (마진·보험 전) · ` : '')
        + '본사 수익·현지 수익금 두 줄에만 적용');

    /* 적용된 노브(coef)가 기본값과 다르면 별도 안내 — 전 견적에 전역 영향을 준 값 */
    let knobHtml = '';
    if (e.coef && typeof e.coef === 'object') {
      const changed = Object.keys(COEF_DEFAULTS).filter(k => typeof e.coef[k] === 'number' && Math.abs(e.coef[k] - COEF_DEFAULTS[k]) > 1e-6);
      if (changed.length) {
        const nameMap = { seasonStrength:'시즌강도', leadTimeStrength:'리드강도', peakStrength:'피크강도', hotelPeakWeight:'호텔피크비중' };
        knobHtml = `<div class="cc-knob">
          이 견적에 적용된 계수 노브(기본값과 다름): <b>${changed.map(k => `${nameMap[k]||k} ${e.coef[k]}`).join(' · ')}</b>
          <span>— 관리자 계수 조정이 반영된 견적입니다.</span></div>`;
      }
    }

    return `
      <div class="cc-head">
        <span class="cc-title">계수 기여도</span>
        <span class="cc-tags"><span>내부 전용</span><span>실측 전 계수 타당성 검증용</span><span>고객 미노출</span></span>
      </div>
      <div class="cc-lead">기본단가에 아래 계수가 곱해져 항목 단가가 정해집니다(계산 당시 스냅샷).</div>
      <div class="cc-legend"><span class="cc-net cc-net-eq">1.0 그대로</span><span class="cc-net cc-net-up">올림</span><span class="cc-net cc-net-dn">내림</span><span class="cc-legend-r">= 이 항목에 곱해진 값</span></div>
      ${row('항공', airChips, netBadge(airNet))}
      ${row('유류', fuelChips, netBadge(fuelNet))}
      ${row('호텔', hotelChips, netBadge(hotelNet))}
      ${row('현지 지상비', groundChips, netBadge(fx), '식사는 인원 볼륨 할인이 단가에 이미 반영됨')}
      ${sightRow}
      ${insRow}
      ${marginRow}
      ${row('전체', wholeChips, `<span class="cc-sub">항목별 별도 적용</span>`)}
      ${knobHtml}`;
  }

  /* ── 견적 상세 모달 ── */
  /* 서버 검증 결과 표시 (신규) — /api/quotes가 저장할 때 권위 요율표·계수와 대조한
     결과를 payload._verify에 남긴다. 그런데 그 기록을 화면에 안 띄우면 아무도 못 보는
     기록이 되고, 그건 "검증한다"고 말만 하는 것과 같다(이 프로젝트에서 반복해서
     문제가 됐던 유형이라 목록·상세 양쪽에 붙인다).
     verified면 아무것도 안 띄운다 — 정상이 대부분이라 배지를 달면 소음이 된다. */
  function verifyBadgeHtml(rec) {
    const v = rec && rec._verify;
    if (!v || v.verdict === 'verified') return '';
    const label = v.verdict === 'unavailable' ? '검증 못함' : '확인 필요';
    const title = (v.failedSteps || []).length
      ? `검증에서 걸린 항목: ${(v.failedSteps || []).join(', ')}`
      : '서버 검증을 수행하지 못했습니다';
    return ` <span class="badge badge-pend" title="${esc(title)}" style="margin-left:.25rem">⚠ ${label}</span>`;
  }

  /* 상세 모달용 — 걸린 단계를 사람 말로 풀어 보여준다. 어느 단계에서 왜 걸렸는지
     알아야 담당자가 "조작인가 낡음인가"를 판단할 수 있다. */
  function verifyDetailHtml(rec) {
    const v = rec && rec._verify;
    if (!v) return '';
    /* 2026-09-28 대표 요청 — 통과한 건은 아무것도 안 띄운다(「✓ 서버 검증 통과 (날짜)」를 뺐다).
       🔴 **걸린 건의 경고는 그대로** — 조작인지 낡은 값인지 판단할 유일한 단서다. */
    if (v.verdict === 'verified') return '';
    const failed = (v.steps || []).filter(x => !x.ok);
    const rows = failed.length
      ? failed.map(x => `<li><strong>${esc(x.label)}</strong> — ${esc(x.detail || '')}</li>`).join('')
      : '<li>서버 검증을 수행하지 못했습니다(권위 데이터 조회 실패).</li>';
    return `
      <div style="margin:.5rem 0 .2rem;padding:.7rem .85rem;background:#FFF8E6;border-left:3px solid #E0A800">
        <div style="font-size:.8rem;font-weight:700;color:#7A5A10;margin-bottom:.35rem">⚠ 서버 검증에서 걸린 항목</div>
        <ul style="font-size:.76rem;color:#7A5A10;line-height:1.75;padding-left:1.1rem;margin:0">${rows}</ul>
        <div style="font-size:.72rem;color:#8A6A20;margin-top:.45rem">
          금액 조작일 수도, 요율이 그 사이 바뀐 것일 수도 있습니다. 확인 후 필요하면 재산출해 주세요.
        </div>
      </div>`;
  }

  function openEstDetail(id) {
    const all = getEstsFull();
    const e   = all.find(x => x.id === id);
    if (!e) return;
    emCurrentId = id;
    /* 🔴 **열 때마다 고객용으로 되돌린다** (대표 지시 2-1: 「기본으로 열리는 탭은 고객용」).
       앞 견적에서 직원용을 보고 닫았으면 다음 건이 원가 화면으로 열린다 — 상태가
       건을 넘어 새는 자리다(일정 편집기에서 이미 한 번 겪었다). */
    emEditReset();
    /* 🔴 **열 때 정리한다** — 접을 것을 접고, 무슨 건인지 한 줄로 말한다 */
    emCollapseExtras();
    emRenderHeadSum(e);
    emSyncActualVisibility(e);
    emSyncMoreMenu(e);
    emSetTab('cust');
    /* UI: 일정 편집기를 접어 둔 상태로 되돌린다. 안 지우면 **앞 견적의 일정이
       다음 견적 화면에 그대로 남고**, 그 상태로 저장하면 남의 일정이 이 고객에게 간다.
       ⚠ UM: 편집기가 모달로 나갔으므로 **열려 있으면 닫는 것까지** 해야 한다.
         상태만 지우고 화면을 두면 앞 견적의 일자 카드가 그대로 떠 있다. */
    document.getElementById('eqModal').classList.add('hidden');
    eqOnSaved = null;
    eqReset();
    emRenderItiState();
    emRenderDocPreview(e);

    /* 🔴 **번호를 제목에 띄운다** (대표 지시 1-5). 상세를 열어 놓고 전화하는 자리라,
       여기 없으면 담당자가 목록으로 되돌아가야 한다. */
    document.getElementById('emModalTitle').textContent =
      (e.quoteNo ? e.quoteNo + ' · ' : '') + (e.destLabel || e.destKey ? `견적 상세 — ${e.destLabel || e.destKey}` : '견적 상세 — 목적지 미기재');

    /* 이 견적으로 상담 신청이 들어왔는지 (신규) */
    const linkedInq = get(KEYS.contacts).find(c => c.linkedQuoteId === id);
    const linkedInqEl = document.getElementById('em-linked-inquiry');
    if (linkedInq) {
      linkedInqEl.classList.remove('hidden');
      linkedInqEl.innerHTML = `
        <div style="background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:.8rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap">
          <span style="font-size:.84rem;color:#1d4ed8">☎ <strong>${esc(linkedInq.name||'—')}</strong>님이 이 견적으로 상담을 요청했습니다 — ${esc(linkedInq.tel||'—')}</span>
          <button type="button" class="btn-act btn-outline-p" onclick="jumpToInquiry('${safeId(linkedInq.id)}')">문의 관리에서 보기</button>
        </div>`;
    } else {
      linkedInqEl.classList.add('hidden');
      linkedInqEl.innerHTML = '';
    }

    /* 서버 검증 결과 (신규) — 걸린 게 있으면 상단에 바로 보이게 한다. */
    const verifyEl = document.getElementById('em-verify-block');
    if (verifyEl) verifyEl.innerHTML = verifyDetailHtml(e);

    /* 🎨 2026-09-28 대표 요청 「깔끔하게」 — 「담당자: admin<br>기관 유형: —」처럼 글줄로 이어 쓰던 것을
       **[항목 이름 | 값] 두 칸 표**로. 이름은 회색 고정 폭, 값은 진하게. 값이 없는 줄은 「—」로 남긴다(빠진 줄로 오해하지 않게).
       ⚠ 값은 전부 esc를 거친다(공개 제출 payload에서 온 값이다 — 결함 생성기 ④). */
    const dlRow = (k, v) => `<div class="em-dl-r"><dt>${k}</dt><dd>${v}</dd></div>`;
    document.getElementById('em-orginfo').innerHTML = '<dl class="em-dl">'
      + dlRow('기관명', `<b>${esc(e.orgName||'—')}</b>`)
      + dlRow('담당자', esc(e.contact||'—'))
      + dlRow('기관 유형', esc(e.orgTypeLabel||'—'))
      + (e.channel==='internal' ? dlRow('작성', `내부 산출 · ${esc(e.createdBy||'담당자 미지정')}`) : '')
      + (e.request ? dlRow('요청 사항', `<span class="em-dl-note">${esc(e.request)}</span>`) : '')
      + '</dl>';

    /* 연수 조건 */
    /* 출발공항·좌석등급·객실구성은 저장은 되고 있었지만 어디에도 표시되지 않았다.
       셋 다 금액을 크게 좌우하는 고객 선택값이라(좌석 최대 4배·객실 최대 2배·출발지 16%),
       관리자가 총액만 보고 "왜 이렇게 비싼가"를 판단할 수 없었다. 계수 기여도 패널(P12)에
       배수(×4.000)는 있지만 "비즈니스 몇 명"인지는 그 숫자로 읽히지 않는다.
       구버전 견적에는 필드가 없으므로 있을 때만 줄을 추가한다(없는 값을 지어내지 않음). */
    const condExtra = [
      e.departureCityLabel ? dlRow('출발', esc(e.departureCityLabel)) : '',
      e.cabinClassLabel    ? dlRow('좌석', `<b>${esc(e.cabinClassLabel)}</b>`) : '',
      e.roomConfigLabel    ? dlRow('객실 구성', esc(e.roomConfigLabel)) : '',
    ].filter(Boolean).join('');
    /* ⚠ 식사 단위가 바뀌었다 (RO): 예전 견적은 '식수'(mealCount), 새 견적은
       '일수'(mealDays)로 기록된다. 단위를 함께 적어 구분한다. */
    const mealTxt = e.mealDays != null ? e.mealDays + '일' : (e.mealCount != null ? e.mealCount + '식(구버전)' : '—');
    document.getElementById('em-conds').innerHTML = '<dl class="em-dl">'
      + dlRow('목적지', `<b>${esc(e.destLabel||e.destKey)}</b>`
        + (e.rateDate ? ` <span class="em-dl-tag">요율 ${esc(e.rateDate)} · v${esc(e.rateVersion||'—')}</span>` : ''))
      + dlRow('프로그램', esc(e.programLabel||'—'))
      + dlRow('인원 · 기간', `${Number(e.participants)||0}명 · ${Number(e.days)||0}일 (${Number(e.nights)||0}박)`)
      + condExtra
      + dlRow('식사 · 객실', `${mealTxt} · ${e.rooms||Math.ceil((Number(e.participants)||0)/2)}실`)
      + dlRow('계수', `×${(e.combinedFactor||1).toFixed(3)}`)
      + '</dl>';

    /* 항목 내역 (비공개 포함) */
    /* 공개 제출 payload에서 온 값이라 문자열일 수 있다. String.toLocaleString은
         문자열을 그대로 돌려주므로 숫자로 못 박지 않으면 원문이 화면에 출력된다. */
      const fmt = n => '₩'+(Number(n)||0).toLocaleString('ko-KR');
    let tbodyHtml = '';
    (e.items||[]).forEach(item => {
      const style = item.isHidden
        ? 'background:#fffbeb;color:#92400e'
        : '';
      const badge = item.isHidden ? ' <span style="font-size:.68rem;background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:.1rem .35rem">비공개</span>' : '';
      tbodyHtml += `<tr style="${style}">
        <td style="padding:.45rem .6rem">${esc(item.adminLabel||item.name)}${badge}</td>
        <td style="padding:.45rem .6rem;text-align:right;color:var(--muted)">${fmt(item.unit||0)}</td>
        <td style="padding:.45rem .6rem;text-align:center;color:var(--muted);font-size:.76rem">${esc(item.qty||'')}</td>
        <td style="padding:.45rem .6rem;text-align:right;font-weight:700">${fmt(item.amount||0)}</td>
      </tr>`;
    });
    document.getElementById('em-breakdown').innerHTML = tbodyHtml;

    /* 테이블 푸터 */
    const base = (e.items||[]).reduce((s,it)=>s+(it.amount||0),0);
    document.getElementById('em-tfoot').innerHTML = `
      <tr style="border-top:2px solid var(--primary)">
        <td colspan="3" style="padding:.45rem .6rem;font-weight:700;color:var(--primary)">소계</td>
        <td style="padding:.45rem .6rem;text-align:right;font-weight:700;color:var(--primary)">${fmt(base)}</td>
      </tr>
      ${(e.combinedFactor||1)!==1?`<tr>
        <td colspan="3" style="padding:.3rem .6rem;color:var(--muted);font-size:.78rem">× 계수 적용 (${(e.combinedFactor||1).toFixed(3)})</td>
        <td></td>
      </tr>`:''}`;

    /* 총액 박스
       ① 청구 금액 = e.total  = 수익 포함 = 홈페이지 고객 표시 금액과 동일
       ② 원가 합계 = e.visibleTotal = 수익 제외 운영비
       ③ 예상 수익 = ① - ②                                              */
    /* ⚠ 셈은 `emMoney` 한 곳 — 예전엔 여기서 `null` 원가를 못 걸러 ₩0으로 찍었다 */
    const M2 = emMoney(e);
    document.getElementById('em-custotal').textContent  = fmt(M2.sell);
    document.getElementById('em-fulltotal').textContent = M2.known ? fmt(M2.cost) : '— (기록 없음)';
    document.getElementById('em-perperson').textContent = fmt(e.perPerson||0);
    /* 수익금 박스가 있으면 업데이트 */
    const profitEl = document.getElementById('em-profit');
    if (profitEl) profitEl.textContent = M2.known ? fmt(M2.profit) : '—';

    /* 💰 수익 요약 (대표 지시 2-5) — 금액을 채운 **직후**에 그린다.
       ⚠ 여기서 그려야 항목 표·금액 칸과 같은 값을 본다(따로 불러오면 한 박자 어긋난다). */
    emRenderProfit(e);

    /* P5: 실측 기준 신뢰구간 (내부 전용 · 순수 표시) */
    const confEl = document.getElementById('em-confidence');
    if (confEl) {
      const c = computeQuoteConfidence(e);
      if (!c) {
        confEl.classList.add('hidden'); confEl.innerHTML = '';
      } else if (c.insufficient) {
        confEl.classList.remove('hidden');
        /* ⚠ 2026-09-15 대표 지시로 **줄였다**(「필요 없어 보이는 문구는 간결하게」).
           예전: 「📊 실측 기준 신뢰구간 — 이 목적지의 계약 실적(상세모달의 '실제 총 계약가'
                  입력)이 3건 이상 쌓이면 예상 범위가 표시됩니다. 현재 0건.」 → 두 줄을 먹었다.
           🔴 **지우지는 않는다** — 왜 이 자리가 비었는지 말하는 줄이다. 없애면
             「신뢰구간이 원래 없는 기능」으로 읽힌다(조용한 폴백).
           ⚠ 잃은 것: 실적을 **어디에** 넣는지(「상세모달의 '실제 총 계약가'」)를 더는
             말하지 않는다. 그 입력칸은 **같은 모달 안 아래쪽**에 있어 화면에서 보인다. */
        confEl.innerHTML = `<span style="color:var(--muted)">📊 <strong>실측 신뢰구간</strong> — 계약 실적 ${c.count}/${CONF_MIN_COUNT}건. ${CONF_MIN_COUNT}건부터 예상 범위를 보여 드립니다.</span>`;
      } else {
        const warn = Math.abs(c.medianErr) >= 0.10
          ? ` <span style="color:${c.medianErr > 0 ? 'var(--danger)' : '#b45309'};font-weight:700">· 견적이 실측 대비 평균 ${c.medianErr > 0 ? '낮음' : '높음'} ${Math.abs(c.medianErr * 100).toFixed(0)}%</span>`
          : '';
        confEl.classList.remove('hidden');
        confEl.innerHTML =
          `📊 <strong>실측 기준 예상 범위</strong> (계약 ${c.count}건): ` +
          `<strong style="color:#1d4ed8">${fmt(c.lo)} ~ ${fmt(c.hi)}</strong> ` +
          `<span style="color:var(--muted)">· 중앙 보정 ${fmt(c.mid)}</span>${warn}` +
          `<div style="color:var(--muted);font-size:.72rem;margin-top:.2rem">과거 이 목적지 계약의 (실제 총액 ÷ 견적 총액) 분포 p10~p90 기준 · 내부 참고용, 고객 견적서에는 미노출</div>`;
      }
    }

    /* P12: 계수 기여도 — 저장된 스냅샷으로 배수 체인 표시(내부 전용·순수 표시) */
    const coefEl = document.getElementById('em-coef-contrib');
    if (coefEl) {
      coefEl.classList.remove('hidden');
      coefEl.innerHTML = coefContribHtml(e);
    }

    /* 상태 + 메모 */
    document.getElementById('em-status-sel').value = e.status || 'new';
    document.getElementById('em-note-area').value   = e.note   || '';
    fillAssigneeSelect(document.getElementById('em-assignee-sel'), e.assignee);
    emAutoSaveState('고르거나 적으면 바로 저장됩니다', 'var(--muted)');
    document.getElementById('em-log-author-tag').textContent = `작성자: ${currentUser.displayName}`;
    document.getElementById('em-log-list').innerHTML = activityLogHtml(e.activityLog);

    /* 실제 계약 항공료 (신규) — 이 견적 계산 당시의 추정 항공료(1인당)를 items에서
       찾아 나란히 보여주고, 이미 입력된 실제값이 있으면 채워 넣는다 */
    const estAirfareItem = (e.items||[]).find(it => it.name === '항공');
    const estAirfareEl = document.getElementById('em-est-airfare');
    estAirfareEl.textContent = estAirfareItem ? `추정(이 견적 계산 당시): ${fmt(estAirfareItem.unit||0)}` : '추정 항공료 정보 없음';
    document.getElementById('em-actual-airfare').value = (e.actualAirfareUnit != null) ? e.actualAirfareUnit : '';
    document.getElementById('em-actual-airfare-msg').textContent = '';

    /* 실제 계약 호텔단가 (신규) — 위 항공료와 대칭. 호텔 항목명은 등급이 붙어
       "호텔 (수페리어)"처럼 동적이라 정확히 일치가 아닌 startsWith로 찾는다. */
    const estHotelItem = (e.items||[]).find(it => (it.name||'').startsWith('호텔'));
    const estHotelEl = document.getElementById('em-est-hotel');
    estHotelEl.textContent = estHotelItem ? `추정(이 견적 계산 당시): ${fmt(estHotelItem.unit||0)}` : '추정 호텔단가 정보 없음';
    document.getElementById('em-actual-hotel').value = (e.actualHotelUnit != null) ? e.actualHotelUnit : '';
    document.getElementById('em-actual-hotel-msg').textContent = '';

    /* 실제 계약 식비 (신규 · P1b) — 위 항공/호텔과 대칭 */
    const estMealItem = (e.items||[]).find(it => it.name === '식사');
    document.getElementById('em-est-meal').textContent = estMealItem ? `추정(이 견적 계산 당시): ${fmt(estMealItem.unit||0)}` : '추정 식비 정보 없음';
    document.getElementById('em-actual-meal').value = (e.actualMealUnit != null) ? e.actualMealUnit : '';
    document.getElementById('em-actual-meal-msg').textContent = '';

    /* 실제 총 계약가 (신규 · P1b) — 참조값은 견적 총액 자체 */
    document.getElementById('em-est-total').textContent = `견적 총액: ${fmt(e.total||0)}`;
    document.getElementById('em-actual-total').value = (e.actualTotal != null) ? e.actualTotal : '';
    document.getElementById('em-actual-total-msg').textContent = '';

    document.getElementById('emModal').classList.remove('hidden');
    emHashSet({ q: id, v: null, s: null, f: null });
  }

  /* 실제 계약 항공료 저장 (신규) — saveEstimateDetail()과 별개의 독립 저장(상태/메모/
     담당자 일반 저장이 이 값을 실수로 덮어쓰지 않도록 분리) */
  async function saveActualAirfare() {
    const input = document.getElementById('em-actual-airfare');
    const msg = document.getElementById('em-actual-airfare-msg');
    const unit = Number(input.value);
    if (!input.value || !Number.isFinite(unit) || unit <= 0 || unit > 50000000) { msg.style.color='var(--danger)'; msg.textContent='올바른 금액을 입력해 주세요(0보다 크고 5천만원 이하).'; return; }
    try {
      const res = await fetch(`/api/quotes/${emCurrentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualAirfare: { unit } }),
      });
      if (!res.ok) throw new Error('save_failed');
      const all = getEstsFull();
      const idx = all.findIndex(x => x.id === emCurrentId);
      if (idx >= 0) { all[idx].actualAirfareUnit = unit; localStorage.setItem(EM_KEY, JSON.stringify(all)); }
      msg.style.color='var(--success)'; msg.textContent='저장됨';
    } catch (err) {
      msg.style.color='var(--danger)'; msg.textContent='저장 실패';
    }
    setTimeout(() => { msg.textContent=''; }, 3000);
  }

  /* 실제 계약 호텔단가 저장 (신규) — saveActualAirfare()와 대칭 */
  async function saveActualHotel() {
    const input = document.getElementById('em-actual-hotel');
    const msg = document.getElementById('em-actual-hotel-msg');
    const unit = Number(input.value);
    if (!input.value || !Number.isFinite(unit) || unit <= 0 || unit > 50000000) { msg.style.color='var(--danger)'; msg.textContent='올바른 금액을 입력해 주세요(0보다 크고 5천만원 이하).'; return; }
    try {
      const res = await fetch(`/api/quotes/${emCurrentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualHotel: { unit } }),
      });
      if (!res.ok) throw new Error('save_failed');
      const all = getEstsFull();
      const idx = all.findIndex(x => x.id === emCurrentId);
      if (idx >= 0) { all[idx].actualHotelUnit = unit; localStorage.setItem(EM_KEY, JSON.stringify(all)); }
      msg.style.color='var(--success)'; msg.textContent='저장됨';
    } catch (err) {
      msg.style.color='var(--danger)'; msg.textContent='저장 실패';
    }
    setTimeout(() => { msg.textContent=''; }, 3000);
  }

  /* 실제 계약 식비 저장 (신규 · P1b) — saveActualAirfare()와 대칭 */
  async function saveActualMeal() {
    const input = document.getElementById('em-actual-meal');
    const msg = document.getElementById('em-actual-meal-msg');
    const unit = Number(input.value);
    if (!input.value || !Number.isFinite(unit) || unit <= 0 || unit > 50000000) { msg.style.color='var(--danger)'; msg.textContent='올바른 금액을 입력해 주세요(0보다 크고 5천만원 이하).'; return; }
    try {
      const res = await fetch(`/api/quotes/${emCurrentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualMeal: { unit } }),
      });
      if (!res.ok) throw new Error('save_failed');
      const all = getEstsFull();
      const idx = all.findIndex(x => x.id === emCurrentId);
      if (idx >= 0) { all[idx].actualMealUnit = unit; localStorage.setItem(EM_KEY, JSON.stringify(all)); }
      msg.style.color='var(--success)'; msg.textContent='저장됨';
    } catch (err) {
      msg.style.color='var(--danger)'; msg.textContent='저장 실패';
    }
    setTimeout(() => { msg.textContent=''; }, 3000);
  }

  /* 실제 총 계약가 저장 (신규 · P1b) — 종합 정확도 측정용. 총액이라 상한을 크게 둔다. */
  async function saveActualTotal() {
    const input = document.getElementById('em-actual-total');
    const msg = document.getElementById('em-actual-total-msg');
    const val = Number(input.value);
    if (!input.value || !Number.isFinite(val) || val <= 0 || val > 10000000000) { msg.style.color='var(--danger)'; msg.textContent='올바른 총액을 입력해 주세요(0보다 크고 100억 이하).'; return; }
    try {
      const res = await fetch(`/api/quotes/${emCurrentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualTotal: { value: val } }),
      });
      if (!res.ok) throw new Error('save_failed');
      const all = getEstsFull();
      const idx = all.findIndex(x => x.id === emCurrentId);
      if (idx >= 0) { all[idx].actualTotal = val; localStorage.setItem(EM_KEY, JSON.stringify(all)); }
      msg.style.color='var(--success)'; msg.textContent='저장됨';
    } catch (err) {
      msg.style.color='var(--danger)'; msg.textContent='저장 실패';
    }
    setTimeout(() => { msg.textContent=''; }, 3000);
  }

  /* RG: '실제 총 계약가' 칸으로 데려간다. 예전에는 취소하면 저장만 멈추고 모달이 열린
     채로 남았는데, 이 모달은 길어서 담당자가 어느 칸을 채워야 하는지 스스로 찾아야 했다.
     "넣어 달라"고 말했으면 그 자리까지 데려가는 것이 맞다. */
  function emFocusActualTotal() {
    const el = document.getElementById('em-actual-total');
    if (!el) return;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    el.focus();
    /* 잠깐 켰다 끄는 강조 — 스크롤만 하면 어디가 그 칸인지 여전히 눈으로 찾아야 한다.
       CSS 애니메이션이 아니라 클래스 토글이라, 모션을 끈 환경에서도 확실히 보인다. */
    const card = el.closest('div');
    if (!card) return;
    card.classList.add('need-actual-hi');
    setTimeout(() => card.classList.remove('need-actual-hi'), 2600);
  }

  /* 저장 */
  async function saveEstimateDetail() {
    const all = getEstsFull();
    const idx = all.findIndex(x => x.id === emCurrentId);
    if (idx < 0) return;
    const newStatus = document.getElementById('em-status-sel').value;
    /* 계약완료 전환 시 실제가 리마인드 — 강제 차단은 아니고, 값이 비어 있으면 한 번 더
       확인만 한다. 취소하면 저장을 중단해 모달이 열린 채로 남는다("부드러운 리마인드").

       ⚠ RG에서 **무엇을 확인하는지**를 고쳤다. 예전에는 항공료·호텔단가만 봤는데,
       실측 신뢰구간(P5)과 목적지별 '종합' 오차가 실제로 읽는 값은 **actualTotal(실제 총
       계약가)**이다. 그래서 총 계약가가 비어 있어도 항공료 하나만 채워져 있으면 리마인드가
       조용히 지나갔다 — 안전망이 정작 필요한 값을 안 보고 있었던 셈이다(결함 생성기 ③).
       ⚠ 그리고 **지금이 그 숫자를 아는 유일한 때다.** 이번 주 계약 금액을 다음 달에
       기억해서 채우기는 어렵다. 그래서 여기서 한 번 더 묻는 값이 있다. */
    if (newStatus === 'contracted' && all[idx].status !== 'contracted'
        && all[idx].actualTotal == null) {
      const alsoEmpty = [
        ['actualAirfareUnit', '실제 계약 항공료'],
        ['actualHotelUnit', '실제 계약 호텔단가'],
        ['actualMealUnit', '실제 계약 식비'],
      ].filter(([k]) => all[idx][k] == null).map(([, label]) => label);
      const NL = String.fromCharCode(10);
      const proceed = confirm(
        '‘실제 총 계약가’가 아직 비어 있습니다.' + NL + NL
        + '이 숫자로 목적지별 견적 정확도(실측 신뢰구간·요율 갱신 제안)를 계산합니다.' + NL
        + '계약할 때만 알 수 있는 값이라, 지금 넣지 않으면 나중에 채우기 어렵습니다.'
        + (alsoEmpty.length ? NL + NL + '함께 비어 있는 칸: ' + alsoEmpty.join(', ') : '')
        + NL + NL
        + '[취소] 를 누르면 상태는 그대로 두고 그 칸으로 데려다 드립니다 — 넣은 뒤 다시 계약완료로 바꿔 주세요.' + NL
        + '[확인] 을 누르면 비워 둔 채로 계약완료 저장합니다.');
      /* 🔴 자동 저장이라 **고른 값을 되돌린다** — 안 되돌리면 화면은 「계약완료」인데
         저장된 것은 「신규」인 채로 남는다(예전엔 「저장」을 누르기 전이라 괜찮았다). */
      if (!proceed) {
        document.getElementById('em-status-sel').value = all[idx].status || 'new';
        emFocusActualTotal(); return;
      }
    }
    all[idx].status = newStatus;
    all[idx].note   = document.getElementById('em-note-area').value;
    all[idx].assignee = document.getElementById('em-assignee-sel').value;
    emAutoSaveState('저장 중…', 'var(--muted)');
    /* 서버에 먼저 보내고 성공한 뒤에 캐시 반영 (PV).
       🔴 2026-09-27 「저장」 버튼을 없앴다 — 상태·담당자는 **고르는 즉시**, 메모는 **칸을 떠날 때**
       이 함수를 부른다(대표 지시: 「기능이 겹치는 버튼 정리」 — 직원용 탭에 「저장」이 둘이었다).
       그래서 **창을 닫지 않는다.** 상태 하나 바꿨다고 창이 닫히면 다음 일을 못 한다. */
    const r = await patchQuote(emCurrentId, {
      status: all[idx].status, note: all[idx].note, assignee: all[idx].assignee,
    }, { desc: '견적 상태·메모·담당자 저장' });
    if (!r.ok) {
      emAutoSaveState('⚠ 저장하지 못했습니다 — 다시 골라 주세요', 'var(--danger)');
      return;
    }
    localStorage.setItem(EM_KEY, JSON.stringify(all));
    renderEstMgr();
    /* 계약완료가 되면 실적 칸이 나와야 한다(계약완료 건에만 보인다) */
    emSyncActualVisibility(all[idx]);
    emAutoSaveState('✓ 저장됨', '#15803D');
  }

  function emAutoSaveState(text, color) {
    const el = document.getElementById('em-autosave-state');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color || 'var(--muted)';
  }

  /* ══════════════════════════════════════════════════════════════════
     UI — 견적서에 함께 나갈 일정을 만들고, 작성자에게 마지막으로 보여준다

     예전엔 직원이 발급한 견적서에 **일정이 한 줄도 실리지 않았다.** 아래 share
     객체에 itiA·itiB 키 자체가 없었기 때문이다(고객 계산기로 나간 견적서에는
     실린다). 같은 회사가 두 종류의 견적서를 내보내고 있었던 셈이다.

     ⚠ 오버라이드를 전역 ITINERARY_DB에 **덮어쓰지 않는다.** 일정 관리 화면이
       "기본값 대비 무엇이 수정됐는가"를 보여주려면 기본값 원본이 살아 있어야 한다
       (덮어쓰면 그 비교가 조용히 무너진다). 그래서 사본을 만들어 쓴다.
     ══════════════════════════════════════════════════════════════════ */
  async function emLoadItiTables() {
    /* 발급할 때마다 새로 읽는다 — 동료가 방금 고친 일정을 낡은 사본으로 내보내지
       않기 위해서다(일정 관리 탭이 같은 이유로 열 때마다 다시 읽는다). */
    const db  = Object.assign({}, typeof ITINERARY_DB !== 'undefined' ? ITINERARY_DB : {});
    const rec = Object.assign({}, typeof DEST_REC     !== 'undefined' ? DEST_REC     : {});
    const out = { itineraryDb: db, destRec: rec,
      priority: typeof PROGRAM_PRIORITY !== 'undefined' ? PROGRAM_PRIORITY : {},
      /* 어느 목적지가 담당자 수정본인가 — recQuoteItinerary가 출처를 가리는 데 쓴다. */
      loaded: false, edited: [], editedDestKeys: [] };
    try {
      const r = await fetch('/api/content?action=itineraries');
      if (!r.ok) throw new Error('http_' + r.status);
      const data = await r.json();
      const ov = (data && data.overrides) || {};
      Object.keys(ov).forEach((k) => {
        /* 모양이 깨진 값은 넣지 않는다 — script.js가 고객 화면에서 쓰는 기준과 같다. */
        if (Array.isArray(ov[k]) && ov[k].length) {
          /* UR: **통째로 대체하지 않는다.** 검토 전 코스만 든 오버라이드가 기본 코스를
             밀어내면, 검토 전은 고객에게 안 나가므로 그 목적지의 일정이 통째로 사라진다.
             ⚠ 병합 규칙은 rec_fallbacks.js 한 곳이다 — 고객 계산기(script.js)가 부르는
               것과 **같은 함수**여야 한다. 각자 병합하면 담당자가 발급한 견적서와
               고객이 직접 뽑은 견적서가 다른 일정을 싣는다(결함 생성기 ①). */
          db[k] = recApplyOverride(db[k], ov[k]);
          /* ⚠ 「담당자 수정본」은 사람이 손댄 것만이다. 일괄로 심은 검토 전 코스만 든
             행까지 여기 넣으면, 출처 라벨이 ✏️ 담당자 수정본이라고 거짓말을 한다. */
          if (recOverrideIsEdited(ov[k])) { out.edited.push(k); out.editedDestKeys.push(k); }
        }
      });
      const rv = (data && data.recOverrides) || {};
      Object.keys(rv).forEach((k) => {
        /* a·b 한쪽만 있는 값은 넣지 않는다 — 한쪽이 비면 그 자리가 조용히 일반 문구로 떨어진다. */
        if (rv[k] && rv[k].a && rv[k].b) rec[k] = rv[k];
      });
      out.loaded = true;
    } catch (err) {
      /* 조용히 기본 일정으로 나가게 두지 않는다(결함 생성기 ②). 아래 확인 문구가
         이 사실을 작성자에게 그대로 말하고, 작성자가 발급 여부를 정한다. */
      console.warn('[admin] 일정 오버라이드 조회 실패 — 기본 일정으로 나갑니다:', err);
    }
    return out;
  }

  /* 작성자가 마지막으로 확인하는 화면 (2026-08-18 대표 지시:
     「일정은 모두 견적서를 작성하는 작성자가 마지막 체크를 할 수 있게」).
     ⚠ 확인을 안 받고 내보내지 않는다 — 일정은 담당자가 쓴 글이고, 목적지 공통값이
       그대로 나가는 경우가 대부분이라 "내가 안 본 일정이 고객에게 갔다"가 생긴다. */
  function emConfirmItinerary(snap, tables, rec) {
    const NL = String.fromCharCode(10);

    /* 🔴 **문서가 붙어 있으면 그 문서의 일정이 나간다** (2026-09-17).
       고치기 전에는 여기서 목적지 공통 코스를 보여 주며 「이 일정이 고객에게 나갑니다」라고
       말했다 — 실제로 나가는 것은 담당자가 내부직원용 ④단계에 적은 일정이었다.
       확인하라고 띄운 창이 틀린 것을 보여 주고 있었던 셈이다(결함 생성기 ②의 반대 꼴 —
       조용한 폴백이 아니라 **큰 소리로 틀린 말**). */
    const doc = emDocOf(rec);
    if (doc) {
      const days = emDocItiDays(doc);
      const lines = days.slice(0, 12).map((x) => '   DAY ' + (x.day || '')
        + '  ' + String(x.title || x.am || '').slice(0, 40)).join(NL);
      if (!days.length) {
        return confirm('이 견적서에는 내부직원용에서 만든 문서가 붙어 있습니다.'
          + NL + '그런데 그 문서의 일정표가 비어 있습니다.'
          + NL + NL + '🔴 목적지 공통 일정은 나가지 않습니다 — 일정 없이 견적서만 나갑니다.'
          + NL + '일정을 넣으려면 자동 견적 산출(내부직원용) ④단계에 적고 다시 저장하세요.'
          + NL + NL + '이대로 발급할까요?');
      }
      /* 🔴 여행 일수와 일정표 일수가 다르면 **여기서 말한다** (2026-09-27) — 5일 여행에 2일짜리
         일정표가 「(2일)」이라고만 적혀 그대로 발급되던 자리다. 막지는 않는다(반나절 귀국 등 일부러 줄인 경우가 있다). */
      const tripDays = Number((doc.trip && doc.trip.days) || rec.days) || 0;
      const dayGap = tripDays && tripDays !== days.length
        ? NL + '⚠ 여행은 ' + tripDays + '일인데 일정표는 ' + days.length + '일입니다 — 빠진 날이 없는지 보세요.' : '';
      return confirm('이 견적서와 함께 아래 일정이 고객에게 나갑니다. 확인해 주세요.'
        + dayGap
        + NL + NL + '출처 · 🧾 내부직원용에서 작성한 견적서 문서 (' + days.length + '일)'
        + NL + lines + (days.length > 12 ? NL + '   …' : '')
        + NL + NL + '고칠 것이 있으면 [취소]를 누르고, 고객용 탭 일정표의 「수정하기」로 바로 고치세요.'
        + NL + NL + '이대로 발급할까요?');
    }

    if (!snap) {
      return confirm('이 견적서에는 일정이 실리지 않습니다.' + NL + NL
        + '"' + (rec.destLabel || rec.destKey || '') + '"에 등록된 코스가 없습니다.'
        + NL + '관리자 → 일정·방식 비교에서 코스를 만들면 다음 발급부터 함께 나갑니다.'
        + NL + NL + '금액·조건만으로 발급할까요?');
    }

    const dayLines = (plan) => (plan.d || [])
      .map((x) => '   DAY ' + (x.day || '') + '  ' + String(x.title || '').slice(0, 40)
        + (x._auto ? '  (자동 생성)' : ''))
      .join(NL);

    /* 출처를 밝힌다 — 네 층은 작성자가 해야 할 일이 서로 다르다.
       판단은 recQuoteItinerary 한 곳이 한다(여기서 다시 가리면 두 벌이 된다). */
    const dk = rec.destKey || '';

    return confirm(
      '이 견적서와 함께 아래 일정이 고객에게 나갑니다. 확인해 주세요.' + NL + NL
      + '출처 · ' + snap.originLabel + NL
      + (tables.loaded ? '' : '⚠ 수정본을 불러오지 못했습니다 — 기본 일정이 나갑니다.' + NL)
      + (snap.daysChanged
        ? '⚠ 일정을 저장한 뒤 견적 일수가 바뀌었습니다 — 늘어난 날은 자동으로 채워집니다.' + NL : '')
      + NL
      /* UO: 코스 하나만 나가는 견적서면 그렇다고 말한다. 없는 코스 B 자리를
         비워 두면 작성자는 "빠뜨렸나"로 읽는다. */
      + (snap.single
        ? '［코스］ ' + (snap.a.t || '(제목 없음)') + '  (이 견적서는 코스 하나만 나갑니다)'
          + NL + dayLines(snap.a) + NL + NL
        : '［코스 A］ ' + (snap.a.t || '(제목 없음)') + NL + dayLines(snap.a) + NL + NL
          + '［코스 B］ ' + (snap.b.t || '(제목 없음)') + NL + dayLines(snap.b) + NL + NL)
      /* ⚠ 2026-09-27 메뉴 이름이 바뀌었다(일정 관리 → 일정·방식 비교). 이 견적서만 고치는 길도 함께 말한다 */
      + '고칠 것이 있으면 [취소]를 누르고 — 이 견적서만: 「자세히 → 일정 확인·수정」' + NL
      + '  목적지 공통으로: 관리자 → 일정·방식 비교에서 "' + (rec.destLabel || dk) + '"' + josa(rec.destLabel || dk, '을', '를') + ' 수정' + NL + NL
      + '이대로 발급할까요?');
  }

  /* ══════════════════════════════════════════════════════════════════
     UI — 이 견적서의 일정 편집기

     대표 지시(2026-08-18): 「지금 일정 관리는 공통으로 하나씩 적용해 두는 부분인데,
     여행지가 다양하고 목적이 달라 정답이 없다. 작성하는 사람이 손쉽게 접근해
     견적서와 함께 제공할 수 있는 구조로.」

     그래서 목적지 공통 일정은 **초안 창고**로 내리고, 여기서 고친 것이 이 견적서에만
     나간다. 출발점은 지금 그 견적서에 실제로 나갈 일정이다 — 백지에서 쓰는 것과
     고치는 것은 부담이 다르다.

     ⚠ 일자 수는 **견적 일수로 고정**한다. 늘리고 줄일 수 있게 하면 금액(일수 기반)과
       일정표가 어긋나고, 그 어긋남은 고객이 먼저 발견한다.
     ⚠ 편집 상태는 이 화면만 갖는다. 일정 관리 화면의 itiState를 건드리면 두 화면이
       서로의 편집 중인 값을 덮어쓴다.
     ══════════════════════════════════════════════════════════════════ */
  let eqState = null;
  let eqOnSaved = null;   /* 저장 뒤 알려 줄 곳 (산출 화면) — eqClose에서 반드시 지운다 */

  /* 견적 상세에 「지금 이 견적서에 무엇이 실려 나가는가」 한 줄 (UM).
     편집기를 열지 않아도 전용 일정이 있는지 없는지는 보여야 한다 — 안 보이면
     담당자는 열어 봐야만 알 수 있고, 열어 보지 않으면 기본 일정이 나가는 줄 모른다
     (결함 생성기 ②). */
  /* 이 견적에 **내부직원용에서 만든 문서**가 붙어 있는가.
     🔴 붙어 있으면 발급 때 **그 문서가 그대로** 고객 링크에 실리고, 아래 「목적지 공통
       일정」·「이 견적서 전용 일정」은 **한 줄도 안 나간다**(`estimate-view.html`이
       `d.doc`이 있으면 v2 경로로만 그린다). 그걸 모르고 공통 코스를 보여 주면
       화면이 거짓말을 한다 — 2026-09-17에 실제로 그러고 있었다. */
  function emDocOf(rec) {
    const doc = rec && rec.doc;
    return (doc && typeof doc === 'object' && !Array.isArray(doc)) ? doc : null;
  }
  function emDocItiDays(doc) {
    if (!doc || !Array.isArray(doc.itinerary)) return [];
    return doc.itinerary.filter((x) => x && ['title', 'am', 'pm', 'eve', 'stay', 'note']
      .some((k) => String(x[k] || '').trim()));
  }

  /* ══ 🧾 이 견적서 문서 미리보기 (2026-09-17 대표 지시) ═══════════════════
     「자동 견적 산출에서 뽑은 견적서 양식이 그대로 유지되면 좋겠다」 — 유지는 이미
     되고 있었다. 없던 것은 **담당자가 발급 전에 확인할 자리**다.
     🔴 **여기서 문서를 다시 그리지 않는다.** 그리는 곳은 `quote_doc.js` 하나다. */
  function emRenderDocPreview(rec) {
    const prev = document.getElementById('em-doc-prev');
    const state = document.getElementById('em-doc-state');
    if (!prev || !state) return;
    /* ⚠ 2026-09-23: 접이식 상자가 없어졌다(고객용 탭이 곧 이 자리다).
       앞 견적의 내용을 물려받지 않게 비우는 일은 그대로 한다. */
    prev.innerHTML = '';

    const doc = emDocOf(rec);
    const nodocBtn = document.getElementById('em-nodoc-preview');
    if (nodocBtn) nodocBtn.classList.toggle('hidden', !!doc);
    if (!doc) {
      state.textContent = '문서 없음 — 옛 방식(항목·금액 표)으로 발급됩니다';
      state.style.color = 'var(--muted)';
      return;
    }
    if (typeof QuoteDoc === 'undefined') {
      /* 조용히 빈 칸으로 두지 않는다 — 「문서가 없다」와 「못 그렸다」는 다른 말이다 */
      state.textContent = '⚠ 문서는 있는데 그리지 못했습니다 (quote_doc.js 미탑재)';
      state.style.color = 'var(--warn)';
      return;
    }
    let safe, bundle;
    try {
      /* 🔴 고객이 받는 그대로를 본다 — 원가·마진·내부 메모를 지우고 그린다
         (`estimate-view.html`과 같은 순서: normalize → stripInternal).
         🔴 **「고객에게 보낼 문서」 체크도 따른다** (2026-09-21). 안 따르면 체크를 꺼도
           여기엔 그대로 보여서, 담당자가 **나가는 줄 알고 발급**한다 — 그 반대도 마찬가지다.
           읽는 곳은 `emShareParts` 하나다(발급·👁 미리보기와 같은 값). */
      const parts = (typeof emShareParts === 'function') ? emShareParts() : null;
      /* 🔴 **깎는 순서도 묶음이 한다** (2026-09-23 대표 지시 3) — 화면마다 제 순서로
         깎으면 「고객이 받는 그대로」라는 말이 화면마다 다른 뜻이 된다. */
      /* 견적번호는 문서에 저장돼 있지 않다(서버가 발급 때 넣는다) — 미리보기에도 이 건의 번호를 띄운다 (2026-09-28) */
      const docNo = (rec.quoteNo && doc.meta && !doc.meta.quoteNo)
        ? Object.assign({}, doc, { meta: Object.assign({}, doc.meta, { quoteNo: rec.quoteNo }) }) : doc;
      bundle = QuoteDoc.renderBundle(docNo, { company: window.COMPANY_INFO || {}, parts });
      safe = bundle.doc;
      /* 🔴 **세부견적서가 빠져 있었다** — 만들어 놓고 이 자리에 안 그리고 있었다.
         순서는 고객 화면(롤링)과 같아야 한다: 견적서 → 세부견적서 → 일정표. */
      /* 🔴 **세 단락을 갈라서 보여준다** (2026-09-23 대표 지시 2-2). 붙여 놓으면
         고객이 한 장짜리 긴 문서로 읽는다 — 9/22에 고객 화면에서 고친 것과 같은 이유다.
       🔴 **「수정하기」는 여기서만 붙인다.** `quote_doc.js`(문서를 그리는 곳)에는 한 글자도
         넣지 않는다. 그래서 인쇄·PDF·고객 공유 링크에는 **나갈 수가 없다** —
         「빼는 것을 잊었다」가 성립하지 않는 구조로 둔다(대표 지시 2-2).
       ⚠ 세부견적서는 줄이 없으면 아예 안 나간다 — 그때는 단락 자체를 만들지 않는다
         (제목만 덜렁 남으면 고객에게 빈 문서를 보낸 것처럼 보인다). */
      /* 🔴 **무엇을 몇 개 그릴지 여기서 정하지 않는다.** 묶음이 준 것을 그대로 쓴다 —
         고객 링크와 **같은 조각·같은 순서·같은 띠**가 나온다(대표 지시 3).
       ⚠ 「수정하기」만 여기서 덧붙인다. 그건 이 화면에만 있는 것이고, 그래서
         인쇄·PDF·공유 링크로는 샐 수가 없다. */
      const NOTE = { quote: '고객이 결재에 올리는 문서입니다',
        breakdown: '항목을 다 더하면 총액과 맞습니다',
        iti: '여기 적힌 글이 그대로 고객에게 갑니다' };
      prev.innerHTML = bundle.sections.map((s) =>
        '<section class="em-cust-sect" data-cust="' + s.key + '">'
        + s.tag
        + '<div class="em-cust-tag"><b>' + s.label + '</b><span>' + (NOTE[s.key] || '') + '</span></div>'
        + s.html
        + '<div class="em-cust-edit no-print">'
        + '<button type="button" onclick="emGotoEdit(\'' + s.key + '\')">'
        + s.label + ' 수정하기 →</button></div>'
        + '</section>').join('');
      /* 🔴 **A4 한 장에 맞춘다** (2026-09-22). 이 자리는 담당자가 발급 전에 보는
         유일한 화면이라, 여기서 한 장으로 보여야 고객이 받는 것과 같다.
         ⚠ 모달이 아직 안 열렸으면 높이가 0이라 못 잰다 — 여는 쪽에서 한 번 더 부른다. */
      if (QuoteDoc.fitPages) QuoteDoc.fitPages(prev);
    } catch (err) {
      state.textContent = '⚠ 문서를 그리다 오류가 났습니다 — ' + (err && err.message || '');
      state.style.color = 'var(--warn)';
      return;
    }
    const days = emDocItiDays(safe).length;
    const items = (safe.details || []).length;
    const bdRows = (safe.breakdown && safe.breakdown.rows || []).length;
    /* 🔴 **나갈 것을 그대로 말한다** — 체크를 껐으면 「안 나감」이라고 적는다.
       숫자만 적으면 담당자는 「0일」을 「일정이 없다」로 읽는다(일부러 뺀 것과 다른 말이다). */
    const parts2 = (typeof emShareParts === 'function') ? emShareParts() : null;
    /* 🔴 2026-09-28 대표 요청 — 평소의 「상세 n항목 · 세부견적서 n줄 · 일정표 n일」 줄은 뺐다(문서가 바로 아래 보인다).
         **비어 있는 채 나갈 문서만** 말한다 — 그건 발급 전에 잡아야 하는 사고다(9/27 「비어 있습니다」가 초록으로 떠 있던 자리).
         체크를 꺼서 **일부러 뺀 것**은 말하지 않는다 — 체크 칸이 이미 보여 준다. `items`는 안 쓴다(항목 수는 문서에 보인다). */
    void items;
    const empty = [];
    if ((!parts2 || parts2.breakdown !== false) && !bdRows) empty.push('세부견적서');
    if ((!parts2 || parts2.iti !== false) && !days) empty.push('일정표');
    state.innerHTML = empty.length ? '⚠ ' + empty.join(' · ') + ' <strong>비어 있습니다</strong> — 이대로 발급하면 빈 장이 나갑니다' : '';
    state.style.color = 'var(--warn)';
  }


  /* ══ 💰 수익 요약 (2026-09-23 대표 지시 2-5) ═══════════════════════════════
     🔴 **판매가 배분을 여기서 새로 계산하지 않는다.** 고객이 받는 세부견적서와 같은 자
       (`QuoteDoc.allocateBreakdown`)를 부른다 — 두 벌이면 담당자가 보는 마진과 고객이
       받는 표가 어긋나고, 그 어긋남은 아무도 못 찾는다(결함 생성기 ①).
     🔴 **못 맞춘 줄은 「—」로 둔다.** 이름이 안 맞으면 판매가를 짐작해 채우지 않는다.
       틀린 마진율은 없는 것보다 나쁘다(결함 생성기 ②).
     ⚠ 이익률 경고선 10%는 **대표 임시값**이다(2026-09-07 기록). 실측 마진은 ×1.141이라
       이 선이 실제 방침이 되려면 대표가 정해야 한다 — 그래서 값을 한 곳에만 둔다. */
  const EM_MARGIN_WARN = 0.10;

  /* 🔴 **판매가·원가·이익을 세는 곳은 여기 하나다** (2026-09-27).
     목록·한 줄 요약·금액 4칸·수익 요약이 각자 `visibleTotal !== undefined ? … : total`을
     적고 있었는데, 목록과 금액 4칸은 **`null`을 못 걸렀다** — 원가 기록이 `null`인 건이
     「원가 ₩0 · 수익금 = 청구액 전액」으로 찍혔다(실측: 5,670만 전부가 수익으로 보였다).
     ⚠ 원가를 모르면 `known:false`다. 화면은 이익을 **「—」로 말한다** — 0%도 100%도
       지어낸 숫자다(결함 생성기 ②). */
  function emMoney(e) {
    const sell = Number(e && e.total) || 0;
    const v = e ? e.visibleTotal : null;
    const known = v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
    const cost = known ? Number(v) : null;
    const profit = known ? sell - cost : null;
    const rate = known && sell > 0 ? profit / sell : null;
    return { sell, cost, known, profit, rate, low: rate !== null && rate < EM_MARGIN_WARN };
  }

  function emRenderProfit(e) {
    const box = document.getElementById('em-profit-summary');
    if (!box) return;
    const won = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
    const pct = (n) => (Number(n) * 100).toFixed(1) + '%';
    const M = emMoney(e);
    const sell = M.sell;
    /* 원가를 모르면 원가 = 판매가로 놓고 항목표만 그린다(예전 동작). 카드는 아래에서 「—」 */
    const cost = M.known ? M.cost : sell;
    const pax = Math.max(1, Number(e.participants) || 1);
    const profit = sell - cost;
    const rate = M.rate === null ? 0 : M.rate;
    const low = M.low;

    /* 항목별 — 원가는 견적 기록의 항목 금액, 판매가는 고객 세부견적서와 같은 배분 */
    const visible = (e.items || []).filter((it) => !it.isHidden)
      .map((it) => ({ name: it.adminLabel || it.name || '', amount: Number(it.amount) || 0 }));
    let sold = null;
    try {
      if (typeof QuoteDoc !== 'undefined' && QuoteDoc.allocateBreakdown && visible.length && sell > 0) {
        sold = QuoteDoc.allocateBreakdown(visible, sell);
      }
    } catch (err) { sold = null; }
    const soldOf = (i) => (sold && sold[i] && typeof sold[i].amount === 'number') ? sold[i].amount : null;

    const rows = visible.map((r, i) => {
      const sv = soldOf(i);
      const mg = sv === null ? null : sv - r.amount;
      const mr = (sv === null || sv <= 0) ? null : mg / sv;
      const warn = mr !== null && mr < EM_MARGIN_WARN;
      return '<tr>'
        + '<td style="padding:.32rem .5rem">' + esc(r.name) + '</td>'
        + '<td style="padding:.32rem .5rem;text-align:right;color:var(--muted)">' + won(r.amount) + '</td>'
        + '<td style="padding:.32rem .5rem;text-align:right">' + (sv === null ? '—' : won(sv)) + '</td>'
        + '<td style="padding:.32rem .5rem;text-align:right">' + (mg === null ? '—' : won(mg)) + '</td>'
        + '<td style="padding:.32rem .5rem;text-align:right;font-weight:700;color:'
        + (mr === null ? 'var(--muted)' : (warn ? 'var(--danger)' : 'var(--success)')) + '">'
        + (mr === null ? '—' : pct(mr)) + '</td>'
        + '</tr>';
    }).join('');

    /* 🔴 환율은 **이 건에 실제로 적용된 조정 계수**다. 항목별 환율은 기록에 없으므로
       있는 척하지 않는다 — 없는 값을 그리면 담당자가 그것을 근거로 판단한다. */
    const fx = Number(e.fxAdjust);
    const fxLine = Number.isFinite(fx) && Math.abs(fx - 1) > 1e-6
      ? '적용 환율 계수 <b>×' + fx.toFixed(3) + '</b>'
        + (e.rateDate ? ' · 기준 ' + esc(String(e.rateDate)) : '')
        + (e.rateVer ? ' · Ver.' + esc(String(e.rateVer)) : '')
      : (e.rateDate
        ? '환율 조정 없음(계수 1.000) · 요율 기준 ' + esc(String(e.rateDate))
        : '환율·요율 기준이 이 기록에 없습니다');

    /* ⚠ `data-k`를 단다 — 검사가 「몇 번째 칸」으로 읽으면 칸 순서를 바꾸는 날 조용히
       엉뚱한 값을 재게 된다(실제로 그렇게 짰다가 숫자가 이어 붙어 나왔다). */
    const card = (k, label, value, color) =>
      '<div data-k="' + k + '" style="padding:.55rem .7rem;background:#fff;border:1px solid var(--border)">'
      + '<div style="font-size:.72rem;color:var(--muted)">' + label + '</div>'
      + '<div data-v="' + k + '" style="font-size:1.05rem;font-weight:800;color:' + color + '">' + value + '</div></div>';

    box.innerHTML =
      '<div class="detail-label" style="margin-bottom:.6rem">💰 수익 요약'
      + '<span style="font-size:.72rem;font-weight:400;color:var(--warn);margin-left:.5rem;'
      + 'background:#fffbeb;border:1px solid #fde68a;padding:.1rem .4rem">🔒 고객에게 안 나갑니다</span>'
      + '<span style="font-size:.72rem;font-weight:400;color:var(--muted);margin-left:.4rem">읽기 전용</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:.5rem;margin-bottom:.7rem">'
      + card('sell', '총 판매가', won(sell), '#1d4ed8')
      /* ⚠ 2026-09-27 「1인당 판매가」를 여기로 — 바로 위 금액 4칸(총액·원가·수익·1인당)이 이 요약과 **세 숫자가 겹쳐**
           그 칸을 감췄다(`#em-sec-money`). 거기에만 있던 1인당 금액을 잃지 않게 옮겼다. */
      + card('unit', '1인당 판매가', won(e.perPerson || 0), '#1d4ed8')
      + card('cost', '총 원가', M.known ? won(cost) : '—', 'var(--muted)')
      + card('profit', '예상 이익', M.known ? won(profit) : '—', profit >= 0 ? 'var(--success)' : 'var(--danger)')
      + card('rate', '이익률', M.rate !== null ? pct(rate) : '—', low ? 'var(--danger)' : 'var(--success)')
      + card('per', '1인당 이익', M.known ? won(profit / pax) : '—', profit >= 0 ? 'var(--success)' : 'var(--danger)')
      + '</div>'
      + (!M.known
        ? '<div style="font-size:.8rem;color:var(--warn);margin-bottom:.6rem">⚠ 이 견적 기록에 원가가 없어 이익을 셀 수 없습니다.</div>'
        : '')
      + (low
        ? '<div style="padding:.5rem .7rem;background:#FFF4F5;border-left:3px solid var(--danger);'
          + 'color:var(--danger);font-size:.8rem;font-weight:700;margin-bottom:.6rem">'
          + '🔴 이익률이 기준(' + pct(EM_MARGIN_WARN) + ') 아래입니다 — ' + pct(rate)
          + '<span style="font-weight:400;color:var(--muted);margin-left:.4rem">기준값은 임시입니다(대표 확인 전)</span>'
          + '</div>'
        : '')
      + (rows
        ? '<table style="width:100%;border-collapse:collapse;font-size:.8rem;background:#fff">'
          + '<thead><tr style="background:var(--bg)">'
          + '<th style="padding:.32rem .5rem;text-align:left">항목</th>'
          + '<th style="padding:.32rem .5rem;text-align:right">원가</th>'
          + '<th style="padding:.32rem .5rem;text-align:right">판매가</th>'
          + '<th style="padding:.32rem .5rem;text-align:right">마진</th>'
          + '<th style="padding:.32rem .5rem;text-align:right">마진율</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div style="font-size:.8rem;color:var(--muted)">항목 내역이 없어 항목별 마진을 낼 수 없습니다.</div>')
      + '<div style="font-size:.74rem;color:var(--muted);margin-top:.5rem">' + fxLine + '</div>';
    box.classList.remove('hidden');
  }


  /* ══ ✏️ 끼워 넣은 편집기와 주고받기 (2026-09-23 대표 지시 2-4) ═══════════════
     🔴 **저장하지 않은 것이 있으면 못 나가게 한다.** 탭을 옮기거나 창을 닫을 때
       확인한다 — 안쪽(편집기)이 아니라 **여기서** 묻는다. 양쪽에서 물으면 담당자가
       같은 질문을 두 번 받는다. */
  let emEditDirty = false;
  let emEditLoadedFor = null;
  /* 「수정하기」가 정한 영역 — 탭을 여는 쪽에 한 번만 전달하고 비운다 */
  let emPendingFocus = null;

  function emEditFrame() { return document.getElementById('em-edit-frame'); }

  /* 상세를 닫는 자리는 **하나**다 — 머리의 ✕와 아래 「닫기」가 같은 것을 부른다.
     두 곳에 각각 적으면 한쪽만 지킴이를 지나간다(결함 생성기 ①). */
  /* ══ F5를 눌러도 **보던 견적 상세**로 돌아온다 (2026-09-28 대표 지시) ═══════════════════
     탭은 9/15부터 주소(`#tab=estmgr`)로 기억했는데, 그 위에 뜬 **상세 창·고객용/직원용·편집 단계**는
     기억하지 않아 새로고침하면 목록으로 떨어졌다. 같은 주소 뒤에 덧붙인다:
       `#tab=estmgr&q=<견적 id>&v=staff&s=3&f=<좁힌 영역>`
     ⚠ 저장하지 않은 수정은 **되살리지 않는다**(저장본을 다시 연다). 그건 편집 화면의 「나가기 전 확인」이 막는다.
     ⚠ `replaceState` — 히스토리를 쌓지 않는다(뒤로가기가 창 여닫기를 되짚지 않게). */
  const EM_HASH_KEYS = ['q', 'v', 's', 'f'];
  function emHashRead(from) {
    const h = String(from !== undefined ? from : (location.hash || ''));
    const m = /^#tab=([a-z0-9-]+)((?:&[a-z]=[^&]*)*)$/i.exec(h);
    if (!m) return null;
    const out = { tab: m[1] };
    (m[2] || '').split('&').filter(Boolean).forEach((kv) => {
      const i = kv.indexOf('=');
      try { out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 망가진 값은 버린다 */ }
    });
    return out;
  }
  function emHashSet(patch) {
    const cur = emHashRead();
    if (!cur || cur.tab !== 'estmgr') return;   /* 다른 탭(대시보드의 바로가기 등)에서 연 상세는 주소를 안 건드린다 */
    const next = Object.assign({}, cur, patch);
    let h = '#tab=' + next.tab;
    EM_HASH_KEYS.forEach((k) => { if (next[k]) h += '&' + k + '=' + encodeURIComponent(next[k]); });
    if (h === location.hash) return;
    try { history.replaceState(null, '', h); } catch (e) { /* 주소를 못 바꿔도 화면은 멀쩡해야 한다 */ }
  }
  /* 부팅 때 한 번 — `restoreTabFromHash()`가 견적 관리 탭을 연 **뒤에** 부른다.
     목록이 아직 안 왔으면 조금 기다린다(최대 10초). 끝내 없으면(지워진 건) 목록에 머문다. */
  function emRestoreFromHash(bootHash) {
    const h = emHashRead(bootHash);
    if (!h || h.tab !== 'estmgr' || !h.q) return;
    const t0 = Date.now();
    (function tryOpen() {
      const has = getEstsFull().some((x) => String(x.id) === String(h.q));
      if (!has) {
        if (Date.now() - t0 < 10000) return setTimeout(tryOpen, 300);
        emHashSet({ q: null, v: null, s: null, f: null });
        return;
      }
      emRestoringStep = h.s ? Number(h.s) : null;
      openEstDetail(h.q);
      if (h.v === 'staff') { emPendingFocus = h.f || null; emSetTab('staff'); }
    })();
  }
  let emRestoringStep = null;

  function emCloseDetail() {
    if (!emEditGuard('창을 닫기')) return;
    emEditReset();
    document.getElementById('emModal').classList.add('hidden');
  }

  /* 직원용 탭을 처음 열 때 불러온다 — 상세를 열 때마다 엔진 화면을 싣지 않는다 */
  function emEditEnsure(focus) {
    const f = emEditFrame();
    if (!f || !emCurrentId) return;
    if (emEditLoadedFor === emCurrentId) {
      /* 이미 떠 있으면 **다시 불러오지 않는다** — 고치던 내용이 날아간다.
         어느 영역을 볼지만 알려 준다(`null`이면 좁히기를 푼다). */
      if (f.contentWindow) {
        try { f.contentWindow.postMessage({ __aqpGoto: focus || null }, '*'); }
        catch (e) { /* 아직 안 떴으면 아래 불러오기가 처리한다 */ }
      }
      return;
    }
    emEditLoadedFor = emCurrentId;
    emEditDirty = false;
    const st = document.getElementById('em-edit-state');
    if (st) { st.textContent = '불러오는 중…'; st.style.color = 'var(--muted)'; }
    /* 🔴 처음 부를 때는 **주소에 실어 보낸다.** 띄우자마자 보내는 메시지는 아직
       듣는 사람이 없어 그대로 사라진다(실제로 그렇게 조용히 안 먹었다). */
    f.src = 'admin-quote-pro.html?quote=' + encodeURIComponent(emCurrentId)
      + (focus ? '&focus=' + encodeURIComponent(focus) : '')
      + (!focus && emRestoringStep ? '&step=' + encodeURIComponent(emRestoringStep) : '');
    emRestoringStep = null;
    emHashSet({ f: focus || null });
  }

  /* 견적을 바꿔 열면 **앞 건의 편집기를 버린다** — 안 버리면 다음 건 화면에 앞 건이
     남고, 그 상태로 저장하면 남의 견적을 덮는다(일정 편집기에서 이미 겪은 자리다). */
  function emEditReset() {
    const f = emEditFrame();
    emEditLoadedFor = null;
    emEditDirty = false;
    if (f) f.removeAttribute('src');
    const st = document.getElementById('em-edit-state');
    if (st) { st.textContent = ''; st.style.color = 'var(--muted)'; }
  }

  window.addEventListener('message', (ev) => {
    const d = ev && ev.data;
    if (!d || !d.__aqp) return;
    /* 🔴 2026-09-27 새 견적이 저장됐다(자동 견적 산출·직접 견적 작성 어느 틀이든) — **목록을 바로 다시 읽는다.**
       예전엔 「견적 관리 업로드 완료」라고 해 놓고 견적 관리로 가면 그 건이 **안 보였다**(다음 동기화 전까지).
       담당자는 실패한 줄 알고 다시 만든다. 어느 틀에서 왔든 받는다(목록 갱신은 해가 없다). */
    if (d.__aqp === 'created') {
      Promise.resolve(typeof loadRemoteData === 'function' ? loadRemoteData() : null)
        .catch(() => {})
        .then(() => { if (typeof currentTab !== 'undefined' && currentTab === 'estmgr') renderEstMgr(); });
      return;
    }
    const st = document.getElementById('em-edit-state');
    /* 🔴 **보낸 창이 이 틀인지 본다.** 「자동 견적 산출」 탭도 같은 편집 화면을 틀에 넣어 쓰므로,
       안 보면 그쪽의 키 알림에 견적 상세 틀이 늘었다 줄었다 한다. */
    const fromMine = !!emEditFrame() && ev.source === emEditFrame().contentWindow;
    if ((d.__aqp === 'height' || d.__aqp === 'top' || d.__aqp === 'step') && !fromMine) return;
    if (d.__aqp === 'step') {
      if (fromMine && Number(d.n) >= 1 && Number(d.n) <= 5) emHashSet({ s: String(Number(d.n)) });
      return;
    }
    if (d.__aqp === 'height') {
      /* S-1 ⑤ (2026-09-27): 틀을 편집 화면 키에 맞춘다 — 스크롤은 창 하나만 */
      const f = emEditFrame();
      const h = Number(d.h);
      if (f && Number.isFinite(h) && h > 0) f.style.height = Math.max(400, Math.min(h, 20000)) + 'px';
      return;
    }
    if (d.__aqp === 'top') {
      /* 단계를 넘겼다 — 편집 화면 머리가 창 위로 지나가 있으면 **그때만** 데려온다.
         ⚠ 늘 옮기면 직원용 탭을 처음 열 때도 한 줄 요약을 건너뛰어 내려가 버린다. */
      const f = emEditFrame();
      const sec = document.getElementById('em-sec-edit');
      const box = f && f.closest('.modal-box');
      if (f && sec && box && f.getBoundingClientRect().top < box.getBoundingClientRect().top) {
        sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      return;
    }
    if (d.__aqp === 'loaded') {
      if (st) { st.textContent = ''; }   /* 2026-09-28 대표 요청 — 번호도 뺐다(번호는 견적서 제목줄과 창 제목에 있다) */
    } else if (d.__aqp === 'dirty') {
      emEditDirty = !!d.dirty;
      if (st && emEditDirty) { st.textContent = '저장하지 않은 변경사항이 있습니다'; st.style.color = 'var(--warn)'; }
    } else if (d.__aqp === 'saved') {
      emEditDirty = false;
      if (st) {
        st.textContent = '저장했습니다' + (d.issuedBefore ? ' · 다음 발급부터 _V2, _V3 …이 붙습니다' : '');
        st.style.color = '#15803D';
      }
      /* 🔴 **고객용 탭이 곧바로 새 내용을 보여줘야 한다** (대표 지시 2-4:
         「저장하면 고객용 탭에 즉시 반영된 뒤 고객용 탭으로 돌아가 결과를 확인」).
         ⚠ 서버에서 다시 읽는다 — 화면이 들고 있던 값으로 그리면 「저장됐다고 믿었는데
           실제로는 안 들어간」 경우를 못 본다. */
      emEditAfterSave();
    }
  });

  async function emEditAfterSave() {
    try { await loadRemoteData(); } catch (e) { /* 아래에서 옛 값으로라도 그린다 */ }
    renderEstMgr();
    const rec = getEstsFull().find((x) => x.id === emCurrentId);
    if (rec) {
      emRenderDocPreview(rec);
      emRenderProfit(rec);
      emRenderItiState();
    }
    emSetTab('cust');
  }

  /* 🔴 저장 안 한 채로 나가려 할 때 — 한 곳에서 묻는다 */
  function emEditGuard(what) {
    if (!emEditDirty) return true;
    const okGo = confirm('저장하지 않은 변경사항이 있습니다.\n\n' + what + '하면 고친 내용이 사라집니다. 계속할까요?');
    if (okGo) emEditDirty = false;
    return okGo;
  }


  /* ══ 🔴 기본은 넷만 보이게 (2026-09-24 대표 지시: 「더할 나위 없이 간결하게」) ══
     담당자가 이 창을 여는 이유는 거의 늘 넷이다 — **뭔 건인지 보고 · 고치고 · 보내고 ·
     상태를 적는다.** 나머지는 가끔 쓰는 것이라 「자세히」 한 곳에 접는다.

     🔴 **HTML을 들어내지 않고 옮겨 담는다.** 구역이 여덟이라 마크업을 잘라 옮기면
       그 과정에서 하나가 조용히 빠진다(이 저장소가 거듭 겪은 유형). 자리는 그대로 두고
       **열 때 옮긴다** — 되돌리기도 한 줄이다.
     ⚠ 한 번만 옮긴다. 열 때마다 옮기면 이미 옮긴 것을 또 찾다가 순서가 뒤집힌다.
     ⚠ **지운 것이 아니다.** 「자세히」를 누르면 예전 그대로 전부 있다. */
  /* ⚠ 2026-09-27 `em-sec-info`(기관 정보·연수 조건)를 맨 앞에 더했다(S-1 ④) — 한 줄 요약과
     고치기 ①여행정보가 같은 말을 한다. 고객 담당자 이름은 한 줄 요약으로 올렸다. */
  const EM_MORE_IDS = ['em-sec-info', 'em-sec-items', 'em-sec-money', 'em-confidence', 'em-profit-summary',
    'em-coef-contrib', 'em-sec-actual', 'em-sec-iti', 'em-sec-log'];
  let emMoved = false;
  function emCollapseExtras() {
    if (emMoved) return;
    const box = document.getElementById('em-more-box');
    if (!box) return;
    EM_MORE_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) box.appendChild(el);
    });
    emMoved = true;
  }

  /* 한 줄 요약 — 창을 열자마자 **무슨 건인지**가 보여야 한다.
     ⚠ 금액은 목록과 **같은 값**을 쓴다(청구 금액). 여기서 다시 계산하지 않는다. */
  function emRenderHeadSum(e) {
    const el = document.getElementById('em-head-sum');
    if (!el) return;
    const won = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
    const M = emMoney(e);
    const sell = M.sell, rate = M.rate, low = M.low;
    /* 🎨 2026-09-28 대표 요청 「깔끔하게 · 예쁘게」 — 한 줄에 글자 크기·색이 뒤섞여 있던 것을
       왼쪽 [기관명 + 조건 칩] / 오른쪽 [견적 금액 + 이익률 배지] 두 덩이로. 값·계산은 그대로(emMoney). */
    const meta = [esc(e.destLabel || e.destKey || '-'), (Number(e.participants) || 0) + '명', (Number(e.days) || 0) + '일']
      .concat(e.contact ? ['담당 ' + esc(e.contact)] : []);
    const rateHtml = rate !== null
      ? '<span class="em-sum-rate ' + (low ? 'low' : 'ok') + '">이익률 ' + (rate * 100).toFixed(1) + '%</span>'
      : (sell > 0 ? '<span class="em-sum-rate none">이익률 —</span>' : '');
    el.innerHTML = '<div class="em-sum">'
      + '<div class="em-sum-l"><div class="em-sum-org">' + esc(e.orgName || '(기관명 없음)') + '</div>'
      + '<div class="em-sum-meta">' + meta.map((m) => '<span>' + m + '</span>').join('') + '</div></div>'
      + '<div class="em-sum-r"><div class="em-sum-lbl">견적 금액</div>'
      + '<div class="em-sum-money">' + won(sell) + '</div>' + rateHtml + '</div>'
      + '</div>';
  }

  /* 🔴 **실적 입력은 계약완료 건에만 쓴다.** 신규 건에서도 늘 보여서, 처음 보는 사람이
     화면의 3분의 1을 「내가 지금 적어야 하나」로 읽었다(저장 버튼도 넷이나 붙어 있다). */
  function emSyncActualVisibility(e) {
    const wrap = document.getElementById('em-sec-actual');
    if (!wrap) return;
    const done = (e && e.status) === 'contracted';
    wrap.classList.toggle('hidden', !done);
    const sum = document.getElementById('em-more-sum');
    if (sum) {
      sum.textContent = done
        ? '상세 정보 더 보기 — 기관·원가·수익·요율·실적·일정·진행 기록'
        : '상세 정보 더 보기 — 기관·원가·수익·요율·일정·진행 기록';   /* 2026-09-28 문구 다듬음(「자세히 —」) */
    }
  }

  /* ══ 「⋯ 더보기」 (2026-09-27 대표 지시: 「기능이 겹치는 버튼 정리」) ══════════
     🔴 「👁 고객 화면 미리보기」는 **「고객용」 탭과 같은 일**을 한다(같은 renderBundle ·
       보낼 문서 체크도 따른다). 겹치는 건 감춘다. **문서가 없는 옛 견적**만 고객용 탭이
       비므로 그때만 메뉴에 둔다 — 없애면 그 건들은 발급 전에 볼 길이 사라진다.
     ⚠ 열 때마다 메뉴를 접는다 — 앞 건에서 펼쳐 둔 채 닫으면 다음 건에서 펼쳐진 채 뜬다. */
  let emMoreOutsideArmed = false;
  function emSyncMoreMenu(e) {
    const menu = document.getElementById('em-moremenu');
    if (menu) menu.open = false;
    /* 메뉴 밖을 누르면 접는다 — `<details>`는 스스로 안 접힌다.
       ⚠ 이 파일은 「선언만 둔다」(머리 주석) — 불러올 때가 아니라 **처음 열 때 한 번** 건다. */
    if (!emMoreOutsideArmed) {
      emMoreOutsideArmed = true;
      document.addEventListener('click', (ev) => {
        const m = document.getElementById('em-moremenu');
        if (m && m.open && !m.contains(ev.target)) m.open = false;
      });
    }
    const pv = document.getElementById('emMorePreview');
    if (pv) pv.classList.toggle('hidden', !!emDocOf(e));
  }
  /* 메뉴 항목을 누르면 **먼저 접고** 부른다 — 확인창이 뜬 뒤에도 메뉴가 펼쳐져 있으면
     무엇을 누른 건지 헷갈린다. */
  function emMoreDo(fn) {
    const menu = document.getElementById('em-moremenu');
    if (menu) menu.open = false;
    if (typeof fn === 'function') fn();
  }

  /* ══ 고객용 / 직원용 (2026-09-23 대표 지시 2-1·2-3) ═══════════════════════
     🔴 **기본은 고객용이다.** 담당자가 상세를 여는 이유는 대개 「고객이 뭘 받나」이고,
       그걸 먼저 보여 주면 원가 화면을 지나칠 일이 없다.
     ⚠ 탭 상태는 **본문 상자의 `data-emtab`** 하나가 진실이다. 자바스크립트가 요소를
       하나씩 감추면 구역이 늘 때마다 빠뜨린다(결함 생성기 ①) — CSS 규칙 한 줄이 한다. */
  function emSetTab(which) {
    const body = document.getElementById('emModalBody');
    if (!body) return;
    const tab = which === 'staff' ? 'staff' : 'cust';
    /* 🔴 직원용 → 고객용으로 나갈 때만 묻는다. 들어올 때는 잃을 것이 없다. */
    if (tab === 'cust' && body.dataset.emtab === 'staff' && !emEditGuard('고객용 탭으로 이동')) return;
    /* ⚠ 직원용 탭을 **그냥** 열면 다섯 단계가 다 보인다. 좁히는 것은 「수정하기」뿐이다. */
    if (tab === 'staff') emEditEnsure(emPendingFocus);
    emPendingFocus = null;
    body.dataset.emtab = tab;
    emHashSet(tab === 'staff' ? { v: 'staff' } : { v: null, s: null, f: null });
    const c = document.getElementById('emTabBtnCust');
    const t = document.getElementById('emTabBtnStaff');
    if (c) c.setAttribute('aria-pressed', tab === 'cust' ? 'true' : 'false');
    if (t) t.setAttribute('aria-pressed', tab === 'staff' ? 'true' : 'false');
    const note = document.getElementById('emTabNote');
    if (note) {
      note.textContent = tab === 'cust'
        ? ''   /* 2026-09-28 대표 요청 — 「고객이 받는 그대로입니다 — 원가·마진은 들어 있지 않습니다」도 뺐다 */
        : '';   /* 2026-09-28 대표 요청 — 직원용 탭의 「🔒 원가·마진이 보입니다 — 이 화면은 고객에게 나가지 않습니다」를 뺐다 */
    }
    /* 문서는 탭을 열 때 크기를 다시 잰다 — 감춰져 있는 동안은 높이가 0이라 못 맞춘다 */
    if (tab === 'cust' && typeof QuoteDoc !== 'undefined' && QuoteDoc.fitPages) {
      const prev = document.getElementById('em-doc-prev');
      if (prev) QuoteDoc.fitPages(prev);
    }
    /* 모달 안에서 탭을 바꿨으면 맨 위부터 본다 — 앞 탭에서 내려간 자리에 떨어지면
       무엇이 바뀐 건지 모른다 */
    if (body.scrollTop > 0) body.scrollTop = 0;
  }

  /* 「수정하기」 — 누른 단락에 해당하는 **직원용 자리로 데려간다** (대표 지시 2-3).
     ⚠ 탭만 바꾸고 말면 담당자는 긴 화면에서 다시 그 자리를 찾아야 한다. 옮기고,
       **어디로 왔는지 잠깐 표시**한다(1.6초 배경). 조용히 옮기면 이동한 줄도 모른다. */
  function emGotoEdit(which) {
    /* 🔴 **그 영역만 연다** (2026-09-24 대표 지시). 예전에는 편집기를 통째로 열고
       단계만 옮겼는데, 다섯 단계가 다 보여서 「어디를 고치라는 건지」가 흐려졌다.
       ⚠ 탭을 여는 쪽(`emSetTab`)이 불러오기를 하므로 **먼저 넘겨 둔다.** */
    emPendingFocus = which;
    emSetTab('staff');
    /* 🔴 **고칠 수 있는 자리로 데려간다** — 읽기 전용 표로 보내면 「수정하기」가
       거짓말이 된다(CLAUDE.md 화면 규칙 ③). */
    const id = 'em-sec-edit';
    const el = document.getElementById(id);
    if (!el) return;
    /* 되풀이해 눌러도 매번 보이게 — 클래스를 뗐다가 다시 붙인다 */
    el.classList.remove('em-flash');
    /* eslint-disable-next-line no-unused-expressions */
    el.offsetWidth;
    el.classList.add('em-flash');
    if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 체크를 바꾸면 **그 자리에서** 미리보기가 따라온다 — 안 따라오면 담당자가
     바꾼 뒤에도 옛 화면을 보고 판단한다(결함 생성기 ③의 반대편: 흔적 없는 조작). */
  ['emPartBd', 'emPartIti'].forEach((id) => {
    document.addEventListener('change', (e) => {
      if (!e.target || e.target.id !== id) return;
      const rec = getEstsFull().find((x) => x.id === emCurrentId);
      if (rec) emRenderDocPreview(rec);
    });
  });

  function emRenderItiState() {
    const el = document.getElementById('em-iti-state');
    if (!el) return;
    const rec = getEstsFull().find((x) => x.id === emCurrentId);
    /* 🔴 문서가 붙어 있으면 **아래 일정은 고객에게 안 나간다.** 먼저 그 사실을 말한다. */
    const doc = emDocOf(rec);
    /* 🔴 문서가 있으면 「일정 확인·수정」을 감춘다 — 거기서 고친 일정은 안 나간다(2026-09-27) */
    const btn = document.getElementById('emItiEditBtn');
    if (btn) btn.classList.toggle('hidden', !!doc);
    if (doc) {
      const n = emDocItiDays(doc).length;
      el.textContent = n
        ? '🧾 견적서 문서의 일정이 나갑니다 (' + n + '일) — 고치려면 고객용 탭 일정표의 「수정하기」'
        : '🧾 견적서 문서가 붙어 있는데 일정표가 비어 있습니다 — 일정 없이 나갑니다 · 고객용 탭 일정표의 「수정하기」로 채웁니다';
      el.style.color = n ? '#15803D' : 'var(--warn)';
      return;
    }
    const it = rec && rec.itinerary;
    if (it && Array.isArray(it.courses) && it.courses.length) {
      el.textContent = '📝 이 견적서 전용 일정'
        + (it.confirmedBy ? ' · ' + it.confirmedBy + ' 확인' : '')
        + (it.days ? ' · ' + it.days + '일' : '')
        + (rec && it.days && Number(it.days) !== Number(rec.days) ? '  ·  ⚠ 저장 후 견적 일수가 바뀌었습니다' : '');
      el.style.color = '#15803D';
    } else {
      el.textContent = '목적지 공통 일정이 나갑니다 (이 견적서 전용 일정 없음)';
      el.style.color = 'var(--muted)';
    }
  }

  function eqSetMsg(text, kind) {
    const el = document.getElementById('eq-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'err' ? 'var(--primary)' : kind === 'ok' ? '#15803D' : 'var(--muted)';
  }

  /* 모달을 열 때마다 초기화한다 — 안 지우면 **앞 견적의 일정이 다음 견적 화면에 남는다.**
     그 상태로 저장하면 남의 일정이 이 고객에게 나간다. */
  function eqReset() {
    eqState = null;
    const body = document.getElementById('eq-body');
    const imp  = document.getElementById('eq-import-row');
    const cnt  = document.getElementById('eq-count-row');
    if (body) { body.innerHTML = ''; body.classList.add('hidden'); }
    if (imp)  imp.classList.add('hidden');
    if (cnt)  cnt.classList.add('hidden');
    const org = document.getElementById('eq-origin');
    if (org) org.textContent = '';
    const head = document.getElementById('eq-head');
    if (head) head.textContent = '';
    eqSetMsg('');
  }

  /* 스냅샷(고객에게 나갈 모양) → 편집할 수 있는 코스 두 벌.
     ⚠ 깊은 복사다. 얕게 넘기면 편집이 ITINERARY_DB 원본을 건드려, 저장하지 않고
       닫아도 그 브라우저의 다른 화면이 고쳐진 값을 보게 된다. */
  function eqCoursesFromSnap(snap) {
    const one = (p) => ({
      title: String(p.t || ''), subtitle: String(p.s || ''),
      highlights: (p.h || []).map((x) => String(x)),
      days: (p.d || []).map((d, i) => ({
        day: i + 1,
        title: String(d.title || ''), am: String(d.am || ''), pm: String(d.pm || ''),
        eve: String(d.eve || ''), tip: String(d.tip || ''),
        /* 시스템이 만들어 낸 날 — 화면에만 쓰고 저장되지 않는다(서버가 흰 목록으로
           title·am·pm·eve·tip만 남긴다). 이 표시가 없으면 작성자는 자동 생성 문구를
           자기가 쓴 글로 착각한다. */
        _auto: !!d._auto,
      })),
    });
    /* UO: 코스 한 벌만 나가는 견적서면 b가 null이다. 여기서 ca를 복제해 채우면
       편집기에는 두 벌이 보이고, 저장하는 순간 「하나만」이 조용히 풀린다. */
    return snap.b ? [one(snap.a), one(snap.b)] : [one(snap.a)];
  }

  /* 편집기를 연다 (UM).
     ⚠ 열기 전에 **반드시 eqReset()**한다. 안 지우면 앞 견적의 편집 상태가 남아,
       저장하는 순간 남의 일정이 이 고객에게 나간다.
     opts.onSaved — 저장이 끝나면 저장된 일정을 돌려준다. 산출 화면(iframe)이 이걸로
       「견적서 받기」에 실을 일정을 갱신한다. 없으면 아무 일도 안 한다. */
  async function eqOpen(quoteId, opts) {
    const modal = document.getElementById('eqModal');
    const body  = document.getElementById('eq-body');
    if (eqState && eqState.dirty
        && !confirm('저장하지 않은 편집이 있습니다. 버리고 다시 열까요?')) return;
    eqReset();
    eqOnSaved = (opts && typeof opts.onSaved === 'function') ? opts.onSaved : null;
    modal.classList.remove('hidden');

    const rec = getEstsFull().find((x) => x.id === quoteId);
    if (!rec) {
      /* 산출 직후라면 서버 저장이 아직 안 끝났거나 실패한 것이다. 조용히 닫지 않는다 —
         담당자는 "왜 안 열리지"가 아니라 "무엇이 잘못됐는지"를 알아야 한다. */
      eqSetMsg('이 견적을 찾을 수 없습니다. 산출 직후라면 잠시 뒤 다시 눌러 주세요.', 'err');
      return;
    }
    document.getElementById('eq-head').textContent =
      (rec.orgName || '(고객명 없음)') + ' · ' + (rec.destLabel || rec.destKey) + ' · ' + rec.days + '일';

    eqSetMsg('불러오는 중…');
    const tables = await emLoadItiTables();
    const saved = rec.itinerary || null;
    const snap = recQuoteItinerary(
      Object.assign({}, tables, {
        savedCourses: saved && saved.courses, savedDays: saved && saved.days,
      }),
      { destKey: rec.destKey, programType: rec.program, totalDays: rec.days });

    if (!snap) {
      eqSetMsg('"' + (rec.destLabel || rec.destKey) + '"에 등록된 코스가 없어 출발점을 만들 수 없습니다. '
        + '사이드바 → 일정·방식 비교에서 이 목적지의 코스를 먼저 만들어 주세요.', 'err');
      return;
    }

    const opened = eqCoursesFromSnap(snap);
    eqState = {
      id: rec.id, destKey: rec.destKey, days: rec.days,
      courses: opened, dirty: false, origin: snap.origin,
      /* UO: 'both' | 'a' | 'b'. 저장된 전용 일정이 한 벌이면 이미 「하나만」인 상태다.
         ⚠ 저장할 때 A였는지 B였는지는 남지 않는다 — 남길 이유도 없다. 지금 이
           견적서에 나가는 코스는 하나뿐이고, 화면은 그것을 「코스」로만 부른다. */
      count: opened.length === 1 ? 'a' : 'both',
      tables,   /* 가져오기 후보를 만들 때 쓴다 — 다시 받아오면 그 사이 값이 달라진다 */
    };
    const org = document.getElementById('eq-origin');
    if (org) {
      org.textContent = '출발점 · ' + snap.originLabel
        + (saved && saved.confirmedBy ? '  ·  ' + saved.confirmedBy + ' 확인' : '')
        + (snap.daysChanged ? '  ·  ⚠ 저장 후 견적 일수가 바뀌었습니다' : '')
        + (tables.loaded ? '' : '  ·  ⚠ 최신 수정본을 불러오지 못했습니다(기본 일정 기준)');
    }
    body.classList.remove('hidden');
    document.getElementById('eq-count-row').classList.remove('hidden');
    eqSyncCountRow();
    eqFillImport();
    eqRenderBody();
    eqSetMsg('');
  }

  function eqClose() {
    if (eqState && eqState.dirty
        && !confirm('저장하지 않은 편집이 있습니다. 닫으면 사라집니다. 계속할까요?')) return;
    document.getElementById('eqModal').classList.add('hidden');
    eqOnSaved = null;
    eqReset();
  }

  /* 견적 상세·딥링크가 부르는 창구 (UM).
     ⚠ 편집기를 그쪽에 복제하지 않기 위한 유일한 연결점이다. 여기서 하는 일은
       "열어 준다"뿐이고, 조립·일수 맞춤·저장 규칙은 전부 이 화면 한 곳에 남는다. */

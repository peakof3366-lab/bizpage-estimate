/* ═══════════════════════════════════════════════════════════════════════════
   견적서 대장 화면 (WB) — admin.html에서 떼어낸 첫 화면 (구조 정리 2b-2)

   ■ 로드 규칙
     `admin/common.js` **다음**, admin.html의 인라인 <script> **앞**에서 실린다.
     여기 있는 것은 전부 **선언**이다(함수 6개 + 상수 1 + 상태 1). 선언 시점에
     admin.html의 함수를 부르지 않으므로 앞에서 실려도 안전하다.
     ⚠ 실행문(addEventListener·fetch)을 여기 넣지 말 것 — common.js와 같은 규칙이다.

   ■ 이 화면을 부르는 쪽
     `renderLedger()`는 admin.html의 탭 라우터가 부른다. 따로 script 태그에 있어도
     함수 선언은 전역이라 그대로 닿는다(2026-09-09 탐침으로 확인, 2b-2에서 재확인).

   ■ 검사
     `ai-loop/_admin_source.js`의 ADMIN_PARTS에 이 파일이 들어 있다(글자로 재는 검사용).
     `ai-loop/test_zZ_admin_boot.js`가 **띄워서** renderLedger·ledDraw가 사는지 본다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ════ 견적서 대장 (WB) ════════════════════════════════════════════════════
     ⚠ **전 직원이 다 본다.** 가리면 「휴가 대응」이라는 목적 자체가 깨진다.
     ⚠ 삭제 버튼을 두지 않았다 — 견적서를 지우면 「우리가 그 금액을 낸 적 있다」는
       근거가 사라진다. 무산은 status='void'로 남긴다. */
  const LED_STATUS = { issued: '발급', won: '계약', lost: '무산', void: '취소' };
  let ledRows = [];

  async function renderLedger(q) {
    const box = document.getElementById('ledList');
    if (!box) return;
    box.innerHTML = '<div style="padding:16px;color:#888;font-size:.85rem">불러오는 중…</div>';
    try {
      const url = '/api/quote-shares?action=list' + (q ? '&q=' + encodeURIComponent(q) : '');
      const r = await fetch(url);
      if (!r.ok) throw new Error('http_' + r.status);
      const d = await r.json();
      ledRows = (d && d.shares) || [];
      const cnt = document.getElementById('ledCount');
      /* ⚠ 상한에 걸린 것을 **말한다.** 조용히 자르면 「이게 전부」로 읽힌다. */
      /* 🔴 차수를 못 셌으면 **말한다** (ZE). 조용히 넘어가면 모든 줄이 「1차·최신」으로
         보이는데, 그건 이 기능이 막으려던 바로 그 오해다(옛 견적서를 최신으로 안다). */
      if (cnt) cnt.textContent = ledRows.length + '건'
        + (d.capped ? ' (최근 ' + d.max + '건만 표시 — 검색해 주세요)' : '')
        + (d.revisions === false ? ' · ⚠ 차수를 세지 못했습니다 (개정 표시가 빠져 있습니다)' : '');
    } catch (err) {
      /* 못 불러온 것을 「0건」으로 보여주지 않는다 — 견적서가 사라진 줄 알게 된다 */
      box.innerHTML = '<div style="padding:16px;color:#B91C1C;font-size:.85rem">'
        + '목록을 불러오지 못했습니다 — <strong>「견적서가 없다」는 뜻이 아닙니다.</strong> ('
        + esc(String(err.message || err)) + ')</div>';
      return;
    }
    ledDraw();
  }

  function ledDraw() {
    const box = document.getElementById('ledList');
    if (!ledRows.length) {
      /* 🔴 **「검색 결과가 없다」와 「아직 한 건도 없다」는 다른 말이다** (XT).
         예전엔 둘 다 「해당하는 견적서가 없습니다」였다. 검색 중이면 담당자는
         검색어를 지우면 되고, 처음이면 발급부터 해야 한다 — 할 일이 정반대다. */
      const q = (document.getElementById('ledSearch') || {}).value || '';
      box.innerHTML = q.trim()
        ? '<div style="padding:16px;color:#888;font-size:.85rem;line-height:1.8">'
          + '「' + esc(q.trim()) + '」와 맞는 견적서가 없습니다.<br>'
          + '검색어를 지우고 <strong>새로고침</strong>을 누르면 전체 목록이 나옵니다.</div>'
        : '<div style="padding:16px;color:#888;font-size:.85rem;line-height:1.8">'
          + '아직 발급된 견적서가 없습니다.<br>'
          + '견적서는 고객이 홈페이지에서 직접 받거나, <strong>「견적 관리」</strong>에서 '
          + '담당자가 발급하면 여기에 기록됩니다.</div>';
      return;
    }
    const won = (n) => Number(n || 0).toLocaleString();
    const day = (v) => (v ? String(v).slice(0, 10) : '');
    /* ══ 표 (ZV로 다시 짰다) ══════════════════════════════════════════════════
       대표: 「다른 직원이 이 내용을 기반으로 다음 작업을 이어나가야 한다.」
       그래서 한 줄이 답해야 하는 질문은 다섯이다:
           어느 건인가(번호) · 우리가 산 값은(공급사 번호) · 누구에게 ·
           얼마에 · 어디까지 갔나(상태 + 누가 언제 바꿨나)

       🔴 **11열을 8열로 줄였다.** 예전에는 연락처·1인당·인원·발급자가 각자 열이었는데,
         `.dash-main`이 `overflow-x:hidden`이라 열이 늘수록 **오른쪽 끝이 잘린다.**
         짝지어 한 칸에 두 줄로 넣으면 열이 줄고 **읽는 덩어리도 줄어든다**:
             고객 + 연락처 · 목적지 + 인원 · 총액 + 1인당 · 상태 + 바꾼 사람
       🔴 **공급사 번호를 독립 열로 뺐다.** 예전에는 우리 번호 칸 **안**에 끼어 있어
         「이 둘이 무슨 관계인가」가 안 보였다. 머리글을 「우리 번호(판 값)」와
         「공급사 번호(산 값)」로 나란히 두면 매칭이 **표 모양 자체로** 설명된다. */
    box.innerHTML = '<table class="tbl">'
      + '<thead><tr>'
      /* ⚠ 이름은 **실무에서 쓰는 말**로 (2026-09-08 대표 지시).
         「판 값」은 우리끼리 쓰던 말이고, 고객에게 나간 값이니 **고객가**가 맞다.
         반대쪽은 「산 값·원가」로 두 번 말할 것 없이 **원가** 하나면 통한다. */
      +   '<th>우리 견적번호<div class="sub">고객가</div></th>'
      +   '<th>공급사 견적번호<div class="sub">원가</div></th>'
      +   '<th>발행일<div class="sub">발급자</div></th>'
      +   '<th>고객<div class="sub">연락처</div></th>'
      +   '<th>목적지<div class="sub">인원</div></th>'
      +   '<th class="num">총액<div class="sub">1인당</div></th>'
      +   '<th>상태<div class="sub">바꾼 사람</div></th>'
      +   '<th></th>'
      + '</tr></thead><tbody>'
      + ledRows.map((r, i) => {
        const cust = r.org || r.customer_label || r.cn || '—';
        /* 엔진 검증을 거친 것과 아닌 것을 구분해 보여준다 — 나중에 금액을 다툴 때 근거다 */
        const vd = { package: '패키지', assembled: '담당자 산출' }[r.verdict];
        /* 줄에도 상태를 실어 준다 — 드롭다운 하나보다 **줄**이 먼저 눈에 든다.
           ⚠ 상태별 클래스는 CSS 한 곳에만 적는다. 여기서 색을 정하면 두 벌이 된다. */
        return '<tr data-i="' + i + '" class="st-' + esc(r.status || 'issued') + '">'
          /* ── ① 우리 번호 ── 차수·최신본 경고가 여기 붙는다 */
          + '<td style="white-space:nowrap">'
          +   '<div style="font-weight:700">' + esc(r.quote_no || '—')
          /* 차수 (ZE) — 1차에는 안 붙인다. 늘 켜져 있는 표시는 아무도 안 본다.
             ⚠ 못 셌으면 **못 셌다고** 말한다. 짐작한 차수는 「최신이 아닌데 최신처럼
               보이는」 자리를 만든다. */
          +   (r.revBroken ? ' <span class="pkg-st draft" title="앞선 견적서를 못 찾아 차수를 세지 못했습니다">차수 모름</span>'
          /* ⚠ 차수가 무엇인지는 **배지 자체가** 말한다(ZV). 예전에는 파란 안내 상자에
             적혀 있었는데, 안내를 줄이면서 설명을 **그 물건 옆으로** 옮겼다 — 상자보다
             가까운 자리다. */
              : (r.revNo > 1
                ? ' <span class="pkg-st draft" title="같은 문의로 견적서를 다시 내면 차수가 붙습니다. 이 건은 ' + esc(String(r.revNo)) + '번째로 낸 견적서입니다.">'
                  + esc(String(r.revNo)) + '차</span>'
                : ''))
          +   '</div>'
          +   (r.revOfNo ? '<div class="sub">↳ ' + esc(r.revOfNo) + ' 개정</div>' : '')
          /* 🔴 **이 줄이 이 기능의 전부다.** 이어받은 사람이 옛 견적서를 보고 옛 금액으로
             응대하는 것을 막는다. 최신본일 때는 아무 말도 안 한다. */
          +   (r.isLatest === false && r.latestNo
                ? '<div style="font-size:11px;color:#B91C1C;font-weight:700;margin-top:3px">🔴 최신본 ' + esc(r.latestNo) + '</div>'
                : '')
          + '</td>'
          /* ── ② 공급사 번호 (ZC) ── 우리 번호 **바로 옆**이라 짝이 눈에 보인다 */
          + '<td style="white-space:nowrap">'
          +   '<input class="led-vno" data-i="' + i + '" value="' + esc(r.vendor_quote_no || '') + '"'
          +     ' placeholder="원가 견적번호" maxlength="60"'
          /* ⚠ 낭독기에는 **어느 줄의 칸인지**를 준다 — 「번호」짜리 칸이 화면에 수십 개다 */
          +     ' aria-label="' + esc((r.quote_no || '이 견적서') + ' — 하나투어·랜드사 견적번호') + '"'
          +     ' title="원가 견적서(하나투어·랜드사)에 적힌 번호입니다. 이 번호로도 검색되고, 원가와 우리 판매가를 잇는 유일한 열쇠입니다. 고객 문서에는 나가지 않습니다."'
          +     ' style="width:118px;height:28px;font-size:11.5px;padding:0 6px;border:1px solid var(--border);border-radius:4px">'
          /* 누가 언제 적었나 — 적힌 건에만 보인다(늘 켜져 있으면 아무도 안 본다) */
          +   (r.vendor_no_by
                ? '<div class="sub led-vno-by">' + esc(r.vendor_no_by)
                  + (r.vendor_no_at ? ' · ' + esc(day(r.vendor_no_at)) : '') + '</div>'
                : '')
          + '</td>'
          /* ── ③ 발행일 + 발급자 ──
             🔴 발급자를 빠뜨렸다가 `test_wB` ⑧이 잡았다. 「휴가 중 이어받기」가 목적인
               대장에서 **누가 낸 건지**가 사라지면 이어받은 사람이 물어볼 데가 없다.
               발행일과 짝이라 한 칸에 둔다 — 「언제, 누가 냈나」가 한 덩어리다. */
          + '<td style="white-space:nowrap">' + esc(day(r.iso) || day(r.created_at))
          +   '<div class="sub-strong">' + esc(r.issued_by || '—') + '</div>'
          + '</td>'
          /* ── ④ 고객 + 연락처 ── 연락처 (WC)는 대장에만 있다. 눌러서 바로 건다. */
          + '<td>' + esc(cust)
          +   '<div class="sub-strong">' + (r.customer_tel
                ? '<a href="tel:' + esc(String(r.customer_tel).replace(/[^0-9+]/g, '')) + '">'
                  + esc(r.customer_tel) + '</a>'
                : '—') + '</div>'
          + '</td>'
          /* ── ⑤ 목적지 + 인원 ── */
          + '<td>' + esc(r.dest || '—')
          +   (vd ? ' <span class="pkg-st draft">' + esc(vd) + '</span>' : '')
          +   '<div class="sub-strong">' + esc(String(r.pax || '—')) + '명</div>'
          + '</td>'
          /* ── ⑥ 총액 + 1인당 ── 고객이 전화로 가장 먼저 묻는 값이 총액이다(WV)
             🔴 **여기 적히는 것은 「고객이 받은 견적서의 금액」이다** (2026-09-17).
               서버가 `payload.doc`이 있으면 그 문서의 총액을 준다 — 담당자가 문서에서
               단가를 조정해 발급하면 산출 당시 금액(`t`)과 달라지기 때문이다.
               실측 1건에서 −10.00% 벌어져 있었고, 그때 대장은 **고객이 못 본 금액**을
               적고 있었다. 이어받은 사람이 그 값으로 응대하면 그 자리가 금액 분쟁이 된다.
             ⚠ 어긋날 때만 산출가를 함께 보여준다. 늘 두 줄이면 곧 아무도 안 읽는다. */
          + '<td class="num"><span style="font-weight:700">' + won(r.total) + '원</span>'
          +   '<div class="sub-strong">1인 ' + won(r.per) + '원</div>'
          +   (r.totalQuoted
                /* ⚠ 색은 토큰으로 — `--warn`은 admin.css가 정한다(#B45309).
                   여기 값을 적으면 브랜드 색이 바뀌는 날 이 한 줄만 옛 색으로 남는다. */
                ? '<div class="sub-strong" style="color:var(--warn,#B45309)" title="견적 산출 당시 금액입니다. 담당자가 견적서에서 금액을 조정해 발급하면 이렇게 갈립니다.">'
                  + '⚠ 산출가 ' + won(r.totalQuoted) + '원 (' + (r.totalDrift > 0 ? '+' : '') + r.totalDrift + '%)</div>'
                : '')
          + '</td>'
          /* ── ⑦ 상태 + 바꾼 사람 ──
             🔴 **바꾼 사람 줄이 `<select>` 안에 들어가 있었다** (ZV에서 잡았다).
               `<select>`의 자식은 `<option>`뿐이라 브라우저가 그 `<div>`를 그리지 않는다 —
               **한 번도 화면에 보인 적이 없다.** 「휴가 중 이어받기」가 목적인 대장에서
               「이거 누가 계약으로 바꿨죠?」를 못 보면 이어받은 사람이 다시 물어야 한다.
               ⚠ jsdom은 관대해서 textContent에 잡힌다 — **검사는 통과하는데 화면엔 없었다**
                 (결함 생성기 ③). 그래서 브라우저로 눌러 보고서야 걸렸다. */
          /* 🔴 **상태를 색으로 먼저 읽게 한다** (2026-09-08 대표 지시).
             넷이 다 같은 회색 드롭다운이라, 훑을 때 「계약된 건」과 「무산된 건」이
             구별이 안 됐다. 대장은 **훑는 화면**이다 — 한 줄씩 읽는 곳이 아니다.
             ⚠ 색만으로 말하지 않는다 — 글자(발급/계약/무산/취소)가 그대로 있고
               색은 거드는 것이다. 색각 이상이 있어도 읽힌다(WCAG 1.4.1). */
          /* 🔴 **고른 순간 저장되지 않는다** (ZY, 2026-09-09 대표 지시). 바꾸면 옆의
             「저장」이 켜지고, 그 버튼을 눌러야 서버로 간다. `data-saved`가 **서버에
             저장된 값**이다 — 화면의 `value`와 이 값을 견주어 「아직 안 됐다」를 안다.
             ⚠ 저장된 값을 `select.value`로 되짚지 않는다. 그 값은 사람이 방금 바꿔 놓은
               것이라, 되돌릴 곳이 사라진다. */
          + '<td><div class="led-st-wrap">'
          +   '<select class="led-st led-st--' + esc(r.status || 'issued') + '" data-i="' + i + '"'
          +     ' data-saved="' + esc(r.status || 'issued') + '"'
          /* ⚠ 낭독기에는 **어느 줄의 상태인지**를 준다 — 같은 드롭다운이 화면에 수십 개다 */
          +     ' aria-label="' + esc((r.quote_no || '이 견적서') + ' — 진행 상태') + '">'
          +   Object.keys(LED_STATUS).map(k => '<option value="' + k + '"'
                + (k === (r.status || 'issued') ? ' selected' : '') + '>' + LED_STATUS[k] + '</option>').join('')
          +   '</select>'
          /* 🔴 처음에는 **꺼져 있다.** 늘 켜져 있으면 「누를 것이 있는가」를 버튼이
             말해 주지 못하고, 안 바뀐 건에도 눌러서 「누가 언제」만 헛되이 갱신된다. */
          +   '<button type="button" class="btn-act led-st-save" data-i="' + i + '" disabled'
          +     ' aria-label="' + esc((r.quote_no || '이 견적서') + ' — 바꾼 상태를 저장') + '"'
          +     ' title="상태를 바꾸면 이 버튼이 켜집니다. 누르기 전에는 저장되지 않습니다.">저장</button>'
          + '</div>'
          /* 바꾼 사람 — 클래스로 찾는다(ZV의 교훈: DOM 모양에 기대면 남의 칸을 덮는다).
             저장에 성공하면 이 줄이 **생기거나 갱신되는 것**이 눈에 보이는 증거다. */
          /* ⚠ 빈 채로 두면 **빈 줄**이 남아 칸이 3px씩 밀린다(ZX에서 겪었다) — 감춘다.
             저장하면 그때 hidden을 떼고 채운다. */
          + '<div class="sub led-st-by"' + (r.status_by ? '' : ' hidden') + '>'
          +   (r.status_by ? esc(r.status_by) + (r.status_at ? ' · ' + esc(day(r.status_at)) : '') : '')
          + '</div>'
          + '</td>'
          /* ── ⑧ 조작 ── */
          + '<td style="white-space:nowrap"><button class="btn-act btn-outline-p led-open" data-i="' + i + '">열기</button>'
          +   ' <button class="btn-act btn-outline-p led-copy" data-i="' + i + '">링크</button>'
          /* 🔴 **어느 문의에 대한 견적서인가** (ZB). 없으면 버튼을 안 낸다 —
             고객이 홈페이지에서 직접 뽑은 건은 문의가 아예 없고, 그때 눌리는 버튼을
             내주면 「못 열었다」로 끝난다(YN에서 겪은 그 자리다). */
          +   (r.quote_id ? ' <button class="btn-act btn-outline-p led-req" data-i="' + i + '" title="이 견적서를 만든 고객 문의를 엽니다">문의</button>' : '')
          /* 개정 관계를 사람이 고치는 자리 (ZE). **끊기와 잇기가 같은 버튼**이다 —
             끊는 문만 내면 잘못 끊었을 때 화면에서 되돌릴 길이 없다.
             ⚠ 이을 후보(같은 문의의 직전 견적서)가 있을 때만 잇기 버튼을 낸다.
               고를 것이 없는데 버튼을 내주면 「눌렀는데 아무 일도 안 난다」가 된다. */
          +   (r.revOf
                ? ' <button class="btn-act btn-outline-p led-rev" data-i="' + i + '" data-to=""'
                  + ' aria-label="' + esc((r.quote_no || '이 견적서') + '를 개정 아님으로 표시') + '"'
                  + ' title="이 견적서는 앞 건의 개정본이 아니라고 표시합니다">개정 아님으로</button>'
                : (r.prevId
                  ? ' <button class="btn-act btn-outline-p led-rev" data-i="' + i + '" data-to="' + esc(r.prevId) + '"'
                    + ' aria-label="' + esc((r.quote_no || '이 견적서') + '를 ' + (r.prevNo || '앞 건') + '의 개정으로 표시') + '"'
                    + ' title="같은 문의의 직전 견적서와 이어 차수를 매깁니다">' + esc(r.prevNo || '앞 건') + ' 개정으로</button>'
                  : ''))
          + '</td>'
          + '</tr>';
      }).join('') + '</tbody></table>';

    /* ⚠ 인라인 onclick에 값을 끼워 넣지 않는다 — 그 구조는 esc()로 못 막는다 */
    const urlOf = (r) => location.origin + '/estimate-view.html?id=' + encodeURIComponent(r.id);
    box.querySelectorAll('.led-open').forEach(b => b.addEventListener('click',
      () => window.open(urlOf(ledRows[Number(b.dataset.i)]), '_blank', 'noopener')));
    /* 문의로 건너뛴다. ⚠ 그 문의가 목록에 없을 수 있다(지워졌거나 아직 안 불러왔거나) —
       **조용히 아무 일도 안 일어나게 두지 않는다.** 담당자는 버튼이 고장 났다고 생각한다. */
    box.querySelectorAll('.led-req').forEach(b => b.addEventListener('click', () => {
      const row = ledRows[Number(b.dataset.i)];
      if (!row || !row.quote_id) return;
      const has = (typeof getEstsFull === 'function') && getEstsFull().some(x => x.id === row.quote_id);
      if (!has) {
        alert('이 견적서를 만든 문의를 견적 관리 목록에서 찾지 못했습니다.\n(문의가 삭제됐거나 목록을 아직 불러오지 못했습니다)\n문의 번호: ' + row.quote_id);
        return;
      }
      switchTab('estmgr');
      openEstDetail(row.quote_id);
    }));
    box.querySelectorAll('.led-copy').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard?.writeText(urlOf(ledRows[Number(b.dataset.i)])).catch(() => {});
      b.textContent = '복사됨';
      setTimeout(() => { b.textContent = '링크'; }, 1500);
    }));
    /* 개정 관계 고치기 (ZE). ⚠ 고치고 나면 **목록을 다시 그린다** — 차수와 「최신본」
       표시는 이 줄 하나가 아니라 **같은 갈래의 다른 줄까지** 바뀐다. 누른 줄만 고치면
       화면 안에서 서로 다른 말을 하게 된다. */
    box.querySelectorAll('.led-rev').forEach(b => b.addEventListener('click', async () => {
      const row = ledRows[Number(b.dataset.i)];
      if (!row) return;
      /* ⚠ 이 버튼도 끝나면 목록을 다시 그린다 — 저장 안 한 상태 변경이 있으면 먼저 묻는다 (ZY) */
      if (!ledLeaveOk()) return;
      const to = b.dataset.to || '';
      b.disabled = true;
      try {
        const r = await fetch('/api/quote-shares?action=revision', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, revisionOf: to }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) {
          /* 왜 안 됐는지 그대로 말한다 — 「실패」로 뭉뚱그리면 다시 누르기만 한다 */
          throw new Error({
            cycle: '서로가 서로의 개정본이 되어 버립니다.',
            target_not_found: '이을 견적서를 찾지 못했습니다.',
            chain_too_long: '개정 사슬이 너무 깁니다.',
          }[d && d.error] || ('오류 ' + r.status));
        }
        await renderLedger(((document.getElementById('ledSearch') || {}).value || '').trim());
      } catch (err) {
        b.disabled = false;
        alert('개정 관계를 바꾸지 못했습니다 — ' + String(err.message || err));
      }
    }));

    /* 🔴 공급사(하나투어·랜드사) 견적번호 (ZC) — **원가와 판매가를 잇는 열쇠**다.
       ⚠ 상태 드롭다운과 **같은 규칙**을 쓴다: 실패하면 되돌리고 말한다. 화면만 바뀐
         채로 두면 담당자는 적었다고 믿는데, 이 칸은 나중에 대조할 때에야 없는 것을
         알게 되는 자리라 그 믿음이 특히 비싸다.
       ⚠ 성공은 **「누가 언제」 줄이 생기는 것으로** 보인다. 조용히 넘어가면 저장이
         됐는지 안 됐는지 모른다. */
    box.querySelectorAll('.led-vno').forEach(inp => {
      let prev = inp.value;
      inp.addEventListener('change', async () => {
        const row = ledRows[Number(inp.dataset.i)];
        if (!row) return;
        /* 안 바뀌었으면 서버를 부르지 않는다 — 부르면 「누가 언제」가 헛되이 갱신된다 */
        if (inp.value.trim() === String(prev || '').trim()) { inp.value = prev; return; }
        inp.disabled = true;
        try {
          const r = await fetch('/api/quote-shares?action=vendor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, vendorNo: inp.value }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) throw new Error('http_' + r.status);
          /* 🔴 **서버가 저장한 값을 그린다** — 화면이 자기가 친 값을 그대로 두면
             다듬어진 것(공백 정리·길이 자름)과 보이는 것이 갈린다. */
          inp.value = d.vendorNo || '';
          prev = inp.value;
          row.vendor_quote_no = d.vendorNo || null;
          row.vendor_no_by = d.by || null;
          row.vendor_no_at = d.at || null;
          /* 🔴 **DOM 모양에 기대지 않는다** (ZV에서 실제로 당했다).
             예전 코드는 `inp.parentNode.nextElementSibling`으로 「누가 언제」 줄을 찾았다.
             표를 다시 짜면서 입력칸의 부모가 `<div>`에서 `<td>`로 바뀌자, 그 **다음
             형제가 옆 칸(발행일)**이 되어 **남의 칸을 덮어쓸** 자리였다.
             → 같은 칸 안에서 **클래스로 찾는다.** 없으면 그 자리에 만든다. */
          const vtd = inp.closest('td');
          let line = vtd && vtd.querySelector('.led-vno-by');
          if (vtd && !line) {
            line = document.createElement('div');
            line.className = 'sub led-vno-by';
            vtd.appendChild(line);
          }
          if (line) line.textContent = (d.by || '') + (d.at ? ' · ' + day(d.at) : '');
        } catch (err) {
          inp.value = prev;
          alert('공급사 견적번호를 저장하지 못했습니다 — ' + String(err.message || err));
        } finally {
          inp.disabled = false;
        }
      });
    });
    /* ══ 상태 — 고르고 「저장」을 눌러야 반영된다 (ZY, 2026-09-09 대표 지시) ═════════
       예전에는 `change` 그 자리에서 서버로 갔다. 대장은 훑는 화면이라 드롭다운 위에서
       스크롤·↑↓ 한 번이면 값이 바뀌고, 그게 곧 저장이었다 — **되돌릴 문이 없었다.**
       ⚠ 되돌리는 문이 둘이다: ① 원래 값으로 다시 고르면 버튼이 저절로 꺼진다
         ② 저장하지 않고 다른 화면으로 가려 하면 **묻는다**(ledLeaveOk).
       ⚠ 실패 규칙은 그대로다 — 되돌리고 **왜 안 됐는지** 말한다. */
    const ledSyncSave = (sel) => {
      const btn = sel.closest('td').querySelector('.led-st-save');
      if (!btn) return;
      const dirty = sel.value !== sel.dataset.saved;
      sel.classList.toggle('is-dirty', dirty);
      btn.classList.toggle('is-on', dirty);
      btn.disabled = !dirty;
      /* 「저장됨」이 남아 있는 채로 또 고치면 거짓말이 된다 — 되돌린다 */
      if (dirty) { btn.classList.remove('is-done'); btn.textContent = '저장'; }
    };
    box.querySelectorAll('.led-st').forEach(sel =>
      sel.addEventListener('change', () => ledSyncSave(sel)));

    box.querySelectorAll('.led-st-save').forEach(btn => btn.addEventListener('click', async () => {
      const sel = btn.closest('td').querySelector('.led-st');
      const row = ledRows[Number(btn.dataset.i)];
      if (!sel || !row) return;
      const prev = sel.dataset.saved;            /* 서버에 저장돼 있는 값 */
      const next = sel.value;
      if (next === prev) { ledSyncSave(sel); return; }   /* 누를 것이 없다 */
      btn.disabled = true; sel.disabled = true;
      btn.textContent = '저장 중…';
      try {
        const r = await fetch('/api/quote-shares?action=status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, status: next }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error('http_' + r.status);
        row.status = next;
        sel.dataset.saved = next;
        /* 🔴 **이제서야** 색을 상태색으로 바꾼다 — 서버에 갔다는 것이 확인된 뒤다 */
        sel.className = 'led-st led-st--' + next;
        const tr = sel.closest('tr');
        if (tr) tr.className = 'st-' + next;
        /* 🔴 「누가 언제」가 갱신되는 것이 **저장됐다는 눈에 보이는 증거**다.
           서버가 안 알려주면(옛 배포) 그 줄을 건드리지 않는다 — 짐작해서 적지 않는다. */
        const line = sel.closest('td').querySelector('.led-st-by');
        if (line && d && d.by) {
          line.textContent = d.by + (d.at ? ' · ' + day(d.at) : '');
          line.hidden = false;
          row.status_by = d.by; row.status_at = d.at || null;
        }
        btn.classList.remove('is-on'); btn.classList.add('is-done');
        btn.textContent = '저장됨';
        btn.disabled = true;
        setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = '저장'; }, 2000);
      } catch (err) {
        /* 실패했으면 **되돌린다.** 화면만 바뀐 채로 두면 바꿨다고 믿게 된다 */
        sel.value = prev;
        alert('상태를 바꾸지 못했습니다 — ' + String(err.message || err));
        btn.textContent = '저장';
      } finally {
        sel.disabled = false;
        ledSyncSave(sel);
      }
    }));
  }

  /* 🔴 **저장하지 않은 상태 변경을 조용히 버리지 않는다** (ZY).
     목록을 다시 그리면 고쳐 놓은 드롭다운이 전부 원래 값으로 돌아간다. 담당자는
     「찾기」를 누른 것뿐인데 바꾼 것이 사라진다 — 그것도 **아무 말 없이**. */
  function ledDirtyCount() {
    return [...document.querySelectorAll('#ledList .led-st')]
      .filter(s => s.value !== s.dataset.saved).length;
  }
  function ledLeaveOk() {
    const n = ledDirtyCount();
    if (!n) return true;
    return confirm('아직 저장하지 않은 상태 변경이 ' + n + '건 있습니다.\n'
      + '지금 목록을 다시 불러오면 그 변경은 사라집니다.\n\n계속할까요?');
  }

/* ── 화면에 손잡이를 건다 (2b-1b-①) ─────────────────────────────────────────
   🔴 **DOMContentLoaded로 감싼 이유는 DOM 때문이 아니다.**
   이 파일은 마크업(1285~2396행) **뒤**에서 실리므로 DOM은 이미 다 그려져 있다.
   감싸는 이유는 **파일 사이의 순서** 때문이다 — 감싸지 않으면 이 줄들이 실리는
   순간에 돌고, 그때 아직 안 실린 다른 화면 파일의 값을 부르면 죽는다.
   DOMContentLoaded는 **모든 조각이 실린 뒤**에 돌아서 그 위험이 통째로 사라진다.
   ⚠ 그래서 화면 파일에서 손잡이를 걸 때는 **언제나 이 안에** 넣는다.

   ⚠ 셋 다 목록을 **다시 그린다** — 저장 안 한 상태 변경이 있으면 먼저 묻는다 (ZY)
   ───────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ledFind')?.addEventListener('click', () => { if (ledLeaveOk()) renderLedger(document.getElementById('ledSearch').value.trim()); });
  document.getElementById('ledReload')?.addEventListener('click', () => { if (!ledLeaveOk()) return; document.getElementById('ledSearch').value=''; renderLedger(); });
  document.getElementById('ledSearch')?.addEventListener('keydown', (e) => { if (e.key==='Enter') { e.preventDefault(); if (ledLeaveOk()) renderLedger(e.target.value.trim()); } });
});

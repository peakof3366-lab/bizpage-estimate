/* ═══════════════════════════════════════════════════════════════════════════
   추천 일정 미리보기 (방식 A·B) — admin.html에서 떼어낸 화면 (구조 정리 2b-3)

   ■ 로드 규칙  `admin/common.js` 다음, admin.html의 인라인 <script> 앞에서 실린다.
     여기 있는 것은 전부 **선언**이다. 실행문(addEventListener·fetch)은 admin.html에
     그대로 남아 있다 — 그쪽은 DOM 순서에 걸려 있어 따로 다룬다(2b-1b).

   ■ 검사  `ai-loop/_admin_source.js`의 ADMIN_PARTS + `ai-loop/test_zZ_admin_boot.js`가
     **띄워서** 이 화면의 이름이 사는지 본다. 이 파일을 비우면 test_zZ가 실패해야 한다.
   ═══════════════════════════════════════════════════════════════════════════ */
  /* ════ 방식 A·B 고객 화면 미리보기 (RJ) ═══════════════════════════════════
     담당자가 이 화면에서 채우는 다섯 칸은 **고객 화면 세 군데로 흩어져** 나간다.
     편집 화면만 보고는 어느 글이 어디로 가는지 알 수 없어서, 채워 놓고도 "이게
     어떻게 보이지?"를 확인하려면 저장해서 고객 화면을 직접 여는 수밖에 없었다.
     그건 **고객에게 반영된 뒤에야 본다**는 뜻이다. 그래서 저장 전에 연다.

     ⚠ 안쪽은 iframe이다. 관리자 화면 CSS(전역 리셋·글꼴·색)가 스며들면 '고객이 보는
     그대로'가 아니게 되고, 그 순간 미리보기는 미리보기가 아니라 또 하나의 화면이 된다.
     iframe 안에서는 고객 화면과 **같은 styles.css를 그대로 읽는다** — 여기서 카드
     스타일을 다시 적지 않는다(결함 생성기 ①: 같은 것을 두 번 적으면 어긋난다).

     ⚠ 담당자가 친 글자는 **전부 textContent로만** 넣는다. HTML 문자열로 조립하면
     `<img onerror=…>` 한 줄이 그대로 실행된다(결함 생성기 ④). 아래에서 문자열로
     쓰는 것은 뼈대(html/head/link)뿐이고 사람이 친 값은 하나도 섞이지 않는다.

     ⚠ 빈 칸은 **비워서 보여주지 않는다.** 고객 화면은 빈 칸을 rec_fallbacks.js의
     기본 문구로 채우므로, 빈 칸을 빈 채로 그리면 "아무것도 안 나간다"고 읽힌다.
     실제로 나가는 문구를 그리고, 그게 기본 문구라는 사실을 카드 **바깥에** 적는다
     (카드 안에 표시를 끼워 넣으면 고객이 보는 모양이 달라진다).
     ═════════════════════════════════════════════════════════════════════ */
  const REC_PV_PLANS = ['a', 'b'];

  /* (recPvText·recPvList는 구역 ③이 실제 일정 카드로 바뀌면서 쓰는 곳이 없어져 지웠다 —
     RR. 빈 칸 판단은 recPvFill 하나가 한다.) */

  /* iframe 안에 고객 화면 뼈대를 세운다. 스타일은 링크만 걸고 여기서 적지 않는다.
     .pv-* 만 이 미리보기 전용 껍데기(어디에 나가는지 알려주는 라벨)다. */
  function recPvBootFrame(frame) {
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link rel="stylesheet" href="styles.css">'
      + '<style>'
      + 'body{background:#F4F4F4;padding:20px;margin:0}'
      + '.pv-block{background:#fff;border:1px solid #E5E5E5;padding:20px;margin-bottom:18px}'
      /* 좁은 화면에서는 껍데기 여백을 줄여 그만큼을 카드 폭에 넘긴다 — 폭 예산 (RJ) */
      + '@media(max-width:1000px){body{padding:8px}.pv-block{padding:10px;margin-bottom:12px}}'
      + '.pv-where{font-size:11px;font-weight:800;letter-spacing:.08em;color:#8A8A8A;'
      + 'text-transform:uppercase;margin:0 0 4px}'
      + '.pv-what{font-size:13px;font-weight:700;color:#1A1A1A;margin:0 0 16px}'
      + '.pv-hint{font-size:12px;color:#6A6A6A;line-height:1.6;margin:14px 0 0}'
      + '.pv-warn{font-size:12px;color:#8A5A00;background:#FFF8E8;border-left:3px solid #E0A100;'
      + 'padding:8px 12px;margin:14px 0 0;line-height:1.6}'
      + '.pv-warn b{color:#6A4400}'
      /* 정말 빈칸으로 나가는 쪽은 더 세게 — 기본 문구로 채워지는 것과 결과가 다르다 */
      + '.pv-warn-hard{color:#9B1C1C;background:#FEF2F2;border-left-color:#DC2626}'
      /* 어느 화면을 고쳐야 이 자리가 바뀌는지 (RK) */
      + '.pv-from{font-size:11px;font-weight:700;color:#5B21B6;background:#F5F3FF;'
      + 'border:1px solid #DDD6FE;padding:4px 8px;margin:6px 0 0;line-height:1.5}'
      + '.pv-plan-lbl{font-size:11px;font-weight:800;color:#8A8A8A;margin:0 0 6px}'
      /* 옆 칸의 '여기에 다른 방식이 놓입니다' 안내 (RU) — 카드가 아니라 빈자리 설명이다 */
      + '.pv-ghost{display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:4px;min-height:120px;padding:20px;cursor:pointer;text-align:center;font:inherit;'
      + 'background:transparent;border:1px dashed #C9C9C9}'
      + '.pv-ghost:hover{border-color:#CC001A;background:#FFFCFC}'
      /* ⚠ #9A9A9A는 흰 바탕에서 2.81:1이라 check_contrast.py가 잡는다. 안내문은 읽으라고
         둔 글자다 — 옅게 하고 싶어도 #6A6A6A 아래로 내리지 말 것. */
      + '.pv-ghost-t{font-size:11px;color:#6A6A6A}'
      + '.pv-ghost-b{font-size:13px;font-weight:700;color:#6A6A6A}'
      + '.pv-ghost-go{font-size:12px;font-weight:800;color:#CC001A;margin-top:6px}'
      /* ⚠ 미리보기 껍데기는 **.pv-* 만 건드린다.** 고객 클래스(.plan-card 등)에
         여백 하나라도 얹으면 그 순간 미리보기가 고객 화면과 달라진다. 자리를 벌려야
         하면 감싸는 .pv-* 를 새로 두고 거기에 준다. */
      + '.pv-group{margin-bottom:4px}'
      /* ── 여기서 바로 고치기 (RS) ──
         ⚠ outline·background만 쓴다. border·padding·margin을 주면 **그 순간 카드 폭이
         고객 화면과 달라진다**(check_rec_preview.py가 세 폭에서 대조한다). outline은
         자리를 차지하지 않으므로 고객 클래스에 얹어도 배치가 그대로다. */
      /* ⚠ **배경색을 칠하지 말 것.** 고칠 수 있는 자리 중에는 검은 박스 위의 흰 글자가
         있다(.plan-value-box의 기대 효과 문구, .itin-day-header의 일자 제목).
         거기에 흰 배경을 칠하면 **글자가 사라진다** — 실제로 그렇게 배포됐고 사용자가
         "수정하려면 이렇게 보인다"며 빈 흰 칸 사진을 보냈다.
         손잡이는 outline으로만 표시한다. outline은 배경을 가리지도, 자리를 차지하지도
         않아서 밝은 바탕과 어두운 바탕 양쪽에서 똑같이 동작한다. */
      + '.pv-edit{outline:1px dashed #9A9A9A;outline-offset:2px;cursor:text}'
      + '.pv-edit:hover{outline-color:#CC001A;outline-style:solid}'
      + '.pv-edit:focus{outline:2px solid #CC001A}'
      /* ── 묶을 것은 묶는다 (RV) ──
         한 칸에 한 점선이면, 포인트 세 줄짜리 목록은 점선이 세 겹으로 겹쳐 보인다.
         사용자가 "합칠 곳은 합쳐 달라"고 한 자리다. **같은 칸의 여러 줄**(포인트 목록,
         한 일자의 오전·오후·저녁)은 겉을 한 겹으로 두르고, 안쪽 줄은 가리킬 때만 뜬다.
         ⚠ 서로 다른 값인 칸(방식 이름·한 줄 설명·기대 효과)은 묶지 않는다 — 묶으면
         "이게 한 칸인가?"가 되어 어디를 고치는지 다시 모르게 된다. */
      + '.pv-egroup{outline:1px dashed #9A9A9A;outline-offset:5px}'
      + '.pv-egroup .pv-edit{outline-color:transparent}'
      + '.pv-egroup .pv-edit:hover{outline-color:#CC001A;outline-style:solid}'
      + '.pv-egroup .pv-edit:focus{outline:2px solid #CC001A}'
      /* 줄을 늘리는 손잡이 — 카드 **바깥**에 둔다(카드 안에 넣으면 고객 화면이 달라진다) */
      + '.pv-addrow{display:flex;align-items:center;gap:10px;margin:14px 0 0;flex-wrap:wrap}'
      + '.pv-addbtn{font:inherit;font-size:12px;font-weight:800;color:#CC001A;cursor:pointer;'
      + 'background:#fff;border:1.5px solid #CC001A;padding:5px 12px}'
      + '.pv-addbtn:hover{background:#CC001A;color:#fff}'
      + '.pv-addbtn:disabled{color:#8A8A8A;border-color:#C9C9C9;background:#F7F7F5;cursor:default}'
      + '.pv-addbtn:disabled:hover{background:#F7F7F5;color:#8A8A8A}'
      + '.pv-addtip{font-size:11px;color:#6A6A6A}'
      /* 빈 칸 안내도 색만 쓴다 — 밝은 바탕·어두운 바탕 어디서나 읽히는 중간 회색 */
      + '.pv-edit:empty::before{content:"(비어 있음 — 눌러서 입력)";color:#9A9A9A;font-weight:400}'
      /* 자동으로 만들어진 날은 고칠 것이 없다 — 눌러도 되는 곳과 눈으로 구분한다.
         ⚠ **opacity로 흐리게 하지 말 것.** 예전엔 `.pv-auto{opacity:.72}`였는데, 이 카드의
         머리줄은 검은 바탕에 빨간 "DAY N"이라 흐려지는 순간 대비가 1.75:1로 떨어졌다
         (ai-loop/check_contrast.py가 찾아냈다). 이번 세션에서 같은 실수를 두 번 했다 —
         칸 전체 opacity(방식 A·B 편집 칸)와 배경 덮어쓰기(편집 손잡이).
         자리를 안 차지하는 outline으로 표시하고, 글자는 건드리지 않는다. */
      + '.pv-auto{outline:2px dashed #E0A100;outline-offset:-2px}'
      + '.pv-auto-tag{display:inline-block;font-size:10px;font-weight:800;color:#8A5A00;'
      + 'background:#FFF8E8;border:1px solid #E8D9B0;padding:1px 5px;margin-left:6px}'
      /* ── 설명은 필요할 때만 (RS) ──
         기본은 고객이 보는 그대로다. 자리 이름(.pv-where)과 방식 구분(.pv-plan-lbl)은
         남긴다 — 그것까지 지우면 "이 카드가 고객 화면 어디인지"를 알 수 없다. */
      + 'body:not(.pv-explain) .pv-what,'
      + 'body:not(.pv-explain) .pv-hint,'
      + 'body:not(.pv-explain) .pv-from{display:none}'
      + '</style></head><body></body></html>');
    doc.close();
    return doc;
  }

  /* 한 구역(카드 한 장 분량)을 만든다. 라벨 → 실제 화면 조각 → (기본값 안내) 순. */
  function recPvBlock(doc, where, what) {
    const sec = doc.createElement('section');
    sec.className = 'pv-block';
    const w = doc.createElement('p'); w.className = 'pv-where'; w.textContent = where;
    const t = doc.createElement('p'); t.className = 'pv-what'; t.textContent = what;
    sec.appendChild(w); sec.appendChild(t);
    return sec;
  }
  function recPvNote(doc, cls, text) {
    const p = doc.createElement('p'); p.className = cls; p.textContent = text;
    return p;
  }
  /* 어떤 칸이 비어서 기본 문구로 나가는지 한 줄로 모아 적는다. 칸마다 따로 띄우면
     경고가 너무 많아 아무도 안 읽는다. */
  function recPvFallbackWarn(doc, fallen) {
    if (!fallen.length) return null;
    /* 빈 칸의 결과가 두 가지다 — 기본 문구로 채워지는 것과, 정말 빈칸으로 나가는 것.
       뭉뚱그리면 후자(더 나쁜 쪽)를 놓친다. */
    const fb = fallen.filter((f) => f.fb);
    const blank = fallen.filter((f) => !f.fb);
    const box = doc.createElement('div');
    if (fb.length) {
      box.appendChild(recPvNote(doc, 'pv-warn',
        '⚠ 비어 있어 시스템 기본 문구가 나갑니다 — '
        + fb.map((f) => f.label + '의 “' + f.field + '”').join(', ')
        + '. 위 화면의 그 자리에 보이는 글은 담당자가 쓴 것이 아니고, '
        + '이대로 두면 고객에게 그대로 나갑니다.'));
    }
    if (blank.length) {
      box.appendChild(recPvNote(doc, 'pv-warn pv-warn-hard',
        '⚠ 비어 있어 고객 화면에 **빈칸으로** 나갑니다 — '
        + blank.map((f) => f.label + '의 “' + f.field + '” (' + f.src.where + ')').join(', ')
        + '. 코스에서 오는 값은 비어도 기본 문구로 채워지지 않습니다.'));
    }
    return box.childNodes.length ? box : null;
  }

  /* ════ 이 목적지에서 고객의 방식 A·B가 **실제로** 무엇으로 채워지는가 (RK) ════
     코스가 있으면 코스에서, 없으면 ✨ 방식 A·B에서 온다. 미리보기가 이걸 틀리면
     "여기 쓴 글이 고객 화면 어디로 가는가"를 계속 잘못 알려주게 된다 — 처음 붙였을 때
     실제로 그랬고, 그게 두 화면을 못 맞추던 원인이었다.
     ⚠ 판단·변환 규칙은 rec_fallbacks.js가 안다. 고객 코드(script.js)가 부르는 함수와
     같은 것을 부른다. */
  function recPvSource(plan) {
    const courses = itiState.courses || [];
    const label = ITI_REC_PLAN_LABEL[plan];
    if (!courses.length) {
      return { from: 'rec', data: (recState.rec && recState.rec[plan]) || {}, label,
               where: '✨ 방식 A·B 소개' };
    }
    const prio = (typeof PROGRAM_PRIORITY !== 'undefined' ? PROGRAM_PRIORITY[itiState.destKey] : null) || {};
    const pair = recResolvePlanCourseIdx(courses.length, prio, recPvProgramType());
    const idx = plan === 'a' ? pair[0] : pair[1];
    const course = courses[idx] || {};
    return { from: 'course', data: recPlanFromCourse(course), label, courseIdx: idx,
             where: '📅 날짜별 일정의 코스 ' + String.fromCharCode(65 + idx),
             courseTitle: String(course.title || '(제목 없음)') };
  }

  function recPvProgramType() {
    const sel = document.getElementById('recPvType');
    return sel ? sel.value : 'industry';
  }

  /* 고객이 고를 수 있는 일수. 기본값은 **코스 일수 + 1** — 자동 채움이 처음 나타나는
     지점이라, 열자마자 "내가 쓴 것 말고도 뭔가 나간다"가 바로 보인다. */
  const REC_PV_DAY_CHOICES = [3, 4, 5, 6, 7, 8, 10];
  function recPvDayCount() {
    const sel = document.getElementById('recPvDays');
    return Math.max(1, Number(sel && sel.value) || 5);
  }
  function recPvDefaultDays() {
    const c = (itiState.courses || [])[0];
    const n = (c && Array.isArray(c.days)) ? c.days.length : 0;
    if (!n) return 5;
    let best = REC_PV_DAY_CHOICES[0];
    REC_PV_DAY_CHOICES.forEach((v) => { if (v <= n + 1) best = v; });
    return best;
  }
  function recPvFillDays() {
    const sel = document.getElementById('recPvDays');
    if (!sel) return;
    if (!sel.options.length) {
      REC_PV_DAY_CHOICES.forEach((v) => {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = v + '일';
        sel.appendChild(o);
      });
      sel.addEventListener('change', recPvRender);
    }
    sel.value = String(recPvDefaultDays());
  }

  /* 코스에서 온 값이 비면 고객 화면도 **빈칸**이다(기본 문구로 안 채워진다) —
     rec에서 올 때만 rec_fallbacks.js의 문구가 들어간다. 둘을 구분해서 경고한다. */
  function recPvFill(src, key, fallback) {
    const raw = src.data ? src.data[key] : null;
    if (Array.isArray(fallback)) {
      const v = (Array.isArray(raw) ? raw : []).map((s) => String(s || '').trim()).filter(Boolean);
      if (v.length) return { list: v, empty: false, fb: false };
      return src.from === 'rec' ? { list: fallback, empty: true, fb: true } : { list: [], empty: true, fb: false };
    }
    const v = String(raw == null ? '' : raw).trim();
    if (v) return { text: v, empty: false, fb: false };
    return src.from === 'rec' ? { text: fallback, empty: true, fb: true } : { text: '', empty: true, fb: false };
  }

  /* ════ 미리보기 안에서 바로 고치기 (RS) ═══════════════════════════════════
     직원 입장에서 예전 미리보기는 고객 화면이 아니라 **설명서**였다. 자리마다
     "이 자리는 어디에서 오는가"가 붙어 있어서 정작 고객이 보는 모양이 안 보였고,
     고치려면 창을 닫고 아래 편집 칸에서 그 자리에 해당하는 칸을 **찾아야** 했다.
     찾는 일 자체가 이 화면의 원래 문제였다(RK).

     그래서 뒤집었다 — **고객 화면을 그대로 보여주고, 그 위에서 바로 고친다.**
     담당자는 '카드 배지'를 고칠 뿐이고, 그것이 코스 제목인지 ✨의 방식 이름인지는
     아래 recPvSetter가 판단한다. 그 판단은 RK에서 정리한 규칙 그대로다.

     ⚠ 값은 **textContent로만** 읽는다. innerHTML로 읽으면 붙여넣기 한 번에 서식이
     상태로 들어가고, 그게 그대로 고객 화면에 나간다(결함 생성기 ④).
     ⚠ 자동으로 만들어진 날은 고칠 것이 없다 — 편집 손잡이를 아예 달지 않는다.
     달아 두면 고쳐 놓고 저장했는데 아무 데도 안 남는다(결함 생성기 ②의 반대 방향).
     ═════════════════════════════════════════════════════════════════════ */

  /* 이 자리를 고치면 **실제로 어느 값이 바뀌는가.** null이면 고칠 수 없는 자리다. */
  function recPvSetter(src, plan, key, idx, seed) {
    const label = ITI_REC_PLAN_LABEL[plan];
    if (src.from === 'course') {
      const c = (itiState.courses || [])[src.courseIdx];
      if (!c) return null;
      const at = '📅 코스 ' + String.fromCharCode(65 + src.courseIdx);
      if (key === 'tag') return recPvText2(c, 'title', at + '의 제목', itiMarkDirty, 'tag:' + plan);
      /* ⚠ 한 줄 설명과 기대 효과 문구는 코스에서 올 때 **같은 값**이다(코스의 한 줄
         설명). 하나를 고치면 둘 다 바뀐다 — 숨기면 "왜 저기까지 바뀌지"가 된다. */
      if (key === 'desc' || key === 'value') {
        return recPvText2(c, 'subtitle',
          at + '의 한 줄 설명 (카드 설명과 견적서 문구가 함께 바뀝니다)', itiMarkDirty, key + ':' + plan);
      }
      if (key === 'point') {
        if (!Array.isArray(c.highlights)) c.highlights = [];
        return recPvItem(c.highlights, idx, at + '의 핵심 하이라이트 ' + (idx + 1) + '번째',
          itiMarkDirty, seed, 'point:' + plan + ':' + idx);
      }
      return null;
    }
    const p = (recState.rec && recState.rec[plan]) || null;
    if (!p) return null;
    const at = '✨ ' + label;
    if (key === 'tag')   return recPvText2(p, 'tag',   at + '의 방식 이름', recMarkDirty, 'tag:' + plan);
    if (key === 'desc')  return recPvText2(p, 'desc',  at + '의 한 줄 테마 설명', recMarkDirty, 'desc:' + plan);
    if (key === 'value') return recPvText2(p, 'value', at + '의 기대 효과 문구', recMarkDirty, 'value:' + plan);
    if (key === 'point') {
      if (!Array.isArray(p.points)) p.points = [];
      return recPvItem(p.points, idx, at + '의 핵심 포인트 ' + (idx + 1) + '번째',
        recMarkDirty, seed, 'point:' + plan + ':' + idx);
    }
    return null;
  }
  function recPvText2(obj, field, where, dirty, id) {
    return { id, get: () => String(obj[field] == null ? '' : obj[field]),
             set: (v) => { obj[field] = v; }, where, dirty };
  }
  /* 목록 한 줄. 비우면 그 줄을 **없앤다** — 빈 줄을 남기면 고객 카드에 빈 항목이 뜬다.
     ⚠ 카드에는 앞 3개만 보이지만 배열에는 더 있을 수 있다. 통째로 갈아끼우지 말 것. */
  function recPvItem(arr, idx, where, dirty, seed, id) {
    /* ⚠ 기본 문구가 보이던 자리는 **배열이 비어 있다.** 둘째 줄만 고치고 넘어가면
       배열에 구멍이 생겨(`[비어있음, "값"]`) 저장이 거절되고, 화면에 보이던 다른
       줄들은 조용히 사라진다. 그래서 첫 손질에서 **보이던 목록을 그대로 앉힌다** —
       화면에 보이는 것이 곧 저장되는 것이 된다. */
    const materialize = () => {
      if (seed && seed.length && !arr.length) seed.forEach((s, i) => { arr[i] = s; });
    };
    return {
      id,
      get: () => String(arr[idx] == null ? '' : arr[idx]),
      set: (v) => { materialize(); if (v) arr[idx] = v; else arr.splice(idx, 1); },
      /* 이 줄 **바로 아래**에 빈 줄을 하나 넣는다 (RV). 끝에 붙이지 않는 이유:
         가운데 줄에서 Enter를 눌렀는데 맨 끝에 생기면 어디에 생겼는지 못 찾는다. */
      insertAfter: () => {
        materialize();
        arr.splice(idx + 1, 0, '');
        return idx + 1;
      },
      where, dirty,
    };
  }

  /* 이미 만들어진 일자 카드에 편집 손잡이를 단다.
     ⚠ 카드 자체는 rec_fallbacks.js의 recRenderDayCard가 만든다 — 여기서 다시 조립하면
     고객 화면과 두 벌이 된다(RR에서 합친 것을 도로 가르는 셈). 만들어진 것에 손잡이만
     얹는다. 그래서 클래스로 찾는다. */
  function recPvWireDayCard(doc, card, src, dayData) {
    if (dayData && dayData._auto) {
      /* 자동으로 만들어진 날 — 고칠 값이 없다. 눌러도 아무 데도 안 남으므로 손잡이를
         달지 않고, 대신 **왜 못 고치는지**를 그 자리에서 말한다. */
      card.className += ' pv-auto';
      const num = card.querySelector('.itin-day-num');
      if (num) {
        const tag = doc.createElement('span');
        tag.className = 'pv-auto-tag';
        tag.textContent = '자동';
        tag.title = '코스에 없는 날이라 시스템이 만들었습니다. 고치려면 코스에 일자를 '
          + '추가하거나 ✨ 방식 A·B의 “일별 주요 활동”을 채우세요.';
        num.parentNode.insertBefore(tag, num.nextSibling);
      }
      return card;
    }
    const t = card.querySelector('.itin-day-title');
    if (t) recPvEditable(t, recPvDaySetter(src, dayData, 'title', '그날의 제목'));
    /* 오전·오후·저녁은 한 일자의 세 줄이다 — 점선을 줄마다 치지 않고 본문에 한 겹 (RV).
       ⚠ 제목은 검은 머리줄에 따로 있으므로 이 묶음에 넣지 않는다. */
    const body = card.querySelector('.itin-day-body');
    if (body) body.className += ' pv-egroup';
    const slots = card.querySelectorAll('.itin-slot');
    const MAP = [['am', '오전'], ['pm', '오후'], ['eve', '저녁']];
    /* ⚠ 빈 칸은 줄 자체가 안 그려진다(recRenderDayCard). 그래서 슬롯 순서로 짐작하지
       말고 **시간 라벨을 읽어** 무엇인지 판단한다. 순서로 세면 오후가 비었을 때
       저녁 문장을 오후 칸에 저장하게 된다. */
    slots.forEach((slot) => {
      const time = slot.querySelector('.itin-slot-time');
      const body = slot.querySelector('.itin-slot-content');
      const hit = MAP.find((m) => time && time.textContent.trim() === m[1]);
      if (hit && body) recPvEditable(body, recPvDaySetter(src, dayData, hit[0], hit[1]));
    });
    return card;
  }

  /* 일자 한 칸(제목·오전·오후·저녁·TIP). 자동으로 만들어진 날은 null. */
  function recPvDaySetter(src, dayData, field, fieldLabel) {
    if (!dayData || dayData._auto || src.from !== 'course') return null;
    const c = (itiState.courses || [])[src.courseIdx];
    const day = c && Array.isArray(c.days) ? c.days[dayData._i] : null;
    if (!day) return null;
    return recPvText2(day, field,
      '📅 코스 ' + String.fromCharCode(65 + src.courseIdx) + '의 ' + (dayData._i + 1) + '번째 일자 · ' + fieldLabel,
      itiMarkDirty, 'day:' + src.courseIdx + ':' + dayData._i + ':' + field);
  }

  /* 엘리먼트 하나를 고칠 수 있게 만든다. setter가 null이면 아무것도 하지 않는다. */
  function recPvEditable(el, setter) {
    if (!setter) return el;
    el.className = (el.className ? el.className + ' ' : '') + 'pv-edit';
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('title', '눌러서 고칩니다 — ' + setter.where
      + (setter.insertAfter ? ' (Enter를 누르면 아래에 줄이 하나 생깁니다)' : ''));
    /* ⚠ 자리 이름은 **무엇을 고치는가**로 짓는다(`point:a:2`). 화면을 다시 그려도 같은
       자리를 찾을 수 있어야 방금 만든 줄로 커서를 돌려놓을 수 있다. 그리는 순서로 매기면
       줄을 하나 넣는 순간 뒤 번호가 전부 밀려 엉뚱한 칸에 커서가 간다. */
    el.dataset.pvid = setter.id || '';
    /* 서식이 붙은 붙여넣기는 글자만 남긴다 */
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      const t = (e.clipboardData || el.ownerDocument.defaultView.clipboardData).getData('text/plain');
      el.ownerDocument.execCommand('insertText', false, String(t || '').replace(/\s*\n\s*/g, ' '));
    });
    const commit = () => {
      const next = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (next === setter.get()) return false;
      setter.set(next);
      setter.dirty();
      return true;
    };
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        /* 목록 줄이면 **줄을 하나 늘린다** (RV). 예전엔 Enter가 편집을 끝내기만 해서
           "글자는 고쳐지는데 내용을 추가할 수가 없다"는 상태였다(사용자 지적).
           ⚠ 지금 줄을 먼저 저장하고 나서 넣는다 — 순서를 바꾸면 방금 친 글이 날아간다. */
        if (setter.insertAfter) {
          commit();
          const at = setter.insertAfter();
          setter.dirty();
          recPvAfterEdit(recPvSiblingId(setter.id, at));
          return;
        }
        el.blur();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); el.textContent = setter.get(); el.blur(); }
    });
    el.addEventListener('blur', function () {
      if (commit()) recPvAfterEdit();
    });
    return el;
  }

  /* `point:a:2` → `point:a:3` — 같은 목록의 다른 줄 자리 이름. */
  function recPvSiblingId(id, idx) {
    const parts = String(id || '').split(':');
    if (parts.length < 3) return null;
    parts[parts.length - 1] = String(idx);
    return parts.join(':');
  }

  /* 고친 뒤 — 저장 버튼 상태를 맞추고, 화면을 다시 그린다.
     ⚠ blur 안에서 바로 다시 그리면 **지금 누르고 있던 다음 칸이 사라져** 포커스가
     날아간다. 한 박자 미뤄서 새로 포커스가 잡힌 뒤에 그리고, 그 칸으로 되돌린다
     (itiRenderBodyFocus가 일자 순서 바꾸기에서 쓰는 것과 같은 방법). */
  function recPvAfterEdit(focusId) {
    setTimeout(function () {
      const frame = document.getElementById('recPvFrame');
      const doc = frame && frame.contentDocument;
      const want = focusId || (doc && doc.activeElement && doc.activeElement.dataset
        ? doc.activeElement.dataset.pvid : null);
      /* 아래 편집 칸도 같은 값을 보고 있다 — 함께 갱신하지 않으면 두 화면이 갈라진다 */
      recRenderBody();
      itiRenderBody();
      recPvRender();
      if (want) {
        const next = Array.from(frame.contentDocument.querySelectorAll('[data-pvid]'))
          .find((n) => n.dataset.pvid === want);
        if (next) next.focus();
      }
    }, 0);
  }

  function recPvExplainOn() {
    const c = document.getElementById('recPvExplain');
    return !!(c && c.checked);
  }

  /* 저장은 **고친 구역만** 부른다 — 두 구역은 서로 다른 저장 경로다(QU).
     안 고친 쪽까지 보내면 동료가 방금 고친 것을 조용히 되돌린다. */
  function recPvSyncSave() {
    const btn = document.getElementById('recPvSave');
    if (!btn) return;
    const parts = [];
    if (itiState.dirty) parts.push('📅 날짜별 일정');
    if (recState.dirty) parts.push('✨ 방식 A·B');
    btn.disabled = parts.length === 0;
    btn.textContent = parts.length ? '저장 (' + parts.join(' + ') + ')' : '저장';
  }
  async function recPvSave() {
    const note = document.getElementById('recPvNote');
    const btn = document.getElementById('recPvSave');
    if (btn) btn.disabled = true;
    if (note) note.textContent = '저장 중…';
    try {
      if (itiState.dirty) await itiSave();
      if (recState.dirty) await recSave();
    } finally {
      recPvSyncSave();
      recPvRender();
      if (note) {
        note.textContent = (itiState.dirty || recState.dirty)
          ? '저장하지 못했습니다 — 창을 닫고 아래 구역의 빨간 안내를 확인하세요.'
          : '저장했습니다 — 지금 고객이 보고 있는 그대로입니다.';
      }
    }
  }

  /* ── 구역 ①: 홈페이지 '연수 일정 탐색'의 방식 선택 카드 (tag·desc·points) ──
     RU: 고른 방식 **한 장만** 그린다.
     ⚠ 그래도 `.plan-cards` 그리드는 그대로 둔다. 이 그리드가 2열이라 카드 폭이
     고객 화면과 같아진다(556px). 그리드를 빼고 카드만 놓으면 폭이 두 배가 되어
     줄바꿈 위치가 달라지고, 그 순간 미리보기가 "고객 화면에서도 저렇게 접히나?"를
     헷갈리게 만든다. ai-loop/check_rec_preview.py가 이 폭을 실제 브라우저로 잰다. */
  function recPvPlanCards(doc, rec, only) {
    const sec = recPvBlock(doc, '홈페이지 · 연수 일정 탐색',
      '고객은 방식 A와 B 카드를 나란히 놓고 그중 하나를 고릅니다. 여기서는 고른 탭의 한 장만 보여줍니다.');
    const grid = doc.createElement('div');
    grid.className = 'plan-cards';
    const fallen = [];
    const froms = [];
    let pointCap = null;

    [only].forEach((plan) => {
      const src = recPvSource(plan);
      const p = src.data || {};
      const label = ITI_REC_PLAN_LABEL[plan];
      const card = doc.createElement('div');
      card.className = 'plan-card';
      card.setAttribute('data-plan', plan);

      const hd = doc.createElement('div'); hd.className = 'plan-card-hd';
      const badge = doc.createElement('span');
      badge.className = 'plan-tag plan-tag-' + plan;
      badge.textContent = label;
      const tag = recPvFill(src, 'tag', REC_FALLBACKS.tag[plan]);
      if (tag.empty) fallen.push({ label, field: '방식 이름', fb: tag.fb, src });
      const tagEl = doc.createElement('span');
      tagEl.className = 'plan-type-lbl'; tagEl.textContent = tag.text;
      /* ⚠ 기본 문구가 보이는 자리는 **빈 칸**이다. 그대로 고치게 두면 담당자는 남의 글을
         고치는 줄 알지만 실제로는 빈 칸을 채우는 것이다 — 눌러서 지우고 쓰면 그게 맞다.
         값을 비워 두면 다시 기본 문구로 돌아간다. */
      recPvEditable(tagEl, recPvSetter(src, plan, 'tag'));
      hd.appendChild(badge); hd.appendChild(tagEl);

      const desc = recPvFill(src, 'desc', REC_FALLBACKS.desc);
      if (desc.empty) fallen.push({ label, field: '한 줄 (테마) 설명', fb: desc.fb, src });
      const descEl = doc.createElement('p');
      descEl.className = 'plan-desc'; descEl.textContent = desc.text;
      recPvEditable(descEl, recPvSetter(src, plan, 'desc'));

      const pts = recPvPointRows(src, plan);
      if (pts.empty) fallen.push({ label, field: '핵심 포인트 / 하이라이트', fb: pts.fb, src });
      pointCap = pts;
      const ul = doc.createElement('ul');
      /* 여러 줄이 한 칸이다 — 점선을 줄마다 치지 않고 목록 전체에 한 겹 두른다 (RV) */
      ul.className = 'plan-points pv-egroup';
      pts.rows.forEach((s, i) => {
        const li = doc.createElement('li'); li.textContent = s;
        /* 기본 문구로 채워진 상태면 **보이는 목록 전체**를 씨앗으로 넘긴다 — 첫 수정에서
           보이던 줄들이 그대로 저장된다(recPvItem 주석 참고). */
        recPvEditable(li, recPvSetter(src, plan, 'point', i, pts.fb ? pts.rows : null));
        ul.appendChild(li);
      });

      card.appendChild(hd); card.appendChild(descEl); card.appendChild(ul);
      grid.appendChild(card);
      /* 출처는 **그리드 바깥**에 모아 적는다. 카드 안에 넣으면 고객이 보는 모양이
         달라지고, 그리드 안에 넣으면 칸이 늘어 두 장 나란히가 깨진다(실제로 깨졌다).
         이 한 줄이 "어디를 고쳐야 이 자리가 바뀌는가"를 말해준다 (RK). */
      froms.push(label + ' ← ' + src.where
        + (src.from === 'course' ? ' “' + src.courseTitle + '”' : ''));
    });

    /* 빈 두 번째 칸에 **고객이 실제로 보는 배치**를 알려 둔다 (RU).
       탭으로 나누면서 카드 오른쪽이 비는데, 그냥 두면 "고객도 한 장만 보나?"로 읽힌다.
       고객은 두 장을 나란히 놓고 고른다 — 그 사실이 이 자리에서 보여야 한다.
       ⚠ `.pv-*` 이므로 고객 클래스가 아니다. `.plan-card`가 아니라서 카드 개수·폭
       검사에도 걸리지 않는다(check_rec_preview.py). */
    const other = only === 'a' ? 'b' : 'a';
    const ghost = doc.createElement('button');
    ghost.type = 'button';
    ghost.className = 'pv-ghost';
    const g1 = doc.createElement('span');
    g1.className = 'pv-ghost-t';
    g1.textContent = '고객 화면에서는 여기에';
    const g2 = doc.createElement('span');
    g2.className = 'pv-ghost-b';
    g2.textContent = ITI_REC_PLAN_LABEL[other] + ' 카드가 나란히 놓입니다';
    const g3 = doc.createElement('span');
    g3.className = 'pv-ghost-go';
    g3.textContent = ITI_REC_PLAN_LABEL[other] + ' 보기 →';
    ghost.appendChild(g1); ghost.appendChild(g2); ghost.appendChild(g3);
    /* 눌러서 그 탭으로 넘어간다 — 같은 창 안에서 오가는 것이 이 화면의 목적이다.
       iframe이지만 우리가 만든 엘리먼트라 부모 코드에 그대로 이어 붙일 수 있다. */
    ghost.addEventListener('click', () => recPvGoPlan(other));
    grid.appendChild(ghost);

    sec.appendChild(grid);

    /* 줄을 늘리는 손잡이 (RV). Enter로도 되지만 **보이지 않는 손잡이는 없는 것과 같다** —
       특히 목록이 통째로 비어 있으면(코스 하이라이트가 없는 경우) 누를 줄 자체가 없다.
       ⚠ 카드 **바깥**에 둔다. 카드 안에 넣으면 고객이 보는 카드 높이가 달라진다. */
    const addRow = doc.createElement('div');
    addRow.className = 'pv-addrow';
    const addBtn = doc.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'pv-addbtn';
    addBtn.textContent = '＋ 핵심 포인트 줄 추가';
    const full = !!(pointCap && pointCap.cap && pointCap.live.length >= pointCap.cap);
    if (full) { addBtn.disabled = true; addBtn.className += ' is-full'; }
    addBtn.addEventListener('click', () => recPvAddPoint(only));
    const tip = doc.createElement('span');
    tip.className = 'pv-addtip';
    /* 상한에 걸렸을 때 조용히 안 늘어나면 "눌렀는데 아무 일도 안 일어난다"가 된다.
       왜 못 늘리는지, 그래도 넣고 싶으면 어디로 가야 하는지까지 적는다. */
    tip.textContent = full
      ? '고객 카드에는 ' + pointCap.cap + '줄까지 나옵니다. 더 넣으려면 📅 날짜별 일정의 '
        + '「핵심 하이라이트」에 넣으세요 — 카드에는 안 나오지만 남는 날을 채우는 데 쓰입니다.'
      : '줄 끝에서 Enter를 눌러도 아래에 줄이 생깁니다. 줄을 비우고 나가면 그 줄이 없어집니다.';
    addRow.appendChild(addBtn); addRow.appendChild(tip);
    sec.appendChild(addRow);

    froms.forEach((f) => sec.appendChild(recPvNote(doc, 'pv-from', f)));
    sec.appendChild(recPvNote(doc, 'pv-hint',
      '고객 화면에서는 이 카드가 다른 방식 카드와 **나란히 두 장** 놓입니다. 카드 폭은 그때와 같게 맞춰 두었습니다. '
      + '고객이 카드를 고르면 빨간 테두리가 붙습니다. 사진은 목적지에 등록된 것이 자동으로 올라가며 여기서는 생략했습니다.'));
    const warn = recPvFallbackWarn(doc, fallen);
    if (warn) sec.appendChild(warn);
    return sec;
  }

  /* ── 구역 ②: 고객 견적서의 결재 보고서 기대 효과 문구 (value) ── */
  function recPvValueBoxes(doc, rec, only) {
    const sec = recPvBlock(doc, '고객 견적서 · 결재 보고용',
      '고객이 회사에 결재를 올릴 때 그대로 붙여 쓰는 문장입니다.');
    const fallen = [];
    [only].forEach((plan) => {
      const src = recPvSource(plan);
      const label = ITI_REC_PLAN_LABEL[plan];
      const v = recPvFill(src, 'value', REC_FALLBACKS.value);
      if (v.empty) fallen.push({ label, field: '기대 효과 문구 / 코스 한 줄 설명', fb: v.fb, src });

      const group = doc.createElement('div'); group.className = 'pv-group';
      const lbl = doc.createElement('p');
      lbl.className = 'pv-plan-lbl';
      lbl.textContent = label + '을 고른 고객이 보는 문구 · ' + src.where + '에서 옵니다';
      const box = doc.createElement('div'); box.className = 'plan-value-box';
      const body = doc.createElement('div'); body.className = 'plan-value-body';
      const cap = doc.createElement('p');
      cap.className = 'plan-value-label'; cap.textContent = '결재 보고서 기대 효과 문구';
      const txt = doc.createElement('p');
      txt.className = 'plan-value-text'; txt.textContent = v.text;
      recPvEditable(txt, recPvSetter(src, plan, 'value'));
      body.appendChild(cap); body.appendChild(txt); box.appendChild(body);
      group.appendChild(lbl); group.appendChild(box);
      sec.appendChild(group);
    });
    const warn = recPvFallbackWarn(doc, fallen);
    if (warn) sec.appendChild(warn);
    return sec;
  }

  /* ── 구역 ③: 고객이 실제로 보는 일자별 일정 (RR) ──
     예전엔 이 구역이 '남는 날에 어떤 활동명이 돌아가며 들어가는지'만 보여줬다.
     정작 담당자가 시간을 가장 많이 쓰는 **오전·오후·저녁 문장은 하나도 안 보였다.**
     이유가 "조립 규칙이 script.js 안에 있고 경로에 따라 두 벌이라 옮겨 적을 수 없다"
     였는데, 그 두 벌을 rec_fallbacks.js 하나로 합쳤다(RR). 이제 고객 화면과
     **같은 함수**(recBuildDisplayDays·recRenderDayCard)를 불러 그대로 그린다.
     ⚠ 여기서 카드를 직접 조립하지 말 것 — 그 순간 다시 두 벌이 된다(결함 생성기 ①). */
  function recPvDayCards(doc, only) {
    const days = recPvDayCount();
    const sec = recPvBlock(doc, '홈페이지 · 연수 일정 탐색 → 선택 플랜 일정',
      '고객이 ' + days + '일을 고르면 이 일정이 그대로 보입니다. '
      + '같은 내용이 고객 견적서의 일정표에도 나갑니다(모양만 다릅니다).');

    const fallen = [];
    [only].forEach((plan) => {
      const src = recPvSource(plan);
      const label = ITI_REC_PLAN_LABEL[plan];
      /* 코스가 있으면 **그 방식이 실제로 쓰는 코스**로 그린다. 예전 미리보기는 A·B 모두
         courses[0]의 하이라이트를 보여줬는데, 방식 B는 보통 코스 B에서 온다. */
      const course = src.from === 'course' ? (itiState.courses || [])[src.courseIdx] : null;
      const items = ((recState.rec && recState.rec[plan]) || {}).items;

      const lbl = doc.createElement('p');
      lbl.className = 'pv-plan-lbl';
      lbl.textContent = label + ' — ' + src.where
        + (src.from === 'course' ? ' “' + src.courseTitle + '”' : '') + '에서 옵니다';
      sec.appendChild(lbl);

      const list = recBuildDisplayDays(course, items, days, itiState.destKey);
      const wrap = doc.createElement('div');
      wrap.className = 'day-timeline';
      list.forEach((d, i) => {
        const card = recRenderDayCard(doc, i + 1, d, days);
        recPvWireDayCard(doc, card, src, d);
        wrap.appendChild(card);
      });
      sec.appendChild(wrap);

      /* 담당자가 쓴 일자가 몇 개고, 자동으로 채워진 날이 몇 개인지 숫자로 말한다.
         "내가 쓴 게 다 나간다"는 오해가 여기서 생긴다. */
      const authored = course && Array.isArray(course.days) ? course.days.length : 0;
      const autoFilled = Math.max(0, days - Math.max(authored, 1));
      if (autoFilled > 0) {
        fallen.push({ label, field: autoFilled + '일치가 자동 문구', fb: true,
          src: { where: authored ? '코스가 ' + authored + '일뿐' : '코스 없음' } });
      }
    });

    sec.appendChild(recPvNote(doc, 'pv-hint',
      '코스의 마지막 일자는 **항상 실제 마지막 날(귀국일)로** 밀려납니다. '
      + '고객이 코스보다 긴 일수를 고르면 그 사이 날은 ✨ 방식 A·B의 “일별 주요 활동”으로, '
      + '그것도 비어 있으면 코스의 핵심 하이라이트로 자동으로 채워집니다. '
      + '위 “고객이 고른 일수”를 바꿔 가며 확인하세요.'));
    if (fallen.length) {
      sec.appendChild(recPvNote(doc, 'pv-warn',
        '⚠ 이 일수에서는 담당자가 쓰지 않은 자동 문구가 섞여 나갑니다 — '
        + fallen.map((f) => f.label + ': ' + f.field + ' (' + f.src.where + ')').join(', ')
        + '. 자동 문구가 마음에 걸리면 코스에 일자를 더 넣거나 ✨ 방식 A·B의 '
        + '“일별 주요 활동”을 채우세요.'));
    }
    return sec;
  }

  function recPvRender() {
    const frame = document.getElementById('recPvFrame');
    const doc = recPvBootFrame(frame);
    /* 설명을 켜고 끄는 것은 **CSS 한 줄**이다 — 두 벌로 그리면 한쪽만 고치게 된다 */
    const plan = recPvPlan();
    doc.body.className = (recPvExplainOn() ? 'pv-explain ' : '') + 'pv-plan-' + plan;
    const rec = recState.rec;
    doc.body.appendChild(recPvPlanCards(doc, rec, plan));
    doc.body.appendChild(recPvValueBoxes(doc, rec, plan));
    doc.body.appendChild(recPvDayCards(doc, plan));
    recPvRenderMap();
    recPvRenderTabs();
    recPvSyncSave();
  }

  /* 지금 보고 있는 방식 (RU). 탭이 없으면 A로 본다 — 이 함수를 부르는 곳이 모두
     "한 방식"을 전제하므로, 못 찾았을 때 둘 다 그리는 상태로 돌아가면 안 된다. */
  function recPvPlan() {
    const on = document.querySelector('.recpv-tab.active');
    const v = on && on.dataset ? on.dataset.pvplan : '';
    return v === 'b' ? 'b' : 'a';
  }

  /* 탭에 **그 방식이 어디서 오는지**를 적는다 (RU).
     탭 이름만 있으면 "방식 A가 코스 A인가?"를 매번 다시 확인해야 한다 — 프로그램
     유형에 따라 짝이 바뀌기 때문이다(RK). 탭에 적어 두면 그 질문이 사라진다. */
  /* 카드에 그릴 포인트 줄 (RV).
     ⚠ 화면에는 **빈 줄도 그린다.** 방금 만든 줄이 안 보이면 거기에 쓸 수가 없다
     (`recPvFill`은 고객이 보는 결과를 내므로 빈 줄을 걸러 낸다 — 그게 맞지만 편집에는 못 쓴다).
     빈 줄은 저장할 때 서버가 지운다(normalizeRec·normalizeCourses).
     ⚠ 코스에서 올 때 고객 카드는 **앞 3개만** 쓴다(recPlanFromCourse). 그래서 4번째를
     넣어도 카드에는 안 나온다 — 여기서 상한을 알려 주지 않으면 "넣었는데 왜 안 보이지"가 된다. */
  function recPvPointRows(src, plan) {
    const shown = recPvFill(src, 'points', REC_FALLBACKS.points);   /* 경고 판단은 이쪽이 안다 */
    const live = src.from === 'course'
      ? (((itiState.courses || [])[src.courseIdx] || {}).highlights || [])
      : (((recState.rec || {})[plan] || {}).points || []);
    const cap = src.from === 'course' ? 3 : 0;    /* 0이면 상한 없음 */
    if (!live.length) {
      return { rows: shown.list, fb: shown.fb, empty: shown.empty, cap, live };
    }
    return { rows: cap ? live.slice(0, cap) : live.slice(), fb: false, empty: shown.empty, cap, live };
  }

  /* 목록 맨 끝에 빈 줄을 하나 붙이고 그 줄로 커서를 옮긴다 (RV).
     ⚠ 목록이 통째로 비어 있을 때도 동작해야 한다 — 그때가 이 손잡이가 꼭 필요한 때다.
     ⚠ 화면에 기본 문구가 보이고 있었다면 그 문구부터 배열에 앉힌다(recPvItem과 같은 규칙).
        안 그러면 보이던 세 줄이 사라지고 빈 줄 하나만 남는다. */
  function recPvAddPoint(plan) {
    const src = recPvSource(plan);
    const arr = src.from === 'course'
      ? (((itiState.courses || [])[src.courseIdx] || {}).highlights)
      : (((recState.rec || {})[plan] || {}).points);
    if (!Array.isArray(arr)) return;
    const rows = recPvPointRows(src, plan);
    if (rows.cap && arr.length >= rows.cap) return;   /* 카드가 못 보여주는 줄은 안 만든다 */
    if (!arr.length && rows.fb) rows.rows.forEach((s, i) => { arr[i] = s; });
    arr.push('');
    (src.from === 'course' ? itiMarkDirty : recMarkDirty)();
    recPvAfterEdit('point:' + plan + ':' + (arr.length - 1));
  }

  /* 탭을 옮기는 **유일한 경로** (RU). 탭 단추도, 미리보기 안의 안내도 이걸 부른다 —
     고르는 곳이 둘인데 표시를 각자 바꾸면 언젠가 어긋난다. */
  function recPvGoPlan(plan) {
    const t = Array.from(document.querySelectorAll('.recpv-tab'))
      .find((x) => x.dataset.pvplan === plan);
    if (t) t.click();
  }

  function recPvRenderTabs() {
    REC_PV_PLANS.forEach((plan) => {
      const el = document.getElementById('recPvTabSub' + plan.toUpperCase());
      if (!el) return;
      const src = recPvSource(plan);
      el.textContent = src.from === 'course'
        ? '코스 ' + String.fromCharCode(65 + src.courseIdx)
        : '✨ 방식 A·B 소개';
    });
  }

  /* 지금 고른 유형에서 코스 ↔ 방식이 어떻게 짝지어지는지 한 줄로 (RK). */
  function recPvRenderMap() {
    const el = document.getElementById('recPvMap');
    if (!el) return;
    const courses = itiState.courses || [];
    if (!courses.length) {
      el.textContent = '이 목적지는 코스가 없어 ✨ 방식 A·B의 내용이 그대로 나갑니다.';
      return;
    }
    const a = recPvSource('a'), b = recPvSource('b');
    el.textContent = '방식 A = 코스 ' + String.fromCharCode(65 + a.courseIdx)
      + ' · 방식 B = 코스 ' + String.fromCharCode(65 + b.courseIdx);
  }

  function recPvFillTypes() {
    const sel = document.getElementById('recPvType');
    if (!sel || sel.options.length || typeof PROGRAM_TYPES === 'undefined') return;
    Object.keys(PROGRAM_TYPES).forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = PROGRAM_TYPES[k].label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', recPvRender);
  }

  function recPreviewOpen() {
    if (!itiState.destKey) { recSetMsg('목적지를 먼저 고르세요.', 'err'); return; }
    recPvFillTypes();
    recPvFillDays();
    document.getElementById('recPvDest').textContent = itiState.destKey;
    /* 저장 전 내용을 보고 있다는 것을 분명히 한다 — 미리보기를 보고 "반영됐다"고
       읽으면 저장을 건너뛴다. ⚠ 두 구역 중 **어느 쪽이라도** 저장 전이면 말해야 한다.
       미리보기가 이제 코스(📅)도 함께 보여주기 때문이다. */
    const unsaved = recState.dirty || itiState.dirty;
    document.getElementById('recPvNote').textContent = (unsaved
      ? '지금 화면에서 고치는 중인 내용입니다 (아직 저장하지 않았습니다). 저장해야 고객에게 나갑니다.'
      : '지금 저장되어 있는 내용입니다 — 고객이 지금 보고 있는 그대로입니다.')
      + ' 아래 글을 눌러 바로 고칠 수 있습니다.';
    document.getElementById('recPvModal').classList.remove('hidden');
    recPvRender();
  }
  function recPreviewClose() {
    document.getElementById('recPvModal').classList.add('hidden');
  }

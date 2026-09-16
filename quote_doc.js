/* ═══════════════════════════════════════════════════════════════════════════
   견적서 공통 모듈 — **견적서를 그리는 곳은 여기 하나다**
   ───────────────────────────────────────────────────────────────────────────
   2026-09-15 대표 지시(견적산출 3분류 개편, 요구 5):
   「화면별로 견적서를 각각 그리면 안 된다. 견적서를 생성하는 공통 모듈을 하나만 만들고,
     각 화면은 데이터만 넘긴다.」

   ■ 이 파일이 생긴 이유 — 이 저장소가 같은 일로 네 번 당했다
   지금 견적서는 **두 벌**이다: 팝업 문서(`script.js`의 `openEstimateWindow`)와
   링크 견적서(`estimate-view.html`). 같은 내용을 서로 다른 코드가 그린다.
   그래서 한쪽만 고쳐진 사고가 반복됐다 — XC·XD·XP·WQ가 전부 그 유형이다
   (`CLAUDE.md` 결함 생성기 ①: 「목록이 여러 곳에 흩어져 하나를 빠뜨린다」).
   🔴 **새 화면을 그 위에 하나 더 얹으면 세 벌이 된다.** 그래서 먼저 이 모듈을 만든다.

   ■ 무엇이 진실인가
   · **규격**   `QuoteDoc.blank()`이 돌려주는 모양 하나가 견적서 1건의 전부다.
   · **변환**   화면은 자기 입력을 `fromEngine`/`fromAdhoc`으로 이 규격에 맞춰 넘긴다.
   · **그리기** `renderQuote` / `renderItinerary` 둘만 HTML을 만든다.

   ■ 🔴 내부 전용 필드는 **밑줄로 시작하는 키**다
   대표 지시: 「공유 링크로 접속한 고객에게는 원가, 마진, 내부 메모 등 내부 전용 필드가
   절대 노출되지 않아야 한다. 내부 필드와 고객 노출 필드를 데이터 규격 단계에서 명확히
   분리한다.」
   → 규칙을 **한 글자**로 정했다: `_`로 시작하는 키는 내부 전용이다.
     `stripInternal(doc)`이 깊이 상관없이 전부 지운다. 고객에게 나가는 자리
     (`quote_shares.payload`)에는 **반드시 이 함수를 통과한 것만** 싣는다.
   ⚠ 지금 `script.js`의 `rows.filter(r => !r.muted)` 한 줄이 하던 방어를 **규격 단계로
     올린 것**이다. 그 줄은 그대로 둔다 — 옛 경로(v1)는 여전히 그 줄이 지킨다.

   ■ 기준 문서
   출력 모양은 **2026-09-15 대표가 첨부한 견적서 이미지**가 기준이다. 항목명·순서·
   표기 단위를 그대로 옮겼다. 다만 대표가 빼라고 한 둘은 없다:
     · **카드 결제시 3% UP** — 「카드결제 내용 없애줘」
     · **수수료(여행사 알선수수료)** — 「알선수수료 만들지 말아줘」
   그리고 이미지의 로고·주소는 TRIP PAGE / PAGE ONE인데, 우리 이름은 **비즈페이지**다
   (대표 확인). 담당자 이름·연락처·메일은 **공란**이다 — 직원이 직접 적는다(대표 지시).

   ■ 브라우저와 Node 양쪽에서 쓴다
   화면 셋(`admin-quote-pro.html`·`estimate-view.html`·`admin.html`)이 `<script>`로 싣고,
   검사(`ai-loop/test_z*.js`)는 `require`로 싣는다. 그래서 전역 오염 없이 양쪽에 붙인다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuoteDoc = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* 규격 번호. 옛 공유 payload는 `v:1`이고 **그대로 살아 있다** — 이 모듈이 만드는
     문서는 `v:2`이며, `estimate-view.html`은 `doc`이 있으면 이쪽으로, 없으면 옛 경로로
     그린다. 옛 링크가 이미 고객 손에 나가 있으므로 v1을 없앨 수 없다. */
  const SPEC = 2;

  /* ── 글자 안전 ── 공개 입력이 그대로 렌더되던 사고가 이 저장소에 있었다
     (`CLAUDE.md` 결함 생성기 ④). 문자열은 **예외 없이** 이걸 거친다. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 줄바꿈을 살려야 하는 칸(항공 편명 두 줄 등)에만 쓴다. esc를 먼저 거친 뒤 <br>로 바꾼다. */
  function escLines(s) { return esc(s).replace(/\r?\n/g, '<br>'); }

  const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');

  /* ── 「일금 오백이십오만 원정」 ──
     기준 이미지의 합계요금 칸이 한글 금액이다. 계약 문서에서 숫자 위조를 막는 관행이라
     모양만 흉내 내면 뜻이 없다 — 표준 한자어 읽기를 그대로 구현한다.
     ⚠ **「일십」·「일백」·「일천」은 쓰지 않는다**(십·백·천). 다만 만 단위 앞의 「일만」은
       남긴다(1만 = 일만). 이게 한국어 금액 표기 관행이다. */
  const HAN_D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const HAN_U = ['', '십', '백', '천'];
  const HAN_G = ['', '만', '억', '조', '경'];
  function hangulAmount(n) {
    let v = Math.floor(Math.abs(Number(n) || 0));
    if (v === 0) return '일금 영 원정';
    const neg = (Number(n) || 0) < 0;
    let g = 0; const parts = [];
    while (v > 0) {
      const chunk = v % 10000;
      if (chunk > 0) {
        let s = '';
        for (let i = 3; i >= 0; i--) {
          const d = Math.floor(chunk / Math.pow(10, i)) % 10;
          if (!d) continue;
          /* 십·백·천 자리의 1은 숫자를 안 읽는다 (일십 ✗ → 십 ✓) */
          s += (d === 1 && i > 0 ? '' : HAN_D[d]) + HAN_U[i];
        }
        parts.unshift(s + HAN_G[g]);
      }
      v = Math.floor(v / 10000); g++;
    }
    return '일금 ' + (neg ? '마이너스 ' : '') + parts.join('') + ' 원정';
  }

  /* ── 기간 표기 ── 이미지의 「3박 5일」. 0박은 「당일」. */
  function durationLabel(nights, days) {
    const nt = Math.max(0, Number(nights) || 0);
    const dy = Math.max(0, Number(days) || 0);
    if (!dy) return '';
    return nt > 0 ? nt + '박 ' + dy + '일' : '당일';
  }

  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  /* 이미지의 「2026-01-01 (목)」 */
  function dateLabel(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return esc(iso || '');
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return esc(iso);
    return iso + ' (' + DOW[d.getDay()] + ')';
  }

  /* ═══ 규격 ═══════════════════════════════════════════════════════════════
     견적서 1건의 전부. **여기 없는 칸은 견적서에 없다.**
     ⚠ 새 칸을 늘릴 때는 `blank()`·`normalize()`·렌더러 셋을 함께 늘린다. */
  function blank() {
    return {
      v: SPEC,
      meta: {
        vendor: '비즈페이지',   /* 대표 확인 2026-09-15 — 이미지의 TRIP PAGE 자리 */
        client: '',             /* 거래처명 — 제목 줄에 들어간다 */
        regionLabel: '',        /* 「국가명_지역명」 */
        quoteNo: '',
        issueDate: '',
        validUntil: '',
        /* 🔴 **공란이 기본이다** (대표 지시) — 직원이 자기 이름·연락처를 직접 적는다.
           회사 대표번호를 기본값으로 박아 두면 아무도 안 고치고 그대로 나간다. */
        staffName: '', staffTel: '', staffEmail: '',
      },
      trip: {
        orgName: '',            /* 단체명 */
        startDate: '', endDate: '',
        nights: 0, days: 0,
        region: '',             /* 개요표의 「지역」 */
        stayLabel: '',          /* 「숙박지」 — 이미지 예: 지역명(3) */
        pax: 0,
      },
      /* 견적가 — 이미지의 성인/아동/유아 3줄.
         🔴 **아동·유아는 성인과 같은 단가다** (대표 지시 2026-09-15). 감액률을 임의로
           넣지 않는다 — 넣으면 그 추정치가 견적서에 찍혀 사실로 굳는다. */
      price: {
        lines: [],              /* {kind, label, unit, qty, amount} */
        condition: '',          /* 이미지 우측 칸. FOC가 있으면 「10+1조건」 */
        fuelNote: '',           /* 「#00월 기준 유류할증료 적용 기준」 */
        total: 0,
      },
      options: [],              /* 선택 옵션 — {name, unit, qty, amount, note} */
      details: [],              /* 상세 내용 — {label, rows:[{left,right,text,note,accent}], footnotes:[]} */
      itinerary: [],            /* 일정표 — {day, date, title, am, pm, eve, meals, stay, note} */
      remarks: '',
      cancelPolicy: '',         /* 취소규정 — 기준 이미지에 없다. 공란이면 안 그린다 */
      /* 🔴 밑줄로 시작 = 내부 전용. `stripInternal`이 지운다. */
      _internal: {
        source: '',             /* 'engine' | 'adhoc' */
        cost: 0, margin: 0,
        memo: '',
        engineRows: [],         /* 자동 산출 원본 행 (원가·마진 포함) */
        overrides: [],          /* {key, label, autoAmount, amount} — 직원이 덮어쓴 항목 */
        adjust: [],             /* 실무 변수 조정 — FOC·싱글차지·항공BD·지상비·인솔자 */
      },
    };
  }

  /* ═══ 파생값 다시 계산 ═══════════════════════════════════════════════════
     🔴 **합계를 입력값으로 받지 않는다.** 받으면 줄 금액과 합계가 어긋난 문서가 저장되고,
       그건 나중에 어느 쪽이 맞는지 알 방법이 없다. 항상 여기서 다시 센다. */
  function normalize(doc) {
    const d = Object.assign(blank(), doc || {});
    d.v = SPEC;
    d.meta = Object.assign(blank().meta, d.meta || {});
    d.trip = Object.assign(blank().trip, d.trip || {});
    d.price = Object.assign(blank().price, d.price || {});
    d._internal = Object.assign(blank()._internal, d._internal || {});
    d.options = Array.isArray(d.options) ? d.options : [];
    d.details = Array.isArray(d.details) ? d.details : [];
    d.itinerary = Array.isArray(d.itinerary) ? d.itinerary : [];

    /* 🔴 **박수를 일수에서 강제로 만들지 않는다.**
       처음엔 `nights = days - 1`로 박았는데, 기준 이미지가 바로 그 반례다 —
       01-01 출발 / 01-05 도착(5일)인데 표기는 **「3박 5일」**이다. 장거리는 **기내 1박**이
       있어 호텔 박수가 하루 적다. 일수에서 기계적으로 만들면 그 문서가 전부 「4박 5일」로
       찍히고, 담당자는 고칠 방법이 없다.
       → 박수는 **입력값**이다. 안 주면 `days - 1`로 채우기만 하고, 준 값은 그대로 쓴다.
       ⚠ 견적 엔진(`script.js`)의 호텔 계산은 지금도 `days - 1`이다 — 그건 **금액**이고
         이 칸은 **표기**다. 둘을 같은 칸으로 묶지 않는다. */
    d.trip.days = Math.max(0, Math.floor(Number(d.trip.days) || 0));
    const nRaw = (doc && doc.trip) ? doc.trip.nights : undefined;
    d.trip.nights = (nRaw === undefined || nRaw === null || nRaw === '' || isNaN(Number(nRaw)))
      ? (d.trip.days > 0 ? d.trip.days - 1 : 0)
      : Math.max(0, Math.floor(Number(nRaw)));
    d.trip.pax = Math.max(0, Math.floor(Number(d.trip.pax) || 0));

    /* 견적가 줄: 금액 = 단가 × 인원.
       🔴 **10+1은 단가에 이미 반영돼 있다**(대표 결정 2026-09-15, 방식 A).
         그래서 여기서 무료 인원을 빼지 않는다 — 빼면 이중 할인이 된다. */
    d.price.lines = (Array.isArray(d.price.lines) ? d.price.lines : []).map((l) => {
      const unit = Math.round(Number(l.unit) || 0);
      const qty = Math.max(0, Math.floor(Number(l.qty) || 0));
      return { kind: l.kind || 'adult', label: l.label || '성인', unit, qty, amount: unit * qty };
    });
    d.price.total = d.price.lines.reduce((s, l) => s + l.amount, 0);
    d.price.totalHangul = hangulAmount(d.price.total);

    d.options = d.options.map((o, i) => {
      const unit = Math.round(Number(o.unit) || 0);
      const qty = Math.max(0, Math.floor(Number(o.qty) || 0));
      return { label: o.label || ('선택' + (i + 1)), name: o.name || '', unit, qty, amount: unit * qty, note: o.note || '' };
    });

    d.details = d.details.map((s) => ({
      label: s.label || '',
      note: s.note || '',
      rows: (Array.isArray(s.rows) ? s.rows : []).map((r) => ({
        left: r.left || '', right: r.right || '', text: r.text || '',
        note: r.note != null ? r.note : (s.note || ''), accent: r.accent || '',
      })),
      footnotes: Array.isArray(s.footnotes) ? s.footnotes.slice() : [],
    }));

    d.itinerary = d.itinerary.map((it, i) => ({
      day: Number(it.day) || (i + 1), date: it.date || '', title: it.title || '',
      am: it.am || '', pm: it.pm || '', eve: it.eve || '',
      meals: Object.assign({ b: '', l: '', d: '' }, it.meals || {}),
      stay: it.stay || '', note: it.note || '',
    }));

    /* 기간·제목 표기 — 문서 어디서도 따로 적지 않는다 */
    d.trip.durationLabel = durationLabel(d.trip.nights, d.trip.days);
    d.meta.title = [d.meta.client, '해외연수 견적서', d.meta.regionLabel]
      .filter((x) => x && String(x).trim()).join('_');
    return d;
  }

  /* ═══ 🔴 내부 전용 필드 제거 ═══════════════════════════════════════════════
     `_`로 시작하는 키를 **깊이 상관없이** 지운다. 고객에게 나가는 payload는 반드시
     이걸 통과한다. 배열 안의 객체도 본다 — 조정 항목이 배열 안에 있기 때문이다. */
  function stripInternal(v) {
    if (Array.isArray(v)) return v.map(stripInternal);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach((k) => { if (k.charAt(0) !== '_') out[k] = stripInternal(v[k]); });
      return out;
    }
    return v;
  }
  /* 내부 필드가 남아 있는지 되묻는 자. 검사와 발급 코드가 같은 자를 쓴다. */
  function findInternalKeys(v, path) {
    const hits = [];
    const walk = (x, p) => {
      if (Array.isArray(x)) return x.forEach((e, i) => walk(e, p + '[' + i + ']'));
      if (x && typeof x === 'object') {
        Object.keys(x).forEach((k) => {
          if (k.charAt(0) === '_') hits.push(p + '.' + k);
          else walk(x[k], p + '.' + k);
        });
      }
    };
    walk(v, path || '');
    return hits;
  }

  /* ═══ 그리기 ═════════════════════════════════════════════════════════════
     🔴 **HTML을 만드는 곳은 아래 둘뿐이다.** 화면에서 따로 그리기 시작하면 이 파일을
       만든 이유가 사라진다 — 지금 두 벌인 견적서가 세 벌이 된다.

     ⚠ 표의 열 수는 **6개로 고정**이다. 기준 이미지의 개요표·선택옵션표가 같은 격자를
       쓰고 있어서(담당자가 두 표를 눈으로 잇는다) 한쪽만 바꾸면 줄이 어긋난다.
     🔴 폭은 **브라우저로 그려 보고 고친 값**이다. 처음엔 이미지에서 잰 경계를 그대로
       썼는데(c1 16·c2 11·…), 실제로 그리니 **「2026-01-01 (목)」이 두 줄로 접히고**
       선택옵션의 「호텔 1인실 사용(유료)」도 접혔다. 이미지는 폰트가 달라 같은 %에서
       글자가 더 들어간다 — 소스만 보고 맞췄으면 접힌 채로 나갔을 자리다.
       그래서 개요표와 선택옵션표는 **폭이 조금 다르다**(열 수는 같다). */
  const COLS_OV = [14, 15, 19, 8, 24, 20];
  const COLS_OPT = [12, 20, 18, 7, 23, 20];
  const colgroup = (w) => '<colgroup>' + w.map((x) => `<col style="width:${x}%">`).join('') + '</colgroup>';
  function company(opts) {
    const o = (opts && opts.company) || (typeof window !== 'undefined' && window.COMPANY_INFO) || {};
    return o;
  }

  function overviewHtml(d, opts) {
    const c = company(opts);
    const money = (n) => '<span class="qd-w">₩</span> ' + won(n) + ' 원';
    const lines = d.price.lines.length
      ? d.price.lines
      /* 줄이 하나도 없으면 표가 무너진다. 「아직 안 정해짐」을 **그 자리에서 말한다**
         (결함 생성기 ②: 조용한 폴백 금지). */
      : [{ label: '성인', unit: 0, qty: d.trip.pax, amount: 0, _empty: true }];

    const priceRows = lines.map((l, i) => `
      <tr>
        ${i === 0 ? `<th class="qd-th" rowspan="${lines.length}">견적가</th>` : ''}
        <th class="qd-th qd-sub">${esc(l.label)}</th>
        <td class="qd-num">${l._empty ? '<span class="qd-todo">미입력</span>' : money(l.unit)}</td>
        <td class="qd-mid">${won(l.qty)}명</td>
        <td class="qd-num">${l._empty ? '<span class="qd-todo">미입력</span>' : money(l.amount)}</td>
        ${i === 0 ? `<td class="qd-mid" rowspan="${lines.length}">${esc(d.price.condition)}</td>` : ''}
      </tr>`).join('');

    return `
    <table class="qd-t qd-ov">
      ${colgroup(COLS_OV)}
      <tbody>
        <tr>
          <th class="qd-th">단체명</th>
          <td class="qd-mid" colspan="2">${esc(d.trip.orgName)}</td>
          <th class="qd-th" colspan="2">견적서 작성일자</th>
          <td class="qd-mid">${esc(d.meta.issueDate)}</td>
        </tr>
        <tr>
          <th class="qd-th">출발일</th>
          <td class="qd-mid">${dateLabel(d.trip.startDate)}</td>
          <td class="qd-mid" rowspan="2">${esc(d.trip.durationLabel)}</td>
          <th class="qd-th">지역</th>
          <td class="qd-mid" colspan="2">${esc(d.trip.region)}</td>
        </tr>
        <tr>
          <th class="qd-th">도착일</th>
          <td class="qd-mid">${dateLabel(d.trip.endDate)}</td>
          <th class="qd-th">숙박지</th>
          <td class="qd-mid" colspan="2">${esc(d.trip.stayLabel)}</td>
        </tr>
        <tr>
          <th class="qd-th" colspan="2">여행인원</th>
          <td class="qd-mid" colspan="4">${won(d.trip.pax)}명</td>
        </tr>
        ${priceRows}
        <tr>
          <th class="qd-th" colspan="2">합계요금</th>
          <td class="qd-mid qd-bold">${esc(d.price.totalHangul.replace(/^일금 /, '일금 '))}</td>
          <td class="qd-num qd-bold" colspan="3">${money(d.price.total)}</td>
        </tr>
      </tbody>
    </table>
    ${d.price.fuelNote ? `<p class="qd-fuel">${esc(d.price.fuelNote)}</p>` : ''}`;
  }

  function optionsHtml(d) {
    if (!d.options.length) return '';
    const money = (n) => '<span class="qd-w">₩</span> ' + won(n) + ' 원';
    return `
    <h2 class="qd-h2">선택 옵션 <em>(선택 사항으로 필요 시 별도 요청이 필요합니다.)</em></h2>
    <table class="qd-t qd-opt">
      ${colgroup(COLS_OPT)}
      <tbody>
        ${d.options.map((o) => `
        <tr>
          <th class="qd-oth">${esc(o.label)}</th>
          <td class="qd-mid">${esc(o.name)}</td>
          <td class="qd-num">${money(o.unit)}</td>
          <td class="qd-mid">${won(o.qty)}명</td>
          <td class="qd-num">${o.qty ? money(o.amount) : '<span class="qd-w">₩</span> 원'}</td>
          <td class="qd-mid">${esc(o.note)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  /* 상세 내용 — **비고 칸의 세로 병합이 핵심이다.**
     기준 이미지에서 「전 일정 포함」 하나가 기사/차량·가이드·인솔자·식사·입장료·
     여행자보험 **여섯 항목에 걸쳐** 한 칸으로 묶여 있다. 항목 안에서만 묶으면 그 모양이
     안 나온다 — 그래서 **표 전체를 한 줄로 펴서** 이웃한 같은 비고를 묶는다. */
  function detailsHtml(d) {
    if (!d.details.length) return '';
    /* ① 물리적인 줄로 편다 */
    const phys = [];
    d.details.forEach((s, si) => {
      const n = s.rows.length + (s.footnotes.length ? 1 : 0);
      s.rows.forEach((r, ri) => {
        phys.push({ si, label: s.label, first: ri === 0, span: n, row: r, note: r.note });
      });
      if (s.footnotes.length) {
        phys.push({
          si, label: s.label, first: s.rows.length === 0, span: n, foot: s.footnotes,
          /* 각주 줄의 비고는 **바로 위 줄과 같다** — 이미지에서 「LCC」가 편명 줄과
             각주 줄에 걸쳐 한 칸이다. */
          note: s.rows.length ? s.rows[s.rows.length - 1].note : (s.note || ''),
        });
      }
    });
    /* ② 이웃한 같은 비고를 묶는다 */
    for (let i = 0; i < phys.length;) {
      let j = i;
      while (j + 1 < phys.length && phys[j + 1].note === phys[i].note) j++;
      phys[i].noteFirst = true; phys[i].noteSpan = j - i + 1;
      for (let k = i + 1; k <= j; k++) phys[k].noteFirst = false;
      i = j + 1;
    }

    const body = phys.map((p) => {
      const item = p.first ? `<th class="qd-th qd-dl" rowspan="${p.span}">${esc(p.label)}</th>` : '';
      let content;
      if (p.foot) {
        content = `<td class="qd-foot" colspan="2">${p.foot.map((f) => escLines(f)).join('<br>')}</td>`;
      } else if (p.row.left) {
        content = `<td class="qd-mid">${escLines(p.row.left)}</td>`
                + `<td class="qd-mid qd-flt">${escLines(p.row.right)}</td>`;
      } else {
        const cls = p.row.accent === 'red' ? ' qd-red' : (p.row.accent === 'blue' ? ' qd-blue' : '');
        content = `<td class="qd-mid${cls}" colspan="2">${escLines(p.row.text || p.row.right)}</td>`;
      }
      const noteCls = (p.note || '').indexOf('사후정산') >= 0 ? ' qd-red' : '';
      const note = p.noteFirst
        ? `<td class="qd-mid${noteCls}" rowspan="${p.noteSpan}">${escLines(p.note)}</td>` : '';
      return `<tr>${item}${content}${note}</tr>`;
    }).join('');

    return `
    <h2 class="qd-h2">상세 내용</h2>
    <table class="qd-t qd-det">
      <colgroup><col style="width:17%"><col style="width:33%"><col style="width:31%"><col style="width:19%"></colgroup>
      <thead><tr><th class="qd-th">항목</th><th class="qd-th" colspan="2">내 &nbsp; &nbsp; 용</th><th class="qd-th">비고</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function headHtml(d, opts) {
    const c = company(opts);
    /* 담당자 칸은 **공란일 수 있다**(대표 지시). 비어 있으면 「미입력」으로 보이게 둔다 —
       조용히 감추면 담당자가 빠뜨린 줄 모르고 그대로 보낸다(결함 생성기 ②). */
    const todo = (v) => v ? esc(v) : '<span class="qd-todo">미입력</span>';
    return `
    <header class="qd-head">
      <div class="qd-brand">${esc(c.brand || d.meta.vendor || '비즈페이지')}</div>
      <div class="qd-corp">
        ${c.legalName ? `<div class="qd-corp-n">${esc(c.legalName)}</div>` : ''}
        ${c.address ? `<div>${esc(c.address)}</div>` : ''}
        ${c.address2 ? `<div>${esc(c.address2)}</div>` : ''}
        ${c.tel ? `<div>Tel. ${esc(c.tel)}</div>` : ''}
      </div>
    </header>
    <h1 class="qd-title">${esc(d.meta.title || '해외연수 견적서')}</h1>
    <div class="qd-staff">
      <div><span>담당자 (연락처) :</span> ${todo(d.meta.staffName)}${d.meta.staffTel ? ' (' + esc(d.meta.staffTel) + ')' : ''}</div>
      <div><span>E-mail :</span> ${todo(d.meta.staffEmail)}</div>
    </div>`;
  }

  /* ── 견적서 ── */
  function renderQuote(docIn, opts) {
    const d = normalize(docIn);
    const c = company(opts);
    return `<article class="qd">
      ${headHtml(d, opts)}
      <h2 class="qd-h2">개요</h2>
      ${overviewHtml(d, opts)}
      ${optionsHtml(d)}
      ${detailsHtml(d)}
      ${d.remarks ? `<h2 class="qd-h2">비고</h2><div class="qd-free">${escLines(d.remarks)}</div>` : ''}
      ${d.cancelPolicy ? `<h2 class="qd-h2">취소 규정</h2><div class="qd-free">${escLines(d.cancelPolicy)}</div>` : ''}
      <footer class="qd-foot-bar">
        <span class="qd-brand qd-brand-sm">${esc(c.brand || d.meta.vendor || '비즈페이지')}</span>
        ${d.meta.quoteNo ? `<span class="qd-qno">견적번호 ${esc(d.meta.quoteNo)}</span>` : ''}
        ${d.meta.validUntil ? `<span class="qd-qno">유효기간 ${esc(d.meta.validUntil)}</span>` : ''}
      </footer>
    </article>`;
  }

  /* ── 일정표 ──
     대표 지시 2026-09-15: 「견적서 이외에 일정표가 마찬가지로 생성이 되어야 한다.」
     그리고 「같은 링크의 다른 탭」으로 낸다(대표 결정). **입력은 한 번**이다 —
     이 함수는 `renderQuote`와 **같은 `doc.itinerary`**를 읽는다(요구 3: 두 번 작성 금지). */
  function renderItinerary(docIn, opts) {
    const d = normalize(docIn);
    const c = company(opts);
    if (!d.itinerary.length) {
      return `<article class="qd"><div class="qd-empty">
        <b>아직 일정이 없습니다.</b>
        <span>견적 작성 화면의 「일정」 칸에 일자별 내용을 적으면 여기에 함께 나옵니다.</span>
      </div></article>`;
    }
    const meal = (m) => [m.b && '조식 ' + m.b, m.l && '중식 ' + m.l, m.d && '석식 ' + m.d]
      .filter(Boolean).join(' · ');
    return `<article class="qd">
      ${headHtml(d, opts)}
      <h2 class="qd-h2">일정표</h2>
      <table class="qd-t qd-iti">
        <colgroup><col style="width:11%"><col style="width:13%"><col style="width:52%"><col style="width:24%"></colgroup>
        <thead><tr><th class="qd-th">일자</th><th class="qd-th">지역</th><th class="qd-th">일정</th><th class="qd-th">식사 · 숙박</th></tr></thead>
        <tbody>
        ${d.itinerary.map((it) => `
          <tr>
            <th class="qd-th qd-day">DAY ${won(it.day)}${it.date ? `<span class="qd-day-d">${esc(it.date)}</span>` : ''}</th>
            <td class="qd-mid">${escLines(it.title)}</td>
            <td class="qd-iti-b">
              ${it.am ? `<div><b>오전</b> ${escLines(it.am)}</div>` : ''}
              ${it.pm ? `<div><b>오후</b> ${escLines(it.pm)}</div>` : ''}
              ${it.eve ? `<div><b>저녁</b> ${escLines(it.eve)}</div>` : ''}
              ${it.note ? `<div class="qd-iti-n">${escLines(it.note)}</div>` : ''}
            </td>
            <td class="qd-mid qd-sm">
              ${meal(it.meals) ? `<div>${esc(meal(it.meals))}</div>` : ''}
              ${it.stay ? `<div><b>숙박</b> ${esc(it.stay)}</div>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      <footer class="qd-foot-bar">
        <span class="qd-brand qd-brand-sm">${esc(c.brand || d.meta.vendor || '비즈페이지')}</span>
        ${d.meta.quoteNo ? `<span class="qd-qno">견적번호 ${esc(d.meta.quoteNo)}</span>` : ''}
      </footer>
    </article>`;
  }

  return {
    SPEC, esc, escLines, won, hangulAmount, durationLabel, dateLabel,
    blank, normalize, stripInternal, findInternalKeys,
    renderQuote, renderItinerary,
  };
});

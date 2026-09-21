/* ═══════════════════════════════════════════════════════════════════════════
   새 견적서를 **대표가 눈으로 보게** 뽑는 자 (2026-09-21)
   ───────────────────────────────────────────────────────────────────────────
   대표 지시로 세부견적서·롤링 페이지·보낼 것 고르기를 만들었는데, **대표는 아직
   그 화면을 본 적이 없다.** 승인은 설명만 듣고 한 것이다.
   → 실제로 올 법한 손님 조건으로 견적을 뽑아 **고객이 받는 화면 그대로** 파일로 남긴다.

   🔴 **여기서 견적서를 다시 그리지 않는다.** `estimate-view.html`을 진짜로 띄워
     그 페이지가 그린 결과를 찍는다. 내가 따로 그리면 「대표가 본 것」과
     「고객이 받는 것」이 갈린다 — 이 도구의 존재 이유가 바로 그 자리다.
   🔴 **운영 DB에 아무것도 안 만든다.** 발급 경로를 안 탄다(`?preview=1` +
     sessionStorage). 견적번호도 안 쓴다.
   ⚠ 이 도구가 통과했다고 「프로덕션에서 사람이 눌러 봤다」가 아니다.

   실행: node ai-loop/shoot_new_quote_docs.js
   결과: 바탕화면 `새견적서_보기\` — 손님마다 조합 4가지 + `_보기.html`
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { bootEngine } = require('./_engine_boot');
const { bootPage, ROOT } = require('./_page_boot');
const QDOC = require(path.join(ROOT, 'quote_doc.js'));

const OUT = path.join(os.homedir(), 'Desktop', '새견적서_보기');

/* 실제로 올 법한 손님. 🔴 **코퍼스에 실제로 있는 성격**으로 골랐다 —
   금융권 연수(고객 명단이 그쪽이다) · 포상여행 골프 · 공공기관 장거리. */
const GUESTS = [
  { id: '1_금융권연수_다낭', client: '굿리치', org: '굿리치 마케팅본부 해외연수단',
    t: { dest: '다낭', pax: 30, days: 5, date: '2026-11-10' }, spec: {} },
  { id: '2_포상여행골프_코타키나발루', client: '한화손해보험', org: '한화손해보험 우수직원 포상',
    t: { dest: '코타키나발루', pax: 16, days: 5, date: '2026-12-08' },
    spec: { golf: true, golfCount: 8, golfRounds: 2 } },
  { id: '3_공공기관_파리', client: '경기신용보증재단', org: '경기신용보증재단 해외연수단',
    t: { dest: '파리', pax: 20, days: 8, date: '2027-05-18' },
    spec: { hotelGrade: 'deluxe', cabinClass: 'mixed', bizCount: 3 } },
];

/* 담당자가 고를 수 있는 조합 네 가지 (견적서는 항상 포함 — 대표 결정) */
const COMBOS = [
  { key: 'A_견적서만', parts: { breakdown: false, iti: false }, label: '견적서' },
  { key: 'B_견적서_일정표', parts: { breakdown: false, iti: true }, label: '견적서 + 일정표' },
  { key: 'C_견적서_세부견적서', parts: { breakdown: true, iti: false }, label: '견적서 + 세부견적서' },
  { key: 'D_셋다', parts: { breakdown: true, iti: true }, label: '견적서 + 세부견적서 + 일정표' },
];

const won = (n) => Number(n || 0).toLocaleString('ko-KR');

/* 담당자가 자동 산출 → 저장할 때 만드는 문서와 **같은 모양**으로 짓는다.
   ⚠ `admin-quote-pro.html`의 `buildDoc`이 하는 일을 옮긴 자리라 두 벌이다.
     그래서 아래 [검산]에서 **항목합 = 총액**을 손님마다 다시 확인한다. */
function buildDoc(g, bd) {
  const visible = (bd.rows || []).filter((r) => !r.muted)
    .map((r) => ({ name: r.name, qty: r.qty, amount: r.amount }));
  const d = QDOC.blank();
  d.meta.client = g.client;
  d.meta.regionLabel = g.t.dest;
  d.meta.quoteNo = 'BZ-샘플-' + g.id.slice(0, 1);
  d.meta.issueDate = '2026-09-21';
  d.meta.validUntil = '2026-10-05';
  d.meta.staffName = '(담당자 이름)';
  d.meta.staffTel = '02-0000-0000';
  d.meta.staffEmail = 'name@hanatrabiz.com';
  d.trip.orgName = g.org;
  d.trip.startDate = g.t.date;
  d.trip.days = g.t.days;
  d.trip.nights = bd.nights;
  d.trip.region = g.t.dest;
  d.trip.stayLabel = g.t.dest + '(' + bd.nights + ')';
  d.trip.pax = g.t.pax;
  d.price.lines = [{ kind: 'adult', label: '성인', unit: bd.perPerson, qty: g.t.pax }];
  d.price.condition = '10+1조건';
  d.price.fuelNote = '#9월 기준 유류할증료 적용 기준';
  d.breakdown = { rows: QDOC.allocateBreakdown(visible, bd.total) };
  d.details = QDOC.standardDetails(visible.map((r) => r.name), { nights: bd.nights });
  /* 일정 — 모양을 보는 것이 목적이라 초안을 깐다(실제 코스는 일정 관리에서 나온다) */
  d.itinerary = Array.from({ length: g.t.days }, (_, i) => ({
    day: i + 1,
    date: '',
    title: i === 0 ? ('인천 → ' + g.t.dest)
      : (i === g.t.days - 1 ? (g.t.dest + ' → 인천') : (g.t.dest + ' 일정')),
    am: i === 0 ? '인천공항 집결 · 출국' : '(오전 일정)',
    pm: i === g.t.days - 1 ? '인천 도착' : '(오후 일정)',
    eve: '',
    meals: { b: i === 0 ? '기내식' : '호텔식', l: '현지식', d: '현지식' },
    stay: i === g.t.days - 1 ? '' : (g.t.dest + ' 호텔'),
    note: '',
  }));
  return QDOC.normalize(d);
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  console.log('══ 새 견적서 뽑기 — 고객이 받는 화면 그대로 ══');
  const E = await bootEngine({ quiet: true });   /* 운영 요율을 얹는다 = 고객이 겪는 금액 */
  const made = [];
  const problems = [];
  const css = fs.readFileSync(path.join(ROOT, 'quote_doc.css'), 'utf8');

  for (const g of GUESTS) {
    const bd = E.run(g.t, g.spec);
    if (!bd) { problems.push(g.id + ': 산출 실패'); continue; }
    const doc = buildDoc(g, bd);

    /* [검산] 🔴 항목합 = 총액인가 — 대기열 0-w가 되살아나면 여기서 걸린다 */
    if (!doc.breakdown.matchesTotal) {
      problems.push(g.id + ': 🔴 항목합(' + won(doc.breakdown.sum) + ') ≠ 총액(' + won(doc.price.total) + ')');
    }

    const dir = path.join(OUT, g.id);
    fs.mkdirSync(dir, { recursive: true });

    for (const c of COMBOS) {
      /* 서버가 발급 때 하는 일과 **같은 함수**로 깎는다 */
      const safe = QDOC.applyParts(QDOC.stripInternal(doc), c.parts);
      const leaks = QDOC.findInternalKeys(safe);
      if (leaks.length) {
        problems.push(g.id + '/' + c.key + ': 🔴 내부 항목이 남았다 — ' + leaks.join(', '));
        continue;
      }
      const payload = {
        v: 1, dk: g.t.dest, dt: g.t.dest, org: g.org,
        n: g.t.pax, d: g.t.days, ng: bd.nights, t: bd.total, pp: bd.perPerson,
        sd: g.t.date, iso: '2026-09-21', qno: doc.meta.quoteNo, id: 'sample',
        doc: safe,
      };

      /* 🔴 **진짜 페이지를 띄워 찍는다** */
      const b = bootPage('estimate-view.html', {
        query: '?preview=1',
        beforeBoot(w) { w.sessionStorage.setItem('bizpage_preview_share', JSON.stringify(payload)); },
      });
      await b.ready;
      await b.tick(250);
      const D = b.doc;

      const has = (id) => !!D.getElementById(id);
      /* [검산] 고른 것만 실렸는가 — 화면으로 되묻는다 */
      if (!has('qdvQuote')) problems.push(g.id + '/' + c.key + ': 🔴 견적서 구역이 없다');
      if (has('qdvBd') !== !!c.parts.breakdown) problems.push(g.id + '/' + c.key + ': 🔴 세부견적서가 체크와 다르다');
      if (has('qdvIti') !== !!c.parts.iti) problems.push(g.id + '/' + c.key + ': 🔴 일정표가 체크와 다르다');
      if (b.log.errors.length) problems.push(g.id + '/' + c.key + ': 콘솔 오류 — ' + b.log.errors[0].msg);

      /* 파일로 남길 때 바깥 자원을 끊는다 — 인터넷 없이 더블클릭해도 그대로 보여야 한다.
         CSS는 파일에 박아 넣는다(상대경로가 안 먹는 폴더에 두기 때문이다). */
      let html = D.documentElement.outerHTML;
      html = html.replace(/<link[^>]+fonts\.googleapis[^>]*>/g, '');
      html = html.replace(/<script[^>]*(cdn\.jsdelivr|quote_doc\.js|company-info\.js)[^>]*><\/script>/g, '');
      html = html.replace(/<link[^>]+quote_doc\.css[^>]*>/, '<style>' + css + '</style>');
      fs.writeFileSync(path.join(dir, c.key + '.html'), html, 'utf8');
    }
    made.push({ g, bd, doc });
    console.log('  ' + (g.id + '                                   ').slice(0, 34)
      + won(bd.total).padStart(13) + '원 · 1인 ' + won(bd.perPerson).padStart(10) + '원'
      + ' · 세부 ' + doc.breakdown.rows.length + '줄');
  }

  const idx = '<!doctype html><html lang="ko"><meta charset="utf-8">\n'
    + '<title>새 견적서 보기 — 2026-09-21</title>\n'
    + '<style>\n'
    + " body{font-family:'Malgun Gothic',sans-serif;max-width:880px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}\n"
    + ' h1{font-size:23px;margin:0 0 6px} .sub{color:#777;font-size:14px;margin:0 0 26px}\n'
    + ' .g{border:1px solid #DDD;padding:16px 18px;margin-bottom:16px}\n'
    + ' .g h2{font-size:16px;margin:0 0 4px} .amt{color:#514dc2;font-weight:700}\n'
    + ' .meta{color:#777;font-size:13px;margin:0 0 12px}\n'
    + ' a.c{display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border:1.5px solid #514dc2;color:#514dc2;'
    + 'text-decoration:none;font-size:13px;font-weight:700;border-radius:4px}\n'
    + ' a.c:hover{background:#514dc2;color:#fff}\n'
    + ' .note{background:#FAF9F7;border-left:3px solid #514dc2;padding:13px 17px;font-size:13.5px;margin:22px 0}\n'
    + ' .bad{background:#FFF4F5;border-left-color:#CC001A}\n'
    + '</style>\n'
    + '<h1>새 견적서 보기</h1>\n'
    + '<p class="sub">2026-09-21 · 고객이 받는 화면 <b>그대로</b>입니다. 아무거나 눌러 보세요.</p>\n'
    + '<div class="note"><b>무엇이 달라졌나</b><br>\n'
    + ' ① 견적서·세부견적서·일정표가 <b>한 페이지에 죽</b> 이어집니다(예전엔 탭이라 안 누르면 못 봤습니다).<br>\n'
    + ' ② <b>세부견적서</b>가 새로 생겼습니다 — 항목별 금액표입니다. <b>다 더하면 총액과 1원까지 맞습니다.</b><br>\n'
    + ' ③ 담당자가 <b>체크해서 고른 것만</b> 나갑니다. 아래 네 가지가 그 조합입니다.</div>\n'
    + made.map(function (m) {
      return '<div class="g">\n <h2>' + m.g.client + ' — ' + m.g.t.dest + ' ' + m.g.t.pax + '명 ' + m.g.t.days + '일</h2>\n'
        + ' <p class="meta">' + m.g.org + ' · ' + m.g.t.date + ' 출발 · 총액 <span class="amt">' + won(m.bd.total)
        + '원</span> · 1인 ' + won(m.bd.perPerson) + '원 · 세부견적서 ' + m.doc.breakdown.rows.length + '줄</p>\n'
        + COMBOS.map(function (c) {
          return ' <a class="c" href="' + encodeURIComponent(m.g.id) + '/' + encodeURIComponent(c.key) + '.html">' + c.label + '</a>';
        }).join('\n') + '\n</div>';
    }).join('\n')
    + '\n<div class="note' + (problems.length ? ' bad' : '') + '"><b>자가 검산</b> — '
    + (problems.length ? '🔴 확인할 것 ' + problems.length + '건' : '✅ 이상 없음') + '<br>\n'
    + (problems.length ? problems.map(function (x) { return '· ' + x; }).join('<br>\n')
      : '항목합 = 총액 · 체크한 것만 실림 · 내부 항목(원가·마진) 유출 0 · 콘솔 오류 0')
    + '</div>\n'
    + '<p class="sub">⚠ <b>로컬 샘플</b>입니다. 운영 DB에 아무것도 안 만들었고 견적번호도 안 썼습니다.</p>\n</html>';
  fs.writeFileSync(path.join(OUT, '_보기.html'), idx, 'utf8');

  console.log('');
  console.log('── 자가 검산 ──');
  if (problems.length) problems.forEach(function (x) { console.log('  🔴 ' + x); });
  else console.log('  ✅ 항목합 = 총액 · 체크한 것만 실림 · 내부 항목 유출 0 · 콘솔 오류 0');
  console.log('');
  console.log('열어 보실 곳: ' + path.join(OUT, '_보기.html'));
  process.exit(problems.length ? 1 : 0);
})().catch(function (e) { console.log('🔴 터짐: ' + e.message); console.log(e.stack); process.exit(1); });

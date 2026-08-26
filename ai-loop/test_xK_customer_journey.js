/* ═══════════════════════════════════════════════════════════════════════════
   XK — 고객이 밟는 길을 **끝까지 밟아 보는** 검사
   ───────────────────────────────────────────────────────────────────────────
   대표 지시(2026-08-26): 「고객의 입장에서 버튼 하나하나 다 눌러서, 최적화되어
   서비스가 제공되는지 전부 확인하라.」

   ■ 여기서 지키는 것

     ① 「엑셀」이 **남의 CDN에 걸려 빈손으로 끝나지 않는다**
        고객은 기업·공공기관 담당자다. 그 망에서는 외부 CDN이 정책으로 막혀 있는
        경우가 흔한데, 예전 코드는 그때 「잠시 후 다시 시도해 주세요」로 끝났다 —
        **잠시 후에도 영영 안 된다.** 이제 CSV로 떨어진다(엑셀에서 그대로 열린다).
     ② 그 CDN 스크립트가 **첫 화면을 막지 않는다**(`defer`). `index.html`에서는
        하필 `script.js` 바로 앞에 있어서, 400KB를 다 받기 전에는 **계산기 자체가
        살아나지 않았다.**
     ③ 고객 주력 경로가 **끝까지 간다** — 폼 → 계산 → 견적서 링크(담당자 확인이 아니라)
     ④ 패키지 경로도 끝까지 간다 — 목록 → 상세 → 발급 → 견적서 화면
     ⑤ 문의가 **접수됐다고 말한다**
     ⑥ 견적서 문서에 금액·견적번호·유효기간·항목이 **실제로 보인다**

   ⚠ 화면을 띄우는 코드는 `_page_boot.js` 하나를 쓴다 — 도구마다 한 벌씩 만들면
     그 도구만 조용히 다른 것을 재게 된다(결함 생성기 ①).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { bootPage, visibleText, ROOT, soon } = require('./_page_boot');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const done = () => {
  console.log('\n' + '─'.repeat(64));
  console.log(`결과: ${pass} pass / ${fail} fail  — XK 고객이 밟는 길`);
  process.exit(fail ? 1 : 0);
};
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const PAGES_WITH_EXCEL = ['index.html', 'estimate-view.html', 'admin-quote.html'];

console.log('\n[1] 「엑셀」을 부르는 화면은 **셋** — 셋 다 같은 자를 싣는다');
{
  PAGES_WITH_EXCEL.forEach((f) => {
    const s = read(f);
    ok('① ' + f + ' 가 sheet_download.js를 싣는다', /<script src="sheet_download\.js">/.test(s));
    /* 🔴 남의 CDN이 첫 화면을 막지 않는다 */
    ok('① ' + f + ' 의 CDN 엑셀 스크립트는 defer다',
      /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx/.test(s)
      || !/cdn\.jsdelivr\.net\/npm\/xlsx/.test(s));
  });
  /* 🔴 **남의 서버 스크립트가 첫 화면을 막지 않는다** (XM).
     `<script src="https://…">`를 그냥 두면 브라우저는 그 파일을 다 받을 때까지
     문서 파싱을 멈춘다 — 아이콘·엑셀 라이브러리 하나 때문에 **화면 전체가** 기다린다.
     기관·대기업 망에서 그 CDN이 느리거나 막혀 있으면 그동안 흰 화면이다.
   ⚠ 새 화면을 만들 때 여기서 걸린다. `defer`를 붙였으면 그 파일을 쓰는 **호출 시점**도
     같이 옮겼는지 확인할 것(안 옮기면 아이콘이 통째로 안 그려진다). */
  ['index.html', 'packages.html', 'estimate-view.html', 'admin.html', 'admin-quote.html', '404.html'].forEach((f) => {
    const s = read(f);
    const blocking = (s.match(/<script(?![^>]*\b(defer|async)\b)[^>]*src="https?:\/\/[^"]+"/g) || []);
    ok('① ' + f + ' 는 바깥 스크립트로 첫 화면을 막지 않는다', blocking.length === 0,
      blocking.join(' | ').slice(0, 160));
  });

  /* ⚠ 로직을 화면마다 다시 적지 않았는지 — 적으면 한쪽만 고쳐진다 */
  const dl = read('sheet_download.js');
  ok('① 갈라 주는 자가 파일 하나로 있다', /function downloadSheet/.test(dl) && /function toCsv/.test(dl));
  ok('① 화면들은 그 함수를 부르기만 한다',
    !/XLSX\.writeFile/.test(read('script.js')) && !/XLSX\.writeFile/.test(read('estimate-view.html')),
    'XLSX.writeFile이 화면에 남아 있다');
}

console.log('\n[2] CSV로 떨어질 때의 내용 — 엑셀이 열 수 있어야 한다');
{
  /* 브라우저 없이 변환만 잰다 */
  const src = read('sheet_download.js');
  const win = { document: null };
  const mod = { window: win };
  new Function('window', 'document', src)(win, { createElement: () => ({}), body: { appendChild() {}, removeChild() {} } });
  const csv = win.__toCsv([['제목'], ['항목', '금액'], ['현지, 가이드', 1200], ['"특가"', 0], ['줄\n바꿈', '']]);
  ok('② BOM으로 시작한다(없으면 엑셀에서 한글이 깨진다)', csv.charCodeAt(0) === 0xFEFF);
  ok('② 쉼표가 든 칸은 따옴표로 감싼다', csv.includes('"현지, 가이드"'));
  ok('② 따옴표는 두 번으로 이스케이프한다', csv.includes('"""특가"""'));
  ok('② 줄바꿈이 든 칸도 감싼다', /"줄\n바꿈"/.test(csv));
  ok('② 줄 구분은 CRLF다(엑셀 기본)', csv.split('\r\n').length >= 4, JSON.stringify(csv.slice(0, 40)));
}

(async () => {
  console.log('\n[3] 🔴 고객 주력 경로 — 폼에서 견적서 링크까지 실제로 눌러 본다');
  const B = bootPage('index.html');
  const { win, doc, log, tick } = B;
  await B.ready; await tick(300);

  ok('③ 화면이 오류 없이 떴다', log.errors.length === 0, log.errors.map((e) => e.msg).slice(0, 3).join(' | '));
  ok('③ 견적 엔진이 살아 있다(CDN을 안 기다린다)', typeof win.getBreakdownData === 'function');
  ok('③ 엑셀 라이브러리 없이도 다운로드 함수는 있다',
    typeof win.XLSX === 'undefined' && typeof win.downloadSheet === 'function');

  const dep = new Date(); dep.setDate(dep.getDate() + 90);
  const set = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new win.Event('change', { bubbles: true })); } };
  set('destination', '다낭'); set('participants', '30'); set('days', '4');
  set('startDate', dep.toISOString().slice(0, 10));
  doc.querySelectorAll('#estimateForm [required]').forEach((el) => {
    if (String(el.value || '').trim()) return;
    if (el.tagName === 'SELECT') el.value = el.options[el.options.length - 1].value;
    else if (el.type === 'tel') el.value = '010-1234-5678';
    else el.value = '테스트 기관';
  });
  doc.getElementById('estimateForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await tick(300);

  const rec = win._lastQuoteRecord;
  ok('③ 견적이 계산됐다', !!rec && rec.total > 0, rec && String(rec.total));
  ok('③ 계산 결과가 서버로 저장 요청됐다', log.requests.some((r) => r.url.includes('/api/quotes')));
  ok('③ 확인 패널이 다음 걸음을 안내한다',
    /견적서 받기|일정 살펴보기/.test(visibleText(doc.getElementById('estimateConfirm'))));

  /* 「엑셀로 다운로드」 — XLSX가 없는 상태에서 눌러 본다(= CDN이 막힌 고객) */
  const xl = doc.getElementById('downloadEstimateExcel');
  ok('③ 엑셀 버튼이 보인다', !!xl && !xl.classList.contains('hidden'));
  if (xl) {
    const before = log.downloads.length;
    xl.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
    await tick(60);
    ok('③ 🔴 CDN이 막혀도 파일이 나간다(CSV)', log.downloads.length === before + 1,
      '저장 ' + (log.downloads.length - before) + '번');
    ok('③ 그리고 CSV로 나갔다고 말해 준다',
      log.says.some((s) => /CSV/.test(s.text)), JSON.stringify(log.says.map((s) => s.text)));
    ok('③ 「잠시 후 다시 시도」로 끝나지 않는다',
      !log.says.some((s) => /잠시 후 다시 시도/.test(s.text)));
  }

  /* 「견적서 확인하기」 — 새 창이 열리고 **링크**가 나와야 한다(XJ 이전에는 늘 「담당자 확인」) */
  const dl = doc.getElementById('downloadEstimate');
  ok('③ 견적서 버튼이 보인다', !!dl && !dl.classList.contains('hidden'));
  if (dl) {
    dl.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win }));
    await tick(400);
    ok('③ 견적서 창이 열렸다', log.opened.length === 1);
    const w = log.opened[0];
    if (w) {
      const inp = w.document.getElementById('share-url-inp');
      const ready = w.document.getElementById('share-ready');
      const review = w.document.getElementById('share-review');
      ok('③ 🔴 고객이 링크를 받는다', !!inp && /estimate-view\.html\?id=/.test(inp.value), inp && inp.value);
      ok('③ 「담당자 확인이 필요합니다」로 안 떨어진다',
        ready && ready.style.display !== 'none' && review && review.style.display === 'none',
        'ready=' + (ready && ready.style.display) + ' review=' + (review && review.style.display));
    }
    const req = log.requests.find((r) => r.url.includes('quote-shares'));
    ok('③ 요청에 견적 스냅샷이 실린다', !!(req && req.body && req.body.quote));
    /* 🔴 WC의 규칙 — 연락처는 payload가 아니라 바깥 칸이다 */
    ok('③ 연락처는 견적서 payload에 안 들어간다',
      !!(req && req.body && req.body.customerTel) && !JSON.stringify(req.body.share).match(/010-1234-5678/));
  }

  console.log('\n[4] 문의 — 보내면 「접수됐다」고 말하는가');
  {
    const f = doc.getElementById('inqForm');
    ok('④ 문의 폼이 있다', !!f);
    if (f) {
      doc.getElementById('inqName').value = '김보균';
      doc.getElementById('inqOrg').value = '한빛교회';
      doc.getElementById('inqTel').value = '010-1234-5678';
      doc.getElementById('inqMsg').value = '10월 워크숍 문의드립니다.';
      const before = log.requests.length;
      f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
      await tick(200);
      ok('④ 서버로 보낸다', log.requests.slice(before).some((r) => r.url.includes('/api/inquiries')));
      const okEl = doc.getElementById('inqSuccess');
      ok('④ 접수됐다고 화면이 말한다', !!okEl && !okEl.classList.contains('hidden')
        && visibleText(okEl).length > 0, visibleText(okEl).slice(0, 60));
      ok('④ 폼이 비워졌다(두 번 보내기 방지)', doc.getElementById('inqName').value === '');
    }
  }

  console.log('\n[5] 패키지 경로 — 목록에서 견적서까지');
  {
    const P = bootPage('packages.html');
    await P.ready; await P.tick(250);
    ok('⑤ 화면이 오류 없이 떴다', P.log.errors.length === 0, P.log.errors.map((e) => e.msg).join(' | '));
    const cards = P.doc.querySelectorAll('#pkGrid .pk-card');
    ok('⑤ 상품이 그려졌다', cards.length === 1, '카드 ' + cards.length + '개');
    const cta = P.doc.querySelector('#pkGrid .pk-cta');
    if (cta) {
      cta.dispatchEvent(new P.win.MouseEvent('click', { bubbles: true, cancelable: true, view: P.win }));
      await P.tick(60);
      const detail = visibleText(P.doc.getElementById('pkDetail'));
      ok('⑤ 상세가 열리고 금액·일정이 보인다',
        /1,190,000/.test(detail) && /DAY 1/.test(detail), detail.slice(0, 80));
      ok('⑤ 포함·불포함이 보인다', /왕복 항공/.test(detail) && /개인 경비/.test(detail));

      P.doc.getElementById('pkPax').value = '4';
      P.doc.getElementById('pkName').value = '김보균';
      P.doc.getElementById('pkTel').value = '010-1234-5678';
      const before = P.log.requests.length;
      P.doc.getElementById('pkAsk').dispatchEvent(new P.win.MouseEvent('click', { bubbles: true, cancelable: true, view: P.win }));
      await P.tick(150);
      const req = P.log.requests.slice(before).find((r) => r.url.includes('quote-shares'));
      ok('⑤ 발급 요청이 나간다', !!req, JSON.stringify(P.log.requests.slice(before).map((r) => r.url)));
      /* 🔴 금액을 브라우저가 안 보낸다 — 서버가 DB에서 읽는다(위조할 값이 없다) */
      ok('⑤ 요청에 금액이 없다(서버가 DB에서 읽는다)',
        !!req && !('price' in (req.body || {})) && !('total' in (req.body || {})),
        req && Object.keys(req.body || {}).join(','));
      ok('⑤ 인원·연락처는 보낸다', !!req && req.body.pax === 4 && !!req.body.customerTel);
    }
  }

  console.log('\n[6] 견적서 문서 — 고객이 결재에 붙이는 것이 실제로 보이는가');
  {
    const shareReq = log.requests.find((r) => r.url.includes('quote-shares'));
    const share = shareReq && shareReq.body && shareReq.body.share;
    ok('⑥ 방금 만든 견적서 payload가 있다', !!share);
    if (share) {
      /* 서버가 얹는 칸을 그대로 흉내 낸다(발행일·견적번호·검증 결과) */
      const shareDoc = Object.assign({}, share, {
        iso: new Date().toISOString().slice(0, 10),
        qno: 'Q260826-99',
        _verify: { verdict: 'verified', at: new Date().toISOString() },
      });
      const V = bootPage('estimate-view.html', { query: '?id=testshare1', fixtures: { shareDoc } });
      await V.ready; await V.tick(300);
      const text = visibleText(V.doc.body);
      ok('⑥ 오류 없이 그려졌다', V.log.errors.length === 0, V.log.errors.map((e) => e.msg).join(' | '));
      ok('⑥ 견적번호가 보인다', text.includes('Q260826-99'));
      ok('⑥ 총액이 보인다', text.includes(Number(share.t).toLocaleString('ko-KR')), String(share.t));
      ok('⑥ 유효기간이 보인다', /유효기간/.test(text));
      ok('⑥ 목적지가 보인다', text.includes('다낭'));
      /* 🔴 비공개 항목은 고객 문서에 없어야 한다 */
      ok('⑥ ENBT 수익·현지 수익금이 안 보인다',
        !/ENBT 수익|현지 수익금/.test(text));
      /* 엑셀 버튼을 실제로 눌러 본다 — 여기서도 CDN 없이 파일이 나가야 한다 */
      const xlb = V.doc.getElementById('downloadExcelBtn');
      const before = V.log.downloads.length;
      if (xlb) {
        xlb.dispatchEvent(new V.win.MouseEvent('click', { bubbles: true, cancelable: true, view: V.win }));
        await V.tick(60);
      }
      ok('⑥ 🔴 견적서에서도 CDN 없이 파일이 나간다', V.log.downloads.length === before + 1);
      ok('⑥ 인쇄 버튼이 실제로 인쇄를 부른다', (() => {
        const p = V.doc.querySelector('.btn-print');
        const n = V.log.printed;
        if (p) p.dispatchEvent(new V.win.MouseEvent('click', { bubbles: true, cancelable: true, view: V.win }));
        return V.log.printed === n + 1;
      })());
    }
  }

  console.log('\n[8] 없는 주소 — 회사 이름도 없는 영문 오류를 보여주지 않는다');
  {
    /* 실측(2026-08-26): 예전에는 Vercel 기본 화면이 나갔다 —
       「The page could not be found  NOT_FOUND  icn1::7x7xx-…」
       ⚠ 드문 일이 아니다. 견적서 링크는 카톡·문자로 오가며 **주소가 잘린다.** */
    const F = bootPage('404.html');
    await F.ready; await F.tick(150);
    const text = visibleText(F.doc.body);
    ok('⑧ 우리 화면이 뜬다', /주소를 찾을 수 없습니다/.test(text));
    ok('⑧ 왜 그런지 짐작해 말해 준다(링크 잘림)', /잘려서|잘린/.test(text), text.slice(0, 80));
    ok('⑧ 견적 계산기로 가는 길이 있다', !!F.doc.querySelector('a[href="index.html"]'));
    ok('⑧ 패키지로 가는 길도 있다', !!F.doc.querySelector('a[href="packages.html"]'));
    ok('⑧ 연락처가 회사 정보 파일에서 온다', /02-2088-4253/.test(text), text.slice(-80));
    /* ⚠ 오류 화면까지 남의 서버를 기다리게 하지 않는다 */
    ok('⑧ 바깥 자원을 하나도 안 쓴다', F.log.external.length === 0,
      F.log.external.join(' · '));
    ok('⑧ 검색엔진에 안 실린다', /noindex/.test(read('404.html')));
  }

  console.log('\n[7] 잘못된 링크 — 고객이 막다른 곳에 서지 않는가');
  {
    const V = bootPage('estimate-view.html', { query: '?id=없는건', fixtures: { shareDoc: null } });
    await V.ready; await V.tick(200);
    const text = visibleText(V.doc.body);
    ok('⑦ 「불러올 수 없습니다」라고 말한다', /불러올 수 없습니다/.test(text));
    ok('⑦ 무엇을 하라고 알려 준다(담당자에게 새 링크)', /담당자에게 새 링크/.test(text));
    ok('⑦ 홈으로 돌아갈 길을 준다', !!V.doc.querySelector('a[href="index.html"]'));
  }

  done();
})();

/* ═══════════════════════════════════════════════════════════════════════════
   표를 파일로 내려주는 자 — 단일 출처 (XK)
   ───────────────────────────────────────────────────────────────────────────
   고객 화면 두 곳(계산기 `index.html` · 견적서 `estimate-view.html`)이 「엑셀」
   버튼을 갖고 있는데, 둘 다 이렇게 끝나고 있었다:

     if (typeof XLSX === 'undefined') {
       alert('엑셀 다운로드 기능을 불러오지 못했습니다. **잠시 후 다시 시도해 주세요**');
       return;                                  ← 파일은 안 나간다
     }

   🔴 그런데 그 `XLSX`는 **남의 CDN**(cdn.jsdelivr.net)에서 온다. 우리 고객은
     기업·공공기관 담당자다 — 그런 망에서는 외부 CDN이 **정책으로 막혀 있는 경우가
     흔하다.** 막혀 있으면 「잠시 후」에도 영영 안 되고, 고객은 결재에 붙일 파일을
     못 받는다. 그리고 **우리는 그 사실을 모른다**(눌러 본 고객만 안다).

   → 여기서 갈라 준다: XLSX가 있으면 엑셀 파일, 없으면 **CSV**. CSV는 엑셀에서
     그대로 열린다. 라이브러리도 네트워크도 필요 없다.

   ⚠ **BOM을 반드시 붙인다.** 없으면 엑셀이 한글을 깨진 글자로 연다 — 이 저장소가
     한글 `.ps1`에서 이미 당한 함정과 같은 것이다.
   ⚠ **다르게 나간 것은 다르게 말한다.** 엑셀을 눌렀는데 CSV가 떨어지면 고객은
     잘못 받은 줄 안다.
   ⚠ 두 화면이 각자 이 로직을 갖지 않게 **파일 하나**로 둔다(결함 생성기 ①).
     한쪽만 고쳐지면, 고치지 않은 쪽 고객만 계속 빈손으로 돌아간다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어 있으면 따옴표로 감싸고 내부 따옴표는 두 번 */
  function csvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(aoa) {
    return '﻿' + (aoa || []).map(function (row) {
      return (row || []).map(csvCell).join(',');
    }).join('\r\n');
  }

  /* 반환값으로 **무엇으로 나갔는지** 알려준다 — 부르는 쪽이 화면에 그대로 말할 수 있게.
     'xlsx' | 'csv' | 'blocked'(브라우저가 저장을 막음) */
  function downloadSheet(aoa, baseName, opts) {
    var o = opts || {};
    var name = baseName || 'download';

    if (typeof XLSX !== 'undefined') {
      try {
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = o.cols || [{ wch: 28 }, { wch: 18 }];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, o.sheetName || 'Sheet1');
        XLSX.writeFile(wb, name + '.xlsx');
        return 'xlsx';
      } catch (e) {
        /* 라이브러리는 있는데 만들다 실패한 경우 — 빈손으로 돌려보내지 말고 CSV로 간다 */
      }
    }

    try {
      var blob = new Blob([toCsv(aoa)], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name + '.csv';
      /* ⚠ 문서에 붙였다 떼야 하는 브라우저가 있다(붙이지 않으면 클릭이 무시된다) */
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return 'csv';
    } catch (e2) {
      return 'blocked';
    }
  }

  /* 부르는 쪽이 매번 문구를 지어내면 두 화면이 다른 말을 한다 — 문구도 여기 둔다 */
  function sayAfterDownload(how) {
    if (how === 'csv') {
      alert('엑셀 파일 대신 CSV로 내려받았습니다 — 엑셀에서 그대로 열립니다.\n'
        + '(회사 망에서 외부 라이브러리가 막혀 있으면 이렇게 나갑니다.)');
    } else if (how === 'blocked') {
      alert('파일로 내려받지 못했습니다. 「인쇄 / PDF」로 저장하시거나 담당자에게 요청해 주세요.');
    }
  }

  window.downloadSheet = downloadSheet;
  window.sayAfterDownload = sayAfterDownload;
  /* 검사에서 CSV 변환만 따로 재려고 노출한다(파일 저장은 jsdom에 없다) */
  window.__toCsv = toCsv;
})();

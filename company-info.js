/* ══════════════════════════════════════════════════════════════════
   회사 정보 단일 관리 (신규 파일)
   견적서(PDF)·공유링크(estimate-view.html) 등 "고객에게 나가는 문서"에서
   공통으로 참조하는 회사 정보. 여기 값을 바꾸면 모든 문서에 자동 반영됨.

   되돌리기: 이 파일과, 각 HTML의 <script src="company-info.js"> 한 줄만
   지우면 원상복귀됨 — 참조하는 쪽(script.js/estimate-view.html)은 전부
   `window.COMPANY_INFO || {}` + 기존 하드코딩 문자열 폴백 방식으로 읽으므로
   이 파일이 없어도 기존과 동일하게 동작함(에러 없음).
   ══════════════════════════════════════════════════════════════════ */
window.COMPANY_INFO = {
  brand:          '비즈페이지',
  legalName:      '(주)하나이엔비티',
  ceo:            '박재규',
  bizRegNo:       '668-88-00686',
  mailOrderRegNo: '제 2018-서울금천-1033 호',
  tourBizRegNo:   '제 2018-000011 호',
  address:        '서울 금천구 시흥대로73길 67, 1012호',
  tel:            '02-2088-4253',
  email:          'skp1004651@hanatrabiz.com',
  blogUrl:        'https://blog.naver.com/hanaenbt',
};

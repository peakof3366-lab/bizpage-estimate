/* ══════════════════════════════════════════════════════════════════
   회사 정보 단일 관리 (신규 파일)
   견적서(PDF)·공유링크(estimate-view.html) 등 "고객에게 나가는 문서"에서
   공통으로 참조하는 회사 정보. 여기 값을 바꾸면 모든 문서에 자동 반영됨.

   되돌리기: 이 파일과, 각 HTML의 <script src="company-info.js"> 한 줄만
   지우면 원상복귀됨 — 참조하는 쪽(script.js/estimate-view.html)은 전부
   `window.COMPANY_INFO || {}` + 기존 하드코딩 문자열 폴백 방식으로 읽으므로
   이 파일이 없어도 기존과 동일하게 동작함(에러 없음).
   ══════════════════════════════════════════════════════════════════ */
/* ⚠ 2026-09-17: 서버도 이 값을 읽어야 한다(고객이 직접 뽑은 견적도 새 양식으로
   나가면서, 불포함내역을 **문서에 직접 싣게** 됐다). 그런데 이 파일은 `window`에만
   붙어 Node에서 `require` 하면 터졌다. → **양쪽에 내보낸다.**
   🔴 값을 한 줄도 안 바꿨다 — 담는 방식만 달라졌다(불포함내역의 진실은 여전히 여기다). */
const COMPANY_INFO = {
  brand:          '비즈페이지',
  legalName:      '(주)하나이엔비티',
  ceo:            '박재규',
  bizRegNo:       '668-88-00686',
  mailOrderRegNo: '제 2018-서울금천-1033 호',
  tourBizRegNo:   '제 2018-000011 호',
  address:        '서울 금천구 시흥대로73길 67, 1012호',
  /* 🔴 **사무소가 둘이다** (2026-09-16 대표 지시: 「앞으로 나갈 양식에는 광주 주소까지」).
     표준 견적서 양식 머리에 두 줄로 찍혀 있던 그 주소다. 고객 문서에 나가는 값이므로
     여기 한 곳에만 적는다 — 화면에 직접 적으면 한쪽만 고쳐진다(결함 생성기 ①).
     ⚠ `address`(서울)를 지우고 이 값만 남기지 말 것. 본사는 서울이고 순서도 그대로다. */
  address2:       '광주광역시 서구 상무버들로 35, 2층 201호',
  tel:            '02-2088-4253',
  email:          'skp1004651@hanatrabiz.com',
  blogUrl:        'https://blog.naver.com/hanaenbt',

  /* 🔴 **견적서 머리에 찍히는 로고** (2026-09-17 대표 지시: 「공유될 견적서에도 로고가」).
     원본은 저장소의 `이미지/biz-logo.svg`(흰 바탕용 컬러판 — 보라·민트·먹색 BI)이고,
     아래 값은 그것을 **data URI로 박아 둔 사본**이다.

     ■ 🔴 왜 파일 경로를 안 쓰는가 — 세 자리에서 깨진다
       ① **팝업 견적서는 about:blank다.** script.js가 빈 창을 열어 document.write로 쓰므로
          기준 주소가 없다. 상대경로 이미지는 거기서 안 뜬다.
       ② **인쇄·PDF 저장**은 그 시점에 다시 받아 오는데, 못 받으면 **조용히 빈칸**으로 인쇄된다.
          고객 손에 로고 없는 견적서가 가고, 우리는 그 사실을 모른다.
       ③ 폴더 이름이 한글이라 주소로 실리면 인코딩이 한 겹 더 낀다.
       → data URI는 **받아 올 것이 없다.** 2026-09-14에 바깥 CDN 아이콘이 404로 한 개도
         안 그려지고 있던 것을 한참 못 잡았던 그 유형을 애초에 없앤다.

     ■ ⚠ 인라인 <svg>로 펼치지 않은 이유
       이 그림 안에 clipPath id가 있다. 문서에 그대로 펼치면 같은 id를 쓰는 다른 SVG와
       부딪힌다. <img src>로 넣으면 그 안은 별개 문서라 부딪힐 일이 없다.

     ■ 로고를 바꾸려면: `이미지/biz-logo.svg`를 새 파일로 바꾸고 아래를 돌려 이 값을 갈아끼운다.
         node -p "'data:image/svg+xml;base64,'+require('fs').readFileSync('이미지/biz-logo.svg').toString('base64')"
     ⚠ **빈 문자열로 두면 예전처럼 글자 「비즈페이지」가 나간다** — 견적서는 안 깨진다
       (quote_doc.js가 로고가 없으면 글자로 물러난다). 로고를 일부러 빼고 싶을 때 쓴다.
     ⚠ 흰 바탕 전용이다. 어두운 바탕에는 `이미지/biz-logo-white.svg`가 따로 있다 —
       견적서는 흰 종이에 인쇄되므로 이쪽이 맞다. */
  logo:           'data:image/svg+xml;base64,PHN2ZyByb2xlPSJpbWciIGFyaWEtbGFiZWw9Iuu5hOymiO2OmOydtOyngCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjM4LjAgMjUuMiA0MjEuNyAxMTQuMSI+PGRlZnM+PGNsaXBQYXRoIGlkPSJjbGlwcGF0aDAiIHRyYW5zZm9ybT0iIj48cGF0aCBkPSJNIDAgMTY0LjM4NyBMIDUwMCAxNjQuMzg3IEwgNTAwIDAgTCAwIDAgWiIgZmlsbD0ibm9uZSIgY2xpcC1ydWxlPSJub256ZXJvIi8+PC9jbGlwUGF0aD48L2RlZnM+PGcgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgMCAxNjQuMzg3KSI+PGcgdHJhbnNmb3JtPSIiPjxwYXRoIGQ9Ik0gMCAxNjQuMzg3IEwgNTAwIDE2NC4zODcgTCA1MDAgMCBMIDAgMCBaIiBmaWxsPSJub25lIi8+PC9nPjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwcGF0aDApIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNDUuMDY3OSA2MC42NjQ1KSI+PHBhdGggZD0iTSAwIDAgTCAtMTA1LjA3IC0zMy41IEwgLTc4Ljk0MyAtMy4xNjUgQyAtNzcuOTcgLTIuMDM4IC03Ni41ODEgLTEuMzgyIC03NS4xNiAtMS4zNjcgTCAtNi4wMyAtMC44NjUgQyAtMy45ODQgLTAuODQ5IC0xLjk2MSAtMC41NDggMCAwIiBmaWxsPSIjNjNkNmQ0IiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PC9nPjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwcGF0aDApIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMzcuMTQzNiAxMTMuMzE5NSkiPjxwYXRoIGQ9Ik0gMCAwIEwgLTExLjYwNCAtMTguMTUzIEMgLTExLjcyIC0xOC4zMzUgLTExLjk2IC0xOC4zNiAtMTIuMDk3IC0xOC4yMDUgQyAtMTIuMjUxIC0xOC4wMyAtMTIuNDU1IC0xNy43NyAtMTIuNjk0IC0xNy40NTYgQyAtMTIuOTc4IC0xNy4wNzcgLTEzLjMxMiAtMTYuNjE0IC0xMy42NjUgLTE2LjExNyBMIC0xNi40NDMgLTE5LjI1NiBDIC0xNi41MyAtMTkuMzU0IC0xNi42OTMgLTE5LjMwNiAtMTYuNzExIC0xOS4xNzUgTCAtMTcuNzggLTExLjgwOSBDIC0yMC4xMDIgLTEyLjA2NCAtMjUuOTUyIC0xMi42ODIgLTI2Ljg2MyAtMTIuNjA1IEMgLTI3LjcwNiAtMTIuNTMzIC01LjIxMiAtMS41MjUgLTAuMzczIDAuNTEzIEMgLTAuMDggMC42MzcgMC4xNzggMC4yODEgMCAwIE0gMzAuNDMgMjMuOTAzIEwgLTY4LjAwOCAyMy41MjQgQyAtNzAuNzE4IDIzLjUwOSAtNzMuMTQyIDIxLjU3MSAtNzMuNzI5IDE4LjkzOCBMIC03OS42MjcgLTcuNTM2IEMgLTc1LjcyOSAtMjEuMDA4IC02My4xOSAtNDMuOTQ2IC0yNC40NTYgLTIwLjc5MiBMIC0yMy4zMDUgLTIxLjA0NyBDIC0yMy4zMDUgLTIxLjA0NyAtNDkuNjU2IC00My40OTggLTg3LjEwMSAtNDEuMDc0IEwgLTkwLjAyNyAtNTQuMTkxIEwgLTk3LjE1MyAtODYuMTU1IEwgLTk3LjE0NSAtODYuMTU1IEwgLTcxLjAxOSAtNTUuODIgQyAtNzAuMDQ2IC01NC42OTMgLTY4LjY1NiAtNTQuMDM3IC02Ny4yMzYgLTU0LjAyMiBMIDEuODk1IC01My41MiBDIDMuOTQgLTUzLjUwNCA1Ljk2MyAtNTMuMjAzIDcuOTI0IC01Mi42NTUgTCA5LjIwNiAtNTIuMjQ2IEwgOS4zNDUgLTUyLjE5OSBDIDE4LjMyNCAtNDkuMDk2IDI1LjcyOCAtNDAuODI3IDI3LjI2NSAtMzEuMjMgTCAzNS4yMjUgMTguMzkgQyAzNS42ODggMjEuMzAxIDMzLjQxOCAyMy45MTggMzAuNDMgMjMuOTAzIiBmaWxsPSIjNTE0ZGMyIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PC9nPjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwcGF0aDApIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMTIuOTIxNiA2OS4wMzI5KSI+PHBhdGggZD0iTSAwIDAgTCA4LjgwMiAwIEMgMTQuMzA0IDAgMTcuMjM3IDIuMDc4IDE3LjIzNyA1Ljg2OCBDIDE3LjIzNyA5LjU5NyAxNC4zMDQgMTEuNjE0IDguODAyIDExLjYxNCBMIDAgMTEuNjE0IFogTSAwIDE5LjA3MSBMIDcuNjQxIDE5LjA3MSBDIDEyLjM0OCAxOS4wNzEgMTUuMDk4IDIwLjg0NCAxNS4wOTggMjQuMjY4IEMgMTUuMDk4IDI3LjYyOSAxMi4zNDggMjkuNDYzIDcuNjQxIDI5LjQ2MyBMIDAgMjkuNDYzIFogTSAtNy40NTggLTcuNzAyIEMgLTcuOTQ3IC03LjcwMiAtOC4yNTMgLTcuMzk2IC04LjI1MyAtNi45MDcgTCAtOC4yNTMgMzYuMzcgQyAtOC4yNTMgMzYuODU5IC03Ljk0NyAzNy4xNjUgLTcuNDU4IDM3LjE2NSBMIDcuOTQ2IDM3LjE2NSBDIDE4LjcwNCAzNy4xNjUgMjMuNTMzIDMyLjI3NCAyMy41MzMgMjUuNjEyIEMgMjMuNTMzIDIxLjIxMSAyMS4zOTQgMTcuNDgyIDE3LjM1OSAxNS44MzIgQyAyMi45ODMgMTQuMzA0IDI1Ljc5NSAxMC4yNyAyNS43OTUgNS4xMzUgQyAyNS43OTUgLTIuNzUxIDIwLjY2IC03LjcwMiA4LjU1OCAtNy43MDIgWiIgZmlsbD0iIzMzMzEzMiIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjwvZz48ZyBjbGlwLXBhdGg9InVybCgjY2xpcHBhdGgwKSI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQ0Ljk1MjggNjEuMzMwNykiPjxwYXRoIGQ9Ik0gMCAwIEMgLTAuNDg5IDAgLTAuNzk0IDAuMzA2IC0wLjc5NCAwLjc5NSBMIC0wLjc5NCA0NC4wNzIgQyAtMC43OTQgNDQuNTYyIC0wLjQ4OSA0NC44NjcgMCA0NC44NjcgTCA2LjY2MyA0NC44NjcgQyA3LjE1MiA0NC44NjcgNy40NTggNDQuNTYyIDcuNDU4IDQ0LjA3MiBMIDcuNDU4IDAuNzk1IEMgNy40NTggMC4zMDYgNy4xNTIgMCA2LjY2MyAwIFoiIGZpbGw9IiMzMzMxMzIiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48L2c+PGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXBwYXRoMCkiPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI1Ny40MjQ1IDYxLjMzMDcpIj48cGF0aCBkPSJNIDAgMCBDIC0wLjQ4OSAwIC0wLjc5NSAwLjMwNiAtMC43OTUgMC43OTUgTCAtMC43OTUgMi44NzMgQyAtMC43OTUgMy4yMzkgLTAuNjczIDMuNTQ1IC0wLjQ4OSAzLjg1MSBMIDIwLjE3MiAzNy4xMDQgTCAwLjkxNyAzNy4xMDQgQyAwLjQyOCAzNy4xMDQgMC4xMjIgMzcuNDA5IDAuMTIyIDM3Ljg5OCBMIDAuMTIyIDQ0LjA3MiBDIDAuMTIyIDQ0LjU2MiAwLjQyOCA0NC44NjcgMC45MTcgNDQuODY3IEwgMzEuOTA4IDQ0Ljg2NyBDIDMyLjM5NyA0NC44NjcgMzIuNzAzIDQ0LjU2MiAzMi43MDMgNDQuMDcyIEwgMzIuNzAzIDQxLjk5NCBDIDMyLjcwMyA0MS42MjcgMzIuNTggNDEuMzIxIDMyLjM5NyA0MS4wMTYgTCAxMS43MzYgNy43NjMgTCAzMi4zMzYgNy43NjMgQyAzMi44MjUgNy43NjMgMzMuMTMxIDcuNDU3IDMzLjEzMSA2Ljk2OSBMIDMzLjEzMSAwLjc5NSBDIDMzLjEzMSAwLjMwNiAzMi44MjUgMCAzMi4zMzYgMCBaIiBmaWxsPSIjMzMzMTMyIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PC9nPjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwcGF0aDApIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMTQuNDU3NyA4Mi41NDE3KSI+PHBhdGggZD0iTSAwIDAgTCA1LjgwNyAwIEMgMTEuOTE5IDAgMTUuMzQzIDIuNTA2IDE1LjM0MyA4LjE5MSBDIDE1LjM0MyAxMy41MDkgMTEuOTE5IDE2LjAxNiA1LjgwNyAxNi4wMTYgTCAwIDE2LjAxNiBaIE0gLTcuNDU4IC0yMS4yMTEgQyAtNy45NDcgLTIxLjIxMSAtOC4yNTIgLTIwLjkwNSAtOC4yNTIgLTIwLjQxNiBMIC04LjI1MiAyMi44NjEgQyAtOC4yNTIgMjMuMzUxIC03Ljk0NyAyMy42NTYgLTcuNDU4IDIzLjY1NiBMIDYuMTEyIDIzLjY1NiBDIDE3LjkxIDIzLjY1NiAyMy45IDE3LjkxIDIzLjkgOC4wMDggQyAyMy45IC0xLjg5NSAxNy45MSAtNy42NDEgNi4xMTIgLTcuNjQxIEwgMCAtNy42NDEgTCAwIC0yMC40MTYgQyAwIC0yMC45MDUgLTAuMzA2IC0yMS4yMTEgLTAuNzk1IC0yMS4yMTEgWiIgZmlsbD0iIzMzMzEzMiIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjwvZz48ZyBjbGlwLXBhdGg9InVybCgjY2xpcHBhdGgwKSI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzUwLjIxODUgNzcuOTU2NykiPjxwYXRoIGQ9Ik0gMCAwIEwgMTIuODM3IDAgTCA2LjQxOSAxNi45OTQgWiBNIC0xNC41NDggLTE2LjYyNiBDIC0xNS4wOTggLTE2LjYyNiAtMTUuNDAzIC0xNi4yNTkgLTE1LjE1OSAtMTUuNzA5IEwgMi43NTEgMjcuNjMgQyAyLjkzNSAyOC4wNTggMy4yNCAyOC4yNDEgMy42NjggMjguMjQxIEwgOS4zNTMgMjguMjQxIEMgOS43OCAyOC4yNDEgMTAuMDg2IDI4LjA1OCAxMC4yNyAyNy42MyBMIDI4LjE4IC0xNS43MDkgQyAyOC40MjQgLTE2LjI1OSAyOC4xMTggLTE2LjYyNiAyNy41NjggLTE2LjYyNiBMIDE5Ljg2NiAtMTYuNjI2IEMgMTkuNDM4IC0xNi42MjYgMTkuMTMzIC0xNi40NDIgMTguOTQ5IC0xNi4wMTUgTCAxNS43NzEgLTcuNjQxIEwgLTIuODczIC03LjY0MSBMIC02LjA1MSAtMTYuMDE1IEMgLTYuMjM0IC0xNi40NDIgLTYuNTQgLTE2LjYyNiAtNi45NjggLTE2LjYyNiBaIiBmaWxsPSIjMzMzMTMyIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PC9nPjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwcGF0aDApIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNzguMjc4IDgzLjc2NDMpIj48cGF0aCBkPSJNIDAgMCBDIDAgMTQuMDU5IDkuMjkxIDIzLjI4OSAyMi4xODkgMjMuMjg5IEMgMzEuNjAzIDIzLjI4OSAzOC4zODggMTguODg4IDQxLjM4MyAxMS4yNDcgQyA0MS41NjYgMTAuNzU4IDQxLjM4MyAxMC4zMyA0MC44OTQgMTAuMjA4IEwgMzQuMzU0IDguMzc0IEMgMzMuOTI2IDguMjUyIDMzLjU1OSA4LjQzNiAzMy4zNzUgOC44NjMgQyAzMS4yMzYgMTIuOTU5IDI3LjM4NSAxNS4yMjEgMjIuMzEyIDE1LjIyMSBDIDEzLjY5MiAxNS4yMjEgOC41NTggOS4xMDcgOC41NTggLTAuMDYyIEMgOC41NTggLTkuMjMgMTMuNzU0IC0xNS4yMjEgMjIuMzEyIC0xNS4yMjEgQyAyOC42NjkgLTE1LjIyMSAzMy42ODEgLTExLjkyIDM0LjQ3NiAtNS43NDYgTCAzNC41MzcgLTUuMjU3IEwgMjMuMzUxIC01LjI1NyBDIDIyLjg2MSAtNS4yNTcgMjIuNTU2IC00Ljk1MSAyMi41NTYgLTQuNDYyIEwgMjIuNTU2IDEuNTg5IEMgMjIuNTU2IDIuMDc4IDIyLjg2MSAyLjM4NCAyMy4zNTEgMi4zODQgTCA0Mi4wNTYgMi4zODQgQyA0Mi41NDUgMi4zODQgNDIuODUgMi4wNzggNDIuODUgMS41ODkgTCA0Mi44NSAtMy40ODQgQyA0Mi44NSAtMTQuNjcxIDM1LjU3NiAtMjMuMjg5IDIyLjA2NyAtMjMuMjg5IEMgOC44NjMgLTIzLjI4OSAwIC0xNC4wNiAwIDAiIGZpbGw9IiMzMzMxMzIiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48L2c+PGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXBwYXRoMCkiPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQyNy43OTI3IDYxLjMzMDcpIj48cGF0aCBkPSJNIDAgMCBDIC0wLjQ4OSAwIC0wLjc5NCAwLjMwNiAtMC43OTQgMC43OTUgTCAtMC43OTQgNDQuMDcyIEMgLTAuNzk0IDQ0LjU2MiAtMC40ODkgNDQuODY3IDAgNDQuODY3IEwgMjguMzYzIDQ0Ljg2NyBDIDI4Ljg1MiA0NC44NjcgMjkuMTU3IDQ0LjU2MiAyOS4xNTcgNDQuMDcyIEwgMjkuMTU3IDM3Ljg5OCBDIDI5LjE1NyAzNy40MDkgMjguODUyIDM3LjEwNCAyOC4zNjMgMzcuMTA0IEwgNy40NTggMzcuMTA0IEwgNy40NTggMjYuODk2IEwgMjYuMzQ2IDI2Ljg5NiBDIDI2LjgzNSAyNi44OTYgMjcuMTQxIDI2LjU5IDI3LjE0MSAyNi4xMDIgTCAyNy4xNDEgMjAuMDUgQyAyNy4xNDEgMTkuNTYxIDI2LjgzNSAxOS4yNTUgMjYuMzQ2IDE5LjI1NSBMIDcuNDU4IDE5LjI1NSBMIDcuNDU4IDcuNzYzIEwgMjkuMDk3IDcuNzYzIEMgMjkuNTg2IDcuNzYzIDI5Ljg5MiA3LjQ1NyAyOS44OTIgNi45NjkgTCAyOS44OTIgMC43OTUgQyAyOS44OTIgMC4zMDYgMjkuNTg2IDAgMjkuMDk3IDAgWiIgZmlsbD0iIzMzMzEzMiIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjwvZz48L2c+PC9zdmc+',
};

/* ══════════════════════════════════════════════════════════════════
   맞춤 견적서의 **불포함 내역** (2026-09-15 대표 지시)
   ──────────────────────────────────────────────────────────────────
   ■ 왜 생겼나
   대표가 실제 업무용 표준 양식과 우리 견적서를 나란히 놓고 보시고
   「지금은 너무 두루뭉실해 보인다」고 하셨다. 대조해 보니 가장 큰 차이가 이것이었다:
   **우리 견적서는 「포함 항목」만 보여주고 「무엇이 빠졌는지」는 한 줄도 없었다.**
   표준 양식은 불포함내역을 **빨간 글씨로 강조**한다 — 나중에 「이건 왜 따로 받나」가
   나오는 자리라 문서에서 미리 못 박는 항목이기 때문이다.

   ■ 🔴 **왜 여기(company-info.js)에 두는가**
   견적서는 **두 벌**이다 — 계산 직후 여는 팝업 문서(`script.js`)와 카톡으로 나가는
   링크 견적서(`estimate-view.html`). 이 저장소는 그 둘이 갈려서 한쪽만 고쳐지는 사고를
   여러 번 겪었다(XC·XD·XP·WQ). 목록을 두 번 적으면 **반드시 어긋난다**(결함 생성기 ①).
   → 둘 다 싣는 유일한 파일이 여기다(`index.html`·`estimate-view.html`·
     `admin-quote-pro.html`·`packages.html` 네 곳이 싣는다).

   ■ ⚠ 패키지 견적서는 **이 목록을 쓰지 않는다**
   패키지는 공급사가 준 `excluded` 목록이 진실이다(2026-08-21 대표 결정 — 우리가
   재산출하지 않는다). 여기 것은 **우리 엔진이 계산한 맞춤 견적** 전용이다.

   ■ ⚠ 여기 없는 것 = 대표가 정해야 하는 것 (결정대기열 0-ac·0-ad)
   가이드·기사 **팁**이 포함인지, 여행자보험 **보장 한도**가 얼마인지, 「요청 시
   사후정산」을 약속할지는 **실거래 조건**이라 지어내지 않았다. 정해지면 여기 한 줄씩
   더하면 두 문서에 동시에 반영된다.
   ══════════════════════════════════════════════════════════════════ */
const QUOTE_EXCLUDED = [
  '여권 발급비 · 비자 수수료',
  '개인 경비 (기념품 · 쇼핑 등)',
  '식사 시 주류 · 음료 비용',
  '초과 수하물 요금',
  '일정에 없는 개인 활동 비용',
];

/* 브라우저에서는 지금까지처럼 `window.COMPANY_INFO`·`window.QUOTE_EXCLUDED`로 읽는다.
   ⚠ 그 이름을 바꾸지 않는다 — 읽는 곳이 여럿 곳이다(script.js·estimate-view·admin …). */
if (typeof window !== 'undefined') {
  window.COMPANY_INFO = COMPANY_INFO;
  window.QUOTE_EXCLUDED = QUOTE_EXCLUDED;
}
if (typeof module === 'object' && module.exports) {
  module.exports = { COMPANY_INFO, QUOTE_EXCLUDED };
}

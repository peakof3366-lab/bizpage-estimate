# 오버나이트 자율 작업 계획 (2026-07-04 밤 시작)

사용자가 잠든 사이 Claude가 GPT(OpenAI API)와의 토론을 거쳐 비즈페이지 사이트의
모든 고객향 서비스/섹션 품질을 개선한다. 아래 규칙은 절대 규칙이며, 과거
(2026-07-04 저녁) styles.css 전체 재작성으로 후기/FAQ/회사소개/문의/푸터 스타일이
통째로 날아간 사고가 있었으므로 반드시 지킬 것.

## 절대 규칙 (Safety Rules)

1. **파일 전체 재작성 금지.** index.html/styles.css/script.js는 절대 전체를 다시
   생성해서 덮어쓰지 않는다. 항상 특정 섹션/특정 CSS 규칙/특정 함수만 정밀 타겟팅해서
   수정한다 (Edit 도구의 old_string/new_string 방식처럼 작은 단위로).
2. **한 번에 한 섹션만.** 아래 큐에서 한 항목을 완료(백업+검증+커밋+로그)한 뒤에만
   다음 항목으로 넘어간다.
3. **모든 변경 후 반드시:**
   a. `git add -A && git commit -m "<섹션>: <요약>"` (아래 "Git 사용법" 참고)
   b. `python ai-loop/verify_render.py index.html <label>` 실행해서 렌더링 에러 확인
      - **베이스라인 무시 대상**: 아래 8개는 오프라인 샌드박스라서 나는 에러이며
        새로 생긴 문제가 아님 → 무시:
        `fonts.googleapis.com`, `fonts.gstatic.com`, `cdn.jsdelivr.net`,
        `unpkg.com` (lucide 아이콘 CDN) 관련 net::ERR_NAME_NOT_RESOLVED
      - 위 4개 도메인 외의 **새로운** console error/pageerror가 나오면 그 변경을
        되돌리고 (`git revert` 또는 직전 커밋으로 `git reset --hard HEAD~1`) 該
        항목을 "보류"로 로그에 남기고 다음 항목으로 넘어간다.
   c. 진행 로그 파일(`ai-loop/OVERNIGHT_LOG.md`)에 항목 추가 (형식은 아래 참고)
4. **불확실하면 무리하게 밀어붙이지 말 것.** 검증이 애매하거나 위험해 보이면
   "보류(review needed)"로 로그에 남기고 다음 항목으로 넘어간다. 사용자가 자는 동안
   되돌릴 수 없는 실수를 하는 것보다 아무것도 안 하는 게 낫다.
5. **admin.html의 네이비+화이트 색상 테마는 건드리지 않는다** (의도적으로 고객용
   사이트와 다르게 유지 중). 순수 기능 버그가 있다면 그것만 고친다.
6. **실제 백엔드/서드파티 계정 연동(이메일 전송 서비스, DB 등)은 시도하지 않는다.**
   사용자 계정 생성이 필요한 작업이라 자율로 완결할 수 없음. 대신 발견한 구조적
   이슈는 로그에 "다음에 사용자와 논의 필요"로 남긴다.
7. **외부 네트워크 호출은 OpenAI API(gpt_critique.py)만 사용.** 그 외 새로운
   외부 서비스 연동 시도 금지.
8. **.env, 절대 커밋 대상 아님** (.gitignore에 이미 포함됨). 확인만 하고 내용을
   로그에 남기지 않는다.

## Git 사용법 (중요)

이 PowerShell 세션은 새 프로세스마다 PATH가 초기화되어 `git`이 바로 안 먹을 수 있다.
아래처럼 항상 전체 경로를 쓰거나, 매 명령 블록 시작에서 PATH를 보정한다:

```powershell
$env:Path += ";C:\Program Files\Git\cmd"
git status
```

또는 `& "C:\Program Files\Git\cmd\git.exe" status` 형태로 직접 호출.

베이스라인 커밋은 이미 생성되어 있음 (`baseline: overnight 작업 시작 전 스냅샷`).
전체 폴더 백업도 별도로 존재: `C:\Users\최현욱\Desktop\비즈페이지_FULLBACKUP_20260704_222128`
(최악의 경우 이 폴더로 완전 복구 가능).

## GPT 토론 사용법

```powershell
"<프롬프트 내용>" | Out-File -FilePath "ai-loop\tmp_prompt.txt" -Encoding utf8
cd ai-loop
python gpt_critique.py tmp_prompt.txt
cd ..
```

Claude(본인)가 먼저 섹션을 분석하고 개선안을 제안 → 위 스크립트로 GPT에게 비판/보완
요청 → Claude가 GPT 의견을 반영해 최종안 확정 → 직접 Edit 도구로 **작은 단위**
구현 → GPT에게 구현 결과 코드 리뷰 요청 → 문제 있으면 Edit으로 수정.
(과거 스크립트들처럼 GPT/Claude API가 전체 CSS를 생성해서 그대로 저장하는 방식은
쓰지 않는다 — 그게 사고 원인이었음.)

## 검증 방법 (Playwright)

```powershell
cd ai-loop
python verify_render.py index.html <라벨>
cd ..
```

`ai-loop/logs/verify_<timestamp>_<라벨>/` 에 desktop/mobile 스크린샷 + errors.txt 저장됨.
스크린샷을 Read 도구로 열어서 레이아웃이 깨지지 않았는지 육안 확인도 할 것.

## 섹션 작업 큐 (우선순위 순)

이미 오늘 낮에 완료된 것 (건드리지 않음, 필요시 미세 다듬기만): 히어로 카카오버튼 버그,
목적지 갤러리 리디자인, 견적산출 STEP1/2 UX, 견적서 일정 연결, 푸터 브랜드명 색상 버그.

1. **서비스 섹션** (`index.html` id="features", 약 749번째 줄) — 카피 품질, 아이콘/수치
   신뢰도 강화, 호버 인터랙션 점검
2. **포트폴리오 섹션** (id="portfolio", 약 839번째 줄) — 카드 정보 위계, 필터 UX,
   블로그 링크 연결 상태
3. **후기 섹션** (id="testimonials", 약 1143번째 줄) — 카드 디자인, 신뢰 지표(trust-strip)
   시각적 임팩트
4. **FAQ 섹션** (id="faq", 약 1217번째 줄) — 아코디언 인터랙션, 질문 우선순위/카피
5. **회사소개 섹션** (id="about", 약 1273번째 줄) — 파트너 로고 영역, 레이아웃 균형
6. **문의 섹션** (id="contact", 약 1319번째 줄) — 폼 검증 UX, 지도 임베드, 성공 메시지
7. **STEP3 탐색기** (id="step3Section", 약 571번째 줄) — UI 다듬기 (단, `ai-loop/itinerary_api.py`
   로컬 서버가 안 떠 있으면 동적 기능은 테스트 불가 — 정적 마크업/스타일만 점검)
8. **estimate-view.html** (공유 견적서 페이지) — 모바일/인쇄 미리보기 재점검, 추가 다듬기
9. **크로스커팅**: 접근성(alt 텍스트, aria-label, 포커스 상태, 명도 대비), 모바일
   반응형 전수 재점검, 애니메이션/트랜지션 일관성

각 섹션 작업 시 GPT에게 물어볼 질문 예시: "이 섹션이 B2B 해외연수 담당자에게 신뢰감을
주는가? 정보 위계가 명확한가? 모바일에서 문제 없는가? 실제 개선이 필요한 구체적 지점은?"

## 로그 형식 (`ai-loop/OVERNIGHT_LOG.md`에 추가)

```
### [섹션명] HH:MM
- 변경 내용: ...
- GPT 피드백 요약: ...
- 검증 결과: 통과 / 보류(사유)
- 커밋: <git commit hash 앞 7자리>
```

## 종료 조건

큐를 다 돌았거나, 예산/시간이 부족해지면 `ai-loop/OVERNIGHT_LOG.md` 맨 위에
"## 최종 요약" 섹션을 추가해서 사용자가 아침에 한눈에 볼 수 있게 정리한다:
완료 항목, 보류 항목과 이유, 다음에 사람이 판단해야 할 것.

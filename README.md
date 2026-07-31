# 비즈페이지 — MICE 기업연수 온라인 견적

기업 해외연수(MICE) 견적을 웹에서 즉시 산출해 고객에게 제공하는 서비스.
공개 사이트: <https://bizpage-estimate.vercel.app>

이 파일은 **입구 안내**다. 작업 규칙은 `CLAUDE.md`, 지금 어디까지 했는지는
`git log --oneline`에 있다(커밋 메시지가 곧 작업 기록이다). 역할이 겹치지 않게 유지할 것 —
상태를 문서에 따로 적기 시작하면 코드와 어긋난다.

## 구성

정적 프론트 + Vercel 서버리스 함수 + Neon Postgres. 빌드 단계가 없다 —
루트가 그대로 정적 출력이라 커밋한 파일이 공개 도메인에서 읽힌다
(그래서 내부 문서·검증 도구는 `.vercelignore`로 **업로드 자체를 막는다**).

| 파일 | 역할 |
|---|---|
| `index.html` · `styles.css` | 고객이 보는 랜딩·견적 계산기 화면 |
| `script.js` | **견적 엔진**(요율·계수·시즌·환율 계산) + 화면 로직 |
| `data.js` | 55개 목적지 요율표 + `DEST_CLASSIFY` 분류표(좌석·보험·지역·통화·시즌·반구) + 추천 콘텐츠(`DEST_REC`)·추천 일정(`ITINERARY_DB`) |
| `dest_currency.js` · `company-info.js` | 정산 통화 매핑 · 회사 정보 |
| `admin.html` | 관리자 화면 — 요율 편집, 문의·견적 관리, 통계, **일정 관리**, 계정 관리 |
| `admin-quote.html` | 담당자용 내부 견적 산출 도구 |
| `estimate-view.html` | 고객에게 공유되는 견적서 화면 |
| `api/` | 서버리스 함수(인증·요율·문의·견적·공유링크·통계) |
| `ai-loop/` | 검증·감사 도구와 테스트 (런타임 아님, 배포 제외) |
| `이미지/` | 목적지 사진·세계지도 |

**요율의 진실은 `data.js`가 아니라 운영 DB(`rate_overrides`)다.** `data.js`는 폴백
기본값이라 점점 낡는다. 실제 값은 `curl -s .../api/rates`로 확인한다.
**추천 일정도 같은 구조다** — `data.js`의 `ITINERARY_DB`가 기본값이고, 관리자 →
일정 관리에서 저장한 값이 `itinerary_overrides`에 얹혀 고객에게 나간다
(`curl -s '.../api/content?action=itineraries'`).

## 손대기 전에 돌릴 것 (읽기 전용, 1분)

```bash
node ai-loop/run_all_tests.js       # 회귀 스위트 — 계산식을 바꿨으면 무조건 이것부터
node ai-loop/fuzz_invariants.js     # 견적 엔진 불변식 (--full = 52,360건)
node ai-loop/audit_consistency.js   # 목적지 목록 교차 정합성 (오류 0이어야 정상)
node ai-loop/audit_rates.js         # 요율 '값' 점검 — 결과는 '확인 대상'이지 '오류'가 아니다
```

`jsdom`이 `--no-save`로 설치돼 있어 실행 시 `NODE_PATH=<프로젝트경로>/node_modules`가
필요하다(`run_all_tests.js`는 알아서 잡는다). 턴 종료 시 Stop 훅
(`ai-loop/hooks/verify_on_stop.js`)이 앞의 두 개를 자동 실행한다.

## 배포

`git push origin master` = **프로덕션 자동 배포**. 별도 배포 명령이 없다.

- 계산식을 바꾸는 변경은 배포 전 사용자 승인. additive·계산식 불변 변경은 검증 후 push 가능.
- API가 새 컬럼을 쓰면 **마이그레이션(`node ai-loop/db_migrate.js`)을 배포보다 먼저**.
  순서가 뒤바뀌면 그 기능이 500으로 깨진다. 실행은 사용자 승인 후.
- Vercel Hobby = **서버리스 함수 12개 제한에 이미 도달**. 새 API는 새 파일이 아니라
  기존 파일에 `?action=` 분기로 추가한다.

## 자격증명

둘 다 gitignore돼 있고 저장소에 커밋하지 않는다.

- `.env.local` — 런타임·스크립트용. `DATABASE_URL`, `SESSION_SECRET`,
  `OPENAI_API_KEY`(마케팅 인사이트), Neon/Postgres 접속값.
- `ai-loop/.env` — 도구용. `OPENAI_API_KEY`(GPT 협의), `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`.

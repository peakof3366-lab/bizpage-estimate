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
**추천 일정·추천 콘텐츠도 같은 구조다** — `data.js`의 `ITINERARY_DB`(코스)와
`DEST_REC`(방식 A/B)가 기본값이고, 관리자 → 일정 관리에서 저장한 값이
`itinerary_overrides`에 얹혀 고객에게 나간다
(`curl -s '.../api/content?action=itineraries'`).

## 손대기 전에 돌릴 것 (읽기 전용, 1분)

```bash
node ai-loop/run_all_tests.js       # 회귀 스위트 — 계산식을 바꿨으면 무조건 이것부터
node ai-loop/fuzz_invariants.js     # 견적 엔진 불변식 (--full = 52,360건)
node ai-loop/audit_consistency.js   # 목적지 목록 교차 정합성 (오류 0이어야 정상)
node ai-loop/audit_rates.js         # 요율 '값' 점검 — 결과는 '확인 대상'이지 '오류'가 아니다
```

**견적서 PDF 추출을 손댔으면 코퍼스로 재 본다** (읽기 전용, 코퍼스는 저장소 밖).

```bash
node ai-loop/audit_vacuous_rows.js  # 검산 안 된 줄이 대표 단가가 되는가 — 신뢰도까지 본다
node ai-loop/audit_row_categories.js # 검산줄이 어느 항목인지 알아냈는가 — 못 알아낸 이유까지 센다
node ai-loop/audit_coverage.js      # 우리가 읽은 줄이 총계의 몇 %를 설명하는가 — 덜 읽은 것을 잡는다
node ai-loop/audit_extract_sanity.js # 뽑아낸 값이 요율표 분포에서 벗어나는가 — 틀린 값을 잡는다
node ai-loop/backtest_quotes.js     # 고객이 보는 금액의 오차 (--cache = 추출 결과 재사용)
```

**보이는 모양을 손댔으면 하나 더** — 실제 브라우저로 띄워 좌표를 잰다.

```bash
python ai-loop/check_manual_layout.py           # 매뉴얼 줄맞춤 (데스크톱·태블릿·모바일)
python ai-loop/check_editor_layout.py           # 일정 편집 화면 (5폭 + 화면 세로 길이)
python ai-loop/check_quote_doc_layout.py        # 고객 견적서 — 고객이 하는 그대로 뽑아 잰다
python ai-loop/check_manual_layout.py --shots   # 스크린샷도 저장 (--shots는 셋 다 있다)

python ai-loop/check_contrast.py                # 안 읽히는 글자 — 29개 화면을 전부 훑는다
python ai-loop/check_contrast.py --all          # 확인 대상(흐린 글자)까지 전부
python ai-loop/check_quotetool_width.py         # 내부 견적 산출 화면 폭 (RW)
```

⚠ **`check_contrast.py`는 '보이는데 안 읽히는 글자'를 찾는다.** 같은 결과를 내는 사고가
서로 다른 원인으로 두 번 났다 — 칸 전체에 건 `opacity`가 담당자가 쓴 글까지 흐리게 했고,
편집 손잡이의 흰 배경이 **검은 박스 위 흰 글자**를 지웠다. 둘 다 스위트를 통과했다
(jsdom은 색을 계산하지 않는다). 색·투명도·배경을 건드렸으면 이걸 돌린다.
장식용 글자와 비활성 버튼은 빼되 **몇 건인지 항상 적는다**(조용히 빼면 그게 거짓말이다).

⚠ **고객이 보는 쪽도 재 볼 것.** 지금까지 잡힌 모양 결함은 전부 관리자 화면 밖에서도
났다 — 견적서가 휴대폰에서 가로로 289px 삐져나가고 있었는데(RH) 데스크톱에서는 0px라
아무도 못 봤다. `check_quote_doc_layout.py`는 **프로덕션 DB에 아무것도 남기지 않는다**
(로컬 파일로 열고 `/api/*`를 막아 견적이 전송되지 않는다).

jsdom은 레이아웃을 계산하지 않아 위 스위트로는 **보이는 모양**을 잴 수 없다. 실제로
"글자가 번호 칸에 갇혀 한 글자씩 세로로 쏟아지는" 상태가 배포된 적이 있는데, 그때
소스만 봐서는 아무 이상이 없어 보였다. 일정 편집 화면에서도 같은 유형으로 두 번 잡혔다 —
버튼이 좁은 화면에서 카드 밖으로 47px 밀려난 것(RD), 자동 높이가 textarea 기본 rows에
걸려 한 줄짜리 문구가 두 줄 칸을 쓰던 것(RE). 브라우저 설치가 필요해 스위트에는 넣지
않았고, 대신 그 결함의 **원인이 되는 구조**는 `test_qN_manual.js`·`test_rD`·`test_rE`가
항상 막는다.

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

## 백업

데이터는 코드와 다른 곳에 있다 — **Neon Postgres**(`DATABASE_URL`)다. 배포해도 데이터는
그대로고, 코드를 되돌려도 데이터는 안 돌아온다. 그래서 별도로 받아 둔다.

```bash
node ai-loop/db_backup.js            # 16개 테이블 전체를 한 파일로 (읽기 전용)
node ai-loop/db_backup.js --list     # 받아둔 백업 목록 + 노트북·클라우드 양쪽 상태
node ai-loop/db_restore.js           # 되돌리기 '계획'만 출력 (기본은 아무것도 안 쓴다)
node ai-loop/db_restore.js --confirm # 계획대로 실행 — 빠진 행만 채운다

node ai-loop/setup_cloud_backup.js         # 클라우드 사본 설정 — 계획만 출력
node ai-loop/setup_cloud_backup.js --apply # 실행 (구글 드라이브 폴더를 찾아 설정)
```

**백업은 두 곳에 남는다** — 노트북(`../비즈페이지_백업/`)에 먼저 쓰고, 클라우드 동기화
폴더에 사본을 하나 더 올린다(`.env.local`의 `BACKUP_MIRROR_DIR`).

⚠ **왜 '주 저장소를 클라우드로'가 아니라 '사본을 하나 더'인가.** 구글 드라이브
*스트리밍* 모드에서 `G:`는 **앱이 켜져 있을 때만 존재한다.** 백업 위치를 통째로 옮기면
앱이 꺼졌거나 인터넷이 없는 날엔 백업이 아예 안 된다 — 정작 노트북이 이상한 날 백업이
빠지는 셈이다. 그래서 노트북에 먼저 쓰고(**항상 성공**), 클라우드에 올린다(되면 올린다).
사본이 실패해도 전체를 실패로 만들지 않되, `--list`가 사본이 며칠째 안 올라갔는지 계속
말한다(조용히 끊기지 않게).
*미러링* 모드를 쓰면 사본 폴더가 평범한 로컬 폴더가 되어 앱이 꺼져 있어도 사본까지
성공한다 — 그쪽이 더 낫다.

- 저장 위치 기본값은 **저장소 밖**(`../비즈페이지_백업/`). 이 저장소는 루트가 그대로 정적
  출력이라 안에 두면 공개될 수 있고, 백업에는 고객 개인정보·비밀번호 해시·가입코드가
  들어 있다. 안에 쓰려면 `--allow-in-repo`를 명시해야 한다(그래도 gitignore가 막는다).
- **위치를 바꾸려면 `.env.local`의 `BACKUP_DIR`** — 우선순위는 `--dir` > `BACKUP_DIR` > 기본값.
  클라우드 동기화 폴더(구글 드라이브·MYBOX 등)를 여기에 넣으면 매일 백업이 자동으로
  노트북 밖에도 남는다. **백업이 이 PC 한 곳에만 있으면 노트북과 함께 사라진다** —
  Neon은 살아 있어도, "실수로 지운 것"을 되돌릴 수단은 이 파일들뿐이다.
  경로를 저장소에 커밋하지 않는 이유: 이 PC에만 해당하는 값이라서다.
  ⚠ `BACKUP_DIR`로 지정한 폴더의 상위 경로가 없으면 **폴더를 새로 만들지 않고 멈춘다.**
  동기화 앱이 꺼졌을 때 조용히 새 폴더를 만들면, 백업은 매일 성공하면서 클라우드에는
  한 건도 안 올라가는 상태가 된다.
  ⚠ 클라우드에 올리면 **고객 개인정보가 외부 서비스에 저장된다.** 그 계정에는 반드시
  2단계 인증을 걸 것.
- 테이블 목록은 `db_migrate.js`에서 읽는다 — 새 테이블을 만들면 백업 대상도 자동으로 는다.
- 테이블 하나라도 못 읽으면 파일 이름에 `PARTIAL`을 붙이고 종료 코드 1로 끝낸다. 저장한
  파일은 **다시 읽어 행 수까지 대조한 뒤에야** 성공이라고 말한다.
- 복원 기본 모드는 지금 DB의 행을 건드리지 않는다(`on conflict do nothing`). 테이블을
  통째로 백업 시점으로 되돌리려면 `--replace`(그 테이블의 이후 변경은 사라진다).
- `id`가 bigserial인 테이블은 복원 후 시퀀스를 다시 맞춘다. 안 맞추면 복원 며칠 뒤
  "계정 추가가 안 된다"로 나타난다.

**자동 실행** — Windows 작업 스케줄러에 `bizpage-db-backup`으로 등록돼 있다(매일 18:00,
`ai-loop/backup_daily.bat`, 실행 로그는 `ai-loop/logs/backup.log`). PC가 꺼져 있어 건너뛴
날은 다음에 켜질 때 실행된다(`StartWhenAvailable`).

⚠ **자동 백업은 조용히 멈춘다** — 스케줄러가 실패해도 아무도 로그를 안 본다. 그래서
`--list`가 마지막 백업이 며칠 전인지 항상 말하고, 이틀 이상 지났거나 부분 백업이면
종료 코드 1로 끝낸다. 가끔 `node ai-loop/db_backup.js --list`를 확인하면 된다.

```powershell
# 상태 확인 / 지금 즉시 한 번 실행 / 해제
Get-ScheduledTaskInfo -TaskName 'bizpage-db-backup'
Start-ScheduledTask   -TaskName 'bizpage-db-backup'
Unregister-ScheduledTask -TaskName 'bizpage-db-backup'
```

## 자격증명

둘 다 gitignore돼 있고 저장소에 커밋하지 않는다.

- `.env.local` — 런타임·스크립트용. `DATABASE_URL`, `SESSION_SECRET`,
  `OPENAI_API_KEY`(마케팅 인사이트), Neon/Postgres 접속값.
- `ai-loop/.env` — 도구용. `OPENAI_API_KEY`(GPT 협의), `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`.

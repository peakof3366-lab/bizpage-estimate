"""
비즈페이지 AI 토론 루프
Claude와 GPT가 다단계 토론을 통해 최적의 디자인/기능을 도출
"""

import os
import json
import datetime
from pathlib import Path
from dotenv import load_dotenv
import anthropic
from openai import OpenAI

load_dotenv()

PROJECT_DIR = Path(__file__).parent.parent
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

claude = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
gpt = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SITE_CONTEXT = """
사이트명: 비즈페이지 (하나이엔비티)
업종: 기업·공공기관·교육기관 해외 연수 전문
타겟: B2B - 기업 인사팀장, 공공기관 교육담당자
핵심 수치: 설립 14년, 연수 실적 1,400건+, 재계약률 98%, 55개국
핵심 가치: 신뢰, 전문성, 글로벌 네트워크
기술 스택: 순수 HTML/CSS/JS (프레임워크 없음)
"""


def read_project_files():
    files = {}
    for name in ["index.html", "styles.css", "script.js"]:
        path = PROJECT_DIR / name
        if path.exists():
            files[name] = path.read_text(encoding="utf-8")
    return files


def save_project_files(files: dict):
    for name, content in files.items():
        path = PROJECT_DIR / name
        path.write_text(content, encoding="utf-8")
        print(f"  저장: {name}")


def backup_files():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = LOG_DIR / f"backup_{ts}"
    backup_dir.mkdir(exist_ok=True)
    for name, content in read_project_files().items():
        (backup_dir / name).write_text(content, encoding="utf-8")
    print(f"  백업 완료: backup_{ts}")
    return ts


# ─── 라운드 1: Claude 초안 제안 ───────────────────────────────────────
def round1_claude_propose(task: str) -> str:
    print("\n[Round 1 - Claude] 디자인 방향 제안 중...")

    prompt = f"""당신은 최고 수준의 웹 디자이너이자 UX 전문가입니다.

사이트 정보:
{SITE_CONTEXT}

작업 요청: {task}

현재 사이트의 문제점을 분석하고, 구체적인 개선 방향을 제안해주세요.
코드 없이 계획만 작성하세요.

다음 항목을 포함해 한국어로 작성:
1. 현재 문제점 (3가지)
2. 컬러 시스템 제안 (메인컬러/서브컬러/강조색/배경색 + 선택 이유)
3. 타이포그래피 제안 (폰트, 크기 체계)
4. 레이아웃/UX 개선 방향 (3가지)
5. 예상 효과"""

    msg = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    proposal = msg.content[0].text
    print(f"  제안 완료 ({len(proposal)}자)")
    return proposal


# ─── 라운드 2: GPT 비판 및 반론 ──────────────────────────────────────
def round2_gpt_critique(task: str, claude_proposal: str) -> str:
    print("\n[Round 2 - GPT] Claude 제안 비판 중...")

    prompt = f"""당신은 까다로운 시니어 UI/UX 디자이너입니다.

사이트 정보:
{SITE_CONTEXT}

작업 요청: {task}

Claude의 디자인 제안:
{claude_proposal}

이 제안을 날카롭게 비판하고 보완 의견을 제시하세요.

다음 항목을 포함해 한국어로 작성:
1. 동의하는 부분 (구체적으로)
2. 문제가 있는 부분 (구체적으로 + 이유)
3. 누락된 중요 요소
4. 더 나은 대안 제시
5. B2B 해외연수 업종 특성에서 반드시 고려해야 할 점"""

    res = gpt.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000
    )
    critique = res.choices[0].message.content
    print(f"  비판 완료 ({len(critique)}자)")
    return critique


# ─── 라운드 3: Claude 재반박 및 최종안 도출 ──────────────────────────
def round3_claude_finalize(task: str, proposal: str, critique: str) -> str:
    print("\n[Round 3 - Claude] 토론 반영 최종안 도출 중...")

    prompt = f"""당신은 최고 수준의 웹 디자이너입니다.

사이트 정보:
{SITE_CONTEXT}

당신의 초안 제안:
{proposal}

GPT의 비판:
{critique}

GPT의 비판을 수용하고 반박할 부분은 근거를 들어 반박하여
최종 디자인 시스템을 확정하세요.

다음 형식으로 한국어 작성:
1. GPT 비판 수용 내용
2. 반박 내용 (근거 포함)
3. 최종 확정 디자인 시스템:
   - 메인컬러: #000000 (이유)
   - 서브컬러: #000000 (이유)
   - 강조색: #000000 (이유)
   - 배경색: #000000 (이유)
   - 텍스트색: #000000 (이유)
   - 메인폰트: (이유)
   - 섹션별 개선 방향
4. 구현 우선순위"""

    msg = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    final_plan = msg.content[0].text
    print(f"  최종안 완료 ({len(final_plan)}자)")
    return final_plan


# ─── 라운드 4: GPT 최종 승인 ─────────────────────────────────────────
def round4_gpt_approve(task: str, final_plan: str) -> str:
    print("\n[Round 4 - GPT] 최종안 승인 및 보완 중...")

    prompt = f"""당신은 시니어 UI/UX 디자이너입니다.

사이트 정보:
{SITE_CONTEXT}

최종 합의된 디자인 시스템:
{final_plan}

이 최종안을 검토하고, CSS 구현 시 반드시 포함해야 할
구체적인 기술 명세를 추가해주세요.

다음 항목을 한국어로 작성:
1. 최종안 승인 여부 및 이유
2. CSS 변수 정의 명세 (--color-primary 등)
3. 반응형 브레이크포인트 제안
4. 애니메이션/트랜지션 가이드
5. 구현 시 주의사항"""

    res = gpt.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500
    )
    approval = res.choices[0].message.content
    print(f"  승인 완료 ({len(approval)}자)")
    return approval


# ─── 라운드 5: Claude 코드 구현 ──────────────────────────────────────
def round5_claude_implement(final_plan: str, approval: str, files: dict) -> dict:
    print("\n[Round 5 - Claude] 실제 코드 구현 중...")

    prompt = f"""당신은 숙련된 프론트엔드 개발자입니다.

사이트 정보:
{SITE_CONTEXT}

토론으로 확정된 디자인 시스템:
{final_plan}

GPT 기술 명세:
{approval}

현재 styles.css:
{files.get('styles.css', '')}

위 디자인 시스템을 styles.css에 완전히 구현하세요.

요구사항:
- CSS 변수(커스텀 프로퍼티) 체계 전면 도입
- 기존 레이아웃 구조는 유지
- 컬러, 타이포그래피, 간격, 트랜지션 전면 개선
- 모바일 반응형 유지

아래 형식으로 응답하세요:

SUMMARY: 구현 내용 요약 (한국어 2-3문장)

```css
/* 완전히 새로운 styles.css 전체 내용 */
```"""

    msg = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = msg.content[0].text.strip()

    # summary 추출
    summary = ""
    if "SUMMARY:" in raw:
        summary = raw.split("SUMMARY:")[1].split("```")[0].strip()

    # CSS 추출
    css_content = ""
    if "```css" in raw:
        css_content = raw.split("```css")[1].split("```")[0].strip()
    elif "```" in raw:
        css_content = raw.split("```")[1].split("```")[0].strip()

    result = {
        "changes": {"styles.css": css_content},
        "summary": summary
    }
    print(f"  구현 완료: {summary[:80]}")
    return result


# ─── 라운드 6: GPT 코드 리뷰 ─────────────────────────────────────────
def round6_gpt_code_review(implemented: dict) -> str:
    print("\n[Round 6 - GPT] 구현 코드 최종 리뷰 중...")

    css = implemented["changes"].get("styles.css", "")

    prompt = f"""시니어 프론트엔드 개발자로서 아래 CSS를 리뷰하세요.

{css[:6000]}

다음 관점에서 검토 후 한국어로 작성:
1. 버그 또는 오류 가능성
2. 크로스 브라우저 호환성 문제
3. 성능 개선 여지
4. 모바일 반응형 누락 항목
5. 최종 점수 (100점 만점) 및 총평"""

    res = gpt.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500
    )
    review = res.choices[0].message.content
    print(f"  리뷰 완료 ({len(review)}자)")
    return review


# ─── 라운드 7: Claude 최종 수정 ──────────────────────────────────────
def round7_claude_fix(implemented: dict, code_review: str, files: dict) -> dict:
    print("\n[Round 7 - Claude] 최종 수정 적용 중...")

    prompt = f"""GPT 코드 리뷰를 반영해 CSS를 최종 수정하세요.

현재 CSS:
{implemented['changes'].get('styles.css', '')}

GPT 리뷰:
{code_review}

실제로 문제가 있는 부분만 수정하세요. 과도한 변경 금지.

아래 형식으로 응답하세요:

SUMMARY: 수정 내용 요약 (한국어 2문장)

```css
/* 최종 수정된 styles.css 전체 내용 */
```"""

    msg = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = msg.content[0].text.strip()

    summary = ""
    if "SUMMARY:" in raw:
        summary = raw.split("SUMMARY:")[1].split("```")[0].strip()

    css_content = ""
    if "```css" in raw:
        css_content = raw.split("```css")[1].split("```")[0].strip()
    elif "```" in raw:
        css_content = raw.split("```")[1].split("```")[0].strip()

    result = {
        "changes": {"styles.css": css_content if css_content else implemented['changes'].get('styles.css', '')},
        "summary": summary
    }
    print(f"  수정 완료: {summary[:80]}")
    return result


# ─── 전체 토론 루프 실행 ──────────────────────────────────────────────
def run_debate(task: str):
    print("\n" + "=" * 60)
    print(f"토론 주제: {task}")
    print("=" * 60)

    ts = backup_files()
    files = read_project_files()

    log = {"timestamp": ts, "task": task, "rounds": {}}

    # Round 1
    proposal = round1_claude_propose(task)
    log["rounds"]["1_claude_proposal"] = proposal
    print("\n--- Claude 초안 ---")
    print(proposal)

    # Round 2
    critique = round2_gpt_critique(task, proposal)
    log["rounds"]["2_gpt_critique"] = critique
    print("\n--- GPT 비판 ---")
    print(critique)

    # Round 3
    final_plan = round3_claude_finalize(task, proposal, critique)
    log["rounds"]["3_claude_final_plan"] = final_plan
    print("\n--- Claude 최종안 ---")
    print(final_plan)

    # Round 4
    approval = round4_gpt_approve(task, final_plan)
    log["rounds"]["4_gpt_approval"] = approval
    print("\n--- GPT 승인 ---")
    print(approval)

    # Round 5
    implemented = round5_claude_implement(final_plan, approval, files)
    log["rounds"]["5_implementation"] = implemented.get("summary", "")

    # Round 6
    code_review = round6_gpt_code_review(implemented)
    log["rounds"]["6_code_review"] = code_review
    print("\n--- GPT 코드 리뷰 ---")
    print(code_review)

    # Round 7
    final = round7_claude_fix(implemented, code_review, files)
    log["rounds"]["7_final_fix"] = final.get("summary", "")

    # 파일 저장
    print("\n파일 저장 중...")
    if final["changes"].get("styles.css"):
        save_project_files({"styles.css": final["changes"]["styles.css"]})
    elif implemented["changes"].get("styles.css"):
        save_project_files({"styles.css": implemented["changes"]["styles.css"]})

    # 로그 저장
    log_path = LOG_DIR / f"debate_{ts}.json"
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n" + "=" * 60)
    print("토론 완료!")
    print(f"총 7라운드 진행 | 로그: debate_{ts}.json")
    print("=" * 60)


if __name__ == "__main__":
    print("비즈페이지 AI 토론 루프")
    print("종료: quit\n")

    while True:
        task = input("토론 주제 입력 > ").strip()
        if task.lower() in ("quit", "exit", "종료"):
            break
        if not task:
            continue
        try:
            run_debate(task)
        except Exception as e:
            print(f"\n오류: {e}")
            import traceback
            traceback.print_exc()

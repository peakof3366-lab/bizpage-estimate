"""
비즈페이지 AI 개발 루프
Claude가 코드를 생성하고 GPT가 리뷰하는 자동화 파이프라인
"""

import os
import json
import datetime
from pathlib import Path
from dotenv import load_dotenv
import anthropic
from openai import OpenAI

load_dotenv()

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

PROJECT_DIR = Path(__file__).parent.parent
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
gpt = OpenAI(api_key=OPENAI_KEY)


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
        print(f"  저장 완료: {name}")


def backup_files():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = LOG_DIR / f"backup_{ts}"
    backup_dir.mkdir(exist_ok=True)
    files = read_project_files()
    for name, content in files.items():
        (backup_dir / name).write_text(content, encoding="utf-8")
    print(f"  백업 완료: {backup_dir.name}")
    return ts


def claude_generate(task: str, files: dict) -> dict:
    print("\n[Claude] 코드 생성 중...")

    file_context = ""
    for name, content in files.items():
        file_context += f"\n\n=== {name} ===\n{content}"

    prompt = f"""당신은 웹 개발 전문가입니다.
아래는 비즈페이지(해외 연수 견적 서비스) 홈페이지의 현재 코드입니다.

{file_context}

---
작업 요청: {task}

요구사항:
- 기존 코드 스타일과 구조를 유지하세요
- 한국어 콘텐츠를 그대로 유지하세요
- 변경한 파일만 반환하세요

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{{
  "changes": {{
    "index.html": "변경된 전체 HTML 코드 (변경 없으면 null)",
    "styles.css": "변경된 전체 CSS 코드 (변경 없으면 null)",
    "script.js": "변경된 전체 JS 코드 (변경 없으면 null)"
  }},
  "summary": "변경 내용 요약 (한국어 2-3문장)"
}}"""

    message = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()

    # JSON 추출
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    result = json.loads(raw)
    print(f"  요약: {result.get('summary', '')}")
    return result


def gpt_review(task: str, changes: dict, original_files: dict) -> str:
    print("\n[GPT] 코드 리뷰 중...")

    changed_code = ""
    for name, content in changes.items():
        if content:
            changed_code += f"\n\n=== {name} (변경됨) ===\n{content}"

    if not changed_code:
        return "변경된 코드가 없습니다."

    prompt = f"""당신은 시니어 프론트엔드 개발자입니다.
아래 코드는 해외 연수 견적 홈페이지에 대한 작업 요청("{task}")의 결과물입니다.

{changed_code}

다음 관점에서 리뷰해주세요:
1. 버그 또는 오류 가능성
2. 보안 취약점
3. 성능 개선 여지
4. 크로스 브라우저 호환성
5. 모바일 반응형 문제

리뷰 결과를 한국어로 작성하고, 각 항목별로 구체적인 개선 방법을 제시하세요.
문제가 없으면 "이상 없음"으로 표시하세요."""

    response = gpt.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2048
    )

    review = response.choices[0].message.content
    print(f"  리뷰 완료 ({len(review)}자)")
    return review


def claude_apply_review(task: str, files: dict, generated: dict, review: str) -> dict:
    print("\n[Claude] 리뷰 반영 중...")

    current_code = ""
    for name, content in generated["changes"].items():
        if content:
            current_code += f"\n\n=== {name} ===\n{content}"
        elif files.get(name):
            current_code += f"\n\n=== {name} (미변경) ===\n{files[name]}"

    prompt = f"""당신은 웹 개발 전문가입니다.
GPT의 코드 리뷰를 바탕으로 코드를 개선해주세요.

현재 코드:
{current_code}

GPT 리뷰:
{review}

요구사항:
- 리뷰에서 지적된 실제 문제만 수정하세요
- 과도한 변경은 피하세요
- 기존 기능은 그대로 유지하세요

반드시 아래 JSON 형식으로만 응답하세요:
{{
  "changes": {{
    "index.html": "개선된 전체 HTML 코드 (변경 없으면 null)",
    "styles.css": "개선된 전체 CSS 코드 (변경 없으면 null)",
    "script.js": "개선된 전체 JS 코드 (변경 없으면 null)"
  }},
  "summary": "리뷰 반영 내용 요약 (한국어 2-3문장)"
}}"""

    message = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()

    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    result = json.loads(raw)
    print(f"  반영 완료: {result.get('summary', '')}")
    return result


def save_log(ts: str, task: str, generated: dict, review: str, final: dict):
    log = {
        "timestamp": ts,
        "task": task,
        "claude_summary": generated.get("summary", ""),
        "gpt_review": review,
        "final_summary": final.get("summary", ""),
    }
    log_path = LOG_DIR / f"log_{ts}.json"
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  로그 저장: logs/log_{ts}.json")


def run(task: str):
    print("=" * 60)
    print(f"작업: {task}")
    print("=" * 60)

    # 1. 백업
    print("\n[1/5] 현재 파일 백업 중...")
    ts = backup_files()

    # 2. 현재 파일 읽기
    print("\n[2/5] 프로젝트 파일 읽는 중...")
    files = read_project_files()
    print(f"  읽은 파일: {list(files.keys())}")

    # 3. Claude로 코드 생성
    print("\n[3/5] Claude 코드 생성...")
    generated = claude_generate(task, files)

    # 4. GPT로 리뷰
    print("\n[4/5] GPT 코드 리뷰...")
    review = gpt_review(task, generated["changes"], files)
    print(f"\n--- GPT 리뷰 ---\n{review}\n")

    # 5. Claude로 리뷰 반영
    print("\n[5/5] Claude 리뷰 반영...")
    final = claude_apply_review(task, files, generated, review)

    # 파일 저장
    print("\n파일 저장 중...")
    final_files = {}
    for name in ["index.html", "styles.css", "script.js"]:
        if final["changes"].get(name):
            final_files[name] = final["changes"][name]
        elif generated["changes"].get(name):
            final_files[name] = generated["changes"][name]

    if final_files:
        save_project_files(final_files)
    else:
        print("  변경된 파일 없음")

    # 로그 저장
    save_log(ts, task, generated, review, final)

    print("\n" + "=" * 60)
    print("완료!")
    print(f"Claude 작업: {generated.get('summary', '')}")
    print(f"최종 반영: {final.get('summary', '')}")
    print("=" * 60)


if __name__ == "__main__":
    print("비즈페이지 AI 개발 루프")
    print("종료하려면 'quit' 입력\n")

    while True:
        task = input("작업 요청 입력 > ").strip()
        if task.lower() in ("quit", "exit", "종료"):
            print("종료합니다.")
            break
        if not task:
            continue
        try:
            run(task)
        except Exception as e:
            print(f"\n오류 발생: {e}")
            print("백업 파일은 logs/ 폴더에 보관되어 있습니다.")

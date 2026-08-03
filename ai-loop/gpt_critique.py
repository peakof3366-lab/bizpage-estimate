"""
GPT(OpenAI) 비판/리뷰 호출 헬퍼
사용법: python gpt_critique.py <prompt_file.txt> [output_file.txt] [--max-tokens N]
prompt_file 내용을 그대로 GPT에 전달하고, 응답을 stdout(및 output_file)에 출력한다.

⚠ 응답이 상한에 걸려 잘리면 마지막 지적이 통째로 사라지는데, 잘린 티가 잘 안 난다
   (문장이 끝난 것처럼 보인다). 그래서 잘렸으면 stderr로 분명히 알린다 —
   조용히 반쪽만 받아 놓고 "GPT 검토 완료"라고 말하는 것이 이 저장소가 경계하는 유형이다.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import os

load_dotenv(Path(__file__).parent / ".env")

def main():
    if len(sys.argv) < 2:
        print("usage: python gpt_critique.py <prompt_file> [output_file]", file=sys.stderr)
        sys.exit(1)

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    max_tokens = 2000
    for a in sys.argv[1:]:
        if a.startswith("--max-tokens"):
            max_tokens = int(a.split("=", 1)[1]) if "=" in a else int(sys.argv[sys.argv.index(a) + 1])

    prompt_path = Path(args[0])
    prompt = prompt_path.read_text(encoding="utf-8")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    res = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
    )
    text = res.choices[0].message.content

    if len(args) >= 2:
        Path(args[1]).write_text(text, encoding="utf-8")

    print(text)

    # 잘렸으면 반드시 알린다(위 주석 참고).
    if res.choices[0].finish_reason == "length":
        print(
            f"\n[!] 응답이 max_tokens({max_tokens})에 걸려 잘렸습니다. "
            f"--max-tokens 를 올려 다시 받으세요.",
            file=sys.stderr,
        )
        sys.exit(2)

if __name__ == "__main__":
    main()

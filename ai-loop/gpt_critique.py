"""
GPT(OpenAI) 비판/리뷰 호출 헬퍼
사용법: python gpt_critique.py <prompt_file.txt> [output_file.txt]
prompt_file 내용을 그대로 GPT에 전달하고, 응답을 stdout(및 output_file)에 출력한다.
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

    prompt_path = Path(sys.argv[1])
    prompt = prompt_path.read_text(encoding="utf-8")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    res = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    text = res.choices[0].message.content

    if len(sys.argv) >= 3:
        Path(sys.argv[2]).write_text(text, encoding="utf-8")

    print(text)

if __name__ == "__main__":
    main()

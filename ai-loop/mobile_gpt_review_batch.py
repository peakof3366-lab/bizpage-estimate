"""
모바일 스크린샷을 배치로 나눠 GPT-4o 비전에 전달해 리뷰 요청
사용법: python mobile_gpt_review_batch.py <prefix> [batch_size]
"""
import sys
import base64
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import os

load_dotenv(Path(__file__).parent / ".env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

LOG_DIR = Path(__file__).parent / "logs" / "mobile_review"


def encode(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("utf-8")


def review_batch(files, start_idx, total):
    content = [
        {
            "type": "text",
            "text": (
                "당신은 냉철한 프론트엔드 QA 리뷰어입니다. "
                "'비즈페이지'(해외 연수 B2B 견적 서비스) 웹사이트를 "
                f"모바일 뷰포트(390px)에서 스크롤하며 캡처한 전체 {total}장 중 "
                f"{start_idx}~{start_idx+len(files)-1}번 이미지입니다. "
                "위아래로 이어지는 한 페이지의 일부입니다.\n\n"
                "다음만 실제로 보이는 경우에 지적하세요(추측 금지, 취향 지적 금지):\n"
                "1. 요소 잘림/오버플로우/가로스크롤 유발\n"
                "2. 텍스트-버튼-이미지 겹침\n"
                "3. 글자 대비 낮음/너무 작음\n"
                "4. 버튼 터치 영역 문제\n"
                "5. 여백/정렬 깨짐\n"
                "6. 빈 공간이나 이상한 콘텐츠 순서\n\n"
                "형식: - [이미지 번호] 문제 설명\n"
                "문제 없으면 '문제 없음'. 한국어로."
            ),
        }
    ]
    for i, f in enumerate(files):
        idx = start_idx + i
        content.append({"type": "text", "text": f"[이미지 {idx}] ({f.name})"})
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encode(f)}", "detail": "high"}}
        )

    res = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": content}],
        max_tokens=1200,
    )
    return res.choices[0].message.content


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else "index"
    batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    files = sorted(LOG_DIR.glob(f"{prefix}_[0-9]*.png"))
    if not files:
        print(f"NO FILES for prefix={prefix}")
        sys.exit(1)

    all_text = []
    for start in range(0, len(files), batch_size):
        batch = files[start:start + batch_size]
        print(f"--- reviewing {start}..{start+len(batch)-1} ---", file=sys.stderr)
        text = review_batch(batch, start, len(files))
        all_text.append(f"=== {start}~{start+len(batch)-1} ===\n{text}")

    out_path = LOG_DIR / f"{prefix}_review_batched.txt"
    out_path.write_text("\n\n".join(all_text), encoding="utf-8")
    print(f"saved: {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()

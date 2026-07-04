@echo off
chcp 65001 >nul
echo ========================================
echo  연수 일정 API 서버 설치 및 시작
echo ========================================

echo [1/2] 패키지 설치 중...
pip install fastapi uvicorn anthropic python-dotenv duckduckgo-search -q

echo [2/2] 서버 시작...
echo  브라우저에서: http://localhost:8765/docs
echo  API 테스트:  http://localhost:8765/api/itinerary?dest=오키나와^&days=5
echo  Ctrl+C 로 중지
echo.
python itinerary_api.py
pause

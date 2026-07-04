"""
목적지별 연수 일정 + 현지 이미지 생성 API
──────────────────────────────────────────────────────────────────
웹 검색(DuckDuckGo) → Claude 일정 구조화 → SQLite 캐시 → JSON 응답
이미지: Pexels API (무료키) → DuckDuckGo 이미지 검색 → 없으면 빈 배열

실행 방법:
  pip install fastapi uvicorn anthropic python-dotenv duckduckgo-search requests
  python itinerary_api.py

Pexels 무료 키 발급: https://www.pexels.com/api/
.env 에 추가: PEXELS_API_KEY=your_key_here

포트: 8765
"""
import sys, os, json, sqlite3, re, time
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import anthropic

try:
    from duckduckgo_search import DDGS
    DDG_OK = True
except ImportError:
    DDG_OK = False
    print("[WARN] duckduckgo-search 미설치 → Claude 단독 모드")

try:
    import requests
    REQUESTS_OK = True
except ImportError:
    REQUESTS_OK = False
    print("[WARN] requests 미설치 → Pexels 사용 불가")

load_dotenv(Path(__file__).parent / '.env')
CLAUDE      = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
PEXELS_KEY  = os.getenv('PEXELS_API_KEY', '')
DB_PATH     = Path(__file__).parent / 'itinerary_cache.db'

# ── 목적지 한국어 → 영어 검색 키워드 매핑 ────────────────────────────
DEST_EN = {
    '도쿄':'Tokyo Japan skyline',       '오키나와':'Okinawa Japan beach sea',
    '오사카':'Osaka Japan city',         '후쿠오카':'Fukuoka Japan',
    '나고야':'Nagoya Japan',             '삿포로':'Sapporo Japan snow',
    '홍콩':'Hong Kong skyline',          '마카오':'Macau casino landmark',
    '상해':'Shanghai China Bund',        '장가계':'Zhangjiajie China mountain',
    '청도':'Qingdao China beach',        '연태':'Yantai China',
    '몽골':'Mongolia steppe grassland',  '대만':'Taiwan Taipei city',
    '가오슝':'Kaohsiung Taiwan harbor',
    '싱가포르':'Singapore Marina Bay city',
    '하노이':'Hanoi Vietnam Old Quarter', '호치민':'Ho Chi Minh City Vietnam',
    '다낭':'Da Nang Vietnam beach',      '나트랑':'Nha Trang Vietnam sea',
    '푸꾸옥':'Phu Quoc island Vietnam',  '마닐라':'Manila Philippines city',
    '세부':'Cebu Philippines beach',     '보홀':'Bohol Philippines chocolate hills',
    '코타키나발루':'Kota Kinabalu Malaysia sunset',
    '캄보디아':'Angkor Wat Cambodia temple',
    '방콕':'Bangkok Thailand temple palace',
    '푸켓':'Phuket Thailand beach',      '치앙마이':'Chiang Mai Thailand temple',
    '발리':'Bali Indonesia rice terrace','라오스':'Luang Prabang Laos river',
    '괌':'Guam beach tropical',          '사이판':'Saipan beach island',
    '시드니':'Sydney Opera House Australia',
    '멜버른':'Melbourne Australia city', '오클랜드':'Auckland New Zealand',
    '호주':'Gold Coast Australia beach',
    '파리':'Paris Eiffel Tower France',  '영국':'London Big Ben UK',
    '로마':'Rome Colosseum Italy',       '독일':'Munich Germany city',
    '네덜란드':'Amsterdam Netherlands canal',
    '스페인':'Barcelona Spain Sagrada Familia',
    '동유럽':'Prague Czech Republic old town',
    '북유럽':'Norway fjord Scandinavia', '서유럽':'Europe Alps Switzerland',
    '뉴욕':'New York City Manhattan skyline',
    '로스앤젤레스':'Los Angeles Hollywood California',
    '샌프란시스코':'San Francisco Golden Gate Bridge',
    '워싱턴':'Washington DC Capitol monument',
    '하와이':'Hawaii beach tropical sunset',
    '밴쿠버':'Vancouver Canada mountain',
    '토론토':'Toronto Canada CN Tower',
    '카자흐스탄':'Astana Kazakhstan modern city',
    '우즈베키스탄':'Samarkand Uzbekistan Registan',
}

# ── DB 초기화 ──────────────────────────────────────────────────────────
def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''CREATE TABLE IF NOT EXISTS cache (
        cache_key TEXT PRIMARY KEY,
        dest TEXT, days INTEGER,
        data TEXT, created_at TEXT
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS img_cache (
        dest TEXT PRIMARY KEY,
        data TEXT, created_at TEXT
    )''')
    conn.commit()
    return conn

def cache_get(dest: str, days: int):
    try:
        conn = _db()
        row = conn.execute('SELECT data, created_at FROM cache WHERE cache_key=?',
                           [f'{dest}|{days}']).fetchone()
        conn.close()
        if not row: return None
        if datetime.now() - datetime.fromisoformat(row[1]) > timedelta(days=30): return None
        return json.loads(row[0])
    except: return None

def cache_set(dest: str, days: int, data: dict):
    try:
        conn = _db()
        conn.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?,?)',
                     [f'{dest}|{days}', dest, days,
                      json.dumps(data, ensure_ascii=False),
                      datetime.now().isoformat()])
        conn.commit(); conn.close()
    except Exception as e:
        print(f'[WARN] 일정 캐시 저장 실패: {e}')

def img_cache_get(dest: str):
    try:
        conn = _db()
        row = conn.execute('SELECT data, created_at FROM img_cache WHERE dest=?', [dest]).fetchone()
        conn.close()
        if not row: return None
        if datetime.now() - datetime.fromisoformat(row[1]) > timedelta(days=7): return None
        return json.loads(row[0])
    except: return None

def img_cache_set(dest: str, data: list):
    try:
        conn = _db()
        conn.execute('INSERT OR REPLACE INTO img_cache VALUES(?,?,?)',
                     [dest, json.dumps(data, ensure_ascii=False), datetime.now().isoformat()])
        conn.commit(); conn.close()
    except Exception as e:
        print(f'[WARN] 이미지 캐시 저장 실패: {e}')

# ── 이미지 검색 ────────────────────────────────────────────────────────
def pexels_search(dest: str, count: int = 8) -> list:
    """Pexels API — 목적지 관련 사진 검색 (PEXELS_API_KEY 필요)"""
    if not PEXELS_KEY or not REQUESTS_OK:
        return []
    keyword = DEST_EN.get(dest, dest + ' tourism landmark')
    url = f'https://api.pexels.com/v1/search?query={quote(keyword)}&per_page={count}&orientation=landscape'
    try:
        resp = requests.get(url, headers={'Authorization': PEXELS_KEY}, timeout=10)
        if resp.status_code != 200:
            print(f'[WARN] Pexels {resp.status_code}: {resp.text[:80]}')
            return []
        photos = resp.json().get('photos', [])
        result = []
        for p in photos:
            result.append({
                'url':   p['src']['large2x'],
                'thumb': p['src']['medium'],
                'alt':   p.get('alt') or dest,
                'credit': f"Photo by {p['photographer']} on Pexels",
                'src': 'pexels',
            })
        print(f'[INFO] Pexels: {dest} → {len(result)}장')
        return result
    except Exception as e:
        print(f'[WARN] Pexels 오류: {e}')
        return []

def ddg_image_search(dest: str, count: int = 8) -> list:
    """DuckDuckGo 이미지 검색 — Pexels 키 없을 때 fallback"""
    if not DDG_OK:
        return []
    keyword = DEST_EN.get(dest, dest + ' tourism cityscape')
    result = []
    # 영어 + 한국어 2회 시도
    for q in [keyword, f'{dest} 관광지 도시']:
        try:
            with DDGS() as ddgs:
                for img in ddgs.images(q, max_results=count * 2, safesearch='moderate'):
                    w = img.get('width', 0)
                    h = img.get('height', 0)
                    url = img.get('image', '')
                    if w < 600 or h < 400 or not url:
                        continue
                    # 이미지 URL 기본 유효성 체크
                    if not url.startswith('http'):
                        continue
                    result.append({
                        'url':   url,
                        'thumb': img.get('thumbnail', url),
                        'alt':   dest,
                        'credit': '',
                        'src': 'ddg',
                    })
                    if len(result) >= count:
                        break
        except Exception as e:
            print(f'[WARN] DDG 이미지 오류 ({q}): {e}')
        if len(result) >= count:
            break
        time.sleep(0.5)
    print(f'[INFO] DDG images: {dest} → {len(result)}장')
    return result

def fetch_images(dest: str, count: int = 8) -> list:
    """이미지 검색 — Pexels 우선, 실패 시 DuckDuckGo"""
    cached = img_cache_get(dest)
    if cached is not None:
        return cached
    imgs = pexels_search(dest, count)
    if len(imgs) < 2:
        imgs = ddg_image_search(dest, count)
    # 관련 없는 이미지 방지: 최소 2장 미만이면 빈 배열
    if len(imgs) < 2:
        imgs = []
    img_cache_set(dest, imgs)
    return imgs

# ── 웹 검색 (일정용) ──────────────────────────────────────────────────
def web_search(dest: str, days: int) -> str:
    if not DDG_OK:
        return ""
    queries = [
        f'{dest} 기업 해외연수 추천 코스 일정 관광지',
        f'{DEST_EN.get(dest, dest)} corporate training itinerary highlights',
    ]
    snippets = []
    try:
        with DDGS() as ddgs:
            for q in queries:
                for r in ddgs.text(q, max_results=5):
                    body = r.get('body', '').strip()
                    if body:
                        snippets.append(body)
                if sum(len(s) for s in snippets) > 2400:
                    break
    except Exception as e:
        print(f'[WARN] 웹 검색 오류: {e}')
    return '\n'.join(snippets)[:2500]

# ── Claude 일정 생성 ──────────────────────────────────────────────────
def generate_itinerary(dest: str, days: int, web_ctx: str) -> list:
    nights = days - 1
    day_list = ', '.join([f'DAY {i}' for i in range(1, days + 1)])
    web_section = (f'\n웹 검색 정보 (참고):\n{web_ctx}'
                   if web_ctx else
                   f'\n{dest}의 주요 명소·산업·문화를 바탕으로 구성하세요.')
    prompt = f"""당신은 B2B 해외 기업 연수 전문 기획자입니다.

목적지: {dest}
기간: {days}일({nights}박) — {day_list}
{web_section}

위 정보를 바탕으로 {dest} {days}일 기업 연수 코스 2개를 **JSON 배열만** 반환하세요.
[ 로 시작하고 ] 로 끝내야 합니다.

형식:
[
  {{
    "title": "역량강화형 코스명",
    "subtitle": "한 줄 테마",
    "highlights": ["핵심1","핵심2","핵심3"],
    "days": [
      {{"day":1,"title":"도착·오리엔테이션","am":"인천국제공항 출발 → {dest} 도착, 호텔 체크인","pm":"도심 탐방","eve":"환영 만찬","tip":"입국 팁"}},
      ... DAY {days} 까지 (마지막은 귀국)
    ]
  }},
  {{
    "title": "동기부여·화합형 코스명",
    "subtitle": "팀 결속·힐링 테마",
    "highlights": ["체험1","체험2","체험3"],
    "days": [ ... ]
  }}
]"""

    resp = CLAUDE.messages.create(
        model='claude-sonnet-4-6', max_tokens=5000,
        messages=[{"role":"user","content":prompt}]
    )
    raw = resp.content[0].text.strip()
    if '```json' in raw:
        raw = raw.split('```json')[1].split('```')[0].strip()
    elif '```' in raw:
        raw = raw.split('```')[1].split('```')[0].strip()
    match = re.search(r'\[[\s\S]*\]', raw)
    if match:
        raw = match.group(0)
    return json.loads(raw)


# ── FastAPI ───────────────────────────────────────────────────────────
app = FastAPI(title='Itinerary + Images API')
app.add_middleware(CORSMiddleware, allow_origins=['*'],
                   allow_methods=['GET','DELETE','OPTIONS'], allow_headers=['*'])


@app.get('/api/itinerary')
async def get_itinerary(
    dest: str = Query(...),
    days: int = Query(5, ge=2, le=14),
):
    """일정 생성 (캐시 우선). images 필드 포함."""
    hit = cache_get(dest, days)
    if hit:
        hit['cached'] = True
        return hit

    web_ctx = web_search(dest, days)
    try:
        courses = generate_itinerary(dest, days, web_ctx)
    except Exception as e:
        return {'error': str(e), 'dest': dest}

    # 이미지도 함께 가져오기
    images = fetch_images(dest)

    result = {
        'dest': dest, 'days': days,
        'courses': courses,
        'images': images,
        'cached': False,
        'web_searched': bool(web_ctx),
        'generated_at': datetime.now().isoformat(),
    }
    cache_set(dest, days, result)
    return result


@app.get('/api/images')
async def get_images(
    dest: str = Query(...),
    count: int = Query(8, ge=1, le=20),
):
    """목적지 이미지만 가져오기 (일정과 별도 엔드포인트)"""
    imgs = fetch_images(dest, count)
    return {'dest': dest, 'images': imgs, 'count': len(imgs)}


@app.delete('/api/cache')
async def clear_cache(dest: str = Query(None)):
    conn = _db()
    if dest:
        conn.execute('DELETE FROM cache WHERE dest=?', [dest])
        conn.execute('DELETE FROM img_cache WHERE dest=?', [dest])
    else:
        conn.execute('DELETE FROM cache')
        conn.execute('DELETE FROM img_cache')
    conn.commit(); conn.close()
    return {'deleted': dest or 'ALL'}


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'ddg': DDG_OK,
        'pexels': bool(PEXELS_KEY),
        'requests': REQUESTS_OK,
        'db': str(DB_PATH),
    }


if __name__ == '__main__':
    import uvicorn
    print('=' * 60)
    print(' 연수 일정 + 이미지 API 서버')
    print(' http://localhost:8765/health        ← 상태 확인')
    print(' http://localhost:8765/api/images?dest=오키나와')
    print(' http://localhost:8765/api/itinerary?dest=오키나와')
    print(' http://localhost:8765/docs          ← Swagger UI')
    if not PEXELS_KEY:
        print()
        print(' [TIP] Pexels 무료 API 키 발급 → .env 에 PEXELS_API_KEY=... 추가')
        print('        DuckDuckGo 이미지 검색으로 fallback 실행 중')
    print(' Ctrl+C 로 중지')
    print('=' * 60)
    uvicorn.run(app, host='0.0.0.0', port=8765, reload=False)

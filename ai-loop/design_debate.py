"""
블랙+레드 디자인 시스템 토론 및 CSS 생성
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from dotenv import load_dotenv
import anthropic
from openai import OpenAI

load_dotenv(Path(__file__).parent / '.env')
claude = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
gpt = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

PROJECT_DIR = Path(__file__).parent.parent

# GPT 리서치 결과 (Round 1 결과 요약)
GPT_RESEARCH = """
10곳 B2B 우수 홈페이지 핵심 분석 결과:
- InVision / Adobe: 다크 배경 + 레드 포인트 → 깊이감 + 강렬한 전문성
- Dropbox Business: 박스형 버튼, 심플 대칭 레이아웃, 뉴트럴+다크 조합
- HubSpot: 모듈형 섹션, 과감한 여백, 명확한 콘텐츠 분할
- Asana: 강한 흑백 대비, 정보 계층화, 박스형+라운드 혼용 중 박스가 더 효과적
- Salesforce: 복잡한 정보를 심플하게 정리, 전문성 강조
- Slack: 직관적 네비게이션, 필요한 것만 남기는 미니멀리즘
- Zendesk: 기능별 명확한 구분, 다크톤 + 포인트색 활용
- Adobe XD: 풀스크린 히어로, 강렬한 첫인상, 레드+블랙 대조
공통 패턴: 불필요한 요소 제거 → 핵심만 남기기, 박스형 CTA가 B2B에서 더 신뢰감
"""

# ─── Round 2: Claude 디자인 제안 ──────────────────────────────────
print("=== ROUND 2: Claude 블랙+레드 디자인 설계 ===\n")
r2_prompt = f"""
당신은 최고 수준의 B2B 웹 디자이너입니다.

사이트: 비즈페이지 (해외 연수 B2B 견적 서비스, 기업/공공기관 타겟)
GPT 리서치: {GPT_RESEARCH}

사용자 요구:
- 블랙 + 레드 컬러 (고급스럽게)
- 버튼 border-radius: 0 (완전 박스형)
- 불필요한 요소 과감히 제거
- 첫인상 "와, 깔끔하고 예쁘다"
- B2B 신뢰감 + 전문성

다음을 설계하세요:

1. 컬러 팔레트 (HEX + 사용처)
2. 제거 대상 요소 목록
3. 섹션별 배경 배치
4. 버튼 CSS 예시
5. 타이포그래피
6. 레이아웃 핵심 개선 3가지
"""
r2 = claude.messages.create(model='claude-sonnet-4-6', max_tokens=2000, messages=[{"role":"user","content":r2_prompt}])
r2_txt = r2.content[0].text
print(r2_txt)

# ─── Round 3: GPT 비판 ────────────────────────────────────────────
print("\n\n=== ROUND 3: GPT 비판 및 보완 ===\n")
r3_prompt = f"""
Claude의 블랙+레드 디자인 제안을 비판하고 보완하세요.

Claude 제안:
{r2_txt}

비판 관점:
1. 블랙+레드 조합의 위험성 (너무 공격적? vs 적절한 고급감?)
2. B2B 해외연수 업종에서 레드가 신뢰감을 주는가?
3. 제거 대상 선정이 적절한가?
4. 더 나은 레드 톤 추천 (딥레드 vs 다크레드 vs 크림슨 vs 버건디)
5. 박스형 버튼의 UX 효과와 적용 시 주의사항

날카롭게 비판하되 건설적인 대안을 제시하세요.
"""
r3 = gpt.chat.completions.create(model='gpt-4o', max_tokens=1500, messages=[{"role":"user","content":r3_prompt}])
r3_txt = r3.choices[0].message.content
print(r3_txt)

# ─── Round 4: Claude 최종안 확정 ─────────────────────────────────
print("\n\n=== ROUND 4: Claude 최종 디자인 확정 ===\n")
r4_prompt = f"""
GPT 비판을 반영해 최종 디자인 시스템을 확정하세요.

Claude 초안: {r2_txt[:500]}
GPT 비판: {r3_txt}

최종 확정 형식:
- 메인블랙: #000000 (이유)
- 다크그레이: #000000 (이유)
- 레드: #000000 (이유) ← 정확한 톤 선택과 이유
- 배경: #000000
- 텍스트: #000000
- 섹션별 배경 배치 (헤더~푸터)
- 제거 확정 요소
- 버튼 CSS (border-radius: 0 기준)
- 레이아웃 최종 방향
"""
r4 = claude.messages.create(model='claude-sonnet-4-6', max_tokens=2000, messages=[{"role":"user","content":r4_prompt}])
r4_txt = r4.content[0].text
print(r4_txt)

# ─── Round 5: CSS 생성 ────────────────────────────────────────────
print("\n\n=== ROUND 5: CSS 생성 중... ===\n")
current_css = (PROJECT_DIR / 'styles.css').read_text(encoding='utf-8')

r5_prompt = f"""
다음 확정 디자인 시스템으로 styles.css 전체를 재작성하세요.

확정 디자인:
{r4_txt}

HTML에서 사용되는 모든 클래스를 반드시 포함해야 합니다:
헤더: .site-header, .header-inner, .brand, .nav-links, .button, .button-primary, .button-outline, .button-secondary
히어로: .hero, .hero-canvas, .hero-gradient, .hero-center, .hero-badge, .hero-sub, .hero-actions, .hero-stats, .stat-item, .stat-num-hero, .stat-unit, .stat-lbl-hero, .dest-ticker-wrap, .dest-ticker, .t-sep
견적: .section-estimate, .estimate-section-hd, .est-hd-badge, .est-hd-title, .estimate-grid, .estimate-form, .estimate-step, .step-active, .fld, .fld-lbl, .fld-hint, .date-block, .date-block-header, .date-block-title, .date-block-hint, .date-inputs-row, .date-input-wrap, .date-inp-label, .date-inp, .date-arrow-icon, .date-result-bar, .season-badge, .item-selector, .inc-fixed-row, .inc-fixed-text, .inc-fixed-badge, .inc-chips, .inc-chip, .inc-grade-row, .grade-label, .grade-pills, .grade-pill, .step-actions, .estimate-result, .result-card, .result-card-top, .result-label, .btn-dl-main, .btn-consult, .consult-form-wrap, .consult-form-head, .consult-close, .consult-form-desc, .consult-fields, .consult-label, .req, .consult-ok, .consult-actions, .btn-consult-cancel, .btn-consult-submit, .no-estimate-msg, .group-checklist, .gcl-head, .gcl-title, .gcl-body, .gcl-section, .gcl-sec-title, .gcl-list, .inc-label, .inc-tags, .result-totals, .total-box, .total-grand, .total-per, .total-lbl, .total-amt, .rate-note-badge, .estimate-disclaimer, .disc-main, .disc-sub, .disc-cta, .result-note, .estimate-confirm, .confirm-check, .confirm-msg, .btn-reset-est
갤러리: .section-gallery, .section-identity, .sec-id-line, .sec-id-label, .gallery-grid, .gallery-card, .gallery-overlay
서비스: .section-services, .svc-header, .svc-header-left, .svc-header-right, .svc-eyebrow, .svc-title, .svc-lead, .svc-list, .svc-item, .svc-item-index, .svc-step, .svc-cat, .svc-item-body, .svc-item-title, .svc-item-desc, .svc-bullets, .svc-item-metric, .svc-metric-val, .svc-metric-unit, .svc-metric-lbl, .svc-cta, .svc-footer, .svc-blog-link, .svc-blog-arrow
포트폴리오: .section-portfolio, .pf-section-hd, .pf-hd-inner, .pf-hd-our, .pf-hd-title, .pf-hd-line, .pf-filter-wrap, .pf-filter, .pf-grid, .pf-card, .pf-img, .pf-hover-info, .pf-hi-region, .pf-hi-title, .pf-body, .pf-dest, .pf-title, .pf-cta, .pf-blog-btn, .pf-more-hidden
후기: .section-testimonials, .testi-eyebrow-row, .testi-eyebrow-line, .testi-eyebrow-label, .section-title-center, .section-sub-center, .testimonial-grid, .testi-card, .testi-card-highlight, .testi-quote, .testi-text, .testi-info, .testi-star, .testi-name, .testi-org, .trust-strip, .trust-item, .trust-num, .trust-unit, .trust-lbl, .trust-divider
FAQ: .section-faq, .faq-wrap, .faq-left, .faq-sub, .faq-list, .faq-item, .faq-q, .faq-a, .eyebrow
회사소개: .section-about, .about-grid, .about-copy, .about-right, .about-photo-wrap, .partner-panel, .partner-logos, .plogo-item, .plogo-fallback
문의: .section-contact, .contact-grid, .contact-details, .map-wrap, .contact-form, .inq-success
푸터: .site-footer, .footer-grid, .footer-col-main, .footer-brand, .footer-tagline, .footer-info, .footer-col-contact, .footer-col-label, .footer-bottom
기타: .scroll-top-btn, .kakao-float, .hidden, .container, .section, [data-lucide], .ic-sm, .ic-md

핵심 규칙:
- border-radius: 0 (버튼, 카드, 입력창 모두)
- 블랙+레드 시스템 철저히 적용
- 불필요 요소 CSS에서 최소화 (HTML 수정 없이)
- 모바일 반응형 반드시 포함

CSS 코드블록으로만 응답:
"""
r5 = claude.messages.create(model='claude-sonnet-4-6', max_tokens=16000, messages=[{"role":"user","content":r5_prompt}])
r5_raw = r5.content[0].text.strip()

if '```css' in r5_raw:
    css = r5_raw.split('```css')[1].split('```')[0].strip()
elif '```' in r5_raw:
    css = r5_raw.split('```')[1].split('```')[0].strip()
else:
    css = r5_raw

print(f"CSS 생성 완료: {len(css)}자")

# ─── Round 6: GPT 코드 리뷰 ─────────────────────────────────────
print("\n=== ROUND 6: GPT 코드 리뷰 ===\n")
r6 = gpt.chat.completions.create(model='gpt-4o', max_tokens=1000, messages=[{"role":"user","content":f"""
다음 CSS를 리뷰하세요. 블랙+레드 B2B 사이트용입니다.

{css[:5000]}

확인 사항:
1. border-radius가 0인지 (버튼/카드)
2. 블랙+레드 컬러 일관성
3. 모바일 반응형 존재 여부
4. 크로스 브라우저 이슈

점수(100점)와 핵심 수정사항만 간략히 한국어로."""}])
r6_txt = r6.choices[0].message.content
print(r6_txt)

# ─── 파일 저장 ───────────────────────────────────────────────────
print("\n=== 파일 저장 ===")
(PROJECT_DIR / 'styles.css').write_text(css, encoding='utf-8')
print(f"styles.css 저장 완료 ({len(css)}자)")
print("\n=== 토론 완료 ===")
print("확정: 블랙+레드 디자인 시스템, 박스형 버튼")

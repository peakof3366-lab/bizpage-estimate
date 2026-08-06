# -*- coding: utf-8 -*-
"""RZ 후속 — 견적서 업데이트 9칸이 잘리지 않고 읽히는지 실제 브라우저로 잰다.
jsdom은 레이아웃을 계산하지 않아 '글자가 잘렸다'를 못 잡는다. 그게 이번 문제였다."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
LOGIN = "() => { document.getElementById('loginPage').style.display='none'; document.getElementById('dashPage').classList.remove('hidden'); }"
TAB = "(id) => { document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id===id)); try { currentTab = id.replace('tab-',''); } catch(e){} return !!document.getElementById(id); }"

FIXTURE = r"""
() => {
  const data = {
    kind: { kind:'detail', label:'세부 내역서 — 단가표가 있습니다' },
    values: { airfare:700000, fuel:135300, hotel:224750, hotelName:'노보텔', meal:90384,
              vehicle:797500, guide:217500, sight:139722, sell:3303009 },
    evidence: {
      airfare:{rowIdx:0,line:'항공료 …',calc:'700,000 × 19 × 1 = 13,300,000',label:'항공료'},
      fuel:{rowIdx:1,line:'유류 …',calc:'135,300 × 19 × 1 = 2,570,700',label:'유류할증료 및 택스'},
      hotel:{rowIdx:2,line:'노보텔 …',calc:'224,750 × 26 × 3 = 17,530,500',label:'노보텔'},
      meal:{rowIdxs:[3,4],calc:'식사 총액 7,049,936 ÷ 인원 26 ÷ 3일 = 90,384 (1인 1일)',label:"식사 13줄 · 라벨의 'N일' 3개"},
      vehicle:{rowIdx:5,line:'차량 …',calc:'797,500 × 1 × 4 = 3,190,000',label:'29인승 차량'},
      guide:{rowIdx:6,line:'가이드 …',calc:'217,500 × 2 × 4 = 1,740,000',label:'한국인 가이드'},
      sight:{rowIdxs:[7],calc:'관광 총액 3,632,782 ÷ 인원 26 = 139,722 (1인당 전 일정)',label:'관광 3줄 · 골프 12,944,404원은 뺌(요율의 관광비와 성격이 다름)'},
      sell:{calc:'문서에 적힌 1인당 금액 3,303,009',label:'1인당'},
    },
    picked: { airfare:0, fuel:1, hotel:2, vehicle:5, guide:6, mealRows:[3,4] },
    candidates: [
      {idx:0,unit:700000,qty:19,times:1,total:13300000,label:'항공료 -',note:'하나투어 사입석',category:'airfare',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:1,unit:135300,qty:19,times:1,total:2570700,label:'유류할증료 및 택스 -',note:'인솔자 포함',category:'fuel',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:2,unit:224750,qty:26,times:3,total:17530500,label:'노보텔',note:'싱글룸 26객실 기준',category:'hotel',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:3,unit:21750,qty:26,times:1,total:565500,label:'룸드랍',note:'치킨, 맥주, 과일',category:'meal',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:4,unit:29000,qty:23,times:1,total:667000,label:'2일 조식 (클럽식)',note:'골프조만',category:'meal',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:5,unit:797500,qty:1,times:4,total:3190000,label:'29인승 차량',note:'',category:'vehicle',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:6,unit:217500,qty:2,times:4,total:1740000,label:'한국인 가이드',note:'',category:'guide',line:'…',converted:null,unconvertible:false,currency:null},
      {idx:7,unit:58000,qty:26,times:2,total:3016000,label:'럭셔리 스파',note:'팁 포함',category:'sight',line:'…',converted:null,unconvertible:false,currency:null},
    ],
    warnings: ['이 PDF에 견적이 2개 들어 있습니다 — 아래에서 어느 것을 읽을지 골라 주세요.'],
    rowCount:8, pax:26, mealDays:3, grandTotal:85878235, perPerson:3303009,
    reconciliation:{passed:2,total:2,checks:[{name:'총계 ÷ 인원 = 1인당',ok:true,detail:'85,878,235 ÷ 26 = 3,303,009'}]},
    blockCount:2, selectedBlock:1,
    blocks:[{idx:0,total:81887120,perPerson:null,rows:44,named:41,pax:26,selected:false},
            {idx:1,total:85878235,perPerson:3303009,rows:55,named:51,pax:26,selected:true}],
    needsFxRate:null, fxRates:{}, fxFromDocument:{}, source:'규칙',
  };
  const vals = {airfare:'pr-airfare',fuel:'pr-fuel',hotel:'pr-hotel',hotelName:'pr-hotel-name',
                meal:'pr-meal',vehicle:'pr-vehicle',guide:'pr-guide',sight:'pr-sight',sell:'pr-sell'};
  Object.keys(vals).forEach(k => { const e=document.getElementById(vals[k]); if(e) e.value = data.values[k] ?? ''; });
  renderPdfEvidence(data);
  return true;
}
"""

MEASURE = r"""
() => {
  const out = { cut: [], cols: 0, docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  const grid = document.getElementById('pr-airfare').closest('div[style*="grid"]');
  out.cols = new Set(Array.from(grid.children).map(c => Math.round(c.getBoundingClientRect().left))).size;
  out.rows = new Set(Array.from(grid.children).map(c => Math.round(c.getBoundingClientRect().top))).size;
  /* 잘린 글자 찾기 — scrollWidth가 clientWidth보다 크면 가로로 잘렸다는 뜻 */
  grid.querySelectorAll('.pr-ev-src, .pr-ev-check, option, .detail-label').forEach(el => {
    if (el.tagName === 'OPTION') return;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.cut.push({ cls: el.className, txt: (el.textContent||'').trim().slice(0,45), by: el.scrollWidth - el.clientWidth });
    }
  });
  /* select는 폭이 좁으면 글자가 안 보인다 — 가장 긴 옵션 길이와 칸 폭을 함께 잰다 */
  out.sel = Array.from(grid.querySelectorAll('select.pr-ev-pick')).map(s => ({
    w: Math.round(s.getBoundingClientRect().width),
    longest: Math.max(...Array.from(s.options).map(o => o.textContent.length)),
  }));
  return out;
}
"""

fail = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for label, w, h in [("데스크톱", 1280, 1000), ("태블릿", 860, 1000), ("모바일", 420, 1000)]:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto((ROOT / "admin.html").as_uri())
        pg.wait_for_timeout(1200)
        pg.evaluate(LOGIN); pg.evaluate(TAB, "tab-pricereport")
        pg.wait_for_timeout(200)
        pg.evaluate(FIXTURE)
        pg.wait_for_timeout(300)
        m = pg.evaluate(MEASURE)
        print(f"[{label} {w}px] 칸 배치 {m['cols']}열 x {m['rows']}행 · 문서 가로넘침 {m['docOverflow']}px · 잘린 글자 {len(m['cut'])}건")
        for c in m["cut"][:6]:
            print(f"    · {c['cls']} +{c['by']}px  «{c['txt']}»")
        widths = [s["w"] for s in m["sel"]]
        if widths:
            print(f"    후보 목록 폭 {min(widths)}~{max(widths)}px")
        if m["docOverflow"] > 0 or m["cut"]:
            fail += 1
        pg.screenshot(path=str(Path(__file__).parent / f"shot_prfields_{w}.png"), full_page=False,
                      clip={"x":0,"y":0,"width":w,"height":min(h,1000)})
        pg.close()
    b.close()
print("CHECK: " + ("확인 필요" if fail else "잘린 글자 없음"))
sys.exit(1 if fail else 0)

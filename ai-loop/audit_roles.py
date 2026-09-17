# -*- coding: utf-8 -*-
"""역할별로 담당자 화면을 태운다 — **직원이 첫날 보는 화면**을 재는 자.

🔴 **왜 만들었나** (2026-09-17)
   화면은 역할로 **10곳**을 가른다(`applyRolePermissionsToUI`). 그런데 기존 검사는
   전부 로그인을 건너뛰고 `dashPage`만 열어서 `currentUser`가 없는 상태로 잰다 —
   즉 **직원(staff)이 보는 화면을 아무도 본 적이 없다.**
   운영 DB 실측: 켜져 있는 직원 계정 0명. 코드가 전달되면 5명이 한꺼번에 `staff`로
   들어오는데, 그들이 무엇을 보는지 모르는 채로 맞이하게 된다.

🔴 **무엇을 판정하나 — 「감췄다」가 통과가 아니다.**
   버튼만 조용히 사라지면 직원은 **고장으로 읽는다**(결함 생성기 ②).
   감췄으면 그 자리에 **왜 없는지**가 있어야 한다. 이 도구는 그것을 본다.

⚠ 운영 DB에 아무것도 안 쓴다. 로컬 파일 + 가짜 응답만 쓴다.
⚠ 로그인을 건너뛰지 않고 **`currentUser`를 심어 `applyRolePermissionsToUI()`를 부른다** —
  그래야 실제 권한 코드가 돈다.
"""
import functools
import http.server
import json
import pathlib
import socketserver
import sys
import threading

sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


# 🔴 **`file://`로는 못 잰다.** 화면이 `fetch('/api/...')`를 부르는데 그 주소가
#    `file:///api/...`가 되어 **가로챌 수가 없다** — 가짜 로그인 응답이 안 먹고
#    `loadCurrentUser()`가 조용히 실패한다(이 저장소에서 세 번 겪은 자리다).
#    그래서 도구가 **제 서버를 띄운다.** 밖에서 아무것도 준비할 필요가 없다.
class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def _serve():
    handler = functools.partial(_Quiet, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d" % httpd.server_address[1]

ROLES = [("owner", "사장님"), ("manager", "매니저"), ("staff", "직원")]

# 권한으로 갈리는 자리 — `applyRolePermissionsToUI()`가 만지는 id를 그대로 적는다.
# ⚠ 화면이 이 목록보다 늘면 여기도 늘린다. 안 늘리면 새 자리가 조용히 안 재진다.
GATED = [
    ("navContent",            "콘텐츠 관리 메뉴",        "owner"),
    ("staffAdminSection",     "직원 계정 관리",          "owner"),
    ("ownerDataDangerZone",   "데이터 초기화 구역",      "owner"),
    ("btnRateBulk",           "요율 일괄 조정",          "manager"),
    ("btnNewDest",            "새 목적지 추가",          "manager"),
    ("pkgNewAdhoc",           "+ 직접 견적 작성",        "manager"),
    ("btnDeleteInquiry",      "문의 삭제",               "manager"),
    ("btnDeleteQuote",        "견적 삭제",               "manager"),
    ("clearAllBtn",           "문의 전체 삭제",          "manager"),
    ("emDeleteSelectedBtn",   "견적 선택 삭제",          "manager"),
    ("emClearAllBtn",         "견적 전체 삭제",          "manager"),
]

# 감췄을 때 「왜 없는지」를 말해 주는 자리가 있으면 여기 적는다.
EXPLAINERS = {"pkgNewAdhoc": "adhocGate"}

BOOT = """async () => {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashPage').classList.remove('hidden');
  /* 🔴 **`window.currentUser`로는 못 심는다.** 그 변수는 IIFE 안의 `let`이라
       바깥에서 넣어도 안 닿는다 — 처음에 그렇게 했다가 권한 코드가
       `if (!currentUser) return;`에서 그냥 빠져나갔고, 아무것도 안 바뀐 화면을
       보고 **없는 결함 14건을 찾았다고 할 뻔했다.**
     → 진짜 경로를 돈다: `loadCurrentUser()`가 API 응답으로 채우므로,
       그 응답을 가짜로 주고(위 route) 이 함수를 부른다. */
  const ok = await loadCurrentUser();
  if (!ok) return 'loadCurrentUser()가 실패했다 — 가짜 응답이 안 먹었다';
  try { applyRolePermissionsToUI(); } catch (e) { return String(e); }
  return null;
}"""

PROBE = r"""(args) => {
  const [ids, explainers] = args;
  const vis = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return true;
  };
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    const ex = explainers[id] ? document.getElementById(explainers[id]) : null;
    out[id] = {
      있나: !!el,
      보임: vis(el),
      설명: ex ? (vis(ex) ? (ex.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) : '') : null,
    };
  }
  // 왼쪽 메뉴에서 보이는 것
  out.__menus = [...document.querySelectorAll('.sidebar-item')]
    .filter((b) => getComputedStyle(b).display !== 'none'
                && getComputedStyle(b.closest('.sb-group-items') || b).display !== 'none')
    .map((b) => b.dataset.tab);
  return out;
}"""


def main():
    문제 = []
    httpd, base = _serve()
    URL = base + "/admin.html"
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for role, 이름 in ROLES:
            pg = b.new_page(viewport={"width": 1400, "height": 900})
            # 🔴 `?action=me`에 **그 역할을 실어 준다** — 화면이 이 값으로 권한을 가른다.
            # ⚠ 핸들러가 인자를 둘 받으면 Playwright가 두 번째에 **Request**를 넣는다 —
            #   `role` 자리에 그것이 들어가 JSON 직렬화에서 터졌다. 인자는 하나만 받는다.
            def make_route(role):
                def route(r, *_):
                    if "action=me" in r.request.url:
                        return r.fulfill(
                            status=200, content_type="application/json",
                            body=json.dumps({"id": "9", "displayName": "홍길동",
                                             "role": role, "active": True}))
                    return r.fulfill(status=200, content_type="application/json", body="{}")
                return route

            pg.route("**/api/**", make_route(role))
            pg.goto(URL)
            pg.wait_for_timeout(1400)
            err = pg.evaluate(BOOT)
            if err:
                print(f"  🔴 {이름}: 권한 코드가 터졌다 — {err}")
                문제.append((role, "applyRolePermissionsToUI 예외", err))
                pg.close()
                continue
            pg.wait_for_timeout(400)
            r = pg.evaluate(PROBE, [[g[0] for g in GATED], EXPLAINERS])

            print(f"\n■ {이름} ({role}) — 보이는 메뉴 {len(set(r['__menus']))}개")
            for gid, 라벨, 필요 in GATED:
                d = r[gid]
                if not d["있나"]:
                    print(f"   ·  {라벨:<18} 화면에 그 자리가 없다 (id={gid})")
                    문제.append((role, 라벨, "id가 화면에 없다 — 목록이 낡았다"))
                    continue
                허용 = (필요 == "owner" and role == "owner") or \
                       (필요 == "manager" and role in ("owner", "manager"))
                표 = "보임" if d["보임"] else "감춤"
                if 허용 and not d["보임"]:
                    print(f"   🔴 {라벨:<18} {표} — 쓸 수 있어야 하는데 없다")
                    문제.append((role, 라벨, "권한이 있는데 감춰졌다"))
                elif not 허용 and d["보임"]:
                    print(f"   🔴 {라벨:<18} {표} — 못 쓰는데 보인다")
                    문제.append((role, 라벨, "못 쓰는데 보인다 — 눌렀다 거절당한다"))
                elif not 허용:
                    말 = d["설명"]
                    if 말:
                        print(f"   ✓  {라벨:<18} 감춤 · 말함: 「{말[:50]}…」")
                    elif gid in EXPLAINERS:
                        print(f"   🔴 {라벨:<18} 감춤 · **아무 말도 안 한다**")
                        문제.append((role, 라벨, "감췄는데 왜인지 안 말한다"))
                    else:
                        print(f"   ·  {라벨:<18} 감춤 (설명 자리 없음)")
                else:
                    print(f"   ✓  {라벨:<18} 보임")
            pg.close()
        b.close()
    httpd.shutdown()

    print("\n" + "─" * 70)
    if 문제:
        print(f"🔴 문제 {len(문제)}가지")
        for role, 라벨, why in 문제:
            print(f"  · [{role}] {라벨} — {why}")
    else:
        print("✓ 역할별로 보이는 것과 감춰진 것이 전부 의도대로다")
    print("⚠ 이 도구가 통과했다고 **진짜 직원이 로그인해 본 것은 아니다.**")
    print(f"결과: {len(GATED) * len(ROLES) - len(문제)} pass / {len(문제)} fail")
    return 1 if 문제 else 0


if __name__ == "__main__":
    sys.exit(main())

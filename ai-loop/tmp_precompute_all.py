import sys, base64, json, re
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
from pathlib import Path

script_path = Path(__file__).parent.parent / "script.js"
content = script_path.read_text(encoding="utf-8")

# DEST_COORDS 파싱
start = content.index("const DEST_COORDS = {")
end = content.index("};", start) + 2
block = content[start:end]
entries = re.findall(r"'([^']+)':\[([\-\d.]+),([\-\d.]+)\]", block.replace(" ", ""))
dest_coords = {name: (float(lat), float(lng)) for name, lat, lng in entries}
print(f"파싱된 목적지 수: {len(dest_coords)}")

svg_path = Path(__file__).parent.parent / "이미지" / "world-map.svg"
svg_bytes = svg_path.read_bytes()
b64 = base64.b64encode(svg_bytes).decode('ascii')
data_uri = f"data:image/svg+xml;base64,{b64}"

html = f"""<!DOCTYPE html><html><body>
<img id="mapimg" src="{data_uri}">
</body></html>"""
tmp_html = Path(__file__).parent / "logs" / "precompute.html"
tmp_html.write_text(html, encoding="utf-8")

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1000, "height": 600})
    page.goto(tmp_html.resolve().as_uri())
    page.wait_for_timeout(500)

    coords_json = json.dumps({k: list(v) for k, v in dest_coords.items()})
    coords_json = coords_json.replace("'", "\\'")

    result = page.evaluate(f"""async () => {{
        const destCoords = {coords_json};
        const KOREA = [37.57, 126.98];

        const image = document.getElementById('mapimg');
        await new Promise(res => {{ if (image.complete) res(); else image.onload = res; }});
        const W = image.naturalWidth, H = image.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, W, H);
        const full = ctx.getImageData(0,0,W,H).data;

        function sampleAt(xF, yF) {{
            const px = Math.max(0,Math.min(W-1,Math.round(xF*W)));
            const py = Math.max(0,Math.min(H-1,Math.round(yF*H)));
            return full[(py*W+px)*4];
        }}

        function toFrac(lat, lng) {{
            let x = 0.0027822*lng + 0.459184;
            if (x < 0) x += 1;
            if (x > 1) x -= 1;
            const y = -0.0050917*lat + 0.494963;
            return {{x, y}};
        }}

        function snapToLand(xF, yF, maxPix) {{
            if (sampleAt(xF, yF) < 250) return {{x: xF, y: yF, snapped: false, distPix: 0}};
            let best = null, bestDist = Infinity;
            for (let dxp = -maxPix; dxp <= maxPix; dxp++) {{
                for (let dyp = -maxPix; dyp <= maxPix; dyp++) {{
                    const dist = Math.sqrt(dxp*dxp+dyp*dyp);
                    if (dist > maxPix || dist >= bestDist) continue;
                    const xF2 = xF + dxp/W, yF2 = yF + dyp/H;
                    if (sampleAt(xF2, yF2) < 250) {{ bestDist = dist; best = {{x: xF2, y: yF2}}; }}
                }}
            }}
            if (!best) return {{x: xF, y: yF, snapped: false, distPix: -1}}; // 실패 - land 못찾음
            return {{...best, snapped: true, distPix: bestDist}};
        }}

        const results = {{}};
        const koreaFrac = toFrac(KOREA[0], KOREA[1]);
        results['__KOREA__'] = snapToLand(koreaFrac.x, koreaFrac.y, 40);

        for (const [name, [lat,lng]] of Object.entries(destCoords)) {{
            const frac = toFrac(lat, lng);
            results[name] = snapToLand(frac.x, frac.y, 40);
        }}
        return results;
    }}""")

    # 결과 요약: 스냅 발생한 것들, 실패한 것들
    failed = []
    snapped = []
    for name, r in result.items():
        if r['distPix'] == -1:
            failed.append(name)
        elif r['snapped']:
            snapped.append((name, r['distPix']))

    print(f"\\n육지 못찾음(반경 40px 내): {len(failed)}개 -> {failed}")
    print(f"\\n보정(스냅) 발생: {len(snapped)}개")
    for n, d in sorted(snapped, key=lambda t: -t[1]):
        print(f"  {n}: {d:.1f}px 이동")

    out_path = Path(__file__).parent / "logs" / "precomputed_coords.json"
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\\n전체 결과 저장: {out_path}")

    b.close()

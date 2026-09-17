/* ═══════════════════════════════════════════════════════════════════════════
   견적서 한 건을 **줄 대 줄로** 엔진과 맞춰 본다 — 「엔진에 칸이 없는 돈」을 찾는 자

   ■ 왜 필요한가 (2026-09-17)
   `audit_error_decomp.js`는 **요율 아홉 칸을 움직여** 오차가 얼마나 줄어드는지 잰다.
   그래서 **애초에 칸이 없는 항목은 못 본다** — 그 도구가 「천장에서도 21건이 목표 밖,
   그건 요율이 아니라 구조다」라고 말한 그 구조가 여기 있다.
   이 도구는 반대로 본다: 견적서의 **소계 묶음**과 엔진의 **줄**을 나란히 놓고,
   **어느 묶음이 엔진에 대응이 없는가**를 센다.

   ⚠ 묶음 이름은 견적서마다 다르다 — 그래서 **소계(小計) 줄로 끊어** 그 앞 줄들을
     한 묶음으로 본다. 이건 EnBT 세부내역서 꼴에 맞춘 것이고, 다른 꼴에서는
     「못 끊었다」고 말한다(지어내지 않는다).
   ⚠ 운영 DB에 아무것도 안 쓴다.

   실행: node ai-loop/audit_quote_gap.js "한화손해보험 25년GA"
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { corpusFiles, DEFAULT_CORPUS } = require('./_corpus_files');
const { bootEngine } = require('./_engine_boot');
const { destFromName } = require('./_dest_from_name');

const 찾는말 = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const won = (n) => Math.round(n).toLocaleString('ko-KR');

/* 견적서 본문을 **소계로 끊어** 묶음을 만든다. */
function 묶음들(text) {
  const out = [];
  let 담을것 = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    const 소계 = t.match(/^소계\s+([\d,]+)/);
    if (소계) {
      out.push({ 합: Number(소계[1].replace(/,/g, '')), 줄: 담을것.slice() });
      담을것 = [];
      continue;
    }
    if (/[0-9]{1,3}(,[0-9]{3})+/.test(t) && !/^총|^1인|기준 환율/.test(t)) 담을것.push(t);
  }
  return out;
}

/* 묶음 이름 — 그 안의 줄에서 가장 많이 나오는 낱말로 정한다.
   ⚠ 이름을 못 붙이면 **「?」로 둔다.** 지어내면 그게 곧 잘못된 대조다. */
const 사전 = [
  ['항공', /항공|유류|택스/], ['호텔', /호텔|쉐라톤|노보텔|체크아웃|룸드랍|디럭스/],
  ['식사', /중식|석식|조식|호텔식|만찬/], ['차량', /인승|차량|기사/],
  ['가이드', /가이드/], ['관광·골프·기타', /골프|스파|마사지|입장료|관광|음료|케어/],
  ['행사 운영', /현수막|책자|공동경비|인솔자|DMC|제작/], ['보험', /보험/],
  ['수수료', /수수료/],
];
function 이름(줄들) {
  const 점수 = new Map();
  for (const [nm, re] of 사전) 점수.set(nm, 줄들.filter((l) => re.test(l)).length);
  let best = '?', n = 0;
  for (const [k, v] of 점수) if (v > n) { best = k; n = v; }
  return n ? best : '?';
}

(async () => {
  /* ⚠ `corpusFiles`는 배열이 아니라 `{files, dropped}`를 돌려준다(한 번 틀렸다). */
  /* ⚠ `corpusFiles`는 배열이 아니라 `{files, dropped}`를 돌려주고,
     그 `files`는 **파일 이름**이지 전체 경로가 아니다(둘 다 한 번씩 틀렸다). */
  const files = corpusFiles(DEFAULT_CORPUS).files.map((n) => path.join(DEFAULT_CORPUS, n));
  const hit = files.filter((f) => !찾는말.length || 찾는말.some((k) => path.basename(f).includes(k)));
  if (!hit.length) { console.log('그런 견적서가 없습니다:', 찾는말.join(' ')); process.exit(1); }

  const pdfParse = require('pdf-parse');
  const X = require(path.join(__dirname, '..', 'api', '_lib', 'pdf_extract.js'));
  const E = await bootEngine({ quiet: true });

  for (const f of hit) {
    const r = await X.extractQuote(fs.readFileSync(f), pdfParse, {});
    const pax = r.pax, per = r.perPerson, tot = r.grandTotal;
    const dest = destFromName(path.basename(f));
    const d = r.dates || {};
    if (!pax || !per || !dest || !dest.key) {
      console.log('\n■ ' + path.basename(f) + '\n   🔴 인원·1인당·목적지 중 하나를 못 읽어 대조할 수 없습니다.');
      continue;
    }
    const days = d.days || r.nightsResolved && r.nightsResolved + 1;
    const bd = E.run({ dest: dest.key, pax, days, departDate: d.departDate }, {});
    const 엔진줄 = (bd.rows || []).map((x) => ({ 이름: String(x.name || ''), 액: Math.round(x.amount || 0) }));
    const 엔진1인 = Math.round(bd.perPerson || bd.unit || 0);

    console.log('\n' + '═'.repeat(78));
    console.log('■ ' + path.basename(f));
    console.log(`   ${dest.key} · ${pax}명 · ${days}일 · ${d.departDate}`);
    console.log(`   견적서 1인 ${won(per)}   엔진 1인 ${won(엔진1인)}   차이 ${won(per - 엔진1인)} (${((엔진1인 / per - 1) * 100).toFixed(1)}%)`);

    const gs = 묶음들(r.text);
    if (!gs.length) { console.log('   ⚠ 소계 줄이 없어 묶음을 못 끊었습니다 — 이 견적서 꼴은 아직 못 읽습니다.'); continue; }

    /* 엔진 줄을 묶음 이름에 맞춰 더한다. */
    const 엔진묶음 = (nm) => {
      const re = { '항공': /항공|유류/, '호텔': /호텔/, '식사': /식사/, '차량': /차량/,
                   '가이드': /가이드/, '관광·골프·기타': /관광|골프/, '행사 운영': /부대비용/,
                   '보험': /보험/, '수수료': /수익/ }[nm];
      if (!re) return null;
      return 엔진줄.filter((x) => re.test(x.이름)).reduce((s, x) => s + x.액, 0);
    };

    console.log('\n   ' + '묶음'.padEnd(16) + '견적서 1인'.padStart(12) + '엔진 1인'.padStart(12) + '차이'.padStart(12) + '   엔진에 칸');
    console.log('   ' + '─'.repeat(70));
    let 칸없는합 = 0;
    for (const g of gs) {
      const nm = 이름(g.줄);
      const a = Math.round(g.합 / pax);
      const eRaw = 엔진묶음(nm);
      const e = eRaw === null ? null : Math.round(eRaw / pax);
      const diff = e === null ? a : a - e;
      const 칸 = e === null ? '🔴 없다' : (e === 0 ? '🔴 0원' : '있다');
      if (e === null || e === 0) 칸없는합 += a;
      console.log('   ' + nm.padEnd(16) + won(a).padStart(12) + (e === null ? '—' : won(e)).padStart(12)
        + (diff >= 0 ? '+' + won(diff) : won(diff)).padStart(12) + '   ' + 칸);
    }
    console.log('   ' + '─'.repeat(70));
    const gap = per - 엔진1인;
    console.log(`   묶음 단위로 「칸이 아예 없는」 것: ${won(칸없는합)}/인`);
    /* 🔴 **묶음 단위로만 보면 거짓 안심을 준다.** 골프는 「관광·골프·기타」 묶음 안에 있어서
         묶음으로는 「칸이 있다」로 보이는데, **그 목적지 요율의 골프 칸이 0이면 엔진은
         그 줄을 아예 안 만든다.** 처음에 이 도구가 「차이의 0%」라고 말했다 — 자가 틀렸다.
       → 요율 칸이 0인 것을 따로 짚는다. */
    const destRow = (typeof DR !== 'undefined' ? DR : require('../data.js'))
      .find((x) => x.destination_key === dest.key) || {};
    const 골프문서 = /골프|라운딩|캐디|골프장/.test(r.text || '');
    const 골프요율 = Number(destRow.golf_fee || 0);
    if (골프문서 && !골프요율) {
      console.log(`   🔴 **이 견적서는 골프 일정인데 「${dest.key}」 요율의 골프 칸이 0이다**`);
      console.log('      → 골프를 켜도 엔진은 그 줄을 아예 안 만든다. 묶음 표의 「있다」는 관광 칸이 있다는 뜻일 뿐이다.');
      console.log('      (결정대기열 0-m — 다낭·푸꾸옥·발리·하노이가 여기 해당한다)');
    }
    if (gap > 0) console.log(`   차이 ${won(gap)}/인 중 가장 큰 묶음부터 보는 것이 빠르다.`);
    console.log('   ⚠ 이 도구는 **판정하지 않는다.** 「이 항목을 엔진에 넣어야 하는가」는 대표가 정한다.');
  }
})();

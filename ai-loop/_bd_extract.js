/* ═══════════════════════════════════════════════════════════════════════════
   블랙다운 엑셀 한 장 → 원가 줄 (ZA)
   ───────────────────────────────────────────────────────────────────────────
   ⚠ **양식별 파서를 만들지 않는다.** 실측: 블랙다운 81개의 시트 이름이 40가지가
     넘는다(랜드사마다 제 양식이다). 양식을 세면 끝이 없고, 새 랜드사가 오는 날
     조용히 0줄이 된다.

   대신 **산수가 줄을 찾게 한다** — `단가 × 수량 = 총액`이 실제로 맞는 자리만 줍는다.
   이 방식의 값은 「우리가 그 칸을 단가라고 불렀다」가 아니라 **「곱해서 총액이 나왔다」**
   가 근거다. 견적서 PDF에서 세로 합 검산 하나로 값을 믿었던 것과 같은 이유다(UG).

   곱셈이 놓인 방향이 둘이라 둘 다 본다:
     ① 가로 — 한 줄 안에  「현지인가이드비 | 155 | 1 | 223,689」 (하나투어·유럽 양식)
     ② 세로 — 칸을 걸쳐  「요금 5900」 / 「개수 12」 / 「총 요금 70800」 (랜드사 격자)
        ⚠ 이걸 빼면 보홀·오키나와처럼 **가장 깨끗한 격자가 통째로 0줄**이 된다.
     ③ 그리고 곱하는 수가 **줄 밖 머리글**에 있는 양식이 있다(유럽 「COST | NBR」 +
        머리글 인원). 그래서 인원·일수를 후보 인수로 함께 넣는다.

   문서 종류도 여기서 가른다 — **폴더 이름은 근거가 아니다**(실측: 「블랙다운」 폴더에
   일정표가 3개 들어 있고, 같은 파일이 「대만」과 「시드니」 두 폴더에 있다):
     bd      요금 격자가 있다              → 요율 검산에 쓴다
     itin    일자별 일정만 있다            → 일정 DB 쪽으로 보낸다
     summary 1인당·총액만 있다(단가표 없음) → **결함이 아니다.** 문서에 표가 없는 것이다
             (WG에서 이 둘을 섞어 「못 읽음 9건」이라 잘못 세었다. 실제 결함은 3건이었다)

   ⚠ 못 읽은 것을 조용히 버리지 않는다. `why`에 이유를 남긴다(결함 생성기 ②).
   ⚠ 이 파일은 **판정만** 한다. 수익률을 얹는 것은 `_bd_revenue.js`가 따로 한다 —
     원가(문서가 말한 것)와 가정(우리가 정한 것)이 한 칸에 섞이면 되돌릴 수 없다.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const XLSX = require('xlsx');

/* ── 숫자 읽기 ───────────────────────────────────────────────────────────── */
/* 「1,234」「$ 1,234」「1 234」는 숫자, 「4/4-4/8」「2인1실」은 숫자가 아니다. */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const s = t.replace(/[,\s ]/g, '').replace(/^[￦$€¥£₩]/, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function text(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}
/* 엑셀 반올림·환산 때문에 딱 떨어지지 않는다. 0.5%까지 같은 값으로 본다. */
function close(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);
}

/* ── 시트를 격자로 ───────────────────────────────────────────────────────── */
const MAX_ROW = 1200;
const MAX_COL = 60;
function gridOf(ws) {
  if (!ws || !ws['!ref']) return [];
  const r = XLSX.utils.decode_range(ws['!ref']);
  const out = [];
  const eR = Math.min(r.e.r, MAX_ROW), eC = Math.min(r.e.c, MAX_COL);
  for (let R = r.s.r; R <= eR; R++) {
    const row = [];
    for (let C = r.s.c; C <= eC; C++) {
      const c = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      row.push(c && c.v !== undefined ? c.v : null);
    }
    out.push(row);
  }
  return out;
}

/* ── 머리글에서 읽는 것 ──────────────────────────────────────────────────── */
/* 인원 「25+1」「30+1TG」「60PAX + 2T/G」「17+0」 → 유상 25, 무상 1 */
const PAX_RE = /(\d{1,4})\s*(?:PAX|명)?\s*\+\s*(\d{1,2})/i;
const PAX_SOLO_RE = /^(\d{1,4})\s*(?:PAX|명)$/i;
const NIGHTS_RE = /(\d{1,2})\s*박\s*(\d{1,2})\s*일/;
/* 환율 — 「적용 환율」 아래 숫자, 또는 「1 USD = 1,380」 */
const CUR_RE = /\b(USD|EUR|JPY|CNY|PHP|VND|THB|TWD|SGD|MYR|IDR|AUD|HKD|KRW)\b/;

/* 「적용 환율」 — 문서가 **스스로 밝힌** 환율만 받는다.
   ⚠ 우리가 환율표에서 끌어와 채우지 않는다. 그러면 「우리가 고른 환율로 검산이
     닫혔다」가 되어, 검산이 아무것도 증명하지 못한다(결함 생성기 ③). */
/* ⚠ 라벨이 파일마다 다르다 — 「적용 환율」「싱가폴 환율」「1$」「1 USD」.
   그래서 **「환율」이 들어간 짧은 칸**과 「1<통화기호>」 꼴을 모두 받는다.
   ⚠ 값이 1이면 환율이 아니다(같은 통화라는 뜻이라 검산에 아무 힘이 없다). */
const FX_LABEL = /(환\s*율|EXCHANGE\s*RATE|^1\s*[$￦₩]$|^1\s*(USD|EUR|JPY|CNY|PHP|VND|THB|TWD|SGD|MYR|IDR)$)/i;
function readFx(grid) {
  for (let R = 0; R < grid.length; R++) {
    for (let C = 0; C < grid[R].length; C++) {
      const t = text(grid[R][C]);
      if (!t || t.length > 20 || !FX_LABEL.test(t)) continue;
      /* 라벨 오른쪽, 그리고 **아래 두 줄**까지 본다(라벨과 값이 세로로 놓인 양식) */
      const cand = [];
      for (let k = C + 1; k < Math.min(C + 8, grid[R].length); k++) cand.push(num(grid[R][k]));
      for (let d = 1; d <= 2 && R + d < grid.length; d++)
        for (let k = C; k < Math.min(C + 8, grid[R + d].length); k++) cand.push(num(grid[R + d][k]));
      for (const n of cand) if (n !== null && n > 1.5 && n < 30000) return n;
    }
  }
  return null;
}

function readHeader(grid) {
  const h = { pax: null, paxFoc: null, days: null, nights: null, groups: null, currency: null, title: null };
  const scan = Math.min(grid.length, 40);
  for (let R = 0; R < scan; R++) {
    for (let C = 0; C < grid[R].length; C++) {
      const t = text(grid[R][C]);
      if (!t || t.length > 40) continue;
      /* 인원 — 「인원」 라벨 오른쪽 6칸 안에서 찾는다 */
      /* ⚠ 라벨 앞에 말이 붙는다 — 「기준 인원」「총 인원」「참가 인원」. 앞을 막아 두면
             하노이 양식 12건이 통째로 인원 미상이 된다(실측). */
      if (h.pax === null && /(^|\s)(인\s*원|여행\s*인원|견적\s*인원|행사\s*인원|PAX|인원수)\s*$/i.test(t)) {
        /* 한 줄에 인원이 놓이는 방식이 셋이라 **글자 → 갈린 칸 → 맨 앞 숫자** 순으로 본다.
           「30+1TG」(한 칸) · 「25 | + | 1」(갈림) · 「13 | ADT | + | 0 | FOC」(라벨만 끼어듦).
           ⚠ 순서가 중요하다 — 맨 앞 숫자를 먼저 집으면 「25 | + | 1」에서 무상을 잃는다. */
        for (let k = C; k < Math.min(C + 8, grid[R].length); k++) {
          const s = text(grid[R][k]);
          const m = s.match(PAX_RE) || s.match(PAX_SOLO_RE);
          if (m) { h.pax = +m[1]; h.paxFoc = m[2] === undefined ? 0 : +m[2]; break; }
          const n = num(grid[R][k]);
          if (n !== null && n >= 2 && n <= 3000 && Number.isInteger(n)) {
            h.pax = n;
            /* 오른쪽 4칸 안에 「+ 숫자」가 있으면 그게 무상 인원이다 */
            h.paxFoc = 0;
            for (let j = k + 1; j < Math.min(k + 5, grid[R].length); j++) {
              if (text(grid[R][j]) !== '+') continue;
              const fo = num(grid[R][j + 1]);
              if (fo !== null && fo >= 0 && fo <= 30) h.paxFoc = fo;
              break;
            }
            break;
          }
        }
      }
      /* 🔴 「그룹 수」 = 버스(조) 대수. 유럽 양식은 기사·가이드 관련 줄이 **조마다** 붙어
         단가 × 수량 **× 조 수**가 된다. 이 수는 줄 밖 머리글에만 있다.
         실측으로 확인: 바르셀로나 100명은 4, 체코 150명은 5 — 기사호텔·기사식사·
         로컬가이드·가이드식사가 **전부** 그 배수로 맞는다(우연이 아니다). */
      if (h.groups === null && /(^|\s)(그룹\s*수|그룹수|버스\s*대수|차량\s*대수)\s*$/.test(t)) {
        for (let d = 0; d <= 1 && R + d < grid.length; d++)
          for (let k = (d ? C : C + 1); k < Math.min(C + 8, grid[R + d].length); k++) {
            const n = num(grid[R + d][k]);
            if (n !== null && n >= 1 && n <= 30 && Number.isInteger(n)) { h.groups = n; break; }
          }
      }
      const nm = t.match(NIGHTS_RE);
      if (nm && h.nights === null) { h.nights = +nm[1]; h.days = +nm[2]; }
      if (!h.currency) { const cm = t.match(CUR_RE); if (cm) h.currency = cm[1].toUpperCase(); }
    }
  }
  return h;
}

/* ── ① 가로: 한 줄 안에서 a × b = c ─────────────────────────────────────── */
/* 후보 인수에 머리글 인원·일수를 함께 넣는다(줄 밖에 곱하는 수가 있는 양식). */
function rowArith(cells, extras) {
  const ns = [];
  cells.forEach((v, i) => { const n = num(v); if (n !== null && n !== 0) ns.push({ n, i }); });
  if (ns.length < 2) return null;
  const best = [];
  /* 총액 후보는 뒤에서부터 — 표는 왼쪽이 단가, 오른쪽이 총액이다. */
  for (let t = ns.length - 1; t >= 1; t--) {
    const tot = ns[t].n;
    if (Math.abs(tot) < 100) continue;          /* 100 미만을 총액이라 부르지 않는다 */
    const parts = ns.slice(0, t);
    for (let a = 0; a < parts.length; a++) {
      for (let b = a + 1; b < parts.length; b++) {
        if (close(parts[a].n * parts[b].n, tot))
          best.push({ unit: parts[a].n, qty: parts[b].n, total: tot, at: ns[t].i, via: '가로' });
        /* 🔴 인수가 **셋**인 줄 — 「이더호텔 | 60 | 3박 | 6실 | 1,080」.
           둘까지만 곱해 보면 셋 다 1이 아닌 줄을 통째로 놓친다. 실측: 오사카·대만
           양식에서 놓친 돈의 대부분이 이 한 가지였다(호텔·석식처럼 큰 줄이 걸린다).
           ⚠ 「7000 | 12명 | 3박」처럼 **단가가 맨 앞**이라 unit은 a로 고정한다. */
        for (let c = b + 1; c < parts.length; c++)
          if (close(parts[a].n * parts[b].n * parts[c].n, tot))
            best.push({ unit: parts[a].n, qty: parts[b].n * parts[c].n, total: tot, at: ns[t].i, via: '가로3' });
      }
      for (const e of extras)
        if (close(parts[a].n * e.v, tot))
          best.push({ unit: parts[a].n, qty: e.v, total: tot, at: ns[t].i, via: '가로+' + e.name });
      for (let b = a + 1; b < parts.length; b++) for (const e of extras)
        if (close(parts[a].n * parts[b].n * e.v, tot))
          best.push({ unit: parts[a].n, qty: parts[b].n * e.v, total: tot, at: ns[t].i, via: '가로+' + e.name });
    }
    if (best.length) break;   /* 가장 오른쪽에서 닫히면 거기가 총액이다 */
  }
  if (!best.length) return null;
  /* 여럿이면 인수가 적은 것(가로) 우선 — 우연히 맞는 조합을 덜 고르게 */
  best.sort((x, y) => x.via.length - y.via.length || y.total - x.total);
  return best[0];
}

/* ── ② 세로: 「요금 / 인원·개수 / 총 요금」 세 줄이 칸을 걸쳐 맞는가 ────────── */
const L_UNIT = /^(요\s*금|단\s*가|금\s*액|COST|단가|요금\(?\w*\)?)$/i;
const L_QTY = /^(인\s*원|개\s*수|수\s*량|일\s*수|박\s*수|인원\s*\/\s*개수|인원\/객실|NBR|PAX)$/i;
const L_TOT = /^(총\s*요\s*금|총\s*금\s*액|소\s*계|합\s*계|TOTAL|총액)$/i;

function colArith(grid, extras) {
  const found = [];
  for (let R = 0; R < grid.length; R++) {
    /* 라벨이 어느 칸에 있든 찾는다(A열이 병합된 양식이 많다) */
    let unitAt = -1;
    for (let C = 0; C < Math.min(grid[R].length, 6); C++) if (L_UNIT.test(text(grid[R][C]))) { unitAt = C; break; }
    if (unitAt < 0) continue;
    /* 아래 4줄 안에서 수량 줄과 총액 줄을 찾는다 */
    let qtyR = -1, totR = -1, qtyAt = -1, totAt = -1;
    for (let k = R + 1; k <= Math.min(R + 4, grid.length - 1); k++) {
      for (let C = 0; C < Math.min(grid[k].length, 6); C++) {
        const t = text(grid[k][C]);
        if (qtyR < 0 && L_QTY.test(t)) { qtyR = k; qtyAt = C; }
        if (totR < 0 && L_TOT.test(t)) { totR = k; totAt = C; }
      }
      if (totR >= 0) break;
    }
    if (totR < 0) continue;
    const labelRow = R - 1 >= 0 ? grid[R - 1] : [];
    const startC = Math.max(unitAt, qtyAt, totAt) + 1;
    for (let C = startC; C < grid[R].length; C++) {
      const u = num(grid[R][C]);
      const tot = num(grid[totR][C]);
      if (u === null || tot === null || tot === 0) continue;
      const q = qtyR >= 0 ? num(grid[qtyR][C]) : null;
      let qty = null;
      if (q !== null && close(u * q, tot)) qty = q;
      else if (close(u, tot)) qty = 1;
      else { for (const e of extras) if (close(u * e.v, tot)) { qty = e.v; break; } }
      if (qty === null) continue;
      const label = text(labelRow[C]) || text(grid[R - 1] ? grid[R - 1][0] : '') || '';
      /* 🔴 줄 이름과 **분류**는 다른 것이다. 세로 격자에서 줄 이름은 「헤난」「알로나」
         같은 **호텔·식당 이름**이고, 「숙박」「중식」은 블록 왼쪽 칸(A열)에 한 번만 있다.
         분류를 안 실으면 요율 칸에 못 넣는다 — 실측: 미분류가 853줄 중 510줄이었다. */
      const group = text(grid[R][0]) || text(grid[R - 1] ? grid[R - 1][0] : '') || '';
      found.push({ r: totR, c: C, label, group, unit: u, qty, total: tot, via: '세로' });
    }
  }
  return found;
}

/* ── 줄 이름 고르기 ──────────────────────────────────────────────────────── */
/* 총액 칸 **왼쪽**에서 가장 가까운 글자. 없으면 줄 맨 앞의 구분 라벨. */
function labelFor(cells, at) {
  for (let i = at - 1; i >= 0; i--) {
    const t = text(cells[i]);
    if (t && num(cells[i]) === null && t.length <= 60 && !/^[→※*■□●]/.test(t)) return t;
  }
  for (let i = 0; i < cells.length; i++) {
    const t = text(cells[i]);
    if (t && num(cells[i]) === null) return t;
  }
  return '';
}

/* 줄의 **구분** — 맨 앞 두 칸의 글자. 병합돼 비어 있으면 위로 6줄까지 거슬러 잇는다
   (엑셀에서 「① 호텔」이 여러 줄에 걸쳐 병합되면 첫 줄에만 값이 있다). */
/* 🔴 **분류가 아닌 것**은 건너뛴다. 이 자리에 날짜(「2일차」)와 단위(「명」「JPY」)가
   들어오는 양식이 많은데, 그걸 분류로 받으면 그 줄은 영영 미분류가 된다
   (실측: 미분류 305줄 중 45줄이 「2일차 ▸ JPY」 하나였다). */
const NOT_GROUP = /^(\d{1,2}\s*일\s*차|제\s*\d{1,2}\s*일|DAY\s*\d{1,2}|명|인|대|박|회|일|식|EA|PAX|TTL|JPY|USD|EUR|VND|KRW|SGD|THB|TWD|PHP|CNY|MYR|IDR|₩|\$)$/i;
function groupFor(grid, R) {
  for (let d = 0; d <= 12 && R - d >= 0; d++) {
    for (let C = 0; C < 3; C++) {
      const t = text(grid[R - d][C]);
      if (!t || num(grid[R - d][C]) !== null || t.length > 24) continue;
      if (NOT_GROUP.test(t)) continue;
      return t;
    }
  }
  return '';
}

/* ── 문서가 말한 총계·1인당 ─────────────────────────────────────────────── */
/* ⚠ 「합계」만으로는 안 된다 — 구간 소계도 「합계」라 적힌다(싱가폴 원가표는 절마다
   「합 계」가 있고 맨 아래에 `TOTAL`이 따로 있다). **총계는 가장 큰 것**을 고른다. */
const T_TOTAL = /(총\s*견적\s*금액|총\s*합\s*계|합\s*계\s*금액|총\s*금액|총\s*계|총\s*지상비|지상비\s*합\s*계|총\s*비용|GRAND\s*TOTAL|^\s*TOTAL\s*(\(\w+\))?\s*$|TOTAL\s*COST)/i;
const T_PP = /(인\s*당|1\s*인\s*당|인당\s*견적|인당\s*경비|금액\s*\(?\s*인당\s*\)?|PER\s*PERSON|^\s*p\s*\/\s*p)/i;
/* 🔴 총계를 **하나로 찍지 않는다.** 라벨이 붙은 칸을 모두 후보로 모으고, 나중에
   「우리 합과 닫히는 것」을 고른다. 하나로 찍으면 반드시 틀린 칸을 고른다 —
   실측: 싱가폴 원가표의 `p/p (SGD)` 줄에는 USD·**KRW**·SGD가 나란히 있어서
   가장 큰 것을 집으면 **원화 1인당**을 1인당 SGD라고 부르게 된다(비율 0.001).
   ⚠ 그래서 라벨 오른쪽의 **첫 숫자**만 후보로 넣는다. 「가장 큰 것」은 통화가 섞인
     줄에서 언제나 원화를 고른다. */
function readTotals(grid) {
  const totals = [], perPersons = [];
  for (let R = 0; R < grid.length; R++) {
    for (let C = 0; C < grid[R].length; C++) {
      const t = text(grid[R][C]);
      if (!t || t.length > 30) continue;
      const isT = T_TOTAL.test(t), isP = T_PP.test(t);
      if (!isT && !isP) continue;
      /* 라벨 오른쪽에서 처음 나오는 0이 아닌 숫자들 — 통화가 갈려 여럿일 수 있어
         앞의 두 개까지 받는다(첫 칸이 0인 양식이 있다). */
      const got = [];
      for (let k = C + 1; k < Math.min(C + 10, grid[R].length) && got.length < 2; k++) {
        const n = num(grid[R][k]);
        if (n !== null && n > 0) got.push(n);
      }
      for (const n of got) (isT ? totals : perPersons).push({ label: t, v: n });
    }
  }
  return { totals, perPersons };
}

/* ── 일정표인가 ─────────────────────────────────────────────────────────── */
const DAY_RE = /(제\s*0?\d{1,2}\s*일|0?\d{1,2}\s*일\s*차|DAY\s*0?\d{1,2})/i;
function dayMarkers(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) { const t = text(v); if (t && t.length <= 12 && DAY_RE.test(t)) { n++; break; } }
  return n;
}

/* ── 한 파일 ────────────────────────────────────────────────────────────── */
function extractBd(abs) {
  let wb;
  try { wb = XLSX.read(fs.readFileSync(abs), { type: 'buffer', cellDates: true }); }
  catch (e) { return { ok: false, why: '열지 못함: ' + e.message.slice(0, 60) }; }

  const sheets = [];
  for (const name of wb.SheetNames) {
    const grid = gridOf(wb.Sheets[name]);
    if (!grid.length) continue;
    const header = readHeader(grid);
    const extras = [];
    if (header.pax) {
      extras.push({ name: '인원', v: header.pax });
      if (header.paxFoc) extras.push({ name: '인원+무상', v: header.pax + header.paxFoc });
    }
    if (header.nights) extras.push({ name: '박수', v: header.nights });
    if (header.groups && header.groups > 1) extras.push({ name: '그룹수', v: header.groups });

    const rows = [];
    for (let R = 0; R < grid.length; R++) {
      const hit = rowArith(grid[R], extras);
      if (hit) rows.push({
        r: R, c: hit.at, label: labelFor(grid[R], hit.at),
        /* 가로 양식은 줄 맨 앞 칸이 구분이다(「① 호텔」「식 사」). 병합돼 비면 위 줄에서 잇는다. */
        group: groupFor(grid, R),
        unit: hit.unit, qty: hit.qty, total: hit.total, via: hit.via,
      });
    }
    /* ── 🔴 남는 인수를 **문서가 스스로 증명하게 한다** ─────────────────────────
       유럽 양식은 기사·가이드 줄이 조(버스)마다 붙어 `단가 × 수량 × 조수`가 되는데,
       그 조 수가 줄 밖에만 있다. 머리글 라벨을 쫓아가 봤지만 파일마다 이름이 달라
       실패했다(「그룹 수」가 있는 파일과 없는 파일이 섞여 있다).

       그래서 **라벨을 찾지 않는다.** 못 닫힌 줄마다 「a × b 에 얼마를 더 곱해야 총액이
       되는가」를 구하고, **같은 정수 하나가 3줄 이상을 설명할 때만** 그 수를 받는다.
       근거가 「우리가 머리글에서 읽었다」가 아니라 **「서로 다른 줄 셋이 같은 수를
       가리킨다」**가 된다 — 우연히 맞는 수는 여러 줄을 동시에 설명하지 못한다.
       ⚠ 3줄 미만이면 받지 않는다. 한 줄만 맞는 수는 언제나 있다(총액 ÷ a×b).
       ⚠ 받은 줄에는 `via`에 「(추정 k)」를 남긴다 — 나중에 이 줄들만 따로 볼 수 있어야 한다. */
    const resid = new Map();
    for (let R = 0; R < grid.length; R++) {
      if (rows.some((x) => x.r === R)) continue;
      const ns = [];
      grid[R].forEach((v, i) => { const n = num(v); if (n !== null && n !== 0) ns.push({ n, i }); });
      if (ns.length < 3) continue;
      const tot = ns[ns.length - 1];
      if (Math.abs(tot.n) < 100) continue;
      for (let a = 0; a < ns.length - 1; a++) for (let b = a + 1; b < ns.length - 1; b++) {
        const base = ns[a].n * ns[b].n;
        if (!base) continue;
        const k = tot.n / base;
        if (k < 2 || k > 20 || Math.abs(k - Math.round(k)) > 0.001) continue;
        const kk = Math.round(k);
        if (!resid.has(kk)) resid.set(kk, []);
        resid.get(kk).push({ r: R, at: tot.i, unit: ns[a].n, qty: ns[b].n * kk, total: tot.n });
      }
    }
    let bestK = null;
    for (const [k, list] of resid) {
      const uniq = [...new Map(list.map((x) => [x.r, x])).values()];
      if (uniq.length >= 3 && (!bestK || uniq.length > bestK.list.length)) bestK = { k, list: uniq };
    }
    if (bestK) {
      const seen = new Set(rows.map((x) => x.r));
      for (const x of bestK.list) {
        if (seen.has(x.r)) continue;
        seen.add(x.r);
        rows.push({ r: x.r, c: x.at, label: labelFor(grid[x.r], x.at), group: groupFor(grid, x.r), unit: x.unit, qty: x.qty, total: x.total, via: '가로+조수(추정 ' + bestK.k + ')' });
      }
    }

    /* 세로에서 찾은 것은 가로가 이미 잡은 자리를 덮지 않는다(같은 돈을 두 번 세지 않는다) */
    const taken = new Set(rows.map((x) => x.r + ':' + x.c));
    for (const v of colArith(grid, extras)) if (!taken.has(v.r + ':' + v.c)) { rows.push(v); taken.add(v.r + ':' + v.c); }

    /* 🔴 합계 줄을 항목으로 세지 않는다 — 같은 돈을 두 번 세면 커버리지가 100%를
       넘어 「다 읽었다」로 보인다. 실측: 이걸 빼기 전 상위 25%가 168%였다. */
    const SUM_LABEL = /(합\s*계|소\s*계|총\s*계|총\s*요금|총\s*금액|TOTAL|SUB\s*TOTAL)/i;
    const items = rows.filter((x) => !SUM_LABEL.test(x.label || ''));

    const totals = readTotals(grid);
    sheets.push({
      name, header, rows: items, dropped: rows.length - items.length,
      totals: totals.totals, perPersons: totals.perPersons, fx: readFx(grid), grid,
      dayRows: dayMarkers(grid), gridRows: grid.length,
    });
  }
  if (!sheets.length) return { ok: false, why: '빈 통합문서' };

  /* 요금 격자가 가장 굵은 시트를 그 파일의 대표로 삼는다 */
  const priced = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
  const itin = sheets.slice().sort((a, b) => b.dayRows - a.dayRows)[0];

  let kind = 'unknown', why = null;
  if (priced.rows.length >= 3) kind = 'bd';
  else if (itin.dayRows >= 2) { kind = 'itin'; why = '일정표만 있다 (요금 줄 ' + priced.rows.length + '개)'; }
  else if (priced.perPersons.length || priced.totals.length) { kind = 'summary'; why = '1인당·총액만 있고 단가표가 없다'; }
  else why = '요금 줄도 일정도 못 찾음';

  /* 🔴 문서의 총계가 항목 줄로 섞여 들어오는 일이 있다 — 보홀 격자의 맨 아래 「합계」
     줄이 그것이다. 그러면 같은 돈을 두 번 세어 합이 정확히 총계만큼 부푼다
     (실측: 환율이 59여야 하는데 60.0이 나왔다 — 딱 한 배가 얹힌 값이다).
     ⚠ 라벨로는 못 막는다. 그 줄의 이름은 위 칸에서 따오므로 「합계」가 아니다.
       **값으로** 막는다: 총계 후보와 같은 금액인 줄은 항목이 아니다. */
  const totalVals = priced.totals.map((x) => x.v);
  const isTotalRow = (x) => totalVals.some((v) => close(x.total, v));
  if (priced.rows.length >= 4) priced.rows = priced.rows.filter((x) => !isTotalRow(x));

  const rowSum = priced.rows.reduce((a, x) => a + x.total, 0);
  const pax = priced.header.pax;
  /* 총계 후보 = 라벨 붙은 총계 + (1인당 × 인원). 어느 것이 맞는지는 검산이 정한다. */
  const cands = priced.totals.slice();
  if (pax) for (const p of priced.perPersons) cands.push({ label: p.label + ' × 인원', v: p.v * pax });

  /* ── 🔴 검산: 우리가 읽은 합이 문서와 맞는가 ──────────────────────────────
     닫히는 길이 셋이고, **어느 길로 닫혔는지 이름을 남긴다.** 「닫혔다」만 남기면
     나중에 왜 닫혔는지 되짚을 수 없고, 우연히 닫힌 것과 구분되지 않는다.
     ⚠ 안 닫힌 것을 「오차」라 부르지 않는다 — 원인이 통화·다구간·조 분리로 제각각이라
       한 이름으로 묶으면 진짜 결함이 그 안에 묻힌다(WD의 「어긋남 ≠ 결함」). */
  let closedBy = null, docTotal = null, ratio = null;
  const fx = priced.fx;
  for (const c of cands) {
    if (close(rowSum, c.v)) { closedBy = '같은 통화'; docTotal = c.v; break; }
    /* 통화가 갈린 양식이 둘 다 있다 — 항목이 현지화·총계가 기준통화(보홀: PHP/USD),
       그 반대(싱가폴: 항목 SGD·총계 KRW). 문서가 밝힌 환율로 양쪽을 다 본다. */
    if (fx && close(rowSum, c.v * fx)) { closedBy = '환율 ' + fx + ' (총계가 기준통화)'; docTotal = c.v * fx; break; }
    if (fx && close(rowSum * fx, c.v)) { closedBy = '환율 ' + fx + ' (항목이 기준통화)'; docTotal = c.v / fx; break; }
  }
  if (!closedBy) {
    /* 문서 어딘가에 우리 합과 같은 칸이 있으면 문서가 우리 합을 인정한 것이다.
       ⚠ 라벨을 안 보므로 **줄이 3개 이상일 때만** 받는다(작은 표에서 우연히 맞는다). */
    if (priced.rows.length >= 3) outer: for (const row of priced.grid) for (const v of row) {
      const n = num(v);
      if (n !== null && n > 0 && close(n, rowSum)) { closedBy = '문서에 우리 합과 같은 칸이 있다'; docTotal = rowSum; break outer; }
    }
  }
  /* 안 닫혔으면 **가장 큰 후보**를 총계로 적고 비율을 남긴다 — 비율이 원인을 말한다.
     ⚠ 이 값을 「문서의 총계」라고 부르지 않는다. 어느 것도 검산을 통과하지 못했다. */
  if (!closedBy && cands.length) {
    docTotal = cands.reduce((a, c) => Math.max(a, c.v), 0);
    ratio = rowSum / docTotal;
  }

  return {
    ok: kind !== 'unknown', kind, why,
    sheetNames: wb.SheetNames,
    sheet: priced.name, header: priced.header, fx,
    rows: priced.rows, rowSum, sumRowsDropped: priced.dropped,
    docTotal, totalCands: priced.totals, ppCands: priced.perPersons,
    dayRows: itin.dayRows, itinSheet: itin.name,
    closedBy, ratio,
    /* 🔴 커버리지 = 「우리가 읽은 돈 ÷ 문서가 말한 돈」.
       줄 **개수**는 아무것도 말하지 않는다 — 총계의 0.3%만 읽고도 줄은 많을 수 있다(YS). */
    coverage: closedBy ? 1 : ratio,
  };
}

module.exports = { extractBd, num, close, gridOf };

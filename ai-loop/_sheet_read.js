/* ═══════════════════════════════════════════════════════════════════════════
   엑셀(.xlsx) · CSV를 **의존성 없이** 읽는다 (VY)
   ───────────────────────────────────────────────────────────────────────────
   2026-08-24 대표: 「엑셀 파일 그대로 업데이트하려면?」

   ⚠ **`xlsx` 패키지를 쓰지 않았다.** 이 저장소는 jsdom을 `package.json`에 없이
     `--no-save`로 두고 있어서, 누가 `npm install` 한 번만 돌리면 npm이 그것을
     「불필요한 패키지」로 정리해 버린다 — 실제로 그 사고로 테스트 42개 파일이 한 번에
     죽은 적이 있다(CLAUDE.md). 사장님이 쓰실 투입 도구가 그런 식으로 깨지면 안 된다.
     .xlsx는 결국 **zip 안의 XML**이라 Node 기본 기능(zlib)만으로 읽힌다.

   ⚠ **파일 형식을 짐작하지 않는다.** 확장자가 아니라 **앞 두 바이트**로 가른다 —
     'PK'면 zip(=xlsx), 아니면 텍스트(csv)다. 확장자만 믿으면 「.xlsx로 저장했지만
     실은 csv」인 파일(엑셀에서 흔하다)에서 조용히 빈 결과를 낸다.

   반환: { sheet, rows }  rows = 2차원 배열(값은 문자열 또는 숫자)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const zlib = require('zlib');

/* ── ZIP ─────────────────────────────────────────────────────────────────────
   중앙 디렉터리(EOCD)부터 읽는다. 로컬 헤더만 훑으면 data descriptor가 붙은
   항목에서 크기가 0이라 잘못 자른다. */
function unzipEntries(buf) {
  /* EOCD: 0x06054b50. 주석이 붙을 수 있어 뒤에서부터 찾는다 */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 구조를 찾지 못했습니다 (EOCD 없음)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;      /* 중앙 디렉터리 헤더 */
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');

    /* 로컬 헤더에서 실제 데이터 시작 위치를 다시 잰다 — extra 길이가 다를 수 있다 */
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(start, start + compSize);

    try {
      out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    } catch (e) {
      /* ⚠ 못 푼 항목을 **조용히 건너뛰지 않는다** — 그게 하필 시트면 「빈 엑셀」이 된다 */
      out[name] = null;
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

/* ── XML ── 필요한 만큼만. 값에 <>&가 들어갈 수 있어 되돌린다 */
function unesc(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    /* ⚠ **16진수 문자참조(&#x9;)도 푼다.** 10진수만 처리했더니 실제 파일에서
       상품명 끝에 `&#x9;&#x9;`(탭)가 **그대로 남아 고객 화면까지 갈 뻔했다**(10건). */
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');   /* &amp;를 마지막에 — 먼저 풀면 &amp;lt;가 <가 된다 */
}

/* sharedStrings: <si> 하나가 문자열 하나. 서식이 섞이면 <r><t> 여럿으로 쪼개진다 */
function readSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(''));
}

/* 엑셀 날짜는 1899-12-30 기준 일련번호다. 그 범위의 숫자만 날짜로 본다
   (20000 ≈ 1954년, 60000 ≈ 2064년 — 금액이 이 범위에 들 일은 없다). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serialToDate(n) {
  const d = new Date(EXCEL_EPOCH + Math.round(n) * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}
function maybeDate(v) {
  return (typeof v === 'number' && v >= 20000 && v <= 60000) ? serialToDate(v) : v;
}

/* 셀 참조(A1·AB12) → 0부터 세는 열 번호 */
function colOf(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf) {
  const files = unzipEntries(buf);
  const shared = readSharedStrings(files['xl/sharedStrings.xml'] && files['xl/sharedStrings.xml'].toString('utf8'));

  /* 첫 시트를 쓴다. ⚠ 이름을 **밝혀서** 돌려준다 — 여러 시트짜리 파일에서
     엉뚱한 장을 읽고도 모르는 일이 없게 한다. */
  const sheetNames = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort();
  if (!sheetNames.length) throw new Error('시트를 찾지 못했습니다');
  const xml = files[sheetNames[0]] && files[sheetNames[0]].toString('utf8');
  if (!xml) throw new Error('시트를 읽지 못했습니다(압축 해제 실패)');

  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attr = cm[1], body = cm[2];
      const ref = (/r="([A-Z]+\d+)"/.exec(attr) || [])[1] || '';
      const type = (/t="([^"]+)"/.exec(attr) || [])[1] || 'n';
      let val = null;
      if (type === 'inlineStr') {
        val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join('');
      } else {
        const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        if (v == null) val = null;
        else if (type === 's') val = shared[Number(v)] != null ? shared[Number(v)] : '';
        else if (type === 'str') val = unesc(v);
        else { const n = Number(v); val = Number.isFinite(n) ? n : unesc(v); }
      }
      cells[colOf(ref)] = val;
    }
    rows.push(Array.from(cells, (c) => (c === undefined ? null : c)));
  }
  return { sheet: sheetNames[0].replace('xl/worksheets/', ''), rows };
}

/* ── CSV ── 따옴표 안의 쉼표·줄바꿈까지 본다. 엑셀이 내보내는 모양 그대로. */
function readCsv(text) {
  const t = text.replace(/^﻿/, '');            /* BOM */
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\r') { /* 무시 — \n에서 줄을 끊는다 */ }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  /* 숫자로 보이는 칸은 숫자로 — 금액 비교가 문자열로 되면 조용히 틀린다 */
  return {
    sheet: '(csv)',
    rows: rows.map((r) => r.map((c) => {
      const s = String(c).trim();
      if (s === '') return null;
      const n = Number(s.replace(/,/g, ''));
      return (/^-?[\d,]+(\.\d+)?$/.test(s) && Number.isFinite(n)) ? n : s;
    })),
  };
}

/* 확장자가 아니라 **내용**으로 가른다 */
function readSheet(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return readXlsx(buf);   /* 'PK' */
  return readCsv(buf.toString('utf8'));
}

module.exports = { readSheet, readXlsx, readCsv, maybeDate, serialToDate, colOf, unesc };

/* ═══════════════════════════════════════════════════════════════════════════
   블랙다운·일정표 폴더의 파일 목록 — **단일 출처** (ZA)
   ───────────────────────────────────────────────────────────────────────────
   2026-09-07 대표가 새 표본을 주셨다: `바탕화면\일정표 & 블랙다운`.
   블랙다운 = **현지 랜드사가 청구한 지상비 원가 시트**(단가 × 인원이 날짜별로 적혀
   있다). 일정표 = 하나투어 양식의 날짜별 일정. 견적서 모음(PDF)과 **성격이 다르다**:

       견적서 모음(PDF)   → 고객에게 나간 **판매가**  → 역검증 정답지
       블랙다운(엑셀)     → 랜드사가 청구한 **원가**  → 요율표 9칸 단가 검산

   ⚠ **`_corpus_files.js`와 합치지 않는다.** 둘은 재는 대상이 다르다. 원가 시트를
     정답지에 섞으면 오차 부호를 못 읽는다(SH에서 이미 한 번 겪었다).

   ⚠ **왜 이 파일이 따로 있나.** 코퍼스에서 도구 17개가 저마다 `readdirSync`를 하다
     같은 PDF를 두 번 세어 「일본이 낮다」의 27%가 중복이었던 일이 있다(VA).
     같은 실수를 새 폴더에서 되풀이하지 않으려고 **처음부터** 한 곳에 둔다.

   빼는 것 넷 — 전부 **이유와 함께** 돌려준다(조용히 버리지 않는다):
     ① `~$…`      엑셀이 파일을 열어 둔 동안 만드는 임시본
     ② 바이트 해시 중복  같은 파일이 두 폴더에 들어간 것도 여기서 걸린다
     ③ 🔴 DRM 암호화     `.symxlsx`는 소프트캠프 문서보안이 걸린 **암호문**이다.
        SheetJS가 이것을 **에러 없이 「열어」** 난수를 시트 한 장으로 돌려준다 —
        걸러 내지 않으면 쓰레기가 조용히 실측으로 들어간다(결함 생성기 ②).
        판정은 확장자가 아니라 **매직바이트 `ESAC`** 로 한다.
     ④ 표가 아닌 것    .pdf/.jpg/.docx — 이 도구로는 못 읽는다(따로 다룬다)

   ⚠ **폴더 이름은 목적지의 근거가 아니다.** 실측: 같은 파일
     `QA00699514001_키움에셋플래너 세부내역서`가 「대만 블랙다운」과 「시드니 블랙다운」
     **두 곳에 들어 있다**(바이트까지 같다). 폴더는 힌트로만 싣고, 목적지 판정은
     문서 내용으로 한다.

   실행: node ai-loop/_bd_files.js        — 지금 폴더에 무엇이 있고 무엇이 빠지는지
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ROOT = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Desktop', '일정표 & 블랙다운'
);

/* SheetJS가 읽을 수 있는 표 */
const TABLE_EXT = new Set(['.xls', '.xlsx', '.xlsm']);
/* 「무엇무엇 (1).xlsx」 — 윈도우가 같은 이름을 또 받을 때 붙이는 꼬리.
   같은 내용이 여럿이면 **꼬리 없는 이름을 남긴다**(사람이 원래 넣은 것). */
const COPY_SUFFIX_RE = /\s\(\d+\)(?=\.[^.]+$)/;
/* 하나투어 견적번호. 같은 건의 원가와 판매가를 이어 붙이는 열쇠다. */
const QUOTE_NO_RE = /Q[A-Z]0{2}\d{9}/;
/* 소프트캠프 문서보안 컨테이너의 머리 4바이트 */
const DRM_MAGIC = Buffer.from('ESAC', 'ascii');

/* 폴더 이름 「보홀 블랙다운」 → 「보홀」. **힌트일 뿐 판정이 아니다**(위 ⚠ 참고). */
function folderHint(rel) {
  const parts = rel.split(path.sep);
  if (parts.length < 2) return null;
  return parts[1].replace(/\s*(블랙다운|일정표)\s*$/, '').trim() || null;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* @param {string} root              폴더(없으면 기본값)
   @param {{quiet?: boolean}} opts   quiet면 안내를 안 찍는다(테스트용)
   @returns {{files: BdFile[], dropped: {file: string, why: string, sameAs?: string}[]}}
   BdFile = { abs, rel, kind:'bd'|'itin', folderHint, quoteNo, ext, md5 } */
function bdFiles(root, opts) {
  const dir = root || process.env.BIZPAGE_BD || DEFAULT_ROOT;
  const quiet = !!(opts && opts.quiet);
  if (!fs.existsSync(dir)) {
    if (!quiet) console.log('폴더가 없습니다: ' + dir);
    return { files: [], dropped: [], root: dir };
  }

  const all = walk(dir, []).sort();
  const dropped = [];
  const kept = [];
  const byHash = new Map();

  for (const abs of all) {
    const rel = path.relative(dir, abs);
    const base = path.basename(abs);
    const ext = path.extname(abs).toLowerCase();

    if (base.startsWith('~$')) { dropped.push({ file: rel, why: '엑셀 임시본' }); continue; }

    const buf = fs.readFileSync(abs);
    /* 확장자보다 먼저 본다 — .symxlsx가 아닌 이름으로 들어와도 잡히게 */
    if (buf.length >= 4 && buf.subarray(0, 4).equals(DRM_MAGIC)) {
      dropped.push({ file: rel, why: '🔴 문서보안(DRM) 암호화 — 해제된 원본이 필요합니다' });
      continue;
    }
    if (!TABLE_EXT.has(ext)) { dropped.push({ file: rel, why: '표가 아님 (' + ext + ')' }); continue; }

    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    if (!byHash.has(md5)) byHash.set(md5, []);
    byHash.get(md5).push(rel);

    const top = rel.split(path.sep)[0];
    kept.push({
      abs, rel, md5, ext,
      kind: top === '일정표' ? 'itin' : 'bd',
      folderHint: folderHint(rel),
      quoteNo: (base.match(QUOTE_NO_RE) || [null])[0],
    });
  }

  /* 바이트가 같은 것끼리 한 벌만 남긴다. 남기는 것이 매번 같아야 결과가 재현된다. */
  const drop = new Map();
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const keep = group.slice().sort((a, b) => {
      const ca = COPY_SUFFIX_RE.test(a) ? 1 : 0;
      const cb = COPY_SUFFIX_RE.test(b) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      return a.localeCompare(b);
    })[0];
    for (const g of group) if (g !== keep) drop.set(g, keep);
  }

  const files = kept.filter((f) => {
    if (!drop.has(f.rel)) return true;
    dropped.push({ file: f.rel, why: '바이트가 같은 파일이 이미 있음', sameAs: drop.get(f.rel) });
    return false;
  });

  if (!quiet && dropped.length) {
    console.log('ℹ 파일 ' + all.length + '개 중 ' + dropped.length + '개를 뺐습니다 (아래 이유).');
  }
  return { files, dropped, root: dir };
}

module.exports = { bdFiles, DEFAULT_ROOT };

if (require.main === module) {
  const { files, dropped, root } = bdFiles(process.argv[2]);
  console.log('■ ' + root + '\n');
  const bd = files.filter((f) => f.kind === 'bd');
  const it = files.filter((f) => f.kind === 'itin');
  console.log('   쓸 수 있는 표 ' + files.length + '개 — 블랙다운 ' + bd.length + ' · 일정표 ' + it.length);
  console.log('   견적번호가 있는 것 ' + files.filter((f) => f.quoteNo).length
    + '개 (고유 ' + new Set(files.filter((f) => f.quoteNo).map((f) => f.quoteNo)).size + '건)');

  const byHint = new Map();
  for (const f of files) {
    const k = f.folderHint || '(폴더 없음)';
    byHint.set(k, (byHint.get(k) || 0) + 1);
  }
  console.log('\n   ── 폴더가 말하는 목적지 ' + byHint.size + '곳 (힌트일 뿐, 판정은 문서로)');
  console.log('      ' + [...byHint.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + ' ' + v).join(' · '));

  console.log('\n   ── 뺀 것 ' + dropped.length + '개');
  for (const d of dropped) {
    console.log('      · ' + d.why + (d.sameAs ? ' → ' + d.sameAs : ''));
    console.log('        ' + d.file);
  }
}

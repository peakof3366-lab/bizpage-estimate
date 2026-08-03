/* 클라우드 백업 사본 설정. `node ai-loop/setup_cloud_backup.js`로 실행.

   ── 실행 ────────────────────────────────────────────────────────────────
   node ai-loop/setup_cloud_backup.js            무엇을 할지 '계획'만 출력(기본)
   node ai-loop/setup_cloud_backup.js --apply    계획대로 실행
   node ai-loop/setup_cloud_backup.js --dir "경로"  폴더를 직접 지정

   ── 무엇을 하나 ────────────────────────────────────────────────────────
   ① 이 PC에서 구글 드라이브 동기화 폴더를 찾는다(미러링·스트리밍 둘 다).
   ② 그 안에 백업 폴더를 만든다.
   ③ .env.local에 BACKUP_MIRROR_DIR를 적는다(저장소에 커밋되지 않는 파일이다).
   ④ 이미 있는 백업 파일들을 사본 폴더로 복사한다.

   ── 왜 '사본'인가 (주 저장소를 옮기지 않는 이유) ────────────────────────
   스트리밍 모드에서 G: 드라이브는 **구글 드라이브 앱이 켜져 있을 때만 존재한다.**
   백업 위치를 통째로 옮기면 앱이 꺼진 날엔 백업이 아예 안 된다. 그래서 노트북에
   먼저 쓰고(항상 성공) 클라우드에 사본을 올린다(되면 올린다). 미러링을 쓰면 사본
   폴더가 평범한 로컬 폴더가 되어 앱이 꺼져 있어도 사본까지 성공한다 — 그게 더 좋지만,
   안 그래도 백업 자체는 절대 실패하지 않는다.

   ⚠ 다시 실행해도 안전하다. 이미 있는 파일은 덮어쓰지 않고 건너뛴다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const KEY = 'BACKUP_MIRROR_DIR';
const FOLDER_NAME = '비즈페이지_백업';

/* 구글 드라이브 폴더 이름은 언어 설정에 따라 다르다. 둘 다 본다. */
const DRIVE_NAMES = ['내 드라이브', 'My Drive'];

/* 미러링이면 사용자 폴더(또는 지정한 곳)에, 스트리밍이면 가상 드라이브(보통 G:)에 붙는다.
   드라이브 문자를 G로 못 박지 않는다 — 이미 G가 쓰이고 있으면 다른 문자로 붙는다. */
function findDriveFolders(io = fs) {
  const found = [];
  const home = process.env.USERPROFILE || '';
  const roots = [];

  if (home) roots.push(home);
  for (let i = 4; i < 26; i++) roots.push(String.fromCharCode(65 + i) + ':\\');  // E: ~ Z:

  for (const root of roots) {
    for (const name of DRIVE_NAMES) {
      const p = path.join(root, name);
      try {
        if (io.existsSync(p) && io.statSync(p).isDirectory()) {
          found.push({ path: p, mode: root === home ? '미러링' : '스트리밍' });
        }
      } catch { /* 접근 불가한 드라이브는 건너뛴다 */ }
    }
  }
  return found;
}

/* .env.local에서 키 하나만 바꾼다. 다른 줄(자격증명!)은 손대지 않고, 줄바꿈 방식도
   원본을 따른다 — 파일 전체를 다시 쓰면 CRLF로 바뀌어 diff가 통째로 부푼다. */
function upsertEnv(text, key, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  const line = `${key}=${value}`;
  if (idx >= 0) {
    if (lines[idx] === line) return { text, changed: false };
    lines[idx] = line;
    return { text: lines.join(eol), changed: true };
  }
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  lines.push('', '# DB 백업 클라우드 사본 위치 (ai-loop/setup_cloud_backup.js가 씀)', line, '');
  return { text: lines.join(eol), changed: true };
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : fallback;
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');

  const backupTool = require('./db_backup');
  require('./_load_env')();

  console.log('클라우드 백업 사본 설정\n' + '─'.repeat(60));

  /* ── 대상 폴더 정하기 ── */
  let mirrorDir = argValue(argv, '--dir', null);
  let mode = '직접 지정';
  if (mirrorDir) {
    mirrorDir = path.resolve(mirrorDir);
  } else {
    const drives = findDriveFolders();
    if (!drives.length) {
      console.error('✗ 구글 드라이브 동기화 폴더를 찾지 못했습니다.');
      console.error('  · 구글 드라이브 앱이 켜져 있고 로그인돼 있는지 확인해 주세요.');
      console.error('  · 폴더를 직접 지정하려면: --dir "경로"');
      process.exit(1);
    }
    /* 미러링(로컬 폴더)이 있으면 그쪽을 고른다 — 앱이 꺼져 있어도 사본이 만들어진다. */
    const pick = drives.find((d) => d.mode === '미러링') || drives[0];
    mirrorDir = path.join(pick.path, FOLDER_NAME);
    mode = pick.mode;
    if (drives.length > 1) {
      console.log('찾은 동기화 폴더:');
      drives.forEach((d) => console.log(`  · ${d.path}  (${d.mode})`));
    }
  }

  console.log(`대상 폴더 : ${mirrorDir}`);
  console.log(`연결 방식 : ${mode}`
    + (mode === '스트리밍'
      ? '  ⚠ 앱이 꺼져 있으면 사본을 못 올립니다(노트북 백업은 정상). 미러링을 권합니다.'
      : ''));

  const current = backupTool.resolveBackupDir([]);
  const existing = backupTool.listBackups(current.dir);
  console.log(`노트북 백업 : ${current.dir}  (${existing.length}개)`);

  const already = (process.env[KEY] || '').trim();
  if (already) console.log(`지금 설정값 : ${already}`);

  /* ── 계획 ── */
  const willCreate = !fs.existsSync(mirrorDir);
  const alreadyThere = fs.existsSync(mirrorDir) ? backupTool.listBackups(mirrorDir) : [];
  const toCopy = existing.filter((f) => !alreadyThere.includes(f));

  console.log('\n할 일:');
  console.log(`  ${willCreate ? '·' : '-'} 폴더 ${willCreate ? '만들기' : '이미 있음'}`);
  console.log(`  ${path.resolve(already || '') === mirrorDir ? '-' : '·'} .env.local의 ${KEY} ${already ? '고치기' : '적기'}`);
  console.log(`  ${toCopy.length ? '·' : '-'} 기존 백업 ${toCopy.length}개 복사`
    + (alreadyThere.length ? ` (이미 ${alreadyThere.length}개 있음 — 건너뜀)` : ''));

  if (!apply) {
    console.log('\n계획만 출력했습니다. 실제로 하려면 --apply 를 붙이세요.');
    return;
  }

  /* ── 실행 ── */
  console.log('\n실행:');
  if (willCreate) {
    if (!fs.existsSync(path.dirname(mirrorDir))) {
      console.error(`✗ 상위 폴더가 없습니다: ${path.dirname(mirrorDir)}`);
      console.error('  구글 드라이브 앱이 켜져 있는지 확인해 주세요.');
      process.exit(1);
    }
    fs.mkdirSync(mirrorDir, { recursive: true });
    console.log(`  ✓ 폴더 생성: ${mirrorDir}`);
  }

  const envText = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const next = upsertEnv(envText, KEY, mirrorDir);
  if (next.changed) {
    fs.writeFileSync(ENV_FILE, next.text, 'utf8');
    console.log(`  ✓ .env.local에 ${KEY} 기록`);
  } else {
    console.log(`  - .env.local은 이미 같은 값 (그대로 둠)`);
  }

  let copied = 0;
  for (const f of toCopy) {
    const src = path.join(current.dir, f);
    const dst = path.join(mirrorDir, f);
    fs.copyFileSync(src, dst);
    const check = backupTool.verifyFile(dst);
    if (!check.ok) {
      console.error(`  ✗ ${f} — 복사본을 다시 읽어 확인하지 못했습니다`);
      continue;
    }
    copied++;
  }
  if (toCopy.length) console.log(`  ✓ 기존 백업 ${copied}/${toCopy.length}개 복사(읽어서 확인까지)`);

  console.log('\n다음 할 일:');
  console.log('  node ai-loop/db_backup.js         ← 한 번 돌려 사본이 올라가는지 확인');
  console.log('  node ai-loop/db_backup.js --list  ← 노트북·클라우드 양쪽 상태 보기');
}

module.exports = { findDriveFolders, upsertEnv, DRIVE_NAMES, FOLDER_NAME, KEY };

if (require.main === module) {
  try { main(); } catch (err) { console.error(err); process.exit(1); }
}

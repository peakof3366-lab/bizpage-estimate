/* QL 검증: 일정 관리 '활동 고르기' — 담당자가 빈 칸을 매번 타이핑하던 것을 고르게 한다.

   왜 이 테스트가 필요한가: 이 기능의 값어치는 전부 "후보가 맞는 값인가"에 달려 있다.
   후보를 어딘가에 복사해 두면 일정을 고쳐도 후보는 안 바뀌고, 담당자는 **이미 폐기된
   문구를 고객 견적서에 넣게 된다.** 화면에는 아무 이상이 없어 보인다(결함 생성기 ①·②).

   여기서 고정하는 것:
   ① 후보는 **지금 실제로 쓰이는 값**에서 나온다. 오버라이드가 있으면 그 값이 후보이고
      data.js 기본값 문구는 후보에서 사라져야 한다. 일부러 오버라이드를 넣어 확인한다.
   ② 범위(이 목적지·같은 지역·전체)가 REGION_MAP 기준으로 실제로 다르게 걸린다.
   ③ 값이 하나인 칸(오전 등)은 바꿔치기이고, 내용이 있으면 **묻고 나서** 바꾼다.
      목록 칸(하이라이트 등)은 줄을 더하며 기존 줄을 지우지 않는다.
   ④ 고른 값이 dirty로 잡힌다 — 안 잡히면 저장 안 하고 목적지를 바꿔도 경고가 없어
      방금 고른 게 조용히 날아간다.
   ⑤ 고른 결과가 서버 검증(api/content.js normalizeCourses)을 그대로 통과한다.
      화면에서만 되는 값이면 저장 순간 400으로 튕긴다.

   실행: node ai-loop/test_qL_activity_picker.js  (프로젝트 루트에서) */
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { htmlWithDeps } = require('./_jsdom_deps');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  const dom = await bootAdmin();
  const w = dom.window, d = w.document;

  console.log('\n[1] 칸마다 “고르기” 버튼이 실제로 붙는가');
  /* QY: 방식 A·B와 날짜별 일정은 한 화면의 두 구역이다. '고르기'는 **두 구역 모두**에
     있어야 하므로 양쪽 body를 함께 본다 — 한쪽만 보면 옮겨간 칸의 버튼이 빠져도 모른다. */
  w.__itiSelect('도쿄');
  const labelsWithBtn = Array.from(d.querySelectorAll('#iti-body .iti-lbl-row, #rec-body .iti-lbl-row'))
    .map((r) => r.querySelector('.iti-lbl').textContent.split('(')[0].split('—')[0].trim());
  const want = ['그날의 제목', '오전', '오후', '저녁', '참고 팁', '핵심 하이라이트', '핵심 포인트', '일별 주요 활동'];
  for (const label of want) {
    ok(`“${label}” 칸에 고르기 버튼이 있다`, labelsWithBtn.includes(label),
      '있는 것: ' + Array.from(new Set(labelsWithBtn)).join(', '));
  }
  ok('코스 제목처럼 목적지 고유한 칸에는 안 붙였다', !labelsWithBtn.includes('코스 제목'));

  console.log('\n[1-2] 후보가 추천 순서로 나오는가 (QW) — 예전엔 사실상 무작위였다');
  /* 후보가 1,000건대라 순서가 곧 쓸모다. 목적지 순회 순서 그대로 내보내면 담당자는
     스크롤로 찾게 되고, 그러면 타이핑보다 느려져 기능 자체를 안 쓰게 된다. */
  const rank = w.__candidates('dayAct', 'all', '도쿄');
  ok('후보가 충분히 있다', rank.length > 50, `${rank.length}건`);
  ok('빈도(uses)를 세어 준다 — 예전엔 버리던 정보다',
    rank.every(c => typeof c.uses === 'number' && c.uses >= 1));

  const firstOther = rank.findIndex(c => !c.here);
  ok('이 목적지에서 쓰는 문구가 맨 위에 모인다',
    firstOther > 0 && rank.slice(0, firstOther).every(c => c.here),
    `앞쪽 ${firstOther}건이 이 목적지`);
  const afterHere = rank.slice(firstOther);
  const firstFar = afterHere.findIndex(c => !c.sameRegion);
  ok('그 다음이 같은 지역이다',
    firstFar === -1 || afterHere.slice(0, firstFar).every(c => c.sameRegion));
  /* QX: 그 다음이 **기업 연수 적합도**(1 연수 → 2 보완 → 3 여가)이고,
     같은 등급 안에서 여러 곳이 쓰는 문구가 위로 온다('검증된 문구'가 먼저). */
  const far = afterHere.slice(firstFar === -1 ? afterHere.length : firstFar);
  ok('등급을 매겨 준다 (연수·보완·여가)',
    far.every(c => [1, 2, 3].includes(c.fit)), far.slice(0, 5).map(c => c.fit).join(','));
  ok('연수 적합도가 높은 것이 위로 온다',
    far.every((c, i) => i === 0 || far[i - 1].fit <= c.fit),
    far.slice(0, 8).map(c => c.fit).join(','));
  ok('같은 등급 안에서는 여러 곳이 쓰는 문구가 위로 온다',
    far.every((c, i) => i === 0 || far[i - 1].fit < c.fit || far[i - 1].uses >= c.uses),
    far.slice(0, 8).map(c => `${c.fit}/${c.uses}`).join(' '));
  /* 등급이 아예 안 실렸으면(파일 누락) 전부 중립 2가 되어 위 단언이 조용히 통과한다.
     실제로 등급 파일이 붙어 있는지 따로 확인한다 — 안전망이 무력해지는 자리다. */
  ok('등급 파일이 실제로 실려 있다',
    new Set(far.map(c => c.fit)).size > 1,
    '전부 같은 등급이면 activity_rank.js가 안 실린 것이다');

  /* 순서가 매번 흔들리면 아까 본 것을 다시 못 찾는다. */
  const again = w.__candidates('dayAct', 'all', '도쿄');
  ok('두 번 불러도 순서가 같다', rank.map(c => c.text).join('|') === again.map(c => c.text).join('|'));

  /* 범위를 좁혀도 빈도가 납작해지면 안 된다 — 전체에서 세야 순위가 살아 있다. */
  const regional = w.__candidates('dayAct', 'region', '도쿄');
  ok('범위를 좁혀도 빈도는 전체 기준이다',
    regional.some(c => c.uses > 1) || regional.length < 3,
    regional.slice(0, 5).map(c => `${c.uses}`).join(','));

  console.log('\n[1-3] 두 구역 어디서 열든 같은 목적지를 기준으로 잡는가 (QY)');
  /* 목적지 선택이 하나이므로 두 구역의 고르기는 **반드시 같은 목적지**를 봐야 한다.
     (QU에서 화면을 갈랐을 때는 여기가 어긋나 ✨ 쪽이 엉뚱한 후보를 냈다.) */
  w.__itiSelect('오사카');
  ok('✨ 구역의 고르기가 열린다', w.__openRecPicker('핵심 포인트'));
  ok('고른 목적지가 기준이 된다', w.__pickDest() === '오사카', w.__pickDest());
  w.__pickClose();
  w.__itiSelect('도쿄');

  console.log('\n[1-3b] 출처 표시가 사실대로인가 (RA) — "왜 다른 지역 문구가 여기 있지?"를 없앤다');
  /* ⚠ 실제로 겪은 결함이다. 출처를 '전 목적지를 훑다 처음 만난 곳'으로 정해서,
     방콕을 보고 있는데 "후쿠오카"가 출처로 떴다. 담당자는 다른 지역 문구가 섞였다고 읽는다.
     실은 방콕도 쓰는 문구인데 라벨이 거짓말을 한 것이다. */
  for (const dest of ['방콕', '파리']) {
    w.__itiSelect(dest);
    const my = w.REGION_MAP[dest] || '';
    for (const scope of ['region', 'all']) {
      const list = w.__candidates('dayAct', scope, dest);
      /* 3곳 이상 쓰는 문구는 '여러 곳 공통'으로 묶어 출처를 말하지 않으므로 제외한다. */
      const named = list.filter(c => c.uses < 3 && !c.here);
      const wrong = named.filter(c => c.sameRegion && (w.REGION_MAP[c.from] || '') !== my);
      ok(`${dest}/${scope}: 같은 지역 문구에 다른 지역 이름이 붙지 않는다`,
        wrong.length === 0, wrong.slice(0, 3).map(c => `${c.from}(${w.REGION_MAP[c.from]})`).join(', '));
    }
  }
  w.__itiSelect('방콕');
  w.__openPicker('dayAct', w.__fieldInput('오전'));
  w.__setScope('all');
  const froms = Array.from(d.querySelectorAll('#itiPickList .itip-item-from'));
  const kinds = new Set(froms.map(e => e.className.replace('itip-item-from', '').trim()).filter(Boolean));
  ok('출처를 네 갈래로 구분해 말한다 (이 목적지·같은 지역·여러 곳 공통·다른 지역)',
    kinds.has('from-here') && kinds.has('from-region') && kinds.has('from-common') && kinds.has('from-far'),
    [...kinds].join(', '));
  ok('널리 쓰이는 일반 문구는 특정 목적지 이름을 달지 않는다',
    froms.filter(e => /여러 곳 공통/.test(e.textContent)).every(e => !/·\s*[가-힣]+\s*외/.test(e.textContent)),
    '“공항 이동”(37곳) 같은 문구에 한 곳을 골라 붙이면 그 지역 것으로 오해된다');
  ok('다른 지역 문구는 “다른 지역”이라고 밝힌다',
    froms.some(e => /^다른 지역 · /.test(e.textContent)),
    froms.slice(0, 5).map(e => e.textContent).join(' | '));

  const scopeChips = Array.from(d.querySelectorAll('#itiPickScopes .itip-chip')).map(b => b.textContent);
  ok('범위 이름이 어느 지역인지 말한다', scopeChips.some(t => /같은 지역 \(동남아\)/.test(t)), scopeChips.join(' | '));
  ok('“전체”가 다른 지역을 포함한다는 사실을 이름에 적는다',
    scopeChips.some(t => /전체 \(다른 지역 포함\)/.test(t)), scopeChips.join(' | '));
  w.__pickClose();
  w.__itiSelect('도쿄');

  console.log('\n[1-4] 기업 연수 적합도 필터 (QZ) — 900건 가까운 후보를 한 번에 좁힌다');
  /* 배지를 보여주는 것만으로는 부족하다. '연수'만 눌러 거를 수 있어야 실제로 빨라진다. */
  const amBox0 = w.__fieldInput('오전');
  w.__openPicker('dayAct', amBox0);
  w.__setScope('all');
  const fitChips = () => Array.from(d.querySelectorAll('#itiPickFits .itip-chip'));
  ok('등급 필터 칩이 4개다 (전체·연수·보완·여가)', fitChips().length === 4,
    fitChips().map(b => b.textContent).join(' | '));
  ok('칩마다 건수가 적혀 있다', fitChips().every(b => /\d+$/.test(b.textContent.trim())),
    fitChips().map(b => b.textContent).join(' | '));

  /* ⚠ 목록은 300건까지만 그린다. 화면에 보이는 개수로 재면 필터가 들었는지 알 수 없다
     (889건도 439건도 화면에는 300개로 똑같이 보인다). 실제 건수로 잰다. */
  const fitAllCount = w.__filteredCount();
  fitChips()[1].click();   /* '연수' */
  const badges = Array.from(d.querySelectorAll('#itiPickList .itip-fit')).map(e => e.textContent);
  ok('거르면 그 등급만 남는다', badges.length > 0 && badges.every(b => b === '연수'),
    Array.from(new Set(badges)).join(','));
  const fitCount = w.__filteredCount();
  ok('걸러진 건수가 전체보다 적다', fitCount < fitAllCount, `${fitCount} < ${fitAllCount}`);
  ok('절반 가까이 줄어든다 (실제로 쓸모가 있는 정도)', fitCount < fitAllCount * 0.75,
    `${fitCount}/${fitAllCount}`);

  fitChips()[0].click();   /* 다시 '전체' */
  ok('전체로 되돌리면 다시 늘어난다', w.__filteredCount() === fitAllCount);

  /* ⚠ 창을 새로 열면 필터가 풀려 있어야 한다 — 지난번에 '여가'로 걸러 둔 채 열리면
     "후보가 왜 이것뿐이지?"가 되는데, 창을 새로 연 사람은 그 사실을 모른다. */
  fitChips()[3].click();   /* '여가'로 걸러 둔 채 닫는다 */
  w.__pickClose();
  w.__openPicker('dayAct', amBox0);
  ok('창을 새로 열면 등급 필터가 풀린다', w.__pickFit() === 0, String(w.__pickFit()));
  w.__pickClose();

  console.log('\n[2] 후보가 “지금 쓰이는 값”에서 나오는가 — 일부러 오버라이드를 얹는다 (결함 생성기 ①)');
  const beforeAct = w.__candidates('dayAct', 'this').map((c) => c.text);
  const defaultPhrase = beforeAct[0];
  ok('오버라이드 전에는 data.js 기본값 문구가 후보다', !!defaultPhrase && beforeAct.length > 3,
    `${beforeAct.length}건`);

  w.__setOverride('도쿄', [{
    title: '뒤바뀐 코스', subtitle: '', highlights: ['뒤바뀐 하이라이트'],
    days: [{ day: 1, title: '뒤바뀐 제목', am: '뒤바뀐 오전 활동', pm: '', eve: '', tip: '' }],
  }]);
  const afterAct = w.__candidates('dayAct', 'this').map((c) => c.text);
  ok('오버라이드한 문구가 후보에 나온다', afterAct.includes('뒤바뀐 오전 활동'), afterAct.join(' | '));
  ok('덮인 기본값 문구는 후보에서 사라진다', !afterAct.includes(defaultPhrase),
    '남아 있으면 폐기된 문구를 고객에게 넣게 된다');
  w.__clearOverrides();

  console.log('\n[3] 범위가 REGION_MAP 기준으로 실제로 다르게 걸리는가');
  const nThis   = w.__candidates('dayAct', 'this').length;
  const nRegion = w.__candidates('dayAct', 'region').length;
  const nAll    = w.__candidates('dayAct', 'all').length;
  ok('이 목적지 < 같은 지역 < 전체', nThis < nRegion && nRegion < nAll, `${nThis} / ${nRegion} / ${nAll}`);
  const regionSrc = new Set(w.__candidates('dayAct', 'region').map((c) => c.from));
  const jp = new Set(Object.keys(w.REGION_MAP).filter((k) => w.REGION_MAP[k] === '일본'));
  ok('같은 지역 후보의 출처가 전부 같은 지역 목적지다',
    Array.from(regionSrc).every((k) => jp.has(k)), Array.from(regionSrc).join(', '));
  ok('전체 후보에는 다른 지역 목적지도 섞인다',
    w.__candidates('dayAct', 'all').some((c) => !jp.has(c.from)));

  console.log('\n[4] 값이 하나인 칸 — 바꿔치기, 내용이 있으면 묻는다');
  const amBox = w.__fieldInput('오전');
  amBox.value = '';
  w.__openPicker('dayAct', amBox);
  ok('창이 열린다', !d.getElementById('itiPickModal').classList.contains('hidden'));
  const first = d.querySelector('#itiPickList .itip-item:not([disabled])');
  ok('후보가 목록에 그려진다', !!first);
  const firstText = first.querySelector('.itip-phrase').textContent;

  w.__confirmReply = false; w.__confirmCalls = 0;
  first.click();
  ok('빈 칸이면 묻지 않고 바로 들어간다', w.__confirmCalls === 0 && amBox.value === firstText,
    `묻기=${w.__confirmCalls} 값=${JSON.stringify(amBox.value)}`);
  ok('넣고 나면 창이 닫힌다', d.getElementById('itiPickModal').classList.contains('hidden'));
  ok('편집 중(저장 안 함) 표시가 켜진다', w.__isDirty(), '안 켜지면 목적지를 바꿀 때 경고가 없다');

  w.__openPicker('dayAct', amBox);
  const other = Array.from(d.querySelectorAll('#itiPickList .itip-item:not([disabled])'))
    .find((b) => b.querySelector('.itip-phrase').textContent !== firstText);
  w.__confirmCalls = 0; w.__confirmReply = false;
  other.click();
  ok('내용이 있으면 먼저 묻는다', w.__confirmCalls === 1);
  ok('아니오면 값이 그대로다', amBox.value === firstText, JSON.stringify(amBox.value));
  w.__confirmReply = true;
  other.click();
  const otherText = other.querySelector('.itip-phrase').textContent;
  ok('예면 바뀐다', amBox.value === otherText);

  console.log('\n[5] 목록 칸 — 줄을 더하고 기존 줄을 지우지 않는다');
  w.__itiSelect('도쿄');
  const hlBox = w.__fieldInput('핵심 하이라이트');
  hlBox.value = '내가 직접 쓴 줄';
  w.__openPicker('highlight', hlBox);
  const h1 = d.querySelector('#itiPickList .itip-item:not([disabled])');
  const h1Text = h1.querySelector('.itip-phrase').textContent;
  w.__confirmCalls = 0;
  h1.click();
  ok('묻지 않고 줄이 더해진다', w.__confirmCalls === 0);
  ok('기존에 쓴 줄이 살아 있다', hlBox.value.split('\n').includes('내가 직접 쓴 줄'), JSON.stringify(hlBox.value));
  ok('고른 줄이 더해졌다', hlBox.value.split('\n').includes(h1Text));
  ok('연달아 고르도록 창이 열려 있다', !d.getElementById('itiPickModal').classList.contains('hidden'));

  const usedBtn = Array.from(d.querySelectorAll('#itiPickList .itip-item'))
    .find((b) => b.querySelector('.itip-phrase').textContent === h1Text);
  ok('이미 넣은 줄은 다시 못 고르게 잠긴다', !!usedBtn && usedBtn.disabled);
  ok('왜 잠겼는지 화면에 적힌다', !!usedBtn && /이미/.test(usedBtn.querySelector('.itip-item-from').textContent));

  const h2 = d.querySelector('#itiPickList .itip-item:not([disabled])');
  h2.click();
  ok('두 번째도 더해져 3줄이 된다', hlBox.value.split('\n').filter(Boolean).length === 3, JSON.stringify(hlBox.value));

  console.log('\n[6] 검색이 실제로 좁히는가');
  w.__itiSelect('도쿄');
  w.__openPicker('dayAct', w.__fieldInput('오전'));
  const allCount = d.querySelectorAll('#itiPickList .itip-item').length;
  w.__search('견학');
  const hits = Array.from(d.querySelectorAll('#itiPickList .itip-item'))
    .map((b) => b.querySelector('.itip-phrase').textContent);
  ok('검색하면 줄어든다', hits.length > 0 && hits.length < allCount, `${allCount} → ${hits.length}`);
  ok('남은 것은 전부 검색어를 포함한다', hits.every((t) => t.includes('견학')));
  w.__search('zzz없는단어zzz');
  ok('결과가 없으면 무엇을 하라고 말해준다',
    /넓혀|줄이/.test(d.getElementById('itiPickList').textContent),
    d.getElementById('itiPickList').textContent.trim());
  w.__pickClose();

  console.log('\n[7] 고른 결과가 서버 검증을 그대로 통과하는가');
  /* 화면에서만 되는 값이면 저장 순간 400으로 튕긴다. 실제 서버 함수로 돌려본다. */
  const contentSrc = require('fs').readFileSync(path.join(ROOT, 'api', 'content.js'), 'utf8');
  const m = contentSrc.match(/function normalizeCourses[\s\S]*?\n}\n/);
  /* 상한은 **서버가 쓰는 값 그대로** 읽는다. 숫자를 여기 적어두면 서버가 더 빡빡해져도
     이 테스트는 계속 통과해서, 화면에서만 되는 값을 '검증했다'고 말하게 된다.
     일부는 api/content.js가 직접 갖고 있고, 일부는 limits.js에서 온다(QO) — 둘 다 본다. */
  const sharedLimits = require(path.join(ROOT, 'limits.js'));
  const lim = (name) => {
    if (Number.isFinite(sharedLimits[name])) return sharedLimits[name];
    const v = Number((contentSrc.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)')) || [])[1]);
    if (!Number.isFinite(v)) throw new Error(name + '을 limits.js에서도 api/content.js에서도 못 읽었습니다');
    return v;
  };
  const normalizeCourses = new Function(
    'MAX_COURSES,MAX_TITLE,MAX_TEXT,MAX_HIGHLIGHTS,MAX_DAYS,badText',
    m[0] + '; return normalizeCourses;'
  )(lim('MAX_COURSES'), lim('MAX_TITLE'), lim('MAX_TEXT'), lim('MAX_HIGHLIGHTS'), lim('MAX_DAYS'),
    (v, max) => typeof v !== 'string' || v.length > max);

  w.__itiSelect('도쿄');
  const box = w.__fieldInput('오전');
  w.__openPicker('dayAct', box);
  w.__confirmReply = true;
  d.querySelector('#itiPickList .itip-item:not([disabled])').click();
  const hl = w.__fieldInput('핵심 하이라이트');
  w.__openPicker('highlight', hl);
  d.querySelector('#itiPickList .itip-item:not([disabled])').click();
  w.__pickClose();

  const norm = normalizeCourses(w.__courses());
  ok('서버 검증을 통과한다', !norm.error, norm.error || '');
  ok('고른 오전 활동이 저장될 값에 들어 있다',
    !norm.error && norm.courses.some((c) => c.days.some((dd) => dd.am === box.value)),
    '화면 값=' + JSON.stringify(box.value));
  ok('일자 번호는 서버가 순서대로 다시 매긴다',
    !norm.error && norm.courses.every((c) => c.days.every((dd, i) => dd.day === i + 1)));

  console.log('\n[8] 목적지를 못 고른 상태에서 눌러도 안 터지는가');
  w.__itiSelect('');
  let threw = null;
  try { w.__openPickerRaw('dayAct'); } catch (e) { threw = String(e); }
  ok('예외 없이 넘어간다', !threw, threw || '');
  ok('창이 열리지 않는다', d.getElementById('itiPickModal').classList.contains('hidden'));
  ok('목적지를 고르라고 말해준다', /목적지/.test(d.getElementById('iti-msg').textContent),
    d.getElementById('iti-msg').textContent);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  dom.window.close();
  if (fail) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });

/* admin.html을 실제로 띄운다. itiState·itiOpenPicker 등은 한 <script> 안의 const라
   window에 붙지 않으므로 같은 스코프에 주입구를 심는다(test_qE·qK와 같은 방식). */
async function bootAdmin() {
  const html = htmlWithDeps('admin.html');
  const EXPOSE = `
;try{
  window.REGION_MAP = REGION_MAP;
  /* QY: 목적지 선택은 하나다 — 한 번 고르면 두 구역이 함께 올라온다. */
  window.__itiSelect = (k) => { itiState.dirty = false; recState.dirty = false; itiSelectDest(k); };
  window.__candidates = (kind, scope, dest) => itiPickCandidates(kind, scope, dest);
  window.__pickDest = () => itiPick.destKey;
  window.__pickFit = () => itiPick.fit;
  window.__setScope = (s) => { itiPick.scope = s; itiPickRender(); };
  window.__listCount = () => document.querySelectorAll('#itiPickList .itip-item').length;
  /* 화면에 그리는 상한(300건)이 있어 목록 개수로는 필터 효과를 못 잰다 — 실제 건수를 본다. */
  window.__filteredCount = () => {
    const all = itiPickCandidates(itiPick.kind, itiPick.scope);
    return itiPick.fit ? all.filter(c => c.fit === itiPick.fit).length : all.length;
  };
  /* ✨ 방식 A·B 소개 화면의 '고르기'를 실제 버튼 클릭으로 연다 (QW). */
  window.__openRecPicker = (labelStarts) => {
    const rows = Array.from(document.querySelectorAll('#rec-body .iti-lbl-row'));
    const row = rows.find(r => r.querySelector('.iti-lbl').textContent.trim().startsWith(labelStarts));
    if (row) row.querySelector('.iti-pick-btn').click();
    return !!row;
  };
  window.__setOverride = (k, courses) => { itiState.overrides[k] = courses; };
  window.__clearOverrides = () => { itiState.overrides = {}; itiState.recOverrides = {}; };
  window.__isDirty = () => itiState.dirty;
  window.__courses = () => itiState.courses;
  window.__pickClose = () => itiPickClose();
  window.__search = (q) => { itiPick.q = q; itiPickRender(); };
  /* 실제 화면과 같은 경로로 연다 — 버튼 클릭이 부르는 것과 같은 함수·같은 인자.
     테스트 전용 우회로를 만들면 화면에서만 깨지는 결함을 놓친다. */
  window.__fieldInput = (labelStarts) => {
    const rows = Array.from(document.querySelectorAll('#iti-body .iti-lbl-row'));
    const row = rows.find(r => r.querySelector('.iti-lbl').textContent.trim().startsWith(labelStarts));
    return row ? row.parentElement.querySelector('.iti-inp, .iti-ta') : null;
  };
  window.__openPicker = (kind, inp) => {
    const rows = Array.from(document.querySelectorAll('#iti-body .iti-lbl-row'));
    const row = rows.find(r => r.parentElement.querySelector('.iti-inp, .iti-ta') === inp);
    row.querySelector('.iti-pick-btn').click();
  };
  window.__openPickerRaw = (kind) => itiOpenPicker(kind, () => '', () => {});
}catch(e){ window.__exposeError = String(e); }
`;
  let injected = false;
  const patched = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, code, close) => {
    if (!injected && /let\s+currentUser/.test(code)) { injected = true; return open + code + EXPOSE + close; }
    return m;
  });
  if (!injected) throw new Error('currentUser를 선언한 스크립트 블록을 찾지 못했습니다 — 주입구를 심을 수 없습니다');

  const dom = new JSDOM(patched, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = () => new Promise(() => {});   /* 서버 조회는 이 테스트와 무관 */
      const ctx = new Proxy({}, { get: () => (() => ctx) });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.__confirmReply = true; w.__confirmCalls = 0;
      w.confirm = () => { w.__confirmCalls++; return w.__confirmReply; };
      w.alert = () => {}; w.prompt = () => null;
    },
  });
  if (dom.window.__exposeError) throw new Error('주입 실패: ' + dom.window.__exposeError);
  await new Promise((r) => setTimeout(r, 60));
  return dom;
}

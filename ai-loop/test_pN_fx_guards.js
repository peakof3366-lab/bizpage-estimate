/* PN 검증: 환율 보정의 '조용한' 지점 두 곳.
   GPT 3라운드 지적을 검증해 고친 것들이라, 되돌아가면 여기서 걸린다.

   ① ±30% 클램프에 걸린 사실이 아무 데도 안 보였다. 걸리면 실제 환율 변동이 견적에
      덜 반영되는데(원가와 벌어짐), 그 상태가 조용히 지속됐다.
      → 엔진은 FX_CLAMPED에 기록하고, 관리자 요율 표는 같은 임계로 배지를 띄운다.
      ⚠ admin.html은 script.js를 로드하지 않으므로 엔진 기록을 그대로 못 쓴다.
        임계값(0.7/1.3 ↔ 30%)이 양쪽에 따로 있어 어긋날 수 있어 여기서 대조한다.

   ② "확인함" 버튼이 환율 기준점까지 재설정하는데 안내문에 그 말이 없었다.
      담당자는 "가격 그대로"만 보고 누르지만 그동안 쌓인 환율 보정이 사라진다.
      → 얼마가 걸려 있는지 숫자로 보여주고 판단 근거를 함께 띄운다.
   실행: node ai-loop/test_pN_fx_guards.js  (프로젝트 루트에서) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const scriptSrc = read('script.js');
const adminSrc = read('admin.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('[1] 엔진 — 클램프 상수와 기록');
ok('클램프 상수가 이름으로 분리됨', /const FX_CLAMP_MIN = 0\.7, FX_CLAMP_MAX = 1\.3;/.test(scriptSrc));
ok('클램프 적용에 상수를 쓴다(매직넘버 아님)',
  /Math\.max\(FX_CLAMP_MIN, Math\.min\(FX_CLAMP_MAX, adj\)\)/.test(scriptSrc));
ok('걸리면 FX_CLAMPED에 기록', /FX_CLAMPED\[destKey\] = \{ currency: base\.currency, raw: adj, applied: clamped \}/.test(scriptSrc));
ok('풀리면 기록을 지운다(낡은 경고 방지)', /delete FX_CLAMPED\[destKey\]/.test(scriptSrc));
ok('기록이 계산 결과를 바꾸지 않는다(clamped를 그대로 반환)', /return clamped;/.test(scriptSrc));

console.log('\n[2] 관리자 화면 — 클램프가 눈에 보이는가');
ok('adminGetFxDrift가 clamped를 판정', /clamped: pct >= 30/.test(adminSrc));
ok('요율 표 배지에 클램프 표시', /fxClamped \? ' 🚨환율상한'/.test(adminSrc));
ok('클램프면 상태를 stale로 승격', /rs\.fxClamped \? 'stale' : rs\.status/.test(adminSrc));
ok('무엇을 해야 하는지 title에 적혀 있음', /요율을 다시 잡아 주세요/.test(adminSrc));

console.log('\n[3] 두 곳의 임계값이 서로 맞는가 (엔진 0.7~1.3 ↔ 화면 30%)');
const m = scriptSrc.match(/const FX_CLAMP_MIN = ([\d.]+), FX_CLAMP_MAX = ([\d.]+);/);
ok('엔진 상수를 읽었다', !!m, String(m));
if (m) {
  const engineMaxPct = Math.round((Number(m[2]) - 1) * 100);
  const engineMinPct = Math.round((1 - Number(m[1])) * 100);
  ok('엔진 상한·하한이 대칭', engineMaxPct === engineMinPct, `${engineMinPct}% / ${engineMaxPct}%`);
  const adminPct = Number((adminSrc.match(/clamped: pct >= (\d+)/) || [])[1]);
  ok(`화면 임계(${adminPct}%)가 엔진(${engineMaxPct}%)과 일치`, adminPct === engineMaxPct);
}

console.log('\n[4] "확인함" 버튼이 부작용을 알려주는가');
ok('환율 기준점 재설정을 안내한다', /환율 기준점이 오늘로 재설정되어/.test(adminSrc));
ok('현재 변동폭을 숫자로 보여준다', /환율이 \$\{driftPct > 0 \? '\+' : ''\}\$\{driftPct\.toFixed\(1\)\}%/.test(adminSrc));
ok('부호 있는 값을 쓴다(절댓값 아님)', /drift\.signedPct/.test(adminSrc));
ok('adminGetFxDrift가 signedPct를 제공', /const signedPct = \(current - baseline\.rate\) \/ baseline\.rate \* 100;/.test(adminSrc));
ok('판단 기준을 함께 제시(원화 기준 vs 현지 기준)',
  /원화 금액 그대로/.test(adminSrc) && /현지 가격 그대로/.test(adminSrc));
ok('변동이 미미하면 경고를 띄우지 않는다(0.5% 미만)', /Math\.abs\(driftPct\) >= 0\.5/.test(adminSrc));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

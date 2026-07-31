/* jsdom 픽스처용 — HTML의 <script src="로컬.js">를 파일 내용으로 인라인한다.

   왜 필요한가: 테스트는 jsdom에 HTML 문자열만 넘기고 외부 리소스를 받아오지 않는다
   (resources:'usable'을 켜면 실제 네트워크를 타므로 감사 도구에 맞지 않는다).
   그래서 admin.html을 열어도 data.js·dest_currency.js가 로드되지 않았고, 픽스처가
   실제 페이지와 다른 상태로 돌고 있었다 — destinationRates가 undefined인 채로도
   테스트가 '통과'했다는 뜻이다. PY에서 admin.html이 로드 시점에 data.js의
   destFieldMap을 부르면서 이 차이가 드러났다.

   ⚠ 조용히 건너뛰지 않는다 — src에 적힌 파일이 없으면 예외를 던진다. 없는 걸
   빈 문자열로 때우면 픽스처가 또 실제 페이지와 달라지고, 그게 이 저장소가 반복해서
   당한 '조용한 폴백'이다. 외부 CDN(http로 시작)만 건드리지 않고 그대로 둔다. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function inlineScriptDeps(html) {
  return html.replace(/<script\s+src="([^"]+)"\s*><\/script>/gi, (m, src) => {
    if (/^(https?:)?\/\//i.test(src)) return m;
    const file = path.join(ROOT, src);
    if (!fs.existsSync(file)) throw new Error(`인라인할 스크립트를 찾을 수 없습니다: ${src}`);
    return '<script>\n' + fs.readFileSync(file, 'utf8') + '\n</script>';
  });
}

/* 해당 HTML을 의존 스크립트까지 실어 돌려준다. */
function htmlWithDeps(file) {
  return inlineScriptDeps(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

module.exports = { inlineScriptDeps, htmlWithDeps };

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
    /* ⚠ 파일 안의 `</script>`는 반드시 깨서 넣는다. script.js는 인쇄용 페이지를
       템플릿 문자열로 만들면서 그 문자열 안에 `</script>`를 갖고 있는데, 그대로
       인라인하면 **HTML 파서가 거기서 스크립트를 끊는다.** 그러면 나머지 절반이
       통째로 실행되지 않고 SyntaxError만 하나 남는다 — 픽스처는 "로드된 것처럼"
       보이면서 실제 페이지와 다른 상태로 돌게 된다. 이 파일이 없는 src를 조용히
       넘기지 않는 것과 같은 이유다(실제로 admin-quote.html을 띄우다 겪었다).
       `<\/script>`는 JS 문자열 안에서 `</script>`와 완전히 같은 값이다. */
    const code = fs.readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
    return '<script>\n' + code + '\n</script>';
  });
}

/* 해당 HTML을 의존 스크립트까지 실어 돌려준다. */
function htmlWithDeps(file) {
  return inlineScriptDeps(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

module.exports = { inlineScriptDeps, htmlWithDeps };

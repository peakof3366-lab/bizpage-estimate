/* .env.local을 process.env로 읽어들이는 최소 헬퍼 (외부 의존성 없이 1회성 스크립트용). */
const fs = require('fs');
const path = require('path');

module.exports = function loadEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
};

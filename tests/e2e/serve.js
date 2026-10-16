// 프로젝트 루트를 정적 파일로 제공하는 최소 서버 (의존성 없음).
// 앱은 fetch로 data/*.json을 읽으므로 file:// 대신 이 서버 주소로 열어야 한다.
// usage: node serve.js [port]   (기본 8123, 직접 실행 시)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'PES_study_app_delta.html' : urlPath);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({ server, url: `http://127.0.0.1:${p}/PES_study_app_delta.html` });
    });
  });
}

module.exports = { startServer };

if (require.main === module) {
  startServer(parseInt(process.argv[2] || '8123', 10)).then(({ url }) => console.log(`serving ${ROOT}\n${url}`));
}

// 전체 E2E 실행기. 프로젝트 루트를 임시 로컬 서버로 열고 아홉 묶음을 순서대로 실행한다.
// usage: node run-all.js [app-url]   (주소를 주면 그 서버를 사용하고, 생략하면 내장 서버를 띄움)
// 환경변수 CHROME_PATH 로 Chrome 실행 파일을 바꿀 수 있다.
const { execFile } = require('child_process');
const runChild = (file, args) => new Promise(resolve => {
  // 비동기 실행: 같은 프로세스의 서버가 자식 테스트의 요청에 응답할 수 있도록 이벤트 루프를 막지 않는다
  execFile(process.execPath, [file, ...args], { encoding: 'utf8', env: process.env }, (err, stdout, stderr) => {
    resolve({ failed: !!err, out: (stdout || '') + (stderr || '') });
  });
});
const path = require('path');
const { startServer } = require('./serve');

const files = ['01-original.js', '02-persistence.js', '03-features.js', '04-data-layer.js', '05-day-select.js', '06-dialogue.js', '07-ladder-units.js', '08-mobile.js', '09-tracking.js'];

(async () => {
  let server = null;
  let url = process.argv[2];
  if (!url) ({ server, url } = await startServer(0));
  console.log(`앱 주소: ${url}`);

  let failed = 0;
  for (const f of files) {
    const { failed: childFailed, out } = await runChild(path.join(__dirname, f), [url]);
    if (childFailed) failed++;
    const lines = out.split('\n').filter(Boolean);
    const pass = lines.filter(l => l.startsWith('PASS')).length;
    const bad = lines.filter(l => l.startsWith('FAIL') || /CRASH|Error/.test(l));
    console.log(`\n== ${f}: PASS ${pass}, FAIL ${bad.length} ==`);
    bad.forEach(l => console.log(l));
    if (bad.length) failed++;
  }

  if (server) server.close();
  console.log(failed ? '\n전체: 실패 있음' : '\n전체: 모두 통과');
  process.exit(failed ? 1 : 0);
})();

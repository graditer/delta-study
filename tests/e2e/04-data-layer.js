// Phase 2 검증: fetch 데이터 로딩, ID 기반 저장, 옛 키 변환, 로딩 실패 안내
// usage: node 04-data-layer.js [app-url]
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const withDay8 = u => { const x = new URL(u); if (!x.searchParams.has('day')) x.searchParams.set('day', '8'); return x.href; }; // 이 묶음은 Day 08을 기준으로 검사한다
const url = withDay8(process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);

  // 1. 옛 저장(인덱스 기반) → ID 기반으로 1회 변환
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('delta-day08-progress', JSON.stringify({ playMode: 'ladder', chunkSize: 4, order: [0, 1, 0, 1, 2], currentIdx: 1 }));
        localStorage.setItem('delta-day08-wrong', JSON.stringify([1, 2]));
      }
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    const keys = await page.evaluate(() => ({
      oldP: localStorage.getItem('delta-day08-progress'),
      oldW: localStorage.getItem('delta-day08-wrong'),
      newP: JSON.parse(localStorage.getItem('delta:progress') || 'null'),
      newW: JSON.parse(localStorage.getItem('delta:day08:wrong') || 'null')
    }));
    check('legacy progress key removed after migration', keys.oldP === null);
    check('legacy wrong key removed after migration', keys.oldW === null);
    check('progress order converted to IDs', keys.newP && keys.newP.order.join('|') === 'day08:1.(1)|day08:1.(2)|day08:1.(1)|day08:1.(2)|day08:1.(3)', JSON.stringify(keys.newP && keys.newP.order));
    check('wrong list converted to IDs', keys.newW && keys.newW.join('|') === 'day08:1.(2)|day08:1.(3)', JSON.stringify(keys.newW));
    const resumeText = await page.textContent('#resume-btn');
    check('resume button shows converted position', resumeText.includes('Step 2 / 5'), resumeText);
    await page.click('#resume-btn');
    const cur = await page.evaluate(() => studySequence[currentIdx].data.id);
    check('resume continues at the same item (ID)', cur === 'day08:1.(2)', cur);
    check('no page errors in migration path', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 2. 저장에 존재하지 않는 ID는 조용히 무시
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('delta:progress', JSON.stringify({ scope: 'single', start: 'day08', end: 'day08', label: 'Day 08 · 사다리', word: 'Step', playMode: 'ladder', poolMode: 'all', parity: 'all', chunkSize: 4, grade: false, order: ['day08:1.(1)', 'day08:deleted-99', 'day08:1.(2)'], currentIdx: 2 }));
        localStorage.setItem('delta:day08:wrong', JSON.stringify(['day08:nope', 'day08:1.(3)']));
      }
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    check('unknown ID in wrong list is not counted', (await page.textContent('#wrong-count')) === '1', await page.textContent('#wrong-count'));
    await page.click('#resume-btn');
    const n = await page.evaluate(() => studySequence.length);
    check('unknown ID in progress order skipped', n === 2, `length=${n}`);
    await context.close();
  }

  // 3. file:// 로 열면 데이터 로딩 실패 안내 + 시작 버튼 비활성
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const fileUrl = url.replace(/^https?:\/\/[^/]+\//, 'file:///Users/kidon/workspace/claude-code-mastery/PES_delta_study_code/');
    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const title = await page.textContent('#setup-hint');
    check('file:// shows local-server guidance', title.includes('로컬 서버'), title);
    check('start button disabled on load failure', await page.isDisabled('#setup-screen button[onclick="startStudy()"]'));
    await context.close();
  }

  console.log(results.join('\n'));
  await browser.close();
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });

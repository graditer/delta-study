// 2단계 검증: node run2.js <file-url>
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html'; // serve.js 로 띄운 주소

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load|ERR_|fonts\.googleapis/.test(m.text())) errors.push('console: ' + m.text()); });

  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const text = sel => page.textContent(sel);
  const visible = sel => page.isVisible(sel);
  const stepNum = async () => parseInt((await text('#progress-text')).match(/Step (\d+)/)[1]);

  // 달력 URL 캡처 (외부 이동은 막고 URL만 기록)
  let calendarUrl = null;
  await page.route(/calendar\.google\.com|google\.com\/calendar/, r => { calendarUrl = r.request().url(); r.abort(); });

  // 대화상자 응답 큐: prompt → 값, alert → 확인
  const dialogs = [];
  let promptAnswers = [];
  page.on('dialog', async d => {
    dialogs.push({ type: d.type(), message: d.message() });
    if (d.type() === 'prompt') await d.accept(promptAnswers.shift() ?? '1');
    else await d.accept();
  });

  await page.goto(url, { waitUntil: 'load' });

  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(800);

  // 0. 데이터 분리 및 기본 로드
  check('day08 loaded from JSON: dayItems 64', (await page.evaluate(() => dayItems.length)) === 64);
  check('no resume button without saved progress', !(await visible('#resume-btn')));
  check('viewport has no user-scalable=no', !(await page.getAttribute('meta[name=viewport]', 'content')).includes('user-scalable'));

  // 1. 키보드: Space = 정답확인/다음, ← = 이전
  await page.click('text=연습 새로 시작하기');
  await page.keyboard.press('Space');
  check('Space reveals English', !(await page.getAttribute('#en-box', 'class')).includes('invisible'));
  check('Space does not advance on reveal', (await stepNum()) === 1);
  await page.keyboard.press('Enter');
  check('Enter advances exactly one step', (await stepNum()) === 2, `Step ${await stepNum()}`);
  await page.keyboard.press('ArrowLeft');
  check('ArrowLeft goes back one step', (await stepNum()) === 1);
  await page.keyboard.press('ArrowLeft');
  check('ArrowLeft at step 1 stays at 1', (await stepNum()) === 1);

  // 2. 진행 저장 + 이어하기 (정답 확인 → 다음 단계 5회 진행)
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await page.keyboard.press('Space'); }
  const at = await stepNum();
  check('advanced to step 6 via keyboard', at === 6, `Step ${at}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delta:progress')));
  check('progress saved to localStorage', saved && saved.currentIdx === 5 && saved.order.length === 320);

  await page.reload({ waitUntil: 'load' });

  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(500);
  check('resume button shown after reload', await visible('#resume-btn'));
  check('resume button label shows Step 6 / 320', (await text('#resume-btn')).includes('Step 6 / 320'), await text('#resume-btn'));
  await page.click('#resume-btn');
  check('resume restores step 6', (await stepNum()) === 6, `Step ${await stepNum()}`);
  check('resume keeps 320 total', (await text('#progress-text')).includes('/ 320'));
  const sameOrder = await page.evaluate(() => studySequence.map(s => s.data.id).join(',') === JSON.parse(localStorage.getItem('delta:progress')).order.join(','));
  check('resumed sequence order identical to saved', sameOrder);

  // 3. 랜덤 모드 저장 순서 복원 (셔플 결과가 그대로 이어져야 함)
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(300);
  await page.click('#tab-random');
  await page.click('text=연습 새로 시작하기');
  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  const randOrder = await page.evaluate(() => studySequence.map(s => s.data.id).join(','));
  const randStep = await stepNum();
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(300);
  await page.click('#resume-btn');
  const randOrder2 = await page.evaluate(() => studySequence.map(s => s.data.id).join(','));
  check('random order preserved across resume', randOrder === randOrder2);
  check('random resume keeps step', (await stepNum()) === randStep, `Step ${randStep}`);

  // 4. 날짜 계산 (로컬 날짜, prompt=3일)
  await page.evaluate(() => { currentIdx = studySequence.length - 1; render(); });
  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  check('finish overlay shown', await visible('#finish-ui'));
  check('progress cleared on finish', (await page.evaluate(() => localStorage.getItem('delta:progress'))) === null);
  promptAnswers = ['3'];
  dialogs.length = 0;
  await page.click('#cal-confirm-btn');
  await page.waitForTimeout(400);
  const d = new Date(); d.setDate(d.getDate() + 3);
  const expect = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  check('calendar date = local today + 3', !!calendarUrl && calendarUrl.includes(`dates=${expect}T090000`), `expected ${expect}; got ${calendarUrl ? calendarUrl.match(/dates=[^&]+/)[0] : 'none'}`);

  // 5. 입력 검증 (새 페이지에서 진행: 유효 값은 달력으로 떠나므로 잘못된 값만 시험)
  const p2 = await context.newPage();
  p2.on('pageerror', e => errors.push('pageerror(p2): ' + e.message));
  const dialogs2 = [];
  let answers2 = [];
  p2.on('dialog', async d => {
    dialogs2.push({ type: d.type(), message: d.message() });
    if (d.type() === 'prompt') {
      const a = answers2.shift();
      if (a === null) await d.dismiss(); else await d.accept(a);
    } else await d.accept();
  });
  let navigated = false;
  await p2.route(/google\.com\/calendar/, r => { navigated = true; r.abort(); });
  await p2.goto(url, { waitUntil: 'load' });
  await p2.waitForFunction(() => dayItems.length > 0);
  await p2.waitForTimeout(500);
  await p2.click('text=연습 새로 시작하기');
  await p2.evaluate(() => { currentIdx = studySequence.length - 1; render(); });
  await p2.keyboard.press('Space'); await p2.keyboard.press('Space');

  answers2 = ['abc'];
  await p2.click('#cal-confirm-btn');
  await p2.waitForTimeout(300);
  check('invalid input (abc) shows validation alert', dialogs2.some(x => x.type === 'alert' && x.message.includes('1~30')), JSON.stringify(dialogs2));
  check('invalid input does not navigate', !navigated);

  dialogs2.length = 0; answers2 = ['45'];
  await p2.click('#cal-confirm-btn');
  await p2.waitForTimeout(300);
  check('out-of-range (45) rejected with alert', dialogs2.some(x => x.type === 'alert') && !navigated);

  dialogs2.length = 0; answers2 = [null];
  await p2.click('#cal-confirm-btn');
  await p2.waitForTimeout(300);
  check('cancel (null) closes silently: no alert, no navigation', dialogs2.length === 1 && dialogs2[0].type === 'prompt' && !navigated);

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });

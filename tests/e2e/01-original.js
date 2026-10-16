// usage: node run.js <file-url>
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const withDay8 = u => { const x = new URL(u); if (!x.searchParams.has('day')) x.searchParams.set('day', '8'); return x.href; }; // 이 묶음은 Day 08을 기준으로 검사한다
const url = withDay8(process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html'); // serve.js 로 띄운 주소

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept()); // 저장된 진행이 있을 때 새로 시작하는 확인창은 수락
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(800); // Tailwind CDN 적용 대기

  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const text = sel => page.textContent(sel);
  const visible = sel => page.isVisible(sel);

  // 1. 설정 화면
  check('setup visible initially', await visible('#setup-screen'));
  check('ladder default, chunk=4', (await text('#chunk-value')) === '4');
  await page.click('#tab-random');
  check('random mode hides chunk slider', !(await visible('#chunk-setting-box')));
  await page.click('#tab-ladder');
  check('ladder mode shows 반복 단위 slider', await visible('#chunk-setting-box'));
  check('slider default 4', (await page.inputValue('#chunk-slider')) === '4');

  // 2. 학습 시작 (ladder chunk=4 → 320 steps)
  await page.click('text=연습 새로 시작하기');
  check('study screen shown', await visible('#study-screen'));
  check('total steps 320', (await text('#progress-text')).includes('/ 320'), await text('#progress-text'));
  check('first sentence No.1.(1)', (await text('#sentence-number')).includes('1.(1)'));
  check('prev button disabled at step 1', (await page.getAttribute('#prev-btn', 'class')).includes('pointer-events-none'));

  // 3. 정답 확인 → 영어 노출 → 다음
  const enHidden0 = (await page.getAttribute('#en-box', 'class')).includes('invisible');
  check('english hidden before reveal', enHidden0);
  await page.click('#main-btn');
  check('english revealed after 정답 확인', !(await page.getAttribute('#en-box', 'class')).includes('invisible'));
  check('button label 다음 단계', (await text('#main-btn')) === '다음 단계');
  await page.click('#main-btn');
  check('advanced to step 2', (await text('#progress-text')).includes('Step 2 /'));
  check('prev button enabled after step 1', !(await page.getAttribute('#prev-btn', 'class')).includes('pointer-events-none'));
  check('last-item box shown', !(await page.getAttribute('#prev-item-box', 'class')).includes('opacity-0'));

  // 4. 이전 버튼
  await page.click('#prev-btn');
  check('prev returns to step 1', (await text('#progress-text')).includes('Step 1 /'));

  // 5. 진행 바 클릭 시킹 (중앙 → 대략 160번째 근처)
  // 좌표 클릭 대신 컨테이너 중앙 좌표로 mousedown 이벤트를 직접 발생
  await page.evaluate(() => {
    const el = document.getElementById('progress-container');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
  });
  const mid = await text('#progress-text');
  const midNum = parseInt(mid.match(/Step (\d+)/)[1]);
  check('progress click seeks to middle', midNum > 150 && midNum < 170, mid);

  // 6. 자동 재생 (설정 화면 버튼은 제거됨: 상태를 켠 뒤 시작)
  await page.reload();
  await page.waitForFunction(() => dayItems.length > 0);
  await page.evaluate(() => { isAutoMode = true; });
  await page.click('text=연습 새로 시작하기');
  check('auto gauge visible', await visible('#timer-gauge-container'));
  await page.waitForTimeout(4900);
  check('auto: after ~4.5s English revealed without click', !(await page.getAttribute('#en-box', 'class')).includes('invisible'));
  check('auto: still step 1 right after reveal', (await text('#progress-text')).includes('Step 1 /'));
  await page.waitForTimeout(3300);
  const afterBoth = await text('#progress-text');
  check('auto: advanced to step 2 automatically', afterBoth.includes('Step 2 /'), afterBoth);
  // 학습 중 수동 전환 → 게이지 정지
  await page.click('#mode-switch-btn');
  check('in-game switch to manual hides gauge', !(await visible('#timer-gauge-container')));

  // 7. 완료 오버레이 (끝으로 이동 후 두 번)
  await page.reload();
  await page.waitForFunction(() => dayItems.length > 0);
  await page.click('#tab-random');
  await page.click('text=연습 새로 시작하기');
  await page.evaluate(() => { currentIdx = studySequence.length - 1; render(); });
  await page.click('#main-btn');
  await page.click('#main-btn');
  check('finish overlay shown at end', await visible('#finish-ui'));

  // 8. 랜덤 시퀀스 중복 없음
  const uniq = await page.evaluate(() => new Set(studySequence.map(s => s.data.num)).size);
  const len = await page.evaluate(() => studySequence.length);
  check('random: 64 steps, all unique', len === 64 && uniq === 64, `len=${len} uniq=${uniq}`);

  // 9. 배너 3곳 주입
  const banners = await page.locator('.promo-banner, a[href*="pse-learning"]').count();
  check('no promo banner in DOM', banners === 0, String(banners));

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });

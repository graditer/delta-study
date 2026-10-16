// 모바일 검증: 앱은 휴대폰에서 주로 쓰므로 390px·360px 폭에서 가로 넘침, 설정 순서, 터치 영역 크기를 확인
// usage: node 08-mobile.js [app-url]
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseRaw = process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html';
const at = (extra) => { const u = new URL(baseRaw); for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v); return u.href; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const errors = [];

  for (const width of [390, 360]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(at({ day: '19' }), { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    await page.click('#tab-ladder');

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${width}px setup: no horizontal scroll`, (await overflow()) <= 0, `overflow=${await overflow()}`);

    // 순서: 학습모드 → 반복 단위 → 문제 범위
    const y = async sel => page.evaluate(s => { const el = [...document.querySelectorAll('p,span,h1')].find(e => e.textContent.trim() === s); return el ? el.getBoundingClientRect().top : -1; }, sel);
    const yMode = await y('학습 모드'), yUnit = await y('반복 단위'), yPool = await y('문제 범위');
    check(`${width}px order: 학습 모드 < 반복 단위 < 문제 범위`, yMode >= 0 && yMode < yUnit && yUnit < yPool, `${Math.round(yMode)} / ${Math.round(yUnit)} / ${Math.round(yPool)}`);
    check('반복 단위 slider range 0..8 (0 = 교재)', (await page.getAttribute('#chunk-slider', 'min')) === '0' && (await page.getAttribute('#chunk-slider', 'max')) === '8');
    check('setup hint visible', (await page.textContent('#setup-hint')).length > 0);

    // 터치 영역: 주요 버튼 높이 44px 이상
    const tall = async sel => page.evaluate(s => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().height) : -1; }, sel);
    for (const sel of ['#tab-ladder', '#chunk-setting-box', '#pool-all', '#parity-odd', '#grade-mode-btn', '#day-select', '#scope-range']) {
      const h = await tall(sel);
      check(`${width}px touch target ${sel} ≥ 44px`, h >= 44, `${h}px`);
    }

    // 학습 화면 (대화형 카드 포함)
    await page.click('text=연습 새로 시작하기');
    await page.waitForTimeout(300);
    check(`${width}px study screen: no horizontal scroll`, (await overflow()) <= 0, `overflow=${await overflow()}`);
    const cardFits = await page.evaluate(() => { const r = document.getElementById('study-card').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
    check(`${width}px study card within screen width`, cardFits);
    const mainH = await tall('#main-btn');
    check(`${width}px main answer button ≥ 44px`, mainH >= 44, `${mainH}px`);

    if (width === 390) await page.screenshot({ path: process.env.SHOT_PATH || '/tmp/mobile-setup.png', fullPage: true });
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });

// 사다리 반복 단위: 슬라이더 맨 왼쪽 '교재'(0) = 번호 묶음 단위, 1~8 = 누적 반복, 기본 4
// 기간 선택 시 Day 경계를 넘어도 같은 번호끼리 묶이지 않는지, 저장·이어하기 값, 랜덤 모드를 검사
// usage: node 07-ladder-units.js [app-url]
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseRaw = process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html';
const at = (extra) => { const u = new URL(baseRaw); for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v); return u.href; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const errors = [];
  const fresh = () => browser.newContext({ viewport: { width: 390, height: 844 } });
  const open = async (ctx, url) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept()); // 이어하기 덮어쓰기 확인창은 자동 수락
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    return page;
  };
  const setChunk = (page, v) => page.evaluate(v => { document.getElementById('chunk-slider').value = String(v); updateChunkDisplay(String(v)); }, v);
  const total = async page => { await page.click('text=연습 새로 시작하기'); const t = await page.textContent('#progress-text'); return parseInt(t.split('/')[1], 10); };
  const back = async page => { await page.click('button[title="홈 (진행 저장 유지)"]'); await page.waitForTimeout(500); await page.waitForFunction(() => dayItems.length > 0); };

  // 1. 기본값은 4, 교재 순(0)으로 바꾸면 기대 단계 수
  const expect = { day08: 320, day17: 504, day19: 582, day09: 249 };
  for (const [day, want] of Object.entries(expect)) {
    const ctx = await fresh();
    const page = await open(ctx, at({ day: String(parseInt(day.slice(3), 10)) }));
    check(`${day} default chunk = 4`, (await page.inputValue('#chunk-slider')) === '4' && (await page.textContent('#chunk-value')) === '4');
    check(`${day} ladder shows 반복 단위 row`, await page.isVisible('#chunk-setting-box'));
    await setChunk(page, 0);
    check(`${day} 교재 label shown at 0`, (await page.textContent('#chunk-value')) === '교재');
    const n = await total(page);
    check(`${day} 교재 순 total = ${want}`, n === want, String(n));
    await ctx.close();
  }

  // 2. Day19 모든 문항이 빠짐없이 들어감 (66개)
  let ctx = await fresh();
  let page = await open(ctx, at({ day: '19' }));
  await setChunk(page, 0);
  await total(page);
  const ids = await page.evaluate(() => [...new Set(studySequence.map(s => s.data.id))].length);
  check('Day19 교재 순 covers all 66 items', ids === 66, String(ids));
  await ctx.close();

  // 3. 슬라이더 범위는 0~8로 고정 (그룹 크기에 따라 늘어나지 않음)
  ctx = await fresh();
  page = await open(ctx, at({ day: '19' }));
  check('slider range 0..8 on Day19', (await page.getAttribute('#chunk-slider', 'min')) === '0' && (await page.getAttribute('#chunk-slider', 'max')) === '8');
  await ctx.close();

  // 4. 직접 설정 3: Day08 = 253단계, 교재 순으로 돌아가면 320
  ctx = await fresh();
  page = await open(ctx, at({ day: '8' }));
  await setChunk(page, 3);
  check('chunk 3 hint shows 3문장씩', (await page.textContent('#setup-hint')).includes('3문장씩'));
  check('chunk 3 on Day08 = 253 steps', (await total(page)) === 253);
  await back(page);
  await setChunk(page, 0);
  check('교재 back to Day08 = 320', (await total(page)) === 320);
  await ctx.close();

  // 5. 대화형/혼합 기본값 4 (Day14 = 192 steps)
  ctx = await fresh();
  page = await open(ctx, at({ day: '14' }));
  check('Day14 default chunk 4', (await page.inputValue('#chunk-slider')) === '4');
  check('Day14 chunk 4 = 192 steps', (await total(page)) === 192);
  await back(page);
  await ctx.close();
  ctx = await fresh();
  page = await open(ctx, at({ day: '16' }));
  check('Day16 (mixed) default chunk 4 shown', (await page.inputValue('#chunk-slider')) === '4' && (await page.isVisible('#chunk-setting-box')));
  await ctx.close();

  // 6. 기간 Day03~05: 교재 순은 Day마다 따로 묶는다 (1120 steps, 같은 번호끼리 합치면 달라짐)
  ctx = await fresh();
  page = await open(ctx, at({})); // ?day= 링크는 저장된 기간보다 우선하므로 기본 주소로 연다
  await page.click('#scope-range');
  await page.selectOption('#range-start', 'day03');
  await page.selectOption('#range-end', 'day05');
  await page.waitForTimeout(300);
  await setChunk(page, 0);
  check('range Day03~05 교재 순 = 1120 (per-Day groups)', (await total(page)) === 1120);
  await back(page);
  await setChunk(page, 4);
  check('range Day03~05 chunk 4 = 1120 (224 items)', (await total(page)) === 1120);
  await back(page);
  await ctx.close();

  // 7. 크기 1 그룹 병합 (Day09 14~26: 13개 → 4,4,4,1 = 61 steps)
  ctx = await fresh();
  page = await open(ctx, at({ day: '9' }));
  const merge = await page.evaluate(() => {
    const single = dayItems.filter(i => groupOf(i) >= 14);
    return { len: buildGroupLadder(single).length, expect: 20 + 20 + 20 + 1 };
  });
  check('single-item groups merge up to 4 (13 items → 61 steps)', merge.len === merge.expect, JSON.stringify(merge));
  await ctx.close();

  // 8. 저장 값에 교재 순(0)이 남고, 이어하기 후에도 582단계 유지
  ctx = await fresh();
  page = await open(ctx, at({ day: '19' }));
  await setChunk(page, 0);
  await total(page);
  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  check('교재 순 saved as chunkSize 0 in progress', (await page.evaluate(() => JSON.parse(localStorage.getItem('delta:progress')).chunkSize)) === 0);
  await page.click('#resume-btn');
  check('resume keeps 교재 순 (582 total)', (await page.textContent('#progress-text')).includes('/ 582'), await page.textContent('#progress-text'));
  await ctx.close();

  // 9. 랜덤 모드는 반복 단위를 숨기고, 전체 문항을 한 번씩
  ctx = await fresh();
  page = await open(ctx, at({ day: '19' }));
  await page.click('#tab-random');
  check('random hides 반복 단위 row', !(await page.isVisible('#chunk-setting-box')));
  check('random Day19 = 66 steps', (await total(page)) === 66);
  await ctx.close();

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });

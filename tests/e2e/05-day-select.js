// 범위 선택: 단일 Day 드롭다운 / 기간(시작·끝 드롭다운), 제목·힌트, 기간 제한, 틀린 문제 Day별 집계,
// 마지막 선택 기억, ?day= 링크, 진행 저장 한 칸과 덮어쓰기 확인
// usage: node 05-day-select.js [app-url]
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseRaw = process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html';
const at = (extra) => { const u = new URL(baseRaw); for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v); return u.href; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const errors = [];
  const newPage = async (ctx, url) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    return page;
  };
  const title = page => page.textContent('#setup-day-title');
  const optionValues = (page, sel) => page.$$eval(`${sel} option`, os => os.map(o => o.value));

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

  // 1. 기본: 단일 Day 드롭다운, 기간 줄 숨김, Day 10·18 없음
  let page = await newPage(ctx, at({}));
  check('default: single box visible, range box hidden', (await page.isVisible('#single-box')) && !(await page.isVisible('#range-box')));
  const singleVals = await optionValues(page, '#day-select');
  check('single dropdown lists 16 playable Days', singleVals.length === 16, String(singleVals.length));
  check('Day10 and Day18 are not in the list', !singleVals.includes('day10') && !singleVals.includes('day18'));
  check('default title: Day 08 (총 64문장)', (await title(page)) === 'Day 08 (총 64문장)', await title(page));
  check('default hint shows 320 steps (default chunk 4)', (await page.textContent('#setup-hint')).includes('총 320단계'), await page.textContent('#setup-hint'));

  // 2. 단일 Day 드롭다운 변경 → 제목 갱신
  await page.selectOption('#day-select', 'day19');
  await page.waitForFunction(() => selStart === 'day19' && dayItems.length === 66);
  check('single Day19 title shows actual 66문장', (await title(page)) === 'Day 19 (총 66문장)', await title(page));

  // 3. 기간 설정으로 전환: 기간 줄 표시, 끝 목록은 시작 이후만
  await page.click('#scope-range');
  await page.waitForTimeout(300);
  check('range box visible after 기간 설정', await page.isVisible('#range-box'));
  await page.selectOption('#range-start', 'day14');
  await page.waitForTimeout(300);
  const endVals = await optionValues(page, '#range-end');
  check('range end options start from the start Day', endVals[0] === 'day14' && !endVals.includes('day13'), endVals.slice(0, 2).join(','));
  await page.selectOption('#range-end', 'day16');
  await page.waitForFunction(() => dayItems.length === 117);
  check('mixed range title: Day 14 ~ 16 with 항목 breakdown', (await title(page)) === 'Day 14 ~ 16 (총 117항목 · 세트 107 · 문장 10)', await title(page));

  // 4. 끝을 시작보다 앞으로 바꾸려 하면 끝 목록에 없음 (시작을 뒤로 옮기면 끝이 따라 옮겨짐)
  await page.selectOption('#range-start', 'day16');
  await page.waitForFunction(() => dayItems.length === 40);
  check('moving start past end pulls end along (single Day16 range)', (await page.inputValue('#range-end')) === 'day16');

  // 5. 단일 Day로 돌아가면 시작 Day 하나만
  await page.click('#scope-single');
  await page.waitForTimeout(300);
  check('back to 단일 Day shows start Day only', (await title(page)).startsWith('Day 16 ('), await title(page));

  // 6. 기간 03~05 선택 후 새로고침 → 기간이 그대로 복원
  await page.click('#scope-range');
  await page.selectOption('#range-start', 'day03');
  await page.selectOption('#range-end', 'day05');
  await page.waitForFunction(() => dayItems.length === 224);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  check('range restored after reload', (await page.isVisible('#range-box')) && (await page.inputValue('#range-end')) === 'day05');
  check('restored range title: Day 03 ~ 05 (총 224문장)', (await title(page)) === 'Day 03 ~ 05 (총 224문장)', await title(page));

  // 7. 틀린 문제는 Day별로 저장되고, 기간에 따라 개수가 달라진다
  await page.evaluate(() => {
    wrongSet.add('day03:1.(1)'); wrongSet.add('day05:1.(2)');
    saveWrong();
    refreshSetup();
  });
  await page.selectOption('#range-start', 'day03');
  await page.selectOption('#range-end', 'day03');
  await page.waitForFunction(() => dayItems.length === 80);
  check('Day03 only: wrong count 1', (await page.textContent('#wrong-count')) === '1', await page.textContent('#wrong-count'));
  await page.selectOption('#range-end', 'day05');
  await page.waitForFunction(() => dayItems.length === 224);
  check('Day03~05: wrong count 2', (await page.textContent('#wrong-count')) === '2', await page.textContent('#wrong-count'));
  await page.selectOption('#range-start', 'day04');
  await page.waitForFunction(() => dayItems.length === 144);
  check('Day04~05: wrong count 1 (Day03 excluded)', (await page.textContent('#wrong-count')) === '1', await page.textContent('#wrong-count'));
  await page.selectOption('#range-start', 'day06');
  await page.waitForFunction(() => dayItems.length === 0 || dayItems[0].id.startsWith('day06') || dayItems[0].id.startsWith('day07'));
  check('Day06~07 without wrong items: wrong tab disabled', await page.isDisabled('#pool-wrong'));
  check('per-Day storage: delta:day03:wrong holds only Day03 IDs', await page.evaluate(() => JSON.parse(localStorage.getItem('delta:day03:wrong')).every(id => id.startsWith('day03:'))));

  // 8. 진행 저장은 한 칸(delta:progress). 새 연습을 시작하면 이전 진행이 지워진다는 확인창
  await page.click('#scope-single');
  await page.selectOption('#day-select', 'day03');
  await page.waitForFunction(() => dayItems.length === 80);
  await page.evaluate(() => { document.getElementById('chunk-slider').value = '4'; updateChunkDisplay('4'); });
  await page.click('text=연습 새로 시작하기');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delta:progress')));
  check('progress saved in the single slot', !!saved && saved.start === 'day03' && saved.label.startsWith('Day 03'), saved && saved.label);
  check('no per-Day progress keys written', await page.evaluate(() => Object.keys(localStorage).filter(k => /^delta:day\d+:progress$/.test(k)).length === 0));
  await page.reload({ waitUntil: 'load' }); // 종료 버튼은 진행을 지우므로, 이어하기는 새로고침으로 확인
  await page.waitForFunction(() => dayItems.length > 0);
  check('resume button shows saved range and position', (await page.textContent('#resume-btn')).includes('Step 1 / 400'), await page.textContent('#resume-btn'));
  await page.click('#resume-btn');
  check('resume goes to the saved Day03 session', (await page.textContent('#progress-text')).includes('/ 400'), await page.textContent('#progress-text'));
  await page.click('button[title="홈 (진행 저장 유지)"]');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => dayItems.length > 0);

  // 9. ?day= 링크는 단일 Day로 열린다. 틀린 문제가 없는 Day는 기본 4로 바로 시작 가능
  const p2 = await newPage(ctx, at({ day: '3' }));
  check('?day=3 opens single Day03', (await title(p2)) === 'Day 03 (총 80문장)', await title(p2));
  await p2.close();
  const p3 = await newPage(ctx, at({ day: '14' }));
  check('?day=14 opens dialogue Day14 (총 39세트)', (await title(p3)) === 'Day 14 (총 39세트)', await title(p3));
  await p3.close();

  // 10. 확인창: 진행이 있을 때 새로 시작하면 묻고, 취소하면 시작하지 않는다
  await page.close();
  const p4 = await newPage(ctx, at({ day: '3' }));
  await p4.evaluate(() => { document.getElementById('chunk-slider').value = '4'; updateChunkDisplay('4'); });
  await p4.click('text=연습 새로 시작하기'); // 진행 한 칸을 만든다 (진행이 없으니 확인창 없음)
  await p4.reload({ waitUntil: 'load' });
  await p4.waitForFunction(() => dayItems.length > 0);
  await p4.evaluate(() => { document.getElementById('chunk-slider').value = '4'; updateChunkDisplay('4'); });
  let asked = '';
  p4.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await p4.click('text=연습 새로 시작하기');
  await p4.waitForTimeout(300);
  check('new start asks before replacing saved progress', asked.includes('지워집니다'), asked);
  check('cancel keeps the setup screen', await p4.isVisible('#setup-screen'));
  await p4.close();

  // 11. 랜덤 힌트: 문장형/대화형 문구
  const p5 = await newPage(ctx, at({}));
  await p5.click('#tab-random');
  check('random hint: 문장 N개를 중복 없이 (N = 선택 Day 문항 수)', /^문장 \d+개를 중복 없이/.test(await p5.textContent('#setup-hint')), await p5.textContent('#setup-hint'));
  await p5.close();

  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });

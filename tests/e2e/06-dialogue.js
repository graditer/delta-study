// Phase 4 검증: 대화형(Day14·15) 4단계 흐름, 혼합형(Day16), 영작 세트 단위 오답, 대화형 자동 재생 타이밍
// usage: node 06-dialogue.js [app-url]
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
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    return page;
  };
  const txt = (page, sel) => page.textContent(sel);
  const visible = (page, sel) => page.isVisible(sel);
  const enShown = page => page.evaluate(() => !document.getElementById('en-box').classList.contains('invisible'));

  // 1. Day14 시작: 세트 단위 표기, 첫 세트 A 질문
  let ctx = await fresh();
  let page = await open(ctx, at({ day: '14' }));
  await page.click('text=연습 새로 시작하기');
  const total = await page.evaluate(() => studySequence.length);
  check('Day14 ladder: Set 1 / N label', (await txt(page, '#progress-text')).startsWith(`Set 1 / ${total}`), await txt(page, '#progress-text'));
  check('Day14 ladder items = 192 (39 items, chunk 4 + last 3)', total === 192, String(total));
  check('A question: badge "A 질문"', (await txt(page, '#speaker-badge')) === 'A 질문');
  check('A question: role tag A', (await txt(page, '#role-tag')) === 'A');
  check('A question: no context box', !(await visible(page, '#context-box')));
  check('A question: main button "A 정답 확인"', (await txt(page, '#main-btn')) === 'A 정답 확인');
  check('card is tall for dialogue Day', await page.evaluate(() => document.getElementById('study-card').classList.contains('card-tall')));
  const firstA = await page.evaluate(() => studySequence[0].data.a_kr);
  check('A question shows a_kr', (await txt(page, '#kr-box')) === firstA);

  // 2. 4단계 순서: A 정답 → B 문제(맥락) → B 정답 → 다음 세트
  await page.click('#main-btn');
  check('after A: English A revealed', await enShown(page));
  check('after A: button "B 문제 풀기 →"', (await txt(page, '#main-btn')) === 'B 문제 풀기 →');
  await page.click('#main-btn');
  check('B question: badge "B 답변"', (await txt(page, '#speaker-badge')) === 'B 답변');
  check('B question: role tag B', (await txt(page, '#role-tag')) === 'B');
  check('B question: context shows A line', (await visible(page, '#context-box')) && (await txt(page, '#context-kr')) === 'A: ' + firstA);
  check('B question: English hidden', !(await enShown(page)));
  check('B question: button "B 정답 확인"', (await txt(page, '#main-btn')) === 'B 정답 확인');
  const firstB = await page.evaluate(() => studySequence[0].data.b_kr);
  check('B question shows b_kr', (await txt(page, '#kr-box')) === firstB);
  await page.click('#main-btn');
  check('after B: button "다음 세트 →"', (await txt(page, '#main-btn')) === '다음 세트 →');
  const firstBen = await page.evaluate(() => studySequence[0].data.b_en);
  check('after B: English B revealed', (await txt(page, '#en-text')) === firstBen);
  check('context box stays on B reveal', await visible(page, '#context-box'));

  // 3. 다음 세트 → Set 2 A 질문
  await page.click('#main-btn');
  check('next set: label Set 2', (await txt(page, '#progress-text')).startsWith('Set 2 /'), await txt(page, '#progress-text'));
  check('next set: A question again', (await txt(page, '#speaker-badge')) === 'A 질문' && !(await visible(page, '#context-box')));

  // 4. 이전 버튼 규칙: 세트 안에서 한 단계씩, 첫 단계면 이전 세트의 B 정답 화면
  await page.click('#prev-btn');
  check('prev from Set2 A question → Set1 B reveal', (await txt(page, '#speaker-badge')) === 'B 답변' && (await txt(page, '#en-text')) === firstBen);
  await page.click('#prev-btn');
  check('prev inside set → B question', (await txt(page, '#main-btn')) === 'B 정답 확인');
  await page.click('#prev-btn');
  check('prev inside set → A reveal', (await txt(page, '#main-btn')) === 'B 문제 풀기 →');
  await page.click('#prev-btn');
  check('prev inside set → A question', (await txt(page, '#main-btn')) === 'A 정답 확인');
  check('prev at very first step disabled', await page.evaluate(() => document.getElementById('prev-btn').classList.contains('pointer-events-none')));
  await ctx.close();

  // 5. 키보드: Space로 4단계 진행
  ctx = await fresh();
  page = await open(ctx, at({ day: '14' }));
  await page.click('text=연습 새로 시작하기');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
  check('Space x4 completes one dialogue set → Set 2', (await txt(page, '#progress-text')).startsWith('Set 2 /'), await txt(page, '#progress-text'));
  await ctx.close();

  // 6. 이어하기: 세트 중간에서 저장 → 세트 처음(A 질문)부터
  ctx = await fresh();
  page = await open(ctx, at({ day: '14' }));
  await page.click('text=연습 새로 시작하기');
  await page.keyboard.press('Space'); await page.keyboard.press('Space'); await page.keyboard.press('Space'); // Set1 B 질문
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  check('resume button shows Set 1 / N', (await txt(page, '#resume-btn')).includes('Set 1 /'), await txt(page, '#resume-btn'));
  await page.click('#resume-btn');
  check('resume restarts the set at A question', (await txt(page, '#speaker-badge')) === 'A 질문' && (await txt(page, '#progress-text')).startsWith('Set 1 /'));
  await ctx.close();

  // 7. 영작 모드: A 맞음, B 틀림 → 세트 오답. 다른 세트 다녀와서 B를 맞히면 세트 제거
  ctx = await fresh();
  page = await open(ctx, at({ day: '14' }));
  await page.click('#grade-mode-btn');
  await page.click('text=연습 새로 시작하기');
  const aEn = await page.evaluate(() => studySequence[0].data.a_en);
  const bEn = await page.evaluate(() => studySequence[0].data.b_en);
  const setId = await page.evaluate(() => studySequence[0].data.id);
  await page.keyboard.type(aEn);
  await page.keyboard.press('Enter');
  check('A typed correct → 맞음', (await txt(page, '#judge-text')).includes('맞음'));
  await page.keyboard.press('Space'); // A 정답 → B 문제
  await page.keyboard.type('totally wrong answer');
  await page.keyboard.press('Enter');
  check('B typed wrong → 틀림', (await txt(page, '#judge-text')).includes('틀림'));
  let wrong = await page.evaluate(() => JSON.parse(localStorage.getItem(`delta:${selStart}:wrong`) || '[]'));
  check('set is marked wrong when any step is wrong', wrong.includes(setId), JSON.stringify(wrong));
  await page.keyboard.press('Space'); // B 정답 → 다음 세트
  await page.keyboard.press('Space'); // Set 2 로 이동
  await page.click('#prev-btn'); // Set 1 B 정답 화면
  await page.click('#prev-btn'); // Set 1 B 질문 (재판정 가능)
  await page.keyboard.type(bEn);
  await page.keyboard.press('Enter');
  check('B re-typed correct → 맞음', (await txt(page, '#judge-text')).includes('맞음'));
  wrong = await page.evaluate(() => JSON.parse(localStorage.getItem(`delta:${selStart}:wrong`) || '[]'));
  check('set removed from wrong list after all steps correct', !wrong.includes(setId), JSON.stringify(wrong));
  await ctx.close();

  // 8. 혼합형 Day16: 대화 세트와 문장 항목이 섞이고, 문장 항목은 2단계
  ctx = await fresh();
  page = await open(ctx, at({ day: '16' }));
  await page.click('text=연습 새로 시작하기');
  const mixedIdx = await page.evaluate(() => {
    const seq = studySequence;
    const i = seq.findIndex(s => s.data.type === 'sentence');
    const d = seq.findIndex(s => s.data.type === 'dialogue');
    return { sentence: i, dialogue: d };
  });
  check('Day16 contains both types in sequence', mixedIdx.sentence >= 0 && mixedIdx.dialogue === 0, JSON.stringify(mixedIdx));
  await page.evaluate(i => { currentIdx = i; subStep = 0; render(); }, mixedIdx.sentence);
  check('sentence item in mixed Day: badge "문장" (green)', (await txt(page, '#speaker-badge')) === '문장' && (await page.evaluate(() => document.getElementById('speaker-badge').className.includes('bg-emerald-600'))));
  check('sentence item: no role tag / context', !(await visible(page, '#role-tag')) && !(await visible(page, '#context-box')));
  check('sentence item: button "정답 확인"', (await txt(page, '#main-btn')) === '정답 확인');
  await page.click('#main-btn');
  check('sentence item: next press goes to "다음 단계"', (await txt(page, '#main-btn')) === '다음 단계');
  await page.click('#main-btn');
  check('sentence item: 2 steps then next item', (await page.evaluate(() => currentIdx)) === mixedIdx.sentence + 1);
  await ctx.close();

  // 9. 대화형 자동 재생 타이밍: 생각 4.0초 → 정답 공개 2.5초 (페이지 안에서 시각을 직접 기록해 측정)
  ctx = await fresh();
  page = await open(ctx, at({ day: '14' }));
  await page.evaluate(() => { isAutoMode = true; });
  await page.evaluate(() => {
    window.__t = {};
    const start = performance.now();
    const enBox = document.getElementById('en-box');
    const badge = document.getElementById('speaker-badge');
    const obs = new MutationObserver(() => {
      if (!window.__t.reveal && !enBox.classList.contains('invisible')) window.__t.reveal = performance.now() - start;
      if (!window.__t.bq && window.__t.reveal && badge.innerText === 'B 답변') window.__t.bq = performance.now() - start;
    });
    obs.observe(enBox, { attributes: true, attributeFilter: ['class'] });
    obs.observe(badge, { childList: true, characterData: true, subtree: true });
    window.__t.start = start;
  });
  await page.click('text=연습 새로 시작하기');
  await page.waitForFunction(() => window.__t && window.__t.bq !== undefined, null, { timeout: 15000 });
  const t = await page.evaluate(() => window.__t);
  const think = t.reveal, confirm = t.bq - t.reveal;
  check('auto dialogue: think before A reveal ≈ 4.0s', think > 3700 && think < 4500, `${Math.round(think)}ms`);
  check('auto dialogue: confirm before B question ≈ 2.5s', confirm > 2200 && confirm < 2900, `${Math.round(confirm)}ms`);
  await ctx.close();

  // 10. 대화형 랜덤 설명 문구 단위 (세트)
  ctx = await fresh();
  page = await open(ctx, at({ day: '14' }));
  await page.click('#tab-random');
  check('random desc for dialogue: 세트 39개를 중복 없이', (await txt(page, '#setup-hint')).startsWith('세트 39개를 중복 없이'), await txt(page, '#setup-hint'));
  await ctx.close();

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
